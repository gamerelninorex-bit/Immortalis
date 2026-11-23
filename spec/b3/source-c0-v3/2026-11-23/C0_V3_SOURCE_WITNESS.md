# B3 C0 — Immutable v3 Original-Owner Source Candidate and Static Witnesses

Date: 2026-11-23. Purpose: source-only construction continuation under Sovereign D-1…D-4; no implementation code, PR, merge, deployment or live source adoption.

Governing:
- Sovereign D1–D4 https://app.notion.com/p/42120af901e0811ca412e09374ae5c18
- Full B3 v2.0 https://app.notion.com/p/42120af901e081fdac32e51c3350e5ce
- RED CB1–CB9 one-pass https://app.notion.com/p/42120af901e0812d8667f78defa14e37
- Native audit predecessor https://app.notion.com/p/42120af901e081858426dd33ac52a7bb
- Original v2 source commit 0d95196c8a2ec75380591a0909b78c6ac6462697
- Inspected main 728104565662fece3e76be5b94c28f3c4201dbb7 (B2 PR #135 merged at this main).

## Byte-exact candidate source custody (GitHub readback, UTF-8)

| ID / file | Bytes | SHA-256 (independently recomputed with SHA256 implementation self-tested against SHA256('abc')) | Git blob SHA |
|---|---:|---|---|
| workshop-opening-quiet-v3.json | 139863 | fea060c36d85e3a198ba3e2025d54c2e771321581745a9dc9303e89a3ecfd13a | 9830abe7b9c29d1a83aafd38f1d0a7817fb5e5e1 |
| workshop-opening-glassbell-v3.json | 151516 | 46c1b53505a391292e898c4755a2bb7fb1c3b22e8af3c6db3f1fe4fa406ec293 | ef00ff2e27df7362231d54ead4549b2625f97a50 |

Source-only identities: Quiet 36 groups (4 STATIC_EXACT, 32 PRODUCER_ORIGINAL), 40 proposed group writes; Glassbell 39 groups (4 STATIC_EXACT, 35 PRODUCER_ORIGINAL), 43 proposed group writes.

## Changes made

- Added original Referee I002 decision before PC Existence. Removed early IR/Role Registry binding and PC custody from the MS pre-clock prefix; move them after the MS presence fence.
- Added actual native Initial Locality producer *requirements* for Input, SCOPE invocation, signed SCOPE response, INITIAL_DELEGATION Referee decision, Grant, SCENE invocation, signed SCENE response and MS-rule Locality Completion. These are **instructions requiring real future source inputs**, not signed records, not a claim of actual owner admission.
- Replaced the MS issue's false `pc_host` input binding with the authentic Initial Locality Completion + Input/Grant/SCOPE/SCENE requirements. Require native `MsSetupPublisher.issue`, `.response`, `.existence`, `.placement`, `.closure`, and `.presence` with an Ed25519-signed original response. Replaced hard-coded actor identity with original completion-derived `msActorId` source binding.
- Added `initializeCapturedChronology` paired Temporal genesis `temporal/state` plus `temporal/origin` after closure and before actor presence; no fake initial zero nor new generic time-unit.
- Corrected Referee canonical owner to `referee_adjudication_kernel` and original IR/physical adapter requests; Economy/Production strict input descriptors no longer carry the known extraneous fields. Population and Economy/Production native adapter names are recorded.
- Preserved one M-S attendant, one GIP opaque supervisor holder (not a second actor), two separately authorized prospective GIP Grant G kinds, Population→Economy→Production, glassbell Health order, original old kind preservation, and empty production allowlist.
- Published as **new v3 filenames**, not overwriting v1 or v2.

## Checks actually performed (source-structure only)

Each candidate was independently fetched back through official GitHub at exact immutable source commit 7c41a216886ac1a922e93215cfe5a6f92a. UTF-8 byte length and raw SHA-256 calculated independently; SHA-256 algorithm first checked against published SHA256('abc') known vector. An in-memory structural guard returned zero issues on both v3 candidates for: sequential unique aliases, legal dependency order and required MS prefix, one actor basis, only I002/INITIAL_DELEGATION Referee pre-MS, paired temporal genesis and presence ordering, canonical Referee owner, no known strict Economy/Production extra fields, parser V2, correct MS issue native method, both Grant G kinds, true Grant predecessor requirement, four static groups, unadopted status, no static Mara identity, and presence of producer negative contracts.

16/16 malformed *structural* mutants were refused for Quiet; 16/16 were refused for Glassbell (32/32 total). The mutants concerned duplicate alias, reordered MS prefix, missing Scope Input, missing signed Scene Response, duplicate actor existence, fake actor ID, premature IR, wrong Referee owner, polluted Economy/Production strict inputs, absent Temporal origin, unauthorized adoption, missing Scope Grant dependency, wrong parser, invalid group sequence, and replacement of authorized GIP charter by legacy Instrument.

These checks are NOT actual Zod `safeParse`, genuine signed player/GM/M-S input, original owner publication or receipts, strict prospective new-kind admission, full RED T103–T114, RED QV-1, A0, CI or engine integration. No positive qualification is claimed.

## Unresolved work to achieve QV-1

1. For every producer recipe, replace descriptive `PRODUCE_FROM_ORIGINAL_SOURCE_NOT_A_PREDECLARED_OUTPUT` bindings with a **complete, actually executable native input** under a real source-producing original session. The profile never predeclares unknown original signatures, hashes, actor ID, player decisions, GM response, or FactRefs. The current v3 contract is more exact but **not yet a type-checked positive**.
2. Create/obtain real ORIGINAL_MESSAGE_VERIFIED authored setup and v2 chronology capture with registered Ed25519 runner, exact SCOPE/SCENE signed envelopes, lawful Initial Delegation, MS actor one-leaf completion, exact provenance and original owner receipts. Reject missing or unauthenticated source. Owner tests must verify MS_PRE_CLOCK prefix, msPrefixViolation, msFenceFullCheck, and strict historical replay.
3. Validate actual PC/referee/RoleRegistry/World physical custody binding; verify the new GIP Grant G owner schemas and scope/readers, Health coverage/condition/closure, population demand, conserved Production and Temporal enrolment, D3(b) source contracts. Prospective kinds do NOT exist on inspected main and require separate legally authorized C1/C2 strict schema work. Existing RED CB-1.3 (new kinds' parser after C2) vs CB-1.6 (no engine code edits before A0) requires explicit source-conformant sequencing; this artifact does not silently waive either rule.
4. Independently reproduce all source group parser positives/negatives and real owner commits, source pin/permission/key version, end-to-end QV-1 original opening receipt and restart integrity. Only then deliver exact new clean Profile ID + SHA to Sovereign for separate AD-4(B). **AD-4(B) NOT ratified for v3 candidates.**
5. B2 is unchanged by this C0 work. Existing B2 #135 merger does not by itself prove the distinct IF-6b B3 in-X case. Do not reopen B2 gratuitously; recheck the actual merged IF-6b source before integrated acceptance.

## Control disposition

C0 authoring: **CONCRETE SOURCE-ONLY V3 CANDIDATES PUBLISHED AND STATIC CHECKS PASSED**.
C0 native QV-1 / A0: **NOT PASSED**.
Full-B3 C1–C7 engine edits: **NOT RELEASED**.
Exact Sovereign AD-4(B) adoption: **PENDING**.
Production allowlist: **EMPTY**.
Other Immortalis construction: **NO GENERAL HOLD**.
