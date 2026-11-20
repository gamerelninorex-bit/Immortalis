# F-014B B0 — Builder Hard Preflight Intake (B0 only)

**Status: BUILDER INTAKE FOR A SCOPED B0 HARD PREFLIGHT. Not an executed preflight, not a PASS, no production code.** It is pinned to PR #117's revised head, which is this document's commit on branch `claude/f014b-b0-gm-request-contract`. The PR body names that exact commit. Everything below can be checked at that commit. Master issue #114. Companion intake for A0: PR #116, owned separately.

The source under review is `docs/f014b/b0-gm-request-contract.md` at the same commit (the "contract" below; its § and A-numbers are used here). This intake answers BLUE's instruction (A19 §5(3)): "Prepare independent B0-only preflight submission pinned to revised #117 with no writer/read access, legacy isolation probes and open B1 issues labelled."

---

## I-1 Assignment

- **Commission.** Sovereign commission of 19 Nov 2026, as relayed to this Builder by the lead. B0 is the package BLUE defines as the "Refusal-only GM request validator" (BLUE Scoped Lowering v0.2 §1, pin `2026-11-19T10:06:01.677Z`; contract A12).
- **Channel.** On 20 Nov 2026 the Sovereign directed that BLUE guidance arrives on Issue #114.
- **Controlling direction.** [BLUE F-014B Issue #114 Direct A0/B0 Source Decisions — PR #116 Q1–Q5 / #117 OSQ1–12 & K1–K6 — AMEND-HOLD — 2026-11-20](https://app.notion.com/p/41e20af901e08163acb0f8ed695f44ad), native pin `2026-11-20T00:15:08.470Z`, also posted as Issue #114 comment 7026060101 (contract A19). Its disposition is "AMEND (draft contracts #116/#117 with direct decisions); A0/B0 prospective construction HOLD until scoped Hard Preflight PASS." It is a binding technical direction, "not a new Sovereign grant, an executed Hard Preflight, permission to merge, or a declaration that A0/B0 code is build-ready."
- **Builder role.** Claude Code amended the contract in place to conform (same PR identity), wrote and ran the tests of existing code the contract already specifies, and prepared this intake. It opened no PR, merged nothing, deployed nothing and edited no Notion page.

## I-2 Live baseline

- **Current main:** `8d25f9067219d944a5262eca06de20e70a5770f3` (PR #115 merged).
- **Census anchor:** every file:line in the contract is at `0c9e74b9d5dc8845751a543ace777277b2cb1308`, which BLUE independently rechecked (A19 §1).
- **No B0 census file moved.** `git diff --stat 0c9e74b 8d25f90` prints exactly:

  ```text
   vitest.config.ts | 11 ++++++++++-
   1 file changed, 10 insertions(+), 1 deletion(-)
  ```

  `vitest.config.ts` is not among the contract's census files. The change gives the integration project a 120 s default timeout and does not touch the contract, security or conformance projects these tests run in.

- **Branch base.** The B0 branch is based on `0c9e74b`. Relative to that base it changes no file under `packages/` or `apps/`: `git diff --name-only 0c9e74b -- packages apps` prints nothing, and there is no untracked file there.

## I-3 Source maturity

| Source (contract ref)                                           | Maturity as recorded                                                                                                                | What B0 takes from it                                                                                                                    |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| F-014B Consolidated v0.6 §§3, 4, 5.2, 9 (A1–A8)                 | Sovereign-approved design, source-fidelity pending                                                                                  | The GM pair and trigger, default-deny, the strict INITIAL / CONTINUATION fields, the arithmetic identity, replay law.                    |
| Sovereign Ratification F-014B v0.5 §§2–3 (A9)                   | Ratified as design/source additions, "not present-tense code or amendments to F-027"                                                | SI_SUBDAY_V1 second/minute/hour; no arbitrary wait cap.                                                                                  |
| Two-Blocker Resolution v0.3 (A10)                               | Sovereign-ratified design addendum, executable source-fidelity pending                                                              | Scope limits only: later phases and knowledge triggers are not lowered in B0 (presently unavailable); the evaluator identity is B1 (K3). |
| Sovereign Ratification, Two Prospective Source Imports §4 (A11) | Encoding not ratified as a technical contract                                                                                       | No extra strict INITIAL member.                                                                                                          |
| BLUE Scoped Lowering v0.2–v0.5, RED reviews (A12–A16)           | BLUE AMEND & HOLD technical lowerings and RED reviews                                                                               | The B0 package definition, zero history-policy transitions, W3 trip-wires, N-1, the U and R branches.                                    |
| CAL-TIME T-1 Unified v1.0 and its five grants (A17)             | Sovereign-ratified                                                                                                                  | No SI inference from a unit spelling; no CONTINUATION change.                                                                            |
| BLUE Direct A0/B0 Source Decisions (A19)                        | Binding BLUE technical direction; no Sovereign grant                                                                                | OSQ-1–OSQ-12 and K1–K6, all lowered in contract §8.                                                                                      |
| Existing code at `0c9e74b` (A18)                                | Shipped                                                                                                                             | P1–P9, the legacy binders' refusal-before-read behaviour, the trigger-kind census.                                                       |
| The B0 contract itself                                          | Builder source-lock **candidate**, revised to A19. No spec-lock executable lowering exists for it, and none is proposed before PASS | —                                                                                                                                        |

No source conflict remains open for B0. Every K-item has a BLUE disposition (contract §8). K3 is a genuine B1 obligation and is not a B0 blocker.

## I-4 Owner chain

- **B0 has no writer and no owner.** It declares no owner, facet, fact kind, registry entry, rule, key or history policy. It opens no transaction, writes nothing and reads nothing (contract §6).
- **Where B1 writes.** B1 writes under the existing `temporal_kernel` owner and `temporal_coordination` facet (`contracts/src/temporal.ts:31–32`). B0 adds no second owner and no second clock.
- **What B1 consumes from B0** (contract §3, B0-C1 to B0-C4). All of these are pure and are called with values B1 supplies:
  - `temporalOriginPairing` (B0-C1): the one shared origin discriminator, which OSQ-5 requires at the routing point and at canonical live and historical admission;
  - the strict GM context, trigger, `gm_wait` and envelope shapes, and `parseGmWaitRequest` (B0-C2);
  - `siSubdayV1Target` (B0-C3): the one derivation, reused at open and at seal;
  - `gmContinuationLinkViolation`, `continuationContextViolation` (N-1) and `gmWaitSameIdConflict` (B0-C4).
- **B1 consumer points** are contract §3 B1-1 to B1-15. Legacy consumers B1-14 and B1-15 must keep their behaviour.

## I-5 Authorship and visibility

- **Authorship of this package.** The Builder (Claude Code) wrote the contract revision, the two test files and this intake on `claude/f014b-b0-gm-request-contract`, PR #117 (draft). BLUE reviewed the previous revision at `9f960bfa705441a5dab6f1992e7eddac4eeab083` and issued A19. Source authority is cited, never restated as new authority.
- **Authorship of request fields.** B0 is not a model tool-argument contract (OSQ-10). The B1 authenticated adapter decides which interpretation and observation fields the model supplies, and it derives the canonical transaction ID, target and source proofs independently. `trigger.ref`, `cause` and `publication` are strict typed fields to which B0 attributes nothing (OSQ-2, OSQ-3). The player supplies no technical ID.
- **Visibility.** B0 has no GM-facing or player-facing output. Its refusal reasons are internal CANDIDATE labels that never make a secret-sensitive distinction visible (OSQ-11; contract §4). B0 reads nothing. Its predicates over state-derived values that B1 supplies (B0-C4) can refuse on hidden state, so B1 surfaces those refusals only through the normalized class. The GM-facing private unavailability class and its timing and control-flow tests are B1's.

## I-6 Acceptance matrix (contract §7)

"RUN NOW (existing code)" marks the tests BLUE's gate interpretation permits now: "independent tests of presently existing code" (A19 §1). "UNRUN until construction" marks tests that need the §2 module, whose construction is on HOLD. IDs not listed (B0-18/19, B0-27..29, B0-35..39, B0-51..59, B0-65..69) are unassigned.

| ID           | Subject (contract §7)                                                                                                               | Status                      | Result at this commit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B0-01..B0-03 | Shape controls: P1a, P1b, CONTINUATION                                                                                              | UNRUN until construction    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B0-04..B0-17 | INITIAL / CONTINUATION / envelope refusals (R10–R13, R20–R31, R40–R45)                                                              | UNRUN until construction    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B0-20..B0-25 | Origin pairing matrix and parser order (R01–R07)                                                                                    | UNRUN until construction    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **B0-26**    | Legacy schema control: the three unchanged exported schemas refuse the GM pair with every trigger, and any `gm_wait` key (R01, R12) | **RUN NOW (existing code)** | **5 of 5 tests passed.** Each of `ResolutionRequestSchema`, `TransactionAuthoritySchema` and `ResolutionTransactionSchema` refuses the GM pair with `GM_INTERPRETED_PC_WAIT` and with 11 existing trigger kinds (7 located in code, 4 test-support), with every issue at `context`; each refuses `gm_wait` in 8 forms, including `null` and an own `undefined`, as `unrecognized_keys` `["gm_wait"]`; the binders' five-field pick refuses the GM pair for all 12 kinds. Every refusal has an accepted control one change away. The player pair with `GM_INTERPRETED_PC_WAIT` is accepted today (R06). |
| B0-30..B0-34 | SI_SUBDAY_V1 table, derivation, overflow boundaries, no SI inference (R29, R30)                                                     | UNRUN until construction    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B0-40..B0-50 | Sealed identity: links, N-1 on U and R, same-ID conflicts (R20, R40–R51)                                                            | UNRUN until construction    | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **B0-60**    | Active-PC initial binder isolates a GM-pair transaction (R08)                                                                       | **RUN NOW (existing code)** | **Passed**, with its control. For all 12 trigger kinds: inert handle; `PC_TARGET_ADVANCE_UNAVAILABLE` on two presentations; zero campaign accesses. Control (player pair, same kinds): live handle, campaign accessed exactly as `trusted.campaign`, then `get store`.                                                                                                                                                                                                                                                                                                                                 |
| **B0-61**    | Active-PC held binder (R08)                                                                                                         | **RUN NOW (existing code)** | **Passed**, with its control. Same observations; `PC_TARGET_ADVANCE_UNAVAILABLE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **B0-62**    | NULL-PC initial binder (R08)                                                                                                        | **RUN NOW (existing code)** | **Passed**, with its control. Same observations; `NULL_PC_ADVANCE_UNAVAILABLE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **B0-63**    | NULL-PC held binder (R08)                                                                                                           | **RUN NOW (existing code)** | **Passed**, with its control. Same observations; `NULL_PC_HELD_ADVANCE_UNAVAILABLE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **B0-64**    | PC-transfer binder (R08)                                                                                                            | **RUN NOW (existing code)** | **Passed**, with its control. Same observations; `ADVANCE_UNAVAILABLE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| B0-70..B0-72 | Base-byte identity of the §5.1 files, B0 module imports, test-title labels                                                          | UNRUN until construction    | — (B0-70's subject was checked by hand: `git diff --name-only 0c9e74b -- packages apps tests/conformance tests/support` prints nothing, so every §5.1 file is byte-identical to the base.)                                                                                                                                                                                                                                                                                                                                                                                                             |

The B0-60..64 suite has 11 tests: one constants check (the literal pairs equal `GM_ADJUDICATION_AUTHORITY` and `PLAYER_CHOICE_AUTHORITY`; the five refusal codes are the contracts' own; each host request passes its own request schema), then one refusal test and one control per binder. **No binder read anything before refusing.** Every one of them matches its docstring, so there is no FINDING. The suite asserts the behaviour it observed.

Both suites were also mutation-probed in a throwaway copy that was deleted afterwards. With the GM pair replaced by the player pair, the five binder tests fail. With the GM context replaced by the player context in the `GM_INTERPRETED_PC_WAIT` schema test, or the `gm_wait` key removed, the two corresponding schema tests fail. So the negatives are not vacuous.

Exact output lines at this commit:

```text
$ pnpm exec vitest run --project contract tests/contract/gm-wait-b0-legacy-schema-control.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
$ pnpm exec vitest run --project security tests/security/gm-wait-b0-legacy-isolation.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

## I-7 Engineering quality

- **Pure.** The prospective B0 module (§2) is pure. It reads nothing and writes nothing: no store, coordinator, journal or ledger, no `temporal/origin`, no catalogue, no T0 category 1–8 read. Every function compares values the caller supplies.
- **Zero history-policy transitions.** `historyVerificationId` (`owners/admission.ts:536`) and the registry value schemas are unchanged (A12 §5; contract P4).
- **Placement: E1, BLUE-selected** (OSQ-5, OSQ-6). The CANDIDATE module is `packages/contracts/src/temporal-gm-wait.ts`. Under E1:
  - `temporal.ts`, its 11 pins and the D-3 gateways and suites are untouched;
  - the factor literals stay outside `TEMPORAL_SOURCES`, and no engine directory listing changes (P5, P6).
- **Legacy guarantees, tested on existing code.** The legacy schemas and the five binder functions keep their accepted values and their refusal-before-read guarantee. B0-26 and B0-60..64 test exactly that.
- **Test discipline.** The new tests:
  - call only public exports (`@immortalis/contracts`, `@immortalis/protocol`, `@immortalis/testkit`);
  - build their bases the way `tests/contract/temporal-schemas.test.ts` does;
  - pair every negative with an accepted control one change away;
  - use test titles that begin `B0 refusal-only (legacy control):` and contain no `PASS`, `ELIGIBLE`, `ADMITTED`, `T0` or `B1` (contract §6).
- **Strict shape.** No strict field is added beyond v0.6 §4 (OSQ-4).

## I-8 Artifact custody

All paths are at this document's commit on `claude/f014b-b0-gm-request-contract`:

- `docs/f014b/b0-gm-request-contract.md` (the source-lock candidate);
- `docs/f014b/b0-preflight-submission.md` (this intake);
- `tests/contract/gm-wait-b0-legacy-schema-control.test.ts` (B0-26);
- `tests/security/gm-wait-b0-legacy-isolation.test.ts` (B0-60..64).

None of these files states a present-day SHA-256 of any repository file. The repository's provenance rule keeps those only in `tests/support/present-day-identities.ts` and the existing pin tables. Custody is by commit SHA and path.

Reproduction:

```text
git fetch origin
git switch claude/f014b-b0-gm-request-contract   # at the commit the PR body names
pnpm install --frozen-lockfile
pnpm exec vitest run --project contract tests/contract/gm-wait-b0-legacy-schema-control.test.ts
pnpm exec vitest run --project security tests/security/gm-wait-b0-legacy-isolation.test.ts
git diff --name-only 0c9e74b -- packages apps   # prints nothing
git diff --stat 0c9e74b 8d25f90                 # vitest.config.ts only
```

On this commit's tree the Builder also ran `pnpm run lint`, `pnpm run typecheck`, `pnpm run check:spec`, `pnpm run test:contract` (55 files, 1327 tests passed), `pnpm run test:security` (38 files, 492 tests passed) and `pnpm run test:conformance` (86 files, 1527 tests passed, H-PROVENANCE included). All passed. These are local results. BLUE requires the **terminal** remote CI on the exact revised head to be recorded separately (A19 §5(2)), and this intake does not claim it.

## I-9 Governance

- **HOLD stands.** "The original W2 T1 Hard Preflight HOLD is not silently cleared by a documentation update" (A19 §5(4)). No B0 production code, module, schema, writer, interface, rule, registry entry, hash pin, spec-lock entry or conformance expectation exists or is proposed before a scoped Hard Preflight PASS.
- **Protected surfaces untouched.** The three D-3 gateways and their conformance suites (W3), the legacy non-GM guards and old historical admission (W4), and `temporal.ts` with its 11 pins are untouched. The new tests only call public functions.
- **What remains B1** (contract §8, "B1 obligations carried forward"):
  - **K3**, evaluator identity: a catalogue/evaluator manifest bound through `catalogue_sha256`, with no extra INITIAL member and no new read; otherwise a narrowly real B1 source-authority STOP;
  - **K4**, the historical GM route in `verifyHistorical`, with a new verifier identity in the same transition;
  - **OSQ-5**, the authenticated dispatcher and the shared discriminator at canonical live and historical admission;
  - **OSQ-11**, GM-facing normalization of secret-dependent failures, with timing and control-flow tests.
- **Builder limits.** No merge, deploy, Notion edit, GitHub comment or new authority. No F-014B acceptance row is claimed.

## I-10 Player experience

- **For the GM.** B0 is a GM-facing request contract, not a player-facing one. The GM interaction stays low-friction (OSQ-10): the GM speaks naturally, and the authenticated adapter, not the GM or the player, derives the transaction ID, target and source proofs.
- **For the player.** The player never fills in a technical ID.
- **Routine estimates.** GM-native routine inference (`interpretation_mode: GM_ROUTINE_ESTIMATE`) is interpreted at B1 ingress. B0 only checks the shape of the closed vocabulary.
- **Later phases.** Phases not yet lowered (post-PAUSED resume, post-INTERRUPTED re-entry) are presently unavailable in this prototype. They are not forbidden (OSQ-7).
- **Nothing playable yet.** B0 adds no player-visible behaviour. Completion remains "genuine conversational GM-mediated voluntary waiting" (A19 §5(6)), which needs B1 and B2.

---

## Open B1 issues labelled

These are carried from contract §8, where each is quoted with its source. B0 lowers none of them.

| Label    | Source               | Issue                                                                                                                                             |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1-OBL-1 | K3, OSQ-4, OSQ-12    | Evaluator identity bound through a versioned, content-addressed, source-closed catalogue/evaluator manifest; or a narrow B1 source-authority STOP |
| B1-OBL-2 | K4                   | Pure historical GM route in `verifyHistorical`; `historyVerificationId` changed in the same transition                                            |
| B1-OBL-3 | OSQ-5                | Authenticated dispatcher plus one origin discriminator at routing and at canonical live and historical admission                                  |
| B1-OBL-4 | OSQ-11               | GM-facing private unavailability normalization, with timing and control-flow tests                                                                |
| B1-OBL-5 | OSQ-2, OSQ-3, OSQ-10 | Authenticated ingress: model-supplied fields, derived IDs and target, `trigger.ref` channel, source-qualified cause, engine-private publication   |
| B1-OBL-6 | OSQ-8                | Authenticated Role Registry declaration and the complete enrolled-owner/§10 catalogue                                                             |
| B1-OBL-7 | OSQ-6, K1            | Separate GM-aware helper preferred; full 11 + 6 pin census; W3 review before any protected semantic change                                        |
| B1-OBL-8 | OSQ-7                | Post-PAUSED and post-INTERRUPTED re-entry as separately adopted B2/B1+ work                                                                       |
| B1-OBL-9 | R06 (B0-60..64)      | The legacy binders bind the player pair with the `GM_INTERPRETED_PC_WAIT` kind; B1 states how the A2 r4c1 deny reaches such a transaction         |

## Requested of BLUE

**1. Execute one scoped B0 Hard Preflight** against the then-current GitHub main and this exact revised candidate. Its scope is the construction of B0 alone:

- **Files B0 construction would add:**
  - the pure E1 module `packages/contracts/src/temporal-gm-wait.ts` (contract §2.1–§2.5);
  - the test files of contract §7: B0-01..B0-25, B0-30..B0-50 and B0-70..B0-72.
- **Files B0 construction would change:**
  - the two "nothing under packages/ changed" path-list guards, each gaining the one new path (`pc-standing-ledger-conformance.test.ts:353–399` and `gm-freight-conformance.test.ts:118–216`);
  - optionally, one `export *` line in `contracts/src/index.ts`, with its declared present-day identity in `tests/support/present-day-identities.ts`. The Builder recommends deferring that export to B1 and importing by path in B0, which keeps `index.ts` byte-identical.
- **Pass criteria:**
  1. P1–P9 hold;
  2. every contract §5.1 file is byte-identical to `0c9e74b` (B0-70);
  3. B0-26 and B0-60..64 pass unchanged;
  4. the module imports only zod and contracts modules (B0-71);
  5. zero history-policy transitions;
  6. no strict field beyond v0.6 §4;
  7. no read or write path;
  8. the full existing suite passes, with terminal remote CI recorded on the exact head.
- **Out of scope:** every B1 consumer (contract §3 B1-1..B1-15), all B1-OBL items, A0, and any spec-lock executable lowering.

**2. The smallest gate.** The one exact next gate is that scoped B0 Hard Preflight PASS. Its smallest sufficient proof is:

- the contract at this commit;
- the I-6 results for B0-26 and B0-60..64;
- the closed file list above;
- terminal CI on this head.

B0 does not depend on A0: it never reads `temporal/origin` or calls A0's witness. So this gate can run independently of PR #116's preflight. Nothing further is requested of the Sovereign. Per A19 §4, the technical encodings need no new Sovereign approval, and no contradiction that needs a new role, disclosure, owner power or strict field has been found.
