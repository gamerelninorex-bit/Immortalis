import {
  CAUSAL_DRAW_ALGORITHM_ID,
  NAMED_ACTOR_CAPABILITY_ESTABLISHMENT_OPPORTUNITY,
  NAMED_ACTOR_OPERATION_ESTABLISH_CAPABILITY_BASIS,
  OWNER_NAMED_ACTOR,
  capabilityCandidateId,
  namedActorCapabilityDrawKey,
  type CausalDrawInputRef,
  type CausalDrawSpecification,
  type NamedActorRandomizedEstablishment,
} from "@immortalis/contracts";
import type { OwnerRuleAuthority, SubstantiveSlotInspector } from "../causal-draw/ports.ts";
import { canonicalEqual } from "../hash.ts";
import { NAMED_ACTOR_RULE, resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";

/**
 * The Named-Actor side of the two typed boundaries the Causal Draw layer asks across (F-027-CD1 §3, CDR-01 step 4,
 * CAL-08), plus the one pure construction of the owner's prior. Narrow by design: each answers only about the Named-Actor
 * establishment slot, by identity, and neither is a general authority or registry (IM-01 is not implemented, and nothing
 * here pretends to be it).
 */

/** The actor and capability whose establishment-basis slot `key` names, or null when it is no such slot. */
function establishmentSlotOf(key: string): { actorId: string; capabilityId: string } | null {
  const resolved = resolveKey(key);
  if (resolved?.kind.id !== "named_actor_capability_basis") return null;
  const [actorId, capabilityId] = resolved.ids;
  return actorId && capabilityId ? { actorId, capabilityId } : null;
}

/**
 * IM-03 typed-owner interface (CDR-01 step 4): whether the establishment basis of a Named-Actor capability is already
 * authoritatively established. Read by identity (one `getFact`), never a scan; it reports where the slot was established
 * and judges nothing — lawful linkage to a draw is the Causal Draw kernel's own rule over the establishing group. A slot
 * that is no Named-Actor establishment slot is not established by this owner, whatever else is asked about it.
 */
export const namedActorSlotInspector = (store: CampaignStore): SubstantiveSlotInspector => ({
  inspectResultSlot({ owner_operation, prospective_result_id }) {
    if (
      owner_operation.owner !== OWNER_NAMED_ACTOR ||
      establishmentSlotOf(prospective_result_id) === null
    ) {
      return { established: false };
    }
    const fact = store.getFact(prospective_result_id);
    return fact
      ? { established: true, establishing_intent_id: fact.provenance.intent_id }
      : { established: false };
  },
});

/**
 * CAL-08 owner-rule seam at precommit publication: a prior is created under the Named-Actor owner's governing rule —
 * the rule pinned in the registry at the F-027 spec lock — and only for the stable draw of an establishment slot, by the
 * establishment operation. A prior citing any other rule, operation, process, opportunity or result slot was not defined
 * by this owner and is stale/ineffective for the creation of this prior.
 */
export const namedActorRuleAuthority: OwnerRuleAuthority = {
  isEffectiveForPriorCreation(rule, drawKey) {
    if (!canonicalEqual(rule, NAMED_ACTOR_RULE)) return false;
    if (
      drawKey.owner_operation.owner !== OWNER_NAMED_ACTOR ||
      drawKey.owner_operation.operation !== NAMED_ACTOR_OPERATION_ESTABLISH_CAPABILITY_BASIS ||
      drawKey.opportunity_id !== NAMED_ACTOR_CAPABILITY_ESTABLISHMENT_OPPORTUNITY
    ) {
      return false;
    }
    const slot = establishmentSlotOf(drawKey.prospective_result_id);
    return (
      slot !== null &&
      canonicalEqual(drawKey, namedActorCapabilityDrawKey(slot.actorId, slot.capabilityId))
    );
  },
};

/**
 * The owner's bounded prior as a Causal Draw specification (CDS-01): the stable draw key of the slot, the owner's rule,
 * the pinned causes as the exact inputs, and one opaque candidate per lawful possibility with the owner-authored relative
 * weight. Nothing is added, removed, defaulted or rescaled here (normalization is the draw layer's CDS-02); a prior the
 * owner did not author — absent, empty or singleton — reaches the draw gate as exactly that and is refused there.
 */
export function capabilityDrawSpecification(
  input: NamedActorRandomizedEstablishment,
  inputRefs: readonly CausalDrawInputRef[],
): CausalDrawSpecification {
  return {
    draw_key: namedActorCapabilityDrawKey(input.actor_id, input.capability_id),
    owner_rule_ref: NAMED_ACTOR_RULE,
    input_refs: [...inputRefs],
    candidates: input.prior.map((p) => ({
      candidate_id: capabilityCandidateId(p.marker),
      weight: p.weight,
    })),
    algorithm_id: CAUSAL_DRAW_ALGORITHM_ID,
  };
}
