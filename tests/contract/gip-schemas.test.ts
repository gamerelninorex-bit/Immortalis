// Contract evidence for the GIP Stable Institution Identity Backbone Foundation (twelfth slice): the executable contract is
// strict and sparse — an Institution Identity is identity/provenance only, and no office, authority, membership, faction,
// instrument, asset, resource, KTI, actor, relationship, military, economic, territory, lifecycle-transition or generic
// property field has any representation. Register lineage: IA-02 (partial), IA-03 (partial); RC-02; IM-06. Source lock:
// spec/f027/spec-lock.json (F-027 v1.0): WS-007.
import { describe, expect, it } from "vitest";
import {
  FACET_GIP_INSTITUTION_IDENTITY,
  GIP_CONTINUITY_CONTINUING,
  InstitutionIdentitySchema,
  OWNER_GIP,
  gipInstitutionIdentityKey,
} from "@immortalis/contracts";
import { INSTITUTION_COURT, institutionIdentity } from "@immortalis/testkit";

const identity = (over: Record<string, unknown> = {}) => ({ ...institutionIdentity(), ...over });

describe("the Institution Identity Reference has exactly the frozen minimum shape (GIP Draft v2.1 §3.1)", () => {
  it("accepts one canonical identity, its authored label and the CONTINUING status", () => {
    const r = InstitutionIdentitySchema.safeParse(identity());
    expect(r.success).toBe(true);
    expect(Object.keys(InstitutionIdentitySchema.shape).sort()).toEqual([
      "continuity_status",
      "identity_label",
      "institution_id",
    ]);
    expect(GIP_CONTINUITY_CONTINUING).toBe("continuing");
  });

  it("requires every field: nothing is defaulted or repaired", () => {
    for (const k of ["institution_id", "identity_label", "continuity_status"]) {
      const v: Record<string, unknown> = identity();
      delete v[k];
      expect(InstitutionIdentitySchema.safeParse(v).success, k).toBe(false);
    }
    expect(InstitutionIdentitySchema.safeParse({}).success).toBe(false);
  });

  it("rejects a malformed identity or label", () => {
    for (const bad of [
      identity({ institution_id: "" }),
      identity({ institution_id: " court" }),
      identity({ institution_id: "two words" }),
      identity({ institution_id: "a/b" }),
      identity({ institution_id: 7 }),
      identity({ identity_label: "" }),
      identity({ identity_label: " padded " }),
      identity({ identity_label: null }),
    ])
      expect(InstitutionIdentitySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});

describe("only an institution entering as a CONTINUING current institution is representable (acceptance 2, 5)", () => {
  it("every lifecycle transition status is unrepresentable: renamed, split, merged, abolished, replaced, or anything else", () => {
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
      expect(
        InstitutionIdentitySchema.safeParse(identity({ continuity_status: status })).success,
        String(status),
      ).toBe(false);
  });

  it("predecessor, successor and constitutive-source references have no field: they belong to later transitions and acts", () => {
    for (const extra of [
      { predecessor_ids: [] },
      { predecessor_ids: ["institution-old"] },
      { successor_ids: ["institution-new"] },
      { constitutive_source_ref: "charter-1" },
      { constitutive_source_ref: null },
    ])
      expect(
        InstitutionIdentitySchema.safeParse(identity(extra)).success,
        JSON.stringify(extra),
      ).toBe(false);
  });
});

describe("identity/provenance only: no unmodelled field can be carried (acceptance 5; GIP §§2.2, 3.1)", () => {
  const forbidden: Record<string, unknown> = {
    office: "office-1",
    offices: [],
    powers: ["tax"],
    authority: "supreme",
    authority_locus: {},
    decision_procedure: "majority",
    governance_instrument: "instrument-1",
    scope_binding: {},
    membership: ["actor-1"],
    members: [],
    headcount: 12,
    member_count: 12,
    faction: "faction-1",
    faction_posture: "hostile",
    stance: "neutral",
    legal_instrument: "charter",
    charter_text: "We, the people…",
    assets: ["treasury"],
    resources: {},
    treasury: 100,
    holdings: [],
    kti_state: {},
    competence: "B",
    belief: {},
    awareness: {},
    relationship: {},
    relations: [],
    military_capability: "high",
    economic_holding: {},
    territory: "province-1",
    jurisdiction: "region-1",
    population: 1000,
    culture: "culture-1",
    treaty: "treaty-1",
    legitimacy: 0.5,
    stability: 3,
    properties: {},
    state: {},
    metadata: {},
    extra: 1,
  };
  it.each(Object.keys(forbidden))("rejects an unmodelled %s field", (k) => {
    expect(InstitutionIdentitySchema.safeParse(identity({ [k]: forbidden[k] })).success).toBe(
      false,
    );
  });
});

describe("the GIP owner and key space are single and exclusive", () => {
  it("names one owner and one facet, and derives the key from the canonical institution_id alone", () => {
    expect(OWNER_GIP).toBe("gip");
    expect(FACET_GIP_INSTITUTION_IDENTITY).toBe("gip_institution_identity");
    expect(gipInstitutionIdentityKey(INSTITUTION_COURT)).toBe(
      `gip/institution/${INSTITUTION_COURT}/identity`,
    );
  });
});
