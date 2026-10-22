/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw locality documents */
// The identity of a confirmed additional locality is a pure function of the authored content and the campaign: the same proposal always
// reaches the same publication identities (so a retry converges), and any change reaches different ones (so a different choice is never
// mistaken for the committed one). The file is read once, strictly, and a locality needs a physical access fact.
import { describe, expect, it } from "vitest";
import { additionalLocalityId, readAdditionalLocalityFile } from "@immortalis/operator";
import { localityDoc, writeLocality } from "../support/additional-locality.ts";

const read = (d: unknown) => {
  const r = readAdditionalLocalityFile(writeLocality(d));
  if (!r.ok) throw new Error(`not valid: ${r.error.code}`);
  return r.value;
};

describe("additionalLocalityId", () => {
  it("is deterministic, 128 bits of hex, and independent of object key order", () => {
    const a = additionalLocalityId("c1", read(localityDoc()));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(additionalLocalityId("c1", read(localityDoc()))).toBe(a);
    const d = localityDoc();
    const reordered = {
      source: d.source,
      locus: d.locus,
      format_version: 1,
      format: d.format,
    };
    expect(additionalLocalityId("c1", read(reordered))).toBe(a);
  });

  const changes: [string, (d: any) => void][] = [
    ["the locus id", (d) => ((d.locus.locus_id = "locus-x"), (d.source.locus_id = "locus-x"))],
    ["the designation", (d) => (d.locus.designation = "Elsewhere")],
    ["a locus constraint", (d) => d.locus.constraints.push({ aspect: "a", statement: "b" })],
    ["the source key", (d) => (d.source.source_key = "src-other")],
    ["the exact quantity", (d) => (d.source.quantity.amount += 1)],
    ["the unit", (d) => (d.source.quantity.unit = "barrel")],
    ["the material", (d) => (d.source.material_class = "raw-clay")],
    ["the dimension", (d) => (d.source.dimension = "deep-seam")],
    ["an access fact", (d) => (d.source.access_facts[0].statement = "By boat.")],
    ["the statement", (d) => (d.source.statement = "Another statement.")],
  ];
  for (const [name, change] of changes)
    it(`changes with ${name}`, () => {
      const base = additionalLocalityId("c1", read(localityDoc()));
      const doc = localityDoc();
      change(doc);
      expect(additionalLocalityId("c1", read(doc))).not.toBe(base);
    });

  it("changes with the campaign", () => {
    expect(additionalLocalityId("c1", read(localityDoc()))).not.toBe(
      additionalLocalityId("c2", read(localityDoc())),
    );
  });
});

describe("readAdditionalLocalityFile", () => {
  it("accepts a complete document and returns exactly what was authored", () => {
    const doc = localityDoc();
    expect(read(doc)).toEqual(doc);
  });

  it("refuses a locality whose source states no physical access fact (this command's own eligibility)", () => {
    const doc = localityDoc();
    doc.source.access_facts = [];
    const r = readAdditionalLocalityFile(writeLocality(doc));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_LOCALITY");
  });

  it("refuses sections that disagree about the world or the locus", () => {
    for (const mutate of [
      (d: any) => (d.source.world_id = "world-other"),
      (d: any) => (d.source.locus_id = "locus-other"),
    ]) {
      const doc = localityDoc();
      mutate(doc);
      const r = readAdditionalLocalityFile(writeLocality(doc));
      expect(r.ok).toBe(false);
    }
  });

  it("refuses a file others can write", () => {
    const r = readAdditionalLocalityFile(writeLocality(localityDoc(), 0o666));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("LOCALITY_FILE_UNTRUSTED");
  });
});
