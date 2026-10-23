/* eslint-disable @typescript-eslint/no-explicit-any -- tests forge arbitrary raw groups and fact values */
// BLUE v5.2-A1 — NON-PC NAMED-ACTOR SOURCE-QUALIFIED DIRECT PERCEPTION: enforcement. The question is refused before any host is asked when a
// premise is absent, foreign, mislocated or not at its owner's close; a raw `store.commit` cannot forge a retained reading, an event, a packet
// or a role; a second reading never replaces the first; and the owners stay isolated. Each refusal adds no canon.
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_ENGINE_SEALED,
  CANON_WRITE_AUTHORITY,
  OBSERVATION_EVENT_BASIS,
  OBSERVATION_RESOLVER_AUTHORITY,
  REFEREE_AUTHORITY,
  REFEREE_DECISION_BASIS,
  REFEREE_RECORD_VERSION,
  REFEREE_SECRECY,
  RECIPIENT_ROLE_PLAYER_CHARACTER,
  accessEventKey,
  observationEventCause,
  observationEventGroupId,
  observationEventIntentId,
  refereeDecisionCause,
  refereeDecisionGroupId,
  refereeDecisionIntentId,
  refereeDecisionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE,
  EPISTEMIC_ACCESS_OBSERVATION_RULE,
  REFEREE_ACTOR_OBSERVATION_RULE,
  REFEREE_OBSERVATION_RULE,
  actorObservationEventDependencies,
  actorObservationEventId,
  actorObservationEventReads,
  actorObservationRecordOf,
  contextDigest,
  deriveActorObservationEvent,
  factKind,
  formActorObservedPacket,
  recordContextViolation,
  statementDigest,
  verifyEpistemicIntegrity,
  verifyRefereeIntegrity,
} from "@immortalis/engine";
import { ACTOR_BOUNDARY_T, FIXTURE_PC_ID, fixtureContract, publication } from "@immortalis/testkit";
import {
  ACTOR,
  ACTOR_OTHER,
  BURIED,
  LOCUS_ELSEWHERE,
  SIGHT,
  SOURCE,
  SOURCE_ELSEWHERE,
  SOURCE_OTHER,
  actorAnswer,
  actorCapabilityKey,
  actorScene,
  decide,
  reopenScene,
  SCREEN,
  sourceFactKey,
  type ActorScene,
} from "../support/actor-observation.ts";
import { tempDir } from "../support/tmp.ts";

const ask = (
  s: ActorScene,
  o: { actor?: string; capability?: string; source?: string; attempt?: number } = {},
) =>
  s.referee.actorObservationTask({
    actor_id: o.actor ?? ACTOR,
    capability_id: o.capability ?? SIGHT,
    source_key: o.source ?? SOURCE,
    attempt: o.attempt ?? 0,
  });

const refusal = (r: ReturnType<typeof ask>) =>
  r.ok ? null : { code: r.error.code, message: r.error.message };

const accessCount = (s: ActorScene) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("access/")).length;
const decisions = (s: ActorScene) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("referee/")).length;

async function refused(s: ActorScene, group: CommitGroup) {
  const before = s.campaign.store.head().revision;
  const r = await s.campaign.store.commit(group);
  expect(r.ok, JSON.stringify(r.ok ? null : r.error)).toBe(false);
  expect(s.campaign.store.head().revision).toBe(before);
  return r.ok ? null : r.error;
}

/** The retained-decision group exactly as the referee adapter builds it, with the pieces a forger would alter exposed. */
function decisionGroup(
  s: ActorScene,
  o: {
    rule?: CommitGroup["rule"];
    record?: (r: any) => void;
    group?: (g: any) => void;
    rule_answer?: Parameters<typeof actorAnswer>[1];
  } = {},
): { group: CommitGroup; record: any; taskId: string } {
  const task = ask(s);
  if (!task.ok) throw new Error(JSON.stringify(task.error));
  const { context, task_id } = task.value;
  const answer = actorAnswer({ task_id, context }, o.rule_answer);
  const evaluated = s.referee.evaluateActorObservation(context, answer);
  if (!evaluated.ok) throw new Error(JSON.stringify(evaluated.error));
  const record: any = {
    record_version: REFEREE_RECORD_VERSION,
    task_id,
    campaign_id: context.campaign_id,
    attempt: context.attempt,
    authority: { ...REFEREE_AUTHORITY },
    host: { host_id: "forger", claimed_model: null },
    subject: { actor_id: ACTOR },
    input: {
      digest: contextDigest(context),
      candidate_digest: null,
      candidate: null,
      statement_digest: statementDigest(context.statement),
      statement: context.statement,
      refs: context.refs.map((r) => ({ ...r })),
      observed_at: { ...context.observed_at },
    },
    validated_under: { ...OBSERVATION_RESOLVER_AUTHORITY },
    operation: "F014D_ACTOR_DIRECT_PERCEPTION",
    decision: evaluated.value.decision,
    verdict: evaluated.value.verdict,
  };
  o.record?.(record);
  const kind = factKind("referee_decision");
  const group: any = {
    campaign_id: context.campaign_id,
    group_id: refereeDecisionGroupId(task_id),
    intent_id: refereeDecisionIntentId(task_id),
    owner: kind.owner,
    facet: kind.facet,
    cause: refereeDecisionCause(task_id),
    rule: o.rule ?? REFEREE_ACTOR_OBSERVATION_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: context.refs.map((r) => ({ key: r.fact_key, version: r.version })),
    depends_on: [...new Set(context.refs.map((r) => r.group_id))],
    writes: [
      {
        key: refereeDecisionKey(task_id),
        owner: kind.owner,
        facet: kind.facet,
        value: record,
        unit: null,
        basis: REFEREE_DECISION_BASIS,
        secrecy: REFEREE_SECRECY,
        expected_version: 0,
      },
    ],
  };
  o.group?.(group);
  return { group, record, taskId: task_id };
}

/** The event group exactly as the Epistemic adapter builds it for an established decision, with the pieces a forger would alter exposed. */
function eventGroup(
  s: ActorScene,
  decisionKey: string,
  o: {
    event?: (e: any) => void;
    group?: (g: any) => void;
    rule?: CommitGroup["rule"];
  } = {},
): CommitGroup {
  const decision = s.campaign.store.getFact(decisionKey)!;
  const record = actorObservationRecordOf(decision)!;
  const derived = deriveActorObservationEvent(record);
  if (!derived.ok) throw new Error(derived.error.message);
  const event: any = structuredClone(derived.value);
  o.event?.(event);
  const kind = factKind("epistemic_access_event");
  const group: any = {
    campaign_id: s.campaign.store.head().campaign_id,
    group_id: observationEventGroupId(event.event_id),
    intent_id: observationEventIntentId(event.event_id),
    owner: kind.owner,
    facet: kind.facet,
    cause: observationEventCause(event.event_id),
    rule: o.rule ?? EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: actorObservationEventReads(record, decision),
    depends_on: actorObservationEventDependencies(record, decision.provenance.group_id),
    writes: [
      {
        key: accessEventKey(event.event_id),
        owner: kind.owner,
        facet: kind.facet,
        value: event,
        unit: null,
        basis: OBSERVATION_EVENT_BASIS,
        secrecy: ACCESS_CLASS_ENGINE_SEALED,
        expected_version: 0,
      },
    ],
  };
  o.group?.(group);
  return group;
}

describe("the actor question is refused, before any host is asked, unless every premise is committed, the actor's own and at its owner's close", () => {
  it("builds for the established scene (the control every refusal below differs from by one fact)", async () => {
    const s = await actorScene(tempDir());
    expect(ask(s).ok).toBe(true);
  });

  it("refuses an actor World-State does not hold coupled to a locus", async () => {
    const s = await actorScene(tempDir(), { noCoupling: true });
    expect(refusal(ask(s))?.code).toBe("CONTEXT_UNAVAILABLE");
    expect(decisions(s)).toBe(0);
  });

  it("refuses a capability whose owner has not closed it: a basis alone is no sense", async () => {
    const s = await actorScene(tempDir(), { noClose: true, noCoupling: true });
    expect(s.campaign.store.getFact(actorCapabilityKey(ACTOR, SIGHT))).toBeUndefined();
    expect(refusal(ask(s))?.code).toBe("CONTEXT_UNAVAILABLE");
  });

  it("refuses a capability that is not the actor's own, and an actor with none", async () => {
    const s = await actorScene(tempDir());
    // another actor has a coupling of its own? none: it has neither coupling nor capability
    expect(refusal(ask(s, { actor: ACTOR_OTHER }))?.code).toBe("CONTEXT_UNAVAILABLE");
    // the capability must be one the named actor owns
    expect(refusal(ask(s, { capability: "keen-hearing" }))?.code).toBe("CONTEXT_UNAVAILABLE");
    expect(refusal(ask(s, { capability: "not a valid identity!" }))?.code).toBe(
      "CONTEXT_UNAVAILABLE",
    );
  });

  it("refuses a Player Character identity: the PC question is a different operation, never passed an NPC and never passed to it", async () => {
    const s = await actorScene(tempDir());
    await s.campaign.releasePlayerCharacter({ ...publication(40), contract: fixtureContract() });
    expect(refusal(ask(s, { actor: FIXTURE_PC_ID }))?.code).toBe("CONTEXT_UNAVAILABLE");
  });

  it("refuses an absent source and a source at another locus with ONE message, so neither cause can be told from the other", async () => {
    const s = await actorScene(tempDir(), { otherLocus: true, otherSource: true });
    expect(ask(s, { source: SOURCE_OTHER }).ok).toBe(true);
    const absent = refusal(ask(s, { source: "source-never-committed" }));
    const elsewhere = refusal(ask(s, { source: SOURCE_ELSEWHERE }));
    expect(absent?.code).toBe("CONTEXT_UNAVAILABLE");
    expect(elsewhere).toEqual(absent);
    expect(LOCUS_ELSEWHERE).not.toBe("");
    expect(decisions(s)).toBe(0);
  });

  it("refuses a source whose owner states no access circumstance: nothing descriptive exists to be perceived", async () => {
    const s = await actorScene(tempDir(), { access: [] }).catch((e: unknown) => e);
    // an undescribed source is either refused at its owner's establishment or refused as a question: it is never delivered
    if (s instanceof Error || !("referee" in (s as object))) return;
    expect(refusal(ask(s as ActorScene))?.code).toBe("CONTEXT_UNAVAILABLE");
  });
});

describe("a raw store.commit cannot forge the retained reading", () => {
  it("accepts exactly the group the adapter builds (the control)", async () => {
    const s = await actorScene(tempDir());
    const { group } = decisionGroup(s);
    const r = await s.campaign.store.commit(group);
    expect(r.ok, JSON.stringify(r.ok ? null : r.error)).toBe(true);
    expect(verifyRefereeIntegrity(s.campaign.store)).toEqual([]);
  });

  it("refuses an actor reading under the generic or the PC direct-perception citation, and a PC citation on nothing else", async () => {
    const s = await actorScene(tempDir());
    for (const rule of [factKind("referee_decision").rule, REFEREE_OBSERVATION_RULE])
      await refused(s, decisionGroup(s, { rule }).group);
    expect(decisions(s)).toBe(0);
  });

  it("refuses a reading that does not carry the resolver context its validation ran under, and one with another authority", async () => {
    const s = await actorScene(tempDir());
    await refused(
      s,
      decisionGroup(s, { record: (r) => (r.validated_under.role = "role.gm") }).group,
    );
    await refused(s, decisionGroup(s, { record: (r) => (r.authority.role = "role.player") }).group);
    await refused(s, decisionGroup(s, { record: (r) => (r.subject = { pc_id: ACTOR }) }).group);
  });

  it("refuses a reading whose verdict is not the one its answer derives, or whose context digest is not the question's", async () => {
    const s = await actorScene(tempDir(), { access: [{ aspect: "exposure", statement: BURIED }] });
    // the answer derives OBSTRUCTED; a record that says ESTABLISHED is refused at the owner, not believed
    await refused(
      s,
      decisionGroup(s, { record: (r) => (r.verdict = "OBSERVATION_ESTABLISHED") }).group,
    );
    const t = await actorScene(tempDir());
    await refused(t, decisionGroup(t, { record: (r) => (r.input.digest = "0".repeat(64)) }).group);
    // another campaign's reading is no reading of this one: the context it was built for carries its campaign
    await refused(t, decisionGroup(t, { record: (r) => (r.campaign_id = "campaign-other") }).group);
    await refused(
      t,
      decisionGroup(t, {
        record: (r) => (r.input.observed_at = { ...ACTOR_BOUNDARY_T, value: 141 }),
      }).group,
    );
  });

  it("refuses a reading that cites other facts than its question was built from, or reads them at other versions", async () => {
    const s = await actorScene(tempDir());
    await refused(s, decisionGroup(s, { record: (r) => r.input.refs.pop() }).group);
    await refused(
      s,
      decisionGroup(s, { record: (r) => (r.input.refs[4].fact_key = r.input.refs[3].fact_key) })
        .group,
    );
    await refused(s, decisionGroup(s, { group: (g) => (g.reads[1].version = 9) }).group);
    await refused(s, decisionGroup(s, { group: (g) => (g.depends_on = []) }).group);
  });

  it("refuses a reading whose answer quotes words its context does not contain, or rests a premise on the wrong kind of text", async () => {
    const s = await actorScene(tempDir());
    await refused(
      s,
      decisionGroup(s, {
        record: (r) => (r.decision.faculty.premises[0].evidence_quote = "perfect eyesight"),
      }).group,
    );
    await refused(
      s,
      decisionGroup(s, {
        record: (r) => {
          r.decision.faculty.premises = [
            { from: "WORLD_FACT", ref: "locus.designation", evidence_quote: "A stone hall" },
          ];
        },
      }).group,
    );
  });
});

describe("a raw store.commit cannot forge the actor's event", () => {
  async function established() {
    const s = await actorScene(tempDir());
    const d = await decide(s);
    return { s, decisionKey: d.record.key };
  }

  it("accepts exactly the group the Epistemic adapter builds (the control)", async () => {
    const { s, decisionKey } = await established();
    const r = await s.campaign.store.commit(eventGroup(s, decisionKey));
    expect(r.ok, JSON.stringify(r.ok ? null : r.error)).toBe(true);
    const formed = await formActorObservedPacket(s.campaign.store, decisionKey);
    expect(formed.ok && formed.value.replayed).toBe(false);
    expect(verifyEpistemicIntegrity(s.campaign.store)).toEqual([]);
  });

  it("refuses an event that is not exactly what its retained decision determines: another payload, recipient, channel, source or basis", async () => {
    const { s, decisionKey } = await established();
    const forged: ((e: any) => void)[] = [
      (e) => (e.payload.content = "a heap of salt, one hundred and twenty sacks of it"),
      (e) => (e.payload.referent = "the heap"),
      (e) => (e.participants = [ACTOR_OTHER]),
      (e) => (e.channel = "OBSERVATION"),
      (e) => (e.source.version = 2),
      (e) => (e.source.fact_key = e.source.fact_key.replace("source-main", "source-other")),
      (e) => (e.established_at = { ...e.established_at, value: 141 }),
      (e) => (e.payload.presented_attribution = "a hand-written note"),
      (e) => (e.representation = { capability_id: SIGHT }),
    ];
    for (const mutate of forged) await refused(s, eventGroup(s, decisionKey, { event: mutate }));
    expect(accessCount(s)).toBe(0);
  });

  it("refuses an event that asserts the active Player Character role: the actor's route never names the PC", async () => {
    const { s, decisionKey } = await established();
    await refused(
      s,
      eventGroup(s, decisionKey, {
        event: (e) => (e.recipient_role = RECIPIENT_ROLE_PLAYER_CHARACTER),
      }),
    );
  });

  it("refuses an event under the PC observation citation, and an event with its decision missing, mis-ordered or replaced", async () => {
    const { s, decisionKey } = await established();
    await refused(s, eventGroup(s, decisionKey, { rule: EPISTEMIC_ACCESS_OBSERVATION_RULE }));
    await refused(
      s,
      eventGroup(s, decisionKey, {
        group: (g) => {
          g.reads = g.reads.slice(1);
          g.depends_on = g.depends_on.slice(1);
        },
      }),
    );
    await refused(s, eventGroup(s, decisionKey, { group: (g) => g.reads.reverse() }));
    await refused(s, eventGroup(s, decisionKey, { group: (g) => (g.depends_on = []) }));
  });

  it("refuses an event under identities other than its event derives, or another basis label", async () => {
    const { s, decisionKey } = await established();
    await refused(
      s,
      eventGroup(s, decisionKey, { group: (g) => (g.group_id = "event-group-forged") }),
    );
    await refused(s, eventGroup(s, decisionKey, { group: (g) => (g.cause = "forged-cause") }));
    await refused(
      s,
      eventGroup(s, decisionKey, {
        group: (g) => (g.writes[0].basis = "direct-perception-forged"),
      }),
    );
  });

  it("refuses an event for a reading that is not an established one: an obstructed, unresolved or conflicting decision earns none", async () => {
    const s = await actorScene(tempDir(), { access: [{ aspect: "exposure", statement: BURIED }] });
    const d = await decide(s);
    expect(d.verdict).toBe("OBSERVATION_OBSTRUCTED");
    const record = actorObservationRecordOf(s.campaign.store.getFact(d.record.key))!;
    const decision = s.campaign.store.getFact(d.record.key)!;
    const kind = factKind("epistemic_access_event");
    const eventId = actorObservationEventId(ACTOR, ACTOR_BOUNDARY_T);
    const group: any = {
      campaign_id: record.campaign_id,
      group_id: observationEventGroupId(eventId),
      intent_id: observationEventIntentId(eventId),
      owner: kind.owner,
      facet: kind.facet,
      cause: observationEventCause(eventId),
      rule: EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: actorObservationEventReads(record, decision),
      depends_on: actorObservationEventDependencies(record, decision.provenance.group_id),
      writes: [
        {
          key: accessEventKey(eventId),
          owner: kind.owner,
          facet: kind.facet,
          value: {
            event_id: eventId,
            mode: "BOUNDED_SHARED_ACCESS",
            participants: [ACTOR],
            source: record.input.refs[4] && {
              owner: "world_state",
              fact_key: record.input.refs[4].fact_key,
              version: record.input.refs[4].version,
            },
            channel: "PERCEPTION",
            established_at: ACTOR_BOUNDARY_T,
            payload: { referent: "a heap", content: "a low heap", presented_attribution: null },
            representation: null,
          },
          unit: null,
          basis: OBSERVATION_EVENT_BASIS,
          secrecy: ACCESS_CLASS_ENGINE_SEALED,
          expected_version: 0,
        },
      ],
    };
    await refused(s, group);
    expect((await formActorObservedPacket(s.campaign.store, d.record.key)).ok).toBe(false);
    expect(accessCount(s)).toBe(0);
  });

  it("refuses a packet formation that no committed event determines: access cannot be conjured", async () => {
    const { s } = await established();
    const eventId = actorObservationEventId(ACTOR, ACTOR_BOUNDARY_T);
    const kind = factKind("epistemic_accessible_packet");
    const prov = factKind("epistemic_sealed_provenance");
    await refused(s, {
      campaign_id: s.campaign.store.head().campaign_id,
      group_id: "forged-formation",
      intent_id: "forged-formation-intent",
      owner: kind.owner,
      facet: kind.facet,
      cause: "forged-formation-cause",
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: [
        {
          key: `access/${eventId}/packet/${ACTOR}`,
          owner: kind.owner,
          facet: kind.facet,
          value: {
            recipient: ACTOR,
            payload: { referent: "a heap", content: "a low heap" },
            presented_attribution: null,
            access: { result: "RECEIVED", channel: "PERCEPTION", established_at: ACTOR_BOUNDARY_T },
            intelligibility: {
              result: "REPRESENTATION_ACCESSIBLE",
              basis: "NO_CAPABILITY_DEPENDENCY",
            },
          },
          unit: null,
          basis: "forged",
          secrecy: "epistemic.actor-accessible",
          expected_version: 0,
        },
        {
          key: `access/${eventId}/provenance/${ACTOR}`,
          owner: prov.owner,
          facet: prov.facet,
          value: {
            event: { fact_key: `access/${eventId}/event`, version: 1 },
            recipient: ACTOR,
            packet: { fact_key: `access/${eventId}/packet/${ACTOR}` },
            source: { owner: "world_state", fact_key: sourceFactKey, version: 1 },
            channel: "PERCEPTION",
            capability_close: null,
          },
          unit: null,
          basis: "forged",
          secrecy: ACCESS_CLASS_ENGINE_SEALED,
          expected_version: 0,
        },
      ],
    } as any);
    expect(accessCount(s)).toBe(0);
  });
});

describe("a second reading of an already observed instant never replaces or re-earns the observation", () => {
  it("keeps the first earned event and its packet, refuses the different reading, and leaves every verifier clean", async () => {
    const s = await actorScene(tempDir());
    const first = await decide(s);
    const formed = await formActorObservedPacket(s.campaign.store, first.record.key);
    expect(formed.ok).toBe(true);
    const eventBefore = structuredClone(
      s.campaign.store.getFact(accessEventKey(actorObservationEventId(ACTOR, ACTOR_BOUNDARY_T)))!,
    );
    // a different reading (another appearance) of the SAME instant is a separate decision (attempt 1) that is retained but earns nothing
    const second = await decide(
      s,
      { referent: "a different heap", content: "something else entirely" },
      { attempt: 1 },
    );
    expect(second.verdict).toBe("OBSERVATION_ESTABLISHED");
    expect(second.task_id).not.toBe(first.task_id);
    const again = await formActorObservedPacket(s.campaign.store, second.record.key);
    expect(again.ok).toBe(false);
    expect(
      s.campaign.store.getFact(accessEventKey(actorObservationEventId(ACTOR, ACTOR_BOUNDARY_T))),
    ).toEqual(eventBefore);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("access/"))).toHaveLength(3);
    // a different source at the same instant is the same refusal: one observation per actor per canonical instant
    const t = await actorScene(tempDir(), { otherSource: true });
    const a = await decide(t);
    expect((await formActorObservedPacket(t.campaign.store, a.record.key)).ok).toBe(true);
    const b = await decide(t, {}, { source: SOURCE_OTHER });
    expect((await formActorObservedPacket(t.campaign.store, b.record.key)).ok).toBe(false);
    expect(verifyEpistemicIntegrity(s.campaign.store)).toEqual([]);
    expect(verifyEpistemicIntegrity(t.campaign.store)).toEqual([]);
    expect(verifyRefereeIntegrity(t.campaign.store)).toEqual([]);
  });
});

describe("the owners stay isolated", () => {
  it("the referee kernel can write no Epistemic key, the Epistemic owner no referee key, and neither can write the actor's capability or coupling", async () => {
    const s = await actorScene(tempDir());
    const d = await decide(s);
    const decisionFact = s.campaign.store.getFact(d.record.key)!;
    const eventId = actorObservationEventId(ACTOR, ACTOR_BOUNDARY_T);
    const referee = factKind("referee_decision");
    const epistemic = factKind("epistemic_access_event");
    const base = (owner: string, facet: string, key: string, value: unknown) =>
      ({
        campaign_id: s.campaign.store.head().campaign_id,
        group_id: `iso-${key.length}`,
        intent_id: `iso-intent-${key.length}`,
        owner,
        facet,
        cause: "iso",
        rule: referee.rule,
        authority: { ...CANON_WRITE_AUTHORITY },
        reads: [],
        depends_on: [],
        writes: [
          { key, owner, facet, value, unit: null, basis: "b", secrecy: "s", expected_version: 0 },
        ],
      }) as any;
    await refused(s, base(referee.owner, referee.facet, accessEventKey(eventId), { forged: true }));
    await refused(
      s,
      base(
        epistemic.owner,
        epistemic.facet,
        refereeDecisionKey("e".repeat(64)),
        decisionFact.value,
      ),
    );
    await refused(
      s,
      base(epistemic.owner, epistemic.facet, actorCapabilityKey(ACTOR, "forged"), {}),
    );
    await refused(s, base(referee.owner, referee.facet, `world-state/actor/${ACTOR}/coupling`, {}));
  });
});

describe("a blocked path of an actor whose sense is not established is UNRESOLVED end to end, and earns no packet (BLUE H2)", () => {
  it("is retained as UNRESOLVED, re-derives on admission and after reopen, and a record that calls it an obstruction is refused", async () => {
    const dir = tempDir();
    const s = await actorScene(dir, { path: SCREEN });
    const d = await decide(s, { noFaculty: true });
    // the scripted host establishes the position (the coupling) and reads the screen as blocking, but cites no sense
    const answer: any = d.answer;
    expect([
      answer.faculty.state,
      answer.position.state,
      answer.path.state,
      answer.payload,
    ]).toEqual(["NOT_ESTABLISHED", "ESTABLISHED", "BLOCKED", null]);
    expect(d.verdict).toBe("OBSERVATION_UNRESOLVED");
    const formed = await formActorObservedPacket(s.campaign.store, d.record.key);
    expect(formed.ok).toBe(false);
    expect(accessCount(s)).toBe(0);
    // admission re-derives: the same reading recorded as an obstruction is refused, the derived verdict is admitted
    const t = await actorScene(tempDir(), { path: SCREEN });
    await refused(
      t,
      decisionGroup(t, {
        rule_answer: { noFaculty: true },
        record: (r) => (r.verdict = "OBSERVATION_OBSTRUCTED"),
      }).group,
    );
    const ok = await t.campaign.store.commit(
      decisionGroup(t, { rule_answer: { noFaculty: true } }).group,
    );
    expect(ok.ok, JSON.stringify(ok.ok ? null : ok.error)).toBe(true);
    // reopened, the retained reading verifies and still earns nothing
    await s.campaign.close();
    const r = await reopenScene(dir);
    expect(verifyRefereeIntegrity(r.campaign.store)).toEqual([]);
    expect(r.campaign.verify()).toEqual([]);
    const record = actorObservationRecordOf(r.campaign.store.getFact(d.record.key))!;
    expect(record.verdict).toBe("OBSERVATION_UNRESOLVED");
    const flipped: any = structuredClone(record);
    flipped.verdict = "OBSERVATION_OBSTRUCTED";
    expect(recordContextViolation(flipped, (k) => r.campaign.store.getFact(k))).toMatchObject({
      code: "DECISION_INCOHERENT",
    });
    expect((await formActorObservedPacket(r.campaign.store, d.record.key)).ok).toBe(false);
    expect(r.campaign.store.listFacts().some((f) => f.key.startsWith("access/"))).toBe(false);
    await r.campaign.close();
  });
});
