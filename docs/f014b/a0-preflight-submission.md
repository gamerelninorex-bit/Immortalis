# F-014B A0 — Builder Hard Preflight Submission (A0 only)

**Status: BUILDER INTAKE FOR A BLUE SCOPED HARD PREFLIGHT. Not a PASS, not a construction order. A0 construction is on HOLD.**

- Scope: **A0 — clock-origin engine contract** only (master issue #114). B0 (PR #117, `docs/f014b/b0-*`) has its own submission and is not covered here.
- Pinned candidate: PR #116, branch `claude/f014b-a0-source-lock`, at **this document's commit**. The A0 source lock `docs/f014b/a0-clock-origin-source-lock.md` and the A0-T00 test are at the same commit. The exact head SHA is recorded in the PR #116 body; a commit cannot contain its own SHA.
- Requested by: S11 §5 item 3, "Prepare an A0-only complete bounded preflight submission pinned to revised PR #116 and exact source, with test A0-T00 baseline/negative corpus, producer/consumer table, MS+v1 historic controls, explicit policy-ID/cold-open and scope-correct fixture evidence."
- Source labels S1–S11 are those of the A0 source lock §1.

---

## I-1 Assignment

| Record                                                     | Reference                                                                                                                                 | Effect                                                                                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sovereign F-014B construction commission                   | 19 Nov 2026                                                                                                                               | Names Claude Code as Builder for F-014B. Construction remains subject to the gates below.                                                                                                           |
| Sovereign direction                                        | 20 Nov 2026                                                                                                                               | BLUE guidance for this work arrives on Issue #114.                                                                                                                                                  |
| S11 — BLUE F-014B Issue #114 Direct A0/B0 Source Decisions | [Notion](https://app.notion.com/p/41e20af901e08163acb0f8ed695f44ad), native pin `2026-11-20T00:15:08.470Z`; Issue #114 comment 7026060101 | Binding direction to amend #116 in place (Q1–Q5, K1, mandatory fidelity conditions) and to prepare this submission. "AMEND … A0/B0 prospective construction HOLD until scoped Hard Preflight PASS." |
| S2 — Sovereign ratification, CAL-TIME T-1 five grants      | [Notion](https://app.notion.com/p/41c20af901e081ba9fd4db4da81c8526), native pin `2026-11-18T22:38:52.341Z`                                | Design-source authority for prospective lowering of S1; "not permission to bypass the Hard Preflight, invent a role/owner, or start construction".                                                  |

---

## I-2 Live baseline

- Current main: `8d25f9067219d944a5262eca06de20e70a5770f3` (PR #115 merged; it gives the integration test project a 120 s default timeout).
- The A0 census (source lock §8, 28 files) is anchored at `0c9e74b9d5dc8845751a543ace777277b2cb1308`, which is the parent of current main.
- Verification, `git diff --stat 0c9e74b 8d25f90`:

  ```text
   vitest.config.ts | 11 ++++++++++-
   1 file changed, 10 insertions(+), 1 deletion(-)
  ```

  No A0 census file moved. `vitest.config.ts` is not in the census.

- The PR #116 branch is based on `0c9e74b`, not on current main. Its only content beyond that base is two documents under `docs/f014b/` and one new test under `tests/contract/`. Construction starts from the then-current main.
- Terminal CI on this document's commit is not claimed here. It is recorded on PR #116 when it finishes (S11 §5 item 2).

---

## I-3 Source maturity of each indispensable rule

"Implemented" means production code. None exists.

| Rule                                                                 | Ratified design                                                           | BLUE-directed technical lowering                                                                                                                | Implemented                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| v1 chronology law unchanged                                          | S2 grant 2 "Preserve … all original v1/captured histories"                | S6 §3 N-2; S11 mandatory condition 1; source lock §3.1                                                                                          | none. A0-T00 tests existing code only (I-6).            |
| Strict v2 document/capture and the two-arm union                     | S1 §2; S2 grant 2 ("authenticated strict chronology v2 Input/Completion") | S5 §3 Alt I; S11 Q4 (`ONE_SI_SECOND_PER_CANONICAL_UNIT`); source lock §3.1                                                                      | none                                                    |
| Origin witness: kind, key, format, schema, SEALED, owner/facet       | S1 §3; S2 grant 1                                                         | S11 Q4 (`temporal_origin`, `temporal/origin`, `immortalis-temporal-origin`, existing `temporal_kernel/temporal_coordination`); source lock §3.2 | none                                                    |
| Paired genesis rule: one group, two version-zero writes              | S1 §3; S2 grant 2                                                         | source lock §3.3–§3.5                                                                                                                           | none                                                    |
| v2 Input citations, one per route                                    | S2 grants 2 and 5                                                         | RED C4; S11 Q1 option A (conditional; stop condition, I-9); source lock §3.3                                                                    | none                                                    |
| Version-to-genesis correspondence against the Completion's own Input | S1 §2; S2 grants 2–3                                                      | source lock §3.5 bootstrap step 3                                                                                                               | none                                                    |
| Live and historical enforcement of every new rule                    | S2 grant 3                                                                | S8 §5; S11 Q2 "Enforce all semantic history rules at live and verifyHistorical"                                                                 | none                                                    |
| Successor `historyVerificationId`                                    | S2 grant 3 "(including the affected MS historical-verifier suffix)"       | S11 Q2: two additive segments, old MS suffix literal retained; source lock §3.7                                                                 | none                                                    |
| MS v3 clock-step pair, live B2 prefix, SEALED history                | S2 grant 5                                                                | S8 §4; S11 Q1; source lock §3.6                                                                                                                 | none                                                    |
| Producer: v2 branch of the captured writer                           | S1 §3; S3 writer and publication identity                                 | source lock §3.4                                                                                                                                | none                                                    |
| Category-8 origin predicate, unwired, negative tests only            | S2 grant 4 (the live T0 read itself is B1)                                | S8 §5; S11 "one qualified category-eight predicate"; source lock §3.8                                                                           | none                                                    |
| Spec-lock lineage and executable-lowering rows                       | S2 (as the controlling ratification cited)                                | S6 §4(ii); S11 Q5; source lock §3.9 (narrow encoding issue documented, not resolved)                                                            | none. The executable row is added only at construction. |

---

## I-4 Owner chain of the paired genesis

| Link       | A0 lowering (source lock section)                                                                                                                                                                                                                                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Producer   | The trusted `initialize-captured-chronology` writer (`temporal/captured-chronology.ts`), v2 branch only, through the coordinator's existing `#kernelGroup` (CANDIDATE `establishCanonicalTimeWithOrigin`) (§3.4). In A0 the v2 Input itself is built only by engine fixtures; the reachable operator capture path is A1.                                 |
| Evidence   | The governing Completion (`initial_locality_completion`) and its own Input (`initial_setup_input`, World-State `world_initial_setup`) carrying a v2 capture: document, `document_hash`, `capture_hash`, grade `ORIGINAL_MESSAGE_VERIFIED` or `OPERATOR_CONFIRMED_RECORD_ONLY` (TOOL_CALL_ONLY refused) (§3.1, §3.5).                                     |
| Binding    | The Grant's `chronology_hash` binds Completion to Input. The origin's `chronology` and `governing` pins bind it to that capture and those committed versions. The publication digest covers `{campaign_id, completion, input, capture_hash}`. `reads`/`depends_on` are exactly the Completion and Input pins (non-MS) or `msTimePins` (MS) (§3.4, §3.5). |
| Permission | `role.archivist` + `permission.canon.write` (`CANON_WRITE_AUTHORITY`), under rule `TEMPORAL_CAPTURED_V2_GENESIS_RULE` (grant 2), gated by the state-dependent `bootstrapInitialTimePrecondition` (§3.3, §3.5).                                                                                                                                           |
| Owner      | `temporal_kernel / temporal_coordination` for both writes: `temporal/state` and the SEALED `temporal/origin` (§3.2).                                                                                                                                                                                                                                     |
| Consumer   | Live Temporal admission (`temporalGroupCheck`); the historical `verifyHistorical` Temporal hook; MS live B2 prefix (`msPrefixViolation`); MS historical integrity (`verifyMsIntegrity`). The later B1 category-8 reader is unwired: `siOriginWitnessViolation` has no caller in A0 (§3.5, §3.6, §3.8).                                                   |

---

## I-5 Authorship and visibility

- The chronology, its unit and its SI declaration are the **author's** statement, captured once at setup. The authentic capture path is A1, not A0.
- The origin is engine-internal: `secrecy: "engine-internal"`, as the captured writer uses today (source lock §3.2 Role Registry row).
- No GM canon-read right is created (S1 §5). A0 reads no GM canon, adds no read to any GM, player or operator surface, and has no live origin reader.
- No player or operator input field is added. No `packages/operator` or `apps/` file changes in A0.

---

## I-6 Acceptance matrix

| Test   | State                              | Note                                                                                                                                                               |
| ------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A0-T00 | **RUN NOW (existing code)** — PASS | See the result below.                                                                                                                                              |
| A0-T01 | UNRUN until construction           | Re-runs A0-T00 unchanged after the union lands.                                                                                                                    |
| A0-T02 | UNRUN until construction           | Needs the v2 schemas.                                                                                                                                              |
| A0-T03 | UNRUN until construction           | Needs a v2 document. Its legacy half is partly characterized now: A0-T00 shows `StartingChronologySchema` refuses `format_version: 2` and an extra `scale` member. |
| A0-T04 | UNRUN until construction           | Needs the v2 Input rules.                                                                                                                                          |
| A0-T05 | UNRUN until construction           | Needs the producer branch.                                                                                                                                         |
| A0-T06 | UNRUN until construction           | Needs the pair-shape check.                                                                                                                                        |
| A0-T07 | UNRUN until construction           | Needs the correspondence check.                                                                                                                                    |
| A0-T08 | UNRUN until construction           | Producer bytes.                                                                                                                                                    |
| A0-T09 | UNRUN until construction           | Origin forgery.                                                                                                                                                    |
| A0-T10 | UNRUN until construction           | Never-bootstrap and shape negatives.                                                                                                                               |
| A0-T11 | UNRUN until construction           | Lost-ACK retry.                                                                                                                                                    |
| A0-T12 | UNRUN until construction           | MS v3 lawful v2 chain.                                                                                                                                             |
| A0-T13 | UNRUN until construction           | MS negatives.                                                                                                                                                      |
| A0-T14 | UNRUN until construction           | MS historical.                                                                                                                                                     |
| A0-T15 | UNRUN until construction           | Identity transition, legacy and extension derivation.                                                                                                              |
| A0-T16 | UNRUN until construction           | Legacy controls. The existing control suites run green now (MS + v1 historic controls, below).                                                                     |
| A0-T17 | UNRUN until construction           | Category-8 predicate negatives.                                                                                                                                    |

**A0-T00 result.** `pnpm exec vitest run --project contract tests/contract/chronology-v1-baseline-corpus.test.ts` → `Test Files 1 passed (1)`, `Tests 60 passed (60)`.

- 57 specimens with frozen verdicts: 7 accepted, 50 refused. Three structural tests: format literal, frozen counts, byte/hash equivalence classes.
- Valid corpus: arbitrary unit Ids, values 0 and MAX_SAFE_INTEGER, exact format and statement.
- Negative corpus: wrong version, wrong format, missing and extra fields, wrong time shape, invalid unit, out-of-bounds value, invalid statement, coercion attempts.
- The two exports agree on every specimen:
  - the verdict;
  - the parse output (deep strict equality);
  - canonical JSON;
  - `chronologyDocumentHash`, which equals SHA-256 over the canonical JSON;
  - for refusals, the issue lists.
- **No disagreement found.** The claim in the comment at `initial-locality.ts:380–385` holds on this corpus.
- Observed edge, frozen: `value: -0` is accepted by both and canonicalizes as `0`, so it shares bytes and `document_hash` with `value: 0`.

---

## I-7 Engineering quality and whole-operation cost

- **Reuse.** The existing captured writer, `#kernelGroup`, bootstrap precondition, MS fence/prefix/integrity and checkpoint transition. New machinery: one kind, one schema file, three rules, one pure shape check, one pure preparatory predicate (source lock §7).
- **Run-time cost.** Genesis gains one write, once per campaign. Admission and replay gain constant-size checks. No new source read: the producer's reads are exactly today's (S1 §4), and the category-8 predicate takes no store.
- **Declared verifier-ID transition (S11 Q2/Q3).**
  - From: the composed identity at `owners/admission.ts:536`, which embeds `MS_HISTORY_POLICY_SUFFIX` unchanged.
  - To: that identity plus the CANDIDATE segments `+CAL-TIME-T1-CLOCK-ORIGIN@2026-11-18T22:23:26.085Z` and `+MS-V3-CLOCK-STEP-B2-ORIGIN`, appended after `+POPULATION-STAGE-AUTHORITY-V2`.
  - It applies in one code transition with the changed validators. The production, MS, fixture, legacy (`+LEGACY-PRE-V9-RUNTIME-CONTRACT`) and extension identities all change through the base.
  - Consequence: the first open of every existing campaign, pre-v0.9 legacy packages included, is a cold strict replay that seals a fresh checkpoint.
- **OB-030 measurement plan — UNRUN.** Harness: `tools/h07-s2-benchmark.sh` driving `tools/h07-s2-benchmark.ts`, reduced by `tools/h07-s2-compare.ts <evidence_dir> <base_sha> <head_sha>`, which also checks that both builds reach the identical canonical outcome.
  - BASE = the then-current main (today `8d25f90`); HEAD = the A0 construction head (`H07S2_BASE_SHA`, `H07S2_EXACT_SHA`).
  - Series P (pre-v0.9 legacy packages, S11 Q2): canonical fixtures built by the prior-contract tree `H07S2_OLD_SHA=eafbb127c476cafb8498316e496de29e078a2146` (the harness default), opened under `legacyContractAdmission`. Sizes `H07S2_CANONICAL_EXTRA` `0 100 500 2000`. The committed `tests/fixtures/legacy-base-eafbb127` package is opened the same way.
  - Series C (current-contract packages): the same harness with `H07S2_OLD_SHA` set to BASE, so the fixtures are sealed under BASE's identity. BASE opens them warm; HEAD opens them through the transition.
  - Series S (history length): one-fact packages, `H07S2_STORE_ENTRIES` `3 103 503 2003 5003`.
  - Series A (A0-specific journals): v1 no-bootstrap, v1 captured, v1 MS, the S-4 ledger (`tests/fixtures/s4-legacy-pc-c6ea29d`), new v2 non-MS and v2 MS. The harness has no seed mode for these today. The construction PR declares how they are seeded; this plan does not assume it.
  - Each cell measures cold first open (the transition), immediate reopen and warm open, plus the interrupted first open and its recovery.
  - Recorded per cell: wall time, CPU, peak RSS, journal bytes and entries, the harness's read/write counters, checkpoint creation and environment. `H07S2_REPS` measured repetitions (default 5); rep 0 is the excluded warmup.
  - Series P measures cold-open cost at both builds, because the prior-contract build's checkpoint identity matches neither build's legacy identity. A warm-at-BASE baseline for a legacy package needs it pre-opened once at BASE; if the harness cannot do that unchanged, that is reported as a tooling gap, not patched silently.
  - No threshold is invented. Any material regression goes to BLUE and, if it is a trade-off, to the Sovereign (S5 §6).

---

## I-8 Artifact custody

- A0-T00: `tests/contract/chronology-v1-baseline-corpus.test.ts` at this document's commit on `claude/f014b-a0-source-lock`.
  - Reproduce: `pnpm exec vitest run --project contract tests/contract/chronology-v1-baseline-corpus.test.ts`.
  - Retrieve exact bytes: `git show <commit>:tests/contract/chronology-v1-baseline-corpus.test.ts`.
- A0 source lock: `docs/f014b/a0-clock-origin-source-lock.md` at the same commit. It is the candidate, not the final contract (source lock §3.9, Q5).
- Base bytes of the 28 census files: `git show 0c9e74b9d5dc8845751a543ace777277b2cb1308:<path> | sha256sum` (source lock §8).
- No present-day SHA-256 is stated in this document, in the source lock or in the test (H-PROVENANCE). The test compares computed values with each other and contains no digest literal. Recipients compute identities from the commit.

---

## I-9 Governance

- **HOLD state.**
  - BLUE Universal Hard Preflight v6.2 (S10) W2 T1 HOLD: in force, "not silently cleared by a documentation update" (S11 §5 item 4).
  - A0/B0 prospective construction HOLD until a scoped Hard Preflight PASS (S11 disposition).
- **Permitted now (S11 gate interpretation):** source revision and exact-file tests of presently existing code, in preparatory, no-new-canon modes. This submission's commit uses only that permission: two documents and one test of existing code.
- **Still held:**
  - every change under `packages/` or `apps/`;
  - any new or changed writer, schema, interface, rule, registry entry, identity, hash pin, spec-lock row or conformance expectation;
  - A1, B1 and B2;
  - calendar profiles, `CAL_TIME_V1`, category 9 and G.3/G.4;
  - merge, deployment and release, which are Sovereign decisions.
- **Q1 stop condition (S11, verbatim):** "If the literal alternate cannot be registered while retaining the exact source-grade and MS provenance, stop that route alone rather than silently keeping old v1 MS authority on a new v2 arm."
  - If triggered at construction, the MS v2 route alone stops: an MS-route v2 Input is refused and never admitted under `INITIAL_SETUP_INPUT_MS_V3_RULE`.
  - The non-MS v2 route and all v1 routes are unaffected, and the stop is reported to BLUE.
  - The Builder's reading of "exact source-grade and MS provenance" is in source lock §3.3, open to BLUE correction.
- **Trip-wires carried from the source lock:** W1 (producer bytes, §3.1) and W3 (any touch of the D-3 pins, §4).
- **Separation.** B0 (#117) is untouched by this submission.

---

## I-10 Player experience

- **Not directly GM-facing.**
  - A0 is an engine mechanism: a sealed Temporal fact, its admission and its historical verification.
  - It adds no player question, no GM confirmation and no GM read.
  - The GM-facing consumer is B1's fresh SI INITIAL with the one qualified T0 origin read (grant 4), and the reachable author capture is A1.
- **What A0 enables.** Once A1 and B1 exist, a campaign whose author declared one SI second per canonical unit at setup has a machine-verifiable origin. A GM can then convert an in-fiction "wait two minutes" to 120 SI seconds lawfully, as part of conversational, GM-mediated voluntary waiting, the F-014B completion objective (S11 §5 item 6).
  - The author states the scale once.
  - No player is asked for technical identifiers.
  - Campaigns without that declaration keep their opaque v1 origin and are never retrofitted.

---

## MS + v1 historic controls (must stay green, unchanged)

All files exist at this document's commit.

Integration controls, run at this commit (`Test Files 10 passed (10)`, `Tests 107 passed (107)`):

- `tests/integration/ms-setup-chain.test.ts`
- `tests/integration/ms-setup-fence.test.ts`
- `tests/integration/ms-setup-history.test.ts`
- `tests/integration/ms-setup-cuts.test.ts`
- `tests/integration/initial-setup-recovery.test.ts`
- `tests/integration/initial-setup-chain.test.ts`
- `tests/integration/operator-time-initialization.test.ts`
- `tests/integration/temporal-enforcement.test.ts`
- `tests/integration/legacy-package-compat.test.ts` (pre-v0.9 package from the exact base)
- `tests/integration/policy-transition-replay.test.ts`

Security control, run at this commit (`Tests 3 passed (3)`): `tests/security/ms-setup-security.test.ts`.

Conformance controls, run with the full conformance project at this commit:

- `tests/conformance/time-initialization-conformance.test.ts` (strict operator parser source text)
- `tests/conformance/ms-setup-source.test.ts` (ten-clause MS manifest, lowering count, composed identity)
- `tests/conformance/ms-setup-regression-pins.test.ts`
- `tests/conformance/temporal-conformance.test.ts`

At construction, every file above must pass unchanged, except the declared re-pins listed in source lock §4. A declared re-pin changes an expected identity or count; it never weakens an assertion.

---

## Fixture evidence scope

- **T1 mechanism only.** Every positive A0 construction test uses testkit fixture authority:
  - the reserved `fixture:` namespace (`FIXTURE_NAMESPACE_PREFIX`, `packages/contracts/src/initial-locality.ts:50`);
  - the testkit-only `FixtureEvidenceVerifier` (`packages/testkit/src/initial-setup-fixtures.ts:63`, tier `T1_DOUBLE`);
  - the fixture admissions `fixtureCanonicalAdmission` / `fixtureMsCanonicalAdmission`, under the distinct `+fixture-evidence-t1` identity.
- Production admission rejects the `fixture:` namespace at admission, startup, load and replay. A static security test keeps production code from importing the fixture verifier.
- **No production claim.** No SI qualification of a real campaign, no authentic original-message evidence, no host and no retained-storage claim exists until A1. A0-T00 uses no evidence at all: it is a pure schema/hash characterization.

---

## Requested of BLUE

1. **Execute one scoped Hard Preflight for A0 construction**, against the then-current GitHub main and PR #116 at this document's commit. Scope:
   - (a) main SHA and the I-2 census invariance;
   - (b) source fidelity of source lock §3 against S1, S2 and S11 — the lowering of Q1–Q5 only, with no broad RED cycle;
   - (c) the A0-T00 result (I-6);
   - (d) the Builder's reading of the Q1 stop condition (source lock §3.3);
   - (e) the disposition of the Q5 narrow encoding issue (source lock §3.9): either resolved now, or left to the construction PR as a declared, reviewed encoding;
   - (f) this submission's owner chain, controls, OB-030 plan and fixture scope.
2. **Smallest gate:** a single PASS or HOLD verdict on "construct A0 on its own bounded branch from then-current main, per source lock §3, with the full new verifier ID in the same code transition as its validators".
   - PASS authorizes only that A0 code PR. It does not authorize A1, B0, B1 or B2 construction, or any merge or deployment.
   - A HOLD names the exact failing item.

   RED is needed only if an answer would add authority beyond the five grants.
