import { z } from "zod";
import { Id, Version } from "./ids.ts";
import { FALLBACK_BASIS, FACET_WORLD_FALLBACK_ENTITY } from "./production.ts";
import { CanonicalTimeSchema } from "./temporal.ts";
import {
  EntityId,
  ExistingActorSourcePinSchema,
  FactRefSchema,
  OWNER_WORLD_STATE,
  Text,
} from "./world-foundation.ts";

/**
 * R1 Stage-One v1.1 — First Non-PC Actor Physical Presence Foundation — executable contract.
 *
 * Governing sources (exact pins live in the owner registry): WG World Generation & World-State Kernel, the Sovereign-ratified
 * R1 successor sections "R1 Sovereign-Ratified Successor Amendment — NPC Locus Presence" and "R1 Stage-One v1.1 Sovereign-Ratified
 * Successor — Setup Placement and Exclusive NPC Presence" and the BLUE "R1 Stage-One v1.1 — executable lowering freeze and bounded
 * construction authority" section (all 23 October 2026), composed with Ownership Guards — F-016 Ratified Fallback Objective
 * Physical-Entity Custody and the Temporal (F-014B) R1 physical-presence read.
 *
 * THREE facts are represented, all World-State fallback-custodian facts of one already-existing, non-PC Named Actor:
 *
 *  - B1 `actor_setup_placement`: an independently authored setup statement that places the actor at one world locus. It is
 *    inert setup EVIDENCE: it asserts no custody and no presence, and it carries no `custodian`.
 *  - `world_setup_closure`: the once-per-world closed, sorted, complete inventory of that world's B1 records.
 *  - B2 `actor_physical_presence`: the ONE first current physical locus record of the actor, an ADVANCING kind restricted in
 *    stage one to its initial version; it is derived from a B1 listed by a closure and a Temporal canonical time read from the
 *    committed Temporal state before it.
 *
 * Every schema is strict, which is also the structural half of the exclusions: there is no field in which a movement, a
 * successor, a second locus, a sensory faculty, an orientation, a viewpoint, a Health condition or a player-authored claim could
 * be stated. Foreign state is REFERENCED by exact pin, never copied. Identifiers and literals the sources do not prescribe are
 * technical encodings.
 */

/** B1: one slot per actor identity across every world, create-only. */
export const actorSetupPlacementKey = (actorId: string): string =>
  `world-state/actor/${actorId}/setup-placement`;

/** The once-per-world closure. */
export const worldSetupClosureKey = (worldId: string): string => `world/${worldId}/setup-closure`;

/** B2: ONE logical current key per actor identity across every world (not per world, not an owner-slot suffix). */
export const actorPhysicalPresenceKey = (actorId: string): string =>
  `world-state/actor/${actorId}/presence`;

/** The fixed initial non-PC custody epoch of a first presence record. */
export const NON_PC_INITIAL = "NON_PC_INITIAL" as const;

export const ActorSetupPlacementSchema = z.strictObject({
  /** the actor's own identity: identical in this fact, its key and every pinned source */
  actor_id: EntityId,
  /** the established world and the established locus of that world the setup statement places the actor at: references */
  world: FactRefSchema,
  locus: FactRefSchema,
  /**
   * The actor's own committed, source-qualified `named_actor_capability_basis` (never a capability close, which is
   * Temporal-dependent): what establishes that the actor ALREADY EXISTS as a non-PC actor. Referenced, never copied. Which kinds
   * may serve, and that each is this actor's own committed state, is verified by admission and load verification.
   */
  actor_state: z.array(ExistingActorSourcePinSchema).min(1),
  /** the exact committed versions of the world profile and locus this statement was authored against */
  pinned_versions: z.strictObject({ world: Version, locus: Version }),
  /** the independently authored physical-placement statement, exactly as authored */
  statement: Text,
});
export type ActorSetupPlacement = z.infer<typeof ActorSetupPlacementSchema>;

export const SetupPlacementPinSchema = z.strictObject({ fact_key: Id, version: Version.min(1) });
export type SetupPlacementPin = z.infer<typeof SetupPlacementPinSchema>;

export const WorldSetupClosureSchema = z.strictObject({
  world: FactRefSchema,
  /** the complete same-world B1 inventory, canonically sorted by key, each once; an empty inventory is legal */
  placements: z.array(SetupPlacementPinSchema),
});
export type WorldSetupClosure = z.infer<typeof WorldSetupClosureSchema>;

export const ActorPhysicalPresenceSchema = z.strictObject({
  actor_id: EntityId,
  world: FactRefSchema,
  locus: FactRefSchema,
  /** the exact committed versions of the world, locus, B1 and closure this presence was established against */
  pinned_versions: z.strictObject({
    world: Version,
    locus: Version,
    placement: Version,
    closure: Version,
  }),
  /** the Temporal owner's canonical time read from the committed Temporal state before this fact; never caller-authored */
  effective_instant: CanonicalTimeSchema,
  initial_custody: z.literal(NON_PC_INITIAL),
  /** the committing custodian: World-State, as fallback only where no more-specific owner of the fact exists */
  custodian: z.strictObject({
    owner: z.literal(OWNER_WORLD_STATE),
    facet: z.literal(FACET_WORLD_FALLBACK_ENTITY),
    basis: z.literal(FALLBACK_BASIS),
  }),
});
export type ActorPhysicalPresence = z.infer<typeof ActorPhysicalPresenceSchema>;

/** The canonical order of a closure's inventory: ascending by key, code-unit order. */
export const comparePlacementPins = (a: SetupPlacementPin, b: SetupPlacementPin): number =>
  a.fact_key < b.fact_key ? -1 : a.fact_key > b.fact_key ? 1 : 0;
