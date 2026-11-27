# F-014B replay prerequisite: reproducible evidence (intake, not an implementation)

Evidence for BLUE "Shared Historical-Replay Repair" (PR #148 comment 7207537217). Nothing here changes runtime behaviour.

## What this proves
Genuine campaign packages written by the **pristine main build `d0bcb615fd91cd3b10322fd8ff80964db42b7797`** are opened under three builds:
the base itself (control), PR #148 head `c3314c717e8721eb7ecbd65792db4385b172809c`, and PR #146 public head `7b63cdedaeb0dbe8e28b3065ebcd6c2b85fc92e3`.
`results/` holds every machine-readable outcome, including the two-factor toggles and the consumer peels.

## Custody and safety
- Keys are derived at test time from a **public, non-secret, domain-separated seed** (`tools/deterministic-keys.ts`). No private key is stored in any file here; the
  journals contain only public material and signatures. The seed is unusable as a production credential and is imported only by these tests.
- Journals are **byte-reproducible**: regenerating from the same pristine build and seed gives identical package bytes (`results/regeneration-comparison.json`).
- This set is **regenerated**, not the original scratch pack (original pack digest, private, not published: `e58c013de363bfde12295ede1c9eae8b1ca6ca40562bf22e060f95c1f0037334`).
- `SHA256SUMS` covers every file. A reviewer should recompute it.

## Reproduce
1. `git worktree add --detach <dir> d0bcb615fd91cd3b10322fd8ff80964db42b7797`, then `pnpm install --frozen-lockfile` (Node 22.22.2, pnpm 10.33.0).
2. `git apply patches/test-support-fixed-keys.diff` (test support only: lets the harness take fixed keys).
3. Copy `tools/deterministic-keys.ts` and `tools/generate-old-journals.test.ts` into `tests/integration/`, then
   `G1_EVIDENCE_OUT=<this directory> G1_BUILD_COMMIT=<commit> pnpm exec vitest run --project integration tests/integration/generate-old-journals.test.ts`.
4. In any build under test, apply the same patch, copy `tools/verify-old-journals.test.ts` (and `verify-b2-prior-main.test.ts`), and run with
   `G1_EVIDENCE_OUT=<this directory> G1_BUILD=<label>`. Outputs go to `results/verify-<label>.json`.

## Not shown
Node versions other than 22.22.2; any build other than the three above; identity growth across main generations for non-workshop journals (the earlier-main B2 journal has an
identical identity string in all three builds); performance; any negative case of the eventual repair (those are the acceptance contract, not run here).
`tools/gen-b2-prior-main.test.ts` is committed exactly as it was run, including a no-op `.slice(0,0)` in the build-commit expression.
