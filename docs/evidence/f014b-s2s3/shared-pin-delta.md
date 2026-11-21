# F-014B B1 S2/S3 - the exact shared-pin delta after integrating main c4b7de8 (PR #121 / S1 merged)

MECHANISM ONLY. EXECUTED: the merge below was run, `git diff origin/main` over the shared files produced the diff at the end, and every gate listed in records.md was re-run on the merged tree.

Integration: main `c4b7de8f78b1211ad9f5d54b97de53efb959996b` (tree `c2a65bbd8fc879b9269716828396dc8ad7284ecf`, identical to the S1 PR head tree) merged into this branch by a merge commit (no rebase, no amend, no force-push; every
earlier commit is preserved). Base of the S2/S3 table stays `0cff287`.

What did not change (EXECUTED):

- `packages/engine/src/temporal/admission.ts` is byte-identical to main (blob `6f4021871cd13ccaebbb137981d49d59d6db1e1e` on both sides). It is S1's one production file and this lane does not touch it.
- S1's frozen fixtures, evidence custody and tables are identical to main: `tests/fixtures/b1-s1-frozen`, `tests/fixtures/b1-s1-evidence`, `tests/support/b1-s1-scoped-deltas.ts`, `b1-s1-evidence-custody.ts`, `b1-s1-frozen-fixtures.ts`, `b1-s1-rigs.ts` (`git diff origin/main` over them is empty).
- Against main, `packages/` differs only by this lane's four added files (the manifest, `gm-wait-catalogue.ts`, `gm-wait-catalogue-current.ts`, `gm-wait-present-reader.ts`). No other production file.
- `tools/gen-gm-wait-catalogue.ts --check` on the merged tree reports OK with the SAME digest `f3393ad446efcd3915ecf081c5ce35fd041a5952a1a38848f9da1a8bf5c56062` and 330227 bytes: the manifest did not change.

## The edits the merge needed (line numbers are in the merged files)

| File                                                                     | Lines                                                               | What it now asserts                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/conformance/a1-1-scope-conformance.test.ts`                       | import 22-23; allow-list 78-82                                      | the one textual conflict, resolved by union: the A1-1 source-change list is `[...A1_1_PACKAGE_PATHS, ...B1_S1_PACKAGE_PATHS, ...B1_S2S3_PACKAGE_PATHS]`; A1-1 itself still changes none of the S1 or S2/S3 paths                                                                                                                                                 |
| `tests/conformance/b1-s1-scope-conformance.test.ts` (S1's file)          | import 38-43; 188-191                                               | B1S1-C2 (1): the source changes under apps/ and packages/ are exactly S1's one declared file plus this lane's four declared package paths; any other path still fails it                                                                                                                                                                                         |
| same                                                                     | 203-209                                                             | B1S1-C2 (2): outside tests/ the changed paths are exactly S1's list plus this lane's declared package, tooling and `.prettierignore` rows; this lane's evidence directory is excluded by prefix only (`docs/evidence/f014b-s2s3/`); any other path still fails it                                                                                                |
| same                                                                     | 215-226                                                             | B1S1-C2 (3): every path S1 is forbidden to touch (including `tools`) is still byte-identical to the base, except the two tooling files this lane declares in `B1_S2S3_TOOLS_PATHS` (`tools/gen-gm-wait-catalogue.ts`, `tools/gm-wait-catalogue-mutation-check.py`); nothing else under `tools` may move, and the non-vacuity check on S1's own file is unchanged |
| `tests/conformance/b1-s2s3-scope-conformance.test.ts` (this lane's file) | import; declared-paths, outside-tests and forbidden-tree assertions | each tolerates exactly the rows of `B1_S1_PACKAGE_PATHS` (the one Temporal admission file) and nothing else from another slice; the forbidden tree `packages/engine/src/temporal` is otherwise still byte-identical to the base                                                                                                                                  |

S1's B1S1-C3 (the B0 module is imported by no production file) holds unchanged: the S2/S3 production modules do not import `temporal-gm-wait.ts`. No S1 assertion is loosened for any path other than the rows named above.

## The shared allow-lists this lane edited (already on the branch before the merge; not touched by the merge, listed because BLUE asked for the whole shared-pin delta)

| File                                                              | Lines                                        | Edit                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/conformance/a0-scope-conformance.test.ts`                  | import 44-48; 130-135; 155-156; 184; 208-209 | the two A0 source-change lists add `...B1_S2S3_PACKAGE_PATHS`; the two outside-package assertions add `...B1_S2S3_TOOLS_PATHS`                                                                                                                                                                                                                     |
| same                                                              | 444; 453-484                                 | the category-8 test is the declared scoped supersession: the hits list is `temporal-origin.ts` plus the declared reader; the A0 invariant is asserted in the same test (nothing under Temporal, owners, initial-setup, ms-setup, protocol, operator or apps names the predicate; no production file other than the reader names the reader module) |
| `tests/conformance/gm-freight-conformance.test.ts`                | 36; 207                                      | one import, one `...B1_S2S3_PACKAGE_PATHS` entry                                                                                                                                                                                                                                                                                                   |
| `tests/conformance/pc-standing-ledger-conformance.test.ts`        | 40; 419                                      | one import, one `...B1_S2S3_PACKAGE_PATHS` entry                                                                                                                                                                                                                                                                                                   |
| `tests/conformance/historical-pin-provenance-conformance.test.ts` | 26; 358                                      | one import, one `...B1_S2S3_PACKAGE_PATHS` entry (RP-2 list)                                                                                                                                                                                                                                                                                       |
| `tests/conformance/gip-conformance.test.ts`                       | 220-222                                      | the three extra allow-lists (1 of 3): one commented entry, the reader reads the sunset Instrument and its Temporal object by exact key                                                                                                                                                                                                             |
| `tests/conformance/gip-instrument-conformance.test.ts`            | 323-325                                      | the three extra allow-lists (2 of 3): one commented entry, the reader parses the Instrument with the existing schema                                                                                                                                                                                                                               |
| `tests/conformance/pc-movement-conformance.test.ts`               | 354-356                                      | the three extra allow-lists (3 of 3): one commented entry in the allowed set, the reader reads the PC movement records by exact key                                                                                                                                                                                                                |
| `.prettierignore`                                                 | 9-11                                         | the comment and the manifest glob                                                                                                                                                                                                                                                                                                                  |

## The diff (merged tree against origin/main, shared files only, zero context lines)

```diff
diff --git a/.prettierignore b/.prettierignore
index ccb3f3d..122bf61 100644
--- a/.prettierignore
+++ b/.prettierignore
@@ -8,0 +9,3 @@ packages/contracts/src/spec-identity.ts
+
+# F-014B B1 S2/S3: retained canonical manifest bytes. The file IS the hashed bytes (custody is by length and SHA-256): never reformat.
+packages/engine/gm-wait-catalogue/manifests/*.json
diff --git a/tests/conformance/a0-scope-conformance.test.ts b/tests/conformance/a0-scope-conformance.test.ts
index dba5064..7638b48 100644
--- a/tests/conformance/a0-scope-conformance.test.ts
+++ b/tests/conformance/a0-scope-conformance.test.ts
@@ -43,0 +44,5 @@ import { A1_1_PACKAGE_PATHS } from "../support/a1-1-scoped-deltas.ts";
+import {
+  B1_S2S3_PACKAGE_PATHS,
+  B1_S2S3_SI_ORIGIN_WITNESS_PRODUCTION_CALLERS,
+  B1_S2S3_TOOLS_PATHS,
+} from "../support/b1-s2s3-scoped-deltas.ts";
@@ -125 +130,6 @@ describe("the A0 scoped-delta table: every pin is a real byte change, recorded o
-      [...A0_PACKAGE_PATHS, ...A0_DECLARED_MAIN_INCLUSIONS, ...A1_1_PACKAGE_PATHS].sort(),
+      [
+        ...A0_PACKAGE_PATHS,
+        ...A0_DECLARED_MAIN_INCLUSIONS,
+        ...A1_1_PACKAGE_PATHS,
+        ...B1_S2S3_PACKAGE_PATHS,
+      ].sort(),
@@ -145 +155,2 @@ describe("the A0 scoped-delta table: every pin is a real byte change, recorded o
-    expect(outside.sort()).toEqual([...A0_OUTSIDE_PACKAGE_PATHS].sort());
+    // (and the F-014B B1 S2/S3 slice's declared generator, which that slice's own table and suite police)
+    expect(outside.sort()).toEqual([...A0_OUTSIDE_PACKAGE_PATHS, ...B1_S2S3_TOOLS_PATHS].sort());
@@ -173 +184 @@ describe("the A0 scoped-delta table: every pin is a real byte change, recorded o
-      [...A0_PACKAGE_PATHS, ...A1_1_PACKAGE_PATHS].sort(),
+      [...A0_PACKAGE_PATHS, ...A1_1_PACKAGE_PATHS, ...B1_S2S3_PACKAGE_PATHS].sort(),
@@ -197 +208,2 @@ describe("the A0 scoped-delta table: every pin is a real byte change, recorded o
-    expect(outside.sort()).toEqual([...A0_OUTSIDE_PACKAGE_PATHS].sort());
+    // (and the F-014B B1 S2/S3 slice's declared generator, which that slice's own table and suite police)
+    expect(outside.sort()).toEqual([...A0_OUTSIDE_PACKAGE_PATHS, ...B1_S2S3_TOOLS_PATHS].sort());
@@ -432 +444 @@ describe("the registry, rules and sunset row are exactly what the lock declares"
-describe("the category-8 predicate is unwired: it has no caller outside tests, no store and no read", () => {
+describe("the category-8 predicate is unwired from every GM-wait writer, host and admission path: it has no store, no read and one declared pure caller", () => {
@@ -441 +453,32 @@ describe("the category-8 predicate is unwired: it has no caller outside tests, n
-    expect(hits).toEqual(["packages/contracts/src/temporal-origin.ts"]);
+    // DECLARED SUPERSESSION (F-014B B1 S2/S3; BLUE Q3, accepted conditionally). Category 8 of the GM-wait T0 read set is the fixed read of the
+    // temporal/origin witness for a genuinely fresh SI INITIAL, and a PURE, present-only helper consumer of this predicate now exists: the S3
+    // reader declared in tests/support/b1-s2s3-scoped-deltas.ts. That is exactly the wiring this pin was waiting for, and nothing more.
+    // The A0 invariant this suite exists to keep is PRESERVED and asserted just below: the predicate stays a pure function, and NO production
+    // GM-wait host, admission, authority writer or driver path names it or imports the S3 reader.
+    expect([...hits].sort()).toEqual(
+      [
+        "packages/contracts/src/temporal-origin.ts",
+        ...B1_S2S3_SI_ORIGIN_WITNESS_PRODUCTION_CALLERS,
+      ].sort(),
+    );
+    const writerSide = [
+      "packages/engine/src/temporal",
+      "packages/engine/src/owners",
+      "packages/engine/src/initial-setup",
+      "packages/engine/src/ms-setup",
+      "packages/protocol",
+      "packages/operator",
+      "apps",
+    ];
+    for (const dir of writerSide)
+      for (const f of walk(dir).filter(
+        (x) => /\.(ts|mts|js|mjs)$/.test(x) && !x.includes("node_modules"),
+      ))
+        expect(readFileSync(f, "utf8").includes("siOriginWitnessViolation"), f).toBe(false);
+    const production = [...walk("packages"), ...walk("apps")].filter(
+      (f) => /\.(ts|mts|js|mjs)$/.test(f) && !f.includes("node_modules"),
+    );
+    for (const f of production.filter(
+      (x) => !B1_S2S3_SI_ORIGIN_WITNESS_PRODUCTION_CALLERS.includes(x),
+    ))
+      expect(readFileSync(f, "utf8").includes("gm-wait-present-reader"), f).toBe(false);
diff --git a/tests/conformance/a1-1-scope-conformance.test.ts b/tests/conformance/a1-1-scope-conformance.test.ts
index 89965da..775a2fe 100644
--- a/tests/conformance/a1-1-scope-conformance.test.ts
+++ b/tests/conformance/a1-1-scope-conformance.test.ts
@@ -22,0 +23 @@ import { B1_S1_PACKAGE_PATHS } from "../support/b1-s1-scoped-deltas.ts";
+import { B1_S2S3_PACKAGE_PATHS } from "../support/b1-s2s3-scoped-deltas.ts";
@@ -77,2 +78,2 @@ describe("A1-1 scope: the declared transition is the two production files and th
-      // Declared inclusion (F-014B B1 S1, a later slice): the one Temporal admission file in tests/support/b1-s1-scoped-deltas.ts, which
-      // that slice's own table and scope conformance suite police; A1-1 itself still changes none of it.
+      // Declared inclusions (F-014B B1 S1 and B1 S2/S3, later slices): the paths in tests/support/b1-s1-scoped-deltas.ts and
+      // tests/support/b1-s2s3-scoped-deltas.ts, which those slices' own tables and scope conformance suites police; A1-1 itself changes none of them.
@@ -80 +81 @@ describe("A1-1 scope: the declared transition is the two production files and th
-        [...A1_1_PACKAGE_PATHS, ...B1_S1_PACKAGE_PATHS].sort(),
+        [...A1_1_PACKAGE_PATHS, ...B1_S1_PACKAGE_PATHS, ...B1_S2S3_PACKAGE_PATHS].sort(),
diff --git a/tests/conformance/b1-s1-scope-conformance.test.ts b/tests/conformance/b1-s1-scope-conformance.test.ts
index 56cb406..026923e 100644
--- a/tests/conformance/b1-s1-scope-conformance.test.ts
+++ b/tests/conformance/b1-s1-scope-conformance.test.ts
@@ -37,0 +38,6 @@ import {
+import {
+  B1_S2S3_EVIDENCE_PREFIX,
+  B1_S2S3_OUTSIDE_PACKAGE_PATHS,
+  B1_S2S3_PACKAGE_PATHS,
+  B1_S2S3_TOOLS_PATHS,
+} from "../support/b1-s2s3-scoped-deltas.ts";
@@ -181,0 +188 @@ describe("B1-S1 scope: one production file changed, by its declared amount, and
+      // Declared inclusion (F-014B B1 S2/S3, a later slice): its new package paths, policed by that slice's own table and suite.
@@ -183 +190 @@ describe("B1-S1 scope: one production file changed, by its declared amount, and
-        [...B1_S1_PACKAGE_PATHS].sort(),
+        [...B1_S1_PACKAGE_PATHS, ...B1_S2S3_PACKAGE_PATHS].sort(),
@@ -196 +203,6 @@ describe("B1-S1 scope: one production file changed, by its declared amount, and
-      expect(outside.sort()).toEqual([...B1_S1_PACKAGE_PATHS, ...B1_S1_NON_PACKAGE_PATHS].sort());
+      // Declared inclusion (F-014B B1 S2/S3): its new package paths, its tooling and its evidence directory (policed by that slice's own suite).
+      const s2s3 = new Set([...B1_S2S3_PACKAGE_PATHS, ...B1_S2S3_OUTSIDE_PACKAGE_PATHS]);
+      const expected = new Set([...B1_S1_PACKAGE_PATHS, ...B1_S1_NON_PACKAGE_PATHS, ...s2s3]);
+      expect(
+        [...new Set(outside.filter((p) => !p.startsWith(B1_S2S3_EVIDENCE_PREFIX)))].sort(),
+      ).toEqual([...expected].sort());
@@ -202,0 +215,2 @@ describe("B1-S1 scope: one production file changed, by its declared amount, and
+      // (F-014B B1 S2/S3 adds only its own declared tooling under tools/: nothing else there moves)
+      const s2s3Tools = new Set(B1_S2S3_TOOLS_PATHS);
@@ -204,2 +218,8 @@ describe("B1-S1 scope: one production file changed, by its declared amount, and
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
diff --git a/tests/conformance/gip-conformance.test.ts b/tests/conformance/gip-conformance.test.ts
index 76ca5e0..452f002 100644
--- a/tests/conformance/gip-conformance.test.ts
+++ b/tests/conformance/gip-conformance.test.ts
@@ -219,0 +220,3 @@ describe("IA-03 owner exclusivity: the GIP owner holds the Institution Identity,
+      // F-014B B1 S3 (the pure GM-wait present-basis reader; MECHANISM ONLY, NON-WRITING, UNWIRED): it READS the sunset Instrument and its Temporal
+      // object by exact key to classify the GIP source class (the Instrument schema and OWNER_GIP are consulted, nothing is registered, written or admitted)
+      "packages/engine/src/gm-wait-present-reader.ts",
diff --git a/tests/conformance/gip-instrument-conformance.test.ts b/tests/conformance/gip-instrument-conformance.test.ts
index e5ebe73..ebad834 100644
--- a/tests/conformance/gip-instrument-conformance.test.ts
+++ b/tests/conformance/gip-instrument-conformance.test.ts
@@ -322,0 +323,3 @@ describe("IA-03 owner exclusivity: one more kind of the one GIP owner, ADVANCING
+      // F-014B B1 S3 (the pure GM-wait present-basis reader; MECHANISM ONLY, NON-WRITING, UNWIRED): it READS the sunset Instrument by its exact key
+      // and parses it with the existing schema to classify the GIP source class; it writes no GIP key and registers nothing
+      "packages/engine/src/gm-wait-present-reader.ts",
diff --git a/tests/conformance/gm-freight-conformance.test.ts b/tests/conformance/gm-freight-conformance.test.ts
index dce2464..7609fd3 100644
--- a/tests/conformance/gm-freight-conformance.test.ts
+++ b/tests/conformance/gm-freight-conformance.test.ts
@@ -35,0 +36 @@ import { A1_1_PACKAGE_PATHS } from "../support/a1-1-scoped-deltas.ts";
+import { B1_S2S3_PACKAGE_PATHS } from "../support/b1-s2s3-scoped-deltas.ts";
@@ -205,0 +207 @@ describe("the slice is one scoped delta over the freight F+I base", () => {
+      ...B1_S2S3_PACKAGE_PATHS,
diff --git a/tests/conformance/historical-pin-provenance-conformance.test.ts b/tests/conformance/historical-pin-provenance-conformance.test.ts
index 1511a1f..d251234 100644
--- a/tests/conformance/historical-pin-provenance-conformance.test.ts
+++ b/tests/conformance/historical-pin-provenance-conformance.test.ts
@@ -25,0 +26 @@ import { A1_1_PACKAGE_PATHS } from "../support/a1-1-scoped-deltas.ts";
+import { B1_S2S3_PACKAGE_PATHS } from "../support/b1-s2s3-scoped-deltas.ts";
@@ -356,0 +358 @@ describe("RP-2 pins the four authorized production repairs", () => {
+        ...B1_S2S3_PACKAGE_PATHS,
diff --git a/tests/conformance/pc-movement-conformance.test.ts b/tests/conformance/pc-movement-conformance.test.ts
index 3b2ada2..4fb50b8 100644
--- a/tests/conformance/pc-movement-conformance.test.ts
+++ b/tests/conformance/pc-movement-conformance.test.ts
@@ -353,0 +354,3 @@ describe("IA-03 owner exclusivity: one facet and two kinds under the existing PC
+      // F-014B B1 S3 (the pure GM-wait present-basis reader; MECHANISM ONLY, NON-WRITING, UNWIRED): it READS the PC movement request, commitment and
+      // registered object by exact key to tell a moving PC from a stationary one; it writes, admits and registers nothing
+      "packages/engine/src/gm-wait-present-reader.ts",
diff --git a/tests/conformance/pc-standing-ledger-conformance.test.ts b/tests/conformance/pc-standing-ledger-conformance.test.ts
index 7cd5748..76a1c33 100644
--- a/tests/conformance/pc-standing-ledger-conformance.test.ts
+++ b/tests/conformance/pc-standing-ledger-conformance.test.ts
@@ -39,0 +40 @@ import { A1_1_PACKAGE_PATHS } from "../support/a1-1-scoped-deltas.ts";
+import { B1_S2S3_PACKAGE_PATHS } from "../support/b1-s2s3-scoped-deltas.ts";
@@ -417,0 +419 @@ describe("scope: this slice changed exactly the predecessor files it records", (
+      ...B1_S2S3_PACKAGE_PATHS,
```
