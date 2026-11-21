# F-014B B1 S2/S3 evidence (work order: GitHub issue #122)

MECHANISM ONLY. This slice adds a hashed catalogue of what exists (S2) and a pure, present-only classifier of the Temporal present basis (S3). It installs no GM-wait writer, opens no
authority, mutates no canonical state and grants no permission. Every catalogue member is UNDECLARED and ACTIONABLE_OR_UNSAFE; the only positive result anywhere is the labelled
`SYNTHETIC_TEST_ONLY` policy used by tests. The census is build/test-time coverage; runtime enforcement and enrolment admission remain S4 / section 10 source gates.

Labels: EXECUTED = a command was run and its output observed; REASONED = derived from source text or code without running it; UNKNOWN = not established.

| File                                   | What it holds                                                                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `custody.md`                           | the retained manifest (path, length, SHA-256), the regeneration command and what makes `--check` fail, toolchain, the source register and its verification state                  |
| `coverage-and-hook-sites.md`           | how the census works, the falsification set, and the three runtime hook sites this slice does not touch                                                                           |
| `s3-present-reader.md`                 | the eight-category read set, source classes, verdicts, category 5 (provisional) and the missing producer/consumer authority, the declared A0 re-pin                               |
| `proposals-for-blue.md`                | every item built on the Builder's own proposal, for BLUE exact-head review, and what is UNKNOWN                                                                                   |
| `measurements.md`, `measurements.json` | T0 reads against world size, hashing, build-time traversal, cold and warm timings, cost to the existing gates                                                                     |
| `mutation.md`, `mutation-results.json` | the mutation sanity check: table, survivors and their explanation                                                                                                                 |
| `records.md`                           | gate counts, the full integration project run, the squash simulation, the trial merge over PR #121, and forbidden-file byte identity                                              |
| `shared-pin-delta.md`                  | the exact line-level edits to shared scope suites after integrating main (PR #121 merged), the three extra GIP / PC-movement allow-lists, and the gates re-run on the merged tree |

Files this slice adds (all new; no existing production file under `packages/` is changed): `packages/engine/src/gm-wait-catalogue.ts`, `gm-wait-catalogue-current.ts`, `gm-wait-present-reader.ts`,
`packages/engine/gm-wait-catalogue/manifests/<digest>.json`, `tools/gen-gm-wait-catalogue.ts`, `tools/gm-wait-catalogue-mutation-check.py`, and tests under `tests/`. The declared table is
`tests/support/b1-s2s3-scoped-deltas.ts`; `tests/conformance/b1-s2s3-scope-conformance.test.ts` polices it.

Commands (from the repository root):

```
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/gen-gm-wait-catalogue.ts --check      # fails on drift
pnpm exec vitest run --project conformance tests/conformance/gm-wait-catalogue-s2.test.ts tests/conformance/gm-wait-catalogue-s2-census.test.ts tests/conformance/gm-wait-present-s3.test.ts
pnpm exec vitest run --project integration tests/integration/gm-wait-present-s3-committed.test.ts tests/integration/gm-wait-present-s3-cost.test.ts
python3 tools/gm-wait-catalogue-mutation-check.py --anchors                                                       # then without --anchors to run the mutants (about 25 minutes)
```
