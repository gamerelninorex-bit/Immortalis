// F-014B A0 (CAL-TIME T-1 clock-origin T1 mechanism): the source files this slice changed, as scoped deltas. `base` is the SHA-256 the file
// carried at the recorded base commit (main after PR #115, the A0 intake); `head` is the SHA-256 at the A0 head. Where an EARLIER slice's table
// also lists a path, that table's `head` is exactly this `base` (the chain of custody is checked by tests/conformance/a0-scope-conformance.test.ts),
// and the earlier slice's own suite stops asserting the working tree for that path and asserts the chain instead.
//
// Not listed with hashes, by design: the files whose present-day identity is stated in exactly one other place, which no other test file may
// repeat (historical-pin-provenance-conformance and current-look-lowering-conformance enforce it) -- the contracts index and owner admission
// (tests/support/present-day-identities.ts) and the owner registry (current-look-lowering-conformance). They are named in `A0_PRESENT_DAY_FILES`
// so that the older "nothing else changed" suites can allow exactly them. A later change to any file below updates this table only.
export const A0_BASE_COMMIT = "8d25f9067219d944a5262eca06de20e70a5770f3";
/** The census anchor of the A0 source lock (section 8): the 28 census files are byte-identical on A0_BASE_COMMIT. */
export const A0_CENSUS_COMMIT = "0c9e74b9d5dc8845751a543ace777277b2cb1308";
/** The accepted, immutable source-lock commit; it stays an ancestor of the A0 branch. */
export const A0_SOURCE_LOCK_COMMIT = "37ba11bd0f0f068a22731f87351a0fd9a16a885b";
/**
 * Main after F-014B B0 (PR #117, squash-merged) was integrated into the A0 branch by a non-rewriting merge. Against THIS commit the A0 slice
 * changes exactly `A0_PACKAGE_PATHS` under packages/ and apps/; against `A0_BASE_COMMIT` it additionally differs by the declared main inclusions.
 */
export const A0_INTEGRATED_MAIN_COMMIT = "acf0da17d4c45e48114b1e3d9ec98052128fe6ea";
/** Files that main gained between `A0_BASE_COMMIT` and `A0_INTEGRATED_MAIN_COMMIT` under packages/ and apps/ (B0's one pure request module). */
export const A0_DECLARED_MAIN_INCLUSIONS: readonly string[] = [
  "packages/contracts/src/temporal-gm-wait.ts",
];

export const A0_SCOPED_DELTAS: Readonly<
  Record<string, { readonly base: string; readonly head: string }>
> = {
  "packages/contracts/src/initial-locality.ts": {
    base: "dac14adffd5812c0b446346b6e5cdf50ce60c9a079f47208a87934b62cba58dc",
    head: "4d07ec19fb1c8fe9d6199463257bcc5e5c11d3eb6227eb6ea28b11df1893dc94",
  },
  "packages/contracts/src/spec-identity.ts": {
    base: "0a6da9f560fb7cfbd19f23b91045b0b1cfba5a3519b9fd1b965d6b375515eebc",
    head: "6701b03ad1eb2dab085c64118e1f1fedb42de6603298fa588c440e7bedfba0c6",
  },
  "packages/engine/src/initial-setup/admission.ts": {
    base: "a8ca653444c5b99a108269915b0ef265a567217513cddee04e7f3e2c250d6484",
    head: "a0ef0215126934036394399e30cc5e4f662c863e1e63eafcc155477706bf4c8f",
  },
  "packages/engine/src/initial-setup/identity.ts": {
    base: "f1b2ca4a7e35d9cd6cc984fb7b12cd275d186616ecc927bce162737096957954",
    head: "aaeae151ef73acd9a18080fa9311c1bc0c60a10fa536c846bd16306761115f46",
  },
  "packages/engine/src/initial-setup/publish.ts": {
    base: "aea5714117e2d7df7b2ad292ca7450600298cf7116380198f5ade60c2deececa",
    head: "2e8218787e32eaa2542558b64d11ca8ccf45a425f1d1781c8c59d590b1ea8543",
  },
  "packages/engine/src/initial-setup/rules.ts": {
    base: "c4b0ac659f9220be8edcdd9d16030129122ce9e0c0841f41c56d1d948d4f6562",
    head: "5e0de8a0757a168686d599a6e3da6192381db7a6cdcc80a6fc9e82e1b79aa773",
  },
  "packages/engine/src/initial-setup/sunset-guard.ts": {
    base: "e3d8ee7c420d90fc10ccfba8b0b1f53aa31549b22d99b11bff4c437c9165f031",
    head: "dd6924704b3da251d34cc709ceebefc103d6614faf657678f3aa2eb9a1139866",
  },
  "packages/engine/src/initial-setup/sunset-policy.ts": {
    base: "714b1e905525e6e4b25d48a8e3b571f6527da2d3589aa554027738fd4df4be77",
    head: "162c8750b27d3a6816c21880eb512bfac5969218f0d1aae4afb284c31ebd2d03",
  },
  "packages/engine/src/ms-setup/fence.ts": {
    base: "97fce41b09626dc1d6cdcb9b45f5b06fe2578632722f3ec0a3e1e6c6c03c03f8",
    head: "b111f0d09cbe0f2a335cff8fc2c63c06cd82a9541e12cd74a0c69b4162aae122",
  },
  "packages/engine/src/ms-setup/integrity.ts": {
    base: "9f15bf0ffd39f386e608a3a64825fc0bbab5c082bfd42ac0a6960700c1876894",
    head: "a0c77f7498de4f4a7b1706f44fbacdc3c65931d561fec43663bb4c94a727e2cc",
  },
  "packages/engine/src/ms-setup/prefix.ts": {
    base: "daebf3a72475f89511ba08be7ffb258c5e1d0dc1e082014be36cc732b6c4f79e",
    head: "bfe32ccee306f3b4f4e6d323e0adaa86056a2bfbdb4a1746f798e2dd7419b7a7",
  },
  "packages/engine/src/temporal/admission.ts": {
    base: "fc7bb7ff4d03a082c46ef4d52ce5ba3ad51f37b22f612175d5be3a9a86d09667",
    head: "cf4071f768034b1612bc0d0843879bd77b817b2a33bfcd31d2569fcadf2f2dc7",
  },
  "packages/engine/src/temporal/bootstrap.ts": {
    base: "ebe3f575666e768a873ab8d3d8fa47376c53cd5513f88a581d728a9156548a63",
    head: "a71522821c646a18362eaf116e0c7cff01087fa9008673f59bb3e38640b369a8",
  },
  "packages/engine/src/temporal/captured-chronology.ts": {
    base: "6845765e6e8c1b4830d181f55992253362daadab6a9bcc8cbf5b51410cc9e0e9",
    head: "3fedb279a4fd9a307a18e621ce4c092f8cca25c6b4a17ec0bbef04b276b56964",
  },
  "packages/engine/src/temporal/coordinator.ts": {
    base: "36b5115b2721ba6999bbbe2d812cadb8990acd5afd933a31371e30a45c5cfcde",
    head: "c138ada3710a3b249e70e94b14510ac04ccb4a1793e8ad9411e3cc7d67821d68",
  },
};

/** Predecessor files this slice changed whose present-day identity is stated in exactly one other place. */
export const A0_PRESENT_DAY_FILES: readonly string[] = [
  "packages/contracts/src/index.ts",
  "packages/engine/src/owners/admission.ts",
  "packages/engine/src/owners/registry.ts",
];

/** The new source modules of this slice. */
export const A0_NEW_MODULES: readonly string[] = ["packages/contracts/src/temporal-origin.ts"];

/** Every path under packages/ this slice changed or added (the allow-list the older "nothing else changed" suites extend). */
export const A0_PACKAGE_PATHS: readonly string[] = [
  ...Object.keys(A0_SCOPED_DELTAS).filter((p) => p.startsWith("packages/")),
  ...A0_PRESENT_DAY_FILES,
  ...A0_NEW_MODULES,
];

/** The non-package files this slice changed: the lock and its checker (policed by tools/check-spec.ts and the custody conformance suite), and the OB-030 measurement harness (measurement only, no production authority). */
export const A0_OUTSIDE_PACKAGE_PATHS: readonly string[] = [
  "spec/f027/spec-lock.json",
  "tools/a0-ob030-benchmark.sh",
  "tools/a0-ob030-benchmark.ts",
  "tools/check-spec.ts",
];

/**
 * Custody of the immutable accepted A0 source-lock artifacts, recomputed from the bytes: the document the lowering row's custody pointer
 * names, its preflight submission, and the v1 baseline corpus test. They are fixed by BLUE's PASS and may not be edited by this slice.
 */
export const A0_CUSTODY_ARTIFACTS: Readonly<
  Record<string, { readonly bytes: number; readonly sha256: string }>
> = {
  "docs/f014b/a0-clock-origin-source-lock.md": {
    bytes: 90405,
    sha256: "0dd3991aa261d74deca5902cd0af13f0b954ec7ac116689011a2098b24aec276",
  },
  "docs/f014b/a0-preflight-submission.md": {
    bytes: 28599,
    sha256: "2a0b0988ba13b0da8a895b592cfadbe6ff37df23cbbf48a0483dca83eb8a3c23",
  },
  "tests/contract/chronology-v1-baseline-corpus.test.ts": {
    bytes: 11598,
    sha256: "228c307cdf201daa8ead30a690207ed7bb9c21ea609e7650a1bab9c537066123",
  },
};
