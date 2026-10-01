import { z } from "zod";
import { EntityId, Text } from "./world-foundation.ts";

/**
 * GIP Stable Institution Identity Backbone Foundation and Office / Authority Locus Backbone Foundation — executable
 * contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-007 Government / Institutions / Politics (frozen F-027 pin 2026-09-24T01:42:24.952Z): the Sovereign-ratified GIP
 *     Working Operational Draft v2.1 §2.1 (GIP-owned persistent state), §2.2 (explicit non-ownership), §3.1 (Institution
 *     Identity Reference: "Each real institution has one stable identity reference … identity/provenance only. It must not
 *     become a catch-all state ledger"), with the GIP Scaling Profile v1.1 §3 (Institution identity: one materially distinct
 *     continuing institution identity; identity/provenance only; never a common property bag), Red-confirmed at pin
 *     2026-09-25T00:59:55.526Z, and the OB-046 closed record
 *   F-017 Whole-Engine Dependency Graph v0.3 — GIP is a distinct owner; bare Institution Identity has no cross-owner
 *     prerequisite
 *
 * Office / Authority Locus (thirteenth bounded slice): WS-007 Draft v2.1 §3.2 ("Authority belongs to the office/order, not
 * personally to the current holder"; the minimum fields), §2.1 (GIP owns office powers, duties, succession, appointment,
 * removal and delegation), §21.1/§21.2 (create only when future causality requires it; update only on a material change),
 * with the GIP Scaling Profile v1.1 §3 (Office/Institution × authority relation; authority persisted once at the
 * office/order, never copied onto holders, actors or subjects).
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is the structural half of the GIP
 * guard: there is NO field of the Institution Identity in which an office, power, authority, membership list or count, faction posture, legal
 * instrument, asset, resource, KTI state, actor belief, relationship, military capability, economic holding, territory, a
 * lifecycle transition (rename, split, merge, abolition, replacement, succession) or a generic property could be placed
 * (Draft v2.1 §§2.2, 3.1; Scaling Profile §3). An Institution Identity records that one institution exists as the same
 * continuing institution and nothing about what it holds, who serves it or what it may do. Nothing here is a game rule or a
 * calibration.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet and key space (IM-06). Technical encodings; the assignment itself is the source's.
// ---------------------------------------------------------------------------------------------

/**
 * WS-007 / the lawful GIP owner (IM-06). One owner, one facet: the facet is the owner's single registered write facet (a
 * technical encoding), shared by the Institution Identity and Office / Authority Locus kinds, which the registry tells apart
 * by their exclusive key spaces.
 */
export const OWNER_GIP = "gip";
export const FACET_GIP_INSTITUTION_IDENTITY = "gip_institution_identity";

/**
 * The Institution Identity of one institution, addressed by its canonical `institution_id` alone (Scaling Profile §3
 * cardinality key: one materially distinct continuing institution). One key, hence one slot, per institution: a retry, a
 * second construction or another path reaches the same occupied slot, never a rival identity fact.
 */
export const gipInstitutionIdentityKey = (institutionId: string): string =>
  `gip/institution/${institutionId}/identity`;

// ---------------------------------------------------------------------------------------------
// Institution Identity Reference (Draft v2.1 §3.1).
// ---------------------------------------------------------------------------------------------

/**
 * The one `continuity_status` this foundation establishes. The source lists continuing | renamed | split | merged |
 * abolished | replaced; establishment is bounded to an institution entering as a CONTINUING current institution, and every
 * transition value is later work, so it is unrepresentable here (and `predecessor_ids` / `successor_ids`, which the source
 * makes material only where such a transition exists, are not fields of this record).
 */
export const GIP_CONTINUITY_CONTINUING = "continuing";

/**
 * One Institution Identity Reference, in the frozen minimum shape: `institution_id` (the canonical, stable identity),
 * `identity_label` (the authored label the identity is known by) and the current `continuity_status`. The label is a
 * label only: it creates nothing, is not an identity dimension and is never matched against another owner's text.
 *
 * `constitutive_source_ref` is optional in the source ("where material") and is not a field here: the constitutive acts and
 * Governance Instruments it would point at are not implemented, and the source fixes no other lawful referent. The record's
 * provenance is the committed fact's own (the causally addressed group, its cause and its governing source citation).
 */
export const InstitutionIdentitySchema = z.strictObject({
  institution_id: EntityId,
  identity_label: Text,
  continuity_status: z.literal(GIP_CONTINUITY_CONTINUING),
});
export type InstitutionIdentity = z.infer<typeof InstitutionIdentitySchema>;

// ---------------------------------------------------------------------------------------------
// Office / Authority Locus (Draft v2.1 §3.2) — the holder_ref branch only.
// ---------------------------------------------------------------------------------------------

/**
 * One Office / Authority Locus beneath one committed Institution Identity, addressed by the exact `institution_id` and its
 * own `office_id` (Scaling Profile §3 cardinality key: Office/Institution × authority relation). One key, hence one slot,
 * per office of an institution: a retry, a second construction or a conflicting establishment reaches the same occupied
 * slot, never a sibling authority. The institution is part of the address, so the join to the Institution Identity is by
 * canonical identity alone, never by label or prose.
 */
export const gipOfficeAuthorityLocusKey = (institutionId: string, officeId: string): string =>
  `gip/institution/${institutionId}/office/${officeId}`;

const unique = <T extends string>(xs: readonly T[]): boolean => new Set(xs).size === xs.length;

/**
 * The frozen WS-007 §3.2 minimum, `holder_ref` branch. Every value is authored and explicit: nothing is defaulted, guessed
 * from a label, synthesized from the Institution Identity or derived from a holder's actor state.
 *
 *  - `office_id` and `institution_id` are canonical identities; `institution_id` must be a committed Institution Identity
 *    (the GIP-owner admission pins it by exact key). `governing-order reference`, the source's alternative to
 *    `institution_id`, is not implemented here.
 *  - `authority_source_ref` is the explicit source reference of the authority, preserved as authored. It is an opaque
 *    reference: no authority-source ontology exists in this foundation, it is not resolved against any fact, and nothing is
 *    inferred from it (a Governance Instrument, constitutive act or law it might name is not implemented).
 *  - `competence_scope`, each of `powers[]` and `duties[]`, and the `selection_rule`, `succession_rule` and `removal_rule`
 *    are authored text exactly as stated. They are carried, never interpreted, executed, compared or generalised: no rule
 *    language, power taxonomy or scope grammar is invented. `powers` is non-empty (an authority locus carries authority);
 *    `duties` is explicit and may be empty ("where material"); neither lists duplicates. Where the source allows a rule to be
 *    absent, unknown or unresolved, this foundation supplies no representation: an unsupported variant fails closed, and the
 *    caller must author an explicit value.
 *  - `holder_ref` is a REFERENCE to the current holder and nothing else. It is not resolved in this foundation (no
 *    actor-existence rule is ratified for it), it copies no authority, personality, capability, knowledge, loyalty,
 *    competence or permission into any actor's state, and it makes no claim that the holder chose, accepted or exercised
 *    anything. Authority is the office's, not the holder's.
 *
 * Not fields: `decision_body_ref`, `delegations[]`, `concurrence_requirements[]`, `review_veto_override[]`,
 * `conditional_authority[]`, any appointment/removal/succession state, any holder history, any exercise or reach state,
 * and any catch-all property — all later work, and unrepresentable here (strict).
 */
export const OfficeAuthorityLocusSchema = z.strictObject({
  office_id: EntityId,
  institution_id: EntityId,
  authority_source_ref: EntityId,
  competence_scope: Text,
  powers: z.array(Text).nonempty().refine(unique, "powers must not repeat an entry"),
  duties: z.array(Text).refine(unique, "duties must not repeat an entry"),
  selection_rule: Text,
  succession_rule: Text,
  removal_rule: Text,
  holder_ref: EntityId,
});
export type OfficeAuthorityLocus = z.infer<typeof OfficeAuthorityLocusSchema>;
