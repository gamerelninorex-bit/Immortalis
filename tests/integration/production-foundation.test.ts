/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and process output */
// Production & Resource Conservation Backbone Foundation — "the canonical campaign can establish an exact
// local Production Reserve, start one bounded operation that claims exactly the material it needs, reach its
// exact completion boundary through the existing IM-02 kernel, complete one durable on one conserved output
// reference, have the World-State fallback custodian accept that same reference exactly once, and — across
// save, close and load — continue without duplicate consumption, output, completion or acceptance."
// Register lineage: IA-01/02/03/04 (partial), IA-05 (bounded RC-06 partial), IA-06/IA-22/IA-30 (reused /
// partial); RC-02/06/07/10/16; IM-02, IM-03, IM-05, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json
// (F-027 v1.0). CAL-01 stays UNCALIBRATED (EXACT only), CAL-02/L-50 stays OPEN (no labor path), CAL-03 has no
// adopted number. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TEMPORAL_STATE_KEY,
  productionClaimKey,
  productionCompletionKey,
  productionOperationKey,
  productionReserveKey,
  temporalObjectKey,
  worldFallbackEntityKey,
} from "@immortalis/contracts";
import {
  ProductionAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  productionCompletionProvider,
  productionTemporalObject,
  stageGroupId,
  stageIntentId,
} from "@immortalis/engine";
import {
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  MATERIAL_UNIT,
  OUTPUT_CLASS,
  OUTPUT_UNIT,
  PROD_T0,
  PROD_T1,
  PROD_TC,
  PROD_TC_OTHER,
  REQ_1,
  REQ_2,
  REQ_OTHER,
  RESERVE_MAIN,
  RESERVE_OTHER,
  prodAdvanceRequest,
  prodPublication,
  productionProviders,
  startInput,
  at,
  continuationInput,
  prodStopAtBoundaryRequest,
  temporalPublication,
} from "@immortalis/testkit";
import {
  prodCoordinator,
  prodSummary,
  registerOperation,
  reopenProduction,
  seededProductionCampaign,
  startAndRegister,
} from "../support/production.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const OP_COMPLETE = "production-complete-operation";
const OP_ACCEPT = "world-state-accept-fallback-durable";
const entityKey = (opId: string) => worldFallbackEntityKey(FIXTURE_WORLD_ID, `durable:${opId}`);

describe("an exact local Reserve and one bounded Production operation (WS-003 §§2-4, 8, 14)", () => {
  it("establishes an exact Reserve attached to the canonical locus, conserved by construction", async () => {
    const s = await seededProductionCampaign(tempDir());
    const r = s.production.reserve(RESERVE_MAIN)!;
    expect(r.value).toMatchObject({
      established: { amount: 10, unit: MATERIAL_UNIT },
      quantity: { amount: 10, unit: MATERIAL_UNIT },
      consumed: [],
      claims: [],
      holding: "HELD_LOCAL_BY_PRODUCTION",
    });
    expect(r.value.locality.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    expect(r.fact.owner).toBe("production");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("starting an operation publishes the operation, its RC-06 claim and the Reserve's open-claim entry together, on a pinned request", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const op = s.production.operation(REQ_1)!.value;
    const claim = s.production.claim(`claim:${REQ_1}`)!;
    expect(op.status).toEqual({ state: "IN_PROGRESS" });
    expect(op.support_basis).toEqual({
      tier: "TIER_A_EMBEDDED_BASELINE",
      labor: "NON_MATERIAL_EMBEDDED",
      specialist_competence: "NON_MATERIAL",
    });
    expect(op.timing).toEqual({
      started_at: PROD_T0,
      completion: { boundary_id: `boundary-production-completion-${REQ_1}`, at: PROD_TC },
    });
    expect(claim.value).toMatchObject({
      quantity: { amount: 6, unit: MATERIAL_UNIT },
      priority_basis: null,
      lifecycle: { status: "ACTIVE" },
      overlap_basis: "SAME_RESERVE_QUANTITY_UNTIL_CONSUMED",
      interval: { from: PROD_T0, until: PROD_TC },
    });
    // one atomic group: operation, claim and the Reserve entry share it
    const reserve = s.production.reserve(RESERVE_MAIN)!;
    expect(reserve.value.claims).toEqual([`claim:${REQ_1}`]);
    expect(reserve.value.quantity.amount).toBe(10); // a claim is not consumption
    expect(s.production.operation(REQ_1)!.fact.provenance.group_id).toBe(
      claim.fact.provenance.group_id,
    );
    expect(reserve.fact.provenance.group_id).toBe(claim.fact.provenance.group_id);
    // the request is pinned (foreign, referenced), never copied
    expect(op.request).toMatchObject({ owner: "SYNTHETIC-PRODUCTION-REQUESTER", version: 1 });
    expect(JSON.stringify(op)).not.toContain("synthetic-cause");
    // exactly one earned boundary is indexed, for this operation
    expect(s.coordinator.boundaryIndex().entries).toEqual([
      {
        object_id: `obj-production-${REQ_1}`,
        boundary_id: `boundary-production-completion-${REQ_1}`,
        at: PROD_TC,
      },
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("completes at the declared boundary: input consumed once, one durable on one conserved reference, accepted once (CG-2)", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const r = await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const t = r.transaction;
    expect(t.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(t.engaged.map((e) => e.boundary)).toEqual(["RETIRED"]);
    expect(t.boundaries_crossed).toEqual([
      {
        object_id: `obj-production-${REQ_1}`,
        boundary_id: `boundary-production-completion-${REQ_1}`,
        at: PROD_TC,
      },
    ]);
    // CG-2 in order: Production completion, then the custodian's acceptance of the same reference
    expect(t.stages.map((x) => x.stage.owner_operation)).toEqual([
      { owner: "production", operation: OP_COMPLETE },
      { owner: "world_state", operation: OP_ACCEPT },
    ]);
    expect(t.stages[1]!.reads.map((x) => x.mode)).toEqual(["AS-OF-NOW", "AS-OF-NOW", "AS-OF-NOW"]);

    const reserve = s.production.reserve(RESERVE_MAIN)!.value;
    expect(reserve.quantity).toEqual({ amount: 4, unit: MATERIAL_UNIT });
    expect(reserve.consumed).toEqual([
      { operation_id: REQ_1, quantity: { amount: 6, unit: MATERIAL_UNIT } },
    ]);
    expect(reserve.claims).toEqual([]);
    // established = held + Σ consumed, exactly
    expect(reserve.established.amount).toBe(
      reserve.quantity.amount + reserve.consumed.reduce((n, c) => n + c.quantity.amount, 0),
    );
    expect(s.production.claim(`claim:${REQ_1}`)!.value.lifecycle).toMatchObject({
      status: "CONSUMED",
      at: PROD_TC,
    });
    expect(s.production.operation(REQ_1)!.value.status).toMatchObject({
      state: "COMPLETED",
      completed_at: PROD_TC,
    });

    const env = s.production.completion(REQ_1)!;
    expect(env.fact.version).toBe(1);
    expect(env.value).toMatchObject({
      conserved_reference: `durable:${REQ_1}`,
      completed: { output_class: OUTPUT_CLASS, quantity: { amount: 1, unit: OUTPUT_UNIT } },
      completed_at: PROD_TC, // the declared boundary, never the requested horizon
      destination_custodian: { owner: "world_state", entity_fact_key: entityKey(REQ_1) },
      delta: { before: { amount: 10 }, consumed: { amount: 6 }, after: { amount: 4 } },
    });
    // acceptance: the SAME reference, quantity, condition; World-State's own fact
    const entity = s.production.acceptedEntity(FIXTURE_WORLD_ID, `durable:${REQ_1}`)!;
    expect(entity.fact.owner).toBe("world_state");
    expect(entity.value).toMatchObject({
      entity_id: env.value.conserved_reference,
      quantity: env.value.completed.quantity,
      condition: env.value.completed.condition,
      accepted_from: { fact_key: productionCompletionKey(REQ_1), version: env.fact.version },
    });
    expect(s.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("holds no second physical truth: Production keeps no current output quantity; the one current quantity is World-State's", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const facts = s.campaign.store.listFacts();
    const holders = facts.filter(
      (f) => !f.key.startsWith("temporal/") && JSON.stringify(f.value).includes(`durable:${REQ_1}`),
    );
    // the conserved reference appears in: the operation (declared), the sealed completion (provenance), the
    // entity (current). Only the entity is a current physical state.
    expect(holders.map((f) => f.key).sort()).toEqual(
      [productionOperationKey(REQ_1), productionCompletionKey(REQ_1), entityKey(REQ_1)].sort(),
    );
    const production = facts.filter((f) => f.owner === "production");
    expect(production.every((f) => f.key !== entityKey(REQ_1))).toBe(true);
    // no Production Reserve holds the output class
    expect(
      production
        .filter((f) => f.key.startsWith("production/reserve/"))
        .every((f) => (f.value as any).material_class !== OUTPUT_CLASS),
    ).toBe(true);
    expect(s.campaign.store.getFact(productionCompletionKey(REQ_1))!.version).toBe(1); // sealed
  });
});

describe("RC-06 claims and exact conservation: no material ex nihilo, no second use, no invented priority", () => {
  it("an incompatible claim against already-committed material receives no credit and records nothing", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1); // holds 6 of 10
    const before = prodSummary(s.campaign, s.coordinator);
    const r = await s.production.startOperation({
      ...prodPublication(40),
      start: startInput(REQ_2, { input: 6 }), // 6 + 6 > 10
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("CLAIM_INCOMPATIBLE");
    // nothing credited, nothing recorded: no operation, no claim, no object, no change to the Reserve
    expect(s.production.operation(REQ_2)).toBeUndefined();
    expect(s.production.claim(`claim:${REQ_2}`)).toBeUndefined();
    expect(s.coordinator.object(`obj-production-${REQ_2}`)).toBeUndefined();
    expect(prodSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(s.production.reserve(RESERVE_MAIN)!.value.claims).toEqual([`claim:${REQ_1}`]);
    // the first claim is untouched and still completes alone
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(s.production.reserve(RESERVE_MAIN)!.value.quantity.amount).toBe(4);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the supported remainder is credited exactly; one unit more is not (the same quantity never supports two committed uses)", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1); // 6
    await startAndRegister(s, REQ_2, 2, { input: 4 }); // 6 + 4 = 10: exactly supported
    expect(s.production.reserve(RESERVE_MAIN)!.value.claims).toEqual([
      `claim:${REQ_1}`,
      `claim:${REQ_2}`,
    ]);
    const over = await s.production.startOperation({
      ...prodPublication(41),
      start: startInput(REQ_OTHER, { input: 1 }),
    });
    expect(!over.ok && over.error.code).toBe("CLAIM_INCOMPATIBLE");
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const reserve = s.production.reserve(RESERVE_MAIN)!.value;
    expect(reserve.quantity.amount).toBe(0);
    expect(reserve.consumed.map((c) => c.operation_id)).toEqual([REQ_1, REQ_2]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("commit order is not a priority: either order of the same two requests credits the first committed and none of the other, by quantity alone", async () => {
    for (const [first, second] of [
      [REQ_1, REQ_2],
      [REQ_2, REQ_1],
    ] as const) {
      const s = await seededProductionCampaign(tempDir());
      await startAndRegister(s, first, 1);
      const r = await s.production.startOperation({
        ...prodPublication(42),
        start: startInput(second, { input: 6 }),
      });
      expect(!r.ok && r.error.code).toBe("CLAIM_INCOMPATIBLE");
      expect(s.production.reserve(RESERVE_MAIN)!.value.claims).toEqual([`claim:${first}`]);
      expect(s.production.operation(second)).toBeUndefined();
    }
  });

  it("consumed material is gone: a second operation cannot claim what the first consumed, and the Reserve never goes negative", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const r = await s.production.startOperation({
      ...prodPublication(43),
      start: startInput(REQ_2, { input: 5, completion_at: at(400) }), // only 4 remain
    });
    expect(!r.ok && r.error.code).toBe("CLAIM_INCOMPATIBLE");
    const ok4 = await s.production.startOperation({
      ...prodPublication(44),
      start: startInput(REQ_2, { input: 4, completion_at: at(400) }),
    });
    expect(ok4.ok).toBe(true);
  });

  it("an unrelated Reserve is neither read nor scanned to resolve a claim", async () => {
    const s = await seededProductionCampaign(tempDir());
    const spy = spyStore(s.campaign.store);
    const production = new ProductionAdapter(spy.store);
    await must(production.startOperation({ ...prodPublication(50), start: startInput(REQ_1) }));
    const rejected = await production.startOperation({
      ...prodPublication(51),
      start: startInput(REQ_2, { input: 6 }),
    });
    expect(rejected.ok).toBe(false);
    expect(spy.listCalls()).toBe(0);
    expect(spy.getFacts.some((k) => k.includes(RESERVE_OTHER))).toBe(false);
    expect(
      spy.getFacts.every(
        (k) =>
          k.startsWith("synthetic-request/") ||
          k === TEMPORAL_STATE_KEY ||
          k === productionReserveKey(RESERVE_MAIN) ||
          k === productionClaimKey(`claim:${REQ_1}`) ||
          k === productionClaimKey(`claim:${REQ_2}`) ||
          k === productionOperationKey(REQ_1) ||
          k === productionOperationKey(REQ_2),
      ),
    ).toBe(true);
  });

  it("a changed intent cannot silently reuse the original receipt or identity", async () => {
    const s = await seededProductionCampaign(tempDir());
    const first = await must(
      s.production.startOperation({ ...prodPublication(60), start: startInput(REQ_1) }),
    );
    // the same intent re-presented unchanged replays the receipt: nothing is created twice
    const replay = await must(
      s.production.startOperation({ ...prodPublication(60), start: startInput(REQ_1) }),
    );
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(first.receipt);
    // the same intent with a changed claim is a conflict, not the original receipt
    expect(
      await codeOf(
        s.production.startOperation({
          ...prodPublication(60),
          start: startInput(REQ_1, { input: 5 }),
        }),
      ),
    ).toBe("INTENT_CONFLICT");
    // the same group identity under a new intent is a conflict
    expect(
      await codeOf(
        s.production.startOperation({
          ...prodPublication(61),
          group_id: prodPublication(60).group_id,
          start: startInput(REQ_2, { input: 4 }),
        }),
      ),
    ).toBe("GROUP_ID_CONFLICT");
    // a new intent for an operation that already exists cannot recreate it
    expect(
      await codeOf(
        s.production.startOperation({ ...prodPublication(62), start: startInput(REQ_1) }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(s.production.reserve(RESERVE_MAIN)!.value.claims).toEqual([`claim:${REQ_1}`]);
  });

  it("a start that names no committed request, Reserve or temporal basis is refused, never defaulted", async () => {
    const s = await seededProductionCampaign(tempDir());
    expect(
      await codeOf(
        s.production.startOperation({
          ...prodPublication(70),
          start: { ...startInput(REQ_1), request_key: "synthetic-request/none" },
        }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(
      await codeOf(
        s.production.startOperation({
          ...prodPublication(71),
          start: startInput(REQ_1, { reserve_id: "reserve-none" }),
        }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(
      await codeOf(
        s.production.startOperation({
          ...prodPublication(72),
          start: startInput(REQ_1, { completion_at: PROD_T0 }), // not after the start
        }),
      ),
    ).toBe("INPUT_INVALID");
  });
});

describe("IM-02: only the engaged operation becomes active; the boundary is exact and is not a cadence (WS-003 §16)", () => {
  it("an advance short of the declared boundary engages and changes nothing", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const before = prodSummary(s.campaign, s.coordinator);
    const r = await must(s.coordinator.advance(prodAdvanceRequest("tx-early", at(120))));
    expect(r.transaction.engaged).toEqual([]);
    expect(r.transaction.stages).toEqual([]);
    const after = prodSummary(s.campaign, s.coordinator);
    expect(after.production).toEqual(before.production); // no Production tick, shift loop or polling
    expect(after.objects).toEqual(before.objects);
    expect(s.production.operation(REQ_1)!.value.status).toEqual({ state: "IN_PROGRESS" });
    // time then continues to the boundary and the operation completes exactly once
    const later = await must(s.coordinator.advance(prodAdvanceRequest("tx-later", PROD_T1)));
    expect(later.transaction.stages.map((x) => x.stage.owner_operation.operation)).toEqual([
      OP_COMPLETE,
      OP_ACCEPT,
    ]);
    expect(s.production.reserve(RESERVE_MAIN)!.value.quantity.amount).toBe(4);
  });

  it("a stop condition on the boundary stops AT the boundary instant, and completion is stamped with the boundary, never a horizon", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const r = await must(s.coordinator.advance(prodStopAtBoundaryRequest("tx-stop", REQ_1)));
    expect(r.transaction.outcome).toMatchObject({
      stop_reason: "CONDITION_SATISFIED",
      actual_stop: PROD_TC,
    });
    expect(s.production.completion(REQ_1)!.value.completed_at).toEqual(PROD_TC);
  });

  it("stage identity excludes the requested horizon, source-version churn, retry and slicing: any horizon yields identical Production state", async () => {
    const run = async (target: number, slices: number[] = []) => {
      const s = await seededProductionCampaign(tempDir());
      await startAndRegister(s, REQ_1, 1);
      const r = await must(
        s.coordinator.advance(prodAdvanceRequest("tx-complete", at(target)), {
          slices: slices.map(at),
        }),
      );
      return { s, r, summary: prodSummary(s.campaign, s.coordinator) };
    };
    const a = await run(300);
    const b = await run(500, [150, 200, 250]);
    expect(a.r.transaction.stages.map((x) => x.group_id)).toEqual(
      b.r.transaction.stages.map((x) => x.group_id),
    );
    expect(a.r.transaction.stages.map((x) => x.group_id)).toEqual([
      stageGroupId({
        causal_process_id: `production-operation:${REQ_1}`,
        owner_operation: { owner: "production", operation: OP_COMPLETE },
        prospective_result_id: `completion:${REQ_1}`,
      }),
      stageGroupId({
        causal_process_id: `production-operation:${REQ_1}`,
        owner_operation: { owner: "world_state", operation: OP_ACCEPT },
        prospective_result_id: `acceptance:${REQ_1}`,
      }),
    ]);
    expect(a.summary.production).toEqual(b.summary.production);
    expect(a.summary.entities).toEqual(b.summary.entities);
  });

  it("independent and dormant work stays untouched and unread: only the engaged cone is staged", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    // an unrelated operation on an unrelated Reserve with a LATER boundary
    await must(
      s.production.startOperation({
        ...prodPublication(80),
        start: startInput(REQ_OTHER, {
          reserve_id: RESERVE_OTHER,
          input: 3,
          completion_at: PROD_TC_OTHER,
        }),
      }),
    );
    await registerOperation(s, REQ_OTHER, 30);
    const otherBefore = [
      s.campaign.store.getFact(productionReserveKey(RESERVE_OTHER)),
      s.campaign.store.getFact(productionOperationKey(REQ_OTHER)),
      s.campaign.store.getFact(productionClaimKey(`claim:${REQ_OTHER}`)),
      s.campaign.store.getFact(temporalObjectKey(`obj-production-${REQ_OTHER}`)),
    ];
    const spy = spyStore(s.campaign.store);
    const coordinator = new TemporalCoordinator(spy.store, productionProviders());
    const r = await must(coordinator.advance(prodAdvanceRequest("tx-complete", at(200))));
    expect(r.transaction.engaged.map((e) => e.object_id)).toEqual([`obj-production-${REQ_1}`]);
    // the unrelated operation, Reserve, claim and object are byte-identical and were never read
    expect([
      s.campaign.store.getFact(productionReserveKey(RESERVE_OTHER)),
      s.campaign.store.getFact(productionOperationKey(REQ_OTHER)),
      s.campaign.store.getFact(productionClaimKey(`claim:${REQ_OTHER}`)),
      s.campaign.store.getFact(temporalObjectKey(`obj-production-${REQ_OTHER}`)),
    ]).toEqual(otherBefore);
    expect(spy.getFacts.filter((k) => k.includes(REQ_OTHER) || k.includes(RESERVE_OTHER))).toEqual(
      [],
    );
    expect(spy.listCalls()).toBe(0);
    // its own boundary is still the one active entry
    expect(coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual([
      `obj-production-${REQ_OTHER}`,
    ]);
    // and it later completes on its own, once
    await must(coordinator.advance(prodAdvanceRequest("tx-other", PROD_T1)));
    expect(s.production.reserve(RESERVE_OTHER)!.value.quantity.amount).toBe(4);
    expect(s.production.availability(REQ_OTHER).state).toBe("ACCEPTED_AVAILABLE");
  });
});

describe("two operations on one Reserve completing at the same boundary: each consumes its own claim once", () => {
  it("both complete, the Reserve ends exactly empty, two distinct durables are accepted, and the final state does not depend on stage order", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    await startAndRegister(s, REQ_2, 2, { input: 4 });
    const r = await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(r.rejections).toEqual([]);
    expect(r.transaction.stages).toHaveLength(4);
    const reserve = s.production.reserve(RESERVE_MAIN)!.value;
    expect(reserve.quantity.amount).toBe(0);
    expect(reserve.consumed).toEqual([
      { operation_id: REQ_1, quantity: { amount: 6, unit: MATERIAL_UNIT } },
      { operation_id: REQ_2, quantity: { amount: 4, unit: MATERIAL_UNIT } },
    ]);
    expect(reserve.claims).toEqual([]);
    for (const id of [REQ_1, REQ_2])
      expect(s.production.availability(id).state).toBe("ACCEPTED_AVAILABLE");
    expect(s.campaign.store.listFacts().filter((f) => f.key.includes("/entity/"))).toHaveLength(2);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("CG-2: completion is not availability; the custodian accepts the same reference exactly once", () => {
  const withoutCustodian = () => new StageProviderRegistry([productionCompletionProvider]);

  it("a completed durable is NOT available until the custodian accepts; an unaccepted completion persists, and acceptance happens once", async () => {
    const dir = tempDir();
    const s = await seededProductionCampaign(dir);
    await startAndRegister(s, REQ_1, 1);
    const blocked = new TemporalCoordinator(s.campaign.store, withoutCustodian());
    const r = await must(blocked.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents).toEqual([
      {
        stage: expect.objectContaining({
          owner_operation: { owner: "world_state", operation: OP_ACCEPT },
        }),
        reason: "PROVIDER_ABSENT",
      },
    ]);
    expect(r.transaction.engaged.map((e) => e.boundary)).toEqual(["STILL_ACTIVE"]);
    // completed, input consumed, output sealed — and NOT available
    expect(s.production.availability(REQ_1)).toEqual({
      state: "COMPLETED_PENDING_ACCEPTANCE",
      conserved_reference: `durable:${REQ_1}`,
    });
    expect(s.production.acceptedEntity(FIXTURE_WORLD_ID, `durable:${REQ_1}`)).toBeUndefined();
    expect(s.production.reserve(RESERVE_MAIN)!.value.quantity.amount).toBe(4);
    expect(s.campaign.verify()).toEqual([]);

    // save → close → load: the unaccepted completion is still exactly one completion
    const summary = prodSummary(s.campaign, s.coordinator);
    await s.campaign.close();
    const re = await reopenProduction(dir);
    expect(re.campaign.verify()).toEqual([]);
    expect(prodSummary(re.campaign, re.coordinator)).toEqual(summary);
    expect(re.production.availability(REQ_1).state).toBe("COMPLETED_PENDING_ACCEPTANCE");

    // the custodian is present at the continuation: the committed Production stage is ADOPTED (never recomputed)
    const cont = await must(re.coordinator.continueRemainder(continuationInput("tx-continue")));
    expect(cont.adopted.map((x) => x.owner_operation.operation)).toEqual([OP_COMPLETE]);
    expect(cont.recomputed_in_place).toEqual([]);
    expect(re.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
    // no duplicate consumption, output, completion or acceptance
    expect(re.production.reserve(RESERVE_MAIN)!.value.quantity.amount).toBe(4);
    expect(re.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
    expect(re.production.completion(REQ_1)!.fact.version).toBe(1);
    expect(re.campaign.store.getFact(entityKey(REQ_1))!.version).toBe(1);
    expect(re.campaign.store.listFacts().filter((f) => f.key.includes("/entity/"))).toHaveLength(1);
    expect(re.campaign.verify()).toEqual([]);
    await re.campaign.close();
  });

  it("re-presenting the committed transaction, or advancing further, never re-accepts, re-consumes or duplicates", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const frozen = prodSummary(s.campaign, s.coordinator);
    const again = await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(again.replayed).toBe(true);
    expect(prodSummary(s.campaign, s.coordinator)).toEqual(frozen);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-further", at(900))));
    const later = prodSummary(s.campaign, s.coordinator);
    expect(later.production).toEqual(frozen.production);
    expect(later.entities).toEqual(frozen.entities);
    expect(s.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
  });

  it("an acceptance can only be the exact completed durable: the stage reads the completion, the world and the locus", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const r = await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const accept = r.transaction.stages[1]!;
    expect(accept.reads.map((x) => x.source.fact_key)).toEqual([
      productionCompletionKey(REQ_1),
      `world/${FIXTURE_WORLD_ID}/profile`,
      `world/${FIXTURE_WORLD_ID}/locus/${FIXTURE_LOCUS_ID}`,
    ]);
    expect(accept.group_id).toBe(
      stageGroupId({
        causal_process_id: `production-operation:${REQ_1}`,
        owner_operation: { owner: "world_state", operation: OP_ACCEPT },
        prospective_result_id: `acceptance:${REQ_1}`,
      }),
    );
    expect(accept.intent_id).toBe(
      stageIntentId({
        causal_process_id: `production-operation:${REQ_1}`,
        owner_operation: { owner: "world_state", operation: OP_ACCEPT },
        prospective_result_id: `acceptance:${REQ_1}`,
      }),
    );
  });
});

describe("save → close → load → verify → continue (primary end-to-end path)", () => {
  it("in-process: persisted before the boundary, reloaded identically, continued to completion and acceptance, no duplicates", async () => {
    const dir = tempDir();
    const s = await seededProductionCampaign(dir);
    await startAndRegister(s, REQ_1, 1);
    const saved = prodSummary(s.campaign, s.coordinator);
    await s.campaign.close();

    const re = await reopenProduction(dir);
    expect(re.campaign.verify()).toEqual([]);
    expect(prodSummary(re.campaign, re.coordinator)).toEqual(saved); // identity and provenance
    expect(re.production.operation(REQ_1)!.value.status).toEqual({ state: "IN_PROGRESS" });
    expect(re.production.availability(REQ_1).state).toBe("NOT_COMPLETED");

    await must(re.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(re.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
    const done = prodSummary(re.campaign, re.coordinator);
    expect(re.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
    expect(done.entities).toHaveLength(1);
    await re.campaign.close();

    const again = await reopenProduction(dir, "prod-reopen-2");
    expect(again.campaign.verify()).toEqual([]);
    expect(prodSummary(again.campaign, again.coordinator)).toEqual(done);
    await again.campaign.close();
  });

  it("across real OS-process boundaries: create → load → continue", () => {
    const dir = tempDir();
    const script = join(import.meta.dirname, "fixtures", "production-process.ts");
    const run = (phase: string) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ["--experimental-strip-types", "--no-warnings", script, phase, dir],
          { encoding: "utf8" },
        ),
      ) as Record<string, any>;

    const created = run("create");
    expect(created.violations).toEqual([]);
    expect(created.summary.entities).toEqual([]); // not complete: persisted BEFORE its boundary
    const loaded = run("load"); // a different process than the one that saved
    expect(loaded.violations).toEqual([]);
    expect(loaded.summary).toEqual(created.summary);
    expect(loaded.availability).toEqual({ state: "NOT_COMPLETED" });

    const cont = run("continue"); // a third process continues from the persisted state
    expect(cont.before).toEqual(created.summary);
    expect(cont.violations).toEqual([]);
    expect(
      cont.outcome.transaction.stages.map((x: any) => x.stage.owner_operation.operation),
    ).toEqual([OP_COMPLETE, OP_ACCEPT]);
    expect(cont.replayed).toBe(true);
    expect(cont.afterReplay).toEqual(cont.after); // re-presenting writes nothing
    expect(cont.after.entities).toHaveLength(1);
    const reserve = cont.after.production.find(
      (f: any) => f.key === productionReserveKey(RESERVE_MAIN),
    );
    expect(reserve.value.quantity.amount).toBe(4);
    expect(reserve.value.consumed).toHaveLength(1);
    // canonical world / PC / binding identity unchanged
    expect(cont.after.canonical).toEqual(created.summary.canonical);
  });
});

describe("the coordinator, adapter and registry are the existing machinery", () => {
  it("Production needs no coordinator of its own: its objects register through the one kernel path and resolve through it", async () => {
    const s = await seededProductionCampaign(tempDir());
    await startAndRegister(s, REQ_1, 1);
    const object = s.coordinator.object(`obj-production-${REQ_1}`)!;
    expect(object.value).toEqual(
      productionTemporalObject(s.production.operation(REQ_1)!.value, {
        worldId: FIXTURE_WORLD_ID,
        locusId: FIXTURE_LOCUS_ID,
      }),
    );
    expect(object.value.partition).toEqual({ class: "EXACT-PARTITION" });
    expect(object.value.continuation.reconciliation_due).toEqual([]);
    expect(prodCoordinator(s.campaign.store)).toBeInstanceOf(TemporalCoordinator);
    expect(temporalPublication(1).group_id).toBeDefined();
  });
});
