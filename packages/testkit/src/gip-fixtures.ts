import type {
  GovernanceInstrument,
  InstitutionIdentity,
  OfficeAuthorityLocusDecisionBody,
  OfficeAuthorityLocusHolder,
  ScopeBinding,
} from "@immortalis/contracts";

/**
 * SYNTHETIC TEST DATA for the GIP Stable Institution Identity and Office / Authority Locus Backbone Foundations. Every identifier and label below is a
 * fixture, not IMMORTALIS canon: it carries no game semantics and no calibration — in particular no office, authority,
 * membership, faction, instrument or lifecycle exists here beyond the one authored office record below, whose authority text is a fixture and not a rule of the
 * game. The GIP owner is NOT synthetic and lives in @immortalis/engine;
 * this module only supplies authored input for it. It deliberately supplies no owner, facet, authority or rule: those come
 * only from the specification-backed registry. Production code must never import this package.
 */
export const INSTITUTION_COURT = "institution-court-1";
export const INSTITUTION_GUILD = "institution-guild-1";
export const INSTITUTION_COUNCIL = "institution-council-1";

/** Lineage/identity for the n-th GIP publication; `basis` and `secrecy` are opaque authored input, never defaulted. */
export const gipPublication = (n: number) => ({
  group_id: `gip-group-${n}`,
  intent_id: `gip-intent-${n}`,
  cause: `gip-cause-${n}`,
  basis: "gip-fixture-basis",
  secrecy: "gip-fixture-visibility",
});

/** A well-formed Institution Identity Reference at its minimum: the canonical identity, its authored label, and CONTINUING (no constitutive source). */
export const institutionIdentity = (
  institutionId = INSTITUTION_COURT,
  over: Partial<InstitutionIdentity> = {},
): InstitutionIdentity => ({
  institution_id: institutionId,
  identity_label: "SYNTHETIC FIXTURE: a continuing test institution.",
  continuity_status: "continuing",
  ...over,
});

/**
 * Opaque authored `constitutive_source_ref` values (SYNTHETIC FIXTURES). Nothing exists behind them: no constitutive act,
 * charter, Governance Instrument or other source is created, read or implied by carrying one.
 */
export const CONSTITUTIVE_SOURCE_A = "constitutive-source-a-1";
export const CONSTITUTIVE_SOURCE_B = "constitutive-source-b-1";

/** A well-formed Institution Identity Reference that also carries the optional, opaque `constitutive_source_ref`. */
export const institutionIdentityWithConstitutiveSource = (
  institutionId = INSTITUTION_COURT,
  constitutiveSourceRef = CONSTITUTIVE_SOURCE_A,
  over: Partial<InstitutionIdentity> = {},
): InstitutionIdentity =>
  institutionIdentity(institutionId, { constitutive_source_ref: constitutiveSourceRef, ...over });

export const OFFICE_MAGISTRATE = "office-magistrate-1";
export const OFFICE_TREASURER = "office-treasurer-1";
export const AUTHORITY_SOURCE_CHARTER = "authority-source-charter-1";
export const HOLDER_REF_A = "holder-ref-a-1";
export const HOLDER_REF_B = "holder-ref-b-1";
export const DECISION_BODY_REF_A = "decision-body-ref-a-1";
export const DECISION_BODY_REF_B = "decision-body-ref-b-1";

/** The authored office fields common to both reference branches (SYNTHETIC FIXTURES, carried verbatim, never interpreted). */
const officeCommon = (institutionId: string, officeId: string) => ({
  office_id: officeId,
  institution_id: institutionId,
  authority_source_ref: AUTHORITY_SOURCE_CHARTER,
  competence_scope: "SYNTHETIC FIXTURE: the competence this test office covers.",
  powers: ["SYNTHETIC FIXTURE: a first test power.", "SYNTHETIC FIXTURE: a second test power."],
  duties: ["SYNTHETIC FIXTURE: a material test duty."],
  selection_rule: "SYNTHETIC FIXTURE: how this test office is filled.",
  succession_rule: "SYNTHETIC FIXTURE: how this test office passes on.",
  removal_rule: "SYNTHETIC FIXTURE: how this test office holder is removed.",
});

/**
 * A well-formed Office / Authority Locus, the `holder_ref` branch: every authority, rule and reference value is authored and
 * explicit. The texts are SYNTHETIC FIXTURES carried verbatim and never interpreted; nothing here is a game rule.
 */
export const officeAuthorityLocus = (
  institutionId = INSTITUTION_COURT,
  officeId = OFFICE_MAGISTRATE,
  over: Partial<OfficeAuthorityLocusHolder> = {},
): OfficeAuthorityLocusHolder => ({
  ...officeCommon(institutionId, officeId),
  holder_ref: HOLDER_REF_A,
  ...over,
});

/**
 * A well-formed Office / Authority Locus, the `decision_body_ref` branch: the same authored authority fields as the holder
 * branch with the opaque decision-body reference in place of `holder_ref`. The reference names nothing in this fixture world:
 * no decision body, membership, roster or actor exists behind it.
 */
export const decisionBodyOfficeAuthorityLocus = (
  institutionId = INSTITUTION_COURT,
  officeId = OFFICE_MAGISTRATE,
  over: Partial<OfficeAuthorityLocusDecisionBody> = {},
): OfficeAuthorityLocusDecisionBody => ({
  ...officeCommon(institutionId, officeId),
  decision_body_ref: DECISION_BODY_REF_A,
  ...over,
});

export const SCOPE_BINDING_A = "scope-binding-a-1";
export const SCOPE_BINDING_B = "scope-binding-b-1";
export const SCOPE_BINDING_C = "scope-binding-c-1";
export const SCOPE_REF_A = "scope-ref-a-1";
export const SCOPE_REF_B = "scope-ref-b-1";
export const EXCEPTION_REF_A = "exception-ref-a-1";
export const EXCEPTION_REF_B = "exception-ref-b-1";
export const PRIORITY_OR_CONFLICT_RULE_REF_A = "priority-or-conflict-rule-ref-a-1";
export const PRIORITY_OR_CONFLICT_RULE_REF_B = "priority-or-conflict-rule-ref-b-1";

/**
 * A well-formed Authority Scope Binding at the WS-007 §5 minimum: the parent office's identities, the binding's own identity,
 * the authored classification, the opaque scope reference and the authored target condition; the optional inheritance rule,
 * exception references and priority-or-conflict rule reference are omitted (absent, not empty). The texts are SYNTHETIC FIXTURES carried
 * verbatim and never interpreted; the references name nothing in this fixture world: no place, population, institution, actor
 * or collective exists behind them. Nothing here is a game rule.
 */
export const scopeBinding = (
  institutionId = INSTITUTION_COURT,
  officeId = OFFICE_MAGISTRATE,
  scopeBindingId = SCOPE_BINDING_A,
  over: Partial<ScopeBinding> = {},
): ScopeBinding => ({
  scope_binding_id: scopeBindingId,
  institution_id: institutionId,
  office_id: officeId,
  scope_type: "SYNTHETIC FIXTURE: an authored scope classification.",
  scope_ref: SCOPE_REF_A,
  target_condition: "SYNTHETIC FIXTURE: an authored target condition, carried and never executed.",
  ...over,
});

/** The same binding carrying all three optional authored fields (inheritance rule, exception references, priority-or-conflict rule reference). */
export const fullScopeBinding = (
  institutionId = INSTITUTION_COURT,
  officeId = OFFICE_MAGISTRATE,
  scopeBindingId = SCOPE_BINDING_A,
  over: Partial<ScopeBinding> = {},
): ScopeBinding =>
  scopeBinding(institutionId, officeId, scopeBindingId, {
    inheritance_rule:
      "SYNTHETIC FIXTURE: an authored inheritance rule, carried and never executed.",
    exception_refs: [EXCEPTION_REF_A, EXCEPTION_REF_B],
    priority_or_conflict_rule_ref: PRIORITY_OR_CONFLICT_RULE_REF_A,
    ...over,
  });

export const INSTRUMENT_A = "instrument-a-1";
export const INSTRUMENT_B = "instrument-b-1";
export const INSTRUMENT_C = "instrument-c-1";
export const AUTHORITY_BASIS_REF_A = "authority-basis-ref-a-1";
export const AUTHORITY_BASIS_REF_B = "authority-basis-ref-b-1";
export const GOVERNING_ORDER_REF_A = "governing-order-ref-a-1";
export const GOVERNING_ORDER_REF_B = "governing-order-ref-b-1";
export const GOVERNING_ORDER_REF_C = "governing-order-ref-c-1";

/** The exact canonical address of one office, as an Instrument's `source_authority_ref` carries it. */
export const officeRef = (
  institutionId = INSTITUTION_COURT,
  officeId = OFFICE_MAGISTRATE,
): string => `gip/institution/${institutionId}/office/${officeId}`;

/** The exact canonical address of one Scope Binding, as an Instrument's `scope_binding_ref` carries it. */
export const scopeBindingRef = (
  institutionId = INSTITUTION_COURT,
  officeId = OFFICE_MAGISTRATE,
  scopeBindingId = SCOPE_BINDING_A,
): string => `${officeRef(institutionId, officeId)}/scope-binding/${scopeBindingId}`;

/**
 * A well-formed Governance Instrument core record at the WS-007 §4.1 mandatory fields: the exact addresses of its source
 * office and of that office's Scope Binding, an opaque authority basis, one operative effect and one authored validity entry
 * under one opaque governing order, and an authored lifecycle status. The references name nothing in this fixture world: no
 * authority basis, governing order, law, charter or proposal exists behind them. Nothing here is a game rule.
 */
export const governanceInstrument = (
  instrumentId = INSTRUMENT_A,
  institutionId = INSTITUTION_COURT,
  officeId = OFFICE_MAGISTRATE,
  scopeBindingId = SCOPE_BINDING_A,
  over: Partial<GovernanceInstrument> = {},
): GovernanceInstrument => ({
  instrument_id: instrumentId,
  source_authority_ref: officeRef(institutionId, officeId),
  authority_basis_ref: AUTHORITY_BASIS_REF_A,
  operative_effect: "obligation",
  scope_binding_ref: scopeBindingRef(institutionId, officeId, scopeBindingId),
  validity_by_order: [{ governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" }],
  lifecycle_status: "active",
  ...over,
});
