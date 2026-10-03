import { z } from "zod";
import { Id, Sha256 } from "./ids.ts";
import { SourceRefSchema } from "./source-ref.ts";
import type { Authority } from "./commit.ts";

/**
 * F-027-CD1 — Causal Draw foundation: executable contracts.
 *
 * Governing implementation authority: F-027 v1.0 as COMPOSED with F-027-CD1 v1.0 (Causal Draw Implementation-Authority
 * Addendum), exact cleared native pin 2026-10-02T15:11:03.450Z (pinned in spec/f027/spec-lock.json
 * `implementation_authority_addenda`). Historical F-027 v1.0 is neither rewritten nor superseded.
 *
 * This module is NEUTRAL infrastructure: it fixes the shape of a draw identity (CDK-01), the owner-supplied bounded
 * prior (CDS-01), the two create-only provenance records (CDP-01, CDO-01) and the refusal vocabulary (CDR-01/02). It
 * knows no candidate meaning, no causal weighting, no resulting world-state effect, no grade, no EX semantics and no
 * owner-specific stochastic rule: a candidate is an opaque identifier and a weight is an opaque positive integer
 * (CDS-03). Nothing here is a game rule or a calibration.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet, labels and identities
// ---------------------------------------------------------------------------------------------

/** F-027-CD1 §3: the one infrastructure-only RC-09 evidence owner/facet. Not a substantive world-state owner. */
export const OWNER_CAUSAL_DRAW_KERNEL = "causal_draw_kernel";
export const FACET_DRAW_PROVENANCE = "draw_provenance";

/** CDS-01 / CDV-01: the one sampler that exists at this horizon. */
export const CAUSAL_DRAW_ALGORITHM_ID = "IMMORTALIS_WEIGHTED_FINITE_V1";
/** CDE-01: exactly 32 uniformly random bytes from a cryptographically secure source. */
export const CAUSAL_DRAW_ENTROPY_SOURCE_CLASS = "CSPRNG_256";
export const CAUSAL_DRAW_ENTROPY_BYTES = 32;

/** OwnerFact metadata fixed by CDP-01 / CDO-01. */
export const CAUSAL_DRAW_PRECOMMIT_BASIS = "causal-draw-precommit";
export const CAUSAL_DRAW_RESULT_BASIS = "causal-draw-result";
export const CAUSAL_DRAW_SECRECY = "engine-internal";

/**
 * CDE-01 / CDA-01 execute only under role.resolver + permission.resolution.execute (F-027-CD1 §3). Canonical publication
 * of the precommit/result CommitGroups executes only under role.archivist + permission.canon.write (CANON_WRITE_AUTHORITY).
 */
export const RESOLVER_AUTHORITY = {
  role: "role.resolver",
  permission: "permission.resolution.execute",
} as const satisfies Authority;

/** `cdraw:v1:<draw_key_digest>` (CDK-02). */
export const causalDrawId = (drawKeyDigest: string): string => `cdraw:v1:${drawKeyDigest}`;
/** CDP-01 canonical key (SEALED / create-only). */
export const causalDrawPrecommitKey = (drawKeyDigest: string): string =>
  `causal-draw/${drawKeyDigest}/precommit`;
/** CDO-01 canonical key (SEALED / create-only). */
export const causalDrawResultKey = (drawKeyDigest: string): string =>
  `causal-draw/${drawKeyDigest}/result`;
/** RC-16 identities (CDP-01 / CDO-01). The cause of both groups is the canonical draw_id. */
export const causalDrawPrecommitGroupId = (drawKeyDigest: string): string =>
  `cdraw:precommit:group:v1:${drawKeyDigest}`;
export const causalDrawPrecommitIntentId = (drawKeyDigest: string): string =>
  `cdraw:precommit:intent:v1:${drawKeyDigest}`;
export const causalDrawResultGroupId = (drawKeyDigest: string): string =>
  `cdraw:result:group:v1:${drawKeyDigest}`;
export const causalDrawResultIntentId = (drawKeyDigest: string): string =>
  `cdraw:result:intent:v1:${drawKeyDigest}`;

// ---------------------------------------------------------------------------------------------
// CD-CANON-1 string validity
// ---------------------------------------------------------------------------------------------

/**
 * CD-CANON-1 (CDK-02): a lone surrogate code unit is invalid (not escaped, not replaced). The repository's generic
 * canonical JSON helper serializes one as an escape sequence, so it cannot be relied on to refuse it.
 */
export function isWellFormedString(s: string): boolean {
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

/** An `Id` that is also CD-CANON-1-valid (no lone surrogate). */
const DrawIdent = Id.refine(isWellFormedString, "lone surrogate code unit");

// ---------------------------------------------------------------------------------------------
// CDK-01 — CausalDrawKey v1
// ---------------------------------------------------------------------------------------------

/**
 * Exactly four identity dimensions. A request, retry, message, checkpoint, partition, horizon, source-version, model,
 * provider, narration, UI or recency dimension is forbidden and unrepresentable (strict).
 */
export const CausalDrawKeySchema = z.strictObject({
  causal_process_id: DrawIdent,
  opportunity_id: DrawIdent,
  owner_operation: z.strictObject({ owner: DrawIdent, operation: DrawIdent }),
  prospective_result_id: DrawIdent,
});
export type CausalDrawKey = z.infer<typeof CausalDrawKeySchema>;

// ---------------------------------------------------------------------------------------------
// CDS-01 — CausalDrawSpecification v1
// ---------------------------------------------------------------------------------------------

/** JSON integer in 1..9007199254740991. */
export const PositiveSafeIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

/** Base-10 string `^[1-9][0-9]*$`: no zero, sign, decimal point, exponent, NaN/infinity or floating point. */
export const PositiveIntegerStringSchema = z.string().regex(/^[1-9][0-9]*$/);
/** Canonical nonnegative integer decimal string (`0` or no leading zero). */
export const NonnegativeIntegerStringSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);

/** A committed fact the prior was computed from, pinned at one exact version. */
export const CausalDrawInputRefSchema = z.strictObject({
  owner: DrawIdent,
  fact_key: DrawIdent,
  version: PositiveSafeIntegerSchema,
  /**
   * The group that committed that version (the OwnerFact's provenance `group_id`), the same reference kind the
   * result record keeps as `precommit_committed_by`.
   */
  committed_by: DrawIdent,
});
export type CausalDrawInputRef = z.infer<typeof CausalDrawInputRefSchema>;

/** An opaque candidate identifier with an opaque relative causal weight. Never a percentage, never a score. */
export const CausalDrawCandidateSchema = z.strictObject({
  candidate_id: DrawIdent,
  weight: PositiveIntegerStringSchema,
});
export type CausalDrawCandidate = z.infer<typeof CausalDrawCandidateSchema>;

export const CausalDrawAlgorithmIdSchema = z.literal(CAUSAL_DRAW_ALGORITHM_ID);

/**
 * The owner-supplied bounded prior as presented by the caller. The candidate-set cardinality rules (empty, singleton,
 * duplicate) are CDR-01 refusals with their own codes, so this schema deliberately has no `.min` on `candidates`.
 */
export const CausalDrawSpecificationSchema = z.strictObject({
  draw_key: CausalDrawKeySchema,
  owner_rule_ref: SourceRefSchema,
  input_refs: z.array(CausalDrawInputRefSchema),
  candidates: z.array(CausalDrawCandidateSchema),
  algorithm_id: CausalDrawAlgorithmIdSchema,
});
export type CausalDrawSpecification = z.infer<typeof CausalDrawSpecificationSchema>;

// ---------------------------------------------------------------------------------------------
// CDP-01 — the SEALED / create-only precommit record
// ---------------------------------------------------------------------------------------------

export const CausalDrawIdSchema = z.string().regex(/^cdraw:v1:[0-9a-f]{64}$/);

export const CausalDrawPrecommitSchema = z.strictObject({
  draw_id: CausalDrawIdSchema,
  draw_key: CausalDrawKeySchema,
  spec_digest: Sha256,
  /** the full normalized CausalDrawSpecification (CDS-02) */
  normalized_spec: CausalDrawSpecificationSchema,
  /** exactly 64 lowercase hexadecimal characters: the 32 seed bytes. Engine-internal; never projected (RC-14). */
  entropy_hex: z.string().regex(/^[0-9a-f]{64}$/),
  entropy_source_class: z.literal(CAUSAL_DRAW_ENTROPY_SOURCE_CLASS),
  algorithm_id: CausalDrawAlgorithmIdSchema,
});
export type CausalDrawPrecommit = z.infer<typeof CausalDrawPrecommitSchema>;

// ---------------------------------------------------------------------------------------------
// CDO-01 — the SEALED / create-only result record
// ---------------------------------------------------------------------------------------------

export const CausalDrawResultSchema = z.strictObject({
  draw_id: CausalDrawIdSchema,
  spec_digest: Sha256,
  precommit_key: DrawIdent,
  precommit_version: PositiveSafeIntegerSchema,
  precommit_committed_by: DrawIdent,
  algorithm_id: CausalDrawAlgorithmIdSchema,
  total_weight: PositiveIntegerStringSchema,
  accepted_sample: NonnegativeIntegerStringSchema,
  rejected_attempts: NonnegativeIntegerStringSchema,
  selected_candidate_id: DrawIdent,
});
export type CausalDrawResult = z.infer<typeof CausalDrawResultSchema>;

// ---------------------------------------------------------------------------------------------
// Refusal vocabulary (CDR-01, CDR-02, CDV-01)
// ---------------------------------------------------------------------------------------------

/** Every refusal code F-027-CD1 names, plus the one integrity-failure class §12 requires ("not a reason to sample again"). */
export const CAUSAL_DRAW_REFUSAL_CODES = [
  "DRAW_INPUT_INVALID",
  "DRAW_CANDIDATE_DUPLICATE",
  "DRAW_CANDIDATE_SET_EMPTY",
  "DRAW_NOT_REQUIRED_SINGLETON",
  "DRAW_IDENTITY_CONFLICT",
  "DRAW_STATE_CONFLICT",
  "DRAW_NOT_REQUIRED_ALREADY_ESTABLISHED",
  "DRAW_INPUT_REF_UNRESOLVED",
  "DRAW_INPUT_REF_STALE_AT_PRECOMMIT",
  "DRAW_OWNER_RULE_STALE_AT_PRECOMMIT",
  "DRAW_ENTROPY_UNAVAILABLE",
  "DRAW_ALGORITHM_UNSUPPORTED",
  /** a committed record is malformed or cannot be re-derived: never a reason to sample again (§12) */
  "DRAW_INTEGRITY_FAILURE",
] as const;
export type CausalDrawRefusalCode = (typeof CAUSAL_DRAW_REFUSAL_CODES)[number];
