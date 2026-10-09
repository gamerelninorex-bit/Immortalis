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
  type Failure,
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
 *   LOCK                 single-writer lock while a campaign is open
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
const LOCK = "LOCK";
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
  try {
    await fs.mkdirp(dir);
    if ((await fs.list(dir)).length > 0) {
      return fail(
        "ALREADY_EXISTS",
        "target directory is not empty; refusing to create a campaign over it",
      );
    }
    await fs.createExclusive(join(dir, LOCK), lockBody(genesis.campaign_id));
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
    await fs.remove(join(dir, LOCK)).catch(() => undefined);
    return fail(
      "CREATE_FAILED",
      "campaign creation failed part-way; directory is not a loadable campaign",
      {
        cause: String(e),
      },
    );
  }
}

const lockBody = (campaignId: string) =>
  `${JSON.stringify({ pid: process.pid, campaign_id: campaignId })}\n`;

async function readLockHolder(fs: FsOps, path: string): Promise<number | null> {
  try {
    const parsed = JSON.parse((await fs.readFile(path)).toString("utf8")) as { pid?: unknown };
    return typeof parsed.pid === "number" ? parsed.pid : null;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function acquireLock(
  fs: FsOps,
  dir: string,
  reclaimStale: boolean,
): Promise<Failure<OpenErrorCode> | null> {
  const path = join(dir, LOCK);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.createExclusive(path, lockBody("(pending)"));
      return null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
        return {
          code: "LOCKED",
          message: "could not take the campaign lock",
          details: { cause: String(e) },
        };
      }
    }
    const holder = await readLockHolder(fs, path);
    const alive = holder === null ? null : pidAlive(holder);
    if (reclaimStale && alive === false && attempt === 0) {
      await fs.remove(path);
      continue;
    }
    return {
      code: "LOCKED",
      message:
        alive === false
          ? "campaign is locked by a process that is no longer running; pass reclaimStaleLock to take it over"
          : "campaign is open elsewhere (or the lock holder is unknown)",
      details: { holder_pid: holder, holder_alive: alive },
    };
  }
  return { code: "LOCKED", message: "could not take the campaign lock" };
}

export async function openFileCampaign(
  dir: string,
  options: FileCampaignOptions = {},
): Promise<Result<FileCampaignStore, OpenErrorCode>> {
  const fs = options.fs ?? nodeFs;
  if ((await fs.fileSize(join(dir, MANIFEST))) === null) {
    return fail("MISSING_MANIFEST", "no manifest.json: not a (complete) campaign package", { dir });
  }
  const lockFailure = await acquireLock(fs, dir, options.reclaimStaleLock ?? false);
  if (lockFailure) return { ok: false, error: lockFailure };

  const loaded = await load(dir, fs, options);
  if (!loaded.ok) {
    await fs.remove(join(dir, LOCK)).catch(() => undefined);
    return loaded;
  }
  return loaded;
}

async function load(
  dir: string,
  fs: FsOps,
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
  const known = new Set([MANIFEST, JOURNAL, LOCK, head.state_file]);
  const other = (await fs.list(dir)).filter((f) => !known.has(f)).sort();
  const residue: Residue = {
    journal_tail_bytes: journalBuf.length - head.journal_bytes,
    other_files: other,
  };

  const build = options.buildId ?? null;
  return ok(
    new FilePackageStore(
      dir,
      fs,
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
  readonly #core: CampaignCore;
  #manifest: Manifest;
  #buildId: string | null;
  #journalFileBytes: number;
  #queue: Promise<unknown> = Promise.resolve();
  #closed = false;
  #poisoned = false;

  constructor(
    dir: string,
    fs: FsOps,
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
    await this.#fs.remove(join(this.#dir, LOCK));
  }
}
