# Initial Locality Bootstrap v0.9 — matched cost evidence (T1 mechanism only, OB-030)

Produced by `tools/bootstrap-benchmark.sh` (reusable; raw per-sample JSON is retained by the run). Exact base `eafbb127c476cafb8498316e496de29e078a2146`; exact head is the commit named in each table. **Mechanism only:** no host, model or provider is involved; genuine model and client latency is T2/T3 UNRUN. No SLA is invented; the figures describe this fixture and runtime only.

base `eafbb127c476cafb8498316e496de29e078a2146` versus head `65cfe98558fdf45e0504ad0fc8005e9159ae2e27`; v22.23.4 on linux x64 6.18.44-fc-v185; Intel(R) Xeon(R) Processor @ 2.10GHz; 5 fresh-process samples per cell.
Columns: **before** = base code on a base-built fixture; **after, old id** = head code on the SAME fixture (first open after the historyVerificationId change); **after, native** = head code on a head-built fixture.

| journal entries | variant      |                 cold open ms |                  cold CPU ms | cold read bytes | cold groups verified |            warm open ms | warm groups verified |  ordinary commit ms | peak RSS kB |
| --------------: | ------------ | ---------------------------: | ---------------------------: | --------------: | -------------------: | ----------------------: | -------------------: | ------------------: | ----------: |
|               3 | before       |             53.5 (41.0–58.1) |             45.0 (42.7–61.3) |           15406 |                    3 |          7.6 (7.2–13.5) |                    3 |     10.0 (8.1–12.5) |      138336 |
|               3 | after-oldid  |             83.7 (75.9–88.8) |          110.8 (101.7–114.7) |          108346 |                   12 |          7.8 (6.6–22.1) |                    0 |      8.9 (8.1–12.1) |      146960 |
|               3 | after-native |             48.0 (43.6–51.2) |             48.1 (42.4–52.8) |           15455 |                    3 |          8.7 (7.4–11.2) |                    3 |     10.1 (9.3–11.4) |      142384 |
|             103 | before       |          397.8 (373.8–483.9) |          523.0 (491.3–621.5) |          698537 |                  103 |     346.7 (314.6–407.9) |                  103 |    15.8 (12.8–29.5) |      166364 |
|             103 | after-oldid  |       1633.0 (1555.4–1724.1) |       1890.8 (1775.1–1945.0) |         5089675 |                  412 |       93.9 (87.8–105.3) |                    0 |    14.9 (13.6–16.3) |      175072 |
|             103 | after-native |          408.0 (375.4–473.5) |          527.5 (482.5–586.3) |          698586 |                  103 |     336.9 (302.8–487.2) |                  103 |    14.4 (12.7–21.2) |      166744 |
|             503 | before       |       3008.9 (2855.4–3303.0) |       3309.1 (3137.3–3601.4) |         9520440 |                  119 |  2792.7 (2584.9–3238.8) |                  119 |    35.3 (33.6–61.3) |      329896 |
|             503 | after-oldid  |    24635.2 (22880.0–26971.2) |    25127.4 (23367.2–27453.0) |        35642620 |                 2012 |     512.7 (461.5–543.4) |                    0 |    37.9 (36.2–46.5) |      397784 |
|             503 | after-native |       3243.6 (2862.0–3480.2) |       3575.7 (3146.8–3707.3) |         9520489 |                  119 |  2990.8 (2821.9–3216.4) |                  119 |    36.8 (33.1–46.1) |      314116 |
|            2003 | before       |    10734.7 (10323.0–11156.4) |    11869.8 (11678.9–12475.9) |        33769960 |                   83 | 9991.6 (9774.7–10610.6) |                   83 | 131.5 (106.3–144.8) |      524904 |
|            2003 | after-oldid  | 419398.1 (404073.5–469243.0) | 460748.7 (444419.6–516434.5) |       167407598 |                 8012 |  2188.5 (2095.1–2292.2) |                    0 | 113.8 (105.1–136.1) |      877796 |
|            2003 | after-native |    11161.6 (10089.1–11509.3) |    12524.5 (11289.9–12970.3) |        33770009 |                   83 | 9759.4 (9478.2–11277.7) |                   83 | 113.3 (104.6–141.7) |      564912 |

## Option A presence-guard scan (head only)

| facts in prefix | first call ms (kinds not yet cached) | steady-state ms per call |
| --------------: | -----------------------------------: | -----------------------: |
|             111 |                                1.029 |                    0.127 |
|            1011 |                                4.443 |                    0.531 |
|           10011 |                               41.838 |                    0.965 |

No SLA is invented; the figures describe this fixture and runtime only.

## Attribution: the expensive first open is the existing mechanism, not added overhead

Because `historyVerificationId` is a single global identity, changing it (required by the brief) makes **every campaign opened under the new policy replay strictly on its first open**, bootstrap or not. To separate that from anything this change adds, the UNCHANGED BASE build was forced into the same full replay (`BOOTSTRAP_FORCE_REPLAY=1` changes only its history verification identity; same fixture, fresh process, 3 samples):

| journal entries | base, forced full replay: cold open ms | groups historically verified | read bytes | warm reopen ms |
| --------------: | -------------------------------------: | ---------------------------: | ---------: | -------------: |
|             103 |                                 1676.2 |                          412 |    5089605 |          175.6 |
|             503 |                                29335.7 |                         2012 |   35642550 |          683.6 |

Head's first open after the identity change on the same fixtures is within the same band (103 entries: 1,633 ms against 1,676 ms; 503 entries: 24,635 ms against 29,336 ms), with the same number of groups verified (412 and 2,012). So the cost is the existing strict-replay and checkpoint-rebuild path, which verifies each group about four times and grows faster than linearly with history; this change neither adds to it nor removes it.

## What the measurements say

- **Head-built history, same causal action:** cold open, warm reopen and an ordinary commit are within run-to-run noise of the base at every size (for example 2,003 entries: cold 11.2 s against 10.7 s, warm 9.8 s against 10.0 s, ordinary commit 113 ms against 132 ms). The ordinary commit makes the same single admission call in both builds (the v0.9 freeze is a key-space prefilter inside it that returns before any scan), and no measurable cost appears on a campaign with no bootstrap record.
- **First open after the identity change:** one-time per campaign, but large and super-linear: 1.6 s at 103 entries, 24.6 s at 503, **419 s (about seven minutes) at 2,003**, against 0.4 s, 3.0 s and 10.7 s from checkpoint evidence. Afterwards a reopen is cheaper than before (warm open 0.09 s, 0.51 s, 2.2 s against 0.35 s, 2.8 s, 10.0 s), because the rebuilt evidence is then reused. Peak RSS rose from about 525 MB to 878 MB at 2,003 entries during that first open.
- **Option A presence guard:** the guard visits every fact of the actual prefix at each dependent admission. With the per-fact kind cache, a steady-state call costs 0.13 ms at 111 facts, 0.53 ms at 1,011 and 0.97 ms at 10,011; the first (uncached) call costs 1.0, 4.4 and 41.8 ms. It runs at collection-work enrollment and at the two projection writes, never per ordinary action.
- **Revisit trigger (OB-030):** the first-open replay cost at long history is a measured, unacceptable-at-scale figure for a live campaign and requires a separately reviewed persistence mitigation before any live campaign is opened under this identity. Staged or incremental re-verification must preserve owner checks and continuity and include interruption/recovery evidence. Whitelisting the prior history verification identity or reusing its checkpoint evidence is not authorized. This persistence redesign is explicitly not bundled here; H-07 remains unaccepted.
