import { z } from "zod";
import { Id } from "./ids.ts";
import { SingularAuthoredValueSchema } from "./diplomacy-dispute.ts";
import { EntityId } from "./world-foundation.ts";

/**
 * Diplomacy Framework Authoritative Core Backbone Foundation — executable contract (twenty-second bounded slice).
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-008 Diplomacy / Inter-Faction Relations v1.1 (frozen F-027 pin 2026-09-24T07:01:45.312Z): §§2.1–2.2 (ownership: Diplomacy
 *     owns diplomatic Framework membership and external charter / instrument references), §4 (the Relevance / Reach gate: no
 *     all-pairs scan), §16 (Diplomatic Frameworks: the minimum surface), §§19–24 (runtime sequence and invariants, including
 *     "Framework membership ≠ autonomous collective agency" and "One member's breach ≠ framework-wide breach"), §29.3 (R-3:
 *     `dependency_refs[]` only for a conclusion derived from another owner's mutable state), §29.5 (R-5: the collective decision
 *     owner) and §29.7 (R-7 / S-1: a shared Framework replaces duplicated pairwise treaty structure)
 *   F-016 Phase 2C and F-017 Whole-Engine Dependency Graph v0.3: the Actor/Faction/GIP/Diplomacy reconciliation and dependency
 *     lineage, only for the ownership / dependency boundaries relied upon
 *
 * One Framework is ONE authored, durable, shared Diplomacy object for a durable multi-party external arrangement, where one
 * shared object is future-causally sufficient and pairwise duplication is not. It is the Framework record itself and nothing
 * else: it is NOT a framework decision, a member decision, a Diplomatic Instrument, Clause or Binding Entry, a membership
 * movement, a member-fault propagation, a commitment performance, a GIP institution, an Autonomous Collective, a Recognition,
 * a Claim / Dispute or a Relation Edge index.
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). Every identifier below is the source's own,
 * reproduced exactly; none is renamed, pluralised, singularised, merged, aliased or substituted. The contract carries authored
 * content and interprets none of it.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet and key space (IM-06). Technical encodings; the assignment itself is the source's.
// ---------------------------------------------------------------------------------------------

/**
 * One exclusive Framework facet under the existing Diplomacy owner (`OWNER_DIPLOMACY`, declared by the External Recognition
 * contract). The facet identifier is an implementation convention only: it creates no second substantive owner.
 */
export const FACET_DIPLOMACY_FRAMEWORK = "diplomacy_framework";

/**
 * One Framework fact, addressed by its canonical `framework_id` ALONE. One key, hence one slot, per Framework: a retry, a second
 * construction or a conflicting establishment reaches the same occupied slot, never a sibling. The members, the charter or
 * instrument references, the rules, the shared commitments, the lifecycle status and the provenance are NOT identity dimensions:
 * the Framework is stored once, never as a copy per member, relation, instrument, observer, population unit or locus. The path is
 * a technical encoding of that identity; it is exclusive to this kind.
 */
export const diplomacyFrameworkKey = (frameworkId: string): string =>
  `diplomacy/framework/${frameworkId}`;

/** An authored optional field is either omitted or carried: an explicit `undefined` (which has no canonical form) is refused. */
const noExplicitUndefined = (value: Record<string, unknown>): boolean =>
  Object.values(value).every((v) => v !== undefined);

/**
 * The WS-008 §16 minimum Framework surface — and only that. Every value is authored and explicit: nothing is defaulted,
 * inferred, derived, dereferenced or normalised.
 *
 *  - `framework_id` is the canonical identity (and the only identity dimension), under the repository's key-safe identifier rule
 *    because it is embedded in the canonical key.
 *  - `framework_basis` is REQUIRED and singular: one authored value (`SingularAuthoredValueSchema`, the weakest canonical
 *    singular representation the repository's Diplomacy foundations already use). WS-008 fixes no executable subtype or closed
 *    vocabulary, so it is never an array, a closed enum or a normalised text taxonomy.
 *  - `member_refs[]`, `charter_or_instrument_refs[]` and `shared_commitment_refs[]` are REQUIRED ARRAYS of opaque authored
 *    references. WS-008 defines no minimum length, uniqueness, sorting, deduplication or reciprocal-copy rule for any of them, so
 *    none is imposed: each array is carried exactly as authored, in authored order, empty or repeated included. No referent class
 *    is fixed, and no reference is dereferenced to admit the record.
 *  - `membership_rules` and `entry_exit_rules` are REQUIRED and singular: one authored value each, with no invented internal
 *    schema.
 *  - `collective_decision_rule_ref` is CONDITIONAL and singular: present where external framework action requires one, absent
 *    otherwise. It is never defaulted or fabricated, and it is only stored: no vote, tally, quorum, chooser, interpretation or
 *    framework action is computed from it (§29.5 is an ownership boundary, not functionality of this record).
 *  - `lifecycle_status` is REQUIRED and singular: one authored value. WS-008 §16 supplies no closed literal set, so none is
 *    invented; no alias is normalised and no lifecycle value is defaulted.
 *  - `provenance_ref` is a REQUIRED singular opaque authored reference, distinct from the engine's own rule / spec provenance.
 *
 * Not fields: `dependency_refs[]` (this authored core is not a conclusion derived from another owner's mutable state, §29.3);
 * any Relation Edge `framework_refs[]` or other derived index (§29.7); any Channel, Negotiation Record, Instrument, Clause,
 * Binding Entry, Recognition, Claim / Dispute, compliance or performance field; any score, trust, reputation or influence meter;
 * any alias of a name above; and any convenience, discriminator or property-bag field.
 */
export const DiplomaticFrameworkSchema = z
  .strictObject({
    framework_id: EntityId,
    framework_basis: SingularAuthoredValueSchema,
    member_refs: z.array(Id),
    charter_or_instrument_refs: z.array(Id),
    membership_rules: SingularAuthoredValueSchema,
    entry_exit_rules: SingularAuthoredValueSchema,
    collective_decision_rule_ref: Id.optional(),
    shared_commitment_refs: z.array(Id),
    lifecycle_status: SingularAuthoredValueSchema,
    provenance_ref: Id,
  })
  .refine(noExplicitUndefined, "an omitted optional field is absent, never an explicit undefined");
export type DiplomaticFramework = z.infer<typeof DiplomaticFrameworkSchema>;
