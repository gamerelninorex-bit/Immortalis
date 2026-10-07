// Conformance evidence for the Existing-Actor I-002 Pre-Binding Compilation & Ownership Boundary Foundation (twenty-ninth
// slice). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and every other F-027 open
// gate, source pin and acceptance status is unchanged. The sovereign-ratified PC-CONTROL HANDOVER CONTRACT v1 (W3-CP3 Blue
// Repair Overlay) and I-002 v2.4 are named by the slice brief; they are NOT lock pins and are deliberately not added to it.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  I002_SOURCE,
  IR_SOURCE,
  PC_CAPABILITY_RULE,
  WS016_SOURCE,
  factKind,
} from "@immortalis/engine";
import {
  EXISTING_ACTOR_COMPILATION,
  ExistenceContractSchema,
  PlayerCharacterBindingSchema,
} from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import {
  EXPECTED_ADAPTER_SURFACES,
  expectedKindIds,
  expectedOwnerFacetSet,
} from "../support/expected-surface.ts";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
/** Every production module this slice touched: the scans below judge exactly what it added or changed. */
const TOUCHED = [
  "packages/contracts/src/world-foundation.ts",
  "packages/engine/src/owners/admission.ts",
  "packages/engine/src/actor/derive.ts",
  "packages/engine/src/pc-capability/derive.ts",
  "packages/engine/src/world/integrity.ts",
  "packages/engine/src/world/canonical-campaign.ts",
];

/** The text of a function or constant in a file, from its declaration to the next top-level declaration. */
const region = (file: string, from: RegExp, to: RegExp): string => {
  const text = code(file);
  const start = text.search(from);
  expect(start, `${file}: ${from}`).toBeGreaterThanOrEqual(0);
  const rest = text.slice(start + 1);
  const end = rest.search(to);
  return text.slice(start, end < 0 ? undefined : start + 1 + end);
};
const NEW_RULES = [
  region(
    "packages/engine/src/owners/admission.ts",
    /export function existingActorBindingViolation/,
    /^function checkBinding/m,
  ),
  region(
    "packages/engine/src/actor/derive.ts",
    /export function actorBoundaryViolation/,
    /^export function causeOwnerViolation/m,
  ),
];

describe("IA-01 source/version fidelity: the composed authority lineage is preserved, no pin moved", () => {
  it("the spec-locked pins this slice reconciles are the exact pins observed at the base, and the Existence Contract's governing rule still cites them", () => {
    const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!;
    expect(pin("I-002").native_pin).toBe("2026-09-25T00:15:54.536Z");
    expect(pin("WS-016").native_pin).toBe("2026-09-24T17:38:59.210Z");
    expect(pin("WS-006").native_pin).toBe("2026-09-25T00:18:36.828Z");
    expect(pin("IR").native_pin).toBe("2026-09-25T00:17:26.287Z");
    expect(I002_SOURCE).toEqual({
      artifact: pin("I-002").url,
      native_pin: pin("I-002").native_pin,
    });
    expect(IR_SOURCE).toEqual({ artifact: pin("IR").url, native_pin: pin("IR").native_pin });
    expect(WS016_SOURCE).toEqual({
      artifact: pin("WS-016").url,
      native_pin: pin("WS-016").native_pin,
    });
    const rule = factKind("pc_existence_contract").rule;
    expect(rule.artifact).toBe(pin("I-002").url);
    expect(rule.native_pin).toBe(pin("I-002").native_pin);
    expect(rule.supersedes).toBeNull();
    expect(rule.clause).toBe(
      "§2 Ownership Contract and §2.1 Role/Authority Declaration; §4 Minimum Existence Contract; §21 Generation Hand-Off Test; §26 Sparse Persistence",
    );
    // the registration is untouched: its lineage carries neither overlay (they are cited in code comments and the docs only)
    const lineage = rule.authority_lineage.join("\n");
    expect(lineage).toContain("2026-09-29T00:33:04.009Z");
    for (const overlay of ["3e520af901e081c0b84cc5cb7f301a0e", "3e320af901e0817e92fdcc07d79fee69"])
      expect(lineage).not.toContain(overlay);
  });

  it("the ratified overlays supply the seam rule without becoming lock pins: the lock is untouched, and not one overlay pin appears in it", () => {
    const lockText = readFileSync("spec/f027/spec-lock.json", "utf8");
    // PC-CONTROL HANDOVER CONTRACT v1 (observed native pin 2026-09-25T00:16:16.544Z), I-002 v2.4 (2026-09-25T00:15:58.558Z)
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
    // the Runtime Contract and open gates are byte-identical to the base snapshot
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
  });

  it("the foundation document records the exact reconciliation, each overlay at its observed native pin, and what is not implemented", () => {
    const doc = readFileSync("docs/existing-actor-compilation-foundation.md", "utf8");
    for (const text of [
      "2026-09-25T00:15:54.536Z", // I-002
      "2026-09-24T17:38:59.210Z", // WS-016
      "2026-09-25T00:18:36.828Z", // WS-006 / F-014A
      "2026-09-25T00:17:26.287Z", // IR
      "2026-09-25T00:16:16.544Z", // PC-Control Handover Contract v1
      "2026-09-25T00:15:58.558Z", // I-002 v2.4
      "RC-02",
      "RC-13",
      "RC-16",
      "Single Commit Point",
      "DEFERRED",
      "ACTIVE-LIMITED",
    ])
      expect(doc, text).toContain(text);
    for (const notImplemented of [
      "Existing-Actor → PC Role Registry handover",
      "carry-forward",
      "UNRESOLVED",
      "Causal Draw",
      "PC → non-PC",
      "Intrinsic Amendment",
      "BROADCAST_EXPOSURE",
      "PF-6/F-028",
    ])
      expect(doc, notImplemented).toContain(notImplemented);
  });
});

describe("IA-03 owner exclusivity: no new owner, facet, key space, fact kind, adapter or module", () => {
  it("the registry is exactly the twenty-eighth slice's: the same owners, facets, fact kinds and key spaces", () => {
    expect([...ALL_FACT_KINDS.map((k) => k.id)].sort()).toEqual([...expectedKindIds({})].sort());
    for (const [owner, facets] of Object.entries({
      pc_existence: ["existence_contract", "pc_capability_profile"],
      role_registry: ["player_character_binding"],
      named_actor: ["actor_profile"],
    })) {
      expect([...(CANONICAL_OWNER_REGISTRY.get(owner) ?? [])].sort()).toEqual([...facets].sort());
      expect(CANONICAL_OWNER_REGISTRY.get(owner)).toEqual(expectedOwnerFacetSet(owner));
    }
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "pc_existence").map((k) => k.id)).toEqual([
      "pc_existence_contract",
      "pc_capability_basis",
      "pc_capability",
    ]);
    // the compilation lives in the one existing Existence Contract key space: no key space matches a handover or compilation key
    for (const key of [
      "pc/p/existing-actor-compilation",
      "pc/p/handover",
      "role-registry/handover/p",
      "handover/p",
      "actor/a/handover",
    ])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(0);
    const contract = factKind("pc_existence_contract");
    expect([contract.owner, contract.facet, contract.lifecycle]).toEqual([
      "pc_existence",
      "existence_contract",
      "SEALED",
    ]);
    expect(contract.legacyRule).toBeUndefined();
  });

  it("no adapter, class or directory was added, and the registered adapter surfaces are unchanged", () => {
    expect(Object.keys(EXPECTED_ADAPTER_SURFACES).sort()).toEqual([
      "CausalDrawAdapter",
      "DiplomacyAdapter",
      "EconomyAdapter",
      "EpistemicAccessAdapter",
      "GipAdapter",
      "KtiAdapter",
      "LogisticsAdapter",
      "NamedActorAdapter",
      "PcCapabilityAdapter",
      "PopulationAdapter",
      "ProductionAdapter",
      "TemporalCoordinator",
    ]);
    expect(Object.keys(EXPECTED_ADAPTER_SURFACES)).not.toContain("HandoverAdapter");
    expect(
      readdirSync("packages/engine/src")
        .filter((f) => statSync(join("packages/engine/src", f)).isDirectory())
        .sort(),
    ).toEqual([
      "actor",
      "causal-draw",
      "commit",
      "diplomacy",
      "economy",
      "epistemic",
      "gip",
      "kti",
      "logistics",
      "owners",
      "pc-capability",
      "persistence",
      "population",
      "presentation",
      "production",
      "projection",
      "temporal",
      "world",
    ]);
    expect(readdirSync("packages/engine/src/owners").sort()).toEqual([
      "admission.ts",
      "extension.ts",
      "registry.ts",
      "rejection.ts",
    ]);
    expect(readdirSync("packages/engine/src/world").sort()).toEqual([
      "actor-coupling-integrity.ts",
      "actor-coupling.ts",
      "canonical-campaign.ts",
      "entity-transition-integrity.ts",
      "entity-transition-provider.ts",
      "entity-transition.ts",
      "fallback-custody.ts",
      "integrity.ts",
    ]);
    expect(readdirSync("packages/engine/src/actor").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
      "randomized.ts",
    ]);
    expect(readdirSync("packages/contracts/src").sort()).not.toContain("existing-actor.ts");
    expect(existsSync("migrations/manifests/existing-actor-compilation.json")).toBe(false);
    const classes = walk("packages/engine/src").flatMap((f) =>
      [...code(f).matchAll(/(?:export )?class (\w+)/g)].map((m) => m[1]),
    );
    expect(classes.filter((c) => /handover|compil|ledger|scheduler|journal/i.test(c!))).toEqual([]);
  });

  it("the Existence Contract gained exactly one optional field and its strict shape otherwise: the six-part minimum and the release record are unchanged", () => {
    const keys = Object.keys(ExistenceContractSchema.shape).sort();
    expect(keys).toEqual(
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
    expect(ExistenceContractSchema.shape.existing_actor_compilation.isOptional()).toBe(true);
    expect(EXISTING_ACTOR_COMPILATION).toBe("EXISTING_ACTOR_COMPILATION");
  });
});

describe("the ownership cutover stays the binding commit: no handover, carry-forward or third classification exists", () => {
  it("the Role Registry binding still represents only the first ACTIVATION of a freshly generated PC: no prior/replacement, migration or other transition is representable", () => {
    const shape = PlayerCharacterBindingSchema.shape;
    expect(shape.prior_binding.safeParse({}).success).toBe(false);
    expect(shape.replacement_binding.safeParse({}).success).toBe(false);
    expect(shape.intrinsic_authority_migration.safeParse([{}]).success).toBe(false);
    for (const type of ["HANDOVER", "DEACTIVATION", "TRANSFER", "REACTIVATION", "EXISTING_ACTOR"])
      expect(shape.transition.safeParse({ type, basis: {} }).success, type).toBe(false);
  });

  it("no production code states DEFERRED / ACTIVE-LIMITED as a binding mode, a score, a timer or a scheduler for the compilation", () => {
    for (const f of TOUCHED) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /ACTIVE-LIMITED|binding_mode|bindingMode|agency_score|readiness_condition/,
      );
      expect(text, f).not.toMatch(/\bDEFERRED\b/);
    }
  });

  it("the new rules are pure functions of committed facts: no clock, RNG, tick, timer, scan, persistence or Causal Draw", () => {
    const forbidden =
      /\b(setInterval|setTimeout|Date\.now|new Date|performance\.now|Math\.random|randomUUID|randomBytes|globalTick|cadence|sweep|periodic|listFacts|node:fs|writeFile|appendFile|causalDraw|CausalDraw|entropy|seed)\b/;
    for (const text of NEW_RULES) expect(text).not.toMatch(forbidden);
  });

  it("no carry-forward, unresolved-capability, world-prior, PC-to-non-PC, replacement, fork, Intrinsic Amendment or exposure construct was added anywhere", () => {
    for (const f of TOUCHED) {
      // The thirty-second slice adds the ONE distinct EXISTING_ACTOR_CARRY_FORWARD establishment to the PC capability
      // derivation (its own conformance suite judges it); every other construct stays absent here, and nowhere else in
      // the files this slice touched did a carry-forward appear.
      const lowered = code(f).toLowerCase();
      const text =
        f === "packages/engine/src/pc-capability/derive.ts"
          ? lowered.replaceAll(/carry[-_ ]?forward/g, "")
          : lowered;
      expect(text, f).not.toMatch(
        /carry[-_ ]?forward|unresolved_capability|world[-_ ]prior|pc_to_non_pc|handover_commit|succession|fork_branch|intrinsic_amendment|broadcast_exposure|exposure_event/,
      );
    }
    const refusal = code("packages/engine/src/pc-capability/derive.ts");
    expect(refusal).toContain("EXISTING_ACTOR_CARRY_FORWARD establishment");
  });

  it("the existing-actor refusals read only identity and the committed contract: ordinary activation and the PC capability receipt copy no actor state", () => {
    const text = NEW_RULES.join("\n");
    expect(text).not.toMatch(/actorCapabilityKey|capabilityBasis\(|\.marker\b|deriveCapability/);
    // the compilation verifier names the Named-Actor owner and its two kinds — and nothing of the PC owner's capability path
    const verifier = region(
      "packages/engine/src/owners/admission.ts",
      /export function existingActorCompilationViolation/,
      /^function checkExistenceContract/m,
    );
    expect(verifier).not.toMatch(/pc_capability|pcCapability|OWNER_PC_EXISTENCE/);
    const kinds = /EXISTING_ACTOR_SOURCE_KINDS[^=]*=\s*new Set\(\[([^\]]*)\]\)/.exec(
      code("packages/engine/src/actor/derive.ts"),
    )![1]!;
    expect([...kinds.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([
      "named_actor_capability_basis",
      "named_actor_capability",
    ]);
  });

  it("the PC capability rule's governing citation and the Named-Actor rule are untouched by this slice", () => {
    expect(PC_CAPABILITY_RULE.clause).toContain(
      "Blue Bounded Integration Map §2 I-002 — BOUNDED AMENDMENT",
    );
    expect(PC_CAPABILITY_RULE.native_pin).toBe("2026-09-24T17:38:59.210Z");
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

  it.each(["IA-01", "IA-03", "IA-14"])(
    "%s gained narrowly scoped partial evidence naming the existing-actor compilation tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/existing-actor compilation/i);
      expect(row.partial_evidence?.tests.some((t) => /existing-actor-compilation/.test(t))).toBe(
        true,
      );
    },
  );

  it("IA-14's existing-actor evidence names the Existing-Actor → PC handover, carry-forward and the other paths that stay not implemented", () => {
    const scope = register.find((r) => r.id === "IA-14")!.partial_evidence!.scope;
    for (const phrase of [
      "Existing-Actor → PC Role Registry handover",
      "carry-forward",
      "PC-to-non-PC",
      "Intrinsic Amendment",
    ])
      expect(scope).toContain(phrase);
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
