#!/usr/bin/env bash
# The bytes this slice adds or changes under packages/, tests/ and docs/evidence/f014b-b2/ (everything except this script's own output).
# Columns: path, bytes, sha256 of the file now, sha256 of the same path at the immutable base commit ("-" when the path is new).
# Omitted ON PURPOSE: the four files whose present-day SHA-256 the repository's provenance rule lets exactly one other place state
# (tests/support/present-day-identities.ts for the contracts index, the engine index and the owner admission; tests/conformance/current-look-lowering-conformance.test.ts
# for the owner registry).
set -euo pipefail
BASE=940a1ca29b34af8488c9ea3ea2f1903aeba52660
cd "$(git rev-parse --show-toplevel)"
printf 'path\tbytes\tsha256_now\tsha256_at_base\n'
{
  git -c core.fileMode=false diff --name-only "$BASE" -- packages tests docs/evidence/f014b-b2
  git ls-files --others --exclude-standard -- packages tests docs/evidence/f014b-b2
} | sort -u \
  | grep -v -e '^docs/evidence/f014b-b2/custody-files.tsv$' \
            -e '^packages/contracts/src/index.ts$' -e '^packages/engine/src/index.ts$' \
            -e '^packages/engine/src/owners/admission.ts$' -e '^packages/engine/src/owners/registry.ts$' \
  | while IFS= read -r p; do
      now=$(sha256sum "$p" | cut -d' ' -f1)
      bytes=$(wc -c <"$p" | tr -d ' ')
      if git cat-file -e "$BASE:$p" 2>/dev/null; then base=$(git show "$BASE:$p" | sha256sum | cut -d' ' -f1); else base='-'; fi
      printf '%s\t%s\t%s\t%s\n' "$p" "$bytes" "$now" "$base"
    done
