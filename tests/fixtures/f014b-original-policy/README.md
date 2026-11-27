# F-014B original-policy fixtures (byte-identical genuine journals)

Campaign packages written by the **pristine main build `d0bcb615fd91cd3b10322fd8ff80964db42b7797`** (Node 22.22.2), so each carries the policy
that build wrote: the G0 workshop history identity and catalogue digest `81f6ccda…`. They are the fixtures the original-policy resolver is
tested against, instead of journals the candidate build wrote about itself.

| directory                             | what it is                                                                                            |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `lane-x-active-quiet-target`          | Lane X, target 200: wait ACTIVE, no stage yet                                                         |
| `lane-x-staged-seal-900`              | Lane X, target 900: five stages and the GM seal (SEALED_UNRECONCILED)                                 |
| `lane-x-occurred-aftermath-600`       | Lane X, target 600: occurrence, Health close, recipient receipt, reconcile (SEALED_RECONCILED)        |
| `lane-x-interrupted-resumed-900`      | Lane X, target 900: INTERRUPTED seal, aftermath, decision opportunity, test-authorized choice, resume |
| `b2-zero-stage-reconciled`            | B2 zero-stage lifecycle, reconciled                                                                   |
| `b2-zero-stage-reconciled-at-7281045` | the same lifecycle written by an EARLIER main build (`7281045`)                                       |

Provenance: `docs/evidence/f014b-replay-prerequisite{,-v2}/` on the evidence branch (`evidence/f014b-replay-prerequisite`, commit
`7aed15ddc1b2ec3b3fc91bdb223cd7b23c33c26e`); the package bytes and `meta.json` files here are copied from there unchanged. `SHA256SUMS` covers every file
here and the test recomputes it before it opens anything. Regenerating from the same pristine build reproduces the package bytes.

`authorizations.json` (the two v1 Lane X journals only) is **new to this directory**: the v1 evidence did not retain the owner's signed per-wait authorization
(its verifier re-derived it from the identical opening state). A successor build does not have that identical opening state, so the original is retained
here: pristine main re-ran `authorize()` on the identical opening state and exported the PUBLIC signed bodies and signatures. The base control reopening
with it is part of the test run; the v2 journals carry theirs inside `meta.json`.

Custody: keys are derived at test time from a **public, non-secret, domain-separated seed** (`tests/support/deterministic-keys.ts`); no private key is stored anywhere
in this directory. The seed authenticates nothing real.
