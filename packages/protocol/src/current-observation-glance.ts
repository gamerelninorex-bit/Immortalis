import {
  OWNER_TEMPORAL_KERNEL,
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  ReadCurrentObservationGlanceRequestSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  accessEventKey,
  fail,
  type EventSignalPresentation,
  type Result,
} from "@immortalis/contracts";
import {
  deriveEventSignalProjection,
  isObservationEarnedFact,
  observationEventId,
  observationEventViolation,
  presentEventSignal,
  type ProjectionStateView,
} from "@immortalis/engine";

/**
 * IM-15 Host Protocol Gateway — the ONE allowlisted, read-only CURRENT OBSERVATION GLANCE: the present, Glance-eligible awareness
 * that the canonically active Player Character has actually EARNED by direct physical observation, for a player-facing client
 * other than the operator call that produced it (I-001 §§3–5, 9–11; F-014D §§2, 4.1, 5, 6; F-014B §§4, 17; RC-14; IM-13 → IM-14;
 * Implementation Charter §§3.4–3.5).
 *
 * Unlike the causal delivery, the caller holds NO event identity. A trusted, opaque context binds a read-only campaign view and the
 * addressed active-PC recipient; the event is then DERIVED here, server-side, from committed canon alone, by the existing
 * observation identity (`observationEventId`: the recipient and the canonical basis, which Temporal owns and this read never
 * moves). The derived event must be exactly the observation-earned event its retained direct-perception decision determines
 * (`observationEventViolation`, the Epistemic owner's own rule, at its load-verification phase): a coincidentally named,
 * hand-authored, broadcast or otherwise sourced event is not an observation and is not read here. That event is then submitted to the
 * UNCHANGED IM-13 projection — which still revalidates the recipient against canonical active-PC state, the packet, the exact
 * current arrival under the latest SEALED resolution transaction and its formation on every call — and presented by the UNCHANGED
 * IM-14 presenter over exactly the projection it produced. The success value is the presenter's value unchanged.
 *
 * The host-visible request is strict and carries only the operation name, so the host cannot supply, choose, override or probe the
 * event, campaign, recipient, role, permission, viewpoint, source, provenance, basis, time or any claim of availability. Trusted
 * context is not canonical authority: the context's recipient is revalidated on every call. Nothing is discovered by search: no
 * enumeration, scan or selection among events, packets, stages, keys or history — one identity is derived and one packet is read, or
 * the read refuses. It is read-only and causally inert: nothing is written, committed, cached, retained, retried, scheduled or
 * advanced, no canonical time moves, nothing is marked "seen", and a read after the basis has moved on (a newer sealed transaction)
 * does not revive the earlier arrival. Every failure — a malformed or over-claiming request, a forged context, no actual
 * observation, an obstructed one (which earned nothing), an unsealed, historical, stale or inaccessible event — is the one IM-13
 * refusal, so no cause, validator detail, hidden-state existence or identity can be distinguished. Transport- and provider-neutral:
 * a plain function over values; no model, provider, network or credential.
 */

/** The opaque handle for one trusted campaign/player context. It carries and reveals nothing. */
export interface TrustedCurrentPlayerContext {
  readonly __trusted_current_player_context: never;
}

interface PlayerBinding {
  readonly view: ProjectionStateView;
  readonly recipient_id: string;
}

const playerBindings = new WeakMap<object, PlayerBinding>();

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. Binds one campaign's read-only committed-fact view and the recipient that
 * campaign/player authorization names. The recipient is not trusted for canon: IM-13 validates it against the campaign's canonical
 * active-PC binding on every read. The context holds a read-only view, never data.
 */
export function bindTrustedCurrentPlayerContext(trusted: {
  readonly view: ProjectionStateView;
  readonly recipient_id: string;
}): TrustedCurrentPlayerContext {
  const handle = Object.freeze({}) as TrustedCurrentPlayerContext;
  const { view } = trusted;
  playerBindings.set(handle, {
    view: Object.freeze({
      getFact: (key) => view.getFact(key),
      committedGroup: (id) => view.committedGroup(id),
    }),
    recipient_id: trusted.recipient_id,
  });
  return handle;
}

export type ReadCurrentObservationGlanceResult = Result<
  EventSignalPresentation,
  typeof PROJECTION_UNAVAILABLE
>;

const refusal = (): ReadCurrentObservationGlanceResult =>
  fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);

/**
 * The identity of the observation the recipient could have earned at the canonical basis NOW, or null. The basis is the Temporal
 * owner's committed canonical time, read by identity; it is neither supplied nor altered here.
 */
function currentObservationEventId(view: ProjectionStateView, recipient: string): string | null {
  const fact = view.getFact(TEMPORAL_STATE_KEY);
  if (!fact || fact.key !== TEMPORAL_STATE_KEY || fact.owner !== OWNER_TEMPORAL_KERNEL) return null;
  const state = TemporalStateSchema.safeParse(fact.value);
  return state.success ? observationEventId(recipient, state.data.canonical_time) : null;
}

/** Whether the committed event at this identity is exactly an observation-earned event (its retained decision determines it). */
function isEarnedObservation(view: ProjectionStateView, eventId: string): boolean {
  const eventFact = view.getFact(accessEventKey(eventId));
  if (
    !eventFact ||
    eventFact.key !== accessEventKey(eventId) ||
    !isObservationEarnedFact(eventFact)
  )
    return false;
  const group = view.committedGroup(eventFact.provenance.intent_id);
  return (
    group !== null &&
    observationEventViolation(
      {
        group,
        value: eventFact.value,
        basis: eventFact.basis,
        factOf: (key) => view.getFact(key),
      },
      "VERIFICATION",
    ) === null
  );
}

/**
 * The one host operation. `context` is the trusted campaign/player binding; `request` is the untrusted host input.
 */
export function readCurrentObservationGlance(
  context: TrustedCurrentPlayerContext,
  request: unknown,
): ReadCurrentObservationGlanceResult {
  try {
    const bound = playerBindings.get(context);
    const parsed = ReadCurrentObservationGlanceRequestSchema.safeParse(request);
    if (bound === undefined || !parsed.success) return refusal();
    const eventId = currentObservationEventId(bound.view, bound.recipient_id);
    if (eventId === null || !isEarnedObservation(bound.view, eventId)) return refusal();
    const projection = deriveEventSignalProjection(bound.view, {
      event_id: eventId,
      recipient_id: bound.recipient_id,
    });
    return projection.ok ? presentEventSignal(projection.value) : projection;
  } catch {
    return refusal();
  }
}
