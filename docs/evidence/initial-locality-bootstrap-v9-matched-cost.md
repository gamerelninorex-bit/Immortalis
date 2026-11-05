# Initial Locality Bootstrap v0.9 — matched cost evidence (T1 mechanism only, OB-030)

Produced by the reusable `tools/bootstrap-benchmark.sh` (and `tools/bootstrap-compare.ts`) on the **final C-1/C-2/legacy-policy code head** `13b92adeda8cea4fdae6f0148c3fe6f925fe8d51`; exact base `eafbb127c476cafb8498316e496de29e078a2146`. Later commits on this branch change documentation and evidence only (verify with `git diff 13b92ad..HEAD -- packages apps tools spec`). The earlier head `65cfe985…` measured by the previous version of this file does **not** certify this head; its figures are not reused here.

Environment: Node v22.23.4, linux x64 6.18.44-fc-v236, Intel Xeon @ 2.80 GHz, 5 fresh-process samples per cell (3 for the attribution table). This machine is about 1.5× slower than the one used for the earlier head (the base's own 2,003-entry cold open is 16.3 s here against 10.7 s there), so absolute figures differ from the earlier file; compare columns within this file. H-07 was skipped in CI and supplies no acceptance here. No SLA is invented; the figures describe this fixture and runtime only.

**Raw data retained** in `initial-locality-bootstrap-v9-matched-cost-raw/`: one JSON per fresh-process sample (`raw/`), the reduced `summary.json` and `report.md`, and the attribution samples (`attribution/`). The fixtures (up to ~34 MB each) are not committed; the script rebuilds them (`seed`), so `BOOTSTRAP_EXACT_SHA=<head> bash tools/bootstrap-benchmark.sh` reproduces the run.

Columns: **before** = base code on a base-built fixture; **after, old id** = head code on the SAME base-built fixture — that package carries the pre-v0.9 Runtime Contract hash, so this build opens it under the **legacy admission** with its own history-verification identity, i.e. this is the first forced replay of an old journal under the final policy; **after, native** = head code on a head-built fixture (a campaign with no bootstrap record).

| journal entries | variant      |                 cold open ms |                  cold CPU ms | cold read bytes | cold groups verified |              warm open ms | warm groups verified |  ordinary commit ms | peak RSS kB |
| --------------: | ------------ | ---------------------------: | ---------------------------: | --------------: | -------------------: | ------------------------: | -------------------: | ------------------: | ----------: |
|               3 | before       |             58.3 (57.3–61.0) |             59.4 (57.7–61.5) |           15406 |                    3 |          11.9 (10.9–16.3) |                    3 |    11.8 (11.1–16.2) |      137460 |
|               3 | after-oldid  |          126.6 (107.1–166.0) |          165.4 (141.3–207.0) |          108597 |                   12 |          12.6 (12.0–13.9) |                    0 |    31.5 (14.4–37.4) |      152004 |
|               3 | after-native |             63.6 (55.8–79.8) |             64.4 (58.1–84.2) |           15548 |                    3 |          16.5 (14.6–18.6) |                    3 |    10.8 (10.0–17.9) |      144356 |
|             103 | before       |          602.2 (568.2–611.6) |          760.8 (721.4–772.5) |          698537 |                  103 |       542.1 (472.0–565.7) |                  103 |    18.1 (17.2–21.0) |      165684 |
|             103 | after-oldid  |       2430.6 (2370.1–2697.7) |       2760.9 (2669.6–3020.4) |         5089926 |                  412 |       158.8 (146.8–195.6) |                    0 |    22.8 (21.1–26.2) |      173100 |
|             103 | after-native |          621.7 (600.3–631.2) |          784.9 (754.0–804.7) |          698679 |                  103 |       515.9 (505.0–539.7) |                  103 |    20.6 (18.1–24.0) |      166236 |
|             503 | before       |       5138.1 (4924.6–5375.4) |       5567.7 (5305.5–5777.1) |         9520440 |                  119 |    4778.4 (4629.9–5007.9) |                  119 |    52.3 (51.3–60.4) |      334452 |
|             503 | after-oldid  |    41249.9 (40914.5–41736.6) |    42132.2 (42023.7–42726.2) |        35642871 |                 2012 |       736.5 (704.0–821.9) |                    0 |    49.0 (45.8–76.7) |      390364 |
|             503 | after-native |       5102.2 (4852.0–5240.6) |       5505.7 (5351.9–5660.4) |         9520582 |                  119 |    4892.0 (4666.4–5002.2) |                  119 |    54.7 (54.2–63.3) |      333316 |
|            2003 | before       |    16279.5 (16067.4–16585.0) |    18485.1 (18270.5–18802.2) |        33769960 |                   83 | 16046.1 (15702.9–16136.2) |                   83 | 196.8 (168.8–200.2) |      559964 |
|            2003 | after-oldid  | 631361.7 (626871.7–663811.0) | 703058.0 (696836.1–739264.8) |       167407849 |                 8012 |    3217.5 (3121.1–3430.9) |                    0 | 159.6 (148.9–205.2) |      858992 |
|            2003 | after-native |    16603.9 (16106.6–16658.4) |    18548.0 (18026.0–18665.5) |        33770102 |                   83 | 15509.4 (15219.6–15719.1) |                   83 | 192.0 (185.0–220.0) |      501700 |

## Option A presence-guard scan (head only)

| facts in prefix | first call ms (kinds not yet cached) | steady-state ms per call |
| --------------: | -----------------------------------: | -----------------------: |
|             111 |                                2.322 |                    0.317 |
|            1011 |                               14.811 |                    0.641 |
|           10011 |                               53.707 |                    1.982 |

The guard visits every fact of the actual prefix at each dependent admission. It runs at collection-work enrollment and at the two projection writes, never per ordinary action.

## Attribution: the expensive first open is the existing mechanism, not added overhead

`historyVerificationId` is one global identity, so changing it (required by the brief) makes every campaign opened under the new policy replay strictly on its first open. To separate that from anything this change adds, the UNCHANGED BASE build was forced into the same full replay (`BOOTSTRAP_FORCE_REPLAY=1` changes only its history verification identity; same fixture, fresh process, 3 samples, this machine):

| journal entries | base, forced full replay: cold open ms (median) | head, first open of the same fixture (median of 5) | groups verified (both) |    read bytes |
| --------------: | ----------------------------------------------: | -------------------------------------------------: | ---------------------: | ------------: |
|             103 |                                           2,648 |                                              2,431 |                    412 | about 5.09 MB |
|             503 |                                          42,649 |                                             41,250 |                  2,012 | about 35.6 MB |

The head's first open is in the same band as the base doing the same work, with the same number of groups verified. The cost is the existing strict-replay and checkpoint-rebuild path, which verifies each group about four times and grows faster than linearly with history; this change neither adds to it nor removes it. (The 2,003-entry base-forced replay was not repeated on this head; the 503-entry pair already shows the same ratio.)

## What the measurements say

- **Campaign with no bootstrap record (head-built, native):** cold open, warm reopen, ordinary commit and peak RSS are within run-to-run noise of the base at every size (2,003 entries: cold 16.6 s against 16.3 s, warm 15.5 s against 16.0 s, ordinary commit 192 ms against 197 ms, peak RSS 502 MB against 560 MB). The ordinary commit makes the same single admission call in both builds (the v0.9 freeze is a key-space prefilter inside it that returns before any scan).
- **First open of an old journal under the final policy (legacy admission):** one-time per campaign, large and super-linear: 2.4 s at 103 entries, 41.2 s at 503, **631 s (about 10.5 minutes) at 2,003 entries with a peak RSS of about 859 MB**, against 0.6 s, 5.1 s and 16.3 s from checkpoint evidence on this machine. Afterwards a reopen is cheaper than before (warm 0.16 s, 0.74 s, 3.2 s against 0.54 s, 4.8 s, 16.0 s) because the rebuilt evidence is then reused. This is the same shape as the earlier head's 419 s / 878 MB, scaled by this machine's slowness.
- **Not measured here:** opening a bootstrap-bearing journal (it needs the testkit fixture admission, which tools/ must not import; its strict replay is exercised functionally by `tests/integration/initial-setup-witness.test.ts`); recovery and interruption cost (exercised functionally by the recovery tests, not timed); genuine model, host or client latency (T2/T3, UNRUN); retained live storage.
- **Revisit trigger (OB-030):** the first-open replay cost at long history is a measured, unacceptable-at-scale figure for a live campaign and requires a separately reviewed persistence mitigation before any live campaign is opened under this identity. Staged or incremental re-verification must preserve owner checks and continuity and include interruption/recovery evidence. Whitelisting the prior history verification identity or reusing its checkpoint evidence is not authorized. This persistence redesign is explicitly not bundled here; H-07 remains unaccepted.
