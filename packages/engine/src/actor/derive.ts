import {
  ACTOR_PROFILE_CAPABILITY_CLOSE,
  CausalDrawPrecommitSchema,
  CausalDrawResultSchema,
  ExistenceContractSchema,
  OWNER_CAUSAL_DRAW_KERNEL,
  OWNER_NAMED_ACTOR,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  actorCapabilityBasisKey,
  actorCapabilityStage,
  causalDrawId,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultKey,
  fail,
  namedActorCapabilityDrawKey,
  ok,
  parseCapabilityCandidateId,
  pcExistenceContractKey,
  populationLedgerKey,
  type BoundedPriorRandomizedEstablishment,
  type ExistingActorSourcePin,
  type NamedActorCapability,
  type NamedActorCapabilityBasis,
  type OwnerFact,
  type Result,
} from "@immortalis/contracts";
import { cdDigest } from "../causal-draw/canon.ts";
import { canonicalEqual } from "../hash.ts";
import { NAMED_ACTOR_RULE, resolveKey } from "../owners/registry.ts";

/**
 * Pure derivations of the Named-Actor capability path (WS-016 §3, §16, §27.1; WS-006 / F-014A v3.3 and the W3-CP3
 * PC-Control Handover note). Each is the single statement of its rule: the owner operation computes with it and IM-11
 * admission and load-time verification re-derive with it, so a committed capability is exactly what its committed
 * establishment basis determines, and nothing else.
 *
 * They invent nothing: no numeric value, rank, default grade, roll, prior or aggregate conversion. The grade is
 * authored in the basis; the capability only transcribes it, adds the provenance pointer and names the close.
 */

/** A committed fact read by identity: its key, the owner that wrote it, the version it was read at and its value. */
export interface ActorFact<T> {
  readonly key: string;
  readonly owner: string;
  readonly version: number;
  readonly value: T;
}

/** The capability this basis determines, published at the actor owner's declared capability close (WS-016 §27.1). */
export function deriveCapability(
  basis: ActorFact<NamedActorCapabilityBasis>,
): Result<NamedActorCapability> {
  const b = basis.value;
  if (basis.owner !== OWNER_NAMED_ACTOR) {
    return fail("BASIS_INVALID", "the establishment basis is the Named-Actor owner's own fact");
  }
  if (basis.key !== actorCapabilityBasisKey(b.actor_id, b.capability_id)) {
    return fail("BASIS_INVALID", "the basis is at the key derived from its actor and capability");
  }
  return ok({
    actor_id: b.actor_id,
    capability_id: b.capability_id,
    marker: b.marker,
    basis: { fact_key: basis.key, version: basis.version },
    close: {
      name: ACTOR_PROFILE_CAPABILITY_CLOSE,
      stage: actorCapabilityStage(b.actor_id, b.capability_id),
    },
  });
}

/**
 * The PC-authorship and aggregate-identity boundary of one actor identity (WS-006 W3-CP3: "F-014A remains writable
 * only while the entity is under lawful non-PC actor ownership"; WS-016 §20/§28: no individual sheet for a population).
 * By identity only — no scan:
 *
 *  - an identity that has an I-002 Existence Contract is a Player Character, never a Named Actor: its capability
 *    belongs to the PC owner (no PC capability is implemented here), so the actor owner must not author it — EXCEPT
 *    the identity whose contract is explicitly classified as the compilation of an already-existing actor
 *    (`existing_actor_compilation`; PC-Control Handover Contract v1 "Single Commit Point": "Before that commit, the
 *    current owner remains writable"). Such a contract is no control cutover: the actor stays under lawful non-PC
 *    ownership until the Role Registry binding commit, which this boundary still honours below. A contract that does not
 *    parse as a released Existence Contract is no exception and fails closed;
 *  - the identity the Role Registry binding currently names as the active PC is under lawful player control;
 *  - an identity that is a Population ledger's own is an aggregate, which is never given an individual mastery sheet.
 *
 * Returns a message, or null when the identity is a lawful Named-Actor subject as far as committed facts show.
 */
export function actorBoundaryViolation(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">,
  actorId: string,
): string | null {
  const contract = facts.get(pcExistenceContractKey(actorId));
  if (contract !== undefined) {
    const parsed = ExistenceContractSchema.safeParse(contract.value);
    if (!parsed.success || parsed.data.existing_actor_compilation === undefined) {
      return "the identity is a Player Character: its capability belongs to the PC owner, the Named-Actor owner authors nothing for it";
    }
  }
  const binding = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const bound = binding ? PlayerCharacterBindingSchema.safeParse(binding.value) : undefined;
  if (bound?.success && bound.data.active_pc.entity_id === actorId) {
    return "the entity is under lawful player-character control: the Named-Actor owner authors no actor-side mastery for it";
  }
  if (facts.has(populationLedgerKey(actorId))) {
    return "the identity is a Population ledger: an aggregate is never given an individual Character Capability record";
  }
  return null;
}

/** The kinds of committed Named-Actor state that identify an already-existing actor as the source of a compilation or coupling. */
const EXISTING_ACTOR_SOURCE_KINDS: ReadonlySet<string> = new Set([
  "named_actor_capability_basis",
  "named_actor_capability",
]);

/**
 * The single statement of what makes committed state the OWN, already-existing, non-PC state of one actor (shared by the
 * existing-actor I-002 compilation and the existing-actor World-State coupling, so the two cannot drift): every pin is a
 * Named-Actor owner fact of an accepted source kind whose key identity is `actorId`, owned by the owner the pin names, and
 * committed at exactly the version pinned. A pin to another actor's state, to the PC owner's, to any other owner's or to
 * another version fails closed. Returns a message, or null when every pin holds.
 */
export function existingActorSourceViolation(
  actorId: string,
  pins: readonly ExistingActorSourcePin[],
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): string | null {
  for (const pin of pins) {
    const resolved = resolveKey(pin.fact_key);
    if (
      !resolved ||
      !EXISTING_ACTOR_SOURCE_KINDS.has(resolved.kind.id) ||
      resolved.kind.owner !== OWNER_NAMED_ACTOR ||
      resolved.ids[0] !== actorId
    ) {
      return `a source is the identified actor's own committed Named-Actor state: ${pin.fact_key}`;
    }
    const fact = facts.get(pin.fact_key);
    if (!fact || fact.owner !== pin.owner || fact.owner !== OWNER_NAMED_ACTOR) {
      return `a source is committed and owned by the Named-Actor owner it names: ${pin.fact_key}`;
    }
    if (fact.version !== pin.version) {
      return `a source is pinned at its exact committed version: ${pin.fact_key}`;
    }
  }
  return null;
}

/** The sources a basis may cite as causes: foreign, committed, never the capability's own owner or the kernel. */
export function causeOwnerViolation(owner: string): string | null {
  if (owner === OWNER_NAMED_ACTOR) {
    return "a cause is a foreign fact, referenced and never the capability's own state";
  }
  if (owner === "temporal_kernel") {
    return "kernel coordination state is no causal input to a mastery";
  }
  if (owner === OWNER_CAUSAL_DRAW_KERNEL) {
    return "Causal Draw provenance is engine-internal evidence, no causal input to a mastery: only a randomized establishment references its own draw";
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The randomized establishment branch (WS-016 §16 steps 3–4; F-027-CD1 CD-CC-01)
// ---------------------------------------------------------------------------------------------

export type RandomizedBasis = NamedActorCapabilityBasis & {
  readonly establishment: BoundedPriorRandomizedEstablishment;
};

export const isRandomizedBasis = (b: NamedActorCapabilityBasis): b is RandomizedBasis =>
  b.establishment.method === "BOUNDED_PRIOR_RANDOMIZED";

/** `draw_key_digest` of the one Causal Draw that may fix this actor/capability's establishment basis. */
export const capabilityDrawDigest = (actorId: string, capabilityId: string): string =>
  cdDigest(namedActorCapabilityDrawKey(actorId, capabilityId));

/**
 * Whether Causal Draw evidence already exists for the establishment slot of this actor/capability. Once it does, the
 * slot can be filled only by the establishment that reads that draw: the deterministic path cannot sidestep a committed
 * draw (F-027-CD1 CDR-01 step 4 "an independently established result while a precommit exists" is a conflict, so the
 * owner refuses to create one).
 */
export function capabilityDrawStateExists(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "has">,
  actorId: string,
  capabilityId: string,
): boolean {
  const digest = capabilityDrawDigest(actorId, capabilityId);
  return facts.has(causalDrawPrecommitKey(digest)) || facts.has(causalDrawResultKey(digest));
}

/**
 * The single statement of what a randomized establishment must be, given the committed Causal Draw evidence: the draw is
 * the one stable draw of THIS actor/capability slot, its prior is the Named-Actor owner's (owner rule, the pinned causes
 * as the exact inputs, every candidate a lawful marker of this owner's meaning), and the marker is exactly the owner's
 * reading of the candidate the committed result selected. Used by the owner operation, IM-11 admission and load
 * verification, so the three cannot drift. Returns a message, or null.
 *
 * It judges structure and provenance only. Whether the causes warrant a given possibility — the §17 rarity guard, the
 * sparse-evidence rule — is the owner's authoring judgment, exactly as for a causally determined basis: no source
 * supplies a rule from causes to weights, and the engine does not invent one.
 */
export function randomizedEstablishmentViolation(
  basis: RandomizedBasis,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): string | null {
  const digest = capabilityDrawDigest(basis.actor_id, basis.capability_id);
  const draw = basis.establishment.draw;
  if (draw.draw_id !== causalDrawId(digest)) {
    return "the draw is not the stable Causal Draw of this actor and capability";
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
  if (
    !canonicalEqual(spec.draw_key, namedActorCapabilityDrawKey(basis.actor_id, basis.capability_id))
  ) {
    return "the prior was not defined by the Named-Actor establishment operation for this actor and capability";
  }
  if (!canonicalEqual(spec.owner_rule_ref, NAMED_ACTOR_RULE)) {
    return "the prior was not defined under the Named-Actor owner's governing rule";
  }
  const pin = (r: { owner: string; fact_key: string; version: number }) =>
    `${r.owner}\u0000${r.fact_key}\u0000${r.version}`;
  const causes = new Set(basis.establishment.causes.map(pin));
  const inputs = new Set(spec.input_refs.map(pin));
  if (causes.size !== inputs.size || [...causes].some((c) => !inputs.has(c))) {
    return "the prior was computed from exactly the pinned causes";
  }
  const markers = spec.candidates.map((c) => parseCapabilityCandidateId(c.candidate_id));
  if (markers.some((m) => m === undefined)) {
    return "every candidate of the prior is a lawful possibility of the Character Capability owner";
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
