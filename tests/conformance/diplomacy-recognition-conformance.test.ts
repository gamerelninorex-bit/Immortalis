// Conformance evidence for the Diplomacy External Recognition Core Backbone Foundation (seventeenth slice): initial authored
// establishment only of one strict Diplomacy-owned External Recognition (WS-008 v1.1 §6 with the §29.2 / §29.3 overlay). Each block
// names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED (see
// `partial_evidence`): this slice covers only the aspects it names, and every other F-027 open gate is unchanged.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  DIPLOMACY_FACT_KINDS,
  DIPLOMACY_RECOGNITION_RULE,
  DiplomacyAdapter,
  GIP_INSTRUMENT_RULE,
  GIP_OFFICE_RULE,
  GIP_OFFICE_RULE_THIRTEENTH_SLICE,
  GIP_RULE,
  GIP_SCOPE_BINDING_RULE,
  WS007_SOURCE,
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
const CONTRACT = "packages/contracts/src/diplomacy-recognition.ts";
const ENGINE_SOURCES = readdirSync(DIPLOMACY_DIR).map((f) => join(DIPLOMACY_DIR, f));
const SOURCES = [...ENGINE_SOURCES, CONTRACT];
const recognition = factKind("diplomacy_external_recognition");

/** The WS-008 §6 / §29.2 / §29.3 identifiers, copied verbatim from the frozen source text (independent of the contract's own constants). */
const SOURCE_FIELDS = [
  "recognition_id",
  "recognizer_ref",
  "recognized_referent_ref",
  "recognition_scope",
  "recognition_status",
  "authority_basis_ref",
  "effective_from",
  "withdrawal_or_supersession_condition",
  "instrument_or_act_ref",
  "provenance_ref",
  "continuity_basis",
  "successor_rule_ref",
  "dependency_refs",
];

describe("IA-01 source/version fidelity (Diplomacy External Recognition registration and literal aspect)", () => {
  it("the recognition kind cites WS-008 at its exact spec-locked pin and the IM-06 lowering", () => {
    const ws008 = lock.frozen_sources.find((s) => s.id === "WS-008")!;
    expect(WS008_SOURCE).toEqual({ artifact: ws008.url, native_pin: ws008.native_pin });
    expect(recognition.rule).toEqual(DIPLOMACY_RECOGNITION_RULE);
    expect(recognition.rule.artifact).toBe(ws008.url);
    expect(recognition.rule.native_pin).toBe(ws008.native_pin);
    expect(recognition.rule.native_pin).toBe("2026-09-24T07:01:45.312Z");
    expect(recognition.rule.effective_basis).toBe("pinned-by-spec-lock");
    expect(recognition.rule.supersedes).toBeNull();
    expect(recognition.im).toBe("IM-06");
    expect(ws008.primary_im).toBe("IM-06");
  });

  it("the authority lineage carries the controlling WS-008, WS-007 / GIP Amendment, F-016 Phase 2C, F-017 and Runtime Contract pins", () => {
    const lineage = DIPLOMACY_RECOGNITION_RULE.authority_lineage.join("\n");
    for (const pin of [
      "2026-09-24T07:01:45.312Z", // WS-008 v1.1
      "2026-09-24T01:42:22.902Z", // GIP Concept Amendment v2.1
      "2026-09-24T01:42:24.952Z", // WS-007
      "2026-09-21T23:21:44.154Z", // F-016 Phase 2C
      "2026-09-25T23:42:27.802Z", // F-017
      "2026-09-29T00:33:04.009Z", // Runtime Contract & Translation Tranche v0.2
    ])
      expect(lineage, pin).toContain(pin);
    expect(WS007_SOURCE.native_pin).toBe("2026-09-24T01:42:24.952Z");
  });

  it("the rule names the clauses the state relies on: §2.1/§2.2, §6, §24, §29.2, §29.3, §29.7, §29.8 m-4 and what stays unimplemented", () => {
    for (const c of [
      "v1.1 §2.1 Diplomacy-owned persistent state (directional and scoped external recognition state)",
      "§2.2 Explicit non-ownership",
      "§6 External Recognition",
      "recognition_id, recognizer_ref, recognized_referent_ref, recognition_scope, recognition_status, authority_basis_ref, effective_from, optional withdrawal_or_supersession_condition, instrument_or_act_ref, provenance_ref",
      "recognition is directional and scoped",
      "silence or absence creates no record",
      "Existence != claim != recognition != control",
      "§24 Required Invariants 7-8",
      "§29.2 R-2 Continuity and succession (continuity_basis; successor_rule_ref where supplied)",
      "§29.3 R-3 Dependency registration and invalidation (dependency_refs[] where the persisted conclusion is derived from another owner's mutable state; no universal watcher)",
      "§29.7 R-7 / S-1 Recognition scaling (directional, scoped, sparse; no all-pairs scan)",
      "§29.8 m-4 No implied recognition by conduct",
      "post-establishment status change, withdrawal resolution, succession application, dependency-driven re-resolution and cold-history retirement not implemented",
    ])
      expect(DIPLOMACY_RECOGNITION_RULE.clause).toContain(c);
  });

  it("the new citation is pinned, and every GIP citation is byte-for-byte unchanged", () => {
    expect(sha(DIPLOMACY_RECOGNITION_RULE)).toBe(
      "baf7fc4dfc91a5062ae4169cc7f430cb63a24f8d553b2a5cde61150f7f872764",
    );
    expect(sha(GIP_INSTRUMENT_RULE)).toBe(
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
    expect(factKind("gip_governance_instrument").rule).toEqual(GIP_INSTRUMENT_RULE);
    expect(factKind("gip_scope_binding").rule).toEqual(GIP_SCOPE_BINDING_RULE);
    expect(factKind("gip_institution_identity").rule).toEqual(GIP_RULE);
  });

  it("no historical-compatibility hatch exists for the recognition kind: it has exactly one current citation", () => {
    expect(recognition.legacyRule).toBeUndefined();
    for (const k of ALL_FACT_KINDS.filter((k) => k.legacyRule))
      expect(k.id).not.toBe(recognition.id);
  });

  it("the contract names every WS-008 identifier exactly, in code, and no alias or normalized variant", () => {
    const contract = identifiers(CONTRACT);
    for (const f of SOURCE_FIELDS) expect(contract, f).toMatch(new RegExp(`\\b${f}\\b`));
    for (const alias of [
      "recognizer\\b",
      "recognized_ref\\b",
      "referent_ref\\b",
      "scope\\b",
      "status\\b",
      "authority_basis\\b",
      "effective\\b",
      "act_ref\\b",
      "instrument_ref\\b",
      "provenance\\b",
      "continuity\\b",
      "successor_rule\\b",
      "dependencies\\b",
      "dependency_ref\\b",
      "recognition_refs\\b",
    ])
      expect(contract, alias).not.toMatch(new RegExp(`\\b${alias}`));
  });

  it("recognition_status and continuity_basis are NOT closed enums: the contract never uses the listed values or the examples to accept or reject", () => {
    const contract = identifiers(CONTRACT);
    expect(contract).not.toMatch(/\bz\.(enum|literal|nativeEnum)\b|\.enum\(/);
    // the documentation-only constants are defined once and never referenced by any schema
    expect(contract.match(/LISTED_RECOGNITION_STATUSES/g)).toHaveLength(1);
    expect(contract.match(/EXAMPLE_CONTINUITY_BASES/g)).toHaveLength(1);
    const engine = ENGINE_SOURCES.map((f) => identifiers(f)).join("\n");
    expect(engine).not.toMatch(/LISTED_RECOGNITION_STATUSES|EXAMPLE_CONTINUITY_BASES/);
    // the source's six listed statuses, verbatim
    const listed = /LISTED_RECOGNITION_STATUSES = \[([\s\S]*?)\] as const/.exec(
      readFileSync(CONTRACT, "utf8"),
    )![1]!;
    expect([...listed.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])).toEqual([
      "recognized",
      "explicit_nonrecognition",
      "withdrawn",
      "suspended",
      "limited_scope",
      "contested_or_unresolved",
    ]);
  });
});

describe("IA-03 owner exclusivity: the Diplomacy owner holds the External Recognition only; a separate owner from GIP and Economy", () => {
  it("registers exactly one new owner, diplomacy, with ONE facet and one exclusive ADVANCING key space keyed by recognition_id alone", () => {
    expect(DIPLOMACY_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.im, k.lifecycle])).toEqual([
      [
        "diplomacy_external_recognition",
        "diplomacy",
        "diplomacy_external_recognition",
        "IM-06",
        "ADVANCING",
      ],
    ]);
    expect(CANONICAL_OWNER_REGISTRY.get("diplomacy")).toEqual(
      new Set(["diplomacy_external_recognition"]),
    );
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "diplomacy")).toHaveLength(1);
    // distinct from GIP and Economy, and neither of them gained a facet or kind
    expect(CANONICAL_OWNER_REGISTRY.get("gip")).toEqual(new Set(["gip_institution_identity"]));
    expect(CANONICAL_OWNER_REGISTRY.get("economy")).toEqual(new Set(["economy_state"]));
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "gip")).toHaveLength(4);
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "economy")).toHaveLength(3);
    expect(ALL_FACT_KINDS).toHaveLength(37);
    expect(
      ALL_FACT_KINDS.filter((k) => k.keyPattern.test("diplomacy/recognition/r1")).map((k) => k.id),
    ).toEqual(["diplomacy_external_recognition"]);
    for (const other of [
      "diplomacy/recognition/r1/x",
      "diplomacy/recognition",
      "diplomacy/relation/r1",
    ])
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(other))).toEqual([]);
  });

  it("there is no Relation Edge, Channel, Negotiation, Instrument, Clause, Binding Entry, Framework, claim, dispute, compliance, score or fallback Diplomacy kind", () => {
    for (const k of ALL_FACT_KINDS.filter((k) => k.owner === "diplomacy"))
      expect(k.id).toBe("diplomacy_external_recognition");
    expect(ALL_FACT_KINDS.map((k) => k.id).filter((id) => /diplomacy/.test(id))).toEqual([
      "diplomacy_external_recognition",
    ]);
  });

  it("no second Diplomacy module, ledger, sidecar or persistence path exists: the engine's Diplomacy modules are exactly the four owner-path modules", () => {
    expect(readdirSync(DIPLOMACY_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "integrity.ts",
    ]);
    for (const f of SOURCES)
      expect(code(f), f).not.toMatch(
        /node:fs|node:path|writeFile|appendFile|readFile|createWriteStream|JSON\.stringify|localStorage|indexedDB|sqlite|journal|sidecar|provider/i,
      );
    const adapter = code(`${DIPLOMACY_DIR}/adapter.ts`);
    expect(adapter.match(/\.commit\(/g)).toHaveLength(1);
    expect(adapter.match(/async establish\w+\(/g)).toHaveLength(1);
  });

  it("the Diplomacy adapter has exactly one authored writer and one keyed read: no update, withdrawal, suspension, supersession, succession, re-resolution or retirement method", () => {
    expect(
      Object.getOwnPropertyNames(DiplomacyAdapter.prototype)
        .filter((m) => m !== "constructor")
        .sort(),
    ).toEqual(["establishExternalRecognition", "externalRecognition"]);
  });

  it("no foreign-owner construct exists in the Diplomacy modules or contract: no other owner's key builder, schema, reader or constant is named", () => {
    for (const f of SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\b(gip\w*|Gip\w*|GIP\w*|world\w*|World\w*|actor\w*|Actor\w*|acs\w*|Acs\w*|Population\w*|population\w*|Cohort\w*|Economy\w*|economy\w*|Epistemic\w*|epistemic\w*|Kti\w*|KTI\w*|Production\w*|Logistics\w*|OWNER_(?!DIPLOMACY\b)\w+|FACET_(?!DIPLOMACY_EXTERNAL_RECOGNITION\b)\w+)\b/,
      );
  });

  it("no Relation Edge, Channel, Negotiation, Instrument, Clause, Binding Entry, Framework, treaty, reciprocal, trust or reputation construct was added", () => {
    for (const f of SOURCES) {
      // the only permitted `instrument` token is the source field instrument_or_act_ref
      const text = identifiers(f).replace(/instrument_or_act_ref/g, "");
      expect(text, f).not.toMatch(
        /\b(\w*[Rr]elation\w*|\w*[Cc]hannel\w*|\w*[Nn]egotiat\w*|\w*[Ii]nstrument\w*|\w*[Cc]lause\w*|\w*[Bb]inding\w*|\w*[Ff]ramework\w*|\w*[Tt]reaty\w*|\w*[Rr]eciprocal\w*|\w*[Ss]ymmetric\w*|\w*[Tt]rust\w*|\w*[Rr]eputation\w*|\w*[Ii]nfluence\w*|\w*[Ww]arscore\w*|\w*[Ss]core\w*)\b/,
      );
    }
  });

  it("admission authorizes initial establishment only, pins exactly the facts dependency_refs[] names, and the wiring into predecessor modules is the existing registry, dispatch, load verification and temporal guard", () => {
    const admission = code(`${DIPLOMACY_DIR}/admission.ts`);
    expect(admission).toMatch(/expected_version !== 0/);
    expect(admission).toMatch(/AMENDMENT_NOT_SUPPORTED/);
    expect(admission).toMatch(/requirePrerequisite/);
    const wired = [
      "packages/engine/src/owners/admission.ts",
      "packages/engine/src/world/canonical-campaign.ts",
      "packages/engine/src/temporal/admission.ts",
    ].map((f) => code(f));
    expect(wired[0]).toMatch(/OWNER_DIPLOMACY\) return diplomacyGroupCheck\(group, state\)/);
    expect(wired[1]).toMatch(/verifyDiplomacyIntegrity\(store\)/);
    expect(wired[2]).toMatch(/diplomacyObjectViolation\(o\)/);
  });
});

describe("IA-02 strict executable contract: the WS-008 fields, nothing uninterpreted is interpreted, nothing deferred is invented", () => {
  it("the contract is strict and closed to unmodelled fields: no loose, passthrough, catchall, record, any, unknown, default, transform or discriminated union", () => {
    const contract = identifiers(CONTRACT);
    expect(contract).toMatch(/z\s*\.strictObject\(/);
    expect(contract).not.toMatch(
      /\.(passthrough|loose|catchall|default|catch|transform|preprocess|pipe)\(|z\.(record|any|unknown|discriminatedUnion|lazy|map|set)\b/,
    );
  });

  it("the engine never reads, dereferences, resolves, compares or executes an authored recognition value: only recognition_id and the dependency keys are named", () => {
    for (const f of ENGINE_SOURCES.filter((f) => !f.endsWith("declaration.ts"))) {
      const text = identifiers(f);
      for (const field of [
        "recognizer_ref",
        "recognized_referent_ref",
        "recognition_scope",
        "recognition_status",
        "authority_basis_ref",
        "effective_from",
        "withdrawal_or_supersession_condition",
        "instrument_or_act_ref",
        "provenance_ref",
        "continuity_basis",
        "successor_rule_ref",
      ])
        expect(text, `${f} names ${field}`).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("dependency_refs[] is read only through the contract's dependency-key helper, never by string slicing or label", () => {
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\.dependency_refs\b|\.split\(|\.substring\(|\.match\(/,
      );
  });

  it("the recognition record is stored once: its key derives from recognition_id alone, and no reciprocal, per-recipient or per-observer key is ever built", () => {
    const contract = code(CONTRACT);
    expect(contract).toMatch(/`diplomacy\/recognition\/\$\{recognitionId\}`/);
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /diplomacyRecognitionKey\([^)]*(recognizer|referent|recipient)/i,
      );
  });

  it("no migration, provider, protocol or host surface was added for the recognition", () => {
    for (const f of SOURCES)
      expect(code(f), f).not.toMatch(/@immortalis\/protocol|migrat|host|LLM|prompt/i);
  });
});

describe("IA-04 not claimed / IA-22 dormant economy: no stage, tick, clock, RNG, watcher or scan on the recognition path; no Issue #11 workaround", () => {
  it("no Diplomacy temporal stage, Close Basis, scheduler, boundary or Temporal Object: the registration guard forbids them and nothing here declares one", () => {
    const declaration = code(`${DIPLOMACY_DIR}/declaration.ts`);
    expect(declaration).not.toMatch(/StageProvider|READ_MODE|declares_close:\s*\{|Stage\(/);
    expect(readdirSync(DIPLOMACY_DIR)).not.toContain("provider.ts");
    for (const f of SOURCES.filter((f) => !f.endsWith("declaration.ts")))
      expect(identifiers(f), f).not.toMatch(
        /\b(StageProvider|StageKey|TemporalCoordinator|ResolutionRequest|CloseBasis|dueAt|schedule\w*|boundary|nextTick|activation\w*|expir\w*|sunset\w*|renew\w*)\b/,
      );
  });

  it("the Diplomacy modules and contract contain no timer, clock, RNG, scheduler, watcher, sweep or polling construct, and nothing is randomized or defaulted", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual|watch\w*|poll\w*|random\w*|rng|roll\w*|seed\w*|prior|dice|chooser|sample\w*|stochastic|probabilit\w*|uncertain\w*)\b/i;
    for (const f of SOURCES) expect(identifiers(f), f).not.toMatch(forbidden);
    for (const f of [
      "tests/contract/diplomacy-recognition-schemas.test.ts",
      "tests/integration/diplomacy-recognition.test.ts",
      "tests/integration/diplomacy-recognition-recovery.test.ts",
    ])
      expect(identifiers(f), f).not.toMatch(
        /\b(setInterval|setTimeout|Date\.now|new Date|Math\.random|randomUUID|randomBytes|performance\.now)\b/,
      );
  });

  it("only the diagnostic integrity verifier lists facts: the establish, read and admission paths never scan recognitions, relations, parties or owners", () => {
    for (const f of ENGINE_SOURCES.filter((f) => !f.endsWith("integrity.ts")))
      expect(code(f), f).not.toMatch(/listFacts\(|\.entries\(|\.values\(|\.forEach\(/);
    expect(code(CONTRACT)).not.toMatch(/listFacts\(|getFact|store/i);
  });
});

describe("acceptance-register and open-gate honesty (seventeenth slice)", () => {
  it("no row was promoted: nothing is PASS/FAIL, and the whole-engine rows stay NOT_IMPLEMENTED/BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });

  it.each(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence for the External Recognition core, names its tests, and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(
        /Diplomacy External Recognition Core \(seventeenth slice\)/,
      );
      expect(row.partial_evidence?.tests.some((t) => /diplomacy-recognition/.test(t))).toBe(true);
      // the predecessors' evidence is preserved, not replaced
      expect(row.partial_evidence?.scope).toContain(
        "GIP Governance Instrument Core (sixteenth slice)",
      );
    },
  );

  it("only those five rows name the External Recognition core, no other row (notably IA-04) does, and every listed test exists", () => {
    const named = register.filter((r) =>
      /Diplomacy External Recognition Core/.test(r.partial_evidence?.scope ?? ""),
    );
    expect(named.map((r) => r.id).sort()).toEqual(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"]);
    expect(register.find((r) => r.id === "IA-04")?.partial_evidence?.scope ?? "").not.toMatch(
      /Diplomacy External Recognition Core/,
    );
    for (const r of named)
      for (const t of r.partial_evidence!.tests) expect(existsSync(t), t).toBe(true);
  });

  it("the evidence names what stays unimplemented and that GitHub Issue #11 is untouched", () => {
    const scope = register.find((r) => r.id === "IA-02")!.partial_evidence!.scope;
    for (const phrase of [
      "no GIP-office-only restriction on recognizer_ref",
      "no invented closed set and no alias normalisation",
      "recognition_scope stays one singular scalar",
      "opaque and never dereferenced",
      "dependency_refs[] stays conditional with no invented minimum, uniqueness or deduplication",
      "a baseline record invents no dependency",
      "effective_from is a carried scalar that schedules nothing",
      "no recognition is inferred from silence, contact, trade, negotiation, treaty-making or conduct",
      "no reciprocal record is created",
      "every post-establishment recognition mutation fails closed as unsupported",
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
