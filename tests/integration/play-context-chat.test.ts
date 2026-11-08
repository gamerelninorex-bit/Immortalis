/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP replies and raw owner readback are untyped JSON */
// MECHANISM ONLY. A scripted assistant calls the typed tools through the real authenticated OAuth/MCP transport; the referee hosts and the
// "Game Master" scene host are scripts whose rules these tests wrote; the owners, the operator commands, the trusted adapter and the Glance
// gateway are real. This is NOT evidence that any AI host reads a request as a Game Master would, that any named client drives these tools
// as written, or that a retained disk survives a real redeploy: those remain UNRUN. "Reconnect" here is a service restart over the same
// local temporary directories.
import { beforeAll, describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { Chat, REFEREE } from "../support/chat-client.ts";
import { PC_WORDS } from "../support/observation.ts";
import { TAU, resumed, stage, started } from "../support/chat-route.ts";
import {
  LOOK,
  PILE_LOOK,
  buildReady,
  canonOf,
  finished,
  gatherAndLook,
  metered,
  policyOf,
  serviceOver,
  storeProtoOf,
  treeOf,
  until,
} from "../support/play-context.ts";
import type { Slot } from "../support/chat-route.ts";
import { readPlay } from "../../apps/phone/src/play-evidence.ts";

const BLIND_BODY = "One ordinary human body; I am permanently blind and have no visual faculty";
const NO_HIDDEN =
  /recoverable|reserve|source-delivery|delivery_id|\bremaining\b|\breach\b|verdict|task_id|secret|token|campaign-/i;

let ready: Slot;
let looked: Slot;
let blind: Slot;
let blindLooked: Slot;
let proto: any;

beforeAll(async () => {
  ready = (await buildReady()).ready;
  proto = await storeProtoOf(ready.campaignDir);
  // an earned observation, produced by the real chain: one gather, then one look in the player's own words
  const a = await serviceOver(ready, { scene: {} });
  try {
    await a.chat.init({});
    const done = await gatherAndLook(a);
    expect(done.look.finished.isError, JSON.stringify(done.look.finished.data)).toBe(false);
  } finally {
    await a.stop();
  }
  looked = a.s;
  // the independent constrained case: the character's own authored words state a blindness; a look is ruled not supported
  blind = (await buildReady(BLIND_BODY)).ready;
  const b = await serviceOver(blind, { scene: { vetoes: /permanently blind/ } });
  try {
    await b.chat.init({});
    await gatherAndLook(b);
  } finally {
    await b.stop();
  }
  blindLooked = b.s;
}, 900_000);

const briefingOf = async (chat: Chat) => (await chat.call("get_play_context")).data.briefing;

describe("positive delivery: ONE call gives the readings the four independent reads give", () => {
  it("the setting, the complete mirror and presence, the play state and the exact earned presentation", async () => {
    const r = await serviceOver(looked);
    try {
      await r.chat.init({});
      // the base journey, each with its own open
      const setting = (await r.chat.call("original_setting_status")).data;
      const character = (await r.chat.call("original_character_status")).data;
      const glance = await r.chat.call("read_current_observation_glance");
      const status = (await r.chat.call("play_status")).data;
      expect(glance.isError, glance.text).toBe(false);
      // the one-call journey
      const ctx = await r.chat.call("get_play_context");
      expect(ctx.isError, ctx.text).toBe(false);
      const b = ctx.data.briefing;
      expect(Object.keys(ctx.data)).toEqual(["briefing"]);
      expect(Object.keys(b)).toEqual([
        "status",
        "authored_starting_context",
        "out_of_character",
        "character_awareness",
        "scope_notice",
      ]);
      expect(b.status).toBe("QUALIFIED");
      // authored starting context: the immutable setting readback and the complete accepted mirror with its presence, unchanged
      expect(b.authored_starting_context.setting).toEqual({
        state: "ESTABLISHED",
        readback: setting.setting.readback,
      });
      expect(b.authored_starting_context.character).toEqual({
        state: "BOUND",
        readback: character.character.readback,
      });
      expect(b.authored_starting_context.character.readback.presence).toBe(PC_WORDS.presence);
      expect(b.authored_starting_context.character.readback.mirror.length).toBeGreaterThan(3);
      // out of character: the owner-grounded play state, the same `play_status` reports
      expect(b.out_of_character).toEqual({ play: status.play, next: status.next });
      expect(b.out_of_character.play).toEqual(await readPlay(r.s.config));
      expect(b.out_of_character.play.latest.phase).toBe("COMPLETED");
      // the character's awareness: the existing tool's text, byte for byte, with nothing added to it
      expect(JSON.stringify(b.character_awareness.current_observation)).toBe(glance.text);
      expect(Object.keys(b.character_awareness)).toEqual(["current_observation"]);
      expect(glance.text).toContain(PILE_LOOK);
      const shown = b.character_awareness.current_observation.value;
      expect(shown).toMatchObject({
        presentation: "NPK_EVENT_SIGNAL",
        disposable: true,
        form: "EVENT_SIGNAL",
      });
      expect(Object.keys(shown)).toEqual([
        "presentation",
        "disposable",
        "form",
        "viewpoint",
        "elements",
      ]);
      expect(shown.elements.map((e: any) => e.element)).toEqual(
        shown.elements.length === 4
          ? ["CONTACT", "PRESENTED_ATTRIBUTION", "REFERENT", "CONTENT"]
          : ["CONTACT", "REFERENT", "CONTENT"],
      );
      // it carries no raw world fact, remaining stock, Reserve total, task, credential or cause
      expect(JSON.stringify(b)).not.toMatch(NO_HIDDEN);
      expect(b.scope_notice).toMatch(/grants no action authority/);
      // `play_status` carries the SAME briefing, and its own fields are the ones it has always had
      expect(status.briefing).toEqual(b);
      expect(Object.keys(status)).toEqual(["goal", "play", "next", "notice", "briefing"]);
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("a not-yet-qualified campaign is NOT_QUALIFIED with only what is established, and the observation is the same refusal", async () => {
    const r = await started({ upTo: "SETTING" });
    try {
      await r.chat.init({});
      const b = await briefingOf(r.chat);
      expect(b.status).toBe("NOT_QUALIFIED");
      expect(b.authored_starting_context.setting.state).toBe("ESTABLISHED");
      expect(b.authored_starting_context.character).toEqual({ state: "NOT_BOUND" });
      expect(b.character_awareness.current_observation.ok).toBe(false);
      const status = (await r.chat.call("play_status")).data;
      expect(status.briefing).toEqual(b);
      expect(status.play).toEqual(await readPlay(r.s.config));
    } finally {
      await r.stop();
    }
  }, 120_000);
});

describe("the same refusal, and nothing the owners did not earn", () => {
  it("a campaign that was never looked at, one whose look was superseded, and a vetoed look are the SAME refusal", async () => {
    const never = await serviceOver(ready);
    const superseded = await serviceOver(looked, { scene: {} });
    const vetoed = await serviceOver(blindLooked);
    try {
      await never.chat.init({});
      await superseded.chat.init({});
      await vetoed.chat.init({});
      const a = await briefingOf(never.chat);
      expect(a.status).toBe("QUALIFIED");
      expect(a.character_awareness.current_observation.ok).toBe(false);
      // a further gather moves the canonical basis on: the earlier arrival is not revived
      expect((await superseded.chat.call("gather", { amount: 2, until: "complete" })).isError).toBe(
        false,
      );
      await until(superseded.chat, finished);
      const s = await briefingOf(superseded.chat);
      expect(s.character_awareness.current_observation.ok).toBe(false);
      // an authored blindness: the look was ruled not supported, nothing was earned, and the briefing infers nothing from it
      const v = await briefingOf(vetoed.chat);
      expect(v.status).toBe("QUALIFIED");
      expect(JSON.stringify(v.character_awareness)).toBe(JSON.stringify(a.character_awareness));
      expect(JSON.stringify(s.character_awareness)).toBe(JSON.stringify(a.character_awareness));
      expect((await canonOf(vetoed.s.campaignDir)).events).toBe(0);
      // the authored words are information; the engine did not turn them into a verdict anywhere else
      expect(JSON.stringify(v.authored_starting_context.character.readback.mirror)).toContain(
        "permanently blind",
      );
      expect(JSON.stringify(v.out_of_character)).not.toMatch(/blind|cannot see|sight/i);
      expect(JSON.stringify(v.character_awareness)).not.toMatch(/blind|cannot see|sight/i);
      // the matched positive does acquire its presentation
      const earned = await serviceOver(looked);
      try {
        await earned.chat.init({});
        expect((await briefingOf(earned.chat)).character_awareness.current_observation.ok).toBe(
          true,
        );
      } finally {
        await earned.stop();
      }
    } finally {
      await never.stop();
      await superseded.stop();
      await vetoed.stop();
    }
  }, 180_000);
});

describe("another meaningful decision, with no manual owner sequencing and no inference machinery", () => {
  it("the terminal status after a material operation carries the briefing; the Game Master is not asked; the owners alone move", async () => {
    const r = await serviceOver(looked, { scene: {} });
    try {
      await r.chat.init({});
      const before = await canonOf(r.s.campaignDir);
      const asked = r.gm!.answered.length;
      const first = await briefingOf(r.chat);
      expect(first.character_awareness.current_observation.ok).toBe(true);
      const gathered = await r.chat.call("gather", { amount: 2, until: "complete" });
      expect(gathered.isError).toBe(false);
      // the write-side response is exactly what it has always been: no briefing in it
      expect(Object.keys(gathered.data)).toEqual(["goal", "play", "next", "notice"]);
      const terminal = await until(r.chat, finished);
      expect(terminal.goal).toMatchObject({ outcome: "DONE", step: "FINISHED" });
      // the final read-only status carries the next context: no further context-read chain
      expect(terminal.briefing.status).toBe("QUALIFIED");
      expect(terminal.briefing.out_of_character.play.latest.phase).toBe("COMPLETED");
      expect(terminal.briefing.out_of_character.play.time.value).toBe(before.time + 2 * TAU);
      expect(terminal.briefing.character_awareness.current_observation.ok).toBe(false);
      expect(await briefingOf(r.chat)).toEqual(terminal.briefing);
      // owner-verified consequences, and no scene or perception dispatch for them
      const after = await canonOf(r.s.campaignDir);
      expect(after.reserve).toBe((before.reserve ?? 0) + 2);
      expect(after.source).toBe((before.source ?? 0) - 2);
      expect(after.time).toBe(before.time + 2 * TAU);
      expect(after.events).toBe(before.events);
      expect(after.verify).toEqual([]);
      expect(r.gm!.answered.length).toBe(asked);
      // a new look at the new basis is a new circumstance, and the briefing then delivers it from the owners, not from any memory
      const look = await stage(r.chat, "observe_surroundings", { attention: LOOK });
      expect(look.finished.isError, JSON.stringify(look.finished.data)).toBe(false);
      const again = await briefingOf(r.chat);
      expect(again.character_awareness.current_observation.ok).toBe(true);
      const glance = await r.chat.call("read_current_observation_glance");
      expect(JSON.stringify(again.character_awareness.current_observation)).toBe(glance.text);
    } finally {
      await r.stop();
    }
  }, 240_000);

  it("when the context cannot be read after an action finished, the actual outcome is preserved and the context is reported unavailable separately", async () => {
    const r = await serviceOver(looked, { scene: {} });
    try {
      await r.chat.init({});
      expect((await r.chat.call("gather", { amount: 1, until: "complete" })).isError).toBe(false);
      const done = await until(r.chat, finished);
      expect(done.goal).toMatchObject({ outcome: "DONE", step: "FINISHED" });
      const before = await canonOf(r.s.campaignDir);
      // another process holds the package: nothing can be read, and nothing is taken over
      const writer = await CanonicalCampaign.open(r.s.campaignDir, { buildId: "test-writer" });
      expect(writer.ok).toBe(true);
      if (!writer.ok) return;
      try {
        const status = (await r.chat.call("play_status")).data;
        expect(status.goal).toMatchObject({ outcome: "DONE", step: "FINISHED" });
        expect(status.briefing.status).toBe("UNAVAILABLE");
        expect(status.briefing.authored_starting_context).toEqual({
          setting: { state: "UNAVAILABLE" },
          character: { state: "UNAVAILABLE" },
        });
        expect(status.play.kind).toBe("UNAVAILABLE");
        const ctx = await r.chat.call("get_play_context");
        expect(ctx.isError).toBe(false);
        expect(ctx.data.briefing.status).toBe("UNAVAILABLE");
        expect(ctx.data.briefing.character_awareness.current_observation.ok).toBe(false);
      } finally {
        await writer.value.close();
      }
      // the outcome was never in doubt, and the read recovers by itself
      const after = (await r.chat.call("play_status")).data;
      expect(after.goal).toMatchObject({ outcome: "DONE", step: "FINISHED" });
      expect(after.briefing.status).toBe("QUALIFIED");
      expect(after.briefing.out_of_character.play.latest.phase).toBe("COMPLETED");
      expect(await canonOf(r.s.campaignDir)).toEqual(before);
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("simultaneous reads of one server (a host may issue parallel calls) are all answered, and identically", async () => {
    const r = await serviceOver(looked);
    try {
      await r.chat.init({});
      const out = await Promise.all([
        r.chat.call("get_play_context"),
        r.chat.call("play_status"),
        r.chat.call("get_play_context"),
        r.chat.call("play_status"),
      ]);
      const briefings = out.map((x) => x.data.briefing);
      for (const b of briefings) expect(b.status).toBe("QUALIFIED");
      for (const b of briefings) expect(b).toEqual(briefings[0]);
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("repeated harmless exchanges over the delivered content dispatch nothing, advance nothing and write nothing", async () => {
    const r = await serviceOver(looked, { scene: {} });
    const ref = new Chat(r.s.base);
    try {
      await r.chat.init({});
      expect((await ref.link("referee", { referee: REFEREE })).ok).toBe(true);
      await ref.init({});
      const tasks = async () =>
        JSON.stringify((await ref.call("referee_list_tasks", { host_id: "gm-setup" })).data);
      const before = {
        canon: await canonOf(r.s.campaignDir),
        package: treeOf(r.s.campaignDir),
        asked: r.gm!.answered.length,
        hosts: r.hosts.map((h) => h.answered.length),
        tasks: await tasks(),
      };
      const first = await briefingOf(r.chat);
      for (let i = 0; i < 4; i++) {
        expect(await briefingOf(r.chat)).toEqual(first);
        expect((await r.chat.call("play_status")).data.briefing).toEqual(first);
        expect(JSON.stringify(first.character_awareness.current_observation)).toBe(
          (await r.chat.call("read_current_observation_glance")).text,
        );
      }
      expect(await canonOf(r.s.campaignDir)).toEqual(before.canon);
      expect(treeOf(r.s.campaignDir)).toEqual(before.package);
      expect(r.gm!.answered.length).toBe(before.asked);
      expect(r.hosts.map((h) => h.answered.length)).toEqual(before.hosts);
      expect(await tasks()).toBe(before.tasks);
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("a reconnect (a new service over the same directories) delivers the same briefing and changes nothing", async () => {
    const one = await serviceOver(looked);
    await one.chat.init({});
    const first = await briefingOf(one.chat);
    await one.stop();
    const before = { canon: await canonOf(one.s.campaignDir), package: treeOf(one.s.campaignDir) };
    const two = await resumed(one.s, { policy: policyOf() });
    try {
      await two.chat.init({});
      expect(await briefingOf(two.chat)).toEqual(first);
      expect(await canonOf(one.s.campaignDir)).toEqual(before.canon);
      expect(treeOf(one.s.campaignDir)).toEqual(before.package);
    } finally {
      await two.stop();
    }
  }, 120_000);
});

describe("the tool: strict, authenticated, read-only, and costing one verified open", () => {
  it("takes exactly {}: any argument is refused before anything is opened", async () => {
    const r = await serviceOver(looked);
    try {
      await r.chat.init({});
      for (const args of [{ x: 1 }, { campaign: "campaign-test" }, { pc_id: "pc-maren" }]) {
        const m = await metered(() => r.chat.call("get_play_context", args), proto);
        expect(m.value.isError, JSON.stringify(args)).toBe(true);
        expect(m.counts.open, JSON.stringify(args)).toBe(0);
        expect(m.counts.getFact, JSON.stringify(args)).toBe(0);
      }
      // a non-object `arguments` never reaches the handler
      for (const bad of [[], "x", 7]) {
        const raw = await r.chat.raw(
          "POST",
          "/mcp",
          {
            jsonrpc: "2.0",
            id: "bad",
            method: "tools/call",
            params: { name: "get_play_context", arguments: bad },
          },
          r.chat.headers(),
        );
        expect(raw.json.error.code).toBe(-32602);
      }
      const listed = (await r.chat.rpc("tools/list")).json.result.tools.find(
        (t: any) => t.name === "get_play_context",
      );
      expect(listed.inputSchema).toEqual({
        type: "object",
        properties: {},
        additionalProperties: false,
      });
      expect(listed.annotations).toMatchObject({ readOnlyHint: true, idempotentHint: true });
      // one verified open for the whole briefing, through the whole authenticated transport
      const m = await metered(() => r.chat.call("get_play_context"), proto);
      expect(m.value.isError).toBe(false);
      expect(m.counts.open).toBe(1);
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("is the player lane's alone: no token, a referee token and a revoked grant read nothing", async () => {
    const r = await serviceOver(looked);
    try {
      await r.chat.init({});
      const before = await canonOf(r.s.campaignDir);
      const stranger = new Chat(r.s.base);
      expect(
        (
          await stranger.rpc("tools/call", {
            name: "get_play_context",
            arguments: {},
          })
        ).status,
      ).toBe(401);
      const ref = new Chat(r.s.base);
      expect((await ref.link("referee", { referee: REFEREE })).ok).toBe(true);
      await ref.init({});
      expect((await ref.call("get_play_context")).json.error.code).toBe(-32602);
      expect((await ref.rpc("tools/list")).json.result.tools.map((t: any) => t.name)).not.toContain(
        "get_play_context",
      );
      const mine = r.app
        .oauthLedger!.list()!
        .find((e) => e.client === r.chat.clientId && e.state === "ISSUED")!;
      expect(r.app.oauthLedger!.revoke(mine.client, mine.grant, "OPERATOR")).toBe("REVOKED");
      expect(
        (await r.chat.rpc("tools/call", { name: "get_play_context", arguments: {} })).status,
      ).toBe(401);
      expect(await canonOf(r.s.campaignDir)).toEqual(before);
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("is never replayed from a request identity: the same JSON-RPC id after a material change reads the owners afresh", async () => {
    const r = await serviceOver(looked, { scene: {} });
    try {
      await r.chat.init({});
      const request = {
        jsonrpc: "2.0",
        id: "ctx-fixed",
        method: "tools/call",
        params: { name: "get_play_context", arguments: {} },
      };
      const one = await r.chat.raw("POST", "/mcp", request, r.chat.headers());
      const asData = (x: any) => JSON.parse(x.json.result.content[0].text).briefing;
      expect(asData(one).character_awareness.current_observation.ok).toBe(true);
      expect((await r.chat.call("gather", { amount: 1, until: "complete" })).isError).toBe(false);
      await until(r.chat, finished);
      const two = await r.chat.raw("POST", "/mcp", request, r.chat.headers());
      expect(asData(two).character_awareness.current_observation.ok).toBe(false);
      expect(asData(two).out_of_character.play.latest.phase).toBe("COMPLETED");
    } finally {
      await r.stop();
    }
  }, 120_000);
});
