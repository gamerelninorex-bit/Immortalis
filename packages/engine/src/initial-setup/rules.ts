import {
  INITIAL_COMPLETION_SCENE_CLOSURE_RULE_ID,
  INITIAL_COMPLETION_WORKFORCE_SCOPE_RULE_ID,
  INITIAL_SETUP_RULE_IDS,
  INITIAL_SETUP_SCOPE_RULE_ID,
  type InitialSetupFactKindId,
  type SourceRef,
} from "@immortalis/contracts";

/**
 * Governing-rule citations (RC-01 SourceRef) of the v0.9 Initial Locality Bootstrap. Each cites the paired executable contract and
 * its pin, the paired prospective source and its pin, and the Sovereign's ratification of CORE_V9 and, separately, OPTION_A_V9, all
 * composing with F-027 v1.0. They are source-locked by the `GM-INITIAL-BOOTSTRAP-V9-LOWERING` (core) and
 * `CPAA-C1-F1-INITIAL-COMPLETION-V9-LOWERING` (OPTION_A_V9) rows added to `spec/f027/spec-lock.json` in the same change.
 *
 * Nothing here recovers or re-pins the historical WG snapshot (it stays Historical OPEN) and nothing promotes CPAA-C1 v0.3 clauses
 * F-2–F-5, which stay unchanged.
 */
export const INITIAL_BOOTSTRAP_CONTRACT_SOURCE = {
  artifact: "https://app.notion.com/p/40b20af901e08198abdacb340e3507df",
  native_pin: "2026-11-01T12:13:53.634Z",
} as const;
export const INITIAL_BOOTSTRAP_SEMANTIC_SOURCE = {
  artifact: "https://app.notion.com/p/40b20af901e081069bb7ce5118a047b1",
  native_pin: "2026-11-01T12:13:42.692Z",
} as const;
export const INITIAL_BOOTSTRAP_RATIFICATION = {
  artifact: "https://app.notion.com/p/40c20af901e081d7999be2b4f317c70a",
  native_pin: "2026-11-02T15:46:21.719Z",
} as const;
export const F027_PACKAGE_PIN = "2026-09-29T00:40:44.707Z";

export const INITIAL_BOOTSTRAP_LINEAGE_ID = "GM-INITIAL-BOOTSTRAP-V9-LINEAGE";
export const INITIAL_BOOTSTRAP_LOWERING_ID = "GM-INITIAL-BOOTSTRAP-V9-LOWERING";
export const CPAA_F1_LINEAGE_ID = "CPAA-C1-F1-INITIAL-COMPLETION-V9-LINEAGE";
export const CPAA_F1_LOWERING_ID = "CPAA-C1-F1-INITIAL-COMPLETION-V9-LOWERING";

const CORE_LINEAGE: readonly string[] = [
  `Initial Locality Bootstrap v0.9 CORE_V9 — lowering ${INITIAL_BOOTSTRAP_LOWERING_ID} over design lineage ${INITIAL_BOOTSTRAP_LINEAGE_ID} (paired semantic source ${INITIAL_BOOTSTRAP_SEMANTIC_SOURCE.artifact} at ${INITIAL_BOOTSTRAP_SEMANTIC_SOURCE.native_pin}; executable contract ${INITIAL_BOOTSTRAP_CONTRACT_SOURCE.artifact} at ${INITIAL_BOOTSTRAP_CONTRACT_SOURCE.native_pin})`,
  `Sovereign ratification of CORE_V9 and, separately, OPTION_A_V9 ("Ratified. Continue"): ${INITIAL_BOOTSTRAP_RATIFICATION.artifact} at ${INITIAL_BOOTSTRAP_RATIFICATION.native_pin}`,
  `composes WITH F-027 v1.0 (package pin ${F027_PACKAGE_PIN}); the historical WG snapshot stays Historical OPEN and is neither recovered nor re-pinned`,
];
const OPTION_A_LINEAGE: readonly string[] = [
  ...CORE_LINEAGE,
  `Initial Scene Exception OPTION_A_V9 — lowering ${CPAA_F1_LOWERING_ID} over design lineage ${CPAA_F1_LINEAGE_ID}; narrows only the source of CPAA-C1 v0.3 F-1 premises for INITIAL_COMPLETION_V9 (CPAA-C1 v0.3 pin 2026-10-16T07:19:16.351Z, ratification 2026-10-16T07:56:18.556Z; F-2–F-5 and all other clauses unchanged)`,
];

const rule = (clause: string, lineage: readonly string[]): SourceRef => ({
  artifact: INITIAL_BOOTSTRAP_CONTRACT_SOURCE.artifact,
  native_pin: INITIAL_BOOTSTRAP_CONTRACT_SOURCE.native_pin,
  clause,
  authority_lineage: [...lineage],
  effective_basis: "pinned-by-spec-lock",
  supersedes: null,
});

const SECTIONS: Record<InitialSetupFactKindId, string> = {
  initial_setup_input:
    "Canonical Records — Input; Admission and Freeze (exactly one ORIGINAL world, locus and finite source; closed original-genesis whitelist; qualified authored evidence; same-locality fingerprint deduplication; active-Input freeze)",
  initial_setup_invocation:
    "Canonical Records — Invocation; Admission and Freeze; Private Runner and Replay Assurance (a canonical reservation before any invocation; one SCOPE reservation per session and at most one SCENE reservation per locality; no negative void)",
  initial_setup_response:
    "Canonical Records — Response; Private Runner and Replay Assurance (the exact raw response bytes, their hash and an Ed25519 signature bound to the admission-time Input key; replay needs no operator response file)",
  initial_setup_grant:
    "Canonical Records — Grant; Scope and Total Inputs (a grant only from a SCOPE_AUTHORIZED classification whose every facet is delegated or fixed by source)",
  initial_locality_completion:
    "Canonical Records — Completion; Selection and Chronology Checks (the strict parse of the exact signed SCENE response; completion validation is a pure function of the frozen pre-state and that response)",
  initial_setup_disposition:
    "Canonical Records — Disposition; Admission and Freeze (the terminal non-completion dispositions that release the freeze; a refused or unresolved result is never rerun)",
};

/** One governing rule per v0.9 canonical record kind (CORE_V9). */
export const INITIAL_SETUP_RULES: Readonly<Record<InitialSetupFactKindId, SourceRef>> = {
  initial_setup_input: rule(
    `${INITIAL_SETUP_RULE_IDS.initial_setup_input}: ${SECTIONS.initial_setup_input}`,
    CORE_LINEAGE,
  ),
  initial_setup_invocation: rule(
    `${INITIAL_SETUP_RULE_IDS.initial_setup_invocation}: ${SECTIONS.initial_setup_invocation}`,
    CORE_LINEAGE,
  ),
  initial_setup_response: rule(
    `${INITIAL_SETUP_RULE_IDS.initial_setup_response}: ${SECTIONS.initial_setup_response}`,
    CORE_LINEAGE,
  ),
  initial_setup_grant: rule(
    `${INITIAL_SETUP_RULE_IDS.initial_setup_grant}: ${SECTIONS.initial_setup_grant}`,
    CORE_LINEAGE,
  ),
  initial_locality_completion: rule(
    `${INITIAL_SETUP_RULE_IDS.initial_locality_completion}: ${SECTIONS.initial_locality_completion}`,
    CORE_LINEAGE,
  ),
  initial_setup_disposition: rule(
    `${INITIAL_SETUP_RULE_IDS.initial_setup_disposition}: ${SECTIONS.initial_setup_disposition}`,
    CORE_LINEAGE,
  ),
};

/**
 * The operation-specific rule of the world-subject scope classification (`referee_decision`, operation
 * WG_INITIAL_DELEGATION_CLASSIFY, host gm-initial-scope, channel PRIVATE_ISOLATED_RUNNER). It is an ALTERNATE value-class rule of the
 * existing Referee kind: the PC-subject branches keep their own rules byte for byte, and existing kind-level base-authority caveats
 * are not promoted by it.
 */
export const INITIAL_SETUP_SCOPE_RULE: SourceRef = rule(
  `${INITIAL_SETUP_SCOPE_RULE_ID}: Scope and Total Inputs — the private least-privilege host gm-initial-scope bound only to WG_INITIAL_DELEGATION_CLASSIFY, published by the trusted Referee service from the signed canonical Response under role.gm adjudication and role.archivist writing`,
  CORE_LINEAGE,
);

/** OPTION_A_V9: the owner-derived scene closure projection for INITIAL_COMPLETION_V9 only. */
export const INITIAL_COMPLETION_SCENE_CLOSURE_RULE: SourceRef = rule(
  `${INITIAL_COMPLETION_SCENE_CLOSURE_RULE_ID}: CPAA Projection and Canonical Sunset — projects only CLOSED + NONE_IN_DOMAIN + every source NONE_ESTABLISHED into the existing WorldSceneClosureSchema/UNENCUMBERED grounds, from an owner-admitted signed isolated initial_locality_completion, at the as-of prefix`,
  OPTION_A_LINEAGE,
);

/** OPTION_A_V9: the Population workforce scope for INITIAL_COMPLETION_V9 only; Population independently derives representations and accounted units. */
export const INITIAL_COMPLETION_WORKFORCE_SCOPE_RULE: SourceRef = rule(
  `${INITIAL_COMPLETION_WORKFORCE_SCOPE_RULE_ID}: CPAA Projection and Canonical Sunset — retains population/population_workforce_scope; Population independently derives actual representations, accounted units and PC membership; no headcount, cohort, P-2 or §28 invention`,
  OPTION_A_LINEAGE,
);

export const CAPTURED_CHRONOLOGY_RULE_CLAUSE =
  "Selection and Chronology Checks — initialize-captured-chronology: the unchanged structural KERNEL_RULE citation plus the mandatory state-dependent bootstrapInitialTimePrecondition";

// ---------------------------------------------------------------------------------------------------------------------
// CAL-TIME T-1 Unified Clock-Origin Source v1.0 (F-014B A0, T1 MECHANISM ONLY)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Governing sources of the A0 clock-origin mechanism. The adopted CAL-TIME T-1 source and its Sovereign ratification (five grants)
 * are the design authority; BLUE's 20 November decisions record and its A0 scoped Hard Preflight PASS brief direct the bounded
 * technical lowering, and the accepted A0 source lock is the immutable final contract. They are source-locked by the
 * `CAL-TIME-T1-CLOCK-ORIGIN-LOWERING` row added to `spec/f027/spec-lock.json` in the same change; `tools/check-spec.ts` asserts every
 * value here by exact equality.
 *
 * Nothing here re-pins a frozen source, supersedes a CORE_V9 / MS rule, or reinterprets a v1 / direct-operator / never-bootstrap /
 * timed-governance origin: the three rules below are additive alternates, and the v1 rules remain exactly as they were.
 */
export const CAL_TIME_T1_SOURCE = {
  artifact: "https://app.notion.com/p/41c20af901e0817ca9e8dcb392e3b0d7",
  native_pin: "2026-11-18T22:23:26.085Z",
} as const;
export const CAL_TIME_T1_RATIFICATION = {
  artifact: "https://app.notion.com/p/41c20af901e081ba9fd4db4da81c8526",
  native_pin: "2026-11-18T22:38:52.341Z",
} as const;
export const A0_BLUE_DECISIONS_RECORD = {
  artifact: "https://app.notion.com/p/41e20af901e08163acb0f8ed695f44ad",
  native_pin: "2026-11-20T00:15:08.470Z",
} as const;
export const A0_BLUE_PASS_BRIEF = {
  artifact: "https://app.notion.com/p/41e20af901e081b2ba6ae6f08959a647",
  native_pin: "2026-11-20T07:09:04.196Z",
} as const;
/** The immutable accepted A0 source-lock document: repository, commit and path, never an editable PR head. */
export const A0_SOURCE_LOCK_CUSTODY =
  "gamerelninorex-bit/Immortalis@37ba11bd0f0f068a22731f87351a0fd9a16a885b:docs/f014b/a0-clock-origin-source-lock.md";

export const CAL_TIME_T1_LINEAGE_ID = "CAL-TIME-T1-CLOCK-ORIGIN-LINEAGE";
export const CAL_TIME_T1_LOWERING_ID = "CAL-TIME-T1-CLOCK-ORIGIN-LOWERING";

/**
 * The two additive segments of the composed `historyVerificationId` (BLUE S11 Q2). The old `MS_HISTORY_POLICY_SUFFIX` literal is
 * retained unchanged; these are distinguishable and are appended after `+POPULATION-STAGE-AUTHORITY-V2`, in the same change as the
 * validators they identify. Every composed identity (production, MS, fixture, legacy, extension) therefore changes.
 */
export const CAL_TIME_T1_HISTORY_POLICY_SEGMENT = `+CAL-TIME-T1-CLOCK-ORIGIN@${CAL_TIME_T1_SOURCE.native_pin}`;
export const MS_V3_CLOCK_ORIGIN_HISTORY_POLICY_SEGMENT = "+MS-V3-CLOCK-STEP-B2-ORIGIN";

const T1_LINEAGE: readonly string[] = [
  `CAL-TIME T-1 Unified Clock-Origin Source v1.0 — lowering ${CAL_TIME_T1_LOWERING_ID} over design lineage ${CAL_TIME_T1_LINEAGE_ID} (adopted source ${CAL_TIME_T1_SOURCE.artifact} at ${CAL_TIME_T1_SOURCE.native_pin})`,
  `Sovereign ratification of CAL-TIME T-1, five grants: ${CAL_TIME_T1_RATIFICATION.artifact} at ${CAL_TIME_T1_RATIFICATION.native_pin}`,
  `Initial Locality Bootstrap v0.9 CORE_V9 executable contract ${INITIAL_BOOTSTRAP_CONTRACT_SOURCE.artifact} at ${INITIAL_BOOTSTRAP_CONTRACT_SOURCE.native_pin}, ratified at ${INITIAL_BOOTSTRAP_RATIFICATION.artifact} ${INITIAL_BOOTSTRAP_RATIFICATION.native_pin}; the v1 rules and v1 bytes are unchanged`,
  `BLUE F-014B Issue #114 direct decisions Q1-Q5 (${A0_BLUE_DECISIONS_RECORD.artifact} at ${A0_BLUE_DECISIONS_RECORD.native_pin}) and A0 scoped Hard Preflight PASS (${A0_BLUE_PASS_BRIEF.artifact} at ${A0_BLUE_PASS_BRIEF.native_pin}); immutable accepted contract ${A0_SOURCE_LOCK_CUSTODY}`,
  `composes WITH F-027 v1.0 (package pin ${F027_PACKAGE_PIN}); T1 MECHANISM ONLY: no production qualification, no calendar, no category 9, no GM canon read, no retrofit of any v1, direct-operator, never-bootstrap or timed-governance origin`,
];

const t1Rule = (clause: string): SourceRef => ({
  artifact: CAL_TIME_T1_SOURCE.artifact,
  native_pin: CAL_TIME_T1_SOURCE.native_pin,
  clause,
  authority_lineage: [...T1_LINEAGE],
  effective_basis: "pinned-by-spec-lock",
  supersedes: null,
});

/**
 * The rule of the Temporal-owned SEALED `temporal_origin` kind, and the ONLY alternate citation of `temporal_state`: one group of
 * exactly two version-zero writes (`temporal/state` and `temporal/origin`) citing it is the paired genesis of a v2 captured chronology.
 * It is not an `MS_SOURCE` artifact, so the MS fence never treats the pair as an MS-source group.
 */
export const TEMPORAL_CAPTURED_V2_GENESIS_RULE: SourceRef = t1Rule(
  "TEMPORAL_CAPTURED_V2_GENESIS_RULE: §3 paired genesis (Grant 2) — exactly temporal/state and the SEALED temporal/origin, both expected_version 0, in ONE temporal_kernel/temporal_coordination group, derived from the governing Completion and its own Input's v2 captured chronology",
);

/** The non-MS Input citation of a v2 captured chronology (the arm / route / rule correspondence is enforced live and on replay). */
export const INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE: SourceRef = t1Rule(
  "INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE: §2 v2 captured chronology Input (CORE_V9 Canonical Records + Grant 2) — admits only an Input whose chronology is a strict version 2 capture, on the non-MS route",
);

/**
 * The MS-v3 Input citation of a v2 captured chronology. It cites T-1, never an MS_SOURCE clause, and is admitted as MS only under the
 * original MS Input checks (the strict Ed25519/V2 actor profile, the enrolled tuple, the earlier-session rules) and its exact MS
 * Completion pairing, live and on replay.
 */
export const INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE: SourceRef = t1Rule(
  "INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE: §2 v2 captured chronology Input, MS v3 route (CORE_V9 Canonical Records + Grant 2 + Grant 5) — admits only an Input whose chronology is a strict version 2 capture, on the MS v3 route",
);
