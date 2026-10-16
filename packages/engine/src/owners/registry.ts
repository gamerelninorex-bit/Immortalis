import {
  CPAA_C1_D1_PROVISIONAL,
  CPAA_C1_PROVISIONAL,
  FACET_PC_COLLECTION_MECHANISM,
  PcCollectionCessationSchema,
  PcCollectionCycleAttestationSchema,
  PopulationPcRepresentationSchema,
  ProductionPcCollectionTerminationSchema,
  FACET_POPULATION_PC_OCCUPANCY,
  FACET_POPULATION_WORKFORCE_SCOPE,
  FACET_WORLD_SCENE_CLOSURE,
  PopulationWorkforceScopeSchema,
  WorldSceneClosureSchema,
  PcCollectionCommitmentSchema,
  PcCollectionMechanismSchema,
  PcCollectionReachDecisionSchema,
  PcCollectionRequestSchema,
  PopulationPcOccupancySchema,
  ProductionPcCollectionWorkSchema,
  ORIGINAL_ACTIVATION,
  REFEREE_OP_OBSERVATION,
  REFEREE_OP_PHYSICAL,
  AccessDisseminationEventSchema,
  BroadcastExposureEventSchema,
  AccessEventSchema,
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  FACET_CULTURE_SOCIAL,
  OWNER_CULTURE,
  CjaDecisionRecordSchema,
  FACET_REFEREE_PROVENANCE,
  OWNER_REFEREE_KERNEL,
  RefereeDecisionRecordSchema,
  FACET_ADJUDICATION_PROVENANCE,
  OWNER_CULTURE_ADJUDICATION_KERNEL,
  CausalDrawPrecommitSchema,
  CausalDrawResultSchema,
  FACET_DRAW_PROVENANCE,
  OWNER_CAUSAL_DRAW_KERNEL,
  ACTOR_PROFILE_CAPABILITY_CLOSE,
  AccessiblePacketSchema,
  BoundaryIndexSchema,
  FACET_ACTOR_PROFILE,
  FACET_EPISTEMIC_ACCESS,
  FACET_KTI_DEVELOPMENT,
  KtiDevelopmentObjectSchema,
  KtiTransferBasisSchema,
  KtiTransferPackageSchema,
  OWNER_EPISTEMIC_ACCESS,
  OWNER_KTI,
  SealedEngineProvenanceSchema,
  NamedActorCapabilityBasisSchema,
  NamedActorCapabilitySchema,
  OWNER_NAMED_ACTOR,
  FACET_PC_CAPABILITY_PROFILE,
  FACET_PC_VOLUNTARY_COMMITMENT,
  MovementServiceRequestSchema,
  PcMovementCommitmentSchema,
  PcCapabilityBasisHistoricalSchema,
  PcCapabilityBasisSchema,
  PcCapabilitySchema,
  DurableCompletionEnvelopeSchema,
  EconomyDemandEnvelopeSchema,
  EconomyEncumbranceSchema,
  EconomyHoldingSchema,
  EconomyRealizationSchema,
  EconomyReallocationSchema,
  EntityTransitionCauseSchema,
  ExistingActorCouplingSchema,
  EntityTransitionCloseSchema,
  ExistenceContractSchema,
  ExternalRecognitionSchema,
  ExternalizedClaimDisputeSchema,
  RelationEdgeSchema,
  DiplomaticFrameworkSchema,
  FACET_DIPLOMACY_EXTERNAL_RECOGNITION,
  FACET_DIPLOMACY_EXTERNALIZED_CLAIM_DISPUTE,
  FACET_DIPLOMACY_RELATION_EDGE,
  FACET_DIPLOMACY_FRAMEWORK,
  FACET_ECONOMY_STATE,
  FACET_GIP_INSTITUTION_IDENTITY,
  FACET_EXISTENCE_CONTRACT,
  FACET_LOGISTICS_STATE,
  FACET_PRODUCTION_STATE,
  FACET_WORLD_FALLBACK_ENTITY,
  FACET_WORLD_SOURCE_CONDITION,
  ExtractionBasisSchema,
  ProductionExtractionSchema,
  SourceAccountSchema,
  SourceDeltaSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  FallbackPhysicalEntitySchema,
  InstitutionIdentitySchema,
  OfficeAuthorityLocusHolderSchema,
  OfficeAuthorityLocusSchema,
  OWNER_DIPLOMACY,
  OWNER_GIP,
  GIP_SUNSET_ENROLLMENT_KEY,
  GovernanceInstrumentCoreSchema,
  GovernanceInstrumentPredecessorSchema,
  GovernanceInstrumentSchema,
  SunsetEnrollmentSchema,
  ScopeBindingSchema,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  OWNER_ECONOMY,
  OWNER_LOGISTICS,
  OWNER_PRODUCTION,
  ProductionClaimSchema,
  ProductionOperationSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  CohortFactSchema,
  FACET_PLAYER_CHARACTER_BINDING,
  FACET_POPULATION_STATE,
  FACET_TEMPORAL_COORDINATION,
  FACET_WORLD_LOCUS,
  FACET_WORLD_PROFILE,
  OWNER_PC_EXISTENCE,
  OWNER_POPULATION,
  OWNER_ROLE_REGISTRY,
  OWNER_TEMPORAL_KERNEL,
  OWNER_WORLD_STATE,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  PcPhysicalLocusCustodySchema,
  RECIPIENT_ROLE_PLAYER_CHARACTER,
  PopulationBasisSchema,
  ReconciliationCloseSchema,
  ResolutionTransactionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  TransactionAuthoritySchema,
  WorldLocusSchema,
  WorldProfileSchema,
  type SourceRef,
  type ValueSchema,
} from "@immortalis/contracts";
import type { OwnerRegistry } from "../commit/campaign-core.ts";

/**
 * IM-03 Owner Resolver Layer — the specification-backed owner/facet assignments for the Canonical
 * World Identity & Owner Foundation.
 *
 * Every entry below is an assignment made by a pinned source, not by this file:
 *
 *   world profile / locus  → World Generation / World-State  (WG "World Generation May Own";
 *                            Output Packet; Interface Handoffs → Insertion).            IM-03
 *   PC existence contract  → I-002 (§2 "canonical current intrinsic Existence Contract"; §2.1
 *                            "Canonical writer: role.archivist").                        IM-07
 *   PC binding             → Role Registry / F-014C (IR §17: "active role.player_character
 *                            binding → Role Registry / F-014C"; Handover: "Insertion commits the
 *                            corresponding Role Registry / F-014C binding change"). IR decides
 *                            the transition; the Registry holds the durable record.      IM-07/IM-11
 *
 * Owner and facet identifiers, key spaces and the world-vs-locus facet split are technical
 * encodings (the sources prescribe no serialization vocabulary). There is NO fallback owner: a key
 * outside every key space below is rejected.
 *
 * `spec-lock.json` is the authority for the pins; tests/conformance/world-foundation-conformance
 * cross-checks each citation against it, so a pin cannot drift silently.
 */

const SPEC_LOCK_BASIS = "F-027 v1.0 spec-lock (spec/f027/spec-lock.json) frozen-source pin";
const RATIFICATION =
  "Sovereign-ratified within W3-CP3 / OB-044, 2026-09-25 (https://app.notion.com/p/3e620af901e0818a8c85cee779263a2c)";
const ROLE_REGISTRY_LINEAGE =
  "Canonical Role Registry v1 / F-014C, pin 2026-09-25T08:21:22.816Z (https://app.notion.com/p/3e620af901e081f68ff1d0cc574e041a)";
const RUNTIME_TRANSLATION_LINEAGE =
  "F-027 Runtime Contract & Translation Tranche v0.2 §5.2 rule 6 and §4 lowering set, pin 2026-09-29T00:33:04.009Z (https://app.notion.com/p/3ea20af901e081b8b958f7f3f39cb96a)";

export const WG_SOURCE = {
  artifact: "https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d",
  native_pin: "2026-09-25T13:44:22.668Z",
} as const;
export const I002_SOURCE = {
  artifact: "https://app.notion.com/p/5a520af901e0829eadb201bccd6c4718",
  native_pin: "2026-09-25T00:15:54.536Z",
} as const;
export const IR_SOURCE = {
  artifact: "https://app.notion.com/p/3e320af901e081a3a669c1c0b842c9df",
  native_pin: "2026-09-25T00:17:26.287Z",
} as const;

export const WS001_SOURCE = {
  artifact: "https://app.notion.com/p/3de20af901e081929b5df2337e4b2cf6",
  native_pin: "2026-09-25T23:42:28.770Z",
} as const;
export const WS015_SOURCE = {
  artifact: "https://app.notion.com/p/3e120af901e081069cacdd9dcca751ab",
  native_pin: "2026-09-20T15:53:58.732Z",
} as const;

/**
 * WS-005 Culture & Society — the frozen F-027 lock pin: the Blue post-ratification closeout (working design saturated) that
 * composes the Sovereign-ratified Concept v2, Operational Draft v2 and Scaling Profile v2 with the conformed F-016/F-017
 * successor deltas. `spec/f027/spec-lock.json` `frozen_sources` WS-005 is the authority; a conformance test cross-checks it.
 */
export const WS005_SOURCE = {
  artifact: "https://app.notion.com/p/3e720af901e0813b82f5ca864ad8daff",
  native_pin: "2026-09-26T07:23:03.549Z",
} as const;

export const WS003_SOURCE = {
  artifact: "https://app.notion.com/p/3e020af901e0819aab34ebd5412b6338",
  native_pin: "2026-09-25T13:44:44.982Z",
} as const;

export const WS004_SOURCE = {
  artifact: "https://app.notion.com/p/3e220af901e081fa9d84caf71a4f4f01",
  native_pin: "2026-09-24T11:45:02.825Z",
} as const;

export const WS010_SOURCE = {
  artifact: "https://app.notion.com/p/3e620af901e081e78415e03cda7cad12",
  native_pin: "2026-09-25T02:18:10.619Z",
} as const;

export const WS006_SOURCE = {
  artifact: "https://app.notion.com/p/3e520af901e081619a59c069a36db420",
  native_pin: "2026-09-25T00:18:36.828Z",
} as const;

export const WS016_SOURCE = {
  artifact: "https://app.notion.com/p/3e220af901e08168b37ccee101d23e49",
  native_pin: "2026-09-24T17:38:59.210Z",
} as const;

export const F014D_SOURCE = {
  artifact: "https://app.notion.com/p/3e020af901e08103b81aec5f7119318e",
  native_pin: "2026-09-24T16:25:17.059Z",
} as const;

export const WS002_SOURCE = {
  artifact: "https://app.notion.com/p/3e720af901e081d1b9e9ce4bbe475268",
  native_pin: "2026-09-26T02:44:38.319Z",
} as const;

export const WS007_SOURCE = {
  artifact: "https://app.notion.com/p/3e120af901e081c7ad5ecba62e11f521",
  native_pin: "2026-09-24T01:42:24.952Z",
} as const;

export const WS008_SOURCE = {
  artifact: "https://app.notion.com/p/3e220af901e081fd8594d6f2e6c453f6",
  native_pin: "2026-09-24T07:01:45.312Z",
} as const;

export const F014B_SOURCE = {
  artifact: "https://app.notion.com/p/3e020af901e081fb88e9f691748db990",
  native_pin: "2026-09-25T23:42:29.547Z",
} as const;

/**
 * F-027-CD1 — Causal Draw Implementation-Authority Addendum v1.0 (Twenty-Fifth Blue Freeze), pinned at the exact cleared
 * native pin and recorded in spec/f027/spec-lock.json `implementation_authority_addenda`. It composes WITH F-027 v1.0; it
 * does not rewrite or supersede it.
 */
export const F027_CD1_SOURCE = {
  artifact: "https://app.notion.com/p/3ed20af901e08176abe1c203943294b1",
  native_pin: "2026-10-02T15:11:03.450Z",
} as const;

/**
 * F-027-CJA1 — Culture Judgment Adjudication v1.1, the Sovereign-approved (9 October 2026) bounded interpretive-provenance
 * addendum. It is NOT native-pinned and NOT in `spec/f027/spec-lock.json`: `artifact` is the Sovereign-approval record that
 * attaches the full text and `native_pin` is the observed last-edit stamp of that record at construction. Both are a
 * provisional reference, never a promoted authority status.
 */
export const F027_CJA1_SOURCE = {
  artifact: "https://app.notion.com/p/3f420af901e0815dae8ac3912a1214fe",
  native_pin: "2026-10-09T00:48:10.413Z",
} as const;
/** SHA-256 of the exact approved v1.1 TXT (the original local file, trailing newline included). */
export const F027_CJA1_TEXT_SHA256 =
  "b099a6dea0b225790b944e019a27c3b87714a269720073344ea1229b4b617c67";

export const FACT_KIND_IDS = [
  "world_profile",
  "world_locus",
  "pc_existence_contract",
  "player_character_binding",
] as const;
export const TEMPORAL_FACT_KIND_IDS = [
  "temporal_state",
  "temporal_boundary_index",
  "temporal_object",
  "resolution_transaction",
  "temporal_transaction_authority",
] as const;
export const POPULATION_FACT_KIND_IDS = [
  "population_ledger",
  "population_close",
  "population_cohort",
] as const;
export const PRODUCTION_FACT_KIND_IDS = [
  "production_reserve",
  "production_claim",
  "production_operation",
  "production_completion",
] as const;
export const SOURCE_DRAWDOWN_FACT_KIND_IDS = [
  "production_extraction_basis",
  "production_extraction",
  "production_source_delta",
  "production_source_account",
] as const;
export const WORLD_SOURCE_CONDITION_FACT_KIND_IDS = [
  "world_source_condition",
  "world_source_delivery",
] as const;
export const WORLD_FALLBACK_FACT_KIND_IDS = ["world_fallback_entity"] as const;
export const WORLD_ENTITY_TRANSITION_FACT_KIND_IDS = ["world_entity_transition"] as const;
export const WORLD_ACTOR_COUPLING_FACT_KIND_IDS = ["world_actor_coupling"] as const;
export const WORLD_PC_LOCUS_CUSTODY_FACT_KIND_IDS = ["world_pc_locus_custody"] as const;
export const ECONOMY_FACT_KIND_IDS = [
  "economy_demand",
  "economy_request",
  "economy_realization",
] as const;
export const ECONOMY_HOLDING_FACT_KIND_IDS = [
  "economy_holding",
  "economy_encumbrance",
  "economy_reallocation",
] as const;
export const LOGISTICS_FACT_KIND_IDS = [
  "logistics_commitment",
  "logistics_transfer",
  "logistics_delivery",
] as const;
export const NAMED_ACTOR_FACT_KIND_IDS = [
  "named_actor_capability_basis",
  "named_actor_capability",
] as const;
export const PC_CAPABILITY_FACT_KIND_IDS = ["pc_capability_basis", "pc_capability"] as const;
export const PC_MOVEMENT_FACT_KIND_IDS = ["pc_movement_commitment", "pc_movement_request"] as const;
/** CPAA-C1 v0.2 PROVISIONAL candidate lowerings (not ratified): see `PC_COLLECTION_FACT_KINDS`. */
export const PC_COLLECTION_FACT_KIND_IDS = [
  "pc_collection_commitment",
  "pc_collection_request",
  "pc_collection_mechanism",
  "pc_collection_reach_decision",
  "population_pc_occupancy",
  "production_pc_collection_work",
  "pc_collection_cessation",
  "production_pc_collection_termination",
  "pc_collection_cycle_attestation",
  "population_pc_representation",
  "world_scene_closure",
  "population_workforce_scope",
] as const;
export const EPISTEMIC_ACCESS_FACT_KIND_IDS = [
  "epistemic_access_event",
  "epistemic_accessible_packet",
  "epistemic_sealed_provenance",
] as const;
export const KTI_FACT_KIND_IDS = [
  "kti_development_object",
  "kti_transfer_basis",
  "kti_transfer_package",
] as const;
export const CULTURE_FACT_KIND_IDS = ["culture_update_context", "culture_shared_meaning"] as const;
export const GIP_FACT_KIND_IDS = [
  "gip_institution_identity",
  "gip_office_authority_locus",
  "gip_scope_binding",
  "gip_governance_instrument",
  "gip_sunset_enrollment",
] as const;
export const DIPLOMACY_FACT_KIND_IDS = [
  "diplomacy_external_recognition",
  "diplomacy_claim_dispute",
  "diplomacy_relation_edge",
  "diplomacy_framework",
] as const;
export const CAUSAL_DRAW_FACT_KIND_IDS = ["causal_draw_precommit", "causal_draw_result"] as const;
export const CULTURE_ADJUDICATION_FACT_KIND_IDS = ["culture_adjudication_decision"] as const;
export const REFEREE_FACT_KIND_IDS = ["referee_decision"] as const;
export type FactKindId =
  | (typeof CAUSAL_DRAW_FACT_KIND_IDS)[number]
  | (typeof CULTURE_ADJUDICATION_FACT_KIND_IDS)[number]
  | (typeof REFEREE_FACT_KIND_IDS)[number]
  | (typeof DIPLOMACY_FACT_KIND_IDS)[number]
  | (typeof GIP_FACT_KIND_IDS)[number]
  | (typeof FACT_KIND_IDS)[number]
  | (typeof KTI_FACT_KIND_IDS)[number]
  | (typeof CULTURE_FACT_KIND_IDS)[number]
  | (typeof EPISTEMIC_ACCESS_FACT_KIND_IDS)[number]
  | (typeof NAMED_ACTOR_FACT_KIND_IDS)[number]
  | (typeof PC_CAPABILITY_FACT_KIND_IDS)[number]
  | (typeof PC_MOVEMENT_FACT_KIND_IDS)[number]
  | (typeof PC_COLLECTION_FACT_KIND_IDS)[number]
  | (typeof TEMPORAL_FACT_KIND_IDS)[number]
  | (typeof POPULATION_FACT_KIND_IDS)[number]
  | (typeof PRODUCTION_FACT_KIND_IDS)[number]
  | (typeof SOURCE_DRAWDOWN_FACT_KIND_IDS)[number]
  | (typeof WORLD_SOURCE_CONDITION_FACT_KIND_IDS)[number]
  | (typeof WORLD_FALLBACK_FACT_KIND_IDS)[number]
  | (typeof WORLD_ENTITY_TRANSITION_FACT_KIND_IDS)[number]
  | (typeof WORLD_ACTOR_COUPLING_FACT_KIND_IDS)[number]
  | (typeof WORLD_PC_LOCUS_CUSTODY_FACT_KIND_IDS)[number]
  | (typeof ECONOMY_FACT_KIND_IDS)[number]
  | (typeof ECONOMY_HOLDING_FACT_KIND_IDS)[number]
  | (typeof LOGISTICS_FACT_KIND_IDS)[number];

/**
 * SEALED: create-only canon; overwriting needs an owner-defined amendment mechanism that does not
 * exist. ADVANCING: the owner's own contract lets the fact move forward under its expected-version
 * chain (the kernel's shared orchestration state); the kind's admission rules say how.
 */
export type FactLifecycle = "SEALED" | "ADVANCING";

export interface FactKind {
  readonly id: FactKindId;
  readonly owner: string;
  readonly facet: string;
  /** IM boundary that lowers the governing source (spec-lock `primary_im`) */
  readonly im: string;
  /** RC contracts the fact instantiates */
  readonly rc: readonly string[];
  readonly lifecycle: FactLifecycle;
  /** Matches the whole key; capture group 1 (and 2) are entity identities embedded in the key. */
  readonly keyPattern: RegExp;
  readonly valueSchema: ValueSchema;
  /** governing rule recorded in every group that writes this kind (RC-01, RC-07) */
  readonly rule: SourceRef;
  /**
   * A SUPERSEDED governing-rule citation under which facts were already committed and must keep loading unchanged. It is a
   * narrowly bounded historical-provenance compatibility, never a second current rule: new writes must carry `rule`, and a
   * persisted fact may carry this citation only when it is exactly this whole citation (every field equal) AND its value
   * satisfies `admits`, the one class of value that was lawful when the citation was current. Anything else is rule drift.
   */
  readonly legacyRule?: {
    readonly rule: SourceRef;
    readonly admits: (value: unknown) => boolean;
  };
  /**
   * Further SUPERSEDED citations of the same kind, each independent and each bounded exactly like `legacyRule`: a persisted fact
   * may carry one only as that whole citation on a value of the class it governed. A kind has this only when it was superseded
   * more than once (the Instrument: sixteenth slice in `legacyRule`, twenty-first slice here). Never a current rule.
   */
  readonly laterLegacyRules?: readonly {
    readonly rule: SourceRef;
    readonly admits: (value: unknown) => boolean;
  }[];
  /**
   * A CURRENT governing-rule citation that is the only lawful one for one value class of a kind that holds more than one
   * (e.g. an Access / Dissemination Event of a distinct mode): a fact of that class carries exactly this whole citation, and
   * its owner's admission requires it for a new write. It is additive: it supersedes nothing and never relaxes `rule`.
   */
  readonly alternateRules?: readonly {
    readonly rule: SourceRef;
    readonly admits: (value: unknown) => boolean;
  }[];
}

const rule = (
  source: { artifact: string; native_pin: string },
  clause: string,
  extraLineage: readonly string[],
): SourceRef => ({
  artifact: source.artifact,
  native_pin: source.native_pin,
  clause,
  authority_lineage: [SPEC_LOCK_BASIS, RATIFICATION, ...extraLineage],
  effective_basis: "pinned-by-spec-lock",
  supersedes: null,
});

const ID = "([A-Za-z0-9][A-Za-z0-9._:-]*)";
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export const FACT_KINDS: readonly FactKind[] = [
  {
    id: "world_profile",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_PROFILE,
    im: "IM-03",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world/${ID}/profile$`),
    valueSchema: WorldProfileSchema,
    rule: rule(
      WG_SOURCE,
      "Output Packet — World Profile (items 1-4); Ownership Guards — World Generation May Own",
      [RUNTIME_TRANSLATION_LINEAGE],
    ),
  },
  {
    id: "world_locus",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_LOCUS,
    im: "IM-03",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world/${ID}/locus/${ID}$`),
    valueSchema: WorldLocusSchema,
    rule: rule(
      WG_SOURCE,
      "Output Packet item 4 — Insertion-Supporting World Constraints; Interface Handoffs — To Insertion/Reconciliation (material world-side locus/domain constraints)",
      [RUNTIME_TRANSLATION_LINEAGE],
    ),
  },
  {
    id: "pc_existence_contract",
    owner: OWNER_PC_EXISTENCE,
    facet: FACET_EXISTENCE_CONTRACT,
    im: "IM-07",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^pc/${ID}/existence-contract$`),
    valueSchema: ExistenceContractSchema,
    rule: rule(
      I002_SOURCE,
      "§2 Ownership Contract and §2.1 Role/Authority Declaration; §4 Minimum Existence Contract; §21 Generation Hand-Off Test; §26 Sparse Persistence",
      [RUNTIME_TRANSLATION_LINEAGE],
    ),
  },
  {
    id: "player_character_binding",
    owner: OWNER_ROLE_REGISTRY,
    facet: FACET_PLAYER_CHARACTER_BINDING,
    im: "IM-07",
    rc: ["RC-02", "RC-13"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^${escape(PLAYER_CHARACTER_BINDING_KEY)}$`),
    valueSchema: PlayerCharacterBindingSchema,
    rule: rule(
      IR_SOURCE,
      "§2 Ownership Contract; §3 input 3 and §5 Precedence for Insertion Facts (explicit player-authored fact); §6 Step 3 — native/already-there (no bridge invented) and Step 6 — Commit the binding; §17 Persistence / Write-Back; PC-Control Handover Contract — Single Commit Point",
      [ROLE_REGISTRY_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
    ),
  },
];

const F017_LINEAGE =
  "F-017 Whole-Engine Dependency Graph Candidate v0.3 §§2-4, 9 — ratified candidate pin 2026-09-25T15:03:49.887Z with PCB-01 §5.1 conformance at pin 2026-09-25T23:42:27.802Z (https://app.notion.com/p/3e620af901e081109144ef14f52012a8): DERIVE, persist no graph";

/**
 * The F-014B kernel rule shared by every kernel-owned fact. One group carries one rule, and the kernel
 * commits a transaction with its state, boundary-index and engaged-object updates atomically, so all
 * kernel kinds share one owner/facet and one citation.
 */
const KERNEL_RULE = rule(
  F014B_SOURCE,
  "§2 Kernel-Owned State; §3 Temporal Object Contract; §4 Cross-System Temporal Read (R-T1); §6 Advance Algorithm; §9 Temporal Invalidation; §13 Boundary Index Lifecycle; §17 Player-Facing Transaction / Replay; RC-03/RC-04/RC-05/RC-10",
  [F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * IM-02 Temporal / Dependency Coordinator: "Temporal/provenance coordination records only where
 * specified". F-014B §2 specifies exactly: canonical time, the active requested target/condition,
 * the actual stop and unresolved remainder, the active material-boundary index, and player-facing
 * transaction identity/provenance. The kernel owns orchestration, never a substantive world fact.
 */
export const TEMPORAL_FACT_KINDS: readonly FactKind[] = [
  {
    id: "temporal_state",
    owner: OWNER_TEMPORAL_KERNEL,
    facet: FACET_TEMPORAL_COORDINATION,
    im: "IM-02",
    rc: ["RC-02", "RC-05"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^${escape(TEMPORAL_STATE_KEY)}$`),
    valueSchema: TemporalStateSchema,
    rule: KERNEL_RULE,
  },
  {
    id: "temporal_boundary_index",
    owner: OWNER_TEMPORAL_KERNEL,
    facet: FACET_TEMPORAL_COORDINATION,
    im: "IM-02",
    rc: ["RC-02", "RC-10"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^${escape(TEMPORAL_BOUNDARY_INDEX_KEY)}$`),
    valueSchema: BoundaryIndexSchema,
    rule: KERNEL_RULE,
  },
  {
    id: "temporal_object",
    owner: OWNER_TEMPORAL_KERNEL,
    facet: FACET_TEMPORAL_COORDINATION,
    im: "IM-02",
    rc: ["RC-02", "RC-03", "RC-04", "RC-10"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^temporal/object/${ID}$`),
    valueSchema: TemporalObjectSchema,
    rule: KERNEL_RULE,
  },
  {
    id: "resolution_transaction",
    owner: OWNER_TEMPORAL_KERNEL,
    facet: FACET_TEMPORAL_COORDINATION,
    im: "IM-02",
    rc: ["RC-02", "RC-05"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^temporal/transaction/${ID}$`),
    valueSchema: ResolutionTransactionSchema,
    rule: KERNEL_RULE,
  },
  {
    id: "temporal_transaction_authority",
    owner: OWNER_TEMPORAL_KERNEL,
    facet: FACET_TEMPORAL_COORDINATION,
    im: "IM-02",
    rc: ["RC-02", "RC-05"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^temporal/transaction-authority/${ID}$`),
    valueSchema: TransactionAuthoritySchema,
    rule: KERNEL_RULE,
  },
];

const WS015_LINEAGE =
  "WS-015 Cohort Reference Architecture Working Operational Draft v1, Sovereign-ratified 2026-09-20 (https://app.notion.com/p/3e120af901e081069cacdd9dcca751ab), consumed with WS-001 Draft 3 §29B at its frozen implementation pin";

/**
 * IM-04 Population / Cohort Adapter: "Population-owned membership/count/commitment surfaces only".
 * WS-001 §Resolution Interface ("Population is the sole writer of Population-owned ... Population
 * Unit/count state") and §29B / WS-015 §III ("Population = Unit/Count Custodian") assign the Unit/Count
 * ledger, the ordinary reconciliation close and the Population-produced Cohort results to Population.
 * The three kinds share one owner and facet because one reconciliation publishes them atomically.
 */
/**
 * One governing rule for all Population kinds: a commit group carries one rule, and the ledger, close and
 * Cohort results of one reconciliation publish atomically, so every version of every Population fact
 * records the same citation (otherwise a later reconciliation would drift from the establishing rule).
 */
export const POPULATION_RULE: SourceRef = rule(
  WS001_SOURCE,
  "§1 Resident Population Conservation (Closing = Opening + Entries - Exits); §2 Residence, Presence, Labor, Burden distinct; §29B Externally Qualified Cohort Views; §32 ordinary reconciliation close and PCB-01; §35 Population / Movement Assertions; with WS-015 §III Persistent Cohort Reference Contract, §IV Burden Locus, §VII Single-Basis Derived-View Composition, §VIII Temporal-Read Cut, §IX Count, Range and Intersection Production, §X Overlap and Non-Additivity",
  [WS015_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

export const POPULATION_FACT_KINDS: readonly FactKind[] = [
  {
    id: "population_ledger",
    owner: OWNER_POPULATION,
    facet: FACET_POPULATION_STATE,
    im: "IM-04",
    rc: ["RC-02", "RC-12"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^population/${ID}/ledger$`),
    valueSchema: PopulationBasisSchema,
    rule: POPULATION_RULE,
  },
  {
    id: "population_close",
    owner: OWNER_POPULATION,
    facet: FACET_POPULATION_STATE,
    im: "IM-04",
    rc: ["RC-02", "RC-03", "RC-08"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^population/${ID}/close$`),
    valueSchema: ReconciliationCloseSchema,
    rule: POPULATION_RULE,
  },
  {
    id: "population_cohort",
    owner: OWNER_POPULATION,
    facet: FACET_POPULATION_STATE,
    im: "IM-04",
    rc: ["RC-02", "RC-12"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^population/${ID}/cohort/${ID}$`),
    valueSchema: CohortFactSchema,
    rule: POPULATION_RULE,
  },
];

const F016_LINEAGE =
  "F-016 Integrated Review Candidate v0.4 manifest, pin 2026-09-25T13:48:12.575Z (https://app.notion.com/p/3e620af901e0812bb807d234d88fadb6): conformed Production durable-completion and World-State fallback-custodian guards";

/**
 * One governing rule for every Production kind: a start group and a completion group publish several
 * Production facts atomically under one rule, so every version of every Production fact records the same
 * citation. WS-003's "Completed durable output / physical-state handoff" is the F-016-conformed clause.
 */
export const PRODUCTION_RULE: SourceRef = rule(
  WS003_SOURCE,
  "§2 Authoritative Scope incl. Completed durable output / physical-state handoff (F-016 ratified conformance); §3 Representation Tiers (Tier A embedded, Tier C active marginal resolution object, Tier D exact reserve account); §4 Capability-Access-Reserve-Source Contract; §8 Labor and Specialist Interface (Tier A embedded labor, no marginal labor claim); §9 Shared Constraints and Concurrent Load incl. Scarcity Allocation (no invented priority); §13A Production Request; §14 Consequential Production Resolution Procedure; §15 Validation Checklist; §16 Selected Turnless Temporal Adapter; §19 Interface & Scaling Declaration",
  [F016_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The World-State fallback objective physical-entity custodian (IM-03): WG "Ownership Guards — F-016 Ratified
 * Fallback Objective Physical-Entity Custody" — "after accepted completion of a loose durable with no more-
 * specific physical custodian — its physical identity, conserved quantity where applicable and physical
 * condition". It is World-State's fact, never Production's, never a generic Asset or Inventory.
 */
export const WORLD_FALLBACK_RULE: SourceRef = rule(
  WG_SOURCE,
  "Ownership Guards — World Generation May Own: F-016 Ratified Fallback Objective Physical-Entity Custody (accepted completion of a loose durable with no more-specific physical custodian: physical identity, conserved quantity, physical condition); with WS-003 §2 Completed durable output / physical-state handoff and F-017 §5.7 / CG-2 Durable completion/acceptance",
  [F016_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

const WS003_SOURCE_LINEAGE =
  "WS-003 Production & Resources §4A Source Stock / Renewal Execution Contract and §4B Source Boundary Basis (Source Delta channel, Pending Drawdown, Delivery, Calibration), spec-locked pin " +
  `${WS003_SOURCE.native_pin} (${WS003_SOURCE.artifact}); WG World Generation & World-State Kernel "Ownership Guards — World Generation May Own" and "Interface Handoffs — To Production / KTI / Population / Economy / Other Functional Owners", spec-locked pin ${WG_SOURCE.native_pin} (${WG_SOURCE.artifact})`;

/**
 * One governing rule for every Production kind of an exact finite raw-source drawdown: the basis, the extraction, the
 * Source Delta, the per-key account and the Reserve inflow. WS-003 §4A/§4B are the governing clauses; the existing
 * Production rule (which cites no source clause) is unchanged, so every already-committed Production fact keeps loading.
 */
export const PRODUCTION_SOURCE_DRAWDOWN_RULE: SourceRef = rule(
  WS003_SOURCE,
  "§4 Capability-Access-Reserve-Source Contract (Capability is not inventory; Access is not capability; Source Stock is not Reserve); §4A Source Stock / Renewal Execution Contract (separate truth from estimate; resolve Production capability/access; emit the Production-caused Source Delta; source owner resolves dynamics; conserve produced material; type exhaustion explicitly); §4B Source Boundary Basis (Source Delta channel, Pending Drawdown held once as discrete residue per source-owner resolution key, delivery transfer-and-advance, watermark); §8 Labor and Specialist Interface (Tier A embedded labor, no marginal labor claim); §10; §14 Consequential Production Resolution Procedure steps 6 and 10-12; §15 Validation Checklist; §16 Selected Turnless Temporal Adapter",
  [WS003_SOURCE_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The World-State Source Condition owner (WS-003 §4A "Identify owner ... Do not create a rival geology/ecology ledger
 * inside Production"; "Source owner resolves dynamics"): the exact finite Source Condition, established as an initial
 * setting fact, and the delivery record by which it consumes an actual Production-caused Source Delta.
 */
export const WORLD_SOURCE_CONDITION_RULE: SourceRef = rule(
  WG_SOURCE,
  "Ownership Guards — World Generation May Own (world-side environmental, geographic, topological and other general world-state facts not owned by a more specific subsystem; integration of committed outputs from functional owners into the persistent world representation without duplicating their internal state); World Generation May Not Own (Production functional state); Interface Handoffs — To Production / KTI / Population / Economy / Other Functional Owners (provide physical world conditions and receive their lawful state changes); with WS-003 §4A Source Stock / Renewal Execution Contract (Source Condition is world truth; Production does not compute the resulting authoritative source condition) and §4B Source Boundary Basis (delivery; the owner returns Source Condition net of all delivered drawdown)",
  [WS003_SOURCE_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

const productionKind = (
  id: (typeof PRODUCTION_FACT_KIND_IDS)[number],
  rc: readonly string[],
  lifecycle: FactLifecycle,
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_PRODUCTION,
  facet: FACET_PRODUCTION_STATE,
  im: "IM-05",
  rc,
  lifecycle,
  keyPattern,
  valueSchema,
  rule: PRODUCTION_RULE,
});

/**
 * IM-05 Resource / Production / Logistics Adapter — the PRODUCTION part only: "durable completion/acceptance,
 * timed work, Resource condition". WS-003 §2 assigns production-side Reserve identity/quantity/condition,
 * transformation/work state, realized output in production and temporary resolution state to Production;
 * §9/§19 assign open claim references on Production-owned shared constraints to it; §2 (F-016 conformed)
 * assigns the Durable Completion Envelope to it. One owner, one facet. There is no fallback owner, and no
 * Logistics, Source, Economy or labor kind exists.
 */
export const PRODUCTION_FACT_KINDS: readonly FactKind[] = [
  {
    ...productionKind(
      "production_reserve",
      ["RC-02", "RC-07"],
      "ADVANCING",
      new RegExp(`^production/reserve/${ID}$`),
      ProductionReserveSchema,
    ),
    // the Reserve inflow group (a stage of an exact finite raw-source drawdown) is written under the drawdown rule: a
    // Reserve may carry that citation only when it holds a credited inflow (WS-003 §4A "Conserve produced material")
    alternateRules: [
      {
        rule: PRODUCTION_SOURCE_DRAWDOWN_RULE,
        admits: (value) => {
          const r = ProductionReserveSchema.safeParse(value);
          return r.success && (r.data.inflows ?? []).length > 0;
        },
      },
    ],
  },
  productionKind(
    "production_claim",
    ["RC-02", "RC-06"],
    "ADVANCING",
    new RegExp(`^production/claim/${ID}$`),
    ProductionClaimSchema,
  ),
  productionKind(
    "production_operation",
    ["RC-02", "RC-07", "RC-10"],
    "ADVANCING",
    new RegExp(`^production/operation/${ID}$`),
    ProductionOperationSchema,
  ),
  productionKind(
    "production_completion",
    ["RC-02", "RC-07"],
    "SEALED",
    new RegExp(`^production/completion/${ID}$`),
    DurableCompletionEnvelopeSchema,
  ),
];

const drawdownKind = (
  id: (typeof SOURCE_DRAWDOWN_FACT_KIND_IDS)[number],
  rc: readonly string[],
  lifecycle: FactLifecycle,
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_PRODUCTION,
  facet: FACET_PRODUCTION_STATE,
  im: "IM-05",
  rc,
  lifecycle,
  keyPattern,
  valueSchema,
  rule: PRODUCTION_SOURCE_DRAWDOWN_RULE,
});

/**
 * IM-05 — the Production part of an exact finite raw-source drawdown: Production's own Capability / Access basis (SEALED),
 * the extraction (SEALED, the pinned request and the commitment), the Production-caused Source Delta (SEALED, the key's
 * Pending Drawdown while undelivered) and the per-key account (ADVANCING: opened by the first admission, closed per
 * delivery). Same owner and facet as the rest of Production: no new Production owner exists, and the source truth is not
 * Production's.
 */
export const SOURCE_DRAWDOWN_FACT_KINDS: readonly FactKind[] = [
  drawdownKind(
    "production_extraction_basis",
    ["RC-02"],
    "SEALED",
    new RegExp(`^production/extraction-basis/${ID}$`),
    ExtractionBasisSchema,
  ),
  drawdownKind(
    "production_extraction",
    ["RC-02", "RC-06", "RC-10"],
    "SEALED",
    new RegExp(`^production/extraction/${ID}$`),
    ProductionExtractionSchema,
  ),
  drawdownKind(
    "production_source_delta",
    ["RC-02", "RC-07"],
    "SEALED",
    new RegExp(`^production/source-delta/${ID}$`),
    SourceDeltaSchema,
  ),
  drawdownKind(
    "production_source_account",
    ["RC-02", "RC-06"],
    "ADVANCING",
    new RegExp(`^production/source-account/${ID}/${ID}$`),
    SourceAccountSchema,
  ),
];

/** World-State's Source Condition facet: the ADVANCING Source Condition and its SEALED delivery record. */
export const WORLD_SOURCE_CONDITION_FACT_KINDS: readonly FactKind[] = [
  {
    id: "world_source_condition",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_SOURCE_CONDITION,
    im: "IM-03",
    rc: ["RC-02"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^world/${ID}/source/${ID}$`),
    valueSchema: WorldSourceConditionSchema,
    rule: WORLD_SOURCE_CONDITION_RULE,
  },
  {
    id: "world_source_delivery",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_SOURCE_CONDITION,
    im: "IM-03",
    rc: ["RC-02", "RC-07"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world/${ID}/source-delivery/${ID}$`),
    valueSchema: WorldSourceDeliverySchema,
    rule: WORLD_SOURCE_CONDITION_RULE,
  },
];

/** SEALED: after acceptance no amendment mechanism exists, so the entity is create-only (exactly once). */
export const WORLD_FALLBACK_FACT_KINDS: readonly FactKind[] = [
  {
    id: "world_fallback_entity",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_FALLBACK_ENTITY,
    im: "IM-03",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world/${ID}/entity/${ID}$`),
    valueSchema: FallbackPhysicalEntitySchema,
    rule: WORLD_FALLBACK_RULE,
  },
];

const F016_ECT_LINEAGE =
  "F-016 v0.4 successor delta (George Blue W6-INT1 post-ratification conformance), pin 2026-09-25T13:45:28.162Z (https://app.notion.com/p/3e620af901e0811890f6da9de42ec865): §2 R-1 ECT-01 Entity Continuity / Transition Result, the cause-owner / entity-commit split, and §5 R-4 Entity Transition Close";

/**
 * The World-State fallback custodian's entity transition (IM-03): WG "Ownership Guards — F-016 Ratified Fallback
 * Objective Physical-Entity Custody" — the fallback "may carry ... existence/cessation, form/substrate/embodiment,
 * ... continuity-dependency binding, ... predecessor/successor relation" and "commits existence/cessation/form
 * exactly once and references that causing result" — with F-016 v0.4 ECT-01 and the Entity Transition Close.
 */
export const WORLD_ENTITY_TRANSITION_RULE: SourceRef = rule(
  WG_SOURCE,
  "Ownership Guards — World Generation May Own: F-016 Ratified Fallback Objective Physical-Entity Custody (continuity-dependency binding; predecessor/successor relation; the fallback never converts causal ownership into entity ownership: the causing owner establishes cause and causal outcome, World-State commits the entity consequence exactly once and references that causing result); with F-016 v0.4 §2 R-1 ECT-01 (same entity continues; provenance; Entity Transition Close) and §5 R-4 Entity Transition Close, and F-017 §3 close vocabulary",
  [F016_LINEAGE, F016_ECT_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * SEALED: one transition per entity, create-only. The accepted entity (WORLD_FALLBACK_FACT_KINDS) is never
 * amended: its locality stays the historical origin and the transition is the entity's current locus.
 */
export const WORLD_ENTITY_TRANSITION_FACT_KINDS: readonly FactKind[] = [
  {
    id: "world_entity_transition",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_FALLBACK_ENTITY,
    im: "IM-03",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world/${ID}/entity/${ID}/transition$`),
    valueSchema: EntityTransitionCloseSchema,
    rule: WORLD_ENTITY_TRANSITION_RULE,
  },
];

const WS006_ACTOR_COUPLING_LINEAGE = `WS-006 / F-014A v3.3 §6 Two-Target Write Rule (physical location attaches to the true affected entity/domain, never to the actor-side record), spec-locked pin ${WS006_SOURCE.native_pin} (${WS006_SOURCE.artifact}); IR Player–World Insertion §5 item 3 and §17 (world placement/overlap → World owner), spec-locked pin ${IR_SOURCE.native_pin} (${IR_SOURCE.artifact}); I-002 §4.3 (position and other world-locus differences belong to Insertion/world/runtime owners), spec-locked pin ${I002_SOURCE.native_pin} (${I002_SOURCE.artifact})`;
const HANDOVER_SEAM_LINEAGE =
  'PC-CONTROL HANDOVER CONTRACT v1 — W3-CP3 Blue Repair Overlay, observed native pin 2026-09-25T00:16:16.544Z (https://app.notion.com/p/3e520af901e081c0b84cc5cb7f301a0e), cited as the seam rule only ("Before that commit, the current owner remains writable") and NOT a spec-lock pin';

/**
 * The World-State fallback custodian's current actor↔locus/world coupling of one already-existing, lawfully non-PC actor
 * (IM-03): WG "Ownership Guards — World Generation May Own: ... world-side environmental, geographic, topological and other
 * general world-state facts not owned by a more specific subsystem" and "F-016 Ratified Fallback Objective Physical-Entity
 * Custody" (physical/entity identity or reference; continuity-dependency binding), with WS-006 / F-014A v3.3 §6 (physical
 * location is a world/entity-side fact, never an actor-side record), IR §5 item 3 / §17 (an authoritative world fact already
 * established; world placement → World owner) and the Handover Contract's single commit point (the coupling is a prerequisite:
 * it binds nothing and moves no ownership).
 */
export const WORLD_ACTOR_COUPLING_RULE: SourceRef = rule(
  WG_SOURCE,
  "Ownership Guards — World Generation May Own: world-side environmental, geographic, topological and other general world-state facts not owned by a more specific subsystem, and F-016 Ratified Fallback Objective Physical-Entity Custody (fallback custodian of objective physical/entity facts only where no more-specific authoritative owner exists for the exact fact: physical/entity identity or reference, continuity-dependency binding); Interface Handoffs — To Insertion/Reconciliation (latent/realized local state needed for coupling)",
  [WS006_ACTOR_COUPLING_LINEAGE, HANDOVER_SEAM_LINEAGE, F016_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * SEALED: one current coupling per actor identity (across every world), create-only. Relocating the actor needs a
 * successor mechanism that does not exist, so a second coupling is a version conflict, never a sibling truth. It is the
 * custodian's own fact kind (same owner and facet as the fallback entity and its transition): it is NOT a fallback
 * physical entity and no Production durable path is used.
 */
export const WORLD_ACTOR_COUPLING_FACT_KINDS: readonly FactKind[] = [
  {
    id: "world_actor_coupling",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_FALLBACK_ENTITY,
    im: "IM-03",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world-state/actor/${ID}/coupling$`),
    valueSchema: ExistingActorCouplingSchema,
    rule: WORLD_ACTOR_COUPLING_RULE,
  },
];

const PC_LOCUS_CONTRACT_LINEAGE =
  "ACTIVE-PC POST-HANDOVER PHYSICAL LOCUS OWNERSHIP & RELOCATION CONTRACT (Blue bounded design resolution, Red-cleared, Sovereign-ratified and frozen), frozen pin 2026-10-08T01:25:36.611Z (https://app.notion.com/p/3f320af901e08166ad96ca0fc5e5069d), cited as the ownership rule only (§4 ownership matrix, §5 Role Registry locus semantics: the binding's coupling.world/coupling.locus is a binding-time referent, never current physical truth; §6 the consumed world_actor_coupling stays immutable provenance; §7 World-State fallback custody is the lawful owner class of the active PC's objective physical locus; §9 rival-current-locus invariant; §13 persistence and custody) and NOT a spec-lock pin";

/**
 * The World-State fallback custodian's one stationary current physical-locus record of the ACTIVE Player Character, established
 * after the completed Existing-Actor → PC handover (IM-03): WG "Ownership Guards — World Generation May Own: ... world-side
 * environmental, geographic, topological and other general world-state facts not owned by a more specific subsystem" and "F-016
 * Ratified Fallback Objective Physical-Entity Custody" (physical/entity identity or reference; continuity-dependency binding),
 * with WS-006 / F-014A v3.3 §6 (physical location is a world/entity-side fact, never an actor-side or control-binding record),
 * IR §5 item 3 / §17 (world placement → World owner), I-002 §4.3 (position is not I-002 state) and the frozen Post-Handover
 * Physical Locus Ownership contract (the lineage constant above).
 */
export const WORLD_PC_LOCUS_CUSTODY_RULE: SourceRef = rule(
  WG_SOURCE,
  "Ownership Guards — World Generation May Own: world-side environmental, geographic, topological and other general world-state facts not owned by a more specific subsystem, and F-016 Ratified Fallback Objective Physical-Entity Custody (fallback custodian of objective physical/entity facts only where no more-specific authoritative owner exists for the exact fact: physical/entity identity or reference, continuity-dependency binding); Interface Handoffs — To Insertion/Reconciliation (latent/realized local state needed for coupling)",
  [
    WS006_ACTOR_COUPLING_LINEAGE,
    HANDOVER_SEAM_LINEAGE,
    PC_LOCUS_CONTRACT_LINEAGE,
    F016_LINEAGE,
    RUNTIME_TRANSLATION_LINEAGE,
  ],
);

/** BLUE v5.1 Bounded Implementation Brief — Original Active-PC Qualified Physical-Locus Custody (a construction source, NOT a spec-lock pin). */
export const ORIGINAL_PC_CUSTODY_BRIEF_SOURCE = {
  artifact: "https://app.notion.com/p/3f620af901e0811abc1ee604de833a41",
  native_pin: "2026-10-11T05:30:16.307Z",
} as const;

const ORIGINAL_PC_CUSTODY_LINEAGE = `BLUE v5.1 Bounded Implementation Brief — Original Active-PC Qualified Physical-Locus Custody, verified native pin ${ORIGINAL_PC_CUSTODY_BRIEF_SOURCE.native_pin} (${ORIGINAL_PC_CUSTODY_BRIEF_SOURCE.artifact}), cited as the construction objective and acceptance boundary only (NOT a game-design source, NOT an amendment to the post-handover custody contract, NOT a spec-lock pin); the exact existing-actor handover branch of the frozen Post-Handover contract (${PC_LOCUS_CONTRACT_LINEAGE}) is NOT reclassified and does not by itself certify original first-activation placement`;

const ORIGINAL_PC_PLACEMENT_LINEAGE = `IR Player–World Insertion §2 (binding to one world locus; reconciliation of already-established PC-side and world-side constraints), §7 (established world baseline + explicit accepted PC exception), §12 (independent actor boundary), §14 (Total-Domain: degenerate, non-spatial insertion), §17 (world placement/overlap → World owner; active binding → Role Registry), spec-locked pin ${IR_SOURCE.native_pin} (${IR_SOURCE.artifact}); I-002 §2 (does not own actual placement inside the destination world), §4.3 (embodiment topology: one body / several bodies / host-dependent / distributed substrate / incorporeal / no current body / total-domain; position is not I-002 state), §17.2 (coextensive self), spec-locked pin ${I002_SOURCE.native_pin} (${I002_SOURCE.artifact}); Canonical Role Registry v1: the \`role.player_character\` binding's coupling.world / coupling.locus is a binding-time referent, never a movable current physical-locus ledger, and \`role.gm\` / \`permission.rule.adjudicate\` (never \`role.player\` / \`permission.player_choice.commit\`) adjudicates, pin 2026-09-25T08:21:22.816Z (https://app.notion.com/p/3e620af901e081f68ff1d0cc574e041a)`;

/**
 * The World-State fallback custodian's stationary current physical-locus record of an ORIGINAL first-activated Player Character
 * (IM-03): WG "Ownership Guards" / F-016 (form/substrate/embodiment and physical identity of an entity, where no more-specific owner
 * exists) with IR §§2, 7, 12, 14, 17 and I-002 §§2, 4.3, 17.2: the actual placement of a freshly authored PC follows the explicit
 * accepted player-authored fact, the committed world constraints and a qualified native/no-bridge result, and persists through
 * World-State. A different governing citation from the handover branch's on purpose: an exclusive current rule for the ACTIVATION
 * value class (see `FactKind.alternateRules`); the handover class keeps `WORLD_PC_LOCUS_CUSTODY_RULE` byte for byte.
 */
export const WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE: SourceRef = rule(
  WG_SOURCE,
  "Ownership Guards — World Generation May Own: world-side environmental, geographic, topological and other general world-state facts not owned by a more specific subsystem, and F-016 Ratified Fallback Objective Physical-Entity Custody (fallback custodian of objective physical/entity facts only where no more-specific authoritative owner exists for the exact fact: physical/entity identity or reference, existence/cessation, form/substrate/embodiment); Interface Handoffs — To Insertion/Reconciliation (latent/realized local state needed for coupling)",
  [
    ORIGINAL_PC_PLACEMENT_LINEAGE,
    ORIGINAL_PC_CUSTODY_LINEAGE,
    WS006_ACTOR_COUPLING_LINEAGE,
    F016_LINEAGE,
    RUNTIME_TRANSLATION_LINEAGE,
  ],
);

/**
 * SEALED: one stationary physical-locus custody record per PC identity, create-only. Relocation needs a successor mechanism that
 * does not exist, so a second record is a version conflict, never a sibling truth. It is the custodian's own fact kind (same
 * owner and facet as the fallback entity, its transition and the actor coupling): it is NOT a fallback physical entity, no
 * Production durable path is used, and it never touches the Role Registry binding or the consumed actor coupling.
 */
export const WORLD_PC_LOCUS_CUSTODY_FACT_KINDS: readonly FactKind[] = [
  {
    id: "world_pc_locus_custody",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_FALLBACK_ENTITY,
    im: "IM-03",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world-state/pc/${ID}/locus-custody$`),
    valueSchema: PcPhysicalLocusCustodySchema,
    rule: WORLD_PC_LOCUS_CUSTODY_RULE,
    // the ORIGINAL first-activation branch is written under its own citation, exclusively; the handover branch keeps `rule` unchanged
    alternateRules: [
      {
        rule: WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE,
        admits: (value) => {
          const r = PcPhysicalLocusCustodySchema.safeParse(value);
          return r.success && r.data.basis.established_from === ORIGINAL_ACTIVATION;
        },
      },
    ],
  },
];

/**
 * One governing rule for every Economy kind: the demand and its one Production Request publish atomically, and
 * each realization is one group, so every version of every Economy fact records the same citation. The clauses
 * are the ones the state relies on; the Production side of the interface is WS-003 §13A / §14 (already pinned by
 * the Production rule) and the staged order is F-017's.
 */
export const ECONOMY_RULE: SourceRef = rule(
  WS004_SOURCE,
  "§2.1 Economy-owned state (Demand Envelopes; allocation claims; realized access conclusions); §2.2 Explicit non-ownership (physical goods and stock, population quantity/membership/Cohort identity); §3 Persistence / Cardinality Rule; §5.1 Demand source; §5.2 Demand Envelope; §5.3 Carrier Cohort; §8 Effective Demand and Allocation Claims (purchasing power cannot create absent goods); §11 Economic Claim / Obligation (not a universal property registry); §20 Commitment and Conservation (Economy never holds a physical reservation); §21 Realized Flow / Delta (delivery/result ref from downstream owner); §27.1 Population / Cohort; §27.2 Production / Resources (demand does not create supply; realized output may not feed the same pre-commit availability test); §27.13 Temporal (no universal economic tick); §27.14 R-T1 / Cycle rule; §33 Turnless Execution",
  [F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

const economyKind = (
  id: (typeof ECONOMY_FACT_KIND_IDS)[number],
  rc: readonly string[],
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_ECONOMY,
  facet: FACET_ECONOMY_STATE,
  im: "IM-06",
  rc,
  lifecycle: "SEALED",
  keyPattern,
  valueSchema,
  rule: ECONOMY_RULE,
});

/**
 * IM-06 Economy / Exchange / Demand Adapter — the bounded Demand → Production Request → Realized Access path
 * only. WS-004 §2.1 assigns Demand Envelopes, allocation claims and realized-access conclusions to Economy;
 * WS-003 §13A has the request's SOURCE own the Production Request, so Economy holds it in its own key space.
 * One owner, one facet, three exclusive create-only key spaces. There is no fallback owner, and no Exchange,
 * Market, Currency, Credit, Holding/Account, Logistics, KTI or labor kind exists.
 */
export const ECONOMY_FACT_KINDS: readonly FactKind[] = [
  economyKind(
    "economy_demand",
    ["RC-02", "RC-12"],
    new RegExp(`^economy/demand/${ID}$`),
    EconomyDemandEnvelopeSchema,
  ),
  economyKind(
    "economy_request",
    ["RC-02"],
    new RegExp(`^economy/request/${ID}$`),
    ProductionRequestSchema,
  ),
  economyKind(
    "economy_realization",
    ["RC-02", "RC-07"],
    new RegExp(`^economy/realization/${ID}$`),
    EconomyRealizationSchema,
  ),
];

/**
 * One governing rule for the Economic Holding / Account kinds. It is a SEPARATE citation from {@link ECONOMY_RULE}: the
 * Demand → Request → Realized Access kinds keep their own rule byte-for-byte, so no persisted Economy fact changes
 * provenance. The clauses are the ones the holding and its encumbrance rely on.
 */
export const ECONOMY_HOLDING_RULE: SourceRef = rule(
  WS004_SOURCE,
  "§2.1 Economy-owned state (sparse Economic Holding / Account relations: holder_ref, object_ref, quantity_or_bounded_position, available / encumbered / restricted status, restriction_or_authority_ref, lifecycle_status, provenance_ref; Economy is the default owner-producer of holding and encumbrance state); §2.2 Explicit non-ownership (physical goods and stock, legal authority and entitlement validity, issuance authority, actor motive and choice); §3 Persistence / Cardinality Rule (conserved holding rule); §4 Economic Non-Interchangeability / No-Double-Spend (the same conserved holding may not fund two incompatible uses); §11 Economic Claim / Obligation (lifecycle vocabulary; not a universal property registry; no legal priority, title or entitlement manufactured); §20 Commitment and Conservation (verify the Economy-owned side is available and not already encumbered; prevent incompatible reuse; release unused economic encumbrance on cancellation; Economy never holds a physical reservation); §27.6 GIP; §27.8 Named Actors; §27.14 R-T1 / Cycle rule; §28 Retention / Lifecycle; §30 Required Invariants (17, 18, 27)",
  [F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * IM-06 Economic Holding / Account position and its reversible economic encumbrance — the bounded OOC scenario /
 * mechanism proof only. Same owner and facet as the Demand chain, two further exclusive key spaces. Both are ADVANCING,
 * and only by the re-derived hold / release transitions of `economyGroupCheck`: the holding by its partition, the
 * encumbrance by its single active → cancelled transition. The reallocation record is create-only (SEALED) and is
 * written only together with the two positions it advances. No issuance, payment, settlement, title, price or
 * physical-reserve kind exists.
 */
export const ECONOMY_HOLDING_FACT_KINDS: readonly FactKind[] = [
  {
    id: "economy_holding",
    owner: OWNER_ECONOMY,
    facet: FACET_ECONOMY_STATE,
    im: "IM-06",
    rc: ["RC-02", "RC-07"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^economy/holding/${ID}$`),
    valueSchema: EconomyHoldingSchema,
    rule: ECONOMY_HOLDING_RULE,
  },
  {
    id: "economy_encumbrance",
    owner: OWNER_ECONOMY,
    facet: FACET_ECONOMY_STATE,
    im: "IM-06",
    rc: ["RC-02", "RC-07"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^economy/encumbrance/${ID}/${ID}$`),
    valueSchema: EconomyEncumbranceSchema,
    rule: ECONOMY_HOLDING_RULE,
  },
  {
    id: "economy_reallocation",
    owner: OWNER_ECONOMY,
    facet: FACET_ECONOMY_STATE,
    im: "IM-06",
    rc: ["RC-02", "RC-07"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^economy/reallocation/${ID}$`),
    valueSchema: EconomyReallocationSchema,
    rule: ECONOMY_HOLDING_RULE,
  },
];

/**
 * One governing rule for every Logistics kind: a commitment, a dispatch, a delivery result and a retirement are
 * each one group, and the retirement advances the commitment and the transfer together, so every version of every
 * Logistics fact records the same citation. The clauses are the ones the state relies on; the destination handoff
 * is World-State's own ECT-01 commit (already pinned by the entity-transition rule) and the staged order is F-017's
 * §23 completion edge pair.
 */
export const LOGISTICS_RULE: SourceRef = rule(
  WS010_SOURCE,
  "§2.1 Logistics owns (non-agentive movement-service commitment state; consequential transfer-process state; authoritative current movement locus while a transfer is active); §2.2 Logistics does not own (carrier/entity ontology or substantive identity; cargo identity, stock quantity or condition; universal inventory); §3.1 Movement Service Request (interface envelope, not Logistics-owned state); §3.2 Movement-Service Commitment; §3.4 Transfer Record; §4.1 Non-agentive movement service; §9 Transfer lifecycle (dispatch; active transfer; delivery; capacity release / record retirement); §10.1 Authoritative movement locus; §10.2 Identity, quantity and condition; §10.4 Completion; §11 Dispatch is not delivery; §20 Temporal integration (no Logistics tick); §23 Cross-owner completion handshake (steps 1-5); §26 Scaling guards; §27 Failure conditions",
  [F017_LINEAGE, F016_ECT_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

const logisticsKind = (
  id: (typeof LOGISTICS_FACT_KIND_IDS)[number],
  rc: readonly string[],
  lifecycle: FactLifecycle,
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_LOGISTICS,
  facet: FACET_LOGISTICS_STATE,
  im: "IM-05",
  rc,
  lifecycle,
  keyPattern,
  valueSchema,
  rule: LOGISTICS_RULE,
});

/**
 * IM-05 Resource / Production / Logistics Adapter — the LOGISTICS part, bounded to one single-leg, uncontended,
 * non-agentive transfer of one already-accepted entity. WS-010 §2.1 assigns the movement-service commitment, the
 * transfer-process state and the authoritative movement locus while a transfer is active to Logistics; §3.1 keeps
 * the request in its source's own key space. One owner, one facet, three exclusive entity-keyed key spaces: the
 * commitment and the transfer ADVANCE (commit → release; dispatch → retire) under the expected-version chain, and
 * the delivery-complete result is SEALED (create-only, exactly the causing-result envelope World-State's
 * entity-transition seam reads). There is no fallback owner, and no Route Family, carrier, hub, capacity,
 * recurring-commitment, inventory or agentive kind exists.
 */
export const LOGISTICS_FACT_KINDS: readonly FactKind[] = [
  logisticsKind(
    "logistics_commitment",
    ["RC-02", "RC-07"],
    "ADVANCING",
    new RegExp(`^logistics/commitment/${ID}/${ID}$`),
    LogisticsCommitmentSchema,
  ),
  logisticsKind(
    "logistics_transfer",
    ["RC-02", "RC-07", "RC-10"],
    "ADVANCING",
    new RegExp(`^logistics/transfer/${ID}/${ID}$`),
    LogisticsTransferSchema,
  ),
  logisticsKind(
    "logistics_delivery",
    ["RC-02", "RC-08"],
    "SEALED",
    new RegExp(`^logistics/delivery/${ID}/${ID}$`),
    EntityTransitionCauseSchema,
  ),
];

const WS016_LINEAGE =
  "WS-016 Character Capability Protocol v1 — Concept and Working Operational Draft v1, Sovereign-ratified 2026-09-25 (OB-047), with the Blue Bounded Integration Map (F-014A bounded amendment) at the frozen lock pin 2026-09-24T17:38:59.210Z (https://app.notion.com/p/3e220af901e08168b37ccee101d23e49); Concept https://app.notion.com/p/3e220af901e08127a01ce75d75b26783, Operational Draft https://app.notion.com/p/3e220af901e081b881b0ec8b719c0b90";
const WS006_LINEAGE =
  "WS-006 Named Actors — F-014A v3.3 Holder-Relative Referent Keying Amendment, Sovereign-ratified 2026-09-25, with the W3-CP3 PC-Control Handover interface note, at the frozen lock pin 2026-09-25T00:18:36.828Z (https://app.notion.com/p/3e520af901e081619a59c069a36db420); inherits the F-014A v3.2 Character Capability amendment";

/**
 * One governing rule for every Named-Actor kind: the authored establishment basis and the capability-close
 * publication are each one group, and a capability always cites the one basis it was derived from, so every version
 * of every Named-Actor fact records the same citation. The clauses are the ones the state relies on (WS-016 as the
 * shared protocol, WS-006 / F-014A as the owner that holds the facts).
 */
export const NAMED_ACTOR_RULE: SourceRef = rule(
  WS016_SOURCE,
  "§2 Runtime Ownership (Named-Actor capability facts remain owned by F-014A / the lawful Named-Actor owner; no consumer acquires write authority); §3 Minimal Persistent Capability Record (capability, optional comparative marker, provenance pointer, capability-close reference; no fatigue, injury, equipment, observer reputation, KTI corpus, office, relationship or situational state); §4 Persistence Gate (Named Actor: role-defining, recurring, materially consequential or repeatedly required); §6 Grade Semantics (C/B/A/S qualitative, never converted to a number); §7 EX Adapter (EX is not S+); §16 Named-Actor Capability Establishment Adapter (established from lawful pre-existing causes, persisted before the dependent action; no separate RNG); §17 Named-Actor Rarity Guard; §20 Aggregate Boundary and §28 Aggregate Boundary / §28.1 Single-Contribution Rule (no individual sheet for cohorts, populations, institutions or anonymous individuals; promotion changes representation, not headcount); §23 Equipment / Borrowed-Power Guard; §25 Observer / Reputation / Cover Interface (one authoritative capability truth); §27 Temporal / Turnless Behavior and §27.1 Capability Visibility / No Same-Resolution Feedback (cross-owner reads AS-OF-DECLARED-CLOSE); §32 Failure Conditions; with WS-006 / F-014A v3.3 §6 Two-Target Write Rule and the W3-CP3 PC-Control Handover interface note (F-014A is writable only while the entity is under lawful non-PC actor ownership)",
  [WS016_LINEAGE, WS006_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

const namedActorKind = (
  id: (typeof NAMED_ACTOR_FACT_KIND_IDS)[number],
  rc: readonly string[],
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_NAMED_ACTOR,
  facet: FACET_ACTOR_PROFILE,
  im: "IM-07",
  rc,
  lifecycle: "SEALED",
  keyPattern,
  valueSchema,
  rule: NAMED_ACTOR_RULE,
});

/**
 * IM-07 Actor / ACS / Capability Adapter — the NAMED-ACTOR CAPABILITY part only: "capabilities/mastery ... only
 * source-assigned actor/collective/capability facets". WS-016 §2 / the Integration Map §3 assign sparse durable
 * personal mastery of a consequential non-PC Named Actor to F-014A's actor-profile. One owner, one facet, two
 * exclusive actor/capability-keyed key spaces, both create-only (SEALED): the authored establishment basis, and the
 * persisted capability, which exists only as its IM-02 stage — the owner's declared capability close. There is no
 * fallback owner, and no personality, goal, relationship, belief, mandate, development, loss, lifecycle, KTI,
 * aggregate, PC-capability or numeric-rank kind.
 */
export const NAMED_ACTOR_FACT_KINDS: readonly FactKind[] = [
  namedActorKind(
    "named_actor_capability_basis",
    ["RC-02", "RC-09"],
    new RegExp(`^actor/${ID}/capability-basis/${ID}$`),
    NamedActorCapabilityBasisSchema,
  ),
  namedActorKind(
    "named_actor_capability",
    ["RC-02", "RC-03", "RC-04"],
    new RegExp(`^actor/${ID}/capability/${ID}$`),
    NamedActorCapabilitySchema,
  ),
];

const I002_LINEAGE =
  "I-002 Player Character Generation — Working Operational Draft v2, Sovereign-ratified within W3-CP3 / OB-044 2026-09-25, at the frozen lock pin 2026-09-25T00:15:54.536Z (https://app.notion.com/p/5a520af901e0829eadb201bccd6c4718): §2 Ownership Contract (the Existence Contract owns the canonical current intrinsic PC state), §4 Minimum Existence Contract, §21 Generation Hand-Off Test, §26 Sparse Persistence; the ratified I-002 v2.1 Character Capability bounded amendment is the one recorded in the Blue Bounded Integration Map §2 cited above";
const F016_PHASE_2B_PCC_LINEAGE =
  'F-016 Phase 2B §H F-014D CF-2 — PC-Side Capability Cut, pin 2026-09-21T23:18:36.650Z (https://app.notion.com/p/3e220af901e0819daaa4d1cab6cc493e): PCC-01 authoritative PC mastery owner (I-002 / PC-side character-local capability state), PCC-02 the producer close named "PC Capability Close" (a temporal/provenance boundary only, not a new subsystem or duplicate capability state), PCC-03 cross-owner reads AS-OF-DECLARED-CLOSE with Close Basis PC Capability Close; with Phase 2A §G PC-01 (owner identified) and Phase 2B §I KC-T1';

const CAUSAL_DRAW_LINEAGE =
  "F-027 v1.0 + F-027-CD1 v1.0 composed implementation authority: F-027 Final Package v1.0 pin 2026-09-29T00:40:44.707Z (https://app.notion.com/p/3ea20af901e081bc9c55d2c5a49cf639) composed with the Causal Draw Implementation-Authority Addendum, pinned in spec/f027/spec-lock.json `implementation_authority_addenda`; historical F-027 v1.0 is neither rewritten nor superseded";
const I002_EXISTING_ACTOR_OVERLAY_LINEAGE =
  "I-002 v2.1 Character Capability Integration Amendment with its W3-CP3 Composition & Existing-Actor Handover Overlay, observed native pin 2026-09-25T00:15:56.531Z (https://app.notion.com/p/3e220af901e081029b1bd0ea0421d554), and WS-016 Working Operational Draft v1 §16 at its last-edit pin 2026-09-25T00:18:34.584Z (https://app.notion.com/p/3e220af901e081b881b0ec8b719c0b90), each cited for the existing-actor world-prior route and NOT spec-lock pins";

/**
 * The SUPERSEDED thirty-second-slice governing-rule citation for the PC capability kinds, byte-for-byte as every PC capability
 * basis and PC Capability Close committed before the existing-actor world-prior slice was committed under it. It cites
 * neither the PC-Control Handover Contract v1 / I-002 v2.1 existing-actor overlay's world-prior route nor WS-016 §16 nor
 * F-027-CD1, which was true provenance for those facts and is NOT true provenance for a world-prior establishment: it is
 * never stamped on a new write (admission requires `PC_CAPABILITY_RULE`) and is accepted on load ONLY for a PC capability
 * basis of the two predecessor establishments, or a PC capability whose basis is one (see `FactKind.legacyRule`). Existing
 * saves therefore load unchanged, with no migration, rewriting or re-citation of their facts. Its text is frozen: a
 * conformance test pins its hash.
 */
export const PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE: SourceRef = rule(
  WS016_SOURCE,
  "Blue Bounded Integration Map §2 I-002 — BOUNDED AMENDMENT (a compact PC Capability Profile companion state under I-002 ownership for current durable personal mastery; I-002 owns the authoritative current PC mastery fact because it owns the PC's canonical current intrinsic state; KTI does not acquire the PC's personal C/B/A/S/EX fact; no duplicate KTI copy of the personal grade; sparse persistence — current materially useful capability facts only, no exhaustive skill list); WS-016 Draft §2 Runtime Ownership (PC capability facts remain owned by I-002 / the current lawful PC-state owner; no consumer acquires write authority), §3 Minimal Persistent Capability Record (capability, optional comparative marker, provenance pointer, capability-close reference; no fatigue, injury, equipment, observer reputation, KTI corpus, office, relationship or situational state), §4 Persistence Gate (Player Character: explicitly authored or strongly established by accepted generation history), §6 Grade Semantics (C/B/A/S qualitative, never converted to a number), §7 EX Adapter (EX is not S+), §11 PC Generation / Authorship Interface (the compiler derives from accepted claims; no grade from fame or reputation alone; GM/Narrative may not invent PC mastery), §13 PC Deferred-Derivation Adapter and §15 (not implemented: unaccepted or hypothetical content cannot ground a capability), §23 Equipment / Borrowed-Power Guard, §25 one authoritative capability truth, §27 Temporal / Turnless Behavior and §27.1 Capability Visibility / No Same-Resolution Feedback (each actor owner commits persisted capability facts at its declared capability close; every cross-owner consumer reads AS-OF-DECLARED-CLOSE), §28 Aggregate Boundary (agency, not body count), §32 Failure Conditions (duplicate ownership of PC or Named-Actor state, retroactive PC rescue capability); with F-016 Phase 2B PCC-01 to PCC-03 (PC Capability Close)",
  [
    WS016_LINEAGE,
    I002_LINEAGE,
    F016_PHASE_2B_PCC_LINEAGE,
    F017_LINEAGE,
    RUNTIME_TRANSLATION_LINEAGE,
  ],
);

/**
 * One governing rule for both PC capability kinds: the received establishment basis and the PC Capability Close publication
 * are each one group, and a capability always cites the one basis it was derived from, so every version of every PC
 * capability fact records the same citation. The clauses are the ones the state relies on. The primary source is the
 * frozen WS-016 integration map pin that carries the ratified I-002 bounded amendment (the I-002 page at its own lock pin
 * does not yet contain that amendment text, so the I-002 pin is cited in the lineage and never as the origin of the
 * capability clauses).
 *
 * This is the existing-actor world-prior extension of the thirty-second-slice citation
 * (`PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE`): the same source artifact, exact native pin, effective basis and clauses, with the
 * existing-actor route added — the PC-Control Handover Contract v1 and the I-002 v2.1 overlay that invoke WS-016 §16, and
 * F-027-CD1 CD-CC-01 for the Causal Draw consumption. It is the sole citation a new PC capability write may carry.
 */
export const PC_CAPABILITY_RULE: SourceRef = rule(
  WS016_SOURCE,
  "Blue Bounded Integration Map §2 I-002 — BOUNDED AMENDMENT (a compact PC Capability Profile companion state under I-002 ownership for current durable personal mastery; I-002 owns the authoritative current PC mastery fact because it owns the PC's canonical current intrinsic state; KTI does not acquire the PC's personal C/B/A/S/EX fact; no duplicate KTI copy of the personal grade; sparse persistence — current materially useful capability facts only, no exhaustive skill list); WS-016 Draft §2 Runtime Ownership (PC capability facts remain owned by I-002 / the current lawful PC-state owner; no consumer acquires write authority), §3 Minimal Persistent Capability Record (capability, optional comparative marker, provenance pointer, capability-close reference; no fatigue, injury, equipment, observer reputation, KTI corpus, office, relationship or situational state), §4 Persistence Gate (Player Character: explicitly authored or strongly established by accepted generation history), §6 Grade Semantics (C/B/A/S qualitative, never converted to a number), §7 EX Adapter (EX is not S+), §11 PC Generation / Authorship Interface (the compiler derives from accepted claims; no grade from fame or reputation alone; GM/Narrative may not invent PC mastery), §13 PC Deferred-Derivation Adapter and §15 (not implemented: unaccepted or hypothetical content cannot ground a capability), §23 Equipment / Borrowed-Power Guard, §25 one authoritative capability truth, §27 Temporal / Turnless Behavior and §27.1 Capability Visibility / No Same-Resolution Feedback (each actor owner commits persisted capability facts at its declared capability close; every cross-owner consumer reads AS-OF-DECLARED-CLOSE), §28 Aggregate Boundary (agency, not body count), §32 Failure Conditions (duplicate ownership of PC or Named-Actor state, retroactive PC rescue capability); WS-016 Draft §16 Named-Actor Capability Establishment Adapter steps 1–5 as invoked for an already-existing actor that becomes the PC by the PC-Control Handover Contract v1 \"Existing Actor → PC\" item 2 and the I-002 v2.1 W3-CP3 existing-actor overlay (every already-established capability fact is carried; a capability still unresolved at handover remains UNRESOLVED, binding forces no eager close; on a later material trigger the branch-invariant world-prior method, preference-blind, from established world/actor causes — deterministic when the smallest causes sufficiently determine the capability, otherwise a bounded prior fixed by the simulation's existing uncertainty mechanism — committed at the I-002 capability close before the dependent resolution and recorded as compiled I-002 material; never the accepted-Mirror derivation route), with F-027-CD1 CD-CC-01 (the neutral Causal Draw selects an opaque candidate only within the owner's branch-invariant bounded prior; the owner commits its own basis by reference to the committed draw result); with F-016 Phase 2B PCC-01 to PCC-03 (PC Capability Close)",
  [
    WS016_LINEAGE,
    I002_LINEAGE,
    I002_EXISTING_ACTOR_OVERLAY_LINEAGE,
    HANDOVER_SEAM_LINEAGE,
    CAUSAL_DRAW_LINEAGE,
    F016_PHASE_2B_PCC_LINEAGE,
    F017_LINEAGE,
    RUNTIME_TRANSLATION_LINEAGE,
  ],
);

const pcCapabilityKind = (
  id: (typeof PC_CAPABILITY_FACT_KIND_IDS)[number],
  rc: readonly string[],
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_PC_EXISTENCE,
  facet: FACET_PC_CAPABILITY_PROFILE,
  im: "IM-07",
  rc,
  lifecycle: "SEALED",
  keyPattern,
  valueSchema,
  rule: PC_CAPABILITY_RULE,
});

/**
 * IM-07 Actor / ACS / Capability Adapter — the PC CAPABILITY PROFILE part only: "capabilities/mastery ... only
 * source-assigned actor/collective/capability facets". The Integration Map §2 assigns the PC's durable personal mastery to
 * I-002 as a companion state, so this is a second FACET of the one existing PC owner (`pc_existence`), never a second PC
 * capability owner and never the Named-Actor owner. Two exclusive pc/<pc>/capability[-basis]/<capability> key spaces, both
 * create-only (SEALED): the received establishment basis, and the persisted capability, which exists only as its IM-02
 * stage — the PC Capability Close. There is no fallback owner, and no development, loss, deferred derivation, transfer,
 * lifecycle, KTI, aggregate or numeric-rank kind. A PC capability fact committed under the superseded citation still loads
 * (`legacyRule`): the capability record is unchanged, and a basis may carry it only with a predecessor establishment.
 */
export const PC_CAPABILITY_FACT_KINDS: readonly FactKind[] = [
  {
    ...pcCapabilityKind(
      "pc_capability_basis",
      ["RC-02"],
      new RegExp(`^pc/${ID}/capability-basis/${ID}$`),
      PcCapabilityBasisSchema,
    ),
    // only a basis of the two historical establishments may still carry the superseded citation
    legacyRule: {
      rule: PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE,
      admits: (value) => PcCapabilityBasisHistoricalSchema.safeParse(value).success,
    },
  },
  {
    ...pcCapabilityKind(
      "pc_capability",
      ["RC-02", "RC-03", "RC-04"],
      new RegExp(`^pc/${ID}/capability/${ID}$`),
      PcCapabilitySchema,
    ),
    // the capability record is unchanged; the load verifier ties it to a historical basis (a close of a world-prior basis
    // never carries the superseded citation)
    legacyRule: {
      rule: PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE,
      admits: (value) => PcCapabilitySchema.safeParse(value).success,
    },
  },
];

const PC_MOVEMENT_WS010_LINEAGE = `WS-010 Logistics §3.1 Movement Service Request (an interface envelope, not Logistics-owned state: it lives with the requesting owner and transfers no ownership of the moved thing), §10.2 identity, quantity and condition stay with the substantive owner, spec-locked pin ${WS010_SOURCE.native_pin} (${WS010_SOURCE.artifact})`;

/**
 * The PC-side voluntary-movement commitment-of-record and the PC-owned Movement Service Request derived from it (IM-07): the
 * frozen Post-Handover Physical Locus Ownership & Relocation Contract §4 (voluntary movement intent originates only with
 * role.player + permission.player_choice.commit), §8 (precondition: a player-owned movement commitment where movement is
 * voluntary), §10 (request ownership and physical-subject ownership stay separate: a voluntary movement request is PC/player-side)
 * and §14 (a voluntary commitment absent or not player-owned fails closed), with I-002 as the current lawful PC-state owner
 * (intrinsic identity and agency; position and the movement result are never I-002 state, I-002 §4.3) and WS-010 §3.1.
 */
export const PC_MOVEMENT_RULE: SourceRef = rule(
  I002_SOURCE,
  "§2 canonical current PC state is owned by I-002 (intrinsic identity, agency and embodiment topology; the player's voluntary commitment is authored willingness only, never a world result); §4.3 position and other world-locus differences are not I-002 state; with the frozen Post-Handover Physical Locus Ownership & Relocation Contract §4 / §8 / §10 / §14 (the PC-side, player-owned voluntary movement commitment and the PC-owned Movement Service Request)",
  [PC_MOVEMENT_WS010_LINEAGE, PC_LOCUS_CONTRACT_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

const pcMovementKind = (
  id: (typeof PC_MOVEMENT_FACT_KIND_IDS)[number],
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_PC_EXISTENCE,
  facet: FACET_PC_VOLUNTARY_COMMITMENT,
  im: "IM-07",
  rc: ["RC-02"],
  lifecycle: "SEALED",
  keyPattern,
  valueSchema,
  rule: PC_MOVEMENT_RULE,
});

/**
 * Two SEALED, create-only PC-side kinds in a third facet of the one existing PC owner (`pc_existence`), at ONE slot per PC
 * identity: the player's voluntary-movement commitment-of-record, and the PC-owned Movement Service Request (exactly the existing
 * WS-010 §3.1 envelope). One slot per PC is the one-journey constraint of this tranche: a second voluntary movement of the same
 * PC is a version conflict, never a sibling truth. Neither kind is Logistics state, World-State state or a world result.
 */
export const PC_MOVEMENT_FACT_KINDS: readonly FactKind[] = [
  pcMovementKind(
    "pc_movement_commitment",
    new RegExp(`^pc/${ID}/movement/commitment$`),
    PcMovementCommitmentSchema,
  ),
  pcMovementKind(
    "pc_movement_request",
    new RegExp(`^pc/${ID}/movement/request$`),
    MovementServiceRequestSchema,
  ),
];

const CPAA_C1_CANDIDATE = {
  artifact: "https://app.notion.com/p/3fb20af901e081c294cbf534d24de7c0",
  native_pin: "2026-10-16T00:31:39.142Z",
} as const;
const CPAA_C1_DIRECTION_LINEAGE =
  "Sovereign non-final execution direction: CPAA-C1 v0.2 provisional construction authorized, pin 2026-10-16T01:38:29.022Z (https://app.notion.com/p/3fb20af901e0815894edc6581ed9f4f2); RED defect report pin 2026-10-15T23:54:08.840Z (https://app.notion.com/p/3fa20af901e081d19f91d3eb6be48bd7); task OB-058 (https://app.notion.com/p/3fa20af901e081b29bb6d9ad2b7caede)";

/**
 * The governing rule of every CPAA-C1 v0.2 kind. It is a PROVISIONAL CANDIDATE citation, deliberately NOT `pinned-by-spec-lock`: the
 * candidate is unratified, the correction is not a spec-lock pin, and this effective basis is the visible marker that a later
 * ratification, correction or withdrawal changes it (never an implicit promotion).
 */
const cpaaRule = (clause: string): SourceRef => ({
  artifact: CPAA_C1_CANDIDATE.artifact,
  native_pin: CPAA_C1_CANDIDATE.native_pin,
  clause,
  authority_lineage: [
    CPAA_C1_PROVISIONAL,
    CPAA_C1_DIRECTION_LINEAGE,
    PC_MOVEMENT_WS010_LINEAGE,
    RUNTIME_TRANSLATION_LINEAGE,
  ],
  effective_basis: "provisional-candidate-lowering-pending-ratification",
  supersedes: null,
});

export const PC_COLLECTION_COMMITMENT_RULE: SourceRef = cpaaRule(
  "C1 closed class and ownership (PC-side confirmed collection commitment-of-record; a non-intrinsic cause fact, not I-002 intrinsic state; no analogy to other actions), C2 real choice (role.player + permission.player_choice.commit; willingness to attempt only), C3 per-act identity and the Production request mechanically derived from it (WS-003 §13A envelope), C4 admission by re-derivation",
);
export const PC_COLLECTION_MECHANISM_RULE: SourceRef = cpaaRule(
  "C6 / P-1 proposed typed I-002 intrinsic exact-cycle carrier: a typed projection that follows accepted authored intrinsic content (I-002 §8 exact when explicitly authored and timing requires it, §19 PC-local causal bridge, §25 Temporal owns duration); every statement is a verbatim quotation of a cited accepted claim and the cycle quotation states the exact numeral and canonical unit, or no exact completion exists; the F-014B §11 determination is derived (the closed class has no counterpart actor), never authored",
);
export const PC_COLLECTION_REACH_RULE: SourceRef = cpaaRule(
  "C5 / §4.2 physical reach: role.gm + permission.rule.adjudicate interpretive compatibility of separately established owner facts (source path facts, PC mechanism), host-interpreted and quote-anchored, verdict derived by the engine, consumed by Production; scripted hosts prove transport and enforcement only",
);
export const POPULATION_PC_OCCUPANCY_RULE: SourceRef = cpaaRule(
  "C5 / P-2 proposed bounded Population registration of one active PC's individual occupied work interval (F-017 PC-01: owner proposal, Population registration/feasibility, consuming-owner read); not an Occupational Cohort, not Effective Labor Supply, not willingness",
);
export const PRODUCTION_PC_COLLECTION_WORK_RULE: SourceRef = cpaaRule(
  "C4 / C6 Production alone admits feasible physical work and derives the cycles, the causal duration and the earned completion (Timed Work §§3-4, 14) from the owners' committed premises; the existing Production Source Delta, World-State delivery and Reserve inflow are unchanged",
);

const CPAA_C1_D1_DISPOSITION = {
  artifact: "https://app.notion.com/p/3fb20af901e08170b369fdf2353a73d4",
  native_pin: "2026-10-16T04:43:59.946Z",
} as const;
const CPAA_C1_D1_LINEAGE =
  "Sovereign construction-approved non-final handoff: PR #72 same-PR provisional BLUE construction repair authorized (https://github.com/gamerelninorex-bit/Immortalis/pull/72#issuecomment-6208352198); the proposed clause is NOT adopted, NOT ratified and NOT a source-lock amendment";

/**
 * The governing rule of every BLUE clause D-1 (PC Collection Voluntary Cessation) kind. A PROVISIONAL CANDIDATE citation of a
 * PROPOSED clause, deliberately NOT `pinned-by-spec-lock`: its effective basis is the visible marker that a later adoption, change
 * or withdrawal is a bounded change, never an implicit promotion.
 */
const d1Rule = (clause: string): SourceRef => ({
  artifact: CPAA_C1_D1_DISPOSITION.artifact,
  native_pin: CPAA_C1_D1_DISPOSITION.native_pin,
  clause,
  authority_lineage: [
    CPAA_C1_D1_PROVISIONAL,
    CPAA_C1_D1_LINEAGE,
    CPAA_C1_PROVISIONAL,
    PC_MOVEMENT_WS010_LINEAGE,
    RUNTIME_TRANSLATION_LINEAGE,
  ],
  effective_basis: "provisional-candidate-lowering-pending-ratification",
  supersedes: null,
});

const CPAA_C1_V03 = {
  artifact: "https://app.notion.com/p/3fb20af901e08115b141f5e2e55ca37e",
  native_pin: "2026-10-16T07:19:16.351Z",
} as const;
const CPAA_C1_V03_LINEAGE =
  "CPAA-C1 v0.3 design RATIFIED by the Sovereign (ratification record https://app.notion.com/p/3fb20af901e08124a6a8fe243b2ec351, native pin 2026-10-16T07:56:18.556Z; independent RED CONCUR https://app.notion.com/p/3fb20af901e081c6928bc0e6371ff1c1, native pin 2026-10-16T07:43:50.948Z). Ratification is a DESIGN decision only: it is not implementation acceptance, a source-lock amendment or merge authority";

/**
 * The governing rule of the CPAA-C1 v0.3 kinds. The design is ratified, the implementation is not yet accepted and no source lock
 * changed, so the effective basis is neither the pending-ratification marker nor `pinned-by-spec-lock`.
 */
const v03Rule = (clause: string): SourceRef => ({
  artifact: CPAA_C1_V03.artifact,
  native_pin: CPAA_C1_V03.native_pin,
  clause,
  authority_lineage: [
    CPAA_C1_V03_LINEAGE,
    CPAA_C1_D1_PROVISIONAL,
    CPAA_C1_PROVISIONAL,
    RUNTIME_TRANSLATION_LINEAGE,
  ],
  effective_basis: "ratified-design-implementation-acceptance-pending",
  supersedes: null,
});

/**
 * NEWLY AUTHORIZED rules (CPAA-C1 v0.3 bounded semantic delegation): the minimum rules the loop needs to replace two Boolean
 * premises with canonical owner evidence. Not a frozen-source rule and not a spec-lock pin; independent BLUE review is pending.
 */
const CPAA_C1_DELEGATION = {
  artifact: "https://app.notion.com/p/3fb20af901e0818d8406c3c6a422b608",
  native_pin: "2026-10-16T12:07:41.219Z",
} as const;
const CPAA_C1_DELEGATION_LINEAGE =
  "CPAA-C1 v0.3 BOUNDED SEMANTIC DELEGATION: the Sovereign's words, relayed by BLUE on PR #72 comment 6215171891 (https://github.com/gamerelninorex-bit/Immortalis/pull/72#issuecomment-6215171891): “I will allow him to make semantics if this is recommended to get the job finally done”; controlling mission addendum https://app.notion.com/p/3fb20af901e0818d8406c3c6a422b608 (native pin 2026-10-16T12:07:41.219Z). The rule it governs is NEWLY AUTHORIZED, is not attributed to any frozen source, is not a spec-lock pin, and awaits independent BLUE review";
const delegatedRule = (clause: string): SourceRef => ({
  artifact: CPAA_C1_DELEGATION.artifact,
  native_pin: CPAA_C1_DELEGATION.native_pin,
  clause,
  authority_lineage: [CPAA_C1_DELEGATION_LINEAGE, CPAA_C1_V03_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
  effective_basis: "sovereign-bounded-semantic-delegation-independent-review-pending",
  supersedes: null,
});

export const WORLD_SCENE_CLOSURE_RULE: SourceRef = delegatedRule(
  "NEWLY AUTHORIZED World-State scene closure: an ORIGINAL physical setting is declared a closed domain by its author (the domain, its topology, the closure statement and per-source unencumbered rights are AUTHORED canon); what the owners hold at the locus (Population ledgers attached to it, actors coupled to it, Player Characters whose physical locus it is) is DERIVED by World-State at admission and can never be supplied; the closure is CURRENT only while that derivation still equals what it covered, and a stale or missing closure establishes nothing. It grants no right beyond 'no encumbrance is established for this source in this closed domain', suppresses no independent cause and is re-declared by its author, never rewritten: each declaration is a new version derived afresh, and a changed version re-opens every act that rested on the previous one",
);
export const POPULATION_WORKFORCE_SCOPE_RULE: SourceRef = delegatedRule(
  "NEWLY AUTHORIZED Population workforce scope: Population's declaration (AUTHORED statement) that the representations it lists are ALL those bearing on one locality's effective aggregate workforce; the representations (every ledger attached to the locality or one of whose units is present or burdened there) and their identity/count provenance are DERIVED by Population at admission and can never be supplied; the scope is CURRENT only while those ledgers are unchanged and no further one bears on the locality. Only a current scope lets an omitted identity be OUTSIDE; otherwise UNKNOWN. It is not Section 28 labor accounting: no layer tag, headcount arithmetic, cohort, flexible-labor debit or labor token",
);

export const PC_COLLECTION_ATTESTATION_RULE: SourceRef = v03Rule(
  "v0.3 F-2 replacement P-1: the eligible intrinsic premise is a lawfully authored accepted I-002 Capability/Effect claim with an operative Temporal Hook; I-002's declared compiler/adjudicator role.gm attests that the cited content denotes exactly one same-form unit handled by the named actuator in one serial cycle with the stated duration (PC-intrinsic meaning only); role.archivist canonically writes the versioned attestation (attestor role, claim and mechanism versions, accepted meaning, Temporal Hook, effective-before-act); Temporal keeps unit authority; quotation and number/unit matching are necessary but insufficient; no hallucinated attestation, post-commit retrofit or invented rate",
);
export const POPULATION_PC_AGGREGATE_STATUS_RULE: SourceRef = v03Rule(
  "v0.3 F-3 replacement P-2: a distinct Population-owned identity-qualified individual active-PC occupied-interval registration, outside Population section 28 labor-claim accounting (no layer tag, Occupational Draw Reference, headcount, cohort, flexible-labor debit or labor token); Population independently determines the PC's relation to its effective aggregate workforce from its own identity and count provenance: proven outside proceeds on individual occupancy alone, proven included or unknown WITHHOLDS pending a lawful no-double-counting reconciliation",
);

export const PC_COLLECTION_CESSATION_RULE: SourceRef = d1Rule(
  "D-1 proposed PC Collection Voluntary Cessation: the player's separately confirmed request to cease the SAME in-flight collection identity (role.player + permission.player_choice.commit) is a new action cause recorded by the PC-side owner with identity and version provenance, at the canonical time read at the request and strictly before the earned boundary; it is not a claim that earlier work never occurred, not a source status and not a Production cancellation",
);
export const PRODUCTION_PC_COLLECTION_TERMINATION_RULE: SourceRef = d1Rule(
  "D-1 proposed Production terminal disposition: Production alone resolves the terminal status of withdrawn in-flight collection work, derived from the committed cessation request, the work record and the canonical time; it retains the legitimately elapsed progress as evidence, awards no unearned unit (the present all-at-boundary class), leaves the source and the Reserve untouched and releases only Production's own claim on the source",
);
export const POPULATION_PC_OCCUPANCY_TERMINATION_RULE: SourceRef = d1Rule(
  "D-1 proposed Population release: only after Production committed the lawful no-more-work termination of this act is the SAME PC's individual occupied interval released, exactly once; never before, never twice, never by a caller",
);
export const TEMPORAL_PC_COLLECTION_RETIREMENT_RULE: SourceRef = d1Rule(
  "D-1 proposed Temporal retirement: only after Production committed the termination of this act's extraction is that extraction object's pending earned boundary retired (superseded, never resolved) and removed from the boundary index; canonical time, every other object and every other index entry are untouched",
);

const pcCollectionKind = (
  id: (typeof PC_COLLECTION_FACT_KIND_IDS)[number],
  owner: string,
  facet: string,
  im: string,
  rc: readonly string[],
  lifecycle: FactLifecycle,
  keyPattern: RegExp,
  valueSchema: ValueSchema,
  ruleRef: SourceRef,
): FactKind => ({ id, owner, facet, im, rc, lifecycle, keyPattern, valueSchema, rule: ruleRef });

/**
 * CPAA-C1 v0.2 PROVISIONAL CANDIDATE LOWERINGS (not ratified; see `@immortalis/contracts` `pc-collection.ts`). Six kinds, no new
 * owner: the PC-side commitment-of-record and the PC-owned Production Request (the existing PC owner's `pc_voluntary_commitment`
 * facet, in a collection key space disjoint from movement's one-journey slots); the P-1 exact-cycle mechanism (a second PC-owner
 * facet); the physical-reach judgment (the referee provenance facet); Population's P-2 individual occupancy registration (one
 * ADVANCING slot per PC); and Production's work record. All but the occupancy are create-only.
 */
export const PC_COLLECTION_FACT_KINDS: readonly FactKind[] = [
  pcCollectionKind(
    "pc_collection_commitment",
    OWNER_PC_EXISTENCE,
    FACET_PC_VOLUNTARY_COMMITMENT,
    "IM-07",
    ["RC-02", "RC-15", "RC-16"],
    "SEALED",
    new RegExp(`^pc/${ID}/collection/${ID}/commitment$`),
    PcCollectionCommitmentSchema,
    PC_COLLECTION_COMMITMENT_RULE,
  ),
  pcCollectionKind(
    "pc_collection_request",
    OWNER_PC_EXISTENCE,
    FACET_PC_VOLUNTARY_COMMITMENT,
    "IM-07",
    ["RC-02"],
    "SEALED",
    new RegExp(`^pc/${ID}/collection/${ID}/request$`),
    PcCollectionRequestSchema,
    PC_COLLECTION_COMMITMENT_RULE,
  ),
  pcCollectionKind(
    "pc_collection_mechanism",
    OWNER_PC_EXISTENCE,
    FACET_PC_COLLECTION_MECHANISM,
    "IM-07",
    ["RC-02"],
    "SEALED",
    new RegExp(`^pc/${ID}/collection-mechanism/${ID}$`),
    PcCollectionMechanismSchema,
    PC_COLLECTION_MECHANISM_RULE,
  ),
  pcCollectionKind(
    "pc_collection_reach_decision",
    OWNER_REFEREE_KERNEL,
    FACET_REFEREE_PROVENANCE,
    "IM-12",
    ["RC-02", "RC-09", "RC-16"],
    "SEALED",
    new RegExp(`^referee/pc-collection-reach/${ID}/${ID}$`),
    PcCollectionReachDecisionSchema,
    PC_COLLECTION_REACH_RULE,
  ),
  {
    ...pcCollectionKind(
      "population_pc_occupancy",
      OWNER_POPULATION,
      FACET_POPULATION_PC_OCCUPANCY,
      "IM-04",
      ["RC-02", "RC-06"],
      "ADVANCING",
      new RegExp(`^population-pc/${ID}/occupancy$`),
      PopulationPcOccupancySchema,
      POPULATION_PC_OCCUPANCY_RULE,
    ),
    // D-1 (PROVISIONAL): the release after Production's termination carries the Population termination rule; the registration and
    // the denial keep theirs
    alternateRules: [
      {
        rule: POPULATION_PC_OCCUPANCY_TERMINATION_RULE,
        admits: (value: unknown) => {
          const o = PopulationPcOccupancySchema.safeParse(value);
          return o.success && o.data.status === "RELEASED_TERMINATED";
        },
      },
    ],
  },
  pcCollectionKind(
    "production_pc_collection_work",
    OWNER_PRODUCTION,
    FACET_PRODUCTION_STATE,
    "IM-05",
    ["RC-02", "RC-06", "RC-10"],
    "SEALED",
    new RegExp(`^production/pc-collection-work/${ID}$`),
    ProductionPcCollectionWorkSchema,
    PRODUCTION_PC_COLLECTION_WORK_RULE,
  ),
  pcCollectionKind(
    "pc_collection_cessation",
    OWNER_PC_EXISTENCE,
    FACET_PC_VOLUNTARY_COMMITMENT,
    "IM-07",
    ["RC-02", "RC-15", "RC-16"],
    "SEALED",
    new RegExp(`^pc/${ID}/collection/${ID}/cessation$`),
    PcCollectionCessationSchema,
    PC_COLLECTION_CESSATION_RULE,
  ),
  pcCollectionKind(
    "pc_collection_cycle_attestation",
    OWNER_PC_EXISTENCE,
    FACET_PC_COLLECTION_MECHANISM,
    "IM-07",
    ["RC-02", "RC-03", "RC-16"],
    "SEALED",
    new RegExp(`^pc/${ID}/collection-attestation/${ID}$`),
    PcCollectionCycleAttestationSchema,
    PC_COLLECTION_ATTESTATION_RULE,
  ),
  pcCollectionKind(
    "population_pc_representation",
    OWNER_POPULATION,
    FACET_POPULATION_PC_OCCUPANCY,
    "IM-04",
    ["RC-02", "RC-06"],
    "ADVANCING",
    new RegExp(`^population-pc/${ID}/representation$`),
    PopulationPcRepresentationSchema,
    POPULATION_PC_AGGREGATE_STATUS_RULE,
  ),
  pcCollectionKind(
    "world_scene_closure",
    OWNER_WORLD_STATE,
    FACET_WORLD_SCENE_CLOSURE,
    "IM-03",
    ["RC-02", "RC-16"],
    "ADVANCING",
    new RegExp(`^world/${ID}/locus/${ID}/scene-closure$`),
    WorldSceneClosureSchema,
    WORLD_SCENE_CLOSURE_RULE,
  ),
  pcCollectionKind(
    "population_workforce_scope",
    OWNER_POPULATION,
    FACET_POPULATION_WORKFORCE_SCOPE,
    "IM-04",
    ["RC-02", "RC-06"],
    "ADVANCING",
    new RegExp(`^population-scope/${ID}/${ID}/workforce$`),
    PopulationWorkforceScopeSchema,
    POPULATION_WORKFORCE_SCOPE_RULE,
  ),
  pcCollectionKind(
    "production_pc_collection_termination",
    OWNER_PRODUCTION,
    FACET_PRODUCTION_STATE,
    "IM-05",
    ["RC-02", "RC-06", "RC-10"],
    "SEALED",
    new RegExp(`^production/pc-collection-termination/${ID}$`),
    ProductionPcCollectionTerminationSchema,
    PRODUCTION_PC_COLLECTION_TERMINATION_RULE,
  ),
];

/**
 * CPAA-C1 v0.2 PROVISIONAL — the PC-owned start publishes the extraction, the key's account holding the commitment and Production's
 * work record as ONE atomic group, and a group has one governing rule. That group is governed by `PRODUCTION_PC_COLLECTION_WORK_RULE`,
 * which the extraction and the account may carry ONLY for a PC-owned value (additive: it supersedes nothing and never relaxes the
 * drawdown rule they carry for every other request). Admission requires the PC-owned start to carry it, and load verification checks
 * that no other extraction does. `SOURCE_DRAWDOWN_FACT_KINDS` itself is unchanged.
 */
const isPcOwnedExtraction = (value: unknown): boolean => {
  const e = ProductionExtractionSchema.safeParse(value);
  return e.success && e.data.request.owner === "pc_existence";
};
const holdsPcOwnedCommitment = (value: unknown): boolean => {
  const a = SourceAccountSchema.safeParse(value);
  return a.success && a.data.open.some((o) => o.extraction_id.startsWith("pc-collect:"));
};
const SOURCE_DRAWDOWN_FACT_KINDS_WITH_PC_COLLECTION_START: readonly FactKind[] =
  SOURCE_DRAWDOWN_FACT_KINDS.map((k) =>
    k.id === "production_extraction" || k.id === "production_source_account"
      ? {
          ...k,
          alternateRules: [
            {
              rule: PRODUCTION_PC_COLLECTION_WORK_RULE,
              admits:
                k.id === "production_extraction" ? isPcOwnedExtraction : holdsPcOwnedCommitment,
            },
            // D-1 (PROVISIONAL): the termination group writes the key's account (releasing Production's own claim) under the
            // termination rule; admission requires that group to be exactly the termination record plus that account
            ...(k.id === "production_source_account"
              ? [
                  {
                    rule: PRODUCTION_PC_COLLECTION_TERMINATION_RULE,
                    admits: (value: unknown) => SourceAccountSchema.safeParse(value).success,
                  },
                ]
              : []),
          ],
        }
      : k,
  );

/**
 * D-1 (PROVISIONAL) — the retirement of a terminated extraction's pending boundary writes the extraction's temporal object and the
 * boundary index as ONE group governed by `TEMPORAL_PC_COLLECTION_RETIREMENT_RULE` (additive: it supersedes nothing and relaxes
 * nothing; every transaction keeps `KERNEL_RULE`). Admission requires a group carrying it to be exactly that retirement.
 */
const TEMPORAL_FACT_KINDS_WITH_PC_COLLECTION_RETIREMENT: readonly FactKind[] =
  TEMPORAL_FACT_KINDS.map((k) =>
    k.id === "temporal_object" || k.id === "temporal_boundary_index"
      ? {
          ...k,
          alternateRules: [
            {
              rule: TEMPORAL_PC_COLLECTION_RETIREMENT_RULE,
              admits: (value: unknown) =>
                k.id === "temporal_object"
                  ? TemporalObjectSchema.safeParse(value).success
                  : BoundaryIndexSchema.safeParse(value).success,
            },
          ],
        }
      : k,
  );

const CAUSAL_DRAW_RED_CLEARANCE =
  "Independent Red delta review PASS at this exact native pin 2026-10-02T15:11:03.450Z, unchanged since clearance (Twenty-Sixth Bounded Vertical Slice construction brief)";

/**
 * One governing rule for both Causal Draw kinds: the precommit and the result are each one group governed by the pinned
 * F-027-CD1 v1.0 SourceRef (CDP-01 "The precommit commit is governed by the pinned F-027-CD1 v1.0 SourceRef"; CDO-01 and
 * CDC-01 carry the same pair). `supersedes` is null: CD1 composes with F-027, it replaces nothing.
 */
export const CAUSAL_DRAW_RULE: SourceRef = {
  artifact: F027_CD1_SOURCE.artifact,
  native_pin: F027_CD1_SOURCE.native_pin,
  clause:
    "§3 Authority and ownership boundary (causal_draw_kernel / draw_provenance, infrastructure-only RC-09 evidence owner/facet); §4 CDK-01 CausalDrawKey; §5 CDK-02 CD-CANON-1 and draw_id; §6 CDS-01; §7 CDS-02 prior normalization; §8 CDR-01 deterministic-first gate; §9 CDE-01 entropy and precommitment; §10 CDP-01 durable precommit record; §11 CDA-01 IMMORTALIS_WEIGHTED_FINITE_V1; §12 CDO-01 durable result record; §13 CDC-01 RC-09 / RC-16 composition; §14 CDR-02 retry, replay, recovery and partition law; §15 CDV-01 algorithm/version compatibility",
  authority_lineage: [CAUSAL_DRAW_LINEAGE, CAUSAL_DRAW_RED_CLEARANCE, RUNTIME_TRANSLATION_LINEAGE],
  effective_basis: "pinned-by-spec-lock",
  supersedes: null,
};

const causalDrawKind = (
  id: (typeof CAUSAL_DRAW_FACT_KIND_IDS)[number],
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_CAUSAL_DRAW_KERNEL,
  facet: FACET_DRAW_PROVENANCE,
  im: "IM-12",
  rc: ["RC-02", "RC-09", "RC-16"],
  lifecycle: "SEALED",
  keyPattern,
  valueSchema,
  rule: CAUSAL_DRAW_RULE,
});

/**
 * F-027-CD1 §3: `causal_draw_kernel / draw_provenance`, an INFRASTRUCTURE-ONLY RC-09 evidence owner/facet. IM-03 routes
 * only the two Causal Draw provenance key spaces below to it; IM-12 retains the committed evidence; IM-11/IM-17
 * publish and persist it. Both kinds are SEALED, i.e. create-only (`expected_version = 0`; no update, replacement or
 * deletion after commitment). This registration creates no authority to write any substantive world fact and is not a
 * generic fallback owner: the keys are `causal-draw/<64 lowercase hex>/precommit` and `.../result`, nothing else.
 */
export const CAUSAL_DRAW_FACT_KINDS: readonly FactKind[] = [
  causalDrawKind(
    "causal_draw_precommit",
    /^causal-draw\/([0-9a-f]{64})\/precommit$/,
    CausalDrawPrecommitSchema,
  ),
  causalDrawKind(
    "causal_draw_result",
    /^causal-draw\/([0-9a-f]{64})\/result$/,
    CausalDrawResultSchema,
  ),
];

const CJA1_LINEAGE =
  "F-027-CJA1 Culture Judgment Adjudication, BLUE-reconciled v1.1 bounded implementation-authority addendum (TXT SHA-256 b099a6dea0b225790b944e019a27c3b87714a269720073344ea1229b4b617c67), Sovereign-approved 2026-10-09 (https://app.notion.com/p/3f420af901e0815dae8ac3912a1214fe) on the two bounded decisions only: not native-pinned, not in the F-027 spec lock, not RED-confirmed at v1.1; its identifiers are PROPOSED technical encodings, not frozen Culture identifiers. Implemented here as the consumer-free prerequisite under the bounded direct-repair work order of 2026-10-09 (https://app.notion.com/p/3f420af901e081bb88fcebfc9edf0801); composes with, and does not amend, frozen Culture & Society v2 (Concept https://app.notion.com/p/3e720af901e081009232f2efa9b7a1ff, Operational Draft https://app.notion.com/p/3e720af901e0817abf2df04f13bd90ad) and the F-027-CD1 pattern (not authority)";

/**
 * One governing rule for the adjudication kind: the create-only RC-09 judgment record is one group governed by the
 * Sovereign-approved CJA1 v1.1 text. `effective_basis` states exactly what that is: approved, not native-pinned, not
 * spec-locked. `supersedes` is null.
 */
export const CJA1_RULE: SourceRef = {
  artifact: F027_CJA1_SOURCE.artifact,
  native_pin: F027_CJA1_SOURCE.native_pin,
  clause:
    "§2 Non-substantive RC-09 adjudication provenance (culture_adjudication_kernel / adjudication_provenance, infrastructure-only; one create-only record per culture update id regardless of outcome); §3 CJA-ID1 identity contract (trigger_ref, causal_process_id, fixed opportunity CJA_V1_SINGLE_EVALUATION, distinction_digest, culture_update_id, decision id/key/group/intent; canonical plain-JSON hashing with ill-formed Unicode refused before serialization); §6 CJA-R1 adjudication record (exact citation closure, verdict/finding coherence, structural refusal distinct from substantive verdicts); §7 CJA-OP1 authority, creation and atomic publication (trusted in-process role.gm + permission.rule.adjudicate checked first, archivist publication, stable RC-16 identity); §9.1 consumer-free prerequisite with the CultureAdjudicationContextPort and PopulationCloseScopeVerifier boundaries; §10.A acceptance; §11 refusal classes; no Culture manifestation, Population Cohort, GIP, KTI, ASR, belief, economic or world fact is written",
  authority_lineage: [CJA1_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
  effective_basis: "sovereign-approved-not-native-pinned-not-spec-locked",
  supersedes: null,
};

const cjaKind = (
  id: (typeof CULTURE_ADJUDICATION_FACT_KIND_IDS)[number],
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_CULTURE_ADJUDICATION_KERNEL,
  facet: FACET_ADJUDICATION_PROVENANCE,
  im: "IM-12",
  rc: ["RC-02", "RC-09", "RC-16"],
  lifecycle: "SEALED",
  keyPattern,
  valueSchema,
  rule: CJA1_RULE,
});

/**
 * CJA1 §2.1: `culture_adjudication_kernel / adjudication_provenance`, an INFRASTRUCTURE-ONLY RC-09 adjudication-provenance
 * owner/facet, distinct from `causal_draw_kernel`. IM-03 routes only the dedicated key space
 * `adjudication-culture/<64 lowercase hex>/decision` to it; IM-12 retains the committed record; IM-11/IM-17 publish and
 * persist it. The kind is SEALED, i.e. create-only. This registration is not a substantive Culture owner, creates no authority
 * to write any Culture manifestation, Population, GIP, KTI, ASR, belief, economic or world fact, and is not a generic
 * fallback owner.
 */
export const CULTURE_ADJUDICATION_FACT_KINDS: readonly FactKind[] = [
  cjaKind(
    "culture_adjudication_decision",
    /^adjudication-culture\/([0-9a-f]{64})\/decision$/,
    CjaDecisionRecordSchema,
  ),
];

/**
 * B61-A3 — the host-callable AI referee of PR #61 (the Sovereign's Option B, "no paid API" correction, 11 October 2026): the two
 * bounded interpretation tasks (I-002 character-claim classification; IR native/compatibility) whose host answers the engine
 * validates and retains. Like the CJA1 record, this rule is Sovereign-approved and NOT native-pinned or spec-locked: `artifact`
 * is the construction brief and `native_pin` its observed last-edit stamp at construction, a provisional reference and never a
 * promoted authority status. The frozen design it applies (I-002, IR, WG, the Role Registry) is cited by exact pin in the lineage.
 */
export const REFEREE_B61_A3_SOURCE = {
  artifact: "https://app.notion.com/p/3f620af901e081c7a044eddf02503ec3",
  native_pin: "2026-10-11T02:46:54.896Z",
} as const;

const REFEREE_LINEAGE =
  "BLUE B61-A3 No-Paid-API Host-Driven AI Referee Construction Brief, pin 2026-10-11T02:46:54.896Z (https://app.notion.com/p/3f620af901e081c7a044eddf02503ec3) under the Sovereign Option B approvals (https://app.notion.com/p/3f620af901e081faaf00da0cc6e4068b, 2026-10-11T02:31:00.727Z; https://app.notion.com/p/3f620af901e081ddb9b5e6d4f9ff080b, 2026-10-11T02:44:51.553Z); frozen I-002 Player Character Generation Working Operational Draft v2 §§2.1, 6, 7, 21 pin 2026-09-25T00:15:54.536Z (https://app.notion.com/p/5a520af901e0829eadb201bccd6c4718); Player-World Insertion & Reconciliation Working Operational Draft v1 §§3, 5, 7, 9, 18 pin 2026-09-25T00:17:26.287Z (https://app.notion.com/p/3e320af901e081a3a669c1c0b842c9df); Canonical Role Registry v1 role.gm + permission.rule.adjudicate pin 2026-09-25T08:21:22.816Z (https://app.notion.com/p/3e620af901e081f68ff1d0cc574e041a)";

export const REFEREE_RULE: SourceRef = {
  artifact: REFEREE_B61_A3_SOURCE.artifact,
  native_pin: REFEREE_B61_A3_SOURCE.native_pin,
  clause:
    "§3 Smallest two-way tool tasks and rightful owners: one create-only decision record per task (I-002 character-claim classification or IR native/compatibility), the verdict derived by the engine from a host's validated answer and never taken from it; infrastructure-only provenance (referee_adjudication_kernel / referee_provenance), created once, immutable, replayable; role.gm + permission.rule.adjudicate bound by the trusted operation and never by the answer",
  authority_lineage: [REFEREE_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
  effective_basis: "sovereign-approved-not-native-pinned-not-spec-locked",
  supersedes: null,
};

/**
 * The physical-placement decision's own governing citation (BLUE v5.1 brief, pin 2026-10-11T05:30:16.307Z): an exclusive current
 * rule for the `IR_PHYSICAL_PLACEMENT` value class (see `FactKind.alternateRules`); the I-002 and IR decisions keep `REFEREE_RULE`.
 */
export const REFEREE_PHYSICAL_RULE: SourceRef = {
  artifact: ORIGINAL_PC_CUSTODY_BRIEF_SOURCE.artifact,
  native_pin: ORIGINAL_PC_CUSTODY_BRIEF_SOURCE.native_pin,
  clause:
    "§3 Sole bounded objective (a bounded, genuinely semantic qualification of physical, single-locus, originally present and world-compatible placement; distinct host-neutral, campaign-scoped IR/GM qualification and immutable source-bound evidence; the engine checks the evidence, identity, current source versions and correct privileged authority) and §4 steps 2-3 (the interpretation decides only whether this accepted PC and explicit native statement support one spatial physical subject at exactly this locus under the committed world; role.gm / permission.rule.adjudicate distinct from the player's choice and from role.archivist / permission.canon.write; the host never submits a naked canonical placement verdict)",
  authority_lineage: [REFEREE_LINEAGE, ORIGINAL_PC_PLACEMENT_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
  effective_basis: "blue-bounded-brief-not-spec-locked",
  supersedes: null,
};

/**
 * BLUE v5.2 Implementation Brief — Active-PC Direct Physical Observation (a construction source, NOT a spec-lock pin), and the BLUE
 * Targeted Physical Observation Engineering Resolution it rests on (the governing engineering source named by the brief).
 */
export const OBSERVATION_BRIEF_SOURCE = {
  artifact: "https://app.notion.com/p/3fa20af901e081578dc7ff7b62c60873",
  native_pin: "2026-10-15T02:24:15.992Z",
} as const;
export const OBSERVATION_RESOLUTION_SOURCE = {
  artifact: "https://app.notion.com/p/3fa20af901e08157ac91eb3295d02968",
  native_pin: "2026-10-15T02:16:11.867Z",
} as const;

const OBSERVATION_LINEAGE = `BLUE v5.2 Implementation Brief — Active-PC Direct Physical Observation, verified native pin ${OBSERVATION_BRIEF_SOURCE.native_pin} (${OBSERVATION_BRIEF_SOURCE.artifact}), cited as the construction objective and acceptance boundary only (NOT a game-design source, NOT a spec-lock pin); governing engineering resolution BLUE WORK — Targeted Physical Observation Engineering Resolution, verified engineering pin ${OBSERVATION_RESOLUTION_SOURCE.native_pin} (${OBSERVATION_RESOLUTION_SOURCE.artifact}); F-014D Epistemic Access §2 (route, actual payload, receipt and sensory availability are Epistemic-owned; world truth is not), §5 steps 2-4 and §6 Direct Perception Adapter (apply actual sensory position/range/obstruction/channel; form only the perceptible payload; inference is handed off) at the frozen lock pin ${F014D_SOURCE.native_pin} (${F014D_SOURCE.artifact}); I-002 §4.3 (position and world-locus differences are not I-002 state; no sensory ability is invented from a label), spec-locked pin ${I002_SOURCE.native_pin} (${I002_SOURCE.artifact}); IR §§5, 7 (explicit player-authored placement fact; no silent invention of material insertion facts), spec-locked pin ${IR_SOURCE.native_pin} (${IR_SOURCE.artifact}); WG Ownership Guards (World-State establishes physical setting facts and exposure conditions, not a recipient's knowledge, PC intrinsic capability or actor response), spec-locked pin ${WG_SOURCE.native_pin} (${WG_SOURCE.artifact}); Canonical Role Registry v1: \`role.gm\` / \`permission.rule.adjudicate\` interprets, \`role.resolver\` / \`permission.resolution.execute\` validates, \`role.archivist\` / \`permission.canon.write\` commits`;

/**
 * The direct-perception decision's own governing citation: an exclusive current rule for the \`F014D_DIRECT_PERCEPTION\` value class
 * (see \`FactKind.alternateRules\`); the I-002, IR and physical-placement decisions keep their own.
 */
export const REFEREE_OBSERVATION_RULE: SourceRef = {
  artifact: OBSERVATION_BRIEF_SOURCE.artifact,
  native_pin: OBSERVATION_BRIEF_SOURCE.native_pin,
  clause:
    "Objective and route A-B (one separately authorized F-014D direct-perception operation through the existing provider-neutral referee pattern: a bounded, source-pinned physical context of ONE current basis; the interpretation accounts for each material premise, anchored to supplied evidence, and derives no numeric threshold; an unresolved fork is UNRESOLVED and never proof of obstruction; role.gm / permission.rule.adjudicate interprets, the engine validates and derives the verdict, and the retained record is create-only RC-09/IM-12 provenance, not a second physical-truth or PC-knowledge ledger)",
  authority_lineage: [REFEREE_LINEAGE, OBSERVATION_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
  effective_basis: "blue-bounded-brief-not-spec-locked",
  supersedes: null,
};

/**
 * `referee_adjudication_kernel / referee_provenance`: an INFRASTRUCTURE-ONLY adjudication-provenance owner/facet, distinct from the
 * Culture one. IM-03 routes only the dedicated key space `referee/<64 lowercase hex>/decision` to it; the kind is SEALED, i.e.
 * create-only. It authorizes no write of any world, PC, binding, Culture, Population, GIP, KTI or economic fact, and is no
 * generic fallback owner: the I-002 release and the Role Registry binding remain their owners' alone.
 */
export const REFEREE_FACT_KINDS: readonly FactKind[] = [
  {
    id: "referee_decision",
    owner: OWNER_REFEREE_KERNEL,
    facet: FACET_REFEREE_PROVENANCE,
    im: "IM-12",
    rc: ["RC-02", "RC-09", "RC-16"],
    lifecycle: "SEALED",
    keyPattern: /^referee\/([0-9a-f]{64})\/decision$/,
    valueSchema: RefereeDecisionRecordSchema,
    rule: REFEREE_RULE,
    alternateRules: [
      {
        rule: REFEREE_PHYSICAL_RULE,
        admits: (value) => {
          const r = RefereeDecisionRecordSchema.safeParse(value);
          return r.success && r.data.operation === REFEREE_OP_PHYSICAL;
        },
      },
      {
        rule: REFEREE_OBSERVATION_RULE,
        admits: (value) => {
          const r = RefereeDecisionRecordSchema.safeParse(value);
          return r.success && r.data.operation === REFEREE_OP_OBSERVATION;
        },
      },
    ],
  },
];

const F014D_LINEAGE =
  "F-014D Epistemic Access — Working Operational Draft v2 (Epistemic Access, Provenance & Information Channels), Sovereign-ratified 2026-09-20 with the W1-PS2 provenance-split amendment (Sealed Engine Provenance vs Accessible Content Packet) Sovereign-ratified 2026-09-25, at the frozen lock pin 2026-09-24T16:25:17.059Z (https://app.notion.com/p/3e020af901e08103b81aec5f7119318e); Concept v3 https://app.notion.com/p/3e020af901e081fca9c0c7213b720124";

/**
 * The SUPERSEDED tenth-slice governing-rule citation for the Epistemic Access kinds, byte-for-byte as every access event,
 * Accessible Content Packet and Sealed Engine Provenance committed before the active-PC recipient slice was committed under
 * it. It cites the F-014A actor-profile capability close as the one representational-capability read, which was true
 * provenance for those facts and is NOT true provenance for an active-PC recipient's facts, whose capability dependency is the
 * I-002 PC capability at the PC Capability Close: it is never stamped on a new write (admission requires
 * `EPISTEMIC_ACCESS_RULE`) and is accepted on load ONLY for facts of the predecessor value class (see `FactKind.legacyRule`).
 * Existing saves therefore load unchanged, with no migration, rewriting or re-citation of their facts. Its text is frozen: a
 * conformance test pins its hash.
 */
export const EPISTEMIC_ACCESS_RULE_TENTH_SLICE: SourceRef = rule(
  F014D_SOURCE,
  "§2 Ownership Contract (F-014D owns the causal route, source/carrier provenance, actual payload, receipt/access, representational-intelligibility prerequisites and the immutable Access / Dissemination Event modes; it does not own comprehension, inference, credibility, belief, stance, decision, capability, objective truth, KTI state or Temporal Knowledge Time); §2.1 R-T1 (F-014A actor-profile representational capability read AS-OF-DECLARED-CLOSE, Close Basis = F-014A actor-profile capability close, never written by F-014D; the sealed Accessible Content Packet is consumed AS-OF-NOW after packet formation; same-resolution cycle cut; mode-consumer invariant; role-context rule — Sealed Engine Provenance is not an admissible actor input); §4.1 Epistemic Access Packet (Presented Source Attribution vs Sealed Engine Provenance); §4.2 Access / Dissemination Event — BOUNDED_SHARED_ACCESS mode (explicit named participant set; mode fixed at creation and immutable; no cohort backfill); §5 steps 2–4 and 6 (causal route, actual payload, receipt and representational intelligibility distinct from comprehension; persist, compress or discard); §9 Shared / Cohort Access Adapter; §11 conflicting content (Presented Source Attribution vs Sealed Engine Provenance kept separately); §14 Sparse Persistence and Lifecycle (lifecycle change never mutates an event's mode); §18 Named Actor / Actor Fidelity Handoff (Accessible Content Packet excludes Sealed Engine Provenance); §21 Temporal and Causality Rules (no epistemic effect precedes its causal route; resolved past access is not rewritten); §24 Failure Conditions; RC-11 SealedContext / AccessEvent and RC-14 Projection guard",
  [F014D_LINEAGE, WS016_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * One governing rule for every Epistemic Access kind: the authored BOUNDED_SHARED_ACCESS event and the packet formation
 * (the actor-safe packet and its engine-only sealed provenance, written together) are each one group. The clauses are the
 * ones the state relies on (F-014D as the owner that holds the facts; WS-016 §27.1 and F-017 §3 for the capability-close read).
 *
 * This is the active-PC extension of the tenth-slice citation (`EPISTEMIC_ACCESS_RULE_TENTH_SLICE`): the same source artifact,
 * exact native pin, effective basis and clauses (the whole predecessor clause is its prefix), with the one added route the
 * state now relies on for the canonically bound active Player Character recipient — the Canonical Role Registry v1 binding that
 * classifies it, and I-002 / WS-016 §27.1 / F-016 Phase 2B PCC-01 to PCC-03 for the PC capability read AS-OF-DECLARED-CLOSE at
 * the "PC Capability Close". It is the sole citation a new Epistemic write may carry, for the Named-Actor path as for the PC.
 */
export const EPISTEMIC_ACCESS_RULE: SourceRef = rule(
  F014D_SOURCE,
  EPISTEMIC_ACCESS_RULE_TENTH_SLICE.clause +
    '; and, for the one canonically bound active Player Character recipient only (Canonical Role Registry v1 binding role.player_character classifies the recipient; I-002 §2 Ownership Contract and WS-016 §27.1 with F-016 Phase 2B PCC-01 to PCC-03: the capability on which the payload\'s representational form depends is the I-002 PC capability, read AS-OF-DECLARED-CLOSE at the Close Basis named "PC Capability Close", never written, interpreted, thresholded or converted by F-014D and never a fallback from or to the F-014A actor-profile capability close; the Named-Actor path is unchanged)',
  [
    F014D_LINEAGE,
    WS016_LINEAGE,
    I002_LINEAGE,
    F016_PHASE_2B_PCC_LINEAGE,
    ROLE_REGISTRY_LINEAGE,
    F017_LINEAGE,
    RUNTIME_TRANSLATION_LINEAGE,
  ],
);

/**
 * The governing-rule citation of a BROADCAST_EXPOSURE Access / Dissemination Event (F-014D §4.4): the same source artifact,
 * exact native pin and effective basis as `EPISTEMIC_ACCESS_RULE`, with the clauses THIS mode relies on and nothing of the
 * recipient-event path's capability close or Player Character route (a broadcast event reads no capability and names no
 * recipient). It is the only citation a new BROADCAST_EXPOSURE event may carry; `EPISTEMIC_ACCESS_RULE` is unchanged and remains
 * the only citation of every BOUNDED_SHARED_ACCESS event, packet and provenance, so no existing fact is rewritten, re-cited or
 * migrated.
 */
export const EPISTEMIC_ACCESS_BROADCAST_RULE: SourceRef = rule(
  F014D_SOURCE,
  "§2 Ownership Contract (F-014D owns the causal route, source/carrier provenance, actual payload and the immutable Access / Dissemination Event modes; it does not own individual receipt of an unlowered broadcast, comprehension, inference, credibility, belief, stance, decision, KTI state or Temporal Knowledge Time); §2.1 mode-consumer invariant (an unlowered BROADCAST_EXPOSURE event is never itself individual receipt or access-established evidence, and every consumer of an Access / Dissemination Event discriminates on mode) and role-context rule (Sealed Engine Provenance is not an admissible actor input); §4.4 Access / Dissemination Event — BROADCAST_EXPOSURE mode (one immutable event retaining event identity and causal basis, payload/provenance, reach/channel conditions, an authoritative area/cohort/population audience reference and material exclusions or known exceptions, instead of recipient copies; individual receipt is lowered only when consequential, using event-basis reach, presence, attention/channel conditions and §21.11, which is NOT implemented here; it creates no individual belief, memory or competence and writes no Population, Culture or KTI aggregate-exposure state); §4.2 and §21.12 (the mode and the original audience reference are fixed at creation from event-basis evidence and never reclassified; a later live roster never backfills earlier participation); §5 steps 2 and 6 (causal route; persist, compress or discard); §9 and §13 (an unlowered BROADCAST_EXPOSURE event is not individual receipt evidence and copies no aggregate state); §14 Sparse Persistence and Lifecycle (lifecycle change never mutates an event's mode or audience reference; cold-provenance retirement is NOT implemented); §21 Temporal and Causality Rules (no epistemic effect precedes its causal route; no post-basis knowledge); §21.11–12 Past-Basis (only state established as of the causal basis may establish the event; foreign records carry no past-basis time stamp, so only the current canonical basis is admitted and an earlier basis fails closed); §23 Scaling Rules (no per-recipient copies, roster expansion or world scan); §24 Failure Conditions; RC-11 SealedContext / AccessEvent and RC-14 Projection guard; foreign World-State locus and Population ledger/Cohort identities are scope references only, never evidence of individual receipt",
  [F014D_LINEAGE],
);

/**
 * The governing-rule citation of an OBSERVATION-EARNED BOUNDED_SHARED_ACCESS event (BLUE v5.2): the event the Epistemic owner derives from a
 * retained F014D_DIRECT_PERCEPTION referee decision whose engine-derived verdict is OBSERVATION_ESTABLISHED (F-014D §6 Direct Perception
 * Adapter: read authoritative world state at the lawful observation basis; apply actual sensory position/range/obstruction/channel;
 * form only the perceptible payload). It is the only citation under which the owner commits such an event; the authored event keeps
 * \`EPISTEMIC_ACCESS_RULE\` byte for byte, and no existing fact is rewritten, re-cited or migrated.
 */
export const EPISTEMIC_ACCESS_OBSERVATION_RULE: SourceRef = rule(
  F014D_SOURCE,
  "§2 Ownership Contract (F-014D owns the causal route, source/carrier provenance, actual payload, receipt/access and representational-intelligibility prerequisites such as sensory availability; it does not own objective world truth, hidden-state generation, comprehension, inference, credibility, belief/stance or decision); §2.1 R-T1 (current source/carrier/world facts read AS-OF-NOW; the sealed Accessible Content Packet consumed AS-OF-NOW after packet formation) and role-context rule (Sealed Engine Provenance is not an admissible actor input); §3 Consequential Epistemic Trigger (narrative legality: the distinction between world truth and recipient-accessible content materially affects what may be presented); §4.2 BOUNDED_SHARED_ACCESS mode (explicit named participant, mode fixed at creation and immutable); §5 steps 2-4 (establish the causal route source → channel → recipient; resolve the actual payload at the correct basis; resolve receipt and whether the relevant sensory modality is available — never comprehension, significance, inference, credibility, belief or action); §6 Direct Perception Adapter (read authoritative world state at the lawful observation basis; apply actual sensory position/range/obstruction/channel; form only the perceptible payload; perception does not grant ontology); §14 Sparse Persistence and Lifecycle; §18 Accessible Content Packet excludes Sealed Engine Provenance; §21.1 no epistemic effect precedes its causal access route; §24 Failure Conditions (authority = receipt, record exists = actor knows, access = comprehension, narrative revelation creating access, backdated access); and, for this observation-earned event only, the retained F014D_DIRECT_PERCEPTION decision of the BLUE v5.2 Implementation Brief (pin " +
    OBSERVATION_BRIEF_SOURCE.native_pin +
    ") from which every field of the event is derived and which is read, never copied",
  [
    F014D_LINEAGE,
    OBSERVATION_LINEAGE,
    I002_LINEAGE,
    ROLE_REGISTRY_LINEAGE,
    RUNTIME_TRANSLATION_LINEAGE,
  ],
);

const epistemicKind = (
  id: (typeof EPISTEMIC_ACCESS_FACT_KIND_IDS)[number],
  rc: readonly string[],
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_EPISTEMIC_ACCESS,
  facet: FACET_EPISTEMIC_ACCESS,
  im: "IM-10",
  rc,
  lifecycle: "SEALED",
  keyPattern,
  valueSchema,
  rule: EPISTEMIC_ACCESS_RULE,
});

/**
 * IM-10 Epistemic / Access Router — the BOUNDED_SHARED_ACCESS part only: "create and preserve lawful access-event mode,
 * payload/carrier basis, audience/participant evidence, receipt/comprehension distinctions"; "access/provenance records
 * where F-014D owns them; never foreign world facts". One owner, one facet, three exclusive create-only (SEALED) key
 * spaces: the engine-side access event, the actor-safe Accessible Content Packet and the engine-only Sealed Engine
 * Provenance (the packet and the provenance exist only as the packet-formation stage). There is no fallback owner, and no
 * broadcast, cohort, retrieval, message, memory, comprehension, credibility, belief, stance, KTI or numeric-score kind.
 */
export const EPISTEMIC_ACCESS_FACT_KINDS: readonly FactKind[] = [
  {
    ...epistemicKind(
      "epistemic_access_event",
      ["RC-11"],
      new RegExp(`^access/${ID}/event$`),
      AccessDisseminationEventSchema,
    ),
    alternateRules: [
      {
        rule: EPISTEMIC_ACCESS_BROADCAST_RULE,
        admits: (value) => BroadcastExposureEventSchema.safeParse(value).success,
      },
      {
        // an observation-earned event: the active Player Character, the PERCEPTION channel, a form that depends on no capability
        rule: EPISTEMIC_ACCESS_OBSERVATION_RULE,
        admits: (value) => {
          const e = AccessEventSchema.safeParse(value);
          return (
            e.success &&
            e.data.recipient_role === RECIPIENT_ROLE_PLAYER_CHARACTER &&
            e.data.channel === "PERCEPTION" &&
            e.data.representation === null
          );
        },
      },
    ],
    // only an event that asserts no active-PC recipient role may still carry the superseded citation
    legacyRule: {
      rule: EPISTEMIC_ACCESS_RULE_TENTH_SLICE,
      admits: (value) => {
        const e = AccessEventSchema.safeParse(value);
        return e.success && e.data.recipient_role === undefined;
      },
    },
  },
  {
    ...epistemicKind(
      "epistemic_accessible_packet",
      ["RC-11", "RC-14", "RC-03", "RC-04"],
      new RegExp(`^access/${ID}/packet/${ID}$`),
      AccessiblePacketSchema,
    ),
    // only a packet that references no PC Capability Close may still carry the superseded citation
    legacyRule: {
      rule: EPISTEMIC_ACCESS_RULE_TENTH_SLICE,
      admits: (value) => {
        const p = AccessiblePacketSchema.safeParse(value);
        return (
          p.success &&
          (p.data.intelligibility.basis === "NO_CAPABILITY_DEPENDENCY" ||
            p.data.intelligibility.capability.close.name === ACTOR_PROFILE_CAPABILITY_CLOSE)
        );
      },
    },
  },
  {
    ...epistemicKind(
      "epistemic_sealed_provenance",
      ["RC-11", "RC-09"],
      new RegExp(`^access/${ID}/provenance/${ID}$`),
      SealedEngineProvenanceSchema,
    ),
    // only a provenance that records no capability, or a Named-Actor capability, may still carry the superseded citation; the load verifier ties it
    // to an event that asserts no active-PC role
    legacyRule: {
      rule: EPISTEMIC_ACCESS_RULE_TENTH_SLICE,
      admits: (value) => {
        const v = SealedEngineProvenanceSchema.safeParse(value);
        return (
          v.success &&
          (v.data.capability_close === null ||
            v.data.capability_close.fact_key.startsWith("actor/"))
        );
      },
    },
  },
];

const WS002_LINEAGE =
  "WS-002 KTI — frozen F-027 source: Blue post-ratification KTI v0.3 source conformance overlay, pin 2026-09-26T02:44:38.319Z (https://app.notion.com/p/3e720af901e081d1b9e9ce4bbe475268), conforming the Sovereign-ratified KTI v2.2 Candidate v0.3 (https://app.notion.com/p/3e720af901e0814fbf3ffec030c76b7a) and KTI Scaling Profile v1 Candidate v0.3 (https://app.notion.com/p/3e720af901e081d0bff4e4e083a5c162), both pin 2026-09-26T02:10:16.626Z, with KTI Concept 2 §§2, 9 (https://app.notion.com/p/3de20af901e08194a718cccdf5ff4844) and the KTI final scoped closure / Current-Saturated determination (https://app.notion.com/p/3e720af901e081579769e4f5c5a4d083)";

/**
 * One governing rule for every KTI kind: the authored development-object identity, the authored Transfer Package basis and
 * the Transfer Package published at the KTI result close are each one group. The clauses are the ones the state relies on
 * (the KTI v0.3 package as the owner that holds the facts; F-014D §§2.1, 17 and 18 for the packet → KTI and KTI-result-close
 * cuts; F-017 §3 CLOSE for the declared close, as already implemented by IM-02).
 */
export const KTI_RULE: SourceRef = rule(
  WS002_SOURCE,
  "Post-ratification KTI v0.3 overlay §§1, 4, 5, 7 (KTI owns persistent development consequences supported by lawful receipt/access evidence only; one sparse Class-D relationship; unlowered BROADCAST_EXPOSURE creates no persisted KTI receipt, encounter, intelligibility, competence, adoption, diffusion, aggregate-exposure, transmission-availability or transmission-reach state; Diplomacy staging: KTI implementation/result → KTI result close); KTI v2.2 Candidate v0.3 §2 (mode-consumer invariant: BOUNDED_SHARED_ACCESS participants only, named by the event basis) and §5 (producer-side close applies only to facts KTI lawfully owns); Candidate v0.2 §4.2 (KTI consumes a sealed F-014D event evidence packet AS-OF-NOW after packet formation; every KTI-owned fact F-014D may read — active Transfer Package state included — is declared AS-OF-DECLARED-CLOSE, Close Basis = KTI result close; cycle invariant: F-014D packet formation → KTI consequence write → KTI result close, no same-resolution reread) and §4.3 (transfer relationship); Scaling Profile Candidate v0.3 §2 Class A (one canonical identity per materially persistent development object, no faction/object state) and Class E (one active Transfer Package per materially managed source × recipient × development-object programme; closed packages are not polled) and §3 (mode-safe growth); Concept 2 §2 (development-object classes) and §9 (Intentional transfer package: temporary workflow state, not a permanent historical ledger; the source does not directly write the recipient's adoption, belief, competence or behaviour; exposure is not mastery); F-014D §§2.1, 17, 18 (KTI Transfer Adapter: F-014D resolves only the per-event information side, KTI is sole persisted owner of the active Transfer Package)",
  [WS002_LINEAGE, F014D_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

const ktiKind = (
  id: (typeof KTI_FACT_KIND_IDS)[number],
  rc: readonly string[],
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_KTI,
  facet: FACET_KTI_DEVELOPMENT,
  im: "IM-09",
  rc,
  lifecycle: "SEALED",
  keyPattern,
  valueSchema,
  rule: KTI_RULE,
});

/**
 * IM-09 Culture / KTI / Social-Meaning Adapter — the KTI MANAGED TRANSFER PACKAGE part only: "KTI development and lawful
 * learning/receipt relationships". One owner, one facet, three exclusive create-only (SEALED) key spaces: the Class-A
 * development-object identity, the authored Transfer Package basis and the active Transfer Package (which exists only as
 * the KTI owner's declared result close, an IM-02 stage). There is no fallback owner, and no relationship, encounter,
 * intelligibility, competence, adoption, diffusion, doctrine, institution, Population or numeric kind.
 */
export const KTI_FACT_KINDS: readonly FactKind[] = [
  ktiKind(
    "kti_development_object",
    ["RC-02"],
    new RegExp(`^kti/object/${ID}$`),
    KtiDevelopmentObjectSchema,
  ),
  ktiKind(
    "kti_transfer_basis",
    ["RC-02", "RC-07", "RC-11"],
    new RegExp(`^kti/transfer/${ID}/basis$`),
    KtiTransferBasisSchema,
  ),
  ktiKind(
    "kti_transfer_package",
    ["RC-02", "RC-03", "RC-04", "RC-11"],
    new RegExp(`^kti/transfer/${ID}/package$`),
    KtiTransferPackageSchema,
  ),
];

const WS005_LINEAGE =
  "WS-005 Culture & Society — frozen F-027 source: Blue post-ratification closeout, pin 2026-09-26T07:23:03.549Z (https://app.notion.com/p/3e720af901e0813b82f5ca864ad8daff), composing the Sovereign-ratified Concept v2 (substantive pin 2026-09-26T06:43:39.156Z, https://app.notion.com/p/3e720af901e081009232f2efa9b7a1ff), Operational Draft v2 (conformed pin 2026-09-26T07:22:08.130Z, https://app.notion.com/p/3e720af901e0817abf2df04f13bd90ad) and Scaling Profile v2 (conformed pin 2026-09-26T07:23:21.709Z, https://app.notion.com/p/3e720af901e081ca9ab5f8eeb1fafdd1), ratified without modification (https://app.notion.com/p/3e720af901e0817b9d55d4c5a5093fe8, pin 2026-09-26T07:14:10.463Z), with the conformed F-016 (https://app.notion.com/p/3e720af901e08112801dc2021204acbe) and F-017 (https://app.notion.com/p/3e720af901e081b2bcd6fd38e2e327e8) Culture successor deltas, both pin 2026-09-26T07:20:59.108Z";

/**
 * One governing rule for every Culture kind: the sealed Social Update Context (CS-UPD) and the shared meaning/norm committed
 * at the Communicative Convention Close are each one group. The clauses are the ones the state relies on: Draft v2 §1 (Culture
 * is the sole writer of admitted continuing social meaning; the minimum-information contract, not a fixed schema), §2
 * (admission and deletion: a fact is persisted only under the deletion test; no state on mere contact, policy enactment,
 * stereotype or world truth), §3 (the sealed, causally engaged Social Update Context; each input one declared read), §4.5
 * (commit once; a meaning or norm change declares the Communicative Convention Close) and §8 (validation and failure
 * behaviour: unresolved, never a substitute writer); Concept v2 §§1-2, 4 and 8; Scaling Profile v2 §§2-4 (cardinality basis,
 * lifecycle, no global scan); F-016/F-017 successor delta CS-UPD (CONDITIONAL, source-preserving read basis) and Register §3's
 * Communicative Convention Close (as already implemented by IM-02).
 */
export const CULTURE_RULE: SourceRef = rule(
  WS005_SOURCE,
  "Draft v2 §1 Runtime scope and owned working state (Culture is the sole writer of admitted continuing social meaning/norm; a retained fact carries only its necessary referent(s), scope, social meaning, context, establishment and current material status, provenance where causal, uncertainty/contestation where material and lifecycle; a minimum-information contract, not a fixed schema); §2 Admission and deletion (persist a Culture fact only if continuing social recognition/meaning has independent causal inertia, no other owner can reconstruct it faithfully or cheaply, and it may materially alter a later answer; establish no state on mere contact, hypothetical possibility, cultural stereotype, world truth or policy enactment alone); §3 Trigger and input assembly (a sealed, causally engaged Social Update Context, CS-UPD: each input identifies its source fact/owner and exactly one lawful basis, AS-OF-NOW only after its owner commit or AS-OF-DECLARED-CLOSE at that owner's specifically named close; downstream consequences cannot backfill the sealed context); §4.5 Commit once (a meaning, norm, identity/status meaning, practice or convention change declares the Communicative Convention Close; the Social Relation Close, relations and aggregate positions are not implemented); §8 Validation, invalidation and failure behavior (an unresolved or bounded conclusion, never a substitute writer, speculative group percentage or world-wide culture update); with Concept v2 §§1-2, 4 and 8 anti-imports and Scaling Profile v2 §§2-4 (cardinality basis: admitted material scope × referent × context distinctions; no global social scan; no periodic drift tick); cohort-key re-binding, contestation, retirement, relation/position and the Social Relation Close not implemented; the Communicative Convention Close reads exactly two AS-OF-NOW facts, the sealed context and the committed F-027-CJA1 adjudication decision (Sovereign-approved bounded technical source, not native-pinned and not spec-locked), and only an ESTABLISH_SUPPORTED decision may fill an empty slot",
  [WS005_LINEAGE, F017_LINEAGE, CJA1_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

const cultureKind = (
  id: (typeof CULTURE_FACT_KIND_IDS)[number],
  rc: readonly string[],
  keyPattern: RegExp,
  valueSchema: ValueSchema,
): FactKind => ({
  id,
  owner: OWNER_CULTURE,
  facet: FACET_CULTURE_SOCIAL,
  im: "IM-09",
  rc,
  lifecycle: "SEALED",
  keyPattern,
  valueSchema,
  rule: CULTURE_RULE,
});

/**
 * IM-09 Culture / KTI / Social-Meaning Adapter — the CULTURE ESTABLISHED SHARED MEANING / NORM part only: "sparse cultural
 * meanings". One owner, one facet, two exclusive create-only (SEALED) key spaces: the authored, sealed Social Update Context
 * and the shared meaning/norm, which exists only as the Culture owner's declared Communicative Convention Close (an IM-02
 * stage). There is no fallback owner, and no relation, position, precedence, lineage, convention-lowering, Cohort-attachment,
 * contestation, retirement, prevalence, count or numeric kind.
 */
export const CULTURE_FACT_KINDS: readonly FactKind[] = [
  cultureKind(
    "culture_update_context",
    ["RC-02", "RC-07", "RC-11"],
    new RegExp("^culture/update/([0-9a-f]{64})/context$"),
    CultureUpdateContextSchema,
  ),
  cultureKind(
    "culture_shared_meaning",
    ["RC-02", "RC-03", "RC-04", "RC-11"],
    new RegExp(`^culture/meaning/${ID}$`),
    CultureSharedMeaningSchema,
  ),
];

const WS007_LINEAGE =
  "WS-007 Government / Institutions / Politics — frozen F-027 source: the Sovereign-ratified GIP Working Operational Draft v2.1, pin 2026-09-24T01:42:24.952Z (https://app.notion.com/p/3e120af901e081c7ad5ecba62e11f521), paired with the GIP Scaling Profile v1.1, Red-confirmed at pin 2026-09-25T00:59:55.526Z (https://app.notion.com/p/3e620af901e0812d85efd4438089f417), and the OB-046 closed record confirming WS-007 Current-Saturated / Working Design Saturated in its local scope (https://app.notion.com/p/3e520af901e081e5be76efd3902a180c)";

/**
 * The governing rule for the GIP Institution Identity kind: the identity is one group, written once, and every load
 * re-verifies it against this citation. The clauses are the ones the state relies on: Draft v2.1 §2.1 (GIP is the owner of
 * institution identity references), §2.2 (explicit non-ownership: no population count, individual motive, faction posture,
 * cultural norm, money, goods, military or logistics capability and no external commitment) and §3.1 (the Institution
 * Identity Reference: one stable identity reference per real institution, identity/provenance only, never a catch-all state
 * ledger); Scaling Profile §3 (institution identity: one materially distinct continuing institution identity, never a
 * common property bag) and §4 Creation (create persistent GIP state only when future causality requires it).
 */
export const GIP_RULE: SourceRef = rule(
  WS007_SOURCE,
  "Draft v2.1 §2.1 GIP-owned persistent state (institution identity references) and §2.2 Explicit non-ownership; §3.1 Institution Identity Reference (institution_id, identity_label, continuity_status, predecessor/successor only where material, optional constitutive_source_ref; identity/provenance only, not a catch-all state ledger); with Scaling Profile v1.1 §3 Cardinality basis (one materially distinct continuing institution identity; never a common property bag), §4 Growth & lifecycle — Creation and §5 Retrieval cost (no scan of all institutions)",
  [WS007_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The governing rule for the GIP Office / Authority Locus kind, as of the fourteenth slice: one group, written once at
 * establishment (the office is ADVANCING in kind but no transition exists yet), and every load re-verifies it against this
 * citation. The clauses are the ones the state relies on: Draft v2.1 §2.1 (GIP owns office powers, duties, succession,
 * appointment, removal and delegation) and §2.2 (explicit non-ownership: no individual motive, loyalty, belief or
 * personality, no population, money, military or logistics capability), §3.2 (the Office / Authority Locus minimum with its
 * `holder_ref` OR `decision_body_ref` reference, both branches now implemented; authority belongs to the office/order, not
 * personally to the current holder) and §21.1/§21.2 (create only when future causality requires it; update only on a material
 * authority or holder/office change); Scaling Profile v1.1 §3 (Office/Institution × authority relation; authority persisted
 * once at the office/order, never copied onto holders, actors or subjects) and §5 (no scan of all institutions/offices).
 * The source artifact, exact native pin and authority lineage are those of the superseded citation, unchanged.
 */
export const GIP_OFFICE_RULE: SourceRef = rule(
  WS007_SOURCE,
  "Draft v2.1 §2.1 GIP-owned persistent state (office powers, duties, succession, appointment, removal) and §2.2 Explicit non-ownership (individual motive, loyalty, belief, personality); §3.2 Office / Authority Locus (office_id, institution_id, authority_source_ref, competence_scope, powers[], duties[] where material, selection_rule, succession_rule, removal_rule, holder_ref OR decision_body_ref; authority belongs to the office/order, not personally to the current holder; delegations, concurrence, review/veto/override and conditional authority not implemented); §21.1 Create and §21.2 Update (holder/office and authority change are material updates, not implemented here); with Scaling Profile v1.1 §3 Cardinality basis (Office/Institution × authority relation; authority persisted once at the office/order, never copied onto holders, actors or subjects) and §5 Retrieval cost (no scan of all institutions or offices)",
  [WS007_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The SUPERSEDED thirteenth-slice governing-rule citation for the GIP Office / Authority Locus, byte-for-byte as every
 * thirteenth-slice office was committed under it. It implemented only the `holder_ref` branch and says so ("decision_body_ref
 * not implemented"), which was true provenance for those facts and is NOT true provenance for anything committed since: it is
 * never stamped on a new write (admission requires `GIP_OFFICE_RULE`) and is accepted on load ONLY for a genuine legacy
 * holder-branch office (see `FactKind.legacyRule`). Existing saves therefore load unchanged, with no migration or rewriting of
 * their facts. Its text is frozen: a conformance test pins its hash.
 */
export const GIP_OFFICE_RULE_THIRTEENTH_SLICE: SourceRef = rule(
  WS007_SOURCE,
  "Draft v2.1 §2.1 GIP-owned persistent state (office powers, duties, succession, appointment, removal) and §2.2 Explicit non-ownership (individual motive, loyalty, belief, personality); §3.2 Office / Authority Locus (office_id, institution_id, authority_source_ref, competence_scope, powers[], duties[] where material, selection_rule, succession_rule, removal_rule, holder_ref; authority belongs to the office/order, not personally to the current holder; delegations, concurrence, review/veto/override, conditional authority and decision_body_ref not implemented); §21.1 Create and §21.2 Update (holder/office and authority change are material updates, not implemented here); with Scaling Profile v1.1 §3 Cardinality basis (Office/Institution × authority relation; authority persisted once at the office/order, never copied onto holders, actors or subjects) and §5 Retrieval cost (no scan of all institutions or offices)",
  [WS007_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The governing rule for the GIP Scope Binding kind (fifteenth slice): one group, written once at establishment beneath one
 * committed Office / Authority Locus (the binding is ADVANCING in kind but no transition exists yet), and every load
 * re-verifies it against this citation. The clauses are the ones the state relies on: Draft v2.1 §2.1 (GIP owns Scope /
 * Applicability Bindings) and §2.2 (explicit non-ownership: no geography, population, individual belief, faction posture or
 * foreign-owner capability), §5 (Scope / Applicability Binding: it answers only where, to whom, or under what condition an
 * authority/rule legally applies, with its minimum fields) and §21.1/§21.2 (create only when future causality requires it;
 * update only on a material change); Scaling Profile v1.1 §3 (Scope Binding cardinality: Instrument/authority × bounded
 * applicability scope; explicit exceptions replace per-place/per-person duplication), §4 (Creation) and §5 (no scan of all
 * institutions, offices or bindings). The source artifact, exact native pin and authority lineage are those of the other GIP
 * kinds. The office kind's own citation is neither changed nor reused.
 */
export const GIP_SCOPE_BINDING_RULE: SourceRef = rule(
  WS007_SOURCE,
  "Draft v2.1 §2.1 GIP-owned persistent state (Scope / Applicability Bindings) and §2.2 Explicit non-ownership; §5 Scope / Applicability Binding (scope_binding_id, scope_type, scope_ref, target_condition, optional inheritance_rule, optional exception references, optional priority-or-conflict rule reference; a Scope Binding answers only where, to whom, or under what condition an authority/rule legally applies; applicability query, territorial inheritance, exception and conflict resolution and promulgation not implemented); §21.1 Create and §21.2 Update (scope change is a material update, not implemented here); with Scaling Profile v1.1 §3 Cardinality basis (Scope Binding: Instrument/authority × bounded applicability scope; explicit exceptions replace per-place/per-person duplication), §4 Growth & lifecycle — Creation and §5 Retrieval cost (no scan of all institutions, offices or bindings)",
  [WS007_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The SUPERSEDED sixteenth-slice governing-rule citation for the GIP Governance Instrument, byte-for-byte as every
 * sixteenth-slice Instrument was committed under it. It implemented only the core record and says so ("§4.3 conditional
 * fields and §4.4 addressable clauses not implemented"), which was true provenance for those facts and is NOT true
 * provenance for anything committed since: it is never stamped on a new write (admission requires `GIP_INSTRUMENT_RULE`) and
 * is accepted on load ONLY for a genuine core-only Instrument (see `FactKind.legacyRule`), so a fact under it that carries
 * `predecessor_instrument_ref` - a field it never authorized - is rule drift. Existing saves therefore load unchanged, with no
 * migration, rewriting or re-citation of their facts. Its text is frozen: a conformance test pins its hash.
 */
export const GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE: SourceRef = rule(
  WS007_SOURCE,
  "Draft v2.1 §2.1 GIP-owned persistent state (Governance Instruments) and §2.2 Explicit non-ownership; §4.1 Mandatory fields (instrument_id, source_authority_ref, authority_basis_ref, operative_effect, scope_binding_ref, validity_by_order[] with governing_order_ref and validity_status, lifecycle_status; core validity_status and lifecycle_status literals; validity is order-relative and lifecycle/force is not validity), §4.2 Operative-effect classes; §4.3 conditional fields and §4.4 addressable clauses not implemented; §21.1 Create and §21.2 Update (validity or lifecycle change is a material update, not implemented here); with Concept Amendment v2.1 A7 (validity-by-order and lifecycle are separate dimensions) and Scaling Profile v1.1 §3 Cardinality basis (Instrument/Clause: the Instrument unit only), §4 Growth & lifecycle — Creation and §5 Retrieval cost (no scan of all institutions, offices, bindings, instruments, orders, recipients or subjects)",
  [WS007_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The SUPERSEDED twenty-first-slice governing-rule citation for the GIP Governance Instrument, byte-for-byte as every
 * Instrument committed from the twenty-first slice until the GIP sunset slice was committed under it. It implemented the core plus
 * ONLY the optional singular opaque `predecessor_instrument_ref` and says so (every other §4.3 conditional field, including
 * `sunset_condition`, "not implemented"; validity or lifecycle change "not implemented here"), which was true provenance for
 * those facts and is NOT true provenance for anything committed since: it is never stamped on a new write (admission requires
 * `GIP_INSTRUMENT_RULE`) and is accepted on load ONLY for a genuine core-plus-predecessor Instrument (see
 * `FactKind.laterLegacyRules`), so a fact under it that carries `sunset_condition` - a field it never authorized - is rule drift.
 * Existing saves therefore load unchanged, with no migration, rewriting or re-citation of their facts. Its text is frozen: a
 * conformance test pins its hash.
 */
export const GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE: SourceRef = rule(
  WS007_SOURCE,
  "Draft v2.1 §2.1 GIP-owned persistent state (Governance Instruments) and §2.2 Explicit non-ownership; §4.1 Mandatory fields (instrument_id, source_authority_ref, authority_basis_ref, operative_effect, scope_binding_ref, validity_by_order[] with governing_order_ref and validity_status, lifecycle_status; core validity_status and lifecycle_status literals; validity is order-relative and lifecycle/force is not validity), §4.2 Operative-effect classes; §4.3 conditional fields (only the optional singular opaque predecessor_instrument_ref is implemented; it is a representational lineage pointer, never dereferenced, and creates no dependency, supersession, lifecycle or validity change; every other §4.3 conditional field not implemented) and §4.4 addressable clauses not implemented; §21.1 Create and §21.2 Update (validity or lifecycle change is a material update, not implemented here); with Concept Amendment v2.1 A7 (validity-by-order and lifecycle are separate dimensions) and Scaling Profile v1.1 §3 Cardinality basis (Instrument/Clause: the Instrument unit only), §4 Growth & lifecycle — Creation and §5 Retrieval cost (no scan of all institutions, offices, bindings, instruments, orders, recipients or subjects)",
  [WS007_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The governing rule for the GIP Governance Instrument kind (and its sunset enrollment receipt), as of the sunset slice:
 * an Instrument is written once at establishment beneath one committed Office / Authority Locus and one committed Scope Binding
 * of that same office; an Instrument that carries the optional §4.3 `sunset_condition` is written only together with GIP's
 * enrollment receipt, and thereafter moves by exactly one lifecycle transition, `active` → `expired`, committed by GIP's own
 * Temporal stage at the earned boundary the Temporal kernel owns. Every load re-verifies it against this citation. The clauses
 * are the ones the state relies on: Draft v2.1 §2.1 (GIP owns Governance Instruments) and §2.2 (explicit non-ownership), §4.1
 * (the mandatory fields, the validity entry, the core validity and lifecycle literals; validity is order-relative and is not
 * lifecycle/force), §4.2 (the operative-effect classes), §4.3 (ONLY the optional singular opaque `predecessor_instrument_ref` and
 * the optional `sunset_condition`, as an exact canonical instant; every other conditional field stays unimplemented), §21.1/§21.2
 * (create only when future causality requires it; update only on a material change - here the one lifecycle expiry); Concept
 * Amendment v2.1 A7 (validity-by-order and lifecycle/operative status are separate dimensions); Scaling Profile v1.1 §3
 * (Instrument/Clause cardinality: the Instrument unit only), §4 (Creation; lifecycle) and §5 (no scan of all institutions,
 * offices, bindings, instruments, orders, recipients or subjects). The source artifact, exact native pin and authority lineage are
 * those of the other GIP kinds and of the superseded citations, unchanged. No other kind's citation is changed or reused.
 */
export const GIP_INSTRUMENT_RULE: SourceRef = rule(
  WS007_SOURCE,
  "Draft v2.1 §2.1 GIP-owned persistent state (Governance Instruments) and §2.2 Explicit non-ownership; §4.1 Mandatory fields (instrument_id, source_authority_ref, authority_basis_ref, operative_effect, scope_binding_ref, validity_by_order[] with governing_order_ref and validity_status, lifecycle_status; core validity_status and lifecycle_status literals; validity is order-relative and lifecycle/force is not validity), §4.2 Operative-effect classes; §4.3 conditional fields (only the optional singular opaque predecessor_instrument_ref, a representational lineage pointer that is never dereferenced, and the optional sunset_condition, an exact canonical instant compared only with canonical time, are implemented; a contingent, subjective, externally evidenced, disputed or uncomputable sunset condition, renewal_rule and every other §4.3 conditional field not implemented) and §4.4 addressable clauses not implemented; §21.1 Create and §21.2 Update (the one material lifecycle update implemented is active to expired of an Instrument carrying sunset_condition, committed by GIP's own stage at the earned Temporal boundary, changing no other field and never validity_by_order[]; every other validity or lifecycle change is not implemented); with Concept Amendment v2.1 A7 (validity-by-order and lifecycle are separate dimensions) and Scaling Profile v1.1 §3 Cardinality basis (Instrument/Clause: the Instrument unit only), §4 Growth & lifecycle — Creation and §5 Retrieval cost (no scan of all institutions, offices, bindings, instruments, orders, recipients or subjects)",
  [WS007_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * IM-06 Economy / GIP / Diplomacy Adapter — the GIP STABLE INSTITUTION IDENTITY, OFFICE / AUTHORITY LOCUS, AUTHORITY SCOPE
 * BINDING and GOVERNANCE INSTRUMENT parts only (the Instrument core plus its one optional `predecessor_instrument_ref`):
 * "GIP authority/instruments", lowered to the identity/provenance record, the one office/authority record, the one Scope
 * Binding of an office and the one Instrument record that the source assigns to GIP. One owner, one facet, four exclusive key spaces. The Institution Identity is SEALED (create-only). The
 * Office / Authority Locus is ADVANCING, because an office can later lawfully change holder, powers, delegation or
 * appointment/removal state under the owner's own expected-version chain; this foundation implements initial establishment
 * only (with either the `holder_ref` or the `decision_body_ref` reference branch, one key space and one kind for both), and
 * GIP admission refuses every other change to it. The Scope Binding is likewise ADVANCING in kind (a scope, exception or
 * priority-or-conflict change is later lawful work) and establishment-only here: it lives beneath exactly one committed
 * office, at that office's key plus its own `scope_binding_id`, and GIP admission refuses every other change to it. The
 * Governance Instrument is ADVANCING in kind (a later validity or lifecycle change is lawful work, WS-007 §4.1) and
 * establishment-only here: it lives at its own `gip/instrument/<instrument_id>` key (the canonical identity is the exact
 * `instrument_id` alone), rests on one committed office and one committed Scope Binding of that same office, and GIP admission
 * refuses every other change to it. There is no fallback owner, and no procedure,
 * membership, faction, asset, resource, KTI, actor, relationship, military, economic, territory, lifecycle-transition or
 * property-bag kind.
 */
export const GIP_FACT_KINDS: readonly FactKind[] = [
  {
    id: "gip_institution_identity",
    owner: OWNER_GIP,
    facet: FACET_GIP_INSTITUTION_IDENTITY,
    im: "IM-06",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^gip/institution/${ID}/identity$`),
    valueSchema: InstitutionIdentitySchema,
    rule: GIP_RULE,
  },
  {
    id: "gip_office_authority_locus",
    owner: OWNER_GIP,
    facet: FACET_GIP_INSTITUTION_IDENTITY,
    im: "IM-06",
    rc: ["RC-02"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^gip/institution/${ID}/office/${ID}$`),
    valueSchema: OfficeAuthorityLocusSchema,
    rule: GIP_OFFICE_RULE,
    // only a genuine thirteenth-slice holder-branch office may still carry the superseded citation
    legacyRule: {
      rule: GIP_OFFICE_RULE_THIRTEENTH_SLICE,
      admits: (value) => OfficeAuthorityLocusHolderSchema.safeParse(value).success,
    },
  },
  {
    id: "gip_scope_binding",
    owner: OWNER_GIP,
    facet: FACET_GIP_INSTITUTION_IDENTITY,
    im: "IM-06",
    rc: ["RC-02"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^gip/institution/${ID}/office/${ID}/scope-binding/${ID}$`),
    valueSchema: ScopeBindingSchema,
    rule: GIP_SCOPE_BINDING_RULE,
  },
  {
    id: "gip_governance_instrument",
    owner: OWNER_GIP,
    facet: FACET_GIP_INSTITUTION_IDENTITY,
    im: "IM-06",
    rc: ["RC-02"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^gip/instrument/${ID}$`),
    valueSchema: GovernanceInstrumentSchema,
    rule: GIP_INSTRUMENT_RULE,
    // only a genuine sixteenth-slice core-only Instrument may still carry the superseded citation
    legacyRule: {
      rule: GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
      admits: (value) => GovernanceInstrumentCoreSchema.safeParse(value).success,
    },
    // only a genuine twenty-first-slice core-plus-predecessor Instrument may still carry that superseded citation
    laterLegacyRules: [
      {
        rule: GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
        admits: (value) => GovernanceInstrumentPredecessorSchema.safeParse(value).success,
      },
    ],
  },
  {
    id: "gip_sunset_enrollment",
    owner: OWNER_GIP,
    facet: FACET_GIP_INSTITUTION_IDENTITY,
    im: "IM-06",
    rc: ["RC-02", "RC-10"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^${escape(GIP_SUNSET_ENROLLMENT_KEY)}$`),
    valueSchema: SunsetEnrollmentSchema,
    // the receipt is committed in the same group as the Instrument whose sunset it enrolls, so it carries that group's citation
    rule: GIP_INSTRUMENT_RULE,
  },
];

const WS008_LINEAGE =
  "WS-008 Diplomacy / Inter-Faction Relations — Sovereign-ratified Working Operational Draft v1.1 (Blue-Red consensus successor with the §29 bounded Red-audit repair overlay), frozen F-027 source at the lock pin 2026-09-24T07:01:45.312Z (https://app.notion.com/p/3e220af901e081fd8594d6f2e6c453f6)";
const GIP_CONCEPT_AMENDMENT_LINEAGE =
  "GIP Concept Amendment v2.1, pin 2026-09-24T01:42:22.902Z (https://app.notion.com/p/3e120af901e08184b49ac542f45296d9): evaluator belief/acceptance/contest stays outside the formal external-recognition fact; pure external recognition stays in Diplomacy, not GIP, with WS-007 at its frozen pin 2026-09-24T01:42:24.952Z (https://app.notion.com/p/3e120af901e081c7ad5ecba62e11f521)";
const F016_PHASE_2C_LINEAGE =
  "F-016 Phase 2C Actor / Faction / GIP / Diplomacy reconciliation, pin 2026-09-21T23:21:44.154Z (https://app.notion.com/p/3e220af901e081118f77f0b9327dbeea): external sovereign / inter-faction recognition belongs to Diplomacy; GIP supplies the pre-decision authority; later domestic incorporation is a distinct stage";

/**
 * The governing rule for the Diplomacy External Recognition kind (seventeenth slice): one group, written once at establishment
 * (the recognition is ADVANCING in kind but no transition exists yet), and every load re-verifies it against this citation. The
 * clauses are the ones the state relies on: WS-008 v1.1 §2.1 (Diplomacy owns directional and scoped external recognition state)
 * and §2.2 (explicit non-ownership: internal jurisdiction and domestic incorporation are GIP's; belief, knowledge and receipt,
 * objective geography / control and a universal trust, reputation or influence meter are never Diplomacy's), §6 (External
 * Recognition: directional and scoped; the minimum recognition entry; the possible `recognition_status` values; silence creates
 * no record; "Existence != claim != recognition != control"), §24 invariants 7-8, §29.2 (R-2: `continuity_basis`, and
 * `successor_rule_ref` where one is supplied; no invented succession law), §29.3 (R-3: `dependency_refs[]` where the conclusion
 * is derived from another owner's mutable state; no universal watcher), §29.7 (recognition is directional, scoped and sparse; a
 * framework clause or sourced setting convention may carry recognition once for a defined member set; no all-pairs scan) and
 * §29.8 m-4 (no implied recognition by conduct) and m-7 (cold-history retention, not implemented); F-016 Phase 2C and F-017
 * (GIP authority precedes Diplomacy; a later incorporation result never rewrites the earlier external act).
 */
export const DIPLOMACY_RECOGNITION_RULE: SourceRef = rule(
  WS008_SOURCE,
  "v1.1 §2.1 Diplomacy-owned persistent state (directional and scoped external recognition state) and §2.2 Explicit non-ownership; §6 External Recognition (minimum recognition entry: recognition_id, recognizer_ref, recognized_referent_ref, recognition_scope, recognition_status, authority_basis_ref, effective_from, optional withdrawal_or_supersession_condition, instrument_or_act_ref, provenance_ref; possible recognition_status values; recognition is directional and scoped; silence or absence creates no record; Existence != claim != recognition != control); §24 Required Invariants 7-8; §29.2 R-2 Continuity and succession (continuity_basis; successor_rule_ref where supplied); §29.3 R-3 Dependency registration and invalidation (dependency_refs[] where the persisted conclusion is derived from another owner's mutable state; no universal watcher); §29.7 R-7 / S-1 Recognition scaling (directional, scoped, sparse; no all-pairs scan); §29.8 m-4 No implied recognition by conduct; post-establishment status change, withdrawal resolution, succession application, dependency-driven re-resolution and cold-history retirement not implemented",
  [
    WS008_LINEAGE,
    GIP_CONCEPT_AMENDMENT_LINEAGE,
    F016_PHASE_2C_LINEAGE,
    F017_LINEAGE,
    RUNTIME_TRANSLATION_LINEAGE,
  ],
);

/**
 * The governing rule for the Diplomacy Externalized Claim / Dispute kind (eighteenth slice): one group, written once at
 * establishment (the record is ADVANCING in kind but no transition exists yet), and every load re-verifies it against this
 * citation. The clauses are the ones the state relies on: WS-008 v1.1 §§2-3 (Diplomacy owns the fact that a position was
 * externally communicated; the underlying substantive claim stays with its authoritative owner), §7 (Claim / Dispute: the minimum
 * entry), §§19-24 (invariants: no private belief or objective truth is inferred from a communicated position; stable state
 * carries forward; no universal diplomacy tick), §29.3 (R-3: `dependency_refs[]` where the conclusion is derived from another
 * owner's mutable state; no universal watcher), §29.4 (`effect_on`: `issuance`, `addressee_receipt`,
 * `instrument_or_setting_specified`; no default, and no receipt created) and §29.7 (no all-pairs scan); F-016 Phase 2C and F-017
 * (lawful Actor / ACS / GIP authority precedes the communicated act, which precedes the Diplomacy record).
 */
export const DIPLOMACY_CLAIM_DISPUTE_RULE: SourceRef = rule(
  WS008_SOURCE,
  "v1.1 §§2-3 Diplomacy-owned persistent state (the fact that a position was externally communicated; the underlying substantive claim stays with its authoritative owner); §7 Claim / Dispute (minimum entry: dispute_id, party_refs[], underlying_subject_ref, communicated_position_entries[], optional requested_remedy_or_demand, optional interpretation_issue_ref, optional instrument_or_clause_ref, optional adjudication_basis_ref, status, provenance_ref); §§19-24 Required Invariants (stable state carries forward; no universal diplomacy tick); §29.3 R-3 Dependency registration and invalidation (dependency_refs[] where the persisted conclusion is derived from another owner's mutable state; no universal watcher); §29.4 effect_on (issuance, addressee_receipt, instrument_or_setting_specified; no default; no receipt created or inferred); §29.7 R-7 (no all-pairs scan); post-establishment status change, new or changed position, remedy change, interpretation or adjudication update, effect resolution, dependency-driven re-resolution, conversion, merger, settlement and retirement not implemented",
  [WS008_LINEAGE, F016_PHASE_2C_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The SUPERSEDED nineteenth-slice governing-rule citation for the Diplomacy Relation Edge, byte-for-byte as every Relation Edge
 * committed since the nineteenth slice was committed under it. It mislabels WS-008 §4 as "Relation Edge" (the frozen source's §4
 * is the Diplomatic Relevance / Reach Gate; the Relation Edge is §5.1), which is a provenance-labeling defect and not a
 * difference in the authored value: it is never stamped on a new write (admission requires `DIPLOMACY_RELATION_EDGE_RULE`) and
 * is accepted on load ONLY as this exact whole citation on a value satisfying the one strict Relation Edge schema (see
 * `FactKind.legacyRule`). Existing saves therefore load unchanged, with no migration, rewriting or re-citation of their facts.
 * Its text is frozen and must never be "corrected": a conformance test pins its hash.
 */
export const DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE: SourceRef = rule(
  WS008_SOURCE,
  "v1.1 §§2.1-2.2 Diplomacy-owned persistent state (the durable fact that an external relation materially continues); §4 Relation Edge (a sparse continuity object, not a duplicate ledger and not a universal relationship, trust or reputation score); §5.1 Relation Edge minimum surface (relation_id, party_refs[], relation_scope, optional rupture_or_suspension_status, optional provenance_ref, lifecycle_status); §24 Required Invariants (stable state carries forward; no universal diplomacy tick); §§29.3/29.7 R-3 / R-7 (channel_refs[], recognition_refs[], active_claim_dispute_refs[], instrument_refs[] and framework_refs[] are derived, non-authoritative indexes rebuilt from source records and are not authored persistent fields; no all-pairs scan; no universal watcher); post-establishment rupture, suspension, restoration, retirement and lifecycle mutation, and any derived index or Recognition / Claim-Dispute association, not implemented",
  [WS008_LINEAGE, F016_PHASE_2C_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The governing rule for the Diplomacy Relation Edge kind: one group, written once at establishment (the record is ADVANCING in
 * kind but no transition exists yet), and every load re-verifies it against this citation. The clauses are the ones the state
 * relies on: WS-008 v1.1 §§2.1-2.2 (Diplomacy owns the durable fact that an external relation materially continues), §4 (the
 * Diplomatic Relevance / Reach Gate: no all-pairs scan, a plausible reach / relevance path is the source gate and no persistent
 * diplomatic-capacity score is created; this record implements no Reach calculation), §5.1 (the Diplomatic Relation Edge: the
 * sparse future-causal continuity edge, its minimum surface relation_id, party_refs[], relation_scope, optional
 * rupture_or_suspension_status, optional provenance_ref, lifecycle_status, and its character as not a duplicate ledger), §24
 * (invariants: stable state carries forward; no universal diplomacy tick) and §§29.3/29.7 (R-3 / R-7: the channel, recognition,
 * active claim / dispute, instrument and framework reference arrays are derived, non-authoritative indexes rebuilt from source
 * records, never a second writable ledger; no all-pairs scan); F-016 Phase 2C and F-017 lineage. No Recognition or Claim /
 * Dispute citation is reused as if it governed the Edge.
 *
 * This is the twenty-third-slice source-fidelity repair of the nineteenth-slice citation
 * (`DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE`), which attributed the Relation Edge to §4. Only that attribution is
 * corrected: the source artifact, exact native pin, authority lineage, effective basis, `supersedes` treatment and every
 * executable boundary are unchanged. This is the sole citation a new Relation Edge write may carry.
 */
export const DIPLOMACY_RELATION_EDGE_RULE: SourceRef = rule(
  WS008_SOURCE,
  "v1.1 §§2.1-2.2 Diplomacy-owned persistent state (the durable fact that an external relation materially continues); §4 Diplomatic Relevance / Reach Gate (no all-pairs scan; a plausible reach / relevance path is the source gate; no persistent diplomatic-capacity score is created; no Reach calculation implemented); §5.1 Diplomatic Relation Edge (a sparse future-causal continuity edge, not a duplicate ledger; minimum surface: relation_id, party_refs[], relation_scope, optional rupture_or_suspension_status, optional provenance_ref, lifecycle_status); §24 Required Invariants (stable state carries forward; no universal diplomacy tick); §§29.3/29.7 R-3 / R-7 (channel_refs[], recognition_refs[], active_claim_dispute_refs[], instrument_refs[] and framework_refs[] are derived, non-authoritative indexes rebuilt from source records and are not authored persistent fields; no all-pairs scan; no universal watcher); post-establishment rupture, suspension, restoration, retirement and lifecycle mutation, and any derived index or Recognition / Claim-Dispute association, not implemented",
  [WS008_LINEAGE, F016_PHASE_2C_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * The governing rule for the Diplomacy Framework kind (twenty-second slice): one group, written once at establishment (the record
 * is ADVANCING in kind but no transition exists yet), and every load re-verifies it against this citation. The clauses are the
 * ones the state relies on: WS-008 v1.1 §§2.1-2.2 (Diplomacy owns diplomatic Framework membership and external charter /
 * instrument references; internal institutional procedure, private motive and population membership are never Diplomacy's), §4
 * (the Relevance / Reach gate: no all-pairs scan), §16 (Diplomatic Frameworks: the durable multi-party external arrangement where
 * one shared object avoids pairwise duplication, and its minimum fields framework_id, framework_basis, member_refs[],
 * charter_or_instrument_refs[], membership_rules, entry_exit_rules, collective_decision_rule_ref where external framework action
 * requires one, shared_commitment_refs[], lifecycle_status and provenance_ref), §§19-24 (the runtime master sequence and the
 * required invariants, notably Framework membership != autonomous collective agency, one member's breach != framework-wide
 * breach, stable state carries forward and no universal diplomacy tick), §29.3 (R-3: `dependency_refs[]` only for a conclusion
 * derived from another owner's mutable state; this authored core is not one), §29.5 (R-5: the Framework collective decision
 * owner is a hard ownership boundary, not behavior of this record) and §29.7 (R-7 / S-1: a shared Framework replaces duplicated
 * pairwise treaty structure; no all-pairs scan); F-016 Phase 2C and F-017 lineage. No Recognition, Claim / Dispute or Relation
 * Edge citation is reused as if it governed the Framework.
 */
export const DIPLOMACY_FRAMEWORK_RULE: SourceRef = rule(
  WS008_SOURCE,
  "v1.1 §§2.1-2.2 Diplomacy-owned persistent state (diplomatic Framework membership and external charter / instrument references) and Explicit non-ownership; §4 Diplomatic Relevance / Reach Gate (no all-pairs scan); §16 Diplomatic Frameworks (a durable multi-party external arrangement where one shared object avoids pairwise duplication; minimum fields: framework_id, framework_basis, member_refs[], charter_or_instrument_refs[], membership_rules, entry_exit_rules, collective_decision_rule_ref where external framework action requires one, shared_commitment_refs[], lifecycle_status, provenance_ref; the Framework owns external membership and commitment structure only); §§19-24 Runtime Master Sequence through Required Invariants (Framework membership != autonomous collective agency; one member's breach != framework-wide breach; stable state carries forward; no universal diplomacy tick); §29.3 R-3 Dependency registration and invalidation (dependency_refs[] only where a persisted conclusion is derived from another owner's mutable state; the authored Framework core is not one); §29.5 R-5 Framework collective decision owner (GIP owns the procedure of a GIP-owned framework institution, a promoted autonomous collective resolves its own decision, and only otherwise may Diplomacy later apply the charter rule mechanically; ownership boundary only, nothing computed); §29.7 R-7 / S-1 Interface & Scaling Declaration (a shared Framework replaces duplicated pairwise treaty structure; no all-pairs scan; no universal watcher); post-establishment amendment, membership admission, exit, suspension, expulsion, succession or dissolution, framework decision execution, member-fault propagation, derived Relation Edge framework_refs[] index and any Recognition / Claim-Dispute / Instrument association not implemented",
  [WS008_LINEAGE, F016_PHASE_2C_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * IM-06 Economy / GIP / Diplomacy Adapter — the DIPLOMACY EXTERNAL RECOGNITION CORE part only: "Diplomacy commitment-of-record",
 * lowered to the one directional, scoped recognition record that the source assigns to Diplomacy. One owner (distinct from GIP
 * and Economy), one External Recognition facet, one exclusive key space. The kind is ADVANCING, because WS-008 explicitly permits
 * later withdrawal, suspension, succession / continuity consequences and cold-history retirement under the owner's own
 * expected-version chain; this foundation implements initial authored establishment only, and Diplomacy admission refuses every
 * other change. The nineteenth slice adds the Relation Edge authoritative core, the eighteenth the Claim / Dispute kind and the
 * twenty-second the Framework authoritative core under the same owner. There is no fallback owner, and no Channel, Negotiation
 * Record, Instrument, Clause, Binding Entry, compliance, score or reciprocal kind, and no derived Relation Edge index kind.
 */
export const DIPLOMACY_FACT_KINDS: readonly FactKind[] = [
  {
    id: "diplomacy_external_recognition",
    owner: OWNER_DIPLOMACY,
    facet: FACET_DIPLOMACY_EXTERNAL_RECOGNITION,
    im: "IM-06",
    rc: ["RC-02"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^diplomacy/recognition/${ID}$`),
    valueSchema: ExternalRecognitionSchema,
    rule: DIPLOMACY_RECOGNITION_RULE,
  },
  {
    id: "diplomacy_claim_dispute",
    owner: OWNER_DIPLOMACY,
    facet: FACET_DIPLOMACY_EXTERNALIZED_CLAIM_DISPUTE,
    im: "IM-06",
    rc: ["RC-02"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^diplomacy/dispute/${ID}$`),
    valueSchema: ExternalizedClaimDisputeSchema,
    rule: DIPLOMACY_CLAIM_DISPUTE_RULE,
  },
  {
    id: "diplomacy_relation_edge",
    owner: OWNER_DIPLOMACY,
    facet: FACET_DIPLOMACY_RELATION_EDGE,
    im: "IM-06",
    rc: ["RC-02"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^diplomacy/relation/${ID}$`),
    valueSchema: RelationEdgeSchema,
    rule: DIPLOMACY_RELATION_EDGE_RULE,
    // a nineteenth-slice Relation Edge may still carry the superseded (mislabeled §4) citation; the authored schema is the same
    legacyRule: {
      rule: DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE,
      admits: (value) => RelationEdgeSchema.safeParse(value).success,
    },
  },
  {
    id: "diplomacy_framework",
    owner: OWNER_DIPLOMACY,
    facet: FACET_DIPLOMACY_FRAMEWORK,
    im: "IM-06",
    rc: ["RC-02"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^diplomacy/framework/${ID}$`),
    valueSchema: DiplomaticFrameworkSchema,
    rule: DIPLOMACY_FRAMEWORK_RULE,
  },
];

/**
 * Every registered kind: the canonical world/PC kinds, the IM-02 kernel kinds, the IM-04 Population kinds, the
 * IM-05 Production kinds, the World-State fallback physical-entity kind, its entity-transition kind, the IM-06
 * Economy kinds, the IM-05 Logistics kinds, the IM-07 Named-Actor capability kinds, the IM-07 PC capability profile kinds (a facet of the one PC owner), the IM-10 Epistemic Access kinds, the IM-09 KTI kinds
 * the IM-06 GIP Institution Identity, Office / Authority Locus, Authority Scope Binding and Governance Instrument kinds
 * the IM-06 Diplomacy External Recognition kind, the IM-06 Diplomacy Externalized Claim / Dispute kind, the IM-06 Diplomacy Relation Edge kind and the IM-06 Diplomacy Framework kind,
 * and the infrastructure-only IM-12 Causal Draw precommit and result kinds (F-027-CD1).
 */
export const ALL_FACT_KINDS: readonly FactKind[] = [
  ...FACT_KINDS,
  ...TEMPORAL_FACT_KINDS_WITH_PC_COLLECTION_RETIREMENT,
  ...POPULATION_FACT_KINDS,
  ...PRODUCTION_FACT_KINDS,
  ...SOURCE_DRAWDOWN_FACT_KINDS_WITH_PC_COLLECTION_START,
  ...WORLD_FALLBACK_FACT_KINDS,
  ...WORLD_ENTITY_TRANSITION_FACT_KINDS,
  ...WORLD_ACTOR_COUPLING_FACT_KINDS,
  ...WORLD_PC_LOCUS_CUSTODY_FACT_KINDS,
  ...ECONOMY_FACT_KINDS,
  ...ECONOMY_HOLDING_FACT_KINDS,
  ...LOGISTICS_FACT_KINDS,
  ...NAMED_ACTOR_FACT_KINDS,
  ...PC_CAPABILITY_FACT_KINDS,
  ...PC_MOVEMENT_FACT_KINDS,
  ...EPISTEMIC_ACCESS_FACT_KINDS,
  ...KTI_FACT_KINDS,
  ...CULTURE_FACT_KINDS,
  ...GIP_FACT_KINDS,
  ...DIPLOMACY_FACT_KINDS,
  ...CAUSAL_DRAW_FACT_KINDS,
  ...CULTURE_ADJUDICATION_FACT_KINDS,
  ...REFEREE_FACT_KINDS,
  ...WORLD_SOURCE_CONDITION_FACT_KINDS,
  ...PC_COLLECTION_FACT_KINDS,
];

export const factKind = (id: FactKindId): FactKind => {
  const k = ALL_FACT_KINDS.find((f) => f.id === id);
  if (!k) throw new Error(`unregistered fact kind ${id}`);
  return k;
};

/** The single fact kind whose key space contains `key`, with the entity identities embedded in it. */
export function resolveKey(
  key: string,
): { readonly kind: FactKind; readonly ids: readonly string[] } | null {
  for (const kind of ALL_FACT_KINDS) {
    const m = kind.keyPattern.exec(key);
    if (m) return { kind, ids: m.slice(1) as string[] };
  }
  return null;
}

/** Owner/facet pairs registered by this build for canonical writes. */
export const CANONICAL_OWNER_REGISTRY: OwnerRegistry = new Map(
  [...new Set(ALL_FACT_KINDS.map((k) => k.owner))].map((owner) => [
    owner,
    new Set(ALL_FACT_KINDS.filter((k) => k.owner === owner).map((k) => k.facet)),
  ]),
);
