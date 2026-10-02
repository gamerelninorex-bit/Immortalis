import {
  CANON_WRITE_AUTHORITY,
  ExternalRecognitionSchema,
  ExternalizedClaimDisputeSchema,
  PublicationSchema,
  diplomacyDisputeKey,
  diplomacyRecognitionKey,
  disputeDependencyKeys,
  fail,
  recognitionDependencyKeys,
  type CommitGroup,
  type ExternalRecognition,
  type ExternalizedClaimDispute,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";

export type DiplomacyErrorCode = StoreCommitErrorCode | "INPUT_INVALID";

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

/**
 * Whether the registered dependencies of a recognition are still the versions it was established against (WS-008 §29.3: "an
 * upstream write to a registered dependency invalidates the derived conclusion before it may be read as current"). A baseline
 * record with no `dependency_refs[]` has nothing to invalidate. `invalidated` names each dependency whose current version is no
 * longer the one pinned at establishment. It reads only the recognition's own dependency keys, by exact key.
 */
export interface RecognitionDependencyState {
  readonly current: boolean;
  readonly invalidated: readonly string[];
}

/** A committed External Recognition read by identity: the fact (with its provenance), its typed value and its dependency state. */
export interface TypedExternalRecognition {
  readonly fact: OwnerFact;
  readonly value: ExternalRecognition;
  readonly dependencies: RecognitionDependencyState;
}

/**
 * The read path any lawful consumer uses: one committed External Recognition, by its exact canonical `recognition_id`
 * (WS-008 §29.7: no all-pairs scan; retrieval is keyed by the current diplomatic question). It takes only the read side of a
 * store, so reading grants no write authority, and it returns undefined for a recognition that is not established — nothing is
 * created, inferred or defaulted by a read (silence or absence of recognition creates no record). It reports what the record
 * says: it dereferences no reference, resolves no authority, calculates no existence, control, awareness or internal-law
 * consequence and re-resolves nothing; where the record registered dependencies it reports, from those exact keys alone, whether
 * an upstream write has moved any of them.
 */
export function readExternalRecognition(
  store: Pick<CampaignStore, "getFact" | "committedGroup">,
  recognitionId: string,
): TypedExternalRecognition | undefined {
  const fact = store.getFact(diplomacyRecognitionKey(recognitionId));
  if (!fact) return undefined;
  const parsed = ExternalRecognitionSchema.safeParse(fact.value);
  if (!parsed.success) return undefined;
  const invalidated: string[] = [];
  const keys = recognitionDependencyKeys(parsed.data);
  if (keys.length > 0) {
    const pins = store.committedGroup(fact.provenance.intent_id)?.reads ?? [];
    for (const key of keys) {
      const pinned = pins.find((r) => r.key === key)?.version;
      if (pinned === undefined || (store.getFact(key)?.version ?? 0) !== pinned)
        invalidated.push(key);
    }
  }
  return {
    fact,
    value: parsed.data,
    dependencies: { current: invalidated.length === 0, invalidated },
  };
}

/** Whether the registered dependencies of a Claim / Dispute are still the versions it was established against (same rule as recognition). */
export type DisputeDependencyState = RecognitionDependencyState;

/** A committed Externalized Claim / Dispute read by identity: the fact (with its provenance), its typed value and its dependency state. */
export interface TypedExternalizedClaimDispute {
  readonly fact: OwnerFact;
  readonly value: ExternalizedClaimDispute;
  readonly dependencies: DisputeDependencyState;
}

/**
 * The read path any lawful consumer uses: one committed Externalized Claim / Dispute, by its exact canonical `dispute_id`
 * (WS-008 §29.7: no all-pairs scan; no all-disputes scan). It takes only the read side of a store, so reading grants no write
 * authority, and it returns undefined for a dispute that is not established — nothing is created, inferred or defaulted by a
 * read. It reports what the record says: it dereferences no reference, creates or mutates no underlying claim, infers no private
 * belief, future behavior or objective truth, creates no receipt and re-resolves nothing; where the record registered
 * dependencies it reports, from those exact keys alone, whether an upstream write has moved any of them (WS-008 §29.3:
 * invalidated before it may be read as current).
 */
export function readExternalizedClaimDispute(
  store: Pick<CampaignStore, "getFact" | "committedGroup">,
  disputeId: string,
): TypedExternalizedClaimDispute | undefined {
  const fact = store.getFact(diplomacyDisputeKey(disputeId));
  if (!fact) return undefined;
  const parsed = ExternalizedClaimDisputeSchema.safeParse(fact.value);
  if (!parsed.success) return undefined;
  const invalidated: string[] = [];
  const keys = disputeDependencyKeys(parsed.data);
  if (keys.length > 0) {
    const pins = store.committedGroup(fact.provenance.intent_id)?.reads ?? [];
    for (const key of keys) {
      const pinned = pins.find((r) => r.key === key)?.version;
      if (pinned === undefined || (store.getFact(key)?.version ?? 0) !== pinned)
        invalidated.push(key);
    }
  }
  return {
    fact,
    value: parsed.data,
    dependencies: { current: invalidated.length === 0, invalidated },
  };
}

/**
 * IM-06 Diplomacy — the authored path of the Diplomacy owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority or a governing rule:
 * those come from the specification-backed registry, and the publication is made by the archivist path through the existing
 * IM-11/IM-12/IM-17 store (one journal, one canon). There are exactly TWO authored publications: the explicit initial
 * establishment of one External Recognition and the explicit initial establishment of one Externalized Claim / Dispute (see
 * `establishExternalizedClaimDispute`). Nothing else creates a recognition — not contact, trade, negotiation, treaty-making,
 * conduct, silence or absence — and there is no withdrawal, suspension, supersession, succession, status-change,
 * re-resolution or retirement method, no negotiation, Instrument, Clause, Binding Entry, Relation Edge or reciprocal-record
 * method, no tick, scan, scheduler or watcher, and no way to write another owner's fact, so no caller can write Diplomacy state
 * out of order; the store's admission refuses it for a raw commit as well.
 *
 * Every reference (`recognizer_ref`, `recognized_referent_ref`, `authority_basis_ref`, `instrument_or_act_ref`, `provenance_ref`,
 * `successor_rule_ref`) is an opaque authored value that is never dereferenced. `dependency_refs[]` is the one exception that
 * binds the group: where the authored record names mutable implemented owner facts, the adapter pins each of them (read at its
 * current version, depended on through its committing group) through the existing commit-group machinery and nothing else; a
 * record that names none pins nothing.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): identical input
 * reaches the original receipt, and a changed input is refused as a conflict rather than silently reusing it. A conflicting
 * establishment at an occupied `recognition_id` is refused and never overwrites it. Nothing is re-rolled or improved: no
 * randomness exists here.
 */
export class DiplomacyAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Commits the initial establishment of one External Recognition. It writes exactly one create-only key derived from its
   * `recognition_id` alone. Every value is the caller's authored input: nothing is defaulted, inferred or calculated, and no
   * reciprocal record is written. If the record names `dependency_refs[]`, it reads exactly those facts (by key, at their
   * current versions) and depends on the groups that committed them; a dependency that is not committed is pinned at version
   * zero and admission refuses the group as a missing prerequisite, nothing being created. A record without them reads and
   * depends on nothing.
   */
  async establishExternalRecognition(
    input: Publication & { readonly recognition: unknown },
  ): Promise<Result<CommitOutcome, DiplomacyErrorCode>> {
    const p = PublicationSchema.safeParse({
      group_id: input.group_id,
      intent_id: input.intent_id,
      cause: input.cause,
      basis: input.basis,
      secrecy: input.secrecy,
    });
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const recognition = ExternalRecognitionSchema.safeParse(input.recognition);
    if (!recognition.success)
      return fail("INPUT_INVALID", "external recognition failed validation", {
        issues: issues(recognition.error),
      });
    const value = recognition.data;
    const reads: CommitGroup["reads"][number][] = [];
    const dependsOn = new Set<string>();
    for (const key of recognitionDependencyKeys(value)) {
      const dependency = this.#store.getFact(key);
      reads.push({ key, version: dependency?.version ?? 0 });
      if (dependency) dependsOn.add(dependency.provenance.group_id);
    }
    const kind = factKind("diplomacy_external_recognition");
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.data.group_id,
      intent_id: p.data.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.data.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [...dependsOn],
      writes: [
        {
          key: diplomacyRecognitionKey(value.recognition_id),
          owner: kind.owner,
          facet: kind.facet,
          value: value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.data.basis,
          secrecy: p.data.secrecy,
          expected_version: 0,
        },
      ],
    };
    return this.#store.commit(group);
  }

  /**
   * Commits the initial establishment of one Externalized Claim / Dispute. It writes exactly one create-only key derived from
   * its `dispute_id` alone. Every value is the caller's authored input: nothing is defaulted (`effect_on` included), inferred
   * or calculated, no underlying claim or other foreign-owner fact is created or mutated, no receipt is created and no
   * reference is dereferenced. If the record names `dependency_refs[]`, it reads exactly those facts (by key, at their current
   * versions) and depends on the groups that committed them; a dependency that is not committed is pinned at version zero and
   * admission refuses the group as a missing prerequisite, nothing being created. A record without them reads and depends on
   * nothing. A conflicting establishment at an occupied `dispute_id` is refused and never overwrites it; a retry of the same
   * intent converges on the original receipt (RC-16).
   */
  async establishExternalizedClaimDispute(
    input: Publication & { readonly dispute: unknown },
  ): Promise<Result<CommitOutcome, DiplomacyErrorCode>> {
    const p = PublicationSchema.safeParse({
      group_id: input.group_id,
      intent_id: input.intent_id,
      cause: input.cause,
      basis: input.basis,
      secrecy: input.secrecy,
    });
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const dispute = ExternalizedClaimDisputeSchema.safeParse(input.dispute);
    if (!dispute.success)
      return fail("INPUT_INVALID", "externalized claim / dispute failed validation", {
        issues: issues(dispute.error),
      });
    const value = dispute.data;
    const reads: CommitGroup["reads"][number][] = [];
    const dependsOn = new Set<string>();
    for (const key of disputeDependencyKeys(value)) {
      const dependency = this.#store.getFact(key);
      reads.push({ key, version: dependency?.version ?? 0 });
      if (dependency) dependsOn.add(dependency.provenance.group_id);
    }
    const kind = factKind("diplomacy_claim_dispute");
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.data.group_id,
      intent_id: p.data.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.data.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [...dependsOn],
      writes: [
        {
          key: diplomacyDisputeKey(value.dispute_id),
          owner: kind.owner,
          facet: kind.facet,
          value: value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.data.basis,
          secrecy: p.data.secrecy,
          expected_version: 0,
        },
      ],
    };
    return this.#store.commit(group);
  }

  // -- typed read, by identity (none scans) ----------------------------------------------------

  /** One External Recognition, or undefined. Reading it transfers no Diplomacy write authority and resolves nothing. */
  externalRecognition(recognitionId: string): TypedExternalRecognition | undefined {
    return readExternalRecognition(this.#store, recognitionId);
  }

  /** One Externalized Claim / Dispute, or undefined. Reading it transfers no Diplomacy write authority and resolves nothing. */
  externalizedClaimDispute(disputeId: string): TypedExternalizedClaimDispute | undefined {
    return readExternalizedClaimDispute(this.#store, disputeId);
  }
}
