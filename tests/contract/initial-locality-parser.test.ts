import { describe, expect, it } from "vitest";
import {
  CHRONOLOGY_DOCUMENT_MAX_BYTES,
  INITIAL_LOCALITY_PARSER_V1,
  INITIAL_LOCALITY_PARSER_V2,
  PRODUCER_INPUT_MAX_BYTES,
  RAW_RESPONSE_MAX_BYTES,
  SETUP_MESSAGE_MAX_BYTES,
  SceneOutputSchema,
  SceneOutputSchemaV1,
  ScopeOutputSchema,
  ScopeOutputSchemaV1,
  canonicalJson,
  parseInitialLocalityJson,
} from "@immortalis/contracts";

/**
 * Golden vectors of the strict initial-locality parsers (Initial Locality Bootstrap v0.9, companion "Common Types", and the Sovereign-ratified
 * C-1 amendment). V2 is current: the model echoes only task_id. V1 is FROZEN fixture history: it also echoed input_hash. MECHANISM: pure
 * parser/schema behaviour; no model, runner or journal is involved.
 */
const H = "a".repeat(64);
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);
const parse = (s: string | Uint8Array) =>
  parseInitialLocalityJson(typeof s === "string" ? bytes(s) : s, RAW_RESPONSE_MAX_BYTES);
const code = (s: string | Uint8Array): string | null => {
  const r = parse(s);
  return r.ok ? null : r.error.code;
};

const facets = ["DOMAIN_BOUNDARY", "ACTOR_COVERAGE", "SOURCE_CLAIMS", "WORKFORCE_COVERAGE"].map(
  (f) => ({
    facet: f,
    mode: "DELEGATED",
    evidence_quotes: ["make a woodlot"],
    source_refs: [],
  }),
);
const scope = {
  kind: "SCOPE",
  task_id: H,
  message_use: "SETUP_AUTHORSHIP_ONLY",
  facets,
  restrictions: [],
  unhandled_constraints: [],
  clarification: null,
};
const selection = {
  domain: { designation: "woodlot", topology: "a fenced clearing" },
  closure: { kind: "CLOSED", ground: "fenced" },
  actors: { kind: "NONE_IN_DOMAIN", constraints: [], ground: "nobody lives here" },
  source_claims: [
    {
      source: { fact_key: "world/w/source/s", version: 1 },
      kind: "NONE_ESTABLISHED",
      claimant: null,
      ground: "no claim stated",
    },
  ],
  workforce: { scope_statement: "no workforce" },
  coverage: {
    start: { unit: "seconds", value: 0 },
    end: { unit: "seconds", value: 3600 },
    ground: "one hour",
  },
  provenance: [],
};

const scopeV1 = { ...scope, input_hash: H };

describe("INITIAL_LOCALITY_PARSER_V2 golden vectors (current) and the frozen V1 shape", () => {
  it("names the version-pinned parsers", () => {
    expect(INITIAL_LOCALITY_PARSER_V1).toBe("INITIAL_LOCALITY_PARSER_V1");
    expect(INITIAL_LOCALITY_PARSER_V2).toBe("INITIAL_LOCALITY_PARSER_V2");
  });

  it("V2 rejects (never strips) a returned input_hash and requires task_id; the frozen V1 shape requires input_hash", () => {
    expect(ScopeOutputSchema.safeParse(scope).success).toBe(true);
    expect(ScopeOutputSchema.safeParse(scopeV1).success).toBe(false); // input_hash is a foreign field under V2
    const { task_id: _omit, ...noTask } = scope;
    void _omit;
    expect(ScopeOutputSchema.safeParse(noTask).success).toBe(false); // wrong/missing task_id rejects
    expect(ScopeOutputSchema.safeParse({ ...scope, task_id: "short" }).success).toBe(false);
    expect(ScopeOutputSchemaV1.safeParse(scopeV1).success).toBe(true);
    expect(ScopeOutputSchemaV1.safeParse(scope).success).toBe(false); // V1 requires the echo
    const selV2 = { kind: "SELECTION", task_id: H, selection };
    const unrV2 = {
      kind: "UNRESOLVED",
      task_id: H,
      reason: "INSUFFICIENT_CONSTRAINTS",
      explanation: "x",
    };
    for (const v2 of [selV2, unrV2]) {
      expect(SceneOutputSchema.safeParse(v2).success).toBe(true);
      expect(SceneOutputSchema.safeParse({ ...v2, input_hash: H }).success).toBe(false);
      expect(SceneOutputSchemaV1.safeParse({ ...v2, input_hash: H }).success).toBe(true);
      expect(SceneOutputSchemaV1.safeParse(v2).success).toBe(false);
    }
  });

  it("accepts valid SCOPE, SELECTION and UNRESOLVED outputs and replays identical bytes to an identical value", () => {
    const sel = { kind: "SELECTION", task_id: H, selection };
    const unresolved = {
      kind: "UNRESOLVED",
      task_id: H,
      reason: "INSUFFICIENT_CONSTRAINTS",
      explanation: "nothing was said about the ground",
    };
    for (const [value, schema] of [
      [scope, ScopeOutputSchema],
      [sel, SceneOutputSchema],
      [unresolved, SceneOutputSchema],
    ] as const) {
      const raw = canonicalJson(value);
      const a = parse(raw);
      const b = parse(raw);
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) {
        expect(canonicalJson(a.value)).toBe(canonicalJson(b.value));
        expect(schema.safeParse(a.value).success).toBe(true);
      }
    }
  });

  it("rejects a duplicate ordinary key, a Unicode-escaped-equivalent key and a duplicate nested key", () => {
    expect(code('{"a":1,"a":2}')).toBe("DUPLICATE_KEY");
    expect(code('{"a":1,"\\u0061":2}')).toBe("DUPLICATE_KEY");
    expect(code('{"outer":{"k":1,"k":2}}')).toBe("DUPLICATE_KEY");
    expect(code('{"x":[{"k":1,"\\u006b":2}]}')).toBe("DUPLICATE_KEY");
    // JSON.parse alone silently keeps the last duplicate: it is insufficient
    expect(JSON.parse('{"a":1,"a":2}')).toEqual({ a: 2 });
  });

  it("rejects malformed UTF-8, a byte-order mark and trailing data", () => {
    expect(code(new Uint8Array([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d]))).toBe(
      "MALFORMED_UTF8",
    );
    expect(code(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))).toBe("BOM_REJECTED");
    expect(code("{} x")).toBe("TRAILING_DATA");
    expect(code('{"a":1}{"a":1}')).toBe("TRAILING_DATA");
  });

  it("rejects non-finite, overflowing and unsafe numbers", () => {
    expect(code('{"n":1e999}')).toBe("NON_FINITE_NUMBER");
    expect(code('{"n":-1e999}')).toBe("NON_FINITE_NUMBER");
    expect(code('{"n":9007199254740993}')).toBe("UNSAFE_INTEGER");
    expect(code('{"n":NaN}')).toBe("SYNTAX");
    expect(code('{"n":Infinity}')).toBe("SYNTAX");
    expect(code('{"n":01}')).toBe("SYNTAX");
    expect(code('{"n":9007199254740991}')).toBeNull();
  });

  it("rejects unpaired surrogate escapes, control characters and bad syntax", () => {
    expect(code('{"a":"\\ud800"}')).toBe("LONE_SURROGATE");
    expect(code('{"a":"\\udc00"}')).toBe("LONE_SURROGATE");
    expect(code('{"a":"\\ud83d\\ude00"}')).toBeNull();
    expect(code('{"a":"\u0001"}')).toBe("SYNTAX");
    expect(code("{'a':1}")).toBe("SYNTAX");
    expect(code('{"a":1,}')).toBe("SYNTAX");
  });

  it("keeps a __proto__ key an own property, never a prototype", () => {
    const r = parse('{"__proto__":{"polluted":true}}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.getPrototypeOf(r.value)).toBe(Object.prototype);
      expect(Object.keys(r.value as object)).toEqual(["__proto__"]);
      expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    }
  });

  it("rejects invalid enums and foreign fields in the strict schemas", () => {
    expect(ScopeOutputSchema.safeParse({ ...scope, message_use: "SOMETHING_ELSE" }).success).toBe(
      false,
    );
    expect(ScopeOutputSchema.safeParse({ ...scope, extra: 1 }).success).toBe(false);
    expect(ScopeOutputSchema.safeParse({ ...scope, facets: [...facets].reverse() }).success).toBe(
      false,
    );
    expect(ScopeOutputSchema.safeParse({ ...scope, facets: facets.slice(0, 3) }).success).toBe(
      false,
    );
    expect(
      SceneOutputSchema.safeParse({
        kind: "UNRESOLVED",
        task_id: H,
        reason: "BECAUSE",
        explanation: "x",
      }).success,
    ).toBe(false);
    const bad = {
      ...selection,
      actors: { kind: "NONE_IN_DOMAIN", constraints: ["an actor"], ground: "g" },
    };
    expect(
      SceneOutputSchema.safeParse({ kind: "SELECTION", task_id: H, selection: bad }).success,
    ).toBe(false);
    const claimant = {
      ...selection,
      source_claims: [{ ...selection.source_claims[0]!, kind: "CLAIM_REQUIRED" }],
    };
    expect(
      SceneOutputSchema.safeParse({
        kind: "SELECTION",
        task_id: H,
        selection: claimant,
      }).success,
    ).toBe(false);
    const producer = {
      ...selection,
      actors: { kind: "ACTOR_PRODUCER_REQUIRED", constraints: [], ground: "g" },
    };
    expect(
      SceneOutputSchema.safeParse({
        kind: "SELECTION",
        task_id: H,
        selection: producer,
      }).success,
    ).toBe(false);
  });

  it("enforces the transport bounds at their boundary and before any decode", () => {
    expect(SETUP_MESSAGE_MAX_BYTES).toBe(65_536);
    expect(CHRONOLOGY_DOCUMENT_MAX_BYTES).toBe(65_536);
    expect(RAW_RESPONSE_MAX_BYTES).toBe(262_144);
    expect(PRODUCER_INPUT_MAX_BYTES).toBe(2_097_152);
    const shell = (n: number): string => `{"s":"${"x".repeat(n)}"}`;
    const overhead = bytes(shell(0)).length;
    const exact = bytes(shell(RAW_RESPONSE_MAX_BYTES - overhead));
    expect(exact.length).toBe(RAW_RESPONSE_MAX_BYTES);
    expect(parse(exact).ok).toBe(true);
    const over = bytes(shell(RAW_RESPONSE_MAX_BYTES - overhead + 1));
    expect(code(over)).toBe("OVERSIZE");
    // the size gate precedes UTF-8 and syntax validation: oversize garbage is an OVERSIZE refusal, not a parse attempt
    expect(code(new Uint8Array(RAW_RESPONSE_MAX_BYTES + 1).fill(0xff))).toBe("OVERSIZE");
  });

  it("bounds nesting depth instead of overflowing the stack", () => {
    const deep = "[".repeat(200) + "]".repeat(200);
    expect(code(deep)).toBe("DEPTH_EXCEEDED");
  });
});
