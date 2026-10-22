import {
  ACTOR_OBSERVATION_SOURCE_INDEX,
  EntityId,
  REFEREE_AUTHORITY,
  REFEREE_OP_ACTOR_OBSERVATION,
  RefereeDecisionRecordSchema,
  accessEventKey,
  accessPacketKey,
  parseWorldSourceConditionKey,
  type CanonicalTime,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  RefereeAdjudicationAdapter,
  actorObservationEventId,
  formActorObservedPacket,
  verifyEpistemicIntegrity,
  verifyRefereeIntegrity,
  type FsOps,
  type StageOwnerExtension,
} from "@immortalis/engine";
import { consumeConfirmation, requestOperatorDecision, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { askActorObservation, type RefereeRuntime } from "./referee-session.ts";
import { LocalOperatorSession, defaultOperatorDir } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * The NON-PC Named-Actor SOURCE-QUALIFIED DIRECT PHYSICAL PERCEPTION, as the trusted local operator's request (BLUE v5.2-A1, mechanism only).
 *
 * An already-existing, lawfully non-PC Named Actor whose own capability its owner has closed and whom World-State holds coupled to ONE locus
 * has no perception yet: nothing in canon says it ever sensed the Source Condition that lies at that locus. This command is the one
 * production operation that can earn that receipt, for ONE actor, ONE source and ONE canonical basis. It asks the AI referee host ONE bounded
 * F-014D §6 question built only from committed facts (the actor's own capability, the World-State coupling, the world and the locus, and the
 * access facts of the one named source) at the current basis: is the actor's relevant sense established by its own capability, are its own
 * exact viewing circumstances established, is the path from the source to it open or blocked — and, only if all three are affirmatively
 * answered, what minimal raw appearance of the source follows. The engine validates the answer against the delivered text and DERIVES the
 * verdict. Only OBSERVATION_ESTABLISHED can earn a receipt: the Epistemic owner then commits the actor-observation-earned event (derived from
 * the retained decision, never authored), and that committed event triggers its own packet-formation stage through one event-triggered
 * resolution transaction at the unchanged canonical time (F-017 §4; no Temporal object, no indexed boundary): the actor's sealed Accessible
 * Content Packet and its Sealed Engine Provenance form together.
 *
 * What the operator is NEVER shown: the world's facts, the host's reasoning, the verdict, the appearance itself, or any difference between
 * "nothing is there", "something blocks it" and "this could not be settled". The packet is the actor's, not the player's: showing its content
 * would be player OOC knowledge becoming a receipt (F-014D §24). Every non-receipt is the same message; the retained decision is sealed
 * engine-side evidence. The command advances no time and writes no actor-side state: comprehension, significance, belief, stance, goals and
 * action are F-014A's and are not claimed. Running it again at the same basis reaches the same records (one observation per actor per
 * canonical instant); a new observation is a new basis and a new, separate choice.
 *
 * The capability and the source are TRUSTED-SIDE input only (the operator's choice of what to ask), never a host, client or model input: the
 * engine accepts them only if they are the actor's own closed capability and a committed, non-exhausted, access-described Source Condition at
 * exactly the locus the actor is coupled to.
 */

export type ActorObservationStatus =
  | "ACTOR_OBSERVATION_RECORDED"
  | "ACTOR_OBSERVATION_NOT_ESTABLISHED"
  | "ACTOR_OBSERVATION_NOT_AVAILABLE"
  | "ACTOR_OBSERVATION_VERIFICATION_FAILED"
  | "ACTOR_OBSERVATION_OUTCOME_UNKNOWN"
  | "ACTOR_OBSERVATION_REFUSED"
  | "REFEREE_PENDING"
  | "REFEREE_UNAVAILABLE"
  | "REFEREE_ANSWER_REFUSED"
  | "INVALID_REQUEST"
  | "SESSION_UNAVAILABLE"
  | "DECLINED";

export interface ActorObservationResult {
  readonly status: ActorObservationStatus;
  readonly message: string;
  readonly code?: string;
  readonly details: readonly string[];
}

const NOT_CLAIMED =
  "It advances no time and writes no actor-side state: the actor's comprehension, belief, stance, goals and action are not decided here.";

const MESSAGES: Record<ActorObservationStatus, string> = {
  ACTOR_OBSERVATION_RECORDED: `the actor's perception of the named source at this basis is recorded: the Epistemic owner holds the event, the actor's sealed Accessible Content Packet and its Sealed Engine Provenance; a fresh owner-verified open reads them back. The packet is the actor's, and its content is not shown here. ${NOT_CLAIMED}`,
  ACTOR_OBSERVATION_NOT_ESTABLISHED: "nothing was received by the actor at this basis",
  ACTOR_OBSERVATION_NOT_AVAILABLE:
    "the question cannot be asked: the actor, its capability, its coupling or the named source is not available; nothing was changed",
  ACTOR_OBSERVATION_VERIFICATION_FAILED:
    "what the campaign holds does not match what was recorded; it is NOT reported as recorded",
  ACTOR_OBSERVATION_OUTCOME_UNKNOWN:
    "the outcome of a write is not known; nothing is reported as done. Run the same command again (with --reclaim-stale-lock if the package lock was left behind): it reads what the campaign holds and goes on from there without repeating anything that committed",
  ACTOR_OBSERVATION_REFUSED: "an owner refused a write; nothing was replaced",
  REFEREE_PENDING:
    "the AI referee host has not answered yet; nothing was changed. Run the same command again: it finds the same question",
  REFEREE_UNAVAILABLE:
    "the AI referee host is not available for this question; nothing was changed",
  REFEREE_ANSWER_REFUSED:
    "the host's answers were not valid; none was used and nothing was changed",
  INVALID_REQUEST: "the request is not valid; nothing was changed",
  SESSION_UNAVAILABLE: "the campaign cannot be opened for this operator; nothing was changed",
  DECLINED: "nothing was observed; nothing was changed",
};

const result = (
  status: ActorObservationStatus,
  details: readonly string[] = [],
  code?: string,
): ActorObservationResult => ({
  status,
  message: MESSAGES[status],
  ...(code !== undefined ? { code } : {}),
  details,
});

const UNKNOWN_OUTCOME = new Set(["UNKNOWN_OUTCOME", "STORE_POISONED", "STORE_CLOSED"]);

export interface ObserveActorParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  /** TRUSTED-SIDE: the already-existing non-PC Named Actor whose perception is asked about. */
  readonly actorId: string;
  /** TRUSTED-SIDE: the actor's own closed capability its sense rests on. Never a host, client or model input. */
  readonly capabilityId: string;
  /** TRUSTED-SIDE: the one co-located Source Condition the actor is asked to have perceived. Never a host, client or model input. */
  readonly sourceKey: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  /** the owner registrations the campaign was written with (an embedding supplies them; the shipped binary has none) */
  readonly extension?: StageOwnerExtension;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
  readonly refereePolls?: number;
  readonly refereePollMs?: number;
}

const BUILD_ID = "immortalis-operator";
const TIME = (t: CanonicalTime): string => `${t.value} ${t.unit}`;

const closeQuietly = async (s: { close(): Promise<void> } | undefined): Promise<void> => {
  try {
    await s?.close();
  } catch {
    // the next run reclaims an unreleased lock explicitly and reconciles by identity
  }
};

export async function observeActor(p: ObserveActorParams): Promise<ActorObservationResult> {
  for (const [what, id] of [
    ["actor", p.actorId],
    ["capability", p.capabilityId],
    ["source", p.sourceKey],
  ] as const)
    if (!EntityId.safeParse(id).success)
      return result("INVALID_REQUEST", [`the ${what} identity is not valid`]);
  const opened = await LocalOperatorSession.open({
    campaignDir: p.campaignDir,
    expectedCampaignId: p.campaignId,
    buildId: p.buildId ?? BUILD_ID,
    ...(p.operatorDir !== undefined ? { operatorDir: p.operatorDir } : {}),
    ...(p.reclaimStaleLock ? { reclaimStaleLock: true } : {}),
    ...(p.extension ? { extension: p.extension } : {}),
    ...(p.campaignFs ? { campaignFs: p.campaignFs } : {}),
    ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
  });
  if (!opened.ok) {
    const sub = (opened.error.details as { code?: string } | undefined)?.code;
    return result(
      "SESSION_UNAVAILABLE",
      [opened.error.message],
      `${opened.error.code}${sub ? ` ${sub}` : ""}`,
    );
  }
  const session = opened.value;
  try {
    return await run(p, session);
  } catch {
    // an unexpected failure after any write may have left that write landed or not: an unknown outcome, never a success
    session.markAmbiguous();
    return result("ACTOR_OBSERVATION_OUTCOME_UNKNOWN", [
      "an unexpected failure interrupted the command",
    ]);
  } finally {
    await closeQuietly(session);
  }
}

async function run(
  p: ObserveActorParams,
  session: LocalOperatorSession,
): Promise<ActorObservationResult> {
  const { terminal, actorId, capabilityId, sourceKey, campaignId } = p;
  const campaign = session.campaign;
  const rt: RefereeRuntime = {
    stateDir: p.operatorDir ?? defaultOperatorDir(p.campaignDir),
    operatorUid: session.operator.uid,
    ...(p.ledgerFs ? { fs: p.ledgerFs } : {}),
    polls: p.refereePolls ?? 1200,
    pollMs: p.refereePollMs ?? 500,
  };
  const violations = campaign.verify();
  if (violations.length > 0)
    return result("ACTOR_OBSERVATION_NOT_AVAILABLE", ["canonical integrity reports violations"]);

  const adapter = new RefereeAdjudicationAdapter(campaign.store);
  const first = adapter.actorObservationTask({
    actor_id: actorId,
    capability_id: capabilityId,
    source_key: sourceKey,
    attempt: 0,
  });
  if (!first.ok)
    return result("ACTOR_OBSERVATION_NOT_AVAILABLE", [first.error.message], first.error.code);
  const at = first.value.context.observed_at;
  const eventId = actorObservationEventId(actorId, at);

  // An observation this basis already earned converges (a lost reply, a crash after the event, a second run): the choice was made and its
  // records exist, so what remains is completed by identity — nothing new is asked, confirmed or decided.
  let decisionKey: string;
  const earned = campaign.store.getFact(accessEventKey(eventId));
  if (earned) {
    const cited = campaign.store.committedGroup(earned.provenance.intent_id)?.reads[0]?.key;
    const citedFact = cited === undefined ? undefined : campaign.store.getFact(cited);
    const parsed = citedFact ? RefereeDecisionRecordSchema.safeParse(citedFact.value) : undefined;
    if (
      cited === undefined ||
      !parsed?.success ||
      parsed.data.operation !== REFEREE_OP_ACTOR_OBSERVATION
    )
      return result("ACTOR_OBSERVATION_VERIFICATION_FAILED", ["the earned event has no decision"]);
    // a replay is of THIS request's own observation: an observation of another source or capability holds the one basis and is never
    // shown as, nor overwritten by, this one
    const heldSource = parseWorldSourceConditionKey(
      parsed.data.input.refs[ACTOR_OBSERVATION_SOURCE_INDEX]?.fact_key ?? "",
    )?.source_key;
    if (
      heldSource !== sourceKey ||
      parsed.data.input.refs[0]?.fact_key !== first.value.context.refs[0]?.fact_key
    )
      return result("ACTOR_OBSERVATION_NOT_AVAILABLE", [
        "an observation of another source or capability already holds this canonical basis; a different look needs a new basis (nothing was changed)",
      ]);
    decisionKey = cited;
  } else {
    // a decision already retained for this very question (a negative or unresolved one included) is not asked again: the host is never
    // rerolled for a more convenient answer, and a reading already retained is never overwritten
    const retained = adapter.decision(first.value.task_id);
    if (retained && retained.value.operation === REFEREE_OP_ACTOR_OBSERVATION) {
      if (retained.value.verdict !== "OBSERVATION_ESTABLISHED") return notEstablished();
      decisionKey = retained.fact.key;
    } else {
      const pins = first.value.context.refs.map((r) => `${r.fact_key}@${r.version}`);
      const subject = subjectOf({
        verb: "observe-actor",
        campaign_id: campaignId,
        actor_id: actorId,
        capability_id: capabilityId,
        source_key: sourceKey,
        pins,
        observed_at: at,
      });
      const decision = await requestOperatorDecision(
        terminal,
        "observe-actor",
        subject,
        [
          "OBSERVE ACTOR - a separate, fresh choice. Nothing is observed yet.",
          OOC_BANNER,
          `actor: ${actorId} (a non-player actor)`,
          `capability its sense rests on: ${capabilityId}`,
          `candidate source named by you: ${sourceKey} - a candidate for the actor to have perceived, not what it perceives; its quantity, material and key are never given to the host or recorded in the actor's packet`,
          `canonical basis: ${TIME(at)}`,
          "Confirming is your request that the AI referee host be asked, NOW and at this basis, what the actor's sense directly receives from the committed physical setting. You will be shown nothing of the setting, the host's reasoning, the appearance or why nothing was received - only whether a receipt was recorded.",
          "It advances no time and decides nothing about what the actor makes of it, wants, believes or does.",
        ],
        "Anything else leaves nothing observed.",
      );
      if (
        decision.kind !== "CONFIRMED" ||
        !consumeConfirmation(decision.confirmation, "observe-actor", subject)
      )
        return result("DECLINED");

      const asked = await askActorObservation(adapter, rt, {
        campaign_id: campaignId,
        actor_id: actorId,
        capability_id: capabilityId,
        source_key: sourceKey,
      });
      if (asked.kind !== "ANSWERED") {
        const detail = [`actor: ${actorId} (no observation made)`];
        return asked.kind === "PENDING"
          ? result("REFEREE_PENDING", [...detail, `task: ${asked.task_id}`])
          : asked.kind === "UNAVAILABLE"
            ? result("REFEREE_UNAVAILABLE", [...detail, asked.message], asked.code)
            : result("REFEREE_ANSWER_REFUSED", [...detail, asked.message]);
      }
      // the reading is retained as sealed evidence whatever it derives (create-only; a negative earns no receipt)
      const recorded = await adapter.recordActorObservation({
        operation: { ...REFEREE_AUTHORITY },
        host: { host_id: asked.host.host_id, claimed_model: asked.host.claimed_model },
        actor_id: actorId,
        capability_id: capabilityId,
        source_key: sourceKey,
        attempt: asked.attempt,
        answer: asked.decision,
      });
      if (!recorded.ok) {
        if (UNKNOWN_OUTCOME.has(recorded.error.code)) {
          session.markAmbiguous();
          return result("ACTOR_OBSERVATION_OUTCOME_UNKNOWN", [
            `referee evidence: ${recorded.error.code}`,
          ]);
        }
        return result(
          "ACTOR_OBSERVATION_REFUSED",
          [`referee evidence: ${recorded.error.code}`],
          recorded.error.code,
        );
      }
      terminal.say(`PROGRESS referee DECIDED ${recorded.value.record.key}`);
      if (recorded.value.verdict !== "OBSERVATION_ESTABLISHED") return notEstablished();
      decisionKey = recorded.value.record.key;
    }
  }

  // the Epistemic owner's actor-observation-earned event and the packet formation it triggers (each by identity)
  const formed = await formActorObservedPacket(campaign.store, decisionKey);
  if (!formed.ok) {
    if (UNKNOWN_OUTCOME.has(formed.error.code)) {
      session.markAmbiguous();
      return result("ACTOR_OBSERVATION_OUTCOME_UNKNOWN", [`observation: ${formed.error.code}`]);
    }
    return result(
      "ACTOR_OBSERVATION_REFUSED",
      [`observation: ${formed.error.code}`, formed.error.message],
      formed.error.code,
    );
  }
  const packetKey = accessPacketKey(formed.value.event_id, actorId);
  terminal.say(`PROGRESS observation COMMITTED ${packetKey}`);
  await closeQuietly(session);

  // a fresh, owner-verified reopen: what is reported is what the next process will find
  const reopened = await CanonicalCampaign.open(p.campaignDir, {
    buildId: p.buildId ?? BUILD_ID,
    ...(p.extension ? { extension: p.extension } : {}),
    ...(p.campaignFs ? { fs: p.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("ACTOR_OBSERVATION_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const c = reopened.value;
    const problems = [
      ...(c.store.head().campaign_id !== campaignId
        ? ["the reopened campaign has another identity"]
        : []),
      ...(c.verify().length > 0 ? ["canonical integrity reports violations"] : []),
      ...verifyEpistemicIntegrity(c.store).map((v) => `${v.key}: ${v.message}`),
      ...verifyRefereeIntegrity(c.store).map((v) => `${v.key}: ${v.message}`),
      ...(c.store.getFact(packetKey) === undefined ? ["the packet is not held"] : []),
    ];
    if (problems.length > 0) return result("ACTOR_OBSERVATION_VERIFICATION_FAILED", problems);
    return result("ACTOR_OBSERVATION_RECORDED", [
      `campaign: ${campaignId}`,
      `actor: ${actorId}`,
      `basis: ${TIME(at)} (unchanged)`,
      `event: ${accessEventKey(formed.value.event_id)}`,
      `packet: ${packetKey}`,
    ]);
  } finally {
    await closeQuietly(reopened.value);
  }
}

/** The one message for every non-receipt: it tells an obstruction, an unsettled premise and an absence apart from none of them. */
function notEstablished(): ActorObservationResult {
  return result("ACTOR_OBSERVATION_NOT_ESTABLISHED", ["nothing was received at this basis"]);
}
