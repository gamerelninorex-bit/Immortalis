import {
  BoundaryIndexSchema,
  DurableCompletionEnvelopeSchema,
  EconomyDemandEnvelopeSchema,
  EconomyRealizationSchema,
  EntityTransitionCloseSchema,
  ExistenceContractSchema,
  FACET_ECONOMY_STATE,
  FACET_EXISTENCE_CONTRACT,
  FACET_PRODUCTION_STATE,
  FACET_WORLD_FALLBACK_ENTITY,
  FallbackPhysicalEntitySchema,
  OWNER_ECONOMY,
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

export const F014B_SOURCE = {
  artifact: "https://app.notion.com/p/3e020af901e081fb88e9f691748db990",
  native_pin: "2026-09-25T23:42:29.547Z",
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
export type FactKindId =
  | (typeof FACT_KIND_IDS)[number]
  | (typeof TEMPORAL_FACT_KIND_IDS)[number]
  | (typeof POPULATION_FACT_KIND_IDS)[number]
  | (typeof PRODUCTION_FACT_KIND_IDS)[number]
  | (typeof WORLD_FALLBACK_FACT_KIND_IDS)[number]
  | (typeof WORLD_ENTITY_TRANSITION_FACT_KIND_IDS)[number]
  | (typeof ECONOMY_FACT_KIND_IDS)[number];

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
 * Every registered kind: the canonical world/PC kinds, the IM-02 kernel kinds, the IM-04 Population kinds, the
 * IM-05 Production kinds, the World-State fallback physical-entity kind, its entity-transition kind and the IM-06
 * Economy kinds.
 */
export const ALL_FACT_KINDS: readonly FactKind[] = [
  ...FACT_KINDS,
  ...TEMPORAL_FACT_KINDS,
  ...POPULATION_FACT_KINDS,
  ...PRODUCTION_FACT_KINDS,
  ...WORLD_FALLBACK_FACT_KINDS,
  ...WORLD_ENTITY_TRANSITION_FACT_KINDS,
  ...ECONOMY_FACT_KINDS,
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
