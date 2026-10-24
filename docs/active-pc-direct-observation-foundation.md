# Active-PC Direct Physical Observation Foundation

> **PR #67 TARGETED RECOVERY — INDEPENDENT BLUE DELTA REVIEW REQUIRED.** The reviewed HEAD `9617a98577ffd9f52f45a729a6a60ce71b861184` remains under [BLUE HOLD](https://app.notion.com/p/3fa20af901e081df80bfeec129e859df). This recovery implements the source-covered H-1 event-trigger route (`e453352`), carries the corrected H-2 witness (`d07c53d`: an affirmative open-path fact in the positive, and only that fact replaced in the negative), and retains a **full six-scenario real-host rerun against the final implementation** with a read-only audit of each saved campaign (see _Final-head live-host run_ below). It claims no semantic or PASS acceptance. The original brief and research pins below record construction provenance; their corrected HOLD notices govern current clearance.

> **OOC DEVELOPMENT / SCENARIO INSTRUMENTATION.** Mechanism for the BLUE v5.2 Implementation Brief — Active-PC Direct Physical Observation (verified native pin `2026-10-15T02:24:15.992Z`, <https://app.notion.com/p/3fa20af901e081578dc7ff7b62c60873>) on `main` `0c3b0967a19a11a25b5968fe90313edad2ff8ce2` (baseline CI run `38653740921`), resting on the BLUE Targeted Physical Observation Engineering Resolution (verified engineering pin `2026-10-15T02:16:11.867Z`, <https://app.notion.com/p/3fa20af901e08157ac91eb3295d02968>). It lets the **actual human at the console** choose that the active Player Character looks at its surroundings **now**, once, at the current canonical basis, and it earns a receipt, an Accessible Content Packet and a delivery **only** from a real F-014D direct-perception evaluation by the AI referee host. It is not a general optics engine, sight score, NPC perception, cognition, speech, pose engine, time or action mechanic, scene scan or UI-triggered observation.

## What is and is not claimed

|                                                                  |                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Proven by the automated suite** (scripted host, plumbing only) | The mechanism: producer binding, causal order, no time, no extra writes, refusals, replay, recovery, load verification, delivery.                                                                                                                                                                                                 |
| **Not proven by the automated suite**                            | That any AI reads any sentence correctly. A scripted answer is a policy the test wrote; it satisfies **no** semantic acceptance.                                                                                                                                                                                                  |
| **Semantic positive and negative**                               | Only the **real-host exercise** under [`evidence/b52-direct-observation-live-host.md`](evidence/b52-direct-observation-live-host.md) can establish them, and it is finite, single-model, single-author and un-reviewed by a person. **No PASS acceptance is claimed here.** Independent BLUE review is required before any merge. |
| Gates and registers                                              | No spec-lock pin, acceptance-register row, status or open gate moved. OB-030 / F-028 stay Blocked; PF-6 is not activated.                                                                                                                                                                                                         |

## Why it exists

`establish-character-locus` gives the original PC a **stationary physical position**, and says so: it grants no perception. F-014D §6 (Direct Perception Adapter) says what perception needs — _read authoritative world state at the lawful observation basis; apply actual sensory position/range/obstruction/channel; form only the perceptible payload_ — and a shared locus identity decides none of it. The existing Epistemic adapter takes an **authored** access event, which proves nothing about position, obstruction or payload. This slice is the missing producer: a real evaluation, bound to the committed premises, whose engine-derived verdict alone can earn the receipt.

## Authority (what each source supplies; nothing is invented)

| Source (spec-lock pin unless stated)                                                                        | Supplies                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **F-014D** `2026-09-24T16:25:17.059Z` — §§2, 2.1, 3, 4.2, 5 steps 2–4, 6, 14, 18, 21.1, 24                  | Epistemics owns the causal route, actual payload, receipt and sensory availability; world truth is not its. Direct Perception: apply actual position/range/obstruction/channel and form only the perceptible payload. The packet excludes Sealed Engine Provenance. Access is not comprehension. |
| **I-002** `2026-09-25T00:15:54.536Z` — §§2, 4.3                                                             | Intrinsic embodiment and capability are the character's own statements; position and world-locus differences are not I-002 state; no sensory ability is invented from a label.                                                                                                                   |
| **IR** `2026-09-25T00:17:26.287Z` — §§5, 7, 12                                                              | The player's explicit, separately confirmed native-presence statement is the placement fact (precedence 1); no silent invention of material insertion facts.                                                                                                                                     |
| **WG** `2026-09-25T13:44:22.668Z` — Ownership Guards                                                        | World-State establishes physical setting facts and exposure conditions, not a recipient's knowledge, PC intrinsic capability or actor response.                                                                                                                                                  |
| **I-001** `2026-09-25T00:17:49.551Z`, **NPK**                                                               | Eligibility precedes projection; present awareness is the current arrival; display or refresh cannot manufacture access or advance time.                                                                                                                                                         |
| **F-014B Temporal** `2026-09-25T23:42:29.547Z` — §§6, 13, 15, 17                                            | Committed-before-consumed order; stage identity; the material boundary lifecycle (see _H-1 recovery_ below; no boundary exception remains).                                                                                                                                                      |
| **Canonical Role Registry v1** `2026-09-25T08:21:22.816Z`                                                   | `role.gm` + `permission.rule.adjudicate` interprets; `role.resolver` + `permission.resolution.execute` validates; `role.archivist` + `permission.canon.write` commits. Persona, provider, model or tool identity grants none.                                                                    |
| **BLUE v5.2 brief / engineering resolution** (construction sources, **not** lock pins, **not** game design) | The objective, the route and the acceptance boundary. Registered as `OBSERVATION_BRIEF_SOURCE` / `OBSERVATION_RESOLUTION_SOURCE`.                                                                                                                                                                |

## What exists

| Piece                         | Where                                                                                   | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fourth referee operation**  | `contracts/src/referee.ts`, `engine/src/referee/*`                                      | `F014D_DIRECT_PERCEPTION`: a closed-vocabulary, quote-anchored answer — `faculty`, `position`, `path` (each established, open/blocked or not established, each by quoted premises), an optional raw `payload`, a full assessment of every delivered fact — and four **derived** verdicts (`OBSERVATION_ESTABLISHED`, `_OBSTRUCTED`, `_UNRESOLVED`, `_WORLD_CONFLICT`). The context is built **only from committed facts** at the **current canonical basis**. |
| **Producer-bound event**      | `engine/src/epistemic/observation.ts`, `EpistemicAccessAdapter.establishObservedAccess` | The same immutable `BOUNDED_SHARED_ACCESS` event (one named recipient, `PERCEPTION`, the foreign physical source pin, the payload) — contract unchanged — with **every field derived** from the retained decision. It reads the decision and every premise it cites. Committed under its own governing citation `EPISTEMIC_ACCESS_OBSERVATION_RULE`.                                                                                                          |
| **Event-triggered formation** | `engine/src/epistemic/declaration.ts` (`observationTriggerViolation`)                   | A committed observation event triggers exactly its existing packet-formation stage, with no Temporal object or indexed boundary. No consequence, no downstream actor or world result, no recurrence, no elapsed time. The no-Epistemic-object registration rule is retained.                                                                                                                                                                                  |
| **Formation**                 | `engine/src/epistemic/direct-observation.ts` (`formObservedPacket`)                     | Event → durable transaction authority → ONE resolution transaction whose target is the canonical time itself → the existing `epistemicPacketProvider` forms the packet and the sealed provenance under the transaction's durable authority. Idempotent at every step by identity.                                                                                                                                                                             |
| **`observe-surroundings`**    | `operator/src/observation.ts`, `cli.ts`                                                 | The operator's **fourth, separate choice** (`--player-character` only). Confirmation first, then the host is asked; the player is shown the raw appearance through the **existing trusted causal Event-Signal delivery**, and nothing else.                                                                                                                                                                                                                   |
| **Exchange and MCP**          | `operator/src/referee-exchange.ts`, `referee-mcp.ts`, `referee-session.ts`              | The same three tools, the same authentication-before-disclosure; the operation is bound per host (`referee-bind-host` now binds four).                                                                                                                                                                                                                                                                                                                        |

## The sequence

1. **Prerequisites (other commands, other owners):** `establish-locality` (the world and the locus, whose prose carries the physical scene); `author-character` (the character's own statements and the confirmed placement statement); `establish-character-locus` (the ORIGINAL physical custody); and the Temporal owner's canonical time. Without any of them the command is `OBSERVATION_NOT_AVAILABLE` (or `CHARACTER_*`) and writes nothing.
2. **Confirmation, before anything is asked.** The player is told the command is their choice that the character looks **now**, at the stated basis, that it advances no time and that they will see only the raw appearance received, never the setting, the reasoning or why nothing was received. A declined confirmation asks the host nothing and writes nothing.
3. **The question** (nothing written): built from the character's own statements, the preserved placement statement, the world and the locus (premise, reference/causal basis, law departures, constraints, designation) and the custody — at the versions delivered and at the canonical basis. It contains no scene label, target, expected result or test name. The host is authenticated for **this operation** before any of it is disclosed.
4. **The reading.** The engine validates the answer against the delivered words (below) and **derives** the verdict. The reading is retained create-only as sealed `referee_provenance` evidence **whatever it derives** — an obstructed or unresolved reading is audit evidence, not a fact about the world, and not a "did not perceive" assertion. A reading already retained for the question is never asked again, rerolled or overwritten.
5. **The receipt** (only `OBSERVATION_ESTABLISHED`): the Epistemic owner's observation-earned event, then durable transaction authority, the packet + sealed provenance (one group, two access classes), and the sealed transaction, in that order.
6. **Fresh reopen, then delivery.** The package is reopened through the ordinary owner-verified open, the Epistemic and canonical verifiers must be clean, and the raw appearance is delivered by `deliverCausalEventSignalPresentation` for the one event just earned. Display retries are read-only; a new observation is a new basis and a new choice.

## The validation rule (one statement, used by the host-facing check, admission and load verification)

`deriveObservation` requires: every premise cited exists in the delivered context and is quoted verbatim; **kinds of premise are fixed** — the faculty rests only on the character's own statements (`PC_STATEMENT`), the character's own exact viewing circumstances only on the confirmed placement statement (`PLACEMENT_STATEMENT`, at least one) read with world facts, the path and the appearance only on committed world facts; an established or open/blocked element has at least one quoted premise; every delivered fact is assessed exactly once (`SUPPORTS`/`CONTRADICTS` quoted); an appearance exists only when faculty, position and path are all affirmatively established and nothing is contradicted or unclear; it names a delivered source fact, is anchored to a quotation of that very fact, and carries no fact identifier, key, world, locus or character identity.

The verdict is **derived**, never read: a contradicted world fact → `OBSERVATION_WORLD_CONFLICT`; a blocked path from an **established** viewing position → `OBSERVATION_OBSTRUCTED`; anything else not fully and affirmatively answered (a missing faculty, unestablished circumstances, an unestablished path, an unclear fact, no appearance) → `OBSERVATION_UNRESOLVED`; only the remainder is `OBSERVATION_ESTABLISHED`. **A missing faculty or insufficient premises is UNRESOLVED and is never proof of obstruction.** No distance threshold, detection probability, acuity grade, attention score or fallback sense exists anywhere.

`observationEventViolation` (admission **and** load) requires an observation-earned event to be exactly `deriveObservationEvent(record)`; to be committed under the identities and basis its event derives; to read the decision first and exactly the premises it cites, at the cited versions, depending on exactly their groups; to re-derive its whole decision from the current committed facts; and, at admission, to be earned at the **current** canonical basis. A changed basis is a different question with a different identity.

## H-1 recovery: causal trigger without an indexed boundary

The reviewed current-basis boundary exception is removed from the schema,
registration admission and load verifier. F-014B §6's `(T0,T1]` boundary interval
remains unchanged for every owner. The observation route registers no Temporal
object or boundary and records no boundary crossing.

The source-covered engineering route is **F-017 §§3–4**, at its ratified v0.3
lineage (exact ratification `2026-09-25T15:03:49.887Z`; subsequently composed
PCB-01 wording is unchanged by this repair), together with **F-014D §§2.1, 3–6,
18, 21** and **F-027 RC-04/05/07/10/16**. F-017 begins a resolution transaction
from its causal trigger, imports materially engaged owner stages and commits only
after predecessors exist. It does not require every owner stage to invent a timed
boundary. RC-10 explicitly requires an earned boundary only _if any_.

After the Epistemic owner has committed the real observation event, that event
triggers its existing packet-provider stage. It reads the immutable event NOW,
with no representational capability-close dependency in this raw-sensory route.
This singleton dependency graph has no feedback. The normal transaction authority
opens before the packet group; the packet and provenance commit together; the
sealed transaction follows. Its opening, target and actual stop are the same
canonical coordinate. `engaged` contains no TemporalObject and
`boundaries_crossed` is empty; the causal event and source pins remain in the
trigger and realized stage reads. This is current-state causal work, not an
exception to the indexed advance interval.

Admission and load verification bind the exact observation event, transaction
identity, cause, current basis and one packet stage. They reject authored events,
foreign triggers, changed time, conditions, and consequential-object substitution.
On a crash after packet commit, the already-open event authority permits recovery
of the same group; no pending boundary or fabricated world consequence is used.
There is no change to elapsed time, duration, Knowledge Time, interruption rules,
owner assignments, source locks or gates. Independent BLUE delta review remains
required; these engineering findings are not an acceptance declaration.

Source links: [F-017](https://app.notion.com/p/3e620af901e081109144ef14f52012a8),
[ratification closeout](https://app.notion.com/p/3e620af901e081c8abb2e714acc7884c),
[F-014B](https://app.notion.com/p/3e020af901e081fb88e9f691748db990),
[F-014D](https://app.notion.com/p/3e020af901e08103b81aec5f7119318e),
[F-027 translation](https://app.notion.com/p/3ea20af901e081b8b958f7f3f39cb96a).

## H-2 witness and its final-head rerun

At `d07c53dfe0ce8057847cef22013af13ea198058e` the scenario supplied the
affirmative open-path fact, swapped only that fact for the opaque screen, and
retained a configured-host run. That run preceded the H-1 packet orchestration, so
it is superseded by the final-head rerun below; the physical wording and `path`
aspect are unchanged, and the mechanism fixtures use the exact same wording.

In the final-head rerun the positive quotes the affirmative committed
`locus.constraint.5`, returns `OBSERVATION_ESTABLISHED`, and is delivered; the
negative quotes the screen at the same fact identifier, returns
`OBSERVATION_OBSTRUCTED`, and records no access event, packet or transaction.
Target, faculty, placement, geometry, illumination, air and canonical basis are
unchanged. The generic host prompt contains no scenario labels or expected result.
The host trace identifies `claude-sonnet-5-5` connected to the real
`immortalis-referee` MCP server. The retained set has six scenarios, 24 client
runs and 25 submissions: 24 accepted decisions, with one rejected and corrected
submission (a response-shape error in the no-stated-sight case).

**Final-head live-host run.** After the H-1 recovery, a full rerun of all six
scenarios with a real configured host (`claude-sonnet-5-5` through the real
`immortalis-referee` MCP server) was made against the final implementation (code
commit `50951b1`; the PR head adds only evidence and documents) and is retained
in [`evidence/b52-direct-observation-live-host.md`](evidence/b52-direct-observation-live-host.md),
including a read-only audit of each saved campaign: packet delivery in the
positive and non-delivery in every negative, the packet/provenance split,
replay writing nothing, zero integrity violations, and the Temporal invariants
(no object, no indexed boundary, an empty engaged set, no crossed boundary,
canonical time unchanged). It remains one run per scenario on one model family
with no human review of the readings and no live prompt-injection witness. No
semantic or PASS acceptance is claimed; the independent BLUE review decides
that.

## What a look rests on, and what a shorthand-authored character is delivered (24 October trial shape)

> **Mechanism evidence only.** The trial itself ran on a separate disposable campaign that is not read here. `tests/integration/observation-trial-shape.test.ts` rebuilds its _shape_ in a fresh campaign through the shipped paths with a scripted host (plumbing, not an AI) and pins what the question delivers. It claims no live witness.

The evaluator establishes each element only from a **different, already-committed source**, and keeps their owners separate:

| Element                                    | Rests only on                                                                             | Committed by                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **faculty** (a sense)                      | the character's own accepted statements (`PC_STATEMENT`)                                  | the player's `author-character` words, released by the PC owner (I-002)     |
| **position** (where, which way, eyes open) | the player's confirmed placement statement (`PLACEMENT_STATEMENT`), read with world facts | the sealed first-ACTIVATION binding statement; custody holds only the locus |
| **path** (open or blocked)                 | committed world / locus statements only (`WORLD_FACT`)                                    | the setting author's `establish-locality` document (world and locus prose)  |
| **appearance** (the raw payload)           | a delivered world fact, quoted verbatim, naming no key, identity or quantity              | the same author prose (or the one mechanical sentence `outcome.collection`) |

An ordinary-human statement can support ordinary intrinsic vision under I-002 §10's safely conventional inheritance, absent contrary accepted facts. The absence of sight keywords is not proof of absent faculty. It supplies no current facing, eye exposure, illumination, path or receipt. The trial-shaped test pins delivered words and one scripted policy's retained non-receipt; it is not a universal semantic ruling on the player's shorthand. The mechanical completion sentence is a quantity assertion and past event, not an independently described visual appearance.

**One constructive positive fixture.** The explicit sight, placement, light, clear-air, open-path and descriptive-surface statements in the tests show one sufficient setup through existing owners on a fresh campaign. They are not six mandatory sentences, a universal clear-air requirement or a lexical gate. The host must read actual causal premises, including source-lawful baseline inheritance, and clarify only consequential unresolved forks. The engine checks quotation and premise kind; a scripted policy alone cannot prove faithful interpretation.

**What cannot be done to a saved campaign.** The world profile, the locus, the existence contract and the activation binding are sealed and create-only; the R-5 clarification is scoped to the handling cycle and is not delivered to the observation question. No shipped command can add a premise of any needed kind to an existing campaign, and a question changed at the same canonical instant is a different question (its identity is the digest of the whole context), so it would be asked again rather than found. BLUE Q1–Q4 direct prospective setup on a separate campaign. No runtime sensory/world amendment producer is included; retained negatives and saved history are preserved. Recovery uses the original question, not a changed-context reroll.

**Consumer repair.** An outcome-citing receipt's six references now fit the fixed Glance schedule: thirteen gateway identity reads, including the original delivery's source condition, Production extraction and Reserve qualification, then the unchanged projection and presenter. A grounded positive cites independently authored physical appearance; the old outcome-anchored scripted fixture remains mechanism evidence only. No live campaign is rewritten and no new sensory or runtime geometry producer is supplied.

## Falsifying contrasts (each refuses with no receipt, packet or provenance)

The independent negative differs from the positive by **one physical sentence**: the positive's affirmative open-path statement ("Nothing solid stands between the bench and the north wall…") is replaced by a continuous opaque screen across the path with no alternate route; target, character, faculty, placement, light, geometry and clear air are unchanged, and the positive's open path rests on that affirmative statement, never on the absence of a stated obstruction. Others: a character whose own statements establish no sight; a placement that states neither a direction nor open eyes; closed eyes; a world that gives the alcove no light; a path the host cannot settle; a contradicted world law. A scripted answer exercises plumbing for each; the real-host exercise is separate. Raw-write bypass: an event without its decision, with a tampered payload, recipient, channel, basis, source or identity, with a spoofed role, citing an obstructed or unresolved reading, or at a changed basis — each refused and each leaves the campaign byte-identical.

## Interruption, retry and convergence

The earned event identity derives from character and canonical basis; the retained decision identity also includes the complete question/context. Recovery is pinned to the original question and cannot substitute a new context. Tests lose the reply of, and kill the process around, the retained reading, event, transaction authority, packet and sealed transaction commits; the same command resumes without re-asking, re-forming or re-confirming what it holds, and lands on exactly the campaign an uninterrupted run produces. A reading already retained at the basis (a negative included) is found, not asked again.

## Source-fidelity literal diff

| Literal                                                                                                   | Status                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `F014D_DIRECT_PERCEPTION`, `OBSERVATION_*` verdicts, premise kinds, element states, `placement.statement` | Technical encodings of F-014D §5 step 4 Q2 and §6 step 2 (sensory availability; position/range/obstruction/channel). The brief: "a new operation tag or retained computation representation is technical encoding, not a new fictional owner." |
| `faculty` only on `PC_STATEMENT`; `position` needs `PLACEMENT_STATEMENT`                                  | I-002 §4.3 (no sensory ability invented from a label; position is not I-002 state) and the brief ("missing state is not evidence of healthy senses or open eyes"; "neither normal anatomy nor the custody key alone substitutes").             |
| `OBSTRUCTED` needs an established blocked path **from an established position**                           | The brief ("missing faculty or insufficient premises is UNRESOLVED, not proof of obstruction").                                                                                                                                                |
| No numeric field, threshold, probability, grade, level or default anywhere                                | The brief and F-014D §2; pinned by the existing Epistemic "qualitative" conformance scan, which scans the new modules.                                                                                                                         |
| `EPISTEMIC_ACCESS_OBSERVATION_RULE`, `REFEREE_OBSERVATION_RULE`                                           | Governing citations: the first cites F-014D at its lock pin; the second the construction brief (not spec-locked, as the earlier referee citations).                                                                                            |
| `role.resolver` stamped on the record (`validated_under`)                                                 | The brief requires GM adjudication, resolver validation and archivist commit to be bound apart; the engine stamps it, never an answer.                                                                                                         |
| Observation identity = (character, canonical instant)                                                     | A technical encoding of "one-shot": it states no rule about how often a character may look, only that one basis has one observation.                                                                                                           |

## Residuals

- **Semantic correctness is the host's.** The engine checks that the answer is well-formed, complete, quote-anchored in the **kind** of premise that may establish each element, and coherent, and it derives the verdict; it cannot check that the host read a sentence _rightly_. A model could call an unobstructed path blocked; the retained reading, the player's own confirmation and the sealed audit evidence bound that risk and do not remove it. The appearance is free text bounded by the delivered words: that it is _raw_ (no material, name, function or meaning) is instructed and the engine refuses engine references, but whether a host stays raw is the host's.
- The scene (path, light, the character's pose) lives in committed prose: world/locus constraints and the player's confirmed placement statement. There is no sub-locus geometry owner, and none is invented; a scene whose premises do not state the circumstances yields `UNRESOLVED`, never a receipt.
- One model family, one session, finite exercises; no adversarial-player or prompt-injection witness against a live host; no person has reviewed the readings.
- The bounded delegated `initialize-time` command establishes an explicitly authored starting chronology once; it advances no time.

## Tests

`tests/unit/referee-observation-derive.test.ts` (validation and verdict derivation); `tests/contract/observation-schemas.test.ts` (closed vocabularies, strict shapes, unchanged event/packet/provenance contracts, strict-future boundaries for every owner); `tests/integration/observation-foundation.test.ts` (the production command end to end, the independent negative, the unsettled premises, bindings); `observation-enforcement.test.ts` (raw-write bypass, spoofed roles, staleness, duplicates, hand-written objects); `observation-recovery.test.ts` (lost replies, killed processes, load-time verification of every record); `tests/conformance/observation-conformance.test.ts` (scope, pins, evidence).
