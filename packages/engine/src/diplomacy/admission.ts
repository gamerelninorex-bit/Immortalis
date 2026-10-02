import {
  ExternalRecognitionSchema,
  ExternalizedClaimDisputeSchema,
  RelationEdgeSchema,
  diplomacyDisputeKey,
  diplomacyRecognitionKey,
  diplomacyRelationKey,
  disputeDependencyKeys,
  recognitionDependencyKeys,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import {
  DIPLOMACY_CLAIM_DISPUTE_RULE,
  DIPLOMACY_RECOGNITION_RULE,
  DIPLOMACY_RELATION_EDGE_RULE,
  resolveKey,
} from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";

/**
 * IM-11 admission for the IM-06 Diplomacy owner (IM-03 owner resolution; WS-008 v1.1 §§2.1, 2.2, 6, 24, 29.2, 29.3, 29.7).
 * Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the owner path. Key-space
 * exclusivity (nobody but `diplomacy`/`diplomacy_external_recognition` can write a `diplomacy/…` key, and the Diplomacy owner
 * can write no canonical, kernel, Population, Production, Economy, World-State, Logistics, Named-Actor, Epistemic, KTI or GIP
 * key) is enforced by the owner registry before this runs; this enforces that even the Diplomacy owner can change its state in
 * exactly one lawful way, an initial establishment:
 *
 * EXTERNAL RECOGNITION CORE: one authored recognition record, at the one key its canonical `recognition_id` alone derives,
 * created once, under the recognition citation. It is the owner's OWN authored statement: it dereferences no `recognizer_ref`,
 * `recognized_referent_ref`, `authority_basis_ref`, `instrument_or_act_ref`, `provenance_ref` or `successor_rule_ref`, restricts
 * no recognizer-party or referent class, closes no `recognition_status` or `continuity_basis` set, calculates no authority,
 * existence, control, awareness or internal-law consequence, creates or infers no foreign-owner state and writes nothing else.
 * The only cross-fact rule is WS-008 §29.3's: where the record carries `dependency_refs[]` (it was derived from another
 * owner's mutable implemented state), each named fact must be committed and pinned by the group — read at its current version
 * and depended on through its committing group, the existing dependency registration — and the group pins exactly those and
 * nothing else; where the record carries none (a purely authored baseline), the group reads and depends on nothing, so no
 * dependency is invented. The kind is ADVANCING because a later lawful cause may withdraw, suspend or supersede a recognition;
 * NO such change exists yet, so every write to a recognition other than its first creation (expected version 0) is refused here
 * as not supported, and a second creation of an occupied slot is refused by the store's version chain. No sibling record,
 * reciprocal recognition, per-recipient copy, Relation Edge, Instrument or score is made.
 *
 * EXTERNALIZED CLAIM / DISPUTE CORE (eighteenth slice): one authored claim / dispute record, at the one key its canonical
 * `dispute_id` alone derives, created once, under the claim / dispute citation. It is the owner's OWN authored statement that a
 * position was externally communicated: it dereferences no `party_refs[]`, `underlying_subject_ref`, `interpretation_issue_ref`,
 * `instrument_or_clause_ref`, `adjudication_basis_ref` or `provenance_ref`, restricts no party class, closes no `status` set,
 * imposes no schema on `communicated_position_entries[]`, no array minimum, uniqueness or ordering, defaults no `effect_on`,
 * creates or mutates no underlying claim or other foreign-owner state, infers no private belief, future behavior or objective
 * truth, creates no receipt event and writes nothing else. The only cross-fact rule is the same WS-008 §29.3 rule as above for
 * `dependency_refs[]`. The kind is ADVANCING; NO post-establishment change exists yet (status change, new or changed position,
 * remedy change, interpretation or adjudication update, effect resolution, dependency-driven re-resolution, conversion, merger,
 * settlement, retirement or deletion), so every write to a dispute other than its first creation is refused here as not
 * supported, and a second creation of an occupied slot is refused by the store's version chain.
 *
 * RELATION EDGE AUTHORITATIVE CORE (nineteenth slice): one authored relation edge, at the one key its canonical `relation_id`
 * alone derives, created once, under the relation edge citation. It is the owner's OWN authored statement that an external
 * relation materially continues: it dereferences no `party_refs[]` or `provenance_ref`, closes no `relation_scope`,
 * `rupture_or_suspension_status` or `lifecycle_status` set, imposes no array minimum, uniqueness or ordering, defaults nothing,
 * stores no derived channel, recognition, claim / dispute, instrument or framework reference array (the contract is strict, so
 * such a field is refused), associates no existing Recognition or Claim / Dispute record, creates or mutates no foreign-owner
 * state and writes nothing else. The record is an authored Diplomacy fact, not a conclusion derived from another owner's mutable
 * state, so the group reads and depends on nothing: no dependency is invented. The kind is ADVANCING; NO post-establishment
 * change exists yet (rupture, suspension, restoration, retirement or any lifecycle transition), so every write to a relation
 * edge other than its first creation is refused here as not supported, and a second creation of an occupied slot is refused by
 * the store's version chain.
 *
 * A retry of the same intent is reconciled by the store by identity (RC-16).
 */
export function diplomacyGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  if (group.writes.length === 1) {
    const w = group.writes[0]!;
    if (resolveKey(w.key)?.kind.id === "diplomacy_external_recognition") {
      if (w.expected_version !== 0) {
        return reject(
          "AMENDMENT_NOT_SUPPORTED",
          "an External Recognition is created once; no status change, withdrawal, suspension, supersession, succession, dependency-driven re-resolution or retirement is implemented",
          { key: w.key },
        );
      }
      return checkRecognition(group, state, w);
    }
    if (resolveKey(w.key)?.kind.id === "diplomacy_claim_dispute") {
      if (w.expected_version !== 0) {
        return reject(
          "AMENDMENT_NOT_SUPPORTED",
          "an Externalized Claim / Dispute is created once; no status change, new or changed communicated position, remedy change, interpretation or adjudication update, effect resolution, dependency-driven re-resolution, conversion, merger, settlement, retirement or deletion is implemented",
          { key: w.key },
        );
      }
      return checkDispute(group, state, w);
    }
    if (resolveKey(w.key)?.kind.id === "diplomacy_relation_edge") {
      if (w.expected_version !== 0) {
        return reject(
          "AMENDMENT_NOT_SUPPORTED",
          "a Relation Edge is created once; no rupture, suspension, restoration, retirement or other lifecycle change is implemented",
          { key: w.key },
        );
      }
      return checkRelationEdge(group, w);
    }
  }
  return reject(
    "VALUE_INVALID",
    "Diplomacy state changes only by one External Recognition, one Externalized Claim / Dispute or one Relation Edge establishment, each created once",
  );
}

type Write = CommitGroup["writes"][number];

function checkRecognition(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = ExternalRecognitionSchema.safeParse(w.value);
  if (!parsed.success) {
    return reject("VALUE_INVALID", "the External Recognition violates its contract", {
      key: w.key,
    });
  }
  const recognition = parsed.data;
  if (!canonicalEqual(group.rule, DIPLOMACY_RECOGNITION_RULE)) {
    return reject(
      "REFERENCE_INVALID",
      "an External Recognition is committed under the governing-rule citation of its kind",
      { key: w.key },
    );
  }
  if (w.key !== diplomacyRecognitionKey(recognition.recognition_id)) {
    return reject(
      "REFERENCE_INVALID",
      "an External Recognition is at the key derived from its exact recognition_id",
      { key: w.key },
    );
  }
  return checkDependencyPins(
    group,
    state,
    w,
    recognitionDependencyKeys(recognition),
    "an External Recognition",
  );
}

function checkDispute(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = ExternalizedClaimDisputeSchema.safeParse(w.value);
  if (!parsed.success) {
    return reject("VALUE_INVALID", "the Externalized Claim / Dispute violates its contract", {
      key: w.key,
    });
  }
  const dispute = parsed.data;
  if (!canonicalEqual(group.rule, DIPLOMACY_CLAIM_DISPUTE_RULE)) {
    return reject(
      "REFERENCE_INVALID",
      "an Externalized Claim / Dispute is committed under the governing-rule citation of its kind",
      { key: w.key },
    );
  }
  if (w.key !== diplomacyDisputeKey(dispute.dispute_id)) {
    return reject(
      "REFERENCE_INVALID",
      "an Externalized Claim / Dispute is at the key derived from its exact dispute_id",
      { key: w.key },
    );
  }
  return checkDependencyPins(
    group,
    state,
    w,
    disputeDependencyKeys(dispute),
    "an Externalized Claim / Dispute",
  );
}

function checkRelationEdge(group: CommitGroup, w: Write): Rejection | null {
  const parsed = RelationEdgeSchema.safeParse(w.value);
  if (!parsed.success) {
    return reject("VALUE_INVALID", "the Relation Edge violates its contract", { key: w.key });
  }
  const edge = parsed.data;
  if (!canonicalEqual(group.rule, DIPLOMACY_RELATION_EDGE_RULE)) {
    return reject(
      "REFERENCE_INVALID",
      "a Relation Edge is committed under the governing-rule citation of its kind",
      { key: w.key },
    );
  }
  if (w.key !== diplomacyRelationKey(edge.relation_id)) {
    return reject(
      "REFERENCE_INVALID",
      "a Relation Edge is at the key derived from its exact relation_id",
      { key: w.key },
    );
  }
  // an authored Diplomacy fact, not a conclusion derived from another owner's mutable state: nothing is read or depended on
  if (group.reads.length !== 0 || group.depends_on.length !== 0) {
    return reject(
      "REFERENCE_INVALID",
      "a Relation Edge is an authored fact: it reads and depends on nothing, so no dependency is invented",
      { key: w.key },
    );
  }
  return null;
}

/**
 * WS-008 §29.3: the registered dependencies are exactly the facts the record names, each pinned by exact key. A baseline record
 * with no `dependency_refs[]` reads and depends on nothing, so no dependency is invented.
 */
function checkDependencyPins(
  group: CommitGroup,
  state: CampaignState,
  w: Write,
  keys: readonly string[],
  what: string,
): Rejection | null {
  const committedBy = new Set<string>();
  for (const key of keys) {
    const pinned = requirePrerequisite(
      group,
      state,
      key,
      "the mutable owner state a dependency_refs[] entry names",
    );
    if (isRejection(pinned)) return pinned;
    committedBy.add(pinned.fact.provenance.group_id);
  }
  if (
    group.reads.length !== keys.length ||
    group.depends_on.length !== committedBy.size ||
    !group.depends_on.every((d) => committedBy.has(d))
  ) {
    return reject(
      "REFERENCE_INVALID",
      `${what} reads and depends on exactly the committed facts its dependency_refs[] names and nothing else; a baseline record with none reads and depends on nothing`,
      { key: w.key },
    );
  }
  return null;
}
