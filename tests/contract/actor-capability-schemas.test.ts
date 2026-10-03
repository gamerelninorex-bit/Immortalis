// Contract evidence for the Named-Actor Character Capability & Capability-Close Backbone Foundation (ninth slice): the
// executable contracts are strict, qualitative and sparse. Register lineage: IA-02 (partial), IA-03 (partial);
// RC-02/03/04; IM-07. Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-016 and WS-006.
import { describe, expect, it } from "vitest";
import {
  ACTOR_PROFILE_CAPABILITY_CLOSE,
  CAPABILITY_CAUSE_ASPECTS,
  CAPABILITY_GRADES,
  ComparativeMarkerSchema,
  NAMED_ACTOR_MATERIALITY,
  NAMED_ACTOR_OPERATION_ESTABLISH_CAPABILITY_BASIS,
  NamedActorCapabilityBasisSchema,
  NamedActorRandomizedEstablishmentSchema,
  NamedActorCapabilitySchema,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  actorCapabilityStage,
  capabilityCandidateId,
  namedActorCapabilityDrawKey,
  parseCapabilityCandidateId,
  parseStageKey,
} from "@immortalis/contracts";
import { capabilityBasis, historyKey, randomizedEstablishment } from "@immortalis/testkit";
import { deriveCapability } from "@immortalis/engine";

const basis = (over: Record<string, unknown> = {}) => ({ ...capabilityBasis("a1", "c1"), ...over });
const capability = (over: Record<string, unknown> = {}) => {
  const b = capabilityBasis("a1", "c1");
  const d = deriveCapability({
    key: actorCapabilityBasisKey("a1", "c1"),
    owner: "named_actor",
    version: 1,
    value: b,
  });
  if (!d.ok) throw new Error("fixture");
  return { ...d.value, ...over };
};

describe("the comparative marker is qualitative: C / B / A / S and EX, never a number (acceptance 2)", () => {
  it("accepts exactly the four grades and an EX descriptor", () => {
    expect(CAPABILITY_GRADES).toEqual(["C", "B", "A", "S"]);
    for (const g of CAPABILITY_GRADES)
      expect(ComparativeMarkerSchema.safeParse(g).success).toBe(true);
    expect(
      ComparativeMarkerSchema.safeParse({ ex: "SYNTHETIC FIXTURE: a causal descriptor" }).success,
    ).toBe(true);
  });

  it("refuses every hidden numeric or non-ladder marker: EX is not S+, there is no D, no level, no percentage", () => {
    for (const bad of [
      "D",
      "E",
      "F",
      "SS",
      "S+",
      "A+",
      "B-",
      "EX",
      "ex",
      "c",
      "a",
      "",
      " C",
      "C ",
      0,
      1,
      5,
      0.75,
      100,
      -1,
      null,
      true,
      [],
      {},
      { ex: "" },
      { ex: " padded " },
      { ex: "x", grade: "S" },
      { ex: 3 },
      { grade: "A" },
      { level: 3 },
      { xp: 10 },
      { percent: 90 },
      { rank: 2 },
    ])
      expect(ComparativeMarkerSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it("the marker is optional only as an explicit null (ungraded), never a hidden below-C rung", () => {
    expect(NamedActorCapabilityBasisSchema.safeParse(basis({ marker: null })).success).toBe(true);
    const without: Record<string, unknown> = { ...basis() };
    delete without["marker"];
    expect(NamedActorCapabilityBasisSchema.safeParse(without).success).toBe(false);
    for (const below of ["below-C", "D", "apprentice", 0])
      expect(NamedActorCapabilityBasisSchema.safeParse(basis({ marker: below })).success).toBe(
        false,
      );
  });
});

describe("the establishment basis is sparse and strict (acceptance 1, 2, 3, 6)", () => {
  it("a valid basis is accepted and carries only the actor, the capability, the marker, the materiality gate and pinned causes", () => {
    expect(NamedActorCapabilityBasisSchema.parse(basis())).toEqual(basis());
    expect(Object.keys(basis()).sort()).toEqual([
      "actor_id",
      "capability_id",
      "establishment",
      "marker",
      "materiality",
    ]);
  });

  it("has no field for numbers, XP, levels, skill values, probabilities, a roll, a prior, a seed, time, scope, constraints or a mode", () => {
    for (const extra of [
      "level",
      "xp",
      "skill",
      "skill_value",
      "value",
      "score",
      "rank",
      "rating",
      "percent",
      "probability",
      "roll",
      "seed",
      "prior",
      "weighting",
      "random",
      "dc",
      "modifier",
      "bonus",
      "talent",
      "potential",
      "aptitude_score",
      "scope",
      "constraints",
      "mode",
      "grade",
      "tick",
      "turn",
      "established_at",
      "development",
      "decay",
      "progress",
    ])
      expect(NamedActorCapabilityBasisSchema.safeParse(basis({ [extra]: 1 })).success, extra).toBe(
        false,
      );
  });

  it("has no field for raw embodiment, equipment, temporary effectiveness, office, KTI, observer belief or reputation", () => {
    for (const extra of [
      "strength",
      "speed",
      "intelligence",
      "size",
      "memory",
      "body",
      "embodiment",
      "equipment",
      "tool",
      "injury",
      "fatigue",
      "condition",
      "office",
      "authority",
      "title",
      "kti",
      "knowledge",
      "technique",
      "relationship",
      "reputation",
      "observer_belief",
      "apparent_grade",
      "credential",
      "fame",
    ])
      expect(
        NamedActorCapabilityBasisSchema.safeParse(basis({ [extra]: "x" })).success,
        extra,
      ).toBe(false);
  });

  it("has no aggregate, cohort, population, institution, formation or body/entity reference: the subject is one actor identity", () => {
    for (const extra of [
      "cohort_id",
      "cohort",
      "population_id",
      "population",
      "ledger_id",
      "headcount",
      "count",
      "members",
      "institution",
      "formation",
      "faction",
      "aggregate",
      "aggregate_bound",
      "promoted_from",
      "individuated_from",
      "body_id",
      "entity_id",
      "entity",
      "form",
      "substrate",
      "lifecycle",
      "clone_of",
    ])
      expect(
        NamedActorCapabilityBasisSchema.safeParse(basis({ [extra]: "x" })).success,
        extra,
      ).toBe(false);
  });

  it("the materiality gate is the source's four literals and nothing else (WS-016 §4 Named Actor)", () => {
    expect(NAMED_ACTOR_MATERIALITY).toEqual([
      "ROLE_DEFINING",
      "RECURRING",
      "MATERIALLY_CONSEQUENTIAL",
      "REPEATEDLY_REQUIRED",
    ]);
    for (const m of NAMED_ACTOR_MATERIALITY)
      expect(NamedActorCapabilityBasisSchema.safeParse(basis({ materiality: m })).success).toBe(
        true,
      );
    for (const bad of [
      "NARRATIVE_NEED",
      "PLAYER_REQUEST",
      "ORDINARY",
      "",
      "role_defining",
      undefined,
    ])
      expect(
        NamedActorCapabilityBasisSchema.safeParse(basis({ materiality: bad })).success,
        String(bad),
      ).toBe(false);
  });

  it("exactly two establishment methods are representable — CAUSALLY_DETERMINED and the draw-backed BOUNDED_PRIOR_RANDOMIZED — and no roll, default or need-driven method", () => {
    const with_ = (establishment: unknown) => basis({ establishment });
    const causes = basis().establishment.causes;
    const draw = {
      draw_id: `cdraw:v1:${"a".repeat(64)}`,
      result: { fact_key: `causal-draw/${"a".repeat(64)}/result`, version: 1 },
    };
    expect(
      NamedActorCapabilityBasisSchema.safeParse(with_({ method: "CAUSALLY_DETERMINED", causes }))
        .success,
    ).toBe(true);
    expect(
      NamedActorCapabilityBasisSchema.safeParse(
        with_({ method: "BOUNDED_PRIOR_RANDOMIZED", causes, draw }),
      ).success,
    ).toBe(true);
    for (const method of ["RANDOM", "ROLL", "NARRATIVE_NEED", "DEFAULT", "", undefined])
      expect(
        NamedActorCapabilityBasisSchema.safeParse(with_({ method, causes, draw })).success,
        String(method),
      ).toBe(false);
    // the randomized method is representable only with its draw pointer; the deterministic one only without
    expect(
      NamedActorCapabilityBasisSchema.safeParse(
        with_({ method: "BOUNDED_PRIOR_RANDOMIZED", causes }),
      ).success,
    ).toBe(false);
    expect(
      NamedActorCapabilityBasisSchema.safeParse(
        with_({ method: "CAUSALLY_DETERMINED", causes, draw }),
      ).success,
    ).toBe(false);
    // …and nothing of the sampler is stored on the record: no prior, weight, seed, sample, roll or probability
    for (const extra of [
      "prior",
      "weights",
      "seed",
      "roll",
      "distribution",
      "bound",
      "probability",
    ]) {
      expect(
        NamedActorCapabilityBasisSchema.safeParse(
          with_({ method: "CAUSALLY_DETERMINED", causes, [extra]: 1 }),
        ).success,
        extra,
      ).toBe(false);
      expect(
        NamedActorCapabilityBasisSchema.safeParse(
          with_({ method: "BOUNDED_PRIOR_RANDOMIZED", causes, draw, [extra]: 1 }),
        ).success,
        extra,
      ).toBe(false);
      expect(
        NamedActorCapabilityBasisSchema.safeParse(
          with_({
            method: "BOUNDED_PRIOR_RANDOMIZED",
            causes,
            draw: { ...draw, [extra]: 1 },
          }),
        ).success,
        `draw.${extra}`,
      ).toBe(false);
    }
    for (const bad of [
      { ...draw, draw_id: "cdraw:v1:short" },
      { ...draw, result: { ...draw.result, version: 0 } },
      { ...draw, result: { fact_key: "", version: 1 } },
    ])
      expect(
        NamedActorCapabilityBasisSchema.safeParse(
          with_({ method: "BOUNDED_PRIOR_RANDOMIZED", causes, draw: bad }),
        ).success,
      ).toBe(false);
  });

  it("the randomized authoring input is the owner's prior and its causes only: markers and relative integer weights, no default, score or result", () => {
    const input = randomizedEstablishment("a1", "c1");
    expect(NamedActorRandomizedEstablishmentSchema.safeParse(input).success).toBe(true);
    // the cardinality of the prior is the Causal Draw gate's to refuse (with its own codes), not this schema's
    for (const prior of [[], [{ marker: "C", weight: "1" }]])
      expect(NamedActorRandomizedEstablishmentSchema.safeParse({ ...input, prior }).success).toBe(
        true,
      );
    for (const weight of ["0", "-1", "1.5", "1e3", "01", "", 3, null, undefined])
      expect(
        NamedActorRandomizedEstablishmentSchema.safeParse({
          ...input,
          prior: [{ marker: "C", weight }],
        }).success,
        String(weight),
      ).toBe(false);
    for (const marker of ["S+", "D", "EX", 3, { ex: "" }, { level: 1 }, undefined])
      expect(
        NamedActorRandomizedEstablishmentSchema.safeParse({
          ...input,
          prior: [{ marker, weight: "1" }],
        }).success,
        JSON.stringify(marker),
      ).toBe(false);
    for (const extra of ["marker", "potential", "level", "percent", "seed", "default", "result"])
      expect(
        NamedActorRandomizedEstablishmentSchema.safeParse({ ...input, [extra]: "C" }).success,
        extra,
      ).toBe(false);
    expect(
      NamedActorRandomizedEstablishmentSchema.safeParse({
        ...input,
        prior: [{ marker: "C", weight: "1", percent: 10 }],
      }).success,
    ).toBe(false);
    expect(
      NamedActorRandomizedEstablishmentSchema.safeParse({ ...input, causes: [] }).success,
    ).toBe(false);
    expect(
      NamedActorRandomizedEstablishmentSchema.safeParse({
        ...input,
        causes: [input.causes[0], input.causes[0]],
      }).success,
    ).toBe(false);
  });

  it("the stable draw key of a slot has exactly the four CDK-01 dimensions and nothing incidental", () => {
    const key = namedActorCapabilityDrawKey("a1", "c1");
    expect(Object.keys(key).sort()).toEqual([
      "causal_process_id",
      "opportunity_id",
      "owner_operation",
      "prospective_result_id",
    ]);
    expect(key.prospective_result_id).toBe(actorCapabilityBasisKey("a1", "c1"));
    expect(key.owner_operation).toEqual({
      owner: "named_actor",
      operation: NAMED_ACTOR_OPERATION_ESTABLISH_CAPABILITY_BASIS,
    });
    expect(namedActorCapabilityDrawKey("a1", "c1")).toEqual(key);
    expect(namedActorCapabilityDrawKey("a1", "c2")).not.toEqual(key);
    expect(namedActorCapabilityDrawKey("a2", "c1")).not.toEqual(key);
    expect(JSON.stringify(key)).not.toMatch(/retry|request|attempt|horizon|model|provider|clock/i);
  });

  it("a candidate id is the canonical encoding of one lawful marker — C, B, A, S, EX with its descriptor, or ungraded — and of nothing else", () => {
    for (const marker of [...CAPABILITY_GRADES, { ex: "descriptor" }, null] as const) {
      const id = capabilityCandidateId(marker);
      expect(parseCapabilityCandidateId(id)).toEqual({ marker });
      expect(capabilityCandidateId(marker)).toBe(id);
    }
    const ids = [...CAPABILITY_GRADES, { ex: "S" }, null].map((m) => capabilityCandidateId(m));
    expect(new Set(ids).size).toBe(ids.length);
    // EX is not S+: an EX candidate never reads as a grade
    expect(parseCapabilityCandidateId(capabilityCandidateId({ ex: "S" }))).toEqual({
      marker: { ex: "S" },
    });
  });

  it("a basis needs at least one pinned cause, cites each once, and a cause carries a reference — never a copied value", () => {
    const e = basis().establishment;
    expect(
      NamedActorCapabilityBasisSchema.safeParse(basis({ establishment: { ...e, causes: [] } }))
        .success,
    ).toBe(false);
    expect(
      NamedActorCapabilityBasisSchema.safeParse(
        basis({ establishment: { ...e, causes: [e.causes[0], e.causes[0]] } }),
      ).success,
    ).toBe(false);
    const c = e.causes[0]!;
    expect(CAPABILITY_CAUSE_ASPECTS).toContain(c.aspect);
    for (const bad of [
      { ...c, version: 0 },
      { ...c, version: -1 },
      { ...c, version: 1.5 },
      { ...c, aspect: "NARRATIVE_NEED" },
      { ...c, value: "copied" },
      { ...c, grade: "S" },
      { ...c, fact_key: "" },
      { ...c, owner: "" },
    ])
      expect(
        NamedActorCapabilityBasisSchema.safeParse(basis({ establishment: { ...e, causes: [bad] } }))
          .success,
        JSON.stringify(bad),
      ).toBe(false);
  });

  it("refuses malformed identities: an actor or capability identity is an embeddable opaque identifier", () => {
    for (const bad of ["", " a", "a ", "a/b", "a\nb", "-a", "a b"]) {
      expect(NamedActorCapabilityBasisSchema.safeParse(basis({ actor_id: bad })).success, bad).toBe(
        false,
      );
      expect(
        NamedActorCapabilityBasisSchema.safeParse(basis({ capability_id: bad })).success,
        bad,
      ).toBe(false);
    }
  });
});

describe("the persisted capability is the minimal record (acceptance 2, 4)", () => {
  it("carries exactly the actor, the capability, the marker, a pinned basis pointer and the capability-close reference", () => {
    const c = capability();
    expect(NamedActorCapabilitySchema.parse(c)).toEqual(c);
    expect(Object.keys(c).sort()).toEqual([
      "actor_id",
      "basis",
      "capability_id",
      "close",
      "marker",
    ]);
    expect(c.close.name).toBe(ACTOR_PROFILE_CAPABILITY_CLOSE);
    expect(c.basis).toEqual({ fact_key: actorCapabilityBasisKey("a1", "c1"), version: 1 });
  });

  it("holds no copy of any foreign or temporary state and no number", () => {
    for (const extra of [
      "level",
      "xp",
      "value",
      "equipment",
      "injury",
      "fatigue",
      "office",
      "kti",
      "reputation",
      "belief",
      "cohort_id",
      "headcount",
      "body_id",
      "scope",
      "constraints",
      "causes",
      "materiality",
      "effectiveness",
    ])
      expect(NamedActorCapabilitySchema.safeParse(capability({ [extra]: 1 })).success, extra).toBe(
        false,
      );
  });

  it("the close reference is the actor owner's declared close, never another name, and its stage is a strict StageKey", () => {
    const c = capability();
    expect(
      NamedActorCapabilitySchema.safeParse({ ...c, close: { ...c.close, name: "now" } }).success,
    ).toBe(false);
    expect(
      NamedActorCapabilitySchema.safeParse({ ...c, close: { name: c.close.name } }).success,
    ).toBe(false);
    expect(
      NamedActorCapabilitySchema.safeParse({
        ...c,
        close: { ...c.close, stage: { ...c.close.stage, retry: 1 } },
      }).success,
    ).toBe(false);
    expect(NamedActorCapabilitySchema.safeParse({ ...c, close: undefined }).success).toBe(false);
    expect(
      NamedActorCapabilitySchema.safeParse({
        ...c,
        basis: { fact_key: c.basis.fact_key, version: 0 },
      }).success,
    ).toBe(false);
  });
});

describe("keys and stage identity are derived from the actor and capability alone (acceptance 8)", () => {
  it("the two key spaces are disjoint, actor-keyed and capability-keyed", () => {
    expect(actorCapabilityBasisKey("a1", "c1")).toBe("actor/a1/capability-basis/c1");
    expect(actorCapabilityKey("a1", "c1")).toBe("actor/a1/capability/c1");
    expect(actorCapabilityKey("a1", "c1")).not.toBe(actorCapabilityBasisKey("a1", "c1"));
    expect(historyKey("a1")).not.toMatch(/^actor\//);
  });

  it("the close stage is a valid StageKey whose identity has no horizon, version, retry, consumer or slice dimension", () => {
    const stage = actorCapabilityStage("a1", "c1");
    const parsed = parseStageKey(stage);
    expect(parsed.ok).toBe(true);
    expect(Object.keys(stage).sort()).toEqual([
      "causal_process_id",
      "owner_operation",
      "prospective_result_id",
    ]);
    expect(stage.owner_operation.owner).toBe("named_actor");
    expect(stage.prospective_result_id).toBe(actorCapabilityKey("a1", "c1"));
    // identical for the same actor/capability however many times, and distinct per actor and per capability
    expect(actorCapabilityStage("a1", "c1")).toEqual(stage);
    expect(actorCapabilityStage("a2", "c1")).not.toEqual(stage);
    expect(actorCapabilityStage("a1", "c2")).not.toEqual(stage);
    // identifiers cannot contain the key separator, so two (actor, capability) pairs never share a stage
    expect(actorCapabilityStage("x:y", "z")).not.toEqual(actorCapabilityStage("x", "y:z"));
    for (const dim of ["horizon", "source_version", "retry_count", "execution_slice", "consumer"])
      expect(parseStageKey({ ...stage, [dim]: 1 }).ok, dim).toBe(false);
  });
});
