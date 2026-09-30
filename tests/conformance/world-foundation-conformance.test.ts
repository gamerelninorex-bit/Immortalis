// Conformance evidence for the Canonical World Identity & Owner Foundation. Each block names its
// register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  CANONICAL_OWNER_REGISTRY,
  FACT_KINDS,
  I002_SOURCE,
  IR_SOURCE,
  WG_SOURCE,
} from "@immortalis/engine";

interface Lock {
  frozen_sources: { id: string; url: string; native_pin: string; primary_im: string }[];
  governance_references: { title: string; url: string; native_pin: string }[];
  incorporated_tranches: { title: string; url: string; native_pin: string }[];
}
const lock = JSON.parse(readFileSync("spec/f027/spec-lock.json", "utf8")) as Lock;
const register = (
  parse(readFileSync("spec/f027/acceptance-register.yaml", "utf8")) as {
    rows: {
      id: string;
      status: string;
      evidence: unknown;
      partial_evidence?: { scope: string; tests: string[] };
    }[];
  }
).rows;
const gates = (
  parse(readFileSync("spec/f027/open-gates.yaml", "utf8")) as {
    gates: { id: string; status: string }[];
  }
).gates;

describe("IA-01 source/version fidelity (owner-registration aspect)", () => {
  it("every owner/facet registration cites a frozen source at its exact spec-locked pin", () => {
    const byId = (id: string) => lock.frozen_sources.find((s) => s.id === id)!;
    expect(WG_SOURCE).toEqual({ artifact: byId("WG").url, native_pin: byId("WG").native_pin });
    expect(I002_SOURCE).toEqual({
      artifact: byId("I-002").url,
      native_pin: byId("I-002").native_pin,
    });
    expect(IR_SOURCE).toEqual({ artifact: byId("IR").url, native_pin: byId("IR").native_pin });
    for (const kind of FACT_KINDS) {
      const src = lock.frozen_sources.find(
        (s) => s.url === kind.rule.artifact && s.native_pin === kind.rule.native_pin,
      );
      expect(src, `${kind.id} cites a source that is not in spec-lock.json`).toBeDefined();
      // the frozen source's IM lowering (spec-lock primary_im) is the IM boundary the kind claims
      expect(kind.im).toBe(src!.primary_im);
    }
  });

  it("lineage that names F-014C or the Runtime/Translation tranche matches the lock's pins", () => {
    const f014c = lock.governance_references.find((g) => g.title === "Canonical Role Registry v1")!;
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    const binding = FACT_KINDS.find((k) => k.id === "player_character_binding")!;
    const lineage = binding.rule.authority_lineage.join("\n");
    expect(lineage).toContain(f014c.native_pin);
    expect(lineage).toContain(f014c.url);
    for (const kind of FACT_KINDS) {
      const l = kind.rule.authority_lineage.join("\n");
      expect(l).toContain(tranche.native_pin);
      expect(l).toContain(tranche.url);
    }
  });

  it("the binding's governing rule cites the IR clauses its coupling basis relies on (§3 input 3, §5, §6 Step 3/6)", () => {
    const binding = FACT_KINDS.find((k) => k.id === "player_character_binding")!;
    for (const clause of [
      "§3 input 3",
      "§5 Precedence for Insertion Facts",
      "Step 3",
      "native/already-there",
      "Step 6",
    ]) {
      expect(binding.rule.clause).toContain(clause);
    }
  });

  it("no registration supersedes another source or asserts a pin the lock does not carry", () => {
    for (const kind of FACT_KINDS) expect(kind.rule.supersedes).toBeNull();
  });
});

describe("IA-03 owner exclusivity / no accidental subsystem (world, PC, binding aspect)", () => {
  it("assigns each included fact to the owner the sources name, once", () => {
    expect(FACT_KINDS.map((k) => [k.id, k.owner, k.facet])).toEqual([
      ["world_profile", "world_state", "world_profile"],
      ["world_locus", "world_state", "world_locus"],
      ["pc_existence_contract", "pc_existence", "existence_contract"],
      ["player_character_binding", "role_registry", "player_character_binding"],
    ]);
    expect(new Set(FACT_KINDS.map((k) => `${k.owner}/${k.facet}`)).size).toBe(FACT_KINDS.length);
  });

  it("registers no test-only, persona, provider or implementation identity as an owner", () => {
    const names = [...CANONICAL_OWNER_REGISTRY.keys()].join(" ").toLowerCase();
    for (const forbidden of ["test", "claude", "blue", "george", "red", "openai", "anthropic"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("production code never imports the testkit or names a TEST-OWNER", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(join(dir, e.name))
          : e.name.endsWith(".ts")
            ? [join(dir, e.name)]
            : [],
      );
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/TEST-OWNER/);
    }
  });
});

describe("no hidden expansion: no unrelated subsystem is registered", () => {
  it("registers only the three world/PC owners and the IM-02 kernel — no population, economy, relationship, epistemic or host owner", () => {
    // The Turnless Temporal Foundation (third slice) lawfully adds exactly one owner, the IM-02 kernel
    // (F-014B §2); the world/PC kinds themselves are unchanged.
    expect([...CANONICAL_OWNER_REGISTRY.keys()].sort()).toEqual([
      "pc_existence",
      "role_registry",
      "temporal_kernel",
      "world_state",
    ]);
    expect(FACT_KINDS).toHaveLength(4);
  });
});

describe("acceptance-register honesty", () => {
  const row = (id: string) => register.find((r) => r.id === id)!;
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-02", "IA-03", "IA-28"])(
    "%s cites this slice's tests as partial evidence only",
    (id) => {
      const r = row(id);
      expect(r.status === "NOT_IMPLEMENTED" || r.status === "BLOCKED").toBe(true);
      expect(r.evidence).toBeNull();
      expect(r.partial_evidence?.tests).toEqual(
        expect.arrayContaining([expect.stringMatching(/world-foundation|owner-admission/)]),
      );
    },
  );
  it("IA-28 (OB-016) stays BLOCKED: code-era conformance and live conversion remain due", () => {
    expect(row("IA-28").status).toBe("BLOCKED");
  });
});

describe("open gates are untouched", () => {
  const status = (id: string) => gates.find((g) => g.id === id)?.status;
  it.each([
    ["CAL-01", "UNCALIBRATED"],
    ["CAL-02", "OPEN_CALIBRATION"],
    ["CAL-03", "NO_ADOPTED_PRODUCTION_NUMBER"],
    ["CAL-08", "NOT_ADOPTED"],
    ["CAL-09", "UNRUN_DEFERRED"],
    ["OB-015", "DEFERRED_TO_LIVE_MIGRATION_HORIZON"],
    ["OB-016", "OPEN_CODE_ERA_CONFORMANCE"],
    ["MIG-01..MIG-10", "DECLARATIVE_ONLY"],
    ["PROVIDER", "NOT_ADOPTED"],
    ["DEPLOYMENT", "NOT_ACTIVATED"],
    ["PF-6/F-028", "NOT_ACTIVATED_BLOCKED"],
  ])("%s remains %s", (id, expected) => {
    expect(status(id)).toBe(expected);
  });
});
