import { z } from "zod";

/**
 * IM-15 Host Protocol Gateway — the one allowlisted, MUTATING, confirmed active-PC single-leg relocation operation —
 * host-visible contracts.
 *
 * Governing sources (exact pins live in spec/f027/spec-lock.json): Runtime Contract IM-15 / IM-16, RC-15 / RC-16, I-001 §§5, 8,
 * 14, 17, Canonical Role Registry v1 (`role.player` + `permission.player_choice.commit`), and the frozen Active-PC Post-Handover
 * Physical Locus Ownership & Relocation Contract (pin 2026-10-08T01:25:36.611Z, §§4, 8-14, 16; NOT a spec-lock pin).
 *
 * What a host may say is exactly the operation it invokes. The request schema is strict and has NO other field, so any attempt to
 * supply, select or override a campaign, PC, destination, confirmation, role, permission, physical owner, delivery time,
 * identity, source, rule or provenance is rejected, never carried: all of those come from the trusted server-side context. The
 * operation name and the three protocol statuses below are technical encodings under IM-15 / IM-16 (the sources prescribe no
 * serialization vocabulary); they change no canonical state, owner or authority.
 *
 * What a host may SEE is the minimum protocol status: that the relocation request is committed, that it is unavailable (one
 * refusal for every cause), or that its outcome is not known and the same request reconciles it. Nothing here is a
 * player-facing consequence channel: results reach the player only through the existing IM-13 → IM-14 path.
 */

/** The only operation this construction allowlists for the confirmed relocation gateway. */
export const PROTOCOL_OP_COMMIT_CONFIRMED_PC_RELOCATION = "commit_confirmed_pc_relocation";

export const CommitConfirmedPcRelocationRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_COMMIT_CONFIRMED_PC_RELOCATION),
});
export type CommitConfirmedPcRelocationRequest = z.infer<
  typeof CommitConfirmedPcRelocationRequestSchema
>;

/** The one success status: the lawful chain is committed up to in-transfer custody (identical for a first call and a retry). */
export const PC_RELOCATION_COMMITTED = "RELOCATION_COMMITTED";
export const PcRelocationReceiptSchema = z.strictObject({
  status: z.literal(PC_RELOCATION_COMMITTED),
});
export type PcRelocationReceipt = z.infer<typeof PcRelocationReceiptSchema>;

/** The one refusal: every cause (malformed request, forged or unprepared context, any owner refusal) is this, with no detail. */
export const RELOCATION_UNAVAILABLE = "RELOCATION_UNAVAILABLE";
export const RELOCATION_UNAVAILABLE_MESSAGE = "no relocation is available";

/** An ambiguous infrastructure outcome (RC-16): neither success nor failure; presenting the same request reconciles by identity. */
export const RELOCATION_OUTCOME_UNKNOWN = "RELOCATION_OUTCOME_UNKNOWN";
export const RELOCATION_OUTCOME_UNKNOWN_MESSAGE =
  "the outcome is not known: present the same request again";
