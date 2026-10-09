import { z } from "zod";
import type { Authority } from "./commit.ts";
import { Id, Sha256 } from "./ids.ts";
import { SourceRefSchema } from "./source-ref.ts";
import { CloseBasisSchema } from "./temporal.ts";

/**
 * F-027-CJA1 — Culture Judgment Adjudication, CONSUMER-FREE RC-09 PREREQUISITE: executable contracts.
 *
 * Governing implementation specification: the Sovereign-approved F-027-CJA1 BLUE-reconciled v1.1 candidate (TXT SHA-256
 * `b099a6dea0b225790b944e019a27c3b87714a269720073344ea1229b4b617c67`), §§2, 3, 6, 7, 9.1 and 10.A, as directed by the
 * 9 October 2026 bounded direct-repair work order. It is NOT native-pinned and NOT in the F-027 spec lock: it is a
 * provisional, Sovereign-approved technical specification, and nothing here asserts a promoted authority status.
 *
 * Every identifier, literal and field name below is a PROPOSED TECHNICAL ENCODING copied from that text — not a frozen
 * Culture & Society identifier. This module is NEUTRAL infrastructure: it fixes the shape of one create-only RC-09
 * adjudication record, the two typed verification ports' payloads and the refusal vocabulary. It knows no social meaning,
 * writes no Culture fact, and invents no semantics; a manifestation is an opaque identifier, a classification is one of
 * four source-named tags, and no number, score, threshold or percentage exists.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet, literals and identities
// ---------------------------------------------------------------------------------------------

/** CJA1 §2.1: the one infrastructure-only RC-09 adjudication owner/facet. NOT a substantive Culture owner. */
export const OWNER_CULTURE_ADJUDICATION_KERNEL = "culture_adjudication_kernel";
export const FACET_ADJUDICATION_PROVENANCE = "adjudication_provenance";

/** CJA1 §§1.2, 7.1: the trusted in-process operation precondition of the adjudication operation. */
export const GM_ADJUDICATION_AUTHORITY = {
  role: "role.gm",
  permission: "permission.rule.adjudicate",
} as const satisfies Authority;

/** CJA1 §3.2: the fixed v1 adjudication opportunity. One adjudication per genuine trigger × cultural distinction. */
export const CJA_OPPORTUNITY_ID = "CJA_V1_SINGLE_EVALUATION";
export const CJA_SCHEMA_VERSION = 1;

/** OwnerFact metadata of every adjudication record (`unit` is null). */
export const CJA_DECISION_BASIS = "culture-adjudication-decision";
export const CJA_SECRECY = "engine-internal";

/** CJA1 §3.2 identity encodings (the hashes are computed by the engine over the repository's canonical JSON). */
export const CJA_CAUSAL_PROCESS_PREFIX = "cjadj:trigger:v1:";
export const cjaDecisionId = (cultureUpdateId: string): string => `cjadj:v1:${cultureUpdateId}`;
export const cjaDecisionKey = (cultureUpdateId: string): string =>
  `adjudication-culture/${cultureUpdateId}/decision`;
export const cjaDecisionGroupId = (cultureUpdateId: string): string =>
  `cjadj:group:v1:${cultureUpdateId}`;
export const cjaDecisionIntentId = (cultureUpdateId: string): string =>
  `cjadj:intent:v1:${cultureUpdateId}`;

// ---------------------------------------------------------------------------------------------
// Canonical string validity (CJA1 §3.4)
// ---------------------------------------------------------------------------------------------

/**
 * CJA1 §3.4: ill-formed strings and lone-surrogate code units are refused BEFORE serialization — never escaped, replaced
 * or normalized. The repository's generic canonical JSON serializes a lone surrogate as an escape sequence, so it cannot be
 * relied on to refuse one.
 */
export function isWellFormedCjaString(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/** An `Id` that is also well-formed UTF-16 (no lone surrogate). */
const CjaIdent = Id.refine(isWellFormedCjaString, "lone surrogate code unit");

/** Authored explanatory text: non-empty, no surrounding whitespace, well-formed. It is carried, never interpreted. */
const CjaText = z
  .string()
  .min(1)
  .refine((s) => s === s.trim(), "text must not have surrounding whitespace")
  .refine(isWellFormedCjaString, "lone surrogate code unit");

const PositiveVersion = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

/** The 64-lowercase-hex `culture_update_id` (a SHA-256 digest). */
export const CjaUpdateIdSchema = Sha256;

// ---------------------------------------------------------------------------------------------
// References (CJA1 §§3.2, 6.1, 9.1)
// ---------------------------------------------------------------------------------------------

/** CJA1 §3.2: the ONE committed triggering foreign owner fact that materially raised the question. */
export const CjaTriggerRefSchema = z.strictObject({
  owner: CjaIdent,
  fact_key: CjaIdent,
  version: PositiveVersion,
  committed_by_group_id: CjaIdent,
});
export type CjaTriggerRef = z.infer<typeof CjaTriggerRefSchema>;

/**
 * CJA1 §4.2: the one lawful read basis an input was shown to the GM under at SEAL. Exactly one is carried: AS-OF-NOW
 * (after its owner's commit) or AS-OF-DECLARED-CLOSE naming the producer's close. The adapter never re-reads either.
 */
export const CjaInputReadSchema = z.discriminatedUnion("basis", [
  z.strictObject({ basis: z.literal("AS-OF-NOW") }),
  z.strictObject({ basis: z.literal("AS-OF-DECLARED-CLOSE"), close_basis: CloseBasisSchema }),
]);

/** CJA1 §6.1 source_refs[]: an immutable authoritative REFERENCE, never a wholesale foreign value. */
export const CjaSealedInputRefSchema = z.strictObject({
  owner: CjaIdent,
  fact_key: CjaIdent,
  version: PositiveVersion,
  read: CjaInputReadSchema,
  committed_by_group_id: CjaIdent,
});
export type CjaSealedInputRef = z.infer<typeof CjaSealedInputRefSchema>;

/** The (owner, key, version) a citation names. */
export const CjaCitationSchema = z.strictObject({
  owner: CjaIdent,
  fact_key: CjaIdent,
  version: PositiveVersion,
});
export type CjaCitation = z.infer<typeof CjaCitationSchema>;

/** CJA1 §6.1 context_ref: the sealed Social Update Context fact, its version and the group that committed it. */
export const CjaContextRefSchema = z.strictObject({
  owner: CjaIdent,
  fact_key: CjaIdent,
  version: PositiveVersion,
  committed_by_group_id: CjaIdent,
});
export type CjaContextRef = z.infer<typeof CjaContextRefSchema>;

/**
 * CJA1 §§5.1, 9.1 PORT B result as retained: the Population close-vouch attestation obtained AT SEAL. `live_population_admission`
 * is the literal `false` in this prerequisite — a test-owned stand-in can never be recorded as a live PCB-01 attestation
 * ("no spoofed live PCB-01 success is accepted"). `reconciliation` is `NOT_DUE` or a due reconciliation that has already
 * lawfully completed; a due-but-incomplete scope is not sealable and has no representation here.
 */
export const CjaCloseVouchSchema = z.strictObject({
  port: z.literal("PopulationCloseScopeVerifier"),
  live_population_admission: z.literal(false),
  reconciliation: z.enum(["NOT_DUE", "DUE_COMPLETED"]),
});
export type CjaCloseVouch = z.infer<typeof CjaCloseVouchSchema>;

/**
 * CJA1 §6.1 constituency_ref: the Cohort IDENTITY plus its seal-time close basis, fact version, committing group and the
 * close-vouch. NO copy of the Cohort's CURRENT-ONLY value, membership, count or roster (CJA1 §5.3).
 */
export const CjaConstituencyRefSchema = z.strictObject({
  cohort_fact_key: CjaIdent,
  cohort_version: PositiveVersion,
  committed_by_group_id: CjaIdent,
  close_basis: CloseBasisSchema,
  close_vouch: CjaCloseVouchSchema,
});
export type CjaConstituencyRef = z.infer<typeof CjaConstituencyRefSchema>;

/** The material cultural distinction (CJA1 §3.1 (a)): exactly referent × scope × context. */
export const CjaDistinctionSchema = z.strictObject({
  referent_key: CjaIdent,
  scope_key: CjaIdent,
  context_id: CjaIdent,
});
export type CjaDistinction = z.infer<typeof CjaDistinctionSchema>;

// ---------------------------------------------------------------------------------------------
// PORT A — CultureAdjudicationContextPort attestation (CJA1 §9.1)
// ---------------------------------------------------------------------------------------------

/**
 * What the context port attests for ONE culture_update_id: that a Social Update Context was lawfully sealed and where. It
 * attests provenance and identity — NOT that the evidence establishes any cultural outcome. The adapter treats it as a
 * claim to verify against the committed store, never as truth: the portable contract is fixed here without relying on any
 * unmerged Culture schema.
 */
export const CjaContextAttestationSchema = z.strictObject({
  context: CjaContextRefSchema,
  distinction: CjaDistinctionSchema,
  trigger_ref: CjaTriggerRefSchema,
  causal_process_id: CjaIdent,
  opportunity_id: CjaIdent,
  owner_operation_id: CjaIdent,
  /** the ordered sealed inputs, including the trigger */
  inputs: z.array(CjaSealedInputRefSchema).min(1),
  /** null when the context binds no Cohort constituency */
  constituency: CjaConstituencyRefSchema.nullable(),
  /** the material prospective consumer question/class — never its desired outcome (CJA1 §4.4) */
  consumer_question: CjaText,
});
export type CjaContextAttestation = z.infer<typeof CjaContextAttestationSchema>;

// ---------------------------------------------------------------------------------------------
// CJA-R1 — the adjudication record
// ---------------------------------------------------------------------------------------------

export const CJA_CLASSIFICATIONS = ["SUPPORTS", "CONTRADICTS", "LIMITS", "NOT_PROBATIVE"] as const;
export const CJA_FINDING_STATUSES = ["SATISFIED", "NOT_SATISFIED", "UNRESOLVED"] as const;
export const CJA_VERDICTS = [
  "ESTABLISH_SUPPORTED",
  "NOT_SUPPORTED",
  "UNRESOLVED",
  "DERIVE_WITHOUT_PERSISTENCE",
] as const;
export type CjaVerdict = (typeof CJA_VERDICTS)[number];

/** CJA1 §6.1 assessment[]: one entry per sealed input — a source-named classification with a textual reason. */
export const CjaAssessmentSchema = z.strictObject({
  ref: CjaCitationSchema,
  classification: z.enum(CJA_CLASSIFICATIONS),
  reason: CjaText,
});
export type CjaAssessment = z.infer<typeof CjaAssessmentSchema>;

/**
 * CJA1 §6.1/§6.2 admission finding A, B or C (Culture Draft v2 §2): an assessment, a reason, and sealed-input citations or a
 * specific explanation why none can apply. A bare checkmark / true flag has no representation.
 */
export const CjaFindingSchema = z
  .strictObject({
    status: z.enum(CJA_FINDING_STATUSES),
    reason: CjaText,
    citations: z.array(CjaCitationSchema),
    no_citation_reason: CjaText.nullable(),
  })
  .refine((f) => f.citations.length > 0 || f.no_citation_reason !== null, {
    message: "a finding cites sealed input(s) or gives a specific explanation why none can apply",
  });
export type CjaFinding = z.infer<typeof CjaFindingSchema>;

export const CjaFindingsSchema = z.strictObject({
  A: CjaFindingSchema,
  B: CjaFindingSchema,
  C: CjaFindingSchema,
});
export type CjaFindings = z.infer<typeof CjaFindingsSchema>;

/** CJA1 §6.1 culture_question: referent, context and the material prospective consumer question/class. */
export const CjaCultureQuestionSchema = z.strictObject({
  referent_key: CjaIdent,
  scope_key: CjaIdent,
  context_id: CjaIdent,
  consumer_question: CjaText,
});
export type CjaCultureQuestion = z.infer<typeof CjaCultureQuestionSchema>;

/** CJA1 §7.1: the operation PRECONDITION the judgment was produced under — explicitly NOT a verified human principal. */
export const CjaAdjudicationContextSchema = z.strictObject({
  role: z.literal(GM_ADJUDICATION_AUTHORITY.role),
  permission: z.literal(GM_ADJUDICATION_AUTHORITY.permission),
  basis: z.literal("TRUSTED_IN_PROCESS_PRECONDITION"),
});

/**
 * The AUTHORED judgment: what the (scripted, in this tranche) adjudicator authors over the sealed evidence. Everything
 * else in the record is copied by the adapter from the verified sealed-context attestation, so the adjudicator can neither
 * forge nor omit provenance. There is no field for a role, a permission, an identity other than `culture_update_id`, or a
 * Culture manifestation other than the opaque `candidate_manifestation`.
 */
export const CjaAuthoredJudgmentSchema = z.strictObject({
  culture_update_id: CjaUpdateIdSchema,
  rule_ref: SourceRefSchema,
  assessment: z.array(CjaAssessmentSchema),
  findings: CjaFindingsSchema,
  verdict: z.enum(CJA_VERDICTS),
  candidate_manifestation: CjaIdent.nullable(),
  material_uncertainty: CjaText.nullable(),
});
export type CjaAuthoredJudgment = z.infer<typeof CjaAuthoredJudgmentSchema>;

/**
 * CJA-R1: ONE immutable first-slice RC-09 record per genuine culture update, regardless of outcome. It is NOT a Culture-owned
 * meaning, a private belief or a world-state mutation. `owner_operation_id` is carried (beyond the §6.1 list) so the update
 * identity can be re-derived at load without the context port.
 */
export const CjaDecisionRecordSchema = z.strictObject({
  schema_version: z.literal(CJA_SCHEMA_VERSION),
  decision_id: CjaIdent,
  culture_update_id: CjaUpdateIdSchema,
  distinction_digest: Sha256,
  causal_process_id: CjaIdent,
  opportunity_id: z.literal(CJA_OPPORTUNITY_ID),
  owner_operation_id: CjaIdent,
  trigger_ref: CjaTriggerRefSchema,
  context_ref: CjaContextRefSchema,
  source_refs: z.array(CjaSealedInputRefSchema).min(1),
  constituency_ref: CjaConstituencyRefSchema.nullable(),
  rule_ref: SourceRefSchema,
  adjudication_context: CjaAdjudicationContextSchema,
  assessment: z.array(CjaAssessmentSchema),
  culture_question: CjaCultureQuestionSchema,
  candidate_manifestation: CjaIdent.nullable(),
  findings: CjaFindingsSchema,
  verdict: z.enum(CJA_VERDICTS),
  material_uncertainty: CjaText.nullable(),
});
export type CjaDecisionRecord = z.infer<typeof CjaDecisionRecordSchema>;

// ---------------------------------------------------------------------------------------------
// Refusal vocabulary (CJA1 §§7.3, 11)
// ---------------------------------------------------------------------------------------------

/**
 * Structural REFUSALs are never the adjudicator's substantive NOT_SUPPORTED / UNRESOLVED verdict (CJA1 §11). Foreign owner
 * version advances AFTER seal are not a refusal.
 */
export const CJA_REFUSAL_CODES = [
  /** wrong or missing trusted operation authority (checked FIRST, replay included) */
  "AUTHORITY_DENIED",
  /** malformed judgment: schema, ill-formed Unicode, non-plain JSON */
  "JUDGMENT_INPUT_INVALID",
  /** the trigger / update / decision identity is not the one §3 derives */
  "IDENTITY_INVALID",
  /** the attestation disagrees with the committed sealed context or with itself */
  "CONTEXT_MISMATCH",
  /** a citation's owner/key/version differs from the sealed reference */
  "CITATION_VERSION_MISMATCH",
  /** a sealed input has no historical commit-group proof in the sealed context's journaled group */
  "HISTORICAL_SOURCE_PROOF_MISSING",
  /** an input's read basis is invalid at seal */
  "CLOSE_BASIS_INVALID_AT_SEAL",
  /** the Cohort scope or its close-vouch is unsupported or invalid */
  "CONSTITUENCY_INVALID",
  /** the verdict contradicts the findings and assessments (CJA1 §6.3) */
  "JUDGMENT_INCOHERENT",
  /** a citation is outside the sealed inputs, an input is omitted/duplicated, or a downstream/self reference is cited */
  "CITATION_CLOSURE_VIOLATION",
  /** a changed judgment under the same immutable identity */
  "DECISION_CONFLICT",
  /** the supplied rule is not the registered rule/method */
  "RULE_MISMATCH",
  /** a committed record is malformed or cannot be re-derived */
  "DECISION_INTEGRITY_FAILURE",
] as const;
export type CjaRefusalCode = (typeof CJA_REFUSAL_CODES)[number];

/** Dependencies that are not (yet) available: dependent work stops; this is never a valid negative verdict. */
export const CJA_DEPENDENCY_UNRESOLVED_CODES = [
  "CONTEXT_ABSENT",
  "CONTEXT_PORT_UNAVAILABLE",
] as const;
export type CjaDependencyUnresolvedCode = (typeof CJA_DEPENDENCY_UNRESOLVED_CODES)[number];

/** CJA1 §7.3: the failure class of a code (`REFUSAL` or `DEPENDENCY_UNRESOLVED`). */
export const cjaFailureClass = (
  code: CjaRefusalCode | CjaDependencyUnresolvedCode,
): "REFUSAL" | "DEPENDENCY_UNRESOLVED" =>
  (CJA_DEPENDENCY_UNRESOLVED_CODES as readonly string[]).includes(code)
    ? "DEPENDENCY_UNRESOLVED"
    : "REFUSAL";
