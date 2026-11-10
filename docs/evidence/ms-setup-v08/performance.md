# M-S v0.8 performance evidence

Historical measurements of the initial reviewed runtime `cd9270d` / `e5c0f49`. The [AMEND repair report](amendment.md) contains the replacement 128/256/512 comparison and deterministic index counters for the repaired path. The samples below are preserved unchanged.

MECHANISM ONLY. These measurements establish the C5 cost boundary and disclose complete-operation costs. They do not establish genuine-host, named-client or retained-storage acceptance. No timing SLA or performance improvement is claimed.

## Revisions and method

- Base: `8fa45367c3850e9528ba871ae6608dc178217e62`.
- Measured implementation: `cd9270d452312ae862c9787b2034d4beb66697ca`. Subsequent test/evidence-only commits preserve its runtime source bytes.
- Benchmark: [`tools/ms-setup-benchmark.ts`](../../../tools/ms-setup-benchmark.ts), SHA-256 `d55332fc240cb0cab5fa58e9f49c6fef11a3140cef4bf24b1dec060b60e7752b`.
- Raw samples: [`performance-raw.json`](performance-raw.json). All operation medians, timing ranges, counts and memory: [`performance-summary.csv`](performance-summary.csv).
- Linux 6.18.57, x86_64; Node 22.22.2, pnpm 10.33.0, Vitest 5.0.2. Three visible logical CPUs; cgroup `cpu.max = 200000 100000` (two CPU quota).
- 15 cells, five sequential fresh Node processes per cell, 75 distinct PIDs. Explicit GC precedes each timed stage; setup is outside that stage. Same benchmark and dependency versions at base/head. No OS cache flush, concurrent benchmark workers or live model calls.
- The fixture operation is the existing source-qualified GIP institution identity establishment, one canonical fact per admitted operation. No-MS sizes are 0, 16, 64 and 256 unrelated identities. Released-MS uses the same sizes after B2. Active sizes are 0, 2 and 8 earlier valid disposed same-MS SCOPE sessions; the causal accepted setup and single actor leaf stay fixed. These sizes are measurement fixtures, not game caps.

The benchmark instruments SHA `createHash().update()` input bytes and successful `FsOps` calls/bytes, including readback and persistence. It counts canonical writes through `CampaignCore.accept`, package opens, fence addressed fact lookups, enumerations/scanned facts, write-key inspections and view lookups. Hash counts are bytes fed to the instrumented hash API, not a claim that every cryptographic primitive has that API. Protected outbox I/O is included through the same FsOps adapter. Per-stage memory records before/after RSS and heap; process maximum RSS includes fixture setup and all measured stages. Instrumentation overhead is included. Historical `checked(group)` proof reads are reflected in filesystem/hash totals, not mislabeled as direct fence fact lookups.

Each fresh process performs setup, then the ordinary operation, open/write/close, same-policy reopen, strict audit reopen, and finally a changed-policy replay reopen. The same-policy reopen is a reusable-policy path, not a claim that all journal proof bytes are cached in memory. Below the checkpoint threshold it still replays the tail. Size 256 crosses the existing checkpoint threshold. Policy changes are measured separately, and their rebuild/write costs are included.

Runtime source fingerprint (sorted contracts/engine/operator `src` paths and file hashes): base `e0af16720aafe65493bbc9a9eb8e28fbdc3466b45a50c01a8a52aed9159f4ea8`, head `2f21a658a0376d2072057d30109f2de368f74bc7560cd87e3e8600058c2c71c0`. Every sample matches its revision fingerprint. Random fixture signing keys change identity bytes while preserving the same contract, structure and lengths.

## Complete ordinary operations

All latencies are medians in milliseconds. The first two columns measure an admitted owner operation on an already open package. The next two include package open, owner operation, durable publication and close.

| Unrelated identities | No-MS base owner | No-MS head owner | No-MS base open/write/close | No-MS head open/write/close | Released-MS head owner | Released-MS head open/write/close |
| -------------------: | ---------------: | ---------------: | --------------------------: | --------------------------: | ---------------------: | --------------------------------: |
|                    0 |             9.12 |             9.44 |                       16.41 |                       18.54 |                   3.64 |                             97.28 |
|                   16 |             4.13 |             3.18 |                       32.33 |                       38.39 |                   3.58 |                            110.28 |
|                   64 |             3.38 |             3.69 |                       65.97 |                       71.91 |                   6.35 |                            146.56 |
|                  256 |             7.55 |             7.83 |                      328.95 |                      434.46 |                  11.38 |                            862.17 |

Every head ordinary operation, in both no-MS and released-MS cells, performs **zero fence fact reads, zero fence scans and zero fence rebuilds**, with one candidate-key inspection and one state-bound view lookup. It performs one canonical write, zero package opens and zero model calls. No-MS ordinary filesystem work is two reads totaling 234 bytes and two writes; the head adds a constant 57 hash/write bytes from the historical policy identity. Released-MS ordinary filesystem work is two reads totaling 240 bytes and two writes. State hashing and other existing owner/package work still grow with history.

## Opens and replay

| Revision / scenario / size | Same-policy open ms | Strict audit open ms | Forced policy replay ms | Process max RSS median MiB |
| -------------------------- | ------------------: | -------------------: | ----------------------: | -------------------------: |
| base / no-ms / 0           |                7.02 |                10.81 |                   22.11 |                     131.88 |
| base / no-ms / 16          |               21.10 |                16.23 |                   59.82 |                     146.76 |
| base / no-ms / 64          |               49.71 |                47.19 |                  165.54 |                     153.71 |
| base / no-ms / 256         |              262.23 |               325.23 |                  721.91 |                     170.48 |
| head / no-ms / 0           |                7.64 |                10.48 |                   35.09 |                     132.75 |
| head / no-ms / 16          |               19.30 |                17.54 |                   74.26 |                     150.18 |
| head / no-ms / 64          |               57.19 |                56.06 |                  227.70 |                     152.94 |
| head / no-ms / 256         |              430.69 |               354.30 |                  948.20 |                     167.33 |
| head / released / 0        |               78.44 |                78.49 |                  302.04 |                     159.82 |
| head / released / 16       |               97.76 |                89.05 |                  366.33 |                     161.67 |
| head / released / 64       |              138.32 |               135.47 |                  558.90 |                     163.98 |
| head / released / 256      |              827.74 |               484.30 |                 1573.20 |                     186.19 |

At the 256-record no-MS checkpoint, same-policy open rises from 262.23 to 430.69 ms (+64.2% in these five-sample medians), filesystem reads from 5,853 / 5,757,144 bytes to 8,748 / 8,311,280 bytes, and hash input from 8,866,820 to 12,054,138 bytes. Open/write/close rises from 328.95 to 434.46 ms (+32.1%). The head derives its view once from the verified checkpoint and checks historical evidence for current facts; those addressed proof reads add material open cost. This is a disclosed regression, not an optimization claim. It does not occur on each already-open ordinary write. No new persistent trust mechanism was added to avoid the cost.

At 256 released-MS records, same-policy open is 827.74 ms, strict audit 484.30 ms, and forced replay 1,573.20 ms. Warm checkpoint view construction scans 256 snapshot facts once, performs three direct fact lookups and replays the remaining tail with the bound released view. Full audit replays the original active chain and its eight milestone scans. The forced-policy path includes normal snapshot/evidence rebuild and multiple internal core initializations (three view rebuilds); it is not combined with warm reuse.

Provisional engineering limit: checkpoint proof/open cost grows with retained history and should be reviewed before any retained-service or wider-release use. BLUE owns acceptance of this T1 evidence; a requirement for materially cheaper package opens, larger-scale retained service, or a changed historical policy is a concrete trigger to revisit verified-open evidence reuse. No measured result authorizes a policy bypass or a game-state cap.

## Active setup and refusal

The measured chain starts at the committed Completion and ends at B2, including one isolated scripted ACTOR dispatch and seven canonical owner writes. SCOPE/SCENE fixture setup occurs before timing. Eight fence scans include the independent initial-time precondition. Each unrelated active-window owner attempt refuses with one fence scan, zero canonical writes and zero driver calls.

| Earlier disposed MS SCOPE sessions | Chain ms | Refusal ms | Chain hash bytes | Chain FS read / write bytes | Chain fence scans / addressed reads / scanned facts | Strict audit ms | Forced replay ms |
| ---------------------------------: | -------: | ---------: | ---------------: | --------------------------- | --------------------------------------------------- | --------------: | ---------------: |
|                                  0 |   122.16 |       2.42 |          1855692 | 1680 / 74196                | 8 / 34 / 114                                        |           92.50 |           314.10 |
|                                  2 |   131.63 |       2.56 |          2122262 | 1680 / 74198                | 8 / 34 / 194                                        |          126.86 |           383.64 |
|                                  8 |   189.87 |       2.65 |          2920178 | 1680 / 74198                | 8 / 34 / 434                                        |          212.76 |           619.04 |

The following per-owner medians are taken from the five active processes at each size. The refusal and seven writes are separately present in every raw sample; their commit-only time excludes sequencer/protected-runner work outside `store.commit`.

| Step              | Fence scans / reads | Commit ms (0 predecessors) | Commit ms (2) | Commit ms (8) |
| ----------------- | ------------------- | -------------------------: | ------------: | ------------: |
| Unrelated refusal | 1 / 1               |                       1.50 |          1.81 |          1.63 |
| Issue             | 1 / 1               |                      15.89 |         11.78 |         15.54 |
| Response          | 1 / 2               |                      11.04 |          9.42 |         16.45 |
| Existence basis   | 1 / 3               |                       8.89 |         12.87 |         17.06 |
| B1 placement      | 1 / 4               |                      10.33 |         12.10 |         18.93 |
| Complete closure  | 1 / 5               |                       8.55 |         10.23 |         17.18 |
| Initial time      | 2 / 12              |                       9.94 |         11.87 |         15.79 |
| B2 presence       | 1 / 7               |                      11.33 |         11.90 |         18.27 |

## Reproduction

Use Node 22.22.2 and pnpm 10.33.0. Create separate checkouts at the exact base and measured implementation commits, install each with `pnpm install --frozen-lockfile`, and copy the committed benchmark unchanged into the base checkout as untracked measurement instrumentation. Each checkout must resolve `@immortalis/*` to its own packages. Never share workspace dependency symlinks that resolve a base import into the head.

Run one fresh process per sample from its respective checkout, five times for each case:

```sh
node --expose-gc --experimental-strip-types tools/ms-setup-benchmark.ts no-ms 0
```

Repeat `no-ms` at 0, 16, 64 and 256 on both revisions; `released` at those four sizes on the head; and `active` at 0, 2 and 8 on the head. Retain each JSON stdout result and record its commit, benchmark hash, environment, revision label and repetition. The supplied raw artifact retains the actual collection order, 75 process identities, operation counts, memory readings and all per-commit measurements. Recovery correctness and total-outbox-loss redispatch are in the test report; they are not inferred from benchmark timings.
