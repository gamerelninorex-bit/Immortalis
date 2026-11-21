# F-014B B1 S2/S3 - mutation sanity check

MECHANISM ONLY. `tools/gm-wait-catalogue-mutation-check.py` applies one mutant at a time to a production file or the generator, runs the lane suites in order until one fails,
restores the file in a `finally`, and records KILLED or SURVIVED. A clean baseline run must pass first and every anchor must occur exactly once (`--anchors`). The ids are stable labels;
gaps in the numbering are mutants that were dropped before the final list. Raw results: `mutation-results.json` (EXECUTED).

Result: 51 killed, 1 survived, of 52 (EXECUTED against the final tests).

- First full run: 49 killed, 3 survived. S3-M05 (the receipt's hidden future instant entering the COMPLETE evidence) and S3-M06 (the origin witness read on a CONTINUATION) were real
  test holes: the twins only covered the PENDING class, and the only CONTINUATION test ended in category 1 because its source transaction was absent. Two integration tests were added
  (a COMPLETE hidden-future twin pair; a CONTINUATION whose source transaction exists, with an origin committed in the world) and both mutants are now killed.
- Survivor S3-M23 is an EQUIVALENT mutant (REASONED): a synthetic test policy carries no catalogue, so category 5 can never be a PARTIAL_WITNESS under it, and the extra condition the
  mutant adds is never true on any reachable input. The integration test asserts the reachable fact instead: a synthetic policy classifies even a fully consistent ledger UNKNOWN, with
  visibility and governing policy UNPROVEN.
- S2-G10 is killed at suite setup (the generator refuses to build when the two census methods disagree), not by an assertion; that is the behaviour the mutant removes.
- 14 of the kills are by integration tests only (`tests/integration/gm-wait-present-s3-committed.test.ts`). The four-project gate (unit, contract, conformance, security) does not run
  the integration project, so those kills exist only where the integration project runs.

| Id     | File                        | Mutant                                                             | Result   | Killed by                            |
| ------ | --------------------------- | ------------------------------------------------------------------ | -------- | ------------------------------------ |
| S2-M01 | `gm-wait-catalogue.ts`      | set-valued lists are not sorted (kinds)                            | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M02 | `gm-wait-catalogue.ts`      | duplicate tuples are not detected                                  | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M03 | `gm-wait-catalogue.ts`      | the digest omits the policy section                                | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M05 | `gm-wait-catalogue.ts`      | an uppercase hex digest is accepted                                | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M06 | `gm-wait-catalogue.ts`      | a stale retained digest is accepted as current                     | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M07 | `gm-wait-catalogue.ts`      | an unknown digest is accepted                                      | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M08 | `gm-wait-catalogue.ts`      | forged retained bytes are trusted by name                          | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M15 | `gm-wait-catalogue.ts`      | the disposition schema admits INERT                                | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M16 | `gm-wait-catalogue.ts`      | the Epistemic literal admits INTERRUPTION_GUARDED                  | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M17 | `gm-wait-catalogue.ts`      | the static verdict grants a permission                             | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M18 | `gm-wait-catalogue.ts`      | the manifest schema stops being strict                             | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M19 | `gm-wait-catalogue.ts`      | a late extension owner is ignored by the coverage                  | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M20 | `gm-wait-catalogue.ts`      | a census-method disagreement is ignored                            | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M21 | `gm-wait-catalogue.ts`      | an added provider is reported as a mere change                     | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M22 | `gm-wait-catalogue.ts`      | the value-schema scope literal is relaxed                          | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-M23 | `gm-wait-catalogue.ts`      | a changed generated-key route is not reported                      | KILLED   | gm-wait-catalogue-s2.test.ts         |
| S2-G01 | `gen-gm-wait-catalogue.ts`  | the scanner ignores un-annotated provider literals                 | KILLED   | gm-wait-catalogue-s2-census.test.ts  |
| S2-G02 | `gen-gm-wait-catalogue.ts`  | the event-trigger census is dropped                                | KILLED   | gm-wait-catalogue-s2-census.test.ts  |
| S2-G03 | `gen-gm-wait-catalogue.ts`  | the alternate-rule references are dropped from the kinds           | KILLED   | gm-wait-catalogue-s2-census.test.ts  |
| S2-G04 | `gen-gm-wait-catalogue.ts`  | extension owners are not read from the bindings                    | KILLED   | gm-wait-catalogue-s2-census.test.ts  |
| S2-G05 | `gen-gm-wait-catalogue.ts`  | a provider in no site is reported REGISTERED                       | KILLED   | gm-wait-catalogue-s2-census.test.ts  |
| S2-G06 | `gen-gm-wait-catalogue.ts`  | the generated-key (produces) census is dropped                     | KILLED   | gm-wait-catalogue-s2-census.test.ts  |
| S2-G07 | `gen-gm-wait-catalogue.ts`  | .register calls are not censused                                   | KILLED   | gm-wait-catalogue-s2-census.test.ts  |
| S2-G08 | `gen-gm-wait-catalogue.ts`  | an adopted pin is not checked against its native verification      | KILLED   | gm-wait-catalogue-s2-census.test.ts  |
| S2-G09 | `gen-gm-wait-catalogue.ts`  | a source line number enters the digest                             | KILLED   | gm-wait-catalogue-s2-census.test.ts  |
| S2-G10 | `gen-gm-wait-catalogue.ts`  | the reflection skips provider modules                              | KILLED   | gm-wait-catalogue-s2-census.test.ts  |
| S3-M01 | `gm-wait-present-reader.ts` | a malformed GIP receipt is VALID_ABSENT                            | KILLED   | gm-wait-present-s3.test.ts           |
| S3-M02 | `gm-wait-present-reader.ts` | a malformed freight receipt is VALID_ABSENT                        | KILLED   | gm-wait-present-s3.test.ts           |
| S3-M03 | `gm-wait-present-reader.ts` | a malformed PC occupancy is read as none                           | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M04 | `gm-wait-present-reader.ts` | the boundary index is read                                         | KILLED   | gm-wait-present-s3.test.ts           |
| S3-M05 | `gm-wait-present-reader.ts` | the GIP receipt's future instant enters the evidence               | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M06 | `gm-wait-present-reader.ts` | the origin witness is read on a CONTINUATION                       | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M07 | `gm-wait-present-reader.ts` | the identity short-circuit on an existing sealed result is skipped | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M08 | `gm-wait-present-reader.ts` | an open unsealed authority does not end the call                   | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M09 | `gm-wait-present-reader.ts` | a registered movement object is not an engagement                  | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M10 | `gm-wait-present-reader.ts` | a movement request alone is not an engagement                      | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M11 | `gm-wait-present-reader.ts` | a committed destination reads as settled                           | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M12 | `gm-wait-present-reader.ts` | the freight pending stages become distinct classes                 | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M13 | `gm-wait-present-reader.ts` | an absence witness is recorded as version 1                        | KILLED   | gm-wait-present-s3.test.ts           |
| S3-M14 | `gm-wait-present-reader.ts` | the read cap is not enforced                                       | KILLED   | gm-wait-present-s3.test.ts           |
| S3-M15 | `gm-wait-present-reader.ts` | the observed basis is not compared                                 | KILLED   | gm-wait-present-s3.test.ts           |
| S3-M16 | `gm-wait-present-reader.ts` | siOriginWitnessViolation is not applied                            | KILLED   | gm-wait-present-s3.test.ts           |
| S3-M17 | `gm-wait-present-reader.ts` | the production catalogue yields a positive                         | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M18 | `gm-wait-present-reader.ts` | a synthetic policy may carry a production digest                   | KILLED   | gm-wait-present-s3.test.ts           |
| S3-M19 | `gm-wait-present-reader.ts` | an absent origin is acceptable                                     | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M20 | `gm-wait-present-reader.ts` | an absent ledger is a partial witness                              | KILLED   | gm-wait-present-s3.test.ts           |
| S3-M21 | `gm-wait-present-reader.ts` | an unproven PC identity counts as proven (category 5)              | KILLED   | gm-wait-present-s3.test.ts           |
| S3-M22 | `gm-wait-present-reader.ts` | category-5 visibility is not required                              | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M23 | `gm-wait-present-reader.ts` | a partial witness satisfies the commitments premise                | SURVIVED | -                                    |
| S3-M24 | `gm-wait-present-reader.ts` | a binding for another PC is not a mismatch                         | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M25 | `gm-wait-present-reader.ts` | a corrupt original E1 reads as pending                             | KILLED   | gm-wait-present-s3-committed.test.ts |
| S3-M26 | `gm-wait-present-reader.ts` | a source that throws is an absence                                 | KILLED   | gm-wait-present-s3.test.ts           |
