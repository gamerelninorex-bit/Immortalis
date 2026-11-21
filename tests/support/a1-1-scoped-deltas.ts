// F-014B A1-1 (operator-side strict version 2 chronology capture; T1 MECHANISM ONLY): the declared transition of the TWO production files this
// slice changes, and nothing else. The older "nothing else changed" suites extend their allow-lists from `A1_1_PACKAGE_PATHS`, and the B0
// operator-tree invariance test (B0-70) is re-baselined from `A1_1_TRANSITION`.
//
// Recorded as byte lengths and as `git diff --numstat` against the base commit, never as hashes: the one present-day identity this slice
// forces for these files is the A05 scoped-delta head of chronology-capture.ts (tests/support/a05-scoped-deltas.ts) and the identity of the
// packages/operator/src tree (tests/support/present-day-identities.ts). Custody is the bytes at the pinned base commit, not ancestry: a squash
// merge keeps the commit retrievable but does not keep it in the merged history, so no test asserts that it is an ancestor of HEAD.
//
// A later change to either file updates this table, and the two tables above, and nothing else.
export const A1_1_BASE_COMMIT = "a79fcc64420945024be90ffc7fdcdd9562b8d46b";

export const A1_1_TRANSITION: Readonly<
  Record<
    string,
    {
      /** the file's length at the base commit (and at the B0 contract's base: the operator tree was untouched in between) */
      readonly baseBytes: number;
      /** the file's length under A1-1 */
      readonly a1Bytes: number;
      /** `git diff --numstat` lines added and deleted against the base commit */
      readonly added: number;
      readonly deleted: number;
    }
  >
> = {
  "packages/operator/src/chronology-capture.ts": {
    baseBytes: 11336,
    a1Bytes: 17167,
    added: 161,
    deleted: 38,
  },
  "packages/operator/src/initial-setup.ts": {
    baseBytes: 26074,
    a1Bytes: 26181,
    added: 3,
    deleted: 2,
  },
};

/** Every path under packages/ this slice changes. There is no new production file. */
export const A1_1_PACKAGE_PATHS: readonly string[] = Object.keys(A1_1_TRANSITION);
