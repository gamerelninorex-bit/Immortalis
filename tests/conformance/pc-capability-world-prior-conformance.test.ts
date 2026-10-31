// Conformance evidence for the Existing-Actor Unresolved Capability → PC Material-Trigger World-Prior Resolution Close
// (thirty-third bounded slice). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0 composed
// with F-027-CD1 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED and no source pin, Runtime Contract snapshot, open gate or
// acceptance status changed. The sovereign-ratified PC-CONTROL HANDOVER CONTRACT v1, the I-002 v2.1 Character Capability
// Integration Amendment and the WS-016 Working Operational Draft supply the route and are NOT lock pins: cited, never added.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  PC_CAPABILITY_FACT_KINDS,
  PC_CAPABILITY_RULE,
  PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE,
  CAUSAL_DRAW_RULE,
} from "@immortalis/engine";
import { PC_CAPABILITY_CLOSE, PcCapabilitySchema } from "@immortalis/contracts";
import { code, gates, lock, register, sha } from "../support/f027.ts";
import { expectedKindIds } from "../support/expected-surface.ts";

const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!;
const PC_DIR = "packages/engine/src/pc-capability";
const PC_SOURCES = readdirSync(PC_DIR).map((f) => `${PC_DIR}/${f}`);
/** The text of one exported function or const of a module (comment-stripped), up to its closing brace at column 0. */
const part = (file: string, name: string): string => {
  const text = code(file);
  const a = text.search(new RegExp(`export (async )?(function|const) ${name}\\b`));
  expect(a, `${name} in ${file}`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("\n}\n", a);
  const semi = text.indexOf("\n);\n", a);
  const stop = [end, semi].filter((n) => n >= 0).sort((x, y) => x - y)[0] ?? text.length;
  return text.slice(a, stop);
};
const method = (name: string): string => {
  const text = code(`${PC_DIR}/adapter.ts`);
  const a = text.search(new RegExp(`async ${name}\\(`));
  expect(a, name).toBeGreaterThanOrEqual(0);
  const b = text.indexOf("\n  }\n", a);
  return text.slice(a, b);
};

describe("IA-01 source/version fidelity: the composed authority is cited at the exact pins; no pin moved", () => {
  it("the spec-locked pins this slice reconciles are the exact pins observed at the base and re-read live", () => {
    expect(pin("I-002").native_pin).toBe("2026-09-25T00:15:54.536Z");
    expect(pin("WS-016").native_pin).toBe("2026-09-24T17:38:59.210Z");
    expect(pin("WS-006").native_pin).toBe("2026-09-25T00:18:36.828Z");
    expect(pin("IR").native_pin).toBe("2026-09-25T00:17:26.287Z");
    const addendum = JSON.parse(readFileSync("spec/f027/spec-lock.json", "utf8"))
      .implementation_authority_addenda as { id: string; native_pin: string; relation: string }[];
    expect(addendum.map((a) => [a.id, a.native_pin, a.relation])).toEqual([
      ["F-027-CD1", "2026-10-02T15:11:03.450Z", "COMPOSES_WITH"],
    ]);
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
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
  });

  it("the superseded thirty-second-slice citation is preserved byte-for-byte, and the current one extends it with the existing-actor route", () => {
    // frozen: this is the hash of the PC capability rule exactly as every save committed before this slice carries it
    expect(sha(PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE)).toBe(
      "30144203385772b57a0fa163713fa58e80f407ee5c83c92fcdac9c4d1dd90e58",
    );
    expect(sha(PC_CAPABILITY_RULE)).not.toBe(sha(PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE));
    for (const field of ["artifact", "native_pin", "effective_basis", "supersedes"] as const)
      expect(PC_CAPABILITY_RULE[field]).toEqual(PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE[field]);
    // the current clause begins with the whole superseded one (minus its closing lineage tail) and adds the route
    const tail = "; with F-016 Phase 2B PCC-01 to PCC-03 (PC Capability Close)";
    const base = PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE.clause;
    expect(base.endsWith(tail)).toBe(true);
    expect(PC_CAPABILITY_RULE.clause.startsWith(base.slice(0, -tail.length))).toBe(true);
    expect(PC_CAPABILITY_RULE.clause.endsWith(tail)).toBe(true);
    for (const cited of [
      "WS-016 Draft §16",
      "PC-Control Handover Contract v1",
      "I-002 v2.1",
      "UNRESOLVED",
      "world-prior method",
      "F-027-CD1 CD-CC-01",
      "never the accepted-Mirror derivation route",
    ])
      expect(PC_CAPABILITY_RULE.clause, cited).toContain(cited);
    const lineage = PC_CAPABILITY_RULE.authority_lineage.join("\n");
    for (const cited of [
      "3e220af901e081029b1bd0ea0421d554", // I-002 v2.1
      "2026-09-25T00:15:56.531Z",
      "3e520af901e081c0b84cc5cb7f301a0e", // PC-Control Handover Contract v1
      "2026-09-25T00:16:16.544Z",
      "2026-09-25T00:18:34.584Z", // WS-016 Working Operational Draft
      "F-027-CD1", // the composing Causal Draw authority, cited as the lock pins it
      "pinned in spec/f027/spec-lock.json",
    ])
      expect(lineage, cited).toContain(cited);
  });

  it("each PC capability kind registers exactly that superseded citation as its one historical entry, with its own bounded value class", () => {
    expect(PC_CAPABILITY_FACT_KINDS.map((k) => k.id)).toEqual([
      "pc_capability_basis",
      "pc_capability",
    ]);
    for (const k of PC_CAPABILITY_FACT_KINDS) {
      expect(k.rule).toBe(PC_CAPABILITY_RULE);
      expect(k.legacyRule!.rule).toBe(PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE);
      expect(Object.keys(k.legacyRule!).sort()).toEqual(["admits", "rule"]);
    }
    const [basis, capability] = PC_CAPABILITY_FACT_KINDS;
    const history = {
      handover: { fact_key: "role-registry/binding/role.player_character", version: 1 },
    };
    const base = { pc_id: "p", capability_id: "c", marker: "C" };
    const carried = {
      ...base,
      establishment: {
        method: "EXISTING_ACTOR_CARRY_FORWARD",
        ...history,
        source: { fact_key: "actor/p/capability/c", version: 1 },
      },
    };
    const prior = {
      ...base,
      establishment: {
        method: "EXISTING_ACTOR_CAUSALLY_DETERMINED",
        ...history,
        causes: [{ aspect: "BIOGRAPHY_HISTORY", owner: "o", fact_key: "k", version: 1 }],
      },
    };
    expect(basis!.legacyRule!.admits(carried)).toBe(true);
    expect(basis!.legacyRule!.admits(prior)).toBe(false);
    expect(basis!.legacyRule!.admits({ ...prior, marker: "S" })).toBe(false);
    expect(capability!.legacyRule!.admits({})).toBe(false);
  });

  it("the foundation document records the reconciliation, the representation, the residuals and what is not implemented", () => {
    const doc = readFileSync("docs/pc-capability-world-prior-foundation.md", "utf8");
    for (const text of [
      "2026-09-25T00:15:54.536Z", // I-002
      "2026-09-25T00:15:56.531Z", // I-002 v2.1
      "2026-09-24T17:38:59.210Z", // WS-016 Integration Map
      "2026-09-25T00:18:34.584Z", // WS-016 Working Operational Draft
      "2026-09-25T00:18:36.828Z", // WS-006 / F-014A
      "2026-09-25T00:17:26.287Z", // IR
      "2026-09-25T00:16:16.544Z", // PC-Control Handover Contract v1
      "2026-09-21T23:18:36.650Z", // F-016 Phase 2B
      "2026-10-02T15:11:03.450Z", // F-027-CD1
      "EXISTING_ACTOR_CAUSALLY_DETERMINED",
      "EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED",
      "EXISTING_ACTOR_HANDOVER",
      "EXISTING_ACTOR_CARRY_FORWARD",
      "PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE",
      "legacyRule",
      "UNRESOLVED",
      "Single Commit Point",
      "PC Capability Close",
      "AS-OF-DECLARED-CLOSE",
      "RC-16",
      "ACCEPTED_GENERATION_HISTORY",
    ])
      expect(doc, text).toContain(text);
  });
});

describe("IA-03 owner exclusivity: no new owner, facet, fact kind, key space, close, journal, RNG, ledger or scheduler", () => {
  it("the registry is exactly the thirty-second slice's: the same owners, facets, fact kinds and key spaces", () => {
    expect([...ALL_FACT_KINDS.map((k) => k.id)].sort()).toEqual([...expectedKindIds({})].sort());
    expect([...CANONICAL_OWNER_REGISTRY.get("pc_existence")!].sort()).toEqual([
      "existence_contract",
      "pc_capability_profile",
      "pc_collection_mechanism",
      "pc_intrinsic_clarification",
      "pc_voluntary_commitment",
    ]);
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
    expect(existsSync("migrations/manifests/pc-capability-world-prior.json")).toBe(false);
  });

  it("the PC capability module set gains exactly one module, the PC side of the Causal Draw ports; the world modules and the Causal Draw layer gain none", () => {
    expect(readdirSync(PC_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
      "randomized.ts",
    ]);
    expect(readdirSync("packages/engine/src/causal-draw").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "canon.ts",
      "derive.ts",
      "integrity.ts",
      "ports.ts",
      "prior.ts",
      "sampler.ts",
    ]);
  });

  it("the PC Capability Close and its temporal declaration are untouched: the same record, the literal close name and no world-prior text", () => {
    expect(Object.keys(PcCapabilitySchema.shape).sort()).toEqual(
      ["basis", "capability_id", "close", "marker", "pc_id"].sort(),
    );
    expect(PC_CAPABILITY_CLOSE).toBe("PC Capability Close");
    for (const f of [`${PC_DIR}/provider.ts`, `${PC_DIR}/declaration.ts`])
      expect(code(f), f).not.toMatch(
        /world[-_ ]prior|causalDraw|CausalDraw|causal-draw|entropy|BOUNDED_PRIOR|CAUSALLY_DETERMINED|handover|carry/i,
      );
  });

  it("the temporal coordinator, the Named-Actor modules, the Causal Draw layer and the binding were not touched by this route", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(
      /pcCapability|worldPrior/i,
    );
    for (const f of readdirSync("packages/engine/src/actor").map(
      (f) => `packages/engine/src/actor/${f}`,
    ))
      expect(code(f), f).not.toMatch(
        /pcCapability|PcCapability|world[-_ ]prior|EXISTING_ACTOR_(CAUSALLY|BOUNDED|CARRY|WORLD)/,
      );
    for (const f of readdirSync("packages/engine/src/causal-draw").map(
      (f) => `packages/engine/src/causal-draw/${f}`,
    ))
      expect(code(f), f).not.toMatch(/pcCapability|PcCapability|pc_existence|world[-_ ]prior/);
    expect(code("packages/engine/src/owners/admission.ts")).not.toMatch(
      /world[-_ ]prior|worldPrior/,
    );
    expect(code("packages/engine/src/world/canonical-campaign.ts")).not.toMatch(
      /world[-_ ]prior|worldPrior/,
    );
    expect(code("packages/contracts/src/world-foundation.ts")).not.toMatch(
      /world[-_ ]prior|capab/i,
    );
    // Causal Draw is not given a new owner or rule: its one rule and one owner are unchanged
    expect(CAUSAL_DRAW_RULE.supersedes).toBeNull();
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "causal_draw_kernel").map((k) => k.id)).toEqual(
      ["causal_draw_precommit", "causal_draw_result"],
    );
  });
});

describe("the route: unresolved at handover → unrepresented → causes, or a bounded prior through the existing Causal Draw", () => {
  const adapter = code(`${PC_DIR}/adapter.ts`);

  it("the PC owner has no RNG of its own: no entropy primitive, seed or sampler is in any PC module, and the one draw adapter is the existing one", () => {
    for (const f of PC_SOURCES)
      expect(code(f), f).not.toMatch(
        /Math\.random|node:crypto|randomBytes|getRandomValues|createHmac|createHash|\bseed\b|distribution/i,
      );
    expect(adapter.match(/new CausalDrawAdapter\(/g)).toHaveLength(1);
    expect(adapter.match(/\.commit\(/g)).toHaveLength(1);
    expect(adapter).toContain(
      "slotInspectors: new Map([[OWNER_PC_EXISTENCE, pcSlotInspector(store)]])",
    );
    expect(adapter).toContain("ruleAuthority: pcRuleAuthority");
  });

  it("the deterministic establishment creates no draw evidence: it never touches the Causal Draw adapter, entropy or a resolver context", () => {
    const deterministic = method("establishExistingActorCapabilityBasis");
    expect(deterministic).not.toMatch(
      /causalDraw|CausalDraw|entropy|resolution|draw\(|precommit|RESOLVER/,
    );
    expect(deterministic).toContain("deriveWorldPriorBasis");
    expect(deterministic).toContain("PcExistingActorEstablishmentInputSchema");
  });

  it("the randomized establishment refuses before any draw, draws first, then commits its own basis reading the exact result", () => {
    const randomized = method("establishExistingActorRandomizedCapabilityBasis");
    const at = (text: string) => randomized.indexOf(text);
    expect(at("#admissionPreview")).toBeGreaterThan(-1);
    expect(at("#admissionPreview")).toBeLessThan(at("this.#causalDraw.draw("));
    expect(at("this.#causalDraw.draw(")).toBeLessThan(at("parseCapabilityCandidateId("));
    expect(at("parseCapabilityCandidateId(")).toBeLessThan(at("deriveWorldPriorBasis("));
    expect(at("deriveWorldPriorBasis(")).toBeLessThan(at("this.#publish("));
    expect(randomized).toContain("pcCapabilityDrawSpecification(");
    expect(randomized).toContain("pcCapabilityDrawDigest(");
  });

  it("the world-prior statements are pure and by identity, name no accepted-Mirror route, and contain no grade literal, ladder, default, weight, table or arithmetic", () => {
    const statements = [
      part(`${PC_DIR}/derive.ts`, "pcCauseViolation"),
      part(`${PC_DIR}/derive.ts`, "pcExistingActorWorldPriorViolation"),
      part(`${PC_DIR}/derive.ts`, "pcHandoverPin"),
      part(`${PC_DIR}/derive.ts`, "deriveWorldPriorBasis"),
      part(`${PC_DIR}/randomized.ts`, "pcCapabilityDrawSpecification"),
      part(`${PC_DIR}/randomized.ts`, "pcRandomizedEstablishmentViolation"),
      part(`${PC_DIR}/randomized.ts`, "pcRuleAuthority"),
      part(`${PC_DIR}/randomized.ts`, "pcSlotInspector"),
    ];
    for (const text of statements) {
      expect(text).not.toMatch(
        /\b(setInterval|setTimeout|Date\.now|new Date|performance\.now|Math\.|randomUUID|randomBytes|globalTick|cadence|sweep|periodic|listFacts|node:fs|writeFile|appendFile)\b/,
      );
      expect(text).not.toMatch(
        /"[CBAS]"|\bgrade\b|\bCAPABILITY_GRADES\b|\blevel\b|\bxp\b|\brank\b|\bdefault\b|ACCEPTED_GENERATION_HISTORY|Mirror|claims|PcClaimLocator/i,
      );
      // a weight is only ever the owner's, passed through: never produced or compared here
      expect(text).not.toMatch(/weight\s*[:=]\s*["'`]\d|BigInt|parseInt|Number\(/);
    }
    // the marker is placed or compared, never computed
    expect(part(`${PC_DIR}/derive.ts`, "deriveWorldPriorBasis")).toContain(
      "marker: resolved.marker",
    );
    expect(part(`${PC_DIR}/randomized.ts`, "pcRandomizedEstablishmentViolation")).toContain(
      "canonicalEqual(selected.marker, basis.marker)",
    );
  });

  it("the cutover is the one shared statement: the carry-forward and the world-prior rules both call pcHandoverViolation", () => {
    expect(part(`${PC_DIR}/derive.ts`, "pcCarryForwardViolation")).toContain(
      "pcHandoverViolation(",
    );
    expect(part(`${PC_DIR}/derive.ts`, "pcExistingActorWorldPriorViolation")).toContain(
      "pcHandoverViolation(",
    );
    expect(part(`${PC_DIR}/derive.ts`, "pcHandoverViolation")).toContain("EXISTING_ACTOR_HANDOVER");
  });

  it("the fresh-PC and carry-forward paths keep their own methods: the receiving path presents only ACCEPTED_GENERATION_HISTORY and still refuses a compilation", () => {
    expect(adapter).toContain("PC_ESTABLISHMENT_ACCEPTED_GENERATION_HISTORY");
    expect(code(`${PC_DIR}/derive.ts`)).toContain(
      "ACCEPTED_GENERATION_HISTORY would present the actor's inherited mastery as player-authored",
    );
    expect(adapter).toContain("PcCapabilityCarryForwardInputSchema");
    expect(adapter).toContain("deriveCarryForwardBasis");
  });

  it("admission and load verification both enforce the rule citation, the draw-evidence rule and the predecessor boundary independently of the adapter", () => {
    const admission = code(`${PC_DIR}/admission.ts`);
    expect(admission).toContain("canonicalEqual(group.rule, PC_CAPABILITY_RULE)");
    expect(admission).toContain("pcCapabilityDrawStateExists(");
    expect(admission).toContain("pcCapabilityBoundaryViolation(");
    expect(admission).toContain("pcCapabilityEstablishmentViolation(");
    const integrity = code(`${PC_DIR}/integrity.ts`);
    expect(integrity).toContain("PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE");
    expect(integrity).toContain("causalDrawPrecommitKey(");
    expect(integrity).toContain("pcCapabilityBoundaryViolation(");
    expect(integrity).toContain("pcCapabilityEstablishmentViolation(");
  });

  it("no PC → non-PC handover, development or loss, lifecycle, succession, fork, binding mode, relocation, UI or provider construct was added anywhere", () => {
    const files = [...PC_SOURCES, "packages/contracts/src/pc-capability.ts"];
    for (const f of files)
      expect(code(f), f).not.toMatch(
        /pc_to_non_pc|pcToNonPc|succession|fork_branch|intrinsic_amendment|IntrinsicAmendment|broadcast_exposure|exposure_event|ACTIVE-LIMITED|binding_mode|bindingMode|\bDEFERRED\b|relocat|eager|enumerate|UNRESOLVED_CAPABILITY|unresolvedCapability/i,
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
