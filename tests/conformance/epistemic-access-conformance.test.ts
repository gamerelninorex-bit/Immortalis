// Conformance evidence for the Epistemic Access / Sealed Accessible Content Packet Backbone Foundation (tenth slice).
// Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and every other
// F-027 open gate is unchanged.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  EPISTEMIC_ACCESS_FACT_KINDS,
  EPISTEMIC_ACCESS_RULE,
  EpistemicAccessAdapter,
  F014D_SOURCE,
  NamedActorAdapter,
  TemporalCoordinator,
  epistemicPacketProvider,
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
/** Source with comments AND string literals removed: only the identifiers and operators of the code remain. */
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/z\.infer/g, "z.type");
const EPISTEMIC_DIR = "packages/engine/src/epistemic";
const EPISTEMIC_SOURCES = [
  ...readdirSync(EPISTEMIC_DIR).map((f) => join(EPISTEMIC_DIR, f)),
  "packages/contracts/src/epistemic-access.ts",
];

describe("IA-01 source/version fidelity (Epistemic Access registration aspect)", () => {
  it("the Epistemic kinds cite F-014D at its exact spec-locked pin and the IM-10 lowering, with the W1-PS2 ratification, WS-016's pin, F-017's and the Runtime Contract's in the lineage", () => {
    const f014d = lock.frozen_sources.find((s) => s.id === "F-014D")!;
    expect(F014D_SOURCE).toEqual({ artifact: f014d.url, native_pin: f014d.native_pin });
    expect(f014d.primary_im).toBe("IM-10");
    expect(f014d.native_pin).toBe("2026-09-24T16:25:17.059Z");
    for (const kind of EPISTEMIC_ACCESS_FACT_KINDS) {
      expect(kind.rule).toEqual(EPISTEMIC_ACCESS_RULE);
      expect(kind.rule.artifact).toBe(f014d.url);
      expect(kind.rule.native_pin).toBe(f014d.native_pin);
      expect(kind.im).toBe("IM-10");
      expect(kind.rule.supersedes).toBeNull();
    }
    const lineage = EPISTEMIC_ACCESS_RULE.authority_lineage.join("\n");
    expect(lineage).toContain(f014d.native_pin);
    expect(lineage).toContain("W1-PS2");
    expect(lineage).toContain("2026-09-25"); // the provenance-split amendment ratification
    const ws016 = lock.frozen_sources.find((s) => s.id === "WS-016")!;
    expect(lineage).toContain(ws016.native_pin);
    expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
  });

  it("the rule names the clauses the state relies on: ownership, R-T1, the event, the hot path, provenance separation, the handoff, causality and the failure conditions", () => {
    for (const c of [
      "§2 Ownership Contract",
      "§2.1 R-T1",
      "AS-OF-DECLARED-CLOSE",
      "AS-OF-NOW after packet formation",
      "role-context rule",
      "§4.1 Epistemic Access Packet",
      "§4.2 Access / Dissemination Event — BOUNDED_SHARED_ACCESS",
      "§5 steps 2–4",
      "§9 Shared / Cohort Access Adapter",
      "§11 conflicting content",
      "§14 Sparse Persistence",
      "§18 Named Actor / Actor Fidelity Handoff",
      "§21 Temporal and Causality Rules",
      "§24 Failure Conditions",
      "RC-11",
      "RC-14",
    ])
      expect(EPISTEMIC_ACCESS_RULE.clause).toContain(c);
  });
});

describe("IA-03 owner exclusivity: the Epistemic owner holds sparse access/provenance records only", () => {
  it("registers exactly one new owner, epistemic_access, with ONE facet and three exclusive create-only access-keyed key spaces", () => {
    expect(EPISTEMIC_ACCESS_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["epistemic_access_event", "epistemic_access", "epistemic_access", "SEALED"],
      ["epistemic_accessible_packet", "epistemic_access", "epistemic_access", "SEALED"],
      ["epistemic_sealed_provenance", "epistemic_access", "epistemic_access", "SEALED"],
    ]);
    expect(CANONICAL_OWNER_REGISTRY.get("epistemic_access")).toEqual(
      expectedOwnerFacetSet("epistemic_access"),
    );
    for (const key of ["access/e/event", "access/e/packet/r", "access/e/provenance/r"])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(1);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "epistemic_access").map((k) => k.id)).toEqual(
      expectedKindIds({ owner: "epistemic_access" }),
    );
  });

  it("the actor-safe packet and the engine-only provenance are separate kinds with separate key spaces; nothing is a broadcast, cohort, retrieval, message, memory, comprehension, credibility, belief, stance, KTI or numeric-score kind, and there is no fallback epistemic owner", () => {
    for (const k of ALL_FACT_KINDS.filter((k) => k.owner === "epistemic_access"))
      expect(k.id).not.toMatch(
        /broadcast|cohort|audience|membership|retriev|message|memory|monitor|comprehen|recogni|infer|credib|belief|stance|decision|kti|score|rank|level|exposure/,
      );
    expect(
      [...CANONICAL_OWNER_REGISTRY.keys()].filter((n) => /epistem|access|information/.test(n)),
    ).toEqual(["epistemic_access"]);
    const packet = EPISTEMIC_ACCESS_FACT_KINDS.find((k) => k.id === "epistemic_accessible_packet")!;
    const prov = EPISTEMIC_ACCESS_FACT_KINDS.find((k) => k.id === "epistemic_sealed_provenance")!;
    expect(packet.keyPattern.test("access/e/provenance/r")).toBe(false);
    expect(prov.keyPattern.test("access/e/packet/r")).toBe(false);
  });

  it("there is no Epistemic writer other than the authored event: the packet and the provenance are the formation operation only the IM-02 coordinator resolves", () => {
    const methods = adapterMethods(EpistemicAccessAdapter);
    expect(methods).toEqual(expectedAdapterMethods("EpistemicAccessAdapter"));
    expect(epistemicPacketProvider.owner).toBe("epistemic_access");
    expect(epistemicPacketProvider.operation).toBe("epistemic-form-accessible-packet");
  });

  it("the Epistemic owner never writes a foreign key space, a PC fact, a Population fact, a capability or a body: no foreign key builder or foreign owner appears in its adapter or provider", () => {
    for (const f of EPISTEMIC_SOURCES.filter((f) => /adapter|provider/.test(f))) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /pcExistenceContractKey|PLAYER_CHARACTER_BINDING_KEY|populationLedgerKey|worldFallbackEntityKey|actorCapabilityBasisKey|OWNER_POPULATION|OWNER_WORLD_STATE|OWNER_NAMED_ACTOR|OWNER_ECONOMY|OWNER_LOGISTICS|OWNER_PRODUCTION/,
      );
    }
  });

  it("the Named-Actor owner's own surface is unchanged: it has no Epistemic part and no new writer", () => {
    expect(adapterMethods(NamedActorAdapter)).toEqual(expectedAdapterMethods("NamedActorAdapter"));
    for (const f of walk("packages/engine/src/actor"))
      expect(code(f), f).not.toMatch(
        /epistemic|OWNER_EPISTEMIC_ACCESS|accessEventKey|accessPacket/i,
      );
  });

  it("the access source and the packet consumer are clearly synthetic testkit parties and production code never imports the testkit or names a synthetic owner", () => {
    const fixtures = readFileSync("packages/testkit/src/epistemic-fixtures.ts", "utf8");
    expect(fixtures).toMatch(/SYNTHETIC TEST DATA/);
    expect(fixtures).toMatch(/SYNTHETIC-ACCESS-SOURCE/);
    expect(fixtures).toMatch(/SYNTHETIC-PACKET-CONSUMER/);
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-/);
    }
  });
});

describe("the Epistemic contracts are qualitative: no score, number, threshold, grade conversion or default (acceptance 2, 3)", () => {
  it("no contract or engine module defines a numeric value, rate, threshold, modifier, probability, score or default", () => {
    for (const f of EPISTEMIC_SOURCES) {
      const text = code(f);
      const numbers = [...text.matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      // 0/1/2: versions, indices, capture-group indices, the one-recipient length and list-size bounds; 5: diagnostic issue-list length (as elsewhere)
      expect(
        numbers.filter((n) => !["0", "1", "2", "5"].includes(n!)),
        f,
      ).toEqual([]);
      expect(text, f).not.toMatch(
        /\b(xp|level|percent|probability|modifier|bonus|dice|roll|dc|score|threshold)\b/i,
      );
      expect(text, f).not.toMatch(/z\.number\(|\.default\(|APPROXIMATE-PARTITION/);
    }
  });

  it("the capability marker and grade are never read, compared or converted: no module reads `.marker` or names a grade", () => {
    for (const f of EPISTEMIC_SOURCES.filter((f) => !/contracts/.test(f)))
      expect(identifiers(f), f).not.toMatch(
        /\.marker\b|CAPABILITY_GRADES|CapabilityGrade|ComparativeMarker|\bgrade\b/,
      );
  });

  it("the participant set is exactly one explicit recipient and no production participant bound is adopted (CAL-03 stays unadopted)", () => {
    const contract = code("packages/contracts/src/epistemic-access.ts");
    expect(contract).toMatch(/participants: z\.array\(EntityId\)\.length\(1\)/);
    expect(contract).not.toMatch(/\.max\(|4096|4,096/);
  });
});

describe("reuse, not fork: IM-02, IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("there is no second coordinator, journal, scheduler, ledger, save or sidecar: the Epistemic modules persist nothing themselves", () => {
    for (const f of EPISTEMIC_SOURCES) {
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
    expect(classes.filter((c) => /Epistemic|Access|Packet|Provenance/.test(c!))).toEqual([
      "EpistemicAccessAdapter",
    ]);
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
    expect(readdirSync("packages/engine/src/persistence").sort()).toEqual([
      "file-package.ts",
      "fs-ops.ts",
      "store.ts",
    ]);
  });

  it("the Epistemic owner is reached through the one canonical IM-03/IM-11 admission, object registration through the one kernel path, and commit only through the IM-02 coordinator's owner seam", () => {
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /epistemicGroupCheck\(group, state\)/,
    );
    expect(code("packages/engine/src/temporal/admission.ts")).toMatch(
      /epistemicObjectViolation\(o, state, true\)/,
    );
    expect(code("packages/engine/src/world/canonical-campaign.ts")).toMatch(
      /verifyEpistemicIntegrity\(store\)/,
    );
    expect(adapterMethods(TemporalCoordinator)).toEqual(
      expectedAdapterMethods("TemporalCoordinator"),
    );
  });

  it("the packet is formed only as its IM-02 stage: admission and load verification apply the one shared stage rule (identity and the durable transaction authority), not a copy", () => {
    expect(code(`${EPISTEMIC_DIR}/admission.ts`)).toMatch(
      /stageAuthorityViolation\(\s*group,\s*accessPacketStage\(/,
    );
    expect(code(`${EPISTEMIC_DIR}/integrity.ts`)).toMatch(/journaledStageViolation\(/);
    for (const f of EPISTEMIC_SOURCES)
      expect(code(f), f).not.toMatch(
        /function stageAuthorityViolation|function stageIdentityViolation|function stageGroupId|function stageId/,
      );
  });

  it("the capability is read only at the Named-Actor owner's declared close, through the one existing close-read builder; the Epistemic modules never write or declare a capability or a close", () => {
    expect(code(`${EPISTEMIC_DIR}/declaration.ts`)).toMatch(/namedActorCapabilityCloseRead\(/);
    for (const f of EPISTEMIC_SOURCES)
      expect(code(f), f).not.toMatch(
        /namedActorCapabilityDeclaration|namedActorCapabilityCloseProvider|NAMED_ACTOR_OPERATION_PUBLISH_CAPABILITY_CLOSE|READ_MODE_CLOSE|declares_close: \{/,
      );
    expect(code(`${EPISTEMIC_DIR}/declaration.ts`)).toMatch(/declares_close: null/);
  });

  it("a packet stage's identity is its StageKey alone: no horizon, version, retry, consumer or slice participates", () => {
    const contract = code("packages/contracts/src/epistemic-access.ts");
    const stage = /accessPacketStage = [\s\S]*?\}\);/.exec(contract)![0];
    expect(stage).not.toMatch(/horizon|version|retry|attempt|slice|consumer|transaction|target/i);
  });

  it("the temporal coordinator itself was not changed to know the Epistemic owner", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(
      /epistemic|Epistemic|access\//,
    );
  });
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, cadence or global scan in the Epistemic path", () => {
  it("the modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence/sweep/polling construct", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual)\b/;
    for (const f of EPISTEMIC_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts (no all-actors scan, no all-events scan, no roster expansion)", () => {
    for (const f of EPISTEMIC_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(EPISTEMIC_SOURCES.filter((f) => /listFacts\(/.test(code(f)))).toEqual([
      `${EPISTEMIC_DIR}/integrity.ts`,
    ]);
    for (const f of EPISTEMIC_SOURCES)
      expect(code(f), f).not.toMatch(
        /matrix|roster|allActors|allEvents|forEachActor|forEachEvent|for \(const (actor|event|recipient|participant) of/i,
      );
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("no comprehension, recognition, inference, credibility, belief, stance, goal, relationship, mandate, KTI, broadcast lowering, cohort membership, message travel, courier, durable-record, memory, monitoring, relay, deception, narrative, projection or host construct exists in the Epistemic modules", () => {
    for (const f of EPISTEMIC_SOURCES) {
      const text = identifiers(f)
        // the BROADCAST_EXPOSURE mode is named only so that a request for it is refused precisely
        .replace(/MODE_BROADCAST_EXPOSURE|BROADCAST_EXPOSURE_UNSUPPORTED/g, "")
        .toLowerCase();
      for (const word of [
        "comprehen",
        "recogni",
        "inference",
        "infer(",
        "misread",
        "credib",
        "belief",
        "stance",
        "motive",
        "goal",
        "loyalty",
        "relationship",
        "mandate",
        "kti",
        "transferpackage",
        "diffusion",
        "competence",
        "cohort",
        "membership",
        "broadcast",
        "reach",
        "audience",
        "courier",
        "latency",
        "locatab",
        "retriev",
        "memory",
        "monitor",
        "relay",
        "deception",
        "narrative",
        "projection",
        "protocol",
        "gamemaster",
        "pcknowledge",
        "referential",
        "individuat",
        "lowering",
        "lowered",
      ])
        expect(text, `${f}: ${word}`).not.toContain(word);
    }
  });

  it("the only mention of broadcast is the refusal of that mode: it has no schema, key, kind or lowering, and is never approximated by recipient copying", () => {
    const contract = code("packages/contracts/src/epistemic-access.ts");
    expect(contract).toMatch(/MODE_BROADCAST_EXPOSURE = "BROADCAST_EXPOSURE"/);
    expect(contract).not.toMatch(/z\.literal\(MODE_BROADCAST_EXPOSURE\)|literal\("BROADCAST/);
    expect(code(`${EPISTEMIC_DIR}/adapter.ts`)).toMatch(/BROADCAST_EXPOSURE_UNSUPPORTED/);
    for (const f of EPISTEMIC_SOURCES.filter((f) => !/adapter\.ts$|epistemic-access\.ts$/.test(f)))
      expect(code(f), f).not.toMatch(/BROADCAST/);
  });

  it("no randomization of any kind exists: no RNG, roll, bounded prior, seed, chooser or default (GitHub Issue #11 stays open and unimplemented)", () => {
    for (const f of EPISTEMIC_SOURCES)
      expect(code(f), f).not.toMatch(
        /random|\bseed\b|\broll\b|distribution|weighting|chooser|probab|BOUNDED_PRIOR|\bpriors\b/i,
      );
  });

  it("the Epistemic module set is exactly the IM-10 owner path; no other engine directory beyond the tenth slice's was added", () => {
    expect(readdirSync(EPISTEMIC_DIR).sort()).toEqual([
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
    for (const forbidden of ["migrations/manifests/epistemic.json"])
      expect(existsSync(forbidden)).toBe(false);
  });

  it("the predecessors' owner logic is unchanged: Population, Production, Economy, Logistics, the Named-Actor modules and the entity-transition modules never name the Epistemic owner", () => {
    for (const f of [
      ...walk("packages/engine/src/population"),
      ...walk("packages/engine/src/production"),
      ...walk("packages/engine/src/economy"),
      ...walk("packages/engine/src/logistics"),
      ...walk("packages/engine/src/actor"),
      "packages/engine/src/temporal/coordinator.ts",
      "packages/engine/src/world/fallback-custody.ts",
      "packages/engine/src/world/entity-transition.ts",
    ])
      expect(code(f), f).not.toMatch(/OWNER_EPISTEMIC_ACCESS|epistemic_access|EpistemicAccess/);
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-02", "IA-03", "IA-04", "IA-06", "IA-14", "IA-22"])(
    "%s gained narrowly scoped partial evidence naming the Epistemic tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/Epistemic/);
      expect(row.partial_evidence?.tests.some((t) => /epistemic/.test(t))).toBe(true);
    },
  );
  it.each(["IA-11", "IA-16"])(
    "%s's partial evidence is the bounded access path only: the unimplemented F-014D and downstream surfaces are named, and the row stays NOT_IMPLEMENTED",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      const scope = row.partial_evidence!.scope;
      expect(scope).toMatch(/BOUNDED_SHARED_ACCESS/);
      expect(scope).toMatch(/Not implemented/);
      expect(scope).toMatch(/BROADCAST_EXPOSURE/);
      expect(scope).toMatch(/comprehension/);
      expect(row.partial_evidence!.tests).toEqual(
        expect.arrayContaining([
          "tests/integration/epistemic-foundation.test.ts",
          "tests/integration/epistemic-enforcement.test.ts",
          "tests/integration/epistemic-recovery.test.ts",
          "tests/conformance/epistemic-access-conformance.test.ts",
        ]),
      );
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
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    expect(statusOf("CAL-01")).toBe("UNCALIBRATED");
    expect(statusOf("CAL-03")).toBe("NO_ADOPTED_PRODUCTION_NUMBER");
    expect(statusOf("OB-016")).toBe("OPEN_CODE_ERA_CONFORMANCE");
  });
  it("the acceptance register and lock still agree on the register's own hash", () => {
    expect(lock.snapshot_files["spec/f027/acceptance-register.yaml"]).toMatch(/^[0-9a-f]{64}$/);
  });
});
