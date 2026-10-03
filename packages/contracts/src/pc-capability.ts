import { z } from "zod";
import { ComparativeMarkerSchema } from "./actor-capability.ts";
import { Id, Version } from "./ids.ts";
import type { StageKey } from "./temporal.ts";
import { StageKeySchema } from "./temporal.ts";
import { EntityId, OWNER_PC_EXISTENCE } from "./world-foundation.ts";

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

/**
 * The only establishment this slice can receive: the capability is explicitly authored or strongly established by
 * ACCEPTED generation history (WS-016 §4 PC gate, first alternative; §11), as the claims of the released Existence
 * Contract it is pinned to. The record holds a pointer to that committed contract (at the version it was read) and
 * locators of the accepted claims that establish the mastery, and nothing else.
 *
 * Unrepresentable by design, so each fails closed on the strict schema: deferred derivation from verbatim generation
 * provenance (§13, §15 delegated branches), the C+/EX/deferred persistence gates, later development or loss through
 * the Intrinsic Amendment Event (§18), existing-actor handover (W3-CP3), transfer, lifecycle (§21–22) and any randomized
 * or Causal-Draw capability.
 */
export const PcCapabilityEstablishmentSchema = z
  .strictObject({
    method: z.literal("ACCEPTED_GENERATION_HISTORY"),
    contract: z.strictObject({ fact_key: Id, version: Version.min(1) }),
    claims: z.array(PcClaimLocatorSchema).min(1),
  })
  .superRefine((e, ctx) => {
    const seen = new Set(e.claims.map((c) => `${c.section}#${c.index}`));
    if (seen.size !== e.claims.length) {
      ctx.addIssue({ code: "custom", message: "a claim is cited once", path: ["claims"] });
    }
  });
export type PcCapabilityEstablishment = z.infer<typeof PcCapabilityEstablishmentSchema>;

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
