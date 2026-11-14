#!/usr/bin/env bash
# ROADBED R3-T25 evidence custody: reproduce the R3 SCC source fixture v0.3.2 under the pinned Node, against an exact-commit engine checkout.
#   FIXTURE   path of IMMORTALIS_R3_SCC_source_fixture_v0.3.2.txt (immortalis-ob027-runner @ a76ff62ba1dffd5f5fe86698e1d0eb1cd3b3da77,
#             artifacts/roadbed/r3-t9/, 125,436 bytes, SHA-256 8f3f80f432fe93701b4e4d7efc4977ab8766a417eeb78532003371059a3f42a8)
#   NODE      the Node binary (expected v22.22.2; a different version is reported as a deviation by the fixture itself)
#   REF       the engine commit whose packages/engine/src/temporal/graph.ts is checked out (default: HEAD)
# The fixture imports ./r3-scc-checkout/packages/engine/src/temporal/graph.ts (type-only imports; no other file is read). MECHANISM ONLY.
set -euo pipefail
FIXTURE="${FIXTURE:?set FIXTURE}"
NODE="${NODE:-node}"
REF="${REF:-HEAD}"
EXPECTED_SHA=8f3f80f432fe93701b4e4d7efc4977ab8766a417eeb78532003371059a3f42a8
actual="$(sha256sum "$FIXTURE" | cut -d' ' -f1)"
[ "$actual" = "$EXPECTED_SHA" ] || { echo "fixture SHA-256 mismatch: $actual" >&2; exit 3; }
work="$(mktemp -d)"
mkdir -p "$work/r3-scc-checkout/packages/engine/src/temporal"
git show "$REF:packages/engine/src/temporal/graph.ts" > "$work/r3-scc-checkout/packages/engine/src/temporal/graph.ts"
cp "$FIXTURE" "$work/fixture.mjs"
echo "node: $("$NODE" --version)"
echo "engine ref: $(git rev-parse "$REF")  graph.ts sha256: $(sha256sum "$work/r3-scc-checkout/packages/engine/src/temporal/graph.ts" | cut -d' ' -f1)"
(cd "$work" && "$NODE" --experimental-strip-types --no-warnings fixture.mjs > out.json)
echo "output bytes: $(wc -c < "$work/out.json")  output sha256: $(sha256sum "$work/out.json" | cut -d' ' -f1)"
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print('runtime', d['runtime'], 'deviation', d['node_deviation']); print(json.dumps(d['summary']))" "$work/out.json"
echo "work dir: $work"
