import { z } from "zod";
import { EntityId } from "./world-foundation.ts";

/**
 * GIP Governance Instrument Core Backbone Foundation — executable contract (sixteenth bounded slice), extended in the
 * twenty-first bounded slice by the one optional WS-007 §4.3 `predecessor_instrument_ref`.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-007 Government / Institutions / Politics (frozen F-027 pin 2026-09-24T01:42:24.952Z): the Sovereign-ratified GIP
 *     Working Operational Draft v2.1 §2.1 (GIP owns Governance Instruments), §4 (Governance Instrument Schema: §4.1 the
 *     mandatory fields, the validity entry and the core `validity_status` and `lifecycle_status` literals; §4.2 the
 *     operative-effect classes), §21.1/§21.2 (create only when future causality requires it; update only on a material
 *     change), with Concept Amendment v2.1 A7 (validity-by-order and lifecycle/operative status are separate dimensions) and
 *     the GIP Scaling Profile v1.1 §3 (Instrument/Clause cardinality), Red-confirmed at pin 2026-09-25T00:59:55.526Z
 *
 * A Governance Instrument core record is ONE authored, durable governance rule or act: "this exact authority is its source;
 * this is its authority basis; this is its one core operative-effect class; this existing Scope Binding says where it is
 * aimed; these are its authored validity entries under the relevant governing orders; this is its authored lifecycle state".
 * It is NOT proof that a proposal was lawfully enacted, a Collective Decision result, an office transition, a governing-order
 * object, a live applicability result, promulgation, notice or dissemination, Administrative Reach, implementation,
 * enforcement or compliance, an Actor / Autonomous Collective choice, a clause ledger or a per-recipient copy of law.
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). Every identifier below is the source's own,
 * reproduced exactly; none is renamed, pluralised, singularised, merged or substituted. The contract carries authored
 * content and interprets none of it.
 */

/**
 * One Instrument, addressed by its canonical `instrument_id` ALONE (Scaling Profile §3 unit: Instrument/Clause; this slice
 * implements the Instrument unit). One key, hence one slot, per Instrument: a retry, a second construction or a conflicting
 * establishment reaches the same occupied slot, never a sibling. The source office, the Scope Binding, a governing order, a
 * recipient, a subject, a place and the lifecycle status are NOT identity dimensions: the Instrument is stored once and
 * never copied per any of them. The path is a technical encoding of that identity; it is exclusive to this kind.
 */
export const gipInstrumentKey = (instrumentId: string): string => `gip/instrument/${instrumentId}`;

const ID_SOURCE = "[A-Za-z0-9][A-Za-z0-9._:-]*";
const OFFICE_REF = new RegExp(`^gip/institution/(${ID_SOURCE})/office/(${ID_SOURCE})$`);
const SCOPE_BINDING_REF = new RegExp(
  `^gip/institution/(${ID_SOURCE})/office/(${ID_SOURCE})/scope-binding/(${ID_SOURCE})$`,
);

/**
 * `source_authority_ref`: the exact canonical address of ONE committed GIP Office / Authority Locus (the `institution_id` ×
 * `office_id` address its own key derives). The Instrument contract carries no `institution_id` or `office_id` field; the
 * reference IS that one address. It is a reference only: the office's holder or decision body is never read through it.
 */
export const InstrumentSourceAuthorityRef = z
  .string()
  .regex(
    OFFICE_REF,
    "source_authority_ref must be the exact address of one Office / Authority Locus",
  );

/**
 * `scope_binding_ref`: the exact canonical address of ONE committed GIP Scope Binding (its own key: the binding's office
 * address and its `scope_binding_id`). Whether it belongs to the same authority as `source_authority_ref` is a structural
 * property of the two addresses, checked here by exact join and never by label.
 */
export const InstrumentScopeBindingRef = z
  .string()
  .regex(SCOPE_BINDING_REF, "scope_binding_ref must be the exact address of one Scope Binding");

/** The exact office identities an Instrument's `source_authority_ref` addresses, or undefined if it is not one. */
export function parseInstrumentSourceAuthorityRef(
  ref: string,
): { readonly institution_id: string; readonly office_id: string } | undefined {
  const m = OFFICE_REF.exec(ref);
  return m ? { institution_id: m[1]!, office_id: m[2]! } : undefined;
}

/** The exact Scope Binding identities an Instrument's `scope_binding_ref` addresses, or undefined if it is not one. */
export function parseInstrumentScopeBindingRef(ref: string):
  | {
      readonly institution_id: string;
      readonly office_id: string;
      readonly scope_binding_id: string;
    }
  | undefined {
  const m = SCOPE_BINDING_REF.exec(ref);
  return m ? { institution_id: m[1]!, office_id: m[2]!, scope_binding_id: m[3]! } : undefined;
}

/** WS-007 §4.1 core `validity_status` literals — exactly these five; `void` is not `invalid`; no catch-all. */
export const INSTRUMENT_VALIDITY_STATUSES = [
  "valid",
  "invalid",
  "void",
  "contested",
  "unresolved",
] as const;
export const InstrumentValidityStatus = z.enum(INSTRUMENT_VALIDITY_STATUSES);
export type InstrumentValidityStatus = z.infer<typeof InstrumentValidityStatus>;

/** WS-007 §4.1 core `lifecycle_status` literals — exactly these eight; no setting-specific catch-all. */
export const INSTRUMENT_LIFECYCLE_STATUSES = [
  "proposed",
  "pending",
  "active",
  "suspended",
  "superseded",
  "repealed",
  "terminated",
  "expired",
] as const;
export const InstrumentLifecycleStatus = z.enum(INSTRUMENT_LIFECYCLE_STATUSES);
export type InstrumentLifecycleStatus = z.infer<typeof InstrumentLifecycleStatus>;

/** WS-007 §4.2 operative-effect class literals — exactly these twenty. */
export const INSTRUMENT_OPERATIVE_EFFECTS = [
  "obligation",
  "prohibition",
  "permission",
  "authority_grant",
  "delegation",
  "privilege",
  "entitlement",
  "immunity",
  "constitutive_creation",
  "status_change",
  "appropriation",
  "reservation",
  "appointment",
  "removal",
  "confirmation",
  "suspension",
  "repeal",
  "supersession",
  "invalidation",
  "administrative_direction",
] as const;
export const InstrumentOperativeEffect = z.enum(INSTRUMENT_OPERATIVE_EFFECTS);
export type InstrumentOperativeEffect = z.infer<typeof InstrumentOperativeEffect>;

/**
 * One `validity_by_order[]` entry (WS-007 §4.1: "Each validity entry minimally carries: governing_order_ref,
 * validity_status"). Exactly these two fields. `governing_order_ref` is an OPAQUE authored reference: no governing-order
 * object, constitutional-law object or order ontology exists, it is never dereferenced and nothing is created from it.
 * `validity_status` is authored; the engine calculates none.
 */
export const InstrumentValidityEntrySchema = z.strictObject({
  governing_order_ref: EntityId,
  validity_status: InstrumentValidityStatus,
});
export type InstrumentValidityEntry = z.infer<typeof InstrumentValidityEntrySchema>;

/** An authored optional field is either omitted or carried: an explicit `undefined` (which has no canonical form) is refused. */
const noExplicitUndefined = (value: Record<string, unknown>): boolean =>
  Object.keys(value).every((k) => value[k] !== undefined);

/** The exact join of the two references: the Scope Binding belongs to the same office authority the Instrument names. */
const sameAuthority = (v: {
  readonly source_authority_ref: string;
  readonly scope_binding_ref: string;
}): boolean => {
  const office = parseInstrumentSourceAuthorityRef(v.source_authority_ref);
  const binding = parseInstrumentScopeBindingRef(v.scope_binding_ref);
  return (
    office !== undefined &&
    binding !== undefined &&
    binding.institution_id === office.institution_id &&
    binding.office_id === office.office_id
  );
};
const SAME_AUTHORITY_MESSAGE =
  "scope_binding_ref must address a Scope Binding of the same authority as source_authority_ref";

/**
 * The WS-007 §4.1 mandatory fields — and only those: the HISTORICAL sixteenth-slice core-only Instrument value shape. It is
 * the class of value that existed under the sixteenth-slice governing-rule citation (`GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE`),
 * and the only class of value that citation may still be carried by on load (see `FactKind.legacyRule`). It never authorized
 * `predecessor_instrument_ref` or any other §4.3 field, so a value carrying one is not of this class. New writes use
 * `GovernanceInstrumentSchema`, never this one.
 *
 * Validity is order-relative and separate from lifecycle: the two dimensions are independent authored values, and no
 * lifecycle value rewrites any validity entry.
 *
 *  - `instrument_id` is the canonical identity.
 *  - `source_authority_ref` is the exact address of one committed Office / Authority Locus (holder or decision-body branch
 *    alike); `scope_binding_ref` is the exact address of one committed Scope Binding of THAT SAME office authority (the
 *    cross-check below). Neither is resolved here; admission reads each by exact key.
 *  - `authority_basis_ref` is an OPAQUE authored reference, never dereferenced; no authority-basis ontology exists.
 *  - `operative_effect` is ONE singular scalar from the §4.2 classes. It is not an array, and no `operative_effects[]`,
 *    clause or multi-effect surrogate exists (addressable clauses, WS-007 §4.4, are not implemented).
 *  - `validity_by_order[]` is a REQUIRED authored array of strict entries inside this one Instrument (never one Instrument per
 *    order). The source fixes the entry shape and the validity literals but defines no minimum cardinality, no uniqueness of
 *    `governing_order_ref` and no deduplication, merging or conflict-resolution rule, so this contract introduces none: an
 *    empty array and repeated `governing_order_ref` entries (whatever their `validity_status`) are carried exactly as
 *    authored, never reordered, merged, deduplicated, reconciled or interpreted. This does not declare a repeated entry
 *    meaningful; any future restriction requires separately pinned authority.
 *  - `lifecycle_status` is authored; the engine advances none.
 */
const InstrumentCoreShape = {
  instrument_id: EntityId,
  source_authority_ref: InstrumentSourceAuthorityRef,
  authority_basis_ref: EntityId,
  operative_effect: InstrumentOperativeEffect,
  scope_binding_ref: InstrumentScopeBindingRef,
  validity_by_order: z.array(InstrumentValidityEntrySchema),
  lifecycle_status: InstrumentLifecycleStatus,
};
export const GovernanceInstrumentCoreSchema = z
  .strictObject(InstrumentCoreShape)
  .refine(sameAuthority, SAME_AUTHORITY_MESSAGE);
export type GovernanceInstrumentCore = z.infer<typeof GovernanceInstrumentCoreSchema>;

/**
 * One Governance Instrument, in the frozen shape of this foundation: the §4.1 mandatory fields above, unchanged, plus the one
 * optional WS-007 §4.3 conditional field `predecessor_instrument_ref` (twenty-first slice) and no other §4.3 field.
 *
 * `predecessor_instrument_ref` is ONE optional OPAQUE authored reference (a single reference, never an array or map) in the
 * same canonical opaque-reference representation as the other GIP reference fields (`EntityId`): the authored pointer from
 * this Instrument toward a predecessor Instrument identity/source. It is a representational lineage pointer and nothing
 * else. It is carried exactly as authored (no normalisation, expansion, alias or derived surrogate), never dereferenced on
 * establishment, read, recovery or integrity verification, and never required to name an existing fact. It is not an identity
 * dimension (the key is derived from `instrument_id` alone), registers no dependency, reads and writes no predecessor, creates
 * no successor pointer, supersession act, lifecycle advancement, validity change or reciprocal edge, and nothing (legal
 * continuity, authority, recognition, applicability, implementation, enforcement or knowledge) is inferred from it. An
 * omitted field is absent: no default is synthesized, and null or an explicit undefined fails closed.
 *
 * Not fields: every OTHER WS-007 §4.3 conditional field (`activation_condition`, `effective_from`, `sunset_condition`,
 * `renewal_rule`, `implementation_assignment_ref`, `administrative_path_ref`, `sanction_or_remedy`,
 * `institutional_promulgation_or_publication_requirement`, `promulgation_act_ref`, `individual_notice_requirement_ref`,
 * `appeal_review_override`, `supersession_ref`, `provenance_note`) — outside this bounded slice, so an Instrument that needs
 * one is unsupported and fails closed rather than being omitted, inferred or flattened; and no `institution_id`, `office_id`,
 * `scope_binding_id`, discriminator, generic `status`, `legal_status` or other convenience field.
 */
export const GovernanceInstrumentSchema = z
  .strictObject({
    ...InstrumentCoreShape,
    predecessor_instrument_ref: EntityId.optional(),
  })
  .refine(sameAuthority, SAME_AUTHORITY_MESSAGE)
  .refine(noExplicitUndefined, "an omitted optional field is absent, never an explicit undefined");
export type GovernanceInstrument = z.infer<typeof GovernanceInstrumentSchema>;
