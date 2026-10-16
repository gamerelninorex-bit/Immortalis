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
/** v0.3 F-2: the versioned owner-authored semantic attestation of the PC's serial handling cycle (one per mechanism). */
export const pcCollectionAttestationKey = (pcId: string, mechanismId: string): string =>
  `pc/${pcId}/collection-attestation/${mechanismId}`;
export const pcCollectionAttestationId = (pcId: string, mechanismId: string): string =>
  `pc-collect-attestation:${pcId}:${mechanismId}`;
/** v0.3 F-3: Population's determination of one PC's representation relation to its effective aggregate workforce (one per PC). */
export const popPcRepresentationKey = (pcId: string): string =>
  `population-pc/${pcId}/representation`;
/** D-1 (PROVISIONAL): the PC-side request to cease the SAME in-flight collection: one per act, create-only. */
export const pcCollectionCessationKey = (pcId: string, actId: string): string =>
  `pc/${pcId}/collection/${actId}/cessation`;
export const pcCollectionMechanismKey = (pcId: string, mechanismId: string): string =>
  `pc/${pcId}/collection-mechanism/${mechanismId}`;
export const pcCollectionReachKey = (pcId: string, actId: string): string =>
  `referee/pc-collection-reach/${pcId}/${actId}`;
/** ONE occupancy slot per PC identity: the PC's current (or last) occupied interval. */
export const popPcOccupancyKey = (pcId: string): string => `population-pc/${pcId}/occupancy`;
export const productionPcCollectionWorkKey = (extractionId: string): string =>
  `production/pc-collection-work/${extractionId}`;
/** D-1 (PROVISIONAL): Production's terminal disposition of an in-flight collection the PC withdrew from: one per extraction, create-only. */
export const productionPcCollectionTerminationKey = (extractionId: string): string =>
  `production/pc-collection-termination/${extractionId}`;

/**
 * Identities derived from the PC identity and the per-act identity the trusted confirmation retained (RC-16, CAL-07). The act
 * identity is supplied by the trusted confirmation side before the first write; the engine derives every downstream identity from
 * it and never from a clock, counter or random value. The Production Request identity IS the extraction identity.
 */
export const pcCollectionCommitmentId = (pcId: string, actId: string): string =>
  `pc-collect-commitment:${pcId}:${actId}`;
export const pcCollectionRequestId = (pcId: string, actId: string): string =>
  `pc-collect:${pcId}:${actId}`;

/** The cessation identity: derived from the PC and the act the confirmation retained; never a clock, counter or random value. */
export const pcCollectionCessationId = (pcId: string, actId: string): string =>
  `pc-collect-cessation:${pcId}:${actId}`;

/** True for a key in the PC-owned collection request key space (any PC, any act). */
export const PC_COLLECTION_REQUEST_KEY = /^pc\/([^/]+)\/collection\/([^/]+)\/request$/;
export const PC_COLLECTION_COMMITMENT_KEY = /^pc\/([^/]+)\/collection\/([^/]+)\/commitment$/;
export const PC_COLLECTION_CESSATION_KEY = /^pc\/([^/]+)\/collection\/([^/]+)\/cessation$/;

export const PC_COLLECTION_INTENT_KIND = "VOLUNTARY_DIRECT_COLLECTION";
export const PC_COLLECTION_CESSATION_INTENT_KIND = "VOLUNTARY_CESSATION_OF_COLLECTION";
/** D-1 (PROVISIONAL): Production's one terminal disposition of a withdrawn in-flight collection. */
export const PC_COLLECTION_TERMINATION_DISPOSITION = "WITHDRAWN_BEFORE_EARNED_BOUNDARY";

/**
 * BLUE clause D-1 — PC Collection Voluntary Cessation — PROVISIONAL CANDIDATE LOWERING (BLUE disposition "PC Cycle & In-Flight
 * Exit", native pin 2026-10-16T04:43:59.946Z, a PROPOSAL; Sovereign construction-approved non-final handoff on PR #72, comment
 * 6208352198). NOT adopted, NOT ratified, NOT a source-lock amendment: the existence of this code gives it no authority. Every fact
 * it adds carries a governing rule tagged `provisional-candidate-lowering-pending-ratification`.
 */
export const CPAA_C1_D1_PROVISIONAL =
  "BLUE clause D-1 (PC Collection Voluntary Cessation) PROVISIONAL CANDIDATE LOWERING (BLUE disposition pin 2026-10-16T04:43:59.946Z; Sovereign construction-approved non-final handoff, PR #72 comment 6208352198): proposed, not adopted, not ratified, not a source-lock amendment";

/**
 * PROVISIONAL reading of F-014B §11 for the closed class (see the mechanism comment): solitary direct handling involves no
 * consequential interaction, so there is no context-banded floor to apply. Derived by the engine, never authored or declared.
 */
export const PC_COLLECTION_INTERACTION_FLOOR = "NOT_APPLICABLE_SOLITARY_DIRECT_HANDLING";

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
    /**
     * v0.3 F-2 (effective before the act): the PC's mechanism and the OWNER-QUALIFIED semantic attestation of its serial cycle this
     * act rests on, both committed before the commitment. A commitment without them states no exact cycle and no exact completion follows.
     */
    cycle: z.strictObject({ mechanism: Pin, attestation: Pin }),
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
 * same-form handling cycle and its duration in the campaign's canonical unit, and what the mechanism can pass. It FOLLOWS accepted
 * claims of the PC's own released Existence Contract by locator, and every statement it carries is a VERBATIM QUOTATION of one of
 * those cited claims (never invented wording): the actuator and the traversal statements, and `cycle.authored_quote`, the exact
 * authored words that state the cycle. The quotation must contain the cycle's exact numeral and its canonical time unit, so τ is a
 * number the PC's accepted authored content itself states, not one a caller chose; a mechanism whose wording does not state it
 * cannot be established, and no exact completion follows. This is TEXTUAL grounding (a mechanical check that the authored words
 * say exactly this number in this unit), not a semantic proof that the words mean "one handling cycle": no installed rule can
 * judge that. It adds no capacity, skill, speed or balance table: τ is whatever the authored content established, and no value is
 * adopted by this contract.
 *
 * There is NO authored F-014B §11 field. §11's context-banded floor governs a consequential INTERACTION (actor presence, a
 * co-present scene, conversation); the closed class has no counterpart actor, so §11 does not apply by the class's own definition
 * and the engine DERIVES that determination (`PC_COLLECTION_INTERACTION_FLOOR`): no source supplies a numeric band, so a caller
 * could only invent a minimum, and none is representable.
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
    /** the verbatim words of a cited accepted claim that state this exact cycle (numeral and canonical unit included) */
    authored_quote: Text,
  }),
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
  /** the verbatim words of a cited accepted claim that state the exact cycle */
  cycle_quote: Text,
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
 * v0.3 F-1 — the solitary material-handling class. The host's reading of the OWNER-established scene evidence; the engine derives the
 * verdict. `NO_CO_PRESENT_CONSEQUENTIAL_INTERACTION` is never a default and never a player or model `solitary=true` assertion: it needs
 * the engine-built evidence below (no evidence → no task → WITHHELD) and quoted grounds.
 */
export const PC_SCENE_READINGS = [
  "NO_CO_PRESENT_CONSEQUENTIAL_INTERACTION",
  "CO_PRESENT_CONSEQUENTIAL_INTERACTION",
  "NOT_ESTABLISHED",
] as const;
export const PC_SCENE_VERDICT_ESTABLISHED = "SOLITARY_CLASS_ESTABLISHED";
export const PC_SCENE_VERDICTS = [
  PC_SCENE_VERDICT_ESTABLISHED,
  "ENGAGED_NOT_SOLITARY",
  "WITHHELD",
] as const;

/**
 * The scene evidence the owners hold, delivered verbatim and pinned: the committed world and locus wording and the Population
 * ledgers that attach to this very locus (each unit's identity and presence are Population's own facts). `presence_here` is the
 * mechanical list of OTHER units whose Population presence is this locus. The digest changes whenever any of it changes, so a changed
 * scene re-opens the question before the act can close (the occupied interval).
 */
export const PcCollectionSceneEvidenceSchema = z.strictObject({
  world: Pin,
  locus: Pin,
  statements: z.array(Text).min(1),
  ledgers: z.array(Pin).min(1),
  presence_here: z.array(z.strictObject({ unit_id: EntityId, statement: Text })),
  digest: Sha256,
});
export type PcCollectionSceneEvidence = z.infer<typeof PcCollectionSceneEvidenceSchema>;

/**
 * The bounded task a host interprets: the already established premises of ONE attempt, delivered as committed wording (the source
 * owner's stated access facts, the PC owner's stated mechanism, the owners' scene evidence). The task creates no obstacle,
 * capability, consent or result.
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
  scene: PcCollectionSceneEvidenceSchema,
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
  scene: z.strictObject({
    reading: z.enum(PC_SCENE_READINGS),
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
  /** the scene evidence the answer interpreted, exactly as delivered: a changed scene makes the solitary class unestablished again */
  scene_evidence: PcCollectionSceneEvidenceSchema,
  answer: PcCollectionReachAnswerSchema,
  verdict: z.enum(PC_REACH_VERDICTS),
  /** v0.3 F-1: derived by the engine from the validated scene answer and the evidence; never read from the answer */
  scene_verdict: z.enum(PC_SCENE_VERDICTS),
  authority: z.strictObject({
    role: z.literal("role.gm"),
    permission: z.literal("permission.rule.adjudicate"),
  }),
});
export type PcCollectionReachDecision = z.infer<typeof PcCollectionReachDecisionSchema>;

// ---------------------------------------------------------------------------------------------
// v0.3 F-2 — P-1 semantic attestation of the PC's serial handling cycle (I-002 §5 Capability/Effect Module + Temporal Hook).
// ---------------------------------------------------------------------------------------------

export const PC_CYCLE_READINGS = [
  "ONE_SAME_FORM_UNIT_ONE_SERIAL_CYCLE",
  "NOT_ONE_UNIT_ONE_SERIAL_CYCLE",
  "NOT_ESTABLISHED",
] as const;
export const PC_CYCLE_MEANING =
  "ONE_SAME_FORM_UNIT_HANDLED_BY_THE_NAMED_ACTUATOR_IN_ONE_SERIAL_CYCLE";

/**
 * The bounded task the PC-intrinsic compiler/adjudicator (`role.gm`, I-002 declared) interprets: the cited accepted claims'
 * wording exactly as committed, the mechanism's actuator and its stated cycle. An INTERPRETATION of PC-intrinsic meaning only: it
 * judges nothing of the physical source, its access, rights or success.
 */
export const PcCollectionCycleTaskSchema = z.strictObject({
  pc_id: EntityId,
  mechanism: Pin,
  claims: z.array(z.strictObject({ locator: PcClaimLocatorSchema, statement: Text })).min(1),
  actuator: Text,
  cycle: CanonicalTimeSchema,
  digest: Sha256,
});
export type PcCollectionCycleTask = z.infer<typeof PcCollectionCycleTaskSchema>;

/** The host's UNTRUSTED reading: no verdict, role or permission; every ground a verbatim quotation of the delivered claim wording. */
export const PcCollectionCycleAnswerSchema = z.strictObject({
  task_digest: Sha256,
  reading: z.enum(PC_CYCLE_READINGS),
  actuator_ground: Text,
  cycle_ground: Text,
  grounds: z.array(Text),
});
export type PcCollectionCycleAnswer = z.infer<typeof PcCollectionCycleAnswerSchema>;

/**
 * The versioned owner-authored attestation (the I-002 owner's record, written by `role.archivist` + `permission.canon.write` after the
 * `role.gm` interpretation validated): it retains the attestor role, the claim and mechanism versions, the accepted meaning, the
 * operative Temporal Hook and the canonical time from which it is effective. An accepted claim without it cannot ground an exact
 * cycle. It is created once per mechanism and never amended retroactively: a commitment pins it, so it is effective BEFORE the act.
 */
export const PcCollectionCycleAttestationSchema = z.strictObject({
  attestation_id: EntityId,
  pc_id: EntityId,
  mechanism: Pin,
  contract: Pin,
  claims: z.array(PcClaimLocatorSchema).min(1),
  attestor: z.strictObject({
    role: z.literal("role.gm"),
    permission: z.literal("permission.rule.adjudicate"),
  }),
  meaning: z.literal(PC_CYCLE_MEANING),
  actuator_ground: Text,
  cycle_ground: Text,
  grounds: z.array(Text),
  /** the operative, versioned Temporal Hook: the one serial cycle's duration in the canonical unit (Temporal keeps unit authority) */
  temporal_hook: z.strictObject({
    hook_id: EntityId,
    version: z.literal(1),
    operation: z.literal("serial-handling-cycle"),
    per_cycle: CanonicalTimeSchema.refine((d) => d.value > 0, "a cycle duration is positive"),
  }),
  effective_from: CanonicalTimeSchema,
  task_digest: Sha256,
  committer: z.strictObject({
    owner: z.literal(OWNER_PC_EXISTENCE),
    facet: z.literal(FACET_PC_COLLECTION_MECHANISM),
  }),
});
export type PcCollectionCycleAttestation = z.infer<typeof PcCollectionCycleAttestationSchema>;

// ---------------------------------------------------------------------------------------------
// v0.3 F-3 — Population's determination of the PC's relation to its effective aggregate workforce.
// ---------------------------------------------------------------------------------------------

export const PC_REPRESENTATION_OUTSIDE = "OUTSIDE_AGGREGATE";
export const PC_REPRESENTATION_INCLUDED = "INCLUDED";
export const PC_REPRESENTATION_UNKNOWN = "UNKNOWN";

/**
 * Population's own determination (never a caller's statement or the PC's binding): the PC is `INCLUDED` when any committed ledger
 * counts a unit with its identity; `OUTSIDE_AGGREGATE` only when the independent owners separately prove the PC outside the effective
 * aggregate workforce (a ledger proves the counted members of its own disjoint resident population, so an omitted identity proves
 * nothing); otherwise `UNKNOWN`. Only OUTSIDE proceeds on individual occupancy alone; INCLUDED and UNKNOWN WITHHOLD. It carries no
 * layer tag, no headcount, no cohort, no flexible-labor debit, no labor token.
 */
export const PopulationPcRepresentationSchema = z.strictObject({
  pc_id: EntityId,
  status: z.enum([
    PC_REPRESENTATION_OUTSIDE,
    PC_REPRESENTATION_INCLUDED,
    PC_REPRESENTATION_UNKNOWN,
  ]),
  locality: z.strictObject({ world_id: EntityId, locus_id: EntityId }),
  ledgers: z.array(Pin),
  determined_at: CanonicalTimeSchema,
  committer: z.strictObject({
    owner: z.literal("population"),
    facet: z.literal(FACET_POPULATION_PC_OCCUPANCY),
  }),
});
export type PopulationPcRepresentation = z.infer<typeof PopulationPcRepresentationSchema>;

// ---------------------------------------------------------------------------------------------
// C5 / PROVISIONAL P-2 — Population's registration of one active PC's individual occupied work interval.
// ---------------------------------------------------------------------------------------------

export const PC_OCCUPANCY_OPEN = "OPEN";
export const PC_OCCUPANCY_RELEASED_DENIED = "RELEASED_DENIED";
/** D-1 (PROVISIONAL): released after Production committed the lawful termination of the withdrawn in-flight work (never before it). */
export const PC_OCCUPANCY_RELEASED_TERMINATED = "RELEASED_TERMINATED";

/**
 * ONE slot per PC identity (the PC's current or last occupied interval, advancing along its expected-version chain). It is not an
 * Occupational Cohort, not Effective Labor Supply and not a labor token; it debits and credits no aggregate workforce. It does not
 * decide the PC's willingness and it never exceeds the interval the commitment and the PC's mechanism determine. A registration is
 * released by a lawful denial (no extraction was admitted for the act), with no write by the work's close (the Reserve inflow
 * credited), or — D-1, PROVISIONAL — by `RELEASED_TERMINATED` only after Production committed the lawful termination of work the
 * PC withdrew from: see `pcOccupancyState`.
 */
export const PopulationPcOccupancySchema = z.strictObject({
  pc_id: EntityId,
  act_id: EntityId,
  status: z.enum([
    PC_OCCUPANCY_OPEN,
    PC_OCCUPANCY_RELEASED_DENIED,
    PC_OCCUPANCY_RELEASED_TERMINATED,
  ]),
  interval: z.strictObject({ from: CanonicalTimeSchema, to: CanonicalTimeSchema }),
  commitment: Pin,
  mechanism: Pin,
  /** v0.3 F-3: the Population determination (OUTSIDE_AGGREGATE) this registration proceeds on */
  representation: Pin,
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
    /** the derived F-014B §11 determination: the closed class has no counterpart actor, so no consequential-interaction floor applies */
    interaction_floor: z.literal(PC_COLLECTION_INTERACTION_FLOOR),
    started_at: CanonicalTimeSchema,
    completes_at: CanonicalTimeSchema,
  }),
});
export type ProductionPcCollectionWork = z.infer<typeof ProductionPcCollectionWorkSchema>;

// ---------------------------------------------------------------------------------------------
// D-1 (PROVISIONAL) — PC Collection Voluntary Cessation: the PC-side request and Production's terminal disposition.
// ---------------------------------------------------------------------------------------------

/**
 * What a separately confirmed cessation names: identities and the authored authority only. It names the SAME collection (the PC and
 * the act of the one in-flight work); it carries no result, no credit, no source status and no cancellation of anything: the
 * strict schemas have no field in which any of them could be stated.
 */
export const PcCollectionCessationInputSchema = z.strictObject({
  pc_id: EntityId,
  act_id: EntityId,
  authored_under: AuthoredUnder,
});
export type PcCollectionCessationInput = z.infer<typeof PcCollectionCessationInputSchema>;

/**
 * D-1 (PROVISIONAL): the PC-side owner's record of the player's separately confirmed request to cease the SAME in-flight
 * collection. It is a NEW action cause: it does not say earlier work never occurred, it is not a source status and it does not
 * cancel Production's work (Production alone resolves the terminal status). `requested_at` is the canonical time the engine read at
 * the request (never supplied): the instant the withdrawal takes effect, strictly before the earned boundary.
 */
export const PcCollectionCessationSchema = z.strictObject({
  cessation_id: EntityId,
  pc_id: EntityId,
  act_id: EntityId,
  authored_under: AuthoredUnder,
  intent: z.strictObject({
    kind: z.literal(PC_COLLECTION_CESSATION_INTENT_KIND),
    /** the exact committed versions of the SAME collection this request targets: a stale or forged request fails admission */
    target: z.strictObject({ commitment: Pin, work: Pin }),
  }),
  requested_at: CanonicalTimeSchema,
  basis: z.strictObject({
    pinned_versions: z.strictObject({
      binding: Version.min(1),
      custody: Version.min(1),
      occupancy: Version.min(1),
    }),
  }),
  committer: z.strictObject({
    owner: z.literal(OWNER_PC_EXISTENCE),
    facet: z.literal("pc_voluntary_commitment"),
  }),
});
export type PcCollectionCessation = z.infer<typeof PcCollectionCessationSchema>;

/**
 * D-1 (PROVISIONAL): Production's terminal disposition of in-flight collection work the PC withdrew from. Production alone decides
 * it, DERIVED from the committed cessation request, the work record and the canonical time. Under the present all-at-boundary class
 * no complete unit is awarded before the earned boundary, so `units_credited` is 0 and the source and the Reserve are untouched
 * (`source_effect` / `reserve_effect` NONE): the legitimately elapsed progress is RETAINED as evidence (`cycles_fully_elapsed`,
 * `elapsed`), never erased and never turned into a partial credit. The disposition atomically releases the key's claim on the
 * source (the account's open commitment), which is Production's own state; it releases no occupancy and retires no boundary
 * (Population and Temporal do, after this record is committed).
 */
export const ProductionPcCollectionTerminationSchema = z.strictObject({
  termination_id: EntityId,
  pc_id: EntityId,
  act_id: EntityId,
  disposition: z.literal(PC_COLLECTION_TERMINATION_DISPOSITION),
  pins: z.strictObject({ cessation: Pin, work: Pin, extraction: Pin }),
  derivation: z.strictObject({
    stopped_at: CanonicalTimeSchema,
    elapsed: CanonicalTimeSchema,
    per_cycle: PositiveDuration,
    cycles_fully_elapsed: z.number().int().nonnegative(),
    units_credited: z.literal(0),
    source_effect: z.literal("NONE"),
    reserve_effect: z.literal("NONE"),
    claim: z.literal("RELEASED"),
  }),
});
export type ProductionPcCollectionTermination = z.infer<
  typeof ProductionPcCollectionTerminationSchema
>;
