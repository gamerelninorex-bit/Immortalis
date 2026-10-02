// Contract evidence for the GIP Office / Authority Locus Backbone Foundation (thirteenth slice, holder_ref branch; the
// decision_body_ref branch is covered by gip-office-decision-body-schemas.test.ts, fourteenth slice): the executable contract
// is the frozen WS-007 §3.2 minimum — strict, explicit, uninterpreted — and every deferred surface (delegation, concurrence,
// review/veto/override, conditional authority, any transition or exercise state) and every catch-all property has no
// representation. Register lineage: IA-02 (partial), IA-03 (partial); RC-02; IM-06.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-007.
import { describe, expect, it } from "vitest";
import {
  InstitutionIdentitySchema,
  OfficeAuthorityLocusHolderSchema,
  OfficeAuthorityLocusSchema,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
} from "@immortalis/contracts";
import {
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  OFFICE_MAGISTRATE,
  OFFICE_TREASURER,
  institutionIdentity,
  officeAuthorityLocus,
} from "@immortalis/testkit";

const office = (over: Record<string, unknown> = {}) => ({ ...officeAuthorityLocus(), ...over });

describe("the Office / Authority Locus holder_ref branch has exactly the frozen minimum shape (GIP Draft v2.1 §3.2)", () => {
  it("accepts one explicit, fully authored office", () => {
    expect(OfficeAuthorityLocusSchema.safeParse(office()).success).toBe(true);
    expect(Object.keys(OfficeAuthorityLocusHolderSchema.shape).sort()).toEqual([
      "authority_source_ref",
      "competence_scope",
      "duties",
      "holder_ref",
      "institution_id",
      "office_id",
      "powers",
      "removal_rule",
      "selection_rule",
      "succession_rule",
    ]);
  });

  it("requires every field: nothing is defaulted, derived or repaired", () => {
    for (const k of Object.keys(OfficeAuthorityLocusHolderSchema.shape)) {
      const v: Record<string, unknown> = office();
      delete v[k];
      expect(OfficeAuthorityLocusSchema.safeParse(v).success, k).toBe(false);
    }
    expect(OfficeAuthorityLocusSchema.safeParse({}).success).toBe(false);
  });

  it("powers[] and duties[] are required arrays of authored text with no invented minimum or uniqueness: empty and repeated entries are accepted as authored", () => {
    for (const over of [
      { powers: [] },
      { duties: [] },
      { powers: [], duties: [] },
      { powers: ["a", "a"] },
      { duties: ["d", "d"] },
    ])
      expect(OfficeAuthorityLocusSchema.safeParse(office(over)).success, JSON.stringify(over)).toBe(
        true,
      );
    // the parsed value is the authored value exactly: no normalisation, deduplication or reordering
    const authored = office({ powers: ["b", "a", "b"], duties: ["z", "z"] });
    expect(OfficeAuthorityLocusSchema.parse(authored)).toEqual(authored);
    // still required, and still arrays of authored text
    for (const k of ["powers", "duties"]) {
      const v: Record<string, unknown> = office();
      delete v[k];
      expect(OfficeAuthorityLocusSchema.safeParse(v).success, k).toBe(false);
    }
  });

  it("rejects malformed identities, references and texts", () => {
    for (const bad of [
      office({ office_id: "" }),
      office({ office_id: "two words" }),
      office({ office_id: "a/b" }),
      office({ institution_id: "" }),
      office({ institution_id: "a/b" }),
      office({ authority_source_ref: "" }),
      office({ authority_source_ref: "has space" }),
      office({ holder_ref: "" }),
      office({ holder_ref: "a/b" }),
      office({ holder_ref: null }),
      office({ competence_scope: "" }),
      office({ competence_scope: " padded " }),
      office({ selection_rule: "" }),
      office({ succession_rule: " x" }),
      office({ removal_rule: "" }),
      office({ powers: [""] }),
      office({ powers: "tax" }),
      office({ duties: [" d"] }),
      office({ duties: null }),
    ])
      expect(OfficeAuthorityLocusSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it("a rule stating that a mechanism is absent, unknown or unresolved is carried verbatim as authored text and never interpreted", () => {
    for (const rule of ["selection_rule", "succession_rule", "removal_rule"])
      for (const prose of [
        "SYNTHETIC FIXTURE: no such mechanism exists.",
        "SYNTHETIC FIXTURE: unknown.",
        "SYNTHETIC FIXTURE: unresolved.",
      ]) {
        const authored = office({ [rule]: prose });
        expect(OfficeAuthorityLocusSchema.parse(authored)).toEqual(authored);
      }
  });

  it("a missing, null, empty or non-text (structured) rule fails closed: no status vocabulary, special literal or object form exists", () => {
    for (const rule of ["selection_rule", "succession_rule", "removal_rule"])
      for (const v of [undefined, null, "", { status: "unknown" }, ["unknown"], 0, false])
        expect(OfficeAuthorityLocusSchema.safeParse(office({ [rule]: v })).success, rule).toBe(
          false,
        );
  });
});

describe("deferred WS-007 surfaces and catch-all properties are unrepresentable (acceptance 5)", () => {
  // (the decision_body_ref branch is a lawful alternative to holder_ref; carrying it BESIDE holder_ref is covered by the
  // exclusivity tests in gip-office-decision-body-schemas.test.ts)
  const forbidden: Record<string, unknown> = {
    holder_ref_or_body: "x",
    delegations: [],
    delegation: "x",
    concurrence_requirements: [],
    review_veto_override: [],
    veto: "x",
    override: "x",
    conditional_authority: [],
    // transition / lifecycle state
    holder_history: [],
    previous_holder_ref: "x",
    appointed_by: "x",
    appointment_status: "appointed",
    removal_status: "none",
    succession_state: "x",
    vacant: true,
    status: "active",
    continuity_status: "continuing",
    // exercise / reach / effect state
    exercised: true,
    last_exercised: "x",
    reach: "x",
    jurisdiction: "x",
    // state of other owners, never copied to the office or its holder
    holder: { name: "x" },
    holder_authority: ["tax"],
    holder_capability: "A",
    holder_personality: {},
    holder_knowledge: [],
    holder_permissions: [],
    holder_loyalty: 1,
    knowledge: [],
    awareness: {},
    belief: {},
    kti_state: {},
    competence: "B",
    population: 10,
    treasury: 100,
    assets: [],
    military: "x",
    faction: "x",
    membership: [],
    // catch-alls and scores
    legitimacy: 0.5,
    properties: {},
    state: {},
    metadata: {},
    extra: 1,
  };
  it.each(Object.keys(forbidden))("rejects an unmodelled %s field", (k) => {
    expect(OfficeAuthorityLocusSchema.safeParse(office({ [k]: forbidden[k] })).success).toBe(false);
  });
});

describe("the office key is derived from the exact institution_id and office_id alone", () => {
  it("derives one key per office of an institution, distinct from the Institution Identity key space", () => {
    const key = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
    expect(key).toBe(`gip/institution/${INSTITUTION_COURT}/office/${OFFICE_MAGISTRATE}`);
    expect(key).not.toBe(gipInstitutionIdentityKey(INSTITUTION_COURT));
    expect(gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_TREASURER)).not.toBe(key);
    expect(gipOfficeAuthorityLocusKey(INSTITUTION_GUILD, OFFICE_MAGISTRATE)).not.toBe(key);
  });

  it("the Institution Identity contract is untouched: it is still identity/provenance only and gained no office field", () => {
    // (the twentieth slice added only the optional `constitutive_source_ref`: still no office field)
    expect(Object.keys(InstitutionIdentitySchema.shape).sort()).toEqual([
      "constitutive_source_ref",
      "continuity_status",
      "identity_label",
      "institution_id",
    ]);
    for (const extra of ["office", "offices", "office_id", "holder_ref", "powers"])
      expect(
        InstitutionIdentitySchema.safeParse({ ...institutionIdentity(), [extra]: "x" }).success,
        extra,
      ).toBe(false);
  });
});
