import { z } from "zod";

/**
 * IM-15 Host Protocol Gateway — the one allowlisted, MUTATING, separately player-authorized active-PC stop-at-delivery
 * temporal advance operation — host-visible contracts.
 *
 * Governing sources (exact pins live in spec/f027/spec-lock.json): Runtime Contract IM-15 / IM-16, RC-05 / RC-10 / RC-14 /
 * RC-15 / RC-16, F-014B Temporal Resolution (canonical time moves only through a recorded ResolutionTransaction), WS-010
 * Logistics §§3.1-3.4, 9-11, 20, 23, I-001 §§2-5, 8, 14, 17, 20, F-014D, Canonical Role Registry v1 (`role.player` +
 * `permission.player_choice.commit`) and the frozen Active-PC Post-Handover Physical Locus Ownership & Relocation Contract (pin
 * 2026-10-08T01:25:36.611Z, §§4-15; NOT a spec-lock pin).
 *
 * What a host may say is exactly the operation it invokes. The request schema is strict and has NO other field, so any attempt to
 * supply, select or override a campaign, PC, route, destination, clock, target, boundary, condition, role, permission,
 * confirmation, transaction identity, source or provenance is rejected, never carried: all of those come from the trusted
 * server-side context or from committed canonical state. The operation name and the three protocol statuses below are technical
 * encodings under IM-15 / IM-16 (the sources prescribe no serialization vocabulary); they change no canonical state, owner,
 * authority or time rule.
 *
 * What a host may SEE is the minimum protocol status: that the temporal transaction is committed, that the advance is unavailable
 * (one refusal for every cause), or that its outcome is not known and the same request reconciles it. A committed status means the
 * TEMPORAL TRANSACTION committed. It does not say that the transfer was delivered, that the PC arrived, recognized any place,
 * learned of any event or holds any knowledge, and it is identical whatever the transaction's stop reason was. Nothing here is a
 * player-facing consequence channel: any narration or current-location information requires separate lawful I-001 / F-014D access.
 */

/** The only operation this construction allowlists for the confirmed PC transfer advance gateway. */
export const PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER =
  "advance_confirmed_pc_transfer_to_delivery";

export const AdvanceConfirmedPcTransferRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER),
});
export type AdvanceConfirmedPcTransferRequest = z.infer<
  typeof AdvanceConfirmedPcTransferRequestSchema
>;

/** The one success status: the recorded ResolutionTransaction committed (identical for a first call and a retry). */
export const PC_TRANSFER_ADVANCE_COMMITTED = "ADVANCE_COMMITTED";
export const PcTransferAdvanceReceiptSchema = z.strictObject({
  status: z.literal(PC_TRANSFER_ADVANCE_COMMITTED),
});
export type PcTransferAdvanceReceipt = z.infer<typeof PcTransferAdvanceReceiptSchema>;

/** The one refusal: every cause (malformed request, forged or unprepared context, stale or absent state, any kernel refusal) is this. */
export const PC_TRANSFER_ADVANCE_UNAVAILABLE = "ADVANCE_UNAVAILABLE";
export const PC_TRANSFER_ADVANCE_UNAVAILABLE_MESSAGE = "no advance is available";

/** An ambiguous infrastructure outcome (RC-16): neither success nor failure; presenting the same request reconciles by identity. */
export const PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN = "ADVANCE_OUTCOME_UNKNOWN";
export const PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN_MESSAGE =
  "the outcome is not known: present the same request again";
