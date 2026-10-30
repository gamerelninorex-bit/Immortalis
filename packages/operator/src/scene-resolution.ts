import {
  REFEREE_AUTHORITY,
  REFEREE_OP_SCENE,
  worldOutputAppearanceKey,
  worldPcCurrentViewingKey,
  type CanonicalTime,
} from "@immortalis/contracts";
import {
  RefereeAdjudicationAdapter,
  currentViewingId,
  type CanonicalCampaign,
} from "@immortalis/engine";
import { OPERATOR_PUBLICATION_SECRECY } from "./commands.ts";
import { UNKNOWN_OUTCOME, result, type CharacterResult } from "./original-pc.ts";
import { readConfig } from "./referee-exchange.ts";
import { askScene, type RefereeRuntime } from "./referee-session.ts";
import type { LocalOperatorSession } from "./session.ts";

/**
 * The Game Master's scene step of a natural look (GM-led first play): before the perception question, a bound GM scene host is asked
 *   1. (once per credited delivery) the minimum raw physical APPEARANCE of the gathered output, resolved from branch-invariant world
 *      constraints BEFORE any observation of it - never from a perception outcome;
 *   2. (once per basis and request) whether an ORDINARY look is physically supported NOW - the routine attention, turning and opening of
 *      the eyes a normal request to look includes (I-001 section 8) - or whether the request carries a materially new commitment.
 * The World-State physical custodian then publishes only what the engine derived as VIEWING_SUPPORTED / APPEARANCE_RESOLVED; every other
 * ruling is sealed evidence and publishes nothing. The perception question that follows consumes the published facts, so a changed
 * current viewing result is a real changed input of a NEW task and an old negative decision stays exactly as it was.
 *
 * Strictly additive: with no host bound to the scene operation the step is skipped and the legacy question is asked unchanged. It asks
 * no human anything (the player's one choice is to look), invents no clock time, and a retained ruling is never asked again.
 */

const DELIVERY_REF = /^world\/([^/]+)\/source-delivery\/(.+)$/;

/** Whether the campaign's trusted binding has a host for the scene operation (read before the player is asked anything). */
export async function sceneHostBound(campaignId: string, rt: RefereeRuntime): Promise<boolean> {
  const held = await readConfig(
    {
      stateDir: rt.stateDir,
      campaignId,
      ...(rt.fs ? { fs: rt.fs } : {}),
    },
    rt.operatorUid,
  );
  return held.ok && held.value.hosts.some((h) => h.operations.includes(REFEREE_OP_SCENE));
}

export type SceneStep =
  { readonly kind: "CONTINUE" } | { readonly kind: "RETURN"; readonly result: CharacterResult };

export interface ScenePlan {
  /** the delivery whose appearance is still unresolved (the character's own credited collection), if any */
  readonly appearance: { readonly world_id: string; readonly extraction_id: string } | null;
  readonly viewing_key: string;
  readonly viewing_present: boolean;
}

/** What the owners already hold for this look: read-only, no host, no confirmation. */
export function planScene(
  adapter: RefereeAdjudicationAdapter,
  campaign: CanonicalCampaign,
  input: { pcId: string; at: CanonicalTime; scope: { source_key?: string } },
): ScenePlan | { readonly error: string } {
  const legacy = adapter.observationTask({
    pc_id: input.pcId,
    attempt: 0,
    ...input.scope,
    scene: { viewing: "NONE", appearance: "NONE" },
  });
  if (!legacy.ok) return { error: legacy.error.message };
  const refs = legacy.value.context.refs;
  const [pc, binding, custody, world, locus] = refs;
  const viewingId = currentViewingId({
    pc_id: input.pcId,
    observed_at: input.at,
    pins: {
      pc: pc!.version,
      binding: binding!.version,
      custody: custody!.version,
      world: world!.version,
      locus: locus!.version,
    },
  });
  const viewing_key = worldPcCurrentViewingKey(input.pcId, viewingId);
  const delivery = refs[5] ? DELIVERY_REF.exec(refs[5].fact_key) : null;
  return {
    appearance:
      delivery && !campaign.store.getFact(worldOutputAppearanceKey(delivery[1]!, delivery[2]!))
        ? { world_id: delivery[1]!, extraction_id: delivery[2]! }
        : null,
    viewing_key,
    viewing_present: campaign.store.getFact(viewing_key) !== undefined,
  };
}

const publication = (kind: string, taskId: string) => ({
  group_id: `gm-scene:${kind}:${taskId}:group`,
  intent_id: `gm-scene:${kind}:${taskId}:intent`,
  cause: `gm-scene:${kind}:${taskId}:cause`,
  basis: "gm-scene-ruling-publication",
  secrecy: OPERATOR_PUBLICATION_SECRECY,
});

/**
 * Runs the scene step for one look: the appearance of an unresolved credited output, then the current viewing circumstance. `CONTINUE`
 * means the perception question may now be asked (whatever was published is part of it); `RETURN` ends the look with a result.
 */
export async function resolveScene(p: {
  adapter: RefereeAdjudicationAdapter;
  campaign: CanonicalCampaign;
  session: LocalOperatorSession;
  rt: RefereeRuntime;
  campaignId: string;
  pcId: string;
  plan: ScenePlan;
  /** the trusted side's bounded attention text, or null for a bare look */
  attention: string | null;
  notEstablished: () => CharacterResult;
  onProgress: (line: string) => void;
}): Promise<SceneStep> {
  const { adapter, campaign, session, rt, campaignId, pcId } = p;
  const ask = (
    detail: string[],
    asked: Awaited<ReturnType<typeof askScene>>,
  ): CharacterResult | null => {
    if (asked.kind === "ANSWERED") return null;
    return asked.kind === "PENDING"
      ? result("REFEREE_PENDING", [...detail, `task: ${asked.task_id}`])
      : asked.kind === "UNAVAILABLE"
        ? result("REFEREE_UNAVAILABLE", [...detail, asked.message], asked.code)
        : result("REFEREE_ANSWER_REFUSED", [...detail, asked.message]);
  };
  const unknownOrRefused = (what: string, code: string, message?: string): CharacterResult => {
    if (UNKNOWN_OUTCOME.has(code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [`${what}: ${code}`]);
    }
    return result("CHARACTER_REFUSED", [`${what}: ${code}`, ...(message ? [message] : [])], code);
  };

  // 1. the appearance of a credited output nobody has yet resolved (independent of this look)
  if (p.plan.appearance) {
    const { extraction_id } = p.plan.appearance;
    const first = adapter.appearanceTask({ pc_id: pcId, attempt: 0, extraction_id });
    if (!first.ok)
      return {
        kind: "RETURN",
        result: result("OBSERVATION_NOT_AVAILABLE", [first.error.message], first.error.code),
      };
    let taskId = first.value.task_id;
    let verdict = adapter.decision(taskId)?.value.verdict;
    if (verdict === undefined) {
      const asked = await askScene(adapter, rt, {
        campaign_id: campaignId,
        pc_id: pcId,
        kind: "OUTPUT_APPEARANCE",
        extraction_id,
      });
      const stop = ask(["character: " + pcId + " (no observation made)"], asked);
      if (stop || asked.kind !== "ANSWERED") return { kind: "RETURN", result: stop! };
      const recorded = await adapter.recordScene({
        operation: { ...REFEREE_AUTHORITY },
        host: { host_id: asked.host.host_id, claimed_model: asked.host.claimed_model },
        pc_id: pcId,
        attempt: asked.attempt,
        kind: "OUTPUT_APPEARANCE",
        extraction_id,
        answer: asked.decision,
      });
      if (!recorded.ok)
        return {
          kind: "RETURN",
          result: unknownOrRefused("scene evidence", recorded.error.code, recorded.error.message),
        };
      p.onProgress(`PROGRESS scene DECIDED ${recorded.value.record.key}`);
      taskId = asked.task_id;
      verdict = recorded.value.verdict;
    }
    if (verdict === "APPEARANCE_RESOLVED") {
      const written = await campaign.establishWorldOutputAppearance({
        ...publication("appearance", taskId),
        pc_id: pcId,
        ruling_task_id: taskId,
      });
      if (!written.ok)
        return {
          kind: "RETURN",
          result: unknownOrRefused("appearance", written.error.code, written.error.message),
        };
    }
    // an appearance the GM could not resolve (or a conflict) publishes nothing: the perception question then has none to rest on
  }

  // 2. the current viewing circumstance of this look
  if (!p.plan.viewing_present) {
    const request = { kind: "LOOK" as const, statement: p.attention };
    const first = adapter.viewingTask({ pc_id: pcId, attempt: 0, request });
    if (!first.ok)
      return {
        kind: "RETURN",
        result: result("OBSERVATION_NOT_AVAILABLE", [first.error.message], first.error.code),
      };
    let taskId = first.value.task_id;
    let verdict = adapter.decision(taskId)?.value.verdict;
    if (verdict === undefined) {
      const asked = await askScene(adapter, rt, {
        campaign_id: campaignId,
        pc_id: pcId,
        kind: "CURRENT_VIEWING",
        request,
      });
      const stop = ask(["character: " + pcId + " (no observation made)"], asked);
      if (stop || asked.kind !== "ANSWERED") return { kind: "RETURN", result: stop! };
      const recorded = await adapter.recordScene({
        operation: { ...REFEREE_AUTHORITY },
        host: { host_id: asked.host.host_id, claimed_model: asked.host.claimed_model },
        pc_id: pcId,
        attempt: asked.attempt,
        kind: "CURRENT_VIEWING",
        request,
        answer: asked.decision,
      });
      if (!recorded.ok)
        return {
          kind: "RETURN",
          result: unknownOrRefused("scene evidence", recorded.error.code, recorded.error.message),
        };
      p.onProgress(`PROGRESS scene DECIDED ${recorded.value.record.key}`);
      taskId = asked.task_id;
      verdict = recorded.value.verdict;
    }
    if (verdict === "PLAYER_CHOICE_REQUIRED")
      return { kind: "RETURN", result: result("OBSERVATION_NEEDS_CHOICE") };
    if (verdict !== "VIEWING_SUPPORTED") return { kind: "RETURN", result: p.notEstablished() };
    const written = await campaign.establishPcCurrentViewing({
      ...publication("viewing", taskId),
      pc_id: pcId,
      ruling_task_id: taskId,
    });
    if (!written.ok)
      return {
        kind: "RETURN",
        result: unknownOrRefused("viewing", written.error.code, written.error.message),
      };
  }
  return { kind: "CONTINUE" };
}
