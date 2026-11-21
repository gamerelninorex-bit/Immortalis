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
//
// Two packages were added in repair round 1 (BLUE: a player+literal authority with NO credited stage and NO seal is lawful pre-S1 history that S1
// must still be able to finish). They were generated the same way, by the same unchanged build, through the real coordinator and kernel and the
// shipped gateway, in a throwaway checkout of `B1_S1_FROZEN_GENERATOR_COMMIT` (production admission untouched), by a generator script kept outside
// this tree (it is a recipe, not a dependency of any test):
//   authority-only                   the shipped gateway states the literal; the authority-open commits; the first owner stage never does (the
//                                    store reports an unknown outcome for that one group, as in a crash); the campaign is closed. No credited
//                                    stage, no sealed record.
//   authority-then-stage-free-seal   the same request, but the kernel refuses the owner stage non-fatally (IM-11); the transaction seals with
//                                    stages [] and holds the work; an ordinary-trigger continuation then completes it; then 130 ordinary pads
//                                    so that a checkpoint lies after the record.

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

/** The five packages, the transactions each holds, and the revisions the generator recorded. */
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
  "authority-only": {
    /** stage-bearing, interrupted BEFORE its first owner stage: the authority-open is the head; no credited stage, no sealed record */
    headRevision: 17,
    checkpointRevision: 0,
    authorityRevision: 17,
  },
  "authority-then-stage-free-seal": {
    /** authority-open, the owner stage refused (not credited), the stage-free seal over that authority, an ordinary continuation, then 130 pads */
    headRevision: 151,
    checkpointRevision: 128,
    authorityRevision: 17,
    sealRevision: 18,
    continuationSealRevision: 21,
  },
} as const;

/** Every file of the frozen tree, keyed by its path below `B1_S1_FROZEN_ROOT`. An empty `history` directory is not stored by git. */
export const B1_S1_FROZEN_FILES: Readonly<
  Record<string, { readonly bytes: number; readonly sha256: string }>
> = {
  "authority-only/expected.json": {
    bytes: 126642,
    sha256: "c21e05a56e3035fb04ebd10fc365fc5db84149156ad4130a6dfff6c2f52f6593",
  },
  "authority-only/package/journal.jsonl": {
    bytes: 113725,
    sha256: "801d8259218c0765a4df68d080b34995fb3bf2b88033f52ec6ec4909bf1da61d",
  },
  "authority-only/package/legacy-journal.v1.backup": {
    bytes: 0,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  "authority-only/package/legacy-manifest.v1.backup": {
    bytes: 2124,
    sha256: "b193b4e57f0d9737d6cbb6d1d85e95da4f09d04d6c17ca6148df70cf249410b0",
  },
  "authority-only/package/legacy-state.v1.backup": {
    bytes: 72,
    sha256: "2771c2554d803cef5a8366bdf14b3fb75af2b5a48d1f723d045716b806024dc7",
  },
  "authority-only/package/manifest.json": {
    bytes: 2709,
    sha256: "ddce9b2c128d5a805bed7b90aff59f6ca5059f06bdcd166d2be32482bf6cd98f",
  },
  "authority-only/package/state.0000000000.json": {
    bytes: 72,
    sha256: "2771c2554d803cef5a8366bdf14b3fb75af2b5a48d1f723d045716b806024dc7",
  },
  "authority-then-stage-free-seal/expected.json": {
    bytes: 825762,
    sha256: "aa8a4ffaf337e27f1e82bb6abb20fbb6c436be5b6d9caa6d56fe45f36326f74c",
  },
  "authority-then-stage-free-seal/package/history/index.0000000128.36853f374f2260181464834d659a906899598cf9317059e64ac4af5836b0eda9.json":
    {
      bytes: 864336,
      sha256: "85a510004cfa3af1a3f56eed66f2916d3d15d9775f48649fa791dd9899877900",
    },
  "authority-then-stage-free-seal/package/journal.jsonl": {
    bytes: 887447,
    sha256: "5432709af33a8b3a4f13bfc593839dbaf0877da674a21ad440533d421ea33cec",
  },
  "authority-then-stage-free-seal/package/legacy-journal.v1.backup": {
    bytes: 0,
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  "authority-then-stage-free-seal/package/legacy-manifest.v1.backup": {
    bytes: 2124,
    sha256: "b193b4e57f0d9737d6cbb6d1d85e95da4f09d04d6c17ca6148df70cf249410b0",
  },
  "authority-then-stage-free-seal/package/legacy-state.v1.backup": {
    bytes: 72,
    sha256: "2771c2554d803cef5a8366bdf14b3fb75af2b5a48d1f723d045716b806024dc7",
  },
  "authority-then-stage-free-seal/package/manifest.json": {
    bytes: 3059,
    sha256: "e4ea84869ad8cbb40dec937ca0b74710c5fabb990450cfe690aa00eeeb2048a6",
  },
  "authority-then-stage-free-seal/package/state.0000000128.json": {
    bytes: 403255,
    sha256: "b741f4cf59821bb423926bcd305160532cd604a46e423b4cc36f414033061476",
  },
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
