# 🔴 RED Stage 5 — Bounded Independent Adversarial Paper Review — COMPLETE; NO ARCHITECTURE SELECTED, PREFERRED OR RANKED; S1.12 STEP 9 NOT SATISFIED ON THIS RECORD — 2026-11-08

**PAPER REVIEW ONLY. NOT A SELECTION, RANKING OR PREFERENCE; NOT A BEHAVIOURAL PASS OF ANY ARM; NOT A SOURCE-FIDELITY ACCEPTANCE; NOT A HARD PREFLIGHT; NOT A BUILDER INSTRUCTION.** No code was changed, no test, witness, benchmark or model experiment was run, and no expenditure, deployment, migration or live opening is authorised or recommended. RF-1 to RF-21 remain closed as BLUE documentary responses. The conformance PASS of the Stage 4 comparison stands and is not upgraded by this review.

## 1. Authority and scope

The instruction, as given in this session and read by RED directly:

> Authorize Stage 5 of the IMMORTALIS architectural reassessment as a bounded, independent RED adversarial paper review. Apply the frozen criteria and Stage 4 findings. Identify material counter-traces, unresolved guarantees and decision-critical evidence gaps. Do not select an architecture, change code, conduct experiments or authorize expenditure.

- **What it authorises:** this review and nothing else. It does not authorise BLUE's reconciliation (Stage 5 asks BLUE to reconcile; RED requests it in section 8), a Sovereign decision, a Hard Preflight, source fidelity work or any Builder step.
- **Unlike the Stage 4 instruction, RED has seen this one itself.** The Stage 4 authority record is still BLUE-attributed and unverified by RED (RF-20; EG-8).
- **Criteria applied:** the frozen decision procedure S1.12 steps 1 to 9, K-1 to K-5 (K-4 as a hard criterion), the Stage 4 hard-eligibility register and findings (S4.03 to S4.08 as amended by v1.1 and the RF-21 addendum), and RED's conditions C-1 to C-8.
- **Method (N-3 and S1.12 step 9):** adversarial counter-traces are built against each challenger's claimed replacement guarantee, symmetrically, with source anchors, an outcome, the falsifier and the reconciliation requested. Where a trace favours an arm on paper, it says so. Nothing is counted, priced or ordered (C-1, C-2).

## 2. Reviewed object and custody

- **Object:** study page `41120af9-01e0-816d-992f-ffae5ae223c3` at native stamp **2026-11-08T01:21:17.002Z**, which is RED's own last append. The body is 765,255 characters; raw SHA-256 `e9b969a724461586e227c6460ff4b50914c9848572b9166d5f9aeb4164c1d168`, NFM-MENTIONS-v1 `23031bcefbee34abb7b3ad8437acf5efee58844689d9de2b9978df98200ed524`, **byte-identical** to the body RED verified after that append. The write log is empty from 01:21:35Z to 01:44:28Z, so BLUE wrote nothing after RED.
- **Code:** frozen commit `36d50639ccf099fc0e69421f35cf036242c9bcad`, tree `dfe8fd0f1da025cc0704f4b66e165cab20a7ef3b`. `origin/main` is unchanged, and `apps/`, `packages/` and `tests/` on RED's branch are identical to it.
- **Disclosure.** Source reading and text matching only. RED ran no test, witness, build, install or model call. The one new script, `witness/red-s5-anchor-checks.py.txt`, opens files as text and prints line anchors; its output is `evidence/s5-anchor-output.txt`. The documentation formatter and the repository's two documentation checks were run on the files added in this round, as in earlier rounds.

## 3. Counter-traces

Outcome tags: **HOLDS** (the claim survives the trace on paper), **GAP** (the trace breaks the claim as specified, or the specification does not decide it), **DOC-GAP** (the design may well work but the packet does not say). All arms are DESIGNED and UNTESTED except A0's recorded T1 mechanisms.

### S5-CT-1 — Provenance is guarded; content is not (C, D, MX). GAP, material.

- **Claim attacked.** The S3.02 contract: "A GM may fill routine means only within an adopted policy; spending, promise, risk acceptance, identity or changed goal requires the player's authority. Falsifier: 'collect two' silently becomes 'steal all five' or consent copied from NPC text." C item 2 states "Player controls consequential PC decisions"; C item 2 gives GM-origin records explicit "GM-established" provenance, scope and uncertainty, and C item 3 adds a `FictionAssertion` record with exact source and version references, effective time and visibility.
- **Trace.** An authorised GM writes a `FictionAssertion` tagged GM-established, scoped to the world, with stated uncertainty: "the foreman has Bob's signed wage agreement." The provenance guard is satisfied: the tag is genuine, it is not claimed as player-authored, it carries scope and version. The assertion is admitted as fiction. The narration treats it as a commitment. No player consent was ever recorded, and none was falsely recorded.
- **Why it matters.** The packet gives the requirement and the falsifier but no mechanism that tests the content of an admitted GM-origin assertion about the PC against the "spending, promise, risk acceptance, identity, changed goal" list. A lexical search of the study body for a PC-subject screen, a content classifier or a closed set of assertion kinds finds none. The protection is therefore the model's own judgement plus an unadopted policy.
- **Source basis.** A0 stamps its player-authored setup and action records with the literal player-choice authority. Seven production files reference it (`packages/contracts` pc-collection, pc-movement, temporal, world-foundation; `packages/engine` epistemic direct-observation; `packages/operator` commands, original-pc). The study body never names the constant. Removing player prompts means writing records that those consumers do not stamp that way; whether the content stays on the right side of the line is not decided by stamping.
- **Falsifier.** Any admitted GM-origin assertion that creates or implies a PC promise, spend, risk acceptance, identity change or goal change without the actual PC choice.
- **Reconcile (BLUE).** Specify a decidable screen (a closed set of GM-assertable kinds, and refusal of PC-subject commitment predicates), or state that the boundary is model-judged and mark H02 and K-4 U for this reason too. **Arms.** C, D and MX write GM-origin fiction and owe it. A and B do not write world facts, so they fail on coverage (G) and do not owe it.

### S5-CT-2 — The write gate has one place to live; the read gate does not (C, MX, D). Write HOLDS ON PAPER; read GAP for C and MX.

- **Claim attacked.** S4.05: "Every ordinary read/dispatch/commit revalidates."
- **Trace, write half.** Every canonical write publishes through `CampaignStore.commit(group)` (`store.ts` 60), and admission receives the pre-state (`admission.ts` receives `(group, state)`). A hold or epoch fact in the pre-state, with a rule that only repair groups are admitted while it stands, is a self-contained check in the one place all groups pass. A stage computed before a hold and committed during it is refused there. **HOLDS ON PAPER.** It is also the more convincing half of C's design, and RED records that.
- **Trace, stale task.** Task identity is derived from the exact context in both referee families (`collection-referee.ts` 33 to 39 hashes operation, task and attempt; `derive.ts` 263 to 264 hashes the context digest). A context changed by a revision therefore produces a different task, and the old task and its answer cannot be found by the new question. Replay of a stale task is self-closing. The cost is the converse: an operation whose context changed by repair cannot republish under its old identity (`referee-exchange.ts` 771 returns `TASK_CONFLICT`), which the repair sagas must expect.
- **Trace, read half.** The store exposes five required and two optional reads and `CanonicalCampaign.store` is public (`store.ts` 51 to 77). None of them has a hold or epoch concept, and nothing in the interface is a single point where reads can be gated. Gating reads means withholding the raw store from every legacy consumer and supplying gated views, including the two optional proof reads (RED v1.4 erratum), or the campaign becomes unavailable.
- **D, symmetrically.** D has no legacy raw-store consumer by construction, because its readers are a new projection API. That removes the retrofit and leaves the rewrite: every consumer D replaces must be re-specified against that API.
- **Falsifier.** Any play path that reads superseded state without passing the gate; or a stuck repair that cannot release its hold because its question can no longer be republished.
- **Reconcile (BLUE).** Name the read choke point, the visibility change that forces it, and the repair-saga rule for tasks whose context changed.

### S5-CT-3 — Policy epochs are per group, but today's mechanism is per campaign (C, MX; D at migration). GAP.

- **Claim attacked.** S4.06 (C): "Old groups are judged under actual pre-state/old semantics; new repair groups under new policy."
- **Trace.** The only precedent is `legacyContractAdmission` (`admission.ts` 714 to 720). It wraps the live admission, **refuses** the newer surfaces, and carries its own `historyVerificationId`; a campaign opens under it as a whole, and a different identity means the first open replays strictly (OB-030). The checkpoint records one policy identity (`checkpoint-package.ts` 79 to 80). That is a per-campaign restriction. C needs the opposite: one journal that contains groups committed under two policies, verified each under its own, with the later policy admitting more. That needs a boundary record in the journal, a rule for which policy admits that record (it cannot be judged by the policy it introduces, nor by the one it leaves, without a definition), a verifier that dispatches by group, and a checkpoint that spans the boundary.
- **D.** D's native model carries versioned reducer and policy identities, and "unsupported old policy blocks replay" (D item 4). For D the problem moves to migration: a mapping from each legacy fact kind's history to the destination, which is unspecified (D item 8).
- **Falsifier.** A journal in which a group is accepted or refused differently from how its own policy would have judged it at commit; or a checkpoint taken after the boundary that cannot be verified from the boundary.
- **Reconcile (BLUE).** Specify the boundary record, who admits it, how replay selects the policy, and how a checkpoint is anchored across it. First-open cost and interruption behaviour remain UNKNOWN (R13.02).

### S5-CT-4 — Revising sealed canon is not an amendment, and the revisable set is not defined (C, MX; D partly). GAP.

- **Claim attacked.** C item 4: C-REV "does not change every SEALED kind"; "Deterministic accounting is repaired only through its domain owner."
- **Trace.** A0 refuses any change to sealed canon in so many words: `AMENDMENT_NOT_SUPPORTED`, "sealed canon cannot be overwritten; no amendment mechanism is implemented" (`admission.ts` 513 to 516). So revision cannot be an edit; it is an overlay plus compensating owner transitions. S05 (correct fact F after dependent G) needs, for each owner chain that can be revised, a repair transition that preserves the owner's conservation laws (resources, custody, time), plus a negative test. The packet names the protocol (barrier, plan, owner repairs, seal) but not which kinds are revisable, not which repair transition each owner offers, and not the conservation invariant each must hold. "Does not change every SEALED kind" implies some kinds change lifecycle, which is a registry amendment of pinned absences (R12.07).
- **D, symmetrically.** D's events can "create, advance, supersede or repair a proposition" natively, so supersession needs no overlay. Per-domain compensating transitions and conservation proofs are equally unspecified.
- **Falsifier.** A revision that leaves a domain's balance, custody or time inconsistent with the corrected fact; or a consumer that reads an unsealed revision.
- **Reconcile (BLUE).** A table for the staged owners at least (Population, Production, Temporal, Economy): revisable kinds, repair transition, invariant, negative test.

### S5-CT-5 — B: the single-goal invariant is real, and R12.05 does not carry it (B). DOC-GAP.

- **Claim attacked.** R12.05 B.RETAIN preserves A0's ordinary adoption (DLT-1) and fails closed before dispatch.
- **Trace.** A0 runs at most one goal (`goal.ts` 263 returns "already being carried out" when one is running) and holds one retained record (`d.retained()` 246, 269). The resume test then selects that record by in-progress outcome, amount, until and dispatch reference (289 to 291). The id is a hash of client, grant and request id (296), so a resumed goal keeps the creating grant's id while a different grant continues it. Fail-closed-before-dispatch already exists at goal granularity: "retained BEFORE anything is dispatched" (309 to 310). B's consolidated workflow index spans stages and may hold more than one open goal. If it does, "amount-based adoption" becomes ambiguous: two open goals can match one repeated request.
- **Two consequences.** The one-open-goal invariant must be stated, or a multi-goal adoption key defined. And part of what B adds (durable-before-dispatch) already exists in A0 for the goal record, so B's delta is the stage journal, not the principle. That is a statement about what is new, not about cost.
- **Falsifier.** A repeated request adopting the wrong open goal; or a second goal started while one is open.
- **Reconcile (BLUE).** State the invariant in R12.05 terms.

### S5-CT-6 — A: guidance cannot forge a confirmation (A). HOLDS.

- **Claim attacked.** S4.06: "Prove adaptation cannot manufacture PC consent." S08, forged consent.
- **Trace.** Confirmation-bearing acts are confirmed by the human through the client, not by the assistant: the phrase "is not shown to the assistant" (`chat-tools.ts` 98), and every consequential tool tells the model "You cannot confirm, and you must not ask them to tell you the confirmation phrase" (363, 528, 682, 733). A guide that tells the model to proceed when intent is clear cannot supply that phrase. **HOLDS** wherever the client delivers the prompt, which is the host dependence already carried as U.
- **What is left for A.** The wording of the request itself and any routine-premise inference remain the model's. Both are U3-03 and the adopted-policy question, shared by every arm. A cannot lower the number of confirmation steps without a producer or a policy, so its K-4 gain is bounded to presentation. That is a bound on the claim, not a defect.
- **Falsifier.** A consequential act completed with no client-delivered confirmation.

### S5-CT-7 — MX: the insertion seam is closed on paper; the choice-authority seam is not in the matrix (MX). DOC-GAP.

- **Claim attacked.** S4.05: "An unclassified transitive consumer proceeding falsifies the bridge." R12.04 consumer matrix.
- **Trace, insertion seam.** The eight production sites that key on the native insertion literal are all named in the R12.04 matrix, which also names one more than RED's search found. The engine refuses an unrecognised mode by default (`derive.ts` 1233 returns `UNSUPPORTED_BRIDGE`). **HOLDS ON PAPER** for the seam it covers.
- **Trace, choice-authority seam.** MX's benefit is removing prompts for routine premises. The records those prompts produce are stamped with the player-choice authority and consumed by schemas that require it: `pc-collection.ts` 152 to 153, `pc-movement.ts`, `temporal.ts`, `world-foundation.ts`, `direct-observation.ts` 106, and six stamps in `commands.ts` (352, 564, 697, 895, 1200, 1600). None is in the R12.04 matrix, and the study never names the constant. For each prompt MX removes, either a new GM-source record feeds an unchanged consumer (an amendment of that consumer) or the old command is invoked without a player act (forged provenance, forbidden).
- **Falsifier.** A retained consumer accepting GM-origin input under the player-choice stamp.
- **Reconcile (BLUE).** Extend the matrix to this seam and identify which commands lie on the prompt-removal path.

### S5-CT-8 — D: three coordination protocols are relocated, not eliminated (D). DOC-GAP.

- **Claim attacked.** D items 2, 5 and 6: sole writer is the Transaction Service; authenticate capability, choice and task evidence; reopen verifies and re-presents.
- **Trace.** A0 coordinates writers with a single-writer `LOCK` file and a PID-liveness reclaim protocol designed against ABA replacement (`file-package.ts` 55, 256 to 290). It coordinates the host with an HMAC-bound task and decision protocol with first-answer retention by exclusive create (`referee-exchange.ts` 169 and 717 to 771). D replaces both with database locking and a "typed decision slot". The packet states the shapes but not the protocols: how an external host proves identity to D, how the first answer is retained and how a second is refused, how a crashed writer's takeover is made safe, and what the outbox guarantees when a delivery crosses a crash. Ten operator entry points exist (`*-bin.ts`); RED did not determine which open the campaign for write, and D must account for each that does.
- **Falsifier.** Two answers accepted for one decision; a second writer admitted; a side effect delivered twice or lost across a crash.
- **Reconcile (BLUE).** Specify the three protocols at the same depth as the A0 originals, with D-side witnesses designed (the existing PW-EXCL and PW-REL designs have no D counterpart, S4.03).

### What the traces leave standing, arm by arm (alphabetical; not a ranking, not summable)

- **A0:** the recorded T1 mechanisms are unchanged by this review. The three named producer gaps (generic revision, NPC initiative, sparse-source readiness) and simultaneous handling remain.
- **A:** holds on S5-CT-6; adds no producer, so the gaps remain.
- **B:** adds the stage journal and retained exclusive stores; owes S5-CT-5 and S4.U-GRANT on its multi-goal side; adds no producer.
- **C:** specifies the missing producers at record level; owes S5-CT-1, -2, -3, -4 and S4.U-GRANT-C.
- **D:** specifies the same producers over a new kernel; owes S5-CT-1, -4, -8 and S4.U-GRANT-D, carries -2 and -3 as rewrite and migration rather than retrofit.
- **MX:** the C obligations plus S5-CT-7.

## 4. Unresolved guarantees

| ID    | Guarantee                                                                  | Owed by                 | Status                                 |
| ----- | -------------------------------------------------------------------------- | ----------------------- | -------------------------------------- |
| UG-1  | Content guard for GM-origin assertions about the PC (S5-CT-1)              | C, D, MX                | Unspecified                            |
| UG-2  | Read-side gate placement and visibility of the raw store (S5-CT-2)         | C, MX (D by rewrite)    | Unspecified; write half HOLDS ON PAPER |
| UG-3  | Per-group policy boundary, dispatch and checkpoint anchoring (S5-CT-3)     | C, MX (D at migration)  | Unspecified                            |
| UG-4  | Revisable-kind matrix and conservation-preserving repairs (S5-CT-4)        | C, MX, D                | Unspecified                            |
| UG-5  | Grant and continuation authority (S4.U-GRANT-C, S4.U-GRANT-D)              | C, D                    | Named UNKNOWN, no rule invented        |
| UG-6  | One-open-goal invariant or multi-goal adoption key (S5-CT-5)               | B                       | Unstated                               |
| UG-7  | Choice-authority consumer classification (S5-CT-7)                         | MX                      | Outside the matrix                     |
| UG-8  | Writer, host-proof and one-winner protocols for D (S5-CT-8)                | D                       | Shapes only                            |
| UG-9  | Original-wording provenance U3-03; private-context isolation U3-06         | Every arm               | Host-dependent; UNKNOWN                |
| UG-10 | Retained exclusivity and release: PW-EXCL-1, PW-EXCL-2, PW-REL-1, PW-REL-2 | Every arm with the seam | UNRUN; D needs its own counterpart     |

## 5. Decision-critical evidence gaps

| ID   | Gap                                                                                                                                                                              | Why it turns the decision                                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| EG-1 | A calibrated effort basis and the independent effort challenge (U3-17). S1.12 step 6 asks for low, base and high lifetime effort ranges; they were withdrawn and none exists.    | Steps 6 and 9 cannot be completed, and no affordability or dominance statement is admissible (C-1).                                     |
| EG-2 | The executable integrity suite of step 8 for B, C, D and MX: unauthorised mutation, duplicated commit, forged PC commitment, undetected seeded tamper. No such suite has run.    | A structural analysis "cannot certify the absence of those failures" (step 8). Paper traces leave all four classes unproved.            |
| EG-3 | Actual GM behaviour (K-4), genuine-host and named-client tier, model fairness. UNRUN for every arm, A0 included.                                                                 | It is the hard criterion most likely to decide the product, and no kernel choice settles it.                                            |
| EG-4 | A registered S07 (varied resumed history). The packet records "a paper obligation for 50–100 actions, not an invented executed transcript"; no transcript or seed is registered. | Long-horizon memory is where retrieval, projection and revision claims meet, and none of A's, C's or D's claims about it can be tested. |
| EG-5 | The retained-state scope: which existing campaigns must survive, and whether they are disposable. C item 9 calls this "an explicit future decision, not presumed".               | It decides whether first-trust, migration and OB-030 first-open cost bind C, MX and D at all (RF-12). It is a Sovereign input.          |
| EG-6 | An adopted policy for "routine means" versus "consequential PC choice" (the S3.02 policy).                                                                                       | Without it the K-4 benefit of C, D and MX has no defined extent, and UG-1 has nothing to be checked against.                            |
| EG-7 | Matched-tier measurement. Steps 5 and 7 apply to executable arms only; no challenger is executable and none is authorised.                                                       | There is no measured comparison of any kind between arms, and none can be inferred from paper.                                          |
| EG-8 | Sovereign-record verification of the Stage 4 authority statement (RF-20).                                                                                                        | Any later stage relying on Stage 4 needs it from the Sovereign's own record. Stage 5's own authority is verified by RED in section 1.   |

## 6. S1.12 step 9: what a final preferred architecture requires

| Requirement                        | State on this record                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual defined alternatives        | **Partly met.** A0 is actual. A, B, C, D and MX are paper-defined with ten-item specifications, with named unknowns for C and D (UG-5) and unstated invariants (UG-6, UG-7, UG-8). |
| Source and owner transition impact | **Partly met.** L01 to L42, S3.07 and S4.06 attach prerequisites; UG-1, UG-3 and UG-4 show that the revision, policy and agency transitions are not yet specified for C, D and MX. |
| Security and continuity negatives  | **Not met.** Paper negatives exist; the step 8 suite and the PW witnesses are unrun (EG-2, UG-10); first-open cost and interruption behaviour are UNKNOWN.                         |
| Independent effort challenge       | **Not met.** There is no calibrated basis to challenge (EG-1).                                                                                                                     |
| Sensitivity                        | **Qualitative only.** S4.07 gives sensitivity without weights; step 6's range analysis cannot be done without EG-1.                                                                |
| Sovereign decision                 | **Pending.** It is the Sovereign's alone.                                                                                                                                          |

**RED's finding.** On this record a final preferred architecture is not supportable, and RED does not select, prefer or rank. The comparison supports exactly what S4.08 says: carry the options forward and defer preference, ranking, effort conclusion and adoption. The step 9 shortfall is in evidence and specification, not in any single arm.

## 7. Two structural observations (neither a preference)

1. **The hard obligations sit in the semantic layer, not in the kernel.** UG-1 (content guard), UG-4 (revision repairs) and UG-5 (continuation authority) attach to whatever arm closes the producer gaps. Replacing the commit kernel (D) does not discharge them, and keeping it (C) does not create them. What differs between C and D is where the retrofit cost lands: C retrofits the read gate and the policy boundary (S5-CT-2, -3); D inherits supersession and versioned policies natively and takes on migration, the rewrite of every consumer and the relocated protocols (S5-CT-3, -8). The packet cannot say which is smaller (EG-1), and RED does not.
2. **The largest lever on the hard criteria is outside the arms.** K-4, U3-03 and U3-06 are decided by host and model behaviour (EG-3), which none of A0, A, B, C, D or MX changes. Evidence on those can be gathered without choosing a kernel. RED names that as a sequencing fact and authorises nothing.

## 8. Requests, and who can supply what

- **BLUE, documentary only (Stage 5 reconciliation).** Append versioned deltas that either specify or explicitly mark as UNKNOWN: UG-1, UG-2, UG-3, UG-4, UG-6, UG-7 and UG-8, in R13.04 form (exact old claim, replacement, reason, arms, tier). No new sample, trace or execution is requested, and none of this selects an architecture. RED will review them at their settled pin.
- **Sovereign, inputs only the Sovereign can give.** EG-5 (retained-state scope), EG-6 (the routine-versus-consequential policy), EG-8 (the Stage 4 authority record), and whether any evidence-gathering named in S3.08 should ever be authorised. RED does not recommend any of those authorisations and does not authorise them.
- **Narrowest evidence that would move each gap,** for the Sovereign's information and without a recommendation: EG-1 needs a calibrated basis, which only a separately authorised bounded prototype of one seam or an independent estimator working from one can produce; EG-2 and UG-10 need the step 8 suite and the four witnesses; EG-3 needs a genuine-host session under frozen controls; EG-4 needs a registered S07 transcript and seed.

## 9. Unchanged, unreviewed and out of scope

- **Unchanged:** RF-1 to RF-21 closure; the readiness PASS and the Stage 4 conformance PASS and their conditions; A7 and every A0 classification; the frozen target and criteria; M-S, OB-030 and the Sovereign's park on paid retained-storage and restart work.
- **Unreviewed and inadmissible:** edge-by-edge A3 to A6 labels, Mq and challenger counts, and every A9-excluded metric.
- **Limits of this review.** It is a paper review at one pin. The text searches are lexical; section 3 states where RED also read the passage. S5-CT-8 does not establish which operator entry points write. Counter-traces that found no break (S5-CT-6, the write half of S5-CT-2, the insertion seam of S5-CT-7) are HOLDS ON PAPER, not behavioural confirmations.

## 10. Evidence and preservation

| Tier     | Content                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| OBSERVED | The page body at the stated stamp and digests; source at `36d5063` (line anchors in section 3 and `evidence/s5-anchor-output.txt`). |
| RECORDED | The 77 of 77 passing suite result at `36d5063` from the readiness round. No new run.                                                |
| DESIGNED | Every challenger mechanism and every counter-trace outcome in section 3.                                                            |
| UNRUN    | The four witnesses; the step 8 suite; genuine host and client; retained restart; model fairness; any matched-tier trial.            |

**Files added in this round** (earlier rounds untouched; digests in `SHA256SUMS-round9`): `10-stage5-adversarial-paper-review.md` (this record), `witness/red-s5-anchor-checks.py.txt` and `evidence/s5-anchor-output.txt`. Repository custody: no pull request; this directory is the only change.
