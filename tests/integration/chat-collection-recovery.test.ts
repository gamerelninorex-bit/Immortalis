// MECHANISM ONLY: isolated real owners; scripted human/referee fixtures are not ordinary-chat or gameplay acceptance.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PcCollectionAdapter, TemporalCoordinator } from "@immortalis/engine";
import { IntentLedger, collect, collectContinue, reconcile } from "@immortalis/operator";
import {
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  pcCollectionRequestId,
  productionExtractionObjectId,
  productionReserveKey,
  temporalObjectKey,
  worldSourceConditionKey,
} from "@immortalis/contracts";
import {
  ACTOR_FIXTURE_EXTENSION,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  SRC_BASIS_ID,
  SRC_RESERVE,
  SRC_SOURCE_KEY,
  SRC_UNIT,
} from "@immortalis/testkit";
import {
  captureCollection,
  runCollectionOperation,
} from "../../apps/phone/src/collection-recovery.ts";
import {
  PENDING_FORMAT,
  readPending,
  writePending,
  type PendingOperation,
} from "../../apps/phone/src/recovery.ts";
import { createPhoneServer } from "../../apps/phone/src/server.ts";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import {
  PC,
  W,
  MECH,
  T0,
  TAU,
  collectionCampaign,
  hostAnswer,
  reserveAmount,
  sourceRemaining,
} from "../support/pc-collection.ts";
import { addLedger, advanceTo, resident } from "../support/pc-lapse.ts";
import {
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  scriptedTerminal,
} from "../support/operator.ts";
import { Chat, PLAYER, chatConfig, humanConfirms } from "../support/chat-client.ts";
import { tempDir } from "../support/tmp.ts";

const extension = { extension: ACTOR_FIXTURE_EXTENSION };
const input = {
  source: { world_id: W, source_key: SRC_SOURCE_KEY },
  reserve_id: SRC_RESERVE,
  quantity: { amount: 3, unit: SRC_UNIT },
  mechanism_id: MECH,
  basis_id: SRC_BASIS_ID,
};
const options = {
  world: W,
  source: SRC_SOURCE_KEY,
  reserve: SRC_RESERVE,
  amount: "3",
  "quantity-unit": SRC_UNIT,
  mechanism: MECH,
  basis: SRC_BASIS_ID,
};
let template: string;
beforeAll(async () => {
  template = tempDir("chat-collection-template-");
  const c = await collectionCampaign({ dir: template });
  await c.campaign.close();
}, 240_000);
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const dirs = copyCampaign(template);
  const scenarioFile = join(tempDir("chat-collection-scenario-"), "scenario.json");
  writeFileSync(
    scenarioFile,
    JSON.stringify({
      player_character: PC,
      world: W,
      source: SRC_SOURCE_KEY,
      reserve: SRC_RESERVE,
      quantity_unit: SRC_UNIT,
      mechanism: MECH,
      basis: SRC_BASIS_ID,
    }),
  );
  const config = await chatConfig({ ...dirs, campaignId: FIXTURE_CAMPAIGN, scenarioFile });
  return { dirs, config };
}
async function pending(
  config: PhoneConfig,
  command: string,
  uid = "original",
): Promise<PendingOperation> {
  const collection = await captureCollection(config, uid, extension);
  expect(collection).not.toBeNull();
  const p: PendingOperation = {
    format: PENDING_FORMAT,
    format_version: 1,
    campaign_id: config.campaignId,
    run_id: uid,
    command,
    options: command === "collect" ? options : {},
    dispatched_at: 1,
    state: "DISPATCHED",
    blocker: null,
    identity: null,
    collection,
  };
  expect(writePending(config, p)).toBe(true);
  return p;
}
async function inspect(
  dirs: { campaignDir: string; operatorDir: string },
  act = "operator-act-c1",
) {
  const s = await openSession(dirs);
  try {
    const a = new PcCollectionAdapter(s.campaign.store);
    const object = TemporalObjectSchema.safeParse(
      s.campaign.store.getFact(
        temporalObjectKey(productionExtractionObjectId(pcCollectionRequestId(PC, act))),
      )?.value,
    );
    return {
      facts: new Map(s.campaign.store.listFacts().map((f) => [f.key, JSON.stringify(f)])),
      time: s.campaign.store.getFact(TEMPORAL_STATE_KEY),
      source: s.campaign.store.getFact(worldSourceConditionKey(W, SRC_SOURCE_KEY)),
      reserve: s.campaign.store.getFact(productionReserveKey(SRC_RESERVE)),
      sourceAmount: sourceRemaining(s),
      reserveAmount: reserveAmount(s),
      choices: s.ledger.intents(),
      intent: s.ledger.collections().find((i) => i.choice.act_id === act),
      reach: a.reach(PC, act),
      occupancy: a.occupancy(PC),
      extraction: a.extraction(PC, act),
      work: a.work(PC, act),
      object: object.success ? object.data : undefined,
      hold: a.hold(PC),
      lapse: a.lapseRecord(PC, act),
      termination: a.termination(PC, act),
    };
  } finally {
    await s.close();
  }
}
async function committed(dirs: { campaignDir: string; operatorDir: string }) {
  const s = await openSession(dirs);
  try {
    expect(
      (await collect(ctxOf(s, scriptedTerminal("confirm"), fixedIds("c1")), input)).status,
    ).toBe("COLLECTION_COMMITTED");
  } finally {
    await s.close();
  }
}
async function continued(dirs: { campaignDir: string; operatorDir: string }) {
  const s = await openSession(dirs);
  try {
    return await collectContinue({
      ...ctxOf(s, scriptedTerminal()),
      reachHost: async (t) => hostAnswer(t, "OPEN", "NOT_AT_ISSUE"),
    });
  } finally {
    await s.close();
  }
}
async function recovery(config: PhoneConfig, p: PendingOperation) {
  const terminal = scriptedTerminal(); // any unexpected human choice fails the test
  const lines: string[] = [];
  const code = await runCollectionOperation(
    config,
    p,
    { terminal, out: (l) => lines.push(l) },
    true,
    extension,
  );
  expect(terminal.asked()).toBe(0);
  return { code, lines: lines.join("\n") };
}

describe("original collection recovery identities, through real isolated owners", () => {
  it("a confirmed collection's lost reply survives a server restart, reconciles its reserved identity once, and admits the next choice", async () => {
    const { dirs, config } = await fixture();
    const before = await inspect(dirs);
    let lose = true;
    const deps = {
      pollMs: 100,
      chat: { settleMs: 20 },
      recovery: {
        captureCollection: (c: PhoneConfig, uid: string) => captureCollection(c, uid, extension),
        runCollection: async (...args: Parameters<typeof runCollectionOperation>) => {
          const code = await runCollectionOperation(args[0], args[1], args[2], args[3], extension);
          if (lose && !args[3] && args[1].command === "collect") {
            lose = false;
            throw new Error("reply lost after real commit");
          }
          return code;
        },
      },
    };
    let app = createPhoneServer(config, deps);
    await app.listen();
    try {
      const chat = new Chat(`http://127.0.0.1:${config.port}`);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({ elicitation: {} });
      expect((await chat.call("collect", { amount: 3 })).isError).toBe(false);
      const lost = await chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
      expect(lost.data.outcome).toBe("UNCERTAIN");
      const saved = readPending(config);
      expect(saved.kind).toBe("PENDING");
      if (saved.kind !== "PENDING") throw new Error("missing pending operation");
      const act = `operator-act-${saved.pending.collection!.uid}`;
      const landed = await inspect(dirs, act);
      expect(landed.intent?.intent_id).toBe(`operator-intent:${saved.pending.run_id}`);
      expect(landed.intent?.choice.quantity).toEqual(input.quantity);
      expect(landed.time).toEqual(before.time);
      expect(landed.source).toEqual(before.source);
      expect(landed.reserve).toEqual(before.reserve);
      await app.close();
      app = createPhoneServer(config, deps);
      await app.listen();
      await chat.init({ elicitation: {} });
      for (const name of [
        "collect",
        "continue_collection",
        "finish_collection",
        "cease_collection",
        "settle_collection_lapse",
        "observe_surroundings",
      ])
        expect((await chat.call(name, name === "collect" ? { amount: 4 } : {})).isError, name).toBe(
          true,
        );
      await chat.call("reconcile_last_action");
      const done = await chat.call("await_action", { wait_seconds: 5 });
      expect(done.data.outcome).toBeUndefined();
      expect(done.data.exit_code).toBe(0);
      expect((await inspect(dirs, act)).facts).toEqual(landed.facts);
      expect(readPending(config).kind).toBe("NONE");
      // A genuinely new proposal is admitted; its separate confirmation may be declined.
      expect((await chat.call("collect", { amount: 4 })).isError).toBe(false);
      await chat.call("cancel_action");
    } finally {
      await app.close();
    }
  }, 240_000);

  it("a real partial continuation is completed at the original task and act; generic reconcile proves nothing; time/source/Reserve and all original records survive", async () => {
    const { dirs, config } = await fixture();
    await committed(dirs);
    const p = await pending(config, "collect-continue");
    expect(p.collection?.task_ids).toHaveLength(5);
    const before = await inspect(dirs);
    const fault = vi
      .spyOn(PcCollectionAdapter.prototype, "registerOccupancy")
      .mockResolvedValue({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost" } });
    expect((await continued(dirs)).status).toBe("COLLECTION_OUTCOME_UNKNOWN");
    fault.mockRestore();
    const partial = await inspect(dirs);
    expect(partial.reach?.value.verdict).toBe("REACHABLE");
    expect(partial.extraction).toBeUndefined();
    const s = await openSession(dirs);
    expect((await reconcile(ctxOf(s, scriptedTerminal()))).map((r) => r.status)).toEqual([
      "NOTHING_TO_RECONCILE",
    ]);
    await s.close();
    expect((await inspect(dirs)).facts).toEqual(partial.facts);
    const read = readPending(config);
    if (read.kind !== "PENDING") throw new Error("restart lost identity");
    expect((await recovery(config, read.pending)).code).toBe(0);
    const complete = await inspect(dirs);
    expect(complete.reach).toEqual(partial.reach);
    expect(complete.occupancy?.value.act_id).toBe("operator-act-c1");
    expect(complete.extraction?.value.quantity).toEqual(input.quantity);
    expect(complete.work).toBeDefined();
    expect(complete.object?.next_boundary).not.toBeNull();
    expect(complete.hold.state).toBe("IN_FLIGHT");
    expect(complete.time).toEqual(before.time);
    expect(complete.source).toEqual(before.source);
    expect(complete.reserve).toEqual(before.reserve);
    for (const [k, v] of partial.facts) expect(complete.facts.get(k), k).toBe(v);
    expect((await recovery(config, p)).code).toBe(0);
    expect((await inspect(dirs)).facts).toEqual(complete.facts);
  }, 240_000);

  it("a newer legitimate collection cannot substitute for the original uncertain continuation", async () => {
    const { dirs, config } = await fixture();
    await committed(dirs);
    const p = await pending(config, "collect-continue");
    const fault = vi
      .spyOn(PcCollectionAdapter.prototype, "registerOccupancy")
      .mockResolvedValue({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost" } });
    await continued(dirs);
    fault.mockRestore();
    const s = await openSession(dirs);
    expect(
      (
        await collect(ctxOf(s, scriptedTerminal("confirm"), fixedIds("c2")), {
          ...input,
          quantity: { amount: 4, unit: SRC_UNIT },
        })
      ).status,
    ).toBe("COLLECTION_COMMITTED");
    await s.close();
    const before = await inspect(dirs);
    const rejected = await recovery(config, p);
    expect(rejected.code).toBe(4);
    expect(rejected.lines).toContain("no longer match the original operation");
    expect((await inspect(dirs)).facts).toEqual(before.facts);
    // The old dynamic replay really would operate on c2; this is a concrete regression witness, not a fake COMMITTED status.
    expect((await continued(dirs)).status).toBe("COLLECTION_COMMITTED");
    expect((await inspect(dirs, "operator-act-c2")).occupancy?.value.act_id).toBe(
      "operator-act-c2",
    );
    expect((await inspect(dirs)).extraction).toBeUndefined();
  }, 240_000);

  it("an extraction is not proof of Temporal registration: recovery finishes the missing owner write, once", async () => {
    const { dirs, config } = await fixture();
    await committed(dirs);
    const p = await pending(config, "collect-continue");
    const fault = vi.spyOn(TemporalCoordinator.prototype, "registerObject").mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN_OUTCOME", message: "lost registration" },
    });
    expect((await continued(dirs)).status).toBe("COLLECTION_OUTCOME_UNKNOWN");
    const partial = await inspect(dirs);
    expect(partial.extraction?.value.quantity).toEqual(input.quantity);
    expect(partial.work).toBeDefined();
    expect(partial.object).toBeUndefined();
    // Still blocked while the actual registration cannot be made; a prospective object would falsely clear this.
    expect((await recovery(config, p)).code).toBe(4);
    expect((await inspect(dirs)).facts).toEqual(partial.facts);
    fault.mockRestore();
    expect((await recovery(config, p)).code).toBe(0);
    const complete = await inspect(dirs);
    expect(complete.object?.next_boundary?.at).toEqual(
      partial.extraction?.value.timing.boundary.at,
    );
    for (const [k, v] of partial.facts) expect(complete.facts.get(k), k).toBe(v);
    expect((await recovery(config, p)).code).toBe(0);
    expect((await inspect(dirs)).facts).toEqual(complete.facts);
  }, 240_000);

  it("a finish whose canonical transaction landed but ledger reply was lost settles its original target without advancing or crediting again", async () => {
    const { dirs, config } = await fixture();
    await committed(dirs);
    await continued(dirs);
    const before = await inspect(dirs);
    const p = await pending(config, "collect-finish");
    expect(p.collection?.target).toEqual({ unit: T0.unit, value: T0.value + 3 * TAU });
    const fault = vi.spyOn(IntentLedger.prototype, "markCommitted").mockResolvedValue({
      ok: false,
      error: { code: "LEDGER_UNREADABLE", message: "lost ledger write" },
    });
    const terminal = scriptedTerminal("confirm");
    expect(await runCollectionOperation(config, p, { terminal }, false, extension)).toBe(4);
    expect(terminal.asked()).toBe(1);
    fault.mockRestore();
    const landed = await inspect(dirs);
    expect(landed.choices.find((i) => i.intent_id === "operator-intent:original")?.status).toBe(
      "CONFIRMED",
    );
    expect(landed.sourceAmount).toBe(before.sourceAmount! - 3);
    expect(landed.reserveAmount).toBe(before.reserveAmount! + 3);
    expect(landed.source?.version).toBe(before.source!.version + 1);
    expect(landed.reserve?.version).toBe(before.reserve!.version + 1);
    expect((await recovery(config, p)).code).toBe(0);
    const complete = await inspect(dirs);
    expect(complete.facts).toEqual(landed.facts);
    expect(complete.choices.find((i) => i.intent_id === "operator-intent:original")).toMatchObject({
      kind: "PC_TARGET_ADVANCE",
      target: p.collection!.target,
      status: "COMMITTED",
    });
    expect((await recovery(config, p)).code).toBe(0);
    expect((await inspect(dirs)).facts).toEqual(complete.facts);
  }, 240_000);

  it("an ordinary UNAVAILABLE after earlier owner writes stays uncertain until the original operation is complete", async () => {
    const { dirs, config } = await fixture();
    await committed(dirs);
    const fault = vi.spyOn(PcCollectionAdapter.prototype, "registerOccupancy").mockResolvedValue({
      ok: false,
      error: { code: "PREREQUISITE_MISSING", message: "registration refused" },
    });
    expect((await continued(dirs)).status).toBe("UNAVAILABLE");
    const partial = await inspect(dirs);
    expect(partial.reach).toBeDefined();
    expect(partial.extraction).toBeUndefined();
    expect(partial.object).toBeUndefined();
    const p = await pending(config, "collect-continue");
    const lines: string[] = [];
    expect(
      await runCollectionOperation(
        config,
        p,
        {
          terminal: scriptedTerminal(),
          out: (l) => lines.push(l),
        },
        false,
        extension,
      ),
    ).toBe(4);
    expect(lines).toContain("STATUS UNAVAILABLE");
    expect((await inspect(dirs)).facts).toEqual(partial.facts);
    fault.mockRestore();
    expect((await recovery(config, p)).code).toBe(0);
    const complete = await inspect(dirs);
    expect(complete.object).toBeDefined();
    expect(complete.reach).toEqual(partial.reach);
    expect(complete.extraction).toBeDefined();
    expect(complete.source).toEqual(partial.source);
    expect(complete.reserve).toEqual(partial.reserve);
    expect((await recovery(config, p)).code).toBe(0);
    expect((await inspect(dirs)).facts).toEqual(complete.facts);
  }, 240_000);

  it("a ledger failure classified UNAVAILABLE by the operator remains UNKNOWN at the adapter; a changed dispatch context starts nothing", async () => {
    const { dirs, config } = await fixture();
    const p = await pending(config, "collect");
    const before = await inspect(dirs);
    const fault = vi.spyOn(IntentLedger.prototype, "record").mockResolvedValue({
      ok: false,
      error: { code: "LEDGER_UNREADABLE", message: "lost write" },
    });
    const lines: string[] = [];
    expect(
      await runCollectionOperation(
        config,
        p,
        { terminal: scriptedTerminal("confirm"), out: (l) => lines.push(l) },
        false,
        extension,
      ),
    ).toBe(4);
    expect(lines).toContain("STATUS UNAVAILABLE");
    fault.mockRestore();
    expect((await recovery(config, p)).code).toBe(0); // owner-verified absence, not the status string
    expect((await inspect(dirs)).facts).toEqual(before.facts);
    await committed(dirs); // a different legitimate action after the captured snapshot
    const changed = await inspect(dirs);
    const terminal = scriptedTerminal();
    expect(await runCollectionOperation(config, p, { terminal }, false, extension)).toBe(4);
    expect(terminal.asked()).toBe(0);
    expect((await inspect(dirs)).facts).toEqual(changed.facts);
  }, 240_000);

  it("a no-write continuation and a missing old identity remain distinguishable from unavailable evidence", async () => {
    const { dirs, config } = await fixture();
    await committed(dirs);
    const p = await pending(config, "collect-continue");
    const before = await inspect(dirs);
    expect((await recovery(config, p)).lines).toContain("without a committed effect");
    expect((await inspect(dirs)).facts).toEqual(before.facts);
    expect((await recovery(config, { ...p, collection: null })).code).toBe(4);
    expect((await recovery({ ...config, campaignId: "another-campaign" }, p)).code).toBe(4);
    expect((await inspect(dirs)).facts).toEqual(before.facts);
  }, 240_000);

  it("a partial cessation is completed without a second choice or time/material movement", async () => {
    const { dirs, config } = await fixture();
    await committed(dirs);
    await continued(dirs);
    const before = await inspect(dirs);
    const p = await pending(config, "cease");
    const fault = vi
      .spyOn(PcCollectionAdapter.prototype, "releaseOccupancyTerminated")
      .mockResolvedValue({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost" } });
    const terminal = scriptedTerminal("confirm");
    expect(await runCollectionOperation(config, p, { terminal }, false, extension)).toBe(4);
    expect(terminal.asked()).toBe(1);
    fault.mockRestore();
    expect((await recovery(config, p)).code).toBe(0);
    const after = await inspect(dirs);
    expect(after.termination).toBeDefined();
    expect(after.object?.next_boundary).toBeNull();
    expect(after.hold.state).toBe("NONE");
    expect(after.time).toEqual(before.time);
    expect(after.source).toEqual(before.source);
    expect(after.reserve).toEqual(before.reserve);
    expect((await recovery(config, p)).code).toBe(0);
    expect((await inspect(dirs)).facts).toEqual(after.facts);
  }, 240_000);

  it("a partial lapse settles only its captured held lineage, without resuming or consuming its held time request", async () => {
    const { dirs, config } = await fixture();
    await committed(dirs);
    await continued(dirs);
    const s = await openSession(dirs);
    await addLedger(
      s as never,
      "ledger-arrivals",
      [resident("unit-arrival", FIXTURE_LOCUS_ID)],
      953,
    );
    await advanceTo(s as never, T0.value + 4 * TAU, "tx-held");
    await s.close();
    const p = await pending(config, "settle-collection-lapse");
    expect(p.collection?.held).toEqual([{ pcId: PC, actId: "operator-act-c1" }]);
    const before = await inspect(dirs);
    const fault = vi
      .spyOn(PcCollectionAdapter.prototype, "releaseOccupancyLapsed")
      .mockResolvedValue({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost" } });
    expect(
      await runCollectionOperation(config, p, { terminal: scriptedTerminal() }, false, extension),
    ).toBe(4);
    fault.mockRestore();
    expect((await recovery(config, p)).code).toBe(0);
    const after = await inspect(dirs);
    expect(after.lapse?.value.pc_id).toBe(PC);
    expect(after.object?.next_boundary).toBeNull();
    expect(after.hold.state).toBe("NONE");
    expect(after.time).toEqual(before.time);
    expect(after.source).toEqual(before.source);
    expect(after.reserve).toEqual(before.reserve);
    expect((await recovery(config, p)).code).toBe(0);
    expect((await inspect(dirs)).facts).toEqual(after.facts);
  }, 240_000);
});
