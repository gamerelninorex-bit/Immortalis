import type {
  I002HostDecision,
  IrHostDecision,
  PhysicalHostDecision,
  RefereeVerdict,
} from "@immortalis/contracts";
import {
  RefereeAdjudicationAdapter,
  type CandidateItem,
  type FsOps,
  type I002Context,
  type IrContext,
  type PhysicalContext,
} from "@immortalis/engine";
import {
  awaitDecision,
  isSetAside,
  publishTask,
  readConfig,
  setAsideDecision,
  type ExchangeParams,
} from "./referee-exchange.ts";

/**
 * The engine side of one referee question (PR #61, BLUE B61-A3): build the question from committed facts (IR) or the player's own
 * words (I-002), publish it for the connected host, wait a bounded number of polls for the answer, vouch for the host, and have the
 * engine validate the answer and derive the verdict. Nothing is written to the campaign here; no model is called; an answer that
 * is not vouched for or does not validate is set aside (never reused) and the question is asked again as the next attempt.
 *
 * A host that has not answered is `PENDING`, never a verdict: the operator stops with no canonical change, and the same question
 * (the same task identity) is found again on the next run, with any answer it has meanwhile received.
 */

export interface RefereeRuntime {
  readonly stateDir: string;
  readonly operatorUid: number;
  readonly fs?: FsOps;
  /** how many times the answer is looked for before reporting PENDING (the campaign clock is never read) */
  readonly polls: number;
  readonly pollMs: number;
}

export interface RefereeHostIdentity {
  readonly host_id: string;
  readonly claimed_model: string | null;
}

export type Asked<D, C> =
  | {
      readonly kind: "ANSWERED";
      readonly task_id: string;
      readonly attempt: number;
      readonly context: C;
      readonly verdict: RefereeVerdict;
      readonly decision: D;
      readonly host: RefereeHostIdentity;
    }
  | { readonly kind: "PENDING"; readonly task_id: string; readonly message: string }
  | { readonly kind: "UNAVAILABLE"; readonly message: string; readonly code: string }
  | { readonly kind: "REFUSED"; readonly message: string };

const MAX_ATTEMPTS = 5;

const exchange = (c: string, rt: RefereeRuntime): ExchangeParams & { operatorUid: number } => ({
  stateDir: rt.stateDir,
  campaignId: c,
  operatorUid: rt.operatorUid,
  ...(rt.fs ? { fs: rt.fs } : {}),
});

/** Whether a trusted host binding exists for this campaign (checked before the player is asked anything). */
export async function refereeConfigured(
  campaignId: string,
  rt: RefereeRuntime,
): Promise<{ ok: true } | { ok: false; message: string; code: string }> {
  const c = await readConfig(exchange(campaignId, rt), rt.operatorUid);
  return c.ok
    ? { ok: true }
    : {
        ok: false,
        code: c.error.code,
        message:
          "no AI referee host is bound to this campaign: run `referee-bind-host` and connect the host's tool server",
      };
}

export async function askI002(
  adapter: RefereeAdjudicationAdapter,
  rt: RefereeRuntime,
  input: { campaign_id: string; pc_id: string; items: readonly CandidateItem[] },
): Promise<Asked<I002HostDecision, I002Context>> {
  const configured = await refereeConfigured(input.campaign_id, rt);
  if (!configured.ok) return { kind: "UNAVAILABLE", ...configured };
  const p = exchange(input.campaign_id, rt);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { context, task_id } = adapter.i002Task({
      pc_id: input.pc_id,
      attempt,
      items: input.items,
    });
    if (await isSetAside(p, task_id)) continue;
    const task = await publishTask(p, { task_id, operation: "I002_CLASSIFY", context });
    if (!task.ok)
      return { kind: "UNAVAILABLE", code: task.error.code, message: task.error.message };
    const got = await awaitDecision(p, task.value, rt.polls, rt.pollMs);
    if (!got.ok) {
      await setAsideDecision(p, task_id, got.error.code);
      continue;
    }
    if (got.value === null)
      return { kind: "PENDING", task_id, message: "the AI referee host has not answered yet" };
    const evaluated = adapter.evaluateI002(context, got.value.answer);
    if (!evaluated.ok) {
      await setAsideDecision(p, task_id, `${evaluated.error.code}: ${evaluated.error.message}`);
      continue;
    }
    return {
      kind: "ANSWERED",
      task_id,
      attempt,
      context,
      verdict: evaluated.value.verdict,
      decision: evaluated.value.decision,
      host: { host_id: got.value.host_id, claimed_model: got.value.claimed_model },
    };
  }
  return { kind: "REFUSED", message: "the host's answers were not valid; none was used" };
}

export async function askIr(
  adapter: RefereeAdjudicationAdapter,
  rt: RefereeRuntime,
  input: {
    campaign_id: string;
    pc_id: string;
    world_id: string;
    locus_id: string;
    statement: string;
  },
): Promise<Asked<IrHostDecision, IrContext>> {
  const configured = await refereeConfigured(input.campaign_id, rt);
  if (!configured.ok) return { kind: "UNAVAILABLE", ...configured };
  const p = exchange(input.campaign_id, rt);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = adapter.irTask({ ...input, attempt });
    if (!built.ok)
      return { kind: "UNAVAILABLE", code: built.error.code, message: built.error.message };
    const { context, task_id } = built.value;
    if (await isSetAside(p, task_id)) continue;
    const task = await publishTask(p, { task_id, operation: "IR_NATIVE_COMPATIBILITY", context });
    if (!task.ok)
      return { kind: "UNAVAILABLE", code: task.error.code, message: task.error.message };
    const got = await awaitDecision(p, task.value, rt.polls, rt.pollMs);
    if (!got.ok) {
      await setAsideDecision(p, task_id, got.error.code);
      continue;
    }
    if (got.value === null)
      return { kind: "PENDING", task_id, message: "the AI referee host has not answered yet" };
    const evaluated = adapter.evaluateIr(context, got.value.answer);
    if (!evaluated.ok) {
      await setAsideDecision(p, task_id, `${evaluated.error.code}: ${evaluated.error.message}`);
      continue;
    }
    return {
      kind: "ANSWERED",
      task_id,
      attempt,
      context,
      verdict: evaluated.value.verdict,
      decision: evaluated.value.decision,
      host: { host_id: got.value.host_id, claimed_model: got.value.claimed_model },
    };
  }
  return { kind: "REFUSED", message: "the host's answers were not valid; none was used" };
}

/**
 * The physical-placement question (original active-PC qualified physical-locus custody): built ONLY from committed facts, so the
 * caller names the character and nothing else (not the statement, the world or the locus).
 */
export async function askPhysical(
  adapter: RefereeAdjudicationAdapter,
  rt: RefereeRuntime,
  input: { campaign_id: string; pc_id: string },
): Promise<Asked<PhysicalHostDecision, PhysicalContext>> {
  const configured = await refereeConfigured(input.campaign_id, rt);
  if (!configured.ok) return { kind: "UNAVAILABLE", ...configured };
  const p = exchange(input.campaign_id, rt);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const built = adapter.physicalTask({ pc_id: input.pc_id, attempt });
    if (!built.ok)
      return { kind: "UNAVAILABLE", code: built.error.code, message: built.error.message };
    const { context, task_id } = built.value;
    if (await isSetAside(p, task_id)) continue;
    const task = await publishTask(p, { task_id, operation: "IR_PHYSICAL_PLACEMENT", context });
    if (!task.ok)
      return { kind: "UNAVAILABLE", code: task.error.code, message: task.error.message };
    const got = await awaitDecision(p, task.value, rt.polls, rt.pollMs);
    if (!got.ok) {
      await setAsideDecision(p, task_id, got.error.code);
      continue;
    }
    if (got.value === null)
      return { kind: "PENDING", task_id, message: "the AI referee host has not answered yet" };
    const evaluated = adapter.evaluatePhysical(context, got.value.answer);
    if (!evaluated.ok) {
      await setAsideDecision(p, task_id, `${evaluated.error.code}: ${evaluated.error.message}`);
      continue;
    }
    return {
      kind: "ANSWERED",
      task_id,
      attempt,
      context,
      verdict: evaluated.value.verdict,
      decision: evaluated.value.decision,
      host: { host_id: got.value.host_id, claimed_model: got.value.claimed_model },
    };
  }
  return { kind: "REFUSED", message: "the host's answers were not valid; none was used" };
}
