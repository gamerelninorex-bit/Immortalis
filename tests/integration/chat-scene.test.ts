/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP client and raw owner readback */
// MECHANISM ONLY. A scripted assistant calls the typed tools, the "Game Master" and the "referee" are scripts whose rules this test wrote,
// the owners are real. This is NOT evidence that any AI host reads a request as a Game Master would, that any named client drives these tools
// as written, or that a retained disk survives a real redeploy: those remain UNRUN. "Reopen" here is a local temporary directory.
import { describe, expect, it } from "vitest";
import {
  ACTUATOR,
  CYCLE,
  DECLARATION,
  MOMENT,
  TAU,
  TRAVERSAL,
  openOrdinary,
  preparation,
  routePolicy,
  stage,
  started,
  follow,
  resumed,
} from "../support/chat-route.ts";
import { PC_WORDS, SCENE } from "../support/observation.ts";
import {
  bindScene,
  perceptionPolicy,
  scenePolicy,
  startScene,
  withGranules,
} from "../support/scene.ts";

const LOOK = "at the pale material I have just gathered";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(chat: any, ok: (status: any) => boolean, rounds = 240) {
  let last: any;
  for (let i = 0; i < rounds; i++) {
    last = (await chat.call("play_status")).data;
    if (last && ok(last)) return last;
    await sleep(250);
  }
  throw new Error(`not reached: ${JSON.stringify(last)}`);
}
const finished = (s: any) =>
  s.goal !== null && ["DONE", "RETURNED", "INTERRUPTED"].includes(s.goal.outcome);

async function facts(s: { campaignDir: string }) {
  const c = await openOrdinary(s.campaignDir);
  try {
    const all = c.store.listFacts();
    return {
      viewing: all.filter((f) => /^world-state\/pc\/[^/]+\/current-viewing\//.test(f.key)),
      appearance: all.filter((f) => /^world\/[^/]+\/output-appearance\//.test(f.key)),
      scene: all.filter((f) => (f.value as any).operation === "GM_SCENE_RESOLUTION"),
      perception: all.filter((f) => (f.value as any).operation === "F014D_DIRECT_PERCEPTION"),
      events: all.filter((f) => /^access\/[^/]+\/event$/.test(f.key)),
      time: (c.store.getFact("temporal/state")!.value as any).canonical_time.value as number,
      reserve: (all.find((f) => f.key.startsWith("production/reserve/"))!.value as any).quantity
        .amount as number,
      verify: c.verify(),
    };
  } finally {
    await c.close();
  }
}

describe("a natural first-play loop, start to finish, through the chat tools", () => {
  it("sparse setup -> one gather request -> one look in the player's words -> the earned Glance -> another gather -> reopen", async () => {
    const base = routePolicy();
    const r = await started({
      mutateSetting: withGranules(),
      policy: perceptionPolicy(base),
      characterWords: {
        // the character states neither a direction nor open eyes: the legacy question could never place their sight
        embodiment: `${PC_WORDS.embodiment}; ${ACTUATOR}; ${CYCLE}; ${TRAVERSAL}`,
        presence: PC_WORDS.presenceBare,
      },
    });
    await bindScene(r.s.operatorDir);
    const gm = startScene(r.s.operatorDir, scenePolicy());
    try {
      for (const [tool, args] of [
        ["establish_character_location", {}],
        ["state_starting_moment", MOMENT],
        ["propose_collection_preparation", preparation(CYCLE)],
        [
          "declare_closed_setting",
          {
            ...DECLARATION,
            domain_designation: "The stone alcove",
            domain_topology: SCENE.geometry,
          },
        ],
        ["finish_collection_setup", {}],
      ] as const) {
        const done = await stage(r.chat, tool, args);
        expect(done.finished.isError, `${tool}: ${JSON.stringify(done.finished.data)}`).toBe(false);
      }
      const setup = await facts(r.s);
      expect(setup.viewing).toHaveLength(0);
      expect(setup.appearance).toHaveLength(0);
      expect(setup.scene).toHaveLength(0);

      // ONE natural request carries the gathering to its earned end
      expect((await r.chat.call("gather", { amount: 3, until: "complete" })).isError).toBe(false);
      const gathered = await until(r.chat, finished);
      expect(gathered.goal).toMatchObject({ outcome: "DONE", step: "FINISHED" });
      const afterGather = await facts(r.s);
      expect(afterGather.reserve).toBe(3);
      expect(afterGather.time).toBe(MOMENT.value + 3 * TAU);
      // gathering is a Production result; it asked the Game Master nothing and published no appearance
      expect(afterGather.scene).toHaveLength(0);

      // ONE look in the player's own words: the GM rules the appearance and the ordinary look, the custodian publishes, the referee perceives
      const look = await stage(r.chat, "observe_surroundings", { attention: LOOK });
      expect(look.finished.isError, JSON.stringify(look.finished.data)).toBe(false);
      expect(look.finished.data?.exit_code).toBe(0);
      expect(look.finished.elicited ?? []).toHaveLength(0);
      const looked = await facts(r.s);
      expect(looked.viewing).toHaveLength(1);
      expect(looked.appearance).toHaveLength(1);
      expect(looked.events).toHaveLength(1);
      expect(looked.time).toBe(afterGather.time); // a look passes no time
      expect(looked.verify).toEqual([]);
      const glance = await r.chat.call("read_current_observation_glance");
      expect(glance.isError, glance.text).toBe(false);
      expect(JSON.stringify(glance.data)).toContain("pale, dry, granular crystals");
      expect(JSON.stringify(glance.data)).not.toMatch(
        /source-delivery|reserve|recoverable|\b3\b|salt|gathering/,
      );

      // a different next choice is still the player's: the same service gathers again (the Game Master is not asked)
      const asked = gm.answered.length;
      expect((await r.chat.call("gather", { amount: 2, until: "complete" })).isError).toBe(false);
      const second = await until(
        r.chat,
        (x) => finished(x) && x.goal.amount === 2 && x.goal.outcome === "DONE",
      );
      expect(second.goal.outcome).toBe("DONE");
      expect(gm.answered).toHaveLength(asked);
      const again = await facts(r.s);
      expect(again.reserve).toBe(5);
      expect(again.time).toBe(MOMENT.value + 5 * TAU);
      // the first look's rulings are untouched, and a look at the NEW basis is a new circumstance (new ruling), not the old one reused
      const afterAgain = await r.chat.call("observe_surroundings", { attention: LOOK });
      expect(afterAgain.isError).toBe(false);
      await follow(r.chat, null, 40);
      const newLook = await facts(r.s);
      expect(newLook.viewing).toHaveLength(2);
      expect(newLook.appearance).toHaveLength(2);
      expect(newLook.verify).toEqual([]);
    } finally {
      await gm.stop();
      await r.stop();
    }

    // reopen over the same retained directories (a local temporary directory: RETAINED STORAGE on a deployment is UNRUN)
    const back = await resumed(r.s, { policy: perceptionPolicy(base) });
    try {
      await back.chat.init({});
      const glance = await back.chat.call("read_current_observation_glance");
      expect(glance.isError, glance.text).toBe(false);
      expect(JSON.stringify(glance.data)).toContain("pale, dry, granular crystals");
      const status = (await back.chat.call("play_status")).data;
      expect(status.play.latest.phase).toBe("COMPLETED");
      expect((await facts(r.s)).verify).toEqual([]);
    } finally {
      await back.stop();
    }
  }, 600_000);
});
