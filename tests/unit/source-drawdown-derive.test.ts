// Unit evidence for the pure derivations of one exact finite raw-source drawdown and its three owner operations (WS-003 §4A,
// §4B; brief steps 3-5): the Source Delta is exactly the extraction's drawdown; World-State's delivery is exactly the actual
// delta consumed, net, once; the Reserve inflow is exactly the delivered quantity, once, closing the commitment; nothing
// appears from nowhere; and an operation that cannot lawfully resolve throws instead of publishing.
// Register lineage: IA-02, IA-05 (bounded RC-06 partial). CAL-01/02/03 stay unresolved: no rate, yield or default.
import { describe, expect, it } from "vitest";
import {
  ProductionExtractionSchema,
  ProductionReserveSchema,
  SourceAccountSchema,
  SourceDeltaSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  productionExtractionKey,
  productionSourceDeltaKey,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  StageUnresolvedError,
  deriveReserveInflow,
  deriveSourceDelivery,
  deriveSourceDelta,
  productionReserveInflowProvider,
  productionSourceDeltaProvider,
  unclaimedRecoverable,
  worldSourceDeliveryProvider,
} from "@immortalis/engine";

const t = (value: number) => ({ unit: "u", value });
const q = (amount: number, unit = "m") => ({ amount, unit });
const loc = {
  world: { fact_key: "world/w/profile", entity_id: "w" },
  locus: { fact_key: "world/w/locus/l", entity_id: "l" },
};
const SRC = worldSourceConditionKey("w", "s-1");
const RES = "production/reserve/r-1";
const ACC = "production/source-account/w/s-1";

const source = (over: Record<string, unknown> = {}) =>
  WorldSourceConditionSchema.parse({
    source_key: "s-1",
    locality: loc,
    dimension: "surface",
    material_class: "mat",
    depth: "EXACT_FINITE",
    establishment: { kind: "INITIAL_SETTING_FACT", statement: "s", quantity: q(5) },
    recoverable: q(5),
    delivered: [],
    access_facts: [],
    exhaustion: null,
    ...over,
  });
const extraction = ProductionExtractionSchema.parse({
  extraction_id: "x-1",
  request: { owner: "src", fact_key: "src/req-1", request_id: "x-1", version: 1 },
  basis: { fact_key: "production/extraction-basis/b-1", basis_id: "b-1", version: 1 },
  source: { fact_key: SRC, source_key: "s-1", version: 1 },
  reserve: { fact_key: RES, reserve_id: "r-1" },
  account: { fact_key: ACC },
  material_class: "mat",
  quantity: q(3),
  support_basis: {
    tier: "TIER_A_EMBEDDED_BASELINE",
    labor: "NON_MATERIAL_EMBEDDED",
    specialist_competence: "NON_MATERIAL",
  },
  timing: { started_at: t(100), boundary: { boundary_id: "boundary-extraction-x-1", at: t(140) } },
});
const pinnedExtraction = { key: productionExtractionKey("x-1"), version: 1, value: extraction };
const delta = deriveSourceDelta(pinnedExtraction);
const pinnedDelta = { key: productionSourceDeltaKey("x-1"), version: 1, value: delta };
const reserve = ProductionReserveSchema.parse({
  reserve_id: "r-1",
  material_class: "mat",
  established: q(0),
  quantity: q(0),
  consumed: [],
  condition: "c",
  locality: loc,
  holding: "HELD_LOCAL_BY_PRODUCTION",
  claims: [],
});
const account = SourceAccountSchema.parse({
  source: { fact_key: SRC, source_key: "s-1" },
  locality: loc,
  material_class: "mat",
  unit: "m",
  watermark: t(100),
  open: [{ extraction_id: "x-1", quantity: q(3) }],
});

const delivered = (over: Record<string, unknown> = {}) => {
  const r = deriveSourceDelivery({
    source: { key: SRC, version: 1, value: source(over) },
    delta: pinnedDelta,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe("the Production-caused Source Delta", () => {
  it("is exactly the extraction's drawdown: cause, exact magnitude, precise key, boundary instant, discrete residue", () => {
    expect(SourceDeltaSchema.safeParse(delta).success).toBe(true);
    expect(delta).toMatchObject({
      delta_id: "x-1",
      magnitude: q(3),
      source: { fact_key: SRC, source_key: "s-1" },
      material_class: "mat",
      accounting: "DISCRETE_EPISODIC_RESIDUE",
      emitted_at: t(140),
      cause: {
        kind: "PRODUCTION_EXTRACTION_DRAWDOWN",
        extraction: { fact_key: productionExtractionKey("x-1"), version: 1 },
      },
    });
    expect(deriveSourceDelta(pinnedExtraction)).toEqual(delta); // pure
  });
  it("computes no resulting source condition and no remainder", () => {
    expect(JSON.stringify(delta)).not.toMatch(/recoverable|remain|after|resulting/);
  });
});

describe("World-State's delivery of the actual delta", () => {
  it("nets the Source Condition, records the delivery once and derives the remainder (5 − 3 = 2)", () => {
    const { source: next, delivery } = delivered();
    expect(next.recoverable).toEqual(q(2));
    expect(next.delivered).toEqual([{ delivery_id: "x-1", quantity: q(3) }]);
    expect(next.exhaustion).toBeNull();
    expect(next.establishment.quantity).toEqual(q(5)); // history is never rewritten
    expect(WorldSourceDeliverySchema.safeParse(delivery).success).toBe(true);
    expect(delivery).toMatchObject({
      before: q(5),
      delivered: q(3),
      after: q(2),
      exhausted: false,
      delivered_at: t(140),
      source: { version_before: 1, version_after: 2 },
      delta: { fact_key: productionSourceDeltaKey("x-1"), version: 1 },
    });
  });
  it("types PHYSICAL exhaustion only when nothing physically remains", () => {
    const d = deriveSourceDelta({
      ...pinnedExtraction,
      value: { ...extraction, quantity: q(5) },
    });
    const r = deriveSourceDelivery({
      source: { key: SRC, version: 1, value: source() },
      delta: { key: productionSourceDeltaKey("x-1"), version: 1, value: d },
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.source.recoverable).toEqual(q(0));
    expect(r.value.source.exhaustion).toEqual({ kind: "PHYSICAL", delivery_id: "x-1" });
    expect(r.value.delivery.exhausted).toBe(true);
  });
  it("refuses, never partially fills: insufficient, exhausted, delivered, wrong key, wrong material, wrong unit", () => {
    const refuse = (s: ReturnType<typeof source>, d = pinnedDelta, key = SRC) => {
      const r = deriveSourceDelivery({ source: { key, version: 1, value: s }, delta: d });
      expect(r.ok).toBe(false);
      return !r.ok ? r.error.message : "";
    };
    expect(
      refuse(
        source({
          recoverable: q(2),
          establishment: { kind: "INITIAL_SETTING_FACT", statement: "s", quantity: q(2) },
        }),
      ),
    ).toMatch(/does not support/);
    expect(
      refuse(
        source({
          recoverable: q(0),
          establishment: { kind: "INITIAL_SETTING_FACT", statement: "s", quantity: q(3) },
          delivered: [{ delivery_id: "y", quantity: q(3) }],
          exhaustion: { kind: "PHYSICAL", delivery_id: "y" },
        }),
      ),
    ).toMatch(/physically exhausted/);
    expect(
      refuse(
        source({
          recoverable: q(2),
          delivered: [{ delivery_id: "x-1", quantity: q(3) }],
        }),
      ),
    ).toMatch(/already delivered/);
    expect(refuse(source({ source_key: "s-2" }))).toMatch(/resolution key and material/);
    expect(refuse(source({ material_class: "other" }))).toMatch(/resolution key and material/);
    expect(refuse(source(), pinnedDelta, worldSourceConditionKey("w", "s-2"))).toMatch(
      /resolution key and material/,
    );
    expect(
      refuse(
        source({
          recoverable: q(5, "other"),
          establishment: { kind: "INITIAL_SETTING_FACT", statement: "s", quantity: q(5, "other") },
        }),
      ),
    ).toMatch(/same unit/);
  });
  it("derives a delivery for each amount: the owner's arithmetic, not a carried figure", () => {
    for (const amount of [1, 2, 3, 4, 5]) {
      const d = deriveSourceDelta({
        ...pinnedExtraction,
        value: { ...extraction, quantity: q(amount) },
      });
      const r = deriveSourceDelivery({
        source: { key: SRC, version: 1, value: source() },
        delta: { key: productionSourceDeltaKey("x-1"), version: 1, value: d },
      });
      if (!r.ok) throw new Error(r.error.message);
      expect(r.value.source.recoverable.amount).toBe(5 - amount);
    }
  });
});

describe("Production's Reserve inflow", () => {
  const delivery = (() => {
    const v = delivered().delivery;
    return { key: worldSourceDeliveryKey("w", "x-1"), version: 1, value: v };
  })();
  const prior = { extraction: pinnedExtraction, delta: pinnedDelta, delivery, reserve, account };

  it("credits exactly the delivered quantity, once, closes the commitment and advances the watermark", () => {
    const r = deriveReserveInflow(prior);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.reserve.quantity).toEqual(q(3));
    expect(r.value.reserve.inflows).toEqual([{ inflow_id: "x-1", quantity: q(3) }]);
    expect(r.value.reserve.established).toEqual(q(0)); // establishment is never rewritten
    expect(ProductionReserveSchema.safeParse(r.value.reserve).success).toBe(true);
    expect(r.value.account.open).toEqual([]);
    expect(r.value.account.watermark).toEqual(t(140));
  });
  it("refuses a second credit of the same inflow", () => {
    const first = deriveReserveInflow(prior);
    if (!first.ok) throw new Error(first.error.message);
    const again = deriveReserveInflow({
      ...prior,
      reserve: first.value.reserve,
      account: SourceAccountSchema.parse({ ...first.value.account, open: account.open }),
    });
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error.message).toMatch(/already credited/);
  });
  it("refuses a delivery that is not this extraction's, at another quantity, another Reserve or another locality", () => {
    const refuse = (over: Record<string, unknown>) => {
      const r = deriveReserveInflow({ ...prior, ...over } as never);
      expect(r.ok).toBe(false);
    };
    refuse({ delivery: { ...delivery, value: { ...delivery.value, delivery_id: "x-2" } } });
    refuse({ delivery: { ...delivery, value: { ...delivery.value, delivered: q(2) } } });
    refuse({
      delivery: { ...delivery, value: { ...delivery.value, delta: { fact_key: "x", version: 1 } } },
    });
    refuse({ delta: { ...pinnedDelta, version: 2 } });
    refuse({ reserve: { ...reserve, material_class: "other" } });
    refuse({ reserve: { ...reserve, quantity: q(0, "other"), established: q(0, "other") } });
    refuse({ reserve: { ...reserve, reserve_id: "r-2" } });
    refuse({
      reserve: {
        ...reserve,
        locality: { ...loc, locus: { fact_key: "world/w/locus/l2", entity_id: "l2" } },
      },
    });
    refuse({ account: { ...account, open: [] } });
    refuse({ account: { ...account, watermark: t(150) } });
  });
  it("conserves: what left the source is exactly what the Reserve holds", () => {
    const d = delivered();
    const r = deriveReserveInflow(prior);
    if (!r.ok) throw new Error(r.error.message);
    expect(5 - d.source.recoverable.amount).toBe(r.value.reserve.quantity.amount);
  });
});

describe("what is unclaimed on a key counts each unit once", () => {
  it("excludes commitments World-State has already netted out", () => {
    expect(unclaimedRecoverable(source(), undefined)).toBe(5);
    expect(unclaimedRecoverable(source(), account)).toBe(2); // 5 recoverable − 3 committed
    const net = delivered().source;
    expect(unclaimedRecoverable(net, account)).toBe(2); // delivered: already out of `recoverable`, not claimed twice
  });
});

const fact = (key: string, value: unknown, owner: string): OwnerFact => ({
  key,
  owner,
  facet: "f",
  value: value as never,
  unit: null,
  basis: "b",
  secrecy: "s",
  version: 1,
  provenance: {
    group_id: "g",
    intent_id: "i",
    cause: "c",
    rule: {
      artifact: "a",
      native_pin: "p",
      clause: "c",
      authority_lineage: [],
      effective_basis: "pinned-by-spec-lock",
      supersedes: null,
    },
  },
});
const readOf = (f: OwnerFact) => ({ read: {} as never, fact: f });
const input = (over: Record<string, unknown>) =>
  ({
    stage: {} as never,
    produces: [],
    span: { from: t(100), to: t(140), elapsed: 40 },
    reads: [],
    prior: new Map(),
    ...over,
  }) as never;
const reason = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return e instanceof StageUnresolvedError ? e.reason : "OTHER";
  }
  return "NONE";
};

describe("the three owner operations resolve at the declared boundary only, or throw without publishing", () => {
  const exFact = fact(productionExtractionKey("x-1"), extraction, "production");
  const deltaKey = productionSourceDeltaKey("x-1");

  it("the emit operation derives exactly the delta, once", () => {
    const w = productionSourceDeltaProvider.compute(
      input({ reads: [readOf(exFact)], produces: [deltaKey] }),
    );
    expect(w).toHaveLength(1);
    expect(w[0]!.key).toBe(deltaKey);
    expect(w[0]!.value).toEqual(delta);
    expect(w[0]!.basis).toBe(exFact.basis);
    expect(w[0]!.secrecy).toBe(exFact.secrecy);
  });
  it("the emit operation throws on a requested horizon, an absent read, an extra read, or a delta that already exists", () => {
    const base = { reads: [readOf(exFact)], produces: [deltaKey] };
    expect(
      reason(() =>
        productionSourceDeltaProvider.compute(
          input({ ...base, span: { from: t(100), to: t(139), elapsed: 39 } }),
        ),
      ),
    ).toBe("BASIS_MISMATCH");
    expect(
      reason(() =>
        productionSourceDeltaProvider.compute(
          input({ ...base, span: { from: t(100), to: t(300), elapsed: 200 } }),
        ),
      ),
    ).toBe("BASIS_MISMATCH");
    expect(reason(() => productionSourceDeltaProvider.compute(input({ ...base, reads: [] })))).toBe(
      "SOURCE_INVALID",
    );
    expect(
      reason(() =>
        productionSourceDeltaProvider.compute(
          input({ ...base, reads: [readOf(exFact), readOf(exFact)] }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        productionSourceDeltaProvider.compute(
          input({ ...base, prior: new Map([[deltaKey, fact(deltaKey, delta, "production")]]) }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() => productionSourceDeltaProvider.compute(input({ ...base, produces: [] }))),
    ).toBe("SOURCE_INVALID");
  });

  const srcFact = fact(SRC, source(), "world_state");
  const dFact = fact(deltaKey, delta, "production");
  const receiptKey = worldSourceDeliveryKey("w", "x-1");
  it("the delivery operation derives the net Source Condition and the record from the delta, once", () => {
    const w = worldSourceDeliveryProvider.compute(
      input({
        reads: [readOf(dFact)],
        produces: [SRC, receiptKey],
        prior: new Map([[SRC, srcFact]]),
      }),
    );
    expect(w.map((x) => x.key).sort()).toEqual([SRC, receiptKey].sort());
    const next = WorldSourceConditionSchema.parse(w.find((x) => x.key === SRC)!.value);
    expect(next.recoverable).toEqual(q(2));
    expect(
      WorldSourceDeliverySchema.safeParse(w.find((x) => x.key === receiptKey)!.value).success,
    ).toBe(true);
  });
  it("the delivery operation throws without a delta, without its source, on a horizon, or on a delta it cannot support", () => {
    const base = {
      reads: [readOf(dFact)],
      produces: [SRC, receiptKey],
      prior: new Map([[SRC, srcFact]]),
    };
    expect(reason(() => worldSourceDeliveryProvider.compute(input({ ...base, reads: [] })))).toBe(
      "SOURCE_ABSENT",
    );
    expect(
      reason(() => worldSourceDeliveryProvider.compute(input({ ...base, prior: new Map() }))),
    ).toBe("SOURCE_ABSENT");
    expect(
      reason(() =>
        worldSourceDeliveryProvider.compute(
          input({ ...base, span: { from: t(100), to: t(300), elapsed: 200 } }),
        ),
      ),
    ).toBe("BASIS_MISMATCH");
    expect(
      reason(() =>
        worldSourceDeliveryProvider.compute(
          input({
            ...base,
            prior: new Map([
              [
                SRC,
                fact(
                  SRC,
                  source({
                    recoverable: q(2),
                    establishment: { kind: "INITIAL_SETTING_FACT", statement: "s", quantity: q(2) },
                  }),
                  "world_state",
                ),
              ],
            ]),
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() => worldSourceDeliveryProvider.compute(input({ ...base, produces: [SRC] }))),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        worldSourceDeliveryProvider.compute(
          input({
            ...base,
            prior: new Map([
              [SRC, srcFact],
              [receiptKey, fact(receiptKey, {}, "world_state")],
            ]),
          }),
        ),
      ),
    ).toBe("SOURCE_ABSENT");
  });

  const rFact = fact(RES, reserve, "production");
  const aFact = fact(ACC, account, "production");
  const vFact = fact(receiptKey, delivered().delivery, "world_state");
  it("the inflow operation credits the Reserve exactly the delivered quantity, once", () => {
    const w = productionReserveInflowProvider.compute(
      input({
        reads: [readOf(vFact), readOf(dFact), readOf(exFact)],
        produces: [RES, ACC],
        prior: new Map([
          [RES, rFact],
          [ACC, aFact],
        ]),
      }),
    );
    const next = ProductionReserveSchema.parse(w.find((x) => x.key === RES)!.value);
    expect(next.quantity).toEqual(q(3));
    expect(SourceAccountSchema.parse(w.find((x) => x.key === ACC)!.value).open).toEqual([]);
  });
  it("the inflow operation throws without the delivery (no early inflow), on a horizon or on a missing Reserve", () => {
    const base = {
      reads: [readOf(vFact), readOf(dFact), readOf(exFact)],
      produces: [RES, ACC],
      prior: new Map([
        [RES, rFact],
        [ACC, aFact],
      ]),
    };
    expect(
      reason(() =>
        productionReserveInflowProvider.compute(
          input({ ...base, reads: [readOf(dFact), readOf(exFact)] }),
        ),
      ),
    ).toBe("SOURCE_ABSENT");
    expect(
      reason(() =>
        productionReserveInflowProvider.compute(
          input({ ...base, span: { from: t(100), to: t(300), elapsed: 200 } }),
        ),
      ),
    ).toBe("BASIS_MISMATCH");
    expect(
      reason(() =>
        productionReserveInflowProvider.compute(input({ ...base, prior: new Map([[ACC, aFact]]) })),
      ),
    ).toBe("SOURCE_ABSENT");
    expect(
      reason(() => productionReserveInflowProvider.compute(input({ ...base, produces: [RES] }))),
    ).toBe("SOURCE_INVALID");
  });
});
