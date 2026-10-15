import {
  EntityId,
  REFEREE_AUTHORITY,
  REFEREE_OP_OBSERVATION,
  accessEventKey,
  accessPacketKey,
  type CanonicalTime,
  type EventSignalPresentation,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  RefereeAdjudicationAdapter,
  formObservedPacket,
  observationEventId,
  verifyEpistemicIntegrity,
  type FsOps,
} from "@immortalis/engine";
import {
  bindTrustedCausalEventSignalContext,
  deliverCausalEventSignalPresentation,
} from "@immortalis/protocol";
import { consumeConfirmation, requestOperatorDecision, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { readKeep } from "./original-pc-keep.ts";
import { custodyProblems } from "./original-pc-locus.ts";
import {
  BUILD_ID,
  UNKNOWN_OUTCOME,
  bindingProblems,
  closeQuietly,
  openSession,
  releaseProblems,
  result,
  runtimeOf,
  type CharacterResult,
} from "./original-pc.ts";
import { askObservation } from "./referee-session.ts";
import type { LocalOperatorSession } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * The active-PC DIRECT PHYSICAL OBSERVATION, as the player's own separate, confirmed choice to look (BLUE v5.2).
 *
 * A character that `author-character` released and bound, and whose ORIGINAL physical-locus custody `establish-character-locus` committed,
 * has a stationary physical position and nothing more: no perception. This command is the one production operation that can earn it,
 * for ONE canonical basis. It asks the AI referee host ONE bounded F-014D §6 question built only from committed facts (the character's
 * own statements, the confirmed placement statement, the world and the locus, the custody) at the current basis: is the character's
 * sight established, are its own exact viewing circumstances established, is the path from the physical feature to it open or blocked —
 * and, only if all three are affirmatively answered, what minimal raw appearance follows. The engine validates the answer against the
 * delivered text and DERIVES the verdict. Only OBSERVATION_ESTABLISHED can earn a receipt: the Epistemic owner then commits the
 * observation-earned event (derived from the retained decision, never authored); that committed event triggers its own packet-formation
 * stage through one event-triggered resolution transaction at the unchanged canonical time (F-017 §4; no Temporal object, no indexed
 * boundary), and the sealed Accessible Content Packet and its Sealed Engine Provenance form together. The player is then shown the result through the existing trusted, read-only Event-Signal delivery.
 *
 * What the player is NEVER shown: the world's facts, the host's reasoning, the verdict, or any difference between "nothing is there",
 * "something blocks it" and "this could not be settled". Every non-receipt is the same message; the retained decision is sealed
 * engine-side evidence. The command advances no time, writes no actor-side state and grants no recognition, comprehension, belief,
 * memory or action. Running it again at the same basis reaches the same records (one observation per character per canonical instant);
 * a new observation is a new basis and a new, separate choice.
 */

export interface ObserveSurroundingsParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly pcId: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
  readonly refereePolls?: number;
  readonly refereePollMs?: number;
}

const TIME = (t: CanonicalTime): string => `${t.value} ${t.unit}`;

export async function observeSurroundings(p: ObserveSurroundingsParams): Promise<CharacterResult> {
  if (!EntityId.safeParse(p.pcId).success)
    return result("INVALID_REQUEST", ["the character identity is not valid"]);
  const opened = await openSession({
    campaignDir: p.campaignDir,
    campaignId: p.campaignId,
    ...(p.operatorDir !== undefined ? { operatorDir: p.operatorDir } : {}),
    ...(p.reclaimStaleLock ? { reclaimStaleLock: true } : {}),
    ...(p.buildId !== undefined ? { buildId: p.buildId } : {}),
    ...(p.campaignFs ? { campaignFs: p.campaignFs } : {}),
    ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
  });
  if (!opened.ok) return opened.refusal;
  const session = opened.session;
  try {
    return await run(p, session);
  } catch {
    // an unexpected failure after any write may have left that write landed or not: an unknown outcome, never a success
    session.markAmbiguous();
    return result("CHARACTER_OUTCOME_UNKNOWN", ["an unexpected failure interrupted the command"]);
  } finally {
    await closeQuietly(session);
  }
}

const presentationLines = (pr: EventSignalPresentation): string[] =>
  pr.elements.map((e) =>
    e.element === "CONTACT" ? `contact: ${e.channel}` : `${e.element.toLowerCase()}: ${e.text}`,
  );

async function run(
  p: ObserveSurroundingsParams,
  session: LocalOperatorSession,
): Promise<CharacterResult> {
  const { terminal, pcId, campaignId } = p;
  const campaign = session.campaign;
  const rt = runtimeOf(
    {
      campaignDir: p.campaignDir,
      campaignId,
      worldId: "",
      locusId: "",
      pcId,
      terminal,
      ...(p.operatorDir !== undefined ? { operatorDir: p.operatorDir } : {}),
      ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
      ...(p.refereePolls !== undefined ? { refereePolls: p.refereePolls } : {}),
      ...(p.refereePollMs !== undefined ? { refereePollMs: p.refereePollMs } : {}),
    },
    session,
  );

  // Only a character this operator's commands released, bound AND placed (verified) can be asked about at all.
  const keepRead = await readKeep({
    dir: rt.stateDir,
    campaignId,
    operatorUid: session.operator.uid,
    ...(p.ledgerFs ? { fs: p.ledgerFs } : {}),
  });
  if (!keepRead.ok)
    return result(
      "SESSION_UNAVAILABLE",
      [keepRead.error.message],
      `STATE_UNAVAILABLE ${keepRead.error.code}`,
    );
  const keep = keepRead.value;
  const pc = campaign.playerCharacter(pcId);
  if (!pc || keep === null || keep.pc_id !== pcId)
    return result("CHARACTER_NONE", [
      `no character ${pcId} of \`author-character\` is held for this campaign`,
    ]);
  const released = releaseProblems(campaignId, pc.fact, keep, campaign.store);
  if (released.length > 0) return result("CHARACTER_CONFLICT", released);
  const binding = campaign.binding();
  if (!binding)
    return result("OBSERVATION_NOT_AVAILABLE", [
      `character: ${pc.fact.key}`,
      "the character is not bound: run author-character first",
    ]);
  const bound = bindingProblems({ campaign, campaignId, keep }, pc.fact);
  if (bound.length > 0 || campaign.verify().length > 0)
    return result("BINDING_CONFLICT", [
      ...bound,
      ...(campaign.verify().length > 0 ? ["canonical integrity reports violations"] : []),
    ]);
  if (!campaign.pcPhysicalLocusCustody(pcId))
    return result("OBSERVATION_NOT_AVAILABLE", [
      `character: ${pc.fact.key}`,
      "no physical-locus custody is held: run establish-character-locus first",
    ]);
  const custody = custodyProblems(campaign, campaignId, pcId, keep);
  if (custody.length > 0) return result("LOCUS_CONFLICT", custody);

  const adapter = new RefereeAdjudicationAdapter(campaign.store);
  const first = adapter.observationTask({ pc_id: pcId, attempt: 0 });
  if (!first.ok)
    return result("OBSERVATION_NOT_AVAILABLE", [first.error.message], first.error.code);
  const at = first.value.context.observed_at;
  const eventId = observationEventId(pcId, at);

  // An observation this basis already earned converges (a lost reply, a crash after the event, a second run): the player's choice was
  // made and its records exist, so what remains is completed by identity and shown — nothing new is asked, confirmed or decided.
  let decisionKey: string;
  const earned = campaign.store.getFact(accessEventKey(eventId));
  if (earned) {
    const cited = campaign.store.committedGroup(earned.provenance.intent_id)?.reads[0]?.key;
    if (cited === undefined)
      return result("OBSERVATION_VERIFICATION_FAILED", ["the earned event has no decision"]);
    decisionKey = cited;
  } else {
    // a decision already retained for this very question (a negative or unresolved one included) is not asked again: the host is never
    // rerolled for a more convenient answer, and a reading already retained is never overwritten
    const retained = adapter.decision(first.value.task_id);
    if (retained && retained.value.operation === REFEREE_OP_OBSERVATION) {
      if (retained.value.verdict !== "OBSERVATION_ESTABLISHED") return notEstablished();
      decisionKey = retained.fact.key;
    } else {
      const worldId = binding.value.coupling.world.entity_id;
      const locusId = binding.value.coupling.locus.entity_id;
      const pins = {
        pc: pc.fact.version,
        binding: binding.fact.version,
        custody: campaign.pcPhysicalLocusCustody(pcId)!.fact.version,
        world: campaign.world(worldId)!.fact.version,
        locus: campaign.locus(worldId, locusId)!.fact.version,
      };
      const subject = subjectOf({
        verb: "observe-surroundings",
        campaign_id: campaignId,
        pc_id: pcId,
        world_id: worldId,
        locus_id: locusId,
        pins,
        observed_at: at,
      });
      const decision = await requestOperatorDecision(
        terminal,
        "observe-surroundings",
        subject,
        [
          "OBSERVE SURROUNDINGS - a separate, fresh choice. Nothing is observed yet.",
          OOC_BANNER,
          `character: ${pcId}`,
          `canonical basis: ${TIME(at)}`,
          "Confirming is your choice that your character looks at its surroundings NOW, at this basis. The AI referee host is asked what its sight directly receives from the committed physical setting; you will be shown only the raw appearance it receives, if any - never the setting, the host's reasoning or why nothing was received.",
          "It advances no time and gives the character no recognition, comprehension, belief, memory or action.",
        ],
        "Anything else leaves nothing observed.",
      );
      if (
        decision.kind !== "CONFIRMED" ||
        !consumeConfirmation(decision.confirmation, "observe-surroundings", subject)
      )
        return result("DECLINED", ["nothing was observed; nothing was changed"]);

      const asked = await askObservation(adapter, rt, { campaign_id: campaignId, pc_id: pcId });
      if (asked.kind !== "ANSWERED") {
        const detail = [`character: ${pc.fact.key} (no observation made)`];
        return asked.kind === "PENDING"
          ? result("REFEREE_PENDING", [...detail, `task: ${asked.task_id}`])
          : asked.kind === "UNAVAILABLE"
            ? result("REFEREE_UNAVAILABLE", [...detail, asked.message], asked.code)
            : result("REFEREE_ANSWER_REFUSED", [...detail, asked.message]);
      }
      // the reading is retained as sealed evidence whatever it derives (create-only; a negative earns no receipt)
      const recorded = await adapter.recordObservation({
        operation: { ...REFEREE_AUTHORITY },
        host: { host_id: asked.host.host_id, claimed_model: asked.host.claimed_model },
        pc_id: pcId,
        attempt: asked.attempt,
        answer: asked.decision,
      });
      if (!recorded.ok) {
        if (UNKNOWN_OUTCOME.has(recorded.error.code)) {
          session.markAmbiguous();
          return result("CHARACTER_OUTCOME_UNKNOWN", [`referee evidence: ${recorded.error.code}`]);
        }
        return result(
          "CHARACTER_REFUSED",
          [`referee evidence: ${recorded.error.code}`],
          recorded.error.code,
        );
      }
      terminal.say(`PROGRESS referee DECIDED ${recorded.value.record.key}`);
      if (recorded.value.verdict !== "OBSERVATION_ESTABLISHED") return notEstablished();
      decisionKey = recorded.value.record.key;
    }
  }

  // the Epistemic owner's observation-earned event and the packet formation it triggers (each by identity)
  const formed = await formObservedPacket(campaign.store, decisionKey);
  if (!formed.ok) {
    if (UNKNOWN_OUTCOME.has(formed.error.code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [`observation: ${formed.error.code}`]);
    }
    return result(
      "CHARACTER_REFUSED",
      [`observation: ${formed.error.code}`, formed.error.message],
      formed.error.code,
    );
  }
  terminal.say(`PROGRESS observation COMMITTED ${accessPacketKey(formed.value.event_id, pcId)}`);
  await closeQuietly(session);

  // a fresh, ordinary-registry, owner-verified reopen: what is delivered is what the next process will find
  const reopened = await CanonicalCampaign.open(p.campaignDir, {
    buildId: p.buildId ?? BUILD_ID,
    ...(p.campaignFs ? { fs: p.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("OBSERVATION_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const c = reopened.value;
    const problems = [
      ...(c.store.head().campaign_id !== campaignId
        ? ["the reopened campaign has another identity"]
        : []),
      ...(c.verify().length > 0 ? ["canonical integrity reports violations"] : []),
      ...verifyEpistemicIntegrity(c.store).map((v) => `${v.key}: ${v.message}`),
      ...(c.store.getFact(accessPacketKey(formed.value.event_id, pcId)) === undefined
        ? ["the packet is not held"]
        : []),
    ];
    if (problems.length > 0) return result("OBSERVATION_VERIFICATION_FAILED", problems);
    const context = bindTrustedCausalEventSignalContext({
      view: c.store,
      recipient_id: pcId,
      event_id: formed.value.event_id,
    });
    const delivered = deliverCausalEventSignalPresentation(context, {
      operation: "deliver_causal_event_signal_presentation",
    });
    if (!delivered.ok)
      return result("OBSERVATION_VERIFICATION_FAILED", ["the packet is not the current arrival"]);
    return result("OBSERVATION_RECEIVED", [
      `campaign: ${campaignId}`,
      `basis: ${TIME(at)} (unchanged)`,
      ...presentationLines(delivered.value),
    ]);
  } finally {
    await closeQuietly(reopened.value);
  }
}

/** The one message for every non-receipt: it tells an obstruction, an unsettled premise and an absence apart from none of them. */
function notEstablished(): CharacterResult {
  return result("OBSERVATION_NOT_ESTABLISHED", ["nothing was received at this basis"]);
}
