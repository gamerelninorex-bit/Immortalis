import { z } from "zod";
import { EntityId, Text } from "./world-foundation.ts";

/**
 * GIP Stable Institution Identity Backbone Foundation — executable contracts.
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
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is the structural half of the GIP
 * guard: there is NO field in which an office, power, authority, membership list or count, faction posture, legal
 * instrument, asset, resource, KTI state, actor belief, relationship, military capability, economic holding, territory, a
 * lifecycle transition (rename, split, merge, abolition, replacement, succession) or a generic property could be placed
 * (Draft v2.1 §§2.2, 3.1; Scaling Profile §3). An Institution Identity records that one institution exists as the same
 * continuing institution and nothing about what it holds, who serves it or what it may do. Nothing here is a game rule or a
 * calibration.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet and key space (IM-06). Technical encodings; the assignment itself is the source's.
// ---------------------------------------------------------------------------------------------

/** WS-007 / the lawful GIP owner (IM-06). One owner, one facet. */
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
