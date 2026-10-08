import { z } from "zod";

/**
 * IM-15 Host Protocol Gateway — the one allowlisted, read-only CAUSAL Event-Signal delivery — host-visible request contract.
 *
 * Governing sources (exact pins live in spec/f027/spec-lock.json): Runtime Contract IM-15 / IM-16, RC-14 / IM-13 → IM-14,
 * F-027 Implementation Charter §§3.4–3.5. Here the event is not named by the host at all: its identity is bound by trusted
 * server-side causal context. What a host may say is exactly the operation it invokes. The schema is strict and has NO other
 * field, so any attempt to supply, select or override an event, campaign, recipient, role, permission, viewpoint, source or
 * provenance is rejected, never carried. The refusal a host can observe is the existing IM-13 refusal, unchanged.
 */

/** The only operation this construction allowlists for causal delivery. */
export const PROTOCOL_OP_DELIVER_CAUSAL_EVENT_SIGNAL_PRESENTATION =
  "deliver_causal_event_signal_presentation";

export const DeliverCausalEventSignalPresentationRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_DELIVER_CAUSAL_EVENT_SIGNAL_PRESENTATION),
});
export type DeliverCausalEventSignalPresentationRequest = z.infer<
  typeof DeliverCausalEventSignalPresentationRequestSchema
>;
