import type {
  InstitutionIdentity,
  OfficeAuthorityLocusDecisionBody,
  OfficeAuthorityLocusHolder,
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

/** A well-formed Institution Identity Reference: the canonical identity, its authored label, and CONTINUING. */
export const institutionIdentity = (
  institutionId = INSTITUTION_COURT,
  over: Partial<InstitutionIdentity> = {},
): InstitutionIdentity => ({
  institution_id: institutionId,
  identity_label: "SYNTHETIC FIXTURE: a continuing test institution.",
  continuity_status: "continuing",
  ...over,
});

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
