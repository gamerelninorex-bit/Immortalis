/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary schema values */
// Contract evidence for the Exact Finite Raw-Source Drawdown & Conserved Production Reserve Inflow slice: the strict World-State
// Source Condition and delivery record, Production's Capability / Access basis, the extraction, the Production-caused Source
// Delta, the per-key account, and the Reserve inflow ledger. Conservation is a property of the value. No field exists in which
// an estimate, a latent or ranged quantity, a yield, a rate, a renewal, a carried flow, a Next Boundary Basis, a labor
// coefficient, a transformation or a second remaining-endowment figure could be stored.
// Register lineage: IA-02, IA-03, IA-05 (bounded RC-06 partial); RC-02/04/06/07/10. Governing lock: spec/f027/spec-lock.json
// (F-027 v1.0). CAL-01/02/03 stay unresolved.
import { describe, expect, it } from "vitest";
import {
  EXTRACTION_OBJECT_PREFIX,
  ExtractionBasisSchema,
  ProductionExtractionSchema,
  ProductionReserveSchema,
  SourceAccountSchema,
  SourceDeltaSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  parseStageKey,
  productionExtractionBoundaryId,
  productionExtractionKey,
  productionExtractionObjectId,
  productionExtractionProcessId,
  productionExtractionBasisKey,
  productionReserveInflowStage,
  productionSourceAccountKey,
  productionSourceDeltaKey,
  productionSourceDeltaStage,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
  worldSourceDeliveryStage,
} from "@immortalis/contracts";

const t = (value: number) => ({ unit: "u", value });
const q = (amount: number, unit = "m") => ({ amount, unit });
const loc = {
  world: { fact_key: "world/w/profile", entity_id: "w" },
  locus: { fact_key: "world/w/locus/l", entity_id: "l" },
};
const access = { aspect: "a", statement: "loose on the surface" };

const source = (over: Record<string, unknown> = {}) => ({
  source_key: "s-1",
  locality: loc,
  dimension: "surface",
  material_class: "mat",
  depth: "EXACT_FINITE",
  establishment: {
    kind: "INITIAL_SETTING_FACT",
    statement: "an initial setting fact",
    quantity: q(5),
  },
  recoverable: q(5),
  delivered: [],
  access_facts: [access],
  exhaustion: null,
  ...over,
});
const extraction = (over: Record<string, unknown> = {}) => ({
  extraction_id: "x-1",
  request: { owner: "src", fact_key: "src/req-1", request_id: "x-1", version: 1 },
  basis: { fact_key: "production/extraction-basis/b-1", basis_id: "b-1", version: 1 },
  source: { fact_key: "world/w/source/s-1", source_key: "s-1", version: 1 },
  reserve: { fact_key: "production/reserve/r-1", reserve_id: "r-1" },
  account: { fact_key: "production/source-account/w/s-1" },
  material_class: "mat",
  quantity: q(3),
  support_basis: {
    tier: "TIER_A_EMBEDDED_BASELINE",
    labor: "NON_MATERIAL_EMBEDDED",
    specialist_competence: "NON_MATERIAL",
  },
  timing: { started_at: t(100), boundary: { boundary_id: "b", at: t(140) } },
  ...over,
});
const delta = (over: Record<string, unknown> = {}) => ({
  delta_id: "x-1",
  cause: {
    kind: "PRODUCTION_EXTRACTION_DRAWDOWN",
    extraction: { fact_key: "production/extraction/x-1", version: 1 },
    request: { owner: "src", fact_key: "src/req-1", version: 1 },
  },
  magnitude: q(3),
  source: { fact_key: "world/w/source/s-1", source_key: "s-1" },
  material_class: "mat",
  accounting: "DISCRETE_EPISODIC_RESIDUE",
  emitted_at: t(140),
  close_stage: productionSourceDeltaStage("x-1"),
  ...over,
});
const delivery = (over: Record<string, unknown> = {}) => ({
  delivery_id: "x-1",
  source: {
    fact_key: "world/w/source/s-1",
    source_key: "s-1",
    version_before: 1,
    version_after: 2,
  },
  delta: { fact_key: "production/source-delta/x-1", version: 1 },
  delivered: q(3),
  before: q(5),
  after: q(2),
  exhausted: false,
  delivered_at: t(140),
  contribution: { extraction_id: "x-1", accounting: "DISCRETE_EPISODIC_RESIDUE" },
  close_stage: worldSourceDeliveryStage("x-1"),
  ...over,
});
const account = (over: Record<string, unknown> = {}) => ({
  source: { fact_key: "world/w/source/s-1", source_key: "s-1" },
  locality: loc,
  material_class: "mat",
  unit: "m",
  watermark: t(100),
  open: [{ extraction_id: "x-1", quantity: q(3) }],
  ...over,
});
const basis = (over: Record<string, unknown> = {}) => ({
  basis_id: "b-1",
  source: { fact_key: "world/w/source/s-1", source_key: "s-1" },
  material_class: "mat",
  unit: "m",
  locality: loc,
  capability: {
    kind: "DIRECT_RAW_PHYSICAL_COLLECTION",
    support: {
      tier: "TIER_A_EMBEDDED_BASELINE",
      labor: "NON_MATERIAL_EMBEDDED",
      specialist_competence: "NON_MATERIAL",
    },
  },
  access: { mode: "DIRECT_PHYSICAL", relies_on: access, encumbrance: "NONE" },
  ...over,
});
const reserve = (over: Record<string, unknown> = {}) => ({
  reserve_id: "r-1",
  material_class: "mat",
  established: q(0),
  quantity: q(0),
  consumed: [],
  condition: "c",
  locality: loc,
  holding: "HELD_LOCAL_BY_PRODUCTION",
  claims: [],
  ...over,
});

const rejects = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  expect(schema.safeParse(v).success).toBe(false);

describe("World-State Source Condition: exact, finite, conserved by construction", () => {
  it("accepts an exact established condition and a delivered one", () => {
    expect(WorldSourceConditionSchema.safeParse(source()).success).toBe(true);
    expect(
      WorldSourceConditionSchema.safeParse(
        source({ recoverable: q(2), delivered: [{ delivery_id: "x-1", quantity: q(3) }] }),
      ).success,
    ).toBe(true);
  });
  it("conservation is a property of the value: established = recoverable + Σ delivered, in one unit", () => {
    rejects(WorldSourceConditionSchema, source({ recoverable: q(4) }));
    rejects(
      WorldSourceConditionSchema,
      source({ recoverable: q(3), delivered: [{ delivery_id: "x-1", quantity: q(3) }] }),
    );
    rejects(WorldSourceConditionSchema, source({ recoverable: q(5, "other") }));
    rejects(
      WorldSourceConditionSchema,
      source({ recoverable: q(2), delivered: [{ delivery_id: "x-1", quantity: q(3, "other") }] }),
    );
  });
  it("each delivery is recorded once, sorted", () => {
    rejects(
      WorldSourceConditionSchema,
      source({
        recoverable: q(0),
        delivered: [
          { delivery_id: "x-1", quantity: q(3) },
          { delivery_id: "x-1", quantity: q(2) },
        ],
        exhaustion: { kind: "PHYSICAL", delivery_id: "x-1" },
      }),
    );
    rejects(
      WorldSourceConditionSchema,
      source({
        recoverable: q(0),
        delivered: [
          { delivery_id: "x-2", quantity: q(2) },
          { delivery_id: "x-1", quantity: q(3) },
        ],
        exhaustion: { kind: "PHYSICAL", delivery_id: "x-1" },
      }),
    );
  });
  it("PHYSICAL exhaustion is typed and exact: present exactly when nothing is recoverable, and the result of a recorded delivery", () => {
    const exhausted = source({
      recoverable: q(0),
      delivered: [{ delivery_id: "x-1", quantity: q(5) }],
      exhaustion: { kind: "PHYSICAL", delivery_id: "x-1" },
    });
    expect(WorldSourceConditionSchema.safeParse(exhausted).success).toBe(true);
    rejects(WorldSourceConditionSchema, { ...exhausted, exhaustion: null });
    rejects(
      WorldSourceConditionSchema,
      source({ exhaustion: { kind: "PHYSICAL", delivery_id: "x-1" } }),
    );
    rejects(WorldSourceConditionSchema, {
      ...exhausted,
      exhaustion: { kind: "PHYSICAL", delivery_id: "x-9" },
    });
    // ACCESS exhaustion is a Production-side effort / yield curve: it has no representation in the source owner's fact
    rejects(WorldSourceConditionSchema, {
      ...exhausted,
      exhaustion: { kind: "ACCESS", delivery_id: "x-1" },
    });
  });
  it("an estimated, latent, ranged, probabilistic, renewing or flowing condition has no representation", () => {
    for (const patch of [
      { depth: "ESTIMATED" },
      { depth: "LATENT" },
      { depth: "RANGED" },
      { recoverable: { min: 3, max: 5, unit: "m" } },
      { estimate: q(5) },
      { source_estimate: q(5) },
      { probability: 0.5 },
      { rate: q(1) },
      { renewal: "seasonal" },
      { regeneration: q(1) },
      { flows: [] },
      { next_boundary_basis: "COMPUTED" },
      { sustainable: true },
      { remaining: q(2) },
    ])
      rejects(WorldSourceConditionSchema, source(patch));
    rejects(
      WorldSourceConditionSchema,
      source({ establishment: { kind: "ACTOR_ESTIMATE", statement: "s", quantity: q(5) } }),
    );
    rejects(
      WorldSourceConditionSchema,
      source({ establishment: { kind: "INITIAL_SETTING_FACT", statement: "s", quantity: q(0) } }),
    );
    rejects(WorldSourceConditionSchema, source({ access_facts: [access, access] }));
  });
  it("quantities are exact non-negative integers", () => {
    rejects(WorldSourceConditionSchema, source({ recoverable: q(2.5) }));
    rejects(WorldSourceConditionSchema, source({ recoverable: q(-1) }));
  });
});

describe("the World-State delivery record", () => {
  it("accepts the consumed actual delta and rejects every inconsistency", () => {
    expect(WorldSourceDeliverySchema.safeParse(delivery()).success).toBe(true);
    expect(
      WorldSourceDeliverySchema.safeParse(
        delivery({ delivered: q(5), after: q(0), exhausted: true }),
      ).success,
    ).toBe(true);
    rejects(WorldSourceDeliverySchema, delivery({ after: q(3) }));
    rejects(WorldSourceDeliverySchema, delivery({ exhausted: true }));
    rejects(WorldSourceDeliverySchema, delivery({ after: q(2, "other") }));
    rejects(
      WorldSourceDeliverySchema,
      delivery({ source: { ...delivery().source, version_after: 3 } }),
    );
    rejects(
      WorldSourceDeliverySchema,
      delivery({ contribution: { extraction_id: "x-2", accounting: "DISCRETE_EPISODIC_RESIDUE" } }),
    );
    rejects(
      WorldSourceDeliverySchema,
      delivery({ contribution: { extraction_id: "x-1", accounting: "RATE" } }),
    );
    rejects(WorldSourceDeliverySchema, { ...delivery(), rate: q(1) });
  });
});

describe("Production's Capability / Access basis: the narrow Tier A path only, and no assertion of success", () => {
  it("accepts the narrow direct raw collection basis", () => {
    expect(ExtractionBasisSchema.safeParse(basis()).success).toBe(true);
  });
  it("a labor-calibrated, specialist, encumbered, transformative or asserted-capable path is unrepresentable", () => {
    const b = basis() as any;
    for (const patch of [
      { capability: { ...b.capability, kind: "PROCESSING" } },
      { capability: { ...b.capability, support: { ...b.capability.support, labor: "MATERIAL" } } },
      {
        capability: {
          ...b.capability,
          support: { ...b.capability.support, specialist_competence: "MATERIAL" },
        },
      },
      { capability: { ...b.capability, support: { ...b.capability.support, tier: "TIER_C" } } },
      { access: { ...b.access, encumbrance: "LEGAL" } },
      { access: { ...b.access, mode: "DELIVERED" } },
      { can_extract: true },
      { succeeded: true },
      { labor_coefficient: 2 },
      { yield: 1 },
      { population_ref: "p" },
      { kti_ref: "k" },
    ])
      rejects(ExtractionBasisSchema, basis(patch));
    rejects(ExtractionBasisSchema, basis({ access: { ...b.access, relies_on: { aspect: "a" } } }));
  });
});

describe("the extraction, the Source Delta and the account", () => {
  it("the extraction is sealed intent with its pins: exact quantity, a boundary after the start, Tier A support only", () => {
    expect(ProductionExtractionSchema.safeParse(extraction()).success).toBe(true);
    rejects(ProductionExtractionSchema, extraction({ quantity: q(0) }));
    rejects(
      ProductionExtractionSchema,
      extraction({ timing: { started_at: t(140), boundary: { boundary_id: "b", at: t(140) } } }),
    );
    rejects(
      ProductionExtractionSchema,
      extraction({
        timing: {
          started_at: t(100),
          boundary: { boundary_id: "b", at: { unit: "other", value: 200 } },
        },
      }),
    );
    for (const patch of [
      { status: { state: "COMPLETED" } },
      { progress: "DELIVERED" },
      { yield: 1 },
      { rate: q(1) },
      { remainder: q(2) },
      { priority: 1 },
      { transformation: {} },
      { support_basis: { tier: "TIER_C", labor: "MATERIAL", specialist_competence: "MATERIAL" } },
    ])
      rejects(ProductionExtractionSchema, extraction(patch));
  });
  it("the Source Delta states cause, exact magnitude, the precise source-resolution key and provenance, as a discrete episodic residue only", () => {
    expect(SourceDeltaSchema.safeParse(delta()).success).toBe(true);
    for (const patch of [
      { accounting: "DECLARED_RATE" },
      { accounting: "BOTH" },
      { rate: q(1) },
      { profile: [] },
      { magnitude: q(0) },
      { magnitude: q(1.5) },
      { magnitude: { min: 1, max: 3, unit: "m" } },
      { remainder: q(2) },
      { resulting_condition: q(2) },
      { next_boundary_basis: "COMPUTED" },
      { cause: { ...delta().cause, kind: "NATURAL_REGENERATION" } },
    ])
      rejects(SourceDeltaSchema, delta(patch));
  });
  it("the account keeps one commitment per extraction, sorted, in one unit, and no remaining-endowment figure", () => {
    expect(SourceAccountSchema.safeParse(account()).success).toBe(true);
    expect(SourceAccountSchema.safeParse(account({ open: [] })).success).toBe(true);
    rejects(
      SourceAccountSchema,
      account({
        open: [
          { extraction_id: "x-1", quantity: q(3) },
          { extraction_id: "x-1", quantity: q(1) },
        ],
      }),
    );
    rejects(
      SourceAccountSchema,
      account({
        open: [
          { extraction_id: "x-2", quantity: q(1) },
          { extraction_id: "x-1", quantity: q(1) },
        ],
      }),
    );
    rejects(
      SourceAccountSchema,
      account({ open: [{ extraction_id: "x-1", quantity: q(3, "other") }] }),
    );
    rejects(SourceAccountSchema, { ...account(), recoverable: q(2) });
    rejects(SourceAccountSchema, { ...account(), rate: q(1) });
  });
});

describe("the Production Reserve inflow ledger: established + Σ inflows = held + Σ consumed", () => {
  it("a Reserve without inflows is exactly the predecessor Reserve (the field is absent, not defaulted)", () => {
    const r = ProductionReserveSchema.parse(reserve({ established: q(10), quantity: q(10) }));
    expect("inflows" in r).toBe(false);
  });
  it("credits only what an inflow recorded, once, in one unit", () => {
    expect(
      ProductionReserveSchema.safeParse(
        reserve({ quantity: q(3), inflows: [{ inflow_id: "x-1", quantity: q(3) }] }),
      ).success,
    ).toBe(true);
    rejects(ProductionReserveSchema, reserve({ quantity: q(3) })); // quantity from nowhere
    rejects(
      ProductionReserveSchema,
      reserve({ quantity: q(4), inflows: [{ inflow_id: "x-1", quantity: q(3) }] }),
    );
    rejects(
      ProductionReserveSchema,
      reserve({ quantity: q(2), inflows: [{ inflow_id: "x-1", quantity: q(3) }] }),
    );
    rejects(
      ProductionReserveSchema,
      reserve({
        quantity: q(6),
        inflows: [
          { inflow_id: "x-1", quantity: q(3) },
          { inflow_id: "x-1", quantity: q(3) },
        ],
      }),
    );
    rejects(
      ProductionReserveSchema,
      reserve({
        quantity: q(3, "other"),
        inflows: [{ inflow_id: "x-1", quantity: q(3, "other") }],
      }),
    );
    rejects(
      ProductionReserveSchema,
      reserve({ quantity: q(3), inflows: [{ inflow_id: "x-1", quantity: q(0) }] }),
    );
  });
  it("inflow and consumption together stay conserved", () => {
    expect(
      ProductionReserveSchema.safeParse(
        reserve({
          established: q(2),
          quantity: q(3),
          inflows: [{ inflow_id: "x-1", quantity: q(3) }],
          consumed: [{ operation_id: "op-1", quantity: q(2) }],
        }),
      ).success,
    ).toBe(true);
  });
});

describe("identities are derived from the extraction identity alone", () => {
  it("keys, stage keys, object, process and boundary identities", () => {
    expect(worldSourceConditionKey("w", "s")).toBe("world/w/source/s");
    expect(worldSourceDeliveryKey("w", "x")).toBe("world/w/source-delivery/x");
    expect(productionExtractionBasisKey("b")).toBe("production/extraction-basis/b");
    expect(productionExtractionKey("x")).toBe("production/extraction/x");
    expect(productionSourceDeltaKey("x")).toBe("production/source-delta/x");
    expect(productionSourceAccountKey("w", "s")).toBe("production/source-account/w/s");
    expect(productionExtractionObjectId("x")).toBe(`${EXTRACTION_OBJECT_PREFIX}x`);
    expect(productionExtractionProcessId("x")).toBe("production-extraction:x");
    expect(productionExtractionBoundaryId("x")).toBe("boundary-extraction-x");
    const stages = [
      productionSourceDeltaStage("x"),
      worldSourceDeliveryStage("x"),
      productionReserveInflowStage("x"),
    ];
    for (const s of stages) expect(parseStageKey(s).ok).toBe(true);
    expect(new Set(stages.map((s) => s.prospective_result_id)).size).toBe(3);
    expect(new Set(stages.map((s) => s.causal_process_id)).size).toBe(1);
    expect(stages.map((s) => s.owner_operation.owner)).toEqual([
      "production",
      "world_state",
      "production",
    ]);
  });
  it("no horizon, source version or retry is an identity dimension of any stage", () => {
    for (const s of [
      productionSourceDeltaStage("x"),
      worldSourceDeliveryStage("x"),
      productionReserveInflowStage("x"),
    ])
      expect(Object.keys(s).sort()).toEqual([
        "causal_process_id",
        "owner_operation",
        "prospective_result_id",
      ]);
  });
});
