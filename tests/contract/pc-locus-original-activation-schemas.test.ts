/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary invalid values */
// Original active-PC qualified physical-locus custody — contract (BLUE v5.1). The custody keeps ONE strict shape with exactly two
// mutually exclusive bases; the physical-placement decision is a closed-vocabulary, quote-anchored answer whose verdict can only be
// DERIVED. Every schema is strict, which is also the structural half of the exclusions.
import { describe, expect, it } from "vitest";
import {
  ORIGINAL_ACTIVATION,
  OriginalPcPhysicalLocusCustodyTargetSchema,
  PHYSICAL_CLAIM_BEARINGS,
  PHYSICAL_DEPENDENCY_KINDS,
  PHYSICAL_EMBODIMENT_MODES,
  PHYSICAL_PRESENCE_MODES,
  PHYSICAL_VERDICTS,
  PcPhysicalLocusCustodySchema,
  PhysicalHostDecisionSchema,
  REFEREE_OP_PHYSICAL,
  RefereeDecisionRecordSchema,
  RefereeOperationSchema,
  RefereeVerdictSchema,
  IR_VERDICTS,
} from "@immortalis/contracts";

const locus = {
  world: { fact_key: "world/w1/profile", entity_id: "w1" },
  locus: { fact_key: "world/w1/locus/l1", entity_id: "l1" },
};
const custodian = {
  owner: "world_state",
  facet: "world_fallback_physical_entity",
  basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
};
const handover = (): any => ({
  pc_id: "pc-1",
  stationary_locus: locus,
  basis: {
    established_from: "EXISTING_ACTOR_HANDOVER",
    pinned_versions: { pc: 1, binding: 1, coupling: 1, world: 1, locus: 1 },
  },
  custodian,
});
const activation = (): any => ({
  pc_id: "pc-1",
  stationary_locus: locus,
  basis: {
    established_from: "ACTIVATION",
    pinned_versions: { pc: 1, binding: 1, world: 1, locus: 1 },
    qualified_by: {
      native: { fact_key: `referee/${"a".repeat(64)}/decision`, version: 1 },
      physical: { fact_key: `referee/${"b".repeat(64)}/decision`, version: 1 },
    },
  },
  custodian,
});
const ok = (v: unknown) => PcPhysicalLocusCustodySchema.safeParse(v).success;

describe("the custody record has exactly two mutually exclusive bases", () => {
  it("the predecessor handover shape is unchanged and still lawful", () => {
    expect(ok(handover())).toBe(true);
  });

  it("the original-activation shape is lawful; its literal is the Role Registry transition type, never the handover's", () => {
    expect(ok(activation())).toBe(true);
    expect(ORIGINAL_ACTIVATION).toBe("ACTIVATION");
    expect(ORIGINAL_ACTIVATION).not.toBe("EXISTING_ACTOR_HANDOVER");
  });

  it("the bases cannot be mixed: a handover with decisions, an activation with a coupling, or any other source literal is rejected", () => {
    const a = activation();
    a.basis.pinned_versions.coupling = 1;
    expect(ok(a)).toBe(false);
    const b = activation();
    delete b.basis.qualified_by;
    expect(ok(b)).toBe(false);
    const h = handover();
    h.basis.qualified_by = activation().basis.qualified_by;
    expect(ok(h)).toBe(false);
    const h2 = handover();
    delete h2.basis.pinned_versions.coupling;
    expect(ok(h2)).toBe(false);
    for (const source of ["GENERIC", "PLAYER", "BINDING", "CLAIMED", "ORIGINAL_ACTIVATION", ""]) {
      const v = activation();
      v.basis.established_from = source;
      expect(ok(v), source).toBe(false);
    }
  });

  it("both decisions are required and nothing else (no verdict, flag, locus or placement can ride along)", () => {
    for (const field of ["native", "physical"]) {
      const v = activation();
      delete v.basis.qualified_by[field];
      expect(ok(v), field).toBe(false);
    }
    for (const extra of ["verdict", "physical", "approved", "placement", "locus", "coupling"]) {
      const v = activation();
      v.basis.qualified_by[extra] = true;
      expect(ok(v), extra).toBe(false);
      const w = activation();
      w.basis[extra] = true;
      expect(ok(w), extra).toBe(false);
    }
    const v = activation();
    v.basis.qualified_by.physical.verdict = "PHYSICAL_ELIGIBLE";
    expect(ok(v)).toBe(false);
  });

  it("still states no movement, request, destination, route, duration, transfer, holder or second locus", () => {
    for (const field of [
      "movement",
      "request",
      "destination",
      "route",
      "duration",
      "transfer",
      "holder",
      "binding_locus",
      "current_locus",
    ]) {
      const v = activation();
      v[field] = {};
      expect(ok(v), field).toBe(false);
    }
  });

  it("pins are positive versions; the establishment names the identity and the two decisions by key only", () => {
    const v = activation();
    v.basis.pinned_versions.pc = 0;
    expect(ok(v)).toBe(true); // 0 lets a missing prerequisite surface as PREREQUISITE_MISSING at admission, as for the handover
    expect(
      OriginalPcPhysicalLocusCustodyTargetSchema.safeParse({
        pc_id: "pc-1",
        native_qualified_by: `referee/${"a".repeat(64)}/decision`,
        physical_qualified_by: `referee/${"b".repeat(64)}/decision`,
      }).success,
    ).toBe(true);
    for (const extra of ["stationary_locus", "verdict", "world_id", "locus_id", "physical"])
      expect(
        OriginalPcPhysicalLocusCustodyTargetSchema.safeParse({
          pc_id: "pc-1",
          native_qualified_by: "k",
          physical_qualified_by: "k2",
          [extra]: "x",
        }).success,
        extra,
      ).toBe(false);
  });
});

const answer = (): any => ({
  task_id: "c".repeat(64),
  embodiment: {
    mode: "SINGLE_MATERIAL_BODY",
    item_id: "mirror/embodiment/aaaaaaaaaaaa",
    rule_ids: ["I002-4.3"],
    grounds: "g",
    evidence_quote: "q",
  },
  presence: { mode: "NATIVE_AT_THIS_LOCUS", rule_ids: ["IR-7"], grounds: "g", evidence_quote: "q" },
  external_claims: [],
  assessments: [
    {
      fact_id: "world.premise",
      relation: "NOT_RELEVANT",
      rule_ids: ["IR-7"],
      grounds: "g",
      evidence_quote: null,
    },
  ],
  clarification: null,
});

describe("the physical-placement decision is a closed vocabulary", () => {
  it("is a third referee operation with its own verdict names, distinct from every IR verdict (the fourth, direct perception, is BLUE v5.2's)", () => {
    expect(RefereeOperationSchema.options).toEqual([
      "I002_CLASSIFY",
      "IR_NATIVE_COMPATIBILITY",
      REFEREE_OP_PHYSICAL,
      "F014D_DIRECT_PERCEPTION",
      "GM_SCENE_RESOLUTION",
    ]);
    expect(REFEREE_OP_PHYSICAL).toBe("IR_PHYSICAL_PLACEMENT");
    for (const v of PHYSICAL_VERDICTS) {
      expect(RefereeVerdictSchema.safeParse(v).success).toBe(true);
      expect((IR_VERDICTS as readonly string[]).includes(v)).toBe(false);
    }
    expect(PHYSICAL_VERDICTS).toEqual([
      "PHYSICAL_ELIGIBLE",
      "NOT_PHYSICAL_SINGLE_LOCUS",
      "PHYSICAL_WORLD_CONFLICT",
      "PHYSICAL_UNRESOLVED",
    ]);
  });

  it("the form modes are the examples I-002 §4.3 lists, plus the host's AMBIGUOUS", () => {
    expect(PHYSICAL_EMBODIMENT_MODES).toEqual([
      "SINGLE_MATERIAL_BODY",
      "SEVERAL_SAME_AGENCY_BODIES",
      "HOST_DEPENDENT",
      "DISTRIBUTED_SUBSTRATE",
      "INCORPOREAL",
      "NO_CURRENT_BODY",
      "TOTAL_DOMAIN_COEXTENSIVE",
      "AMBIGUOUS",
    ]);
    expect(PHYSICAL_PRESENCE_MODES).toContain("NATIVE_AT_THIS_LOCUS");
    expect(PHYSICAL_DEPENDENCY_KINDS).toHaveLength(3);
  });

  it("accepts the one lawful shape and rejects any unmodelled field, role, permission, verdict or flag", () => {
    expect(PhysicalHostDecisionSchema.safeParse(answer()).success).toBe(true);
    for (const field of [
      "verdict",
      "role",
      "permission",
      "authority",
      "approved",
      "physical",
      "locus",
      "placement",
      "claimed_model",
    ]) {
      const a = answer();
      a[field] = "x";
      expect(PhysicalHostDecisionSchema.safeParse(a).success, field).toBe(false);
      const b = answer();
      b.embodiment[field] = "x";
      expect(PhysicalHostDecisionSchema.safeParse(b).success, `embodiment.${field}`).toBe(false);
    }
  });

  it("rejects a mode outside the closed vocabularies and a quotation-free reading", () => {
    const a = answer();
    a.embodiment.mode = "GHOST";
    expect(PhysicalHostDecisionSchema.safeParse(a).success).toBe(false);
    const b = answer();
    b.presence.mode = "PORTAL";
    expect(PhysicalHostDecisionSchema.safeParse(b).success).toBe(false);
    const c = answer();
    delete c.embodiment.evidence_quote;
    expect(PhysicalHostDecisionSchema.safeParse(c).success).toBe(false);
    const d = answer();
    d.external_claims = [
      {
        kind: "FRIENDSHIP",
        bearing: "CONTINGENT",
        rule_ids: ["IR-12"],
        grounds: "g",
        evidence_quote: "q",
      },
    ];
    expect(PhysicalHostDecisionSchema.safeParse(d).success).toBe(false);
  });

  it("every external claim states how it bears on the presence: contingent or conjunctive, nothing else, never omitted", () => {
    expect(PHYSICAL_CLAIM_BEARINGS).toEqual(["CONTINGENT", "CONJUNCTIVE"]);
    const claim = (over: Record<string, unknown>): any => ({
      kind: "INDEPENDENT_ACTOR_COOPERATION",
      bearing: "CONJUNCTIVE",
      rule_ids: ["IR-12"],
      grounds: "g",
      evidence_quote: "q",
      ...over,
    });
    const ok = (c: unknown) => {
      const a = answer();
      a.external_claims = [c];
      return PhysicalHostDecisionSchema.safeParse(a).success;
    };
    expect(ok(claim({}))).toBe(true);
    expect(ok(claim({ bearing: "CONTINGENT" }))).toBe(true);
    for (const bearing of ["ACCEPTED", "PARTIAL", "", undefined])
      expect(ok(claim({ bearing })), String(bearing)).toBe(false);
    // no way to state that a claim was accepted, verified or committed
    for (const extra of ["accepted", "verified", "committed", "willingness", "granted"])
      expect(ok(claim({ [extra]: true })), extra).toBe(false);
    // the old name of the field is gone
    const old = answer();
    old.dependencies = [];
    expect(PhysicalHostDecisionSchema.safeParse(old).success).toBe(false);
  });

  it("the custody record has no field in which any external claim could be committed", () => {
    const c = activation();
    for (const field of ["external_claims", "claims", "actor", "willingness", "right", "oath"]) {
      const v = structuredClone(c);
      v[field] = [];
      expect(ok(v), field).toBe(false);
      const w = structuredClone(c);
      w.basis[field] = [];
      expect(ok(w), `basis.${field}`).toBe(false);
    }
  });

  it("the retained record carries its operation, its decision and a verdict of its own operation only", () => {
    const record = (verdict: string, decision: unknown = answer()): any => ({
      record_version: 1,
      task_id: "c".repeat(64),
      campaign_id: "camp",
      attempt: 0,
      authority: { role: "role.gm", permission: "permission.rule.adjudicate" },
      host: { host_id: "h", claimed_model: null },
      subject: { pc_id: "pc-1" },
      input: {
        digest: "d".repeat(64),
        candidate_digest: null,
        candidate: null,
        statement_digest: "e".repeat(64),
        statement: "I have always lived here.",
        refs: [],
      },
      operation: REFEREE_OP_PHYSICAL,
      decision,
      verdict,
    });
    expect(RefereeDecisionRecordSchema.safeParse(record("PHYSICAL_ELIGIBLE")).success).toBe(true);
    for (const verdict of ["BIND_ELIGIBLE", "CLOSED", "WORLD_CONFLICT", "ELIGIBLE", ""])
      expect(RefereeDecisionRecordSchema.safeParse(record(verdict)).success, verdict).toBe(false);
    const asIr = { ...record("BIND_ELIGIBLE"), operation: "IR_NATIVE_COMPATIBILITY" };
    expect(RefereeDecisionRecordSchema.safeParse(asIr).success).toBe(false);
  });
});
