/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary values */
// Diplomacy Relation Edge Authoritative Core Backbone Foundation (nineteenth slice) — the strict executable contract of the
// WS-008 §5.1 authoritative Relation Edge core. Every identifier is the source's own, reproduced exactly; the five reference /
// index arrays (§29.7: derived, non-authoritative) are NOT writable fields; party_refs[] has no invented cardinality, uniqueness
// or ordering; relation_scope, rupture_or_suspension_status and lifecycle_status are singular with no invented closed set.
// Register lineage: IA-01, IA-02 (partial). Source lock: spec/f027/spec-lock.json: WS-008.
import { describe, expect, it } from "vitest";
import {
  FACET_DIPLOMACY_RELATION_EDGE,
  OWNER_DIPLOMACY,
  RelationEdgeSchema,
  diplomacyRelationKey,
} from "@immortalis/contracts";
import { RELATION_A, fullRelationEdge, relationEdge } from "@immortalis/testkit";

/** WS-008 §5.1, copied verbatim from the frozen source text (independent of the contract's own constants). */
const SOURCE_REQUIRED = ["relation_id", "party_refs", "relation_scope", "lifecycle_status"];
const SOURCE_OPTIONAL = ["rupture_or_suspension_status", "provenance_ref"];
/** WS-008 §5.1 fields that §29.7 classifies as derived, non-authoritative indexes: never writable persistent state here. */
const DERIVED_INDEX_FIELDS = [
  "channel_refs",
  "recognition_refs",
  "active_claim_dispute_refs",
  "instrument_refs",
  "framework_refs",
];

const parses = (v: unknown) => RelationEdgeSchema.safeParse(v).success;
const edge = (over: Record<string, unknown> = {}) => relationEdge(RELATION_A, over as never);

describe("the contract reproduces the WS-008 identifiers verbatim (IA-01)", () => {
  it("the schema's fields are exactly the source's four required and two optional authored fields, and no derived index", () => {
    expect(Object.keys(RelationEdgeSchema.shape).sort()).toEqual(
      [...SOURCE_REQUIRED, ...SOURCE_OPTIONAL].sort(),
    );
    for (const f of DERIVED_INDEX_FIELDS)
      expect(Object.keys(RelationEdgeSchema.shape), f).not.toContain(f);
  });

  it("the owner is the existing Diplomacy owner, with one Relation Edge facet and a key from relation_id alone", () => {
    expect(OWNER_DIPLOMACY).toBe("diplomacy");
    expect(FACET_DIPLOMACY_RELATION_EDGE).toBe("diplomacy_relation_edge");
    expect(diplomacyRelationKey("r1")).toBe("diplomacy/relation/r1");
  });
});

describe("a complete edge is carried exactly as authored (IA-02)", () => {
  it("the minimum record (every required field, no optional field) parses and round-trips unchanged", () => {
    const v = relationEdge();
    const parsed = RelationEdgeSchema.parse(v);
    expect(parsed).toEqual(v);
    expect(Object.keys(parsed).sort()).toEqual([...SOURCE_REQUIRED].sort());
  });

  it("each optional field round-trips both present and absent, without default synthesis", () => {
    const full = fullRelationEdge();
    expect(RelationEdgeSchema.parse(full)).toEqual(full);
    for (const f of SOURCE_OPTIONAL) {
      const v: any = fullRelationEdge();
      delete v[f];
      const parsed: any = RelationEdgeSchema.parse(v);
      expect(f in parsed, f).toBe(false);
      expect(parsed).toEqual(v);
    }
    const bare: any = RelationEdgeSchema.parse(relationEdge());
    for (const f of SOURCE_OPTIONAL) expect(f in bare, f).toBe(false);
  });

  it("every required field is required: a record missing any one fails closed", () => {
    for (const f of SOURCE_REQUIRED) {
      const v: any = relationEdge();
      delete v[f];
      expect(parses(v), f).toBe(false);
    }
  });

  it("an omitted optional field is absent, never an explicit undefined; null is a value of the singular fields, not absence of a reference", () => {
    for (const f of SOURCE_OPTIONAL) expect(parses(edge({ [f]: undefined })), f).toBe(false);
    expect(parses(edge({ provenance_ref: null }))).toBe(false);
    expect(parses(edge({ provenance_ref: ["a"] }))).toBe(false);
  });

  it("source identifiers are never replaced by aliases or normalized names", () => {
    for (const [source, alias] of [
      ["relation_id", "edge_id"],
      ["relation_id", "relation_ref"],
      ["party_refs", "parties"],
      ["party_refs", "party_ref"],
      ["party_refs", "endpoints"],
      ["relation_scope", "scope"],
      ["relation_scope", "relation_scopes"],
      ["rupture_or_suspension_status", "rupture_status"],
      ["rupture_or_suspension_status", "suspension_status"],
      ["rupture_or_suspension_status", "status"],
      ["provenance_ref", "provenance"],
      ["lifecycle_status", "status"],
      ["lifecycle_status", "lifecycle"],
    ] as const) {
      const v: any = fullRelationEdge();
      v[alias] = v[source];
      delete v[source];
      expect(parses(v), `${source} -> ${alias}`).toBe(false);
    }
  });
});

describe("the derived Relation Edge indexes are not writable persistent state (IA-02, WS-008 §29.7)", () => {
  it("each of the five derived reference / index arrays is refused, empty or populated, alone or with a valid core", () => {
    for (const f of DERIVED_INDEX_FIELDS) {
      expect(parses(edge({ [f]: [] })), `${f} empty`).toBe(false);
      expect(parses(edge({ [f]: ["x"] })), `${f} populated`).toBe(false);
      expect(parses(edge({ [f]: "x" })), `${f} singular`).toBe(false);
    }
    expect(parses(edge(Object.fromEntries(DERIVED_INDEX_FIELDS.map((f) => [f, []]))))).toBe(false);
  });

  it("singularised, pluralised or renamed spellings of the derived indexes are refused too", () => {
    for (const f of [
      "channel_ref",
      "channels",
      "recognition_ref",
      "recognitions",
      "active_claim_dispute_ref",
      "claim_dispute_refs",
      "dispute_refs",
      "instrument_ref",
      "instruments",
      "framework_ref",
      "frameworks",
    ])
      expect(parses(edge({ [f]: ["x"] })), f).toBe(false);
  });

  it("no collateral Diplomacy construct, dependency, score or generic field is representable (strict)", () => {
    for (const f of [
      "dependency_refs",
      "effect_on",
      "relevance",
      "is_material",
      "materially_continuing",
      "trust",
      "reputation",
      "relation_score",
      "relationship_score",
      "influence",
      "negotiation_ref",
      "negotiation_refs",
      "clause_refs",
      "binding_entry_refs",
      "compliance",
      "performance",
      "properties",
      "metadata",
      "extra",
    ])
      expect(parses(edge({ [f]: 1 })), f).toBe(false);
  });
});

describe("party_refs[] keeps its array shape; no cardinality, uniqueness or ordering rule is invented (IA-02)", () => {
  it("empty, single, repeated and unsorted arrays are carried exactly, in authored order", () => {
    for (const refs of [[], ["a"], ["a", "a"], ["b", "a", "c"], ["a", "b", "a"]]) {
      const parsed = RelationEdgeSchema.parse(edge({ party_refs: refs }));
      expect(parsed.party_refs).toEqual(refs);
    }
  });

  it("party_refs[] is not a singular reference and holds only references", () => {
    for (const bad of ["a", null, 1, { a: 1 }, [1], [null], [["a"]], [{ a: 1 }]])
      expect(parses(edge({ party_refs: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("no party class is fixed: any authored diplomatic-party reference is carried, and nothing is classified or dereferenced", () => {
    const refs = [
      "faction-1",
      "gip/institution/inst-1",
      "population/cohort/c1",
      "culture:x.y",
      "anything at all",
    ];
    expect(RelationEdgeSchema.parse(edge({ party_refs: refs })).party_refs).toEqual(refs);
  });
});

describe("singular fields stay singular, with no invented closed set (IA-02)", () => {
  it("relation_scope, rupture_or_suspension_status and lifecycle_status carry any one authored canonical JSON scalar or object exactly", () => {
    for (const f of ["relation_scope", "rupture_or_suspension_status", "lifecycle_status"]) {
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
        const parsed: any = RelationEdgeSchema.parse(edge({ [f]: value }));
        expect(parsed[f], `${f} ${JSON.stringify(value)}`).toEqual(value);
      }
    }
  });

  it("an array, a non-finite number, a non-JSON value and an explicit undefined are refused for each singular field", () => {
    for (const f of ["relation_scope", "rupture_or_suspension_status", "lifecycle_status"]) {
      for (const bad of [[], ["a"], [{ a: 1 }], Number.NaN, Infinity, new Map(), () => 1])
        expect(parses(edge({ [f]: bad })), `${f} ${String(bad)}`).toBe(false);
    }
    expect(parses(edge({ relation_scope: undefined }))).toBe(false);
    expect(parses(edge({ lifecycle_status: undefined }))).toBe(false);
  });

  it("no alias is normalised and no lifecycle or rupture literal set is imposed: case variants and unlisted values are distinct authored values", () => {
    for (const v of ["Active", "ACTIVE", "active", "ruptured", "SUSPENDED", "retired", "x"]) {
      expect(RelationEdgeSchema.parse(edge({ lifecycle_status: v })).lifecycle_status).toBe(v);
      expect(
        RelationEdgeSchema.parse(edge({ rupture_or_suspension_status: v }))
          .rupture_or_suspension_status,
      ).toBe(v);
    }
  });

  it("provenance_ref is an optional singular opaque reference, distinct from the engine's own rule provenance", () => {
    expect(RelationEdgeSchema.parse(fullRelationEdge()).provenance_ref).toBeDefined();
    for (const bad of [["a"], 1, true, { a: 1 }, ""])
      expect(parses(edge({ provenance_ref: bad })), JSON.stringify(bad)).toBe(false);
    // rule / spec provenance is metadata of the commit, never a field of the edge
    for (const f of ["rule", "governing_rule", "native_pin", "spec_provenance"])
      expect(parses(edge({ [f]: "x" })), f).toBe(false);
  });
});

describe("relation_id is the only identity dimension (IA-02)", () => {
  it("relation_id is a key-safe canonical identity; empty and key-unsafe values are refused", () => {
    for (const id of ["r1", "relation-a-1", "A.b:c_d-9", "1"])
      expect(parses(relationEdge(id)), id).toBe(true);
    for (const bad of ["", "a/b", "a b", " a", "-a", "a\n", "../a", "a?b"])
      expect(parses(relationEdge(bad)), JSON.stringify(bad)).toBe(false);
    expect(parses(edge({ relation_id: ["r1"] }))).toBe(false);
    expect(parses(edge({ relation_id: 1 }))).toBe(false);
  });

  it("the key derives from relation_id alone: parties, scope and statuses are not identity dimensions", () => {
    const a = relationEdge("same", { party_refs: ["x"], relation_scope: "s1" });
    const b = relationEdge("same", { party_refs: ["y", "z"], relation_scope: { s: 2 } });
    expect(diplomacyRelationKey(a.relation_id)).toBe(diplomacyRelationKey(b.relation_id));
    expect(diplomacyRelationKey("same")).toBe("diplomacy/relation/same");
  });
});
