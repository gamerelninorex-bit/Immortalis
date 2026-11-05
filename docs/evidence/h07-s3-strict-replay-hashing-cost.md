# H-07 S3 — strict historical replay: receipt-digest cost, exact base versus exact head (T1 mechanism only, OB-030)

Authority: [BLUE brief](https://app.notion.com/p/40f20af901e08115be38c9eca083f717), native pin `2026-11-05T17:11:20.132Z`. Exact BASE `main` `0b203a5ca502dd79ed847aedd235c97b660ad9ea` (PR #96 merged). **Product code measured: `eb997bcadc9951f955f2a029f9576310e29c12ba`**: the three product files changed against BASE are `packages/engine/src/commit/state-digest.ts` (new), `packages/engine/src/commit/campaign-core.ts` and `packages/engine/src/persistence/checkpoint-package.ts`; every later commit on this PR changes documentation, evidence and benchmark tooling only (`git diff eb997bc..HEAD -- packages tests` is empty; the tooling delta is one column label in `tools/h07-s3-compare.ts` and the added `tools/h07-s3-replay-micro.ts`). Produced by the reusable `tools/h07-s3-benchmark.sh` (driver), `tools/h07-s3-benchmark.ts` (one fresh-process sample), `tools/h07-s3-compare.ts` (reducer) and `tools/h07-s3-replay-micro.ts` (focused in-process replay timing). **Raw data retained** in [`h07-s3-strict-replay-hashing-cost-raw/`](h07-s3-strict-replay-hashing-cost-raw/): one JSON per fresh-process sample (`raw/`, 480 files, each recording its build and exact commit), `summary.json`, `report.md` (the complete reduced report, every cell), `identity.json` (commits, trees, runtime), `driver.log`, `replay-micro.txt` and `mutation-check.txt`. Fixtures are rebuilt by the script: `H07S3_EXACT_SHA=<head> bash tools/h07-s3-benchmark.sh`.

Environment: Node v22.23.4, linux x64 6.18.44-fc-v236, Intel Xeon @ 2.10 GHz, 4 logical CPUs, ext4 (`0xef53`), SHA-256 about 1.4 GB/s on this machine. One run, 2026-11-05 21:15-22:21 UTC. Only light polling of the result files and the repository host ran alongside; no tests or builds ran during the timed cells. The 2,003-entry **profile** cells (`profile-canonical-old-2003-0-*`) were added afterwards by hand with the driver's own command and are not inside the `identity.json` time window. Absolute times are not comparable with PR #96's evidence (different VM, different day); compare BASE with HEAD **within this file** only. No SLA is invented; the figures describe these synthetic fixtures and this runtime. Nothing here uses a host, model, provider or live campaign (**T2/T3, retained storage and H-07 acceptance are UNRUN**).

## What is compared

The SAME fixture, the identical accepted action (one ordinary canonical commit), BASE code against HEAD code, a fresh process per sample on a private copy, BASE and HEAD alternating inside every cell so drift touches both. Rep 0 of each cell is an excluded warmup, then 5 measured repetitions, except: the canonical 2,003-entry transition cell runs the 5 measured repetitions with no separate warmup (a minutes-long process needs none, and its private fixture copy is read first), and the canonical 2,003-entry crash cell has 2 measured repetitions (each is two multi-minute BASE transitions). Per sample: wall and CPU time, strict passes, entries replayed, historical group verifications, full-state SHA-256 digests and the bytes SHA-256 actually processed for them, all SHA-256 calls, bytes read and written through the engine's file seam, durable-write fsyncs, whole-journal reads and peak RSS; then the accepted commit, a second and a third open, and a SHA-256 over the complete canonical outcome (head, every fact, probe receipts and groups, the journal bytes, the commit's receipt, owner violations). Common trusted open and owner verification are inside every first-open number: the canonical series opens through `CanonicalCampaign.open`, the opener the operator and phone paths use.

- **Canonical series** (real owners; state AND history grow). Old-policy packages written by the exact prior-contract commit `eafbb127c476cafb8498316e496de29e078a2146` (its own Runtime Contract `ab2f6385…` and `historyVerificationId`), 3 / 103 / 503 / 2,003 journal entries, opened under the declared legacy admission, i.e. the OB-030 first open.
- **One-fact series** (history grows, state does not): 3 / 103 / 503 / 2,003 / 5,003 entries.
- **Adversarial rewrite series** (new in S3; state is fixed, history grows): 500 padded cold facts, then 1,500 entries that each rewrite **one existing fact** at the **first**, **middle**, **last** position of the key order, or a rotating one. The position decides how much of the canonical message precedes the first changed byte.
- **Ordinary path** (policy already matches), every series: open, commit, second open, to show no regression.
- **Interrupted**: the first open is killed just before the manifest rename (successor files exist, the old manifest is authoritative); the recovery open is a fresh open under the new policy.

## First open of a canonical old-policy package (median, min–max over the measured repetitions)

| entries | build | first open ms                   |    CPU ms | peak RSS MB | digests | SHA-256 MB actually hashed | MB the digests cover | prefix states copied | whole first use ms (open+commit+close) |
| ------: | ----- | ------------------------------- | --------: | ----------: | ------: | -------------------------: | -------------------: | -------------------: | -------------------------------------: |
|       3 | base  | 67.1 (61.2–72.1)                |      81.9 |         141 |      10 |                        0.0 |                  0.0 |                    0 |                                   78.7 |
|       3 | head  | 64.3 (61.3–74.0)                |      75.7 |         140 |      10 |                        0.0 |                  0.0 |                    3 |                                   75.5 |
|     103 | base  | 574.1 (556.5–617.1)             |     750.2 |         163 |     110 |                       18.9 |                 18.9 |                    0 |                                  593.3 |
|     103 | head  | 349.5 (337.3–429.5)             |     556.1 |         162 |     110 |                        8.1 |                 18.9 |                  115 |                                  367.3 |
|     503 | base  | 7,085.8 (6,737.4–7,528.0)       |   7,580.6 |         329 |     510 |                      426.6 |                426.6 |                    0 |                                7,152.2 |
|     503 | head  | 1,790.8 (1,700.9–1,913.5)       |   2,220.7 |         226 |     510 |                      140.4 |                426.6 |                1,479 |                                1,828.1 |
|   2,003 | base  | 103,479.5 (98,629.4–104,298.4)  | 113,902.3 |         628 |   2,010 |                    6,658.3 |              6,658.3 |                    0 |                              103,604.8 |
|   2,003 | head  | **10,102.3** (9,856.8–10,736.2) |  11,286.6 |         501 |   2,010 |                    3,411.4 |              6,658.3 |               32,874 |                               10,228.2 |

BASE ÷ HEAD (medians): first open **1.04× / 1.64× / 3.96× / 10.24×** at 3 / 103 / 503 / 2,003 entries; CPU 1.08× / 1.35× / 3.41× / 10.09×; peak RSS 1.01× / 1.01× / 1.46× / 1.25×. Strict passes (1), entries replayed (= entries), historical group verifications (= entries), full-state digests, bytes read, bytes written and fsyncs are **identical** between the builds in every cell (2,003 entries: 2,003 / 2,003 / 2,010 digests, 114.6 MB read, 27.5 MB written, 37 fsyncs, 2 whole-journal reads). The gain grows with entries × state because that is what was removed: the work per entry no longer scales with the size of the whole state except for the unavoidable SHA-256 of the part of the canonical message at and after the first changed fact.

After the first open the accepted commit (110.4 → 114.8 ms at 2,003 entries; the live path is unchanged), and the second and third opens are the ordinary path in both builds (2,030 → 2,079 ms and 1,991 → 1,910 ms at 2,003 entries; one tail entry replayed).

## Where the first open spends its time (inspector profile, inclusive ms; the profiler perturbs timing)

| entries | build | profiled |     GC | replay | `stateSha256` (all calls, incl. the replay hook) | of which the incremental digest | `canonicalJson` | owner validation (`verifyAll`) | `loadCheckpoint` | index extend | index lookup |
| ------: | ----- | -------: | -----: | -----: | -----------------------------------------------: | ------------------------------: | --------------: | -----------------------------: | ---------------: | -----------: | -----------: |
|     503 | base  |    6,811 |    508 |  4,975 |                                            4,818 |                               0 |           4,166 |                            503 |            5,803 |          165 |          354 |
|     503 | head  |    1,879 |    139 |    333 |                                              239 |                             109 |             512 |                            529 |            1,185 |          175 |          380 |
|   2,003 | base  |   99,207 | 11,325 | 81,647 |                                           80,689 |                               0 |          65,112 |                          2,195 |           85,796 |        1,063 |        1,938 |
|   2,003 | head  |   10,363 |    642 |  3,616 |                                            3,177 |                           2,520 |           2,357 |                          2,247 |            7,603 |          986 |        1,806 |

Replay fell from 82% to 35% of the profiled first open at 2,003 entries. What remains at HEAD is, in order: the replay (3.6 s, of which 2.5 s is the incremental digest, essentially the SHA-256 itself over the 3.4 GB it still must hash), the unchanged owner validation (2.2 s; it still runs exactly as before), the unchanged derived-index extension and lookups (2.8 s), and the loader's few independent from-scratch state digests (about 0.65 s). None of the last three is in this slice.

## What the first open serialises, sorts, copies and encodes (untimed instrumented pass, one per build)

| series    | entries | build | `JSON.stringify` calls | chars (M) | large sorts (≥64) | elements sorted (M) | state-sized `Map` copies | entries copied (M) | `Buffer.from(string)` bytes (MB) | digests | MB hashed | MB covered | prefix states |
| --------- | ------: | ----- | ---------------------: | --------: | ----------------: | ------------------: | -----------------------: | -----------------: | -------------------------------: | ------: | --------: | ---------: | ------------: |
| canonical |     503 | base  |             11,582,414 |     453.6 |               498 |                0.15 |                      439 |               0.12 |                              6.0 |     510 |     426.6 |      426.6 |             0 |
| canonical |     503 | head  |              1,763,258 |      57.2 |                58 |                0.03 |                      439 |               0.12 |                              7.6 |     510 |     140.4 |      426.6 |         1,479 |
| canonical |   2,003 | base  |            164,476,798 |   6,576.1 |             1,998 |                2.12 |                    1,939 |               2.00 |                             27.5 |   2,010 |   6,658.3 |    6,658.3 |             0 |
| canonical |   2,003 | head  |              8,200,642 |     252.6 |                58 |                0.12 |                    1,939 |               2.00 |                             34.1 |   2,010 |   3,411.4 |    6,658.3 |        32,874 |

The instrumentation (wrappers on `JSON.stringify` and `Array.prototype.sort`, a `Map` constructor proxy, `Buffer.from`) perturbs timing and is never mixed with the timed cells. At 2,003 entries the canonical serialisation work falls 26× in characters and 20× in calls, the full-state sorts from 1,998 to the 58 that remain (the loader's independent single-state digests), and the SHA-256 work by 49% because 51% of the bytes each digest covers are an unchanged prefix whose hash state is reused. **The state-sized `Map` copy per replayed entry (1,939 copies, 2.00 M entries at 2,003) is unchanged**: it is the immutable-state discipline of `#compute`, which this slice does not touch (about 0.2 s at 2,003 entries).

## Adversarial update shapes: a fixed-size state, history rewriting one existing fact (2,000 entries)

| rewrite position | build |                first open ms | peak RSS MB | MB hashed | MB covered | large sorts | `JSON.stringify` chars (M) | BASE ÷ HEAD |
| ---------------- | ----- | ---------------------------: | ----------: | --------: | ---------: | ----------: | -------------------------: | ----------: |
| first key        | base  | 11,474.9 (11,112.0–11,595.7) |         257 |     598.6 |      598.6 |       1,945 |                      638.4 |             |
| first key        | head  |    3,621.4 (3,568.1–3,695.9) |         258 |     519.1 |      598.6 |           8 |                       93.4 |       3.17× |
| middle key       | base  | 11,799.6 (11,529.1–12,036.2) |         256 |     598.6 |      598.6 |       1,945 |                      638.4 |             |
| middle key       | head  |    3,596.6 (3,517.3–3,731.6) |         257 |     290.6 |      598.6 |           8 |                       93.4 |       3.28× |
| last key         | base  | 11,619.4 (11,058.2–12,554.3) |         255 |     598.6 |      598.6 |       1,945 |                      638.4 |             |
| last key         | head  |    3,262.1 (3,047.9–3,397.2) |         253 |      28.7 |      598.6 |           8 |                       93.4 |       3.56× |
| rotating         | base  | 11,608.3 (11,258.6–11,827.0) |         258 |     600.3 |      600.3 |       1,945 |                      640.1 |             |
| rotating         | head  |    3,389.2 (3,270.2–3,588.1) |         256 |     280.8 |      600.3 |           8 |                       93.4 |       3.43× |

This is the shape that would defeat a reuse of a hashed prefix if one were assumed: rewriting the **first** key changes the very first fact, so 87% of the message is hashed afresh (519 of 599 MB; the 13% that is reused comes from the cold build-up, where each new fact lands at the end) and the gain (3.17×) comes only from no longer re-sorting and re-serialising unchanged facts; rewriting the **last** key lets 95% of the SHA-256 work be reused (28.7 of 599 MB) and the gain is 3.56×; the middle and a rotating key sit between. The digest follows where the first changed fact really is; nothing assumes append-only or any key order. The remaining HEAD time (about 3 s) is the same unchanged non-hashing work seen above (parsing and validating 2,000 entries, owner validation, index).

## One-fact series (history grows, state does not): no useful gain, no material regression

| entries |        BASE first open ms |        HEAD first open ms | ratio |
| ------: | ------------------------: | ------------------------: | ----: |
|       3 |          42.3 (39.0–59.6) |          45.5 (38.4–58.8) | 0.93× |
|     103 |       148.6 (132.0–159.2) |       146.1 (129.3–194.1) | 1.02× |
|     503 |       625.2 (598.3–724.3) |       690.2 (625.4–913.2) | 0.91× |
|   2,003 | 3,071.3 (2,803.3–3,418.7) | 3,152.3 (2,920.8–3,680.6) | 0.97× |
|   5,003 | 7,839.5 (7,783.2–8,055.9) | 7,861.8 (7,546.3–8,409.9) | 1.00× |

With a state of one fact the full-state hash is tiny, so there is nothing to recover: the digest count, bytes and passes are identical and the whole first open is the unchanged other per-entry work. The medians differ by −9% to +2% with overlapping ranges and no trend with entries (+0.3% at 5,003). The focused in-process timing of the replay alone (`replay-micro.txt`, two alternating rounds, `tools/h07-s3-replay-micro.ts`) isolates the incremental route's fixed cost: with a state of **one** fact, 2,000 replayed entries take about 225-250 ms on BASE and 250-295 ms on HEAD (roughly +15-25 µs per entry, about 1% of that package's first open); at 8 facts HEAD is already 1.3-1.4× faster, at 64 facts 4×, at 500 facts 13-14× (BASE 7.9-8.3 s, HEAD 0.59-0.61 s).

## Ordinary path (policy already matches): faster, no regression

The bounded tail replay of an ordinary open (up to 127 entries) now uses the same evaluator, so ordinary opens of larger states also improve; the live commit path is unchanged.

| series                                   |                       entries |                                                   open ms (BASE → HEAD) |                                         commit ms (BASE → HEAD) |                                      second open ms (BASE → HEAD) |
| ---------------------------------------- | ----------------------------: | ----------------------------------------------------------------------: | --------------------------------------------------------------: | ----------------------------------------------------------------: |
| canonical                                |                           103 |                                                           375.1 → 157.8 |                                                     14.1 → 12.5 |                                                      336.3 → 98.5 |
| canonical                                |                           503 |                                                         3,131.5 → 839.3 |                                                     35.5 → 37.8 |                                                   3,019.7 → 694.6 |
| canonical                                |                         2,003 |                                                      10,192.7 → 2,578.2 |                                                   119.2 → 132.8 |                                                 9,844.1 → 2,400.0 |
| rewrite (first/middle/last/rotating key) |                         2,000 |                                                       525-539 → 163-185 |                                           22.4-24.0 → 21.7-24.1 |                                                  460-491 → 98-122 |
| one-fact                                 | 3 / 103 / 503 / 2,003 / 5,003 | 23.4 / 65.5 / 142.1 / 131.2 / 45.7 → 28.1 / 74.3 / 167.2 / 130.4 / 46.1 | 5.8 / 6.2 / 16.8 / 17.5 / 14.1 → 5.4 / 5.5 / 16.0 / 10.5 / 14.0 | 6.3 / 29.9 / 81.9 / 75.0 / 22.5 → 6.4 / 37.0 / 81.0 / 75.9 / 17.6 |

The canonical 2,003-entry commit medians (119.2 vs 132.8 ms) have overlapping ranges (106.4-126.8 vs 113.8-135.6); the commit path is byte-for-byte the code it was (`#compute` is unchanged and still pinned by `tests/conformance/h07-source-boundaries.test.ts`). The one-fact opens are 5-30 ms and differ within the same spread as the transition cells above.

## Crash before the manifest publication, then recovery (killed first open ms → recovery open ms)

| series             |           entries | BASE                | HEAD               |
| ------------------ | ----------------: | ------------------- | ------------------ |
| canonical          |               103 | 484.5 → 519.8       | 262.5 → 304.3      |
| canonical          |               503 | 6,324.7 → 6,639.6   | 1,370.1 → 1,656.5  |
| canonical          | 2,003 (2 samples) | 95,751.9 → 99,509.9 | 8,610.9 → 10,293.4 |
| rewrite, first key |             2,000 | 11,581.3 → 11,592.5 | 3,617.1 → 3,639.6  |
| rewrite, last key  |             2,000 | 11,175.7 → 11,136.4 | 3,084.8 → 3,095.3  |
| one-fact           |             5,003 | 8,858.1 → 8,714.9   | 9,178.3 → 8,829.4  |

Each recovery open is one strict pass and converges to the identical canonical outcome in every sample (below). The functional crash matrix (a crash before and after every durable step, on growing and rewritten state, converging byte-for-byte) is `tests/integration/strict-replay-digest.test.ts`, not a timing claim.

## Identical canonical outcome

For every cell, every measured sample of BASE and of HEAD produced the identical SHA-256 over the complete canonical outcome (head, every fact, probe receipts and groups, the journal bytes, the accepted commit's receipt, owner violations): **39 cell groups, 458 outcome-bearing samples, 1 distinct digest each** (`report.md`, last table; `summary.json`). The journal bytes are byte-identical before and after (the tool reads the journal back after every sample), and the tests below assert the same, at every revision.

## Falsifiability of the tests that carry the claim

`tools/h07-s3-mutation-check.sh` breaks the incremental digest ten ways (prefix state reused past the first changed fact, off by one fact, the final fact hashed with its comma, stale prefix states never dropped, a prefix state captured one fact late, an overwrite mistaken for a later insertion, new facts appended instead of merged in key order, the campaign-identity guard removed, a stale cached order reused for a state it was not built from, key order by code point instead of UTF-16 code unit). The unit suite `tests/unit/state-digest.test.ts` fails on every one (`mutation-check.txt`: ten killed, control passing; the first run of the check found one survivor, the campaign-identity guard, which a new test now kills).

## Absolute limitations

- T1 mechanism evidence on synthetic, disposable fixtures on one VM; no genuine host, model, named client or retained live storage. The canonical fixtures' source records are small and uniform (about 3.3 KB per fact), so a real campaign's per-entry serialisation and hashing may differ.
- **The first open is still seconds, not instantaneous, and still grows faster than linearly: 10.1 s at 2,003 canonical entries here.** The remaining hashing is bounded below by the exact-SHA-256 requirement: every receipt's digest covers the whole canonical state, so the bytes at and after the first changed fact must be hashed again at every revision (3.4 GB at 2,003 entries; 87% of every message when the first key is rewritten each time). A workload whose writes land early in the key order and whose state is large will approach BASE's hashing cost, with the serialisation and sorting savings only.
- Not touched by this slice and now the larger shares of the remaining open: owner validation, derived-index extension and lookups, the loader's independent single-state digests, and the immutable-state `Map` copy per entry.
- Timing spread is real (BASE canonical 2,003: 98.6-104.3 s). The deterministic counters (passes, entries, groups, digests, bytes) do not depend on timing.
- No SLA, game limit or timing threshold is derived or asserted. This evidence **does not lift OB-030**; the reconsideration trigger and owning route are in [h07-persistence.md](../h07-persistence.md).
