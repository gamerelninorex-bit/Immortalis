# F-014B B2 — GM-wait Temporal custody (MECHANISM ONLY)

Status: **DRAFT for independent BLUE review.** Labels this slice carries, and no others: `MECHANISM ONLY`, `SCRIPTED TESTKIT MECHANISM`
where a fixture stands in for something that does not exist in this build, `UNRUN` where a thing was not run. It claims no feature, no
acceptance of any production provider, no §10 disposition and no PASS for anything it does not run.

| Item               | Value                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository         | `gamerelninorex-bit/Immortalis`                                                                                                                                                |
| Construction issue | #133                                                                                                                                                                           |
| Controlling brief  | Notion page `42020af901e08142a5f2c5fa36fd1b0e` (https://app.notion.com/p/42020af901e08142a5f2c5fa36fd1b0e), verified pin `2026-11-22T17:48:36.869Z`                            |
| Immutable baseline | `940a1ca29b34af8488c9ea3ea2f1903aeba52660` (main; baseline CI run 45040758768, success)                                                                                        |
| Branch             | `claude/immortalis-b2-mechanism-1vxdr4` (the brief names `b2-temporal-custody`; the session harness fixes the branch, and the discrepancy is recorded here, not worked around) |
| Pull request       | one DRAFT, never merged by this slice                                                                                                                                          |

## What this slice builds

1. **Wait identity.** `X` = SHA-256 of a length-delimited encoding of a fixed namespace, the verified original GM session id and the
   already-serialized JSON-RPC id text. Numeric `1` and string `"1"` are different operations. Every other identity (transaction id, cause,
   group ids, intent ids) is a pure function of `X`, so a retry reaches the same receipt.
2. **Two new Temporal fact kinds.** `temporal_gm_wait_marker` (SEALED, create-only, `temporal/gm-wait/marker/<x>`) and the authoritative
   by-character index `temporal_gm_wait_pc_index` (ADVANCING, `temporal/gm-wait/by-pc/<pc>`), states `MARKED`, `OPEN`, `NO_OPEN`,
   `SEALED_RECONCILED`. Both are registered under the existing Temporal kernel owner and facet; no owner, facet or provider is added.
3. **Separated lifecycle groups.** The lawful opening (index `MARKED→OPEN` plus a strict GM variant of the durable opening authority), the
   protected waiting, the seal (the only `TARGET_REACHED` seal) and the sealed reconciliation are separate commit groups. `NO_OPEN` carries a
   negative certificate and is terminal for that `X`.
4. **One common W2 fence.** ACTIVE is derived from durable facts (a GM opening authority and the absence of its seal), never from a label, a
   snapshot or a rule-checked id set. While ACTIVE **only that transaction's own seal** is admitted: this build has no source witness for an owner stage
   of a GM wait, so the stage branch is closed (BLUE F-1) and positive owner stages are `UNRUN`. Independently, no group other than the kernel's own
   custody and seal groups may name a GM wait at any moment, so no stage of X can exist before OPEN and a NO_OPEN certifies absence by construction
   (BLUE F-2). The same function is applied by the commit core, by the base owner admission and by the extension binding, live and in original-policy
   historical replay at the actual incremental prestate. See `repair-1.md`.
5. **Crash and replay safety.** Cold strict replay, warm-checkpoint equivalence, forced strict replay of a checkpoint that crosses an ACTIVE
   interval, refusal to open a protected package under an admission that lacks the verifier, and same-root retry.
6. **Contracts, registration and catalogue.** Strict contracts in `packages/contracts/src/temporal-custody.ts` (the legacy
   `temporal.ts` is byte-identical to its base); the two registrations with the Role-Registry-style source rule; two `OWNER_CHECKS_ONLY`
   sunset rows; a new verifier-identity segment; a regenerated deterministic catalogue manifest with both retained archives untouched and
   DEFAULT-DENY unchanged.

## What this slice does not build

World-State notice writers, Named Actor duty writers, Health writers, positive S4 admission, an unqualified all-enrolled evaluator, any
production GM wait path. **The production admission qualifies no original-owner preparation** (D3(b) is not adopted), so under the production
build every marker is refused and nothing is written: DEFAULT DENY. Only the TESTKIT-ONLY fixture admission, under a distinct history identity,
can qualify a synthetic preparation. A configured-GM adapter that consumes status and forwards verified input is unchanged; a static test
holds every production surface away from the writer.

## Acceptance matrix (brief B2-T01 … B2-T12)

| Id                                                                                                                                                                                                 | Where                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01 lifecycle (marker, separate OPEN, protected wait, seal, reconcile) and T02 common fence incl. extension and historical paths                                                                   | `tests/integration/b2-custody-lifecycle.test.ts`, `b2-fence-layers.test.ts` (each of the three fence call sites called directly), `b2-custody-negatives.test.ts` (seal departure, NO_OPEN witnesses), `tests/contract/b2-gm-wait-contracts.test.ts` |
| T03 identity `X`, key grammar, retry safety                                                                                                                                                        | `tests/integration/b2-identity.test.ts`                                                                                                                                                                                                             |
| T04 crash boundaries, same-root retry, terminal `NO_OPEN`                                                                                                                                          | `tests/integration/b2-crash-recovery.test.ts`, `b2-custody-negatives.test.ts`                                                                                                                                                                       |
| T05 two actual OS processes on one campaign directory                                                                                                                                              | `tests/integration/b2-two-process.test.ts`, `tests/integration/fixtures/b2-custody-process.ts`                                                                                                                                                      |
| BLUE F-1 / F-2 adversarial twins (live and forged historical, MARKED and ACTIVE)                                                                                                                   | `tests/integration/b2-stage-claims.test.ts`                                                                                                                                                                                                         |
| T06 cold replay, warm checkpoint, overwritten-index equivalence, older-history preservation (incl. the declared one-time strict replay of the frozen packages); T09 forgery and tamper fail closed | `tests/integration/b2-history-replay.test.ts`, `b2-custody-negatives.test.ts` (legacy-loader and downgrade opens)                                                                                                                                   |
| T07 no positive production path (behaviour) and T10 pre-OPEN reads nothing about the hidden future                                                                                                 | `tests/integration/b2-production-denial.test.ts`, `tests/security/b2-static-boundary.test.ts`                                                                                                                                                       |
| T08 deterministic catalogue regeneration, default-deny                                                                                                                                             | `tests/conformance/b2-catalogue-conformance.test.ts`                                                                                                                                                                                                |
| T11 bounded common-path cost                                                                                                                                                                       | `tests/integration/b2-cost.test.ts` (work counts), `measurements.md` (matched base-versus-head record)                                                                                                                                              |
| T12 falsifiability                                                                                                                                                                                 | `mutation.md` (each guard removed, the tests that notice)                                                                                                                                                                                           |
| scope                                                                                                                                                                                              | `tests/conformance/b2-scope-conformance.test.ts`, `tests/support/b2-scoped-deltas.ts`                                                                                                                                                               |

## What was NOT run, and what is therefore not claimed

- `UNRUN` a genuine AI GM, a named client, a live first interruption of a real wait.
- `UNRUN` a positive owner stage of a GM wait (a true source-declared, due StageKey of X): no source witness exists in this build, none is fabricated, and the stage branch is closed.
- `UNRUN` a production file provider: `provider_acceptance` stays `NONE`; the H-07 matched job is skipped by CI as before.
- `UNRUN` an executable AM-3.P engine: only the non-interference of the new keys with the AM-3.P pending clause is claimed.
- Not adopted, and nothing here assumes them: D3(b), R-DUTY, R-H.
- The ephemeral origin proof is live-only. Replay judges the hashes the marker recorded; the integrity this provides is tamper evidence, **not
  authentication of a session** (no signing exists in this build).

## Other documents here

`repair-1.md` (BLUE AMEND F-1/F-2/F-3), `custody.md` (baseline custody, toolchain, new-file identities), `collisions.md` (every older suite edited and why),
`modelling-choices.md` (choices BLUE should confirm), `measurements.md` + `measurements-summary.json` + `measurements-raw/` (T11),
`mutation.md` + `mutation-results.jsonl` + `mutate.py` / `run-mutants.py` (T12), `custody-baseline.sh` / `custody-baseline.tsv` (base-byte manifest), `custody-files.sh` / `custody-files.tsv` (bytes this slice adds or changes).
