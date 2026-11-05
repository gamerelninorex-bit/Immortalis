#!/usr/bin/env bash
# Initial Locality Bootstrap v0.9 matched cost evidence (OB-030): exact BASE versus exact HEAD, same fixtures, fresh process per sample.
# T1 / mechanism only: no host, model or provider. Genuine model and client latency is T2/T3 UNRUN. Raw samples are retained.
#   BOOTSTRAP_BASE_SHA   the exact base commit (default: the v0.9 handoff base)
#   BOOTSTRAP_EXACT_SHA  the exact head commit under test (default: HEAD)
#   BOOTSTRAP_EVIDENCE_DIR output directory (default /tmp/immortalis-bootstrap-evidence)
#   BOOTSTRAP_COUNTS / BOOTSTRAP_REPS  history sizes (extra sources) and repetitions
set -euo pipefail
repo_dir="$(pwd)"
evidence_dir="${BOOTSTRAP_EVIDENCE_DIR:-/tmp/immortalis-bootstrap-evidence}"
base_sha="${BOOTSTRAP_BASE_SHA:-eafbb127c476cafb8498316e496de29e078a2146}"
head_sha="${BOOTSTRAP_EXACT_SHA:-$(git rev-parse HEAD)}"
counts="${BOOTSTRAP_COUNTS:-0 100 500 2000}"
reps="${BOOTSTRAP_REPS:-5}"
base_dir="${evidence_dir}/base"
rm -rf "$evidence_dir"
mkdir -p "$base_dir" "$evidence_dir/raw" "$evidence_dir/fixtures"
git archive "$base_sha" | tar -x -C "$base_dir"
cp tools/bootstrap-benchmark.ts "$base_dir/tools/bootstrap-benchmark.ts"
# Reuse installed third-party bytes, but resolve every workspace package to the exact base.
python3 - "$repo_dir" "$base_dir" <<'PY'
import pathlib,sys
repo,base=map(pathlib.Path,sys.argv[1:])
(base/'node_modules/@immortalis').mkdir(parents=True,exist_ok=True)
for name in ['contracts','engine','testkit','protocol','operator']:
 target=base/'node_modules/@immortalis'/name
 if not target.exists():target.symlink_to(base/'packages'/name,target_is_directory=True)
# third-party packages live in the per-package pnpm folders; resolve them from the installed head checkout
zod=(repo/'packages/contracts/node_modules/zod').resolve()
for t in [base/'node_modules/zod', base/'packages/contracts/node_modules/zod', base/'packages/engine/node_modules/zod', base/'packages/operator/node_modules/zod', base/'packages/testkit/node_modules/zod', base/'packages/protocol/node_modules/zod']:
 t.parent.mkdir(parents=True,exist_ok=True)
 if not t.exists():t.symlink_to(zod,target_is_directory=True)
PY
run() { # run <source_dir> <exact_sha> <args...>
  local src="$1" sha="$2"; shift 2
  (cd "$src" && BOOTSTRAP_EXACT_SHA="$sha" node --experimental-strip-types --no-warnings tools/bootstrap-benchmark.ts "$@")
}
for n in $counts; do
  # the SAME fixture, built by the BASE code (old historyVerificationId), opened by base and by head; and a head-built fixture
  run "$base_dir" "$base_sha" seed plain "$n" "$evidence_dir/fixtures/base-seeded-$n"
  run "$repo_dir" "$head_sha" seed plain "$n" "$evidence_dir/fixtures/head-seeded-$n"
  for rep in $(seq 0 $((reps-1))); do
    run "$base_dir" "$base_sha" sample plain "$n" "$evidence_dir/fixtures/base-seeded-$n" "$evidence_dir/raw/before-$n-$rep.json"
    run "$repo_dir" "$head_sha" sample plain "$n" "$evidence_dir/fixtures/base-seeded-$n" "$evidence_dir/raw/after-oldid-$n-$rep.json"
    run "$repo_dir" "$head_sha" sample plain "$n" "$evidence_dir/fixtures/head-seeded-$n" "$evidence_dir/raw/after-native-$n-$rep.json"
  done
done
for facts in 100 1000 10000; do
  run "$repo_dir" "$head_sha" guard "$facts" "$evidence_dir/raw/guard-$facts.json"
done
node --experimental-strip-types --no-warnings tools/bootstrap-compare.ts "$evidence_dir" "$base_sha" "$head_sha"
