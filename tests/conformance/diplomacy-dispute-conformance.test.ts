// Conformance evidence for the Diplomacy Externalized Claim / Dispute Core Backbone Foundation (eighteenth slice): initial authored
// establishment only of one strict Diplomacy-owned externally communicated claim / dispute record (WS-008 v1.1 §7 with the §29.3 /
// §29.4 overlay). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED (see `partial_evidence`): this slice covers only the aspects it names, and every other F-027 open gate is
// unchanged.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  DIPLOMACY_CLAIM_DISPUTE_RULE,
  DIPLOMACY_FACT_KINDS,
  DIPLOMACY_RECOGNITION_RULE,
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
import {
  expectedKindIds,
  expectedOwnerFacetSet,
  stripLawfulSiblingIdentifiers,
} from "../support/expected-surface.ts";

/** Source with comments AND string literals removed: only the identifiers and operators of the code remain. */
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/z\.infer/g, "z.type");

const DIPLOMACY_DIR = "packages/engine/src/diplomacy";
const CONTRACT = "packages/contracts/src/diplomacy-dispute.ts";
const ENGINE_SOURCES = readdirSync(DIPLOMACY_DIR).map((f) => join(DIPLOMACY_DIR, f));
const dispute = factKind("diplomacy_claim_dispute");

/** The WS-008 §7 / §29.3 / §29.4 identifiers, copied verbatim from the frozen source text (independent of the contract's own constants). */
const SOURCE_FIELDS = [
  "dispute_id",
  "party_refs",
  "underlying_subject_ref",
  "communicated_position_entries",
  "requested_remedy_or_demand",
  "interpretation_issue_ref",
  "instrument_or_clause_ref",
  "adjudication_basis_ref",
  "status",
  "provenance_ref",
  "dependency_refs",
  "effect_on",
];

describe("IA-01 source/version fidelity (Diplomacy Externalized Claim / Dispute registration and literal aspect)", () => {
  it("the dispute kind cites WS-008 at its exact spec-locked pin and the IM-06 lowering", () => {
    const ws008 = lock.frozen_sources.find((s) => s.id === "WS-008")!;
    expect(WS008_SOURCE).toEqual({ artifact: ws008.url, native_pin: ws008.native_pin });
    expect(dispute.rule).toEqual(DIPLOMACY_CLAIM_DISPUTE_RULE);
    expect(dispute.rule.artifact).toBe(ws008.url);
    expect(dispute.rule.native_pin).toBe(ws008.native_pin);
    expect(dispute.rule.native_pin).toBe("2026-09-24T07:01:45.312Z");
    expect(dispute.rule.effective_basis).toBe("pinned-by-spec-lock");
    expect(dispute.rule.supersedes).toBeNull();
    expect(dispute.im).toBe("IM-06");
    expect(ws008.primary_im).toBe("IM-06");
  });

  it("the authority lineage carries the controlling WS-008, F-016 Phase 2C, F-017 and Runtime Contract pins", () => {
    const lineage = DIPLOMACY_CLAIM_DISPUTE_RULE.authority_lineage.join("\n");
    for (const pin of [
      "2026-09-24T07:01:45.312Z", // WS-008 v1.1
      "2026-09-21T23:21:44.154Z", // F-016 Phase 2C
      "2026-09-25T23:42:27.802Z", // F-017
      "2026-09-29T00:33:04.009Z", // Runtime Contract & Translation Tranche v0.2
    ])
      expect(lineage, pin).toContain(pin);
  });

  it("the rule names the clauses the state relies on: §§2-3, §7, §§19-24, §29.3, §29.4, §29.7 and what stays unimplemented", () => {
    for (const c of [
      "v1.1 §§2-3 Diplomacy-owned persistent state (the fact that a position was externally communicated; the underlying substantive claim stays with its authoritative owner)",
      "§7 Claim / Dispute",
      "dispute_id, party_refs[], underlying_subject_ref, communicated_position_entries[], optional requested_remedy_or_demand, optional interpretation_issue_ref, optional instrument_or_clause_ref, optional adjudication_basis_ref, status, provenance_ref",
      "§§19-24 Required Invariants",
      "§29.3 R-3 Dependency registration and invalidation (dependency_refs[] where the persisted conclusion is derived from another owner's mutable state; no universal watcher)",
      "§29.4 effect_on (issuance, addressee_receipt, instrument_or_setting_specified; no default; no receipt created or inferred)",
      "§29.7 R-7 (no all-pairs scan)",
      "post-establishment status change, new or changed position, remedy change, interpretation or adjudication update, effect resolution, dependency-driven re-resolution, conversion, merger, settlement and retirement not implemented",
    ])
      expect(DIPLOMACY_CLAIM_DISPUTE_RULE.clause).toContain(c);
  });

  it("the new citation is distinct, and every predecessor citation is byte-for-byte unchanged", () => {
    expect(sha(DIPLOMACY_CLAIM_DISPUTE_RULE)).not.toBe(sha(DIPLOMACY_RECOGNITION_RULE));
    expect(sha(DIPLOMACY_RECOGNITION_RULE)).toBe(
      "baf7fc4dfc91a5062ae4169cc7f430cb63a24f8d553b2a5cde61150f7f872764",
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
    expect(factKind("gip_governance_instrument").rule).toEqual(GIP_INSTRUMENT_RULE);
    expect(factKind("gip_scope_binding").rule).toEqual(GIP_SCOPE_BINDING_RULE);
    expect(factKind("gip_institution_identity").rule).toEqual(GIP_RULE);
  });

  it("no historical-compatibility hatch exists for the dispute kind: it has exactly one current citation", () => {
    expect(dispute.legacyRule).toBeUndefined();
    for (const k of ALL_FACT_KINDS.filter((k) => k.legacyRule)) expect(k.id).not.toBe(dispute.id);
  });

  it("the contract names every WS-008 identifier exactly, in code, and no alias or normalized variant", () => {
    const contract = identifiers(CONTRACT);
    for (const f of SOURCE_FIELDS) expect(contract, f).toMatch(new RegExp(`\\b${f}:`));
    for (const alias of [
      "dispute_status\\b",
      "parties\\b",
      "party_ref\\b",
      "subject_ref\\b",
      "position_entries\\b",
      "communicated_positions\\b",
      "remedy\\b",
      "demand\\b",
      "interpretation_ref\\b",
      "instrument_ref\\b",
      "clause_ref\\b",
      "adjudication_ref\\b",
      "provenance\\b",
      "dependencies\\b",
      "dependency_ref\\b",
      "effective_on\\b",
      "effect\\b",
    ])
      expect(contract, alias).not.toMatch(new RegExp(`\\b${alias}`));
  });

  it("the three effect_on literals are exactly the source's, in code; status is never an enum", () => {
    const text = readFileSync(CONTRACT, "utf8");
    const listed = /EFFECT_ON_VALUES = \[([\s\S]*?)\] as const/.exec(text)![1]!;
    expect([...listed.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])).toEqual([
      "issuance",
      "addressee_receipt",
      "instrument_or_setting_specified",
    ]);
    const contract = identifiers(CONTRACT);
    // the one enum is effect_on's; status is carried through the singular-value schema
    expect(contract.match(/\bz\.(enum|literal|nativeEnum)\b|\.enum\(/g)).toHaveLength(1);
    expect(contract).toMatch(/\beffect_on: z\.enum\(EFFECT_ON_VALUES\)\.optional\(\),/);
    expect(contract).toMatch(/\bstatus: SingularAuthoredValueSchema,/);
    expect(contract).not.toMatch(/\bstatus: z\./);
    // no engine module reads or switches on a value of the contract
    const engine = ENGINE_SOURCES.map((f) => identifiers(f)).join("\n");
    expect(engine).not.toMatch(/EFFECT_ON_VALUES|SingularAuthoredValueSchema/);
  });
});

describe("IA-03 owner exclusivity: the existing Diplomacy owner gains one Externalized Claim / Dispute facet; no second owner", () => {
  it("registers one more ADVANCING kind of the one diplomacy owner, with one exclusive key space keyed by dispute_id alone", () => {
    expect(
      DIPLOMACY_FACT_KINDS.filter((k) => k.id === "diplomacy_claim_dispute").map((k) => [
        k.id,
        k.owner,
        k.facet,
        k.im,
        k.lifecycle,
      ]),
    ).toEqual([
      [
        "diplomacy_claim_dispute",
        "diplomacy",
        "diplomacy_externalized_claim_dispute",
        "IM-06",
        "ADVANCING",
      ],
    ]);
    // the nineteenth slice adds one more facet (the Relation Edge) under the same owner
    expect(CANONICAL_OWNER_REGISTRY.get("diplomacy")).toEqual(expectedOwnerFacetSet("diplomacy"));
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "diplomacy").map((k) => k.id)).toEqual(
      expectedKindIds({ owner: "diplomacy" }),
    );
    // (no other owner gained a kind or facet, and the global count: the central oracle, registered-surface-conformance)
    expect(
      ALL_FACT_KINDS.filter((k) => k.keyPattern.test("diplomacy/dispute/d1")).map((k) => k.id),
    ).toEqual(["diplomacy_claim_dispute"]);
    // (malformed and unregistered sibling key spaces resolve to no kind: UNREGISTERED_DIPLOMACY_KEY_PROBES, checked
    // centrally in registered-surface-conformance and refused by the owner integration suites)
  });

  it("the Diplomacy modules are still exactly the four owner-path modules: no second Diplomacy module, ledger, sidecar or persistence path exists", () => {
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

  it("no foreign-owner construct exists in the dispute contract: no other owner's key builder, schema, reader or constant is named", () => {
    expect(identifiers(CONTRACT)).not.toMatch(
      /\b(gip\w*|Gip\w*|GIP\w*|world\w*|World\w*|actor\w*|Actor\w*|acs\w*|Acs\w*|Population\w*|population\w*|Cohort\w*|Economy\w*|economy\w*|Epistemic\w*|epistemic\w*|Kti\w*|KTI\w*|Production\w*|Logistics\w*|OWNER_\w+|FACET_(?!DIPLOMACY_EXTERNALIZED_CLAIM_DISPUTE\b)\w+)\b/,
    );
  });

  it("no Channel, Negotiation, Instrument, Clause, Binding Entry, Framework, treaty, receipt, trust or reputation construct was added, and the dispute contract names no Relation Edge (the Relation Edge is the nineteenth slice's own)", () => {
    for (const f of [...ENGINE_SOURCES, CONTRACT]) {
      // the only permitted `instrument` / `clause` token is the source field instrument_or_clause_ref
      let text = identifiers(f).replace(/instrument_or_clause_ref/g, "");
      // the Diplomacy engine modules (not the dispute contract) carry the lawful registered siblings' own identifiers (the central oracle's LAWFUL_SIBLING_IDENTIFIERS)
      if (f !== CONTRACT) text = stripLawfulSiblingIdentifiers(text);
      expect(text, f).not.toMatch(
        /\b(\w*[Rr]elation\w*|\w*[Cc]hannel\w*|\w*[Nn]egotiat\w*|\w*[Ii]nstrument\w*|\w*[Cc]lause\w*|\w*[Bb]inding\w*|\w*[Ff]ramework\w*|\w*[Tt]reaty\w*|\w*[Rr]eceipt\w*|\w*[Ss]ymmetric\w*|\w*[Tt]rust\w*|\w*[Rr]eputation\w*|\w*[Ii]nfluence\w*|\w*[Ww]arscore\w*|\w*[Ss]core\w*)\b/,
      );
    }
  });

  it("admission authorizes initial establishment only for the dispute, pins exactly the facts dependency_refs[] names, and is wired through the existing registry, dispatch and load verification", () => {
    const admission = code(`${DIPLOMACY_DIR}/admission.ts`);
    expect(admission).toMatch(/diplomacy_claim_dispute/);
    // (one create-only guard and amendment refusal per authored kind: the central oracle's admission cardinality)
    expect(admission).toMatch(/expected_version !== 0/);
    expect(admission).toMatch(/AMENDMENT_NOT_SUPPORTED/);
    expect(admission).toMatch(/requirePrerequisite/);
    expect(code(`${DIPLOMACY_DIR}/integrity.ts`)).toMatch(/diplomacy_claim_dispute/);
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /case "diplomacy_claim_dispute":/,
    );
  });
});

describe("IA-02 strict executable contract: the WS-008 fields, nothing uninterpreted is interpreted, nothing deferred is invented", () => {
  it("the contract is strict and closed to unmodelled fields: no loose, passthrough, catchall, any, unknown, default, transform or discriminated union", () => {
    const contract = identifiers(CONTRACT);
    expect(contract).toMatch(/z\s*\.strictObject\(/);
    expect(contract).not.toMatch(
      /\.(passthrough|loose|catchall|default|catch|transform|preprocess|pipe)\(|z\.(any|unknown|discriminatedUnion|map|set)\b/,
    );
  });

  it("array fields are arrays with no cardinality rule, singular fields are never arrays, and no text-only subtype is imposed on status or the remedy", () => {
    const contract = identifiers(CONTRACT);
    expect(contract).toMatch(/\bparty_refs: z\.array\(Id\),/);
    expect(contract).toMatch(/\bcommunicated_position_entries: z\.array\(JsonValueSchema\),/);
    expect(contract).toMatch(/\bdependency_refs: z\.array\(Id\)\.optional\(\),/);
    expect(contract).toMatch(
      /\brequested_remedy_or_demand: SingularAuthoredValueSchema\.optional\(\),/,
    );
    expect(contract).toMatch(/\bunderlying_subject_ref: Id,/);
    // no minimum, maximum, length, uniqueness, ordering, pattern, trimming or text rule appears anywhere on the contract
    expect(contract).not.toMatch(
      /\.(min|max|length|nonempty|regex|trim|startsWith|unique|sort)\(|\bz\.(date|coerce)\b|\bnew Set\(\s*\w+\.(party_refs|communicated_position_entries)/,
    );
    // the singular-value union has no array member: multiplicity is refused
    expect(contract).not.toMatch(/\bz\.array\(\s*(?:SingularAuthoredValue|JsonScalar)/);
  });

  it("the engine never reads, dereferences, resolves, compares or executes an authored dispute value: only dispute_id and the dependency keys are named", () => {
    for (const f of ENGINE_SOURCES.filter((f) => !f.endsWith("declaration.ts"))) {
      const text = identifiers(f);
      for (const field of [
        "party_refs",
        "underlying_subject_ref",
        "communicated_position_entries",
        "requested_remedy_or_demand",
        "interpretation_issue_ref",
        "instrument_or_clause_ref",
        "adjudication_basis_ref",
        "provenance_ref",
        "effect_on",
      ])
        expect(text, `${f} names ${field}`).not.toMatch(new RegExp(`\\b${field}\\b`));
      // the status field is a bare word, so only member access on a dispute is checked
      expect(text, `${f} reads status`).not.toMatch(/\bdispute\.status\b|\.value\.status\b/);
    }
  });

  it("dependency_refs[] is read only through the contract's dependency-key helper, never by string slicing or label", () => {
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /\.dependency_refs\b|\.split\(|\.substring\(|\.match\(/,
      );
  });

  it("the dispute record is stored once: its key derives from dispute_id alone, and no per-party, per-observer or per-clause key is ever built", () => {
    expect(code(CONTRACT)).toMatch(/`diplomacy\/dispute\/\$\{disputeId\}`/);
    for (const f of ENGINE_SOURCES)
      expect(identifiers(f), f).not.toMatch(
        /diplomacyDisputeKey\([^)]*(party|subject|clause|observer)/i,
      );
  });

  it("effect_on never triggers a receipt: no receipt, access or Epistemic construct is named by the dispute path, and addressee_receipt is only a stored literal", () => {
    for (const f of [...ENGINE_SOURCES, CONTRACT])
      expect(identifiers(f), f).not.toMatch(
        /\b(\w*[Rr]eceipt\w*|\w*[Aa]ccess\w*|\w*[Ee]pistemic\w*|BROADCAST_EXPOSURE|\w*[Bb]roadcast\w*)\b/,
      );
  });

  it("no migration, provider, protocol or host surface was added for the dispute", () => {
    for (const f of [...ENGINE_SOURCES, CONTRACT])
      expect(code(f), f).not.toMatch(/@immortalis\/protocol|migrat|host|LLM|prompt/i);
  });
});

describe("IA-04 not claimed / IA-22 dormant economy: no stage, tick, clock, RNG, watcher or scan on the dispute path; no Issue #11 workaround", () => {
  it("no Diplomacy temporal stage, Close Basis, scheduler, boundary or Temporal Object is declared by the dispute path", () => {
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
      "tests/contract/diplomacy-dispute-schemas.test.ts",
      "tests/integration/diplomacy-dispute.test.ts",
      "tests/integration/diplomacy-dispute-recovery.test.ts",
    ])
      expect(identifiers(f), f).not.toMatch(
        /\b(setInterval|setTimeout|Date\.now|new Date|Math\.random|randomUUID|randomBytes|performance\.now)\b/,
      );
  });

  it("only the diagnostic integrity verifier lists facts: the establish, read and admission paths never scan disputes, recognitions, parties or owners", () => {
    for (const f of ENGINE_SOURCES.filter((f) => !f.endsWith("integrity.ts")))
      expect(code(f), f).not.toMatch(/listFacts\(|\.entries\(|\.values\(|\.forEach\(/);
    expect(code(CONTRACT)).not.toMatch(/listFacts\(|getFact|store/i);
  });
});

describe("acceptance-register and open-gate honesty (eighteenth slice)", () => {
  it("no row was promoted: nothing is PASS/FAIL, and the whole-engine rows stay NOT_IMPLEMENTED/BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });

  it.each(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence for the Externalized Claim / Dispute core, names its tests, and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(
        /Diplomacy Externalized Claim \/ Dispute Core \(eighteenth slice\)/,
      );
      expect(row.partial_evidence?.tests.some((t) => /diplomacy-dispute/.test(t))).toBe(true);
      // the predecessors' evidence is preserved, not replaced
      expect(row.partial_evidence?.scope).toContain(
        "Diplomacy External Recognition Core (seventeenth slice)",
      );
      expect(row.partial_evidence?.scope).toContain(
        "GIP Governance Instrument Core (sixteenth slice)",
      );
    },
  );

  it("only those five rows name the Externalized Claim / Dispute core, no other row (notably IA-04) does, and every listed test exists", () => {
    const named = register.filter((r) =>
      /Diplomacy Externalized Claim \/ Dispute Core/.test(r.partial_evidence?.scope ?? ""),
    );
    expect(named.map((r) => r.id).sort()).toEqual(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"]);
    expect(register.find((r) => r.id === "IA-04")?.partial_evidence?.scope ?? "").not.toMatch(
      /Diplomacy Externalized Claim \/ Dispute Core/,
    );
    for (const r of named)
      for (const t of r.partial_evidence!.tests) expect(existsSync(t), t).toBe(true);
  });

  it("the evidence names what stays unimplemented and that GitHub Issue #11 is untouched", () => {
    const scope = register.find((r) => r.id === "IA-02")!.partial_evidence!.scope;
    for (const phrase of [
      "party_refs[] and communicated_position_entries[] keep their array shape with no invented minimum, uniqueness, ordering or deduplication",
      "no invented entry schema or subfield",
      "status is required and singular and carried exactly as authored with no invented closed set, no text-only subtype and no alias normalisation",
      "requested_remedy_or_demand is optional and singular (absent stays absent; one canonical JSON scalar or object, array-valued multiplicity refused)",
      "never dereferenced and never a prerequisite object",
      "no party class is fixed",
      "a purely authored baseline invents none",
      "effect_on is conditional and exactly issuance, addressee_receipt or instrument_or_setting_specified, never defaulted, and creates, infers or backfills no Epistemic receipt event",
      "no private belief, future behavior or objective truth is inferred from a communicated position",
      "no underlying claim or other foreign-owner fact is created or mutated",
      "every post-establishment dispute mutation fails closed as unsupported",
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
