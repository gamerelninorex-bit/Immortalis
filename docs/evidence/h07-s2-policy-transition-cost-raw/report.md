# H-07 S2 — policy-transition first-open cost: exact BASE versus exact HEAD (T1 mechanism only, OB-030)

base `a1f26c70862dd0de26c0836b1708ca3b9d9aa667`; head code `40d41e79ef86a300629a568a480619f4f064bc86`; v22.23.4 on linux x64 6.18.44-fc-v236; Intel(R) Xeon(R) Processor @ 2.10GHz (4 logical CPUs); filesystem type 0xef53. Each cell: fresh process per sample on a private copy of the SAME fixture, one excluded warmup, then the measured repetitions (median (min–max)). BASE and HEAD alternate within a cell so drift affects both. No SLA is invented; the figures describe these synthetic fixtures and this runtime only.

## First open of a canonical old-policy package (real owners; the package was written by the exact prior-contract build; state AND history grow)

| entries | build |   n |                first open ms |            first open CPU ms | strict passes | entries replayed | groups verified | full-state hashes | full-state hash MB | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) |           commit ms |            2nd open ms |            3rd open ms |
| ------: | ----- | --: | ---------------------------: | ---------------------------: | ------------: | ---------------: | --------------: | ----------------: | -----------------: | -----------: | -----------------: | ------: | -------: | -----: | ----------: | -------------------------------------: | ------------------: | ---------------------: | ---------------------: |
|       3 | base  |   5 |            98.5 (96.9–121.5) |          128.9 (123.9–160.2) |             4 |               12 |              12 |                24 |                0.1 |          178 |                  0 |     0.1 |       13 |      7 |     149,820 |                    119.2 (111.2–145.7) |    15.3 (10.5–18.1) |       21.1 (15.1–25.1) |        15.1 (8.7–20.8) |
|       3 | head  |   5 |            96.5 (65.7–118.0) |           103.9 (80.2–129.4) |             1 |                3 |               3 |                10 |                0.0 |          133 |                  0 |     0.1 |       13 |      7 |     145,116 |                     121.3 (79.9–150.1) |    21.9 (11.8–26.6) |       18.8 (16.3–24.1) |       16.4 (11.7–20.1) |
|     103 | base  |   5 |       1684.6 (1582.0–1779.1) |       1932.9 (1830.5–2050.8) |             4 |              412 |             412 |               424 |               71.6 |        7,808 |                  0 |     5.1 |     1005 |      7 |     172,472 |                 1707.6 (1600.5–1797.5) |    16.0 (13.1–19.6) |     116.1 (80.2–171.9) |     124.2 (91.3–142.8) |
|     103 | head  |   5 |          685.8 (570.5–710.6) |          845.8 (776.7–883.9) |             1 |              103 |             103 |               110 |               18.9 |        4,315 |                  0 |     3.3 |     1005 |      7 |     168,268 |                    707.5 (591.4–726.9) |    19.4 (14.0–24.2) |     126.5 (90.7–174.6) |    136.3 (122.8–162.0) |
|     503 | base  |   5 |    25161.9 (24885.2–26361.8) |    25849.4 (25557.3–27049.7) |             4 |            2,012 |           2,012 |             2,024 |             1681.4 |       56,886 |                  4 |    35.6 |     5954 |     13 |     404,244 |              25199.3 (24922.4–26402.8) |    36.4 (33.9–40.7) |    531.1 (441.9–652.8) |    464.1 (453.5–687.9) |
|     503 | head  |   5 |       7774.9 (6976.2–8352.2) |       8265.7 (7477.7–8812.6) |             1 |              503 |             503 |               510 |              426.6 |       36,358 |                  2 |    24.1 |     5954 |     13 |     325,332 |                 7816.6 (7024.4–8415.2) |    45.5 (34.7–63.0) |    565.3 (534.1–705.1) |    493.4 (437.2–653.3) |
|    2003 | base  |   5 | 426216.7 (416883.9–432193.9) | 474405.2 (463148.5–480463.0) |             4 |            8,012 |           8,012 |             8,024 |            26528.4 |      283,207 |                  4 |   167.4 |    27477 |     37 |   1,007,972 |           426325.3 (416982.8–432313.4) |  114.6 (95.6–123.0) | 2636.6 (2221.2–2799.5) | 2310.9 (2113.6–2612.8) |
|    2003 | head  |   5 | 110815.4 (109750.6–113908.6) | 121499.4 (120262.7–125516.6) |             1 |            2,003 |           2,003 |             2,010 |             6658.3 |      189,323 |                  2 |   114.6 |    27477 |     37 |     640,304 |           110946.7 (109893.3–114046.3) | 127.7 (121.7–139.7) | 2268.8 (2191.3–2439.7) | 2174.7 (2043.7–2649.1) |

**BASE ÷ HEAD (medians):**

| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |
| ------: | --------------: | -------------: | ------------: | ---------------: | --------------: | ----------------: | ---------: | -------: | --------------: |
|       3 |           1.02× |          1.24× |         4.00× |            4.00× |           4.00× |             2.40× |      1.18× |    1.03× |           0.98× |
|     103 |           2.46× |          2.29× |         4.00× |            4.00× |           4.00× |             3.85× |      1.53× |    1.02× |           2.41× |
|     503 |           3.24× |          3.13× |         4.00× |            4.00× |           4.00× |             3.97× |      1.48× |    1.24× |           3.22× |
|    2003 |           3.85× |          3.90× |         4.00× |            4.00× |           4.00× |             3.99× |      1.46× |    1.57× |           3.84× |

## First open of a one-fact old-policy package (history grows, state does not)

| entries | build |   n |             first open ms |         first open CPU ms | strict passes | entries replayed | groups verified | full-state hashes | full-state hash MB | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) |        commit ms |    2nd open ms |    3rd open ms |
| ------: | ----- | --: | ------------------------: | ------------------------: | ------------: | ---------------: | --------------: | ----------------: | -----------------: | -----------: | -----------------: | ------: | -------: | -----: | ----------: | -------------------------------------: | ---------------: | -------------: | -------------: |
|       3 | base  |   5 |          61.0 (50.1–74.0) |          71.4 (61.5–88.5) |             4 |               12 |              12 |                24 |                0.0 |          172 |                  0 |     0.1 |        8 |      7 |     141,944 |                       76.1 (56.5–82.1) |   5.5 (4.5–12.7) |  6.0 (4.1–7.0) |  4.7 (3.7–6.2) |
|       3 | head  |   5 |          44.7 (40.0–52.2) |          40.8 (37.3–48.7) |             1 |                3 |               3 |                10 |                0.0 |           94 |                  0 |     0.0 |        8 |      7 |     137,804 |                       57.0 (50.9–61.7) |   8.0 (6.8–11.0) | 7.1 (6.1–12.7) | 9.0 (4.6–10.7) |
|     103 | base  |   5 |       324.0 (261.5–483.1) |       543.1 (455.9–665.6) |             4 |              412 |             412 |               424 |                0.2 |        7,824 |                  0 |     2.3 |      676 |      7 |     159,696 |                    333.8 (273.6–499.4) |   6.7 (5.6–11.1) | 6.7 (4.6–10.3) | 6.3 (5.0–11.0) |
|     103 | head  |   5 |       143.1 (134.9–168.3) |       249.1 (235.7–283.5) |             1 |              103 |             103 |               110 |                0.0 |        3,072 |                  0 |     0.5 |      676 |      7 |     159,820 |                    153.6 (147.0–181.3) |    8.1 (6.1–9.9) |  6.0 (5.0–6.6) |  5.0 (4.2–7.7) |
|     503 | base  |   5 |    1384.5 (1303.2–1756.9) |    1691.0 (1583.5–2102.7) |             4 |            2,012 |           2,012 |             2,024 |                0.9 |       57,093 |                  0 |    18.4 |     4316 |     13 |     169,088 |                 1393.0 (1314.2–1770.1) |   8.0 (6.4–26.2) |  5.7 (5.0–9.0) |  5.0 (4.6–8.4) |
|     503 | head  |   5 |       680.6 (675.8–945.9) |      965.7 (945.9–1229.0) |             1 |              503 |             503 |               510 |                0.2 |       29,335 |                  0 |     7.3 |     4316 |     13 |     167,224 |                    693.3 (688.8–955.3) |    8.4 (6.7–9.7) | 6.2 (4.7–11.7) |  6.2 (4.0–7.8) |
|    2003 | base  |   5 |    5315.3 (5051.4–5730.5) |    5989.7 (5583.6–6240.4) |             4 |            8,012 |           8,012 |             8,024 |                3.7 |      283,295 |                  4 |    94.4 |    20876 |     37 |     239,928 |                 5339.2 (5065.8–5749.5) |  10.5 (8.4–16.5) |  5.4 (4.7–6.2) |  4.9 (3.2–7.7) |
|    2003 | head  |   5 |    2850.1 (2579.3–3628.0) |    3267.8 (2971.6–4041.6) |             1 |            2,003 |           2,003 |             2,010 |                0.9 |      156,743 |                  2 |    42.9 |    20876 |     37 |     203,364 |                 2860.4 (2592.9–3643.8) |  10.5 (8.6–11.4) |  5.1 (4.0–6.3) |  4.7 (3.9–5.9) |
|    5003 | base  |   5 | 16249.3 (15514.7–16858.0) | 17080.8 (16389.2–17665.0) |             4 |           20,012 |          20,012 |            20,024 |                9.3 |      790,765 |                  4 |   267.9 |    58287 |     85 |     343,756 |              16277.0 (15540.9–16879.4) | 19.4 (14.7–25.0) |  6.7 (5.8–8.0) |  5.6 (5.5–6.1) |
|    5003 | head  |   5 |    8534.8 (8061.5–9839.1) |   9168.6 (8726.1–10549.6) |             1 |            5,003 |           5,003 |             5,010 |                2.3 |      448,267 |                  2 |   126.7 |    58287 |     85 |     297,308 |                 8556.5 (8079.9–9856.6) | 15.9 (15.5–17.5) |  5.1 (4.4–6.4) |  4.7 (4.2–5.6) |

**BASE ÷ HEAD (medians):**

| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |
| ------: | --------------: | -------------: | ------------: | ---------------: | --------------: | ----------------: | ---------: | -------: | --------------: |
|       3 |           1.36× |          1.75× |         4.00× |            4.00× |           4.00× |             2.40× |      2.00× |    1.03× |           1.34× |
|     103 |           2.26× |          2.18× |         4.00× |            4.00× |           4.00× |             3.85× |      4.60× |    1.00× |           2.17× |
|     503 |           2.03× |          1.75× |         4.00× |            4.00× |           4.00× |             3.97× |      2.52× |    1.01× |           2.01× |
|    2003 |           1.86× |          1.83× |         4.00× |            4.00× |           4.00× |             3.99× |      2.20× |    1.18× |           1.87× |
|    5003 |           1.90× |          1.86× |         4.00× |            4.00× |           4.00× |             4.00× |      2.11× |    1.16× |           1.90× |

## Ordinary open and commit, canonical package (matched policy)

The policy already matches this build: the ordinary path, which this change must not regress.

| entries | build |   n |                   open ms | groups verified |           commit ms |               2nd open ms | peak RSS kB |
| ------: | ----- | --: | ------------------------: | --------------: | ------------------: | ------------------------: | ----------: |
|       3 | base  |   5 |          52.6 (48.2–65.7) |               3 |    16.3 (15.0–24.4) |           10.2 (8.6–10.8) |     141,796 |
|       3 | head  |   5 |          43.8 (42.8–54.3) |               3 |     10.6 (8.9–13.8) |          15.0 (12.9–24.1) |     139,900 |
|     103 | base  |   5 |       439.0 (417.0–528.2) |             103 |    19.0 (14.1–21.3) |       384.3 (376.5–442.4) |     168,684 |
|     103 | head  |   5 |       444.2 (375.1–517.6) |             103 |    15.1 (13.0–17.7) |       358.9 (317.8–429.0) |     166,244 |
|     503 | base  |   5 |    3507.3 (3008.0–3636.1) |             119 |    40.7 (38.8–48.9) |    3218.1 (3064.3–3239.9) |     284,088 |
|     503 | head  |   5 |    3639.5 (3273.0–3669.5) |             119 |    42.8 (31.4–49.1) |    3056.5 (2786.9–3582.4) |     302,024 |
|    2003 | base  |   5 | 11011.2 (10299.8–11962.2) |              83 | 125.7 (115.4–201.3) | 11021.6 (10744.4–11279.9) |     445,940 |
|    2003 | head  |   5 | 10676.6 (10065.0–11355.0) |              83 | 165.9 (116.6–192.0) | 10397.1 (10211.6–11506.6) |     445,060 |

## Ordinary open and commit, one-fact package (matched policy)

The policy already matches this build: the ordinary path, which this change must not regress.

| entries | build |   n |             open ms | groups verified |        commit ms |       2nd open ms | peak RSS kB |
| ------: | ----- | --: | ------------------: | --------------: | ---------------: | ----------------: | ----------: |
|       3 | base  |   5 |    23.8 (22.2–30.4) |               3 |    6.8 (5.6–7.4) |     7.7 (6.0–8.2) |     139,124 |
|       3 | head  |   5 |    27.1 (22.1–31.4) |               3 |   8.2 (5.1–10.3) |    8.7 (8.4–10.6) |     134,688 |
|     103 | base  |   5 |    63.2 (54.1–85.3) |             103 |    7.2 (6.5–7.6) |  31.0 (20.3–36.9) |     155,824 |
|     103 | head  |   5 |   82.8 (53.0–125.3) |             103 |   8.1 (5.1–19.0) |  27.7 (25.6–38.6) |     155,436 |
|     503 | base  |   5 | 142.4 (128.3–230.3) |             119 | 19.0 (14.8–23.9) | 96.8 (70.8–115.7) |     157,992 |
|     503 | head  |   5 | 154.0 (133.0–206.4) |             119 |  10.4 (7.5–24.4) | 82.1 (61.2–110.6) |     158,660 |
|    2003 | base  |   5 | 132.7 (112.9–162.0) |              83 | 15.9 (10.2–22.3) |  62.4 (57.4–84.0) |     157,556 |
|    2003 | head  |   5 | 122.1 (100.2–178.1) |              83 | 11.7 (10.4–24.2) |  80.1 (75.9–98.4) |     158,184 |
|    5003 | base  |   5 |    57.8 (47.3–82.5) |              11 | 18.8 (16.2–29.0) |  25.5 (22.4–42.9) |     145,272 |
|    5003 | head  |   5 |   52.9 (49.7–108.1) |              11 | 17.7 (16.6–19.0) |  22.4 (17.5–51.9) |     146,816 |

## Crash before the manifest publication, then the recovery open

The first open is killed just before the manifest rename (successor files exist, the old manifest is authoritative); the recovery open is a fresh open under the new policy. HEAD only where the BASE cost is unbounded for a repeated crash fixture.

| series    | entries | build |   n |         killed first open ms |             recovery open ms | recovery strict passes | recovery entries replayed | policy after kill                                                         | policy after recovery                                                                                                                                                                                                                                  |
| --------- | ------: | ----- | --: | ---------------------------: | ---------------------------: | ---------------------: | ------------------------: | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| canonical |       3 | base  |   5 |             71.7 (65.2–85.5) |             43.0 (34.2–65.9) |                      4 |                        12 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |       3 | head  |   5 |             63.4 (58.2–77.4) |             29.9 (26.9–38.3) |                      1 |                         3 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |     103 | base  |   5 |         832.1 (745.7–1012.9) |       1396.7 (1329.4–1492.1) |                      4 |                       412 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |     103 | head  |   5 |          508.0 (461.4–566.6) |          563.3 (494.5–644.9) |                      1 |                       103 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |     503 | base  |   5 |    13050.3 (12546.8–13837.4) |    25459.0 (24944.9–26518.0) |                      4 |                     2,012 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |     503 | head  |   5 |       6664.0 (6396.1–7599.7) |       6793.2 (6508.7–7390.3) |                      1 |                       503 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical |    2003 | head  |   2 | 105818.1 (104356.7–107279.5) | 106344.3 (106090.5–106598.1) |                      1 |                     2,003 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| store     |       3 | base  |   5 |             44.6 (38.3–47.9) |             24.9 (23.5–29.3) |                      4 |                        12 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |       3 | head  |   5 |             37.2 (29.7–43.9) |             20.4 (18.6–23.6) |                      1 |                         3 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |     103 | base  |   5 |          204.9 (173.4–249.8) |          208.6 (160.7–237.4) |                      4 |                       412 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |     103 | head  |   5 |          132.3 (114.8–151.3) |             69.7 (58.1–77.7) |                      1 |                       103 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |     503 | base  |   5 |         893.1 (826.3–1077.9) |       1386.7 (1107.0–1625.5) |                      4 |                     2,012 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |     503 | head  |   5 |          719.4 (642.8–903.9) |          536.3 (478.5–573.4) |                      1 |                       503 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |    2003 | base  |   5 |       3743.1 (3666.7–4004.4) |       5299.8 (5259.9–5573.6) |                      4 |                     8,012 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |    2003 | head  |   5 |       2660.6 (2547.2–3083.6) |       2812.3 (2577.4–2954.9) |                      1 |                     2,003 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |    5003 | base  |   5 |     10440.3 (9579.8–10917.8) |    14988.3 (14445.8–15281.4) |                      4 |                    20,012 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |
| store     |    5003 | head  |   5 |       8288.6 (7765.8–8458.7) |       8028.8 (7727.1–8823.6) |                      1 |                     5,003 | h07-s2-old-policy                                                         | h07-s2-new-policy                                                                                                                                                                                                                                      |

## Where the first open of a canonical old-policy package spends its time (inspector profile, inclusive ms; the profiler perturbs timing)

| entries | build | profiled ms | GC ms | replay | stateSha256 | canonicalJson | owner validation (verifyAll) | loadCheckpoint | reconcileCheckpointStates | proveSuccessor | index extend | index lookup |
| ------: | ----- | ----------: | ----: | -----: | ----------: | ------------: | ---------------------------: | -------------: | ------------------------: | -------------: | -----------: | -----------: |
|     103 | base  |        1838 |   153 |   1128 |         924 |           928 |                          160 |           1273 |                       294 |              0 |           28 |          131 |
|     103 | head  |         833 |    65 |    392 |         317 |           355 |                          153 |            598 |                         0 |             17 |           34 |           41 |
|     503 | base  |       26096 |  2480 |  21466 |       20530 |         17259 |                          436 |          17649 |                      5698 |              0 |          174 |          745 |
|     503 | head  |        7450 |   633 |   5353 |        5166 |          4479 |                          475 |           6351 |                         0 |             43 |          171 |          372 |

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
