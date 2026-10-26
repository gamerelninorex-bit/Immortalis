/** H-07 S1 internal format v2. The manifest rename remains the sole commit point.
 * Checkpoints/indexes are derived verified evidence, never independent canonical owners.
 * Dormant prefix corruption is detected on lookup or explicit strict audit, not every ordinary open.
 */
import { join } from "node:path";
import { z } from "zod";
import {
  BUILD_SPEC_IDENTITY,
  GenesisSchema,
  JournalEntrySchema,
  ManifestSchema,
  StateFileSchema,
  Sha256,
  canonicalJson,
  fail,
  ok,
  type CommitGroup,
  type CommitReceipt,
  type Manifest,
  type JournalEntry,
  type Result,
} from "@immortalis/contracts";
import {
  CampaignCore,
  emptyState,
  stateFromFile,
  stateSha256,
  stateToFile,
  entryHash,
} from "../commit/campaign-core.ts";
import { sha256Canonical } from "../hash.ts";
import { COMPATIBLE_RUNTIME_CONTRACT_SHA256S } from "../compat.ts";
import { ENGINE_PACKAGE, ENGINE_VERSION } from "../version.ts";
import {
  FILE_PACKAGE_DESCRIPTOR,
  type FileCampaignOptions,
  type FileCampaignStore,
  type OpenErrorCode,
} from "./file-package.ts";
import type { FsOps } from "./fs-ops.ts";
import type { CampaignHead, CommitOutcome, StoreCommitErrorCode } from "./store.ts";
import {
  HistoryIndex,
  RefSchema,
  LocationSchema,
  type IndexRef,
  type Location,
} from "./history-index.ts";

export const CHECKPOINT_INTERVAL = 128;
const integer = z.number().int().nonnegative();
const CheckpointSchema = z.strictObject({
  revision: integer,
  state_sha256: Sha256,
  journal_entries: integer,
  journal_bytes: integer,
  journal_head_sha256: Sha256,
  index: RefSchema.nullable(),
  last_entry: LocationSchema.nullable(),
  verification_policy: z.string().nullable(),
});
const HeadSchema = ManifestSchema.shape.head.extend({ checkpoint: CheckpointSchema });
export const CheckpointManifestSchema = ManifestSchema.omit({
  format_version: true,
  head: true,
}).extend({
  format_version: z.literal(2),
  genesis_format_version: z.literal(1),
  head: HeadSchema,
});
type V2Manifest = z.infer<typeof CheckpointManifestSchema>;
interface Lock {
  check(): Promise<"owned" | "lost" | "unverified">;
  release(): Promise<void>;
}
const stateName = (revision: number) => `state.${String(revision).padStart(10, "0")}.json`;
const seal = <T extends object>(m: T) => ({ ...m, self_sha256: sha256Canonical(m) });
const policy = (o: FileCampaignOptions) =>
  o.admission ? (o.admission.historyVerificationId ?? null) : "structural-v1";
const coreOf = (
  m: Manifest | V2Manifest,
  o: FileCampaignOptions,
  state = emptyState(m.campaign_id),
  hash = m.genesis_sha256,
  history?: ConstructorParameters<typeof CampaignCore>[0]["history"],
) =>
  new CampaignCore({
    campaignId: m.campaign_id,
    specLockSha256: (o.specIdentity ?? BUILD_SPEC_IDENTITY).spec_lock_sha256,
    owners: o.owners ?? new Map(),
    ...(o.admission ? { admission: o.admission } : {}),
    state,
    headSha256: hash,
    ...(history ? { history } : {}),
  });
const locationOf = (
  entry: JournalEntry,
  offset: number,
  length: number,
  checked: boolean,
): Location => ({
  offset,
  length,
  sha256: entry.entry_sha256,
  checked,
  revision: entry.revision,
});
const additionsOf = (
  entries: readonly { entry: JournalEntry; location: Location }[],
): [string, Location][] =>
  entries.flatMap(({ entry, location }) => [
    [`i:${entry.group.intent_id}`, location] as [string, Location],
    [`g:${entry.group.group_id}`, location] as [string, Location],
  ]);
function parseLines(bytes: Buffer, expected: number): { entry: JournalEntry; length: number }[] {
  const text = bytes.toString("utf8");
  if (Buffer.byteLength(text) !== bytes.length || (text.length && !text.endsWith("\n")))
    throw new Error("invalid journal boundary/UTF-8");
  const lines = text ? text.slice(0, -1).split("\n") : [];
  if (lines.length !== expected) throw new Error("journal count mismatch");
  return lines.map((line) => ({
    entry: JournalEntrySchema.parse(JSON.parse(line)),
    length: Buffer.byteLength(line) + 1,
  }));
}

/** R-01: exceptional recovery only. A filename alone never earns clearance for a player read.
 * Re-derive each extra snapshot from the original journal and compare the full canonical digest.
 * An aborted next checkpoint may be proved by one uncommitted entry, but is NEVER adopted: the
 * live core/manifest and journal tail remain untouched until the caller retries its original intent.
 */
async function reconcileCheckpointStates(
  dir: string,
  fs: FsOps,
  lock: Lock,
  options: FileCampaignOptions,
  m: V2Manifest,
  store: FileCampaignStore,
  size: number,
  residue: string[],
): Promise<Result<string[], OpenErrorCode>> {
  const candidates = residue.filter((name) => /^state\.[0-9]{10}\.json$/.test(name));
  if (!candidates.length) return ok(residue);
  const authoritative = async () =>
    canonicalJson(JSON.parse((await fs.readFile(join(dir, "manifest.json"))).toString("utf8"))) ===
    canonicalJson(m);
  if (!(await authoritative()))
    return fail("INTEGRITY_MANIFEST", "checkpoint recovery manifest is no longer authoritative");
  if ((await lock.check()) !== "owned")
    return fail("LOCKED", "checkpoint recovery lost writer authority");
  const snapshots = new Map<number, { name: string; bytes: Buffer; digest: string }>();
  for (const name of candidates) {
    try {
      const bytes = await fs.readFile(join(dir, name));
      const file = StateFileSchema.parse(JSON.parse(bytes.toString("utf8")));
      const parsed = stateFromFile(file);
      if (
        !parsed.ok ||
        file.campaign_id !== m.campaign_id ||
        name !== stateName(file.revision) ||
        (file.revision > m.head.revision &&
          (file.revision !== m.head.revision + 1 ||
            file.revision - m.head.checkpoint.revision !== CHECKPOINT_INTERVAL))
      )
        return ok(residue);
      snapshots.set(file.revision, { name, bytes, digest: stateSha256(parsed.value) });
    } catch {
      // Unknown/corrupt extras keep their refusal-producing residue status, byte-for-byte.
      return ok(residue);
    }
  }
  const proof = coreOf(m, options);
  if (snapshots.has(0) && snapshots.get(0)!.digest !== stateSha256(proof.state)) return ok(residue);
  const journal = await fs.readRange(join(dir, "journal.jsonl"), 0, m.head.journal_bytes);
  for (const { entry } of parseLines(journal, m.head.journal_entries)) {
    const replayed = proof.replay(entry);
    if (!replayed.ok) return replayed;
    if (
      snapshots.has(entry.revision) &&
      snapshots.get(entry.revision)!.digest !== stateSha256(proof.state)
    )
      return ok(residue);
  }
  if (
    proof.headSha256 !== m.head.journal_head_sha256 ||
    proof.state.revision !== m.head.revision ||
    stateSha256(proof.state) !== m.head.state_sha256
  )
    return fail("INTEGRITY_STATE", "checkpoint recovery disagrees with authoritative head");
  const owners = options.beforeMigrationCheck?.(store);
  if (owners && !owners.ok) return owners;
  if (snapshots.has(m.head.revision + 1)) {
    try {
      const bytes = await fs.readRange(
        join(dir, "journal.jsonl"),
        m.head.journal_bytes,
        size - m.head.journal_bytes,
      );
      const entry = parseLines(bytes, 1)[0]!.entry;
      // Only this isolated proof sees the uncommitted transition. No accept/publication occurs.
      const replayed = proof.replay(entry);
      if (!replayed.ok || stateSha256(proof.state) !== snapshots.get(entry.revision)?.digest)
        return ok(residue);
    } catch {
      return ok(residue);
    }
  }
  for (const { name, bytes } of snapshots.values()) {
    if ((await lock.check()) !== "owned")
      return fail("LOCKED", "checkpoint recovery lost writer authority");
    if (!(await authoritative()) || !(await fs.readFile(join(dir, name))).equals(bytes))
      return fail("INTEGRITY_STATE", "checkpoint recovery evidence changed before cleanup");
    await fs.remove(join(dir, name));
  }
  return ok(residue.filter((name) => !candidates.includes(name)));
}

/** Called only after the original strict v1 loader verified the complete legacy save. */
export async function migrateLegacy(
  dir: string,
  fs: FsOps,
  lock: Lock,
  legacy: FileCampaignStore,
  options: FileCampaignOptions,
): Promise<Result<FileCampaignStore, OpenErrorCode>> {
  try {
    const ownersVerified = options.beforeMigrationCheck?.(legacy);
    if (ownersVerified && !ownersVerified.ok) return ownersVerified;
    const manifestBytes = await fs.readFile(join(dir, "manifest.json"));
    const m = ManifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
    const journal = await fs.readFile(join(dir, "journal.jsonl"));
    const stateBytes = await fs.readFile(join(dir, m.head.state_file));
    // These exact bytes are inert: no backup has a live manifest.json or a separately writable save.
    for (const [name, bytes] of [
      ["manifest", manifestBytes],
      ["state", stateBytes],
      ["journal", journal],
    ] as const)
      await fs.writeFileDurable(join(dir, `legacy-${name}.v1.backup`), bytes);
    await fs.mkdirp(join(dir, "history"));
    const index = new HistoryIndex(dir, fs, sha256Canonical(policy(options)));
    let root: IndexRef | null = null;
    let offset = 0;
    let lastEntry: Location | null = null;
    let batch: { entry: JournalEntry; location: Location }[] = [];
    for (const { entry, length } of parseLines(
      journal.subarray(0, m.head.journal_bytes),
      m.head.journal_entries,
    )) {
      batch.push({
        entry,
        location: locationOf(
          entry,
          offset,
          length,
          legacy.ruleCheckedGroupIds?.().has(entry.group.group_id) ?? false,
        ),
      });
      lastEntry = batch[batch.length - 1]!.location;
      offset += length;
      if (batch.length === CHECKPOINT_INTERVAL || entry.revision === m.head.revision) {
        root = await index.extend(root, additionsOf(batch), entry.revision);
        batch = [];
      }
    }
    const { self_sha256: oldSeal, format_version: oldVersion, ...base } = m;
    void oldSeal;
    void oldVersion;
    const successorStateFile = stateName(m.head.revision);
    if (successorStateFile !== m.head.state_file)
      await fs.writeFileDurable(join(dir, successorStateFile), stateBytes);
    const next = seal({
      ...base,
      format_version: 2 as const,
      genesis_format_version: 1 as const,
      head: {
        ...m.head,
        state_file: successorStateFile,
        checkpoint: {
          revision: m.head.revision,
          state_sha256: m.head.state_sha256,
          journal_entries: m.head.journal_entries,
          journal_bytes: m.head.journal_bytes,
          journal_head_sha256: m.head.journal_head_sha256,
          index: root,
          last_entry: lastEntry,
          verification_policy: policy(options),
        },
      },
    });
    // Independently replay the successor and check every old identity/index BEFORE activation.
    const verified = await loadCheckpoint(
      dir,
      fs,
      lock,
      {
        ...options,
        audit: true,
        compatibleRuntimeContracts: [m.compatibility.runtime_contract_sha256],
      },
      next,
      true,
    );
    if (!verified.ok) return verified;
    if (
      canonicalJson(verified.value.listFacts()) !== canonicalJson(legacy.listFacts()) ||
      canonicalJson(verified.value.head()) !== canonicalJson(legacy.head())
    )
      return fail("REPLAY_MISMATCH", "successor does not preserve legacy state/head");
    if ((await lock.check()) !== "owned")
      return fail("LOCKED", "writer authority lost during migration");
    await fs.writeFileDurable(join(dir, "manifest.json"), `${canonicalJson(next)}\n`);
    return verified.value.residue.other_files.some((name) => /^state\.[0-9]{10}\.json$/.test(name))
      ? loadCheckpoint(dir, fs, lock, options, next)
      : verified;
  } catch (e) {
    return fail("REPLAY_MISMATCH", "legacy conversion did not complete; reconcile by reopening", {
      cause: String(e),
    });
  }
}

export async function loadCheckpoint(
  dir: string,
  fs: FsOps,
  lock: Lock,
  options: FileCampaignOptions,
  input: unknown,
  preparing = false,
): Promise<Result<FileCampaignStore, OpenErrorCode>> {
  const parsed = CheckpointManifestSchema.safeParse(input);
  if (!parsed.success)
    return fail("SCHEMA_INVALID", "invalid v2 manifest", {
      issues: parsed.error.issues.slice(0, 5),
    });
  const m = parsed.data;
  options =
    policy(options) === null || policy(options) !== m.head.checkpoint.verification_policy
      ? { ...options, audit: true }
      : options;
  const { self_sha256, ...unsealed } = m;
  if (sha256Canonical(unsealed) !== self_sha256)
    return fail("INTEGRITY_MANIFEST", "v2 manifest hash mismatch");
  const genesis = GenesisSchema.parse({
    format: m.format,
    format_version: m.genesis_format_version,
    campaign_id: m.campaign_id,
    spec_identity: m.spec_identity,
    compatibility: m.compatibility,
    created_with: m.created_with,
  });
  if (sha256Canonical(genesis) !== m.genesis_sha256)
    return fail("INTEGRITY_MANIFEST", "v2 genesis mismatch");
  if (
    !(options.compatibleRuntimeContracts ?? COMPATIBLE_RUNTIME_CONTRACT_SHA256S).includes(
      m.compatibility.runtime_contract_sha256,
    )
  )
    return fail("RUNTIME_CONTRACT_INCOMPATIBLE", "runtime contract incompatible");
  const h = m.head,
    cp = h.checkpoint;
  if (
    h.revision !== h.journal_entries ||
    cp.revision !== cp.journal_entries ||
    cp.revision > h.revision ||
    h.revision - cp.revision >= CHECKPOINT_INTERVAL ||
    cp.journal_bytes > h.journal_bytes ||
    h.state_file !== stateName(cp.revision)
  )
    return fail("INTEGRITY_MANIFEST", "invalid checkpoint/tail boundary");
  const size = await fs.fileSize(join(dir, "journal.jsonl"));
  if (size === null) return fail("MISSING_JOURNAL", "missing journal");
  if (size < h.journal_bytes) return fail("JOURNAL_TRUNCATED", "committed journal is truncated");
  if ((await fs.fileSize(join(dir, h.state_file))) === null)
    return fail("MISSING_STATE", "checkpoint state missing");
  let state;
  try {
    const raw: unknown = JSON.parse((await fs.readFile(join(dir, h.state_file))).toString("utf8"));
    const file = StateFileSchema.safeParse(raw);
    if (!file.success) return fail("SCHEMA_INVALID", "checkpoint state schema mismatch");
    const from = stateFromFile(file.data);
    if (!from.ok) return fail("INTEGRITY_STATE", from.error.message);
    state = from.value;
  } catch (e) {
    return fail("MALFORMED", "checkpoint is not readable JSON", { cause: String(e) });
  }
  if (
    state.campaign_id !== m.campaign_id ||
    state.revision !== cp.revision ||
    stateSha256(state) !== cp.state_sha256
  )
    return fail("INTEGRITY_STATE", "checkpoint state digest mismatch");
  const index = new HistoryIndex(dir, fs, sha256Canonical(policy(options)));
  const readLocation = (loc: Location): JournalEntry => {
    if (loc.offset + loc.length > cp.journal_bytes || loc.revision > cp.revision)
      throw new Error("uncommitted history index location");
    const bytes = fs.readRangeSync(join(dir, "journal.jsonl"), loc.offset, loc.length);
    const entry = parseLines(bytes, 1)[0]!.entry;
    if (
      entry.entry_sha256 !== loc.sha256 ||
      entryHash(entry) !== loc.sha256 ||
      entry.revision !== loc.revision ||
      entry.group.campaign_id !== m.campaign_id ||
      entry.receipt.campaign_id !== m.campaign_id ||
      sha256Canonical(entry.group) !== entry.receipt.group_sha256 ||
      entry.receipt.revision !== entry.revision ||
      entry.receipt.group_id !== entry.group.group_id ||
      entry.receipt.intent_id !== entry.group.intent_id
    )
      throw new Error("historical journal evidence mismatch");
    return entry;
  };
  const lookup = (namespace: "i" | "g", id: string) => {
    const loc = index.lookup(cp.index, `${namespace}:${id}`);
    if (!loc) return null;
    const entry = readLocation(loc);
    if ((namespace === "i" ? entry.group.intent_id : entry.group.group_id) !== id)
      throw new Error("index identity mismatch");
    return { entry, loc };
  };
  const history = {
    byIntent: (id: string) => {
      const r = lookup("i", id);
      return r ? { group: r.entry.group, receipt: r.entry.receipt } : null;
    },
    byGroup: (id: string) => {
      const r = lookup("g", id);
      return r ? { group: r.entry.group, receipt: r.entry.receipt } : null;
    },
    ruleChecked: (id: string) => lookup("g", id)?.loc.checked ?? false,
    *checkedIds() {
      const records = [...index.entries(cp.index)]
        .filter(([key, loc]) => key.startsWith("g:") && loc.checked)
        .sort((a, b) => a[1].revision - b[1].revision);
      for (const [key] of records) {
        lookup("g", key.slice(2));
        yield key.slice(2);
      }
    },
  };
  try {
    if (cp.index) index.read(cp.index);
    if ((cp.revision === 0) !== (cp.index === null))
      return fail("INTEGRITY_JOURNAL", "checkpoint has no verified history index");
    if (cp.revision === 0) {
      if (
        cp.last_entry !== null ||
        cp.journal_bytes !== 0 ||
        cp.journal_head_sha256 !== m.genesis_sha256 ||
        cp.state_sha256 !== stateSha256(emptyState(m.campaign_id))
      )
        return fail("INTEGRITY_STATE", "genesis checkpoint is inconsistent");
    } else {
      if (!cp.last_entry) return fail("INTEGRITY_JOURNAL", "checkpoint lacks last entry proof");
      const last = readLocation(cp.last_entry);
      const indexed = index.lookup(cp.index, `i:${last.group.intent_id}`);
      if (
        canonicalJson(indexed) !== canonicalJson(cp.last_entry) ||
        last.revision !== cp.revision ||
        cp.last_entry.offset + cp.last_entry.length !== cp.journal_bytes ||
        last.entry_sha256 !== cp.journal_head_sha256 ||
        last.receipt.state_sha256 !== cp.state_sha256
      )
        return fail("INTEGRITY_JOURNAL", "checkpoint publication proof mismatch");
    }
    const core = options.audit
      ? coreOf(m, options)
      : coreOf(m, options, state, cp.journal_head_sha256, history);
    const offsetStart = options.audit ? 0 : cp.journal_bytes;
    const count = options.audit ? h.journal_entries : h.journal_entries - cp.journal_entries;
    const bytes = await fs.readRange(
      join(dir, "journal.jsonl"),
      offsetStart,
      h.journal_bytes - offsetStart,
    );
    const tail: { entry: JournalEntry; location: Location }[] = [];
    let offset = offsetStart;
    const verifiedEntries: { entry: JournalEntry; location: Location }[] = [];
    for (const { entry, length } of parseLines(bytes, count)) {
      const replayed = core.replay(entry);
      if (!replayed.ok) return replayed;
      const loc = locationOf(
        entry,
        offset,
        length,
        core.ruleCheckedGroupIds().has(entry.group.group_id),
      );
      if (options.audit) verifiedEntries.push({ entry, location: loc });
      if (options.audit && entry.revision <= cp.revision) {
        for (const key of [`i:${entry.group.intent_id}`, `g:${entry.group.group_id}`]) {
          const stored = index.lookup(cp.index, key);
          if (
            !stored ||
            stored.offset !== offset ||
            stored.length !== length ||
            stored.sha256 !== entry.entry_sha256 ||
            stored.revision !== entry.revision ||
            (stored.checked &&
              !loc.checked &&
              cp.verification_policy === policy(options) &&
              cp.verification_policy !== null)
          )
            return fail("INTEGRITY_JOURNAL", "strict index/journal comparison failed");
        }
        if (entry.revision === cp.revision && stateSha256(core.state) !== cp.state_sha256)
          return fail("INTEGRITY_STATE", "strict checkpoint replay mismatch");
      } else tail.push({ entry, location: loc });
      offset += length;
    }
    if (core.headSha256 !== h.journal_head_sha256)
      return fail("INTEGRITY_JOURNAL", "tail chain head mismatch");
    if (core.state.revision !== h.revision || stateSha256(core.state) !== h.state_sha256)
      return fail("INTEGRITY_STATE", "tail state mismatch");
    if (policy(options) !== null && cp.verification_policy !== policy(options)) {
      const before = options.beforeMigrationCheck?.(
        new CheckpointStore(dir, fs, lock, core, m, options, size, tail, []),
      );
      if (before && !before.ok) return before;
      // A changed/untrusted verifier cannot inherit checked flags. Strict replay above earned each
      // proof anew. Build a separate generation, compare it, then publish one verified anchor.
      let root: IndexRef | null = null;
      for (let start = 0; start < verifiedEntries.length; start += CHECKPOINT_INTERVAL) {
        const batch = verifiedEntries.slice(start, start + CHECKPOINT_INTERVAL);
        root = await index.extend(
          root,
          additionsOf(batch),
          batch[batch.length - 1]!.entry.revision,
        );
      }
      const stateFile = stateName(h.revision);
      await fs.writeFileDurable(
        join(dir, stateFile),
        `${canonicalJson(stateToFile(core.state))}\n`,
      );
      const { self_sha256: oldSeal, ...body } = m;
      void oldSeal;
      const fresh = seal({
        ...body,
        head: {
          ...h,
          state_file: stateFile,
          checkpoint: {
            revision: h.revision,
            state_sha256: h.state_sha256,
            journal_entries: h.journal_entries,
            journal_bytes: h.journal_bytes,
            journal_head_sha256: h.journal_head_sha256,
            index: root,
            last_entry: verifiedEntries[verifiedEntries.length - 1]?.location ?? null,
            verification_policy: policy(options),
          },
        },
      });
      if ((await lock.check()) !== "owned")
        throw new Error("writer authority lost during checkpoint verification");
      const successor = await loadCheckpoint(
        dir,
        fs,
        lock,
        { ...options, audit: true },
        fresh,
        true,
      );
      if (!successor.ok) return successor;
      await fs.writeFileDurable(join(dir, "manifest.json"), `${canonicalJson(fresh)}\n`);
      return loadCheckpoint(dir, fs, lock, options, fresh);
    }
    const known = new Set([
      "manifest.json",
      "journal.jsonl",
      h.state_file,
      "history",
      "legacy-manifest.v1.backup",
      "legacy-journal.v1.backup",
      "legacy-state.v1.backup",
    ]);
    const residue = (await fs.list(dir))
      .filter((name) => !known.has(name) && name !== "LOCK" && !name.startsWith("LOCK."))
      .sort();
    const store = new CheckpointStore(dir, fs, lock, core, m, options, size, tail, residue);
    // Independently verify hypothetical migration/policy successors without touching old files.
    // Only the published manifest can authorize automatic residue reconciliation.
    const reconciled = preparing
      ? ok(residue)
      : await reconcileCheckpointStates(dir, fs, lock, options, m, store, size, residue);
    if (!reconciled.ok) return reconciled;
    return ok(
      reconciled.value === residue
        ? store
        : new CheckpointStore(dir, fs, lock, core, m, options, size, tail, reconciled.value),
    );
  } catch (e) {
    return fail("INTEGRITY_JOURNAL", "checkpoint/index/tail verification failed", {
      cause: String(e),
    });
  }
}

class CheckpointStore implements FileCampaignStore {
  readonly descriptor = FILE_PACKAGE_DESCRIPTOR;
  readonly residue;
  readonly provenanceDrift;
  #closed = false;
  #poisoned = false;
  #lost = false;
  #queue: Promise<unknown> = Promise.resolve();
  readonly #dir: string;
  readonly #fs: FsOps;
  readonly #lock: Lock;
  readonly #core: CampaignCore;
  #manifest: V2Manifest;
  readonly #options: FileCampaignOptions;
  #journalSize: number;
  #tail: { entry: JournalEntry; location: Location }[];
  constructor(
    dir: string,
    fs: FsOps,
    lock: Lock,
    core: CampaignCore,
    manifest: V2Manifest,
    options: FileCampaignOptions,
    journalSize: number,
    tail: { entry: JournalEntry; location: Location }[],
    residue: string[],
  ) {
    this.#dir = dir;
    this.#fs = fs;
    this.#lock = lock;
    this.#core = core;
    this.#manifest = manifest;
    this.#options = options;
    this.#journalSize = journalSize;
    this.#tail = tail;
    this.residue = {
      journal_tail_bytes: journalSize - manifest.head.journal_bytes,
      other_files: residue,
    };
    this.provenanceDrift =
      sha256Canonical(manifest.last_saved_spec_identity) !==
      sha256Canonical(options.specIdentity ?? BUILD_SPEC_IDENTITY);
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
  getFact(key: string) {
    return this.#core.state.facts.get(key);
  }
  listFacts() {
    return stateToFile(this.#core.state).facts;
  }
  lookupReceipt(id: string): CommitReceipt | null {
    return this.#checked(() => this.#core.lookupReceipt(id));
  }
  committedGroup(id: string): CommitGroup | null {
    return this.#checked(() => this.#core.lookupGroup(id));
  }
  committedGroupById(id: string): CommitGroup | null {
    return this.#checked(() => this.#core.lookupGroupById(id));
  }
  #checked<T>(read: () => T): T {
    try {
      return read();
    } catch (e) {
      this.#poisoned = true;
      throw e;
    }
  }
  ruleCheckedGroupIds(): ReadonlySet<string> {
    const base = this.#core.ruleCheckedGroupIds();
    const guarded = <T>(read: () => T) => this.#checked(read);
    const poison = () => {
      this.#poisoned = true;
    };
    function* values(): Generator<string, undefined> {
      try {
        yield* base;
      } catch (e) {
        poison();
        throw e;
      }
      return undefined;
    }
    const view: ReadonlySet<string> = {
      has: (id) => guarded(() => base.has(id)),
      get size() {
        return guarded(() => base.size);
      },
      values,
      keys: values,
      [Symbol.iterator]: values,
      *entries(): Generator<[string, string], undefined> {
        for (const id of values()) yield [id, id];
        return undefined;
      },
      forEach(fn, arg) {
        for (const id of values()) fn.call(arg, id, id, view);
      },
    };
    return view;
  }
  commit(group: unknown): Promise<Result<CommitOutcome, StoreCommitErrorCode>> {
    const run = this.#queue.then(() => this.#apply(group));
    this.#queue = run.catch(() => undefined);
    return run;
  }
  async #apply(group: unknown): Promise<Result<CommitOutcome, StoreCommitErrorCode>> {
    if (this.#closed || this.#lost)
      return fail("STORE_CLOSED", "campaign is closed or writer lock lost");
    if (this.#poisoned) return fail("STORE_POISONED", "reopen and reconcile original intent");
    const owned = await this.#lock.check();
    if (owned !== "owned") {
      this.#lost = owned === "lost";
      return fail("STORE_CLOSED", "writer authority unavailable", {
        reason: owned === "lost" ? "WRITER_LOCK_LOST" : "WRITER_LOCK_UNVERIFIED",
      });
    }
    let prepared;
    try {
      prepared = this.#core.prepare(group);
    } catch (e) {
      this.#poisoned = true;
      return fail("STORE_POISONED", "historical evidence unavailable", { cause: String(e) });
    }
    if (!prepared.ok) return prepared;
    if (prepared.value.kind === "replay")
      return ok({ receipt: prepared.value.receipt, replayed: true });
    const { entry, nextState } = prepared.value;
    const line = `${canonicalJson(entry)}\n`,
      previous = this.#manifest;
    const loc = locationOf(
      entry,
      previous.head.journal_bytes,
      Buffer.byteLength(line),
      this.#options.admission !== undefined,
    );
    const tail = [...this.#tail, { entry, location: loc }];
    let checkpoint = previous.head.checkpoint;
    let stateFile = previous.head.state_file;
    try {
      if (this.#journalSize > previous.head.journal_bytes)
        await this.#fs.truncate(join(this.#dir, "journal.jsonl"), previous.head.journal_bytes);
      await this.#fs.appendDurable(join(this.#dir, "journal.jsonl"), line);
      const journalBytes = loc.offset + loc.length;
      if (tail.length >= CHECKPOINT_INTERVAL) {
        const index = await new HistoryIndex(
          this.#dir,
          this.#fs,
          sha256Canonical(policy(this.#options)),
        ).extend(checkpoint.index, additionsOf(tail), entry.revision);
        stateFile = stateName(entry.revision);
        await this.#fs.writeFileDurable(
          join(this.#dir, stateFile),
          `${canonicalJson(stateToFile(nextState))}\n`,
        );
        checkpoint = {
          revision: entry.revision,
          state_sha256: entry.receipt.state_sha256,
          journal_entries: entry.revision,
          journal_bytes: journalBytes,
          journal_head_sha256: entry.entry_sha256,
          index,
          last_entry: loc,
          verification_policy: policy(this.#options),
        };
      }
      const { self_sha256: oldSeal, ...base } = previous;
      void oldSeal;
      const next = seal({
        ...base,
        last_saved_with: {
          package: ENGINE_PACKAGE,
          version: ENGINE_VERSION,
          build_id: this.#options.buildId ?? null,
        },
        last_saved_spec_identity: this.#options.specIdentity ?? BUILD_SPEC_IDENTITY,
        head: {
          revision: entry.revision,
          state_file: stateFile,
          state_sha256: entry.receipt.state_sha256,
          journal_entries: entry.revision,
          journal_bytes: journalBytes,
          journal_head_sha256: entry.entry_sha256,
          checkpoint,
        },
      });
      if ((await this.#lock.check()) !== "owned")
        throw new Error("writer authority lost before head publication");
      await this.#fs.writeFileDurable(join(this.#dir, "manifest.json"), `${canonicalJson(next)}\n`);
      this.#manifest = next;
      this.#journalSize = journalBytes;
      this.#tail = checkpoint.revision === entry.revision ? [] : tail;
    } catch (e) {
      this.#poisoned = true;
      return fail(
        "UNKNOWN_OUTCOME",
        "durable outcome unknown; reopen and reconcile original intent",
        { intent_id: entry.group.intent_id, cause: String(e) },
      );
    }
    this.#core.accept(prepared.value);
    if (previous.head.state_file !== this.#manifest.head.state_file)
      await this.#fs.remove(join(this.#dir, previous.head.state_file)).catch(() => undefined);
    return ok({ receipt: entry.receipt, replayed: false });
  }
  async close() {
    await this.#queue.catch(() => undefined);
    if (this.#closed) return;
    this.#closed = true;
    await this.#lock.release();
  }
}
