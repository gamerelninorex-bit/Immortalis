// Conformance evidence for the Turnless Temporal & Resolution Transaction Foundation. Each block names
// its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { TemporalObjectSchema } from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  F014B_SOURCE,
  FACT_KINDS,
  TemporalCoordinator,
  TEMPORAL_FACT_KINDS,
} from "@immortalis/engine";
import { engagedObject } from "@immortalis/testkit";

interface Lock {
  frozen_sources: { id: string; url: string; native_pin: string; primary_im: string }[];
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
const TEMPORAL_SOURCES = [
  ...walk("packages/engine/src/temporal"),
  "packages/contracts/src/temporal.ts",
  "packages/engine/src/owners/extension.ts",
];

describe("IA-01 source/version fidelity (temporal kernel registration aspect)", () => {
  const f014b = lock.frozen_sources.find((s) => s.id === "F-014B")!;

  it("the IM-02 kernel registration cites F-014B at its exact spec-locked pin and IM lowering", () => {
    expect(F014B_SOURCE).toEqual({ artifact: f014b.url, native_pin: f014b.native_pin });
    for (const kind of TEMPORAL_FACT_KINDS) {
      expect(kind.rule.artifact).toBe(f014b.url);
      expect(kind.rule.native_pin).toBe(f014b.native_pin);
      expect(kind.im).toBe(f014b.primary_im);
      expect(kind.im).toBe("IM-02");
      expect(kind.rule.supersedes).toBeNull();
    }
  });

  it("the governing rule names the F-014B clauses the kernel state relies on, and F-017's derive-only disposition", () => {
    const { clause, authority_lineage } = TEMPORAL_FACT_KINDS[0]!.rule;
    for (const c of [
      "§2 Kernel-Owned State",
      "§3 Temporal Object",
      "§4 Cross-System Temporal Read",
      "§6 Advance Algorithm",
      "§9 Temporal Invalidation",
      "§13 Boundary Index",
      "§17 Player-Facing Transaction",
    ]) {
      expect(clause).toContain(c);
    }
    const lineage = authority_lineage.join("\n");
    expect(lineage).toContain("F-017");
    expect(lineage).toContain("persist no graph");
    // F-017's pins as named by the governing brief (F-017 is not a spec-lock entry)
    expect(lineage).toContain("2026-09-25T15:03:49.887Z");
    expect(lineage).toContain("2026-09-25T23:42:27.802Z");
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
    expect(lineage).toContain(tranche.url);
  });
});

describe("IA-03 owner exclusivity / no accidental subsystem (temporal kernel aspect)", () => {
  it("registers exactly one new owner, the IM-02 kernel, with one facet; the world/PC kinds are unchanged", () => {
    expect(TEMPORAL_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["temporal_state", "temporal_kernel", "temporal_coordination", "ADVANCING"],
      ["temporal_boundary_index", "temporal_kernel", "temporal_coordination", "ADVANCING"],
      ["temporal_object", "temporal_kernel", "temporal_coordination", "ADVANCING"],
      ["resolution_transaction", "temporal_kernel", "temporal_coordination", "SEALED"],
      // the durable authority of an OPEN transaction, committed before its first owner stage (F-014B §6 step 1)
      ["temporal_transaction_authority", "temporal_kernel", "temporal_coordination", "SEALED"],
    ]);
    expect(FACT_KINDS.map((k) => k.owner).sort()).toEqual([
      "pc_existence",
      "role_registry",
      "world_state",
      "world_state",
    ]);
    // the fourth slice adds the three IM-04 Population kinds (one owner, one facet); the fifth adds the four
    // IM-05 Production kinds and the one World-State fallback physical-entity kind; the sixth adds the three
    // IM-06 Economy kinds (one owner, one facet); the seventh adds the one World-State entity-transition kind
    // (same owner and facet as the fallback entity); the transaction-authority repair adds the one IM-02 kernel kind
    // (the eighth slice's three Logistics kinds bring the registry to 24)
    expect(ALL_FACT_KINDS).toHaveLength(40);
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
  });

  it("every key space belongs to exactly one fact kind", () => {
    const probes = [
      "temporal/state",
      "temporal/boundary-index",
      "temporal/object/o1",
      "temporal/transaction/t1",
      "world/w/profile",
      "world/w/locus/l",
      "pc/p/existence-contract",
      "role-registry/binding/role.player_character",
    ];
    for (const key of probes)
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key))).toHaveLength(1);
  });

  it("the kernel owns shared orchestration only — none of the substantive owners the IM map reserves", () => {
    const names = [...CANONICAL_OWNER_REGISTRY.keys()]
      .filter((n) => n !== "named_actor" && n !== "epistemic_access" && n !== "kti")
      .join(" ");
    // (Population is the fourth slice's lawful IM-04 owner, Production the fifth slice's lawful IM-05 owner and
    // Economy the sixth slice's lawful IM-06 owner; every other substantive owner stays absent.)
    for (const forbidden of ["health", "military", "actor", "culture", "epistemic", "resource"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("production code never imports the testkit or names the synthetic owner", () => {
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-STAGE-OWNER/);
    }
  });
});

describe("IA-04 turnless causal ordering (foundation aspect): no turn, tick, phase, scheduler, clock or RNG", () => {
  it("the temporal modules contain no global tick, turn counter, phase loop, scheduler, timer, wall-clock or RNG", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|requestAnimationFrame|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|globalTick|tickCount|turnCounter|turnNumber|currentTurn|phaseOrder|runPhase|advanceTick)\b/;
    for (const f of TEMPORAL_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state: the graph/frontier is transient per call and nothing is persisted outside facts", () => {
    for (const f of TEMPORAL_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(/^(let|var)\s/m);
      expect(text, f).not.toMatch(/node:fs|\.jsonl|appendFile|writeFile/);
    }
  });

  it("a held continuation has no cancellation/supersession mechanism: none is offered by the coordinator or the contracts", () => {
    const methods = Object.getOwnPropertyNames(TemporalCoordinator.prototype);
    expect(methods.filter((m) => /cancel|supersede|abandon|reset|clear|discard/i.test(m))).toEqual(
      [],
    );
    expect(methods.filter((m) => !m.startsWith("constructor")).sort()).toEqual([
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

  it("the graph module takes only (nodes, edges, pre-blocked): no horizon, version, retry or slice can reach it", () => {
    const text = code("packages/engine/src/temporal/graph.ts");
    expect(text).toMatch(
      /export function analyzeStageGraph\(\s*nodes: readonly GraphNode\[\],\s*edges: readonly GraphEdge\[\],\s*preBlocked: ReadonlyMap<string, UnresolvedReason> = new Map\(\),\s*\): GraphAnalysis/,
    );
  });

  it("identity helpers take nothing but a StageKey or a transaction identity", () => {
    const text = code("packages/engine/src/temporal/identity.ts");
    const signatures = [...text.matchAll(/export const (\w+) = \(([^)]*)\)/g)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(signatures).toEqual([
      ["stageId", "key: StageKey"],
      ["stageGroupId", "key: StageKey"],
      ["stageIntentId", "key: StageKey"],
      ["transactionGroupId", "transactionId: string"],
      ["transactionIntentId", "transactionId: string"],
      ["transactionCause", "transactionId: string"],
      ["transactionAuthorityGroupId", "transactionId: string"],
      ["transactionAuthorityIntentId", "transactionId: string"],
    ]);
  });
});

describe("IA-03/IA-04/IA-06 durable pre-stage transaction authority (F-014B §2, §6 step 1; RC-05): one shared boundary", () => {
  it("the coordinator opens the transaction durably BEFORE it commits any owner stage, through the one store, and pins nothing but a group dependency", () => {
    const text = code("packages/engine/src/temporal/coordinator.ts");
    const authorize = text.indexOf("await this.#authorize(ctx, s.staged)");
    const commitStage = text.indexOf("await this.#store.commit(staged.group)");
    expect(authorize).toBeGreaterThan(-1);
    expect(commitStage).toBeGreaterThan(authorize);
    expect(text).toMatch(
      /depends_on: \[\.\.\.staged\.group\.depends_on, auth\.provenance\.group_id\]/,
    );
    // one journal, one store: the opening is an ordinary kernel commit group
    expect(text).toMatch(/this\.#kernelGroup\(\s*\{\s*group_id: transactionAuthorityGroupId\(id\)/);
    expect(text).not.toMatch(/node:fs|setTimeout|Date\.now|new Date|Math\.random/);
  });

  it("every IM-02 owner stage — Production's completion, the custodian's acceptance, Economy's realization and the entity transition — is admitted and verified by the ONE shared stage rule, and none calls the identity-only helper directly", () => {
    const admitters: [string, RegExp][] = [
      [
        "packages/engine/src/production/admission.ts",
        /stageAuthorityViolation\(\s*group,\s*d\.envelope\.close_stage/,
      ],
      [
        "packages/engine/src/world/fallback-custody.ts",
        /stageAuthorityViolation\(\s*group,\s*worldAcceptanceStage/,
      ],
      [
        "packages/engine/src/economy/admission.ts",
        /stageAuthorityViolation\(\s*group,\s*economyRealizationStage/,
      ],
      [
        "packages/engine/src/world/entity-transition.ts",
        /stageAuthorityViolation\(\s*group,\s*entityTransitionStage/,
      ],
    ];
    for (const [f, re] of admitters) expect(code(f), f).toMatch(re);
    for (const f of [
      "packages/engine/src/production/integrity.ts",
      "packages/engine/src/economy/integrity.ts",
      "packages/engine/src/world/entity-transition-integrity.ts",
    ])
      expect(code(f), f).toMatch(/journaledStageViolation\(/);
    const direct = walk("packages/engine/src").filter((f) =>
      /\bstageIdentityViolation\(/.test(code(f)),
    );
    // only the shared helper itself (its definition and its two uses inside the shared rule)
    expect(direct).toEqual(["packages/engine/src/production/admission.ts"]);
  });

  it("the authority is kernel coordination state only: one sealed IM-02 kind of the existing kernel owner and facet, holding the RC-05 opening fields and nothing substantive", () => {
    const kind = TEMPORAL_FACT_KINDS.find((k) => k.id === "temporal_transaction_authority")!;
    expect([kind.owner, kind.facet, kind.im, kind.lifecycle]).toEqual([
      "temporal_kernel",
      "temporal_coordination",
      "IM-02",
      "SEALED",
    ]);
    const contract = code("packages/contracts/src/temporal.ts");
    const block = contract.slice(
      contract.indexOf("export const TransactionAuthoritySchema"),
      contract.indexOf("export type TransactionAuthority"),
    );
    for (const field of [
      "transaction_id",
      "cause",
      "trigger",
      "continues",
      "opening",
      "requested",
      "context",
      "publication",
    ])
      expect(block).toContain(field);
    for (const word of ["entity_", "locus", "quantity", "tick", "schedule", "interval"])
      expect(block.toLowerCase(), word).not.toContain(word);
  });
});

describe("IA-23 / CAL-01 temporal approximation calibration: not used, not invented", () => {
  it("CAL-01 stays UNCALIBRATED and IA-23 stays BLOCKED", () => {
    expect(gates.find((g) => g.id === "CAL-01")?.status).toBe("UNCALIBRATED");
    expect(register.find((r) => r.id === "IA-23")?.status).toBe("BLOCKED");
    expect(register.find((r) => r.id === "IA-23")?.evidence).toBeNull();
  });

  it("no APPROXIMATE-PARTITION behavior exists: the only partition class is EXACT-PARTITION and nothing carries a tolerance", () => {
    for (const f of TEMPORAL_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(/\b\w*[tT]olerance\w*\s*[?:=]/);
      expect(text, f).not.toMatch(/\b(const|let|var)\s+\w*[tT]olerance/);
    }
    const src = readFileSync("packages/contracts/src/temporal.ts", "utf8");
    expect(src).toContain('class: z.literal("EXACT-PARTITION")');
    expect(
      TemporalObjectSchema.safeParse({
        ...engagedObject(),
        partition: { class: "APPROXIMATE-PARTITION" },
      }).success,
    ).toBe(false);
  });

  it("declares no calibration constant: no numeric threshold, cadence, timeout, capacity or default in the temporal modules", () => {
    for (const f of TEMPORAL_SOURCES) {
      const text = code(f);
      // numeric literals other than structural ones: 0/1/2 (indices, counters, comparisons), 5 (diagnostic
      // issue-list length) and 64 (sha256 hex digest length)
      const numbers = [...text.matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      expect(
        numbers.filter((n) => !["0", "1", "2", "5", "64"].includes(n!)),
        f,
      ).toEqual([]);
    }
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("the engine has exactly the commit, economy, owners, persistence, population, production, temporal and world modules — no actor, health, military, epistemic, recurrence, scheduler, host or provider layer", () => {
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
    expect(readdirSync("packages/engine/src/temporal").sort()).toEqual([
      "admission.ts",
      "coordinator.ts",
      "graph.ts",
      "identity.ts",
      "integrity.ts",
      "partition.ts",
      "providers.ts",
    ]);
    expect(readFileSync("packages/protocol/src/index.ts", "utf8")).not.toMatch(/export (?!\{\})/);
  });

  it("the campaign package format and persistence contract gained no second journal, save or recovery identity", () => {
    const pkg = code("packages/engine/src/persistence/file-package.ts");
    expect(pkg).toMatch(/const JOURNAL = "journal\.jsonl"/);
    // the one journal file is still named exactly once; no second journal/save file name is defined
    expect(
      [...pkg.matchAll(/const \w+ = "[^"]*\.(jsonl|json|db|sqlite)"/g)].map((m) => m[0]),
    ).toEqual(['const MANIFEST = "manifest.json"', 'const JOURNAL = "journal.jsonl"']);
    expect(code("packages/contracts/src/campaign-package.ts")).toMatch(
      /PACKAGE_FORMAT_VERSION = 1/,
    );
    expect(existsSync("migrations/manifests")).toBe(true);
    expect(readdirSync("migrations/manifests").filter((f) => f !== ".gitkeep")).toEqual([]); // no migration authorized
  });
});

describe("acceptance-register honesty", () => {
  const row = (id: string) => register.find((r) => r.id === id)!;

  it("no row was promoted: nothing is PASS/FAIL, and the deferred/blocked gates stay so", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    for (const id of ["IA-07", "IA-23", "IA-27"]) expect(row(id).status).toBe("BLOCKED");
    expect(row("IA-04").status).toBe("NOT_IMPLEMENTED");
  });

  it("IA-04 cites narrowly scoped partial evidence, every cited test exists, and the scope names what is NOT covered", () => {
    const pe = row("IA-04").partial_evidence!;
    expect(pe).toBeDefined();
    for (const t of pe.tests) expect(existsSync(t), t).toBe(true);
    expect(pe.tests).toEqual(
      expect.arrayContaining([
        "tests/integration/temporal-foundation.test.ts",
        "tests/contract/temporal-schemas.test.ts",
        "tests/unit/stage-graph.test.ts",
      ]),
    );
    for (const phrase of ["CAL-01", "EXACT-PARTITION", "Not implemented"])
      expect(pe.scope).toContain(phrase);
  });

  it("no open gate is resolved by this slice", () => {
    expect(gates.some((g) => /^RESOLVED|CLOSED|DONE$/i.test(g.status))).toBe(false);
    for (const id of ["CAL-01", "CAL-02", "CAL-06", "CAL-09"])
      expect(gates.find((g) => g.id === id)).toBeDefined();
  });
});
