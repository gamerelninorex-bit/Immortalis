import type { InstitutionIdentity } from "@immortalis/contracts";

/**
 * SYNTHETIC TEST DATA for the GIP Stable Institution Identity Backbone Foundation. Every identifier and label below is a
 * fixture, not IMMORTALIS canon: it carries no game semantics and no calibration — in particular no office, authority,
 * membership, faction, instrument or lifecycle exists here. The GIP owner is NOT synthetic and lives in @immortalis/engine;
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
