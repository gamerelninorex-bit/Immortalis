import {
  ExistingActorCouplingSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  OWNER_WORLD_STATE,
  WorldLocusSchema,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type ExistingActorCoupling,
  type ExistingActorCouplingTarget,
  type OwnerFact,
} from "@immortalis/contracts";
import { actorBoundaryViolation, existingActorSourceViolation } from "../actor/derive.ts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { couplingPlacementViolation } from "./actor-presence.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";

/**
 * The Existing-Actor World-State Coupling Anchor (IM-03; WG "Ownership Guards — F-016 Ratified Fallback Objective
 * Physical-Entity Custody"; WS-006 / F-014A v3.3 §6 Two-Target Write Rule; IR §5 item 3 and §17; PC-Control Handover
 * Contract v1 "Single Commit Point").
 *
 * The World-State fallback custodian's ONE authoritative statement that an already-existing, lawfully non-PC actor is
 * currently coupled to one established locus of one established world. It is a prerequisite a later Existing-Actor → PC
 * handover may read; it is no insertion and no handover. Nothing here writes the Role Registry binding, an Existence
 * Contract, a Named-Actor or PC capability fact, or moves any ownership: before the binding commit "the current owner
 * remains writable", and creating the coupling closes no owner (the Named-Actor boundary, `actorBoundaryViolation`, is
 * consulted here and never changed).
 *
 * It is not a Production durable: it has its own fact kind, no completion envelope, no acceptance stage and no
 * conserved quantity or condition. It is not a transition either: the sealed, create-only slot per ACTOR IDENTITY is what
 * guarantees one authoritative current locus (a second coupling is a version conflict, never a sibling truth).
 */

/**
 * The coupling a target determines, given the current committed versions of the world profile and locus it will be
 * established against. Pure and mechanical: the caller names identities and the actor-state pins; every other field is a
 * fixed encoding (the custodian) or a version read from committed state. Nothing is inferred, defaulted or player-authored.
 */
export function deriveExistingActorCoupling(
  target: ExistingActorCouplingTarget,
  versionOf: (key: string) => number,
): ExistingActorCoupling {
  const worldKey = worldProfileKey(target.world_id);
  const locusKey = worldLocusKey(target.world_id, target.locus_id);
  return {
    actor_id: target.actor_id,
    actor_state: target.actor_state.map((s) => ({ ...s })),
    coupling: {
      world: { fact_key: worldKey, entity_id: target.world_id },
      locus: { fact_key: locusKey, entity_id: target.locus_id },
    },
    pinned_versions: { world: versionOf(worldKey), locus: versionOf(locusKey) },
    custodian: {
      owner: OWNER_WORLD_STATE,
      facet: FACET_WORLD_FALLBACK_ENTITY,
      basis: FALLBACK_BASIS,
    },
  };
}

/**
 * The single statement of what a coupling must be, given the committed facts it is judged against (used by admission when
 * the fact is written and again by load verification, against the facts as they stood BEFORE it, so the two cannot
 * drift). It judges identity, ownership and provenance only:
 *
 *  - the fact is at the slot derived from its actor identity (one slot per actor across every world);
 *  - the actor is ALREADY lawfully established as a non-PC actor: it passes the one Named-Actor boundary (no fresh PC
 *    contract, not the bound PC, not a Population aggregate) and every pinned source is its OWN committed Named-Actor
 *    state, owned by the Named-Actor owner, at exactly the version pinned (the same statement the existing-actor
 *    compilation uses), so no other actor's, owner's or kind's state is a source and a fresh PC, which has none, cannot be coupled;
 *  - the world and the locus exist, are the facts the references name at exactly the versions pinned, and the locus
 *    belongs to that world (its own committed reference, not the caller's word).
 *
 * Returns a message, or null when the coupling holds.
 */
export function existingActorCouplingViolation(
  key: string,
  c: ExistingActorCoupling,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">,
): string | null {
  if (key !== worldActorCouplingKey(c.actor_id)) {
    return "a coupling is at the slot derived from its actor identity";
  }
  const worldKey = worldProfileKey(c.coupling.world.entity_id);
  const locusKey = worldLocusKey(c.coupling.world.entity_id, c.coupling.locus.entity_id);
  if (c.coupling.world.fact_key !== worldKey || c.coupling.locus.fact_key !== locusKey) {
    return "coupling references do not match their key identities";
  }
  const boundary = actorBoundaryViolation(facts, c.actor_id);
  if (boundary) return `the actor is not an existing non-PC actor: ${boundary}`;
  const source = existingActorSourceViolation(c.actor_id, c.actor_state, facts);
  if (source) return source;
  const world = facts.get(worldKey);
  const locus = facts.get(locusKey);
  if (!world || !locus) return "the coupled world and locus are committed";
  if (world.version !== c.pinned_versions.world || locus.version !== c.pinned_versions.locus) {
    return "the coupling was not established against the committed world and locus versions";
  }
  const committed = WorldLocusSchema.safeParse(locus.value);
  if (!committed.success || !canonicalEqual(committed.data.world, c.coupling.world)) {
    return "the locus does not belong to the world being coupled";
  }
  // R1: a coupling is provenance, never a second locator: it agrees with the actor's committed setup placement or presence
  return couplingPlacementViolation(c.actor_id, c.coupling, facts);
}

/**
 * What must still hold of the CURRENT committed state, whatever the commit order: the coupled identity is no Player
 * Character other than by the explicit existing-actor compilation (a fresh Existence Contract for it, or a binding that
 * names it, would be a rival owner and a second authoritative current locus). Admission cannot see a later write, so the
 * Existence Contract admission refuses a fresh contract for a coupled identity and load verification applies this check.
 */
export function couplingActorStillNonPcViolation(
  actorId: string,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">,
): string | null {
  const boundary = actorBoundaryViolation(facts, actorId);
  return boundary ? `the coupled actor is no longer an existing non-PC actor: ${boundary}` : null;
}

/**
 * IM-11 admission of one coupling (the custodian's fact kind beside the accepted entity and its transition). It writes
 * exactly one fact, reads and depends on each foreign fact it references at its current version (the actor's own state,
 * the world, the locus: never copied), and re-derives the rule above, so Named-Actor, Production, a consumer or a raw
 * `store.commit` cannot create a rival, a copy, a coupling of a PC or a coupling of an actor that does not already exist.
 */
export function worldActorCouplingGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  if (group.writes.length !== 1) {
    return reject("VALUE_INVALID", "one coupling anchors exactly one actor to one locus");
  }
  const w = group.writes[0]!;
  const c = ExistingActorCouplingSchema.parse(w.value);
  // dependency direction: the actor's own state, then the world, then the locus that hangs off it
  for (const pin of c.actor_state) {
    const source = requirePrerequisite(group, state, pin.fact_key, "the existing actor's state");
    if (isRejection(source)) return source;
  }
  const world = requirePrerequisite(group, state, c.coupling.world.fact_key, "the world profile");
  if (isRejection(world)) return world;
  const locus = requirePrerequisite(group, state, c.coupling.locus.fact_key, "the world locus");
  if (isRejection(locus)) return locus;
  const violation = existingActorCouplingViolation(w.key, c, state.facts);
  return violation ? reject("REFERENCE_INVALID", violation, { key: w.key }) : null;
}
