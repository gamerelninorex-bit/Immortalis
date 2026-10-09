// F-027-CJA1 contract — strict schemas, the refusal vocabulary, the stable identities and independent SHA-256 vectors
// (computed outside this repo's hashing code). CJA1 v1.1 is Sovereign-approved but NOT native-pinned or spec-locked here.
import { describe, expect, it } from "vitest";
import {
  CJA_REFUSAL_CODES,
  CJA_DEPENDENCY_UNRESOLVED_CODES,
  CjaAuthoredJudgmentSchema,
  CjaCloseVouchSchema,
  CjaContextAttestationSchema,
  CjaDecisionRecordSchema,
  CjaFindingSchema,
  GM_ADJUDICATION_AUTHORITY,
  cjaDecisionGroupId,
  cjaDecisionId,
  cjaDecisionIntentId,
  cjaDecisionKey,
  cjaFailureClass,
} from "@immortalis/contracts";
import {
  assertCjaCanonical,
  cjaCausalProcessId,
  cjaCultureUpdateId,
  cjaDigest,
  cjaDistinctionDigest,
  isCjaCanonical,
} from "@immortalis/engine";
import { scriptedJudgment, testAttestation } from "@immortalis/testkit";
import { DEFAULT_OBSERVATIONS } from "@immortalis/testkit";

const refs = new Map(
  DEFAULT_OBSERVATIONS.map((o, i) => [o.id, { version: 1, group_id: `cja-obs-group-${i + 1}` }]),
);
const att = testAttestation(refs, "cja-ctx-group-5");

describe("CJA1 identities — independent vectors", () => {
  it("derives the causal process, distinction digest and update id exactly as specified", () => {
    // sha256 of the canonical (sorted-key, compact) JSON, computed independently
    expect(cjaCausalProcessId(att.trigger_ref)).toBe(
      "cjadj:trigger:v1:acdea329376efe8d5cf17b74e4ca65d60b0cdede967285767f059d61ab54dadc",
    );
    expect(cjaDistinctionDigest(att.distinction)).toBe(
      "73e2c7c93b49dc3f57af9ef020af29acaf711df49a6cc39d6163dc4978c19d44",
    );
    expect(scriptedJudgment(att, "positive").culture_update_id).toBe(
      "516af11d230a8733a4a139aa44b8e5fd7e83b20698eb6092ab75a4d00404cebb",
    );
  });

  it("hashes non-ASCII and null canonically", () => {
    expect(cjaDigest({ a: "é€" })).toBe(
      "7d076f860d8db0fcc8b3e8ac32712424430f0856dc588c5f9b8a499bda530000",
    );
    expect(cjaDigest({ b: [1, 2], a: null })).toBe(
      "ee743f2fa2570a1b5e3270cc405d0456b983ba03ab9cb27552fc6c1a720183c7",
    );
  });

  it("is order-independent over object keys and sensitive to every identity input", () => {
    const base = {
      causal_process_id: "p",
      opportunity_id: "CJA_V1_SINGLE_EVALUATION",
      distinction_digest: "d",
      owner_operation_id: "o",
    };
    const id = cjaCultureUpdateId(base);
    expect(
      cjaCultureUpdateId({
        owner_operation_id: "o",
        distinction_digest: "d",
        opportunity_id: "CJA_V1_SINGLE_EVALUATION",
        causal_process_id: "p",
      }),
    ).toBe(id);
    for (const k of Object.keys(base) as (keyof typeof base)[]) {
      expect(cjaCultureUpdateId({ ...base, [k]: base[k] + "x" })).not.toBe(id);
    }
  });

  it("stable decision, key, group and intent identities", () => {
    const u = "a".repeat(64);
    expect(cjaDecisionId(u)).toBe(`cjadj:v1:${u}`);
    expect(cjaDecisionKey(u)).toBe(`adjudication-culture/${u}/decision`);
    expect(cjaDecisionGroupId(u)).toBe(`cjadj:group:v1:${u}`);
    expect(cjaDecisionIntentId(u)).toBe(`cjadj:intent:v1:${u}`);
  });
});

describe("CJA1 canonical input law", () => {
  it("refuses lone surrogates in strings and keys, undefined, non-finite, bigint, functions and class instances", () => {
    for (const bad of [
      "\ud800",
      "x\udc00y",
      { "\ud800": 1 },
      { a: undefined },
      Number.NaN,
      Infinity,
      1n,
      () => 1,
      new Date(),
      new Map(),
    ]) {
      expect(isCjaCanonical(bad)).toBe(false);
      expect(() => assertCjaCanonical(bad)).toThrow();
    }
  });
  it("accepts well-formed surrogate pairs and ordinary plain JSON", () => {
    expect(isCjaCanonical({ a: "𝄞 ok", b: [1, null, true, { c: "é" }] })).toBe(true);
  });
  it("refuses excessive nesting", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 100; i++) deep = [deep];
    expect(isCjaCanonical(deep)).toBe(false);
  });
});

describe("CJA1 schemas are strict", () => {
  const judgment = scriptedJudgment(att, "positive");
  it("accept the scripted judgment and attestation", () => {
    expect(CjaAuthoredJudgmentSchema.safeParse(judgment).success).toBe(true);
    expect(CjaContextAttestationSchema.safeParse(att).success).toBe(true);
  });
  it("the authored judgment has no field for a role, permission, owner, key, group or intent", () => {
    for (const k of [
      "role",
      "permission",
      "owner",
      "key",
      "group_id",
      "intent_id",
      "authority",
      "adjudication_context",
    ]) {
      expect(CjaAuthoredJudgmentSchema.safeParse({ ...judgment, [k]: "x" }).success).toBe(false);
    }
  });
  it("rejects unknown fields on attestation, finding and vouch", () => {
    expect(CjaContextAttestationSchema.safeParse({ ...att, extra: 1 }).success).toBe(false);
    expect(CjaFindingSchema.safeParse({ ...judgment.findings.A, extra: 1 }).success).toBe(false);
    expect(
      CjaCloseVouchSchema.safeParse({ ...att.constituency!.close_vouch, extra: 1 }).success,
    ).toBe(false);
  });
  it("a close vouch can never claim live Population admission", () => {
    expect(
      CjaCloseVouchSchema.safeParse({
        ...att.constituency!.close_vouch,
        live_population_admission: true,
      }).success,
    ).toBe(false);
    expect(
      CjaCloseVouchSchema.safeParse({
        ...att.constituency!.close_vouch,
        reconciliation: "SOMETIME",
      }).success,
    ).toBe(false);
  });
  it("a finding needs citations or a specific reason; a bare flag has no representation", () => {
    expect(
      CjaFindingSchema.safeParse({
        status: "SATISFIED",
        reason: "r",
        citations: [],
        no_citation_reason: null,
      }).success,
    ).toBe(false);
    expect(
      CjaFindingSchema.safeParse({
        status: "SATISFIED",
        reason: "r",
        citations: [],
        no_citation_reason: "none apply",
      }).success,
    ).toBe(true);
    expect(CjaFindingSchema.safeParse(true).success).toBe(false);
  });
  it("the four verdicts are the only verdict literals", () => {
    for (const v of [
      "ESTABLISH_SUPPORTED",
      "NOT_SUPPORTED",
      "UNRESOLVED",
      "DERIVE_WITHOUT_PERSISTENCE",
    ]) {
      expect(CjaAuthoredJudgmentSchema.safeParse({ ...judgment, verdict: v }).success).toBe(true);
    }
    expect(CjaAuthoredJudgmentSchema.safeParse({ ...judgment, verdict: "ADOPTED" }).success).toBe(
      false,
    );
  });
  it("the stored record pins the trusted-precondition basis and no human authentication", () => {
    const shape = CjaDecisionRecordSchema.shape.adjudication_context;
    expect(
      shape.safeParse({
        role: "role.gm",
        permission: "permission.rule.adjudicate",
        basis: "TRUSTED_IN_PROCESS_PRECONDITION",
      }).success,
    ).toBe(true);
    expect(
      shape.safeParse({
        role: "role.gm",
        permission: "permission.rule.adjudicate",
        basis: "AUTHENTICATED_HUMAN",
      }).success,
    ).toBe(false);
    expect(
      shape.safeParse({
        role: "role.player",
        permission: "permission.rule.adjudicate",
        basis: "TRUSTED_IN_PROCESS_PRECONDITION",
      }).success,
    ).toBe(false);
  });
  it("the operation authority is exactly role.gm + permission.rule.adjudicate", () => {
    expect(GM_ADJUDICATION_AUTHORITY).toEqual({
      role: "role.gm",
      permission: "permission.rule.adjudicate",
    });
  });
});

describe("CJA1 refusal vocabulary", () => {
  it("classes structural refusals apart from dependency-unresolved stops", () => {
    for (const c of CJA_REFUSAL_CODES) expect(cjaFailureClass(c)).toBe("REFUSAL");
    for (const c of CJA_DEPENDENCY_UNRESOLVED_CODES)
      expect(cjaFailureClass(c)).toBe("DEPENDENCY_UNRESOLVED");
  });
  it("has no code named for a substantive verdict: NOT_SUPPORTED and UNRESOLVED are never refusals", () => {
    const all = [...CJA_REFUSAL_CODES, ...CJA_DEPENDENCY_UNRESOLVED_CODES] as string[];
    for (const v of [
      "NOT_SUPPORTED",
      "UNRESOLVED",
      "DERIVE_WITHOUT_PERSISTENCE",
      "ESTABLISH_SUPPORTED",
    ]) {
      expect(all).not.toContain(v);
    }
  });
  it("includes the specified refusal classes", () => {
    for (const c of [
      "AUTHORITY_DENIED",
      "JUDGMENT_INPUT_INVALID",
      "IDENTITY_INVALID",
      "CONTEXT_MISMATCH",
      "CITATION_VERSION_MISMATCH",
      "HISTORICAL_SOURCE_PROOF_MISSING",
      "CLOSE_BASIS_INVALID_AT_SEAL",
      "CONSTITUENCY_INVALID",
      "JUDGMENT_INCOHERENT",
      "CITATION_CLOSURE_VIOLATION",
      "DECISION_CONFLICT",
      "RULE_MISMATCH",
      "DECISION_INTEGRITY_FAILURE",
    ]) {
      expect(CJA_REFUSAL_CODES as readonly string[]).toContain(c);
    }
  });
});
