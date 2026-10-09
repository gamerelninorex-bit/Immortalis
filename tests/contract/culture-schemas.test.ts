// Culture & Society Established Shared Meaning / Norm — executable contracts (amended forty-sixth slice). The sealed context is
// OUTCOME-NEUTRAL: it holds no verdict, no "recognition" conclusion, no manifestation and no admission flag; the shared meaning
// carries only the ratified minimum and the GM judgment's manifestation. Every schema is strict.
import { describe, expect, it } from "vitest";
import {
  COMMUNICATIVE_CONVENTION_CLOSE,
  CultureSealRequestSchema,
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
} from "@immortalis/contracts";
import {
  CULTURE_CONTEXT_MARKET,
  DEFAULT_OBSERVATIONS,
  TEST_CONSUMER_QUESTION,
  TEST_MANIFESTATION,
  testConstituency,
} from "@immortalis/testkit";
import { cultureSlotId } from "@immortalis/engine";
import { sealRequest } from "../support/culture.ts";

const U = "a".repeat(64);
const distinction = { referent_key: "r", scope_key: "s", context_id: "c" };
const slot = cultureSlotId(distinction);
const liveConstituency = () => ({
  ...testConstituency(),
  close_vouch: {
    port: "PopulationCloseScopeVerifier" as const,
    live_population_admission: true as const,
    reconciliation: "NOT_DUE" as const,
    evidence: {
      ledger_id: "ledger-main",
      cohort_id: "cohort-status-l",
      close_fact_key: "population/ledger-main/close",
      close_version: 2,
      instant: { unit: "u", value: 1 },
      consequence_sources: [{ owner: "o", fact_key: "k" }],
    },
  },
});
const context = () => ({
  update_id: U,
  slot_id: slot,
  distinction,
  trigger_ref: { owner: "o", fact_key: "k", version: 1, committed_by_group_id: "g" },
  causal_process_id: "cjadj:trigger:v1:x",
  opportunity_id: "CJA_V1_SINGLE_EVALUATION",
  owner_operation_id: "culture-commit-communicative-convention-close",
  inputs: [
    {
      owner: "o",
      fact_key: "k",
      version: 1,
      read: { basis: "AS-OF-NOW" as const },
      committed_by_group_id: "g",
    },
  ],
  constituency: liveConstituency(),
  consumer_question: TEST_CONSUMER_QUESTION,
});

describe("the sealed Social Update Context is strict and outcome-neutral", () => {
  it("accepts a well-formed context", () => {
    expect(CultureUpdateContextSchema.safeParse(context()).success).toBe(true);
  });

  it("has no field for a verdict, manifestation, recognition conclusion, admission flag, count, roster or number", () => {
    for (const extra of [
      "verdict",
      "manifestation",
      "candidate_manifestation",
      "recognition",
      "admission",
      "members",
      "count",
      "prevalence",
      "score",
      "role",
      "permission",
    ]) {
      expect(CultureUpdateContextSchema.safeParse({ ...context(), [extra]: "x" }).success).toBe(
        false,
      );
    }
  });

  it("requires a Cohort constituency, the fixed opportunity and the Culture close operation", () => {
    const without: Record<string, unknown> = { ...context() };
    delete without["constituency"];
    expect(CultureUpdateContextSchema.safeParse(without).success).toBe(false);
    expect(CultureUpdateContextSchema.safeParse({ ...context(), constituency: null }).success).toBe(
      false,
    );
    expect(
      CultureUpdateContextSchema.safeParse({ ...context(), opportunity_id: "OTHER" }).success,
    ).toBe(false);
    expect(
      CultureUpdateContextSchema.safeParse({ ...context(), owner_operation_id: "other" }).success,
    ).toBe(false);
  });

  it("rejects a lone surrogate and a non-hex update identity", () => {
    expect(
      CultureUpdateContextSchema.safeParse({ ...context(), consumer_question: "x\ud800" }).success,
    ).toBe(false);
    expect(
      CultureUpdateContextSchema.safeParse({ ...context(), update_id: "nothex" }).success,
    ).toBe(false);
  });

  it("a live vouch needs its evidence; a bare `true` has no representation", () => {
    const c = context();
    const bare = { ...c.constituency.close_vouch, evidence: undefined };
    delete (bare as { evidence?: unknown }).evidence;
    expect(
      CultureUpdateContextSchema.safeParse({
        ...c,
        constituency: { ...c.constituency, close_vouch: bare },
      }).success,
    ).toBe(false);
  });
});

describe("the seal request carries keys and read bases only", () => {
  it("accepts the primary request", () => {
    expect(CultureSealRequestSchema.safeParse(sealRequest()).success).toBe(true);
    expect(sealRequest().inputs).toHaveLength(DEFAULT_OBSERVATIONS.length);
  });
  it("has no field for a version, committing group, identity, owner, vouch, verdict or manifestation", () => {
    for (const extra of [
      "update_id",
      "slot_id",
      "version",
      "committed_by_group_id",
      "constituency",
      "close_vouch",
      "owner",
      "verdict",
      "manifestation",
    ]) {
      expect(CultureSealRequestSchema.safeParse({ ...sealRequest(), [extra]: "x" }).success).toBe(
        false,
      );
    }
    expect(
      CultureSealRequestSchema.safeParse({
        ...sealRequest(),
        inputs: [{ fact_key: "k", read: { basis: "AS-OF-NOW" }, version: 3 }],
      }).success,
    ).toBe(false);
  });
});

describe("the shared meaning carries the ratified minimum only", () => {
  const meaning = () => ({
    slot_id: slot,
    status: "ESTABLISHED" as const,
    referent_key: "r",
    scope_key: "s",
    context_id: "c",
    manifestation: TEST_MANIFESTATION,
    establishment: {
      update_id: U,
      context: { fact_key: cultureUpdateContextKey(U), version: 1 },
      decision: {
        fact_key: `adjudication-culture/${U}/decision`,
        version: 1,
        decision_id: `cjadj:v1:${U}`,
      },
    },
    close: { name: COMMUNICATIVE_CONVENTION_CLOSE, stage: cultureConventionStage(U, slot) },
  });
  it("accepts the established meaning", () => {
    expect(CultureSharedMeaningSchema.safeParse(meaning()).success).toBe(true);
  });
  it("has no status other than ESTABLISHED and no prevalence, count, strength, adoption, belief, Cohort value or number", () => {
    expect(
      CultureSharedMeaningSchema.safeParse({ ...meaning(), status: "CONTESTED" }).success,
    ).toBe(false);
    for (const extra of [
      "prevalence",
      "count",
      "strength",
      "adoption",
      "belief",
      "members",
      "cohort",
      "evidence",
      "uncertainty",
    ]) {
      expect(CultureSharedMeaningSchema.safeParse({ ...meaning(), [extra]: 1 }).success).toBe(
        false,
      );
    }
  });
  it("is keyed by the Culture state slot while its stage is keyed by update and slot", () => {
    expect(cultureSharedMeaningKey(slot)).toBe(`culture/meaning/${slot}`);
    const stage = cultureConventionStage(U, slot);
    expect(stage.causal_process_id).toBe(`culture-update/${U}`);
    expect(stage.prospective_result_id).toBe(cultureSharedMeaningKey(slot));
    // a different update of the SAME slot is a different stage over the same slot
    expect(cultureConventionStage("b".repeat(64), slot).causal_process_id).not.toBe(
      stage.causal_process_id,
    );
  });
  it("the slot is exactly referent × scope × context and nothing else", () => {
    expect(cultureSlotId(distinction)).toBe(slot);
    expect(cultureSlotId({ ...distinction, context_id: "other" })).not.toBe(slot);
    expect(slot).toMatch(/^culture-slot-[0-9a-f]{64}$/);
    expect(CULTURE_CONTEXT_MARKET).toBeTruthy();
  });
});
