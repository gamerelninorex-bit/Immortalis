// IM-15 over the real path: a trusted campaign/player context + one named event → the existing IM-13 projection → the existing
// IM-14 presentation, and nothing else. Isolation between two separately bound campaigns, read-only behavior and
// save → close → reopen. Register lineage: IA-18 / IA-19 / IA-21 (partial); IA-17 lineage; RC-14. Local success is NOT
// provider/recovery acceptance (IA-07 BLOCKED) and not an authentication or session claim.
import { describe, expect, it } from "vitest";
import { EventSignalPresentationSchema } from "@immortalis/contracts";
import { presentEventSignal, deriveEventSignalProjection } from "@immortalis/engine";
import {
  bindTrustedEventSignalContext,
  readCurrentEventSignalPresentation,
} from "@immortalis/protocol";
import { ACTOR_SMITH, FIXTURE_PC_ID } from "@immortalis/testkit";
import { establishAccess, registerPacketConsumer, reopenEpistemic } from "../support/epistemic.ts";
import { PROTOCOL_REFUSAL, READ_REQUEST } from "../support/protocol.ts";
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
import { packetAdvanceRequest } from "@immortalis/testkit";
import { seededEpistemicCampaign } from "../support/epistemic.ts";

type Seeded = Awaited<ReturnType<typeof seedSignal>>;
const contextOf = (s: Seeded, recipient = PC) =>
  bindTrustedEventSignalContext({ view: viewOf(s), recipient_id: recipient });
const read = (s: Seeded, eventId = EVENT_SIGNAL, recipient = PC) =>
  readCurrentEventSignalPresentation(contextOf(s, recipient), READ_REQUEST(eventId));

describe("the operation returns exactly the existing IM-13 → IM-14 result", () => {
  it("a current active-PC arrival is returned as the lawful presentation, byte for byte what the existing path produces", async () => {
    const s = await seedSignal();
    const event = await formPcArrival(s);
    const r = read(s);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(r)).toBe(JSON.stringify(presentPath(viewOf(s))));
    if (!r.ok) return;
    expect(EventSignalPresentationSchema.safeParse(r.value).success).toBe(true);
    expect(r.value.elements).toEqual([
      { element: "CONTACT", channel: event.channel },
      { element: "PRESENTED_ATTRIBUTION", text: event.payload.presented_attribution },
      { element: "REFERENT", text: event.payload.referent },
      { element: "CONTENT", text: event.payload.content },
    ]);
    // equal to presenting the IM-13 projection directly: no protocol correction, enrichment or prose
    const projection = deriveEventSignalProjection(viewOf(s), {
      event_id: EVENT_SIGNAL,
      recipient_id: PC,
    });
    if (!projection.ok) throw new Error("expected a projection");
    expect(r).toEqual(presentEventSignal(projection.value));
  });

  it("a carrier that presented no source yields no attribution element, and a false attribution is returned as presented", async () => {
    const none = await seedSignal();
    await formPcArrival(none, {
      over: {
        payload: { referent: "the quarry road", content: "closed", presented_attribution: null },
      },
    });
    const a = read(none);
    expect(a.ok && a.value.elements.map((e) => e.element)).toEqual([
      "CONTACT",
      "REFERENT",
      "CONTENT",
    ]);
    const falseSource = await seedSignal();
    await formPcArrival(falseSource, {
      over: {
        payload: {
          referent: "the gate rota",
          content: "the gate opens at first light",
          presented_attribution: "bearing the seal of a Warden who never wrote it",
        },
      },
    });
    const b = read(falseSource);
    expect(JSON.stringify(b)).toContain("a Warden who never wrote it");
  });

  it("the context's recipient is still validated against canonical active-PC state: a wrongly bound recipient is refused", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    expect(read(s).ok).toBe(true);
    expect(JSON.stringify(read(s, EVENT_SIGNAL, ACTOR_SMITH))).toBe(PROTOCOL_REFUSAL);
    expect(JSON.stringify(read(s, EVENT_SIGNAL, "no-such-entity"))).toBe(PROTOCOL_REFUSAL);
  });
});

describe("unavailable, stale, historical, inaccessible or non-current events all fail closed with the one refusal", () => {
  it("no event, an event with no sealed transaction yet, an unknown event, a malformed event id", async () => {
    const s = await seedSignal();
    expect(JSON.stringify(read(s))).toBe(PROTOCOL_REFUSAL);
    await formPcArrival(s, { tx: "none" });
    expect(JSON.stringify(read(s))).toBe(PROTOCOL_REFUSAL);
    expect(JSON.stringify(read(s, "no-such-event"))).toBe(PROTOCOL_REFUSAL);
    expect(
      JSON.stringify(readCurrentEventSignalPresentation(contextOf(s), READ_REQUEST("../x"))),
    ).toBe(PROTOCOL_REFUSAL);
  });

  it("a stored historical packet is not readable once a later arrival is current; the later one is", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    expect(read(s).ok).toBe(true);
    await formPcArrival(s, {
      eventId: EVENT_OTHER,
      consumer: "c2",
      tx: "tx-2",
      continues: "tx-1",
      n: 10,
      boundaryAt: 170,
    });
    expect(s.access.packet(EVENT_SIGNAL, PC)).toBeDefined();
    expect(JSON.stringify(read(s, EVENT_SIGNAL))).toBe(PROTOCOL_REFUSAL);
    expect(read(s, EVENT_OTHER).ok).toBe(true);
  });

  it("a Named-Actor event is inaccessible through the active-PC operation and is indistinguishable from an absent event", async () => {
    const s = await seedSignal();
    const event = await establishAccess(s, 2, "event-actor-1", ACTOR_SMITH);
    await registerPacketConsumer(s, "c1", event, null, 3);
    await must(s.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    expect(s.access.packet("event-actor-1", ACTOR_SMITH)).toBeDefined();
    const named = JSON.stringify(read(s, "event-actor-1"));
    expect(named).toBe(PROTOCOL_REFUSAL);
    expect(named).toBe(JSON.stringify(read(s, "never-existed")));
  });
});

describe("two separately bound campaigns cannot cross-read, even when event identifiers collide", () => {
  it("same event id and PC id in two campaigns: each context reads only its own campaign's arrival", async () => {
    const a = await seedSignal();
    const b = await seedSignal();
    await formPcArrival(a, {
      over: {
        payload: { referent: "alpha ford", content: "alpha content", presented_attribution: null },
      },
    });
    await formPcArrival(b, {
      over: {
        payload: { referent: "beta ford", content: "beta content", presented_attribution: null },
      },
    });
    const ca = contextOf(a);
    const cb = contextOf(b);
    const ra = JSON.stringify(readCurrentEventSignalPresentation(ca, READ_REQUEST(EVENT_SIGNAL)));
    const rb = JSON.stringify(readCurrentEventSignalPresentation(cb, READ_REQUEST(EVENT_SIGNAL)));
    expect(ra).toContain("alpha content");
    expect(ra).not.toContain("beta");
    expect(rb).toContain("beta content");
    expect(rb).not.toContain("alpha");
  });

  it("an event that exists only in the other campaign is unavailable here, and no request field can select the other campaign", async () => {
    const a = await seedSignal();
    const b = await seedSignal();
    await formPcArrival(b, { eventId: "event-only-in-b" });
    const ca = contextOf(a);
    for (const over of [
      {},
      { campaign_id: "b" },
      { campaign: "b" },
      { recipient_id: FIXTURE_PC_ID },
      { view: "b" },
    ])
      expect(
        JSON.stringify(
          readCurrentEventSignalPresentation(ca, READ_REQUEST("event-only-in-b", over)),
        ),
      ).toBe(PROTOCOL_REFUSAL);
    expect(
      JSON.stringify(
        readCurrentEventSignalPresentation(contextOf(b), READ_REQUEST("event-only-in-b")),
      ),
    ).toContain('"ok":true');
  });

  it("a context bound to one campaign cannot be rebound by passing another campaign's view in the request", async () => {
    const a = await seedSignal();
    const b = await seedSignal();
    await formPcArrival(b);
    expect(
      JSON.stringify(
        readCurrentEventSignalPresentation(
          contextOf(a),
          READ_REQUEST(EVENT_SIGNAL, { view: viewOf(b), store: b.campaign.store }),
        ),
      ),
    ).toBe(PROTOCOL_REFUSAL);
  });
});

describe("the operation is read-only and causally inert", () => {
  it("repeated reads (successful and refused) change no state, journal, receipt or clock, and return the same value", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    const before = stateDigest(s);
    const facts = s.campaign.store.listFacts().length;
    const first = JSON.stringify(read(s));
    for (let i = 0; i < 3; i += 1) {
      expect(JSON.stringify(read(s))).toBe(first);
      read(s, "no-such-event");
      readCurrentEventSignalPresentation(contextOf(s), { operation: "getFact", event_id: "x" });
    }
    expect(stateDigest(s)).toEqual(before);
    expect(s.campaign.store.listFacts()).toHaveLength(facts);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a context retains nothing: the arrival is re-derived on every call, so a later arrival is seen at once", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    const ctx = contextOf(s);
    expect(readCurrentEventSignalPresentation(ctx, READ_REQUEST(EVENT_SIGNAL)).ok).toBe(true);
    await formPcArrival(s, {
      eventId: EVENT_OTHER,
      consumer: "c2",
      tx: "tx-2",
      continues: "tx-1",
      n: 10,
      boundaryAt: 170,
    });
    expect(
      JSON.stringify(readCurrentEventSignalPresentation(ctx, READ_REQUEST(EVENT_SIGNAL))),
    ).toBe(PROTOCOL_REFUSAL);
    expect(readCurrentEventSignalPresentation(ctx, READ_REQUEST(EVENT_OTHER)).ok).toBe(true);
  });
});

describe("save → close → reopen: predecessor behavior is unchanged by the operation", () => {
  it("a reopened campaign, newly bound, yields the same presentation; the saved package is unchanged by reading", async () => {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    await formPcArrival(s);
    const before = JSON.stringify(read(s));
    expect(JSON.parse(before).ok).toBe(true);
    const digest = stateDigest(s);
    await s.campaign.close();
    const re = await reopenEpistemic(dir);
    expect(JSON.stringify(read(re))).toBe(before);
    expect(stateDigest(re)).toEqual(digest);
    expect(re.campaign.verify()).toEqual([]);
  });
});
