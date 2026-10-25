import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, it, vi } from "vitest";
import { PcCollectionAdapter } from "@immortalis/engine";
import { refereeDir, secretPath } from "../../packages/operator/src/referee-exchange.ts";
import { characterRecordPath } from "../../apps/phone/src/character-recovery.ts";
import {
  DECLARATION,
  chain,
  cloneSlot,
  resumed,
  stage,
  status,
  openOrdinary,
  courtyard,
  type Position,
  type Slot,
} from "../support/chat-route.ts";

it("a current workforce half survives an interrupted replacement of only the closure; recovery confirms the exact retained declaration afresh", async () => {
  const s = await cloneSlot(steps.READY!);
  const r = await resumed(s);
  const changed = {
    ...DECLARATION,
    closure_statement: "Only the facts held by the owners act within this closed courtyard",
  };
  const spy = vi
    .spyOn(PcCollectionAdapter.prototype, "establishSceneClosure")
    .mockResolvedValue({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "not published" } });
  try {
    const first = await stage(r.chat, "declare_closed_setting", changed);
    expect(first.finished.data.outcome).toBe("UNCERTAIN");
    expect((await status(r.chat)).route.barrier).toBe("RESUME");
    spy.mockRestore();
    const next = await stage(r.chat, "resume_collection_setup");
    expect(next.finished.elicited).toHaveLength(1);
    expect(next.finished.elicited[0]).toContain(changed.closure_statement);
    expect(next.finished.data.result.status).toBe("SETTING_DECLARED");
    const c = await openOrdinary(s.campaignDir);
    try {
      const owner = new PcCollectionAdapter(c.store);
      expect(owner.sceneClosure("world-courtyard", "locus-courtyard")!.fact.version).toBe(2);
      expect(owner.workforceScope("world-courtyard", "locus-courtyard")!.fact.version).toBe(1);
    } finally {
      await c.close();
    }
  } finally {
    spy.mockRestore();
    await r.stop();
  }
}, 180_000);

it("a changed local source set blocks a retained partial declaration before another consent or publication", async () => {
  const s = await cloneSlot(steps.PREPARED!);
  const r = await resumed(s);
  const spy = vi
    .spyOn(PcCollectionAdapter.prototype, "establishWorkforceScope")
    .mockResolvedValue({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "not published" } });
  try {
    expect((await stage(r.chat, "declare_closed_setting", DECLARATION)).finished.data.outcome).toBe(
      "UNCERTAIN",
    );
    spy.mockRestore();
    const c = await openOrdinary(s.campaignDir);
    try {
      const added = await c.establishSourceCondition({
        group_id: "source-change:group",
        intent_id: "source-change:intent",
        cause: "source-change:cause",
        basis: "new authored source after interruption",
        secrecy: "local-operator-session",
        source: {
          ...courtyard().source,
          source_key: "src-other",
          dimension: "another-pile",
          statement: "A separate pile contains one loose stone",
          quantity: { amount: 1, unit: "stone" },
        },
      });
      expect(added.ok, JSON.stringify(added)).toBe(true);
    } finally {
      await c.close();
    }
    const read = (await status(r.chat)).route;
    expect(read.readiness.prepared_to_request_collection).toBe(false);
    expect(read.state).toBe("BLOCKED");
    const attempt = await r.chat.call("resume_collection_setup");
    expect(attempt.isError).toBe(true);
    expect(attempt.elicited).toEqual([]);
  } finally {
    spy.mockRestore();
    await r.stop();
  }
}, 180_000);

let steps: Partial<Record<Position, Slot>>;
beforeAll(async () => {
  steps = await chain();
}, 400_000);

it("collection setup preserves H1 character-word identity and unreadable-record refusals without replacing retained words", async () => {
  const s = await cloneSlot(steps.READY!);
  const file = characterRecordPath(s.config);
  const original = existsSync(file) ? readFileSync(file, "utf8") : null;
  const scenario = JSON.parse(readFileSync(s.config.scenarioFile, "utf8"));
  // Deliberately conflicting NONCANONICAL recovery metadata, never owner facts.
  const words = {
    format: "immortalis-chat-character-words",
    format_version: 1,
    campaign_id: s.config.campaignId,
    world_id: scenario.world,
    locus_id: "locus-courtyard",
    pc_id: scenario.player_character,
    draft: null,
    draft_sha256: null,
    revision: 1,
    placement: null,
  };
  const restore = () =>
    original === null ? rmSync(file, { force: true }) : writeFileSync(file, original);
  const r = await resumed(s);
  try {
    for (const changed of [
      "{",
      ...["world_id", "locus_id", "pc_id"].map((key) =>
        JSON.stringify({ ...words, [key]: "another-identity" }),
      ),
    ]) {
      writeFileSync(file, changed);
      const read = (await status(r.chat)).route;
      expect(read.state).toBe("BLOCKED");
      expect(read.barrier).toBe("ENGINEERING");
      expect(read.readiness.prepared_to_request_collection).toBe(false);
      const attempt = await r.chat.call("finish_collection_setup");
      expect(attempt.isError).toBe(true);
      expect(attempt.elicited).toEqual([]);
      expect(readFileSync(file, "utf8")).toBe(changed);
    }
    restore();
    expect((await status(r.chat)).route.readiness.prepared_to_request_collection).toBe(true);
  } finally {
    restore();
    await r.stop();
  }
}, 120_000);

it("unreadable referee grants withhold readiness and dispatch, then recover without new player consent", async () => {
  const s = await cloneSlot(steps.READY!);
  const file = join(
    refereeDir({ stateDir: s.operatorDir, campaignId: s.config.campaignId }),
    "config.json",
  );
  const original = readFileSync(file, "utf8");
  const r = await resumed(s);
  try {
    writeFileSync(file, "{");
    const read = (await status(r.chat)).route;
    expect(read.state).toBe("UNAVAILABLE");
    expect(read.readiness.prepared_to_request_collection).toBe(false);
    expect(read.blockers).toContain("REFEREE_GRANTS_UNAVAILABLE");
    const attempt = await r.chat.call("finish_collection_setup");
    expect(attempt.isError).toBe(true);
    expect(attempt.elicited).toEqual([]);
    writeFileSync(file, original);
    const again = (await status(r.chat)).route;
    expect(again.readiness.prepared_to_request_collection).toBe(true);
    expect((await r.chat.call("finish_collection_setup")).elicited).toEqual([]);
  } finally {
    await r.stop();
  }
}, 120_000);

it("the same installed scenario in a different JSON member order converges without a replacement or question", async () => {
  const s = await cloneSlot(steps.READY!);
  const scenario = JSON.parse(readFileSync(s.config.scenarioFile, "utf8"));
  const reordered = JSON.stringify(Object.fromEntries(Object.entries(scenario).reverse()));
  writeFileSync(s.config.scenarioFile, reordered);
  const r = await resumed(s);
  try {
    expect((await status(r.chat)).route.readiness.prepared_to_request_collection).toBe(true);
    const out = await r.chat.call("finish_collection_setup");
    expect(out.isError).toBe(false);
    expect(out.elicited).toEqual([]);
    expect(out.data.run_id).toBeUndefined();
    expect(readFileSync(s.config.scenarioFile, "utf8")).toBe(reordered);
  } finally {
    await r.stop();
  }
}, 120_000);

it("a completed installation cannot claim collection readiness when a required play grant is no longer configured", async () => {
  const s = await cloneSlot(steps.READY!);
  const r = await resumed({ ...s, config: { ...s.config, refereeHostIds: ["gm-collection"] } });
  try {
    expect((await status(r.chat)).route.readiness.prepared_to_request_collection).toBe(false);
    const out = await r.chat.call("finish_collection_setup");
    expect(out.isError).toBe(true);
    expect(out.elicited).toEqual([]);
    expect(out.text).toContain("operation grants are incomplete");
  } finally {
    await r.stop();
  }
}, 120_000);

it("a mismatched private referee credential withholds readiness without exposing it or recreating consent", async () => {
  const s = await cloneSlot(steps.READY!);
  const file = secretPath(
    { stateDir: s.operatorDir, campaignId: s.config.campaignId },
    "gm-collection",
  );
  const original = readFileSync(file, "utf8");
  const r = await resumed(s);
  try {
    writeFileSync(file, "a".repeat(64));
    const out = await status(r.chat);
    expect(out.route.state).toBe("UNAVAILABLE");
    expect(out.route.readiness.prepared_to_request_collection).toBe(false);
    expect(JSON.stringify(out)).not.toContain(original.trim());
    expect(JSON.stringify(out)).not.toContain(file);
    writeFileSync(file, original);
    expect((await status(r.chat)).route.readiness.prepared_to_request_collection).toBe(true);
  } finally {
    await r.stop();
  }
}, 120_000);

it("a long Unicode declaration delivers every early and late field in consecutive review parts before consent", async () => {
  const s = await cloneSlot(steps.PREPARED!);
  const r = await resumed(s);
  const authored = Object.fromEntries(
    Object.keys(DECLARATION).map((k, i) => [k, `begin-${i} ${"庭🌒é".repeat(850)} end-${i}`]),
  );
  try {
    const out = await stage(r.chat, "declare_closed_setting", authored);
    expect(out.finished.data.exit_code).toBe(0);
    expect(out.finished.elicited.length).toBeGreaterThan(1);
    const reviews = out.finished.elicited.join("\n");
    for (const text of Object.values(authored)) expect(reviews).toContain(text);
    expect(out.finished.elicited.filter((s: string) => /type exactly "/.test(s))).toHaveLength(1);
    expect(out.finished.elicited.at(-1)).toContain("type exactly");
    expect(reviews).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/u);
  } finally {
    await r.stop();
  }
}, 180_000);
