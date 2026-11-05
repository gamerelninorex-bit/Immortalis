#!/usr/bin/env bash
# Initial Locality Bootstrap v0.9 — P-1: bootstrap-bearing versus non-bootstrap whole-operation cost and a representative crash recovery (OB-030).
# T1 / mechanism only: scripted isolated answers, fixture proofs, no host, model or provider. HEAD ONLY (the base has no bootstrap route); the
# matched comparison is bootstrap-bearing against a campaign with NO bootstrap record under the SAME test-only fixture admission, same code, same
# runtime, same journal length. The fixture admission is reached through tests/support (the sanctioned location); no production seam is involved.
#   BOOTSTRAP_EXACT_SHA   the exact head commit under test (default: HEAD)
#   BOOTSTRAP_EVIDENCE_DIR output directory (default /tmp/immortalis-bootstrap-bearing-evidence)
#   BOOTSTRAP_COUNTS / BOOTSTRAP_REPS   ordinary extra sources added after the bootstrap (history length) and repetitions
set -euo pipefail
evidence_dir="${BOOTSTRAP_EVIDENCE_DIR:-/tmp/immortalis-bootstrap-bearing-evidence}"
head_sha="${BOOTSTRAP_EXACT_SHA:-$(git rev-parse HEAD)}"
counts="${BOOTSTRAP_COUNTS:-0 100 500 2000}"
reps="${BOOTSTRAP_REPS:-5}"
rm -rf "$evidence_dir"
mkdir -p "$evidence_dir/raw" "$evidence_dir/fixtures"
run() { BOOTSTRAP_EXACT_SHA="$head_sha" node --experimental-strip-types --no-warnings tools/bootstrap-benchmark.ts "$@"; }
for n in $counts; do
  # the bootstrap-bearing campaign holds 8 more journal entries than its ordinary history; the no-bootstrap one gets 8 more ordinary entries so the journals are EQUAL in length
  run seed plainfx "$((n + 8))" "$evidence_dir/fixtures/plainfx-$n"
  run seed bootstrap "$n" "$evidence_dir/fixtures/bootstrap-$n"
  for rep in $(seq 0 $((reps-1))); do
    run sample plainfx "$n" "$evidence_dir/fixtures/plainfx-$n" "$evidence_dir/raw/fx-plain-$n-$rep.json"
    run sample bootstrap "$n" "$evidence_dir/fixtures/bootstrap-$n" "$evidence_dir/raw/fx-bootstrap-$n-$rep.json"
    run residue plainfx "$evidence_dir/fixtures/plainfx-$n" "$evidence_dir/raw/residue-plainfx-$n-$rep.json"
    run residue bootstrap "$evidence_dir/fixtures/bootstrap-$n" "$evidence_dir/raw/residue-bootstrap-$n-$rep.json"
  done
done
run seed bootstrap-reserved 0 "$evidence_dir/fixtures/bootstrap-reserved"
for rep in $(seq 0 $((reps-1))); do
  run recovery "$evidence_dir/fixtures/bootstrap-reserved" "$evidence_dir/raw/recovery-$rep.json"
done
node --experimental-strip-types --no-warnings tools/bootstrap-bearing-compare.ts "$evidence_dir" "$head_sha"
