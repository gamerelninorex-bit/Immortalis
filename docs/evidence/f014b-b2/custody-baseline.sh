#!/usr/bin/env bash
# A8 custody of the immutable baseline bytes: every path is read with `git show <commit>:<path>` (never the working tree), then wc -c and sha256sum.
# The third column is a SHA-256 of the raw bytes; the fourth is the Git BLOB SHA-1 and is NOT a SHA-256 (listed only so a reader can cross-check ls-tree).
set -euo pipefail
BASE=940a1ca29b34af8488c9ea3ea2f1903aeba52660
cd "$(git rev-parse --show-toplevel)"
printf 'path\tbytes\tsha256\tgit_blob_sha1\n'
{
  # governing source / toolchain / CI
  printf '%s\n' .nvmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vitest.config.ts .github/workflows/ci.yml
  # the B2 permitted file envelope (base versions)
  printf '%s\n' packages/contracts/src/temporal.ts packages/contracts/src/temporal-gm-wait.ts packages/contracts/src/index.ts \
    packages/engine/src/owners/admission.ts packages/engine/src/owners/extension.ts packages/engine/src/owners/registry.ts \
    packages/engine/src/temporal/admission.ts packages/engine/src/temporal/coordinator.ts packages/engine/src/temporal/identity.ts packages/engine/src/temporal/integrity.ts \
    packages/engine/src/commit/campaign-core.ts packages/engine/src/persistence/file-package.ts packages/engine/src/persistence/checkpoint-package.ts \
    packages/engine/src/index.ts packages/engine/src/gm-wait-catalogue.ts packages/engine/src/gm-wait-catalogue-current.ts tools/gen-gm-wait-catalogue.ts
  # the retained B1 catalogue archives
  git ls-tree -r --name-only "$BASE" packages/engine/gm-wait-catalogue/manifests
  # the frozen packages and evidence fixtures the old-history tests reopen
  git ls-tree -r --name-only "$BASE" tests/fixtures/b1-s1-frozen tests/fixtures/b1-s1-evidence
} | sort -u | while IFS= read -r p; do
  bytes=$(git show "$BASE:$p" | wc -c | tr -d ' ')
  sha=$(git show "$BASE:$p" | sha256sum | cut -d' ' -f1)
  blob=$(git rev-parse "$BASE:$p")
  printf '%s\t%s\t%s\t%s\n' "$p" "$bytes" "$sha" "$blob"
done
