// Contract evidence for the GIP Authority Scope Binding Backbone Foundation (fifteenth slice): the executable Scope Binding
// contract carries the WS-007 §5 minimum exactly as authored — strict, explicit, uninterpreted — with its three optional
// fields omitted or carried, never defaulted, and every deferred surface (Governance Instrument, validity, applicability,
// promulgation, holder/body, office competence text) unrepresentable.
// Register lineage: IA-02 (partial), IA-03 (partial); RC-02; IM-06.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-007.
import { describe, expect, it } from "vitest";
import { ScopeBindingSchema, gipScopeBindingKey } from "@immortalis/contracts";
import {
  EXCEPTION_REF_A,
  PRIORITY_OR_CONFLICT_RULE_REF_A,
  INSTITUTION_COURT,
  OFFICE_MAGISTRATE,
  SCOPE_BINDING_A,
  fullScopeBinding,
  scopeBinding,
} from "@immortalis/testkit";

const minimum = (over: Record<string, unknown> = {}) => ({ ...scopeBinding(), ...over });
const full = (over: Record<string, unknown> = {}) => ({ ...fullScopeBinding(), ...over });
const ok = (v: unknown) => ScopeBindingSchema.safeParse(v).success;
const REQUIRED = [
  "institution_id",
  "office_id",
  "scope_binding_id",
  "scope_ref",
  "scope_type",
  "target_condition",
];

describe("the Scope Binding contract is the WS-007 §5 minimum, beneath one exact office (GIP Draft v2.1 §5)", () => {
  it("accepts the minimum binding and the binding carrying every optional field", () => {
    expect(ok(minimum())).toBe(true);
    expect(ok(full())).toBe(true);
  });

  it("names exactly the §5 fields, the parent office's identities and nothing else", () => {
    expect(Object.keys(ScopeBindingSchema.shape).sort()).toEqual(
      [...REQUIRED, "exception_refs", "inheritance_rule", "priority_or_conflict_rule_ref"].sort(),
    );
  });

  it("carries a binding exactly as authored: no default, normalisation, deduplication, reordering or added field", () => {
    for (const v of [minimum(), full()]) expect(ScopeBindingSchema.parse(v)).toEqual(v);
    expect(Object.keys(ScopeBindingSchema.parse(minimum())).sort()).toEqual(REQUIRED);
    // optional material stays absent when it was not authored, and is carried verbatim when it was
    const dup = full({ exception_refs: [EXCEPTION_REF_A, EXCEPTION_REF_A] });
    expect(ScopeBindingSchema.parse(dup)).toEqual(dup);
    expect(ScopeBindingSchema.parse(full({ exception_refs: [] })).exception_refs).toEqual([]);
    const reordered = full({ exception_refs: ["z-ref", "a-ref"] });
    expect(ScopeBindingSchema.parse(reordered).exception_refs).toEqual(["z-ref", "a-ref"]);
    // the priority-or-conflict rule reference is ONE reference, carried as the same single string
    expect(ScopeBindingSchema.parse(full()).priority_or_conflict_rule_ref).toBe(
      PRIORITY_OR_CONFLICT_RULE_REF_A,
    );
  });

  it("is addressed by the exact parent office and its own scope_binding_id: one key, no per-subject dimension", () => {
    expect(gipScopeBindingKey("i1", "o1", "s1")).toBe(
      "gip/institution/i1/office/o1/scope-binding/s1",
    );
    expect(gipScopeBindingKey(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A)).toBe(
      `gip/institution/${INSTITUTION_COURT}/office/${OFFICE_MAGISTRATE}/scope-binding/${SCOPE_BINDING_A}`,
    );
    // the scope reference is not an identity dimension: two bindings with different refs share no key unless their ids match
    expect(gipScopeBindingKey("i1", "o1", "s1")).toBe(gipScopeBindingKey("i1", "o1", "s1"));
  });
});

describe("every required field is explicit: missing, null, empty and malformed values fail closed", () => {
  it.each(REQUIRED)("a binding without %s is refused", (field) => {
    const v: Record<string, unknown> = minimum();
    delete v[field];
    expect(ok(v)).toBe(false);
  });

  it.each(REQUIRED)("a binding whose %s is null, empty, or not a string is refused", (field) => {
    for (const bad of [null, "", 0, true, ["x"], { a: 1 }, undefined])
      expect(ok(minimum({ [field]: bad }))).toBe(false);
  });

  it.each(["institution_id", "office_id", "scope_binding_id", "scope_ref"])(
    "%s is a canonical identifier: a key separator, whitespace or leading punctuation is refused",
    (field) => {
      for (const bad of ["a/b", " a", "a ", "a b", "-a", ".a", "a/../b"])
        expect(ok(minimum({ [field]: bad })), `${field}=${bad}`).toBe(false);
    },
  );

  it.each(["scope_type", "target_condition"])(
    "%s is authored text carried verbatim: surrounding whitespace is refused, any other text is carried uninterpreted",
    (field) => {
      expect(ok(minimum({ [field]: " padded" }))).toBe(false);
      expect(ok(minimum({ [field]: "padded " }))).toBe(false);
      for (const text of [
        "jurisdiction/place",
        "compound",
        'anything the author wrote, even {"a": 1} or IF x THEN y',
      ])
        expect(ScopeBindingSchema.parse(minimum({ [field]: text }))[field as "scope_type"]).toBe(
          text,
        );
    },
  );
});

describe("the optional fields are omitted or carried, never defaulted, null, structured or explicitly undefined", () => {
  it("accepts each optional field alone", () => {
    expect(ok(minimum({ inheritance_rule: "authored" }))).toBe(true);
    expect(ok(minimum({ exception_refs: [EXCEPTION_REF_A] }))).toBe(true);
    expect(ok(minimum({ priority_or_conflict_rule_ref: PRIORITY_OR_CONFLICT_RULE_REF_A }))).toBe(
      true,
    );
    expect(ok(minimum({ exception_refs: [] }))).toBe(true);
  });

  it("an omitted optional field is not materialised by parsing", () => {
    const parsed = ScopeBindingSchema.parse(minimum());
    for (const k of ["inheritance_rule", "exception_refs", "priority_or_conflict_rule_ref"])
      expect(Object.prototype.hasOwnProperty.call(parsed, k), k).toBe(false);
  });

  it("an optional field that is null, explicitly undefined, empty text or the wrong shape is refused", () => {
    for (const field of ["inheritance_rule", "exception_refs", "priority_or_conflict_rule_ref"]) {
      for (const bad of [null, undefined, "", 0, true, {}, { a: 1 }])
        expect(ok(minimum({ [field]: bad })), `${field}=${String(bad)}`).toBe(false);
    }
    expect(ok(minimum({ exception_refs: "a-ref" }))).toBe(false);
    expect(ok(minimum({ inheritance_rule: ["rule"] }))).toBe(false);
    expect(ok(minimum({ inheritance_rule: { rule: "x" } }))).toBe(false);
  });

  it("exception_refs entries are canonical opaque references, not text, objects or nested arrays", () => {
    for (const bad of [[""], [null], [1], [{ ref: "a" }], [["a"]], ["a/b"], ["a b"], [" a"]])
      expect(ok(minimum({ exception_refs: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("priority_or_conflict_rule_ref is exactly ONE opaque reference: an array of any length (even one), an object, a non-canonical identifier or the pre-repair array form is refused", () => {
    for (const bad of [
      [],
      [PRIORITY_OR_CONFLICT_RULE_REF_A],
      [PRIORITY_OR_CONFLICT_RULE_REF_A, "other-ref"],
      { ref: PRIORITY_OR_CONFLICT_RULE_REF_A },
      "a/b",
      "a b",
      " a",
      "-a",
    ])
      expect(ok(minimum({ priority_or_conflict_rule_ref: bad })), JSON.stringify(bad)).toBe(false);
    expect(ok(minimum({ priority_or_conflict_rule_ref: PRIORITY_OR_CONFLICT_RULE_REF_A }))).toBe(
      true,
    );
  });

  it("the pre-repair field names are not fields of the contract: exceptions and conflict_refs fail closed", () => {
    expect(ok(minimum({ exceptions: [EXCEPTION_REF_A] }))).toBe(false);
    expect(ok(minimum({ conflict_refs: [PRIORITY_OR_CONFLICT_RULE_REF_A] }))).toBe(false);
  });
});

describe("unmodelled fields fail closed: every deferred surface is unrepresentable (IA-02)", () => {
  const deferred: Record<string, unknown> = {
    unmodelled: 1,
    instrument_ref: "instrument-1",
    scope_binding_ref: "scope-binding-1",
    validity_by_order: [],
    validity_status: "valid",
    lifecycle_status: "active",
    operative_effect: "an effect",
    applicability_result: "applies",
    applies: true,
    promulgation_act_ref: "act-1",
    competence_scope: "restated office competence",
    holder_ref: "holder-1",
    decision_body_ref: "body-1",
    authority_source_ref: "source-1",
    powers: [],
    duties: [],
    members: ["a"],
    population_ref: "pop-1",
    cohort_ref: "cohort-1",
    target_ids: ["t1"],
    resolved_scope: {},
    priority: 1,
    priority_rank: 1,
    conflict_resolution: {},
    resolved_priority: "x",
    weight: 0.5,
    status: "active",
    history: [],
    properties: {},
  };
  it.each(Object.keys(deferred))("a binding carrying %s is refused", (field) => {
    expect(ok(minimum({ [field]: deferred[field] }))).toBe(false);
    expect(ok(full({ [field]: deferred[field] }))).toBe(false);
  });

  it("is strict at every level: a non-object, an array or null is not a binding", () => {
    for (const bad of [null, undefined, "x", 1, [], [minimum()]]) expect(ok(bad)).toBe(false);
  });
});
