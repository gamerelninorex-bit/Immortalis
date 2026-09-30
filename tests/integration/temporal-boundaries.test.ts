// Turnless Temporal Foundation — the advance loop over several earned boundaries, and the edges of the
// target/stop/remainder semantics. Still exact-partition, still deliberately small (brief §4.7).
// Register lineage: IA-04 (partial); RC-05; IM-02.
import { describe, expect, it } from "vitest";
import type { TemporalObject } from "@immortalis/contracts";
import { CanonicalCampaign, TemporalCoordinator } from "@immortalis/engine";
import {
  BOUNDARY_ID,
  FIXTURE_CAMPAIGN,
  SYNTH_EXTENSION,
  OBJECT_ENGAGED,
  PRODUCER_STAGE,
  SYNTH_OP_INDEPENDENT,
  SYNTH_OWNER,
  T0,
  T1,
  TB,
  at,
  continuationInput,
  dormantObject,
  engagedObject,
  stopAtBoundaryRequest,
  syntheticProviders,
} from "@immortalis/testkit";
import { codeOf, must, seededTemporalCampaign, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

/** A second engaged object: one earned boundary at `when`, one independent owner stage. */
const second = (id: string, when: number): TemporalObject =>
  dormantObject({
    object_id: id,
    owning_ref: { owner: SYNTH_OWNER, process_id: `proc-${id}` },
    next_boundary: { boundary_id: `boundary-${id}`, at: at(when) },
    dependencies: [
      {
        stage: {
          causal_process_id: `proc-${id}`,
          owner_operation: { owner: SYNTH_OWNER, operation: SYNTH_OP_INDEPENDENT },
          prospective_result_id: `result-${id}`,
        },
        reads: [],
        produces: [`synthetic/second/${id}`],
        declares_close: null,
      },
    ],
    invalidators: [],
  });
const toTarget = (id: string, target = T1) =>
  stopAtBoundaryRequest(id, { requested: { target, condition: null } });

describe("several earned boundaries in one transaction", () => {
  it("resolves boundaries at distinct instants in causal time order, then carries to the target", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [engagedObject(), second("obj-second", 160)],
    });
    const r = await must(coordinator.advance(toTarget("tx-1")));
    const t = r.transaction;
    expect(t.outcome).toEqual({
      actual_stop: T1,
      stop_reason: "TARGET_REACHED",
      remainder: null,
      unresolved_dependents: [],
    });
    expect(t.boundaries_crossed.map((b) => [b.object_id, b.at.value])).toEqual([
      [OBJECT_ENGAGED, 140],
      ["obj-second", 160],
    ]);
    expect(t.stages.map((s) => s.stage.prospective_result_id)).toEqual([
      "producer-result-1",
      "consumer-result-1",
      "result-obj-second",
    ]);
    // exact span over each object's own last resolved basis: T0 -> 160
    expect(campaign.store.getFact("synthetic/second/obj-second")!.value).toEqual({ elapsed: 60 });
    expect(coordinator.boundaryIndex().entries).toEqual([]);
    expect(coordinator.state()!.value).toEqual({
      canonical_time: T1,
      last_transaction: "tx-1",
      continuation: null,
    });
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("resolves boundaries due at the same instant together, each in its own dependency order", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [engagedObject(), second("obj-second", TB.value)],
    });
    const r = await must(coordinator.advance(toTarget("tx-1")));
    expect(r.transaction.engaged.map((e) => e.object_id).sort()).toEqual([
      OBJECT_ENGAGED,
      "obj-second",
    ]);
    const order = r.transaction.stages.map((s) => s.stage.prospective_result_id);
    expect(order.indexOf("producer-result-1")).toBeLessThan(order.indexOf("consumer-result-1"));
    expect(new Set(order)).toEqual(
      new Set(["producer-result-1", "consumer-result-1", "result-obj-second"]),
    );
    // the tie order among INCOMPARABLE stages is bookkeeping only: it cannot change a result
    expect(campaign.store.getFact("synthetic/second/obj-second")!.value).toEqual({ elapsed: 40 });
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("stops at the requested boundary and leaves a later due boundary untouched; continuing then resolves it", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [engagedObject(), second("obj-second", 160)],
    });
    const spy = spyStore(campaign.store);
    const c = new TemporalCoordinator(spy.store, syntheticProviders());
    const r1 = await must(c.advance(stopAtBoundaryRequest("tx-1")));
    expect(r1.transaction.outcome).toMatchObject({
      actual_stop: TB,
      stop_reason: "CONDITION_SATISFIED",
      remainder: { from: TB, to: T1 },
    });
    // the later boundary was neither read nor resolved: it is still earned, still indexed
    expect(spy.getFacts).not.toContain("temporal/object/obj-second");
    expect(coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual(["obj-second"]);
    expect(campaign.store.getFact("synthetic/second/obj-second")).toBeUndefined();

    const r2 = await must(coordinator.continueRemainder(continuationInput("tx-2")));
    expect(r2.transaction.opening.basis_time).toEqual(TB);
    expect(r2.transaction.boundaries_crossed.map((b) => b.object_id)).toEqual(["obj-second"]);
    expect(r2.transaction.stages).toHaveLength(1);
    expect(r2.transaction.outcome.actual_stop).toEqual(T1);
    // the completed stages are not re-resolved by the continuation
    expect(r2.transaction.stages.map((s) => s.stage)).not.toContainEqual(PRODUCER_STAGE);
    expect(campaign.store.getFact("synthetic/producer/result")!.version).toBe(1);
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("an exact target that coincides with a boundary resolves it and reaches the target with no remainder", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    const r = await must(coordinator.advance(toTarget("tx-1", TB)));
    expect(r.transaction.outcome).toEqual({
      actual_stop: TB,
      stop_reason: "TARGET_REACHED",
      remainder: null,
      unresolved_dependents: [],
    });
    expect(r.transaction.stages).toHaveLength(2);
    expect(coordinator.state()!.value.continuation).toBeNull();
    await campaign.close();
  });
});

describe("target edges: nothing is rewound, nothing is invented", () => {
  it("a target before the boundary resolves nothing: time advances, the earned boundary stays, no stage appears", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    const r = await must(coordinator.advance(toTarget("tx-1", at(120))));
    expect(r.transaction.stages).toEqual([]);
    expect(r.transaction.engaged).toEqual([]);
    expect(r.transaction.outcome).toMatchObject({
      actual_stop: at(120),
      stop_reason: "TARGET_REACHED",
    });
    expect(coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual([OBJECT_ENGAGED]);
    expect(coordinator.object(OBJECT_ENGAGED)!.value.next_boundary).toMatchObject({
      boundary_id: BOUNDARY_ID,
    });
    await campaign.close();
  });

  it("a target equal to the canonical time is a lawful zero-span transaction", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    const r = await must(coordinator.advance(toTarget("tx-1", T0)));
    expect(r.transaction.outcome).toMatchObject({
      actual_stop: T0,
      stop_reason: "TARGET_REACHED",
      remainder: null,
    });
    expect(coordinator.state()!.value.canonical_time).toEqual(T0);
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("refuses a target that precedes the canonical time, a foreign unit, and a continuation that is not the held remainder", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const entries = campaign.store.head().journal_entries;
    expect(await codeOf(coordinator.advance(toTarget("tx-a", at(50))))).toBe("TARGET_BEFORE_BASIS");
    expect(
      await codeOf(coordinator.advance(toTarget("tx-b", { unit: "other-unit", value: 500 }))),
    ).toBe("UNIT_MISMATCH");
    const wrongRemainder = stopAtBoundaryRequest("tx-c", {
      continues: "tx-1",
      requested: { target: at(999), condition: null },
    });
    expect(await codeOf(coordinator.advance(wrongRemainder))).toBe("CONTINUATION_MISMATCH");
    const wrongSource = stopAtBoundaryRequest("tx-d", {
      continues: "tx-none",
      requested: { target: T1, condition: null },
    });
    expect(await codeOf(coordinator.advance(wrongSource))).toBe("CONTINUATION_MISMATCH");
    expect(campaign.store.head().journal_entries).toBe(entries);
    await campaign.close();
  });

  it("there is nothing to continue once the remainder is consumed, and before any advance", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    expect(await codeOf(coordinator.continueRemainder(continuationInput("tx-0")))).toBe(
      "NO_REMAINDER",
    );
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    await must(coordinator.continueRemainder(continuationInput("tx-2")));
    expect(await codeOf(coordinator.continueRemainder(continuationInput("tx-3")))).toBe(
      "NO_REMAINDER",
    );
    await campaign.close();
  });

  it("refuses to advance with no canonical temporal basis", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    const bare = await must(
      CanonicalCampaign.create(tempDir(), {
        campaignId: FIXTURE_CAMPAIGN,
        extension: SYNTH_EXTENSION,
      }),
    );
    const c = new TemporalCoordinator(bare.store, syntheticProviders());
    expect(await codeOf(c.advance(stopAtBoundaryRequest("tx-1")))).toBe("TEMPORAL_STATE_ABSENT");
    await bare.close();
    await campaign.close();
  });

  it("an execution slice in a foreign unit is refused, and invalid requests never reach the store", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    const entries = campaign.store.head().journal_entries;
    expect(
      await codeOf(
        coordinator.advance(stopAtBoundaryRequest("tx-1"), { slices: [{ unit: "x", value: 120 }] }),
      ),
    ).toBe("EXECUTION_INVALID");
    expect(
      await codeOf(coordinator.advance({ ...stopAtBoundaryRequest("tx-2"), retry_count: 1 })),
    ).toBe("INPUT_INVALID");
    expect(await codeOf(coordinator.advance({ transaction_id: "tx-3" }))).toBe("INPUT_INVALID");
    expect(campaign.store.head().journal_entries).toBe(entries);
    await campaign.close();
  });

  it("an owner adapter that throws publishes nothing for its stage and the transaction fails closed", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    const real = syntheticProviders();
    const c = new TemporalCoordinator(campaign.store, {
      find: (owner: string, op: string) => ({
        ...real.find(owner, op)!,
        compute: () => {
          throw new Error("adapter bug");
        },
      }),
    } as never);
    const r = await c.advance(stopAtBoundaryRequest("tx-1"));
    expect(!r.ok && r.error.code).toBe("PROVIDER_FAILED");
    expect(campaign.store.getFact("synthetic/producer/result")).toBeUndefined();
    expect(c.transaction("tx-1")).toBeUndefined();
    await campaign.close();
  });
});
