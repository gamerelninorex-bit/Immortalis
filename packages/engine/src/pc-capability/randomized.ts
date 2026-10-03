import {
  CAUSAL_DRAW_ALGORITHM_ID,
  CausalDrawPrecommitSchema,
  CausalDrawResultSchema,
  OWNER_PC_EXISTENCE,
  PC_CAPABILITY_ESTABLISHMENT_OPPORTUNITY,
  PC_OPERATION_ESTABLISH_CAPABILITY_BASIS,
  PC_ESTABLISHMENT_EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED,
  capabilityCandidateId,
  causalDrawId,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultKey,
  namedActorCapabilityDrawKey,
  parseCapabilityCandidateId,
  pcCapabilityDrawKey,
  type CausalDrawInputRef,
  type CausalDrawSpecification,
  type OwnerFact,
  type PcCapabilityBasis,
  type PcExistingActorBoundedPriorRandomizedEstablishment,
  type PcExistingActorRandomizedEstablishmentInput,
} from "@immortalis/contracts";
import { cdDigest } from "../causal-draw/canon.ts";
import type { OwnerRuleAuthority, SubstantiveSlotInspector } from "../causal-draw/ports.ts";
import { canonicalEqual } from "../hash.ts";
import { PC_CAPABILITY_RULE, resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";

/**
 * The PC side of the two typed boundaries the Causal Draw layer asks across (F-027-CD1 §3, CDR-01 step 4, CAL-08), the one
 * pure construction of the PC owner's prior, and the one statement of what a randomized world-prior basis must be. Narrow by
 * design: each answers only about the PC capability-basis slot, by identity, and none is a general authority or registry
 * (IM-01 is not implemented, and nothing here pretends to be it). The shape follows the Named-Actor consumer
 * (`actor/randomized.ts`) because it is the same CD-CC-01 contract, owned here by I-002 for an actor already handed over.
 */

/** The PC and capability whose capability-basis slot `key` names, or null when it is no such slot. */
function basisSlotOf(key: string): { pcId: string; capabilityId: string } | null {
  const resolved = resolveKey(key);
  if (resolved?.kind.id !== "pc_capability_basis") return null;
  const [pcId, capabilityId] = resolved.ids;
  return pcId && capabilityId ? { pcId, capabilityId } : null;
}

/** `draw_key_digest` of the one Causal Draw that may fix this PC/capability's basis slot. */
export const pcCapabilityDrawDigest = (pcId: string, capabilityId: string): string =>
  cdDigest(pcCapabilityDrawKey(pcId, capabilityId));

/**
 * Whether Causal Draw evidence already exists for this PC/capability's basis slot. Once it does, the slot can be filled only
 * by the establishment that reads that draw: no deterministic, carried or generated basis can sidestep a committed draw
 * (F-027-CD1 CDR-01 step 4: an independently established result while a precommit exists is a conflict).
 */
export function pcCapabilityDrawStateExists(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "has">,
  pcId: string,
  capabilityId: string,
): boolean {
  const digest = pcCapabilityDrawDigest(pcId, capabilityId);
  return facts.has(causalDrawPrecommitKey(digest)) || facts.has(causalDrawResultKey(digest));
}

/**
 * Whether the PREDECESSOR Named-Actor owner already began a Causal Draw for this identity's capability slot. A draw the actor
 * owner began but whose establishment never closed before the cutover fixed the question once: it is cold provenance and is
 * neither re-opened nor re-drawn by the PC owner (recovering an interrupted pre-handover establishment across the cutover is
 * not implemented).
 */
export function predecessorActorDrawStateExists(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "has">,
  pcId: string,
  capabilityId: string,
): boolean {
  const digest = cdDigest(namedActorCapabilityDrawKey(pcId, capabilityId));
  return facts.has(causalDrawPrecommitKey(digest)) || facts.has(causalDrawResultKey(digest));
}

export type PcRandomizedBasis = PcCapabilityBasis & {
  readonly establishment: PcExistingActorBoundedPriorRandomizedEstablishment;
};

export const isPcRandomizedBasis = (b: PcCapabilityBasis): b is PcRandomizedBasis =>
  b.establishment.method === PC_ESTABLISHMENT_EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED;

/**
 * IM-03 typed-owner interface (CDR-01 step 4): whether the capability basis of a PC is already authoritatively established.
 * Read by identity (one `getFact`), never a scan; it reports where the slot was established and judges nothing — lawful
 * linkage to a draw is the Causal Draw kernel's own rule over the establishing group. A slot that is no PC capability-basis
 * slot is not established by this owner, whatever else is asked about it.
 */
export const pcSlotInspector = (store: CampaignStore): SubstantiveSlotInspector => ({
  inspectResultSlot({ owner_operation, prospective_result_id }) {
    if (
      owner_operation.owner !== OWNER_PC_EXISTENCE ||
      basisSlotOf(prospective_result_id) === null
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
 * CAL-08 owner-rule seam at precommit publication: a prior is created under the PC owner's governing rule — the one pinned in
 * the registry — and only for the stable draw of a PC capability-basis slot, by the PC establishment operation. A prior citing
 * any other rule, operation, process, opportunity or result slot was not defined by this owner and is stale/ineffective for
 * the creation of this prior.
 */
export const pcRuleAuthority: OwnerRuleAuthority = {
  isEffectiveForPriorCreation(rule, drawKey) {
    if (!canonicalEqual(rule, PC_CAPABILITY_RULE)) return false;
    if (
      drawKey.owner_operation.owner !== OWNER_PC_EXISTENCE ||
      drawKey.owner_operation.operation !== PC_OPERATION_ESTABLISH_CAPABILITY_BASIS ||
      drawKey.opportunity_id !== PC_CAPABILITY_ESTABLISHMENT_OPPORTUNITY
    ) {
      return false;
    }
    const slot = basisSlotOf(drawKey.prospective_result_id);
    return (
      slot !== null && canonicalEqual(drawKey, pcCapabilityDrawKey(slot.pcId, slot.capabilityId))
    );
  },
};

/**
 * The owner's bounded prior as a Causal Draw specification (CDS-01): the stable draw key of the slot, the owner's rule, the
 * pinned causes as the exact inputs, and one opaque candidate per lawful possibility with the owner-authored relative weight.
 * Nothing is added, removed, defaulted or rescaled here (normalization is the draw layer's CDS-02); a prior the owner did not
 * author — absent, empty or singleton — reaches the draw gate as exactly that and is refused there.
 */
export function pcCapabilityDrawSpecification(
  input: PcExistingActorRandomizedEstablishmentInput,
  inputRefs: readonly CausalDrawInputRef[],
): CausalDrawSpecification {
  return {
    draw_key: pcCapabilityDrawKey(input.pc_id, input.capability_id),
    owner_rule_ref: PC_CAPABILITY_RULE,
    input_refs: [...inputRefs],
    candidates: input.prior.map((p) => ({
      candidate_id: capabilityCandidateId(p.marker),
      weight: p.weight,
    })),
    algorithm_id: CAUSAL_DRAW_ALGORITHM_ID,
  };
}

/**
 * The single statement of what a randomized world-prior basis must be, given the committed Causal Draw evidence: the draw is
 * the one stable draw of THIS PC/capability slot, its prior is the PC owner's (owner rule, the pinned causes as the exact
 * inputs, every candidate a lawful marker in the Character Capability encoding), and the marker is exactly the owner's reading
 * of the candidate the committed result selected. Used by the owner operation, IM-11 admission and load verification, so the
 * three cannot drift. Returns a message, or null.
 *
 * It judges structure and provenance only. Whether the causes warrant a given possibility — the §17 rarity guard, the
 * sparse-evidence rule — is the owner's authoring judgment, exactly as for a causally determined basis: no source supplies a
 * rule from causes to weights, and the engine does not invent one.
 */
export function pcRandomizedEstablishmentViolation(
  basis: PcRandomizedBasis,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): string | null {
  const digest = pcCapabilityDrawDigest(basis.pc_id, basis.capability_id);
  const draw = basis.establishment.draw;
  if (draw.draw_id !== causalDrawId(digest)) {
    return "the draw is not the stable Causal Draw of this PC and capability";
  }
  if (draw.result.fact_key !== causalDrawResultKey(digest)) {
    return "the draw result is read at the key its draw identity derives";
  }
  const resultFact = facts.get(draw.result.fact_key);
  const result = resultFact ? CausalDrawResultSchema.safeParse(resultFact.value) : undefined;
  if (!resultFact || !result?.success) return "the Causal Draw result is not committed";
  if (resultFact.version !== draw.result.version) {
    return "the establishment reads the committed Causal Draw result at its exact version";
  }
  if (resultFact.provenance.group_id !== causalDrawResultGroupId(digest)) {
    return "the Causal Draw result was not committed under its canonical result group";
  }
  const precommitFact = facts.get(causalDrawPrecommitKey(digest));
  const precommit = precommitFact
    ? CausalDrawPrecommitSchema.safeParse(precommitFact.value)
    : undefined;
  if (!precommit?.success) return "the Causal Draw precommit is not committed";
  const p = precommit.data;
  if (result.data.draw_id !== draw.draw_id || result.data.spec_digest !== p.spec_digest) {
    return "the Causal Draw result and precommit describe different draws";
  }
  const spec = p.normalized_spec;
  if (!canonicalEqual(spec.draw_key, pcCapabilityDrawKey(basis.pc_id, basis.capability_id))) {
    return "the prior was not defined by the PC establishment operation for this PC and capability";
  }
  if (!canonicalEqual(spec.owner_rule_ref, PC_CAPABILITY_RULE)) {
    return "the prior was not defined under the PC owner's governing rule";
  }
  const pin = (r: { owner: string; fact_key: string; version: number }) =>
    `${r.owner}\u0000${r.fact_key}\u0000${r.version}`;
  const causes = new Set(basis.establishment.causes.map(pin));
  const inputs = new Set(spec.input_refs.map(pin));
  if (causes.size !== inputs.size || [...causes].some((c) => !inputs.has(c))) {
    return "the prior was computed from exactly the pinned causes";
  }
  if (spec.candidates.some((c) => parseCapabilityCandidateId(c.candidate_id) === undefined)) {
    return "every candidate of the prior is a lawful Character Capability possibility";
  }
  const selected = parseCapabilityCandidateId(result.data.selected_candidate_id);
  if (
    !selected ||
    !spec.candidates.some((c) => c.candidate_id === result.data.selected_candidate_id)
  ) {
    return "the selected candidate is not a possibility of the prior";
  }
  if (!canonicalEqual(selected.marker, basis.marker)) {
    return "the marker is exactly the owner's reading of the candidate the committed draw selected";
  }
  return null;
}
