// IM-15 causal delivery over the real path: a trusted context that already holds one campaign/recipient/event → the existing
// IM-13 projection → the existing IM-14 presentation, and nothing else. Currentness is revalidated on every call; failures
// are one refusal; campaigns are isolated; delivery is read-only and discovers nothing. Register lineage: IA-18 / IA-19 /
// IA-21 (no status or evidence change); IA-17 lineage; RC-14. Local success is NOT provider/recovery acceptance (IA-07
// BLOCKED) and not an authentication or session claim.
import { describe, expect, it } from "vitest";
import { EventSignalPresentationSchema } from "@immortalis/contracts";
import {
  bindTrustedCausalEventSignalContext,
  bindTrustedEventSignalContext,
  deliverCausalEventSignalPresentation,
  readCurrentEventSignalPresentation,
} from "@immortalis/protocol";
import { ACTOR_SMITH, packetAdvanceRequest } from "@immortalis/testkit";
import { establishAccess, registerPacketConsumer } from "../support/epistemic.ts";
import { CAUSAL_REQUEST, PROTOCOL_REFUSAL, READ_REQUEST } from "../support/protocol.ts";
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

type Seeded = Awaited<ReturnType<typeof seedSignal>>;
const contextOf = (s: Seeded, event_id = EVENT_SIGNAL, recipient_id = PC) =>
  bindTrustedCausalEventSignalContext({ view: viewOf(s), recipient_id, event_id });
const deliver = (s: Seeded, event_id = EVENT_SIGNAL, recipient_id = PC) =>
  deliverCausalEventSignalPresentation(contextOf(s, event_id, recipient_id), CAUSAL_REQUEST());
const ARRIVAL_2 = {
  eventId: EVENT_OTHER,
  consumer: "c2",
  tx: "tx-2",
  continues: "tx-1",
  n: 10,
  boundaryAt: 170,
};

describe("successful causal delivery returns exactly the existing IM-13 → IM-14 result", () => {
  it("the host names no event; the causally bound current arrival is delivered, byte for byte as the existing path presents it", async () => {
    const s = await seedSignal();
    const event = await formPcArrival(s);
    const r = deliver(s);
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
    // identical to the PR #39 event-addressed operation, which remains intact
    expect(JSON.stringify(r)).toBe(
      JSON.stringify(
        readCurrentEventSignalPresentation(
          bindTrustedEventSignalContext({ view: viewOf(s), recipient_id: PC }),
          READ_REQUEST(EVENT_SIGNAL),
        ),
      ),
    );
  });

  it("the host request cannot redirect delivery to another event, recipient or campaign", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    const ctx = contextOf(s);
    const clean = JSON.stringify(deliverCausalEventSignalPresentation(ctx, CAUSAL_REQUEST()));
    expect(JSON.parse(clean).ok).toBe(true);
    for (const over of [
      { event_id: EVENT_OTHER },
      { event_id: EVENT_SIGNAL },
      { recipient_id: ACTOR_SMITH },
      { campaign_id: "b" },
      { view: viewOf(s) },
    ])
      expect(JSON.stringify(deliverCausalEventSignalPresentation(ctx, CAUSAL_REQUEST(over)))).toBe(
        PROTOCOL_REFUSAL,
      );
  });
});

describe("currentness is revalidated: trusted context is not canonical authority", () => {
  it("a wrongly bound recipient is refused although the context is genuine", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    expect(deliver(s).ok).toBe(true);
    expect(JSON.stringify(deliver(s, EVENT_SIGNAL, ACTOR_SMITH))).toBe(PROTOCOL_REFUSAL);
    expect(JSON.stringify(deliver(s, EVENT_SIGNAL, "no-such-entity"))).toBe(PROTOCOL_REFUSAL);
  });

  it("a context that outlives its event's currentness fails closed; it retains nothing and a later arrival is seen at once", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    const stale = contextOf(s, EVENT_SIGNAL);
    const next = contextOf(s, EVENT_OTHER);
    expect(deliverCausalEventSignalPresentation(stale, CAUSAL_REQUEST()).ok).toBe(true);
    expect(JSON.stringify(deliverCausalEventSignalPresentation(next, CAUSAL_REQUEST()))).toBe(
      PROTOCOL_REFUSAL,
    );
    await formPcArrival(s, ARRIVAL_2);
    expect(s.access.packet(EVENT_SIGNAL, PC)).toBeDefined(); // the historical packet still exists …
    expect(JSON.stringify(deliverCausalEventSignalPresentation(stale, CAUSAL_REQUEST()))).toBe(
      PROTOCOL_REFUSAL, // … but is not current, so the old causal context no longer delivers
    );
    expect(deliverCausalEventSignalPresentation(next, CAUSAL_REQUEST()).ok).toBe(true);
  });
});

describe("every rejected case is the same opaque refusal", () => {
  it("absent, unsealed, unknown and malformed events are indistinguishable", async () => {
    const s = await seedSignal();
    const absent = JSON.stringify(deliver(s));
    expect(absent).toBe(PROTOCOL_REFUSAL);
    await formPcArrival(s, { tx: "none" });
    expect(JSON.stringify(deliver(s))).toBe(PROTOCOL_REFUSAL); // no sealed transaction yet
    expect(JSON.stringify(deliver(s, "no-such-event"))).toBe(PROTOCOL_REFUSAL);
    expect(JSON.stringify(deliver(s, "../x"))).toBe(PROTOCOL_REFUSAL);
  });

  it("a Named-Actor event is inaccessible through the active-PC operation and is indistinguishable from an absent event", async () => {
    const s = await seedSignal();
    const named = await establishAccess(s, 2, "event-actor-1", ACTOR_SMITH);
    await registerPacketConsumer(s, "c1", named, null, 3);
    await must(s.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    expect(s.access.packet("event-actor-1", ACTOR_SMITH)).toBeDefined();
    expect(JSON.stringify(deliver(s, "event-actor-1"))).toBe(PROTOCOL_REFUSAL);
    expect(JSON.stringify(deliver(s, "event-actor-1"))).toBe(
      JSON.stringify(deliver(s, "never-existed")),
    );
  });
});

describe("campaign isolation", () => {
  it("same event and PC identifiers in two campaigns: each causal context delivers only its own campaign's arrival", async () => {
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
    const ra = JSON.stringify(deliver(a));
    const rb = JSON.stringify(deliver(b));
    expect(ra).toContain("alpha content");
    expect(ra).not.toContain("beta");
    expect(rb).toContain("beta content");
    expect(rb).not.toContain("alpha");
  });

  it("an event that exists only in the other campaign is refused, and no request field can reach it", async () => {
    const a = await seedSignal();
    const b = await seedSignal();
    await formPcArrival(b, { eventId: "event-only-in-b" });
    expect(JSON.stringify(deliver(a, "event-only-in-b"))).toBe(PROTOCOL_REFUSAL);
    expect(
      JSON.stringify(
        deliverCausalEventSignalPresentation(
          contextOf(a, "event-only-in-b"),
          CAUSAL_REQUEST({ view: viewOf(b), store: b.campaign.store, campaign_id: "b" }),
        ),
      ),
    ).toBe(PROTOCOL_REFUSAL);
    expect(deliver(b, "event-only-in-b").ok).toBe(true);
  });
});

describe("delivery is read-only, causally inert and discovers nothing", () => {
  it("repeated delivery (successful and refused) changes no state, journal, receipt or clock", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    const before = stateDigest(s);
    const facts = s.campaign.store.listFacts().length;
    const first = JSON.stringify(deliver(s));
    for (let i = 0; i < 3; i += 1) {
      expect(JSON.stringify(deliver(s))).toBe(first);
      deliver(s, "no-such-event");
      deliverCausalEventSignalPresentation(contextOf(s), { operation: "listFacts" });
    }
    expect(stateDigest(s)).toEqual(before);
    expect(s.campaign.store.listFacts()).toHaveLength(facts);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("with no identity bound to a current event there is nothing to deliver: delivery never selects the current arrival for itself", async () => {
    const s = await seedSignal();
    await formPcArrival(s); // a current arrival exists …
    for (const wrong of ["", "x", "event-unbound"])
      expect(JSON.stringify(deliver(s, wrong))).toBe(PROTOCOL_REFUSAL); // … and is not found by search
    expect(deliver(s).ok).toBe(true);
  });
});
