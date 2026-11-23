# B2 custody (A8): what was verified, from which bytes, and what was not

## Baseline

| Item                                    | Value                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Immutable base commit                   | `940a1ca29b34af8488c9ea3ea2f1903aeba52660` (main)                                                                                                                                                                                                                       |
| Baseline CI                             | run 45040758768, conclusion success; the H-07 job is skipped by the workflow, as before                                                                                                                                                                                 |
| Repository sources read                 | `git show 940a1ca…:<path>` only, never the working tree; `custody-baseline.sh` reproduces the table, `custody-baseline.tsv` is its output                                                                                                                               |
| Path / bytes / SHA-256 / Git blob SHA-1 | for every file of the brief's file envelope, the toolchain and CI files, both retained catalogue manifests and the frozen package fixtures. The fourth column is a Git **blob** SHA-1 and is not a SHA-256; it is listed only so a reader can cross-check `git ls-tree` |
| Retained B1 catalogue manifests         | raw SHA-256 equals the file name, both: `f3393ad4…` (330,227 bytes) and `e9049723…` (381,298 bytes); byte-identical at the B2 head (`tests/conformance/b2-catalogue-conformance.test.ts`)                                                                               |

## Toolchain (a discrepancy, recorded and not worked around)

| Item    | Pinned                                 | Used here                     |
| ------- | -------------------------------------- | ----------------------------- |
| Node    | `.nvmrc` 22.22.2 (CI installs from it) | v22.23.5 in this container    |
| pnpm    | 10.33.0                                | 10.33.0                       |
| Install | `pnpm install --frozen-lockfile`       | succeeded, lockfile untouched |

The container's Node is a patch version newer than the pin. Nothing in B2 depends on a Node patch level, but **the exact-head CI run is the authoritative toolchain
evidence**; a local pass is not offered as a substitute for it.

## Governing sources (verified by fetching the pinned pages, not from memory)

| Source                                                                  | Pin                      |
| ----------------------------------------------------------------------- | ------------------------ |
| Sovereign ratification (D4(e) / SC-11 design)                           | 2026-11-22T13:06:43.623Z |
| BLUE Final Source-Authority Decision & Engineering Closure (N1 to N10)  | 2026-11-22T12:38:56.838Z |
| RED Terminal Source-Authority Adjudication (R-5, R-7e, R-8; T91 to T93) | 2026-11-22T13:02:53.745Z |
| BLUE S4/W2 Source Adjudication v0.6.1                                   | 2026-11-21T15:15:58.966Z |
| Sovereign ratification AM-3                                             | 2026-11-16T06:58:35.373Z |
| This construction brief                                                 | 2026-11-22T17:48:36.869Z |

## NOT verified

The brief names a BLUE universal preflight raw file (139,645 bytes, SHA-256 beginning `75956b98`). **It was not supplied to this session** ("Its local upload path is
a BLUE-side working source, not a promised path on Builder host"), so its hash could not be recomputed and is not claimed here. Everything that was fetched was
read from the pinned Notion pages and from Git; nothing here depends on that file.

AM-3.P has no executable engine implementation in the repository (only non-interference is claimed for the new keys), and no part of D3(b), R-DUTY or R-H is
adopted.

## Bytes this slice adds or changes

`custody-files.tsv` (generated at the final head by `custody-files.sh`) lists, for every path this slice adds or changes under `packages/`, `tests/` and
`docs/evidence/f014b-b2/`: bytes, SHA-256, and the base SHA-256 where the path existed. It deliberately **omits the present-day SHA-256 of the contracts index, the
engine index, the owner admission and the owner registry**, which the repository's provenance rule allows to be stated in exactly one place
(`tests/support/present-day-identities.ts`, and the registry in `tests/conformance/current-look-lowering-conformance.test.ts`).
