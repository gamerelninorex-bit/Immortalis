import {
  DeliverCausalEventSignalPresentationRequestSchema,
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  fail,
  type EventSignalPresentation,
  type Result,
} from "@immortalis/contracts";
import {
  deriveEventSignalProjection,
  presentEventSignal,
  type ProjectionStateView,
} from "@immortalis/engine";

/**
 * IM-15 Host Protocol Gateway — the ONE allowlisted, read-only CAUSAL delivery: deliver the current active-PC Event-Signal
 * presentation of the single event that trusted server-side code already holds (Runtime Contract IM-15 / IM-16, RC-14,
 * IM-13 → IM-14; Implementation Charter §§3.4–3.5).
 *
 * The event's identity is bound by the trusted side together with the campaign view and the recipient, in an opaque handle
 * whose contents live in a module-private registry; a fabricated, parsed or copied value is not a context and is refused. The
 * host-visible request is strict and carries only the operation name, so the host cannot supply, choose, override or probe
 * the event, campaign, recipient, role, permission, viewpoint, source or provenance. Delivery discovers nothing: it never
 * enumerates, scans or selects among events, packets, stages, keys or history — it is handed one identity and presents that
 * one or refuses.
 *
 * Trusted context is not canonical authority. The operation composes the EXISTING path and nothing else:
 * `deriveEventSignalProjection` (IM-13) revalidates the recipient against canonical active-PC state and the current packet
 * and transaction formation on every call, then `presentEventSignal` (IM-14) over exactly the projection it produced; the
 * success value is the presenter's value unchanged. It is read-only and causally inert: nothing is written, committed,
 * cached, retained, retried, scheduled or advanced, and the context holds a read-only view, never data. Every failure — a
 * malformed or over-claiming request, a forged context, an unavailable, stale, historical, inaccessible or non-current event
 * — is the one IM-13 refusal, so no cause, validator detail, hidden-state existence or identity can be distinguished.
 * Transport- and provider-neutral: a plain function over values.
 */

/** The opaque handle for one trusted causal delivery context. It carries and reveals nothing. */
export interface TrustedCausalEventSignalContext {
  readonly __trusted_causal_event_signal_context: never;
}

interface CausalBinding {
  readonly view: ProjectionStateView;
  readonly recipient_id: string;
  readonly event_id: string;
}

const causalBindings = new WeakMap<object, CausalBinding>();

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. Binds one campaign's read-only committed-fact view, the recipient
 * that campaign/player authorization names, and the identity of the one causally produced event. Neither the recipient nor
 * the event is trusted for canon: IM-13 revalidates both against committed state on every delivery.
 */
export function bindTrustedCausalEventSignalContext(trusted: {
  readonly view: ProjectionStateView;
  readonly recipient_id: string;
  readonly event_id: string;
}): TrustedCausalEventSignalContext {
  const handle = Object.freeze({}) as TrustedCausalEventSignalContext;
  const { view } = trusted;
  causalBindings.set(handle, {
    view: Object.freeze({
      getFact: (key) => view.getFact(key),
      committedGroup: (id) => view.committedGroup(id),
    }),
    recipient_id: trusted.recipient_id,
    event_id: trusted.event_id,
  });
  return handle;
}

export type DeliverCausalEventSignalPresentationResult = Result<
  EventSignalPresentation,
  typeof PROJECTION_UNAVAILABLE
>;

const refusal = (): DeliverCausalEventSignalPresentationResult =>
  fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);

/**
 * The one host operation. `context` is the trusted causal binding; `request` is the untrusted host input.
 */
export function deliverCausalEventSignalPresentation(
  context: TrustedCausalEventSignalContext,
  request: unknown,
): DeliverCausalEventSignalPresentationResult {
  try {
    const bound = causalBindings.get(context);
    const parsed = DeliverCausalEventSignalPresentationRequestSchema.safeParse(request);
    if (bound === undefined || !parsed.success) return refusal();
    const projection = deriveEventSignalProjection(bound.view, {
      event_id: bound.event_id,
      recipient_id: bound.recipient_id,
    });
    return projection.ok ? presentEventSignal(projection.value) : projection;
  } catch {
    return refusal();
  }
}
