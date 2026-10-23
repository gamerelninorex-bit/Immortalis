// Conformance evidence for the Existing-Actor → PC Role Registry Handover Cutover Foundation (thirty-first bounded slice). Each block
// names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED and no source
// pin, Runtime Contract snapshot, open gate or acceptance status changed. The sovereign-ratified PC-CONTROL HANDOVER CONTRACT v1
// (W3-CP3 Blue Repair Overlay) supplies the seam rule and is NOT a lock pin: it is cited, never added to the lock.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_FACT_KINDS, CANONICAL_OWNER_REGISTRY, IR_SOURCE, factKind } from "@immortalis/engine";
import { ExistenceContractSchema, PlayerCharacterBindingSchema } from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import { expectedKindIds } from "../support/expected-surface.ts";

const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!;

describe("IA-01 source/version fidelity: the composed authority lineage is cited at the exact pins; no pin moved", () => {
  it("the spec-locked pins this slice reconciles are the exact pins observed at the base", () => {
    expect(pin("IR").native_pin).toBe("2026-09-25T00:17:26.287Z");
    expect(pin("I-002").native_pin).toBe("2026-09-25T00:15:54.536Z");
    expect(pin("WS-006").native_pin).toBe("2026-09-25T00:18:36.828Z");
    expect(pin("WG").native_pin).toBe("2026-09-25T13:44:22.668Z");
    expect(pin("WS-016").native_pin).toBe("2026-09-24T17:38:59.210Z");
    expect(IR_SOURCE).toEqual({ artifact: pin("IR").url, native_pin: pin("IR").native_pin });
  });

  it("the binding's registration is byte-identical: same IR rule at its lock pin, so no existing save's provenance changes", () => {
    const kind = factKind("player_character_binding");
    expect([kind.owner, kind.facet, kind.lifecycle, kind.im, kind.rc]).toEqual([
      "role_registry",
      "player_character_binding",
      "SEALED",
      "IM-07",
      ["RC-02", "RC-13"],
    ]);
    expect(kind.legacyRule).toBeUndefined();
    expect(kind.rule.artifact).toBe(pin("IR").url);
    expect(kind.rule.native_pin).toBe(pin("IR").native_pin);
    expect(kind.rule.effective_basis).toBe("pinned-by-spec-lock");
    expect(kind.rule.supersedes).toBeNull();
    expect(kind.rule.clause).toBe(
      "§2 Ownership Contract; §3 input 3 and §5 Precedence for Insertion Facts (explicit player-authored fact); §6 Step 3 — native/already-there (no bridge invented) and Step 6 — Commit the binding; §17 Persistence / Write-Back; PC-Control Handover Contract — Single Commit Point",
    );
    // the overlay is cited in docs and comments, never stamped into provenance
    const lineage = kind.rule.authority_lineage.join("\n");
    for (const overlay of ["3e520af901e081c0b84cc5cb7f301a0e", "2026-09-25T00:16:16.544Z"])
      expect(lineage).not.toContain(overlay);
  });

  it("the overlays are not lock pins: the lock, Runtime Contract and open-gate snapshots are untouched", () => {
    const lockText = readFileSync("spec/f027/spec-lock.json", "utf8");
    for (const overlay of [
      "3e520af901e081c0b84cc5cb7f301a0e",
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

  it("the foundation document records the reconciliation, the representation and what is not implemented", () => {
    const doc = readFileSync("docs/existing-actor-handover-foundation.md", "utf8");
    for (const text of [
      "2026-09-25T00:15:54.536Z", // I-002
      "2026-09-25T00:15:58.558Z", // I-002 v2.4
      "2026-09-24T17:38:59.210Z", // WS-016
      "2026-09-25T00:18:36.828Z", // WS-006 / F-014A
      "2026-09-25T00:17:26.287Z", // IR
      "2026-09-25T00:16:16.544Z", // PC-Control Handover Contract v1
      "2026-09-25T13:44:22.668Z", // WG
      "2026-09-25T08:21:22.816Z", // Role Registry
      "EXISTING_ACTOR_HANDOVER",
      "Single Commit Point",
      "RC-02",
      "RC-13",
      "RC-16",
    ])
      expect(doc, text).toContain(text);
    for (const notImplemented of [
      "carry-forward",
      "UNRESOLVED",
      "Causal Draw",
      "PC → non-PC",
      "succession",
      "deferred activation",
      "Intrinsic Amendment",
      "BROADCAST_EXPOSURE",
      "relocation",
    ])
      expect(doc, notImplemented).toContain(notImplemented);
  });
});

describe("IA-03 owner exclusivity: no new owner, facet, fact kind, key space, adapter or module", () => {
  it("the registry is exactly the thirtieth slice's: the handover is a second transition of the one existing binding kind", () => {
    expect([...ALL_FACT_KINDS.map((k) => k.id)].sort()).toEqual([...expectedKindIds({})].sort());
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "role_registry").map((k) => k.id)).toEqual([
      "player_character_binding",
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.get("role_registry")!]).toEqual([
      "player_character_binding",
    ]);
    expect(existsSync("migrations/manifests/existing-actor-handover.json")).toBe(false);
  });

  it("the engine's world/ module set is unchanged: no new module, class, scheduler, journal or directory was added", () => {
    expect(readdirSync("packages/engine/src/world").sort()).toEqual([
      "actor-coupling-integrity.ts",
      "actor-coupling.ts",
      "actor-presence-integrity.ts",
      "actor-presence.ts",
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
  });

  it("the Existence Contract keeps exactly its previous strict shape; the binding gains no field, only a second transition", () => {
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
  });

  it("the Named-Actor boundary is not altered: it names no coupling or handover, and is the cutover by consulting the committed binding", () => {
    const boundary = code("packages/engine/src/actor/derive.ts");
    expect(boundary).not.toMatch(/worldActorCoupling|actor-coupling|EXISTING_ACTOR_HANDOVER/);
    expect(boundary).toContain("PLAYER_CHARACTER_BINDING_KEY");
  });

  it("the coupling modules still name no binding: the reconciliation is canonical integrity's statement, not the coupling's", () => {
    for (const f of [
      "packages/contracts/src/actor-coupling.ts",
      "packages/engine/src/world/actor-coupling.ts",
      "packages/engine/src/world/actor-coupling-integrity.ts",
    ])
      expect(code(f), f).not.toMatch(
        /PLAYER_CHARACTER_BINDING_KEY|PlayerCharacterBinding|EXISTING_ACTOR_HANDOVER|ACTIVATION/,
      );
    expect(code("packages/engine/src/world/integrity.ts")).toContain(
      "existingActorHandoverViolation",
    );
  });
});

describe("the handover moves no capability and invents no mode", () => {
  const handoverCode = [
    code("packages/engine/src/owners/admission.ts"),
    code("packages/engine/src/world/canonical-campaign.ts"),
  ].join("\n");
  const region = (text: string, from: RegExp, to: RegExp) => {
    const a = text.search(from);
    const rest = text.slice(a);
    return rest.slice(0, Math.max(rest.search(to), 0) || rest.length);
  };
  const rule = region(
    code("packages/engine/src/owners/admission.ts"),
    /export function expectedHandoverMigration/,
    /export function coupledActorFreshContractViolation/,
  );
  const method = region(
    code("packages/engine/src/world/canonical-campaign.ts"),
    /handoverExistingActor\(/,
    /coupleExistingActor\(/,
  );

  it("the handover rule and publication path name no capability construct, Causal Draw, world prior or binding mode", () => {
    for (const text of [rule, method]) {
      expect(text).not.toMatch(
        /actorCapabilityKey|pcCapability|PcCapability|capabilityBasis|NamedActorCapability|\.marker\b|deriveCapability|causalDraw|CausalDraw|entropy|world[-_ ]prior/i,
      );
      expect(text).not.toMatch(
        /\bDEFERRED\b|ACTIVE-LIMITED|binding_mode|bindingMode|readiness_condition/,
      );
      expect(text).not.toMatch(
        /carry[-_ ]?forward|unresolved_capability|succession|fork_branch|intrinsic_amendment|broadcast_exposure|pc_to_non_pc/i,
      );
    }
    expect(handoverCode).toContain("EXISTING_ACTOR_HANDOVER");
  });

  it("the rule is pure and by identity: no clock, RNG, tick, timer, scan or persistence in it", () => {
    expect(rule).not.toMatch(
      /\b(setInterval|setTimeout|Date\.now|new Date|performance\.now|Math\.random|randomUUID|randomBytes|globalTick|cadence|sweep|periodic|listFacts|node:fs|writeFile|appendFile)\b/,
    );
  });

  it("the PC capability receipt and the ordinary activation path still refuse the compilation", () => {
    expect(code("packages/engine/src/pc-capability/derive.ts")).toContain(
      "existing_actor_compilation",
    );
    expect(code("packages/engine/src/owners/admission.ts")).toContain(
      "existingActorBindingViolation",
    );
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
