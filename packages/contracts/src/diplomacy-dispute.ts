import { z } from "zod";
import { Id } from "./ids.ts";
import { JsonValueSchema } from "./json.ts";
import { EntityId } from "./world-foundation.ts";

/**
 * Diplomacy Externalized Claim / Dispute Core Backbone Foundation — executable contract (eighteenth bounded slice).
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-008 Diplomacy / Inter-Faction Relations v1.1 (frozen F-027 pin 2026-09-24T07:01:45.312Z): §§2–3 (ownership: Diplomacy
 *     owns the fact that a position was externally communicated, not the underlying claim), §7 (Claim / Dispute: the minimum
 *     entry), §§19–24 (invariants), §29.3 (R-3: `dependency_refs[]`), §29.4 (`effect_on`) and §29.7 (no all-pairs scan)
 *   F-016 Phase 2C and F-017 Whole-Engine Dependency Graph v0.3: the order lawful Actor/ACS/GIP authority → externally
 *     communicated act → Diplomacy record (and F-014D receipt before any receipt-dependent effect)
 *
 * One Claim / Dispute record is ONE authored, durable Diplomacy fact: "one or more diplomatic parties externally asserted,
 * denied, protested, reserved, recognized or disputed a position concerning an underlying subject". It is NOT the underlying
 * claim (which stays with its authoritative owner), not what any party privately believes or will later do, not objective truth
 * inferred from assertion, denial, protest, reservation, recognition or dispute, not a Relation Edge, Channel, Negotiation
 * Record, Diplomatic Instrument, Clause or Binding Entry, and not an Epistemic receipt.
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). Every identifier below is the source's own,
 * reproduced exactly; none is renamed, pluralised, singularised, merged, aliased or substituted. The contract carries authored
 * content and interprets none of it.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet and key space (IM-06). Technical encodings; the assignment itself is the source's.
// ---------------------------------------------------------------------------------------------

/**
 * One exclusive Externalized Claim / Dispute facet under the existing Diplomacy owner (`OWNER_DIPLOMACY`, declared by the
 * External Recognition contract). The facet identifier is an implementation convention only: it creates no second substantive
 * owner.
 */
export const FACET_DIPLOMACY_EXTERNALIZED_CLAIM_DISPUTE = "diplomacy_externalized_claim_dispute";

/**
 * One Claim / Dispute fact, addressed by its canonical `dispute_id` ALONE. One key, hence one slot, per dispute: a retry, a
 * second construction or a conflicting establishment reaches the same occupied slot, never a sibling. The parties, the
 * underlying subject, the status, the optional references and the position entries are NOT identity dimensions: the fact is
 * stored once, never as a copy per party, observer, population member, locus, clause or relation. The path is a technical
 * encoding of that identity; it is exclusive to this kind.
 */
export const diplomacyDisputeKey = (disputeId: string): string => `diplomacy/dispute/${disputeId}`;

/** An authored optional field is either omitted or carried: an explicit `undefined` (which has no canonical form) is refused. */
const noExplicitUndefined = (value: Record<string, unknown>): boolean =>
  Object.values(value).every((v) => v !== undefined);

/**
 * WS-008 §29.4: when the communicated act's diplomatic effect can depend on timing, `effect_on` takes exactly these three
 * literals. No fourth value, alias or default exists.
 */
export const EFFECT_ON_VALUES = [
  "issuance",
  "addressee_receipt",
  "instrument_or_setting_specified",
] as const;

/**
 * ONE authored singular value. WS-008 fixes `status` and `requested_remedy_or_demand` as singular fields and fixes no value
 * subtype (no closed literal set, no text-only type), so the weakest canonical representation that keeps them singular is
 * used: a canonical JSON scalar (string, finite number, boolean, null) or a canonical JSON object, carried exactly as
 * authored. An array is multiplicity, not one value, and is refused. Nothing is parsed, normalised or interpreted.
 */
export const SingularAuthoredValueSchema = z.union([
  z.null(),
  z.boolean(),
  z.number().refine(Number.isFinite, "numbers must be finite"),
  z.string(),
  z.record(z.string(), JsonValueSchema),
]);

/**
 * The WS-008 §7 minimum Claim / Dispute entry plus the v1.1 repair overlay (§29.3, §29.4) — and only those. Every value is
 * authored and explicit: nothing is defaulted, inferred, derived, dereferenced or normalised.
 *
 *  - `dispute_id` is the canonical identity (and the only identity dimension).
 *  - `party_refs[]` is an ARRAY of opaque authored diplomatic-party references. WS-008 fixes no minimum length, no uniqueness
 *    and no deduplication, so none is imposed: the array is carried exactly as authored, empty or repeated included. No party
 *    class is fixed (no closed party-class enum), and no Population category, Cohort, culture or crowd is converted into a
 *    diplomatic party. No reference is dereferenced.
 *  - `underlying_subject_ref` is ONE opaque authored reference to the underlying subject. The underlying substantive claim
 *    stays with its authoritative owner; nothing is created, mutated or required in a foreign owner because it is named.
 *  - `communicated_position_entries[]` is an ARRAY of authored entries. WS-008 defines no executable entry schema, so each
 *    entry is carried as the repository's weakest canonical value representation (any canonical JSON value), exactly as
 *    authored: no subfield is invented and no entry is normalised, parsed or interpreted. No minimum length, uniqueness,
 *    ordering or deduplication is imposed.
 *  - `requested_remedy_or_demand` is OPTIONAL and singular: absent stays absent; when present it is one authored value
 *    (`SingularAuthoredValueSchema`), never pluralised.
 *  - `interpretation_issue_ref`, `instrument_or_clause_ref` and `adjudication_basis_ref` are OPTIONAL singular opaque
 *    references: absent stays absent, none is dereferenced, and no Diplomatic Instrument, Clause, adjudication or interpretation
 *    object is manufactured merely to satisfy one.
 *  - `status` is REQUIRED and singular: one authored value (`SingularAuthoredValueSchema`). WS-008 defines no closed literal
 *    set, so none is imposed (no enum, no text-only subtype, no alias normalisation, no lifecycle literal set).
 *  - `provenance_ref` is a REQUIRED opaque authored source reference, distinct from the engine's own rule/spec provenance.
 *  - `dependency_refs[]` (WS-008 §29.3) is CONDITIONAL: present only where the persisted conclusion is actually derived from
 *    another owner's mutable implemented state, in which case each element is the exact fact key of that committed state and
 *    the dependency is registered through the existing commit-group read / dependency pins (admission). A purely authored
 *    baseline record carries none, and none is invented merely because an opaque reference names another owner. The source
 *    fixes no minimum length, no uniqueness and no deduplication, so none is imposed.
 *  - `effect_on` (WS-008 §29.4) is CONDITIONAL: one of the three fixed literals (`EFFECT_ON_VALUES`) when the communicated act's
 *    diplomatic effect materially depends on timing and an authoritative basis supplies the effect rule; absent otherwise, never
 *    defaulted. Carrying it creates, infers and backfills no Epistemic receipt event, and `addressee_receipt` is only a stored
 *    literal here (no receipt is consumed, and no broadcast exposure is treated as individual receipt).
 *
 * Not fields: any Relation Edge, Channel, Negotiation Record, Instrument, Clause, Binding Entry, Framework, compliance or
 * performance field; any score, trust, reputation or influence meter; any alias of a name above; and any convenience,
 * discriminator or property-bag field.
 */
export const ExternalizedClaimDisputeSchema = z
  .strictObject({
    dispute_id: EntityId,
    party_refs: z.array(Id),
    underlying_subject_ref: Id,
    communicated_position_entries: z.array(JsonValueSchema),
    requested_remedy_or_demand: SingularAuthoredValueSchema.optional(),
    interpretation_issue_ref: Id.optional(),
    instrument_or_clause_ref: Id.optional(),
    adjudication_basis_ref: Id.optional(),
    status: SingularAuthoredValueSchema,
    provenance_ref: Id,
    dependency_refs: z.array(Id).optional(),
    effect_on: z.enum(EFFECT_ON_VALUES).optional(),
  })
  .refine(noExplicitUndefined, "an omitted optional field is absent, never an explicit undefined");
export type ExternalizedClaimDispute = z.infer<typeof ExternalizedClaimDisputeSchema>;

/**
 * The distinct committed fact keys a Claim / Dispute's `dependency_refs[]` names, in first-authored order. The array itself is
 * carried exactly as authored; this is only the set of facts admission must see pinned.
 */
export const disputeDependencyKeys = (dispute: ExternalizedClaimDispute): readonly string[] => [
  ...new Set(dispute.dependency_refs ?? []),
];
