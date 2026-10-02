import { z } from "zod";
import { Id } from "./ids.ts";
import { SingularAuthoredValueSchema } from "./diplomacy-dispute.ts";
import { EntityId } from "./world-foundation.ts";

/**
 * Diplomacy Relation Edge Authoritative Core Backbone Foundation — executable contract (nineteenth bounded slice).
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-008 Diplomacy / Inter-Faction Relations v1.1 (frozen F-027 pin 2026-09-24T07:01:45.312Z): §§2.1–2.2 (ownership: Diplomacy
 *     owns the durable fact that an external relation materially continues), §4 (the sparse Relation Edge), §5.1 (the Relation
 *     Edge minimum surface), §24 (invariants) and §§29.3/29.7 (R-3 / R-7: reference and index arrays are derived,
 *     non-authoritative indexes rebuilt from source records; no all-pairs scan)
 *   F-016 Phase 2C and F-017 Whole-Engine Dependency Graph v0.3: the Actor/Faction/GIP/Diplomacy reconciliation and dependency
 *     lineage
 *
 * One Relation Edge is ONE authored, durable, sparse continuity object for a materially continuing external relation. It is NOT
 * a duplicate ledger of Recognition, Claim / Dispute, Channel, Instrument or Framework truth, and NOT a universal relationship,
 * trust or reputation score.
 *
 * The authoritative persistent write contract contains ONLY `relation_id`, `party_refs[]`, `relation_scope`, the optional
 * `rupture_or_suspension_status`, the optional `provenance_ref` and `lifecycle_status`. WS-008 §5.1 also lists five reference /
 * index arrays; §29.3/§29.7 classify them as derived, non-authoritative indexes rebuilt from source records (the stale-index
 * failure R-7 repaired). They are therefore NOT writable persistent fields here: the strict object rejects each of them, so a
 * second writable ledger cannot be smuggled into the authored core. No association rule that would fill them exists.
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). Every identifier below is the source's own,
 * reproduced exactly; none is renamed, pluralised, singularised, merged, aliased or substituted. The contract carries authored
 * content and interprets none of it.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet and key space (IM-06). Technical encodings; the assignment itself is the source's.
// ---------------------------------------------------------------------------------------------

/**
 * One exclusive Relation Edge facet under the existing Diplomacy owner (`OWNER_DIPLOMACY`, declared by the External Recognition
 * contract). The facet identifier is an implementation convention only: it creates no second substantive owner.
 */
export const FACET_DIPLOMACY_RELATION_EDGE = "diplomacy_relation_edge";

/**
 * One Relation Edge fact, addressed by its canonical `relation_id` ALONE. One key, hence one slot, per relation: a retry, a
 * second construction or a conflicting establishment reaches the same occupied slot, never a sibling. The parties, the scope,
 * the statuses and the provenance are NOT identity dimensions: the edge is stored once, never as a copy per party, observer,
 * recognition, dispute, channel or instrument. The path is a technical encoding of that identity; it is exclusive to this kind.
 */
export const diplomacyRelationKey = (relationId: string): string =>
  `diplomacy/relation/${relationId}`;

/** An authored optional field is either omitted or carried: an explicit `undefined` (which has no canonical form) is refused. */
const noExplicitUndefined = (value: Record<string, unknown>): boolean =>
  Object.values(value).every((v) => v !== undefined);

/**
 * The WS-008 §5.1 authoritative Relation Edge core — and only that. Every value is authored and explicit: nothing is defaulted,
 * inferred, derived, dereferenced or normalised.
 *
 *  - `relation_id` is the canonical identity (and the only identity dimension), under the repository's key-safe identifier rule
 *    because it is embedded in the canonical key.
 *  - `party_refs[]` is an ARRAY of opaque authored diplomatic-party references. WS-008 defines no minimum length, uniqueness,
 *    sorting or deduplication rule, so none is imposed: the array is carried exactly as authored, in authored order, empty or
 *    repeated included. No closed party-class vocabulary is fixed, and no reference is dereferenced to admit the record.
 *  - `relation_scope` is REQUIRED and singular: one authored value (`SingularAuthoredValueSchema`, the weakest canonical
 *    singular representation the repository already supports). WS-008 fixes no executable subtype or closed vocabulary, so it is
 *    never an array, a closed enum, a score or a normalised text taxonomy.
 *  - `rupture_or_suspension_status` is OPTIONAL and singular: absent stays absent (no default); when present it is one authored
 *    value, with no closed literal set and no narrower subtype.
 *  - `provenance_ref` is an OPTIONAL singular opaque authored reference, distinct from the engine's own rule/spec provenance.
 *  - `lifecycle_status` is REQUIRED and singular: one authored value. WS-008 §5.1 supplies no closed literal set, so none is
 *    invented; no alias is normalised and no lifecycle value is defaulted.
 *
 * Not fields: `channel_refs[]`, `recognition_refs[]`, `active_claim_dispute_refs[]`, `instrument_refs[]` and `framework_refs[]`
 * (derived, non-authoritative indexes per §29.7); `dependency_refs[]` (this authored core is not a conclusion derived from
 * another owner's mutable state); any Channel, Negotiation Record, Instrument, Clause, Binding Entry, compliance or performance
 * field; any score, trust, reputation or influence meter; any relevance score or flag; any alias of a name above; and any
 * convenience, discriminator or property-bag field.
 */
export const RelationEdgeSchema = z
  .strictObject({
    relation_id: EntityId,
    party_refs: z.array(Id),
    relation_scope: SingularAuthoredValueSchema,
    rupture_or_suspension_status: SingularAuthoredValueSchema.optional(),
    provenance_ref: Id.optional(),
    lifecycle_status: SingularAuthoredValueSchema,
  })
  .refine(noExplicitUndefined, "an omitted optional field is absent, never an explicit undefined");
export type RelationEdge = z.infer<typeof RelationEdgeSchema>;
