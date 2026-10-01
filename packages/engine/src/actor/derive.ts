import {
  ACTOR_PROFILE_CAPABILITY_CLOSE,
  OWNER_NAMED_ACTOR,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  actorCapabilityBasisKey,
  actorCapabilityStage,
  fail,
  ok,
  pcExistenceContractKey,
  populationLedgerKey,
  type NamedActorCapability,
  type NamedActorCapabilityBasis,
  type OwnerFact,
  type Result,
} from "@immortalis/contracts";

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
 *    belongs to the PC owner (no PC capability is implemented here), so the actor owner must not author it;
 *  - the identity the Role Registry binding currently names as the active PC is under lawful player control;
 *  - an identity that is a Population ledger's own is an aggregate, which is never given an individual mastery sheet.
 *
 * Returns a message, or null when the identity is a lawful Named-Actor subject as far as committed facts show.
 */
export function actorBoundaryViolation(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">,
  actorId: string,
): string | null {
  if (facts.has(pcExistenceContractKey(actorId))) {
    return "the identity is a Player Character: its capability belongs to the PC owner, the Named-Actor owner authors nothing for it";
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

/** The sources a basis may cite as causes: foreign, committed, never the capability's own owner or the kernel. */
export function causeOwnerViolation(owner: string): string | null {
  if (owner === OWNER_NAMED_ACTOR) {
    return "a cause is a foreign fact, referenced and never the capability's own state";
  }
  if (owner === "temporal_kernel") {
    return "kernel coordination state is no causal input to a mastery";
  }
  return null;
}
