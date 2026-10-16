// Conformance evidence for the Named-Actor Character Capability & Capability-Close Backbone Foundation (ninth slice).
// Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and every other
// F-027 open gate is unchanged.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  NAMED_ACTOR_FACT_KINDS,
  NAMED_ACTOR_RULE,
  NamedActorAdapter,
  TemporalCoordinator,
  WS006_SOURCE,
  WS016_SOURCE,
  namedActorCapabilityCloseProvider,
} from "@immortalis/engine";
import { PACKAGE_FORMAT_VERSION } from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import {
  expectedAdapterMethods,
  expectedKindIds,
  expectedOwnerFacetSet,
} from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";
import { PROTOCOL_ONLY_EVENT_SIGNAL_READ, protocolIndexExports } from "../support/protocol.ts";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
const ACTOR_DIR = "packages/engine/src/actor";
const ACTOR_SOURCES = [
  ...readdirSync(ACTOR_DIR).map((f) => join(ACTOR_DIR, f)),
  "packages/contracts/src/actor-capability.ts",
];

describe("IA-01 source/version fidelity (Named-Actor registration aspect)", () => {
  it("the Named-Actor kinds cite WS-016 at its exact spec-locked pin and the IM-07 lowering, with WS-006's pin, F-017's and the Runtime Contract's in the lineage", () => {
    const ws016 = lock.frozen_sources.find((s) => s.id === "WS-016")!;
    const ws006 = lock.frozen_sources.find((s) => s.id === "WS-006")!;
    expect(WS016_SOURCE).toEqual({ artifact: ws016.url, native_pin: ws016.native_pin });
    expect(WS006_SOURCE).toEqual({ artifact: ws006.url, native_pin: ws006.native_pin });
    expect(ws016.primary_im).toBe("IM-07");
    expect(ws006.primary_im).toBe("IM-07");
    expect(ws016.native_pin).toBe("2026-09-24T17:38:59.210Z");
    expect(ws006.native_pin).toBe("2026-09-25T00:18:36.828Z");
    for (const kind of NAMED_ACTOR_FACT_KINDS) {
      expect(kind.rule).toEqual(NAMED_ACTOR_RULE);
      expect(kind.rule.artifact).toBe(ws016.url);
      expect(kind.rule.native_pin).toBe(ws016.native_pin);
      expect(kind.im).toBe("IM-07");
      expect(kind.rule.supersedes).toBeNull();
    }
    const lineage = NAMED_ACTOR_RULE.authority_lineage.join("\n");
    expect(lineage).toContain(ws006.native_pin);
    expect(lineage).toContain(ws006.url);
    expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
  });

  it("the rule names the clauses the state relies on: ownership, the minimal record, the persistence gate, grade semantics, establishment, the aggregate boundary, the close and the PC handover", () => {
    for (const c of [
      "§2 Runtime Ownership",
      "§3 Minimal Persistent Capability Record",
      "§4 Persistence Gate",
      "§6 Grade Semantics",
      "§7 EX Adapter",
      "§16 Named-Actor Capability Establishment Adapter",
      "§17 Named-Actor Rarity Guard",
      "§20 Aggregate Boundary",
      "§28.1 Single-Contribution Rule",
      "§27.1 Capability Visibility / No Same-Resolution Feedback",
      "§32 Failure Conditions",
      "PC-Control Handover",
    ])
      expect(NAMED_ACTOR_RULE.clause).toContain(c);
  });
});

describe("IA-03 owner exclusivity: the Named-Actor owner holds sparse durable personal mastery only", () => {
  it("registers exactly one new owner, named_actor, with ONE facet and two exclusive create-only actor/capability-keyed key spaces", () => {
    expect(NAMED_ACTOR_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["named_actor_capability_basis", "named_actor", "actor_profile", "SEALED"],
      ["named_actor_capability", "named_actor", "actor_profile", "SEALED"],
    ]);
    expect(CANONICAL_OWNER_REGISTRY.get("named_actor")).toEqual(
      expectedOwnerFacetSet("named_actor"),
    );
    for (const key of ["actor/a/capability-basis/c", "actor/a/capability/c"])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(1);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "named_actor").map((k) => k.id)).toEqual(
      expectedKindIds({ owner: "named_actor" }),
    );
  });

  it("there is no personality, goal, relationship, belief, mandate, development, loss, lifecycle, KTI, aggregate, PC-capability or numeric-rank kind, and no fallback actor owner", () => {
    // (the eleventh slice's IM-09 KTI owner is the lawful, separate owner of exactly the development kinds this guard names)
    // (the twenty-eighth slice's PC capability profile is the lawful, separate FACET of the one I-002 PC owner `pc_existence`: the
    // `pc_capab…` kinds are exactly the PC-capability kinds this guard names, and are held by that owner, never by the actor owner)
    for (const k of ALL_FACT_KINDS.filter((k) => k.owner !== "kti" && k.owner !== "pc_existence"))
      expect(k.id).not.toMatch(
        /personality|goal|loyalty|relationship|belief|stance|mandate|development|loss|lifecycle|kti|cohort_capab|aggregate|skill|level|xp|rank|pc_capab|holder|referent|alias/,
      );
    const names = [...CANONICAL_OWNER_REGISTRY.keys()].filter(
      (n) => n !== "named_actor" && n !== "epistemic_access" && n !== "kti",
    );
    for (const n of names) expect(n).not.toMatch(/actor|character|capability|skill/);
    expect([...CANONICAL_OWNER_REGISTRY.keys()].filter((n) => /actor/.test(n))).toEqual([
      "named_actor",
    ]);
  });

  it("there is no Named-Actor writer other than the two authored bases: the capability is the close operation only the IM-02 coordinator resolves", () => {
    const methods = adapterMethods(NamedActorAdapter);
    expect(methods).toEqual(expectedAdapterMethods("NamedActorAdapter"));
    expect(namedActorCapabilityCloseProvider.owner).toBe("named_actor");
    expect(namedActorCapabilityCloseProvider.operation).toBe(
      "named-actor-publish-capability-close",
    );
  });

  it("the actor owner never writes a foreign key space, a PC fact, a Population fact or a body: no foreign key builder appears in its adapter or provider", () => {
    for (const f of ACTOR_SOURCES.filter((f) => /adapter|provider/.test(f))) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /pcExistenceContractKey|PLAYER_CHARACTER_BINDING_KEY|populationLedgerKey|worldFallbackEntityKey|OWNER_POPULATION|OWNER_WORLD_STATE/,
      );
    }
  });

  it("the history source and the consumer are clearly synthetic testkit parties and production code never imports the testkit or names a synthetic owner", () => {
    const fixtures = readFileSync("packages/testkit/src/actor-fixtures.ts", "utf8");
    expect(fixtures).toMatch(/SYNTHETIC TEST DATA/);
    expect(fixtures).toMatch(/SYNTHETIC-ACTOR-HISTORY/);
    expect(fixtures).toMatch(/SYNTHETIC-CAPABILITY-CONSUMER/);
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-/);
    }
  });
});

describe("the frozen Character Capability semantics are qualitative: no hidden numeric rank, XP, level or percentage (acceptance 2)", () => {
  it("no contract or engine module defines a numeric value, rate, threshold, modifier, probability, level or default", () => {
    for (const f of ACTOR_SOURCES) {
      const text = code(f);
      const numbers = [...text.matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      // 0/1/2: versions, indices, regex capture-group indices, group sizes and the minimum of a non-empty list; 5: diagnostic issue-list length (as elsewhere)
      expect(
        numbers.filter((n) => !["0", "1", "2", "5"].includes(n!)),
        f,
      ).toEqual([]);
      expect(text, f).not.toMatch(
        /\b(xp|level|percent|probability|modifier|bonus|dice|roll|dc)\b/i,
      );
      expect(text, f).not.toMatch(/z\.number\(|\.default\(|APPROXIMATE-PARTITION/);
    }
  });
});

describe("reuse, not fork: IM-02, IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("there is no second coordinator, journal, scheduler, ledger, save or sidecar: the Named-Actor modules persist nothing themselves", () => {
    for (const f of ACTOR_SOURCES) {
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
    expect(classes.filter((c) => /Actor|Capability/.test(c!))).toEqual([
      "NamedActorAdapter",
      "PcCapabilityAdapter",
    ]);
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
    expect(readdirSync("packages/engine/src/persistence").sort()).toEqual([
      "file-package.ts",
      "fs-ops.ts",
      "store.ts",
    ]);
  });

  it("the Named-Actor owner is reached through the one canonical IM-03/IM-11 admission, object registration through the one kernel path, and commit only through the IM-02 coordinator's owner seam", () => {
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /namedActorGroupCheck\(group, state\)/,
    );
    expect(code("packages/engine/src/temporal/admission.ts")).toMatch(
      /namedActorObjectViolation\(o, state, true\)/,
    );
    expect(code("packages/engine/src/world/canonical-campaign.ts")).toMatch(
      /verifyNamedActorIntegrity\(store\)/,
    );
    expect(adapterMethods(TemporalCoordinator)).toEqual(
      expectedAdapterMethods("TemporalCoordinator"),
    );
  });

  it("the capability close is published only as its IM-02 stage: admission and load verification apply the one shared stage rule (identity and the durable transaction authority), not a copy", () => {
    expect(code(`${ACTOR_DIR}/admission.ts`)).toMatch(
      /stageAuthorityViolation\(\s*group,\s*actorCapabilityStage\(/,
    );
    expect(code(`${ACTOR_DIR}/integrity.ts`)).toMatch(/journaledStageViolation\(/);
    for (const f of ACTOR_SOURCES)
      expect(code(f), f).not.toMatch(
        /function stageAuthorityViolation|function stageIdentityViolation|function stageGroupId|function stageId/,
      );
  });

  it("a Named-Actor stage's identity is its StageKey alone: no horizon, version, retry, consumer or slice participates", () => {
    const contract = code("packages/contracts/src/actor-capability.ts");
    const stage = /actorCapabilityStage = [\s\S]*?\}\);/.exec(contract)![0];
    expect(stage).not.toMatch(/horizon|version|retry|attempt|slice|consumer|transaction|target/i);
  });

  it("the temporal coordinator itself was not changed to know the Named-Actor owner", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(
      /named_actor|NamedActor|actor\//,
    );
  });
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, cadence or global scan in the Named-Actor path", () => {
  it("the modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence/sweep/polling construct", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual)\b/;
    for (const f of ACTOR_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts (no all-actors scan, no actor × skill matrix)", () => {
    for (const f of ACTOR_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(ACTOR_SOURCES.filter((f) => /listFacts\(/.test(code(f)))).toEqual([
      `${ACTOR_DIR}/integrity.ts`,
    ]);
    for (const f of ACTOR_SOURCES)
      expect(code(f), f).not.toMatch(/matrix|roster|allActors|forEachActor|for \(const actor of/i);
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("no personality, goal, loyalty, relationship, belief, mandate, development, KTI, epistemic, collective, institution, Population consequence, PC capability, body or lifecycle construct exists in the Named-Actor modules", () => {
    for (const f of ACTOR_SOURCES) {
      const text = code(f)
        // the source's own list of causes a basis may cite (WS-016 §16 step 1) names KTI, institutions and personality
        .replace(/CAPABILITY_CAUSE_ASPECTS = \[[\s\S]*?\] as const/, "")
        .toLowerCase()
        // the aggregate-identity and PC-authorship guards name the foreign key spaces they refuse, and nothing else
        .replace(
          /populationledgerkey|pcexistencecontractkey|player_character_binding_key|playercharacterbindingschema/g,
          "",
        )
        .replace(/population ledger/g, "")
        .replace(/ledger/g, "");
      for (const word of [
        "personality",
        "loyalty",
        "mandate",
        "relationship",
        "kti",
        "epistemic",
        "accessevent",
        "collective",
        "institution",
        "faction",
        "cohort",
        "population",
        "headcount",
        "migration",
        "embodiment",
        "clone",
        "reincarnat",
        "possession",
        "teaching",
        "student",
        "training",
        "promot",
        "individuat",
        "recurrence",
        "decay",
      ])
        expect(text, `${f}: ${word}`).not.toContain(word);
    }
  });

  it("Character Capability owns no RNG: the randomized branch reaches the shared Causal Draw only, with no sampler, entropy, hash primitive, clock or default prior of its own (CD-CC-01)", () => {
    for (const f of ACTOR_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /Math\.random|node:crypto|randomBytes|randomUUID|getRandomValues|createHmac|createHash|\bseed\b|\broll\b|distribution|Date\.now|new Date|performance\.now/i,
      );
    }
    // the shared layer is named only by the owner operation, the narrow ports, the shared derivation and load verification
    // (admission reaches it through the shared derivation, never directly)
    const naming = ACTOR_SOURCES.filter((f) =>
      /causal-draw|CausalDraw|causalDraw/.test(code(f)),
    ).map((f) => f.replace(`${ACTOR_DIR}/`, ""));
    expect(naming.sort()).toEqual([
      "adapter.ts",
      "derive.ts",
      "integrity.ts",
      "packages/contracts/src/actor-capability.ts",
      "randomized.ts",
    ]);
    // the only entropy-shaped thing the adapter holds is the trusted runtime's source, passed through untouched
    const adapter = code(`${ACTOR_DIR}/adapter.ts`);
    expect(adapter).toContain("new CausalDrawAdapter(");
    expect(adapter).not.toMatch(/Uint8Array|Buffer|crypto|options\.entropy\(/);
  });

  it("the Named-Actor module set is exactly the IM-07 owner path; no other engine directory beyond the ninth slice's was added", () => {
    expect(readdirSync(ACTOR_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
      "randomized.ts",
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
      "pc-collection",
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
    for (const forbidden of ["migrations/manifests/actor.json"])
      expect(existsSync(forbidden)).toBe(false);
  });

  it("the predecessors' owner logic is unchanged: Population, Production, Economy, Logistics and the entity-transition modules never name the Named-Actor owner", () => {
    for (const f of [
      ...walk("packages/engine/src/population"),
      ...walk("packages/engine/src/production"),
      ...walk("packages/engine/src/economy"),
      ...walk("packages/engine/src/logistics"),
      "packages/engine/src/temporal/coordinator.ts",
      "packages/engine/src/world/fallback-custody.ts",
      "packages/engine/src/world/entity-transition.ts",
    ])
      expect(code(f), f).not.toMatch(/named_actor|NamedActor|OWNER_NAMED_ACTOR/);
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-02", "IA-03", "IA-04", "IA-06", "IA-14", "IA-22"])(
    "%s gained narrowly scoped partial evidence naming the Named-Actor tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/Named-Actor/);
      expect(row.partial_evidence?.tests.some((t) => /actor/.test(t))).toBe(true);
    },
  );
  it("IA-14's partial evidence is the actor-side authorship boundary only: PC capability, existing-actor migration and PC-to-actor resumption are named as not implemented", () => {
    const scope = register.find((r) => r.id === "IA-14")!.partial_evidence!.scope;
    expect(scope).toMatch(/not implemented/i);
    expect(scope).toMatch(/PC capability/);
  });
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
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    expect(statusOf("CAL-01")).toBe("UNCALIBRATED");
    expect(statusOf("OB-016")).toBe("OPEN_CODE_ERA_CONFORMANCE");
  });
  it("the acceptance register and lock still agree on the register's own hash", () => {
    expect(lock.snapshot_files["spec/f027/acceptance-register.yaml"]).toMatch(/^[0-9a-f]{64}$/);
  });
});
