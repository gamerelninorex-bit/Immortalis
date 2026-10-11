/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary invalid answers */
// The deterministic mechanism of the physical-placement referee question: it understands no language. These tests give it hand-written
// answers and check that it validates coverage, quotations and coherence and DERIVES the verdict itself. They say nothing about whether
// any model reads any sentence correctly (the live exercise is separate).
import { describe, expect, it } from "vitest";
import type { PhysicalHostDecision } from "@immortalis/contracts";
import {
  derivePhysical,
  physicalVerdictOf,
  refereeTaskId,
  type PhysicalContext,
} from "@immortalis/engine";

const ctx: PhysicalContext = {
  operation: "IR_PHYSICAL_PLACEMENT",
  campaign_id: "c1",
  attempt: 0,
  subject: { pc_id: "pc-1", world_id: "w1", locus_id: "l1" },
  statement: "I have always lived here, at the salt pans.",
  pc: [
    {
      item_id: "mirror/embodiment/aaaaaaaaaaaa",
      slot: "embodiment",
      text: "One ordinary human body",
    },
    { item_id: "mirror/identity/bbbbbbbbbbbb", slot: "identity", text: "Maren, a salt-raker" },
  ],
  facts: [
    {
      fact_id: "world.premise",
      from: "world",
      label: "world premise",
      text: "A quiet salt marsh.",
    },
    { fact_id: "locus.designation", from: "locus", label: "locus", text: "The salt pans" },
  ],
  refs: [],
};
const taskId = refereeTaskId(ctx);

const base = (): any => ({
  task_id: taskId,
  embodiment: {
    mode: "SINGLE_MATERIAL_BODY",
    item_id: "mirror/embodiment/aaaaaaaaaaaa",
    rule_ids: ["I002-4.3"],
    grounds: "one body",
    evidence_quote: "ordinary human body",
  },
  presence: {
    mode: "NATIVE_AT_THIS_LOCUS",
    rule_ids: ["IR-7"],
    grounds: "native at the pans",
    evidence_quote: "at the salt pans",
  },
  external_claims: [],
  assessments: [
    {
      fact_id: "world.premise",
      relation: "NOT_RELEVANT",
      rule_ids: ["IR-7"],
      grounds: "-",
      evidence_quote: null,
    },
    {
      fact_id: "locus.designation",
      relation: "SUPPORTS",
      rule_ids: ["IR-7"],
      grounds: "the pans",
      evidence_quote: "salt pans",
    },
  ],
  clarification: null,
});
const derive = (over: (a: any) => void = () => undefined) => {
  const a = base();
  over(a);
  return derivePhysical(ctx, a as PhysicalHostDecision);
};
const refusal = (over: (a: any) => void) => {
  const d = derive(over);
  return d.ok ? null : d.refusal.code;
};

describe("the verdict is derived from the answer alone", () => {
  it("is eligible only for one material body, natively at this locus, with no external dependency and no contradicted or unclear fact", () => {
    expect(derive()).toEqual({ ok: true, verdict: "PHYSICAL_ELIGIBLE" });
  });

  it("every other definite reading of the form is NOT_PHYSICAL_SINGLE_LOCUS", () => {
    for (const mode of [
      "SEVERAL_SAME_AGENCY_BODIES",
      "HOST_DEPENDENT",
      "DISTRIBUTED_SUBSTRATE",
      "INCORPOREAL",
      "NO_CURRENT_BODY",
      "TOTAL_DOMAIN_COEXTENSIVE",
    ])
      expect(
        physicalVerdictOf({ ...base(), embodiment: { ...base().embodiment, mode } }),
        mode,
      ).toBe("NOT_PHYSICAL_SINGLE_LOCUS");
  });

  it("every other definite reading of the presence is NOT_PHYSICAL_SINGLE_LOCUS", () => {
    for (const mode of ["ELSEWHERE", "SEVERAL_LOCI", "NON_SPATIAL", "BRIDGE_OR_ARRIVAL"])
      expect(physicalVerdictOf({ ...base(), presence: { ...base().presence, mode } }), mode).toBe(
        "NOT_PHYSICAL_SINGLE_LOCUS",
      );
  });

  it("a claim the presence is CONTINGENT on (an independent actor, an external right or any other external claim) is NOT_PHYSICAL_SINGLE_LOCUS", () => {
    for (const kind of [
      "INDEPENDENT_ACTOR_COOPERATION",
      "EXTERNAL_RIGHT_OR_ACCESS",
      "OTHER_EXTERNAL_CLAIM",
    ])
      expect(
        physicalVerdictOf({
          ...base(),
          external_claims: [
            {
              kind,
              bearing: "CONTINGENT",
              rule_ids: ["IR-12"],
              grounds: "-",
              evidence_quote: "salt pans",
            },
          ],
        }),
        kind,
      ).toBe("NOT_PHYSICAL_SINGLE_LOCUS");
  });

  it("a CONJUNCTIVE claim, stated beside a presence the player's own words establish, does not change the verdict (and is accepted into nothing)", () => {
    for (const kind of [
      "INDEPENDENT_ACTOR_COOPERATION",
      "EXTERNAL_RIGHT_OR_ACCESS",
      "OTHER_EXTERNAL_CLAIM",
    ])
      expect(
        physicalVerdictOf({
          ...base(),
          external_claims: [
            {
              kind,
              bearing: "CONJUNCTIVE",
              rule_ids: ["IR-12"],
              grounds: "-",
              evidence_quote: "x",
            },
          ],
        }),
        kind,
      ).toBe("PHYSICAL_ELIGIBLE");
  });

  it("one contingent claim among conjunctive ones still refuses; a conjunctive claim never outranks a definite non-physical reading", () => {
    const claim = (bearing: string): any => ({
      kind: "INDEPENDENT_ACTOR_COOPERATION",
      bearing,
      rule_ids: ["IR-12"],
      grounds: "-",
      evidence_quote: "x",
    });
    expect(
      physicalVerdictOf({
        ...base(),
        external_claims: [claim("CONJUNCTIVE"), claim("CONTINGENT")],
      }),
    ).toBe("NOT_PHYSICAL_SINGLE_LOCUS");
    const incorporeal = base();
    incorporeal.embodiment.mode = "INCORPOREAL";
    incorporeal.external_claims = [claim("CONJUNCTIVE")];
    expect(physicalVerdictOf(incorporeal)).toBe("NOT_PHYSICAL_SINGLE_LOCUS");
  });

  it("a contradicted fact is a world conflict, an ambiguous reading or unclear fact is unresolved; a definite non-physical reading outranks both", () => {
    const contradicts = base();
    contradicts.assessments[0] = {
      ...contradicts.assessments[0],
      relation: "CONTRADICTS",
      evidence_quote: "salt",
    };
    expect(physicalVerdictOf(contradicts)).toBe("PHYSICAL_WORLD_CONFLICT");
    for (const edit of [
      (a: any) => (a.embodiment.mode = "AMBIGUOUS"),
      (a: any) => (a.presence.mode = "AMBIGUOUS"),
      (a: any) => (a.assessments[0].relation = "UNCLEAR"),
    ]) {
      const a = base();
      edit(a);
      expect(physicalVerdictOf(a)).toBe("PHYSICAL_UNRESOLVED");
    }
    const both = base();
    both.embodiment.mode = "INCORPOREAL";
    both.assessments[0] = {
      ...both.assessments[0],
      relation: "CONTRADICTS",
      evidence_quote: "salt",
    };
    expect(physicalVerdictOf(both)).toBe("NOT_PHYSICAL_SINGLE_LOCUS");
    const contradictedAndAmbiguous = base();
    contradictedAndAmbiguous.embodiment.mode = "AMBIGUOUS";
    contradictedAndAmbiguous.assessments[0] = {
      ...contradictedAndAmbiguous.assessments[0],
      relation: "CONTRADICTS",
      evidence_quote: "salt",
    };
    expect(physicalVerdictOf(contradictedAndAmbiguous)).toBe("PHYSICAL_WORLD_CONFLICT");
  });
});

describe("the answer is validated against exactly what was delivered", () => {
  it("is refused for another task", () => {
    expect(refusal((a) => (a.task_id = "f".repeat(64)))).toBe("TASK_MISMATCH");
  });

  it("is refused when the embodiment reading names an item that was not delivered, or quotes words that are not in it", () => {
    expect(refusal((a) => (a.embodiment.item_id = "mirror/identity/zzzzzzzzzzzz"))).toBe(
      "COVERAGE_INCOMPLETE",
    );
    expect(refusal((a) => (a.embodiment.evidence_quote = "a spirit"))).toBe("GROUNDS_UNSUPPORTED");
    // a quote that exists, but in ANOTHER delivered item, does not anchor this one
    expect(refusal((a) => (a.embodiment.evidence_quote = "salt-raker"))).toBe(
      "GROUNDS_UNSUPPORTED",
    );
  });

  it("is refused when the presence reading or a dependency quotes words that are not in the player's statement", () => {
    expect(refusal((a) => (a.presence.evidence_quote = "at the harbour"))).toBe(
      "GROUNDS_UNSUPPORTED",
    );
    expect(
      refusal(
        (a) =>
          (a.external_claims = [
            {
              kind: "OTHER_EXTERNAL_CLAIM",
              bearing: "CONTINGENT",
              rule_ids: ["IR-12"],
              grounds: "-",
              evidence_quote: "the guard allowed it",
            },
          ]),
      ),
    ).toBe("GROUNDS_UNSUPPORTED");
  });

  it("requires every delivered world and locus fact to be assessed exactly once, SUPPORTS and CONTRADICTS anchored to the fact", () => {
    expect(refusal((a) => a.assessments.pop())).toBe("COVERAGE_INCOMPLETE");
    expect(refusal((a) => a.assessments.push(a.assessments[0]))).toBe("COVERAGE_INCOMPLETE");
    expect(refusal((a) => (a.assessments[0].fact_id = "world.invented"))).toBe(
      "COVERAGE_INCOMPLETE",
    );
    expect(refusal((a) => (a.assessments[1].evidence_quote = null))).toBe("GROUNDS_UNSUPPORTED");
    expect(refusal((a) => (a.assessments[1].evidence_quote = "harbour"))).toBe(
      "GROUNDS_UNSUPPORTED",
    );
  });

  it("asks a question exactly when something is ambiguous or unclear", () => {
    expect(refusal((a) => (a.clarification = "Which?"))).toBe("DECISION_INCOHERENT");
    expect(refusal((a) => (a.embodiment.mode = "AMBIGUOUS"))).toBe("DECISION_INCOHERENT");
    expect(refusal((a) => (a.assessments[0].relation = "UNCLEAR"))).toBe("DECISION_INCOHERENT");
    expect(
      derive((a) => {
        a.presence.mode = "AMBIGUOUS";
        a.clarification = "Where exactly?";
      }),
    ).toEqual({ ok: true, verdict: "PHYSICAL_UNRESOLVED" });
  });
});

describe("a conjunctive claim must stand apart from the words that establish the presence", () => {
  const ctx2: PhysicalContext = {
    ...ctx,
    statement:
      "I am originally present at the salt pans of Ashfall Marsh, and the harbour guard has sworn to protect me there.",
  };
  const task2 = refereeTaskId(ctx2);
  const answer2 = (bearing: string, presenceQuote: string): any => ({
    ...base(),
    task_id: task2,
    presence: { ...base().presence, evidence_quote: presenceQuote },
    external_claims: [
      {
        kind: "INDEPENDENT_ACTOR_COOPERATION",
        bearing,
        rule_ids: ["IR-12"],
        grounds: "a separate oath",
        evidence_quote: "the harbour guard has sworn to protect me there",
      },
    ],
  });
  const run = (a: any) => derivePhysical(ctx2, a as PhysicalHostDecision);

  it("the oath beside an independently stated presence: eligible when the presence quotation holds only the presence words", () => {
    expect(
      run(answer2("CONJUNCTIVE", "I am originally present at the salt pans of Ashfall Marsh")),
    ).toEqual({
      ok: true,
      verdict: "PHYSICAL_ELIGIBLE",
    });
  });

  it("is refused as incoherent when the presence quotation contains the claim (the presence is then not independent of it)", () => {
    const d = run(answer2("CONJUNCTIVE", ctx2.statement));
    expect(d.ok).toBe(false);
    expect(!d.ok && d.refusal.code).toBe("DECISION_INCOHERENT");
    const partial = run(
      answer2(
        "CONJUNCTIVE",
        "salt pans of Ashfall Marsh, and the harbour guard has sworn to protect",
      ),
    );
    expect(!partial.ok && partial.refusal.code).toBe("DECISION_INCOHERENT");
  });

  it("the same words read as CONTINGENT are not subject to that constraint and refuse custody", () => {
    expect(run(answer2("CONTINGENT", ctx2.statement))).toEqual({
      ok: true,
      verdict: "NOT_PHYSICAL_SINGLE_LOCUS",
    });
  });

  it("the oath is never part of what the verdict or the context delivers as a fact", () => {
    const d = run(
      answer2("CONJUNCTIVE", "I am originally present at the salt pans of Ashfall Marsh"),
    );
    expect(d.ok && Object.keys(d)).toEqual(["ok", "verdict"]);
  });
});
