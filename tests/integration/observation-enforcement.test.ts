/* eslint-disable @typescript-eslint/no-explicit-any -- tests build raw, hostile groups and objects */
// BLUE v5.2 — active-PC direct physical observation: ENFORCEMENT. Every case here is an attempt to earn a receipt, a packet or an
// engagement WITHOUT the qualified interpretation and the authoritative material reads: a raw store commit, a forged or tampered event,
// a spoofed role, a stale basis, an unbound or foreign reading, a duplicate formation, a hand-written object. The owners' own admission
// refuses each, and a refused write leaves the campaign exactly as it was. The decisions are retained by the engine's own adapter from a
// SCRIPTED host (plumbing only); nothing here says whether any AI reads any sentence correctly.
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_ENGINE_SEALED,
  CANON_WRITE_AUTHORITY,
  OBSERVATION_EVENT_BASIS,
  PLAYER_CHOICE_AUTHORITY,
  REFEREE_AUTHORITY,
  accessEventKey,
  accessPacketKey,
  observationEventCause,
  observationEventGroupId,
  observationEventIntentId,
  observationTransactionId,
  observationTransactionCause,
  OBSERVATION_TRIGGER_KIND,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  EPISTEMIC_ACCESS_OBSERVATION_RULE,
  EpistemicAccessAdapter,
  RefereeAdjudicationAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  deriveObservationEvent,
  epistemicObjectViolation,
  factKind,
  formObservedPacket,
  epistemicPacketDeclaration,
  observationEventDependencies,
  observationEventReads,
  observationRecordOf,
  verifyEpistemicIntegrity,
  epistemicPacketProvider,
} from "@immortalis/engine";
import { packetConsumerObject } from "@immortalis/testkit";
import { openOrdinary } from "../support/locality.ts";
import {
  BASIS,
  PC_ID,
  decide,
  observationAnswer,
  observationCampaign,
  redScene,
  screenScene,
} from "../support/observation.ts";
import { at } from "../support/gip-sunset.ts";

const codeOf = async (p: Promise<{ ok: boolean; error?: { code: string } }>) => {
  const r = await p;
  return r.ok ? "OK" : (r.error?.code ?? "?");
};

async function ready(scene = redScene()) {
  const { dirs } = await observationCampaign({ scene });
  const campaign: CanonicalCampaign = await openOrdinary(dirs.campaignDir);
  const coordinator = new TemporalCoordinator(
    campaign.store,
    new StageProviderRegistry([epistemicPacketProvider]),
  );
  return { dirs, campaign, coordinator };
}

/** The group the Epistemic owner commits for a decision, built by hand so a test can change any part of it. */
function rawEventGroup(
  campaign: CanonicalCampaign,
  decisionKey: string,
  over: {
    event?: (e: any) => void;
    group?: (g: any) => void;
  } = {},
): CommitGroup {
  const decision = campaign.store.getFact(decisionKey)!;
  const record = observationRecordOf(decision)!;
  const event: any = structuredClone(
    deriveObservationEvent(record).ok ? (deriveObservationEvent(record) as any).value : {},
  );
  over.event?.(event);
  const kind = factKind("epistemic_access_event");
  const group: any = {
    campaign_id: campaign.store.head().campaign_id,
    group_id: observationEventGroupId(event.event_id),
    intent_id: observationEventIntentId(event.event_id),
    owner: kind.owner,
    facet: kind.facet,
    cause: observationEventCause(event.event_id),
    rule: EPISTEMIC_ACCESS_OBSERVATION_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: observationEventReads(record, decision),
    depends_on: observationEventDependencies(record, decision.provenance.group_id),
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
  over.group?.(group);
  return group;
}

const accessKeys = (c: CanonicalCampaign) =>
  c.store
    .listFacts()
    .map((f) => f.key)
    .filter((k) => k.startsWith("access/"));

const observationEngagement = (event: any): any => ({
  object_id: `observation-${event.event_id}`,
  owning_ref: { owner: "epistemic_access", process_id: accessEventKey(event.event_id) },
  last_resolved_basis: event.established_at,
  partition: { class: "EXACT-PARTITION" },
  next_boundary: { boundary_id: "held-boundary", at: event.established_at },
  dependencies: [epistemicPacketDeclaration(event)],
  continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
  invalidators: [],
  information_latency: { creates_epistemic_interruption: false },
});

describe("producer-bound admission: the receipt is the retained, engine-derived reading and nothing the caller supplies", () => {
  it("control: the group derived from an ESTABLISHED reading commits (by the adapter and by a raw store commit alike), once", async () => {
    const { campaign } = await ready();
    try {
      const d = await decide(campaign);
      expect(d.verdict).toBe("OBSERVATION_ESTABLISHED");
      expect(await codeOf(campaign.store.commit(rawEventGroup(campaign, d.record.key)))).toBe("OK");
      expect(accessKeys(campaign)).toHaveLength(1);
      // the same intent again is its replay, not a second event
      expect(
        await codeOf(
          new EpistemicAccessAdapter(campaign.store).establishObservedAccess({
            decision_key: d.record.key,
          }),
        ),
      ).toBe("OK");
      expect(accessKeys(campaign)).toHaveLength(1);
    } finally {
      await campaign.close();
    }
  }, 120_000);

  it("refuses every raw event that is not exactly what its retained decision determines", async () => {
    const { campaign } = await ready();
    try {
      const d = await decide(campaign);
      const head = campaign.store.head().state_sha256;
      const hostile: Record<string, Parameters<typeof rawEventGroup>[2]> = {
        "a tampered payload": { event: (e) => (e.payload.content = "a vast golden door") },
        "a tampered referent": { event: (e) => (e.payload.referent = "a different thing") },
        "an attribution the payload never presented": {
          event: (e) => (e.payload.presented_attribution = "the Seal of the Marsh Wardens"),
        },
        "another recipient": { event: (e) => (e.participants = ["pc-someone-else"]) },
        "another channel (speech, not perception)": { event: (e) => (e.channel = "SPEECH") },
        "a representation dependency the decision never had": {
          event: (e) => (e.representation = { capability_id: "cap-sight" }),
        },
        "no active-PC role asserted": { event: (e) => delete e.recipient_role },
        "a future basis": { event: (e) => (e.established_at = at(999)) },
        "a past basis": { event: (e) => (e.established_at = at(1)) },
        "another source version": { event: (e) => (e.source.version = e.source.version + 1) },
        "another source fact": {
          event: (e) => (e.source.fact_key = `world/${"x"}/profile`),
        },
        "another source owner": { event: (e) => (e.source.owner = "referee_adjudication_kernel") },
        "a source that is the decision itself": {
          event: (e) => {
            e.source = { owner: "referee_adjudication_kernel", fact_key: d.record.key, version: 1 };
          },
        },
        "another event identity": { event: (e) => (e.event_id = "obs-forged") },
        "no decision among the reads": { group: (g) => (g.reads = g.reads.slice(1)) },
        "the decision read last": { group: (g) => (g.reads = [...g.reads.slice(1), g.reads[0]]) },
        "a premise left out": { group: (g) => g.reads.splice(2, 1) },
        "a premise read at another version": { group: (g) => (g.reads[1].version += 1) },
        "dependencies left out": { group: (g) => (g.depends_on = g.depends_on.slice(1)) },
        "a stray dependency": { group: (g) => g.depends_on.push("group-stray") },
        "another group identity": { group: (g) => (g.group_id = "group-forged") },
        "another intent identity": { group: (g) => (g.intent_id = "intent-forged") },
        "another cause": { group: (g) => (g.cause = "cause-forged") },
        "another basis label": { group: (g) => (g.writes[0].basis = "authored-basis") },
      };
      for (const [name, over] of Object.entries(hostile)) {
        const r = await campaign.store.commit(rawEventGroup(campaign, d.record.key, over));
        expect(r.ok, name).toBe(false);
        expect(campaign.store.head().state_sha256, name).toBe(head);
        expect(accessKeys(campaign), name).toEqual([]);
      }
    } finally {
      await campaign.close();
    }
  }, 180_000);

  it("refuses a spoofed role or permission, whatever else is right", async () => {
    const { campaign } = await ready();
    try {
      const d = await decide(campaign);
      for (const authority of [
        { ...REFEREE_AUTHORITY },
        { ...PLAYER_CHOICE_AUTHORITY },
        { role: "role.archivist", permission: "permission.player_choice.commit" },
        { role: "role.gm", permission: "permission.canon.write" },
        { role: "role.world", permission: "permission.canon.write" },
        { role: "host.tool", permission: "permission.canon.write" },
        { role: "persona.steward", permission: "permission.canon.write" },
      ])
        expect(
          await codeOf(
            campaign.store.commit(
              rawEventGroup(campaign, d.record.key, { group: (g) => (g.authority = authority) }),
            ),
          ),
        ).toBe("AUTHORITY_DENIED");
      expect(accessKeys(campaign)).toEqual([]);
      // the referee decision itself is accepted only under the trusted gm adjudication context
      const adapter = new RefereeAdjudicationAdapter(campaign.store);
      const spoof = await adapter.recordObservation({
        operation: { ...PLAYER_CHOICE_AUTHORITY },
        host: { host_id: "x", claimed_model: null },
        pc_id: PC_ID,
        attempt: 7,
        answer: {},
      });
      expect(spoof.ok ? "OK" : spoof.error.code).toBe("AUTHORITY_DENIED");
    } finally {
      await campaign.close();
    }
  }, 120_000);

  it("an obstructed, unresolved or conflicting reading earns no event, by the adapter or by hand", async () => {
    for (const [scene, rule, verdict] of [
      [screenScene(), {}, "OBSERVATION_OBSTRUCTED"],
      [redScene(), { noFaculty: true }, "OBSERVATION_UNRESOLVED"],
      [redScene(), { noPosition: true }, "OBSERVATION_UNRESOLVED"],
      [redScene(), { contradicts: /daylight/i }, "OBSERVATION_WORLD_CONFLICT"],
    ] as const) {
      const { campaign } = await ready(scene);
      try {
        const d = await decide(campaign, rule);
        expect(d.verdict).toBe(verdict);
        const viaAdapter = await new EpistemicAccessAdapter(campaign.store).establishObservedAccess(
          { decision_key: d.record.key },
        );
        expect(viaAdapter.ok ? "OK" : viaAdapter.error.code).toBe("OBSERVATION_NOT_ESTABLISHED");
        const viaForm = await formObservedPacket(campaign.store, d.record.key);
        expect(viaForm.ok ? "OK" : viaForm.error.code).toBe("OBSERVATION_NOT_ESTABLISHED");
        // an event written by hand beside that reading is refused: the reading does not determine it
        const red = await ready();
        try {
          const good = await decide(red.campaign);
          const forged = rawEventGroup(red.campaign, good.record.key);
          forged.reads = [{ key: d.record.key, version: 1 }, ...forged.reads.slice(1)];
          expect(
            await codeOf(
              campaign.store.commit({ ...forged, campaign_id: campaign.store.head().campaign_id }),
            ),
          ).not.toBe("OK");
        } finally {
          await red.campaign.close();
        }
        expect(accessKeys(campaign)).toEqual([]);
      } finally {
        await campaign.close();
      }
    }
  }, 300_000);

  it("a PERCEPTION event authored the old way carries no observation citation and earns no engagement (the earlier path is unchanged, not a bypass)", async () => {
    const { campaign, coordinator } = await ready();
    try {
      const authored = {
        event_id: "authored-1",
        mode: "BOUNDED_SHARED_ACCESS",
        participants: [PC_ID],
        source: {
          owner: "world_state",
          fact_key: `world/${campaign.binding()!.value.coupling.world.entity_id}/profile`,
          version: 1,
        },
        channel: "PERCEPTION",
        established_at: BASIS,
        payload: {
          referent: "a patch",
          content: "a broad patch of red",
          presented_attribution: null,
        },
        representation: null,
        recipient_role: "role.player_character",
      };
      const made = await new EpistemicAccessAdapter(campaign.store).establishBoundedSharedAccess({
        group_id: "g-authored",
        intent_id: "i-authored",
        cause: "c-authored",
        basis: "authored-basis",
        event: authored,
      });
      expect(made.ok).toBe(true);
      const fact = campaign.store.getFact(accessEventKey("authored-1"))!;
      // the authored event cannot be given the observation's own engagement ...
      const ev = fact.value as any;
      const engagement = observationEngagement(ev);
      const registered = await coordinator.registerObject({
        group_id: "g-reg",
        intent_id: "i-reg",
        cause: "c-reg",
        basis: "b",
        secrecy: "s",
        object: engagement,
      });
      expect(registered.ok).toBe(false);
      expect(
        epistemicObjectViolation(
          engagement,
          { facts: new Map(campaign.store.listFacts().map((f) => [f.key, f])) },
          true,
        ),
      ).toMatch(/no standalone Epistemic object/);
      // ... and a consequence that could time it elsewhere may declare an OBSERVATION-EARNED event's stage no more than the engagement may
      // be hand-written for an authored one
      const consumer = packetConsumerObject("c1", ev, null);
      expect(
        epistemicObjectViolation(consumer, {
          facts: new Map(campaign.store.listFacts().map((f) => [f.key, f])),
        }),
      ).toBeNull();
    } finally {
      await campaign.close();
    }
  }, 120_000);
});

describe("the observation uses its causal event trigger and cannot register a material boundary at T0", () => {
  async function earned() {
    const s = await ready();
    const d = await decide(s.campaign);
    const made = await new EpistemicAccessAdapter(s.campaign.store).establishObservedAccess({
      decision_key: d.record.key,
    });
    expect(made.ok).toBe(true);
    const eventFact = s.campaign.store.getFact(
      s.campaign.store.listFacts().find((f) => /^access\/[^/]+\/event$/.test(f.key))!.key,
    ) as OwnerFact;
    return { ...s, d, eventFact, event: eventFact.value as any };
  }
  const register = (s: Awaited<ReturnType<typeof earned>>, object: unknown, n = 1) =>
    s.coordinator.registerObject({
      group_id: `g-reg-${n}`,
      intent_id: `i-reg-${n}`,
      cause: `c-reg-${n}`,
      basis: "b",
      secrecy: "s",
      object,
    });

  it("refuses an authored, foreign or retimed trigger before opening authority or forming a packet", async () => {
    const s = await earned();
    try {
      const request = {
        transaction_id: observationTransactionId(s.event.event_id),
        cause: observationTransactionCause(s.event.event_id),
        trigger: { kind: OBSERVATION_TRIGGER_KIND, ref: s.event.event_id },
        continues: null,
        requested: { target: BASIS, condition: null },
        context: { ...PLAYER_CHOICE_AUTHORITY },
        publication: { basis: OBSERVATION_EVENT_BASIS, secrecy: "engine-internal" },
      };
      const before = s.campaign.store.head();
      for (const edit of [
        (r: any) => {
          r.transaction_id = "foreign-transaction";
        },
        (r: any) => {
          r.cause = "foreign-cause";
        },
        (r: any) => {
          r.trigger.ref = "missing-event";
        },
        (r: any) => {
          r.requested.target = at(101);
        },
        (r: any) => {
          r.requested.condition = {
            kind: "STOP_AFTER_BOUNDARY",
            object_id: "foreign",
            boundary_id: "foreign",
          };
        },
      ]) {
        const candidate = structuredClone(request);
        edit(candidate);
        expect((await s.coordinator.advance(candidate)).ok).toBe(false);
        expect(s.campaign.store.head()).toEqual(before);
      }
      expect((await s.coordinator.advance(request)).ok).toBe(true);
      expect(s.coordinator.boundaryIndex().entries).toEqual([]);
      expect(s.campaign.verify()).toEqual([]);
    } finally {
      await s.campaign.close();
    }
  }, 120_000);

  it("refuses an engagement that differs from the determined object in any part", async () => {
    const s = await earned();
    try {
      const good = observationEngagement(s.event);
      const edits: Record<string, (o: any) => void> = {
        "a boundary in the future (invented elapsed time)": (o) => (o.next_boundary.at = at(150)),
        "a boundary in the past": (o) => (o.next_boundary.at = at(50)),
        "a last resolved basis in the past": (o) => (o.last_resolved_basis = at(50)),
        "no boundary (a dormant object nothing engages)": (o) => (o.next_boundary = null),
        "another owner": (o) => (o.owning_ref.owner = "temporal_kernel"),
        "another owning reference": (o) => (o.owning_ref.process_id = "access/other/event"),
        "an extra stage": (o) =>
          o.dependencies.push({
            ...o.dependencies[0],
            stage: { ...o.dependencies[0].stage, causal_process_id: "x" },
            produces: ["x/y"],
          }),
        "no stage": (o) => (o.dependencies = []),
        "an extra read": (o) => o.dependencies[0].reads.push({ ...o.dependencies[0].reads[0] }),
        "an invalidator": (o) => o.invalidators.push({ fact_key: "x" }),
        "another stage owner operation": (o) =>
          (o.dependencies[0].stage.owner_operation.operation = "other"),
        "a close declared": (o) => (o.dependencies[0].declares_close = { name: "c" }),
      };
      for (const [name, edit] of Object.entries(edits)) {
        const o: any = structuredClone(good);
        edit(o);
        expect((await register(s, o, 99)).ok, name).toBe(false);
      }
      expect(s.coordinator.object(good.object_id)).toBeUndefined();
      // the formerly held current-basis object is refused as well, for every attempt
      expect((await register(s, good, 1)).ok).toBe(false);
      expect((await register(s, good, 2)).ok).toBe(false);
      // a second object declaring the same stage at the same instant is a second formation declaration: refused
      const twin: any = structuredClone(good);
      twin.object_id = `${good.object_id}-twin`;
      twin.next_boundary.boundary_id = "twin-boundary";
      expect((await register(s, twin, 3)).ok).toBe(false);
    } finally {
      await s.campaign.close();
    }
  }, 180_000);

  it("a consequence cannot declare an observation-earned event's formation (it could time it elsewhere), and no other kernel object gains the exception", async () => {
    const s = await earned();
    try {
      const consumer = packetConsumerObject("c1", s.event, null);
      expect(
        epistemicObjectViolation(consumer, { facts: new Map([[s.eventFact.key, s.eventFact]]) }),
      ).toMatch(/only by that event's own causal trigger/);
      // the kernel's strictness is unchanged for any object that is not the Epistemic engagement: a boundary at the current time is refused
      const other: any = {
        object_id: "obj-other",
        owning_ref: { owner: "gip", process_id: "p" },
        last_resolved_basis: BASIS,
        partition: { class: "EXACT-PARTITION" },
        next_boundary: { boundary_id: "b", at: BASIS },
        dependencies: [],
        continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
        invalidators: [],
        information_latency: { creates_epistemic_interruption: false },
      };
      const r = await register(s, other, 5);
      expect(r.ok).toBe(false);
      const dormantEpistemic: any = {
        ...structuredClone(observationEngagement(s.event)),
        owning_ref: { owner: "epistemic_access", process_id: "access/none/event" },
      };
      expect((await register(s, dormantEpistemic, 6)).ok).toBe(false);
    } finally {
      await s.campaign.close();
    }
  }, 120_000);

  it("a basis that changed before the engagement is registered refuses it: nothing is formed from a stale observation", async () => {
    const s = await earned();
    try {
      const moved = await s.coordinator.advance({
        transaction_id: "tx-move-time",
        cause: "cause-move",
        trigger: { kind: "fixture", ref: "move" },
        continues: null,
        requested: { target: at(150), condition: null },
        context: { ...PLAYER_CHOICE_AUTHORITY },
        publication: { basis: "b", secrecy: "s" },
      });
      expect(moved.ok).toBe(true);
      expect((await register(s, observationEngagement(s.event), 1)).ok).toBe(false);
      const formed = await formObservedPacket(s.campaign.store, s.d.record.key);
      expect(formed.ok).toBe(false);
      expect(
        s.campaign.store
          .listFacts()
          .filter((f) =>
            f.key.startsWith(accessPacketKey("", "").slice(0, 7) + s.event.event_id + "/packet"),
          ),
      ).toEqual([]);
    } finally {
      await s.campaign.close();
    }
  }, 120_000);
});

describe("version staleness: a changed basis is a different question", () => {
  it("a reading made at one basis earns nothing at another, and cannot be re-recorded at it", async () => {
    const { campaign, coordinator } = await ready();
    try {
      const d = await decide(campaign);
      const moved = await coordinator.advance({
        transaction_id: "tx-move-time",
        cause: "cause-move",
        trigger: { kind: "fixture", ref: "move" },
        continues: null,
        requested: { target: at(150), condition: null },
        context: { ...PLAYER_CHOICE_AUTHORITY },
        publication: { basis: "b", secrecy: "s" },
      });
      expect(moved.ok).toBe(true);
      const stale = await new EpistemicAccessAdapter(campaign.store).establishObservedAccess({
        decision_key: d.record.key,
      });
      expect(stale.ok).toBe(false);
      expect(await codeOf(campaign.store.commit(rawEventGroup(campaign, d.record.key)))).not.toBe(
        "OK",
      );
      expect(accessKeys(campaign)).toEqual([]);
      // the new basis is a new question with its own identity, answered by its own reading
      const adapter = new RefereeAdjudicationAdapter(campaign.store);
      const again = adapter.observationTask({ pc_id: PC_ID, attempt: 0 });
      expect(again.ok && again.value.task_id).not.toBe(d.task_id);
      expect(again.ok && again.value.context.observed_at).toEqual(at(150));
      const fresh = await decide(campaign);
      expect(fresh.task_id).not.toBe(d.task_id);
    } finally {
      await campaign.close();
    }
  }, 120_000);
});

describe("duplicate formation and replay: an observation committed is never overwritten or re-formed", () => {
  it("the same decision again reaches the same records; a different answer for the same instant cannot replace them", async () => {
    const { campaign } = await ready();
    try {
      const d = await decide(campaign);
      const first = await formObservedPacket(campaign.store, d.record.key);
      expect(first.ok && first.value.replayed).toBe(false);
      const snapshot = JSON.stringify(
        campaign.store.listFacts().map((f) => [f.key, f.version, f.provenance.group_id]),
      );
      const second = await formObservedPacket(campaign.store, d.record.key);
      expect(second.ok && second.value.replayed).toBe(true);
      expect(
        JSON.stringify(
          campaign.store.listFacts().map((f) => [f.key, f.version, f.provenance.group_id]),
        ),
      ).toBe(snapshot);

      // another attempt's reading of the same instant cannot overwrite or re-earn the committed observation: an unsettled one earns
      // nothing; a second ESTABLISHED one - identical in effect, or different in the appearance it states - is refused, and every
      // owner record other than the referee's retained evidence is exactly as it was
      const unsettled = await decide(campaign, { noFaculty: true }, 1);
      expect(unsettled.verdict).toBe("OBSERVATION_UNRESOLVED");
      const same = await decide(campaign, {}, 2);
      const different = await decide(campaign, { appearance: "a vast golden door" }, 3);
      expect(same.verdict).toBe("OBSERVATION_ESTABLISHED");
      expect(different.verdict).toBe("OBSERVATION_ESTABLISHED");
      for (const later of [unsettled, same, different]) {
        const refused = await formObservedPacket(campaign.store, later.record.key);
        expect(refused.ok).toBe(false);
      }
      const owned = (rows: string) =>
        JSON.stringify(
          (JSON.parse(rows) as string[][]).filter((x) => !String(x[0]).startsWith("referee/")),
        );
      expect(
        owned(
          JSON.stringify(
            campaign.store.listFacts().map((f) => [f.key, f.version, f.provenance.group_id]),
          ),
        ),
      ).toBe(owned(snapshot));
      const packet = campaign.store
        .listFacts()
        .find((f) => /^access\/[^/]+\/packet\//.test(f.key))!;
      expect((packet.value as any).payload.content).toBe(
        "a broad patch of bright red on pale plaster",
      );
      expect(verifyEpistemicIntegrity(campaign.store)).toEqual([]);
      expect(campaign.verify()).toEqual([]);
    } finally {
      await campaign.close();
    }
  }, 180_000);

  it("a hand-committed packet formation outside the observation's own transaction is refused", async () => {
    const { campaign } = await ready();
    try {
      const d = await decide(campaign);
      await new EpistemicAccessAdapter(campaign.store).establishObservedAccess({
        decision_key: d.record.key,
      });
      const eventFact = campaign.store
        .listFacts()
        .find((f) => /^access\/[^/]+\/event$/.test(f.key))!;
      const eventId = (eventFact.value as any).event_id;
      const kind = factKind("epistemic_accessible_packet");
      const group: any = {
        campaign_id: campaign.store.head().campaign_id,
        group_id: "g-packet",
        intent_id: "i-packet",
        owner: kind.owner,
        facet: kind.facet,
        cause: "transaction:forged",
        rule: kind.rule,
        authority: { ...CANON_WRITE_AUTHORITY },
        reads: [{ key: eventFact.key, version: eventFact.version }],
        depends_on: [eventFact.provenance.group_id],
        writes: [
          {
            key: accessPacketKey(eventId, PC_ID),
            owner: kind.owner,
            facet: kind.facet,
            value: {
              recipient: PC_ID,
              payload: { referent: "a patch", content: "a broad patch of red" },
              presented_attribution: null,
              access: { result: "RECEIVED", channel: "PERCEPTION", established_at: BASIS },
              intelligibility: {
                result: "REPRESENTATION_ACCESSIBLE",
                basis: "NO_CAPABILITY_DEPENDENCY",
              },
            },
            unit: null,
            basis: OBSERVATION_EVENT_BASIS,
            secrecy: "epistemic.actor-accessible",
            expected_version: 0,
          },
        ],
      };
      expect(await codeOf(campaign.store.commit(group))).not.toBe("OK");
      expect(campaign.store.getFact(accessPacketKey(eventId, PC_ID))).toBeUndefined();
    } finally {
      await campaign.close();
    }
  }, 120_000);
});

describe("the answer is the host's reading, bounded by the delivered words: nothing hidden leaks into the packet", () => {
  it("the scripted answer for the delivered context is accepted; an appearance that names the world, locus or character identity is refused", async () => {
    const { campaign } = await ready();
    try {
      const adapter = new RefereeAdjudicationAdapter(campaign.store);
      const task = adapter.observationTask({ pc_id: PC_ID, attempt: 0 });
      if (!task.ok) throw new Error("no task");
      const doc = { task_id: task.value.task_id, context: task.value.context };
      expect(adapter.evaluateObservation(task.value.context, observationAnswer(doc)).ok).toBe(true);
      for (const leak of [
        task.value.context.subject.world_id,
        task.value.context.subject.locus_id,
        task.value.context.subject.pc_id,
        "locus.constraint.2",
        task.value.context.refs[3]!.fact_key,
      ]) {
        const refused = adapter.evaluateObservation(
          task.value.context,
          observationAnswer(doc, { leak: `a patch (${leak})` }),
        );
        expect(refused.ok, leak).toBe(false);
      }
    } finally {
      await campaign.close();
    }
  }, 120_000);
});
