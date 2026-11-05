# Legacy package produced by the exact base build

`package/` is a real campaign package written by the BASE build `eafbb127c476cafb8498316e496de29e078a2146` (before any Initial Locality
Bootstrap v0.9 surface existed), under the UNEDITED Runtime Contract snapshot `spec/f027/runtime-contract.md`
(sha256 `ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd`).

It was produced, unmodified, by `tools/bootstrap-benchmark.sh`'s `seed plain 0` step: `git archive eafbb127... | tar -x`, then
`node --experimental-strip-types tools/bootstrap-benchmark.ts seed plain 0 <dir>` run inside that base tree (campaign `campaign-bench`,
build id `bench-seed`). Three journal entries (a world profile, a locus and a finite source) and the base's own manifest, checkpoint
policy and format-v1 backups.

Not stored here: the package's EMPTY `history/` directory (git cannot track an empty directory). The test recreates it, exactly as the
base's package had it. Nothing in this directory is a live campaign; it is synthetic fixture data.

Used by `tests/integration/legacy-package-compat.test.ts` to prove, with a package this build did not write, that the declared
pre-v0.9 Runtime Contract hash opens, replays, takes an ordinary commit, reopens and strictly replays, with its old bytes preserved,
and that every v0.9 surface is refused inside it.
