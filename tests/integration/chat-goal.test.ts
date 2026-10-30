/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP and raw owner readback */
// MECHANISM ONLY. Scripted player/referee hosts; real canonical owners, real trusted adapter, real operator commands. A scripted host
// answering a task is plumbing, not a GM's reading: actual GM-host and named-client results remain UNRUN.
import { readFileSync, writeFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import { goalRecordPath } from "../../apps/phone/src/goal-record.ts";
import { Chat, REFEREE } from "../support/chat-client.ts";
import {
  MOMENT,
  TAU,
  cloneSlot,
  follow,
  openOrdinary,
  resumed,
  template,
  type Slot,
} from "../support/chat-route.ts";

let ready: Slot;
beforeAll(async () => {
  ready = await template("READY", { cycle: true });
}, 300_000);

/** the owners' own records, read afresh and independently of the adapter and of the code under test */
const read = async (s: Slot) => {
  const c = await openOrdinary(s.campaignDir);
  try {
    const facts = c.store.listFacts();
    return {
      source: (c.store.getFact("world/world-courtyard/source/src-loose-stones")!.value as any)
        .recoverable.amount,
      reserve: (facts.find((f) => f.key.startsWith("production/reserve/"))!.value as any).quantity
        .amount,
      time: (c.store.getFact("temporal/state")!.value as any).canonical_time.value,
      commitments: facts.filter(
        (f) => f.key.includes("/collection/") && f.key.endsWith("/commitment"),
      ).length,
    };
  } finally {
    await c.close();
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** follows the goal through `play_status` (what a host does) until the predicate holds */
async function until(chat: Chat, ok: (status: any) => boolean, rounds = 240) {
  let last: any;
  for (let i = 0; i < rounds; i++) {
    last = (await chat.call("play_status")).data;
    if (last && ok(last)) return last;
    await sleep(250);
  }
  throw new Error(`the goal did not reach the expected state: ${JSON.stringify(last)}`);
}
const finished = (s: any) =>
  s.goal !== null && ["DONE", "RETURNED", "INTERRUPTED"].includes(s.goal.outcome);
const noPrompt = (v: unknown) => expect(JSON.stringify(v)).not.toMatch(/\/confirm|type exactly/);

it("ONE natural request carries a gathering to its earned end: no sequencing, no prompt, owner-verified, replay-safe", async () => {
  const s = await cloneSlot(ready);
  const r = await resumed(s);
  try {
    await r.chat.init({});
    const request = {
      jsonrpc: "2.0",
      id: "goal-once",
      method: "tools/call",
      params: { name: "gather", arguments: { amount: 2, until: "complete" } },
    };
    const [a, b] = await Promise.all([
      r.chat.raw("POST", "/mcp", request, r.chat.headers()),
      r.chat.raw("POST", "/mcp", request, r.chat.headers()),
    ]);
    expect(a.json).toEqual(b.json);
    expect(a.json.result.isError).not.toBe(true);
    const done = await until(r.chat, finished);
    expect(done.goal).toMatchObject({
      amount: 2,
      until: "complete",
      outcome: "DONE",
      step: "FINISHED",
    });
    expect(done.play.latest.phase).toBe("COMPLETED");
    noPrompt([a.json, done]);
    // independent canonical reads: request identity, source debit, Reserve credit, causal time, one commitment
    expect(await read(s)).toEqual({
      source: 10,
      reserve: 2,
      time: MOMENT.value + 2 * TAU,
      commitments: 1,
    });
    // a replay of the exact request, and a changed request under the same identity, change nothing
    const once = await read(s);
    const replay = await r.chat.raw("POST", "/mcp", request, r.chat.headers());
    expect(replay.json).toEqual(a.json);
    const changed = await r.chat.raw(
      "POST",
      "/mcp",
      { ...request, params: { name: "gather", arguments: { amount: 3, until: "complete" } } },
      r.chat.headers(),
    );
    expect(changed.json.error).toBeDefined();
    expect(await read(s)).toEqual(once);
  } finally {
    await r.stop();
  }
}, 240_000);

it("partial, then exact depletion, then over-demand is refused by the owners, then a different next choice", async () => {
  const s = await cloneSlot(ready);
  const r = await resumed(s);
  try {
    await r.chat.init({});
    const goal = async (amount: number, to: "start" | "complete" = "complete") => {
      const started = await r.chat.call("gather", { amount, until: to });
      expect(started.isError).toBe(false);
      return until(r.chat, finished);
    };
    expect((await goal(5)).goal.outcome).toBe("DONE");
    expect(await read(s)).toEqual({
      source: 7,
      reserve: 5,
      time: MOMENT.value + 5 * TAU,
      commitments: 1,
    });
    // exact depletion: the owners hold 7 and the player asks for exactly 7
    expect((await goal(7)).goal.outcome).toBe("DONE");
    const depleted = await read(s);
    expect(depleted).toMatchObject({ source: 0, reserve: 12, time: MOMENT.value + 12 * TAU });
    // over-demand: nothing is left; the goal returns control and no owner moves
    const over = await goal(1);
    expect(over.goal.outcome).toBe("RETURNED");
    expect(["COMMIT_NOT_MADE", "NOT_ADMITTED", "ADMISSION_UNSETTLED"]).toContain(
      over.goal.returned,
    );
    const after = await read(s);
    expect({ source: after.source, reserve: after.reserve, time: after.time }).toEqual({
      source: 0,
      reserve: 12,
      time: depleted.time,
    });
    // a genuinely different next choice is still the player's: looking works and passes no time
    const looked = await r.chat.call("observe_surroundings");
    expect(looked.isError).toBe(false);
    await follow(r.chat, null, 20);
    expect((await read(s)).time).toBe(depleted.time);
  } finally {
    await r.stop();
  }
}, 300_000);

it("`start` stops at admission and passes no time; a later `complete` ADOPTS that very act (no second commitment); a different open attempt is never touched", async () => {
  const s = await cloneSlot(ready);
  const r = await resumed(s);
  try {
    await r.chat.init({});
    await r.chat.call("gather", { amount: 3, until: "start" });
    const admitted = await until(r.chat, finished);
    expect(admitted.goal).toMatchObject({ outcome: "DONE", until: "start" });
    expect(admitted.play.latest.phase).toBe("IN_FLIGHT");
    expect(await read(s)).toEqual({ source: 12, reserve: 0, time: MOMENT.value, commitments: 1 });
    // a request for another amount does not replace, widen or finish the open attempt
    await r.chat.call("gather", { amount: 5, until: "complete" });
    const refused = await until(r.chat, (x) => finished(x) && x.goal.amount === 5);
    expect(refused.goal).toMatchObject({ outcome: "RETURNED", returned: "ANOTHER_ATTEMPT_OPEN" });
    expect(await read(s)).toEqual({ source: 12, reserve: 0, time: MOMENT.value, commitments: 1 });
    // the player then asks for the completed result of that very amount
    await r.chat.call("gather", { amount: 3, until: "complete" });
    const done = await until(
      r.chat,
      (x) => finished(x) && x.goal.amount === 3 && x.goal.until === "complete",
    );
    expect(done.goal.outcome).toBe("DONE");
    expect(await read(s)).toEqual({
      source: 9,
      reserve: 3,
      time: MOMENT.value + 3 * TAU,
      commitments: 1,
    });
  } finally {
    await r.stop();
  }
}, 300_000);

it("model-supplied authority, a referee grant and malformed requests cannot dispatch a goal", async () => {
  const s = await cloneSlot(ready);
  const r = await resumed(s);
  try {
    const before = await read(s);
    for (const key of [
      "confirmed",
      "confirmation",
      "role",
      "permission",
      "campaign",
      "player_character",
      "owner",
      "act_id",
      "goal_id",
      "target",
      "approved_by",
    ])
      expect(
        (await r.chat.call("gather", { amount: 1, until: "complete", [key]: true })).isError,
      ).toBe(true);
    for (const bad of [
      { amount: 1 },
      { until: "complete" },
      { amount: 0, until: "complete" },
      { amount: 1.5, until: "complete" },
      { amount: 1, until: "forever" },
      { amount: "2", until: "complete" },
    ])
      expect((await r.chat.call("gather", bad)).isError).toBe(true);
    const referee = new Chat(s.base);
    expect((await referee.link("referee", { referee: REFEREE })).ok).toBe(true);
    await referee.init({});
    expect(
      (await referee.call("gather", { amount: 1, until: "complete" })).json.error,
    ).toBeDefined();
    expect(await read(s)).toEqual(before);
    expect((await r.chat.call("play_status")).data.goal).toBeNull();
  } finally {
    await r.stop();
  }
}, 120_000);

it("interrupted DURING the GM wait: the same request resumes its own attempt with no second commitment, debit or time", async () => {
  const s = await cloneSlot(ready);
  // only the setup host runs: the reach reading nobody answers keeps the goal waiting on the GM
  let r = await resumed(s, { which: ["setup"] });
  try {
    await r.chat.init({});
    await r.chat.call("gather", { amount: 2, until: "complete" });
    await sleep(2500);
    const waiting = (await r.chat.call("play_status")).data;
    expect(waiting.goal.outcome).toBe("IN_PROGRESS");
  } finally {
    await r.stop();
  }
  // (the waiting run holds the campaign, so the owners' records are read once the service is down)
  // the willingness is committed; nothing was admitted, debited or timed
  expect(await read(s)).toEqual({ source: 12, reserve: 0, time: MOMENT.value, commitments: 1 });
  const stored = JSON.parse(readFileSync(goalRecordPath(s.config), "utf8"));
  expect(stored.goal.outcome).toBe("IN_PROGRESS");
  r = await resumed(s);
  try {
    await r.chat.init({});
    const interrupted = (await r.chat.call("play_status")).data;
    expect(interrupted.goal.outcome).toBe("INTERRUPTED");
    expect(interrupted.next).toMatch(/resumes this goal/);
    await r.chat.call("gather", { amount: 2, until: "complete" });
    const done = await until(r.chat, finished);
    expect(done.goal).toMatchObject({ outcome: "DONE", goal_id: stored.goal.id });
    expect(await read(s)).toEqual({
      source: 10,
      reserve: 2,
      time: MOMENT.value + 2 * TAU,
      commitments: 1,
    });
  } finally {
    await r.stop();
  }
}, 300_000);

it("interrupted AFTER admission and AFTER canonical completion: resumed by identity; nothing is repeated and a newer act cannot stand for the old one", async () => {
  const s = await cloneSlot(ready);
  let r = await resumed(s);
  try {
    await r.chat.init({});
    await r.chat.call("gather", { amount: 2, until: "start" });
    await until(r.chat, finished);
  } finally {
    await r.stop();
  }
  // the process died after admission: the retained goal says it was still going
  const record = JSON.parse(readFileSync(goalRecordPath(s.config), "utf8"));
  record.goal.outcome = "IN_PROGRESS";
  record.goal.step = "ADMITTING";
  record.goal.until = "complete";
  writeFileSync(goalRecordPath(s.config), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  r = await resumed(s);
  try {
    await r.chat.init({});
    await r.chat.call("gather", { amount: 2, until: "complete" });
    const done = await until(r.chat, finished);
    expect(done.goal).toMatchObject({ outcome: "DONE", goal_id: record.goal.id });
    const completed = await read(s);
    expect(completed).toEqual({
      source: 10,
      reserve: 2,
      time: MOMENT.value + 2 * TAU,
      commitments: 1,
    });
    // the process died after canonical completion but before the goal could say so: the repeat finishes it with NO effect
    const again = JSON.parse(readFileSync(goalRecordPath(s.config), "utf8"));
    again.goal.outcome = "IN_PROGRESS";
    again.goal.step = "FINISHING";
    writeFileSync(goalRecordPath(s.config), `${JSON.stringify(again)}\n`, { mode: 0o600 });
  } finally {
    await r.stop();
  }
  r = await resumed(s);
  try {
    await r.chat.init({});
    const lost = (await r.chat.call("play_status")).data;
    expect(lost.goal.outcome).toBe("INTERRUPTED");
    await r.chat.call("gather", { amount: 2, until: "complete" });
    const settled = await until(r.chat, finished);
    expect(settled.goal.outcome).toBe("DONE");
    expect(await read(s)).toEqual({
      source: 10,
      reserve: 2,
      time: MOMENT.value + 2 * TAU,
      commitments: 1,
    });
    // a NEWER act exists for the player's next request; the old interrupted goal's identity cannot be satisfied by it
    await r.chat.call("gather", { amount: 1, until: "start" });
    await until(r.chat, (x) => finished(x) && x.goal.amount === 1);
    const newer = JSON.parse(readFileSync(goalRecordPath(s.config), "utf8"));
    const old = {
      ...newer,
      goal: {
        ...newer.goal,
        id: "0123456789abcdef",
        amount: 2,
        until: "complete",
        outcome: "IN_PROGRESS",
        step: "FINISHING",
        act_id: "operator-act-an-older-act",
      },
    };
    writeFileSync(goalRecordPath(s.config), `${JSON.stringify(old)}\n`, { mode: 0o600 });
    const before = await read(s);
    await r.chat.call("gather", { amount: 2, until: "complete" });
    const refused = await until(
      r.chat,
      (x) => finished(x) && x.goal.goal_id === "0123456789abcdef",
    );
    expect(refused.goal).toMatchObject({ outcome: "RETURNED", returned: "STATE_NOT_RECOGNISED" });
    expect(await read(s)).toEqual(before);
  } finally {
    await r.stop();
  }
}, 420_000);
