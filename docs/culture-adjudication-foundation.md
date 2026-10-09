# Culture adjudication record — consumer-free prerequisite (F-027-CJA1)

**Status.** Implements only the consumer-free RC-09 adjudication-record prerequisite of the Sovereign-approved CJA1 v1.1
(`https://app.notion.com/p/3f420af901e0815dae8ac3912a1214fe`). That source is **not native-pinned and not spec-locked**
here: `spec/f027/*` is byte-identical and the registered rule says so
(`effective_basis: "sovereign-approved-not-native-pinned-not-spec-locked"`). No source-lock or promoted-authority status is
asserted. No register row is advanced.

## What exists

- Owner/facet `culture_adjudication_kernel / adjudication_provenance` (infrastructure only, like `causal_draw_kernel`), one
  SEALED fact kind `culture_adjudication_decision` at `adjudication-culture/<64 hex>/decision`.
- `CultureAdjudicationAdapter`: one operation `adjudicate` and one identity read `decision`. One `.commit(` publishes a
  create-only record (`expected_version` 0) under the stable RC-16 identities
  `cjadj:group:v1:<id>` / `cjadj:intent:v1:<id>`; `decision_id = cjadj:v1:<id>`.
- Identities per CJA1: `causal_process_id = "cjadj:trigger:v1:" + sha256Canonical(trigger_ref)`, opportunity
  `CJA_V1_SINGLE_EVALUATION`, `distinction_digest`, `culture_update_id`.
- Authority precedence (§7.2): the trusted in-process `role.gm + permission.rule.adjudicate` precondition is checked **first** —
  before any store read, receipt lookup, port call or disclosure, replay included. `role.archivist + permission.canon.write`
  is used only for the publication. A role string in the judgment carries no privilege; no live human or LLM authentication
  is claimed (the record names `TRUSTED_IN_PROCESS_PRECONDITION`). No model is called.
- Validation: ill-formed Unicode / non-plain JSON is refused before any hash; sealed-reference citation closure (one
  assessment per sealed input, in order; citations only to sealed inputs at their sealed owner/version; CONTRADICTS inputs
  accounted for); verdict/finding coherence C6; structural refusals are distinct from the substantive `NOT_SUPPORTED` /
  `UNRESOLVED` outcomes, which commit.
- Idempotence: identical retry replays; a changed same-ID judgment is `DECISION_CONFLICT` and replaces nothing; an unknown
  commit outcome is reconciled by the deterministic identity and never rerolled. Load integrity re-derives every record from
  committed state and the journal alone (no port, model or live foreign read); a later foreign version advance never
  invalidates a sealed record.
- Ports (§9.1) are typed interfaces (`CultureAdjudicationContextPort`, `PopulationCloseScopeVerifier`); tests use explicit
  test-owned stand-ins in `@immortalis/testkit`. No live Culture, no live PCB-01 attestation, no import of PR #48.

## Encodings and judgment calls (for review)

1. `owner_operation_id` and `scope_key` are carried in the record so identities re-derive without the port.
2. "Ambiguous Unicode" is implemented as lone surrogates (ill-formed UTF-16) only; no normalization policy is invented.
3. "Contradictory evidence must be accounted for" is read as: every `CONTRADICTS` input must be cited by at least one finding.
4. The vouch literal is `live_population_admission: false` with reconciliation `NOT_DUE | DUE_COMPLETED`.
5. Historical proof of a cited source = the sealed context's journaled group (`committedGroup(context intent)`) reading each
   source at its cited version and depending on its group; no group-id journal index is assumed.
6. The Cohort constituency is verified by the port attestation, the registry key kind and the fixed Population close basis;
   it is not re-read live.
7. `NOT_SUPPORTED` / `UNRESOLVED` carry no extra coherence rules beyond what CJA1 §6.3 states.
8. A raw archivist commit cannot carry the GM precondition (the store knows only the archivist authority); admission and
   load integrity re-verify the record's self-consistency and sealed proof instead.

## Out of scope

PR #48, the production Culture consumer and owner, host/GM ingress, LLM adjudication, F-028 / PF-6, deployment.
