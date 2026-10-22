// Conformance evidence for the Established Existing-Actor Capability → PC Capability Carry-Forward Close Foundation (thirty-second
// bounded slice). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED and no source pin, Runtime Contract snapshot, open gate or acceptance status changed. The
// sovereign-ratified PC-CONTROL HANDOVER CONTRACT v1 (W3-CP3 Blue Repair Overlay) and the I-002 v2.1 Character Capability
// Integration Amendment supply the seam rule and are NOT lock pins: they are cited, never added to the lock.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  PC_CAPABILITY_FACT_KINDS,
  PC_CAPABILITY_RULE,
  PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE,
  WS016_SOURCE,
} from "@immortalis/engine";
import {
  PC_CAPABILITY_CLOSE,
  PcCapabilityBasisSchema,
  PcCapabilitySchema,
} from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import { expectedKindIds } from "../support/expected-surface.ts";

const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!;
const DERIVE = "packages/engine/src/pc-capability/derive.ts";
const PC_SOURCES = readdirSync("packages/engine/src/pc-capability").map(
  (f) => `packages/engine/src/pc-capability/${f}`,
);

describe("IA-01 source/version fidelity: the composed authority lineage is cited at the exact pins; no pin moved", () => {
  it("the spec-locked pins this slice reconciles are the exact pins observed at the base", () => {
    expect(pin("I-002").native_pin).toBe("2026-09-25T00:15:54.536Z");
    expect(pin("WS-016").native_pin).toBe("2026-09-24T17:38:59.210Z");
    expect(pin("WS-006").native_pin).toBe("2026-09-25T00:18:36.828Z");
    expect(pin("IR").native_pin).toBe("2026-09-25T00:17:26.287Z");
    expect(WS016_SOURCE).toEqual({
      artifact: pin("WS-016").url,
      native_pin: pin("WS-016").native_pin,
    });
  });

  it("the PC capability kinds' registration is unchanged, and every existing save's provenance is preserved by the one historical-rule entry of each kind", () => {
    expect(
      PC_CAPABILITY_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle, k.im, k.rc]),
    ).toEqual([
      [
        "pc_capability_basis",
        "pc_existence",
        "pc_capability_profile",
        "SEALED",
        "IM-07",
        ["RC-02"],
      ],
      [
        "pc_capability",
        "pc_existence",
        "pc_capability_profile",
        "SEALED",
        "IM-07",
        ["RC-02", "RC-03", "RC-04"],
      ],
    ]);
    for (const k of PC_CAPABILITY_FACT_KINDS) {
      expect(k.rule).toEqual(PC_CAPABILITY_RULE);
      // the thirty-second-slice citation is preserved whole, so a save written under it loads unchanged
      expect(k.legacyRule!.rule).toEqual(PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE);
    }
    expect(PC_CAPABILITY_RULE.artifact).toBe(pin("WS-016").url);
    expect(PC_CAPABILITY_RULE.native_pin).toBe(pin("WS-016").native_pin);
    expect(PC_CAPABILITY_RULE.effective_basis).toBe("pinned-by-spec-lock");
    expect(PC_CAPABILITY_RULE.supersedes).toBeNull();
    // the overlays are NOT lock pins, and the superseded citation never named them; the current one cites them (existing-actor
    // world-prior slice), so a world-prior fact's provenance names the authority that governs it
    const legacy = PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE.authority_lineage.join("\n");
    const current = PC_CAPABILITY_RULE.authority_lineage.join("\n");
    for (const overlay of ["3e520af901e081c0b84cc5cb7f301a0e", "2026-09-25T00:16:16.544Z"]) {
      expect(legacy).not.toContain(overlay);
      expect(current).toContain(overlay);
    }
  });

  it("the overlays are not lock pins: the lock, Runtime Contract and open-gate snapshots are untouched", () => {
    const lockText = readFileSync("spec/f027/spec-lock.json", "utf8");
    for (const overlay of [
      "3e520af901e081c0b84cc5cb7f301a0e",
      "2026-09-25T00:16:16.544Z",
      "2026-09-25T00:15:56.531Z",
      "2026-09-25T00:18:34.584Z",
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
    const doc = readFileSync("docs/pc-capability-carry-forward-foundation.md", "utf8");
    for (const text of [
      "2026-09-25T00:15:54.536Z", // I-002
      "2026-09-25T00:15:56.531Z", // I-002 v2.1 amendment
      "2026-09-24T17:38:59.210Z", // WS-016 integration map
      "2026-09-25T00:18:36.828Z", // WS-006 / F-014A
      "2026-09-25T00:17:26.287Z", // IR
      "2026-09-25T00:16:16.544Z", // PC-Control Handover Contract v1
      "2026-09-25T00:18:34.584Z", // Character Capability Working Operational Draft
      "2026-09-21T23:18:36.650Z", // F-016 Phase 2B
      "EXISTING_ACTOR_CARRY_FORWARD",
      "EXISTING_ACTOR_HANDOVER",
      "ACCEPTED_GENERATION_HISTORY",
      "Single Commit Point",
      "PC Capability Close",
      "AS-OF-DECLARED-CLOSE",
      "RC-02",
      "RC-13",
      "RC-16",
    ])
      expect(doc, text).toContain(text);
    for (const notImplemented of [
      "UNRESOLVED",
      "world-prior",
      "Causal Draw",
      "Intrinsic Amendment",
      "PC → non-PC",
      "succession",
      "DEFERRED",
      "Confirmation Surface",
      "relocation",
    ])
      expect(doc, notImplemented).toContain(notImplemented);
  });
});

describe("IA-03 owner exclusivity: no new owner, facet, fact kind, key space, adapter, close, journal or module", () => {
  it("the registry is exactly the thirty-first slice's: the same owners, facets, fact kinds and key spaces", () => {
    expect([...ALL_FACT_KINDS.map((k) => k.id)].sort()).toEqual([...expectedKindIds({})].sort());
    expect([...CANONICAL_OWNER_REGISTRY.get("pc_existence")!].sort()).toEqual([
      "existence_contract",
      "pc_capability_profile",
      "pc_voluntary_commitment",
    ]);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "pc_existence").map((k) => k.id)).toEqual([
      "pc_existence_contract",
      "pc_capability_basis",
      "pc_capability",
      "pc_movement_commitment",
      "pc_movement_request",
    ]);
    for (const key of ["pc/p/capability-basis/c", "pc/p/capability/c"])
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key))).toHaveLength(1);
    expect(existsSync("migrations/manifests/pc-capability-carry-forward.json")).toBe(false);
  });

  it("the PC capability module set is unchanged: no new module, scheduler, ledger or journal was added", () => {
    expect(readdirSync("packages/engine/src/pc-capability").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
      "randomized.ts",
    ]);
    expect(readdirSync("packages/engine/src/world").sort()).toEqual([
      "actor-coupling-integrity.ts",
      "actor-coupling.ts",
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
      "source-condition.ts",
    ]);
  });

  it("the persisted capability and its Close are untouched: the same minimal record and the literal PC Capability Close", () => {
    expect(Object.keys(PcCapabilitySchema.shape).sort()).toEqual(
      ["basis", "capability_id", "close", "marker", "pc_id"].sort(),
    );
    expect(Object.keys(PcCapabilityBasisSchema.shape).sort()).toEqual(
      ["capability_id", "establishment", "marker", "pc_id"].sort(),
    );
    expect(PC_CAPABILITY_CLOSE).toBe("PC Capability Close");
    const provider = code("packages/engine/src/pc-capability/provider.ts");
    expect(provider).not.toMatch(
      /carry|handover|PLAYER_CHARACTER_BINDING|actorCapability|OWNER_NAMED_ACTOR/i,
    );
    expect(code("packages/engine/src/pc-capability/declaration.ts")).not.toMatch(
      /carry|handover|PLAYER_CHARACTER_BINDING|actorCapability/i,
    );
  });

  it("the temporal coordinator, the Named-Actor boundary, the handover rule and the binding were not touched", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(/pcCapability|carry/i);
    expect(code("packages/engine/src/actor/derive.ts")).not.toMatch(/pcCapability|carry/i);
    expect(code("packages/engine/src/owners/admission.ts")).not.toMatch(/carry/i);
    expect(code("packages/engine/src/world/canonical-campaign.ts")).not.toMatch(/carry/i);
    expect(code("packages/engine/src/world/integrity.ts")).not.toMatch(/carry/i);
    expect(code("packages/contracts/src/world-foundation.ts")).not.toMatch(/carry|capab/i);
  });
});

describe("the carry-forward is a distinct inherited establishment, exact, and resolves nothing", () => {
  const rule = (() => {
    const text = code(DERIVE);
    const a = text.search(/export function pcCarryForwardViolation/);
    return text.slice(a, text.search(/export const pcBasisIsCarryForward/));
  })();
  const cutover = (() => {
    const text = code(DERIVE);
    const a = text.search(/export function pcHandoverViolation/);
    return text.slice(a, text.search(/export function pcCarryForwardViolation/));
  })();
  const builder = (() => {
    const text = code(DERIVE);
    const a = text.search(/export function deriveCarryForwardBasis/);
    return text.slice(a, text.search(/export const pcBasisIsCarryForward/));
  })();
  const adapter = code("packages/engine/src/pc-capability/adapter.ts");

  it("the carry-forward rule and builder are pure and by identity: no clock, RNG, tick, timer, scan, persistence or Causal Draw", () => {
    for (const text of [rule, builder])
      expect(text).not.toMatch(
        /\b(setInterval|setTimeout|Date\.now|new Date|performance\.now|Math\.random|randomUUID|randomBytes|globalTick|cadence|sweep|periodic|listFacts|node:fs|writeFile|appendFile|causalDraw|CausalDraw|entropy|seed|weight|prior)\b/,
      );
    // the close and the temporal declaration never learned the world-prior route (it is received by the basis path only)
    for (const f of PC_SOURCES.filter((f) => /provider|declaration/.test(f)))
      expect(code(f), f).not.toMatch(
        /world[-_ ]prior|causalDraw|CausalDraw|entropy|BOUNDED_PRIOR|CAUSALLY_DETERMINED/,
      );
  });

  it("the marker is transcribed and compared, never computed: no grade literal, ladder, default or arithmetic exists in the carry-forward statements", () => {
    for (const text of [rule, builder]) {
      expect(text).not.toMatch(
        /"[CBAS]"|\bgrade\b|\bCAPABILITY_GRADES\b|\blevel\b|\bxp\b|\brank\b|Math\./i,
      );
    }
    expect(builder).toContain("marker: capability.data.marker");
    expect(rule).toContain("canonicalEqual(capability.data.marker, basis.marker)");
  });

  it("only the capability key is a source: the source key is the Named-Actor capability's, never the basis'", () => {
    expect(rule).toContain("actorCapabilityKey(basis.pc_id, basis.capability_id)");
    expect(rule).not.toContain("actorCapabilityBasisKey");
    expect(builder).toContain("actorCapabilityKey(pcId, capabilityId)");
    expect(builder).not.toContain("actorCapabilityBasisKey");
  });

  it("the handover is the cutover basis: the rule consults the committed binding for the EXISTING_ACTOR_HANDOVER of this identity, and the owner path accepts no insertion, versions or marker", () => {
    // the one cutover statement, shared with the world-prior establishments so the two cannot drift
    expect(rule).toContain("pcHandoverViolation(");
    expect(cutover).toContain("PLAYER_CHARACTER_BINDING_KEY");
    expect(cutover).toContain("EXISTING_ACTOR_HANDOVER");
    expect(adapter).toContain("PcCapabilityCarryForwardInputSchema");
    expect(adapter).toContain("deriveCarryForwardBasis");
  });

  it("the fresh-PC path keeps its own refusal and method: ACCEPTED_GENERATION_HISTORY still refuses a compilation, and the owner path presents only that method", () => {
    const derive = code(DERIVE);
    expect(derive).toContain("existing_actor_compilation");
    expect(derive).toContain(
      "ACCEPTED_GENERATION_HISTORY would present the actor's inherited mastery as player-authored",
    );
    expect(adapter).toContain("PC_ESTABLISHMENT_ACCEPTED_GENERATION_HISTORY");
  });

  it("no unresolved/latent inherited capability, PC-to-non-PC, succession, fork, Intrinsic Amendment, deferred-mode or exposure construct was added anywhere", () => {
    const files = [
      ...PC_SOURCES,
      "packages/contracts/src/pc-capability.ts",
      "tests/support/existing-actor.ts",
    ];
    for (const f of files)
      expect(code(f), f).not.toMatch(
        /unresolved_capability|UNRESOLVED_INHERIT|pc_to_non_pc|succession|fork_branch|intrinsic_amendment|broadcast_exposure|exposure_event|ACTIVE-LIMITED|binding_mode|bindingMode|\bDEFERRED\b/,
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
