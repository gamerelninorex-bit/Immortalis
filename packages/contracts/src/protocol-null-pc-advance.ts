import { z } from "zod";

/**
 * IM-15 Host Protocol Gateway — the one allowlisted, MUTATING, player-authorized NULL-PC out-of-character (OOC) target-only
 * temporal advance operation — host-visible contracts.
 *
 * Governing sources (exact pins live in spec/f027/spec-lock.json): Runtime Contract IM-15 / IM-16, RC-05 / RC-10 / RC-15 /
 * RC-16, F-014B Temporal Resolution (§§2-4, 6, 9, 13, 17-20 and the W3-CP3 Temporal Interface Overlay — No-Active-PC Advance:
 * `role.player` may request OOC Temporal advances while `role.player_character = NULL`; there is no PC Actionable-Knowledge-Time
 * interruption test in that interval), I-001 §§2-4, 14, 17, 20 (an absent PC is not a PC projection), Canonical Role Registry v1
 * (`role.player` + `permission.player_choice.commit`) and F-014D / NPK (a committed Temporal advance establishes no information,
 * observer, narrator or PC-knowledge result).
 *
 * What a host may say is exactly the operation it invokes. The request schema is strict and has NO other field, so any attempt to
 * supply, select or override a campaign, PC, target, duration, unit, condition, authority, role, permission, session, transaction
 * identity, trigger or provenance is rejected, never carried: the campaign, the one explicit player-chosen target and the
 * transaction identity / provenance all come from the trusted server-side context. The operation name and the three protocol
 * statuses below are technical encodings under IM-15 / IM-16 (the sources prescribe no serialization vocabulary); they change no
 * canonical state, owner, authority or time rule and amend no frozen source.
 *
 * What a host may SEE is the minimum protocol status: that the temporal transaction is committed, that the advance is unavailable
 * (one refusal for every cause), or that its outcome is not known and the same request reconciles it. A committed status means the
 * TEMPORAL TRANSACTION committed. It does not say that the target was attained, that any world process resolved, or that any
 * observer, narrator or PC learned anything, and it is identical whatever stop reason the kernel recorded.
 */

/** The only operation this construction allowlists for the NULL-PC OOC target-only temporal advance gateway. */
export const PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET = "advance_null_pc_ooc_to_target";

export const AdvanceNullPcOocToTargetRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET),
});
export type AdvanceNullPcOocToTargetRequest = z.infer<typeof AdvanceNullPcOocToTargetRequestSchema>;

/** The one success status: the recorded ResolutionTransaction committed (identical for a first call and a retry). */
export const NULL_PC_OOC_ADVANCE_COMMITTED = "NULL_PC_ADVANCE_COMMITTED";
export const NullPcOocAdvanceReceiptSchema = z.strictObject({
  status: z.literal(NULL_PC_OOC_ADVANCE_COMMITTED),
});
export type NullPcOocAdvanceReceipt = z.infer<typeof NullPcOocAdvanceReceiptSchema>;

/** The one refusal: every cause (malformed request, forged or unprepared context, an active PC, stale state, any kernel refusal) is this. */
export const NULL_PC_OOC_ADVANCE_UNAVAILABLE = "NULL_PC_ADVANCE_UNAVAILABLE";
export const NULL_PC_OOC_ADVANCE_UNAVAILABLE_MESSAGE = "no advance is available";

/** An ambiguous infrastructure outcome (RC-16): neither success nor failure; presenting the same request reconciles by identity. */
export const NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN = "NULL_PC_ADVANCE_OUTCOME_UNKNOWN";
export const NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN_MESSAGE =
  "the outcome is not known: present the same request again";
