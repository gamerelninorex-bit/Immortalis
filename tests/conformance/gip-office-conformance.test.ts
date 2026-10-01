// Conformance evidence for the GIP Office / Authority Locus Backbone Foundation (thirteenth slice). Each block names its
// register ID; governing lock: spec/f027/spec-lock.json (F-027 v1.0). The rows stay NOT_IMPLEMENTED/BLOCKED (see
// `partial_evidence`): this slice covers only the aspects it names, and every other F-027 open gate is unchanged.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  ALL_FACT_KINDS,
  GIP_FACT_KINDS,
  GIP_OFFICE_RULE,
  GIP_RULE,
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
const GIP_DIR = "packages/engine/src/gip";
const GIP_SOURCES = [
  ...readdirSync(GIP_DIR).map((f) => join(GIP_DIR, f)),
  "packages/contracts/src/gip.ts",
];

describe("IA-01 source/version fidelity (GIP Office / Authority Locus registration aspect)", () => {
  const office = factKind("gip_office_authority_locus");

  it("the office kind cites WS-007 at its exact spec-locked pin and the IM-06 lowering, with the same lineage as the identity kind", () => {
    const ws007 = lock.frozen_sources.find((s) => s.id === "WS-007")!;
    expect(WS007_SOURCE).toEqual({ artifact: ws007.url, native_pin: ws007.native_pin });
    expect(office.rule).toEqual(GIP_OFFICE_RULE);
    expect(office.rule.artifact).toBe(ws007.url);
    expect(office.rule.native_pin).toBe(ws007.native_pin);
    expect(office.rule.native_pin).toBe("2026-09-24T01:42:24.952Z");
    expect(office.rule.effective_basis).toBe("pinned-by-spec-lock");
    expect(office.rule.supersedes).toBeNull();
    expect(office.im).toBe("IM-06");
    expect(office.rule.authority_lineage).toEqual(GIP_RULE.authority_lineage);
  });

  it("the rule names the clauses the state relies on: §3.2 minimum, authority at the office not the holder, §2.1/§2.2, §21 and the Scaling Profile cardinality", () => {
    for (const c of [
      "Draft v2.1 §2.1",
      "office powers, duties, succession, appointment, removal",
      "§2.2 Explicit non-ownership",
      "§3.2 Office / Authority Locus",
      "office_id, institution_id, authority_source_ref, competence_scope, powers[], duties[] where material, selection_rule, succession_rule, removal_rule, holder_ref",
      "authority belongs to the office/order, not personally to the current holder",
      "delegations, concurrence, review/veto/override, conditional authority and decision_body_ref not implemented",
      "§21.1 Create and §21.2 Update",
      "Scaling Profile v1.1 §3 Cardinality basis (Office/Institution × authority relation",
      "never copied onto holders, actors or subjects",
      "no scan of all institutions or offices",
    ])
      expect(GIP_OFFICE_RULE.clause).toContain(c);
  });
});

describe("IA-03 owner exclusivity and the lifecycle guard: an ADVANCING office under the one GIP owner, no sealed or second ledger", () => {
  const office = factKind("gip_office_authority_locus");

  it("the office kind is under the existing GIP owner and facet, with one exclusive key space, and is ADVANCING — not a permanently SEALED identity", () => {
    expect([office.owner, office.facet, office.lifecycle]).toEqual([
      "gip",
      "gip_institution_identity",
      "ADVANCING",
    ]);
    expect(factKind("gip_institution_identity").lifecycle).toBe("SEALED"); // the predecessor is unchanged
    expect(
      ALL_FACT_KINDS.filter((k) => k.keyPattern.test("gip/institution/i1/office/o1")).map(
        (k) => k.id,
      ),
    ).toEqual(["gip_office_authority_locus"]);
    // the office key space never overlaps the identity key space
    expect(office.keyPattern.test("gip/institution/i1/identity")).toBe(false);
    expect(
      factKind("gip_institution_identity").keyPattern.test("gip/institution/i1/office/o1"),
    ).toBe(false);
    expect(GIP_FACT_KINDS.filter((k) => k.owner === "gip")).toHaveLength(2);
  });

  it("no second GIP owner, ledger, sidecar or sibling office record exists: the engine's GIP modules are the four predecessor modules", () => {
    expect(readdirSync(GIP_DIR).sort()).toEqual([
      "adapter.ts",
      "admission.ts",
      "declaration.ts",
      "integrity.ts",
    ]);
    expect(GIP_FACT_KINDS.map((k) => k.id)).toEqual([
      "gip_institution_identity",
      "gip_office_authority_locus",
    ]);
  });

  it("admission authorizes initial establishment only: the only rejection-free write to an office is a create at expected version zero", () => {
    const admission = code(`${GIP_DIR}/admission.ts`);
    expect(admission).toMatch(/AMENDMENT_NOT_SUPPORTED/);
    expect(admission).toMatch(/expected_version !== 0/);
  });
});

describe("IA-03/IA-06 the office joins its institution by exact institution_id and reads no foreign state", () => {
  it("the GIP modules join by the canonical key builders alone: no label, identity_label or text matching appears in code", () => {
    for (const f of GIP_SOURCES.filter((f) => !f.endsWith("contracts/src/gip.ts"))) {
      const text = identifiers(f);
      expect(text, f).not.toMatch(
        /identity_label|\.includes\(|\.startsWith\(\s*[^"')]|localeCompare|toLowerCase|toUpperCase|RegExp\(|\.match\(/,
      );
    }
    // the office's one prerequisite is read by the canonical identity key, through the shared prerequisite pin helper
    const admission = code(`${GIP_DIR}/admission.ts`);
    expect(admission).toMatch(/gipInstitutionIdentityKey\(office\.institution_id\)/);
    expect(admission).toMatch(/requirePrerequisite\(/);
    const adapter = code(`${GIP_DIR}/adapter.ts`);
    expect(adapter).toMatch(/gipInstitutionIdentityKey\(value\.institution_id\)/);
  });

  it("no actor, holder or authority-source resolution exists: holder_ref and authority_source_ref are never looked up", () => {
    for (const f of GIP_SOURCES) {
      const text = identifiers(f);
      expect(text, f).not.toMatch(/\.holder_ref|\.authority_source_ref/);
    }
    const foreign =
      /actorBoundaryViolation|actorCapability|namedActor|OWNER_NAMED_ACTOR|OWNER_POPULATION|OWNER_KTI|OWNER_EPISTEMIC_ACCESS|OWNER_ECONOMY|OWNER_PRODUCTION|OWNER_LOGISTICS|OWNER_WORLD_STATE|OWNER_TEMPORAL_KERNEL|accessEventKey|ktiTransfer|populationLedgerKey/;
    for (const f of GIP_SOURCES.filter((f) => !f.endsWith("integrity.ts")))
      expect(code(f), f).not.toMatch(foreign);
  });
});

describe("IA-02 strict executable contract: the §3.2 minimum, holder_ref branch only, nothing uninterpreted is interpreted", () => {
  it("the office schema is a strict object with no optional, default, loose or catch-all construct, and the deferred fields are not named in code", () => {
    const contract = code("packages/contracts/src/gip.ts");
    expect(contract).toMatch(/OfficeAuthorityLocusSchema = z\.strictObject\(/);
    expect(contract).not.toMatch(
      /z\.object\(|passthrough|looseObject|z\.record|z\.any|z\.unknown|\.optional\(|\.default\(|\.catch\(/,
    );
    const text = identifiers("packages/contracts/src/gip.ts");
    expect(text).not.toMatch(
      /\b(decision_body_ref|delegations|concurrence_requirements|review_veto_override|conditional_authority)\b/,
    );
  });

  it("the power, duty and rule texts are carried verbatim and never parsed, compared against a vocabulary, classified or executed", () => {
    for (const f of GIP_SOURCES) {
      expect(identifiers(f), f).not.toMatch(
        /\b(switch|JSON\.parse|eval|Function|split|replaceAll)\b|\.split\(|\.trim\(|\.toLowerCase\(/,
      );
    }
  });
});

describe("IA-04 turnless: no tick, clock, RNG, cadence or global scan on the office path; no Issue #11 workaround", () => {
  it("the GIP modules contain no timer, clock, RNG, scheduler, sweep or polling construct, and nothing is randomized or defaulted", () => {
    const forbidden =
      /\b(setInterval|setTimeout|setImmediate|Date\.now|new Date|performance\.now|process\.hrtime|Math\.random|randomUUID|randomBytes|randomInt|globalTick|tickCount|turnCounter|phaseOrder|runPhase|advanceTick|globalPass|pollInterval|cadence|refresh|sweep|periodic|annual|random\w*|rng|roll\w*|seed\w*|prior|dice|chooser|sample\w*|stochastic|probabilit\w*|uncertain\w*)\b/i;
    for (const f of GIP_SOURCES) expect(identifiers(f), f).not.toMatch(forbidden);
  });

  it("only the diagnostic integrity verifier lists facts: the establish and read paths never scan all institutions or offices", () => {
    for (const f of GIP_SOURCES.filter((f) => !f.endsWith("integrity.ts")))
      expect(code(f), f).not.toMatch(/listFacts\(|\.entries\(|\.values\(/);
    for (const f of ["adapter.ts", "admission.ts"])
      expect(code(`${GIP_DIR}/${f}`), f).not.toMatch(/\bfor \(|\.forEach\(|\.filter\(|\.find\(/);
    expect(code(`${GIP_DIR}/integrity.ts`).match(/listFacts\(/g)).toHaveLength(1);
  });

  it("the temporal registration guard still forbids any GIP stage, close or owned object: the office adds none", () => {
    const declaration = code(`${GIP_DIR}/declaration.ts`);
    expect(declaration).not.toMatch(/StageProvider|READ_MODE|declares_close:\s*\{|Stage\(/);
    expect(readdirSync(GIP_DIR)).not.toContain("provider.ts");
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("no transition, delegation, appointment, instrument, procedure, exercise, reach or foreign-owner construct exists in the GIP modules", () => {
    for (const f of GIP_SOURCES) {
      const text = identifiers(f).replace(/\bsuccession_rule\b/g, "");
      expect(text, f).not.toMatch(
        /\b(delegat\w*|concurrence|decisionBody|conditional\w*|appoint\w*|exercis\w*|instrument\w*|procedure|veto|override|scopeBinding|politicalRelation|pendingDecision|administrativeReach|implementationStatus|stability|legitimacy|recognition|faction|membership|members|headcount|population|treaty|diplomacy|treasury|kti|militar\w*|territory|jurisdiction|projection|npk|llm|prompt|rename\w*|split\w*|merge\w*|abolish\w*|replac(e|ed|ement)|succe(ed|ssor|ssion)\w*|predecessor\w*|successor\w*|constitutive\w*|supersede\w*)\b/i,
      );
    }
  });

  it("no migration, provider, protocol or host surface was added for the office", () => {
    expect(existsSync("migrations/manifests/gip.json")).toBe(false);
    expect(readFileSync("packages/protocol/src/index.ts", "utf8")).not.toMatch(/export (?!\{\})/);
  });
});

describe("acceptance-register and open-gate honesty (thirteenth slice)", () => {
  it("no row was promoted: nothing is PASS/FAIL, and the whole-engine rows stay NOT_IMPLEMENTED/BLOCKED", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });

  it.each(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"])(
    "%s gained narrowly scoped partial evidence for the Office / Authority Locus and stayed unpromoted",
    (id) => {
      const row = register.find((r) => r.id === id)!;
      expect(row.status).toBe("NOT_IMPLEMENTED");
      expect(row.evidence).toBeNull();
      expect(row.partial_evidence?.scope).toMatch(
        /GIP Office \/ Authority Locus \(thirteenth slice\)/,
      );
      expect(row.partial_evidence?.tests.some((t) => /gip-office/.test(t))).toBe(true);
    },
  );

  it("only the five rows demonstrated by this slice name the Office / Authority Locus", () => {
    expect(
      register
        .filter((r) => /Office \/ Authority Locus/.test(r.partial_evidence?.scope ?? ""))
        .map((r) => r.id)
        .sort(),
    ).toEqual(["IA-01", "IA-02", "IA-03", "IA-06", "IA-22"]);
  });

  it("the Office / Authority Locus evidence names what stays unimplemented and that GitHub Issue #11 is untouched", () => {
    const scope = register.find((r) => r.id === "IA-02")!.partial_evidence!.scope;
    for (const phrase of [
      "decision_body_ref",
      "delegation",
      "appointment",
      "holder replacement",
      "GitHub Issue #11 is untouched",
    ])
      expect(scope).toContain(phrase);
  });

  it("every open gate is exactly as the predecessor left it: this slice resolves and changes no gate", () => {
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
    expect(statusOf("OB-016")).toBe("OPEN_CODE_ERA_CONFORMANCE");
  });
});
