// Conformance evidence for the Active-PC Voluntary Movement Commitment → Single-Leg Physical Relocation Foundation (fortieth bounded
// slice). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/
// BLOCKED and no source pin, Runtime Contract snapshot, open gate or acceptance status changed. The Sovereign-ratified and frozen
// Active-PC Post-Handover Physical Locus Ownership & Relocation Contract (frozen pin 2026-10-08T01:25:36.611Z) supplies the ownership
// and relocation rule and is NOT a lock pin: it is cited, never added to the lock. PF-6/F-028 stays BLOCKED / NOT ACTIVATED.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  I002_SOURCE,
  LogisticsAdapter,
  PC_MOVEMENT_FACT_KINDS,
  PC_MOVEMENT_RULE,
  WS010_SOURCE,
  factKind,
} from "@immortalis/engine";
import {
  FACET_PC_VOLUNTARY_COMMITMENT,
  MovementServiceRequestSchema,
  OWNER_PC_EXISTENCE,
  PlayerCharacterBindingSchema,
} from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import { expectedAdapterMethods, expectedOwnerFacetSet } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";
import { expectNotALockPin } from "../support/lock.ts";

const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!;
const MODULES = [
  "packages/contracts/src/pc-movement.ts",
  "packages/engine/src/pc-movement/derive.ts",
  "packages/engine/src/pc-movement/integrity.ts",
  "packages/engine/src/world/physical-subject.ts",
];
const FROZEN_CONTRACT_ID = "3f320af901e08166ad96ca0fc5e5069d";
const FROZEN_CONTRACT_PIN = "2026-10-08T01:25:36.611Z";
const BRIEF_PIN = "2026-10-08T02:33:06.758Z";

describe("IA-01 source/version fidelity: the composed authority lineage is cited at the exact pins; no pin moved", () => {
  it("the spec-locked pins this slice reconciles are the exact pins observed at the base", () => {
    expect(pin("I-002").native_pin).toBe("2026-09-25T00:15:54.536Z");
    expect(pin("WS-010").native_pin).toBe("2026-09-25T02:18:10.619Z");
    expect(I002_SOURCE).toEqual({
      artifact: pin("I-002").url,
      native_pin: pin("I-002").native_pin,
    });
    expect(WS010_SOURCE).toEqual({
      artifact: pin("WS-010").url,
      native_pin: pin("WS-010").native_pin,
    });
  });

  it("the PC-side kinds' governing rule is I-002 at its exact lock pin, with WS-010 §3.1 and the frozen contract in its lineage as NOT a lock pin", () => {
    for (const id of ["pc_movement_commitment", "pc_movement_request"] as const) {
      const rule = factKind(id).rule;
      expect(rule).toEqual(PC_MOVEMENT_RULE);
      expect(rule.artifact).toBe(pin("I-002").url);
      expect(rule.native_pin).toBe(pin("I-002").native_pin);
      expect(rule.effective_basis).toBe("pinned-by-spec-lock");
      expect(rule.supersedes).toBeNull();
    }
    const lineage = PC_MOVEMENT_RULE.authority_lineage.join("\n");
    for (const cited of [
      pin("WS-010").native_pin,
      "Movement Service Request",
      FROZEN_CONTRACT_ID,
      FROZEN_CONTRACT_PIN,
      "NOT a spec-lock pin",
      "2026-09-29T00:33:04.009Z", // Runtime Contract & Translation tranche
    ])
      expect(lineage, cited).toContain(cited);
    expect(PC_MOVEMENT_RULE.clause).toContain("authored willingness only");
  });

  it("the frozen contract and the brief's working pin are not lock pins: the lock, Runtime Contract and open-gate snapshots are untouched", () => {
    const lockText = readFileSync("spec/f027/spec-lock.json", "utf8");
    // the frozen contract is in no frozen source, addendum, governance reference or rule; its page id may appear only as the
    // non-executable R1 design-lineage row, and the contract's and the brief's own native pins appear nowhere (BLUE ruling on PR #84)
    expectNotALockPin(JSON.parse(lockText), FROZEN_CONTRACT_ID, [FROZEN_CONTRACT_PIN, BRIEF_PIN]);
    expect(lock.frozen_sources).toHaveLength(23);
    expect(lock.incorporated_tranches).toHaveLength(2);
    expect(
      JSON.parse(lockText).implementation_authority_addenda.map((a: { id: string }) => a.id),
    ).toEqual(["F-027-CD1"]);
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
  });

  it("the foundation document records the authority, the representation, the authority table and what is not implemented", () => {
    const doc = readFileSync("docs/pc-movement-foundation.md", "utf8");
    for (const text of [
      BRIEF_PIN,
      FROZEN_CONTRACT_PIN,
      FROZEN_CONTRACT_ID,
      "pc_movement_commitment",
      "pc_movement_request",
      "pc_voluntary_commitment",
      "role.player",
      "permission.player_choice.commit",
      "binding-time referent",
      "immutable",
      "DESTINATION_COMMITTED_RETIREMENT_PENDING",
      "one journey",
      "RC-16",
      "PF-6/F-028",
    ])
      expect(doc, text).toContain(text);
    for (const notImplemented of [
      "Generic player actions",
      "generic RC-15 routing",
      "natural-language parsing",
      "pathfinding",
      "travel-time calibration",
      "carrier / passenger generalization",
      "hazards",
      "cancellation, diversion or return",
      "multi-leg travel",
      "a second or later journey",
      "Role Registry rebinding for ordinary travel",
      "inventory or possession",
      "Event-Signal discovery",
    ])
      expect(doc, notImplemented).toContain(notImplemented);
  });

  it("the Role Registry binding and the movement request keep exactly their strict shapes", () => {
    expect(Object.keys(PlayerCharacterBindingSchema.shape).sort()).toEqual(
      [
        "active_pc",
        "binding_slot",
        "coupling",
        "intrinsic_authority_migration",
        "prior_binding",
        "replacement_binding",
        "transition",
        "writer",
      ].sort(),
    );
    expect(Object.keys(MovementServiceRequestSchema.shape).sort()).toEqual(
      ["destination", "priority_authority_ref", "request_id", "source", "subject"].sort(),
    );
  });
});

describe("IA-03 owner exclusivity: one facet and two kinds under the existing PC owner; no new owner, adapter or subsystem", () => {
  it("exactly two new SEALED kinds under the existing pc_existence owner's new facet; every other owner and facet is unchanged", () => {
    expect(
      PC_MOVEMENT_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle, k.im, k.rc]),
    ).toEqual([
      [
        "pc_movement_commitment",
        "pc_existence",
        "pc_voluntary_commitment",
        "SEALED",
        "IM-07",
        ["RC-02"],
      ],
      [
        "pc_movement_request",
        "pc_existence",
        "pc_voluntary_commitment",
        "SEALED",
        "IM-07",
        ["RC-02"],
      ],
    ]);
    expect(OWNER_PC_EXISTENCE).toBe("pc_existence");
    expect(FACET_PC_VOLUNTARY_COMMITMENT).toBe("pc_voluntary_commitment");
    expect([...CANONICAL_OWNER_REGISTRY.get("pc_existence")!].sort()).toEqual([
      "existence_contract",
      "pc_capability_profile",
      "pc_collection_mechanism",
      "pc_intrinsic_clarification",
      "pc_voluntary_commitment",
    ]);
    expect(CANONICAL_OWNER_REGISTRY.get("pc_existence")).toEqual(
      expectedOwnerFacetSet("pc_existence"),
    );
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
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "pc_existence").map((k) => k.id)).toEqual([
      "pc_existence_contract",
      "pc_capability_basis",
      "pc_capability",
      "pc_movement_commitment",
      "pc_movement_request",
      "pc_collection_commitment",
      "pc_collection_request",
      "pc_collection_mechanism",
      "pc_collection_cessation",
      "pc_collection_cycle_attestation",
      "pc_intrinsic_clarification",
      "pc_delegated_clarification",
    ]);
    // World-State, Logistics and the Role Registry gained no kind
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "world_state").map((k) => k.id)).toEqual([
      "world_profile",
      "world_locus",
      "world_corridor",
      "world_fallback_entity",
      "world_entity_transition",
      "world_actor_coupling",
      "world_pc_locus_custody",
      "world_pc_current_viewing",
      "actor_setup_placement",
      "world_setup_closure",
      "actor_physical_presence",
      "actor_raw_sensory_state",
      "world_acoustic_emission",
      "world_source_condition",
      "world_source_delivery",
      "world_scene_closure",
    ]);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "logistics").map((k) => k.id)).toEqual([
      "logistics_commitment",
      "logistics_transfer",
      "logistics_delivery",
    ]);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "role_registry").map((k) => k.id)).toEqual([
      "player_character_binding",
    ]);
  });

  it("the module set added is exactly the contract, the rule, the verifier and the subject adapter: no new owner module, class, scheduler or journal", () => {
    for (const f of MODULES) expect(existsSync(f), f).toBe(true);
    expect(readdirSync("packages/engine/src/pc-movement").sort()).toEqual([
      "derive.ts",
      "integrity.ts",
    ]);
    for (const f of MODULES) {
      expect(code(f), f).not.toMatch(/\b(?:export )?class\s+\w+/);
      expect(code(f), f).not.toMatch(
        /\bStageProvider\b|\bTemporalCoordinator\b|\bregisterObject\b/,
      );
    }
    expect(existsSync("migrations/manifests/pc-movement.json")).toBe(false);
    // the Logistics adapter gained only the explicitly source-qualified commitment (commitCorridorMovement): no cancel, no reroute, no delivery or retirement writer
    expect(adapterMethods(LogisticsAdapter)).toEqual(expectedAdapterMethods("LogisticsAdapter"));
    expect(adapterMethods(LogisticsAdapter)).toEqual([
      "commitCorridorMovement",
      "commitMovement",
      "commitment",
      "currentLocus",
      "delivery",
      "dispatch",
      "transfer",
    ]);
    expect(readdirSync("packages/engine/src/logistics").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "locus.ts",
      "provider.ts",
    ]);
  });

  it("the Temporal coordinator, the actor coupling, the PR #41 custody and the Role Registry binding contract name no movement construct: they are reused, not forked", () => {
    const files = [
      ...readdirSync("packages/engine/src/temporal").map(
        (f) => `packages/engine/src/temporal/${f}`,
      ),
      "packages/engine/src/world/actor-coupling.ts",
      "packages/engine/src/world/actor-coupling-integrity.ts",
      "packages/engine/src/world/pc-locus-custody.ts",
      "packages/engine/src/world/pc-locus-custody-integrity.ts",
      "packages/contracts/src/world-foundation.ts",
      "packages/contracts/src/actor-coupling.ts",
      "packages/contracts/src/pc-locus-custody.ts",
      "packages/contracts/src/logistics.ts",
      "packages/contracts/src/entity-transition.ts",
    ];
    for (const f of files)
      expect(code(f), f).not.toMatch(
        /pcMovement|PcMovement|pc_movement|FACET_PC_VOLUNTARY|pc_voluntary_commitment|PC_MOVEMENT/,
      );
  });

  it("the new construct is named only by its owner path, the seams that admit the PC as a moved subject, the registry, the identity check and the package index", () => {
    const named = [
      "packages/engine/src/world/canonical-campaign.ts",
      "packages/engine/src/owners/registry.ts",
      "packages/engine/src/owners/admission.ts",
      "packages/engine/src/logistics/derive.ts",
      "packages/engine/src/logistics/admission.ts",
      "packages/engine/src/logistics/provider.ts", // reads the PC-owned request as the delivery stage's one source
      "packages/engine/src/index.ts",
    ];
    for (const f of named)
      expect(code(f), f).toMatch(
        /pcMovement|PcMovement|pc_movement|FACET_PC_VOLUNTARY|pc-movement/,
      );
    // and nothing else in the engine names it
    const allowed = new Set([
      ...named,
      ...MODULES,
      "packages/engine/src/world/integrity.ts", // the violation code vocabulary
      // CPAA-C1 (v0.3 design ratified; implementation acceptance pending): the bilateral movement/collection exclusion is the one narrow, named seam (a PC with a movement
      // record is not eligible for a collection; a PC with an open occupancy may not start a movement)
      "packages/engine/src/pc-collection/state.ts",
      "packages/engine/src/pc-collection/derive.ts",
      "packages/engine/src/pc-collection/admission.ts",
      "packages/engine/src/pc-collection/integrity.ts",
    ]);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      if (allowed.has(f) || f === "packages/contracts/src/index.ts") continue;
      expect(code(f), f).not.toMatch(
        /pcMovement|PcMovement|pc_movement|FACET_PC_VOLUNTARY|PC_MOVEMENT/,
      );
    }
  });
});

describe("the slice is a foundation proof only: no route, duration, cost, hazard, cancellation, second journey, generic action or narration construct", () => {
  const modules = MODULES.map((f) => [f, code(f)] as const);

  it("no new module names a route, path, pathfinding, travel time, speed, distance, hazard, cost, carrier, passenger, cancellation, diversion, return or leg construct", () => {
    for (const [f, text] of modules)
      expect(text.toLowerCase(), f).not.toMatch(
        /pathfind|route_find|routefind|travel_time|traveltime|walking|speed|distance|hazard|obstacle|carrier|passenger|diversion|cancel|return_trip|multi.?leg|second_journey|inventory|possession|natural.?language|narrat/,
      );
  });

  it("no new module writes the Role Registry binding, the coupling or the custody, or advances any fact", () => {
    for (const [f, text] of modules) {
      expect(text, f).not.toMatch(
        /bindPlayerCharacter|handoverExistingActor|releasePlayerCharacter|coupleExistingActor|establishPcPhysicalLocusCustody|owner:\s*OWNER_ROLE_REGISTRY|role_registry/,
      );
      expect(text, f).not.toMatch(/expected_version:\s*[1-9]/);
    }
  });

  it("the rule and contract modules are pure and by identity: no clock, RNG, tick, timer, scan or persistence", () => {
    const forbidden =
      /\b(setInterval|setTimeout|Date\.now|new Date|performance\.now|Math\.random|randomUUID|randomBytes|globalTick|cadence|sweep|periodic|node:fs|writeFile|appendFile)\b/;
    for (const f of [
      "packages/contracts/src/pc-movement.ts",
      "packages/engine/src/pc-movement/derive.ts",
      "packages/engine/src/world/physical-subject.ts",
    ])
      expect(code(f), f).not.toMatch(forbidden);
    // the only full listing is the load verifier's, once per open (a diagnostic path, CAL-06)
    expect(code("packages/engine/src/pc-movement/derive.ts")).not.toMatch(/listFacts/);
    expect(code("packages/engine/src/world/physical-subject.ts")).not.toMatch(/listFacts/);
  });

  it("the delivery boundary stays an explicit input: no module derives one, and the commitment input offers no timing", () => {
    for (const [f, text] of modules) {
      expect(text, f).not.toMatch(/delivery_at|CanonicalTime|canonical_time|compareTime/);
    }
    expect(code("packages/contracts/src/pc-movement.ts")).not.toMatch(/\bdelivery\b|\bboundary\b/);
  });

  it("the Logistics side reuses its lifecycle unchanged: the commitment, dispatch, delivery and retirement derivations are the same functions", () => {
    const derive = code("packages/engine/src/logistics/derive.ts");
    for (const reused of [
      "deriveCommitment",
      "deriveTransfer",
      "deriveDelivery",
      "deriveRetirement",
    ])
      expect(derive, reused).toContain(`export function ${reused}`);
    expect(code("packages/engine/src/logistics/derive.ts")).not.toMatch(/PcMovementCommitment/);
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL, and every status is NOT_IMPLEMENTED or BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
  });

  it("every partial-evidence test file exists", () => {
    for (const row of register)
      for (const t of row.partial_evidence?.tests ?? []) expect(existsSync(t), t).toBe(true);
  });

  it("every open gate stays at its recorded status; PF-6/F-028, provider, deployment and migration stay inactive", () => {
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    expect(statusOf("CAL-01")).toBe("UNCALIBRATED");
    expect(statusOf("OB-016")).toBe("OPEN_CODE_ERA_CONFORMANCE");
  });
});
