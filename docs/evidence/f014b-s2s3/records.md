# F-014B B1 S2/S3 - verification records

MECHANISM ONLY. Labels: EXECUTED (run, output observed), REASONED, UNKNOWN. Base of this branch: main `0cff287a0fd01c9be993ae660d8dbf370596bb73`.

## Gates on the branch (EXECUTED, on the committed tree before each push)

format:check, lint, typecheck and check:spec exit 0; the four-project vitest run (unit, contract, conformance, security): 291 test files, 5245 tests, all passed.
Main at the base: 287 files, 5153 tests. The branch adds 4 test files and 92 tests to that run; the new S2 suites are `gm-wait-catalogue-s2.test.ts` (21 tests) and
`gm-wait-catalogue-s2-census.test.ts` (30 tests), the S3 suite is `gm-wait-present-s3.test.ts` (30 tests) and the scope suite is `b1-s2s3-scope-conformance.test.ts` (11 tests).
The two integration files `gm-wait-present-s3-committed.test.ts` (18 tests) and `gm-wait-present-s3-cost.test.ts` (2 tests) run in the integration project only.

## The full integration project, run once (EXECUTED, head 45100f4)

`pnpm exec vitest run --project integration`: 345 test files passed (345); 6098 tests passed, 1 skipped (6099); duration 1207.66 s.
The one skipped test is not this lane's: `tests/integration/play-context-cost.test.ts` line 237 is `it.skipIf(!comparisonBase)` and is skipped when its comparison base is not available.

## Squash simulation (EXECUTED, head 45100f4)

A throwaway clone with main `0cff287` checked out detached, then `git merge --squash` of the branch head and a commit:
tree of the squash commit `13af0882abef888138031eeacb2d2b9f2a72570c` equals the tree of the branch head `13af0882abef888138031eeacb2d2b9f2a72570c` (identical).
On that squash commit: format:check, lint, typecheck and check:spec exit 0; the conformance project: 94 files, 1662 tests, all passed. 33 files changed, 7727 insertions, 7 deletions.

## Forbidden-file byte identity (EXECUTED, git object ids at 0cff287 and at the branch head)

Every path below has the same git object id at the base and at the head: `packages/engine/src/temporal`, `packages/engine/src/owners`, `packages/engine/src/index.ts`,
`packages/engine/src/persistence`, `packages/engine/src/commit`, `packages/engine/src/initial-setup`, `packages/engine/src/ms-setup`, `packages/contracts` (including
`temporal-gm-wait.ts`, `temporal-origin.ts` and `index.ts`), `packages/protocol`, `packages/operator`, `packages/testkit`, `apps`, `spec`, `tools/check-spec.ts`, `docs/f014b`,
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.github`. `git diff --quiet 0cff287 HEAD` over the production
trees reports no change; `git diff --stat 0cff287 HEAD -- packages` lists exactly four added files and nothing edited. The three runtime hook sites
(`temporal/providers.ts`, `owners/extension.ts`, `owners/admission.ts`) are inside those trees. The same check runs in `tests/conformance/b1-s2s3-scope-conformance.test.ts`.
No dependency or lockfile change.

## Existing files this branch edits (all declared re-pins; no production file)

| File                                                              | Nature of the edit                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.prettierignore`                                                 | adds the comment and the one line `packages/engine/gm-wait-catalogue/manifests/*.json`                                                                                                                                                                                                                                                                    |
| `tests/conformance/a0-scope-conformance.test.ts`                  | two outside-package assertions add `B1_S2S3_TOOLS_PATHS`; the category-8 test names the reader as the one declared production caller of `siOriginWitnessViolation` (scoped supersession) and asserts that no Temporal, owners, initial-setup, ms-setup, protocol, operator or apps file names the predicate and no other production file names the reader |
| `tests/conformance/a1-1-scope-conformance.test.ts`                | imports the table and adds `...B1_S2S3_PACKAGE_PATHS` to the allowed source-change list                                                                                                                                                                                                                                                                   |
| `tests/conformance/gm-freight-conformance.test.ts`                | one import and one `...B1_S2S3_PACKAGE_PATHS` entry in the allow-list                                                                                                                                                                                                                                                                                     |
| `tests/conformance/pc-standing-ledger-conformance.test.ts`        | one import and one `...B1_S2S3_PACKAGE_PATHS` entry in the allow-list                                                                                                                                                                                                                                                                                     |
| `tests/conformance/historical-pin-provenance-conformance.test.ts` | one import and one `...B1_S2S3_PACKAGE_PATHS` entry in the allow-list (RP-2 list)                                                                                                                                                                                                                                                                         |
| `tests/conformance/gip-conformance.test.ts`                       | one commented entry: the reader reads the sunset Instrument and Temporal object by exact key                                                                                                                                                                                                                                                              |
| `tests/conformance/gip-instrument-conformance.test.ts`            | one commented entry: the reader parses the Instrument with the existing schema                                                                                                                                                                                                                                                                            |
| `tests/conformance/pc-movement-conformance.test.ts`               | one commented entry in the allowed set: the reader reads the PC movement records by exact key                                                                                                                                                                                                                                                             |

## Trial merge over PR #121 (EXECUTED in a throwaway clone; nothing applied to this branch or to the S1 branch)

PR #121 (S1) head was `686fc2a`. The coordinator has since reported that #121 was squash-merged and that the resulting main tree equals the S1 head tree, so what follows applies to main unchanged.
Procedure: this branch's head `45100f4` with `686fc2a` merged in. One textual conflict, in `tests/conformance/a1-1-scope-conformance.test.ts` (two hunks: the import line and the allow-list), resolved by union:

```diff
diff --git a/tests/conformance/a1-1-scope-conformance.test.ts b/tests/conformance/a1-1-scope-conformance.test.ts
index c3997e1..775a2fe 100644
--- a/tests/conformance/a1-1-scope-conformance.test.ts
+++ b/tests/conformance/a1-1-scope-conformance.test.ts
@@ -19,6 +19,7 @@ import {
   A1_1_PACKAGE_PATHS,
   A1_1_TRANSITION,
 } from "../support/a1-1-scoped-deltas.ts";
+import { B1_S1_PACKAGE_PATHS } from "../support/b1-s1-scoped-deltas.ts";
 import { B1_S2S3_PACKAGE_PATHS } from "../support/b1-s2s3-scoped-deltas.ts";

 const git = (...args: string[]): Buffer | null => {
@@ -74,10 +75,10 @@ describe("A1-1 scope: the declared transition is the two production files and th
       const untracked = lines(
         git("ls-files", "--others", "--exclude-standard", "--", "apps", "packages"),
       );
-      // Declared inclusion (F-014B B1 S2/S3, a later slice): the paths in tests/support/b1-s2s3-scoped-deltas.ts, which that slice's own table and
-      // scope conformance suite police; A1-1 itself changes none of them.
+      // Declared inclusions (F-014B B1 S1 and B1 S2/S3, later slices): the paths in tests/support/b1-s1-scoped-deltas.ts and
+      // tests/support/b1-s2s3-scoped-deltas.ts, which those slices' own tables and scope conformance suites police; A1-1 itself changes none of them.
       expect([...changed, ...untracked].sort()).toEqual(
-        [...A1_1_PACKAGE_PATHS, ...B1_S2S3_PACKAGE_PATHS].sort(),
+        [...A1_1_PACKAGE_PATHS, ...B1_S1_PACKAGE_PATHS, ...B1_S2S3_PACKAGE_PATHS].sort(),
       );
       // the declared allow-list is not a place to park files that did not change
       expect(A1_1_PACKAGE_PATHS.every((p) => changed.includes(p))).toBe(true);
@@ -143,10 +144,11 @@ describe("A1-1 scope: the declared transition is the two production files and th
         "packages/operator/src/time-initialization.ts",
       ];
       for (const p of FORBIDDEN) {
+        // the one declared S1 path inside a forbidden tree (packages/engine/src/temporal) is that slice's, not A1-1's
         expect(
           lines(git("-c", "core.fileMode=false", "diff", "--name-only", A1_1_BASE_COMMIT, "--", p)),
           p,
-        ).toEqual([]);
+        ).toEqual(B1_S1_PACKAGE_PATHS.filter((s1) => s1.startsWith(`${p}/`)));
         expect(lines(git("ls-files", "--others", "--exclude-standard", "--", p)), p).toEqual([]);
       }
       // the guard is not vacuous: it finds the two files this slice DID change
```

With only that resolution, six conformance tests fail (three in S1's `b1-s1-scope-conformance.test.ts` B1S1-C2, three in this lane's `b1-s2s3-scope-conformance.test.ts`); each is a scope table that
correctly sees the other slice's paths. A seventh failure, `tests/unit/review-projection.test.ts` (a real archived e23 card), is an artifact of the throwaway clone (it needs git object
`1ff595a5` which the clone lacks; the object exists in the real repository and the test passes in every gate run here) and is unrelated to the merge.
The exact further delta that makes them pass (verified: the four-project run on the merged tree then has no failure other than the clone artifact; the affected suites a0, a1-1, b1-s1 and b1-s2s3 pass; format, lint, typecheck, check:spec were also run on that tree):

```diff
diff --git a/tests/conformance/b1-s1-scope-conformance.test.ts b/tests/conformance/b1-s1-scope-conformance.test.ts
index 56cb406..026923e 100644
--- a/tests/conformance/b1-s1-scope-conformance.test.ts
+++ b/tests/conformance/b1-s1-scope-conformance.test.ts
@@ -35,6 +35,12 @@ import {
   B1_S1_TRANSITION,
   B1_S1_UNTOUCHED,
 } from "../support/b1-s1-scoped-deltas.ts";
+import {
+  B1_S2S3_EVIDENCE_PREFIX,
+  B1_S2S3_OUTSIDE_PACKAGE_PATHS,
+  B1_S2S3_PACKAGE_PATHS,
+  B1_S2S3_TOOLS_PATHS,
+} from "../support/b1-s2s3-scoped-deltas.ts";

 /** The lines the base commit carried inline in the stage-bearing arm and the production file no longer does: the moved comparison (see B1S1-C2). */
 const MOVED_BLOCK_DELETIONS = 13;
@@ -179,8 +185,9 @@ describe("B1-S1 scope: one production file changed, by its declared amount, and
         expect(t.deleted, `${path} deletions are the moved block`).toBe(MOVED_BLOCK_DELETIONS);
       }
       const changed = changedSince("apps", "packages");
+      // Declared inclusion (F-014B B1 S2/S3, a later slice): its new package paths, policed by that slice's own table and suite.
       expect([...changed, ...untrackedIn("apps", "packages")].sort()).toEqual(
-        [...B1_S1_PACKAGE_PATHS].sort(),
+        [...B1_S1_PACKAGE_PATHS, ...B1_S2S3_PACKAGE_PATHS].sort(),
       );
       // the declared allow-list is not a place to park files that did not change
       expect(B1_S1_PACKAGE_PATHS.every((p) => changed.includes(p))).toBe(true);
@@ -193,16 +200,29 @@ describe("B1-S1 scope: one production file changed, by its declared amount, and
       const outside = [...changedSince("."), ...untrackedIn(".")].filter(
         (p) => !p.startsWith("tests/"),
       );
-      expect(outside.sort()).toEqual([...B1_S1_PACKAGE_PATHS, ...B1_S1_NON_PACKAGE_PATHS].sort());
+      // Declared inclusion (F-014B B1 S2/S3): its new package paths, its tooling and its evidence directory (policed by that slice's own suite).
+      const s2s3 = new Set([...B1_S2S3_PACKAGE_PATHS, ...B1_S2S3_OUTSIDE_PACKAGE_PATHS]);
+      const expected = new Set([...B1_S1_PACKAGE_PATHS, ...B1_S1_NON_PACKAGE_PATHS, ...s2s3]);
+      expect(
+        [...new Set(outside.filter((p) => !p.startsWith(B1_S2S3_EVIDENCE_PREFIX)))].sort(),
+      ).toEqual([...expected].sort());
     },
   );

   it.skipIf(!baseReachable)(
     "B1S1-C2 every path the slice is forbidden to touch (the historical verifier's file and identity, the D-3 integrity, coordinator, owner registry, the typed contract, the gateways, the B0 module and its tests, the A0 and A1-1 modules, the spec lock) is byte-identical to the base commit, tracked or not",
     () => {
+      // (F-014B B1 S2/S3 adds only its own declared tooling under tools/: nothing else there moves)
+      const s2s3Tools = new Set(B1_S2S3_TOOLS_PATHS);
       for (const p of B1_S1_UNTOUCHED) {
-        expect(changedSince(p), p).toEqual([]);
-        expect(untrackedIn(p), p).toEqual([]);
+        expect(
+          changedSince(p).filter((x) => !s2s3Tools.has(x)),
+          p,
+        ).toEqual([]);
+        expect(
+          untrackedIn(p).filter((x) => !s2s3Tools.has(x)),
+          p,
+        ).toEqual([]);
       }
       // the guard is not vacuous: it finds the one file this slice DID change
       for (const p of B1_S1_PACKAGE_PATHS) expect(changedSince(p)).toEqual([p]);
diff --git a/tests/conformance/b1-s2s3-scope-conformance.test.ts b/tests/conformance/b1-s2s3-scope-conformance.test.ts
index 9a2ec98..afeea61 100644
--- a/tests/conformance/b1-s2s3-scope-conformance.test.ts
+++ b/tests/conformance/b1-s2s3-scope-conformance.test.ts
@@ -22,6 +22,7 @@ import {
   B1_S2S3_PACKAGE_PATHS,
   B1_S2S3_SI_ORIGIN_WITNESS_PRODUCTION_CALLERS,
 } from "../support/b1-s2s3-scoped-deltas.ts";
+import { B1_S1_PACKAGE_PATHS } from "../support/b1-s1-scoped-deltas.ts";

 const git = (...args: string[]): Buffer | null => {
   try {
@@ -70,7 +71,10 @@ describe("[scope] [mechanism only] B1 S2/S3 declared scope", () => {
     () => {
       const changed = changedSince("apps", "packages");
       const untracked = untrackedIn("apps", "packages");
-      expect([...changed, ...untracked].sort()).toEqual([...B1_S2S3_PACKAGE_PATHS].sort());
+      // Declared inclusion (F-014B B1 S1, merged first): its one Temporal admission file, policed by that slice's own table and suite.
+      expect([...changed, ...untracked].sort()).toEqual(
+        [...B1_S1_PACKAGE_PATHS, ...B1_S2S3_PACKAGE_PATHS].sort(),
+      );
       // every declared path is an ADDED file: absent from the base commit
       for (const p of B1_S2S3_PACKAGE_PATHS)
         expect(git("cat-file", "-e", `${B1_S2S3_BASE_COMMIT}:${p}`), `${p} is new`).toBeNull();
@@ -83,7 +87,11 @@ describe("[scope] [mechanism only] B1 S2/S3 declared scope", () => {
       const outside = [...changedSince("."), ...untrackedIn(".")].filter(
         (p) => !p.startsWith("tests/"),
       );
-      const declared = new Set([...B1_S2S3_PACKAGE_PATHS, ...B1_S2S3_OUTSIDE_PACKAGE_PATHS]);
+      const declared = new Set([
+        ...B1_S1_PACKAGE_PATHS,
+        ...B1_S2S3_PACKAGE_PATHS,
+        ...B1_S2S3_OUTSIDE_PACKAGE_PATHS,
+      ]);
       const unexpected = outside.filter(
         (p) => !declared.has(p) && !p.startsWith(B1_S2S3_EVIDENCE_PREFIX),
       );
@@ -124,9 +132,17 @@ describe("[scope] [mechanism only] B1 S2/S3 forbidden files are byte-identical t
   it.skipIf(!baseReachable)(
     "[scope] [mechanism only] no forbidden path changed, tracked or not, and the guard is not vacuous",
     () => {
+      // (the one Temporal admission file F-014B B1 S1 declares in its own table is the only change another slice may carry here)
+      const otherSlices = new Set(B1_S1_PACKAGE_PATHS);
       for (const p of FORBIDDEN) {
-        expect(changedSince(p), p).toEqual([]);
-        expect(untrackedIn(p), p).toEqual([]);
+        expect(
+          changedSince(p).filter((x) => !otherSlices.has(x)),
+          p,
+        ).toEqual([]);
+        expect(
+          untrackedIn(p).filter((x) => !otherSlices.has(x)),
+          p,
+        ).toEqual([]);
       }
       // not vacuous: the guard finds a path this slice DID change (the formatter ignore list)
       expect(changedSince(".prettierignore")).toEqual([".prettierignore"]);
```

What each hunk asserts now, with no S1 assertion loosened for any other path:

- S1 B1S1-C2 (1): the source changes under apps/ and packages/ are exactly S1's one declared file plus this lane's four declared package paths.
- S1 B1S1-C2 (2): outside tests/ the changed paths are S1's list plus this lane's declared paths and tooling; this lane's evidence directory is excluded by prefix only.
- S1 B1S1-C2 (3): every path S1 is forbidden to touch is still byte-identical, except the two declared tooling files this lane adds under `tools/`.
- S2/S3 (4)-(6): this lane's own scope suite tolerates exactly the one Temporal admission file S1 declares in its table, in the declared-paths, outside-tests and forbidden-tree assertions, and nothing else.
  S1's B1S1-C3 (the B0 module is imported by no production file) holds: the S2/S3 production modules do not import `temporal-gm-wait.ts`.

Status: this delta has NOT been applied to this branch. Integration with main is pending the coordinator's go (BLUE sequencing).
