/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary invalid answers and records */
// The deterministic mechanism of the SOURCE-SCOPED direct-perception question (BLUE v5.2-A1). It understands no language: these tests give it
// hand-written answers and check what the engine itself enforces — that an appearance in a source-scoped question is OF that source, that it
// carries none of the values the source's owner withholds, that every quotation and premise kind is checked as before, and that the receipt
// the record determines pins the one Source Condition and nothing else. They say nothing about whether any model reads any sentence
// correctly: that is genuine AI-host semantic evidence and is not claimed here.
import { describe, expect, it } from "vitest";
import {
  OBSERVATION_BASE_REFS,
  OWNER_WORLD_STATE,
  RefereeDecisionRecordSchema,
  WorldSourceConditionSchema,
  parseWorldSourceConditionKey,
  worldSourceConditionKey,
  type ObservationHostDecision,
} from "@immortalis/contracts";
import {
  deriveObservation,
  deriveObservationEvent,
  observationVerdictOf,
  observationWithheld,
  refereeTaskId,
  type ObservationContext,
  type ObservationRecord,
  type ObservationWithheld,
} from "@immortalis/engine";

const SOURCE_KEY = "src-pan-1";
const SOURCE_FACT = worldSourceConditionKey("w1", SOURCE_KEY);

const sourceValue = (over: Record<string, unknown> = {}) =>
  WorldSourceConditionSchema.parse({
    source_key: SOURCE_KEY,
    locality: {
      world: { fact_key: "world/w1/profile", entity_id: "w1" },
      locus: { fact_key: "world/w1/locus/l1", entity_id: "l1" },
    },
    dimension: "surface-crust",
    material_class: "raw-salt",
    depth: "EXACT_FINITE",
    establishment: {
      kind: "INITIAL_SETTING_FACT",
      statement: "The pan holds exactly 120 sacks of raw salt.",
      quantity: { amount: 120, unit: "sack" },
    },
    recoverable: { amount: 120, unit: "sack" },
    delivered: [],
    access_facts: [{ aspect: "exposure", statement: "A pale crust lies bare on the floor." }],
    exhaustion: null,
    ...over,
  });

const base = {
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
  ],
  refs: [
    { fact_key: "pc/pc-1/existence-contract", version: 1, group_id: "g1" },
    { fact_key: "role-registry/binding/role.player_character", version: 1, group_id: "g2" },
    { fact_key: "world-state/pc/pc-1/locus-custody", version: 1, group_id: "g3" },
    { fact_key: "world/w1/profile", version: 1, group_id: "g4" },
    { fact_key: "world/w1/locus/l1", version: 1, group_id: "g5" },
  ],
} as const;
const worldFacts = [
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
] as const;
const sourceFacts = (statement: string) =>
  [
    {
      fact_id: "source.access.1",
      from: "source",
      label: "source access fact (exposure)",
      text: `exposure: ${statement}`,
    },
  ] as const;

const scoped = (
  statement = "A pale crust lies bare on the floor, in plain view.",
): ObservationContext =>
  ({
    ...base,
    facts: [...worldFacts, ...sourceFacts(statement)],
    refs: [...base.refs, { fact_key: SOURCE_FACT, version: 3, group_id: "g6" }],
  }) as ObservationContext;
const ordinary = (): ObservationContext =>
  ({ ...base, facts: [...worldFacts] }) as ObservationContext;

const WITHHELD: ObservationWithheld = {
  names: [SOURCE_KEY, "raw-salt"],
  amounts: [120, 90],
};

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
const payloadOf = (over: Record<string, unknown> = {}) => ({
  source_fact_id: "source.access.1",
  referent: "a low pale heap on the floor",
  content: "a heap of pale crust lying bare on the floor",
  basis: [{ from: "WORLD_FACT", ref: "source.access.1", evidence_quote: "lies bare on the floor" }],
  ...over,
});
const answer = (ctx: ObservationContext, over: (a: any) => void = () => undefined): any => {
  const a: any = {
    task_id: refereeTaskId(ctx),
    faculty: structuredClone(faculty),
    position: structuredClone(position),
    path: structuredClone(open),
    payload: payloadOf(),
    assessments: ctx.facts.map((f) => ({
      fact_id: f.fact_id,
      relation: f.fact_id === "source.access.1" ? "SUPPORTS" : "NOT_RELEVANT",
      rule_ids: ["IR-7"],
      grounds: "-",
      evidence_quote: f.fact_id === "source.access.1" ? "lies bare on the floor" : null,
    })),
    unresolved_forks: [],
  };
  over(a);
  return a;
};
const derive = (
  ctx: ObservationContext,
  over: (a: any) => void = () => undefined,
  withheld: ObservationWithheld = WITHHELD,
) => deriveObservation(ctx, answer(ctx, over) as ObservationHostDecision, withheld);
const code = (r: ReturnType<typeof derive>) => (r.ok ? null : r.refusal.code);

describe("a source-scoped question: the appearance is OF the source and carries nothing its owner withholds", () => {
  it("the appearance of the source, anchored to a quotation of that very access fact, derives a receipt", () => {
    const r = derive(scoped());
    expect(r.ok && r.verdict).toBe("OBSERVATION_ESTABLISHED");
  });

  it("an appearance of a neighbouring world or locus fact is refused: the receipt would pin that fact, not the source the question is about", () => {
    const r = derive(scoped(), (a) => {
      a.payload = payloadOf({
        source_fact_id: "locus.constraint.1",
        basis: [
          {
            from: "WORLD_FACT",
            ref: "locus.constraint.1",
            evidence_quote: "one broad green stripe",
          },
        ],
      });
    });
    expect(code(r)).toBe("DECISION_INCOHERENT");
    // the same appearance in an ordinary question (no source named) is the unchanged, lawful one
    const ord = ordinary();
    const lawful = deriveObservation(
      ord,
      answer(ord, (a) => {
        a.payload = payloadOf({
          source_fact_id: "locus.constraint.1",
          basis: [
            {
              from: "WORLD_FACT",
              ref: "locus.constraint.1",
              evidence_quote: "one broad green stripe",
            },
          ],
        });
        a.assessments = ord.facts.map((f) => ({
          fact_id: f.fact_id,
          relation: "NOT_RELEVANT",
          rule_ids: ["IR-7"],
          grounds: "-",
          evidence_quote: null,
        }));
      }) as ObservationHostDecision,
    );
    expect(lawful.ok && lawful.verdict).toBe("OBSERVATION_ESTABLISHED");
  });

  it("an ordinary question has no source facts, so a `source.` appearance in it names nothing that was delivered", () => {
    const ord = ordinary();
    const r = deriveObservation(
      ord,
      answer(ord, (a) => {
        a.assessments = ord.facts.map((f) => ({
          fact_id: f.fact_id,
          relation: "NOT_RELEVANT",
          rule_ids: ["IR-7"],
          grounds: "-",
          evidence_quote: null,
        }));
      }) as ObservationHostDecision,
    );
    expect(code(r)).toBe("COVERAGE_INCOMPLETE");
  });

  it("refuses an appearance carrying the source's identifier, material or an exact quantity, however separators and case are spelled", () => {
    const leaks = [
      { referent: `the ${SOURCE_KEY} heap` },
      { content: "a pile of raw-salt on the floor" },
      { content: "a pile of Raw Salt on the floor" },
      { content: "a pile of raw_salt on the floor" },
      { content: "about 120 pale lumps lie there" },
      { content: "ninety is not a numeral, but 90 pale lumps lie there" },
      { referent: "src pan 1" },
    ];
    for (const over of leaks)
      expect(
        code(derive(scoped(), (a) => Object.assign(a.payload, over))),
        JSON.stringify(over),
      ).toBe("GROUNDS_UNSUPPORTED");
  });

  it("does not refuse look-alikes: a longer number, a word that merely contains a withheld word, or the same text with nothing withheld", () => {
    for (const over of [
      { content: "about 1200 pale lumps" },
      { content: "about 0120 pale lumps" },
      { content: "a raw saltpan edge" },
      { content: "a heap of pale crust lying bare, 12 lumps wide" },
    ])
      expect(
        code(derive(scoped(), (a) => Object.assign(a.payload, over))),
        JSON.stringify(over),
      ).toBe(null);
    // the guard is the withheld set, not a property of the text: with nothing withheld the very same words pass
    expect(
      code(
        derive(scoped(), (a) => (a.payload.content = "about 120 lumps"), {
          names: [],
          amounts: [],
        }),
      ),
    ).toBe(null);
  });

  it("still refuses what every appearance refuses: an engine reference, a quotation that is not in the premise, an undelivered fact", () => {
    expect(code(derive(scoped(), (a) => (a.payload.content = "see source.access.1 for it")))).toBe(
      "GROUNDS_UNSUPPORTED",
    );
    expect(
      code(derive(scoped(), (a) => (a.payload.basis[0].evidence_quote = "lies buried below"))),
    ).toBe("GROUNDS_UNSUPPORTED");
    expect(code(derive(scoped(), (a) => (a.payload.basis[0].ref = "source.access.9")))).toBe(
      "COVERAGE_INCOMPLETE",
    );
    expect(code(derive(scoped(), (a) => (a.assessments = a.assessments.slice(1))))).toBe(
      "COVERAGE_INCOMPLETE",
    );
  });

  it("a source access fact is a premise like any other: a covering circumstance quoted as BLOCKED derives the physical negative, never a receipt", () => {
    const ctx = scoped("A closed slab of stone lies over the whole crust; no part of it shows.");
    const r = derive(ctx, (a) => {
      a.path = {
        state: "BLOCKED",
        premises: [
          {
            from: "WORLD_FACT",
            ref: "source.access.1",
            evidence_quote: "A closed slab of stone lies over the whole crust",
          },
        ],
        rule_ids: ["F014D-6"],
        grounds: "a quoted covering fact",
      };
      a.payload = null;
      a.assessments = a.assessments.map((x: any) =>
        x.fact_id === "source.access.1"
          ? { ...x, evidence_quote: "A closed slab of stone lies over the whole crust" }
          : x,
      );
    });
    expect(r.ok && r.verdict).toBe("OBSERVATION_OBSTRUCTED");
  });

  it("a source that does not say it can be seen settles nothing: no affirmative path and no appearance is UNRESOLVED, never an obstruction", () => {
    const ctx = scoped("A pale crust lies somewhere in the hall.");
    const r = derive(ctx, (a) => {
      a.path = { state: "NOT_ESTABLISHED", premises: [], rule_ids: ["F014D-6"], grounds: "unsaid" };
      a.payload = null;
      a.assessments = a.assessments.map((x: any) => ({
        ...x,
        relation: "NOT_RELEVANT",
        evidence_quote: null,
      }));
    });
    expect(r.ok && r.verdict).toBe("OBSERVATION_UNRESOLVED");
    expect(
      observationVerdictOf({
        ...answer(ctx),
        path: { ...open, state: "NOT_ESTABLISHED", premises: [] },
        payload: null,
      }),
    ).toBe("OBSERVATION_UNRESOLVED");
  });

  it("the source's access fact cannot establish the character's faculty or position: the premise kinds are unchanged", () => {
    expect(
      code(
        derive(scoped(), (a) => {
          a.faculty.premises = [
            {
              from: "WORLD_FACT",
              ref: "source.access.1",
              evidence_quote: "lies bare on the floor",
            },
          ];
        }),
      ),
    ).toBe("DECISION_INCOHERENT");
    expect(
      code(
        derive(scoped(), (a) => {
          a.position.premises = [
            {
              from: "PC_STATEMENT",
              ref: "mirror/embodiment/aaaaaaaaaaaa",
              evidence_quote: "keen sight",
            },
          ];
        }),
      ),
    ).toBe("DECISION_INCOHERENT");
  });
});

describe("the withheld set is read from the committed Source Condition the question pins, never from the delivered context", () => {
  const facts =
    (value: unknown, key = SOURCE_FACT) =>
    (k: string) =>
      k === key ? ({ key, value } as any) : undefined;

  it("an ordinary question withholds nothing, and a scoped one withholds the key, the material class and every exact quantity it ever stated or holds", () => {
    expect(observationWithheld(facts(sourceValue()), ordinary())).toEqual({
      names: [],
      amounts: [],
    });
    const w = observationWithheld(facts(sourceValue()), scoped())!;
    expect(w.names).toEqual([SOURCE_KEY, "raw-salt"]);
    expect(w.amounts).toEqual([120]);
    // after a delivery the net amount is withheld as well as the established one and the delivered one
    const after = sourceValue({
      recoverable: { amount: 90, unit: "sack" },
      delivered: [{ delivery_id: "ex-1", quantity: { amount: 30, unit: "sack" } }],
    });
    expect([...observationWithheld(facts(after), scoped())!.amounts].sort((a, b) => a - b)).toEqual(
      [30, 90, 120],
    );
  });

  it("a scoped question whose source cannot be read as one is withheld-unknown (fail closed), never withheld-nothing", () => {
    expect(observationWithheld(() => undefined, scoped())).toBeNull();
    expect(observationWithheld(facts({ not: "a source" }), scoped())).toBeNull();
    const elsewhere = scoped();
    expect(
      observationWithheld(facts(sourceValue(), SOURCE_FACT), {
        ...elsewhere,
        refs: [...base.refs, { fact_key: "world/w2/source/src-pan-1", version: 1, group_id: "g" }],
      } as ObservationContext),
    ).toBeNull();
    expect(
      observationWithheld(facts(sourceValue()), {
        ...elsewhere,
        refs: [...elsewhere.refs, { fact_key: SOURCE_FACT, version: 1, group_id: "g" }],
      } as ObservationContext),
    ).toBeNull();
  });

  it("the key of a Source Condition parses only exactly: another kind of fact, a delivery or a malformed key is none", () => {
    expect(parseWorldSourceConditionKey(SOURCE_FACT)).toEqual({
      world_id: "w1",
      source_key: SOURCE_KEY,
    });
    for (const key of [
      "world/w1/source-delivery/ex-1",
      "world/w1/source/",
      "world/w1/source/a/b",
      "world/w1/profile",
      "world//source/x",
      "x/world/w1/source/y",
    ])
      expect(parseWorldSourceConditionKey(key), key).toBeNull();
  });
});

describe("the event a source-scoped record determines pins that one Source Condition", () => {
  const record = (over: (r: any) => void = () => undefined): ObservationRecord => {
    const ctx = scoped();
    const r: any = {
      record_version: 1,
      task_id: refereeTaskId(ctx),
      campaign_id: "c1",
      attempt: 0,
      authority: { role: "role.gm", permission: "permission.rule.adjudicate" },
      host: { host_id: "h", claimed_model: null },
      subject: { pc_id: "pc-1" },
      input: {
        digest: "0".repeat(64),
        candidate_digest: null,
        candidate: null,
        statement_digest: "1".repeat(64),
        statement: ctx.statement,
        refs: ctx.refs.map((x) => ({ ...x })),
        observed_at: ctx.observed_at,
      },
      validated_under: { role: "role.resolver", permission: "permission.resolution.execute" },
      operation: "F014D_DIRECT_PERCEPTION",
      decision: answer(ctx),
      verdict: "OBSERVATION_ESTABLISHED",
    };
    over(r);
    return RefereeDecisionRecordSchema.parse(r) as ObservationRecord;
  };

  it("the source pin is the Source Condition, at the version the record cited, owned by World-State", () => {
    const e = deriveObservationEvent(record());
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.value.source).toEqual({ owner: OWNER_WORLD_STATE, fact_key: SOURCE_FACT, version: 3 });
    expect(e.value.participants).toEqual(["pc-1"]);
    expect(e.value.payload.content).toBe("a heap of pale crust lying bare on the floor");
    expect(OBSERVATION_BASE_REFS).toBe(5);
  });

  it("a source-scoped record never earns a receipt about another fact, and an ordinary record never about a source", () => {
    // 6 refs, appearance of a locus fact
    expect(
      deriveObservationEvent(
        record((r) => {
          r.decision.payload.source_fact_id = "locus.constraint.1";
        }),
      ).ok,
    ).toBe(false);
    // 5 refs, appearance claimed of a `source.` fact
    expect(
      deriveObservationEvent(
        record((r) => {
          r.input.refs = r.input.refs.slice(0, 5);
        }),
      ).ok,
    ).toBe(false);
    // 6 refs whose sixth is not a Source Condition key of the same world, or is a different kind of fact
    for (const key of [
      "world/w2/source/src-pan-1",
      "world/w1/source-delivery/ex-1",
      "world/w1/locus/l1",
    ])
      expect(
        deriveObservationEvent(
          record((r) => {
            r.input.refs[5].fact_key = key;
          }),
        ).ok,
        key,
      ).toBe(false);
    // 7 refs
    expect(
      deriveObservationEvent(
        record((r) => {
          r.input.refs.push({ fact_key: SOURCE_FACT, version: 3, group_id: "g6" });
        }),
      ).ok,
    ).toBe(false);
  });

  it("only an established reading earns an event, source-scoped or not", () => {
    const e = deriveObservationEvent(
      record((r) => {
        r.verdict = "OBSERVATION_OBSTRUCTED";
      }),
    );
    expect(e.ok).toBe(false);
  });
});
