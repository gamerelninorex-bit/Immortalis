import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import {
  BUILD_SPEC_IDENTITY,
  GenesisSchema,
  JournalEntrySchema,
  ManifestSchema,
  PACKAGE_FORMAT,
  PACKAGE_FORMAT_VERSION,
  StateFileSchema,
  runtimeContractSha256,
  canonicalJson,
  fail,
  ok,
  type BuildInfo,
  type CommitReceipt,
  type Genesis,
  type CommitGroup,
  type Manifest,
  type OwnerFact,
  type Result,
  type SpecIdentity,
} from "@immortalis/contracts";
import {
  CampaignCore,
  emptyState,
  stateFromFile,
  stateSha256,
  stateToFile,
  type OwnerRegistry,
  type WriteAdmission,
} from "../commit/campaign-core.ts";
import { COMPATIBLE_RUNTIME_CONTRACT_SHA256S } from "../compat.ts";
import { ENGINE_PACKAGE, ENGINE_VERSION } from "../version.ts";
import { sha256Canonical } from "../hash.ts";
import { nodeFs, type FsOps } from "./fs-ops.ts";
import type {
  CampaignHead,
  CampaignStore,
  CommitOutcome,
  StoreCommitErrorCode,
  StoreDescriptor,
} from "./store.ts";

/**
 * Prototype structured-file campaign package (Roadmap "Pre-Code Playable Prototype": manifest +
 * state + append-oriented history). It is a local, free, deterministic IM-17 implementation. It is
 * NOT a provider adoption and satisfies no provider/recovery acceptance (IA-07, CAL-09).
 *
 *   manifest.json        identity, spec/engine provenance, and the commit point (`head`)
 *   state.<rev>.json     materialized canonical state at one revision
 *   journal.jsonl        append-only, hash-chained committed groups + receipts
 *   LOCK                 single-writer lock while a campaign is open (plus inert `LOCK.*` arbitration
 *                        files that exist only while a lock is being released or reclaimed; see
 *                        the single-writer lock section below)
 *
 * Publication order: state file -> journal append -> manifest rename. The manifest rename is the
 * single commit point; anything written after the manifest's `head` is residue that is reported on
 * open and never adopted into canon. Integrity here is corruption/tamper *evidence*, not
 * authentication: there is no signing key (no secrets in the repository).
 */
export const FILE_PACKAGE_DESCRIPTOR: StoreDescriptor = {
  kind: "prototype-structured-file-package",
  production: false,
  provider_acceptance: "NONE",
};

export type CreateErrorCode = "ALREADY_EXISTS" | "CREATE_FAILED" | "SCHEMA_INVALID";
export type OpenErrorCode =
  | "LOCKED"
  | "MISSING_MANIFEST"
  | "MALFORMED"
  | "SCHEMA_INVALID"
  | "UNSUPPORTED_FORMAT"
  | "UNSUPPORTED_FORMAT_VERSION"
  | "INTEGRITY_MANIFEST"
  | "RUNTIME_CONTRACT_INCOMPATIBLE"
  | "MISSING_STATE"
  | "INTEGRITY_STATE"
  | "MISSING_JOURNAL"
  | "JOURNAL_TRUNCATED"
  | "INTEGRITY_JOURNAL"
  | "REPLAY_MISMATCH";

export interface FileCampaignOptions {
  /** Lawful owner/facet pairs for this build. Empty by default: every write fails closed. */
  readonly owners?: OwnerRegistry;
  /** Optional IM-03 admission consulted for new commits (never on replay). See WriteAdmission. */
  readonly admission?: WriteAdmission;
  /** Informational build identifier (e.g. git SHA). Recorded, never used to gate loading. */
  readonly buildId?: string | null;
  /** Spec identity this build implements. Defaults to the generated F-027 identity. */
  readonly specIdentity?: SpecIdentity;
  /** Runtime Contract hashes this build may load. Defaults to COMPATIBLE_RUNTIME_CONTRACT_SHA256S. */
  readonly compatibleRuntimeContracts?: readonly string[];
  /** Reclaim a LOCK whose holder process is provably dead. Never reclaims a live holder. */
  readonly reclaimStaleLock?: boolean;
  readonly fs?: FsOps;
}

export interface CreateFileCampaignParams extends FileCampaignOptions {
  readonly campaignId: string;
}

/** Uncommitted leftovers found on open. They are reported, never adopted. */
export interface Residue {
  readonly journal_tail_bytes: number;
  readonly other_files: readonly string[];
}

export interface FileCampaignStore extends CampaignStore {
  readonly residue: Residue;
  /**
   * True when the spec line of the last save differs from this build's. Provenance only: the load
   * succeeded because the Runtime Contract is compatible; the next save records this build's line.
   */
  readonly provenanceDrift: boolean;
}

const MANIFEST = "manifest.json";
const JOURNAL = "journal.jsonl";
const stateFileName = (revision: number) => `state.${String(revision).padStart(10, "0")}.json`;

const pretty = (value: unknown): string =>
  `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;

function seal(m: Omit<Manifest, "self_sha256">): Manifest {
  return { ...m, self_sha256: sha256Canonical(m) };
}

const buildInfo = (buildId: string | null | undefined): BuildInfo => ({
  package: ENGINE_PACKAGE,
  version: ENGINE_VERSION,
  build_id: buildId ?? null,
});

const genesisHash = (g: Genesis): string => sha256Canonical(g);

export async function createFileCampaign(
  dir: string,
  params: CreateFileCampaignParams,
): Promise<Result<FileCampaignStore, CreateErrorCode>> {
  const fs = params.fs ?? nodeFs;
  const spec = params.specIdentity ?? BUILD_SPEC_IDENTITY;
  const contractHash = runtimeContractSha256(spec);
  if (contractHash === undefined) {
    return fail("SCHEMA_INVALID", "spec identity carries no Runtime Contract snapshot hash");
  }
  const genesisParsed = GenesisSchema.safeParse({
    format: PACKAGE_FORMAT,
    format_version: PACKAGE_FORMAT_VERSION,
    campaign_id: params.campaignId,
    spec_identity: spec,
    compatibility: { runtime_contract_sha256: contractHash },
    created_with: buildInfo(params.buildId),
  });
  if (!genesisParsed.success) {
    return fail("SCHEMA_INVALID", "invalid campaign identity", {
      issues: genesisParsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const genesis = genesisParsed.data;
  let lock: WriterLock;
  try {
    await fs.mkdirp(dir);
    if ((await fs.list(dir)).length > 0) {
      return fail(
        "ALREADY_EXISTS",
        "target directory is not empty; refusing to create a campaign over it",
      );
    }
    lock = await createInitialLock(fs, dir, genesis.campaign_id);
  } catch (e) {
    return fail("CREATE_FAILED", "could not prepare campaign directory", { cause: String(e) });
  }
  try {
    const state = emptyState(genesis.campaign_id);
    const gHash = genesisHash(genesis);
    const stateFile = stateFileName(0);
    await fs.writeFileDurable(join(dir, stateFile), pretty(stateToFile(state)));
    await fs.appendDurable(join(dir, JOURNAL), "");
    const manifest = seal({
      format: genesis.format,
      format_version: genesis.format_version,
      campaign_id: genesis.campaign_id,
      spec_identity: genesis.spec_identity,
      compatibility: genesis.compatibility,
      created_with: genesis.created_with,
      last_saved_with: genesis.created_with,
      last_saved_spec_identity: genesis.spec_identity,
      genesis_sha256: gHash,
      head: {
        revision: 0,
        state_file: stateFile,
        state_sha256: stateSha256(state),
        journal_entries: 0,
        journal_bytes: 0,
        journal_head_sha256: gHash,
      },
    });
    await fs.writeFileDurable(join(dir, MANIFEST), pretty(manifest));
    const core = new CampaignCore({
      campaignId: genesis.campaign_id,
      specLockSha256: spec.spec_lock_sha256,
      owners: params.owners ?? new Map(),
      ...(params.admission ? { admission: params.admission } : {}),
      state,
      headSha256: gHash,
    });
    return ok(
      new FilePackageStore(
        dir,
        fs,
        lock,
        core,
        manifest,
        params.buildId ?? null,
        0,
        { journal_tail_bytes: 0, other_files: [] },
        spec,
        false,
      ),
    );
  } catch (e) {
    await lock.release().catch(() => undefined);
    return fail(
      "CREATE_FAILED",
      "campaign creation failed part-way; directory is not a loadable campaign",
      {
        cause: String(e),
      },
    );
  }
}

/**
 * Single-writer lock for the prototype file package (IM-17), implementation-private. It changes no
 * persisted campaign data: `LOCK` is a technical file whose body never carries a world fact.
 *
 * Why not "read the holder, unlink, retry": two openers can both observe the same dead holder, and
 * the slower one then unlinks the *successor's* live lock (an ABA replacement) and creates its own,
 * so both calls succeed. Neither a second read nor a PID re-check closes that window.
 *
 * The rule here is one invariant:
 *
 *   A lock instance X (identified by a never-reused nonce, or by a content hash for a legacy body)
 *   is only ever REMOVED by a process that holds the exclusive claim `LOCK.claim.<X>`, and only
 *   after re-reading `LOCK` under that claim and finding it is still X.
 *
 * `O_EXCL` creation is atomic, so one claim holder per name exists at a time. Because instance names
 * never recur, a contender acting on a stale observation either loses the claim race, or wins a claim
 * on an instance that is already gone, re-reads, sees a different instance and does nothing. The
 * same rule arbitrates an abandoned claim (a claimant killed mid-way): it is replaced by claiming
 * `LOCK.claim.<that claim's nonce>`, recursively, so no recovery step relies on timing or on a
 * second look. Release is the same operation, so a handle that lost authority can never remove its
 * successor's lock, and a reclaimer and a releaser exclude each other.
 *
 * Assumptions, adversarially tested where they can be: the directory lives on a local POSIX-style
 * filesystem where `O_EXCL` create and `link(2)` are atomic; every process sharing the directory
 * shares one host and PID namespace (a holder recorded on another host, or with an unverifiable PID,
 * is never judged dead); a PID that answers `kill(pid, 0)` is alive. Anything else is a refusal.
 */
const LOCK_NAME = "LOCK";
const CLAIM_PREFIX = "LOCK.claim.";
const MAX_ATTEMPTS = 16;
const MAX_DEPTH = 6;

/** `LOCK`, `LOCK.claim.*` and `LOCK.*.tmp`: the lock family, never canonical data or reported residue. */
const isWriterLockArtifact = (name: string): boolean =>
  name === LOCK_NAME || name.startsWith("LOCK.");

type LockRefusal = {
  readonly code: "LOCKED";
  readonly message: string;
  readonly details?: Record<string, unknown>;
};

type Liveness = "alive" | "dead" | "unknown";

interface Holder {
  readonly id: string;
  readonly pid: number | null;
  readonly host: string | null;
}

const errCode = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;

const newBody = (extra: Record<string, unknown>): { nonce: string; text: string } => {
  const nonce = randomUUID();
  const text = `${JSON.stringify({ pid: process.pid, ...extra, nonce, host: hostname() })}\n`;
  return { nonce, text };
};

/** null when the file does not exist; throws on any other read error (ownership then unprovable). */
async function observe(fs: FsOps, path: string): Promise<Holder | null> {
  let raw: Buffer;
  try {
    raw = await fs.readFile(path);
  } catch (e) {
    if (errCode(e) === "ENOENT") return null;
    throw e;
  }
  let parsed: { pid?: unknown; nonce?: unknown; host?: unknown } = {};
  try {
    const value = JSON.parse(raw.toString("utf8")) as unknown;
    if (typeof value === "object" && value !== null) parsed = value;
  } catch {
    // unparseable: identified by content, holder unknown, never reclaimed
  }
  const pid =
    typeof parsed.pid === "number" && Number.isSafeInteger(parsed.pid) && parsed.pid > 0
      ? parsed.pid
      : null;
  const id =
    typeof parsed.nonce === "string" && /^[0-9a-f-]{36}$/.test(parsed.nonce)
      ? parsed.nonce
      : `legacy-${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
  return { id, pid, host: typeof parsed.host === "string" ? parsed.host : null };
}

function liveness(h: Holder): Liveness {
  if (h.pid === null) return "unknown";
  if (h.host !== null && h.host !== hostname()) return "unknown";
  if (h.pid === process.pid) return "alive";
  try {
    process.kill(h.pid, 0);
    return "alive";
  } catch (e) {
    const code = errCode(e);
    if (code === "ESRCH") return "dead";
    return code === "EPERM" ? "alive" : "unknown";
  }
}

async function tryCreate(fs: FsOps, path: string, text: string): Promise<boolean> {
  try {
    await fs.createExclusive(path, text);
    return true;
  } catch (e) {
    if (errCode(e) === "EEXIST") return false;
    throw e;
  }
}

type Acquired = { readonly kind: "acquired" };
type Refused = {
  readonly kind: "refused";
  readonly holder: Holder | null;
  readonly state: Liveness;
  /** true when another live process is arbitrating, rather than the holder itself being the obstacle */
  readonly arbitrating: boolean;
};

/**
 * Takes exclusive ownership of `path` with `text`. An existing instance whose holder is provably dead
 * is replaced only when `mayReclaim` allows it, and only under the claim named after that instance.
 */
async function acquireInstance(
  fs: FsOps,
  dir: string,
  path: string,
  text: string,
  mayReclaim: boolean,
  depth: number,
): Promise<Acquired | Refused> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (await tryCreate(fs, path, text)) return { kind: "acquired" };
    const holder = await observe(fs, path);
    if (holder === null) continue;
    const state = liveness(holder);
    if (!mayReclaim || state !== "dead") {
      return { kind: "refused", holder, state, arbitrating: false };
    }
    if (depth >= MAX_DEPTH) return { kind: "refused", holder, state, arbitrating: true };

    const claimPath = join(dir, `${CLAIM_PREFIX}${holder.id}`);
    const claim = newBody({ claims: holder.id });
    const got = await acquireInstance(fs, dir, claimPath, claim.text, true, depth + 1);
    if (got.kind !== "acquired") return { kind: "refused", holder, state, arbitrating: true };
    try {
      const current = await observe(fs, path);
      if (current === null || current.id !== holder.id) continue; // moved on: judge the new state afresh
      await fs.remove(path); // only this claim holder may remove this instance
      if (await tryCreate(fs, path, text)) return { kind: "acquired" };
    } finally {
      await fs.remove(claimPath).catch(() => undefined); // an orphan here is inert: its instance is gone
    }
  }
  return { kind: "refused", holder: null, state: "unknown", arbitrating: true };
}

/** The writer authority of one open store. Identity is the nonce of the LOCK this handle created. */
class WriterLock {
  readonly #fs: FsOps;
  readonly #dir: string;
  readonly #id: string;

  constructor(fs: FsOps, dir: string, id: string) {
    this.#fs = fs;
    this.#dir = dir;
    this.#id = id;
  }

  /** "owned" only when LOCK still carries this handle's instance; anything unprovable is not owned. */
  async check(): Promise<"owned" | "lost" | "unverified"> {
    try {
      const current = await observe(this.#fs, join(this.#dir, LOCK_NAME));
      return current !== null && current.id === this.#id ? "owned" : "lost";
    } catch {
      return "unverified";
    }
  }

  /**
   * Removes LOCK only if it is still this handle's instance, under the same claim a reclaimer would
   * need. A successor's lock, or a lock under active arbitration, is left untouched. Idempotent.
   */
  async release(): Promise<void> {
    const claimPath = join(this.#dir, `${CLAIM_PREFIX}${this.#id}`);
    const claim = newBody({ claims: this.#id });
    const got = await acquireInstance(this.#fs, this.#dir, claimPath, claim.text, true, 0);
    if (got.kind !== "acquired") return;
    try {
      const current = await observe(this.#fs, join(this.#dir, LOCK_NAME));
      if (current !== null && current.id === this.#id) {
        await this.#fs.remove(join(this.#dir, LOCK_NAME));
      }
    } finally {
      await this.#fs.remove(claimPath).catch(() => undefined);
    }
  }
}

/** The lock a new campaign is created under: the directory is empty, so a plain exclusive create. */
async function createInitialLock(fs: FsOps, dir: string, campaignId: string): Promise<WriterLock> {
  const { nonce, text } = newBody({ campaign_id: campaignId });
  await fs.createExclusive(join(dir, LOCK_NAME), text);
  return new WriterLock(fs, dir, nonce);
}

async function acquireWriterLock(
  fs: FsOps,
  dir: string,
  reclaimStale: boolean,
): Promise<{ ok: true; lock: WriterLock } | { ok: false; failure: LockRefusal }> {
  const { nonce, text } = newBody({ campaign_id: "(pending)" });
  let outcome: Acquired | Refused;
  try {
    outcome = await acquireInstance(fs, dir, join(dir, LOCK_NAME), text, reclaimStale, 0);
  } catch (e) {
    return {
      ok: false,
      failure: {
        code: "LOCKED",
        message: "could not take the campaign lock",
        details: { cause: String(e) },
      },
    };
  }
  if (outcome.kind === "acquired") return { ok: true, lock: new WriterLock(fs, dir, nonce) };
  const alive = outcome.state === "unknown" ? null : outcome.state === "alive";
  const message = outcome.arbitrating
    ? "campaign lock is under arbitration by another process; refusing rather than guessing"
    : outcome.state === "dead"
      ? "campaign is locked by a process that is no longer running; pass reclaimStaleLock to take it over"
      : "campaign is open elsewhere (or the lock holder is unknown)";
  return {
    ok: false,
    failure: {
      code: "LOCKED",
      message,
      details: { holder_pid: outcome.holder?.pid ?? null, holder_alive: alive },
    },
  };
}

export async function openFileCampaign(
  dir: string,
  options: FileCampaignOptions = {},
): Promise<Result<FileCampaignStore, OpenErrorCode>> {
  const fs = options.fs ?? nodeFs;
  if ((await fs.fileSize(join(dir, MANIFEST))) === null) {
    return fail("MISSING_MANIFEST", "no manifest.json: not a (complete) campaign package", { dir });
  }
  const acquired = await acquireWriterLock(fs, dir, options.reclaimStaleLock ?? false);
  if (!acquired.ok) return { ok: false, error: acquired.failure };

  const loaded = await load(dir, fs, acquired.lock, options);
  if (!loaded.ok) {
    // releases only if the lock is still this attempt's own; a successor's is never touched
    await acquired.lock.release().catch(() => undefined);
    return loaded;
  }
  return loaded;
}

async function load(
  dir: string,
  fs: FsOps,
  lock: WriterLock,
  options: FileCampaignOptions,
): Promise<Result<FileCampaignStore, OpenErrorCode>> {
  const expectedSpec = options.specIdentity ?? BUILD_SPEC_IDENTITY;
  const readJson = async (
    name: string,
    missing: OpenErrorCode,
  ): Promise<Result<unknown, OpenErrorCode>> => {
    if ((await fs.fileSize(join(dir, name))) === null) return fail(missing, `missing ${name}`);
    try {
      return ok(JSON.parse((await fs.readFile(join(dir, name))).toString("utf8")) as unknown);
    } catch (e) {
      return fail("MALFORMED", `${name} is not valid JSON`, { cause: String(e) });
    }
  };

  // --- manifest -------------------------------------------------------------------------------
  const rawManifest = await readJson(MANIFEST, "MISSING_MANIFEST");
  if (!rawManifest.ok) return rawManifest;
  const rm = rawManifest.value as { format?: unknown; format_version?: unknown } | null;
  if (typeof rm !== "object" || rm === null || rm.format !== PACKAGE_FORMAT) {
    return fail("UNSUPPORTED_FORMAT", "manifest is not an IMMORTALIS campaign package");
  }
  if (rm.format_version !== PACKAGE_FORMAT_VERSION) {
    return fail(
      "UNSUPPORTED_FORMAT_VERSION",
      "unsupported package format version; no migration is authorized",
      {
        found: rm.format_version,
        supported: PACKAGE_FORMAT_VERSION,
      },
    );
  }
  const parsedManifest = ManifestSchema.safeParse(rawManifest.value);
  if (!parsedManifest.success) {
    return fail("SCHEMA_INVALID", "manifest failed schema validation", {
      issues: parsedManifest.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const manifest = parsedManifest.data;
  const { self_sha256: recordedSelf, ...unsealed } = manifest;
  if (sha256Canonical(unsealed) !== recordedSelf) {
    return fail("INTEGRITY_MANIFEST", "manifest content does not match its self hash");
  }
  const genesis: Genesis = {
    format: manifest.format,
    format_version: manifest.format_version,
    campaign_id: manifest.campaign_id,
    spec_identity: manifest.spec_identity,
    compatibility: manifest.compatibility,
    created_with: manifest.created_with,
  };
  const gHash = genesisHash(genesis);
  if (gHash !== manifest.genesis_sha256) {
    return fail("INTEGRITY_MANIFEST", "campaign identity does not match its recorded genesis hash");
  }

  // --- compatibility (IA-01): only the Runtime Contract gates loading. Everything else about the spec
  // line (lock file, register, gates, pins) is provenance and may differ without breaking the save. ---
  const compatible = options.compatibleRuntimeContracts ?? COMPATIBLE_RUNTIME_CONTRACT_SHA256S;
  if (!compatible.includes(manifest.compatibility.runtime_contract_sha256)) {
    return fail(
      "RUNTIME_CONTRACT_INCOMPATIBLE",
      "save was written under a Runtime Contract this build is not declared compatible with; migration is not authorized",
      {
        save_runtime_contract_sha256: manifest.compatibility.runtime_contract_sha256,
        build_compatible_runtime_contract_sha256s: [...compatible],
      },
    );
  }

  // --- journal: chain + full replay -----------------------------------------------------------
  const head = manifest.head;
  if ((await fs.fileSize(join(dir, JOURNAL))) === null)
    return fail("MISSING_JOURNAL", "missing journal.jsonl");
  const journalBuf = await fs.readFile(join(dir, JOURNAL));
  if (journalBuf.length < head.journal_bytes) {
    return fail("JOURNAL_TRUNCATED", "journal is shorter than the committed length", {
      committed_bytes: head.journal_bytes,
      actual_bytes: journalBuf.length,
    });
  }
  const committedText = journalBuf.subarray(0, head.journal_bytes).toString("utf8");
  if (Buffer.byteLength(committedText, "utf8") !== head.journal_bytes) {
    return fail("INTEGRITY_JOURNAL", "committed journal bytes are not valid UTF-8");
  }
  const lines = committedText === "" ? [] : committedText.split("\n");
  if (lines.length > 0) {
    if (lines[lines.length - 1] !== "")
      return fail("INTEGRITY_JOURNAL", "committed journal does not end at an entry boundary");
    lines.pop();
  }
  if (lines.length !== head.journal_entries) {
    return fail("INTEGRITY_JOURNAL", "journal entry count differs from the manifest", {
      expected: head.journal_entries,
      actual: lines.length,
    });
  }
  const core = new CampaignCore({
    campaignId: manifest.campaign_id,
    specLockSha256: expectedSpec.spec_lock_sha256,
    owners: options.owners ?? new Map(),
    ...(options.admission ? { admission: options.admission } : {}),
    state: emptyState(manifest.campaign_id),
    headSha256: gHash,
  });
  for (const [i, line] of lines.entries()) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (e) {
      return fail("MALFORMED", `journal line ${i + 1} is not valid JSON`, { cause: String(e) });
    }
    const entry = JournalEntrySchema.safeParse(raw);
    if (!entry.success) {
      return fail("SCHEMA_INVALID", `journal line ${i + 1} failed schema validation`, {
        issues: entry.error.issues.slice(0, 5).map((x) => `${x.path.join(".")}: ${x.message}`),
      });
    }
    if (entry.data.group.campaign_id !== manifest.campaign_id) {
      return fail("INTEGRITY_JOURNAL", `journal line ${i + 1} belongs to a different campaign`);
    }
    const replayed = core.replay(entry.data);
    if (!replayed.ok) return replayed;
  }
  if (core.headSha256 !== head.journal_head_sha256) {
    return fail("INTEGRITY_JOURNAL", "journal chain head differs from the manifest");
  }
  if (core.state.revision !== head.revision || stateSha256(core.state) !== head.state_sha256) {
    return fail("INTEGRITY_STATE", "state derived from the journal differs from the manifest head");
  }

  // --- materialized state file must agree with the replayed state --------------------------------
  const rawState = await readJson(head.state_file, "MISSING_STATE");
  if (!rawState.ok) return rawState;
  const parsedState = StateFileSchema.safeParse(rawState.value);
  if (!parsedState.success) {
    return fail("SCHEMA_INVALID", `${head.state_file} failed schema validation`, {
      issues: parsedState.error.issues.slice(0, 5).map((x) => `${x.path.join(".")}: ${x.message}`),
    });
  }
  const fromFile = stateFromFile(parsedState.data);
  if (!fromFile.ok) return fail("INTEGRITY_STATE", fromFile.error.message);
  if (
    fromFile.value.campaign_id !== manifest.campaign_id ||
    fromFile.value.revision !== head.revision ||
    stateSha256(fromFile.value) !== head.state_sha256
  ) {
    return fail("INTEGRITY_STATE", `${head.state_file} does not match the committed state hash`);
  }

  // --- residue (reported, never adopted) -------------------------------------------------------
  const known = new Set([MANIFEST, JOURNAL, head.state_file]);
  const other = (await fs.list(dir))
    .filter((f) => !known.has(f) && !isWriterLockArtifact(f))
    .sort();
  const residue: Residue = {
    journal_tail_bytes: journalBuf.length - head.journal_bytes,
    other_files: other,
  };

  const build = options.buildId ?? null;
  return ok(
    new FilePackageStore(
      dir,
      fs,
      lock,
      core,
      manifest,
      build,
      journalBuf.length,
      residue,
      expectedSpec,
      sha256Canonical(manifest.last_saved_spec_identity) !== sha256Canonical(expectedSpec),
    ),
  );
}

class FilePackageStore implements FileCampaignStore {
  readonly descriptor = FILE_PACKAGE_DESCRIPTOR;
  readonly residue: Residue;
  readonly provenanceDrift: boolean;
  readonly #spec: SpecIdentity;
  readonly #dir: string;
  readonly #fs: FsOps;
  readonly #lock: WriterLock;
  readonly #core: CampaignCore;
  #manifest: Manifest;
  #buildId: string | null;
  #journalFileBytes: number;
  #queue: Promise<unknown> = Promise.resolve();
  #closed = false;
  #poisoned = false;
  #writerLost = false;

  constructor(
    dir: string,
    fs: FsOps,
    lock: WriterLock,
    core: CampaignCore,
    manifest: Manifest,
    buildId: string | null,
    journalFileBytes: number,
    residue: Residue,
    spec: SpecIdentity,
    provenanceDrift: boolean,
  ) {
    this.#dir = dir;
    this.#fs = fs;
    this.#lock = lock;
    this.#core = core;
    this.#manifest = manifest;
    this.#buildId = buildId;
    this.#journalFileBytes = journalFileBytes;
    this.residue = residue;
    this.#spec = spec;
    this.provenanceDrift = provenanceDrift;
  }

  head(): CampaignHead {
    const m = this.#manifest;
    return {
      campaign_id: m.campaign_id,
      revision: m.head.revision,
      state_sha256: m.head.state_sha256,
      journal_entries: m.head.journal_entries,
      journal_head_sha256: m.head.journal_head_sha256,
      spec_identity: m.spec_identity,
      last_saved_spec_identity: m.last_saved_spec_identity,
      created_with: m.created_with,
      last_saved_with: m.last_saved_with,
    };
  }

  getFact(key: string): OwnerFact | undefined {
    return this.#core.state.facts.get(key);
  }

  listFacts(): readonly OwnerFact[] {
    return stateToFile(this.#core.state).facts;
  }

  lookupReceipt(intentId: string): CommitReceipt | null {
    return this.#core.lookupReceipt(intentId);
  }

  committedGroup(intentId: string): CommitGroup | null {
    return this.#core.lookupGroup(intentId);
  }

  committedGroupById(groupId: string): CommitGroup | null {
    return this.#core.lookupGroupById(groupId);
  }

  commit(group: unknown): Promise<Result<CommitOutcome, StoreCommitErrorCode>> {
    const run = this.#queue.then(() => this.#commit(group));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #commit(group: unknown): Promise<Result<CommitOutcome, StoreCommitErrorCode>> {
    if (this.#closed) return fail("STORE_CLOSED", "campaign is closed");
    if (this.#poisoned) {
      return fail(
        "STORE_POISONED",
        "an earlier commit had an unknown outcome; reopen and reconcile by intent_id",
      );
    }
    // Never write from a handle whose single-writer authority is lost or cannot be proven.
    if (this.#writerLost) {
      return fail("STORE_CLOSED", "this handle no longer holds the campaign's writer lock", {
        reason: "WRITER_LOCK_LOST",
      });
    }
    const owned = await this.#lock.check();
    if (owned !== "owned") {
      if (owned === "lost") this.#writerLost = true;
      return fail("STORE_CLOSED", "this handle no longer holds the campaign's writer lock", {
        reason: owned === "lost" ? "WRITER_LOCK_LOST" : "WRITER_LOCK_UNVERIFIED",
      });
    }
    const prepared = this.#core.prepare(group);
    if (!prepared.ok) return prepared;
    if (prepared.value.kind === "replay") {
      return ok({ receipt: prepared.value.receipt, replayed: true });
    }
    const { entry, nextState } = prepared.value;
    const dir = this.#dir;
    const line = `${canonicalJson(entry)}\n`;
    const previousStateFile = this.#manifest.head.state_file;
    const stateFile = stateFileName(nextState.revision);
    try {
      await this.#fs.writeFileDurable(join(dir, stateFile), pretty(stateToFile(nextState)));
      if (this.#journalFileBytes > this.#manifest.head.journal_bytes) {
        await this.#fs.truncate(join(dir, JOURNAL), this.#manifest.head.journal_bytes);
      }
      await this.#fs.appendDurable(join(dir, JOURNAL), line);
      const journalBytes = this.#manifest.head.journal_bytes + Buffer.byteLength(line, "utf8");
      const next = seal({
        format: this.#manifest.format,
        format_version: this.#manifest.format_version,
        campaign_id: this.#manifest.campaign_id,
        spec_identity: this.#manifest.spec_identity,
        compatibility: this.#manifest.compatibility,
        created_with: this.#manifest.created_with,
        last_saved_with: buildInfo(this.#buildId),
        last_saved_spec_identity: this.#spec,
        genesis_sha256: this.#manifest.genesis_sha256,
        head: {
          revision: nextState.revision,
          state_file: stateFile,
          state_sha256: entry.receipt.state_sha256,
          journal_entries: this.#manifest.head.journal_entries + 1,
          journal_bytes: journalBytes,
          journal_head_sha256: entry.entry_sha256,
        },
      });
      await this.#fs.writeFileDurable(join(dir, MANIFEST), pretty(next));
      this.#manifest = next;
      this.#journalFileBytes = journalBytes;
    } catch (e) {
      this.#poisoned = true;
      return fail(
        "UNKNOWN_OUTCOME",
        "durable outcome unknown; reopen the campaign and reconcile by intent_id before retrying",
        { intent_id: entry.group.intent_id, cause: String(e) },
      );
    }
    this.#core.accept(prepared.value);
    // Cleanup of the superseded checkpoint is best effort; the commit is already durable.
    await this.#fs.remove(join(dir, previousStateFile)).catch(() => undefined);
    return ok({ receipt: entry.receipt, replayed: false });
  }

  async close(): Promise<void> {
    await this.#queue.catch(() => undefined);
    if (this.#closed) return;
    this.#closed = true;
    await this.#lock.release();
  }
}
