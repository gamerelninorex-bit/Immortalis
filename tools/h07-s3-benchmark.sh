#!/usr/bin/env bash
# H-07 S3 matched before/after whole-operation cost evidence for the strict historical replay of a policy-transition first open (OB-030):
# exact BASE versus exact HEAD, the SAME old-policy fixtures, fresh process per sample, one excluded warmup (rep 0) then measured
# repetitions. T1 / mechanism only: no host, model or provider. Genuine model and client latency is T2/T3 UNRUN. Raw per-sample JSON is
# retained; nothing here changes a real campaign.
#   H07S3_OLD_SHA      builds the OLD-policy canonical fixtures (default: the exact prior-contract commit eafbb127...)
#   H07S3_BASE_SHA     the exact base under test (default: the H-07 S3 handoff base 0b203a5c...)
#   H07S3_EXACT_SHA    the exact head under test (default: HEAD)
#   H07S3_EVIDENCE_DIR output directory (default /tmp/immortalis-h07s3-evidence)
#   H07S3_CANONICAL_EXTRA  extra sources of the canonical series (entries = extra + 3)   H07S3_STORE_ENTRIES  one-fact history lengths
#   H07S3_SHAPES  adversarial rewrite positions (early middle late rotate)   H07S3_SHAPE_COLD / H07S3_SHAPE_UPDATES  cold facts / rewrites
#   H07S3_REPS  measured repetitions per cell (default 5)   H07S3_HEAVY_REPS  repetitions of the multi-minute interrupted canonical cells
#   H07S3_PROFILE_SIZES  canonical sizes profiled (default 103 503)   H07S3_COUNTER_SIZES  canonical sizes given the untimed counters pass
#   H07S3_NO_WARMUP_FROM  canonical size from which the warmup rep is skipped (2000)
set -euo pipefail
repo_dir="$(pwd)"
evidence_dir="${H07S3_EVIDENCE_DIR:-/tmp/immortalis-h07s3-evidence}"
old_sha="${H07S3_OLD_SHA:-eafbb127c476cafb8498316e496de29e078a2146}"
base_sha="${H07S3_BASE_SHA:-0b203a5ca502dd79ed847aedd235c97b660ad9ea}"
head_sha="${H07S3_EXACT_SHA:-$(git rev-parse HEAD)}"
canonical_extra="${H07S3_CANONICAL_EXTRA:-0 100 500 2000}"
store_entries="${H07S3_STORE_ENTRIES:-3 103 503 2003 5003}"
reps="${H07S3_REPS:-5}"
shapes="${H07S3_SHAPES:-early middle late rotate}"
shape_cold="${H07S3_SHAPE_COLD:-500}"
shape_updates="${H07S3_SHAPE_UPDATES:-1500}"
shape_n=$((shape_cold + shape_updates))
heavy_reps="${H07S3_HEAVY_REPS:-2}"
export H07S3_SHAPE_COLD="$shape_cold"
old_dir="${evidence_dir}/tree-old"
base_dir="${evidence_dir}/tree-base"
started_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
rm -rf "$evidence_dir"
mkdir -p "$old_dir" "$base_dir" "$evidence_dir/raw" "$evidence_dir/fixtures"
prepare() { # prepare <tree> <sha>: the exact commit, with its own workspace packages and the installed third-party bytes
  git archive "$2" | tar -x -C "$1"
  mkdir -p "$1/tools" && cp tools/h07-s3-benchmark.ts "$1/tools/h07-s3-benchmark.ts"
  python3 - "$repo_dir" "$1" <<'PY'
import pathlib,sys
repo,base=map(pathlib.Path,sys.argv[1:])
(base/'node_modules/@immortalis').mkdir(parents=True,exist_ok=True)
for name in ['contracts','engine','testkit','protocol','operator']:
 target=base/'node_modules/@immortalis'/name
 if not target.exists():target.symlink_to(base/'packages'/name,target_is_directory=True)
zod=(repo/'packages/contracts/node_modules/zod').resolve()
for t in [base/'node_modules/zod', base/'packages/contracts/node_modules/zod', base/'packages/engine/node_modules/zod', base/'packages/operator/node_modules/zod', base/'packages/testkit/node_modules/zod', base/'packages/protocol/node_modules/zod']:
 t.parent.mkdir(parents=True,exist_ok=True)
 if not t.exists():t.symlink_to(zod,target_is_directory=True)
PY
}
prepare "$old_dir" "$old_sha"
prepare "$base_dir" "$base_sha"
run() { # run <tree> <build-label> <exact-sha> <args...>
  local src="$1" build="$2" sha="$3"; shift 3
  (cd "$src" && H07S3_BUILD="$build" H07S3_EXACT_SHA="$sha" node --experimental-strip-types --no-warnings tools/h07-s3-benchmark.ts "$@")
}
both() { # both <rep> <args...>: BASE then HEAD on the identical fixture, alternating so drift hits both
  local tag="$1"; shift
  run "$base_dir" base "$base_sha" "$@" "$evidence_dir/raw/${tag}-base.json"
  run "$repo_dir" head "$head_sha" "$@" "$evidence_dir/raw/${tag}-head.json"
}
# fixtures: old-policy canonical packages built by the exact prior-contract build; native ones by this head; one-fact old-policy packages
for extra in $canonical_extra; do
  n=$((extra + 3))
  run "$old_dir" old "$old_sha" seed canonical "$extra" "$evidence_dir/fixtures/old-canonical-$n"
  run "$repo_dir" head "$head_sha" seed canonical "$extra" "$evidence_dir/fixtures/native-canonical-$n"
done
for n in $store_entries; do
  run "$repo_dir" head "$head_sha" seed store "$n" "$evidence_dir/fixtures/old-store-$n"
done
for shape in $shapes; do
  run "$repo_dir" head "$head_sha" seed shape "$shape" "$shape_cold" "$shape_updates" "$evidence_dir/fixtures/old-shape-$shape-$shape_n"
done
# the transition: rep 0 is the excluded warmup
for n in $store_entries; do
  for rep in $(seq 0 "$reps"); do
    both "sample-store-old-$n-$rep" sample store old "$n" "$evidence_dir/fixtures/old-store-$n"
    both "sample-store-native-$n-$rep" sample store native "$n" "$evidence_dir/fixtures/old-store-$n"
  done
done
for shape in $shapes; do
  for rep in $(seq 0 "$reps"); do
    both "sample-shape-$shape-old-$shape_n-$rep" sample "shape-$shape" old "$shape_n" "$evidence_dir/fixtures/old-shape-$shape-$shape_n"
    both "sample-shape-$shape-native-$shape_n-$rep" sample "shape-$shape" native "$shape_n" "$evidence_dir/fixtures/old-shape-$shape-$shape_n"
  done
done
# A transition that takes minutes needs no separate warmup process (its start-up and file-cache effects are negligible against it, and the
# private copy of the fixture is read first): the heaviest cells run the measured repetitions only. Every other cell excludes rep 0.
first_rep() { if [ "$1" -ge "${H07S3_NO_WARMUP_FROM:-2000}" ]; then echo 1; else echo 0; fi; }
for extra in $canonical_extra; do
  n=$((extra + 3))
  for rep in $(seq "$(first_rep "$n")" "$reps"); do
    both "sample-canonical-old-$n-$rep" sample canonical old "$n" "$evidence_dir/fixtures/old-canonical-$n"
  done
  for rep in $(seq 0 "$reps"); do
    both "sample-canonical-native-$n-$rep" sample canonical native "$n" "$evidence_dir/fixtures/native-canonical-$n"
  done
done
# crash before the manifest publication, then recovery (the base is only run where its cost is bounded)
for n in $store_entries; do
  for rep in $(seq 0 "$reps"); do
    both "interrupted-store-$n-$rep" interrupted store "$n" "$evidence_dir/fixtures/old-store-$n"
  done
done
for shape in $shapes; do
  for rep in $(seq 0 "$reps"); do
    both "interrupted-shape-$shape-$shape_n-$rep" interrupted "shape-$shape" "$shape_n" "$evidence_dir/fixtures/old-shape-$shape-$shape_n"
  done
done
for extra in $canonical_extra; do
  n=$((extra + 3))
  if [ "$n" -ge "${H07S3_NO_WARMUP_FROM:-2000}" ]; then
    # each sample is two multi-minute transitions on BASE: a smaller repetition count, recorded as such
    for rep in $(seq 1 "$heavy_reps"); do
      both "interrupted-canonical-$n-$rep" interrupted canonical "$n" "$evidence_dir/fixtures/old-canonical-$n"
    done
  else
    for rep in $(seq 0 "$reps"); do
      both "interrupted-canonical-$n-$rep" interrupted canonical "$n" "$evidence_dir/fixtures/old-canonical-$n"
    done
  fi
done
# where the first open spends its time (inspector profile; never part of a timed sample)
for n in ${H07S3_PROFILE_SIZES:-103 503}; do
  [ -d "$evidence_dir/fixtures/old-canonical-$n" ] || continue
  both "profile-canonical-old-$n-0" profile canonical old "$n" "$evidence_dir/fixtures/old-canonical-$n"
done
# what is serialised, sorted, copied and encoded during the first open (heavier untimed instrumentation; one pass per build)
for n in ${H07S3_COUNTER_SIZES:-103 503 2003}; do
  [ -d "$evidence_dir/fixtures/old-canonical-$n" ] || continue
  both "counters-canonical-old-$n-0" counters canonical old "$n" "$evidence_dir/fixtures/old-canonical-$n"
done
for n in ${H07S3_COUNTER_STORE_SIZES:-2003}; do
  [ -d "$evidence_dir/fixtures/old-store-$n" ] || continue
  both "counters-store-old-$n-0" counters store old "$n" "$evidence_dir/fixtures/old-store-$n"
done
for shape in $shapes; do
  both "counters-shape-$shape-old-$shape_n-0" counters "shape-$shape" old "$shape_n" "$evidence_dir/fixtures/old-shape-$shape-$shape_n"
done
# identity of everything measured: the exact commits and their trees, the runtime and the hardware
{
  printf '{\n'
  printf '  "base_sha": "%s",\n  "base_tree": "%s",\n' "$base_sha" "$(git rev-parse "$base_sha^{tree}")"
  printf '  "head_sha": "%s",\n  "head_tree": "%s",\n' "$head_sha" "$(git rev-parse "$head_sha^{tree}")"
  printf '  "old_contract_sha": "%s",\n  "old_contract_tree": "%s",\n' "$old_sha" "$(git rev-parse "$old_sha^{tree}")"
  printf '  "product_files_changed_base_to_head": %s,\n' "$(git diff --name-only "$base_sha" "$head_sha" -- packages | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().split()))')"
  printf '  "node": "%s",\n  "kernel": "%s",\n  "cpu": "%s",\n  "logical_cpus": %s,\n' "$(node --version)" "$(uname -sr)" "$(grep -m1 'model name' /proc/cpuinfo | sed 's/.*: //')" "$(nproc)"
  printf '  "repetitions": %s,\n  "canonical_extra": "%s",\n  "store_entries": "%s",\n  "shapes": "%s",\n  "shape_cold": %s,\n  "shape_updates": %s,\n' "$reps" "$canonical_extra" "$store_entries" "$shapes" "$shape_cold" "$shape_updates"
  printf '  "started_utc": "%s",\n  "finished_utc": "%s"\n' "$started_utc" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '}\n'
} > "$evidence_dir/identity.json"
node --experimental-strip-types --no-warnings tools/h07-s3-compare.ts "$evidence_dir" "$base_sha" "$head_sha"
