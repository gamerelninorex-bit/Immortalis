/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and process output */
// Economy Demand → Production Request → Realized Access Backbone Foundation — "a real Population carrier has a
// material demand → Economy fixes the demand and issues one Production Request → the existing Production makes
// the output → the existing World-State custodian accepts the physical result → only then does Economy record
// realized access; across save, close and load, no duplicate demand, request, operation, consumption, output,
// acceptance or Economy result."
// Register lineage: IA-01/02/03/04 (partial), IA-05/IA-06/IA-22/IA-30 (reused / partial); RC-02/06/07/10/12/16;
// IM-02, IM-03, IM-04, IM-05, IM-06, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0).
// CAL-01 stays UNCALIBRATED (EXACT only), CAL-02/L-50 stays OPEN, CAL-03 has no adopted number. Local success is
// NOT provider/recovery acceptance (IA-07 BLOCKED).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  economyDemandKey,
  economyRealizationKey,
  economyRequestKey,
  populationLedgerKey,
  productionCompletionKey,
  productionOperationKey,
  productionReserveKey,
  worldFallbackEntityKey,
} from "@immortalis/contracts";
import {
  EconomyAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  economyRealizationProvider,
  productionCompletionProvider,
  stageIntentId,
  worldFallbackAcceptanceProvider,
} from "@immortalis/engine";
import {
  DEMAND_1,
  DEMAND_2,
  DEMAND_OTHER,
  FIXTURE_WORLD_ID,
  LEDGER_MAIN,
  LEDGER_OTHER,
  OUTPUT_CLASS,
  OUTPUT_UNIT,
  PROD_T0,
  PROD_T1,
  PROD_TC,
  RESERVE_MAIN,
  RESERVE_OTHER,
  at,
  demandEntry,
  economyProviders,
  economyPublication,
  economyStartInput,
  issueInput,
  operationOf,
  prodAdvanceRequest,
  prodPublication,
  prodStopAtBoundaryRequest,
  temporalPublication,
  unitCarrier,
} from "@immortalis/testkit";
import {
  econCoordinator,
  econSummary,
  issueStartRegister,
  registerEconomyOperation,
  reopenEconomy,
  seededEconomyCampaign,
  startAndRegisterOperation,
} from "../support/economy.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const OP_COMPLETE = "production-complete-operation";
const OP_ACCEPT = "world-state-accept-fallback-durable";
const OP_REALIZE = "economy-record-realized-access";
const opId = operationOf(DEMAND_1);
const entityKey = (id: string) => worldFallbackEntityKey(FIXTURE_WORLD_ID, `durable:${id}`);

describe("the Demand Envelope and its one Production Request (WS-004 §5, §8, §11, §27.1, §27.2)", () => {
  it("fixes one demand on one already-committed Population Unit carrier and one request, atomically, without copying Population state", async () => {
    const s = await seededEconomyCampaign(tempDir());
    const popBefore = s.campaign.store.getFact(populationLedgerKey(LEDGER_MAIN))!;
    const receipt = await must(
      s.economy.issueDemand({ ...economyPublication(1), demand: issueInput(DEMAND_1) }),
    );
    expect(receipt.replayed).toBe(false);
    const demand = s.economy.demand(DEMAND_1)!;
    const request = s.economy.request(DEMAND_1)!;
    expect(demand.fact.owner).toBe("economy");
    expect(demand.fact.version).toBe(1);
    expect(demand.value.carrier_ref).toEqual(unitCarrier());
    expect(demand.value.carrier_basis_ref).toEqual({
      ledger: { fact_key: populationLedgerKey(LEDGER_MAIN), version: popBefore.version },
      cohort: null,
    });
    expect(demand.value.demand_entry).toEqual(demandEntry());
    // the fixed allocation relation: an ECONOMIC claim, never stock, title or a reservation
    expect(demand.value.allocation).toEqual({
      relation: "ONE_DEMAND_ONE_PRODUCTION_REQUEST",
      request: { fact_key: economyRequestKey(opId), request_id: opId },
      nature: "ECONOMIC_ALLOCATION_CLAIM_NOT_STOCK_TITLE_OR_RESERVATION",
    });
    // WS-004 §27.2: pre-commit availability AS-OF-NOW, sealed with the demand: no supply existed
    expect(demand.value.pre_commit_availability).toMatchObject({
      read: "AS-OF-NOW",
      at: PROD_T0,
      supply_for_request: "ABSENT",
    });
    // the request is Economy's own fact in Economy's key space, the demand's source, no priority
    expect(request.fact.owner).toBe("economy");
    expect(request.value).toMatchObject({
      request_id: opId,
      source: { owner: "economy", cause_ref: economyDemandKey(DEMAND_1) },
      requested_output: { output_class: OUTPUT_CLASS, quantity: { amount: 1, unit: OUTPUT_UNIT } },
      priority_authority_ref: null,
    });
    // one atomic group
    expect(request.fact.provenance.group_id).toBe(demand.fact.provenance.group_id);
    // Economy copied no Population count or membership, and Population is untouched
    const text = JSON.stringify(demand.value);
    expect(text).not.toMatch(/u-2|u-3|u-4|"count"|"members"|"units"/);
    expect(s.campaign.store.getFact(populationLedgerKey(LEDGER_MAIN))).toEqual(popBefore);
    expect(s.economy.access(DEMAND_1)).toEqual({ state: "DEMAND_OPEN" });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("demand alone creates no supply, no stock, no reservation and no Production state", async () => {
    const s = await seededEconomyCampaign(tempDir());
    const before = econSummary(s.campaign, s.coordinator);
    await must(s.economy.issueDemand({ ...economyPublication(1), demand: issueInput(DEMAND_1) }));
    const after = econSummary(s.campaign, s.coordinator);
    expect(after.production).toEqual(before.production); // no claim, operation or Reserve change
    expect(after.entities).toEqual([]); // no physical entity exists
    expect(after.objects).toEqual(before.objects); // no temporal object, boundary or scheduler entry
    expect(after.index).toEqual(before.index);
    expect(after.population).toEqual(before.population);
    expect(after.economy.map((f) => f.key)).toEqual([
      economyDemandKey(DEMAND_1),
      economyRequestKey(opId),
    ]);
    expect(s.production.availability(opId)).toEqual({ state: "NOT_COMPLETED" });
    expect(s.economy.access(DEMAND_1).state).toBe("DEMAND_OPEN");
  });

  it("refuses a demand with no committed carrier, ledger, Unit, canonical time, or with a different carrier on a retried intent", async () => {
    const s = await seededEconomyCampaign(tempDir());
    const issue = (n: number, carrier: ReturnType<typeof unitCarrier>) =>
      codeOf(
        s.economy.issueDemand({
          ...economyPublication(n),
          demand: issueInput(DEMAND_1, { carrier }),
        }),
      );
    expect(await issue(1, unitCarrier("u-1", "ledger-none"))).toBe("PREREQUISITE_MISSING");
    expect(await issue(2, unitCarrier("nobody"))).toBe("REFERENCE_INVALID"); // not a Unit of the ledger
    expect(s.economy.demand(DEMAND_1)).toBeUndefined();
    expect(s.economy.request(DEMAND_1)).toBeUndefined();
    // the same intent re-presented unchanged replays the receipt; a changed carrier is a conflict
    const first = await must(
      s.economy.issueDemand({ ...economyPublication(3), demand: issueInput(DEMAND_1) }),
    );
    const replay = await must(
      s.economy.issueDemand({ ...economyPublication(3), demand: issueInput(DEMAND_1) }),
    );
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(first.receipt);
    expect(await issue(3, unitCarrier("u-2"))).toBe("INTENT_CONFLICT");
    // a new intent cannot recreate or rewrite the demand
    expect(await issue(4, unitCarrier("u-1"))).toBe("VERSION_CONFLICT");
    expect(s.economy.demand(DEMAND_1)!.value.carrier_ref).toEqual(unitCarrier("u-1"));
  });

  it("without a canonical temporal basis there is no pre-commit availability to read: nothing is committed", async () => {
    const dir = tempDir();
    const s = await seededEconomyCampaign(dir);
    const inner = s.campaign.store;
    const fresh = new EconomyAdapter({
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => (k === "temporal/state" ? undefined : inner.getFact(k)),
      listFacts: () => inner.listFacts(),
      commit: (g) => inner.commit(g),
      lookupReceipt: (id) => inner.lookupReceipt(id),
      committedGroup: (id) => inner.committedGroup(id),
      close: () => inner.close(),
    });
    expect(
      await codeOf(fresh.issueDemand({ ...economyPublication(1), demand: issueInput(DEMAND_1) })),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.economy.demand(DEMAND_1)).toBeUndefined();
  });
});

describe("the request enters the existing Production machinery; completion is not satisfaction (CG-2 + WS-004 §27.2)", () => {
  it("Production starts on the Economy request exactly as on any request: one operation, one RC-06 claim, the request pinned and never copied", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    const op = s.production.operation(opId)!.value;
    expect(op.request).toEqual({
      owner: "economy",
      fact_key: economyRequestKey(opId),
      request_id: opId,
      version: 1,
    });
    expect(JSON.stringify(op)).not.toContain(DEMAND_1.replace("demand", "dem-")); // the demand is not copied in
    expect(op.status).toEqual({ state: "IN_PROGRESS" });
    const reserve = s.production.reserve(RESERVE_MAIN)!.value;
    expect(reserve.claims).toEqual([`claim:${opId}`]);
    expect(reserve.quantity.amount).toBe(10); // a claim is not consumption
    // the one earned boundary is the operation's, and the object declares THREE stages in one object
    const obj = s.coordinator.object(`obj-production-${opId}`)!.value;
    expect(obj.dependencies.map((d) => d.stage.owner_operation)).toEqual([
      { owner: "production", operation: OP_COMPLETE },
      { owner: "world_state", operation: OP_ACCEPT },
      { owner: "economy", operation: OP_REALIZE },
    ]);
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a request fixes at most one operation: it cannot start a second one, on this Reserve or another", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1, { input: 2 });
    const before = econSummary(s.campaign, s.coordinator);
    for (const [n, reserve_id] of [
      [90, RESERVE_MAIN],
      [91, RESERVE_OTHER],
    ] as const) {
      expect(
        await codeOf(
          s.production.startOperation({
            ...prodPublication(n),
            start: economyStartInput(DEMAND_1, { reserve_id, input: 1 }),
          }),
        ),
      ).toBe("VERSION_CONFLICT");
    }
    expect(econSummary(s.campaign, s.coordinator)).toEqual(before);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(s.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
    expect(s.production.reserve(RESERVE_OTHER)!.value.consumed).toEqual([]);
    expect(s.economy.realization(DEMAND_1)!.fact.version).toBe(1);
  });

  it("one transaction: Production consumes once and produces once, the custodian accepts once, and only then Economy records realized access", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    const r = await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const t = r.transaction;
    expect(t.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(t.engaged.map((e) => e.boundary)).toEqual(["RETIRED"]);
    // staged order: completion → acceptance → Economy's realized access (WS-004 §27.14)
    expect(t.stages.map((x) => x.stage.owner_operation)).toEqual([
      { owner: "production", operation: OP_COMPLETE },
      { owner: "world_state", operation: OP_ACCEPT },
      { owner: "economy", operation: OP_REALIZE },
    ]);
    expect(t.stages[2]!.reads.map((x) => x.mode)).toEqual(Array(5).fill("AS-OF-NOW"));
    expect(t.stages[2]!.reads.map((x) => x.source.owner)).toEqual([
      "economy",
      "economy",
      "production",
      "production",
      "world_state",
    ]);

    // Production conservation: consumed once, produced once
    const reserve = s.production.reserve(RESERVE_MAIN)!.value;
    expect(reserve.quantity).toEqual({ amount: 4, unit: reserve.quantity.unit });
    expect(reserve.consumed).toEqual([
      { operation_id: opId, quantity: { amount: 6, unit: reserve.quantity.unit } },
    ]);
    expect(s.production.completion(opId)!.fact.version).toBe(1);
    const entity = s.production.acceptedEntity(FIXTURE_WORLD_ID, `durable:${opId}`)!;
    expect(entity.fact.version).toBe(1);
    expect(s.production.availability(opId).state).toBe("ACCEPTED_AVAILABLE");

    // Economy: realized access, derived from and pinned to the accepted chain
    const access = s.economy.access(DEMAND_1);
    expect(access.state).toBe("REALIZED_ACCESS");
    const z = s.economy.realization(DEMAND_1)!;
    expect(z.fact.owner).toBe("economy");
    expect(z.fact.version).toBe(1);
    expect(z.value).toMatchObject({
      demand_envelope_id: DEMAND_1,
      demand: { fact_key: economyDemandKey(DEMAND_1), version: 1 },
      request: { fact_key: economyRequestKey(opId), request_id: opId, version: 1 },
      production: {
        operation: { fact_key: productionOperationKey(opId), version: 2 },
        completion: { fact_key: productionCompletionKey(opId), version: 1 },
      },
      delivery_result: {
        owner: "world_state",
        fact_key: entityKey(opId),
        entity_id: `durable:${opId}`,
        version: 1,
      },
      realized_access: {
        basis: "CUSTODIAN_ACCEPTED_SAME_CONSERVED_REFERENCE",
        output_class: OUTPUT_CLASS,
        quantity: { amount: 1, unit: OUTPUT_UNIT },
        physical_custody: "REMAINS_WITH_WORLD_STATE_FALLBACK_CUSTODIAN",
      },
      realized_at: PROD_TC, // the declared boundary, never the requested horizon
    });
    // Economy holds no stock: the one current physical quantity is World-State's, unchanged by Economy
    expect(JSON.stringify(z.value)).not.toMatch(/holder|title|reserv|inventory|price|owner_ref/i);
    expect(s.campaign.store.getFact(entityKey(opId))!.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("Economy cannot rewrite the originating demand, request or pre-commit availability after the fact", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    const demandBefore = s.campaign.store.getFact(economyDemandKey(DEMAND_1))!;
    const requestBefore = s.campaign.store.getFact(economyRequestKey(opId))!;
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    // sealed, version 1, byte-identical value, and the availability still says no supply existed
    expect(s.campaign.store.getFact(economyDemandKey(DEMAND_1))).toEqual(demandBefore);
    expect(s.campaign.store.getFact(economyRequestKey(opId))).toEqual(requestBefore);
    expect(s.economy.demand(DEMAND_1)!.value.pre_commit_availability.supply_for_request).toBe(
      "ABSENT",
    );
    // the realized output exists strictly after the demand it was committed against
    const rev = (key: string) =>
      s.campaign.store.lookupReceipt(s.campaign.store.getFact(key)!.provenance.intent_id)!.revision;
    expect(rev(entityKey(opId))).toBeGreaterThan(rev(economyDemandKey(DEMAND_1)));
    expect(rev(economyRealizationKey(DEMAND_1))).toBeGreaterThan(rev(entityKey(opId)));
  });
});

describe("Production completion alone is NOT satisfaction; only the custodian's acceptance releases it", () => {
  const withoutAcceptance = (s: { campaign: { store: any } }) =>
    new TemporalCoordinator(
      s.campaign.store,
      new StageProviderRegistry([productionCompletionProvider, economyRealizationProvider]),
    );
  const withoutEconomy = (s: { campaign: { store: any } }) =>
    new TemporalCoordinator(
      s.campaign.store,
      new StageProviderRegistry([productionCompletionProvider, worldFallbackAcceptanceProvider]),
    );

  it("completed but not accepted: no realized access, no entity, the demand stays open, and the realization stage is blocked behind the acceptance", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    const c = withoutAcceptance(s);
    const r = await must(c.advance(prodAdvanceRequest("tx-1", PROD_T1)));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.stages.map((x) => x.stage.owner_operation.operation)).toEqual([
      OP_COMPLETE,
    ]);
    expect(
      r.transaction.outcome.unresolved_dependents.map((u) => [
        u.stage.owner_operation.operation,
        u.reason,
      ]),
    ).toEqual([
      [OP_ACCEPT, "PROVIDER_ABSENT"],
      [OP_REALIZE, "PREDECESSOR_BLOCKED"],
    ]);
    // Production completed (consumed once, sealed once) …
    expect(s.production.operation(opId)!.value.status.state).toBe("COMPLETED");
    expect(s.production.reserve(RESERVE_MAIN)!.value.quantity.amount).toBe(4);
    expect(s.production.availability(opId).state).toBe("COMPLETED_PENDING_ACCEPTANCE");
    // … but nothing is accepted and Economy has NOT recorded satisfaction
    expect(s.campaign.store.getFact(entityKey(opId))).toBeUndefined();
    expect(s.economy.realization(DEMAND_1)).toBeUndefined();
    expect(s.economy.access(DEMAND_1)).toEqual({ state: "DEMAND_OPEN" });
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(1); // the boundary stays active
    expect(s.campaign.verify()).toEqual([]);

    // the continuation (with the custodian available) ADOPTS the committed completion and accepts and
    // realizes once: no second consumption, completion, output, acceptance or Economy result
    const completionIntent = stageIntentId({
      causal_process_id: `production-operation:${opId}`,
      owner_operation: { owner: "production", operation: OP_COMPLETE },
      prospective_result_id: `completion:${opId}`,
    });
    const receiptBefore = s.campaign.store.lookupReceipt(completionIntent)!;
    const done = await must(
      s.coordinator.continueRemainder({
        transaction_id: "tx-2",
        cause: "cause-tx-2",
        trigger: { kind: "fixture-continue", ref: "ref-tx-2" },
        context: { role: "role.player", permission: "permission.player_choice.commit" },
        publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
      }),
    );
    expect(done.adopted.map((k) => k.owner_operation.operation)).toEqual([OP_COMPLETE]);
    expect(s.campaign.store.lookupReceipt(completionIntent)).toEqual(receiptBefore);
    expect(s.production.reserve(RESERVE_MAIN)!.value.quantity.amount).toBe(4);
    expect(s.production.availability(opId).state).toBe("ACCEPTED_AVAILABLE");
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    expect(s.economy.realization(DEMAND_1)!.fact.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("accepted but Economy's own stage unresolved: the physical result exists, access is still not recorded, and a later continuation records it once", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    const c = withoutEconomy(s);
    const r = await must(c.advance(prodAdvanceRequest("tx-1", PROD_T1)));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(
      r.transaction.outcome.unresolved_dependents.map((u) => [
        u.stage.owner_operation.operation,
        u.reason,
      ]),
    ).toEqual([[OP_REALIZE, "PROVIDER_ABSENT"]]);
    expect(s.production.availability(opId).state).toBe("ACCEPTED_AVAILABLE");
    expect(s.economy.realization(DEMAND_1)).toBeUndefined();
    expect(s.economy.access(DEMAND_1)).toEqual({ state: "DEMAND_OPEN" });
    // the object is not retired while a declared stage is uncommitted
    expect(s.coordinator.object(`obj-production-${opId}`)!.value.next_boundary).not.toBeNull();
    expect(s.campaign.verify()).toEqual([]);
    const done = await must(
      s.coordinator.continueRemainder({
        transaction_id: "tx-2",
        cause: "cause-tx-2",
        trigger: { kind: "fixture-continue", ref: "ref-tx-2" },
        context: { role: "role.player", permission: "permission.player_choice.commit" },
        publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
      }),
    );
    expect(done.adopted.map((k) => k.owner_operation.operation).sort()).toEqual(
      [OP_ACCEPT, OP_COMPLETE].sort(),
    );
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    expect(s.production.acceptedEntity(FIXTURE_WORLD_ID, `durable:${opId}`)!.fact.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("IM-02: only the engaged chain becomes active; no Economy tick, scan or refresh (WS-004 §27.13, §33)", () => {
  it("an advance short of the boundary engages nothing and changes no Economy, Production or Population state", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    const before = econSummary(s.campaign, s.coordinator);
    const r = await must(s.coordinator.advance(prodAdvanceRequest("tx-early", at(120))));
    expect(r.transaction.engaged).toEqual([]);
    expect(r.transaction.stages).toEqual([]);
    const after = econSummary(s.campaign, s.coordinator);
    expect(after.economy).toEqual(before.economy);
    expect(after.production).toEqual(before.production);
    expect(after.population).toEqual(before.population);
    expect(after.objects).toEqual(before.objects);
    expect(s.economy.access(DEMAND_1).state).toBe("DEMAND_OPEN");
  });

  it("the stage resolves at the operation's own boundary, never the requested horizon, however the advance is sliced or stopped", async () => {
    const a = await seededEconomyCampaign(tempDir());
    await issueStartRegister(a, DEMAND_1, 1);
    await must(a.coordinator.advance(prodStopAtBoundaryRequest("tx-1", opId)));
    expect(a.economy.realization(DEMAND_1)!.value.realized_at).toEqual(PROD_TC);
    const b = await seededEconomyCampaign(tempDir());
    await issueStartRegister(b, DEMAND_1, 1);
    await must(
      b.coordinator.advance(prodAdvanceRequest("tx-1", at(500)), { slices: [at(120), at(130)] }),
    );
    expect(b.economy.realization(DEMAND_1)!.value).toEqual(a.economy.realization(DEMAND_1)!.value);
    expect(b.economy.realization(DEMAND_1)!.fact.provenance.group_id).toBe(
      a.economy.realization(DEMAND_1)!.fact.provenance.group_id,
    );
  });

  it("an unrelated demand, operation, Reserve and Population ledger are never read, staged or written", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    // an unrelated demand carried by the OTHER ledger, on the OTHER Reserve, with a LATER boundary
    await must(
      s.economy.issueDemand({
        ...economyPublication(30),
        demand: issueInput(DEMAND_OTHER, { carrier: unitCarrier("o-1", LEDGER_OTHER) }),
      }),
    );
    await startAndRegisterOperation(s, DEMAND_OTHER, 30, {
      reserve_id: RESERVE_OTHER,
      input: 5,
      completion_at: at(260),
    });
    const before = econSummary(s.campaign, s.coordinator);
    const spy = spyStore(s.campaign.store);
    const c = new TemporalCoordinator(spy.store, economyProviders());
    await must(c.advance(prodAdvanceRequest("tx-1", at(150))));
    const touched = [...new Set(spy.getFacts)];
    expect(touched.some((k) => k.includes(operationOf(DEMAND_OTHER)))).toBe(false);
    expect(touched.some((k) => k.includes(DEMAND_OTHER))).toBe(false);
    expect(touched.some((k) => k.includes(RESERVE_OTHER))).toBe(false);
    expect(touched.some((k) => k.includes(LEDGER_OTHER))).toBe(false);
    expect(touched).not.toContain(productionReserveKey(RESERVE_OTHER));
    expect(spy.listCalls()).toBe(0);
    for (const g of spy.commits)
      expect(g.writes.every((w) => !w.key.includes(DEMAND_OTHER) && !w.key.includes("other"))).toBe(
        true,
      );
    const after = econSummary(s.campaign, s.coordinator);
    expect(after.economy.filter((f) => f.key.includes(DEMAND_OTHER))).toEqual(
      before.economy.filter((f) => f.key.includes(DEMAND_OTHER)),
    );
    expect(after.population).toEqual(before.population);
    expect(s.economy.access(DEMAND_OTHER).state).toBe("DEMAND_OPEN");
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
  });

  it("two demands on one Reserve each realize once, independently, in one transaction", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1, { input: 6 });
    await issueStartRegister(s, DEMAND_2, 2, { input: 4 });
    await must(s.coordinator.advance(prodAdvanceRequest("tx-1", PROD_T1)));
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    expect(s.economy.access(DEMAND_2).state).toBe("REALIZED_ACCESS");
    const r = s.production.reserve(RESERVE_MAIN)!.value;
    expect(r.quantity.amount).toBe(0);
    expect(r.consumed.map((c) => c.operation_id)).toEqual([
      operationOf(DEMAND_1),
      operationOf(DEMAND_2),
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an incompatible second request gets no Production credit and no Economy result: demand does not create supply", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1, { input: 6 });
    // Economy may issue the second demand and its request (it is an economic claim) …
    await must(s.economy.issueDemand({ ...economyPublication(2), demand: issueInput(DEMAND_2) }));
    // … but Production's RC-06 start gives it no credit against already-committed material
    const r = await s.production.startOperation({
      ...prodPublication(50),
      start: economyStartInput(DEMAND_2, { input: 6 }),
    });
    expect(!r.ok && r.error.code).toBe("CLAIM_INCOMPATIBLE");
    expect(s.production.operation(operationOf(DEMAND_2))).toBeUndefined();
    await must(s.coordinator.advance(prodAdvanceRequest("tx-1", PROD_T1)));
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    expect(s.economy.access(DEMAND_2)).toEqual({ state: "DEMAND_OPEN" }); // unmet, never invented
    expect(s.campaign.store.getFact(entityKey(operationOf(DEMAND_2)))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("save → close → load → continue while the request is unresolved (IA-06 aspect; IM-12, IM-17)", () => {
  it("in-process: a closed and reloaded campaign continues the unresolved request to one realized access, byte-stably", async () => {
    const dir = tempDir();
    const s = await seededEconomyCampaign(dir);
    await issueStartRegister(s, DEMAND_1, 1);
    const before = econSummary(s.campaign, s.coordinator);
    await s.campaign.close();
    const re = await reopenEconomy(dir);
    expect(re.campaign.verify()).toEqual([]);
    expect(econSummary(re.campaign, re.coordinator)).toEqual(before);
    expect(re.economy.access(DEMAND_1)).toEqual({ state: "DEMAND_OPEN" });
    expect(re.production.availability(opId)).toEqual({ state: "NOT_COMPLETED" });
    const r = await must(re.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(r.transaction.stages).toHaveLength(3);
    const done = econSummary(re.campaign, re.coordinator);
    // replaying the same transaction changes nothing
    const again = await must(re.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    expect(again.replayed).toBe(true);
    expect(econSummary(re.campaign, re.coordinator)).toEqual(done);
    expect(re.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    expect(re.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
    // close and reload again after completion: the realized access persists, one of each
    await re.campaign.close();
    const re2 = await reopenEconomy(dir, "econ-reopen-2");
    expect(re2.campaign.verify()).toEqual([]);
    expect(econSummary(re2.campaign, re2.coordinator)).toEqual(done);
    expect(re2.economy.realization(DEMAND_1)!.fact.version).toBe(1);
    await re2.campaign.close();
  });

  it("across real operating-system processes: create → load → continue", () => {
    const dir = tempDir();
    const script = join(import.meta.dirname, "fixtures", "economy-process.ts");
    const run = (phase: string) =>
      JSON.parse(
        execFileSync(process.execPath, ["--experimental-strip-types", script, phase, dir], {
          encoding: "utf8",
        }),
      );
    const created = run("create");
    expect(created.violations).toEqual([]);
    const loaded = run("load");
    expect(loaded.violations).toEqual([]);
    expect(loaded.summary).toEqual(created.summary);
    expect(loaded.access).toEqual({ state: "DEMAND_OPEN" });
    const cont = run("continue");
    expect(cont.violations).toEqual([]);
    expect(cont.afterReplay).toEqual(cont.after);
    expect(cont.replayed).toBe(true);
    // the sealed demand/request pair is byte-untouched by the completion
    expect(cont.after.economy.filter((f: any) => !f.key.includes("realization"))).toEqual(
      cont.before.economy,
    );
    expect(cont.after.economy.map((f: any) => f.key)).toEqual(
      [economyDemandKey(DEMAND_1), economyRealizationKey(DEMAND_1), economyRequestKey(opId)].sort(),
    );
    expect(cont.access).toBe("REALIZED_ACCESS");
  });
});

// keep the imports referenced even when a block is skipped
void [
  EconomyAdapter,
  registerEconomyOperation,
  econCoordinator,
  temporalPublication,
  completionKeyRef(),
];
function completionKeyRef() {
  return productionCompletionKey;
}
