# Player-safe supported-play briefing — whole-operation cost, exact base versus exact head (MECHANISM / T1 only)

Authority: BLUE A7 PASS bounded Builder brief, <https://app.notion.com/p/41220af901e08195bfc5fd9e728b90cf>, native pin `2026-11-08T13:31:35.036Z`, acceptance item 7. Exact BASE `main` `36d50639ccf099fc0e69421f35cf036242c9bcad` (tree `dfe8fd0f1da025cc0704f4b66e165cab20a7ef3b`). **Product code measured: `94b2bffaf3dac54bd59c9fd7950a06d5d30a647b`** (tree `c28f3e9aa85540f3a9844b4858676d2eb8844bfe`). Commits after it change only documentation and this evidence (`git diff 94b2bff..<head> -- apps packages tests tools` is empty). Produced by the reusable `tools/play-context-benchmark.sh` (driver), `tests/integration/play-context-cost.test.ts` (the harness, run **unchanged** in both trees) and `tools/play-context-compare.ts` (reducer). **Raw data retained** in [`play-context-cost-raw/`](play-context-cost-raw/): one JSON per round and build (`raw/round-N/{base,head}.json`, each recording its build and exact commit), `identity.txt` and `report.md` (the complete reduced table). The per-run vitest logs were not retained (all six runs reported 5 of 5 tests passed). Rebuild: `PLAY_CONTEXT_SIZES=0,250,1000 PLAY_CONTEXT_REPS=3 PLAY_CONTEXT_ROUNDS=3 bash tools/play-context-benchmark.sh` from a clean checkout of the head.

Environment: Node v22.23.4, Linux x64 6.18.44-fc-v310, Intel Xeon @ 2.30 GHz, 4 logical CPUs, local ext4-class disk, 2026-11-08 14:58–15:06 UTC. One process runs the scripted client, the scripted referee and scene hosts, the real authenticated OAuth/MCP transport, the real owners and the real Glance gateway. **Nothing here involves a model, a provider, a network or a named client**: MODEL AND CLIENT LATENCY, a GENUINE HOST, a NAMED CLIENT and RETAINED STORAGE are **UNRUN**, a local temporary directory is not retained storage, and no SLA is invented. Absolute times describe this synthetic fixture and this machine; compare BASE with HEAD **within this file** only.

## What is compared

The **causal fixture is held fixed**: a READY first-play campaign (sparse setting, kept and placed character, preparation and declaration walked by the merged chat tools), one `gather` to its earned end and one `observe_surroundings` that earned a current Glance (39 facts, 36 journal entries). **Unrelated admitted history varies**: 0, 250 and 1,000 independent worlds published through the canonical owner's own `establishWorld` (each adds one fact and one journal entry; none is this campaign's setting), giving 39 / 289 / 1,039 facts and 36 / 286 / 1,036 entries. The same file runs in both trees, **BASE then HEAD in every round**, 3 rounds, 3 timed repetitions per journey per round (9 pooled samples per cell, median with min–max), after one warm-up call. Counters come from one separate instrumented pass per journey (the wrappers perturb time and are never mixed with the timed ones).

| journey                                  | what it is                                                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **separate reads** (4 tool calls)        | `original_setting_status`, `original_character_status`, `read_current_observation_glance`, `play_status`: how a GM obtains the same context at BASE (the Glance goes through the nested stdio transport) |
| **`get_play_context`** (1 tool call)     | the briefing (HEAD only)                                                                                                                                                                                 |
| **terminal `play_status`** (1 tool call) | the read-only status that follows a material operation (the end of the `gather` → reach-task exchange → `play_status` chain), measured after one further `gather` to its earned end                      |

Counters: _verified opens_ = `CanonicalCampaign.open` calls (each is a journal replay plus canonical verification, the **common verified-open cost** of any open); _enumerations by the operation_ = full `listFacts()` calls made outside the package's own open and verify (each is O(facts) and sorted); _canonical verifications_ = explicit `campaign.verify()` calls outside open; _fact / group reads_ = keyed `getFact` / `committedGroup` calls outside open and verify; _enumerations inside open/verify_ = the `listFacts()` calls the package's own open and verify make (the dominant, history-sensitive part, shown so that the common cost is not hidden).

## Resuming play: four separate reads versus one call

| unrelated facts added                        | BASE: 4 separate reads | HEAD: `get_play_context` |
| -------------------------------------------- | ---------------------: | -----------------------: |
| tool round trips                             |                      4 |                    **1** |
| response bytes                               |                 12,762 |                **4,596** |
| verified opens                               |                      4 |                    **1** |
| enumerations by the operation                |                      5 |                    **2** |
| canonical verifications                      |                      4 |                    **1** |
| fact reads / group reads                     |               85 / 225 |                  63 / 67 |
| enumerations inside open and verify          |                    200 |                       50 |
| wall ms, +0 (39 facts, 36 entries)           |          312 (274–391) |           **78 (71–88)** |
| wall ms, +250 (289 facts, 286 entries)       |    1,860 (1,690–2,090) |        **433 (389–501)** |
| wall ms, +1,000 (1,039 facts, 1,036 entries) |    4,190 (3,925–4,357) |    **1,033 (892–1,183)** |

Pooled-median wall ratio BASE ÷ HEAD: **3.99× / 4.30× / 4.06×** at +0 / +250 / +1,000. Every **count** is identical at all three sizes (the harness asserts it): operation counts do not depend on unrelated history; the **cost of each pass does**, and it grows with the package (about 1 ms per added journal entry for the one-call briefing, about 3.9 ms per entry for the four-read journey it replaces, i.e. about 1 ms per open), because the verified open, the one canonical verification and the two enumerations are all O(facts). The briefing divides that growing term by about four (200 → 50 enumerations inside open and verify). It does **not** remove it: one verified open and one enumeration remain per resume, and the epistemic-integrity proof of the player view enumerates once more (`verifyEpistemicIntegrity` takes no list). The Glance gateway's own fixed read trace is unchanged and present once, in order, inside the briefing's reads (asserted in `play-context-composition.test.ts`); nothing in the briefing adds a routine world or history search.

## After a material operation: the terminal `play_status`

| unrelated facts added                         | BASE `play_status` | HEAD `play_status` (carries the briefing) |
| --------------------------------------------- | -----------------: | ----------------------------------------: |
| tool round trips                              |                  1 |                                         1 |
| response bytes                                |                894 |                                     4,928 |
| verified opens / enumerations / verifications |          1 / 1 / 0 |                                 1 / 2 / 1 |
| fact reads / group reads                      |            14 / 34 |                                   63 / 85 |
| wall ms, +0                                   |         72 (65–76) |                                91 (83–97) |
| wall ms, +250                                 |      318 (267–389) |                             492 (454–537) |
| wall ms, +1,000                               |      619 (608–734) |                         1,131 (977–1,187) |

**This is the cost the brief accepts and the reviewer should weigh.** The terminal status now performs the whole briefing, so it is 1.27× / 1.55× / 1.83× slower and 5.5× larger than the bare BASE status, still with **one** verified open (it used to open once for the play state alone). In exchange, the context that BASE could only obtain by three further reads (≈ 3.5 s of the 4.2 s journey at +1,000) comes with it. A host that polls `play_status` outside a running goal pays the briefing on every poll; **while a goal is being carried out the briefing is UNAVAILABLE without reading**, as `play_status` already reported its `play`, so the polling that matters costs only the small unavailable envelope.

The old four-call journey run on HEAD is 1.03× / 1.11× / 1.09× slower than at BASE (320 / 2,067 / 4,549 ms; 17,356 B; 6 enumerations; 5 verifications) because its `play_status` now carries the briefing too. It is not the intended path: the tool descriptions and instructions send a resuming GM to `get_play_context`.

## What this does and does not show

- **Shown (mechanism, one machine):** one tool call, one verified open and one canonical verification in place of four calls, four opens and four verifications; operation counts independent of unrelated history; wall time ≈ 4× lower for the resume at the three declared history sizes; the terminal status's added cost, measured.
- **Not shown / UNRUN:** model or client latency, a genuine AI host, a named supported client, a retained or remote disk, behaviour under concurrent load, histories beyond ~1,000 entries, and anything about the experience of play. A faster mechanism is not natural-play acceptance.
- **Provisional limit and owning route.** The briefing still enumerates the package twice (its own search for the PC's commitments and the epistemic proof's), and keeps one explicit canonical verification (every existing path performs it; the open has just verified the same state under the same lock, so it can never find a violation there, but it is retained to keep the existing proofs literally as strong; it is 25 of the 50 enumerations inside open and verify, so dropping it is the largest single saving available, and is left to BLUE as a verified within-brief repair rather than taken unasked). Owning route: I-001 / OB-030. Reconsideration trigger: a measured resume latency on a retained deployment, or a history at which the shared open dominates play; the candidate remedies (a keyed per-PC commitment pointer, a list parameter on `verifyEpistemicIntegrity`, a disposable per-head index) each need an owner or engine change outside this brief.
- **Regression guard.** `tests/integration/play-context-cost.test.ts` asserts the deterministic counts on every CI run at +0 and +40 unrelated facts (one round trip, one open, one verification, ≤ 2 enumerations, fewer opens and enumerations than the separate reads, counts independent of history). It asserts no timing.
