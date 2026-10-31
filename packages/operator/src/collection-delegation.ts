import {
  PC_CLARIFICATION_BRANCH,
  PC_DELEGATION_METHOD_CLASS,
  PC_DELEGATION_METHOD_VERSION,
  PC_DELEGATION_SPACE_KIND,
  pcDelegatedClarificationKey,
  type CanonicalTime,
  type PcDelegatedSelectionTask,
  type PcDelegationScope,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PcCollectionAdapter,
  canonicalEqual,
  interpretDelegatedSelection,
  pcClarificationIdOf,
  pcDelegationIdOf,
  pcDelegationMirror,
  sha256Canonical,
  type FsOps,
} from "@immortalis/engine";
import { askCollection } from "./collection-referee.ts";
import { branchCharacter, withBranchSession } from "./collection-clarification.ts";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import { OOC_BANNER } from "./ooc.ts";
import {
  BUILD_ID,
  UNKNOWN_OUTCOME,
  closeQuietly,
  result,
  type CharacterResult,
} from "./original-pc.ts";
import type { LocalOperatorSession } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * The DELEGATED selection of the collection cycle (H1; I-002 section 9 Delegation / Hidden-Seed Adapter; CPAA-C1 v0.3 F-2 "lawfully
 * player-authored or delegated"; BLUE same-PR repair authorization).
 *
 * Where `clarify-collection-cycle` accepts the player's OWN words, this command lets the player DELEGATE the choice ("surprise me"):
 * they may commit numeric limits - a shortest and/or a longest whole number of the campaign's unit; none is required - and `role.gm`
 * (a bound AI referee host, never the player and never this command) selects inside the scope. The owner re-derives the task, validates the
 * selection against the committed scope and the character's accepted baseline, and writes a create-only Delegation Commit Record
 * (provenance PLAYER-DELEGATED, executing role role.gm, non-random, sealed) BEFORE any dependent collection commitment. The record
 * shares the ONE slot of the branch with the player-authored clarification, cannot be reselected, and is refused once any collection
 * of the character has begun. The player confirms the DELEGATION (the scope, the method class, that the choice is sealed), not a number
 * they have seen: the selected content is not shown before they confirm, so declining cannot shop for a better draw, and the retained
 * exchange returns the same selection to the same task if the command is run again.
 *
 * The player's free words are not accepted as constraints: an owner cannot verify wording against sealed content, so the only constraints
 * a delegation carries are the numeric limits the owner can check (BLUE hold H1-C). A numeric wish is a limit; a qualitative wish is
 * not a constraint this record can validate, and the player's own words belong to `clarify-collection-cycle`.
 *
 * Never: a bound chosen for the player, a default, a rate from any source but the host's selection inside the player's bounds, a
 * statement passed off as the player's own words, a second definition of the branch, a retrofit of an act that already exists, or a
 * change to anything sealed. Whole-seed delegation or any other branch is not offered.
 */

export interface DelegateCollectionCycleParams {
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
  /**
   * The numeric limits the player committed, in the campaign's unit; null where they gave none. A limit that is present but not a whole
   * number of at least 1 (NaN included) is refused, never defaulted or repaired.
   */
  readonly scope: {
    readonly shortest: number | null;
    readonly longest: number | null;
  };
}

const TIME = (t: CanonicalTime): string => `${t.value} ${t.unit}`;

export async function delegateCollectionCycle(
  p: DelegateCollectionCycleParams,
): Promise<CharacterResult> {
  return withBranchSession(p, (session) => run(p, session));
}

const NOT_AVAILABLE = (why: string, pcKey?: string): CharacterResult =>
  result("DELEGATION_NOT_AVAILABLE", [...(pcKey ? [`character: ${pcKey}`] : []), why]);

/** The scope the player committed, or why it is not a lawful scope. Nothing is defaulted, widened or completed on their behalf. */
function scopeOf(
  p: DelegateCollectionCycleParams,
  unit: string,
): { ok: true; scope: PcDelegationScope } | { ok: false; why: string } {
  const { shortest, longest } = p.scope;
  const whole = (n: number | null) => n === null || (Number.isSafeInteger(n) && n >= 1);
  if (
    !whole(shortest) ||
    !whole(longest) ||
    (shortest !== null && longest !== null && shortest > longest)
  )
    return {
      ok: false,
      why: `a limit is a whole number of ${unit}, at least 1, and the shortest cannot exceed the longest; nothing is defaulted for you`,
    };
  return {
    ok: true,
    scope: {
      branch: PC_CLARIFICATION_BRANCH,
      // a duration is strictly positive: with no lower limit the shortest is 1, which is no player constraint
      candidate_space: { kind: PC_DELEGATION_SPACE_KIND, unit, shortest: shortest ?? 1, longest },
    },
  };
}

/** What the player is shown and confirms: the scope they committed and the method, never the number (it is not shown before they confirm). */
const scopeLines = (scope: PcDelegationScope): string[] => [
  `the choice you delegate: how long your character takes to handle ONE unit of loose material (lift it and carry it away) in one serial cycle`,
  scope.candidate_space.longest === null && scope.candidate_space.shortest === 1
    ? `your limits: none given - the referee chooses any whole number of ${scope.candidate_space.unit} (at least 1) that fits your character's accepted content`
    : `your limits: at least ${scope.candidate_space.shortest} and ${
        scope.candidate_space.longest === null
          ? "no upper limit given"
          : `at most ${scope.candidate_space.longest}`
      } ${scope.candidate_space.unit}, a whole number`,
  `who chooses: role.gm (the AI referee host), inside that scope, once; method ${PC_DELEGATION_METHOD_CLASS} ${PC_DELEGATION_METHOD_VERSION} (not random, no draw or seed)`,
  `what is recorded: a Delegation Commit Record with provenance PLAYER-DELEGATED (the choice is the referee's, not your own words), sealed and effective from the canonical time of acceptance, before any collection exists`,
];

async function run(
  p: DelegateCollectionCycleParams,
  session: LocalOperatorSession,
): Promise<CharacterResult> {
  const { terminal, pcId, campaignId } = p;
  const pre = await branchCharacter(p, session, "delegation");
  if (!pre.ok) return pre.refusal;
  const { rt, pc, at, collection } = pre.value;

  const bounded = scopeOf(p, at.unit);
  if (!bounded.ok) return NOT_AVAILABLE(bounded.why, pc.fact.key);
  const scope = bounded.scope;
  const scopeId = sha256Canonical({ delegation_scope: scope }).slice(0, 16);

  // the branch has ONE slot per character: the same scope already delegated converges (nothing is asked, confirmed or selected again);
  // anything else finds the branch closed, and nothing is written
  const held = collection.delegation(pcId);
  if (held) {
    if (canonicalEqual(held.value.scope, scope)) return accepted(p, session, scope, true);
    return NOT_AVAILABLE(
      `this character's collection-cycle branch is already closed by an accepted delegation (${held.value.delegation_id}); it is not reselected, redefined or amended`,
      pc.fact.key,
    );
  }
  if (collection.clarification(pcId, pcClarificationIdOf(pcId)))
    return NOT_AVAILABLE(
      "this character's collection-cycle branch is already closed by the player's own accepted clarification; a delegation cannot be added",
      pc.fact.key,
    );

  const task: PcDelegatedSelectionTask | undefined = collection.delegationTask(pcId, scope);
  if (!task) return NOT_AVAILABLE("the character has no released contract", pc.fact.key);
  if (task.prior_closures.length > 0)
    return NOT_AVAILABLE(
      "this branch is already closed by an earlier accepted record",
      pc.fact.key,
    );

  terminal.say(
    "Asking the AI referee host (role.gm) to choose inside the scope you committed, against what your character already is ...",
  );
  const asked = await askCollection(
    {
      stateDir: rt.stateDir,
      campaignId,
      operatorUid: rt.operatorUid,
      polls: rt.polls,
      pollMs: rt.pollMs,
      ...(rt.fs ? { fs: rt.fs } : {}),
    },
    "PC_COLLECTION_DELEGATE",
    task,
  );
  const detail = [`character: ${pc.fact.key} (nothing delegated)`];
  if (asked.kind === "PENDING")
    return result("REFEREE_PENDING", [...detail, `task: ${asked.task_id}`]);
  if (asked.kind === "UNAVAILABLE")
    return result("REFEREE_UNAVAILABLE", [...detail, asked.message]);
  if (asked.kind === "REFUSED") return result("REFEREE_ANSWER_REFUSED", [...detail, asked.message]);

  // the engine reads the answer exactly as the owner will: a genuine refusal by the host selects nothing
  const probe = interpretDelegatedSelection(task, asked.answer);
  if (!probe.ok) return result("REFEREE_ANSWER_REFUSED", [...detail, probe.error.message]);
  if (probe.value.kind !== "SELECTED")
    return result("DELEGATION_NOT_ACCEPTED", [
      "the referee did not select for you: nothing was written",
      probe.value.kind === "ALREADY_STATED"
        ? "your character's accepted content already states how long a handling cycle takes"
        : probe.value.kind === "CLOSED"
          ? "this branch is already closed"
          : "the request is outside the duration of your character's existing handling",
    ]);

  const subject = subjectOf({
    verb: "accept-delegation",
    campaign_id: campaignId,
    pc_id: pcId,
    branch: PC_CLARIFICATION_BRANCH,
    scope,
    method: { class: PC_DELEGATION_METHOD_CLASS, version: PC_DELEGATION_METHOD_VERSION },
    referee_task: asked.task_id,
    task: task.digest,
    selection_sha256: sha256Canonical({ delegated_selection: asked.answer }),
    contract: pc.fact.version,
    effective_from: at,
  });
  const confirmation = await requestOperatorConfirmation(terminal, "accept-delegation", subject, [
    "DELEGATE A CHOICE OF YOUR CHARACTER - a separate, fresh choice. Nothing is accepted yet.",
    OOC_BANNER,
    `character: ${pcId}`,
    ...scopeLines(scope),
    "The referee has chosen inside your scope. The choice is sealed with the delegation and is not shown here, so declining does not buy another draw: the same question finds the same choice. It is reported once the delegation is committed.",
    `Confirming delegates the choice and seals it from the canonical time ${TIME(at)} onward. It cannot be reselected, changed or taken back. It changes no earlier record, moves no time, creates no material and starts no collection.`,
  ]);
  if (!confirmation || !consumeConfirmation(confirmation, "accept-delegation", subject))
    return result("DECLINED", ["nothing was delegated; nothing was changed"]);

  const written = await collection.delegate({
    group_id: `pc-delegate-group:${campaignId}:${pcDelegationIdOf(pcId)}:${scopeId}`,
    intent_id: `pc-delegate-intent:${campaignId}:${pcDelegationIdOf(pcId)}:${scopeId}`,
    cause: `pc-delegate-cause:${campaignId}:${pcDelegationIdOf(pcId)}:${scopeId}`,
    basis: "operator-confirmed-player-delegation",
    secrecy: "local-operator-session",
    pc_id: pcId,
    scope,
    answer: asked.answer,
  });
  if (!written.ok) {
    if (UNKNOWN_OUTCOME.has(written.error.code)) {
      session.markAmbiguous();
      return result("CHARACTER_OUTCOME_UNKNOWN", [`delegation: ${written.error.code}`]);
    }
    return result(
      "CHARACTER_REFUSED",
      [`delegation: ${written.error.code}`, written.error.message],
      written.error.code,
    );
  }
  terminal.say(
    `PROGRESS delegation COMMITTED ${pcDelegatedClarificationKey(pcId, pcDelegationIdOf(pcId))}`,
  );
  return accepted(p, session, scope, false);
}

/** A fresh, ordinary-registry, owner-verified reopen: what is reported is what the next process will find. */
async function accepted(
  p: DelegateCollectionCycleParams,
  session: LocalOperatorSession,
  scope: PcDelegationScope,
  already: boolean,
): Promise<CharacterResult> {
  const { pcId, campaignId } = p;
  await closeQuietly(session);
  const reopened = await CanonicalCampaign.open(p.campaignDir, {
    buildId: p.buildId ?? BUILD_ID,
    ...(p.campaignFs ? { fs: p.campaignFs } : {}),
  });
  if (!reopened.ok)
    return result("DELEGATION_VERIFICATION_FAILED", [`reopen: ${reopened.error.code}`]);
  try {
    const c = reopened.value;
    const held = new PcCollectionAdapter(c.store).delegation(pcId);
    const problems = [
      ...(c.store.head().campaign_id !== campaignId
        ? ["the reopened campaign has another identity"]
        : []),
      ...(c.verify().length > 0 ? ["canonical integrity reports violations"] : []),
      ...(!held ? ["the delegation is not held"] : []),
      ...(held && !canonicalEqual(held.value.scope, scope)
        ? ["the delegation holds another scope than you confirmed"]
        : []),
    ];
    if (problems.length > 0 || !held) return result("DELEGATION_VERIFICATION_FAILED", problems);
    const m = pcDelegationMirror(held.value);
    return result("DELEGATION_ACCEPTED", [
      `campaign: ${campaignId}`,
      `character: ${pcId}`,
      `delegation: ${held.value.delegation_id}${already ? " (accepted earlier; unchanged)" : ""}`,
      `Character Mirror - scope: ${m.scope.shortest}..${m.scope.longest === null ? "(no upper limit)" : m.scope.longest} ${m.scope.unit}`,
      `Character Mirror - method: ${m.method.class} ${m.method.version} (random: no), executed by ${m.executed_by}, provenance ${m.provenance}`,
      `Character Mirror - seal: ${m.seal}`,
      `effective from: ${TIME(m.effective_from)}; governing package ${m.governing_package}`,
      `claim 0 (the referee's choice, not your words): ${JSON.stringify(m.content)}`,
      `to use it, the preparation document's "mechanism" carries "clarified": [{"clarification_id": "${held.value.delegation_id}", "index": 0}] and a "cycle_quote" that is a verbatim part of claim 0 stating the number and the unit; "cycle_duration" is exactly what those words state`,
    ]);
  } finally {
    await closeQuietly(reopened.value);
  }
}
