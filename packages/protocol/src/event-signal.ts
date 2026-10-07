import {
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  ReadEventSignalPresentationRequestSchema,
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
 * IM-15 Host Protocol Gateway — the ONE allowlisted, read-only operation: read the current active-PC Event-Signal
 * presentation of one named event (Runtime Contract IM-15 / IM-16, RC-14, IM-13 → IM-14; Implementation Charter §§3.4–3.5).
 *
 * Authority is never host input. It comes from a TRUSTED CONTEXT that the server-side service establishes by its own means
 * (authentication is out of scope and not modelled here) and binds to exactly one campaign view and one recipient. The
 * context is an opaque handle: everything it stands for lives in a module-private registry, so a value a host (or a transport
 * adapter) fabricated, parsed or copied is not a context and is refused. The host-visible request is strict and carries only
 * the operation name and the event it names; it cannot select or override the campaign, recipient, active-PC binding, role,
 * permission, viewpoint, source/provenance, state, projection or presentation.
 *
 * The operation composes the EXISTING path and nothing else: `deriveEventSignalProjection` (IM-13), which still validates the
 * context's recipient against canonical active-PC state, then `presentEventSignal` (IM-14) over exactly the projection it
 * produced. It adds no eligibility logic, no lookup, no enrichment and no prose; the success value is the presenter's value
 * unchanged. It is read-only and causally inert: the only capability reachable is the projection's read-by-identity view, and
 * nothing is cached, retained, retried, committed, scheduled or advanced. Every failure — a malformed or over-claiming request,
 * a forged context, an unavailable, stale, historical, inaccessible or non-current event — is the one IM-13 refusal, so no
 * cause, validator detail, hidden-state existence or identity can be distinguished. Transport- and provider-neutral: a plain
 * function over values.
 */

/** The opaque handle for one trusted campaign/player authorization context. It carries and reveals nothing. */
export interface TrustedEventSignalContext {
  readonly __trusted_event_signal_context: never;
}

interface Binding {
  readonly view: ProjectionStateView;
  readonly recipient_id: string;
}

const bindings = new WeakMap<object, Binding>();

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. Binds one campaign's read-only committed-fact view and the
 * recipient that campaign/player authorization names, after the service has established that authority. The recipient is not
 * trusted for canon: IM-13 still validates it against the campaign's canonical active-PC binding on every read.
 */
export function bindTrustedEventSignalContext(trusted: {
  readonly view: ProjectionStateView;
  readonly recipient_id: string;
}): TrustedEventSignalContext {
  const handle = Object.freeze({}) as TrustedEventSignalContext;
  const { view } = trusted;
  bindings.set(handle, {
    view: Object.freeze({
      getFact: (key) => view.getFact(key),
      committedGroup: (id) => view.committedGroup(id),
    }),
    recipient_id: trusted.recipient_id,
  });
  return handle;
}

export type ReadEventSignalPresentationResult = Result<
  EventSignalPresentation,
  typeof PROJECTION_UNAVAILABLE
>;

const refusal = (): ReadEventSignalPresentationResult =>
  fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);

/**
 * The one host operation. `context` is the trusted server-side authorization; `request` is the untrusted host input.
 */
export function readCurrentEventSignalPresentation(
  context: TrustedEventSignalContext,
  request: unknown,
): ReadEventSignalPresentationResult {
  try {
    const bound = bindings.get(context);
    const parsed = ReadEventSignalPresentationRequestSchema.safeParse(request);
    if (bound === undefined || !parsed.success) return refusal();
    const projection = deriveEventSignalProjection(bound.view, {
      event_id: parsed.data.event_id,
      recipient_id: bound.recipient_id,
    });
    return projection.ok ? presentEventSignal(projection.value) : projection;
  } catch {
    return refusal();
  }
}
