import { type CanonicalTime } from "@immortalis/contracts";

/**
 * F-014B §7 EXACT-PARTITION: equivalent partitioning must produce the identical substantive
 * transition. The only mechanic in this slice is exact integer elapsed coordinate, which is additive,
 * so the sum over any partition of a span equals the span — computed, then asserted, not assumed.
 *
 * `cuts` are execution slice points. They are pure execution detail: they are never persisted, never
 * identity, never a boundary, and never create a stage, opportunity or commit. Points outside the open
 * interval (from, to), and repeated points, subdivide nothing and are ignored.
 *
 * No APPROXIMATE-PARTITION behavior exists here and no tolerance is accepted, inferred or defaulted
 * (CAL-01 remains UNCALIBRATED).
 */
export function exactElapsed(
  from: CanonicalTime,
  to: CanonicalTime,
  cuts: readonly CanonicalTime[],
): number {
  if (from.unit !== to.unit || to.value < from.value) {
    throw new RangeError("exactElapsed: span is not a forward interval in one unit");
  }
  const inner = [
    ...new Set(
      cuts
        .filter((c) => c.unit === from.unit && c.value > from.value && c.value < to.value)
        .map((c) => c.value),
    ),
  ].sort((a, b) => a - b);
  const points = [from.value, ...inner, to.value];
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += (points[i] as number) - (points[i - 1] as number);
  if (sum !== to.value - from.value)
    throw new Error("exact partition violated: sum differs from span");
  return sum;
}
