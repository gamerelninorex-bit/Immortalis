import {
  ExternalRecognitionSchema,
  ExternalizedClaimDisputeSchema,
  RelationEdgeSchema,
  TemporalObjectSchema,
  diplomacyDisputeKey,
  diplomacyRecognitionKey,
  diplomacyRelationKey,
  disputeDependencyKeys,
  recognitionDependencyKeys,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { diplomacyObjectViolation } from "./declaration.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's Diplomacy state still tells one story (IM-12
 * replay/recovery + IM-06). Replay proves the HISTORY is intact and canonical integrity proves each fact's owner, schema, key
 * identity, governing rule and authority; this proves the Diplomacy facts still cohere:
 *
 *  - an External Recognition is at the key its exact `recognition_id` derives, is still its one first version (no transition is
 *    implemented, so a loaded recognition that has moved forward was not made by a lawful path), and was committed by a group
 *    that wrote exactly that one key at expected version zero (so no foreign write, reciprocal record, Relation Edge, Instrument
 *    or sibling recognition was part of it);
 *  - its registered dependency state is intact (WS-008 §29.3): a record with no `dependency_refs[]` was committed reading and
 *    depending on nothing, so no dependency was invented; a record with them was committed reading exactly the facts they name —
 *    each still committed, its pinned version never ahead of the committed one — and depending on groups that committed them,
 *    and a dependency still at its pinned version is the very fact (and committing group) the record was established against.
 *    A dependency that has since advanced is NOT corruption: it is the upstream write that invalidates the conclusion, which
 *    the keyed read reports;
 *  - the same holds for an Externalized Claim / Dispute: it is at the key its exact `dispute_id` derives, is still its one first
 *    version, was committed by one create-only write of its own key (so no underlying claim, foreign fact, Relation Edge,
 *    Instrument, receipt event or sibling dispute was part of it), and its dependency pins are intact exactly as above;
 *  - a Relation Edge is at the key its exact `relation_id` derives, is still its one first version, and was committed by one
 *    create-only write of its own key that read and depended on nothing (so no Recognition, Claim / Dispute, foreign fact, derived
 *    index or sibling edge was part of it, and no dependency was invented);
 *  - its governing-rule provenance is re-checked with every fact by canonical integrity;
 *  - no temporal object declares a Diplomacy stage, close or owned object: Diplomacy has no tick, phase, scheduler, watcher or
 *    polling loop.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyDiplomacyIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) => out.push({ key, code: "DIPLOMACY_STATE", message });
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;

  for (const f of store.listFacts()) {
    if (kindOf(f) === "diplomacy_external_recognition") {
      verifyRecognition(store, f, bad);
    } else if (kindOf(f) === "diplomacy_claim_dispute") {
      verifyDispute(store, f, bad);
    } else if (kindOf(f) === "diplomacy_relation_edge") {
      verifyRelationEdge(store, f, bad);
    } else if (kindOf(f) === "temporal_object") {
      const o = TemporalObjectSchema.safeParse(f.value);
      const violation = o.success ? diplomacyObjectViolation(o.data) : null;
      if (violation) bad(f.key, violation);
    }
  }
  return out;
}

function verifyRecognition(
  store: CampaignStore,
  f: OwnerFact,
  bad: (key: string, message: string) => void,
): void {
  const parsed = ExternalRecognitionSchema.safeParse(f.value);
  if (!parsed.success) return; // canonical integrity reports a value that violates its contract
  const recognition = parsed.data;
  if (f.key !== diplomacyRecognitionKey(recognition.recognition_id)) {
    bad(f.key, "an External Recognition is at the key derived from its exact recognition_id");
    return;
  }
  if (f.version !== 1) {
    bad(
      f.key,
      "no recognition transition is implemented: an External Recognition is still the version it was established as",
    );
    return;
  }
  const group = store.committedGroup(f.provenance.intent_id);
  if (
    !group ||
    group.writes.length !== 1 ||
    group.writes[0]!.key !== f.key ||
    group.writes[0]!.expected_version !== 0
  ) {
    bad(f.key, "an External Recognition was established by one create-only write of its own key");
    return;
  }
  verifyDependencyPins(
    store,
    f,
    group,
    recognitionDependencyKeys(recognition),
    "an External Recognition",
    bad,
  );
}

function verifyDispute(
  store: CampaignStore,
  f: OwnerFact,
  bad: (key: string, message: string) => void,
): void {
  const parsed = ExternalizedClaimDisputeSchema.safeParse(f.value);
  if (!parsed.success) return; // canonical integrity reports a value that violates its contract
  const dispute = parsed.data;
  if (f.key !== diplomacyDisputeKey(dispute.dispute_id)) {
    bad(f.key, "an Externalized Claim / Dispute is at the key derived from its exact dispute_id");
    return;
  }
  if (f.version !== 1) {
    bad(
      f.key,
      "no claim / dispute transition is implemented: an Externalized Claim / Dispute is still the version it was established as",
    );
    return;
  }
  const group = store.committedGroup(f.provenance.intent_id);
  if (
    !group ||
    group.writes.length !== 1 ||
    group.writes[0]!.key !== f.key ||
    group.writes[0]!.expected_version !== 0
  ) {
    bad(
      f.key,
      "an Externalized Claim / Dispute was established by one create-only write of its own key",
    );
    return;
  }
  verifyDependencyPins(
    store,
    f,
    group,
    disputeDependencyKeys(dispute),
    "an Externalized Claim / Dispute",
    bad,
  );
}

function verifyRelationEdge(
  store: CampaignStore,
  f: OwnerFact,
  bad: (key: string, message: string) => void,
): void {
  const parsed = RelationEdgeSchema.safeParse(f.value);
  if (!parsed.success) return; // canonical integrity reports a value that violates its contract
  const edge = parsed.data;
  if (f.key !== diplomacyRelationKey(edge.relation_id)) {
    bad(f.key, "a Relation Edge is at the key derived from its exact relation_id");
    return;
  }
  if (f.version !== 1) {
    bad(
      f.key,
      "no relation edge transition is implemented: a Relation Edge is still the version it was established as",
    );
    return;
  }
  const group = store.committedGroup(f.provenance.intent_id);
  if (
    !group ||
    group.writes.length !== 1 ||
    group.writes[0]!.key !== f.key ||
    group.writes[0]!.expected_version !== 0
  ) {
    bad(f.key, "a Relation Edge was established by one create-only write of its own key");
    return;
  }
  if (group.reads.length !== 0 || group.depends_on.length !== 0) {
    bad(
      f.key,
      "a Relation Edge was established reading and depending on nothing: no dependency is invented",
    );
  }
}

function verifyDependencyPins(
  store: CampaignStore,
  f: OwnerFact,
  group: NonNullable<ReturnType<CampaignStore["committedGroup"]>>,
  keys: readonly string[],
  what: string,
  bad: (key: string, message: string) => void,
): void {
  if (keys.length === 0) {
    if (group.reads.length !== 0 || group.depends_on.length !== 0) {
      bad(
        f.key,
        `${what} with no dependency_refs[] was established reading and depending on nothing: no dependency is invented`,
      );
    }
    return;
  }
  let pinsOk = group.reads.length === keys.length && group.depends_on.length > 0;
  for (const key of keys) {
    const pin = group.reads.find((r) => r.key === key);
    const dependency = store.getFact(key);
    if (!pin || !dependency || pin.version < 1 || pin.version > dependency.version) {
      pinsOk = false;
      break;
    }
    // still at its pinned version: it is the very fact, and committing group, the recognition was established against
    if (
      pin.version === dependency.version &&
      !group.depends_on.includes(dependency.provenance.group_id)
    ) {
      pinsOk = false;
      break;
    }
  }
  if (!pinsOk) {
    bad(
      f.key,
      `${what} with dependency_refs[] was established reading exactly the committed facts they name, at versions no later than committed, and depending on the groups that committed them`,
    );
  }
}
