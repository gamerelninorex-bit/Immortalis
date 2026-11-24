# F-014B P-7 E1 — native DIRECT_OBSERVATION receipt/latency witness (TEST-ONLY, READ-ONLY)

**Builder evidence for BLUE's independent exact-HEAD review. MECHANISM ONLY (T1). Certifies no route member, no actionable knowledge time and no wait interruption; the aggregate stays NOT_ACCEPTED.**

| Item                | Value                                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assignment          | The Sovereign appointed me Builder for the pinned brief in session ("You're the builder"). No separate E1 issue exists; the ACK is on #124: https://github.com/gamerelninorex-bit/Immortalis/issues/124#issuecomment-7131472915. #142 was not reused. |
| Authoritative brief | BLUE P7-E1 Native Direct-Observation Witness, Scoped Hard Preflight PASS, Notion `42220af9-01e0-811b-8857-f7647cabc51d` (fetched `as of 2026-11-24T11:27:30.452Z`).                                                                                   |
| Baseline            | `main` = `1c294e65a22dae3f01e4fcc6225d79233eeaad71` (the #143 merge); exact-main push CI 45378738519 `completed / success`. The branch was cut from it. Neither #140 nor #141 was touched or used.                                                    |
| A8 custody          | All nine artifacts in brief §6 hashed to the recorded byte counts and SHA-256 at that SHA before any edit: 9/9 MATCH. No new external artifact.                                                                                                       |
| Toolchain           | Node `v22.22.2` (official tarball, SHA-256 verified), pnpm `10.33.0`, `--frozen-lockfile`. Exact HEAD and terminal CI are recorded in the PR conversation (a commit cannot contain its own hash).                                                     |

## 1. What was built

| File                                                                     | Role                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/support/p7-section10/native-observation.ts` (new)                 | the read-only native journal witness, the cut view and a read-only forged-fixture overlay                                                                                                                                                                  |
| `tests/integration/p7-e1-direct-observation.test.ts` (new)               | E1-01 … E1-08 against real campaigns built by the shipped observation path                                                                                                                                                                                 |
| `tests/conformance/p7-e1-boundary.test.ts` (new)                         | static boundary: read-only store type, no write tokens, under `tests/`, outside the AST roots, E0 import set unchanged                                                                                                                                     |
| `tests/support/p7-section10/proof.ts` (**the one existing file edited**) | a narrow change: an optional `nativeObservation` witness in the checker context, two diagnostic reason codes, and a fail-closed gate on the `DIRECT_OBSERVATION` branch. Every earlier negative reason is kept and still fires first. No import was added. |

Nothing outside `tests/` changed: no production file, AST root, catalogue pointer, manifest, generator, scope lock, CI file, public export, #140 or #141. The five sentinels are unchanged.

## 2. The gap this closes

E0's `DIRECT_OBSERVATION` branch could close the knowledge/latency obligation on a **derivable** receipt: the event is observation-earned, and the Epistemic owner's derivation would produce a packet. That is not the receipt the owner **committed**. E1 makes the route close only when the actual journal, at a named cut, shows the committed receipt. Without a witness the route fails closed (`NATIVE_RECEIPT_EVIDENCE_ABSENT`).

## 3. How the witness proves it (it reads the real journal and reuses the owners' own functions)

For one event and character at one cut, it verifies, and refuses with a test-local diagnostic code otherwise:

1. The event key and id are the **derived** ones (`observationEventId`), for this character at this basis; it is the **journal's own fact** (full fact equality, including version and provenance), visible at the cut, written by a committed group of this campaign.
2. **The owner's own verifier** `observationEventViolation(…, "VERIFICATION")` re-derives it from its retained direct-perception decision and premises, and `recipientBoundaryViolation` confirms the Role Registry binding names the character.
3. The actor packet and the sealed engine provenance were committed in **one group**, whose identity is the packet stage's own (`stageGroupId`), after the event group and no later than the cut, in separated secrecy classes, and equal what **`deriveAccessProducts`** determines.
4. A sealed NOW-only **Temporal transaction** names that exact stage, group, intent, receipt revision, group hash and written versions, with no engaged object or boundary, one basis and unit throughout, `TARGET_REACHED`, and was sealed after the formation.

It holds only the store's read methods (`head`, `getFact`, `lookupReceipt`, `committedGroup`, `committedGroupById`); the type has no commit and no close, and a static test pins that.

## 4. E1-01 … E1-08

| Test  | What it falsifies                                                                                                                                                                                                                                                                                                                                                                                                             | Result (mechanism only)     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| E1-01 | The native positive closes the route's knowledge/latency obligation **only** with the witness; the same evidence without it is derivable and does **not** close. Journal and Epistemic integrity are clean.                                                                                                                                                                                                                   | PASS at exact HEAD (see CI) |
| E1-02 | Same scene with only an opaque screen: the owner refuses, no event/packet/provenance/transaction exists, and the positive campaign's event never closes against this journal.                                                                                                                                                                                                                                                 | PASS                        |
| E1-03 | An **earlier real journal cut** (event committed, formation not yet) closes nothing, including an event-only re-derivable payload; hiding the packet, the provenance or the seal each refuses; a cut exactly at the formation (seal not yet committed) refuses.                                                                                                                                                               | PASS                        |
| E1-04 | Wrong character, an authored (non-observation) event, forged fields (version, committing group, source pin, basis, payload), and a table of **14 single forged or displaced records, each refused for its own reason** (decision chain, event group, PC binding, provenance, secrecy, one stage group, group writes, campaign identity ×3, seal trigger, seal stage, seal writes, seal order, schema-refused engaged object). | PASS                        |
| E1-05 | One clock and unit across event, packet and seal; no registered object, no boundary index entry, canonical time unmoved; an advanced stop or another unit refuses; a changed basis is a different event.                                                                                                                                                                                                                      | PASS                        |
| E1-06 | The actor packet carries no event id, source key, provenance key or engine reference; sealed provenance stays engine-side; with the default Health, first-option and history authorities the member is still `NOT_PROVEN` (`ABILITY_UNKNOWN`, `FIRST_OPTION_UNPROVEN`, `HISTORY_NOT_RETIRED`).                                                                                                                                | PASS                        |
| E1-07 | Head revision, state hash, journal length, fact count and boundary index are identical before and after every check; the shipped `formObservedPacket` replay is a no-op; after close and reopen the same evidence still closes with no re-roll.                                                                                                                                                                               | PASS                        |
| E1-08 | With the receipt and the witness present, the whole real catalogue is still 0 proof-closed, every sentinel is unchanged, the aggregate is `NOT_ACCEPTED`. The original observation suites, E0 suites, F-1, the generator check and the earlier scope locks are run unchanged in CI.                                                                                                                                           | PASS (CI)                   |

## 5. Mutation probes (refuting a superficial pass)

I broke each guard of the gate and the witness on purpose and ran the E1 suite: **20 of 22 probes were killed.** The two survivors are redundant layers, not gaps: (a) the "event key equals the derived key" term, which sits in front of journal equality and the identity derivation and so is covered by them; (b) the witness's explicit "no engaged object or boundary" check, which sits behind the transaction schema, which already refuses an engaged object in a zero-span seal (the forged case reports `TRANSACTION_INVALID`). Bypassing the packet, provenance or seal requirement fails E1-03; the wrong clock or recipient guards fail E1-04/05. These runs are the Builder's and BLUE has not re-executed them.

## 6. Whole-operation cost (deterministic work counters; no throughput claim)

Per verification of the real campaign: 22 exact-key fact reads, 24 receipt lookups, 24 committed-group-by-id reads, 2 head reads, 0 listings or scans; the second run is identical. The campaign has 18 facts, so growth with unrelated state is argued from the access pattern (exact-key reads only; the store type exposes no listing) and **not** measured by a controlled-growth fixture. The E1 integration file, which builds two real campaigns, takes about 7 s on the 4 vCPU container. Nothing runs on any production path.

## 7. Limits, stated plainly

- **T1 mechanism only.** The referee decision is the shipped scripted-host seam, not genuine LLM reasoning, an actual client or retained production storage. Those are UNRUN.
- **The forged fixtures are read-only overlays** on a real store; they write nothing and are labelled as forged.
- **The route is not a certified member.** Health ability, first option and history stay at their refusing defaults. The E0 member checker still queries the ability and first-option authorities with `modality: "SPEECH"` for every route (my E0 limitation, already excluded by the brief); E1 neither uses nor extends it, and does not infer sight.
- **Not done:** original in-X recipient-stage evidence, any interruption, S4, all-enrolled acceptance, the scheduled (`NON_OBSERVATION_ACCESS`) route's native proof, and any production path.
- **The cut view hides a fact whose committing group committed after the cut.** That is exact for create-only receipt records and not a general historical reader.

## 8. Reproduce

```
node --version                                   # v22.22.2
pnpm install --frozen-lockfile
node --disable-warning=ExperimentalWarning --experimental-strip-types tools/gen-gm-wait-catalogue.ts --check
pnpm exec vitest run tests/integration/p7-e1-direct-observation.test.ts tests/integration/observation-foundation.test.ts tests/integration/observation-temporal.test.ts tests/integration/p7-section10-evaluator.test.ts tests/conformance/p7-section10-proof.test.ts tests/conformance/p7-e1-boundary.test.ts
pnpm run ci
```
