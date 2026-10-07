import { z } from "zod";
import { AccessChannelSchema, RECIPIENT_ROLE_PLAYER_CHARACTER } from "./epistemic-access.ts";
import { EntityId, Text } from "./world-foundation.ts";

/**
 * I-001 Context-Adaptive Player Interface — Event-Signal Projection foundation — executable contracts (IM-13, RC-14).
 *
 * Governing sources (exact pins live in spec/f027/spec-lock.json):
 *   I-001 Context-Adaptive Player Interface — Working Operational Draft v1 (lock pin 2026-09-25T00:17:49.551Z)
 *     §3 Disposable Interface Frame, §4 Step 1/3/4/6, §9 Event Signal / Incoming Information Adapter, §10 Source /
 *     Uncertainty Adapter, §11 Memory / Recall Guard, §17 Temporal Guard, §20 Failure Conditions
 *   F-014D Epistemic Access §§2.1, 4.1, 18, 24 (lock pin 2026-09-24T16:25:17.059Z) — the Accessible Content Packet this
 *     projects, and the Sealed Engine Provenance it never touches
 *   Canonical Role Registry v1 (2026-09-25T08:21:22.816Z) — `role.player_character`, the active viewpoint
 *   RC-14 Projection, IM-13
 *
 * An Event-Signal Projection is DISPOSABLE and NON-CANONICAL (I-001 §3): it is derived from the one current Accessible
 * Content Packet of the canonically active Player Character, handed to presentation, and never stored. Every schema is strict:
 * an unmodelled field is rejected, never carried (IA-02). That is the structural half of the I-001 guards: there is NO field
 * in which a true source/holder/carrier, an event/packet/provenance identity, a source key/owner/version, a capability
 * reference or close, a validator diagnostic, a hidden-state existence marker ("Unknown"/"Locked"/a category label), a
 * comprehension, inference, belief, memory, decision, emotion, urgency, interpretation, time coordinate, prose or an action
 * could be placed (I-001 §§4 step 3, 9, 11, 20; F-014D §§2.1, 18, 24). It is the receipt envelope and the received payload and
 * nothing else.
 */

/** The one projection form this construction can produce (I-001 §9 "Event Signal / report arrival"). */
export const PROJECTION_EVENT_SIGNAL = "EVENT_SIGNAL";

/**
 * The only refusal a caller can observe. I-001 §4 step 3/6 and RC-14: a hidden fact is OMITTED, never exposed through an
 * "Unknown"/"Locked" label, and an internal validator failure, a concealed cause or the existence of a packet the PC is not
 * lawfully presented never travels through an error. Every refusal — wrong or inactive recipient, no packet, a packet that
 * is not the current arrival, a tampered or unlawful input, malformed input — is this one code with this one message and
 * no details, so the refusal itself reveals nothing about which condition failed or whether hidden state exists.
 */
export const PROJECTION_UNAVAILABLE = "PROJECTION_UNAVAILABLE";
export const PROJECTION_UNAVAILABLE_MESSAGE = "no projection is available";

/** What a caller names: the addressed viewpoint (recipient) and the F-014D event whose packet is requested. */
export const EventSignalRequestSchema = z.strictObject({
  event_id: EntityId,
  recipient_id: EntityId,
});
export type EventSignalRequest = z.infer<typeof EventSignalRequestSchema>;

/**
 * The Event-Signal Projection (I-001 §9): the receipt `contact` (the direct channel the information reached the PC by —
 * an actor-admissible carrier feature, F-014D §18) separated from the received `payload` (preserved exactly as the
 * Accessible Content Packet carried it, never corrected against canonical truth, §10), and the Presented Source Attribution
 * exactly as the carrier presented it (or null when nothing was perceivable), which may be false and is never the true source.
 * `viewpoint` is the active `role.player_character` and the entity it names (RC-14 viewpoint / intended recipient).
 *
 * Receipt and representational intelligibility are the PRECONDITIONS of this projection, not content of it: a packet that
 * exists is already representationally accessible, and the capability that established it is engine-side (F-014D §2.1), so
 * neither is projected. The projection carries no urgency (the packet defines none; none is inferred), no interpretation, no
 * arrival time coordinate (the canonical coordinate is not the PC's perceived granularity: no false precision, I-001 §4
 * step 6) and `disposable: true` — a literal, so a projection can never claim to be state.
 */
export const EventSignalProjectionSchema = z.strictObject({
  projection: z.literal(PROJECTION_EVENT_SIGNAL),
  disposable: z.literal(true),
  viewpoint: z.strictObject({
    role: z.literal(RECIPIENT_ROLE_PLAYER_CHARACTER),
    entity_id: EntityId,
  }),
  contact: z.strictObject({ channel: AccessChannelSchema }),
  payload: z.strictObject({ referent: Text, content: Text }),
  presented_attribution: Text.nullable(),
});
export type EventSignalProjection = z.infer<typeof EventSignalProjectionSchema>;
