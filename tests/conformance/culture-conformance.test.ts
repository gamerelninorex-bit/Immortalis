// Conformance evidence for the Culture & Society Established Shared Meaning / Norm Result-Close Backbone Foundation
// (forty-sixth slice, amended same-PR recovery over the merged F-027-CJA1 adjudication record; CJA1 is Sovereign-approved,
// NOT native-pinned and NOT spec-locked, and nothing here promotes it). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The frozen
// spec files — the lock, the acceptance register, the open gates and the Runtime Contract — are byte-identical to the base:
// this slice promotes no row and changes no gate, and every other F-027 open gate is unchanged.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  CULTURE_FACT_KINDS,
  CULTURE_RULE,
  CultureAdapter,
  F014B_SOURCE,
  TemporalCoordinator,
  WS005_SOURCE,
  cultureConventionCloseProvider,
} from "@immortalis/engine";
import { PACKAGE_FORMAT_VERSION } from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import {
  EXPECTED_FACT_KINDS,
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
/** Source with comments AND string literals removed: only the identifiers and operators of the code remain. */
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/z\.infer/g, "z.type");
const sha256File = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");
const CULTURE_DIR = "packages/engine/src/culture";
const CULTURE_SOURCES = [
  ...readdirSync(CULTURE_DIR).map((f) => join(CULTURE_DIR, f)),
  "packages/contracts/src/culture.ts",
];

describe("IA-01 source/version fidelity (Culture registration aspect)", () => {
  it("the Culture kinds cite WS-005 at its exact spec-locked pin and the IM-09 lowering, with the ratified Concept/Draft/Profile v2 pins, the F-016/F-017 successor deltas, F-017's and the Runtime Contract's pins in the lineage", () => {
    const ws005 = lock.frozen_sources.find((s) => s.id === "WS-005")!;
    expect(WS005_SOURCE).toEqual({ artifact: ws005.url, native_pin: ws005.native_pin });
    expect(ws005.primary_im).toBe("IM-09");
    expect(ws005.native_pin).toBe("2026-09-26T07:23:03.549Z");
    for (const kind of CULTURE_FACT_KINDS) {
      expect(kind.rule).toEqual(CULTURE_RULE);
      expect(kind.rule.artifact).toBe(ws005.url);
      expect(kind.rule.native_pin).toBe(ws005.native_pin);
      expect(kind.im).toBe("IM-09");
      expect(kind.rule.supersedes).toBeNull();
    }
    const lineage = CULTURE_RULE.authority_lineage.join("\n");
    for (const pin of [
      ws005.native_pin,
      "2026-09-26T06:43:39.156Z", // Concept v2 substantive pin
      "2026-09-26T07:22:08.130Z", // Operational Draft v2 conformed pin
      "2026-09-26T07:23:21.709Z", // Scaling Profile v2 conformed pin
      "2026-09-26T07:14:10.463Z", // Sovereign ratification
      "2026-09-26T07:20:59.108Z", // F-016 / F-017 Culture successor deltas
    ])
      expect(lineage).toContain(pin);
    for (const url of [
      "3e720af901e081009232f2efa9b7a1ff", // Concept v2
      "3e720af901e0817abf2df04f13bd90ad", // Operational Draft v2
      "3e720af901e081ca9ab5f8eeb1fafdd1", // Scaling Profile v2
      "3e720af901e08112801dc2021204acbe", // F-016 successor delta
      "3e720af901e081b2bcd6fd38e2e327e8", // F-017 successor delta
    ])
      expect(lineage).toContain(url);
    expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
    expect(F014B_SOURCE.native_pin).toBe(
      lock.frozen_sources.find((s) => s.id === "F-014B")?.native_pin,
    );
  });

  it("the rule names the clauses the state relies on: sole writer, minimum-information contract, the deletion test, the sealed context and its one read basis per input, commit once at the Communicative Convention Close, and what is not implemented", () => {
    for (const c of [
      "Draft v2 §1",
      "sole writer of admitted continuing social meaning/norm",
      "minimum-information contract, not a fixed schema",
      "§2 Admission and deletion",
      "independent causal inertia",
      "mere contact, hypothetical possibility, cultural stereotype, world truth or policy enactment alone",
      "§3 Trigger and input assembly",
      "CS-UPD",
      "exactly one lawful basis, AS-OF-NOW only after its owner commit or AS-OF-DECLARED-CLOSE",
      "downstream consequences cannot backfill the sealed context",
      "§4.5 Commit once",
      "Communicative Convention Close",
      "the Social Relation Close, relations and aggregate positions are not implemented",
      "§8 Validation, invalidation and failure behavior",
      "never a substitute writer, speculative group percentage or world-wide culture update",
      "Concept v2 §§1-2, 4 and 8",
      "Scaling Profile v2 §§2-4",
      "no global social scan",
      "cohort-key re-binding, contestation, retirement, relation/position and the Social Relation Close not implemented",
    ])
      expect(CULTURE_RULE.clause).toContain(c);
  });
});

describe("IA-03 owner exclusivity: the Culture owner holds the sealed Social Update Context and the shared meaning/norm only", () => {
  it("registers exactly one new owner, culture, with ONE facet and two exclusive create-only key spaces", () => {
    expect(CULTURE_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual([
      ["culture_update_context", "culture", "culture_social", "SEALED"],
      ["culture_shared_meaning", "culture", "culture_social", "SEALED"],
    ]);
    expect(CANONICAL_OWNER_REGISTRY.get("culture")).toEqual(expectedOwnerFacetSet("culture"));
    for (const key of [
      `culture/update/${"a".repeat(64)}/context`,
      "culture/meaning/culture-slot-u",
    ])
      expect(
        ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)),
        key,
      ).toHaveLength(1);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "culture").map((k) => k.id)).toEqual(
      expectedKindIds({ owner: "culture" }),
    );
    expect(ALL_FACT_KINDS).toHaveLength(EXPECTED_FACT_KINDS.length);
  });

  it("there is no relation, position, precedence, lineage, convention, Cohort, contestation, retirement, prevalence or numeric kind, and no fallback Culture owner", () => {
    for (const k of CULTURE_FACT_KINDS)
      expect(k.id).not.toMatch(
        /relation|position|precedence|lineage|convention|cohort|contest|retire|prevalence|percent|count|score|level|rank|belief|adopt|motive/,
      );
    expect(
      [...CANONICAL_OWNER_REGISTRY.keys()].filter((n) =>
        /kti|knowledge|technolog|culture|society|social|language|religion|opinion/.test(n),
      ),
    ).toEqual(["kti", "culture", "culture_adjudication_kernel"]);
    expect(CULTURE_FACT_KINDS.every((k) => k.im === "IM-09")).toBe(true);
  });

  it("there is no Culture writer other than the one authored seal: the meaning is the close operation only the IM-02 coordinator resolves", () => {
    expect(adapterMethods(CultureAdapter)).toEqual(expectedAdapterMethods("CultureAdapter"));
    expect(cultureConventionCloseProvider.owner).toBe("culture");
    expect(cultureConventionCloseProvider.operation).toBe(
      "culture-commit-communicative-convention-close",
    );
  });

  it("the Culture owner never writes a foreign key space and never takes a foreign owner as its subject: no foreign owner or key builder appears in its adapter or provider", () => {
    for (const f of CULTURE_SOURCES.filter((f) => /adapter|provider/.test(f))) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /pcExistenceContractKey|PLAYER_CHARACTER_BINDING_KEY|populationLedgerKey|worldFallbackEntityKey|worldLocusKey|actorCapability|accessEventKey|accessPacketKey|accessProvenanceKey|ktiDevelopmentObjectKey|ktiTransfer|OWNER_POPULATION|OWNER_WORLD_STATE|OWNER_NAMED_ACTOR|OWNER_ECONOMY|OWNER_LOGISTICS|OWNER_PRODUCTION|OWNER_EPISTEMIC_ACCESS|OWNER_KTI|OWNER_GIP|OWNER_DIPLOMACY/,
      );
    }
  });

  it("Culture reads no Epistemic, KTI, Economy, GIP or Actor state at all, and touches Population ONLY in the one live Port B module, through Population's own barrier evaluator and contracts", () => {
    for (const f of CULTURE_SOURCES.filter((f) => !/contracts/.test(f)))
      expect(identifiers(f), f).not.toMatch(
        /OWNER_(ECONOMY|PRODUCTION|LOGISTICS|NAMED_ACTOR|EPISTEMIC_ACCESS|KTI|GIP|DIPLOMACY)|AccessEventSchema|AccessiblePacketSchema|Kti\w*Schema|PopulationBasis/,
      );
    for (const f of CULTURE_SOURCES.filter((f) => !/contracts|population-scope/.test(f)))
      expect(identifiers(f), f).not.toMatch(
        /OWNER_POPULATION|CohortFact|populationBarrierEvaluator|ReconciliationClose/,
      );
    const scope = code(`${CULTURE_DIR}/population-scope.ts`);
    expect(scope).toMatch(/populationBarrierEvaluator\.evaluate\(/);
    expect(scope).toMatch(/populationBarrierEvaluator\.closeSourceLawful\(/);
    // the verifier asks Population; it never writes, forges a close or invents a producer
    expect(scope).not.toMatch(/\.commit\(|POPULATION_OPERATION_RECONCILE|declares_close/);
  });

  it("the predecessor owners' own surfaces and modules are unchanged: none names the Culture owner or its keys", () => {
    for (const f of [
      ...walk("packages/engine/src/epistemic"),
      ...walk("packages/engine/src/actor"),
      ...walk("packages/engine/src/kti"),
      ...walk("packages/engine/src/population"),
      ...walk("packages/engine/src/production"),
      ...walk("packages/engine/src/economy"),
      ...walk("packages/engine/src/logistics"),
      ...walk("packages/engine/src/gip"),
      ...walk("packages/engine/src/diplomacy"),
      "packages/engine/src/temporal/coordinator.ts",
      "packages/engine/src/world/fallback-custody.ts",
      "packages/engine/src/world/entity-transition.ts",
    ])
      expect(code(f), f).not.toMatch(/OWNER_CULTURE|FACET_CULTURE|CultureAdapter|culture\//);
  });

  it("the evidence source and the result consumer are clearly synthetic testkit parties and production code never imports the testkit or names a synthetic owner", () => {
    const fixtures = readFileSync("packages/testkit/src/culture-fixtures.ts", "utf8");
    expect(fixtures).toMatch(/SYNTHETIC TEST DATA/);
    expect(fixtures).toMatch(/SYNTHETIC-CULTURE-RESULT-CONSUMER/);
    expect(fixtures).toMatch(/NOT synthetic[\s\S]*live[\s\S]*in @immortalis\/engine/);
    expect(readFileSync("packages/testkit/src/culture-adjudication-fixtures.ts", "utf8")).toMatch(
      /SYNTHETIC-CJA-OBSERVATION-SOURCE/,
    );
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-/);
    }
  });
});

describe("the Culture contracts are qualitative: no score, number, threshold, percentage, prevalence or default (acceptance: false-precision guard)", () => {
  it("no contract or engine module defines a numeric value, rate, threshold, modifier, probability, score or default", () => {
    for (const f of CULTURE_SOURCES) {
      const text = code(f);
      const numbers = [...text.matchAll(/(?<![\w.$"'`-])(\d+(?:\.\d+)?)(?![\w"'`])/g)].map(
        (m) => m[1],
      );
      // 0/1/2: versions, indices, capture-group indices, the pair of bindable kinds and list-size bounds; 5: diagnostic
      // issue-list length (as elsewhere); 64: the SHA-256 hex width of an update identity
      expect(
        numbers.filter((n) => !["0", "1", "2", "5", "64"].includes(n!)),
        f,
      ).toEqual([]);
      expect(text, f).not.toMatch(
        /\b(xp|level|percent|percentage|prevalence|share|probability|modifier|bonus|dice|roll|dc|score|strength|threshold)\b/i,
      );
      expect(text, f).not.toMatch(
        /z\.number\(\)(?!\.int\(\)\.positive|\.int\(\)\.nonneg)|\.default\(|APPROXIMATE-PARTITION/,
      );
    }
  });

  it("the manifestation of a meaning or norm is opaque: no class, enumeration or vocabulary of meanings, norms, statuses of meaning or evidence kinds exists", () => {
    const contract = code("packages/contracts/src/culture.ts");
    expect(contract).not.toMatch(/z\.enum\(/);
    expect(contract).toMatch(/manifestation: EntityId/);
    // the single literals are the ones the source names: the read bases, the establishment status, the close, the fixed CJA1
    // opportunity and this owner's close operation. No conclusion-shaped marker, no admission flag.
    const literals = [...contract.matchAll(/z\.literal\(([^)]*)\)/g)].map((m) => m[1]).sort();
    expect(literals).toEqual(
      [
        '"AS-OF-DECLARED-CLOSE"',
        '"AS-OF-NOW"',
        '"ESTABLISHED"',
        "CJA_OPPORTUNITY_ID",
        "COMMUNICATIVE_CONVENTION_CLOSE",
        "CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE",
      ].sort(),
    );
    expect(contract).not.toMatch(
      /CONTINUING_SHARED_RECOGNITION|CultureEvidenceReading|CultureAdmissionTest|independent_causal_inertia/,
    );
  });

  it("the close reads NO evidence at all: the manifestation is copied verbatim from the committed decision, and no foreign value (count, share, headcount, roster, free text, world truth) is read anywhere in the derivation", () => {
    const derive = code(`${CULTURE_DIR}/derive.ts`);
    expect(derive).toMatch(/manifestation: record\.candidate_manifestation/);
    for (const field of [
      "\\.count",
      "\\.share",
      "headcount",
      "\\.membership",
      "\\.members",
      "recognition",
    ])
      expect(derive, field).not.toMatch(new RegExp(field));
    const provider = code(`${CULTURE_DIR}/provider.ts`);
    expect(provider).toMatch(/input\.reads\.length !== 2/);
    expect(provider).not.toMatch(/reads\.slice|reads\.map|reads\[[2-9]\]/);
  });
});

describe("reuse, not fork: IM-02, IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("there is no second coordinator, journal, scheduler, ledger, save or sidecar: the Culture modules persist nothing themselves", () => {
    for (const f of CULTURE_SOURCES) {
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
    expect(classes.filter((c) => /Culture|Society|Social/.test(c!)).sort()).toEqual([
      "CultureAdapter",
      "CultureAdjudicationAdapter",
      "CultureContextAttestor",
    ]);
    expect(PACKAGE_FORMAT_VERSION).toBe(1);
    expect(readdirSync("packages/engine/src/persistence").sort()).toEqual([
      "file-package.ts",
      "fs-ops.ts",
      "store.ts",
    ]);
  });

  it("the Culture owner is reached through the one canonical IM-03/IM-11 admission, object registration through the one kernel path, and commit only through the IM-02 coordinator's owner seam", () => {
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /cultureGroupCheck\(group, state\)/,
    );
    expect(code("packages/engine/src/temporal/admission.ts")).toMatch(
      /cultureObjectViolation\(o, state, true\)/,
    );
    expect(code("packages/engine/src/world/canonical-campaign.ts")).toMatch(
      /verifyCultureIntegrity\(store\)/,
    );
    expect(adapterMethods(TemporalCoordinator)).toEqual(
      expectedAdapterMethods("TemporalCoordinator"),
    );
  });

  it("the meaning is committed only as its IM-02 stage: admission and load verification apply the one shared stage rule (identity and the durable transaction authority), not a copy", () => {
    expect(code(`${CULTURE_DIR}/admission.ts`)).toMatch(
      /stageAuthorityViolation\(\s*group,\s*cultureConventionStage\(/,
    );
    expect(code(`${CULTURE_DIR}/integrity.ts`)).toMatch(/journaledStageViolation\(/);
    for (const f of CULTURE_SOURCES)
      expect(code(f), f).not.toMatch(
        /function stageAuthorityViolation|function stageIdentityViolation|function stageGroupId|function stageId/,
      );
  });

  it("the Communicative Convention Close is the one existing close mechanism: the stage declares a close and consequences read the fact after it; the Social Relation Close is not implemented; no new read mode, scheduler or phase exists", () => {
    const declaration = code(`${CULTURE_DIR}/declaration.ts`);
    expect(declaration).toMatch(/declares_close: \{ name: COMMUNICATIVE_CONVENTION_CLOSE \}/);
    expect(declaration).toMatch(/mode: READ_MODE_CLOSE/);
    expect(declaration).toMatch(/READ_MODE_NOW/);
    const contract = code("packages/contracts/src/culture.ts");
    expect(contract).toMatch(/COMMUNICATIVE_CONVENTION_CLOSE = "communicative-convention-close"/);
    for (const f of CULTURE_SOURCES)
      expect(code(f), f).not.toMatch(
        /social-relation-close|SOCIAL_RELATION_CLOSE|SocialRelationClose/,
      );
  });

  it("the close declares EXACTLY two AS-OF-NOW reads (context, decision) and no new Temporal read class; an input with any other basis safe-stops at SEAL", () => {
    const declaration = code(`${CULTURE_DIR}/declaration.ts`);
    expect(declaration).toMatch(
      /reads: \[\s*cultureNowRead\(cultureUpdateContextKey\(context\.update_id\)\),\s*\{\s*mode: READ_MODE_NOW,/,
    );
    expect(declaration.match(/mode: READ_MODE_NOW/g)).toHaveLength(2);
    expect(code(`${CULTURE_DIR}/derive.ts`)).toMatch(/input\.read\.basis !== "AS-OF-NOW"/);
  });

  it("a stage's identity is its StageKey alone, derived from the update identity: no horizon, version, retry, consumer, evidence or slice participates", () => {
    const contract = code("packages/contracts/src/culture.ts");
    const stage = /cultureConventionStage = [\s\S]*?\}\);/.exec(contract)![0];
    expect(stage).not.toMatch(
      /horizon|version|retry|attempt|slice|consumer|transaction|target|evidence|input/i,
    );
  });

  it("the Culture STATE SLOT is derived from exactly referent, scope and context — no trigger, evidence, manifestation, time, retry or version participates — and is distinct from the CJA1 update identity", () => {
    const derive = code(`${CULTURE_DIR}/derive.ts`);
    const id = /cultureSlotId = [\s\S]*?\}\)\}`;/.exec(derive)![0];
    expect(id).toMatch(/referent_key/);
    expect(id).toMatch(/scope_key/);
    expect(id).toMatch(/context_id/);
    expect(id).not.toMatch(
      /trigger|evidence|manifestation|version|retry|time|slice|horizon|input/i,
    );
    expect(derive).toMatch(/cjaCultureUpdateId\(\{/);
    expect(derive).not.toMatch(/function cultureUpdateId|const cultureUpdateId/);
  });

  it("CJA1 is reused, not forked or promoted: the Culture modules import the merged adjudication derivations, and the spec lock does not mention CJA1", () => {
    expect(code(`${CULTURE_DIR}/derive.ts`)).toMatch(
      /from "\.\.\/culture-adjudication\/derive\.ts"/,
    );
    expect(code(`${CULTURE_DIR}/adapter.ts`)).toMatch(
      /from "\.\.\/culture-adjudication\/ports\.ts"/,
    );
    expect(JSON.stringify(lock)).not.toContain("CJA1");
    expect(CULTURE_RULE.authority_lineage.join("\n")).toContain(
      "not native-pinned, not in the F-027 spec lock",
    );
  });

  it("the temporal coordinator itself was not changed to know the Culture owner", () => {
    expect(code("packages/engine/src/temporal/coordinator.ts")).not.toMatch(
      /culture|Culture|CULTURE/,
    );
  });
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, cadence, drift or global scan in the Culture path", () => {
  it("the modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence/drift/sweep/polling construct", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual|drift)\b/;
    for (const f of CULTURE_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts (no all-referents scan, no all-population scan, no history sweep)", () => {
    for (const f of CULTURE_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(CULTURE_SOURCES.filter((f) => /listFacts\(/.test(code(f)))).toEqual([
      `${CULTURE_DIR}/integrity.ts`,
    ]);
    for (const f of CULTURE_SOURCES)
      expect(code(f), f).not.toMatch(
        /matrix|roster|allPopulation|allReferents|allCohorts|forEachCohort|forEachReferent|for \(const (cohort|referent|member|person|actor) of/i,
      );
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("no relation, position, Social Relation Close, Cohort attachment or re-binding, contestation, prevalence, adoption, belief, motive, shared-language adoption, KTI/GIP/Economy/Actor/ASR consumer, projection or host construct exists in the Culture modules", () => {
    for (const f of CULTURE_SOURCES) {
      const text = identifiers(f).toLowerCase();
      for (const word of [
        "relationedge",
        "aggregateposition",
        "socialrelation",
        "rebind",
        "rebinding",
        "contestation",
        "prevalence",
        "adoption",
        "belief",
        "stance",
        "motive",
        "loyalty",
        "mandate",
        "competence",
        "comprehension",
        "headcount",
        "populationcount",
        "membership",
        "tradition",
        "lineage",
        "precedence",
        "retire",
        "retirement",
        "language",
        "religion",
        "opinion",
        "narrative",
        "projection",
        "protocol",
        "gamemaster",
        "faction",
        "diplomacy",
        "legitimacy",
      ])
        expect(text, `${f}: ${word}`).not.toContain(word);
    }
  });

  it("no randomization of any kind exists: no RNG, roll, bounded prior, seed, chooser or default", () => {
    for (const f of CULTURE_SOURCES)
      expect(code(f), f).not.toMatch(
        /random|\bseed\b|\broll\b|distribution|weighting|chooser|probab|BOUNDED_PRIOR|\bpriors\b/i,
      );
  });

  it("no update, rebinding, contestation or retirement of an established fact exists: the status is the single literal ESTABLISHED and nothing writes any other", () => {
    const contract = code("packages/contracts/src/culture.ts");
    expect(contract).toMatch(/status: z\.literal\("ESTABLISHED"\)/);
    for (const f of CULTURE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\b(retire|retirement|archive|supersede|rebind|contest|abandon|terminate|decline|revive)\b/i,
      );
  });

  it("the Culture module set is exactly the IM-09 owner path; no other engine directory beyond the forty-sixth slice's was added, and no protocol, migration or provider construct was added", () => {
    expect(readdirSync(CULTURE_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "population-scope.ts",
      "ports.ts",
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
    for (const forbidden of ["migrations/manifests/culture.json"])
      expect(existsSync(forbidden)).toBe(false);
  });
});

describe("acceptance-register and open-gate honesty: the frozen spec files are untouched", () => {
  it("the lock, the acceptance register, the open gates and the Runtime Contract are byte-identical to the base", () => {
    expect(sha256File("spec/f027/spec-lock.json")).toBe(
      "88f40002275977f5774ea275d8c4ab4e25c630e30edfd305b507272dc892eff6",
    );
    expect(lock.snapshot_files["spec/f027/acceptance-register.yaml"]).toBe(
      "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(sha256File("spec/f027/README.md")).toBe(
      "aed7da7bd7b40002125849b2cbff39b73bd85f2a4c0664cc0f08eb558e7a15cb",
    );
  });
  it("no row was promoted: nothing is PASS/FAIL, and IA-07, IA-24, IA-27 stay BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });
  it("every open gate stays at its recorded status; PF-6/F-028, provider, deployment and migration stay inactive and nothing is calibrated", () => {
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    expect(statusOf("CAL-01")).toBe("UNCALIBRATED");
    expect(statusOf("CAL-03")).toBe("NO_ADOPTED_PRODUCTION_NUMBER");
    expect(statusOf("OB-016")).toBe("OPEN_CODE_ERA_CONFORMANCE");
  });
});
