# Note on the F-014B replay-prerequisite evidence: the empty `history/` directory

Applies to `docs/evidence/f014b-replay-prerequisite/` and `docs/evidence/f014b-replay-prerequisite-v2/`. Neither directory is changed by this note;
their recorded tree digests stay valid (`2b421204d460006a9d167841b8c28ec2d572afed7fb0660ac23c6678d9fdb220` and `b260bc7e7df0e0596a4a8d3c7ce789e6e71ee8e145558e98b10c9ea53aa4b6b9`).

## What is missing

A closed campaign package has an empty `history/` directory beside `journal.jsonl` and `manifest.json`. **Git cannot store an empty directory**, so the
journals as pushed here do not contain it. A reproducer who copies a `package/` directory and opens it will, on any build that has to replay strictly,
fail while writing its history index (`ENOENT … history/index.….json.tmp`, surfaced as `INTEGRITY_JOURNAL`), which hides the real outcome.

**Fix for a reproducer:** `mkdir <copy>/history` after copying a package, before opening it. An empty directory carries no evidence and no checkpoint.

## What this does and does not change

- The results under `results/` and `results-v2/` were produced from the original scratch packages, whose `history/` directory existed. Under an identical
  history identity such a package may be reopened from its checkpoint; under a different identity it is replayed strictly. No recorded outcome here is
  withdrawn or altered by this note.
- A later check, **not** part of the pushed results, removed any checkpoint and replayed the same journal bytes on pristine main `d0bcb615`: both a core-level
  replay of every entry (45 and 51 entries for the two v1 Lane X journals) and `CanonicalCampaign.open` succeeded. So the base control does not depend on a
  checkpoint cache hit. That measurement lives in PR #149 (`tests/integration/f014b-original-policy-replay.test.ts`, which vendors the same journal bytes
  and recreates `history/` through `fixtureCopy`).
- Renaming a build's history identity is **not** a valid way to force strict replay: the stage witness compares markers with the admission's own identity and
  refuses (`KEY_NOT_ADMITTED`, revision 46). Remove the checkpoint instead.
