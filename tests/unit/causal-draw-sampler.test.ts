// CDA-01 `IMMORTALIS_WEIGHTED_FINITE_V1`: exact, unbiased, float-free weighted selection from a committed 32-byte seed.
// Known-answer vectors come from an INDEPENDENT Python reference written from the addendum text (HMAC-SHA-256 keyed by
// the raw seed, the exact message, bit masking, big-endian integer, internal rejection sampling, cumulative intervals).
// Register lineage: IA-30 (partial); F-027-CD1 CDA-01, CDV-01. Spec lock f027 + addendum F-027-CD1.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CAUSAL_DRAW_ALGORITHMS,
  deriveWeightedFiniteV1,
  type WeightedDerivationInput,
} from "@immortalis/engine";

const SEEDS = {
  s1: "00".repeat(31) + "01",
  s2: "a5".repeat(32),
  s3: "ff".repeat(32),
  s4: "0123456789abcdef".repeat(4),
} as const;
const KEY = "33c23f6eb7e19aba0e681bd9bb4a9470f26e44d1782f9716b25c30def5b00ebf";
const SPEC = "2418d1c035ab8549b6f262099d120589fc6da4384701520cacbf8ab134ad9da8";
const katCandidates = [
  { candidate_id: "alpha", weight: "1" },
  { candidate_id: "mid", weight: "2" },
  { candidate_id: "zeta", weight: "3" },
];
const derive = (
  seed: string,
  candidates: WeightedDerivationInput["candidates"],
  key = KEY,
  spec = SPEC,
) =>
  deriveWeightedFiniteV1({
    entropy_hex: seed,
    draw_key_digest: key,
    spec_digest: spec,
    candidates,
  });
const cands = (weights: readonly (number | bigint)[]) =>
  weights.map((w, i) => ({ candidate_id: `c${String(i).padStart(2, "0")}`, weight: w.toString() }));

describe("known answers from the independent reference", () => {
  it("the addendum-shaped prior (W = 6, 3 candidates) with four seeds, including an internal rejection", () => {
    expect(derive(SEEDS.s1, katCandidates)).toEqual({
      total_weight: "6",
      accepted_sample: "0",
      rejected_attempts: "1",
      selected_candidate_id: "alpha",
    });
    expect(derive(SEEDS.s2, katCandidates)).toEqual({
      total_weight: "6",
      accepted_sample: "4",
      rejected_attempts: "0",
      selected_candidate_id: "zeta",
    });
    expect(derive(SEEDS.s3, katCandidates)).toEqual({
      total_weight: "6",
      accepted_sample: "5",
      rejected_attempts: "0",
      selected_candidate_id: "zeta",
    });
    expect(derive(SEEDS.s4, katCandidates)).toEqual({
      total_weight: "6",
      accepted_sample: "0",
      rejected_attempts: "0",
      selected_candidate_id: "alpha",
    });
  });

  // [name, weights, seed] -> [accepted_sample, rejected_attempts, selected] with d…d / e…e as the two digests
  const table: [string, (number | bigint)[], keyof typeof SEEDS, string, string, string][] = [
    ["W=2", [1, 1], "s1", "0", "0", "c00"],
    ["W=2", [1, 1], "s2", "1", "0", "c01"],
    ["W=3", [1, 2], "s2", "0", "1", "c00"],
    ["W=3", [1, 2], "s4", "1", "0", "c01"],
    ["W=7", [3, 4], "s2", "0", "1", "c00"],
    ["W=255 (b=8: no bits cleared)", [100, 155], "s1", "188", "0", "c01"],
    ["W=256 (b=8)", [100, 156], "s2", "215", "0", "c01"],
    ["W=257 (b=9, k=2: high bits of the first byte cleared)", [100, 157], "s1", "99", "0", "c00"],
    ["W=257", [100, 157], "s2", "69", "1", "c00"],
    ["W=257", [100, 157], "s4", "122", "4", "c01"],
    ["W=65537", [1, 65536], "s2", "17738", "1", "c01"],
    ["W=65537", [1, 65536], "s4", "31425", "4", "c01"],
    [
      "W=2^300+1 (k=38 bytes: TWO HMAC blocks per attempt)",
      [1n, 2n ** 300n],
      "s1",
      "1616315639509300259291701325239837387927253127467728496781838749980983915609521296138444167",
      "3",
      "c01",
    ],
    [
      "W=2^300+1",
      [1n, 2n ** 300n],
      "s4",
      "1747232050263872707050712907903300212004707238223775280379700030444002280940627650824857660",
      "0",
      "c01",
    ],
  ];
  it.each(table)("%s / %s", (_name, weights, seed, sample, rejected, selected) => {
    const d = derive(SEEDS[seed], cands(weights), "d".repeat(64), "e".repeat(64));
    expect(d.accepted_sample).toBe(sample);
    expect(d.rejected_attempts).toBe(rejected);
    expect(d.selected_candidate_id).toBe(selected);
    expect(d.total_weight).toBe(weights.reduce((a, b) => BigInt(a) + BigInt(b), 0n).toString());
  });
});

describe("the algorithm's structure", () => {
  it("is a pure function of (seed, draw_key_digest, spec_digest, normalized weights): repeatable, and each input matters", () => {
    const base = derive(SEEDS.s2, katCandidates);
    expect(derive(SEEDS.s2, katCandidates)).toEqual(base);
    const other = [
      derive(SEEDS.s2, katCandidates, "1".repeat(64)),
      derive(SEEDS.s2, katCandidates, KEY, "2".repeat(64)),
      derive(SEEDS.s3, katCandidates),
    ];
    // over a 3-way draw a single changed input could coincide; use a wide prior so a coincidence is negligible
    const wide = cands(Array.from({ length: 64 }, () => 1));
    const w = derive(SEEDS.s2, wide);
    expect(derive(SEEDS.s2, wide, "1".repeat(64)).accepted_sample).not.toBe(w.accepted_sample);
    expect(derive(SEEDS.s2, wide, KEY, "2".repeat(64)).accepted_sample).not.toBe(w.accepted_sample);
    expect(derive(SEEDS.s3, wide).accepted_sample).not.toBe(w.accepted_sample);
    expect(other).toHaveLength(3);
  });

  it("selects by half-open cumulative intervals in the given canonical order", () => {
    // R is always the accepted sample: candidate i owns [w1+..+w(i-1), w1+..+wi)
    for (let i = 0; i < 200; i++) {
      const seed = createHash("sha256").update(`interval-${i}`).digest("hex");
      const weights = [3, 1, 4, 1, 5];
      const d = derive(seed, cands(weights));
      const r = Number(d.accepted_sample);
      let lo = 0;
      let expected = "";
      weights.forEach((w, idx) => {
        if (r >= lo && r < lo + w) expected = `c${String(idx).padStart(2, "0")}`;
        lo += w;
      });
      expect(d.selected_candidate_id).toBe(expected);
      expect(r).toBeLessThan(14);
    }
  });

  it("never emits a sample at or above the total weight, for every bit-width boundary", () => {
    for (const total of [2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 255, 256, 257, 4095, 4096, 4097]) {
      for (let i = 0; i < 40; i++) {
        const seed = createHash("sha256").update(`bound-${total}-${i}`).digest("hex");
        const d = derive(seed, cands([1, total - 1]));
        expect(BigInt(d.accepted_sample) < BigInt(total), `W=${total}`).toBe(true);
      }
    }
  });

  it("internal rejection sampling is real and bounded in practice: some seeds reject, none need many attempts", () => {
    let rejections = 0;
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      const seed = createHash("sha256").update(`reject-${i}`).digest("hex");
      const d = derive(seed, cands([1, 2, 2])); // W = 5, b = 3: P(reject) = 3/8
      const n = Number(d.rejected_attempts);
      rejections += n;
      worst = Math.max(worst, n);
    }
    expect(rejections).toBeGreaterThan(0);
    expect(worst).toBeLessThan(40);
  });

  it("is exactly unbiased: over deterministic seeds the accepted sample is uniform on [0, W), including a non-power-of-two W", () => {
    const W = 6;
    const counts = new Array<number>(W).fill(0);
    const N = 12000;
    for (let i = 0; i < N; i++) {
      const seed = createHash("sha256").update(`uniform-${i}`).digest("hex");
      counts[Number(derive(seed, cands([1, 2, 3])).accepted_sample)]!++;
    }
    const expected = N / W;
    const sigma = Math.sqrt(N * (1 / W) * (1 - 1 / W));
    for (const c of counts) expect(Math.abs(c - expected)).toBeLessThan(5 * sigma);
  });

  it("a weighted prior selects each candidate in proportion to its weight (no renormalization, no floating point)", () => {
    const weights = [1, 2, 7];
    const hits = [0, 0, 0];
    const N = 10000;
    for (let i = 0; i < N; i++) {
      const seed = createHash("sha256").update(`prop-${i}`).digest("hex");
      const idx = Number(derive(seed, cands(weights)).selected_candidate_id.slice(1));
      hits[idx]!++;
    }
    weights.forEach((w, i) => {
      const p = w / 10;
      expect(Math.abs(hits[i]! - N * p)).toBeLessThan(5 * Math.sqrt(N * p * (1 - p)));
    });
  });

  it("rejects a seed that is not exactly 32 lowercase-hex bytes, and a prior with fewer than two candidates", () => {
    for (const bad of [
      "",
      "00",
      "00".repeat(31),
      "00".repeat(33),
      "A5".repeat(32),
      "zz".repeat(32),
    ]) {
      expect(() => derive(bad, katCandidates), JSON.stringify(bad)).toThrow(RangeError);
    }
    expect(() => derive(SEEDS.s1, cands([5]))).toThrow(RangeError);
    expect(() => derive(SEEDS.s1, [])).toThrow(RangeError);
  });
});

describe("CDV-01: the algorithm registry", () => {
  it("registers exactly IMMORTALIS_WEIGHTED_FINITE_V1, which is the function above", () => {
    expect([...CAUSAL_DRAW_ALGORITHMS.keys()]).toEqual(["IMMORTALIS_WEIGHTED_FINITE_V1"]);
    const a = CAUSAL_DRAW_ALGORITHMS.get("IMMORTALIS_WEIGHTED_FINITE_V1")!;
    expect(
      a.derive({
        entropy_hex: SEEDS.s2,
        draw_key_digest: KEY,
        spec_digest: SPEC,
        candidates: katCandidates,
      }),
    ).toEqual(derive(SEEDS.s2, katCandidates));
  });
});
