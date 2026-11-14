# ROADBED first-profile institutional freight — Foundation F + Integration I

Construction record of the `R2-D18-v1.2.1/first-profile/economy-fixed-freight` capability, built under ROADBED **R3-T25**
(BLUE Formal Universal Hard Preflight v6.2, conditional-scope PASS, bounded Builder brief) over the ratified source architecture
**R2-D18 v1.2.1** (Sovereign scoped source ratification R2-D22) and the scoped **R3-T2** EL-01F / EL-02S / F-017 overlay as corrected by
**R3-T17 CT-1..CT-4** (Sovereign scoped source ratification R3-T20, re-freeze R3-T21).

Status: **built, staged, unmerged, awaiting independent BLUE review.** Every kind label, key space, seal and event wire detail below is a
_technical lowering_ of ratified semantics and a Builder encoding, not a frozen source literal (see §9). Evidence is **mechanism only (T1)**: a
scripted double plays the GM's session; there is no genuine host, named client, retained storage or paid host (§8).

## 1. What exists

One coherent operation over a real file-backed canonical campaign, in two stages:

**Foundation F** — an original, GM-authored, NULL-PC world earns the right to _fix_ a freight request, and can lawfully _cancel_ it:

| Step | Act                                                                                                                                                                                        | Owner                            | Source                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | --------------------- |
| 1    | Attest the one original GM envelope (typed slices + verbatim prose, digest)                                                                                                                | World-State                      | R2-D18 §1, §1.1; PO-6 |
| 2    | Initialize canonical T0                                                                                                                                                                    | Temporal                         | existing              |
| 3    | Assemble legal source: Opening Basis with Closed Governing Coverage → institution → office → Scope Binding → one Instrument → seven separately addressable clauses C-01..C-07              | GIP                              | §§1, 1.2, 2, 2.1      |
| 4    | Seal readiness at T0 (immutable provenance + protected heads P-1..P-4 + GIP owner head; **never** an eligibility flag)                                                                     | GIP                              | §§1.1, 3.1, 3.2       |
| 5    | Admit the objective site condition and Production's prospective material specification and dedicated input lot (each only from a typed original slice)                                     | World-State, Production          | §1.1                  |
| 6    | **C-05** origin self-provision: one exclusive Production Request from the admitted material and the ONE dedicated lot; earned whole output accepted by World-State as one conserved entity | Economy, Production, World-State | §2.1, §4 steps 2–3    |
| 7    | **E0 / C-06** fixation: ONE request with three individually exclusive slots (directive-use, conserved cargo, site requirement), immutable identity                                         | Economy                          | §4 step 4             |
| 8    | **W2 / W3** protective admission (create-once, protection only), then **C** terminal close with exactly-once slot release and F4 fenced at the close's own cut                             | Economy                          | §5, CT-2              |
| 9    | Read-only Logistics verifier: reads the Economy request, writes nothing                                                                                                                    | Logistics                        | §4 step 5             |

**Integration I** — an independently evidenced non-agentive service carries the whole cargo, with fresh Economy status at each act:

| Step | Act                                                                                                                                                                              | Owner                           | Source                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------ |
| 10   | Admit the Non-Agentive Service Basis (needs the World-State corridor of the exact ordered endpoints)                                                                             | Logistics                       | §4 step 6                |
| 11   | **L0** service admission — one entity-keyed commitment + a service slot; fresh Economy status witness S0                                                                         | Logistics                       | EL-02S                   |
| 12   | **F2** unused release (only after Economy's protective admission, Transfer Record guarded absent in the same commit; immutable event)                                            | Logistics                       | EL-01F, WS-010 §§9, 10.4 |
| 13   | **L1 / F3** first dispatch — the ORIGINAL dispatch; fresh, independently re-derived status S1; Transfer Record owner key + version 1 + content digest + canonical commit receipt | Logistics                       | EL-01F                   |
| 14   | **E1** — Economy consumes the one directive use against the immutable dispatch event (unused ceiling headroom is arithmetic, never another output)                               | Economy                         | EL-01F                   |
| 15   | **TE** — Temporal enrolment of the dispatched transfer's object; dispatch/enrolment fence on every advance path                                                                  | Logistics, Temporal             | §4 step 8                |
| 16   | Earned **LD → WT/ECT-01 → LR → ER** (four stages of one engaged boundary)                                                                                                        | Logistics, World-State, Economy | R3-T2 §4                 |
| 17   | **AD** — independently sourced destination adequacy, an AS-OF-NOW Economy derivation                                                                                             | Economy                         | §4 step 10               |
| 18   | **E2** — a later, genuinely new request for the same entity, under a new identity with renewed authority, only after the old terminal close                                      | Economy                         | §5                       |

Two causally independent worlds prove it: **Quarry Works** (12 damaged blocks → 12-block whole output) and **Textile Workshop** (5-bolt
requirement, 8-bolt one-use ceiling → 5 delivered, 3 unused). Their legal sources, ordinances, institutions and sites are separate; a
permission-only Instrument is refused for C-05/C-06 and a combined Instrument across two governing orders is refused.

## 2. Ownership: nothing new is an owner

| Owner (existing) | New kinds (26 in total)                                                                                                                                                                                                                                                                                                                                          | New adapter                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| World-State      | `world_opening_attestation`, `world_site_condition`, `world_governing_premise`, `world_governing_premise_head` (three NEW isolated facets: `world_opening_provenance`, `world_site_condition`, `world_governing_premise`)                                                                                                                                        | `WorldFreightAdapter`      |
| GIP              | `gip_opening_basis`, `gip_instrument_clause`, `gip_legal_readiness_seal`                                                                                                                                                                                                                                                                                         | `GipFreightAdapter`        |
| Production       | `production_material_specification`, `production_input_lot`                                                                                                                                                                                                                                                                                                      | `ProductionFreightAdapter` |
| Economy          | `economy_origin_allocation`, `economy_origin_lot_slot`, `economy_accepted_output_holding`, `economy_freight_request`, `economy_freight_allocation`, `economy_freight_{directive_use,cargo,requirement}_slot`, `economy_freight_withdrawal`, `economy_freight_close`, `economy_freight_use_consumption`, `economy_freight_result`, `economy_destination_adequacy` | `EconomyFreightAdapter`    |
| Logistics        | `logistics_service_basis`, `logistics_service_slot`, `logistics_unused_release`, `logistics_freight_dispatch_enrollment`                                                                                                                                                                                                                                         | `LogisticsFreightAdapter`  |

Everything lives in `packages/engine/src/freight/` so the predecessor owner directories gain no file. The Logistics commitment and transfer
contracts gain one **optional** `freight` part and one state, `RELEASED_UNUSED`; both are absent for every non-freight movement (unchanged
bytes of meaning). No second physical custodian, no title or facility inventory, no Logistics-owned economic request, no stored eligibility
flag, use counter, cross-owner invalidation fact or Logistics refusal record exists.

**GIP legal applicability is derived, never stored** (applies / does_not_apply / contested / unresolved): GIP → Economy → Logistics. Logistics
never evaluates GIP. After the seal, any authoritative GIP write anywhere (GIP owner head: fact count + sum of versions, an incremental
monotone signature) or any protected premise write (P-1..P-4 heads) makes the clauses `unresolved` — permanently disabling THIS profile
only, with no unrelated-play stall. The WS-007 Instrument's legacy scalar `operative_effect` is untouched (the seven clauses are separate
facts, each carrying its own effect class).

## 3. One derivation, three judges

Each owner act is a pure derivation `derive*(source, …) → Planned` over committed state. The authored adapter operation builds its commit
group from it; IM-11 admission re-derives the same group on a **raw `store.commit`**; and replay (`verifyHistorical`) re-derives every historical
first-profile group against its true incremental pre-state. A caller therefore cannot select success: a swapped digest, an invented adequacy, a
caller-chosen withdrawal or an under-sized Transfer Record is refused by the owner's own rule on live commit and again on reopen. Facts
carry a `cut_basis_revision`, and every request-bound guard is part of the group (`reads` at an exact version; version 0 is owner-proven
absence), so a stale decision loses to a concurrent winner by ordinary version CAS.

| Concern                            | Mechanism                                                                                                                                                       | Evidence                                         |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Live/raw commit judged identically | `freightGroupCheck` route in `owners/admission.ts` (one route, five owner checks)                                                                               | `freight-foundation-refusals`, `freight-service` |
| Historical re-derivation on replay | `verifyHistorical` includes the freight check; `historyVerificationId` suffix `FREIGHT_HISTORY_POLICY_SUFFIX` forces one strict replay before checkpoint reuse  | `freight-replay-integrity`                       |
| Lost ACK / re-presentation         | RC-16 reconcile-by-identity: the same act returns the ORIGINAL receipt; changed content is `INTENT_CONFLICT`; order-insensitive act identity (`canonicalEqual`) | `freight-recovery`                               |
| Dispatch/enrolment fence           | `freightDispatchPendingViolation`, applied in the coordinator pre-check AND kernel admission                                                                    | `freight-service`                                |
| Cross-fact load verifier           | `verifyFreightIntegrity` (`FREIGHT_STATE`), wired into canonical open                                                                                           | `freight-integrity`                              |

## 4. Source-to-schema map

Clause → typed term schema (`packages/contracts/src/freight-profile.ts`) → where it is enforced.

| Source item                                                                            | Schema / kind                                                                                                              | Enforced by                                                                                              |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| §1 Opening Source Attestation, §1.1 slices                                             | `AttestOpeningInput`, `world_opening_attestation`, `OPENING_SLICE_KINDS`                                                   | `freight/world.ts` `attestOpening`; refuses player-authored, second, late, player-bearing                |
| §1 Opening Constitutive Basis + §1.2 Closed Governing Coverage                         | `OpeningBasisSchema`, `gip_opening_basis`                                                                                  | `freight/gip.ts` `establishOpeningBasis` (every coverage item once, evidenced or expressly inapplicable) |
| §2 C-01 Distribution competence                                                        | `TermsC01`, `gip_instrument_clause`                                                                                        | clause facts; sealed                                                                                     |
| §2 C-02 Origin input control and whole-output retention                                | `TermsC02`                                                                                                                 | read by C-05, holding derivation                                                                         |
| §2 C-03 Destination receipt/use relation                                               | `TermsC03`                                                                                                                 | read by C-06, AD                                                                                         |
| §2 C-04 Direct dispatch permission (ceiling, unique directive-use, ONE first dispatch) | `TermsC04`                                                                                                                 | read by C-06; `ceiling` carried to L0/L1/E1                                                              |
| §2 C-05 Standing origin-production direction                                           | `TermsC05`, `EconomyOriginAllocationSchema`                                                                                | `freight/economy-derive.ts` `deriveOriginSelfProvision`                                                  |
| §2 C-06 Standing shipment-allocation direction                                         | `TermsC06`, `EconomyFreightRequestSchema`, `EconomyFreightAllocationSchema`, `EconomyFreightSlotSchema`                    | `deriveFreightFixation`                                                                                  |
| §2 C-07 Standing unused-request withdrawal direction                                   | `TermsC07`, `EconomyFreightWithdrawalSchema` (W2, W3 only), `EconomyFreightCloseSchema`                                    | `deriveWithdrawal`, `deriveClose`                                                                        |
| §1.1/§3.1 Legal Readiness Seal                                                         | `LegalReadinessSealSchema`, `ProtectedHeadPinSchema`, `GipOwnerHeadSchema`                                                 | `freight/gip.ts` `sealReadiness`; `freight/gip-owner-head.ts`                                            |
| §3.1 derived applicability                                                             | `EconomyStatusWitnessSchema` (L0/L1 separately re-derived)                                                                 | `GipFreightAdapter.applicability`, Economy status derivation                                             |
| §1 Production material premise                                                         | `ProductionMaterialSpecificationSchema`, `ProductionInputLotSchema`                                                        | `freight/production.ts`; `originOperationViolation` guard in `production/admission.ts`                   |
| EL-01F F2                                                                              | `LogisticsUnusedReleaseSchema` (immutable event) + commitment `RELEASED_UNUSED`                                            | `releaseUnusedService`                                                                                   |
| EL-01F F3                                                                              | `LogisticsFreightTransferSchema` + `EconomyFreightUseConsumptionSchema` (owner key + version 1 + content digest + receipt) | `dispatchFirst`, `consumeFirstDispatch`                                                                  |
| EL-01F F4                                                                              | **not stored**: request-specific absence fenced by the close group's zero-version reads                                    | `deriveClose`                                                                                            |
| EL-02S status                                                                          | `EconomyStatusWitnessSchema` on L0 (S0) and L1 (S1)                                                                        | independently re-derived per act                                                                         |
| §4 step 6 service                                                                      | `ServicePremiseSchema`, `LogisticsServiceBasisSchema`, `LogisticsServiceSlotSchema`                                        | `admitServiceBasis` (needs corridor of exact ordered endpoints)                                          |
| §4 step 8 fence                                                                        | `LogisticsFreightDispatchEnrollmentSchema`                                                                                 | `freight/dispatch-fence.ts`                                                                              |
| R3-T2 §4 `LD → WT → LR → ER`                                                           | `EconomyFreightReceiptSchema`, `economyFreightReceiptStage` (fourth stage of the one logistics object)                     | `economyFreightReceiptProvider`                                                                          |
| §4 step 10 AD                                                                          | `EconomyDestinationAdequacySchema`                                                                                         | `recordDestinationAdequacy`                                                                              |

## 5. What is NOT built (source-unresolved or unqualified) — and why

- **Positive definitive F1 terminal refusal — WITHHELD** (R3-T23 B1-C, CT-1). No Logistics refusal kind, key, state or receipt exists, and
  no code constructs one. A temporary shortage, an unknown or provisional response, or a negative S0/S1 status is **not** F1; it is a
  non-commit at the act level (`NOT_ADMISSIBLE` / `WITHHELD` with `f1: false`), and the request stays pending. Withdrawal trigger **W1** (which
  depends on F1) is therefore not representable.
- **W4** — C-07 names a service-by boundary, but the first profile has no source-qualified one; W4 is not representable. The Instrument's
  C-07 clause _terms_ list all four source triggers; only W2 and W3 execute.
- No retcon, override or NPC initiative; no fabricated player choice; no new disclosure or privileged-read path. GM, NPC and NPK knowledge
  stay distinct (PO-6).
- No title, consent, facility inventory, repair, crew or carrier agency; no ordinary travel or route model. The delivery boundary is an
  authored instant of the service premise, never a Logistics default.
- No F-028 / First-Full Playable expansion; no gate promotion.

## 6. Predecessor changes (scoped deltas, for BLUE review)

`tests/support/freight-scoped-deltas.ts` pins each file at its slice-head bytes. Summary of the _meaning_ of each change:

| File                                                                        | Change                                                                                                                                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/src/logistics.ts`                                                | optional `freight` on commitment/transfer; `RELEASED_UNUSED` state                                                                                                   |
| `engine/src/owners/registry.ts`                                             | 26 kinds + five owner rules; additive `alternateRules` so a freight kind may cite the freight rule beside its owner's own                                            |
| `engine/src/owners/admission.ts`                                            | one freight route; historical re-derivation; derived views; history-policy suffix                                                                                    |
| `engine/src/production/admission.ts`                                        | origin-operation guard                                                                                                                                               |
| `engine/src/economy/integrity.ts`                                           | an origin allocation owns its Production Request                                                                                                                     |
| `engine/src/logistics/{admission,declaration,derive,integrity,provider}.ts` | freight-aware commitment/transfer checks; fourth (ER) stage declaration                                                                                              |
| `engine/src/temporal/{coordinator,admission}.ts`                            | dispatch/enrolment fence; RC-16 reconcile of `registerObject` (a kernel defect found by the durable-cut matrix: a lost-ack re-presentation was an `INTENT_CONFLICT`) |
| `engine/src/persistence/*`                                                  | optional `canonicalState()` so owner code reuses the admission's incremental GIP head                                                                                |
| `engine/src/initial-setup/sunset-{policy,guard}.ts`                         | 26 explicit `UNREVIEWED_BLOCK` rows (119 total, original 93 unchanged)                                                                                               |
| `engine/src/world/{canonical-campaign,integrity}.ts`                        | `verifyFreightIntegrity` in the canonical verifier; `FREIGHT_STATE` code                                                                                             |

Older conformance suites dropped their byte-identity pins on these files (each with a comment), exactly as the M-S slice did, and the
independent surface oracle (`tests/support/expected-surface.ts`) acknowledges the 26 kinds, three facets and five adapters.

## 7. Acceptance PO-1 … PO-7

See `tests/integration/freight-*.test.ts` (titles name their PO) and `tests/conformance/freight-profile-conformance.test.ts`.

| PO   | Subject                                                                                     | Principal evidence                                                                    |
| ---- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| PO-1 | Resolution triggers; no manual "fix allocation"                                             | `freight-foundation`, `freight-foundation-refusals`, `freight-service` (tamper cases) |
| PO-2 | Typed lowering; clause IDs as authority refs; unique lot/output and tie cases               | `freight-foundation-refusals` (the refusal matrix)                                    |
| PO-3 | Mutation/head coverage P-1..P-4; replay/integrity/load paths                                | `freight-withdrawal`, `freight-replay-integrity`, `freight-integrity`                 |
| PO-4 | Package F exit: Economy-only cancellation, one cut, slots released once, no Logistics write | `freight-withdrawal`                                                                  |
| PO-5 | I: withdrawal, service and time fences; recovery                                            | `freight-service`, `freight-recovery` (durable-cut matrices)                          |
| PO-6 | Scope and evidence: NULL-PC original world only; mechanism labelled                         | `freight-opening`, `freight-replay-integrity`                                         |
| PO-7 | Independent witnesses: two real worlds; negatives; races; replay                            | `freight-delivery`, `freight-service`, `freight-withdrawal`                           |

## 8. Evidence limits

All of it is **scripted mechanism evidence** over the production owner code and commit path. **UNRUN:** genuine host, named client,
retained-storage restart, paid host, and any model-played GM session. The benchmark (§10) makes no throughput or capacity claim.

## 9. Open for independent BLUE review

Technical lowerings that were not frozen source literals and that BLUE should review before they are treated as settled: the 26 kind labels
and key shapes; the seal's field set and the GIP owner-head signature; the `RELEASED_UNUSED` commitment state; the dispatch-enrolment
receipt as the Temporal safe gate; the `FREIGHT_HISTORY_POLICY_SUFFIX`; and the kernel RC-16 reconcile in `registerObject`.

## 10. Cost

`tools/freight-benchmark.ts` runs the WHOLE operation on campaigns that differ only in how much unrelated dormant history they carry
(`FREIGHT_BENCH_SIZES`, default 0/100/500/2000 unrelated loci; 5 fresh-process samples each, both worlds). Results are in
`docs/evidence/roadbed-freight/` (raw samples + `summary.json`).

### Results (commit `dc46e9e`, Node v22.23.4, linux-x64, 5 fresh-process samples per cell)

Deterministic counters are **exactly equal in every cell** (`equal_causal_work_across_dormant_sizes`: quarry `true`, textile `true`): the
operation performs 25 acts / 36 canonical commits / 72 canonical writes / 247 exact-key owner reads / 14 derivations and **zero** full GIP-head
scans (7 incremental head advances) whatever unrelated history the campaign carries, and the campaign verifies with 0 violations after the
operation and after a cold reopen. Freight therefore adds **no history-proportional work of its own**.

| World   | Dormant loci | Commits | Owner reads | Derivations | GIP-head scans / advances | Operation elapsed ms (min–max) | Freight commit: mean ms / hashed | Unrelated commit at same depth: mean ms / hashed | Cold reopen med ms | Facts visited at open (GIP head, once) |
| ------- | ------------ | ------- | ----------- | ----------- | ------------------------- | ------------------------------ | -------------------------------- | ------------------------------------------------ | ------------------ | -------------------------------------- |
| quarry  | 0            | 36      | 247         | 14          | 0 / 7                     | 341–426 (med 365)              | 7.1 / 0.12 MB                    | —                                                | 93                 | 0                                      |
| quarry  | 100          | 36      | 247         | 14          | 0 / 7                     | 367–524 (med 428)              | 9.0 / 0.27 MB                    | 4.6 / 0.12 MB                                    | 167                | 146                                    |
| quarry  | 500          | 36      | 247         | 14          | 0 / 7                     | 650–782 (med 701)              | 16.7 / 0.78 MB                   | 10.6 / 0.61 MB                                   | 434                | 512                                    |
| quarry  | 2000         | 36      | 247         | 14          | 0 / 7                     | 1572–1970 (med 1718)           | 44.4 / 2.57 MB                   | 41.8 / 2.45 MB                                   | 1504               | 1920                                   |
| textile | 0            | 36      | 247         | 14          | 0 / 7                     | 315–344 (med 329)              | 6.4 / 0.12 MB                    | —                                                | 78                 | 0                                      |
| textile | 100          | 36      | 247         | 14          | 0 / 7                     | 380–427 (med 390)              | 8.3 / 0.27 MB                    | 4.2 / 0.12 MB                                    | 164                | 146                                    |
| textile | 500          | 36      | 247         | 14          | 0 / 7                     | 662–700 (med 678)              | 15.9 / 0.78 MB                   | 10.9 / 0.61 MB                                   | 423                | 512                                    |
| textile | 2000         | 36      | 247         | 14          | 0 / 7                     | 1542–1751 (med 1675)           | 43.5 / 2.57 MB                   | 37.1 / 2.45 MB                                   | 1509               | 1920                                   |

**Plainly stated limitation.** Whole-operation _elapsed_ time is **not** independent of dormant history in this build: it grows from ~0.35 s
(no dormant history) to ~1.7 s (2000 unrelated facts). The same growth is present in an _unrelated, non-freight_ commit on the same history
(last column pair: ≈ 42 ms and ≈ 2.45 MB hashed per commit at 2000 facts versus ≈ 44 ms and ≈ 2.57 MB for a freight commit), i.e. it is the
canonical commit path's per-commit state hashing, which is inherited and is outside this slice. A freight commit costs about 5 % more hashed
bytes than an unrelated one at the same depth. Cold reopen time grows with history (strict replay) and visits each fact once to build the
incremental GIP head; neither is a routine per-act scan. **No throughput, capacity or latency claim is made**; the samples are what one machine
measured, and the commit-path scaling is recorded here as a finding for BLUE rather than repaired (it is predecessor behaviour, not source
law of this profile).

Reproduce: `node --experimental-strip-types tools/freight-benchmark.ts matrix <outDir>` (`FREIGHT_BENCH_SIZES`, `FREIGHT_BENCH_REPS`,
`FREIGHT_BENCH_WORLDS`). Raw samples: `docs/evidence/roadbed-freight/benchmark/raw/*.json`; summary: `…/summary.json`.

## 11. Evidence custody: SCC source fixture

The R3 SCC source fixture v0.3.2 was retrieved from `immortalis-ob027-runner` @ `a76ff62…`, its SHA-256 verified
(`8f3f80f4…`), and reproduced under Node v22.22.2 with no deviation against both the recorded base and this slice's `graph.ts`
(byte-identical): `docs/evidence/roadbed-freight/scc/RESULT.md`, `tools/freight-scc-reproduce.sh`.
