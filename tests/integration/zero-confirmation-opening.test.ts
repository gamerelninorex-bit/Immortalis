/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP and owner facts */
// MECHANISM ONLY: elicitation absent, simulated inline component decision; real operators/referee protocol/canonical owners.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { REVIEW_CALLBACK } from "../../apps/phone/src/review-card.ts";
import { Chat, REFEREE } from "../support/chat-client.ts";
import { MOMENT, TAU, WORDS, hosts, routePolicy, stage } from "../support/chat-route.ts";
import { openOrdinary, run, slot } from "../support/chat-setting.ts";
import {
  journey,
  openingCharacter,
  openingSetting,
  openingSettled,
  reviewProposal,
} from "../support/two-review-opening.ts";
const world = async (s: Awaited<ReturnType<typeof slot>>) => {
  const c = await openOrdinary(s.campaignDir);
  try {
    const fs = c.store.listFacts();
    return {
      head: c.store.head().state_sha256,
      source: (c.store.getFact("world/world-courtyard/source/src-loose-stones")?.value as any)
        ?.recoverable.amount,
      reserves: fs
        .filter((f) => f.key.startsWith("production/reserve/"))
        .map((f) => (f.value as any).quantity.amount),
      time: (c.store.getFact("temporal/state")?.value as any)?.canonical_time.value,
      keys: fs.map((f) => f.key),
      custody: !!c.binding() && !!c.pcPhysicalLocusCustody(c.binding()!.value.active_pc.entity_id),
    };
  } finally {
    await c.close();
  }
};
it("UI and elicitation ABSENT: exact requests realize ordered setup, then a separate collect-five occurs once", async () => {
  const s = await slot({ playerViewHostId: "gm-setup" });
  const hs = await hosts(s);
  const r = await run(s, {}, undefined, {});
  const j = journey();
  try {
    const list = await r.chat.rpc("tools/list");
    const tools = list.json.result.tools;
    expect(tools.filter((t: any) => t._meta?.ui?.visibility?.[0] !== "app")).toHaveLength(26);
    expect(tools.some((t: any) => t.name === REVIEW_CALLBACK)).toBe(false);
    const st = await reviewProposal(r.chat, j, "propose_original_setting", openingSetting());
    expect(st.data.exit_code).toBe(0);
    const ch = await reviewProposal(r.chat, j, "propose_original_character", openingCharacter());
    expect(ch.isError, JSON.stringify(ch.data)).toBe(false);
    expect(await openingSettled(r.chat, j)).toMatchObject({ state: "PREPARED" });
    expect(j.reviews).toEqual([]);
    const readback = (await r.chat.call("original_character_status")).result.structuredContent
      .request_readback;
    expect(readback.setting).toContain("daylight");
    expect(readback.setting).toContain(MOMENT.statement);
    expect(readback.character).toContain(WORDS.presence);
    expect(readback.character).toContain("12 second");
    expect(readback.character).toContain("The referee’s findings");
    const before = await world(s);
    expect(before).toMatchObject({ source: 5, reserves: [0], time: MOMENT.value });
    expect(before.custody).toBe(true);
    const noHuman = () => {
      throw new Error("ordinary requests need no redundant human review");
    };
    expect((await stage(r.chat, "collect", { amount: 5 }, noHuman)).finished.data.exit_code).toBe(
      0,
    );
    expect((await stage(r.chat, "continue_collection", {}, noHuman)).finished.data.exit_code).toBe(
      0,
    );
    expect(await world(s)).toMatchObject({ source: 5, reserves: [0], time: MOMENT.value });
    expect((await stage(r.chat, "finish_collection", {}, noHuman)).finished.data.exit_code).toBe(0);
    const after = await world(s);
    expect(after).toMatchObject({ source: 0, reserves: [5], time: MOMENT.value + 5 * TAU });
    expect((await stage(r.chat, "finish_collection", {}, noHuman)).finished.data.exit_code).toBe(3);
    expect(await world(s)).toEqual(after);
    await r.chat.init({});
    await stage(r.chat, "reconcile_last_action", {}, noHuman);
    expect(await world(s)).toEqual(after);
    // Static resource, visible content, retained evidence never contain a live acceptance capability.
    for (const secret of j.privateCapabilities) expect(j.model.join("\n")).not.toContain(secret);
    const receipt = readdirSync(s.operatorDir).find((f) => f.startsWith("chat-requests."))!;
    expect(readFileSync(join(s.operatorDir, receipt), "utf8")).not.toContain('"capability"');
    console.log(
      "ZERO_CONFIRMATION_JOURNEY",
      JSON.stringify({
        reviews: j.reviews.map((x) => x.category),
        tools: j.tools,
        pageSwitches: 0,
        typedChallenges: 0,
        actualClient: "UNRUN",
      }),
    );
  } finally {
    for (const h of hs) await h.stop();
    await r.app.close();
  }
}, 240_000);
it("bare Bob premises stop truthfully at the missing physical source producer without inventing placement, time, rights or workforce", async () => {
  const s = await slot();
  const hs = await hosts(s);
  const r = await run(s, {}, undefined, {});
  const j = journey();
  try {
    const setting = openingSetting();
    delete setting.opening;
    const premises = "Lumber yard; daylight; clear view; five stacked chopped logs.";
    setting.world.premise = premises;
    setting.world.reference_causal_basis.established_canon = premises;
    setting.locus.designation = "Lumber yard";
    setting.locus.constraints = [{ aspect: "visibility", statement: "Daylight; clear view." }];
    setting.source.statement = "Five stacked chopped logs.";
    setting.source.access_facts = [
      { aspect: "visibility", statement: "Daylight; clear view of the five stacked chopped logs." },
    ];
    // The real transcript supplies no source-owned physical dimension. Do not copy the complete fixture's ground-surface claim into it.
    delete setting.source.dimension;
    const proposed = await reviewProposal(r.chat, j, "propose_original_setting", setting);
    expect(proposed.isError).toBe(true);
    expect(proposed.text).toContain("source.dimension");
    expect(proposed.result?._meta?.review).toBeUndefined();
    expect(proposed.elicited).toEqual([]);
    const bob = await reviewProposal(r.chat, j, "propose_original_character", {
      identity: "Bob",
      baseline_human: "An ordinary human with nothing special.",
    });
    expect(bob.isError).toBe(true);
    expect(bob.text).toMatch(/setting.*not established/);
    expect((await r.chat.call("collect", { amount: 5 })).isError).toBe(true);
    expect(existsSync(s.campaignDir)).toBe(false);
    expect(j.reviews).toEqual([]);
    // Source-complete physical fixtures with genuinely missing chronology/cycle producers are separately compared in the A2 matrix.
  } finally {
    for (const h of hs) await h.stop();
    await r.app.close();
  }
}, 180_000);
it("duplicate transport delivery is one exact request; changed input, invented approvals and wrong scopes fail", async () => {
  const s = await slot();
  const r = await run(s, {}, undefined, {});
  try {
    const rpc = {
      jsonrpc: "2.0",
      id: "original-request",
      method: "tools/call",
      params: { name: "propose_original_setting", arguments: openingSetting() },
    };
    const [first, replay] = await Promise.all([
      r.chat.raw("POST", "/mcp", rpc, r.chat.headers()),
      r.chat.raw("POST", "/mcp", rpc, r.chat.headers()),
    ]);
    expect(replay.json).toEqual(first.json);
    const changed = structuredClone(rpc);
    changed.params.arguments.source.quantity.amount = 6;
    expect(
      (await r.chat.raw("POST", "/mcp", changed, r.chat.headers())).json.error.message,
    ).toMatch(/different input/);
    await import("../support/chat-setting.ts").then((m) => m.follow(r.chat));
    expect((await world(s)).source).toBe(5);
    expect((await r.chat.call(REVIEW_CALLBACK, { accept: true })).json.error).toBeDefined();
    const gm = new Chat(s.base);
    expect((await gm.link("referee", { referee: REFEREE })).ok).toBe(true);
    await gm.init({});
    expect((await gm.call("propose_original_setting", openingSetting())).json.error).toBeDefined();
    expect(
      (await r.chat.call("propose_original_setting", { ...openingSetting(), approve: true }))
        .isError,
    ).toBe(true);
    const before = await world(s);
    for (let i = 0; i < 3; i++) await r.chat.call("original_setting_status");
    expect(await world(s)).toEqual(before);
    expect(readdirSync(s.operatorDir).some((f) => f.startsWith("chat-reviewed."))).toBe(false);
    const receipts = JSON.parse(
      readFileSync(join(s.operatorDir, `chat-requests.${s.config.campaignId}.json`), "utf8"),
    ).receipts;
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      origin: "AUTHENTICATED_REQUEST",
      request: { id: JSON.stringify("original-request"), tool: "propose_original_setting" },
    });
  } finally {
    await r.app.close();
  }
}, 120_000);
it("a later materially different physical GM reading blocks reuse without inventing a third approval", async () => {
  const s = await slot({ playerViewHostId: "gm-setup" });
  const hs = await hosts(
    s,
    routePolicy({ physical: { presence: { match: /originally present/, mode: "AMBIGUOUS" } } }),
  );
  const r = await run(s, {}, undefined, {});
  const j = journey();
  try {
    await reviewProposal(r.chat, j, "propose_original_setting", openingSetting());
    await reviewProposal(r.chat, j, "propose_original_character", openingCharacter());
    expect((await openingSettled(r.chat, j)).state).toBe("BLOCKED");
    expect(j.reviews).toHaveLength(0);
    expect((await world(s)).reserves).toEqual([]);
  } finally {
    for (const h of hs) await h.stop();
    await r.app.close();
  }
}, 180_000);

it("a fresh service after real ordinary play does not rerun setup, refresh declarations, collect again or advance time", async () => {
  const { supportedOpening, completeOpening } = await import("../support/two-review-opening.ts");
  const { createPhoneServer } = await import("../../apps/phone/src/server.ts");
  const r = await supportedOpening();
  let app = r.app;
  try {
    await completeOpening(r);
    const noHuman = () => {
      throw new Error("ordinary play or recovery must not ask for another approval");
    };
    for (const [tool, args] of [
      ["collect", { amount: 5 }],
      ["continue_collection", {}],
      ["finish_collection", {}],
    ] as const)
      expect((await stage(r.chat, tool, args, noHuman)).finished.data.exit_code).toBe(0);
    const prior = await world(r.s);
    await app.close();
    app = createPhoneServer(r.s.config, { pollMs: 20 });
    await app.listen();
    await r.chat.init({});
    await stage(r.chat, "reconcile_last_action", {}, noHuman);
    expect(await openingSettled(r.chat, r.j)).toMatchObject({ state: "EXISTING_PLAY" });
    expect(await world(r.s)).toEqual(prior);
    expect(r.j.reviews).toHaveLength(0);
  } finally {
    for (const h of r.hosts) await h.stop();
    await app.close();
  }
}, 180_000);
