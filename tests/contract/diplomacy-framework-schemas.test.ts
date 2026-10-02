/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary values */
// Diplomacy Framework Authoritative Core Backbone Foundation (twenty-second slice) — the strict executable contract of the
// WS-008 §16 Diplomatic Framework minimum surface. Every identifier is the source's own, reproduced exactly; the three required
// arrays have no invented cardinality, uniqueness, ordering or deduplication; the singular fields stay singular with no invented
// closed set; collective_decision_rule_ref is conditional and never defaulted; no Relation Edge index, dependency or sibling
// Diplomacy field is representable.
// Register lineage: IA-01, IA-02 (partial). Source lock: spec/f027/spec-lock.json: WS-008.
import { describe, expect, it } from "vitest";
import {
  DiplomaticFrameworkSchema,
  FACET_DIPLOMACY_FRAMEWORK,
  OWNER_DIPLOMACY,
  diplomacyFrameworkKey,
} from "@immortalis/contracts";
import { FRAMEWORK_A, diplomaticFramework, fullDiplomaticFramework } from "@immortalis/testkit";

/** WS-008 §16, copied verbatim from the frozen source text (independent of the contract's own constants). */
const SOURCE_REQUIRED = [
  "framework_id",
  "framework_basis",
  "member_refs",
  "charter_or_instrument_refs",
  "membership_rules",
  "entry_exit_rules",
  "shared_commitment_refs",
  "lifecycle_status",
  "provenance_ref",
];
/** The one conditional field: "collective_decision_rule_ref where external framework action requires one". */
const SOURCE_CONDITIONAL = ["collective_decision_rule_ref"];
const ARRAY_FIELDS = ["member_refs", "charter_or_instrument_refs", "shared_commitment_refs"];
const SINGULAR_FIELDS = [
  "framework_basis",
  "membership_rules",
  "entry_exit_rules",
  "lifecycle_status",
];

const parses = (v: unknown) => DiplomaticFrameworkSchema.safeParse(v).success;
const fw = (over: Record<string, unknown> = {}) => diplomaticFramework(FRAMEWORK_A, over as never);

describe("the contract reproduces the WS-008 §16 identifiers verbatim (IA-01)", () => {
  it("the schema's fields are exactly the source's nine required and one conditional field", () => {
    expect(Object.keys(DiplomaticFrameworkSchema.shape).sort()).toEqual(
      [...SOURCE_REQUIRED, ...SOURCE_CONDITIONAL].sort(),
    );
  });

  it("the owner is the existing Diplomacy owner, with one Framework facet and a key from framework_id alone", () => {
    expect(OWNER_DIPLOMACY).toBe("diplomacy");
    expect(FACET_DIPLOMACY_FRAMEWORK).toBe("diplomacy_framework");
    expect(diplomacyFrameworkKey("f1")).toBe("diplomacy/framework/f1");
  });
});

describe("a complete Framework is carried exactly as authored (IA-02)", () => {
  it("the record without the conditional field parses and round-trips unchanged", () => {
    const v = diplomaticFramework();
    const parsed = DiplomaticFrameworkSchema.parse(v);
    expect(parsed).toEqual(v);
    expect(Object.keys(parsed).sort()).toEqual([...SOURCE_REQUIRED].sort());
  });

  it("collective_decision_rule_ref round-trips both present and absent, without default synthesis", () => {
    const full = fullDiplomaticFramework();
    expect(DiplomaticFrameworkSchema.parse(full)).toEqual(full);
    const v: any = fullDiplomaticFramework();
    delete v.collective_decision_rule_ref;
    const parsed: any = DiplomaticFrameworkSchema.parse(v);
    expect("collective_decision_rule_ref" in parsed).toBe(false);
    expect(parsed).toEqual(v);
    const bare: any = DiplomaticFrameworkSchema.parse(diplomaticFramework());
    expect("collective_decision_rule_ref" in bare).toBe(false);
  });

  it("every required field is required: a record missing any one fails closed", () => {
    for (const f of SOURCE_REQUIRED) {
      const v: any = diplomaticFramework();
      delete v[f];
      expect(parses(v), f).toBe(false);
    }
  });

  it("an omitted conditional field is absent, never an explicit undefined, null, array or empty reference", () => {
    expect(parses(fw({ collective_decision_rule_ref: undefined }))).toBe(false);
    for (const bad of [null, ["a"], 1, true, { a: 1 }, ""])
      expect(parses(fw({ collective_decision_rule_ref: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("source identifiers are never replaced by aliases or normalized names", () => {
    for (const [source, alias] of [
      ["framework_id", "id"],
      ["framework_id", "framework_ref"],
      ["framework_basis", "basis"],
      ["framework_basis", "framework_bases"],
      ["member_refs", "members"],
      ["member_refs", "member_ref"],
      ["member_refs", "parties"],
      ["charter_or_instrument_refs", "charter_refs"],
      ["charter_or_instrument_refs", "instrument_refs"],
      ["charter_or_instrument_refs", "charter_or_instrument_ref"],
      ["membership_rules", "membership_rule"],
      ["membership_rules", "membership"],
      ["entry_exit_rules", "entry_rules"],
      ["entry_exit_rules", "entry_exit_rule"],
      ["collective_decision_rule_ref", "decision_rule_ref"],
      ["collective_decision_rule_ref", "collective_decision_rule"],
      ["collective_decision_rule_ref", "collective_decision_rule_refs"],
      ["shared_commitment_refs", "commitment_refs"],
      ["shared_commitment_refs", "shared_commitments"],
      ["lifecycle_status", "status"],
      ["lifecycle_status", "lifecycle"],
      ["provenance_ref", "provenance"],
      ["provenance_ref", "provenance_refs"],
    ] as const) {
      const v: any = fullDiplomaticFramework();
      v[alias] = v[source];
      delete v[source];
      expect(parses(v), `${source} -> ${alias}`).toBe(false);
    }
  });
});

describe("no Relation Edge index, dependency or sibling Diplomacy field is representable (IA-02, WS-008 §29.3 / §29.7)", () => {
  it("framework_refs and the other derived Relation Edge index arrays are refused, empty or populated", () => {
    for (const f of [
      "framework_refs",
      "channel_refs",
      "recognition_refs",
      "active_claim_dispute_refs",
      "instrument_refs",
    ]) {
      expect(parses(fw({ [f]: [] })), `${f} empty`).toBe(false);
      expect(parses(fw({ [f]: ["x"] })), `${f} populated`).toBe(false);
    }
  });

  it("dependency_refs[] is not part of this authored core: it is refused, empty or populated", () => {
    expect(parses(fw({ dependency_refs: [] }))).toBe(false);
    expect(parses(fw({ dependency_refs: ["x"] }))).toBe(false);
  });

  it("no Channel, Negotiation, Instrument, Clause, Binding Entry, Recognition, Claim / Dispute, Relation, decision, vote or generic field is representable (strict)", () => {
    for (const f of [
      "relation_id",
      "relation_refs",
      "recognition_ref",
      "dispute_refs",
      "claim_refs",
      "channel_ref",
      "negotiation_ref",
      "negotiation_refs",
      "instrument_id",
      "clause_refs",
      "binding_entry_refs",
      "callable_right_refs",
      "compliance",
      "performance",
      "effect_on",
      "decision",
      "vote",
      "tally",
      "quorum",
      "member_positions",
      "suspended_members",
      "institution_ref",
      "gip_institution_ref",
      "collective_ref",
      "acs_ref",
      "trust",
      "reputation",
      "influence",
      "framework_score",
      "properties",
      "metadata",
      "extra",
    ])
      expect(parses(fw({ [f]: 1 })), f).toBe(false);
  });
});

describe("the required arrays keep their array shape; no cardinality, uniqueness, ordering or reciprocal-copy rule is invented (IA-02)", () => {
  it("empty, single, repeated and unsorted arrays are carried exactly, in authored order, in each of the three arrays", () => {
    for (const f of ARRAY_FIELDS)
      for (const refs of [[], ["a"], ["a", "a"], ["b", "a", "c"], ["a", "b", "a"]]) {
        const parsed: any = DiplomaticFrameworkSchema.parse(fw({ [f]: refs }));
        expect(parsed[f], f).toEqual(refs);
      }
  });

  it("an array is not a singular reference, and holds only references", () => {
    for (const f of ARRAY_FIELDS)
      for (const bad of ["a", null, 1, { a: 1 }, [1], [null], [["a"]], [{ a: 1 }], [""]])
        expect(parses(fw({ [f]: bad })), `${f} ${JSON.stringify(bad)}`).toBe(false);
  });

  it("no referent class is fixed: any authored reference is carried, and nothing is classified or dereferenced", () => {
    const refs = [
      "faction-1",
      "gip/institution/inst-1",
      "population/cohort/c1",
      "diplomacy/relation/r1",
      "culture:x.y",
      "anything at all",
    ];
    for (const f of ARRAY_FIELDS)
      expect((DiplomaticFrameworkSchema.parse(fw({ [f]: refs })) as any)[f]).toEqual(refs);
  });

  it("a member is not copied or reconciled across arrays: the same reference may stand in every array, and no array mirrors another", () => {
    const v = fw({
      member_refs: ["x", "y"],
      charter_or_instrument_refs: ["x"],
      shared_commitment_refs: [],
    });
    expect(DiplomaticFrameworkSchema.parse(v)).toEqual(v);
  });
});

describe("singular fields stay singular, with no invented closed set (IA-02)", () => {
  it("framework_basis, membership_rules, entry_exit_rules and lifecycle_status carry any one authored canonical JSON scalar or object exactly", () => {
    for (const f of SINGULAR_FIELDS) {
      for (const value of [
        "open named value",
        "ACTIVE",
        "active",
        "",
        0,
        3.5,
        true,
        false,
        null,
        { phase: "x", n: [1, { y: null }] },
        {},
      ]) {
        const parsed: any = DiplomaticFrameworkSchema.parse(fw({ [f]: value }));
        expect(parsed[f], `${f} ${JSON.stringify(value)}`).toEqual(value);
      }
    }
  });

  it("an array, a non-finite number, a non-JSON value and an explicit undefined are refused for each singular field", () => {
    for (const f of SINGULAR_FIELDS) {
      for (const bad of [[], ["a"], [{ a: 1 }], Number.NaN, Infinity, new Map(), () => 1])
        expect(parses(fw({ [f]: bad })), `${f} ${String(bad)}`).toBe(false);
      expect(parses(fw({ [f]: undefined })), `${f} undefined`).toBe(false);
    }
  });

  it("no lifecycle_status literal set is imposed: case variants and unlisted values are distinct authored values", () => {
    for (const v of [
      "Active",
      "ACTIVE",
      "active",
      "dissolved",
      "SUSPENDED",
      "forming",
      "x",
      1,
      null,
    ]) {
      expect(DiplomaticFrameworkSchema.parse(fw({ lifecycle_status: v })).lifecycle_status).toEqual(
        v,
      );
    }
  });

  it("no framework_basis vocabulary is imposed: any one authored value is carried, and an array is refused", () => {
    for (const v of ["charter", "treaty", "compact", "alliance", "x", 7, { kind: "open" }])
      expect(DiplomaticFrameworkSchema.parse(fw({ framework_basis: v })).framework_basis).toEqual(
        v,
      );
    expect(parses(fw({ framework_basis: ["charter", "treaty"] }))).toBe(false);
  });

  it("provenance_ref is a required singular opaque reference, distinct from the engine's own rule provenance", () => {
    for (const bad of [["a"], 1, true, { a: 1 }, "", null])
      expect(parses(fw({ provenance_ref: bad })), JSON.stringify(bad)).toBe(false);
    // rule / spec provenance is metadata of the commit, never a field of the Framework
    for (const f of ["rule", "governing_rule", "native_pin", "spec_provenance"])
      expect(parses(fw({ [f]: "x" })), f).toBe(false);
  });
});

describe("framework_id is the only identity dimension (IA-02)", () => {
  it("framework_id is a key-safe canonical identity; empty and key-unsafe values are refused", () => {
    for (const id of ["f1", "framework-a-1", "A.b:c_d-9", "1"])
      expect(parses(diplomaticFramework(id)), id).toBe(true);
    for (const bad of ["", "a/b", "a b", " a", "-a", "a\n", "../a", "a?b"])
      expect(parses(diplomaticFramework(bad)), JSON.stringify(bad)).toBe(false);
    expect(parses(fw({ framework_id: ["f1"] }))).toBe(false);
    expect(parses(fw({ framework_id: 1 }))).toBe(false);
  });

  it("the key derives from framework_id alone: members, charter, rules, commitments, lifecycle and provenance are not identity dimensions", () => {
    const a = diplomaticFramework("same", { member_refs: ["x"], lifecycle_status: "s1" });
    const b = diplomaticFramework("same", {
      member_refs: ["y", "z"],
      charter_or_instrument_refs: [],
      lifecycle_status: { s: 2 },
      provenance_ref: "other",
    });
    expect(diplomacyFrameworkKey(a.framework_id)).toBe(diplomacyFrameworkKey(b.framework_id));
    expect(diplomacyFrameworkKey("same")).toBe("diplomacy/framework/same");
  });
});
