import { z } from "zod";
import { Version } from "./ids.ts";
import { FALLBACK_BASIS, FACET_WORLD_FALLBACK_ENTITY } from "./production.ts";
import {
  EXISTING_ACTOR_HANDOVER,
  EntityId,
  FactRefSchema,
  OWNER_WORLD_STATE,
} from "./world-foundation.ts";

/**
 * Active-PC Post-Handover Physical Locus Custody Foundation — executable contract.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   Active-PC Post-Handover Physical Locus Ownership & Relocation Contract (Blue bounded design resolution, Sovereign
 *                                       frozen pin 2026-10-08T01:25:36.611Z) §4 ownership matrix, §5 Role Registry locus
 *                                       semantics, §6 post-handover actor coupling, §7 mutable physical-locus owner,
 *                                       §9 rival-current-locus invariant, §13 persistence and custody
 *   WG World Generation & World-State Kernel  Ownership Guards — F-016 Ratified Fallback Objective Physical-Entity
 *                                       Custody (World-State is the fallback custodian of objective physical/entity
 *                                       facts where no more-specific owner exists)
 *   WS-006 / F-014A v3.3 §6 Two-Target Write Rule; IR Player–World Insertion §5 item 3 and §17; I-002 §4.3 (position and
 *                                       other world-locus differences are not I-002 state)
 *
 * ONE fact is represented: the authoritative STATIONARY current physical locus of the ONE active Player Character,
 * established immediately after the already-completed Existing-Actor → PC handover, at the locus the handover's
 * consumed World-State coupling committed. It is keyed to the canonical continuing PC identity (the same identity the
 * Existence Contract, the binding and the consumed coupling carry); no second PC identity exists.
 *
 * What it is NOT: it is not the Role Registry binding (whose `coupling.world` / `coupling.locus` stay a binding-time
 * referent only and are never read as the PC's current locus), not the consumed `world_actor_coupling` (immutable handover
 * provenance, never rewritten), not a Production-accepted fallback physical entity, and not movement of any kind. Every
 * schema is strict, which is also the structural half of the exclusions: there is no field in which a movement, a
 * request, a destination, a route, a duration, a transfer, an in-transfer state, a holder, an inventory item or a second
 * locus could be stated (IA-02). Foreign state is REFERENCED by exact pin, never copied (RC-02 guard). Identifiers,
 * owner/facet names and literals the sources do not prescribe are technical encodings.
 *
 * One current locus is ONE truth: the fact lives at a single slot per PC identity, create-only (SEALED), so a second
 * custody record for the same PC is a version conflict, never a rival sibling. Relocation needs a successor mechanism
 * this slice deliberately does not invent.
 */

/**
 * The World-State key of one active PC's physical-locus custody. One slot per PC identity across every world, in a key
 * space disjoint from the entity, transition, actor-coupling, Named-Actor and PC key spaces.
 */
export const worldPcLocusCustodyKey = (pcId: string): string =>
  `world-state/pc/${pcId}/locus-custody`;

export const PcPhysicalLocusCustodySchema = z.strictObject({
  /** the canonical continuing PC identity: identical in this fact, its key, the binding and the consumed coupling */
  pc_id: EntityId,
  /**
   * The ONE authoritative stationary current physical locus of the PC: the established world and the established locus
   * of that world, by reference. Derived only from the consumed coupling's locus, never from the binding's referent.
   */
  stationary_locus: z.strictObject({ world: FactRefSchema, locus: FactRefSchema }),
  /** the provenance of the establishment: the completed handover and the exact committed basis it consumed */
  basis: z.strictObject({
    established_from: z.literal(EXISTING_ACTOR_HANDOVER),
    /**
     * The exact committed versions this record was established against: the PC's released compilation contract, the
     * operative binding (the completed handover), the consumed actor coupling and the coupling's world and locus.
     * Admission requires each to equal the current version of a committed fact, so a committed record never carries 0.
     */
    pinned_versions: z.strictObject({
      pc: Version,
      binding: Version,
      coupling: Version,
      world: Version,
      locus: Version,
    }),
  }),
  /** the committing custodian: World-State, as fallback only where no more-specific owner of the fact exists */
  custodian: z.strictObject({
    owner: z.literal(OWNER_WORLD_STATE),
    facet: z.literal(FACET_WORLD_FALLBACK_ENTITY),
    basis: z.literal(FALLBACK_BASIS),
  }),
});
export type PcPhysicalLocusCustody = z.infer<typeof PcPhysicalLocusCustodySchema>;

/** What an establishment names: the canonical PC identity only. Everything else is read from committed state. */
export const PcPhysicalLocusCustodyTargetSchema = z.strictObject({ pc_id: EntityId });
export type PcPhysicalLocusCustodyTarget = z.infer<typeof PcPhysicalLocusCustodyTargetSchema>;
