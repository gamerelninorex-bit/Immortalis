/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw population documents */
// The identity of a confirmed population proposal is a pure function of the authored content and the campaign: the same proposal always
// reaches the same publication identities (so a retry converges), and any change reaches different ones (so a different choice is never
// mistaken for the committed one). The file is read once, strictly: exactly the unchanged `EstablishLedgerInput` and `CohortRef`, with
// nothing added, defaulted, relaxed or inferred, and every expected value is written out independently of the Population adapter.
import { chmodSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CohortRefSchema,
  EstablishLedgerInputSchema,
  PopulationBasisSchema,
} from "@immortalis/contracts";
import {
  expectedCohort,
  expectedLedger,
  initialPopulationId,
  readInitialPopulationFile,
} from "@immortalis/operator";
import {
  LEDGER_ID,
  populationDoc,
  unitDocs,
  writePopulation,
} from "../support/initial-population.ts";

const read = (d: unknown) => {
  const r = readInitialPopulationFile(writePopulation(d));
  if (!r.ok) throw new Error(`not valid: ${r.error.code} ${JSON.stringify(r.error.details)}`);
  return r.value;
};
const refused = (d: unknown, mode?: number) => readInitialPopulationFile(writePopulation(d, mode));

describe("initialPopulationId", () => {
  it("is deterministic, 128 bits of hex, and independent of object key order and of the order units were authored in", () => {
    const a = initialPopulationId("c1", read(populationDoc()));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(initialPopulationId("c1", read(populationDoc()))).toBe(a);
    const d = populationDoc();
    const reordered = {
      cohort: d.cohort,
      ledger: {
        point: d.ledger.point,
        units: [...d.ledger.units].reverse(),
        locus_id: d.ledger.locus_id,
        world_id: d.ledger.world_id,
        unit_class: d.ledger.unit_class,
        ledger_id: d.ledger.ledger_id,
      },
      format_version: 1,
      format: "immortalis-initial-population",
    };
    expect(initialPopulationId("c1", read(reordered))).toBe(a);
  });

  const changes: [string, (d: any) => void][] = [
    ["the ledger id", (d) => (d.ledger.ledger_id = "ledger-x")],
    ["the unit class", (d) => (d.ledger.unit_class = d.cohort.unit_class = "other")],
    ["the world", (d) => (d.ledger.world_id = "world-other")],
    ["the locus", (d) => (d.ledger.locus_id = d.cohort.scope.place = "locus-other")],
    ["the point", (d) => (d.ledger.point.value += 1)],
    ["a unit's residence", (d) => (d.ledger.units[0].residence = "elsewhere")],
    ["a unit's presence", (d) => (d.ledger.units[0].presence = "elsewhere")],
    ["a unit's burden allocation", (d) => (d.ledger.units[0].burden_allocation = "elsewhere")],
    ["the number of units", (d) => d.ledger.units.pop()],
    ["the Cohort id", (d) => (d.cohort.cohort_id = "cohort-x")],
    ["the Cohort's place", (d) => (d.cohort.scope.place = d.ledger.locus_id = "locus-other")],
  ];
  for (const [name, change] of changes)
    it(`changes with ${name}`, () => {
      const base = initialPopulationId("c1", read(populationDoc()));
      const doc = populationDoc();
      change(doc);
      if (doc.cohort.scope.ledger_id !== doc.ledger.ledger_id) {
        doc.cohort.scope.ledger_id = doc.ledger.ledger_id;
        doc.cohort.invalidators = [{ fact_key: `population/${doc.ledger.ledger_id}/ledger` }];
      }
      expect(initialPopulationId("c1", read(doc))).not.toBe(base);
    });

  it("changes with the campaign", () => {
    expect(initialPopulationId("c1", read(populationDoc()))).not.toBe(
      initialPopulationId("c2", read(populationDoc())),
    );
  });
});

describe("readInitialPopulationFile accepts exactly the unchanged strict ledger input and Cohort reference", () => {
  it("returns exactly what was authored (units in the owner's order), and the owner schemas have exactly their unchanged fields", () => {
    const doc = populationDoc();
    const got = read(doc);
    expect(got.ledger).toEqual(doc.ledger);
    expect(got.cohort).toEqual(doc.cohort);
    expect(Object.keys(EstablishLedgerInputSchema.shape).sort()).toEqual(
      ["ledger_id", "locus_id", "point", "unit_class", "units", "world_id"].sort(),
    );
    expect(Object.keys(CohortRefSchema.shape).sort()).toEqual(
      [
        "cardinality_semantics",
        "cohort_id",
        "count_custodian",
        "criterion",
        "form",
        "indexed_fact",
        "invalidators",
        "membership_basis",
        "overlap",
        "retention",
        "retirement",
        "scope",
        "temporal_read",
        "unit_class",
      ].sort(),
    );
  });

  it("sorts authored units by identifier; the same units in any order read back identically", () => {
    const d = populationDoc();
    d.ledger.units = [...unitDocs()].reverse();
    expect(read(d).ledger.units.map((u) => u.unit_id)).toEqual(
      unitDocs().map((u: any) => u.unit_id),
    );
  });

  it("admits one unit, and a population whose residents are all elsewhere (an empty Cohort is a lawful derived result)", () => {
    const one = populationDoc();
    one.ledger.units = [unitDocs()[3]];
    expect(read(one).ledger.units).toHaveLength(1);
  });

  it("does not default a missing burden allocation to null, a missing point, a missing Cohort field or a missing format", () => {
    const noBurden = populationDoc();
    delete noBurden.ledger.units[0].burden_allocation;
    const noPoint = populationDoc();
    delete noPoint.ledger.point;
    const noRetention = populationDoc();
    delete noRetention.cohort.retention;
    const noFormat = populationDoc();
    delete noFormat.format;
    for (const d of [noBurden, noPoint, noRetention, noFormat])
      expect(refused(d)).toMatchObject({ ok: false, error: { code: "INVALID_POPULATION" } });
  });

  it("derives the owner's exact ledger shape independently: count is the units held, nothing consumed, ESTABLISHMENT-stamped at the point", () => {
    const doc = read(populationDoc());
    const ledger = expectedLedger(doc);
    expect(PopulationBasisSchema.safeParse(ledger).success).toBe(true);
    expect(ledger.count).toEqual({ semantics: "EXACT", count: 5 });
    expect(ledger.overlap).toBe("DISJOINT_RESIDENT_POPULATION");
    expect(ledger.count_custodian).toBe("population");
    expect(ledger.consumed_envelopes).toEqual([]);
    expect(ledger.basis_stamp).toEqual({
      basis: { kind: "ESTABLISHMENT", point: doc.ledger.point },
      constituents: [],
    });
    expect(ledger.locality.locus.fact_key).toBe(
      `world/${doc.ledger.world_id}/locus/${doc.ledger.locus_id}`,
    );
    expect(ledger.ledger_id).toBe(LEDGER_ID);
    // and the Cohort is the reference with no result
    expect(expectedCohort(doc)).toEqual({ ref: doc.cohort, result: null });
  });
});

describe("a file that is not trustworthy is never read as a proposal", () => {
  it("a file others can write, a link, a directory and a missing file", () => {
    const writable = writePopulation(populationDoc(), 0o666);
    chmodSync(writable, 0o666);
    expect(readInitialPopulationFile(writable)).toMatchObject({
      ok: false,
      error: { code: "POPULATION_FILE_UNTRUSTED" },
    });
    const real = writePopulation(populationDoc());
    const link = join(dirname(real), "link.json");
    symlinkSync(real, link);
    expect(readInitialPopulationFile(link)).toMatchObject({
      ok: false,
      error: { code: "POPULATION_FILE_UNREADABLE" },
    });
    expect(readInitialPopulationFile(dirname(real))).toMatchObject({
      ok: false,
      error: { code: "POPULATION_FILE_UNTRUSTED" },
    });
    expect(readInitialPopulationFile(join(dirname(real), "absent.json"))).toMatchObject({
      ok: false,
      error: { code: "POPULATION_FILE_UNREADABLE" },
    });
  });

  it("a group-writable file and a file larger than a population can be", () => {
    const f = writePopulation(populationDoc());
    chmodSync(f, 0o620);
    expect(readInitialPopulationFile(f)).toMatchObject({
      ok: false,
      error: { code: "POPULATION_FILE_UNTRUSTED" },
    });
    const big = join(dirname(writePopulation(populationDoc())), "big.json");
    writeFileSync(big, " ".repeat(70_000) + JSON.stringify(populationDoc()));
    chmodSync(big, 0o600);
    expect(readInitialPopulationFile(big)).toMatchObject({
      ok: false,
      error: { code: "INVALID_POPULATION" },
    });
  });
});
