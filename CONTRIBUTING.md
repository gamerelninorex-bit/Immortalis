# Contributing

Read [`IMPLEMENTATION_CHARTER.md`](IMPLEMENTATION_CHARTER.md) first. It binds every change.

## Toolchain

Node `22.22.2` (see `.nvmrc`), pnpm `10.33.0` (see `packageManager`). Dependency versions are pinned exactly in `package.json` and `pnpm-lock.yaml`.

```sh
pnpm install --frozen-lockfile
pnpm run ci        # format:check, lint, typecheck, check:spec, test
```

## Branches

Short-lived only: `impl/<task>-<slug>`, `fix/<task>-<slug>`, `chore/<task>-<slug>`, and `spec/<task>-<slug>` for lawful implementation-spec snapshot maintenance. No permanent parallel integration branches.

## Commits

Coherent and reviewable; no secrets, generated credentials, production data or opaque binary state. Spec/RC/IM/test lineage belongs in the PR body.

## Pull requests

- Fill in `.github/pull_request_template.md` completely.
- Every substantive PR names the F-027 spec lock and the exact head SHA under review.
- Blue review is anchored to the exact head SHA plus the spec lock. **Any new commit invalidates prior clearance** and requires delta re-review.
- Do not merge your own substantive implementation PR without the required review route.
- Changing anything under `spec/f027/` (including `spec-lock.json`) is a substantive PR. Run `node --experimental-strip-types tools/check-spec.ts --write-hashes` after a reviewed snapshot edit; it also regenerates `packages/contracts/src/spec-identity.ts` (the identity embedded in every save). Review the resulting lock diff — changing the lock makes existing saves fail with `SPEC_LOCK_MISMATCH` by design.

## Evidence and tests

Layers live under `tests/` (unit, contract, conformance, security, integration; recovery and scaling are created when first used). Conformance tests cite their register ID (`V-xx`/`IA-xx`) and the spec lock. A row moves to `PASS` in `spec/f027/acceptance-register.yaml` only with an evidence reference. A skipped or absent test is never `PASS`; keep `NOT_IMPLEMENTED`, `BLOCKED` or `UNRUN`.

## GM-led natural chat play

A change that touches GM-facing play must also satisfy the standing construction requirement recorded in [`IMPLEMENTATION_CHARTER.md`](IMPLEMENTATION_CHARTER.md). Routine looking, turning, reaching and handling are inferred, not filed by the player; the engine validates a GM ruling through the lawful owner instead of requiring the player to author it. Label every result honestly in the PR: scripted referee or client doubles are _mechanism only_; genuine-host, named-client and retained-storage results are `UNRUN` until witnessed.

## Escalation

Genuine semantic gaps are escalated, not guessed; see the Charter.

## Issues and labels

Use issues only where they improve implementation traceability. Labels: `implementation`, `defect`, `conformance`, `blocked-spec`, `security`, `migration`, `provider` (definitions in `.github/labels.yml`). Do not mirror Notion obligations into issues.
