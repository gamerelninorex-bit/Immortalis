import { z } from "zod";
import {
  CapabilityCauseSchema,
  CapabilityDrawReferenceSchema,
  CapabilityPriorEntrySchema,
  ComparativeMarkerSchema,
} from "./actor-capability.ts";
import type { CausalDrawKey } from "./causal-draw.ts";
import { Id, Version } from "./ids.ts";
import type { StageKey } from "./temporal.ts";
import { StageKeySchema } from "./temporal.ts";
import { EntityId, OWNER_PC_EXISTENCE, PLAYER_CHARACTER_BINDING_KEY } from "./world-foundation.ts";

/**
 * I-002 PC Capability Profile / PC Capability Close Receiving Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-016 Character Capability Protocol v1 Blue Bounded Integration Map §2 "I-002 — BOUNDED AMENDMENT" (lock pin
 *                                           2026-09-24T17:38:59.210Z): a compact PC Capability Profile companion state under
 *                                           I-002 ownership for current durable personal mastery, ratified I-002 v2.1
 *   WS-016 Working Operational Draft v1 §§2, 3, 4, 6, 7, 11, 27, 27.1, 28, 32 (comparative marker semantics, persistence
 *                                           gate, capability close, no same-resolution feedback, one owner per actor)
 *   I-002 Player Character Generation (lock pin 2026-09-25T00:15:54.536Z) §2 Ownership Contract, §4 Minimum Existence
 *                                           Contract, §21 Generation Hand-Off, §26 Sparse Persistence
 *   F-016 Phase 2B §H PCC-01 (the authoritative PC mastery owner is I-002 / the PC-side character-local capability state),
 *                                           PCC-02 (the Close Basis is named "PC Capability Close"), PCC-03 (cross-owner reads
 *                                           are AS-OF-DECLARED-CLOSE, Close Basis = PC Capability Close)
 *   RC-02 OwnerFact, RC-03 TemporalRead (AS-OF-DECLARED-CLOSE), RC-04 StageKey
 *
 * There is ONE PC owner: `pc_existence` (I-002). The PC capability profile is a second FACET of that same owner, not a
 * second owner; a persisted PC mastery is part of the PC's canonical current intrinsic state, never a rival writable
 * state. The qualitative marker is the one the Character Capability protocol already defines (`ComparativeMarkerSchema`,
 * reused unchanged): C/B/A/S, EX with a causal descriptor, or an explicit `null`.
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). There is no field in which a numeric
 * rank, XP, level, percentage, modifier, raw bodily property, equipment, temporary effectiveness, office/authority, KTI
 * state, observer belief/reputation, aggregate reference, body/entity reference, scope, constraint, lifecycle transfer,
 * deferred derivation, delegated branch, development/loss amendment or verbatim generation transcript could be placed
 * (WS-016 §3, §6, §19, §20, §22, §23, §32). Nothing here is a game rule or a calibration.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet and key spaces (IM-07). Technical encodings; the assignment itself is the sources'.
// ---------------------------------------------------------------------------------------------

/** The PC capability companion facet of the one I-002 PC owner (`pc_existence`). */
export const FACET_PC_CAPABILITY_PROFILE = "pc_capability_profile";

export const PC_OPERATION_PUBLISH_CAPABILITY_CLOSE = "pc-publish-capability-close";
/**
 * The PC owner operation that defines the lawful bounded prior of an existing actor's world-prior establishment (F-027-CD1
 * CDK-01 `owner_operation`: "the substantive owner operation that defined the lawful prior"). It names no sampler and no weight.
 */
export const PC_OPERATION_ESTABLISH_CAPABILITY_BASIS = "pc-establish-capability-basis";
/** The one genuine causal opportunity of an existing actor's capability establishment: the basis slot is create-only. */
export const PC_CAPABILITY_ESTABLISHMENT_OPPORTUNITY = "existing-actor-capability-establishment";
/**
 * The Close Basis name, exactly as F-016 Phase 2B PCC-02 declares it ("Close Basis name: PC Capability Close"). It is
 * deliberately not the F-014A actor-profile capability close: the source forbids borrowing that name by analogy.
 */
export const PC_CAPABILITY_CLOSE = "PC Capability Close";

/** The sealed, received pre-close record of one PC capability (the established fact as the PC owner received it). */
export const pcCapabilityBasisKey = (pcId: string, capabilityId: string): string =>
  `pc/${pcId}/capability-basis/${capabilityId}`;
/** The persisted PC capability, authoritative only from the PC Capability Close. */
export const pcCapabilityKey = (pcId: string, capabilityId: string): string =>
  `pc/${pcId}/capability/${capabilityId}`;

/**
 * The IM-02 stage whose commit IS the PC Capability Close of one PC/capability (RC-04). Its identity is derived from the
 * PC and the capability alone: a requested horizon, a source version, a retry, a consumer or a slice is not an identity
 * dimension, so any later transaction that declares the same stage reaches the same committed close.
 */
export const pcCapabilityStage = (pcId: string, capabilityId: string): StageKey => ({
  causal_process_id: `pc-capability/${pcId}/${capabilityId}`,
  owner_operation: { owner: OWNER_PC_EXISTENCE, operation: PC_OPERATION_PUBLISH_CAPABILITY_CLOSE },
  prospective_result_id: pcCapabilityKey(pcId, capabilityId),
});

/**
 * The stable causal identity of the one Causal Draw that may fix an existing actor's PC capability-basis slot (F-027-CD1
 * CDK-01, CD-CC-01), rooted in the PC capability-basis slot itself: the unresolved slot `pc/<pc>/capability-basis/<capability>`
 * is the prospective result. A request, retry, consequence, model/provider, narration, clock or partition is not a dimension,
 * so every re-presentation of the same establishment reaches the same draw. It is deliberately not the Named-Actor draw key of
 * the same identity: a predecessor Named-Actor draw is cold provenance and is never reused or re-opened here.
 */
export const pcCapabilityDrawKey = (pcId: string, capabilityId: string): CausalDrawKey => ({
  causal_process_id: `pc-capability/${pcId}/${capabilityId}`,
  opportunity_id: PC_CAPABILITY_ESTABLISHMENT_OPPORTUNITY,
  owner_operation: {
    owner: OWNER_PC_EXISTENCE,
    operation: PC_OPERATION_ESTABLISH_CAPABILITY_BASIS,
  },
  prospective_result_id: pcCapabilityBasisKey(pcId, capabilityId),
});

// ---------------------------------------------------------------------------------------------
// The received basis (WS-016 §4 PC persistence gate, §11 PC Generation / Authorship Interface).
// ---------------------------------------------------------------------------------------------

/**
 * The accepted, claim-bearing parts of a released Existence Contract (I-002 §4, §7: only PLAYER-AUTHORED and
 * SAFELY-INHERITED claims are intrinsic canon). A hypothesis or an unresolved item is not a claim and cannot ground a
 * capability (WS-016 §13: unaccepted, hypothetical or unmirrored content cannot ground derivation), so they have no
 * locator.
 */
export const PC_CLAIM_SECTIONS = [
  "identity_agency",
  "contact",
  "embodiment_topology",
  "continuity_rule",
  "baseline_exception.safely_inherited",
  "baseline_exception.player_overrides",
  "entry_envelope",
] as const;

/**
 * Locates one accepted claim of the pinned Existence Contract: a single-claim section is index 0; `contact` is its
 * surface list (or its NO_CONTACT statement at index 0); the baseline and envelope sections are list positions. It is a
 * pointer, never a copy (RC-02 guard): the claim's wording stays in the Existence Contract.
 */
export const PcClaimLocatorSchema = z.strictObject({
  section: z.enum(PC_CLAIM_SECTIONS),
  index: z.number().int().min(0),
});
export type PcClaimLocator = z.infer<typeof PcClaimLocatorSchema>;

/** The fresh-PC establishment: the capability is authored in, or strongly established by, the PC's accepted generation history. */
export const PC_ESTABLISHMENT_ACCEPTED_GENERATION_HISTORY = "ACCEPTED_GENERATION_HISTORY";
/**
 * The distinct inherited-mastery establishment of an already-existing actor that has lawfully undergone the
 * EXISTING_ACTOR_HANDOVER (PC-Control Handover Contract v1 "Existing Actor → PC"; Single Commit Point). It is never player
 * authored and never Character-Mirror-derived generation history, and it is not a resolution: it only carries the
 * actor's own already-authoritative `named_actor_capability` across the ownership cutover.
 */
export const PC_ESTABLISHMENT_EXISTING_ACTOR_CARRY_FORWARD = "EXISTING_ACTOR_CARRY_FORWARD";

/**
 * The fresh-PC establishment (unchanged): the capability is explicitly authored or strongly established by ACCEPTED
 * generation history (WS-016 §4 PC gate, first alternative; §11), as the claims of the released Existence Contract it is
 * pinned to. The record holds a pointer to that committed contract (at the version it was read) and locators of the
 * accepted claims that establish the mastery, and nothing else.
 */
export const PcAcceptedGenerationHistoryEstablishmentSchema = z
  .strictObject({
    method: z.literal(PC_ESTABLISHMENT_ACCEPTED_GENERATION_HISTORY),
    contract: z.strictObject({ fact_key: Id, version: Version.min(1) }),
    claims: z.array(PcClaimLocatorSchema).min(1),
  })
  .superRefine((e, ctx) => {
    const seen = new Set(e.claims.map((c) => `${c.section}#${c.index}`));
    if (seen.size !== e.claims.length) {
      ctx.addIssue({ code: "custom", message: "a claim is cited once", path: ["claims"] });
    }
  });
export type PcAcceptedGenerationHistoryEstablishment = z.infer<
  typeof PcAcceptedGenerationHistoryEstablishmentSchema
>;

/**
 * The inherited-mastery establishment: exact provenance references, never a copy and never a resolution. It cites
 *
 *  - `handover`: the committed Role Registry binding at `role-registry/binding/role.player_character` at the version
 *    read — the control/writability cutover (the binding's transition must be the EXISTING_ACTOR_HANDOVER of this same
 *    identity; its `ACTIVATION` is no basis); and
 *  - `source`: the same identity/capability's committed Named-Actor capability (`actor/<id>/capability/<capability>`) at
 *    the version read — the already-authoritative pre-handover fact, which stays exactly where it was committed as cold
 *    provenance/history.
 *
 * The marker is NOT carried in this record: the enclosing basis's marker must equal the source's marker exactly
 * (re-derived at admission and at load), so there is no reroll, world-prior, Causal Draw, accepted-Mirror derivation,
 * regrading or recalibration here. A mere `named_actor_capability_basis` is no source: the key is the capability's.
 */
export const PcExistingActorCarryForwardEstablishmentSchema = z.strictObject({
  method: z.literal(PC_ESTABLISHMENT_EXISTING_ACTOR_CARRY_FORWARD),
  handover: z.strictObject({
    fact_key: z.literal(PLAYER_CHARACTER_BINDING_KEY),
    version: Version.min(1),
  }),
  source: z.strictObject({ fact_key: Id, version: Version.min(1) }),
});
export type PcExistingActorCarryForwardEstablishment = z.infer<
  typeof PcExistingActorCarryForwardEstablishmentSchema
>;

/** The inherited-mastery establishment of a capability that was still unfixed when the actor was handed over, fixed by its causes. */
export const PC_ESTABLISHMENT_EXISTING_ACTOR_CAUSALLY_DETERMINED =
  "EXISTING_ACTOR_CAUSALLY_DETERMINED";
/** The same, where genuine uncertainty remained after the smallest established causes: fixed by a committed Causal Draw. */
export const PC_ESTABLISHMENT_EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED =
  "EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED";

/** The cutover basis every world-prior establishment cites: the committed EXISTING_ACTOR_HANDOVER binding at the version read. */
const HandoverPinSchema = z.strictObject({
  fact_key: z.literal(PLAYER_CHARACTER_BINDING_KEY),
  version: Version.min(1),
});

/** "The smallest relevant established causes" (WS-016 §16 step 1): pinned references, never copies, each cited once. */
const WorldPriorCausesSchema = z
  .array(CapabilityCauseSchema)
  .min(1)
  .superRefine((causes, ctx) => {
    const keys = causes.map((c) => c.fact_key);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({ code: "custom", message: "a cause is cited once" });
    }
  });

/**
 * The world-prior establishment of a capability that was UNRESOLVED when an existing actor was handed over (PC-Control
 * Handover Contract v1 "Existing Actor → PC" 2; I-002 v2.1 W3-CP3 existing-actor overlay; WS-016 §16 steps 1–2): on the later
 * material trigger, the smallest established world/actor causes sufficiently determine the capability. The record cites the
 * handover (the cutover; its `ACTIVATION` is no basis) and the causes, and nothing else: no prior, weight, seed or sample. The
 * marker is the enclosing basis's, as the owner's authored judgment over those causes (as for a causally determined
 * Named-Actor basis); the engine judges identity and provenance, never sufficiency. It is not the accepted-Mirror derivation
 * route and it is not a carry-forward: there was no authoritative capability to carry.
 */
export const PcExistingActorCausallyDeterminedEstablishmentSchema = z.strictObject({
  method: z.literal(PC_ESTABLISHMENT_EXISTING_ACTOR_CAUSALLY_DETERMINED),
  handover: HandoverPinSchema,
  causes: WorldPriorCausesSchema,
});
export type PcExistingActorCausallyDeterminedEstablishment = z.infer<
  typeof PcExistingActorCausallyDeterminedEstablishmentSchema
>;

/**
 * WS-016 §16 steps 3–4 for the same capability: genuine uncertainty remained, so the owner defined a branch-invariant bounded
 * prior and the simulation's existing lawful mechanism — the neutral Causal Draw — fixed the marker within it. The record
 * holds the handover, the causes the prior was computed from and a pointer to the committed draw result; no prior, weight,
 * seed, sample or probability is copied here, and the marker is exactly the owner's reading of the selected candidate.
 */
export const PcExistingActorBoundedPriorRandomizedEstablishmentSchema = z.strictObject({
  method: z.literal(PC_ESTABLISHMENT_EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED),
  handover: HandoverPinSchema,
  causes: WorldPriorCausesSchema,
  draw: CapabilityDrawReferenceSchema,
});
export type PcExistingActorBoundedPriorRandomizedEstablishment = z.infer<
  typeof PcExistingActorBoundedPriorRandomizedEstablishmentSchema
>;

/**
 * The two establishments every PC capability basis had before the existing-actor world-prior slice, byte-identical to what
 * they were: ACCEPTED_GENERATION_HISTORY (a freshly generated PC) and EXISTING_ACTOR_CARRY_FORWARD (an actor already handed
 * over carrying an already-authoritative capability).
 */
export const PcCapabilityHistoricalEstablishmentSchema = z.discriminatedUnion("method", [
  PcAcceptedGenerationHistoryEstablishmentSchema,
  PcExistingActorCarryForwardEstablishmentSchema,
]);

/**
 * The lawful establishments of a received PC capability basis, each its own method and provenance path:
 * ACCEPTED_GENERATION_HISTORY (a freshly generated PC), EXISTING_ACTOR_CARRY_FORWARD (an actor already handed over carrying an
 * already-authoritative capability) and the two existing-actor world-prior methods (a capability still unresolved at handover,
 * fixed on its later material trigger by the smallest established causes, or within a bounded prior by a committed Causal
 * Draw). The four never share a provenance path.
 *
 * Unrepresentable by design, so each fails closed on the strict schema: deferred or unresolved capability derivation by the
 * accepted-Mirror route (§13, §15 delegated branches), the C+/EX/deferred persistence gates, later development or loss
 * through the Intrinsic Amendment Event (§18), PC → non-PC transfer or resumption, lifecycle (§21–22).
 */
export const PcCapabilityEstablishmentSchema = z.discriminatedUnion("method", [
  PcAcceptedGenerationHistoryEstablishmentSchema,
  PcExistingActorCarryForwardEstablishmentSchema,
  PcExistingActorCausallyDeterminedEstablishmentSchema,
  PcExistingActorBoundedPriorRandomizedEstablishmentSchema,
]);
export type PcCapabilityEstablishment = z.infer<typeof PcCapabilityEstablishmentSchema>;

/**
 * The ONLY authored input of a carry-forward: which identity's already-authoritative capability is carried. Nothing else is
 * presentable — no marker, grade, prior, claim, version, binding or source reference: the marker, versions and provenance
 * references are mechanical, read from committed state, so there is nothing to resolve, reroll or regrade.
 */
export const PcCapabilityCarryForwardInputSchema = z.strictObject({
  pc_id: EntityId,
  capability_id: EntityId,
});
export type PcCapabilityCarryForwardInput = z.infer<typeof PcCapabilityCarryForwardInputSchema>;

/**
 * What the PC owner is told when a still-unresolved capability of an already-handed-over actor is materially required and the
 * smallest established causes sufficiently determine it (WS-016 §16 step 2): the identity, the capability, the pinned causes
 * and the owner's authored marker (a bare grade, EX with its descriptor, or `null` = ungraded). The handover reference and the
 * versions are mechanical; no grade is defaulted, and nothing is drawn.
 */
export const PcExistingActorEstablishmentInputSchema = z.strictObject({
  pc_id: EntityId,
  capability_id: EntityId,
  causes: WorldPriorCausesSchema,
  marker: ComparativeMarkerSchema.nullable(),
});
export type PcExistingActorEstablishmentInput = z.infer<
  typeof PcExistingActorEstablishmentInputSchema
>;

/**
 * What the PC owner decides before any draw (WS-016 §16 steps 3–4): that genuine uncertainty remains after the smallest
 * established causes (pinned here, and the exact inputs of the prior), and the branch-invariant bounded prior over the lawful
 * possibilities with their owner-authored relative integer weights. There is no default prior, no default grade and no
 * weighting formula: an absent, empty or singleton prior is refused by the Causal Draw gate, never filled in. The marker of
 * the resulting basis is not an input: it is whatever the draw selects.
 */
export const PcExistingActorRandomizedEstablishmentInputSchema = z.strictObject({
  pc_id: EntityId,
  capability_id: EntityId,
  causes: WorldPriorCausesSchema,
  prior: z.array(CapabilityPriorEntrySchema),
});
export type PcExistingActorRandomizedEstablishmentInput = z.infer<
  typeof PcExistingActorRandomizedEstablishmentInputSchema
>;

/**
 * The received, sealed record of one already-established PC capability, committed BEFORE any dependent consequence can
 * consume it. It is not the capability and is not readable cross-owner: the capability exists only at the PC Capability
 * Close (WS-016 §27.1). The PC is an agency identified by its Existence Contract identity (no body or entity reference
 * exists — WS-016 §28); the capability is the broad practiced faculty at the §8 transfer-test level of granularity.
 */
export const PcCapabilityBasisSchema = z.strictObject({
  pc_id: EntityId,
  capability_id: EntityId,
  marker: ComparativeMarkerSchema.nullable(),
  establishment: PcCapabilityEstablishmentSchema,
});
export type PcCapabilityBasis = z.infer<typeof PcCapabilityBasisSchema>;

/**
 * A PC capability basis as it could be written before the existing-actor world-prior slice: only the two predecessor
 * establishments. It is the one class of value the superseded governing-rule citation of the PC capability kinds may still be
 * carried by on load (see `FactKind.legacyRule`); it authorizes nothing new.
 */
export const PcCapabilityBasisHistoricalSchema = z.strictObject({
  pc_id: EntityId,
  capability_id: EntityId,
  marker: ComparativeMarkerSchema.nullable(),
  establishment: PcCapabilityHistoricalEstablishmentSchema,
});

// ---------------------------------------------------------------------------------------------
// The persisted capability (WS-016 §3 minimal record) — owner pc_existence / facet pc_capability_profile.
// ---------------------------------------------------------------------------------------------

/**
 * The minimal persistent PC capability record: the capability, its optional comparative marker, a provenance pointer to
 * its pinned basis and the capability-close reference (required here because the fact is always consumed cross-owner,
 * WS-016 §3). It holds NO current fatigue, injury, equipment, observer reputation, KTI corpus, office, relationship or
 * situational advantage, and no number of any kind.
 */
export const PcCapabilitySchema = z.strictObject({
  pc_id: EntityId,
  capability_id: EntityId,
  marker: ComparativeMarkerSchema.nullable(),
  basis: z.strictObject({ fact_key: Id, version: Version.min(1) }),
  close: z.strictObject({
    name: z.literal(PC_CAPABILITY_CLOSE),
    stage: StageKeySchema,
  }),
});
export type PcCapability = z.infer<typeof PcCapabilitySchema>;
