import {
  ACTOR_OBSERVATION_REFS,
  ACTOR_OBSERVATION_SOURCE_INDEX,
  AccessEventSchema,
  OBSERVATION_EVENT_BASIS,
  OBSERVATION_TRIGGER_KIND,
  OWNER_REFEREE_KERNEL,
  OWNER_WORLD_STATE,
  PLAYER_CHOICE_AUTHORITY,
  REFEREE_OP_ACTOR_OBSERVATION,
  RefereeDecisionRecordSchema,
  accessEventKey,
  accessPacketStage,
  fail,
  observationEventCause,
  observationEventGroupId,
  observationEventIntentId,
  observationTransactionCause,
  observationTransactionId,
  ok,
  parseWorldSourceConditionKey,
  refereeDecisionKey,
  timeEquals,
  type AccessEvent,
  type CanonicalTime,
  type CommitGroup,
  type OwnerFact,
  type RefereeDecisionRecord,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { committedCanonicalTime, recordContextViolation } from "../referee/derive.ts";
import { TemporalCoordinator } from "../temporal/coordinator.ts";
import { StageProviderRegistry } from "../temporal/providers.ts";
import { EpistemicAccessAdapter } from "./adapter.ts";
import type { ObservationFormationCode, ObservationFormed } from "./direct-observation.ts";
import type { ObservationEventEvidence } from "./observation.ts";
import { epistemicPacketProvider } from "./provider.ts";

/**
 * Pure derivations of the ACTOR-OBSERVATION-EARNED Access Event (BLUE v5.2-A1, F-014D §§2, 5 steps 2-4, 6, 18, 21.1, 24): the event of a
 * source-qualified direct perception by ONE non-PC Named Actor. The Epistemic owner publishes the BOUNDED_SHARED_ACCESS event ONLY as a
 * function of the retained `F014D_ACTOR_DIRECT_PERCEPTION` referee decision whose engine-derived verdict is OBSERVATION_ESTABLISHED: every
 * field of the event — recipient, channel, basis time, foreign source pin and payload — is computed here from that record, so no caller can
 * supply, choose or alter any of it, and the recipient is a Named Actor (the event omits `recipient_role`: it is never the active Player
 * Character). Admission and load verification re-derive the event with the same functions, so a committed actor-observation-earned event is
 * exactly what its decision determines and nothing else. Nothing here reads, interprets or invents physical meaning, and nothing here
 * writes actor-side state: comprehension, significance, belief, stance, goals and action remain F-014A's.
 */

export type ActorObservationRecord = Extract<
  RefereeDecisionRecord,
  { operation: typeof REFEREE_OP_ACTOR_OBSERVATION }
>;

/** The actor direct-perception record a committed referee fact holds, or null when it is not one. */
export function actorObservationRecordOf(
  fact: OwnerFact | undefined,
): ActorObservationRecord | null {
  if (
    !fact ||
    fact.owner !== OWNER_REFEREE_KERNEL ||
    resolveKey(fact.key)?.kind.id !== "referee_decision"
  )
    return null;
  const parsed = RefereeDecisionRecordSchema.safeParse(fact.value);
  return parsed.success && parsed.data.operation === REFEREE_OP_ACTOR_OBSERVATION
    ? parsed.data
    : null;
}

/**
 * The identity of the actor-observation-earned event: derived from the actor and the canonical basis alone (in a namespace of its own, so it
 * can never collide with a PC observation event), so one actor has at most one such event per canonical instant, whatever decision attempt
 * reached it. A new observation is a separately caused operation at a different basis.
 */
export const actorObservationEventId = (actorId: string, at: CanonicalTime): string =>
  `actor-obs-${sha256Canonical({ actor_observation: 1, actor_id: actorId, at })}`;

/**
 * The event the record determines (or why it determines none). Only a retained decision whose derived verdict is OBSERVATION_ESTABLISHED,
 * with its appearance stated, yields an event; every other reading yields no receipt.
 */
export function deriveActorObservationEvent(record: ActorObservationRecord): Result<AccessEvent> {
  const d = record.decision;
  if (record.verdict !== "OBSERVATION_ESTABLISHED" || d.payload === null)
    return fail(
      "OBSERVATION_NOT_ESTABLISHED",
      "only an established direct-perception reading earns a receipt: an obstructed, unresolved or conflicting reading earns none",
    );
  const refs = record.input.refs;
  const scoped = refs[ACTOR_OBSERVATION_SOURCE_INDEX];
  const world = /^world\/([^/]+)\/profile$/.exec(refs[2]?.fact_key ?? "")?.[1];
  const named = scoped ? parseWorldSourceConditionKey(scoped.fact_key) : null;
  if (
    refs.length !== ACTOR_OBSERVATION_REFS ||
    !scoped ||
    !world ||
    !named ||
    named.world_id !== world ||
    scoped.version < 1 ||
    !d.payload.source_fact_id.startsWith("source.")
  )
    return fail(
      "OBSERVATION_RECORD_INVALID",
      "the appearance is of the one Source Condition the record is scoped to, and only of it",
    );
  const event = AccessEventSchema.safeParse({
    event_id: actorObservationEventId(record.subject.actor_id, record.input.observed_at),
    mode: "BOUNDED_SHARED_ACCESS",
    participants: [record.subject.actor_id],
    source: { owner: OWNER_WORLD_STATE, fact_key: scoped.fact_key, version: scoped.version },
    channel: "PERCEPTION",
    established_at: record.input.observed_at,
    payload: {
      referent: d.payload.referent,
      content: d.payload.content,
      presented_attribution: null,
    },
    representation: null,
  });
  return event.success
    ? ok(event.data)
    : fail("OBSERVATION_RECORD_INVALID", "the record's appearance is not a valid access payload");
}

/** The reads of the group that commits an actor-observation-earned event: the decision first, then every premise it cites, in the record's order. */
export const actorObservationEventReads = (
  record: ActorObservationRecord,
  decision: { key: string; version: number },
): CommitGroup["reads"] => [
  { key: decision.key, version: decision.version },
  ...record.input.refs.map((r) => ({ key: r.fact_key, version: r.version })),
];

/** The groups that committed those reads, deduplicated in first-seen order. */
export const actorObservationEventDependencies = (
  record: ActorObservationRecord,
  decisionGroup: string,
): string[] => [...new Set([decisionGroup, ...record.input.refs.map((r) => r.group_id)])];

/**
 * Why a committed (or proposed) actor-observation-earned event is not exactly what its retained decision determines, or null. One rule for
 * IM-11 admission (`ADMISSION`: every cited fact is still at its cited version and the basis is the current one) and for load verification
 * (`VERIFICATION`: the facts as they were cited; a later canonical time or a later version of a cited fact never invalidates a past
 * observation).
 */
export function actorObservationEventViolation(
  ev: ObservationEventEvidence,
  phase: "ADMISSION" | "VERIFICATION",
): string | null {
  const e = AccessEventSchema.safeParse(ev.value);
  if (!e.success) return "an actor-observation-earned event satisfies the access event contract";
  const first = ev.group.reads[0];
  if (!first || resolveKey(first.key)?.kind.id !== "referee_decision")
    return "an actor-observation-earned event reads the retained actor direct-perception decision first";
  const decisionFact = ev.factOf(first.key);
  const record = actorObservationRecordOf(decisionFact);
  if (!decisionFact || !record || first.key !== refereeDecisionKey(record.task_id))
    return "an actor-observation-earned event reads a retained actor direct-perception decision";
  if (record.campaign_id !== ev.group.campaign_id)
    return "the retained decision is this campaign's own";
  const derived = deriveActorObservationEvent(record);
  if (!derived.ok) return derived.error.message;
  if (!canonicalEqual(derived.value, e.data))
    return "an actor-observation-earned event is exactly what its retained decision determines: the recipient, channel, basis, source pin and payload are not the caller's";
  const eventId = e.data.event_id;
  if (
    ev.group.group_id !== observationEventGroupId(eventId) ||
    ev.group.intent_id !== observationEventIntentId(eventId) ||
    ev.group.cause !== observationEventCause(eventId) ||
    ev.basis !== OBSERVATION_EVENT_BASIS
  )
    return "an actor-observation-earned event is committed under the identities and basis its event derives";
  const expectedReads = actorObservationEventReads(record, first);
  if (
    !canonicalEqual(
      ev.group.reads.map((r) => [r.key, r.version]),
      expectedReads.map((r) => [r.key, r.version]),
    )
  )
    return "an actor-observation-earned event reads its retained decision and exactly the premises that decision cites, at the cited versions";
  const deps = actorObservationEventDependencies(record, decisionFact.provenance.group_id);
  if (
    ev.group.depends_on.length !== deps.length ||
    deps.some((g, i) => ev.group.depends_on[i] !== g)
  )
    return "an actor-observation-earned event depends on exactly the groups that committed its decision and premises";
  for (const ref of record.input.refs) {
    const f = ev.factOf(ref.fact_key);
    if (!f) return `a cited premise is not committed: ${ref.fact_key}`;
    if (
      phase === "ADMISSION" &&
      (f.version !== ref.version || f.provenance.group_id !== ref.group_id)
    )
      return `a cited premise is no longer at its cited version: ${ref.fact_key}`;
    if (phase === "VERIFICATION" && f.version < ref.version)
      return `a cited premise is behind its cited version: ${ref.fact_key}`;
  }
  const violation = recordContextViolation(record, ev.factOf);
  if (violation) return `the retained decision no longer re-derives: ${violation.message}`;
  if (phase === "ADMISSION") {
    const now = committedCanonicalTime(ev.factOf);
    if (
      !now ||
      !timeEquals(now, e.data.established_at) ||
      !timeEquals(now, record.input.observed_at)
    )
      return "an actor observation is earned at the current canonical basis only: a changed basis requires a new question";
  }
  return null;
}

const isFatal = (code: string): boolean =>
  code === "UNKNOWN_OUTCOME" || code === "STORE_POISONED" || code === "STORE_CLOSED";

/**
 * A retained actor direct-perception decision earns an owner-committed access event, which triggers the existing packet provider through
 * F-017 §4 under the durable IM-02 transaction authority, at the unchanged current basis (the PC observation's formation, unchanged). No
 * material boundary, elapsed time, actor-side state or fabricated downstream consequence is added. Event, authority, packet and sealed
 * transaction retain their existing causal identities and committed-before-consumed order through retry and recovery. Only the actor's
 * Accessible Content Packet is actor-safe: the true source identity, engine keys and task details stay in the sealed provenance.
 */
export async function formActorObservedPacket(
  store: CampaignStore,
  decisionKey: string,
): Promise<Result<ObservationFormed, ObservationFormationCode>> {
  const record = actorObservationRecordOf(store.getFact(decisionKey));
  if (!record)
    return fail(
      "INPUT_INVALID",
      "the cited decision is not a retained actor direct-perception decision",
    );
  const derived = deriveActorObservationEvent(record);
  if (!derived.ok) return fail(derived.error.code, derived.error.message);
  const derivedEvent = derived.value;
  const eventId = derivedEvent.event_id;
  const recipient = derivedEvent.participants[0]!;

  // 1. the event
  const event = await new EpistemicAccessAdapter(store).establishActorObservedAccess({
    decision_key: decisionKey,
  });
  if (!event.ok) {
    const winner = store.getFact(accessEventKey(eventId));
    // an event THIS decision already earned is its replay (a lost reply, a restart); an event another decision earned, or any other
    // refusal, is a refusal: a different reading of an already observed instant never replaces or re-earns the observation
    const earnedBy = winner
      ? store.committedGroup(winner.provenance.intent_id)?.reads[0]?.key
      : undefined;
    if (
      isFatal(event.error.code) ||
      !winner ||
      earnedBy !== decisionKey ||
      !canonicalEqual(winner.value, derivedEvent)
    )
      return fail(
        event.error.code === "VALUE_INVALID" || event.error.code === "REFERENCE_INVALID"
          ? "OBSERVATION_REFUSED"
          : event.error.code,
        event.error.message,
      );
  }
  const eventFact = store.getFact(accessEventKey(eventId));
  const committed = eventFact ? AccessEventSchema.safeParse(eventFact.value) : undefined;
  if (!eventFact || !committed?.success)
    return fail("OBSERVATION_RECORD_INVALID", "the committed observation event is not readable");

  // F-017 §4: the committed event triggers its own owner stage. No temporal object or boundary is registered; F-014B §6's (T0,T1] index
  // is untouched. The kernel's transaction context admits only the already-approved pair (no new authority exists); it confers nothing
  // here: the receipt was earned by the retained decision, and the formation only transcribes the committed event.
  const coordinator = new TemporalCoordinator(
    store,
    new StageProviderRegistry([epistemicPacketProvider]),
  );
  const transactionId = observationTransactionId(eventId);
  const advanced = await coordinator.advance({
    transaction_id: transactionId,
    cause: observationTransactionCause(eventId),
    trigger: { kind: OBSERVATION_TRIGGER_KIND, ref: eventId },
    continues: null,
    requested: { target: committed.data.established_at, condition: null },
    context: { ...PLAYER_CHOICE_AUTHORITY },
    publication: { basis: OBSERVATION_EVENT_BASIS, secrecy: "engine-internal" },
  });
  if (!advanced.ok)
    return fail(
      isFatal(advanced.error.code) ? advanced.error.code : "TRANSACTION_REFUSED",
      advanced.error.message,
    );
  const stage = accessPacketStage(eventId, recipient);
  const t = advanced.value.transaction;
  if (
    t.outcome.unresolved_dependents.length > 0 ||
    !t.stages.some((s) => canonicalEqual(s.stage, stage))
  )
    return fail("FORMATION_UNRESOLVED", "the observation's packet formation did not close");
  return ok({
    event_id: eventId,
    recipient_id: recipient,
    transaction_id: transactionId,
    replayed: advanced.value.replayed,
  });
}
