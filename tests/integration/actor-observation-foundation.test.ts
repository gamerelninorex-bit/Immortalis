/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw documents and arbitrary fact values */
// BLUE v5.2-A1 — NON-PC NAMED-ACTOR SOURCE-QUALIFIED DIRECT PERCEPTION (mechanism only; Sovereign-held PRs #72/#73 untouched). "An already
// established non-PC Named Actor, coupled by World-State to ONE locus, perceives at most ONE owner-committed Source Condition at that locus: a
// bounded F-014D §6 question built only from committed facts, a retained engine-validated reading, and — only where the reading is
// affirmatively established — the Epistemic owner's event, the actor's sealed Accessible Content Packet and the separate Sealed Engine
// Provenance." Every campaign here is built by the shipped owner paths. The scripted host is a policy the TEST wrote (plumbing only): it
// proves what the ENGINE enforces, never that any AI understood any sentence (genuine AI-host semantic evidence is NOT claimed).
import { describe, expect, it } from "vitest";
import {
  EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE,
  REFEREE_ACTOR_OBSERVATION_RULE,
  actorObservationEventId,
  actorObservationRecordOf,
  deriveActorObservationEvent,
  formActorObservedPacket,
  verifyEpistemicIntegrity,
  verifyRefereeIntegrity,
} from "@immortalis/engine";
import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  AccessEventSchema,
  AccessiblePacketSchema,
  OBSERVATION_RESOLVER_AUTHORITY,
  REFEREE_AUTHORITY,
  SealedEngineProvenanceSchema,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  refereeDecisionKey,
  worldLocusKey,
  worldProfileKey,
  worldActorCouplingKey,
} from "@immortalis/contracts";
import { ACTOR_BOUNDARY_T } from "@immortalis/testkit";
import {
  ACTOR,
  BURIED,
  EXPOSED,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  NEUTRAL_CONTENT,
  NEUTRAL_REFERENT,
  SCREEN,
  SECRET,
  SIGHT,
  SILENT,
  SOURCE,
  actorAnswer,
  actorCapabilityKey,
  actorScene,
  decide,
  sourceFactKey,
} from "../support/actor-observation.ts";
import { tempDir } from "../support/tmp.ts";

const accessKeys = (s: Awaited<ReturnType<typeof actorScene>>) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("access/"));

describe("a non-PC Named Actor perceives one co-located Source Condition: question, retained reading, event, packet", () => {
  it("builds the question ONLY from committed facts: the actor's own closed capability, its coupling, the world, the locus and the source's access facts", async () => {
    const s = await actorScene(tempDir());
    const task = s.referee.actorObservationTask({
      actor_id: ACTOR,
      capability_id: SIGHT,
      source_key: SOURCE,
      attempt: 0,
    });
    expect(task.ok).toBe(true);
    if (!task.ok) return;
    const ctx = task.value.context;
    expect(ctx.operation).toBe("F014D_ACTOR_DIRECT_PERCEPTION");
    expect(ctx.subject).toEqual({
      actor_id: ACTOR,
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
    });
    expect(ctx.observed_at).toEqual(ACTOR_BOUNDARY_T);
    // the five cited facts, in order, each at the version committed
    expect(ctx.refs.map((r) => r.fact_key)).toEqual([
      actorCapabilityKey(ACTOR, SIGHT),
      worldActorCouplingKey(ACTOR),
      worldProfileKey(FIXTURE_WORLD_ID),
      worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
      sourceFactKey,
    ]);
    for (const r of ctx.refs) {
      const f = s.campaign.store.getFact(r.fact_key)!;
      expect([r.version, r.group_id]).toEqual([f.version, f.provenance.group_id]);
    }
    // the capability cited is the one the actor owner CLOSED (committed by its declared stage), not merely its basis
    expect(ctx.refs[0]!.fact_key).toBe(actorCapabilityKey(ACTOR, SIGHT));
    // the source is delivered ONLY as its owner-authored access facts
    expect(ctx.facts.filter((f) => f.from === "source").map((f) => f.fact_id)).toEqual([
      "source.access.1",
    ]);
    const delivered = JSON.stringify([ctx.facts, ctx.actor, ctx.statement]);
    for (const secret of [
      SECRET.key,
      SECRET.material,
      SECRET.dimension,
      SECRET.unit,
      SECRET.statement,
      "120",
    ])
      expect(delivered).not.toContain(secret);
    // no PC statement, placement statement, test label, scene or expected result exists in it
    expect(Object.keys(ctx).sort()).toEqual(
      [
        "actor",
        "attempt",
        "campaign_id",
        "facts",
        "observed_at",
        "operation",
        "refs",
        "statement",
        "subject",
      ].sort(),
    );
    // a rerun of the same question is the same task; a different attempt is a different one
    const again = s.referee.actorObservationTask({
      actor_id: ACTOR,
      capability_id: SIGHT,
      source_key: SOURCE,
      attempt: 0,
    });
    expect(again.ok && again.value.task_id).toBe(task.value.task_id);
    const next = s.referee.actorObservationTask({
      actor_id: ACTOR,
      capability_id: SIGHT,
      source_key: SOURCE,
      attempt: 1,
    });
    expect(next.ok && next.value.task_id).not.toBe(task.value.task_id);
  });

  it("an affirmatively established, source-grounded reading earns ONE event, ONE actor packet and a separate sealed provenance", async () => {
    const s = await actorScene(tempDir());
    const timeBefore = structuredClone(s.coordinator.state()!.value.canonical_time);
    const indexBefore = structuredClone(s.coordinator.boundaryIndex());
    const d = await decide(s);
    expect(d.verdict).toBe("OBSERVATION_ESTABLISHED");
    expect(d.disposition).toBe("COMMITTED");

    // the retained reading: create-only RC-09/IM-12 provenance under the actor operation's own citation, role.gm + role.resolver + archivist
    const decision = s.campaign.store.getFact(refereeDecisionKey(d.task_id))!;
    expect(decision.provenance.rule).toEqual(REFEREE_ACTOR_OBSERVATION_RULE);
    expect(decision.secrecy).toBe("engine-internal");
    const record = actorObservationRecordOf(decision)!;
    expect(record.subject).toEqual({ actor_id: ACTOR });
    expect(record.authority).toEqual(REFEREE_AUTHORITY);
    expect(record.validated_under).toEqual(OBSERVATION_RESOLVER_AUTHORITY);
    expect(record.input.observed_at).toEqual(ACTOR_BOUNDARY_T);

    // nothing is a receipt until the Epistemic owner commits the event
    expect(accessKeys(s)).toEqual([]);
    const formed = await formActorObservedPacket(s.campaign.store, decision.key);
    expect(formed.ok).toBe(true);
    if (!formed.ok) return;
    expect(formed.value.replayed).toBe(false);
    const eventId = actorObservationEventId(ACTOR, ACTOR_BOUNDARY_T);
    expect(formed.value.event_id).toBe(eventId);
    expect(formed.value.recipient_id).toBe(ACTOR);

    // the event: the actor, the PERCEPTION channel, the basis time, the Source Condition pinned at its cited version, the payload
    const eventFact = s.campaign.store.getFact(accessEventKey(eventId))!;
    expect(eventFact.owner).toBe("epistemic_access");
    expect(eventFact.provenance.rule).toEqual(EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE);
    const event = AccessEventSchema.parse(eventFact.value);
    expect(event).toEqual({
      event_id: eventId,
      mode: "BOUNDED_SHARED_ACCESS",
      participants: [ACTOR],
      source: { owner: "world_state", fact_key: sourceFactKey, version: 1 },
      channel: "PERCEPTION",
      established_at: ACTOR_BOUNDARY_T,
      payload: {
        referent: NEUTRAL_REFERENT,
        content: NEUTRAL_CONTENT,
        presented_attribution: null,
      },
      representation: null,
    });
    // NOT a Player Character event: no recipient role is asserted
    expect("recipient_role" in event).toBe(false);
    expect(deriveActorObservationEvent(record)).toEqual({ ok: true, value: event });
    // the event's group reads the decision first and then exactly the premises that decision cites, and depends on their groups
    const group = s.campaign.store.committedGroup(eventFact.provenance.intent_id)!;
    expect(group.reads.map((r) => r.key)).toEqual([
      decision.key,
      ...record.input.refs.map((r) => r.fact_key),
    ]);
    expect(group.depends_on).toContain(decision.provenance.group_id);

    // the actor-safe packet and the engine-only sealed provenance, together, each with its own access class
    const packetFact = s.campaign.store.getFact(accessPacketKey(eventId, ACTOR))!;
    const provFact = s.campaign.store.getFact(accessProvenanceKey(eventId, ACTOR))!;
    expect(packetFact.secrecy).toBe(ACCESS_CLASS_ACTOR_ACCESSIBLE);
    expect(provFact.secrecy).toBe(ACCESS_CLASS_ENGINE_SEALED);
    expect(packetFact.provenance.group_id).toBe(provFact.provenance.group_id);
    const packet = AccessiblePacketSchema.parse(packetFact.value);
    expect(packet.recipient).toBe(ACTOR);
    expect(packet.payload).toEqual({ referent: NEUTRAL_REFERENT, content: NEUTRAL_CONTENT });
    expect(packet.presented_attribution).toBeNull();
    expect(packet.access).toEqual({
      result: "RECEIVED",
      channel: "PERCEPTION",
      established_at: ACTOR_BOUNDARY_T,
    });
    expect(packet.intelligibility).toEqual({
      result: "REPRESENTATION_ACCESSIBLE",
      basis: "NO_CAPABILITY_DEPENDENCY",
    });
    // true source identity, engine keys, task details and the secrets of the source never reach the actor's packet; they stay in the sealed provenance
    const actorSide = JSON.stringify(packetFact.value);
    for (const hidden of [
      SECRET.key,
      SECRET.material,
      SECRET.unit,
      "120",
      sourceFactKey,
      decision.key,
      d.task_id,
      FIXTURE_WORLD_ID,
      FIXTURE_LOCUS_ID,
      "world_state",
    ])
      expect(actorSide).not.toContain(hidden);
    const provenance = SealedEngineProvenanceSchema.parse(provFact.value);
    expect(provenance.source).toEqual({
      owner: "world_state",
      fact_key: sourceFactKey,
      version: 1,
    });
    expect(provenance.capability_close).toBeNull();

    // it advanced no time, registered no temporal object and no boundary, and wrote no actor-side state
    expect(s.coordinator.state()!.value.canonical_time).toEqual(timeBefore);
    expect(timeBefore).toEqual(ACTOR_BOUNDARY_T);
    expect(s.coordinator.boundaryIndex()).toEqual(indexBefore);
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/object/")),
    ).toHaveLength(1);
    const writtenAfter = s.campaign.store
      .listFacts()
      .filter((f) => /^actor\//.test(f.key))
      .map((f) => f.key)
      .sort();
    expect(writtenAfter).toEqual(
      [`actor/${ACTOR}/capability-basis/${SIGHT}`, actorCapabilityKey(ACTOR, SIGHT)].sort(),
    );

    // every owner's verifier tells one story
    expect(verifyEpistemicIntegrity(s.campaign.store)).toEqual([]);
    expect(verifyRefereeIntegrity(s.campaign.store)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("running the formation again reaches the same records: nothing is written twice", async () => {
    const s = await actorScene(tempDir());
    const d = await decide(s);
    const first = await formActorObservedPacket(s.campaign.store, refereeDecisionKey(d.task_id));
    expect(first.ok).toBe(true);
    const head = s.campaign.store.head();
    const second = await formActorObservedPacket(s.campaign.store, refereeDecisionKey(d.task_id));
    expect(second.ok && second.value.replayed).toBe(true);
    expect(s.campaign.store.head().revision).toBe(head.revision);
    expect(
      accessKeys(s)
        .map((f) => f.key)
        .sort(),
    ).toHaveLength(3);
    // the same question, the same answer: the retained decision is recovered, never re-decided
    const again = await decide(s);
    expect(again.disposition).toBe("REPLAYED");
    expect(again.task_id).toBe(d.task_id);
  });

  it("only a stated appearance of the source earns a receipt: an open path alone, a silent source or a blocked path earn none", async () => {
    // the owner states nothing about whether the feature can be seen: the scripted host cannot state an appearance
    const silent = await actorScene(tempDir(), {
      access: [{ aspect: "exposure", statement: SILENT }],
    });
    const a = await decide(silent);
    expect(a.verdict).toBe("OBSERVATION_UNRESOLVED");
    // the owner states the feature is buried
    const buried = await actorScene(tempDir(), {
      access: [{ aspect: "exposure", statement: BURIED }],
    });
    const b = await decide(buried);
    expect(b.verdict).toBe("OBSERVATION_OBSTRUCTED");
    // the locus states a screen across the path
    const screened = await actorScene(tempDir(), { path: SCREEN });
    const c = await decide(screened);
    expect(c.verdict).toBe("OBSERVATION_OBSTRUCTED");
    for (const [scene, d] of [
      [silent, a],
      [buried, b],
      [screened, c],
    ] as const) {
      const formed = await formActorObservedPacket(
        scene.campaign.store,
        refereeDecisionKey(d.task_id),
      );
      expect(formed.ok).toBe(false);
      expect(!formed.ok && formed.error.code).toBe("OBSERVATION_NOT_ESTABLISHED");
      // the negative reading is kept as sealed audit evidence and is nothing else: no event, no packet, no provenance
      expect(accessKeys(scene)).toEqual([]);
      expect(scene.campaign.store.getFact(refereeDecisionKey(d.task_id))).toBeDefined();
      expect(verifyRefereeIntegrity(scene.campaign.store)).toEqual([]);
    }
  });

  it("each missing premise withholds the receipt: no sense, no viewing circumstances, an unsettled path or a contradicted fact", async () => {
    const s = await actorScene(tempDir());
    const rules = [
      { noFaculty: true },
      { noPosition: true },
      { pathUnknown: true },
      { contradicts: /Ordinary terrestrial daylight/ },
    ] as const;
    const verdicts: string[] = [];
    for (const [i, rule] of rules.entries()) {
      const d = await decide(s, rule, { attempt: i });
      verdicts.push(d.verdict);
      const formed = await formActorObservedPacket(s.campaign.store, refereeDecisionKey(d.task_id));
      expect(formed.ok).toBe(false);
    }
    expect(verdicts).toEqual([
      "OBSERVATION_UNRESOLVED",
      "OBSERVATION_UNRESOLVED",
      "OBSERVATION_UNRESOLVED",
      "OBSERVATION_WORLD_CONFLICT",
    ]);
    expect(accessKeys(s)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an actor whose only closed capability is not a sense is never given one: the host has nothing to establish the faculty from", async () => {
    const s = await actorScene(tempDir(), { capabilities: ["keen-hearing"] });
    const d = await decide(s, {}, { capability: "keen-hearing" });
    // the scripted host reads only a sight capability as a sense: with none delivered it cites no faculty
    expect(d.verdict).toBe("OBSERVATION_UNRESOLVED");
    expect(
      (d.answer as any).faculty.premises,
      "the faculty is established only by quoted premises",
    ).toEqual([]);
    expect(accessKeys(s)).toEqual([]);
  });

  it("a question whose answer is the exact scripted reading but whose expected result is supplied by the caller does not exist: the answer is never a verdict", async () => {
    const s = await actorScene(tempDir());
    const task = s.referee.actorObservationTask({
      actor_id: ACTOR,
      capability_id: SIGHT,
      source_key: SOURCE,
      attempt: 0,
    });
    if (!task.ok) throw new Error("task");
    const answer: any = actorAnswer({ task_id: task.value.task_id, context: task.value.context });
    // a host that smuggles a verdict, an admission bit or a role is refused by the strict contract
    for (const extra of [
      { verdict: "OBSERVATION_ESTABLISHED" },
      { admitted: true },
      { role: "role.gm" },
    ]) {
      const e = s.referee.evaluateActorObservation(task.value.context, { ...answer, ...extra });
      expect(e.ok).toBe(false);
      expect(!e.ok && e.error.code).toBe("DECISION_INPUT_INVALID");
    }
    const ok = s.referee.evaluateActorObservation(task.value.context, answer);
    expect(ok.ok && ok.value.verdict).toBe("OBSERVATION_ESTABLISHED");
    expect(EXPOSED).toContain("in full view");
  });
});
