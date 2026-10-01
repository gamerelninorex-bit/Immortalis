/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and process output */
// Population & Cohort Reconciliation Backbone Foundation — "the canonical campaign can establish an exact
// bounded Population basis, instantiate a sparse Cohort and an externally qualified view, resolve one
// engaged Population reconciliation made due by PCB-01, be saved, closed, loaded, and continue without
// duplicate consumption or recreation."
// Register lineage: IA-01/02/03/04 (partial), IA-06/IA-22/IA-30 (reused/partial); RC-02/03/05/08/12/16;
// IM-02, IM-04, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0).
// CAL-01 stays UNCALIBRATED (EXACT only) and CAL-02 stays OPEN (no labor coefficient). Local success is
// NOT provider/recovery acceptance (IA-07 BLOCKED).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  populationCloseKey,
  populationCohortKey,
  populationLedgerKey,
  temporalObjectKey,
  type ResolutionTransaction,
} from "@immortalis/contracts";
import {
  TemporalCoordinator,
  additiveTotal,
  intersectionCount,
  populationBarrierEvaluator,
  populationCloseStage,
  stageGroupId,
  stageIntentId,
} from "@immortalis/engine";
import {
  COHORT_BURDEN_L,
  COHORT_BURDEN_M,
  COHORT_OTHER,
  COHORT_STATUS_L,
  CRITERION_KEY,
  LEDGER_MAIN,
  LEDGER_OTHER,
  OBJECT_POP_CLOSE_2,
  OBJECT_POP_OTHER,
  POP_TC,
  POP_TC2,
  POP_TP,
  SYNTH_CRITERION_OWNER,
  advanceToRequest,
  at,
  entryEnvelope,
  exitEnvelope,
  unit,
  burdenCohort,
  popPublication,
  PLACE_L,
  popConsumerObject,
  popConsumerStage,
  populationBarrier,
  populationProviders,
  registerKey,
  temporalPublication,
} from "@immortalis/testkit";
import {
  commitCriterion,
  commitRegister,
  PENDING_ENVELOPE,
  popSummary,
  reopenPopulation,
  seededPendingConsumer,
  seededPopulationCampaign,
} from "../support/population.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const stagesOf = (t: ResolutionTransaction) =>
  t.stages.map((s) => s.stage.owner_operation.operation);

describe("Population reconciliation: exact conservation over typed Entries and Exits (WS-001 §1)", () => {
  it("close #1 is Closing = Opening + typed Entries − typed Exits, over the exact units, once", async () => {
    const { campaign, coordinator, population } = await seededPopulationCampaign(tempDir());
    const before = population.ledger(LEDGER_MAIN)!;
    expect(before.value.units.map((u) => u.unit_id)).toEqual(["u-1", "u-2", "u-3", "u-4"]);
    expect(before.value.basis_stamp.basis.kind).toBe("ESTABLISHMENT");

    const r = await must(coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
    expect(r.transaction.outcome.stop_reason).toBe("TARGET_REACHED");
    const close = population.close(LEDGER_MAIN)!.value;
    expect(close.opening).toEqual({ count: 4, ledger_version: 1 });
    expect(close.entries.map((e) => [e.envelope_id, e.unit_id])).toEqual([["env-a", "u-5"]]);
    expect(close.exits.map((e) => [e.envelope_id, e.unit_id, e.disposition])).toEqual([
      ["env-b", "u-4", "CESSATION"],
    ]);
    expect(close.closing).toEqual({ count: 4, ledger_version: 2 });
    expect(close.opening.count + close.entries.length - close.exits.length).toBe(
      close.closing.count,
    );
    const ledger = population.ledger(LEDGER_MAIN)!.value;
    expect(ledger.units.map((u) => u.unit_id)).toEqual(["u-1", "u-2", "u-3", "u-5"]);
    expect(ledger.consumed_envelopes).toEqual(["env-a", "env-b"]);
    expect(ledger.basis_stamp.basis).toMatchObject({
      kind: "RECONCILIATION_CLOSE",
      resolution_point: POP_TP,
    });
    // an ENTRY / EXIT is a causal owner's envelope; Population only recorded the change
    expect(close.entries[0]!.causing_event.owner).toBe("SYNTHETIC-CAUSE-OWNER");
    expect(campaign.verify()).toEqual([]);
  });

  it("Residence, Presence and Burden Locus are distinct and never aliased by inference", async () => {
    const { population, coordinator } = await seededPopulationCampaign(tempDir());
    await must(coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
    const byId = new Map(population.ledger(LEDGER_MAIN)!.value.units.map((u) => [u.unit_id, u]));
    // u-2: resident L, present M, no recorded allocation → burden is where it is present
    expect(byId.get("u-2")).toMatchObject({
      residence: "locus-fixture-1",
      presence: "place-m",
      burden_allocation: null,
    });
    // u-3: resident L, present M, burden allocated to L → the recorded allocation controls
    expect(byId.get("u-3")).toMatchObject({
      presence: "place-m",
      burden_allocation: "locus-fixture-1",
    });

    const view = (id: string) => ({
      ref: population.cohort(LEDGER_MAIN, id)!.value.ref,
      result: population.cohort(LEDGER_MAIN, id)!.value.result,
    });
    const l = view(COHORT_BURDEN_L);
    const m = view(COHORT_BURDEN_M);
    expect(l.result!.members).toEqual(["u-1", "u-3", "u-5"]);
    expect(m.result!.members).toEqual(["u-2"]);
    // each represented unit is counted exactly once across the Burden-Locus carrier partition
    expect(additiveTotal([l, m])).toEqual({ ok: true, value: { semantics: "EXACT", count: 4 } });
    expect(additiveTotal([l, m]).ok && l.result!.members!.length + m.result!.members!.length).toBe(
      population.ledger(LEDGER_MAIN)!.value.count.count,
    );
  });
});

describe("sparse Cohort and externally qualified derived view (WS-015 §§III, VI–X)", () => {
  it("Population composes the external view from its units and the criterion at ONE basis; the criterion stays the owner's", async () => {
    const { campaign, coordinator, population } = await seededPopulationCampaign(tempDir());
    const critBefore = campaign.store.getFact(CRITERION_KEY)!;
    await must(coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
    const view = population.cohort(LEDGER_MAIN, COHORT_STATUS_L)!;
    expect(view.value.ref.criterion).toEqual({
      owner: SYNTH_CRITERION_OWNER,
      ref: { owner: SYNTH_CRITERION_OWNER, fact_key: CRITERION_KEY },
    });
    expect(view.value.result!.members).toEqual(["u-1", "u-2", "u-5"]);
    expect(view.value.result!.cardinality).toEqual({ semantics: "EXACT", count: 3 });
    // basis stamp: the ordinary close point and the constituent versions the group pinned
    expect(view.value.result!.basis_stamp).toMatchObject({
      basis: { kind: "RECONCILIATION_CLOSE", resolution_point: POP_TP },
      constituents: [
        { key: populationLedgerKey(LEDGER_MAIN), version: 2 },
        { key: CRITERION_KEY, version: critBefore.version },
      ],
    });
    // Population stores a reference and a derived result — never a copy of the criterion fact
    expect(JSON.stringify(view.fact.value)).not.toContain("qualifying_unit_ids");
    expect(campaign.store.getFact(CRITERION_KEY)).toEqual(critBefore);
    expect(campaign.store.getFact(CRITERION_KEY)!.owner).toBe(SYNTH_CRITERION_OWNER);
  });

  it("overlapping views are non-additive; the view intersects the partition by Population-produced member sets", async () => {
    const { coordinator, population } = await seededPopulationCampaign(tempDir());
    await must(coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
    const v = (id: string) => ({
      ref: population.cohort(LEDGER_MAIN, id)!.value.ref,
      result: population.cohort(LEDGER_MAIN, id)!.value.result,
    });
    const status = v(COHORT_STATUS_L);
    const burdenL = v(COHORT_BURDEN_L);
    const r = additiveTotal([status, burdenL]);
    expect(!r.ok && r.error.code).toBe("OVERLAP_NOT_ADDITIVE");
    // status ∩ burden-at-L: {u-1,u-2,u-5} ∩ {u-1,u-3,u-5}
    expect(intersectionCount(status, burdenL)).toEqual({ ok: true, value: 2 });
  });
});

describe("PCB-01 primary path (F-017; WS-001 §32): envelope → due engaged-scope reconciliation → exact close → consumer", () => {
  it("makes the next engaged-scope reconciliation due, consumes the envelope once, and the consumer reads that exact close", async () => {
    const s = await seededPendingConsumer(tempDir());
    const { campaign, population } = s;
    const store = campaign.store;
    const close1 = population.close(LEDGER_MAIN)!;
    expect(close1.value.resolution_point).toEqual(POP_TP);
    // (1)-(3): committed, eligible, unconsumed, after the latest close, intersecting the consumer's scope
    const probe = populationBarrierEvaluator.evaluate(populationBarrier(), POP_TC, (k) =>
      store.getFact(k),
    );
    expect(probe).toEqual({ due: true, envelope_ids: ["env-c"] });
    expect(population.ledger(LEDGER_MAIN)!.value.consumed_envelopes).not.toContain("env-c");

    // (4)-(7): observe every store read the engaged resolution makes
    const spy = spyStore(store);
    const coordinator = new TemporalCoordinator(
      spy.store,
      populationProviders(),
      populationBarrierEvaluator,
    );
    const r = await must(coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    const tx = r.transaction;
    expect(tx.outcome).toMatchObject({ stop_reason: "TARGET_REACHED", actual_stop: POP_TC });

    // Population's reconciliation was engaged by the consumer's barrier, resolved BEFORE the consumer
    expect(tx.engaged.map((e) => [e.object_id, e.boundary])).toEqual([
      ["obj-consumer-1", "RETIRED"],
      [OBJECT_POP_CLOSE_2, "DUE_RECONCILED"],
    ]);
    const due = tx.engaged.find((e) => e.boundary === "DUE_RECONCILED") as any;
    expect(due).toMatchObject({ trigger: "PCB-01", due_for: popConsumerStage(1) });
    expect(stagesOf(tx)).toEqual(["population-reconcile-close", "synthetic-population-consume"]);
    expect(tx.boundaries_crossed.map((b) => b.object_id)).toEqual(["obj-consumer-1"]); // not Population's

    // exactly-once consumption, stamped on the new ordinary close
    const close2 = population.close(LEDGER_MAIN)!;
    expect(close2.fact.version).toBe(close1.fact.version + 1);
    expect(close2.value.consumed_envelopes).toEqual(["env-c"]);
    expect(close2.value.exits.map((e) => [e.unit_id, e.disposition, e.continuity_ref])).toEqual([
      ["u-2", "REVERSIBLE_MEMBERSHIP_EXIT", "continuity-env-c"],
    ]);
    expect(
      close2.value.opening.count + close2.value.entries.length - close2.value.exits.length,
    ).toBe(close2.value.closing.count);
    expect(close2.value.resolution_point).toEqual(POP_TC);
    expect(close2.value.close_stage).toEqual(populationCloseStage(LEDGER_MAIN, "close-2"));
    expect(population.ledger(LEDGER_MAIN)!.value.consumed_envelopes).toEqual([
      "env-a",
      "env-b",
      "env-c",
    ]);
    expect(population.ledger(LEDGER_MAIN)!.value.units.map((u) => u.unit_id)).toEqual([
      "u-1",
      "u-3",
      "u-5",
    ]);

    // the consumer read THAT close (and the view stamped with it), under its named Close Basis
    const consumerStage = tx.stages[1]!;
    const popStage = tx.stages[0]!;
    for (const read of consumerStage.reads) {
      expect(read.mode).toBe("AS-OF-DECLARED-CLOSE");
      expect(read.source_basis.committed_by).toBe(popStage.group_id);
    }
    const out = store.getFact("synthetic-consumer/result/1")!.value as any;
    expect(out.observed_close_point).toEqual(POP_TC);
    expect(out.observed_view).toEqual(["u-1", "u-3", "u-5"]);
    expect(population.cohortView(LEDGER_MAIN, COHORT_STATUS_L).ok).toBe(true);

    // the due reconciliation object moved only its resolved basis; nothing else of it changed
    const obj = coordinator.object(OBJECT_POP_CLOSE_2)!;
    expect(obj.value.last_resolved_basis).toEqual(POP_TC);
    expect(obj.value.next_boundary).toBeNull();
    expect(obj.fact.version).toBe(2);

    // dependency-driven, engaged-scope only: no scan, no listing, no touch of the unrelated ledger
    expect(spy.listCalls()).toBe(0);
    expect(spy.getFacts.filter((k) => k.includes(LEDGER_OTHER))).toEqual([]);
    expect(spy.getFacts).not.toContain(temporalObjectKey(OBJECT_POP_OTHER));
    expect(campaign.verify()).toEqual([]);
  });

  it("an unrelated Population ledger, its Cohort, register and dormant reconciliation stay untouched", async () => {
    const s = await seededPendingConsumer(tempDir());
    const watched = [
      populationLedgerKey(LEDGER_OTHER),
      populationCohortKey(LEDGER_OTHER, COHORT_OTHER),
      registerKey(LEDGER_OTHER),
      temporalObjectKey(OBJECT_POP_OTHER),
    ];
    const snap = () => watched.map((k) => s.campaign.store.getFact(k));
    const before = snap();
    expect(before.every((f) => f && f.version === 1)).toBe(true);
    const r = await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    expect(snap()).toEqual(before);
    expect(s.campaign.store.getFact(populationCloseKey(LEDGER_OTHER))).toBeUndefined();
    // and the boundary index holds nothing for it (the dormant object has no earned boundary)
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(r.transaction.engaged.some((e) => e.object_id === OBJECT_POP_OTHER)).toBe(false);
  });
});

describe("PCB-01 fires only when its frozen conditions hold (F-017; WS-001 §32)", () => {
  async function consumerOutcome(
    over: {
      withPending?: boolean;
      mutate?: (s: Awaited<ReturnType<typeof seededPendingConsumer>>) => Promise<void>;
    } = {},
  ) {
    const s = await seededPendingConsumer(tempDir(), { withPending: over.withPending ?? true });
    await over.mutate?.(s);
    const r = await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    return { s, r };
  }
  const noReconciliation = (o: Awaited<ReturnType<typeof consumerOutcome>>) => {
    expect(o.r.transaction.engaged.map((e) => e.boundary)).toEqual(["RETIRED"]);
    expect(stagesOf(o.r.transaction)).toEqual(["synthetic-population-consume"]);
    expect(o.s.population.ledger(LEDGER_MAIN)!.fact.version).toBe(2); // only close #1 happened
    expect(o.s.coordinator.object(OBJECT_POP_CLOSE_2)!.fact.version).toBe(1);
  };

  it("nothing pending: the consumer reads the LATEST committed close; no reconciliation is forced", async () => {
    const o = await consumerOutcome({ withPending: false });
    noReconciliation(o);
    const out = o.s.campaign.store.getFact("synthetic-consumer/result/1")!.value as any;
    expect(out.observed_close_point).toEqual(POP_TP);
    expect(o.r.transaction.stages[0]!.reads[0]!.source_basis.version).toBe(1);
  });

  it("an envelope that does not intersect the engaged scope does not force it (Exit of a non-member)", async () => {
    // u-3 is not a member of the status view (criterion at TP qualifies u-1, u-2, u-5)
    const o = await consumerOutcome({
      withPending: false,
      mutate: (s) => commitRegister(s.campaign.store, 12, [exitEnvelope("env-d", "u-3", at(130))]),
    });
    noReconciliation(o);
  });

  it("the same envelope DOES force it for a ledger-scoped consumer (it intersects that scope)", async () => {
    const s = await seededPendingConsumer(tempDir(), { withPending: false });
    await commitRegister(s.campaign.store, 12, [exitEnvelope("env-d", "u-3", at(130))]);
    const probe = populationBarrierEvaluator.evaluate(
      populationBarrier({ population: { ledger_id: LEDGER_MAIN, cohort_id: null } }),
      POP_TC,
      (k) => s.campaign.store.getFact(k),
    );
    expect(probe).toEqual({ due: true, envelope_ids: ["env-d"] });
  });

  it("an envelope effective after the consumer's resolution point is not eligible", async () => {
    const o = await consumerOutcome({
      withPending: false,
      mutate: (s) =>
        commitRegister(s.campaign.store, 12, [exitEnvelope("env-late", "u-2", at(170))]),
    });
    noReconciliation(o);
  });

  it("an envelope addressed to another ledger does not force it", async () => {
    const o = await consumerOutcome({ withPending: false });
    noReconciliation(o);
    // ledger-other's pending envelope (env-o) exists and is eligible for ITS ledger only
    expect(o.s.campaign.store.getFact(registerKey(LEDGER_OTHER))).toBeDefined();
    expect(o.s.population.ledger(LEDGER_OTHER)!.value.consumed_envelopes).toEqual([]);
  });

  it("an undeclared consumer is never helped by PCB-01: no producer, no close, no credit", async () => {
    const s = await seededPendingConsumer(tempDir());
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(60),
        object: popConsumerObject(2, {}, null),
      }),
    );
    // consumer 1 is engaged first at TC by registration order? resolve only consumer 2's boundary
    const r = await must(s.coordinator.advance(advanceToRequest("tx-undeclared", POP_TC2)));
    const t = r.transaction;
    const u = t.outcome.unresolved_dependents.find((d) => d.stage.causal_process_id.endsWith("-2"));
    expect(u?.reason).toBe("PREDECESSOR_ABSENT");
    expect(s.campaign.store.getFact("synthetic-consumer/result/2")).toBeUndefined();
  });

  it("without the IM-04 evaluator seam a barrier consumer is not resolvable (no second scheduler is invented)", async () => {
    const s = await seededPendingConsumer(tempDir());
    const bare = new TemporalCoordinator(s.campaign.store, populationProviders());
    const r = await must(bare.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    expect(r.transaction.outcome.unresolved_dependents).toEqual([
      { stage: popConsumerStage(1), reason: "PROVIDER_ABSENT" },
    ]);
    expect(s.population.ledger(LEDGER_MAIN)!.fact.version).toBe(2);
  });
});

describe("reconciliation that cannot lawfully complete: the consumer is not credited, independents proceed", () => {
  it("a criterion not established at the composition point fails closed (no mixed-time view); the unresolved work is held and later completes once", async () => {
    const dir = tempDir();
    const s = await seededPopulationCampaign(dir);
    await must(s.coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
    await commitRegister(s.campaign.store, 10, [PENDING_ENVELOPE()]);
    // the Criterion Owner has NOT re-established its fact for TC: it is still the TP fact
    const req = advanceToRequest("tx-consumer-1", POP_TC);
    const r = await must(s.coordinator.advance(req));
    const t = r.transaction;
    expect(t.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(t.outcome.unresolved_dependents.map((u) => u.reason).sort()).toEqual([
      "BASIS_MISMATCH",
      "PREDECESSOR_BLOCKED",
    ]);
    expect(t.engaged.map((e) => [e.object_id, e.boundary])).toEqual([
      ["obj-consumer-1", "STILL_ACTIVE"],
      [OBJECT_POP_CLOSE_2, "DUE_UNRESOLVED"],
    ]);
    // nothing was credited or consumed; the envelope is still pending; objects are untouched
    expect(s.population.ledger(LEDGER_MAIN)!.fact.version).toBe(2);
    expect(s.population.ledger(LEDGER_MAIN)!.value.consumed_envelopes).toEqual(["env-a", "env-b"]);
    expect(s.campaign.store.getFact("synthetic-consumer/result/1")).toBeUndefined();
    expect(s.coordinator.object(OBJECT_POP_CLOSE_2)!.fact.version).toBe(1);
    expect(s.coordinator.object("obj-consumer-1")!.fact.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);

    // the held request is consumed by the next transaction: once the criterion is established for TC
    // the SAME request completes, consuming the envelope exactly once
    await commitCriterion(s.campaign.store, 11, POP_TC, ["u-1", "u-3", "u-5"]);
    const done = await must(
      s.coordinator.advance({
        ...req,
        transaction_id: "tx-consumer-1b",
        continues: "tx-consumer-1",
      }),
    );
    expect(done.transaction.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(s.population.close(LEDGER_MAIN)!.value.consumed_envelopes).toEqual(["env-c"]);
    expect(s.population.ledger(LEDGER_MAIN)!.fact.version).toBe(3);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a stamped view is never revalidated against a later criterion (WS-015 §§VII, XVI)", () => {
  it("a later criterion fact leaves the stamped close-2 view and its verification untouched", async () => {
    const s = await seededPendingConsumer(tempDir());
    await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    const view = s.population.cohortView(LEDGER_MAIN, COHORT_STATUS_L);
    expect(view.ok && view.value.result!.members).toEqual(["u-1", "u-3", "u-5"]);
    await commitCriterion(s.campaign.store, 20, at(400), ["u-1"]);
    const again = s.population.cohortView(LEDGER_MAIN, COHORT_STATUS_L);
    expect(again).toEqual(view); // unchanged: stamped basis + its own constituents are the validation
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("save → close → load → continue (single canon; no duplicate consumption or recreation)", () => {
  it("in one process: reload reproduces Population, Cohort, close, provenance and receipts exactly, then continues", async () => {
    const dir = tempDir();
    const s = await seededPendingConsumer(dir);
    const r = await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    const before = popSummary(s.campaign, s.coordinator);
    const canonical = before.canonical.map((f) => f.key).sort();
    expect(canonical).toContain(PLAYER_CHARACTER_BINDING_KEY);
    await s.campaign.close();

    const l = await reopenPopulation(dir);
    expect(l.campaign.verify()).toEqual([]);
    expect(popSummary(l.campaign, l.coordinator)).toEqual(before);

    // re-presenting the committed transaction reaches its receipt: nothing re-resolved, nothing written
    const replay = await must(l.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    expect(replay.replayed).toBe(true);
    expect(replay.transaction).toEqual(r.transaction);
    expect(popSummary(l.campaign, l.coordinator)).toEqual(before);

    // continue: a later consumer whose barrier now finds nothing pending reads close #2 and forces nothing
    const closeBefore = l.population.close(LEDGER_MAIN)!;
    await must(
      l.coordinator.registerObject({ ...temporalPublication(70), object: popConsumerObject(2) }),
    );
    const next = await must(l.coordinator.advance(advanceToRequest("tx-consumer-2", POP_TC2)));
    expect(next.transaction.engaged.map((e) => e.boundary)).toEqual(["RETIRED"]);
    expect(stagesOf(next.transaction)).toEqual(["synthetic-population-consume"]);
    expect(l.population.close(LEDGER_MAIN)).toEqual(closeBefore); // not recreated, not re-consumed
    expect(l.population.ledger(LEDGER_MAIN)!.value.consumed_envelopes).toEqual([
      "env-a",
      "env-b",
      "env-c",
    ]);
    expect(next.transaction.stages[0]!.reads[0]!.source_basis.version).toBe(
      closeBefore.fact.version,
    );
    expect(l.campaign.verify()).toEqual([]);
    // the stage group identity is derived from the StageKey alone
    expect(
      l.campaign.store.lookupReceipt(stageIntentId(populationCloseStage(LEDGER_MAIN, "close-2"))),
    ).not.toBeNull();
    expect(stageGroupId(populationCloseStage(LEDGER_MAIN, "close-2"))).toBe(
      r.transaction.stages[0]!.group_id,
    );
    await l.campaign.close();
  });

  it("across real OS-process boundaries: create → load → continue", () => {
    const dir = tempDir();
    const script = join(import.meta.dirname, "fixtures", "population-process.ts");
    const run = (phase: string) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ["--experimental-strip-types", "--no-warnings", script, phase, dir],
          { encoding: "utf8" },
        ),
      ) as Record<string, any>;

    const created = run("create");
    expect(created.outcome.transaction.engaged.map((e: any) => e.boundary)).toEqual([
      "RETIRED",
      "DUE_RECONCILED",
    ]);
    const loaded = run("load"); // a different process than the one that saved
    expect(loaded.violations).toEqual([]);
    expect(loaded.summary).toEqual(created.summary);
    expect(loaded.view.result.members).toEqual(["u-1", "u-3", "u-5"]);
    expect(loaded.summary.state.value).toMatchObject({
      canonical_time: POP_TC,
      last_transaction: "tx-consumer-1",
      continuation: null,
    });

    const cont = run("continue"); // a third process continues from the persisted state
    expect(cont.before).toEqual(created.summary);
    expect(cont.replayed).toBe(true);
    expect(cont.afterReplay).toEqual(created.summary); // identical: no duplicate consumption or recreation
    expect(cont.violations).toEqual([]);
    expect(cont.outcome.transaction.engaged.map((e: any) => e.boundary)).toEqual(["RETIRED"]);
    // Population facts are byte-identical after the continuation (no second close, no second consume)
    expect(cont.after.population).toEqual(created.summary.population);
    // canonical world / PC / binding identity unchanged
    expect(cont.after.canonical).toEqual(created.summary.canonical);
  });
});

describe("the frozen Temporal-Read cut for Population (WS-015 §VIII; WS-001 §32)", () => {
  it("Criterion Owner → Population is AS-OF-NOW; Population → consumer is AS-OF-DECLARED-CLOSE with the named close basis", async () => {
    const s = await seededPendingConsumer(tempDir());
    const r = await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    const [pop, consumer] = r.transaction.stages;
    const critRead = pop!.reads.find((x) => x.source.fact_key === CRITERION_KEY)!;
    expect(critRead.mode).toBe("AS-OF-NOW");
    expect(critRead.source_basis.committed_by).toBe("pop-fixture-group-11"); // established for TC
    expect(pop!.reads.every((x) => x.mode === "AS-OF-NOW")).toBe(true); // no Population NOW round trip
    for (const read of consumer!.reads) {
      expect(read).toMatchObject({
        mode: "AS-OF-DECLARED-CLOSE",
        close_basis: {
          name: "population-ordinary-demographic-labor-reconciliation-close",
          producer: { owner: "population", operation: "population-reconcile-close" },
        },
      });
    }
  });

  it("a consumer cannot be registered to read a Population fact AS-OF-NOW, or at a basis other than the ordinary close", async () => {
    const s = await seededPopulationCampaign(tempDir());
    const good = popConsumerObject(2);
    const decl = good.dependencies[0]!;
    const now = {
      ...good,
      dependencies: [
        {
          ...decl,
          pending_consequence_barrier: undefined,
          reads: [
            {
              mode: "AS-OF-NOW" as const,
              source: decl.reads[0]!.source,
              invalidators: [],
            },
          ],
        },
      ],
    };
    delete (now.dependencies[0] as any).pending_consequence_barrier;
    const a = await s.coordinator.registerObject({ ...temporalPublication(80), object: now });
    expect(!a.ok && a.error.code).toBe("REFERENCE_INVALID");
    const horizon = {
      ...good,
      dependencies: [
        {
          ...decl,
          pending_consequence_barrier: undefined,
          reads: [
            {
              mode: "AS-OF-DECLARED-CLOSE" as const,
              source: decl.reads[0]!.source,
              close_basis: {
                name: "requested-horizon",
                producer: { owner: "population", operation: "population-reconcile-close" },
              },
              invalidators: [],
            },
          ],
        },
      ],
    };
    delete (horizon.dependencies[0] as any).pending_consequence_barrier;
    const b = await s.coordinator.registerObject({ ...temporalPublication(81), object: horizon });
    expect(!b.ok && b.error.code).toBe("REFERENCE_INVALID");
    expect(s.coordinator.object("obj-consumer-2")).toBeUndefined();
  });
});

describe("a spent reconciliation is never selected again (no recurrence is implemented)", () => {
  it("a second pending envelope after close #2 finds no next eligible reconciliation: the consumer is not credited, nothing is re-consumed", async () => {
    const dir = tempDir();
    const s = await seededPendingConsumer(dir);
    await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    const closeBefore = s.population.close(LEDGER_MAIN)!;
    await commitRegister(s.campaign.store, 30, [
      PENDING_ENVELOPE(),
      exitEnvelope("env-e", "u-1", at(170)),
    ]);
    await must(
      s.coordinator.registerObject({ ...temporalPublication(90), object: popConsumerObject(2) }),
    );
    const r = await must(s.coordinator.advance(advanceToRequest("tx-consumer-2", POP_TC2)));
    expect(r.transaction.outcome.unresolved_dependents).toEqual([
      { stage: popConsumerStage(2), reason: "PREDECESSOR_ABSENT" },
    ]);
    expect(s.population.close(LEDGER_MAIN)).toEqual(closeBefore); // the spent object was not re-engaged
    expect(s.population.ledger(LEDGER_MAIN)!.value.consumed_envelopes).toEqual([
      "env-a",
      "env-b",
      "env-c",
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("PCB-01 repair 1: an Entry the authoritative external criterion shows cannot qualify does not force reconciliation", () => {
  const joinedAtL = () => entryEnvelope("env-n", unit("u-6", PLACE_L, PLACE_L), at(130));

  it("an ENTRY lands at the Cohort's indexed place but the Criterion Owner's fact (at the resolution point) excludes it: not due", async () => {
    const s = await seededPendingConsumer(tempDir(), { withPending: false });
    await commitRegister(s.campaign.store, 12, [joinedAtL()]);
    // criterion for TC is [u-1, u-3, u-5]: the entering u-6 does not qualify
    const probe = populationBarrierEvaluator.evaluate(populationBarrier(), POP_TC, (k) =>
      s.campaign.store.getFact(k),
    );
    expect(probe.due).toBe(false);
    const r = await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    expect(r.transaction.engaged.map((e) => e.boundary)).toEqual(["RETIRED"]);
    expect(s.population.ledger(LEDGER_MAIN)!.fact.version).toBe(2); // no reconciliation
    expect(s.population.ledger(LEDGER_MAIN)!.value.consumed_envelopes).not.toContain("env-n");
    expect(s.coordinator.object(OBJECT_POP_CLOSE_2)!.fact.version).toBe(1);
  });

  it("the same Entry DOES force it when the criterion shows it qualifies, and the evidence says so", async () => {
    const s = await seededPendingConsumer(tempDir(), { withPending: false });
    await commitRegister(s.campaign.store, 12, [joinedAtL()]);
    await commitCriterion(s.campaign.store, 13, POP_TC, ["u-1", "u-3", "u-5", "u-6"]);
    const r = await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    const due = r.transaction.engaged.find((e) => e.boundary === "DUE_RECONCILED") as any;
    expect(due.evidence.triggers).toEqual([
      { envelope_id: "env-n", basis: "COHORT_QUALIFYING_ENTRY" },
    ]);
    expect(s.population.cohort(LEDGER_MAIN, COHORT_STATUS_L)!.value.result!.members).toContain(
      "u-6",
    );
  });

  it("an Entry elsewhere than the Cohort's place never intersects", async () => {
    const s = await seededPendingConsumer(tempDir(), { withPending: false });
    await commitRegister(s.campaign.store, 12, [
      entryEnvelope("env-m", unit("u-7", "place-m", "place-m"), at(130)),
    ]);
    expect(
      populationBarrierEvaluator.evaluate(populationBarrier(), POP_TC, (k) =>
        s.campaign.store.getFact(k),
      ).due,
    ).toBe(false);
  });

  it("where the external criterion is not established at the resolution point it cannot say: the answer stays 'could change'", async () => {
    const s = await seededPopulationCampaign(tempDir());
    await must(s.coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
    await commitRegister(s.campaign.store, 12, [joinedAtL()]);
    // the criterion is still the TP fact
    expect(
      populationBarrierEvaluator.evaluate(populationBarrier(), POP_TC, (k) =>
        s.campaign.store.getFact(k),
      ).due,
    ).toBe(true);
  });

  it("an unquantified Cohort has no discrete result to change: nothing is due for it", async () => {
    const s = await seededPendingConsumer(tempDir());
    await must(
      s.population.instantiateCohort({
        ...popPublication(77),
        ref: burdenCohort("cohort-uq", PLACE_L, LEDGER_MAIN, {
          cardinality_semantics: "UNQUANTIFIED",
        }),
      }),
    );
    const probe = populationBarrierEvaluator.evaluate(
      populationBarrier({ population: { ledger_id: LEDGER_MAIN, cohort_id: "cohort-uq" } }),
      POP_TC,
      (k) => s.campaign.store.getFact(k),
    );
    expect(probe.due).toBe(false); // env-c is pending and eligible, but cannot change an unquantified result
  });
});

describe("PCB-01 repair 2: the due claim is retained as verifiable evidence", () => {
  it("the engaged record carries evidence re-derivable from the committed stage group", async () => {
    const s = await seededPendingConsumer(tempDir());
    const r = await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    const due = r.transaction.engaged.find((e) => e.boundary === "DUE_RECONCILED") as any;
    expect(due.evidence).toEqual({
      scope: { ledger_id: LEDGER_MAIN, cohort_id: COHORT_STATUS_L },
      instant: POP_TC,
      triggers: [{ envelope_id: "env-c", basis: "COHORT_MEMBER_EXIT" }],
    });
    // Population's close retains the pre-state membership the claim relies on (verified at its admission)
    const close = s.population.close(LEDGER_MAIN)!.value;
    expect(close.cohorts.find((k) => k.cohort_id === COHORT_STATUS_L)!.members_before).toEqual([
      "u-1",
      "u-2",
      "u-5",
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });
});
