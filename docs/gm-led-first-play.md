# GM-led natural first play

This page records what the 30 October 2026 bounded construction release adds to the supported chat loop, how to operate it, which parts are
evidenced only by mechanism tests, and what is **not** built. The authority is the BLUE brief _GM-led Natural First-Play Rebuild_ and the
Operating Charter's standing requirement _GM-led natural chat play_ (see `IMPLEMENTATION_CHARTER.md`). Nothing here is a full-game claim.

## What a player can now do in one request

| Request                   | Tool                                                | What the engine does                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "gather three"            | `gather` `{ amount, until: "start" \| "complete" }` | A **trusted coordinator** carries the original request through the owners' existing chain (commit, reach reading, Production admission, completion). It is not a world owner. It retains its own record before each dispatch, adopts an open attempt of the same quantity instead of duplicating it, returns control at a material boundary, and resumes the **same** goal after an interruption. |
| "where are we with that?" | `play_status`                                       | Owner-backed account of the current goal and the character's gathering (`NO_ATTEMPT`, `COMMITTED`, `NOT_ADMITTED`, `IN_FLIGHT`, `COMPLETED`, `STOPPED`, `HELD`). Read from the owners, never from the goal record alone. Shows no source or Reserve quantity.                                                                                                                                     |
| "look at the logs"        | `observe_surroundings` `{ attention? }`             | The player's own words (at most 240 characters) go to the Game Master as the request. No posture, direction, lighting or eye question is put to the player.                                                                                                                                                                                                                                       |

`start` stops at Production admission and passes no time. `complete` carries time only to **that act's own** earned completion. A `gather`
for another quantity while a different attempt is open returns `ANOTHER_ATTEMPT_OPEN`; it never replaces, widens or finishes that attempt.
The older primitive tools (`collect`, `continue_collection`, `finish_collection`, …) keep their meaning; `continue_collection` also performs the
first reach reading and admission.

`route_status` / readiness payloads carry `report_scope: "SETUP_READINESS_ONLY"`. They report setup readiness, not whether play has begun
(they replace a constant `campaign_started: false` that could be misread as a runtime probe). A terminal `opening` request receipt is marked
`historical` and no longer overrides the next step.

## The scene step of a look

A look is one request. When the deployment has a host bound to the `GM_SCENE_RESOLUTION` operation the engine asks it, before the perception
question:

1. **Output appearance** (once per credited delivery): the minimum raw physical appearance of the gathered output, resolved from the world's own
   constraints (WG Resolution Rules; F-016 fallback where no more specific custodian exists). It rests on the producing owner's committed result
   and carries no name, count, material class or source identifier. It is resolved **before** any observation of it and never from a
   perception outcome.
2. **Current viewing** (once per canonical basis and request): whether an _ordinary_ look is physically supported now — routine attention,
   turning and opening the eyes (I-001 §8). A request that carries a materially new commitment (climbing, walking, taking) is returned to the
   player as `OBSERVATION_NEEDS_CHOICE`; it is never ruled on. A supported ruling rests on the character's accepted words or the confirmed
   placement, never on the request alone.

The engine **derives** the verdict from the host's answer (verbatim anchoring to delivered text, the kind of premise each claim may rest on,
withheld values, a lexical number-word guard). Only `VIEWING_SUPPORTED` and `APPEARANCE_RESOLVED` are published, and only by the World-State
physical custodian, from one retained ruling named by task identity (`world_pc_current_viewing`, `world_output_appearance`; sparse, create-only,
sealed). Every other ruling stays sealed referee evidence. The direct-perception question then **consumes** the published facts, so a changed
input is a new task: an earlier negative decision stays byte-identical, a retained ruling is never asked again, and same-input retries cannot
reroll. Neither fact is an I-002 intrinsic branch, a Role Registry binding, a Production result or a receipt. The player sees only what the
earned Glance returns.

With **no** host bound to the scene operation nothing changes: the legacy question is asked unchanged and legacy campaigns, records and
negatives load and replay as before.

## Operating it

- The scene host is a separate, least-privilege host. Add `gm-scene` to `IMMORTALIS_REFEREE_HOST_IDS` (its operation layout is
  `GM_SCENE_RESOLUTION` only) and bind it as for the other hosts (`docs/ai-referee-host-foundation.md`). A deployment already registered with
  `gm-setup,gm-collection` keeps loading unchanged.
- The setting must **author** the physical statements a lawful look rests on (light, a clear path, how loose material looks). The Game Master
  rules on what the world states; it may not invent a missing world fact. A sparse world with none yields an unresolved perception, not a
  fabricated one.
- Recovery: an interrupted look is read back from the owners. Decisions are found under the task identities captured before the command ran
  **and** the same attempts rebuilt now (a look that ran the scene step asked its perception question under an identity that includes the facts
  the scene step published). A pending operation blocks every other action, so the rebuilt identities are those of the same basis.

## Independent consequence (bounded)

The only independent consequence demonstrated is the one an **already-lawful producer** already owns: a Governance Instrument with an exact
sunset, enrolled with the Temporal kernel, is expired by GIP's own stage when canonical time reaches the sunset
(`tests/integration/collection-independent-consequence.test.ts`, at the active-PC advance gateway the chat adapter's `collect-finish` drives).
What it shows, and what it does not:

- A gathering whose interval **contains** the sunset is **withheld** by the Production owner's own closure rule ("another process falls due
  within the work's interval: the interval is not covered by the closure alone"). Nothing is debited or credited, no time passes, and the
  independent event is neither skipped nor hidden — it is not suppressed to keep the happy path simple. The chat coordinator's `NOT_ADMITTED` return would apply; that path is exercised for over-demand in `chat-goal`, but this clash was **not** exercised through the chat tools.
- The event then resolves **at its instant** (never at the requested horizon) on a lawful advance that does not author it; only the lifecycle
  status changes; it happens once; a following gathering is exactly what the owners compute. No player-facing surface reports it.
- No cause, no consequence: a sunset beyond the work's end leaves the Instrument active with its boundary intact; a hand-written expiry (with or
  without the producer's stage identity) is refused.

This is **not** a generic event or NPC framework and not a non-PC actor's initiative. The producer's opening is seeded through its owner adapter
(a disposable test premise). It was **not** composed through the chat tools: the operator's governance opening is a pre-play command (refused
once a character is bound) that also sets canonical time with its own origin, and the chat route's starting-chronology step then refuses "another
origin" (see L9).

## Evidence labels

Every test added here is **MECHANISM ONLY**: a scripted assistant, scripted plumbing hosts (the "Game Master" and "referee" are scripts whose
rules the test wrote) and the real canonical owners. They show what the engine **enforces**. They do not show that any AI host reads a request as
a Game Master would.

| Evidence                                                                                                                                           | Status                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Mechanism tests (scripted hosts, real owners)                                                                                                      | present: `chat-goal`, `gm-scene`, `chat-scene`, `chat-independent-consequence`, `scene-resolution-security` |
| **GENUINE HOST** (an actual external AI Game Master / referee answering)                                                                           | **UNRUN**                                                                                                   |
| **NAMED CLIENT** (a supported chat client driving these tools as written)                                                                          | **UNRUN**                                                                                                   |
| **RETAINED STORAGE** (save, close, reopen on the deployment's disk; the current free Render storage is ephemeral and is not production durability) | **UNRUN** — reopen is exercised on a local temporary directory only                                         |

## Engineering Acceptance: whole-operation cost against the exact base

The same scratch measurement (not committed: it needs a base checkout) was run unchanged on the exact base `8fda5336a3f4b574a6c75bd550fd73790034420b`
and on this head: one completed three-unit gathering in the Ashfall original-collection fixture, then the same causal input with **40 additional,
unrelated dormant Population ledgers** (31 → 71 facts, 107,366 → 204,216 serialised bytes). Counters are exact; timings are single-process medians
of 40 repetitions on one Linux container (Node 22.22.2, pnpm 10.33.0) and are context only. No universal SLA or cap is adopted.

| Operation (store reads by identity; none is a listing)                    | Base   | Head, 0 dormant | Head, 40 dormant |
| ------------------------------------------------------------------------- | ------ | --------------- | ---------------- |
| Perception task build (`getFact`)                                         | 11     | 14              | 14               |
| Earned Glance gateway (`getFact` + `committedGroup`)                      | 19 + 2 | 21 + 2          | 21 + 2           |
| Glance output size (legacy path)                                          | 369 B  | 369 B           | 369 B            |
| Scene viewing task build (`getFact`; only where a scene host is bound)    | n/a    | 6               | 6                |
| Scene appearance task build (`getFact`; only where a scene host is bound) | n/a    | 9               | 9                |
| Retained bytes of the two scene decision records                          | n/a    | 13,352 B        | 13,352 B         |

Reads are constant in dormant state and history, and the legacy Glance output is byte-for-byte the same size on both trees. The added cost is
three fixed reads on the task build and two fixed reads on the Glance (the two GM-scene citation slots). A look that runs the scene step makes
**up to three** host calls (appearance once per delivery, viewing, perception) instead of one, retains two sealed decisions and two sparse facts,
and passes no time. The cost is per look, not per item gathered: one request covers a whole gathering, and nothing is asked per blink.

## Limitations, owning route and trigger

| #   | Limitation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owning route                                           | Trigger                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| L1  | **Delegated I-002 compilation (brief deliverable 2) is not built.** The player-authored R-5 clarification route is retained for its lawful cases; there is no Delegation Commit Record carrier, no GM compile operation, and no sibling of `pc_intrinsic_clarification` with delegated provenance. GM-generated wording is **not** routed through R-5. A delegated exact cycle therefore cannot yet be produced, so the supported positive still needs a lawfully player-authored cycle.                                                                                           | A follow-on bounded slice (I-002 §9; CPAA-C1 v0.3 F-2) | BLUE release of that slice; no new universal timing rule or B-2 route is assumed                           |
| L2  | Genuine-host behaviour of the scene step (ordinary-look versus material commitment, appearance resolution) is unmeasured. A reworded look at the same basis is a new GM question **if no ruling was published**; the engine cannot prevent this because the player's words are part of the question.                                                                                                                                                                                                                                                                               | Scene resolution / genuine-host witness                | First genuine-host observation that flips a ruling on rewording → retain a negative scene ruling per basis |
| L3  | The number-word guard on appearances is lexical and English-only; the owner-derived withheld set (names, digits) is the primary guard.                                                                                                                                                                                                                                                                                                                                                                                                                                             | `deriveScene`                                          | A non-English or otherwise phrased count in a genuine-host appearance                                      |
| L4  | A sparse world that authors no light/path statement leaves perception unresolved; the Game Master cannot supply missing world facts.                                                                                                                                                                                                                                                                                                                                                                                                                                               | Setting authoring                                      | A genuine-host seed that omits them                                                                        |
| L5  | The WG frozen authority is pinned `2026-09-25T13:44:22.668Z`; the page was later edited (`2026-10-23`). Equivalence of the consumed passages (Resolution Rules, F-016) across that edit was not verified.                                                                                                                                                                                                                                                                                                                                                                          | BLUE source-fidelity                                   | BLUE rechecks the passages against the pin                                                                 |
| L6  | The Glance now makes two more fixed, constant-shape reads (fifteen gateway reads); legacy records keep their layout. Whole-operation cost against the exact base is reported in the PR.                                                                                                                                                                                                                                                                                                                                                                                            | Protocol Glance                                        | A change to the fixed shape                                                                                |
| L7  | The independent consequence is limited to GIP sunset expiry, demonstrated at the gateway. The uniform fail-closed refusal of an in-flight advance over other due boundaries (C8/D-2) is unchanged and remains a timing-disclosure residual: a gathering that would span a due independent boundary is withheld without a reason, and the player can learn only that the attempt was not admitted.                                                                                                                                                                                  | Temporal / protocol advance                            | BLUE selection of another producer or of the C8 residual                                                   |
| L8  | Recovery of a scene-aware look relies on pending-operation gating (no other action intervenes). A look whose basis moved before recovery is not recoverable by identity.                                                                                                                                                                                                                                                                                                                                                                                                           | Phone recovery                                         | Any change that lets an action run while an observation is pending                                         |
| L9  | **The chat route cannot compose an operator-authored opening.** `establish-timed-governance` (and the other operator openings) are pre-play commands, refused once a character is bound, and establish canonical time with their own origin; the chat route's `state_starting_moment` (`initialize-time`) comes after binding and refuses an existing time with "another origin". Both are existing, deliberate behaviours and neither was changed. A live independent producer in a chat-built campaign needs a BLUE decision about where its time origin and its opening belong. | Operator openings / starting chronology                | BLUE decision on opening order, or a release of an in-play producer-authoring route                        |
