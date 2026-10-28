import { PcCollectionAdapter } from "@immortalis/engine";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { beforeAll, expect, it, vi } from "vitest";
import { characterRecordPath } from "../../apps/phone/src/character-recovery.ts";
import { refereeDir, secretPath } from "../../packages/operator/src/referee-exchange.ts";
import {
  DECLARATION,
  HANDLING,
  MOMENT,
  chain,
  cloneSlot,
  courtyard,
  embodiment,
  openOrdinary,
  resumed,
  routePolicy,
  stage,
  started,
  status,
  type Position,
  type Slot,
} from "../support/chat-route.ts";
import { UI_CAPS } from "../support/two-review-opening.ts";

it("BLUE PR88 H1: an unrelated accepted breath-holding duration leaves the actual handling-cycle branch open to the existing classifier and owner", async () => {
  const r = await started({
    cycle: false,
    characterWords: {
      embodiment: `${embodiment(false)}; this body can hold its breath for 30 second`,
    },
  });
  try {
    await stage(r.chat, "establish_character_location");
    await stage(r.chat, "state_starting_moment", MOMENT);
    const read = (await status(r.chat)).route;
    expect(
      read.stages.find((s: { stage: string }) => s.stage === "handling_duration"),
    ).toMatchObject({
      state: "NEXT",
    });
    expect(read.next).toMatchObject({
      tool: "propose_collection_preparation",
      if_handling_duration_unresolved: { tool: "state_handling_duration" },
    });
    const out = await stage(r.chat, "state_handling_duration", { words: HANDLING });
    expect(out.started.isError).toBe(false);
    expect(out.finished.data.result.status).toBe("CLARIFICATION_ACCEPTED");
    expect(out.finished.elicited).toHaveLength(1);
    expect(out.finished.elicited[0]).toContain(HANDLING);
    expect(out.finished.elicited[0]).toContain("branch reading: UNRESOLVED_BEFORE");
    expect((await status(r.chat)).route.stages).toContainEqual({
      stage: "handling_duration",
      state: "DONE",
    });
    const c = await openOrdinary(r.s.campaignDir);
    try {
      const owner = new PcCollectionAdapter(c.store);
      const pc = c.binding()!.value.active_pc.entity_id;
      expect(owner.clarificationScope(pc)!.prior_closures[0]!.statements).toEqual([HANDLING]);
      expect(JSON.stringify(c.playerCharacter(pc)!.value)).toContain(
        "hold its breath for 30 second",
      );
    } finally {
      await c.close();
    }
  } finally {
    await r.stop();
  }
}, 120_000);

it("the existing classifier can find the cycle already stated and refuse a redundant clarification before any new human acceptance", async () => {
  const r = await started({
    policy: routePolicy({ clarify: { branch: "ALREADY_STATED_IN_BASELINE" } }),
  });
  try {
    await stage(r.chat, "establish_character_location");
    await stage(r.chat, "state_starting_moment", MOMENT);
    const out = await stage(r.chat, "state_handling_duration", { words: HANDLING });
    expect(out.started.isError).toBe(false);
    expect(out.finished.data.result.status).toBe("CLARIFICATION_NOT_ACCEPTED");
    expect(out.finished.elicited).toEqual([]);
    const c = await openOrdinary(r.s.campaignDir);
    try {
      const pc = c.binding()!.value.active_pc.entity_id;
      expect(new PcCollectionAdapter(c.store).clarificationScope(pc)!.prior_closures).toEqual([]);
    } finally {
      await c.close();
    }
  } finally {
    await r.stop();
  }
}, 120_000);

it("a current workforce half survives an interrupted replacement of only the closure; recovery reuses the exact retained declaration receipt without reapproval", async () => {
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
    expect(first.finished.elicited).toHaveLength(1);
    expect(first.finished.elicited[0]).toContain(changed.closure_statement);
    expect(next.finished.elicited).toEqual([]);
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

it("a long Unicode declaration delivers one complete inline card with every early/late field and no publication before the human control", async () => {
  const s = await cloneSlot(steps.PREPARED!);
  const r = await resumed(s);
  await r.chat.init(UI_CAPS);
  const authored = Object.fromEntries(
    Object.keys(DECLARATION).map((k, i) => [k, `begin-${i} ${"庭🌒é".repeat(850)} end-${i}`]),
  );
  const publish = vi.spyOn(PcCollectionAdapter.prototype, "establishSceneClosure");
  try {
    const completed = await stage(r.chat, "declare_closed_setting", authored, () => {
      throw new Error("no review is allowed");
    });
    expect(completed.finished.data.exit_code).toBe(0);
    expect(completed.finished.elicited).toEqual([]);
    const records = JSON.parse(
      readFileSync(join(s.operatorDir, `chat-requests.${s.config.campaignId}.json`), "utf8"),
    ).receipts;
    const material = records.findLast(
      (x: { verb: string }) => x.verb === "declare-closed-setting",
    ).material;
    for (const text of Object.values(authored)) expect(material).toContain(text);
    expect(material).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/u);
    expect(publish).toHaveBeenCalledTimes(1);
  } finally {
    publish.mockRestore();
    await r.stop();
  }
}, 180_000);
