/** A26-CB1 implementation identities at the verified base and the bounded repair. */
export const A26_BASE_COMMIT = "ff7837af6d33793b35516b8afa7cfc32ad738b07";

// The live owner dispatcher digest is kept in the existing present-day identities table.
export const A26_ADMISSION_DELTAS = {
  "packages/engine/src/commit/campaign-core.ts": {
    base: "e07ca9275e1ad06bdae6d64ce85e7999bb3de5b5a06cfaca1b051ab5d36f7dfb",
    head: "0b7f2f4c5e7ab37eb739291120b25f1577c1b7f87fa9f879d89814b074a8be9b",
  },
  "packages/engine/src/owners/extension.ts": {
    base: "bd7ce5e865f0625e67439340464f9848fe35f09194623d8182854a7df1c3f3d4",
    head: "34ef1eda9c1ba6895bd42f5d609f98c9293e45216cc164a0599ad3e676d8e9df",
  },
  "packages/engine/src/pc-collection/adapter.ts": {
    base: "0543019af114b3a6e7e3fd6209dd72f5b5697ec5e78e3082cadc345e38d04924",
    head: "79f50873e870c4b16d36af04e2eba54aa2be0cbb27e64b93db3069d3cf770bb3",
  },
  "packages/engine/src/pc-collection/admission.ts": {
    base: "2ec71640a76f93c9dc92fd46d1b2cfae3b6b248ee2e79e80cf443e3ff2d027ac",
    head: "bb49fb7d44a0df755f89f494c15774dc2ccb545c69284290ede2bc9f514592e3",
  },
  "packages/engine/src/pc-collection/lapse.ts": {
    base: "7fd343e29c8622d2722cf6044defe1887f60ba402535da4237bb3b7e823ab78a",
    head: "4a68c7a685b677187703ffb5ef6b678065240897c01971dd9897bb84e851eaff",
  },
  "packages/engine/src/source-drawdown/admission.ts": {
    base: "da3af9afbcc5cf70476af11e9e71f7836934dcd556ba0186404566034eb4021d",
    head: "5c3be19c1cd43935b66885a4bd9a11f9cfe5a4015996edc2d981a34c25bdfb3f",
  },
} as const;
export const A26_DISPATCHER = {
  path: "packages/engine/src/owners/admission.ts",
  base: "1b0abb63d6f89e0cbe8a54fbfc457933a79fdc10b367e35847032424f9e1e8b1",
} as const;
export const A26_CHANGED_SOURCE_FILES = [...Object.keys(A26_ADMISSION_DELTAS), A26_DISPATCHER.path];
export const A26_BASE_COMMIT_DIRECTORY_SHA256 =
  "c2958df6a3295cececb6854eeb8cc964012f0c70184e241809234f322380e8b4";
