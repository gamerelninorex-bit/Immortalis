#!/usr/bin/env bash
# H-07 S3 falsifiability check: every deliberately broken variant of the incremental state digest must be caught by the unit suite.
# Each mutant edits packages/engine/src/commit/state-digest.ts (restored on exit), runs tests/unit/state-digest.test.ts and
# must make it FAIL; the unmutated file must PASS. Output: one line per mutant. T1 mechanism evidence, no host or provider.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
file=packages/engine/src/commit/state-digest.ts
backup="$(mktemp)"
cp "$file" "$backup"
trap 'cp "$backup" "$file"; rm -f "$backup"' EXIT
survivors=0
run() { pnpm exec vitest run tests/unit/state-digest.test.ts >/dev/null 2>&1; }
check() { # check <name> <perl-substitution>
  cp "$backup" "$file"
  perl -0pi -e "$2" "$file"
  if cmp -s "$backup" "$file"; then echo "MUTANT NOT APPLIED  $1"; survivors=$((survivors + 1)); return; fi
  if run; then echo "SURVIVED            $1"; survivors=$((survivors + 1)); else echo "killed              $1"; fi
}
cp "$backup" "$file"
if run; then echo "control (unmutated) passes"; else echo "control FAILS"; survivors=$((survivors + 1)); fi
check "reuse prefix states past the first changed fact" 's/Math\.floor\(Math\.min\(first, n - 1\) \/ STRIDE\)/Math.floor((n - 1) \/ STRIDE)/'
check "prefix boundary off by one fact" 's/Math\.floor\(Math\.min\(first, n - 1\) \/ STRIDE\)/Math.floor(Math.min(first + 1, n - 1) \/ STRIDE)/'
check "final fact hashed with its trailing comma" 's/hash\.update\(i === n - 1 \? text\.subarray\(0, text\.length - 1\) : text\);/hash.update(text);/'
check "stale prefix states are never dropped" 's/if \(this\.#marks\.length > reusable \+ 1\) this\.#marks\.length = reusable \+ 1;//'
check "prefix state captured one fact late" 's/i % STRIDE === 0\) this\.#marks\.push/i % STRIDE === 1) this.#marks.push/'
check "overwrite reported as an insertion after the changed fact" 's/if \(first < 0\) first = keys\.length;/if (first < 0) first = keys.length + (oldKeys[at] === key ? 1 : 0);/'
check "new facts always appended instead of merged in key order" 's/const at = lowerBound\(oldKeys, key, from\);/const at = oldKeys.length;/'
check "header lacks the campaign identity check" 's/ \|\| next\.campaign_id !== this\.#campaignId//'
check "stale cached order reused for a state it was not built from" 's/if \(this\.#aligned !== pre && !this\.#rebuild\(pre\)\)/if (false)/'
check "ordering by code point instead of UTF-16 code unit" 's/const compareKeys = \(a: string, b: string\): number => \(a < b \? -1 : a > b \? 1 : 0\);/const compareKeys = (a: string, b: string): number => { const x = [...a], y = [...b]; for (let i = 0; i < Math.min(x.length, y.length); i++) { if (x[i]!.codePointAt(0)! !== y[i]!.codePointAt(0)!) return x[i]!.codePointAt(0)! < y[i]!.codePointAt(0)! ? -1 : 1; } return x.length - y.length; };/'
echo "survivors/unapplied: $survivors"
exit "$survivors"
