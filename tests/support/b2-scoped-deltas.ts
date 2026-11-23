// F-014B B2 (GM-wait Temporal custody: wait identity, protected marker, by-PC index, common write protection; MECHANISM ONLY): the source files
// this slice changed, as scoped deltas. `base` is the SHA-256 the file carried at the recorded base commit (main after the B1 v2 catalogue
// successor, the B2 intake); `head` is the SHA-256 at the B2 head. The older "nothing else changed" suites extend their allow-lists from
// `B2_PACKAGE_PATHS` (a union with whatever their own table already names: see `unionPaths`), and
// tests/conformance/b2-scope-conformance.test.ts polices this table itself (every head is the file's bytes now, every base is what the base
// commit's bytes hash to, the changed set is exact, and nothing forbidden moved).
//
// Present-day identities that are stated in exactly ONE other place (the contracts index, owner admission, the owner registry; see
// tests/support/present-day-identities.ts) are listed in `B2_PRESENT_DAY_FILES` without a hash here, as the A0 table does.
//
// A later change to a file below updates this table and nothing else.
export const B2_BASE_COMMIT = "940a1ca29b34af8488c9ea3ea2f1903aeba52660";

export const B2_SCOPED_DELTAS: Readonly<
  Record<string, { readonly base: string; readonly head: string }>
> = {
  "packages/engine/src/commit/campaign-core.ts": {
    base: "0b7f2f4c5e7ab37eb739291120b25f1577c1b7f87fa9f879d89814b074a8be9b",
    head: "41c21034ec40099d606c8672db4e84edf6dfdd4b3221ae3d3d8b8898945d07fc",
  },
  "packages/engine/src/gm-wait-catalogue-current.ts": {
    base: "0b41407ae20f67e2a4a274ee2bee636f45ff65a7cdff8f1feb4b46282a8927bd",
    head: "89854ed0fc59b3efa1c6dde3890fb9ef29bdbe5ecfd5441ea1d36596fe3b9b21",
  },
  "packages/engine/src/initial-setup/sunset-guard.ts": {
    base: "dd6924704b3da251d34cc709ceebefc103d6614faf657678f3aa2eb9a1139866",
    head: "6e2c5549b1ea837f867b7c2ca79b2f35d7386cd6e3606892e4327d0bdd570d0a",
  },
  "packages/engine/src/initial-setup/sunset-policy.ts": {
    base: "162c8750b27d3a6816c21880eb512bfac5969218f0d1aae4afb284c31ebd2d03",
    head: "dd69aa15015dde8bd746141f3e3cfd0ebb58e2f8f7d570eea6d2f72e4d993fcb",
  },
  "packages/engine/src/owners/extension.ts": {
    base: "34ef1eda9c1ba6895bd42f5d609f98c9293e45216cc164a0599ad3e676d8e9df",
    head: "9bb80e771ad34e6879a2138d08e5801952f2c3c577cc1dd67bd6d3050cb38bf1",
  },
  "packages/engine/src/persistence/checkpoint-package.ts": {
    base: "ba5e848e6d625f17a9a108f2e248e6b2e430185d80ed3d251fa630b648b53ebe",
    head: "3cf3dfde8e086358712dc7a84f41e353e0f8df3dc2bd46b22d24f5996752b015",
  },
  "packages/engine/src/persistence/file-package.ts": {
    base: "218a095c6d01afa04fe9298f2f6a9da0f36c425b2e0c80cac44d1990b66149a0",
    head: "87914790ef7f0e4729573a2d67d729daffcdb15c46276cc7b9397e9861bde680",
  },
  "packages/engine/src/temporal/admission.ts": {
    base: "58a48ae262ef72424cc53d88202339244aadde50897dc299b23bdee36c4029c4",
    head: "0a0eceab61eed0ccd0251e806bdd6db17ed075a413a1e0f8f012cd91fd299ae4",
  },
  "packages/engine/src/temporal/coordinator.ts": {
    base: "c138ada3710a3b249e70e94b14510ac04ccb4a1793e8ad9411e3cc7d67821d68",
    head: "59a082af663a17eccd85dd7f44ac5d51181073d455add0727ea62b89801465fd",
  },
  "packages/engine/src/temporal/integrity.ts": {
    base: "8e0be8a4635d3827ee65a8388844b512c8fd2413f89cb254cb560e5e90d52918",
    head: "c9c5782736e956bcafac6a6f82e2b1802632c1d344f8e8d4e7240c15bc4eaafd",
  },
};

/** Predecessor files this slice changed whose present-day identity is stated in exactly one other place. */
export const B2_PRESENT_DAY_FILES: readonly string[] = [
  "packages/contracts/src/index.ts",
  "packages/engine/src/index.ts",
  "packages/engine/src/owners/admission.ts",
  "packages/engine/src/owners/registry.ts",
];

/** The new package files of this slice (production modules and the generated catalogue manifest). */
export const B2_NEW_MODULES: readonly string[] = [
  "packages/contracts/src/temporal-custody.ts",
  "packages/engine/gm-wait-catalogue/manifests/7707ff8ec86a9564dae2b026e730386f26fadfd4011c2934d0cc19dd5a6f09ed.json",
  "packages/engine/src/gm-wait-custody.ts",
  "packages/engine/src/gm-wait-identity.ts",
];

/** Every path under packages/ this slice changed or added. */
export const B2_PACKAGE_PATHS: readonly string[] = [
  ...Object.keys(B2_SCOPED_DELTAS),
  ...B2_PRESENT_DAY_FILES,
  ...B2_NEW_MODULES,
];

/** A path list that names each path once: the older suites' allow-lists are unions, and B2 changes files an earlier slice also changed. */
export const unionPaths = (...lists: readonly (readonly string[])[]): string[] =>
  [...new Set(lists.flat())].sort();

/**
 * The identity an OLDER slice's pin must resolve to in the working tree. An older slice recorded a head that was the file's bytes when it
 * landed. If B2 later changed the file, the older head is exactly B2's base (the chain of custody) and the bytes now are B2's head; if not,
 * the older head is still the bytes now. A path B2 changed whose older head is NOT B2's base is a broken chain and is refused loudly.
 */
export function bytesNowGiven(path: string, olderHead: string): string {
  const b2 = B2_SCOPED_DELTAS[path];
  if (!b2) return olderHead;
  if (b2.base !== olderHead)
    throw new Error(`${path}: the older head is not B2's base, the chain of custody is broken`);
  return b2.head;
}

/**
 * The production files this slice adds that spell the reserved GM trigger literal, with the reason each may (the B1 S1 census extends from here).
 * The contracts module states the discriminator of the strict prospective GM variants; it equals the B0 constant, pinned by
 * tests/contract/b2-gm-wait-contracts.test.ts, because the contracts index must not export the unexported B0 module.
 */
export const B2_LITERAL_FILES: Readonly<Record<string, string>> = {
  "packages/contracts/src/temporal-custody.ts":
    "B2: the origin discriminator of the strict prospective GM-wait variants (marker, authority, transaction); pinned equal to the B0 constant, because the unexported B0 module cannot be imported by the contracts index",
};

/**
 * The F-014B B0 section 5.1 files this slice edits BEYOND the four A0 source-transition files, with the reason (tests/conformance/gm-wait-b0-conformance.test.ts
 * extends its exemption from here and checks each one). `integrity.ts` must parse the strict GM variant of the transaction and authority and check custody
 * coherence, or a loaded campaign holding a GM wait could not pass the kernel's own integrity verification. The three protocol conformance suites each carried
 * ONE byte pin of that file (the key line and its hash line); the pin is replaced by a comment, as earlier slices did for the files they changed, and the path
 * is pinned instead as a scoped delta of this table.
 */
export const B2_B0_SECTION_5_1_EDITS: Readonly<Record<string, string>> = {
  "packages/engine/src/temporal/integrity.ts":
    "B2: the kernel integrity verifier parses the stored union of the legacy and the strict GM transaction and authority and checks custody coherence",
  "tests/conformance/protocol-null-pc-ooc-advance-conformance.test.ts":
    "B2: the byte pin of temporal/integrity.ts is replaced by a comment (the path is a scoped delta of the B2 table)",
  "tests/conformance/protocol-null-pc-ooc-held-continuation-conformance.test.ts":
    "B2: the byte pin of temporal/integrity.ts is replaced by a comment (the path is a scoped delta of the B2 table)",
  "tests/conformance/protocol-pc-target-advance-conformance.test.ts":
    "B2: the byte pin of temporal/integrity.ts is replaced by a comment (the path is a scoped delta of the B2 table)",
};

/** Evidence written by this slice (custody, mutation results, collisions, cost): any file under this prefix is declared. */
export const B2_EVIDENCE_PREFIX = "docs/evidence/f014b-b2/";
