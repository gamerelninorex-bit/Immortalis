import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  AccessEventSchema,
  AccessiblePacketSchema,
  EventSignalProjectionSchema,
  EventSignalRequestSchema,
  OWNER_EPISTEMIC_ACCESS,
  OWNER_TEMPORAL_KERNEL,
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
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
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
 */

/** Read-only access to committed facts by identity: the only capability the projection is given. */
export type ProjectionStateView = Pick<CampaignStore, "getFact" | "committedGroup">;

export type EventSignalErrorCode = typeof PROJECTION_UNAVAILABLE;

const unavailable = () => fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);

/** The fact, only if it is committed and written by the owner that owns that key space. */
const ownedFact = (view: ProjectionStateView, key: string, owner: string): OwnerFact | null => {
  const fact = view.getFact(key);
  return fact && fact.key === key && fact.owner === owner ? fact : null;
};

/**
 * Derives the Event-Signal Projection of one Accessible Content Packet, or refuses with the one opaque refusal.
 * Disposable and non-canonical: the returned value is not state and is never stored by this module.
 */
export function deriveEventSignalProjection(
  view: ProjectionStateView,
  request: unknown,
): Result<EventSignalProjection, EventSignalErrorCode> {
  try {
    return derive(view, request);
  } catch {
    // an internal failure is never an observable cause (RC-14): it is the same refusal
    return unavailable();
  }
}

function derive(
  view: ProjectionStateView,
  request: unknown,
): Result<EventSignalProjection, EventSignalErrorCode> {
  const req = EventSignalRequestSchema.safeParse(request);
  if (!req.success) return unavailable();
  const { event_id: eventId, recipient_id: recipient } = req.data;
  const facts = {
    get: (k: string) => view.getFact(k),
    has: (k: string) => view.getFact(k) !== undefined,
  };

  // 1. the engine-side event is read ONLY to classify the packet's recipient path; nothing of it reaches the output.
  //    It must be the active-PC path (the event asserts `role.player_character`), and the committed Role Registry binding
  //    must still name the recipient NOW (I-001 §4 step 1: resolve the active viewpoint first). A Named-Actor packet is
  //    never projected as the PC's, and a PC who is no longer (or never was) the bound one gets nothing.
  const eventFact = ownedFact(view, accessEventKey(eventId), OWNER_EPISTEMIC_ACCESS);
  const event = eventFact ? AccessEventSchema.safeParse(eventFact.value) : undefined;
  if (!event?.success || event.data.event_id !== eventId) return unavailable();
  if (!isPcRecipientEvent(event.data) || eventRecipient(event.data) !== recipient)
    return unavailable();
  if (recipientBoundaryViolation(facts, event.data) !== null) return unavailable();

  // 2. the actor-safe packet, by identity: the one surface an actor-side consumer may read (F-014D §2.1, §18)
  const packetKey = accessPacketKey(eventId, recipient);
  const packetFact = ownedFact(view, packetKey, OWNER_EPISTEMIC_ACCESS);
  const packet = packetFact ? AccessiblePacketSchema.safeParse(packetFact.value) : undefined;
  if (!packetFact || !packet?.success) return unavailable();
  const p = packet.data;
  if (packetFact.secrecy !== ACCESS_CLASS_ACTOR_ACCESSIBLE || p.recipient !== recipient)
    return unavailable();
  // the packet is exactly the event's received route and payload (a tampered packet is no arrival)
  const e = event.data;
  if (
    p.payload.referent !== e.payload.referent ||
    p.payload.content !== e.payload.content ||
    p.presented_attribution !== e.payload.presented_attribution ||
    p.access.channel !== e.channel ||
    !canonicalEqual(p.access.established_at, e.established_at)
  ) {
    return unavailable();
  }

  // 3. current arrival: the packet was formed by a stage of the latest sealed resolution transaction (see header)
  const stateFact = ownedFact(view, TEMPORAL_STATE_KEY, OWNER_TEMPORAL_KERNEL);
  const state = stateFact ? TemporalStateSchema.safeParse(stateFact.value) : undefined;
  if (!state?.success || state.data.last_transaction === null) return unavailable();
  const txFact = ownedFact(
    view,
    temporalTransactionKey(state.data.last_transaction),
    OWNER_TEMPORAL_KERNEL,
  );
  const tx = txFact ? ResolutionTransactionSchema.safeParse(txFact.value) : undefined;
  if (!tx?.success || tx.data.transaction_id !== state.data.last_transaction) return unavailable();
  if (compareTime(tx.data.outcome.actual_stop, state.data.canonical_time) !== 0)
    return unavailable();
  // an arrival cannot lie in the future of the canonical clock
  const arrived = compareTime(p.access.established_at, state.data.canonical_time);
  if (arrived !== -1 && arrived !== 0) return unavailable();
  const stage = accessPacketStage(eventId, recipient);
  const formed = tx.data.stages.find((s) => canonicalEqual(s.stage, stage));
  if (
    !formed ||
    formed.group_id !== stageGroupId(stage) ||
    formed.group_id !== packetFact.provenance.group_id ||
    !formed.writes.some((w) => w.key === packetKey && w.version === packetFact.version)
  ) {
    return unavailable();
  }
  // ... and it was FORMED by that transaction, not merely re-engaged (adopted by identity) by it: the committed formation
  // group's last dependency is the durable authority of the transaction that opened it
  const authorityGroup = transactionAuthorityGroupId(state.data.last_transaction);
  const authority = ownedFact(
    view,
    temporalTransactionAuthorityKey(state.data.last_transaction),
    OWNER_TEMPORAL_KERNEL,
  );
  const group = view.committedGroup(packetFact.provenance.intent_id);
  if (
    authority?.provenance.group_id !== authorityGroup ||
    !group ||
    group.group_id !== formed.group_id ||
    group.depends_on[group.depends_on.length - 1] !== authorityGroup
  ) {
    return unavailable();
  }

  // 4. compose the smallest faithful projection, from the actor-safe packet alone (I-001 §4 step 4; §9)
  const projection = EventSignalProjectionSchema.safeParse({
    projection: PROJECTION_EVENT_SIGNAL,
    disposable: true,
    viewpoint: { role: RECIPIENT_ROLE_PLAYER_CHARACTER, entity_id: p.recipient },
    contact: { channel: p.access.channel },
    payload: { referent: p.payload.referent, content: p.payload.content },
    presented_attribution: p.presented_attribution,
  });
  return projection.success ? ok(projection.data) : unavailable();
}
