// Conformance evidence for the GIP Stable Institution Identity (twelfth slice) and Office / Authority Locus (thirteenth
// slice, see gip-office-conformance.test.ts for its own proofs) Backbone Foundations. Each block names its
// register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED (see
// `partial_evidence`): this slice covers only the aspects it names, and every other F-027 open gate is unchanged.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  GIP_FACT_KINDS,
  GIP_OFFICE_RULE,
  GIP_RULE,
  GIP_INSTRUMENT_RULE,
  GIP_SCOPE_BINDING_RULE,
  GipAdapter,
  WS007_SOURCE,
  factKind,
} from "@immortalis/engine";
import { code, gates, lock, register } from "../support/f027.ts";
import {
  expectedKindIds,
  expectedOwnerFacetSet,
  expectedAdapterMethods,
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
const GIP_DIR = "packages/engine/src/gip";
const GIP_SOURCES = [
  ...readdirSync(GIP_DIR).map((f) => join(GIP_DIR, f)),
  "packages/contracts/src/gip.ts",
];

describe("IA-01 source/version fidelity (GIP registration aspect)", () => {
  it("the GIP kind cites WS-007 at its exact spec-locked pin and the IM-06 lowering, with the Scaling Profile, OB-046, F-017's and the Runtime Contract's pins in the lineage", () => {
    const ws007 = lock.frozen_sources.find((s) => s.id === "WS-007")!;
    expect(WS007_SOURCE).toEqual({ artifact: ws007.url, native_pin: ws007.native_pin });
    expect(ws007.primary_im).toBe("IM-06");
    expect(ws007.native_pin).toBe("2026-09-24T01:42:24.952Z");
    for (const kind of GIP_FACT_KINDS) {
      expect(kind.rule).toEqual(
        kind.id === "gip_office_authority_locus"
          ? GIP_OFFICE_RULE
          : kind.id === "gip_scope_binding"
            ? GIP_SCOPE_BINDING_RULE
            : kind.id === "gip_governance_instrument" || kind.id === "gip_sunset_enrollment"
              ? GIP_INSTRUMENT_RULE
              : GIP_RULE,
      );
      expect(kind.rule.artifact).toBe(ws007.url);
      expect(kind.rule.native_pin).toBe(ws007.native_pin);
      expect(kind.im).toBe("IM-06");
      expect(kind.rule.supersedes).toBeNull();
    }
    expect(GIP_OFFICE_RULE.authority_lineage).toEqual(GIP_RULE.authority_lineage);
    expect(GIP_SCOPE_BINDING_RULE.authority_lineage).toEqual(GIP_RULE.authority_lineage);
    expect(GIP_INSTRUMENT_RULE.authority_lineage).toEqual(GIP_RULE.authority_lineage);
    const lineage = GIP_RULE.authority_lineage.join("\n");
    expect(lineage).toContain(ws007.native_pin);
    expect(lineage).toContain("2026-09-25T00:59:55.526Z"); // GIP Scaling Profile v1.1, Red-confirmed
    expect(lineage).toContain("3e520af901e081e5be76efd3902a180c"); // OB-046 closed record
    expect(lineage).toContain("2026-09-25T23:42:27.802Z"); // F-017 conformance pin
    const tranche = lock.incorporated_tranches.find((t) =>
      t.title.includes("Runtime Contract & Translation"),
    )!;
    expect(lineage).toContain(tranche.native_pin);
  });

  it("the rule names the clauses the state relies on: GIP-owned state, explicit non-ownership, the Institution Identity Reference, and the cardinality and creation rules", () => {
    for (const c of [
      "Draft v2.1 §2.1",
      "institution identity references",
      "§2.2 Explicit non-ownership",
      "§3.1 Institution Identity Reference",
      "institution_id, identity_label, continuity_status",
      "identity/provenance only, not a catch-all state ledger",
      "Scaling Profile v1.1 §3",
      "one materially distinct continuing institution identity",
      "never a common property bag",
      "§4 Growth & lifecycle — Creation",
      "no scan of all institutions",
    ])
      expect(GIP_RULE.clause).toContain(c);
  });
});

describe("IA-03 owner exclusivity: the GIP owner holds the Institution Identity, the Office / Authority Locus, the Authority Scope Binding and the Governance Instrument core only", () => {
  it("registers exactly one new owner, gip, with ONE facet, one exclusive create-only identity key space and exclusive ADVANCING office and scope-binding key spaces", () => {
    // (the exact GIP kind inventory, the owner → facet registration and the global count are the central oracle's:
    // registered-surface-conformance; what stays here is each kind's own owner, facet and lifecycle classification)
    for (const k of GIP_FACT_KINDS)
      expect([k.id, k.owner, k.facet]).toEqual([k.id, "gip", "gip_institution_identity"]);
    expect(factKind("gip_institution_identity").lifecycle).toBe("SEALED");
    for (const id of [
      "gip_office_authority_locus",
      "gip_scope_binding",
      "gip_governance_instrument",
    ] as const)
      expect(factKind(id).lifecycle, id).toBe("ADVANCING");
    expect(GIP_FACT_KINDS.map((k) => k.id)).toEqual(expectedKindIds({ group: "GIP_FACT_KINDS" }));
    expect(CANONICAL_OWNER_REGISTRY.get("gip")).toEqual(expectedOwnerFacetSet("gip"));
    expect(
      ALL_FACT_KINDS.filter((k) => k.keyPattern.test("gip/institution/i1/identity")),
    ).toHaveLength(1);
    expect(
      ALL_FACT_KINDS.filter((k) => k.keyPattern.test("gip/institution/i1/office/o1")),
    ).toHaveLength(1);
    expect(
      ALL_FACT_KINDS.filter((k) =>
        k.keyPattern.test("gip/institution/i1/office/o1/scope-binding/s1"),
      ),
    ).toHaveLength(1);
    expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test("gip/instrument/n1"))).toHaveLength(1);
  });

  it("there is no instrument clause or amendment, procedure, membership, faction, asset, resource, KTI, actor, relationship, military, territory or lifecycle kind, and no fallback GIP owner", () => {
    for (const k of GIP_FACT_KINDS)
      expect(
        k.id
          .replace("gip_office_authority_locus", "")
          .replace("gip_scope_binding", "")
          .replace("gip_governance_instrument", ""),
      ).not.toMatch(
        /office|authorit|instrument|procedure|member|headcount|faction|asset|resource|treasur|kti|actor|relation|militar|territor|jurisdiction|transition|rename|split|merge|abolish|replace|success|score|level|rank/,
      );
    expect(
      [...CANONICAL_OWNER_REGISTRY.keys()].filter((n) =>
        /gip|government|institution|politic|polity|state_|authority/.test(n),
      ),
    ).toEqual(["gip"]);
    expect(GIP_FACT_KINDS.every((k) => k.im === "IM-06")).toBe(true);
  });

  it("there is no GIP writer other than the four authored establishments, and each read is by exact key", () => {
    // (the whole adapter surface is the central oracle's: registered-surface-conformance) — every mutating verb is an
    // authored initial establishment, and no other writer-shaped method exists
    expect(adapterMethods(GipAdapter)).toEqual(expectedAdapterMethods("GipAdapter"));
    expect(
      adapterMethods(GipAdapter).filter(
        (m) =>
          !/^establish[A-Z]/.test(m) &&
          /^(set|update|write|amend|replace|rename|merge|split|abolish|remove|delete|apply)/i.test(
            m,
          ),
      ),
    ).toEqual([]);
  });

  it("the GIP owner never writes a foreign key space: no foreign owner or key builder appears in its modules", () => {
    for (const f of GIP_SOURCES.filter((f) => !/integrity/.test(f))) {
      expect(code(f), f).not.toMatch(
        /pcExistenceContractKey|PLAYER_CHARACTER_BINDING_KEY|populationLedgerKey|worldFallbackEntityKey|actorCapability|accessEventKey|accessPacketKey|accessProvenanceKey|ktiDevelopmentObjectKey|ktiTransfer|OWNER_POPULATION|OWNER_WORLD_STATE|OWNER_NAMED_ACTOR|OWNER_ECONOMY|OWNER_LOGISTICS|OWNER_PRODUCTION|OWNER_EPISTEMIC_ACCESS|OWNER_KTI|OWNER_TEMPORAL_KERNEL/,
      );
    }
  });

  it("the only foreign key builder a GIP module names is the Temporal kernel's sunset-object key, to READ whether the kernel registered it: GIP never writes a kernel key (sunset slice)", () => {
    const naming = GIP_SOURCES.filter((f) => /temporalObjectKey/.test(code(f))).sort();
    expect(naming).toEqual([
      `${GIP_DIR}/adapter.ts`,
      `${GIP_DIR}/admission.ts`,
      `${GIP_DIR}/declaration.ts`,
      `${GIP_DIR}/integrity.ts`,
    ]);
    // the adapter writes through its own publication only; the kernel object is registered by the kernel's own coordinator
    expect(code(`${GIP_DIR}/adapter.ts`)).toMatch(/registerObject\(/);
    expect(code(`${GIP_DIR}/adapter.ts`)).not.toMatch(/OWNER_TEMPORAL_KERNEL|FACET_TEMPORAL/);
  });

  it("the predecessor owners' own surfaces are unchanged: no GIP part and no new writer", () => {
    // (the KTI adapter's own whole surface is the central oracle's: registered-surface-conformance)
    for (const f of [
      ...walk("packages/engine/src/epistemic"),
      ...walk("packages/engine/src/actor"),
      ...walk("packages/engine/src/kti"),
      ...walk("packages/engine/src/population"),
      ...walk("packages/engine/src/production"),
      ...walk("packages/engine/src/economy"),
      ...walk("packages/engine/src/logistics"),
      "packages/engine/src/world/fallback-custody.ts",
      "packages/engine/src/world/entity-transition.ts",
    ])
      expect(code(f), f).not.toMatch(/OWNER_GIP|FACET_GIP|GipAdapter|gipInstitution|gip\//);
    // the coordinator names GIP only through the sunset slice's one refusal guard (an unregistered sunset is not crossed)
    const coordinator = code("packages/engine/src/temporal/coordinator.ts");
    expect(coordinator).not.toMatch(/OWNER_GIP|FACET_GIP|GipAdapter|gipInstitution|gipInstrument/);
    expect(coordinator.match(/\bgip[A-Z]\w*/g)).toEqual([
      "gipEnrollmentPendingViolation",
      "gipEnrollmentPendingViolation",
    ]);
  });

  it("the GIP wiring into predecessor modules is exactly the registry, the one canonical admission dispatch, load verification and the temporal registration guard", () => {
    const touching = walk("packages/engine/src")
      .filter((f) => !f.startsWith(GIP_DIR))
      .filter((f) =>
        /OWNER_GIP|gipGroupCheck|verifyGipIntegrity|gipObjectViolation|GIP_FACT_KINDS/.test(
          code(f),
        ),
      )
      .sort();
    expect(touching).toEqual([
      "packages/engine/src/owners/admission.ts",
      "packages/engine/src/owners/registry.ts",
      "packages/engine/src/temporal/admission.ts",
      "packages/engine/src/world/canonical-campaign.ts",
    ]);
  });

  it("the test fixtures are clearly synthetic and production code never imports the testkit or names a synthetic owner", () => {
    const fixtures = readFileSync("packages/testkit/src/gip-fixtures.ts", "utf8");
    expect(fixtures).toMatch(/SYNTHETIC TEST DATA/);
    for (const f of [...walk("packages/engine/src"), ...walk("packages/contracts/src")]) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/@immortalis\/testkit/);
      expect(text, f).not.toMatch(/SYNTHETIC-/);
    }
  });
});

describe("the GIP contract is qualitative: no score, number, threshold, default or free property (IA-02)", () => {
  it("no GIP module defines a numeric value, rate, threshold, modifier, probability, score or default", () => {
    for (const f of GIP_SOURCES) {
      // the twentieth slice's one optional WS-007 §3.1 field is the single permitted `.optional(` of the GIP contract
      const text = identifiers(f).replace(/\bconstitutive_source_ref: EntityId\.optional\(\)/g, "");
      expect(text, f).not.toMatch(
        /z\.(number|bigint|int|float)\b|\.(min|max|gt|gte|lt|lte)\(\s*\d|\b(weight|rate|ratio|threshold|modifier|probability|score|percent|level|rank|tier)\b|\.default\(|\.catch\(|\.optional\(|\.passthrough\(|z\.record\(|z\.any\(|z\.unknown\(|looseObject/i,
      );
    }
  });

  it("every GIP object schema is strict: there is no passthrough, loose object, record or catch-all", () => {
    const contract = code("packages/contracts/src/gip.ts");
    expect(contract).toMatch(/z\.strictObject\(/);
    expect(contract).not.toMatch(/z\.object\(|passthrough|looseObject|z\.record|z\.any|z\.unknown/);
  });
});

describe("reuse, not fork: IM-03, IM-11, IM-12 and IM-17 are the existing machinery", () => {
  it("there is no second journal, save, sidecar, provider or storage: the GIP modules persist nothing themselves", () => {
    for (const f of GIP_SOURCES)
      expect(
        // (the sunset slice's one shipped Temporal stage provider, the registry the adapter hands the kernel's own
        // coordinator and the shared load-time stage-identity check are the permitted names: they persist nothing)
        code(f)
          .replace(
            /\bgipSunsetExpiryProvider\b|\bStageProvider\w*|\bjournaledStageViolation\b/g,
            "",
          )
          .replace(/"\.\.\/temporal\/providers\.ts"/g, '""'),
        f,
      ).not.toMatch(
        /node:fs|node:path|writeFile|appendFile|readFile|createWriteStream|JSON\.stringify|localStorage|indexedDB|sqlite|journal|sidecar|provider/i,
      );
  });

  it("an identity and an office are committed only through the one store.commit seam and reached through the one canonical admission", () => {
    const adapter = code(`${GIP_DIR}/adapter.ts`);
    expect(adapter.match(/\.commit\(/g)).toHaveLength(1);
    expect(adapter).toMatch(/CANON_WRITE_AUTHORITY/);
    const admission = code("packages/engine/src/owners/admission.ts");
    expect(admission).toMatch(
      /if \(group\.owner === OWNER_GIP\) return gipGroupCheck\(group, state\);/,
    );
    expect(code("packages/engine/src/world/canonical-campaign.ts")).toMatch(
      /verifyGipIntegrity\(store\)/,
    );
  });
});

describe("IA-04 turnless: no tick, phase, scheduler, clock, RNG, cadence or global scan in the GIP path", () => {
  it("the modules contain no tick/turn/phase/scheduler/timer/clock/RNG/cadence/sweep/polling construct", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual)\b/;
    for (const f of GIP_SOURCES) expect(code(f), f).not.toMatch(forbidden);
  });

  it("holds no mutable module state, and only the diagnostic integrity verifier lists facts (no all-institutions scan, no history sweep)", () => {
    for (const f of GIP_SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(GIP_SOURCES.filter((f) => /listFacts\(/.test(code(f)))).toEqual([
      `${GIP_DIR}/integrity.ts`,
    ]);
    for (const f of GIP_SOURCES)
      expect(code(f), f).not.toMatch(
        /matrix|roster|allInstitutions|allOffices|forEachInstitution|for \(const (institution|office|member) of/i,
      );
  });

  it("GIP declares exactly ONE operation, ONE stage, ONE shipped stage provider and ONE kind of temporal object (an Instrument's sunset), and still no close, tick, phase or scheduler (sunset slice)", () => {
    const declaration = code(`${GIP_DIR}/declaration.ts`);
    // no close is declared, and exactly one stage is built
    expect(declaration).not.toMatch(/declares_close:\s*\{/);
    expect(declaration.match(/gipSunsetStage\(/g)).toHaveLength(1);
    expect(declaration).toMatch(/declares_close: null/);
    expect(declaration).not.toMatch(/READ_MODE_CLOSE|AS-OF-DECLARED-CLOSE/);
    // the adapter hands the kernel's coordinator an EMPTY registry: registration resolves nothing
    const adapter = identifiers(`${GIP_DIR}/adapter.ts`);
    expect(adapter).not.toMatch(/StageKey|ResolutionRequest|\.advance\(|continueRemainder/);
    expect(adapter).toMatch(/new StageProviderRegistry\(\)/);
    // exactly one provider module, exactly one provider
    expect(readdirSync(GIP_DIR)).toContain("provider.ts");
    expect(code(`${GIP_DIR}/provider.ts`).match(/export const \w+: StageProvider/g)).toHaveLength(
      1,
    );
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("no procedure, Governance Instrument, scope applicability, political relation, pending decision, reach, stability, faction, membership, KTI, Diplomacy, actor, projection or host construct exists in the GIP modules (the Scope Binding of the fifteenth slice and the Governance Instrument core establishment and keyed read of the sixteenth are the only scope and instrument constructs)", () => {
    for (const f of GIP_SOURCES) {
      // the sixteenth slice's Governance Instrument core identifiers are the one permitted instrument construct
      const text = identifiers(f).replace(/\b\w*[Ii]nstrument\w*\b/g, "");
      expect(text, f).not.toMatch(
        /\b(offices|delegation|delegations|delegate\w*|concurrence|decisionBody|conditional\w*|appoint\w*|appointment|exercis\w*|instrument|instruments|procedure|veto|override|applicab\w*|politicalRelation|pendingDecision|administrativeReach|implementationStatus|stability|legitimacy|recognition|faction|membership|members|headcount|population|treaty|diplomacy|asset|assets|treasury|resource|kti|belief|relationship|militar\w*|territory|jurisdiction|projection|npk|llm|prompt|host)\b/i,
      );
    }
  });

  it("no lifecycle transition exists: rename, split, merge, abolition, replacement and succession (beyond the office's authored succession_rule text) have no code, status or field", () => {
    for (const f of GIP_SOURCES) {
      // the office's `succession_rule` text and the Institution Identity's twentieth-slice optional `constitutive_source_ref` are the
      // two permitted names
      const text = identifiers(f)
        .replace(/\bsuccession_rule\b/g, "")
        .replace(/\bconstitutive_source_ref\b/g, "");
      expect(text, f).not.toMatch(
        /\b(rename\w*|split\w*|merge\w*|abolish\w*|replac(e|ed|ement)\b|succe(ed|ssor|ssion)\w*|predecessor\w*|successor\w*|constitutive\w*|supersede\w*)\b/i,
      );
    }
    const contract = readFileSync("packages/contracts/src/gip.ts", "utf8");
    // the only status literal the schema accepts is "continuing"
    expect(
      contract.match(/continuity_status: z\.literal\(GIP_CONTINUITY_CONTINUING\)/g),
    ).toHaveLength(1);
    expect(contract).toMatch(/GIP_CONTINUITY_CONTINUING = "continuing"/);
  });

  it("no randomization of any kind exists: no RNG, roll, bounded prior, seed, chooser or default (GitHub Issue #11 stays open and unimplemented)", () => {
    for (const f of GIP_SOURCES)
      expect(
        // (`input.prior` is the Temporal seam's name for an owner's own committed prior state - the Instrument's current fact
        // the sunset stage advances, `committedBefore` the adapter's journal lookup - never a probabilistic prior)
        identifiers(f).replace(/\binput\.prior\b/g, ""),
        f,
      ).not.toMatch(
        /\b(random\w*|rng|roll\w*|seed\w*|prior|dice|chooser|sample\w*|stochastic|probabilit\w*|uncertain\w*|blocked-spec)\b/i,
      );
  });

  it("the GIP module set is exactly the IM-06 owner path; no other engine directory beyond the twelfth slice's was added", () => {
    expect(readdirSync(GIP_DIR).sort()).toEqual([
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
      "referee",
      "source-drawdown",
      "temporal",
      "world",
    ]);
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
    for (const forbidden of ["migrations/manifests/gip.json"])
      expect(existsSync(forbidden)).toBe(false);
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
  });
  it.each(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence naming the GIP tests and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(/GIP/);
      expect(row.partial_evidence?.tests.some((t) => /gip/.test(t))).toBe(true);
    },
  );
  it("only the rows this slice demonstrates gained GIP evidence: no other row names GIP, Institution Identity or WS-007 work", () => {
    const named = register
      .filter((r) => /GIP|Institution Identity/.test(r.partial_evidence?.scope ?? ""))
      .map((r) => r.id)
      .sort();
    expect(named).toEqual(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"]);
  });
  it("IA-02's GIP evidence names the unimplemented WS-007 surfaces and lifecycle transitions, and the row stays NOT_IMPLEMENTED", () => {
    const row = register.find((r) => r.id === "IA-02")!;
    expect(row.status).toBe("NOT_IMPLEMENTED");
    expect(row.evidence).toBeNull();
    const scope = row.partial_evidence!.scope;
    expect(scope).toMatch(/Governance Instruments/);
    expect(scope).toMatch(/lifecycle transition/);
    expect(scope).toMatch(/GitHub Issue #11 is untouched/);
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
