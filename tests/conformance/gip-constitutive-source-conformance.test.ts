// Conformance evidence for the GIP Institution Identity Constitutive Source Reference Foundation (twentieth bounded slice):
// the existing GIP owner, facet, fact kind, key space, adapter, admission, integrity and governing rule are unchanged, the one
// widened strict schema admits only the optional singular opaque `constitutive_source_ref`, and nothing dereferences, joins on
// or acts on it. Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay
// NOT_IMPLEMENTED/BLOCKED: this slice adds only the bounded partial evidence it names.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GIP_FACT_KINDS,
  GIP_RULE,
  GipAdapter,
  factKind,
  CANONICAL_OWNER_REGISTRY,
} from "@immortalis/engine";
import { InstitutionIdentitySchema, gipInstitutionIdentityKey } from "@immortalis/contracts";
import { code, lock, register } from "../support/f027.ts";
import {
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
const CONTRACT = "packages/contracts/src/gip.ts";
const THIS_TESTS = [
  "tests/contract/gip-constitutive-source-schemas.test.ts",
  "tests/integration/gip-constitutive-source.test.ts",
  "tests/conformance/gip-constitutive-source-conformance.test.ts",
];

describe("IA-01 source/version fidelity: the existing GIP_RULE is unchanged and already covers the field", () => {
  it("GIP_RULE is byte-for-byte the predecessor's citation (its sha256 is pinned) and still cites WS-007 §3.1 including the optional constitutive_source_ref", () => {
    expect(createHash("sha256").update(JSON.stringify(GIP_RULE)).digest("hex")).toBe(
      "55e1a30b522d15a8bfe914f0d9879fa1880e8fdecd89ea9d20babe565907220d",
    );
    expect(GIP_RULE.clause).toContain("§3.1 Institution Identity Reference");
    expect(GIP_RULE.clause).toContain("optional constitutive_source_ref");
  });

  it("the Institution Identity kind still records exactly GIP_RULE: no successor citation and no historical governing-rule compatibility entry exists for it", () => {
    const kind = GIP_FACT_KINDS.find((k) => k.id === "gip_institution_identity")!;
    expect(kind.rule).toBe(GIP_RULE);
    expect(kind.legacyRule).toBeUndefined();
    expect(kind.valueSchema).toBe(InstitutionIdentitySchema);
  });

  it("the contract reproduces the one source identifier verbatim: it is named once, with no renamed, plural or aliased form", () => {
    const contract = code(CONTRACT);
    expect(contract.match(/\bconstitutive_source_ref\b/g)).toHaveLength(1);
    expect(contract).toMatch(/constitutive_source_ref: EntityId\.optional\(\),/);
    expect(contract).not.toMatch(
      /constitutive_source_(refs|ids|id)\b|constitutive_(ref|refs|sources?)\b|constitutiveSource|predecessor_ids|successor_ids/,
    );
  });
});

describe("IA-02 no silent semantic invention: the field is one optional opaque reference and nothing acts on it", () => {
  it("only the contract names the field: no admission, adapter, integrity or declaration code reads, joins, resolves or defaults it", () => {
    for (const f of ENGINE_GIP) expect(code(f), f).not.toMatch(/constitutive/i);
    // no owner/registry code branches on it either: the identity kind is validated by the one strict schema alone
    // (the GIP_RULE citation string, which already names the field, is the only mention outside the contract)
    expect(identifiers("packages/engine/src/owners/registry.ts")).not.toMatch(/constitutive/i);
    expect(identifiers("packages/engine/src/owners/admission.ts")).not.toMatch(/constitutive/i);
  });

  it("the schema keeps the existing strict opaque-reference shape: strict object, singular, no default, array, catch or transform", () => {
    const contract = code(CONTRACT);
    expect(contract).toMatch(/InstitutionIdentitySchema = z\s*\.strictObject\(/);
    expect(contract).not.toMatch(
      /constitutive_source_ref: (z\.array|EntityId\.array|EntityId\.default|EntityId\.nullable|EntityId\.nullish|EntityId\.catch|EntityId\.transform|z\.string|z\.any|z\.unknown)/,
    );
    expect(Object.keys(InstitutionIdentitySchema.shape).sort()).toEqual([
      "constitutive_source_ref",
      "continuity_status",
      "identity_label",
      "institution_id",
    ]);
  });
});

describe("IA-03 owner/key exclusivity: no new owner, facet, fact kind, key space, adapter class or method", () => {
  it("the GIP kinds, owner, facet and the whole kind registry are exactly as before", () => {
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

  it("the identity key space is unchanged and the key is derived from institution_id alone", () => {
    const kind = GIP_FACT_KINDS.find((k) => k.id === "gip_institution_identity")!;
    expect(kind.keyPattern.test("gip/institution/i1/identity")).toBe(true);
    expect(kind.keyPattern.test("gip/institution/i1/identity/constitutive-source")).toBe(false);
    expect(gipInstitutionIdentityKey("i1")).toBe("gip/institution/i1/identity");
  });

  it("the GIP adapter has no new method: no constitutive-source setter, reader, resolver or join", () => {
    // (the whole adapter surface is the central oracle's: registered-surface-conformance)
    expect(adapterMethods(GipAdapter)).toEqual(expectedAdapterMethods("GipAdapter"));
    expect(
      adapterMethods(GipAdapter).filter((m) => /constitutive|source|^set|resolv|join/i.test(m)),
    ).toEqual([]);
  });

  it("the engine GIP module set is unchanged: no new file, and no new temporal construct", () => {
    expect(readdirSync(GIP_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "integrity.ts",
    ]);
  });
});

describe("register and open-gate honesty: bounded partial evidence only, nothing promoted", () => {
  it.each(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"])(
    "%s names the twentieth-slice evidence, stays NOT_IMPLEMENTED and carries no full evidence",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toContain("twentieth slice");
      expect(row.partial_evidence?.scope).toContain("constitutive_source_ref");
      expect(row.partial_evidence?.tests.some((t) => THIS_TESTS.includes(t))).toBe(true);
    },
  );

  it("IA-04 is not claimed, IA-07 stays BLOCKED and nothing is PASS or FAIL", () => {
    const ia04 = register.find((r) => r.id === "IA-04")!;
    expect(ia04.status).toBe("NOT_IMPLEMENTED");
    expect(ia04.partial_evidence?.tests.some((t) => THIS_TESTS.includes(t)) ?? false).toBe(false);
    expect(ia04.partial_evidence?.scope ?? "").not.toContain("constitutive_source_ref");
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    // no other row gained twentieth-slice evidence
    expect(
      register
        .filter((r) => r.partial_evidence?.scope.includes("constitutive_source_ref"))
        .map((r) => r.id)
        .sort(),
    ).toEqual(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"]);
  });

  it("the stale twelfth-slice claim is corrected for the constitutive source only: predecessor/successor and every lifecycle transition stay denied", () => {
    const scope = register.find((r) => r.id === "IA-02")!.partial_evidence!.scope;
    expect(scope).not.toContain("predecessor/successor/constitutive-source reference");
    expect(scope).toContain(
      "generic property bag, predecessor/successor reference and every lifecycle transition",
    );
    expect(scope).toContain("renamed, split, merged, abolished, replaced");
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
    expect(fixtures).toMatch(/CONSTITUTIVE_SOURCE_A = "constitutive-source-a-1"/);
    expect(fixtures).toMatch(/SYNTHETIC FIXTURES/);
  });
});
