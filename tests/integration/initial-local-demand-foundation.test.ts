// The initial local demand and independently authored production start, end to end on a FRESH disposable campaign built only by the shipped
// commands: the OOC opening commits ONE Economy demand with its ONE Production Request, then, as a separately authored act, ONE in-progress
// Production operation, its RC-06 claim and the Reserve's open claim — and advances no time and creates no output. Only afterwards does the
// disposable witness independently advance the EXISTING Temporal coordinator to the declared boundary, where the existing Production,
// World-State and Economy owners earn the physical result and the realized access, once. This proves the existing deterministic owner
// chain plus the new admission seam; it does not prove live Population need formation, valuation, exchange, an actor or productivity.
import { describe, expect, it } from "vitest";
import {
  TEMPORAL_STATE_KEY,
  economyDemandKey,
  economyRealizationKey,
  economyRequestKey,
  productionClaimKey,
  productionCompletionKey,
  productionOperationKey,
  productionReserveKey,
  worldFallbackEntityKey,
} from "@immortalis/contracts";
import { at, fixtureWorld, publication } from "@immortalis/testkit";
import {
  COHORT_ID,
  DEMAND_ID,
  INPUT_AMOUNT,
  LEDGER_ID,
  LOCUS_ID,
  OPERATION_ID,
  OUTPUT_CLASS,
  OUTPUT_CONDITION,
  OUTPUT_UNIT,
  REQUEST_KEY,
  RESERVE_AMOUNT,
  RESERVE_ID,
  RESERVE_MATERIAL,
  RESERVE_UNIT,
  T_CLOSE,
  T_DUE,
  T_OPEN,
  WORLD_ID,
  addDemand,
  advanceRequest,
  cohortCarrier,
  demandDoc,
  engageClose,
  headOf,
  held,
  openOrdinary,
  openPopulationWitness,
  openWitness,
  processSummary,
  registerOperation,
  scenarioCampaign,
  writeDemand,
} from "../support/initial-local-demand.ts";

const entityKey = worldFallbackEntityKey(WORLD_ID, `durable:${OPERATION_ID}`);

describe("the OOC opening commits both acts, advances no time and creates no output", () => {
  it("the isolated owner precheck can copy and verify a checkpoint with indexed history", async () => {
    const dirs = await scenarioCampaign();
    const campaign = await openOrdinary(dirs.campaignDir);
    for (let i = 0; i < 130; i++) {
      const established = await campaign.establishWorld({
        ...publication(20000 + i),
        world: fixtureWorld({ world_id: `h07-dry-run-world-${i}` }),
      });
      expect(established.ok, JSON.stringify(established)).toBe(true);
    }
    const before = campaign.store.head();
    expect(before.revision).toBeGreaterThan(128);
    await campaign.close();
    const { result, terminal } = await addDemand(dirs, writeDemand(demandDoc()));
    expect(result.status, JSON.stringify(result)).toBe("LOCAL_DEMAND_READY");
    expect(terminal.asked()).toBe(1);
    expect((await headOf(dirs.campaignDir)).revision).toBe(before.revision + 2);
  });

  it("commits ONE demand + request (Economy) and, separately, ONE operation + claim + Reserve claim (Production), and nothing else", async () => {
    const dirs = await scenarioCampaign();
    const c0 = await openOrdinary(dirs.campaignDir);
    const before = c0.store.listFacts();
    const clockBefore = c0.store.getFact(TEMPORAL_STATE_KEY)!;
    await c0.close();

    const { result, terminal } = await addDemand(dirs, writeDemand(demandDoc()));
    expect(result.status, JSON.stringify(result)).toBe("LOCAL_DEMAND_READY");
    expect(result.message).toContain("NO time was advanced");
    expect(terminal.asked()).toBe(1);
    const said = terminal.said.join("\n");
    expect(said).toContain("ACT 1 — MATERIAL DEMAND");
    expect(said).toContain("ACT 2 — PRODUCTION START");
    expect(said).toContain("a SEPARATE act: the demand above does not grant it");
    expect(said).toContain("to commit, in this order: demand → start");

    const w = await openWitness(dirs.campaignDir);
    try {
      const store = w.campaign.store;
      const demand = w.economy.demand(DEMAND_ID)!;
      const request = w.economy.request(DEMAND_ID)!;
      const op = w.production.operation(OPERATION_ID)!;
      const claim = w.production.claim(`claim:${OPERATION_ID}`)!;
      const reserve = w.production.reserve(RESERVE_ID)!;

      // two distinct authorships: the Economy publication (demand + request) and the Production publication (operation + claim + Reserve)
      expect(demand.fact.owner).toBe("economy");
      expect(request.fact.owner).toBe("economy");
      expect(request.fact.provenance.group_id).toBe(demand.fact.provenance.group_id);
      expect(op.fact.owner).toBe("production");
      expect(claim.fact.provenance.group_id).toBe(op.fact.provenance.group_id);
      expect(reserve.fact.provenance.group_id).toBe(op.fact.provenance.group_id);
      expect(op.fact.provenance.group_id).not.toBe(demand.fact.provenance.group_id);
      expect(op.fact.provenance.intent_id).not.toBe(demand.fact.provenance.intent_id);
      expect(demand.fact.version).toBe(1);
      expect(op.fact.version).toBe(1);
      expect(reserve.fact.version).toBe(2);

      // every exact owner pointer
      expect(demand.value.carrier_ref).toEqual({
        kind: "POPULATION_UNIT",
        ledger_id: LEDGER_ID,
        unit_id: "unit-01",
      });
      expect(demand.value.carrier_basis_ref).toEqual({
        ledger: { fact_key: `population/${LEDGER_ID}/ledger`, version: 1 },
        cohort: null,
      });
      expect(demand.value.material_scope.locus.entity_id).toBe(LOCUS_ID);
      expect(demand.value.allocation.request).toEqual({
        fact_key: economyRequestKey(OPERATION_ID),
        request_id: OPERATION_ID,
      });
      expect(demand.value.pre_commit_availability).toMatchObject({
        read: "AS-OF-NOW",
        at: T_OPEN,
        supply_for_request: "ABSENT",
      });
      expect(request.value.priority_authority_ref).toBeNull();
      expect(op.value.request).toEqual({
        owner: "economy",
        fact_key: REQUEST_KEY,
        request_id: OPERATION_ID,
        version: 1,
      });
      expect(op.value.status).toEqual({ state: "IN_PROGRESS" });
      expect(op.value.timing).toEqual({
        started_at: T_OPEN,
        completion: { boundary_id: `boundary-production-completion-${OPERATION_ID}`, at: T_DUE },
      });
      expect(op.value.transformation.input).toEqual({
        material_class: RESERVE_MATERIAL,
        quantity: { amount: INPUT_AMOUNT, unit: RESERVE_UNIT },
      });
      expect(op.value.transformation.output).toMatchObject({
        output_class: OUTPUT_CLASS,
        quantity: { amount: 1, unit: OUTPUT_UNIT },
        condition: OUTPUT_CONDITION,
      });
      expect(claim.value.lifecycle).toEqual({ status: "ACTIVE" });
      expect(claim.value.priority_basis).toBeNull();
      expect(reserve.value.claims).toEqual([`claim:${OPERATION_ID}`]);
      // a claim is not consumption: the Reserve still holds all of it
      expect(reserve.value.quantity).toEqual({ amount: RESERVE_AMOUNT, unit: RESERVE_UNIT });
      expect(reserve.value.consumed).toEqual([]);

      // no time advanced, no output, no satisfaction, no title or stock, no Temporal object
      expect(store.getFact(TEMPORAL_STATE_KEY)).toEqual(clockBefore);
      expect(store.getFact(entityKey)).toBeUndefined();
      expect(store.getFact(productionCompletionKey(OPERATION_ID))).toBeUndefined();
      expect(store.getFact(economyRealizationKey(DEMAND_ID))).toBeUndefined();
      expect(w.economy.access(DEMAND_ID)).toEqual({ state: "DEMAND_OPEN" });
      expect(w.production.availability(OPERATION_ID)).toEqual({ state: "NOT_COMPLETED" });
      expect(store.listFacts().filter((f) => f.key.startsWith("temporal/object/"))).toEqual([]);

      // only the four new keys exist, and the Reserve gained only its open claim; every other earlier fact is unchanged
      const after = new Map(store.listFacts().map((f) => [f.key, f]));
      const added = [...after.keys()].filter((k) => !before.some((f) => f.key === k)).sort();
      expect(added).toEqual(
        [
          economyDemandKey(DEMAND_ID),
          economyRequestKey(OPERATION_ID),
          productionOperationKey(OPERATION_ID),
          productionClaimKey(`claim:${OPERATION_ID}`),
        ].sort(),
      );
      for (const f of before)
        if (f.key !== productionReserveKey(RESERVE_ID)) expect(after.get(f.key), f.key).toEqual(f);
      expect(w.campaign.verify()).toEqual([]);
    } finally {
      await w.campaign.close();
    }
  }, 120_000);

  it("a repeat verifies the committed record without asking again and without a write", async () => {
    const dirs = await scenarioCampaign();
    const file = writeDemand(demandDoc());
    expect((await addDemand(dirs, file)).result.status).toBe("LOCAL_DEMAND_READY");
    const head = await headOf(dirs.campaignDir);
    const again = await addDemand(dirs, file, []);
    expect(again.result.status).toBe("LOCAL_DEMAND_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("only the earned boundary, advanced independently, realizes the demand — once", () => {
  it("before the declared boundary nothing is consumed, accepted or realized; at it, each existing owner earns its own result once", async () => {
    const dirs = await scenarioCampaign();
    expect((await addDemand(dirs, writeDemand(demandDoc()))).result.status).toBe(
      "LOCAL_DEMAND_READY",
    );
    const w = await openWitness(dirs.campaignDir);
    try {
      await registerOperation(w);
      const demandBefore = w.campaign.store.getFact(economyDemandKey(DEMAND_ID))!;
      const requestBefore = w.campaign.store.getFact(economyRequestKey(OPERATION_ID))!;

      // a premature horizon engages nothing
      const early = processSummary(w);
      const r0 = await w.coordinator.advance(advanceRequest("tx-early", at(130)));
      expect(r0.ok, JSON.stringify(r0)).toBe(true);
      const mid = processSummary(w);
      expect(mid.economy).toEqual(early.economy);
      expect(mid.production).toEqual(early.production);
      expect(mid.entities).toEqual([]);
      expect(w.economy.access(DEMAND_ID).state).toBe("DEMAND_OPEN");
      expect(w.production.reserve(RESERVE_ID)!.value.consumed).toEqual([]);

      // the exact due continuation
      const r1 = await w.coordinator.advance(advanceRequest("tx-due", T_DUE));
      expect(r1.ok, JSON.stringify(r1)).toBe(true);

      // Production consumed the declared input exactly once and completed one durable
      const reserve = w.production.reserve(RESERVE_ID)!.value;
      expect(reserve.consumed).toEqual([
        { operation_id: OPERATION_ID, quantity: { amount: INPUT_AMOUNT, unit: RESERVE_UNIT } },
      ]);
      expect(reserve.quantity.amount).toBe(RESERVE_AMOUNT - INPUT_AMOUNT);
      expect(w.production.operation(OPERATION_ID)!.value.status.state).toBe("COMPLETED");
      expect(w.production.completion(OPERATION_ID)!.fact.version).toBe(1);

      // the custodian accepted the SAME conserved reference: the demanded class, quantity and locus
      const entity = w.production.acceptedEntity(WORLD_ID, `durable:${OPERATION_ID}`)!;
      expect(entity.fact.key).toBe(entityKey);
      expect(entity.fact.version).toBe(1);
      expect(entity.value).toMatchObject({
        entity_id: `durable:${OPERATION_ID}`,
        entity_class: OUTPUT_CLASS,
        quantity: { amount: 1, unit: OUTPUT_UNIT },
      });
      expect(entity.value.locality.locus.entity_id).toBe(LOCUS_ID);
      expect(w.production.availability(OPERATION_ID).state).toBe("ACCEPTED_AVAILABLE");

      // Economy wrote realized access once, at the operation's own boundary, and a later consumer reads it
      const access = w.economy.access(DEMAND_ID);
      expect(access.state).toBe("REALIZED_ACCESS");
      const z = w.economy.realization(DEMAND_ID)!;
      expect(z.fact.version).toBe(1);
      expect(z.value.realized_at).toEqual(T_DUE);
      expect(z.value.realized_access).toMatchObject({
        basis: "CUSTODIAN_ACCEPTED_SAME_CONSERVED_REFERENCE",
        output_class: OUTPUT_CLASS,
        quantity: { amount: 1, unit: OUTPUT_UNIT },
      });
      expect(z.value.delivery_result.fact_key).toBe(entityKey);

      // the originating demand and request were never rewritten
      expect(w.campaign.store.getFact(economyDemandKey(DEMAND_ID))).toEqual(demandBefore);
      expect(w.campaign.store.getFact(economyRequestKey(OPERATION_ID))).toEqual(requestBefore);
      expect(w.campaign.verify()).toEqual([]);
    } finally {
      await w.campaign.close();
    }

    // save / reopen: the same owner facts and the same access, and the setup path is now closed
    const back = await openWitness(dirs.campaignDir);
    try {
      expect(back.economy.access(DEMAND_ID).state).toBe("REALIZED_ACCESS");
      expect(back.production.operation(OPERATION_ID)!.fact.version).toBe(2);
      expect(back.production.reserve(RESERVE_ID)!.value.consumed).toHaveLength(1);
      expect(back.campaign.verify()).toEqual([]);
    } finally {
      await back.campaign.close();
    }
    const closed = await addDemand(dirs, writeDemand(demandDoc()), []);
    expect(closed.result.status).toBe("PRE_PLAY_CLOSED");
    expect(closed.terminal.asked()).toBe(0);
  }, 180_000);

  it("a Cohort Population has composed carries the same process; the demand pins the closed ledger and Cohort without copying their members", async () => {
    const dirs = await scenarioCampaign();
    // Population's OWN ordinary close composes the Cohort at a later canonical time (a disposable scenario step: Population-owned, via Temporal)
    const pop = await openPopulationWitness(dirs.campaignDir);
    try {
      expect((await engageClose(pop)).ok).toBe(true);
    } finally {
      await pop.campaign.close();
    }
    const doc = demandDoc();
    doc.demand.carrier = cohortCarrier();
    doc.production.completion_at = at(220);
    const added = await addDemand(dirs, writeDemand(doc));
    expect(added.result.status, JSON.stringify(added.result)).toBe("LOCAL_DEMAND_READY");
    const w = await openWitness(dirs.campaignDir);
    try {
      const demand = w.economy.demand(DEMAND_ID)!;
      expect(demand.value.carrier_basis_ref).toEqual({
        ledger: { fact_key: `population/${LEDGER_ID}/ledger`, version: 2 },
        cohort: { fact_key: `population/${LEDGER_ID}/cohort/${COHORT_ID}`, version: 2 },
      });
      expect(demand.value.pre_commit_availability.at).toEqual(T_CLOSE);
      expect(JSON.stringify(demand.value)).not.toMatch(/unit-0|"members"|"count"/);
      await registerOperation(w, 3);
      expect((await w.coordinator.advance(advanceRequest("tx-due", at(220)))).ok).toBe(true);
      expect(w.economy.access(DEMAND_ID).state).toBe("REALIZED_ACCESS");
      expect(w.economy.realization(DEMAND_ID)!.value.realized_at).toEqual(at(220));
    } finally {
      await w.campaign.close();
    }
  }, 180_000);

  it("the opening alone leaves the process unrealized across a reopen, with the operation still in progress", async () => {
    const dirs = await scenarioCampaign();
    expect((await addDemand(dirs, writeDemand(demandDoc()))).result.status).toBe(
      "LOCAL_DEMAND_READY",
    );
    expect(await held(dirs.campaignDir)).toEqual({
      demand: true,
      request: true,
      operation: true,
      claim: true,
      violations: [],
    });
    const w = await openWitness(dirs.campaignDir);
    try {
      expect(w.production.operation(OPERATION_ID)!.value.status.state).toBe("IN_PROGRESS");
      expect(w.economy.access(DEMAND_ID).state).toBe("DEMAND_OPEN");
    } finally {
      await w.campaign.close();
    }
  }, 120_000);
});
