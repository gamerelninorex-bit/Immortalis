# H-07 S2 — policy-transition first-open cost: exact base versus exact head (T1 mechanism only, OB-030)

Authority: [BLUE brief](https://app.notion.com/p/40f20af901e081709d56ccbe40371fbb), native pin `2026-11-05T08:54:33.078Z`; [BLUE hold S2-I1](https://app.notion.com/p/40f20af901e0810597d5f6eb8910e2f1), pin `2026-11-05T12:43:21.124Z`. Exact BASE `main` `a1f26c70862dd0de26c0836b1708ca3b9d9aa667`. **Product code measured: `40d41e79ef86a300629a568a480619f4f064bc86`**, the S2-I1 repair (`packages/engine/src/persistence/checkpoint-package.ts` and `history-index.ts` are the only product files changed in the PR; later commits change documentation and evidence only: verify with `git diff 40d41e7..HEAD -- packages tests tools`). This **replaces** the first run, which measured the enumeration-only successor proof that BLUE's hold found insufficient; that run's raw records are retained for audit in [`h07-s2-policy-transition-cost-raw-superseded-6e9e0e0/`](h07-s2-policy-transition-cost-raw-superseded-6e9e0e0/) and are not evidence for this code. Produced by the reusable `tools/h07-s2-benchmark.sh` (driver), `tools/h07-s2-benchmark.ts` (one fresh-process sample) and `tools/h07-s2-compare.ts` (reducer). **Raw data retained** in [`h07-s2-policy-transition-cost-raw/`](h07-s2-policy-transition-cost-raw/): one JSON per fresh-process sample (`raw/`, 316 samples, each recording its build and exact commit), `summary.json`, `report.md` (the complete reduced report, every cell), `driver.log`, and `identity.json` (commits, trees, runtime). Fixtures are rebuilt by the script: `H07S2_EXACT_SHA=<head> bash tools/h07-s2-benchmark.sh`.

Environment: Node v22.23.4, linux x64 6.18.44-fc-v236, Intel Xeon @ 2.10 GHz, 4 logical CPUs, ext4 (`0xef53`). This is a different VM from the one that produced PR #95's 631 s figure, so **absolute times in the two documents are not comparable**; compare BASE with HEAD within this file only. No SLA is invented; the figures describe these synthetic fixtures and this runtime only. Nothing here uses a host, model, provider or live campaign (T2/T3, retained storage and H-07 acceptance are UNRUN).

## What is compared

The SAME fixture, the identical accepted action (one ordinary canonical commit), BASE code against HEAD code, a fresh process per sample on a private copy, BASE and HEAD alternating inside every cell so drift touches both. Rep 0 of each cell is an excluded warmup, then 5 measured repetitions, except: the canonical 2,003-entry cell runs the 5 measured repetitions with no separate warmup (a process that runs for minutes needs none, and its private fixture copy is read first), and the HEAD-only canonical 2,003-entry crash cell has 2 measured repetitions (each is two multi-minute transitions). Per sample the tool records: wall and CPU time, strict passes (distinct `CampaignCore`s that replayed), entries replayed, historical group verifications (the verifier's own call count), full-state SHA-256 operations and bytes, all SHA-256 calls, bytes read and written through the engine's file seam, durable-write fsyncs, whole-journal reads, peak RSS; then the accepted commit, a second and a third open, and a SHA-256 over the complete canonical outcome (head, every fact, probe receipts and groups, the journal bytes, the commit's receipt).

- **Canonical series** (real owners, state AND history grow). Old-policy packages were written by the exact prior-contract commit `eafbb127c476cafb8498316e496de29e078a2146` (Runtime Contract `ab2f6385…`, its own `historyVerificationId`), 3/103/503/2,003 journal entries (0/100/500/2,000 extra finite sources), opened through `CanonicalCampaign.open`, the opener the operator and phone paths use, under the declared legacy admission, i.e. the OB-030 first open.
- **One-fact series** (history grows, state does not): 3/103/503/2,003/5,003 entries written under an old policy id, opened by a build whose policy differs.
- **Ordinary path** (policy already matches), both series: open, commit, second open, to show no regression.
- **Interrupted**: the first open is killed just before the manifest rename (successor files exist, the old manifest is authoritative); the recovery open is a fresh open under the new policy.

## First open of a canonical old-policy package (median, min–max over the measured repetitions)

| entries | build |           first open s | CPU s | strict passes | entries replayed = groups verified | full-state hashes | full-state bytes hashed | whole-journal reads | read MB | write MB | fsyncs | peak RSS MB |
| ------: | ----- | ---------------------: | ----: | ------------: | ---------------------------------: | ----------------: | ----------------------: | ------------------: | ------: | -------: | -----: | ----------: |
|       3 | base  |    0.099 (0.097–0.122) | 0.129 |             4 |                                 12 |                24 |                  0.1 MB |                   0 |     0.1 |     0.01 |      7 |         150 |
|       3 | head  |    0.096 (0.066–0.118) | 0.104 |             1 |                                  3 |                10 |                  0.0 MB |                   0 |     0.1 |     0.01 |      7 |         145 |
|     103 | base  |    1.685 (1.582–1.779) | 1.933 |             4 |                                412 |               424 |                 71.6 MB |                   0 |     5.1 |     1.01 |      7 |         172 |
|     103 | head  |    0.686 (0.571–0.711) | 0.846 |             1 |                                103 |               110 |                 18.9 MB |                   0 |     3.3 |     1.01 |      7 |         168 |
|     503 | base  |    25.16 (24.89–26.36) |  25.8 |             4 |                              2,012 |             2,024 |                 1.68 GB |                   4 |    35.6 |     5.95 |     13 |         404 |
|     503 | head  |       7.77 (6.98–8.35) |   8.3 |             1 |                                503 |               510 |                426.6 MB |                   2 |    24.1 |     5.95 |     13 |         325 |
|   2,003 | base  | 426.22 (416.88–432.19) | 474.4 |             4 |                              8,012 |             8,024 |                26.53 GB |                   4 |   167.4 |    27.48 |     37 |        1008 |
|   2,003 | head  | 110.82 (109.75–113.91) | 121.5 |             1 |                              2,003 |             2,010 |                 6.66 GB |                   2 |   114.6 |    27.48 |     37 |         640 |

Strict passes are the distinct replay cores that replayed; "whole-journal reads" counts journal reads over 1 MB, so it is 0 for the small journals. Full-state operations are SHA-256 updates over the canonical `{"campaign_id"…"facts":[…]}` text.

BASE ÷ HEAD (medians) for the canonical series:

| entries | first-open wall |   CPU | strict passes | entries replayed / groups verified | full-state hashes | bytes read | peak RSS | whole first use |
| ------: | --------------: | ----: | ------------: | ---------------------------------: | ----------------: | ---------: | -------: | --------------: |
|       3 |           1.02× | 1.24× |         4.00× |                              4.00× |             2.40× |      1.18× |    1.03× |           0.98× |
|     103 |           2.46× | 2.29× |         4.00× |                              4.00× |             3.85× |      1.53× |    1.02× |           2.41× |
|     503 |           3.24× | 3.13× |         4.00× |                              4.00× |             3.97× |      1.48× |    1.24× |           3.22× |
|    2003 |           3.85× | 3.90× |         4.00× |                              4.00× |             3.99× |      1.46× |    1.57× |           3.84× |

The redundant work is removed exactly: every journal entry is judged once instead of four times (8,012 → 2,003 historical group verifications at 2,003 entries). Writes and fsyncs are identical (the same derived files are published). The two whole-journal reads that remain are the strict pass and the byte-identity read of the successor proof. The wall-clock gain approaches the pass reduction as the state grows, because the pass is dominated by the exact full-state receipt hash (below).

After the first open the next opens are the ordinary path in both builds: at 2,003 entries the second open takes 2.27 s on HEAD against 2.64 s on BASE (third open 2.17 s against 2.31 s), and the accepted commit 127.7 ms against 114.6 ms (same code, within spread); in both builds the second open verifies zero historical groups.

## What the keyed-lookup repair costs (this run against the first, enumeration-only run)

The repaired proof looks up all 2 × entries historical keys by their hash-directed path (each node verified once and memoized) and then enumerates the tree. HEAD medians, first run → this run (BASE moved by between -1% and +6% between the two runs on the same cells, so part of each HEAD difference is machine drift):

| series    |   entries | HEAD first open s (first run → this run) | BASE first open s (first run → this run) |
| --------- | --------: | ---------------------------------------: | ---------------------------------------: |
| canonical |       103 |                              0.59 → 0.69 |                              1.59 → 1.68 |
| canonical |       503 |                              7.11 → 7.77 |                            25.39 → 25.16 |
| canonical | **2,003** |              **108.02 → 110.82 (+2.6%)** |                          418.38 → 426.22 |
| one-fact  |     2,003 |                              2.60 → 2.85 |                              5.10 → 5.32 |
| one-fact  |     5,003 |                              7.98 → 8.53 |                            15.45 → 16.25 |

The extra work is 2 × entries SHA-256 key digests (HEAD canonical 2,003: 185,317 → 189,323 SHA-256 calls); bytes read, journal reads and fsyncs are unchanged (114.6 MB, 2 whole-journal reads, 37). The profiled inclusive time of the whole successor proof is 17 ms at 103 entries and 43 ms at 503 entries (it was 16 ms and 38 ms); it is below 1% of the open at 503 entries.

## One-fact series (history grows, state does not)

| entries | BASE first open s | HEAD first open s |     ÷ | strict passes | groups verified | peak RSS MB |
| ------: | ----------------: | ----------------: | ----: | ------------: | --------------: | ----------: |
|       3 |             0.061 |             0.045 | 1.36× |         4 → 1 |          12 → 3 |   142 → 138 |
|     103 |             0.324 |             0.143 | 2.26× |         4 → 1 |       412 → 103 |   160 → 160 |
|     503 |             1.384 |             0.681 | 2.03× |         4 → 1 |     2,012 → 503 |   169 → 167 |
|   2,003 |             5.315 |             2.850 | 1.86× |         4 → 1 |   8,012 → 2,003 |   240 → 203 |
|   5,003 |            16.249 |             8.535 | 1.90× |         4 → 1 |  20,012 → 5,003 |   344 → 297 |

With a tiny state the full-state hash is cheap, so the other per-entry work (parsing and validating each entry, hash-verified index reads and extension, the keyed proof) is a large share and the wall-clock gain is about 2× even though the redundant passes fall by exactly 4×. The cost still grows with history (and, in the canonical series, with state as well).

## Ordinary path (policy already matches): no regression

| series    | entries | open s (BASE → HEAD) | commit ms (BASE → HEAD) | second open s (BASE → HEAD) |
| --------- | ------: | -------------------: | ----------------------: | --------------------------: |
| canonical |     103 |        0.439 → 0.444 |             19.0 → 15.1 |               0.384 → 0.359 |
| canonical |     503 |        3.507 → 3.639 |             40.7 → 42.8 |               3.218 → 3.056 |
| canonical |   2,003 |      11.011 → 10.677 |           125.7 → 165.9 |             11.022 → 10.397 |
| one-fact  |   5,003 |        0.058 → 0.053 |             18.8 → 17.7 |               0.026 → 0.022 |

Code paths other than the transition are untouched (the diff adds a hash only inside the transition branch, and the index memoization is opt-in and used only by the proof). The canonical 2,003-entry commit medians differ (125.7 vs 165.9 ms) but the minima are equal (115.4 vs 116.6 ms) and the same measurement in the transition table shows the reverse ordering (114.6 vs 127.7 ms), so this is run-to-run spread of a 100-190 ms CPU-bound hash, not a regression; the full cells are in `report.md`.

## Crash before the manifest publication, then recovery

| series    | entries | BASE killed first open s → recovery open s | HEAD killed first open s → recovery open s | strict passes in the recovery open (BASE → HEAD) |
| --------- | ------: | -----------------------------------------: | -----------------------------------------: | -----------------------------------------------: |
| canonical |     103 |                                  0.8 → 1.4 |                                  0.5 → 0.6 |                                            4 → 1 |
| canonical |     503 |                                13.1 → 25.5 |                                  6.7 → 6.8 |                                            4 → 1 |
| canonical |   2,003 |          not run (unbounded repeated cost) |                  105.8 → 106.3 (2 samples) |                                            – → 1 |
| one-fact  |   5,003 |                                10.4 → 15.0 |                                  8.3 → 8.0 |                                            4 → 1 |

Each recovery open converges to the identical canonical outcome in every sample (below). The functional crash-boundary matrix (a crash before and after every durable step, converging byte-for-byte) is `tests/integration/policy-transition-replay.test.ts`, not a timing claim.

## Where the first open spends its time (inspector profile, inclusive ms; the profiler perturbs timing and is kept out of the timed samples)

| entries | build | profiled | replay | `stateSha256` | `canonicalJson` | owner validation (`verifyAll`) | R-01 reconcile | successor proof | index extend | index lookups |    GC |
| ------: | ----- | -------: | -----: | ------------: | --------------: | -----------------------------: | -------------: | --------------: | -----------: | ------------: | ----: |
|     503 | base  |   26,096 | 21,466 |        20,530 |          17,259 |                            436 |          5,698 |               0 |          174 |           745 | 2,480 |
|     503 | head  |    7,450 |  5,353 |         5,166 |           4,479 |                            475 |              0 |              43 |          171 |           372 |   633 |
|     103 | base  |    1,838 |  1,128 |           924 |             928 |                            160 |            294 |               0 |           28 |           131 |   153 |
|     103 | head  |      833 |    392 |           317 |             355 |                            153 |              0 |              17 |           34 |            41 |    65 |

The single remaining strict pass is dominated by recomputing the exact canonical full-state SHA-256 of every historical receipt (about 69% of the profiled first open at 503 entries); it is O(entries × state), so it is super-linear: HEAD takes 0.69 s, 7.8 s and 111 s at 103, 503 and 2,003 entries. Owner validation runs twice in both builds (once on the hypothetical successor, once on the opened store); on HEAD the second run reads through the ordinary hash-verified cold lookups instead of an in-memory replay core, which is the cost every ordinary open pays.

## Identical canonical outcome

For every cell, every measured sample of BASE and of HEAD produced the identical SHA-256 over the complete canonical outcome (head, every fact, probe receipts and groups, journal bytes, the accepted commit's receipt, owner violations): 27 cell groups, 1 distinct digest each (`report.md`, last table). The journal bytes are byte-identical before and after, and the new tests assert the same, and the resolution of every historical identity, on every size.

## Absolute limitations

- T1 mechanism evidence on synthetic, disposable fixtures on one VM; no genuine host, model, named client or retained live storage; the fixtures' source records are small and uniform, so a real campaign's per-entry state hashing may differ.
- **The first open is still minutes at 2,003 entries (111 s here), and super-linear.** This change removes the redundant work, not the required strict pass. It does not lift the OB-030 pre-live-open HOLD; BLUE's independent review of this evidence and an express resolution do.
- Timing spread is real (the BASE canonical 2,003 range is 417–432 s). Unrelated light activity (polling the run, editing documentation) occurred on the same VM during the run; no tests or builds ran. The deterministic counters (passes, entries replayed, groups verified, hashes, bytes) are exact and do not depend on timing.
- A caller that itself passes `audit: true` on a package whose policy also differs pays the one forced pass plus the audit it asked for (2 passes); a crash between publication and the cleanup of the superseded snapshot costs one further proved replay on the next open (R-01, exceptional). Neither is the ordinary path.
- No SLA, game limit or timing threshold is derived or asserted. The reconsideration trigger and owning route are in [h07-persistence.md](../h07-persistence.md).
