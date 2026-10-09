// Conformance evidence for the World-State Entity Continuity / Transition Close Backbone Foundation (seventh
// slice). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and every other
// F-027 open gate is unchanged.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  ProductionAdapter,
  TemporalCoordinator,
  WG_SOURCE,
  WORLD_ENTITY_TRANSITION_FACT_KINDS,
  WORLD_ENTITY_TRANSITION_RULE,
  WORLD_FALLBACK_FACT_KINDS,
  worldEntityTransitionProvider,
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
const ENTITY_SOURCES = [
  "packages/engine/src/world/entity-transition.ts",
  "packages/engine/src/world/entity-transition-provider.ts",
  "packages/engine/src/world/entity-transition-integrity.ts",
  "packages/contracts/src/entity-transition.ts",
];

describe("IA-01 source/version fidelity (World-State entity-transition registration aspect)", () => {
  it("the transition kind cites WG at its exact spec-locked pin and the IM-03 lowering, with F-016 v0.4's pins and F-017's pin in its lineage", () => {
    const wg = lock.frozen_sources.find((s) => s.id === "WG")!;
    expect(WG_SOURCE).toEqual({ artifact: wg.url, native_pin: wg.native_pin });
    expect(wg.primary_im).toBe("IM-03");
    for (const kind of WORLD_ENTITY_TRANSITION_FACT_KINDS) {
      expect(kind.rule).toEqual(WORLD_ENTITY_TRANSITION_RULE);
      expect(kind.rule.artifact).toBe(wg.url);
      expect(kind.rule.native_pin).toBe(wg.native_pin);
      expect(kind.im).toBe("IM-03");
      expect(kind.rule.supersedes).toBeNull();
    }
    const lineage = WORLD_ENTITY_TRANSITION_RULE.authority_lineage.join("\n");
    expect(lineage).toContain("2026-09-25T13:48:12.575Z"); // F-016 v0.4 manifest pin
    expect(lineage).toContain("2026-09-25T13:45:28.162Z"); // F-016 v0.4 successor delta (ECT-01) pin
    expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
  });

  it("the rule names the clauses the state relies on: the fallback custody guard, ECT-01 and the Entity Transition Close", () => {
    for (const c of [
      "F-016 Ratified Fallback Objective Physical-Entity Custody",
      "the causing owner establishes cause and causal outcome",
      "World-State commits the entity consequence exactly once",
      "§2 R-1 ECT-01",
      "Entity Transition Close",
      "§5 R-4",
    ]) {
      expect(WORLD_ENTITY_TRANSITION_RULE.clause).toContain(c);
    }
  });
});

describe("IA-03 owner exclusivity: World-State, and only World-State, owns the entity's current locus and transition", () => {
  it("registers ONE new key space, create-only, under the SAME owner and facet as the fallback entity: no new owner exists", () => {
    expect(
      WORLD_ENTITY_TRANSITION_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle]),
    ).toEqual([
      ["world_entity_transition", "world_state", "world_fallback_physical_entity", "SEALED"],
    ]);
    expect(WORLD_FALLBACK_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["world_fallback_entity", "world_state", "world_fallback_physical_entity", "SEALED"],
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.keys()].sort()).toEqual(
      Object.keys(EXPECTED_OWNER_FACETS).sort(),
    );
    for (const key of [
      "world/w/entity/durable:o",
      "world/w/entity/durable:o/transition",
      "world/w/profile",
      "world/w/locus/l",
      "production/completion/o",
      "temporal/state",
    ])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(1);
  });

  it("no generic or later owner exists: no Asset, Inventory, Logistics, Movement, KTI, Actor, Health, Military, Culture or Epistemic owner", () => {
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
          f !== "culture_social",
      )
      .join(" ");
    for (const forbidden of [
      "asset",
      "inventory",
      "movement",
      "transfer",
      "kti",
      "health",
      "military",
      "actor",
      "culture",
      "epistemic",
      "location",
    ]) {
      expect(names).not.toContain(forbidden);
      expect(facets).not.toContain(forbidden);
    }
  });

  it("the custodian has no adapter and no writer: its transition is an owner operation the IM-02 coordinator resolves, and nothing else", () => {
    for (const f of ENTITY_SOURCES) {
      expect(code(f), f).not.toMatch(/\bclass\s+\w+/);
      // no setter or writer of an entity's location
      expect(code(f), f).not.toMatch(
        /\b(set|move|relocate|write|update)(Entity|Locus|Location)\w*\s*\(/,
      );
    }
    expect(worldEntityTransitionProvider.owner).toBe("world_state");
    expect(worldEntityTransitionProvider.operation).toBe("world-state-commit-entity-transition");
    // Production's adapter is unchanged: it can still only read the accepted entity
    expect(adapterMethods(ProductionAdapter)).toEqual(expectedAdapterMethods("ProductionAdapter"));
  });

  it("the accepted entity is not amended: the fallback custody module and Production are untouched in behavior, the entity kind is still SEALED and create-only", () => {
    const entityKind = ALL_FACT_KINDS.find((k) => k.id === "world_fallback_entity")!;
    expect(entityKind.lifecycle).toBe("SEALED");
    const custody = code("packages/engine/src/world/fallback-custody.ts");
    // the one addition: a delegation to the transition check for the transition kind
    expect(custody).toMatch(/worldTransitionGroupCheck\(group, state\)/);
    expect(custody).toMatch(/expected_version|worldFallbackEntityKey/);
  });

  it("the cause is a clearly synthetic testkit source and production code never imports the testkit or names a synthetic owner", () => {
    const fixtures = readFileSync("packages/testkit/src/entity-fixtures.ts", "utf8");
    expect(fixtures).toMatch(/SYNTHETIC TEST DATA/);
    expect(fixtures).toMatch(/SYNTHETIC-ENTITY-TRANSITION-CAUSE-OWNER/);
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-/);
    }
  });
});

describe("reuse, not fork: IM-02, IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("there is no second coordinator, journal, scheduler, ledger, save or sidecar: the entity modules persist nothing themselves", () => {
    for (const f of ENTITY_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /node:fs|\.jsonl|appendFile|writeFile|createFileCampaign|openFileCampaign/,
      );
      expect(text, f).not.toMatch(/new CampaignCore|CampaignCore\(/);
    }
    const classes = walk("packages/engine/src").flatMap((f) =>
      [...code(f).matchAll(/(?:export )?class (\w+)/g)].map((m) => m[1]),
    );
    expect(
      classes.filter((c) => /Coordinator|Scheduler|Journal|Ledger|Store/.test(c!)).sort(),
    ).toEqual(["FilePackageStore", "TemporalCoordinator"]);
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
    expect(readdirSync("packages/engine/src/persistence").sort()).toEqual([
      "file-package.ts",
      "fs-ops.ts",
      "store.ts",
    ]);
  });

  it("the transition is reached through the one canonical IM-03/IM-11 admission, object registration through the one kernel path, and commit only through the IM-02 coordinator's owner seam", () => {
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /worldEntityGroupCheck\(group, state\)/,
    );
    expect(code("packages/engine/src/temporal/admission.ts")).toMatch(
      /entityTransitionObjectViolation\(o, state, true\)/,
    );
    expect(code("packages/engine/src/world/canonical-campaign.ts")).toMatch(
      /verifyEntityTransitionIntegrity\(store\)/,
    );
    expect(adapterMethods(TemporalCoordinator)).toEqual(
      expectedAdapterMethods("TemporalCoordinator"),
    );
  });

  it("the transition is published only as its IM-02 stage: admission and load verification apply the one shared stage rule (identity and the durable transaction authority)", () => {
    expect(code("packages/engine/src/world/entity-transition.ts")).toMatch(
      /stageAuthorityViolation\(\s*group,\s*entityTransitionStage\(causeId\)/,
    );
    expect(code("packages/engine/src/world/entity-transition-integrity.ts")).toMatch(
      /journaledStageViolation\(\s*store,\s*byKey,\s*tf,\s*entityTransitionStage/,
    );
  });

  it("the temporal coordinator itself was not changed to know entities or transitions", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(
      /world_state|entityTransition|EntityTransition/,
    );
  });
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, cadence or global scan in the entity transition", () => {
  it("the modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence/polling construct", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh)\b/;
    for (const f of ENTITY_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts", () => {
    for (const f of ENTITY_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(ENTITY_SOURCES.filter((f) => /listFacts\(/.test(code(f)))).toEqual([
      "packages/engine/src/world/entity-transition-integrity.ts",
    ]);
  });

  it("declares no calibration constant: only structural numerals appear, and no default, tolerance, rate, duration or capacity", () => {
    for (const f of ENTITY_SOURCES) {
      const text = code(f);
      const numbers = [...text.matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      // 0/1/2: indices, versions (the established version is 1), counters; 3/4: structural list sizes
      // (the transition stage reads four facts); 5: diagnostic issue-list length
      expect(
        numbers.filter((n) => !["0", "1", "2", "3", "4", "5"].includes(n!)),
        f,
      ).toEqual([]);
      expect(text, f).not.toMatch(
        /\b(const|let|var)\s+\w*([tT]olerance|[rR]ate|[dD]uration|[cC]apacity)\b/,
      );
      expect(text, f).not.toMatch(/APPROXIMATE-PARTITION|\.default\(/);
    }
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("no in_transfer state, pathfinding, route family, carrier, hub, capacity, dispatch, KTI, Health, Military, Population or Economy consequence exists in the transition modules — the only Logistics names are the eighth slice's two seams: Logistics' delivery-complete result as a lawful causing result, and the movement guard", () => {
    for (const f of ENTITY_SOURCES) {
      const text = code(f).toLowerCase();
      for (const word of [
        "in_transfer",
        "route",
        "pathfinding",
        "carrier",
        "dispatch",
        "throughput",
        "capacity",
        "kti",
        "health",
        "military",
        "population",
        "price",
        "demand",
        "title",
        "custody_adjudication",
        "death",
        "destroy",
        "fission",
        "fusion",
        "animation",
        "stochastic",
        "random",
        "recurrence",
      ]) {
        expect(text, `${f}: ${word}`).not.toContain(word);
      }
      // the Logistics seams are named by identity only: one kind (the delivery result) and the movement guard
      const named = text.match(/logistics\w*/g) ?? [];
      for (const n of named)
        expect(
          [
            "logistics",
            "logistics_delivery",
            "logisticsboundaryid",
            "logisticscommitmentkey",
            "logisticsdeliverykey",
            "logisticsobjectid",
            "logisticsrequestidofdelivery",
          ],
          `${f}: ${n}`,
        ).toContain(n);
    }
  });

  it("the world module set is exactly the canonical path, the fallback custody and the entity-transition seam; no other engine directory was added", () => {
    expect(readdirSync("packages/engine/src/world").sort()).toEqual([
      "actor-coupling-integrity.ts",
      "actor-coupling.ts",
      "canonical-campaign.ts",
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
      "source-drawdown",
      "temporal",
      "world",
    ]);
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
    for (const forbidden of ["migrations/manifests/entity-transition.json"])
      expect(existsSync(forbidden)).toBe(false);
  });

  it("the predecessors' behavior is unchanged: Production, Economy, Population and the temporal coordinator source files are byte-identical in their owner logic", () => {
    // the only edits outside the entity seam are the additive wiring points named in the tests above
    for (const f of [
      "packages/engine/src/production/derive.ts",
      "packages/engine/src/production/provider.ts",
      "packages/engine/src/production/adapter.ts",
      "packages/engine/src/economy/derive.ts",
      "packages/engine/src/economy/provider.ts",
      "packages/engine/src/economy/admission.ts",
    ])
      expect(code(f), f).not.toMatch(/entityTransition|EntityTransition|world_entity_transition/);
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-02", "IA-03", "IA-04", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence naming the entity-transition tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/entity[ -]transition/i);
      expect(row.partial_evidence?.tests.some((t) => /entity-transition/.test(t))).toBe(true);
    },
  );
  it("every partial-evidence test file exists", () => {
    for (const row of register)
      for (const t of row.partial_evidence?.tests ?? []) expect(existsSync(t), t).toBe(true);
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
    expect(statusOf("CAL-01")).toBe("UNCALIBRATED");
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
