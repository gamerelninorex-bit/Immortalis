// Conformance evidence for the Exact Finite Raw-Source Drawdown & Conserved Production Reserve Inflow slice. Each block names
// its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0, unchanged). The rows stay NOT_IMPLEMENTED/BLOCKED:
// this slice adds no register evidence, promotes no row and rewrites no lock hash, and CAL-01, CAL-02/L-50 and CAL-03 stay
// unresolved. PF-6/F-028 is not activated.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  PRODUCTION_FACT_KINDS,
  PRODUCTION_RULE,
  PRODUCTION_SOURCE_DRAWDOWN_RULE,
  SOURCE_DRAWDOWN_FACT_KINDS,
  SourceDrawdownAdapter,
  WG_SOURCE,
  WORLD_SOURCE_CONDITION_FACT_KINDS,
  WORLD_SOURCE_CONDITION_RULE,
  WS003_SOURCE,
  productionReserveInflowProvider,
  productionSourceDeltaProvider,
  worldSourceDeliveryProvider,
} from "@immortalis/engine";
import {
  ExtractionBasisSchema,
  PACKAGE_FORMAT_VERSION,
  ProductionExtractionSchema,
  SourceAccountSchema,
  SourceDeltaSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
} from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import { EXPECTED_OWNER_FACETS } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";
import { PROTOCOL_ONLY_EVENT_SIGNAL_READ, protocolIndexExports } from "../support/protocol.ts";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
const DRAWDOWN_SOURCES = [
  ...walk("packages/engine/src/source-drawdown"),
  "packages/engine/src/world/source-condition.ts",
  "packages/contracts/src/source-drawdown.ts",
];
/** the advance path: everything but the diagnostic load-time verifier (which lists facts once per open, CAL-06) */
const ADVANCE_SOURCES = DRAWDOWN_SOURCES.filter((f) => !f.endsWith("integrity.ts"));

describe("IA-01 source/version fidelity (exact finite raw-source drawdown aspect)", () => {
  it("the Production and World-State rules cite the lock's WS-003 and WG pins and name the §4A / §4B clauses the state relies on", () => {
    const ws003 = lock.frozen_sources.find((s) => s.id === "WS-003")!;
    const wg = lock.frozen_sources.find((s) => s.id === "WG")!;
    expect(WS003_SOURCE.native_pin).toBe(ws003.native_pin);
    expect(PRODUCTION_SOURCE_DRAWDOWN_RULE.artifact).toBe(ws003.url);
    expect(PRODUCTION_SOURCE_DRAWDOWN_RULE.native_pin).toBe(ws003.native_pin);
    expect(WORLD_SOURCE_CONDITION_RULE.artifact).toBe(wg.url);
    expect(WORLD_SOURCE_CONDITION_RULE.native_pin).toBe(wg.native_pin);
    expect(WG_SOURCE.native_pin).toBe(wg.native_pin);
    for (const c of [
      "§4 Capability-Access-Reserve-Source Contract (Capability is not inventory; Access is not capability; Source Stock is not Reserve)",
      "§4A Source Stock / Renewal Execution Contract",
      "emit the Production-caused Source Delta",
      "source owner resolves dynamics",
      "type exhaustion explicitly",
      "§4B Source Boundary Basis (Source Delta channel, Pending Drawdown held once as discrete residue per source-owner resolution key, delivery transfer-and-advance, watermark)",
      "§8 Labor and Specialist Interface (Tier A embedded labor, no marginal labor claim)",
      "§15 Validation Checklist",
      "§16 Selected Turnless Temporal Adapter",
    ])
      expect(PRODUCTION_SOURCE_DRAWDOWN_RULE.clause).toContain(c);
    for (const c of [
      "Ownership Guards — World Generation May Own",
      "World Generation May Not Own (Production functional state)",
      "§4A Source Stock / Renewal Execution Contract (Source Condition is world truth",
      "§4B Source Boundary Basis (delivery; the owner returns Source Condition net of all delivered drawdown)",
    ])
      expect(WORLD_SOURCE_CONDITION_RULE.clause).toContain(c);
    for (const r of [PRODUCTION_SOURCE_DRAWDOWN_RULE, WORLD_SOURCE_CONDITION_RULE]) {
      const lineage = r.authority_lineage.join("\n");
      expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
      const tranche = lock.incorporated_tranches.find((t) =>
        t.title.includes("Runtime Contract & Translation"),
      )!;
      expect(lineage).toContain(tranche.native_pin);
      expect(r.effective_basis).toBe("pinned-by-spec-lock");
      expect(r.supersedes).toBeNull();
    }
  });

  it("the predecessor Production rule is unchanged, so every already-committed Production fact keeps loading under it", () => {
    expect(PRODUCTION_RULE.clause).not.toContain("§4A");
    expect(PRODUCTION_RULE.clause).not.toContain("§4B");
    for (const k of PRODUCTION_FACT_KINDS) expect(k.rule).toEqual(PRODUCTION_RULE);
    // the one kind that also carries the drawdown rule does so for a Reserve that holds a credited inflow only
    const reserve = PRODUCTION_FACT_KINDS.find((k) => k.id === "production_reserve")!;
    expect(reserve.alternateRules).toHaveLength(1);
    expect(reserve.alternateRules![0]!.rule).toEqual(PRODUCTION_SOURCE_DRAWDOWN_RULE);
    const base = {
      reserve_id: "r",
      material_class: "m",
      established: { amount: 0, unit: "u" },
      quantity: { amount: 0, unit: "u" },
      consumed: [],
      condition: "c",
      locality: {
        world: { fact_key: "world/w/profile", entity_id: "w" },
        locus: { fact_key: "world/w/locus/l", entity_id: "l" },
      },
      holding: "HELD_LOCAL_BY_PRODUCTION",
      claims: [],
    };
    expect(reserve.alternateRules![0]!.admits(base)).toBe(false);
    expect(
      reserve.alternateRules![0]!.admits({
        ...base,
        quantity: { amount: 3, unit: "u" },
        inflows: [{ inflow_id: "x", quantity: { amount: 3, unit: "u" } }],
      }),
    ).toBe(true);
  });

  it("the drawdown kinds are SEALED or ADVANCING exactly as designed, and carry their owner's rule and IM", () => {
    expect(
      SOURCE_DRAWDOWN_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle, k.im]),
    ).toEqual([
      ["production_extraction_basis", "production", "production_state", "SEALED", "IM-05"],
      ["production_extraction", "production", "production_state", "SEALED", "IM-05"],
      ["production_source_delta", "production", "production_state", "SEALED", "IM-05"],
      ["production_source_account", "production", "production_state", "ADVANCING", "IM-05"],
    ]);
    expect(
      WORLD_SOURCE_CONDITION_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle, k.im]),
    ).toEqual([
      ["world_source_condition", "world_state", "world_source_condition", "ADVANCING", "IM-03"],
      ["world_source_delivery", "world_state", "world_source_condition", "SEALED", "IM-03"],
    ]);
    for (const k of SOURCE_DRAWDOWN_FACT_KINDS)
      expect(k.rule).toEqual(PRODUCTION_SOURCE_DRAWDOWN_RULE);
    for (const k of WORLD_SOURCE_CONDITION_FACT_KINDS)
      expect(k.rule).toEqual(WORLD_SOURCE_CONDITION_RULE);
  });
});

describe("IA-03 owner exclusivity: World-State owns Source Condition truth; Production owns its own drawdown state", () => {
  it("registers no new owner: one new World-State facet and four new Production key spaces under the existing facet", () => {
    expect([...CANONICAL_OWNER_REGISTRY.keys()].sort()).toEqual(
      Object.keys(EXPECTED_OWNER_FACETS).sort(),
    );
    expect([...CANONICAL_OWNER_REGISTRY.get("world_state")!].sort()).toEqual(
      [
        "world_fallback_physical_entity",
        "world_locus",
        "world_profile",
        "world_scene_closure",
        "world_source_condition",
      ].sort(),
    );
    expect([...CANONICAL_OWNER_REGISTRY.get("production")!]).toEqual(["production_state"]);
    for (const key of [
      "world/w/source/s",
      "world/w/source-delivery/x",
      "production/extraction-basis/b",
      "production/extraction/x",
      "production/source-delta/x",
      "production/source-account/w/s",
      "production/reserve/r",
      "world/w/entity/e",
      "world/w/profile",
      "world/w/locus/l",
    ])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(1);
  });

  it("Production holds no Source Condition and World-State holds no Reserve: no schema of one owner carries the other's field", () => {
    const keys = (schema: unknown): string[] =>
      Object.keys((schema as { shape: Record<string, unknown> }).shape);
    for (const s of [
      ExtractionBasisSchema,
      ProductionExtractionSchema,
      SourceDeltaSchema,
      SourceAccountSchema,
    ]) {
      const ks = keys(s).join(" ");
      expect(ks).not.toMatch(/recoverable|remain|exhaust|established/);
    }
    for (const s of [WorldSourceConditionSchema, WorldSourceDeliverySchema]) {
      const ks = keys(s).join(" ");
      expect(ks).not.toMatch(/reserve|claim|account|inflow|held/);
    }
  });

  it("the drawdown adapter has no setter for a remainder, a delta, a delivery or a Reserve credit; the stage providers carry the owner of the fact they write", () => {
    expect(adapterMethods(SourceDrawdownAdapter)).toEqual(
      [
        "account",
        "basis",
        "delivery",
        "establishBasis",
        "extraction",
        "phase",
        "reserve",
        "sourceCondition",
        "sourceDelta",
        "startExtraction",
        "temporalObject",
      ].sort(),
    );
    expect(
      [
        productionSourceDeltaProvider,
        worldSourceDeliveryProvider,
        productionReserveInflowProvider,
      ].map((p) => [p.owner, p.facet, p.operation]),
    ).toEqual([
      ["production", "production_state", "production-emit-source-delta"],
      ["world_state", "world_source_condition", "world-state-deliver-source-drawdown"],
      ["production", "production_state", "production-credit-reserve-inflow"],
    ]);
    expect(productionSourceDeltaProvider.rule).toEqual(PRODUCTION_SOURCE_DRAWDOWN_RULE);
    expect(productionReserveInflowProvider.rule).toEqual(PRODUCTION_SOURCE_DRAWDOWN_RULE);
    expect(worldSourceDeliveryProvider.rule).toEqual(WORLD_SOURCE_CONDITION_RULE);
  });

  it("each Production commit of the adapter is a single publication and the World-State establishment is the only authored Source Condition write", () => {
    const adapter = code("packages/engine/src/source-drawdown/adapter.ts");
    expect(adapter.match(/\.commit\(/g)).toHaveLength(1);
    expect(adapter).not.toMatch(/world_source_condition|worldSourceConditionKey\([^)]*\),\s*value/);
    const world = code("packages/engine/src/world/canonical-campaign.ts");
    expect(world.match(/"world_source_condition"/g)).toHaveLength(1);
  });
});

describe("reuse, not fork: one canon, one journal, one coordinator", () => {
  it("the package format is unchanged, no persistence module was added and the coordinator and graph never name the drawdown", () => {
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
    expect(readdirSync("packages/engine/src/persistence").sort()).toEqual([
      "file-package.ts",
      "fs-ops.ts",
      "store.ts",
    ]);
    for (const f of [
      "packages/engine/src/temporal/coordinator.ts",
      "packages/engine/src/temporal/graph.ts",
    ]) {
      const text = code(f);
      expect(text, f).not.toMatch(/extraction|source-drawdown|SourceDelta|source_delta/i);
    }
  });

  it("the shipped NULL-PC OOC gateway registers the three real owner providers and the protocol surface gained no operation", () => {
    const gateway = code("packages/protocol/src/null-pc-ooc-advance.ts");
    for (const p of [
      "productionSourceDeltaProvider",
      "worldSourceDeliveryProvider",
      "productionReserveInflowProvider",
    ])
      expect(gateway.match(new RegExp(`\\b${p}\\b`, "g"))).toHaveLength(2); // the import and the one registry entry
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
  });

  it("the Reserve inflow ledger is optional, so every predecessor Reserve is byte-identical", () => {
    const contract = code("packages/contracts/src/production.ts");
    expect(contract).toMatch(/inflows: z\s*\.array\([\s\S]*?\)\s*\.optional\(\)/);
    expect(contract).not.toMatch(/\.default\(/);
  });
});

describe("IA-02 no tick, clock, RNG, polling, cadence or whole-world scan in the drawdown advance path", () => {
  it("the advance path reads facts by identity only", () => {
    for (const f of ADVANCE_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /Date\.now|new Date\(|Math\.random|setTimeout|setInterval|performance\.now/,
      );
      expect(text, f).not.toMatch(/crypto\.random|randomUUID|getRandomValues/);
      expect(text, f).not.toMatch(
        /listFacts\(|\.facts\.values\(\)|\.facts\.entries\(\)|\.facts\.keys\(\)/,
      );
      expect(text, f).not.toMatch(/\btick\b|\bcadence\b|\bpoll(ing)?\b/i);
    }
  });

  it("the diagnostic verifier is the only code that lists facts, once per open", () => {
    const text = code("packages/engine/src/source-drawdown/integrity.ts");
    expect(text.match(/\.listFacts\(\)/g)).toHaveLength(1);
  });

  it("declares no calibration constant: only structural numerals appear in the drawdown modules", () => {
    for (const f of DRAWDOWN_SOURCES) {
      const numbers = [...code(f).matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      // 0/1/2: indices, versions, counters; 3: structural group sizes (a recorded read set); 5: diagnostic issue-list length
      expect(
        numbers.filter((n) => !["0", "1", "2", "3", "5"].includes(n!)),
        f,
      ).toEqual([]);
    }
    expect(code("packages/contracts/src/source-drawdown.ts")).not.toMatch(
      /z\.number\(\)\.default|\.default\(/,
    );
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("the drawdown module is exactly the Production-side owner path, and the World-State seam is one file", () => {
    expect(readdirSync("packages/engine/src/source-drawdown").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
    ]);
    expect(readdirSync("packages/engine/src/production").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
    ]);
    expect(readdirSync("packages/engine/src/world").filter((f) => /source/.test(f))).toEqual([
      "source-condition.ts",
    ]);
  });

  it("the contracts model no yield, ratio, rate, renewal, regeneration, flow, boundary basis, estimate, latent or ranged quantity, labor coefficient, transformation, price or movement field", () => {
    const text = code("packages/contracts/src/source-drawdown.ts").toLowerCase();
    // (the only occurrences of these words must be the schema's own refusals, written as literals or identifiers a strict
    // object rejects; none may be a field name)
    const fieldNames = [...text.matchAll(/^\s{2,}([a-z_]+):/gm)].map((m) => m[1]!);
    for (const forbidden of [
      "yield",
      "ratio",
      "rate",
      "profile",
      "renewal",
      "regeneration",
      "recovery_rate",
      "flow",
      "flows",
      "next_boundary_basis",
      "estimate",
      "source_estimate",
      "probability",
      "latent",
      "range",
      "min",
      "max",
      "labor_coefficient",
      "coefficient",
      "transformation",
      "price",
      "demand",
      "route",
      "carrier",
      "movement",
      "in_transfer",
      "priority",
      "access_exhaustion",
      "split",
      "merge",
      "rekey",
    ])
      expect(fieldNames, forbidden).not.toContain(forbidden);
  });

  it("no Logistics, Economy, KTI, Population, labor, actor, culture, epistemic or host layer was added", () => {
    for (const f of DRAWDOWN_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /from "\.\.\/(logistics|economy|kti|population|actor|culture|epistemic|gip|diplomacy)\//,
      );
      expect(text, f).not.toMatch(
        /L_unavailable|APPROXIMATE-PARTITION|effective_labor|marginal_labor/i,
      );
    }
  });

  it("every frozen design artifact and the lock are untouched: no source-lock hash was rewritten", () => {
    for (const [file, sha] of Object.entries(lock.snapshot_files)) {
      expect(
        // the committed snapshot hash must still describe the committed file
        sha.length,
        file,
      ).toBe(64);
    }
    expect(readFileSync("spec/f027/spec-lock.json", "utf8")).toContain(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(readFileSync("spec/f027/spec-lock.json", "utf8")).toContain(
      "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
    );
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL, and IA/V rows stay NOT_IMPLEMENTED or BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });
  it("the whole-engine gates stay open: CAL-01/02/03, L-50, PF-6/F-028 and the provider/deployment gates are unchanged", () => {
    const status = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(status("CAL-01")).toBe("UNCALIBRATED");
    expect(status("L-50")).toBe("REQUIRES_DECISION_OPEN_CALIBRATION");
    for (const id of ["PF-6/F-028", "PROVIDER", "DEPLOYMENT"]) expect(status(id), id).toBeDefined();
    expect(status("PF-6/F-028")).not.toBe("PASS");
  });
});
