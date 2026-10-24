// BLUE review condition R-2: the workforce scope's accounting is exact only if the ledger is the ONLY primary carrier of a unit's identity,
// residence, presence and burden. This inventory makes that scope explicit and fails if a Population kind is ever added without being
// classified, so a new carrier cannot silently escape the scope. (NEWLY AUTHORIZED rule; independent BLUE review pending.)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_FACT_KINDS } from "@immortalis/engine";

const POPULATION = ALL_FACT_KINDS.filter((k) => k.owner === "population");

/** every Population kind, and what it is for the purposes of the PC's workforce relation */
const CLASSIFIED = {
  // the one PRIMARY carrier of a unit's identity, residence, presence and burden allocation: the scope accounts exactly these
  population_ledger: "PRIMARY_CARRIER",
  // a reconciliation close and a cohort are DERIVED from ledger units (Population re-derives them at admission): neither can hold a unit
  // identity that no ledger holds, so a ledger-complete scope covers them
  population_close: "DERIVED_FROM_LEDGERS",
  population_cohort: "DERIVED_FROM_LEDGERS",
  // the PC's own individual interval, its representation determination and the scope itself: not workforce accounting
  population_pc_occupancy: "PC_OWN_FACT",
  population_pc_representation: "PC_OWN_FACT",
  population_workforce_scope: "PC_OWN_FACT",
} as const;

describe("the workforce scope covers exactly Population's primary carrier", () => {
  it("every Population kind is classified, and exactly one is a primary carrier", () => {
    expect(POPULATION.map((k) => k.id).sort()).toEqual(Object.keys(CLASSIFIED).sort());
    expect(Object.values(CLASSIFIED).filter((c) => c === "PRIMARY_CARRIER")).toHaveLength(1);
  });

  it("the unit's residence, presence and burden live only in the ledger's unit schema", () => {
    const src = readFileSync("packages/contracts/src/population.ts", "utf8");
    expect(src.match(/presence: PlaceRef/g)).toHaveLength(1);
    expect(src.match(/burden_allocation: PlaceRef/g)).toHaveLength(1);
    expect(src).toMatch(
      /PopulationUnitSchema = z\.strictObject\(\{\s*unit_id: EntityId,\s*\/\*\* where the unit is assigned/,
    );
  });

  it("the scope derivation scans exactly the primary carrier, by residence-at-locality, presence and burden", () => {
    const src = readFileSync("packages/engine/src/pc-collection/determinations.ts", "utf8");
    expect(src).toMatch(
      /liveWorkforceRepresentations[\s\S]*?atLocus\(l\.value, locality\)[\s\S]*?u\.presence === locality\.locus\.entity_id[\s\S]*?burdenLocus\(u\) === locality\.locus\.entity_id/,
    );
    expect(src.match(/populationLedgers\(facts\)/g)!.length).toBeGreaterThan(0);
  });
});
