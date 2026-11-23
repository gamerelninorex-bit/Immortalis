# B2-T11 — what the W2 fence costs the common path (re-measured at repair 1)

**No target is asserted or invented.** The brief sources none, so nothing here passes or fails on a number. This page records what was measured so a
reviewer can read it, and what was not measured. All figures are `UNRUN` for anything outside this synthetic harness. It was re-measured after repair 1
(`repair-1.md`), which added a constant-time claim check to the fence; the structural counts did not move.

## Method (matched, immutable base)

- ONE file, `tests/integration/fixtures/b2-bench.ts`, **byte-identical in both trees** (SHA-256 `d10955a2…cfe`, checked in both).
- Base tree: `git archive 940a1ca29b34af8488c9ea3ea2f1903aeba52660` extracted into an isolated directory with its own copy of `node_modules`; the workspace
  links were verified to resolve inside that directory (`readlink -f`), so the base run cannot have loaded head code. Head tree: this branch at repair 1.
- Same machine, same Node (`v22.23.5`), idle apart from the benchmark, base and head **interleaved** 6 times each. Each cell below is
  the median of those 6 per-run medians.
- Only APIs that exist in both trees are used (the production canonical admission under the fixture seam, the file package, the synthetic extension owner).
  The work counters are read only when the tree has them (head only).
- Axes: unrelated dormant owner facts (0 / 1 / 100) × verified history length (0 / 130 / 300 groups) around an ORDINARY commit (one that touches no custody),
  a warm checkpoint open, a strict cold open (`audit`), and the explicit POLICY-TRANSITION open.

## Results (median over 6 interleaved runs: base ms / head ms (head ÷ base))

| dormant facts | history groups | ordinary commit, median | ordinary commit, p95 | warm checkpoint open    | strict cold open        |
| ------------- | -------------- | ----------------------- | -------------------- | ----------------------- | ----------------------- |
| 0             | 0              | 3.12 / 3.58 (1.146)     | 4.63 / 5.03 (1.086)  | 54.89 / 79.59 (1.45)    | 39.16 / 46.67 (1.192)   |
| 0             | 130            | 4.84 / 4.96 (1.027)     | 7.15 / 6.63 (0.927)  | 132.69 / 136.69 (1.03)  | 169.17 / 179.78 (1.063) |
| 0             | 300            | 7.18 / 6.32 (0.88)      | 9.36 / 9.0 (0.961)   | 240.07 / 224.02 (0.933) | 326.47 / 348.86 (1.069) |
| 1             | 0              | 3.31 / 3.06 (0.925)     | 4.79 / 4.32 (0.902)  | 34.43 / 35.22 (1.023)   | 33.25 / 41.99 (1.263)   |
| 1             | 130            | 4.94 / 4.83 (0.976)     | 6.95 / 6.55 (0.943)  | 131.89 / 126.91 (0.962) | 159.99 / 175.7 (1.098)  |
| 1             | 300            | 6.89 / 6.53 (0.948)     | 8.69 / 8.68 (0.999)  | 221.85 / 234.02 (1.055) | 328.71 / 332.91 (1.013) |
| 100           | 0              | 4.45 / 4.69 (1.054)     | 6.71 / 7.04 (1.05)   | 89.07 / 91.95 (1.032)   | 137.64 / 148.84 (1.081) |
| 100           | 130            | 5.69 / 5.66 (0.995)     | 10.11 / 9.32 (0.922) | 150.09 / 162.71 (1.084) | 281.7 / 312.23 (1.108)  |
| 100           | 300            | 6.98 / 6.93 (0.993)     | 8.91 / 8.43 (0.946)  | 261.29 / 244.66 (0.936) | 449.16 / 440.09 (0.98)  |

Reading: the ratios scatter on both sides of 1 (range 0.88 to 1.45 over all cells and the four statistics; the median of the 27 ratios for commit median,
warm open and strict cold open is 1.03) with no trend in either axis. The one cell that stands out, the smallest (0 dormant, 0 history) warm
open, is a ~55 ms measurement whose base runs were tight (54 to 57 ms) and whose six head runs all lay above them (58 to 91 ms). It was not left as a bare number: the same cell
was repeated six times inside ONE process, three interleaved pairs (`measurements-raw/repeat-cell-*`, script `b2-bench-repeat-cell.ts.txt`), and the head÷base ratio of
the warm open by repetition is **1.128, 0.963, 1.065, 0.944, 1.386, 1.176**: it falls on both sides of 1 and shows no steady-state difference. A larger code surface to load and warm is a plausible contributor to the first
repetition of a fresh process; it was not isolated, and the first cell of any run is its least stable. The harness cannot resolve a difference of a few
percent of a 3 to 7 ms commit or a 50 to 100 ms open; this page does not claim there is none.

## Structural evidence (deterministic, asserted by `tests/integration/b2-cost.test.ts`)

Across 40 ordinary commits the fence performed: `checks` 80, `keyInspections` 80, `advances` 40,
**`derivations` 0, `scannedFacts` 0, `rederivations` 0**. That is two constant-time key-prefix inspections per
commit (the core's and the owner admission's), plus, since repair 1, one cause-prefix test and a scan of that group's own `depends_on` per inspection, and no scan of the
dormant facts or of the verified history. The only O(facts) pass is the one derivation when a core is built, and a strict replay re-derives the fence incrementally per committed group.

## The one cost B2 does add: a policy transition

B2 appends a verifier-identity segment, so a package earned under the previous identity is replayed strictly ONCE on its first open and re-stamped; the next open
trusts it again. This is the repository's existing policy-transition mechanism, used here exactly as A0 and S-4 used it, and it is **declared, not hidden**.

| history groups | first open of a package earned under another identity, median ms: base tree / head tree (ratio) | groups judged by the canonical admission, base / head | judged on the next open, base / head |
| -------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ |
| 0              | 34.8 / 33.2 (0.955)                                                                             | 6 / 6                                                 | 0 / 0                                |
| 130            | 314.8 / 303.9 (0.966)                                                                           | 6 / 6                                                 | 0 / 0                                |
| 300            | 629.9 / 638.4 (1.013)                                                                           | 6 / 6                                                 | 0 / 0                                |

(Both trees run the same procedure: build a package under a different identity string, then open it under the tree's own identity. The equal counts and
near-equal times say the new verifier segment changes how often the transition happens, not what one transition costs. Only groups the canonical admission judges are
counted: the synthetic extension-owner groups of this harness are skipped by the extension binding's owner verification, a gap the B1 census already records as
`SKIPPED`; the W2 fence is nevertheless applied to them, ahead of that skip.)

## Not measured

A production file provider under real storage latency; journals beyond 300 groups; multi-process lock contention cost (T05 records functional lock losses only);
the H-07 matched job (skipped by CI as before); any real GM, client or network.
