# F-014B replay prerequisite: evidence v2 (two further genuine scenarios)

Extends `../f014b-replay-prerequisite/` (commit af50b26, tree digest 2b421204...b220), which is left **byte-for-byte untouched**. This directory has its own manifest.
Written by the pristine main build `d0bcb615fd91cd3b10322fd8ff80964db42b7797` (Node 22.22.2, pnpm 10.33.0); nothing here changes runtime behaviour.

## Scenarios (both lawfully constructible on pristine main)
- `lane-x-occurred-aftermath-600`: target 600; five stages; seal with the notice occurrence; Health close; recipient authorization; receipt; reconcile (`SEALED_RECONCILED`).
- `lane-x-interrupted-resumed-900`: target 900; INTERRUPTED seal; the same aftermath; decision opportunity; test-authorized choice; resume; reconcile (`SEALED_RECONCILED`).

## Base self-reopen control (run first): `results-v2/verify-base.json`
Both open on the pristine base with the replayed head equal to the recorded head, slot `SEALED_RECONCILED`, the seal retry returning the original receipt, and (scenario B) the resume retry idempotent with the head unchanged.

## Custody and safety
- Keys come from the PUBLIC deterministic test seed in `../f014b-replay-prerequisite/tools/deterministic-keys.ts` (derived at test time, never stored). No private key is in any file.
- The ORIGINAL signed authorizations the scenarios need (recipient delivery, the choice) are **retained** in each `meta.json` as public signed bodies and signatures and reinstalled before opening; they are not reconstructed from the candidate group.
- Reproduce: apply `../f014b-replay-prerequisite/patches/test-support-fixed-keys.diff`, then `patches/test-support-authorization-retention.diff` (test support only), copy the two tools plus `deterministic-keys.ts` into `tests/integration/`, and run with `G1_EVIDENCE_OUT=<the parent of journals-v2> G1_BUILD_COMMIT=<commit>` (generator) or `G1_BUILD=<label>` (verifier).
- `SHA256SUMS` lists every other file here; recompute it.

## Not shown
The refusals of PR #146 and #148 on these two scenarios; any build other than the pristine base; negative journals; the repair itself.
