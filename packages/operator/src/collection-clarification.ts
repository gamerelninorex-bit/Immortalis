import {
  EntityId,
  PC_CLARIFICATION_BRANCH,
  PC_CLARIFICATION_QUESTION,
  REFEREE_AUTHORITY,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  pcIntrinsicClarificationKey,
  type CanonicalTime,
  type I002ClarificationReading,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PcCollectionAdapter,
  RefereeAdjudicationAdapter,
  clarificationCandidateItems,
  pcClarificationIdOf,
  pcClarificationWordsDigest,
  type FsOps,
} from "@immortalis/engine";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import { readKeep } from "./original-pc-keep.ts";
import {
  BUILD_ID,
  UNKNOWN_OUTCOME,
  bindingProblems,
  closeQuietly,
  findingsLines,
  judgeStatement,
  openSession,
  releaseProblems,
  result,
  runtimeOf,
  type CharacterResult,
} from "./original-pc.ts";
import { askI002 } from "./referee-session.ts";
import type { LocalOperatorSession } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * The prospective collection clarification (R-5; BLUE repair handoff v1; I-002 §22 Invocation Branch; CPAA-C1 v0.3 F-2).
 *
 * A character that `author-character` released and bound has accepted claims that may say it can grasp, lift and carry but nothing
 * that states how long ONE handling cycle takes: the mechanism that collection needs quotes an accepted claim for its exact cycle, and
 * no source, default or host supplies a human rate. This command lets the SAME character's PLAYER state that account in the player's
 * own words, BEFORE any collection commitment, as a new create-only record of the PC owner: the sealed release, the keep, the binding,
 * the custody, the clock and every earlier record are untouched. The AI referee host classifies exactly those words (the same I-002
 * classification the original Mirror used): only words it accepts as the player's own character-local claims are applied, and only
 * after the player's separate, fresh confirmation. The engine derives everything else (pins, identity, the time it is effective from,
 * the roles) and re-derives it at admission and at every load.
 *
 * Never: a rate chosen, suggested or defaulted for the player; a delegation of the choice to a host; a clarification that restates a
 * world, actor or relational claim; a retrofit of an act that already exists; a second character; a change to anything sealed.
 */

export interface ClarifyCollectionCycleParams {
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

export async function clarifyCollectionCycle(
  p: ClarifyCollectionCycleParams,
): Promise<CharacterResult> {
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

/** What the host read, shown to the player at the separate confirmation (nothing here is chosen for them). */
const scopeLines = (r: I002ClarificationReading | undefined): string[] =>
  r
    ? [
        `branch reading: ${r.branch}`,
        `scope reading: ${r.scope}`,
        ...(r.baseline_ground
          ? [`your character's accepted statement it times: ${JSON.stringify(r.baseline_ground)}`]
          : []),
        `the duration it read: ${JSON.stringify(r.candidate_ground)}`,
        ...(r.clarification ? [`the referee asks: ${r.clarification}`] : []),
      ]
    : [];

const NOT_AVAILABLE = (why: string, pcKey?: string): CharacterResult =>
  result("CLARIFICATION_NOT_AVAILABLE", [...(pcKey ? [`character: ${pcKey}`] : []), why]);

/** How the player is asked, once, for the words: the question is the engine's fixed one and nothing is offered as an answer. */
async function askWords(
  terminal: OperatorTerminal,
  unit: string,
): Promise<{ ok: true; text: string } | { ok: false }> {
  terminal.say(PC_CLARIFICATION_QUESTION);
  terminal.say(
    `The campaign counts time in ${unit}. Your words must contain the number (in digits) and the word "${unit}". Nothing is suggested to you, and nothing is chosen for you.`,
  );
  for (let tries = 0; tries < 3; tries++) {
    const line = await terminal.ask("your character's own account (or leave empty to stop)>");
    if (line === null || line.trim() === "") return { ok: false };
    const judged = judgeStatement(line);
    if (!judged.ok) {
      terminal.say(`NOT USED: ${judged.reason}.`);
      continue;
    }
    if (!/[0-9]/.test(judged.text) || !judged.text.includes(unit)) {
      terminal.say(
        `NOT USED: the words must state a number in digits and the unit "${unit}", or the collection could never quote them.`,
      );
      continue;
    }
    return { ok: true, text: judged.text };
  }
  return { ok: false };
}

async function run(
  p: ClarifyCollectionCycleParams,
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

  // only the character this operator's commands released AND bound (verified) can be clarified, and only this one
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
  if (!campaign.binding())
    return NOT_AVAILABLE("the character is not bound: run author-character first", pc.fact.key);
  const bound = bindingProblems({ campaign, campaignId, keep }, pc.fact);
  if (bound.length > 0 || campaign.verify().length > 0)
    return result("BINDING_CONFLICT", [
      ...bound,
      ...(campaign.verify().length > 0 ? ["canonical integrity reports violations"] : []),
    ]);
  const clock = campaign.store.getFact(TEMPORAL_STATE_KEY);
  const state = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  if (!state?.success)
    return NOT_AVAILABLE(
      "no canonical time is established: run initialize-time first (a clarification is effective from a time)",
      pc.fact.key,
    );
  const prefix = `pc/${pcId}/collection/`;
  if (
    campaign.store
      .listFacts()
      .some((f) => f.key.startsWith(prefix) && f.key.endsWith("/commitment"))
  )
    return NOT_AVAILABLE(
      "a collection commitment of this character already exists: a clarification is prospective and retrofits no act",
      pc.fact.key,
    );
  const at = state.data.canonical_time;

  const words = await askWords(terminal, at.unit);
  if (!words.ok) return result("DECLINED", ["nothing was clarified; nothing was changed"]);
  const statements = [words.text];
  const id = pcClarificationIdOf(pcId);
  const wordsId = pcClarificationWordsDigest(statements);
  const collection = new PcCollectionAdapter(campaign.store);

  // the branch has ONE slot per character (BLUE H-1): the same words already accepted converge (nothing is asked, confirmed or decided
  // again); other words find the branch closed, and nothing is written
  const held = collection.clarification(pcId, id);
  if (held) {
    if (held.value.claims.map((x) => x.statement).join("\n") === statements.join("\n"))
      return accepted(p, session, id, statements, at, true);
    return NOT_AVAILABLE(
      `this character's collection-cycle branch is already closed by an accepted clarification (${id}); another definition cannot be added`,
      pc.fact.key,
    );
  }

  const scope = collection.clarificationScope(pcId);
  if (!scope) return NOT_AVAILABLE("the character has no released contract", pc.fact.key);
  const candidate = clarificationCandidateItems(statements);
  const refereeAdapter = new RefereeAdjudicationAdapter(campaign.store);
  terminal.say(
    "Asking the AI referee host to read what you wrote against what your character already is ...",
  );
  const asked = await askI002(refereeAdapter, rt, {
    campaign_id: campaignId,
    pc_id: pcId,
    items: candidate,
    clarification: scope,
  });
  if (asked.kind !== "ANSWERED") {
    const detail = [`character: ${pc.fact.key} (nothing clarified)`];
    return asked.kind === "PENDING"
      ? result("REFEREE_PENDING", [...detail, `task: ${asked.task_id}`])
      : asked.kind === "UNAVAILABLE"
        ? result("REFEREE_UNAVAILABLE", [...detail, asked.message], asked.code)
        : result("REFEREE_ANSWER_REFUSED", [...detail, asked.message]);
  }
  const findings = [
    ...findingsLines(candidate, asked.decision, asked.verdict, asked.host),
    ...scopeLines(asked.decision.clarification),
  ];
  if (asked.verdict !== "CLOSED") {
    for (const l of findings) terminal.say(l);
    return result("CLARIFICATION_NOT_ACCEPTED", [
      "the referee did not accept your words as your own character: nothing was written",
    ]);
  }

  const subject = subjectOf({
    verb: "accept-clarification",
    campaign_id: campaignId,
    pc_id: pcId,
    branch: PC_CLARIFICATION_BRANCH,
    statements,
    referee_task: asked.task_id,
    contract: pc.fact.version,
    effective_from: at,
  });
  const confirmation = await requestOperatorConfirmation(
    terminal,
    "accept-clarification",
    subject,
    [
      "ACCEPT A CLARIFICATION OF YOUR CHARACTER - a separate, fresh choice. Nothing is accepted yet.",
      OOC_BANNER,
      `character: ${pcId}`,
      `the question: ${PC_CLARIFICATION_QUESTION}`,
      `your words: ${JSON.stringify(statements[0])}`,
      ...findings,
      `Confirming makes these words an accepted claim of your character from the canonical time ${TIME(at)} onward. It changes no earlier record, moves no time, creates no material and starts no collection.`,
    ],
  );
  if (!confirmation || !consumeConfirmation(confirmation, "accept-clarification", subject))
    return result("DECLINED", ["nothing was clarified; nothing was changed"]);

  // the host's classification of exactly these words is retained as create-only evidence, then the owner's record cites it
  const recorded = await refereeAdapter.recordI002({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: asked.host.host_id, claimed_model: asked.host.claimed_model },
    pc_id: pcId,
    attempt: asked.attempt,
    items: candidate,
    clarification: scope,
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
  const written = await collection.clarify({
    group_id: `pc-clarify-group:${campaignId}:${id}:${wordsId}`,
    intent_id: `pc-clarify-intent:${campaignId}:${id}:${wordsId}`,
    cause: `pc-clarify-cause:${campaignId}:${id}:${wordsId}`,
    basis: "operator-confirmed-player-clarification",
    secrecy: "local-operator-session",
    pc_id: pcId,
    statements,
    referee_key: recorded.value.record.key,
  });
  if (!written.ok) {
    if (UNKNOWN_OUTCOME.has(written.error.code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [`clarification: ${written.error.code}`]);
    }
    return result(
      "CHARACTER_REFUSED",
      [`clarification: ${written.error.code}`, written.error.message],
      written.error.code,
    );
  }
  terminal.say(`PROGRESS clarification COMMITTED ${pcIntrinsicClarificationKey(pcId, id)}`);
  return accepted(p, session, id, statements, at, false);
}

/** A fresh, ordinary-registry, owner-verified reopen: what is reported is what the next process will find. */
async function accepted(
  p: ClarifyCollectionCycleParams,
  session: LocalOperatorSession,
  id: string,
  statements: readonly string[],
  at: CanonicalTime,
  already: boolean,
): Promise<CharacterResult> {
  const { pcId, campaignId } = p;
  await closeQuietly(session);
  const reopened = await CanonicalCampaign.open(p.campaignDir, {
    buildId: p.buildId ?? BUILD_ID,
    ...(p.campaignFs ? { fs: p.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("CLARIFICATION_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const c = reopened.value;
    const held = new PcCollectionAdapter(c.store).clarification(pcId, id);
    const problems = [
      ...(c.store.head().campaign_id !== campaignId
        ? ["the reopened campaign has another identity"]
        : []),
      ...(c.verify().length > 0 ? ["canonical integrity reports violations"] : []),
      ...(!held ? ["the clarification is not held"] : []),
      ...(held && held.value.claims.map((x) => x.statement).join("\n") !== statements.join("\n")
        ? ["the clarification holds other words than you confirmed"]
        : []),
    ];
    if (problems.length > 0) return result("CLARIFICATION_VERIFICATION_FAILED", problems);
    return result("CLARIFICATION_ACCEPTED", [
      `campaign: ${campaignId}`,
      `character: ${pcId}`,
      `clarification: ${id}${already ? " (accepted earlier; unchanged)" : ""}`,
      `claim 0: ${JSON.stringify(statements[0])}`,
      `effective from: ${TIME(held!.value.effective_from)} (the clock is unchanged: ${TIME(at)})`,
      `to use it, the preparation document's "mechanism" carries "clarified": [{"clarification_id": "${id}", "index": 0}] and a "cycle_quote" that is a verbatim part of claim 0 stating the number and the unit; "cycle_duration" is exactly what those words state`,
    ]);
  } finally {
    await closeQuietly(reopened.value);
  }
}
