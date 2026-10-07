import { z } from "zod";
import { AccessChannelSchema, RECIPIENT_ROLE_PLAYER_CHARACTER } from "./epistemic-access.ts";
import { PROJECTION_EVENT_SIGNAL } from "./projection.ts";
import { EntityId, Text } from "./world-foundation.ts";

/**
 * NPK Narrative & Performance Kernel — Event-Signal Presentation foundation — executable contract (IM-14).
 *
 * Governing sources (exact pins live in spec/f027/spec-lock.json):
 *   NPK Narrative & Performance Kernel (lock pin 2026-09-25T00:18:32.532Z) — §1 purpose ("makes all of it present to the
 *     player"; owns presentation and performance only), §6 ownership boundary (phrasing, presentation order, descriptive
 *     selection are NPK's; world truth, epistemic access, actor cognition are not), §8 pipeline, and the I-001
 *     Player-Facing Projection Mediation ("NPK consumes the player-facing projection rather than raw authoritative
 *     subsystem state")
 *   I-001 Context-Adaptive Player Interface (lock pin 2026-09-25T00:17:49.551Z) — §9 Event Signal, §10 Source / Uncertainty
 *   F-014D Epistemic Access (lock pin 2026-09-24T16:25:17.059Z) — §§2.1, 18, 24
 *   Runtime Contract RC-14 and IM-13 → IM-14 ("only after IM-13 projection"; "no private-fact invention")
 * Later live NPK edits (after the lock pin) are NOT build authority and are not consumed.
 *
 * An Event-Signal Presentation is the DISPOSABLE, NON-CANONICAL result of rendering ONE lawful Event-Signal Projection. It is
 * derived from that projection alone, handed to the host/player surface, and never stored. It is the projection's receipt
 * contact, presented attribution, referent and content — each carried exactly — in one fixed presentation order, and nothing
 * else. Every schema is strict: an unmodelled field is rejected, never carried. There is NO field in which a hidden or true
 * source, an event/packet/provenance identity, a capability, a validator diagnostic, a hidden-state marker, urgency,
 * interpretation, comprehension, belief, memory, motive, emotion, a time coordinate, a diagnosis or any authored prose could
 * be placed (RC-14; NPK §6; I-001 §§4, 9, 11, 20).
 *
 * The only choices the presenter makes are the semantically neutral ones the NPK envelope leaves to it: the PRESENTATION
 * ORDER of the received elements and their structural kind. It adds no connective prose, label, register, mode, cadence,
 * affect or fixed string; every text value is the projection's own text, byte for byte.
 */

/** The one presentation form this construction can produce: the NPK rendering of one Event-Signal Projection. */
export const PRESENTATION_NPK_EVENT_SIGNAL = "NPK_EVENT_SIGNAL";

/**
 * The structural kind of one presented element. These are structure tags for the host surface, never display strings: no
 * label, heading or wording is attached to them (NPK-10: no developer/provenance footnotes in a player-facing surface).
 */
export const EVENT_SIGNAL_ELEMENT_KINDS = [
  "CONTACT",
  "PRESENTED_ATTRIBUTION",
  "REFERENT",
  "CONTENT",
] as const;

const ContactElement = z.strictObject({
  element: z.literal("CONTACT"),
  channel: AccessChannelSchema,
});
const AttributionElement = z.strictObject({
  element: z.literal("PRESENTED_ATTRIBUTION"),
  text: Text,
});
const ReferentElement = z.strictObject({ element: z.literal("REFERENT"), text: Text });
const ContentElement = z.strictObject({ element: z.literal("CONTENT"), text: Text });

/**
 * The fixed presentation order: the contact the signal arrived by, then — only when the carrier presented one — the
 * Presented Source Attribution exactly as presented (it may be false and is never corrected or replaced by a true source),
 * then the referent, then the content. An absent attribution has no element: nothing is announced as "unknown".
 */
export const EventSignalElementsSchema = z.union([
  z.tuple([ContactElement, AttributionElement, ReferentElement, ContentElement]),
  z.tuple([ContactElement, ReferentElement, ContentElement]),
]);

export const EventSignalPresentationSchema = z.strictObject({
  presentation: z.literal(PRESENTATION_NPK_EVENT_SIGNAL),
  /** a literal: a presentation can never claim to be state */
  disposable: z.literal(true),
  /** the projection form this renders (the only one that exists) */
  form: z.literal(PROJECTION_EVENT_SIGNAL),
  viewpoint: z.strictObject({
    role: z.literal(RECIPIENT_ROLE_PLAYER_CHARACTER),
    entity_id: EntityId,
  }),
  elements: EventSignalElementsSchema,
});
export type EventSignalPresentation = z.infer<typeof EventSignalPresentationSchema>;
