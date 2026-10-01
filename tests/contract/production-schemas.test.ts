// Contract evidence for the Production & Resource Conservation Backbone Foundation (fifth slice): the strict
// Production Reserve, RC-06 Claim, operation (RC-10 inputs), Durable Completion Envelope (RC-07 retained delta)
// and the World-State fallback entity. Malformed objects are rejected; no field exists in which a labor
// quantity, a priority, a movement, a source drawdown, a yield or a second physical condition could be stored.
// Register lineage: IA-02, IA-03, IA-05 (bounded RC-06 partial); RC-02/06/07/10. Governing lock:
// spec/f027/spec-lock.json (F-027 v1.0).
import { describe, expect, it } from "vitest";
import {
  DurableCompletionEnvelopeSchema,
  FallbackPhysicalEntitySchema,
  ProductionClaimSchema,
  ProductionOperationSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  productionBoundaryId,
  productionClaimId,
  productionClaimKey,
  productionCompletionKey,
  productionCompletionStage,
  productionObjectId,
  productionOperationKey,
  productionOutputReference,
  productionProcessId,
  productionReserveKey,
  worldAcceptanceStage,
  worldFallbackEntityKey,
  parseStageKey,
} from "@immortalis/contracts";

const t = (value: number) => ({ unit: "u", value });
const q = (amount: number, unit = "m") => ({ amount, unit });
const loc = {
  world: { fact_key: "world/w/profile", entity_id: "w" },
  locus: { fact_key: "world/w/locus/l", entity_id: "l" },
};
const stage = productionCompletionStage("op-1");

const reserve = (over: Record<string, unknown> = {}) => ({
  reserve_id: "r-1",
  material_class: "mat",
  established: q(10),
  quantity: q(10),
  consumed: [],
  condition: "c",
  locality: loc,
  holding: "HELD_LOCAL_BY_PRODUCTION",
  claims: [],
  ...over,
});
const claim = (over: Record<string, unknown> = {}) => ({
  claim_id: "claim:op-1",
  operation_id: "op-1",
  conserved: {
    kind: "PRODUCTION_RESERVE_QUANTITY",
    fact_key: "production/reserve/r-1",
    reserve_id: "r-1",
  },
  quantity: q(6),
  overlap_basis: "SAME_RESERVE_QUANTITY_UNTIL_CONSUMED",
  interval: { from: t(100), until: t(140) },
  priority_basis: null,
  lifecycle: { status: "ACTIVE" },
  lineage: { request: { owner: "src", fact_key: "src/req-1", version: 1 } },
  ...over,
});
const operation = (over: Record<string, unknown> = {}) => ({
  operation_id: "op-1",
  request: { owner: "src", fact_key: "src/req-1", request_id: "op-1", version: 1 },
  reserve: { fact_key: "production/reserve/r-1", reserve_id: "r-1" },
  claim: { fact_key: "production/claim/claim:op-1", claim_id: "claim:op-1" },
  transformation: {
    input: { material_class: "mat", quantity: q(6) },
    output: { reference: "durable:op-1", output_class: "d", quantity: q(1, "d"), condition: "dc" },
  },
  support_basis: {
    tier: "TIER_A_EMBEDDED_BASELINE",
    labor: "NON_MATERIAL_EMBEDDED",
    specialist_competence: "NON_MATERIAL",
  },
  timing: { started_at: t(100), completion: { boundary_id: "b", at: t(140) } },
  status: { state: "IN_PROGRESS" },
  ...over,
});
const envelope = (over: Record<string, unknown> = {}) => ({
  operation_id: "op-1",
  conserved_reference: "durable:op-1",
  completed: { output_class: "d", quantity: q(1, "d"), condition: "dc" },
  completed_at: t(140),
  locality: loc,
  destination_custodian: {
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    entity_fact_key: "world/w/entity/durable:op-1",
    basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
  },
  acceptance_basis: "SAME_CONSERVED_REFERENCE_ACCEPTED_EXACTLY_ONCE",
  external_references: [],
  delta: {
    reserve: { fact_key: "production/reserve/r-1", version_before: 2, version_after: 3 },
    before: q(10),
    consumed: q(6),
    after: q(4),
  },
  close_stage: stage,
  ...over,
});
const entity = (over: Record<string, unknown> = {}) => ({
  entity_id: "durable:op-1",
  entity_class: "d",
  quantity: q(1, "d"),
  condition: "dc",
  locality: loc,
  custodian: {
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
  },
  accepted_from: {
    owner: "production",
    fact_key: "production/completion/op-1",
    version: 1,
    operation_id: "op-1",
  },
  ...over,
});

const ok = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  expect(schema.safeParse(v).success).toBe(true);
const no = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  expect(schema.safeParse(v).success).toBe(false);

describe("Production Reserve: conservation is a property of the value (WS-003 §2, §4, §15)", () => {
  it("accepts an exact Reserve, including one that is empty or partly consumed", () => {
    ok(ProductionReserveSchema, reserve());
    ok(ProductionReserveSchema, reserve({ established: q(0), quantity: q(0) }));
    ok(
      ProductionReserveSchema,
      reserve({ quantity: q(4), consumed: [{ operation_id: "op-1", quantity: q(6) }] }),
    );
  });
  it("rejects a Reserve whose held and consumed quantity is not what was established", () => {
    no(ProductionReserveSchema, reserve({ quantity: q(11) }));
    no(
      ProductionReserveSchema,
      reserve({ quantity: q(3), consumed: [{ operation_id: "op-1", quantity: q(6) }] }),
    );
    no(
      ProductionReserveSchema,
      reserve({ quantity: q(4, "other"), consumed: [{ operation_id: "op-1", quantity: q(6) }] }),
    );
  });
  it("rejects fractional, negative and non-finite quantities (exact only; no tolerance)", () => {
    for (const amount of [1.5, -1, Number.NaN, Infinity])
      no(ProductionReserveSchema, reserve({ quantity: q(amount) }));
  });
  it("records consumption once per operation, sorted; open claims sorted and unique", () => {
    no(
      ProductionReserveSchema,
      reserve({
        established: q(10),
        quantity: q(2),
        consumed: [
          { operation_id: "b", quantity: q(4) },
          { operation_id: "a", quantity: q(4) },
        ],
      }),
    );
    no(ProductionReserveSchema, reserve({ claims: ["claim:b", "claim:a"] }));
    no(ProductionReserveSchema, reserve({ claims: ["claim:a", "claim:a"] }));
  });
  it("cannot be in transfer, carry a location other than the canonical one, or smuggle an unmodelled field", () => {
    no(ProductionReserveSchema, reserve({ holding: "IN_TRANSFER" }));
    for (const extra of ["location", "route", "carrier", "price", "owner_title", "yield", "rate"]) {
      no(ProductionReserveSchema, reserve({ [extra]: "x" }));
    }
  });
});

describe("RC-06 Claim: transient coordination evidence, never ownership or a winner", () => {
  it("accepts an active claim and a consumed claim, and nothing else", () => {
    ok(ProductionClaimSchema, claim());
    ok(
      ProductionClaimSchema,
      claim({ lifecycle: { status: "CONSUMED", at: t(140), by_stage: stage } }),
    );
    no(ProductionClaimSchema, claim({ lifecycle: { status: "RELEASED" } }));
    no(ProductionClaimSchema, claim({ lifecycle: { status: "CONSUMED", at: t(140) } }));
  });
  it("carries no priority basis, no automatic precedence, no title and no inventory field", () => {
    for (const bad of ["first-come", "authority-1", 1])
      no(ProductionClaimSchema, claim({ priority_basis: bad }));
    for (const extra of ["priority", "rank", "owner", "title", "holder", "inventory", "winner"]) {
      no(ProductionClaimSchema, claim({ [extra]: "x" }));
    }
  });
  it("is for a positive quantity of one conserved Reserve over a forward interval", () => {
    no(ProductionClaimSchema, claim({ quantity: q(0) }));
    no(ProductionClaimSchema, claim({ interval: { from: t(140), until: t(140) } }));
    no(ProductionClaimSchema, claim({ interval: { from: t(150), until: t(140) } }));
    no(
      ProductionClaimSchema,
      claim({ conserved: { kind: "ANY_STOCK", fact_key: "x", reserve_id: "r" } }),
    );
    no(ProductionClaimSchema, claim({ overlap_basis: "PRIORITY_ORDER" }));
  });
});

describe("Production Request carrier and the operation (WS-003 §§3, 8, 13A)", () => {
  it("a request has no priority/authority reference and no price, demand or horizon", () => {
    const req = {
      request_id: "op-1",
      source: { owner: "src", cause_ref: "c" },
      requested_output: { output_class: "d", quantity: q(1, "d") },
      scope: loc,
      priority_authority_ref: null,
    };
    ok(ProductionRequestSchema, req);
    no(ProductionRequestSchema, { ...req, priority_authority_ref: "a" });
    for (const extra of ["price", "demand", "urgency", "horizon", "willingness_to_pay"]) {
      no(ProductionRequestSchema, { ...req, [extra]: 1 });
    }
  });
  it("the support basis is Tier A embedded and NON-material: no labor quantity, specialist, competence or coefficient is representable", () => {
    ok(ProductionOperationSchema, operation());
    for (const bad of [
      { tier: "TIER_C", labor: "NON_MATERIAL_EMBEDDED", specialist_competence: "NON_MATERIAL" },
      {
        tier: "TIER_A_EMBEDDED_BASELINE",
        labor: "MATERIAL",
        specialist_competence: "NON_MATERIAL",
      },
      {
        tier: "TIER_A_EMBEDDED_BASELINE",
        labor: "NON_MATERIAL_EMBEDDED",
        specialist_competence: "REQUIRED",
      },
      {
        tier: "TIER_A_EMBEDDED_BASELINE",
        labor: "NON_MATERIAL_EMBEDDED",
        specialist_competence: "NON_MATERIAL",
        labor_hours: 3,
      },
      { tier: "TIER_A_EMBEDDED_BASELINE", labor: 3, specialist_competence: "NON_MATERIAL" },
    ])
      no(ProductionOperationSchema, operation({ support_basis: bad }));
    for (const extra of [
      "labor_claim",
      "population_ref",
      "kti_ref",
      "productivity",
      "rate",
      "yield",
      "throughput",
      "duration",
    ])
      no(ProductionOperationSchema, operation({ [extra]: 1 }));
  });
  it("declares exactly one completion boundary after the start; completion happens exactly there", () => {
    no(
      ProductionOperationSchema,
      operation({ timing: { started_at: t(140), completion: { boundary_id: "b", at: t(140) } } }),
    );
    no(
      ProductionOperationSchema,
      operation({ timing: { started_at: t(150), completion: { boundary_id: "b", at: t(140) } } }),
    );
    no(
      ProductionOperationSchema,
      operation({
        timing: {
          started_at: t(100),
          completion: { boundary_id: "b", at: t(140) },
          recurrence: "weekly",
        },
      }),
    );
    ok(
      ProductionOperationSchema,
      operation({
        status: {
          state: "COMPLETED",
          completed_at: t(140),
          completion_fact_key: "production/completion/op-1",
        },
      }),
    );
    no(
      ProductionOperationSchema,
      operation({
        status: {
          state: "COMPLETED",
          completed_at: t(300),
          completion_fact_key: "production/completion/op-1",
        },
      }),
    );
  });
  it("the declared transformation is exact: positive input and output, one conserved reference, no ratio or yield", () => {
    no(
      ProductionOperationSchema,
      operation({
        transformation: {
          input: { material_class: "m", quantity: q(0) },
          output: operation().transformation.output,
        },
      }),
    );
    no(
      ProductionOperationSchema,
      operation({ transformation: { ...operation().transformation, yield: 0.9 } }),
    );
    no(
      ProductionOperationSchema,
      operation({ transformation: { ...operation().transformation, ratio: 2 } }),
    );
  });
});

describe("Durable Completion Envelope and the World-State fallback entity (CG-2; WS-003 §2)", () => {
  it("accepts the sealed completion record; its delta must balance and advance the reserve one version", () => {
    ok(DurableCompletionEnvelopeSchema, envelope());
    no(DurableCompletionEnvelopeSchema, envelope({ delta: { ...envelope().delta, after: q(5) } }));
    no(
      DurableCompletionEnvelopeSchema,
      envelope({ delta: { ...envelope().delta, consumed: q(6, "other") } }),
    );
    no(
      DurableCompletionEnvelopeSchema,
      envelope({
        delta: { ...envelope().delta, reserve: { ...envelope().delta.reserve, version_after: 4 } },
      }),
    );
  });
  it("names the World-State fallback as destination and no title/holding/control/use reference where none is relevant", () => {
    no(
      DurableCompletionEnvelopeSchema,
      envelope({
        destination_custodian: { ...envelope().destination_custodian, owner: "production" },
      }),
    );
    no(
      DurableCompletionEnvelopeSchema,
      envelope({
        destination_custodian: { ...envelope().destination_custodian, facet: "asset_registry" },
      }),
    );
    no(
      DurableCompletionEnvelopeSchema,
      envelope({ external_references: [{ kind: "title", ref: "x" }] }),
    );
    no(DurableCompletionEnvelopeSchema, envelope({ current_condition: "dc" }));
    no(DurableCompletionEnvelopeSchema, envelope({ available: true }));
  });
  it("the fallback entity is World-State's: one identity, quantity and condition; no ledger, inventory or location", () => {
    ok(FallbackPhysicalEntitySchema, entity());
    no(
      FallbackPhysicalEntitySchema,
      entity({ custodian: { ...entity().custodian, owner: "production" } }),
    );
    no(
      FallbackPhysicalEntitySchema,
      entity({ accepted_from: { ...entity().accepted_from, owner: "world_state" } }),
    );
    no(FallbackPhysicalEntitySchema, entity({ quantity: q(0, "d") }));
    for (const extra of [
      "inventory",
      "holder",
      "title",
      "location",
      "in_transfer",
      "price",
      "available",
    ]) {
      no(FallbackPhysicalEntitySchema, entity({ [extra]: "x" }));
    }
  });
});

describe("identities derive from the operation identity alone (one request, one operation, one reference)", () => {
  it("every key, id and StageKey is a pure function of the operation id", () => {
    expect(productionReserveKey("r")).toBe("production/reserve/r");
    expect(productionClaimKey(productionClaimId("op-1"))).toBe("production/claim/claim:op-1");
    expect(productionOperationKey("op-1")).toBe("production/operation/op-1");
    expect(productionCompletionKey("op-1")).toBe("production/completion/op-1");
    expect(worldFallbackEntityKey("w", productionOutputReference("op-1"))).toBe(
      "world/w/entity/durable:op-1",
    );
    expect(productionObjectId("op-1")).toBe("obj-production-op-1");
    expect(productionBoundaryId("op-1")).toBe("boundary-production-completion-op-1");
    expect(productionProcessId("op-1")).toBe("production-operation:op-1");
  });
  it("the two CG-2 stages are valid StageKeys that differ in owner operation and result, never in a horizon or version", () => {
    const a = parseStageKey(productionCompletionStage("op-1"));
    const b = parseStageKey(worldAcceptanceStage("op-1"));
    expect(a.ok && b.ok).toBe(true);
    expect(productionCompletionStage("op-1").causal_process_id).toBe(
      worldAcceptanceStage("op-1").causal_process_id,
    );
    expect(parseStageKey({ ...productionCompletionStage("op-1"), horizon: 300 }).ok).toBe(false);
  });
});
