// ROADBED GM-native first-profile freight bridge: the historical byte-identity assertions that older conformance suites carried on source files
// this slice changed, as they stood at the recorded base. Each suite replaced its assertion with a comment (the M-S, PR #94 and freight F+I
// slices did the same). Nothing is lost silently: every removed value is recorded here and tests/conformance/gm-freight-conformance.test.ts
// recomputes each from the base commit's own bytes where Git history is available (a shallow checkout skips it and says so). What the older
// suites no longer assert is that these paths are UNCHANGED, which is no longer true on purpose; the slice-head bytes of each changed file are
// pinned in tests/support/gm-freight-scoped-deltas.ts instead.
export interface RemovedGmFreightPin {
  readonly suite: string;
  readonly path: string;
  /** the SHA-256 of the file's bytes the suite asserted */
  readonly value: string;
}

const NULL_ADVANCE = "packages/protocol/src/null-pc-ooc-advance.ts";
const NULL_HELD = "packages/protocol/src/null-pc-ooc-held-continuation.ts";
const ADVANCE_BASE = "b3fe9e0c2be291ae5ea6670df42e59fde1121a35c01254230a083dd676c17c68";
const HELD_BASE = "4040a181a8b081d5d9a8c265185b13a4d559e829500a5c5986e776e4b703343c";

export const REMOVED_GM_FREIGHT_PINS: readonly RemovedGmFreightPin[] = [
  {
    suite: "tests/conformance/operator-conformance.test.ts",
    path: NULL_ADVANCE,
    value: ADVANCE_BASE,
  },
  { suite: "tests/conformance/operator-conformance.test.ts", path: NULL_HELD, value: HELD_BASE },
  {
    suite: "tests/conformance/protocol-null-pc-ooc-held-continuation-conformance.test.ts",
    path: NULL_ADVANCE,
    value: ADVANCE_BASE,
  },
  {
    suite: "tests/conformance/protocol-original-pc-target-advance-conformance.test.ts",
    path: NULL_ADVANCE,
    value: ADVANCE_BASE,
  },
  {
    suite: "tests/conformance/protocol-original-pc-target-advance-conformance.test.ts",
    path: NULL_HELD,
    value: HELD_BASE,
  },
  {
    suite: "tests/conformance/protocol-pc-target-advance-conformance.test.ts",
    path: NULL_ADVANCE,
    value: ADVANCE_BASE,
  },
  {
    suite: "tests/conformance/protocol-pc-target-advance-conformance.test.ts",
    path: NULL_HELD,
    value: HELD_BASE,
  },
  {
    suite: "tests/conformance/source-observation-conformance.test.ts",
    path: "packages/operator/package.json",
    value: "80925fae3972571622e7871ce4925baabdc58aad1071cee951cf402b4167bdd0",
  },
];
