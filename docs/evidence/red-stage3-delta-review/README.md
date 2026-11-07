# RED Stage 3 delta review: preserved record and witnesses

Review evidence for the IMMORTALIS LLM-Native Architecture Reassessment Study (Notion page `41120af9-01e0-816d-992f-ffae5ae223c3`). It is **review evidence, not engine code or tests**. It claims no PASS, selects no architecture, ratifies nothing and opens no Stage 4. Witness files carry a `.txt` suffix so that formatting, linting and the test runner never see them.

## Files

| File                                                | SHA-256                                                            | What it is                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `01-original-partial-review.md.txt`                 | `8d0d817d9a84b0b10bbf6ed728818be1406531e67aa5d2904d50e6a7f0a9f1a6` | The first RED review (pin 2026-11-07T14:05:06.737Z), **byte-identical** to the file first produced. |
| `02-resumed-review.md`                              | `8822ca05da3723ccb1629ab3ed6f850b49bab6e40e0c6b53c2f54d2fd23f1f8a` | The resumed and completed review (pin 2026-11-07T14:46:46.948Z).                                    |
| `witness/red-witness-goal.mjs.txt`                  | `801114d00e5c8db223638c89f02b2801a13130949e621fbe1b284bcb58a8ecaf` | Coordinator witness: real `createGoalCoordinator` with stub dependencies (C1 to C3, W1 to W3).      |
| `witness/red-e2e-foreign-grant-witness.test.ts.txt` | `adf9a5577ba8b667efe31fd3104438efdafeb897f49f96d665db33e2a0923ddb` | Project-harness witness: a second grant repeating a retained gather request (E2E-1, E2E-2).         |
| `witness/red-pmain-count.test.ts.txt`               | `f0d57dab0cceca88dea984233af8fa9542a1f77f74ed76ecd98ffd7a7758fcff` | Project-harness witness: canonical publication groups on current main (setup 16; gather 2, 5, 5).   |

`SHA256SUMS` lists every file in this directory except itself. Verify with `cd docs/evidence/red-stage3-delta-review && sha256sum -c SHA256SUMS`.

## Reviewed objects

- Study page body as fetched, SHA-256 of the text between the content tags, trimmed:
  - pin 2026-11-07T14:05:06.737Z: `29c7cac4a8778357410a2ee93a378286737030aa79b6ba2dcd94d999b0993650` (483,622 characters)
  - pin 2026-11-07T14:46:46.948Z: `7fce845f63e5f68d8d060ee9b2d1ac91b30f2accd7375cc9825e4c0fb2d9f2e3` (492,110 characters)
- Code: this repository at `36d50639ccf099fc0e69421f35cf036242c9bcad` (tree `dfe8fd0f1da025cc0704f4b66e165cab20a7ef3b`), equal to `origin/main` when the review was written. The witnesses are valid only at that commit.

## Rerunning the witnesses

The environment used Node 22.23.4, pnpm 10.33.0 and vitest 5.0.2 after `pnpm install --frozen-lockfile`. Installing marks ten `packages/operator/src/*-bin.ts` files executable; restore their mode with `git diff --name-only | xargs chmod 644`.

- **Coordinator witness.** It imports `/home/user/Immortalis/apps/phone/src/goal.ts` by absolute path; edit that path to your checkout in a copy. Copy to a file outside the repository with an `.mjs` suffix and run `node --disable-warning=ExperimentalWarning --experimental-strip-types <copy>`. Expected: C1 adopts an open attempt of the same amount; C2 and C3 refuse; W1 resumes under the second grant and launches the finish phase with that grant; W2 and W3 do not resume.
- **Harness witnesses.** Copy a `.test.ts.txt` file to `tests/integration/zz-<name>.test.ts`, run `pnpm exec vitest run tests/integration/zz-<name>.test.ts --silent=false`, then delete the copy. Expected for the grant witness: a second grant completes the original goal id with one commitment, reserve 2, source 10, time 31; a different amount returns `ANOTHER_ATTEMPT_OPEN` and leaves the owners untouched. Expected for the count witness: `RED-PMAIN` reports 3 groups after the setting, `S01_groups` 16, then 2, 5 and 5 for collect, continue and finish.

## Evidence tiers

Every result here is **T1 mechanism evidence**: scripted hosts, real canonical owners and trusted adapter. A genuine GM host, a named phone client, a retained-service restart (OB-030) and model fairness remain UNRUN. Results about arms B, C, D and MX are attacks on paper designs and carry no behavioural evidence.

## Custody

No pull request was created from this branch. M-S and OB-030 keep their separate recorded statuses. Nothing in this directory changes a source lock, an acceptance-register row or an open gate.
