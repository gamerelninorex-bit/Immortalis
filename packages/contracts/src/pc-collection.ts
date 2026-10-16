import { z } from "zod";
import { Id, Sha256, Version } from "./ids.ts";
import { PcClaimLocatorSchema } from "./pc-capability.ts";
import { PositiveQuantitySchema, ProductionRequestSchema } from "./production.ts";
import { CanonicalTimeSchema } from "./temporal.ts";
import { EntityId, OWNER_PC_EXISTENCE, PLAYER_CHOICE_AUTHORITY, Text } from "./world-foundation.ts";

/**
 * CPAA-C1 v0.2 — consequential active-PC action: bounded direct collection from a finite source — PROVISIONAL executable contracts.
 *
 * STATUS: PROVISIONAL CANDIDATE LOWERING. The governing candidate is the BLUE report "CPAA-C1 v0.2 — RED MODIFY R-1–R-7 Bounded
 * Repair" (native pin 2026-10-16T00:31:39.142Z), constructed under the Sovereign's non-final execution direction (native pin
 * 2026-10-16T01:38:29.022Z). C1, P-1 and P-2 are NOT ratified, NOT a spec-lock pin and NOT adopted design authority: the existence of
 * this code gives them none. Every kind below is tagged `CPAA_C1_PROVISIONAL` in its governing rule, so a later ratification, a
 * correction or a withdrawal is a visible, bounded change. Nothing here generalises beyond the closed class of C1: one active
 * stationary PC, directly collecting a finite amount of one loose same-form material from its own current locus into an already
 * existing local Production Reserve, with no transformation, travel, external labor, specialist work or unresolved rights prerequisite.
 * The names `pc_existence` / `pc_voluntary_commitment` are non-normative technical lowering names, not the authority, and this is not
 * a precedent for any other non-movement action (an action needs its own ruling).
 *
 * What the PLAYER authors is willingness only (C2): the commitment-of-record asserts no feasibility, capability, right, duration,
 * arrival, extraction, possession or success, and the strict schemas have no field in which any of them could be stated. Every other
 * fact is owned elsewhere:
 *   PC-side (C1, `pc_existence`)  — the commitment-of-record and the Production Request mechanically derived from it (C3); and
 *                                   the PROVISIONAL P-1 intrinsic exact-cycle mechanism carrier (C6), which only follows
 *                                   already-authored, accepted intrinsic content.
 *   Referee (`role.gm`)           — the provenance-pinned physical-reach judgment (C5): host-interpreted, quote-anchored, with the
 *                                   verdict DERIVED by the engine from the validated answer and never read from it.
 *   Population (PROVISIONAL P-2)  — the registration of the one active PC's individual occupied work interval (C5): not a cohort,
 *                                   not labor, not willingness.
 *   Production (C4)               — the work record that derives cycles, causal duration and the earned boundary from the owners'
 *                                   premises; the existing extraction, Source Delta and Reserve inflow stay Production's;
 *   World-State                   — the finite source truth and its net depletion (existing).
 */

export const CPAA_C1_PROVISIONAL =
  "CPAA-C1 v0.2 PROVISIONAL CANDIDATE LOWERING (BLUE candidate pin 2026-10-16T00:31:39.142Z; Sovereign non-final execution direction pin 2026-10-16T01:38:29.022Z): not ratified, not adopted design authority, not a spec-lock pin";

// ---------------------------------------------------------------------------------------------
// Owners, facets and key spaces. Technical encodings; the assignments are the candidate's.
// ---------------------------------------------------------------------------------------------

/** The PC-side holder of the P-1 intrinsic mechanism carrier (a facet of the one existing PC owner). */
export const FACET_PC_COLLECTION_MECHANISM = "pc_collection_mechanism";
/** Population's registration of one active PC's individual occupied interval (PROVISIONAL P-2). */
export const FACET_POPULATION_PC_OCCUPANCY = "population_pc_occupancy";

export const pcCollectionCommitmentKey = (pcId: string, actId: string): string =>
  `pc/${pcId}/collection/${actId}/commitment`;
export const pcCollectionRequestKey = (pcId: string, actId: string): string =>
  `pc/${pcId}/collection/${actId}/request`;
export const pcCollectionMechanismKey = (pcId: string, mechanismId: string): string =>
  `pc/${pcId}/collection-mechanism/${mechanismId}`;
export const pcCollectionReachKey = (pcId: string, actId: string): string =>
  `referee/pc-collection-reach/${pcId}/${actId}`;
/** ONE occupancy slot per PC identity: the PC's current (or last) occupied interval. */
export const popPcOccupancyKey = (pcId: string): string => `population-pc/${pcId}/occupancy`;
export const productionPcCollectionWorkKey = (extractionId: string): string =>
  `production/pc-collection-work/${extractionId}`;

/**
 * Identities derived from the PC identity and the per-act identity the trusted confirmation retained (RC-16, CAL-07). The act
 * identity is supplied by the trusted confirmation side before the first write; the engine derives every downstream identity from
 * it and never from a clock, counter or random value. The Production Request identity IS the extraction identity.
 */
export const pcCollectionCommitmentId = (pcId: string, actId: string): string =>
  `pc-collect-commitment:${pcId}:${actId}`;
export const pcCollectionRequestId = (pcId: string, actId: string): string =>
  `pc-collect:${pcId}:${actId}`;

/** True for a key in the PC-owned collection request key space (any PC, any act). */
export const PC_COLLECTION_REQUEST_KEY = /^pc\/([^/]+)\/collection\/([^/]+)\/request$/;
export const PC_COLLECTION_COMMITMENT_KEY = /^pc\/([^/]+)\/collection\/([^/]+)\/commitment$/;

export const PC_COLLECTION_INTENT_KIND = "VOLUNTARY_DIRECT_COLLECTION";

const AuthoredUnder = z.strictObject({
  role: z.literal(PLAYER_CHOICE_AUTHORITY.role),
  permission: z.literal(PLAYER_CHOICE_AUTHORITY.permission),
});

const Pin = z.strictObject({ fact_key: Id, version: Version.min(1) });
export type PcCollectionPin = z.infer<typeof Pin>;

// ---------------------------------------------------------------------------------------------
// C2/C3 — the player's commitment-of-record and the PC-owned Production Request derived from it.
// ---------------------------------------------------------------------------------------------

/** What a confirmed choice names: identities, one exact amount and the authored authority only. Everything else is read from committed state. */
export const PcCollectionCommitInputSchema = z.strictObject({
  pc_id: EntityId,
  /** the immutable act identity the trusted confirmation retained before the first write */
  act_id: EntityId,
  source: z.strictObject({ world_id: EntityId, source_key: EntityId }),
  reserve_id: EntityId,
  quantity: PositiveQuantitySchema,
  authored_under: AuthoredUnder,
});
export type PcCollectionCommitInput = z.infer<typeof PcCollectionCommitInputSchema>;

export const PcCollectionCommitmentSchema = z.strictObject({
  commitment_id: EntityId,
  pc_id: EntityId,
  act_id: EntityId,
  /** the player's authored commitment: role.player + permission.player_choice.commit, supplied and never defaulted */
  authored_under: AuthoredUnder,
  /** willingness to ATTEMPT one direct collection: never a result, a feasibility, a duration or a possession */
  intent: z.strictObject({
    kind: z.literal(PC_COLLECTION_INTENT_KIND),
    source: z.strictObject({ fact_key: Id, source_key: EntityId, world_id: EntityId }),
    material_class: Id,
    quantity: PositiveQuantitySchema,
    destination: z.strictObject({ fact_key: Id, reserve_id: EntityId }),
  }),
  /** the exact committed versions this commitment was authored against; a stale or forged commitment fails admission */
  basis: z.strictObject({
    pinned_versions: z.strictObject({
      pc: Version.min(1),
      binding: Version.min(1),
      custody: Version.min(1),
      source: Version.min(1),
      reserve: Version.min(1),
    }),
  }),
  committer: z.strictObject({
    owner: z.literal(OWNER_PC_EXISTENCE),
    facet: z.literal("pc_voluntary_commitment"),
  }),
});
export type PcCollectionCommitment = z.infer<typeof PcCollectionCommitmentSchema>;

/** The PC-owned request is exactly the existing WS-003 §13A envelope. */
export const PcCollectionRequestSchema = ProductionRequestSchema;

// ---------------------------------------------------------------------------------------------
// C6 / PROVISIONAL P-1 — the intrinsic exact-cycle mechanism carrier (PC-side, intrinsic, sealed).
// ---------------------------------------------------------------------------------------------

const PositiveDuration = CanonicalTimeSchema.refine((d) => d.value > 0, "a duration is positive");

/**
 * The typed, owner-pinned projection of an ALREADY AUTHORED and ACCEPTED intrinsic mechanism of the PC (I-002 §8 exact rate when
 * explicitly authored and timing requires it; §19 the PC-local capability that supplies the causal bridge): its identity, the one
 * same-form handling cycle and its duration in the campaign's canonical unit, and what the mechanism can pass. It follows accepted
 * claims of the PC's own released Existence Contract by locator (never copied wording); a prose capability mention, a fixture
 * rate or an operator number is not this carrier. It adds no capacity, skill, speed or balance table: τ is whatever the authored
 * content established, and no value is adopted by this contract.
 *
 * `interaction_floor` is the resolved relationship to Temporal F-014B §11's consequential-interaction floor (C6): NOT_APPLICABLE
 * (with its stated ground), APPLIES (with the authored minimum, which the earned completion must also satisfy) or UNRESOLVED, in
 * which case an EXACT completion is withheld.
 */
export const PcCollectionMechanismSchema = z.strictObject({
  mechanism_id: EntityId,
  pc_id: EntityId,
  authored_from: z.strictObject({
    contract: Pin,
    claims: z.array(PcClaimLocatorSchema).min(1),
  }),
  actuator: z.strictObject({ statement: Text }),
  /** what this mechanism can and cannot pass or bypass, as authored: interpreted against the source's stated path facts, never encoded as a vocabulary */
  traversal: z.strictObject({ statement: Text }),
  cycle: z.strictObject({
    kind: z.literal("SERIAL_PER_UNIT"),
    units_per_cycle: z.literal(1),
    duration: PositiveDuration,
  }),
  interaction_floor: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("NOT_APPLICABLE"), ground: Text }),
    z.strictObject({ status: z.literal("APPLIES"), minimum: PositiveDuration }),
    z.strictObject({ status: z.literal("UNRESOLVED") }),
  ]),
  committer: z.strictObject({
    owner: z.literal(OWNER_PC_EXISTENCE),
    facet: z.literal(FACET_PC_COLLECTION_MECHANISM),
  }),
});
export type PcCollectionMechanism = z.infer<typeof PcCollectionMechanismSchema>;

export const EstablishPcCollectionMechanismInputSchema = z.strictObject({
  pc_id: EntityId,
  mechanism_id: EntityId,
  claims: z.array(PcClaimLocatorSchema).min(1),
  actuator: z.strictObject({ statement: Text }),
  traversal: z.strictObject({ statement: Text }),
  cycle_duration: PositiveDuration,
  interaction_floor: PcCollectionMechanismSchema.shape.interaction_floor,
});
export type EstablishPcCollectionMechanismInput = z.infer<
  typeof EstablishPcCollectionMechanismInputSchema
>;

// ---------------------------------------------------------------------------------------------
// C5 — the physical-reach judgment (`role.gm` + `permission.rule.adjudicate`): host-interpreted, engine-derived verdict.
// ---------------------------------------------------------------------------------------------

export const PC_REACH_PATH_READINGS = ["OPEN", "CLOSED"] as const;
export const PC_REACH_MECHANISM_READINGS = [
  "ABLE_TO_PASS",
  "UNABLE_TO_PASS",
  "NOT_AT_ISSUE",
] as const;
export const PC_REACH_VERDICTS = ["REACHABLE", "NOT_REACHABLE"] as const;

/**
 * The bounded task a host interprets: the already established premises of ONE attempt, delivered as committed wording (the source
 * owner's stated access facts, the PC owner's stated mechanism). The task creates no obstacle, capability, consent or result.
 */
export const PcCollectionReachTaskSchema = z.strictObject({
  pc_id: EntityId,
  act_id: EntityId,
  source: z.strictObject({
    fact_key: Id,
    access_facts: z.array(z.strictObject({ aspect: Id, statement: Text })),
  }),
  mechanism: z.strictObject({
    fact_key: Id,
    version: Version.min(1),
    traversal: Text,
    actuator: Text,
  }),
  digest: Sha256,
});
export type PcCollectionReachTask = z.infer<typeof PcCollectionReachTaskSchema>;

/** A host's UNTRUSTED answer. It carries no canon, no role, no permission and no verdict: only readings anchored to verbatim quotations. */
export const PcCollectionReachAnswerSchema = z.strictObject({
  task_digest: Sha256,
  path: z.strictObject({
    reading: z.enum(PC_REACH_PATH_READINGS),
    grounds: z.array(Text).min(1),
  }),
  mechanism: z.strictObject({
    reading: z.enum(PC_REACH_MECHANISM_READINGS),
    grounds: z.array(Text),
  }),
});
export type PcCollectionReachAnswer = z.infer<typeof PcCollectionReachAnswerSchema>;

export const PcCollectionReachDecisionSchema = z.strictObject({
  pc_id: EntityId,
  act_id: EntityId,
  task: z.strictObject({
    digest: Sha256,
    source: Pin,
    /** the digest of the source's stated access facts the answer interpreted; a changed path fact makes the decision stale */
    access_facts_digest: Sha256,
    mechanism: Pin,
    commitment: Pin,
  }),
  answer: PcCollectionReachAnswerSchema,
  verdict: z.enum(PC_REACH_VERDICTS),
  authority: z.strictObject({
    role: z.literal("role.gm"),
    permission: z.literal("permission.rule.adjudicate"),
  }),
});
export type PcCollectionReachDecision = z.infer<typeof PcCollectionReachDecisionSchema>;

// ---------------------------------------------------------------------------------------------
// C5 / PROVISIONAL P-2 — Population's registration of one active PC's individual occupied work interval.
// ---------------------------------------------------------------------------------------------

export const PC_OCCUPANCY_OPEN = "OPEN";
export const PC_OCCUPANCY_RELEASED_DENIED = "RELEASED_DENIED";

/**
 * ONE slot per PC identity (the PC's current or last occupied interval, advancing along its expected-version chain). It is not an
 * Occupational Cohort, not Effective Labor Supply and not a labor token; it debits and credits no aggregate workforce. It does not
 * decide the PC's willingness and it never exceeds the interval the commitment and the PC's mechanism determine. A registration is
 * released either by a lawful denial (no extraction was admitted for the act) or, with no write, by the work's close (the Reserve
 * inflow credited): see `pcOccupancyState`.
 */
export const PopulationPcOccupancySchema = z.strictObject({
  pc_id: EntityId,
  act_id: EntityId,
  status: z.enum([PC_OCCUPANCY_OPEN, PC_OCCUPANCY_RELEASED_DENIED]),
  interval: z.strictObject({ from: CanonicalTimeSchema, to: CanonicalTimeSchema }),
  commitment: Pin,
  mechanism: Pin,
  committer: z.strictObject({
    owner: z.literal("population"),
    facet: z.literal(FACET_POPULATION_PC_OCCUPANCY),
  }),
});
export type PopulationPcOccupancy = z.infer<typeof PopulationPcOccupancySchema>;

// ---------------------------------------------------------------------------------------------
// C4/C6 — Production's work record: the cycles, causal duration and earned boundary DERIVED from the owners' premises.
// ---------------------------------------------------------------------------------------------

export const ProductionPcCollectionWorkSchema = z.strictObject({
  work_id: EntityId,
  pc_id: EntityId,
  act_id: EntityId,
  pins: z.strictObject({
    commitment: Pin,
    request: Pin,
    mechanism: Pin,
    reach: Pin,
    occupancy: Pin,
    binding: Version.min(1),
    custody: Version.min(1),
  }),
  derivation: z.strictObject({
    cycles: z.number().int().positive(),
    per_cycle: PositiveDuration,
    causal_duration: PositiveDuration,
    floor_minimum: PositiveDuration.nullable(),
    started_at: CanonicalTimeSchema,
    completes_at: CanonicalTimeSchema,
  }),
});
export type ProductionPcCollectionWork = z.infer<typeof ProductionPcCollectionWorkSchema>;
