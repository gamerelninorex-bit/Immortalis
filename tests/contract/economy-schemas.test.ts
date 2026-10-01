// Contract evidence for the Economy Demand → Production Request → Realized Access Backbone Foundation (sixth
// slice): the strict Demand Envelope with its fixed allocation relation, the Economy-owned Production Request
// (the existing WS-003 §13A carrier), and the realized-access result. Malformed objects are rejected; no field
// exists in which a population count or membership, a stock, a title or holding, a reservation, a price, a
// purchasing capability, an entitlement, a route or a delivery could be stored. Register lineage: IA-02, IA-03
// (partial); RC-02, RC-12; IM-06. Governing lock: spec/f027/spec-lock.json (F-027 v1.0).
import { describe, expect, it } from "vitest";
import {
  EconomyDemandEnvelopeSchema,
  EconomyRealizationSchema,
  IssueDemandInputSchema,
  ProductionRequestSchema,
  economyDemandIdOfRequest,
  economyDemandKey,
  economyRealizationKey,
  economyRealizationStage,
  economyRequestId,
  economyRequestKey,
  parseStageKey,
  productionProcessId,
} from "@immortalis/contracts";

const t = (value: number) => ({ unit: "u", value });
const q = (amount: number, unit = "d") => ({ amount, unit });
const loc = {
  world: { fact_key: "world/w/profile", entity_id: "w" },
  locus: { fact_key: "world/w/locus/l", entity_id: "l" },
};
const rid = economyRequestId("dem-1");

const demand = (over: Record<string, unknown> = {}) => ({
  demand_envelope_id: "dem-1",
  carrier_ref: { kind: "POPULATION_UNIT", ledger_id: "led", unit_id: "u-1" },
  carrier_basis_ref: { ledger: { fact_key: "population/led/ledger", version: 1 }, cohort: null },
  material_scope: loc,
  demand_entry: { output_class: "d", quantity: q(1) },
  allocation: {
    relation: "ONE_DEMAND_ONE_PRODUCTION_REQUEST",
    request: { fact_key: economyRequestKey(rid), request_id: rid },
    nature: "ECONOMIC_ALLOCATION_CLAIM_NOT_STOCK_TITLE_OR_RESERVATION",
  },
  pre_commit_availability: {
    read: "AS-OF-NOW",
    at: t(100),
    temporal_state: { fact_key: "temporal/state", version: 1 },
    supply_for_request: "ABSENT",
  },
  ...over,
});
const realization = (over: Record<string, unknown> = {}) => ({
  demand_envelope_id: "dem-1",
  demand: { fact_key: economyDemandKey("dem-1"), version: 1 },
  request: { fact_key: economyRequestKey(rid), request_id: rid, version: 1 },
  production: {
    operation: { fact_key: `production/operation/${rid}`, operation_id: rid, version: 2 },
    completion: { fact_key: `production/completion/${rid}`, version: 1 },
  },
  delivery_result: {
    owner: "world_state",
    fact_key: `world/w/entity/durable:${rid}`,
    entity_id: `durable:${rid}`,
    version: 1,
  },
  realized_access: {
    basis: "CUSTODIAN_ACCEPTED_SAME_CONSERVED_REFERENCE",
    output_class: "d",
    quantity: q(1),
    physical_custody: "REMAINS_WITH_WORLD_STATE_FALLBACK_CUSTODIAN",
  },
  realized_at: t(140),
  close_stage: economyRealizationStage(rid),
  ...over,
});

describe("identities are derived from the demand identity alone (a demand fixes one request)", () => {
  it("keys and the request identity are pure functions of the demand identity, and invertible", () => {
    expect(economyDemandKey("d")).toBe("economy/demand/d");
    expect(economyRequestKey(economyRequestId("d"))).toBe("economy/request/request:d");
    expect(economyRealizationKey("d")).toBe("economy/realization/d");
    expect(economyRequestId("d")).toBe(economyRequestId("d"));
    expect(economyDemandIdOfRequest(economyRequestId("d"))).toBe("d");
    expect(economyDemandIdOfRequest("request:")).toBeNull();
    expect(economyDemandIdOfRequest("req-1")).toBeNull(); // a foreign requester's identity is not an Economy one
  });
  it("the Economy stage shares the operation's causal process and carries no horizon, source version, retry or slice", () => {
    const s = economyRealizationStage("op-1");
    expect(s).toEqual({
      causal_process_id: productionProcessId("op-1"),
      owner_operation: { owner: "economy", operation: "economy-record-realized-access" },
      prospective_result_id: "realization:op-1",
    });
    expect(parseStageKey(s).ok).toBe(true);
    expect(parseStageKey({ ...s, requested_horizon: 1 }).ok).toBe(false);
  });
});

describe("Demand Envelope (WS-004 §5.2) and its fixed allocation relation (§11, §20)", () => {
  it("accepts a Unit carrier and a Cohort carrier pinned by reference", () => {
    expect(EconomyDemandEnvelopeSchema.safeParse(demand()).success).toBe(true);
    expect(
      EconomyDemandEnvelopeSchema.safeParse(
        demand({
          carrier_ref: { kind: "POPULATION_COHORT", ledger_id: "led", cohort_id: "c-1" },
          carrier_basis_ref: {
            ledger: { fact_key: "population/led/ledger", version: 1 },
            cohort: { fact_key: "population/led/cohort/c-1", version: 2 },
          },
        }),
      ).success,
    ).toBe(true);
  });
  it("a Cohort carrier pins its Cohort; a Unit carrier pins only its ledger", () => {
    const cohortNoPin = demand({
      carrier_ref: { kind: "POPULATION_COHORT", ledger_id: "led", cohort_id: "c-1" },
    });
    expect(EconomyDemandEnvelopeSchema.safeParse(cohortNoPin).success).toBe(false);
    const unitWithPin = demand({
      carrier_basis_ref: {
        ledger: { fact_key: "population/led/ledger", version: 1 },
        cohort: { fact_key: "population/led/cohort/c-1", version: 2 },
      },
    });
    expect(EconomyDemandEnvelopeSchema.safeParse(unitWithPin).success).toBe(false);
  });
  it("is an ECONOMIC claim only: no physical reservation, stock or title nature is representable", () => {
    for (const nature of ["PHYSICAL_RESERVATION", "STOCK", "TITLE", "HOLDING"]) {
      const d = demand();
      expect(
        EconomyDemandEnvelopeSchema.safeParse({
          ...d,
          allocation: { ...d.allocation, nature },
        }).success,
      ).toBe(false);
    }
    const d = demand();
    expect(
      EconomyDemandEnvelopeSchema.safeParse({
        ...d,
        allocation: { ...d.allocation, relation: "MANY_DEMANDS_ONE_REQUEST" },
      }).success,
    ).toBe(false);
  });
  it("seals 'no supply existed' with the demand: the pre-commit availability cannot say supply was present", () => {
    const d = demand();
    for (const supply_for_request of ["PRESENT", "AVAILABLE", true, null])
      expect(
        EconomyDemandEnvelopeSchema.safeParse({
          ...d,
          pre_commit_availability: { ...d.pre_commit_availability, supply_for_request },
        }).success,
      ).toBe(false);
    expect(
      EconomyDemandEnvelopeSchema.safeParse({
        ...d,
        pre_commit_availability: { ...d.pre_commit_availability, read: "AS-OF-DECLARED-CLOSE" },
      }).success,
    ).toBe(false);
  });
  it("is strict: no Population count or membership, stock, title, holding, reservation, price, currency, purchasing capability, entitlement, preference, route or delivery field can ride along", () => {
    for (const extra of [
      "count",
      "members",
      "units",
      "population",
      "stock",
      "inventory",
      "holder",
      "title",
      "reservation",
      "price",
      "currency",
      "purchasing_capability",
      "entitlement",
      "preference",
      "priority",
      "route",
      "delivery",
      "availability",
      "satisfied",
    ])
      expect(
        EconomyDemandEnvelopeSchema.safeParse({ ...demand(), [extra]: 1 }).success,
        extra,
      ).toBe(false);
    const d = demand();
    expect(
      EconomyDemandEnvelopeSchema.safeParse({
        ...d,
        carrier_ref: { ...d.carrier_ref, members: ["u-1"] },
      }).success,
    ).toBe(false);
  });
  it("demands a positive exact quantity of one good, and a pinned (not current) basis", () => {
    for (const quantity of [q(0), q(-1), { amount: 1.5, unit: "d" }, { amount: 1 }])
      expect(
        EconomyDemandEnvelopeSchema.safeParse(
          demand({ demand_entry: { output_class: "d", quantity } }),
        ).success,
      ).toBe(false);
    expect(
      EconomyDemandEnvelopeSchema.safeParse(
        demand({ carrier_basis_ref: { ledger: { fact_key: "x", version: 0 }, cohort: null } }),
      ).success,
    ).toBe(false);
  });
});

describe("the Economy-owned Production Request is the existing WS-003 §13A carrier", () => {
  it("is a well-formed ProductionRequest with Economy as its source and no priority/authority reference", () => {
    const r = {
      request_id: rid,
      source: { owner: "economy", cause_ref: economyDemandKey("dem-1") },
      requested_output: { output_class: "d", quantity: q(1) },
      scope: loc,
      priority_authority_ref: null,
    };
    expect(ProductionRequestSchema.safeParse(r).success).toBe(true);
    expect(ProductionRequestSchema.safeParse({ ...r, priority_authority_ref: "a" }).success).toBe(
      false,
    );
  });
});

describe("Realized access (WS-004 §8 step 6, §21): a record of access, never stock, title or a holding", () => {
  it("accepts the one result an accepted chain determines", () => {
    expect(EconomyRealizationSchema.safeParse(realization()).success).toBe(true);
  });
  it("names the custodian's accepted entity as the downstream result; Economy holds no physical custody", () => {
    expect(
      EconomyRealizationSchema.safeParse(
        realization({ delivery_result: { ...realization().delivery_result, owner: "economy" } }),
      ).success,
    ).toBe(false);
    for (const physical_custody of ["HELD_BY_ECONOMY", "TRANSFERRED_TO_CARRIER", "RESERVED"])
      expect(
        EconomyRealizationSchema.safeParse(
          realization({ realized_access: { ...realization().realized_access, physical_custody } }),
        ).success,
      ).toBe(false);
    expect(
      EconomyRealizationSchema.safeParse(
        realization({
          realized_access: { ...realization().realized_access, basis: "PRODUCTION_COMPLETED" },
        }),
      ).success,
    ).toBe(false);
  });
  it("pins the operation at a completed version and every upstream fact at a committed version", () => {
    const base = realization();
    expect(
      EconomyRealizationSchema.safeParse(
        realization({
          production: {
            ...base.production,
            operation: { ...base.production.operation, version: 1 },
          },
        }),
      ).success,
    ).toBe(false); // version 1 is the start, not a completed operation
    expect(
      EconomyRealizationSchema.safeParse(realization({ demand: { fact_key: "k", version: 0 } }))
        .success,
    ).toBe(false);
  });
  it("is strict: no holder, title, reservation, inventory, price, delivery or movement field can ride along", () => {
    for (const extra of [
      "holder",
      "title",
      "reservation",
      "inventory",
      "price",
      "delivery",
      "route",
      "carrier",
      "unmet_demand",
    ])
      expect(
        EconomyRealizationSchema.safeParse({ ...realization(), [extra]: 1 }).success,
        extra,
      ).toBe(false);
  });
});

describe("the one authored Economy input names a carrier and one demand entry, and nothing else", () => {
  it("accepts a carrier and a demand entry; rejects everything an Economy publication must not supply", () => {
    const ok = {
      demand_envelope_id: "dem-1",
      carrier: { kind: "POPULATION_UNIT", ledger_id: "led", unit_id: "u-1" },
      demand_entry: { output_class: "d", quantity: q(1) },
    };
    expect(IssueDemandInputSchema.safeParse(ok).success).toBe(true);
    for (const extra of [
      "owner",
      "facet",
      "authority",
      "rule",
      "request",
      "availability",
      "supply",
      "price",
      "count",
      "members",
    ])
      expect(IssueDemandInputSchema.safeParse({ ...ok, [extra]: "x" }).success, extra).toBe(false);
  });
});
