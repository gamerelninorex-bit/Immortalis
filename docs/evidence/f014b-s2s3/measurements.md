# F-014B B1 S2/S3 - engineering-acceptance measurements

EXECUTED on one machine (v22.23.5, linux); raw numbers in `measurements.json`. Single-machine timings are indicative, not a benchmark claim.

## T0 reads against world size

One classification of a stationary PC in a committed campaign that also holds N unrelated Standing Instruction ledgers (`tests/integration/gm-wait-present-s3-cost.test.ts`).
The cap is 25 reads (`S3_MAX_READS`). The read count does not change with the size of the world.

| N unrelated ledgers | facts in store | keys read | cold (us) | warm p50 (us) | warm p95 (us) |
| ------------------- | -------------- | --------- | --------- | ------------- | ------------- |
| 0                   | 25             | 18        | 4351      | 300           | 639           |
| 20                  | 46             | 18        | 675       | 261           | 411           |
| 60                  | 86             | 18        | 655       | 277           | 513           |

## Hashing and build-time traversal

| Item                                                               | Value                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Manifest size                                                      | 330227 bytes                                                  |
| SHA-256 of the manifest bytes                                      | p50 380 us, p95 483 us                                        |
| Verify a supplied digest (string compare plus retained-bytes hash) | p50 381 us, p95 440 us                                        |
| Canonical bytes of the manifest                                    | 4.8 ms                                                        |
| Whole generation, cold, in process                                 | 1001 ms                                                       |
| Census alone, warm                                                 | p50 847 ms, max 971 ms                                        |
| Cold CLI `--check` (fresh node process, five runs)                 | 1314, 1325, 1326, 1195, 1278 ms wall; max child RSS 220872 KB |

The census reads production sources only (five AST roots, three reflected roots). It runs at build and test time and never at run time: nothing here is on a wait's request path.
The catalogue digest check inside a classification (category 4) reads no store: it costs one hash of the retained manifest bytes (the row above) and a string comparison.

## Cost to the existing gates

| Run                     | Test files | Tests | Four-project vitest |
| ----------------------- | ---------- | ----- | ------------------- |
| main 0cff287 (baseline) | 287        | 5153  | 90.5 s              |
| this branch (gate c5)   | 291        | 5245  | 94.87 s             |

Baseline typecheck 23 s, lint 21 s, format check 30 s on main. The integration project is not part of the four-project run.
The manifest is 330 KB of tracked bytes that no formatter touches.
