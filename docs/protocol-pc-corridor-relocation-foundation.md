# Trusted Confirmed Active-PC Corridor-Qualified Relocation Gateway Foundation

> **MECHANISM ONLY.** One separately opt-in, strictly trusted, confirmed-PC **corridor-qualified relocation** entrypoint for the already-supported **post-handover, one-journey, single-leg** active-PC path, in a disposable post-handover case. It composes two installed paths — the confirmed post-handover PC relocation (`docs/protocol-pc-relocation-foundation.md`) and the World-State-owned source-qualified corridor read of Logistics (`docs/world-corridor-logistics-read-foundation.md`) — and adds a read-only source preflight in front of them. It is **not** ordinary original-PC travel, a second journey, general pathfinding, route or time calibration, actor- or capability-sensitive duration, source-covered access, normal-chat acceptance, an autonomous NPC act, deployment, a merge or a gate promotion.

Authority: the BLUE v5.2-A1 bounded implementation brief "Confirmed PC Corridor-Qualified Relocation" (native pin `2026-10-22T16:13:49.400Z`) on official `main` `3b06e6591303e72ee7523555dc08d13c4c9c7d5b` (merged PR #82), under F-027 v1.0 (`spec/f027/spec-lock.json`, blob `2df29edfd08b1fb986666c94153f9432cf227324`, unchanged), the frozen WG Working Operational Draft v1 (pin `2026-09-25T13:44:22.668Z`) "Geography / Traversal", "Edge / Corridor State" and "Ownership Guards", WS-010 Logistics (pin `2026-09-25T02:18:10.619Z`), F-014B (pin `2026-09-25T23:42:29.547Z`), I-002, F-016 ECT-01, F-017, the canonical Role Registry, and the Sovereign-ratified/frozen Active-PC Post-Handover Physical Locus Ownership & Relocation Contract (pin `2026-10-08T01:25:36.611Z`, §§4, 8–16: a composing overlay, **not** an F-027 spec-lock entry and **not** re-pinned here). **No source pin, Runtime Contract snapshot, open gate, acceptance row or status changed. F-028/OB-030 remains Blocked, PF-6 inactive, IA/V unpromoted.** Local success is not provider or recovery acceptance. PR #72 and PR #73 remain untouched and on hold; this slice is an independent change from `main`, depends on neither, on no Railway service, no API payment and no live client, and writes no existing campaign (`campaign-r5-phone`, `pc-namar-1` and every other save are untouched: every test builds a new, disposable, local package).

## The operation

```
bindTrustedConfirmedPcCorridorRelocationContext({ campaign, choice, corridor_key, delivery_at, publication })   // TRUSTED SIDE ONLY
commitConfirmedPcCorridorRelocation(context, { operation: "commit_confirmed_pc_corridor_relocation" })          // the untrusted host
```

It is the strictly opt-in **sibling** of `commitConfirmedPcRelocation`. The sibling is neither retrofitted nor restricted: its file, contract, operation name, group and intent identities and serialized outputs are untouched, and a context bound for one gateway is inert for the other, in both directions.

- **Trusted side.** After the player's separate confirmation of one exact destination choice has been obtained by that code's own means (authentication, sessions and the confirmation interaction are neither modelled nor claimed), the trusted side states, in a module-private registry behind an opaque frozen handle: the campaign, the exact `PcMovementCommitInput` (PC, established destination, and the `role.player` + `permission.player_choice.commit` authority it was confirmed under), the **exact World-State corridor key** the variant requires, the declared Logistics delivery boundary and the publication material. An incomplete or schema-invalid binding is an inert handle that is refused without a read.
- **Untrusted host.** The request is strictly operation-only. It cannot author a campaign, world, PC, destination, corridor, route, permission, delivery time, identity, result, confirmation or route selection.
- **Result.** The sibling's three minimum statuses, unchanged: `RELOCATION_COMMITTED`, `RELOCATION_UNAVAILABLE` (one refusal for every cause — a missing corridor is the same refusal as every other) and `RELOCATION_OUTCOME_UNKNOWN`.

## The source preflight (before any PC commitment or request)

The corridor key bound by the trusted side is **checked, never trusted**: it must equal the key the committed facts derive — the PC's stationary World-State custody origin and the confirmed destination, in that order, in that world. Before any PC-side commitment or request is written, a read-only, by-identity (no scan) preflight over committed state refuses, with no write:

- no committed post-handover custody for the PC, a destination in another world, or a destination equal to the origin;
- a corridor that is absent, reversed, for other endpoints or another world, malformed, or not World-State's own fact (it is judged by the same `corridorReadViolation` Logistics itself uses);
- a binding that names a different corridor than the facts derive (even a real, committed one);
- for a journey not yet begun: any rival Logistics commitment, transfer or World-State destination commit for the PC, and a declared delivery boundary that is not strictly after the canonical basis (or is in another unit).

The PC's one-time slot is therefore never consumed by a known-invalid route. A journey this gateway already began is judged by identity alone: its corridor is create-only, so the check is the same on every replay, and its declared boundary is no longer compared with a clock that has since advanced. The preflight decides nothing the owners decide: the PC-side admissions still re-judge the active PC, its binding, its custody and the destination (including the refusal of an **original-activation** PC), and Logistics' own source-qualified admission re-reads the corridor and exact-pins the version it read.

## The chain

The existing owner paths, in their ratified order, each under its own owner and unchanged in meaning, with identities derived from the canonical PC identity alone in this gateway's own namespace (`pc-corridor-relocation-{group,intent}:<step>:<pc>`):

1. the PC-owned commitment-of-record (`commitPcVoluntaryMovement`) — willingness only;
2. the PC-owned Movement Service Request (`establishPcMovementRequest`);
3. Logistics' **source-qualified** commitment (`commitCorridorMovement`) at the declared boundary: the commitment carries the `corridor: { owner: "world_state", fact_key, version }` pin of the exact corridor version read, and its group reads that corridor and the PC's origin locus and depends on the group that committed the corridor;
4. Logistics' dispatch — the atomic yield of World-State's stationary custody to Logistics as the sole in-transfer locus;
5. the one Temporal registration of that same transfer (the object the existing `logisticsTemporalObject` derives).

Arrival is **not** made here. It remains solely the existing Temporal due boundary → Logistics delivery → World-State ECT-01 destination commit → Logistics retirement chain, driven by a separately authorized advance. Nothing here advances time, resolves a stage or creates a presentation event.

**The corridor supplies no transit time, speed, right of access, feasibility, cost, cap, arrival or guarantee.** The one exact, externally justified `delivery_at` stays the trusted side's declaration; the corridor text cannot author Logistics success, the PC's desire or an expected arrival. Where other consequential inputs become engaged (service, compatibility, access, actor, environmental or physical), they stay unresolved until their own source owners establish them, and this slice defines none of them.

## The one engine change

`LogisticsAdapter.commitCorridorMovement` (PR #82) refused the active PC outright ("the source-qualified corridor path does not move the active PC") because original-PC travel had no admission of its own. The composition needs exactly that refusal **narrowed**, and only that: `deriveCommitment` (`packages/engine/src/logistics/derive.ts`) now lets the corridor path commit the active PC **only** when it is moved by its **own** PC-owned request — a rule the derivation already enforced for the route-less path (the active PC is moved only by its own PC-owned Movement Service Request, and a PC-owned request moves only its PC). Everything else about the corridor read is unchanged: the same single `corridorReadViolation`, from the PC's custody origin. Admission (IM-11) and load verification re-derive through the same function, so they follow. The route-less foundation derivation is untouched and byte-identical. The original-activation PC remains closed by the PC-side admission (voluntary movement is limited to the post-handover branch), the one-transition limitation fails closed, and no repeat journey, later PC trip or NPC travel is admitted.

## Recovery

Group and intent identities derive from the PC alone, so an ambiguous or lost reply is reconciled by presenting the same request again (RC-16): every committed step replays and the rest commit, never a second journey, debit, arrival or temporal object. Nothing is rolled back; a partial sequence is recoverable only through the existing validated current state. Once the transfer is committed nothing short of registration is a safe "absent": a registration that does not complete, and any step whose result is not known, is the indeterminate status — never a claimed refusal. A **changed** choice, corridor binding or declared boundary under the committed identities meets the committed record and is refused with no write: it never reuses success. A route-less commitment of the sibling is never retroactively upgraded to a source-qualified one, and the sibling cannot start a second journey after this one.

## Evidence

`tests/integration/protocol-pc-corridor-relocation.test.ts` (the positive causal witness over the real owners — corridor authored independently, gateway, due boundary, delivery, destination commit, retirement, save/close/reopen — and every falsifying negative below, each proving **no write and an unconsumed PC slot**, then recovery by identity: absent corridor with the corridor authored only after the refused attempt, reverse-only, wrong endpoints/world/owner/stale source, an unbound or substituted corridor, fake confirmation/role and host-supplied corridor, the original-activation PC, a wrong or unprepared PC, an occupied slot, a competing route-less locus, a second journey, missing or ill-ordered boundary, crash before and lost reply after each of the five steps and process crash/reopen, a changed boundary or choice after a partial or committed attempt), `tests/security/protocol-pc-corridor-relocation-security.test.ts`, `tests/conformance/protocol-pc-corridor-relocation-conformance.test.ts` and the updated `tests/unit/logistics-corridor-derive.test.ts`.

## Mechanical pin adjustments

Predecessor conformance tests pin the bytes of the source files this slice must touch, the protocol package's file listing and index exports. Their pins were adjusted openly, as earlier slices did; no behavior assertion was weakened or removed. The one test of a document sentence — that the corridor path "does not move the active PC" — records the narrowed rule above instead.

## Not claimed

Nothing here is deployment, a Railway dependency, API payment, a live client or a gate promotion. It is not original-activation PC travel (**an actual original-PC move**), a repeat or later journey, a calibrated duration, source-covered access or capability, general pathfinding, AI/client interpretation or normal-chat acceptance, or an independent NPC act. Confirmed player/host operation here is a scripted test proxy, not a live chat semantic witness. Local success is level-1 mechanism evidence only, and its merge is separately reserved to the Sovereign.
