// BLUE F-014B S-4 initial Standing Instruction ledger: the predecessor source files this slice changed, as scoped deltas. `base` is the SHA-256 the
// file carried at the recorded base commit (main, PR #106 merged); `head` is the SHA-256 at the slice head. The two files below were last changed by
// the ROADBED freight slice, so each `base` is exactly that slice's recorded `head` (tests/support/freight-scoped-deltas.ts): the chain is checked by
// tests/conformance/pc-standing-ledger-conformance.test.ts. A later change to either file updates this table only.
//
// Not listed with hashes, by design: the files whose present-day identity is stated in exactly one other place, which no other test file may repeat
// (historical-pin-provenance-conformance and current-look-lowering-conformance enforce it) -- the files of tests/support/present-day-identities.ts that
// this slice also changed, and packages/engine/src/owners/registry.ts (current-look-lowering-conformance). They are named in
// `S4_PRESENT_DAY_FILES` so that the older "nothing else changed" suites can allow exactly them.
export const S4_BASE_COMMIT = "c6ea29d3ccd7cadb83a622dc47704f449f63513b";

export const S4_SCOPED_DELTAS: Readonly<
  Record<string, { readonly base: string; readonly head: string }>
> = {
  // the reviewed sunset policy gains the two ledger kinds' rows (OWNER_CHECKS_ONLY), and the guard reads the table that carries them
  "packages/engine/src/initial-setup/sunset-guard.ts": {
    base: "f3089c76a12eb817bf35e08033f00fdb2ed6865586b21b0f52ea0905501faf8e",
    head: "e3d8ee7c420d90fc10ccfba8b0b1f53aa31549b22d99b11bff4c437c9165f031",
  },
  "packages/engine/src/initial-setup/sunset-policy.ts": {
    base: "4fbace8468c8318749f964b346c05ccd474717fb60bd24f759462fa0304a02c9",
    head: "714b1e905525e6e4b25d48a8e3b571f6527da2d3589aa554027738fd4df4be77",
  },
};

/** Predecessor files this slice changed whose present-day identity is stated in exactly one other place. */
export const S4_PRESENT_DAY_FILES: readonly string[] = [
  "packages/contracts/src/index.ts",
  "packages/engine/src/index.ts",
  "packages/engine/src/owners/admission.ts",
  "packages/engine/src/owners/registry.ts",
  "packages/engine/src/world/canonical-campaign.ts",
  "packages/engine/src/world/integrity.ts",
  "packages/operator/src/original-pc.ts",
];

/** The new source modules of this slice. */
export const S4_NEW_MODULES: readonly string[] = [
  "packages/contracts/src/pc-standing-ledger.ts",
  "packages/engine/src/owners/pc-standing-ledger-admission.ts",
  "packages/engine/src/owners/pc-standing-ledger.ts",
];
