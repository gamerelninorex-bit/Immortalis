# R3 SCC source fixture v0.3.2 — reproduction record (ROADBED R3-T25 evidence custody)

| Item                                                         | Value                                                                                                                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custody repository                                           | `gamerelninorex-bit/immortalis-ob027-runner`                                                                                                               |
| Custody commit                                               | `a76ff62ba1dffd5f5fe86698e1d0eb1cd3b3da77`                                                                                                                 |
| Path                                                         | `artifacts/roadbed/r3-t9/IMMORTALIS_R3_SCC_source_fixture_v0.3.2.txt`                                                                                      |
| Size / SHA-256 (verified before the run)                     | 125,436 bytes / `8f3f80f432fe93701b4e4d7efc4977ab8766a417eeb78532003371059a3f42a8`                                                                         |
| Runtime                                                      | Node **v22.22.2** (the expected version; the fixture reports `node_deviation: null`)                                                                       |
| Engine checkouts                                             | the fixture reads exactly one engine file, `packages/engine/src/temporal/graph.ts` (type-only imports)                                                     |
| …at recorded base `b9c4dcb0266ae7ed43c385092c6937fa5aa3a825` | SHA-256 `0c1eea854f40f176de165d8f62979fe3f4c8c87055b6def6996aa1b01dd8b124`                                                                                 |
| …at this slice's head                                        | SHA-256 `0c1eea854f40f176de165d8f62979fe3f4c8c87055b6def6996aa1b01dd8b124` (**byte-identical; the freight slice does not touch the stage-graph analyzer**) |
| Output (both checkouts)                                      | 623,178 bytes, SHA-256 `22dc063984ee31a011a2a1329d49c4016b00c2ccae16aa3c274d0ae349642fd6`                                                                  |

Fixture summary (identical for both checkouts): 26 positive runs all unblocked; 72 negative controls all rejected (18 by the actual engine
cycle analysis, 54 by source check only); closure cross-check and independent DFS agree on all; v0.2/v0.3/v0.3.1 preserved-evidence regressions
match; source completeness true; 67 E2 admission cases; 6 E2 graph-admission ties; 11 B2-R1 graph-negative admission ties.

**What this does and does not show.** The fixture's own labels apply: ENGINE controls run the real `analyzeStageGraph`; MODEL controls are
fixture-local models; UNRUN items remain UNRUN (F1 committed-refusal owner record `SOURCE_HOLD_G4`, W4/W4C qualification, canonical receipt-id
continuity). It is fixture-only evidence: it proves nothing about runtime behaviour. The freight slice's own runtime stage graph (four declared
stages `LD → WT/ECT-01 → LR → ER` of one logistics object) is exercised by `tests/integration/freight-*.test.ts` through the production
Temporal coordinator, not by this fixture.

Reproduce: `FIXTURE=<path> NODE=<node v22.22.2> REF=<commit> tools/freight-scc-reproduce.sh`.
