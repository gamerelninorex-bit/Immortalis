// ROADBED GM-native first-profile freight bridge: the predecessor source files this slice changed, as scoped deltas. `base` is the SHA-256 the file
// carried at the recorded base commit; `head` is the SHA-256 at the slice head. Older conformance suites no longer pin these paths (their pins were
// removed with a comment, see tests/support/gm-freight-removed-pins.ts); THIS table is where they are pinned, by
// tests/conformance/gm-freight-conformance.test.ts. A later change to any of them updates this table only.
//
// Not listed here, by design: packages/contracts/src/index.ts and packages/engine/src/index.ts (one export line each), whose present-day identities,
// and those of the two trees the slice also changed (packages/operator/src, packages/protocol/src), are stated in exactly one other place
// (tests/support/present-day-identities.ts), which no other test file may repeat.
export const GM_FREIGHT_BASE_COMMIT = "49c2892344104ed530b87abf38ee1afee82d4c35";

export const GM_FREIGHT_SCOPED_DELTAS: Readonly<
  Record<string, { readonly base: string; readonly head: string }>
> = {
  // the NULL-PC gateways additionally register the shipped first-profile freight receipt provider (R3-T2 §4 `LD → WT → LR → ER`), so the earned ER
  // stage is resolved by its owner instead of stopping the transaction PROVIDER_ABSENT
  "packages/protocol/src/null-pc-ooc-advance.ts": {
    base: "b3fe9e0c2be291ae5ea6670df42e59fde1121a35c01254230a083dd676c17c68",
    head: "1bbfd037bf490d3bea0afc74cf35db73a09f705e7289904cbe8b49f56d27d1cd",
  },
  "packages/protocol/src/null-pc-ooc-held-continuation.ts": {
    base: "4040a181a8b081d5d9a8c265185b13a4d559e829500a5c5986e776e4b703343c",
    head: "94a6bed2c4bf8762a487b0d99294666dccf664ede108d104dcd4ed05287c484b",
  },
  // two further bin entry points (immortalis-gm-freight, immortalis-gm-freight-bind); no dependency changed
  "packages/operator/package.json": {
    base: "80925fae3972571622e7871ce4925baabdc58aad1071cee951cf402b4167bdd0",
    head: "26105edef333b11e855a1a98728d5277c94e96c8b44c3bd3001f75e4b519db9f",
  },
};
