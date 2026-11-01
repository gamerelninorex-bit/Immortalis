import { createHash } from "node:crypto";
import type { GoalRead, GoalRecord, GoalReturn, GoalUntil } from "./goal-record.ts";
import type { ToolContext } from "./mcp-http.ts";
import type { PlayRead } from "./play-evidence.ts";
import type { Launch, Run } from "./runs.ts";
import type { Scenario } from "./scenario.ts";

export type { GoalOutcome, GoalRecord, GoalReturn, GoalStep, GoalUntil } from "./goal-record.ts";

/**
 * The GOAL-LEVEL COORDINATOR for the one supported ordinary goal: gather an amount of the material at hand (I-001 goal-level action
 * compression). It is WORKFLOW PLUMBING, not a world owner, a scheduler or a second save:
 *
 *   - it holds only the identity of the request it is carrying out, retained durably so that an interruption RESUMES that same request
 *     (a repeat of the same goal resumes it; the owners decide what remains) and a finished one is never mistaken for an unfinished one;
 *   - it learns every state from the owners (`read`), never from a transcript, a cache or its own memory of what it did;
 *   - it launches a phase only through the same trusted path a direct tool call uses (`launch`), under the ORIGINAL request's
 *     authority, so each phase meets exactly the checks a direct call meets: the closed command builder, the pre-dispatch recovery
 *     record, the single-use exact-action capability and the owners' own validation.
 *
 * What the player's request covers (and so what the coordinator may do without a further question):
 *   `start`     the willingness to attempt, the physical-reach reading and Production's admission of the work. No time passes.
 *   `complete`  the same, and then letting canonical time run to THAT admitted work's own earned completion - because the player asked
 *               for a completed result. The target is derived from the work, never chosen here.
 * There is no third "keep going until stopped" mode in this class: an admitted act has one earned boundary and no intermediate stopping
 * point (CPAA-C1 v0.3 O-2: earlier handling cycles are progress evidence only).
 *
 * It RETURNS CONTROL, never retries and never substitutes, at every material boundary: a declined or refused phase, the owners not
 * admitting the work, a crossing the time kernel refuses, an uncertain outcome, another attempt that is open and is not this goal's, or a
 * state it does not recognise. A phase it did not launch cannot be launched by it: a `start` goal never finishes anything, and newer work
 * (another act) can never stand for the act this goal carries.
 */
export interface GoalDeps {
  readonly launch: (
    command: string,
    options: Readonly<Record<string, string>>,
    authority: Pick<ToolContext, "scopes" | "client" | "grant">,
  ) => Promise<Launch>;
  readonly read: () => Promise<PlayRead>;
  readonly scenario: () => Scenario | null;
  readonly exitCode: (run: Run) => number | null;
  /** ends a pending prompt as a decline (a goal never answers a prompt it did not mint a capability for) */
  readonly decline: () => void;
  readonly closing: () => boolean;
  readonly track: <T>(p: Promise<T>) => Promise<T>;
  /** durable retention of the one goal record; false = it could not be retained (nothing further is dispatched) */
  readonly retain: (goal: GoalRecord) => boolean;
  readonly retained: () => GoalRead;
  readonly pollMs?: number;
}

export interface GoalRequest {
  readonly amount: number;
  readonly until: GoalUntil;
}

export type GoalStart =
  | { readonly ok: true; readonly goal: GoalRecord; readonly resumed: boolean }
  | { readonly ok: false; readonly reason: string };

/** A goal as the player lane sees it: the record, and whether a chain in THIS process is carrying it out right now. */
export interface GoalView {
  readonly goal: GoalRecord;
  readonly live: boolean;
}

export interface GoalCoordinator {
  readonly begin: (
    request: GoalRequest,
    authority: Pick<ToolContext, "scopes" | "client" | "grant">,
    requestId: string,
  ) => Promise<GoalStart>;
  /** the goal being carried out, or the last one; an IN_PROGRESS record with no live chain is an INTERRUPTED goal */
  readonly current: () => GoalView | null;
  /** resolves when the running chain (if any) has stopped */
  readonly settled: () => Promise<void>;
}

export function createGoalCoordinator(d: GoalDeps): GoalCoordinator {
  let goal: GoalRecord | null = null;
  let running: Promise<void> | null = null;
  const pollMs = d.pollMs ?? 20;

  const wait = async (run: Run): Promise<"DONE" | "CLOSING"> => {
    while (!run.done) {
      if (d.closing()) return "CLOSING";
      // a prompt no capability answers is declined, never confirmed on the player's behalf
      if (run.terminal.snapshot(0).pending) d.decline();
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return "DONE";
  };

  /** runs one trusted phase to its end; `null` = it ended normally (exit 0) */
  const phase = async (
    command: string,
    options: Readonly<Record<string, string>>,
    authority: Pick<ToolContext, "scopes" | "client" | "grant">,
  ): Promise<GoalReturn | null | "REFUSED"> => {
    const launched = await d.launch(command, options, authority);
    if (!launched.ok) return "REFUSED";
    if ((await wait(launched.run)) === "CLOSING") return "SERVICE_CLOSING";
    // a run that ended because the service is closing was interrupted, not refused: the goal stays resumable
    if (d.closing()) return "SERVICE_CLOSING";
    if (launched.run.uncertain) return "OUTCOME_UNCERTAIN";
    const code = d.exitCode(launched.run);
    return code === 0 ? null : code === 4 ? "OUTCOME_UNCERTAIN" : "REFUSED";
  };

  const chain = async (
    g: GoalRecord,
    authority: Pick<ToolContext, "scopes" | "client" | "grant">,
    sc: Scenario,
  ): Promise<void> => {
    // every change of the record is retained BEFORE the next phase is dispatched; a record that cannot be retained stops the chain
    const note = (step: GoalRecord["step"]): boolean => {
      g.step = step;
      return d.retain(g);
    };
    const stop = (returned: GoalReturn): void => {
      // A closing service is not a boundary of the request: the goal stays IN_PROGRESS on record (it reads as INTERRUPTED) so the same
      // request, repeated, resumes it.
      if (returned === "SERVICE_CLOSING") return;
      g.outcome = "RETURNED";
      g.returned = returned;
      d.retain(g);
    };
    const done = (): void => {
      g.step = "FINISHED";
      g.outcome = "DONE";
      delete g.returned;
      d.retain(g);
    };
    const collectOptions = {
      world: sc.world,
      source: sc.source,
      reserve: sc.reserve,
      amount: String(g.amount),
      "quantity-unit": sc.quantity_unit,
      mechanism: sc.mechanism,
      basis: sc.basis,
    };
    // 1. what do the owners hold? An open attempt of this goal's own shape is ADOPTED (never duplicated); any other open one is not ours.
    let seen = await d.read();
    if (d.closing()) return stop("SERVICE_CLOSING");
    if (seen.kind !== "OPEN") return stop("STATE_NOT_RECOGNISED");
    let latest = seen.latest;
    const resuming = g.act_id !== undefined;
    // EXACT IDENTITY: a resumed goal carries the act it named. Newer or different work can never stand for it.
    if (resuming && !("act_id" in latest && latest.act_id === g.act_id))
      return stop("STATE_NOT_RECOGNISED");
    if (resuming && latest.phase === "COMPLETED") return done();
    const isOpen = latest.phase === "COMMITTED" || latest.phase === "IN_FLIGHT";
    if (latest.phase === "HELD") return stop("STATE_NOT_RECOGNISED");
    if (isOpen) {
      // only an attempt of exactly this goal's quantity is this goal's; another open attempt is never completed, replaced or widened
      if (!("quantity" in latest) || latest.quantity.amount !== g.amount)
        return stop("ANOTHER_ATTEMPT_OPEN");
      g.act_id = latest.act_id;
      if (!note("ADOPTING")) return stop("OUTCOME_UNCERTAIN");
    } else {
      // a resumed goal never starts a fresh attempt: it only carries on the act it named
      if (resuming)
        return stop(latest.phase === "NOT_ADMITTED" ? "NOT_ADMITTED" : "STATE_NOT_RECOGNISED");
      if (!note("COMMITTING")) return stop("OUTCOME_UNCERTAIN");
      const made = await phase("collect", collectOptions, authority);
      if (made === "SERVICE_CLOSING" || made === "OUTCOME_UNCERTAIN") return stop(made);
      if (made !== null) return stop("COMMIT_NOT_MADE");
      seen = await d.read();
      if (seen.kind !== "OPEN" || seen.latest.phase === "NO_ATTEMPT")
        return stop("COMMIT_NOT_MADE");
      latest = seen.latest;
      if (!("act_id" in latest)) return stop("STATE_NOT_RECOGNISED");
      g.act_id = latest.act_id;
      if (!note("COMMITTING")) return stop("OUTCOME_UNCERTAIN");
    }
    // 2. reach reading and Production's admission (the owners' own next steps for an attempt already committed)
    if (latest.phase === "COMMITTED") {
      if (!note("ADMITTING")) return stop("OUTCOME_UNCERTAIN");
      const admitted = await phase("collect-continue", {}, authority);
      if (admitted === "SERVICE_CLOSING" || admitted === "OUTCOME_UNCERTAIN") return stop(admitted);
      seen = await d.read();
      if (seen.kind !== "OPEN") return stop("STATE_NOT_RECOGNISED");
      latest = seen.latest;
      // the owners decide admission; a run that ended without a refusal but also without admitting the work is not guessed at
      if (latest.phase === "NOT_ADMITTED") return stop("NOT_ADMITTED");
      if (admitted !== null && latest.phase !== "IN_FLIGHT") return stop("ADMISSION_UNSETTLED");
      if (latest.phase === "COMMITTED") return stop("ADMISSION_UNSETTLED");
    }
    if (!("act_id" in latest) || latest.act_id !== g.act_id) return stop("STATE_NOT_RECOGNISED");
    if (latest.phase === "COMPLETED") return done();
    if (latest.phase !== "IN_FLIGHT") return stop("STATE_NOT_RECOGNISED");
    if (g.until === "start") return done();
    // 3. the player asked for a completed result: let time run to THIS act's own earned completion and no further
    if (!note("FINISHING")) return stop("OUTCOME_UNCERTAIN");
    const finished = await phase("collect-finish", {}, authority);
    if (finished === "SERVICE_CLOSING" || finished === "OUTCOME_UNCERTAIN") return stop(finished);
    seen = await d.read();
    if (seen.kind !== "OPEN") return stop("STATE_NOT_RECOGNISED");
    if (seen.latest.phase === "COMPLETED" && seen.latest.act_id === g.act_id) return done();
    return stop(finished === null ? "STATE_NOT_RECOGNISED" : "FINISH_REFUSED");
  };

  const load = (): GoalRead => {
    const held = d.retained();
    if (held.kind === "RECORD" && goal === null) goal = held.goal;
    return held;
  };

  return {
    current: () => {
      const held = load();
      if (goal === null) return held.kind === "RECORD" ? { goal: held.goal, live: false } : null;
      return { goal, live: running !== null };
    },
    settled: async () => {
      await running;
    },
    begin: async (request, authority, requestId) => {
      if (d.closing())
        return { ok: false, reason: "the server is closing; nothing was dispatched" };
      if (running !== null)
        return {
          ok: false,
          reason:
            "a gathering goal is already being carried out: follow it with play_status instead of starting another",
        };
      const held = d.retained();
      if (held.kind === "UNREADABLE")
        return {
          ok: false,
          reason:
            "the retained goal record cannot be read; engineering must inspect it. Nothing was dispatched",
        };
      const sc = d.scenario();
      if (sc === null)
        return {
          ok: false,
          reason:
            "This campaign's scenario is not configured for chat play (an engineering step). Nothing was started.",
        };
      // the SAME request repeated after an interruption resumes that goal's exact identity; anything else is a new goal
      const prior = held.kind === "RECORD" ? held.goal : null;
      const resumes =
        prior !== null &&
        prior.outcome === "IN_PROGRESS" &&
        prior.amount === request.amount &&
        prior.until === request.until;
      const g: GoalRecord = resumes
        ? { ...prior }
        : {
            id: createHash("sha256")
              .update(`${authority.client}\u0000${authority.grant}\u0000${requestId}`)
              .digest("hex")
              .slice(0, 16),
            amount: request.amount,
            until: request.until,
            outcome: "IN_PROGRESS",
            step: "ADOPTING",
          };
      if (resumes) {
        delete g.returned;
        g.outcome = "IN_PROGRESS";
      }
      // retained BEFORE anything is dispatched: if it cannot be, no goal starts
      if (!d.retain(g))
        return { ok: false, reason: "the goal could not be retained; nothing was dispatched" };
      goal = g;
      running = d
        .track(
          chain(g, authority, sc).catch(() => {
            g.outcome = "RETURNED";
            g.returned = "OUTCOME_UNCERTAIN";
            d.retain(g);
          }),
        )
        .finally(() => {
          running = null;
        });
      return { ok: true, goal: g, resumed: resumes };
    },
  };
}
