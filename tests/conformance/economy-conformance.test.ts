// Conformance evidence for the Economy Demand → Production Request → Realized Access Backbone Foundation (sixth
// slice). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and CAL-01,
// CAL-02/L-50 and CAL-03 stay unresolved.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  ECONOMY_FACT_KINDS,
  ECONOMY_RULE,
  EconomyAdapter,
  TemporalCoordinator,
  WS004_SOURCE,
  economyRealizationProvider,
} from "@immortalis/engine";
import { PACKAGE_FORMAT_VERSION } from "@immortalis/contracts";

interface Lock {
  frozen_sources: { id: string; url: string; native_pin: string; primary_im: string }[];
  incorporated_tranches: { title: string; url: string; native_pin: string }[];
  snapshot_files: Record<string, string>;
}
const lock = JSON.parse(readFileSync("spec/f027/spec-lock.json", "utf8")) as Lock;
type Row = {
  id: string;
  status: string;
  evidence: unknown;
  partial_evidence?: { scope: string; tests: string[] };
};
const register = (
  parse(readFileSync("spec/f027/acceptance-register.yaml", "utf8")) as { rows: Row[] }
).rows;
const gates = (
  parse(readFileSync("spec/f027/open-gates.yaml", "utf8")) as {
    gates: { id: string; status: string }[];
  }
).gates;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
/** Source with comments removed, so that prose explaining a prohibition is not mistaken for code. */
const code = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const ECONOMY_SOURCES = [
  ...walk("packages/engine/src/economy"),
  "packages/contracts/src/economy.ts",
];

describe("IA-01 source/version fidelity (Economy registration aspect)", () => {
  it("every Economy kind cites WS-004 at its exact spec-locked pin and the IM-06 lowering", () => {
    const ws004 = lock.frozen_sources.find((s) => s.id === "WS-004")!;
    expect(WS004_SOURCE).toEqual({ artifact: ws004.url, native_pin: ws004.native_pin });
    expect(ws004.native_pin).toBe("2026-09-24T11:45:02.825Z");
    expect(ws004.primary_im).toBe("IM-06");
    for (const kind of ECONOMY_FACT_KINDS) {
      expect(kind.rule).toEqual(ECONOMY_RULE);
      expect(kind.rule.artifact).toBe(ws004.url);
      expect(kind.rule.native_pin).toBe(ws004.native_pin);
      expect(kind.im).toBe("IM-06");
      expect(kind.rule.supersedes).toBeNull();
    }
    const lineage = ECONOMY_RULE.authority_lineage.join("\n");
    expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
  });

  it("the Economy rule names the WS-004 clauses the state relies on", () => {
    for (const c of [
      "§2.1 Economy-owned state",
      "§2.2 Explicit non-ownership",
      "§5.2 Demand Envelope",
      "§5.3 Carrier Cohort",
      "§8 Effective Demand and Allocation Claims (purchasing power cannot create absent goods)",
      "§11 Economic Claim / Obligation",
      "§20 Commitment and Conservation (Economy never holds a physical reservation)",
      "§21 Realized Flow / Delta",
      "§27.1 Population / Cohort",
      "§27.2 Production / Resources (demand does not create supply; realized output may not feed the same pre-commit availability test)",
      "§27.13 Temporal (no universal economic tick)",
      "§27.14 R-T1 / Cycle rule",
    ]) {
      expect(ECONOMY_RULE.clause).toContain(c);
    }
  });
});

describe("IA-03 owner exclusivity: Economy owns the demand, its request and realized access only", () => {
  it("registers exactly one new owner, Economy, with ONE facet and three exclusive create-only key spaces", () => {
    expect(ECONOMY_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["economy_demand", "economy", "economy_state", "SEALED"],
      ["economy_request", "economy", "economy_state", "SEALED"],
      ["economy_realization", "economy", "economy_state", "SEALED"],
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.keys()].sort()).toEqual([
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
      "role_registry",
      "temporal_kernel",
      "world_state",
    ]);
    for (const key of [
      "economy/demand/d",
      "economy/request/request:d",
      "economy/realization/d",
      "production/operation/request:d",
      "world/w/entity/durable:request:d",
      "population/l/ledger",
      "temporal/state",
    ])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(1);
  });

  it("no generic or later owner exists: no Asset, Inventory, Market, Exchange, Currency, Credit, Holding, Labor, Logistics, KTI, Actor, Health, Military, Culture or Epistemic owner", () => {
    const names = [...CANONICAL_OWNER_REGISTRY.keys()]
      .filter((n) => n !== "named_actor" && n !== "epistemic_access" && n !== "kti")
      .join(" ");
    const facets = [...CANONICAL_OWNER_REGISTRY.values()]
      .flatMap((f) => [...f])
      .filter((f) => f !== "actor_profile" && f !== "epistemic_access" && f !== "kti_development")
      .join(" ");
    for (const forbidden of [
      "asset",
      "inventory",
      "market",
      "exchange",
      "currency",
      "credit",
      "holding",
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

  it("the Economy adapter has no satisfaction, supply, stock or amendment writer, and realized access is only an owner operation", () => {
    expect(
      Object.getOwnPropertyNames(EconomyAdapter.prototype)
        .filter((m) => m !== "constructor")
        .sort(),
    ).toEqual(["access", "demand", "issueDemand", "realization", "request"]);
    expect(economyRealizationProvider.owner).toBe("economy");
    expect(economyRealizationProvider.operation).toBe("economy-record-realized-access");
  });

  it("Economy is the third stage of the ONE existing operation object: no second object, boundary, coordinator or scheduler", () => {
    const declaration = code("packages/engine/src/production/declaration.ts");
    expect(declaration).toMatch(/economyRealizationDeclaration\(op, locality\)/);
    expect(declaration).toMatch(/dependencies: economy \? \[completion, acceptance, economy\]/);
    expect(code("packages/engine/src/economy/declaration.ts")).not.toMatch(
      /next_boundary|boundary_id|registerObject|object_id/,
    );
    const classes = walk("packages/engine/src").flatMap((f) =>
      [...code(f).matchAll(/(?:export )?class (\w+)/g)].map((m) => m[1]),
    );
    expect(
      classes.filter((c) => /Coordinator|Scheduler|Journal|Ledger|Store/.test(c!)).sort(),
    ).toEqual(["FilePackageStore", "TemporalCoordinator"]);
  });

  it("production code never imports the testkit or names a synthetic owner, and Economy needs none", () => {
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/@immortalis\/testkit/);
    }
    for (const f of ECONOMY_SOURCES) expect(code(f), f).not.toMatch(/SYNTHETIC/);
  });
});

describe("reuse, not fork: IM-02, IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("Economy admission is reached through the one canonical IM-03/IM-11 admission; the temporal coordinator was not changed to know Economy or Production", () => {
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /economyGroupCheck\(group, state\)/,
    );
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(
      /economy|Economy|production|Production/,
    );
    expect(
      Object.getOwnPropertyNames(TemporalCoordinator.prototype)
        .filter((m) => m !== "constructor")
        .sort(),
    ).toEqual([
      "advance",
      "boundaryIndex",
      "continueRemainder",
      "establishCanonicalTime",
      "object",
      "registerObject",
      "state",
      "transaction",
    ]);
  });

  it("realized access is published only as its IM-02 stage: admission and load verification apply the one existing stage rule (identity and the durable transaction authority)", () => {
    expect(code("packages/engine/src/economy/admission.ts")).toMatch(
      /stageAuthorityViolation\(\s*group,\s*economyRealizationStage\(/,
    );
    expect(code("packages/engine/src/economy/integrity.ts")).toMatch(
      /journaledStageViolation\(\s*store,\s*byKey,\s*zf,\s*economyRealizationStage/,
    );
    expect(code("packages/engine/src/economy/admission.ts")).not.toMatch(
      /node:fs|setTimeout|Date\.now|new Date|Math\.random/,
    );
  });

  it("there is no Economy persistence, journal, sidecar, save or recovery identity: the package format is unchanged", () => {
    for (const f of ECONOMY_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /node:fs|\.jsonl|appendFile|writeFile|createFileCampaign|openFileCampaign/,
      );
      expect(text, f).not.toMatch(/new CampaignCore|CampaignCore\(/);
    }
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
    expect(readdirSync("packages/engine/src/persistence").sort()).toEqual([
      "file-package.ts",
      "fs-ops.ts",
      "store.ts",
    ]);
  });

  it("Production consumes an Economy request through its one existing start path: only an Economy-registered request kind is admitted besides an unregistered source's own", () => {
    const admission = code("packages/engine/src/production/admission.ts");
    expect(admission).toMatch(/requestKind !== "economy_request"/);
    expect(readdirSync("packages/engine/src/production").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
    ]);
  });
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, cadence, refresh or global scan in Economy", () => {
  it("the Economy modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence/refresh/market pass", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|annualPass|annualTick|globalPass|pollInterval|economyTick|priceRefresh|marketPass|cadence)\b/;
    for (const f of ECONOMY_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts", () => {
    for (const f of ECONOMY_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(ECONOMY_SOURCES.filter((f) => /listFacts\(/.test(code(f)))).toEqual([
      "packages/engine/src/economy/integrity.ts",
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
  });

  it("no price, rate, yield, ratio, coefficient, weight, elasticity, scarcity score, tolerance or default is declared in the Economy sources", () => {
    for (const f of ECONOMY_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(/\b\w*[tT]olerance\w*\s*[?:=]/);
      expect(text, f).not.toMatch(
        /\b(const|let|var)\s+\w*([tT]olerance|[rR]ate|[yY]ield|[rR]atio|[cC]oefficient|[pP]rice|[wW]eight|[eE]lasticity|[sS]carcity|[wW]ealth|[pP]rosperity|[dD]efault\w*)\b/,
      );
      expect(text, f).not.toMatch(
        /L_unavailable|APPROXIMATE-PARTITION|effective_labor|baseline_labor|flexible_labor|qualification_threshold|marginal_labor|price_level|market_integration|trade_power/i,
      );
    }
    expect(code("packages/contracts/src/economy.ts")).not.toMatch(
      /z\.number\(\)\.default|\.default\(/,
    );
  });

  it("declares no calibration constant: only structural numerals appear in the Economy modules", () => {
    for (const f of ECONOMY_SOURCES) {
      const numbers = [...code(f).matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      // 0/1/2: versions, indices and group sizes (issuance = 2 writes); 5: diagnostic issue-list length (as elsewhere)
      expect(
        numbers.filter((n) => !["0", "1", "2", "5"].includes(n!)),
        f,
      ).toEqual([]);
    }
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("the Economy module is exactly the IM-06 Demand → Request → Realized Access path — no market, exchange, currency, credit, holding, Logistics, KTI, labor, actor, health, culture, epistemic or host layer", () => {
    expect(readdirSync("packages/engine/src/economy").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
    ]);
    expect(
      readdirSync("packages/engine/src")
        .filter((f) => statSync(join("packages/engine/src", f)).isDirectory())
        .sort(),
    ).toEqual([
      "actor",
      "commit",
      "diplomacy",
      "economy",
      "epistemic",
      "gip",
      "kti",
      "logistics",
      "owners",
      "persistence",
      "population",
      "production",
      "temporal",
      "world",
    ]);
    expect(readFileSync("packages/protocol/src/index.ts", "utf8")).not.toMatch(/export (?!\{\})/);
  });

  it("the Economy contracts model no movement, transfer, route, delivery, price, currency, credit, market, exchange, title, holding, inventory, reservation, entitlement, purchasing capability, KTI, labor or stochastic field", () => {
    // the one literal that NAMES what an allocation is not is removed before scanning identifiers
    const text = code("packages/contracts/src/economy.ts")
      .replace("ECONOMIC_ALLOCATION_CLAIM_NOT_STOCK_TITLE_OR_RESERVATION", "")
      .toLowerCase();
    for (const word of [
      "in_transfer",
      "transfer",
      "route",
      "corridor",
      "dispatch",
      "logistics",
      "movement",
      "delivery_time",
      "price",
      "currency",
      "money",
      "credit",
      "debt",
      "market",
      "exchange",
      "title",
      "holder",
      "holding",
      "inventory",
      "reservation",
      "reserved",
      "entitlement",
      "purchasing",
      "preference",
      "competence",
      "labor",
      "stochastic",
      "random",
      "probabilit",
      "recurrence",
      "tick",
      "members",
      "headcount",
    ]) {
      expect(text, word).not.toContain(word);
    }
  });

  it("the Economy contract references Population by identity and pinned version only: no Population state schema is redefined", () => {
    const text = code("packages/contracts/src/economy.ts");
    expect(text).not.toMatch(
      /PopulationBasisSchema|CohortFactSchema|PopulationUnitSchema|CohortResultSchema/,
    );
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-02", "IA-03", "IA-04", "IA-05", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence naming Economy tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/Economy/);
      expect(row.partial_evidence?.tests.some((t) => /economy/.test(t))).toBe(true);
    },
  );
  it("IA-05 evidence stays bounded: it names what is not implemented and claims no whole-engine contention, allocation mechanism or liveness", () => {
    const scope = register.find((r) => r.id === "IA-05")!.partial_evidence!.scope;
    expect(scope).toMatch(/^Bounded aspect only/);
    expect(scope).toMatch(/Not implemented: whole-engine contention and liveness/);
    expect(scope).toMatch(/Economy/);
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
