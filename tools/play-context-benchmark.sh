#!/usr/bin/env bash
# Matched whole-operation cost evidence for the player-safe supported-play briefing: exact BASE versus exact HEAD, the SAME harness
# (tests/integration/play-context-cost.test.ts and tests/support/play-context.ts) run unchanged in both trees, alternating BASE then HEAD in
# every round so drift touches both. MECHANISM / T1 only: scripted client and hosts, real owners and transport, one process, a local temporary
# disk; model and client latency, a genuine host, a named client and retained storage are UNRUN. Raw per-round JSON is retained.
#   PLAY_CONTEXT_BASE_SHA      the exact base under test (default: the handoff base 36d50639...)
#   PLAY_CONTEXT_EXACT_SHA     the exact head under test (default: HEAD; the working tree must be clean)
#   PLAY_CONTEXT_SIZES         unrelated admitted facts added per size (default "0,250,1000")
#   PLAY_CONTEXT_REPS          timed repetitions per journey inside one round (default 3)
#   PLAY_CONTEXT_ROUNDS        rounds (default 3)
#   PLAY_CONTEXT_EVIDENCE_DIR  output directory (default /tmp/immortalis-play-context-evidence)
set -euo pipefail
repo_dir="$(pwd)"
base_sha="${PLAY_CONTEXT_BASE_SHA:-36d50639ccf099fc0e69421f35cf036242c9bcad}"
head_sha="${PLAY_CONTEXT_EXACT_SHA:-$(git rev-parse HEAD)}"
sizes="${PLAY_CONTEXT_SIZES:-0,250,1000}"
reps="${PLAY_CONTEXT_REPS:-3}"
rounds="${PLAY_CONTEXT_ROUNDS:-3}"
evidence_dir="${PLAY_CONTEXT_EVIDENCE_DIR:-/tmp/immortalis-play-context-evidence}"
if [ -n "$(git status --porcelain --untracked-files=no | grep -v '^ M packages/operator/src/.*-bin.ts' || true)" ]; then
  echo "the working tree must be clean: the head under test is the committed one" >&2
  exit 1
fi
base_dir="${evidence_dir}/tree-base"
started_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
rm -rf "$evidence_dir"
mkdir -p "$base_dir" "$evidence_dir/raw"
git archive "$base_sha" | tar -x -C "$base_dir"
python3 - "$repo_dir" "$base_dir" <<'PY'
import pathlib, sys
repo, base = map(pathlib.Path, sys.argv[1:])
# the same installed third-party bytes; the workspace packages are the base tree's own
(base / 'node_modules').mkdir(exist_ok=True)
for entry in (repo / 'node_modules').iterdir():
    t = base / 'node_modules' / entry.name
    if entry.name != '@immortalis' and not t.exists():
        t.symlink_to(entry.resolve(), target_is_directory=entry.is_dir())
(base / 'node_modules/@immortalis').mkdir(parents=True, exist_ok=True)
for name in ['contracts', 'engine', 'testkit', 'protocol', 'operator']:
    t = base / 'node_modules/@immortalis' / name
    if not t.exists():
        t.symlink_to(base / 'packages' / name, target_is_directory=True)
for pkg in ['contracts', 'engine', 'operator', 'protocol', 'testkit']:
    src = repo / 'packages' / pkg / 'node_modules'
    if not src.exists():
        continue
    dst = base / 'packages' / pkg / 'node_modules'
    dst.mkdir(parents=True, exist_ok=True)
    for e in src.iterdir():
        t = dst / e.name
        if t.exists():
            continue
        if e.name == '@immortalis':
            t.mkdir(exist_ok=True)
            for ee in e.iterdir():
                tt = t / ee.name
                if not tt.exists():
                    tt.symlink_to(base / 'packages' / ee.name, target_is_directory=True)
        else:
            t.symlink_to(e.resolve(), target_is_directory=e.is_dir())
src = repo / 'apps/phone/node_modules'
if src.exists():
    dst = base / 'apps/phone/node_modules'
    dst.mkdir(parents=True, exist_ok=True)
    for e in src.iterdir():
        if not (dst / e.name).exists():
            (dst / e.name).symlink_to(e.resolve(), target_is_directory=e.is_dir())
PY
# the harness is the head's; it uses only surfaces that exist in both trees
cp tests/integration/play-context-cost.test.ts "$base_dir/tests/integration/play-context-cost.test.ts"
cp tests/support/play-context.ts "$base_dir/tests/support/play-context.ts"
run() { # run <tree> <build> <sha> <round>
  (cd "$1" && PLAY_CONTEXT_BUILD="$2" PLAY_CONTEXT_EXACT_SHA="$3" PLAY_CONTEXT_SIZES="$sizes" PLAY_CONTEXT_REPS="$reps" PLAY_CONTEXT_COMPARE_BASE_DIR="$base_dir" \
    PLAY_CONTEXT_EVIDENCE_DIR="$evidence_dir/raw/round-$4" \
    pnpm exec vitest run tests/integration/play-context-cost.test.ts > "$evidence_dir/raw/round-$4-$2.log" 2>&1)
}
for r in $(seq 1 "$rounds"); do
  run "$base_dir" base "$base_sha" "$r"
  run "$repo_dir" head "$head_sha" "$r"
done
{
  echo "started_utc: $started_utc"
  echo "finished_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "base_sha: $base_sha"
  echo "base_tree: $(git rev-parse "$base_sha^{tree}")"
  echo "head_sha: $head_sha"
  echo "head_tree: $(git rev-parse "$head_sha^{tree}")"
  echo "node: $(node -v)"
  echo "os: $(uname -srm)"
  echo "cpus: $(nproc)"
  echo "sizes: $sizes  reps_per_round: $reps  rounds: $rounds"
} > "$evidence_dir/identity.txt"
node --experimental-strip-types --no-warnings tools/play-context-compare.ts "$evidence_dir" > "$evidence_dir/report.md"
echo "report: $evidence_dir/report.md"
