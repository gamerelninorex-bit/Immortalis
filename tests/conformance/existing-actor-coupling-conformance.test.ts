// Conformance evidence for the Existing-Actor World-State Coupling Anchor Foundation (thirtieth bounded slice). Each block names
// its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED and no source pin,
// Runtime Contract snapshot, open gate or acceptance status changed. The sovereign-ratified PC-CONTROL HANDOVER CONTRACT v1
// (W3-CP3 Blue Repair Overlay) supplies the seam rule and is NOT a lock pin: it is cited, never added to the lock.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  I002_SOURCE,
  IR_SOURCE,
  WG_SOURCE,
  WS006_SOURCE,
  WORLD_ACTOR_COUPLING_RULE,
  WORLD_ENTITY_TRANSITION_RULE,
  WORLD_FALLBACK_RULE,
  factKind,
} from "@immortalis/engine";
import {
  ExistenceContractSchema,
  ExistingActorCouplingSchema,
  PlayerCharacterBindingSchema,
} from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import { expectedKindIds, expectedOwnerFacetSet } from "../support/expected-surface.ts";

const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!;
const COUPLING_MODULES = [
  "packages/contracts/src/actor-coupling.ts",
  "packages/engine/src/world/actor-coupling.ts",
  "packages/engine/src/world/actor-coupling-integrity.ts",
];

describe("IA-01 source/version fidelity: the composed authority lineage is cited at the exact pins; no pin moved", () => {
  it("the spec-locked pins this slice reconciles are the exact pins observed at the base", () => {
    expect(pin("WG").native_pin).toBe("2026-09-25T13:44:22.668Z");
    expect(pin("WS-006").native_pin).toBe("2026-09-25T00:18:36.828Z");
    expect(pin("IR").native_pin).toBe("2026-09-25T00:17:26.287Z");
    expect(pin("I-002").native_pin).toBe("2026-09-25T00:15:54.536Z");
    expect(pin("WS-016").native_pin).toBe("2026-09-24T17:38:59.210Z");
    expect(WG_SOURCE).toEqual({ artifact: pin("WG").url, native_pin: pin("WG").native_pin });
    expect(WS006_SOURCE).toEqual({
      artifact: pin("WS-006").url,
      native_pin: pin("WS-006").native_pin,
    });
    expect(IR_SOURCE).toEqual({ artifact: pin("IR").url, native_pin: pin("IR").native_pin });
    expect(I002_SOURCE).toEqual({
      artifact: pin("I-002").url,
      native_pin: pin("I-002").native_pin,
    });
  });

  it("the coupling's governing rule is the World-State fallback custody clause of WG at its exact lock pin, with the reconciled lineage", () => {
    const rule = factKind("world_actor_coupling").rule;
    expect(rule).toEqual(WORLD_ACTOR_COUPLING_RULE);
    expect(rule.artifact).toBe(pin("WG").url);
    expect(rule.native_pin).toBe(pin("WG").native_pin);
    expect(rule.effective_basis).toBe("pinned-by-spec-lock");
    expect(rule.supersedes).toBeNull();
    expect(rule.clause).toContain("F-016 Ratified Fallback Objective Physical-Entity Custody");
    expect(rule.clause).toContain("not owned by a more specific subsystem");
    const lineage = rule.authority_lineage.join("\n");
    for (const cited of [
      pin("WS-006").native_pin,
      pin("IR").native_pin,
      pin("I-002").native_pin,
      "Two-Target Write Rule",
      "2026-09-25T00:16:16.544Z", // PC-Control Handover Contract v1: observed pin, seam rule only
      "NOT a spec-lock pin",
      "2026-09-29T00:33:04.009Z", // Runtime Contract & Translation tranche
    ])
      expect(lineage, cited).toContain(cited);
  });

  it("it is a rule of its own: the fallback entity, transition and existence-contract citations are untouched", () => {
    expect(WORLD_ACTOR_COUPLING_RULE).not.toEqual(WORLD_FALLBACK_RULE);
    expect(WORLD_ACTOR_COUPLING_RULE).not.toEqual(WORLD_ENTITY_TRANSITION_RULE);
    expect(factKind("world_fallback_entity").rule).toEqual(WORLD_FALLBACK_RULE);
    expect(factKind("world_entity_transition").rule).toEqual(WORLD_ENTITY_TRANSITION_RULE);
    const contractLineage = factKind("pc_existence_contract").rule.authority_lineage.join("\n");
    for (const overlay of ["3e520af901e081c0b84cc5cb7f301a0e", "3e320af901e0817e92fdcc07d79fee69"])
      expect(contractLineage).not.toContain(overlay);
  });

  it("the overlay is not a lock pin: the lock, Runtime Contract and open-gate snapshots are untouched", () => {
    const lockText = readFileSync("spec/f027/spec-lock.json", "utf8");
    for (const overlay of [
      "3e520af901e081c0b84cc5cb7f301a0e",
      "3e320af901e0817e92fdcc07d79fee69",
      "2026-09-25T00:16:16.544Z",
      "2026-09-25T00:15:58.558Z",
    ])
      expect(lockText, overlay).not.toContain(overlay);
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

  it("the foundation document records the exact reconciliation, the representation and what is not implemented", () => {
    const doc = readFileSync("docs/existing-actor-coupling-foundation.md", "utf8");
    for (const text of [
      "2026-09-25T13:44:22.668Z", // WG
      "2026-09-25T00:18:36.828Z", // WS-006 / F-014A
      "2026-09-25T00:17:26.287Z", // IR
      "2026-09-25T00:15:54.536Z", // I-002
      "2026-09-24T17:38:59.210Z", // WS-016
      "2026-09-25T00:16:16.544Z", // PC-Control Handover Contract v1
      "2026-09-25T00:15:58.558Z", // I-002 v2.4
      "world_actor_coupling",
      "RC-02",
      "Single Commit Point",
    ])
      expect(doc, text).toContain(text);
    for (const notImplemented of [
      "Existing-Actor → PC Role Registry handover",
      "carry-forward",
      "UNRESOLVED",
      "Causal Draw",
      "PC release",
      "Intrinsic Amendment",
      "BROADCAST_EXPOSURE",
      "relocat",
    ])
      expect(doc, notImplemented).toContain(notImplemented);
  });
});

describe("IA-03 owner exclusivity: the World-State custodian gained one fact kind, and nothing else was added", () => {
  it("one new kind under the existing World-State owner and the existing fallback facet: no new owner, facet or adapter", () => {
    const kind = factKind("world_actor_coupling");
    expect([kind.owner, kind.facet, kind.lifecycle, kind.im, kind.rc]).toEqual([
      "world_state",
      "world_fallback_physical_entity",
      "SEALED",
      "IM-03",
      ["RC-02"],
    ]);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "world_state").map((k) => k.id)).toEqual([
      "world_profile",
      "world_locus",
      "world_corridor",
      "world_fallback_entity",
      "world_entity_transition",
      "world_actor_coupling",
      "world_pc_locus_custody",
      "actor_setup_placement",
      "world_setup_closure",
      "actor_physical_presence",
      "actor_raw_sensory_state",
      "world_acoustic_emission",
      "world_source_condition",
      "world_source_delivery",
    ]);
    expect([...expectedKindIds({ owner: "world_state" })].sort()).toEqual(
      ALL_FACT_KINDS.filter((k) => k.owner === "world_state")
        .map((k) => k.id)
        .sort(),
    );
    expect(CANONICAL_OWNER_REGISTRY.get("world_state")).toEqual(
      expectedOwnerFacetSet("world_state"),
    );
    expect([...CANONICAL_OWNER_REGISTRY.get("world_state")!].sort()).toEqual([
      "world_fallback_physical_entity",
      "world_locus",
      "world_profile",
      "world_source_condition",
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.keys()].sort()).toEqual(
      [...new Set(ALL_FACT_KINDS.map((k) => k.owner))].sort(),
    );
  });

  it("the module set added is exactly the coupling's contract, rule and verifier: no adapter, class, scheduler, journal or directory", () => {
    for (const f of COUPLING_MODULES) expect(existsSync(f), f).toBe(true);
    expect(readdirSync("packages/engine/src/world").sort()).toEqual([
      "actor-coupling-integrity.ts",
      "actor-coupling.ts",
      "actor-presence-integrity.ts",
      "actor-presence.ts",
      "auditory-premises-evaluator.ts",
      "auditory-premises-integrity.ts",
      "auditory-premises.ts",
      "canonical-campaign.ts",
      "corridor.ts",
      "entity-transition-integrity.ts",
      "entity-transition-provider.ts",
      "entity-transition.ts",
      "fallback-custody.ts",
      "integrity.ts",
      "pc-locus-custody-integrity.ts",
      "pc-locus-custody.ts",
      "physical-subject.ts",
      "setup-eligibility.ts",
      "source-condition.ts",
    ]);
    for (const f of COUPLING_MODULES) {
      expect(code(f), f).not.toMatch(/\b(?:export )?class\s+\w+/);
      expect(code(f), f).not.toMatch(
        /\bStageProvider\b|\bTemporalCoordinator\b|\bregisterObject\b/,
      );
    }
    expect(existsSync("migrations/manifests/existing-actor-coupling.json")).toBe(false);
  });

  it("the Existence Contract and the Role Registry binding keep exactly their previous strict shape", () => {
    expect(Object.keys(ExistenceContractSchema.shape).sort()).toEqual(
      [
        "baseline_exception",
        "contact",
        "continuity_rule",
        "embodiment_topology",
        "entry_envelope",
        "existing_actor_compilation",
        "identity_agency",
        "pc_id",
        "release",
      ].sort(),
    );
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
    const shape = PlayerCharacterBindingSchema.shape;
    expect(shape.prior_binding.safeParse({}).success).toBe(false);
    for (const type of ["HANDOVER", "DEACTIVATION", "TRANSFER", "REACTIVATION", "EXISTING_ACTOR"])
      expect(shape.transition.safeParse({ type, basis: {} }).success, type).toBe(false);
  });

  it("the coupling's strict value has exactly the five fields: actor, pinned actor state, references, pinned versions, custodian", () => {
    expect(Object.keys(ExistingActorCouplingSchema.shape ?? {}).sort()).toEqual(
      ["actor_id", "actor_state", "coupling", "custodian", "pinned_versions"].sort(),
    );
  });
});

describe("the coupling is a prerequisite only: no binding, ACTIVATION, insertion, capability, handover or Production-durable construct", () => {
  const modules = COUPLING_MODULES.map((f) => [f, code(f)] as const);

  it("no coupling module writes or names the Role Registry binding, the first ACTIVATION, an insertion basis or a PC release", () => {
    for (const [f, text] of modules)
      expect(text, f).not.toMatch(
        /PLAYER_CHARACTER_BINDING_KEY|PlayerCharacterBinding|bindPlayerCharacter|releasePlayerCharacter|ACTIVATION|InsertionFact|CouplingBasis|NATIVE_ALREADY_THERE|role\.player_character|PLAYER-AUTHORED|ExistenceContractSchema/,
      );
  });

  it("no coupling module moves, copies or carries a capability, or classifies a binding mode", () => {
    for (const [f, text] of modules) {
      expect(text, f).not.toMatch(
        /actorCapabilityKey|pcCapability|PcCapability|capabilityBasis|NamedActorCapability|\.marker\b|deriveCapability/,
      );
      expect(text, f).not.toMatch(
        /\bDEFERRED\b|ACTIVE-LIMITED|binding_mode|bindingMode|readiness_condition/,
      );
    }
  });

  it("no coupling module uses the Production durable path: no completion envelope, acceptance stage, entity schema or stage provider", () => {
    for (const [f, text] of modules)
      expect(text, f).not.toMatch(
        /DurableCompletion|FallbackPhysicalEntity|worldFallbackEntityKey|deriveAcceptedEntity|productionCompletionKey|worldAcceptanceStage|stageAuthorityViolation|journaledStageViolation|worldTransitionGroupCheck|worldEntityTransitionKey/,
      );
  });

  it("no carry-forward, unresolved-capability, world-prior, release, succession, fork, Intrinsic Amendment or exposure construct was added", () => {
    for (const [f, text] of modules)
      expect(text.toLowerCase(), f).not.toMatch(
        /carry[-_ ]?forward|unresolved_capability|world[-_ ]prior|pc_to_non_pc|handover_commit|succession|fork_branch|intrinsic_amendment|broadcast_exposure|exposure_event|causaldraw|entropy/,
      );
  });

  it("the rule and the owner path are pure and by identity: no clock, RNG, tick, timer, scan or persistence in the rule module", () => {
    const forbidden =
      /\b(setInterval|setTimeout|Date\.now|new Date|performance\.now|Math\.random|randomUUID|randomBytes|globalTick|cadence|sweep|periodic|listFacts|node:fs|writeFile|appendFile)\b/;
    expect(code("packages/engine/src/world/actor-coupling.ts")).not.toMatch(forbidden);
    expect(code("packages/contracts/src/actor-coupling.ts")).not.toMatch(forbidden);
  });

  it("the existing Named-Actor boundary is consulted, never altered: the coupling does not close the Named-Actor owner and has no writer for it", () => {
    const rule = code("packages/engine/src/world/actor-coupling.ts");
    expect(rule).toContain("actorBoundaryViolation");
    expect(code("packages/engine/src/world/actor-coupling-integrity.ts")).not.toMatch(
      /OWNER_NAMED_ACTOR|named_actor/,
    );
    // the boundary's own source names no coupling: the closure of the Named-Actor owner is not touched by this slice
    expect(code("packages/engine/src/actor/derive.ts")).not.toMatch(
      /worldActorCoupling|actor-coupling/,
    );
  });

  it("the fresh-PC activation path and the Production durable/entity path name no coupling", () => {
    for (const f of [
      "packages/engine/src/production/admission.ts",
      "packages/engine/src/production/derive.ts",
      "packages/engine/src/production/adapter.ts",
      "packages/engine/src/world/entity-transition.ts",
      "packages/engine/src/pc-capability/derive.ts",
    ])
      expect(code(f), f).not.toMatch(/worldActorCoupling|ExistingActorCoupling|actor-coupling/);
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
