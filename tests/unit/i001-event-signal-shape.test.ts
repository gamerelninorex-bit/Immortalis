// I-001 Event-Signal Projection — RC-14 / IM-13 control-flow shape: no concealed cause may leak through which lookups or
// validation steps run. Asserted DIRECTLY on the read sequence the derivation makes and on the steps it executes (never on
// wall-clock timing): every cause — success, wrong or inactive recipient, a stored non-current packet, a tampered fact,
// malformed input, a throwing view — makes the same eight identity reads in the same order and runs every step, in order.
// Register lineage: IA-13 (partial), IA-17 (partial).
import { beforeAll, describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_STATE_KEY,
  accessEventKey,
  accessPacketKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  EVENT_SIGNAL_DERIVATION_STEPS,
  deriveEventSignalProjection,
  traceEventSignalDerivation,
  type ProjectionStateView,
} from "@immortalis/engine";
import { ACTOR_SMITH } from "@immortalis/testkit";
import {
  EVENT_OTHER,
  EVENT_SIGNAL,
  PC,
  formPcArrival,
  seedSignal,
  viewOf,
  viewWith,
} from "../support/projection.ts";
import type { EpistemicSeeded } from "../support/epistemic.ts";

let s: EpistemicSeeded;
let historical: EpistemicSeeded;
beforeAll(async () => {
  s = await seedSignal();
  await formPcArrival(s);
  historical = await seedSignal();
  await formPcArrival(historical);
  await formPcArrival(historical, {
    eventId: EVENT_OTHER,
    consumer: "c2",
    tx: "tx-2",
    continues: "tx-1",
    n: 10,
    boundaryAt: 170,
  });
});

type Call = readonly ["getFact" | "committedGroup", string];

/** Wraps a view so every identity read is recorded, in order. */
const recording = (inner: ProjectionStateView) => {
  const calls: Call[] = [];
  const view: ProjectionStateView = {
    getFact: (k) => {
      calls.push(["getFact", k]);
      return inner.getFact(k);
    },
    committedGroup: (id) => {
      calls.push(["committedGroup", id]);
      return inner.committedGroup(id);
    },
  };
  return { view, calls };
};

const absent = () => undefined;
const retag = (patch: Partial<OwnerFact>) => (f: OwnerFact | undefined) =>
  f ? ({ ...f, ...patch } as OwnerFact) : f;
const req = (eventId = EVENT_SIGNAL, recipient = PC) => ({
  event_id: eventId,
  recipient_id: recipient,
});
const throwing: ProjectionStateView = {
  getFact: () => {
    throw new Error("internal");
  },
  committedGroup: () => {
    throw new Error("internal");
  },
};

interface Cause {
  readonly name: string;
  readonly view: () => ProjectionStateView;
  readonly request: unknown;
  readonly ok: boolean;
}
const causes: Cause[] = [
  { name: "the current arrival", view: () => viewOf(s), request: req(), ok: true },
  { name: "an unknown event", view: () => viewOf(s), request: req("no-such-event"), ok: false },
  {
    name: "an unknown recipient",
    view: () => viewOf(s),
    request: req(EVENT_SIGNAL, "nobody"),
    ok: false,
  },
  {
    name: "a wrong recipient",
    view: () => viewOf(s),
    request: req(EVENT_SIGNAL, ACTOR_SMITH),
    ok: false,
  },
  { name: "a malformed request", view: () => viewOf(s), request: { event_id: 1 }, ok: false },
  { name: "a null request", view: () => viewOf(s), request: null, ok: false },
  { name: "a hostile identity", view: () => viewOf(s), request: req("../../x", PC), ok: false },
  {
    name: "a stored, no-longer-current packet",
    view: () => viewOf(historical),
    request: req(),
    ok: false,
  },
  {
    name: "no binding",
    view: () => viewWith(s, { [PLAYER_CHARACTER_BINDING_KEY]: absent }),
    request: req(),
    ok: false,
  },
  {
    name: "no event",
    view: () => viewWith(s, { [accessEventKey(EVENT_SIGNAL)]: absent }),
    request: req(),
    ok: false,
  },
  {
    name: "no packet",
    view: () => viewWith(s, { [accessPacketKey(EVENT_SIGNAL, PC)]: absent }),
    request: req(),
    ok: false,
  },
  {
    name: "a packet of another secrecy class",
    view: () =>
      viewWith(s, {
        [accessPacketKey(EVENT_SIGNAL, PC)]: retag({ secrecy: "epistemic.engine-sealed" }),
      }),
    request: req(),
    ok: false,
  },
  {
    name: "no temporal state",
    view: () => viewWith(s, { [TEMPORAL_STATE_KEY]: absent }),
    request: req(),
    ok: false,
  },
  {
    name: "a missing formation group",
    view: () => ({ getFact: viewOf(s).getFact, committedGroup: () => null }),
    request: req(),
    ok: false,
  },
  { name: "a throwing view", view: () => throwing, request: req(), ok: false },
];

describe("every cause runs the same steps in the same order", () => {
  it("the declared shape is the one fixed sequence", () => {
    expect([...EVENT_SIGNAL_DERIVATION_STEPS]).toEqual([
      "request",
      "read:binding",
      "read:ledger",
      "read:event",
      "read:packet",
      "read:state",
      "read:transaction",
      "read:authority",
      "read:formation",
      "parse:event",
      "parse:packet",
      "parse:state",
      "parse:transaction",
      "check:recipient",
      "check:packet",
      "check:arrival",
      "check:formation",
      "compose",
      "verdict",
    ]);
  });

  it.each(causes)(
    "$name: every step executes exactly once, in order, whatever the outcome",
    (c) => {
      const { result, steps } = traceEventSignalDerivation(c.view(), c.request);
      expect(steps).toEqual([...EVENT_SIGNAL_DERIVATION_STEPS]);
      expect(result.ok).toBe(c.ok);
    },
  );

  it("tracing changes nothing: the traced result equals the plain result for every cause", () => {
    for (const c of causes)
      expect(traceEventSignalDerivation(c.view(), c.request).result, c.name).toEqual(
        deriveEventSignalProjection(c.view(), c.request),
      );
  });
});

describe("every cause makes the same eight identity reads in the same order", () => {
  const shape = (calls: readonly Call[]) => calls.map(([m]) => m);
  const expectedMethods = [
    "getFact",
    "getFact",
    "getFact",
    "getFact",
    "getFact",
    "getFact",
    "getFact",
    "committedGroup",
  ];

  it.each(causes)("$name: exactly seven getFact reads then one committedGroup read", (c) => {
    const { view, calls } = recording(c.view());
    deriveEventSignalProjection(view, c.request);
    expect(shape(calls)).toEqual(expectedMethods);
  });

  it("the read order is binding, ledger, event, packet, state, transaction, authority, formation — for every cause", () => {
    for (const c of causes) {
      const { view, calls } = recording(c.view());
      deriveEventSignalProjection(view, c.request);
      const keys = calls.map(([, k]) => k);
      expect(keys[0], c.name).toBe(PLAYER_CHARACTER_BINDING_KEY);
      expect(keys[1], c.name).toMatch(/^population\//);
      expect(keys[2], c.name).toMatch(/^access\/[^/]+\/event$/);
      expect(keys[3], c.name).toMatch(/^access\/[^/]+\/packet\/[^/]+$/);
      expect(keys[4], c.name).toBe(TEMPORAL_STATE_KEY);
      expect(keys[5], c.name).toMatch(/^temporal\/transaction\/[^/]+$/);
      expect(keys[6], c.name).toMatch(/^temporal\/transaction-authority\/[^/]+$/);
      expect(calls[7]![0], c.name).toBe("committedGroup");
    }
  });

  it("a read whose identity would depend on an absent value reads a sentinel instead of being skipped", () => {
    // no temporal state: the transaction and authority identities are unknown, yet both reads still happen
    const none = recording(viewWith(s, { [TEMPORAL_STATE_KEY]: absent }));
    deriveEventSignalProjection(none.view, req());
    expect(none.calls[5]).toEqual(["getFact", "temporal/transaction/-"]);
    expect(none.calls[6]).toEqual(["getFact", "temporal/transaction-authority/-"]);
    // no packet: the formation identity is unknown, yet the formation read still happens
    const noPacket = recording(viewWith(s, { [accessPacketKey(EVENT_SIGNAL, PC)]: absent }));
    deriveEventSignalProjection(noPacket.view, req());
    expect(noPacket.calls[7]).toEqual(["committedGroup", "-"]);
    // a malformed request: the event, packet and ledger reads still happen, on sentinel identities
    const bad = recording(viewOf(s));
    deriveEventSignalProjection(bad.view, { nope: true });
    expect(bad.calls.map(([, k]) => k).slice(1, 4)).toEqual([
      "population/-/ledger",
      "access/-/event",
      "access/-/packet/-",
    ]);
  });

  it("a view that throws on every read still gets all eight reads and all steps, and the same refusal", () => {
    const { view, calls } = recording(throwing);
    expect(deriveEventSignalProjection(view, req())).toEqual(
      deriveEventSignalProjection(viewOf(s), req("no-such-event")),
    );
    expect(calls).toHaveLength(8);
  });

  it("the read count is bounded by the shape, not by the data: a long history adds no read", () => {
    const { view, calls } = recording(viewOf(historical));
    deriveEventSignalProjection(view, req(EVENT_SIGNAL));
    deriveEventSignalProjection(view, req(EVENT_OTHER));
    expect(calls).toHaveLength(16);
  });
});
