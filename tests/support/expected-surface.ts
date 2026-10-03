/**
 * INDEPENDENT TEST ORACLE for the registered engine surface.
 *
 * This file is literal data. It deliberately imports nothing (enforced by tests/unit/surface-oracle.test.ts): every
 * entry below is hand-written expectation, never read back from the production registry, adapters or sources it is
 * compared against. tests/conformance/registered-surface-conformance.test.ts compares production to it and fails on
 * ANY drift in either direction (an unauthorized addition, or an unauthorized removal).
 *
 * MAINTENANCE: a legitimate new fact kind, historical-rule compatibility entry, adapter method or sibling key space
 * is acknowledged HERE, once. No predecessor suite should need an edit for it. Do not "fix" a failure of the
 * central suite by regenerating this file from production — that would make the oracle a mirror of what it checks.
 * Add the entry only when the slice's brief authorizes the production change.
 */

export interface ExpectedFactKind {
  readonly id: string;
  readonly owner: string;
  readonly facet: string;
  readonly lifecycle: "SEALED" | "ADVANCING";
  /** Name of the engine registry export (`*_FACT_KINDS`) that holds the kind. */
  readonly group: string;
  /** A canonical, well-formed key: it must resolve to exactly this kind and to no other. */
  readonly exampleKey: string;
}

/** Every registered fact kind, in registry order (per-owner order is asserted; global order is not). */
export const EXPECTED_FACT_KINDS: readonly ExpectedFactKind[] = [
  {
    id: "world_profile",
    owner: "world_state",
    facet: "world_profile",
    lifecycle: "SEALED",
    group: "FACT_KINDS",
    exampleKey: "world/w1/profile",
  },
  {
    id: "world_locus",
    owner: "world_state",
    facet: "world_locus",
    lifecycle: "SEALED",
    group: "FACT_KINDS",
    exampleKey: "world/w1/locus/l1",
  },
  {
    id: "pc_existence_contract",
    owner: "pc_existence",
    facet: "existence_contract",
    lifecycle: "SEALED",
    group: "FACT_KINDS",
    exampleKey: "pc/p1/existence-contract",
  },
  {
    id: "player_character_binding",
    owner: "role_registry",
    facet: "player_character_binding",
    lifecycle: "SEALED",
    group: "FACT_KINDS",
    exampleKey: "role-registry/binding/role.player_character",
  },
  {
    id: "temporal_state",
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    lifecycle: "ADVANCING",
    group: "TEMPORAL_FACT_KINDS",
    exampleKey: "temporal/state",
  },
  {
    id: "temporal_boundary_index",
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    lifecycle: "ADVANCING",
    group: "TEMPORAL_FACT_KINDS",
    exampleKey: "temporal/boundary-index",
  },
  {
    id: "temporal_object",
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    lifecycle: "ADVANCING",
    group: "TEMPORAL_FACT_KINDS",
    exampleKey: "temporal/object/o1",
  },
  {
    id: "resolution_transaction",
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    lifecycle: "SEALED",
    group: "TEMPORAL_FACT_KINDS",
    exampleKey: "temporal/transaction/t1",
  },
  {
    id: "temporal_transaction_authority",
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    lifecycle: "SEALED",
    group: "TEMPORAL_FACT_KINDS",
    exampleKey: "temporal/transaction-authority/t1",
  },
  {
    id: "population_ledger",
    owner: "population",
    facet: "population_state",
    lifecycle: "ADVANCING",
    group: "POPULATION_FACT_KINDS",
    exampleKey: "population/p1/ledger",
  },
  {
    id: "population_close",
    owner: "population",
    facet: "population_state",
    lifecycle: "ADVANCING",
    group: "POPULATION_FACT_KINDS",
    exampleKey: "population/p1/close",
  },
  {
    id: "population_cohort",
    owner: "population",
    facet: "population_state",
    lifecycle: "ADVANCING",
    group: "POPULATION_FACT_KINDS",
    exampleKey: "population/p1/cohort/c1",
  },
  {
    id: "production_reserve",
    owner: "production",
    facet: "production_state",
    lifecycle: "ADVANCING",
    group: "PRODUCTION_FACT_KINDS",
    exampleKey: "production/reserve/r1",
  },
  {
    id: "production_claim",
    owner: "production",
    facet: "production_state",
    lifecycle: "ADVANCING",
    group: "PRODUCTION_FACT_KINDS",
    exampleKey: "production/claim/c1",
  },
  {
    id: "production_operation",
    owner: "production",
    facet: "production_state",
    lifecycle: "ADVANCING",
    group: "PRODUCTION_FACT_KINDS",
    exampleKey: "production/operation/o1",
  },
  {
    id: "production_completion",
    owner: "production",
    facet: "production_state",
    lifecycle: "SEALED",
    group: "PRODUCTION_FACT_KINDS",
    exampleKey: "production/completion/c1",
  },
  {
    id: "world_fallback_entity",
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    lifecycle: "SEALED",
    group: "WORLD_FALLBACK_FACT_KINDS",
    exampleKey: "world/w1/entity/e1",
  },
  {
    id: "world_entity_transition",
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    lifecycle: "SEALED",
    group: "WORLD_ENTITY_TRANSITION_FACT_KINDS",
    exampleKey: "world/w1/entity/e1/transition",
  },
  {
    id: "world_actor_coupling",
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    lifecycle: "SEALED",
    group: "WORLD_ACTOR_COUPLING_FACT_KINDS",
    exampleKey: "world-state/actor/a1/coupling",
  },
  {
    id: "economy_demand",
    owner: "economy",
    facet: "economy_state",
    lifecycle: "SEALED",
    group: "ECONOMY_FACT_KINDS",
    exampleKey: "economy/demand/d1",
  },
  {
    id: "economy_request",
    owner: "economy",
    facet: "economy_state",
    lifecycle: "SEALED",
    group: "ECONOMY_FACT_KINDS",
    exampleKey: "economy/request/r1",
  },
  {
    id: "economy_realization",
    owner: "economy",
    facet: "economy_state",
    lifecycle: "SEALED",
    group: "ECONOMY_FACT_KINDS",
    exampleKey: "economy/realization/r1",
  },
  {
    id: "logistics_commitment",
    owner: "logistics",
    facet: "logistics_state",
    lifecycle: "ADVANCING",
    group: "LOGISTICS_FACT_KINDS",
    exampleKey: "logistics/commitment/a1/b1",
  },
  {
    id: "logistics_transfer",
    owner: "logistics",
    facet: "logistics_state",
    lifecycle: "ADVANCING",
    group: "LOGISTICS_FACT_KINDS",
    exampleKey: "logistics/transfer/a1/b1",
  },
  {
    id: "logistics_delivery",
    owner: "logistics",
    facet: "logistics_state",
    lifecycle: "SEALED",
    group: "LOGISTICS_FACT_KINDS",
    exampleKey: "logistics/delivery/a1/b1",
  },
  {
    id: "named_actor_capability_basis",
    owner: "named_actor",
    facet: "actor_profile",
    lifecycle: "SEALED",
    group: "NAMED_ACTOR_FACT_KINDS",
    exampleKey: "actor/a1/capability-basis/c1",
  },
  {
    id: "named_actor_capability",
    owner: "named_actor",
    facet: "actor_profile",
    lifecycle: "SEALED",
    group: "NAMED_ACTOR_FACT_KINDS",
    exampleKey: "actor/a1/capability/c1",
  },
  {
    id: "pc_capability_basis",
    owner: "pc_existence",
    facet: "pc_capability_profile",
    lifecycle: "SEALED",
    group: "PC_CAPABILITY_FACT_KINDS",
    exampleKey: "pc/p1/capability-basis/c1",
  },
  {
    id: "pc_capability",
    owner: "pc_existence",
    facet: "pc_capability_profile",
    lifecycle: "SEALED",
    group: "PC_CAPABILITY_FACT_KINDS",
    exampleKey: "pc/p1/capability/c1",
  },
  {
    id: "epistemic_access_event",
    owner: "epistemic_access",
    facet: "epistemic_access",
    lifecycle: "SEALED",
    group: "EPISTEMIC_ACCESS_FACT_KINDS",
    exampleKey: "access/e1/event",
  },
  {
    id: "epistemic_accessible_packet",
    owner: "epistemic_access",
    facet: "epistemic_access",
    lifecycle: "SEALED",
    group: "EPISTEMIC_ACCESS_FACT_KINDS",
    exampleKey: "access/e1/packet/p1",
  },
  {
    id: "epistemic_sealed_provenance",
    owner: "epistemic_access",
    facet: "epistemic_access",
    lifecycle: "SEALED",
    group: "EPISTEMIC_ACCESS_FACT_KINDS",
    exampleKey: "access/e1/provenance/p1",
  },
  {
    id: "kti_development_object",
    owner: "kti",
    facet: "kti_development",
    lifecycle: "SEALED",
    group: "KTI_FACT_KINDS",
    exampleKey: "kti/object/o1",
  },
  {
    id: "kti_transfer_basis",
    owner: "kti",
    facet: "kti_development",
    lifecycle: "SEALED",
    group: "KTI_FACT_KINDS",
    exampleKey: "kti/transfer/t1/basis",
  },
  {
    id: "kti_transfer_package",
    owner: "kti",
    facet: "kti_development",
    lifecycle: "SEALED",
    group: "KTI_FACT_KINDS",
    exampleKey: "kti/transfer/t1/package",
  },
  {
    id: "gip_institution_identity",
    owner: "gip",
    facet: "gip_institution_identity",
    lifecycle: "SEALED",
    group: "GIP_FACT_KINDS",
    exampleKey: "gip/institution/i1/identity",
  },
  {
    id: "gip_office_authority_locus",
    owner: "gip",
    facet: "gip_institution_identity",
    lifecycle: "ADVANCING",
    group: "GIP_FACT_KINDS",
    exampleKey: "gip/institution/i1/office/o1",
  },
  {
    id: "gip_scope_binding",
    owner: "gip",
    facet: "gip_institution_identity",
    lifecycle: "ADVANCING",
    group: "GIP_FACT_KINDS",
    exampleKey: "gip/institution/i1/office/o1/scope-binding/s1",
  },
  {
    id: "gip_governance_instrument",
    owner: "gip",
    facet: "gip_institution_identity",
    lifecycle: "ADVANCING",
    group: "GIP_FACT_KINDS",
    exampleKey: "gip/instrument/n1",
  },
  {
    id: "diplomacy_external_recognition",
    owner: "diplomacy",
    facet: "diplomacy_external_recognition",
    lifecycle: "ADVANCING",
    group: "DIPLOMACY_FACT_KINDS",
    exampleKey: "diplomacy/recognition/r1",
  },
  {
    id: "diplomacy_claim_dispute",
    owner: "diplomacy",
    facet: "diplomacy_externalized_claim_dispute",
    lifecycle: "ADVANCING",
    group: "DIPLOMACY_FACT_KINDS",
    exampleKey: "diplomacy/dispute/d1",
  },
  {
    id: "diplomacy_relation_edge",
    owner: "diplomacy",
    facet: "diplomacy_relation_edge",
    lifecycle: "ADVANCING",
    group: "DIPLOMACY_FACT_KINDS",
    exampleKey: "diplomacy/relation/r1",
  },
  {
    id: "diplomacy_framework",
    owner: "diplomacy",
    facet: "diplomacy_framework",
    lifecycle: "ADVANCING",
    group: "DIPLOMACY_FACT_KINDS",
    exampleKey: "diplomacy/framework/f1",
  },
  {
    id: "causal_draw_precommit",
    owner: "causal_draw_kernel",
    facet: "draw_provenance",
    lifecycle: "SEALED",
    group: "CAUSAL_DRAW_FACT_KINDS",
    exampleKey:
      "causal-draw/0000000000000000000000000000000000000000000000000000000000000000/precommit",
  },
  {
    id: "causal_draw_result",
    owner: "causal_draw_kernel",
    facet: "draw_provenance",
    lifecycle: "SEALED",
    group: "CAUSAL_DRAW_FACT_KINDS",
    exampleKey:
      "causal-draw/0000000000000000000000000000000000000000000000000000000000000000/result",
  },
];

/** The owner → facet registration, written out independently of the kind table above. */
export const EXPECTED_OWNER_FACETS: Readonly<Record<string, readonly string[]>> = {
  world_state: ["world_profile", "world_locus", "world_fallback_physical_entity"],
  pc_existence: ["existence_contract", "pc_capability_profile"],
  role_registry: ["player_character_binding"],
  temporal_kernel: ["temporal_coordination"],
  population: ["population_state"],
  production: ["production_state"],
  economy: ["economy_state"],
  logistics: ["logistics_state"],
  named_actor: ["actor_profile"],
  epistemic_access: ["epistemic_access"],
  kti: ["kti_development"],
  gip: ["gip_institution_identity"],
  diplomacy: [
    "diplomacy_external_recognition",
    "diplomacy_externalized_claim_dispute",
    "diplomacy_relation_edge",
    "diplomacy_framework",
  ],
  causal_draw_kernel: ["draw_provenance"],
};

/**
 * The fact kinds that lawfully carry a superseded governing-rule citation (`FactKind.legacyRule`), in registry order.
 * A fact kind joins this list only through a slice that is explicitly authorized to register a historical citation.
 */
export const EXPECTED_LEGACY_RULE_KIND_IDS: readonly string[] = [
  "gip_office_authority_locus", // thirteenth-slice citation, superseded
  "gip_governance_instrument", // sixteenth-slice citation, superseded (twenty-first slice)
  "diplomacy_relation_edge", // nineteenth-slice citation, superseded (twenty-third slice)
];

/**
 * Source-text count of the `legacyRule` slot in the registry module: the one `FactKind` field declaration plus one
 * slot per entry above.
 */
export const EXPECTED_LEGACY_RULE_SOURCE_SLOTS: number = 1 + EXPECTED_LEGACY_RULE_KIND_IDS.length;

/** Registry module whose source text the legacy-slot count is read from. */
export const REGISTRY_SOURCE = "packages/engine/src/owners/registry.ts";

export interface ExpectedAdapterSurface {
  /** Own prototype methods (constructor excluded), sorted. */
  readonly methods: readonly string[];
  /**
   * Adapters that commit facts only: the production module whose comment-stripped text is read, how many `.commit(`
   * calls it contains and which `async establish…` writers it declares. Absent for read-only or kernel classes.
   */
  readonly source?: {
    readonly file: string;
    readonly commitCalls: number;
    readonly establishWriters: readonly string[];
  };
  /**
   * Admission modules that refuse every post-establishment write: the comment-stripped counts of the create-only
   * guard and of the amendment refusal, one of each per authored kind.
   */
  readonly admission?: {
    readonly file: string;
    readonly createOnlyGuards: number;
    readonly amendmentRefusals: number;
  };
}

/** Every exported `*Adapter` / `*Coordinator` class of the engine and its whole public surface. */
export const EXPECTED_ADAPTER_SURFACES: Readonly<Record<string, ExpectedAdapterSurface>> = {
  /**
   * The infrastructure-only Causal Draw owner path (F-027-CD1): ONE operation (`draw`) and two typed reads by identity.
   * There is no establish-style writer, no precommit/result writer and no re-draw: every record is published through the
   * adapter's single `.commit(` call.
   */
  CausalDrawAdapter: {
    methods: ["draw", "precommit", "result"],
    source: {
      file: "packages/engine/src/causal-draw/adapter.ts",
      commitCalls: 1,
      establishWriters: [],
    },
  },
  DiplomacyAdapter: {
    methods: [
      "diplomaticFramework",
      "establishDiplomaticFramework",
      "establishExternalRecognition",
      "establishExternalizedClaimDispute",
      "establishRelationEdge",
      "externalRecognition",
      "externalizedClaimDispute",
      "relationEdge",
    ],
    source: {
      file: "packages/engine/src/diplomacy/adapter.ts",
      commitCalls: 4,
      establishWriters: [
        "establishDiplomaticFramework",
        "establishExternalRecognition",
        "establishExternalizedClaimDispute",
        "establishRelationEdge",
      ],
    },
    admission: {
      file: "packages/engine/src/diplomacy/admission.ts",
      createOnlyGuards: 4,
      amendmentRefusals: 4,
    },
  },
  EconomyAdapter: {
    methods: ["access", "demand", "issueDemand", "realization", "request"],
  },
  EpistemicAccessAdapter: {
    methods: ["engineSealedProvenance", "establishBoundedSharedAccess", "event", "packet"],
  },
  GipAdapter: {
    methods: [
      "establishGovernanceInstrument",
      "establishInstitution",
      "establishOffice",
      "establishScopeBinding",
      "governanceInstrument",
      "institutionIdentity",
      "officeAuthorityLocus",
      "scopeBinding",
    ],
    source: {
      file: "packages/engine/src/gip/adapter.ts",
      commitCalls: 1,
      establishWriters: [
        "establishGovernanceInstrument",
        "establishInstitution",
        "establishOffice",
        "establishScopeBinding",
      ],
    },
  },
  KtiAdapter: {
    methods: [
      "developmentObject",
      "establishDevelopmentObject",
      "establishTransferBasis",
      "transferBasis",
      "transferPackage",
    ],
  },
  LogisticsAdapter: {
    methods: ["commitMovement", "commitment", "currentLocus", "delivery", "dispatch", "transfer"],
  },
  NamedActorAdapter: {
    methods: [
      "basis",
      "capability",
      "establishCapabilityBasis",
      "establishRandomizedCapabilityBasis",
    ],
  },
  /**
   * The PC capability profile receiving path of the one I-002 PC owner: two receiving publications — the fresh-PC
   * `receiveCapabilityBasis` and the distinct existing-actor `carryForwardActorCapability` (thirty-second slice), neither of
   * which is an `establish…` writer: the PC owner receives an already-established fact and establishes or resolves nothing —
   * and two typed reads by identity. Both publications share the one private commit helper. The persisted capability is no
   * method: it is the IM-02 PC Capability Close stage.
   */
  PcCapabilityAdapter: {
    methods: ["basis", "capability", "carryForwardActorCapability", "receiveCapabilityBasis"],
    source: {
      file: "packages/engine/src/pc-capability/adapter.ts",
      commitCalls: 1,
      establishWriters: [],
    },
  },
  PopulationAdapter: {
    methods: ["close", "cohort", "cohortView", "establishLedger", "instantiateCohort", "ledger"],
  },
  ProductionAdapter: {
    methods: [
      "acceptedEntity",
      "availability",
      "claim",
      "completion",
      "establishReserve",
      "operation",
      "reserve",
      "startOperation",
    ],
  },
  TemporalCoordinator: {
    methods: [
      "advance",
      "boundaryIndex",
      "continueRemainder",
      "establishCanonicalTime",
      "object",
      "registerObject",
      "state",
      "transaction",
    ],
  },
};

/**
 * Diplomacy-family keys that belong to NO registered key space: unregistered siblings and malformed paths beneath or
 * beside every registered Diplomacy key space. Each must match no fact kind's key pattern (checked centrally) and
 * each must be refused with KEY_NOT_ADMITTED by a campaign store (probed by the owner integration suites).
 *
 * When a slice legitimately registers a sibling kind, the keys that kind makes lawful move out of this list and into
 * `EXPECTED_FACT_KINDS` above. The integration suites that probe these keys do not change.
 */
export const UNREGISTERED_DIPLOMACY_KEY_PROBES: readonly string[] = [
  "diplomacy/recognition",
  "diplomacy/recognition/r1/x",
  "diplomacy/recognition/r1/reciprocal",
  "diplomacy/recognition/r1/r2",
  "diplomacy/dispute",
  "diplomacy/dispute/d1/x",
  "diplomacy/dispute/d1/position",
  "diplomacy/dispute/d1/d2",
  "diplomacy/claim/c1",
  "diplomacy/claim/d1",
  "diplomacy/relation",
  "diplomacy/relation/r1/x",
  "diplomacy/relation/d1/x",
  "diplomacy/relation/r1/channels",
  "diplomacy/relation/r1/recognitions",
  "diplomacy/relation/r1/claim-disputes",
  "diplomacy/relation/r1/instruments",
  "diplomacy/relation/r1/frameworks",
  "diplomacy/relation-index/r1",
  "diplomacy/edge/r1",
  "diplomacy/framework",
  "diplomacy/framework/f1/x",
  "diplomacy/framework/f1/members",
  "diplomacy/framework/f1/member/m1",
  "diplomacy/framework/f1/charter",
  "diplomacy/framework/f1/commitments",
  "diplomacy/framework-index/f1",
  "diplomacy/frameworks/f1",
  "diplomacy/channel/c1",
  "diplomacy/negotiation/n1",
  "diplomacy/instrument/i1",
  "diplomacy/instrument/i1/clause/c1",
  "diplomacy/binding/b1",
  "diplomacy/compliance/c1",
  "diplomacy/receipt/r1",
  "diplomacy/vote/v1",
];

/**
 * Accessors over the data above, for suites whose own claim is about an inventory ("exactly these kinds"): they
 * compare production to THIS oracle, never to a literal repeated in the suite. They import nothing.
 */
export const expectedKindIds = (by: { group?: string; owner?: string }): string[] =>
  EXPECTED_FACT_KINDS.filter(
    (k) =>
      (by.group === undefined || k.group === by.group) &&
      (by.owner === undefined || k.owner === by.owner),
  ).map((k) => k.id);

export const expectedOwnerFacetSet = (owner: string): Set<string> =>
  new Set(EXPECTED_OWNER_FACETS[owner] ?? []);

/**
 * Identifiers that belong to a LAWFUL registered Diplomacy sibling. Slices that must prove they did not construct a
 * forbidden neighbour (relation, framework, …) in their own modules and contract strip these tokens first, so the
 * sibling's own vocabulary is not mistaken for a forbidden construct. A newly registered sibling is acknowledged here,
 * once, instead of in every earlier Diplomacy suite's own copy of this list.
 */
export const LAWFUL_SIBLING_IDENTIFIERS: Readonly<Record<string, readonly string[]>> = {
  diplomacy_relation_edge: [
    "RelationEdgeSchema",
    "RelationEdge",
    "TypedRelationEdge",
    "readRelationEdge",
    "relationEdge",
    "establishRelationEdge",
    "checkRelationEdge",
    "verifyRelationEdge",
    "diplomacyRelationKey",
    "DIPLOMACY_RELATION_EDGE_RULE",
    "relation_id",
    "relationId",
    "relation",
    "diplomacy_relation_edge",
  ],
  diplomacy_framework: [
    "DiplomaticFrameworkSchema",
    "DiplomaticFramework",
    "TypedDiplomaticFramework",
    "readDiplomaticFramework",
    "diplomaticFramework",
    "establishDiplomaticFramework",
    "checkFramework",
    "verifyFramework",
    "diplomacyFrameworkKey",
    "DIPLOMACY_FRAMEWORK_RULE",
    "framework_id",
    "frameworkId",
    "framework",
    "diplomacy_framework",
  ],
};

/** Removes every lawful-sibling identifier (whole-word) from an identifier-only source text. */
export const stripLawfulSiblingIdentifiers = (text: string): string =>
  text.replace(
    new RegExp(`\\b(${Object.values(LAWFUL_SIBLING_IDENTIFIERS).flat().join("|")})\\b`, "g"),
    "",
  );

export const expectedAdapterMethods = (className: string): string[] => {
  const s = EXPECTED_ADAPTER_SURFACES[className];
  if (!s) throw new Error(`no expected adapter surface for ${className}`);
  return [...s.methods];
};
