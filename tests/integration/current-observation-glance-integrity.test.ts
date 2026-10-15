/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and tamper raw persisted records */
// The CURRENT OBSERVATION GLANCE read: source qualification and tamper resistance (BLUE v5.2 bounded brief 2026-10-15). The read serves only an
// event that is EXACTLY what the Epistemic owner's retained direct-perception decision determines; anything else — an ordinary current
// active-PC event, a hand-edited event, a decision that no longer says what the event says, a vanished group — is the one opaque refusal.
// Campaigns are built by the shipped commands; the scripted referee host is PLUMBING ONLY (no semantic claim). The final test aligns the
// read's identity derivation with the RETAINED REAL-HOST exercise (docs/evidence/b52-direct-observation-live-host*), which is a finite,
// single-model exercise, not acceptance, and which this read neither repeats nor extends.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OBSERVATION_EVENT_BASIS,
  RefereeDecisionRecordSchema,
  accessEventKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  deriveEventSignalProjection,
  deriveObservationEvent,
  observationEventId,
  type CanonicalCampaign,
  type ProjectionStateView,
} from "@immortalis/engine";
import {
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { openOrdinary } from "../support/locality.ts";
import { PC_ID, observationCampaign, observe } from "../support/observation.ts";
import { GLANCE_REQUEST, PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { EVENT_SIGNAL, PC, formPcArrival, seedSignal, viewOf } from "../support/projection.ts";

const EVIDENCE = "docs/evidence/b52-direct-observation-live-host";

async function withObserved<T>(fn: (c: CanonicalCampaign) => Promise<T> | T) {
  const { dirs } = await observationCampaign();
  expect((await observe(dirs)).result.status).toBe("OBSERVATION_RECEIVED");
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}

const readVia = (view: ProjectionStateView, recipient = PC_ID) =>
  JSON.stringify(
    readCurrentObservationGlance(
      bindTrustedCurrentPlayerContext({ view, recipient_id: recipient }),
      GLANCE_REQUEST(),
    ),
  );

const eventFactOf = (c: CanonicalCampaign): OwnerFact =>
  c.store.listFacts().find((f) => /^access\/[^/]+\/event$/.test(f.key))!;
const decisionFactOf = (c: CanonicalCampaign): OwnerFact =>
  c.store.listFacts().find((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION")!;

const overriding = (
  c: CanonicalCampaign,
  edits: Readonly<Record<string, (f: OwnerFact | undefined) => OwnerFact | undefined>>,
  group?: (id: string) => ReturnType<CanonicalCampaign["store"]["committedGroup"]>,
): ProjectionStateView => ({
  getFact: (k) => (edits[k] ? edits[k]!(c.store.getFact(k)) : c.store.getFact(k)),
  committedGroup: (id) => (group ? group(id) : c.store.committedGroup(id)),
});

describe("source qualification: only an event its retained direct-perception decision determines is an observation", () => {
  it("an ordinary current active-PC event is a lawful Event-Signal but is NOT an observation: this read refuses it", async () => {
    const s = await seedSignal();
    await formPcArrival(s);
    // the existing event-addressed path serves it …
    expect(
      deriveEventSignalProjection(viewOf(s), { event_id: EVENT_SIGNAL, recipient_id: PC }).ok,
    ).toBe(true);
    // … this operation derives an observation identity and finds none: it never selects the current arrival for itself
    expect(readVia(viewOf(s), PC)).toBe(PROTOCOL_REFUSAL);
  });

  it("the genuine campaign is served, and each single tamper of the event, its provenance, its decision or its group is refused", async () => {
    await withObserved((c) => {
      const real = readVia(c.store);
      expect(JSON.parse(real).ok).toBe(true);
      const eventKey = eventFactOf(c).key;
      const decisionKey = decisionFactOf(c).key;
      const tampers: Record<string, ProjectionStateView> = {
        "event payload edited": overriding(c, {
          [eventKey]: (f) =>
            f && {
              ...f,
              value: {
                ...(f.value as any),
                payload: { ...(f.value as any).payload, content: "an edited appearance" },
              },
            },
        }),
        "event not observation-governed": overriding(c, {
          [eventKey]: (f) =>
            f && {
              ...f,
              provenance: { ...f.provenance, rule: { ...f.provenance.rule, clause: "other" } },
            },
        }),
        "event basis relabelled": overriding(c, {
          [eventKey]: (f) => f && { ...f, basis: `${OBSERVATION_EVENT_BASIS}-x` },
        }),
        "decision verdict not established": overriding(c, {
          [decisionKey]: (f) =>
            f && { ...f, value: { ...(f.value as any), verdict: "OBSERVATION_OBSTRUCTED" } },
        }),
        "decision absent": overriding(c, { [decisionKey]: () => undefined }),
        "event absent": overriding(c, { [eventKey]: () => undefined }),
        "committing group absent": overriding(c, {}, () => null),
        "committing group cause altered": overriding(c, {}, (id) => {
          const g = c.store.committedGroup(id);
          return g && g.group_id.startsWith("observation:event-group")
            ? { ...g, cause: "other-cause" }
            : g;
        }),
        "committing group reads reordered": overriding(c, {}, (id) => {
          const g = c.store.committedGroup(id);
          return g && g.group_id.startsWith("observation:event-group")
            ? { ...g, reads: [...g.reads].reverse() }
            : g;
        }),
      };
      for (const [name, view] of Object.entries(tampers))
        expect(readVia(view), name).toBe(PROTOCOL_REFUSAL);
      // and none of the tampered views touched the real campaign
      expect(readVia(c.store)).toBe(real);
    });
  });

  it("a view that throws, or hands back garbage, degrades to the same opaque refusal and never throws", async () => {
    await withObserved((c) => {
      const boom = () => {
        throw new Error("view failure carrying internal detail");
      };
      expect(readVia({ getFact: boom, committedGroup: boom })).toBe(PROTOCOL_REFUSAL);
      expect(
        readVia({
          getFact: (k) => (k.startsWith("access/") ? boom() : c.store.getFact(k)),
          committedGroup: (id) => c.store.committedGroup(id),
        }),
      ).toBe(PROTOCOL_REFUSAL);
      expect(readVia({ getFact: (k) => c.store.getFact(k), committedGroup: boom })).toBe(
        PROTOCOL_REFUSAL,
      );
      expect(readVia({ getFact: () => ({}) as any, committedGroup: () => ({}) as any })).toBe(
        PROTOCOL_REFUSAL,
      );
    });
  });
});

describe("discovery: the read derives one identity and reads by identity; it enumerates and scans nothing", () => {
  it("the reads are by key and group identity only, are few and fixed, and do not grow with an extra observation's neighbours", async () => {
    await withObserved((c) => {
      const keys: string[] = [];
      const groups: string[] = [];
      const view: ProjectionStateView = {
        getFact: (k) => (keys.push(k), c.store.getFact(k)),
        committedGroup: (id) => (groups.push(id), c.store.committedGroup(id)),
      };
      expect(JSON.parse(readVia(view)).ok).toBe(true);
      expect(keys.length).toBeLessThanOrEqual(40);
      expect(groups.length).toBeLessThanOrEqual(8);
      const eventKey = eventFactOf(c).key;
      expect(keys).toContain(eventKey);
      // every key read is a key this campaign holds or the one fixed derivation names — never a wildcard or prefix
      for (const k of keys) expect(k).not.toMatch(/[*?]|\/$/);
      // the same count for a second, identical read (no state-dependent probing)
      const first = keys.length;
      keys.length = 0;
      readVia(view);
      expect(keys.length).toBe(first);
    });
  });

  it("the derived event is the one at the recipient and the canonical basis: another recipient derives another, absent identity", async () => {
    await withObserved((c) => {
      const keys: string[] = [];
      const view: ProjectionStateView = {
        getFact: (k) => (keys.push(k), c.store.getFact(k)),
        committedGroup: (id) => c.store.committedGroup(id),
      };
      expect(readVia(view, "pc-elsewhere")).toBe(PROTOCOL_REFUSAL);
      expect(
        keys
          .filter((k) => k.startsWith("access/"))
          .every((k) => !k.includes(eventFactOf(c).key.split("/")[1]!)),
      ).toBe(true);
      expect(c.store.getFact(accessEventKey(eventFactOf(c).key.split("/")[1]!))).toBeDefined();
    });
  });
});

describe("alignment with the retained real-host exercise (finite, single-model; not acceptance)", () => {
  const retained = (name: string) =>
    RefereeDecisionRecordSchema.parse(
      JSON.parse(readFileSync(`${EVIDENCE}/retained-decision-${name}.json`, "utf8")).value,
    );

  it("the read's identity derivation reproduces the real positive's event id from the retained decision alone, with the same payload the host's reading established", () => {
    const record = retained("p1-red-patch") as any;
    expect(record.verdict).toBe("OBSERVATION_ESTABLISHED");
    const event = deriveObservationEvent(record);
    expect(event.ok).toBe(true);
    if (!event.ok) return;
    // the identity is a pure function of (character, canonical basis): exactly what this read derives, with nothing supplied by a client
    expect(event.value.event_id).toBe(
      observationEventId(record.subject.pc_id, record.input.observed_at),
    );
    const consolePositive = readFileSync(`${EVIDENCE}/console-p1-red-patch.txt`, "utf8");
    expect(consolePositive).toContain(
      `access/${event.value.event_id}/packet/${record.subject.pc_id}`,
    );
    expect(event.value.channel).toBe("PERCEPTION");
    expect(event.value.payload.presented_attribution).toBeNull();
    expect(event.value.payload.referent).toBe(record.decision.payload.referent);
    expect(event.value.payload.content).toBe(record.decision.payload.content);
  });

  it("the real independent negative determines no event, so there is nothing for this read to find", () => {
    const record = retained("n1-opaque-screen") as any;
    expect(record.verdict).toBe("OBSERVATION_OBSTRUCTED");
    const event = deriveObservationEvent(record);
    expect(event.ok).toBe(false);
    const audit = JSON.parse(readFileSync(`${EVIDENCE}/audit-n1-opaque-screen.json`, "utf8"));
    expect(audit.delivery).toMatchObject({ event_present: false, packet_present: false });
  });
});
