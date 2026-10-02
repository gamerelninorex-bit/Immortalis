import type { ExternalRecognition } from "@immortalis/contracts";

/**
 * SYNTHETIC TEST DATA for the Diplomacy External Recognition Core Backbone Foundation. Every identifier and text below is a
 * fixture, not IMMORTALIS canon: it carries no game semantics and no calibration — in particular no recognizer, referent,
 * government, claim, boundary, treaty, instrument, authority or succession law exists here beyond the one authored recognition
 * record below, whose values are fixtures and not rules of the game. The Diplomacy owner is NOT synthetic and lives in
 * @immortalis/engine; this module only supplies authored input for it. It deliberately supplies no owner, facet, authority or
 * rule: those come only from the specification-backed registry. Production code must never import this package.
 */
export const RECOGNITION_A = "recognition-a-1";
export const RECOGNITION_B = "recognition-b-1";
export const RECOGNITION_C = "recognition-c-1";
export const RECOGNIZER_REF_A = "recognizer-ref-a-1";
export const RECOGNIZER_REF_B = "recognizer-ref-b-1";
export const REFERENT_REF_A = "referent-ref-a-1";
export const REFERENT_REF_B = "referent-ref-b-1";
export const RECOGNITION_AUTHORITY_BASIS_REF_A = "recognition-authority-basis-ref-a-1";
export const INSTRUMENT_OR_ACT_REF_A = "instrument-or-act-ref-a-1";
export const RECOGNITION_PROVENANCE_REF_A = "recognition-provenance-ref-a-1";
export const SUCCESSOR_RULE_REF_A = "successor-rule-ref-a-1";

/** Lineage/identity for the n-th Diplomacy publication; `basis` and `secrecy` are opaque authored input, never defaulted. */
export const diplomacyPublication = (n: number) => ({
  group_id: `diplomacy-group-${n}`,
  intent_id: `diplomacy-intent-${n}`,
  cause: `diplomacy-cause-${n}`,
  basis: "diplomacy-fixture-basis",
  secrecy: "diplomacy-fixture-visibility",
});

/**
 * A well-formed External Recognition at the WS-008 §6 minimum plus the required `continuity_basis`: the optional
 * `withdrawal_or_supersession_condition`, the conditional `successor_rule_ref` and the conditional `dependency_refs[]` are all
 * omitted (absent, not empty). The references name nothing in this fixture world: no government, representative, status, claim,
 * boundary, belligerency, framework, instrument, authority or act exists behind them. Nothing here is a game rule.
 */
export const externalRecognition = (
  recognitionId = RECOGNITION_A,
  over: Partial<ExternalRecognition> = {},
): ExternalRecognition => ({
  recognition_id: recognitionId,
  recognizer_ref: RECOGNIZER_REF_A,
  recognized_referent_ref: REFERENT_REF_A,
  recognition_scope: "SYNTHETIC FIXTURE: one authored recognition scope.",
  recognition_status: "recognized",
  authority_basis_ref: RECOGNITION_AUTHORITY_BASIS_REF_A,
  effective_from: "SYNTHETIC FIXTURE: an authored effective point.",
  instrument_or_act_ref: INSTRUMENT_OR_ACT_REF_A,
  provenance_ref: RECOGNITION_PROVENANCE_REF_A,
  continuity_basis: "office",
  ...over,
});

/** The same recognition carrying the optional condition and the conditional successor rule reference (no dependency_refs[]). */
export const fullExternalRecognition = (
  recognitionId = RECOGNITION_A,
  over: Partial<ExternalRecognition> = {},
): ExternalRecognition =>
  externalRecognition(recognitionId, {
    withdrawal_or_supersession_condition:
      "SYNTHETIC FIXTURE: an authored withdrawal or supersession condition, carried and never evaluated.",
    successor_rule_ref: SUCCESSOR_RULE_REF_A,
    ...over,
  });
