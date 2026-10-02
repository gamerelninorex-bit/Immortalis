// Conformance evidence for the GIP Authority Scope Binding Backbone Foundation (fifteenth slice): initial establishment only of
// one strict GIP-owned Scope Binding beneath one exact already-committed Office / Authority Locus. Each block names its register
// ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`):
// this slice covers only the aspects it names, and every other F-027 open gate is unchanged.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  GIP_FACT_KINDS,
  GIP_OFFICE_RULE,
  GIP_OFFICE_RULE_THIRTEENTH_SLICE,
  GIP_RULE,
  GIP_SCOPE_BINDING_RULE,
  GipAdapter,
  WS007_SOURCE,
  factKind,
} from "@immortalis/engine";

interface Lock {
  frozen_sources: { id: string; url: string; native_pin: string; primary_im: string }[];
  snapshot_files: Record<string, string>;
}
const lock = JSON.parse(readFileSync("spec/f027/spec-lock.json", "utf8")) as Lock;
type Row = {
  id: string;
  status: string;
  evidence: unknown;
  partial_evidence?: { scope: string; tests: string[] };
};
const register = (
  parse(readFileSync("spec/f027/acceptance-register.yaml", "utf8")) as { rows: Row[] }
).rows;
const gates = (
  parse(readFileSync("spec/f027/open-gates.yaml", "utf8")) as {
    gates: { id: string; status: string }[];
  }
).gates;

/** Source with comments removed, so that prose explaining a prohibition is not mistaken for code. */
const code = (file: string): string =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
/** Source with comments AND string literals removed: only the identifiers and operators of the code remain. */
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/z\.infer/g, "z.type");
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

const GIP_DIR = "packages/engine/src/gip";
const CONTRACT = "packages/contracts/src/gip-scope-binding.ts";
const ENGINE_SOURCES = readdirSync(GIP_DIR).map((f) => join(GIP_DIR, f));
const SOURCES = [...ENGINE_SOURCES, "packages/contracts/src/gip.ts", CONTRACT];
const binding = factKind("gip_scope_binding");

describe("IA-01 source/version fidelity (GIP Authority Scope Binding registration aspect)", () => {
  it("the binding kind cites WS-007 at its exact spec-locked pin and the IM-06 lowering, with the same lineage as the other GIP kinds", () => {
    const ws007 = lock.frozen_sources.find((s) => s.id === "WS-007")!;
    expect(WS007_SOURCE).toEqual({ artifact: ws007.url, native_pin: ws007.native_pin });
    expect(binding.rule).toEqual(GIP_SCOPE_BINDING_RULE);
    expect(binding.rule.artifact).toBe(ws007.url);
    expect(binding.rule.native_pin).toBe(ws007.native_pin);
    expect(binding.rule.native_pin).toBe("2026-09-24T01:42:24.952Z");
    expect(binding.rule.effective_basis).toBe("pinned-by-spec-lock");
    expect(binding.rule.supersedes).toBeNull();
    expect(binding.im).toBe("IM-06");
    expect(binding.rule.authority_lineage).toEqual(GIP_RULE.authority_lineage);
    expect(binding.rule.authority_lineage).toEqual(GIP_OFFICE_RULE.authority_lineage);
  });

  it("the rule names the clauses the state relies on: §2.1/§2.2, §5 and its minimum, §21 and the Scaling Profile Scope Binding cardinality", () => {
    for (const c of [
      "Draft v2.1 §2.1 GIP-owned persistent state (Scope / Applicability Bindings)",
      "§2.2 Explicit non-ownership",
      "§5 Scope / Applicability Binding",
      "scope_binding_id, scope_type, scope_ref, target_condition",
      "where, to whom, or under what condition an authority/rule legally applies",
      "applicability query, territorial inheritance, exception and conflict resolution and promulgation not implemented",
      "§21.1 Create and §21.2 Update",
      "Scaling Profile v1.1 §3 Cardinality basis (Scope Binding: Instrument/authority × bounded applicability scope",
      "explicit exceptions replace per-place/per-person duplication",
      "no scan of all institutions, offices or bindings",
    ])
      expect(GIP_SCOPE_BINDING_RULE.clause).toContain(c);
  });

  it("the new citation is pinned, and the identity and office citations (and the office's historical compatibility) are byte-for-byte unchanged", () => {
    expect(sha(GIP_SCOPE_BINDING_RULE)).toBe(
      "a05c6a641840f7f9e55fce85cf9949fa7fca621119ca92248731db7c2ca93876",
    );
    // PR #17's office citations: unchanged, so no existing save is reinterpreted or migrated
    expect(sha(GIP_OFFICE_RULE_THIRTEENTH_SLICE)).toBe(
      "794f072b5a78d20f054ed809fe62693e1998bcf7eaa6e401d295d592fd9da9c8",
    );
    expect(sha(GIP_OFFICE_RULE)).toBe(
      "580f849a52c8467718a7f5593d253a8881122c60534ae1bd390e3578736cb4b7",
    );
    const office = factKind("gip_office_authority_locus");
    expect(office.rule).toEqual(GIP_OFFICE_RULE);
    expect(office.legacyRule!.rule).toEqual(GIP_OFFICE_RULE_THIRTEENTH_SLICE);
    expect(factKind("gip_institution_identity").rule).toEqual(GIP_RULE);
  });

  it("the historical-compatibility hatch is exactly as the predecessor left it: the office kind and (twenty-first slice) the Instrument kind have one, and a binding has none", () => {
    expect(ALL_FACT_KINDS.filter((k) => k.legacyRule).map((k) => k.id)).toEqual([
      "gip_office_authority_locus",
      "gip_governance_instrument", // twenty-first slice: the Instrument's superseded sixteenth-slice citation
    ]);
    expect(binding.legacyRule).toBeUndefined();
    const admission = code(`${GIP_DIR}/admission.ts`);
    expect(admission).toMatch(/canonicalEqual\(group\.rule, GIP_SCOPE_BINDING_RULE\)/);
    expect(identifiers(`${GIP_DIR}/admission.ts`)).not.toMatch(/THIRTEENTH/);
  });
});

describe("IA-03 owner exclusivity: one more kind of the one GIP owner, ADVANCING, exclusive key space, no second ledger", () => {
  it("the binding kind is under the existing GIP owner and facet, ADVANCING, in one exclusive key space beneath its office", () => {
    expect([binding.owner, binding.facet, binding.lifecycle]).toEqual([
      "gip",
      "gip_institution_identity",
      "ADVANCING",
    ]);
    expect(CANONICAL_OWNER_REGISTRY.get("gip")).toEqual(new Set(["gip_institution_identity"]));
    expect(
      ALL_FACT_KINDS.filter((k) =>
        k.keyPattern.test("gip/institution/i1/office/o1/scope-binding/s1"),
      ).map((k) => k.id),
    ).toEqual(["gip_scope_binding"]);
    // no overlap with the identity or office key spaces, in either direction
    for (const key of [
      "gip/institution/i1/identity",
      "gip/institution/i1/office/o1",
      "gip/institution/i1/scope-binding/s1",
      "gip/institution/i1/office/o1/scope-binding",
      "gip/institution/i1/office/o1/scope-binding/s1/x",
      "gip/institution/i1/office/o1/scope-binding/s/1",
    ])
      expect(binding.keyPattern.test(key), key).toBe(false);
    expect(
      factKind("gip_office_authority_locus").keyPattern.test(
        "gip/institution/i1/office/o1/scope-binding/s1",
      ),
    ).toBe(false);
    expect(
      factKind("gip_institution_identity").keyPattern.test(
        "gip/institution/i1/office/o1/scope-binding/s1",
      ),
    ).toBe(false);
    // the key is institution × office × binding: the scope reference is not an identity dimension
    expect(
      binding.keyPattern.exec("gip/institution/i1/office/o1/scope-binding/s1")!.slice(1),
    ).toEqual(["i1", "o1", "s1"]);
  });

  it("the registry holds exactly the four GIP kinds (the sixteenth slice adds only the Governance Instrument core) and no clause, validity, procedure, relation, path, status, membership, faction or fallback kind", () => {
    expect(GIP_FACT_KINDS.map((k) => k.id)).toEqual([
      "gip_institution_identity",
      "gip_office_authority_locus",
      "gip_scope_binding",
      "gip_governance_instrument",
    ]);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "gip")).toHaveLength(4);
    expect(ALL_FACT_KINDS).toHaveLength(39);
    expect(GIP_FACT_KINDS.every((k) => k.im === "IM-06" && k.owner === "gip")).toBe(true);
    expect(
      [...CANONICAL_OWNER_REGISTRY.keys()].filter((n) =>
        /gip|government|institution|politic|polity|state_|authority|scope|binding|instrument/.test(
          n,
        ),
      ),
    ).toEqual(["gip"]);
  });

  it("no second GIP module, ledger, sidecar or persistence path exists: the engine's GIP modules are the four predecessor modules", () => {
    expect(readdirSync(GIP_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "integrity.ts",
    ]);
    for (const f of SOURCES)
      expect(code(f), f).not.toMatch(
        /node:fs|node:path|writeFile|appendFile|readFile|createWriteStream|JSON\.stringify|localStorage|indexedDB|sqlite|journal|sidecar|provider/i,
      );
    const adapter = code(`${GIP_DIR}/adapter.ts`);
    expect(adapter.match(/\.commit\(/g)).toHaveLength(1);
    expect(adapter.match(/async establish\w+\(/g)).toHaveLength(4);
  });

  it("the GIP adapter has exactly four authored writers (the sixteenth slice adds the Instrument establishment) and four keyed reads: no scope update, replacement, resolution or applicability method", () => {
    expect(
      Object.getOwnPropertyNames(GipAdapter.prototype)
        .filter((m) => m !== "constructor")
        .sort(),
    ).toEqual([
      "establishGovernanceInstrument",
      "establishInstitution",
      "establishOffice",
      "establishScopeBinding",
      "governanceInstrument",
      "institutionIdentity",
      "officeAuthorityLocus",
      "scopeBinding",
    ]);
  });

  it("admission authorizes initial establishment only, pins exactly the one parent office, and the wiring into predecessor modules is the existing registry, dispatch and load verification", () => {
    const admission = code(`${GIP_DIR}/admission.ts`);
    expect(admission).toMatch(/AMENDMENT_NOT_SUPPORTED/);
    expect(admission).toMatch(
      /gipOfficeAuthorityLocusKey\(binding\.institution_id, binding\.office_id\)/,
    );
    expect(admission).toMatch(/requirePrerequisite\(group, state, officeKey/);
    expect(admission).toMatch(/group\.reads\.length !== 1 \|\| group\.depends_on\.length !== 1/);
    const touching = walk("packages/engine/src")
      .filter((f) => !f.startsWith(GIP_DIR))
      .filter((f) => /gip_scope_binding|ScopeBinding|gipScopeBinding/.test(code(f)))
      .sort();
    expect(touching).toEqual([
      "packages/engine/src/owners/admission.ts",
      "packages/engine/src/owners/registry.ts",
    ]);
    const verifier = code(`${GIP_DIR}/integrity.ts`);
    expect(verifier.match(/listFacts\(/g)).toHaveLength(1);
    expect(verifier).toMatch(/verifyScopeBinding\(store, f, bad\)/);
  });
});

describe("IA-02 strict executable contract: the §5 minimum, nothing uninterpreted is interpreted", () => {
  it("the schema is one strict object, optional only on the three source-optional fields, with no default, catch, loose, record, any, unknown, enum or discriminator", () => {
    const contract = code(CONTRACT);
    expect(contract).toMatch(/ScopeBindingSchema = z\s*\.strictObject\(/);
    expect(contract).not.toMatch(
      /z\.object\(|passthrough|looseObject|z\.record|z\.any|z\.unknown|\.default\(|\.catch\(|z\.enum\(|z\.literal\(|discriminatedUnion|\.transform\(|\.superRefine\(|z\.union\(/,
    );
    // the only optional constructs are the three source-optional fields
    expect(contract.match(/\.optional\(\)/g)).toHaveLength(3);
    for (const field of ["inheritance_rule", "exception_refs", "priority_or_conflict_rule_ref"])
      expect(contract).toMatch(new RegExp(`${field}: [^\\n]*\\.optional\\(\\)`));
    // the one refinement forbids an explicit undefined and judges nothing about content
    expect(contract.match(/\.refine\(/g)).toHaveLength(1);
    expect(contract).toMatch(/\.refine\(noExplicitUndefined,/);
  });

  it("the contract names no deferred surface: no instrument, validity, lifecycle, applicability, promulgation, holder, body or office-authority field", () => {
    // the source-required opaque field name `priority_or_conflict_rule_ref` is permitted (and only as that one optional field);
    // every other priority / ranking / resolution notion is still forbidden
    const text = identifiers(CONTRACT);
    expect(text.match(/\bpriority_or_conflict_rule_ref\b/g)).toHaveLength(1);
    expect(text).toMatch(/priority_or_conflict_rule_ref: EntityId\.optional\(\)/);
    expect(text.replace(/\bpriority_or_conflict_rule_ref\b/g, "")).not.toMatch(
      /\b(instrument\w*|validity\w*|lifecycle\w*|applicab\w*|applies|promulgat\w*|holder_ref|decision_body_ref|competence_scope|powers|duties|authority_source_ref|members|membership|population\w*|cohort\w*|status|priority\w*|precedence|weight|score|rank\w*|compar\w*|sort\w*|resolv\w*|settle\w*|conflict\w*)\b/i,
    );
  });

  it("no priority calculation, ranking, comparison, resolution or execution mechanism exists: the field name is not even mentioned outside the contract, and nothing computes over it", () => {
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /priority\w*|precedence|rank\w*|compar\w*|\bsort\w*|settle\w*|conflictRule|ruleRef/i,
      );
    // the one refinement of the contract inspects only whether a value is undefined
    expect(code(CONTRACT)).toMatch(/Object\.values\(value\)\.every\(\(v\) => v !== undefined\)/);
  });

  it("the engine never reads, resolves, parses or executes an authored binding value: the scope reference, exception references, priority-or-conflict rule reference, condition, inheritance rule, classification and the office's competence_scope are never named", () => {
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\.(scope_ref|scope_type|target_condition|inheritance_rule|exception_refs|priority_or_conflict_rule_ref|exceptions|conflict_refs|competence_scope|holder_ref|decision_body_ref|authority_source_ref|powers|duties)\b/,
      );
    for (const f of [...ENGINE_SOURCES, CONTRACT])
      expect(identifiers(f), f).not.toMatch(
        /\b(switch|JSON\.parse|eval|Function|split|replaceAll)\b|\.split\(|\.trim\(|\.toLowerCase\(|\.toUpperCase\(|\.includes\(|\.startsWith\(\s*[^"')]|localeCompare|RegExp\(|\.match\(|\.matchAll\(|\.test\(/,
      );
  });

  it("no cross-owner construct exists in the GIP modules: no foreign owner, key builder or reader is named", () => {
    const foreign =
      /actorBoundaryViolation|actorCapability|namedActor|OWNER_NAMED_ACTOR|OWNER_POPULATION|OWNER_KTI|OWNER_EPISTEMIC_ACCESS|OWNER_ECONOMY|OWNER_PRODUCTION|OWNER_LOGISTICS|OWNER_WORLD_STATE|OWNER_TEMPORAL_KERNEL|OWNER_PC_EXISTENCE|OWNER_ROLE_REGISTRY|accessEventKey|ktiTransfer|ktiDevelopmentObjectKey|populationLedgerKey|pcExistenceContractKey|PLAYER_CHARACTER_BINDING_KEY|worldFallbackEntityKey|temporalObjectKey/;
    for (const f of [...ENGINE_SOURCES.filter((f) => !f.endsWith("integrity.ts")), CONTRACT])
      expect(code(f), f).not.toMatch(foreign);
  });

  it("no instrument, validity, applicability, procedure, vote, exercise, reach, awareness, compliance, transition or foreign-owner construct was added to the GIP modules", () => {
    for (const f of SOURCES) {
      // the authored field names `succession_rule` (the office's) and `inheritance_rule` (the binding's) are carried, never acted on
      // (the sixteenth slice's Governance Instrument core identifiers are the one permitted instrument construct)
      const text = identifiers(f)
        .replace(/\b(succession|inheritance)_rule\b/g, "")
        .replace(/\bconstitutive_source_ref\b/g, "")
        .replace(/\b\w*[Ii]nstrument\w*\b/g, "");
      expect(text, f).not.toMatch(
        /\b(applicab\w*|procedure|vote\w*|veto|override|exercis\w*|politicalRelation|pendingDecision|administrativeReach|implementationStatus|promulgat\w*|awareness|complian\w*|enforce\w*|stability|legitimacy|recognition|faction|membership|members|headcount|population|treaty|diplomacy|treasury|kti|militar\w*|territory|jurisdiction|inherit\w*|precedence|decisionBody|delegat\w*|appoint\w*|rename\w*|split\w*|merge\w*|abolish\w*|replac(e|ed|ement)|succe(ed|ssor|ssion)\w*|predecessor\w*|successor\w*|constitutive\w*|supersede\w*|projection|npk|llm|prompt)\b/i,
      );
    }
  });

  it("no migration, provider, protocol or host surface was added for the binding", () => {
    expect(existsSync("migrations/manifests/gip.json")).toBe(false);
    expect(readFileSync("packages/protocol/src/index.ts", "utf8")).not.toMatch(/export (?!\{\})/);
  });
});

describe("IA-04 turnless / IA-22 dormant economy: no new stage, tick, clock, RNG or scan on the binding path; no Issue #11 workaround", () => {
  it("no new GIP temporal stage, Close Basis, scheduler, boundary or Temporal Object: the temporal registration guard is untouched and forbids them", () => {
    const declaration = code(`${GIP_DIR}/declaration.ts`);
    expect(declaration).not.toMatch(/StageProvider|READ_MODE|declares_close:\s*\{|Stage\(/);
    expect(readdirSync(GIP_DIR)).not.toContain("provider.ts");
    for (const f of SOURCES.filter((f) => !f.endsWith("declaration.ts")))
      expect(identifiers(f), f).not.toMatch(
        /\b(StageProvider|StageKey|TemporalCoordinator|ResolutionRequest|CloseBasis|dueAt|schedule\w*|boundary|nextTick)\b/,
      );
  });

  it("the GIP modules and contract contain no timer, clock, RNG, scheduler, sweep or polling construct, and nothing is randomized or defaulted", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual|random\w*|rng|roll\w*|seed\w*|prior|dice|chooser|sample\w*|stochastic|probabilit\w*|uncertain\w*)\b/i;
    for (const f of SOURCES) expect(identifiers(f), f).not.toMatch(forbidden);
    // the tests may name a "seeded" fixture campaign, so only the actual clock / randomness constructs are checked there
    for (const f of [
      "tests/contract/gip-scope-binding-schemas.test.ts",
      "tests/integration/gip-scope-binding.test.ts",
      "tests/integration/gip-scope-binding-recovery.test.ts",
    ])
      expect(identifiers(f), f).not.toMatch(
        /\b(setInterval|setTimeout|Date\.now|new Date|Math\.random|randomUUID|randomBytes|performance\.now)\b/,
      );
  });

  it("only the diagnostic integrity verifier lists facts: the establish, read and admission paths never scan institutions, offices, bindings or targets", () => {
    for (const f of ENGINE_SOURCES.filter((f) => !f.endsWith("integrity.ts")))
      expect(code(f), f).not.toMatch(/listFacts\(|\.entries\(|\.values\(/);
    expect(code(CONTRACT)).not.toMatch(/listFacts\(|getFact|store/i);
    for (const f of ["adapter.ts", "admission.ts"])
      expect(code(`${GIP_DIR}/${f}`), f).not.toMatch(/\bfor \(|\.forEach\(|\.filter\(|\.find\(/);
  });
});

describe("acceptance-register and open-gate honesty (fifteenth slice)", () => {
  it("no row was promoted: nothing is PASS/FAIL, and the whole-engine rows stay NOT_IMPLEMENTED/BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });

  it.each(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence for the Authority Scope Binding, names its tests, and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(
        /GIP Authority Scope Binding \(fifteenth slice\)/,
      );
      expect(row.partial_evidence?.tests.some((t) => /gip-scope-binding/.test(t))).toBe(true);
      // the predecessors' evidence is preserved, not replaced
      expect(row.partial_evidence?.scope).toMatch(
        /GIP Office \/ Authority Locus \(thirteenth slice\)/,
      );
      expect(row.partial_evidence?.scope).toMatch(
        /GIP Decision-Body Office Reference Branch \(fourteenth slice\)/,
      );
    },
  );

  it("only those five rows name the Authority Scope Binding, and every listed test exists", () => {
    const named = register.filter((r) =>
      /Authority Scope Binding/.test(r.partial_evidence?.scope ?? ""),
    );
    expect(named.map((r) => r.id).sort()).toEqual(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"]);
    for (const r of named)
      for (const t of r.partial_evidence!.tests) expect(existsSync(t), t).toBe(true);
  });

  it("the evidence names what stays unimplemented and that GitHub Issue #11 is untouched", () => {
    const scope = register.find((r) => r.id === "IA-02")!.partial_evidence!.scope;
    for (const phrase of [
      "opaque and never resolved",
      "never parsed or executed",
      "Governance Instrument",
      "applicability result",
      "Administrative Reach",
      "Autonomous Collective choice",
      "institutional KTI consequence",
      "every post-establishment scope, inheritance, exception or priority-or-conflict change, replacement or resolution fails closed",
      "GitHub Issue #11 is untouched",
    ])
      expect(scope).toContain(phrase);
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
