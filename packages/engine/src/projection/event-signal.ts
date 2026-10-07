import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  AccessEventSchema,
  AccessiblePacketSchema,
  EventSignalProjectionSchema,
  EventSignalRequestSchema,
  OWNER_EPISTEMIC_ACCESS,
  OWNER_TEMPORAL_KERNEL,
  PLAYER_CHARACTER_BINDING_KEY,
  PROJECTION_EVENT_SIGNAL,
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  RECIPIENT_ROLE_PLAYER_CHARACTER,
  ResolutionTransactionSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  compareTime,
  fail,
  ok,
  populationLedgerKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type AccessEvent,
  type EventSignalProjection,
  type OwnerFact,
  type Result,
} from "@immortalis/contracts";
import {
  eventRecipient,
  isPcRecipientEvent,
  recipientBoundaryViolation,
} from "../epistemic/derive.ts";
import { canonicalEqual } from "../hash.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { stageGroupId, transactionAuthorityGroupId } from "../temporal/identity.ts";

/**
 * IM-13 / I-001 — the active-PC Event-Signal Projection (I-001 §9; RC-14).
 *
 * A PURE, READ-ONLY derivation. Its only input is the by-identity read of already-committed facts: it is typed to receive
 * `getFact` and nothing else, so it can neither commit, schedule, advance the canonical clock nor write world, PC, actor or
 * Epistemic state (I-001 §§3, 17, 20: "no canonical state stored only because the interface displayed it", "no simulation
 * time created by navigation/refresh"). Nothing is cached or persisted: the result is a value the caller may drop, and
 * deriving it again re-derives everything.
 *
 * What it projects is exactly one thing: the Accessible Content Packet that F-014D formed for the canonically active Player
 * Character and that is the CURRENT ARRIVAL. The projection is copied field by field from the actor-safe packet — never from
 * the engine-side event, the Sealed Engine Provenance, the capability or the source — so the received payload and the
 * Presented Source Attribution are preserved exactly (I-001 §10) and nothing sealed can reach the output.
 *
 * The one temporal anchor is borrowed, not designed (I-001 §11 "I-001 does not provide universal recall of previously
 * presented information"; §9 "present only what has actually arrived"; F-014B §4 "AS-OF-NOW reads the value established at
 * the current resolution point"): an arrival is current exactly when the packet was FORMED under the durable authority of the
 * LATEST sealed player-facing resolution transaction (`temporal/state.last_transaction`, whose actual stop is the canonical
 * time). The forming transaction is read from the committed formation group itself (its last dependency is the authority of the
 * transaction that opened it), so a later consequence that merely re-declares and adopts an earlier formation by identity does
 * not make it current again. A packet formed by any earlier transaction is a stored historical packet: storage alone is no
 * recall basis, so it is refused. No
 * window, tolerance, counter, retention flag or memory/retrieval mechanism is introduced, and nothing is written to mark an
 * arrival "seen" or "expired".
 *
 * Every condition — wrong or inactive recipient, an event that is not an active-PC event, no packet, a packet that is not the
 * current arrival, a tampered or unlawful input, malformed input — yields the SAME refusal (`PROJECTION_UNAVAILABLE`, one
 * message, no details), so neither an error code, a message nor a detail distinguishes a hidden fact from an absent one
 * (I-001 §4 step 3; RC-14: "internal validator failures ... do not leak").
 *
 * The control flow is ALSO the same for every cause (RC-14 / IM-13: concealed causes do not leak through timing or
 * control-flow). The derivation has ONE fixed shape: exactly eight identity reads (seven `getFact`, one `committedGroup`) in
 * one fixed order, then every named step runs, in one fixed order, whatever any earlier step found. There is no early
 * return, no short-circuit between steps, and no read whose existence depends on an earlier result: where a read's identity
 * would depend on a value that is absent or invalid, a fixed sentinel identity (one that can name no committed fact) is read
 * instead, so the read still happens. Each step is individually guarded, so an internal failure or a throwing view degrades
 * that step to "not satisfied" and the remaining steps still run. Only after every step has run is one verdict taken. The
 * ordered step names are exported (`EVENT_SIGNAL_DERIVATION_STEPS`) and the steps actually executed are observable through
 * `traceEventSignalDerivation`, so tests assert the shape directly. This is a deterministic bounded shape, not a wall-clock
 * constant-time claim: the cost of validating differently sized authored text is not equalized.
 */

/** Read-only access to committed facts by identity: the only capability the projection is given. */
export type ProjectionStateView = Pick<CampaignStore, "getFact" | "committedGroup">;

export type EventSignalErrorCode = typeof PROJECTION_UNAVAILABLE;

const unavailable = () => fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);

/**
 * The one fixed shape of every derivation, in execution order: the request is parsed, the eight identity reads are made,
 * the four committed values are parsed, the four checks are evaluated, the candidate projection is composed and the verdict
 * is taken. Every name appears exactly once in every run, for every cause.
 */
export const EVENT_SIGNAL_DERIVATION_STEPS = [
  "request",
  "read:binding",
  "read:ledger",
  "read:event",
  "read:packet",
  "read:state",
  "read:transaction",
  "read:authority",
  "read:formation",
  "parse:event",
  "parse:packet",
  "parse:state",
  "parse:transaction",
  "check:recipient",
  "check:packet",
  "check:arrival",
  "check:formation",
  "compose",
  "verdict",
] as const;
export type EventSignalDerivationStep = (typeof EVENT_SIGNAL_DERIVATION_STEPS)[number];

/**
 * Sentinel identities: an EntityId must start with an alphanumeric character, so `-` can never be a committed event, recipient
 * or transaction identity. A read that would otherwise depend on an absent or invalid value reads this instead, so the read
 * still occurs (and finds nothing). They are never returned or observable by a caller.
 */
const ABSENT_ID = "-";
/** A fixed, valid-shaped stand-in event so the recipient-boundary evaluation runs identically with or without a real event. */
const ABSENT_EVENT: AccessEvent = {
  event_id: ABSENT_ID,
  mode: "BOUNDED_SHARED_ACCESS",
  participants: [ABSENT_ID],
  source: { owner: ABSENT_ID, fact_key: ABSENT_ID, version: 1 },
  channel: "SPEECH",
  established_at: { unit: ABSENT_ID, value: 0 },
  payload: { referent: ABSENT_ID, content: ABSENT_ID, presented_attribution: null },
  representation: null,
  recipient_role: RECIPIENT_ROLE_PLAYER_CHARACTER,
};

/** The fact, only if it is committed under exactly this key and written by the owner that owns that key space. */
const owned = (fact: OwnerFact | undefined, key: string, owner: string): OwnerFact | null =>
  fact && fact.key === key && fact.owner === owner ? fact : null;

/** The identity of the latest sealed transaction named by the temporal state, or the sentinel when there is none. */
const lastTransactionOf = (stateFact: OwnerFact | undefined): string => {
  const state = TemporalStateSchema.safeParse(stateFact?.value);
  return state.success && state.data.last_transaction !== null
    ? state.data.last_transaction
    : ABSENT_ID;
};

/** Every condition is evaluated before any is consulted: a conjunction with no short-circuit between its operands. */
const all = (...conditions: boolean[]): boolean =>
  conditions.reduce((a, c) => (a ? c : false), true);

/**
 * Derives the Event-Signal Projection of one Accessible Content Packet, or refuses with the one opaque refusal.
 * Disposable and non-canonical: the returned value is not state and is never stored by this module.
 */
export function deriveEventSignalProjection(
  view: ProjectionStateView,
  request: unknown,
): Result<EventSignalProjection, EventSignalErrorCode> {
  return run(view, request, []);
}

/**
 * The same derivation, additionally returning the ordered names of the steps it actually executed. It exists so the
 * control-flow shape can be asserted directly (never wall-clock timing); it returns the identical result and makes the
 * identical reads.
 */
export function traceEventSignalDerivation(
  view: ProjectionStateView,
  request: unknown,
): {
  readonly result: Result<EventSignalProjection, EventSignalErrorCode>;
  readonly steps: readonly EventSignalDerivationStep[];
} {
  const steps: EventSignalDerivationStep[] = [];
  return { result: run(view, request, steps), steps };
}

function run(
  view: ProjectionStateView,
  request: unknown,
  trace: EventSignalDerivationStep[],
): Result<EventSignalProjection, EventSignalErrorCode> {
  /** Executes one named step unconditionally; an internal failure degrades that step to its fallback, never the flow. */
  const step = <T>(name: EventSignalDerivationStep, fallback: T, fn: () => T): T => {
    trace.push(name);
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  const req = step<{ event_id: string; recipient_id: string } | null>("request", null, () => {
    const parsed = EventSignalRequestSchema.safeParse(request);
    return parsed.success ? parsed.data : null;
  });
  const eventId = req?.event_id ?? ABSENT_ID;
  const recipient = req?.recipient_id ?? ABSENT_ID;
  const packetKey = accessPacketKey(eventId, recipient);

  // -- the eight identity reads: always these, always in this order ----------------------------------------------------
  const binding = step("read:binding", undefined, () => view.getFact(PLAYER_CHARACTER_BINDING_KEY));
  const ledger = step("read:ledger", undefined, () => view.getFact(populationLedgerKey(recipient)));
  const eventFact = step("read:event", undefined, () => view.getFact(accessEventKey(eventId)));
  const packetFact = step("read:packet", undefined, () => view.getFact(packetKey));
  const stateFact = step("read:state", undefined, () => view.getFact(TEMPORAL_STATE_KEY));
  const txFact = step("read:transaction", undefined, () =>
    view.getFact(temporalTransactionKey(lastTransactionOf(stateFact))),
  );
  const authorityFact = step("read:authority", undefined, () =>
    view.getFact(temporalTransactionAuthorityKey(lastTransactionOf(stateFact))),
  );
  const formationGroup = step("read:formation", null, () =>
    view.committedGroup(packetFact?.provenance.intent_id ?? ABSENT_ID),
  );

  // -- parse every committed value, whether or not it exists ----------------------------------------------------------
  const event = step("parse:event", undefined, () => {
    const o = owned(eventFact, accessEventKey(eventId), OWNER_EPISTEMIC_ACCESS);
    const parsed = AccessEventSchema.safeParse(o?.value);
    return parsed.success && o ? parsed.data : undefined;
  });
  const packet = step("parse:packet", undefined, () => {
    const o = owned(packetFact, packetKey, OWNER_EPISTEMIC_ACCESS);
    const parsed = AccessiblePacketSchema.safeParse(o?.value);
    return parsed.success && o ? parsed.data : undefined;
  });
  const state = step("parse:state", undefined, () => {
    const o = owned(stateFact, TEMPORAL_STATE_KEY, OWNER_TEMPORAL_KERNEL);
    const parsed = TemporalStateSchema.safeParse(o?.value);
    return parsed.success && o ? parsed.data : undefined;
  });
  const lastTransaction = lastTransactionOf(stateFact);
  const tx = step("parse:transaction", undefined, () => {
    const o = owned(txFact, temporalTransactionKey(lastTransaction), OWNER_TEMPORAL_KERNEL);
    const parsed = ResolutionTransactionSchema.safeParse(o?.value);
    return parsed.success && o ? parsed.data : undefined;
  });

  // -- the four checks: each runs for every cause ---------------------------------------------------------------------
  // 1. the engine-side event classifies the recipient path (it is never projected); the committed Role Registry binding must
  //    name the recipient NOW (I-001 §4 step 1). A Named-Actor packet is never the PC's.
  const recipientOk = step("check:recipient", false, () => {
    const e = event ?? ABSENT_EVENT;
    const prefetched = {
      get: (k: string) => (k === PLAYER_CHARACTER_BINDING_KEY ? binding : undefined),
      has: (k: string) => k === populationLedgerKey(recipient) && ledger !== undefined,
    };
    return all(
      event !== undefined,
      e.event_id === eventId,
      isPcRecipientEvent(e),
      eventRecipient(e) === recipient,
      recipientBoundaryViolation(prefetched, e) === null,
    );
  });
  // 2. the actor-safe packet is the only content source and is exactly the event's received route and payload
  const packetOk = step("check:packet", false, () => {
    const e = event ?? ABSENT_EVENT;
    const p = packet;
    return all(
      p !== undefined,
      owned(packetFact, packetKey, OWNER_EPISTEMIC_ACCESS)?.secrecy ===
        ACCESS_CLASS_ACTOR_ACCESSIBLE,
      p?.recipient === recipient,
      p?.payload.referent === e.payload.referent,
      p?.payload.content === e.payload.content,
      p?.presented_attribution === e.payload.presented_attribution,
      p?.access.channel === e.channel,
      p !== undefined && canonicalEqual(p.access.established_at, e.established_at),
    );
  });
  // 3. current arrival: the packet's formation is recorded by the latest sealed resolution transaction, and the arrival does
  //    not lie in the future of the canonical clock (see header)
  const stage = accessPacketStage(eventId, recipient);
  const formed = tx?.stages.find((s) => canonicalEqual(s.stage, stage));
  const arrivalOk = step("check:arrival", false, () =>
    all(
      state !== undefined,
      state?.last_transaction !== null,
      tx !== undefined,
      tx?.transaction_id === lastTransaction,
      state !== undefined &&
        tx !== undefined &&
        compareTime(tx.outcome.actual_stop, state.canonical_time) === 0,
      state !== undefined &&
        packet !== undefined &&
        [-1, 0].includes(compareTime(packet.access.established_at, state.canonical_time) ?? 2),
      formed !== undefined,
      formed?.group_id === stageGroupId(stage),
      formed?.group_id === packetFact?.provenance.group_id,
      formed?.writes.some((w) => w.key === packetKey && w.version === packetFact?.version) === true,
    ),
  );
  // 4. ... and it was FORMED by that transaction, not merely re-engaged (adopted by identity) by it: the committed formation
  //    group's last dependency is the durable authority of the transaction that opened it
  const formationOk = step("check:formation", false, () => {
    const authorityGroup = transactionAuthorityGroupId(lastTransaction);
    const authority = owned(
      authorityFact,
      temporalTransactionAuthorityKey(lastTransaction),
      OWNER_TEMPORAL_KERNEL,
    );
    return all(
      authority?.provenance.group_id === authorityGroup,
      formationGroup !== null,
      formationGroup?.group_id === formed?.group_id,
      formationGroup?.depends_on[(formationGroup?.depends_on.length ?? 1) - 1] === authorityGroup,
    );
  });

  // -- the candidate projection is composed for every cause (from the packet alone, or from a fixed stand-in), then judged --
  const candidate = step("compose", undefined, () => {
    const parsed = EventSignalProjectionSchema.safeParse({
      projection: PROJECTION_EVENT_SIGNAL,
      disposable: true,
      viewpoint: {
        role: RECIPIENT_ROLE_PLAYER_CHARACTER,
        entity_id: packet?.recipient ?? ABSENT_ID,
      },
      contact: { channel: packet?.access.channel ?? ABSENT_EVENT.channel },
      payload: {
        referent: packet?.payload.referent ?? ABSENT_ID,
        content: packet?.payload.content ?? ABSENT_ID,
      },
      presented_attribution: packet?.presented_attribution ?? null,
    });
    return parsed.success ? parsed.data : undefined;
  });
  return step("verdict", unavailable(), () =>
    candidate !== undefined && all(req !== null, recipientOk, packetOk, arrivalOk, formationOk)
      ? ok(candidate)
      : unavailable(),
  );
}
