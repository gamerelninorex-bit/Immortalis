# B3-T1 retained Workshop originals

Base `d0bcb615fd91cd3b10322fd8ff80964db42b7797`, Node `22.22.2`, pnpm `10.33.0`. The local checkout matched the [pinned B3-T1 brief](https://app.notion.com/p/42420af901e081c7af5fd0abed6ed19c) and [issue #123 order](https://github.com/gamerelninorex-bit/Immortalis/issues/123#issuecomment-7205925582).

## Storage and readers

The internal archive module accepts original UTF-8 message bytes, detached signatures and optional opaque public verification metadata. The caller supplies an existing local directory owned by the process UID with no group or other permissions. Snapshot V1 is a canonical JSON manifest with rows ordered by SHA-256 of the original bytes. Binary members use base64. The file name is the SHA-256 of the complete manifest.

This mechanism requires Linux with the process's kernel-managed procfs mounted at `/proc` and a filesystem supporting hard links and directory fsync. The archive opens each normalized path component without following symlinks and validates the final directory by its open descriptor. Creation, linking, retry reads and cleanup resolve through that held descriptor. A `0600` temporary file is synced before exclusive linking, and the same directory descriptor is synced before acknowledging publication. A repeated publication succeeds only when the existing file contains byte-identical data. A missing descriptor facility, unsupported linking or failed directory sync causes refusal. The process UID and mount namespace belong to the trusted host boundary.

Opening requires the expected digest from a separate trusted handoff. It verifies the complete file and every row before exposing an adapter. Derived indexes enumerate all retained candidates for C54 preparation, C54 earned boundary and recipient occurrence. The recipient index uses the original owner, facet, key, version and group ID. The archive keeps the exact bytes for direct GM, office-revocation and player-choice lookups. It serves lookups from validated memory and returns defensive copies. An unavailable or corrupt snapshot raises a host-side `WorkshopArchiveError` before any reader is available.

Archive integrity establishes correspondence to the selected snapshot. The existing verifier still checks Ed25519, source pins, campaign, Profile and witness bindings. Disagreement between two valid indexed candidates still causes refusal by that verifier. The test also retains a structurally valid record with a wrong signature and observes refusal by the existing verifier. Production authentication declines both qualification Profiles before consulting the archive. The archive lives in `packages/engine/host-storage`, outside the registered runtime source tree. It has no package-export, player, tool or production registration. Future runtime wiring requires its code identity to enter the reviewed runtime catalogue. Real custodian completeness, public trust adoption, direct-purpose fork detection, rotation and revocation policy, and deployed retained storage remain open.

## Verification

The dedicated integration tests publish independently signed disposable originals for the five purposes and both C54 phases, then reopen from disk and exercise the existing verifier. They cover exact signed bytes, all three indexed conflicts, incorrect scope, each occurrence-reference component, malformed and changed files, same-digest conflicts, unsafe paths, interrupted publication, lost acknowledgment, concurrent retry and in-memory stability after backing-file mutation. An old snapshot retains its independently supplied public metadata after publication of a new snapshot. The historical scope census admits only the two new source and evidence paths while keeping the existing byte pins.

The F1 regressions replace the archive name before temporary creation and an ancestor before linking, cold read and exact retry. They verify that the validated directory receives the expected snapshot, the replacement receives no writes, and newly published files retain private permissions. Static symlinks and missing procfs are also refused. [BLUE F1 review](https://github.com/gamerelninorex-bit/Immortalis/pull/147#issuecomment-7208080278)

| Base artifact                        | Bytes | SHA-256                                                            |
| ------------------------------------ | ----: | ------------------------------------------------------------------ |
| `production-auth.ts`                 |  9558 | `9a53ef75185a1bd0198882fd7dcbdd3c634dd5cba2e2b49306f9ac8bcdf5d138` |
| `source.ts`                          |  3536 | `3f43d74bd9016660cddbc4f77ce65dfc7996ccc74f05118f31a3ee9d99310783` |
| `source-ref.ts`                      |   713 | `057d8343fc3a1b9662ee4235905567a1972e7378f70e1bf3282c0fb5e0e3ad22` |
| `workshop-opening.ts`                |  9496 | `f52f531a8e8e828f0ca16ae85dbb128af40a207d81dbf03c1375b205948063f4` |
| `publication.ts`                     |  4283 | `7ec7d34ba3575881bbdf6d237848cce50ecf53fa057f1269b1d193c41b387009` |
| `b3-production-auth.test.ts`         | 13513 | `e61f1b1001947e76d2ccd0b65d6f0fec577068f35748e67be144aef3425d2525` |
| `gm-wait-ingress.ts`                 | 15129 | `fdf3081b83a729720b4dfc9d7b30019f819782c168c454ed1bf1cb2a441189e3` |
| `workshop-opening-quiet-v4.json`     |  7047 | `d2c99d0834b274a2f58dadd21aaf488d794228815751207f4474cbcfeb04c7ee` |
| `workshop-opening-glassbell-v4.json` |  7168 | `cb39da2c4099526954ae182e4a206a627ad62cbb47f760b1c14c2d4612a4007b` |

## Local work measurement

The predecessor authentication test used an in-memory map. It had no archive publication or cold-open path. The new test holds one C54 preparation and one GM direct lookup fixed and adds distinct signed records under unrelated campaigns. One descriptive local run after F1 on the pinned runtime measured the following. Each row publishes and reopens once, then executes 1,000 preparation lookups and 1,000 digest reads.

| Records | Snapshot bytes | Publish ms | Reopen ms | Lookup batch ms | Candidate refs | Original bytes returned |
| ------: | -------------: | ---------: | --------: | --------------: | -------------: | ----------------------: |
|       6 |         10,605 |       0.69 |      0.54 |            2.99 |          1,000 |                 937,000 |
|     134 |        230,893 |       5.54 |      5.03 |            5.83 |          1,000 |                 937,000 |
|     518 |        891,757 |      31.86 |     30.83 |            1.57 |          1,000 |                 937,000 |

Publication validates inputs and writes one snapshot. Its digest ordering sorts the retained references. Publication and cold reopen each open the configured directory one component at a time. Cold reopen reads one file and validates every record before indexing. Each subsequent lookup reads no files. It visits one indexed binding or digest and copies the matching references or byte pair. This measures local mechanism work only. Live host, H-07 and provider-retained recovery were outside this run.
