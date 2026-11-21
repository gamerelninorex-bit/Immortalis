// F-014B B1 S1 (live-versus-historical origin safety guard): custody of the FROZEN pre-S1 campaign packages and of the inert E1 baseline
// corpus. THE DESIGNATED TABLE for these values: no document, comment or other test file repeats any digest or length below.
//
// What the frozen packages are. Before S1, the canonical Temporal admission lawfully committed a player-pair transaction whose trigger kind
// is the literal named by the B0 module (a stage-less one, a stage-bearing one written by the shipped gateway, and an interrupted
// stage-bearing one whose seal never committed). After S1 no build can write such a record any more, so the journals that carry them are
// retained here as immutable packages, written ONCE by the UNCHANGED production build at `B1_S1_FROZEN_GENERATOR_COMMIT` (the main that
// S1 branched from), through the freeze hook of the S1 integration test (tests/integration/b1-s1-live-origin-guard.test.ts, mode FREEZE).
// They are test fixtures: nothing in the product reads them, and a test that reopens one always opens a PRIVATE COPY.
//
// Custody is bytes (length and SHA-256 of every file), never ancestry: a squash merge keeps the generator commit retrievable but does not
// keep it in the merged history, so no test asserts that it is an ancestor of HEAD. `expected.json` is the custody written at generation
// time: the whole-campaign summary (head, every fact, every receipt), the sealed record / authority capture per transaction, the
// revision of each sealed record, and the head revision.

/** The main the packages were generated from, with the production admission unchanged. */
export const B1_S1_FROZEN_GENERATOR_COMMIT = "0cff287a0fd01c9be993ae660d8dbf370596bb73";

/**
 * Where the generator lives: the freeze hook of the evidence harness (an integration test that is NOT part of this tree), run against the
 * generator commit above with `B1S1_FREEZE_TO=<dir>`. The evidence branch is retained as it was published; it is the reproduction recipe,
 * not a dependency of any test here.
 */
export const B1_S1_FROZEN_GENERATOR_SOURCE = {
  branch: "claude/f014b-b1-s1-evidence",
  commit: "bee637582fbc76b98328edb36c0ba09901ab7537",
  path: "tests/integration/b1-s1-contrasts.test.ts",
} as const;

export const B1_S1_FROZEN_ROOT = "tests/fixtures/b1-s1-frozen";

/** The three packages, the transactions each holds, and the revisions the generator recorded. */
export const B1_S1_FROZEN_PACKAGES = {
  zero: {
    /** stage-less: an ordinary transaction, then the literal one (the SEAL group is its only commit), then 130 ordinary pads */
    headRevision: 138,
    checkpointRevision: 128,
    ordinaryRevision: 7,
    literalRevision: 8,
  },
  stage: {
    /** stage-bearing through the shipped gateway: authority-open, one credited stage, seal; then 130 ordinary pads */
    headRevision: 149,
    checkpointRevision: 128,
    authorityRevision: 17,
    sealRevision: 19,
  },
  interrupted: {
    /** stage-bearing, interrupted: authority-open and the credited stage durable, the SEAL group never committed */
    headRevision: 18,
    checkpointRevision: 0,
    authorityRevision: 17,
  },
} as const;

/** Every file of the frozen tree, keyed by its path below `B1_S1_FROZEN_ROOT`. An empty `history` directory is not stored by git. */
export const B1_S1_FROZEN_FILES: Readonly<
  Record<string, { readonly bytes: number; readonly sha256: string }>
> = {
  "interrupted/expected.json": {
    bytes: 126924,
    sha256: "0430f53e79e1bb701f34dead9b57670fb592e84359f2fb9e1770c9cb5ba5fad5",
  },
  "interrupted/package/journal.jsonl": {
    bytes: 122162,
    sha256: "7bfa2a1e6312e91c099d86a6493b0cac402ce7fd94eff23bb8d8c8d449b74ec9",
  },
  "interrupted/package/legacy-journal.v1.backup": {
    bytes: 0,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  "interrupted/package/legacy-manifest.v1.backup": {
    bytes: 2124,
    sha256: "b193b4e57f0d9737d6cbb6d1d85e95da4f09d04d6c17ca6148df70cf249410b0",
  },
  "interrupted/package/legacy-state.v1.backup": {
    bytes: 72,
    sha256: "2771c2554d803cef5a8366bdf14b3fb75af2b5a48d1f723d045716b806024dc7",
  },
  "interrupted/package/manifest.json": {
    bytes: 2709,
    sha256: "c3bd6539e383d468ed616fb458909eebf42e556eb9dbef9ee9ba05806b656f61",
  },
  "interrupted/package/state.0000000000.json": {
    bytes: 72,
    sha256: "2771c2554d803cef5a8366bdf14b3fb75af2b5a48d1f723d045716b806024dc7",
  },
  "stage/expected.json": {
    bytes: 799863,
    sha256: "25c6995a9b392e76c584daf190e21d1cdd54ca426d6bd379b3db60da6ecc7c9f",
  },
  "stage/package/history/index.0000000128.36853f374f2260181464834d659a906899598cf9317059e64ac4af5836b0eda9.json":
    {
      bytes: 864280,
      sha256: "44f1514641938d0637e2b3f7f5fbda8b96a53d7e8dc9ea3f987c2a20ec7c8fc1",
    },
  "stage/package/journal.jsonl": {
    bytes: 876364,
    sha256: "843c5a7ac4dc83b3847d4653f234a9c9d03d8e48abd9ceebf29adfdcce160377",
  },
  "stage/package/legacy-journal.v1.backup": {
    bytes: 0,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  "stage/package/legacy-manifest.v1.backup": {
    bytes: 2124,
    sha256: "b193b4e57f0d9737d6cbb6d1d85e95da4f09d04d6c17ca6148df70cf249410b0",
  },
  "stage/package/legacy-state.v1.backup": {
    bytes: 72,
    sha256: "2771c2554d803cef5a8366bdf14b3fb75af2b5a48d1f723d045716b806024dc7",
  },
  "stage/package/manifest.json": {
    bytes: 3059,
    sha256: "187b5b2027b32b33105c6366d59fa9590622efdd69f29e8e05d30b37a4d2bec8",
  },
  "stage/package/state.0000000128.json": {
    bytes: 403765,
    sha256: "b5640118f0897c3d6b9b667276c0e2d758d8b4600e0b92d35e3774e317048a21",
  },
  "zero/expected.json": {
    bytes: 705417,
    sha256: "95f3e50865daa978b2d890efff4d18f797e2abe0087eb75e77e8d15f3d1dfdf8",
  },
  "zero/package/history/index.0000000128.36853f374f2260181464834d659a906899598cf9317059e64ac4af5836b0eda9.json":
    {
      bytes: 864820,
      sha256: "9b1d67a05fa9af0924768f16bd7a142ea7cd1287828da622be1b905815ca059f",
    },
  "zero/package/journal.jsonl": {
    bytes: 784895,
    sha256: "6045c5639095d5e7f1ba108c826d453a5c53e6ea765931adc90baacc4bd41649",
  },
  "zero/package/legacy-journal.v1.backup": {
    bytes: 0,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  "zero/package/legacy-manifest.v1.backup": {
    bytes: 2111,
    sha256: "6a3100c2d642423aebb0b61d65ce76de9fae29e1db7b13e50375b46b6a265a9b",
  },
  "zero/package/legacy-state.v1.backup": {
    bytes: 83,
    sha256: "6ff4d42b5144ebe29621baa1e5ee2efecbd485b0bff06d596276a81c0e69d621",
  },
  "zero/package/manifest.json": {
    bytes: 3051,
    sha256: "ebe8715d20a3b57d82f81e345969c1c40c5366c97da807d66cf55d703fb5a7a2",
  },
  "zero/package/state.0000000128.json": {
    bytes: 388791,
    sha256: "99c134e9b9a886743646a34c85952c08eb082b8495f977f2771d59b0a7a992d9",
  },
};
