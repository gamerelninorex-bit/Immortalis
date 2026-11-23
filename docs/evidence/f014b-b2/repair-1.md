# Repair 1 — BLUE independent exact-head review of PR #135: AMEND (F-1, F-2, F-3)

Reviewed head `e76e464fc1923fe792a4daa809e1a98cbf4f5bc6`. BLUE review: https://app.notion.com/p/42120af901e08109bc7df019f5cf4a04 and the PR comment of the
same date. Same draft PR, no new RED cycle, no new source authority sought. Production default-deny is unchanged and nothing here invents original-owner
authority.

## What BLUE found, and whether the Builder reproduced it

| Finding | Claim                                                                                                                                                                                                  | Reproduced against the exact reviewed head?                                                                                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-1     | During ACTIVE the fence accepted any non-Temporal group that merely carried X's transaction cause and a dependency on X's opening, so a disguised extension-owner group passed as "a stage of X"       | **Yes.** The new adversarial tests, run against an unmodified `git archive` of `e76e464f`, fail with `synthetic-source-group-701 must be refused: expected true to be false`: the disguised group is **admitted** |
| F-2     | At MARKED the ACTIVE guard has not engaged, so the same claim hung from the marker is admitted, and a later NO_OPEN would then certify absence of OPEN, stage and seal over a lineage that contains it | **Yes**, same run: the claim hung from the marker is admitted before any OPEN                                                                                                                                     |
| F-3     | the Builder's 658-file local run had two failures, and was on Node 22.23.5 where `.nvmrc` pins 22.22.2                                                                                                 | see "F-3" below                                                                                                                                                                                                   |

All nine tests of `tests/integration/b2-stage-claims.test.ts` fail on `e76e464f` and pass on the repair. They are not tuned to the repair: they are BLUE's
falsifier (the existing `foreignGroup(n)` with ONLY its `cause` and `depends_on` changed) and its historical and MARKED twins.

## The repair: one common predicate, applied at the three existing call sites

`gmWaitFenceViolation` in `packages/engine/src/gm-wait-custody.ts` is the function the commit core, the base owner admission and the extension binding already
call (live, and in original-policy historical verification at the actual incremental prestate, ahead of every owner rule and every extension early return).

1. **The stage branch is closed.** While ACTIVE the only novel group admitted is X's own seal. BLUE's bounded repair allowed exactly this: "if the B2
   mechanism cannot yet prove exact stage membership without unratified B3 writers, close the stage branch by default; retain only the source-lawful own seal".
   This build has no source witness for an owner stage of a GM wait (no due roster, no B3 writer, no D3(b)), and a due roster is not fabricated.
2. **A claim to be a stage is refused at every moment.** Any group that is not one of the kernel's own custody or seal groups and whose `cause` names a GM wait
   (`gm-wait:<x>`, `transaction:gm-wait:<x>`) or whose `depends_on` names one of X's kernel groups (marker, OPEN, NO_OPEN, reconciliation, seal) is refused with
   `KEY_NOT_ADMITTED` / `GM_WAIT_STAGE_CLAIM_UNSOURCED`: before OPEN (F-2), while ACTIVE (F-1), and after the seal. The claim is judged by prefix when live
   and by the exact X-shape (`gm-wait:` plus 64 lowercase hex) in replay, so no older valid history can be reinterpreted.
3. **No stage of X can exist before OPEN, by construction.** Every committed group passed (or, in replay, passes at its own prestate) the same predicate, so
   "no group but the kernel's own names X" is an invariant of admission. NO_OPEN therefore certifies absence of OPEN, stage and seal without a journal scan and
   without a read of the hidden future, which BLUE ruled out.
4. **The strict GM seal is the zero-stage seal.** `engaged`, `boundaries_crossed`, `stages` and `rule_versions` are empty tuples in
   `packages/contracts/src/temporal-custody.ts`; `buildSealGroup` and `sealOwn` take no stages. A seal that cites a stage is refused by the contract.

Not changed: the production admission still qualifies no preparation (every marker refused); no B3 grant, World-State, Named Actor, Health, positive S4 or
all-enrolled evaluator; no new owner, facet or provider; the extension owner-specific historical verification stays skipped as the B1 census records.

## Consequences, stated so the delta review need not hunt for them

- Tests that used a credited stage to extend an ACTIVE interval were rewritten: positive owner stages are `UNRUN`; the zero-stage own seal is the positive twin
  of every refused claim. The ACTIVE-across-checkpoint tests now pad BEFORE the opening so that the OPEN is the 128th commit (the checkpoint then holds the ACTIVE
  state and no entry can follow it but the seal).
- The catalogue manifest has a new digest (the `value_schema_fp` of the GM seal changed with the contract) and the B2 scoped-delta table and the custody file list were regenerated; both retained B1 archives are byte-identical.
- The fence adds, per ordinary commit, one cause-prefix test and a scan of that group's own `depends_on`: constant work, no state read (`b2-cost`, `measurements.md`).

## Tests

| Test                                                                                                       | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/integration/b2-stage-claims.test.ts` (9)                                                            | BLUE's falsifier live (cause and dependency changed on `foreignGroup(n)`; each twin; refusal changes no head, fact, receipt or clock); a canonical owner's group under the claim (owner admission called directly); strict preservation (exact X-shape in replay); forged hash-consistent journals with the claim inside the ACTIVE interval, after the seal, at MARKED, and marker + claim + NO_OPEN (refused at the claim); the clean marker + NO_OPEN opens (control) |
| `tests/integration/b2-fence-layers.test.ts`                                                                | each of the three call sites, called directly, refuses both a foreign group and a claim, live and historical, at MARKED and ACTIVE                                                                                                                                                                                                                                                                                                                                       |
| `tests/integration/b2-custody-lifecycle.test.ts`, `b2-crash-recovery.test.ts`, `b2-history-replay.test.ts` | the stage positives are replaced by claim refusals, a refused claim across a crash, and the strict replay of an ACTIVE checkpoint                                                                                                                                                                                                                                                                                                                                        |
| `tests/contract/b2-gm-wait-contracts.test.ts`                                                              | a seal that cites a stage, an engaged owner, a crossed boundary or a rule version is refused                                                                                                                                                                                                                                                                                                                                                                             |
| `mutation.md`                                                                                              | six new mutants (claim check removed, claim live-only, dependency half, cause half, the original F-1 defect restored, the seal contract widened) and which tests kill them                                                                                                                                                                                                                                                                                               |

## F-3

F-3 is evidence about the exact repair head, so it is recorded in the PR description for that head: a document committed afterwards would change the head it
describes. Method: Node 22.22.2 (the `.nvmrc` pin) from nodejs.org, its SHA-256 checked against the published `SHASUMS256.txt`, then the complete required suite
(`pnpm exec vitest run`, every project, no exclusions) at the pushed repair head; and, for any failure, a reproducible comparison of the failing assertion on the
immutable base and on the head. Nothing is deleted, skipped or relaxed.
