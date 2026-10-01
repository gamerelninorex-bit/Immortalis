// Contract evidence for the GIP Decision-Body Office Reference Branch Foundation (fourteenth slice): the executable office
// contract admits exactly one of the two frozen WS-007 §3.2 reference branches — `holder_ref` OR `decision_body_ref` —
// strict, explicit, uninterpreted, with no discriminator and no catch-all. Both together and neither fail closed; the holder
// branch is exactly what the thirteenth slice stored; every deferred surface stays unrepresentable.
// Register lineage: IA-02 (partial), IA-03 (partial); RC-02; IM-06.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-007.
import { describe, expect, it } from "vitest";
import {
  OfficeAuthorityLocusDecisionBodySchema,
  OfficeAuthorityLocusHolderSchema,
  OfficeAuthorityLocusSchema,
  gipOfficeAuthorityLocusKey,
} from "@immortalis/contracts";
import {
  DECISION_BODY_REF_A,
  HOLDER_REF_A,
  INSTITUTION_COURT,
  OFFICE_MAGISTRATE,
  decisionBodyOfficeAuthorityLocus,
  officeAuthorityLocus,
} from "@immortalis/testkit";

const body = (over: Record<string, unknown> = {}) => ({
  ...decisionBodyOfficeAuthorityLocus(),
  ...over,
});
const holder = (over: Record<string, unknown> = {}) => ({ ...officeAuthorityLocus(), ...over });
const COMMON = [
  "authority_source_ref",
  "competence_scope",
  "duties",
  "institution_id",
  "office_id",
  "powers",
  "removal_rule",
  "selection_rule",
  "succession_rule",
];

describe("the office contract admits exactly one reference branch: holder_ref OR decision_body_ref (GIP Draft v2.1 §3.2)", () => {
  it("accepts one explicit, fully authored decision-body office, and still accepts the holder office exactly as before", () => {
    expect(OfficeAuthorityLocusSchema.safeParse(body()).success).toBe(true);
    expect(OfficeAuthorityLocusSchema.safeParse(holder()).success).toBe(true);
    expect(OfficeAuthorityLocusDecisionBodySchema.safeParse(body()).success).toBe(true);
    expect(OfficeAuthorityLocusHolderSchema.safeParse(holder()).success).toBe(true);
  });

  it("the two branches share exactly the common authored fields and differ only in their one exclusive reference field", () => {
    expect(Object.keys(OfficeAuthorityLocusHolderSchema.shape).sort()).toEqual(
      [...COMMON, "holder_ref"].sort(),
    );
    expect(Object.keys(OfficeAuthorityLocusDecisionBodySchema.shape).sort()).toEqual(
      [...COMMON, "decision_body_ref"].sort(),
    );
  });

  it("carries each branch exactly as authored: no normalisation, no discriminator, no added or defaulted field", () => {
    const b = body();
    expect(OfficeAuthorityLocusSchema.parse(b)).toEqual(b);
    expect(Object.keys(OfficeAuthorityLocusSchema.parse(b)).sort()).toEqual(
      [...COMMON, "decision_body_ref"].sort(),
    );
    const h = holder();
    expect(OfficeAuthorityLocusSchema.parse(h)).toEqual(h);
    expect(Object.keys(OfficeAuthorityLocusSchema.parse(h)).sort()).toEqual(
      [...COMMON, "holder_ref"].sort(),
    );
  });

  it("BOTH references together fail closed, whatever their values", () => {
    for (const bad of [
      { ...body(), holder_ref: HOLDER_REF_A },
      { ...holder(), decision_body_ref: DECISION_BODY_REF_A },
      { ...body(), holder_ref: DECISION_BODY_REF_A },
      { ...holder(), decision_body_ref: HOLDER_REF_A },
      { ...body(), holder_ref: "" },
      { ...body(), holder_ref: null },
    ])
      expect(OfficeAuthorityLocusSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it("NEITHER reference fails closed: no default, derived or synthesized reference exists", () => {
    const neither: Record<string, unknown> = holder();
    delete neither["holder_ref"];
    expect(OfficeAuthorityLocusSchema.safeParse(neither).success).toBe(false);
    for (const absent of [undefined, null, ""]) {
      expect(OfficeAuthorityLocusSchema.safeParse({ ...neither, holder_ref: absent }).success).toBe(
        false,
      );
      expect(
        OfficeAuthorityLocusSchema.safeParse({ ...neither, decision_body_ref: absent }).success,
      ).toBe(false);
    }
    expect(OfficeAuthorityLocusSchema.safeParse({}).success).toBe(false);
  });

  it("requires every common field on the decision-body branch too: nothing is defaulted, derived or repaired", () => {
    for (const k of [...COMMON, "decision_body_ref"]) {
      const v: Record<string, unknown> = body();
      delete v[k];
      expect(OfficeAuthorityLocusSchema.safeParse(v).success, k).toBe(false);
    }
  });

  it("decision_body_ref is an opaque canonical reference only: malformed, empty, structured or non-text values fail closed", () => {
    for (const bad of [
      "",
      "two words",
      "a/b",
      " padded",
      null,
      0,
      true,
      ["body-1"],
      { id: "body-1" },
      { members: [] },
    ])
      expect(
        OfficeAuthorityLocusSchema.safeParse(body({ decision_body_ref: bad })).success,
        JSON.stringify(bad),
      ).toBe(false);
  });

  it("the common authored fields obey the same rules on the decision-body branch: arrays verbatim, rule text required", () => {
    for (const over of [
      { powers: [] },
      { duties: [] },
      { powers: ["a", "a"] },
      { duties: ["d", "d"] },
    ])
      expect(OfficeAuthorityLocusSchema.safeParse(body(over)).success, JSON.stringify(over)).toBe(
        true,
      );
    const authored = body({
      powers: ["b", "a", "b"],
      selection_rule: "SYNTHETIC FIXTURE: unknown.",
      removal_rule: "SYNTHETIC FIXTURE: no such mechanism exists.",
    });
    expect(OfficeAuthorityLocusSchema.parse(authored)).toEqual(authored);
    for (const bad of [
      body({ office_id: "" }),
      body({ institution_id: "a/b" }),
      body({ authority_source_ref: "has space" }),
      body({ competence_scope: "" }),
      body({ selection_rule: { status: "unknown" } }),
      body({ succession_rule: null }),
      body({ removal_rule: undefined }),
      body({ powers: "tax" }),
      body({ duties: [""] }),
    ])
      expect(OfficeAuthorityLocusSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
});

describe("a decision body is a bare reference: no body object, membership, procedure or exercise has a representation (acceptance 5)", () => {
  const forbidden: Record<string, unknown> = {
    // the body's own state / ontology
    decision_body: { id: "body-1" },
    body: { id: "body-1" },
    decision_body_members: ["a"],
    decision_body_roster: ["a"],
    members: ["a"],
    membership: [],
    council: [],
    roster: [],
    quorum: 3,
    seats: 5,
    faction: "x",
    autonomous_collective_state: {},
    collective_personality: {},
    named_actor_state: {},
    aggregate_stance: "x",
    // procedure / vote / exercise
    procedure: "x",
    deliberation: [],
    vote: "x",
    votes: [],
    closure: "x",
    result: "x",
    decision: "x",
    consent: true,
    permission: true,
    exercised: true,
    last_exercised: "x",
    reach: "x",
    // authority copied onto the body
    decision_body_authority: ["tax"],
    body_authority: ["tax"],
    body_capability: "A",
    body_knowledge: [],
    // transitions
    previous_decision_body_ref: "x",
    previous_holder_ref: "x",
    decision_body_history: [],
    appointed_by: "x",
    appointment_status: "appointed",
    succession_state: "x",
    // other deferred WS-007 surfaces and catch-alls
    holder_ref_or_decision_body_ref: "x",
    reference_kind: "decision_body",
    kind: "decision_body",
    branch: "decision_body",
    delegations: [],
    concurrence_requirements: [],
    review_veto_override: [],
    conditional_authority: [],
    governing_instrument_ref: "x",
    scope_bindings: [],
    properties: {},
    state: {},
    metadata: {},
    extra: 1,
  };
  it.each(Object.keys(forbidden))("rejects an unmodelled %s field", (k) => {
    expect(OfficeAuthorityLocusSchema.safeParse(body({ [k]: forbidden[k] })).success).toBe(false);
  });
});

describe("the reference branch is not an identity dimension", () => {
  it("both branches derive the one key from institution_id and office_id alone", () => {
    const key = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
    expect(key).toBe(`gip/institution/${INSTITUTION_COURT}/office/${OFFICE_MAGISTRATE}`);
    expect(gipOfficeAuthorityLocusKey(body().institution_id, body().office_id)).toBe(key);
    expect(gipOfficeAuthorityLocusKey(holder().institution_id, holder().office_id)).toBe(key);
  });
});
