import { createHmac } from "node:crypto";
import {
  CAUSAL_DRAW_ALGORITHM_ID,
  CAUSAL_DRAW_ENTROPY_BYTES,
  type CausalDrawCandidate,
} from "@immortalis/contracts";

/**
 * CDA-01 — `IMMORTALIS_WEIGHTED_FINITE_V1`, exactly as specified. Exact, unbiased, floating-point free and independent of
 * caller order: candidates arrive already normalized and in canonical order.
 *
 *   W = sum of normalized weights (>= 2);  b = smallest positive integer with 2^b >= W;  k = ceil(b / 8).
 *   For attempt a = 0, 1, 2, ...: block j = HMAC-SHA-256(key = the 32 raw seed bytes,
 *   message = UTF-8 "IMMORTALIS-CDRAW-WEIGHTED-FINITE-V1|<draw_key_digest>|<spec_digest>|<a>|<j>"), concatenated in
 *   ascending j until at least k bytes exist; the first k bytes; the unused high-order bits of the first byte cleared so
 *   exactly b random bits remain; X = big-endian unsigned integer. If X >= W the ATTEMPT is rejected (internal rejection
 *   sampling, not an in-world reroll) and a+1 is tried; otherwise R = X. Candidate i owns the half-open interval
 *   [w1+..+w(i-1), w1+..+wi); the unique candidate whose interval contains R is selected.
 *
 * There is no attempt cap: truncating would be a different algorithm. Each attempt is rejected with probability < 1/2.
 */
export interface WeightedDerivation {
  readonly total_weight: string;
  readonly accepted_sample: string;
  readonly rejected_attempts: string;
  readonly selected_candidate_id: string;
}

export interface WeightedDerivationInput {
  /** the 32 committed seed bytes as 64 lowercase hexadecimal characters */
  readonly entropy_hex: string;
  readonly draw_key_digest: string;
  readonly spec_digest: string;
  /** normalized, in canonical (UTF-16 code-unit) order */
  readonly candidates: readonly CausalDrawCandidate[];
}

const MESSAGE_PREFIX = "IMMORTALIS-CDRAW-WEIGHTED-FINITE-V1";

export function deriveWeightedFiniteV1(input: WeightedDerivationInput): WeightedDerivation {
  const seed = Buffer.from(input.entropy_hex, "hex");
  if (seed.length !== CAUSAL_DRAW_ENTROPY_BYTES || !/^[0-9a-f]{64}$/.test(input.entropy_hex)) {
    throw new RangeError(
      "the committed seed is exactly 32 bytes (64 lowercase hexadecimal characters)",
    );
  }
  if (input.candidates.length < 2) throw new RangeError("a draw needs at least two candidates");
  const weights = input.candidates.map((c) => BigInt(c.weight));
  const total = weights.reduce((a, b) => a + b, 0n);
  const bits = (total - 1n).toString(2).length; // smallest b >= 1 with 2^b >= W, for W >= 2
  const bytes = Math.ceil(bits / 8);
  const extraBits = bits % 8;
  const mask = extraBits === 0 ? 0xff : (1 << extraBits) - 1;

  for (let attempt = 0n; ; attempt++) {
    const blocks: Buffer[] = [];
    let have = 0;
    for (let j = 0; have < bytes; j++) {
      const block = createHmac("sha256", seed)
        .update(
          `${MESSAGE_PREFIX}|${input.draw_key_digest}|${input.spec_digest}|${attempt.toString()}|${j}`,
          "utf8",
        )
        .digest();
      blocks.push(block);
      have += block.length;
    }
    const sample = Buffer.concat(blocks).subarray(0, bytes);
    sample[0] = sample[0]! & mask;
    const x = BigInt(`0x${sample.toString("hex")}`);
    if (x >= total) continue;

    let cumulative = 0n;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i]!;
      if (x < cumulative) {
        return {
          total_weight: total.toString(),
          accepted_sample: x.toString(),
          rejected_attempts: attempt.toString(),
          selected_candidate_id: input.candidates[i]!.candidate_id,
        };
      }
    }
    throw new Error("unreachable: a sample below the total weight lies in exactly one interval");
  }
}

/**
 * CDV-01: the registry of samplers this build can still EXECUTE or VERIFY, keyed by the algorithm identity every
 * committed draw records. A later build may stop creating new draws under an algorithm only once an explicitly
 * authorized successor exists; it must keep verifying historical records or fail closed as DRAW_ALGORITHM_UNSUPPORTED.
 * It may never re-interpret or resample a historical draw under another algorithm.
 */
export interface CausalDrawAlgorithm {
  readonly id: string;
  derive(input: WeightedDerivationInput): WeightedDerivation;
}

export const CAUSAL_DRAW_ALGORITHMS: ReadonlyMap<string, CausalDrawAlgorithm> = new Map([
  [
    CAUSAL_DRAW_ALGORITHM_ID,
    { id: CAUSAL_DRAW_ALGORITHM_ID, derive: deriveWeightedFiniteV1 } as CausalDrawAlgorithm,
  ],
]);
