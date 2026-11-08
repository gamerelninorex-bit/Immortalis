# 🔴 RED Stage 3 Readiness Assessment — Conditional Architecture Comparison — PASS (conditional, paper-only) — 2026-11-08

**VERDICT: PASS, for readiness of the Stage 3 packet to support a conditional, paper-only architecture comparison.** This is **not** a behavioural PASS of any arm, **not** a ranking or selection, **not** Stage 4 experiment authority, **not** a source-fidelity acceptance, **not** a Builder instruction. No arm has passed behaviourally. RF-1 to RF-14 remain closed exactly as recorded. Stage 4 remains closed; no architecture has been selected.

## 1. What was assessed, and what PASS means

- **Packet:** the whole study page `41120af9-01e0-816d-992f-ffae5ae223c3` at native stamp **2026-11-07T23:40:45.499Z** (nothing written since RED's last verification; raw SHA-256 `7442df1df1a1f46c8ec74dd62326692a4cafc2773ed1950a3bad21f8f5057613`, NFM-MENTIONS-v1 `a2a0a285fd718ba154b5ce1e05dc3d02171379110090af8e70953f0fa04d6c8a`, 654,016 characters). Code: `36d50639ccf099fc0e69421f35cf036242c9bcad`, unchanged.
- **The comparison this PASS supports:** a paper-only comparison under the frozen procedure (S1.12 steps 2, 3, 6) that records, per arm, hard-eligibility status (paper-qualified, UNKNOWN or known gap), scope delivered against the product target, missing prerequisites, risk cases and decision-turning unknowns, and then **carries options forward or defers**. It cannot rank on cost, interaction metrics or any behaviour (§6).
- **Test for "genuinely gating".** A gap gates only if, left open, the comparison would lack an input the frozen procedure requires and that cannot be carried as UNKNOWN or conditional, or would rest on a premise RED has found false or unverified in a way that could reverse a conclusion.

## 2. Criteria used (all taken from the study itself)

Stage 3 definition (v0.2 §E); the frozen decision procedure S1.12 steps 1 to 9; Stage 2 binding conditions E4 C-1 to C-3; carried controls K-1 to K-5; and RS-6 ("a valid comparison can make a conditional design preference using formal causal traces, expected incremental cost ranges and measured A0 evidence, but cannot claim measured B/C/D speed, natural play or reliability … conclusions remain PROVISIONAL").

## 3. Assessment against the Stage 3 definition and the frozen procedure

| Requirement                                                   | Packet                                                                                                                                                                                                                                               | RED status                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Comparable state diagrams, A0/A/B/C/D and the mixed arm       | Graphs for S01, S02 and S06 at reference depth; causal and negative traces for S03 to S05 and S07 to S10; every frozen scenario S01 to S10 is covered; MX has a complete composed trace as S1.12 step 1 requires                                     | **Met.**                                                                                                |
| Owner and security contracts                                  | Ten-item specification for each of A0, A, B, C and D; MX by reference; v1.2 access gate, Population ownership, MX consumer matrix, B decisions                                                                                                       | **Met** (designed, unproved).                                                                           |
| Cut/adapt/rebuild ledger                                      | L01 to L42 for every arm, labelled "alternative-specific proposals, not ratified dispositions"                                                                                                                                                       | **Met.**                                                                                                |
| Equal negative-case coverage across arms                      | Negative edges and a trace row per arm for each scenario                                                                                                                                                                                             | **Met.**                                                                                                |
| A removed edge needs a replacement guarantee and a falsifier  | S3.10 record-level table; per-component test treatment in S3.07                                                                                                                                                                                      | **Met** for the contested seam.                                                                         |
| Evidence tiers kept apart                                     | A0 recorded (T1 scripted); all challengers DESIGNED/UNTESTED; unrun items named                                                                                                                                                                      | **Met** (RED's method sweep passed).                                                                    |
| **Cost/risk ranges**                                          | **Withdrawn by BLUE in v1.2** (formulaic, uncalibrated); replaced by a work register, arm-specific uncertainty cases and a stated calibration follow-up; effort is UNKNOWN for every arm                                                             | **Not met as originally defined.** Versioned, reasoned and symmetric, as S1.12 requires. See §5 and §6. |
| Identify uncertainty that needs a separately authorised spike | S3.08 names three narrow experiments in order (exact-main persistence diagnostic; one-seam prototype; semantic/client comparison), all "proposed only"; PW-EXCL-1, PW-EXCL-2, PW-REL-1, PW-REL-2; each U3 unknown paired with its resolving evidence | **Met.**                                                                                                |

**Inherited conditions.** E4 C-1: RED's trace is complete at the depth stated (all 80 anchors, eleven behavioural node families, empirical Pmain, 18 of 18 retained records, DLT-1 to DLT-3), and the gate is lifted only for the A0 baseline submetrics. E4 C-2: no argument relies on the quarantined extraction fields (RED's non-use check). E4 C-3: A9 exclusions respected. K-2 to K-5: honoured; K-4 (the hard GM-led criterion) applies in the comparison itself.

**A7, the comparison's A0 column.** All fifteen rows have now been examined. Rows that are code-checkable were checked against source; the rows backed by named suites were re-run at the frozen commit: `chat-scene`, `gip-sunset-enforcement`, `gip-sunset-frontier` and `gip-sunset-recovery` give **77 of 77 tests passing** (T1 mechanism, scripted hosts). There is no parallel-handling path anywhere (the gather contract reads "one serial handling cycle after another"), so the simultaneous-handling row stands. No A7 classification needed changing.

**Coherence of the layered packet.** A sweep for withdrawn claims found none surviving unflagged: every instance sits in a supersession context (quoted as withdrawn, inside a RED finding, or inside the S3.08 table labelled historical).

## 4. Gating paper-proof gaps

**None.** The closest candidates, and why none gates:

1. **Cost/risk ranges.** The frozen procedure lets unresolved tradeoffs be carried forward or deferred (S1.12 step 6, A9). The absence bounds what the comparison may conclude; it does not prevent the comparison. It **would** gate any ranking or selection (condition C-1).
2. **Unreviewed edge-by-edge A3–A6 labels, Mq and challenger counts.** These are not admissible comparison inputs (condition C-2), so they cannot corrupt it.
3. **Unrun witnesses.** They gate only behavioural confirmation of paths that rely on retained seams. The paper mechanisms rest on source evidence RED has read (condition C-3).
4. **No consolidated per-arm hard-eligibility register.** Building it is the first step of the comparison; every input it needs exists (mechanism and falsifier per constraint in the specifications, the scenario and guarantee matrices, and R12 to R14). It is an output, not a missing proof.
5. **Source adoption, first-open proof, host-dependent provenance.** These attach to arms as prerequisites and are carried as conditions (condition C-5).

## 5. The one limit that matters most

With effort UNKNOWN and every H, O, M metric excluded, the comparison **cannot say which arm is cheaper, faster or more natural to play**. What it can say is structural: which arms can even claim the target on paper (residual G entries mark A0, A and B as leaving generic revision, NPC initiative and sparse-source readiness unsupported), what each arm requires before it could be adopted, and where the evidence stops. That is a real and decision-relevant output. It is not a recommendation.

## 6. Conditions of use (binding; breaking any converts this PASS to AMEND)

1. **C-1 No cost basis.** No effort, affordability or dominance conclusion involving effort until a calibrated basis and an independent RED challenge exist (U3-17).
2. **C-2 No excluded inputs.** No use of H, O, M, Mq, A3–A6 edge or node counts, challenger counts or percentages. Any argument needing one first requires edge-level review or a versioned reconstruction.
3. **C-3 Tiers and the unrun.** A0 is T1 scripted evidence only; B, C, D and MX are DESIGNED. PW-EXCL-1, PW-EXCL-2, PW-REL-1 and PW-REL-2 are UNRUN and are stated as such; no "equal guarantee" is claimed for retained seams beyond source evidence. Genuine-host, named-client, retained-restart and model-fairness evidence are UNRUN for every arm, A0 included.
4. **C-4 Hard eligibility first, UNKNOWN as UNKNOWN.** Apply the nine S1.12 constraints and K-4 per arm. Provenance of original human wording (U3-03) and private-context isolation (U3-06) are host-dependent and UNKNOWN for all arms.
5. **C-5 Prerequisites stay attached.** C, MX and D are presented as conditional on prospective source adoption (U3-04), a new historical-verification identity with its first-open obligation (RF-12; OB-030 hold and the Sovereign's paid-storage park unchanged), gate and consumer conversion (W-C-READ), and for D the runtime, durability and migration work. A and B are presented with their residual G entries.
6. **C-6 Controlling text.** Cite the controlling section for each fact (R12 to R14 supersede earlier wording), and state digests with the NFM-MENTIONS-v1 method.
7. **C-7 Output form.** Carry options forward or defer. Select nothing. A spike or prototype is at most a recommendation for a separate lawful decision.
8. **C-8 Frozen criteria.** Any change to a criterion or to an A0 classification is appended as a versioned, symmetric delta.

## 7. Explicit lists

- **UNRUN witnesses:** PW-EXCL-1, PW-EXCL-2, PW-REL-1, PW-REL-2.
- **Unavailable metrics:** formal necessary and avoidable H, full O, actual M (calls, tokens, latency, cost), raw polling-derived ratios, and calibrated effort.
- **Unreviewed:** edge-by-edge A3–A6 labels, Mq, challenger counts.
- **Out of scope and unchanged:** M-S (Sovereign-pending), OB-030 and the paid retained-storage park, Stage 4, any spend, deployment, live opening, benchmark or migration.

## 8. Evidence and preservation

| Tier                | Content                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OBSERVED            | The packet at the stated stamp and digests; source at `36d5063`; the criteria sections as read.                                                              |
| RECORDED            | `chat-scene` and the three `gip-sunset` suites, 77 of 77 passing at `36d5063` on Node 22.23.4, pnpm 10.33.0, vitest 5.0.2. Earlier rounds' results as filed. |
| DESIGNED / UNTESTED | All behaviour of B, C, D and MX.                                                                                                                             |
| UNRUN               | The four witnesses; genuine host and client; retained restart; model fairness.                                                                               |

**Files added in this round** (earlier rounds untouched; digest in `SHA256SUMS-round5`): `06-stage3-readiness-assessment.md` (this record). No new script or witness; the one test command is `pnpm exec vitest run tests/integration/chat-scene.test.ts tests/integration/gip-sunset-enforcement.test.ts tests/integration/gip-sunset-frontier.test.ts tests/integration/gip-sunset-recovery.test.ts` at `36d5063`. Repository custody: no pull request; this directory is the only change.
