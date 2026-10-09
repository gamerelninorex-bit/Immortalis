// Conformance evidence for the GIP Governance Instrument Sunset Foundation (GIP sunset bounded slice): the one optional WS-007 §4.3
// `sunset_condition` (an exact CanonicalTime instant), GIP's enrollment receipt, the Temporal enrollment/recovery protocol and the one
// `active` → `expired` earned-boundary close. The existing GIP owner, facet and key spaces stay the only GIP state; the Temporal kernel
// still owns the object, boundary and index; both earlier Instrument citations stay loadable; the frozen F-027 artifacts are
// byte-identical. Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED: no row is promoted, nothing is PASS, and PF-6/F-028 is not activated.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  GIP_FACT_KINDS,
  GIP_INSTRUMENT_RULE,
  GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
  GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
  GipAdapter,
  TemporalCoordinator,
  factKind,
  gipSunsetExpiryProvider,
} from "@immortalis/engine";
import {
  CanonicalTimeSchema,
  GIP_OPERATION_EXPIRE_AT_SUNSET,
  GIP_SUNSET_ENROLLMENT_KEY,
  INSTRUMENT_LIFECYCLE_STATUSES,
  INSTRUMENT_VALIDITY_STATUSES,
  InstrumentSunsetCondition,
} from "@immortalis/contracts";
import { code, gates, lock, register, sha } from "../support/f027.ts";
import { adapterMethods } from "../support/surface-checks.ts";
import {
  EXPECTED_LEGACY_RULE_KIND_IDS,
  expectedAdapterMethods,
  expectedKindIds,
  expectedOwnerFacetSet,
} from "../support/expected-surface.ts";

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
const enrollment = factKind("gip_sunset_enrollment");
const THIS_TESTS = [
  "tests/contract/gip-sunset-schemas.test.ts",
  "tests/integration/gip-sunset.test.ts",
  "tests/integration/gip-sunset-enforcement.test.ts",
  "tests/integration/gip-sunset-recovery.test.ts",
  "tests/integration/gip-sunset-legacy.test.ts",
  "tests/integration/gip-sunset-gateway.test.ts",
  "tests/conformance/gip-sunset-conformance.test.ts",
];

describe("IA-01 source/version fidelity: a truthful successor citation, with both earlier citations preserved byte-for-byte", () => {
  it("the sixteenth- and twenty-first-slice Instrument citations are preserved (sha256 pinned) and each still says what was true of its slice", () => {
    expect(sha(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE)).toBe(
      "6230c2ab55fd0c4dfcdbd37911afdfcd766e8cd26996fb6ccc70a2c246d9e294",
    );
    expect(sha(GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE)).toBe(
      "e71c37c3ddbe51a43dd3c74c6ba33e3f31cc7e0fc89a4aee4ec4248316482af4",
    );
    expect(GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE.clause).toContain(
      "every other §4.3 conditional field not implemented) and §4.4 addressable clauses not implemented",
    );
    expect(GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE.clause).not.toContain("sunset_condition");
    expect(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE.clause).not.toContain("sunset_condition");
  });

  it("the current citation is the pinned successor: the same source, pin, basis and lineage, covering the core, the predecessor reference and ONLY the exact sunset_condition and its one lifecycle expiry", () => {
    expect(sha(GIP_INSTRUMENT_RULE)).toBe(
      "200a5489f3bc70e1f05e84a6ac4dab603284658d8cc4664642715ddd4d453564",
    );
    for (const earlier of [
      GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
      GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
    ]) {
      expect(GIP_INSTRUMENT_RULE).not.toEqual(earlier);
      for (const k of [
        "artifact",
        "native_pin",
        "authority_lineage",
        "effective_basis",
        "supersedes",
      ] as const)
        expect(GIP_INSTRUMENT_RULE[k], k).toEqual(earlier[k]);
    }
    const ws007 = lock.frozen_sources.find((s) => s.id === "WS-007")!;
    expect(GIP_INSTRUMENT_RULE.artifact).toBe(ws007.url);
    expect(GIP_INSTRUMENT_RULE.native_pin).toBe(ws007.native_pin);
    const clause = GIP_INSTRUMENT_RULE.clause;
    for (const c of [
      "§4.1 Mandatory fields",
      "§4.2 Operative-effect classes",
      "§4.3 conditional fields",
      "predecessor_instrument_ref",
      "the optional sunset_condition, an exact canonical instant compared only with canonical time",
      "a contingent, subjective, externally evidenced, disputed or uncomputable sunset condition, renewal_rule and every other §4.3 conditional field not implemented",
      "§4.4 addressable clauses not implemented",
      "§21.1 Create and §21.2 Update",
      "active to expired of an Instrument carrying sunset_condition",
      "committed by GIP's own stage at the earned Temporal boundary",
      "never validity_by_order[]",
      "Concept Amendment v2.1 A7",
      "Scaling Profile v1.1 §3 Cardinality basis (Instrument/Clause: the Instrument unit only)",
      "no scan of all institutions, offices, bindings, instruments, orders, recipients or subjects",
    ])
      expect(clause, c).toContain(c);
  });

  it("the Instrument kind records the current citation, the sixteenth through the existing legacyRule, and the twenty-first through the single laterLegacyRules entry", () => {
    expect(instrument.rule).toBe(GIP_INSTRUMENT_RULE);
    expect(instrument.legacyRule!.rule).toBe(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE);
    expect(instrument.laterLegacyRules).toHaveLength(1);
    expect(instrument.laterLegacyRules![0]!.rule).toBe(GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE);
    expect(Object.keys(instrument.laterLegacyRules![0]!).sort()).toEqual(["admits", "rule"]);
  });

  it("the compatibility is not generalized: laterLegacyRules is carried by exactly the Instrument kind, and the legacyRule inventory is unchanged", () => {
    expect(ALL_FACT_KINDS.filter((k) => k.laterLegacyRules).map((k) => k.id)).toEqual([
      "gip_governance_instrument",
    ]);
    expect(ALL_FACT_KINDS.filter((k) => k.legacyRule).map((k) => k.id)).toEqual([
      ...EXPECTED_LEGACY_RULE_KIND_IDS,
    ]);
    expect(enrollment.legacyRule).toBeUndefined();
    expect(enrollment.laterLegacyRules).toBeUndefined();
    const registry = code("packages/engine/src/owners/registry.ts");
    expect(registry.match(/laterLegacyRules\s*[?]?:/g)).toHaveLength(2); // the one field declaration and the one entry
    expect(code("packages/engine/src/world/integrity.ts")).toMatch(
      /const legacy = kind\.legacyRule;/,
    );
  });

  it("the historical-citation classes admit exactly what they governed: sunset_condition belongs to neither", () => {
    // (value-level evidence: tests/contract/gip-sunset-schemas.test.ts and tests/integration/gip-sunset-legacy.test.ts)
    expect(instrument.laterLegacyRules![0]!.admits({ not: "an instrument" })).toBe(false);
    expect(instrument.legacyRule!.admits(null)).toBe(false);
  });

  it("the source identifier is reproduced verbatim as a strict optional CanonicalTime: no calendar, duration, derived field or alias exists", () => {
    const contract = code(CONTRACT);
    expect(InstrumentSunsetCondition).toBe(CanonicalTimeSchema);
    expect(
      contract.match(/sunset_condition: InstrumentSunsetCondition\.optional\(\),/g),
    ).toHaveLength(1);
    expect(identifiers(CONTRACT).match(/\bsunset_condition\b/g)).toHaveLength(1);
    expect(contract).not.toMatch(
      /sunset_conditions|sunsetCondition|sunset_at_|sunset_time|expires_at|expiry_at|valid_until|valid_to|end_date|duration|calendar|renewal_rule|activation_condition|effective_from|\bdue\b|is_due/,
    );
    // the only enrollment value fields: the Instrument, the exact sunset and the commit's canonical time
    expect(contract).toMatch(
      /instrument_id: EntityId,\s*sunset_at: CanonicalTimeSchema,\s*basis_time: CanonicalTimeSchema,/,
    );
  });

  it("the status enumerations are exactly the source's: expired is the existing literal, no status was invented, validity is untouched", () => {
    expect([...INSTRUMENT_LIFECYCLE_STATUSES]).toEqual([
      "proposed",
      "pending",
      "active",
      "suspended",
      "superseded",
      "repealed",
      "terminated",
      "expired",
    ]);
    expect([...INSTRUMENT_VALIDITY_STATUSES]).toEqual([
      "valid",
      "invalid",
      "void",
      "contested",
      "unresolved",
    ]);
  });
});

describe("IA-03 owner/key exclusivity: one owner, one facet, one more kind in one more fixed key space; the kernel keeps the object", () => {
  it("the GIP kinds are the oracle's five, all the sole GIP owner's and facet's; the receipt is one ADVANCING kind at one fixed key", () => {
    expect(GIP_FACT_KINDS.map((k) => k.id)).toEqual(expectedKindIds({ group: "GIP_FACT_KINDS" }));
    expect(CANONICAL_OWNER_REGISTRY.get("gip")).toEqual(expectedOwnerFacetSet("gip"));
    for (const k of GIP_FACT_KINDS)
      expect([k.owner, k.facet, k.im]).toEqual(["gip", "gip_institution_identity", "IM-06"]);
    expect(enrollment.lifecycle).toBe("ADVANCING");
    expect(enrollment.keyPattern.test(GIP_SUNSET_ENROLLMENT_KEY)).toBe(true);
    for (const other of [
      "gip/sunset-enrollment/x",
      "gip/sunset-enrollment-2",
      "gip/sunset-enrollments",
    ])
      expect(enrollment.keyPattern.test(other), other).toBe(false);
    expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(GIP_SUNSET_ENROLLMENT_KEY))).toHaveLength(
      1,
    );
    // the receipt is committed in the Instrument's own group, so it carries that group's citation
    expect(enrollment.rule).toBe(GIP_INSTRUMENT_RULE);
  });

  it("no new owner, facet, GIP temporal kind or Temporal fact kind exists: the object, boundary and index stay the kernel's four temporal kinds", () => {
    expect([...CANONICAL_OWNER_REGISTRY.keys()].filter((n) => /gip/.test(n))).toEqual(["gip"]);
    expect(
      ALL_FACT_KINDS.filter((k) => k.owner === "temporal_kernel")
        .map((k) => k.id)
        .sort(),
    ).toEqual([
      "resolution_transaction",
      "temporal_boundary_index",
      "temporal_object",
      "temporal_state",
      "temporal_transaction_authority",
    ]);
  });

  it("the adapter surface is the oracle's: the sunset publication, its completion and one keyed read; no lifecycle, enactment or scan method", () => {
    expect(adapterMethods(GipAdapter)).toEqual(expectedAdapterMethods("GipAdapter"));
    expect(adapterMethods(GipAdapter).filter((m) => /sunset/i.test(m))).toEqual([
      "completeSunsetEnrollment",
      "establishSunsetInstrument",
      "sunsetEnrollment",
    ]);
    expect(
      adapterMethods(GipAdapter)
        .filter((m) => !/[sS]unset/.test(m))
        .filter((m) => /advance|expire|tick|sweep|scan|list|all|update|set[A-Z]/.test(m)),
    ).toEqual([]);
  });

  it("the Temporal coordinator's surface is unchanged: the only coordinator edit is the one refusal and its error code", () => {
    expect(adapterMethods(TemporalCoordinator)).toEqual(
      expectedAdapterMethods("TemporalCoordinator"),
    );
    const coordinator = code("packages/engine/src/temporal/coordinator.ts");
    expect(coordinator.match(/gipEnrollmentPendingViolation\(/g)).toHaveLength(1);
    expect(coordinator).toMatch(/"ENROLLMENT_PENDING"/);
  });

  it("GIP owns one operation and one provider; the stage identity is (causal process, owner operation, prospective result) and the provider writes only the Instrument slot", () => {
    expect(gipSunsetExpiryProvider.owner).toBe("gip");
    expect(gipSunsetExpiryProvider.facet).toBe("gip_institution_identity");
    expect(gipSunsetExpiryProvider.operation).toBe(GIP_OPERATION_EXPIRE_AT_SUNSET);
    expect(gipSunsetExpiryProvider.rule).toBe(GIP_INSTRUMENT_RULE);
    const provider = identifiers(`${GIP_DIR}/provider.ts`);
    // one write, to the slot it was handed
    expect(provider.match(/\bkey,\s*\n\s*value:/g)).toHaveLength(1);
    expect(provider).not.toMatch(/OWNER_TEMPORAL|\.advance\(|registerObject|\.commit\(/);
  });
});

describe("IA-02 no silent semantic invention: the lifecycle close is one derivation used identically by provider, admission and verification", () => {
  it("deriveSunsetExpiry is the single statement of the transition and is named by exactly the provider, admission and the load verifier", () => {
    const users = ENGINE_GIP.filter((f) => /deriveSunsetExpiry/.test(code(f))).map((f) =>
      f.split("/").pop(),
    );
    expect(users.sort()).toEqual(["admission.ts", "derive.ts", "integrity.ts", "provider.ts"]);
    const derive = identifiers(`${GIP_DIR}/derive.ts`);
    // it sets lifecycle_status to the literal and spreads everything else: no field is named, rewritten, merged or reinterpreted
    expect(derive).not.toMatch(
      /validity_by_order|operative_effect|source_authority_ref|scope_binding_ref|authority_basis_ref/,
    );
    expect(code(`${GIP_DIR}/derive.ts`)).toMatch(
      /\{ \.\.\.current, lifecycle_status: "expired" \}/,
    );
  });

  it("no GIP module reads a clock, a due flag, a calendar or an Instrument list: the instant is compared with canonical time only through the kernel's own comparison", () => {
    for (const f of ENGINE_GIP) {
      expect(identifiers(f), f).not.toMatch(
        /\b(Date|setTimeout|setInterval|performance|Math\.random|is_due|isDue|due)\b/,
      );
      if (!f.endsWith("integrity.ts"))
        expect(code(f), f).not.toMatch(/listFacts\(|\.entries\(|\.values\(|\bfor \(|\.forEach\(/);
    }
    // the receipt is found by its fixed key and the object by its derived key: one keyed read each
    expect(code(`${GIP_DIR}/declaration.ts`)).toMatch(/facts\.get\(GIP_SUNSET_ENROLLMENT_KEY\)/);
  });

  it("registration admission is the kernel's: the temporal registration rule delegates GIP objects to the one GIP rule, and the transaction rule to the one pending-enrollment rule", () => {
    const admission = code("packages/engine/src/temporal/admission.ts");
    expect(admission).toMatch(/gipObjectViolation\(o, state, true\)/);
    expect(admission.match(/gipEnrollmentPendingViolation\(/g)).toHaveLength(1);
    expect(code("packages/engine/src/gip/integrity.ts")).toMatch(
      /gipObjectViolation\(o\.data, \{ facts: byKey \}\)/,
    );
  });

  it("no hidden second scheduler exists: no GIP module registers a timer, tick, standing object or polling path, and only the one sunset stage is declared", () => {
    const declaration = code(`${GIP_DIR}/declaration.ts`);
    expect(declaration.match(/gipSunsetStage\(/g)).toHaveLength(1);
    expect(declaration).not.toMatch(/declares_close:\s*\{/);
    expect(declaration.match(/dependencies: \[/g)).toHaveLength(1);
    expect(declaration).toMatch(/dependencies: \[declaration\]/);
  });
});

describe("register and open-gate honesty: no row promoted, nothing PASS/FAIL, PF-6/F-028 not activated, frozen artifacts untouched", () => {
  it("no register row is PASS or FAIL, and the whole-engine rows stay NOT_IMPLEMENTED/BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
    for (const r of register) expect(["NOT_IMPLEMENTED", "BLOCKED"]).toContain(r.status);
  });

  it("the spec lock, Runtime Contract, acceptance register and open gates are byte-identical to the base (this slice edits no frozen artifact)", () => {
    expect(sha(readFileSync("spec/f027/spec-lock.json", "utf8"))).toBeTruthy();
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
  });

  it("PF-6/F-028 stays NOT_ACTIVATED_BLOCKED and no gate changed", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028" || /PF-6/.test(g.id))?.status).toBe(
      "NOT_ACTIVATED_BLOCKED",
    );
  });

  it("every named test file exists and the fixtures stay synthetic: no production module imports the testkit", () => {
    for (const t of THIS_TESTS) expect(existsSync(t), t).toBe(true);
    for (const f of ENGINE_GIP)
      expect(readFileSync(f, "utf8"), f).not.toMatch(/@immortalis\/testkit/);
  });
});
