// F-014B B1 S1: custody of the IMMUTABLE 13-case baseline corpus (the "E1" characterization of the build that preceded S1). THE DESIGNATED
// TABLE for these values: no document, comment or other test file repeats any digest, length or blob id below.
//
// The corpus is the PRE-S1 behaviour: it creates its old journals by live-committing the very record S1 now refuses, so it cannot stay a
// green test after S1, and it is not prettier- or lint-clean by construction (it is the exact bytes of the scratch original). It is therefore
// carried as an INERT fixture: a byte-exact copy with a `.txt` suffix, which no runner, formatter or linter reads. The test that judges the
// same behaviour on the S1 build is tests/integration/b1-s1-live-origin-guard.test.ts, reading the frozen packages.
//
// `commit` is where the original was recorded (the evidence branch is retained as published); `blobId` is the git object id of the bytes.
export const B1_S1_E1_ARTIFACT = {
  path: "tests/fixtures/b1-s1-evidence/b1-hist1-production-characterization.test.ts.txt",
  /** the path the original carries in the evidence commit */
  originalPath: "tests/integration/b1-hist1-production-characterization.test.ts",
  commit: "4e3030916907606c5eb62d1f00da1669e9e9ac0b",
  bytes: 36909,
  sha256: "ef6bbc943c4712366e27a7afa4c96b14a7a4df353952df8ce8415be44c2541cb",
  blobId: "9e6d91fa95883cc84653b8cdec246e7d59043212",
  /** the cases of the corpus, by the ids their titles open with */
  cases: [
    "H1-A1",
    "H1-A2",
    "H1-P1",
    "H1-P2",
    "H1-P3",
    "H1-L1",
    "H1-G1",
    "H1-G2",
    "H1-F1",
    "H1-F2",
    "H1-S1",
    "H1-S2",
    "H1-V1",
  ],
  /**
   * What the S1 build does to each case, as EXECUTED: the inert copy was run unchanged (as a throwaway test file, never committed) against
   * the S1 build. "preserved" cases still pass on it; "flips" cases fail on it, each for the same reason: the case creates its old journal
   * (or its control) by live-committing the player-pair record under the reserved trigger, which S1 now refuses, or it asserts that the
   * literal occurs in exactly one production file. The stored-record behaviour of each flipped case is judged, on frozen packages, by the
   * S1 integration case named beside it.
   */
  atS1: {
    "H1-A1": "preserved: the fixture shares the production historyVerificationId and check",
    "H1-A2": "preserved: one KERNEL_RULE for both kinds, no era marker",
    "H1-P1":
      "flips: its live commit of the player-pair record under the reserved trigger is refused; judged on the frozen package by guard cases a, e and h",
    "H1-P2":
      "flips: its player-pair control under the reserved trigger is refused; the GM-pair refusal at the typed value is acceptance case A6",
    "H1-P3":
      "flips: the journal it tampers with is made by the refused live commit; tamper of the frozen journals is acceptance case A4",
    "H1-L1":
      "flips: the same live commit under the legacy admission is refused; the frozen packages under the legacy composition are guard case h",
    "H1-G1":
      "flips: its live gateway commit with the reserved trigger is refused at the authority-open; judged on the frozen packages by guard cases b, c, e",
    "H1-G2": "preserved: the GM pair is refused at the typed value, with nothing committed",
    "H1-F1": "preserved: a chain-valid forged GM-pair journal is refused by a production open",
    "H1-F2": "preserved: a hand-built chain-valid player+literal journal opens as history",
    "H1-S1":
      "flips: its simulation of option A builds the old journal by the refused live commit; option A is now the production behaviour (guard case e)",
    "H1-S2":
      "flips: its simulation of option B builds the old journal by the refused live commit; option B is not implemented",
    "H1-V1":
      "flips: the reserved literal is spelled in one more production file, the S1 local constant (B1_S1_LITERAL_FILES)",
  },
  /** the cases whose S1 result differs from the recorded pre-S1 result, in corpus order */
  flips: ["H1-P1", "H1-P2", "H1-P3", "H1-L1", "H1-G1", "H1-S1", "H1-S2", "H1-V1"],
} as const;
