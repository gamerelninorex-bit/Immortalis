// Conformance evidence for the CPAA-C1 v0.2 PROVISIONAL consequential active-PC collection slice. It proves what the slice IS NOT as
// carefully as what it is: every new kind is tagged as an unratified candidate lowering; no new owner, adapter-of-everything, action
// bus or universal action law exists; the host surface has no field a host could state a result in; the frozen lock, Runtime
// Contract and open-gate snapshots are untouched. The candidate (BLUE CPAA-C1 v0.2, pin 2026-10-16T00:31:39.142Z) lacks RED
// re-check, consensus and ratification; nothing here is a spec-lock pin. PF-6/F-028 stays BLOCKED / NOT ACTIVATED.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  PC_COLLECTION_CESSATION_RULE,
  POPULATION_WORKFORCE_SCOPE_RULE,
  WORLD_SCENE_CLOSURE_RULE,
  PC_COLLECTION_FACT_KINDS,
  POPULATION_PC_OCCUPANCY_LAPSE_RULE,
  POPULATION_PC_OCCUPANCY_TERMINATION_RULE,
  PRODUCTION_PC_COLLECTION_TERMINATION_RULE,
  PRODUCTION_PC_COLLECTION_WORK_RULE,
  TEMPORAL_FACT_KINDS,
  TEMPORAL_PC_COLLECTION_LAPSE_RETIREMENT_RULE,
  TEMPORAL_PC_COLLECTION_RETIREMENT_RULE,
  PcCollectionAdapter,
  SOURCE_DRAWDOWN_FACT_KINDS,
  factKind,
} from "@immortalis/engine";
import {
  CPAA_C1_D1_PROVISIONAL,
  CPAA_C1_DELEGATED,
  CPAA_C1_PROVISIONAL,
  CeaseConfirmedPcCollectionRequestSchema,
  PcCollectionCessationInputSchema,
  PcCollectionCessationSchema,
  ProductionPcCollectionTerminationSchema,
  CommitConfirmedPcCollectionRequestSchema,
  EstablishPcCollectionMechanismInputSchema,
  GetPcCollectionReachTaskRequestSchema,
  PcCollectionCommitInputSchema,
  PcCollectionCommitmentSchema,
  PcCollectionMechanismSchema,
  PcCollectionReachAnswerSchema,
  PopulationPcOccupancySchema,
  ProductionPcCollectionWorkSchema,
  StartConfirmedPcCollectionRequestSchema,
  SubmitPcCollectionReachRequestSchema,
} from "@immortalis/contracts";
import { code, lock } from "../support/f027.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const CANDIDATE_ARTIFACT = "https://app.notion.com/p/3fb20af901e081c294cbf534d24de7c0";
const CANDIDATE_PIN = "2026-10-16T00:31:39.142Z";
const DIRECTION_PIN = "2026-10-16T01:38:29.022Z";
// BLUE clause D-1 (proposed, NOT adopted): the disposition's own artifact and native pin
const D1_ARTIFACT = "https://app.notion.com/p/3fb20af901e08170b369fdf2353a73d4";
const D1_PIN = "2026-10-16T04:43:59.946Z";
const D1_IDS = ["cessation", "termination"] as const;
const C1_KIND_IDS = [
  "pc_collection_commitment",
  "pc_collection_request",
  "pc_collection_mechanism",
  "pc_collection_reach_decision",
  "population_pc_occupancy",
  "production_pc_collection_work",
] as const;
const D1_KIND_IDS = ["pc_collection_cessation", "production_pc_collection_termination"] as const;
// CPAA-C1 v0.3 (design ratified; implementation acceptance pending): the attestation and Population's representation determination
const V03_KIND_IDS = ["pc_collection_cycle_attestation", "population_pc_representation"] as const;
const MODULES = [
  "packages/contracts/src/pc-collection.ts",
  "packages/engine/src/pc-collection/cessation.ts",
  "packages/engine/src/pc-collection/determinations.ts",
  "packages/contracts/src/protocol-pc-collection.ts",
  "packages/engine/src/pc-collection/state.ts",
  "packages/engine/src/pc-collection/derive.ts",
  "packages/engine/src/pc-collection/admission.ts",
  "packages/engine/src/pc-collection/adapter.ts",
  "packages/engine/src/pc-collection/integrity.ts",
  "packages/protocol/src/pc-collection.ts",
];
const GATEWAY = "packages/protocol/src/pc-collection.ts";

describe("IA-01 provisional status: every new kind is tagged as an unratified candidate lowering, never as a pinned rule", () => {
  it("the six C1 kinds' governing rule cites the candidate and the Sovereign's non-final direction, with effective_basis provisional", () => {
    expect(PC_COLLECTION_FACT_KINDS.map((k) => k.id)).toEqual([
      ...C1_KIND_IDS,
      "pc_collection_cessation",
      ...V03_KIND_IDS,
      "world_scene_closure",
      "population_workforce_scope",
      "production_pc_collection_termination",
      "production_pc_collection_lapse",
      "pc_intrinsic_clarification",
    ]);
    for (const k of PC_COLLECTION_FACT_KINDS.filter((k) =>
      (C1_KIND_IDS as readonly string[]).includes(k.id),
    )) {
      expect(k.rule.artifact, k.id).toBe(CANDIDATE_ARTIFACT);
      expect(k.rule.native_pin, k.id).toBe(CANDIDATE_PIN);
      expect(k.rule.effective_basis, k.id).toBe(
        "provisional-candidate-lowering-pending-ratification",
      );
      expect(k.rule.effective_basis, k.id).not.toBe("pinned-by-spec-lock");
      expect(k.rule.supersedes, k.id).toBeNull();
      const lineage = k.rule.authority_lineage.join("\n");
      for (const cited of [CPAA_C1_PROVISIONAL, DIRECTION_PIN, "not ratified"])
        expect(lineage, `${k.id}: ${cited}`).toContain(cited);
    }
  });

  it("the two D-1 kinds and the three D-1 alternate rules cite the BLUE disposition and the construction-approved handoff as a PROPOSED, NOT adopted clause", () => {
    for (const k of PC_COLLECTION_FACT_KINDS.filter((k) =>
      (D1_KIND_IDS as readonly string[]).includes(k.id),
    ))
      expect([k.id, k.rule.artifact, k.rule.native_pin]).toEqual([k.id, D1_ARTIFACT, D1_PIN]);
    for (const rule of [
      PC_COLLECTION_CESSATION_RULE,
      PRODUCTION_PC_COLLECTION_TERMINATION_RULE,
      POPULATION_PC_OCCUPANCY_TERMINATION_RULE,
      TEMPORAL_PC_COLLECTION_RETIREMENT_RULE,
    ]) {
      expect(rule.artifact).toBe(D1_ARTIFACT);
      expect(rule.native_pin).toBe(D1_PIN);
      expect(rule.effective_basis).toBe("provisional-candidate-lowering-pending-ratification");
      expect(rule.effective_basis).not.toBe("pinned-by-spec-lock");
      expect(rule.supersedes).toBeNull();
      const lineage = rule.authority_lineage.join("\n");
      for (const cited of [CPAA_C1_D1_PROVISIONAL, "NOT adopted", "6208352198"])
        expect(lineage, cited).toContain(cited);
    }
    // the D-1 literal statuses are stated where a reader meets them
    expect(CPAA_C1_D1_PROVISIONAL).toMatch(
      /not adopted, not ratified, not a source-lock amendment/,
    );
    expect(D1_IDS).toHaveLength(2);
  });

  it("the two kinds written under the bounded semantic delegation say so: newly authorized, not a frozen-source rule, not a lock pin, review pending", () => {
    for (const rule of [WORLD_SCENE_CLOSURE_RULE, POPULATION_WORKFORCE_SCOPE_RULE]) {
      expect(rule.effective_basis).toBe(
        "sovereign-bounded-semantic-delegation-independent-review-pending",
      );
      expect(rule.effective_basis).not.toBe("pinned-by-spec-lock");
      expect(rule.native_pin).toBe("2026-10-16T12:07:41.219Z");
      const lineage = rule.authority_lineage.join("\n");
      for (const cited of [
        "NEWLY AUTHORIZED",
        "6215171891",
        "not a spec-lock pin",
        "independent BLUE review",
      ])
        expect(lineage, cited).toContain(cited);
    }
    expect(CPAA_C1_DELEGATED).toMatch(/NEWLY AUTHORIZED minimum rules, not a frozen-source rule/);
  });

  it("the candidate and the direction are not lock pins: the lock, the Runtime Contract and the open-gate snapshots are untouched", () => {
    const lockText = readFileSync("spec/f027/spec-lock.json", "utf8");
    for (const p of [
      CANDIDATE_PIN,
      DIRECTION_PIN,
      D1_PIN,
      "3fb20af901e081c294cbf534d24de7c0",
      "3fb20af901e08170b369fdf2353a73d4",
    ])
      expect(lockText, p).not.toContain(p);
    expect(lock.frozen_sources).toHaveLength(23);
    expect(lock.incorporated_tranches).toHaveLength(2);
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
  });

  it("the foundation document states the provisional status, the chain, the truth levels and the specific unresolved blockers", () => {
    const doc = readFileSync("docs/pc-collection-foundation.md", "utf8");
    for (const text of [
      "PROVISIONAL CANDIDATE LOWERING",
      "Not ratified",
      CANDIDATE_PIN,
      DIRECTION_PIN,
      "one closed class",
      "not an action framework",
      "pc_collection_commitment",
      "pc_collection_mechanism",
      "population_pc_occupancy",
      "production_pc_collection_work",
      "role.player",
      "permission.player_choice.commit",
      "role.gm",
      "permission.rule.adjudicate",
      "What a scripted host proves",
      "Unresolved implementation blockers",
      "F-014B §10",
      "F-014B §11",
      "no partial credit",
      "IA-07 BLOCKED",
      "PF-6/F-028",
      // D-1 and the BLUE disposition's boundaries are stated where a reader meets them
      D1_PIN,
      "PC Collection Voluntary Cessation",
      "NOT adopted, NOT ratified, NOT a source-lock amendment",
      "DEPENDENCY-BLOCKED",
      "lexical guard, not a semantic adjudication",
      "RELEASED_TERMINATED",
      "units_credited",
      // v0.3 conformity repair: ratified design, implementation acceptance pending
      "v0.3 conformity repair",
      "not code acceptance, a source-lock amendment or merge permission",
      "OUTSIDE_AGGREGATE",
      "CONTINUATION_HELD",
      "not** knowledge-neutral",
    ])
      expect(doc, text).toContain(text);
    for (const notImplemented of [
      "Generic player actions",
      "generic action bus",
      "universal action law",
      "natural-language parsing",
      "transformation or crafting",
      "partial credit, abort, any cancellation other than the PROVISIONAL, unadopted D-1 voluntary cessation",
      "interruption",
      "rights or ownership of sources",
      "provider calls",
    ])
      expect(doc, notImplemented).toContain(notImplemented);
  });
});

describe("IA-03 owner exclusivity: eight kinds (six C1 + two D-1), two new facets, no new owner, one adapter, no subsystem", () => {
  it("each kind sits under an EXISTING owner with the stated lifecycle; Population's registration is the only ADVANCING one", () => {
    expect(
      PC_COLLECTION_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle, k.im, k.rc]),
    ).toEqual([
      [
        "pc_collection_commitment",
        "pc_existence",
        "pc_voluntary_commitment",
        "SEALED",
        "IM-07",
        ["RC-02", "RC-15", "RC-16"],
      ],
      [
        "pc_collection_request",
        "pc_existence",
        "pc_voluntary_commitment",
        "SEALED",
        "IM-07",
        ["RC-02"],
      ],
      [
        "pc_collection_mechanism",
        "pc_existence",
        "pc_collection_mechanism",
        "SEALED",
        "IM-07",
        ["RC-02"],
      ],
      [
        "pc_collection_reach_decision",
        "referee_adjudication_kernel",
        "referee_provenance",
        "SEALED",
        "IM-12",
        ["RC-02", "RC-09", "RC-16"],
      ],
      [
        "population_pc_occupancy",
        "population",
        "population_pc_occupancy",
        "ADVANCING",
        "IM-04",
        ["RC-02", "RC-06"],
      ],
      [
        "production_pc_collection_work",
        "production",
        "production_state",
        "SEALED",
        "IM-05",
        ["RC-02", "RC-06", "RC-10"],
      ],
      // D-1 (PROVISIONAL, not adopted): the PC-side cessation request and Production's terminal disposition: no new owner, no new facet
      [
        "pc_collection_cessation",
        "pc_existence",
        "pc_voluntary_commitment",
        "SEALED",
        "IM-07",
        ["RC-02", "RC-15", "RC-16"],
      ],
      // CPAA-C1 v0.3 (design ratified; implementation acceptance pending): the attestation and Population's determination
      [
        "pc_collection_cycle_attestation",
        "pc_existence",
        "pc_collection_mechanism",
        "SEALED",
        "IM-07",
        ["RC-02", "RC-03", "RC-16"],
      ],
      [
        "population_pc_representation",
        "population",
        "population_pc_occupancy",
        "ADVANCING",
        "IM-04",
        ["RC-02", "RC-06"],
      ],
      // CPAA-C1 v0.3 bounded semantic delegation (newly authorized): the scene closure and Population's workforce scope
      [
        "world_scene_closure",
        "world_state",
        "world_scene_closure",
        "ADVANCING",
        "IM-03",
        ["RC-02", "RC-16"],
      ],
      [
        "population_workforce_scope",
        "population",
        "population_workforce_scope",
        "ADVANCING",
        "IM-04",
        ["RC-02", "RC-06"],
      ],
      [
        "production_pc_collection_termination",
        "production",
        "production_state",
        "SEALED",
        "IM-05",
        ["RC-02", "RC-06", "RC-10"],
      ],
      [
        "production_pc_collection_lapse",
        "production",
        "production_state",
        "SEALED",
        "IM-05",
        ["RC-02", "RC-06", "RC-10"],
      ],
      // R-5 (NEWLY AUTHORIZED): the PC owner's create-only prospective intrinsic clarification, a further facet of the one PC owner
      [
        "pc_intrinsic_clarification",
        "pc_existence",
        "pc_intrinsic_clarification",
        "SEALED",
        "IM-07",
        ["RC-02", "RC-03"],
      ],
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.keys()].sort()).toEqual(
      [
        "causal_draw_kernel",
        "culture",
        "culture_adjudication_kernel",
        "diplomacy",
        "economy",
        "epistemic_access",
        "gip",
        "kti",
        "logistics",
        "named_actor",
        "pc_existence",
        "population",
        "production",
        "referee_adjudication_kernel",
        "role_registry",
        "temporal_kernel",
        "world_state",
      ].sort(),
    );
    expect([...CANONICAL_OWNER_REGISTRY.get("pc_existence")!].sort()).toEqual([
      "existence_contract",
      "pc_capability_profile",
      "pc_collection_mechanism",
      "pc_intrinsic_clarification",
      "pc_voluntary_commitment",
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.get("population")!].sort()).toEqual([
      "population_pc_occupancy",
      "population_state",
      "population_workforce_scope",
    ]);
    // World-State gained exactly the scene closure; Logistics gained nothing: the finite source and the movement path are reused
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "world_state").map((k) => k.id)).toEqual([
      "world_profile",
      "world_locus",
      "world_fallback_entity",
      "world_entity_transition",
      "world_actor_coupling",
      "world_pc_locus_custody",
      "world_source_condition",
      "world_source_delivery",
      // the bounded semantic delegation (newly authorized): the one World-State kind this slice adds, under its own new facet
      "world_scene_closure",
    ]);
  });

  it("the key spaces are exclusive: every example key resolves to exactly its kind", () => {
    for (const [key, id] of [
      ["pc/p/collection/a/commitment", "pc_collection_commitment"],
      ["pc/p/collection/a/request", "pc_collection_request"],
      ["pc/p/collection-mechanism/m", "pc_collection_mechanism"],
      ["referee/pc-collection-reach/p/a", "pc_collection_reach_decision"],
      ["population-pc/p/occupancy", "population_pc_occupancy"],
      ["production/pc-collection-work/x", "production_pc_collection_work"],
      ["pc/p/collection/a/cessation", "pc_collection_cessation"],
      ["production/pc-collection-termination/x", "production_pc_collection_termination"],
      ["production/pc-collection-lapse/x", "production_pc_collection_lapse"],
    ] as const)
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)).map((k) => k.id)).toEqual([id]);
  });

  it("the provisional rules are additive: the drawdown kinds keep their rule and accept the work rule only for PC-owned values (and the account, additionally, the D-1 termination rule)", () => {
    for (const k of SOURCE_DRAWDOWN_FACT_KINDS) expect(k.alternateRules, k.id).toBeUndefined();
    for (const id of ["production_extraction", "production_source_account"] as const) {
      const k = factKind(id);
      expect(k.rule.effective_basis).toBe("pinned-by-spec-lock");
      expect(k.alternateRules).toHaveLength(id === "production_source_account" ? 3 : 1);
      expect(k.alternateRules![0]!.rule).toEqual(PRODUCTION_PC_COLLECTION_WORK_RULE);
      expect(k.alternateRules![0]!.admits({})).toBe(false);
    }
    const account = factKind("production_source_account").alternateRules![1]!;
    expect(account.rule).toEqual(PRODUCTION_PC_COLLECTION_TERMINATION_RULE);
    expect(account.admits({})).toBe(false);
    // the Temporal kernel's object and index kinds keep KERNEL_RULE and accept the D-1 retirement rule only as an alternate
    for (const id of ["temporal_object", "temporal_boundary_index"] as const) {
      const k = factKind(id);
      expect(k.rule.effective_basis).toBe("pinned-by-spec-lock");
      expect(k.alternateRules).toHaveLength(2);
      expect(k.alternateRules![0]!.rule).toEqual(TEMPORAL_PC_COLLECTION_RETIREMENT_RULE);
      expect(k.alternateRules![0]!.admits({})).toBe(false);
      // R-4 (NEWLY AUTHORIZED): the lapse retirement is a second, equally bounded alternate rule
      expect(k.alternateRules![1]!.rule).toEqual(TEMPORAL_PC_COLLECTION_LAPSE_RETIREMENT_RULE);
      expect(k.alternateRules![1]!.admits({})).toBe(false);
    }
    for (const k of TEMPORAL_FACT_KINDS) expect(k.alternateRules, k.id).toBeUndefined();
    // the occupancy slot accepts the Population termination rule only for its RELEASED_TERMINATED value
    const occupancy = factKind("population_pc_occupancy").alternateRules!;
    expect(occupancy).toHaveLength(2);
    expect(occupancy[0]!.rule).toEqual(POPULATION_PC_OCCUPANCY_TERMINATION_RULE);
    expect(occupancy[0]!.admits({})).toBe(false);
    expect(occupancy[0]!.admits({ status: "OPEN" })).toBe(false);
    // R-4: and only for its RELEASED_LAPSED value under the Population lapse rule
    expect(occupancy[1]!.rule).toEqual(POPULATION_PC_OCCUPANCY_LAPSE_RULE);
    expect(occupancy[1]!.admits({})).toBe(false);
    expect(occupancy[1]!.admits({ status: "OPEN" })).toBe(false);
  });

  it("the module set is exactly the contract, the rules, the verifier, the one adapter and the one gateway: no new owner, scheduler, journal or manifest", () => {
    for (const f of MODULES) expect(existsSync(f), f).toBe(true);
    expect(readdirSync("packages/engine/src/pc-collection").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "cessation.ts",
      "clarification.ts",
      "derive.ts",
      "determinations.ts",
      "integrity.ts",
      "lapse.ts",
      "state.ts",
    ]);
    for (const f of MODULES.filter((m) => m !== "packages/engine/src/pc-collection/adapter.ts"))
      expect(code(f), f).not.toMatch(/\b(?:export )?class\s+\w+/);
    expect(existsSync("migrations/manifests/pc-collection.json")).toBe(false);
    expect(adapterMethods(PcCollectionAdapter)).toEqual([
      "adjudicateReach",
      "attestCycle",
      "attestation",
      "cease",
      "cessation",
      "clarification",
      "clarificationScope",
      "clarify",
      "closed",
      "commit",
      "commitment",
      "cycleTask",
      "determineRepresentation",
      "establishMechanism",
      "establishRequest",
      "establishSceneClosure",
      "establishWorkforceScope",
      "extraction",
      "hold",
      "lapse",
      "lapseRecord",
      "mechanism",
      "occupancy",
      "occupancyState",
      "reach",
      "reachTask",
      "registerOccupancy",
      "releaseOccupancyDenied",
      "releaseOccupancyLapsed",
      "releaseOccupancyTerminated",
      "representation",
      "request",
      "sceneClosure",
      "sceneClosureIsCurrent",
      "startWork",
      "temporalObject",
      "terminate",
      "termination",
      "work",
      "workforceScope",
      "workforceScopeIsCurrent",
    ]);
  });
});

describe("the slice is one closed class: no action bus, no universal action law, no generic duration, rate, capacity or skill table", () => {
  const modules = MODULES.map((f) => [f, code(f)] as const);

  it("no module names a generic action construct, a rate or capacity table, a skill, a speed or a natural-language construct", () => {
    for (const [f, text] of modules)
      expect(text, f).not.toMatch(
        /ActionBus|actionBus|ActionRegistry|actionRegistry|GenericAction|genericAction|UniversalAction|universalAction|action_registry|actionLaw|capacityTable|rateTable|skillTable|natural.?language|pathfind|inventory/,
      );
  });

  it("no module reads a clock, an RNG, a timer or a counter: every identity and time is derived from committed facts", () => {
    for (const [f, text] of modules)
      expect(text, f).not.toMatch(
        /Date\.now|new Date\(|Math\.random|setTimeout|setInterval|performance\.now|crypto\.random|randomUUID|process\.hrtime/,
      );
  });

  it("the strict contracts have no field in which a result, a feasibility, a rate, a boundary or a verdict could be stated by a caller", () => {
    expect(Object.keys(PcCollectionCommitInputSchema.shape).sort()).toEqual(
      ["act_id", "authored_under", "pc_id", "quantity", "reserve_id", "source"].sort(),
    );
    expect(Object.keys(PcCollectionCommitmentSchema.shape.intent.shape).sort()).toEqual(
      ["destination", "kind", "material_class", "quantity", "source"].sort(),
    );
    expect(Object.keys(PcCollectionMechanismSchema.shape).sort()).toEqual(
      [
        "actuator",
        "authored_from",
        "committer",
        "cycle",
        "mechanism_id",
        "pc_id",
        "traversal",
      ].sort(),
    );
    expect(Object.keys(EstablishPcCollectionMechanismInputSchema.shape).sort()).toEqual(
      [
        "actuator",
        "claims",
        "clarified",
        "cycle_duration",
        "cycle_quote",
        "mechanism_id",
        "pc_id",
        "traversal",
      ].sort(),
    );
    expect(Object.keys(PcCollectionReachAnswerSchema.shape).sort()).toEqual(
      ["mechanism", "path", "scene", "task_digest"].sort(),
    );
    expect(Object.keys(PopulationPcOccupancySchema.shape).sort()).toEqual(
      [
        "act_id",
        "commitment",
        "committer",
        "interval",
        "mechanism",
        "pc_id",
        "representation",
        "status",
      ].sort(),
    );
    expect(Object.keys(ProductionPcCollectionWorkSchema.shape).sort()).toEqual(
      ["act_id", "derivation", "pc_id", "pins", "work_id"].sort(),
    );
  });
});

describe("the BLUE repair: the exact cycle is grounded, the §11 determination is derived, and the character's knowledge is the owners' receipt", () => {
  it("no authored §11 field exists anywhere: the mechanism, its input and the work carry only the DERIVED determination", () => {
    for (const f of [
      "packages/contracts/src/pc-collection.ts",
      "packages/engine/src/pc-collection/derive.ts",
      "packages/engine/src/pc-collection/adapter.ts",
    ])
      expect(code(f), f).not.toMatch(
        /status:\s*z\.literal\("(NOT_APPLICABLE|APPLIES|UNRESOLVED)"\)|floor_minimum/,
      );
    expect(Object.keys(ProductionPcCollectionWorkSchema.shape.derivation.shape).sort()).toEqual(
      [
        "causal_duration",
        "completes_at",
        "cycles",
        "interaction_floor",
        "per_cycle",
        "started_at",
      ].sort(),
    );
  });

  it("the outcome reaches the character only through the existing direct-perception receipt: the Epistemic and I-001 modules are not widened", () => {
    // the one new thing the observation path learned is a sixth cited premise (the sealed delivery), derived from the PC's own records
    const referee = code("packages/engine/src/referee/derive.ts");
    expect(referee).toMatch(/OBSERVATION_OUTCOME_FACT_ID/);
    expect(referee).toMatch(/collectionOutcome\(/);
    for (const f of readdirSync("packages/engine/src/epistemic").map(
      (n) => `packages/engine/src/epistemic/${n}`,
    ))
      expect(code(f), f).not.toMatch(/pc-collection|PcCollection|pcCollection/);
    // the Glance read keeps its one fixed shape: it was not edited for the outcome
    expect(code("packages/protocol/src/current-observation-glance.ts")).not.toMatch(
      /collection|outcome|source-delivery/i,
    );
  });
});

describe("IM-15 host surface: four operations, strict bodies, no authority and no result field, and the same refusal for every cause", () => {
  it("the host request bodies carry the operation name (and for the one judgment, the untrusted reading) and nothing else", () => {
    expect(Object.keys(CommitConfirmedPcCollectionRequestSchema.shape)).toEqual(["operation"]);
    expect(Object.keys(GetPcCollectionReachTaskRequestSchema.shape)).toEqual(["operation"]);
    expect(Object.keys(StartConfirmedPcCollectionRequestSchema.shape)).toEqual(["operation"]);
    expect(Object.keys(SubmitPcCollectionReachRequestSchema.shape).sort()).toEqual([
      "answer",
      "operation",
    ]);
  });

  it("the gateway imports the contracts and the engine only, reaches no testkit or fixture, and states no authority itself", () => {
    const text = readFileSync(GATEWAY, "utf8");
    const specifiers = [...text.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect([...new Set(specifiers)]).toEqual(["@immortalis/contracts", "@immortalis/engine"]);
    const c = code(GATEWAY);
    expect(c).not.toMatch(/testkit|tests\/|fixture/i);
    // the opaque handle lives in a module-private WeakMap; the module neither exports it nor states a role or permission
    expect(c).toMatch(/new WeakMap</);
    expect(c).not.toMatch(/export (?:const|let) bindings/);
    expect(c).not.toMatch(
      /role\.player|role\.gm|permission\.|PLAYER_CHOICE_AUTHORITY|CANON_WRITE_AUTHORITY/,
    );
  });

  it("no engine, contracts or testkit module names the protocol package or a gateway operation", () => {
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".ts") ? [`${d}/${e.name}`] : [],
      );
    for (const f of [
      ...walk("packages/engine/src"),
      ...walk("packages/contracts/src"),
      ...walk("packages/testkit/src"),
    ])
      expect(code(f), f).not.toMatch(
        /@immortalis\/protocol|commitConfirmedPcCollection|startConfirmedPcCollection|bindTrustedConfirmedPcCollectionContext/,
      );
  });

  it("the engine publishes no method that takes a boundary, a result, a verdict, a duration or a Reserve increase", () => {
    const adapter = code("packages/engine/src/pc-collection/adapter.ts");
    expect(adapter).not.toMatch(
      /boundary_at|boundaryAt|completes_at:\s*input|verdict:\s*input|duration:\s*input/,
    );
  });
});

describe("D-1 (PROVISIONAL, proposed and NOT adopted): the cessation contracts have no field in which a result, a credit, a boundary or an identity could be stated by a caller", () => {
  it("the strict schemas carry exactly the identities, the authority, the derived times and the retained evidence", () => {
    expect(Object.keys(PcCollectionCessationInputSchema.shape).sort()).toEqual(
      ["act_id", "authored_under", "pc_id"].sort(),
    );
    expect(Object.keys(PcCollectionCessationSchema.shape).sort()).toEqual(
      [
        "act_id",
        "authored_under",
        "basis",
        "cessation_id",
        "committer",
        "intent",
        "pc_id",
        "requested_at",
      ].sort(),
    );
    expect(Object.keys(PcCollectionCessationSchema.shape.intent.shape).sort()).toEqual(
      ["kind", "target"].sort(),
    );
    expect(Object.keys(ProductionPcCollectionTerminationSchema.shape).sort()).toEqual(
      ["act_id", "derivation", "disposition", "pc_id", "pins", "termination_id"].sort(),
    );
    expect(
      Object.keys(ProductionPcCollectionTerminationSchema.shape.derivation.shape).sort(),
    ).toEqual(
      [
        "claim",
        "cycles_fully_elapsed",
        "elapsed",
        "per_cycle",
        "reserve_effect",
        "source_effect",
        "stopped_at",
        "units_credited",
      ].sort(),
    );
    // no credit, no source or Reserve effect and no boundary is representable: each is a fixed literal or absent
    const d = ProductionPcCollectionTerminationSchema.shape.derivation.shape;
    expect(d.units_credited.safeParse(0).success).toBe(true);
    expect(d.units_credited.safeParse(1).success).toBe(false);
    expect(d.source_effect.safeParse("NONE").success).toBe(true);
    expect(d.source_effect.safeParse("DEPLETED").success).toBe(false);
    expect(d.reserve_effect.safeParse("NONE").success).toBe(true);
    expect(d.reserve_effect.safeParse("CREDITED").success).toBe(false);
  });

  it("the host operation names the stop and nothing else: no PC, act, time, result or credit field", () => {
    const request = { operation: "cease_confirmed_pc_collection" };
    expect(CeaseConfirmedPcCollectionRequestSchema.safeParse(request).success).toBe(true);
    for (const hostile of [
      { ...request, act_id: "a" },
      { ...request, units: 1 },
      { ...request, at: { unit: "u", value: 1 } },
      { operation: "cease_everything" },
      {},
    ])
      expect(CeaseConfirmedPcCollectionRequestSchema.safeParse(hostile).success).toBe(false);
  });
});
