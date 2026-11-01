import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import type { PhoneConfig } from "./config.ts";

/**
 * The adapter's retained, NONCANONICAL record of the ONE goal it is carrying out (or last carried out): the identity of the player's
 * request, how far it goes and where the chain stands. It exists for one reason: an interruption must resume the SAME request, and a
 * finished request must never be mistaken for an unfinished one (or the reverse). It is bookkeeping in the operator directory: never an
 * owner fact, never model-readable except through `play_status`, never a source of authority (every phase is still launched through
 * the trusted path and judged by the owners, which are asked again). Campaign-bound, strictly validated, atomically replaced; a record
 * that cannot be read keeps ordinary goals closed (it is never repaired, adopted or deleted by the adapter).
 */
export const GOAL_RECORD_FORMAT = "immortalis-chat-goal";

export const GOAL_OUTCOMES = ["DONE", "IN_PROGRESS", "RETURNED"] as const;
export const GOAL_STEPS = ["ADOPTING", "COMMITTING", "ADMITTING", "FINISHING", "FINISHED"] as const;
export const GOAL_RETURNS = [
  "ANOTHER_ATTEMPT_OPEN",
  "COMMIT_NOT_MADE",
  "NOT_ADMITTED",
  "ADMISSION_UNSETTLED",
  "FINISH_REFUSED",
  "OUTCOME_UNCERTAIN",
  "STATE_NOT_RECOGNISED",
  "SERVICE_CLOSING",
] as const;

export type GoalOutcome = (typeof GOAL_OUTCOMES)[number];
export type GoalStep = (typeof GOAL_STEPS)[number];
export type GoalReturn = (typeof GOAL_RETURNS)[number];
export type GoalUntil = "start" | "complete";

export interface GoalRecord {
  readonly id: string;
  readonly amount: number;
  readonly until: GoalUntil;
  outcome: GoalOutcome;
  step: GoalStep;
  returned?: GoalReturn;
  act_id?: string;
}

interface Stored {
  readonly format: typeof GOAL_RECORD_FORMAT;
  readonly format_version: 1;
  readonly campaign_id: string;
  readonly goal: GoalRecord | null;
}

type Where = Pick<PhoneConfig, "operatorDir" | "campaignId">;
export const goalRecordPath = (config: Where): string =>
  join(config.operatorDir, `chat-goal.${config.campaignId}.json`);

export type GoalRead =
  | { readonly kind: "NONE" }
  | { readonly kind: "UNREADABLE" }
  | { readonly kind: "RECORD"; readonly goal: GoalRecord };

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

export function readGoal(config: Where): GoalRead {
  let text: string;
  try {
    text = readFileSync(goalRecordPath(config), "utf8");
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "NONE" }
      : { kind: "UNREADABLE" };
  }
  try {
    const v: unknown = JSON.parse(text);
    if (
      !record(v) ||
      v["format"] !== GOAL_RECORD_FORMAT ||
      v["format_version"] !== 1 ||
      v["campaign_id"] !== config.campaignId ||
      Object.keys(v).length !== 4
    )
      return { kind: "UNREADABLE" };
    const g = v["goal"];
    if (g === null) return { kind: "NONE" };
    if (
      !record(g) ||
      typeof g["id"] !== "string" ||
      !/^[0-9a-f]{16}$/.test(g["id"]) ||
      typeof g["amount"] !== "number" ||
      !Number.isSafeInteger(g["amount"]) ||
      g["amount"] < 1 ||
      g["amount"] > 1_000_000 ||
      (g["until"] !== "start" && g["until"] !== "complete") ||
      !oneOf(GOAL_OUTCOMES, g["outcome"]) ||
      !oneOf(GOAL_STEPS, g["step"]) ||
      (g["returned"] !== undefined && !oneOf(GOAL_RETURNS, g["returned"])) ||
      (g["act_id"] !== undefined && (typeof g["act_id"] !== "string" || g["act_id"].length > 200))
    )
      return { kind: "UNREADABLE" };
    return {
      kind: "RECORD",
      goal: {
        id: g["id"],
        amount: g["amount"],
        until: g["until"],
        outcome: g["outcome"],
        step: g["step"],
        ...(g["returned"] !== undefined ? { returned: g["returned"] } : {}),
        ...(g["act_id"] !== undefined ? { act_id: g["act_id"] as string } : {}),
      },
    };
  } catch {
    return { kind: "UNREADABLE" };
  }
}

/** Atomic replace (write a sibling, fsync, rename): a reader sees the old record or the new one, never a torn one. false = not retained. */
export function writeGoal(config: Where, goal: GoalRecord): boolean {
  const target = goalRecordPath(config);
  const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const stored: Stored = {
    format: GOAL_RECORD_FORMAT,
    format_version: 1,
    campaign_id: config.campaignId,
    goal,
  };
  try {
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeSync(fd, `${JSON.stringify(stored)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(temp, 0o600);
    renameSync(temp, target);
    return true;
  } catch {
    try {
      rmSync(temp, { force: true });
    } catch {
      // nothing more to do: the record was not retained
    }
    return false;
  }
}
