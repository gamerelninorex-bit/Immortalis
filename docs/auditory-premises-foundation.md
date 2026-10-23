# S1-P1 — Source-owned raw auditory and acoustic premises (foundation)

**Status: mechanism only. No receipt.** This document records what the S1-P1 construction builds, the authority it rests on, and what it
deliberately does not do. It is not a claim that anyone heard anything: it supplies the **World-State physical source premises** that a
later, separate Health close and a later, separate F-014D individual-receipt slice would need. No Health clearance, individual hearing
receipt, access event, packet, observation, NPC decision or player state exists on this head.

## Authority

- World Generation & World-State Kernel (`3e120af901e081ec9de8fea870221a0d`), section "S1-P1 — BLUE executable lowering freeze: paired W1
  raw-hearing and W2 acoustic-source premises — 23 October 2026" with its "S1-P1 emitter-source executability clarification", native pin
  `2026-10-23T12:26:49.599Z`. This is the one executable authority; it is recorded as a single additive entry in the lock's
  `executable_lowerings` (`S1-P1-WG-LOWERING`).
- Epistemic F-014D (`3e020af901e08103b81aec5f7119318e`), "S1-P1 Upstream Auditory Premises Consumer Boundary", native pin
  `2026-10-23T12:28:14.041Z`: a physical-input boundary only, which F-014D may later consume and never writes here.
- Health (`3e620af901e0817c8b1ac2caf852e3aa`, pin `2026-10-23T09:37:46.110Z`) and Temporal F-014B (`3e020af901e081fb88e9f691748db990`, pin
  `2026-10-23T09:37:46.817Z`), read as the **unbuilt** Health close and the Temporal authority respectively.
- The 23 frozen F-027 pins, the existing R1 lineage rows and the R1 lowering are byte-unchanged. The R1 foundation (`a1a81cca…`, PR #84) is
  the base; this slice neither supplies nor reinterprets R1 setup authority.

## Two producers, one owner slice

| fact                                        | kind                                                        | lifecycle                             | key                                                           | what it states                                                                                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acoustic_profile_v1` (W2a, inside a locus) | optional field of `world_locus`                             | SEALED (create-only locus)            | `world/${world}/locus/${locus}`                               | typed, geometry-free, whole-locus acoustic eligibility **and** the concrete environmental emitter that could make one bounded impulse; authored only with the original locus, before the world's closure |
| `actor_raw_sensory_state` (W1)              | owner `world_state`, facet `world_fallback_physical_entity` | ADVANCING in kind, first version only | `world-state/actor/${actor}/raw-sensory/AIRBORNE_HEARING`     | the actor's owner-authored raw transduction (`PRESENT`/`ABSENT`/`UNKNOWN`) and immediate receptivity (`RECEPTIVE`/`NONRECEPTIVE`/`UNKNOWN`), anatomical/physical only                                    |
| `world_acoustic_emission` (W2b)             | owner `world_state`, facet `world_locus`                    | SEALED                                | `world/${world}/locus/${locus}/acoustic-emission/${emission}` | one genuine, instantaneous airborne-sound **event** at the committed Temporal time, with provenance distinct from the profile's own statements                                                           |

Both are one owner slice because they share one causal and replay boundary; either alone would be an inert stub. Neither is a Health
clearance, a capability score, a viewpoint or an epistemic event, and a Named-Actor capability basis or a coupling never implies either.

## The causal order and the one Temporal basis

typed profile (before the world's closure) → R1 B1 → closure → initial Temporal establishment → B2 → W1 → emission → pure derivation →
**future** Health Sensory Function Close → **future** F-014D individual receipt → **future** F-014A cognition.

B2, W1 and the emission are each established at the **same** committed Temporal canonical time, read from the committed Temporal state
before the fact. There is no carry across elapsed time, no backdating, no future read and no fabricated instant: a B2 that has gone stale
yields no W1, a W1 may not be established after the emission it would qualify, and an emission after elapsed time is a later event that
the earlier B2 and W1 can never qualify. No new public GM, referee or host "make actor hear" command exists.

The sequence guards the emission's own admission, not only the read. An emission is admitted only where an actual committed R1 B2 and a
World-State W1 of one non-PC actor already stand at this locus, both established at the emission's own event basis (the same Temporal
canonical time), and its group reads and depends on those exact versions like every other premise it relies on. The emission value is
unchanged: it names no listener and no new actor-emission binding exists. Write admission, historical replay and the load verifier all
apply that one rule, so a history that is lawful in every other respect but has no such chain (no B2, no W1, a W1 committed after the
event, or a B2 and W1 stale at an earlier basis) is neither admitted nor replayed nor loaded as canon. This is a physical-source premise,
not a perception.

## The pure read

`evaluateAuditoryPremises(reader, { actor_id, world_id, locus_id, emission_id })` reads the **actual committed exact pins** and writes
nothing. It is not a canonical fact, an access event, a receipt or a packet.

| answer                             | meaning                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SOURCE_PREMISES_READY_FOR_HEALTH` | every physical premise exists in the lawful order: a proposal to run Health later, never proof that hearing occurred                                                               |
| `REFUSED` (coded)                  | a conclusive negative: transduction absent, not receptive, no typed profile, an unqualified emitter, an emission at another locus, a non-actor                                     |
| `UNRESOLVED` (coded)               | a premise is missing (including a never-committed emission), unknown, stale, malformed, contradicted, or its Temporal or journal order conflicts; owner rules not demonstrably run |

A missing committed emission is `UNRESOLVED` (`EMISSION_NOT_COMMITTED`): a never-committed event is a missing physical premise, the
profile's possible impulse is not an event, and none is manufactured. A missing B2 or W1 is `UNRESOLVED` as well. `REFUSED` is kept for
a conclusive negative, such as an absent or nonreceptive faculty, no typed profile, an unqualified emitter or a channel failure.
Singleton `BOUNDED_SHARED_ACCESS` and `BROADCAST_EXPOSURE` are never an individual hearing verdict.

## Admission, replay and load

The same pure rules (`auditory-premises.ts`) serve write admission, the narrow historical hook (`WriteAdmission.verifyHistorical`, run on
the real incremental pre-state) and the load verifier (`verifyAuditoryPremisesIntegrity`). A load of a history that bears P1 facts
**fails closed** unless the owner rule demonstrably ran for each P1 group; old journals with no P1 fact replay exactly as before and a saved
locus with no profile is neither rewritten nor backfilled.

## Not built (remaining gates)

Health event-basis forced Sensory Function Close with affirmative relevant coverage (and the veto of the raw faculty); F-014D individual
access/retention, attention and exclusions; F-014A comprehension and response; any actor observation, receipt or packet; operator
commands; actor eyesight, line of sight or position; directional or path acoustics, neighbouring loci, duration and recurrence;
actor-initiated emission; NPC movement or a successor presence; saved-game backfill; PR #72 and PR #73 (held, untouched).
**H1 and the S1 sensory chain beyond this physical-source slice are unbuilt, not passed**, and First Playable is not reached by this slice.
