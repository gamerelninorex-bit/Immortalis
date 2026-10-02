// Conformance evidence for the Diplomacy Framework Authoritative Core Backbone Foundation (twenty-second slice): initial authored
// establishment only of one strict Diplomacy-owned shared Framework (WS-008 v1.1 §16 minimum surface; §29.5 is a hard ownership
// boundary, not functionality). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows
// stay NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and every other F-027 open
// gate is unchanged.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  DIPLOMACY_CLAIM_DISPUTE_RULE,
  DIPLOMACY_FACT_KINDS,
  DIPLOMACY_FRAMEWORK_RULE,
  DIPLOMACY_RECOGNITION_RULE,
  DIPLOMACY_RELATION_EDGE_RULE,
  DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE,
  WS008_SOURCE,
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

const DIPLOMACY_DIR = "packages/engine/src/diplomacy";
const CONTRACT = "packages/contracts/src/diplomacy-framework.ts";
const ENGINE_SOURCES = readdirSync(DIPLOMACY_DIR).map((f) => join(DIPLOMACY_DIR, f));
const framework = factKind("diplomacy_framework");

/** The WS-008 §16 authored identifiers, copied verbatim from the frozen source text (independent of the contract's own constants). */
const SOURCE_FIELDS = [
  "framework_id",
  "framework_basis",
  "member_refs",
  "charter_or_instrument_refs",
  "membership_rules",
  "entry_exit_rules",
  "collective_decision_rule_ref",
  "shared_commitment_refs",
  "lifecycle_status",
  "provenance_ref",
];

describe("IA-01 source/version fidelity (Diplomacy Framework registration and literal aspect)", () => {
  it("the framework kind cites WS-008 at its exact spec-locked pin and the IM-06 lowering", () => {
    const ws008 = lock.frozen_sources.find((s) => s.id === "WS-008")!;
    expect(WS008_SOURCE).toEqual({ artifact: ws008.url, native_pin: ws008.native_pin });
    expect(framework.rule).toEqual(DIPLOMACY_FRAMEWORK_RULE);
    expect(framework.rule.artifact).toBe(ws008.url);
    expect(framework.rule.native_pin).toBe(ws008.native_pin);
    expect(framework.rule.native_pin).toBe("2026-09-24T07:01:45.312Z");
    expect(framework.rule.effective_basis).toBe("pinned-by-spec-lock");
    expect(framework.rule.supersedes).toBeNull();
    expect(framework.im).toBe("IM-06");
    expect(ws008.primary_im).toBe("IM-06");
  });

  it("the authority lineage carries the controlling WS-008, F-016 Phase 2C, F-017 and Runtime Contract pins", () => {
    const lineage = DIPLOMACY_FRAMEWORK_RULE.authority_lineage.join("\n");
    for (const pin of [
      "2026-09-24T07:01:45.312Z", // WS-008 v1.1
      "2026-09-21T23:21:44.154Z", // F-016 Phase 2C
      "2026-09-25T23:42:27.802Z", // F-017
      "2026-09-29T00:33:04.009Z", // Runtime Contract & Translation Tranche v0.2
    ])
      expect(lineage, pin).toContain(pin);
  });

  it("the rule names the clauses the state relies on: §§2.1-2.2, §4, §16, §§19-24, §29.3, §29.5, §29.7 and what stays unimplemented", () => {
    for (const c of [
      "v1.1 §§2.1-2.2 Diplomacy-owned persistent state (diplomatic Framework membership and external charter / instrument references)",
      "§4 Diplomatic Relevance / Reach Gate (no all-pairs scan)",
      "§16 Diplomatic Frameworks",
      "minimum fields: framework_id, framework_basis, member_refs[], charter_or_instrument_refs[], membership_rules, entry_exit_rules, collective_decision_rule_ref where external framework action requires one, shared_commitment_refs[], lifecycle_status, provenance_ref",
      "§§19-24 Runtime Master Sequence through Required Invariants",
      "§29.3 R-3 Dependency registration and invalidation",
      "§29.5 R-5 Framework collective decision owner",
      "§29.7 R-7 / S-1 Interface & Scaling Declaration",
      "post-establishment amendment, membership admission, exit, suspension, expulsion, succession or dissolution, framework decision execution, member-fault propagation, derived Relation Edge framework_refs[] index and any Recognition / Claim-Dispute / Instrument association not implemented",
    ])
      expect(DIPLOMACY_FRAMEWORK_RULE.clause).toContain(c);
  });

  it("the new citation is distinct, and every predecessor Diplomacy citation is byte-for-byte unchanged", () => {
    for (const other of [
      DIPLOMACY_RECOGNITION_RULE,
      DIPLOMACY_CLAIM_DISPUTE_RULE,
      DIPLOMACY_RELATION_EDGE_RULE,
    ])
      expect(sha(DIPLOMACY_FRAMEWORK_RULE)).not.toBe(sha(other));
    expect(sha(DIPLOMACY_RECOGNITION_RULE)).toBe(
      "baf7fc4dfc91a5062ae4169cc7f430cb63a24f8d553b2a5cde61150f7f872764",
    );
    expect(sha(DIPLOMACY_CLAIM_DISPUTE_RULE)).toBe(
      "021cc0b4ddc153606f1a02767fff507e54276b6818889ed244866f539f56d630",
    );
    // twenty-third slice: the Relation Edge citation's §4 attribution was corrected; the nineteenth-slice value is preserved
    // byte-for-byte as the historical constant (its original hash), and the corrected current value is pinned
    expect(sha(DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE)).toBe(
      "5f4503e087b9601134f6988c1865e76d00723610933f0ae8b9a4837b29fbcce7",
    );
    expect(sha(DIPLOMACY_RELATION_EDGE_RULE)).toBe(
      "2773a95cccc8671238fa29406bdaa7ee23ca8fcc2f46763a37f299919783162a",
    );
    expect(factKind("diplomacy_external_recognition").rule).toEqual(DIPLOMACY_RECOGNITION_RULE);
    expect(factKind("diplomacy_claim_dispute").rule).toEqual(DIPLOMACY_CLAIM_DISPUTE_RULE);
    expect(factKind("diplomacy_relation_edge").rule).toEqual(DIPLOMACY_RELATION_EDGE_RULE);
  });

  it("no historical-compatibility hatch exists for the framework kind: it has exactly one current citation", () => {
    expect(framework.legacyRule).toBeUndefined();
    for (const k of ALL_FACT_KINDS.filter((k) => k.legacyRule)) expect(k.id).not.toBe(framework.id);
  });

  it("the contract names every authored WS-008 §16 identifier exactly, in code, and no alias or normalized variant", () => {
    const contract = identifiers(CONTRACT);
    for (const f of SOURCE_FIELDS) expect(contract, f).toMatch(new RegExp(`\\b${f}:`));
    for (const alias of [
      "id\\b",
      "basis\\b",
      "members\\b",
      "member_ref\\b",
      "charter_refs\\b",
      "instrument_refs\\b",
      "membership_rule\\b",
      "entry_rules\\b",
      "exit_rules\\b",
      "decision_rule_ref\\b",
      "commitment_refs\\b",
      "status\\b",
      "lifecycle\\b",
      "provenance\\b",
      "dependency_refs\\b",
    ])
      expect(contract, alias).not.toMatch(new RegExp(`\\b${alias}`));
    // the registry value schema is the strict authoritative contract
    expect(
      Object.keys((framework.valueSchema as unknown as { shape: object }).shape).sort(),
    ).toEqual([...SOURCE_FIELDS].sort());
  });

  it("no lifecycle, basis or rules enum exists: the four singular fields are carried through the singular-value schema", () => {
    const contract = identifiers(CONTRACT);
    expect(contract.match(/\bz\.(enum|literal|nativeEnum)\b|\.enum\(/g)).toBeNull();
    for (const f of ["framework_basis", "membership_rules", "entry_exit_rules", "lifecycle_status"])
      expect(contract).toMatch(new RegExp(`\\b${f}: SingularAuthoredValueSchema,`));
    expect(contract).not.toMatch(
      /\b(framework_basis|membership_rules|entry_exit_rules|lifecycle_status): z\./,
    );
    const engine = ENGINE_SOURCES.map((f) => identifiers(f)).join("\n");
    expect(engine).not.toMatch(/SingularAuthoredValueSchema/);
  });
});

describe("IA-03 owner exclusivity: the existing Diplomacy owner gains one Framework facet; no second owner", () => {
  it("registers one more ADVANCING kind of the one diplomacy owner, with one exclusive key space keyed by framework_id alone", () => {
    expect(
      DIPLOMACY_FACT_KINDS.filter((k) => k.id === "diplomacy_framework").map((k) => [
        k.id,
        k.owner,
        k.facet,
        k.im,
        k.lifecycle,
      ]),
    ).toEqual([["diplomacy_framework", "diplomacy", "diplomacy_framework", "IM-06", "ADVANCING"]]);
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
      ALL_FACT_KINDS.filter((k) => k.keyPattern.test("diplomacy/framework/f1")).map((k) => k.id),
    ).toEqual(["diplomacy_framework"]);
    for (const other of [
      "diplomacy/framework/f1/x",
      "diplomacy/framework",
      "diplomacy/frameworks/f1",
      "diplomacy/framework-index/f1",
      "diplomacy/framework/f1/members",
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

  it("no foreign-owner construct exists in the framework contract: no other owner's key builder, schema, reader or constant is named", () => {
    // the one cross-contract import is the Diplomacy contract's own singular-value schema
    expect(identifiers(CONTRACT)).not.toMatch(
      /\b(gip\w*|Gip\w*|GIP\w*|world\w*|World\w*|actor\w*|Actor\w*|acs\w*|Acs\w*|Population\w*|population\w*|Cohort\w*|Economy\w*|economy\w*|Epistemic\w*|epistemic\w*|Kti\w*|KTI\w*|Production\w*|Logistics\w*|OWNER_\w+|FACET_(?!DIPLOMACY_FRAMEWORK\b)\w+)\b/,
    );
  });

  it("no Channel, Negotiation, Instrument, Clause, Binding Entry, treaty, receipt, trust, reputation, score, vote or sibling-record construct is named by the framework contract in code", () => {
    const text = identifiers(CONTRACT);
    // `charter_or_instrument_refs` is the source's own field identifier; it is the only permitted `instrument` token
    expect(text.replace(/charter_or_instrument_refs/g, "")).not.toMatch(
      /\b(\w*[Cc]hannel\w*|\w*[Nn]egotiat\w*|\w*[Ii]nstrument\w*|\w*[Cc]lause\w*|\w*[Bb]inding\w*|\w*[Tt]reaty\w*|\w*[Rr]eceipt\w*|\w*[Ss]ymmetric\w*|\w*[Tt]rust\w*|\w*[Rr]eputation\w*|\w*[Ii]nfluence\w*|\w*[Ww]arscore\w*|\w*[Ss]core\w*|\w*[Rr]ecogni\w*|\w*[Dd]ispute\w*|\w*[Cc]laim\w*|\w*[Rr]elation\w*|\w*[Vv]ot(e|ing)\w*|\w*[Tt]ally\w*|\w*[Qq]uorum\w*)\b/,
    );
    // the framework contract imports from the dispute contract only its generic singular-value schema, never a dispute construct
    expect(code(CONTRACT)).toMatch(
      /import \{ SingularAuthoredValueSchema \} from "\.\/diplomacy-dispute\.ts";/,
    );
  });

  it("the engine neither reads, names, matches nor computes anything from a Framework's references: no association, decision or derivation construct exists", () => {
    const adapter = identifiers(`${DIPLOMACY_DIR}/adapter.ts`);
    const frameworkFns = [
      /export function readDiplomaticFramework[\s\S]*?\n}\n/.exec(adapter)?.[0] ?? "",
      /async establishDiplomaticFramework[\s\S]*?\n {2}}\n/.exec(adapter)?.[0] ?? "",
    ].join("\n");
    expect(frameworkFns.length).toBeGreaterThan(200);
    expect(frameworkFns).not.toMatch(
      /Recogni|Dispute|Relation|listFacts|\.entries\(|\.values\(|\.filter\(|\.find\(|\.some\(|\.forEach\(|\.map\(|\.reduce\(/,
    );
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\b(associate\w*|deriveIndex\w*|rebuildIndex\w*|frameworkIndex\w*|memberMatch\w*|matchMembers|sameMembers|tally\w*|quorum\w*|ballot\w*|castVote|applyCharterRule|executeDecision|propagateFault|admitMember|expelMember|suspendMember)\b/,
      );
  });

  it("admission authorizes initial establishment only for the framework, invents no dependency, and is wired through the existing registry, dispatch and load verification", () => {
    const admission = code(`${DIPLOMACY_DIR}/admission.ts`);
    expect(admission).toMatch(/diplomacy_framework/);
    expect(admission).toMatch(/function checkFramework\(/);
    // one create-only guard per kind: recognition, dispute, relation edge and framework
    expect(admission.match(/expected_version !== 0/g)).toHaveLength(4);
    expect(admission.match(/AMENDMENT_NOT_SUPPORTED/g)).toHaveLength(4);
    const body = /function checkFramework\([\s\S]*?\n}\n/.exec(admission)![0];
    expect(body).toMatch(/group\.reads\.length !== 0 \|\| group\.depends_on\.length !== 0/);
    expect(body).not.toMatch(/requirePrerequisite|checkDependencyPins/);
    expect(code(`${DIPLOMACY_DIR}/integrity.ts`)).toMatch(/diplomacy_framework/);
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(/case "diplomacy_framework":/);
  });

  it("the adapter has exactly one framework writer and one keyed read, and one commit per authored establishment", () => {
    const adapter = code(`${DIPLOMACY_DIR}/adapter.ts`);
    expect(adapter.match(/\.commit\(/g)).toHaveLength(4);
    expect(adapter.match(/async establish\w+\(/g)).toHaveLength(4);
    expect(adapter.match(/async establishDiplomaticFramework\(/g)).toHaveLength(1);
    expect(adapter.match(/\bdiplomaticFramework\(\s*frameworkId: string\)/g)).toHaveLength(1);
  });

  it("the Relation Edge persistent write contract is untouched: it still has no framework_refs[] field, and the Relation Edge contract names no Framework write", () => {
    const edge = factKind("diplomacy_relation_edge");
    expect(Object.keys((edge.valueSchema as unknown as { shape: object }).shape).sort()).toEqual(
      [
        "relation_id",
        "party_refs",
        "relation_scope",
        "rupture_or_suspension_status",
        "provenance_ref",
        "lifecycle_status",
      ].sort(),
    );
    expect(identifiers("packages/contracts/src/diplomacy-relation.ts")).not.toMatch(
      /framework_refs|diplomacyFrameworkKey|DiplomaticFramework/,
    );
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

  it("the three arrays have no cardinality rule, the conditional reference is optional, and singular fields are never arrays", () => {
    const contract = identifiers(CONTRACT);
    for (const f of ["member_refs", "charter_or_instrument_refs", "shared_commitment_refs"])
      expect(contract).toMatch(new RegExp(`\\b${f}: z\\.array\\(Id\\),`));
    expect(contract).toMatch(/\bcollective_decision_rule_ref: Id\.optional\(\),/);
    expect(contract).toMatch(/\bprovenance_ref: Id,/);
    expect(contract).toMatch(/\bframework_id: EntityId,/);
    expect(contract).not.toMatch(
      /\.(min|max|length|nonempty|regex|trim|startsWith|unique|sort)\(|\bz\.(date|coerce)\b|\bnew Set\(/,
    );
    // exactly three arrays in the contract
    expect(contract.match(/\bz\.array\(/g)).toHaveLength(3);
    // exactly one optional field in the contract: the conditional collective decision rule reference
    expect(contract.match(/\.optional\(\)/g)).toHaveLength(1);
  });

  it("the engine never reads, dereferences, resolves, compares or executes an authored framework value: only framework_id is named", () => {
    for (const f of ENGINE_SOURCES.filter((f) => !f.endsWith("declaration.ts"))) {
      const text = identifiers(f);
      for (const field of [
        "framework_basis",
        "member_refs",
        "charter_or_instrument_refs",
        "membership_rules",
        "entry_exit_rules",
        "collective_decision_rule_ref",
        "shared_commitment_refs",
      ])
        expect(text, `${f} names ${field}`).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("the Framework is stored once: its key derives from framework_id alone, and no per-member, per-relation or per-instrument key is ever built", () => {
    expect(code(CONTRACT)).toMatch(/`diplomacy\/framework\/\$\{frameworkId\}`/);
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /diplomacyFrameworkKey\([^)]*(member|relation|recogni|dispute|channel|instrument|observer)/i,
      );
  });

  it("no migration, provider, protocol or host surface was added for the Framework", () => {
    for (const f of [...ENGINE_SOURCES, CONTRACT])
      expect(code(f), f).not.toMatch(/@immortalis\/protocol|migrat|host|LLM|prompt/i);
  });
});

describe("IA-04 not claimed / IA-22 dormant economy: no stage, tick, clock, RNG, watcher or scan on the framework path; no Issue #11 workaround", () => {
  it("no Diplomacy temporal stage, Close Basis, scheduler, boundary or Temporal Object is declared by the framework path", () => {
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
      "tests/contract/diplomacy-framework-schemas.test.ts",
      "tests/integration/diplomacy-framework.test.ts",
      "tests/integration/diplomacy-framework-recovery.test.ts",
    ])
      expect(identifiers(f), f).not.toMatch(
        /\b(setInterval|setTimeout|Date\.now|new Date|Math\.random|randomUUID|randomBytes|performance\.now)\b/,
      );
  });

  it("only the diagnostic integrity verifier lists facts: the establish, read and admission paths never scan frameworks, members, relations, recognitions, disputes or owners", () => {
    for (const f of ENGINE_SOURCES.filter((f) => !f.endsWith("integrity.ts")))
      expect(code(f), f).not.toMatch(/listFacts\(|\.entries\(|\.values\(|\.forEach\(/);
    expect(code(CONTRACT)).not.toMatch(/listFacts\(|getFact|store/i);
  });
});

describe("acceptance-register and open-gate honesty (twenty-second slice)", () => {
  it("no row was promoted: nothing is PASS/FAIL, and the whole-engine rows stay NOT_IMPLEMENTED/BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });

  it.each(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence for the Framework core, names its tests, and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(
        /Diplomacy Framework Authoritative Core \(twenty-second slice\)/,
      );
      expect(row.partial_evidence?.tests.some((t) => /diplomacy-framework/.test(t))).toBe(true);
      // the predecessors' evidence is preserved, not replaced
      for (const predecessor of [
        "Diplomacy Relation Edge Authoritative Core (nineteenth slice)",
        "Diplomacy Externalized Claim / Dispute Core (eighteenth slice)",
        "Diplomacy External Recognition Core (seventeenth slice)",
      ])
        expect(row.partial_evidence?.scope).toContain(predecessor);
    },
  );

  it("only those five rows name the Framework core, no other row (notably IA-04 and IA-07) does, and every listed test exists", () => {
    const named = register.filter((r) =>
      /Diplomacy Framework Authoritative Core/.test(r.partial_evidence?.scope ?? ""),
    );
    expect(named.map((r) => r.id).sort()).toEqual(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"]);
    for (const id of ["IA-04", "IA-07"])
      expect(register.find((r) => r.id === id)?.partial_evidence?.scope ?? "").not.toMatch(
        /Diplomacy Framework Authoritative Core/,
      );
    for (const r of named)
      for (const t of r.partial_evidence!.tests) expect(existsSync(t), t).toBe(true);
    // the V-01..V-14 rows are unchanged: none names the Framework
    for (const r of register.filter((r) => /^V-/.test(r.id)))
      expect(JSON.stringify(r)).not.toMatch(/Diplomacy Framework|Diplomatic Framework/);
  });

  it("the evidence names what stays unimplemented and that GitHub Issue #11 is untouched", () => {
    const scope = register.find((r) => r.id === "IA-02")!.partial_evidence!.scope;
    for (const phrase of [
      "member_refs[], charter_or_instrument_refs[] and shared_commitment_refs[] keep their array shape with no invented minimum, uniqueness, ordering, deduplication or reciprocal-copy rule",
      "each element an opaque reference that is never dereferenced",
      "framework_basis, membership_rules, entry_exit_rules and lifecycle_status are required and singular",
      "no invented closed set, no text-only subtype, no alias normalisation and array-valued multiplicity refused",
      "collective_decision_rule_ref is conditional and singular (absent stays absent, never defaulted or fabricated, and only stored",
      "provenance_ref is a required singular opaque reference",
      "framework_id is the only identity dimension",
      "no dependency_refs[] is invented for the authored core",
      "no Relation Edge framework_refs[] index",
      "every post-establishment framework mutation fails closed as unsupported",
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
    const ia07 = gates.find((g) => g.id === "IA-07");
    if (ia07) expect(ia07.status).toBe("BLOCKED");
  });
});
