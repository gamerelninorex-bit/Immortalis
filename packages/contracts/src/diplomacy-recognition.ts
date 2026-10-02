import { z } from "zod";
import { Id } from "./ids.ts";
import { JsonValueSchema } from "./json.ts";
import { EntityId } from "./world-foundation.ts";

/**
 * Diplomacy External Recognition Core Backbone Foundation — executable contract (seventeenth bounded slice).
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-008 Diplomacy / Inter-Faction Relations v1.1 (frozen F-027 pin 2026-09-24T07:01:45.312Z): §2.1 (Diplomacy owns
 *     directional and scoped external recognition state), §6 (External Recognition: the minimum recognition entry and the
 *     possible `recognition_status` values), §24 (invariants 7-8: recognition is directional and scoped; recognition is not
 *     objective truth or control), §29.2 (R-2: `continuity_basis` and `successor_rule_ref`), §29.3 (R-3: `dependency_refs[]`),
 *     §29.7 (recognition is directional and scoped; no all-pairs entries) and §29.8 m-4 (no implied recognition by conduct)
 *   WS-007 Government / Institutions / Politics (frozen F-027 pin 2026-09-24T01:42:24.952Z) and GIP Concept Amendment v2.1
 *     (pin 2026-09-24T01:42:22.902Z): pure external recognition stays in Diplomacy, not GIP
 *   F-016 Phase 2C and F-017 Whole-Engine Dependency Graph v0.3: external recognition belongs to Diplomacy; GIP authority
 *     precedes Diplomacy; later GIP incorporation cannot rewrite the earlier external act
 *
 * One External Recognition record is ONE authored, durable Diplomacy fact: "this recognizer formally holds this scoped
 * external recognition status toward this referent, effective from this authored point, under this authored authority basis
 * and this act or instrument". It is NOT objective existence, control, territorial truth or internal legal status; it is not
 * recipient awareness, receipt, comprehension, belief, acceptance or loyalty; it is not internal law or domestic incorporation;
 * it is not a treaty, negotiation, Diplomatic Instrument, Clause or Binding Entry; it is not an Actor / Faction / ACS choice;
 * and it is not inferred from contact, trade, negotiation, treaty-making or conduct.
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). Every identifier below is the source's own,
 * reproduced exactly; none is renamed, pluralised, singularised, merged, aliased or substituted. The contract carries authored
 * content and interprets none of it.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet and key space (IM-06). Technical encodings; the assignment itself is the source's.
// ---------------------------------------------------------------------------------------------

/**
 * WS-008 / the lawful Diplomacy owner (IM-06). One owner, one External Recognition facet (a technical encoding of the
 * source's "directional and scoped external recognition state"). Diplomacy is a distinct owner from GIP and Economy.
 */
export const OWNER_DIPLOMACY = "diplomacy";
export const FACET_DIPLOMACY_EXTERNAL_RECOGNITION = "diplomacy_external_recognition";

/**
 * One External Recognition fact, addressed by its canonical `recognition_id` ALONE. One key, hence one slot, per recognition:
 * a retry, a second construction or a conflicting establishment reaches the same occupied slot, never a sibling. The
 * recognizer, the referent, the scope, the status and the dependencies are NOT identity dimensions: the fact is stored once,
 * never as a reciprocal copy, and never per recipient, population member, place or observer. The path is a technical
 * encoding of that identity; it is exclusive to this kind.
 */
export const diplomacyRecognitionKey = (recognitionId: string): string =>
  `diplomacy/recognition/${recognitionId}`;

/** An authored optional field is either omitted or carried: an explicit `undefined` (which has no canonical form) is refused. */
const noExplicitUndefined = (value: Record<string, unknown>): boolean =>
  Object.values(value).every((v) => v !== undefined);

/**
 * WS-008 §6 "Possible recognition_status values", exactly as listed. This list is NOT a closed enum: the source says
 * "Possible", not "only", so it is exported as documentation and test evidence of the listed values and is never used to
 * accept or reject a `recognition_status`. A later source-defined named value is not rejected merely for being absent from it.
 */
export const LISTED_RECOGNITION_STATUSES = [
  "recognized",
  "explicit_nonrecognition",
  "withdrawn",
  "suspended",
  "limited_scope",
  "contested_or_unresolved",
] as const;

/**
 * WS-008 §29.2 gives `personal`, `office` and `represented_entity` as setting-valid examples ("or another explicitly named
 * basis"). They are examples, not a closed set: exported as documentation and test evidence only, never used to narrow
 * `continuity_basis`.
 */
export const EXAMPLE_CONTINUITY_BASES = ["personal", "office", "represented_entity"] as const;

/** A canonical JSON scalar: a string, a finite number, a boolean or null. No array, no object, no finer subtype. */
const JsonScalarSchema = z.union([
  z.null(),
  z.boolean(),
  z.number().refine(Number.isFinite, "numbers must be finite"),
  z.string(),
]);

/**
 * `effective_from`: ONE authored canonical JSON scalar (the brief fixes it as a scalar and fixes no finer subtype), carried
 * exactly as authored. Arrays and objects are not scalars.
 */
export const EffectiveFromSchema = JsonScalarSchema;

/**
 * `recognition_scope`: ONE authored singular scope value (the brief requires it to stay singular and fixes no subtype). A
 * canonical JSON scalar or a canonical JSON object is one value, carried exactly as authored; an array is multiplicity and is
 * refused. No text-only or closed-vocabulary subtype is imposed.
 */
export const RecognitionScopeSchema = z.union([
  JsonScalarSchema,
  z.record(z.string(), JsonValueSchema),
]);

/**
 * The WS-008 §6 minimum recognition entry plus the v1.1 repair overlay (§29.2, §29.3) — and only those. Every value is
 * authored and explicit: nothing is defaulted, inferred, derived, dereferenced or normalised.
 *
 *  - `recognition_id` is the canonical identity (and the only identity dimension).
 *  - `recognizer_ref` and `recognized_referent_ref` are singular, directional, OPAQUE authored references. The contract fixes
 *    no recognizer-party class and no referent class (the source lets recognition concern "a government, representative,
 *    status, claim, boundary, belligerency, framework membership or another setting-valid referent"), and in particular does
 *    not restrict `recognizer_ref` to a GIP office. Neither is resolved or validated against any owner, and nothing is minted,
 *    altered or backfilled in a foreign owner because a reference names it. No reciprocal record is implied.
 *  - `recognition_scope` is REQUIRED and SINGULAR: one authored scope value, carried exactly as authored. WS-008 and the brief fix
 *    it as singular source material and fix no concrete subtype, so none is imposed: any canonical JSON scalar (string, finite
 *    number, boolean, null) or any canonical JSON object is one scope value (`RecognitionScopeSchema`). Array-valued
 *    multiplicity is refused — a list of scopes is not one scope. It is never parsed, normalised, compared, interpreted or turned
 *    into a score, and no global recognition score exists.
 *  - `recognition_status` is ONE authored named value. The listed values (LISTED_RECOGNITION_STATUSES) round-trip exactly; the
 *    set is not closed, no alias is normalised into them, and no value is rejected for being unlisted.
 *  - `authority_basis_ref` is an OPAQUE authored reference, never dereferenced to infer, manufacture or re-prove authority.
 *  - `effective_from` is REQUIRED and an authored SCALAR (the brief's word): one canonical JSON scalar — a string, a finite number,
 *    a boolean or null (`EffectiveFromSchema`) — carried exactly as authored. No arrays or objects, and no finer subtype
 *    (text, date, timestamp, Temporal point) is imposed. It is never parsed, compared, scheduled or turned into a Temporal
 *    boundary. No future activation is scheduled.
 *  - `withdrawal_or_supersession_condition` is OPTIONAL: absent is absent, and when present it is one authored value carried
 *    exactly as authored. WS-008 fixes only that the field is optional, so no subtype is imposed (any canonical JSON value,
 *    `JsonValueSchema`); it is never parsed, evaluated or executed.
 *  - `instrument_or_act_ref` is an OPAQUE authored reference to the external act or instrument supplying the recognition
 *    basis; no Diplomatic Instrument is manufactured merely to satisfy it.
 *  - `provenance_ref` is an OPAQUE authored source reference, distinct from the engine's own rule/spec provenance metadata.
 *  - `continuity_basis` (WS-008 §29.2) is a REQUIRED singular named authored basis. `personal`, `office` and
 *    `represented_entity` are examples (EXAMPLE_CONTINUITY_BASES), not a closed enum: any explicitly named basis is carried.
 *  - `successor_rule_ref` (WS-008 §29.2) is CONDITIONAL: present only where the instrument or governing external arrangement
 *    supplies one, absent otherwise, never fabricated and never required. No succession law is invented or applied.
 *  - `dependency_refs[]` (WS-008 §29.3) is CONDITIONAL: present only where the persisted conclusion is actually derived from
 *    another owner's mutable implemented state, in which case each element is the exact fact key of that committed state and
 *    the dependency is registered through the existing commit-group read / dependency pins (admission). A purely authored
 *    baseline record carries none, and none is invented. The source fixes no minimum length, no uniqueness and no
 *    deduplication, so none is imposed: the array is carried exactly as authored.
 *
 * Not fields: any Relation Edge, Channel, Negotiation Record, Instrument, Clause, Binding Entry, Framework, claim, dispute or
 * compliance field; any generic `status`, `score`, `trust`, `reputation`, `influence`, reciprocal or `symmetric` field;
 * any alias of a name above; and any convenience, discriminator or property-bag field.
 */
export const ExternalRecognitionSchema = z
  .strictObject({
    recognition_id: EntityId,
    recognizer_ref: Id,
    recognized_referent_ref: Id,
    recognition_scope: RecognitionScopeSchema,
    recognition_status: Id,
    authority_basis_ref: Id,
    effective_from: EffectiveFromSchema,
    withdrawal_or_supersession_condition: JsonValueSchema.optional(),
    instrument_or_act_ref: Id,
    provenance_ref: Id,
    continuity_basis: Id,
    successor_rule_ref: Id.optional(),
    dependency_refs: z.array(Id).optional(),
  })
  .refine(noExplicitUndefined, "an omitted optional field is absent, never an explicit undefined");
export type ExternalRecognition = z.infer<typeof ExternalRecognitionSchema>;

/**
 * The distinct committed fact keys an External Recognition's `dependency_refs[]` names, in first-authored order. The array
 * itself is carried exactly as authored; this is only the set of facts admission must see pinned.
 */
export const recognitionDependencyKeys = (recognition: ExternalRecognition): readonly string[] => [
  ...new Set(recognition.dependency_refs ?? []),
];
