// Contract evidence for the GIP Institution Identity Constitutive Source Reference Foundation (twentieth bounded slice): the
// strict Institution Identity gains exactly one optional, singular, opaque `constitutive_source_ref` (WS-007 §3.1) and nothing
// else. Register lineage: IA-01 (partial), IA-02 (partial), IA-03 (partial); RC-02; IM-06. Source lock:
// spec/f027/spec-lock.json (F-027 v1.0): WS-007.
import { describe, expect, it } from "vitest";
import {
  EntityId,
  InstitutionIdentitySchema,
  gipInstitutionIdentityKey,
} from "@immortalis/contracts";
import {
  CONSTITUTIVE_SOURCE_A,
  CONSTITUTIVE_SOURCE_B,
  INSTITUTION_COURT,
  INSTRUMENT_A,
  institutionIdentity,
  institutionIdentityWithConstitutiveSource,
} from "@immortalis/testkit";

const identity = (over: Record<string, unknown> = {}) => ({ ...institutionIdentity(), ...over });
const ok = (v: unknown) => InstitutionIdentitySchema.safeParse(v).success;

describe("the optional constitutive_source_ref is the one added WS-007 §3.1 field", () => {
  it("the legacy minimum identity (no constitutive_source_ref) still parses, and omission means absence: no default is synthesized", () => {
    const r = InstitutionIdentitySchema.safeParse(institutionIdentity());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(Object.keys(r.data).sort()).toEqual([
        "continuity_status",
        "identity_label",
        "institution_id",
      ]);
      expect("constitutive_source_ref" in r.data).toBe(false);
      // the parse reproduces the authored bytes exactly
      expect(JSON.stringify(r.data)).toBe(JSON.stringify(institutionIdentity()));
    }
  });

  it("an identity carrying one authored reference parses and is returned exactly as authored", () => {
    const authored = institutionIdentityWithConstitutiveSource();
    const r = InstitutionIdentitySchema.safeParse(authored);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual(authored);
      expect(r.data.constitutive_source_ref).toBe(CONSTITUTIVE_SOURCE_A);
      expect(JSON.stringify(r.data)).toBe(JSON.stringify(authored));
    }
  });

  it("the strict shape is exactly the four-field Twentieth-slice write surface", () => {
    expect(Object.keys(InstitutionIdentitySchema.shape).sort()).toEqual([
      "constitutive_source_ref",
      "continuity_status",
      "identity_label",
      "institution_id",
    ]);
    // only the three minimum fields stay required
    for (const k of ["institution_id", "identity_label", "continuity_status"]) {
      const v: Record<string, unknown> = institutionIdentityWithConstitutiveSource();
      delete v[k];
      expect(ok(v), k).toBe(false);
    }
  });

  it("the reference is carried verbatim: no alias, normalisation, expansion, trimming, case-folding or derived surrogate", () => {
    for (const ref of ["Charter-1", "CHARTER:1.a_b-c", "a", "0", "x".repeat(40), "ns:charter.."]) {
      const r = InstitutionIdentitySchema.safeParse(identity({ constitutive_source_ref: ref }));
      expect(r.success, ref).toBe(true);
      if (r.success) expect(r.data.constitutive_source_ref).toBe(ref);
    }
  });
});

describe("the reference uses the existing canonical opaque-reference representation (EntityId) and is singular", () => {
  it("accepts exactly what EntityId accepts and refuses exactly what it refuses (no narrowed or widened rule)", () => {
    for (const v of [
      CONSTITUTIVE_SOURCE_A,
      INSTRUMENT_A,
      "any-referent-kind",
      "",
      " padded",
      "two words",
      "a/b",
      "-leading",
      7,
      true,
      {},
    ])
      expect(ok(identity({ constitutive_source_ref: v })), JSON.stringify(v)).toBe(
        EntityId.safeParse(v).success,
      );
  });

  it("a malformed or non-reference value fails closed: null, undefined, empty, padded, structured, numeric, boolean", () => {
    for (const bad of [
      null,
      undefined,
      "",
      " c",
      "c ",
      "two words",
      "a/b",
      7,
      true,
      {},
      { id: "c" },
    ])
      expect(ok(identity({ constitutive_source_ref: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("an explicit undefined is refused rather than carried as a second form of absence", () => {
    expect(ok({ ...institutionIdentity(), constitutive_source_ref: undefined })).toBe(false);
  });

  it("the field is singular: arrays (empty, one, many) fail closed", () => {
    for (const bad of [[], [CONSTITUTIVE_SOURCE_A], [CONSTITUTIVE_SOURCE_A, CONSTITUTIVE_SOURCE_B]])
      expect(ok(identity({ constitutive_source_ref: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("renamed, plural and aliased forms fail closed (the exact identifier is the only one)", () => {
    for (const alias of [
      "constitutive_source_refs",
      "constitutive_source_ids",
      "constitutive_source_id",
      "constitutive_source",
      "constitutive_ref",
      "constitutiveSourceRef",
      "constitutive-source-ref",
      "ConstitutiveSourceRef",
      "constitutive_sources",
      "source_ref",
      "founding_source_ref",
      "charter_ref",
      "constitutive_act_ref",
      "governance_instrument_ref",
      "instrument_ref",
    ])
      for (const value of [CONSTITUTIVE_SOURCE_A, [CONSTITUTIVE_SOURCE_A]])
        expect(ok(identity({ [alias]: value })), `${alias}=${JSON.stringify(value)}`).toBe(false);
  });
});

describe("the strict schema still refuses every other WS-007 §3.1 field and lifecycle branch", () => {
  const withRef = (over: Record<string, unknown>) =>
    identity({ constitutive_source_ref: CONSTITUTIVE_SOURCE_A, ...over });

  it("predecessor_ids[] and successor_ids[] stay unrepresentable, alone or beside the constitutive source", () => {
    for (const extra of [
      { predecessor_ids: [] },
      { predecessor_ids: ["institution-old"] },
      { successor_ids: [] },
      { successor_ids: ["institution-new"] },
      { predecessor_ids: ["institution-old"], successor_ids: ["institution-new"] },
      { predecessor_id: "institution-old" },
      { successor_id: "institution-new" },
    ]) {
      expect(ok(identity(extra)), JSON.stringify(extra)).toBe(false);
      expect(ok(withRef(extra)), JSON.stringify(extra)).toBe(false);
    }
  });

  it("every lifecycle transition status stays unrepresentable even when a constitutive source is present", () => {
    for (const status of [
      "renamed",
      "split",
      "merged",
      "abolished",
      "replaced",
      "CONTINUING",
      "active",
      "",
      null,
    ])
      expect(ok(withRef({ continuity_status: status })), String(status)).toBe(false);
  });

  it.each([
    ["office", "office-1"],
    ["powers", ["tax"]],
    ["authority", "supreme"],
    ["governance_instrument", "instrument-1"],
    ["constitutive_act", {}],
    ["membership", ["actor-1"]],
    ["faction", "faction-1"],
    ["assets", []],
    ["resources", {}],
    ["kti_state", {}],
    ["belief", {}],
    ["relationship", {}],
    ["military_capability", "high"],
    ["economic_holding", {}],
    ["territory", "province-1"],
    ["properties", {}],
    ["metadata", {}],
    ["extra", 1],
  ])("an unrelated %s field is refused beside a constitutive source", (k, v) => {
    expect(ok(withRef({ [k]: v }))).toBe(false);
  });
});

describe("the reference is not an identity dimension: the key is derived from institution_id alone", () => {
  it("the key is identical with the reference absent, present or different", () => {
    const key = gipInstitutionIdentityKey(INSTITUTION_COURT);
    expect(key).toBe(`gip/institution/${INSTITUTION_COURT}/identity`);
    for (const v of [
      institutionIdentity(),
      institutionIdentityWithConstitutiveSource(INSTITUTION_COURT, CONSTITUTIVE_SOURCE_A),
      institutionIdentityWithConstitutiveSource(INSTITUTION_COURT, CONSTITUTIVE_SOURCE_B),
    ]) {
      const r = InstitutionIdentitySchema.safeParse(v);
      expect(r.success).toBe(true);
      if (r.success) expect(gipInstitutionIdentityKey(r.data.institution_id)).toBe(key);
    }
  });
});
