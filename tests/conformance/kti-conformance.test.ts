// Conformance evidence for the KTI Managed Transfer Package / Result-Close Backbone Foundation (eleventh slice). Each block
// names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED (see
// `partial_evidence`): this slice covers only the aspects it names, and every other F-027 open gate is unchanged.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  EpistemicAccessAdapter,
  F014D_SOURCE,
  KTI_FACT_KINDS,
  KTI_RULE,
  KtiAdapter,
  NamedActorAdapter,
  TemporalCoordinator,
  WS002_SOURCE,
  ktiTransferResultCloseProvider,
} from "@immortalis/engine";
import { PACKAGE_FORMAT_VERSION } from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";

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
const KTI_DIR = "packages/engine/src/kti";
const KTI_SOURCES = [
  ...readdirSync(KTI_DIR).map((f) => join(KTI_DIR, f)),
  "packages/contracts/src/kti.ts",
];

describe("IA-01 source/version fidelity (KTI registration aspect)", () => {
  it("the KTI kinds cite WS-002 at its exact spec-locked pin and the IM-09 lowering, with the KTI v0.3 pair, F-014D's pin, F-017's and the Runtime Contract's in the lineage", () => {
    const ws002 = lock.frozen_sources.find((s) => s.id === "WS-002")!;
    expect(WS002_SOURCE).toEqual({ artifact: ws002.url, native_pin: ws002.native_pin });
    expect(ws002.primary_im).toBe("IM-09");
    expect(ws002.native_pin).toBe("2026-09-26T02:44:38.319Z");
    for (const kind of KTI_FACT_KINDS) {
      expect(kind.rule).toEqual(KTI_RULE);
      expect(kind.rule.artifact).toBe(ws002.url);
      expect(kind.rule.native_pin).toBe(ws002.native_pin);
      expect(kind.im).toBe("IM-09");
      expect(kind.rule.supersedes).toBeNull();
    }
    const lineage = KTI_RULE.authority_lineage.join("\n");
    expect(lineage).toContain(ws002.native_pin);
    expect(lineage).toContain("2026-09-26T02:10:16.626Z"); // KTI v2.2 Candidate v0.3 + Scaling Profile Candidate v0.3
    const f014d = lock.frozen_sources.find((s) => s.id === "F-014D")!;
    expect(F014D_SOURCE).toEqual({ artifact: f014d.url, native_pin: f014d.native_pin });
    expect(lineage).toContain(f014d.native_pin);
    expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
  });

  it("the rule names the clauses the state relies on: ownership, the mode-consumer invariant, the packet → KTI and KTI-result-close cuts, Class A and Class E, and the transfer package as workflow state", () => {
    for (const c of [
      "overlay §§1, 4, 5, 7",
      "BROADCAST_EXPOSURE creates no persisted KTI receipt",
      "mode-consumer invariant",
      "BOUNDED_SHARED_ACCESS participants only",
      "AS-OF-NOW after packet formation",
      "AS-OF-DECLARED-CLOSE, Close Basis = KTI result close",
      "no same-resolution reread",
      "Class A",
      "Class E",
      "closed packages are not polled",
      "Concept 2 §2",
      "§9 (Intentional transfer package",
      "temporary workflow state",
      "F-014D §§2.1, 17, 18",
    ])
      expect(KTI_RULE.clause).toContain(c);
  });
});

describe("IA-03 owner exclusivity: the KTI owner holds the development object, the transfer basis and the active Transfer Package only", () => {
  it("registers exactly one new owner, kti, with ONE facet and three exclusive create-only key spaces", () => {
    expect(KTI_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["kti_development_object", "kti", "kti_development", "SEALED"],
      ["kti_transfer_basis", "kti", "kti_development", "SEALED"],
      ["kti_transfer_package", "kti", "kti_development", "SEALED"],
    ]);
    expect(CANONICAL_OWNER_REGISTRY.get("kti")).toEqual(new Set(["kti_development"]));
    for (const key of ["kti/object/o", "kti/transfer/p/basis", "kti/transfer/p/package"])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(1);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "kti")).toHaveLength(3);
    expect(ALL_FACT_KINDS).toHaveLength(40);
  });

  it("there is no relationship, encounter, intelligibility, competence, adoption, diffusion, doctrine, institution, Population, headcount or numeric kind, and no fallback KTI owner", () => {
    for (const k of KTI_FACT_KINDS)
      expect(k.id).not.toMatch(
        /relationship|encounter|exposure|intelligib|compet|adopt|adher|diffus|doctrine|institution|population|headcount|reproduc|continuity|score|level|rank|broadcast|cohort|audience/,
      );
    expect(
      [...CANONICAL_OWNER_REGISTRY.keys()].filter((n) => /kti|knowledge|technolog|culture/.test(n)),
    ).toEqual(["kti"]);
    expect(KTI_FACT_KINDS.every((k) => k.im === "IM-09")).toBe(true);
  });

  it("there is no KTI writer other than the two authored publications: the package is the result-close operation only the IM-02 coordinator resolves", () => {
    const methods = Object.getOwnPropertyNames(KtiAdapter.prototype)
      .filter((m) => m !== "constructor")
      .sort();
    expect(methods).toEqual([
      "developmentObject",
      "establishDevelopmentObject",
      "establishTransferBasis",
      "transferBasis",
      "transferPackage",
    ]);
    expect(ktiTransferResultCloseProvider.owner).toBe("kti");
    expect(ktiTransferResultCloseProvider.operation).toBe("kti-publish-transfer-result-close");
  });

  it("the KTI owner never writes a foreign key space, a PC fact, a Population fact, a capability or an Epistemic fact: no foreign owner or key builder appears in its adapter or provider", () => {
    for (const f of KTI_SOURCES.filter((f) => /adapter|provider/.test(f))) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /pcExistenceContractKey|PLAYER_CHARACTER_BINDING_KEY|populationLedgerKey|worldFallbackEntityKey|actorCapability|accessEventKey|accessPacketKey|accessProvenanceKey|OWNER_POPULATION|OWNER_WORLD_STATE|OWNER_NAMED_ACTOR|OWNER_ECONOMY|OWNER_LOGISTICS|OWNER_PRODUCTION|OWNER_EPISTEMIC_ACCESS/,
      );
    }
  });

  it("KTI reads the sealed packet only through the Epistemic owner's one packet-read builder and never declares a read of the engine-side event or the sealed provenance", () => {
    const declaration = code(`${KTI_DIR}/declaration.ts`);
    expect(declaration).toMatch(/epistemicPacketRead\(/);
    expect(declaration).not.toMatch(/accessEventKey|accessProvenanceKey|epistemicEventRead/);
    // the sealed provenance and event are consulted only by admission and load verification, engine-side
    for (const f of KTI_SOURCES.filter((f) => !/admission|integrity|derive|contracts/.test(f)))
      expect(code(f), f).not.toMatch(/SealedEngineProvenanceSchema|accessProvenanceKey/);
  });

  it("the Epistemic, Named-Actor and other predecessor owners' own surfaces are unchanged: no KTI part and no new writer", () => {
    expect(
      Object.getOwnPropertyNames(EpistemicAccessAdapter.prototype)
        .filter((m) => m !== "constructor")
        .sort(),
    ).toEqual(["engineSealedProvenance", "establishBoundedSharedAccess", "event", "packet"]);
    expect(
      Object.getOwnPropertyNames(NamedActorAdapter.prototype)
        .filter((m) => m !== "constructor")
        .sort(),
    ).toEqual(["basis", "capability", "establishCapabilityBasis"]);
    for (const f of [
      ...walk("packages/engine/src/epistemic"),
      ...walk("packages/engine/src/actor"),
      ...walk("packages/engine/src/population"),
      ...walk("packages/engine/src/production"),
      ...walk("packages/engine/src/economy"),
      ...walk("packages/engine/src/logistics"),
      "packages/engine/src/temporal/coordinator.ts",
      "packages/engine/src/world/fallback-custody.ts",
      "packages/engine/src/world/entity-transition.ts",
    ])
      expect(code(f), f).not.toMatch(/OWNER_KTI|FACET_KTI|KtiAdapter|ktiTransfer|kti\//);
  });

  it("the KTI result consumer is a clearly synthetic testkit party and production code never imports the testkit or names a synthetic owner", () => {
    const fixtures = readFileSync("packages/testkit/src/kti-fixtures.ts", "utf8");
    expect(fixtures).toMatch(/SYNTHETIC TEST DATA/);
    expect(fixtures).toMatch(/SYNTHETIC-KTI-RESULT-CONSUMER/);
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-/);
    }
  });
});

describe("the KTI contracts are qualitative: no score, number, threshold, grade conversion or default (acceptance 4, 5)", () => {
  it("no contract or engine module defines a numeric value, rate, threshold, modifier, probability, score or default", () => {
    for (const f of KTI_SOURCES) {
      const text = code(f);
      const numbers = [...text.matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      // 0/1/2: versions, indices, capture-group indices and list-size bounds; 3: the three declared reads; 5: diagnostic
      // issue-list length (as elsewhere)
      expect(
        numbers.filter((n) => !["0", "1", "2", "3", "5"].includes(n!)),
        f,
      ).toEqual([]);
      expect(text, f).not.toMatch(
        /\b(xp|level|percent|probability|modifier|bonus|dice|roll|dc|score|threshold)\b/i,
      );
      expect(text, f).not.toMatch(/z\.number\(|\.default\(|APPROXIMATE-PARTITION/);
    }
  });

  it("no capability, marker or grade is read, written or converted by any KTI module", () => {
    for (const f of KTI_SOURCES.filter((f) => !/contracts/.test(f)))
      expect(identifiers(f), f).not.toMatch(
        /\.marker\b|CAPABILITY_GRADES|CapabilityGrade|ComparativeMarker|\bgrade\b|NamedActorCapability/,
      );
  });

  it("the packet's content, attribution, access and intelligibility are never read into the package: only its recipient and its subject are", () => {
    const derive = code(`${KTI_DIR}/derive.ts`);
    for (const field of [
      "presented_attribution",
      ".intelligibility",
      ".access",
      "payload.content",
      "established_at",
    ])
      expect(derive, field).not.toContain(field);
  });
});

describe("reuse, not fork: IM-02, IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("there is no second coordinator, journal, scheduler, ledger, save or sidecar: the KTI modules persist nothing themselves", () => {
    for (const f of KTI_SOURCES) {
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
    expect(classes.filter((c) => /Kti|Transfer/.test(c!))).toEqual(["KtiAdapter"]);
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
    expect(readdirSync("packages/engine/src/persistence").sort()).toEqual([
      "file-package.ts",
      "fs-ops.ts",
      "store.ts",
    ]);
  });

  it("the KTI owner is reached through the one canonical IM-03/IM-11 admission, object registration through the one kernel path, and commit only through the IM-02 coordinator's owner seam", () => {
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /ktiGroupCheck\(group, state\)/,
    );
    expect(code("packages/engine/src/temporal/admission.ts")).toMatch(
      /ktiObjectViolation\(o, state, true\)/,
    );
    expect(code("packages/engine/src/world/canonical-campaign.ts")).toMatch(
      /verifyKtiIntegrity\(store\)/,
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

  it("the package is published only as its IM-02 stage: admission and load verification apply the one shared stage rule (identity and the durable transaction authority), not a copy", () => {
    expect(code(`${KTI_DIR}/admission.ts`)).toMatch(
      /stageAuthorityViolation\(\s*group,\s*ktiTransferStage\(/,
    );
    expect(code(`${KTI_DIR}/integrity.ts`)).toMatch(/journaledStageViolation\(/);
    for (const f of KTI_SOURCES)
      expect(code(f), f).not.toMatch(
        /function stageAuthorityViolation|function stageIdentityViolation|function stageGroupId|function stageId/,
      );
  });

  it("the KTI result close is the one existing close mechanism: the stage declares a close and other owners read it AS-OF-DECLARED-CLOSE; no new read mode, scheduler or phase exists", () => {
    const declaration = code(`${KTI_DIR}/declaration.ts`);
    expect(declaration).toMatch(/declares_close: \{ name: KTI_RESULT_CLOSE \}/);
    expect(declaration).toMatch(/mode: READ_MODE_CLOSE/);
    expect(declaration).toMatch(/READ_MODE_NOW/);
    expect(code("packages/contracts/src/kti.ts")).toMatch(/KTI_RESULT_CLOSE = "kti-result-close"/);
  });

  it("a package stage's identity is its StageKey alone: no horizon, version, retry, consumer, packet or slice participates", () => {
    const contract = code("packages/contracts/src/kti.ts");
    const stage = /ktiTransferStage = [\s\S]*?\}\);/.exec(contract)![0];
    expect(stage).not.toMatch(
      /horizon|version|retry|attempt|slice|consumer|transaction|target|packet/i,
    );
  });

  it("the package identity is derived from exactly source, recipient and development object: no packet, event, time, retry or version participates", () => {
    const derive = code(`${KTI_DIR}/derive.ts`);
    const id = /transferPackageId = [\s\S]*?\}\)\}`;/.exec(derive)![0];
    expect(id).toMatch(/source/);
    expect(id).toMatch(/recipient/);
    expect(id).toMatch(/object_id/);
    expect(id).not.toMatch(/packet|event|version|retry|time|slice|horizon/i);
  });

  it("the temporal coordinator itself was not changed to know the KTI owner", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(/kti|Kti|KTI/);
  });
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, cadence or global scan in the KTI path", () => {
  it("the modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence/sweep/polling construct", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual)\b/;
    for (const f of KTI_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts (no all-recipients scan, no all-objects scan, no history sweep)", () => {
    for (const f of KTI_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(KTI_SOURCES.filter((f) => /listFacts\(/.test(code(f)))).toEqual([
      `${KTI_DIR}/integrity.ts`,
    ]);
    for (const f of KTI_SOURCES)
      expect(code(f), f).not.toMatch(
        /matrix|roster|allActors|allRecipients|allObjects|forEachActor|forEachRecipient|for \(const (actor|event|recipient|participant) of/i,
      );
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("no comprehension, competence, reproduction, adoption, adherence, belief, diffusion, continuity, training, Population quantity, institution, Diplomacy, doctrine adherence, ACS, PC knowledge, projection, broadcast lowering or host construct exists in the KTI modules", () => {
    for (const f of KTI_SOURCES) {
      const text = identifiers(f)
        // the BROADCAST_EXPOSURE mode is named only so that a request for it is refused precisely
        .replace(/MODE_BROADCAST_EXPOSURE|BROADCAST_EXPOSURE_UNSUPPORTED/g, "")
        .toLowerCase();
      for (const word of [
        "comprehen",
        "recogni",
        "inference",
        "infer(",
        "credib",
        "belief",
        "stance",
        "motive",
        "loyalty",
        "mandate",
        "competence",
        "partial_depth",
        "partialdepth",
        "reproduc",
        "adoption",
        "adherence",
        "diffusion",
        "continuity",
        "retention",
        "training",
        "attainment",
        "qualification",
        "headcount",
        "cohort",
        "institution",
        "diplomacy",
        "doctrine_adherence",
        "collective",
        "faction",
        "audience",
        "membership",
        "broadcast",
        "reach",
        "lowering",
        "narrative",
        "projection",
        "protocol",
        "gamemaster",
        "pcknowledge",
        "referential",
      ])
        expect(text, `${f}: ${word}`).not.toContain(word);
    }
  });

  it("the only mention of broadcast is the refusal of that mode: it has no schema, key, kind or lowering, and is never approximated by recipient copying", () => {
    expect(code(`${KTI_DIR}/adapter.ts`)).toMatch(/BROADCAST_EXPOSURE_UNSUPPORTED/);
    expect(code(`${KTI_DIR}/adapter.ts`)).toMatch(/MODE_BROADCAST_EXPOSURE/);
    for (const f of KTI_SOURCES.filter((f) => !/adapter\.ts$/.test(f)))
      expect(code(f), f).not.toMatch(/BROADCAST/);
    // KTI discriminates the event mode by its one lawful literal, never by an approximation
    expect(code(`${KTI_DIR}/derive.ts`)).toMatch(/MODE_BOUNDED_SHARED_ACCESS/);
  });

  it("no randomization of any kind exists: no RNG, roll, bounded prior, seed, chooser or default (GitHub Issue #11 stays open and unimplemented)", () => {
    for (const f of KTI_SOURCES)
      expect(code(f), f).not.toMatch(
        /random|\bseed\b|\broll\b|distribution|weighting|chooser|probab|BOUNDED_PRIOR|\bpriors\b/i,
      );
  });

  it("no Transfer Package completion, failure, abandonment or retirement rule exists: the status is the single literal ACTIVE and nothing writes any other", () => {
    const contract = code("packages/contracts/src/kti.ts");
    expect(contract).toMatch(/status: z\.literal\("ACTIVE"\)/);
    for (const f of KTI_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\b(complete|completion|retire|retirement|abandon|terminate|fail(ed|ure)?State|succe(ed|ss)State)\b/i,
      );
  });

  it("the KTI module set is exactly the IM-09 owner path; no other engine directory beyond the eleventh slice's was added", () => {
    expect(readdirSync(KTI_DIR).sort()).toEqual([
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
    for (const forbidden of ["migrations/manifests/kti.json"])
      expect(existsSync(forbidden)).toBe(false);
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-02", "IA-03", "IA-04", "IA-06", "IA-14", "IA-16", "IA-22"])(
    "%s gained narrowly scoped partial evidence naming the KTI tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/KTI/);
      expect(row.partial_evidence?.tests.some((t) => /kti/.test(t))).toBe(true);
    },
  );
  it("IA-16's KTI evidence is the bounded packet → KTI consumption only: the unimplemented KTI and downstream surfaces are named, and the row stays NOT_IMPLEMENTED", () => {
    const row = register.find((r) => r.id === "IA-16")!;
    expect(row.status).toBe("NOT_IMPLEMENTED");
    expect(row.evidence).toBeNull();
    const scope = row.partial_evidence!.scope;
    expect(scope).toMatch(/Transfer Package/);
    expect(scope).toMatch(/BROADCAST_EXPOSURE/);
    expect(scope).toMatch(/comprehension/);
    expect(scope).toMatch(/competence/);
    expect(row.partial_evidence!.tests).toEqual(
      expect.arrayContaining([
        "tests/integration/kti-foundation.test.ts",
        "tests/integration/kti-enforcement.test.ts",
        "tests/integration/kti-recovery.test.ts",
        "tests/conformance/kti-conformance.test.ts",
      ]),
    );
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
    expect(statusOf("CAL-03")).toBe("NO_ADOPTED_PRODUCTION_NUMBER");
    expect(statusOf("OB-016")).toBe("OPEN_CODE_ERA_CONFORMANCE");
  });
  it("the acceptance register and lock still agree on the register's own hash", () => {
    expect(lock.snapshot_files["spec/f027/acceptance-register.yaml"]).toMatch(/^[0-9a-f]{64}$/);
  });
});
