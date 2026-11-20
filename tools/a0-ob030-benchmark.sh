#!/usr/bin/env bash
# F-014B A0 OB-030: BASE versus HEAD cost of the first open after the history-verification identity change, for the A0-specific journals
# (source lock section 7; preflight I-7 "Series A"). MEASUREMENT ONLY, T1 / mechanism: no host, model or provider. The h07-s2 harness
# (tools/h07-s2-benchmark.sh, unchanged) covers series P, C and S; this one adds the journals it has no seed mode for:
#   captured-v1 / ms-v1   v1 captured non-MS and v1 MS journals, sealed by the BASE tree (BASE opens them warm, HEAD through the transition)
#   captured-v2 / ms-v2   v2 journals (the T-1 pair), which only HEAD can seed; written under a stand-in earlier identity so HEAD replays them
#                         cold; BASE is expected to refuse them and the refusal is recorded as the result
#   legacy-pre-v09        the committed pre-v0.9 legacy package (opened under the legacy admission; cold at BOTH builds, its identity matches neither)
#   s4-ledger             the committed S-4 ledger package
# variants: genuine = the fixture exactly as sealed (a package sealed by BASE is opened warm by BASE; one written by another build is cold at both);
#           prewarmed = a copy pre-opened once at BASE (BASE then opens it warm, HEAD through the transition), v1 and committed packages only;
#           forced-cold = identical bytes re-opened at BOTH builds under a labelled identity, so each build's own verifier replays them in full.
# Fresh process per sample, rep 0 excluded as the warmup, raw per-sample JSON retained. No threshold is invented.
#   A0OB_BASE_SHA      the exact base under test (required)    A0OB_EXACT_SHA  the exact head under test (default HEAD)
#   A0OB_EVIDENCE_DIR  output directory (default /tmp/immortalis-a0ob-evidence)    A0OB_REPS  measured repetitions per cell (default 5)
set -euo pipefail
repo_dir="$(pwd)"
evidence_dir="${A0OB_EVIDENCE_DIR:-/tmp/immortalis-a0ob-evidence}"
base_sha="${A0OB_BASE_SHA:?set A0OB_BASE_SHA to the exact base commit}"
head_sha="${A0OB_EXACT_SHA:-$(git rev-parse HEAD)}"
reps="${A0OB_REPS:-5}"
base_dir="${evidence_dir}/tree-base"
rm -rf "$evidence_dir"
mkdir -p "$base_dir" "$evidence_dir/raw" "$evidence_dir/fixtures"
git archive "$base_sha" | tar -x -C "$base_dir"
cp tools/a0-ob030-benchmark.ts "$base_dir/tools/a0-ob030-benchmark.ts"
python3 - "$repo_dir" "$base_dir" <<'PY'
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
run() { # run <tree> <build-label> <exact-sha> <args...>
  local src="$1" build="$2" sha="$3"; shift 3
  (cd "$src" && A0OB_BUILD="$build" A0OB_EXACT_SHA="$sha" node --experimental-strip-types --no-warnings tools/a0-ob030-benchmark.ts "$@")
}
both() { # both <tag> <kind> <variant> <fixture>: BASE then HEAD on the identical fixture, alternating so drift hits both
  local tag="$1" kind="$2" variant="$3" fixture="$4"
  run "$base_dir" base "$base_sha" sample "$kind" "$variant" "$fixture" "$evidence_dir/raw/sample-${kind}-${variant}-${tag}-base.json"
  run "$repo_dir" head "$head_sha" sample "$kind" "$variant" "$fixture" "$evidence_dir/raw/sample-${kind}-${variant}-${tag}-head.json"
}
# fixtures: v1 journals sealed by the BASE tree; v2 journals only HEAD can write, under a stand-in earlier identity
for kind in captured-v1 ms-v1; do
  run "$base_dir" base "$base_sha" seed "$kind" "$evidence_dir/fixtures/$kind"
  cp -r "$evidence_dir/fixtures/$kind" "$evidence_dir/fixtures/$kind-prewarmed"
  run "$base_dir" base "$base_sha" prewarm "$kind" "$evidence_dir/fixtures/$kind-prewarmed"
done
for kind in captured-v2 ms-v2; do
  A0OB_SEAL_SUFFIX="+A0OB-STAND-IN-PRIOR-SEAL" run "$repo_dir" head "$head_sha" seed "$kind" "$evidence_dir/fixtures/$kind"
done
# the committed packages are copied before any open (the committed bytes are never touched), then one copy is pre-opened at BASE
mkdir -p "$evidence_dir/fixtures/legacy-pre-v09-prewarmed" "$evidence_dir/fixtures/s4-ledger-prewarmed"
cp -r "$repo_dir/tests/fixtures/legacy-base-eafbb127/package" "$evidence_dir/fixtures/legacy-pre-v09-prewarmed/package"
cp -r "$repo_dir/tests/fixtures/s4-legacy-pc-c6ea29d/activation/package" "$evidence_dir/fixtures/s4-ledger-prewarmed/package"
run "$base_dir" base "$base_sha" prewarm legacy-pre-v09 "$evidence_dir/fixtures/legacy-pre-v09-prewarmed"
run "$base_dir" base "$base_sha" prewarm s4-ledger "$evidence_dir/fixtures/s4-ledger-prewarmed"
for rep in $(seq 0 "$reps"); do
  for kind in captured-v1 ms-v1; do
    both "$rep" "$kind" genuine "$evidence_dir/fixtures/$kind"
    both "$rep" "$kind" prewarmed "$evidence_dir/fixtures/$kind-prewarmed"
    both "$rep" "$kind" forced-cold "$evidence_dir/fixtures/$kind"
  done
  for kind in captured-v2 ms-v2; do
    both "$rep" "$kind" genuine "$evidence_dir/fixtures/$kind"
  done
  both "$rep" legacy-pre-v09 genuine "$repo_dir/tests/fixtures/legacy-base-eafbb127"
  both "$rep" legacy-pre-v09 prewarmed "$evidence_dir/fixtures/legacy-pre-v09-prewarmed"
  both "$rep" s4-ledger genuine "$repo_dir/tests/fixtures/s4-legacy-pc-c6ea29d/activation"
  both "$rep" s4-ledger prewarmed "$evidence_dir/fixtures/s4-ledger-prewarmed"
done
node --experimental-strip-types --no-warnings tools/a0-ob030-benchmark.ts compare "$evidence_dir" "$base_sha" "$head_sha"
