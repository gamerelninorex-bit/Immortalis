// ROADBED R3-T25 freight: the historical byte-identity assertions that older conformance suites carried on source files or trees this slice
// changed, as they stood at the recorded base. Each suite replaced its assertion with a comment (the M-S slice did the same when it changed
// the temporal and commit trees). Nothing is lost silently: every removed value is recorded here and tests/conformance/freight-profile-
// conformance.test.ts recomputes each from the base commit's own bytes where Git history is available (a shallow checkout skips it and says
// so). What the older suites no longer assert is that these paths are UNCHANGED, which is no longer true on purpose; the slice-head bytes of
// each changed file are pinned in tests/support/freight-scoped-deltas.ts instead (the files whose head identity another table owns are
// covered structurally by freight-profile-conformance and their own owner tables).
export interface RemovedHistoricalPin {
  readonly suite: string;
  readonly path: string;
  /** the SHA-256 the suite asserted: of the file's bytes, or (for a directory) of the sorted `path\0sha256\n` tree */
  readonly value: string;
}

export const REMOVED_HISTORICAL_PINS: readonly RemovedHistoricalPin[] = [
  {
    suite: "tests/conformance/advance-request-conformance.test.ts",
    path: "packages/engine/src/temporal/admission.ts",
    value: "3990ae27fd762da31553118d3c9502b60fa74c4c4fc334399be2a5d6f132620d",
  },
  {
    suite: "tests/conformance/advance-request-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/auditory-premises-conformance.test.ts",
    path: "packages/engine/src/persistence",
    value: "91957dbee278d08fb70814e1bb1ea79894fecc8f383db4d6cdf375b5e98e3a14",
  },
  {
    suite: "tests/conformance/auditory-premises-conformance.test.ts",
    path: "packages/engine/src/temporal",
    value: "0dc735d59959ec6ecd752a1a0b531bf10f564ff1f25dfca886814f39a769ffbb",
  },
  {
    suite: "tests/conformance/corridor-conformance.test.ts",
    path: "packages/engine/src/logistics/declaration.ts",
    value: "275092dad76b75a328ad35462cbce3fab272c9e76f450c6aac322ccb6c2e18a3",
  },
  {
    suite: "tests/conformance/corridor-conformance.test.ts",
    path: "packages/engine/src/logistics/provider.ts",
    value: "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  },
  {
    suite: "tests/conformance/corridor-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/economy-reallocation-conformance.test.ts",
    path: "packages/engine/src/economy/integrity.ts",
    value: "93548d9357bc317fe9dd253956353ee840424ac69eaa41e2287a0f7825e2145b",
  },
  {
    suite: "tests/conformance/economy-reallocation-conformance.test.ts",
    path: "packages/engine/src/persistence/store.ts",
    value: "2405d8f8d8afa44bcb63e6a5ef73a476b1a3632f63c307c5d615ef7b063f4ff1",
  },
  {
    suite: "tests/conformance/initial-local-demand-conformance.test.ts",
    path: "packages/engine/src/economy/integrity.ts",
    value: "93548d9357bc317fe9dd253956353ee840424ac69eaa41e2287a0f7825e2145b",
  },
  {
    suite: "tests/conformance/initial-local-demand-conformance.test.ts",
    path: "packages/engine/src/production/admission.ts",
    value: "00a008aaccdb38a48bda1f101327ff5edbc31be67ea545127d2719fe12aac8b6",
  },
  {
    suite: "tests/conformance/initial-local-demand-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/initial-population-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/initial-timed-governance-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/ms-setup-regression-pins.test.ts",
    path: "packages/engine/src/temporal/admission.ts",
    value: "3990ae27fd762da31553118d3c9502b60fa74c4c4fc334399be2a5d6f132620d",
  },
  {
    suite: "tests/conformance/ms-setup-regression-pins.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/observation-conformance.test.ts",
    path: "packages/engine/src/temporal/admission.ts",
    value: "3990ae27fd762da31553118d3c9502b60fa74c4c4fc334399be2a5d6f132620d",
  },
  {
    suite: "tests/conformance/observation-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/operator-conformance.test.ts",
    path: "packages/contracts/src/logistics.ts",
    value: "2030cb9ad580464eebd52ec26d44fd8dfdddeb5e75fe171db69db3b881786df1",
  },
  {
    suite: "tests/conformance/operator-conformance.test.ts",
    path: "packages/engine/src/persistence/file-package.ts",
    value: "50d5a2bd7bc0940f43212ee494d24b3b71d6aef658f645fb59aea2565754a9ea",
  },
  {
    suite: "tests/conformance/operator-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/original-locality-conformance.test.ts",
    path: "packages/engine/src/persistence/file-package.ts",
    value: "50d5a2bd7bc0940f43212ee494d24b3b71d6aef658f645fb59aea2565754a9ea",
  },
  {
    suite: "tests/conformance/original-pc-conformance.test.ts",
    path: "packages/engine/src/persistence/file-package.ts",
    value: "50d5a2bd7bc0940f43212ee494d24b3b71d6aef658f645fb59aea2565754a9ea",
  },
  {
    suite: "tests/conformance/original-pc-locus-conformance.test.ts",
    path: "packages/engine/src/persistence/file-package.ts",
    value: "50d5a2bd7bc0940f43212ee494d24b3b71d6aef658f645fb59aea2565754a9ea",
  },
  {
    suite: "tests/conformance/production-reserve-conformance.test.ts",
    path: "packages/engine/src/production/admission.ts",
    value: "00a008aaccdb38a48bda1f101327ff5edbc31be67ea545127d2719fe12aac8b6",
  },
  {
    suite: "tests/conformance/protocol-current-observation-glance-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/protocol-null-pc-ooc-advance-conformance.test.ts",
    path: "packages/engine/src/logistics/provider.ts",
    value: "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  },
  {
    suite: "tests/conformance/protocol-null-pc-ooc-advance-conformance.test.ts",
    path: "packages/engine/src/temporal/admission.ts",
    value: "3990ae27fd762da31553118d3c9502b60fa74c4c4fc334399be2a5d6f132620d",
  },
  {
    suite: "tests/conformance/protocol-null-pc-ooc-advance-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/protocol-null-pc-ooc-held-continuation-conformance.test.ts",
    path: "packages/engine/src/logistics/provider.ts",
    value: "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  },
  {
    suite: "tests/conformance/protocol-null-pc-ooc-held-continuation-conformance.test.ts",
    path: "packages/engine/src/temporal/admission.ts",
    value: "3990ae27fd762da31553118d3c9502b60fa74c4c4fc334399be2a5d6f132620d",
  },
  {
    suite: "tests/conformance/protocol-null-pc-ooc-held-continuation-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/protocol-original-pc-target-advance-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/protocol-pc-corridor-relocation-conformance.test.ts",
    path: "packages/contracts/src/logistics.ts",
    value: "2030cb9ad580464eebd52ec26d44fd8dfdddeb5e75fe171db69db3b881786df1",
  },
  {
    suite: "tests/conformance/protocol-pc-corridor-relocation-conformance.test.ts",
    path: "packages/engine/src/logistics/admission.ts",
    value: "3c3c1a577e274139c26c266781ac2839e7123b76e545d24fcceb4b798df67bcd",
  },
  {
    suite: "tests/conformance/protocol-pc-corridor-relocation-conformance.test.ts",
    path: "packages/engine/src/logistics/declaration.ts",
    value: "275092dad76b75a328ad35462cbce3fab272c9e76f450c6aac322ccb6c2e18a3",
  },
  {
    suite: "tests/conformance/protocol-pc-corridor-relocation-conformance.test.ts",
    path: "packages/engine/src/logistics/integrity.ts",
    value: "4eb298089ebfd930f40d80a1ea6fb433bfc4308f7aef2454c469f1ae773f1fef",
  },
  {
    suite: "tests/conformance/protocol-pc-corridor-relocation-conformance.test.ts",
    path: "packages/engine/src/logistics/provider.ts",
    value: "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  },
  {
    suite: "tests/conformance/protocol-pc-corridor-relocation-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/protocol-pc-relocation-conformance.test.ts",
    path: "packages/contracts/src/logistics.ts",
    value: "2030cb9ad580464eebd52ec26d44fd8dfdddeb5e75fe171db69db3b881786df1",
  },
  {
    suite: "tests/conformance/protocol-pc-relocation-conformance.test.ts",
    path: "packages/engine/src/logistics/admission.ts",
    value: "3c3c1a577e274139c26c266781ac2839e7123b76e545d24fcceb4b798df67bcd",
  },
  {
    suite: "tests/conformance/protocol-pc-relocation-conformance.test.ts",
    path: "packages/engine/src/logistics/declaration.ts",
    value: "275092dad76b75a328ad35462cbce3fab272c9e76f450c6aac322ccb6c2e18a3",
  },
  {
    suite: "tests/conformance/protocol-pc-relocation-conformance.test.ts",
    path: "packages/engine/src/logistics/derive.ts",
    value: "fb9e3e55e9549c9048f2aabae36e3c622245efb0d82bb62b1348f91bd5b5a6f4",
  },
  {
    suite: "tests/conformance/protocol-pc-relocation-conformance.test.ts",
    path: "packages/engine/src/logistics/integrity.ts",
    value: "4eb298089ebfd930f40d80a1ea6fb433bfc4308f7aef2454c469f1ae773f1fef",
  },
  {
    suite: "tests/conformance/protocol-pc-relocation-conformance.test.ts",
    path: "packages/engine/src/logistics/provider.ts",
    value: "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  },
  {
    suite: "tests/conformance/protocol-pc-relocation-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/protocol-pc-target-advance-conformance.test.ts",
    path: "packages/contracts/src/logistics.ts",
    value: "2030cb9ad580464eebd52ec26d44fd8dfdddeb5e75fe171db69db3b881786df1",
  },
  {
    suite: "tests/conformance/protocol-pc-target-advance-conformance.test.ts",
    path: "packages/engine/src/temporal/admission.ts",
    value: "3990ae27fd762da31553118d3c9502b60fa74c4c4fc334399be2a5d6f132620d",
  },
  {
    suite: "tests/conformance/protocol-pc-target-advance-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
  {
    suite: "tests/conformance/protocol-pc-transfer-advance-conformance.test.ts",
    path: "packages/contracts/src/logistics.ts",
    value: "2030cb9ad580464eebd52ec26d44fd8dfdddeb5e75fe171db69db3b881786df1",
  },
  {
    suite: "tests/conformance/protocol-pc-transfer-advance-conformance.test.ts",
    path: "packages/engine/src/logistics/declaration.ts",
    value: "275092dad76b75a328ad35462cbce3fab272c9e76f450c6aac322ccb6c2e18a3",
  },
  {
    suite: "tests/conformance/protocol-pc-transfer-advance-conformance.test.ts",
    path: "packages/engine/src/logistics/derive.ts",
    value: "fb9e3e55e9549c9048f2aabae36e3c622245efb0d82bb62b1348f91bd5b5a6f4",
  },
  {
    suite: "tests/conformance/protocol-pc-transfer-advance-conformance.test.ts",
    path: "packages/engine/src/logistics/provider.ts",
    value: "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  },
  {
    suite: "tests/conformance/protocol-pc-transfer-advance-conformance.test.ts",
    path: "packages/engine/src/temporal/admission.ts",
    value: "3990ae27fd762da31553118d3c9502b60fa74c4c4fc334399be2a5d6f132620d",
  },
  {
    suite: "tests/conformance/protocol-pc-transfer-advance-conformance.test.ts",
    path: "packages/engine/src/temporal/coordinator.ts",
    value: "f06f3121b81375e38c091fb06b8ace0a6fa8e7030cb7aa1ad95c5e8d24279111",
  },
];
