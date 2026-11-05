# H-07 S2 — policy-transition first-open cost: exact base versus exact head (T1 mechanism only, OB-030)

Authority: [BLUE brief](https://app.notion.com/p/40f20af901e081709d56ccbe40371fbb), native pin `2026-11-05T08:54:33.078Z`. Exact BASE `main` `a1f26c70862dd0de26c0836b1708ca3b9d9aa667`. Product code measured: `6e9e0e03b2c5724e6f64d332ab06e0fb94cd9394` (`packages/engine/src/persistence/checkpoint-package.ts` is the only product file changed; later commits on this branch change documentation, evidence and the benchmark tool's identity field only: verify with `git diff 6e9e0e0..HEAD -- packages tests`). Produced by the reusable `tools/h07-s2-benchmark.sh` (driver), `tools/h07-s2-benchmark.ts` (one fresh-process sample) and `tools/h07-s2-compare.ts` (reducer). **Raw data retained** in [`h07-s2-policy-transition-cost-raw/`](h07-s2-policy-transition-cost-raw/): one JSON per fresh-process sample (`raw/`, 316 samples), `summary.json`, `report.md` (the complete reduced report, every cell), `driver.log`, and `identity.json` (the exact commits, trees and runtime). Fixtures are rebuilt by the script: `H07S2_EXACT_SHA=<head> bash tools/h07-s2-benchmark.sh`.

Environment: Node v22.23.4, linux x64 6.18.44-fc-v236, Intel Xeon @ 2.10 GHz, 4 logical CPUs, ext4 (`0xef53`). This is a different VM from the one that produced PR #95's 631 s figure, so **absolute times in the two documents are not comparable**; compare BASE with HEAD within this file only. No SLA is invented; the figures describe these synthetic fixtures and this runtime only. Nothing here uses a host, model, provider or live campaign (T2/T3, retained storage and H-07 acceptance are UNRUN).

## What is compared

The SAME fixture, the identical accepted action (one ordinary canonical commit), BASE code against HEAD code, a fresh process per sample on a private copy, BASE and HEAD alternating inside every cell so drift touches both. Rep 0 of each cell is an excluded warmup, then 5 measured repetitions, except: the canonical 2,003-entry cell runs the 5 measured repetitions with no separate warmup (a process that runs for minutes needs none, and its private fixture copy is read first), and the HEAD-only canonical 2,003-entry crash cell has 2 measured repetitions (each is two multi-minute transitions). Per sample the tool records: wall and CPU time, strict passes (distinct `CampaignCore`s that replayed), entries replayed, historical group verifications (the verifier's own call count), full-state SHA-256 operations and bytes, all SHA-256 calls, bytes read and written through the engine's file seam, durable-write fsyncs, whole-journal reads, peak RSS; then the accepted commit, a second and a third open, and a SHA-256 over the complete canonical outcome (head, every fact, probe receipts and groups, the journal bytes, the commit's receipt).

- **Canonical series** (real owners, state AND history grow). Old-policy packages were written by the exact prior-contract commit `eafbb127c476cafb8498316e496de29e078a2146` (Runtime Contract `ab2f6385…`, its own `historyVerificationId`), 3/103/503/2,003 journal entries (0/100/500/2,000 extra finite sources), opened through `CanonicalCampaign.open`, the opener the operator and phone paths use, under the declared legacy admission, i.e. the OB-030 first open.
- **One-fact series** (history grows, state does not): 3/103/503/2,003/5,003 entries written under an old policy id, opened by a build whose policy differs.
- **Ordinary path** (policy already matches), both series: open, commit, second open, to show no regression.
- **Interrupted**: the first open is killed just before the manifest rename (successor files exist, the old manifest is authoritative), then the recovery open.

## First open of a canonical old-policy package (median, min–max over the measured repetitions)

| entries | build |            first open s | CPU s | strict passes | entries replayed = groups verified | full-state hashes | full-state bytes hashed | whole-journal reads | read MB | write MB | fsyncs | peak RSS MB |
| ------: | ----- | ----------------------: | ----: | ------------: | ---------------------------------: | ----------------: | ----------------------: | ------------------: | ------: | -------: | -----: | ----------: |
|       3 | base  |     0.093 (0.075–0.118) | 0.119 |             4 |                                 12 |                24 |                  0.1 MB |                   0 |     0.1 |     0.01 |      7 |         150 |
|       3 | head  |     0.082 (0.060–0.109) | 0.085 |             1 |                                  3 |                10 |                  0.0 MB |                   0 |     0.1 |     0.01 |      7 |         144 |
|     103 | base  |        1.59 (1.53–2.27) |  1.86 |             4 |                                412 |               424 |                 71.6 MB |                   0 |     5.1 |      1.0 |      7 |         171 |
|     103 | head  |        0.59 (0.57–0.61) |  0.78 |             1 |                                103 |               110 |                 18.9 MB |                   0 |     3.3 |      1.0 |      7 |         168 |
|     503 | base  |        25.4 (24.3–27.7) |  25.8 |             4 |                              2,012 |             2,024 |                 1.68 GB |                   4 |    35.6 |      6.0 |     13 |         407 |
|     503 | head  |        7.11 (6.81–7.91) |  7.59 |             1 |                                503 |               510 |                 0.43 GB |                   2 |    24.1 |      6.0 |     13 |         321 |
|   2,003 | base  | **418.4 (400.2–433.5)** | 467.2 |         **4** |                          **8,012** |             8,024 |                 26.5 GB |                   4 |   167.4 |     27.5 |     37 |   **1,002** |
|   2,003 | head  | **108.0 (104.6–114.0)** | 119.0 |         **1** |                          **2,003** |             2,010 |                 6.66 GB |                   2 |   114.6 |     27.5 |     37 |     **634** |

Strict passes are the distinct replay cores that replayed; "whole-journal reads" counts journal reads over 1 MB, so it is 0 for the small journals. Full-state operations are SHA-256 updates over the canonical `{"campaign_id"…"facts":[…]}` text.

BASE ÷ HEAD (medians) for the canonical series:

| entries | first-open wall |   CPU | strict passes | entries replayed / groups verified | full-state hashes | bytes read |  peak RSS | whole first use (open + commit + close) |
| ------: | --------------: | ----: | ------------: | ---------------------------------: | ----------------: | ---------: | --------: | --------------------------------------: |
|       3 |           1.13× | 1.40× |         4.00× |                              4.00× |             2.40× |      1.18× |     1.04× |                                   1.21× |
|     103 |           2.67× | 2.38× |         4.00× |                              4.00× |             3.85× |      1.53× |     1.01× |                                   2.62× |
|     503 |           3.57× | 3.40× |         4.00× |                              4.00× |             3.97× |      1.48× |     1.27× |                                   3.56× |
|   2,003 |       **3.87×** | 3.92× |     **4.00×** |                          **4.00×** |             3.99× |      1.46× | **1.58×** |                                   3.87× |

The redundant work is removed exactly: every journal entry is judged once instead of four times (8,012 → 2,003 historical group verifications at 2,003 entries). Writes and fsyncs are identical (the same derived files are published). The two whole-journal reads that remain are the strict pass and the byte-identity read of the successor proof. The wall-clock gain approaches the pass reduction as the state grows, because the pass is dominated by the exact full-state receipt hash (below).

After the first open, the next opens are the ordinary path in both builds: at 2,003 entries the second open takes 2.06 s on HEAD against 2.32 s on BASE (third open 2.08 s against 2.31 s), and the accepted commit takes 113.5 ms against 108.0 ms (same code, within spread). In both builds the second open verifies zero historical groups.

## One-fact series (history grows, state does not)

| entries | BASE first open s | HEAD first open s |     ÷ | strict passes (BASE→HEAD) | groups verified (BASE→HEAD) | peak RSS MB (BASE→HEAD) |
| ------: | ----------------: | ----------------: | ----: | ------------------------: | --------------------------: | ----------------------: |
|       3 |             0.056 |             0.041 | 1.35× |                     4 → 1 |                      12 → 3 |               144 → 137 |
|     103 |             0.322 |             0.175 | 1.84× |                     4 → 1 |                   412 → 103 |               159 → 158 |
|     503 |              1.24 |             0.583 | 2.13× |                     4 → 1 |                 2,012 → 503 |               168 → 167 |
|   2,003 |              5.10 |              2.60 | 1.97× |                     4 → 1 |               8,012 → 2,003 |               245 → 201 |
|   5,003 |              15.5 |              7.98 | 1.94× |                     4 → 1 |              20,012 → 5,003 |               336 → 295 |

With a tiny state the full-state hash is cheap, so the other per-entry work (parsing and validating each entry, hash-verified index reads and extension) is a large share and the wall-clock gain is about 2× even though the redundant passes fall by exactly 4×. The cost still grows with history (and, in the canonical series, with state as well).

## Ordinary path (policy already matches): no regression

| series    | entries | open s (BASE → HEAD) | commit ms (BASE → HEAD) | second open s (BASE → HEAD) |
| --------- | ------: | -------------------: | ----------------------: | --------------------------: |
| canonical |     103 |        0.375 → 0.404 |             15.1 → 14.2 |               0.372 → 0.348 |
| canonical |     503 |          3.25 → 2.87 |             39.5 → 39.0 |                 2.85 → 2.85 |
| canonical |   2,003 |          11.0 → 11.4 |           120.7 → 157.6 |                 10.3 → 10.1 |
| one-fact  |   5,003 |        0.054 → 0.051 |             15.4 → 16.5 |               0.025 → 0.021 |

Code paths other than the transition are untouched (the diff adds a hash only inside the transition branch). The canonical 2,003-entry commit medians differ (120.7 vs 157.6 ms) but the minima are equal (113.1 vs 114.2 ms) and the same measurement in the transition table shows the reverse ordering (108.0 vs 113.5 ms), so this is run-to-run spread of a 100-170 ms CPU-bound hash, not a regression; the full cells are in `report.md`.

## Crash before the manifest publication, then recovery

| series    | entries | BASE killed first open s → recovery open s | HEAD killed first open s → recovery open s | strict passes in the recovery open (BASE → HEAD) |
| --------- | ------: | -----------------------------------------: | -----------------------------------------: | -----------------------------------------------: |
| canonical |     103 |                                0.81 → 1.39 |                                0.47 → 0.47 |                                            4 → 1 |
| canonical |     503 |                                12.2 → 23.7 |                                  6.6 → 6.8 |                                            4 → 1 |
| canonical |   2,003 |          not run (unbounded repeated cost) |                   102.4 → 99.8 (2 samples) |                                            – → 1 |
| one-fact  |   5,003 |                                10.8 → 15.3 |                                  8.1 → 7.8 |                                            4 → 1 |

Each recovery open converges to the identical canonical outcome in every sample (below). The functional crash-boundary matrix (a crash before and after every durable step, converging byte-for-byte) is `tests/integration/policy-transition-replay.test.ts`, not a timing claim.

## Where the first open spends its time (inspector profile, inclusive ms; the profiler perturbs timing and is kept out of the timed samples)

| entries | build | profiled | replay | `stateSha256` | `canonicalJson` | owner validation (`verifyAll`) | R-01 reconcile | successor proof | index extend | index lookups |    GC |
| ------: | ----- | -------: | -----: | ------------: | --------------: | -----------------------------: | -------------: | --------------: | -----------: | ------------: | ----: |
|     503 | base  |   23,866 | 19,765 |        18,908 |          15,859 |                            349 |          5,270 |               0 |          194 |           669 | 2,196 |
|     503 | head  |    6,858 |  4,892 |         4,752 |           4,111 |                            530 |              0 |              38 |          167 |           291 |   609 |
|     103 | base  |    1,455 |    970 |           807 |             795 |                             76 |            233 |               0 |           23 |            98 |   109 |
|     103 | head  |      687 |    232 |           212 |             244 |                            183 |              0 |              16 |           25 |            31 |    44 |

The single remaining strict pass is dominated by recomputing the exact canonical full-state SHA-256 of every historical receipt (about 69% of the profiled first open at 503 entries); it is O(entries × state), so it is super-linear: HEAD takes 0.59 s, 7.1 s and 108 s at 103, 503 and 2,003 entries. The pre-publication successor proof costs about 38 ms at 503 entries (0.6%). Owner validation runs twice in both builds (once on the hypothetical successor, once on the opened store). It is slightly larger on HEAD because the second run now reads through the ordinary hash-verified cold lookups instead of an in-memory replay core, which is the cost every ordinary open pays.

## Identical canonical outcome

For every cell, every measured sample of BASE and of HEAD produced the identical SHA-256 over the complete canonical outcome (head, every fact, probe receipts and groups, journal bytes, the accepted commit's receipt, owner violations): 27 cell groups, 1 distinct digest each (`report.md`, last table). The journal bytes are byte-identical before and after, and the new tests assert the same on every size.

## Absolute limitations

- T1 mechanism evidence on synthetic, disposable fixtures on one VM; no genuine host, model, named client or retained live storage; the fixtures' source records are small and uniform, so a real campaign's per-entry state hashing may differ.
- **The first open is still minutes at 2,003 entries (108 s here), and super-linear.** This change removes the redundant work, not the required strict pass. It does not lift the OB-030 pre-live-open HOLD; BLUE's independent review of this evidence and an express resolution do.
- Timing spread is real (the BASE canonical 2,003 range is 400–434 s). Unrelated light activity (editing documentation, polling the run) occurred on the same VM during the run; no tests or builds ran. The deterministic counters (passes, entries replayed, groups verified, hashes) are exact and do not depend on timing.
- The `exact_sha` field inside each raw sample reads `unknown`: the tool looked for `H07_EXACT_SHA` while the driver exports `H07S2_EXACT_SHA`. Each sample's `build` field (`base`/`head`) is correct; the exact commits and trees are in `identity.json` and in the report header; the tool now reads the right variable. The raw JSON was reformatted by Prettier (whitespace only) to satisfy `format:check`.
- A caller that itself passes `audit: true` on a package whose policy also differs pays the one forced pass plus the audit it asked for (2 passes); a crash between publication and the cleanup of the superseded snapshot costs one further proved replay on the next open (R-01, exceptional). Neither is the ordinary path.
- No SLA, game limit or timing threshold is derived or asserted. The reconsideration trigger and owning route are in [h07-persistence.md](../h07-persistence.md).
