// NPK Event-Signal Presentation (IM-14) over the real path: a current F-014D Accessible Content Packet of the active Player
// Character → the existing IM-13 Event-Signal Projection → one disposable presentation of exactly that projection. Presentation
// exists only where the lawful projection exists; it writes nothing and advances no time. Register lineage: IA-17 (partial);
// RC-14; IM-13 → IM-14. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import { EventSignalPresentationSchema } from "@immortalis/contracts";
import { deriveEventSignalProjection, presentEventSignal } from "@immortalis/engine";
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
import { presentPath } from "../support/presentation.ts";
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

const present = (
  s: Awaited<ReturnType<typeof seedSignal>>,
  eventId = EVENT_SIGNAL,
  recipient = PC,
) => presentPath(viewOf(s), eventId, recipient);

const REFUSAL = JSON.stringify({
  ok: false,
  error: { code: "PROJECTION_UNAVAILABLE", message: "no projection is available" },
});

describe("the current active-PC arrival is presented exactly as the projection carries it", () => {
  it("packet → IM-13 projection → presentation: contact, presented attribution, referent and content, in the fixed order", async () => {
    const s = await seedSignal();
    const event = await formPcArrival(s);
    const r = present(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      presentation: "NPK_EVENT_SIGNAL",
      disposable: true,
      form: "EVENT_SIGNAL",
      viewpoint: { role: "role.player_character", entity_id: PC },
      elements: [
        { element: "CONTACT", channel: event.channel },
        { element: "PRESENTED_ATTRIBUTION", text: event.payload.presented_attribution },
        { element: "REFERENT", text: event.payload.referent },
        { element: "CONTENT", text: event.payload.content },
      ],
    });
    expect(EventSignalPresentationSchema.safeParse(r.value).success).toBe(true);
  });

  it("an event whose carrier presented no source yields a presentation with no attribution element", async () => {
    const s = await seedSignal();
    const base = await formPcArrival(s, {
      over: {
        payload: {
          referent: "the quarry road",
          content: "the road is closed",
          presented_attribution: null,
        },
      },
    });
    const r = present(s);
    expect(r.ok && r.value.elements).toEqual([
      { element: "CONTACT", channel: base.channel },
      { element: "REFERENT", text: "the quarry road" },
      { element: "CONTENT", text: "the road is closed" },
    ]);
  });

  it("the presentation is exactly the presentation of the projection: the presenter was handed nothing else", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    const projection = deriveEventSignalProjection(viewOf(s), {
      event_id: EVENT_SIGNAL,
      recipient_id: PC,
    });
    if (!projection.ok) throw new Error("expected a projection");
    expect(present(s)).toEqual(presentEventSignal(projection.value));
    // the same value rendered from a detached copy of the projection alone is identical: no other input exists
    expect(JSON.stringify(present(s))).toBe(
      JSON.stringify(presentEventSignal(JSON.parse(JSON.stringify(projection.value)))),
    );
  });

  it("a capability-dependent PC packet is presented without exposing the capability, its close or its marker", async () => {
    const s = await seedSignal({ pcContract: pcCapabilityContract() });
    await formPcArrival(s, { capability: true });
    const r = present(s);
    expect(r.ok).toBe(true);
    const json = JSON.stringify(r);
    for (const w of [CAP_METALWORKING, "close", "intelligib", "capability", "marker"])
      expect(json, w).not.toContain(w);
  });

  it("presenting is read-only and repeatable: no write, no clock movement, the same value each time", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    const before = stateDigest(s);
    const facts = s.campaign.store.listFacts().length;
    const first = JSON.stringify(present(s));
    for (let i = 0; i < 3; i += 1) expect(JSON.stringify(present(s))).toBe(first);
    expect(stateDigest(s)).toEqual(before);
    expect(s.campaign.store.listFacts()).toHaveLength(facts);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("no presentation when the lawful projection is unavailable or not current", () => {
  it("nothing is presented before the arrival's packet is formed, or before its transaction seals", async () => {
    const s = await seedSignal();
    expect(JSON.stringify(present(s))).toBe(REFUSAL); // no event at all
    await formPcArrival(s, { tx: "none" }); // event + consumer registered, no resolution transaction yet
    expect(JSON.stringify(present(s))).toBe(REFUSAL);
  });

  it("a stored historical packet is not presented again once a later arrival becomes current", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    expect(present(s).ok).toBe(true);
    await formPcArrival(s, {
      eventId: EVENT_OTHER,
      consumer: "c2",
      tx: "tx-2",
      continues: "tx-1",
      n: 10,
      boundaryAt: 170,
    });
    expect(s.access.packet(EVENT_SIGNAL, PC)).toBeDefined(); // stored, byte-identical, but no recall basis
    expect(JSON.stringify(present(s, EVENT_SIGNAL))).toBe(REFUSAL);
    expect(present(s, EVENT_OTHER).ok).toBe(true);
  });

  it("an unrelated later transaction ends the arrival's currency, and with it the presentation", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    expect(present(s).ok).toBe(true);
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(20),
        object: packetConsumerObject(
          "c4",
          await establishAccess(s, 22, "event-actor-1", ACTOR_SMITH),
          null,
          { next_boundary: { boundary_id: "packet-consumer-boundary-c4", at: at(180) } },
        ),
      }),
    );
    await must(s.coordinator.advance(packetAdvanceRequest("tx-2", "c4", { continues: "tx-1" })));
    expect(JSON.stringify(present(s))).toBe(REFUSAL);
  });

  it("a Named-Actor recipient's current packet and a wrong or unknown recipient or event are never presented", async () => {
    const s = await seedSignal();
    const event = await establishAccess(s, 2, "event-actor-1", ACTOR_SMITH);
    await registerPacketConsumer(s, "c1", event, null, 3);
    await must(s.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    expect(s.access.packet("event-actor-1", ACTOR_SMITH)).toBeDefined();
    for (const [e, r] of [
      ["event-actor-1", ACTOR_SMITH],
      ["event-actor-1", PC],
      [EVENT_SIGNAL, PC],
      ["no-such-event", "nobody"],
    ] as const)
      expect(JSON.stringify(present(s, e, r)), `${e}/${r}`).toBe(REFUSAL);
  });

  it("an unavailable projection is not a presentation opportunity through the presenter either: its refusal, or nothing, is all it can be handed", async () => {
    const s = await seedSignal();
    const refused = deriveEventSignalProjection(viewOf(s), {
      event_id: EVENT_SIGNAL,
      recipient_id: PC,
    });
    expect(refused.ok).toBe(false);
    expect(JSON.stringify(presentEventSignal(refused))).toBe(REFUSAL);
    expect(JSON.stringify(presentEventSignal(undefined))).toBe(REFUSAL);
    expect(JSON.stringify(presentEventSignal({ event_id: EVENT_SIGNAL, recipient_id: PC }))).toBe(
      REFUSAL,
    );
  });
});

describe("save → close → reopen: predecessor behavior is unchanged outside this disposable consumer", () => {
  it("a reopened campaign presents the same current arrival, never a historical one, and verifies clean", async () => {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    await formPcArrival(s);
    const before = JSON.stringify(present(s));
    expect(JSON.parse(before).ok).toBe(true);
    const digest = stateDigest(s);
    await s.campaign.close();
    const re = await reopenEpistemic(dir);
    expect(JSON.stringify(present(re))).toBe(before);
    expect(stateDigest(re)).toEqual(digest); // presenting before and after reopen wrote nothing
    expect(re.campaign.verify()).toEqual([]);
    await formPcArrival(re, {
      eventId: EVENT_OTHER,
      consumer: "c2",
      tx: "tx-2",
      continues: "tx-1",
      n: 10,
      boundaryAt: 170,
    });
    expect(JSON.stringify(present(re, EVENT_SIGNAL))).toBe(REFUSAL);
    expect(present(re, EVENT_OTHER).ok).toBe(true);
    await re.campaign.close();
    const again = await reopenEpistemic(dir);
    expect(JSON.stringify(present(again, EVENT_SIGNAL))).toBe(REFUSAL);
    expect(present(again, EVENT_OTHER).ok).toBe(true);
    expect(again.campaign.verify()).toEqual([]);
  });

  it("presenting adds nothing to the saved campaign: the package bytes' revision, journal and state hash are those before it", async () => {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    await formPcArrival(s);
    const saved = stateDigest(s);
    present(s);
    present(s, "no-such-event");
    expect(stateDigest(s)).toEqual(saved);
    await s.campaign.close();
    const re = await reopenEpistemic(dir);
    expect(stateDigest(re)).toEqual(saved);
  });
});
