# F-014B A0 — Clock-Origin Technical-Source Lowering (Builder candidate)

**Status: BUILDER-PREPARED CANDIDATE FOR BLUE SCOPED SOURCE-FIDELITY / HARD PREFLIGHT. Not a lock, not a PASS, no code.**

- Package: F-014B **A0 — clock-origin engine contract** (master issue #114).
- Base: `gamerelninorex-bit/Immortalis` main `0c9e74b9d5dc8845751a543ace777277b2cb1308`.
- Prepared by: Claude Code as the Builder named in the Sovereign's F-014B construction commission (19 Nov 2026).
- Gate state at preparation: BLUE Scoped Lowering v0.5 holds construction of A0/A1/B0/B1/B2. BLUE v0.3 §9 permits "isolated design and fixture planning" for A0 and B0. BLUE Universal Hard Preflight v6.2 (19 Nov) holds the W2 T1 slice because this A0 lowering did not exist.
- Purpose: close the literal field/schema, owner/kind/key/lifecycle, rule, producer, admission-consumer, historical-verifier, MS and compatibility contract that CAL-TIME T-1 grants 1–5 and BLUE v0.2–v0.5 require **before** A0 construction. Every predicate below is derived from a quoted source or from the code at the base SHA. Where neither fixes one answer, it is listed in §9 rather than chosen.

Spellings marked **CANDIDATE** are ordinary technical encodings proposed by the Builder (or carried from BLUE v0.1's candidate names). They are not Role Registry facts until BLUE pins them.

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

No RED review of Scoped Lowering v0.5 was found (two Notion searches). The Canonical Role Registry (pin `2026-09-25T08:21:22.816Z`) contains **no** Temporal owner/kind rows. The owner-kind table actually in force is `packages/engine/src/owners/registry.ts`, so §3.2 proposes the row in that form and in the Registry's §5 interface-declaration form.

---

## 2. Scope

**In A0** (engine mechanism, T1 only — S8 §1):

1. Strict v2 chronology document and capture schemas, and the two-arm `ChronologyEvidence` union (Alt I).
2. The Temporal-owned SEALED origin witness kind, key, schema and owner-registry row.
3. The shared paired-genesis rule, registered for both Temporal kinds.
4. The registered v2-arm Input rule(s) (RED C4; see Q1).
5. The paired-genesis producer branch in the existing `initialize-captured-chronology` writer.
6. Live admission and **independent** historical verification of the pair and of version-to-genesis correspondence.
7. The MS v3 clock-step pair, live B2 contextual membership and historical MS contextual check.
8. The successor `historyVerificationId` (grant 3), declared re-pins, spec-lock lineage/lowering rows and check-spec validation.
9. A pure, unwired category-8 predicate with **negative-only** tests, labelled preparatory (S8 §5).

**Not in A0:**

- Any reachable non-test author→capture→Input path, the operator v2 capture store, or original-message intake. These are A1. No `packages/operator` file changes in A0.
- The fresh GM SI INITIAL consumer and the live category-8 read. These are B1.
- Calendar profiles, `CAL_TIME_V1`, category 9 and G.3/G.4. These are held by S1 §7.
- Any change to `CanonicalTimeSchema` or `TemporalStateSchema` serialized shape.
- Any retrofit or attestation of an existing v1, direct-operator, never-bootstrap or timed-governance origin.

**Acceptance level:** everything A0 can prove is **T1 MECHANISM ONLY**, using testkit fixture authority (`fixture:` namespace, `FixtureEvidenceVerifier`). No production SI qualification exists until A1 runs (S5 §4).

---

## 3. Literal contract

### 3.1 Chronology v2 document and capture (contracts)

File: `packages/contracts/src/initial-locality.ts`. v1 declarations stay byte-identical. Additions only:

```ts
/** CANDIDATE literal (BLUE v0.1 candidate spelling): the typed SI declaration of S1 §2. */
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
- The comment at `initial-locality.ts:380–385`, which asserts a non-existent equality test, is made true by A0-T00 (§6) and amended to cite that test (RED v0.4 N-2 row).
- **Producer bytes P/H/T (S9 RED v0.2 residual).** `buildProducerInput` (`engine/src/initial-setup/producer.ts:54–89`) embeds `input.chronology.document` verbatim. A v1 document yields identical P, H, T and D. A v2 document changes them only for v2 sessions. That is a version-specific hash, not a parser or identity-formula change. The pinned SCENE instruction text refers to "the captured chronology statement", which v2 keeps, so **no new instruction map** is proposed. A0-T08 verifies this; if verification fails, it becomes trip-wire W1, not a silent change.
- **Completion is unchanged.** `InitialLocalityCompletionSchema` pins the Input and carries no chronology. The binding is the Grant's `chronology_hash` string comparison (`initial-setup/admission.ts:1179`), which works on both arms (S5 §3 correction).

### 3.2 Temporal origin witness (grant 1)

New contracts file **CANDIDATE** `packages/contracts/src/temporal-origin.ts`. A separate file is used so that `packages/contracts/src/temporal.ts`, byte-pinned by 11 conformance suites, is **not** touched. The semantics are identical; this is an engineering choice.

```ts
export const TEMPORAL_ORIGIN_KEY = "temporal/origin"; // CANDIDATE fixed singleton key (S1 §3 "provisionally temporal/origin")
export const TEMPORAL_ORIGIN_FORMAT = "immortalis-temporal-origin"; // CANDIDATE

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

| Field             | Value                                                                                                   | Source                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | `temporal_origin` (CANDIDATE; the spelling used by S1-lineage T-1 v0.4 and RED's T-1 v0.4 review)       | S1 §3                                                                                                                             |
| `owner` / `facet` | `temporal_kernel` / `temporal_coordination` (the existing Temporal pair; no new owner or facet)         | S1 §3 "ONE Temporal owner/facet commit group"; grant 1 "under the Temporal owner's precisely bounded new kind/facet/key" — see Q4 |
| `im` / `rc`       | `IM-02` / `["RC-02", "RC-05"]` (same as `temporal_state`)                                               | registry.ts:701–702                                                                                                               |
| `lifecycle`       | `SEALED` (create-only, enforced at `owners/admission.ts:576–582` and load `world/integrity.ts:208–210`) | S1 §3                                                                                                                             |
| `keyPattern`      | `^temporal/origin$` (no capture group, so campaign-unique like `temporal/state`)                        | S1 §3                                                                                                                             |
| `valueSchema`     | `TemporalOriginSchema`                                                                                  | §3.2                                                                                                                              |
| `rule`            | `TEMPORAL_CAPTURED_V2_GENESIS_RULE` (§3.3) — its only lawful citation                                   | grant 2                                                                                                                           |

`identityMismatch` (`owners/admission.ts:835–1163`, exhaustive switch) gains `case "temporal_origin": return null;` because the key embeds no identities. The test oracle `tests/support/expected-surface.ts` gains the row `{ id: "temporal_origin", owner: "temporal_kernel", facet: "temporal_coordination", lifecycle: "SEALED", group: "TEMPORAL_FACT_KINDS", exampleKey: "temporal/origin" }`. Sunset policy (`engine/src/initial-setup/sunset-policy.ts`) gains a `temporal_origin` row with `OWNER_CHECKS_ONLY`, mirroring `temporal_state` at L502–507.

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

| CANDIDATE id                                                         | Artifact / pin                                                                                                        | Registered as                                                                                                                                                                                                               | Admits                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `TEMPORAL_CAPTURED_V2_GENESIS_RULE`                                  | S1 / `2026-11-18T22:23:26.085Z`, clause "§3 paired genesis (Grant 2)", lineage adds S2 and S3                         | `temporal_origin.rule`; **and** an `alternateRules` entry on `temporal_state` in the shipped `TEMPORAL_FACT_KINDS_WITH_PC_COLLECTION_RETIREMENT` variant (registry.ts:2466), so `classifyGoverningRule` returns `ALTERNATE` | for `temporal_state`: `TemporalStateSchema` parses, `last_transaction === null`, `continuation === null` |
| `INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE` (Q1)                     | S1 / same pin, clause "§2 v2 captured chronology Input (CORE_V9 Canonical Records + Grant 2)", lineage adds S3 and S4 | `alternateRules` entry on `initial_setup_input`                                                                                                                                                                             | `InitialSetupInputSchema` parses and `chronology.format_version === 2`                                   |
| `INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE` (Q1, encoding A only) | as above, clause "…MS v3 route"                                                                                       | `alternateRules` entry on `initial_setup_input`                                                                                                                                                                             | same, MS route                                                                                           |

Determinations:

- `KERNEL_RULE` stays the `temporal_state` kind rule. The v1 one-write genesis keeps citing it. The state-dependent bootstrap precondition still runs whatever rule is cited, as CORE_V9 "Selection and Chronology Checks" requires. The new rule is additive and supersedes nothing (S1 §3; S3).
- The new genesis rule is **not** an `MS_SOURCE` artifact, so the MS fence's rule-per-kind branch (`fence.ts:176–189`) never treats the pair as an MS-source group (S1 §4; RED T-1 v0.4 §3 "Rule registration").
- `tests/conformance/pc-collection-conformance.test.ts:473` asserts that the **base** `TEMPORAL_FACT_KINDS` carry no `alternateRules`. Registering the alternate only on the shipped variant follows the existing pattern and keeps that assertion true.
- `metadataViolation` (`initial-setup/admission.ts:280–310`) gains the arm↔rule correspondence:
  - a v2-chronology Input must cite exactly its route's v2 rule;
  - a v1-chronology Input must cite exactly `INITIAL_SETUP_RULES.initial_setup_input` or `INITIAL_SETUP_INPUT_MS_V3_RULE`, as today.

  The existing MS alternate entry (registry.ts:3438–3443) is **not** edited. Correspondence is enforced by owner admission, which is what the registry comment says alternate value classes require (registry.ts:586–590).

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

### 3.7 Historical verification identity (grant 3)

- `owners/admission.ts:536`: append one segment to the composed production identity, after `+POPULATION-STAGE-AUTHORITY-V2`. CANDIDATE: `+CAL-TIME-T1-CLOCK-ORIGIN@2026-11-18T22:23:26.085Z+MS-V3-CLOCK-STEP-B2-ORIGIN`. The second component is the "affected MS historical-verifier suffix" of grant 3 (Q2). `MS_HISTORY_POLICY_SUFFIX` itself stays as the immutable identity of the old MS segment. Fixture identities keep `+fixture-evidence-t1`. Legacy identities keep `+LEGACY-PRE-V9-RUNTIME-CONTRACT`.
- Reopen semantics already exist and are **not** changed. On a policy mismatch, `checkpoint-package.ts:418–420` sets `audit`. The first open replays the whole journal strictly from empty under the new verifier and then seals a fresh checkpoint (L601–666). Old checkpoints are never trusted under the new identity.
- **Activation rule (S8 §5).** The new identity takes effect in the same commit that installs any changed live or historical verifier in the production admission. Validators are never shipped under the old identity. Whether A0 may merge alone (transition #1 now) or should merge with A1 and the first consumer is Q3.

### 3.8 Category-8 predicate (preparatory only)

A pure CANDIDATE `siOriginWitnessViolation(witness: unknown, clock: CanonicalTime, campaignId: string)` checks exactly the S1 §5 predicate: strict `TemporalOriginSchema`, campaign identity, literal scale, and `origin.unit === clock.unit`. It has **no caller** in A0 and takes no store. A0 tests it negatively only. The positive read and its placement after identity-first replay belong to B1 (S8 §5; RED v0.2 R3-6).

### 3.9 Spec lock and checker (RED C4; S6 §4(ii))

Following the CORE_V9 registration pattern (S3 "Source Registration and Reader Boundary"):

- `design_lineage_successors` adds CANDIDATE `CAL-TIME-T1-CLOCK-ORIGIN-LINEAGE`: `of_frozen_source: null`, `status: "DESIGN_RATIFIED"`, `executable: false`, `narrows_frozen_pin: false`, the S1 URL and pin, sections `["§2","§3","§4","§5","§6"]`, ratification S2.
- `executable_lowerings` adds CANDIDATE `CAL-TIME-T1-CLOCK-ORIGIN-LOWERING`:
  - `status: "FROZEN_EXECUTABLE_LOWERING"`, `relation: "COMPOSES_WITH"`, `cites_design_lineage: ["CAL-TIME-T1-CLOCK-ORIGIN-LINEAGE", "GM-INITIAL-BOOTSTRAP-V9-LINEAGE"]`, `primary_im: "IM-02"`;
  - `fact_kinds: ["temporal_origin", "temporal_state", "initial_setup_input"]`;
  - closed fields `temporal_owner: "temporal_kernel/temporal_coordination"`, `temporal_precondition: "bootstrapInitialTimePrecondition"`, `temporal_writer: "initialize-captured-chronology"`, `genesis_rule: "TEMPORAL_CAPTURED_V2_GENESIS_RULE"`, `history_policy_segment`;
  - `does_not`: no calendar, no category 9, no GM canon read, no retrofit of v1/direct/timed-governance origins, no live category-8 read.

  **The URL/pin of the executable lowering artifact is BLUE's to fix (Q5).**

- `tools/check-spec.ts` validates the two rows field-by-field. It also checks that the composed `historyVerificationId` contains the segment and that `temporal_state`'s only alternate is the genesis rule.
- Regenerate `packages/contracts/src/spec-identity.ts` through `tools/gen-spec-identity.ts`. The spec-lock SHA-256 changes and is re-pinned in `current-look-lowering-conformance` (§4).

---

## 4. Declared re-pins and structural guards (S7 §4 P-3)

Every entry below is an **expected, declared** consequence of the A0 construction PR. Each re-pin records base and head SHA-256 and cites this lowering. None is a silent test edit. All base values were verified against the actual bytes at `0c9e74b` by census. Per the repository's provenance rule (H-PROVENANCE), present-day identities are not restated in this document; they live only in their designated tables (§8).

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
| Composed historyVerificationId literal                                | `ms-setup-source.test.ts:72–91`; `pc-standing-ledger-conformance.test.ts:246–255`; `tests/integration/pc-standing-ledger-policy.test.ts:86–90`                                                                                                                                      | Expected value gains the §3.7 segment.                                                                                              |
| Kind lists                                                            | `temporal-conformance.test.ts:80–87, 99`; `expected-surface.ts:68–107, 1057`; culture:136, population:92, kti:112 length checks                                                                                                                                                     | Add `temporal_origin`.                                                                                                              |
| Sunset coverage                                                       | `ms-setup-source.test.ts:57–67` (93); `pc-standing-ledger-conformance.test.ts:260`                                                                                                                                                                                                  | Add the row; 94.                                                                                                                    |
| **Not touched**                                                       | `packages/contracts/src/temporal.ts` (11 pins); `temporal/integrity.ts` (6 pins, three inside the D-3 protected gateway conformance suites); the three D-3 gateways; `packages/operator/**` (tree-pinned); `chronology-capture.ts` (a05 pin); `time-initialization.ts`; phone files | A0 is designed so none of these change. Touching the D-3 pins would be trip-wire W3.                                                |

Load integrity for the new kind comes from the generic owner/schema/SEALED checks (`world/integrity.ts:195–212`) and strict historical replay. `temporal/integrity.ts` filters to the five existing Temporal kinds and is deliberately not edited (see the last row).

---

## 5. Version compatibility statement

- Every existing v1 Input, capture, document, journal, receipt and checkpoint stays acceptable under its original law. Old journals contain only v1 captures, so the union's v1 arm is the only arm they can reach (RED C2).
- The direct operator `initialize-time` route, never-bootstrap prefixes and `initial-timed-governance` (`operator/src/initial-timed-governance.ts:499–502`, a scratch dry-run) remain one-write opaque v1 genesis. They are never SI-eligible and never retrofitted (S1 §2; Codex arithmetic witnesses).
- The legacy wrapper (`legacyContractAdmission`, owners/admission.ts:823–833) already refuses all bootstrap kinds. The captured route, and with it the pair, is unreachable for legacy packages.
- Unrelated campaigns pay a one-time strict-replay first-open cost when the identity changes (S3 "Changing the single global historyVerificationId…"). §7 measures it.

---

## 6. Test catalogue (all T1 MECHANISM ONLY; none run yet)

| ID         | Case                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Source                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| **A0-T00** | **First commit, before any schema change.** v1 corpus over the existing exports `ChronologyDocumentSchema` and `StartingChronologySchema`. Valid: arbitrary unit Id, values 0 and MAX_SAFE_INTEGER, exact format/statement. Negative: wrong version, missing/extra fields, wrong time shape, invalid unit, out-of-bounds value, coercion attempts. Identical accept/refuse, identical canonical JSON and `document_hash` where accepted. Freeze the results. | S6 §3 N-2                |
| A0-T01     | Re-run A0-T00 unchanged after the union lands; byte/acceptance identity.                                                                                                                                                                                                                                                                                                                                                                                     | S6 §3                    |
| A0-T02     | v2 contract table: valid v2 capture; v2 doc in v1 capture; v1 doc in v2 capture; missing/extra/other `scale`; wrong hashes; TOOL_CALL_ONLY refused at Input admission.                                                                                                                                                                                                                                                                                       | S5 §3; RED C2            |
| A0-T03     | `StartingChronologySchema`, `initialize-time` and the three phone parsers refuse a v2 document; their source-text conformance test is unchanged.                                                                                                                                                                                                                                                                                                             | RED C5; S5 §3            |
| A0-T04     | Input arm↔rule correspondence: v2 Input under the V9 or MS v3 rule refuses; v1 Input under a v2 rule refuses; each v2 rule admits only v2.                                                                                                                                                                                                                                                                                                                   | RED C4                   |
| A0-T05     | Non-MS lawful v2 genesis through `initializeCapturedChronology`: the pair commits, state is version 1, origin is version 1, the same group; strict reopen replays clean.                                                                                                                                                                                                                                                                                     | S1 §3; grant 2           |
| A0-T06     | Pair accepted in either write order; refused with a third write, a transaction write, a non-zero expected version, the wrong rule, or a mismatched basis/secrecy.                                                                                                                                                                                                                                                                                            | S1 §3; S5 §8             |
| A0-T07     | Correspondence: v2 Input with state-only genesis refuses; v1 Input with a pair refuses (live **and** a hash-valid interposed journal on replay).                                                                                                                                                                                                                                                                                                             | S1 §2; grant 3           |
| A0-T08     | Producer P/H/T/D: v1 session bytes identical to base; v2 differs only through the document; instruction map unchanged; delivered-bytes check passes.                                                                                                                                                                                                                                                                                                         | RED v0.2 residual        |
| A0-T09     | Origin value forgery: wrong campaign, time, unit, capture_ref/hash, document_hash, grade, governing Completion/Input pin or version each refuses; TOOL_CALL_ONLY grade unrepresentable.                                                                                                                                                                                                                                                                      | S1 §3                    |
| A0-T10     | Never-bootstrap prefix: origin refuses; state-only unchanged. Raw `KERNEL_RULE` pair refuses. Origin-only group refuses. Late origin after state refuses. Second origin refuses (`AMENDMENT_NOT_SUPPORTED`).                                                                                                                                                                                                                                                 | S1 §2–§3; T-1 v0.2       |
| A0-T11     | Same-ID lost-ACK retry of the v2 genesis converges to one pair; a changed v2 capture under the same Completion cannot reuse the intent.                                                                                                                                                                                                                                                                                                                      | S3; BLUE v0.1            |
| A0-T12     | MS v3 lawful v2: issue→response→existence→B1→closure→**pair**→B2; strict reopen; presence pins `temporal/state` v1; reads and depends_on equal `msTimePins` exactly.                                                                                                                                                                                                                                                                                         | grant 5                  |
| A0-T13     | MS negatives: origin at PRE_CLOCK; v2 MS Input with state-only clock step; pair at any other phase; origin with different `group_id`; origin under the old rule; origin without the paired state at B2; presence refused after each.                                                                                                                                                                                                                         | RED T-1 v0.4 §5          |
| A0-T14     | MS historical: hash-valid journal with an arbitrary SEALED origin earlier in the prefix is flagged; a lawful pair is not; a pre-change MS journal replays under its original identity.                                                                                                                                                                                                                                                                       | grant 5; RED T-1 v0.4 §5 |
| A0-T15     | Identity transition: an old checkpoint opened under the new identity triggers cold strict replay and a fresh checkpoint; fixture and legacy suffixes are preserved.                                                                                                                                                                                                                                                                                          | grant 3                  |
| A0-T16     | Legacy controls unchanged: `initialize-time` direct origin, never-bootstrap, timed-governance dry run, v1 captured non-MS, v1 MS, PR #107 S-4 ledger, existing `temporal-enforcement` "established alone" cases.                                                                                                                                                                                                                                             | S1 §2; S8                |
| A0-T17     | `siOriginWitnessViolation` negatives only: malformed, wrong campaign, wrong scale, unit mismatch. Labelled PREPARATORY; no T0 PASS claimed.                                                                                                                                                                                                                                                                                                                  | S8 §5                    |

---

## 7. Engineering acceptance and OB-030

- **Player result:** none directly. A0 makes "two minutes" machine-verifiable as 120 SI seconds for a campaign whose author declared SI scale at setup, so later GM waits can convert durations lawfully. It adds no player question and no GM confirmation (S1 §2).
- **Reused path:** the existing captured writer, coordinator `#kernelGroup`, bootstrap precondition, MS fence/prefix/integrity, checkpoint transition. New machinery: one kind, one schema file, one rule (or three; Q1), one pure shape check, one pure preparatory predicate.
- **Whole-operation cost.** Genesis gains one write (bounded, once per campaign). Admission and replay gain constant-size checks. The material cost is the **first open after the identity change**: a cold strict replay of every existing campaign.
- **Measurement plan (UNRUN).** Reuse `tools/h07-s2-benchmark.ts` / `h07-s2-compare.ts` (policy-transition first-open replay) on base vs candidate. Use the same pinned journals:
  - v1 no-bootstrap;
  - v1 captured;
  - v1 MS;
  - S-4 ledger;
  - new v2 non-MS and MS.

  Measure cold first open, immediate reopen and warm open. Report wall time, CPU, peak RSS, journal bytes and entries, read/write counts, and checkpoint creation, with repeated runs and environment recorded. There is no invented threshold. Any material regression goes to BLUE and, if it is a trade-off, to the Sovereign (S5 §6).

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

No new fixture or reproduction bundle exists yet. A0 fixtures will be committed with the construction PR at an immutable commit. Each will have its path, byte length and SHA-256 recorded in the repository's designated identity tables, for recipient verification.

---

## 9. Open source questions for BLUE (genuine; nothing below is chosen by this document)

- **Q1 — Input rule for the v2 arm per route.** RED C4 requires "a new current governing rule … for the v2 arm". Grant 5 bounds MS changes to the clock step, B2 and historical integrity, and `ms-setup-source.test.ts` pins the MS manifest at exactly ten clauses. Two faithful encodings:
  - **A (Builder recommendation):** two T-1-sourced Input alternates, one per route. `isMsInputRule` (`prefix.ts:18–19`) also recognises the MS v2 rule, so MS route identity, bootstrap's route pairing (`bootstrap.ts:77`) and the fence view keep working. The MS manifest is untouched because the new rules cite S1, not `MS_SOURCE`.
  - **B:** one non-MS v2 rule; an MS v2 Input keeps citing `INITIAL_SETUP_INPUT_MS_V3_RULE`, with its v2 arm registered only by the lowering row. B touches less MS code but leaves the MS v2 arm without its own rule, which reads against C4.
- **Q2 — identity segment spelling.** Confirm the §3.7 segment. Confirm that grant 3's "affected MS historical-verifier suffix" is satisfied by an MS component appended to the global identity rather than by editing the `MS_HISTORY_POLICY_SUFFIX` constant (which would rename the old segment).
- **Q3 — activation sequencing.** S8 §5 prefers one composed transition for A0+A1+the first genuine consumer, but forbids shipping new validators under the old identity. So either:
  - (a) A0 merges alone with transition #1 (live validators, unreachable producer); or
  - (b) the A0 PR stays open, reviewed but unmerged, until A1 and B1 can join it in one transition.

  Merge timing is the Sovereign's. The Builder can build either way.

- **Q4 — kind/key/literal spellings.** Pin `temporal_origin`, `temporal/origin`, `immortalis-temporal-origin` and `ONE_SI_SECOND_PER_CANONICAL_UNIT`. Confirm that grant 1's "precisely bounded new kind/facet/key" permits reuse of the existing `temporal_coordination` facet. S1 §3's "ONE Temporal owner/facet commit group" requires the origin and state to share one facet.
- **Q5 — executable lowering artifact.** CORE_V9's lowering rows cite a Notion executable-contract page and pin. Decide whether the `CAL-TIME-T1-CLOCK-ORIGIN-LOWERING` row cites this repository document at an immutable commit SHA, or a BLUE Notion page that adopts it.

---

## 10. What is requested of BLUE

1. A scoped Source-Fidelity check of §3 against S1–S9, and answers to Q1–Q5. RED is needed only if an answer would add authority beyond the five grants.
2. A scoped Hard Preflight for A0 construction at the then-current main SHA.
3. On PASS, the Builder implements A0 in the order A0-T00 → contracts → kind/rules → producer → live and historical admission → MS → identity → spec-lock rows → declared re-pins, on one PR that references #114. It runs the §6 tests and the §7 measurements and returns the PR URL, exact HEAD SHA and terminal CI. Nothing merges without the Sovereign.
