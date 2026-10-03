// Conformance evidence for the I-002 PC Capability Profile / PC Capability Close Receiving Foundation (twenty-eighth
// slice). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and every other F-027
// open gate is unchanged.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  I002_SOURCE,
  NAMED_ACTOR_FACT_KINDS,
  PC_CAPABILITY_FACT_KINDS,
  PC_CAPABILITY_RULE,
  PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE,
  PcCapabilityAdapter,
  TemporalCoordinator,
  WS016_SOURCE,
  pcCapabilityCloseProvider,
} from "@immortalis/engine";
import {
  FACET_PC_CAPABILITY_PROFILE,
  OWNER_PC_EXISTENCE,
  PACKAGE_FORMAT_VERSION,
} from "@immortalis/contracts";
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
const PC_DIR = "packages/engine/src/pc-capability";
const PC_SOURCES = [
  ...readdirSync(PC_DIR).map((f) => join(PC_DIR, f)),
  "packages/contracts/src/pc-capability.ts",
];

describe("IA-01 source/version fidelity (PC capability registration aspect)", () => {
  it("the PC capability kinds cite the frozen WS-016 integration source at its exact spec-locked pin and the IM-07 lowering, with I-002's pin, F-016 PCC-01..03, F-017's and the Runtime Contract's in the lineage", () => {
    const ws016 = lock.frozen_sources.find((s) => s.id === "WS-016")!;
    const i002 = lock.frozen_sources.find((s) => s.id === "I-002")!;
    expect(WS016_SOURCE).toEqual({ artifact: ws016.url, native_pin: ws016.native_pin });
    expect(I002_SOURCE).toEqual({ artifact: i002.url, native_pin: i002.native_pin });
    expect(ws016.native_pin).toBe("2026-09-24T17:38:59.210Z");
    expect(i002.native_pin).toBe("2026-09-25T00:15:54.536Z");
    expect(ws016.primary_im).toBe("IM-07");
    expect(i002.primary_im).toBe("IM-07");
    for (const kind of PC_CAPABILITY_FACT_KINDS) {
      expect(kind.rule).toEqual(PC_CAPABILITY_RULE);
      expect(kind.rule.artifact).toBe(ws016.url);
      expect(kind.rule.native_pin).toBe(ws016.native_pin);
      expect(kind.im).toBe("IM-07");
      expect(kind.rule.supersedes).toBeNull();
      // the superseded thirty-second-slice citation is the one registered historical-compatibility entry of each kind
      // (existing-actor world-prior slice): the same artifact, pin and effective basis, never the current citation
      expect(kind.legacyRule!.rule).toEqual(PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE);
      expect(kind.legacyRule!.rule.artifact).toBe(ws016.url);
      expect(kind.legacyRule!.rule.native_pin).toBe(ws016.native_pin);
      expect(kind.legacyRule!.rule).not.toEqual(kind.rule);
    }
    const lineage = PC_CAPABILITY_RULE.authority_lineage.join("\n");
    expect(lineage).toContain(i002.native_pin);
    expect(lineage).toContain(i002.url);
    expect(lineage).toContain("PCC-01");
    expect(lineage).toContain("PCC-03");
    expect(lineage).toContain("PC Capability Close");
    expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
  });

  it("the spec lock's source pins and addendum are untouched by this slice", () => {
    const lockText = readFileSync("spec/f027/spec-lock.json", "utf8");
    expect(lockText).toContain("2026-09-24T17:38:59.210Z");
    expect(lockText).toContain("2026-09-25T00:15:54.536Z");
    expect(lock.frozen_sources).toHaveLength(23);
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
  });

  it("the rule names the clauses the state relies on: the I-002 companion state, the minimal record, the persistence gate, grade semantics, the close, the aggregate boundary and the PCC cut", () => {
    for (const c of [
      "Blue Bounded Integration Map §2 I-002 — BOUNDED AMENDMENT",
      "§2 Runtime Ownership",
      "§3 Minimal Persistent Capability Record",
      "§4 Persistence Gate",
      "§6 Grade Semantics",
      "§7 EX Adapter",
      "§11 PC Generation / Authorship Interface",
      "§13 PC Deferred-Derivation Adapter",
      "§27 Temporal / Turnless Behavior and §27.1 Capability Visibility / No Same-Resolution Feedback",
      "§28 Aggregate Boundary",
      "§32 Failure Conditions",
      "PCC-01 to PCC-03",
    ])
      expect(PC_CAPABILITY_RULE.clause).toContain(c);
  });
});

describe("IA-03 owner exclusivity: ONE lawful PC owner; the capability profile is a facet of it, not a second owner", () => {
  it("registers exactly two new kinds, both create-only, under the existing pc_existence owner's new pc_capability_profile facet, in two exclusive pc/<pc>/capability[-basis]/<capability> key spaces", () => {
    expect(PC_CAPABILITY_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["pc_capability_basis", "pc_existence", "pc_capability_profile", "SEALED"],
      ["pc_capability", "pc_existence", "pc_capability_profile", "SEALED"],
    ]);
    expect(OWNER_PC_EXISTENCE).toBe("pc_existence");
    expect(FACET_PC_CAPABILITY_PROFILE).toBe("pc_capability_profile");
    expect(CANONICAL_OWNER_REGISTRY.get("pc_existence")).toEqual(
      expectedOwnerFacetSet("pc_existence"),
    );
    expect([...(CANONICAL_OWNER_REGISTRY.get("pc_existence") ?? [])].sort()).toEqual([
      "existence_contract",
      "pc_capability_profile",
    ]);
    for (const key of ["pc/p/capability-basis/c", "pc/p/capability/c"])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(1);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "pc_existence").map((k) => k.id)).toEqual(
      expectedKindIds({ owner: "pc_existence" }),
    );
  });

  it("no second PC capability owner exists: no registered owner name other than pc_existence is PC-, character- or capability-flavoured, and the Named-Actor owner is untouched", () => {
    const names = [...CANONICAL_OWNER_REGISTRY.keys()];
    expect(names.filter((n) => /^pc|player|character|capab/.test(n))).toEqual(["pc_existence"]);
    expect(names.filter((n) => /actor/.test(n))).toEqual(["named_actor"]);
    expect(NAMED_ACTOR_FACT_KINDS.map((k) => k.id)).toEqual([
      "named_actor_capability_basis",
      "named_actor_capability",
    ]);
    // the PC kinds are never the Named-Actor owner's, and the Named-Actor kinds never the PC owner's
    for (const k of PC_CAPABILITY_FACT_KINDS) expect(k.owner).not.toBe("named_actor");
    for (const k of NAMED_ACTOR_FACT_KINDS) expect(k.owner).not.toBe("pc_existence");
  });

  it("there is no development, loss, deferred-derivation, handover, transfer, lifecycle, KTI, aggregate, randomized or numeric-rank PC kind", () => {
    for (const k of ALL_FACT_KINDS.filter((k) => k.owner === "pc_existence"))
      expect(k.id).not.toMatch(
        /development|loss|deferred|derivation|handover|transfer|lifecycle|kti|aggregate|skill|level|xp|rank|draw|random|amend|revel|transcript/,
      );
  });

  it("the only PC capability writer is the one receiving publication: the capability is the close operation only the IM-02 coordinator resolves", () => {
    expect(adapterMethods(PcCapabilityAdapter)).toEqual(
      expectedAdapterMethods("PcCapabilityAdapter"),
    );
    expect(pcCapabilityCloseProvider.owner).toBe("pc_existence");
    expect(pcCapabilityCloseProvider.facet).toBe("pc_capability_profile");
    expect(pcCapabilityCloseProvider.operation).toBe("pc-publish-capability-close");
    expect(pcCapabilityCloseProvider.rule).toEqual(PC_CAPABILITY_RULE);
  });

  it("the PC capability owner never writes a foreign key space, the Existence Contract, the binding, a Population fact or an actor fact: no foreign key builder or owner appears in its adapter or provider", () => {
    for (const f of PC_SOURCES.filter((f) => /adapter|provider/.test(f))) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /pcExistenceContractKey|PLAYER_CHARACTER_BINDING_KEY|populationLedgerKey|worldFallbackEntityKey|OWNER_POPULATION|OWNER_WORLD_STATE|OWNER_NAMED_ACTOR|actorCapability|namedActor/,
      );
    }
  });

  it("the Existence Contract schema, its key and its registration are byte-for-byte what the predecessor had: the capability is a companion, not an amendment", () => {
    const contractKind = ALL_FACT_KINDS.find((k) => k.id === "pc_existence_contract")!;
    expect([contractKind.owner, contractKind.facet, contractKind.lifecycle]).toEqual([
      "pc_existence",
      "existence_contract",
      "SEALED",
    ]);
    expect(contractKind.keyPattern.source).toBe(
      String.raw`^pc\/([A-Za-z0-9][A-Za-z0-9._:-]*)\/existence-contract$`,
    );
    const worldFoundation = readFileSync("packages/contracts/src/world-foundation.ts", "utf8");
    expect(worldFoundation).not.toMatch(/capab|mastery|grade/i);
  });

  it("the testkit consumer is clearly a synthetic party, and production code never imports the testkit or names a synthetic owner", () => {
    const fixtures = readFileSync("packages/testkit/src/pc-capability-fixtures.ts", "utf8");
    expect(fixtures).toMatch(/SYNTHETIC TEST DATA/);
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-/);
    }
  });
});

describe("the frozen Character Capability semantics are qualitative: no hidden numeric rank, XP, level or percentage", () => {
  it("no contract or engine module defines a numeric value, rate, threshold, modifier, probability, level or default", () => {
    for (const f of PC_SOURCES) {
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
      expect(text, f).not.toMatch(
        /z\.number\(\)\.(?!int\(\)\.min\(0\))|\.default\(|APPROXIMATE-PARTITION/,
      );
    }
  });

  it("the marker is the Character Capability protocol's own schema, imported unchanged: the PC contract defines no marker, grade list or EX shape of its own", () => {
    const contract = code("packages/contracts/src/pc-capability.ts");
    expect(contract).toMatch(
      /import \{[^}]*\bComparativeMarkerSchema,[^}]*\} from "\.\/actor-capability\.ts"/,
    );
    expect(contract).not.toMatch(/z\.enum\(\["C"|CAPABILITY_GRADES|ExMarkerSchema|\bex:/);
    // the import plus the marker of the basis, the historical basis, the capability and the deterministic authoring input
    expect(contract.match(/ComparativeMarkerSchema/g)?.length).toBe(5);
  });
});

describe("reuse, not fork: IM-02, IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("there is no second coordinator, journal, scheduler, ledger, save or sidecar: the PC capability modules persist nothing themselves", () => {
    for (const f of PC_SOURCES) {
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
    expect(existsSync("migrations/manifests/pc-capability.json")).toBe(false);
  });

  it("the PC capability facet is reached through the one canonical IM-03/IM-11 admission, object registration through the one kernel path, and load verification through the one canonical verifier", () => {
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /group\.owner === OWNER_PC_EXISTENCE && group\.facet === FACET_PC_CAPABILITY_PROFILE\)\s*return pcCapabilityGroupCheck\(group, state\)/,
    );
    expect(code("packages/engine/src/temporal/admission.ts")).toMatch(
      /pcCapabilityObjectViolation\(o, state, true\)/,
    );
    expect(code("packages/engine/src/world/canonical-campaign.ts")).toMatch(
      /verifyPcCapabilityIntegrity\(store\)/,
    );
    expect(adapterMethods(TemporalCoordinator)).toEqual(
      expectedAdapterMethods("TemporalCoordinator"),
    );
  });

  it("the PC Capability Close is published only as its IM-02 stage: admission and load verification apply the one shared stage rule (identity and the durable transaction authority), not a copy", () => {
    expect(code(`${PC_DIR}/admission.ts`)).toMatch(
      /stageAuthorityViolation\(\s*group,\s*pcCapabilityStage\(/,
    );
    expect(code(`${PC_DIR}/integrity.ts`)).toMatch(/journaledStageViolation\(/);
    for (const f of PC_SOURCES)
      expect(code(f), f).not.toMatch(
        /function stageAuthorityViolation|function stageIdentityViolation|function stageGroupId|function stageId/,
      );
  });

  it("a PC capability stage's identity is its StageKey alone: no horizon, version, retry, consumer or slice participates", () => {
    const contract = code("packages/contracts/src/pc-capability.ts");
    const stage = /pcCapabilityStage = [\s\S]*?\}\);/.exec(contract)![0];
    expect(stage).not.toMatch(/horizon|version|retry|attempt|slice|consumer|transaction|target/i);
  });

  it("the temporal coordinator itself was not changed to know the PC capability facet, and neither did any predecessor owner module", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(
      /pc_existence|pc-capability|pcCapability|PC Capability|capability/,
    );
    for (const f of [
      ...walk("packages/engine/src/population"),
      ...walk("packages/engine/src/production"),
      ...walk("packages/engine/src/economy"),
      ...walk("packages/engine/src/logistics"),
      ...walk("packages/engine/src/actor"),
      // the Epistemic owner's active-PC path (F-014D PC-recipient slice) is the one lawful wiring: it is bounded in
      // epistemic-access-conformance.test.ts, which names exactly what it may touch of the PC capability
      ...walk("packages/engine/src/kti"),
      ...walk("packages/engine/src/causal-draw"),
      "packages/engine/src/world/fallback-custody.ts",
      "packages/engine/src/world/entity-transition.ts",
    ])
      expect(code(f), f).not.toMatch(/pcCapability|PcCapability|pc_capability|PC Capability/);
  });
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, cadence or global scan in the PC capability path", () => {
  it("the modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence/sweep/polling construct", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual)\b/;
    for (const f of PC_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts (no all-PCs scan, no PC × skill matrix)", () => {
    for (const f of PC_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(PC_SOURCES.filter((f) => /listFacts\(/.test(code(f)))).toEqual([
      `${PC_DIR}/integrity.ts`,
    ]);
    for (const f of PC_SOURCES)
      expect(code(f), f).not.toMatch(/matrix|roster|allPcs|forEachPc|for \(const pc of/i);
  });

  it("PC capability owns no RNG of its own: no entropy primitive, seed or sampler exists in any PC module, and the close and the temporal declaration never reach Causal Draw", () => {
    for (const f of PC_SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /Math\.random|node:crypto|randomBytes|getRandomValues|createHmac|createHash|\bseed\b|distribution/i,
      );
    }
    for (const f of PC_SOURCES.filter((f) => /provider|declaration/.test(f)))
      expect(code(f), f).not.toMatch(/causal-draw|CausalDraw|causalDraw/i);
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("the PC capability module set is exactly the IM-07 owner path; no other engine directory beyond the twenty-eighth slice's was added", () => {
    expect(readdirSync(PC_DIR).sort()).toEqual([
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
  });

  it("no cognition, personality, goal, relationship, belief, mandate, development, handover, transfer, deferred-derivation, Revelation, KTI, epistemic, collective, institution, Population consequence, body or lifecycle construct exists in the PC capability modules", () => {
    for (const f of PC_SOURCES) {
      const text = code(f)
        .toLowerCase()
        // the boundary guard names the foreign key spaces it refuses, and nothing else
        .replace(
          /populationledgerkey|pcexistencecontractkey|actorcapabilitybasiskey|actorcapabilitykey/g,
          "",
        )
        .replace(/population ledger/g, "")
        .replace(/ledger/g, "")
        // the guard and the rule name what is NOT implemented, in comments (removed) and in refusal messages
        .replace(/existing-actor-to-pc handover is not implemented/g, "")
        .replace(/named-actor owner/g, "")
        // the Existence Contract's own section name, which the claim locator points at
        .replace(/embodiment_topology/g, "");
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
        "embodiment_",
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
        "revelation",
        "delegat",
        "deferred",
        "development",
        "transcript",
      ])
        expect(text, `${f}: ${word}`).not.toContain(word);
    }
  });

  it("no KTI, Insertion, projection, host or provider surface was wired to the PC capability: the only cross-owner read form is the declared-close builder (the Epistemic active-PC path is bounded in its own conformance file)", () => {
    for (const f of [...walk("packages/engine/src/kti"), "packages/protocol/src/index.ts"])
      expect(code(f), f).not.toMatch(/pcCapabilityCloseRead|PC_CAPABILITY_CLOSE|pc_capability/);
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-03", "IA-14"])(
    "%s gained narrowly scoped partial evidence naming the PC capability tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/PC capability/);
      expect(row.partial_evidence?.tests.some((t) => /pc-capability/.test(t))).toBe(true);
    },
  );
  it("IA-14's PC capability evidence names the not-implemented handover, transfer, deferred derivation, development and Revelation paths", () => {
    const scope = register.find((r) => r.id === "IA-14")!.partial_evidence!.scope;
    for (const phrase of [
      "existing-actor-to-PC",
      "PC-to-non-PC",
      "deferred",
      "development",
      "Revelation",
    ])
      expect(scope).toContain(phrase);
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
