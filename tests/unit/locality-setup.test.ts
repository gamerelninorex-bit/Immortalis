/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw setup documents */
// The identity of a confirmed locality setup is a pure function of the authored content and the campaign: the same setup always
// reaches the same publication identities (so a retry converges), and any change reaches different ones (so a different choice is
// never mistaken for the committed one).
import { describe, expect, it } from "vitest";
import { LocalitySetupSchema, localitySetupId, readLocalitySetupFile } from "@immortalis/operator";
import { setupDoc, writeSetup } from "../support/locality.ts";

const parse = (d: unknown) => LocalitySetupSchema.parse(d);

describe("localitySetupId", () => {
  it("is deterministic, 128 bits of hex, and independent of object key order", () => {
    const a = localitySetupId("c1", parse(setupDoc()));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(localitySetupId("c1", parse(setupDoc()))).toBe(a);
    const d = setupDoc();
    const reordered = {
      source: d.source,
      locus: d.locus,
      world: d.world,
      format_version: 1,
      format: d.format,
    };
    expect(localitySetupId("c1", parse(reordered))).toBe(a);
  });

  const changes: [string, (d: any) => void][] = [
    ["the premise", (d) => (d.world.premise = "Another premise.")],
    ["the established canon", (d) => (d.world.reference_causal_basis.established_canon = "Other.")],
    ["a law departure", (d) => d.world.material_world_law_departures.push("Gravity is mild.")],
    [
      "an insertion constraint",
      (d) => d.world.insertion_supporting_constraints.push({ aspect: "a", statement: "b" }),
    ],
    ["the locus designation", (d) => (d.locus.designation = "Elsewhere")],
    ["a locus constraint", (d) => d.locus.constraints.push({ aspect: "a", statement: "b" })],
    ["the exact quantity", (d) => (d.source.quantity.amount += 1)],
    ["the unit", (d) => (d.source.quantity.unit = "barrel")],
    ["the material", (d) => (d.source.material_class = "raw-clay")],
    ["the dimension", (d) => (d.source.dimension = "deep-seam")],
    ["an access fact", (d) => (d.source.access_facts[0].statement = "By boat.")],
    ["the source statement", (d) => (d.source.statement = "Another statement.")],
    ["the source key", (d) => (d.source.source_key = "src-2")],
  ];
  for (const [name, change] of changes)
    it(`differs when ${name} differs`, () => {
      const d = setupDoc();
      change(d);
      expect(localitySetupId("c1", parse(d))).not.toBe(localitySetupId("c1", parse(setupDoc())));
    });

  it("differs between campaigns, so one campaign's confirmation is never another's", () => {
    expect(localitySetupId("c1", parse(setupDoc()))).not.toBe(
      localitySetupId("c2", parse(setupDoc())),
    );
  });
});

describe("readLocalitySetupFile", () => {
  it("returns exactly the authored, strictly valid setup", () => {
    const read = readLocalitySetupFile(writeSetup(setupDoc()));
    expect(read.ok && read.value).toEqual(setupDoc());
  });

  it("reports the schema's own complaint for an invalid one, without the authored text", () => {
    const d = setupDoc();
    d.source.quantity.amount = 0;
    const read = readLocalitySetupFile(writeSetup(d));
    expect(!read.ok && read.error.code).toBe("INVALID_SETUP");
    const issues = ((!read.ok && read.error.details) as { issues: string[] }).issues;
    expect(issues.join("\n")).toContain("source.quantity");
    expect(issues.join("\n")).not.toContain(d.world.premise);
  });
});
