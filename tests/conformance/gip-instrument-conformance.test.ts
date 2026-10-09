// Conformance evidence for the GIP Governance Instrument Core Backbone Foundation (sixteenth slice): initial establishment only of
// one strict GIP-owned Governance Instrument core record beneath one exact already-committed Office / Authority Locus and one exact
// already-committed Scope Binding of that same office. Each block names its register ID; governing lock: spec/f027/spec-lock.json
// (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and
// every other F-027 open gate is unchanged.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  GIP_FACT_KINDS,
  GIP_INSTRUMENT_RULE,
  GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
  GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
  GIP_OFFICE_RULE,
  GIP_OFFICE_RULE_THIRTEENTH_SLICE,
  GIP_RULE,
  GIP_SCOPE_BINDING_RULE,
  GipAdapter,
  WS007_SOURCE,
  factKind,
} from "@immortalis/engine";
import { code, gates, lock, register, sha } from "../support/f027.ts";
import {
  EXPECTED_LEGACY_RULE_KIND_IDS,
  expectedKindIds,
  expectedOwnerFacetSet,
  expectedAdapterMethods,
} from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";
import { PROTOCOL_ONLY_EVENT_SIGNAL_READ, protocolIndexExports } from "../support/protocol.ts";

/** Source with comments AND string literals removed: only the identifiers and operators of the code remain. */
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/z\.infer/g, "z.type");

const GIP_DIR = "packages/engine/src/gip";
const CONTRACT = "packages/contracts/src/gip-instrument.ts";
const ENGINE_SOURCES = readdirSync(GIP_DIR).map((f) => join(GIP_DIR, f));
const SOURCES = [...ENGINE_SOURCES, "packages/contracts/src/gip.ts", CONTRACT];
const instrument = factKind("gip_governance_instrument");

/** The WS-007 §4.1 / §4.2 literals, copied verbatim from the frozen source text (independent of the contract's own constants). */
const SOURCE_FIELDS = [
  "instrument_id",
  "source_authority_ref",
  "authority_basis_ref",
  "operative_effect",
  "scope_binding_ref",
  "validity_by_order",
  "lifecycle_status",
];
// (the twenty-first slice implements `predecessor_instrument_ref` and the sunset-slice `sunset_condition`: neither is in this list)
const SOURCE_CONDITIONAL = [
  "activation_condition",
  "effective_from",
  "renewal_rule",
  "implementation_assignment_ref",
  "administrative_path_ref",
  "sanction_or_remedy",
  "institutional_promulgation_or_publication_requirement",
  "promulgation_act_ref",
  "individual_notice_requirement_ref",
  "appeal_review_override",
  "supersession_ref",
  "provenance_note",
];

describe("IA-01 source/version fidelity (GIP Governance Instrument registration and literal aspect)", () => {
  it("the Instrument kind cites WS-007 at its exact spec-locked pin and the IM-06 lowering, with the same lineage as the other GIP kinds", () => {
    const ws007 = lock.frozen_sources.find((s) => s.id === "WS-007")!;
    expect(WS007_SOURCE).toEqual({ artifact: ws007.url, native_pin: ws007.native_pin });
    expect(instrument.rule).toEqual(GIP_INSTRUMENT_RULE);
    expect(instrument.rule.artifact).toBe(ws007.url);
    expect(instrument.rule.native_pin).toBe(ws007.native_pin);
    expect(instrument.rule.native_pin).toBe("2026-09-24T01:42:24.952Z");
    expect(instrument.rule.effective_basis).toBe("pinned-by-spec-lock");
    expect(instrument.rule.supersedes).toBeNull();
    expect(instrument.im).toBe("IM-06");
    expect(instrument.rule.authority_lineage).toEqual(GIP_RULE.authority_lineage);
    expect(instrument.rule.authority_lineage).toEqual(GIP_OFFICE_RULE.authority_lineage);
    expect(instrument.rule.authority_lineage).toEqual(GIP_SCOPE_BINDING_RULE.authority_lineage);
  });

  it("the rule names the clauses the state relies on: §2.1/§2.2, §4.1 and its literals, §4.2, the deferred §4.3/§4.4, §21 and the Instrument/Clause cardinality", () => {
    for (const c of [
      "Draft v2.1 §2.1 GIP-owned persistent state (Governance Instruments)",
      "§2.2 Explicit non-ownership",
      "§4.1 Mandatory fields",
      "instrument_id, source_authority_ref, authority_basis_ref, operative_effect, scope_binding_ref, validity_by_order[] with governing_order_ref and validity_status, lifecycle_status",
      "validity is order-relative and lifecycle/force is not validity",
      "§4.2 Operative-effect classes",
      "every other §4.3 conditional field not implemented) and §4.4 addressable clauses not implemented",
      "§21.1 Create and §21.2 Update",
      "Concept Amendment v2.1 A7",
      "Scaling Profile v1.1 §3 Cardinality basis (Instrument/Clause: the Instrument unit only)",
      "no scan of all institutions, offices, bindings, instruments, orders, recipients or subjects",
    ])
      expect(GIP_INSTRUMENT_RULE.clause).toContain(c);
  });

  it("the current citation is the pinned sunset-slice successor, the sixteenth- and twenty-first-slice ones are preserved byte-for-byte, and the identity, office (and its historical compatibility) and binding citations are unchanged", () => {
    expect(sha(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE)).toBe(
      "6230c2ab55fd0c4dfcdbd37911afdfcd766e8cd26996fb6ccc70a2c246d9e294",
    );
    // the twenty-first-slice citation: the value this very hash pinned as the CURRENT citation before the sunset slice
    expect(sha(GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE)).toBe(
      "e71c37c3ddbe51a43dd3c74c6ba33e3f31cc7e0fc89a4aee4ec4248316482af4",
    );
    expect(sha(GIP_INSTRUMENT_RULE)).toBe(
      "200a5489f3bc70e1f05e84a6ac4dab603284658d8cc4664642715ddd4d453564",
    );
    expect(sha(GIP_SCOPE_BINDING_RULE)).toBe(
      "a05c6a641840f7f9e55fce85cf9949fa7fca621119ca92248731db7c2ca93876",
    );
    expect(sha(GIP_OFFICE_RULE_THIRTEENTH_SLICE)).toBe(
      "794f072b5a78d20f054ed809fe62693e1998bcf7eaa6e401d295d592fd9da9c8",
    );
    expect(sha(GIP_OFFICE_RULE)).toBe(
      "580f849a52c8467718a7f5593d253a8881122c60534ae1bd390e3578736cb4b7",
    );
    expect(factKind("gip_scope_binding").rule).toEqual(GIP_SCOPE_BINDING_RULE);
    const office = factKind("gip_office_authority_locus");
    expect(office.rule).toEqual(GIP_OFFICE_RULE);
    expect(office.legacyRule!.rule).toEqual(GIP_OFFICE_RULE_THIRTEENTH_SLICE);
    expect(factKind("gip_institution_identity").rule).toEqual(GIP_RULE);
  });

  it("the historical-compatibility hatch is the existing fact-kind mechanism: the office kind and (twenty-first slice) the Instrument kind have one, and admission stamps only the current citation", () => {
    // (the inventory is the central oracle's, EXPECTED_LEGACY_RULE_KIND_IDS: stated against it, not a literal)
    expect(ALL_FACT_KINDS.filter((k) => k.legacyRule).map((k) => k.id)).toEqual([
      ...EXPECTED_LEGACY_RULE_KIND_IDS,
    ]);
    expect(instrument.legacyRule!.rule).toEqual(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE);
    // (the sunset slice's second superseded citation sits in the same kind, beside - never instead of - the first)
    expect(instrument.laterLegacyRules!.map((l) => l.rule)).toEqual([
      GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
    ]);
    expect(code(`${GIP_DIR}/admission.ts`)).toMatch(
      /canonicalEqual\(group\.rule, GIP_INSTRUMENT_RULE\)/,
    );
    expect(identifiers(`${GIP_DIR}/admission.ts`)).not.toMatch(/THIRTEENTH|SIXTEENTH|TWENTY_FIRST/);
  });

  it("the source identifiers are reproduced exactly: the contract names exactly the seven §4.1 fields, singular operative_effect, validity_by_order and the two entry fields", () => {
    const contract = code(CONTRACT);
    const body = /const InstrumentCoreShape = \{([\s\S]*?)\n\};/.exec(contract)!;
    const fields = [...body[1]!.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(fields).toEqual(SOURCE_FIELDS);
    const entry = /InstrumentValidityEntrySchema = z\.strictObject\(\{([\s\S]*?)\}\)/.exec(
      contract,
    )!;
    expect([...entry[1]!.matchAll(/^\s*(\w+):/gm)].map((m) => m[1])).toEqual([
      "governing_order_ref",
      "validity_status",
    ]);
    // no renamed, pluralised, singularised or merged identifier appears anywhere in the executable surface
    for (const f of [...ENGINE_SOURCES, CONTRACT])
      expect(identifiers(f), f).not.toMatch(
        /\boperative_effects\b|\boperativeEffects?\b|\bvalidity_by_orders\b|\bvalidityByOrder\b|\blegal_status\b|\binstrument_ref\b/,
      );
    expect(code(CONTRACT).match(/\boperative_effect:/g)).toHaveLength(1);
    expect(code(CONTRACT)).not.toMatch(/operative_effects/);
  });

  it("the literal sets are exactly the source's (counts and members), with void distinct from invalid, and no catch-all", () => {
    const contract = code(CONTRACT);
    const list = (name: string) =>
      [
        ...new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`)
          .exec(contract)![1]!
          .matchAll(/"([^"]+)"/g),
      ].map((m) => m[1]);
    expect(list("INSTRUMENT_VALIDITY_STATUSES")).toEqual([
      "valid",
      "invalid",
      "void",
      "contested",
      "unresolved",
    ]);
    expect(list("INSTRUMENT_LIFECYCLE_STATUSES")).toEqual([
      "proposed",
      "pending",
      "active",
      "suspended",
      "superseded",
      "repealed",
      "terminated",
      "expired",
    ]);
    expect(list("INSTRUMENT_OPERATIVE_EFFECTS")).toHaveLength(20);
    expect(list("INSTRUMENT_OPERATIVE_EFFECTS")).toEqual([
      "obligation",
      "prohibition",
      "permission",
      "authority_grant",
      "delegation",
      "privilege",
      "entitlement",
      "immunity",
      "constitutive_creation",
      "status_change",
      "appropriation",
      "reservation",
      "appointment",
      "removal",
      "confirmation",
      "suspension",
      "repeal",
      "supersession",
      "invalidation",
      "administrative_direction",
    ]);
    for (const l of [
      ...list("INSTRUMENT_VALIDITY_STATUSES"),
      ...list("INSTRUMENT_LIFECYCLE_STATUSES"),
      ...list("INSTRUMENT_OPERATIVE_EFFECTS"),
    ])
      expect(l).not.toMatch(/setting|other|unknown|custom|extension/);
  });
});

describe("IA-03 owner exclusivity: one more kind of the one GIP owner, ADVANCING, exclusive key space, no second ledger", () => {
  it("the Instrument kind is under the existing GIP owner and facet, ADVANCING, in one exclusive key space keyed by instrument_id alone", () => {
    expect([instrument.owner, instrument.facet, instrument.lifecycle]).toEqual([
      "gip",
      "gip_institution_identity",
      "ADVANCING",
    ]);
    expect(
      ALL_FACT_KINDS.filter((k) => k.keyPattern.test("gip/instrument/n1")).map((k) => k.id),
    ).toEqual(["gip_governance_instrument"]);
    expect(instrument.keyPattern.exec("gip/instrument/n1")!.slice(1)).toEqual(["n1"]);
    // no overlap with the identity, office or binding key spaces, in either direction, and no extra identity dimension
    for (const key of [
      "gip/institution/i1/identity",
      "gip/institution/i1/office/o1",
      "gip/institution/i1/office/o1/scope-binding/s1",
      "gip/instrument",
      "gip/instrument/",
      "gip/instrument/n1/x",
      "gip/instrument/n1/clause/c1",
      "gip/instrument/o1/n1",
      "gip/instruments/n1",
      "gip/institution/i1/instrument/n1",
    ])
      expect(instrument.keyPattern.test(key), key).toBe(false);
    for (const k of GIP_FACT_KINDS.filter((k) => k.id !== "gip_governance_instrument"))
      expect(k.keyPattern.test("gip/instrument/n1"), k.id).toBe(false);
  });

  it("the registry holds exactly the five GIP kinds (the sunset slice adds only GIP's sunset enrollment receipt) and no clause, procedure, order, relation, status, membership, faction or fallback kind", () => {
    // (the exact GIP kind inventory is the central oracle's: stated against it, not a literal)
    expect(CANONICAL_OWNER_REGISTRY.get("gip")).toEqual(expectedOwnerFacetSet("gip"));
    expect(GIP_FACT_KINDS.map((k) => k.id)).toEqual(expectedKindIds({ group: "GIP_FACT_KINDS" }));
    expect(GIP_FACT_KINDS.every((k) => k.im === "IM-06" && k.owner === "gip")).toBe(true);
    expect(
      [...CANONICAL_OWNER_REGISTRY.keys()].filter((n) =>
        /gip|government|institution|politic|polity|state_|authority|scope|binding|instrument|order|law|clause/.test(
          n,
        ),
      ),
    ).toEqual(["gip"]);
  });

  it("no second GIP ledger, sidecar or persistence path exists: the engine's GIP modules are the four predecessor modules plus the sunset slice's derivation and its one stage provider", () => {
    expect(readdirSync(GIP_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "derive.ts",
      "integrity.ts",
      "provider.ts",
    ]);
    for (const f of SOURCES)
      expect(
        // (the one shipped Temporal stage provider, the registry the adapter hands the kernel's own coordinator and the shared
        // load-time stage-identity check are the permitted names: they persist nothing)
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
    // (the GIP adapter's commit and writer cardinality are the central oracle's: registered-surface-conformance)
  });

  it("the GIP adapter has its authored writers and keyed reads: no Instrument update, enactment, validity, lifecycle, clause or applicability method (the lifecycle close is GIP's Temporal stage, never an adapter method)", () => {
    // (the whole adapter surface is the central oracle's: registered-surface-conformance)
    expect(adapterMethods(GipAdapter)).toEqual(expectedAdapterMethods("GipAdapter"));
    expect(
      adapterMethods(GipAdapter).filter((m) =>
        /update|enact|validity|lifecycle|clause|applicab|expire|advance/i.test(m),
      ),
    ).toEqual([]);
  });

  it("admission authorizes initial establishment only, pins exactly the source office and the Scope Binding, and the wiring into predecessor modules is the existing registry, dispatch and load verification", () => {
    const admission = code(`${GIP_DIR}/admission.ts`);
    expect(admission).toMatch(/AMENDMENT_NOT_SUPPORTED/);
    expect(admission).toMatch(/requirePrerequisite\(group, state, officeKey/);
    expect(admission).toMatch(/requirePrerequisite\(group, state, bindingKey/);
    expect(admission).toMatch(/group\.reads\.length !== 2 \|\| group\.depends_on\.length !== 2/);
    const touching = walk("packages/engine/src")
      .filter((f) => !f.startsWith(GIP_DIR))
      .filter((f) => /gip_governance_instrument|GovernanceInstrument|gipInstrument/.test(code(f)))
      .sort();
    expect(touching).toEqual([
      "packages/engine/src/owners/admission.ts",
      "packages/engine/src/owners/registry.ts",
    ]);
    const verifier = code(`${GIP_DIR}/integrity.ts`);
    expect(verifier.match(/listFacts\(/g)).toHaveLength(1);
    expect(verifier).toMatch(/verifyInstrument\(store, f, byKey, bad\)/);
  });
});

describe("IA-02 strict executable contract: the §4.1 mandatory fields, nothing uninterpreted is interpreted, nothing deferred is invented", () => {
  it("the schemas are strict objects, with exactly one optional field (predecessor_instrument_ref, twenty-first slice) and no default, catch, loose, record, any, unknown, discriminator, transform or union", () => {
    const contract = code(CONTRACT);
    expect(contract).toMatch(/GovernanceInstrumentCoreSchema = z\s*\.strictObject\(/);
    expect(contract).toMatch(/GovernanceInstrumentSchema = z\s*\.strictObject\(/);
    expect(contract).toMatch(/InstrumentValidityEntrySchema = z\.strictObject\(/);
    expect(contract).not.toMatch(
      /z\.object\(|passthrough|looseObject|z\.record|z\.any|z\.unknown|\.default\(|\.catch\(|discriminatedUnion|\.transform\(|\.superRefine\(|z\.union\(|\.nullable\(|\.nullish\(/,
    );
    // (the twenty-first-slice value class and the current shape each carry the one predecessor reference; the current shape alone
    // carries the sunset slice's sunset_condition)
    expect(contract.match(/\.optional\(/g)).toHaveLength(3);
    expect(contract.match(/predecessor_instrument_ref: EntityId\.optional\(\),/g)).toHaveLength(2);
    expect(contract).toMatch(/sunset_condition: InstrumentSunsetCondition\.optional\(\),/);
    // the same-authority structural refinement (once on the historical core shape, once on the current one) plus the one
    // explicit-undefined refusal on the current one. No minimum cardinality, uniqueness, deduplication, merging or
    // conflict-resolution rule exists over validity_by_order[] (the source defines none)
    expect(contract.match(/\.refine\(/g)).toHaveLength(5);
    expect(contract).toMatch(
      /scope_binding_ref must address a Scope Binding of the same authority/,
    );
    expect(contract).toMatch(/validity_by_order: z\.array\(InstrumentValidityEntrySchema\),/);
    expect(contract).not.toMatch(/\.min\(|\.max\(|\.length\(|\.nonempty\(|new Set\(|\.some\(/);
    // the one `.every(` is the explicit-undefined refusal over the object's own keys, never over validity_by_order[]
    expect(contract.match(/\.every\(/g)).toHaveLength(1);
    expect(contract).toMatch(
      /noExplicitUndefined = \(value: Record<string, unknown>\): boolean =>\s*Object\.keys\(value\)\.every\(\(k\) => value\[k\] !== undefined\);/,
    );
    // the enumerations are the source's closed sets: z.enum over the exported literal tuples, never a free string
    expect(contract.match(/z\.enum\(/g)).toHaveLength(3);
    expect(contract).not.toMatch(/z\.literal\(/);
  });

  it("the contract carries no WS-007 §4.3 conditional field, clause, procedure, applicability, promulgation or calculation construct (the source names appear only in the documenting comments)", () => {
    const text = identifiers(CONTRACT);
    // the twenty-first and sunset slices implement exactly two §4.3 fields; every other one stays unrepresentable
    for (const f of SOURCE_CONDITIONAL) expect(text, f).not.toContain(f);
    expect(text.match(/predecessor_instrument_ref/g)).toHaveLength(2);
    expect(text.match(/\bsunset_condition\b/g)).toHaveLength(1);
    expect(text).not.toMatch(
      /\b(clauses?|clause_\w+|applicab\w*|applies|procedure|vote\w*|enact\w*|promulgat\w*|disseminat\w*|reach|implement\w*|complian\w*|enforce\w*|calculat\w*|derive\w*|compute\w*|resolv\w*|status_change\w*|legal\w*|current_force|force)\b/i,
    );
    // the one place the contract reads text is the exact-address parse of the two references
    expect(text.match(/new RegExp\(/g)).toHaveLength(2);
  });

  it("the engine never reads, dereferences, resolves, calculates or executes an authored Instrument value: basis, orders, validity, lifecycle and effect are never named", () => {
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\.(authority_basis_ref|governing_order_ref|validity_by_order|validity_status|operative_effect)\b/,
      );
    // the sunset slice reads `lifecycle_status` in exactly the lifecycle modules - the derivation of the one active to
    // expired transition, its admission/verification and the sunset gates - and nowhere else
    for (const f of ENGINE_SOURCES.filter(
      (f) => !/(derive|admission|integrity|declaration)\.ts$/.test(f),
    ))
      expect(identifiers(f), f).not.toMatch(/\.lifecycle_status\b/);
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\b(switch|JSON\.parse|eval|Function|split|replaceAll)\b|\.split\(|\.trim\(|\.toLowerCase\(|\.toUpperCase\(|\.includes\(|\.startsWith\(\s*[^"')]|localeCompare|RegExp\(|\.match\(|\.matchAll\(|\.test\(/,
      );
  });

  it("the engine reads an Instrument's references only through the contract's exact-address parsers and the canonical key builders, never by string slicing or label", () => {
    for (const f of ["admission.ts", "adapter.ts", "integrity.ts"]) {
      const text = code(`${GIP_DIR}/${f}`);
      expect(text, f).not.toMatch(/source_authority_ref\.(slice|substring|split|replace)/);
      expect(text, f).not.toMatch(/scope_binding_ref\.(slice|substring|split|replace)/);
    }
    expect(code(`${GIP_DIR}/admission.ts`)).toMatch(/parseInstrumentSourceAuthorityRef\(/);
    expect(code(`${GIP_DIR}/admission.ts`)).toMatch(/parseInstrumentScopeBindingRef\(/);
  });

  it("no cross-owner construct exists in the GIP modules: no foreign owner, key builder or reader is named", () => {
    const foreign =
      /actorBoundaryViolation|actorCapability|namedActor|OWNER_NAMED_ACTOR|OWNER_POPULATION|OWNER_KTI|OWNER_EPISTEMIC_ACCESS|OWNER_ECONOMY|OWNER_PRODUCTION|OWNER_LOGISTICS|OWNER_WORLD_STATE|OWNER_TEMPORAL_KERNEL|OWNER_PC_EXISTENCE|OWNER_ROLE_REGISTRY|accessEventKey|ktiTransfer|ktiDevelopmentObjectKey|populationLedgerKey|pcExistenceContractKey|PLAYER_CHARACTER_BINDING_KEY|worldFallbackEntityKey/;
    for (const f of [...ENGINE_SOURCES.filter((f) => !f.endsWith("integrity.ts")), CONTRACT])
      expect(code(f), f).not.toMatch(foreign);
    // (the one permitted foreign name is the Temporal kernel's sunset-object key, READ for existence - gip-conformance.test.ts)
  });

  it("no governing-order, authority-basis, procedure, vote, applicability, promulgation, Reach, implementation or compliance construct was added to the GIP modules", () => {
    for (const f of SOURCES) {
      // the authored field names that the earlier slices carry (`succession_rule`, `inheritance_rule`) and the one §4.3 field the
      // twenty-first slice carries (`predecessor_instrument_ref`) are carried, never acted on
      const text = identifiers(f).replace(
        /\b(succession_rule|inheritance_rule|predecessor_instrument_ref)\b/g,
        "",
      );
      expect(text, f).not.toMatch(
        /\b(governingOrder\w*|authorityBasis\w*|constitution\w*|charter\w*|applicab\w*|procedure|vote\w*|veto|override|exercis\w*|politicalRelation|pendingDecision|administrativeReach|implementationStatus|promulgat\w*|awareness|complian\w*|enforce\w*|stability|legitimacy|recognition|faction|membership|members|headcount|population|treaty|diplomacy|treasury|kti|militar\w*|territory|jurisdiction|inherit\w*|precedence|decisionBody|delegat\w*|appoint\w*|rename\w*|split\w*|merge\w*|abolish\w*|replac(e|ed|ement)|succe(ed|ssor|ssion)\w*|predecessor\w*|successor\w*|supersede\w*|projection|npk|llm|prompt)\b/i,
      );
    }
  });

  it("no migration, provider, protocol or host surface was added for the Instrument", () => {
    expect(existsSync("migrations/manifests/gip.json")).toBe(false);
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
  });
});

describe("IA-04 turnless / IA-22 dormant economy: no new stage, tick, clock, RNG or scan on the Instrument path; no Issue #11 workaround", () => {
  it("the only GIP temporal construct is the one sunset stage of an Instrument that carries a sunset_condition: no Close Basis, scheduler, tick, renewal or activation exists, and the registration guard admits exactly the derived sunset object", () => {
    const declaration = code(`${GIP_DIR}/declaration.ts`);
    expect(declaration).not.toMatch(/declares_close:\s*\{|CLOSE|StageProvider\b/);
    expect(declaration.match(/gipSunsetStage\(/g)).toHaveLength(1);
    expect(code(`${GIP_DIR}/provider.ts`).match(/export const \w+: StageProvider/g)).toHaveLength(
      1,
    );
    for (const f of SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\b(ResolutionRequest|CloseBasis|dueAt|schedule\w*|nextTick|activation\w*|renew\w*)\b/,
      );
  });

  it("the GIP modules and contract contain no timer, clock, RNG, scheduler, sweep or polling construct, and nothing is randomized or defaulted", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual|random\w*|rng|roll\w*|seed\w*|prior|dice|chooser|sample\w*|stochastic|probabilit\w*|uncertain\w*)\b/i;
    // (`input.prior` is the Temporal seam's name for the owner's own committed prior state: the Instrument a stage advances)
    for (const f of SOURCES)
      expect(identifiers(f).replace(/\binput\.prior\b/g, ""), f).not.toMatch(forbidden);
    for (const f of [
      "tests/contract/gip-instrument-schemas.test.ts",
      "tests/integration/gip-instrument.test.ts",
      "tests/integration/gip-instrument-recovery.test.ts",
    ])
      expect(identifiers(f), f).not.toMatch(
        /\b(setInterval|setTimeout|Date\.now|new Date|Math\.random|randomUUID|randomBytes|performance\.now)\b/,
      );
  });

  it("only the diagnostic integrity verifier lists facts: the establish, read and admission paths never scan institutions, offices, bindings, Instruments, orders, recipients or subjects", () => {
    for (const f of ENGINE_SOURCES.filter((f) => !f.endsWith("integrity.ts")))
      expect(code(f), f).not.toMatch(/listFacts\(|\.entries\(|\.values\(/);
    expect(code(CONTRACT)).not.toMatch(/listFacts\(|getFact|store/i);
    for (const f of ["adapter.ts", "admission.ts"])
      expect(code(`${GIP_DIR}/${f}`), f).not.toMatch(/\bfor \(|\.forEach\(|\.filter\(|\.find\(/);
  });
});

describe("acceptance-register and open-gate honesty (sixteenth slice)", () => {
  it("no row was promoted: nothing is PASS/FAIL, and the whole-engine rows stay NOT_IMPLEMENTED/BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });

  it.each(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence for the Governance Instrument core, names its tests, and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(
        /GIP Governance Instrument Core \(sixteenth slice\)/,
      );
      expect(row.partial_evidence?.tests.some((t) => /gip-instrument/.test(t))).toBe(true);
      // the predecessors' evidence is preserved, not replaced
      for (const earlier of [
        "GIP Office / Authority Locus (thirteenth slice)",
        "GIP Decision-Body Office Reference Branch (fourteenth slice)",
        "GIP Authority Scope Binding (fifteenth slice)",
      ])
        expect(row.partial_evidence?.scope).toContain(earlier);
    },
  );

  it("only those five rows name the Governance Instrument core, no other row (notably IA-04) does, and every listed test exists", () => {
    const named = register.filter((r) =>
      /Governance Instrument Core/.test(r.partial_evidence?.scope ?? ""),
    );
    expect(named.map((r) => r.id).sort()).toEqual(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"]);
    expect(register.find((r) => r.id === "IA-04")?.partial_evidence?.scope ?? "").not.toMatch(
      /Governance Instrument Core/,
    );
    for (const r of named)
      for (const t of r.partial_evidence!.tests) expect(existsSync(t), t).toBe(true);
  });

  it("the evidence names what stays unimplemented and that GitHub Issue #11 is untouched", () => {
    const scope = register.find((r) => r.id === "IA-02")!.partial_evidence!.scope;
    for (const phrase of [
      "singular scalar",
      "introduces no source-undefined minimum cardinality, uniqueness, deduplication, merging or conflict-resolution rule",
      "opaque and never dereferenced",
      "WS-007 §4.3 conditional field",
      "addressable clauses are unsupported in this slice and fail closed",
      "none is calculated or advanced",
      "decision procedure",
      "applicability result",
      "Administrative Reach",
      "Autonomous Collective choice",
      "every post-establishment Instrument mutation fails closed as unsupported",
      "GitHub Issue #11 is untouched",
    ])
      expect(scope.replace("ONE singular scalar", "singular scalar")).toContain(phrase);
  });

  it("the unrelated gates are untouched: the open-gates and runtime-contract snapshots are byte-identical to the predecessor's, and PF-6/F-028 stays NOT_ACTIVATED_BLOCKED", () => {
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    expect(statusOf("CAL-01")).toBe("UNCALIBRATED");
    expect(statusOf("CAL-03")).toBe("NO_ADOPTED_PRODUCTION_NUMBER");
    expect(statusOf("OB-015")).toBeDefined();
    expect(statusOf("OB-016")).toBe("OPEN_CODE_ERA_CONFORMANCE");
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}
