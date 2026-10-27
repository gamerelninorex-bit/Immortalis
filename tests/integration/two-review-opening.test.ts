/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP and owner facts */
// MECHANISM ONLY: elicitation absent, simulated inline component decision; real operators/referee protocol/canonical owners.
import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { REVIEW_CALLBACK, REVIEW_URI, REVIEW_MIME } from "../../apps/phone/src/review-card.ts";
import { Chat, PLAYER, REFEREE } from "../support/chat-client.ts";
import { slot, run, openOrdinary } from "../support/chat-setting.ts";
import { hosts, MOMENT, TAU, stage, routePolicy, WORDS } from "../support/chat-route.ts";
import {
  UI_CAPS,
  openingSetting,
  openingCharacter,
  journey,
  call,
  reviewProposal,
  openingSettled,
  accept,
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
it("elicitation ABSENT: two complete inline reviews realize ordered setup, then a separate collect-five occurs once", async () => {
  const s = await slot({ playerViewHostId: "gm-setup" });
  const hs = await hosts(s);
  const r = await run(s, {}, undefined, UI_CAPS);
  const j = journey();
  try {
    const list = await r.chat.rpc("tools/list");
    const tools = list.json.result.tools;
    expect(tools.filter((t: any) => t._meta?.ui?.visibility?.[0] !== "app")).toHaveLength(26);
    expect(tools.find((t: any) => t.name === REVIEW_CALLBACK)._meta.ui.visibility).toEqual(["app"]);
    const resource = await r.chat.rpc("resources/read", { uri: REVIEW_URI });
    expect(resource.json.result.contents[0].mimeType).toBe(REVIEW_MIME);
    expect(resource.json.result.contents[0].text).not.toMatch(/[0-9a-f]{64}/);
    const st = await reviewProposal(r.chat, j, "propose_original_setting", openingSetting());
    expect(st.data.exit_code).toBe(0);
    const ch = await reviewProposal(r.chat, j, "propose_original_character", openingCharacter());
    expect(ch.isError, JSON.stringify(ch.data)).toBe(false);
    expect(await openingSettled(r.chat, j)).toMatchObject({ state: "PREPARED" });
    expect(j.reviews.map((x) => x.category)).toEqual(["setting", "generation"]);
    expect(j.reviews[0]!.material).toContain("daylight");
    expect(j.reviews[0]!.material).toContain(MOMENT.statement);
    expect(j.reviews[1]!.material).toContain(WORDS.presence);
    expect(j.reviews[1]!.material).toContain("12 second");
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
    await r.chat.init(UI_CAPS);
    await stage(r.chat, "reconcile_last_action", {}, noHuman);
    expect(await world(s)).toEqual(after);
    // Static resource, visible content, retained evidence never contain a live acceptance capability.
    for (const secret of j.privateCapabilities) expect(j.model.join("\n")).not.toContain(secret);
    const receipt = readdirSync(s.operatorDir).find((f) => f.startsWith("chat-reviewed."))!;
    expect(readFileSync(join(s.operatorDir, receipt), "utf8")).not.toContain('"capability"');
    console.log(
      "TWO_REVIEW_JOURNEY",
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
it("Bob, baseline human, daylight and clear view preserve meaning but invent no epoch, duration or scene/workforce producer", async () => {
  const s = await slot();
  const hs = await hosts(s);
  const r = await run(s, {}, undefined, UI_CAPS);
  const j = journey();
  try {
    const setting = openingSetting();
    delete setting.opening;
    await reviewProposal(r.chat, j, "propose_original_setting", setting);
    await reviewProposal(r.chat, j, "propose_original_character", {
      identity: "Bob",
      baseline_human: "An ordinary baseline human with normal faculties.",
      opening: { presence: WORDS.presence },
    });
    const o = await openingSettled(r.chat, j);
    expect(o.state, JSON.stringify(o)).toBe("MISSING_SOURCE");
    expect(o.detail).toMatch(/chronology/);
    expect(j.reviews.map((x) => x.category)).toEqual(["setting", "generation"]);
    expect(j.reviews[1]!.material).toContain("normal faculties");
    const facts = await world(s);
    expect(facts).toMatchObject({ source: 5, reserves: [] });
    expect(facts.time).toBeUndefined();
    expect(
      facts.keys.some((k) => k.startsWith("world/closure/") || k.startsWith("workforce/")),
    ).toBe(false);
    expect((await r.chat.call("collect", { amount: 5 })).isError).toBe(true);
  } finally {
    for (const h of hs) await h.stop();
    await r.app.close();
  }
}, 180_000);
it("wrong/missing private capability, another grant, referee scope, decline and stale revision cannot commit", async () => {
  const s = await slot();
  const r = await run(s, {}, undefined, UI_CAPS);
  const j = journey();
  try {
    let p = await call(r.chat, j, "propose_original_setting", openingSetting());
    for (let i = 0; i < 20 && !p.result?._meta?.review; i++)
      p = await call(r.chat, j, "await_action", { after: 0, wait_seconds: 1 });
    const v = p.result._meta.review;
    const args = {
      proposal_id: v.proposal_id,
      digest: v.digest,
      capability: v.capability,
      decision: "accept",
    };
    expect(
      (await r.chat.call(REVIEW_CALLBACK, { ...args, capability: "model-generated" })).isError,
    ).toBe(true);
    for (const extra of [{ actor: "other" }, { campaign: "other" }, { basis: "other" }])
      expect((await r.chat.call(REVIEW_CALLBACK, { ...args, ...extra })).isError).toBe(true);
    const other = new Chat(s.base);
    expect((await other.link("player", { player: PLAYER })).ok).toBe(true);
    await other.init(UI_CAPS);
    expect((await other.call(REVIEW_CALLBACK, args)).isError).toBe(true);
    const gm = new Chat(s.base);
    expect((await gm.link("referee", { referee: REFEREE })).ok).toBe(true);
    await gm.init(UI_CAPS);
    expect((await gm.call(REVIEW_CALLBACK, args)).json.error).toBeDefined();
    await accept(r.chat, j, p, "decline");
    await r.chat.call("await_action", { wait_seconds: 1 });
    expect((await r.chat.call(REVIEW_CALLBACK, args)).isError).toBe(true);
    expect(readdirSync(s.operatorDir).some((f) => f.startsWith("chat-reviewed."))).toBe(false);
    await r.chat.init({});
    const unavailable = await r.chat.call("propose_original_setting", openingSetting());
    expect(unavailable.data.state).toBe("REVIEW_UNAVAILABLE");
    expect(JSON.stringify(unavailable.result)).not.toContain("/confirm");
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
  const r = await run(s, {}, undefined, UI_CAPS);
  const j = journey();
  try {
    await reviewProposal(r.chat, j, "propose_original_setting", openingSetting());
    await reviewProposal(r.chat, j, "propose_original_character", openingCharacter());
    expect((await openingSettled(r.chat, j)).state).toBe("BLOCKED");
    expect(j.reviews).toHaveLength(2);
    expect((await world(s)).reserves).toEqual([]);
  } finally {
    for (const h of hs) await h.stop();
    await r.app.close();
  }
}, 180_000);
