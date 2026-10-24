/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw corridor documents */
// The identity of a confirmed corridor is a pure function of the authored content and the campaign: the same proposal always reaches the
// same publication identity (so a retry converges), and any change reaches a different one (so a different choice is never mistaken for
// the committed one). The file is read once, strictly, and carries only the world, the two loci and a statement.
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { corridorId, readCorridorFile } from "@immortalis/operator";
import { corridorDoc, writeCorridor } from "../support/corridor.ts";
import { tempDir } from "../support/tmp.ts";

const read = (d: unknown) => {
  const r = readCorridorFile(writeCorridor(d));
  if (!r.ok) throw new Error(`not valid: ${r.error.code}`);
  return r.value;
};
const refused = (d: unknown, mode?: number) => {
  const r = readCorridorFile(writeCorridor(d, mode));
  return r.ok ? "OK" : r.error.code;
};

describe("corridorId", () => {
  it("is deterministic, 128 bits of hex, and independent of object key order", () => {
    const a = corridorId("c1", read(corridorDoc()));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(corridorId("c1", read(corridorDoc()))).toBe(a);
    const d = corridorDoc();
    const reordered = {
      corridor: {
        statement: d.corridor.statement,
        to_locus_id: d.corridor.to_locus_id,
        from_locus_id: d.corridor.from_locus_id,
        world_id: d.corridor.world_id,
      },
      format_version: 1,
      format: d.format,
    };
    expect(corridorId("c1", read(reordered))).toBe(a);
  });

  const changes: [string, (d: any) => void][] = [
    ["the world", (d) => (d.corridor.world_id = "world-other")],
    ["the origin", (d) => (d.corridor.from_locus_id = "locus-x")],
    ["the destination", (d) => (d.corridor.to_locus_id = "locus-y")],
    [
      "the direction",
      (d) =>
        ([d.corridor.from_locus_id, d.corridor.to_locus_id] = [
          d.corridor.to_locus_id,
          d.corridor.from_locus_id,
        ]),
    ],
    ["the statement", (d) => (d.corridor.statement = "Another way.")],
  ];
  for (const [name, change] of changes)
    it(`changes with ${name}`, () => {
      const base = corridorId("c1", read(corridorDoc()));
      const doc = corridorDoc();
      change(doc);
      expect(corridorId("c1", read(doc))).not.toBe(base);
    });

  it("changes with the campaign", () => {
    expect(corridorId("c1", read(corridorDoc()))).not.toBe(corridorId("c2", read(corridorDoc())));
  });
});

describe("readCorridorFile", () => {
  it("accepts a complete document and returns exactly what was authored", () => {
    const doc = corridorDoc();
    expect(read(doc)).toEqual(doc);
  });

  const set = (path: string[], value: unknown) => (d: any) => {
    let o = d;
    for (const k of path.slice(0, -1)) o = o[k];
    o[path.at(-1)!] = value;
  };
  const without = (path: string[]) => (d: any) => {
    let o = d;
    for (const k of path.slice(0, -1)) o = o[k];
    delete o[path.at(-1)!];
  };
  const invalid: [string, (d: any) => void][] = [
    ["no format", without(["format"])],
    ["another format", set(["format"], "immortalis-additional-locality")],
    ["another format version", set(["format_version"], 2)],
    ["no corridor section", without(["corridor"])],
    ["a top-level extra field", set(["route"], ["a", "b"])],
    ["a reverse section", set(["reverse"], { from_locus_id: "b", to_locus_id: "a" })],
    ["no world", without(["corridor", "world_id"])],
    ["no origin", without(["corridor", "from_locus_id"])],
    ["no destination", without(["corridor", "to_locus_id"])],
    ["no statement", without(["corridor", "statement"])],
    ["an empty statement", set(["corridor", "statement"], "")],
    ["a statement with surrounding whitespace", set(["corridor", "statement"], " a road ")],
    ["the same locus at both ends", (d) => (d.corridor.to_locus_id = d.corridor.from_locus_id)],
    ["an origin that is a key path", set(["corridor", "from_locus_id"], "locus/a")],
    ["a destination that is a key path", set(["corridor", "to_locus_id"], "locus/b")],
    ["a distance", set(["corridor", "distance"], { amount: 3, unit: "mile" })],
    ["a travel duration", set(["corridor", "travel_duration"], 4)],
    ["a speed", set(["corridor", "speed"], 5)],
    ["a capacity or throughput", set(["corridor", "capacity"], 2)],
    ["an access right", set(["corridor", "access"], "open to all")],
    ["a hazard verdict", set(["corridor", "hazard"], "none")],
    ["a passability claim", set(["corridor", "passable"], true)],
    ["a feasibility or delivery claim", set(["corridor", "feasible"], true)],
    ["a reverse flag", set(["corridor", "bidirectional"], true)],
    ["intermediate loci", set(["corridor", "via"], ["locus-mid"])],
    ["an owner", set(["corridor", "owner"], "world_state")],
    ["a version", set(["corridor", "version"], 1)],
    ["a derived world reference", set(["corridor", "world"], { fact_key: "x", entity_id: "y" })],
    ["a publication label", set(["corridor", "basis"], "b")],
    ["a confirmed claim", set(["confirmed"], true)],
  ];
  it.each(invalid)("refuses %s", (_name, change) => {
    const doc = corridorDoc();
    change(doc);
    expect(refused(doc)).toBe("INVALID_CORRIDOR");
  });

  it("refuses a document that is not JSON, is a list, or is empty", () => {
    for (const text of ["not json", "[]", "", "null", "42", '"corridor"'])
      expect(refused(text)).toBe("INVALID_CORRIDOR");
  });

  it("refuses a file others can write, a link, a directory and a missing file; a file larger than a corridor can be", () => {
    expect(refused(corridorDoc(), 0o666)).toBe("CORRIDOR_FILE_UNTRUSTED");
    expect(refused(corridorDoc(), 0o620)).toBe("CORRIDOR_FILE_UNTRUSTED");
    const dir = tempDir("immortalis-corridor-file-");
    chmodSync(dir, 0o700);
    expect(readCorridorFile(dir).ok).toBe(false);
    expect(readCorridorFile(join(dir, "missing.json"))).toMatchObject({
      ok: false,
      error: { code: "CORRIDOR_FILE_UNREADABLE" },
    });
    const real = writeCorridor(corridorDoc());
    const link = join(dir, "link.json");
    symlinkSync(real, link);
    expect(readCorridorFile(link)).toMatchObject({
      ok: false,
      error: { code: "CORRIDOR_FILE_UNREADABLE" },
    });
    mkdirSync(join(dir, "sub"));
    const big = join(dir, "big.json");
    writeFileSync(big, JSON.stringify({ ...corridorDoc(), pad: "x".repeat(40_000) }));
    chmodSync(big, 0o600);
    expect(readCorridorFile(big)).toMatchObject({ ok: false, error: { code: "INVALID_CORRIDOR" } });
  });
});
