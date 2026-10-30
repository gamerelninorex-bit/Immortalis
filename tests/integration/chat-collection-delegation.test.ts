/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted MCP client and raw owner readback are untyped JSON */
// MECHANISM ONLY. A scripted assistant calls the typed chat tools, a scripted human types the confirmation phrase, and the scripted
// PLUMBING referee hosts answer (the delegated selection included): none of it is a GM's reading, an AI's choice or a real player, and the
// GENUINE HOST, NAMED CLIENT and RETAINED STORAGE results remain UNRUN. The real owners, the real trusted adapter and the real operator
// commands do all the work.
//
// H1 (BLUE same-PR repair authorization; I-002 section 9; CPAA-C1 v0.3 F-2): a player who DELEGATES the one missing handling-cycle duration
// ("surprise me") reaches an exactly timed gathering through ordinary conversation, with the referee's choice sealed as PLAYER-DELEGATED,
// shown to nobody before the delegation is confirmed, never reselected, and never presented as the player's own words.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parseRefereeBindings } from "../../apps/phone/src/referee-startup.ts";
import { PcCollectionAdapter } from "@immortalis/engine";
import { delegateCollectionCycle } from "@immortalis/operator";
import {
  DECLARATION,
  MOMENT,
  UNIT,
  cloneSlot,
  converge,
  delegateSelection,
  delegatedStatement,
  keys,
  openOrdinary,
  preparation,
  reader,
  resumed,
  routePolicy,
  stage,
  status,
  template,
  type Slot,
} from "../support/chat-route.ts";

afterEach(() => vi.restoreAllMocks());

const BOUNDS = {
  shortest: 4,
  longest: 12,
  words: "somewhere between four and twelve, nothing frantic",
};
const PICK = Math.min(BOUNDS.longest, BOUNDS.shortest + 5);
const CHOSEN = delegatedStatement(PICK);
const WITH_DELEGATE = ["setup", "collection", "delegate"] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** the scripted role.gm that counts the DISTINCT delegate questions it answered (two scripted hosts poll the same exchange) */
function gm(over: (task: any) => Record<string, unknown> = () => ({})) {
  const seen = new Set<string>();
  const policy = routePolicy({}, {}, (task) => {
    seen.add(task.digest);
    return delegateSelection(task, { over: over(task) });
  });
  return { policy, asked: () => seen.size };
}

const facts = async (s: Slot) => {
  const c = await openOrdinary(s.campaignDir);
  try {
    return { keys: c.store.listFacts().map((f) => f.key), verify: c.verify() };
  } finally {
    await c.close();
  }
};
const delegatedKeys = (ks: readonly string[]) =>
  ks.filter((k) => k.includes("/delegated-clarification/"));

let afterMoment: Slot;
beforeAll(async () => {
  // the character with NO stated cycle, placed, located and with the campaign's clock established: where the handling branch is open
  afterMoment = await template("MOMENT", { cycle: false, which: WITH_DELEGATE });
}, 600_000);

describe("the delegated handling cycle through ordinary conversation", () => {
  it("the player hands the choice to the referee inside their bounds; the owners seal it as PLAYER-DELEGATED; the preparation quotes it; the gathering is timed by exactly that cycle", async () => {
    const g = gm();
    const s = await cloneSlot(afterMoment);
    const r = await resumed(s, { policy: g.policy, which: WITH_DELEGATE });
    try {
      await r.chat.init({});
      // the status offers the delegated path ONLY as the player's own conditional choice
      const before = (await status(r.chat)).route;
      expect(before.next.if_player_delegates_handling_duration).toMatchObject({
        tool: "delegate_handling_duration",
      });
      expect(JSON.stringify(before)).not.toContain(CHOSEN);
      expect(before.next.delegated_choice).toBeUndefined();

      const done = await stage(r.chat, "delegate_handling_duration", BOUNDS);
      expect(done.finished.data?.result?.status, JSON.stringify(done.finished.data)).toBe(
        "DELEGATION_ACCEPTED",
      );
      // the READBACK of the request shows the player's scope and the method, never the number the referee chose; the sealed choice is
      // reported separately, by the owner-verified route, once the owners hold it
      const readback: string = done.finished.data.request_readback.operation;
      expect(readback).toContain("PLAYER-DELEGATED");
      expect(readback).toContain(`at least ${BOUNDS.shortest} and at most ${BOUNDS.longest}`);
      expect(readback).not.toContain(CHOSEN);
      expect(done.finished.data.route.next.delegated_choice.statement).toBe(CHOSEN);
      expect(g.asked()).toBe(1);

      // afterwards the status carries the Character Mirror and the sealed choice, labelled as the referee's and not the player's words
      const after = (await status(r.chat)).route;
      expect(after.stages.find((x: any) => x.stage === "handling_duration")?.state).toBe("DONE");
      expect(after.next.delegated_choice).toMatchObject({
        provenance: "PLAYER-DELEGATED",
        executed_by: "role.gm",
        statement: CHOSEN,
        scope: {
          shortest: BOUNDS.shortest,
          longest: BOUNDS.longest,
          unit: UNIT,
          your_words: BOUNDS.words,
        },
        method: "ROLE_GM_NON_RANDOM_SELECTION pc-cycle-gm-selection:v1",
      });
      expect(after.next.delegated_choice.seal).toMatch(/^[0-9a-f]{64}$/);

      // the player's own-words route is closed for this branch; a second delegation of other bounds is refused; neither reaches a host
      const own = await r.chat.call("state_handling_duration", {
        words: `It takes me 5 ${UNIT} to lift one handful`,
      });
      expect(own.isError || own.data?.refused !== undefined || own.text).toBeTruthy();
      expect((await facts(s)).keys.filter((k) => k.includes("/intrinsic-clarification/"))).toEqual(
        [],
      );
      const again = await r.chat.call("delegate_handling_duration", { shortest: 1, longest: 2 });
      expect(JSON.stringify(again.data ?? again.text)).toMatch(
        /already closed|closed by an accepted/,
      );
      expect(g.asked()).toBe(1);

      // the preparation quotes the referee's sealed words verbatim; the referee attests the cycle; the connection is made
      const prep = await stage(r.chat, "propose_collection_preparation", {
        ...preparation(CHOSEN),
        cycle_value: PICK,
      });
      expect(prep.finished.data?.result?.status, JSON.stringify(prep.finished.data)).toBe(
        "COLLECTION_COMMITTED",
      );
      expect(
        (await stage(r.chat, "declare_closed_setting", DECLARATION)).finished.data?.exit_code,
      ).toBe(0);
      expect(
        (await stage(r.chat, "finish_collection_setup", {}, reader)).finished.data?.exit_code,
      ).toBe(0);
      expect((await status(r.chat)).route.readiness.prepared_to_request_collection).toBe(true);

      // ONE natural request then gathers, and the owners' own time is the sealed cycle times the amount
      const request = await r.chat.call("gather", { amount: 2, until: "complete" });
      expect(request.isError).not.toBe(true);
      let last: any;
      for (let i = 0; i < 240; i++) {
        last = (await r.chat.call("play_status")).data;
        if (last?.goal && ["DONE", "RETURNED", "INTERRUPTED"].includes(last.goal.outcome)) break;
        await sleep(250);
      }
      expect(last.goal).toMatchObject({ amount: 2, outcome: "DONE" });
    } finally {
      await r.stop();
    }
    const c = await openOrdinary(s.campaignDir);
    try {
      const all = c.store.listFacts();
      expect(delegatedKeys(all.map((f) => f.key))).toHaveLength(1);
      const record = all.find((f) => f.key.includes("/delegated-clarification/"))!.value as any;
      expect(record.sealed.duration).toEqual({ unit: UNIT, value: PICK });
      expect(record.sealed.claims[0].provenance).toBe("PLAYER-DELEGATED");
      expect(JSON.stringify(record)).not.toContain("PLAYER-AUTHORED");
      const reserve = (all.find((f) => f.key.startsWith("production/reserve/"))!.value as any)
        .quantity.amount;
      const time = (c.store.getFact("temporal/state")!.value as any).canonical_time.value;
      expect(reserve).toBe(2);
      expect(time).toBe(MOMENT.value + 2 * PICK);
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  }, 600_000);

  it("asking again with the same bounds converges on the same sealed choice: the referee is not asked a second time and no second draw exists", async () => {
    const g = gm();
    const s = await cloneSlot(afterMoment);
    const r = await resumed(s, { policy: g.policy, which: WITH_DELEGATE });
    try {
      await r.chat.init({});
      const first = await stage(r.chat, "delegate_handling_duration", BOUNDS);
      expect(first.finished.data?.result?.status).toBe("DELEGATION_ACCEPTED");
      const head = (await facts(s)).keys.length;
      const second = await r.chat.call("delegate_handling_duration", BOUNDS);
      expect(JSON.stringify(second.data ?? second.text)).toMatch(/already|nobody was asked/);
      expect(g.asked()).toBe(1);
      expect((await facts(s)).keys.length).toBe(head);
      expect((await status(r.chat)).route.next.delegated_choice.statement).toBe(CHOSEN);
    } finally {
      await r.stop();
    }
    expect(delegatedKeys(await keys(s))).toHaveLength(1);
  }, 360_000);

  it("is a player's choice with a lawful bounded scope: reversed, missing or fractional bounds and extra input are refused before any host is asked", async () => {
    const g = gm();
    const s = await cloneSlot(afterMoment);
    const r = await resumed(s, { policy: g.policy, which: WITH_DELEGATE });
    try {
      await r.chat.init({});
      for (const args of [
        { shortest: 9, longest: 3 },
        { shortest: 4 },
        { longest: 4 },
        { shortest: 1.5, longest: 3 },
        { shortest: 0, longest: 3 },
        { shortest: 1, longest: 3, words: "a\u0007bell" },
        { shortest: 1, longest: 3, rate: 7 },
        {},
      ]) {
        const out = await r.chat.call("delegate_handling_duration", args);
        expect(out.isError || out.data?.refused !== undefined, JSON.stringify(args)).toBeTruthy();
      }
      expect(g.asked()).toBe(0);
      expect(delegatedKeys(await keys(s))).toEqual([]);
    } finally {
      await r.stop();
    }
  }, 240_000);

  it("a host whose choice leaves the bounds, or who refuses, is never used: nothing is sealed, the player's branch stays open", async () => {
    for (const [name, over] of [
      [
        "outside the bounds",
        (task: any) => ({
          selection: {
            value: task.scope.candidate_space.longest + 40,
            statement: delegatedStatement(task.scope.candidate_space.longest + 40),
            statement_ground: delegatedStatement(task.scope.candidate_space.longest + 40),
          },
        }),
      ],
      [
        "a refusal: already stated",
        () => ({ branch: "ALREADY_STATED_IN_BASELINE", selection: null, baseline_ground: null }),
      ],
    ] as const) {
      const g = gm(over);
      const s = await cloneSlot(afterMoment);
      const r = await resumed(s, {
        policy: g.policy,
        deps: { character: { refereePolls: 40, refereePollMs: 20 } },
      });
      try {
        await r.chat.init({});
        const out = await stage(r.chat, "delegate_handling_duration", BOUNDS, reader);
        expect(out.finished.data?.result?.status, name).not.toBe("DELEGATION_ACCEPTED");
        expect(delegatedKeys(await keys(s)), name).toEqual([]);
        expect(
          (await status(r.chat)).route.stages.find((x: any) => x.stage === "handling_duration")
            ?.state,
          name,
        ).toBe("NEXT");
      } finally {
        await r.stop();
      }
    }
  }, 480_000);

  it("a lost acknowledgement at the owner commit converges on exactly one sealed choice, the original one", async () => {
    const g = gm();
    const s = await cloneSlot(afterMoment);
    const real = PcCollectionAdapter.prototype.delegate;
    let lost = false;
    vi.spyOn(PcCollectionAdapter.prototype, "delegate").mockImplementation(async function (
      this: PcCollectionAdapter,
      ...args: Parameters<typeof real>
    ) {
      const out = await real.apply(this, args);
      if (!lost) {
        lost = true;
        return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as any;
      }
      return out;
    });
    const r = await resumed(s, { policy: g.policy, which: WITH_DELEGATE });
    try {
      await r.chat.init({});
      const out = await stage(r.chat, "delegate_handling_duration", BOUNDS, reader);
      expect(out.finished.data?.result?.status).not.toBe("DELEGATION_ACCEPTED");
      await converge(r, {
        cycle: false,
        until: (route) =>
          route.stages.find((x: any) => x.stage === "handling_duration")?.state === "DONE",
      });
      expect((await status(r.chat)).route.next?.delegated_choice?.statement).toBe(CHOSEN);
    } finally {
      await r.stop();
    }
    expect(g.asked()).toBe(1);
    expect(delegatedKeys(await keys(s))).toHaveLength(1);
    const end = await facts(s);
    expect(end.verify).toEqual([]);
  }, 480_000);
});

describe("a delegation first offered after a consequence depends on it is declined", () => {
  it("once a collection of the character exists the shipped command declines it, writes nothing and leaves the branch unresolved", async () => {
    const ready = await template("READY", { cycle: true });
    const s = await cloneSlot(ready);
    const r = await resumed(s);
    try {
      await r.chat.init({});
      // the chat route already refuses (the mechanism is prepared from the character's accepted words)
      const refused = await r.chat.call("delegate_handling_duration", BOUNDS);
      expect(JSON.stringify(refused.data ?? refused.text)).toMatch(
        /already prepared|no delegation applies|commitment/,
      );
      const gathered = await r.chat.call("gather", { amount: 1, until: "complete" });
      expect(gathered.isError).not.toBe(true);
      for (let i = 0; i < 240; i++) {
        const st = (await r.chat.call("play_status")).data;
        if (st?.goal && ["DONE", "RETURNED", "INTERRUPTED"].includes(st.goal.outcome)) break;
        await sleep(250);
      }
    } finally {
      await r.stop();
    }
    // the operator's own command, run directly on the campaign that now holds a collection commitment of the character
    const c = await openOrdinary(s.campaignDir);
    const pcId = c.binding()!.value.active_pc.entity_id;
    await c.close();
    const said: string[] = [];
    const out = await delegateCollectionCycle({
      campaignDir: s.campaignDir,
      campaignId: s.config.campaignId,
      pcId,
      operatorDir: s.operatorDir,
      terminal: {
        say: (t: string) => void said.push(t),
        ask: async () => null,
        close: () => undefined,
      } as any,
      refereePolls: 3,
      refereePollMs: 5,
      scope: { constraintWords: null, shortest: BOUNDS.shortest, longest: BOUNDS.longest },
    });
    expect(out.status).toBe("DELEGATION_NOT_AVAILABLE");
    expect(out.details.join("\n")).toMatch(/collection commitment .* already exists/);
    expect(delegatedKeys(await keys(s))).toEqual([]);
  }, 600_000);
});

describe("an existing deployment keeps starting: the delegated selection is a separate, opt-in host", () => {
  it("gm-setup,gm-collection bind exactly as before; listing gm-delegate adds only the delegated operation, and no listed host is silently widened", () => {
    const legacy = parseRefereeBindings(["gm-setup", "gm-collection"])!;
    expect(legacy.map((b) => [b.hostId, [...b.operations]])).toEqual([
      [
        "gm-setup",
        [
          "I002_CLASSIFY",
          "IR_NATIVE_COMPATIBILITY",
          "IR_PHYSICAL_PLACEMENT",
          "F014D_DIRECT_PERCEPTION",
        ],
      ],
      ["gm-collection", ["PC_COLLECTION_CYCLE", "PC_COLLECTION_REACH"]],
    ]);
    const opted = parseRefereeBindings(["gm-setup", "gm-collection", "gm-delegate"])!;
    expect(opted.find((b) => b.hostId === "gm-delegate")!.operations).toEqual([
      "PC_COLLECTION_DELEGATE",
    ]);
    expect(opted.find((b) => b.hostId === "gm-collection")!.operations).toEqual([
      "PC_COLLECTION_CYCLE",
      "PC_COLLECTION_REACH",
    ]);
  });

  it("without the delegation host the status offers only the player's own words and the delegated tool is refused with a named reason", async () => {
    // a deployment that never listed or bound gm-delegate (the registration every earlier release made)
    const legacy = await template("MOMENT", { cycle: false });
    const s = await cloneSlot(legacy);
    const r = await resumed(s, { policy: gm().policy });
    try {
      await r.chat.init({});
      const before = (await status(r.chat)).route;
      expect(before.next.if_player_delegates_handling_duration).toBeUndefined();
      expect(before.next.if_handling_duration_unresolved).toMatchObject({
        tool: "state_handling_duration",
      });
      const out = await r.chat.call("delegate_handling_duration", BOUNDS);
      expect(JSON.stringify(out.data ?? out.text)).toMatch(/gm-delegate|no AI referee host/);
      expect(delegatedKeys(await keys(s))).toEqual([]);
    } finally {
      await r.stop();
    }
  }, 240_000);
});
