#!/usr/bin/env bash
# H-07 S2 matched before/after cost evidence for the policy-transition first open (OB-030): exact BASE versus exact HEAD, the SAME old-policy
# fixtures, fresh process per sample, one excluded warmup (rep 0) then measured repetitions. T1 / mechanism only: no host, model or provider.
# Genuine model and client latency is T2/T3 UNRUN. Raw per-sample JSON is retained; nothing here changes a real campaign.
#   H07S2_OLD_SHA      builds the OLD-policy canonical fixtures (default: the exact prior-contract commit eafbb127...)
#   H07S2_BASE_SHA     the exact base under test (default: the H-07 S2 handoff base a1f26c70...)
#   H07S2_EXACT_SHA    the exact head under test (default: HEAD)
#   H07S2_EVIDENCE_DIR output directory (default /tmp/immortalis-h07s2-evidence)
#   H07S2_CANONICAL_EXTRA  extra sources of the canonical series (entries = extra + 3)   H07S2_STORE_ENTRIES  one-fact history lengths
#   H07S2_REPS  measured repetitions per cell (default 5)   H07S2_HEAVY_MAX  largest canonical size also run for interrupted on BASE
#   H07S2_PROFILE_SIZES  canonical sizes profiled (default 103 503)   H07S2_NO_WARMUP_FROM  canonical size from which the warmup rep is skipped (2000)
#   H07S2_HEAVY_HEAD_REPS  measured repetitions of the HEAD-only interrupted run above H07S2_HEAVY_MAX (default 2)
set -euo pipefail
repo_dir="$(pwd)"
evidence_dir="${H07S2_EVIDENCE_DIR:-/tmp/immortalis-h07s2-evidence}"
old_sha="${H07S2_OLD_SHA:-eafbb127c476cafb8498316e496de29e078a2146}"
base_sha="${H07S2_BASE_SHA:-a1f26c70862dd0de26c0836b1708ca3b9d9aa667}"
head_sha="${H07S2_EXACT_SHA:-$(git rev-parse HEAD)}"
canonical_extra="${H07S2_CANONICAL_EXTRA:-0 100 500 2000}"
store_entries="${H07S2_STORE_ENTRIES:-3 103 503 2003 5003}"
reps="${H07S2_REPS:-5}"
heavy_max="${H07S2_HEAVY_MAX:-503}"
old_dir="${evidence_dir}/tree-old"
base_dir="${evidence_dir}/tree-base"
rm -rf "$evidence_dir"
mkdir -p "$old_dir" "$base_dir" "$evidence_dir/raw" "$evidence_dir/fixtures"
prepare() { # prepare <tree> <sha>: the exact commit, with its own workspace packages and the installed third-party bytes
  git archive "$2" | tar -x -C "$1"
  cp tools/h07-s2-benchmark.ts "$1/tools/h07-s2-benchmark.ts"
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
  (cd "$src" && H07S2_BUILD="$build" H07S2_EXACT_SHA="$sha" node --experimental-strip-types --no-warnings tools/h07-s2-benchmark.ts "$@")
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
# the transition: rep 0 is the excluded warmup
for n in $store_entries; do
  for rep in $(seq 0 "$reps"); do
    both "sample-store-old-$n-$rep" sample store old "$n" "$evidence_dir/fixtures/old-store-$n"
    both "sample-store-native-$n-$rep" sample store native "$n" "$evidence_dir/fixtures/old-store-$n"
  done
done
# A transition that takes minutes needs no separate warmup process (its start-up and file-cache effects are negligible against it, and the
# private copy of the fixture is read first): the heaviest cells run the measured repetitions only. Every other cell excludes rep 0.
first_rep() { if [ "$1" -ge "${H07S2_NO_WARMUP_FROM:-2000}" ]; then echo 1; else echo 0; fi; }
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
for extra in $canonical_extra; do
  n=$((extra + 3))
  for rep in $(seq 0 "$reps"); do
    if [ "$n" -le "$heavy_max" ]; then
      both "interrupted-canonical-$n-$rep" interrupted canonical "$n" "$evidence_dir/fixtures/old-canonical-$n"
    elif [ "$rep" -le "${H07S2_HEAVY_HEAD_REPS:-2}" ] && [ "$rep" -ge 1 ]; then
      run "$repo_dir" head "$head_sha" interrupted canonical "$n" "$evidence_dir/fixtures/old-canonical-$n" "$evidence_dir/raw/interrupted-canonical-$n-$rep-head.json"
    fi
  done
done
# where the first open spends its time (inspector profile; never part of a timed sample)
for n in ${H07S2_PROFILE_SIZES:-103 503}; do
  [ -d "$evidence_dir/fixtures/old-canonical-$n" ] || continue
  both "profile-canonical-old-$n-0" profile canonical old "$n" "$evidence_dir/fixtures/old-canonical-$n"
done
node --experimental-strip-types --no-warnings tools/h07-s2-compare.ts "$evidence_dir" "$base_sha" "$head_sha"
