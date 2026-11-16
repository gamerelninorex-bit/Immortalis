# GM-native freight bridge — evidence (MECHANISM ONLY, T1)

Everything here is scripted-mechanism evidence over the production owner code and a real file-backed canonical campaign. **UNRUN:** genuine model host (T2), named client, retained-storage restart, paid host (T3). No throughput, capacity or latency claim is made or extrapolated; elapsed times are samples that one machine measured.

- Base `49c2892344104ed530b87abf38ee1afee82d4c35` (the working tree measured is the base plus this slice), Node `v22.23.4` on `linux-x64` (the repository pins `.nvmrc` 22.22.2; CI runs that), 3 fresh-process samples per cell, both worlds, unrelated dormant loci 0/100/500/2000.
- Reproduce: `node --experimental-strip-types tools/gm-freight-benchmark.ts matrix <outDir>` (`FREIGHT_BENCH_SIZES`, `FREIGHT_BENCH_REPS`, `FREIGHT_BENCH_WORLDS`). BEFORE = the unchanged `tools/freight-benchmark.ts` (owner code driven directly over one open campaign); AFTER = the same operation through the authenticated tool path (`callGmFreight`, the function the stdio MCP server calls) plus the operator's chronology and the player's two time advances as the real operator commands.
- Raw samples: `benchmark/raw/{before,after}-<world>-<dormant>-<n>.json`; summary: `benchmark/summary.json`; recovery scenario counts: `recovery-matrix.jsonl`.

## Deterministic counters are equal for equal causal work

`equal_bridge_causal_work_across_dormant_sizes` = `{"quarry": true, "textile": true}`; the direct owner reads are equal across sizes too (`{"quarry": true, "textile": true}`). Inside the bridge's operations, whatever unrelated history the campaign carries: **8 host calls + 3 operator commands (11 campaign opens), 25 owner acts attempted, 36 canonical commits, 252 exact-key owner reads, 14 derivations, 23 position reads, 0 GIP-head scans** — and every campaign verifies with 0 violations after the operation and after a cold reopen. The bridge adds **no history-proportional work of its own**.

## Whole-operation elapsed time (median of 3; ms)

| World   | Dormant loci | Before: direct owner code | After: through the tool path | After / before | Mean per host call | Max host call | Mean campaign open (11 per run) | GIP-head facts visited across opens | File bytes read (after) | Cold reopen |
| ------- | ------------ | ------------------------- | ---------------------------- | -------------- | ------------------ | ------------- | ------------------------------- | ----------------------------------- | ----------------------- | ----------- |
| quarry  | 0            | 548                       | 1,098                        | 2.0×           | 96                 | 170           | 46                              | 0                                   | 1.5 MB                  | 101         |
| quarry  | 100          | 642                       | 1,998                        | 3.1×           | 173                | 302           | 116                             | 438                                 | 10.6 MB                 | 199         |
| quarry  | 500          | 900                       | 6,790                        | 7.5×           | 620                | 758           | 513                             | 4,992                               | 81.6 MB                 | 511         |
| quarry  | 2000         | 2,189                     | 21,032                       | 9.6×           | 1,887              | 2,125         | 1,702                           | 21,120                              | 280.6 MB                | 1,777       |
| textile | 0            | 519                       | 1,119                        | 2.2×           | 98                 | 172           | 46                              | 0                                   | 1.5 MB                  | 94          |
| textile | 100          | 579                       | 1,984                        | 3.4×           | 179                | 283           | 115                             | 438                                 | 10.6 MB                 | 195         |
| textile | 500          | 862                       | 6,670                        | 7.7×           | 600                | 766           | 502                             | 4,992                               | 81.6 MB                 | 504         |
| textile | 2000         | 2,208                     | 21,065                       | 9.5×           | 1,901              | 2,192         | 1,700                           | 21,120                              | 280.7 MB                | 1,886       |

## Plainly stated limitation (not a PASS of scaling, not a freight-specific cost)

Elapsed time through the tool path is **not independent of unrelated dormant history**: at 2000 unrelated facts a host call costs ≈1.9 s (≈9.5× the direct operation's total). The growth is the per-call **strict re-open of the whole campaign** (journal replay, canonical integrity and the incremental GIP-head build, which visit each committed fact once), which every existing host lane (player-view, observation, time-advance requests, the operator console) already performs per call so that the single-writer lock is held only for the length of a call and the operator's own console is never starved. The bridge performs 11 opens per whole operation (8 host calls and the 3 operator commands the real operator path needs); its own work inside an operation is constant (table above), and `commit` hashing is the inherited per-commit state hashing already recorded for the F+I slice. Number of host calls is the controllable dimension; the goal-level `gm_freight_initiate` already performs up to 6 owner acts per call (3 calls carry the entire chain, and the player's two time advances are the only mandatory human steps).

**Provisional limit, owning route and reconsideration trigger.** Owning route: the existing persistence/open-cost line (H-07 retained-storage evidence and the engine-wide architectural audit R01), not this slice. Reconsider before any T2 (genuine host) or T3 (named client / retained restart) claim on a campaign with more than a few hundred unrelated committed facts, or when a live session shows a host call whose latency matters to play; the candidate repairs (checkpoint-assisted open for the mutating lane, or holding the lock across one GM turn) change the lock/starvation tradeoff and need their own authorization — neither is built here.

## Recovery: crash and lost-acknowledgement matrix (`tests/integration/gm-freight-recovery.test.ts`)

For each mutating tool at its natural point in the chain, the filesystem fails at **every** durable operation of the whole call (before the operation takes effect, and after it took effect so that the caller sees a failure), the dead process's lock is reclaimed, the campaign is re-opened under strict replay and verified, `gm_freight_reconcile` reports what committed, and the SAME call with the SAME `operation_id` is presented again. Every scenario converged on a final canonical revision and state hash **byte-identical to the uninterrupted run**, and no call that left a commit behind was ever reported as a plain refusal.

| World            | Tool call         | Durable steps in the call | Scenarios | Reported unknown outcome | Reported ok | Reported unavailable |
| ---------------- | ----------------- | ------------------------- | --------- | ------------------------ | ----------- | -------------------- |
| quarry-works     | establish_setting | 12                        | 24        | 16                       | 6           | 2                    |
| quarry-works     | attest_opening    | 6                         | 12        | 4                        | 6           | 2                    |
| quarry-works     | establish_legal   | 18                        | 36        | 28                       | 6           | 2                    |
| quarry-works     | initiate-1        | 16                        | 32        | 24                       | 6           | 2                    |
| quarry-works     | initiate-2        | 16                        | 32        | 24                       | 6           | 2                    |
| textile-workshop | initiate-adequacy | 6                         | 12        | 4                        | 6           | 2                    |

Total: **148** fault scenarios.
