import {
  CAUSAL_DRAW_ALGORITHM_ID,
  CAUSAL_DRAW_PRECOMMIT_BASIS,
  CAUSAL_DRAW_RESULT_BASIS,
  CAUSAL_DRAW_SECRECY,
  CausalDrawPrecommitSchema,
  causalDrawId,
  causalDrawPrecommitKey,
  fail,
  ok,
  type CausalDrawPrecommit,
  type CausalDrawRefusalCode,
  type CausalDrawResult,
  type OwnerFact,
  type Result,
} from "@immortalis/contracts";
import { cdCanon, cdDigest } from "./canon.ts";
import { normalizedSpecViolation } from "./prior.ts";
import { CAUSAL_DRAW_ALGORITHMS, type CausalDrawAlgorithm } from "./sampler.ts";

/**
 * One statement of each Causal Draw derivation rule, used by the adapter, IM-11 admission and load verification, so the
 * three cannot drift (the same shape as the other owners' `derive.ts`). Pure: no clock, no entropy, no store.
 */

/**
 * CDP-01 / CDO-01: the OwnerFact metadata of Causal Draw evidence is fixed per record kind — `unit = null`, the kind's
 * exact `basis` label, and `secrecy = "engine-internal"`. One statement of the rule, used by admission (a raw commit
 * cannot bypass it) and by load verification (persisted drift is not lawful evidence). Returns a message, or null.
 */
export function causalDrawMetadataViolation(
  kind: "causal_draw_precommit" | "causal_draw_result",
  meta: { readonly unit: string | null; readonly basis: string; readonly secrecy: string },
): string | null {
  if (meta.unit !== null) return "Causal Draw evidence has no unit: unit is null";
  const basis =
    kind === "causal_draw_precommit" ? CAUSAL_DRAW_PRECOMMIT_BASIS : CAUSAL_DRAW_RESULT_BASIS;
  if (meta.basis !== basis) return `the basis of this Causal Draw record is exactly "${basis}"`;
  if (meta.secrecy !== CAUSAL_DRAW_SECRECY) {
    return `Causal Draw evidence is engine-internal: secrecy is exactly "${CAUSAL_DRAW_SECRECY}"`;
  }
  return null;
}

/** A message when a precommit record is internally inconsistent with the `draw_key_digest` of its key, or null. */
export function precommitRecordViolation(
  p: CausalDrawPrecommit,
  drawKeyDigest: string,
): string | null {
  if (cdDigest(p.draw_key) !== drawKeyDigest) {
    return "the draw key does not hash to the digest in the key";
  }
  if (p.draw_id !== causalDrawId(drawKeyDigest)) return "draw_id is cdraw:v1:<draw_key_digest>";
  const spec = normalizedSpecViolation(p.normalized_spec);
  if (spec) return spec;
  if (cdCanon(p.normalized_spec.draw_key) !== cdCanon(p.draw_key)) {
    return "the normalized specification carries a different draw key";
  }
  if (p.spec_digest !== cdDigest(p.normalized_spec)) {
    return "spec_digest is not the digest of the normalized specification";
  }
  if (
    p.algorithm_id !== CAUSAL_DRAW_ALGORITHM_ID ||
    p.normalized_spec.algorithm_id !== p.algorithm_id
  ) {
    return "the precommit and its specification name different algorithms";
  }
  return null;
}

/**
 * CDO-01 / CDA-01: exactly the result record a committed precommit determines — re-derived from the committed seed,
 * never sampled again. `DRAW_ALGORITHM_UNSUPPORTED` when the algorithm the precommit recorded can no longer be executed
 * or verified by `algorithms`; `DRAW_INTEGRITY_FAILURE` when the precommit itself is malformed or inconsistent.
 */
export function deriveResultRecord(
  precommit: Pick<OwnerFact, "key" | "version" | "value" | "provenance">,
  drawKeyDigest: string,
  algorithms: ReadonlyMap<string, CausalDrawAlgorithm> = CAUSAL_DRAW_ALGORITHMS,
): Result<
  CausalDrawResult,
  Extract<CausalDrawRefusalCode, "DRAW_ALGORITHM_UNSUPPORTED" | "DRAW_INTEGRITY_FAILURE">
> {
  const parsed = CausalDrawPrecommitSchema.safeParse(precommit.value);
  if (!parsed.success)
    return fail("DRAW_INTEGRITY_FAILURE", "the committed precommit is malformed");
  const p = parsed.data;
  if (precommit.key !== causalDrawPrecommitKey(drawKeyDigest)) {
    return fail(
      "DRAW_INTEGRITY_FAILURE",
      "the precommit is not at the key its draw identity derives",
    );
  }
  const violation = precommitRecordViolation(p, drawKeyDigest);
  if (violation) return fail("DRAW_INTEGRITY_FAILURE", violation);
  const algorithm = algorithms.get(p.algorithm_id);
  if (!algorithm) {
    return fail(
      "DRAW_ALGORITHM_UNSUPPORTED",
      `${p.algorithm_id} can no longer be executed or verified; a committed draw is never resampled`,
    );
  }
  const derived = algorithm.derive({
    entropy_hex: p.entropy_hex,
    draw_key_digest: drawKeyDigest,
    spec_digest: p.spec_digest,
    candidates: p.normalized_spec.candidates,
  });
  return ok({
    draw_id: p.draw_id,
    spec_digest: p.spec_digest,
    precommit_key: precommit.key,
    precommit_version: precommit.version,
    precommit_committed_by: precommit.provenance.group_id,
    algorithm_id: p.algorithm_id,
    ...derived,
  });
}
