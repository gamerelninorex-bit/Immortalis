/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary invalid values */
// BLUE v5.2-A1 — the NON-PC Named-Actor direct-perception contract. It is a FIFTH referee operation with its own literal, subject, premise
// kinds and decision shape: the PC operation `F014D_DIRECT_PERCEPTION` and its `pc_id` subject are neither widened nor passed an actor, and no
// actor record can be read as a PC one (or the reverse). Every schema is strict, which is also the structural half of the exclusions: the
// decision has no field for a verdict, an admission bit, a role, comprehension, belief, stance, a goal or an action.
import { describe, expect, it } from "vitest";
import {
  ACTOR_OBSERVATION_CAPABILITY_REF,
  ACTOR_OBSERVATION_COUPLING_REF,
  ACTOR_OBSERVATION_PREMISE_KINDS,
  ACTOR_OBSERVATION_REFS,
  ACTOR_OBSERVATION_SOURCE_INDEX,
  ActorObservationHostDecisionSchema,
  ActorObservationPremiseSchema,
  OBSERVATION_BASE_REFS,
  OBSERVATION_PREMISE_KINDS,
  OBSERVATION_VERDICTS,
  ObservationHostDecisionSchema,
  REFEREE_OP_ACTOR_OBSERVATION,
  REFEREE_OP_OBSERVATION,
  RefereeDecisionRecordSchema,
  RefereeOperationSchema,
  RefereeVerdictSchema,
} from "@immortalis/contracts";

const task = "a".repeat(64);
const element = (state: string, premises: unknown[] = []) => ({
  state,
  premises,
  rule_ids: ["F014D-6"],
  grounds: "why",
});
const assessment = {
  fact_id: "locus.designation",
  relation: "NOT_RELEVANT",
  rule_ids: ["IR-7"],
  grounds: "g",
  evidence_quote: null,
};
const decision = (): any => ({
  task_id: task,
  faculty: element("ESTABLISHED", [
    { from: "ACTOR_CAPABILITY", ref: "actor.capability", evidence_quote: "keen-sight" },
  ]),
  position: element("ESTABLISHED", [
    { from: "COUPLING_STATEMENT", ref: "coupling.statement", evidence_quote: "coupled" },
  ]),
  path: element("OPEN", [
    { from: "WORLD_FACT", ref: "locus.constraint.1", evidence_quote: "bare" },
  ]),
  payload: {
    source_fact_id: "source.access.1",
    referent: "a heap",
    content: "a low heap",
    basis: [{ from: "WORLD_FACT", ref: "source.access.1", evidence_quote: "bare" }],
  },
  assessments: [assessment],
  unresolved_forks: [],
});
const digest = "b".repeat(64);
const record = (over: Record<string, unknown> = {}): any => ({
  record_version: 1,
  task_id: task,
  campaign_id: "campaign-1",
  attempt: 0,
  authority: { role: "role.gm", permission: "permission.rule.adjudicate" },
  host: { host_id: "host-1", claimed_model: null },
  subject: { actor_id: "actor-1" },
  input: {
    digest,
    candidate_digest: null,
    candidate: null,
    statement_digest: digest,
    statement:
      "The World-State owner records this actor as currently coupled to this locus of this world.",
    refs: [],
    observed_at: { unit: "u", value: 1 },
  },
  validated_under: { role: "role.resolver", permission: "permission.resolution.execute" },
  operation: REFEREE_OP_ACTOR_OBSERVATION,
  decision: decision(),
  verdict: "OBSERVATION_ESTABLISHED",
  ...over,
});
const parses = (v: unknown) => RefereeDecisionRecordSchema.safeParse(v).success;

describe("the actor direct-perception operation is a fifth, separate operation", () => {
  it("has its own literal beside the four, and the PC operation is unchanged", () => {
    expect(REFEREE_OP_ACTOR_OBSERVATION).toBe("F014D_ACTOR_DIRECT_PERCEPTION");
    expect(REFEREE_OP_OBSERVATION).toBe("F014D_DIRECT_PERCEPTION");
    expect(RefereeOperationSchema.options).toEqual([
      "I002_CLASSIFY",
      "IR_NATIVE_COMPATIBILITY",
      "IR_PHYSICAL_PLACEMENT",
      "F014D_DIRECT_PERCEPTION",
      "F014D_ACTOR_DIRECT_PERCEPTION",
    ]);
  });

  it("reuses the direct-perception verdicts and invents none: only an established reading can be a receipt", () => {
    expect(OBSERVATION_VERDICTS).toEqual([
      "OBSERVATION_ESTABLISHED",
      "OBSERVATION_OBSTRUCTED",
      "OBSERVATION_UNRESOLVED",
      "OBSERVATION_WORLD_CONFLICT",
    ]);
    for (const v of OBSERVATION_VERDICTS)
      expect(RefereeVerdictSchema.safeParse(v).success).toBe(true);
  });

  it("fixes the five cited facts and the source's place among them, leaving the PC question's six unchanged", () => {
    expect(ACTOR_OBSERVATION_REFS).toBe(5);
    expect(ACTOR_OBSERVATION_SOURCE_INDEX).toBe(4);
    expect(OBSERVATION_BASE_REFS).toBe(5);
    expect(ACTOR_OBSERVATION_COUPLING_REF).toBe("coupling.statement");
    expect(ACTOR_OBSERVATION_CAPABILITY_REF).toBe("actor.capability");
  });
});

describe("the premise kinds are the actor's own and are not the PC's", () => {
  it("are exactly the capability, the coupling statement and a world fact", () => {
    expect(ACTOR_OBSERVATION_PREMISE_KINDS).toEqual([
      "ACTOR_CAPABILITY",
      "COUPLING_STATEMENT",
      "WORLD_FACT",
    ]);
    expect(OBSERVATION_PREMISE_KINDS).toEqual([
      "PC_STATEMENT",
      "PLACEMENT_STATEMENT",
      "WORLD_FACT",
    ]);
  });

  it("an actor premise cannot be a PC kind, nor a PC premise an actor kind", () => {
    const quote = { ref: "x", evidence_quote: "q" };
    for (const from of ["PC_STATEMENT", "PLACEMENT_STATEMENT", "ACTOR", "capability"])
      expect(ActorObservationPremiseSchema.safeParse({ from, ...quote }).success, from).toBe(false);
    const pc: any = {
      ...decision(),
      faculty: element("ESTABLISHED", [{ from: "ACTOR_CAPABILITY", ...quote }]),
    };
    expect(ObservationHostDecisionSchema.safeParse(pc).success).toBe(false);
    expect(ActorObservationHostDecisionSchema.safeParse(decision()).success).toBe(true);
  });
});

describe("the actor decision is strict: it has no field for a verdict, a role, an admission, comprehension, belief or action", () => {
  it("accepts the established shape and nothing added", () => {
    expect(ActorObservationHostDecisionSchema.safeParse(decision()).success).toBe(true);
    for (const extra of [
      { verdict: "OBSERVATION_ESTABLISHED" },
      { admitted: true },
      { role: "role.gm" },
      { permission: "permission.rule.adjudicate" },
      { comprehension: "it is salt" },
      { belief: "it is valuable" },
      { stance: "wary" },
      { goal: "take it" },
      { action: "walk to it" },
    ])
      expect(
        ActorObservationHostDecisionSchema.safeParse({ ...decision(), ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
  });

  it("closes each element's vocabulary and the payload's shape", () => {
    const bad: ((d: any) => void)[] = [
      (d) => (d.faculty.state = "MAYBE"),
      (d) => (d.position.state = "BLOCKED"),
      (d) => (d.path.state = "ESTABLISHED"),
      (d) => (d.payload.recognized_as = "salt"),
      (d) => (d.payload.content = " padded "),
      (d) => (d.payload.content = ""),
      (d) => (d.payload.basis = []),
      (d) => (d.faculty.premises = new Array(9).fill(d.faculty.premises[0])),
      (d) => (d.task_id = "not a task"),
      (d) => (d.assessments = []),
    ];
    for (const mutate of bad) {
      const d = decision();
      mutate(d);
      expect(ActorObservationHostDecisionSchema.safeParse(d).success).toBe(false);
    }
    expect(
      ActorObservationHostDecisionSchema.safeParse({ ...decision(), payload: null }).success,
    ).toBe(true);
  });
});

describe("the retained record has an actor subject and cannot be read as a PC record, or the reverse", () => {
  it("accepts the actor record and requires its subject, resolver context and observation basis", () => {
    expect(parses(record())).toBe(true);
    for (const mutate of [
      (r: any) => delete r.validated_under,
      (r: any) => delete r.input.observed_at,
      (r: any) => (r.validated_under.role = "role.gm"),
      (r: any) => (r.verdict = "BIND_ELIGIBLE"),
      (r: any) => (r.subject = {}),
    ]) {
      const r = record();
      mutate(r);
      expect(parses(r)).toBe(false);
    }
  });

  it("refuses an actor operation with a PC subject, and a PC operation with an actor subject", () => {
    expect(parses(record({ subject: { pc_id: "actor-1" } }))).toBe(false);
    expect(parses(record({ subject: { actor_id: "actor-1", pc_id: "pc-1" } }))).toBe(false);
    const pcDecision: any = {
      task_id: task,
      faculty: element("ESTABLISHED", [{ from: "PC_STATEMENT", ref: "x", evidence_quote: "q" }]),
      position: element("NOT_ESTABLISHED"),
      path: element("NOT_ESTABLISHED"),
      payload: null,
      assessments: [assessment],
      unresolved_forks: [],
    };
    const pcRecord = record({
      operation: REFEREE_OP_OBSERVATION,
      subject: { pc_id: "pc-1" },
      decision: pcDecision,
      verdict: "OBSERVATION_UNRESOLVED",
    });
    expect(parses(pcRecord)).toBe(true);
    expect(parses({ ...pcRecord, subject: { actor_id: "actor-1" } })).toBe(false);
    // the PC record's decision cannot be the actor's, nor the actor record's the PC's
    expect(parses({ ...pcRecord, decision: decision() })).toBe(false);
    expect(parses(record({ decision: pcDecision }))).toBe(false);
  });

  it("an actor record carries no candidate, and the I-002 and IR shapes never accept an actor subject", () => {
    expect(parses(record({ operation: "I002_CLASSIFY" }))).toBe(false);
    expect(parses(record({ operation: "IR_NATIVE_COMPATIBILITY" }))).toBe(false);
    expect(parses(record({ operation: "IR_PHYSICAL_PLACEMENT" }))).toBe(false);
  });
});
