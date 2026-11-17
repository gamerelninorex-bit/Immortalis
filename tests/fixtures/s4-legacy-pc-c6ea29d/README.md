# Authentic pre-S-4 campaign packages (the legacy witness for START_OF_LEDGER / L-2)

`activation/package/` and `handover/package/` are REAL campaign packages written by the pre-S-4 base build, main
`c6ea29d3ccd7cadb83a622dc47704f449f63513b` (PR #106 merged), through that build's own `CanonicalCampaign` owner operations. Each
binds a player character under the ORIGINAL binding citation and holds NO Standing Instruction ledger: they are the "authentic
older headless PC binding" the BLUE S-4 brief (Notion native pin `2026-11-17T04:59:46.616Z`, Part B4 "Positive legacy" and
"Historical/cold") requires, and they could not be produced by the S-4 build, whose admission refuses a fresh write of one.

- `activation/`: a world, a locus, a freshly generated PC and the first `ACTIVATION` binding (4 journal entries).
- `handover/`: an existing actor's own state, its World-State coupling, its I-002 compilation and the `EXISTING_ACTOR_HANDOVER`
  binding (13 journal entries). Open it with `ACTOR_FIXTURE_EXTENSION` (the synthetic actor-history owner of the shared testkit).

Nothing here is a live campaign; it is synthetic fixture data. The packages' EMPTY `history/` directories are not stored (git cannot
track an empty directory); the tests recreate them, exactly as `legacy-base-eafbb127` does.

## Reproduction (exact runtime, command and bytes)

```
git archive c6ea29d3ccd7cadb83a622dc47704f449f63513b | tar -x -C <base> && cd <base> && pnpm install --frozen-lockfile
cp tools/s4-legacy-fixture.test.ts <base>/tools/
echo 'export default { test: { include: ["tools/s4-legacy-fixture.test.ts"] } };' > <base>/s4-legacy.vitest.config.ts
S4_LEGACY_OUT=<outDir> pnpm exec vitest run --config s4-legacy.vitest.config.ts
```

The generator (`tools/s4-legacy-fixture.test.ts`) refuses to run on any tree that has the S-4 initializer. It uses no clock, entropy or
host input: two runs on the base tree wrote byte-identical files (verified at construction). Runtime at construction: Node v22.23.4,
pnpm 10.33.0 (the repository pins `.nvmrc` 22.22.2 and `engines` `>=22.22.2 <23`; this runtime satisfies `engines` but is not the exact
`.nvmrc` patch, so these bytes are labelled COMPATIBLE-RUNTIME, not pinned-runtime).

## Byte identity (length, SHA-256)

| file                                           | bytes | SHA-256                                                            |
| ---------------------------------------------- | ----: | ------------------------------------------------------------------ |
| `activation/package/journal.jsonl`             | 14537 | `14169b9cd2c9d42930b38f5296e20e94ae3c70098117c35efeb7ee6a1b8a3207` |
| `activation/package/legacy-journal.v1.backup`  |     0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `activation/package/legacy-manifest.v1.backup` |  2153 | `5bf93e78cb04c9241d951dcb10684cd3010382310859d522107a17752434cba5` |
| `activation/package/legacy-state.v1.backup`    |    83 | `6ff4d42b5144ebe29621baa1e5ee2efecbd485b0bff06d596276a81c0e69d621` |
| `activation/package/manifest.json`             |  2534 | `7a4aa2c527aca509af01dc91942c0b9c226f5c10a557a80aed1fc6a1dbdbceaa` |
| `activation/package/state.0000000000.json`     |    83 | `6ff4d42b5144ebe29621baa1e5ee2efecbd485b0bff06d596276a81c0e69d621` |
| `handover/package/journal.jsonl`               | 46004 | `0814da924eb8f8c652c997bfabc60cef712d9dbd966be4a7a20e0aebbd5a99aa` |
| `handover/package/legacy-journal.v1.backup`    |     0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `handover/package/legacy-manifest.v1.backup`   |  2149 | `0bebaf87357d1acecea5b08a02d44020dc73ca79df3b6c7301b4a7d1447f864e` |
| `handover/package/legacy-state.v1.backup`      |    83 | `6ff4d42b5144ebe29621baa1e5ee2efecbd485b0bff06d596276a81c0e69d621` |
| `handover/package/manifest.json`               |  2532 | `777c8b61619555b5bca423f9ef0bcc689e33a12fd9533dc5293be8a256ef7f14` |
| `handover/package/state.0000000000.json`       |    83 | `6ff4d42b5144ebe29621baa1e5ee2efecbd485b0bff06d596276a81c0e69d621` |

A test (`tests/integration/pc-standing-ledger-legacy.test.ts`) recomputes every length and digest above from the checked-in bytes before
it relies on them, so a changed, regenerated or reformatted fixture fails closed instead of silently becoming a different witness.
