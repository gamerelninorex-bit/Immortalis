/* eslint-disable @typescript-eslint/no-explicit-any -- tests construct deliberately malformed values */
// Population contracts — executable RC-12 (PopulationBasis / CohortRef), RC-08 (ConsequenceEnvelope) and the
// PCB-01 declaration. Every schema is strict: what is not modelled is rejected, never carried (IA-02).
// Register lineage: IA-02, IA-03 (partial); RC-08, RC-12.
import { describe, expect, it } from "vitest";
import {
  CardinalitySchema,
  CohortFactSchema,
  CohortRefSchema,
  CohortResultSchema,
  ConsequenceEnvelopeSchema,
  ConsequenceRegisterSchema,
  DependencyDeclarationSchema,
  PendingConsequenceBarrierSchema,
  PopulationBasisSchema,
  ReconciliationCloseSchema,
  burdenLocus,
  indexedPlace,
  POPULATION_CLOSE_BASIS,
} from "@immortalis/contracts";
import {
  COHORT_BURDEN_L,
  PLACE_L,
  POP_TP,
  at,
  burdenCohort,
  entryEnvelope,
  exitEnvelope,
  ledgerInput,
  mainUnits,
  popCloseStage,
  popConsumerDeclaration,
  populationBarrier,
  statusViewCohort,
  unit,
} from "@immortalis/testkit";

const basisOf = (over: any = {}) => ({
  ledger_id: "ledger-main",
  unit_class: "synthetic-unit-class",
  count_custodian: "population",
  locality: {
    world: { fact_key: "world/w/profile", entity_id: "w" },
    locus: { fact_key: "world/w/locus/l", entity_id: "l" },
  },
  overlap: "DISJOINT_RESIDENT_POPULATION",
  units: mainUnits(),
  count: { semantics: "EXACT", count: 4 },
  consumed_envelopes: [],
  basis_stamp: { basis: { kind: "ESTABLISHMENT", point: at(100) }, constituents: [] },
  ...over,
});
const ok = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe("RC-12 PopulationBasis (the Unit/Count ledger)", () => {
  it("accepts the exact fixture ledger", () => {
    expect(ok(PopulationBasisSchema, basisOf())).toBe(true);
    expect(ledgerInput().units).toHaveLength(4);
  });
  it.each([
    ["a count that disagrees with the units", { count: { semantics: "EXACT", count: 5 } }],
    [
      "a count that is not exact (bounded/unquantified population count)",
      { count: { semantics: "UNQUANTIFIED" } },
    ],
    [
      "duplicate units (a unit counted twice)",
      {
        units: [...mainUnits(), unit("u-1", "a", "b")].sort((a, b) =>
          a.unit_id < b.unit_id ? -1 : 1,
        ),
      },
    ],
    ["unsorted units", { units: [...mainUnits()].reverse() }],
    ["a custodian other than Population", { count_custodian: "economy" }],
    ["an overlapping resident population", { overlap: "OVERLAPPING" }],
    ["a consumed set with duplicates", { consumed_envelopes: ["e", "e"] }],
    ["a field the contract does not model (agency)", { agency: { goals: [] } }],
    ["a field the contract does not model (labor supply)", { effective_labor_supply: 12 }],
    [
      "a unit with a field the contract does not model",
      { units: [{ ...mainUnits()[0], skill: "x" }] },
    ],
  ])("rejects %s", (_n, over) => {
    expect(ok(PopulationBasisSchema, basisOf(over))).toBe(false);
  });
  it("Burden Locus is the recorded allocation, else Presence — never inferred from Residence", () => {
    expect(burdenLocus(unit("a", "R", "P"))).toBe("P");
    expect(burdenLocus(unit("a", "R", "P", "B"))).toBe("B");
    const u = unit("a", "R", "P", "B");
    expect([
      indexedPlace(u, "RESIDENCE"),
      indexedPlace(u, "PRESENCE"),
      indexedPlace(u, "BURDEN_LOCUS"),
    ]).toEqual(["R", "P", "B"]);
  });
});

describe("RC-12 CohortRef", () => {
  const good = () => burdenCohort(COHORT_BURDEN_L, PLACE_L);
  it("accepts a Population-owned partition and an externally qualified view", () => {
    expect(ok(CohortRefSchema, good())).toBe(true);
    expect(ok(CohortRefSchema, statusViewCohort())).toBe(true);
  });
  it.each<[string, any]>([
    ["Labor Claim as the indexed fact (not representable here)", { indexed_fact: "LABOR_CLAIM" }],
    ["two indexed facts at once", { indexed_fact: ["RESIDENCE", "PRESENCE"] }],
    ["a custodian other than Population", { count_custodian: "culture" }],
    ["VERSIONED retention (needs a named consumer's historical read)", { retention: "VERSIONED" }],
    ["EVENT-SNAPSHOT retention (not implemented)", { retention: "EVENT-SNAPSHOT" }],
    ["AS-OF-NOW (no declared same-point edge exists)", { temporal_read: { mode: "AS-OF-NOW" } }],
    [
      "a close basis that is not Population's ordinary close",
      {
        temporal_read: {
          mode: "AS-OF-DECLARED-CLOSE",
          close_basis: {
            name: "requested-horizon",
            producer: { owner: "population", operation: "population-reconcile-close" },
          },
        },
      },
    ],
    [
      "a horizon field on the temporal read",
      {
        temporal_read: {
          mode: "AS-OF-DECLARED-CLOSE",
          close_basis: POPULATION_CLOSE_BASIS,
          horizon: 160,
        },
      },
    ],
    ["a form that is not implemented (event/shared-access)", { form: "EVENT_SHARED_ACCESS" }],
    [
      "a partition that declares overlap (form/overlap disagree)",
      { overlap: { declaration: "OVERLAPPING" } },
    ],
    ["no invalidators", { invalidators: [] }],
    ["agency", { agency: "collective" }],
    ["belief", { belief: { x: 1 } }],
    ["behavior", { behavior: "migrate" }],
    ["a writable overlay", { cohort_share_overlay: { a: 1 } }],
  ])("rejects %s", (_n, over) => {
    expect(ok(CohortRefSchema, { ...good(), ...over })).toBe(false);
  });
  it("a Population-owned criterion carries no reference; an external one must, and from its owner", () => {
    expect(
      ok(CohortRefSchema, {
        ...good(),
        criterion: { owner: "population", ref: { owner: "x", fact_key: "k" } },
      }),
    ).toBe(false);
    const v = statusViewCohort();
    expect(ok(CohortRefSchema, { ...v, criterion: { owner: v.criterion.owner, ref: null } })).toBe(
      false,
    );
    expect(
      ok(CohortRefSchema, {
        ...v,
        criterion: { ...v.criterion, ref: { owner: "someone-else", fact_key: "k" } },
      }),
    ).toBe(false);
    expect(ok(CohortRefSchema, { ...v, membership_basis: "INDEXED_FACT_AT_PLACE" })).toBe(false);
  });
  it("a Cohort fact is the reference plus a result; nothing else may be attached", () => {
    expect(ok(CohortFactSchema, { ref: good(), result: null })).toBe(true);
    expect(ok(CohortFactSchema, { ref: good(), result: null, consumer_attachment: {} })).toBe(
      false,
    );
  });
});

describe("cardinality semantics and derived results", () => {
  it("exact / bounded / unquantified; a bounded range is ordered", () => {
    expect(ok(CardinalitySchema, { semantics: "EXACT", count: 0 })).toBe(true);
    expect(ok(CardinalitySchema, { semantics: "BOUNDED", lower: 1, upper: 3 })).toBe(true);
    expect(ok(CardinalitySchema, { semantics: "BOUNDED", lower: 4, upper: 3 })).toBe(false);
    expect(ok(CardinalitySchema, { semantics: "UNQUANTIFIED" })).toBe(true);
    expect(ok(CardinalitySchema, { semantics: "APPROXIMATE", tolerance: 0.1 })).toBe(false); // no tolerance exists
  });
  const stamp = {
    basis: {
      kind: "RECONCILIATION_CLOSE",
      close_basis: POPULATION_CLOSE_BASIS,
      resolution_point: POP_TP,
    },
    constituents: [],
  };
  it("an exact result carries exactly its members; an unquantified one carries none", () => {
    expect(
      ok(CohortResultSchema, {
        cardinality: { semantics: "EXACT", count: 2 },
        members: ["a", "b"],
        basis_stamp: stamp,
      }),
    ).toBe(true);
    expect(
      ok(CohortResultSchema, {
        cardinality: { semantics: "EXACT", count: 3 },
        members: ["a", "b"],
        basis_stamp: stamp,
      }),
    ).toBe(false);
    expect(
      ok(CohortResultSchema, {
        cardinality: { semantics: "UNQUANTIFIED" },
        members: null,
        basis_stamp: stamp,
      }),
    ).toBe(true);
    expect(
      ok(CohortResultSchema, {
        cardinality: { semantics: "UNQUANTIFIED" },
        members: ["a"],
        basis_stamp: stamp,
      }),
    ).toBe(false);
  });
  it("a derived result needs a Population reconciliation close stamp, never an establishment stamp", () => {
    const e = { basis: { kind: "ESTABLISHMENT", point: POP_TP }, constituents: [] };
    expect(
      ok(CohortResultSchema, {
        cardinality: { semantics: "EXACT", count: 0 },
        members: [],
        basis_stamp: e,
      }),
    ).toBe(false);
  });
});

describe("RC-08 ConsequenceEnvelope", () => {
  it("typed Entry and Exit envelopes; an Exit distinguishes reversible from cessation", () => {
    expect(
      ok(ConsequenceEnvelopeSchema, entryEnvelope("e1", unit("n", PLACE_L, PLACE_L), at(110))),
    ).toBe(true);
    expect(ok(ConsequenceEnvelopeSchema, exitEnvelope("e2", "u-1", at(110)))).toBe(true);
    expect(
      ok(
        ConsequenceEnvelopeSchema,
        exitEnvelope("e3", "u-1", at(110), "REVERSIBLE_MEMBERSHIP_EXIT"),
      ),
    ).toBe(true);
    const cess: any = exitEnvelope("e4", "u-1", at(110));
    cess.consequence.continuity_ref = "x"; // cessation preserves no re-entry reference
    expect(ok(ConsequenceEnvelopeSchema, cess)).toBe(false);
    const rev: any = exitEnvelope("e5", "u-1", at(110), "REVERSIBLE_MEMBERSHIP_EXIT");
    rev.consequence.continuity_ref = null; // a reversible exit must not be silently recorded as cessation
    expect(ok(ConsequenceEnvelopeSchema, rev)).toBe(false);
  });
  it("Population is never the writer of what it consumes; the affected scope is the consumed unit", () => {
    const e: any = exitEnvelope("e6", "u-1", at(110));
    expect(ok(ConsequenceEnvelopeSchema, { ...e, writer: { owner: "population" } })).toBe(false);
    expect(
      ok(ConsequenceEnvelopeSchema, {
        ...e,
        affected: { ledger_id: "ledger-main", unit_ids: ["u-2"] },
      }),
    ).toBe(false);
    expect(ok(ConsequenceEnvelopeSchema, { ...e, rate: 0.02 })).toBe(false); // no demographic rate exists
  });
  it("a register holds unique, sorted envelopes of one ledger", () => {
    const a = exitEnvelope("a", "u-1", at(110));
    const b = exitEnvelope("b", "u-2", at(110));
    expect(ok(ConsequenceRegisterSchema, { ledger_id: "ledger-main", envelopes: [a, b] })).toBe(
      true,
    );
    expect(ok(ConsequenceRegisterSchema, { ledger_id: "ledger-main", envelopes: [b, a] })).toBe(
      false,
    );
    expect(ok(ConsequenceRegisterSchema, { ledger_id: "ledger-main", envelopes: [a, a] })).toBe(
      false,
    );
    expect(ok(ConsequenceRegisterSchema, { ledger_id: "ledger-other", envelopes: [a] })).toBe(
      false,
    );
  });
});

describe("the ordinary close: Closing = Opening + Entries − Exits is a property of the contract", () => {
  const close = (over: any = {}) => ({
    ledger_id: "ledger-main",
    close_basis: POPULATION_CLOSE_BASIS,
    close_stage: popCloseStage("ledger-main", "close-1"),
    resolution_point: POP_TP,
    opening: { count: 4, ledger_version: 1 },
    entries: [
      {
        envelope_id: "a",
        unit_id: "n",
        adapter: "x",
        causing_event: { owner: "o", event_id: "e" },
        effective_at: { unit: "u", value: 1 },
        source: { owner: "o", fact_key: "k" },
      },
    ],
    exits: [],
    closing: { count: 5, ledger_version: 2 },
    consumed_envelopes: ["a"],
    cohorts: [],
    ...over,
  });
  it("accepts a close that conserves", () =>
    expect(ok(ReconciliationCloseSchema, close())).toBe(true));
  it.each<[string, any]>([
    [
      "a closing count that is not opening + entries − exits",
      { closing: { count: 6, ledger_version: 2 } },
    ],
    ["a consumed set that is not exactly the entries and exits", { consumed_envelopes: [] }],
    ["a ledger that does not advance by one version", { closing: { count: 5, ledger_version: 3 } }],
    [
      "a close basis that is not the ordinary reconciliation close",
      {
        close_basis: {
          name: "annual-pass",
          producer: { owner: "population", operation: "population-reconcile-close" },
        },
      },
    ],
    ["a field that is not modelled (rate)", { natural_change_rate: 0.01 }],
  ])("rejects %s", (_n, over) => expect(ok(ReconciliationCloseSchema, close(over))).toBe(false));
});

describe("PCB-01 declaration (consumer side)", () => {
  it("accepts a barrier that gates a CLOSE read of its own close basis", () => {
    expect(ok(PendingConsequenceBarrierSchema, populationBarrier())).toBe(true);
    expect(ok(DependencyDeclarationSchema, popConsumerDeclaration(1))).toBe(true);
  });
  it("rejects a barrier that gates nothing, one with no discrete facet, and an unmodelled field", () => {
    const d: any = popConsumerDeclaration(1);
    expect(ok(DependencyDeclarationSchema, { ...d, reads: [] })).toBe(false);
    expect(
      ok(PendingConsequenceBarrierSchema, { ...populationBarrier(), discrete_facets: [] }),
    ).toBe(false);
    expect(ok(PendingConsequenceBarrierSchema, { ...populationBarrier(), cadence: "annual" })).toBe(
      false,
    );
    expect(
      ok(PendingConsequenceBarrierSchema, {
        ...populationBarrier(),
        discrete_facets: ["CONTINUOUS_AGGREGATE"],
      }),
    ).toBe(false);
  });
  it("test coordinates are not identity: nothing here names a horizon", () => {
    expect(JSON.stringify(populationBarrier())).not.toMatch(/horizon|tick|annual/);
  });
});
