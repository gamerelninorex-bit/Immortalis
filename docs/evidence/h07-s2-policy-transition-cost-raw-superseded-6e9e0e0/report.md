# H-07 S2 — policy-transition first-open cost: exact BASE versus exact HEAD (T1 mechanism only, OB-030)

base `a1f26c70862dd0de26c0836b1708ca3b9d9aa667`; head code `6e9e0e03b2c5724e6f64d332ab06e0fb94cd9394`; v22.23.4 on linux x64 6.18.44-fc-v236; Intel(R) Xeon(R) Processor @ 2.10GHz (4 logical CPUs); filesystem type 0xef53. Each cell: fresh process per sample on a private copy of the SAME fixture, one excluded warmup, then the measured repetitions (median (min–max)). BASE and HEAD alternate within a cell so drift affects both. No SLA is invented; the figures describe these synthetic fixtures and this runtime only.

## First open of a canonical old-policy package (real owners; the package was written by the exact prior-contract build; state AND history grow)

| entries | build |   n |                first open ms |            first open CPU ms | strict passes | entries replayed | groups verified | full-state hashes | full-state hash MB | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) |           commit ms |            2nd open ms |            3rd open ms |
| ------: | ----- | --: | ---------------------------: | ---------------------------: | ------------: | ---------------: | --------------: | ----------------: | -----------------: | -----------: | -----------------: | ------: | -------: | -----: | ----------: | -------------------------------------: | ------------------: | ---------------------: | ---------------------: |
|       3 | base  |   5 |            93.3 (75.0–118.1) |           119.4 (98.7–151.3) |             4 |               12 |              12 |                24 |                0.1 |          178 |                  0 |     0.1 |       13 |      7 |     149,756 |                     112.5 (98.6–135.8) |    13.3 (11.4–20.5) |       16.5 (10.9–18.3) |        10.0 (8.2–14.2) |
|       3 | head  |   5 |            82.3 (59.8–109.3) |            85.4 (65.2–122.7) |             1 |                3 |               3 |                10 |                0.0 |          127 |                  0 |     0.1 |       13 |      7 |     144,260 |                      92.7 (70.4–127.5) |     14.4 (8.2–14.8) |       15.9 (12.9–18.4) |       14.5 (11.9–21.5) |
|     103 | base  |   5 |       1586.5 (1532.3–2266.3) |       1860.8 (1801.9–2576.6) |             4 |              412 |             412 |               424 |               71.6 |        7,808 |                  0 |     5.1 |     1005 |      7 |     170,504 |                 1608.1 (1548.8–2293.0) |    18.7 (14.5–22.4) |    119.3 (105.8–153.4) |     116.6 (90.5–133.4) |
|     103 | head  |   5 |          593.4 (574.4–612.6) |          781.4 (740.1–785.5) |             1 |              103 |             103 |               110 |               18.9 |        4,109 |                  0 |     3.3 |     1005 |      7 |     168,008 |                    613.9 (591.9–631.4) |    17.0 (15.2–18.5) |     108.9 (95.8–150.1) |     129.5 (95.8–152.9) |
|     503 | base  |   5 |    25385.1 (24326.5–27682.3) |    25802.4 (24816.3–28265.0) |             4 |            2,012 |           2,012 |             2,024 |             1681.4 |       56,886 |                  4 |    35.6 |     5954 |     13 |     407,356 |              25426.1 (24366.8–27733.0) |    37.9 (32.3–46.3) |    551.4 (506.7–618.7) |    540.6 (365.5–754.6) |
|     503 | head  |   5 |       7109.9 (6808.7–7907.1) |       7592.1 (7244.0–8383.1) |             1 |              503 |             503 |               510 |              426.6 |       35,352 |                  2 |    24.1 |     5954 |     13 |     320,644 |                 7151.9 (6843.4–7966.6) |    39.5 (32.1–56.8) |    505.5 (497.8–641.0) |    552.2 (521.5–710.3) |
|    2003 | base  |   5 | 418375.1 (400225.6–433528.5) | 467174.2 (448303.4–480520.3) |             4 |            8,012 |           8,012 |             8,024 |            26528.4 |      283,207 |                  4 |   167.4 |    27477 |     37 |   1,002,432 |           418485.4 (400337.0–433662.0) |  108.0 (93.0–129.4) | 2324.2 (2211.4–2666.9) | 2306.3 (2225.2–2498.6) |
|    2003 | head  |   5 | 108015.3 (104636.2–113959.2) | 119033.7 (115448.3–125199.5) |             1 |            2,003 |           2,003 |             2,010 |             6658.3 |      185,317 |                  2 |   114.6 |    27477 |     37 |     634,404 |           108131.0 (104766.9–114069.3) | 113.5 (107.4–128.3) | 2057.9 (1961.2–2155.8) | 2083.5 (1901.9–2365.3) |

**BASE ÷ HEAD (medians):**

| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |
| ------: | --------------: | -------------: | ------------: | ---------------: | --------------: | ----------------: | ---------: | -------: | --------------: |
|       3 |           1.13× |          1.40× |         4.00× |            4.00× |           4.00× |             2.40× |      1.18× |    1.04× |           1.21× |
|     103 |           2.67× |          2.38× |         4.00× |            4.00× |           4.00× |             3.85× |      1.53× |    1.01× |           2.62× |
|     503 |           3.57× |          3.40× |         4.00× |            4.00× |           4.00× |             3.97× |      1.48× |    1.27× |           3.56× |
|    2003 |           3.87× |          3.92× |         4.00× |            4.00× |           4.00× |             3.99× |      1.46× |    1.58× |           3.87× |

## First open of a one-fact old-policy package (history grows, state does not)

| entries | build |   n |             first open ms |         first open CPU ms | strict passes | entries replayed | groups verified | full-state hashes | full-state hash MB | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) |        commit ms |   2nd open ms |    3rd open ms |
| ------: | ----- | --: | ------------------------: | ------------------------: | ------------: | ---------------: | --------------: | ----------------: | -----------------: | -----------: | -----------------: | ------: | -------: | -----: | ----------: | -------------------------------------: | ---------------: | ------------: | -------------: |
|       3 | base  |   5 |          56.0 (48.5–67.2) |          66.0 (62.7–83.5) |             4 |               12 |              12 |                24 |                0.0 |          172 |                  0 |     0.1 |        8 |      7 |     144,016 |                       69.7 (55.9–72.7) |   5.2 (3.9–11.0) | 4.9 (3.7–7.5) |  4.3 (3.5–5.4) |
|       3 | head  |   5 |          41.3 (34.1–56.7) |          38.9 (30.4–54.6) |             1 |                3 |               3 |                10 |                0.0 |           88 |                  0 |     0.0 |        8 |      7 |     136,972 |                       48.9 (41.7–70.6) |    5.7 (4.9–9.5) | 5.9 (4.7–8.9) | 9.2 (6.0–10.7) |
|     103 | base  |   5 |       321.9 (248.2–519.4) |       488.9 (423.9–750.6) |             4 |              412 |             412 |               424 |                0.2 |        7,824 |                  0 |     2.3 |      676 |      7 |     159,056 |                    332.5 (254.4–531.9) |    5.9 (4.4–8.7) | 5.5 (3.7–7.4) |  4.9 (3.4–8.1) |
|     103 | head  |   5 |       175.1 (116.6–194.5) |       256.1 (179.6–307.1) |             1 |              103 |             103 |               110 |                0.0 |        2,866 |                  0 |     0.5 |      676 |      7 |     158,128 |                    188.1 (126.3–209.4) |   8.2 (6.9–11.3) | 6.5 (5.1–7.8) |  6.5 (4.4–9.0) |
|     503 | base  |   5 |    1243.7 (1129.5–1304.2) |    1552.7 (1426.4–1624.5) |             4 |            2,012 |           2,012 |             2,024 |                0.9 |       57,093 |                  0 |    18.4 |     4316 |     13 |     168,376 |                 1253.8 (1138.3–1315.5) |    6.7 (6.5–8.4) | 4.9 (4.7–9.2) |  4.1 (3.6–5.0) |
|     503 | head  |   5 |       582.8 (546.9–618.4) |       803.5 (782.3–852.7) |             1 |              503 |             503 |               510 |                0.2 |       28,329 |                  0 |     7.3 |     4316 |     13 |     167,232 |                    597.1 (557.1–627.9) |    8.1 (7.2–8.6) | 6.1 (4.6–9.5) |  5.0 (3.8–6.8) |
|    2003 | base  |   5 |    5104.3 (4725.9–5460.5) |    5603.9 (5226.8–5938.5) |             4 |            8,012 |           8,012 |             8,024 |                3.7 |      283,295 |                  4 |    94.4 |    20876 |     37 |     244,688 |                 5118.6 (4738.4–5471.1) |  10.0 (6.9–11.2) | 6.0 (3.4–6.5) |  5.2 (4.2–7.9) |
|    2003 | head  |   5 |    2597.0 (2414.5–2899.8) |    2972.4 (2808.2–3241.3) |             1 |            2,003 |           2,003 |             2,010 |                0.9 |      152,737 |                  2 |    42.9 |    20876 |     37 |     200,956 |                 2612.7 (2426.5–2912.0) |  10.5 (9.2–14.3) | 4.9 (3.8–5.6) | 4.8 (4.3–10.1) |
|    5003 | base  |   5 | 15452.8 (14448.7–15966.2) | 16304.3 (15241.6–17017.1) |             4 |           20,012 |          20,012 |            20,024 |                9.3 |      790,765 |                  4 |   267.9 |    58287 |     85 |     336,088 |              15469.2 (14467.8–15986.0) | 14.7 (14.0–16.9) | 4.8 (4.0–6.9) |  4.4 (3.2–6.8) |
|    5003 | head  |   5 |    7983.1 (7382.0–8374.5) |    8488.5 (7848.0–8904.6) |             1 |            5,003 |           5,003 |             5,010 |                2.3 |      438,261 |                  2 |   126.7 |    58287 |     85 |     295,084 |                 8002.8 (7399.7–8395.2) | 17.1 (15.5–17.4) | 5.8 (4.6–6.6) |  5.6 (4.6–9.4) |

**BASE ÷ HEAD (medians):**

| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |
| ------: | --------------: | -------------: | ------------: | ---------------: | --------------: | ----------------: | ---------: | -------: | --------------: |
|       3 |           1.35× |          1.69× |         4.00× |            4.00× |           4.00× |             2.40× |      2.00× |    1.05× |           1.42× |
|     103 |           1.84× |          1.91× |         4.00× |            4.00× |           4.00× |             3.85× |      4.60× |    1.01× |           1.77× |
|     503 |           2.13× |          1.93× |         4.00× |            4.00× |           4.00× |             3.97× |      2.52× |    1.01× |           2.10× |
|    2003 |           1.97× |          1.89× |         4.00× |            4.00× |           4.00× |             3.99× |      2.20× |    1.22× |           1.96× |
|    5003 |           1.94× |          1.92× |         4.00× |            4.00× |           4.00× |             4.00× |      2.11× |    1.14× |           1.93× |

## Ordinary open and commit, canonical package (matched policy)

The policy already matches this build: the ordinary path, which this change must not regress.

| entries | build |   n |                   open ms | groups verified |           commit ms |               2nd open ms | peak RSS kB |
| ------: | ----- | --: | ------------------------: | --------------: | ------------------: | ------------------------: | ----------: |
|       3 | base  |   5 |          44.8 (37.7–68.2) |               3 |    14.1 (12.2–17.5) |           10.0 (9.6–14.0) |     141,596 |
|       3 | head  |   5 |          42.1 (41.3–64.9) |               3 |      9.8 (9.2–13.8) |          15.1 (13.6–19.7) |     136,808 |
|     103 | base  |   5 |       375.1 (329.9–463.6) |             103 |    15.1 (12.2–17.4) |       372.0 (343.8–386.2) |     167,556 |
|     103 | head  |   5 |       403.5 (300.1–456.3) |             103 |    14.2 (11.7–18.0) |       348.1 (316.3–399.0) |     166,200 |
|     503 | base  |   5 |    3253.9 (2954.3–3512.2) |             119 |    39.5 (37.9–47.8) |    2854.3 (2694.2–3365.5) |     333,544 |
|     503 | head  |   5 |    2870.1 (2805.3–3453.3) |             119 |    39.0 (32.0–43.7) |    2848.6 (2824.5–3390.3) |     318,740 |
|    2003 | base  |   5 | 11010.6 (10707.5–11325.3) |              83 | 120.7 (113.1–144.3) | 10310.6 (10194.7–10555.3) |     445,332 |
|    2003 | head  |   5 | 11401.7 (10939.1–13479.8) |              83 | 157.6 (114.2–169.3) |  10085.5 (9621.1–10747.8) |     443,296 |

## Ordinary open and commit, one-fact package (matched policy)

The policy already matches this build: the ordinary path, which this change must not regress.

| entries | build |   n |             open ms | groups verified |        commit ms |       2nd open ms | peak RSS kB |
| ------: | ----- | --: | ------------------: | --------------: | ---------------: | ----------------: | ----------: |
|       3 | base  |   5 |    24.3 (22.3–27.6) |               3 |    6.2 (4.4–9.3) |     6.6 (4.8–8.3) |     136,652 |
|       3 | head  |   5 |    23.8 (20.5–27.1) |               3 |    5.8 (4.8–6.9) |     7.9 (5.3–8.2) |     134,812 |
|     103 | base  |   5 |   70.6 (59.9–113.9) |             103 |   8.1 (6.3–29.3) |  33.4 (26.2–50.2) |     157,968 |
|     103 | head  |   5 |    73.5 (63.6–92.3) |             103 |    6.6 (5.9–7.6) |  31.6 (23.9–56.6) |     154,224 |
|     503 | base  |   5 | 131.1 (110.2–158.3) |             119 |  15.8 (7.1–16.6) | 86.5 (71.1–105.1) |     152,460 |
|     503 | head  |   5 | 133.1 (118.9–164.0) |             119 |   7.8 (6.7–16.2) | 99.2 (73.0–110.4) |     158,612 |
|    2003 | base  |   5 | 138.5 (117.0–169.7) |              83 |  12.0 (9.5–25.7) |  77.1 (63.8–98.4) |     157,800 |
|    2003 | head  |   5 | 123.5 (112.6–166.8) |              83 |  10.9 (9.1–12.5) | 74.5 (53.2–117.4) |     158,144 |
|    5003 | base  |   5 |    53.9 (42.0–68.0) |              11 | 15.4 (15.4–19.1) |  24.6 (19.1–30.2) |     145,296 |
|    5003 | head  |   5 |    50.5 (48.9–65.5) |              11 | 16.5 (15.1–18.3) |  20.6 (19.3–43.1) |     140,768 |

## Crash before the manifest publication, then the recovery open

The first open is killed just before the manifest rename (successor files exist, the old manifest is authoritative); the recovery open is a fresh open under the new policy. HEAD only where the BASE cost is unbounded for a repeated crash fixture.

| series    | entries | build |   n |         killed first open ms |           recovery open ms | recovery strict passes | recovery entries replayed | policy after kill                                                         | policy after recovery                                                                                                                                                                                                                                  |
| --------- | ------: | ----- | --: | ---------------------------: | -------------------------: | ---------------------: | ------------------------: | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| canonical |       3 | base  |   5 |             82.3 (80.7–94.3) |           56.0 (39.7–80.7) |                      4 |                        12 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |       3 | head  |   5 |            86.2 (75.3–121.4) |           48.4 (39.1–55.2) |                      1 |                         3 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |     103 | base  |   5 |          807.0 (752.7–944.7) |     1389.8 (1372.2–1643.9) |                      4 |                       412 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |     103 | head  |   5 |          473.6 (366.3–539.0) |        470.4 (445.8–578.5) |                      1 |                       103 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |     503 | base  |   5 |    12241.1 (11828.4–13041.6) |  23667.0 (23282.0–25050.0) |                      4 |                     2,012 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |     503 | head  |   5 |       6615.0 (6156.9–6789.2) |     6814.2 (6086.7–6966.3) |                      1 |                       503 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |    2003 | head  |   2 | 102364.9 (100488.5–104241.4) | 99788.6 (98889.0–100688.2) |                      1 |                     2,003 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| store     |       3 | base  |   5 |             49.2 (39.6–57.5) |           25.5 (19.7–27.6) |                      4 |                        12 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |       3 | head  |   5 |             40.7 (32.8–54.3) |           21.4 (17.8–28.8) |                      1 |                         3 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |     103 | base  |   5 |          198.0 (183.7–209.7) |        185.9 (168.6–238.7) |                      4 |                       412 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |     103 | head  |   5 |          129.4 (117.4–152.4) |          89.6 (69.0–103.4) |                      1 |                       103 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |     503 | base  |   5 |         852.1 (721.9–1096.1) |     1085.2 (1049.2–1256.6) |                      4 |                     2,012 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |     503 | head  |   5 |          559.8 (518.6–752.4) |        514.3 (445.2–536.1) |                      1 |                       503 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |    2003 | base  |   5 |       3863.6 (3644.3–4239.8) |     5432.2 (4916.8–5956.2) |                      4 |                     8,012 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |    2003 | head  |   5 |       2572.0 (2392.6–2918.4) |     2606.1 (2487.3–2794.2) |                      1 |                     2,003 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |    5003 | base  |   5 |    10789.9 (10562.9–11348.5) |  15330.1 (15017.7–15592.3) |                      4 |                    20,012 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |    5003 | head  |   5 |       8098.6 (7796.8–8215.9) |     7821.8 (7738.0–8437.2) |                      1 |                     5,003 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |

## Where the first open of a canonical old-policy package spends its time (inspector profile, inclusive ms; the profiler perturbs timing)

| entries | build | profiled ms | GC ms | replay | stateSha256 | canonicalJson | owner validation (verifyAll) | loadCheckpoint | reconcileCheckpointStates | proveSuccessor | index extend | index lookup |
| ------: | ----- | ----------: | ----: | -----: | ----------: | ------------: | ---------------------------: | -------------: | ------------------------: | -------------: | -----------: | -----------: |
|     103 | base  |        1455 |   109 |    970 |         807 |           795 |                           76 |           1031 |                       233 |              0 |           23 |           98 |
|     103 | head  |         687 |    44 |    232 |         212 |           244 |                          183 |            405 |                         0 |             16 |           25 |           31 |
|     503 | base  |       23866 |  2196 |  19765 |       18908 |         15859 |                          349 |          16195 |                      5270 |              0 |          194 |          669 |
|     503 | head  |        6858 |   609 |   4892 |        4752 |          4111 |                          530 |           5723 |                         0 |             38 |          167 |          291 |

## Identical canonical outcome (BASE versus HEAD, every measured sample)

| kind        | series    | variant | entries |        samples | distinct outcome digests | identical |
| ----------- | --------- | ------- | ------: | -------------: | -----------------------: | --------- |
| interrupted | canonical | old     |     103 | 12 (base+head) |                        1 | yes       |
| interrupted | canonical | old     |    2003 |       2 (head) |                        1 | yes       |
| interrupted | canonical | old     |       3 | 12 (base+head) |                        1 | yes       |
| interrupted | canonical | old     |     503 | 12 (base+head) |                        1 | yes       |
| interrupted | store     | old     |     103 | 12 (base+head) |                        1 | yes       |
| interrupted | store     | old     |    2003 | 12 (base+head) |                        1 | yes       |
| interrupted | store     | old     |       3 | 12 (base+head) |                        1 | yes       |
| interrupted | store     | old     |    5003 | 12 (base+head) |                        1 | yes       |
| interrupted | store     | old     |     503 | 12 (base+head) |                        1 | yes       |
| sample      | canonical | native  |     103 | 12 (base+head) |                        1 | yes       |
| sample      | canonical | native  |    2003 | 12 (base+head) |                        1 | yes       |
| sample      | canonical | native  |       3 | 12 (base+head) |                        1 | yes       |
| sample      | canonical | native  |     503 | 12 (base+head) |                        1 | yes       |
| sample      | canonical | old     |     103 | 12 (base+head) |                        1 | yes       |
| sample      | canonical | old     |    2003 | 10 (base+head) |                        1 | yes       |
| sample      | canonical | old     |       3 | 12 (base+head) |                        1 | yes       |
| sample      | canonical | old     |     503 | 12 (base+head) |                        1 | yes       |
| sample      | store     | native  |     103 | 12 (base+head) |                        1 | yes       |
| sample      | store     | native  |    2003 | 12 (base+head) |                        1 | yes       |
| sample      | store     | native  |       3 | 12 (base+head) |                        1 | yes       |
| sample      | store     | native  |    5003 | 12 (base+head) |                        1 | yes       |
| sample      | store     | native  |     503 | 12 (base+head) |                        1 | yes       |
| sample      | store     | old     |     103 | 12 (base+head) |                        1 | yes       |
| sample      | store     | old     |    2003 | 12 (base+head) |                        1 | yes       |
| sample      | store     | old     |       3 | 12 (base+head) |                        1 | yes       |
| sample      | store     | old     |    5003 | 12 (base+head) |                        1 | yes       |
| sample      | store     | old     |     503 | 12 (base+head) |                        1 | yes       |

All compared outcomes identical: **yes**.
