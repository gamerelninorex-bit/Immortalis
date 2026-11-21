// F-014B B1 S1 (the canonical live-versus-historical origin safety guard): the declared transition of the ONE production file this slice
// changes, and nothing else. The older "nothing else changed" suites extend their allow-lists from `B1_S1_PACKAGE_PATHS`, and the B0 section
// 5.1 invariance test (B0-70, the A0 transition of the same path) is re-baselined from `B1_S1_TRANSITION`.
//
// Recorded as byte lengths and as `git diff --numstat` against the base commit, never as hashes: the one present-day identity this slice
// forces for the file is the A0 scoped-delta head of the path (tests/support/a0-scoped-deltas.ts, which already says that a later change to a
// file listed there updates that table only) and the identity of its tree. Custody is the bytes at the pinned base commit, not ancestry: a
// squash merge keeps the commit retrievable but does not keep it in the merged history, so no test asserts that it is an ancestor of HEAD.
//
// The change is additive except for ONE pure move (repair round 1): the stage-bearing arm's inline comparison of a sealed transaction with the
// authority it opened is moved, verbatim, into a module-private helper that the completion exception also calls, so the law is written once.
// The deletions recorded below are exactly that block; tests/conformance/b1-s1-scope-conformance.test.ts checks that each moved line stands
// verbatim in the helper. The guard and both helpers are module-private: no public name is added to the engine.
//
// A later change to the file updates this table, and the two tables above, and nothing else.
export const B1_S1_BASE_COMMIT = "0cff287a0fd01c9be993ae660d8dbf370596bb73";

export const B1_S1_TRANSITION: Readonly<
  Record<
    string,
    {
      /** the file's length at the base commit (which is also its length at the end of the A0 slice: A1-1 did not touch it) */
      readonly baseBytes: number;
      /** the file's length under S1 */
      readonly s1Bytes: number;
      /** `git diff --numstat` lines added and deleted against the base commit */
      readonly added: number;
      readonly deleted: number;
    }
  >
> = {
  "packages/engine/src/temporal/admission.ts": {
    baseBytes: 36594,
    s1Bytes: 41687,
    added: 101,
    deleted: 13,
  },
};

/** Every path under packages/ or apps/ this slice changes. There is no new production file. */
export const B1_S1_PACKAGE_PATHS: readonly string[] = Object.keys(B1_S1_TRANSITION);

/**
 * The only changed paths outside tests/ and outside the production roots: the formatter ignore list gains the frozen packages' JSON (retained
 * canonical bytes, custody is by length and digest, so they must never be reformatted). No source, spec, tool, document or workflow file moves.
 */
export const B1_S1_NON_PACKAGE_PATHS: readonly string[] = [".prettierignore"];

/**
 * The census of production files (packages/*, apps/*) that spell the trigger kind reserved for GM-interpreted waiting, with the reason each
 * is allowed to. Before S1 the literal occurred in exactly one production file (the unexported B0 module). S1 adds one local constant in the
 * engine, because the engine may not import the unexported B0 module; a conformance test pins that constant equal to the B0 one. A third file
 * naming the literal fails the census until it is listed here with its reason.
 */
export const B1_S1_LITERAL_FILES: Readonly<Record<string, string>> = {
  "packages/contracts/src/temporal-gm-wait.ts":
    "the B0 pure request contract: the one provisional wire trigger, source-verbatim; not exported from the contracts index",
  "packages/engine/src/temporal/admission.ts":
    "S1: the local copy the live guard compares against (the engine cannot import the unexported B0 module); pinned equal to the B0 constant",
};

/** The paths the brief of S1 names as UNTOUCHED, each byte-identical to the base commit (the changed set is checked as a whole as well). */
export const B1_S1_UNTOUCHED: readonly string[] = [
  "packages/contracts/src/temporal.ts",
  "packages/contracts/src/temporal-gm-wait.ts",
  "packages/contracts/src/temporal-origin.ts",
  "packages/contracts/src/index.ts",
  "packages/engine/src/temporal/integrity.ts",
  "packages/engine/src/temporal/coordinator.ts",
  "packages/engine/src/temporal/bootstrap.ts",
  "packages/engine/src/temporal/captured-chronology.ts",
  "packages/engine/src/temporal/identity.ts",
  "packages/engine/src/temporal/providers.ts",
  "packages/engine/src/owners/admission.ts",
  "packages/engine/src/owners/registry.ts",
  "packages/engine/src/ms-setup",
  "packages/engine/src/initial-setup",
  "packages/protocol",
  "packages/operator",
  "packages/testkit",
  "apps",
  "spec/f027",
  "tools",
  "docs/f014b",
  ".github",
  "tests/contract/gm-wait-b0-schemas.test.ts",
  "tests/contract/gm-wait-b0-legacy-schema-control.test.ts",
  "tests/unit/gm-wait-b0-origin-pairing.test.ts",
  "tests/unit/gm-wait-b0-si-subday.test.ts",
  "tests/unit/gm-wait-b0-sealed-identity.test.ts",
  "tests/security/gm-wait-b0-legacy-isolation.test.ts",
];
