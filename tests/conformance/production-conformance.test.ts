// Conformance evidence for the Production & Resource Conservation Backbone Foundation (fifth slice). Each block
// names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/
// BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and CAL-01, CAL-02/L-50 and
// CAL-03 stay unresolved.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  PRODUCTION_FACT_KINDS,
  PRODUCTION_RULE,
  ProductionAdapter,
  TemporalCoordinator,
  WG_SOURCE,
  WORLD_FALLBACK_FACT_KINDS,
  WORLD_FALLBACK_RULE,
  WS003_SOURCE,
  productionCompletionProvider,
  worldFallbackAcceptanceProvider,
} from "@immortalis/engine";
import { PACKAGE_FORMAT_VERSION } from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import { EXPECTED_OWNER_FACETS, expectedAdapterMethods } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";
import { PROTOCOL_ONLY_EVENT_SIGNAL_READ, protocolIndexExports } from "../support/protocol.ts";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
const PRODUCTION_SOURCES = [
  ...walk("packages/engine/src/production"),
  "packages/engine/src/world/fallback-custody.ts",
  "packages/contracts/src/production.ts",
];

describe("IA-01 source/version fidelity (Production registration aspect)", () => {
  it("every Production kind cites WS-003 at its exact spec-locked pin and the IM-05 lowering", () => {
    const ws003 = lock.frozen_sources.find((s) => s.id === "WS-003")!;
    expect(WS003_SOURCE).toEqual({ artifact: ws003.url, native_pin: ws003.native_pin });
    expect(ws003.primary_im).toBe("IM-05");
    for (const kind of PRODUCTION_FACT_KINDS) {
      expect(kind.rule).toEqual(PRODUCTION_RULE);
      expect(kind.rule.artifact).toBe(ws003.url);
      expect(kind.rule.native_pin).toBe(ws003.native_pin);
      expect(kind.im).toBe("IM-05");
      expect(kind.rule.supersedes).toBeNull();
    }
  });

  it("the World-State fallback kind cites WG at its exact spec-locked pin (IM-03), with F-016's and F-017's pins in its lineage", () => {
    const wg = lock.frozen_sources.find((s) => s.id === "WG")!;
    expect(WG_SOURCE).toEqual({ artifact: wg.url, native_pin: wg.native_pin });
    expect(wg.primary_im).toBe("IM-03");
    for (const kind of WORLD_FALLBACK_FACT_KINDS) {
      expect(kind.rule).toEqual(WORLD_FALLBACK_RULE);
      expect(kind.rule.artifact).toBe(wg.url);
      expect(kind.rule.native_pin).toBe(wg.native_pin);
      expect(kind.im).toBe("IM-03");
    }
    expect(WORLD_FALLBACK_RULE.clause).toContain(
      "F-016 Ratified Fallback Objective Physical-Entity Custody",
    );
    for (const r of [PRODUCTION_RULE, WORLD_FALLBACK_RULE]) {
      const lineage = r.authority_lineage.join("\n");
      expect(lineage).toContain("2026-09-25T13:48:12.575Z"); // F-016 v0.4 manifest pin
      expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
      const tranche = lock.incorporated_tranches.find((t) =>
        t.title.includes("Runtime Contract & Translation"),
      )!;
      expect(lineage).toContain(tranche.native_pin);
    }
  });

  it("the Production rule names the WS-003 clauses the state relies on", () => {
    for (const c of [
      "§2 Authoritative Scope incl. Completed durable output / physical-state handoff",
      "§3 Representation Tiers",
      "§4 Capability-Access-Reserve-Source Contract",
      "§8 Labor and Specialist Interface (Tier A embedded labor, no marginal labor claim)",
      "§9 Shared Constraints and Concurrent Load incl. Scarcity Allocation (no invented priority)",
      "§13A Production Request",
      "§15 Validation Checklist",
      "§16 Selected Turnless Temporal Adapter",
    ]) {
      expect(PRODUCTION_RULE.clause).toContain(c);
    }
  });
});

describe("IA-03 owner exclusivity: Production owns production-side state only; World-State fallback owns the accepted durable", () => {
  it("registers exactly one new owner, Production, with ONE facet and four exclusive key spaces", () => {
    expect(PRODUCTION_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["production_reserve", "production", "production_state", "ADVANCING"],
      ["production_claim", "production", "production_state", "ADVANCING"],
      ["production_operation", "production", "production_state", "ADVANCING"],
      ["production_completion", "production", "production_state", "SEALED"],
    ]);
    expect(WORLD_FALLBACK_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["world_fallback_entity", "world_state", "world_fallback_physical_entity", "SEALED"],
    ]);
    // (the sixth slice's Economy is the one later registered owner)
    expect([...CANONICAL_OWNER_REGISTRY.keys()].sort()).toEqual(
      Object.keys(EXPECTED_OWNER_FACETS).sort(),
    );
    for (const key of [
      "production/reserve/r",
      "production/claim/c",
      "production/operation/o",
      "production/completion/o",
      "world/w/entity/durable:o",
      "world/w/profile",
      "world/w/locus/l",
      "population/l/ledger",
      "temporal/state",
    ])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(1);
  });

  it("no generic or later owner exists: no Asset, Inventory, Labor, Logistics, KTI, Actor, Health, Military, Culture or Epistemic owner (Economy is the sixth slice's own IM-06 owner)", () => {
    const names = [...CANONICAL_OWNER_REGISTRY.keys()]
      .filter(
        (n) =>
          n !== "named_actor" &&
          n !== "epistemic_access" &&
          n !== "kti" &&
          n !== "culture" &&
          n !== "culture_adjudication_kernel",
      )
      .join(" ");
    const facets = [...CANONICAL_OWNER_REGISTRY.values()]
      .flatMap((f) => [...f])
      .filter(
        (f) =>
          f !== "actor_profile" &&
          f !== "epistemic_access" &&
          f !== "kti_development" &&
          f !== "culture_social" &&
          // (the exact finite raw-source drawdown slice's World-State Source Condition facet is lawful: WS-003 §4A)
          f !== "world_source_condition",
      )
      .join(" ");
    for (const forbidden of [
      "asset",
      "inventory",
      "labor",
      "movement",
      "kti",
      "health",
      "military",
      "actor",
      "culture",
      "epistemic",
      "source_condition",
    ]) {
      expect(names).not.toContain(forbidden);
      expect(facets).not.toContain(forbidden);
    }
  });

  it("the Production adapter has no writer for Reserve quantity, claims, transformation or output, and the custodian has no adapter at all", () => {
    expect(adapterMethods(ProductionAdapter)).toEqual(expectedAdapterMethods("ProductionAdapter"));
    expect(code("packages/engine/src/world/fallback-custody.ts")).not.toMatch(/\bclass\b/);
    expect(worldFallbackAcceptanceProvider.owner).toBe("world_state");
    expect(productionCompletionProvider.owner).toBe("production");
  });

  it("production code never imports the testkit or names a synthetic owner", () => {
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-(STAGE|CRITERION|CAUSE|POPULATION|PRODUCTION)/);
    }
  });
});

describe("reuse, not fork: IM-02, IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("there is exactly one coordinator, one commit core and no second journal, save, sidecar or recovery identity", () => {
    const classes = walk("packages/engine/src").flatMap((f) =>
      [...code(f).matchAll(/(?:export )?class (\w+)/g)].map((m) => m[1]),
    );
    expect(
      classes.filter((c) => /Coordinator|Scheduler|Journal|Ledger|Store/.test(c!)).sort(),
    ).toEqual(["FilePackageStore", "TemporalCoordinator"]);
    for (const f of PRODUCTION_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /node:fs|\.jsonl|appendFile|writeFile|createFileCampaign|openFileCampaign/,
      );
      expect(text, f).not.toMatch(/new CampaignCore|CampaignCore\(/);
    }
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
  });

  it("Production admission is reached through the one canonical IM-03/IM-11 admission, object registration through the one kernel path, and completion only through the IM-02 coordinator's owner seam", () => {
    const admission = code("packages/engine/src/owners/admission.ts");
    expect(admission).toMatch(/productionGroupCheck\(group, state\)/);
    expect(admission).toMatch(/worldEntityGroupCheck\(group, state\)/);
    expect(code("packages/engine/src/temporal/admission.ts")).toMatch(
      /productionObjectViolation\(o, state, true\)/,
    );
    expect(adapterMethods(TemporalCoordinator)).toEqual(
      expectedAdapterMethods("TemporalCoordinator"),
    );
  });

  it("a completion and an acceptance are published only as their IM-02 stage: admission and load verification apply the one stage rule (identity and the durable transaction authority), built on the existing derived stage identity", () => {
    expect(code("packages/engine/src/production/admission.ts")).toMatch(
      /stageAuthorityViolation\(\s*group,\s*d\.envelope\.close_stage/,
    );
    expect(code("packages/engine/src/world/fallback-custody.ts")).toMatch(
      /stageAuthorityViolation\(\s*group,\s*worldAcceptanceStage/,
    );
    const integrity = code("packages/engine/src/production/integrity.ts");
    expect(integrity).toMatch(/journaledStageViolation\(\s*store,\s*byKey,\s*completionFact/);
    expect(integrity).toMatch(/journaledStageViolation\(\s*store,\s*byKey,\s*entityFact/);
    const admission = code("packages/engine/src/production/admission.ts");
    expect(admission).toMatch(/stageGroupId\(stage\)/);
    expect(admission).toMatch(/stageIntentId\(stage\)/);
    // no new durable record: still no second journal, scheduler or recovery identity
    expect(admission).not.toMatch(/node:fs|setTimeout|Date\.now|new Date|Math\.random/);
  });

  it("the temporal coordinator itself was not changed to know Production", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(
      /production|Production/,
    );
  });
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, cadence or global scan in Production", () => {
  it("the Production modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence/shift/annual pass", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|annualPass|annualTick|globalPass|pollInterval|shiftLoop|productionTick|cadence)\b/;
    for (const f of PRODUCTION_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts", () => {
    for (const f of PRODUCTION_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(PRODUCTION_SOURCES.filter((f) => /listFacts\(/.test(code(f)))).toEqual([
      "packages/engine/src/production/integrity.ts",
    ]);
  });
});

describe("IA-23/IA-24/IA-25 CAL-01, CAL-02/L-50 and CAL-03 stay unresolved: nothing approximate, no labor path, no default", () => {
  it("CAL-01 stays UNCALIBRATED, CAL-02 OPEN_CALIBRATION, CAL-03 NO_ADOPTED_PRODUCTION_NUMBER, L-50 REQUIRES_DECISION_OPEN_CALIBRATION", () => {
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("CAL-01")).toBe("UNCALIBRATED");
    expect(statusOf("CAL-02")).toBe("OPEN_CALIBRATION");
    expect(statusOf("CAL-03")).toBe("NO_ADOPTED_PRODUCTION_NUMBER");
    expect(statusOf("L-50")).toBe("REQUIRES_DECISION_OPEN_CALIBRATION");
    for (const id of ["IA-23", "IA-24", "IA-25"]) {
      expect(register.find((r) => r.id === id)?.evidence).toBeNull();
      expect(register.find((r) => r.id === id)?.partial_evidence).toBeUndefined();
    }
    for (const id of ["IA-23", "IA-24"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
  });

  it("no tolerance, rate, yield, ratio, coefficient, productivity, throughput, capacity, duration default or L_unavailable is declared in the Production sources", () => {
    for (const f of PRODUCTION_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(/\b\w*[tT]olerance\w*\s*[?:=]/);
      expect(text, f).not.toMatch(
        /\b(const|let|var)\s+\w*([tT]olerance|[rR]ate|[yY]ield|[rR]atio|[cC]oefficient|[pP]roductivity|[tT]hroughput|[cC]apacity|[dD]efaultDuration|[lL]abou?r\w*)\b/,
      );
      expect(text, f).not.toMatch(
        /L_unavailable|APPROXIMATE-PARTITION|effective_labor|baseline_labor|flexible_labor|qualification_threshold|marginal_labor/i,
      );
    }
    // the only labor/competence vocabulary is the explicit NON-material Tier A literal
    const contracts = code("packages/contracts/src/production.ts");
    expect(contracts).toContain('labor: z.literal("NON_MATERIAL_EMBEDDED")');
    expect(contracts).toContain('specialist_competence: z.literal("NON_MATERIAL")');
    expect(contracts).not.toMatch(/population_ref|kti_ref|worker|headcount/i);
  });

  it("declares no calibration constant: only structural numerals appear in the Production modules", () => {
    for (const f of PRODUCTION_SOURCES) {
      const numbers = [...code(f).matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      // 0/1/2: indices, versions, counters; 3/4: structural group sizes (start = 3 writes, completion = 4);
      // 5: diagnostic issue-list length (as elsewhere)
      expect(
        numbers.filter((n) => !["0", "1", "2", "3", "4", "5"].includes(n!)),
        f,
      ).toEqual([]);
    }
    expect(code("packages/contracts/src/production.ts")).not.toMatch(
      /z\.number\(\)\.default|\.default\(/,
    );
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("the Production module is exactly the IM-05 Production owner path — no Logistics, Economy, KTI, labor, source-stock, actor, health, culture, epistemic or host layer inside it (Economy is its own later module)", () => {
    expect(readdirSync("packages/engine/src/production").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
    ]);
    // (the seventh slice's World-State entity-transition seam is the one later module of the world directory)
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
    expect(
      readdirSync("packages/engine/src")
        .filter((f) => statSync(join("packages/engine/src", f)).isDirectory())
        .sort(),
    ).toEqual([
      "actor",
      "causal-draw",
      "commit",
      "culture",
      "culture-adjudication",
      "diplomacy",
      "economy",
      "epistemic",
      "gip",
      "kti",
      "logistics",
      "owners",
      "pc-capability",
      "pc-movement",
      "persistence",
      "population",
      "presentation",
      "production",
      "projection",
      "referee",
      "source-drawdown",
      "temporal",
      "world",
    ]);
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
    for (const forbidden of ["migrations/manifests/production.json"])
      expect(existsSync(forbidden)).toBe(false);
  });

  it("the contracts model no movement, transfer, route, source drawdown, regeneration, price, demand, KTI, labor chain or stochastic field", () => {
    const text = code("packages/contracts/src/production.ts").toLowerCase();
    for (const word of [
      "in_transfer",
      "transfer",
      "route",
      "carrier",
      "dispatch",
      "logistics",
      "movement",
      "drawdown",
      "pending_drawdown",
      "source_stock",
      "source_condition",
      "regenerat",
      "depletion",
      "extraction",
      "price",
      "demand",
      "exchange",
      "competence_level",
      "stochastic",
      "random",
      "probabilit",
      "recurrence",
      "tick",
    ]) {
      expect(text, word).not.toContain(word);
    }
  });

  it("there is no Production save, journal, sidecar or second persistence canon: the package format is unchanged", () => {
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
    expect(readdirSync("packages/engine/src/persistence").sort()).toEqual([
      "file-package.ts",
      "fs-ops.ts",
      "store.ts",
    ]);
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-02", "IA-03", "IA-04", "IA-05", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence naming Production tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/Production/);
      expect(row.partial_evidence?.tests.some((t) => /production/.test(t))).toBe(true);
    },
  );
  it("IA-05 evidence is bounded: it names what is not implemented and does not claim whole-engine contention or liveness", () => {
    const scope = register.find((r) => r.id === "IA-05")!.partial_evidence!.scope;
    expect(scope).toMatch(/^Bounded aspect only/);
    expect(scope).toMatch(/Not implemented: whole-engine contention and liveness/);
  });
  it("IA-07, IA-24, IA-27 stay BLOCKED; no whole-engine row was marked complete", () => {
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });
  it("the open-gates snapshot and the Runtime Contract snapshot are byte-identical to the predecessor's: this slice resolves and changes no gate", () => {
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
  });
  it("every open gate stays at its recorded status; PF-6/F-028, provider, deployment and migration stay inactive", () => {
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("CAL-04")).toBe("ACCEPTED_DESIGN_RESIDUAL");
    expect(statusOf("CAL-06")).toBe("NO_ADOPTED_CAP");
    expect(statusOf("CAL-10")).toBe("NOT_ADOPTED");
    expect(statusOf("OB-015")).toBe("DEFERRED_TO_LIVE_MIGRATION_HORIZON");
    expect(statusOf("OB-016")).toBe("OPEN_CODE_ERA_CONFORMANCE");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
  });
});
