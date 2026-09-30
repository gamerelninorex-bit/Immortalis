import {
  CANON_WRITE_AUTHORITY,
  canonicalJson,
  CommitGroupSchema,
  fail,
  ok,
  type CommitGroup,
  type CommitReceipt,
  type Failure,
  type JournalEntry,
  type OwnerFact,
  type Result,
  type StateFile,
} from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";

const canonicalEqual = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);

/**
 * Pure, storage-free commit logic (IM-11 subset). Nothing here touches a filesystem, clock or RNG,
 * so identical inputs always produce identical state, receipts and hashes.
 *
 * Owners are NOT hard-coded: the set of lawful owner/facet pairs is supplied by the caller as an
 * OwnerRegistry (IM-03 will populate it slice by slice). An empty registry makes every write fail
 * closed rather than falling back to a generic owner (IA-02, IA-03).
 */
export type OwnerRegistry = ReadonlyMap<string, ReadonlySet<string>>;

export const CommitErrorCodes = [
  "SCHEMA_INVALID",
  "CAMPAIGN_MISMATCH",
  "AUTHORITY_DENIED",
  "OWNER_NOT_REGISTERED",
  "WRITE_OWNER_MISMATCH",
  "DUPLICATE_KEY_IN_GROUP",
  "FACT_OWNER_CONFLICT",
  "VERSION_CONFLICT",
  "STALE_READ",
  "MISSING_DEPENDENCY",
  "INTENT_CONFLICT",
  "GROUP_ID_CONFLICT",
] as const;
export type CommitErrorCode = (typeof CommitErrorCodes)[number];

/** Invariants asserted by every successful commit (RC-07 "invariant results"). */
const INVARIANTS = [
  "authority-present",
  "owner-registered",
  "owner-exclusive",
  "unique-keys-in-group",
  "expected-versions-current",
  "reads-current",
  "dependencies-committed",
] as const;

export interface CampaignState {
  readonly campaign_id: string;
  readonly revision: number;
  readonly facts: ReadonlyMap<string, OwnerFact>;
}

export const emptyState = (campaignId: string): CampaignState => ({
  campaign_id: campaignId,
  revision: 0,
  facts: new Map(),
});

export function stateToFile(state: CampaignState): StateFile {
  const facts = [...state.facts.values()].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  return { campaign_id: state.campaign_id, revision: state.revision, facts };
}

export function stateFromFile(file: StateFile): Result<CampaignState, "SCHEMA_INVALID"> {
  const facts = new Map<string, OwnerFact>();
  for (const fact of file.facts) {
    if (facts.has(fact.key))
      return fail("SCHEMA_INVALID", `duplicate fact key "${fact.key}" in state`);
    facts.set(fact.key, fact);
  }
  return ok({ campaign_id: file.campaign_id, revision: file.revision, facts });
}

export const stateSha256 = (state: CampaignState): string => sha256Canonical(stateToFile(state));
export const groupSha256 = (group: CommitGroup): string => sha256Canonical(group);

export function entryHash(entry: Omit<JournalEntry, "entry_sha256">): string {
  return sha256Canonical({
    revision: entry.revision,
    prev_sha256: entry.prev_sha256,
    group: entry.group,
    receipt: entry.receipt,
  });
}

interface LedgerRecord {
  readonly group_id: string;
  readonly group_sha256: string;
  readonly receipt: CommitReceipt;
}

/** What a successful `prepare` produced. `replayed` means nothing changes and no entry is written. */
export type Prepared =
  | { readonly kind: "replay"; readonly receipt: CommitReceipt }
  | {
      readonly kind: "apply";
      readonly nextState: CampaignState;
      readonly entry: JournalEntry;
    };

export interface CoreParams {
  readonly campaignId: string;
  /** sha256 of the spec-lock this build implements (IA-01); recorded in every receipt. */
  readonly specLockSha256: string;
  readonly owners: OwnerRegistry;
  readonly state: CampaignState;
  /** chain head: genesis hash when the journal is empty */
  readonly headSha256: string;
}

/** Deterministic core: validates a group against current state and computes the next state. */
export class CampaignCore {
  #state: CampaignState;
  #headSha256: string;
  readonly #byIntent = new Map<string, LedgerRecord>();
  readonly #byGroup = new Map<string, string>(); // group_id -> intent_id
  readonly #params: CoreParams;

  constructor(params: CoreParams) {
    this.#params = params;
    this.#state = params.state;
    this.#headSha256 = params.headSha256;
  }

  get state(): CampaignState {
    return this.#state;
  }
  get headSha256(): string {
    return this.#headSha256;
  }

  lookupReceipt(intentId: string): CommitReceipt | null {
    return this.#byIntent.get(intentId)?.receipt ?? null;
  }

  /** Re-registers an already-committed entry (used when replaying a journal on load). */
  adopt(entry: JournalEntry, nextState: CampaignState): void {
    this.#state = nextState;
    this.#headSha256 = entry.entry_sha256;
    this.#register(entry.group, entry.receipt);
  }

  /** Called by a store after the entry is durable. */
  accept(prepared: Extract<Prepared, { kind: "apply" }>): void {
    this.adopt(prepared.entry, prepared.nextState);
  }

  #register(group: CommitGroup, receipt: CommitReceipt): void {
    this.#byIntent.set(group.intent_id, {
      group_id: group.group_id,
      group_sha256: receipt.group_sha256,
      receipt,
    });
    this.#byGroup.set(group.group_id, group.intent_id);
  }

  prepare(input: unknown): Result<Prepared, CommitErrorCode> {
    const parsed = CommitGroupSchema.safeParse(input);
    if (!parsed.success) {
      return fail("SCHEMA_INVALID", "commit group failed schema validation", {
        issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
      });
    }
    const group = parsed.data;
    const state = this.#state;
    const digest = groupSha256(group);

    // Idempotence / identity (RC-16, CAL-07): same identity + same intent replays; anything else is rejected.
    const prior = this.#byIntent.get(group.intent_id);
    if (prior) {
      if (prior.group_sha256 === digest) return ok({ kind: "replay", receipt: prior.receipt });
      return fail("INTENT_CONFLICT", "intent_id was already committed with different content", {
        intent_id: group.intent_id,
      });
    }
    const priorIntent = this.#byGroup.get(group.group_id);
    if (priorIntent !== undefined) {
      return fail("GROUP_ID_CONFLICT", "group_id already belongs to a different intent", {
        group_id: group.group_id,
      });
    }

    const rejection = this.#validate(state, group, true);
    if (rejection) return { ok: false, error: rejection };
    return ok({ kind: "apply", ...this.#compute(group, digest) });
  }

  /**
   * Verifies one journal entry against current state and adopts it (used when loading). Owner
   * registration is NOT re-checked: the registry belongs to the running build, not to history.
   * Everything structural (chain, hashes, versions, reads, dependencies, receipt) is re-derived.
   */
  replay(entry: JournalEntry): Result<void, "REPLAY_MISMATCH"> {
    const mismatch = (message: string) =>
      fail("REPLAY_MISMATCH", message, { revision: entry.revision });
    if (entry.revision !== this.#state.revision + 1) return mismatch("non-consecutive revision");
    if (entry.prev_sha256 !== this.#headSha256) return mismatch("broken hash chain");
    const { entry_sha256: recorded, ...rest } = entry;
    if (entryHash(rest) !== recorded) return mismatch("entry hash does not match content");
    const digest = groupSha256(entry.group);
    if (this.#byIntent.has(entry.group.intent_id) || this.#byGroup.has(entry.group.group_id)) {
      return mismatch("duplicate intent or group identity");
    }
    const rejection = this.#validate(this.#state, entry.group, false);
    if (rejection) return mismatch(`entry is not a valid transition: ${rejection.code}`);
    const computed = this.#compute(entry.group, digest);
    if (canonicalEqual(computed.entry, entry) === false)
      return mismatch("recomputed entry differs");
    this.adopt(computed.entry, computed.nextState);
    return ok(undefined);
  }

  #compute(group: CommitGroup, digest: string): { nextState: CampaignState; entry: JournalEntry } {
    const state = this.#state;
    const facts = new Map(state.facts);
    for (const w of group.writes) {
      const current = state.facts.get(w.key);
      facts.set(w.key, {
        key: w.key,
        owner: w.owner,
        facet: w.facet,
        value: w.value,
        unit: w.unit,
        basis: w.basis,
        secrecy: w.secrecy,
        version: (current?.version ?? 0) + 1,
        provenance: {
          group_id: group.group_id,
          intent_id: group.intent_id,
          cause: group.cause,
          rule: group.rule,
        },
      });
    }
    const nextState: CampaignState = {
      campaign_id: state.campaign_id,
      revision: state.revision + 1,
      facts,
    };
    const receipt: CommitReceipt = {
      outcome: "COMMITTED",
      campaign_id: group.campaign_id,
      group_id: group.group_id,
      intent_id: group.intent_id,
      revision: nextState.revision,
      group_sha256: digest,
      state_sha256: stateSha256(nextState),
      basis: {
        spec_lock_sha256: this.#params.specLockSha256,
        rule: group.rule,
        authority: group.authority,
      },
      invariants: INVARIANTS.map((name) => ({ name, passed: true as const })),
    };
    const partial = { revision: nextState.revision, prev_sha256: this.#headSha256, group, receipt };
    return { nextState, entry: { ...partial, entry_sha256: entryHash(partial) } };
  }

  #validate(
    state: CampaignState,
    group: CommitGroup,
    checkRegistry: boolean,
  ): Failure<CommitErrorCode> | null {
    const bad = (code: CommitErrorCode, message: string, details?: Record<string, unknown>) =>
      details === undefined ? { code, message } : { code, message, details };

    if (group.campaign_id !== state.campaign_id) {
      return bad("CAMPAIGN_MISMATCH", "group targets a different campaign", {
        expected: state.campaign_id,
        actual: group.campaign_id,
      });
    }
    if (
      group.authority.role !== CANON_WRITE_AUTHORITY.role ||
      group.authority.permission !== CANON_WRITE_AUTHORITY.permission
    ) {
      return bad(
        "AUTHORITY_DENIED",
        "canonical publication requires role.archivist + permission.canon.write",
      );
    }
    if (checkRegistry && !this.#params.owners.get(group.owner)?.has(group.facet)) {
      return bad("OWNER_NOT_REGISTERED", "no registered owner/facet; there is no fallback owner", {
        owner: group.owner,
        facet: group.facet,
      });
    }
    const seen = new Set<string>();
    for (const w of group.writes) {
      if (w.owner !== group.owner || w.facet !== group.facet) {
        return bad("WRITE_OWNER_MISMATCH", "a group may only write its own owner/facet", {
          key: w.key,
        });
      }
      if (seen.has(w.key))
        return bad("DUPLICATE_KEY_IN_GROUP", "key written twice in one group", { key: w.key });
      seen.add(w.key);
      const current = state.facts.get(w.key);
      if (current && (current.owner !== w.owner || current.facet !== w.facet)) {
        return bad("FACT_OWNER_CONFLICT", "fact belongs to a different owner/facet", {
          key: w.key,
          owner: current.owner,
          facet: current.facet,
        });
      }
      const currentVersion = current?.version ?? 0;
      if (w.expected_version !== currentVersion) {
        return bad("VERSION_CONFLICT", "expected_version is not current", {
          key: w.key,
          expected: w.expected_version,
          current: currentVersion,
        });
      }
    }
    for (const r of group.reads) {
      const currentVersion = state.facts.get(r.key)?.version ?? 0;
      if (r.version !== currentVersion) {
        return bad("STALE_READ", "a fact read by this group changed", {
          key: r.key,
          read: r.version,
          current: currentVersion,
        });
      }
    }
    for (const dep of group.depends_on) {
      if (!this.#byGroup.has(dep))
        return bad("MISSING_DEPENDENCY", "dependency group not committed", { group_id: dep });
    }
    return null;
  }
}
