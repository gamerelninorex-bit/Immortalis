/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and inspect arbitrary owner values */
// Conformance evidence for ROADBED R3-T25 (BLUE Formal Universal Hard Preflight v6.2): the first-profile institutional freight capability
// (Foundation F + Integration I) under R2-D18 v1.2.1 / R3-T2 / R3-T17. MECHANISM ONLY: structural and source-faithfulness checks of what was
// built and what was deliberately NOT built. Behavioural evidence lives in tests/integration/freight-*.test.ts.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GovernanceInstrumentSchema,
  FREIGHT_CLAUSES,
  FREIGHT_CLAUSE_EFFECT,
  FREIGHT_WITHDRAWAL_CAUSES,
  EconomyFreightWithdrawalSchema,
  OWNER_ECONOMY,
  OWNER_GIP,
  OWNER_LOGISTICS,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  InstrumentOperativeEffect,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  BOOTSTRAP_SUNSET_POLICY_FREIGHT_V1,
  BOOTSTRAP_SUNSET_POLICY_MS_V08,
  CANONICAL_OWNER_REGISTRY,
  FREIGHT_FACT_KINDS,
  FREIGHT_FACT_KIND_IDS,
  FREIGHT_SUNSET_POLICY_DELTA,
} from "@immortalis/engine";
import * as engine from "@immortalis/engine";
import { code, lock } from "../support/f027.ts";
import { FREIGHT_BASE_COMMIT, FREIGHT_SCOPED_DELTAS } from "../support/freight-scoped-deltas.ts";
import { REMOVED_HISTORICAL_PINS } from "../support/freight-removed-pins.ts";
import { execFileSync } from "node:child_process";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
const FREIGHT_DIR = "packages/engine/src/freight";
const FREIGHT_ENGINE = walk(FREIGHT_DIR).filter((f) => !f.endsWith("integrity.ts"));
const FREIGHT_ALL = [
  ...walk(FREIGHT_DIR),
  "packages/contracts/src/freight-profile.ts",
  "packages/testkit/src/freight-fixtures.ts",
];
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("IA-03 owner exclusivity: existing owners only, no new owner, no Logistics economic request, no stored eligibility", () => {
  it("registers exactly twenty-six kinds, each under an EXISTING owner; the only new facets are World-State's three isolated ones", () => {
    expect(FREIGHT_FACT_KINDS).toHaveLength(26);
    expect([...FREIGHT_FACT_KIND_IDS].sort()).toEqual(FREIGHT_FACT_KINDS.map((k) => k.id).sort());
    const owners = new Set(FREIGHT_FACT_KINDS.map((k) => k.owner));
    expect([...owners].sort()).toEqual(
      [OWNER_ECONOMY, OWNER_GIP, OWNER_LOGISTICS, OWNER_PRODUCTION, OWNER_WORLD_STATE].sort(),
    );
    for (const k of FREIGHT_FACT_KINDS)
      expect(CANONICAL_OWNER_REGISTRY.has(k.owner), k.id).toBe(true);
    // the only facets that did not already exist are World-State's three, isolated from locus/profile so a physical write can never
    // advance a governing-premise head
    const newFacets = FREIGHT_FACT_KINDS.filter(
      (k) =>
        !ALL_FACT_KINDS.some(
          (o) =>
            o.owner === k.owner &&
            o.facet === k.facet &&
            !FREIGHT_FACT_KIND_IDS.includes(o.id as never),
        ),
    ).map((k) => `${k.owner}/${k.facet}`);
    expect([...new Set(newFacets)].sort()).toEqual([
      "world_state/world_governing_premise",
      "world_state/world_opening_provenance",
      "world_state/world_site_condition",
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.keys()]).toHaveLength(17);
  });

  it("stores no refusal, F1, eligibility, readiness-flag, use-counter or Logistics-owned economic-request kind or key", () => {
    for (const k of FREIGHT_FACT_KINDS) {
      expect(k.id, k.id).not.toMatch(/refus|f1|eligib|flag|counter|wait|pending_use/i);
      expect(k.keyPattern.source, k.id).not.toMatch(/refus|f1|eligib|flag|counter/i);
    }
    // Economy owns the request and allocation; Logistics owns service, slot, release and enrollment only
    expect(FREIGHT_FACT_KINDS.filter((k) => k.owner === OWNER_LOGISTICS).map((k) => k.id)).toEqual([
      "logistics_service_basis",
      "logistics_service_slot",
      "logistics_unused_release",
      "logistics_freight_dispatch_enrollment",
    ]);
    expect(
      FREIGHT_FACT_KINDS.filter((k) => /freight_request|freight_allocation/.test(k.id)).every(
        (k) => k.owner === OWNER_ECONOMY,
      ),
    ).toBe(true);
  });

  it("every freight kind cites a ROADBED rule and the GIP/Economy/Logistics/Production/World rule is the owner's own", () => {
    for (const k of FREIGHT_FACT_KINDS) {
      expect(JSON.stringify(k.rule), k.id).toMatch(/ROADBED|R2-D18|R3-T/);
      expect(k.rc, k.id).toContain("RC-02");
    }
  });
});

describe("source scope: the withheld and unqualified branches are not representable", () => {
  it("positive F1 terminal refusal is WITHHELD: no persisted Logistics F1 refusal kind, receipt or key, and no code constructs one", () => {
    for (const f of FREIGHT_ALL) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /\bF1_REFUSAL\b|\bLogisticsRefusal|\blogistics_refusal|refusal_receipt|F1_RECEIPT/,
      );
    }
    // F2 and F3 are the only owner-committed Logistics outcomes; F4 is derived at C's cut and never stored
    expect(
      FREIGHT_FACT_KINDS.filter((k) => k.owner === OWNER_LOGISTICS).some((k) =>
        /f1|f4|absence/i.test(k.id),
      ),
    ).toBe(false);
    expect(ALL_FACT_KINDS.some((k) => /absence|no_dispatch/i.test(k.id))).toBe(false);
  });

  it("C-07 admits W2 and W3 only: W1 (positive F1) and W4 (no source-qualified service-by boundary) cannot be written", () => {
    expect([...FREIGHT_WITHDRAWAL_CAUSES]).toEqual(["W2", "W3"]);
    // the executable cause union has exactly the two source-qualified members ...
    expect(
      EconomyFreightWithdrawalSchema.shape.cause.options.map((o) => o.shape.kind.value),
    ).toEqual(["W2", "W3"]);
    // ... and no engine module names the other two (the Instrument's C-07 clause TERMS list all four source triggers; only W2 and W3 execute)
    for (const f of walk(FREIGHT_DIR)) expect(code(f), f).not.toMatch(/["'`]W1["'`]|["'`]W4["'`]/);
  });

  it("the Instrument's legacy WS-007 scalar `operative_effect` is untouched, and the seven clauses are separate facts with current legal force", () => {
    const shape = GovernanceInstrumentSchema.shape as Record<string, unknown>;
    expect(shape["operative_effect"]).toBe(InstrumentOperativeEffect);
    expect(Object.keys(shape).some((k) => /^operative_effects$/.test(k))).toBe(false);
    expect([...FREIGHT_CLAUSES]).toEqual(["C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07"]);
    expect(Object.keys(FREIGHT_CLAUSE_EFFECT).sort()).toEqual([...FREIGHT_CLAUSES].sort());
    // the legacy GIP contract and directory are not part of the scoped deltas: they are byte-for-byte what main carried
    for (const p of Object.keys(FREIGHT_SCOPED_DELTAS)) {
      expect(p, p).not.toMatch(/packages\/engine\/src\/gip\/|packages\/contracts\/src\/gip/);
    }
  });
});

describe("determinism and bounded cost: no clock, tick, randomness or unbounded routine scan in the owner code", () => {
  it("the freight owner modules read no wall clock, timer or randomness", () => {
    for (const f of FREIGHT_ALL) {
      expect(code(f), f).not.toMatch(
        /Date\.now|new Date\(|Math\.random|performance\.now|setTimeout|setInterval|crypto\.random|randomUUID|process\.hrtime|process\.env/,
      );
    }
  });

  it("no freight owner module lists the whole fact set on a routine path (the load-time verifier is the one diagnostic scan; the GIP head is incremental)", () => {
    for (const f of FREIGHT_ENGINE) {
      const text = code(f);
      const scans =
        text.match(
          /\.listFacts\(\)|\.facts\.values\(\)|\.facts\.entries\(\)|for \(const \S+ of \S*\.facts\)/g,
        ) ?? [];
      // the one permitted use: the once-per-state fallback in the GIP owner-head module and its store-source wrapper (counted, never routine)
      const allowed = f.endsWith("gip-owner-head.ts") ? 1 : f.endsWith("common.ts") ? 1 : 0;
      expect(scans.length, `${f}: ${scans.join(", ")}`).toBeLessThanOrEqual(allowed);
    }
    expect(code(`${FREIGHT_DIR}/integrity.ts`).match(/\.listFacts\(\)/g)).toHaveLength(1);
  });

  it("freight code imports only the contracts, the engine's own modules and the existing owners' pure derivations: no operator, protocol, MCP or player-facing path", () => {
    for (const f of FREIGHT_ALL.filter((x) => x.startsWith("packages/engine"))) {
      const imports = [...code(f).matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
      for (const i of imports)
        expect(i, `${f} imports ${i}`).toMatch(/^(@immortalis\/contracts|\.\.?\/)/);
    }
  });
});

describe("predecessor modules: exactly the recorded scoped deltas, pinned here", () => {
  it("every predecessor file this slice changed is pinned at its slice-head bytes and differs from what the base carried", () => {
    expect(FREIGHT_BASE_COMMIT).toMatch(/^b9c4dcb0/);
    for (const [path, pin] of Object.entries(FREIGHT_SCOPED_DELTAS)) {
      expect(sha(path), path).toBe(pin.head);
      expect(pin.base, path).not.toBe(pin.head);
    }
    // the freight adapters live in their own directory: the predecessor owner directories gained no file
    expect(readdirSync("packages/engine/src/gip").sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
    ]);
  });

  it("the freight engine directory is exactly the owner-path modules", () => {
    expect(readdirSync(FREIGHT_DIR).sort()).toEqual([
      "common.ts",
      "dispatch-fence.ts",
      "economy-derive.ts",
      "economy.ts",
      "gip-owner-head.ts",
      "gip.ts",
      "integrity.ts",
      "logistics.ts",
      "production.ts",
      "route.ts",
      "world.ts",
    ]);
  });
});

describe("reviewed sunset policy: every registered kind has a row; the freight rows are the restrictive default", () => {
  it("the freight table is the M-S table plus 26 UNREVIEWED_BLOCK rows and covers exactly ALL_FACT_KINDS", () => {
    expect(BOOTSTRAP_SUNSET_POLICY_FREIGHT_V1).toHaveLength(ALL_FACT_KINDS.length);
    expect(
      BOOTSTRAP_SUNSET_POLICY_FREIGHT_V1.slice(0, BOOTSTRAP_SUNSET_POLICY_MS_V08.length),
    ).toEqual(BOOTSTRAP_SUNSET_POLICY_MS_V08);
    expect(FREIGHT_SUNSET_POLICY_DELTA.map((r) => r.kind)).toEqual([...FREIGHT_FACT_KIND_IDS]);
    expect(FREIGHT_SUNSET_POLICY_DELTA.every((r) => r.policy === "UNREVIEWED_BLOCK")).toBe(true);
    expect(BOOTSTRAP_SUNSET_POLICY_FREIGHT_V1.map((r) => r.kind).sort()).toEqual(
      ALL_FACT_KINDS.map((k) => k.id).sort(),
    );
  });
});

describe("source-lock receipt route: the capability is registered, bound to the code and kept narrow", () => {
  const row = (list: string, id: string) =>
    (lock as unknown as Record<string, Record<string, unknown>[]>)[list]!.find(
      (r) => r["id"] === id,
    )!;

  it("the lowering row names exactly the registered kinds, the five owner rules and the history policy the engine uses, and composes with F-027", () => {
    const low = row("executable_lowerings", "ROADBED-FREIGHT-FI-LOWERING") as Record<string, any>;
    expect(low["fact_kinds"]).toEqual([...FREIGHT_FACT_KIND_IDS]);
    expect(low["history_policy_suffix"]).toBe(engine.FREIGHT_HISTORY_POLICY_SUFFIX);
    expect(low["relation"]).toBe("COMPOSES_WITH");
    expect(low["supersedes"]).toBeNull();
    expect(low["superseded_by"]).toBeNull();
    expect(low["cites_design_lineage"]).toEqual(["ROADBED-FREIGHT-FI-LINEAGE"]);
    for (const name of low["rule_map"] as string[]) {
      const rule = (engine as unknown as Record<string, unknown>)[name];
      expect(rule, name).toBeDefined();
      expect(
        FREIGHT_FACT_KINDS.some((k) => k.rule === rule),
        name,
      ).toBe(true);
    }
    expect(low["technical_encoding_review"]).toMatch(/BLUE review/);
  });

  it("the lineage row is design-only, never executable, never a frozen pin, and does not rewrite any frozen source", () => {
    const lin = row("design_lineage_successors", "ROADBED-FREIGHT-FI-LINEAGE") as Record<
      string,
      any
    >;
    expect(lin["executable"]).toBe(false);
    expect(lin["status"]).toBe("DESIGN_RATIFIED");
    expect(lin["narrows_frozen_pin"]).toBe(false);
    expect(lin["of_frozen_source"]).toBeNull();
    expect((lock as any).frozen_sources).toHaveLength(23);
    expect(JSON.stringify(lin["sections"])).toMatch(/R2-D18 v1\.2\.1/);
    expect(JSON.stringify(lin["sections"])).toMatch(/R3-T17 CT-1\.\.CT-4/);
  });

  it("the lowering states the exclusions the slice honours: no positive F1, no W1/W4, no new owner, no F-028 expansion", () => {
    const low = row("executable_lowerings", "ROADBED-FREIGHT-FI-LOWERING") as Record<string, any>;
    const text = JSON.stringify(low["does_not"]);
    expect(text).toMatch(/positive definitive F1 terminal refusal/);
    expect(text).toMatch(/W1/);
    expect(text).toMatch(/W4/);
    expect(text).toMatch(/add an owner/);
    expect(text).toMatch(/F-028/);
  });
});

describe("auditable predecessor evidence: what the older suites used to assert is preserved and verifiable", () => {
  const git = (...args: string[]): Buffer | null => {
    try {
      return execFileSync("git", args, {
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch {
      return null;
    }
  };
  const historyAvailable = git("cat-file", "-e", `${FREIGHT_BASE_COMMIT}^{commit}`) !== null;
  // CI checks out with full history; a shallow checkout SKIPS these and reports them as skipped, never as passed.
  const only = it.skipIf(!historyAvailable);
  const identityAtBase = (path: string): string | null => {
    const type = git("cat-file", "-t", `${FREIGHT_BASE_COMMIT}:${path}`)?.toString("utf8").trim();
    if (type === "blob") {
      const blob = git("show", `${FREIGHT_BASE_COMMIT}:${path}`);
      return blob === null ? null : createHash("sha256").update(blob).digest("hex");
    }
    const names = git("ls-tree", "-r", "--name-only", FREIGHT_BASE_COMMIT, "--", path);
    if (names === null) return null;
    const h = createHash("sha256");
    for (const f of names.toString("utf8").split("\n").filter(Boolean).sort()) {
      const b = git("show", `${FREIGHT_BASE_COMMIT}:${f}`);
      if (b === null) return null;
      h.update(`${f}\0${createHash("sha256").update(b).digest("hex")}\n`);
    }
    return h.digest("hex");
  };

  it("every removed historical pin is recorded once, and every changed file's recorded base is a removed pin or a recorded delta", () => {
    expect(REMOVED_HISTORICAL_PINS.length).toBeGreaterThan(50);
    const keys = REMOVED_HISTORICAL_PINS.map((p) => `${p.suite}\0${p.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of REMOVED_HISTORICAL_PINS)
      expect(p.value, `${p.suite} ${p.path}`).toMatch(/^[0-9a-f]{64}$/);
    // a removed FILE pin of a path with a recorded delta is exactly that delta's base: the claim "unchanged since main" was true, and is
    // now deliberately false
    for (const p of REMOVED_HISTORICAL_PINS) {
      const delta = FREIGHT_SCOPED_DELTAS[p.path];
      if (delta) expect(p.value, `${p.suite} ${p.path}`).toBe(delta.base);
    }
  });

  only(
    "every removed pin and every recorded delta base is what the base commit's own bytes hash to",
    () => {
      for (const p of REMOVED_HISTORICAL_PINS)
        expect(identityAtBase(p.path), `${p.suite} ${p.path}`).toBe(p.value);
      for (const [path, pin] of Object.entries(FREIGHT_SCOPED_DELTAS))
        expect(identityAtBase(path), path).toBe(pin.base);
    },
  );
});
