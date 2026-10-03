// Contract evidence for the I-002 PC Capability Profile / PC Capability Close Receiving Foundation (twenty-eighth slice):
// the executable contracts are strict, qualitative and sparse, and reuse the Character Capability marker unchanged.
// Register lineage: IA-02 (partial), IA-03 (partial); RC-02/03/04; IM-07. Source lock: spec/f027/spec-lock.json
// (F-027 v1.0): WS-016 (Integration Map §2 I-002 bounded amendment), I-002, F-016 Phase 2B PCC-01 to PCC-03.
import { describe, expect, it } from "vitest";
import {
  ComparativeMarkerSchema,
  FACET_PC_CAPABILITY_PROFILE,
  OWNER_PC_EXISTENCE,
  PC_CAPABILITY_CLOSE,
  PC_CLAIM_SECTIONS,
  PC_OPERATION_PUBLISH_CAPABILITY_CLOSE,
  PcCapabilityBasisSchema,
  PcCapabilitySchema,
  PcClaimLocatorSchema,
  actorCapabilityKey,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcCapabilityStage,
  pcExistenceContractKey,
  parseStageKey,
} from "@immortalis/contracts";
import { derivePcCapability } from "@immortalis/engine";
import { pcCapabilityBasis } from "@immortalis/testkit";

const basis = (over: Record<string, unknown> = {}) => ({
  ...pcCapabilityBasis("p1", "c1"),
  ...over,
});
const establishment = (over: Record<string, unknown> = {}) => ({
  ...pcCapabilityBasis("p1", "c1").establishment,
  ...over,
});
const capability = (over: Record<string, unknown> = {}) => {
  const d = derivePcCapability({
    key: pcCapabilityBasisKey("p1", "c1"),
    owner: "pc_existence",
    version: 1,
    value: pcCapabilityBasis("p1", "c1"),
  });
  if (!d.ok) throw new Error("fixture");
  return { ...d.value, ...over };
};

describe("the PC capability reuses the Character Capability marker unchanged: C / B / A / S and EX, never a number", () => {
  it("accepts exactly the shared marker forms, and ungraded only as an explicit null", () => {
    for (const marker of [
      "C",
      "B",
      "A",
      "S",
      { ex: "SYNTHETIC FIXTURE: a causal descriptor" },
      null,
    ]) {
      expect(
        PcCapabilityBasisSchema.safeParse(basis({ marker })).success,
        JSON.stringify(marker),
      ).toBe(true);
      expect(PcCapabilitySchema.safeParse(capability({ marker })).success).toBe(true);
    }
    // the very same schema object family as the Named-Actor owner's: no second rank system
    expect(ComparativeMarkerSchema.safeParse("S").success).toBe(true);
  });

  it("refuses every hidden numeric or non-ladder marker, and an absent marker, on both records", () => {
    for (const bad of [
      "D",
      "SS",
      "S+",
      "A+",
      "B-",
      "EX",
      "ex",
      "c",
      "",
      "0",
      0,
      1,
      3,
      0.5,
      100,
      "75%",
      true,
      { grade: "C" },
      { ex: "" },
      { ex: "x", level: 2 },
      { ex: 5 },
      ["C"],
      { value: 3 },
    ])
      for (const schema of [PcCapabilityBasisSchema, PcCapabilitySchema]) {
        const v =
          schema === PcCapabilityBasisSchema ? basis({ marker: bad }) : capability({ marker: bad });
        expect(schema.safeParse(v).success, JSON.stringify(bad)).toBe(false);
      }
    const noMarker: Record<string, unknown> = basis();
    delete noMarker["marker"];
    expect(PcCapabilityBasisSchema.safeParse(noMarker).success).toBe(false);
  });
});

describe("the received basis is sparse and strict", () => {
  it("a valid basis carries only the PC, the capability, the marker and the pinned generation-history establishment", () => {
    const parsed = PcCapabilityBasisSchema.parse(basis());
    expect(Object.keys(parsed).sort()).toEqual([
      "capability_id",
      "establishment",
      "marker",
      "pc_id",
    ]);
    expect(Object.keys(parsed.establishment).sort()).toEqual(["claims", "contract", "method"]);
  });

  it("has no field for numbers, XP, levels, skill values, probabilities, a roll, a prior, a seed, time, scope, constraints or a mode", () => {
    for (const field of [
      "level",
      "xp",
      "experience",
      "skill",
      "skill_value",
      "value",
      "score",
      "rank",
      "rating",
      "percentage",
      "probability",
      "modifier",
      "bonus",
      "roll",
      "prior",
      "seed",
      "weight",
      "draw",
      "timestamp",
      "time",
      "tick",
      "scope",
      "constraints",
      "mode",
      "materiality",
      "potential",
      "talent",
    ])
      expect(PcCapabilityBasisSchema.safeParse(basis({ [field]: 1 })).success, field).toBe(false);
  });

  it("has no field for raw embodiment, equipment, temporary effectiveness, office, KTI, observer belief, reputation or a transcript", () => {
    for (const field of [
      "strength",
      "intelligence",
      "body",
      "embodiment",
      "equipment",
      "tool",
      "injury",
      "fatigue",
      "condition",
      "office",
      "authority",
      "kti",
      "technique",
      "training",
      "belief",
      "reputation",
      "observer_estimate",
      "apparent_grade",
      "transcript",
      "generation_exchange",
      "statement",
    ])
      expect(PcCapabilityBasisSchema.safeParse(basis({ [field]: "x" })).success, field).toBe(false);
  });

  it("has no aggregate, cohort, population, institution, formation or body/entity reference: the subject is one PC identity", () => {
    for (const field of [
      "cohort_id",
      "cohort",
      "population_id",
      "ledger_id",
      "institution_id",
      "formation_id",
      "body_id",
      "entity_id",
      "actor_id",
      "named_actor",
    ])
      expect(PcCapabilityBasisSchema.safeParse(basis({ [field]: "x" })).success, field).toBe(false);
  });

  it("exactly one establishment method is representable — ACCEPTED_GENERATION_HISTORY — and no deferred, delegated, developed, handed-over, randomized or reputation-derived method", () => {
    expect(PcCapabilityBasisSchema.safeParse(basis()).success).toBe(true);
    for (const method of [
      "CAUSALLY_DETERMINED",
      "BOUNDED_PRIOR_RANDOMIZED",
      "DEFERRED_DERIVATION",
      "DELEGATED_BRANCH",
      "DEVELOPMENT",
      "REVELATION",
      "INTRINSIC_AMENDMENT_EVENT",
      "EXISTING_ACTOR_HANDOVER",
      "FROM_FAME",
      "REPUTATION",
      "accepted_generation_history",
      "",
    ])
      expect(
        PcCapabilityBasisSchema.safeParse(basis({ establishment: establishment({ method }) }))
          .success,
        method,
      ).toBe(false);
    // a method that carries what another method would (causes, a draw reference) is refused as an unmodelled field
    for (const extra of [
      { causes: [] },
      { causes: [{ aspect: "BIOGRAPHY_HISTORY", owner: "o", fact_key: "k", version: 1 }] },
      { draw: { draw_id: "x", result: { fact_key: "k", version: 1 } } },
      { delegation: "sealed" },
      { verbatim: "the dialogue" },
    ])
      expect(
        PcCapabilityBasisSchema.safeParse(basis({ establishment: establishment(extra) })).success,
        JSON.stringify(extra),
      ).toBe(false);
  });

  it("the contract pin is a reference — a key and a version — never a copied value", () => {
    expect(
      PcCapabilityBasisSchema.safeParse(
        basis({ establishment: establishment({ contract: { fact_key: "k", version: 0 } }) }),
      ).success,
    ).toBe(false);
    for (const contract of [
      { fact_key: pcExistenceContractKey("p1") },
      { version: 1 },
      { fact_key: "", version: 1 },
      { fact_key: pcExistenceContractKey("p1"), version: 1, value: {} },
      { fact_key: pcExistenceContractKey("p1"), version: 1.5 },
      "pc/p1/existence-contract",
    ])
      expect(
        PcCapabilityBasisSchema.safeParse(basis({ establishment: establishment({ contract }) }))
          .success,
        JSON.stringify(contract),
      ).toBe(false);
  });

  it("the cited claims are locators — a section and an index — with at least one, each cited once, and never a copied statement", () => {
    expect([...PC_CLAIM_SECTIONS].sort()).toEqual(
      [
        "baseline_exception.player_overrides",
        "baseline_exception.safely_inherited",
        "contact",
        "continuity_rule",
        "embodiment_topology",
        "entry_envelope",
        "identity_agency",
      ].sort(),
    );
    // a hypothesis and an unresolved item are not claims: they have no section
    expect(PC_CLAIM_SECTIONS).not.toContain("baseline_exception.hypotheses");
    expect(PC_CLAIM_SECTIONS).not.toContain("baseline_exception.unresolved");
    for (const section of PC_CLAIM_SECTIONS)
      expect(PcClaimLocatorSchema.safeParse({ section, index: 0 }).success).toBe(true);
    for (const bad of [
      { section: "identity_agency" },
      { index: 0 },
      { section: "identity_agency", index: -1 },
      { section: "identity_agency", index: 0.5 },
      { section: "identity_agency", index: "0" },
      { section: "identity_agency", index: 0, statement: "copy" },
      { section: "baseline_exception.hypotheses", index: 0 },
      { section: "release", index: 0 },
    ])
      expect(PcClaimLocatorSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(
      PcCapabilityBasisSchema.safeParse(basis({ establishment: establishment({ claims: [] }) }))
        .success,
    ).toBe(false);
    const one = { section: "identity_agency", index: 0 };
    expect(
      PcCapabilityBasisSchema.safeParse(
        basis({ establishment: establishment({ claims: [one, one] }) }),
      ).success,
    ).toBe(false);
    expect(
      PcCapabilityBasisSchema.safeParse(
        basis({
          establishment: establishment({ claims: [one, { section: "entry_envelope", index: 0 }] }),
        }),
      ).success,
    ).toBe(true);
  });

  it("refuses malformed identities: a PC or capability identity is an embeddable opaque identifier", () => {
    for (const bad of ["", " ", "a/b", "a b", "../x", "-x", "x/", "a\nb"]) {
      expect(PcCapabilityBasisSchema.safeParse(basis({ pc_id: bad })).success, bad).toBe(false);
      expect(PcCapabilityBasisSchema.safeParse(basis({ capability_id: bad })).success, bad).toBe(
        false,
      );
    }
  });
});

describe("the persisted capability is the minimal record", () => {
  it("carries exactly the PC, the capability, the marker, a pinned basis pointer and the capability-close reference", () => {
    const c = PcCapabilitySchema.parse(capability());
    expect(Object.keys(c).sort()).toEqual(["basis", "capability_id", "close", "marker", "pc_id"]);
    expect(c.basis).toEqual({ fact_key: pcCapabilityBasisKey("p1", "c1"), version: 1 });
  });

  it("holds no copy of any foreign or temporary state and no number", () => {
    for (const field of [
      "level",
      "xp",
      "equipment",
      "injury",
      "fatigue",
      "office",
      "kti",
      "reputation",
      "belief",
      "scope",
      "constraints",
      "body",
      "cohort_id",
      "actor_id",
      "transcript",
      "effective_time",
      "development",
      "history",
      "grade_history",
      "previous_marker",
    ])
      expect(PcCapabilitySchema.safeParse(capability({ [field]: 1 })).success, field).toBe(false);
    expect(
      PcCapabilitySchema.safeParse(capability({ basis: { fact_key: "k", version: 0 } })).success,
    ).toBe(false);
    expect(
      PcCapabilitySchema.safeParse(capability({ basis: { fact_key: "k", version: 1, extra: 1 } }))
        .success,
    ).toBe(false);
  });

  it("the close reference is the literal F-016 PCC-02 Close Basis name, never another name, and its stage is a strict StageKey", () => {
    expect(PC_CAPABILITY_CLOSE).toBe("PC Capability Close");
    const c = capability();
    for (const name of [
      "actor-profile-capability-close",
      "pc-capability-close",
      "PC capability close",
      "PC Capability Close ",
      "pc_capability_close",
      "",
      "now",
    ])
      expect(
        PcCapabilitySchema.safeParse({ ...c, close: { ...c.close, name } }).success,
        name,
      ).toBe(false);
    expect(
      PcCapabilitySchema.safeParse({
        ...c,
        close: { ...c.close, stage: { causal_process_id: "x" } },
      }).success,
    ).toBe(false);
    expect(
      PcCapabilitySchema.safeParse({ ...c, close: { ...c.close, group_id: "g" } }).success,
    ).toBe(false);
  });
});

describe("keys, owner and stage identity are derived from the PC and capability alone", () => {
  it("the two key spaces are disjoint, PC-keyed and capability-keyed, and neither is the Existence Contract's or the Named-Actor owner's", () => {
    expect(pcCapabilityBasisKey("p1", "c1")).toBe("pc/p1/capability-basis/c1");
    expect(pcCapabilityKey("p1", "c1")).toBe("pc/p1/capability/c1");
    expect(new Set([pcCapabilityBasisKey("p1", "c1"), pcCapabilityKey("p1", "c1")]).size).toBe(2);
    expect(pcCapabilityKey("p1", "c1")).not.toBe(pcExistenceContractKey("p1"));
    expect(pcCapabilityKey("p1", "c1")).not.toBe(actorCapabilityKey("p1", "c1"));
  });

  it("the capability profile is a facet of the one PC owner, named by the sources' assignment — not a second owner", () => {
    expect(OWNER_PC_EXISTENCE).toBe("pc_existence");
    expect(FACET_PC_CAPABILITY_PROFILE).toBe("pc_capability_profile");
    expect(pcCapabilityStage("p1", "c1").owner_operation).toEqual({
      owner: OWNER_PC_EXISTENCE,
      operation: PC_OPERATION_PUBLISH_CAPABILITY_CLOSE,
    });
  });

  it("the close stage is a valid StageKey whose identity has no horizon, version, retry, consumer or slice dimension", () => {
    const s = pcCapabilityStage("p1", "c1");
    expect(parseStageKey(s).ok).toBe(true);
    expect(Object.keys(s).sort()).toEqual([
      "causal_process_id",
      "owner_operation",
      "prospective_result_id",
    ]);
    expect(s.prospective_result_id).toBe(pcCapabilityKey("p1", "c1"));
    for (const dimension of ["horizon", "source_version", "retry", "consumer", "slice"])
      expect(parseStageKey({ ...s, [dimension]: 1 }).ok).toBe(false);
    expect(pcCapabilityStage("p1", "c2")).not.toEqual(s);
    expect(pcCapabilityStage("p2", "c1")).not.toEqual(s);
    // the stage is not the Named-Actor owner's stage for the same identifiers
    expect(s.owner_operation.owner).not.toBe("named_actor");
  });
});
