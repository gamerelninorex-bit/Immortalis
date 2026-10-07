// NPK Event-Signal Presentation — security: the presentation is a function of the lawful projection alone, so hidden source,
// provenance, capability or Temporal state cannot change it, concealed state cannot be recovered through it, a refusal reveals
// no cause, and the received payload / presented attribution is rendered as received and never corrected against hidden truth.
// Register lineage: IA-17 (partial); RC-14; IM-14.
import { beforeAll, describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  pcCapabilityKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  deriveEventSignalProjection,
  presentEventSignal,
  type ProjectionStateView,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  SOURCE_SPEAKER,
  SYNTH_ACCESS_SOURCE_OWNER,
  pcCapabilityContract,
  sourceKey,
} from "@immortalis/testkit";
import { presentPath } from "../support/presentation.ts";
import {
  EVENT_OTHER,
  EVENT_SIGNAL,
  PC,
  formPcArrival,
  seedSignal,
  stateDigest,
  viewOf,
  viewWith,
} from "../support/projection.ts";
import type { EpistemicSeeded } from "../support/epistemic.ts";
import { spyStore } from "../support/temporal.ts";

let s: EpistemicSeeded;
beforeAll(async () => {
  s = await seedSignal({ pcContract: pcCapabilityContract() });
  await formPcArrival(s, { capability: true });
});

const projectionOf = (view: ProjectionStateView) =>
  deriveEventSignalProjection(view, { event_id: EVENT_SIGNAL, recipient_id: PC });
const bump =
  (value: unknown) =>
  (f: OwnerFact | undefined): OwnerFact | undefined =>
    f ? ({ ...f, value, version: f.version + 1 } as OwnerFact) : f;
const drop = () => undefined;

describe("changing hidden source / provenance state without changing the lawful projection cannot change the presentation", () => {
  const baseline = () => JSON.stringify(presentPath(viewOf(s)));
  const hidden: [string, string, (f: OwnerFact | undefined) => OwnerFact | undefined][] = [
    [
      "the true source's value",
      sourceKey(SOURCE_SPEAKER),
      bump("SYNTHETIC FIXTURE: a different hidden truth."),
    ],
    ["the true source, absent", sourceKey(SOURCE_SPEAKER), drop],
    [
      "the sealed engine provenance, replaced",
      accessProvenanceKey(EVENT_SIGNAL, PC),
      bump({ garbage: true }),
    ],
    ["the sealed engine provenance, absent", accessProvenanceKey(EVENT_SIGNAL, PC), drop],
    [
      "the PC capability fact, replaced",
      pcCapabilityKey(PC, CAP_METALWORKING),
      bump({ level: "different" }),
    ],
    ["the PC capability fact, absent", pcCapabilityKey(PC, CAP_METALWORKING), drop],
  ];

  it.each(hidden)(
    "%s: the projection is unchanged, and so is the presentation, byte for byte",
    (_n, key, change) => {
      const changed = viewWith(s, { [key]: change });
      expect(JSON.stringify(projectionOf(changed))).toBe(JSON.stringify(projectionOf(viewOf(s))));
      expect(JSON.stringify(presentPath(changed))).toBe(baseline());
      expect(JSON.parse(baseline()).ok).toBe(true);
    },
  );

  it("every hidden fact changed at once still cannot move the presentation", () => {
    const all = viewWith(
      s,
      Object.fromEntries(hidden.map(([, key, change]) => [key, change])) as Record<
        string,
        (f: OwnerFact | undefined) => OwnerFact | undefined
      >,
    );
    expect(JSON.stringify(presentPath(all))).toBe(baseline());
  });

  it("the presenter is a function of the projection value alone: equal projections give equal presentations whatever else exists", () => {
    const p = projectionOf(viewOf(s));
    if (!p.ok) throw new Error("expected a projection");
    const detached = JSON.parse(JSON.stringify(p.value));
    expect(JSON.stringify(presentEventSignal(detached))).toBe(baseline());
    // a hidden change that DOES change the lawful projection (the received payload) is the only thing that changes the presentation
    const changedProjection = {
      ...detached,
      payload: { ...detached.payload, content: "a different received line" },
    };
    expect(JSON.stringify(presentEventSignal(changedProjection))).not.toBe(baseline());
  });
});

describe("nothing sealed or hidden can be recovered through the presentation, and nothing can be smuggled into it", () => {
  it("the presentation contains no source key/owner/version, event/packet/provenance identity, group identity, capability reference, close or marker", () => {
    const r = presentPath(viewOf(s));
    expect(r.ok).toBe(true);
    const json = JSON.stringify(r);
    const sealed = s.access.engineSealedProvenance(EVENT_SIGNAL, PC)!;
    const packet = s.access.packet(EVENT_SIGNAL, PC)!;
    const cap = s.campaign.store.getFact(pcCapabilityKey(PC, CAP_METALWORKING))!;
    for (const secret of [
      sourceKey(SOURCE_SPEAKER),
      SYNTH_ACCESS_SOURCE_OWNER,
      accessEventKey(EVENT_SIGNAL),
      accessPacketKey(EVENT_SIGNAL, PC),
      accessProvenanceKey(EVENT_SIGNAL, PC),
      pcCapabilityKey(PC, CAP_METALWORKING),
      CAP_METALWORKING,
      EVENT_SIGNAL,
      sealed.fact.provenance.group_id,
      packet.formation_group,
      cap.provenance.group_id,
      "access/",
      "epistemic",
      "stage-group",
      "transaction",
      "version",
    ])
      expect(json, secret).not.toContain(secret);
  });

  it("no hidden-state-existence, cognition, urgency, memory, time or diagnosis vocabulary is added", () => {
    const json = JSON.stringify(presentPath(viewOf(s))).toLowerCase();
    for (const word of [
      "unknown",
      "locked",
      "hidden",
      "sealed",
      "concealed",
      "urgent",
      "interpret",
      "comprehen",
      "believ",
      "remember",
      "recall",
      "memor",
      "motive",
      "emotion",
      "diagnos",
      "established_at",
      "canonical",
    ])
      expect(json, word).not.toContain(word);
  });

  it("the presenter cannot be handed the store, a packet, an event, provenance, a capability or a request in place of a projection", () => {
    const refusals = [
      s.campaign.store,
      s.campaign.store.getFact(accessPacketKey(EVENT_SIGNAL, PC)),
      s.campaign.store.getFact(accessEventKey(EVENT_SIGNAL)),
      s.campaign.store.getFact(accessProvenanceKey(EVENT_SIGNAL, PC)),
      s.access.engineSealedProvenance(EVENT_SIGNAL, PC),
      s.access.packet(EVENT_SIGNAL, PC),
      s.access.event(EVENT_SIGNAL),
      { event_id: EVENT_SIGNAL, recipient_id: PC },
    ].map((x) => JSON.stringify(presentEventSignal(x)));
    for (const r of refusals) expect(r).toBe(refusals[0]);
    expect(JSON.parse(refusals[0]!)).toEqual({
      ok: false,
      error: { code: "PROJECTION_UNAVAILABLE", message: "no projection is available" },
    });
  });

  it("a projection carrying a smuggled hidden field renders nothing, and the refusal does not echo the field", () => {
    const p = projectionOf(viewOf(s));
    if (!p.ok) throw new Error("expected a projection");
    const sealed = s.access.engineSealedProvenance(EVENT_SIGNAL, PC)!;
    for (const extra of [
      { provenance: sealed.value },
      {
        source: {
          owner: SYNTH_ACCESS_SOURCE_OWNER,
          fact_key: sourceKey(SOURCE_SPEAKER),
          version: 1,
        },
      },
      { payload: { ...p.value.payload, true_source: sourceKey(SOURCE_SPEAKER) } },
      { contact: { ...p.value.contact, carrier: "secret-carrier" } },
    ]) {
      const r = JSON.stringify(presentEventSignal({ ...p.value, ...extra }));
      expect(JSON.parse(r).ok).toBe(false);
      expect(r).not.toContain("secret-carrier");
      expect(r).not.toContain(sourceKey(SOURCE_SPEAKER));
    }
  });
});

describe("received information is rendered as received, never corrected against hidden canonical truth", () => {
  it("a presented attribution and payload that differ from the hidden truth are presented unchanged", () => {
    const truth = s.campaign.store.getFact(sourceKey(SOURCE_SPEAKER))!;
    const r = presentPath(viewOf(s));
    if (!r.ok) throw new Error("expected a presentation");
    const event = s.access.event(EVENT_SIGNAL)!.value;
    expect(JSON.stringify(truth.value)).not.toContain(event.payload.content);
    expect(r.value.elements.find((e) => e.element === "CONTENT")).toEqual({
      element: "CONTENT",
      text: event.payload.content,
    });
    expect(r.value.elements.find((e) => e.element === "PRESENTED_ATTRIBUTION")).toEqual({
      element: "PRESENTED_ATTRIBUTION",
      text: event.payload.presented_attribution,
    });
  });
});

describe("one opaque refusal: the path's refusal is byte-identical to IM-13's for every cause, and reveals no cause", () => {
  const real = () => viewOf(s);
  const causes: [string, () => unknown][] = [
    ["unknown event", () => presentPath(real(), "no-such-event")],
    ["unknown recipient", () => presentPath(real(), EVENT_SIGNAL, "nobody")],
    ["wrong recipient", () => presentPath(real(), EVENT_SIGNAL, ACTOR_SMITH)],
    ["no binding", () => presentPath(viewWith(s, { [PLAYER_CHARACTER_BINDING_KEY]: drop }))],
    ["no packet", () => presentPath(viewWith(s, { [accessPacketKey(EVENT_SIGNAL, PC)]: drop }))],
    ["no temporal state", () => presentPath(viewWith(s, { "temporal/state": drop }))],
    ["not the current arrival", () => presentPath({ ...real(), committedGroup: () => null })],
    [
      "an internal failure",
      () =>
        presentPath({
          getFact: () => {
            throw new Error("internal validator detail: access/e1/event version 3");
          },
          committedGroup: () => null,
        }),
    ],
    ["a non-projection handed to the presenter", () => presentEventSignal({ not: "a projection" })],
  ];
  it("every cause yields the byte-identical refusal, equal to the IM-13 refusal", () => {
    const im13 = JSON.stringify(
      deriveEventSignalProjection(real(), { event_id: "no-such-event", recipient_id: PC }),
    );
    for (const [name, run] of causes) expect(JSON.stringify(run()), name).toBe(im13);
    expect(JSON.parse(im13)).toEqual({
      ok: false,
      error: { code: "PROJECTION_UNAVAILABLE", message: "no projection is available" },
    });
  });

  it("a stored non-current packet is indistinguishable from an event that never existed", async () => {
    const t = await seedSignal();
    await formPcArrival(t);
    await formPcArrival(t, {
      eventId: EVENT_OTHER,
      consumer: "c2",
      tx: "tx-2",
      continues: "tx-1",
      n: 10,
      boundaryAt: 170,
    });
    expect(t.access.packet(EVENT_SIGNAL, PC)).toBeDefined();
    expect(JSON.stringify(presentPath(viewOf(t), EVENT_SIGNAL))).toBe(
      JSON.stringify(presentPath(viewOf(t), "never-existed")),
    );
  });
});

describe("the presentation is a read-only disposable consumer: it cannot write, scan or advance time", () => {
  it("presenting through a spied store makes no commit, no listing and no clock change, beyond IM-13's bounded identity reads", () => {
    const spy = spyStore(s.campaign.store);
    const before = stateDigest(s);
    const factCount = s.campaign.store.listFacts().length;
    const view: ProjectionStateView = {
      getFact: (k) => spy.store.getFact(k),
      committedGroup: (id) => spy.store.committedGroup(id),
    };
    expect(presentPath(view).ok).toBe(true);
    const reads = spy.getFacts.length;
    const p = projectionOf(view);
    if (!p.ok) throw new Error("expected a projection");
    const afterProjection = spy.getFacts.length;
    for (let i = 0; i < 5; i += 1) presentEventSignal(p.value); // presenting makes no further read of any kind
    expect(spy.getFacts.length).toBe(afterProjection);
    expect(afterProjection - reads).toBe(reads);
    expect(spy.commits).toEqual([]);
    expect(spy.listCalls()).toBe(0);
    expect(stateDigest(s)).toEqual(before);
    expect(s.campaign.store.listFacts()).toHaveLength(factCount);
  });

  it("the value it returns is plain data: mutating it cannot reach committed state or the next presentation", () => {
    const r = presentPath(viewOf(s));
    if (!r.ok) throw new Error("expected a presentation");
    const before = stateDigest(s);
    const baseline = JSON.stringify(presentPath(viewOf(s)));
    (r.value.elements[r.value.elements.length - 1] as { text: string }).text = "tampered";
    (r.value as { disposable: boolean }).disposable = false;
    expect(stateDigest(s)).toEqual(before);
    expect(JSON.stringify(presentPath(viewOf(s)))).toBe(baseline);
  });
});
