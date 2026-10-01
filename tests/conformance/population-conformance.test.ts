// Conformance evidence for the Population & Cohort Reconciliation Backbone Foundation (fourth slice).
// Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and
// CAL-01 / CAL-02 stay unresolved.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  PopulationAdapter,
  POPULATION_FACT_KINDS,
  POPULATION_RULE,
  TemporalCoordinator,
  WS001_SOURCE,
  WS015_SOURCE,
  populationStageProvider,
} from "@immortalis/engine";
import { PACKAGE_FORMAT_VERSION } from "@immortalis/contracts";

interface Lock {
  frozen_sources: { id: string; url: string; native_pin: string; primary_im: string }[];
  incorporated_tranches: { title: string; url: string; native_pin: string }[];
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
const POPULATION_SOURCES = [
  ...walk("packages/engine/src/population"),
  "packages/contracts/src/population.ts",
];

describe("IA-01 source/version fidelity (Population registration aspect)", () => {
  it("every Population kind cites WS-001 at its exact spec-locked pin and the IM-04 lowering", () => {
    const ws001 = lock.frozen_sources.find((s) => s.id === "WS-001")!;
    const ws015 = lock.frozen_sources.find((s) => s.id === "WS-015")!;
    expect(WS001_SOURCE).toEqual({ artifact: ws001.url, native_pin: ws001.native_pin });
    expect(WS015_SOURCE).toEqual({ artifact: ws015.url, native_pin: ws015.native_pin });
    expect(ws001.primary_im).toBe("IM-04");
    expect(ws015.primary_im).toBe("IM-04");
    for (const kind of POPULATION_FACT_KINDS) {
      expect(kind.rule).toEqual(POPULATION_RULE);
      expect(kind.rule.artifact).toBe(ws001.url);
      expect(kind.rule.native_pin).toBe(ws001.native_pin);
      expect(kind.im).toBe("IM-04");
      expect(kind.rule.supersedes).toBeNull();
    }
  });

  it("the governing rule names the WS-001 / WS-015 clauses the state relies on, and F-017's PCB-01 pin", () => {
    const { clause, authority_lineage } = POPULATION_RULE;
    for (const c of [
      "§1 Resident Population Conservation",
      "§2 Residence, Presence, Labor, Burden distinct",
      "§29B Externally Qualified Cohort Views",
      "§32 ordinary reconciliation close and PCB-01",
      "WS-015 §III Persistent Cohort Reference Contract",
      "§IV Burden Locus",
      "§VII Single-Basis Derived-View Composition",
      "§VIII Temporal-Read Cut",
      "§X Overlap and Non-Additivity",
    ]) {
      expect(clause).toContain(c);
    }
    const lineage = authority_lineage.join("\n");
    expect(lineage).toContain(WS015_SOURCE.artifact);
    expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 PCB-01 conformance pin
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
  });
});

describe("IA-03 owner exclusivity: Population is the sole Unit/Count custodian and nothing else was added", () => {
  it("registers exactly one new owner, Population, with ONE facet and three exclusive key spaces", () => {
    expect(POPULATION_FACT_KINDS.map((k) => [k.id, k.owner, k.facet])).toEqual([
      ["population_ledger", "population", "population_state"],
      ["population_close", "population", "population_state"],
      ["population_cohort", "population", "population_state"],
    ]);
    // (the fifth slice's four Production kinds and one World-State fallback kind bring the registry to 16; the
    // sixth slice's three Economy kinds bring it to 19; the seventh slice's one World-State entity-transition kind
    // brings it to 20; the transaction-authority repair's one IM-02 kernel kind brings it to 21)
    // (the eighth slice's three Logistics kinds bring the registry to 24)
    expect(ALL_FACT_KINDS).toHaveLength(36);
    expect([...CANONICAL_OWNER_REGISTRY.keys()].sort()).toEqual([
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
    const probes = [
      "population/l/ledger",
      "population/l/close",
      "population/l/cohort/c",
      "temporal/state",
      "world/w/profile",
    ];
    for (const key of probes)
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key))).toHaveLength(1);
  });

  it("no other Population-facing substantive owner exists: no labor, health, military, actor, culture or epistemic owner (Production is the fifth slice's own IM-05 owner and Economy the sixth slice's own IM-06 owner)", () => {
    const names = [...CANONICAL_OWNER_REGISTRY.keys()]
      .filter((n) => n !== "named_actor" && n !== "epistemic_access" && n !== "kti")
      .join(" ");
    for (const forbidden of [
      "labor",
      "health",
      "military",
      "actor",
      "culture",
      "epistemic",
      "resource",
      "kti",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("the adapter has no ledger, count or Cohort-result writer, and no retire/rebind/registration mechanism", () => {
    const methods = Object.getOwnPropertyNames(PopulationAdapter.prototype).filter(
      (m) => m !== "constructor",
    );
    expect(methods.sort()).toEqual([
      "close",
      "cohort",
      "cohortView",
      "establishLedger",
      "instantiateCohort",
      "ledger",
    ]);
    expect(
      methods.filter((m) => /set|update|write|retire|rebind|register|cancel/i.test(m)),
    ).toEqual([]);
  });

  it("production code never imports the testkit or names a synthetic owner", () => {
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-(STAGE|CRITERION|CAUSE|POPULATION)/);
    }
  });
});

describe("reuse, not fork: IM-02, IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("there is exactly one coordinator, one commit core and no second journal, save, sidecar or recovery identity", () => {
    const engine = walk("packages/engine/src");
    const classes = engine.flatMap((f) =>
      [...code(f).matchAll(/(?:export )?class (\w+)/g)].map((m) => m[1]),
    );
    expect(
      classes.filter((c) => /Coordinator|Scheduler|Journal|Ledger|Store/.test(c!)).sort(),
    ).toEqual(["FilePackageStore", "TemporalCoordinator"]);
    for (const f of walk("packages/engine/src/population")) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /node:fs|\.jsonl|appendFile|writeFile|createFileCampaign|openFileCampaign/,
      );
      expect(text, f).not.toMatch(/new CampaignCore|CampaignCore\(/);
    }
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
    const pkg = code("packages/engine/src/persistence/file-package.ts");
    expect(
      [...pkg.matchAll(/const \w+ = "[^"]*\.(jsonl|json|db|sqlite)"/g)].map((m) => m[0]),
    ).toEqual(['const MANIFEST = "manifest.json"', 'const JOURNAL = "journal.jsonl"']);
  });

  it("Population admission is reached through the one canonical IM-03/IM-11 admission; reconciliation runs only through the IM-02 coordinator's owner seam", () => {
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /populationGroupCheck\(group, state\)/,
    );
    expect(populationStageProvider.owner).toBe("population");
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
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, annual pass or global scan in Population", () => {
  it("the Population modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|annualPass|annualTick|globalPass|pollInterval)\b/;
    for (const f of POPULATION_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts", () => {
    for (const f of POPULATION_SOURCES) {
      expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    }
    const listers = POPULATION_SOURCES.filter((f) => /listFacts\(/.test(code(f)));
    expect(listers).toEqual(["packages/engine/src/population/integrity.ts"]);
  });
});

describe("IA-23/IA-24 CAL-01 and CAL-02 stay unresolved: nothing approximate, no labor default", () => {
  it("CAL-01 stays UNCALIBRATED, CAL-02 stays OPEN_CALIBRATION; IA-23 and IA-24 stay BLOCKED with no evidence", () => {
    expect(gates.find((g) => g.id === "CAL-01")?.status).toBe("UNCALIBRATED");
    expect(gates.find((g) => g.id === "CAL-02")?.status).toBe("OPEN_CALIBRATION");
    for (const id of ["IA-23", "IA-24"]) {
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
      expect(register.find((r) => r.id === id)?.evidence).toBeNull();
      expect(register.find((r) => r.id === id)?.partial_evidence).toBeUndefined();
    }
  });

  it("no tolerance, rate, coefficient, productivity, capacity or L_unavailable is declared in the Population sources", () => {
    for (const f of POPULATION_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(/\b\w*[tT]olerance\w*\s*[?:=]/);
      expect(text, f).not.toMatch(
        /\b(const|let|var)\s+\w*([tT]olerance|[rR]ate|[cC]oefficient|[pP]roductivity|[cC]apacity|[lL]abou?r\w*)\b/,
      );
      expect(text, f).not.toMatch(
        /L_unavailable|APPROXIMATE-PARTITION|effective_labor|baseline_labor|flexible_labor/i,
      );
    }
    expect(readFileSync("packages/contracts/src/population.ts", "utf8")).toContain(
      'semantics: z.literal("EXACT")',
    );
  });

  it("declares no calibration constant: only structural numerals appear in the Population modules", () => {
    for (const f of POPULATION_SOURCES) {
      const numbers = [...code(f).matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      // 0/1/2: indices, versions and counters; 5: diagnostic issue-list length (as elsewhere)
      expect(
        numbers.filter((n) => !["0", "1", "2", "5"].includes(n!)),
        f,
      ).toEqual([]);
    }
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("the engine's Population module is exactly the IM-04 owner path — no labor, logistics, KTI, actor, health, culture, epistemic or host layer inside it (Production and Economy are their own later modules)", () => {
    expect(readdirSync("packages/engine/src/population").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "barrier.ts",
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
    for (const forbidden of ["migrations/manifests/population.json"])
      expect(existsSync(forbidden)).toBe(false);
  });

  it("the contracts model no labor chain, occupational Cohort, draw reference, KTI result, migration flow, health or stochastic field", () => {
    const text = code("packages/contracts/src/population.ts");
    for (const word of [
      "occupational",
      "draw_reference",
      "competence",
      "migration_flow",
      "carried_flow",
      "labor_claim",
      "health",
      "mortality_rate",
      "stochastic",
      "random",
    ]) {
      expect(text.toLowerCase(), word).not.toContain(word);
    }
  });
});

describe("acceptance-register honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-02", "IA-03", "IA-04", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence naming Population tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/Population/);
      expect(row.partial_evidence?.tests.some((t) => /population/.test(t))).toBe(true);
    },
  );
  it("IA-07, IA-24, IA-27 stay BLOCKED; no whole-engine row was marked complete", () => {
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
    expect(
      register
        .filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED")
        .map((r) => r.id),
    ).toEqual(
      register.filter((r) => ["UNRUN", "NOT_APPLICABLE"].includes(r.status)).map((r) => r.id),
    );
  });
  it("every open gate stays at its recorded status; PF-6/F-028, provider, deployment and migration stay inactive", () => {
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("CAL-03")).toBe("NO_ADOPTED_PRODUCTION_NUMBER");
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
