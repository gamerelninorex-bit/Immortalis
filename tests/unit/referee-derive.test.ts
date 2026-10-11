// The deterministic mechanism of the host-callable AI referee: it understands no language. These tests give it hand-written answers
// and check that it validates coverage, quotations and coherence and DERIVES the verdict itself. They say nothing about whether
// any model reads any sentence correctly.
import { describe, expect, it } from "vitest";
import type { I002HostDecision, IrHostDecision } from "@immortalis/contracts";
import {
  candidateDigest,
  deriveI002,
  deriveIr,
  i002Context,
  i002VerdictOf,
  irVerdictOf,
  refereeItemId,
  refereeTaskId,
  type CandidateItem,
  type DeliveredFact,
  type IrContext,
} from "@immortalis/engine";

const items: CandidateItem[] = [
  {
    item_id: refereeItemId("identity", "Maren, a salt-raker"),
    slot: "identity",
    text: "Maren, a salt-raker",
  },
  {
    item_id: refereeItemId("possession-1", "a knife and rope"),
    slot: "possession",
    text: "a knife and rope",
  },
];
const ctx = i002Context({ campaign_id: "c1", attempt: 0, pc_id: "pc-1", items });
const taskId = refereeTaskId(ctx);

const own = (i: CandidateItem) => ({
  item_id: i.item_id,
  slot: i.slot,
  class: i.slot === "possession" ? "ENTRY_ENVELOPE_FINITE" : "INTRINSIC_PC",
  rule_ids: ["I002-7"],
  grounds: "ordinary",
  evidence_quote: null,
  intrinsic_excerpt: null,
  other_classes: [],
  clarification: null,
});
const answer = (over: Partial<Record<string, unknown>>[] = []): I002HostDecision =>
  ({
    task_id: taskId,
    items: items.map((i, n) => ({ ...own(i), ...(over[n] ?? {}) })),
  }) as unknown as I002HostDecision;

describe("I-002 derivation", () => {
  it("closes only when every item is admitted as the player's own under its slot", () => {
    const d = deriveI002(ctx, answer());
    expect(d).toEqual({ ok: true, verdict: "CLOSED" });
  });

  it("a non-own class anchored to a verbatim quotation blocks", () => {
    const d = deriveI002(
      ctx,
      answer([
        { class: "WORLD_STATE_ASSERTION", rule_ids: ["I002-6.6"], evidence_quote: "salt-raker" },
      ]),
    );
    expect(d).toEqual({ ok: true, verdict: "BLOCKED" });
  });

  it("a quotation that is not in the delivered text is refused (the host cannot invent the words)", () => {
    const d = deriveI002(
      ctx,
      answer([{ class: "WORLD_STATE_ASSERTION", evidence_quote: "baron" }]),
    );
    expect(d.ok).toBe(false);
    expect(!d.ok && d.refusal.code).toBe("GROUNDS_UNSUPPORTED");
  });

  it("a non-own class with no quotation at all is refused", () => {
    const d = deriveI002(ctx, answer([{ class: "SETTING_PREMISE" }]));
    expect(!d.ok && d.refusal.code).toBe("GROUNDS_UNSUPPORTED");
  });

  it("an item left out, decided twice or not delivered is refused", () => {
    const missing = { ...answer(), items: answer().items.slice(1) };
    expect(deriveI002(ctx, missing)).toMatchObject({
      ok: false,
      refusal: { code: "COVERAGE_INCOMPLETE" },
    });
    const twice = { ...answer(), items: [...answer().items, answer().items[0]!] };
    expect(deriveI002(ctx, twice)).toMatchObject({
      ok: false,
      refusal: { code: "COVERAGE_INCOMPLETE" },
    });
    const foreign = {
      ...answer(),
      items: [...answer().items, { ...answer().items[0]!, item_id: "mirror/x/0" }],
    };
    expect(deriveI002(ctx, foreign)).toMatchObject({
      ok: false,
      refusal: { code: "COVERAGE_INCOMPLETE" },
    });
  });

  it("an answer for another task, or under another slot, is refused", () => {
    expect(deriveI002(ctx, { ...answer(), task_id: "f".repeat(64) })).toMatchObject({
      ok: false,
      refusal: { code: "TASK_MISMATCH" },
    });
    expect(deriveI002(ctx, answer([{ slot: "open" }]))).toMatchObject({
      ok: false,
      refusal: { code: "DECISION_INCOHERENT" },
    });
  });

  it("a MIXED item must quote both the foreign part and the player's own part, and name what the rest is", () => {
    const good = answer([
      {
        class: "MIXED",
        evidence_quote: "salt-raker",
        intrinsic_excerpt: "Maren",
        other_classes: ["SETTING_PREMISE"],
      },
    ]);
    expect(deriveI002(ctx, good)).toEqual({ ok: true, verdict: "BLOCKED" });
    const noExcerpt = answer([
      { class: "MIXED", evidence_quote: "salt-raker", other_classes: ["SETTING_PREMISE"] },
    ]);
    expect(deriveI002(ctx, noExcerpt)).toMatchObject({ ok: false });
  });

  it("an ambiguous item asks its one question and gives CLARIFY; the question is required", () => {
    const asked = answer([{ class: "AMBIGUOUS", clarification: "Do you mean the guild?" }]);
    expect(deriveI002(ctx, asked)).toEqual({ ok: true, verdict: "CLARIFY" });
    expect(deriveI002(ctx, answer([{ class: "AMBIGUOUS" }]))).toMatchObject({ ok: false });
  });

  it("an admitted item that carries an excerpt or question is incoherent", () => {
    expect(deriveI002(ctx, answer([{ clarification: "why?" }]))).toMatchObject({
      ok: false,
      refusal: { code: "DECISION_INCOHERENT" },
    });
  });

  it("the verdict is a function of the answer alone, and the task is a function of the context", () => {
    expect(i002VerdictOf(answer(), (id) => items.find((i) => i.item_id === id)?.slot)).toBe(
      "CLOSED",
    );
    expect(
      refereeTaskId(i002Context({ campaign_id: "c1", attempt: 1, pc_id: "pc-1", items })),
    ).not.toBe(taskId);
    expect(candidateDigest(items)).toBe(candidateDigest([...items]));
  });
});

const facts: DeliveredFact[] = [
  { fact_id: "world.premise", from: "world", label: "world premise", text: "A quiet salt marsh." },
  {
    fact_id: "world.basis",
    from: "world",
    label: "basis",
    text: "ORIGINAL established canon: invented.",
  },
  { fact_id: "locus.designation", from: "locus", label: "locus", text: "The salt pans" },
];
const irCtx: IrContext = {
  operation: "IR_NATIVE_COMPATIBILITY",
  campaign_id: "c1",
  attempt: 0,
  subject: { pc_id: "pc-1", world_id: "w", locus_id: "l" },
  statement: "I have always lived at the salt pans.",
  pc: items,
  facts,
  refs: [],
};
const irTask = refereeTaskId(irCtx);
const irAnswer = (
  mode: string,
  rel: Record<string, Partial<Record<string, unknown>>> = {},
  clarification: string | null = null,
): IrHostDecision =>
  ({
    task_id: irTask,
    reading: {
      mode,
      rule_ids: ["IR-3"],
      grounds: "reading",
      evidence_quote: "always lived",
    },
    assessments: facts.map((f) => ({
      fact_id: f.fact_id,
      relation: "NOT_RELEVANT",
      rule_ids: ["IR-7"],
      grounds: "no bearing",
      evidence_quote: null,
      ...(rel[f.fact_id] ?? {}),
    })),
    clarification,
  }) as unknown as IrHostDecision;

describe("IR derivation", () => {
  it("binds only a native already-there reading with no contradiction and nothing unclear", () => {
    expect(deriveIr(irCtx, irAnswer("NATIVE_ALREADY_THERE"))).toEqual({
      ok: true,
      verdict: "BIND_ELIGIBLE",
    });
  });

  it("any other reading is an unsupported bridge, never a bind", () => {
    for (const mode of ["ARRIVAL", "PORTAL", "TRANSFER", "SUMMONING", "OTHER_UNSUPPORTED"])
      expect(deriveIr(irCtx, irAnswer(mode))).toEqual({ ok: true, verdict: "UNSUPPORTED_BRIDGE" });
  });

  it("a contradiction found in ANY delivered fact (premise, canon, locus) is a world conflict", () => {
    for (const id of facts.map((f) => f.fact_id)) {
      const f = facts.find((x) => x.fact_id === id)!;
      const d = deriveIr(
        irCtx,
        irAnswer("NATIVE_ALREADY_THERE", {
          [id]: { relation: "CONTRADICTS", evidence_quote: f.text.slice(0, 5) },
        }),
      );
      expect(d, id).toEqual({ ok: true, verdict: "WORLD_CONFLICT" });
    }
  });

  it("a contradiction must quote the fact; an invented quotation is refused", () => {
    expect(
      deriveIr(
        irCtx,
        irAnswer("NATIVE_ALREADY_THERE", {
          "world.premise": { relation: "CONTRADICTS", evidence_quote: "no humans" },
        }),
      ),
    ).toMatchObject({ ok: false, refusal: { code: "GROUNDS_UNSUPPORTED" } });
    expect(
      deriveIr(
        irCtx,
        irAnswer("NATIVE_ALREADY_THERE", { "world.premise": { relation: "CONTRADICTS" } }),
      ),
    ).toMatchObject({ ok: false, refusal: { code: "GROUNDS_UNSUPPORTED" } });
  });

  it("every delivered fact is assessed exactly once", () => {
    const a = irAnswer("NATIVE_ALREADY_THERE");
    expect(deriveIr(irCtx, { ...a, assessments: a.assessments.slice(1) })).toMatchObject({
      ok: false,
      refusal: { code: "COVERAGE_INCOMPLETE" },
    });
    expect(
      deriveIr(irCtx, { ...a, assessments: [...a.assessments, a.assessments[0]!] }),
    ).toMatchObject({
      ok: false,
      refusal: { code: "COVERAGE_INCOMPLETE" },
    });
  });

  it("the reading must quote the player's own statement", () => {
    const a = irAnswer("NATIVE_ALREADY_THERE");
    expect(
      deriveIr(irCtx, { ...a, reading: { ...a.reading, evidence_quote: "I am a baron" } }),
    ).toMatchObject({ ok: false, refusal: { code: "GROUNDS_UNSUPPORTED" } });
  });

  it("unclear or ambiguous asks exactly one question, and nothing else may", () => {
    const unclear = irAnswer(
      "NATIVE_ALREADY_THERE",
      { "world.premise": { relation: "UNCLEAR" } },
      "What do you mean?",
    );
    expect(deriveIr(irCtx, unclear)).toEqual({ ok: true, verdict: "UNRESOLVED" });
    expect(
      deriveIr(
        irCtx,
        irAnswer("NATIVE_ALREADY_THERE", { "world.premise": { relation: "UNCLEAR" } }),
      ),
    ).toMatchObject({ ok: false, refusal: { code: "DECISION_INCOHERENT" } });
    expect(deriveIr(irCtx, irAnswer("NATIVE_ALREADY_THERE", {}, "stray question"))).toMatchObject({
      ok: false,
      refusal: { code: "DECISION_INCOHERENT" },
    });
    expect(irVerdictOf(irAnswer("AMBIGUOUS", {}, "Which?"))).toBe("UNRESOLVED");
  });

  it("an answer for another task is refused", () => {
    expect(
      deriveIr(irCtx, { ...irAnswer("NATIVE_ALREADY_THERE"), task_id: "a".repeat(64) }),
    ).toMatchObject({
      ok: false,
      refusal: { code: "TASK_MISMATCH" },
    });
  });
});
