import { z } from "zod";

/**
 * IM-15 Host Protocol Gateway — the one allowlisted, MUTATING, separately opt-in, CORRIDOR-QUALIFIED confirmed active-PC single-leg
 * relocation operation — host-visible contract.
 *
 * It is the strictly opt-in sibling of `commit_confirmed_pc_relocation` (`protocol-relocation.ts`, unchanged): the same post-handover,
 * one-journey, single-leg path, additionally qualified by one World-State corridor that the TRUSTED side binds. Governing sources are
 * those of the sibling (Runtime Contract IM-15 / IM-16, RC-15 / RC-16, Canonical Role Registry v1, the frozen Active-PC Post-Handover
 * Physical Locus Ownership & Relocation Contract pin 2026-10-08T01:25:36.611Z §§4, 8-16 — not a spec-lock pin) plus the World-State
 * corridor read of the source-qualified Logistics path (`world-corridor.ts`, `logistics.ts`).
 *
 * What a host may say is exactly the operation it invokes. The request schema is strict and has NO other field, so any attempt to
 * supply, select or override a campaign, world, PC, destination, corridor, route, confirmation, role, permission, physical owner,
 * delivery time, identity, source, rule or provenance is rejected, never carried: all of those come from the trusted server-side
 * context. The operation name is a technical encoding under IM-15 / IM-16 (the sources prescribe no serialization vocabulary).
 *
 * What a host may SEE is the sibling's three minimum protocol statuses and nothing else (the receipt, the one refusal and the unknown
 * outcome are the sibling's own, unchanged): the corridor adds no transit time, speed, right of access, feasibility, cost, cap, arrival
 * or guarantee, and no host-visible status distinguishes a missing corridor from any other refusal.
 */

/** The only operation this construction allowlists for the corridor-qualified confirmed relocation gateway. */
export const PROTOCOL_OP_COMMIT_CONFIRMED_PC_CORRIDOR_RELOCATION =
  "commit_confirmed_pc_corridor_relocation";

export const CommitConfirmedPcCorridorRelocationRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_COMMIT_CONFIRMED_PC_CORRIDOR_RELOCATION),
});
export type CommitConfirmedPcCorridorRelocationRequest = z.infer<
  typeof CommitConfirmedPcCorridorRelocationRequestSchema
>;
