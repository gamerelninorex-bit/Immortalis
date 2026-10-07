import {
  EventSignalPresentationSchema,
  EventSignalProjectionSchema,
  PRESENTATION_NPK_EVENT_SIGNAL,
  PROJECTION_EVENT_SIGNAL,
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  fail,
  ok,
  type EventSignalPresentation,
  type Result,
} from "@immortalis/contracts";

/**
 * IM-14 / NPK — the Event-Signal Presentation (NPK Narrative & Performance Kernel, lock pin 2026-09-25T00:18:32.532Z;
 * Runtime Contract IM-13 → IM-14: "only after IM-13 projection").
 *
 * A PURE function of ONE value: an already-lawful Event-Signal Projection. It is given no store, view, packet, event,
 * provenance, capability, source, Temporal state or owner state and imports nothing but the contracts, so it can neither
 * re-resolve the world, re-read Epistemic state, recover anything concealed nor write anything (NPK §6: NPK owns presentation and
 * performance only; "NPK consumes the player-facing projection rather than raw authoritative subsystem state"; I-001 §3). It
 * reads no clock, draws no randomness, keeps no cache and persists nothing: the result is a value the caller may drop, and
 * presenting again re-derives it identically.
 *
 * The received contact, Presented Source Attribution, referent and content are carried exactly, in one fixed presentation order
 * (contact, attribution when presented, referent, content). A false or stale presented attribution is rendered as presented and is
 * never corrected against hidden truth (I-001 §10). Nothing is added: no urgency, interpretation, comprehension, belief,
 * memory, motive, emotion, true source, unseen cause, exact time or fixed prose (RC-14; NPK §6, NPK-10).
 *
 * The input is parsed through the strict projection contract, so only a value shaped exactly as the IM-13 projection is rendered.
 * Anything else — a refusal result, an unavailable or non-current projection (which IM-13 never produced), a projection carrying any
 * extra field, a malformed value — is refused with the SAME opaque refusal IM-13 uses (`PROJECTION_UNAVAILABLE`, one message, no
 * details): an unavailable projection never becomes a presentation opportunity through another route, and neither the refusal nor
 * its shape distinguishes one cause from another.
 */
export type EventSignalPresentationErrorCode = typeof PROJECTION_UNAVAILABLE;

export function presentEventSignal(
  projection: unknown,
): Result<EventSignalPresentation, EventSignalPresentationErrorCode> {
  try {
    const parsed = EventSignalProjectionSchema.safeParse(projection);
    if (!parsed.success) return unavailable();
    const p = parsed.data;
    const presented = EventSignalPresentationSchema.safeParse({
      presentation: PRESENTATION_NPK_EVENT_SIGNAL,
      disposable: true,
      form: PROJECTION_EVENT_SIGNAL,
      viewpoint: { role: p.viewpoint.role, entity_id: p.viewpoint.entity_id },
      elements:
        p.presented_attribution === null
          ? [
              { element: "CONTACT", channel: p.contact.channel },
              { element: "REFERENT", text: p.payload.referent },
              { element: "CONTENT", text: p.payload.content },
            ]
          : [
              { element: "CONTACT", channel: p.contact.channel },
              { element: "PRESENTED_ATTRIBUTION", text: p.presented_attribution },
              { element: "REFERENT", text: p.payload.referent },
              { element: "CONTENT", text: p.payload.content },
            ],
    });
    return presented.success ? ok(presented.data) : unavailable();
  } catch {
    return unavailable();
  }
}

const unavailable = () => fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);
