# F-014B A0 — Clock-Origin Technical-Source Lowering (Builder candidate)

**Status: SOURCE-REVISED BUILDER CANDIDATE, amended in place to BLUE's Issue #114 direct decisions (S11, AMEND-HOLD). Not a lock, not a PASS, no production code. A0 construction stays on HOLD until an expressly executed scoped Hard Preflight passes.**

Revision status (20 Nov 2026):

- Binding direction for this revision: S11, [BLUE F-014B Issue #114 Direct A0/B0 Source Decisions — PR #116 Q1–Q5 / #117 OSQ1–12 & K1–K6 — AMEND-HOLD — 2026-11-20](https://app.notion.com/p/41e20af901e08163acb0f8ed695f44ad), native pin `2026-11-20T00:15:08.470Z`, also posted as Issue #114 comment 7026060101. BLUE reviewed the previous revision at draft commit `99b2123bf2b01a518d302a665c605c13e0d25da9`.
- BLUE disposition (S11, verbatim): "AMEND (draft contracts #116/#117 with direct decisions); A0/B0 prospective construction HOLD until scoped Hard Preflight PASS."
- Gate interpretation (S11 §1, verbatim): "current v6.2 HOLD concerns prospective construction, not source text or independent tests of presently existing code. A0 and B0 may be source-revised and exact-file-tested in preparatory, no-new-canon modes now; no production semantic change, new writer or new request interface may be implemented before applicable scoped Hard Preflight PASS."
- This revision:
  - resolves Q1–Q5 (§9) and lowers the rulings into §2, §3.2, §3.3, §3.7, §3.9 and §10;
  - records K1 (§4);
  - adds A0-T00 as a test of existing code only (§6);
  - is accompanied by the A0-only preflight intake `docs/f014b/a0-preflight-submission.md`.
  - No file under `packages/` or `apps/` changes.
- Main: the census below is anchored at `0c9e74b9d5dc8845751a543ace777277b2cb1308`. Main is now `8d25f9067219d944a5262eca06de20e70a5770f3` (PR #115), which changes only `vitest.config.ts`. No census file moved.

Original preparation record:

- Package: F-014B **A0 — clock-origin engine contract** (master issue #114).
- Base: `gamerelninorex-bit/Immortalis` main `0c9e74b9d5dc8845751a543ace777277b2cb1308`.
- Prepared by: Claude Code as the Builder named in the Sovereign's F-014B construction commission (19 Nov 2026).
- Gate state at preparation: BLUE Scoped Lowering v0.5 holds construction of A0/A1/B0/B1/B2. BLUE v0.3 §9 permits "isolated design and fixture planning" for A0 and B0. BLUE Universal Hard Preflight v6.2 (19 Nov) holds the W2 T1 slice because this A0 lowering did not exist.
- Purpose: close the literal field/schema, owner/kind/key/lifecycle, rule, producer, admission-consumer, historical-verifier, MS and compatibility contract that CAL-TIME T-1 grants 1–5 and BLUE v0.2–v0.5 require **before** A0 construction. Every predicate below is derived from a quoted source or from the code at the base SHA. Where neither fixed one answer, the question went to BLUE; §9 records BLUE's rulings.

Spellings marked **CANDIDATE** are ordinary technical encodings proposed by the Builder (or carried from BLUE v0.1's candidate names). They are not Role Registry facts. S11 Q4 pinned four spellings, which no longer carry the label: `temporal_origin`, `temporal/origin`, `immortalis-temporal-origin` and `ONE_SI_SECOND_PER_CANONICAL_UNIT` (§3.2). S11 Q2 accepted the §3.7 segment spellings as a technical candidate, subject to exact declared re-pins.

---

## 1. Governing authority

| #   | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Native pin                              | What it fixes for A0                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | [BLUE CAL-TIME T-1 Unified Clock-Origin Source v1.0](https://app.notion.com/p/41c20af901e0817ca9e8dcb392e3b0d7)                                                                                                                                                                                                                                                                                                                                                                                                                  | `2026-11-18T22:23:26.085Z`              | §2 v2 document and version-to-genesis correspondence; §3 origin witness and paired genesis; §4 MS clock step / live B2 / historical MS; §5 category-8 predicate; §6 five grants and the lowering list.                                                                            |
| S2  | [SOVEREIGN RATIFICATION — CAL-TIME T-1 Five Grants](https://app.notion.com/p/41c20af901e081ba9fd4db4da81c8526)                                                                                                                                                                                                                                                                                                                                                                                                                   | `2026-11-18T22:38:52.341Z`              | Adopts S1 as governing design source. "Next technical action: produce source-precise field/schema, producer, identity/digest, Temporal paired genesis and Role Registry/owner rule mapping, MS live/historical checks, journal/replay policy and the single new T0-read checker." |
| S3  | [Initial Locality Bootstrap v0.9 — Consolidated Executable Contract](https://app.notion.com/p/40b20af901e08198abdacb340e3507df) (CORE_V9)                                                                                                                                                                                                                                                                                                                                                                                        | `2026-11-01T12:13:53.634Z`              | Capture schema and hashes; Input; bootstrap-bearing definition; `bootstrapInitialTimePrecondition`; `initialize-captured-chronology` writer and publication identity; registration rows; historyVerificationId cost rule.                                                         |
| S4  | [Sovereign Ratification — Initial Locality v0.9 CORE + Option A](https://app.notion.com/p/40c20af901e081d7999be2b4f317c70a)                                                                                                                                                                                                                                                                                                                                                                                                      | `2026-11-02T15:46:21.719Z`              | CORE_V9 and OPTION_A_V9 adopted.                                                                                                                                                                                                                                                  |
| S5  | [BLUE F-014B Scoped Lowering v0.3](https://app.notion.com/p/41d20af901e0815c9ee4ddda01e454e8)                                                                                                                                                                                                                                                                                                                                                                                                                                    | `2026-11-19T10:33:11.705Z`              | §3 **Alt I** adopted: outer Input unchanged; `chronology` becomes a strict two-arm union on capture `format_version`; consumer census; §8 falsifiers.                                                                                                                             |
| S6  | [BLUE F-014B Scoped Lowering v0.4](https://app.notion.com/p/41d20af901e0818994e7f89a801492cc)                                                                                                                                                                                                                                                                                                                                                                                                                                    | `2026-11-19T10:56:17.128Z`              | §3 N-2: the claimed v1 equality test does not exist; **A0's first change is a baseline v1 corpus test**. §4(ii): v2 arm needs registered rule, lineage and lowering rows.                                                                                                         |
| S7  | [BLUE F-014B Scoped Lowering v0.5](https://app.notion.com/p/41d20af901e081f9a550c4856e180a61)                                                                                                                                                                                                                                                                                                                                                                                                                                    | `2026-11-19T11:08:36.174Z`              | §4 P-3 declared re-pins; construction HOLD.                                                                                                                                                                                                                                       |
| S8  | [BLUE F-014B Scoped Lowering v0.2](https://app.notion.com/p/41d20af901e08123af8bdbaf314250ea)                                                                                                                                                                                                                                                                                                                                                                                                                                    | `2026-11-19T10:06:01.677Z`              | §1 A0 boundary; §4 MS shortcut prohibition; §5 history-ID activation rule and A0 non-tautology.                                                                                                                                                                                   |
| S9  | RED reviews: [v0.2](https://app.notion.com/p/41d20af901e0810bbfe6dfa34a09cf93) `2026-11-19T10:23:56.318Z` (§3 Alt I constraints C1–C6), [v0.3](https://app.notion.com/p/41d20af901e081748aa2f3b8a7c7eec2) `2026-11-19T10:40:03.390Z` (parser enum correction; N-2), [v0.4](https://app.notion.com/p/41d20af901e081c7b7ccf3803875f590) `2026-11-19T11:05:09.838Z` (P-3), [CAL-TIME T-1 v0.4](https://app.notion.com/p/41c20af901e081789e45f0bd4be077e2) `2026-11-18T22:15:21.088Z` (§5 MS carry-forward and pair acceptance list) | Constraints this lowering must satisfy. |
| S10 | [BLUE Universal Hard Preflight v6.2 — W2 T1 Dependency HOLD](https://app.notion.com/p/41d20af901e081aa8908d906795bfd76)                                                                                                                                                                                                                                                                                                                                                                                                          | `2026-11-19T12:48:18.740Z`              | Decisive failure: "Authentic v2 SI origin producer … EXTERNAL PREREQUISITE MISSING / SOURCE-LOWERING HOLD". This document is the missing lowering.                                                                                                                                |
| S11 | [BLUE F-014B Issue #114 Direct A0/B0 Source Decisions — AMEND-HOLD](https://app.notion.com/p/41e20af901e08163acb0f8ed695f44ad) (Issue #114 comment 7026060101)                                                                                                                                                                                                                                                                                                                                                                   | `2026-11-20T00:15:08.470Z`              | Gate interpretation; binding direct answers to Q1–Q5 (§9); mandatory A0 fidelity conditions (§6); K1 pin-census correction (§4). Not a Sovereign grant, not an executed Hard Preflight, not permission to merge.                                                                  |

No RED review of Scoped Lowering v0.5 was found (two Notion searches). S11 requests no new RED general review. The Canonical Role Registry (pin `2026-09-25T08:21:22.816Z`) contains **no** Temporal owner/kind rows. The owner-kind table actually in force is `packages/engine/src/owners/registry.ts`, so §3.2 proposes the row in that form and in the Registry's §5 interface-declaration form.

---

## 2. Scope

**In A0** (engine mechanism, T1 only — S8 §1):

1. Strict v2 chronology document and capture schemas, and the two-arm `ChronologyEvidence` union (Alt I).
2. The Temporal-owned SEALED origin witness kind, key, schema and owner-registry row.
3. The shared paired-genesis rule, registered for both Temporal kinds.
4. The two registered v2-arm Input rules, one per route (RED C4; S11 Q1 option A; §3.3).
5. The paired-genesis producer branch in the existing `initialize-captured-chronology` writer.
6. Live admission and **independent** historical verification of the pair and of version-to-genesis correspondence.
7. The MS v3 clock-step pair, live B2 contextual membership and historical MS contextual check.
8. The successor `historyVerificationId` with two additive segments (grant 3; S11 Q2; §3.7), declared re-pins, spec-lock lineage/lowering rows and check-spec validation (S11 Q5; §3.9).
9. A pure, unwired category-8 predicate with **negative-only** tests, labelled preparatory (S8 §5).

**Not in A0:**

- Any reachable non-test author→capture→Input path, the operator v2 capture store, or original-message intake. These are A1. No `packages/operator` file changes in A0.
- The fresh GM SI INITIAL consumer and the live category-8 read. These are B1.
- Calendar profiles, `CAL_TIME_V1`, category 9 and G.3/G.4. These are held by S1 §7.
- Any change to `CanonicalTimeSchema` or `TemporalStateSchema` serialized shape.
- Any retrofit or attestation of an existing v1, direct-operator, never-bootstrap or timed-governance origin.

**Acceptance level:** everything A0 can prove is **T1 MECHANISM ONLY**, using testkit fixture authority (`fixture:` namespace, `FixtureEvidenceVerifier`). No production SI qualification exists until A1 runs (S5 §4).

**Construction order (S11 Q3):**

- A0 is built on its own bounded branch, **after its own formal gate**: a scoped Hard Preflight PASS on `docs/f014b/a0-preflight-submission.md`.
- The full new verifier ID (§3.7) lands in the same code transition as A0's prospective validators. Changed validators never ship under the old identity. Sequencing never suppresses the first new verifier ID.
- A1 starts as a dependent stacked PR as soon as it is safely source-authorized.
- Preferred: one coherent merge/activation window for A0, actual A1 provenance and the first genuine consumer, if that avoids a redundant cold replay. A0 is **not** folded into one enormous PR, and work does **not** wait idly for the merge while independent work exists.
- Merge timing and any deployment are Sovereign decisions.

**Mandatory fidelity conditions (S11 §2):** A0-T00 first, then the conditions mapped to tests in §6. "Actual origin has not been constructed merely by describing it."

---

## 3. Literal contract

### 3.1 Chronology v2 document and capture (contracts)

File: `packages/contracts/src/initial-locality.ts`. v1 declarations stay byte-identical. Additions only:

```ts
/** Pinned literal (S11 Q4): the typed SI declaration of S1 §2. */
export const SI_SCALE_DECLARATION = "ONE_SI_SECOND_PER_CANONICAL_UNIT";

/** S1 §2: strict versioned captured chronology document v2. Same format domain, explicit version 2. */
export const ChronologyDocumentV2Schema = z.strictObject({
  format: z.literal(CHRONOLOGY_DOCUMENT_FORMAT), // "immortalis-starting-chronology", unchanged
  format_version: z.literal(2),
  time: CanonicalTimeSchema, // original authored coordinate and unit; unit stays an opaque Id
  statement: Text, // the author's own words, unchanged meaning
  scale: z.literal(SI_SCALE_DECLARATION), // exactly one SI elapsed second per canonical coordinate unit
});

/** S1 §2 / S5 §3 Alt I: the v2 capture arm. Field set identical to v1 except the version literal and the v2 document. */
export const ChronologyCaptureV2Schema = z.strictObject({
  format: z.literal(CHRONOLOGY_CAPTURE_FORMAT), // "immortalis-record-only-chronology", unchanged
  format_version: z.literal(2),
  capture_ref: Id,
  campaign_id: Id,
  document: ChronologyDocumentV2Schema,
  document_hash: Sha256,
  grade: AuthoredGradeSchema,
  source: z.strictObject({
    client: Id,
    oauth_grant: Id,
    request_ref: Id,
    original_message_hash: Sha256.nullable(),
    method_id: Id,
    attestation_hash: Sha256,
  }),
  capture_hash: Sha256,
});

/** Alt I: ChronologyEvidence becomes the strict two-arm union discriminated on the capture's literal format_version. */
export const ChronologyEvidenceSchema = z.discriminatedUnion("format_version", [
  ChronologyCaptureSchema, // v1 arm: the existing schema object, unchanged
  ChronologyCaptureV2Schema,
]);
export type ChronologyEvidence = z.infer<typeof ChronologyEvidenceSchema>;
```

Determinations:

- `ChronologyDocumentSchema`, `ChronologyCaptureSchema`, `AuthoredEvidenceSchema`, `InitialSetupInputSchema`'s text, `format_version: 1`, its field set and `parser` enum are **unchanged** (RED C1 as corrected by RED v0.3 §2). Only the type reached through `chronology: ChronologyEvidenceSchema` widens.
- **No cross-arm acceptance.** A v2 document inside a v1 capture fails the v1 arm's `format_version: z.literal(1)` document. A v1 document inside a v2 capture fails `scale` and `format_version: 2`. A v2 capture with no `scale`, an extra field, or any other `scale` value fails strict parsing.
- **Hashes are versioned by content, with no new hash function.** S3 fixes `document_hash = SHA256(canonicalJson(document))` and "capture_hash hashes all preceding fields except itself". v2 bytes contain `format_version: 2` and `scale`, so v2 and v1 hashes never collide by construction. `chronologyDocumentHash`, `chronologyCaptureHash` and `chronologyEvidenceViolation` in `packages/engine/src/initial-setup/identity.ts` and `admission.ts` keep their bodies and widen their parameter types to the union.
- `StartingChronologySchema` (`packages/operator/src/time-initialization.ts:17`) and the three phone parsers stay strictly v1. They already refuse v2 because v2 fails their literal. A0 adds tests that prove this (RED C5).
- The comment at `initial-locality.ts:380–385` asserts an equality test that did not exist. A0-T00 now exists as a test of existing code (`tests/contract/chronology-v1-baseline-corpus.test.ts`, this document's commit) and confirms the claim on its corpus (§6). The comment itself is amended to cite that test only at construction: no `packages/` file changes before the gate (RED v0.4 N-2 row).
- **Producer bytes P/H/T (S9 RED v0.2 residual).** `buildProducerInput` (`engine/src/initial-setup/producer.ts:54–89`) embeds `input.chronology.document` verbatim. A v1 document yields identical P, H, T and D. A v2 document changes them only for v2 sessions. That is a version-specific hash, not a parser or identity-formula change. The pinned SCENE instruction text refers to "the captured chronology statement", which v2 keeps, so **no new instruction map** is proposed. A0-T08 verifies this; if verification fails, it becomes trip-wire W1, not a silent change.
- **Completion is unchanged.** `InitialLocalityCompletionSchema` pins the Input and carries no chronology. The binding is the Grant's `chronology_hash` string comparison (`initial-setup/admission.ts:1179`), which works on both arms (S5 §3 correction).

### 3.2 Temporal origin witness (grant 1)

New contracts file **CANDIDATE** `packages/contracts/src/temporal-origin.ts`. A separate file is used so that `packages/contracts/src/temporal.ts`, byte-pinned by 11 conformance suites, is **not** touched. The semantics are identical; this is an engineering choice.

```ts
export const TEMPORAL_ORIGIN_KEY = "temporal/origin"; // pinned (S11 Q4): the single campaign key (S1 §3 "provisionally temporal/origin")
export const TEMPORAL_ORIGIN_FORMAT = "immortalis-temporal-origin"; // pinned (S11 Q4): exactly this literal

/**
 * S1 §3: one Temporal-owned, SEALED/create-only, genesis-only, campaign-unique witness. Binds campaign identity, original canonical
 * coordinate and unit, literal one SI second per unit, v2 captured chronology identity/digest and the governing Input/Completion
 * with versions. Owner/facet, group id, rule, reads and depends_on come from the journal and are NOT duplicated (BLUE v0.1).
 */
export const TemporalOriginSchema = z.strictObject({
  format: z.literal(TEMPORAL_ORIGIN_FORMAT),
  format_version: z.literal(1),
  campaign_id: Id,
  origin: CanonicalTimeSchema, // == initial temporal/state canonical_time == governing Input.chronology.document.time
  scale: z.literal(SI_SCALE_DECLARATION),
  chronology: z.strictObject({
    capture_format_version: z.literal(2),
    capture_ref: Id,
    capture_hash: Sha256,
    document_hash: Sha256,
    grade: z.enum(["ORIGINAL_MESSAGE_VERIFIED", "OPERATOR_CONFIRMED_RECORD_ONLY"]), // TOOL_CALL_ONLY never qualifies (S3)
  }),
  governing: z.strictObject({ completion: PinSchema, input: PinSchema }),
});
```

**Owner-registry row** (`packages/engine/src/owners/registry.ts`, appended to `TEMPORAL_FACT_KIND_IDS` and `TEMPORAL_FACT_KINDS`):

| Field             | Value                                                                                                    | Source                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | `temporal_origin` (pinned by S11 Q4; the spelling used by S1-lineage T-1 v0.4 and RED's T-1 v0.4 review) | S1 §3                                                                                                                                                                |
| `owner` / `facet` | `temporal_kernel` / `temporal_coordination` (the existing Temporal pair; no new owner, facet or clock)   | S1 §3 "ONE Temporal owner/facet commit group"; grant 1 "under the Temporal owner's precisely bounded new kind/facet/key"; S11 Q4 "not a new owner or a second clock" |
| `im` / `rc`       | `IM-02` / `["RC-02", "RC-05"]` (same as `temporal_state`)                                                | registry.ts:701–702                                                                                                                                                  |
| `lifecycle`       | `SEALED` (create-only, enforced at `owners/admission.ts:576–582` and load `world/integrity.ts:208–210`)  | S1 §3                                                                                                                                                                |
| `keyPattern`      | `^temporal/origin$` (no capture group, so campaign-unique like `temporal/state`)                         | S1 §3; S11 Q4 "single campaign key"                                                                                                                                  |
| `valueSchema`     | `TemporalOriginSchema`                                                                                   | §3.2                                                                                                                                                                 |
| `rule`            | `TEMPORAL_CAPTURED_V2_GENESIS_RULE` (§3.3) — its only lawful citation                                    | grant 2                                                                                                                                                              |

`identityMismatch` (`owners/admission.ts:835–1163`, exhaustive switch) gains `case "temporal_origin": return null;` because the key embeds no identities. The test oracle `tests/support/expected-surface.ts` gains the row `{ id: "temporal_origin", owner: "temporal_kernel", facet: "temporal_coordination", lifecycle: "SEALED", group: "TEMPORAL_FACT_KINDS", exampleKey: "temporal/origin" }`. Sunset policy (`engine/src/initial-setup/sunset-policy.ts`) gains a `temporal_origin` row with `OWNER_CHECKS_ONLY`, mirroring `temporal_state` at L502–507.

Determinations (S11 Q4):

- The four pinned names are technical lowerings of the five grants, not retroactive old-history law. No existing journal, fact or receipt is reinterpreted by them.
- Every declaration is strict: `TemporalOriginSchema` and each nested object are `z.strictObject`. Each is cross-checked against:
  - group owner/facet and rule — §3.5 live step 2;
  - the original Input/Completion and their versions — §3.5 bootstrap step 4 (`governing`, `chronology.*`);
  - coordinate/unit — `timeEquals` against the state and the governing Input's document;
  - the immutable receipt — the generic load check `world/integrity.ts:214–216` (receipt exists and carries `CANON_WRITE_AUTHORITY`) covers the origin with no new code. On the MS route the committed group is also resolved (§3.6 integrity row).
- The CANDIDATE file name and the TypeScript constant names are not pinned by Q4; only the four values are.

**Role Registry §5 interface declaration (proposed row, for BLUE to place):**

| Category                     | Value                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| initiating role              | `role.archivist` + `permission.canon.write` (`CANON_WRITE_AUTHORITY`, unchanged writer authority of `#kernelGroup`)               |
| authoritative input owner    | World-State `world_initial_setup` (governing Completion + its own Input / v2 capture)                                             |
| adjudication role            | none (a pure state-dependent precondition)                                                                                        |
| mechanical executor          | trusted `initialize-captured-chronology` writer                                                                                   |
| canonical state owner/writer | `temporal_kernel / temporal_coordination`                                                                                         |
| permitted consumers          | live and historical Temporal admission; MS live B2 prefix and historical MS integrity; later B1 category-8 reader (unwired in A0) |
| knowledge/visibility         | engine-internal (`secrecy: "engine-internal"` as the captured writer today); no GM canon-read right is created (S1 §5)            |
| office/entity prerequisite   | none                                                                                                                              |

### 3.3 Rules

All new `SourceRef`s use the existing `rule()` helper shape (`artifact`, `native_pin`, `clause`, `authority_lineage`, `effective_basis: "pinned-by-spec-lock"`, `supersedes: null`).

**Selected by S11 Q1 (option A):** two separate, explicitly registered v2 Input citations, one for the non-MS arm and one for the MS-v3 arm. Each cites the adopted T-1 source S1 and never impersonates an `MS_SOURCE` clause. The original v1 rules and v1 bytes are left intact. The selection is "conditionally source-conformant": it holds only while every MS check below holds; otherwise the stop condition applies.

| CANDIDATE id                                   | Artifact / pin                                                                                                        | Registered as                                                                                                                                                                                                               | Admits                                                                                                   |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `TEMPORAL_CAPTURED_V2_GENESIS_RULE`            | S1 / `2026-11-18T22:23:26.085Z`, clause "§3 paired genesis (Grant 2)", lineage adds S2 and S3                         | `temporal_origin.rule`; **and** an `alternateRules` entry on `temporal_state` in the shipped `TEMPORAL_FACT_KINDS_WITH_PC_COLLECTION_RETIREMENT` variant (registry.ts:2466), so `classifyGoverningRule` returns `ALTERNATE` | for `temporal_state`: `TemporalStateSchema` parses, `last_transaction === null`, `continuation === null` |
| `INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE`    | S1 / same pin, clause "§2 v2 captured chronology Input (CORE_V9 Canonical Records + Grant 2)", lineage adds S3 and S4 | `alternateRules` entry on `initial_setup_input`                                                                                                                                                                             | `InitialSetupInputSchema` parses and `chronology.format_version === 2`                                   |
| `INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE` | as above (S1, not `MS_SOURCE`), clause "…MS v3 route"                                                                 | `alternateRules` entry on `initial_setup_input`                                                                                                                                                                             | same, MS route                                                                                           |

Determinations:

- `KERNEL_RULE` stays the `temporal_state` kind rule. The v1 one-write genesis keeps citing it. The state-dependent bootstrap precondition still runs whatever rule is cited, as CORE_V9 "Selection and Chronology Checks" requires. The new rule is additive and supersedes nothing (S1 §3; S3).
- The new genesis rule is **not** an `MS_SOURCE` artifact, so the MS fence's rule-per-kind branch (`fence.ts:176–189`) never treats the pair as an MS-source group (S1 §4; RED T-1 v0.4 §3 "Rule registration").
- `tests/conformance/pc-collection-conformance.test.ts:473` asserts that the **base** `TEMPORAL_FACT_KINDS` carry no `alternateRules`. Registering the alternate only on the shipped variant follows the existing pattern and keeps that assertion true.
- `metadataViolation` (`initial-setup/admission.ts:280–310`) gains the arm↔rule correspondence:
  - a v2-chronology Input must cite exactly its route's v2 rule;
  - a v1-chronology Input must cite exactly `INITIAL_SETUP_RULES.initial_setup_input` or `INITIAL_SETUP_INPUT_MS_V3_RULE`, as today.

  It runs live (`owners/admission.ts:617`) and on replay (`initialSetupHistoricalCheck`, `owners/admission.ts:724`). The existing MS alternate entry (registry.ts:3438–3443) is **not** edited. Its `admits` is a schema parse alone, so it would parse a v2 Input once the union lands. The correspondence above is what keeps the old v1 MS rule off the v2 arm. That is enforced by owner admission, which is what the registry comment says alternate value classes require (registry.ts:586–590).

- `buildInputGroup` (`initial-setup/publish.ts:103–117`) selects the citation by route **and** chronology arm, so engine fixtures can build both v2 arms. Reachability from the operator remains A1.

**MS v2 route: what changes together (S11 Q1).** An MS-v3 v2 Input is admitted as MS only under exact owner/route checks and both original Input/Completion correspondences. Every site below changes in one code transition. None ships alone.

1. **`isMsInputRule`** (`ms-setup/prefix.ts:18–19`) recognises exactly `INITIAL_SETUP_INPUT_MS_V3_RULE` or `INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE`. All MS route identity flows through it, so the callers below carry a v2 MS Input as MS. Each is re-tested (A0-T04, A0-T12–A0-T14):
   - `temporal/bootstrap.ts:77`;
   - `initial-setup/admission.ts:440, 1294, 1319–1323`;
   - `initial-setup/publish.ts:168`;
   - `ms-setup/prefix.ts:51, 136`;
   - `ms-setup/fence.ts:83, 87, 188, 205`;
   - `ms-setup/integrity.ts:55, 73, 140, 148, 165`.

   `isMsCompletionRule` is unchanged: the Completion keeps `INITIAL_LOCALITY_COMPLETION_MS_V3_RULE`.

2. **The original MS source-pair predicate** stays `isMsInputRule(Input rule) === isMsCompletionRule(Completion rule)`:
   - live at `temporal/bootstrap.ts:77` and `initial-setup/admission.ts:1318–1330`;
   - historical at `ms-setup/integrity.ts:66–75`.

   With item 1, a v2 MS Input pairs only with the MS v3 Completion rule, and a v2 non-MS Input only with `INITIAL_SETUP_RULES.initial_locality_completion`. The "registered full route citation" check (`initial-setup/admission.ts:1318–1322`) also admits the non-MS v2 rule.

3. **Historical verifier.** `verifyMsIntegrity` keeps its single-write rule for MS-rule facts (`ms-setup/integrity.ts:120–129`); the v2 MS Input is a single write. It gains only the §3.6 SEALED-prefix origin exemption. The arm↔rule correspondence above runs in `verifyHistorical` through `initialSetupHistoricalCheck`.
4. **MS live and SEALED B2 clock-prefix checks:** the §3.6 `msFenceFullCheck`, `msPrefixViolation` and `ms-setup/integrity.ts` rows.

Not changed:

- the ten-clause MS manifest (`spec/f027/ms-setup-v08-manifest.json`, pinned by `ms-setup-source.test.ts`);
- `MS_PRE_CLOCK_KINDS`;
- the clock-step exception. It stays bounded to exactly `{temporal/state, temporal/origin}` at `next === TEMPORAL_STATE_KEY` under a v2 MS Input (§3.6), and is not generalized to any other phase, kind or route.

**Q1 stop condition (S11, verbatim):** "If the literal alternate cannot be registered while retaining the exact source-grade and MS provenance, stop that route alone rather than silently keeping old v1 MS authority on a new v2 arm."

The Builder reads "exact source-grade and MS provenance" as (a)–(c) below. BLUE may correct that reading. At construction, the route stops if `INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE` cannot be registered as an `initial_setup_input` alternate while:

- (a) it cites S1 at its native pin with the `pinned-by-spec-lock` basis;
- (b) the MS Input keeps every existing MS admission check unchanged: the strict Ed25519/V2 actor profile and enrolled-tuple binding (from `initial-setup/admission.ts:440`), `msEarlierSessionViolation` and `planMsActor`;
- (c) items 1–4 hold both live and on replay.

If it stops, the **MS v2 route alone** stops: an MS-route Input with a v2 chronology is refused. It is never admitted under `INITIAL_SETUP_INPUT_MS_V3_RULE`. The non-MS v2 route and every v1 route are unaffected. The Builder reports the stop to BLUE and does not choose an alternative.

### 3.4 Producer (paired genesis writer)

`packages/engine/src/temporal/captured-chronology.ts` keeps every existing step: one governing Completion, its own Input, TOOL_CALL_ONLY and fixture refusals, the publication digest, MS prior-group reconciliation and `msTimePins`. It branches only on `input.chronology.format_version`.

- **v1:** the existing `coordinator.establishCanonicalTime(...)` call, byte-for-byte unchanged.
- **v2:** a new coordinator method, CANDIDATE `establishCanonicalTimeWithOrigin`, in `temporal/coordinator.ts`. It builds **one** group through the existing `#kernelGroup` with:
  - `writes = [{ key: "temporal/state", value: {canonical_time: time, last_transaction: null, continuation: null}, expected_version: 0 }, { key: "temporal/origin", value: <TemporalOrigin>, expected_version: 0 }]`. Order is irrelevant to admission (§3.5).
  - `rule = TEMPORAL_CAPTURED_V2_GENESIS_RULE`.
  - Publication identity: the **same** S3 digest family `captured-chronology:${digest}:group|intent|cause`, with `digest = SHA256(canonicalJson({campaign_id, completion, input, capture_hash}))`. A v2 capture has a different `capture_hash`, so it can never replay as a v1 intent (BLUE v0.1 "different v2 payload … cannot replay as the same sealed intent").
  - `basis = CAPTURED_CHRONOLOGY_BASIS[grade]` and `secrecy = "engine-internal"` on **both** writes.
  - `reads` / `depends_on`: non-MS exactly `[Completion pin, Input pin]` and their two groups, as today. MS **exactly** `msTimePins(state)` and their groups, as today. The origin adds no read or dependency (S1 §4 "Unchanged pins and source reads").
  - The origin value is derived only from the governing Completion fact (key and version), its own Input fact (key and version) and that Input's v2 capture. No caller-supplied field enters it.
- Lost acknowledgement: the existing store reconciles by intent identity (RC-16) for non-MS, and through the existing MS `committedGroup(intent)` + `verifyMsIntegrity` path for MS. Nothing new is added.
- `ms-initial-actor.ts` (operator) is unchanged. It already calls `initializeCapturedChronology` between `closure()` and `presence()` (operator ms-initial-actor.ts:89–97).

### 3.5 Admission predicates (live **and** historical)

One new pure function, CANDIDATE `clockOriginGenesisViolation(group, state)`, owns the pair-shape rules. It is called from **both** `temporalGroupCheck` (live) and the `verifyHistorical` Temporal hook (`owners/admission.ts:738–744`). Replay runs `#validate` then `verifyHistorical`, not `check` (campaign-core.ts:440–446). Any rule placed only in `temporalGroupCheck` would therefore **not** run on replay (Codex LC audit, Grant 3 row).

`temporal/admission.ts temporalGroupCheck`, by resolved kind (never array position):

1. Let `originW` be the write whose key resolves to `temporal_origin`.
2. **If `originW` exists** → `clockOriginGenesisViolation`. Refuse `VALUE_INVALID`, reason CANDIDATE `ORIGIN_PAIR_SHAPE`, unless all of these hold:
   - a `temporal_state` write exists;
   - both writes have `expected_version === 0`;
   - `writes.length === 2`;
   - there is no transaction, authority, object or index write;
   - `group.owner/facet` is `temporal_kernel/temporal_coordination`;
   - `group.rule` equals `TEMPORAL_CAPTURED_V2_GENESIS_RULE`;
   - the state has null `last_transaction` and null `continuation`;
   - both writes carry the same `basis` and `secrecy`.

   If all hold, call `bootstrapInitialTimePrecondition(group, state)`.

3. **Else, if a `temporal_state` write has `expected_version === 0`:** the existing "established alone" and null-basis checks stay unchanged. In addition, refuse if `group.rule` equals `TEMPORAL_CAPTURED_V2_GENESIS_RULE`: the paired rule never cites a lone state. Then call the existing `bootstrapInitialTimePrecondition`.
4. The `verifyHistorical` hook condition widens to "any write resolving to `temporal_state` with `expected_version 0` **or** to `temporal_origin`". It calls `clockOriginGenesisViolation` (which covers step 3's lone-state rule) and then `bootstrapInitialTimePrecondition`.
5. These need no new code: a SEALED rewrite of the origin (`AMENDMENT_NOT_SUPPORTED`), an origin under any rule other than its own (`classifyGoverningRule` → `INVALID`) and an unregistered key (`KEY_NOT_ADMITTED`).

`temporal/bootstrap.ts bootstrapInitialTimePrecondition`, changes only:

1. Before `if (index.count === 0) return null;`, refuse an origin write on a **never-bootstrap** prefix (CANDIDATE reason `NO_BOOTSTRAP_WITNESS`). A state-only never-bootstrap genesis keeps returning `null` (S1 §2).
2. Replace `const w = group.writes[0]!` (L105) with lookup by resolved kind `temporal_state` (S1 §3 "The bootstrap checker must cease assuming that group.writes[0] is temporal/state").
3. After the governing Input is resolved, enforce **version-to-genesis correspondence** against that Completion's own Input (S1 §2):
   - `chronology.format_version === 2` with no origin write → refuse `V2_REQUIRES_PAIRED_GENESIS`;
   - `chronology.format_version === 1` with an origin write → refuse `V1_REFUSES_WITNESS`.
4. When the origin is present, require `TemporalOriginSchema` to parse and:
   - `campaign_id === group.campaign_id`;
   - `timeEquals(origin, state.canonical_time)` and `timeEquals(origin, input.chronology.document.time)`;
   - `chronology.{capture_ref, capture_hash, document_hash, grade}` equal the governing Input's capture fields, with `capture_format_version === 2`;
   - `governing.completion` equals `{completionKey, version of that committed fact}` and `governing.input` equals `{inputKey, version}`;
   - the origin write's `basis` equals `CAPTURED_CHRONOLOGY_BASIS[grade]`.

   Refuse with CANDIDATE reasons `ORIGIN_CAMPAIGN`, `ORIGIN_TIME`, `ORIGIN_CAPTURE`, `ORIGIN_GOVERNING` and `BASIS_LABEL`.

5. Every existing check is preserved unchanged:
   - one-pair cut;
   - Completion required;
   - all-Completions agreement on `document_hash`;
   - `chronologyEvidenceViolation`;
   - TOOL_CALL_ONLY refusal;
   - time equality;
   - `requirePrerequisite` on Completion and Input;
   - basis label;
   - the MS branch (`msFenceCheck`, `msTimePins`, `msPinViolation` exact reads and depends_on).

### 3.6 MS v3 (grant 5)

| Site                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Unchanged                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `ms-setup/fence.ts msFenceFullCheck` L160–167 | When `next === TEMPORAL_STATE_KEY` **and** the MS Completion's own Input has `chronology.format_version === 2`, admit exactly a group whose write keys are `{temporal/state, temporal/origin}` (set equality, either order). Every other `next` keeps `writes.length === 1 && writes[0].key === next`.                                                                                                                                                                                                                                                                                                                          | Phase order; all other steps; `msFenceCheck` view logic; MS rule-kind branch                                                     |
| `ms-setup/prefix.ts msPrefixViolation` L85–92 | In `phase === "B2"` only, accept a fact resolving to `temporal_origin` iff, **from the supplied fact map alone** (no store, no new read): the origin is at version 1 and `temporal/state` exists at version 1; both `provenance.group_id`s are equal; the origin's `provenance.rule` equals `TEMPORAL_CAPTURED_V2_GENESIS_RULE`; `TemporalOriginSchema` parses; origin `campaign_id`, unit and coordinate equal the state's original time and the B2 Input's v2 chronology; the B2 Input's capture is v2. A v2 Input whose prefix lacks the origin refuses `MS_PREFIX_ORIGIN` (CANDIDATE). `PRE_CLOCK` never accepts it.        | `MS_PRE_CLOCK_KINDS` set (**not** extended — S8 §4); all other checks                                                            |
| `ms-setup/integrity.ts` L307–317              | The SEALED-prefix exactness loop exempts a `temporal_origin` fact only when it was created in the authentic clock-step genesis group. That means resolving the committed group (via the presence group's `depends_on`, as L321–331 already do for the time group), checking exactly two `expected_version 0` writes `{temporal/state, temporal/origin}`, the paired rule, the same owner/facet, and `reads`/`depends_on` equal to the original MS time pins, and re-running `bootstrapInitialTimePrecondition` correspondence against the original v2 Input/Completion. Any other SEALED origin in the prefix is still flagged. | Pin proofs at L302 and L345 (`temporal/state` v1); L120–129 single-write rule for MS-rule facts (the origin cites a non-MS rule) |
| `ms-setup/r1.ts`, `publisher.ts`              | None. B2 pins stay `{temporal/state, version 1}` (r1.ts:183; publisher.ts:208–214).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                                                |

### 3.7 Historical verification identity (grant 3; S11 Q2)

- **Old MS segment retained.** The `MS_HISTORY_POLICY_SUFFIX` literal (`ms-setup/rules.ts:42`) is unchanged. It stays the immutable identity of the old MS segment and is not renamed.
- **Two additive segments.** Appended to the full canonical `historyVerificationId` (`owners/admission.ts:536`), after `+POPULATION-STAGE-AUTHORITY-V2`:
  1. one explicitly versioned CAL-TIME/T-1 policy segment, CANDIDATE `+CAL-TIME-T1-CLOCK-ORIGIN@2026-11-18T22:23:26.085Z`;
  2. one separately distinguishable MS v3 clock-origin policy segment, CANDIDATE `+MS-V3-CLOCK-STEP-B2-ORIGIN`.

  S11 Q2 accepts these spellings as a technical candidate, subject to exact declared re-pins (§4).

- **One new composed identity for every affected policy.** The segments sit in the base composition, so the production, MS (`msCanonicalAdmission`) and fixture (`+fixture-evidence-t1`, `fixtureMsCanonicalAdmission`) identities all change together. `legacyContractAdmission` (`owners/admission.ts:827`, appending `+LEGACY-PRE-V9-RUNTIME-CONTRACT`) and the extension wrapper (`owners/extension.ts:73`, copying the base) derive their changed IDs through the base and need no edit of their own.
- **The label does not substitute for verification.** Every semantic history rule is enforced both in live `check` and in `verifyHistorical`:
  - pair shape and correspondence — §3.5 step 4;
  - arm↔rule correspondence — §3.3, through `initialSetupHistoricalCheck`;
  - MS prefix and SEALED history — §3.6.
- **Reopen semantics already exist and are not changed.** On a policy mismatch, `checkpoint-package.ts:418–420` sets `audit`. The first open replays the whole journal strictly from empty under the new verifier and then seals a fresh checkpoint (L601–666). Old checkpoints are never trusted under the new identity.
- **Cost scope.** The cold first-open strict replay and the warm-open OB-030 costs include pre-v0.9 legacy packages, because their legacy identity derives from the changed base (§7).
- **Activation (S8 §5; S11 Q3).** The new identity takes effect in the same code transition that installs any changed live or historical verifier in the production admission. Validators are never shipped under the old identity (§2 "Construction order").

### 3.8 Category-8 predicate (preparatory only)

A pure CANDIDATE `siOriginWitnessViolation(witness: unknown, clock: CanonicalTime, campaignId: string)` checks exactly the S1 §5 predicate: strict `TemporalOriginSchema`, campaign identity, literal scale, and `origin.unit === clock.unit`. It has **no caller** in A0 and takes no store. A0 tests it negatively only. The positive read and its placement after identity-first replay belong to B1 (S8 §5; RED v0.2 R3-6).

### 3.9 Spec lock and checker (RED C4; S6 §4(ii); S11 Q5)

Following the CORE_V9 registration pattern (S3 "Source Registration and Reader Boundary"):

- `design_lineage_successors` adds CANDIDATE `CAL-TIME-T1-CLOCK-ORIGIN-LINEAGE`: `of_frozen_source: null`, `status: "DESIGN_RATIFIED"`, `executable: false`, `narrows_frozen_pin: false`, the S1 URL and pin, sections `["§2","§3","§4","§5","§6"]`, ratification S2.
- `executable_lowerings` gains CANDIDATE `CAL-TIME-T1-CLOCK-ORIGIN-LOWERING` **only at actual construction**, after approved contract revision. No row labels a proposed schema executable before its governing source is independently source-fidelity accepted. Its shape:
  - `status: "FROZEN_EXECUTABLE_LOWERING"`, `relation: "COMPOSES_WITH"`, `cites_design_lineage: ["CAL-TIME-T1-CLOCK-ORIGIN-LINEAGE", "GM-INITIAL-BOOTSTRAP-V9-LINEAGE"]`, `primary_im: "IM-02"`;
  - `fact_kinds: ["temporal_origin", "temporal_state", "initial_setup_input"]`;
  - closed fields `temporal_owner: "temporal_kernel/temporal_coordination"`, `temporal_precondition: "bootstrapInitialTimePrecondition"`, `temporal_writer: "initialize-captured-chronology"`, `genesis_rule: "TEMPORAL_CAPTURED_V2_GENESIS_RULE"`, `history_policy_segment`;
  - `does_not`: no calendar, no category 9, no GM canon read, no retrofit of v1/direct/timed-governance origins, no live category-8 read.
- **Citation custody (S11 Q5).** The row cites:
  - the controlling Sovereign ratification S2 at its pin;
  - the adopted T-1 source S1 at its pin;
  - the immutable **final** A0 contract: the GitHub commit SHA of the later _accepted_ revision of this document plus its immutable path `docs/f014b/a0-clock-origin-source-lock.md`;
  - S11's native pin, as its review/adjudication authority.

  It never cites an editable PR head as though frozen. This document's own revisions, including this one, are not that final contract until BLUE accepts one.

- **At construction, with the row:** the check-spec constraints, the generated identity, the historical policy and the declared re-pins (§4). Previous compatibility is safeguarded, following the MS-SETUP-V08 and ROADBED rows, which carry `history_policy_suffix` and `runtime_contract_compatibility`.
- `tools/check-spec.ts` validates the two rows field-by-field. It also checks that the composed `historyVerificationId` contains both §3.7 segments and that `temporal_state`'s only alternate is the genesis rule.
- Regenerate `packages/contracts/src/spec-identity.ts` through `tools/gen-spec-identity.ts`. The spec-lock SHA-256 changes and is re-pinned in `current-look-lowering-conformance` (§4).

**Narrow encoding issue (S11 Q5, documented, not resolved here):**

- Each existing `executable_lowerings` row carries:
  - exactly one `url`/`native_pin` pair, which `tools/check-spec.ts` (`REQUIRED_EXECUTABLE_LOWERINGS`, L888–905) holds to one exact Notion URL and pin;
  - `cites_design_lineage` ids;
  - free-text `authority_lineage` strings.
- No member anywhere in `spec/f027/spec-lock.json` types a repository commit SHA plus path citation. The lock contains no `github.com` citation, and `snapshot_commit` is null because "A commit cannot contain its own SHA".
- The native-plus-repository custody above can therefore be written today only as unverified `authority_lineage` text, or through a new closed member that check-spec validates. Neither choice is made by this document, and no authority is invented for either. The construction preflight states the exact encoding as a declared, reviewed lowering.

---

## 4. Declared re-pins and structural guards (S7 §4 P-3)

Every entry below is an **expected, declared** consequence of the A0 construction PR. Each re-pin records base and head SHA-256 and cites this lowering. None is a silent test edit. All base values were verified against the actual bytes at `0c9e74b` by census. Per the repository's provenance rule (H-PROVENANCE), present-day identities are not restated in this document; they live only in their designated tables (§8).

**K1 (S11 §4):** "K1 accepted as a factual pin-census correction, not a new Source grant. Update BLUE-controlled technical source and PR delta register to reflect all 11 temporal.ts and 6 temporal/integrity.ts pins before any scoped edit. Do not silently alter protected D-3 bodies/provider memberships." Both counts are in the last row. A0 touches neither file.

The A0-T00 test added in this revision touches no pinned path and needs no re-pin.

| Guard / pin                                                           | Location                                                                                                                                                                                                                                                                            | A0 consequence                                                                                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Changed-file allow-set vs RP-2 base tree (`RP2_BASE_TREE`)            | `tests/conformance/historical-pin-provenance-conformance.test.ts:326–349`                                                                                                                                                                                                           | The new set of changed paths under `apps/` and `packages/` must be declared there, following the convention used by earlier slices. |
| Allow-lists for `packages/`                                           | `gm-freight-conformance.test.ts:159–199`; `pc-standing-ledger-conformance.test.ts:353–392`                                                                                                                                                                                          | Add the A0 paths.                                                                                                                   |
| Examined-suite pin census (510 / 40 / 470)                            | `historical-pin-provenance-conformance.test.ts:135–170`                                                                                                                                                                                                                             | Recount after re-pins.                                                                                                              |
| `temporal/bootstrap.ts`, `temporal/captured-chronology.ts` byte pins  | `ms-setup-regression-pins.test.ts:11–14`                                                                                                                                                                                                                                            | Re-pin (base values: the current entries in that file).                                                                             |
| `temporal/admission.ts`, `temporal/coordinator.ts` scoped-delta heads | `tests/support/freight-scoped-deltas.ts:66–73`                                                                                                                                                                                                                                      | New scoped-delta entries (base = the current recorded heads).                                                                       |
| `owners/admission.ts`                                                 | `tests/support/present-day-identities.ts:18–19`                                                                                                                                                                                                                                     | Re-pin.                                                                                                                             |
| `owners/registry.ts`                                                  | `current-look-lowering-conformance.test.ts:775–776, 856–857`                                                                                                                                                                                                                        | Re-pin.                                                                                                                             |
| `contracts/src/index.ts`, `engine/src/index.ts`                       | `present-day-identities.ts:10–17`                                                                                                                                                                                                                                                   | Re-pin (new exports).                                                                                                               |
| `spec/f027/spec-lock.json`                                            | `contracts/src/spec-identity.ts:10`; `current-look-lowering-conformance:774, 854–855`                                                                                                                                                                                               | Regenerate and re-pin.                                                                                                              |
| Lowering count / tail                                                 | `ms-setup-source.test.ts:28–47` (exactly 9; last ids)                                                                                                                                                                                                                               | 10; new tail.                                                                                                                       |
| Composed historyVerificationId literal                                | `ms-setup-source.test.ts:72–91`; `pc-standing-ledger-conformance.test.ts:246–255`; `tests/integration/pc-standing-ledger-policy.test.ts:86–90`                                                                                                                                      | Expected value gains the two §3.7 segments.                                                                                         |
| Kind lists                                                            | `temporal-conformance.test.ts:80–87, 99`; `expected-surface.ts:68–107, 1057`; culture:136, population:92, kti:112 length checks                                                                                                                                                     | Add `temporal_origin`.                                                                                                              |
| Sunset coverage                                                       | `ms-setup-source.test.ts:57–67` (93); `pc-standing-ledger-conformance.test.ts:260`                                                                                                                                                                                                  | Add the row; 94.                                                                                                                    |
| **Not touched**                                                       | `packages/contracts/src/temporal.ts` (11 pins); `temporal/integrity.ts` (6 pins, three inside the D-3 protected gateway conformance suites); the three D-3 gateways; `packages/operator/**` (tree-pinned); `chronology-capture.ts` (a05 pin); `time-initialization.ts`; phone files | A0 is designed so none of these change. Touching the D-3 pins would be trip-wire W3.                                                |

Load integrity for the new kind comes from the generic owner/schema/SEALED checks (`world/integrity.ts:195–212`) and strict historical replay. `temporal/integrity.ts` filters to the five existing Temporal kinds and is deliberately not edited (see the last row).

---

## 5. Version compatibility statement

- Every existing v1 Input, capture, document, journal, receipt and checkpoint stays acceptable under its original law. Old journals contain only v1 captures, so the union's v1 arm is the only arm they can reach (RED C2).
- The direct operator `initialize-time` route, never-bootstrap prefixes and `initial-timed-governance` (`operator/src/initial-timed-governance.ts:499–502`, a scratch dry-run) remain one-write opaque v1 genesis. They are never SI-eligible and never retrofitted (S1 §2; Codex arithmetic witnesses).
- The legacy wrapper (`legacyContractAdmission`, owners/admission.ts:823–833) already refuses all bootstrap kinds. The captured route, and with it the pair, is unreachable for legacy packages.
- Unrelated campaigns pay a one-time strict-replay first-open cost when the identity changes (S3 "Changing the single global historyVerificationId…"). That includes pre-v0.9 legacy packages, whose identity derives from the base (S11 Q2). §7 measures it.

---

## 6. Test catalogue (all T1 MECHANISM ONLY; A0-T00 run at this document's commit; A0-T01–A0-T17 UNRUN until construction)

| ID         | Case                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Source                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| **A0-T00** | **First, before any schema change. RUN NOW (existing code).** v1 corpus over the existing exports `ChronologyDocumentSchema` and `StartingChronologySchema`. Valid: arbitrary unit Id, values 0 and MAX_SAFE_INTEGER, exact format/statement. Negative: wrong version, missing/extra fields, wrong time shape, invalid unit, out-of-bounds value, coercion attempts. Identical accept/refuse, identical canonical JSON and `document_hash` where accepted. Freeze the results. Result in the next paragraph. | S6 §3 N-2; S11 §2        |
| A0-T01     | Re-run A0-T00 unchanged after the union lands; byte/acceptance identity.                                                                                                                                                                                                                                                                                                                                                                                                                                     | S6 §3                    |
| A0-T02     | v2 contract table: valid v2 capture; v2 doc in v1 capture; v1 doc in v2 capture; missing/extra/other `scale`; wrong hashes; TOOL_CALL_ONLY refused at Input admission.                                                                                                                                                                                                                                                                                                                                       | S5 §3; RED C2            |
| A0-T03     | `StartingChronologySchema`, `initialize-time` and the three phone parsers refuse a v2 document; their source-text conformance test is unchanged.                                                                                                                                                                                                                                                                                                                                                             | RED C5; S5 §3            |
| A0-T04     | Input arm↔rule correspondence, live **and** on replay: a v2 Input under the V9 or MS v3 (v1) rule refuses; a v1 Input under a v2 rule refuses; each v2 rule admits only v2; each v2 Input pairs only with its route's existing Completion rule.                                                                                                                                                                                                                                                              | RED C4; S11 Q1           |
| A0-T05     | Non-MS lawful v2 genesis through `initializeCapturedChronology`: the pair commits, state is version 1, origin is version 1, the same group; `reads`/`depends_on` are exactly the Completion and Input pins and their groups; strict reopen replays clean.                                                                                                                                                                                                                                                    | S1 §3–§4; grant 2        |
| A0-T06     | Pair accepted in either write order; refused with a third write, a transaction write, a non-zero expected version, the wrong rule, or a mismatched basis/secrecy.                                                                                                                                                                                                                                                                                                                                            | S1 §3; S5 §8             |
| A0-T07     | Correspondence: v2 Input with state-only genesis refuses; v1 Input with a pair refuses (live **and** a hash-valid interposed journal on replay).                                                                                                                                                                                                                                                                                                                                                             | S1 §2; grant 3           |
| A0-T08     | Producer P/H/T/D: v1 session bytes identical to base; v2 differs only through the document; instruction map unchanged; delivered-bytes check passes.                                                                                                                                                                                                                                                                                                                                                         | RED v0.2 residual        |
| A0-T09     | Origin value forgery: wrong campaign, time, unit, capture_ref/hash, document_hash, grade, governing Completion/Input pin or version each refuses; TOOL_CALL_ONLY grade unrepresentable.                                                                                                                                                                                                                                                                                                                      | S1 §3; S11 Q4            |
| A0-T10     | Never-bootstrap prefix: origin refuses; state-only unchanged. Raw `KERNEL_RULE` pair refuses. Origin-only group refuses. Late origin after state refuses. Second origin refuses (`AMENDMENT_NOT_SUPPORTED`).                                                                                                                                                                                                                                                                                                 | S1 §2–§3; T-1 v0.2       |
| A0-T11     | Same-ID lost-ACK retry of the v2 genesis converges to one pair; a changed v2 capture under the same Completion cannot reuse the intent.                                                                                                                                                                                                                                                                                                                                                                      | S3; BLUE v0.1            |
| A0-T12     | MS v3 lawful v2: issue→response→existence→B1→closure→**pair**→B2; strict reopen; presence pins `temporal/state` v1; reads and depends_on equal `msTimePins` exactly.                                                                                                                                                                                                                                                                                                                                         | grant 5; S11 Q1          |
| A0-T13     | MS negatives: origin at PRE_CLOCK; v2 MS Input with state-only clock step; pair at any other phase; origin with different `group_id`; origin under the old rule; origin without the paired state at B2; presence refused after each.                                                                                                                                                                                                                                                                         | RED T-1 v0.4 §5          |
| A0-T14     | MS historical: hash-valid journal with an arbitrary SEALED origin earlier in the prefix is flagged; a lawful pair is not; a pre-change MS journal replays under its original identity.                                                                                                                                                                                                                                                                                                                       | grant 5; RED T-1 v0.4 §5 |
| A0-T15     | Identity transition: an old checkpoint opened under the new identity triggers cold strict replay and a fresh checkpoint; fixture and legacy suffixes are preserved; a pre-v0.9 legacy package replays strictly under its changed derived identity; the extension wrapper carries the changed base identity.                                                                                                                                                                                                  | grant 3; S11 Q2          |
| A0-T16     | Legacy controls unchanged: `initialize-time` direct origin, never-bootstrap, timed-governance dry run, v1 captured non-MS, v1 MS, PR #107 S-4 ledger, existing `temporal-enforcement` "established alone" cases.                                                                                                                                                                                                                                                                                             | S1 §2; S8                |
| A0-T17     | `siOriginWitnessViolation` negatives only: malformed, wrong campaign, wrong scale, unit mismatch. Labelled PREPARATORY; no T0 PASS claimed.                                                                                                                                                                                                                                                                                                                                                                  | S8 §5                    |

**A0-T00 result (this document's commit).** File `tests/contract/chronology-v1-baseline-corpus.test.ts`, 60 tests, all passing:

- 57 specimens with frozen verdicts: 7 accepted, 50 refused.
- The two exports agree on every specimen:
  - the verdict;
  - the parse output (deep strict equality);
  - canonical JSON;
  - `chronologyDocumentHash`, which equals SHA-256 over the canonical JSON;
  - for refusals, the issue lists.
- No disagreement was found. The comment at `initial-locality.ts:380–385` holds on this corpus.
- Frozen edge (observed existing law): `value: -0` is accepted and canonicalizes as `0`, so it shares bytes and `document_hash` with `value: 0`.

**S11 mandatory fidelity conditions → tests:**

| Condition (S11 §2, verbatim)                                    | Tests                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------- |
| "first produce the missing literal v1 baseline corpus (A0-T00)" | A0-T00 (run), A0-T01                                       |
| "strict two-arm v1/v2 schema and hashes"                        | A0-T02, A0-T03                                             |
| "real Input/Completion pairing"                                 | A0-T04, A0-T07, A0-T09                                     |
| "two same-group version-zero writes"                            | A0-T05, A0-T06, A0-T10, A0-T11                             |
| "MS live B2 and SEALED history"                                 | A0-T12, A0-T13, A0-T14                                     |
| "one qualified category-eight predicate"                        | A0-T17                                                     |
| "no source read outside adopted budget"                         | A0-T05, A0-T12 (exact reads/depends_on); A0-T17 (no store) |
| "historic v1/direct and existing MS invariance"                 | A0-T01, A0-T08, A0-T14, A0-T15, A0-T16                     |

---

## 7. Engineering acceptance and OB-030

- **Player result:** none directly. A0 makes "two minutes" machine-verifiable as 120 SI seconds for a campaign whose author declared SI scale at setup, so later GM waits can convert durations lawfully. It adds no player question and no GM confirmation (S1 §2).
- **Reused path:** the existing captured writer, coordinator `#kernelGroup`, bootstrap precondition, MS fence/prefix/integrity, checkpoint transition. New machinery: one kind, one schema file, three rules (S11 Q1), one pure shape check, one pure preparatory predicate.
- **Whole-operation cost.** Genesis gains one write (bounded, once per campaign). Admission and replay gain constant-size checks. The material cost is the **first open after the identity change**: a cold strict replay of every existing campaign, pre-v0.9 legacy packages included (S11 Q2).
- **Measurement plan (UNRUN).** Reuse `tools/h07-s2-benchmark.ts` / `h07-s2-compare.ts` (policy-transition first-open replay) on base vs candidate. Use the same pinned journals:
  - v1 no-bootstrap;
  - v1 captured;
  - v1 MS;
  - S-4 ledger;
  - pre-v0.9 legacy packages (opened under `legacyContractAdmission`);
  - new v2 non-MS and MS.

  Measure cold first open, immediate reopen and warm open. Report wall time, CPU, peak RSS, journal bytes and entries, read/write counts, and checkpoint creation, with repeated runs and environment recorded. There is no invented threshold. Any material regression goes to BLUE and, if it is a trade-off, to the Sovereign (S5 §6). `docs/f014b/a0-preflight-submission.md` I-7 gives the exact plan.

- **Claim boundary:** T1 mechanism only. No reachable producer (A1), no positive category-8 read (B1), no GM wait, no host, no retained-storage claim.

---

## 8. A8 artifact custody — base bytes at `0c9e74b9d5dc8845751a543ace777277b2cb1308`

The base is the immutable commit above; every file below is retrievable at that commit by path. The Builder computed each file's SHA-256 and byte length from the actual bytes in its own environment during preparation.

**Present-day identities are deliberately not restated here.** The repository's provenance rule (H-PROVENANCE; `historical-pin-provenance-conformance.test.ts` and `current-look-lowering-conformance.test.ts`) forbids any document from stating a present-day identity, because a hash copied into prose goes stale silently. Today's identities live only in `tests/support/present-day-identities.ts` and the scoped-delta tables. The A0 construction PR records each touched file's base and head identity there, as declared re-pins (§4).

A reviewer reproduces the exact base bytes of any path with:

```sh
git show 0c9e74b9d5dc8845751a543ace777277b2cb1308:<path> | sha256sum
git show 0c9e74b9d5dc8845751a543ace777277b2cb1308:<path> | wc -c
```

Files in custody scope (28):

- `packages/contracts/src/initial-locality.ts`
- `packages/contracts/src/temporal.ts`
- `packages/engine/src/temporal/admission.ts`
- `packages/engine/src/temporal/bootstrap.ts`
- `packages/engine/src/temporal/captured-chronology.ts`
- `packages/engine/src/temporal/coordinator.ts`
- `packages/engine/src/temporal/integrity.ts`
- `packages/engine/src/ms-setup/fence.ts`
- `packages/engine/src/ms-setup/prefix.ts`
- `packages/engine/src/ms-setup/integrity.ts`
- `packages/engine/src/ms-setup/r1.ts`
- `packages/engine/src/ms-setup/publisher.ts`
- `packages/engine/src/ms-setup/admission.ts`
- `packages/engine/src/initial-setup/admission.ts`
- `packages/engine/src/initial-setup/producer.ts`
- `packages/engine/src/owners/registry.ts`
- `packages/engine/src/owners/admission.ts`
- `packages/operator/src/chronology-capture.ts`
- `packages/operator/src/initial-setup.ts`
- `packages/operator/src/time-initialization.ts`
- `packages/operator/src/ms-initial-actor.ts`
- `packages/operator/src/initial-timed-governance.ts`
- `apps/phone/src/setup-recovery.ts`
- `apps/phone/src/route-confirm.ts`
- `apps/phone/src/review-sources.ts`
- `tests/conformance/time-initialization-conformance.test.ts`
- `tests/conformance/operator-conformance.test.ts`
- `tests/support/freight-scoped-deltas.ts`

`git diff --stat 0c9e74b 8d25f90` lists only `vitest.config.ts`, so every census file is byte-identical on current main.

The A0-T00 test is committed with this revision at `tests/contract/chronology-v1-baseline-corpus.test.ts`. It contains no digest literal: it compares computed values with each other. Reproduction: `pnpm exec vitest run --project contract tests/contract/chronology-v1-baseline-corpus.test.ts`.

No new A0 fixture or reproduction bundle exists yet. A0 fixtures will be committed with the construction PR at an immutable commit. Each will have its path, byte length and SHA-256 recorded in the repository's designated identity tables, for recipient verification.

---

## 9. Resolved by BLUE (S11, native pin `2026-11-20T00:15:08.470Z`)

The previous revision left five questions to BLUE. S11 answers each as a binding technical direction, not a new Sovereign grant. Rulings are quoted verbatim.

- **Gate interpretation.**
  - Ruling: "current v6.2 HOLD concerns prospective construction, not source text or independent tests of presently existing code. A0 and B0 may be source-revised and exact-file-tested in preparatory, no-new-canon modes now; no production semantic change, new writer or new request interface may be implemented before applicable scoped Hard Preflight PASS."
  - Consequence: this revision changes documents and adds one test of existing code (A0-T00). Nothing under `packages/` or `apps/` changes.

- **Q1 — Input rule for the v2 arm per route.** Asked: option A (two T-1-sourced Input alternates, one per route) or option B (one non-MS v2 rule; MS v2 keeps the v1 MS rule).
  - Ruling: "select separate, explicitly registered v2 Input citations for non-MS and MS-v3 arms (option A), conditionally source-conformant. Each new rule must cite the adopted T-1 clock source, not impersonate a legacy MS_SOURCE clause. The original v1 rule and v1 bytes are left intact. Admit an MS-v3 v2 Input as MS only under exact owner/route checks and both original Input/Completion correspondence; update isMsInputRule, the original MS source-pair predicate, historical verifier, and MS live/SEALED B2 clock-prefix checks together. Do not modify the ten-clause MS manifest or generalize the clock-step exception. If the literal alternate cannot be registered while retaining the exact source-grade and MS provenance, stop that route alone rather than silently keeping old v1 MS authority on a new v2 arm."
  - Consequence: §3.3 table, "what changes together" list and stop condition; §2 item 4; tests A0-T04, A0-T12–A0-T14.

- **Q2 — identity segment spelling.** Asked: confirm the §3.7 segment, and whether an appended MS component satisfies grant 3 without editing `MS_HISTORY_POLICY_SUFFIX`.
  - Ruling: "additive historical-verifier identity. Retain the old MS_HISTORY_POLICY_SUFFIX literal unchanged. Append one explicitly versioned CAL-TIME/T-1 policy segment and one separately distinguishable MS v3 clock-origin policy segment to the full canonical historyVerificationId. This is a new composed verifier identity for affected non-MS and MS policies; legacyContractAdmission and extension wrappers derive changed IDs through the base. Enforce all semantic history rules at live and verifyHistorical; the policy label does not substitute for verification. Cold first-open strict replay and warm-open OB-030 costs include pre-v0.9 legacy packages. The draft's precise additive segment is an acceptable technical candidate subject to exact declared repins."
  - Consequence: §3.7 rewritten with two segments; §4 identity-literal row; §5; §7 and preflight I-7 include pre-v0.9 legacy packages; A0-T15.

- **Q3 — activation sequencing.** Asked: A0 merges alone with transition #1, or stays open until A1 and B1 join one transition.
  - Ruling: "construction/merge order. Build A0 on its own bounded branch after its own formal gate, using a full new verifier ID in the same code transition as its prospective validators; never ship changed validators under the old identity. Start A1 as a dependent stacked PR as soon as safely source-authorized. Prefer one coherent merge/activation window for A0, actual A1 provenance and first genuine consumer if that avoids redundant cold replay; do not make it one enormous PR and do not wait idly for the merge when independent work exists. Merge timing and any deployment remain Sovereign decisions. This is engineering sequencing, not authority to suppress the first new verifier ID."
  - Consequence: §2 "Construction order"; §3.7 activation; §10.

- **Q4 — kind/key/literal spellings.** Asked: pin the four spellings and confirm reuse of the existing facet.
  - Ruling: "pin bounded technical naming as proposed: temporal_origin kind, temporal/origin single campaign key, […] and ONE_SI_SECOND_PER_CANONICAL_UNIT. Use existing temporal_kernel / temporal_coordination owner/facet, not a new owner or a second clock. To remove ambiguity: the accepted format literal is exactly immortalis-temporal-origin. All declarations must be strict and cross-checked against group owner/facet, rule, original Input/Completion, versions, coordinate/unit and immutable receipt. Names are technical lowerings of the five grants, not retroactive old-history law."
  - Consequence: §3.1 and §3.2 drop the CANDIDATE label from exactly these four; §3.2 Q4 determinations map each cross-check; A0-T09.

- **Q5 — executable lowering artifact.** Asked: whether the lowering row cites this repository document at an immutable commit or a BLUE Notion page that adopts it.
  - Ruling: "executable-lowering citation custody. Use this BLUE adjudication page's native pin as its review/adjudication authority, paired with the exact later accepted A0 source-lock document GitHub commit SHA and immutable file path. The actual executable_lowerings entry must cite the controlling Sovereign ratification, adopted T-1 source and an immutable final A0 contract; never cite an editable PR head as though frozen, or label a proposed schema executable before its governing source is independently source-fidelity accepted. After approved contract revision, add the precise spec-lock executable lowering, check-spec constraints, generated identity and historical policy at actual construction; declare affected repins and safeguard previous compatibility. If the runtime spec-lock format cannot express these exact native-plus-repository citations, document that narrow encoding issue rather than inventing authority."
  - Consequence: §3.9 custody wording; the executable row only at construction; the narrow encoding issue documented there.

- **Mandatory A0 fidelity conditions.**
  - Ruling: "first produce the missing literal v1 baseline corpus (A0-T00), then test strict two-arm v1/v2 schema and hashes, real Input/Completion pairing, two same-group version-zero writes, MS live B2 and SEALED history, one qualified category-eight predicate, no source read outside adopted budget, historic v1/direct and existing MS invariance. Actual origin has not been constructed merely by describing it."
  - Consequence: A0-T00 produced and run (§6); the remaining conditions are mapped to tests (§6).

- **K1.** Accepted as a factual pin-census correction (§4).

---

## 10. What is requested of BLUE

1. A scoped source-fidelity check of this revision's §3 against S1–S11, limited to the lowering of the Q1–Q5 rulings. RED is needed only if an answer would add authority beyond the five grants.
2. The A0-only scoped Hard Preflight described in `docs/f014b/a0-preflight-submission.md`, executed against the then-current main SHA and this document's revised commit.
3. On PASS, construction follows S11 Q3 (§2 "Construction order"):
   - A0 on its own bounded branch and PR referencing #114, with the full new verifier ID in the same code transition as its validators;
   - A1 as a dependent stacked PR once source-authorized;
   - a coherent merge/activation window preferred, but no single enormous PR.
4. Construction order within A0:
   - A0-T00, already committed and re-run as A0-T01;
   - contracts;
   - kind/rules;
   - producer;
   - live and historical admission;
   - MS;
   - identity;
   - spec-lock rows;
   - declared re-pins.

   Every §6 fidelity condition must pass. The Builder runs the §7 measurements and returns the PR URL, exact HEAD SHA and terminal CI. Nothing merges or deploys without the Sovereign.
