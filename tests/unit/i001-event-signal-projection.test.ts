/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// I-001 Event-Signal Projection derivation (IM-13 / RC-14): every condition of the one derivation is refused, closed and
// opaquely, when its committed input is absent, mismatched, tampered or unlawful. Each case tampers ONE committed fact of an
// otherwise lawful current arrival (the projection reads facts by identity through a read-only view), so a refusal can only
// be that fact. Register lineage: IA-13 (partial), IA-17 (partial).
import { beforeAll, describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  PROJECTION_UNAVAILABLE,
  TEMPORAL_STATE_KEY,
  accessEventKey,
  accessPacketKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { deriveEventSignalProjection, type ProjectionStateView } from "@immortalis/engine";
import {
  EVENT_SIGNAL,
  PC,
  formPcArrival,
  seedSignal,
  viewOf,
  viewWith,
} from "../support/projection.ts";
import type { EpistemicSeeded } from "../support/epistemic.ts";

let s: EpistemicSeeded;
beforeAll(async () => {
  s = await seedSignal();
  await formPcArrival(s);
});

const request = { event_id: EVENT_SIGNAL, recipient_id: PC };
const derive = (view: ProjectionStateView, req: unknown = request) =>
  deriveEventSignalProjection(view, req);
const edit =
  (fn: (value: any) => void) =>
  (f: OwnerFact | undefined): OwnerFact | undefined => {
    if (!f) return f;
    const value = structuredClone(f.value) as any;
    fn(value);
    return { ...f, value };
  };
const retag = (patch: Partial<OwnerFact>) => (f: OwnerFact | undefined) =>
  f ? ({ ...f, ...patch } as OwnerFact) : f;
const absent = () => undefined;
const REFUSED = {
  ok: false,
  error: { code: PROJECTION_UNAVAILABLE, message: "no projection is available" },
};

describe("the lawful current arrival is the only input that projects", () => {
  it("projects (control)", () => {
    expect(derive(viewOf(s)).ok).toBe(true);
  });
});

describe("the addressed viewpoint: the active PC, by the committed Role Registry binding", () => {
  it.each([
    ["no committed binding", { [PLAYER_CHARACTER_BINDING_KEY]: absent }],
    [
      "a binding that names another entity",
      { [PLAYER_CHARACTER_BINDING_KEY]: edit((v) => (v.active_pc.entity_id = "someone-else")) },
    ],
    [
      "a binding fact not owned by the Role Registry",
      { [PLAYER_CHARACTER_BINDING_KEY]: retag({ owner: "world_state" }) },
    ],
    [
      "a malformed binding",
      { [PLAYER_CHARACTER_BINDING_KEY]: edit((v) => (v.binding_slot = "x")) },
    ],
  ])("refuses %s", (_name, override) => {
    expect(derive(viewWith(s, override))).toEqual(REFUSED);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "x"],
    ["a number", 42],
    ["an array", []],
    ["an empty object", {}],
    ["no recipient", { event_id: EVENT_SIGNAL }],
    ["no event", { recipient_id: PC }],
    ["an unmodelled field", { ...request, extra: 1 }],
    ["an empty event identity", { event_id: "", recipient_id: PC }],
    ["a path-like event identity", { event_id: "../x", recipient_id: PC }],
    ["a key-separator recipient identity", { event_id: EVENT_SIGNAL, recipient_id: "a/b" }],
    ["a non-string identity", { event_id: 1, recipient_id: PC }],
  ])("refuses a request that is not exactly an event and a recipient identity: %s", (_n, bad) => {
    expect(deriveEventSignalProjection(viewOf(s), bad)).toEqual(REFUSED);
  });
});

describe("the engine-side event classifies the recipient path and is never projected", () => {
  it.each([
    ["no event", { [accessEventKey(EVENT_SIGNAL)]: absent }],
    [
      "an event of another owner",
      { [accessEventKey(EVENT_SIGNAL)]: retag({ owner: "world_state" }) },
    ],
    [
      "an event that does not assert the active-PC role (a Named-Actor path)",
      { [accessEventKey(EVENT_SIGNAL)]: edit((v) => delete v.recipient_role) },
    ],
    [
      "an event whose participant is another entity",
      { [accessEventKey(EVENT_SIGNAL)]: edit((v) => (v.participants = ["someone-else"])) },
    ],
    [
      "an event under another identity",
      { [accessEventKey(EVENT_SIGNAL)]: edit((v) => (v.event_id = "other")) },
    ],
    [
      "a malformed event",
      { [accessEventKey(EVENT_SIGNAL)]: edit((v) => (v.mode = "BROADCAST_EXPOSURE")) },
    ],
  ])("refuses %s", (_name, override) => {
    expect(derive(viewWith(s, override))).toEqual(REFUSED);
  });
});

describe("the packet is the actor-safe surface and must be exactly the event's received route and payload", () => {
  const key = accessPacketKey(EVENT_SIGNAL, PC);
  it.each([
    ["no packet", { [key]: absent }],
    ["a packet of another owner", { [key]: retag({ owner: "world_state" }) }],
    ["a packet stamped engine-sealed", { [key]: retag({ secrecy: "epistemic.engine-sealed" }) }],
    ["a packet for another recipient", { [key]: edit((v) => (v.recipient = "someone-else")) }],
    ["a payload edited after the event", { [key]: edit((v) => (v.payload.content += " ")) }],
    ["a referent edited after the event", { [key]: edit((v) => (v.payload.referent = "other")) }],
    [
      "an attribution edited after the event",
      { [key]: edit((v) => (v.presented_attribution = null)) },
    ],
    ["a channel edited after the event", { [key]: edit((v) => (v.access.channel = "PERCEPTION")) }],
    [
      "an arrival time edited after the event",
      { [key]: edit((v) => (v.access.established_at.value += 1)) },
    ],
    ["a packet carrying an unmodelled field", { [key]: edit((v) => (v.source = "access/x")) }],
    ["a packet that is not RECEIVED", { [key]: edit((v) => (v.access.result = "NOT_ACCESSED")) }],
  ])("refuses %s", (_name, override) => {
    expect(derive(viewWith(s, override))).toEqual(REFUSED);
  });
});

describe("current arrival is anchored in committed Temporal state and the formation's own authority", () => {
  const txKey = temporalTransactionKey("tx-1");
  it.each([
    ["no temporal state", { [TEMPORAL_STATE_KEY]: absent }],
    [
      "a temporal state of another owner",
      { [TEMPORAL_STATE_KEY]: retag({ owner: "world_state" }) },
    ],
    [
      "a temporal state with no sealed transaction",
      { [TEMPORAL_STATE_KEY]: edit((v) => (v.last_transaction = null)) },
    ],
    ["a latest transaction that is not committed", { [txKey]: absent }],
    ["a latest transaction of another owner", { [txKey]: retag({ owner: "world_state" }) }],
    [
      "a transaction record under another identity",
      { [txKey]: edit((v) => (v.transaction_id = "tx-9")) },
    ],
    [
      "a transaction whose stop is not the canonical time",
      { [txKey]: edit((v) => (v.outcome.actual_stop.value = 150)) },
    ],
    [
      "a transaction that did not record the formation stage",
      { [txKey]: edit((v) => (v.stages = [])) },
    ],
    [
      "a formation record of another group",
      {
        [txKey]: edit((v) => {
          for (const st of v.stages)
            if (st.stage.owner_operation.owner === "epistemic_access") st.group_id = "other";
        }),
      },
    ],
    [
      "a formation record that did not write this packet version",
      {
        [txKey]: edit((v) => {
          for (const st of v.stages)
            if (st.stage.owner_operation.owner === "epistemic_access")
              st.writes = st.writes.map((w: any) => ({ ...w, version: w.version + 1 }));
        }),
      },
    ],
    ["no durable transaction authority", { [temporalTransactionAuthorityKey("tx-1")]: absent }],
  ])("refuses %s", (_name, override) => {
    expect(derive(viewWith(s, override))).toEqual(REFUSED);
  });

  it("refuses an authority whose committing group is not the transaction's authority group", () => {
    const k = temporalTransactionAuthorityKey("tx-1");
    const view = viewWith(s, {
      [k]: (f) => (f ? { ...f, provenance: { ...f.provenance, group_id: "other-group" } } : f),
    });
    expect(derive(view)).toEqual(REFUSED);
  });

  it("refuses when the formation group cannot be found, is another group, or was not opened by the latest transaction", () => {
    const real = viewOf(s);
    expect(derive({ getFact: real.getFact, committedGroup: () => null })).toEqual(REFUSED);
    expect(
      derive({
        getFact: real.getFact,
        committedGroup: (id) => {
          const g = real.committedGroup(id);
          return g ? { ...g, group_id: "other" } : g;
        },
      }),
    ).toEqual(REFUSED);
    expect(
      derive({
        getFact: real.getFact,
        committedGroup: (id) => {
          const g = real.committedGroup(id);
          return g
            ? {
                ...g,
                depends_on: [...g.depends_on.slice(0, -1), "transaction-authority-group:tx-0"],
              }
            : g;
        },
      }),
    ).toEqual(REFUSED);
  });

  it("refuses an arrival that lies in the future of the canonical clock", () => {
    const future = (v: any) => (v.established_at.value = 10_000);
    const view = viewWith(s, {
      [accessEventKey(EVENT_SIGNAL)]: edit(future),
      [accessPacketKey(EVENT_SIGNAL, PC)]: edit((v) => (v.access.established_at.value = 10_000)),
    });
    expect(derive(view)).toEqual(REFUSED);
  });

  it("refuses an arrival in a different time unit than the canonical clock", () => {
    const view = viewWith(s, {
      [accessEventKey(EVENT_SIGNAL)]: edit((v) => (v.established_at.unit = "other-unit")),
      [accessPacketKey(EVENT_SIGNAL, PC)]: edit(
        (v) => (v.access.established_at.unit = "other-unit"),
      ),
    });
    expect(derive(view)).toEqual(REFUSED);
  });
});

describe("an internal failure is the same refusal", () => {
  it("a view that throws yields the one opaque refusal and never an exception or a cause", () => {
    const boom: ProjectionStateView = {
      getFact: () => {
        throw new Error("leaky internal validator detail");
      },
      committedGroup: () => {
        throw new Error("leaky internal validator detail");
      },
    };
    expect(derive(boom)).toEqual(REFUSED);
  });
});
