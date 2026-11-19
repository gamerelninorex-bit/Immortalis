// Pure Population derivation (IM-04): exact conservation arithmetic, envelope eligibility, and Cohort
// arithmetic rules — non-additive overlap, no unquantified arithmetic, one basis, count-once carriers.
// Register lineage: IA-02, IA-03 (partial); WS-001 §1, WS-015 §§VII–X.
import { describe, expect, it } from "vitest";
import {
  applyEnvelopes,
  additiveTotal,
  composeCohortResult,
  eligibleEnvelopes,
  intersectionCount,
  type CohortView,
} from "@immortalis/engine";
import {
  COHORT_BURDEN_L,
  COHORT_BURDEN_M,
  COHORT_STATUS_L,
  LEDGER_MAIN,
  PLACE_L,
  PLACE_M,
  POP_TC,
  POP_TP,
  at,
  burdenCohort,
  criterion,
  entryEnvelope,
  exitEnvelope,
  mainUnits,
  statusViewCohort,
  unit,
} from "@immortalis/testkit";
import {
  POPULATION_CLOSE_BASIS,
  PopulationBasisSchema,
  type BasisStamp,
  type PopulationBasis,
} from "@immortalis/contracts";

const stampAt = (point = POP_TP): BasisStamp => ({
  basis: {
    kind: "RECONCILIATION_CLOSE",
    close_basis: POPULATION_CLOSE_BASIS,
    resolution_point: point,
  },
  constituents: [],
});
const ledger = (consumed: string[] = []): PopulationBasis =>
  PopulationBasisSchema.parse({
    ledger_id: LEDGER_MAIN,
    unit_class: "synthetic-unit-class",
    count_custodian: "population",
    locality: {
      world: { fact_key: "world/w/profile", entity_id: "w" },
      locus: { fact_key: "world/w/locus/l", entity_id: "l" },
    },
    overlap: "DISJOINT_RESIDENT_POPULATION",
    units: mainUnits(),
    count: { semantics: "EXACT", count: 4 },
    consumed_envelopes: consumed,
    basis_stamp: { basis: { kind: "ESTABLISHMENT", point: at(100) }, constituents: [] },
  });

describe("envelope eligibility (RC-08): addressed, effective, unconsumed", () => {
  const envs = [
    exitEnvelope("e-1", "u-4", at(110)),
    exitEnvelope("e-2", "u-2", at(130)),
    exitEnvelope("e-late", "u-3", at(500)),
    exitEnvelope("e-other", "o-1", at(110), "CESSATION", "ledger-other"),
  ];
  it("keeps what is effective by the point and not yet consumed, in deterministic order", () => {
    const r = eligibleEnvelopes(envs, ledger(), POP_TC);
    expect(r.ok && r.value.map((e) => e.envelope_id)).toEqual(["e-1", "e-2"]);
    const earlier = eligibleEnvelopes(envs, ledger(), POP_TP);
    expect(earlier.ok && earlier.value.map((e) => e.envelope_id)).toEqual(["e-1"]);
    const consumed = eligibleEnvelopes(envs, ledger(["e-1"]), POP_TC);
    expect(consumed.ok && consumed.value.map((e) => e.envelope_id)).toEqual(["e-2"]);
  });
  it("an envelope in another time unit fails closed: no time is guessed", () => {
    const e = exitEnvelope("e-x", "u-4", { unit: "other-unit", value: 1 });
    const r = eligibleEnvelopes([e], ledger(), POP_TC);
    expect(!r.ok && r.error.code).toBe("BASIS_INCOMPARABLE");
  });
});

describe("typed Entries and Exits (WS-001 §1)", () => {
  it("Closing = Opening + Entries − Exits, each envelope applied once, each unit changed only by an envelope", () => {
    const r = applyEnvelopes(mainUnits(), [
      entryEnvelope("a", unit("u-5", PLACE_L, PLACE_L), at(110)),
      exitEnvelope("b", "u-4", at(115)),
      exitEnvelope("c", "u-2", at(120), "REVERSIBLE_MEMBERSHIP_EXIT"),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.units.map((u) => u.unit_id)).toEqual(["u-1", "u-3", "u-5"]);
    expect(4 + r.value.entries.length - r.value.exits.length).toBe(r.value.units.length);
    expect(r.value.consumed).toEqual(["a", "b", "c"]);
    // continuing units are untouched: Residence/Presence/Burden are never rewritten by an unrelated envelope
    expect(r.value.units.find((u) => u.unit_id === "u-3")).toEqual(mainUnits()[2]);
  });
  it("the same envelope cannot be credited twice; a unit cannot enter twice or exit without being accounted", () => {
    const a = entryEnvelope("a", unit("u-5", PLACE_L, PLACE_L), at(110));
    expect(applyEnvelopes(mainUnits(), [a, a]).ok).toBe(false);
    const dup = applyEnvelopes(mainUnits(), [
      entryEnvelope("d", unit("u-1", PLACE_L, PLACE_L), at(110)),
    ]);
    expect(!dup.ok && dup.error.code).toBe("DUPLICATE_UNIT");
    const gone = applyEnvelopes(mainUnits(), [exitEnvelope("g", "u-77", at(110))]);
    expect(!gone.ok && gone.error.code).toBe("UNIT_ABSENT");
  });
});

describe("Cohort derivation and arithmetic (WS-015 §§VI–X)", () => {
  const view = (
    ref: ReturnType<typeof burdenCohort>,
    crit = null as ReturnType<typeof criterion> | null,
    p = POP_TP,
  ): CohortView => ({
    ref,
    result: composeCohortResult(ref, mainUnits(), crit, stampAt(p)),
  });
  const bl = () => view(burdenCohort(COHORT_BURDEN_L, PLACE_L));
  const bm = () => view(burdenCohort(COHORT_BURDEN_M, PLACE_M));
  const status = () => view(statusViewCohort(), criterion(POP_TP, ["u-1", "u-2", "u-4"]));

  it("a burden-carrier partition counts every represented unit exactly once", () => {
    expect(bl().result!.members).toEqual(["u-1", "u-3"]); // u-3 is allocated to L although present at M
    expect(bm().result!.members).toEqual(["u-2", "u-4"]);
    expect(additiveTotal([bl(), bm()])).toEqual({
      ok: true,
      value: { semantics: "EXACT", count: 4 },
    });
  });
  it("overlapping views are not additive; a view cannot be added to a partition", () => {
    const e = additiveTotal([status(), status()]);
    expect(!e.ok && e.error.code).toBe("OVERLAP_NOT_ADDITIVE");
    const mixed = additiveTotal([bl(), status()]);
    expect(!mixed.ok && mixed.error.code).toBe("OVERLAP_NOT_ADDITIVE");
  });
  it("a Residence Cohort cannot be added to a Burden Locus Cohort (never interchangeable)", () => {
    const res = view(burdenCohort("c-res", PLACE_M, LEDGER_MAIN, { indexed_fact: "RESIDENCE" }));
    const e = additiveTotal([bl(), res]);
    expect(!e.ok && e.error.code).toBe("PARTITION_MISMATCH");
  });
  it("siblings of different partitions are not additive", () => {
    const other = view(
      burdenCohort("c-x", PLACE_M, LEDGER_MAIN, {
        overlap: { declaration: "DISJOINT_PARTITION", partition_id: "another" },
      }),
    );
    const e = additiveTotal([bl(), other]);
    expect(!e.ok && e.error.code).toBe("PARTITION_MISMATCH");
  });
  it("an unquantified Cohort cannot enter additive or conserved arithmetic", () => {
    const uq = view(
      burdenCohort("c-uq", PLACE_M, LEDGER_MAIN, { cardinality_semantics: "UNQUANTIFIED" }),
    );
    expect(uq.result).toMatchObject({ cardinality: { semantics: "UNQUANTIFIED" }, members: null });
    const e = additiveTotal([bl(), uq]);
    expect(!e.ok && e.error.code).toBe("UNQUANTIFIED_IN_ARITHMETIC");
    const i = intersectionCount(uq, status());
    expect(!i.ok && i.error.code).toBe("UNQUANTIFIED_IN_ARITHMETIC");
  });
  it("results composed at different bases cannot be combined (no mixed-time reconstruction)", () => {
    const later = view(burdenCohort(COHORT_BURDEN_M, PLACE_M), null, POP_TC);
    const e = additiveTotal([bl(), later]);
    expect(!e.ok && e.error.code).toBe("MIXED_BASIS");
    const i = intersectionCount(status(), view(burdenCohort("c-y", PLACE_L), null, POP_TC));
    expect(!i.ok && i.error.code).toBe("MIXED_BASIS");
  });
  it("a Cohort that was never composed has no total", () => {
    const e = additiveTotal([{ ref: burdenCohort("c-z", PLACE_L), result: null }]);
    expect(!e.ok && e.error.code).toBe("RESULT_ABSENT");
  });
  it("the external view is Population's composition of its units and the criterion at one point", () => {
    expect(status().result!.members).toEqual(["u-1", "u-2"]); // residence L ∩ criterion {u-1,u-2,u-4}
    expect(intersectionCount(status(), bl())).toEqual({ ok: true, value: 1 }); // {u-1,u-2} ∩ {u-1,u-3}
    expect(COHORT_STATUS_L).toBe("cohort-status-l");
  });
  it("the sum of bounded results is bounded; nothing is approximated", () => {
    const b1: CohortView = {
      ref: bl().ref,
      result: {
        cardinality: { semantics: "BOUNDED", lower: 1, upper: 2 },
        members: null,
        basis_stamp: stampAt(),
      },
    };
    const b2: CohortView = {
      ref: bm().ref,
      result: {
        cardinality: { semantics: "EXACT", count: 2 },
        members: ["u-2", "u-4"],
        basis_stamp: stampAt(),
      },
    };
    expect(additiveTotal([b1, b2])).toEqual({
      ok: true,
      value: { semantics: "BOUNDED", lower: 3, upper: 4 },
    });
  });
});

describe("A03 declared partition sibling uniqueness", () => {
  const sibling = (cohortId: string, place: string, ledgerId = LEDGER_MAIN): CohortView => {
    const ref = burdenCohort(cohortId, place, ledgerId);
    return { ref, result: composeCohortResult(ref, mainUnits(), null, stampAt()) };
  };
  const left = sibling(COHORT_BURDEN_L, PLACE_L);
  const right = sibling(COHORT_BURDEN_M, PLACE_M);
  const bounded = (v: CohortView): CohortView => ({
    ref: { ...v.ref, cardinality_semantics: "BOUNDED" },
    result: {
      cardinality: { semantics: "BOUNDED", lower: 1, upper: 3 },
      members: null,
      basis_stamp: stampAt(),
    },
  });

  it.each([
    { name: "same object", duplicate: left },
    { name: "deep copy", duplicate: structuredClone(left) },
    { name: "same ID at a distinct place", duplicate: sibling(left.ref.cohort_id, PLACE_M) },
    { name: "distinct ID at the same place", duplicate: sibling("alias", PLACE_L) },
    {
      name: "shared member at a reported distinct place",
      duplicate: {
        ...right,
        result: { ...right.result!, members: ["u-1", "u-4"] },
      },
    },
  ])("rejects $name before count arithmetic", ({ duplicate }) => {
    const before = structuredClone([left, duplicate]);
    expect(additiveTotal([left, duplicate])).toMatchObject({
      ok: false,
      error: { code: "OVERLAP_NOT_ADDITIVE" },
    });
    expect([left, duplicate]).toEqual(before);
  });

  it("uses declared indexed places even for empty or non-enumerated siblings", () => {
    const empty = sibling("empty", "place-empty");
    expect(empty.result?.members).toEqual([]);
    const duplicateEmpty = sibling("empty-alias", "place-empty");
    expect(additiveTotal([empty, duplicateEmpty])).toMatchObject({
      ok: false,
      error: { code: "OVERLAP_NOT_ADDITIVE" },
    });
    expect(additiveTotal([bounded(left), bounded(sibling("alias", PLACE_L))])).toMatchObject({
      ok: false,
      error: { code: "OVERLAP_NOT_ADDITIVE" },
    });
    expect(additiveTotal([bounded(left), bounded(right)])).toEqual({
      ok: true,
      value: { semantics: "BOUNDED", lower: 2, upper: 6 },
    });
  });

  it("preserves scope and basis refusal precedence and the empty, single and distinct sums", () => {
    const foreignLedger = sibling(left.ref.cohort_id, PLACE_L, "ledger-foreign");
    const foreignFact = { ...left, ref: { ...left.ref, indexed_fact: "RESIDENCE" as const } };
    const later = { ...left, result: { ...left.result!, basis_stamp: stampAt(POP_TC) } };
    for (const foreign of [foreignLedger, foreignFact])
      expect(additiveTotal([left, left, foreign])).toMatchObject({
        ok: false,
        error: { code: "PARTITION_MISMATCH" },
      });
    expect(additiveTotal([left, left, later])).toMatchObject({
      ok: false,
      error: { code: "MIXED_BASIS" },
    });
    expect(additiveTotal([left, left, { ...right, result: null }])).toMatchObject({
      ok: false,
      error: { code: "RESULT_ABSENT" },
    });
    const unquantified = {
      ...right,
      ref: { ...right.ref, cardinality_semantics: "UNQUANTIFIED" as const },
    };
    expect(additiveTotal([left, left, unquantified])).toMatchObject({
      ok: false,
      error: { code: "UNQUANTIFIED_IN_ARITHMETIC" },
    });
    expect(additiveTotal([])).toMatchObject({ ok: false, error: { code: "EMPTY" } });
    expect(additiveTotal([left])).toEqual({ ok: true, value: { semantics: "EXACT", count: 2 } });
    expect(additiveTotal([left, right])).toEqual({
      ok: true,
      value: { semantics: "EXACT", count: 4 },
    });
  });
});
