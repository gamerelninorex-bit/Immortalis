import {
  CausalDrawSpecificationSchema,
  causalDrawId,
  fail,
  ok,
  type CausalDrawRefusalCode,
  type CausalDrawSpecification,
  type Failure,
  type Result,
} from "@immortalis/contracts";
import { cdCanon, cdDigest, containsLoneSurrogate } from "./canon.ts";

/**
 * The deterministic front half of CDR-01: structural validation (step 1) and CDS-02 normalization with the three
 * identities (step 2). Pure: no clock, no entropy, no store, no write. Nothing here decides what a candidate means,
 * why a weight has its value, or whether the owner's causal judgment is sound (CDR-01 last paragraph).
 */
export type Refusal = Failure<CausalDrawRefusalCode>;
const refuse = (code: CausalDrawRefusalCode, message: string, details?: Record<string, unknown>) =>
  fail(code, message, details);

const byUtf16 = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * CDR-01 step 1. Order: lone surrogate / malformed material (`DRAW_INPUT_INVALID`, covering the draw key, SourceRef,
 * input-ref shape, candidate-ID grammar, weight grammar and an exactly duplicated input ref), then duplicate candidate
 * IDs, then an empty set, then a singleton. No hashing, entropy or durable write occurs on any of these refusals.
 */
export function validateSpecification(
  input: unknown,
): Result<CausalDrawSpecification, Refusal["code"]> {
  if (containsLoneSurrogate(input)) {
    return refuse("DRAW_INPUT_INVALID", "CD-CANON-1 refuses a lone surrogate code unit");
  }
  const parsed = CausalDrawSpecificationSchema.safeParse(input);
  if (!parsed.success) {
    return refuse("DRAW_INPUT_INVALID", "the specification is malformed", {
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const spec = parsed.data;
  const seenRefs = new Set<string>();
  for (const ref of spec.input_refs) {
    const encoded = cdCanon(ref);
    if (seenRefs.has(encoded)) {
      return refuse("DRAW_INPUT_INVALID", "an input ref is listed more than once");
    }
    seenRefs.add(encoded);
  }
  const ids = new Set<string>();
  for (const c of spec.candidates) {
    if (ids.has(c.candidate_id)) {
      return refuse("DRAW_CANDIDATE_DUPLICATE", "a candidate id is listed more than once");
    }
    ids.add(c.candidate_id);
  }
  if (spec.candidates.length === 0) {
    return refuse("DRAW_CANDIDATE_SET_EMPTY", "the candidate set is empty");
  }
  if (spec.candidates.length === 1) {
    return refuse("DRAW_NOT_REQUIRED_SINGLETON", "a one-candidate set is already determined");
  }
  return ok(spec);
}

const gcd = (a: bigint, b: bigint): bigint => {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
};

/**
 * CDS-02 on an already valid specification: weights are arbitrary-precision positive integers divided by their greatest
 * common divisor; candidates are sorted ascending by exact `candidate_id` in UTF-16 code-unit order; `input_refs[]` are
 * sorted ascending by UTF-16 code-unit order of their complete CD-CANON-1 encoded strings (never locale or UTF-8 byte
 * order). `{A:1,B:2}` and `{B:4,A:2}` therefore normalize to the same prior.
 */
export function normalizeSpecification(spec: CausalDrawSpecification): CausalDrawSpecification {
  const weights = spec.candidates.map((c) => BigInt(c.weight));
  const divisor = weights.reduce(gcd);
  const candidates = spec.candidates
    .map((c) => ({ candidate_id: c.candidate_id, weight: (BigInt(c.weight) / divisor).toString() }))
    .sort((a, b) => byUtf16(a.candidate_id, b.candidate_id));
  const input_refs = spec.input_refs
    .map((ref) => ({ encoded: cdCanon(ref), ref: { ...ref } }))
    .sort((a, b) => byUtf16(a.encoded, b.encoded))
    .map((e) => e.ref);
  return {
    draw_key: {
      causal_process_id: spec.draw_key.causal_process_id,
      opportunity_id: spec.draw_key.opportunity_id,
      owner_operation: { ...spec.draw_key.owner_operation },
      prospective_result_id: spec.draw_key.prospective_result_id,
    },
    owner_rule_ref: spec.owner_rule_ref,
    input_refs,
    candidates,
    algorithm_id: spec.algorithm_id,
  };
}

export interface PreparedPrior {
  readonly normalized: CausalDrawSpecification;
  /** SHA-256(UTF8(CD-CANON-1(CausalDrawKey))) */
  readonly draw_key_digest: string;
  /** `cdraw:v1:<draw_key_digest>` */
  readonly draw_id: string;
  /** SHA-256(UTF8(CD-CANON-1(normalized_spec))) */
  readonly spec_digest: string;
}

/** CDR-01 step 2: normalize a valid specification and compute `draw_key_digest`, `draw_id` and `spec_digest`. */
export function preparePrior(spec: CausalDrawSpecification): PreparedPrior {
  const normalized = normalizeSpecification(spec);
  const draw_key_digest = cdDigest(normalized.draw_key);
  return {
    normalized,
    draw_key_digest,
    draw_id: causalDrawId(draw_key_digest),
    spec_digest: cdDigest(normalized),
  };
}

/**
 * Whether a persisted `normalized_spec` is a lawful, already-normalized specification (at least two distinct
 * candidates, gcd-reduced weights, canonical orders, no duplicate input ref). Used by admission and load verification
 * so they cannot drift from the gate. Returns a message, or null.
 */
export function normalizedSpecViolation(spec: unknown): string | null {
  const valid = validateSpecification(spec);
  if (!valid.ok)
    return `the normalized specification is not a lawful specification: ${valid.error.code}`;
  const again = normalizeSpecification(valid.value);
  return cdCanon(again) === cdCanon(valid.value)
    ? null
    : "the specification is not in CDS-02 normal form";
}
