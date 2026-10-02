// Conformance evidence for the GIP Governance Instrument Predecessor Reference Foundation (twenty-first bounded slice): the existing
// GIP owner, facet, fact kind, key space, adapter, admission and integrity paths are unchanged, the one widened strict schema admits
// only the optional singular opaque `predecessor_instrument_ref`, the sixteenth-slice citation is preserved as the fact kind's
// historical compatibility, and nothing dereferences, joins on or acts on the reference. Each block names its register ID;
// governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED: this slice adds only the bounded
// partial evidence it names.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  GIP_FACT_KINDS,
  GIP_INSTRUMENT_RULE,
  GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
  GIP_OFFICE_RULE,
  GIP_OFFICE_RULE_THIRTEENTH_SLICE,
  GIP_RULE,
  GIP_SCOPE_BINDING_RULE,
  GipAdapter,
  factKind,
  CANONICAL_OWNER_REGISTRY,
} from "@immortalis/engine";
import {
  GovernanceInstrumentCoreSchema,
  GovernanceInstrumentSchema,
  gipInstrumentKey,
} from "@immortalis/contracts";
import {
  INSTRUMENT_A,
  PREDECESSOR_INSTRUMENT_REF_A,
  governanceInstrument,
  governanceInstrumentWithPredecessor,
} from "@immortalis/testkit";
import { code, lock, register, sha } from "../support/f027.ts";
import {
  EXPECTED_LEGACY_RULE_KIND_IDS,
  EXPECTED_LEGACY_RULE_SOURCE_SLOTS,
  expectedKindIds,
  expectedOwnerFacetSet,
  expectedAdapterMethods,
} from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";

/** Source with comments AND string literals removed: only the identifiers and operators of the code remain. */
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
const GIP_DIR = "packages/engine/src/gip";
const ENGINE_GIP = readdirSync(GIP_DIR).map((f) => join(GIP_DIR, f));
const CONTRACT = "packages/contracts/src/gip-instrument.ts";
const instrument = factKind("gip_governance_instrument");
const THIS_TESTS = [
  "tests/contract/gip-instrument-predecessor-schemas.test.ts",
  "tests/integration/gip-instrument-predecessor.test.ts",
  "tests/conformance/gip-instrument-predecessor-conformance.test.ts",
];

describe("IA-01 source/version fidelity: a truthful successor citation, with the sixteenth-slice citation preserved", () => {
  it("the sixteenth-slice Instrument citation is preserved byte-for-byte as the historical constant (its sha256 is pinned) and still says §4.3 is not implemented", () => {
    expect(sha(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE)).toBe(
      "6230c2ab55fd0c4dfcdbd37911afdfcd766e8cd26996fb6ccc70a2c246d9e294",
    );
    expect(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE.clause).toContain(
      "§4.3 conditional fields and §4.4 addressable clauses not implemented",
    );
    expect(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE.clause).not.toContain("predecessor_instrument_ref");
  });

  it("the current Instrument rule is the pinned successor: the same source, pin, basis and lineage, covering the core plus ONLY the optional predecessor_instrument_ref", () => {
    expect(sha(GIP_INSTRUMENT_RULE)).toBe(
      "e71c37c3ddbe51a43dd3c74c6ba33e3f31cc7e0fc89a4aee4ec4248316482af4",
    );
    expect(GIP_INSTRUMENT_RULE).not.toEqual(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE);
    for (const k of [
      "artifact",
      "native_pin",
      "authority_lineage",
      "effective_basis",
      "supersedes",
    ] as const)
      expect(GIP_INSTRUMENT_RULE[k], k).toEqual(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE[k]);
    expect(GIP_INSTRUMENT_RULE.native_pin).toBe("2026-09-24T01:42:24.952Z");
    const clause = GIP_INSTRUMENT_RULE.clause;
    // the core and the unchanged clauses are still cited
    for (const c of [
      "§4.1 Mandatory fields",
      "§4.2 Operative-effect classes",
      "§21.1 Create and §21.2 Update",
      "Concept Amendment v2.1 A7",
      "Scaling Profile v1.1 §3 Cardinality basis (Instrument/Clause: the Instrument unit only)",
    ])
      expect(clause).toContain(c);
    // the one implemented §4.3 field is named, and the old blanket "§4.3 not implemented" statement is gone
    expect(clause).toContain("only the optional singular opaque predecessor_instrument_ref");
    expect(clause).toContain("never dereferenced");
    expect(clause).not.toContain(
      "§4.3 conditional fields and §4.4 addressable clauses not implemented",
    );
    // every other §4.3 field and every §4.4 clause is explicitly unimplemented
    expect(clause).toContain(
      "every other §4.3 conditional field not implemented) and §4.4 addressable clauses not implemented",
    );
  });

  it("the Instrument kind records the successor citation and registers the sixteenth-slice one, through the existing fact-kind compatibility mechanism", () => {
    expect(instrument.rule).toBe(GIP_INSTRUMENT_RULE);
    expect(instrument.valueSchema).toBe(GovernanceInstrumentSchema);
    expect(instrument.legacyRule).toBeDefined();
    expect(instrument.legacyRule!.rule).toBe(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE);
    expect(Object.keys(instrument.legacyRule!).sort()).toEqual(["admits", "rule"]);
  });

  it("the historical citation admits exactly the old core-only value class: core-only values yes, predecessor_instrument_ref or anything else no", () => {
    const { admits } = instrument.legacyRule!;
    expect(admits(governanceInstrument())).toBe(true);
    expect(
      admits(
        governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, {
          validity_by_order: [],
        }),
      ),
    ).toBe(true);
    for (const v of [
      governanceInstrumentWithPredecessor(),
      { ...governanceInstrument(), predecessor_instrument_ref: undefined },
      { ...governanceInstrument(), predecessor_instrument_ref: null },
      { ...governanceInstrument(), predecessor_instrument_ref: PREDECESSOR_INSTRUMENT_REF_A },
      { ...governanceInstrument(), supersession_ref: "x" },
      { ...governanceInstrument(), activation_condition: "x" },
      { ...governanceInstrument(), clauses: [] },
      { ...governanceInstrument(), operative_effects: ["obligation"] },
      {},
      null,
      "instrument",
    ])
      expect(admits(v), JSON.stringify(v)).toBe(false);
    expect(GovernanceInstrumentCoreSchema.safeParse(governanceInstrument()).success).toBe(true);
  });

  it("the other kinds' citations are byte-for-byte unchanged, and the Office kind keeps its own unrelated holder-branch compatibility", () => {
    expect(sha(GIP_RULE)).toBe("55e1a30b522d15a8bfe914f0d9879fa1880e8fdecd89ea9d20babe565907220d");
    expect(sha(GIP_OFFICE_RULE)).toBe(
      "580f849a52c8467718a7f5593d253a8881122c60534ae1bd390e3578736cb4b7",
    );
    expect(sha(GIP_OFFICE_RULE_THIRTEENTH_SLICE)).toBe(
      "794f072b5a78d20f054ed809fe62693e1998bcf7eaa6e401d295d592fd9da9c8",
    );
    expect(sha(GIP_SCOPE_BINDING_RULE)).toBe(
      "a05c6a641840f7f9e55fce85cf9949fa7fca621119ca92248731db7c2ca93876",
    );
    const office = factKind("gip_office_authority_locus");
    expect(office.rule).toBe(GIP_OFFICE_RULE);
    expect(office.legacyRule!.rule).toBe(GIP_OFFICE_RULE_THIRTEENTH_SLICE);
    expect(factKind("gip_institution_identity").rule).toBe(GIP_RULE);
    expect(factKind("gip_institution_identity").legacyRule).toBeUndefined();
    expect(factKind("gip_scope_binding").rule).toBe(GIP_SCOPE_BINDING_RULE);
    expect(factKind("gip_scope_binding").legacyRule).toBeUndefined();
  });

  it("only those two GIP kinds (and, from the twenty-third slice, the Diplomacy Relation Edge kind) register a superseded citation; the compatibility is not generalized (no new framework, field or registry)", () => {
    // (the inventory is the central oracle's, EXPECTED_LEGACY_RULE_*: this suite states the claim against it, not a literal)
    expect(ALL_FACT_KINDS.filter((k) => k.legacyRule).map((k) => k.id)).toEqual([
      ...EXPECTED_LEGACY_RULE_KIND_IDS,
    ]);
    const registry = code("packages/engine/src/owners/registry.ts");
    expect(registry.match(/legacyRule\s*[?]?:/g)).toHaveLength(EXPECTED_LEGACY_RULE_SOURCE_SLOTS);
    expect(code("packages/engine/src/world/integrity.ts")).toMatch(
      /const legacy = kind\.legacyRule;/,
    );
  });

  it("the contract reproduces the one source identifier verbatim: it is named once as code, with no renamed, plural or aliased form", () => {
    const contract = code(CONTRACT);
    expect(contract.match(/\bpredecessor_instrument_ref\b/g)).toHaveLength(1);
    expect(contract).toMatch(/predecessor_instrument_ref: EntityId\.optional\(\),/);
    expect(contract).not.toMatch(
      /predecessor_instrument_(refs|ids|id)\b|predecessor_(ref|refs|id|ids)\b|predecessorInstrument|supersession_ref|successor_/,
    );
  });
});

describe("IA-02 no silent semantic invention: the field is one optional opaque reference and nothing acts on it", () => {
  it("only the contract names the field: no admission, adapter, integrity or declaration code reads, joins, resolves or defaults it", () => {
    for (const f of ENGINE_GIP) expect(code(f), f).not.toMatch(/predecessor/i);
    // no owner/registry code branches on it either: the Instrument kind is validated by the one strict schema alone (the
    // governing-rule citation string, which names the field, is the only mention outside the contract)
    expect(identifiers("packages/engine/src/owners/registry.ts")).not.toMatch(/predecessor/i);
    expect(identifiers("packages/engine/src/owners/admission.ts")).not.toMatch(/predecessor/i);
    expect(identifiers("packages/engine/src/world/integrity.ts")).not.toMatch(/predecessor/i);
  });

  it("the schema keeps the existing opaque-reference shape: EntityId, singular, optional, no default, array, catch, map or transform", () => {
    const contract = code(CONTRACT);
    expect(contract).not.toMatch(
      /predecessor_instrument_ref: (z\.array|EntityId\.array|EntityId\.default|EntityId\.nullable|EntityId\.nullish|EntityId\.catch|EntityId\.transform|z\.string|z\.any|z\.unknown|z\.record)/,
    );
    expect(Object.keys(GovernanceInstrumentSchema.shape).sort()).toEqual([
      "authority_basis_ref",
      "instrument_id",
      "lifecycle_status",
      "operative_effect",
      "predecessor_instrument_ref",
      "scope_binding_ref",
      "source_authority_ref",
      "validity_by_order",
    ]);
  });

  it("every other WS-007 §4.3 field and every §4.4 clause construct stays absent from the executable surface", () => {
    const text = identifiers(CONTRACT);
    for (const f of [
      "activation_condition",
      "effective_from",
      "sunset_condition",
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
    ])
      expect(text, f).not.toContain(f);
  });
});

describe("IA-03 owner/key exclusivity: no new owner, facet, fact kind, key space, adapter class or method", () => {
  it("the GIP kinds, owner, facet, lifecycle classification and the whole kind registry are exactly as before (the Instrument stays ADVANCING)", () => {
    // (the exact kind inventory and the whole kind registry are the central oracle's: registered-surface-conformance;
    // what stays here is each GIP kind's own owner, facet and lifecycle classification)
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
  });

  it("the Instrument key space is unchanged and the key is derived from instrument_id alone", () => {
    expect(instrument.keyPattern.test("gip/instrument/i1")).toBe(true);
    expect(instrument.keyPattern.test("gip/instrument/i1/predecessor")).toBe(false);
    expect(instrument.keyPattern.test("gip/instrument/i1/predecessor/i0")).toBe(false);
    expect(gipInstrumentKey("i1")).toBe("gip/instrument/i1");
  });

  it("the GIP adapter has no new method: no predecessor setter, reader, resolver, successor link or join", () => {
    // (the whole adapter surface is the central oracle's: registered-surface-conformance)
    expect(adapterMethods(GipAdapter)).toEqual(expectedAdapterMethods("GipAdapter"));
    expect(
      adapterMethods(GipAdapter).filter((m) =>
        /predecessor|^set|resolv|successor|join|link/i.test(m),
      ),
    ).toEqual([]);
  });

  it("the engine GIP module set is unchanged: no new file, no new temporal construct, and admission still pins exactly two prerequisites", () => {
    expect(readdirSync(GIP_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "integrity.ts",
    ]);
    const admission = code(`${GIP_DIR}/admission.ts`);
    expect(admission).toMatch(/group\.reads\.length !== 2 \|\| group\.depends_on\.length !== 2/);
    expect(admission).toMatch(/canonicalEqual\(group\.rule, GIP_INSTRUMENT_RULE\)/);
    expect(identifiers(`${GIP_DIR}/admission.ts`)).not.toMatch(/SIXTEENTH|THIRTEENTH/);
    expect(identifiers(`${GIP_DIR}/adapter.ts`)).not.toMatch(/SIXTEENTH|THIRTEENTH/);
    expect(existsSync("migrations/manifests/gip.json")).toBe(false);
  });
});

describe("register and open-gate honesty: bounded partial evidence only, nothing promoted", () => {
  it.each(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"])(
    "%s names the twenty-first-slice evidence, stays NOT_IMPLEMENTED and carries no full evidence",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toContain("twenty-first slice");
      expect(row.partial_evidence?.scope).toContain("predecessor_instrument_ref");
      expect(row.partial_evidence?.tests.some((t) => THIS_TESTS.includes(t))).toBe(true);
      for (const t of row.partial_evidence!.tests) expect(existsSync(t), t).toBe(true);
    },
  );

  it("IA-04 is not claimed, IA-07 stays BLOCKED and nothing is PASS or FAIL", () => {
    const ia04 = register.find((r) => r.id === "IA-04")!;
    expect(ia04.status).toBe("NOT_IMPLEMENTED");
    expect(ia04.partial_evidence?.tests.some((t) => THIS_TESTS.includes(t)) ?? false).toBe(false);
    expect(ia04.partial_evidence?.scope ?? "").not.toContain("predecessor_instrument_ref");
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    // no other row gained twenty-first-slice evidence
    expect(
      register
        .filter((r) => r.partial_evidence?.scope.includes("predecessor_instrument_ref"))
        .map((r) => r.id)
        .sort(),
    ).toEqual(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"]);
  });

  it("the evidence states what stays unimplemented: no dereference, dependency, supersession, lifecycle change or reciprocal link", () => {
    const scope = register.find((r) => r.id === "IA-02")!.partial_evidence!.scope;
    const own = scope.slice(scope.indexOf("(twenty-first slice)"));
    for (const phrase of [
      "never dereferenced",
      "no dependency",
      "supersession act",
      "every other WS-007 §4.3 conditional field",
      "GitHub Issue #11 is untouched",
    ])
      expect(own, phrase).toContain(phrase);
  });

  it("the Runtime Contract and open-gates snapshots are byte-identical to the predecessor's: this slice changes no gate", () => {
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
  });

  it("every named test file exists and the fixtures stay clearly synthetic", () => {
    for (const t of THIS_TESTS) expect(readFileSync(t, "utf8").length).toBeGreaterThan(0);
    const fixtures = readFileSync("packages/testkit/src/gip-fixtures.ts", "utf8");
    expect(fixtures).toMatch(/PREDECESSOR_INSTRUMENT_REF_A = "predecessor-instrument-ref-a-1"/);
    expect(fixtures).toMatch(/SYNTHETIC FIXTURES/);
  });
});
