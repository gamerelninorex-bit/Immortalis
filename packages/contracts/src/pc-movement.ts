import { z } from "zod";
import { Version } from "./ids.ts";
import {
  EntityId,
  FactRefSchema,
  OWNER_PC_EXISTENCE,
  PLAYER_CHOICE_AUTHORITY,
} from "./world-foundation.ts";

/**
 * Active-PC Voluntary Movement Commitment → Single-Leg Physical Relocation Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   Active-PC Post-Handover Physical Locus Ownership & Relocation Contract (Blue bounded design resolution, Sovereign
 *                                       frozen pin 2026-10-08T01:25:36.611Z) §4 ownership matrix (player choice originates
 *                                       voluntary movement only through role.player + permission.player_choice.commit),
 *                                       §8 exact relocation transition, §9 rival-current-locus invariant, §10 Logistics
 *                                       subject admission (request ownership and physical-subject ownership stay separate),
 *                                       §11 ECT-01 compatibility, §14 fail-closed conditions
 *   WS-010 Logistics §3.1 Movement Service Request (an interface envelope held in the REQUESTER's own key space)
 *   I-002 (the current lawful PC-state owner: intrinsic identity/agency; never position, never the movement result)
 *
 * TWO facts are represented, both PC-side and both foreign to Logistics, in the one existing PC owner (`pc_existence`) under
 * a dedicated facet:
 *
 *   1. the PC's voluntary-movement COMMITMENT-OF-RECORD: the player authored willingness to relocate to one already
 *      established lawful locus. It states willingness only. It is not a world-state result, asserts no arrival, route,
 *      duration, cost or success, and is not a Logistics commitment.
 *   2. the PC-owned Movement Service Request: exactly the existing WS-010 §3.1 request envelope, derived mechanically from
 *      the commitment-of-record, naming the continuing PC as the moved subject (by reference to its World-State physical
 *      custody record) and the one destination locus.
 *
 * Both live at ONE slot per PC identity, create-only (SEALED): the one-journey constraint of this tranche. A second voluntary
 * movement of the same PC is a version conflict, never a sibling truth. Every schema is strict, which is also the structural
 * half of the exclusions: there is no field in which a route, path, duration, speed, cost, hazard, carrier, leg, second
 * journey, cancellation or arrival could be stated (IA-02). Foreign state is REFERENCED by exact pin, never copied. Identifiers,
 * owner/facet names and literals the sources do not prescribe are technical encodings.
 */

export const FACET_PC_VOLUNTARY_COMMITMENT = "pc_voluntary_commitment";

/** The PC's one voluntary-movement commitment-of-record slot: one journey per PC identity. */
export const pcMovementCommitmentKey = (pcId: string): string => `pc/${pcId}/movement/commitment`;
/** The PC-owned Movement Service Request slot, in the PC owner's own key space (never Logistics' or World-State's). */
export const pcMovementRequestKey = (pcId: string): string => `pc/${pcId}/movement/request`;

/** Identities derived from the PC identity alone: one PC, one journey slot, one request. No clock, counter or random value. */
export const pcMovementCommitmentId = (pcId: string): string => `pc-move-commitment:${pcId}`;
export const pcMovementRequestId = (pcId: string): string => `pc-move:${pcId}`;

/** The structured movement intent the I-001 lowering delivers: voluntary relocation to one named established locus. */
export const PC_MOVEMENT_INTENT_KIND = "VOLUNTARY_RELOCATION";

/** The only authority that fixes a player commitment (Runtime/Translation v0.2 §5.2 rule 1), never a persona. */
const AuthoredUnder = z.strictObject({
  role: z.literal(PLAYER_CHOICE_AUTHORITY.role),
  permission: z.literal(PLAYER_CHOICE_AUTHORITY.permission),
});

export const PcMovementCommitmentSchema = z.strictObject({
  commitment_id: EntityId,
  /** the canonical continuing PC identity: identical in this fact, its key, the binding and the PC's physical custody */
  pc_id: EntityId,
  /** the player's authored commitment: role.player + permission.player_choice.commit, supplied and never defaulted */
  authored_under: AuthoredUnder,
  /** the structured voluntary-movement intent: willingness to relocate to ONE established lawful locus, nothing else */
  intent: z.strictObject({
    kind: z.literal(PC_MOVEMENT_INTENT_KIND),
    destination: z.strictObject({ world: FactRefSchema, locus: FactRefSchema }),
  }),
  /**
   * The exact committed versions this commitment was authored against: the PC's released contract, the operative binding,
   * the PC's stationary physical-custody record and the destination world and locus. Admission requires each to equal the
   * current version of a committed fact, so a committed commitment never carries 0.
   */
  basis: z.strictObject({
    pinned_versions: z.strictObject({
      pc: Version,
      binding: Version,
      custody: Version,
      world: Version,
      locus: Version,
    }),
  }),
  /** the committing PC-state owner: I-002's owner, as the PC-side holder of the player's commitment */
  committer: z.strictObject({
    owner: z.literal(OWNER_PC_EXISTENCE),
    facet: z.literal(FACET_PC_VOLUNTARY_COMMITMENT),
  }),
});
export type PcMovementCommitment = z.infer<typeof PcMovementCommitmentSchema>;

/** What a player commitment names: identities and the authored authority only. Everything else is read from committed state. */
export const PcMovementCommitInputSchema = z.strictObject({
  pc_id: EntityId,
  destination: z.strictObject({ world_id: EntityId, locus_id: EntityId }),
  authored_under: AuthoredUnder,
});
export type PcMovementCommitInput = z.infer<typeof PcMovementCommitInputSchema>;

/** What a request establishment names: the canonical PC identity only. The request is derived from the commitment-of-record. */
export const PcMovementRequestTargetSchema = z.strictObject({ pc_id: EntityId });
export type PcMovementRequestTarget = z.infer<typeof PcMovementRequestTargetSchema>;
