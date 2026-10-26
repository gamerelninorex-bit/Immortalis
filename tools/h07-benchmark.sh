#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(pwd)"
evidence_dir="${H07_EVIDENCE_DIR:-/tmp/immortalis-h07-evidence}"
baseline_dir="${evidence_dir}/baseline"
baseline_sha=e8fd50b3de6f4f0f1e7be71fa97ff3b5434ea587
head_sha="${H07_EXACT_SHA:-$(git rev-parse HEAD)}"
mkdir -p "$baseline_dir" "$evidence_dir/raw" "$evidence_dir/fixtures"
git diff --exit-code "$baseline_sha" f74a7dd302fee98476baf44dead1e9d0e295c829 -- packages/engine/src/commit/campaign-core.ts packages/engine/src/persistence/file-package.ts packages/engine/src/world/canonical-campaign.ts packages/contracts/src/campaign-package.ts packages/operator/src/session.ts
git archive "$baseline_sha" | tar -x -C "$baseline_dir"
cp tools/h07-benchmark.ts "$baseline_dir/tools/h07-benchmark.ts"
# Reuse installed third-party bytes, but resolve every workspace package to the exact baseline.
python3 - "$repo_dir" "$baseline_dir" <<'PY'
import os,pathlib,sys
repo,base=map(pathlib.Path,sys.argv[1:])
(base/'node_modules/@immortalis').mkdir(parents=True,exist_ok=True)
for name in ['contracts','engine','testkit','protocol','operator']:
 target=base/'node_modules/@immortalis'/name
 if not target.exists():target.symlink_to(base/'packages'/name,target_is_directory=True)
zod=base/'node_modules/zod'
if not zod.exists():zod.symlink_to((repo/'packages/contracts/node_modules/zod').resolve(),target_is_directory=True)
PY
for variant in before after; do
  source_dir="$repo_dir"
  exact_sha="$head_sha"
  if [[ "$variant" == before ]]; then source_dir="$baseline_dir"; exact_sha="$baseline_sha"; fi
  for kind in state history; do
    counts="0 100 1000 5000 10000"
    if [[ "$kind" == history ]]; then counts="0 100 500 2000"; fi
    for count in $counts; do
      fixture="${evidence_dir}/fixtures/${variant}-${kind}-${count}"
      H07_EXACT_SHA="$exact_sha" node --experimental-strip-types --no-warnings "$source_dir/tools/h07-benchmark.ts" seed "$kind" "$count" "$fixture"
      for rep in 0 1 2 3 4 5; do
        H07_EXACT_SHA="$exact_sha" node --experimental-strip-types --no-warnings "$source_dir/tools/h07-benchmark.ts" sample "$kind" "$count" "$fixture" "${evidence_dir}/raw/${variant}-${kind}-${count}-${rep}.json"
      done
    done
  done
done
for count in 0 100 1000 5000 10000; do
  H07_EXACT_SHA="$head_sha" node --experimental-strip-types --no-warnings tools/h07-benchmark.ts checkpoint state "$count" "${evidence_dir}/fixtures/after-state-${count}" "${evidence_dir}/raw/checkpoint-state-${count}.json"
done
for kind in state history; do
  counts="0 100 1000 5000 10000"
  if [[ "$kind" == history ]]; then counts="0 100 500 2000"; fi
  for count in $counts; do
    H07_EXACT_SHA="$head_sha" node --experimental-strip-types --no-warnings tools/h07-benchmark.ts convert "$kind" "$count" "${evidence_dir}/fixtures/before-${kind}-${count}" "${evidence_dir}/raw/conversion-${kind}-${count}.json"
  done
done
H07_EXACT_SHA="$head_sha" node --experimental-strip-types --no-warnings tools/h07-compare.ts "$evidence_dir"
