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
  PC_COLLECTION_FACT_KINDS,
  PRODUCTION_PC_COLLECTION_WORK_RULE,
  PcCollectionAdapter,
  SOURCE_DRAWDOWN_FACT_KINDS,
  factKind,
} from "@immortalis/engine";
import {
  CPAA_C1_PROVISIONAL,
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
const MODULES = [
  "packages/contracts/src/pc-collection.ts",
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
  it("the six kinds' governing rule cites the candidate and the Sovereign's non-final direction, with effective_basis provisional", () => {
    expect(PC_COLLECTION_FACT_KINDS.map((k) => k.id)).toEqual([
      "pc_collection_commitment",
      "pc_collection_request",
      "pc_collection_mechanism",
      "pc_collection_reach_decision",
      "population_pc_occupancy",
      "production_pc_collection_work",
    ]);
    for (const k of PC_COLLECTION_FACT_KINDS) {
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

  it("the candidate and the direction are not lock pins: the lock, the Runtime Contract and the open-gate snapshots are untouched", () => {
    const lockText = readFileSync("spec/f027/spec-lock.json", "utf8");
    for (const p of [CANDIDATE_PIN, DIRECTION_PIN, "3fb20af901e081c294cbf534d24de7c0"])
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
    ])
      expect(doc, text).toContain(text);
    for (const notImplemented of [
      "Generic player actions",
      "generic action bus",
      "universal action law",
      "natural-language parsing",
      "transformation or crafting",
      "partial credit, cancellation or abort",
      "interruption",
      "rights or ownership of sources",
      "provider calls",
    ])
      expect(doc, notImplemented).toContain(notImplemented);
  });
});

describe("IA-03 owner exclusivity: six kinds, two new facets, no new owner, one adapter, no subsystem", () => {
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
      "pc_voluntary_commitment",
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.get("population")!].sort()).toEqual([
      "population_pc_occupancy",
      "population_state",
    ]);
    // World-State and Logistics gained nothing: the finite source and the movement path are reused
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "world_state").map((k) => k.id)).toEqual([
      "world_profile",
      "world_locus",
      "world_fallback_entity",
      "world_entity_transition",
      "world_actor_coupling",
      "world_pc_locus_custody",
      "world_source_condition",
      "world_source_delivery",
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
    ] as const)
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)).map((k) => k.id)).toEqual([id]);
  });

  it("the provisional work rule is additive: the drawdown kinds keep their rule and accept it only for PC-owned values", () => {
    for (const k of SOURCE_DRAWDOWN_FACT_KINDS) expect(k.alternateRules, k.id).toBeUndefined();
    for (const id of ["production_extraction", "production_source_account"] as const) {
      const k = factKind(id);
      expect(k.rule.effective_basis).toBe("pinned-by-spec-lock");
      expect(k.alternateRules).toHaveLength(1);
      expect(k.alternateRules![0]!.rule).toEqual(PRODUCTION_PC_COLLECTION_WORK_RULE);
      expect(k.alternateRules![0]!.admits({})).toBe(false);
    }
  });

  it("the module set is exactly the contract, the rules, the verifier, the one adapter and the one gateway: no new owner, scheduler, journal or manifest", () => {
    for (const f of MODULES) expect(existsSync(f), f).toBe(true);
    expect(readdirSync("packages/engine/src/pc-collection").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "derive.ts",
      "integrity.ts",
      "state.ts",
    ]);
    for (const f of MODULES.filter((m) => m !== "packages/engine/src/pc-collection/adapter.ts"))
      expect(code(f), f).not.toMatch(/\b(?:export )?class\s+\w+/);
    expect(existsSync("migrations/manifests/pc-collection.json")).toBe(false);
    expect(adapterMethods(PcCollectionAdapter)).toEqual([
      "adjudicateReach",
      "closed",
      "commit",
      "commitment",
      "establishMechanism",
      "establishRequest",
      "extraction",
      "hold",
      "mechanism",
      "occupancy",
      "occupancyState",
      "reach",
      "reachTask",
      "registerOccupancy",
      "releaseOccupancyDenied",
      "request",
      "startWork",
      "temporalObject",
      "work",
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
        "cycle_duration",
        "cycle_quote",
        "mechanism_id",
        "pc_id",
        "traversal",
      ].sort(),
    );
    expect(Object.keys(PcCollectionReachAnswerSchema.shape).sort()).toEqual(
      ["mechanism", "path", "task_digest"].sort(),
    );
    expect(Object.keys(PopulationPcOccupancySchema.shape).sort()).toEqual(
      ["act_id", "commitment", "committer", "interval", "mechanism", "pc_id", "status"].sort(),
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
