import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CHRONOLOGY_DOCUMENT_FORMAT,
  ChronologyDocumentSchema,
  canonicalJson,
} from "@immortalis/contracts";
import { chronologyDocumentHash } from "@immortalis/engine";
import { STARTING_CHRONOLOGY_FORMAT, StartingChronologySchema } from "@immortalis/operator";

/**
 * A0-T00 — the literal v1 baseline corpus of BLUE F-014B Scoped Lowering v0.4 §3 N-2 (pin 2026-11-19T10:56:17.128Z), which BLUE's
 * Issue #114 direct decisions (pin 2026-11-20T00:15:08.470Z) make the first mandatory A0 fidelity condition.
 *
 * It CHARACTERIZES EXISTING v1 LAW ONLY. It is preparatory under BLUE's 20 Nov 2026 gate interpretation ("independent tests of presently
 * existing code") and implements nothing: no schema, writer, rule, registry entry, identity or pin is added or changed, and the strict
 * operator parser and its source-text conformance test stay unmodified.
 *
 * Both live exports are imported: the contracts' `ChronologyDocumentSchema` (packages/contracts/src/initial-locality.ts) and the
 * operator's `StartingChronologySchema` (packages/operator/src/time-initialization.ts). Every specimen carries an explicit, frozen
 * verdict. Where a specimen is accepted, the two parse outputs, their canonical JSON and their `chronologyDocumentHash` are compared with
 * each other and with SHA-256 over that canonical JSON (the original `document_hash` formula). No literal digest is written here.
 */

const FORMAT = "immortalis-starting-chronology";

type Verdict = "accept" | "refuse";
interface Specimen {
  readonly name: string;
  readonly verdict: Verdict;
  readonly doc: unknown;
  /** an accepted specimen whose canonical bytes are expected to equal those of the named accepted specimen */
  readonly sameBytesAs?: string;
}

const base = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: FORMAT,
  format_version: 1,
  time: { unit: "turn", value: 0 },
  statement: "The first morning after the river flood.",
  ...over,
});
const omit = (key: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(base()).filter(([k]) => k !== key));
const at = (time: unknown): Record<string, unknown> => base({ time });

const VALID: readonly Specimen[] = [
  { name: "base: unit turn, value 0", verdict: "accept", doc: base() },
  { name: "single-character unit, value 0", verdict: "accept", doc: at({ unit: "s", value: 0 }) },
  {
    name: "arbitrary unit Id with inner spaces and non-ASCII, value MAX_SAFE_INTEGER",
    verdict: "accept",
    doc: at({ unit: "lunar cycle of Ærendil", value: Number.MAX_SAFE_INTEGER }),
  },
  {
    name: "arbitrary unit Id with punctuation, mid-range value",
    verdict: "accept",
    doc: at({ unit: "bell-of-the-third-watch:v1", value: 4_294_967_296 }),
  },
  {
    name: "statement with inner line break and punctuation",
    verdict: "accept",
    doc: base({ statement: "Year 412 of the Long Peace,\nthe night the beacon failed." }),
  },
  {
    name: "fields supplied in a different insertion order",
    verdict: "accept",
    doc: {
      statement: "The first morning after the river flood.",
      time: { value: 0, unit: "turn" },
      format_version: 1,
      format: FORMAT,
    },
    sameBytesAs: "base: unit turn, value 0",
  },
  {
    // observed existing law: z.number().int().nonnegative() admits -0, and canonicalJson writes it as 0
    name: "observed edge: value -0",
    verdict: "accept",
    doc: at({ unit: "turn", value: -0 }),
    sameBytesAs: "base: unit turn, value 0",
  },
];

const NEGATIVE: readonly Specimen[] = [
  // wrong version
  { name: "format_version 2", verdict: "refuse", doc: base({ format_version: 2 }) },
  { name: "format_version 0", verdict: "refuse", doc: base({ format_version: 0 }) },
  { name: "format_version null", verdict: "refuse", doc: base({ format_version: null }) },
  // wrong format literal
  {
    name: "format with trailing space",
    verdict: "refuse",
    doc: base({ format: `${FORMAT} ` }),
  },
  {
    name: "format in a different case",
    verdict: "refuse",
    doc: base({ format: "Immortalis-starting-chronology" }),
  },
  {
    name: "format of the record-only capture",
    verdict: "refuse",
    doc: base({ format: "immortalis-record-only-chronology" }),
  },
  // missing fields
  { name: "missing format", verdict: "refuse", doc: omit("format") },
  { name: "missing format_version", verdict: "refuse", doc: omit("format_version") },
  { name: "missing time", verdict: "refuse", doc: omit("time") },
  { name: "missing statement", verdict: "refuse", doc: omit("statement") },
  { name: "empty object", verdict: "refuse", doc: {} },
  // extra fields
  {
    name: "extra top-level scale (the proposed v2 member)",
    verdict: "refuse",
    doc: base({ scale: "ONE_SI_SECOND_PER_CANONICAL_UNIT" }),
  },
  { name: "extra top-level note", verdict: "refuse", doc: base({ note: "x" }) },
  {
    name: "extra own __proto__ key from JSON text",
    verdict: "refuse",
    doc: JSON.parse(`{${JSON.stringify(base()).slice(1, -1)},"__proto__":{"x":1}}`) as unknown,
  },
  {
    name: "extra time member",
    verdict: "refuse",
    doc: at({ unit: "turn", value: 0, epoch: "flood" }),
  },
  // wrong time shape
  { name: "time as a number", verdict: "refuse", doc: at(0) },
  { name: "time as a string", verdict: "refuse", doc: at("turn 0") },
  { name: "time null", verdict: "refuse", doc: at(null) },
  { name: "time as a [unit, value] array", verdict: "refuse", doc: at(["turn", 0]) },
  { name: "time missing unit", verdict: "refuse", doc: at({ value: 0 }) },
  { name: "time missing value", verdict: "refuse", doc: at({ unit: "turn" }) },
  // invalid unit
  { name: "unit empty", verdict: "refuse", doc: at({ unit: "", value: 0 }) },
  { name: "unit with leading space", verdict: "refuse", doc: at({ unit: " turn", value: 0 }) },
  { name: "unit with trailing space", verdict: "refuse", doc: at({ unit: "turn ", value: 0 }) },
  { name: "unit with a line feed", verdict: "refuse", doc: at({ unit: "tu\nrn", value: 0 }) },
  { name: "unit with DEL", verdict: "refuse", doc: at({ unit: "turn\u007f", value: 0 }) },
  { name: "unit null", verdict: "refuse", doc: at({ unit: null, value: 0 }) },
  // out-of-bounds value
  { name: "value -1", verdict: "refuse", doc: at({ unit: "turn", value: -1 }) },
  {
    name: "value MAX_SAFE_INTEGER + 1",
    verdict: "refuse",
    doc: at({ unit: "turn", value: Number.MAX_SAFE_INTEGER + 1 }),
  },
  {
    name: "value MIN_SAFE_INTEGER",
    verdict: "refuse",
    doc: at({ unit: "turn", value: Number.MIN_SAFE_INTEGER }),
  },
  { name: "value 0.5", verdict: "refuse", doc: at({ unit: "turn", value: 0.5 }) },
  { name: "value NaN", verdict: "refuse", doc: at({ unit: "turn", value: Number.NaN }) },
  {
    name: "value Infinity",
    verdict: "refuse",
    doc: at({ unit: "turn", value: Number.POSITIVE_INFINITY }),
  },
  // invalid statement
  { name: "statement empty", verdict: "refuse", doc: base({ statement: "" }) },
  { name: "statement with leading space", verdict: "refuse", doc: base({ statement: " Dawn." }) },
  {
    name: "statement with trailing newline",
    verdict: "refuse",
    doc: base({ statement: "Dawn.\n" }),
  },
  {
    name: "statement with leading no-break space",
    verdict: "refuse",
    doc: base({ statement: " Dawn." }),
  },
  // coercion attempts
  { name: "format_version as string 1", verdict: "refuse", doc: base({ format_version: "1" }) },
  { name: "format_version true", verdict: "refuse", doc: base({ format_version: true }) },
  { name: "value as string 0", verdict: "refuse", doc: at({ unit: "turn", value: "0" }) },
  { name: "value as string 42", verdict: "refuse", doc: at({ unit: "turn", value: "42" }) },
  { name: "value true", verdict: "refuse", doc: at({ unit: "turn", value: true }) },
  { name: "value null", verdict: "refuse", doc: at({ unit: "turn", value: null }) },
  { name: "value bigint 0n", verdict: "refuse", doc: at({ unit: "turn", value: 0n }) },
  { name: "value boxed Number(0)", verdict: "refuse", doc: at({ unit: "turn", value: Object(0) }) },
  { name: "unit as number 7", verdict: "refuse", doc: at({ unit: 7, value: 0 }) },
  { name: "statement as number", verdict: "refuse", doc: base({ statement: 412 }) },
  { name: "document as its JSON text", verdict: "refuse", doc: JSON.stringify(base()) },
  { name: "document null", verdict: "refuse", doc: null },
  { name: "document as an array", verdict: "refuse", doc: [base()] },
];

const SPECIMENS: readonly Specimen[] = [...VALID, ...NEGATIVE];
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

describe("A0-T00 v1 baseline corpus: ChronologyDocumentSchema and StartingChronologySchema", () => {
  it("A0-T00 baseline (existing v1 law): both live exports name the one exact format literal", () => {
    expect(CHRONOLOGY_DOCUMENT_FORMAT).toBe(FORMAT);
    expect(STARTING_CHRONOLOGY_FORMAT).toBe(FORMAT);
  });

  it("A0-T00 baseline (existing v1 law): the corpus is frozen at 7 accepted and 50 refused specimens with unique names", () => {
    expect(SPECIMENS.filter((s) => s.verdict === "accept")).toHaveLength(7);
    expect(SPECIMENS.filter((s) => s.verdict === "refuse")).toHaveLength(50);
    expect(new Set(SPECIMENS.map((s) => s.name)).size).toBe(SPECIMENS.length);
    expect(VALID.every((s) => s.verdict === "accept")).toBe(true);
    expect(NEGATIVE.every((s) => s.verdict === "refuse")).toBe(true);
  });

  for (const s of SPECIMENS)
    it(`A0-T00 baseline (existing v1 law): ${s.verdict} ${s.name}`, () => {
      const contracts = ChronologyDocumentSchema.safeParse(s.doc);
      const operator = StartingChronologySchema.safeParse(s.doc);
      expect(contracts.success, "ChronologyDocumentSchema verdict").toBe(s.verdict === "accept");
      expect(operator.success, "StartingChronologySchema verdict").toBe(s.verdict === "accept");
      if (contracts.success && operator.success) {
        expect(contracts.data).toStrictEqual(operator.data);
        const bytes = canonicalJson(contracts.data);
        expect(canonicalJson(operator.data)).toBe(bytes);
        // strict parsing normalizes nothing on an accepted document: its canonical bytes are the input's
        expect(canonicalJson(s.doc)).toBe(bytes);
        const hash = chronologyDocumentHash(contracts.data);
        expect(chronologyDocumentHash(operator.data)).toBe(hash);
        // the original formula: document_hash = SHA256(canonicalJson(document))
        expect(hash).toBe(sha256(bytes));
      } else if (!contracts.success && !operator.success) {
        // the same refusal, issue for issue
        expect(contracts.error.issues).toStrictEqual(operator.error.issues);
      }
    });

  it("A0-T00 baseline (existing v1 law): accepted documents share canonical bytes and hash exactly where frozen as equivalent", () => {
    const accepted = SPECIMENS.filter((s) => s.verdict === "accept");
    const root = (s: Specimen): string => s.sameBytesAs ?? s.name;
    const hashOf = (s: Specimen): string =>
      chronologyDocumentHash(ChronologyDocumentSchema.parse(s.doc));
    for (const a of accepted)
      for (const b of accepted) {
        if (a === b) continue;
        const same = root(a) === root(b);
        expect(hashOf(a) === hashOf(b), `${a.name} vs ${b.name}`).toBe(same);
        expect(
          canonicalJson(StartingChronologySchema.parse(a.doc)) ===
            canonicalJson(StartingChronologySchema.parse(b.doc)),
          `${a.name} vs ${b.name}`,
        ).toBe(same);
      }
  });
});
