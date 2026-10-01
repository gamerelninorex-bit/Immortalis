// Unit evidence for the pure Economy derivations and the realized-access owner operation (WS-004 §8, §20, §21,
// §27.1, §27.2): a demand allocates to exactly one request derived from it; realized access exists only for the
// custodian-accepted result of that request, exactly, once; Production completion alone is never satisfaction; an
// operation that cannot lawfully resolve throws instead of publishing. Register lineage: IA-02, IA-05 (bounded).
// CAL-01/02/03 stay unresolved: no price, rate, yield or default exists.
import { describe, expect, it } from "vitest";
import {
  DurableCompletionEnvelopeSchema,
  EconomyDemandEnvelopeSchema,
  ProductionOperationSchema,
  ProductionRequestSchema,
  economyDemandKey,
  economyRealizationKey,
  economyRequestId,
  economyRequestKey,
  type FallbackPhysicalEntity,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  StageUnresolvedError,
  deriveAcceptedEntity,
  deriveEconomyRequest,
  deriveRealization,
  economyRealizationProvider,
  type RealizationPrior,
} from "@immortalis/engine";

const t = (value: number) => ({ unit: "u", value });
const q = (amount: number, unit = "d") => ({ amount, unit });
const loc = {
  world: { fact_key: "world/w/profile", entity_id: "w" },
  locus: { fact_key: "world/w/locus/l", entity_id: "l" },
};
const rid = economyRequestId("dem-1");
const opKey = `production/operation/${rid}`;
const completionKey = `production/completion/${rid}`;
const entityKey = `world/w/entity/durable:${rid}`;

const demand = EconomyDemandEnvelopeSchema.parse({
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
});
const request = ProductionRequestSchema.parse(deriveEconomyRequest(demand));
const operation = ProductionOperationSchema.parse({
  operation_id: rid,
  request: { owner: "economy", fact_key: economyRequestKey(rid), request_id: rid, version: 1 },
  reserve: { fact_key: "production/reserve/r-1", reserve_id: "r-1" },
  claim: { fact_key: `production/claim/claim:${rid}`, claim_id: `claim:${rid}` },
  transformation: {
    input: { material_class: "mat", quantity: q(6, "m") },
    output: { reference: `durable:${rid}`, output_class: "d", quantity: q(1), condition: "dc" },
  },
  support_basis: {
    tier: "TIER_A_EMBEDDED_BASELINE",
    labor: "NON_MATERIAL_EMBEDDED",
    specialist_competence: "NON_MATERIAL",
  },
  timing: { started_at: t(100), completion: { boundary_id: "b", at: t(140) } },
  status: { state: "COMPLETED", completed_at: t(140), completion_fact_key: completionKey },
});
const completion = DurableCompletionEnvelopeSchema.parse({
  operation_id: rid,
  conserved_reference: `durable:${rid}`,
  completed: { output_class: "d", quantity: q(1), condition: "dc" },
  completed_at: t(140),
  locality: loc,
  destination_custodian: {
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    entity_fact_key: entityKey,
    basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
  },
  acceptance_basis: "SAME_CONSERVED_REFERENCE_ACCEPTED_EXACTLY_ONCE",
  external_references: [],
  delta: {
    reserve: { fact_key: "production/reserve/r-1", version_before: 2, version_after: 3 },
    before: q(10, "m"),
    consumed: q(6, "m"),
    after: q(4, "m"),
  },
  close_stage: {
    causal_process_id: `production-operation:${rid}`,
    owner_operation: { owner: "production", operation: "production-complete-operation" },
    prospective_result_id: `completion:${rid}`,
  },
});
const entity: FallbackPhysicalEntity = deriveAcceptedEntity(completion, 1);

const prior: RealizationPrior = {
  demand: { key: economyDemandKey("dem-1"), version: 1, value: demand },
  request: { key: economyRequestKey(rid), version: 1, value: request },
  operation: { key: opKey, version: 2, value: operation },
  completion: { key: completionKey, version: 1, value: completion },
  entity: { key: entityKey, version: 1, value: entity },
  at: t(140),
};

describe("deriveEconomyRequest: exactly what the demand allocates", () => {
  it("is the demanded good and quantity at the demand's locality, sourced by Economy, with no priority", () => {
    expect(request).toEqual({
      request_id: rid,
      source: { owner: "economy", cause_ref: "economy/demand/dem-1" },
      requested_output: { output_class: "d", quantity: q(1) },
      scope: loc,
      priority_authority_ref: null,
    });
  });
  it("is deterministic, and adds nothing: no price, no purchasing capability, no entitlement, no supply", () => {
    expect(deriveEconomyRequest(demand)).toEqual(deriveEconomyRequest(demand));
    expect(Object.keys(request).sort()).toEqual(
      ["priority_authority_ref", "request_id", "requested_output", "scope", "source"].sort(),
    );
  });
});

describe("deriveRealization: access exists only for the accepted result of the demanded request, exactly, once", () => {
  it("records the demanded good once, pinned to the versions it read, at the operation's own boundary", () => {
    const r = deriveRealization(prior);
    expect(r.ok).toBe(true);
    const z = r.ok ? r.value : (null as never);
    expect(z).toMatchObject({
      demand_envelope_id: "dem-1",
      demand: { fact_key: economyDemandKey("dem-1"), version: 1 },
      production: {
        operation: { version: 2 },
        completion: { fact_key: completionKey, version: 1 },
      },
      delivery_result: { owner: "world_state", fact_key: entityKey, version: 1 },
      realized_access: {
        quantity: q(1),
        physical_custody: "REMAINS_WITH_WORLD_STATE_FALLBACK_CUSTODIAN",
      },
      realized_at: t(140),
    });
    expect(deriveRealization(prior)).toEqual(r); // deterministic
  });

  it("completion alone is not satisfaction: an entity the custodian did not accept from this completion, or accepted twice, is refused", () => {
    // not the custodian's derivation of this completion (a different condition, another reference, another version)
    for (const bad of [
      { ...entity, condition: "edited" },
      { ...entity, entity_id: "durable:other" },
      { ...entity, accepted_from: { ...entity.accepted_from, version: 2 } },
      { ...entity, quantity: q(2) },
    ])
      expect(deriveRealization({ ...prior, entity: { ...prior.entity, value: bad } }).ok).toBe(
        false,
      );
    // an entity at a version other than the single, create-only one
    const second = deriveRealization({ ...prior, entity: { ...prior.entity, version: 2 } });
    expect(!second.ok && second.error.message).toMatch(/completion alone is not satisfaction/);
    // the entity is not where the completion named its destination
    expect(
      deriveRealization({ ...prior, entity: { ...prior.entity, key: "world/w/entity/other" } }).ok,
    ).toBe(false);
  });

  it("refuses a request that is not the one the demand allocated to, or an operation that request did not fix", () => {
    expect(
      deriveRealization({
        ...prior,
        request: {
          ...prior.request,
          value: { ...request, requested_output: { ...request.requested_output, quantity: q(2) } },
        },
      }).ok,
    ).toBe(false);
    expect(
      deriveRealization({ ...prior, request: { ...prior.request, key: "economy/request/other" } })
        .ok,
    ).toBe(false);
    // an operation pinning another request version, another owner's request, or another operation identity
    for (const op of [
      { ...operation, request: { ...operation.request, version: 2 } },
      { ...operation, request: { ...operation.request, owner: "someone-else" } },
    ])
      expect(deriveRealization({ ...prior, operation: { ...prior.operation, value: op } }).ok).toBe(
        false,
      );
    expect(
      deriveRealization({
        ...prior,
        operation: { ...prior.operation, key: "production/operation/x" },
      }).ok,
    ).toBe(false);
  });

  it("refuses an operation that is not completed (in-progress work is not a result)", () => {
    const r = deriveRealization({
      ...prior,
      operation: { ...prior.operation, value: { ...operation, status: { state: "IN_PROGRESS" } } },
    });
    expect(!r.ok && r.error.message).toBe("the operation is not completed");
  });

  it("refuses an accepted entity that is not exactly the demanded good, quantity and locality: no partial, substitute or surplus satisfaction", () => {
    const other = (value: Partial<EconomyDemandEnvelopeSchemaT>) => ({
      ...prior.demand,
      value: { ...demand, ...value },
    });
    expect(
      deriveRealization({
        ...prior,
        demand: other({ demand_entry: { output_class: "d", quantity: q(2) } }),
        request: {
          ...prior.request,
          value: deriveEconomyRequest({
            ...demand,
            demand_entry: { output_class: "d", quantity: q(2) },
          }),
        },
      }).ok,
    ).toBe(false);
    expect(
      deriveRealization({
        ...prior,
        demand: other({ demand_entry: { output_class: "substitute", quantity: q(1) } }),
        request: {
          ...prior.request,
          value: deriveEconomyRequest({
            ...demand,
            demand_entry: { output_class: "substitute", quantity: q(1) },
          }),
        },
      }).ok,
    ).toBe(false);
  });

  it("is recorded at the operation's declared boundary instant and no other (never a requested horizon)", () => {
    for (const at of [139, 141, 300])
      expect(deriveRealization({ ...prior, at: t(at) }).ok).toBe(false);
    expect(deriveRealization({ ...prior, at: { unit: "other", value: 140 } }).ok).toBe(false);
  });
});

type EconomyDemandEnvelopeSchemaT = typeof demand;

const fact = (key: string, owner: string, value: unknown, version = 1): OwnerFact =>
  ({
    key,
    owner,
    facet: "f",
    value,
    unit: null,
    basis: "demand-basis",
    secrecy: "demand-secrecy",
    version,
    provenance: { group_id: "g", intent_id: "i", cause: "c", rule: {} },
  }) as unknown as OwnerFact;

describe("the Economy owner operation fails closed instead of publishing", () => {
  const resultKey = economyRealizationKey("dem-1");
  const reads = (over: Partial<Record<string, OwnerFact>> = {}) => {
    const all: Record<string, OwnerFact> = {
      demand: fact(economyDemandKey("dem-1"), "economy", demand),
      request: fact(economyRequestKey(rid), "economy", request),
      operation: fact(opKey, "production", operation, 2),
      completion: fact(completionKey, "production", completion),
      entity: fact(entityKey, "world_state", entity),
      ...over,
    };
    return Object.values(all).map((f) => ({ read: {} as never, fact: f }));
  };
  const input = (
    over: { reads?: ReturnType<typeof reads>; at?: number; prior?: Map<string, OwnerFact> } = {},
  ) => ({
    stage: {} as never,
    produces: [resultKey],
    span: { from: t(100), to: t(over.at ?? 140), elapsed: (over.at ?? 140) - 100 },
    reads: over.reads ?? reads(),
    prior: over.prior ?? new Map<string, OwnerFact>(),
  });

  it("writes exactly one result, inheriting the demand's basis and secrecy, derived by the same rule admission re-derives", () => {
    const w = economyRealizationProvider.compute(input());
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      key: resultKey,
      basis: "demand-basis",
      secrecy: "demand-secrecy",
    });
    expect((w[0]!.value as { realized_at: unknown }).realized_at).toEqual(t(140));
    const d = deriveRealization(prior);
    expect(w[0]!.value).toEqual(d.ok ? d.value : null);
  });

  it("without the custodian's accepted entity, with a malformed source, or at another instant it is unresolved, not published", () => {
    const without = reads().filter((r) => r.fact.owner !== "world_state");
    expect(() => economyRealizationProvider.compute(input({ reads: without }))).toThrow(
      StageUnresolvedError,
    );
    expect(() =>
      economyRealizationProvider.compute(
        input({ reads: reads({ entity: fact(entityKey, "world_state", { nope: 1 }) }) }),
      ),
    ).toThrow(StageUnresolvedError);
    expect(() =>
      economyRealizationProvider.compute(
        input({
          reads: reads({ entity: fact(entityKey, "world_state", { ...entity, condition: "x" }) }),
        }),
      ),
    ).toThrow(StageUnresolvedError);
    for (const at of [139, 141, 300])
      expect(() => economyRealizationProvider.compute(input({ at }))).toThrow(StageUnresolvedError);
  });

  it("a result that already exists is not produced again, and a stage that writes anything else is refused", () => {
    expect(() =>
      economyRealizationProvider.compute(
        input({ prior: new Map([[resultKey, fact(resultKey, "economy", {})]]) }),
      ),
    ).toThrow(StageUnresolvedError);
    expect(() =>
      economyRealizationProvider.compute({
        ...input(),
        produces: [resultKey, "economy/realization/y"],
      }),
    ).toThrow(StageUnresolvedError);
    expect(() => economyRealizationProvider.compute({ ...input(), produces: [] })).toThrow(
      StageUnresolvedError,
    );
  });
});
