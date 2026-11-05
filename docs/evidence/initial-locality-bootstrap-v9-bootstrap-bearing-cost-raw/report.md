# Initial Locality Bootstrap v0.9 — bootstrap-bearing versus non-bootstrap cost and recovery (T1 mechanism only)

head `20db7eefb1224c93b14d08bcb21086811dd1f928` only (the base has no bootstrap route); v22.23.4 on linux x64 6.18.44-fc-v236; Intel(R) Xeon(R) Processor @ 2.80GHz; 5 fresh-process samples per cell. Both columns run under the SAME test-only fixture admission, same code, same runtime and the same journal length: **no-bootstrap** is a campaign with no bootstrap record; **bootstrap-bearing** carries a real intake → SCOPE → Grant → SCENE → Completion (8 journal entries).

| ordinary entries after setup | variant           | journal entries |              cold open ms |               cold CPU ms | cold read bytes | cold groups verified |              warm open ms | warm groups verified |  ordinary commit ms |                  peak RSS kB |
| ---------------------------: | ----------------- | --------------: | ------------------------: | ------------------------: | --------------: | -------------------: | ------------------------: | -------------------: | ------------------: | ---------------------------: |
|                            0 | no-bootstrap      |              11 |         91.6 (83.4–116.8) |       140.5 (128.0–150.9) |           70338 |                   11 |          36.9 (32.5–42.5) |                   11 |    24.4 (19.6–25.9) | 156340.0 (155244.0–158556.0) |
|                            0 | bootstrap-bearing |              11 |       156.6 (135.6–177.7) |       218.7 (199.4–228.2) |           77057 |                   11 |          50.3 (46.8–56.9) |                   11 |    12.8 (11.3–16.2) | 155460.0 (155152.0–157908.0) |
|                          100 | no-bootstrap      |             111 |       733.8 (695.4–883.6) |      938.3 (877.2–1033.0) |          754767 |                  111 |       668.9 (584.7–747.4) |                  111 |    26.5 (19.1–29.8) | 167928.0 (162804.0–170388.0) |
|                          100 | bootstrap-bearing |             111 |       847.4 (774.2–932.4) |      989.1 (981.2–1105.9) |          761414 |                  111 |       687.8 (673.6–737.6) |                  111 |    23.4 (20.9–29.7) | 170520.0 (168540.0–171792.0) |
|                          500 | no-bootstrap      |             511 |    6064.6 (5671.0–6381.4) |    6577.7 (6176.2–6814.4) |         9781137 |                  127 |    5837.3 (5284.9–6085.5) |                  127 | 236.7 (234.5–264.1) | 334776.0 (332472.0–335892.0) |
|                          500 | bootstrap-bearing |             511 |    6164.0 (5718.8–6760.0) |    6659.0 (6204.1–7196.0) |         9814467 |                  127 |    5858.0 (5473.4–6733.9) |                  127 | 250.8 (235.2–266.2) | 334284.0 (328968.0–336664.0) |
|                         2000 | no-bootstrap      |            2011 | 20409.2 (18458.9–20881.9) | 22619.3 (20601.3–23112.0) |        34084304 |                   91 | 18475.2 (18038.6–18621.8) |                   91 | 212.9 (186.8–252.0) | 508064.0 (498920.0–526068.0) |
|                         2000 | bootstrap-bearing |            2011 | 18747.1 (18562.1–20277.9) | 20960.9 (20807.8–22594.3) |        34118410 |                   91 | 18673.1 (17375.7–19207.7) |                   91 | 208.0 (154.2–376.9) | 502652.0 (498304.0–509980.0) |

## Open after a torn journal tail (a crash mid-append)

| ordinary entries after setup | variant           | torn tail reported (bytes) |                   open ms |               open CPU ms | read bytes |                  peak RSS kB |
| ---------------------------: | ----------------- | -------------------------: | ------------------------: | ------------------------: | ---------: | ---------------------------: |
|                            0 | no-bootstrap      |                         43 |        105.8 (84.7–144.3) |       142.8 (123.8–194.8) |      70436 | 146988.0 (143032.0–148348.0) |
|                            0 | bootstrap-bearing |                         43 |       157.5 (145.2–195.4) |       229.4 (211.4–255.9) |      77155 | 154708.0 (147568.0–157380.0) |
|                          100 | no-bootstrap      |                         43 |       700.9 (690.8–783.2) |       899.6 (874.3–980.7) |     754865 | 167716.0 (165276.0–168928.0) |
|                          100 | bootstrap-bearing |                         43 |       848.6 (805.2–905.0) |     1046.7 (993.1–1074.2) |     761512 | 169484.0 (161984.0–169732.0) |
|                          500 | no-bootstrap      |                         43 |    6209.9 (6049.7–6470.2) |    6690.7 (6550.9–6871.8) |    9781235 | 268872.0 (265292.0–302456.0) |
|                          500 | bootstrap-bearing |                         43 |    6076.4 (5784.1–6793.3) |    6560.2 (6239.0–7262.4) |    9814565 | 297448.0 (267812.0–299064.0) |
|                         2000 | no-bootstrap      |                         43 | 19161.1 (17678.1–20232.8) | 21296.5 (19751.6–22531.0) |   34084402 | 447876.0 (444092.0–449736.0) |
|                         2000 | bootstrap-bearing |                         43 | 19473.8 (18504.9–20058.8) | 21720.6 (20682.4–22418.4) |   34118508 | 448276.0 (447196.0–450360.0) |

## Bootstrap crash recovery: restart the service over a SCOPE send window left open by a crash and resume

Recover-or-park, never a second driver call. Journal entries at restart: 5; status after resume: `SCOPE_RESERVED_UNRESOLVED`; driver calls: 0, 0, 0, 0, 0 (must all be 0).

|        resume ms |    resume CPU ms | read bytes | write bytes |                  peak RSS kB |
| ---------------: | ---------------: | ---------: | ----------: | ---------------------------: |
| 31.4 (26.9–35.9) | 79.6 (73.8–96.8) |          0 |         403 | 158380.0 (153508.0–160052.0) |

No SLA is invented; the figures describe this fixture and runtime only. Read bytes count the engine's own file seam.
