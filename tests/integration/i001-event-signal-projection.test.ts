// I-001 Active-PC Event-Signal Projection (IM-13 / RC-14): one CURRENT F-014D Accessible Content Packet of the canonically
// active Player Character produces one disposable, non-canonical, player-facing Event-Signal Projection. Projection only:
// no prose, no cognition, no memory/retrieval, no state write, no time advance.
// Register lineage: IA-13 (partial), IA-17 (partial); RC-11, RC-14; IM-13 over IM-10/IM-02. Local success is NOT
// provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  EventSignalProjectionSchema,
  PROJECTION_UNAVAILABLE,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  pcCapabilityKey,
  temporalTransactionKey,
} from "@immortalis/contracts";
import { deriveEventSignalProjection } from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  at,
  packetAdvanceRequest,
  packetConsumerObject,
  pcCapabilityContract,
  temporalPublication,
} from "@immortalis/testkit";
import {
  establishAccess,
  registerPacketConsumer,
  reopenEpistemic,
  seededEpistemicCampaign,
} from "../support/epistemic.ts";
import {
  EVENT_OTHER,
  EVENT_SIGNAL,
  PC,
  formPcArrival,
  seedSignal,
  stateDigest,
  viewOf,
} from "../support/projection.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const project = (
  s: Awaited<ReturnType<typeof seedSignal>>,
  eventId = EVENT_SIGNAL,
  recipient = PC,
) => deriveEventSignalProjection(viewOf(s), { event_id: eventId, recipient_id: recipient });

describe("the current active-PC arrival produces one safe, disposable Event-Signal Projection", () => {
  it("the packet formed by the latest sealed transaction projects exactly the received contact, payload and presented attribution", async () => {
    const s = await seedSignal();
    const event = await formPcArrival(s);
    const r = project(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      projection: "EVENT_SIGNAL",
      disposable: true,
      viewpoint: { role: "role.player_character", entity_id: PC },
      contact: { channel: event.channel },
      payload: { referent: event.payload.referent, content: event.payload.content },
      presented_attribution: event.payload.presented_attribution,
    });
    expect(EventSignalProjectionSchema.safeParse(r.value).success).toBe(true);
  });

  it("a capability-dependent PC packet projects too, without exposing the capability, its close or its marker", async () => {
    const s = await seedSignal({ pcContract: pcCapabilityContract() });
    await formPcArrival(s, { capability: true });
    const r = project(s);
    expect(r.ok).toBe(true);
    const json = JSON.stringify(r);
    expect(json).not.toContain(CAP_METALWORKING);
    expect(json).not.toContain(pcCapabilityKey(PC, CAP_METALWORKING));
    expect(json).not.toContain("close");
    expect(json).not.toContain("intelligib");
    expect(json).not.toContain("capability");
  });

  it("nothing is projected before the packet exists, before its transaction is sealed, or for an event that was merely established", async () => {
    const s = await seedSignal();
    await formPcArrival(s, { tx: "none" }); // event established, consequence registered, nothing resolved
    expect(project(s).ok).toBe(false);
    expect(s.access.packet(EVENT_SIGNAL, PC)).toBeUndefined();
    await must(s.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    expect(project(s).ok).toBe(true);
  });

  it("derivation is read-only: no commit, no new fact, no canonical-time advance, no Epistemic/world/PC/actor write; repeating it changes nothing and returns the same value", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    const before = stateDigest(s);
    const factsBefore = JSON.stringify(s.campaign.store.listFacts());
    const first = project(s);
    for (let i = 0; i < 5; i++) expect(project(s)).toEqual(first);
    expect(stateDigest(s)).toEqual(before);
    expect(JSON.stringify(s.campaign.store.listFacts())).toBe(factsBefore);
    // a refusal writes nothing either
    expect(project(s, "no-such-event").ok).toBe(false);
    expect(stateDigest(s)).toEqual(before);
  });

  it("the projection is not state: no key under access/ or temporal/ is written for it, and the packet and sealed provenance stay byte-identical", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    const keys = [
      accessEventKey(EVENT_SIGNAL),
      accessPacketKey(EVENT_SIGNAL, PC),
      accessProvenanceKey(EVENT_SIGNAL, PC),
    ];
    const snap = () => JSON.stringify(keys.map((k) => s.campaign.store.getFact(k)));
    const before = snap();
    const keyCount = s.campaign.store.listFacts().length;
    project(s);
    expect(snap()).toBe(before);
    expect(s.campaign.store.listFacts()).toHaveLength(keyCount);
  });
});

describe("a stored historical packet is never recall: only the current arrival is projected", () => {
  it("after a later sealed transaction forms another arrival, the earlier packet remains stored and intact but projects nothing", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    expect(project(s).ok).toBe(true);
    const stored = JSON.stringify(s.access.packet(EVENT_SIGNAL, PC));
    // a second consequence at a later boundary forms a second arrival in a second transaction
    await formPcArrival(s, {
      eventId: EVENT_OTHER,
      consumer: "c2",
      tx: "tx-2",
      continues: "tx-1",
      n: 10,
      boundaryAt: 170,
    });
    expect(project(s, EVENT_OTHER).ok).toBe(true);
    const old = project(s, EVENT_SIGNAL);
    expect(old.ok).toBe(false);
    // storage did not change, and nothing "expired" it: it is merely no longer the current arrival
    expect(JSON.stringify(s.access.packet(EVENT_SIGNAL, PC))).toBe(stored);
  });

  it("a later consequence that re-declares and adopts the earlier formation by identity does not make it current again", async () => {
    const s = await seedSignal();
    const event = await formPcArrival(s);
    expect(project(s).ok).toBe(true);
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(20),
        object: packetConsumerObject("c3", event, null, {
          next_boundary: { boundary_id: "packet-consumer-boundary-c3", at: at(170) },
        }),
      }),
    );
    const r = await must(
      s.coordinator.advance(
        packetAdvanceRequest("tx-2", "c3", {
          continues: "tx-1",
          requested: {
            target: at(200),
            condition: {
              kind: "STOP_AFTER_BOUNDARY",
              object_id: "packet-consumer-obj-c3",
              boundary_id: "packet-consumer-boundary-c3",
            },
          },
        }),
      ),
    );
    // the second transaction records the adopted formation among its stages ...
    expect(
      r.transaction.stages.some((st) => st.stage.owner_operation.owner === "epistemic_access"),
    ).toBe(true);
    // ... yet the arrival stays historical: it was formed by tx-1, not by the latest transaction
    expect(project(s).ok).toBe(false);
  });

  it("an unrelated later transaction with no PC arrival in it ends the current arrival of the one before", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    expect(project(s).ok).toBe(true);
    // an unrelated later transaction (no PC arrival in it) moves the latest transaction past the arrival
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(21),
        object: packetConsumerObject(
          "c4",
          await establishAccess(s, 22, "event-actor-1", ACTOR_SMITH),
          null,
          { next_boundary: { boundary_id: "packet-consumer-boundary-c4", at: at(180) } },
        ),
      }),
    );
    await must(s.coordinator.advance(packetAdvanceRequest("tx-2", "c4", { continues: "tx-1" })));
    expect(project(s).ok).toBe(false);
  });

  it("nothing re-presents it later: reopening the saved campaign does not resurrect a historical packet, and still projects the current one", async () => {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    await formPcArrival(s);
    await s.campaign.close();
    const re = await reopenEpistemic(dir);
    expect(project(re).ok).toBe(true);
    expect(re.campaign.verify()).toEqual([]);
    await formPcArrival(re, {
      eventId: EVENT_OTHER,
      consumer: "c2",
      tx: "tx-2",
      continues: "tx-1",
      n: 10,
      boundaryAt: 170,
    });
    expect(project(re, EVENT_SIGNAL).ok).toBe(false);
    expect(project(re, EVENT_OTHER).ok).toBe(true);
    await re.campaign.close();
    const again = await reopenEpistemic(dir);
    expect(project(again, EVENT_SIGNAL).ok).toBe(false);
    expect(project(again, EVENT_OTHER).ok).toBe(true);
  });
});

describe("wrong, inactive and ineligible inputs fail closed", () => {
  it("a Named-Actor recipient's current packet is never projected, as itself or as the PC's", async () => {
    const s = await seedSignal();
    const event = await establishAccess(s, 2, "event-actor-1", ACTOR_SMITH);
    await registerPacketConsumer(s, "c1", event, null, 3);
    await must(s.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    expect(s.access.packet("event-actor-1", ACTOR_SMITH)).toBeDefined(); // a current, real packet
    expect(project(s, "event-actor-1", ACTOR_SMITH).ok).toBe(false);
    expect(project(s, "event-actor-1", PC).ok).toBe(false);
  });

  it("a wrong recipient on the PC's own current event is refused, and so is an unknown event or recipient", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    expect(project(s, EVENT_SIGNAL, ACTOR_SMITH).ok).toBe(false);
    expect(project(s, EVENT_SIGNAL, "nobody").ok).toBe(false);
    expect(project(s, "no-such-event", PC).ok).toBe(false);
  });

  it("an event established for a Named-Actor identity is not the PC's packet even if that identity were the PC", async () => {
    const s = await seedSignal();
    const event = await establishAccess(s, 2, "event-actor-2", ACTOR_SMITH);
    await registerPacketConsumer(s, "c1", event, null, 3);
    await must(s.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    expect(project(s, "event-actor-2", PC).ok).toBe(false);
  });

  it("the refusal is one code, one message and no details", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    const r = project(s, "no-such-event");
    expect(r).toEqual({
      ok: false,
      error: { code: PROJECTION_UNAVAILABLE, message: "no projection is available" },
    });
  });

  it("a campaign with no sealed resolution transaction has no current arrival", async () => {
    const s = await seedSignal();
    await establishAccess(s, 2, "event-x", PC, { recipient_role: "role.player_character" });
    expect(project(s, "event-x").ok).toBe(false);
    expect(s.campaign.store.getFact(temporalTransactionKey("tx-1"))).toBeUndefined();
  });
});

describe("existing Epistemic and save behavior stays compatible", () => {
  it("the projection adds no owner, kind or key space: a saved campaign still verifies, reloads byte-identically and keeps the same current arrival", async () => {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir, { pcContract: pcCapabilityContract() });
    await formPcArrival(s, { capability: true });
    const projected = project(s);
    expect(projected.ok).toBe(true);
    const before = stateDigest(s);
    const packet = s.access.packet(EVENT_SIGNAL, PC);
    await s.campaign.close();
    const re = await reopenEpistemic(dir);
    expect(re.campaign.verify()).toEqual([]);
    expect(stateDigest(re)).toEqual(before);
    expect(re.access.packet(EVENT_SIGNAL, PC)).toEqual(packet);
    expect(project(re)).toEqual(projected);
    expect(re.campaign.store.head().state_sha256).toBe(before.state_sha256);
  });
});
