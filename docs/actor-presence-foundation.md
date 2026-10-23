# R1 Stage-One v1.1 — First Non-PC Actor Physical Presence (foundation)

**Status: mechanism only.** This document records what the R1 stage-one construction on PR #84 builds, the authority it rests on, and
what it deliberately does not do. It is not a claim that PR #84's H1 is cured: the actor-observation derivation still reads the actor's
coupling statement as its position premise, and no sensory faculty, Health close or acoustic coverage exists.

## Authority

- World Generation & World-State Kernel (`3e120af901e081ec9de8fea870221a0d`), the Sovereign-ratified R1 successor sections and the BLUE
  "R1 Stage-One v1.1 — executable lowering freeze and bounded construction authority" section, native pin `2026-10-23T09:27:39.157Z`.
- Temporal F-014B (`3e020af901e081fb88e9f691748db990`) and Epistemic F-014D (`3e020af901e08103b81aec5f7119318e`) R1 sections, recorded
  as **design lineage only**.
- The frozen World Generation pin and the other 22 frozen pins in `spec/f027/spec-lock.json` are byte-unchanged. The new sections are
  cited by the engine registry as lineage "NOT as a spec-lock pin", the precedent being the 8 October PC-locus contract.

## The three facts (World-State fallback custodian; owner `world_state`, facet `world_fallback_physical_entity`)

| kind                           | lifecycle                         | key                                          | what it states                                                                                                                                              |
| ------------------------------ | --------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actor_setup_placement` (B1)   | SEALED                            | `world-state/actor/${actor}/setup-placement` | an authored setup statement placing one already-existing non-PC actor at one locus. **Inert evidence**: no custody, no presence, no custodian               |
| `world_setup_closure`          | SEALED                            | `world/${world}/setup-closure`               | the once-per-world, key-sorted, complete inventory of that world's B1 records; empty is legal                                                               |
| `actor_physical_presence` (B2) | ADVANCING in kind, version 1 only | `world-state/actor/${actor}/presence`        | the actor's first current physical locus, derived from a closed B1 and the Temporal canonical time of the state before it; initial custody `NON_PC_INITIAL` |

Lawful order: committed world and locus → the actor's own pre-Temporal `named_actor_capability_basis` → **B1 → closure → initial
Temporal establishment → B2** → any later event. Every step is a separately committed fact. `world_actor_coupling` stays immutable
provenance: it must agree with B1 (in either commit order) and is never read as a position.

## Setup eligibility and historical verification

- B1 and the closure are admitted only while every already committed fact is one of `world_profile`, `world_locus`, `world_corridor`,
  `pc_existence_contract`, `pc_capability_basis`, `named_actor_capability_basis`, `world_actor_coupling`, B1, the closure, or a
  `referee_decision` whose validated operation is exactly `I002_CLASSIFY`. Every other kind or operation (Temporal, binding, Causal
  Draw, Epistemic, Logistics, any other referee operation, an unresolvable key) ends eligibility; randomized actor establishments are
  therefore outside stage one.
- Replay does not re-run write admission. `WriteAdmission.verifyHistorical` is a narrow, pure hook that `CampaignCore.replay` calls on
  the real incremental pre-state, and it acts only on groups that write one of the three kinds. The same pure rules serve admission
  and replay. A load of an R1-bearing history **fails closed** unless the owner rule demonstrably ran for each R1 group
  (`CampaignStore.ruleCheckedGroupIds`), and `owners/extension.ts` forwards the hook.
- The load verifier (`verifyActorPresenceIntegrity`) re-judges each fact against the facts as they stood before it, checks the
  pins, and applies the exact-identity exclusion whatever the commit order. The Temporal canonical time before B2 is a historical
  statement judged only by the hook.

## Exact-identity physical-custody exclusion

Identities are compared as literals; no alias is derived and no actor becomes a movable physical subject. A presence-bearing actor has
no fallback entity, entity transition, PC custody, Logistics subject or operative binding of the same identity. The existing
Existing-Actor → PC handover (and an original activation) of such an actor is refused **before the binding commits**. An already
prepared `pc_existence_contract`, including an `existing_actor_compilation`, is not a physical custodian: it stays permitted and may be
left unbindable. Nothing is erased or converted.

## Not built

W1 sensory, Health and W2 acoustic evidence; any change to `deriveActorObservation`; operator commands for B1, the closure or
Temporal establishment (B2 is therefore fixture-only in production until a Temporal establishment path exists); caller
authentication (OB-016/IA-28); NPC movement, successors, time carry, off-screen action or free-form AI placement; saved-game backfill.

## Open conflict reported to BLUE

The frozen section lists the PC physical-custody page (`3f320af901e08166ad96ca0fc5e5069d`, handover-exclusion overlay) among the design
lineage the lock should record. Five predecessor conformance assertions state that this page's id appears nowhere in the lock. They
guard the 8 October contract as "not a lock pin". Recording the overlay requires narrowing those assertions to look past the new lineage
block, which the builder did not do unilaterally. The lock therefore records the WG, Temporal and Epistemic lineage and the executable
lowering, and omits the PC-custody lineage entry pending a ruling.
