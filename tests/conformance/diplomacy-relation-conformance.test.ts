// Conformance evidence for the Diplomacy Relation Edge Authoritative Core Backbone Foundation (nineteenth slice): initial authored
// establishment only of one strict Diplomacy-owned sparse Relation Edge (WS-008 v1.1 §5.1 authoritative core, with §29.7 making
// the channel / recognition / active claim-dispute / instrument / framework arrays derived, non-authoritative indexes). Each block
// names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED (see
// `partial_evidence`): this slice covers only the aspects it names, and every other F-027 open gate is unchanged.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  DIPLOMACY_CLAIM_DISPUTE_RULE,
  DIPLOMACY_FACT_KINDS,
  DIPLOMACY_RECOGNITION_RULE,
  DIPLOMACY_RELATION_EDGE_RULE,
  DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE,
  GIP_INSTRUMENT_RULE,
  GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
  GIP_OFFICE_RULE,
  GIP_OFFICE_RULE_THIRTEENTH_SLICE,
  GIP_RULE,
  GIP_SCOPE_BINDING_RULE,
  WS008_SOURCE,
  factKind,
} from "@immortalis/engine";
import { code, gates, lock, register, sha } from "../support/f027.ts";

/** Source with comments AND string literals removed: only the identifiers and operators of the code remain. */
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/z\.infer/g, "z.type");

const DIPLOMACY_DIR = "packages/engine/src/diplomacy";
const CONTRACT = "packages/contracts/src/diplomacy-relation.ts";
const ENGINE_SOURCES = readdirSync(DIPLOMACY_DIR).map((f) => join(DIPLOMACY_DIR, f));
const relation = factKind("diplomacy_relation_edge");

/** The WS-008 §5.1 authored identifiers, copied verbatim from the frozen source text (independent of the contract's own constants). */
const SOURCE_FIELDS = [
  "relation_id",
  "party_refs",
  "relation_scope",
  "rupture_or_suspension_status",
  "provenance_ref",
  "lifecycle_status",
];
/** The WS-008 §5.1 fields §29.7 classifies as derived, non-authoritative indexes: never fields of the authoritative contract. */
const DERIVED_FIELDS = [
  "channel_refs",
  "recognition_refs",
  "active_claim_dispute_refs",
  "instrument_refs",
  "framework_refs",
];

describe("IA-01 source/version fidelity (Diplomacy Relation Edge registration and literal aspect)", () => {
  it("the relation edge kind cites WS-008 at its exact spec-locked pin and the IM-06 lowering", () => {
    const ws008 = lock.frozen_sources.find((s) => s.id === "WS-008")!;
    expect(WS008_SOURCE).toEqual({ artifact: ws008.url, native_pin: ws008.native_pin });
    expect(relation.rule).toEqual(DIPLOMACY_RELATION_EDGE_RULE);
    expect(relation.rule.artifact).toBe(ws008.url);
    expect(relation.rule.native_pin).toBe(ws008.native_pin);
    expect(relation.rule.native_pin).toBe("2026-09-24T07:01:45.312Z");
    expect(relation.rule.effective_basis).toBe("pinned-by-spec-lock");
    expect(relation.rule.supersedes).toBeNull();
    expect(relation.im).toBe("IM-06");
    expect(ws008.primary_im).toBe("IM-06");
  });

  it("the authority lineage carries the controlling WS-008, F-016 Phase 2C, F-017 and Runtime Contract pins", () => {
    const lineage = DIPLOMACY_RELATION_EDGE_RULE.authority_lineage.join("\n");
    for (const pin of [
      "2026-09-24T07:01:45.312Z", // WS-008 v1.1
      "2026-09-21T23:21:44.154Z", // F-016 Phase 2C
      "2026-09-25T23:42:27.802Z", // F-017
      "2026-09-29T00:33:04.009Z", // Runtime Contract & Translation Tranche v0.2
    ])
      expect(lineage, pin).toContain(pin);
  });

  it("the rule names the clauses the state relies on: §§2.1-2.2, §4, §5.1, §24, §§29.3/29.7 and what stays unimplemented", () => {
    for (const c of [
      "v1.1 §§2.1-2.2 Diplomacy-owned persistent state (the durable fact that an external relation materially continues)",
      // twenty-third slice: §4 is the Diplomatic Relevance / Reach Gate and §5.1 the Diplomatic Relation Edge (the original §4
      // "Relation Edge" label is preserved as DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE)
      "§4 Diplomatic Relevance / Reach Gate (no all-pairs scan; a plausible reach / relevance path is the source gate; no persistent diplomatic-capacity score is created; no Reach calculation implemented)",
      "§5.1 Diplomatic Relation Edge (a sparse future-causal continuity edge, not a duplicate ledger; minimum surface: relation_id, party_refs[], relation_scope, optional rupture_or_suspension_status, optional provenance_ref, lifecycle_status)",
      "§24 Required Invariants",
      "§§29.3/29.7 R-3 / R-7 (channel_refs[], recognition_refs[], active_claim_dispute_refs[], instrument_refs[] and framework_refs[] are derived, non-authoritative indexes rebuilt from source records and are not authored persistent fields; no all-pairs scan; no universal watcher)",
      "post-establishment rupture, suspension, restoration, retirement and lifecycle mutation, and any derived index or Recognition / Claim-Dispute association, not implemented",
    ])
      expect(DIPLOMACY_RELATION_EDGE_RULE.clause).toContain(c);
  });

  it("the new citation is distinct, and every predecessor citation is byte-for-byte unchanged", () => {
    expect(sha(DIPLOMACY_RELATION_EDGE_RULE)).not.toBe(sha(DIPLOMACY_RECOGNITION_RULE));
    expect(sha(DIPLOMACY_RELATION_EDGE_RULE)).not.toBe(sha(DIPLOMACY_CLAIM_DISPUTE_RULE));
    expect(sha(DIPLOMACY_RECOGNITION_RULE)).toBe(
      "baf7fc4dfc91a5062ae4169cc7f430cb63a24f8d553b2a5cde61150f7f872764",
    );
    expect(sha(DIPLOMACY_CLAIM_DISPUTE_RULE)).toBe(
      "021cc0b4ddc153606f1a02767fff507e54276b6818889ed244866f539f56d630",
    );
    expect(sha(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE)).toBe(
      "6230c2ab55fd0c4dfcdbd37911afdfcd766e8cd26996fb6ccc70a2c246d9e294",
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
    expect(factKind("diplomacy_external_recognition").rule).toEqual(DIPLOMACY_RECOGNITION_RULE);
    expect(factKind("diplomacy_claim_dispute").rule).toEqual(DIPLOMACY_CLAIM_DISPUTE_RULE);
    expect(factKind("gip_governance_instrument").rule).toEqual(GIP_INSTRUMENT_RULE);
    expect(factKind("gip_scope_binding").rule).toEqual(GIP_SCOPE_BINDING_RULE);
    expect(factKind("gip_institution_identity").rule).toEqual(GIP_RULE);
  });

  it("the relation edge kind has exactly one current citation and, from the twenty-third slice, exactly one load-only historical entry (its preserved nineteenth-slice citation)", () => {
    expect(relation.rule).toBe(DIPLOMACY_RELATION_EDGE_RULE);
    expect(Object.keys(relation.legacyRule ?? {}).sort()).toEqual(["admits", "rule"]);
    expect(relation.legacyRule!.rule).toBe(DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE);
    expect(relation.legacyRule!.rule).not.toEqual(relation.rule);
  });

  it("the contract names every authored WS-008 §5.1 identifier exactly, in code, and no alias or normalized variant", () => {
    const contract = identifiers(CONTRACT);
    for (const f of SOURCE_FIELDS) expect(contract, f).toMatch(new RegExp(`\\b${f}:`));
    for (const alias of [
      "edge_id\\b",
      "relation_ref\\b",
      "parties\\b",
      "party_ref\\b",
      "endpoints\\b",
      "scope\\b",
      "relation_scopes\\b",
      "rupture_status\\b",
      "suspension_status\\b",
      "status\\b",
      "provenance\\b",
      "lifecycle\\b",
      "dependency_refs\\b",
    ])
      expect(contract, alias).not.toMatch(new RegExp(`\\b${alias}`));
  });

  it("the five derived §5.1 arrays are not fields of the authoritative contract, in code: they are named only in prose", () => {
    const contract = identifiers(CONTRACT);
    for (const f of DERIVED_FIELDS) expect(contract, f).not.toMatch(new RegExp(`\\b${f}\\b`));
    // they are documented in the contract's prose as derived, non-authoritative indexes
    const prose = readFileSync(CONTRACT, "utf8");
    for (const f of DERIVED_FIELDS) expect(prose, f).toContain(`${f}[]`);
    // no engine module names, stores, indexes or rebuilds any of them
    for (const f of ENGINE_SOURCES)
      for (const d of DERIVED_FIELDS)
        expect(identifiers(f), `${f} ${d}`).not.toMatch(new RegExp(d));
    // the registry value schema is the strict authoritative contract
    expect(
      Object.keys((relation.valueSchema as unknown as { shape: object }).shape).sort(),
    ).toEqual([...SOURCE_FIELDS].sort());
  });

  it("no lifecycle, rupture or scope enum exists: all three are carried through the singular-value schema", () => {
    const contract = identifiers(CONTRACT);
    expect(contract.match(/\bz\.(enum|literal|nativeEnum)\b|\.enum\(/g)).toBeNull();
    expect(contract).toMatch(/\brelation_scope: SingularAuthoredValueSchema,/);
    expect(contract).toMatch(
      /\brupture_or_suspension_status: SingularAuthoredValueSchema\.optional\(\),/,
    );
    expect(contract).toMatch(/\blifecycle_status: SingularAuthoredValueSchema,/);
    expect(contract).not.toMatch(
      /\b(relation_scope|rupture_or_suspension_status|lifecycle_status): z\./,
    );
    const engine = ENGINE_SOURCES.map((f) => identifiers(f)).join("\n");
    expect(engine).not.toMatch(/SingularAuthoredValueSchema/);
  });
});

describe("IA-03 owner exclusivity: the existing Diplomacy owner gains one Relation Edge facet; no second owner", () => {
  it("registers one more ADVANCING kind of the one diplomacy owner, with one exclusive key space keyed by relation_id alone", () => {
    expect(
      DIPLOMACY_FACT_KINDS.filter((k) => k.id === "diplomacy_relation_edge").map((k) => [
        k.id,
        k.owner,
        k.facet,
        k.im,
        k.lifecycle,
      ]),
    ).toEqual([
      ["diplomacy_relation_edge", "diplomacy", "diplomacy_relation_edge", "IM-06", "ADVANCING"],
    ]);
    expect(CANONICAL_OWNER_REGISTRY.get("diplomacy")).toEqual(
      new Set([
        "diplomacy_external_recognition",
        "diplomacy_externalized_claim_dispute",
        "diplomacy_relation_edge",
        "diplomacy_framework",
      ]),
    );
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "diplomacy")).toHaveLength(4);
    expect(ALL_FACT_KINDS).toHaveLength(40);
    // no other owner gained a kind or facet
    expect(CANONICAL_OWNER_REGISTRY.get("gip")).toEqual(new Set(["gip_institution_identity"]));
    expect(CANONICAL_OWNER_REGISTRY.get("economy")).toEqual(new Set(["economy_state"]));
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "gip")).toHaveLength(4);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "economy")).toHaveLength(3);
    expect(
      ALL_FACT_KINDS.filter((k) => k.keyPattern.test("diplomacy/relation/r1")).map((k) => k.id),
    ).toEqual(["diplomacy_relation_edge"]);
    for (const other of [
      "diplomacy/relation/r1/x",
      "diplomacy/relation",
      "diplomacy/edge/r1",
      "diplomacy/relation-index/r1",
      "diplomacy/relation/r1/channels",
    ])
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(other))).toEqual([]);
  });

  it("the Diplomacy modules are still exactly the four owner-path modules: no second Diplomacy module, ledger, index, sidecar or persistence path exists", () => {
    expect(readdirSync(DIPLOMACY_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "integrity.ts",
    ]);
    for (const f of [...ENGINE_SOURCES, CONTRACT])
      expect(code(f), f).not.toMatch(
        /node:fs|node:path|writeFile|appendFile|readFile|createWriteStream|JSON\.stringify|localStorage|indexedDB|sqlite|journal|sidecar|provider/i,
      );
  });

  it("no foreign-owner construct exists in the relation contract: no other owner's key builder, schema, reader or constant is named", () => {
    // the one cross-contract import is the Diplomacy contract's own singular-value schema
    expect(identifiers(CONTRACT)).not.toMatch(
      /\b(gip\w*|Gip\w*|GIP\w*|world\w*|World\w*|actor\w*|Actor\w*|acs\w*|Acs\w*|Population\w*|population\w*|Cohort\w*|Economy\w*|economy\w*|Epistemic\w*|epistemic\w*|Kti\w*|KTI\w*|Production\w*|Logistics\w*|OWNER_\w+|FACET_(?!DIPLOMACY_RELATION_EDGE\b)\w+)\b/,
    );
  });

  it("no Channel, Negotiation, Instrument, Clause, Binding Entry, Framework, treaty, receipt, trust, reputation, score or Recognition / Claim-Dispute construct is named by the relation contract", () => {
    const text = identifiers(CONTRACT);
    expect(text).not.toMatch(
      /\b(\w*[Cc]hannel\w*|\w*[Nn]egotiat\w*|\w*[Ii]nstrument\w*|\w*[Cc]lause\w*|\w*[Bb]inding\w*|\w*[Ff]ramework\w*|\w*[Tt]reaty\w*|\w*[Rr]eceipt\w*|\w*[Ss]ymmetric\w*|\w*[Tt]rust\w*|\w*[Rr]eputation\w*|\w*[Ii]nfluence\w*|\w*[Ww]arscore\w*|\w*[Ss]core\w*|\w*[Rr]ecogni\w*|\w*[Dd]ispute\w*|\w*[Cc]laim\w*)\b/,
    );
    // the relation contract imports from the dispute contract only its generic singular-value schema, never a dispute construct
    expect(code(CONTRACT)).toMatch(
      /import \{ SingularAuthoredValueSchema \} from "\.\/diplomacy-dispute\.ts";/,
    );
  });

  it("the engine neither reads, names nor matches a Recognition or Claim / Dispute from the relation path: no association or derivation construct exists", () => {
    const adapter = identifiers(`${DIPLOMACY_DIR}/adapter.ts`);
    const relationFns = [
      /export function readRelationEdge[\s\S]*?\n}\n/.exec(adapter)?.[0] ?? "",
      /async establishRelationEdge[\s\S]*?\n {2}}\n/.exec(adapter)?.[0] ?? "",
    ].join("\n");
    expect(relationFns.length).toBeGreaterThan(200);
    expect(relationFns).not.toMatch(
      /Recogni|Dispute|Recognition|listFacts|\.entries\(|\.values\(|\.filter\(|\.find\(|\.some\(|\.forEach\(|\.map\(|\.reduce\(/,
    );
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\b(associate\w*|deriveIndex\w*|rebuildIndex\w*|relationIndex\w*|matchParties|partyMatch\w*|scopeMatch\w*|sameParties|samePartySet)\b/,
      );
  });

  it("admission authorizes initial establishment only for the relation edge, invents no dependency, and is wired through the existing registry, dispatch and load verification", () => {
    const admission = code(`${DIPLOMACY_DIR}/admission.ts`);
    expect(admission).toMatch(/diplomacy_relation_edge/);
    expect(admission).toMatch(/function checkRelationEdge\(/);
    // one create-only guard per kind: recognition, dispute, relation edge and (twenty-second slice) framework
    expect(admission.match(/expected_version !== 0/g)).toHaveLength(4);
    expect(admission.match(/AMENDMENT_NOT_SUPPORTED/g)).toHaveLength(4);
    const body = /function checkRelationEdge\([\s\S]*?\n}\n/.exec(admission)![0];
    expect(body).toMatch(/group\.reads\.length !== 0 \|\| group\.depends_on\.length !== 0/);
    expect(body).not.toMatch(/requirePrerequisite|checkDependencyPins/);
    expect(code(`${DIPLOMACY_DIR}/integrity.ts`)).toMatch(/diplomacy_relation_edge/);
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /case "diplomacy_relation_edge":/,
    );
  });

  it("the adapter has exactly one relation writer and one keyed read, and one commit per authored establishment", () => {
    const adapter = code(`${DIPLOMACY_DIR}/adapter.ts`);
    expect(adapter.match(/\.commit\(/g)).toHaveLength(4);
    expect(adapter.match(/async establish\w+\(/g)).toHaveLength(4);
    expect(adapter.match(/async establishRelationEdge\(/g)).toHaveLength(1);
    expect(adapter.match(/\brelationEdge\(\s*relationId: string\)/g)).toHaveLength(1);
  });
});

describe("IA-02 strict executable contract: the authored WS-008 fields, nothing uninterpreted is interpreted, nothing deferred is invented", () => {
  it("the contract is strict and closed to unmodelled fields: no loose, passthrough, catchall, any, unknown, default, transform or discriminated union", () => {
    const contract = identifiers(CONTRACT);
    expect(contract).toMatch(/z\s*\.strictObject\(/);
    expect(contract).not.toMatch(
      /\.(passthrough|loose|catchall|default|catch|transform|preprocess|pipe)\(|z\.(any|unknown|discriminatedUnion|map|set|record)\b/,
    );
  });

  it("party_refs[] is an array with no cardinality rule, singular fields are never arrays, and no text-only subtype is imposed", () => {
    const contract = identifiers(CONTRACT);
    expect(contract).toMatch(/\bparty_refs: z\.array\(Id\),/);
    expect(contract).toMatch(/\bprovenance_ref: Id\.optional\(\),/);
    expect(contract).toMatch(/\brelation_id: EntityId,/);
    expect(contract).not.toMatch(
      /\.(min|max|length|nonempty|regex|trim|startsWith|unique|sort)\(|\bz\.(date|coerce)\b|\bnew Set\(/,
    );
    // exactly one array in the contract: party_refs[]
    expect(contract.match(/\bz\.array\(/g)).toHaveLength(1);
  });

  it("the engine never reads, dereferences, resolves, compares or executes an authored relation value: only relation_id is named", () => {
    for (const f of ENGINE_SOURCES.filter((f) => !f.endsWith("declaration.ts"))) {
      const text = identifiers(f);
      for (const field of [
        "relation_scope",
        "rupture_or_suspension_status",
        "lifecycle_status",
        "party_refs",
      ])
        expect(text, `${f} names ${field}`).not.toMatch(new RegExp(`\\b${field}\\b`));
      // provenance_ref is also the recognition / dispute field name; the engine reads none of them
      expect(text, `${f} reads provenance_ref`).not.toMatch(/\bprovenance_ref\b/);
    }
  });

  it("the edge is stored once: its key derives from relation_id alone, and no per-party, per-recognition or per-dispute key is ever built", () => {
    expect(code(CONTRACT)).toMatch(/`diplomacy\/relation\/\$\{relationId\}`/);
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /diplomacyRelationKey\([^)]*(party|scope|recogni|dispute|channel|observer)/i,
      );
  });

  it("no migration, provider, protocol or host surface was added for the relation edge", () => {
    for (const f of [...ENGINE_SOURCES, CONTRACT])
      expect(code(f), f).not.toMatch(/@immortalis\/protocol|migrat|host|LLM|prompt/i);
  });
});

describe("IA-04 not claimed / IA-22 dormant economy: no stage, tick, clock, RNG, watcher or scan on the relation path; no Issue #11 workaround", () => {
  it("no Diplomacy temporal stage, Close Basis, scheduler, boundary or Temporal Object is declared by the relation path", () => {
    expect(readdirSync(DIPLOMACY_DIR)).not.toContain("provider.ts");
    for (const f of [...ENGINE_SOURCES.filter((f) => !f.endsWith("declaration.ts")), CONTRACT])
      expect(identifiers(f), f).not.toMatch(
        /\b(StageProvider|StageKey|TemporalCoordinator|ResolutionRequest|CloseBasis|dueAt|schedule\w*|boundary|nextTick|activation\w*|expir\w*|sunset\w*|renew\w*)\b/,
      );
  });

  it("the Diplomacy modules and contract contain no timer, clock, RNG, scheduler, watcher, sweep or polling construct, and nothing is randomized or defaulted", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual|watch\w*|poll\w*|random\w*|rng|roll\w*|seed\w*|prior|dice|chooser|sample\w*|stochastic|probabilit\w*|uncertain\w*)\b/i;
    for (const f of [...ENGINE_SOURCES, CONTRACT]) expect(identifiers(f), f).not.toMatch(forbidden);
    for (const f of [
      "tests/contract/diplomacy-relation-schemas.test.ts",
      "tests/integration/diplomacy-relation.test.ts",
      "tests/integration/diplomacy-relation-recovery.test.ts",
    ])
      expect(identifiers(f), f).not.toMatch(
        /\b(setInterval|setTimeout|Date\.now|new Date|Math\.random|randomUUID|randomBytes|performance\.now)\b/,
      );
  });

  it("only the diagnostic integrity verifier lists facts: the establish, read and admission paths never scan relations, recognitions, disputes, parties or owners", () => {
    for (const f of ENGINE_SOURCES.filter((f) => !f.endsWith("integrity.ts")))
      expect(code(f), f).not.toMatch(/listFacts\(|\.entries\(|\.values\(|\.forEach\(/);
    expect(code(CONTRACT)).not.toMatch(/listFacts\(|getFact|store/i);
  });
});

describe("acceptance-register and open-gate honesty (nineteenth slice)", () => {
  it("no row was promoted: nothing is PASS/FAIL, and the whole-engine rows stay NOT_IMPLEMENTED/BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });

  it.each(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence for the Relation Edge core, names its tests, and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(
        /Diplomacy Relation Edge Authoritative Core \(nineteenth slice\)/,
      );
      expect(row.partial_evidence?.tests.some((t) => /diplomacy-relation/.test(t))).toBe(true);
      // the predecessors' evidence is preserved, not replaced
      expect(row.partial_evidence?.scope).toContain(
        "Diplomacy Externalized Claim / Dispute Core (eighteenth slice)",
      );
      expect(row.partial_evidence?.scope).toContain(
        "Diplomacy External Recognition Core (seventeenth slice)",
      );
    },
  );

  it("only those five rows name the Relation Edge core, no other row (notably IA-04 and IA-07) does, and every listed test exists", () => {
    const named = register.filter((r) =>
      /Diplomacy Relation Edge Authoritative Core/.test(r.partial_evidence?.scope ?? ""),
    );
    expect(named.map((r) => r.id).sort()).toEqual(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"]);
    for (const id of ["IA-04", "IA-07"])
      expect(register.find((r) => r.id === id)?.partial_evidence?.scope ?? "").not.toMatch(
        /Diplomacy Relation Edge Authoritative Core/,
      );
    for (const r of named)
      for (const t of r.partial_evidence!.tests) expect(existsSync(t), t).toBe(true);
    // the V-01..V-14 rows are unchanged: none names the relation edge
    for (const r of register.filter((r) => /^V-/.test(r.id)))
      expect(JSON.stringify(r)).not.toMatch(/Relation Edge/);
  });

  it("the evidence names what stays unimplemented and that GitHub Issue #11 is untouched", () => {
    const scope = register.find((r) => r.id === "IA-02")!.partial_evidence!.scope;
    for (const phrase of [
      "so no derived index can be smuggled into the authored core as a second writable ledger",
      "party_refs[] keeps its array shape with no invented minimum, uniqueness, ordering or deduplication",
      "each element an opaque reference that is never dereferenced",
      "no party class is fixed",
      "relation_scope and lifecycle_status are required and singular, rupture_or_suspension_status is optional and singular (absent stays absent, no default)",
      "no invented closed set, no text-only subtype, no alias normalisation and array-valued multiplicity refused",
      "relation_id is the only identity dimension",
      "no Recognition or Claim / Dispute association, party or scope matching, relevance score or all-pairs generator is invented",
      "no dependency_refs[] is invented for the authored core",
      "every post-establishment relation edge mutation fails closed as unsupported",
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
