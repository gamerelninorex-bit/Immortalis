import { z } from "zod";

/**
 * IM-15 Host Protocol Gateway — the one allowlisted, read-only CURRENT OBSERVATION GLANCE read — host-visible request contract.
 *
 * Governing sources (exact pins live in spec/f027/spec-lock.json): I-001 §§3–5, 9–11 (disposable frame; active viewpoint;
 * smallest present awareness; actual arrived contact), F-014D §§2, 4.1, 5, 6, 18, 21, 24, F-014B §§4, 6, 17, 19, Runtime
 * Contract IM-15 / IM-16, RC-14. The host asks for current present awareness and nothing else: it names no event, owner key,
 * basis, time, role, permission, receipt or availability. What a host may say is exactly the operation it invokes. The schema is
 * strict and has NO other field, so any attempt to supply, select or override one is rejected, never carried. The refusal a host
 * can observe is the existing IM-13 refusal, unchanged.
 */

/** The only operation this construction allowlists for the current observation Glance read. */
export const PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE = "read_current_observation_glance";

export const ReadCurrentObservationGlanceRequestSchema = z.strictObject({
  operation: z.literal(PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE),
});
export type ReadCurrentObservationGlanceRequest = z.infer<
  typeof ReadCurrentObservationGlanceRequestSchema
>;
