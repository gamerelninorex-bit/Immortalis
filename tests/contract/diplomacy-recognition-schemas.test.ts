/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary values */
// Diplomacy External Recognition Core Backbone Foundation (seventeenth slice) — the strict executable contract of the WS-008 §6
// minimum recognition entry plus the v1.1 repair overlay (§29.2 continuity_basis / successor_rule_ref, §29.3 dependency_refs[]).
// Every identifier is the source's own, reproduced exactly; recognition_status and continuity_basis are NOT closed enums;
// the conditional fields stay conditional. Register lineage: IA-01, IA-02 (partial). Source lock: spec/f027/spec-lock.json: WS-008.
import { describe, expect, it } from "vitest";
import {
  EXAMPLE_CONTINUITY_BASES,
  ExternalRecognitionSchema,
  FACET_DIPLOMACY_EXTERNAL_RECOGNITION,
  LISTED_RECOGNITION_STATUSES,
  OWNER_DIPLOMACY,
  diplomacyRecognitionKey,
  recognitionDependencyKeys,
} from "@immortalis/contracts";
import {
  RECOGNITION_A,
  externalRecognition,
  fullExternalRecognition,
  officeRef,
} from "@immortalis/testkit";

/** WS-008 §6 and §29.2 / §29.3, copied verbatim from the frozen source text (independent of the contract's own constants). */
const SOURCE_REQUIRED = [
  "recognition_id",
  "recognizer_ref",
  "recognized_referent_ref",
  "recognition_scope",
  "recognition_status",
  "authority_basis_ref",
  "effective_from",
  "instrument_or_act_ref",
  "provenance_ref",
  "continuity_basis",
];
const SOURCE_OPTIONAL_OR_CONDITIONAL = [
  "withdrawal_or_supersession_condition",
  "successor_rule_ref",
  "dependency_refs",
];
const SOURCE_STATUSES = [
  "recognized",
  "explicit_nonrecognition",
  "withdrawn",
  "suspended",
  "limited_scope",
  "contested_or_unresolved",
];

const parses = (v: unknown) => ExternalRecognitionSchema.safeParse(v).success;

describe("the contract reproduces the WS-008 identifiers verbatim (IA-01)", () => {
  it("the schema's fields are exactly the source's ten required fields plus the three optional / conditional ones", () => {
    const shape = Object.keys(ExternalRecognitionSchema.shape).sort();
    expect(shape).toEqual([...SOURCE_REQUIRED, ...SOURCE_OPTIONAL_OR_CONDITIONAL].sort());
  });

  it("the owner is Diplomacy, distinct from GIP and Economy, with one External Recognition facet and a key from recognition_id alone", () => {
    expect(OWNER_DIPLOMACY).toBe("diplomacy");
    expect(FACET_DIPLOMACY_EXTERNAL_RECOGNITION).toBe("diplomacy_external_recognition");
    expect(diplomacyRecognitionKey("r1")).toBe("diplomacy/recognition/r1");
  });

  it("the listed statuses and the example continuity bases are exactly the source's, as documentation only", () => {
    expect([...LISTED_RECOGNITION_STATUSES]).toEqual(SOURCE_STATUSES);
    expect([...EXAMPLE_CONTINUITY_BASES]).toEqual(["personal", "office", "represented_entity"]);
  });
});

describe("a complete recognition is carried exactly as authored (IA-02)", () => {
  it("the minimum record (every required field, no optional or conditional field) parses and round-trips unchanged", () => {
    const v = externalRecognition();
    const out = ExternalRecognitionSchema.parse(v);
    expect(out).toEqual(v);
    expect(Object.keys(out).sort()).toEqual([...SOURCE_REQUIRED].sort());
  });

  it("the optional condition and the conditional successor_rule_ref are preserved when authored, and absent when not", () => {
    const full = fullExternalRecognition();
    expect(ExternalRecognitionSchema.parse(full)).toEqual(full);
    expect(full.withdrawal_or_supersession_condition).toBeDefined();
    expect(full.successor_rule_ref).toBeDefined();
    const bare = ExternalRecognitionSchema.parse(externalRecognition()) as any;
    expect("withdrawal_or_supersession_condition" in bare).toBe(false);
    expect("successor_rule_ref" in bare).toBe(false);
    expect("dependency_refs" in bare).toBe(false);
    // each may be present without the other
    expect(parses(externalRecognition(RECOGNITION_A, { successor_rule_ref: "rule-ref-1" }))).toBe(
      true,
    );
    expect(
      parses(externalRecognition(RECOGNITION_A, { withdrawal_or_supersession_condition: "when" })),
    ).toBe(true);
  });

  it("every required field is required: a record missing any one fails closed", () => {
    for (const f of SOURCE_REQUIRED) {
      const v: any = externalRecognition();
      delete v[f];
      expect(parses(v), f).toBe(false);
    }
  });

  it("an omitted optional field is absent, never an explicit undefined; a null is not a substitute for absence on the reference and array fields", () => {
    for (const f of SOURCE_OPTIONAL_OR_CONDITIONAL)
      expect(parses({ ...externalRecognition(), [f]: undefined }), `${f} undefined`).toBe(false);
    for (const f of ["successor_rule_ref", "dependency_refs"])
      expect(parses({ ...externalRecognition(), [f]: null }), `${f} null`).toBe(false);
  });

  it("source identifiers are never replaced by aliases or normalized names", () => {
    const aliases: Record<string, string> = {
      recognition_id: "id",
      recognizer_ref: "recognizer",
      recognized_referent_ref: "recognized_ref",
      recognition_scope: "scope",
      recognition_status: "status",
      authority_basis_ref: "authority_basis",
      effective_from: "effective",
      instrument_or_act_ref: "instrument_ref",
      provenance_ref: "provenance",
      continuity_basis: "continuity",
      withdrawal_or_supersession_condition: "withdrawal_condition",
      successor_rule_ref: "successor_rule",
      dependency_refs: "dependencies",
    };
    for (const [exact, alias] of Object.entries(aliases)) {
      const v: any = fullExternalRecognition(RECOGNITION_A, { dependency_refs: ["k"] });
      v[alias] = v[exact];
      delete v[exact];
      expect(parses(v), `${alias} for ${exact}`).toBe(false);
    }
    // pluralised / singularised variants
    expect(parses({ ...externalRecognition(), recognition_scopes: ["a"] })).toBe(false);
    expect(parses({ ...externalRecognition(), dependency_ref: "k" })).toBe(false);
    expect(parses({ ...externalRecognition(), recognizer_refs: ["a"] })).toBe(false);
  });

  it("no collateral Diplomacy construct, score, reciprocal or generic field is representable (strict)", () => {
    for (const extra of [
      "reciprocal_recognition_ref",
      "symmetric",
      "recognition_score",
      "trust",
      "reputation",
      "influence",
      "relation_id",
      "relation_edge_ref",
      "channel_ref",
      "negotiation_ref",
      "instrument_ref",
      "clause_refs",
      "binding_entry_refs",
      "framework_ref",
      "status",
      "properties",
      "objective_control",
      "recipient_awareness",
    ])
      expect(parses({ ...externalRecognition(), [extra]: "x" }), extra).toBe(false);
  });
});

describe("recognition_status is not a closed enum (IA-02)", () => {
  it("every source-listed value round-trips exactly", () => {
    for (const status of SOURCE_STATUSES) {
      const out = ExternalRecognitionSchema.parse(
        externalRecognition(RECOGNITION_A, { recognition_status: status }),
      );
      expect(out.recognition_status).toBe(status);
    }
  });

  it("a later source-defined named value is not rejected merely for being absent from the list, and no alias is normalized into a listed value", () => {
    for (const status of [
      "recognized_with_reservations",
      "Recognized",
      "RECOGNIZED",
      "non-recognition",
      "nonrecognition",
      "recognised",
      "recognized ",
    ].filter((s) => s === s.trim())) {
      const out = ExternalRecognitionSchema.parse(
        externalRecognition(RECOGNITION_A, { recognition_status: status }),
      );
      expect(out.recognition_status).toBe(status);
    }
  });

  it("recognition_status is one singular named value: empty, padded and structured values are not named values", () => {
    for (const bad of [
      "",
      " recognized",
      "recognized ",
      ["recognized"],
      { v: "recognized" },
      1,
      null,
    ])
      expect(
        parses(externalRecognition(RECOGNITION_A, { recognition_status: bad as any })),
        String(bad),
      ).toBe(false);
  });
});

describe("continuity_basis is a required named basis, not a closed enum (IA-02)", () => {
  it("the source examples and any other explicitly named basis are carried exactly", () => {
    for (const basis of [
      ...EXAMPLE_CONTINUITY_BASES,
      "dynasty",
      "treaty_successor_clause",
      "Represented Entity",
    ]) {
      expect(
        ExternalRecognitionSchema.parse(
          externalRecognition(RECOGNITION_A, { continuity_basis: basis }),
        ).continuity_basis,
      ).toBe(basis);
    }
  });

  it("it is required and singular", () => {
    for (const bad of [undefined, "", ["office"], 7, null])
      expect(parses({ ...externalRecognition(), continuity_basis: bad })).toBe(false);
    const v: any = externalRecognition();
    delete v.continuity_basis;
    expect(parses(v)).toBe(false);
  });
});

describe("references are directional, singular, opaque authored values (IA-02)", () => {
  it("recognizer_ref and recognized_referent_ref are singular and carry any authored reference: no recognizer-party or referent class is imposed, and a GIP office address is just one possibility", () => {
    for (const ref of [
      "a-polity",
      "gip/institution/i/office/o",
      officeRef(),
      "world/w/locus/l",
      "x y",
    ]) {
      const out = ExternalRecognitionSchema.parse(
        externalRecognition(RECOGNITION_A, { recognizer_ref: ref, recognized_referent_ref: ref }),
      );
      expect([out.recognizer_ref, out.recognized_referent_ref]).toEqual([ref, ref]);
    }
    for (const f of ["recognizer_ref", "recognized_referent_ref"])
      for (const bad of [["a"], [], { ref: "a" }, "", null, 1])
        expect(parses({ ...externalRecognition(), [f]: bad }), `${f} ${JSON.stringify(bad)}`).toBe(
          false,
        );
  });

  it("authority_basis_ref, instrument_or_act_ref, provenance_ref and successor_rule_ref are singular opaque references, never arrays", () => {
    for (const f of [
      "authority_basis_ref",
      "instrument_or_act_ref",
      "provenance_ref",
      "successor_rule_ref",
    ])
      for (const bad of [["a"], [], { ref: "a" }, "", null])
        expect(
          parses({ ...fullExternalRecognition(), [f]: bad }),
          `${f} ${JSON.stringify(bad)}`,
        ).toBe(false);
  });

  it("recognition_scope is required and singular: any one canonical JSON scalar or object is carried exactly as authored, no text-only subtype is imposed, and array-valued multiplicity is refused", () => {
    for (const ok of [
      "boundary west of the river",
      "  padded and  spaced  ",
      "",
      0,
      0.9,
      -3,
      true,
      false,
      null,
      {},
      { scope: "a", nested: { b: [1, 2] } },
    ])
      expect(
        ExternalRecognitionSchema.parse(
          externalRecognition(RECOGNITION_A, { recognition_scope: ok as never }),
        ).recognition_scope,
        JSON.stringify(ok),
      ).toEqual(ok);
    // a list of scopes is multiplicity, not one scope
    for (const many of [[], ["a"], ["a", "b"], [{ scope: "a" }], [["a"]], [null]])
      expect(
        parses({ ...externalRecognition(), recognition_scope: many }),
        JSON.stringify(many),
      ).toBe(false);
    // required, and only canonical JSON (finite numbers; nothing undefined or non-plain)
    for (const bad of [undefined, NaN, Infinity, () => 1, new Map(), Symbol("x"), 1n])
      expect(parses({ ...externalRecognition(), recognition_scope: bad })).toBe(false);
    const missing: any = externalRecognition();
    delete missing.recognition_scope;
    expect(parses(missing)).toBe(false);
  });

  it("recognition_id is a key-safe canonical identity; the other values are not identity dimensions", () => {
    for (const bad of ["", "a/b", " a", "a b", "-a"])
      expect(parses({ ...externalRecognition(), recognition_id: bad }), bad).toBe(false);
    expect(parses({ ...externalRecognition(), recognition_id: ["a"] })).toBe(false);
  });
});

describe("effective_from is a required authored scalar, carried exactly and never scheduled (IA-02)", () => {
  it("any canonical JSON scalar (string, finite number, boolean, null) is carried exactly, with no finer subtype imposed; arrays, objects and non-canonical values are refused", () => {
    for (const ok of [
      "2026-10-02T00:00:00Z",
      "the third winter",
      "",
      " x ",
      1204,
      0,
      -3,
      1.5,
      true,
      false,
      null,
    ])
      expect(
        ExternalRecognitionSchema.parse(
          externalRecognition(RECOGNITION_A, { effective_from: ok as never }),
        ).effective_from,
        JSON.stringify(ok),
      ).toBe(ok);
    for (const bad of [
      [],
      ["a"],
      { at: "a" },
      {},
      NaN,
      Infinity,
      undefined,
      new Map(),
      () => 1,
      1n,
    ])
      expect(parses({ ...externalRecognition(), effective_from: bad }), String(bad)).toBe(false);
    const missing: any = externalRecognition();
    delete missing.effective_from;
    expect(parses(missing)).toBe(false);
  });
});

describe("withdrawal_or_supersession_condition is optional and carried exactly as authored, never evaluated", () => {
  it("absent stays absent; when present its source-undefined subtype is not narrowed and any canonical JSON value is preserved verbatim", () => {
    const text = "SYNTHETIC: withdrawn if the referent dissolves; superseded by a later act.";
    for (const ok of [text, "", " x ", 5, 0, false, null, ["a"], [], { c: "a" }])
      expect(
        ExternalRecognitionSchema.parse(
          externalRecognition(RECOGNITION_A, { withdrawal_or_supersession_condition: ok as never }),
        ).withdrawal_or_supersession_condition,
        JSON.stringify(ok),
      ).toEqual(ok);
    expect(
      "withdrawal_or_supersession_condition" in
        ExternalRecognitionSchema.parse(externalRecognition()),
    ).toBe(false);
    for (const bad of [undefined, NaN, Infinity, new Map(), () => 1])
      expect(parses({ ...externalRecognition(), withdrawal_or_supersession_condition: bad })).toBe(
        false,
      );
  });
});

describe("dependency_refs[] is conditional and carried exactly as authored (IA-02)", () => {
  it("absent for a purely authored baseline; when present, an array of fact keys with no invented minimum, uniqueness or deduplication", () => {
    expect(parses(externalRecognition())).toBe(true);
    for (const refs of [[], ["k1"], ["k1", "k2"], ["k1", "k1"], ["k2", "k1", "k2"]]) {
      const out = ExternalRecognitionSchema.parse(
        externalRecognition(RECOGNITION_A, { dependency_refs: refs }),
      );
      expect(out.dependency_refs).toEqual(refs);
    }
  });

  it("a single reference, a nested structure or a non-key element is not an array of references", () => {
    for (const bad of ["k1", { k: "k1" }, [["k1"]], [1], [""], [null]])
      expect(parses({ ...externalRecognition(), dependency_refs: bad }), JSON.stringify(bad)).toBe(
        false,
      );
  });

  it("the facts admission must see pinned are the distinct keys, while the authored array is untouched", () => {
    const r = ExternalRecognitionSchema.parse(
      externalRecognition(RECOGNITION_A, { dependency_refs: ["k2", "k1", "k2"] }),
    );
    expect(recognitionDependencyKeys(r)).toEqual(["k2", "k1"]);
    expect(r.dependency_refs).toEqual(["k2", "k1", "k2"]);
    expect(
      recognitionDependencyKeys(ExternalRecognitionSchema.parse(externalRecognition())),
    ).toEqual([]);
  });
});
