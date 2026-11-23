# B2-T11 — what the W2 fence costs the common path

**No target is asserted or invented.** The brief sources none, so nothing here passes or fails on a number. This page records what was measured so a
reviewer can read it, and what was not measured. All figures are `UNRUN` for anything outside this synthetic harness.

## Method (matched, immutable base)

- ONE file, `tests/integration/fixtures/b2-bench.ts`, **byte-identical in both trees** (SHA-256 `d10955a2…cfe`, checked in both).
- Base tree: `git archive 940a1ca29b34af8488c9ea3ea2f1903aeba52660` extracted into an isolated directory with its own copy of `node_modules`; the workspace
  links were verified to resolve inside that directory (`readlink -f`), so the base run cannot have loaded head code. Head tree: this branch.
- Same machine, same Node (`v22.23.5`), idle apart from the benchmark, base and head **interleaved** 6 times each. Each cell below is
  the median of those 6 per-run medians.
- Only APIs that exist in both trees are used (the production canonical admission under the fixture seam, the file package, the synthetic extension owner).
  The work counters are read only when the tree has them (head only).
- Axes: unrelated dormant owner facts (0 / 1 / 100) × verified history length (0 / 130 / 300 groups) around an ORDINARY commit (one that touches no custody),
  a warm checkpoint open, a strict cold open (`audit`), and the explicit POLICY-TRANSITION open.

## Results (median over 6 interleaved runs: base ms / head ms (head ÷ base))

| dormant facts | history groups | ordinary commit, median | ordinary commit, p95  | warm checkpoint open    | strict cold open        |
| ------------- | -------------- | ----------------------- | --------------------- | ----------------------- | ----------------------- |
| 0             | 0              | 3.52 / 3.65 (1.038)     | 5.18 / 5.76 (1.112)   | 51.06 / 59.86 (1.172)   | 34.75 / 36.35 (1.046)   |
| 0             | 130            | 4.76 / 5.36 (1.125)     | 6.89 / 7.36 (1.068)   | 125.18 / 122.47 (0.978) | 151.18 / 162.11 (1.072) |
| 0             | 300            | 6.65 / 6.52 (0.98)      | 8.93 / 8.97 (1.005)   | 201.9 / 195.64 (0.969)  | 292.29 / 309.49 (1.059) |
| 1             | 0              | 3.47 / 3.5 (1.007)      | 5.7 / 5.24 (0.919)    | 33.04 / 33.58 (1.017)   | 32.65 / 31.88 (0.976)   |
| 1             | 130            | 5.34 / 4.8 (0.9)        | 7.81 / 6.32 (0.809)   | 107.67 / 112.71 (1.047) | 147.23 / 157.4 (1.069)  |
| 1             | 300            | 6.17 / 6.54 (1.06)      | 8.86 / 8.52 (0.961)   | 191.5 / 198.82 (1.038)  | 301.82 / 287.57 (0.953) |
| 100           | 0              | 4.4 / 5.31 (1.206)      | 6.75 / 9.25 (1.371)   | 80.3 / 84.13 (1.048)    | 132.87 / 130.01 (0.978) |
| 100           | 130            | 5.94 / 6.05 (1.018)     | 8.95 / 8.88 (0.992)   | 130.46 / 134.91 (1.034) | 247.86 / 256.73 (1.036) |
| 100           | 300            | 7.07 / 7.71 (1.091)     | 10.39 / 10.87 (1.046) | 220.45 / 221.58 (1.005) | 396.68 / 406.73 (1.025) |

Reading: the ratios scatter on both sides of 1 (range 0.81 to 1.37 over all cells and the four statistics; the median of the 27 ratios for commit median, warm open and strict cold open is 1.036) with no trend in
either axis. The two cells that looked high in the first six runs (100 dormant facts, 0 history; ordinary commit median ratio 1.206, p95 1.371) were
re-measured with 300 samples per run, four interleaved runs per tree, and four cells (`measurements-raw/targeted-*`, script
`b2-bench-targeted-cells.ts.txt`): ratios of medians **0.93, 0.966, 1.024, 0.974**. That cell is therefore noise at this scale, not a measured cost. The harness
cannot resolve a difference of a few percent of a 3 to 7 ms commit; this page does not claim there is none.

## Structural evidence (deterministic, asserted by `tests/integration/b2-cost.test.ts`)

Across 40 ordinary commits the fence performed: `checks` 80, `keyInspections` 80, `advances` 40,
**`derivations` 0, `scannedFacts` 0, `rederivations` 0**. That is two constant-time key-prefix inspections per
commit (the core's and the owner admission's) and no scan of the dormant facts or of the verified history. The only O(facts) pass is the one derivation when a
core is built, and a strict replay re-derives the fence incrementally per committed group.

## The one cost B2 does add: a policy transition

B2 appends a verifier-identity segment, so a package earned under the previous identity is replayed strictly ONCE on its first open and re-stamped; the next open
trusts it again. This is the repository's existing policy-transition mechanism, used here exactly as A0 and S-4 used it, and it is **declared, not hidden**.

| history groups | first open of a package earned under another identity, median ms: base tree / head tree (ratio) | groups judged by the canonical admission, base / head | judged on the next open, base / head |
| -------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ |
| 0              | 33.6 / 35.8 (1.064)                                                                             | 6 / 6                                                 | 0 / 0                                |
| 130            | 259.6 / 264.8 (1.02)                                                                            | 6 / 6                                                 | 0 / 0                                |
| 300            | 558.2 / 575.1 (1.03)                                                                            | 6 / 6                                                 | 0 / 0                                |

(Both trees run the same procedure: build a package under a different identity string, then open it under the tree's own identity. The equal counts and
near-equal times say the new verifier segment changes how often the transition happens, not what one transition costs. Only groups the canonical admission judges are
counted: the synthetic extension-owner groups of this harness are skipped by the extension binding's owner verification, a gap the B1 census already records as
`SKIPPED`; the W2 fence is nevertheless applied to them, ahead of that skip.)

## Not measured

A production file provider under real storage latency; journals beyond 300 groups; multi-process lock contention cost (T05 records functional lock losses only);
the H-07 matched job (skipped by CI as before); any real GM, client or network.
