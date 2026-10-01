import { z } from "zod";
import { Id, Version } from "./ids.ts";
import { FALLBACK_BASIS, FACET_WORLD_FALLBACK_ENTITY } from "./production.ts";
import { CanonicalTimeSchema, StageKeySchema, compareTime } from "./temporal.ts";
import { EntityId, FactRefSchema, OWNER_WORLD_STATE } from "./world-foundation.ts";

/**
 * World-State Entity Continuity / Transition Close Backbone Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WG World Generation & World-State Kernel  Ownership Guards — F-016 Ratified Fallback Objective
 *                                       Physical-Entity Custody ("The fallback never converts causal ownership into
 *                                       entity ownership ... commits existence/cessation/form exactly once and
 *                                       references that causing result")
 *   F-016 v0.4 successor delta          §2 R-1 ECT-01 Entity Continuity / Transition Result (predecessor and
 *                                       successor entity references, per-successor continuity relation,
 *                                       existence/cessation, form if changed, continuity/dependency basis,
 *                                       provenance, Entity Transition Close; the cause-owner / entity-commit split),
 *                                       §3 R-2 (the accepted custodian is the single writer of the durable's physical
 *                                       state), §5 R-4 (Entity Transition Close joins the F-016 close vocabulary)
 *   F-017 Whole-Engine Dependency Graph v0.3  the implicated ECT-01 / entity-continuity interface only
 *   RC-02 OwnerFact, RC-04 StageKey, RC-10 TemporalObject (minimum surfaces only)
 *
 * The bounded proof is ONE material transition of one already-accepted fallback physical entity: the SAME entity
 * continues, with the same conserved quantity and physical condition, and only its objective current world-side
 * locus changes. Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is also the
 * structural half of the exclusions: there is no field in which a replacement entity, a cessation, a changed
 * form, a changed quantity or condition, an agency count, a Population effect, a holder, a title, a carrier, a
 * path, a capacity or an in-flight state could be stored. Identifiers, owner/facet names and literals the sources
 * do not prescribe are technical encodings.
 *
 * Current locus is ONE truth. The accepted entity (a sealed fact) keeps the locality it was accepted at as
 * historical origin and is never rewritten; the entity's CURRENT locus is the destination of its Entity
 * Transition Close when one exists and otherwise that accepted locality. The transition cites the origin it
 * leaves, so the two can never be rival simultaneous current loci.
 */

// ---------------------------------------------------------------------------------------------
// Key spaces and derived identities. The transition lives in World-State's own key space, one slot per entity:
// a second transition of the same entity is a version conflict, never a sibling truth.
// ---------------------------------------------------------------------------------------------

export const worldEntityTransitionKey = (worldId: string, entityId: string): string =>
  `world/${worldId}/entity/${entityId}/transition`;

/**
 * Identities derived from the cause identity alone (as stage identities are derived from the StageKey): one cause
 * has one causal process, one temporal object, one earned boundary and one prospective transition. Nothing here is
 * a clock, a counter or a random value, so a retry or a replay reaches the same identities and a second
 * transition can never be minted by accident.
 */
export const ENTITY_TRANSITION_PROCESS_PREFIX = "entity-transition:";
export const entityTransitionProcessId = (causeId: string): string =>
  `${ENTITY_TRANSITION_PROCESS_PREFIX}${causeId}`;
export const ENTITY_TRANSITION_OBJECT_PREFIX = "obj-entity-transition-";
export const entityTransitionObjectId = (causeId: string): string =>
  `${ENTITY_TRANSITION_OBJECT_PREFIX}${causeId}`;
export const entityTransitionBoundaryId = (causeId: string): string =>
  `boundary-entity-transition-${causeId}`;
/** The identity of the one transition a cause fixes (also its prospective result identity). */
export const entityTransitionId = (causeId: string): string => `transition:${causeId}`;

/** The World-State owner operation that commits the transition (F-016 v0.4 §2: committed exactly once). */
export const WORLD_OPERATION_COMMIT_ENTITY_TRANSITION = "world-state-commit-entity-transition";

export const entityTransitionStage = (causeId: string) =>
  ({
    causal_process_id: entityTransitionProcessId(causeId),
    owner_operation: {
      owner: OWNER_WORLD_STATE,
      operation: WORLD_OPERATION_COMMIT_ENTITY_TRANSITION,
    },
    prospective_result_id: entityTransitionId(causeId),
  }) as const;

/**
 * F-016 v0.4 §5 R-4: "Entity Transition Close — owner: World-State or lawful more-specific physical/entity
 * custodian; function: seals ECT-01 objective entity/form/existence/continuity output for downstream reads."
 * The stage that commits the transition IS the named close (F-017 §3 CLOSE).
 */
export const ENTITY_TRANSITION_CLOSE_NAME = "Entity Transition Close";
export const ENTITY_TRANSITION_CLOSE_BASIS = {
  name: ENTITY_TRANSITION_CLOSE_NAME,
  producer: { owner: OWNER_WORLD_STATE, operation: WORLD_OPERATION_COMMIT_ENTITY_TRANSITION },
} as const;

// ---------------------------------------------------------------------------------------------
// The causing result. The cause OWNER establishes cause and causal outcome only (F-016 v0.4 §2): it holds the
// result in its own key space and has no field in which the entity's locus, continuity, existence or physical
// condition could be written. World-State reads it, pins it and commits the entity consequence itself.
// ---------------------------------------------------------------------------------------------

const LocusRefSchema = z.strictObject({ world: FactRefSchema, locus: FactRefSchema });
export type LocusRef = z.infer<typeof LocusRefSchema>;

export const EntityTransitionCauseSchema = z
  .strictObject({
    /** the identity of the causing result: it fixes the one transition, process, object and boundary */
    cause_id: EntityId,
    /** the causing owner and its own reference (an opaque reference, never a copied fact) */
    source: z.strictObject({ owner: Id, cause_ref: Id }),
    /** the accepted fallback physical entity the outcome concerns: referenced, never copied */
    subject: z.strictObject({ fact_key: Id, entity_id: EntityId }),
    /**
     * The causal outcome: one material same-entity locus change is required. It names where; it does not
     * assert that the entity IS there. That is World-State's own commit.
     */
    outcome: z.strictObject({
      kind: z.literal("SAME_ENTITY_LOCUS_CHANGE_REQUIRED"),
      destination: LocusRefSchema,
    }),
    timing: z.strictObject({
      /** the basis at which the causing owner actually established the result */
      established_at: CanonicalTimeSchema,
      /** the one instant at which the outcome takes effect: the earned boundary of the transition */
      occurs_at: CanonicalTimeSchema,
    }),
  })
  .superRefine((c, ctx) => {
    // An outcome never takes effect BEFORE the basis it was established at. Whether it may take effect AT that
    // basis is the causing owner's own lawful timing, decided by the transition derivation: a result established by
    // a stage at its own boundary (Logistics' delivery-complete result) takes effect at that boundary, and
    // cause-before-effect is carried by the IM-02 stage order, not by a fabricated earlier establishment time.
    const c0 = compareTime(c.timing.established_at, c.timing.occurs_at);
    if (c0 !== -1 && c0 !== 0)
      ctx.addIssue({
        code: "custom",
        message: "an outcome never takes effect before the basis it was established at",
        path: ["timing"],
      });
  });
export type EntityTransitionCause = z.infer<typeof EntityTransitionCauseSchema>;

// ---------------------------------------------------------------------------------------------
// ECT-01 — Entity Continuity / Transition Result, sealed by the Entity Transition Close. Sealed provenance of one
// committed transition; never a second writable location, existence or condition.
// ---------------------------------------------------------------------------------------------

export const EntityTransitionCloseSchema = z
  .strictObject({
    /** the transition's own identity, derived from its cause */
    transition_id: EntityId,
    /** the entity transitioned, pinned at the version read: predecessor and successor are this same entity */
    entity: z.strictObject({ fact_key: Id, entity_id: EntityId, version: Version.min(1) }),
    /** per-successor continuity relation (F-016 v0.4 §2): the same entity continues, unchanged but for locus */
    continuity: z.strictObject({
      relation: z.literal("SAME_ENTITY_CONTINUES"),
      predecessor: EntityId,
      successor: EntityId,
      existence: z.literal("CONTINUES"),
      form: z.literal("UNCHANGED"),
      conserved: z.literal("QUANTITY_AND_CONDITION_UNCHANGED"),
      /** the continuity/dependency basis: the causing result changes the current locus and nothing else */
      basis: z.literal("CAUSING_RESULT_CHANGES_CURRENT_LOCUS_ONLY"),
    }),
    /** the origin it leaves (the accepted locality, history that stays true) and the new current locus */
    locus: z.strictObject({ from: LocusRefSchema, to: LocusRefSchema }),
    /** provenance: the causing result, by owner, key and the version pinned */
    cause: z.strictObject({
      owner: Id,
      fact_key: Id,
      version: Version.min(1),
      cause_id: EntityId,
    }),
    /** the committing custodian: World-State, as fallback only where no more-specific owner exists */
    custodian: z.strictObject({
      owner: z.literal(OWNER_WORLD_STATE),
      facet: z.literal(FACET_WORLD_FALLBACK_ENTITY),
      basis: z.literal(FALLBACK_BASIS),
    }),
    closed_at: CanonicalTimeSchema,
    /** the Entity Transition Close: the stage whose commit constitutes it (identity, never a horizon) */
    close: z.strictObject({ name: z.literal(ENTITY_TRANSITION_CLOSE_NAME), stage: StageKeySchema }),
  })
  .superRefine((t, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (
      t.continuity.predecessor !== t.entity.entity_id ||
      t.continuity.successor !== t.entity.entity_id
    )
      bad("predecessor and successor are the one entity that continues", ["continuity"]);
    if (t.locus.from.world.entity_id !== t.locus.to.world.entity_id)
      bad("a same-entity transition stays within its world", ["locus"]);
    if (t.locus.from.locus.entity_id === t.locus.to.locus.entity_id)
      bad("a material transition changes the current locus", ["locus"]);
  });
export type EntityTransitionClose = z.infer<typeof EntityTransitionCloseSchema>;
