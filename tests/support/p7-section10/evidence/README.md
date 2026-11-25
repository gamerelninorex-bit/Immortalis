# F-014B P-7 E0 — §10 source-closed proof checker and earliest-choice evaluator (NONWRITING)

**Builder evidence for BLUE's independent exact-HEAD review. MECHANISM ONLY (T1). Not a certified wait, not a classification, not an acceptance of full P-7.**

| Item                     | Value                                                                                                                                                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assignment               | GitHub issue #142 (BLUE → Claude Code, Sovereign directive 24 Nov 2026). The ACK was posted on the issue before any code.                                                                                                                                         |
| Authoritative brief      | BLUE P-7 Hard Preflight PASS and bounded build handoff, Notion page `42220af9-01e0-81d7-9002-e799567e0e7c`, native pin `2026-11-24T00:22:21.665Z` (fetched `as of` that pin).                                                                                     |
| Baseline                 | `main` = `728104565662fece3e76be5b94c28f3c4201dbb7`; post-merge CI run 45145977301 `completed / success`.                                                                                                                                                         |
| Branch                   | `claude/new-session-jx7ofm`: the session's one assigned branch, cut from the baseline, no other commits.                                                                                                                                                          |
| Exact HEAD / terminal CI | Recorded in the PR conversation and the final handoff. A commit cannot contain its own hash.                                                                                                                                                                      |
| Toolchain                | Node `v22.22.2` (official tarball, SHA-256 `88fd1ce767091fd8d4a99fdb2356e98c819f93f3b1f8663853a2dee9b438068a`, equal to nodejs.org `SHASUMS256.txt`); pnpm `10.33.0`; `pnpm install --frozen-lockfile`.                                                           |
| A8 custody (read-only)   | `tools/gen-gm-wait-catalogue.ts --check` → `OK 7707ff8ec86a9564dae2b026e730386f26fadfd4011c2934d0cc19dd5a6f09ed 384843 bytes`. The three retained manifests hash to their filenames (`7707ff8e…`, `e9049723…`, `f3393ad4…`). No new indispensable external bytes. |

## 1. What was built (all additive; no existing file is modified)

Everything lives in **one new directory**, `tests/support/p7-section10/`, plus two new test files (the reason is §2).

| File                                               | Role                                                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/support/p7-section10/proof.ts`              | per-member proof/certificate checker; all-enrolled member enumeration; coverage/gap report; closed table of governing sources at exact pins; integration-seam statement |
| `tests/support/p7-section10/evaluator.ts`          | pure internal candidate evaluator of the earliest genuine PC choice and the PC's knowledge time; the constant GM/player-facing projection                               |
| `tests/support/p7-section10/audit.ts`              | optional build-time audit runner (read-only): prints the production-default gap report                                                                                  |
| `tests/support/p7-section10/fixtures.ts`           | fixtures, including three LABELLED test-double authorities                                                                                                              |
| `tests/support/p7-section10/evidence/`             | this report and `gap-report.json` (the production-default gap report)                                                                                                   |
| `tests/conformance/p7-section10-proof.test.ts`     | P7-01, 10–16 against the real manifest, census and sources (18 tests)                                                                                                   |
| `tests/integration/p7-section10-evaluator.test.ts` | P7-02…09, 14 against real in-memory campaigns built through the original owner adapters (32 tests)                                                                      |

## 2. Material finding for BLUE: the suggested file locations collide with two existing locks

The brief suggests `packages/engine/src/gm-wait-section10-proof.ts`, `tests/…` and `docs/evidence/f014b-p7/`. Two independent mechanisms already in the repository refuse those placements. Neither can be satisfied without editing a surface the order forbids, so I placed everything under `tests/support/p7-section10/`. Please confirm or direct otherwise.

**(A) The catalogue digest fingerprints every source file.** `policy.source_policy.files` hashes every `.ts` under `apps`, `packages/contracts/src`, `packages/engine/src`, `packages/operator/src` and `packages/protocol/src`. A new module there changes the catalogue digest (observed: `SOURCE_POLICY_CHANGED` per new file, `generate().digest ≠ 7707ff8e…`). That forces regeneration of `gm-wait-catalogue-current.ts` and a new manifest, the exact files the order forbids touching and which #140 and #141 both change.

**(B) Earlier slices pin their changed-path sets in conformance tests.** I first placed the modules under `tools/` and the report under `docs/evidence/f014b-p7/` (outside the AST roots, so (A) did not apply). The full local `pnpm run ci` then failed six existing scope-lock tests in `a0-scope`, `b1-s1-scope`, `b1-s2s3-scope` and `b2-scope`, each showing exactly my new `tools/…` and `docs/…` files as undeclared. By repository convention a later slice declares its own paths by **editing those earlier tests and their `*-scoped-deltas.ts` support files**. The order forbids editing existing conformance snapshots, and P7-15 requires them to pass unmodified. Those locks explicitly exempt `tests/` (`!p.startsWith("tests/")`).

So all new files are under `tests/`, in one directory. Verified: the generator reproduces the current digest and bytes exactly (asserted in `p7-section10-proof.test.ts`), and no existing test file or support file is touched.

**Consequence for the later integration PR (not this one):** production code under `packages/engine/src` will correctly enter the source-policy fingerprint and change the digest, and it will need its own scope-lock declarations. That is how the repository is designed, and that PR does it under its own authority. A scope amendment from BLUE would let a later PR move these files; P7-E0 itself needs none.

## 3. Source-fidelity account

Nothing here introduces an owner, facet, kind, key space, admission value, StageKey, wire, threshold, calibration, default probability or gameplay cap. The checker's certificate is internal candidate engineering data and is not a source kind. Every semantic below is read from the cited source or from the owner's own code.

| Source (pin)                                                     | What the code takes from it                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two-Blocker v0.3 §8.1(2) (`2026-11-11T02:29:27.464Z`)            | The fifth class is legitimate only after a complete evaluator for all enrolled members. The checker never assigns a class, and the aggregate is the literal `NOT_ACCEPTED`. A certificate must cite this clause (or R-9, N9.2/N9.4) at its exact pin.                                                                                                    |
| Two-Blocker §8.1(3)–(4)                                          | Comprehension, significance and standing-contingency discretion stay the GM's write-once verdict: the evaluator reports `comprehension: NOT_EVALUATED_GM_WRITE_ONCE_VERDICT_REQUIRED`. PAUSED/INTERRUPTED writers are untouched.                                                                                                                         |
| RED terminal R-9, P-7, T74, T85 (`2026-11-22T13:02:53.745Z`)     | Each member needs its own certificate; no proof by label or digest; extension history is SKIPPED and stays open (`EXTENSION_HISTORY_SKIPPED_IN_SOURCE`). R-H.1: Health is not installed, so the ability authority reads UNKNOWN by default. P-5: the first option is unretired, so that authority proves nothing by default.                             |
| BLUE final decision N9.1–N9.8 (`2026-11-22T12:38:56.838Z`)       | N9.1 all-enrolled members, dormant included. N9.3 earliest lawful material choice, event/observation/transmission/knowledge time kept distinct, and the five negative-twin classes (no-op, omitted group, historical version, absent new fact, same-instant competitor). N9.4 the certificate coverage list. N9.7 history and the extension group.       |
| Temporal Kernel v2 §10, §15 (`2026-10-23T09:37:46.817Z`)         | §10 is the evaluator's order of questions. §15: a same-instant competitor must be causally ordered (one stage reads what the other produces); with no edge it is not a bookkeeping tie, so it refuses credit rather than being ranked.                                                                                                                   |
| Epistemic Access v2 §2.1, §4.4, §21 (`2026-10-23T12:28:14.041Z`) | F-014D supplies access-established evidence and Temporal owns Knowledge Time, so knowledge time is the **later** of the access-established basis and the packet-formation boundary. A packet cannot form before its access exists. A BROADCAST_EXPOSURE event is never individual receipt. Receipt is decided by the owner's own `deriveAccessProducts`. |
| v0.6 §5.2, §5.3, §10 (`2026-11-11T00:34:47.360Z`)                | No T0 read and no hidden future query are added. The evaluator's reads are the supplied evidence, one boundary-index fact and the in-window entries; see §6.                                                                                                                                                                                             |
| Operating Charter / GM-first (`2026-11-22T14:44:04.613Z`)        | Mechanism-only, non-GM-facing: no player question, no confirmation, no routine micro-lookup. GM-facing disclosure is one constant (`WITHHELD_PENDING_PROTECTED_RESULT`).                                                                                                                                                                                 |

Two readings I chose and that BLUE should confirm:

1. **Knowledge time = later of access-established and packet-formation boundary.** An authored access event is admitted only with `established_at ≤ now`, and its packet forms at a later earned boundary. A rule "access must not precede the owner event" would therefore refuse every lawful current-source fixture. I derived the rule from F-014D §2.1 instead. The contradiction that remains refused is a packet boundary earlier than its own access (`PACKET_PRECEDES_ACCESS`).
2. **Member verdicts are bound to a catalogue digest, not to a campaign.** A `PROOF_CLOSED_CANDIDATE` verdict says a member of that catalogue has closed its obligations on its witnesses. The evaluator re-checks the digest and refuses a verdict that is not issued by the checker.

## 4. Design limits (explicit, not hidden)

- **Witness-based, not universal.** A certificate closes when real committed owner facts witness each obligation and the owner's own derivations agree. It is necessary evidence, not a proof that every possible execution is safe. Sufficiency stays with the later independently accepted evaluator, which is why the aggregate cannot be accepted here.
- **Negative-twin witnesses are structural.** A twin shows a fact is committed in the real history and absent in a separately committed one. That evidences dependence on the cause, not that the set of earlier possibilities is complete.
- **No inapplicability posture.** The brief names no source-closed absence evidence, so every member needs positive witnesses. Truly inert members (most of the 124 kinds) cannot close in this slice. This is default-deny, and a later brief must define absence evidence.
- **Registration sites and object-registration routes** (18 + 30) are not attributable: the census links providers to sites but not which route a site opens. They stay open as `ROUTE_ATTRIBUTION_NOT_DEFINED`.
- **The extension group** can never close against a v2 manifest (its schema literal is `UNRETIRED_DENY`).
- **Boundary-index completeness.** The evaluator forces every _scheduled_ packet formation inside the window to be a named candidate (an omitted earlier candidate is refused as `CANDIDATE_OMITTED`). Access routes that are not scheduled through the index (direct-observation triggers, authored events with no object) rest on the route proofs and the twins.
- **UNRUN positive:** the `DIRECT_OBSERVATION` route has its negative twin (an authored event is `EVENT_NOT_OBSERVATION_EARNED`) but no positive fixture was built.

## 5. P7-01 … P7-16

All results are T1 (scripted/host-neutral mechanism, real in-memory owners). "PASS" below means the named tests passed at the exact HEAD, and nothing stronger.

| Test  | Falsifier                                                                                                                                                                                                                                                 | Where                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| P7-01 | member list recounted by hand from raw manifest bytes; current vs stale vs unknown vs forged retained digest; real census clean                                                                                                                           | conformance, "P7-01 …" (3)                               |
| P7-02 | owner-fact reference re-read (stale version, forged group, wrong owner/facet, wrong value digest, absent key); wrong member; wrong pin/page/clause; digest-only and source-only certificates; self-asserted verdicts; duplicate/ghost certificates; twins | integration, "P7-02 …" (7 + 1)                           |
| P7-03 | non-hardcoded: first-option lag moves the earliest choice; past the target refuses; defaults refuse                                                                                                                                                       | integration, "P7-03 …" (5)                               |
| P7-04 | another recipient ⇒ no interruption; capability not yet closed ⇒ unknown; failed original read; no route ⇒ unknown; broadcast is not receipt; distinct stage times reported                                                                               | integration, "P7-04 …" and the Epistemic-routes test (5) |
| P7-05 | earlier candidate wins against the later due event; omitting it is refused; missing negative twins ⇒ unknown                                                                                                                                              | integration, "P7-05 …" (1)                               |
| P7-06 | an independent same-instant stage refuses credit; one that reads this packet is ordered                                                                                                                                                                   | integration, "P7-06 …" (1)                               |
| P7-07 | unknown ability refuses; impaired ⇒ no receipt; standing-instruction ledger unread ⇒ unknown                                                                                                                                                              | integration, "P7-07 …" (2)                               |
| P7-08 | the GM/player-facing projection is one constant, with no event key, instant or unit                                                                                                                                                                       | integration (1)                                          |
| P7-09 | actor, model and GM assertions are not evidence kinds; a mismatched authority id never closes                                                                                                                                                             | integration (2)                                          |
| P7-10 | v1 archive is not a v2 catalogue; stale digest; history has no retired segment; extension group skipped; retained bytes unchanged                                                                                                                         | conformance (2) + P7-01                                  |
| P7-11 | added kind; changed predicate body; added dormant provider; new Close/trigger/route/extension owner/structure ⇒ drift detected and every identity open                                                                                                    | conformance (4)                                          |
| P7-12 | five sentinels restated unchanged; aggregate literal `NOT_ACCEPTED`; no positive class appears; a positive-class manifest closes nothing; generator reproduces the digest                                                                                 | conformance (3)                                          |
| P7-13 | imports allow-listed; outside every AST root; not exported from the package index                                                                                                                                                                         | conformance (2)                                          |
| P7-14 | no clock/random/process/network/fs/write tokens; an issued verdict cannot be forged; state digest, journal head and fact count unchanged by checking and evaluating; read set constant                                                                    | conformance (2) + integration (2)                        |
| P7-15 | baseline suites not skipped/focused/todo here; **the full existing suite is the terminal exact-HEAD CI (see the PR)**                                                                                                                                     | conformance (1) + CI                                     |
| P7-16 | every member has an explicit open reason; exact blocker list; later dependencies named                                                                                                                                                                    | conformance (1), `gap-report.json`                       |

**Mutation probe (refutes a superficial pass).** I broke each safeguard on purpose and confirmed the suites fail. All 14 mutants were killed: digest identity, value-digest comparison, recipient check, same-instant competitor, candidate omission, self-asserted-verdict guard, unknown-ability handling, route-proof requirement, first-option handling, twin absence, broadcast-as-receipt, history reader, earliest-choice selection and exclusion twins. The first run left 3 survivors (a vacuous identity assertion and two missing cases). I fixed those before this report, and the vacuous assertion was real.

## 6. Engineering acceptance

- **Intended result:** a technically useful pure checker and evaluator with falsifying tests and a reproducible gap register. It adds no player-facing prompt, GM confirmation or production write, and no routine microquery. **GM-native routine inference: CONFORMS at this non-GM-facing mechanism-only scope.**
- **Reuse:** the catalogue's own verifier (`verifySuppliedDigest`, `catalogueDigest`, `validateManifest`, `catalogueCoverageViolations`), the Epistemic owner's `deriveAccessProducts` and `epistemicPacketDeclaration`, `TemporalObjectSchema`, `BoundaryIndexSchema`. No parallel owner, store, scheduler or ledger.
- **Whole-operation cost (Node 22.22.2, 4 vCPU container, measured with no other load):** the existing census (`buildCensus`) takes ≈2.5 s once; `buildSection10Report` over the real 383 KB manifest, 247 members, with the census prebuilt, takes a median 14.9 ms (min 12.6, max 48.0; 25 runs); the report is 42,991 canonical bytes, deterministic across runs (SHA-256 `8f610e9f2a998e0cff5d6cf351d991fe3e586bc03f55d3864b03aef1079b2329`). **T0 is untouched:** nothing here is called by any production path.
- **Evaluator work counter:** per evaluation it reads the supplied evidence keys, the single boundary-index fact and the index entries _inside the window_. A test registers 12 unrelated engaged objects beyond the target and asserts the **same number and the same set of ledger reads**. Growth that remains: parsing the one boundary-index fact is O(active entries). That is the kernel's own structure and is not changed here.
- **Provisional limits and reconsideration triggers:** (a) the three test-double authorities, until the Health owner, a retired first-option owner and per-segment history exist; (b) the witness-based checker, until the later evaluator acceptance defines inapplicability evidence; (c) the module location under `tests/`, until it is integrated under `packages/engine/src` with its own digest regeneration and scope-lock declarations.
- **Boundary:** mechanism only. T2 (genuine AI GM), T3 (named client) and retained restart are **UNRUN** and not claimed.

## 7. Changed-file boundary and concurrency (P7-13)

Only new files are added (the files in §1; the earlier commit on this branch placed some under `tools/` and `docs/`, and the next commit moved them: see §2(B)). No existing file is modified. In particular **untouched:** `packages/engine/src/gm-wait-catalogue-current.ts`, every manifest, `tools/gen-gm-wait-catalogue.ts`, `packages/engine/src/gm-wait-catalogue.ts`, `gm-wait-custody.ts`, the owner registry and every owner/Temporal writer, existing conformance snapshots, `apps/phone`, and the #140 / #141 branches. The five source sentinels are read and reported, never changed.

Rebase plan after #140 / #141 merge: nothing in this PR names a catalogue count or digest literal other than the archive digest `f3393ad4…` (stable). The tests read the current digest from `GM_WAIT_CATALOGUE_CURRENT_SHA256`. Re-run `pnpm run ci`, then re-run `node --disable-warning=ExperimentalWarning --experimental-strip-types tests/support/p7-section10/audit.ts --out <file>`. New B3 kinds and providers enter as new, uncertified, `NOT_PROVEN` members automatically, and `gap-report.json` here is then historical for digest `7707ff8e…`.

## 8. The later integration seam (not installed; not reachable from this PR)

Exported as `P7_INTEGRATION_SEAM_STATEMENT` and described in `proof.ts`. Attachment points after full P-7 acceptance only:

- **S4 new-INITIAL admission:** the fixed verified catalogue verdict stays the only T0 read; a future verdict derives from the aggregate and remains NOT_ACCEPTED until every member is proof-closed and the evaluator is integrated.
- **Inside an OPEN X at an owner due boundary I:** the protected Temporal coordinator, before it credits time or publishes an owner effect that would pass the earliest feasible PC option, calls `evaluateEarliestChoice` on evidence read at the actual causal cut.
- **Non-actionable verdict:** still needs the GM's write-once verdict (Two-Blocker 8.1(3)) where discretion exists.
- **Private PAUSED / disclosed INTERRUPTED:** written by their owner-bound writers (Two-Blocker 8.1(3)–(4)); the evaluator only selects WHEN the first option is reached.
- **IF-6b:** the original-owner stage witness supplies `OWNER_STAGE_ROUTE` evidence for the notice stage. **B3:** a new kind or provider is a new member with no certificate.

## 9. Holds preserved

Full P-7, S4 positive writer and first playable GM wait, `INTERRUPTION_GUARDED` classification, F-014B LC-01…LC-16, D3(b)/R-DUTY/R-H, P-1…P-6, H-07, OB-030 retained restart and the paid-storage park are all **unchanged and unaccepted**. No merge, deployment, spending, credential, Notion edit, live-campaign access or source-law change occurred.

## 10. Reproduce

```
node --version                                   # v22.22.2
pnpm install --frozen-lockfile
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/gen-gm-wait-catalogue.ts --check
pnpm exec vitest run tests/conformance/p7-section10-proof.test.ts tests/integration/p7-section10-evaluator.test.ts
node --disable-warning=ExperimentalWarning --experimental-strip-types tests/support/p7-section10/audit.ts --out gap-report.canonical.json
pnpm run ci
```

## 11. BLUE review F-1 repair (same PR; review object `f189f1d90b85d141866f41dd29207b8ce35b0322`)

**Defect (confirmed, and reproduced before the fix).** `compareTime` returns `null` for different clock units. In `evaluator.ts` a helper turned `null` into `NaN`, `laterOf` then silently selected the first option's instant, the after-target guard did not reject `null`, and the relation to the owner event was defaulted to `AT` through `?? 0`. A first-option authority answering on another clock could therefore yield a spurious `CANDIDATE_EARLIEST_CHOICE`. I wrote the negative twins first and ran them against the unrepaired code: **three failed with a spurious `CANDIDATE_EARLIEST_CHOICE`**.

**Repair delta (one file of logic: `tests/support/p7-section10/evaluator.ts`, plus one coded reason in `proof.ts`).**

- `laterOf` now returns `null` for an incomparable pair; `cmpTime` and every `?? 0` / `NaN` fallback are removed. No instant is guessed, ordered or defaulted.
- New coded reason `CLOCK_UNIT_MISMATCH` (private `NOT_PROVEN`). Applied at each time comparison on the path: knowledge time (access basis vs packet boundary), first-option instant vs knowledge time, choice instant vs target, earliest vs the other candidates, and the relation to the owner event.
- **Nearby null-fallback found by the review of neighbours:** an active-boundary-index entry on another clock than the window was skipped silently, which disabled the candidate-omission and same-instant checks. It now refuses. The same hole existed for the same-instant test against the owner event.
- `proof.ts`: a packet boundary and an access basis on different clocks now report `CLOCK_UNIT_MISMATCH` instead of being folded into `PACKET_PRECEDES_ACCESS`.

**New tests (5, integration, using the existing positive original-owner scene).** A foreign-unit `AVAILABLE_AT` is `NOT_PROVEN`; the same-unit twin still yields the positive. A foreign value that is earlier, equal, later and far beyond the target (−30, 0, +7, +500) is refused each time. An index recast onto another clock is refused. A forged but self-consistent access event on another clock than its own packet boundary is refused. Each asserts `certified: false`, `writes: []`, `visibility: PRIVATE_INTERNAL`, no `instant` field, the constant GM/player projection, and an unchanged journal head and fact count. The pre-existing "window on another clock" refusal is kept as a test.

**Mutation probe of the repair.** The guards are layered, so each one alone is redundant by design. Removing a single layer survives, because a backstop still refuses; removing the whole first-option layers together is killed (2 failures), the whole packet/access layers together is killed (1 failure), and restoring the silent index skip is killed (1 failure). I had said one backstop was unreachable; with the upstream layers removed it is reachable, and I corrected that here.

**Unchanged and not touched:** the catalogue digest, the earlier slices' path locks, #140, #141, the five source sentinels. The later-of knowledge-time computation remains an internal conservative candidate; its exact positive integration stays source-fidelity-gated, as BLUE's source note says.
