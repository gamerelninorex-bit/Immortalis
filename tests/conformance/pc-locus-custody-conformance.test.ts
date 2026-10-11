// Conformance evidence for the Active-PC Post-Handover Physical Locus Custody Foundation (thirty-ninth bounded slice). Each block
// names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED and no source
// pin, Runtime Contract snapshot, open gate or acceptance status changed. The Sovereign-ratified and frozen Active-PC Post-Handover
// Physical Locus Ownership & Relocation Contract (frozen pin 2026-10-08T01:25:36.611Z) supplies the ownership rule and is NOT a lock
// pin: it is cited, never added to the lock. PF-6/F-028 stays BLOCKED / NOT ACTIVATED.
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
  WORLD_PC_LOCUS_CUSTODY_RULE,
  factKind,
} from "@immortalis/engine";
import {
  ExistenceContractSchema,
  ExistingActorCouplingSchema,
  PcPhysicalLocusCustodySchema,
  PlayerCharacterBindingSchema,
} from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import { expectedKindIds, expectedOwnerFacetSet } from "../support/expected-surface.ts";

const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!;
const MODULES = [
  "packages/contracts/src/pc-locus-custody.ts",
  "packages/engine/src/world/pc-locus-custody.ts",
  "packages/engine/src/world/pc-locus-custody-integrity.ts",
];
const FROZEN_CONTRACT_ID = "3f320af901e08166ad96ca0fc5e5069d";
const FROZEN_CONTRACT_PIN = "2026-10-08T01:25:36.611Z";

describe("IA-01 source/version fidelity: the composed authority lineage is cited at the exact pins; no pin moved", () => {
  it("the spec-locked pins this slice reconciles are the exact pins observed at the base", () => {
    expect(pin("WG").native_pin).toBe("2026-09-25T13:44:22.668Z");
    expect(pin("WS-006").native_pin).toBe("2026-09-25T00:18:36.828Z");
    expect(pin("IR").native_pin).toBe("2026-09-25T00:17:26.287Z");
    expect(pin("I-002").native_pin).toBe("2026-09-25T00:15:54.536Z");
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

  it("the custody's governing rule is the World-State fallback custody clause of WG at its exact lock pin, with the frozen contract in its lineage as NOT a lock pin", () => {
    const rule = factKind("world_pc_locus_custody").rule;
    expect(rule).toEqual(WORLD_PC_LOCUS_CUSTODY_RULE);
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
      FROZEN_CONTRACT_ID,
      FROZEN_CONTRACT_PIN,
      "binding-time referent",
      "immutable provenance",
      "NOT a spec-lock pin",
      "2026-09-29T00:33:04.009Z", // Runtime Contract & Translation tranche
    ])
      expect(lineage, cited).toContain(cited);
  });

  it("it is a rule of its own: the fallback entity, transition and coupling citations are untouched", () => {
    expect(WORLD_PC_LOCUS_CUSTODY_RULE).not.toEqual(WORLD_FALLBACK_RULE);
    expect(WORLD_PC_LOCUS_CUSTODY_RULE).not.toEqual(WORLD_ENTITY_TRANSITION_RULE);
    expect(WORLD_PC_LOCUS_CUSTODY_RULE).not.toEqual(WORLD_ACTOR_COUPLING_RULE);
    expect(factKind("world_fallback_entity").rule).toEqual(WORLD_FALLBACK_RULE);
    expect(factKind("world_entity_transition").rule).toEqual(WORLD_ENTITY_TRANSITION_RULE);
    expect(factKind("world_actor_coupling").rule).toEqual(WORLD_ACTOR_COUPLING_RULE);
    expect(WORLD_ACTOR_COUPLING_RULE.authority_lineage.join("\n")).not.toContain(
      FROZEN_CONTRACT_ID,
    );
  });

  it("the frozen contract is not a lock pin: the lock, Runtime Contract and open-gate snapshots are untouched", () => {
    const lockText = readFileSync("spec/f027/spec-lock.json", "utf8");
    for (const frozen of [FROZEN_CONTRACT_ID, FROZEN_CONTRACT_PIN, "2026-10-08T01:30:19.780Z"])
      expect(lockText, frozen).not.toContain(frozen);
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

  it("the foundation document records the authority, the representation and what is not implemented", () => {
    const doc = readFileSync("docs/pc-locus-custody-foundation.md", "utf8");
    for (const text of [
      FROZEN_CONTRACT_PIN,
      "2026-10-08T01:30:19.780Z",
      FROZEN_CONTRACT_ID,
      "2026-09-25T13:44:22.668Z", // WG
      "world_pc_locus_custody",
      "binding-time referent",
      "immutable handover provenance",
      "exactly one authority",
      "RC-02",
      "PF-6/F-028",
    ])
      expect(doc, text).toContain(text);
    for (const notImplemented of [
      "Voluntary PC movement",
      "Movement Service Request",
      "Logistics subject admission",
      "dispatch",
      "in-transfer custody",
      "destination commit",
      "ECT-01 movement transition",
      "relocation mutation",
      "Role Registry change",
      "generic entity or location ledger",
      "route finding",
      "natural-language parsing",
    ])
      expect(doc, notImplemented).toContain(notImplemented);
  });

  it("the Existence Contract, the Role Registry binding and the coupling keep exactly their previous strict shape", () => {
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
    expect(Object.keys(ExistingActorCouplingSchema.shape ?? {}).sort()).toEqual(
      ["actor_id", "actor_state", "coupling", "custodian", "pinned_versions"].sort(),
    );
  });

  it("the custody value has exactly four fields: identity, stationary locus, basis, custodian", () => {
    expect(Object.keys(PcPhysicalLocusCustodySchema.shape).sort()).toEqual(
      ["basis", "custodian", "pc_id", "stationary_locus"].sort(),
    );
  });
});

describe("IA-03 owner exclusivity: the World-State custodian gained one fact kind, and nothing else was added", () => {
  it("one new kind under the existing World-State owner and the existing fallback facet: no new owner, facet or adapter", () => {
    const kind = factKind("world_pc_locus_custody");
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
      "world_fallback_entity",
      "world_entity_transition",
      "world_actor_coupling",
      "world_pc_locus_custody",
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
    expect([...CANONICAL_OWNER_REGISTRY.get("role_registry")!]).toEqual([
      "player_character_binding",
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.get("logistics")!]).toEqual(["logistics_state"]);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "logistics").map((k) => k.id)).toEqual([
      "logistics_commitment",
      "logistics_transfer",
      "logistics_delivery",
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.keys()].sort()).toEqual(
      [...new Set(ALL_FACT_KINDS.map((k) => k.owner))].sort(),
    );
  });

  it("the module set added is exactly the custody's contract, rule and verifier: no adapter, class, scheduler, journal or directory", () => {
    for (const f of MODULES) expect(existsSync(f), f).toBe(true);
    expect(readdirSync("packages/engine/src/world").sort()).toEqual([
      "actor-coupling-integrity.ts",
      "actor-coupling.ts",
      "canonical-campaign.ts",
      "entity-transition-integrity.ts",
      "entity-transition-provider.ts",
      "entity-transition.ts",
      "fallback-custody.ts",
      "integrity.ts",
      "pc-locus-custody-integrity.ts",
      "pc-locus-custody.ts",
      "physical-subject.ts",
      "source-condition.ts",
    ]);
    for (const f of MODULES) {
      expect(code(f), f).not.toMatch(/\b(?:export )?class\s+\w+/);
      expect(code(f), f).not.toMatch(
        /\bStageProvider\b|\bTemporalCoordinator\b|\bregisterObject\b/,
      );
    }
    expect(existsSync("migrations/manifests/pc-locus-custody.json")).toBe(false);
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
});

describe("the custody is stationary only: no movement, request, Logistics, Temporal, ECT-01, binding or relocation construct", () => {
  const modules = MODULES.map((f) => [f, code(f)] as const);

  it("no custody module names a movement request, commitment, dispatch, delivery, transfer lifecycle, Temporal object or ECT-01 transition construct", () => {
    for (const [f, text] of modules)
      expect(text, f).not.toMatch(
        /MovementServiceRequest|LogisticsAdapter|commitMovement|\.dispatch\(|CommitMovementInput|DispatchMovementInput|logisticsDeliveryStage|logisticsRetirementStage|logisticsTemporalObject|logisticsObjectId|logisticsBoundaryId|TemporalObject|temporalObjectKey|deriveEntityTransition|EntityTransitionCause|EntityTransitionClose|worldTransitionGroupCheck|entityTransitionStage|LOGISTICS_OPERATION|READ_MODE_NOW/,
      );
  });

  it("the only Logistics and ECT-01 names are read-only slot keys of the rival-authority guard", () => {
    for (const [f, text] of modules) {
      const names = [
        ...text.matchAll(/\b(?:logistics|worldEntityTransition|worldFallbackEntity)\w*Key\b/g),
      ].map((m) => m[0]);
      expect([...new Set(names)].sort(), f).toEqual(
        f.endsWith("engine/src/world/pc-locus-custody.ts")
          ? [
              "logisticsCommitmentKey",
              "logisticsTransferKey",
              "worldEntityTransitionKey",
              "worldFallbackEntityKey",
            ].sort()
          : [],
      );
    }
  });

  // The ORIGINAL first-activation branch (BLUE v5.1) is the one place the binding's coupling is read: as the locus the two cited, engine-
  // validated referee decisions qualify, never on its own. The two functions that do so are set aside here and judged by their own block below;
  // every other line of every custody module (the whole predecessor handover branch included) keeps the original, unchanged guard.
  const ORIGINAL_BRANCH = ["activationCustodyViolation", "deriveOriginalPcPhysicalLocusCustody"];
  const withoutOriginalBranch = (text: string): string => {
    let out = text;
    for (const fn of ORIGINAL_BRANCH) {
      const start = out.indexOf(`function ${fn}(`);
      if (start < 0) continue;
      const end = out.indexOf("\n}\n", start);
      out = out.slice(0, start) + out.slice(end + 3);
    }
    return out;
  };

  it("the binding's coupling is read for a placement only inside the two original-activation functions, which cite both qualifying decisions", () => {
    const text = code("packages/engine/src/world/pc-locus-custody.ts");
    for (const fn of ORIGINAL_BRANCH) expect(text).toContain(`function ${fn}(`);
    expect(withoutOriginalBranch(text)).not.toMatch(
      /binding\.data\.coupling|binding\.coupling|\.value\.coupling\.locus|\bb\.coupling/,
    );
    const branch = text.slice(text.indexOf("function activationCustodyViolation("));
    expect(branch).toMatch(/nativeQualificationViolation/);
    expect(branch).toMatch(/physicalQualificationViolation/);
  });

  it("no custody module writes, rewrites or reads the Role Registry binding's referent as a placement: the binding is read for identity and handover only", () => {
    for (const [f, rawText] of modules) {
      const text = f.endsWith("engine/src/world/pc-locus-custody.ts")
        ? withoutOriginalBranch(rawText)
        : rawText;
      expect(text, f).not.toMatch(
        /bindPlayerCharacter|handoverExistingActor|releasePlayerCharacter|coupleExistingActor|InsertionFact|CouplingBasis|NATIVE_ALREADY_THERE|ExistenceContractSchema\.parse/,
      );
      expect(text, f).not.toMatch(
        /binding\.data\.coupling|binding\.coupling|\.value\.coupling\.locus/,
      );
      expect(text, f).not.toMatch(/owner:\s*OWNER_ROLE_REGISTRY|role_registry/);
    }
  });

  it("no custody module writes or mutates the consumed coupling, or declares a relocation, successor or movement construct", () => {
    for (const [f, text] of modules) {
      expect(text, f).not.toMatch(/expected_version:\s*[1-9]/);
      expect(text.toLowerCase(), f).not.toMatch(
        /relocat|successor|\bmove\b|movement_request|voluntary|player_choice|natural.?language|pathfind|route_find|travel_time|passenger|carrier|diversion|cancel/,
      );
    }
  });

  it("no capability, carry-forward, Causal Draw, entropy or exposure construct was added", () => {
    for (const [f, text] of modules)
      expect(text.toLowerCase(), f).not.toMatch(
        /carry[-_ ]?forward|unresolved_capability|world[-_ ]prior|pc_to_non_pc|succession|fork_branch|intrinsic_amendment|broadcast_exposure|exposure_event|causaldraw|entropy/,
      );
  });

  it("the rule and the owner path are pure and by identity: no clock, RNG, tick, timer or persistence in the rule or contract module", () => {
    const forbidden =
      /\b(setInterval|setTimeout|Date\.now|new Date|performance\.now|Math\.random|randomUUID|randomBytes|globalTick|cadence|sweep|periodic|listFacts|node:fs|writeFile|appendFile)\b/;
    expect(code("packages/engine/src/world/pc-locus-custody.ts")).not.toMatch(forbidden);
    expect(code("packages/contracts/src/pc-locus-custody.ts")).not.toMatch(forbidden);
  });

  it("the predecessor Logistics, Temporal, Production, Economy, ECT-01, coupling and Role Registry-owner modules name no custody construct", () => {
    const files = [
      ...["logistics", "temporal", "production", "economy"].flatMap((d) =>
        readdirSync(`packages/engine/src/${d}`).map((f) => `packages/engine/src/${d}/${f}`),
      ),
      "packages/engine/src/world/entity-transition.ts",
      "packages/engine/src/world/entity-transition-integrity.ts",
      "packages/engine/src/world/entity-transition-provider.ts",
      "packages/engine/src/world/actor-coupling.ts",
      "packages/engine/src/world/actor-coupling-integrity.ts",
      "packages/contracts/src/logistics.ts",
      "packages/contracts/src/entity-transition.ts",
      "packages/contracts/src/actor-coupling.ts",
    ];
    // The fortieth slice (Active-PC Voluntary Movement) intentionally consumes the custody record through exactly three narrow
    // seams, each admitting it as the moved physical subject of the EXISTING Logistics / ECT-01 machinery: the Logistics
    // derivations (the key of the subject and the PC-owned request rule) and the ECT-01 transition derivation and provider (the
    // subject's record). Every other predecessor module still names no custody construct.
    const FORTIETH_SLICE_SEAMS = [
      "packages/engine/src/logistics/derive.ts",
      "packages/engine/src/world/entity-transition.ts",
      "packages/engine/src/world/entity-transition-provider.ts",
    ];
    for (const f of files.filter((x) => !FORTIETH_SLICE_SEAMS.includes(x)))
      expect(code(f), f).not.toMatch(
        /PcPhysicalLocusCustody|pcPhysicalLocusCustody|world_pc_locus_custody|worldPcLocusCustody|pc-locus-custody/,
      );
  });

  it("the owner path is the one World-State publication: only the canonical campaign, the custodian's group check, the registry, the identity check and the package index name it", () => {
    const named = [
      "packages/engine/src/world/canonical-campaign.ts",
      "packages/engine/src/world/fallback-custody.ts",
      "packages/engine/src/owners/registry.ts",
      "packages/engine/src/owners/admission.ts",
      "packages/engine/src/index.ts",
    ];
    for (const f of named)
      expect(code(f), f).toMatch(/PcPhysicalLocusCustody|world_pc_locus_custody|pc-locus-custody/);
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
