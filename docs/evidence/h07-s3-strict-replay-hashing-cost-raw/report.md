# H-07 S3 — strict historical replay cost of a policy-transition first open: exact BASE versus exact HEAD (T1 mechanism only, OB-030)

base `0b203a5ca502dd79ed847aedd235c97b660ad9ea`; head code `eb997bcadc9951f955f2a029f9576310e29c12ba`; v22.23.4 on linux x64 6.18.44-fc-v236; Intel(R) Xeon(R) Processor @ 2.10GHz (4 logical CPUs); filesystem type 0xef53. Each cell: fresh process per sample on a private copy of the SAME fixture, one excluded warmup, then the measured repetitions (median (min–max)). BASE and HEAD alternate within a cell so drift affects both. No SLA is invented; the figures describe these synthetic fixtures and this runtime only.

## First open of a canonical old-policy package (real owners; the package was written by the exact prior-contract build; state AND history grow)

| entries | build |   n |               first open ms |            first open CPU ms | strict passes | entries replayed | groups verified | full-state digests | MB hashed by SHA-256 (physical) | MB the digests cover (logical) | prefix states copied | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) |           commit ms |            2nd open ms |            3rd open ms |
| ------: | ----- | --: | --------------------------: | ---------------------------: | ------------: | ---------------: | --------------: | -----------------: | ------------------------------: | -----------------------------: | -------------------: | -----------: | -----------------: | ------: | -------: | -----: | ----------: | -------------------------------------: | ------------------: | ---------------------: | ---------------------: |
|       3 | base  |   5 |            67.1 (61.2–72.1) |             81.9 (77.1–84.6) |             1 |                3 |               3 |                 10 |                             0.0 |                            0.0 |                    0 |          133 |                  0 |     0.1 |       13 |      7 |     144,832 |                       78.7 (72.7–86.8) |     10.0 (8.9–12.0) |       12.8 (12.4–15.6) |        10.1 (9.5–11.1) |
|       3 | head  |   5 |            64.3 (61.3–74.0) |             75.7 (69.0–88.1) |             1 |                3 |               3 |                 10 |                             0.0 |                            0.0 |                    3 |          131 |                  0 |     0.1 |       13 |      7 |     142,860 |                       75.5 (73.5–87.9) |     10.6 (7.7–11.9) |       12.7 (10.0–14.3) |       12.5 (10.5–14.3) |
|     103 | base  |   5 |         574.1 (556.5–617.1) |          750.2 (717.8–789.0) |             1 |              103 |             103 |                110 |                            18.9 |                           18.9 |                    0 |        4,315 |                  0 |     3.3 |     1005 |      7 |     167,088 |                    593.3 (572.8–633.1) |    14.6 (14.4–17.7) |    109.3 (104.7–125.4) |     101.8 (95.4–103.8) |
|     103 | head  |   5 |         349.5 (337.3–429.5) |          556.1 (515.4–609.4) |             1 |              103 |             103 |                110 |                             8.1 |                           18.9 |                  115 |        4,213 |                  0 |     3.3 |     1005 |      7 |     165,604 |                    367.3 (352.0–445.0) |    14.5 (13.4–16.1) |     105.2 (96.8–118.8) |      96.3 (94.8–102.7) |
|     503 | base  |   5 |      7085.8 (6737.4–7528.0) |       7580.6 (7193.8–7996.5) |             1 |              503 |             503 |                510 |                           426.6 |                          426.6 |                    0 |       36,358 |                  2 |    24.1 |     5954 |     13 |     336,892 |                 7152.2 (6797.2–7582.3) |    53.1 (36.9–64.8) |    494.6 (470.7–575.8) |    483.9 (462.4–566.5) |
|     503 | head  |   5 |      1790.8 (1700.9–1913.5) |       2220.7 (2195.7–2375.7) |             1 |              503 |             503 |                510 |                           140.4 |                          426.6 |                1,479 |       35,856 |                  2 |    24.1 |     5954 |     13 |     231,224 |                 1828.1 (1737.5–1950.8) |    35.1 (34.6–42.6) |    477.2 (468.4–524.9) |    483.4 (468.7–616.8) |
|    2003 | base  |   5 | 103479.5 (98629.4–104298.4) | 113902.3 (108702.1–115007.1) |             1 |            2,003 |           2,003 |              2,010 |                          6658.3 |                         6658.3 |                    0 |      189,323 |                  2 |   114.6 |    27477 |     37 |     642,704 |            103604.8 (98732.7–104438.6) |  110.4 (96.4–137.7) | 2030.3 (1979.8–2422.9) | 1991.4 (1963.7–2292.7) |
|    2003 | head  |   5 |    10102.3 (9856.8–10736.2) |    11286.6 (10982.3–12020.0) |             1 |            2,003 |           2,003 |              2,010 |                          3411.4 |                         6658.3 |               32,874 |      187,321 |                  2 |   114.6 |    27477 |     37 |     512,936 |               10228.2 (9969.6–10851.7) | 114.8 (110.8–142.3) | 2079.0 (1955.5–2281.8) | 1909.7 (1837.9–2233.4) |

**BASE ÷ HEAD (medians):**

| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |
| ------: | --------------: | -------------: | ------------: | ---------------: | --------------: | ----------------: | ---------: | -------: | --------------: |
|       3 |           1.04× |          1.08× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.01× |           1.04× |
|     103 |           1.64× |          1.35× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.01× |           1.62× |
|     503 |           3.96× |          3.41× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.46× |           3.91× |
|    2003 |          10.24× |         10.09× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.25× |          10.13× |

## First open of a one-fact old-policy package (history grows, state does not)

| entries | build |   n |          first open ms |      first open CPU ms | strict passes | entries replayed | groups verified | full-state digests | MB hashed by SHA-256 (physical) | MB the digests cover (logical) | prefix states copied | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) |        commit ms |    2nd open ms |    3rd open ms |
| ------: | ----- | --: | ---------------------: | ---------------------: | ------------: | ---------------: | --------------: | -----------------: | ------------------------------: | -----------------------------: | -------------------: | -----------: | -----------------: | ------: | -------: | -----: | ----------: | -------------------------------------: | ---------------: | -------------: | -------------: |
|       3 | base  |   5 |       42.3 (39.0–59.6) |       41.2 (38.0–63.0) |             1 |                3 |               3 |                 10 |                             0.0 |                            0.0 |                    0 |           94 |                  0 |     0.0 |        8 |      7 |     141,064 |                       52.7 (49.4–70.1) |    8.6 (5.5–9.3) |  4.9 (4.5–7.6) |  4.8 (3.8–5.2) |
|       3 | head  |   5 |       45.5 (38.4–58.8) |       43.5 (36.7–57.6) |             1 |                3 |               3 |                 10 |                             0.0 |                            0.0 |                    3 |           92 |                  0 |     0.0 |        8 |      7 |     138,192 |                       53.1 (45.0–68.4) |    5.6 (5.2–8.8) |  7.7 (5.4–9.5) | 5.1 (4.3–10.3) |
|     103 | base  |   5 |    148.6 (132.0–159.2) |    259.6 (235.2–274.0) |             1 |              103 |             103 |                110 |                             0.0 |                            0.0 |                    0 |        3,072 |                  0 |     0.5 |      676 |      7 |     158,956 |                    157.1 (139.7–169.8) |    6.2 (5.6–8.1) |  5.0 (4.8–7.1) |  4.7 (3.9–6.0) |
|     103 | head  |   5 |    146.1 (129.3–194.1) |    246.1 (230.7–317.4) |             1 |              103 |             103 |                110 |                             0.0 |                            0.0 |                  103 |        2,970 |                  0 |     0.5 |      676 |      7 |     158,940 |                    156.8 (135.8–203.5) |    7.1 (5.0–8.0) |  6.2 (5.8–9.6) |  5.8 (4.1–7.3) |
|     503 | base  |   5 |    625.2 (598.3–724.3) |    917.0 (876.8–990.2) |             1 |              503 |             503 |                510 |                             0.2 |                            0.2 |                    0 |       29,335 |                  0 |     7.3 |     4316 |     13 |     167,252 |                    634.1 (606.4–731.0) |    6.6 (5.4–7.2) |  4.7 (3.9–7.6) |  3.9 (3.0–8.2) |
|     503 | head  |   5 |    690.2 (625.4–913.2) |   958.5 (887.9–1202.4) |             1 |              503 |             503 |                510 |                             0.2 |                            0.2 |                  503 |       28,833 |                  0 |     7.3 |     4316 |     13 |     166,840 |                    701.2 (632.6–921.4) |    6.3 (5.7–8.5) |  4.3 (3.8–6.2) |  3.8 (3.2–6.9) |
|    2003 | base  |   5 | 3071.3 (2803.3–3418.7) | 3445.7 (3209.1–3915.9) |             1 |            2,003 |           2,003 |              2,010 |                             0.9 |                            0.9 |                    0 |      156,743 |                  2 |    42.9 |    20876 |     37 |     213,120 |                 3082.9 (2811.8–3430.1) |    9.3 (7.4–9.7) |  4.6 (3.3–5.8) |  4.0 (3.6–6.1) |
|    2003 | head  |   5 | 3152.3 (2920.8–3680.6) | 3632.2 (3280.0–4085.6) |             1 |            2,003 |           2,003 |              2,010 |                             0.9 |                            0.9 |                2,003 |      154,741 |                  2 |    42.9 |    20876 |     37 |     210,452 |                 3165.5 (2931.5–3694.4) |   9.2 (7.7–11.6) |  6.9 (4.4–8.5) |  5.0 (3.9–6.8) |
|    5003 | base  |   5 | 7839.5 (7783.2–8055.9) | 8439.6 (8368.4–8621.7) |             1 |            5,003 |           5,003 |              5,010 |                             2.3 |                            2.3 |                    0 |      448,267 |                  2 |   126.7 |    58287 |     85 |     293,500 |                 7855.7 (7801.6–8075.7) | 14.5 (13.4–17.6) | 5.3 (4.1–12.8) |  4.2 (3.6–6.5) |
|    5003 | head  |   5 | 7861.8 (7546.3–8409.9) | 8508.9 (8176.5–9011.4) |             1 |            5,003 |           5,003 |              5,010 |                             2.1 |                            2.3 |                5,003 |      443,265 |                  2 |   126.7 |    58287 |     85 |     296,628 |                 7876.8 (7560.9–8426.1) | 13.6 (13.0–22.7) |  4.8 (4.0–5.4) |  4.4 (3.5–5.5) |

**BASE ÷ HEAD (medians):**

| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |
| ------: | --------------: | -------------: | ------------: | ---------------: | --------------: | ----------------: | ---------: | -------: | --------------: |
|       3 |           0.93× |          0.95× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.02× |           0.99× |
|     103 |           1.02× |          1.05× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.00× |           1.00× |
|     503 |           0.91× |          0.96× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.00× |           0.90× |
|    2003 |           0.97× |          0.95× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.01× |           0.97× |
|    5003 |           1.00× |          0.99× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    0.99× |           1.00× |

## First open of an old-policy package with a fixed-size state whose history rewrites an EXISTING fact at the early position of the key order (adversarial for prefix reuse)

| entries | build |   n |             first open ms |         first open CPU ms | strict passes | entries replayed | groups verified | full-state digests | MB hashed by SHA-256 (physical) | MB the digests cover (logical) | prefix states copied | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) |        commit ms |      2nd open ms |      3rd open ms |
| ------: | ----- | --: | ------------------------: | ------------------------: | ------------: | ---------------: | --------------: | -----------------: | ------------------------------: | -----------------------------: | -------------------: | -----------: | -----------------: | ------: | -------: | -----: | ----------: | -------------------------------------: | ---------------: | ---------------: | ---------------: |
|    2000 | base  |   5 | 11474.9 (11112.0–11595.7) | 11839.9 (11401.6–11993.8) |             1 |            2,000 |           2,000 |              2,007 |                           598.6 |                          598.6 |                    0 |      156,585 |                  2 |    45.3 |    21181 |     37 |     263,240 |              11490.0 (11126.5–11615.1) | 13.5 (12.9–17.0) | 25.7 (24.1–42.8) | 27.0 (24.7–33.7) |
|    2000 | head  |   5 |    3621.4 (3568.1–3695.9) |    4041.4 (3982.3–4110.5) |             1 |            2,000 |           2,000 |              2,007 |                           519.1 |                          598.6 |               24,515 |      154,586 |                  2 |    45.3 |    21181 |     37 |     264,244 |                 3637.4 (3584.3–3712.4) | 14.3 (13.8–20.3) | 26.4 (24.7–41.4) | 26.1 (24.9–42.5) |

**BASE ÷ HEAD (medians):**

| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |
| ------: | --------------: | -------------: | ------------: | ---------------: | --------------: | ----------------: | ---------: | -------: | --------------: |
|    2000 |           3.17× |          2.93× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.00× |           3.16× |

## First open of an old-policy package with a fixed-size state whose history rewrites an EXISTING fact at the middle position of the key order (adversarial for prefix reuse)

| entries | build |   n |             first open ms |         first open CPU ms | strict passes | entries replayed | groups verified | full-state digests | MB hashed by SHA-256 (physical) | MB the digests cover (logical) | prefix states copied | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) |        commit ms |      2nd open ms |      3rd open ms |
| ------: | ----- | --: | ------------------------: | ------------------------: | ------------: | ---------------: | --------------: | -----------------: | ------------------------------: | -----------------------------: | -------------------: | -----------: | -----------------: | ------: | -------: | -----: | ----------: | -------------------------------------: | ---------------: | ---------------: | ---------------: |
|    2000 | base  |   5 | 11799.6 (11529.1–12036.2) | 12149.4 (11841.8–12373.9) |             1 |            2,000 |           2,000 |              2,007 |                           598.6 |                          598.6 |                    0 |      156,585 |                  2 |    45.3 |    21181 |     37 |     262,652 |              11817.3 (11546.3–12055.2) | 15.6 (14.4–16.7) | 27.3 (25.9–41.5) | 26.9 (25.1–37.3) |
|    2000 | head  |   5 |    3596.6 (3517.3–3731.6) |    4062.6 (3999.8–4200.1) |             1 |            2,000 |           2,000 |              2,007 |                           290.6 |                          598.6 |               14,015 |      154,586 |                  2 |    45.3 |    21181 |     37 |     263,112 |                 3613.7 (3532.5–3747.2) | 14.0 (13.2–16.0) | 25.8 (25.1–39.9) | 24.6 (22.9–41.7) |

**BASE ÷ HEAD (medians):**

| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |
| ------: | --------------: | -------------: | ------------: | ---------------: | --------------: | ----------------: | ---------: | -------: | --------------: |
|    2000 |           3.28× |          2.99× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.00× |           3.27× |

## First open of an old-policy package with a fixed-size state whose history rewrites an EXISTING fact at the late position of the key order (adversarial for prefix reuse)

| entries | build |   n |             first open ms |         first open CPU ms | strict passes | entries replayed | groups verified | full-state digests | MB hashed by SHA-256 (physical) | MB the digests cover (logical) | prefix states copied | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) |        commit ms |      2nd open ms |      3rd open ms |
| ------: | ----- | --: | ------------------------: | ------------------------: | ------------: | ---------------: | --------------: | -----------------: | ------------------------------: | -----------------------------: | -------------------: | -----------: | -----------------: | ------: | -------: | -----: | ----------: | -------------------------------------: | ---------------: | ---------------: | ---------------: |
|    2000 | base  |   5 | 11619.4 (11058.2–12554.3) | 11980.3 (11462.0–12907.5) |             1 |            2,000 |           2,000 |              2,007 |                           598.6 |                          598.6 |                    0 |      156,585 |                  2 |    45.3 |    21181 |     37 |     261,576 |              11635.8 (11078.4–12574.9) | 14.8 (13.4–18.7) | 24.7 (24.4–26.2) | 25.7 (24.3–28.8) |
|    2000 | head  |   5 |    3262.1 (3047.9–3397.2) |    3701.0 (3485.8–3851.2) |             1 |            2,000 |           2,000 |              2,007 |                            28.7 |                          598.6 |                2,015 |      154,586 |                  2 |    45.3 |    21181 |     37 |     259,024 |                 3276.9 (3063.9–3414.0) | 14.5 (13.4–15.1) | 26.8 (24.4–42.9) | 26.8 (24.0–37.3) |

**BASE ÷ HEAD (medians):**

| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |
| ------: | --------------: | -------------: | ------------: | ---------------: | --------------: | ----------------: | ---------: | -------: | --------------: |
|    2000 |           3.56× |          3.24× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.01× |           3.55× |

## First open of an old-policy package with a fixed-size state whose history rewrites an EXISTING fact at the rotate position of the key order (adversarial for prefix reuse)

| entries | build |   n |             first open ms |         first open CPU ms | strict passes | entries replayed | groups verified | full-state digests | MB hashed by SHA-256 (physical) | MB the digests cover (logical) | prefix states copied | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) |        commit ms |      2nd open ms |      3rd open ms |
| ------: | ----- | --: | ------------------------: | ------------------------: | ------------: | ---------------: | --------------: | -----------------: | ------------------------------: | -----------------------------: | -------------------: | -----------: | -----------------: | ------: | -------: | -----: | ----------: | -------------------------------------: | ---------------: | ---------------: | ---------------: |
|    2000 | base  |   5 | 11608.3 (11258.6–11827.0) | 11937.5 (11690.1–12156.5) |             1 |            2,000 |           2,000 |              2,007 |                           600.3 |                          600.3 |                    0 |      156,585 |                  2 |    45.3 |    21183 |     37 |     264,316 |              11624.6 (11275.0–11842.4) | 14.5 (13.7–19.7) | 25.0 (22.9–27.0) | 26.6 (25.0–28.2) |
|    2000 | head  |   5 |    3389.2 (3270.2–3588.1) |    3915.5 (3775.6–4036.9) |             1 |            2,000 |           2,000 |              2,007 |                           280.8 |                          600.3 |               13,535 |      154,586 |                  2 |    45.3 |    21183 |     37 |     262,260 |                 3405.7 (3285.8–3604.1) | 14.3 (14.1–14.7) | 24.2 (22.8–25.9) | 23.9 (23.0–28.3) |

**BASE ÷ HEAD (medians):**

| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |
| ------: | --------------: | -------------: | ------------: | ---------------: | --------------: | ----------------: | ---------: | -------: | --------------: |
|    2000 |           3.43× |          3.05× |         1.00× |            1.00× |           1.00× |             1.00× |      1.00× |    1.01× |           3.41× |

## Ordinary open and commit, canonical package (matched policy)

The policy already matches this build: the ordinary path, which this change must not regress.

| entries | build |   n |                  open ms | groups verified |           commit ms |             2nd open ms | peak RSS kB |
| ------: | ----- | --: | -----------------------: | --------------: | ------------------: | ----------------------: | ----------: |
|       3 | base  |   5 |         39.6 (37.3–41.9) |               3 |     11.4 (6.9–13.4) |         12.1 (7.9–14.2) |     139,900 |
|       3 | head  |   5 |         39.0 (36.3–41.1) |               3 |      9.0 (8.2–11.0) |         11.3 (7.5–18.1) |     138,480 |
|     103 | base  |   5 |      375.1 (360.2–399.8) |             103 |    14.1 (12.5–16.5) |     336.3 (321.4–349.8) |     167,684 |
|     103 | head  |   5 |      157.8 (154.5–188.7) |             103 |    12.5 (12.1–13.9) |       98.5 (95.4–106.7) |     162,892 |
|     503 | base  |   5 |   3131.5 (3066.6–3247.9) |             119 |    35.5 (34.0–46.6) |  3019.7 (2985.4–3348.3) |     266,896 |
|     503 | head  |   5 |      839.3 (810.0–996.7) |             119 |    37.8 (34.8–44.6) |     694.6 (628.3–742.8) |     173,620 |
|    2003 | base  |   5 | 10192.7 (9945.8–11860.9) |              83 | 119.2 (106.4–126.8) | 9844.1 (9642.5–10212.3) |     448,836 |
|    2003 | head  |   5 |   2578.2 (2555.9–2768.0) |              83 | 132.8 (113.8–135.6) |  2400.0 (2192.4–2549.5) |     316,820 |

## Ordinary open and commit, one-fact package (matched policy)

The policy already matches this build: the ordinary path, which this change must not regress.

| entries | build |   n |             open ms | groups verified |        commit ms |       2nd open ms | peak RSS kB |
| ------: | ----- | --: | ------------------: | --------------: | ---------------: | ----------------: | ----------: |
|       3 | base  |   5 |    23.4 (22.3–36.6) |               3 |    5.8 (4.5–7.7) |    6.3 (5.1–15.5) |     137,648 |
|       3 | head  |   5 |    28.1 (20.3–32.9) |               3 |    5.4 (4.6–7.1) |     6.4 (6.0–7.8) |     135,872 |
|     103 | base  |   5 |    65.5 (60.9–97.0) |             103 |    6.2 (5.5–7.2) |  29.9 (24.6–36.0) |     156,768 |
|     103 | head  |   5 |    74.3 (60.0–83.4) |             103 |    5.5 (4.7–6.5) |  37.0 (25.5–41.3) |     156,732 |
|     503 | base  |   5 | 142.1 (136.6–160.7) |             119 | 16.8 (13.6–17.0) |  81.9 (70.2–82.8) |     159,788 |
|     503 | head  |   5 | 167.2 (136.6–210.9) |             119 | 16.0 (15.1–17.6) | 81.0 (79.4–142.2) |     157,096 |
|    2003 | base  |   5 | 131.2 (127.2–195.1) |              83 | 17.5 (10.5–27.7) |  75.0 (67.0–78.7) |     157,892 |
|    2003 | head  |   5 | 130.4 (122.6–173.8) |              83 |  10.5 (9.4–18.7) | 75.9 (66.8–101.7) |     157,404 |
|    5003 | base  |   5 |    45.7 (44.4–53.2) |              11 | 14.1 (12.7–15.1) |  22.5 (21.4–23.6) |     145,336 |
|    5003 | head  |   5 |    46.1 (44.8–55.2) |              11 | 14.0 (13.4–14.5) |  17.6 (16.6–20.3) |     147,336 |

## Ordinary open and commit, early-rewrite package (matched policy)

The policy already matches this build: the ordinary path, which this change must not regress.

| entries | build |   n |             open ms | groups verified |        commit ms |         2nd open ms | peak RSS kB |
| ------: | ----- | --: | ------------------: | --------------: | ---------------: | ------------------: | ----------: |
|    2000 | base  |   5 | 525.1 (480.0–545.2) |              80 | 22.4 (22.3–26.9) | 460.3 (442.2–554.9) |     162,896 |
|    2000 | head  |   5 | 185.0 (177.8–191.4) |              80 | 24.1 (20.5–31.7) | 122.1 (113.3–125.7) |     160,428 |

## Ordinary open and commit, middle-rewrite package (matched policy)

The policy already matches this build: the ordinary path, which this change must not regress.

| entries | build |   n |             open ms | groups verified |        commit ms |         2nd open ms | peak RSS kB |
| ------: | ----- | --: | ------------------: | --------------: | ---------------: | ------------------: | ----------: |
|    2000 | base  |   5 | 538.6 (503.3–630.6) |              80 | 24.0 (21.5–27.7) | 474.1 (457.4–508.1) |     162,756 |
|    2000 | head  |   5 | 175.3 (160.5–252.3) |              80 | 21.7 (17.8–26.9) | 117.2 (105.3–128.3) |     161,800 |

## Ordinary open and commit, late-rewrite package (matched policy)

The policy already matches this build: the ordinary path, which this change must not regress.

| entries | build |   n |             open ms | groups verified |        commit ms |         2nd open ms | peak RSS kB |
| ------: | ----- | --: | ------------------: | --------------: | ---------------: | ------------------: | ----------: |
|    2000 | base  |   5 | 537.6 (504.1–653.4) |              80 | 23.6 (20.4–27.5) | 478.5 (452.2–546.2) |     163,932 |
|    2000 | head  |   5 | 162.8 (144.5–183.8) |              80 | 23.3 (22.0–28.2) |   98.4 (96.7–128.1) |     159,548 |

## Ordinary open and commit, rotate-rewrite package (matched policy)

The policy already matches this build: the ordinary path, which this change must not regress.

| entries | build |   n |             open ms | groups verified |        commit ms |         2nd open ms | peak RSS kB |
| ------: | ----- | --: | ------------------: | --------------: | ---------------: | ------------------: | ----------: |
|    2000 | base  |   5 | 528.8 (499.7–535.2) |              80 | 23.6 (21.8–28.1) | 490.8 (464.8–509.4) |     161,888 |
|    2000 | head  |   5 | 172.5 (156.6–231.4) |              80 | 23.7 (22.6–32.8) | 112.6 (103.6–156.0) |     159,864 |

## Crash before the manifest publication, then the recovery open

The first open is killed just before the manifest rename (successor files exist, the old manifest is authoritative); the recovery open is a fresh open under the new policy. HEAD only where the BASE cost is unbounded for a repeated crash fixture.

| series       | entries | build |   n |      killed first open ms |           recovery open ms | recovery strict passes | recovery entries replayed | policy after kill                                                         | policy after recovery                                                                                                                                                                                                                                  |
| ------------ | ------: | ----- | --: | ------------------------: | -------------------------: | ---------------------: | ------------------------: | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| canonical    |       3 | base  |   5 |          55.4 (52.6–58.8) |           23.0 (22.0–29.6) |                      1 |                         3 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical    |       3 | head  |   5 |          60.7 (55.8–81.5) |           26.0 (25.1–38.6) |                      1 |                         3 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical    |     103 | base  |   5 |       484.5 (444.9–502.2) |        519.8 (469.0–555.2) |                      1 |                       103 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical    |     103 | head  |   5 |       262.5 (251.1–290.6) |        304.3 (258.2–334.6) |                      1 |                       103 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical    |     503 | base  |   5 |    6324.7 (5947.6–6634.8) |     6639.6 (6319.6–6744.1) |                      1 |                       503 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical    |     503 | head  |   5 |    1370.1 (1292.9–1380.3) |     1656.5 (1543.5–1672.3) |                      1 |                       503 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical    |    2003 | base  |   2 | 95751.9 (93655.5–97848.2) | 99509.9 (97442.2–101577.5) |                      1 |                     2,003 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| canonical    |    2003 | head  |   2 |    8610.9 (8509.7–8712.1) |  10293.4 (10119.9–10466.9) |                      1 |                     2,003 | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z | R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+LEGACY-PRE-V9-RUNTIME-CONTRACT |
| store        |       3 | base  |   5 |          39.4 (36.5–60.5) |           24.6 (21.3–31.2) |                      1 |                         3 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| store        |       3 | head  |   5 |          46.8 (36.7–49.2) |           19.5 (16.9–20.2) |                      1 |                         3 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| store        |     103 | base  |   5 |       160.5 (125.6–180.6) |          72.8 (69.1–112.8) |                      1 |                       103 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| store        |     103 | head  |   5 |       136.1 (130.7–199.4) |           74.8 (65.9–81.5) |                      1 |                       103 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| store        |     503 | base  |   5 |       647.9 (591.4–767.5) |        561.0 (532.6–709.3) |                      1 |                       503 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| store        |     503 | head  |   5 |       662.7 (599.0–772.4) |        540.0 (523.4–625.4) |                      1 |                       503 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| store        |    2003 | base  |   5 |    3175.2 (2811.3–3331.9) |     3086.0 (2631.0–3145.2) |                      1 |                     2,003 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| store        |    2003 | head  |   5 |    3108.9 (2848.3–3321.2) |     2913.4 (2666.0–2952.8) |                      1 |                     2,003 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| store        |    5003 | base  |   5 |    8858.1 (8232.7–9724.7) |     8714.9 (8343.0–9503.0) |                      1 |                     5,003 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| store        |    5003 | head  |   5 |    9178.3 (8098.6–9646.9) |     8829.4 (8551.4–8919.8) |                      1 |                     5,003 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| shape-early  |    2000 | base  |   5 | 11581.3 (11072.1–12760.2) |  11592.5 (10842.5–12038.0) |                      1 |                     2,000 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| shape-early  |    2000 | head  |   5 |    3617.1 (3485.7–3813.3) |     3639.6 (3388.7–3675.8) |                      1 |                     2,000 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| shape-middle |    2000 | base  |   5 | 11437.1 (10870.0–12270.8) |  11342.0 (11102.3–11900.9) |                      1 |                     2,000 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| shape-middle |    2000 | head  |   5 |    3328.3 (3204.6–3408.1) |     3239.3 (3111.1–3414.3) |                      1 |                     2,000 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| shape-late   |    2000 | base  |   5 | 11175.7 (10932.5–11347.1) |  11136.4 (11045.2–11478.9) |                      1 |                     2,000 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| shape-late   |    2000 | head  |   5 |    3084.8 (2971.9–3266.5) |     3095.3 (2988.8–3204.4) |                      1 |                     2,000 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| shape-rotate |    2000 | base  |   5 | 11331.8 (10375.4–11655.3) |  11032.8 (10541.2–11427.4) |                      1 |                     2,000 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |
| shape-rotate |    2000 | head  |   5 |    3305.3 (3153.5–3540.9) |     3331.5 (3082.5–3574.6) |                      1 |                     2,000 | h07-s3-old-policy                                                         | h07-s3-new-policy                                                                                                                                                                                                                                      |

## Where the first open of a canonical old-policy package spends its time (inspector profile, inclusive ms; the profiler perturbs timing)

| entries | build | profiled ms | GC ms | replay | stateSha256 (all calls, incl. the replay hook) | of which the incremental digest | canonicalJson | owner validation (verifyAll) | loadCheckpoint | reconcileCheckpointStates | proveSuccessor | index extend | index lookup |
| ------: | ----- | ----------: | ----: | -----: | ---------------------------------------------: | ------------------------------: | ------------: | ---------------------------: | -------------: | ------------------------: | -------------: | -----------: | -----------: |
|     103 | base  |         666 |    44 |    312 |                                            263 |                               0 |           278 |                          120 |            462 |                         0 |             11 |           20 |           31 |
|     103 | head  |         431 |    22 |     69 |                                             29 |                               9 |           110 |                          152 |            230 |                         0 |             13 |           22 |           47 |
|     503 | base  |        6811 |   508 |   4975 |                                           4818 |                               0 |          4166 |                          503 |           5803 |                         0 |             51 |          165 |          354 |
|     503 | head  |        1879 |   139 |    333 |                                            239 |                             109 |           512 |                          529 |           1185 |                         0 |             65 |          175 |          380 |
|    2003 | base  |       99207 | 11325 |  81647 |                                          80689 |                               0 |         65112 |                         2195 |          85796 |                         0 |            234 |         1063 |         1938 |
|    2003 | head  |       10363 |   642 |   3616 |                                           3177 |                            2520 |          2357 |                         2247 |           7603 |                         0 |            237 |          986 |         1806 |

## What the first open serialises, sorts, copies and encodes (untimed instrumented pass, one per build)

The instrumentation (JSON.stringify and Array.prototype.sort wrappers, a Map constructor proxy, Buffer.from) perturbs timing, so these counts are never mixed with the timed samples. "Large" means 64 or more elements. State-sized Map copies are `new Map(state.facts)`, one per replayed entry on both builds.

| series       | entries | build | JSON.stringify calls | JSON.stringify chars (M) | large sorts | elements sorted (M) | state-sized Map copies | entries copied (M) | Buffer.from(string) calls | bytes encoded (MB) | full-state digests | MB hashed (physical) | MB covered (logical) | prefix states copied |
| ------------ | ------: | ----- | -------------------: | -----------------------: | ----------: | ------------------: | ---------------------: | -----------------: | ------------------------: | -----------------: | -----------------: | -------------------: | -------------------: | -------------------: |
| canonical    |     103 | base  |              680,120 |                     25.9 |          96 |                0.01 |                     39 |               0.00 |                         4 |                1.0 |                110 |                 18.9 |                 18.9 |                    0 |
| canonical    |     103 | head  |              276,164 |                      9.8 |          56 |                0.01 |                     39 |               0.00 |                       107 |                1.3 |                110 |                  8.1 |                 18.9 |                  115 |
| canonical    |     503 | base  |           11,582,414 |                    453.6 |         498 |                0.15 |                    439 |               0.12 |                         7 |                6.0 |                510 |                426.6 |                426.6 |                    0 |
| canonical    |     503 | head  |            1,763,258 |                     57.2 |          58 |                0.03 |                    439 |               0.12 |                       510 |                7.6 |                510 |                140.4 |                426.6 |                1,479 |
| canonical    |    2003 | base  |          164,476,798 |                   6576.1 |        1998 |                2.12 |                   1939 |               2.00 |                        19 |               27.5 |               2010 |               6658.3 |               6658.3 |                    0 |
| canonical    |    2003 | head  |            8,200,642 |                    252.6 |          58 |                0.12 |                   1939 |               2.00 |                     2,022 |               34.1 |               2010 |               3411.4 |               6658.3 |               32,874 |
| shape-early  |    2000 | base  |           37,434,116 |                    638.4 |        1945 |                0.88 |                   1936 |               0.87 |                        19 |               21.2 |               2007 |                598.6 |                598.6 |                    0 |
| shape-early  |    2000 | head  |            5,115,867 |                     93.4 |           8 |                0.00 |                   1936 |               0.87 |                     2,019 |               22.6 |               2007 |                519.1 |                598.6 |               24,515 |
| shape-late   |    2000 | base  |           37,434,116 |                    638.4 |        1945 |                0.88 |                   1936 |               0.87 |                        19 |               21.2 |               2007 |                598.6 |                598.6 |                    0 |
| shape-late   |    2000 | head  |            5,115,867 |                     93.4 |           8 |                0.00 |                   1936 |               0.87 |                     2,019 |               22.6 |               2007 |                 28.7 |                598.6 |                2,015 |
| shape-middle |    2000 | base  |           37,434,116 |                    638.4 |        1945 |                0.88 |                   1936 |               0.87 |                        19 |               21.2 |               2007 |                598.6 |                598.6 |                    0 |
| shape-middle |    2000 | head  |            5,115,867 |                     93.4 |           8 |                0.00 |                   1936 |               0.87 |                     2,019 |               22.6 |               2007 |                290.6 |                598.6 |               14,015 |
| shape-rotate |    2000 | base  |           37,434,116 |                    640.1 |        1945 |                0.88 |                   1936 |               0.87 |                        19 |               21.2 |               2007 |                600.3 |                600.3 |                    0 |
| shape-rotate |    2000 | head  |            5,115,867 |                     93.4 |           8 |                0.00 |                   1936 |               0.87 |                     2,019 |               22.5 |               2007 |                280.8 |                600.3 |               13,535 |
| store        |    2003 | base  |            4,946,207 |                     87.8 |           0 |                0.00 |                      0 |               0.00 |                        19 |               20.9 |               2010 |                  0.9 |                  0.9 |                    0 |
| store        |    2003 | head  |            4,938,196 |                     87.7 |           0 |                0.00 |                      0 |               0.00 |                     2,022 |               21.7 |               2010 |                  0.9 |                  0.9 |                2,003 |

## Identical canonical outcome (BASE versus HEAD, every measured sample)

| kind        | series       | variant | entries |        samples | distinct outcome digests | identical |
| ----------- | ------------ | ------- | ------: | -------------: | -----------------------: | --------- |
| interrupted | canonical    | old     |     103 | 12 (base+head) |                        1 | yes       |
| interrupted | canonical    | old     |    2003 |  4 (base+head) |                        1 | yes       |
| interrupted | canonical    | old     |       3 | 12 (base+head) |                        1 | yes       |
| interrupted | canonical    | old     |     503 | 12 (base+head) |                        1 | yes       |
| interrupted | shape-early  | old     |    2000 | 12 (base+head) |                        1 | yes       |
| interrupted | shape-late   | old     |    2000 | 12 (base+head) |                        1 | yes       |
| interrupted | shape-middle | old     |    2000 | 12 (base+head) |                        1 | yes       |
| interrupted | shape-rotate | old     |    2000 | 12 (base+head) |                        1 | yes       |
| interrupted | store        | old     |     103 | 12 (base+head) |                        1 | yes       |
| interrupted | store        | old     |    2003 | 12 (base+head) |                        1 | yes       |
| interrupted | store        | old     |       3 | 12 (base+head) |                        1 | yes       |
| interrupted | store        | old     |    5003 | 12 (base+head) |                        1 | yes       |
| interrupted | store        | old     |     503 | 12 (base+head) |                        1 | yes       |
| sample      | canonical    | native  |     103 | 12 (base+head) |                        1 | yes       |
| sample      | canonical    | native  |    2003 | 12 (base+head) |                        1 | yes       |
| sample      | canonical    | native  |       3 | 12 (base+head) |                        1 | yes       |
| sample      | canonical    | native  |     503 | 12 (base+head) |                        1 | yes       |
| sample      | canonical    | old     |     103 | 12 (base+head) |                        1 | yes       |
| sample      | canonical    | old     |    2003 | 10 (base+head) |                        1 | yes       |
| sample      | canonical    | old     |       3 | 12 (base+head) |                        1 | yes       |
| sample      | canonical    | old     |     503 | 12 (base+head) |                        1 | yes       |
| sample      | shape-early  | native  |    2000 | 12 (base+head) |                        1 | yes       |
| sample      | shape-early  | old     |    2000 | 12 (base+head) |                        1 | yes       |
| sample      | shape-late   | native  |    2000 | 12 (base+head) |                        1 | yes       |
| sample      | shape-late   | old     |    2000 | 12 (base+head) |                        1 | yes       |
| sample      | shape-middle | native  |    2000 | 12 (base+head) |                        1 | yes       |
| sample      | shape-middle | old     |    2000 | 12 (base+head) |                        1 | yes       |
| sample      | shape-rotate | native  |    2000 | 12 (base+head) |                        1 | yes       |
| sample      | shape-rotate | old     |    2000 | 12 (base+head) |                        1 | yes       |
| sample      | store        | native  |     103 | 12 (base+head) |                        1 | yes       |
| sample      | store        | native  |    2003 | 12 (base+head) |                        1 | yes       |
| sample      | store        | native  |       3 | 12 (base+head) |                        1 | yes       |
| sample      | store        | native  |    5003 | 12 (base+head) |                        1 | yes       |
| sample      | store        | native  |     503 | 12 (base+head) |                        1 | yes       |
| sample      | store        | old     |     103 | 12 (base+head) |                        1 | yes       |
| sample      | store        | old     |    2003 | 12 (base+head) |                        1 | yes       |
| sample      | store        | old     |       3 | 12 (base+head) |                        1 | yes       |
| sample      | store        | old     |    5003 | 12 (base+head) |                        1 | yes       |
| sample      | store        | old     |     503 | 12 (base+head) |                        1 | yes       |

All compared outcomes identical: **yes**.
