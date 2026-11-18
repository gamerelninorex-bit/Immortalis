/** RP-1 Stage 1 changes these production files from the verified post-A24 main. */
export const A05_BASE_COMMIT = "5b2654266d41f1e045da3cd78412833999b0c42e";

export const A05_SOURCE_DELTAS = {
  "packages/engine/src/persistence/fs-ops.ts": {
    base: "f363c920cd248251d262f6d1d770dc7c7ee3449cc02bbd0c9434d38c272daf79",
    head: "47809c31f80ca62d3f5b69a934d4cd07ebf50c1312288e2ab61735bc914f6606",
  },
  "packages/operator/src/chronology-capture.ts": {
    base: "d57bd15a8d76150dd45b582e0672b9d1179b2202e0052261b484d3b20510059c",
    head: "8eced3f49cfd761384717cbebc9eae5f86322d9cc287f51b03d05c3a3cec2b63",
  },
  "packages/operator/src/protected-store.ts": {
    base: "7e0075a6efe4851a4d53966eba4ced515d1d25d6117829267fc72964a246b00c",
    head: "ddf7bf41a9e41218369fdc9afdba929f2655071bd3d3461760587cef83d29a42",
  },
} as const;
