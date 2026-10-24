import {
  EntityId,
  OwnerFactSchema,
  FACET_WORLD_SOURCE_CONDITION,
  FACET_PRODUCTION_STATE,
  OWNER_WORLD_STATE,
  OWNER_PRODUCTION,
  ProductionExtractionSchema,
  ProductionReserveSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  productionExtractionKey,
  productionReserveKey,
  worldSourceDeliveryKey,
  worldSourceConditionKey,
  OWNER_TEMPORAL_KERNEL,
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  ReadCurrentObservationGlanceRequestSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  accessEventKey,
  fail,
  type EventSignalPresentation,
  type OwnerFact,
  type Result,
} from "@immortalis/contracts";
import {
  deriveEventSignalProjection,
  isObservationEarnedFact,
  observationEventId,
  observationEventViolation,
  observationRecordOf,
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
 *
 * RC-14 / IM-13 control-flow non-disclosure holds for the WHOLE gateway, not only inside the projection. The read has ONE fixed shape,
 * the same discipline as `deriveEventSignalProjection`: thirteen identity reads (twelve `getFact`, one `committedGroup`).
 * The order is Temporal state, derived event, committing group, retained decision, five base premises, optional sixth cited fact,
 * and three collection qualification facts: its source condition, original Production extraction and Reserve. The sixth citation is
 * either a Source Condition or a completed delivery; the extra three are qualification dependencies, not question premises.
 * Ordinary/source-scoped questions use sentinels for the collection dependencies. Then the unchanged projection reads its fixed eight.
 * Every step runs in the same order whatever an earlier step found. There is no early return and no
 * short-circuit between steps, and no read whose existence depends on an earlier result: where a read's identity would depend on a
 * value that is absent or invalid, a fixed sentinel identity that can name no committed fact is read instead, so the read still
 * happens. The Epistemic owner's qualification (`observationEventViolation`) always runs, over a fixed stand-in when there is no
 * event, and is served from exactly those prefetched facts, so it adds no read of its own; a cited fact it needs that was not
 * prefetched reads as absent and fails closed. Each step is individually guarded, so an internal failure or a throwing view degrades
 * that step to "not satisfied" and the remaining steps still run. Only after every step has run is one verdict taken. A request that
 * fails its strict contract takes the same path as a valid one (a forged handle has no view to read). This is a deterministic bounded
 * shape, not a wall-clock constant-time claim: the cost of validating differently sized authored text is not equalized.
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
 * Sentinel identity: an EntityId must start with an alphanumeric character, so `-` can never be a committed event, group or fact
 * identity. A read that would otherwise depend on an absent or invalid value reads this instead, so the read still occurs (and finds
 * nothing). It is never returned or observable by a caller.
 */
const ABSENT_ID = "-";

/** A fixed, valid-shaped stand-in for the group that committed an event, so the owner's qualification runs identically with or without one. */
const ABSENT_GROUP = {
  campaign_id: ABSENT_ID,
  group_id: ABSENT_ID,
  intent_id: ABSENT_ID,
  cause: ABSENT_ID,
  reads: [],
  depends_on: [],
};

/** Executes one named step unconditionally; an internal failure degrades that step to its fallback, never the flow. */
const step = <T>(fallback: T, fn: () => T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/**
 * The identity of the observation the recipient could have earned at the canonical basis NOW, or the sentinel. The basis is the
 * Temporal owner's committed canonical time, already read by identity; it is neither supplied nor altered here.
 */
const currentObservationEventId = (stateFact: OwnerFact | undefined, recipient: string): string => {
  if (
    !stateFact ||
    stateFact.key !== TEMPORAL_STATE_KEY ||
    stateFact.owner !== OWNER_TEMPORAL_KERNEL
  )
    return ABSENT_ID;
  const state = TemporalStateSchema.safeParse(stateFact.value);
  return state.success ? observationEventId(recipient, state.data.canonical_time) : ABSENT_ID;
};

/** Derive only the original delivery's keys. No occupancy/LATEST lookup, scan or new question. */
function collectionKeys(fact: OwnerFact | undefined, decision: OwnerFact | undefined) {
  const record = observationRecordOf(decision);
  const parsed = WorldSourceDeliverySchema.safeParse(fact?.value);
  const named = /^world\/([^/]+)\/source-delivery\/(.+)$/.exec(fact?.key ?? "");
  if (
    !record ||
    record.input.refs.length !== 6 ||
    !fact ||
    !OwnerFactSchema.safeParse(fact).success ||
    !parsed.success ||
    !named ||
    fact.owner !== OWNER_WORLD_STATE ||
    fact.facet !== FACET_WORLD_SOURCE_CONDITION ||
    !EntityId.safeParse(named[1]).success ||
    !EntityId.safeParse(named[2]).success ||
    parsed.data.delivery_id !== named[2] ||
    !named[2]!.startsWith(`pc-collect:${record.subject.pc_id}:`) ||
    fact.key !== worldSourceDeliveryKey(named[1]!, parsed.data.delivery_id) ||
    parsed.data.source.fact_key !==
      worldSourceConditionKey(named[1]!, parsed.data.source.source_key)
  )
    return null;
  return {
    source: parsed.data.source.fact_key,
    extraction: productionExtractionKey(parsed.data.delivery_id),
  };
}

function reserveKey(fact: OwnerFact | undefined, extractionKey: string): string {
  const parsed = ProductionExtractionSchema.safeParse(fact?.value);
  return fact?.key === extractionKey &&
    OwnerFactSchema.safeParse(fact).success &&
    fact.owner === OWNER_PRODUCTION &&
    fact.facet === FACET_PRODUCTION_STATE &&
    parsed.success &&
    extractionKey === productionExtractionKey(parsed.data.extraction_id) &&
    parsed.data.reserve.fact_key === productionReserveKey(parsed.data.reserve.reserve_id)
    ? parsed.data.reserve.fact_key
    : ABSENT_ID;
}

/**
 * The one host operation. `context` is the trusted campaign/player binding; `request` is the untrusted host input.
 */
export function readCurrentObservationGlance(
  context: TrustedCurrentPlayerContext,
  request: unknown,
): ReadCurrentObservationGlanceResult {
  const bound = playerBindings.get(context);
  // a forged handle has no view: there is nothing to read and nothing hidden to protect
  if (bound === undefined) return refusal();
  const { view, recipient_id } = bound;

  const requestOk = step(
    false,
    () => ReadCurrentObservationGlanceRequestSchema.safeParse(request).success,
  );

  // -- thirteen identity reads: always these, always in this order ---------------------------------------------------------
  const stateFact = step(undefined, () => view.getFact(TEMPORAL_STATE_KEY));
  const eventId = step(ABSENT_ID, () => currentObservationEventId(stateFact, recipient_id));
  const eventFact = step(undefined, () => view.getFact(accessEventKey(eventId)));
  const group = step(null, () => view.committedGroup(eventFact?.provenance.intent_id ?? ABSENT_ID));
  const decisionKey = step(ABSENT_ID, () => group?.reads[0]?.key ?? ABSENT_ID);
  const decisionFact = step(undefined, () => view.getFact(decisionKey));
  const cited = step(
    [] as readonly { readonly fact_key: string }[],
    () => observationRecordOf(decisionFact)?.input.refs ?? [],
  );
  const premiseKey = (n: number): string => cited[n]?.fact_key ?? ABSENT_ID;
  const premise0 = step(undefined, () => view.getFact(premiseKey(0)));
  const premise1 = step(undefined, () => view.getFact(premiseKey(1)));
  const premise2 = step(undefined, () => view.getFact(premiseKey(2)));
  const premise3 = step(undefined, () => view.getFact(premiseKey(3)));
  const premise4 = step(undefined, () => view.getFact(premiseKey(4)));
  // The sixth slot is a Source Condition, a completed delivery, or the sentinel (five-base-premise observation).
  const premise5 = step(undefined, () => view.getFact(premiseKey(5)));
  const collection = step(null, () => collectionKeys(premise5, decisionFact));
  const sourceKey = collection?.source ?? ABSENT_ID;
  const source = step(undefined, () => view.getFact(sourceKey));
  const extractionKey = collection?.extraction ?? ABSENT_ID;
  const extraction = step(undefined, () => view.getFact(extractionKey));
  const reserveFactKey = step(ABSENT_ID, () => reserveKey(extraction, extractionKey));
  const reserve = step(undefined, () => view.getFact(reserveFactKey));

  // -- the owner's source qualification, over exactly those facts; it makes no read of its own ----------------------------
  const prefetched = new Map<string, OwnerFact | undefined>([
    [TEMPORAL_STATE_KEY, stateFact],
    [decisionKey, decisionFact],
    [premiseKey(0), premise0],
    [premiseKey(1), premise1],
    [premiseKey(2), premise2],
    [premiseKey(3), premise3],
    [premiseKey(4), premise4],
    [premiseKey(5), premise5],
    [
      sourceKey,
      step(undefined, () =>
        source?.owner === OWNER_WORLD_STATE &&
        OwnerFactSchema.safeParse(source).success &&
        source.facet === FACET_WORLD_SOURCE_CONDITION &&
        source.key === sourceKey &&
        WorldSourceConditionSchema.safeParse(source.value).success
          ? source
          : undefined,
      ),
    ],
    [extractionKey, extraction],
    [
      reserveFactKey,
      step(undefined, () =>
        reserve?.owner === OWNER_PRODUCTION &&
        OwnerFactSchema.safeParse(reserve).success &&
        reserve.facet === FACET_PRODUCTION_STATE &&
        reserve.key === reserveFactKey &&
        ProductionReserveSchema.safeParse(reserve.value).success
          ? reserve
          : undefined,
      ),
    ],
  ]);
  const violation = step<string | null>("the qualification did not complete", () =>
    observationEventViolation(
      {
        group: group ?? ABSENT_GROUP,
        value: eventFact?.value ?? null,
        basis: eventFact?.basis ?? ABSENT_ID,
        factOf: (key) => prefetched.get(key),
      },
      "VERIFICATION",
    ),
  );
  const qualified = step(
    false,
    () =>
      eventFact !== undefined &&
      eventFact.key === accessEventKey(eventId) &&
      isObservationEarnedFact(eventFact) &&
      group !== null &&
      violation === null,
  );

  // -- the UNCHANGED IM-13 guard (its own fixed eight reads) and the UNCHANGED IM-14 presenter run for every cause ----------
  const derived = step(undefined, () =>
    deriveEventSignalProjection(view, { event_id: eventId, recipient_id }),
  );
  const projection = derived?.ok ? derived.value : undefined;
  const presented = step(refusal(), () => presentEventSignal(projection));

  return requestOk && qualified && presented.ok ? presented : refusal();
}
