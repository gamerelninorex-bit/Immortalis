import { z } from "zod";
import { Id, Version } from "./ids.ts";
import type { StageKey } from "./temporal.ts";
import { StageKeySchema } from "./temporal.ts";
import { EntityId, Text } from "./world-foundation.ts";

/**
 * Named-Actor Character Capability & Capability-Close Backbone Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-016 Character Capability Protocol v1 (Concept + Working Operational Draft v1, Sovereign-ratified 2026-09-25;
 *                                           lock pin 2026-09-24T17:38:59.210Z) §§3, 4, 6, 7, 10, 16, 17, 20, 27.1, 28
 *   WS-006 Named Actors — F-014A v3.3 (lock pin 2026-09-25T00:18:36.828Z) and the F-014A v3.2 Character Capability
 *                                           amendment it inherits ("durable personal mastery" in the actor profile),
 *                                           with the W3-CP3 PC-Control Handover interface note
 *   RC-02 OwnerFact, RC-03 TemporalRead (AS-OF-DECLARED-CLOSE), RC-04 StageKey, RC-13 binding
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is the structural half of the
 * Character Capability guards: there is NO field in which a numeric rank, XP, level, percentage, modifier, raw bodily
 * property, equipment, temporary effectiveness, office/authority, KTI state, observer belief/reputation, aggregate
 * (cohort, population, institution) reference, body/entity reference, scope, constraint or lifecycle transfer could be
 * placed (WS-016 §3, §6, §19, §20, §22, §23, §32). Nothing here is a game rule or a calibration.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet and key spaces (IM-07). Technical encodings; the assignment itself is the sources'.
// ---------------------------------------------------------------------------------------------

/** F-014A / the lawful Named-Actor owner (WS-016 §2: "Named-Actor capability facts remain owned by F-014A"). */
export const OWNER_NAMED_ACTOR = "named_actor";
/** The F-014A actor-profile facet: the sparse durable-personal-mastery / representational-capability class. */
export const FACET_ACTOR_PROFILE = "actor_profile";

export const NAMED_ACTOR_OPERATION_PUBLISH_CAPABILITY_CLOSE =
  "named-actor-publish-capability-close";
/** The Close Basis name the actor owner declares (WS-016 §27.1 "capability close"; F-017 §3 CLOSE). */
export const ACTOR_PROFILE_CAPABILITY_CLOSE = "actor-profile-capability-close";

/** The sealed, authored, pre-close establishment record (WS-016 §16 step 5: persisted BEFORE the dependent action). */
export const actorCapabilityBasisKey = (actorId: string, capabilityId: string): string =>
  `actor/${actorId}/capability-basis/${capabilityId}`;
/** The persisted capability, committed only at the actor owner's capability close. */
export const actorCapabilityKey = (actorId: string, capabilityId: string): string =>
  `actor/${actorId}/capability/${capabilityId}`;

/**
 * The IM-02 stage whose commit IS the capability close of one actor/capability (RC-04). Its identity is derived from
 * the actor and the capability alone: a requested horizon, a source version, a retry, a consumer or a slice is not an
 * identity dimension, so any later transaction that declares the same stage reaches the same committed close.
 */
export const actorCapabilityStage = (actorId: string, capabilityId: string): StageKey => ({
  causal_process_id: `actor-capability/${actorId}/${capabilityId}`,
  owner_operation: {
    owner: OWNER_NAMED_ACTOR,
    operation: NAMED_ACTOR_OPERATION_PUBLISH_CAPABILITY_CLOSE,
  },
  prospective_result_id: actorCapabilityKey(actorId, capabilityId),
});

// ---------------------------------------------------------------------------------------------
// The comparative marker (WS-016 §3, §4, §5, §6, §7): qualitative only.
// ---------------------------------------------------------------------------------------------

/** C → B → A → S: simulation-wide, qualitative, non-equidistant. Never a number, percentage, modifier or level. */
export const CAPABILITY_GRADES = ["C", "B", "A", "S"] as const;
export const CapabilityGradeSchema = z.enum(CAPABILITY_GRADES);
export type CapabilityGrade = z.infer<typeof CapabilityGradeSchema>;

/** `Capability — EX: causal descriptor`. EX is not a grade and is not S+ (WS-016 §5, §7). */
export const ExMarkerSchema = z.strictObject({ ex: Text });

/**
 * One optional comparative marker: a bare grade, or EX with its causal descriptor. The mode is derivable from the
 * marker itself, so no separate `Mode` field exists (WS-016 §3 "do not persist a separate Mode field"). `null` is the
 * explicit statement "ungraded" (comparison adds little): it is not a hidden below-C rung (WS-016 §3).
 */
export const ComparativeMarkerSchema = z.union([CapabilityGradeSchema, ExMarkerSchema]);
export type ComparativeMarker = z.infer<typeof ComparativeMarkerSchema>;

// ---------------------------------------------------------------------------------------------
// Establishment basis (WS-016 §4 persistence gate, §16 establishment adapter).
// ---------------------------------------------------------------------------------------------

/** WS-016 §4 "Named Actor": persist only when role-defining, recurring, materially consequential, or repeatedly required. */
export const NAMED_ACTOR_MATERIALITY = [
  "ROLE_DEFINING",
  "RECURRING",
  "MATERIALLY_CONSEQUENTIAL",
  "REPEATEDLY_REQUIRED",
] as const;

/** WS-016 §16 step 1: "the smallest relevant established causes", as the source lists them. */
export const CAPABILITY_CAUSE_ASPECTS = [
  "BIOGRAPHY_HISTORY",
  "OCCUPATION_ROLE",
  "AGE_DEVELOPMENTAL_HISTORY",
  "LOCAL_KTI",
  "INSTITUTION_TEACHERS_ENVIRONMENT",
  "APTITUDE_DEVELOPMENTAL_DISPOSITION",
  "PERSONALITY_GOALS_COMMITMENTS",
  "ONTOLOGY_EMBODIMENT",
  "ESTABLISHED_ACCOMPLISHMENT",
  "WORLD_CONSTRAINT",
] as const;

/**
 * A lawful pre-existing causal input, REFERENCED and never copied (RC-02 guard): a committed foreign fact, pinned at
 * the version it was read at. It carries no value, so no foreign fact (equipment, embodiment, KTI, office,
 * relationship, observer belief) can be copied into the capability.
 */
export const CapabilityCauseSchema = z.strictObject({
  aspect: z.enum(CAPABILITY_CAUSE_ASPECTS),
  owner: Id,
  fact_key: Id,
  version: Version.min(1),
});
export type CapabilityCause = z.infer<typeof CapabilityCauseSchema>;

/**
 * The authored establishment record of one Named-Actor capability, committed BEFORE any dependent consequence can
 * consume it (WS-016 §16 step 5, §26 "causality supplies the answer"). The only method representable is
 * CAUSALLY_DETERMINED: the pinned causes "sufficiently determine the capability" (§16 step 2). The other branch —
 * "genuine uncertainty remains: define a branch-invariant bounded prior and use the simulation's existing lawful
 * uncertainty/randomization mechanism" (§16 steps 3–4) — has NO lawful mechanism in this engine and Character Capability
 * owns no RNG, so it is unrepresentable and fails closed (an Implementation Escalation, never improvised).
 *
 * Unmodelled by design (fail closed): Scope, Constraints (§3 "only where materially necessary"; no source structure),
 * aggregate bound supply and promotion/individuation (§28.2: not Revelation), development/loss amendment (§18),
 * lifecycle transfer (§21–22), audit trace beyond the pinned causes (§31).
 */
export const NamedActorCapabilityBasisSchema = z
  .strictObject({
    /** the Named Actor (an agency, not a body: no body or entity reference exists — WS-016 §28, F-014A v3.3 §6) */
    actor_id: EntityId,
    /** the broad practiced faculty, at the §8 transfer-test level of granularity; no global vocabulary is stored */
    capability_id: EntityId,
    marker: ComparativeMarkerSchema.nullable(),
    materiality: z.enum(NAMED_ACTOR_MATERIALITY),
    establishment: z.strictObject({
      method: z.literal("CAUSALLY_DETERMINED"),
      causes: z.array(CapabilityCauseSchema).min(1),
    }),
  })
  .superRefine((b, ctx) => {
    const keys = b.establishment.causes.map((c) => c.fact_key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        message: "a cause is cited once",
        path: ["establishment", "causes"],
      });
    }
  });
export type NamedActorCapabilityBasis = z.infer<typeof NamedActorCapabilityBasisSchema>;

// ---------------------------------------------------------------------------------------------
// The persisted capability (WS-016 §3 minimal record) — owner named_actor / facet actor_profile.
// ---------------------------------------------------------------------------------------------

/**
 * The minimal persistent capability record: the capability, its optional comparative marker, a provenance pointer to
 * its pinned establishment basis and the capability-close reference (required here because the fact is always
 * consumed cross-owner, WS-016 §3). It holds NO current fatigue, injury, equipment, observer reputation, KTI corpus,
 * office, relationship or situational advantage, and no number of any kind.
 */
export const NamedActorCapabilitySchema = z.strictObject({
  actor_id: EntityId,
  capability_id: EntityId,
  marker: ComparativeMarkerSchema.nullable(),
  basis: z.strictObject({ fact_key: Id, version: Version.min(1) }),
  close: z.strictObject({
    name: z.literal(ACTOR_PROFILE_CAPABILITY_CLOSE),
    stage: StageKeySchema,
  }),
});
export type NamedActorCapability = z.infer<typeof NamedActorCapabilitySchema>;
