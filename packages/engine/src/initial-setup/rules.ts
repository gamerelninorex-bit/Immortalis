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
