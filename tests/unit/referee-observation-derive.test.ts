/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary invalid answers */
// The deterministic mechanism of the direct-perception referee question (BLUE v5.2): it understands no language. These tests give it
// hand-written answers and check that it validates coverage, quotations and the KIND of premise that may establish each element, and
// DERIVES the verdict itself. They say nothing about whether any model reads any sentence correctly: the semantic positive and negative
// are the real-host exercise (docs/evidence), never these.
import { describe, expect, it } from "vitest";
import type { ObservationHostDecision } from "@immortalis/contracts";
import {
  deriveObservation,
  observationVerdictOf,
  refereeTaskId,
  type ObservationContext,
} from "@immortalis/engine";

const ctx: ObservationContext = {
  operation: "F014D_DIRECT_PERCEPTION",
  campaign_id: "c1",
  attempt: 0,
  subject: { pc_id: "pc-1", world_id: "w1", locus_id: "l1" },
  observed_at: { unit: "u", value: 7 },
  statement:
    "I am originally present in the hall, seated on the bench, facing the far wall, eyes open.",
  pc: [
    {
      item_id: "mirror/embodiment/aaaaaaaaaaaa",
      slot: "embodiment",
      text: "One body with keen sight",
    },
    { item_id: "mirror/identity/bbbbbbbbbbbb", slot: "identity", text: "Maren, a salt-raker" },
  ],
  facts: [
    { fact_id: "world.premise", from: "world", label: "world premise", text: "A quiet hall." },
    {
      fact_id: "locus.constraint.1",
      from: "locus",
      label: "locus constraint (surface)",
      text: "surface: The far wall carries one broad green stripe.",
    },
    {
      fact_id: "locus.constraint.2",
      from: "locus",
      label: "locus constraint (air)",
      text: "air: The air in the hall is clear.",
    },
    {
      fact_id: "locus.constraint.3",
      from: "locus",
      label: "locus constraint (curtain)",
      text: "curtain: A solid curtain hangs across the whole hall.",
    },
  ],
  refs: [
    { fact_key: "pc/pc-1/existence-contract", version: 1, group_id: "g1" },
    { fact_key: "role-registry/binding/role.player_character", version: 1, group_id: "g2" },
    { fact_key: "world-state/pc/pc-1/locus-custody", version: 1, group_id: "g3" },
    { fact_key: "world/w1/profile", version: 1, group_id: "g4" },
    { fact_key: "world/w1/locus/l1", version: 1, group_id: "g5" },
  ],
};
const taskId = refereeTaskId(ctx);

const faculty = {
  state: "ESTABLISHED",
  premises: [
    { from: "PC_STATEMENT", ref: "mirror/embodiment/aaaaaaaaaaaa", evidence_quote: "keen sight" },
  ],
  rule_ids: ["F014D-6"],
  grounds: "the character's own statement",
};
const position = {
  state: "ESTABLISHED",
  premises: [
    {
      from: "PLACEMENT_STATEMENT",
      ref: "placement.statement",
      evidence_quote: "seated on the bench, facing the far wall, eyes open",
    },
  ],
  rule_ids: ["F014D-6"],
  grounds: "the placement statement",
};
const open = {
  state: "OPEN",
  premises: [
    {
      from: "WORLD_FACT",
      ref: "locus.constraint.2",
      evidence_quote: "The air in the hall is clear",
    },
  ],
  rule_ids: ["F014D-6"],
  grounds: "clear air",
};
const blocked = {
  state: "BLOCKED",
  premises: [
    {
      from: "WORLD_FACT",
      ref: "locus.constraint.3",
      evidence_quote: "A solid curtain hangs across the whole hall",
    },
  ],
  rule_ids: ["F014D-6"],
  grounds: "a curtain across the hall",
};
const payload = {
  source_fact_id: "locus.constraint.1",
  referent: "a stripe on the far wall",
  content: "one broad green stripe on the wall",
  basis: [
    { from: "WORLD_FACT", ref: "locus.constraint.1", evidence_quote: "one broad green stripe" },
  ],
};
const assessments = (over: Record<string, any> = {}): any[] =>
  ctx.facts.map((f) => ({
    fact_id: f.fact_id,
    relation: "NOT_RELEVANT",
    rule_ids: ["IR-7"],
    grounds: "-",
    evidence_quote: null,
    ...(over[f.fact_id] ?? {}),
  }));

const base = (): any => ({
  task_id: taskId,
  faculty: structuredClone(faculty),
  position: structuredClone(position),
  path: structuredClone(open),
  payload: structuredClone(payload),
  assessments: assessments(),
  unresolved_forks: [],
});
const derive = (over: (a: any) => void = () => undefined) => {
  const a = base();
  over(a);
  return deriveObservation(ctx, a as ObservationHostDecision);
};
const refusal = (over: (a: any) => void) => {
  const d = derive(over);
  return d.ok ? null : d.refusal.code;
};
const verdict = (over: (a: any) => void) => {
  const d = derive(over);
  return d.ok ? d.verdict : `REFUSED ${d.refusal.code}`;
};

describe("the verdict is derived from the answer alone", () => {
  it("a fully and affirmatively answered question is the only receipt", () => {
    expect(derive()).toEqual({ ok: true, verdict: "OBSERVATION_ESTABLISHED" });
  });

  it("an established blocked path from an established viewing position is the physical negative", () => {
    expect(
      verdict((a) => {
        a.path = structuredClone(blocked);
        a.payload = null;
      }),
    ).toBe("OBSERVATION_OBSTRUCTED");
  });

  it("a missing faculty is UNRESOLVED, never an obstruction (and so is every unsettled premise)", () => {
    for (const [name, over] of Object.entries({
      "no faculty": (a: any) => {
        a.faculty = { ...a.faculty, state: "NOT_ESTABLISHED", premises: [] };
        a.payload = null;
      },
      "no position": (a: any) => {
        a.position = { ...a.position, state: "NOT_ESTABLISHED", premises: [] };
        a.payload = null;
      },
      "path not established": (a: any) => {
        a.path = { ...a.path, state: "NOT_ESTABLISHED", premises: [] };
        a.payload = null;
      },
      "an unclear fact": (a: any) => {
        a.assessments = assessments({ "locus.constraint.2": { relation: "UNCLEAR" } });
        a.payload = null;
      },
      "no appearance stated": (a: any) => {
        a.payload = null;
      },
    }))
      expect(verdict(over), name).toBe("OBSERVATION_UNRESOLVED");
  });

  it("a blocked path is NOT proof of obstruction when the viewing position is not established", () => {
    expect(
      verdict((a) => {
        a.path = structuredClone(blocked);
        a.position = { ...a.position, state: "NOT_ESTABLISHED", premises: [] };
        a.payload = null;
      }),
    ).toBe("OBSERVATION_UNRESOLVED");
  });

  it("a contradicted world fact is a conflict whatever else is answered", () => {
    expect(
      verdict((a) => {
        a.assessments = assessments({
          "locus.constraint.2": {
            relation: "CONTRADICTS",
            evidence_quote: "The air in the hall is clear",
          },
        });
        a.payload = null;
      }),
    ).toBe("OBSERVATION_WORLD_CONFLICT");
  });

  it("is re-derivable from the answer alone", () => {
    expect(observationVerdictOf(base())).toBe("OBSERVATION_ESTABLISHED");
    expect(observationVerdictOf({ ...base(), payload: null })).toBe("OBSERVATION_UNRESOLVED");
  });
});

describe("every claim is anchored to delivered text of the kind of premise that may establish it", () => {
  it("refuses an answer for another task", () => {
    expect(refusal((a) => (a.task_id = "f".repeat(64)))).toBe("TASK_MISMATCH");
  });

  it("refuses a quotation that is not in the premise it cites, and a premise that was not delivered", () => {
    expect(refusal((a) => (a.faculty.premises[0].evidence_quote = "perfect sight"))).toBe(
      "GROUNDS_UNSUPPORTED",
    );
    expect(refusal((a) => (a.path.premises[0].ref = "locus.constraint.9"))).toBe(
      "COVERAGE_INCOMPLETE",
    );
    expect(refusal((a) => (a.faculty.premises[0].ref = "mirror/embodiment/zzzzzzzzzzzz"))).toBe(
      "COVERAGE_INCOMPLETE",
    );
    expect(refusal((a) => (a.position.premises[0].ref = "somewhere.else"))).toBe(
      "COVERAGE_INCOMPLETE",
    );
  });

  it("the faculty rests only on the character's own statements: not on the world, and not on the placement", () => {
    expect(
      refusal((a) => {
        a.faculty.premises = [
          { from: "WORLD_FACT", ref: "world.premise", evidence_quote: "A quiet hall" },
        ];
      }),
    ).toBe("DECISION_INCOHERENT");
    expect(
      refusal((a) => {
        a.faculty.premises = [
          { from: "PLACEMENT_STATEMENT", ref: "placement.statement", evidence_quote: "eyes open" },
        ];
      }),
    ).toBe("DECISION_INCOHERENT");
  });

  it("the viewing circumstances never rest on the character's intrinsic statements, and a shared locus alone does not establish them", () => {
    expect(
      refusal((a) => {
        a.position.premises = [
          {
            from: "PC_STATEMENT",
            ref: "mirror/identity/bbbbbbbbbbbb",
            evidence_quote: "salt-raker",
          },
        ];
      }),
    ).toBe("DECISION_INCOHERENT");
    expect(
      refusal((a) => {
        a.position.premises = [
          {
            from: "WORLD_FACT",
            ref: "locus.constraint.2",
            evidence_quote: "The air in the hall is clear",
          },
        ];
      }),
    ).toBe("GROUNDS_UNSUPPORTED");
  });

  it("the path and the appearance rest only on committed world facts", () => {
    expect(
      refusal((a) => {
        a.path.premises = [
          {
            from: "PLACEMENT_STATEMENT",
            ref: "placement.statement",
            evidence_quote: "facing the far wall",
          },
        ];
      }),
    ).toBe("DECISION_INCOHERENT");
    expect(
      refusal((a) => {
        a.payload.basis = [
          {
            from: "PC_STATEMENT",
            ref: "mirror/embodiment/aaaaaaaaaaaa",
            evidence_quote: "keen sight",
          },
        ];
      }),
    ).toBe("DECISION_INCOHERENT");
  });

  it("an established element is established by at least one quoted premise", () => {
    expect(refusal((a) => (a.faculty.premises = []))).toBe("GROUNDS_UNSUPPORTED");
    expect(refusal((a) => (a.position.premises = []))).toBe("GROUNDS_UNSUPPORTED");
    expect(refusal((a) => (a.path.premises = []))).toBe("GROUNDS_UNSUPPORTED");
    expect(
      refusal((a) => {
        a.path = { ...structuredClone(blocked), premises: [] };
        a.payload = null;
      }),
    ).toBe("GROUNDS_UNSUPPORTED");
  });

  it("every delivered fact is assessed exactly once, and SUPPORTS/CONTRADICTS are quoted", () => {
    expect(refusal((a) => a.assessments.pop())).toBe("COVERAGE_INCOMPLETE");
    expect(refusal((a) => a.assessments.push({ ...a.assessments[0] }))).toBe("COVERAGE_INCOMPLETE");
    expect(refusal((a) => (a.assessments[1] = { ...a.assessments[1], relation: "SUPPORTS" }))).toBe(
      "GROUNDS_UNSUPPORTED",
    );
    expect(
      refusal((a) => (a.assessments[0] = { ...a.assessments[0], fact_id: "locus.constraint.9" })),
    ).toBe("COVERAGE_INCOMPLETE");
  });
});

describe("an appearance exists only when the whole question is affirmatively answered, and is raw", () => {
  it("is refused beside any answer that is not an affirmative one", () => {
    for (const over of [
      (a: any) => (a.faculty = { ...a.faculty, state: "NOT_ESTABLISHED", premises: [] }),
      (a: any) => (a.position = { ...a.position, state: "NOT_ESTABLISHED", premises: [] }),
      (a: any) => (a.path = structuredClone(blocked)),
      (a: any) => (a.path = { ...a.path, state: "NOT_ESTABLISHED", premises: [] }),
      (a: any) => (a.assessments = assessments({ "locus.constraint.2": { relation: "UNCLEAR" } })),
    ])
      expect(refusal(over)).toBe("DECISION_INCOHERENT");
  });

  it("names a delivered source fact and is anchored to a quotation of that very fact", () => {
    expect(refusal((a) => (a.payload.source_fact_id = "locus.constraint.9"))).toBe(
      "COVERAGE_INCOMPLETE",
    );
    expect(
      refusal((a) => {
        a.payload.basis = [
          {
            from: "WORLD_FACT",
            ref: "locus.constraint.2",
            evidence_quote: "The air in the hall is clear",
          },
        ];
      }),
    ).toBe("GROUNDS_UNSUPPORTED");
  });

  it("carries no engine reference: no fact identifier, key or identity", () => {
    for (const leak of [
      "locus.constraint.1",
      "world/w1/locus/l1",
      "world.premise",
      "pc-1",
      "w1",
      "l1",
    ]) {
      expect(
        refusal((a) => (a.payload.referent = `a stripe ${leak}`)),
        leak,
      ).toBe("GROUNDS_UNSUPPORTED");
      expect(
        refusal((a) => (a.payload.content = `green ${leak}`)),
        leak,
      ).toBe("GROUNDS_UNSUPPORTED");
    }
  });

  it("the schema has no field for recognition, function, place name, belief, memory or time", async () => {
    const { ObservationHostDecisionSchema, ObservationPayloadSchema } =
      await import("@immortalis/contracts");
    for (const extra of [
      "recognition",
      "function",
      "place_name",
      "belief",
      "memory",
      "elapsed",
      "verdict",
    ]) {
      expect(
        ObservationHostDecisionSchema.safeParse({ ...base(), [extra]: "x" }).success,
        extra,
      ).toBe(false);
      expect(ObservationPayloadSchema.safeParse({ ...payload, [extra]: "x" }).success, extra).toBe(
        false,
      );
    }
  });
});
