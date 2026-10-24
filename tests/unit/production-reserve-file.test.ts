/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw Reserve documents */
// The identity of a confirmed Reserve proposal is a pure function of the authored content and the campaign: the same proposal always
// reaches the same publication identities (so a retry converges), and any change reaches different ones (so a different choice is never
// mistaken for the committed one). The file is read once, strictly: exactly the unchanged `EstablishReserveInput`, with nothing added,
// defaulted, relaxed or inferred.
import { chmodSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { EstablishReserveInputSchema } from "@immortalis/contracts";
import {
  expectedReserve,
  productionReserveId,
  readProductionReserveFile,
} from "@immortalis/operator";
import { reserveDoc, writeReserve } from "../support/production-reserve.ts";

const read = (d: unknown) => {
  const r = readProductionReserveFile(writeReserve(d));
  if (!r.ok) throw new Error(`not valid: ${r.error.code}`);
  return r.value;
};
const refused = (d: unknown, mode?: number) => readProductionReserveFile(writeReserve(d, mode));

describe("productionReserveId", () => {
  it("is deterministic, 128 bits of hex, and independent of object key order", () => {
    const a = productionReserveId("c1", read(reserveDoc()));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(productionReserveId("c1", read(reserveDoc()))).toBe(a);
    const d = reserveDoc();
    const reordered = {
      locus_id: d.locus_id,
      world_id: d.world_id,
      condition: d.condition,
      quantity: { unit: d.quantity.unit, amount: d.quantity.amount },
      material_class: d.material_class,
      reserve_id: d.reserve_id,
    };
    expect(productionReserveId("c1", read(reordered))).toBe(a);
  });

  const changes: [string, (d: any) => void][] = [
    ["the reserve id", (d) => (d.reserve_id = "reserve-x")],
    ["the material class", (d) => (d.material_class = "red-salt")],
    ["the exact quantity", (d) => (d.quantity.amount += 1)],
    ["the unit", (d) => (d.quantity.unit = "barrel")],
    ["the condition", (d) => (d.condition = "wet")],
    ["the world", (d) => (d.world_id = "world-other")],
    ["the locus", (d) => (d.locus_id = "locus-other")],
  ];
  for (const [name, change] of changes)
    it(`changes with ${name}`, () => {
      const base = productionReserveId("c1", read(reserveDoc()));
      const doc = reserveDoc();
      change(doc);
      expect(productionReserveId("c1", read(doc))).not.toBe(base);
    });

  it("changes with the campaign", () => {
    expect(productionReserveId("c1", read(reserveDoc()))).not.toBe(
      productionReserveId("c2", read(reserveDoc())),
    );
  });
});

describe("readProductionReserveFile accepts exactly the unchanged strict EstablishReserveInput", () => {
  it("returns exactly what was authored, and the schema has exactly the six fields", () => {
    const doc = reserveDoc();
    expect(read(doc)).toEqual(doc);
    expect(Object.keys(EstablishReserveInputSchema.shape).sort()).toEqual(
      ["condition", "locus_id", "material_class", "quantity", "reserve_id", "world_id"].sort(),
    );
  });

  it("admits a zero quantity (the exact schema permits it) and a large safe integer", () => {
    expect(read(reserveDoc({ quantity: { amount: 0, unit: "sack" } })).quantity.amount).toBe(0);
    expect(
      read(reserveDoc({ quantity: { amount: Number.MAX_SAFE_INTEGER, unit: "sack" } })).quantity
        .amount,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  const without = (k: string) => (d: any) => delete d[k];
  const bad: [string, (d: any) => void][] = [
    ["no reserve id", without("reserve_id")],
    ["no material class", without("material_class")],
    ["no quantity", without("quantity")],
    ["no unit", (d) => delete d.quantity.unit],
    ["no amount", (d) => delete d.quantity.amount],
    ["no condition", without("condition")],
    ["no world", without("world_id")],
    ["no locus", without("locus_id")],
    ["a negative amount", (d) => (d.quantity.amount = -1)],
    ["a fractional amount", (d) => (d.quantity.amount = 2.5)],
    ["a string amount", (d) => (d.quantity.amount = "15")],
    ["an unsafe-integer amount", (d) => (d.quantity.amount = 2 ** 53)],
    ["an infinite-looking amount", (d) => (d.quantity.amount = null)],
    ["a ranged quantity", (d) => (d.quantity = { min: 1, max: 2, unit: "sack" })],
    ["a bare number quantity", (d) => (d.quantity = 15)],
    ["a reserve id that is a key path", (d) => (d.reserve_id = "reserve/one")],
    ["an empty reserve id", (d) => (d.reserve_id = "")],
    ["a non-string condition", (d) => (d.condition = 3)],
  ];
  for (const [name, mutate] of bad)
    it(`refuses ${name}`, () => {
      const doc = reserveDoc();
      mutate(doc);
      const r = refused(doc);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("INVALID_RESERVE");
    });

  for (const field of [
    "format",
    "owner",
    "facet",
    "version",
    "established",
    "consumed",
    "inflows",
    "claims",
    "holding",
    "locality",
    "title",
    "entitlement",
    "owner_actor",
    "collected",
    "delivered",
    "source_key",
    "confirmed",
    "publication",
    "default",
    "estimate",
  ])
    it(`refuses an added ${field} field (the schema is strict; nothing is defaulted or smuggled)`, () => {
      const r = refused(reserveDoc({ [field]: field === "consumed" ? [] : "x" }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("INVALID_RESERVE");
    });

  it("refuses a quantity carrying an extra field", () => {
    const doc = reserveDoc();
    doc.quantity.estimated = true;
    expect(refused(doc).ok).toBe(false);
  });

  it("refuses a file that is not JSON, a list, empty, null or a string", () => {
    for (const text of ["{not json", "[]", "", "null", '"salt"', "42"]) {
      const r = refused(text);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("INVALID_RESERVE");
    }
  });

  it("refuses a file larger than a Reserve can be", () => {
    const r = refused(reserveDoc({ condition: "x".repeat(70_000) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INVALID_RESERVE");
  });
});

describe("readProductionReserveFile trusts only a private regular file", () => {
  it("refuses a file others can write", () => {
    for (const mode of [0o666, 0o662, 0o620]) {
      const r = refused(reserveDoc(), mode);
      expect(r.ok, mode.toString(8)).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("RESERVE_FILE_UNTRUSTED");
    }
  });

  it("refuses a link, a directory and a missing file", () => {
    const real = writeReserve(reserveDoc());
    const link = join(dirname(real), "link.json");
    symlinkSync(real, link);
    const viaLink = readProductionReserveFile(link);
    expect(viaLink.ok).toBe(false);
    if (!viaLink.ok) expect(viaLink.error.code).toBe("RESERVE_FILE_UNREADABLE");
    const dir = readProductionReserveFile(dirname(real));
    expect(dir.ok).toBe(false);
    if (!dir.ok) expect(dir.error.code).toBe("RESERVE_FILE_UNTRUSTED");
    const missing = readProductionReserveFile(join(dirname(real), "absent.json"));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("RESERVE_FILE_UNREADABLE");
  });

  it("reads the file once: a later change cannot alter what was read", () => {
    const file = writeReserve(reserveDoc());
    const first = readProductionReserveFile(file);
    writeFileSync(file, JSON.stringify(reserveDoc({ reserve_id: "reserve-changed" })));
    chmodSync(file, 0o600);
    expect(first.ok && first.value.reserve_id).toBe("reserve-salt-store");
  });
});

describe("expectedReserve is the literal derivation of the owner (WS-003 §2, §4)", () => {
  it("holds the whole established quantity unclaimed and unspent, locally by Production, with no inflow collection", () => {
    const v = expectedReserve(read(reserveDoc()));
    expect(v).toEqual({
      reserve_id: "reserve-salt-store",
      material_class: "raw-salt",
      established: { amount: 15, unit: "sack" },
      quantity: { amount: 15, unit: "sack" },
      consumed: [],
      condition: "dry-stacked",
      locality: {
        world: { fact_key: "world/world-ashfall/profile", entity_id: "world-ashfall" },
        locus: {
          fact_key: "world/world-ashfall/locus/locus-salt-pans",
          entity_id: "locus-salt-pans",
        },
      },
      holding: "HELD_LOCAL_BY_PRODUCTION",
      claims: [],
    });
    expect("inflows" in v).toBe(false);
  });
});
