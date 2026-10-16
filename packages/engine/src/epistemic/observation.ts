import {
  AccessEventSchema,
  OBSERVATION_EVENT_BASIS,
  OWNER_REFEREE_KERNEL,
  OWNER_WORLD_STATE,
  RECIPIENT_ROLE_PLAYER_CHARACTER,
  REFEREE_OP_OBSERVATION,
  RefereeDecisionRecordSchema,
  fail,
  observationEventCause,
  observationEventGroupId,
  observationEventIntentId,
  ok,
  refereeDecisionKey,
  timeEquals,
  worldLocusKey,
  worldProfileKey,
  type AccessEvent,
  type CanonicalTime,
  type CommitGroup,
  type OwnerFact,
  type RefereeDecisionRecord,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import {
  OBSERVATION_OUTCOME_FACT_ID,
  committedCanonicalTime,
  recordContextViolation,
} from "../referee/derive.ts";

/**
 * Pure derivations of the OBSERVATION-EARNED Access Event (BLUE v5.2, F-014D §§2, 5 steps 2-4, 6, 21.1). The Epistemic owner publishes
 * the BOUNDED_SHARED_ACCESS event of a direct observation ONLY as a function of the retained `F014D_DIRECT_PERCEPTION` referee decision
 * whose engine-derived verdict is OBSERVATION_ESTABLISHED: every field of the event — recipient, channel, basis time, foreign source pin
 * and payload — is computed here from that record, so no caller can supply, choose or alter any of it. Admission and load verification
 * re-derive the event with the same functions, so a committed observation-earned event is exactly what its decision determines and
 * nothing else. Nothing here reads, interprets or invents physical meaning: the interpretation is the host's, retained and quote-anchored
 * in the record, and the verdict that gates the receipt was derived by the engine from that answer.
 */

export type ObservationRecord = Extract<
  RefereeDecisionRecord,
  { operation: typeof REFEREE_OP_OBSERVATION }
>;

/** The observation record a committed referee fact holds, or null when it is not one. */
export function observationRecordOf(fact: OwnerFact | undefined): ObservationRecord | null {
  if (
    !fact ||
    fact.owner !== OWNER_REFEREE_KERNEL ||
    resolveKey(fact.key)?.kind.id !== "referee_decision"
  )
    return null;
  const parsed = RefereeDecisionRecordSchema.safeParse(fact.value);
  return parsed.success && parsed.data.operation === REFEREE_OP_OBSERVATION ? parsed.data : null;
}

/**
 * The identity of the observation-earned event: derived from the character and the canonical basis alone, so one character has at most
 * one observation event per canonical instant, whatever decision attempt reached it. A new observation is a separately caused operation
 * at a different basis.
 */
export const observationEventId = (pcId: string, at: CanonicalTime): string =>
  `obs-${sha256Canonical({ observation: 1, pc_id: pcId, at })}`;

/**
 * The event the record determines (or why it determines none). Only a retained decision whose derived verdict is
 * OBSERVATION_ESTABLISHED, with its appearance stated, yields an event; every other reading yields no receipt.
 */
export function deriveObservationEvent(record: ObservationRecord): Result<AccessEvent> {
  const d = record.decision;
  if (record.verdict !== "OBSERVATION_ESTABLISHED" || d.payload === null)
    return fail(
      "OBSERVATION_NOT_ESTABLISHED",
      "only an established direct-perception reading earns a receipt: an obstructed, unresolved or conflicting reading earns none",
    );
  const ids = /^world\/([^/]+)\/profile$/.exec(
    record.input.refs.find((r) => /^world\/[^/]+\/profile$/.test(r.fact_key))?.fact_key ?? "",
  );
  const worldId = ids?.[1];
  const locusRef = record.input.refs.find((r) => /^world\/[^/]+\/locus\/[^/]+$/.test(r.fact_key));
  const locusMatch = locusRef ? /^world\/([^/]+)\/locus\/([^/]+)$/.exec(locusRef.fact_key) : null;
  if (!worldId || !locusMatch || locusMatch[1] !== worldId)
    return fail("OBSERVATION_RECORD_INVALID", "the record cites the world and the locus");
  // the appearance is of a world fact, a locus fact, or (CPAA-C1 v0.2 PROVISIONAL) the sealed delivery of the character's own
  // completed collection: always a committed World-State fact the record cites
  const deliveryRef = record.input.refs.find((r) =>
    new RegExp(`^world/${worldId}/source-delivery/.+$`).test(r.fact_key),
  );
  const sourceKey = d.payload.source_fact_id.startsWith("world.")
    ? worldProfileKey(worldId)
    : d.payload.source_fact_id.startsWith("locus.")
      ? worldLocusKey(worldId, locusMatch[2]!)
      : d.payload.source_fact_id === OBSERVATION_OUTCOME_FACT_ID && deliveryRef
        ? deliveryRef.fact_key
        : null;
  const pin = sourceKey ? record.input.refs.find((r) => r.fact_key === sourceKey) : undefined;
  if (!sourceKey || !pin || pin.version < 1)
    return fail(
      "OBSERVATION_RECORD_INVALID",
      "the appearance is of a committed world fact, locus fact or collection outcome the record cites",
    );
  const event = AccessEventSchema.safeParse({
    event_id: observationEventId(record.subject.pc_id, record.input.observed_at),
    mode: "BOUNDED_SHARED_ACCESS",
    participants: [record.subject.pc_id],
    source: { owner: OWNER_WORLD_STATE, fact_key: sourceKey, version: pin.version },
    channel: "PERCEPTION",
    established_at: record.input.observed_at,
    payload: {
      referent: d.payload.referent,
      content: d.payload.content,
      presented_attribution: null,
    },
    representation: null,
    recipient_role: RECIPIENT_ROLE_PLAYER_CHARACTER,
  });
  return event.success
    ? ok(event.data)
    : fail("OBSERVATION_RECORD_INVALID", "the record's appearance is not a valid access payload");
}

/** The reads of the group that commits an observation-earned event: the decision first, then every premise it cites, in the record's order. */
export const observationEventReads = (
  record: ObservationRecord,
  decision: { key: string; version: number },
): CommitGroup["reads"] => [
  { key: decision.key, version: decision.version },
  ...record.input.refs.map((r) => ({ key: r.fact_key, version: r.version })),
];

/** The groups that committed those reads, deduplicated in first-seen order. */
export const observationEventDependencies = (
  record: ObservationRecord,
  decisionGroup: string,
): string[] => [...new Set([decisionGroup, ...record.input.refs.map((r) => r.group_id)])];

export interface ObservationEventEvidence {
  readonly group: Pick<
    CommitGroup,
    "campaign_id" | "group_id" | "intent_id" | "cause" | "reads" | "depends_on"
  >;
  /** the event as written */
  readonly value: unknown;
  /** the basis label the event was written with */
  readonly basis: string;
  readonly factOf: (key: string) => OwnerFact | undefined;
}

/**
 * Why a committed (or proposed) observation-earned event is not exactly what its retained decision determines, or null. One rule for
 * IM-11 admission (`ADMISSION`: every cited fact is still at its cited version and the basis is the current one) and for load
 * verification (`VERIFICATION`: the facts as they were cited; a later canonical time never invalidates a past observation).
 */
export function observationEventViolation(
  ev: ObservationEventEvidence,
  phase: "ADMISSION" | "VERIFICATION",
): string | null {
  const e = AccessEventSchema.safeParse(ev.value);
  if (!e.success) return "an observation-earned event satisfies the access event contract";
  const first = ev.group.reads[0];
  if (!first || resolveKey(first.key)?.kind.id !== "referee_decision")
    return "an observation-earned event reads the retained direct-perception decision first";
  const decisionFact = ev.factOf(first.key);
  const record = observationRecordOf(decisionFact);
  if (!decisionFact || !record || first.key !== refereeDecisionKey(record.task_id))
    return "an observation-earned event reads a retained direct-perception decision";
  if (record.campaign_id !== ev.group.campaign_id)
    return "the retained decision is this campaign's own";
  const derived = deriveObservationEvent(record);
  if (!derived.ok) return derived.error.message;
  if (!canonicalEqual(derived.value, e.data))
    return "an observation-earned event is exactly what its retained decision determines: the recipient, channel, basis, source pin and payload are not the caller's";
  const eventId = e.data.event_id;
  if (
    ev.group.group_id !== observationEventGroupId(eventId) ||
    ev.group.intent_id !== observationEventIntentId(eventId) ||
    ev.group.cause !== observationEventCause(eventId) ||
    ev.basis !== OBSERVATION_EVENT_BASIS
  )
    return "an observation-earned event is committed under the identities and basis its event derives";
  const expectedReads = observationEventReads(record, first);
  if (
    !canonicalEqual(
      ev.group.reads.map((r) => [r.key, r.version]),
      expectedReads.map((r) => [r.key, r.version]),
    )
  )
    return "an observation-earned event reads its retained decision and exactly the premises that decision cites, at the cited versions";
  const deps = observationEventDependencies(record, decisionFact.provenance.group_id);
  if (
    ev.group.depends_on.length !== deps.length ||
    deps.some((g, i) => ev.group.depends_on[i] !== g)
  )
    return "an observation-earned event depends on exactly the groups that committed its decision and premises";
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
      return "an observation is earned at the current canonical basis only: a changed basis requires a new question";
  }
  return null;
}
