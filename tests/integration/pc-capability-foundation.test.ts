/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// I-002 PC Capability Profile / PC Capability Close Receiving Foundation — "an already-lawfully-established PC durable
// personal mastery fact is received and persisted by the one PC owner, sealed BEFORE the dependent consequence, published
// at the PC Capability Close, and read by the consequence AS-OF-DECLARED-CLOSE — all under the existing IM-02 transaction
// machinery."
// Register lineage: IA-01/02/03/04 (partial), IA-14 (partial), IA-22 (reused / partial); RC-02/03/04/05/16;
// IM-02, IM-03, IM-07, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-016 (with the
// Blue Bounded Integration Map §2 I-002 amendment), I-002, F-016 PCC-01 to PCC-03.
// CAL-01 stays UNCALIBRATED (EXACT only). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcCapabilityStage,
  pcExistenceContractKey,
  populationLedgerKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  PC_CAPABILITY_RULE,
  PopulationAdapter,
  TemporalCoordinator,
  derivePcCapability,
  stageGroupId,
  stageIntentId,
} from "@immortalis/engine";
import {
  CAP_LOCKSMITHING,
  CAP_NAVIGATION,
  CAP_SAILING,
  FIXTURE_PC_ID,
  at,
  consumerAdvanceRequest,
  consumerResultKey,
  continuationInput,
  ledgerInput,
  pcCapabilityConsumerObject,
  pcCapabilityProviders,
  popPublication,
  temporalPublication,
} from "@immortalis/testkit";
import {
  pcCapabilitySummary,
  receiveBasis,
  registerPcConsumer,
  seededPcCapabilityCampaign,
  type PcCapabilitySeeded,
} from "../support/pc-capability.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const P = FIXTURE_PC_ID;
const C = CAP_SAILING;
const capKey = pcCapabilityKey(P, C);
const basisKey = pcCapabilityBasisKey(P, C);
const stage = pcCapabilityStage(P, C);
const advance = (s: PcCapabilitySeeded, id = "tx-1", consumer = "c1") =>
  s.coordinator.advance(consumerAdvanceRequest(id, consumer));

describe("a PC's received capability: persistence, close and consumption", () => {
  it("a received basis alone is no capability: nothing is visible at any close, and nothing is derived from a need", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    await receiveBasis(s, 1);
    const basis = s.pcs.basis(P, C)!;
    expect(basis.fact).toMatchObject({
      owner: "pc_existence",
      facet: "pc_capability_profile",
      version: 1,
    });
    expect(basis.fact.provenance.rule).toEqual(PC_CAPABILITY_RULE);
    // the capability exists only at the PC Capability Close
    expect(s.pcs.capability(P, C)).toBeUndefined();
    expect(s.campaign.store.getFact(capKey)).toBeUndefined();
    // registering the dependent consequence resolves nothing either
    await registerPcConsumer(s, "c1", basis.value, 2);
    expect(s.pcs.capability(P, C)).toBeUndefined();
    expect(s.campaign.store.getFact(consumerResultKey("c1"))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the PC Capability Close commits the capability BEFORE the consequence consumes it, which reads it AS-OF-DECLARED-CLOSE", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    const r = await must(advance(s));
    expect(r.transaction.outcome).toMatchObject({
      stop_reason: "CONDITION_SATISFIED",
      unresolved_dependents: [],
    });
    // stage order: the PC owner's close first, the dependent consumer second
    const stages = r.transaction.stages;
    expect(stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "pc_existence",
      "SYNTHETIC-CAPABILITY-CONSUMER",
    ]);
    expect(stages[0]!.stage).toEqual(stage);
    expect(stages[0]!.group_id).toBe(stageGroupId(stage));
    expect(stages[0]!.revision).toBeLessThan(stages[1]!.revision);
    // the consumer's realized read is a CLOSE read of exactly that close, named by the literal F-016 PCC-02 Close Basis
    expect(stages[1]!.reads[0]!).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: "pc_existence", fact_key: capKey },
      close_basis: {
        name: "PC Capability Close",
        producer: { owner: "pc_existence", operation: "pc-publish-capability-close" },
      },
      source_basis: { version: 1, committed_by: stageGroupId(stage) },
    });
    // the capability is exactly what the basis determines, owned by the one PC owner's capability facet under its rule
    const cap = s.pcs.capability(P, C)!;
    const derived = derivePcCapability({
      key: basisKey,
      owner: "pc_existence",
      version: 1,
      value: basis,
    });
    expect(derived.ok && cap.value).toEqual(derived.ok && derived.value);
    expect(cap.fact).toMatchObject({
      owner: "pc_existence",
      facet: "pc_capability_profile",
      version: 1,
      unit: null,
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
    });
    expect(cap.fact.provenance).toMatchObject({
      group_id: stageGroupId(stage),
      intent_id: stageIntentId(stage),
      cause: "transaction:tx-1",
      rule: PC_CAPABILITY_RULE,
    });
    expect(cap.close_group).toBe(stageGroupId(stage));
    // the consequence observed that close, and only the qualitative marker
    expect(s.campaign.store.getFact(consumerResultKey("c1"))!.value).toEqual({
      observed_pc: P,
      observed_capability: C,
      observed_marker: "C",
      observed_close_group: stageGroupId(stage),
    });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("every marker form reaches the consumer unchanged — C, B, A, S, EX with its descriptor, and ungraded — with no conversion", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const markers = [
      ["cap-c", "C"],
      ["cap-b", "B"],
      ["cap-a", "A"],
      ["cap-s", "S"],
      ["cap-ex", { ex: "SYNTHETIC FIXTURE: a causal descriptor" }],
      ["cap-none", null],
    ] as const;
    let n = 1;
    for (const [cap, marker] of markers) {
      const basis = await receiveBasis(s, n, P, cap, { marker });
      await registerPcConsumer(s, `m-${cap}`, basis, 100 + n++);
    }
    await must(advance(s, "tx-markers", "m-cap-c"));
    for (const [cap, marker] of markers) {
      expect(s.pcs.capability(P, cap)!.value.marker).toEqual(marker);
      expect(
        (s.campaign.store.getFact(consumerResultKey(`m-${cap}`))!.value as any).observed_marker,
      ).toEqual(marker);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a later consequence of the same PC/capability reads the SAME close: adopted by identity, never duplicated or re-published", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    await must(advance(s));
    const closeRevision = s.campaign.store.lookupReceipt(stageIntentId(stage))!.revision;
    const first = s.campaign.store.getFact(capKey)!;
    // a second, later consequence declares the same close stage in its own object
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(50),
        object: pcCapabilityConsumerObject("c2", basis, {
          last_resolved_basis: at(140),
          next_boundary: { boundary_id: "boundary-c2", at: at(170) },
        }),
      }),
    );
    const spy = spyStore(s.campaign.store);
    const again = new TemporalCoordinator(spy.store, pcCapabilityProviders());
    const r = await must(again.continueRemainder(continuationInput("tx-2")));
    expect(r.adopted).toEqual([stage]);
    expect(r.recomputed_in_place).toEqual([]);
    // nothing of the PC capability facet was written again
    expect(spy.commits.flatMap((g) => g.writes.map((w) => w.key))).not.toContain(capKey);
    expect(s.campaign.store.getFact(capKey)).toEqual(first);
    expect(s.campaign.store.lookupReceipt(stageIntentId(stage))!.revision).toBe(closeRevision);
    // and the second consumer read exactly the first close
    expect(
      (s.campaign.store.getFact(consumerResultKey("c2"))!.value as any).observed_close_group,
    ).toBe(stageGroupId(stage));
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the capability is sparse: it holds nothing of the PC's body, equipment, condition, office, KTI, beliefs, transcript or any number", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    await must(advance(s));
    const v = s.pcs.capability(P, C)!.value as any;
    expect(Object.keys(v).sort()).toEqual(["basis", "capability_id", "close", "marker", "pc_id"]);
    const text = JSON.stringify(v);
    expect(text).not.toMatch(
      /equipment|injury|fatigue|office|reputation|belief|kti|body|cohort|level|xp|transcript|SYNTHETIC FIXTURE/i,
    );
    expect(JSON.stringify(Object.values(v).filter((x) => typeof x === "number"))).toBe("[]");
    // the received basis points at accepted claims; it copies none of their wording
    const b = s.pcs.basis(P, C)!.value as any;
    expect(Object.keys(b).sort()).toEqual(["capability_id", "establishment", "marker", "pc_id"]);
    expect(JSON.stringify(b)).not.toMatch(/seafaring|SYNTHETIC FIXTURE/);
  });

  it("the Existence Contract is untouched: the PC owner keeps one contract and the capability is a companion, not an amendment", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const contractBefore = structuredClone(s.campaign.store.getFact(pcExistenceContractKey(P))!);
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    await must(advance(s));
    expect(s.campaign.store.getFact(pcExistenceContractKey(P))).toEqual(contractBefore);
    expect(s.campaign.store.getFact(pcExistenceContractKey(P))!.version).toBe(1);
    const owners = new Set(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("pc/"))
        .map((f) => f.owner),
    );
    expect([...owners]).toEqual(["pc_existence"]);
  });
});

describe("two consequences due at the same instant share one PC Capability Close", () => {
  it("one engaged object declares the close; the other reads it AS-OF-DECLARED-CLOSE without a second stage — both resolve against the one close", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    const readerOnly = pcCapabilityConsumerObject("c-reader", basis, {
      dependencies: [pcCapabilityConsumerObject("c-reader", basis).dependencies[1]!],
    });
    await must(s.coordinator.registerObject({ ...temporalPublication(3), object: readerOnly }));
    const r = await must(advance(s));
    expect(r.transaction.outcome.unresolved_dependents).toEqual([]);
    expect(
      r.transaction.stages.filter((x) => x.stage.owner_operation.owner === "pc_existence"),
    ).toHaveLength(1);
    const observed = (id: string) =>
      (s.campaign.store.getFact(consumerResultKey(id))!.value as any).observed_close_group;
    expect(observed("c1")).toBe(stageGroupId(stage));
    expect(observed("c-reader")).toBe(stageGroupId(stage));
    expect(s.pcs.capability(P, C)!.fact.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a second object due at the same instant that declares the same close is refused at registration: a stage is declared by exactly one engaged object", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    const r = await s.coordinator.registerObject({
      ...temporalPublication(3),
      object: pcCapabilityConsumerObject("c2", basis),
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/exactly one engaged object per instant/);
    // at another instant the same close is declared again and adopted by identity (no clash)
    const later = await s.coordinator.registerObject({
      ...temporalPublication(4),
      object: pcCapabilityConsumerObject("c3", basis, {
        next_boundary: { boundary_id: "boundary-c3", at: at(170) },
      }),
    });
    expect(later.ok).toBe(true);
  });
});

describe("PC capability never reaches Population or any aggregate", () => {
  it("publishing a PC capability leaves a Population ledger byte-identical and writes only PC capability keys", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const pop = new PopulationAdapter(s.campaign.store);
    await must(pop.establishLedger({ ...popPublication(1), ledger: ledgerInput() }));
    const ledgerBefore = structuredClone(
      s.campaign.store.getFact(populationLedgerKey("ledger-main"))!,
    );
    const populationBefore = s.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("population/"));
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    const spy = spyStore(s.campaign.store);
    await must(
      new TemporalCoordinator(spy.store, pcCapabilityProviders()).advance(
        consumerAdvanceRequest("tx-1", "c1"),
      ),
    );
    const pcGroup = spy.commits.find((g: CommitGroup) => g.owner === "pc_existence")!;
    expect(pcGroup.facet).toBe("pc_capability_profile");
    expect(pcGroup.writes.map((w) => w.key)).toEqual([capKey]);
    expect(s.campaign.store.getFact(populationLedgerKey("ledger-main"))).toEqual(ledgerBefore);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("population/"))).toEqual(
      populationBefore,
    );
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("bounded runtime cost: only the causally engaged PC capability is touched", () => {
  it("resolving one capability reads and writes nothing of another capability, and scans nothing", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    // an unrelated capability with its own committed basis and a dormant dependent object (no earned boundary: never engaged)
    const otherBasis = await receiveBasis(s, 2, P, CAP_LOCKSMITHING, {
      establishment: {
        method: "ACCEPTED_GENERATION_HISTORY",
        contract: { fact_key: pcExistenceContractKey(P), version: 1 },
        claims: [{ section: "baseline_exception.player_overrides", index: 1 }],
      },
    });
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(60),
        object: pcCapabilityConsumerObject("dormant", otherBasis, { next_boundary: null }),
      }),
    );
    const basis = await receiveBasis(s, 1, P, CAP_NAVIGATION);
    await registerPcConsumer(s, "c1", basis, 2);
    const unrelated = s.campaign.store
      .listFacts()
      .filter((f) => f.key.includes(CAP_LOCKSMITHING) || f.key.includes("dormant"));
    expect(unrelated.length).toBeGreaterThan(0);
    const spy = spyStore(s.campaign.store);
    await must(
      new TemporalCoordinator(spy.store, pcCapabilityProviders()).advance(
        consumerAdvanceRequest("tx-1", "c1"),
      ),
    );
    expect(spy.listCalls()).toBe(0);
    const read = new Set(spy.getFacts);
    for (const f of unrelated) {
      expect(read.has(f.key), f.key).toBe(false);
      expect(s.campaign.store.getFact(f.key)).toEqual(f);
    }
    for (const g of spy.commits)
      for (const w of g.writes) expect(unrelated.some((f) => f.key === w.key)).toBe(false);
    expect(read.has(pcCapabilityBasisKey(P, CAP_NAVIGATION))).toBe(true);
    expect(s.pcs.capability(P, CAP_LOCKSMITHING)).toBeUndefined();
    expect(s.pcs.capability(P, CAP_NAVIGATION)).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("there is no tick, sweep or standing object: with no consequence engaged, no PC Capability Close is ever resolved", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    for (const [i, cap] of [CAP_SAILING, CAP_NAVIGATION].entries())
      await receiveBasis(s, i + 1, P, cap);
    const before = pcCapabilitySummary(s.campaign, s.coordinator);
    // time advances to a far target with nothing earned: nothing is resolved, no capability appears
    await must(
      s.coordinator.advance({
        ...consumerAdvanceRequest("tx-idle", "none"),
        requested: { target: at(200), condition: null },
      }),
    );
    const after = pcCapabilitySummary(s.campaign, s.coordinator);
    expect(after.capability).toEqual(before.capability);
    for (const cap of [CAP_SAILING, CAP_NAVIGATION])
      expect(s.pcs.capability(P, cap)).toBeUndefined();
  });
});
