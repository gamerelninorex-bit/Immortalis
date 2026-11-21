// F-014B B1 S2/S3 (the GM-wait source catalogue and the present-only read oracle; MECHANISM ONLY, NON-WRITING): the paths this slice adds,
// as a declared table. Every path is a NEW file: no existing production file under packages/ is changed by this slice. The older "nothing else
// changed" suites extend their allow-lists from `B1_S2S3_PACKAGE_PATHS`, and tests/conformance/b1-s2s3-scope-conformance.test.ts polices the
// table itself (every declared path exists; no other path changed).
//
// A later change to a file below updates this table and nothing else.
export const B1_S2S3_BASE_COMMIT = "0cff287a0fd01c9be993ae660d8dbf370596bb73";

/** Every path under packages/ this slice adds (production modules and the retained manifest bytes). */
export const B1_S2S3_PACKAGE_PATHS: readonly string[] = [
  "packages/engine/gm-wait-catalogue/manifests/f3393ad446efcd3915ecf081c5ce35fd041a5952a1a38848f9da1a8bf5c56062.json",
  "packages/engine/src/gm-wait-catalogue-current.ts",
  "packages/engine/src/gm-wait-catalogue.ts",
];

/** The non-package paths this slice changes or adds outside tests/ (a formatter ignore line for the retained canonical manifest bytes, the generator). */
export const B1_S2S3_OUTSIDE_PACKAGE_PATHS: readonly string[] = [
  ".prettierignore",
  "tools/gen-gm-wait-catalogue.ts",
];

/** Evidence written by this slice (custody, mutation results, cost): any file under this prefix is declared. */
export const B1_S2S3_EVIDENCE_PREFIX = "docs/evidence/f014b-s2s3/";

/**
 * The production files that may NAME `siOriginWitnessViolation` besides its declaration in packages/contracts/src/temporal-origin.ts.
 * Declared supersession of the A0 "unwired" pin (tests/conformance/a0-scope-conformance.test.ts): category 8 of the GM-wait T0 read set
 * IS the wiring that pin was waiting for (BLUE S2/S3 v6.2 section 3, category 8; CAL-TIME T-1 grant 4), and the pure S3 reader is its one
 * caller. No other production file may name it (b1-s2s3-scope-conformance.test.ts).
 */
export const B1_S2S3_SI_ORIGIN_WITNESS_PRODUCTION_CALLERS: readonly string[] = [];
