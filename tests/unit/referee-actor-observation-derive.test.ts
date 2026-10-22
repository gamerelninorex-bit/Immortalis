/* eslint-disable @typescript-eslint/no-explicit-any -- tests alter delivered contexts and committed fact values */
// BLUE v5.2-A1 — the NON-PC Named-Actor direct-perception question's deterministic mechanism: what the context is built from (and refuses),
// what the host is never given, how an answer is validated against the delivered words, and how the verdict is derived from the answer alone.
// Nothing here understands language; the "host" is a policy the test wrote that reads the delivered words by rule (plumbing only).
import { describe, expect, it } from "vitest";
import {
  ACTOR_OBSERVATION_COUPLING_REF,
  OWNER_NAMED_ACTOR,
  worldActorCouplingKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  ACTOR_COUPLING_STATEMENT,
  actorCapabilityOfKey,
  actorObservationContext,
  actorObservationVerdictOf,
  actorObservationWithheld,
  deriveActorObservation,
  recordContextViolation,
  refereeTaskId,
  type ActorObservationContext,
} from "@immortalis/engine";
import { ACTOR_BOUNDARY_T } from "@immortalis/testkit";
import {
  ACTOR,
  EXPOSED,
  SECRET,
  SIGHT,
  SOURCE,
  actorAnswer,
  actorCapabilityKey,
  actorScene,
  decide,
  sourceFactKey,
} from "../support/actor-observation.ts";
import { tempDir } from "../support/tmp.ts";

type Facts = (key: string) => OwnerFact | undefined;
const input = (over: Record<string, unknown> = {}) => ({
  campaign_id: "campaign-fixture-1",
  attempt: 0,
  actor_id: ACTOR,
  capability_id: SIGHT,
  source_key: SOURCE,
  observed_at: ACTOR_BOUNDARY_T,
  ...over,
});
const build = (facts: Facts, over: Record<string, unknown> = {}) =>
  actorObservationContext(facts, input(over) as any);

async function world() {
  const s = await actorScene(tempDir());
  const facts: Facts = (k) => s.campaign.store.getFact(k);
  const built = build(facts);
  if (!built.ok) throw new Error(JSON.stringify(built));
  return { s, facts, ctx: built.context };
}

/** The same facts, with ONE fact replaced by an altered copy (a committed fact cannot be altered; this is what a corrupted or foreign fact would look like). */
const altered =
  (facts: Facts, key: string, edit: (f: any) => void): Facts =>
  (k) => {
    const f = facts(k);
    if (!f || k !== key) return f;
    const copy: any = structuredClone(f);
    edit(copy);
    return copy;
  };
const without =
  (facts: Facts, key: string): Facts =>
  (k) =>
    k === key ? undefined : facts(k);

describe("the actor context is built ONLY from committed facts, and every premise is refused unless it is the actor's own and lawful", () => {
  it("is deterministic: the same committed facts give the same context and the same task identity", async () => {
    const { facts, ctx } = await world();
    const again = build(facts);
    expect(again.ok && again.context).toEqual(ctx);
    expect(refereeTaskId(ctx)).toBe(refereeTaskId((again as any).context));
    expect(refereeTaskId({ ...ctx, attempt: 1 })).not.toBe(refereeTaskId(ctx));
    expect(ctx.statement).toBe(ACTOR_COUPLING_STATEMENT);
  });

  it("delivers the actor's capability as ONE item, the world and locus facts, and only the source's owner-authored access facts", async () => {
    const { ctx } = await world();
    expect(ctx.actor).toHaveLength(1);
    expect(ctx.actor[0]!.text).toContain(SIGHT);
    expect(ctx.facts.filter((f) => f.from === "source")).toEqual([
      {
        fact_id: "source.access.1",
        from: "source",
        label: "source access fact (exposure)",
        text: `exposure: ${EXPOSED}`,
      },
    ]);
    const delivered = JSON.stringify([ctx.facts, ctx.actor, ctx.statement]);
    for (const secret of [SECRET.key, SECRET.material, SECRET.dimension, SECRET.statement, "120"])
      expect(delivered).not.toContain(secret);
  });

  it("refuses a capability that is not at its owner's declared close: committed by another group, under another close name or stage, or another actor's", async () => {
    const { facts } = await world();
    const key = actorCapabilityKey(ACTOR, SIGHT);
    const cases: Record<string, Facts> = {
      "absent (only a basis exists)": without(facts, key),
      "committed by a group other than its close stage": altered(facts, key, (f) => {
        f.provenance.group_id = "some-other-group";
      }),
      "another close name": altered(facts, key, (f) => {
        f.value.close.name = "pc-capability-close";
      }),
      "another close stage": altered(facts, key, (f) => {
        f.value.close.stage.causal_process_id = "actor-capability/actor-other/keen-sight";
      }),
      "another actor's capability": altered(facts, key, (f) => {
        f.value.actor_id = "actor-other";
      }),
      "another capability's identity": altered(facts, key, (f) => {
        f.value.capability_id = "keen-hearing";
      }),
      "another owner's fact": altered(facts, key, (f) => {
        f.owner = "world_state";
      }),
      "a malformed value": altered(facts, key, (f) => {
        f.value = { actor_id: ACTOR };
      }),
    };
    for (const [name, f] of Object.entries(cases)) {
      const r = build(f);
      expect(r.ok, name).toBe(false);
      expect(!r.ok && r.code, name).toBe("CONTEXT_UNAVAILABLE");
    }
  });

  it("refuses a coupling that is absent, another owner's, another actor's, or rests on another actor's state", async () => {
    const { facts } = await world();
    const key = worldActorCouplingKey(ACTOR);
    const cases: Record<string, Facts> = {
      absent: without(facts, key),
      "another owner": altered(facts, key, (f) => {
        f.owner = OWNER_NAMED_ACTOR;
      }),
      "another facet": altered(facts, key, (f) => {
        f.facet = "world_source_condition";
      }),
      "another actor": altered(facts, key, (f) => {
        f.value.actor_id = "actor-other";
      }),
      "another actor's pinned state": altered(facts, key, (f) => {
        f.value.actor_state[0].fact_key = "actor/actor-other/capability-basis/keen-sight";
      }),
      "a pin at another version": altered(facts, key, (f) => {
        f.value.actor_state[0].version = 7;
      }),
      "a locus of another world": altered(facts, key, (f) => {
        f.value.coupling.world.entity_id = "world-elsewhere";
      }),
    };
    for (const [name, f] of Object.entries(cases)) {
      const r = build(f);
      expect(r.ok, name).toBe(false);
    }
  });

  it("refuses a Player Character identity or one under player control, whatever else is committed", async () => {
    const { facts } = await world();
    // an Existence Contract that does not compile an existing actor makes the identity a Player Character
    const asPc: Facts = (k) =>
      k === `pc/${ACTOR}/existence-contract`
        ? ({ key: k, owner: "pc_existence", value: { pc_id: ACTOR } } as any)
        : facts(k);
    const r = build(asPc);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("CONTEXT_UNAVAILABLE");
  });

  it("refuses a source that is absent, malformed, foreign-owned, mislocated, exhausted or undescribed with ONE message", async () => {
    const { facts } = await world();
    const cases: Record<string, Facts> = {
      absent: without(facts, sourceFactKey),
      "foreign owner": altered(facts, sourceFactKey, (f) => {
        f.owner = "production";
      }),
      "foreign facet": altered(facts, sourceFactKey, (f) => {
        f.facet = "world_profile";
      }),
      malformed: altered(facts, sourceFactKey, (f) => {
        f.value = { source_key: SOURCE };
      }),
      "another locus": altered(facts, sourceFactKey, (f) => {
        f.value.locality.locus.entity_id = "locus-elsewhere";
      }),
      "another world": altered(facts, sourceFactKey, (f) => {
        f.value.locality.world.entity_id = "world-elsewhere";
      }),
      exhausted: altered(facts, sourceFactKey, (f) => {
        f.value.exhaustion = { kind: "PHYSICAL", delivery: { id: "x" } };
      }),
      undescribed: altered(facts, sourceFactKey, (f) => {
        f.value.access_facts = [];
      }),
      "another key": altered(facts, sourceFactKey, (f) => {
        f.value.source_key = "source-other";
      }),
    };
    const messages = new Set<string>();
    for (const [name, f] of Object.entries(cases)) {
      const r = build(f);
      expect(r.ok, name).toBe(false);
      if (!r.ok) messages.add(r.message);
    }
    expect([...messages]).toEqual(["no source is available to this observation"]);
    const never = build(facts, { source_key: "source-never" });
    expect(!never.ok && never.message).toBe("no source is available to this observation");
  });

  it("re-reads from the committed Source Condition the values no appearance may carry: its key, its material class and every exact quantity", async () => {
    const { facts, ctx } = await world();
    const w = actorObservationWithheld(facts, ctx);
    expect(w).toEqual({ names: [SOURCE, SECRET.material], amounts: [SECRET.amount] });
    // a context that cites no readable source fails closed
    const noSource = actorObservationWithheld(without(facts, sourceFactKey), ctx);
    expect(noSource).toBeNull();
    expect(actorObservationWithheld(facts, { ...ctx, refs: ctx.refs.slice(0, 4) })).toBeNull();
  });

  it("reads an actor capability's identity out of its cited key, and nothing else", () => {
    expect(actorCapabilityOfKey(actorCapabilityKey(ACTOR, SIGHT))).toEqual({
      actor_id: ACTOR,
      capability_id: SIGHT,
    });
    for (const key of [
      `actor/${ACTOR}/capability-basis/${SIGHT}`,
      `actor/${ACTOR}/capability`,
      `world/w/source/${SOURCE}`,
      "",
    ])
      expect(actorCapabilityOfKey(key)).toBeNull();
  });
});

describe("an answer is validated against the delivered words, and the verdict is DERIVED from it", () => {
  async function ready() {
    const { s, facts, ctx } = await world();
    const withheld = actorObservationWithheld(facts, ctx)!;
    const answer = (rule: Parameters<typeof actorAnswer>[1] = {}) =>
      actorAnswer({ task_id: refereeTaskId(ctx), context: ctx }, rule) as any;
    const derive = (a: any) => deriveActorObservation(ctx, a, withheld);
    return { s, ctx, answer, derive };
  }
  const refusal = (r: ReturnType<typeof deriveActorObservation>) => (r.ok ? null : r.refusal);

  it("derives ESTABLISHED only from an affirmative faculty, position and path with a stated appearance", async () => {
    const { answer, derive } = await ready();
    expect(derive(answer())).toEqual({ ok: true, verdict: "OBSERVATION_ESTABLISHED" });
    expect(actorObservationVerdictOf(answer())).toBe("OBSERVATION_ESTABLISHED");
    const cases: [Parameters<typeof actorAnswer>[1], string][] = [
      [{ noFaculty: true }, "OBSERVATION_UNRESOLVED"],
      [{ noPosition: true }, "OBSERVATION_UNRESOLVED"],
      [{ pathUnknown: true }, "OBSERVATION_UNRESOLVED"],
      [{ contradicts: /terrestrial daylight/ }, "OBSERVATION_WORLD_CONFLICT"],
    ];
    for (const [rule, verdict] of cases) {
      const d = derive(answer(rule));
      expect(d.ok && d.verdict, JSON.stringify(rule)).toBe(verdict);
    }
  });

  it("an obstruction needs an ESTABLISHED blocked path from an ESTABLISHED viewing position; a missing faculty is never an obstruction", async () => {
    const { answer } = await ready();
    const a = answer();
    a.path = { ...a.path, state: "BLOCKED" };
    a.payload = null;
    expect(actorObservationVerdictOf(a)).toBe("OBSERVATION_OBSTRUCTED");
    a.position = { ...a.position, state: "NOT_ESTABLISHED", premises: [] };
    expect(actorObservationVerdictOf(a)).toBe("OBSERVATION_UNRESOLVED");
  });

  it("refuses a faculty that rests on anything but the actor's own capability: the coupling, a world fact or an invented premise", async () => {
    const { answer, derive } = await ready();
    for (const from of ["COUPLING_STATEMENT", "WORLD_FACT"] as const) {
      const r = refusal(derive(answer({ facultyFrom: from })));
      expect(r?.code, from).toBe("DECISION_INCOHERENT");
      expect(r?.message).toMatch(/faculty rests only on the actor's own committed capability/);
    }
    const missing = answer();
    missing.faculty.premises = [];
    expect(refusal(derive(missing))?.code).toBe("GROUNDS_UNSUPPORTED");
  });

  it("refuses viewing circumstances not resting on the coupling statement, or resting on the capability", async () => {
    const { ctx, answer, derive } = await ready();
    const noCoupling = answer();
    noCoupling.position.premises = [
      {
        from: "WORLD_FACT",
        ref: ctx.facts.find((f) => f.fact_id === "locus.designation")!.fact_id,
        evidence_quote: "A stone hall",
      },
    ];
    const r = refusal(derive(noCoupling));
    expect(r?.code).toBe("GROUNDS_UNSUPPORTED");
    expect(r?.message).toMatch(/shared locus alone/);
    const onCapability = answer();
    onCapability.position.premises = [
      { from: "ACTOR_CAPABILITY", ref: "actor.capability", evidence_quote: SIGHT },
    ];
    expect(refusal(derive(onCapability))?.code).toBe("DECISION_INCOHERENT");
    const pathOnCoupling = answer();
    pathOnCoupling.path.premises = [
      {
        from: "COUPLING_STATEMENT",
        ref: ACTOR_OBSERVATION_COUPLING_REF,
        evidence_quote: "currently coupled",
      },
    ];
    expect(refusal(derive(pathOnCoupling))?.code).toBe("DECISION_INCOHERENT");
  });

  it("refuses a premise the context never delivered, a quotation that is not in it, and a PC premise kind", async () => {
    const { answer, derive } = await ready();
    const unknown = answer();
    unknown.faculty.premises[0].ref = "actor.sixth-sense";
    expect(refusal(derive(unknown))?.code).toBe("COVERAGE_INCOMPLETE");
    const misquote = answer();
    misquote.faculty.premises[0].evidence_quote = "perfect eyesight";
    expect(refusal(derive(misquote))?.code).toBe("GROUNDS_UNSUPPORTED");
    const pcKind = answer();
    pcKind.faculty.premises[0].from = "PC_STATEMENT";
    expect(() => derive(pcKind)).not.toThrow();
  });

  it("an appearance is OF the one source: never of a neighbouring world or locus fact, and anchored to a quotation of it", async () => {
    const { ctx, answer, derive } = await ready();
    const locus = ctx.facts.find((f) => f.fact_id === "locus.designation")!;
    // the scripted host DOES state an appearance of the locus' designation; the engine refuses it
    const ofLocus = answer({ ofFact: "locus.designation" });
    expect(ofLocus.payload.source_fact_id).toBe(locus.fact_id);
    const r = refusal(derive(ofLocus));
    expect(r?.code).toBe("DECISION_INCOHERENT");
    expect(r?.message).toMatch(/appearance of the one source/);
    const unanchored = answer();
    unanchored.payload.basis = [
      { from: "WORLD_FACT", ref: locus.fact_id, evidence_quote: "A stone" },
    ];
    expect(refusal(derive(unanchored))?.message).toMatch(
      /anchored to a quotation of the source fact/,
    );
    const undelivered = answer();
    undelivered.payload.source_fact_id = "source.access.9";
    expect(refusal(derive(undelivered))?.code).toBe("COVERAGE_INCOMPLETE");
  });

  it("an appearance carries no engine reference and none of the values the source's owner withholds", async () => {
    const { ctx, answer, derive } = await ready();
    const leaks = [
      SECRET.key,
      SECRET.material,
      "Raw Salt",
      "raw salt",
      "120",
      ACTOR,
      "world-fixture-1",
      "locus-fixture-1",
      "source.access.1",
      "actor.capability",
      ACTOR_OBSERVATION_COUPLING_REF,
      ctx.refs[0]!.fact_key,
    ];
    for (const leak of leaks) {
      const r = refusal(derive(answer({ content: `a heap, perhaps ${leak}` })));
      expect(r?.code, leak).toBe("GROUNDS_UNSUPPORTED");
    }
    // a different number is not the withheld quantity, and a longer one that merely contains it is not either
    expect(derive(answer({ content: "a heap, perhaps 1200 or 12 of them" })).ok).toBe(true);
  });

  it("an appearance exists only when the whole question is affirmatively answered", async () => {
    const { answer, derive } = await ready();
    const a = answer({ noFaculty: true, forcePayload: true });
    expect(a.payload).not.toBeNull();
    expect(refusal(derive(a))?.code).toBe("DECISION_INCOHERENT");
  });

  it("requires every delivered fact to be assessed exactly once, and a task for this question", async () => {
    const { ctx, answer, derive } = await ready();
    const dropped = answer();
    dropped.assessments.pop();
    expect(refusal(derive(dropped))?.code).toBe("COVERAGE_INCOMPLETE");
    const twice = answer();
    twice.assessments.push(twice.assessments[0]);
    expect(refusal(derive(twice))?.code).toBe("COVERAGE_INCOMPLETE");
    const foreign = answer();
    foreign.task_id = refereeTaskId({ ...ctx, attempt: 3 });
    expect(refusal(derive(foreign))?.code).toBe("TASK_MISMATCH");
  });
});

describe("a retained actor record re-derives from the committed facts it cites", () => {
  it("is coherent as retained, and incoherent once any part of it is changed", async () => {
    const s = await actorScene(tempDir());
    const d = await decide(s);
    const facts: Facts = (k) => s.campaign.store.getFact(k);
    const record = structuredClone(s.campaign.store.getFact(d.record.key)!.value) as any;
    expect(recordContextViolation(record, facts)).toBeNull();
    const edits: Record<string, (r: any) => void> = {
      "another verdict": (r) => (r.verdict = "OBSERVATION_OBSTRUCTED"),
      "another digest": (r) => (r.input.digest = "0".repeat(64)),
      "another statement": (r) => (r.input.statement = "The actor is somewhere."),
      "another observation basis": (r) =>
        (r.input.observed_at = { ...r.input.observed_at, value: 1 }),
      "another actor": (r) => (r.subject.actor_id = "actor-other"),
      "a dropped citation": (r) => r.input.refs.pop(),
      "a reordered citation": (r) => r.input.refs.reverse(),
      "a changed quotation": (r) => (r.decision.faculty.premises[0].evidence_quote = "x"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const copy = structuredClone(record);
      edit(copy);
      expect(recordContextViolation(copy, facts), name).not.toBeNull();
    }
  });

  it("a cited fact the owners later advanced is history, not a violation, but a citation ahead of the committed fact is stale", async () => {
    const s = await actorScene(tempDir());
    const d = await decide(s);
    const record = structuredClone(s.campaign.store.getFact(d.record.key)!.value) as any;
    const advanced =
      (key: string, version: number): Facts =>
      (k) => {
        const f = s.campaign.store.getFact(k);
        return f && k === key ? ({ ...structuredClone(f), version } as OwnerFact) : f;
      };
    expect(recordContextViolation(record, advanced(sourceFactKey, 2))).toBeNull();
    expect(recordContextViolation(record, advanced(sourceFactKey, 0))).toMatchObject({
      code: "CONTEXT_STALE",
      stale: true,
    });
    // a record is verified on what it retains when advanced: an edited appearance's scope is still refused
    const relabelled = structuredClone(record);
    relabelled.decision.payload.source_fact_id = "locus.designation";
    expect(recordContextViolation(relabelled, advanced(sourceFactKey, 2))).toMatchObject({
      code: "DECISION_INCOHERENT",
    });
  });
});

export type { ActorObservationContext };
