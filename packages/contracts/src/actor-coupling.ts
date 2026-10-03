import { z } from "zod";
import { Version } from "./ids.ts";
import { FALLBACK_BASIS, FACET_WORLD_FALLBACK_ENTITY } from "./production.ts";
import {
  EntityId,
  ExistingActorSourcePinSchema,
  FactRefSchema,
  OWNER_WORLD_STATE,
} from "./world-foundation.ts";

/**
 * Existing-Actor World-State Coupling Anchor Foundation — executable contract.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WG World Generation & World-State Kernel  Ownership Guards — F-016 Ratified Fallback Objective Physical-Entity
 *                                       Custody (World-State is the fallback custodian of objective physical/entity
 *                                       facts only where no more-specific authoritative owner exists for the exact
 *                                       fact: "physical/entity identity or reference ... continuity-dependency
 *                                       binding"; "world-side environmental, geographic, topological and other
 *                                       general world-state facts not owned by a more specific subsystem")
 *   WS-006 / F-014A v3.3 §6 Two-Target Write Rule ("physical location ... attach to the true affected entity/domain",
 *                                       never to the actor-side record)
 *   IR Player–World Insertion §5 item 3 ("authoritative world/PC fact already established"), §17 ("world
 *                                       placement/overlap → World owner"); I-002 §4.3 (position and other world-locus
 *                                       differences belong to Insertion/world/runtime owners)
 *   PC-Control Handover Contract v1 (W3-CP3 Blue Repair Overlay) "Single Commit Point" ("Before that commit, the
 *                                       current owner remains writable")
 *
 * ONE fact is represented: the authoritative world-side statement that one already-existing, lawfully non-PC actor is
 * CURRENTLY coupled to one established locus of one established world. It is a PREREQUISITE the later Existing-Actor →
 * PC Role Registry handover may consume (IR §5 item 3). It is not that handover and it is not an insertion: nothing here
 * binds `role.player_character`, closes the Named-Actor owner, moves a capability, or states a player-authored fact.
 *
 * Every schema is strict, which is also the structural half of the exclusions: there is no field in which a PC
 * reference, a bridge, an `ACTIVATION` / insertion basis, a player-authored statement, a capability, a binding mode, a
 * holder, a movement or a second locus could be stated (IA-02). Foreign state is REFERENCED by exact pin, never copied
 * (RC-02 guard). Identifiers, owner/facet names and literals the sources do not prescribe are technical encodings.
 *
 * One current locus is ONE truth: the fact lives at a single slot per ACTOR IDENTITY (not per world), create-only, so a
 * second coupling of the same actor — to another locus or another world — is a version conflict, never a rival
 * sibling. Relocating the actor later needs a successor mechanism this slice deliberately does not invent.
 */

/**
 * The World-State key of one actor's current coupling. One slot per actor identity across every world (so there can
 * never be two authoritative current loci for one actor), and a key space disjoint from the entity, transition,
 * Named-Actor and PC key spaces.
 */
export const worldActorCouplingKey = (actorId: string): string =>
  `world-state/actor/${actorId}/coupling`;

export const ExistingActorCouplingSchema = z
  .strictObject({
    /** the actor's own identity: identical in this fact, its key and every pinned source */
    actor_id: EntityId,
    /**
     * The already-existing actor's own authoritative state this coupling rests on, by exact owner / fact key / version:
     * what establishes that the actor ALREADY EXISTS as a non-PC actor. Referenced, never copied (RC-02). Which kinds and
     * owners may serve, and that each is this actor's own committed state, is verified by admission and load
     * verification (they know the registry); the schema fixes only the shape.
     */
    actor_state: z.array(ExistingActorSourcePinSchema).min(1),
    /** the established world and the established locus of that world the actor is currently coupled to: references */
    coupling: z.strictObject({ world: FactRefSchema, locus: FactRefSchema }),
    /**
     * The exact versions of the committed world profile and locus this coupling was established against. Admission requires
     * each to equal the current version of a committed fact, so a committed coupling never carries version 0 (the same
     * encoding as the binding's `pinned_versions`, which lets a missing prerequisite surface as PREREQUISITE_MISSING).
     */
    pinned_versions: z.strictObject({ world: Version, locus: Version }),
    /** the committing custodian: World-State, as fallback only where no more-specific owner of the fact exists */
    custodian: z.strictObject({
      owner: z.literal(OWNER_WORLD_STATE),
      facet: z.literal(FACET_WORLD_FALLBACK_ENTITY),
      basis: z.literal(FALLBACK_BASIS),
    }),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.actor_state.map((s) => s.fact_key)).size !== c.actor_state.length) {
      ctx.addIssue({
        code: "custom",
        message: "an actor-state source is pinned once",
        path: ["actor_state"],
      });
    }
  });
export type ExistingActorCoupling = z.infer<typeof ExistingActorCouplingSchema>;

/** What a coupling publication names: identities and the actor-state pins. The world/locus are read, never copied. */
export const ExistingActorCouplingTargetSchema = z.strictObject({
  actor_id: EntityId,
  world_id: EntityId,
  locus_id: EntityId,
  actor_state: z.array(ExistingActorSourcePinSchema).min(1),
});
export type ExistingActorCouplingTarget = z.infer<typeof ExistingActorCouplingTargetSchema>;
