import { z } from "zod";

/**
 * IM-15 Host Protocol Gateway — the one allowlisted, MUTATING, separately player-authorized ACTIVE-PC target-only temporal
 * advance operation (stationary PC; initial and held-remainder branches) — host-visible contracts.
 *
 * Governing sources (exact pins live in spec/f027/spec-lock.json): Runtime Contract IM-15 / IM-16, RC-05 / RC-10 / RC-15 /
 * RC-16, F-014B Temporal Resolution (§§2-4, 6, 9-11, 13, 15, 17-20: canonical time moves only through a recorded
 * ResolutionTransaction, and the W3-CP3 No-Active-PC overlay does NOT apply while a PC is active), I-001 §§2-4, 8, 14, 17, 20
 * (interface activity does not advance time; OOC labels are not PC knowledge), Canonical Role Registry v1 (`role.player` +
 * `permission.player_choice.commit` authorizes only a discrete player choice), WS-007 GIP (§§2, 4.1, 4.3, 21.2, 22, 24.2: GIP
 * alone derives `expired` at its own earned instant), F-017 and F-014D / NPK (a committed Temporal advance establishes no
 * information, observer, narrator or PC-knowledge result).
 *
 * What a host may say is exactly the operation it invokes. The request schema is strict and has NO other field, so any attempt to
 * supply, select or override a campaign, PC, target, duration, unit, condition, continuation, held transaction, authority, role,
 * permission, confirmation, session, transaction identity, trigger, provenance, owner result or hidden state is rejected, never
 * carried: the campaign, the PC, the one explicit player-chosen target, the held lineage (when the player chose to continue one) and
 * the transaction identity / provenance all come from the trusted server-side context. The operation name and the three protocol
 * statuses below are technical encodings under IM-15 / IM-16 (the sources prescribe no serialization vocabulary); they change no
 * canonical state, owner, authority or time rule and amend no frozen source. The operation is not a natural-language wait, an
 * in-world waiting action or an action-cost determination.
 *
 * What a host may SEE is the minimum protocol status: that the temporal transaction is committed, that the advance is unavailable
 * (one refusal for every cause), or that its outcome is not known and the same request reconciles it. A committed status means the
 * TEMPORAL TRANSACTION committed. It does not say that the target was attained, that any world process resolved or any Instrument
 * expired, that a remainder is still held, or that the PC saw, learned or holds anything. It is identical for the initial and the
 * held-remainder branch and whatever stop reason the kernel recorded.
 */

/** The only operation this construction allowlists for the active-PC target-only temporal advance gateway. */
export const PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET = "advance_active_pc_to_target";

export const AdvanceActivePcToTargetRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET),
});
export type AdvanceActivePcToTargetRequest = z.infer<typeof AdvanceActivePcToTargetRequestSchema>;

/** The one success status: the recorded ResolutionTransaction committed (identical for a first call and a retry). */
export const PC_TARGET_ADVANCE_COMMITTED = "PC_TARGET_ADVANCE_COMMITTED";
export const PcTargetAdvanceReceiptSchema = z.strictObject({
  status: z.literal(PC_TARGET_ADVANCE_COMMITTED),
});
export type PcTargetAdvanceReceipt = z.infer<typeof PcTargetAdvanceReceiptSchema>;

/** The one refusal: every cause (malformed request, forged or unprepared context, a PC that is absent or not stationary, stale state, any kernel refusal) is this. */
export const PC_TARGET_ADVANCE_UNAVAILABLE = "PC_TARGET_ADVANCE_UNAVAILABLE";
export const PC_TARGET_ADVANCE_UNAVAILABLE_MESSAGE = "no advance is available";

/** An ambiguous infrastructure outcome (RC-16): neither success nor failure; presenting the same request reconciles by identity. */
export const PC_TARGET_ADVANCE_OUTCOME_UNKNOWN = "PC_TARGET_ADVANCE_OUTCOME_UNKNOWN";
export const PC_TARGET_ADVANCE_OUTCOME_UNKNOWN_MESSAGE =
  "the outcome is not known: present the same request again";
