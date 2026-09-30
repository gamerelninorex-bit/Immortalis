/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary process output */
// Turnless Temporal & Resolution Transaction Foundation — "the campaign can lawfully resolve bounded
// causal work through time, stop with a remainder, be saved, closed, loaded, and continue."
// Register lineage: IA-04 (partial), IA-06/IA-22/IA-30 (reused/partial); RC-03/04/05/10, RC-16;
// IM-02, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0).
// CAL-01 stays UNCALIBRATED: the proof is EXACT-PARTITION. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  temporalObjectKey,
  temporalTransactionKey,
  type ResolutionTransaction,
} from "@immortalis/contracts";
import {
  TemporalCoordinator,
  factKind,
  stageGroupId,
  stageIntentId,
  type CanonicalCampaign,
} from "@immortalis/engine";
import {
  BOUNDARY_ID,
  CONSUMER_STAGE,
  DORMANT_STAGE,
  OBJECT_DORMANT,
  OBJECT_ENGAGED,
  PRODUCER_STAGE,
  SYNTH_CLOSE_NAME,
  SYNTH_CONSUMER_RESULT_KEY,
  SYNTH_DORMANT_RESULT_KEY,
  SYNTH_PRODUCER_RESULT_KEY,
  SYNTH_RULE,
  SYNTH_SOURCE_KEY,
  T0,
  T1,
  TB,
  at,
  closeBasis,
  continuationInput,
  dormantObject,
  engagedObject,
  stopAtBoundaryRequest,
  syntheticProviders,
  syntheticSourceGroup,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
} from "@immortalis/testkit";
import {
  codeOf,
  must,
  reopen,
  seededTemporalCampaign,
  spyStore,
  temporalSummary,
} from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const stageRecord = (t: ResolutionTransaction, which: { owner_operation: { operation: string } }) =>
  t.stages.find((s) => s.stage.owner_operation.operation === which.owner_operation.operation)!;

describe("the acceptance path: open at T0 → resolve Tb → stop with remainder → save/close/load → continue", () => {
  it("opens a bounded transaction at T0, resolves the engaged closure at Tb, and stops with the remainder toward T1", async () => {
    const dir = tempDir();
    const { campaign, coordinator } = await seededTemporalCampaign(dir);
    const before = temporalSummary(campaign, coordinator);
    const bindingBefore = campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;

    const request = stopAtBoundaryRequest("tx-1");
    const r = await must(coordinator.advance(request));
    expect(r.replayed).toBe(false);
    expect(r.recomputed_in_place).toEqual([]);
    expect(r.adopted).toEqual([]);
    expect(r.rejections).toEqual([]);
    const t = r.transaction;

    // RC-05: opening basis, trigger, target/condition, role/permission, cause identity
    expect(t.transaction_id).toBe("tx-1");
    expect(t.cause).toBe(request.cause);
    expect(t.trigger).toEqual(request.trigger);
    expect(t.continues).toBeNull();
    expect(t.opening).toEqual({ basis_time: T0, state_version: 1 });
    expect(t.requested).toEqual(request.requested);
    expect(t.context).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });

    // actual stop and unresolved remainder toward T1
    expect(t.outcome).toEqual({
      actual_stop: TB,
      stop_reason: "CONDITION_SATISFIED",
      remainder: { from: TB, to: T1 },
      unresolved_dependents: [],
    });

    // engaged references: exactly the one object whose earned boundary was crossed
    expect(t.engaged).toEqual([
      {
        boundary: "RETIRED",
        object_id: OBJECT_ENGAGED,
        fact_key: temporalObjectKey(OBJECT_ENGAGED),
        version_before: 1,
        version_after: 2,
      },
    ]);
    expect(t.boundaries_crossed).toEqual([
      { object_id: OBJECT_ENGAGED, boundary_id: BOUNDARY_ID, at: TB },
    ]);

    // committed groups/receipts, in dependency order, each authoritative (RC-16)
    expect(t.stages.map((s) => s.stage)).toEqual([PRODUCER_STAGE, CONSUMER_STAGE]);
    for (const s of t.stages) {
      const receipt = campaign.store.lookupReceipt(s.intent_id)!;
      expect(receipt).toMatchObject({
        outcome: "COMMITTED",
        group_id: s.group_id,
        revision: s.revision,
        group_sha256: s.group_sha256,
      });
      expect(s.validation.invariants).toEqual(receipt.invariants.map((i) => i.name));
      expect(s.validation.invariants).toContain("reads-current");
    }
    const producer = stageRecord(t, PRODUCER_STAGE);
    const consumer = stageRecord(t, CONSUMER_STAGE);
    expect(producer.group_id).toBe(stageGroupId(PRODUCER_STAGE));
    expect(producer.intent_id).toBe(stageIntentId(PRODUCER_STAGE));
    expect(producer.revision).toBeLessThan(consumer.revision);
    expect(producer.writes).toEqual([{ key: SYNTH_PRODUCER_RESULT_KEY, version: 1 }]);
    expect(consumer.writes).toEqual([{ key: SYNTH_CONSUMER_RESULT_KEY, version: 1 }]);
    // rule/source versions
    expect(t.rule_versions).toContainEqual(factKind("temporal_state").rule);
    expect(t.rule_versions).toContainEqual(SYNTH_RULE);

    // RC-03 (NOW): the producer read already-committed canonical campaign state AS-OF-NOW
    const nowBinding = producer.reads[0]!;
    expect(nowBinding).toMatchObject({
      mode: "AS-OF-NOW",
      source: { owner: "role_registry", fact_key: PLAYER_CHARACTER_BINDING_KEY },
      source_basis: {
        version: bindingBefore.version,
        committed_by: bindingBefore.provenance.group_id,
      },
    });
    expect("close_basis" in nowBinding).toBe(false);
    // RC-03 (CLOSE): the consumer read the exact named producer close, horizon-independent
    const closeRead = consumer.reads[0]!;
    expect(closeRead).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      close_basis: closeBasis(),
      source_basis: { version: 1, committed_by: stageGroupId(PRODUCER_STAGE) },
    });
    expect(closeRead.mode === "AS-OF-DECLARED-CLOSE" && closeRead.close_basis.name).toBe(
      SYNTH_CLOSE_NAME,
    );

    // substantive results are the owner's, deterministic, and only bounded temporal/provenance evidence
    expect(campaign.store.getFact(SYNTH_PRODUCER_RESULT_KEY)).toMatchObject({
      value: { elapsed: 40, observed_pc: FIXTURE_PC_ID, observed_source: "source-v1" },
      owner: "SYNTHETIC-STAGE-OWNER",
      version: 1,
    });
    expect(campaign.store.getFact(SYNTH_CONSUMER_RESULT_KEY)).toMatchObject({
      value: { consumed_elapsed: 40 },
      version: 1,
    });

    // persisted shared temporal state: canonical time IS the committed stop basis
    const state = coordinator.state()!;
    expect(state.value).toEqual({
      canonical_time: TB,
      last_transaction: "tx-1",
      continuation: { from_transaction: "tx-1", toward: T1, unresolved_dependents: [] },
    });
    expect(coordinator.object(OBJECT_ENGAGED)!.value).toMatchObject({
      last_resolved_basis: TB,
      next_boundary: null,
    });
    expect(coordinator.boundaryIndex()).toEqual({ entries: [] }); // the resolved boundary left the active index
    expect(coordinator.transaction("tx-1")!.value).toEqual(t);

    // the existing canon is untouched, and the whole campaign still verifies
    const after = temporalSummary(campaign, coordinator);
    expect(after.canonical).toEqual(before.canonical);
    expect(after.objects.find((f) => f.key === temporalObjectKey(OBJECT_DORMANT))).toEqual(
      before.objects.find((f) => f.key === temporalObjectKey(OBJECT_DORMANT)),
    );
    expect(campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toEqual(bindingBefore);
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("survives close and load with no temporal, transaction, dependency, stage or provenance drift, then continues from Tb to T1 without re-resolving", async () => {
    const dir = tempDir();
    const first = await seededTemporalCampaign(dir, { buildId: "seed" });
    const tx1 = await must(first.coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const saved = temporalSummary(first.campaign, first.coordinator);
    await first.campaign.close();

    // LOAD: every material fact, receipt and identity is exactly as saved
    const loaded = await reopen(dir, "load");
    expect(loaded.campaign.verify()).toEqual([]);
    const reloaded = temporalSummary(loaded.campaign, loaded.coordinator);
    expect(reloaded).toEqual(saved);
    expect(reloaded.head.campaign_id).toBe(FIXTURE_CAMPAIGN);
    expect(loaded.coordinator.state()!.value.canonical_time).toEqual(TB); // the committed stop basis
    expect(loaded.coordinator.transaction("tx-1")!.value).toEqual(tx1.transaction);
    expect(loaded.coordinator.state()!.value.continuation).toEqual({
      from_transaction: "tx-1",
      toward: T1,
      unresolved_dependents: [],
    });
    for (const s of tx1.transaction.stages) {
      expect(loaded.campaign.store.lookupReceipt(s.intent_id)).toMatchObject({
        group_id: s.group_id,
        group_sha256: s.group_sha256,
        revision: s.revision,
      });
    }

    // CONTINUE from Tb: reaches the requested target; the completed stages are not re-resolved
    const stageGroupsBefore = loaded.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("synthetic/"))
      .map((f) => [f.key, f.version, f.provenance.group_id]);
    const tx2 = await must(loaded.coordinator.continueRemainder(continuationInput("tx-2")));
    expect(tx2.replayed).toBe(false);
    expect(tx2.transaction.continues).toBe("tx-1");
    expect(tx2.transaction.opening).toEqual({ basis_time: TB, state_version: 2 });
    expect(tx2.transaction.requested).toEqual({ target: T1, condition: null });
    expect(tx2.transaction.outcome).toEqual({
      actual_stop: T1,
      stop_reason: "TARGET_REACHED",
      remainder: null,
      unresolved_dependents: [],
    });
    expect(tx2.transaction.stages).toEqual([]); // nothing earned remained: no stage, close or commit recreated
    expect(tx2.transaction.engaged).toEqual([]);
    expect(loaded.coordinator.state()!.value).toEqual({
      canonical_time: T1,
      last_transaction: "tx-2",
      continuation: null,
    });
    // exactly one new commit (the kernel's transaction group); no duplicate stage, close or owner fact
    const cont = temporalSummary(loaded.campaign, loaded.coordinator);
    expect(cont.head.journal_entries).toBe(saved.head.journal_entries + 1);
    expect(
      loaded.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("synthetic/"))
        .map((f) => [f.key, f.version, f.provenance.group_id]),
    ).toEqual(stageGroupsBefore);
    expect(cont.canonical).toEqual(saved.canonical);
    expect(cont.objects).toEqual(saved.objects); // including the dormant object, untouched
    expect(cont.transactions.map((f) => f.key)).toEqual([
      temporalTransactionKey("tx-1"),
      temporalTransactionKey("tx-2"),
    ]);
    expect(cont.transactions[0]).toEqual(saved.transactions[0]); // the prior transaction is sealed, intact
    expect(loaded.campaign.verify()).toEqual([]);
    await loaded.campaign.close();

    // and a further load is still one consistent story
    const again = await reopen(dir, "again");
    expect(temporalSummary(again.campaign, again.coordinator)).toEqual(cont);
    expect(again.campaign.verify()).toEqual([]);
    await again.campaign.close();
  });

  it("holds across real operating-system process boundaries: create → load → continue", async () => {
    const dir = tempDir();
    const script = join(import.meta.dirname, "fixtures", "temporal-process.ts");
    const run = (phase: string) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ["--experimental-strip-types", "--no-warnings", script, phase, dir],
          {
            encoding: "utf8",
          },
        ),
      ) as Record<string, any>;

    const created = run("create");
    const loaded = run("load"); // a different process than the one that saved
    expect(loaded.violations).toEqual([]);
    expect(loaded.summary).toEqual(created.summary);
    expect(loaded.summary.state.value).toMatchObject({
      canonical_time: TB,
      last_transaction: "tx-1",
      continuation: { toward: T1 },
    });

    const cont = run("continue"); // a third process continues from the persisted stop
    expect(cont.before).toEqual(created.summary); // identical at open, in yet another process
    expect(cont.violations).toEqual([]);
    expect(cont.outcome.transaction.outcome.actual_stop).toEqual(T1);
    expect(cont.outcome.transaction.stages).toEqual([]);
    expect(cont.after.head.journal_entries).toBe(created.summary.head.journal_entries + 1);
    expect(cont.after.synthetic).toEqual(created.summary.synthetic);
    expect(cont.after.canonical).toEqual(created.summary.canonical);
    expect(cont.after.objects).toEqual(created.summary.objects);
    expect(cont.after.head.spec_identity_sha256).toBe(created.summary.head.spec_identity_sha256);
  });

  it("is deterministic: identical inputs yield byte-identical campaign state and journal head", async () => {
    const run = async () => {
      const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
      await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
      await must(coordinator.continueRemainder(continuationInput("tx-2")));
      const head = campaign.store.head();
      await campaign.close();
      return [head.state_sha256, head.journal_head_sha256];
    };
    expect(await run()).toEqual(await run());
  });
});

describe("IM-11 / IM-12 / IM-17 are reused, not replaced", () => {
  it("every stage and kernel write is an ordinary commit group through store.commit, receipted and journaled", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    const spy = spyStore(campaign.store);
    const c = new TemporalCoordinator(spy.store, syntheticProviders());
    const r = await must(c.advance(stopAtBoundaryRequest("tx-1")));
    // three publications: producer, consumer (each the owner's group), then the kernel's single group
    expect(spy.commits.map((g) => g.owner)).toEqual([
      "SYNTHETIC-STAGE-OWNER",
      "SYNTHETIC-STAGE-OWNER",
      "temporal_kernel",
    ]);
    const kernel = spy.commits[2]!;
    expect(kernel.authority).toEqual({
      role: "role.archivist",
      permission: "permission.canon.write",
    });
    expect(kernel.writes.map((w) => w.key).sort()).toEqual(
      [
        "temporal/boundary-index",
        "temporal/object/obj-engaged",
        "temporal/state",
        "temporal/transaction/tx-1",
      ].sort(),
    );
    // the kernel group depends on exactly the stage groups it cites
    for (const s of r.transaction.stages) expect(kernel.depends_on).toContain(s.group_id);
    // the producer's read of the canonical binding is pinned at its committed version (IM-11 reads-current)
    const producerGroup = spy.commits[0]!;
    expect(producerGroup.reads[0]).toEqual({
      key: PLAYER_CHARACTER_BINDING_KEY,
      version: campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!.version,
    });
    // no rival journal, save or sidecar: the package is still exactly the one manifest/state/journal
    const head = campaign.store.head();
    expect(head.journal_entries).toBe(head.revision);
    expect(campaign.store.descriptor.provider_acceptance).toBe("NONE");
    await campaign.close();
  });

  it("retry/replay of the same immutable intent returns the existing authoritative receipt", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    const first = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const entries = campaign.store.head().journal_entries;
    const again = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(again.replayed).toBe(true);
    expect(again.transaction).toEqual(first.transaction);
    expect(again.receipt).toEqual(first.receipt);
    expect(again.recomputed_in_place).toEqual([]);
    expect(campaign.store.head().journal_entries).toBe(entries); // no duplicate stage or consequence
    // and at the store level: re-presenting the very same stage group replays its receipt
    const stageGroup = campaign.store.committedGroup(stageIntentId(PRODUCER_STAGE))!;
    const replay = await must(campaign.store.commit(stageGroup));
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(campaign.store.lookupReceipt(stageIntentId(PRODUCER_STAGE)));
    expect(campaign.store.head().journal_entries).toBe(entries);
    await campaign.close();
  });

  it("the same transaction identity with different content is refused, never a new consequence", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const entries = campaign.store.head().journal_entries;
    const other = stopAtBoundaryRequest("tx-1", {
      requested: { target: at(999), condition: null },
    });
    expect(await codeOf(coordinator.advance(other))).toBe("TRANSACTION_CONFLICT");
    expect(
      await codeOf(coordinator.advance(stopAtBoundaryRequest("tx-1", { cause: "another-cause" }))),
    ).toBe("TRANSACTION_CONFLICT");
    expect(campaign.store.head().journal_entries).toBe(entries);
    await campaign.close();
  });
});

describe("causally engaged set and dormant-state economy (brief §4.8, §5.3)", () => {
  it("never scans: the advance reads the state, the active index and only the engaged object, stage sources and their own facts", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    const spy = spyStore(campaign.store);
    const c = new TemporalCoordinator(spy.store, syntheticProviders());
    await must(c.advance(stopAtBoundaryRequest("tx-1")));
    expect(spy.listCalls()).toBe(0); // no whole-world / whole-history listing
    const touched = new Set(spy.getFacts);
    expect(touched.has(temporalObjectKey(OBJECT_DORMANT))).toBe(false);
    expect(touched.has("synthetic/dormant/source")).toBe(false);
    expect(touched.has(SYNTH_DORMANT_RESULT_KEY)).toBe(false);
    expect(touched.has(temporalObjectKey(OBJECT_ENGAGED))).toBe(true);
    for (const key of touched) {
      expect(
        [
          "temporal/state",
          "temporal/boundary-index",
          temporalObjectKey(OBJECT_ENGAGED),
          PLAYER_CHARACTER_BINDING_KEY,
          SYNTH_SOURCE_KEY,
          SYNTH_PRODUCER_RESULT_KEY,
          SYNTH_CONSUMER_RESULT_KEY,
          temporalTransactionKey("tx-1"),
        ],
        `unexpected read of ${key}`,
      ).toContain(key);
    }
    // the continuation does not even read an object: nothing is due
    const spy2 = spyStore(campaign.store);
    const c2 = new TemporalCoordinator(spy2.store, syntheticProviders());
    await must(c2.continueRemainder(continuationInput("tx-2")));
    expect(spy2.listCalls()).toBe(0);
    expect(spy2.getFacts.filter((k) => k.startsWith("temporal/object/"))).toEqual([]);
    await campaign.close();
  });

  it("leaves the dormant object unresolved, uninvalidated, unstaged, uncommitted, unversioned and out of the graph", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    const dormantBefore = campaign.store.getFact(temporalObjectKey(OBJECT_DORMANT))!;
    const dormantSourceBefore = campaign.store.getFact("synthetic/dormant/source")!;
    expect(coordinator.object(OBJECT_DORMANT)!.value.next_boundary).toBeNull();
    expect(coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual([OBJECT_ENGAGED]);

    const spy = spyStore(campaign.store);
    const c = new TemporalCoordinator(spy.store, syntheticProviders());
    const r = await must(c.advance(stopAtBoundaryRequest("tx-1")));
    await must(c.continueRemainder(continuationInput("tx-2")));

    // unchanged fact, version and provenance; no boundary acquired "merely because time was requested"
    expect(campaign.store.getFact(temporalObjectKey(OBJECT_DORMANT))).toEqual(dormantBefore);
    expect(campaign.store.getFact("synthetic/dormant/source")).toEqual(dormantSourceBefore);
    expect(coordinator.object(OBJECT_DORMANT)!.value).toEqual(dormantObject());
    expect(coordinator.boundaryIndex().entries).toEqual([]);
    // not resolved, staged or committed
    expect(campaign.store.getFact(SYNTH_DORMANT_RESULT_KEY)).toBeUndefined();
    expect(campaign.store.lookupReceipt(stageIntentId(DORMANT_STAGE))).toBeNull();
    expect(spy.commits.every((g) => g.writes.every((w) => !w.key.includes("dormant")))).toBe(true);
    // not engaged, not crossed, not in any transaction, not in the transient graph's stage set
    for (const tx of [r.transaction, coordinator.transaction("tx-2")!.value]) {
      expect(tx.engaged.map((e) => e.object_id)).not.toContain(OBJECT_DORMANT);
      expect(tx.boundaries_crossed.map((b) => b.object_id)).not.toContain(OBJECT_DORMANT);
      expect(tx.stages.map((s) => s.stage)).not.toContainEqual(DORMANT_STAGE);
      expect(tx.outcome.unresolved_dependents.map((u) => u.stage)).not.toContainEqual(
        DORMANT_STAGE,
      );
    }
    await campaign.close();
  });

  it("an object whose earned boundary lies beyond the target stays untouched, although it is in the index", async () => {
    const later = dormantObject({
      object_id: "obj-later",
      next_boundary: { boundary_id: "boundary-later", at: at(900) },
    });
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [engagedObject(), later],
    });
    expect(coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual([
      OBJECT_ENGAGED,
      "obj-later",
    ]);
    const before = campaign.store.getFact(temporalObjectKey("obj-later"))!;
    const spy = spyStore(campaign.store);
    const c = new TemporalCoordinator(spy.store, syntheticProviders());
    await must(c.advance(stopAtBoundaryRequest("tx-1")));
    await must(c.continueRemainder(continuationInput("tx-2"))); // to T1 = 200 < 900
    expect(spy.getFacts).not.toContain(temporalObjectKey("obj-later"));
    expect(campaign.store.getFact(temporalObjectKey("obj-later"))).toEqual(before);
    expect(coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual(["obj-later"]);
    await campaign.close();
  });

  it("fails closed rather than scanning or mutating dormant state to satisfy a request that names it", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    const entries = campaign.store.head().journal_entries;
    const req = stopAtBoundaryRequest("tx-x", {
      requested: {
        target: T1,
        condition: { kind: "STOP_AFTER_BOUNDARY", object_id: OBJECT_DORMANT, boundary_id: "none" },
      },
    });
    const spy = spyStore(campaign.store);
    const c = new TemporalCoordinator(spy.store, syntheticProviders());
    expect(await codeOf(c.advance(req))).toBe("CONDITION_NOT_REACHABLE");
    expect(spy.commits).toEqual([]);
    expect(spy.listCalls()).toBe(0);
    expect(campaign.store.head().journal_entries).toBe(entries);
    await campaign.close();
  });
});

describe("anti-fake identity: horizon, source version, retry, repartition and message churn cannot manufacture a StageKey or escape a cycle", () => {
  const stageFacts = (c: CanonicalCampaign) =>
    c.store
      .listFacts()
      .filter((f) => f.key.startsWith("synthetic/") && f.key.includes("/result"))
      .map((f) => ({
        key: f.key,
        value: f.value,
        version: f.version,
        group_id: f.provenance.group_id,
      }));

  async function runWith(slices: readonly ReturnType<typeof at>[], target = T1, id = "tx-1") {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    const r = await must(
      coordinator.advance(
        stopAtBoundaryRequest(id, {
          requested: {
            target,
            condition: {
              kind: "STOP_AFTER_BOUNDARY",
              object_id: OBJECT_ENGAGED,
              boundary_id: BOUNDARY_ID,
            },
          },
        }),
        { slices },
      ),
    );
    const head = campaign.store.head();
    const out = { r, facts: stageFacts(campaign), head };
    await campaign.close();
    return out;
  }

  it("an arbitrary internal repartition creates no new StageKey, opportunity, commit or different substantive result", async () => {
    const plain = await runWith([]);
    for (const slices of [
      [at(110)],
      [at(105), at(110), at(120), at(130), at(139)],
      [TB], // a slice exactly at the boundary is still only execution detail
      [at(141), at(150)], // beyond the stop
      [at(120), at(120)],
    ]) {
      const sliced = await runWith(slices);
      expect(sliced.r.transaction.stages.map((s) => s.stage)).toEqual(
        plain.r.transaction.stages.map((s) => s.stage),
      );
      expect(
        sliced.r.transaction.stages.map((s) => [
          s.group_id,
          s.intent_id,
          s.group_sha256,
          s.revision,
        ]),
      ).toEqual(
        plain.r.transaction.stages.map((s) => [
          s.group_id,
          s.intent_id,
          s.group_sha256,
          s.revision,
        ]),
      );
      expect(sliced.facts).toEqual(plain.facts); // the same substantive result
      // not a single extra commit, and the whole campaign is byte-identical (nothing of the slicing persists)
      expect(sliced.head.journal_entries).toBe(plain.head.journal_entries);
      expect(sliced.head.state_sha256).toBe(plain.head.state_sha256);
      expect(sliced.head.journal_head_sha256).toBe(plain.head.journal_head_sha256);
    }
  });

  it("the requested horizon is not identity: a different target yields the same StageKeys, groups and results", async () => {
    const near = await runWith([], T1);
    for (const target of [at(141), at(500), at(1_000_000)]) {
      const far = await runWith([], target);
      expect(
        far.r.transaction.stages.map((s) => [s.stage, s.group_id, s.intent_id, s.group_sha256]),
      ).toEqual(
        near.r.transaction.stages.map((s) => [s.stage, s.group_id, s.intent_id, s.group_sha256]),
      );
      expect(far.facts).toEqual(near.facts);
      expect(far.r.transaction.outcome.actual_stop).toEqual(TB); // the horizon moved; the causal stop did not
      expect(far.r.transaction.outcome.remainder).toEqual({ from: TB, to: target });
    }
  });

  it("the campaign revision, journal position or transaction id is not a stage identity either", async () => {
    const a = await runWith([], T1, "tx-alpha");
    const b = await runWith([], T1, "tx-beta");
    expect(b.r.transaction.stages.map((s) => [s.stage, s.group_id, s.intent_id])).toEqual(
      a.r.transaction.stages.map((s) => [s.stage, s.group_id, s.intent_id]),
    );
  });

  it("a NEW transaction (any horizon, retry) never recreates a committed stage as a sibling", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    // the held remainder is consumed (there is no way to abandon it), then fresh transactions follow
    await must(coordinator.continueRemainder(continuationInput("tx-consume")));
    const groups = () =>
      campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("synthetic/"))
        .map((f) => [f.key, f.version, f.provenance.group_id]);
    const before = groups();
    // a later source version appears, then fresh transactions with other horizons and "retries"
    await must(campaign.store.commit(syntheticSourceGroup(FIXTURE_CAMPAIGN, 3, "source-v2", 1)));
    const v2 = groups();
    for (const [i, target] of [at(300), at(400), at(400)].entries()) {
      const r = await must(
        coordinator.advance(
          stopAtBoundaryRequest(`tx-retry-${i}`, { requested: { target, condition: null } }),
        ),
      );
      expect(r.transaction.stages).toEqual([]);
    }
    expect(groups()).toEqual(v2);
    expect(campaign.store.getFact(SYNTH_PRODUCER_RESULT_KEY)).toMatchObject({
      version: 1,
      value: { observed_source: "source-v1" }, // a committed cause is never rewound by a later version
    });
    // the only change to the stage facts is the new source version itself
    const strip = (rows: (string | number)[][]) => rows.filter((r) => r[0] !== SYNTH_SOURCE_KEY);
    expect(strip(v2)).toEqual(strip(before));
    expect(v2.find((r) => r[0] === SYNTH_SOURCE_KEY)![1]).toBe(2);
    await campaign.close();
  });

  it("an unresolved stage whose source changed before commit is recomputed IN PLACE under the same StageKey — not as a sibling", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    const clean = await (async () => {
      const c = await seededTemporalCampaign(tempDir());
      const out = await must(c.coordinator.advance(stopAtBoundaryRequest("tx-1")));
      await c.campaign.close();
      return out;
    })();

    let changed = false;
    const r = await must(
      coordinator.advance(stopAtBoundaryRequest("tx-1"), {
        afterStaged: async (stage) => {
          if (stage.owner_operation.operation === "synthetic-produce" && !changed) {
            changed = true;
            // the unresolved producer's source gets a new authoritative version before it commits
            await must(
              campaign.store.commit(syntheticSourceGroup(FIXTURE_CAMPAIGN, 3, "source-v2", 1)),
            );
          }
        },
      }),
    );
    // recomputed in place, once, under the same StageKey and the same derived group identity
    expect(r.recomputed_in_place).toEqual([PRODUCER_STAGE]);
    const producer = stageRecord(r.transaction, PRODUCER_STAGE);
    expect(producer.stage).toEqual(PRODUCER_STAGE);
    expect(producer.group_id).toBe(stageGroupId(PRODUCER_STAGE));
    expect(producer.group_id).toBe(stageRecord(clean.transaction, PRODUCER_STAGE).group_id);
    expect(producer.intent_id).toBe(stageRecord(clean.transaction, PRODUCER_STAGE).intent_id);
    // it read the NEW version, and the substantive result follows the new source
    expect(producer.reads[1]).toMatchObject({ source_basis: { version: 2 } });
    expect(campaign.store.getFact(SYNTH_PRODUCER_RESULT_KEY)).toMatchObject({
      version: 1, // one commit of the stage: never a second "sibling" write
      value: { observed_source: "source-v2" },
    });
    // exactly one stage group for the producer exists in the journal, and the stage set is unchanged
    expect(r.transaction.stages.map((s) => s.stage)).toEqual([PRODUCER_STAGE, CONSUMER_STAGE]);
    const producerGroups = campaign.store
      .listFacts()
      .filter((f) => f.provenance.group_id === stageGroupId(PRODUCER_STAGE));
    expect(producerGroups.map((f) => f.key)).toEqual([SYNTH_PRODUCER_RESULT_KEY]);
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("invalidates only affected unresolved consumers: a change to an unrelated source recomputes nothing", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    let n = 0;
    const r = await must(
      coordinator.advance(stopAtBoundaryRequest("tx-1"), {
        afterStaged: async () => {
          // while each stage is staged, change ONLY the dormant source — nobody engaged reads it
          n += 1;
          await must(
            campaign.store.commit(
              syntheticSourceGroup(
                FIXTURE_CAMPAIGN,
                10 + n,
                `dormant-v${n + 1}`,
                n,
                "synthetic/dormant/source",
              ),
            ),
          );
        },
      }),
    );
    expect(n).toBe(2); // each stage was staged exactly once
    expect(r.recomputed_in_place).toEqual([]);
    await campaign.close();
  });

  it("a consumer whose CLOSE source moved past the named close is not credited, and is reported — it never silently reads a later slice", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    let moved = false;
    const r = await must(
      coordinator.advance(stopAtBoundaryRequest("tx-1"), {
        afterStaged: async (stage) => {
          if (stage.owner_operation.operation === "synthetic-consume" && !moved) {
            moved = true;
            // the producer's owner later publishes a new version of its result (past the close)
            await must(
              campaign.store.commit({
                ...syntheticSourceGroup(
                  FIXTURE_CAMPAIGN,
                  20,
                  { elapsed: 999 },
                  1,
                  SYNTH_PRODUCER_RESULT_KEY,
                ),
              }),
            );
          }
        },
      }),
    );
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents).toEqual([
      { stage: CONSUMER_STAGE, reason: "CLOSE_SOURCE_ADVANCED" },
    ]);
    expect(campaign.store.getFact(SYNTH_CONSUMER_RESULT_KEY)).toBeUndefined();
    await campaign.close();
  });
});

describe("dependency closure and fail-closed ordering (brief §4.5, §5.3, §5.6)", () => {
  const replaceDeps = (deps: ReturnType<typeof engagedObject>["dependencies"]) =>
    engagedObject({ dependencies: deps });
  const [P, C] = engagedObject().dependencies;
  const independent = (n: number) => ({
    stage: {
      causal_process_id: "synthetic-process-engaged",
      owner_operation: { owner: "SYNTHETIC-STAGE-OWNER", operation: "synthetic-independent" },
      prospective_result_id: `independent-${n}`,
    },
    reads: [],
    produces: [`synthetic/independent/result-${n}`],
    declares_close: null,
  });

  it("resolves the engaged producer and consumer in lawful dependency order even when declared consumer-first", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [replaceDeps([C!, P!])],
    });
    const r = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(r.transaction.stages.map((s) => s.stage)).toEqual([PRODUCER_STAGE, CONSUMER_STAGE]);
    await campaign.close();
  });

  it("stops a CLOSE read whose Close Basis the producer does not declare — a slice/horizon token cannot stand in", async () => {
    for (const name of ["slice-3", "horizon:200", "t=140", "synthetic-producer-close-2"]) {
      const bad = {
        ...C!,
        reads: [{ ...C!.reads[0]!, close_basis: closeBasis(name) }],
      } as typeof C;
      const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
        objects: [replaceDeps([P!, bad!, independent(1)])],
      });
      const r = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
      expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
      expect(r.transaction.outcome.unresolved_dependents).toEqual([
        { stage: CONSUMER_STAGE, reason: "CLOSE_BASIS_UNDECLARED" },
      ]);
      // the consumer was never credited; independent lawful work proceeded
      expect(campaign.store.getFact(SYNTH_CONSUMER_RESULT_KEY)).toBeUndefined();
      expect(r.transaction.stages.map((s) => s.stage.prospective_result_id).sort()).toEqual([
        "independent-1",
        "producer-result-1",
      ]);
      // the object's boundary is not retired while one of its stages is unresolved
      expect(coordinator.object(OBJECT_ENGAGED)!.value.next_boundary).not.toBeNull();
      await campaign.close();
    }
  });

  it("stops a CLOSE read whose producer is not among the engaged stages (a required predecessor is absent)", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [replaceDeps([C!, independent(1)])],
    });
    const r = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(r.transaction.outcome.unresolved_dependents).toEqual([
      { stage: CONSUMER_STAGE, reason: "PREDECESSOR_ABSENT" },
    ]);
    expect(r.transaction.stages).toHaveLength(1);
    await campaign.close();
  });

  it("stops a NOW read whose committed source is absent, and stops its dependents", async () => {
    const missing = {
      ...P!,
      reads: [
        ...P!.reads,
        {
          mode: "AS-OF-NOW" as const,
          source: { owner: "SYNTHETIC-STAGE-OWNER", fact_key: "synthetic/never-committed" },
          invalidators: [],
        },
      ],
    };
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [replaceDeps([missing, C!, independent(1)])],
    });
    const r = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const reasons = Object.fromEntries(
      r.transaction.outcome.unresolved_dependents.map((u) => [
        u.stage.owner_operation.operation,
        u.reason,
      ]),
    );
    expect(reasons).toEqual({
      "synthetic-produce": "SOURCE_ABSENT",
      "synthetic-consume": "PREDECESSOR_BLOCKED",
    });
    expect(r.transaction.stages.map((s) => s.stage.prospective_result_id)).toEqual([
      "independent-1",
    ]);
    await campaign.close();
  });

  it("stops an unlawful instantaneous NOW cycle — its component only — and nothing escapes it", async () => {
    const a = {
      stage: { ...PRODUCER_STAGE, prospective_result_id: "a-result" },
      reads: [
        {
          mode: "AS-OF-NOW" as const,
          source: { owner: "SYNTHETIC-STAGE-OWNER", fact_key: "synthetic/cycle/b" },
          invalidators: [],
        },
      ],
      produces: ["synthetic/cycle/a"],
      declares_close: { name: "a-close" }, // a close that is merely a prerequisite for a NOW read is still NOW
    };
    const b = {
      stage: { ...CONSUMER_STAGE, prospective_result_id: "b-result" },
      reads: [
        {
          mode: "AS-OF-NOW" as const,
          source: { owner: "SYNTHETIC-STAGE-OWNER", fact_key: "synthetic/cycle/a" },
          invalidators: [],
        },
      ],
      produces: ["synthetic/cycle/b"],
      declares_close: null,
    };
    for (const variant of ["plain", "sliced", "far-horizon", "new-source-version"] as const) {
      const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
        objects: [replaceDeps([a, b, independent(1)])],
      });
      if (variant === "new-source-version") {
        await must(
          campaign.store.commit(syntheticSourceGroup(FIXTURE_CAMPAIGN, 3, "source-v2", 1)),
        );
      }
      const target = variant === "far-horizon" ? at(10_000) : T1;
      const r = await must(
        coordinator.advance(
          stopAtBoundaryRequest("tx-1", { requested: { target, condition: null } }),
          variant === "sliced" ? { slices: [at(110), at(120), at(130)] } : {},
        ),
      );
      const out = r.transaction.outcome;
      expect(out.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
      expect(
        out.unresolved_dependents.map((u) => [u.stage.prospective_result_id, u.reason]).sort(),
      ).toEqual([
        ["a-result", "INSTANTANEOUS_CYCLE"],
        ["b-result", "INSTANTANEOUS_CYCLE"],
      ]);
      // independent lawful work remained eligible and committed
      expect(r.transaction.stages.map((s) => s.stage.prospective_result_id)).toEqual([
        "independent-1",
      ]);
      // time reached the boundary but no further, and the remainder is preserved
      expect(out.actual_stop).toEqual(TB);
      expect(out.remainder).toEqual({ from: TB, to: target });
      expect(coordinator.state()!.value.continuation?.unresolved_dependents).toHaveLength(2);
      expect(campaign.store.getFact("synthetic/cycle/a")).toBeUndefined();
      expect(campaign.verify()).toEqual([]);
      await campaign.close();
    }
  });

  it("stops a stage whose owner operation has no registered adapter; it never falls back to another owner", async () => {
    const orphan = {
      ...independent(1),
      stage: {
        ...independent(1).stage,
        owner_operation: { owner: "SYNTHETIC-STAGE-OWNER", operation: "no-such-operation" },
      },
    };
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [replaceDeps([P!, C!, orphan])],
    });
    const r = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(r.transaction.outcome.unresolved_dependents).toEqual([
      { stage: orphan.stage, reason: "PROVIDER_ABSENT" },
    ]);
    expect(r.transaction.stages.map((s) => s.stage)).toEqual([PRODUCER_STAGE, CONSUMER_STAGE]);
    await campaign.close();
  });

  it("a staged group IM-11 rejects is not credited; dependents wait and independent work proceeds", async () => {
    // a stage writing outside the synthetic key space is rejected at validation by the owner's admission
    const badProducer = { ...P!, produces: ["not-synthetic/key"] };
    const { campaign } = await seededTemporalCampaign(tempDir(), {
      objects: [replaceDeps([badProducer, independent(1)])],
    });
    // (the provider writes its declared key; admission refuses the key space)
    const c = new TemporalCoordinator(campaign.store, {
      find: (owner: string, operation: string) =>
        operation === "synthetic-produce"
          ? {
              ...syntheticProviders().find(owner, operation)!,
              compute: () => [
                {
                  key: "not-synthetic/key",
                  value: 1,
                  unit: null,
                  basis: "b",
                  secrecy: "s",
                },
              ],
            }
          : syntheticProviders().find(owner, operation),
    } as never);
    const r = await must(c.advance(stopAtBoundaryRequest("tx-1")));
    expect(r.rejections).toEqual([{ stage: PRODUCER_STAGE, code: "KEY_NOT_ADMITTED" }]);
    expect(r.transaction.outcome.unresolved_dependents).toEqual([
      { stage: PRODUCER_STAGE, reason: "VALIDATION_REJECTED" },
    ]);
    expect(r.transaction.stages.map((s) => s.stage.prospective_result_id)).toEqual([
      "independent-1",
    ]);
    await campaign.close();
  });

  it("refuses an owner operation that writes anything but the facts its declaration produces", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    const c = new TemporalCoordinator(campaign.store, {
      find: (owner: string, operation: string) => ({
        ...syntheticProviders().find(owner, operation)!,
        compute: () => [{ key: "synthetic/extra", value: 1, unit: null, basis: "b", secrecy: "s" }],
      }),
    } as never);
    expect(await codeOf(c.advance(stopAtBoundaryRequest("tx-1")))).toBe("STAGE_OUTPUT_MISMATCH");
    expect(coordinator.transaction("tx-1")).toBeUndefined();
    await campaign.close();
  });

  it("retrying a transaction that stopped unresolved resumes it: committed stages are adopted, never recreated", async () => {
    const bad = {
      ...C!,
      reads: [{ ...C!.reads[0]!, close_basis: closeBasis("undeclared") }],
    } as typeof C;
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [replaceDeps([P!, bad!])],
    });
    const r1 = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(r1.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    const producerGroup = campaign.store.getFact(SYNTH_PRODUCER_RESULT_KEY)!;
    // a later source version appears: the committed producer cause must not be recomputed under it
    await must(campaign.store.commit(syntheticSourceGroup(FIXTURE_CAMPAIGN, 3, "source-v2", 1)));
    // the next transaction opens where the last stopped; the producer is adopted from the journal
    const r2 = await must(
      coordinator.advance(
        stopAtBoundaryRequest("tx-2", {
          continues: "tx-1", // the held continuation is consumed, never abandoned
          requested: { target: T1, condition: null },
        }),
      ),
    );
    expect(r2.adopted).toEqual([PRODUCER_STAGE]);
    expect(r2.transaction.opening.basis_time).toEqual(TB);
    expect(campaign.store.getFact(SYNTH_PRODUCER_RESULT_KEY)).toEqual(producerGroup); // not re-published
    expect(r2.recomputed_in_place).toEqual([]);
    // the evidence still reports the source version the committed stage ACTUALLY read, not the newer one
    const adopted = r2.transaction.stages.find(
      (x) => x.stage.owner_operation.operation === "synthetic-produce",
    )!;
    expect(adopted.reads[1]).toMatchObject({ source_basis: { version: 1 } });
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });
});
