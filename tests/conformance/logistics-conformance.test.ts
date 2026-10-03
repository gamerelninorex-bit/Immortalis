// Conformance evidence for the Single-Leg Logistics Transfer & Destination Handoff Backbone Foundation (eighth
// slice). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and every other
// F-027 open gate is unchanged.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  LOGISTICS_FACT_KINDS,
  LOGISTICS_RULE,
  LogisticsAdapter,
  TemporalCoordinator,
  WS010_SOURCE,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
} from "@immortalis/engine";
import { PACKAGE_FORMAT_VERSION } from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import {
  expectedAdapterMethods,
  expectedKindIds,
  expectedOwnerFacetSet,
} from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
const LOGISTICS_DIR = "packages/engine/src/logistics";
const LOGISTICS_SOURCES = [
  ...readdirSync(LOGISTICS_DIR).map((f) => join(LOGISTICS_DIR, f)),
  "packages/contracts/src/logistics.ts",
];

describe("IA-01 source/version fidelity (Logistics registration aspect)", () => {
  it("the Logistics kinds cite WS-010 at its exact spec-locked pin and the IM-05 lowering, with F-017's and F-016's pins in the lineage", () => {
    const ws010 = lock.frozen_sources.find((s) => s.id === "WS-010")!;
    expect(WS010_SOURCE).toEqual({ artifact: ws010.url, native_pin: ws010.native_pin });
    expect(ws010.primary_im).toBe("IM-05");
    expect(ws010.native_pin).toBe("2026-09-25T02:18:10.619Z");
    for (const kind of LOGISTICS_FACT_KINDS) {
      expect(kind.rule).toEqual(LOGISTICS_RULE);
      expect(kind.rule.artifact).toBe(ws010.url);
      expect(kind.rule.native_pin).toBe(ws010.native_pin);
      expect(kind.im).toBe("IM-05");
      expect(kind.rule.supersedes).toBeNull();
    }
    const lineage = LOGISTICS_RULE.authority_lineage.join("\n");
    expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
    expect(lineage).toContain("2026-09-25T13:45:28.162Z"); // F-016 v0.4 successor delta (ECT-01) pin
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
  });

  it("the rule names the clauses the state relies on: ownership, the request envelope, the commitment, the transfer record, the movement locus, completion and the handshake", () => {
    for (const c of [
      "§2.1 Logistics owns",
      "§2.2 Logistics does not own",
      "§3.1 Movement Service Request",
      "§3.2 Movement-Service Commitment",
      "§3.4 Transfer Record",
      "§10.1 Authoritative movement locus",
      "§10.4 Completion",
      "§11 Dispatch is not delivery",
      "§23 Cross-owner completion handshake",
      "§27 Failure conditions",
    ])
      expect(LOGISTICS_RULE.clause).toContain(c);
  });
});

describe("IA-03 owner exclusivity: Logistics owns movement-service state only", () => {
  it("registers exactly one new owner, Logistics, with ONE facet and three exclusive entity-keyed key spaces", () => {
    expect(LOGISTICS_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["logistics_commitment", "logistics", "logistics_state", "ADVANCING"],
      ["logistics_transfer", "logistics", "logistics_state", "ADVANCING"],
      ["logistics_delivery", "logistics", "logistics_state", "SEALED"],
    ]);
    expect(CANONICAL_OWNER_REGISTRY.get("logistics")).toEqual(expectedOwnerFacetSet("logistics"));
    for (const key of [
      "logistics/commitment/w/e",
      "logistics/transfer/w/e",
      "logistics/delivery/w/e",
      "world/w/entity/durable:o",
      "world/w/entity/durable:o/transition",
    ])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(1);
    // no Logistics key lives outside the entity-keyed spaces, and no Route Family / hub / carrier / inventory kind exists
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "logistics").map((k) => k.id)).toEqual(
      expectedKindIds({ owner: "logistics" }),
    );
    for (const k of ALL_FACT_KINDS)
      expect(k.id).not.toMatch(/route|hub|carrier|capacity|inventory|asset|recurring/);
  });

  it("there is no Logistics writer other than the commitment and the dispatch: the delivery result and the retirement are owner operations only the IM-02 coordinator resolves", () => {
    const methods = adapterMethods(LogisticsAdapter);
    expect(methods).toEqual(expectedAdapterMethods("LogisticsAdapter"));
    expect(
      methods
        .filter((m) =>
          /set|update|write|retire|release|deliver|cancel|reroute|divert|arrive|complete/i.test(m),
        )
        .sort(),
    ).toEqual(["delivery"]); // a read, by identity
    expect(logisticsDeliveryProvider.owner).toBe("logistics");
    expect(logisticsDeliveryProvider.operation).toBe("logistics-establish-delivery");
    expect(logisticsRetirementProvider.owner).toBe("logistics");
    expect(logisticsRetirementProvider.operation).toBe("logistics-retire-transfer");
  });

  it("Logistics never writes the entity or World-State's transition: neither key builder nor writer appears in its modules", () => {
    for (const f of LOGISTICS_SOURCES.filter((f) => /adapter|provider/.test(f))) {
      const text = code(f);
      expect(text, f).not.toMatch(/OWNER_WORLD_STATE[^;]*expected_version/);
      expect(text, f).not.toMatch(
        /\b(set|move|relocate|write|update)(Entity|Locus|Location)\w*\s*\(/,
      );
    }
    // the providers and the adapter publish under Logistics' own owner/facet only
    expect(code(`${LOGISTICS_DIR}/adapter.ts`)).not.toMatch(
      /world_fallback_entity|world_entity_transition/,
    );
  });

  it("the request is a clearly synthetic testkit source and production code never imports the testkit or names a synthetic owner", () => {
    const fixtures = readFileSync("packages/testkit/src/logistics-fixtures.ts", "utf8");
    expect(fixtures).toMatch(/SYNTHETIC TEST DATA/);
    expect(fixtures).toMatch(/SYNTHETIC-MOVEMENT-REQUESTER/);
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-/);
    }
  });

  it("the accepted entity is not amended and the entity-transition mechanism is reused unchanged in kind: the kinds are still SEALED, one transition slot per entity", () => {
    expect(ALL_FACT_KINDS.find((k) => k.id === "world_fallback_entity")!.lifecycle).toBe("SEALED");
    expect(ALL_FACT_KINDS.find((k) => k.id === "world_entity_transition")!.lifecycle).toBe(
      "SEALED",
    );
    expect(ALL_FACT_KINDS.find((k) => k.id === "logistics_delivery")!.lifecycle).toBe("SEALED");
  });
});

describe("reuse, not fork: IM-02, IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("there is no second coordinator, journal, scheduler, ledger, save or sidecar: the Logistics modules persist nothing themselves", () => {
    for (const f of LOGISTICS_SOURCES) {
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
    expect(classes.filter((c) => /Logistics/.test(c!))).toEqual(["LogisticsAdapter"]);
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
    expect(readdirSync("packages/engine/src/persistence").sort()).toEqual([
      "file-package.ts",
      "fs-ops.ts",
      "store.ts",
    ]);
  });

  it("Logistics is reached through the one canonical IM-03/IM-11 admission, object registration through the one kernel path, and commit only through the IM-02 coordinator's owner seam", () => {
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /logisticsGroupCheck\(group, state\)/,
    );
    expect(code("packages/engine/src/temporal/admission.ts")).toMatch(
      /logisticsObjectViolation\(o, state, true\)/,
    );
    expect(code("packages/engine/src/world/canonical-campaign.ts")).toMatch(
      /verifyLogisticsIntegrity\(store\)/,
    );
    expect(adapterMethods(TemporalCoordinator)).toEqual(
      expectedAdapterMethods("TemporalCoordinator"),
    );
  });

  it("both Logistics stages are published only as IM-02 stages: admission and load verification apply the one shared stage rule (identity and the durable transaction authority)", () => {
    const admission = code(`${LOGISTICS_DIR}/admission.ts`);
    expect(admission).toMatch(/stageAuthorityViolation\(\s*group,\s*logisticsDeliveryStage\(/);
    expect(admission).toMatch(/stageAuthorityViolation\(\s*group,\s*logisticsRetirementStage\(/);
    const integrity = code(`${LOGISTICS_DIR}/integrity.ts`);
    expect(integrity).toMatch(
      /journaledStageViolation\(\s*store,\s*byKey,\s*df,\s*logisticsDeliveryStage/,
    );
    expect(integrity).toMatch(/logisticsRetirementStage/);
    // the shared rule itself was not copied or special-cased
    expect(code("packages/engine/src/production/admission.ts")).not.toMatch(/logistics/i);
    for (const f of LOGISTICS_SOURCES)
      expect(code(f), f).not.toMatch(
        /function stageAuthorityViolation|function stageIdentityViolation/,
      );
  });

  it("the destination handoff is World-State's existing ECT-01 stage, reused: the transition stage is declared by the Logistics object through the existing declaration, and is not reimplemented", () => {
    expect(code(`${LOGISTICS_DIR}/declaration.ts`)).toMatch(/entityTransitionDeclaration\(/);
    for (const f of LOGISTICS_SOURCES)
      expect(code(f), f).not.toMatch(
        /deriveEntityTransition\(|EntityTransitionCloseSchema\.(parse|safeParse)\(\{/,
      );
  });

  it("the temporal coordinator itself was not changed to know Logistics", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(/logistics|Logistics/);
  });
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, cadence or global scan in Logistics", () => {
  it("the modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence/polling construct", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh)\b/;
    for (const f of LOGISTICS_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts", () => {
    for (const f of LOGISTICS_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(LOGISTICS_SOURCES.filter((f) => /listFacts\(/.test(code(f)))).toEqual([
      `${LOGISTICS_DIR}/integrity.ts`,
    ]);
  });

  it("declares no calibration constant: only structural numerals appear, and no default, tolerance, rate, duration, travel time or capacity", () => {
    for (const f of LOGISTICS_SOURCES) {
      const text = code(f);
      const numbers = [...text.matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      // 0/1/2: indices, versions (the establishment is 1, a retirement 2), counters; 5: diagnostic issue-list length
      expect(
        numbers.filter((n) => !["0", "1", "2", "5"].includes(n!)),
        f,
      ).toEqual([]);
      expect(text, f).not.toMatch(
        /\b(const|let|var)\s+\w*([tT]olerance|[rR]ate|[dD]uration|[cC]apacity|[tT]ravel)\b/,
      );
      expect(text, f).not.toMatch(/APPROXIMATE-PARTITION|\.default\(/);
    }
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("no routing, pathfinding, Route Family, carrier, hub, transshipment, capacity, contention, priority, rerouting, diversion, loss, spoilage, partial delivery, recurring commitment, labor, KTI, Health, Military or Population consequence exists in the Logistics modules", () => {
    for (const f of LOGISTICS_SOURCES) {
      const text = code(f)
        .toLowerCase()
        .replace(/priority_authority_ref/g, "");
      for (const word of [
        "pathfind",
        "route",
        "carrier",
        "hub",
        "transship",
        "capacity",
        "throughput",
        "contention",
        "priority",
        "reroute",
        "divert",
        "diversion",
        "spoil",
        "loss",
        "partial",
        "recurring",
        "labor",
        "kti",
        "health",
        "military",
        "population",
        "migration",
        "price",
        "demand",
        "market",
        "inventory",
        "seiz",
        "abandon",
        "theft",
        "damage",
        "random",
        "recurrence",
      ])
        expect(text, `${f}: ${word}`).not.toContain(word);
    }
  });

  it("the Logistics module set is exactly the IM-05 Logistics owner path; no other engine directory was added", () => {
    expect(readdirSync(LOGISTICS_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "locus.ts",
      "provider.ts",
    ]);
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
      "production",
      "temporal",
      "world",
    ]);
    expect(readFileSync("packages/protocol/src/index.ts", "utf8")).not.toMatch(/export (?!\{\})/);
    for (const forbidden of ["migrations/manifests/logistics.json"])
      expect(existsSync(forbidden)).toBe(false);
  });

  it("the predecessors' owner logic is unchanged: Production, Economy, Population and the temporal coordinator never name Logistics; the entity-transition modules name it only at their two additive seams", () => {
    for (const f of [
      "packages/engine/src/production/derive.ts",
      "packages/engine/src/production/provider.ts",
      "packages/engine/src/production/adapter.ts",
      "packages/engine/src/production/admission.ts",
      "packages/engine/src/economy/derive.ts",
      "packages/engine/src/economy/provider.ts",
      "packages/engine/src/economy/admission.ts",
      "packages/engine/src/temporal/coordinator.ts",
      "packages/engine/src/world/fallback-custody.ts",
    ])
      expect(code(f), f).not.toMatch(/logistics|Logistics/);
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-02", "IA-03", "IA-04", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence naming the Logistics tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/Logistics/);
      expect(row.partial_evidence?.tests.some((t) => /logistics/.test(t))).toBe(true);
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
