/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Named-Actor Character Capability & Capability-Close Backbone Foundation — "a consequential non-PC Named Actor's
// materially required durable personal mastery is established from committed causal inputs, sealed BEFORE the dependent
// consequence, published at the Named-Actor owner's declared capability close, and read by the consequence
// AS-OF-DECLARED-CLOSE — all under the existing IM-02 transaction machinery."
// Register lineage: IA-01/02/03/04 (partial), IA-14 (partial), IA-22 (reused / partial); RC-02/03/04/05/16;
// IM-02, IM-03, IM-07, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-016 and WS-006.
// CAL-01 stays UNCALIBRATED (EXACT only). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  actorCapabilityBasisKey,
  actorCapabilityKey,
  actorCapabilityStage,
  populationLedgerKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  NAMED_ACTOR_RULE,
  PopulationAdapter,
  TemporalCoordinator,
  deriveCapability,
  stageGroupId,
  stageIntentId,
} from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_COMMAND,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  actorProviders,
  actorPublication,
  at,
  capabilityBasis,
  capabilityConsumerObject,
  consumerAdvanceRequest,
  continuationInput,
  consumerResultKey,
  historyKey,
  ledgerInput,
  popPublication,
  temporalPublication,
} from "@immortalis/testkit";
import {
  actorSummary,
  establishBasis,
  registerConsumer,
  seededActorCampaign,
  type ActorSeeded,
} from "../support/actor.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const capKey = actorCapabilityKey(A, C);
const basisKey = actorCapabilityBasisKey(A, C);
const stage = actorCapabilityStage(A, C);
const advance = (s: ActorSeeded, id = "tx-1", consumer = "c1") =>
  s.coordinator.advance(consumerAdvanceRequest(id, consumer));

describe("a Named Actor's material capability: establishment, close and consumption (acceptance 1, 3, 4)", () => {
  it("a sealed basis alone is no capability: nothing is visible at any close, and nothing is derived from a need", async () => {
    const s = await seededActorCampaign(tempDir());
    await establishBasis(s, 1);
    const basis = s.actors.basis(A, C)!;
    expect(basis.fact).toMatchObject({ owner: "named_actor", facet: "actor_profile", version: 1 });
    expect(basis.fact.provenance.rule).toEqual(NAMED_ACTOR_RULE);
    // the capability exists only at the owner's close
    expect(s.actors.capability(A, C)).toBeUndefined();
    expect(s.campaign.store.getFact(capKey)).toBeUndefined();
    // registering the dependent consequence resolves nothing either
    await registerConsumer(s, "c1", basis.value, 2);
    expect(s.actors.capability(A, C)).toBeUndefined();
    expect(s.campaign.store.getFact(consumerResultKey("c1"))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the close commits the capability BEFORE the consequence consumes it, which reads it AS-OF-DECLARED-CLOSE", async () => {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishBasis(s, 1);
    await registerConsumer(s, "c1", basis, 2);
    const r = await must(advance(s));
    expect(r.transaction.outcome).toMatchObject({
      stop_reason: "CONDITION_SATISFIED",
      unresolved_dependents: [],
    });
    // stage order: the actor owner's close first, the dependent consumer second
    const stages = r.transaction.stages;
    expect(stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "named_actor",
      "SYNTHETIC-CAPABILITY-CONSUMER",
    ]);
    expect(stages[0]!.stage).toEqual(stage);
    expect(stages[0]!.group_id).toBe(stageGroupId(stage));
    expect(stages[0]!.revision).toBeLessThan(stages[1]!.revision);
    // the consumer's realized read is a CLOSE read of exactly that close
    const read = stages[1]!.reads[0]!;
    expect(read).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: "named_actor", fact_key: capKey },
      close_basis: {
        name: "actor-profile-capability-close",
        producer: { owner: "named_actor", operation: "named-actor-publish-capability-close" },
      },
      source_basis: { version: 1, committed_by: stageGroupId(stage) },
    });
    // the capability is exactly what the basis determines, owned by the Named-Actor owner/facet under its rule
    const cap = s.actors.capability(A, C)!;
    const derived = deriveCapability({
      key: basisKey,
      owner: "named_actor",
      version: 1,
      value: basis,
    });
    expect(derived.ok && cap.value).toEqual(derived.ok && derived.value);
    expect(cap.fact).toMatchObject({
      owner: "named_actor",
      facet: "actor_profile",
      version: 1,
      unit: null,
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
    });
    expect(cap.fact.provenance).toMatchObject({
      group_id: stageGroupId(stage),
      intent_id: stageIntentId(stage),
      cause: "transaction:tx-1",
      rule: NAMED_ACTOR_RULE,
    });
    expect(cap.close_group).toBe(stageGroupId(stage));
    // the consequence observed that close, and only the qualitative marker
    expect(s.campaign.store.getFact(consumerResultKey("c1"))!.value).toEqual({
      observed_actor: A,
      observed_capability: C,
      observed_marker: "C",
      observed_close_group: stageGroupId(stage),
    });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("every marker form reaches the consumer unchanged — C, B, A, S, EX with its descriptor, and ungraded — with no conversion", async () => {
    const s = await seededActorCampaign(tempDir());
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
      const basis = await establishBasis(s, n, A, cap, { marker });
      await registerConsumer(s, `m-${cap}`, basis, 100 + n++);
    }
    await must(advance(s, "tx-markers", "m-cap-c"));
    for (const [cap, marker] of markers) {
      expect(s.actors.capability(A, cap)!.value.marker).toEqual(marker);
      expect(
        (s.campaign.store.getFact(consumerResultKey(`m-${cap}`))!.value as any).observed_marker,
      ).toEqual(marker);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a later consequence of the same actor/capability reads the SAME close: adopted by identity, never duplicated or re-established", async () => {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishBasis(s, 1);
    await registerConsumer(s, "c1", basis, 2);
    await must(advance(s));
    const closeRevision = s.campaign.store.lookupReceipt(stageIntentId(stage))!.revision;
    const first = s.campaign.store.getFact(capKey)!;
    // a second, later consequence declares the same close stage in its own object
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(50),
        object: capabilityConsumerObject("c2", basis, {
          last_resolved_basis: at(140),
          next_boundary: { boundary_id: "boundary-c2", at: at(170) },
        }),
      }),
    );
    const spy = spyStore(s.campaign.store);
    const again = new TemporalCoordinator(spy.store, actorProviders());
    const r = await must(again.continueRemainder(continuationInput("tx-2")));
    expect(r.adopted).toEqual([stage]);
    expect(r.recomputed_in_place).toEqual([]);
    // nothing of the Named-Actor owner was written again
    expect(spy.commits.flatMap((g) => g.writes.map((w) => w.key))).not.toContain(capKey);
    expect(s.campaign.store.getFact(capKey)).toEqual(first);
    expect(s.campaign.store.lookupReceipt(stageIntentId(stage))!.revision).toBe(closeRevision);
    // and the second consumer read exactly the first close
    expect(
      (s.campaign.store.getFact(consumerResultKey("c2"))!.value as any).observed_close_group,
    ).toBe(stageGroupId(stage));
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the capability is sparse: it holds nothing of the actor's body, equipment, condition, office, KTI, beliefs or any number", async () => {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishBasis(s, 1);
    await registerConsumer(s, "c1", basis, 2);
    await must(advance(s));
    const v = s.actors.capability(A, C)!.value as any;
    expect(Object.keys(v).sort()).toEqual([
      "actor_id",
      "basis",
      "capability_id",
      "close",
      "marker",
    ]);
    const text = JSON.stringify(v);
    expect(text).not.toMatch(
      /equipment|injury|fatigue|office|reputation|belief|kti|body|cohort|level|xp/i,
    );
    expect(JSON.stringify(Object.values(v).filter((x) => typeof x === "number"))).toBe("[]");
  });
});

describe("two consequences due at the same instant share one capability close (acceptance 4, 8)", () => {
  it("one engaged object declares the close; the other reads it AS-OF-DECLARED-CLOSE without a second stage — both resolve against the one close", async () => {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishBasis(s, 1);
    await registerConsumer(s, "c1", basis, 2);
    const readerOnly = capabilityConsumerObject("c-reader", basis, {
      dependencies: [capabilityConsumerObject("c-reader", basis).dependencies[1]!],
    });
    await must(s.coordinator.registerObject({ ...temporalPublication(3), object: readerOnly }));
    const r = await must(advance(s));
    expect(r.transaction.outcome.unresolved_dependents).toEqual([]);
    expect(
      r.transaction.stages.filter((x) => x.stage.owner_operation.owner === "named_actor"),
    ).toHaveLength(1);
    const observed = (id: string) =>
      (s.campaign.store.getFact(consumerResultKey(id))!.value as any).observed_close_group;
    expect(observed("c1")).toBe(stageGroupId(stage));
    expect(observed("c-reader")).toBe(stageGroupId(stage));
    expect(s.actors.capability(A, C)!.fact.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a second object due at the same instant that declares the same close is refused at registration: a stage is declared by exactly one engaged object", async () => {
    const s = await seededActorCampaign(tempDir());
    const basis = await establishBasis(s, 1);
    await registerConsumer(s, "c1", basis, 2);
    const r = await s.coordinator.registerObject({
      ...temporalPublication(3),
      object: capabilityConsumerObject("c2", basis),
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/exactly one engaged object per instant/);
    // at another instant the same close is declared again and adopted by identity (no clash)
    const later = await s.coordinator.registerObject({
      ...temporalPublication(4),
      object: capabilityConsumerObject("c3", basis, {
        next_boundary: { boundary_id: "boundary-c3", at: at(170) },
      }),
    });
    expect(later.ok).toBe(true);
  });
});

describe("Named-Actor establishment never reaches Population or any aggregate (acceptance 6)", () => {
  it("publishing an individual's capability leaves a Population ledger byte-identical and writes only Named-Actor keys", async () => {
    const s = await seededActorCampaign(tempDir());
    const pop = new PopulationAdapter(s.campaign.store);
    await must(pop.establishLedger({ ...popPublication(1), ledger: ledgerInput() }));
    const ledgerBefore = structuredClone(
      s.campaign.store.getFact(populationLedgerKey("ledger-main"))!,
    );
    const populationBefore = s.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("population/"));
    const basis = await establishBasis(s, 1);
    await registerConsumer(s, "c1", basis, 2);
    const spy = spyStore(s.campaign.store);
    await must(
      new TemporalCoordinator(spy.store, actorProviders()).advance(
        consumerAdvanceRequest("tx-1", "c1"),
      ),
    );
    const actorGroup = spy.commits.find((g: CommitGroup) => g.owner === "named_actor")!;
    expect(actorGroup.writes.map((w) => w.key)).toEqual([capKey]);
    expect(s.campaign.store.getFact(populationLedgerKey("ledger-main"))).toEqual(ledgerBefore);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("population/"))).toEqual(
      populationBefore,
    );
    // no population unit, cohort or count was created for the actor
    expect(
      JSON.stringify(s.campaign.store.listFacts().filter((f) => f.key.startsWith("population/"))),
    ).not.toContain(A);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("bounded runtime cost: only the causally engaged actor/capability is touched (acceptance 11)", () => {
  it("resolving one actor's capability reads and writes nothing of an unrelated actor, and scans nothing", async () => {
    const s = await seededActorCampaign(tempDir());
    // an unrelated actor with its own committed basis and a dormant dependent object (no earned boundary: never engaged)
    const otherBasis = await establishBasis(s, 2, ACTOR_OTHER, CAP_COMMAND);
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(60),
        object: capabilityConsumerObject("dormant", otherBasis, { next_boundary: null }),
      }),
    );
    const basis = await establishBasis(s, 1, ACTOR_SWORD, CAP_SWORDSMANSHIP);
    await registerConsumer(s, "c1", basis, 2);
    const unrelated = s.campaign.store
      .listFacts()
      .filter((f) => f.key.includes(ACTOR_OTHER) || f.key.includes("dormant"));
    expect(unrelated.length).toBeGreaterThan(0);
    const spy = spyStore(s.campaign.store);
    await must(
      new TemporalCoordinator(spy.store, actorProviders()).advance(
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
    expect(read.has(actorCapabilityBasisKey(ACTOR_SWORD, CAP_SWORDSMANSHIP))).toBe(true);
    expect(read.has(historyKey(`${ACTOR_OTHER}-biography`))).toBe(false);
    expect(s.actors.capability(ACTOR_OTHER, CAP_COMMAND)).toBeUndefined();
    expect(s.actors.capability(ACTOR_SWORD, CAP_SWORDSMANSHIP)).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("there is no tick, sweep or standing object: with no consequence engaged, no capability close is ever resolved", async () => {
    const s = await seededActorCampaign(tempDir());
    for (const [i, actor] of [A, ACTOR_SWORD, ACTOR_OTHER].entries())
      await must(
        s.actors.establishCapabilityBasis({
          ...actorPublication(i + 1),
          capability: capabilityBasis(actor, C),
        }),
      );
    const before = actorSummary(s.campaign, s.coordinator);
    // time advances to a far target with nothing earned: nothing is resolved, no capability appears
    await must(
      s.coordinator.advance({
        ...consumerAdvanceRequest("tx-idle", "none"),
        requested: { target: at(200), condition: null },
      }),
    );
    const after = actorSummary(s.campaign, s.coordinator);
    expect(after.actor).toEqual(before.actor);
    for (const actor of [A, ACTOR_SWORD, ACTOR_OTHER])
      expect(s.actors.capability(actor, C)).toBeUndefined();
  });
});
