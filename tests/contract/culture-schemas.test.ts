// Contract evidence for the Culture & Society Established Shared Meaning / Norm Result-Close Backbone Foundation (forty-sixth
// slice): the executable contracts are strict and minimal, Culture holds the ratified minimum-information contract and no
// prevalence, percentage, count, score, adoption, belief, motive, Cohort attachment or number, no class of meanings or norms is
// asserted, and the Social Relation Close, relations and positions have no representation. Register lineage: IA-02 (partial),
// IA-03 (partial), IA-04 (partial); RC-02, RC-03, RC-04; IM-09. Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-005.
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_CULTURE_ENGINE_SIDE,
  COMMUNICATIVE_CONVENTION_CLOSE,
  CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  CultureEvidenceReadingSchema,
  CultureInputSchema,
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  FACET_CULTURE_SOCIAL,
  OWNER_CULTURE,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  parseStageKey,
} from "@immortalis/contracts";
import { deriveSharedMeaning } from "@immortalis/engine";
import {
  CULTURE_CONTEXT_MARKET,
  evidenceInput,
  evidenceReading,
  socialEvidenceKey,
} from "@immortalis/testkit";
import { REFERENT_KEY, SCOPE_KEY, primaryContext } from "../support/culture.ts";

const context = (over: Record<string, unknown> = {}) => ({ ...primaryContext(), ...over });
const meaning = () => {
  const c = primaryContext();
  const d = deriveSharedMeaning({
    context: {
      key: cultureUpdateContextKey(c.update_id),
      owner: OWNER_CULTURE,
      version: 1,
      value: c,
    },
    evidence: [
      {
        key: socialEvidenceKey("ev1"),
        owner: c.inputs[0]!.owner,
        version: 1,
        value: evidenceReading(REFERENT_KEY, SCOPE_KEY),
      },
    ],
  });
  if (!d.ok) throw new Error("fixture");
  return d.value;
};
const FORBIDDEN_FIELDS = [
  "manifestation_asserted",
  "norm",
  "meaning_class",
  "prevalence",
  "percentage",
  "share",
  "count",
  "headcount",
  "score",
  "strength",
  "level",
  "adoption",
  "belief",
  "stance",
  "motive",
  "loyalty",
  "obedience",
  "compulsion",
  "legality",
  "authority",
  "competence",
  "comprehension",
  "cohort",
  "cohort_ref",
  "population",
  "members",
  "relation",
  "position",
  "social_relation_close",
  "retired",
  "contested",
  "uncertainty",
  "probability",
  "weight",
  "number",
];

describe("identifiers, key spaces and the stage are technical encodings of the owner's assignment", () => {
  it("one owner, one facet, an engine-side class, two exclusive key spaces and a stage derived from the update identity alone", () => {
    expect(OWNER_CULTURE).toBe("culture");
    expect(FACET_CULTURE_SOCIAL).toBe("culture_social");
    expect(ACCESS_CLASS_CULTURE_ENGINE_SIDE).toBe("culture.engine-sealed");
    expect(COMMUNICATIVE_CONVENTION_CLOSE).toBe("communicative-convention-close");
    expect(cultureUpdateContextKey("u1")).toBe("culture/update/u1/context");
    expect(cultureSharedMeaningKey("u1")).toBe("culture/meaning/u1");
    const stage = cultureConventionStage("u1");
    expect(stage).toEqual({
      causal_process_id: "culture-update/u1",
      owner_operation: {
        owner: "culture",
        operation: CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
      },
      prospective_result_id: "culture/meaning/u1",
    });
    expect(parseStageKey(stage).ok).toBe(true);
  });
});

describe("the sealed Social Update Context is strict and carries no asserted meaning (CS-UPD)", () => {
  it("accepts the lawful context and round-trips it", () => {
    const c = primaryContext();
    expect(CultureUpdateContextSchema.parse(c)).toEqual(c);
    expect(c.referent.fact_key).toBe(REFERENT_KEY);
    expect(c.context).toBe(CULTURE_CONTEXT_MARKET);
  });

  it("rejects every unmodelled, forbidden or asserted field", () => {
    for (const f of FORBIDDEN_FIELDS)
      expect(CultureUpdateContextSchema.safeParse(context({ [f]: "x" })).success, f).toBe(false);
    expect(CultureUpdateContextSchema.safeParse(context({ manifestation: "m" })).success).toBe(
      false,
    );
  });

  it("requires at least one engaged input and every mandatory field, and refuses an empty or malformed identity", () => {
    expect(CultureUpdateContextSchema.safeParse(context({ inputs: [] })).success).toBe(false);
    for (const f of ["update_id", "admission", "referent", "scope", "context", "inputs"]) {
      const rest = Object.fromEntries(Object.entries(primaryContext()).filter(([k]) => k !== f));
      expect(CultureUpdateContextSchema.safeParse(rest).success, f).toBe(false);
    }
    for (const bad of ["", "has space", "slash/inside", " lead"])
      expect(CultureUpdateContextSchema.safeParse(context({ update_id: bad })).success, bad).toBe(
        false,
      );
  });

  it("the admission gate is the three restated literals: any false, missing or extra member is refused", () => {
    const a = primaryContext().admission;
    for (const k of Object.keys(a))
      expect(
        CultureUpdateContextSchema.safeParse(context({ admission: { ...a, [k]: false } })).success,
        k,
      ).toBe(false);
    expect(
      CultureUpdateContextSchema.safeParse(context({ admission: { ...a, extra: true } })).success,
    ).toBe(false);
    expect(CultureUpdateContextSchema.safeParse(context({ admission: {} })).success).toBe(false);
  });

  it("an input carries exactly one read basis: AS-OF-NOW alone, or AS-OF-DECLARED-CLOSE with its producer's named close — never both, neither or a third", () => {
    const now = evidenceInput("ev1");
    expect(CultureInputSchema.safeParse(now).success).toBe(true);
    const close = evidenceInput("ev1", {
      read: {
        basis: "AS-OF-DECLARED-CLOSE",
        close_basis: { name: "some-close", producer: { owner: "o", operation: "p" } },
      },
    });
    expect(CultureInputSchema.safeParse(close).success).toBe(true);
    for (const read of [
      { basis: "AS-OF-NOW", close_basis: { name: "c", producer: { owner: "o", operation: "p" } } },
      { basis: "AS-OF-DECLARED-CLOSE" },
      { basis: "AS-OF-LATER" },
      { basis: "AS-OF-NOW", at: 5 },
      {},
    ])
      expect(CultureInputSchema.safeParse({ ...now, read }).success, JSON.stringify(read)).toBe(
        false,
      );
    for (const f of ["value", "count", "reading", "copy"])
      expect(CultureInputSchema.safeParse({ ...now, [f]: 1 }).success, f).toBe(false);
  });

  it("a referent and a scope are single pinned canonical references: not arrays, not Cohort references with a count", () => {
    for (const f of ["referent", "scope"] as const) {
      const base = primaryContext()[f];
      expect(CultureUpdateContextSchema.safeParse(context({ [f]: [base] })).success, f).toBe(false);
      expect(
        CultureUpdateContextSchema.safeParse(context({ [f]: { ...base, count: 3 } })).success,
        f,
      ).toBe(false);
      expect(
        CultureUpdateContextSchema.safeParse(context({ [f]: { fact_key: base.fact_key } })).success,
        f,
      ).toBe(false);
      expect(
        CultureUpdateContextSchema.safeParse(context({ [f]: { ...base, version: 0 } })).success,
        f,
      ).toBe(false);
    }
  });
});

describe("the evidence reading is exactly the Culture-defined minimum", () => {
  it("accepts the lawful reading and nothing wider", () => {
    const r = evidenceReading(REFERENT_KEY, SCOPE_KEY);
    expect(CultureEvidenceReadingSchema.parse(r)).toEqual(r);
    for (const f of FORBIDDEN_FIELDS)
      expect(CultureEvidenceReadingSchema.safeParse({ ...r, [f]: 1 }).success, f).toBe(false);
    for (const recognition of ["ONCE", "CONTINUING", "contested", "", 1, null])
      expect(CultureEvidenceReadingSchema.safeParse({ ...r, recognition }).success).toBe(false);
  });
});

describe("the shared meaning/norm is strict, sparse and derived from the context and the evidence alone", () => {
  it("accepts exactly the derived fact and round-trips it", () => {
    const m = meaning();
    expect(CultureSharedMeaningSchema.parse(m)).toEqual(m);
    expect(m.status).toBe("ESTABLISHED");
    expect(m.close.name).toBe(COMMUNICATIVE_CONVENTION_CLOSE);
    expect(m.establishment.evidence).toEqual(primaryContext().inputs);
  });

  it("rejects every unmodelled or forbidden field: no prevalence, percentage, count, score, strength, adoption, belief, motive, Cohort, relation or position", () => {
    for (const f of FORBIDDEN_FIELDS)
      expect(CultureSharedMeaningSchema.safeParse({ ...meaning(), [f]: 1 }).success, f).toBe(false);
  });

  it("the status is the single literal ESTABLISHED and the close is the Communicative Convention Close alone", () => {
    for (const status of ["RETIRED", "ACTIVE", "CONTESTED", "ARCHIVED", "established", "", null])
      expect(
        CultureSharedMeaningSchema.safeParse({ ...meaning(), status }).success,
        String(status),
      ).toBe(false);
    for (const name of [
      "social-relation-close",
      "kti-result-close",
      "",
      "Communicative Convention Close",
    ])
      expect(
        CultureSharedMeaningSchema.safeParse({
          ...meaning(),
          close: { name, stage: meaning().close.stage },
        }).success,
        name,
      ).toBe(false);
  });

  it("the manifestation is one opaque identifier: not an array, a number, an object or a vocabulary entry the engine interprets", () => {
    for (const manifestation of [["a"], 3, { name: "a" }, "", "has space", null])
      expect(CultureSharedMeaningSchema.safeParse({ ...meaning(), manifestation }).success).toBe(
        false,
      );
    // any opaque identifier is carried verbatim: there is no closed list of meanings or norms
    for (const manifestation of ["taboo", "prestige", "manifestation-7", "x1"])
      expect(CultureSharedMeaningSchema.parse({ ...meaning(), manifestation }).manifestation).toBe(
        manifestation,
      );
  });

  it("requires every field of the minimum, and at least one pinned piece of evidence", () => {
    for (const f of Object.keys(meaning())) {
      const rest = Object.fromEntries(Object.entries(meaning()).filter(([k]) => k !== f));
      expect(CultureSharedMeaningSchema.safeParse(rest).success, f).toBe(false);
    }
    expect(
      CultureSharedMeaningSchema.safeParse({
        ...meaning(),
        establishment: { ...meaning().establishment, evidence: [] },
      }).success,
    ).toBe(false);
  });
});
