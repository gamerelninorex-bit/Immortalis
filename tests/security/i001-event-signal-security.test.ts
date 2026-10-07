// I-001 Event-Signal Projection — security: no hidden-state, sealed-provenance, capability or validator leakage; one opaque
// refusal for every cause; no state write, scan or time advance; the received payload and presented attribution are
// preserved and never corrected against hidden canonical truth. Register lineage: IA-13 (partial), IA-17 (partial); RC-14.
import { beforeAll, describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  pcCapabilityKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { deriveEventSignalProjection, type ProjectionStateView } from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  SOURCE_SPEAKER,
  SYNTH_ACCESS_SOURCE_OWNER,
  pcCapabilityContract,
  sourceKey,
} from "@immortalis/testkit";
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

const project = (view: ProjectionStateView, eventId = EVENT_SIGNAL, recipient = PC) =>
  deriveEventSignalProjection(view, { event_id: eventId, recipient_id: recipient });

describe("nothing sealed or hidden can reach the projection", () => {
  it("the success value contains no source key/owner/version, event/packet/provenance identity, group identity, capability reference, close or marker", () => {
    const r = project(viewOf(s));
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
      "access/",
      "epistemic",
      sealed.fact.provenance.group_id,
      packet.formation_group,
      cap.provenance.group_id,
      pcCapabilityKey(PC, CAP_METALWORKING),
      CAP_METALWORKING,
      "PC Capability Close",
      "stage-group",
      "transaction",
      "intelligib",
      "ESTABLISHED_CAPABILITY",
      EVENT_SIGNAL,
      "version",
    ])
      expect(json, secret).not.toContain(secret);
    expect(JSON.stringify(cap.value)).not.toBe("");
    // the capability marker, whatever it is, never travels
    const marker = (cap.value as { marker?: unknown }).marker;
    if (marker !== undefined) expect(json).not.toContain(JSON.stringify(marker));
  });

  it("no hidden-state-existence vocabulary appears in a success or a refusal: no 'Unknown', 'Locked' or category label", () => {
    const outputs = [
      project(viewOf(s)),
      project(viewOf(s), "no-such-event"),
      project(viewOf(s), EVENT_SIGNAL, ACTOR_SMITH),
    ];
    for (const o of outputs)
      for (const word of [
        "unknown",
        "locked",
        "hidden",
        "redacted",
        "sealed",
        "withheld",
        "denied",
        "category",
      ])
        expect(JSON.stringify(o).toLowerCase(), word).not.toContain(word);
  });

  it("received information is preserved as received: it is not corrected against the hidden canonical source, and a false presented attribution stays presented", () => {
    const truth = s.campaign.store.getFact(sourceKey(SOURCE_SPEAKER))!;
    const r = project(viewOf(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(JSON.stringify(truth.value)).not.toContain(r.value.payload.content); // truth differs from the received claim
    expect(r.value.payload.content).toBe(s.access.event(EVENT_SIGNAL)!.value.payload.content);
    expect(r.value.presented_attribution).toBe(
      s.access.event(EVENT_SIGNAL)!.value.payload.presented_attribution,
    );
    // even when the hidden truth changes afterwards, the projection of the same arrival does not move
    const changed = viewWith(s, {
      [sourceKey(SOURCE_SPEAKER)]: (f) =>
        f
          ? ({
              ...f,
              value: "SYNTHETIC FIXTURE: a different hidden truth.",
              version: f.version + 1,
            } as OwnerFact)
          : f,
    });
    expect(project(changed)).toEqual(r);
  });
});

describe("one opaque refusal: no code, message, detail or shape distinguishes a cause or a hidden fact from an absent one", () => {
  const absent = () => undefined;
  const real = () => viewOf(s);
  const causes: [string, () => unknown][] = [
    ["unknown event", () => project(real(), "no-such-event")],
    ["unknown recipient", () => project(real(), EVENT_SIGNAL, "nobody")],
    ["wrong recipient", () => project(real(), EVENT_SIGNAL, ACTOR_SMITH)],
    ["malformed request", () => deriveEventSignalProjection(real(), { event_id: 1 })],
    ["no binding", () => project(viewWith(s, { [PLAYER_CHARACTER_BINDING_KEY]: absent }))],
    ["no packet", () => project(viewWith(s, { [accessPacketKey(EVENT_SIGNAL, PC)]: absent }))],
    ["no event", () => project(viewWith(s, { [accessEventKey(EVENT_SIGNAL)]: absent }))],
    ["no temporal state", () => project(viewWith(s, { "temporal/state": absent }))],
    [
      "an event that exists but is not the current arrival",
      () => project({ ...real(), committedGroup: () => null }),
    ],
    [
      "an internal failure",
      () =>
        project({
          getFact: () => {
            throw new Error("internal validator detail: access/e1/event version 3");
          },
          committedGroup: () => null,
        }),
    ],
  ];
  it("every cause yields the byte-identical refusal", () => {
    const first = JSON.stringify(causes[0]![1]());
    for (const [name, run] of causes) expect(JSON.stringify(run()), name).toBe(first);
    expect(JSON.parse(first)).toEqual({
      ok: false,
      error: { code: "PROJECTION_UNAVAILABLE", message: "no projection is available" },
    });
  });

  it("a real, stored but not-current packet is indistinguishable from an event that never existed", async () => {
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
    expect(JSON.stringify(project(viewOf(t), EVENT_SIGNAL))).toBe(
      JSON.stringify(project(viewOf(t), "never-existed")),
    );
  });
});

describe("derivation is a read-only capability: it cannot write, scan or advance time", () => {
  it("uses only identity reads of a bounded set of facts; no commit, no listing, no clock change, no new fact", () => {
    const spy = spyStore(s.campaign.store);
    const before = stateDigest(s);
    const factCount = s.campaign.store.listFacts().length;
    const view: ProjectionStateView = {
      getFact: (k) => spy.store.getFact(k),
      committedGroup: (id) => spy.store.committedGroup(id),
    };
    expect(project(view).ok).toBe(true);
    expect(project(view, "no-such-event").ok).toBe(false);
    expect(spy.commits).toEqual([]);
    expect(spy.listCalls()).toBe(0);
    expect(spy.getFacts.length).toBeLessThanOrEqual(24);
    expect(new Set(spy.getFacts).size).toBeLessThanOrEqual(12);
    expect(stateDigest(s)).toEqual(before);
    expect(s.campaign.store.listFacts()).toHaveLength(factCount);
  });

  it("the value it returns is plain data: mutating it cannot reach committed state", () => {
    const r = project(viewOf(s));
    if (!r.ok) throw new Error("expected a projection");
    const before = stateDigest(s);
    (r.value.payload as { content: string }).content = "tampered";
    (r.value as { disposable: boolean }).disposable = false;
    expect(stateDigest(s)).toEqual(before);
    const again = project(viewOf(s));
    expect(again.ok && again.value.payload.content).not.toBe("tampered");
    expect(again.ok && again.value.disposable).toBe(true);
  });
});

describe("hostile input", () => {
  it.each([
    "access/../../temporal/state",
    "__proto__",
    "constructor",
    "pc-fixture-1/../x",
    "a b",
    "line\nbreak",
    "x".repeat(10_000),
    "'; DROP TABLE facts; --",
  ])("an identity of %j is refused opaquely, with no exception", (id) => {
    expect(() => project(viewOf(s), id, PC)).not.toThrow();
    expect(project(viewOf(s), id, PC).ok).toBe(false);
    expect(project(viewOf(s), EVENT_SIGNAL, id).ok).toBe(false);
    expect(JSON.stringify(project(viewOf(s), id, id))).not.toContain(id.slice(0, 20) || "x");
  });
});
