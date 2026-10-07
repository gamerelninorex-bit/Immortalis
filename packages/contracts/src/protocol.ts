import { z } from "zod";
import { EntityId } from "./world-foundation.ts";

/**
 * IM-15 Host Protocol Gateway — the one allowlisted, read-only Event-Signal operation — host-visible request contract.
 *
 * Governing sources (exact pins live in spec/f027/spec-lock.json): Runtime Contract IM-15 (narrow authorized allowlisted
 * operations; minimum-sufficient filtered context; no host-derived authority), IM-16 (authorization and campaign isolation
 * before host exposure), RC-14 / IM-13 → IM-14, F-027 Implementation Charter §§3.4–3.5 (untrusted host, server-side authority,
 * pre-host filtering, allowlisted structured operations).
 *
 * The host is UNTRUSTED. What a host may say is exactly the operation it invokes and the one Event-Signal event it names.
 * There is NO field in which a campaign, recipient, active-PC binding, role, permission, viewpoint, source/provenance, key,
 * path, projection or presentation could be placed: the schema is strict, so any such field (or any other operation name) is
 * rejected, never carried. Authority is not host input at all — it is the trusted server-side context the operation is bound
 * to. The refusal a host can observe is the existing IM-13 refusal (`PROJECTION_UNAVAILABLE`), unchanged.
 */

/** The only operation this construction allowlists: read the current active-PC Event-Signal presentation. */
export const PROTOCOL_OP_READ_EVENT_SIGNAL_PRESENTATION = "read_current_event_signal_presentation";

export const ReadEventSignalPresentationRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_READ_EVENT_SIGNAL_PRESENTATION),
  event_id: EntityId,
});
export type ReadEventSignalPresentationRequest = z.infer<
  typeof ReadEventSignalPresentationRequestSchema
>;
