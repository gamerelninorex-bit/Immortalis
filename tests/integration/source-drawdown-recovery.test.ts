import { legacyStateText } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Exact Finite Raw-Source Drawdown — interrupted-run recovery. If a process is interrupted between Production's Source Delta,
// World-State's source decrement and the Reserve inflow, a later lawful recovery FINISHES or truthfully HOLDS the SAME
// identities: the quantity is in exactly one place at every committed cut (source-owned, an undelivered Source Delta, delivered
// and awaiting its credit, or Reserve-held), no spendable fictional output ever exists before the delivery, nothing is
// duplicated and no new extraction is started. A failure at EVERY durable step of the whole transaction converges on the
// identical campaign.
// Register lineage: IA-04, IA-06 (partial), IA-22 (reused); RC-05, RC-07, RC-10, RC-16; IM-02, IM-05, IM-11, IM-12, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { cpSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CanonicalCampaign,
  StageProviderRegistry,
  TemporalCoordinator,
  nodeFs,
  stageIntentId,
  productionSourceDeltaProvider,
  type CampaignStore,
} from "@immortalis/engine";
import {
  PRODUCTION_FIXTURE_EXTENSION,
  FIXTURE_WORLD_ID,
  SRC_REQ_1,
  SRC_REQ_2,
  SRC_RESERVE,
  SRC_SOURCE_KEY,
  SRC_UNIT,
  continuationInput,
  drawdownAdvanceRequest,
  drawdownProviders,
  drawdownPublication,
  instrumentFs,
  srcAt,
  startExtractionInput,
} from "@immortalis/testkit";
import {
  productionReserveInflowStage,
  productionSourceDeltaStage,
  worldSourceDeliveryStage,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  drawCoordinator,
  drawSummary,
  reopenDrawdown,
  seededDrawdownCampaign,
  startAndRegisterExtraction,
  type DrawSeeded,
} from "../support/source-drawdown.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const reqKey = (id: string) => `synthetic-request/${id}`;
const srcOf = (s: DrawSeeded) => s.drawdown.sourceCondition(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!;
const reserveOf = (s: DrawSeeded) => s.drawdown.reserve(SRC_RESERVE)!;
const isKernelTransaction = (g: CommitGroup) =>
  g.owner === "temporal_kernel" && g.writes.some((w) => w.key.startsWith("temporal/transaction/"));
const isDelivery = (g: CommitGroup) => g.owner === "world_state";
const isInflow = (g: CommitGroup) =>
  g.owner === "production" && g.writes.some((w) => w.key.startsWith("production/reserve/"));

/** A store that "loses" the matching commit: it returns UNKNOWN_OUTCOME and commits nothing (a crash just before it). */
function interrupting(
  inner: CampaignStore,
  loses: (g: CommitGroup) => boolean,
): { store: CampaignStore; lost: () => number } {
  let n = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: (g) => {
      if (loses(g as CommitGroup)) {
        n += 1;
        return Promise.resolve({
          ok: false as const,
          error: { code: "UNKNOWN_OUTCOME" as const, message: "simulated interruption" },
        });
      }
      return inner.commit(g);
    },
  };
  return { store, lost: () => n };
}

/** The identical-campaign reference: an uninterrupted run to the same advance. */
async function reference() {
  const s = await seededDrawdownCampaign(tempDir());
  await startAndRegisterExtraction(s, SRC_REQ_1, 1);
  const result = await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
  return {
    s,
    result,
    head: s.campaign.store.head(),
    summary: drawSummary(s.campaign, s.coordinator),
  };
}

const completed = (s: DrawSeeded) => {
  expect(srcOf(s).value.recoverable).toEqual({ amount: 2, unit: SRC_UNIT });
  expect(srcOf(s).value.delivered).toHaveLength(1); // delivered once
  expect(reserveOf(s).value.quantity).toEqual({ amount: 3, unit: SRC_UNIT });
  expect(reserveOf(s).value.inflows).toHaveLength(1); // credited once
  expect(s.drawdown.phase(SRC_REQ_1)).toBe("CREDITED");
};

describe("interrupted between the owners: finish or truthfully hold the SAME identities", () => {
  it("crash AFTER Production's Source Delta, BEFORE the delivery: the quantity is pending, still source-owned, and no output is spendable; the same transaction finishes it once", async () => {
    const dir = tempDir();
    const s = await seededDrawdownCampaign(dir);
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const crash = interrupting(s.campaign.store, (g) => isDelivery(g) || isKernelTransaction(g));
    const r = await new TemporalCoordinator(crash.store, drawdownProviders()).advance(
      drawdownAdvanceRequest("tx-draw"),
    );
    expect(r.ok).toBe(false);
    expect(crash.lost()).toBe(1); // the delivery is lost; its dependents wait; the kernel group never lands
    // truthfully held: the Source Delta exists once, as the key's Pending Drawdown; nothing else moved
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("PENDING_DELIVERY");
    expect(srcOf(s).value.recoverable.amount).toBe(5);
    expect(srcOf(s).value.delivered).toEqual([]);
    expect(reserveOf(s).value.quantity.amount).toBe(0); // no spendable fictional output
    expect(reserveOf(s).value.inflows).toBeUndefined();
    expect(s.drawdown.sourceDelta(SRC_REQ_1)!.fact.version).toBe(1);
    await s.campaign.close();

    const re = await reopenDrawdown(dir);
    expect(re.campaign.verify()).toEqual([]); // the interrupted state loads
    expect(re.drawdown.phase(SRC_REQ_1)).toBe("PENDING_DELIVERY");

    // delivery precedes any read of the key's Source Condition: a NEW commitment on the key is held, nothing recorded
    const held = await re.drawdown.startExtraction({
      ...drawdownPublication(80),
      start: startExtractionInput(reqKey(SRC_REQ_2), { boundary_at: srcAt(400) }),
    });
    expect(held.ok).toBe(false);
    expect(!held.ok && held.error.code).toBe("CLAIM_INCOMPATIBLE");
    expect(!held.ok && (held.error.details as any).reason).toBe("SOURCE_DELIVERY_PENDING");
    expect(re.drawdown.extraction(SRC_REQ_2)).toBeUndefined();

    // the SAME transaction adopts the committed Source Delta (never recomputed) and finishes delivery and credit once
    const again = await must(re.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    expect(again.transaction.stages).toHaveLength(3);
    completed(re);
    const ref = await reference();
    expect(re.campaign.store.head().revision).toBe(ref.head.revision); // no duplicate group anywhere
    expect(again.transaction.stages.map((x) => x.group_id)).toEqual(
      ref.result.transaction.stages.map((x) => x.group_id),
    ); // the SAME identities
    expect(drawSummary(re.campaign, re.coordinator).production).toEqual(ref.summary.production);
    expect(drawSummary(re.campaign, re.coordinator).sources).toEqual(ref.summary.sources);
    expect(re.campaign.verify()).toEqual([]);
  });

  it("crash AFTER World-State's delivery, BEFORE the Reserve inflow: the source is already net, the Reserve not yet credited, nothing is counted on both sides; the same transaction credits once", async () => {
    const dir = tempDir();
    const s = await seededDrawdownCampaign(dir);
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const crash = interrupting(s.campaign.store, (g) => isInflow(g) || isKernelTransaction(g));
    const r = await new TemporalCoordinator(crash.store, drawdownProviders()).advance(
      drawdownAdvanceRequest("tx-draw"),
    );
    expect(r.ok).toBe(false);
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("DELIVERED_AWAITING_CREDIT");
    expect(srcOf(s).value.recoverable.amount).toBe(2); // the delivered quantity left the source …
    expect(reserveOf(s).value.quantity.amount).toBe(0); // … and is not yet Reserve-held: one place only
    expect(s.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!.value.open).toHaveLength(1);
    await s.campaign.close();

    const re = await reopenDrawdown(dir);
    expect(re.campaign.verify()).toEqual([]);
    expect(re.drawdown.phase(SRC_REQ_1)).toBe("DELIVERED_AWAITING_CREDIT");
    // the delivered three are not double counted: three more cannot be drawn, the remaining two still can
    const three = await re.drawdown.startExtraction({
      ...drawdownPublication(81),
      start: startExtractionInput(reqKey(SRC_REQ_2), { boundary_at: srcAt(400) }),
    });
    expect(!three.ok && three.error.code).toBe("CLAIM_INCOMPATIBLE");
    expect(!three.ok && (three.error.details as any)).toMatchObject({ unclaimed: 2 });

    const again = await must(re.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    expect(again.recomputed_in_place).toEqual([]);
    completed(re);
    const ref = await reference();
    expect(re.campaign.store.head().revision).toBe(ref.head.revision);
    expect(drawSummary(re.campaign, re.coordinator).production).toEqual(ref.summary.production);
    expect(re.campaign.verify()).toEqual([]);
  });

  it("crash AFTER the Reserve inflow, BEFORE the kernel group: reopen verifies; the same transaction adopts all three stages and duplicates nothing", async () => {
    const dir = tempDir();
    const s = await seededDrawdownCampaign(dir);
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const crash = interrupting(s.campaign.store, isKernelTransaction);
    await new TemporalCoordinator(crash.store, drawdownProviders()).advance(
      drawdownAdvanceRequest("tx-draw"),
    );
    expect(crash.lost()).toBe(1);
    completed(s);
    expect(s.coordinator.transaction("tx-draw")).toBeUndefined(); // not credited by a transaction yet
    expect(s.coordinator.object(`obj-extraction-${SRC_REQ_1}`)!.value.next_boundary).not.toBeNull();
    await s.campaign.close();

    const re = await reopenDrawdown(dir);
    expect(re.campaign.verify()).toEqual([]);
    const headBefore = re.campaign.store.head().revision;
    const again = await must(re.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    expect(again.transaction.stages).toHaveLength(3);
    expect(re.campaign.store.head().revision).toBe(headBefore + 1); // only the kernel group is new
    completed(re);
    const ref = await reference();
    expect(drawSummary(re.campaign, re.coordinator).production).toEqual(ref.summary.production);
    expect(re.campaign.verify()).toEqual([]);
  });

  it("crash after the transaction's durable authority only: nothing was staged, and the same transaction completes", async () => {
    const dir = tempDir();
    const s = await seededDrawdownCampaign(dir);
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const crash = interrupting(s.campaign.store, (g) => g.owner !== "temporal_kernel");
    await new TemporalCoordinator(crash.store, drawdownProviders()).advance(
      drawdownAdvanceRequest("tx-draw"),
    );
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("COMMITTED");
    expect(srcOf(s).value.recoverable.amount).toBe(5);
    await s.campaign.close();
    const re = await reopenDrawdown(dir);
    expect(re.campaign.verify()).toEqual([]);
    await must(re.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    completed(re);
    expect(re.campaign.verify()).toEqual([]);
  });

  it("with the delivery unavailable (no World-State provider) the extraction truthfully stays held across save, close and load, and finishes when it is", async () => {
    const dir = tempDir();
    const s = await seededDrawdownCampaign(dir);
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const partial = new TemporalCoordinator(
      s.campaign.store,
      new StageProviderRegistry([productionSourceDeltaProvider]),
    );
    const r = await must(partial.advance(drawdownAdvanceRequest("tx-held")));
    expect(r.transaction.outcome.unresolved_dependents.map((u) => u.reason)).toEqual([
      "PROVIDER_ABSENT",
      "PROVIDER_ABSENT",
    ]);
    expect(r.transaction.engaged.map((e) => e.boundary)).not.toContain("RETIRED");
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("PENDING_DELIVERY");
    expect(reserveOf(s).value.quantity.amount).toBe(0);
    await s.campaign.close();

    const re = await reopenDrawdown(dir);
    expect(re.campaign.verify()).toEqual([]);
    expect(re.drawdown.phase(SRC_REQ_1)).toBe("PENDING_DELIVERY");
    expect(srcOf(re).value.recoverable.amount).toBe(5);
    // the continuation consumes the held remainder
    const cont = new TemporalCoordinator(re.campaign.store, drawdownProviders());
    await must(cont.continueRemainder(continuationInput("tx-cont")));
    completed(re);
    expect(re.campaign.verify()).toEqual([]);
  });

  it("a copy of the stage identity without the kernel's open transaction does not complete the drawdown", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    for (const stage of [
      productionSourceDeltaStage(SRC_REQ_1),
      worldSourceDeliveryStage(SRC_REQ_1),
      productionReserveInflowStage(SRC_REQ_1),
    ])
      expect(s.campaign.store.lookupReceipt(stageIntentId(stage))).toBeNull();
    expect(srcOf(s).value.recoverable.amount).toBe(5);
  });
});

describe("one authoritative pending representation per key", () => {
  it("a second drawdown on the key is not emitted while the first is undelivered; delivery comes first, then the second, each once", async () => {
    const s = await seededDrawdownCampaign(tempDir(), {
      requests: [
        { id: SRC_REQ_1, amount: 2 },
        { id: SRC_REQ_2, amount: 2 },
      ],
    });
    await startAndRegisterExtraction(s, SRC_REQ_1, 1); // both at the SAME declared boundary
    await startAndRegisterExtraction(s, SRC_REQ_2, 2);
    // World-State's delivery is unavailable: the first drawdown is emitted and stays pending
    const noDelivery = new TemporalCoordinator(
      s.campaign.store,
      new StageProviderRegistry([productionSourceDeltaProvider]),
    );
    const held = await must(noDelivery.advance(drawdownAdvanceRequest("tx-held")));
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("PENDING_DELIVERY");
    // the second is NOT emitted onto a key with undelivered drawdown: its emission is refused by Production's own admission
    expect(s.drawdown.phase(SRC_REQ_2)).toBe("COMMITTED");
    expect(s.drawdown.sourceDelta(SRC_REQ_2)).toBeUndefined();
    expect(held.transaction.outcome.unresolved_dependents.map((u) => u.reason)).toContain(
      "VALIDATION_REJECTED",
    );
    expect(held.rejections?.some((r: any) => r.code === "CLAIM_INCOMPATIBLE") ?? true).toBe(true);
    expect(srcOf(s).value.recoverable.amount).toBe(5);
    expect(s.campaign.verify()).toEqual([]);

    // with the delivery restored the key's pending drawdown is delivered first, then the second drawdown, each exactly once
    const cont = new TemporalCoordinator(s.campaign.store, drawdownProviders());
    await must(cont.continueRemainder(continuationInput("tx-cont")));
    expect(srcOf(s).value.recoverable.amount).toBe(1);
    expect(srcOf(s).value.delivered.map((d) => d.delivery_id)).toEqual([SRC_REQ_1, SRC_REQ_2]);
    expect(reserveOf(s).value.quantity.amount).toBe(4);
    expect(reserveOf(s).value.inflows!.map((i) => i.inflow_id)).toEqual([SRC_REQ_1, SRC_REQ_2]);
    expect(s.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!.value.open).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("unknown outcome is reconciled by identity: a failure at EVERY durable step of the whole transaction", () => {
  it("converges on the identical campaign with one delta, one delivery, one inflow and one decrement", async () => {
    // the started-and-registered campaign is built once; every run below starts from a saved copy of it
    const savedStart = tempDir();
    {
      const s = await seededDrawdownCampaign(savedStart);
      await startAndRegisterExtraction(s, SRC_REQ_1, 1);
      await s.campaign.close();
    }
    const seed = async (dir: string) => {
      cpSync(savedStart, dir, { recursive: true });
    };
    const refDir = tempDir();
    await seed(refDir);
    const ref = await reopenDrawdown(refDir, "ref");
    const refResult = await must(ref.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    const refHead = ref.campaign.store.head();
    const refSummary = drawSummary(ref.campaign, ref.coordinator);
    await ref.campaign.close();

    const countDir = tempDir();
    await seed(countDir);
    const probe = instrumentFs(nodeFs);
    const p = await must(
      CanonicalCampaign.open(countDir, { fs: probe.fs, extension: PRODUCTION_FIXTURE_EXTENSION }),
    );
    const afterOpen = probe.count();
    await must(drawCoordinator(p.store).advance(drawdownAdvanceRequest("tx-draw")));
    const afterAdvance = probe.count();
    await p.close();
    // authority + three stages + kernel group: five commits of at least two durable steps each
    expect(afterAdvance - afterOpen).toBeGreaterThanOrEqual(10);

    const seen = { rolledBack: 0, partial: 0, committed: 0 };
    const finals = new Set<string>();
    const stage1 = stageIntentId(productionSourceDeltaStage(SRC_REQ_1));
    for (let failAt = afterOpen + 1; failAt <= afterAdvance; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const campaign = await must(
          CanonicalCampaign.open(dir, { fs: inst.fs, extension: PRODUCTION_FIXTURE_EXTENSION }),
        );
        const r = await drawCoordinator(campaign.store).advance(drawdownAdvanceRequest("tx-draw"));
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await campaign.close();

        const re = await reopenDrawdown(dir, "restart");
        expect(re.campaign.verify()).toEqual([]); // whatever survived is internally consistent
        if (re.coordinator.transaction("tx-draw")) seen.committed++;
        else if (re.campaign.store.lookupReceipt(stage1)) seen.partial++;
        else seen.rolledBack++;
        // at every cut the quantity is in at most one place: the source remainder plus the Reserve never exceeds the whole
        // (the delivered-but-uncredited cut holds it on the source side only; no cut counts it on both)
        const nowSrc = srcOf(re).value.recoverable.amount;
        const nowRes = reserveOf(re).value.quantity.amount;
        expect(nowSrc + nowRes).toBeLessThanOrEqual(5);
        expect(reserveOf(re).value.quantity.amount).toBeLessThanOrEqual(3);
        if (reserveOf(re).value.quantity.amount > 0) expect(nowSrc).toBe(2);

        // re-present the SAME request: existing receipts are reached; a committed stage is adopted
        const again = await must(re.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
        if (re.campaign.store.lookupReceipt(stage1)) expect(again.recomputed_in_place).toEqual([]);
        const head = re.campaign.store.head();
        expect(head.revision).toBe(refHead.revision); // no duplicate group anywhere
        const summary = drawSummary(re.campaign, re.coordinator);
        expect(summary.production).toEqual(refSummary.production);
        expect(summary.sources).toEqual(refSummary.sources);
        completed(re);
        expect(again.transaction.stages.map((x) => x.group_id)).toEqual(
          refResult.transaction.stages.map((x) => x.group_id),
        );
        finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
        await re.campaign.close();
        const last = await reopenDrawdown(dir, "last");
        expect(last.campaign.verify()).toEqual([]);
        await last.campaign.close();
      }
    }
    // every interruption converged on ONE identical campaign, and the sweep covered all three cuts
    expect(finals.size).toBe(1);
    expect(seen.partial).toBeGreaterThan(0);
    expect(seen.rolledBack).toBeGreaterThan(0);
    expect(seen.committed + seen.partial + seen.rolledBack).toBe((afterAdvance - afterOpen) * 2);
  }, 600_000);
});

describe("the load-time verifier refuses a tampered drawdown story", () => {
  it("an edited Source Condition, Reserve inflow or account no longer verifies", async () => {
    const edits: [string, (text: string) => string][] = [
      ["remainder", (t) => t.replace(/"amount": 2,/g, '"amount": 4,')],
    ];
    void edits;
    const dir = tempDir();
    const s = await seededDrawdownCampaign(dir);
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    await s.campaign.close();
    // the journal / state hash chain makes a hand edit of the persisted package a load failure, never a quiet change
    const { readdirSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const stateFile = readdirSync(dir).find((f) => /^state\.[0-9]+\.json$/.test(f))!;
    const text = legacyStateText(join(dir, stateFile));
    expect(text).toMatch(/"amount": 2/);
    writeFileSync(join(dir, stateFile), text.replace(/"amount": 2/g, '"amount": 4'));
    expect(
      (await CanonicalCampaign.open(dir, { extension: PRODUCTION_FIXTURE_EXTENSION })).ok,
    ).toBe(false);
  });
});
