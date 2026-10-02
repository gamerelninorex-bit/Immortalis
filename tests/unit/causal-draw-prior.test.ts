// CDS-01 / CDS-02 / CDR-01 steps 1–2: the deterministic, side-effect-free front half of the Causal Draw gate —
// structural validation with its exact refusal precedence, prior normalization, and the three identities. Known-answer
// digests come from an INDEPENDENT reference implementation written from the addendum text.
// Register lineage: IA-02, IA-30 (partial); F-027-CD1 CDK-01, CDK-02, CDS-01, CDS-02, CDR-01.
import { describe, expect, it } from "vitest";
import type { CausalDrawSpecification } from "@immortalis/contracts";
import {
  cdCanon,
  normalizeSpecification,
  normalizedSpecViolation,
  preparePrior,
  validateSpecification,
} from "@immortalis/engine";

const rule = {
  artifact: "test://kat-rule",
  native_pin: "kat-pin",
  clause: "kat-clause",
  authority_lineage: ["kat-lineage"],
  effective_basis: "kat-basis",
  supersedes: null,
};
const katSpec = (over: Partial<CausalDrawSpecification> = {}): CausalDrawSpecification => ({
  draw_key: {
    causal_process_id: "kat-process",
    opportunity_id: "kat-opportunity-é",
    owner_operation: { owner: "kat-owner", operation: "kat-operation" },
    prospective_result_id: "kat/slot/1",
  },
  owner_rule_ref: rule,
  input_refs: [
    { owner: "kat-owner", fact_key: "kat/input/b", version: 2, committed_by: "kat-group-b" },
    { owner: "kat-owner", fact_key: "kat/input/a", version: 1, committed_by: "kat-group-a" },
  ],
  candidates: [
    { candidate_id: "zeta", weight: "6" },
    { candidate_id: "alpha", weight: "2" },
    { candidate_id: "mid", weight: "4" },
  ],
  algorithm_id: "IMMORTALIS_WEIGHTED_FINITE_V1",
  ...over,
});
const code = (input: unknown) => {
  const r = validateSpecification(input);
  return r.ok ? "OK" : r.error.code;
};
const two = (a: string, b: string) => [
  { candidate_id: "x", weight: a },
  { candidate_id: "y", weight: b },
];

describe("identities: draw_key_digest, draw_id and spec_digest (independent known answers)", () => {
  const prior = preparePrior(katSpec());

  it("the normalized specification, its CD-CANON-1 bytes and both digests equal the reference", () => {
    expect(cdCanon(prior.normalized)).toBe(
      '{"algorithm_id":"IMMORTALIS_WEIGHTED_FINITE_V1","candidates":[{"candidate_id":"alpha","weight":"1"},{"candidate_id":"mid","weight":"2"},{"candidate_id":"zeta","weight":"3"}],"draw_key":{"causal_process_id":"kat-process","opportunity_id":"kat-opportunity-é","owner_operation":{"operation":"kat-operation","owner":"kat-owner"},"prospective_result_id":"kat/slot/1"},"input_refs":[{"committed_by":"kat-group-a","fact_key":"kat/input/a","owner":"kat-owner","version":1},{"committed_by":"kat-group-b","fact_key":"kat/input/b","owner":"kat-owner","version":2}],"owner_rule_ref":{"artifact":"test://kat-rule","authority_lineage":["kat-lineage"],"clause":"kat-clause","effective_basis":"kat-basis","native_pin":"kat-pin","supersedes":null}}',
    );
    expect(prior.draw_key_digest).toBe(
      "33c23f6eb7e19aba0e681bd9bb4a9470f26e44d1782f9716b25c30def5b00ebf",
    );
    expect(prior.spec_digest).toBe(
      "2418d1c035ab8549b6f262099d120589fc6da4384701520cacbf8ab134ad9da8",
    );
    expect(prior.draw_id).toBe(
      "cdraw:v1:33c23f6eb7e19aba0e681bd9bb4a9470f26e44d1782f9716b25c30def5b00ebf",
    );
  });

  it("the draw identity is the four CDK-01 dimensions and nothing else: each one changes it, the weights and rule do not", () => {
    const base = prior.draw_key_digest;
    const key = katSpec().draw_key;
    const variants: CausalDrawSpecification["draw_key"][] = [
      { ...key, causal_process_id: "other" },
      { ...key, opportunity_id: "other" },
      { ...key, owner_operation: { ...key.owner_operation, owner: "other" } },
      { ...key, owner_operation: { ...key.owner_operation, operation: "other" } },
      { ...key, prospective_result_id: "other" },
    ];
    for (const draw_key of variants) {
      expect(preparePrior(katSpec({ draw_key })).draw_key_digest).not.toBe(base);
    }
    expect(preparePrior(katSpec({ candidates: two("1", "9") })).draw_key_digest).toBe(base);
    expect(
      preparePrior(katSpec({ owner_rule_ref: { ...rule, clause: "c2" } })).draw_key_digest,
    ).toBe(base);
  });

  it("a different prior under the same draw key is the same draw_id with a DIFFERENT spec_digest (an identity conflict, not a new draw)", () => {
    const other = preparePrior(katSpec({ candidates: two("1", "9") }));
    expect(other.draw_id).toBe(prior.draw_id);
    expect(other.spec_digest).not.toBe(prior.spec_digest);
    const otherRule = preparePrior(katSpec({ owner_rule_ref: { ...rule, clause: "c2" } }));
    expect(otherRule.spec_digest).not.toBe(prior.spec_digest);
  });
});

describe("CDS-02 prior normalization", () => {
  it("{A:1,B:2} and {B:4,A:2} are the same normalized prior with the same spec_digest; caller order and common scaling cannot alter it", () => {
    const p1 = preparePrior(
      katSpec({
        candidates: [
          { candidate_id: "A", weight: "1" },
          { candidate_id: "B", weight: "2" },
        ],
      }),
    );
    const p2 = preparePrior(
      katSpec({
        candidates: [
          { candidate_id: "B", weight: "4" },
          { candidate_id: "A", weight: "2" },
        ],
      }),
    );
    expect(p2.spec_digest).toBe(p1.spec_digest);
    expect(p2.normalized.candidates).toEqual([
      { candidate_id: "A", weight: "1" },
      { candidate_id: "B", weight: "2" },
    ]);
  });

  it("divides by the greatest common divisor of ALL weights, with arbitrary-precision integers", () => {
    const big = 10n ** 40n;
    const n = normalizeSpecification(
      katSpec({
        candidates: [
          { candidate_id: "a", weight: (3n * big).toString() },
          { candidate_id: "b", weight: (5n * big).toString() },
          { candidate_id: "c", weight: (7n * big).toString() },
        ],
      }),
    );
    expect(n.candidates.map((c) => c.weight)).toEqual(["3", "5", "7"]);
    // weights with gcd 1 are untouched, even when huge
    const huge = "123456789012345678901234567890123456789";
    expect(
      normalizeSpecification(
        katSpec({
          candidates: [
            { candidate_id: "a", weight: huge },
            { candidate_id: "b", weight: "1" },
          ],
        }),
      ).candidates[0]!.weight,
    ).toBe(huge);
    // a gcd shared by only SOME weights is not a common divisor
    expect(
      normalizeSpecification(
        katSpec({ candidates: [...two("4", "6"), { candidate_id: "z", weight: "9" }] }),
      ).candidates.map((c) => c.weight),
    ).toEqual(["4", "6", "9"]);
  });

  it("sorts candidates by exact candidate_id in UTF-16 CODE-UNIT order (a supplementary character sorts before U+FF5E; code-point order would not)", () => {
    const emoji = "\u{1F600}"; // D83D DE00
    const fullwidth = "～"; // FF5E
    const n = normalizeSpecification(
      katSpec({
        candidates: [
          { candidate_id: fullwidth, weight: "1" },
          { candidate_id: emoji, weight: "1" },
          { candidate_id: "Z", weight: "1" },
          { candidate_id: "a", weight: "1" },
        ],
      }),
    );
    expect(n.candidates.map((c) => c.candidate_id)).toEqual(["Z", "a", emoji, fullwidth]);
  });

  it("sorts input_refs by UTF-16 code-unit order of their complete CD-CANON-1 encoded strings, not by field or locale", () => {
    const refs = [
      { owner: "o", fact_key: "k/b", version: 1, committed_by: "g" },
      { owner: "o", fact_key: "k/a", version: 10, committed_by: "g" },
      { owner: "o", fact_key: "k/a", version: 2, committed_by: "g" },
      { owner: "a", fact_key: "k/z", version: 1, committed_by: "g" },
    ];
    const n = normalizeSpecification(katSpec({ input_refs: refs }));
    const encoded = n.input_refs.map((r) => cdCanon(r));
    expect(encoded).toEqual([...encoded].sort());
    // version is a NUMBER in the encoding, so 10 sorts before 2 as text: "…,\"version\":10}" < "…,\"version\":2}"
    expect(n.input_refs.map((r) => r.version)).toEqual([10, 2, 1, 1]);
  });

  it("input_refs order cannot alter identity", () => {
    const a = preparePrior(katSpec());
    const reversed = katSpec();
    const b = preparePrior({ ...reversed, input_refs: [...reversed.input_refs].reverse() });
    expect(b.spec_digest).toBe(a.spec_digest);
  });

  it("normalization is idempotent and a persisted normalized_spec must already be in normal form", () => {
    const n = preparePrior(katSpec()).normalized;
    expect(normalizeSpecification(n)).toEqual(n);
    expect(normalizedSpecViolation(n)).toBeNull();
    expect(normalizedSpecViolation(katSpec())).toMatch(/normal form/);
    expect(normalizedSpecViolation({ ...n, candidates: [n.candidates[0]] })).toMatch(
      /DRAW_NOT_REQUIRED_SINGLETON/,
    );
  });
});

describe("CDR-01 step 1 — structural validation and the exact refusal precedence", () => {
  it("accepts a lawful specification", () => {
    expect(code(katSpec())).toBe("OK");
    expect(code(katSpec({ input_refs: [] }))).toBe("OK");
  });

  it("a lone surrogate anywhere is DRAW_INPUT_INVALID: in a candidate id, the key, the SourceRef, an input ref, and an object key", () => {
    const lone = "a\ud800b";
    const base = katSpec();
    expect(
      code(katSpec({ candidates: [...two("1", "2"), { candidate_id: lone, weight: "1" }] })),
    ).toBe("DRAW_INPUT_INVALID");
    expect(code({ ...base, draw_key: { ...base.draw_key, causal_process_id: lone } })).toBe(
      "DRAW_INPUT_INVALID",
    );
    expect(code({ ...base, owner_rule_ref: { ...rule, clause: lone } })).toBe("DRAW_INPUT_INVALID");
    expect(code({ ...base, owner_rule_ref: { ...rule, authority_lineage: [lone] } })).toBe(
      "DRAW_INPUT_INVALID",
    );
    expect(
      code(
        katSpec({ input_refs: [{ owner: "o", fact_key: lone, version: 1, committed_by: "g" }] }),
      ),
    ).toBe("DRAW_INPUT_INVALID");
    expect(code({ ...base, [lone]: 1 })).toBe("DRAW_INPUT_INVALID");
  });

  it("malformed material is DRAW_INPUT_INVALID: not an object, missing fields, extra fields, wrong algorithm, bad ids", () => {
    const base = katSpec();
    for (const bad of [
      null,
      undefined,
      "spec",
      [],
      {},
      { ...base, algorithm_id: "SOMETHING_ELSE" },
      { ...base, algorithm_id: undefined },
      { ...base, extra: 1 },
      { ...base, candidates: "none" },
      { ...base, input_refs: null },
      { ...base, owner_rule_ref: { ...rule, supersedes: undefined } },
      { ...base, owner_rule_ref: { ...rule, authority_lineage: [] } },
      { ...base, draw_key: { ...base.draw_key, causal_process_id: "" } },
      { ...base, draw_key: { ...base.draw_key, opportunity_id: " padded " } },
      { ...base, draw_key: { ...base.draw_key, prospective_result_id: "a\nb" } },
      { ...base, draw_key: { ...base.draw_key, owner_operation: { owner: "o" } } },
      katSpec({ candidates: [{ candidate_id: "", weight: "1" }, ...two("1", "1")] }),
    ]) {
      expect(code(bad), JSON.stringify(bad)).toBe("DRAW_INPUT_INVALID");
    }
  });

  it("every forbidden identity dimension is unrepresentable in the draw key (strict): request, retry, message, checkpoint, partition, horizon, source version, model, provider, narration, UI, recency", () => {
    const base = katSpec();
    for (const dim of [
      "request_id",
      "retry_count",
      "message_count",
      "checkpoint",
      "partition",
      "horizon",
      "requested_horizon",
      "source_version",
      "model",
      "provider",
      "narration_branch",
      "ui_refresh",
      "page_recency",
    ]) {
      expect(code({ ...base, draw_key: { ...base.draw_key, [dim]: "x" } }), dim).toBe(
        "DRAW_INPUT_INVALID",
      );
    }
  });

  it("the weight grammar is ^[1-9][0-9]*$: zero, signs, decimals, exponents, spacing, leading zeros, NaN/infinity, and any non-string are invalid", () => {
    for (const w of [
      "0",
      "-1",
      "+1",
      "1.5",
      "1.0",
      "1e3",
      "1E3",
      "01",
      " 1",
      "1 ",
      "",
      "NaN",
      "Infinity",
      "0x10",
      "٣",
    ]) {
      expect(code(katSpec({ candidates: two("1", w) })), JSON.stringify(w)).toBe(
        "DRAW_INPUT_INVALID",
      );
    }
    for (const w of [1, 1.5, 0, null, true, 10n, {}, []]) {
      expect(code(katSpec({ candidates: two("1", w as never) }))).toBe("DRAW_INPUT_INVALID");
    }
    expect(code(katSpec({ candidates: two("1", "123456789012345678901234567890") }))).toBe("OK");
  });

  it("an input ref's version is a JSON integer in 1..9007199254740991 and is a number, not a string", () => {
    const ref = (version: unknown) => ({
      owner: "o",
      fact_key: "k",
      version: version as number,
      committed_by: "g",
    });
    for (const v of [0, -1, 1.5, 9007199254740992, Number.MAX_VALUE, "1", null, Number.NaN]) {
      expect(code(katSpec({ input_refs: [ref(v)] })), String(v)).toBe("DRAW_INPUT_INVALID");
    }
    for (const v of [1, 2, 9007199254740991]) {
      expect(code(katSpec({ input_refs: [ref(v)] })), String(v)).toBe("OK");
    }
  });

  it("an exactly duplicated input ref is DRAW_INPUT_INVALID; two refs that differ in any field are not duplicates", () => {
    const r = { owner: "o", fact_key: "k", version: 1, committed_by: "g" };
    expect(code(katSpec({ input_refs: [r, { ...r }] }))).toBe("DRAW_INPUT_INVALID");
    expect(code(katSpec({ input_refs: [r, { ...r, version: 2 }] }))).toBe("OK");
    expect(code(katSpec({ input_refs: [r, { ...r, committed_by: "g2" }] }))).toBe("OK");
  });

  it("duplicate candidate ids are DRAW_CANDIDATE_DUPLICATE, even when the weights differ and even for a two-entry set of one id", () => {
    expect(
      code(katSpec({ candidates: [...two("1", "2"), { candidate_id: "x", weight: "5" }] })),
    ).toBe("DRAW_CANDIDATE_DUPLICATE");
    expect(
      code(
        katSpec({
          candidates: [
            { candidate_id: "x", weight: "1" },
            { candidate_id: "x", weight: "1" },
          ],
        }),
      ),
    ).toBe("DRAW_CANDIDATE_DUPLICATE");
  });

  it("an empty candidate set is DRAW_CANDIDATE_SET_EMPTY and a singleton is DRAW_NOT_REQUIRED_SINGLETON (a one-candidate set is already determined)", () => {
    expect(code(katSpec({ candidates: [] }))).toBe("DRAW_CANDIDATE_SET_EMPTY");
    expect(code(katSpec({ candidates: [{ candidate_id: "only", weight: "7" }] }))).toBe(
      "DRAW_NOT_REQUIRED_SINGLETON",
    );
  });

  it("the precedence is exact: malformed material first, then duplicates, then empty, then singleton", () => {
    // malformed beats an empty set
    expect(code({ ...katSpec({ candidates: [] }), algorithm_id: "x" })).toBe("DRAW_INPUT_INVALID");
    // a bad weight beats duplicates
    expect(
      code(
        katSpec({
          candidates: [
            { candidate_id: "x", weight: "0" },
            { candidate_id: "x", weight: "1" },
          ],
        }),
      ),
    ).toBe("DRAW_INPUT_INVALID");
    // a malformed key beats a singleton
    expect(
      code({
        ...katSpec({ candidates: [{ candidate_id: "only", weight: "1" }] }),
        draw_key: { causal_process_id: "p" },
      }),
    ).toBe("DRAW_INPUT_INVALID");
  });

  it("validation is pure: it never throws on hostile input and does not mutate it", () => {
    const hostile = katSpec();
    const before = JSON.stringify(hostile);
    validateSpecification(hostile);
    preparePrior(hostile);
    expect(JSON.stringify(hostile)).toBe(before);
    for (const v of [Symbol("x"), () => 1, 10n, new Date(0), { toJSON: 1 }]) {
      expect(() => validateSpecification(v)).not.toThrow();
    }
  });
});
