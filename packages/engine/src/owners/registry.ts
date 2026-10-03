import {
  AccessEventSchema,
  CausalDrawPrecommitSchema,
  CausalDrawResultSchema,
  FACET_DRAW_PROVENANCE,
  OWNER_CAUSAL_DRAW_KERNEL,
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
  PcCapabilityBasisSchema,
  PcCapabilitySchema,
  DurableCompletionEnvelopeSchema,
  EconomyDemandEnvelopeSchema,
  EconomyRealizationSchema,
  EntityTransitionCauseSchema,
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
  FallbackPhysicalEntitySchema,
  InstitutionIdentitySchema,
  OfficeAuthorityLocusHolderSchema,
  OfficeAuthorityLocusSchema,
  OWNER_DIPLOMACY,
  OWNER_GIP,
  GovernanceInstrumentCoreSchema,
  GovernanceInstrumentSchema,
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
export const WORLD_FALLBACK_FACT_KIND_IDS = ["world_fallback_entity"] as const;
export const WORLD_ENTITY_TRANSITION_FACT_KIND_IDS = ["world_entity_transition"] as const;
export const ECONOMY_FACT_KIND_IDS = [
  "economy_demand",
  "economy_request",
  "economy_realization",
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
export const GIP_FACT_KIND_IDS = [
  "gip_institution_identity",
  "gip_office_authority_locus",
  "gip_scope_binding",
  "gip_governance_instrument",
] as const;
export const DIPLOMACY_FACT_KIND_IDS = [
  "diplomacy_external_recognition",
  "diplomacy_claim_dispute",
  "diplomacy_relation_edge",
  "diplomacy_framework",
] as const;
export const CAUSAL_DRAW_FACT_KIND_IDS = ["causal_draw_precommit", "causal_draw_result"] as const;
export type FactKindId =
  | (typeof CAUSAL_DRAW_FACT_KIND_IDS)[number]
  | (typeof DIPLOMACY_FACT_KIND_IDS)[number]
  | (typeof GIP_FACT_KIND_IDS)[number]
  | (typeof FACT_KIND_IDS)[number]
  | (typeof KTI_FACT_KIND_IDS)[number]
  | (typeof EPISTEMIC_ACCESS_FACT_KIND_IDS)[number]
  | (typeof NAMED_ACTOR_FACT_KIND_IDS)[number]
  | (typeof PC_CAPABILITY_FACT_KIND_IDS)[number]
  | (typeof TEMPORAL_FACT_KIND_IDS)[number]
  | (typeof POPULATION_FACT_KIND_IDS)[number]
  | (typeof PRODUCTION_FACT_KIND_IDS)[number]
  | (typeof WORLD_FALLBACK_FACT_KIND_IDS)[number]
  | (typeof WORLD_ENTITY_TRANSITION_FACT_KIND_IDS)[number]
  | (typeof ECONOMY_FACT_KIND_IDS)[number]
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
  productionKind(
    "production_reserve",
    ["RC-02", "RC-07"],
    "ADVANCING",
    new RegExp(`^production/reserve/${ID}$`),
    ProductionReserveSchema,
  ),
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

/**
 * One governing rule for both PC capability kinds: the received establishment basis and the PC Capability Close publication
 * are each one group, and a capability always cites the one basis it was derived from, so every version of every PC
 * capability fact records the same citation. The clauses are the ones the state relies on. The primary source is the
 * frozen WS-016 integration map pin that carries the ratified I-002 bounded amendment (the I-002 page at its own lock pin
 * does not yet contain that amendment text, so the I-002 pin is cited in the lineage and never as the origin of the
 * capability clauses).
 */
export const PC_CAPABILITY_RULE: SourceRef = rule(
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
 * stage — the PC Capability Close. There is no fallback owner, and no development, loss, deferred derivation, handover,
 * transfer, lifecycle, KTI, aggregate, randomized or numeric-rank kind.
 */
export const PC_CAPABILITY_FACT_KINDS: readonly FactKind[] = [
  pcCapabilityKind(
    "pc_capability_basis",
    ["RC-02"],
    new RegExp(`^pc/${ID}/capability-basis/${ID}$`),
    PcCapabilityBasisSchema,
  ),
  pcCapabilityKind(
    "pc_capability",
    ["RC-02", "RC-03", "RC-04"],
    new RegExp(`^pc/${ID}/capability/${ID}$`),
    PcCapabilitySchema,
  ),
];

const CAUSAL_DRAW_LINEAGE =
  "F-027 v1.0 + F-027-CD1 v1.0 composed implementation authority: F-027 Final Package v1.0 pin 2026-09-29T00:40:44.707Z (https://app.notion.com/p/3ea20af901e081bc9c55d2c5a49cf639) composed with the Causal Draw Implementation-Authority Addendum, pinned in spec/f027/spec-lock.json `implementation_authority_addenda`; historical F-027 v1.0 is neither rewritten nor superseded";
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

const F014D_LINEAGE =
  "F-014D Epistemic Access — Working Operational Draft v2 (Epistemic Access, Provenance & Information Channels), Sovereign-ratified 2026-09-20 with the W1-PS2 provenance-split amendment (Sealed Engine Provenance vs Accessible Content Packet) Sovereign-ratified 2026-09-25, at the frozen lock pin 2026-09-24T16:25:17.059Z (https://app.notion.com/p/3e020af901e08103b81aec5f7119318e); Concept v3 https://app.notion.com/p/3e020af901e081fca9c0c7213b720124";

/**
 * One governing rule for every Epistemic Access kind: the authored BOUNDED_SHARED_ACCESS event and the packet formation
 * (the actor-safe packet and its engine-only sealed provenance, written together) are each one group. The clauses are the
 * ones the state relies on (F-014D as the owner that holds the facts; WS-016 §27.1 and F-017 §3 for the capability-close read).
 */
export const EPISTEMIC_ACCESS_RULE: SourceRef = rule(
  F014D_SOURCE,
  "§2 Ownership Contract (F-014D owns the causal route, source/carrier provenance, actual payload, receipt/access, representational-intelligibility prerequisites and the immutable Access / Dissemination Event modes; it does not own comprehension, inference, credibility, belief, stance, decision, capability, objective truth, KTI state or Temporal Knowledge Time); §2.1 R-T1 (F-014A actor-profile representational capability read AS-OF-DECLARED-CLOSE, Close Basis = F-014A actor-profile capability close, never written by F-014D; the sealed Accessible Content Packet is consumed AS-OF-NOW after packet formation; same-resolution cycle cut; mode-consumer invariant; role-context rule — Sealed Engine Provenance is not an admissible actor input); §4.1 Epistemic Access Packet (Presented Source Attribution vs Sealed Engine Provenance); §4.2 Access / Dissemination Event — BOUNDED_SHARED_ACCESS mode (explicit named participant set; mode fixed at creation and immutable; no cohort backfill); §5 steps 2–4 and 6 (causal route, actual payload, receipt and representational intelligibility distinct from comprehension; persist, compress or discard); §9 Shared / Cohort Access Adapter; §11 conflicting content (Presented Source Attribution vs Sealed Engine Provenance kept separately); §14 Sparse Persistence and Lifecycle (lifecycle change never mutates an event's mode); §18 Named Actor / Actor Fidelity Handoff (Accessible Content Packet excludes Sealed Engine Provenance); §21 Temporal and Causality Rules (no epistemic effect precedes its causal route; resolved past access is not rewritten); §24 Failure Conditions; RC-11 SealedContext / AccessEvent and RC-14 Projection guard",
  [F014D_LINEAGE, WS016_LINEAGE, F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
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
  epistemicKind(
    "epistemic_access_event",
    ["RC-11"],
    new RegExp(`^access/${ID}/event$`),
    AccessEventSchema,
  ),
  epistemicKind(
    "epistemic_accessible_packet",
    ["RC-11", "RC-14", "RC-03", "RC-04"],
    new RegExp(`^access/${ID}/packet/${ID}$`),
    AccessiblePacketSchema,
  ),
  epistemicKind(
    "epistemic_sealed_provenance",
    ["RC-11", "RC-09"],
    new RegExp(`^access/${ID}/provenance/${ID}$`),
    SealedEngineProvenanceSchema,
  ),
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
 * The governing rule for the GIP Governance Instrument kind, as of the twenty-first slice: one group, written once at
 * establishment beneath one committed Office / Authority Locus and one committed Scope Binding of that same office (the
 * Instrument is ADVANCING in kind but no transition exists yet), and every load re-verifies it against this citation. The
 * clauses are the ones the state relies on: Draft v2.1 §2.1 (GIP owns Governance Instruments) and §2.2 (explicit
 * non-ownership), §4.1 (the mandatory fields, the validity entry, the core validity and lifecycle literals; validity is
 * order-relative and is not lifecycle/force), §4.2 (the operative-effect classes), §4.3 (ONLY the optional singular opaque
 * `predecessor_instrument_ref`; every other conditional field stays unimplemented), §21.1/§21.2 (create only when future
 * causality requires it; update only on a material change); Concept Amendment v2.1 A7 (validity-by-order and
 * lifecycle/operative status are separate dimensions); Scaling Profile v1.1 §3 (Instrument/Clause cardinality: the Instrument
 * unit only), §4 (Creation) and §5 (no scan of all institutions, offices, bindings, instruments, orders, recipients or
 * subjects). The source artifact, exact native pin and authority lineage are those of the other GIP kinds and of the
 * superseded sixteenth-slice citation, unchanged. No other kind's citation is changed or reused.
 */
export const GIP_INSTRUMENT_RULE: SourceRef = rule(
  WS007_SOURCE,
  "Draft v2.1 §2.1 GIP-owned persistent state (Governance Instruments) and §2.2 Explicit non-ownership; §4.1 Mandatory fields (instrument_id, source_authority_ref, authority_basis_ref, operative_effect, scope_binding_ref, validity_by_order[] with governing_order_ref and validity_status, lifecycle_status; core validity_status and lifecycle_status literals; validity is order-relative and lifecycle/force is not validity), §4.2 Operative-effect classes; §4.3 conditional fields (only the optional singular opaque predecessor_instrument_ref is implemented; it is a representational lineage pointer, never dereferenced, and creates no dependency, supersession, lifecycle or validity change; every other §4.3 conditional field not implemented) and §4.4 addressable clauses not implemented; §21.1 Create and §21.2 Update (validity or lifecycle change is a material update, not implemented here); with Concept Amendment v2.1 A7 (validity-by-order and lifecycle are separate dimensions) and Scaling Profile v1.1 §3 Cardinality basis (Instrument/Clause: the Instrument unit only), §4 Growth & lifecycle — Creation and §5 Retrieval cost (no scan of all institutions, offices, bindings, instruments, orders, recipients or subjects)",
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
  ...TEMPORAL_FACT_KINDS,
  ...POPULATION_FACT_KINDS,
  ...PRODUCTION_FACT_KINDS,
  ...WORLD_FALLBACK_FACT_KINDS,
  ...WORLD_ENTITY_TRANSITION_FACT_KINDS,
  ...ECONOMY_FACT_KINDS,
  ...LOGISTICS_FACT_KINDS,
  ...NAMED_ACTOR_FACT_KINDS,
  ...PC_CAPABILITY_FACT_KINDS,
  ...EPISTEMIC_ACCESS_FACT_KINDS,
  ...KTI_FACT_KINDS,
  ...GIP_FACT_KINDS,
  ...DIPLOMACY_FACT_KINDS,
  ...CAUSAL_DRAW_FACT_KINDS,
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
