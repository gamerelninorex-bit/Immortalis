import type {
  DiplomaticFramework,
  ExternalRecognition,
  ExternalizedClaimDispute,
  RelationEdge,
} from "@immortalis/contracts";

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

export const DISPUTE_A = "dispute-a-1";
export const DISPUTE_B = "dispute-b-1";
export const DISPUTE_C = "dispute-c-1";
export const DISPUTE_PARTY_REF_A = "dispute-party-ref-a-1";
export const DISPUTE_PARTY_REF_B = "dispute-party-ref-b-1";
export const DISPUTE_UNDERLYING_SUBJECT_REF_A = "dispute-underlying-subject-ref-a-1";
export const DISPUTE_INTERPRETATION_ISSUE_REF_A = "dispute-interpretation-issue-ref-a-1";
export const DISPUTE_INSTRUMENT_OR_CLAUSE_REF_A = "dispute-instrument-or-clause-ref-a-1";
export const DISPUTE_ADJUDICATION_BASIS_REF_A = "dispute-adjudication-basis-ref-a-1";
export const DISPUTE_PROVENANCE_REF_A = "dispute-provenance-ref-a-1";

/**
 * A well-formed Externalized Claim / Dispute at the WS-008 §7 minimum: every required field, with the optional
 * `requested_remedy_or_demand`, `interpretation_issue_ref`, `instrument_or_clause_ref` and `adjudication_basis_ref` and the
 * conditional `dependency_refs[]` and `effect_on` all omitted (absent, not empty). The references name nothing in this fixture
 * world: no underlying claim, party, instrument, clause or adjudication exists behind them. Nothing here is a game rule.
 */
export const externalizedClaimDispute = (
  disputeId = DISPUTE_A,
  over: Partial<ExternalizedClaimDispute> = {},
): ExternalizedClaimDispute => ({
  dispute_id: disputeId,
  party_refs: [DISPUTE_PARTY_REF_A, DISPUTE_PARTY_REF_B],
  underlying_subject_ref: DISPUTE_UNDERLYING_SUBJECT_REF_A,
  communicated_position_entries: [
    "SYNTHETIC FIXTURE: one authored communicated position entry.",
    { authored: "SYNTHETIC FIXTURE: another authored entry, carried as given." },
  ],
  status: "SYNTHETIC FIXTURE: an authored status.",
  provenance_ref: DISPUTE_PROVENANCE_REF_A,
  ...over,
});

/** The same dispute carrying every optional §7 field (no `dependency_refs[]`, no `effect_on`). */
export const fullExternalizedClaimDispute = (
  disputeId = DISPUTE_A,
  over: Partial<ExternalizedClaimDispute> = {},
): ExternalizedClaimDispute =>
  externalizedClaimDispute(disputeId, {
    requested_remedy_or_demand:
      "SYNTHETIC FIXTURE: an authored remedy or demand, carried and never evaluated.",
    interpretation_issue_ref: DISPUTE_INTERPRETATION_ISSUE_REF_A,
    instrument_or_clause_ref: DISPUTE_INSTRUMENT_OR_CLAUSE_REF_A,
    adjudication_basis_ref: DISPUTE_ADJUDICATION_BASIS_REF_A,
    ...over,
  });

export const RELATION_A = "relation-a-1";
export const RELATION_B = "relation-b-1";
export const RELATION_C = "relation-c-1";
export const RELATION_PARTY_REF_A = "relation-party-ref-a-1";
export const RELATION_PARTY_REF_B = "relation-party-ref-b-1";
export const RELATION_PROVENANCE_REF_A = "relation-provenance-ref-a-1";

/**
 * A well-formed Relation Edge at the WS-008 §5.1 authored core: every required field, with the optional
 * `rupture_or_suspension_status` and `provenance_ref` omitted (absent, not empty). The party references name nothing in this
 * fixture world: no diplomatic party, Recognition, Claim / Dispute, Channel, Instrument or Framework exists behind them, and no
 * derived reference array is part of the record. Nothing here is a game rule.
 */
export const relationEdge = (
  relationId = RELATION_A,
  over: Partial<RelationEdge> = {},
): RelationEdge => ({
  relation_id: relationId,
  party_refs: [RELATION_PARTY_REF_A, RELATION_PARTY_REF_B],
  relation_scope: "SYNTHETIC FIXTURE: an authored relation scope.",
  lifecycle_status: "SYNTHETIC FIXTURE: an authored lifecycle status.",
  ...over,
});

/** The same relation edge carrying both optional fields. */
export const fullRelationEdge = (
  relationId = RELATION_A,
  over: Partial<RelationEdge> = {},
): RelationEdge =>
  relationEdge(relationId, {
    rupture_or_suspension_status: "SYNTHETIC FIXTURE: an authored rupture or suspension status.",
    provenance_ref: RELATION_PROVENANCE_REF_A,
    ...over,
  });

export const FRAMEWORK_A = "framework-a-1";
export const FRAMEWORK_B = "framework-b-1";
export const FRAMEWORK_C = "framework-c-1";
export const FRAMEWORK_MEMBER_REF_A = "framework-member-ref-a-1";
export const FRAMEWORK_MEMBER_REF_B = "framework-member-ref-b-1";
export const FRAMEWORK_CHARTER_REF_A = "framework-charter-ref-a-1";
export const FRAMEWORK_COMMITMENT_REF_A = "framework-commitment-ref-a-1";
export const FRAMEWORK_DECISION_RULE_REF_A = "framework-decision-rule-ref-a-1";
export const FRAMEWORK_PROVENANCE_REF_A = "framework-provenance-ref-a-1";

/**
 * A well-formed Diplomatic Framework at the WS-008 §16 authored core: every required field, with the conditional
 * `collective_decision_rule_ref` omitted (absent, not empty). The references name nothing in this fixture world: no member,
 * charter, instrument, commitment, decision rule or provenance object exists behind them, and no Relation Edge, Recognition,
 * Claim / Dispute or derived index is part of the record. Nothing here is a game rule.
 */
export const diplomaticFramework = (
  frameworkId = FRAMEWORK_A,
  over: Partial<DiplomaticFramework> = {},
): DiplomaticFramework => ({
  framework_id: frameworkId,
  framework_basis: "SYNTHETIC FIXTURE: an authored framework basis.",
  member_refs: [FRAMEWORK_MEMBER_REF_A, FRAMEWORK_MEMBER_REF_B],
  charter_or_instrument_refs: [FRAMEWORK_CHARTER_REF_A],
  membership_rules: "SYNTHETIC FIXTURE: authored membership rules.",
  entry_exit_rules: "SYNTHETIC FIXTURE: authored entry and exit rules.",
  shared_commitment_refs: [FRAMEWORK_COMMITMENT_REF_A],
  lifecycle_status: "SYNTHETIC FIXTURE: an authored lifecycle status.",
  provenance_ref: FRAMEWORK_PROVENANCE_REF_A,
  ...over,
});

/** The same Framework carrying the conditional collective decision rule reference. */
export const fullDiplomaticFramework = (
  frameworkId = FRAMEWORK_A,
  over: Partial<DiplomaticFramework> = {},
): DiplomaticFramework =>
  diplomaticFramework(frameworkId, {
    collective_decision_rule_ref: FRAMEWORK_DECISION_RULE_REF_A,
    ...over,
  });
