/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw persisted records */
// RC-14 / IM-13 control-flow non-disclosure for the WHOLE Current Observation Glance gateway (BLUE PR #68 HOLD H-1, 2026-10-15). Equal refusal
// JSON does not establish equal behavior: a valid request refused only because of CONCEALED state (no observation, an obstructed one, an
// event committed but not yet sealed, a historical or superseded packet, a tampered source) must not select a different security-relevant
// read/validation path. These tests instrument the view the gateway is handed and compare the ORDERED identity-read and group-read
// traces for identical valid requests across those states. This is a deterministic bounded-shape claim, NOT a wall-clock constant-time
// claim. The campaigns are built by the shipped commands; the scripted referee host is PLUMBING ONLY (no semantic claim).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEMPORAL_STATE_KEY, accessEventKey, type OwnerFact } from "@immortalis/contracts";
import {
  EpistemicAccessAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  deriveEventSignalProjection,
  isObservationEarnedFact,
  observationEventId,
  observationEventViolation,
  presentEventSignal,
  type CanonicalCampaign,
  type ProjectionStateView,
} from "@immortalis/engine";
import {
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { stopAtBoundaryRequest } from "@immortalis/testkit";
import { at } from "../support/gip-sunset.ts";
import { openOrdinary, type LocalityDirs } from "../support/locality.ts";
import {
  BASIS,
  PC_ID,
  decide,
  observationCampaign,
  observe,
  screenScene,
} from "../support/observation.ts";
import { GLANCE_REQUEST, PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { must } from "../support/temporal.ts";

/**
 * The gateway's own reads (nine `getFact` — the sixth premise slot is the one Source Condition of a source-scoped observation, or a
 * sentinel — and one `committedGroup`) plus the unchanged IM-13 guard's fixed seven and one.
 */
const EXPECTED_READS = 9 + 1 + 7 + 1;

interface Call {
  readonly method: "getFact" | "committedGroup";
  readonly key: string;
}
const instrument = (inner: ProjectionStateView) => {
  const calls: Call[] = [];
  const view: ProjectionStateView = {
    getFact: (key) => (calls.push({ method: "getFact", key }), inner.getFact(key)),
    committedGroup: (id) => (
      calls.push({ method: "committedGroup", key: id }),
      inner.committedGroup(id)
    ),
  };
  return { view, calls };
};
/** The shape of a trace: which kind of read, in which order — never which identity (a concealed identity differs by construction). */
const shapeOf = (calls: readonly Call[]) => calls.map((c) => c.method);

const read = (view: ProjectionStateView, ...args: [request?: unknown, recipient?: string]) => {
  const traced = instrument(view);
  const out = JSON.stringify(
    readCurrentObservationGlance(
      bindTrustedCurrentPlayerContext({ view: traced.view, recipient_id: args[1] ?? PC_ID }),
      args.length > 0 ? args[0] : GLANCE_REQUEST(),
    ),
  );
  return { out, calls: traced.calls };
};

const campaigns: CanonicalCampaign[] = [];
const open = async (dirs: LocalityDirs) => {
  const c = await openOrdinary(dirs.campaignDir);
  campaigns.push(c);
  return c;
};
afterAll(async () => {
  for (const c of campaigns.splice(0)) await c.close();
});

const S: Record<string, CanonicalCampaign> = {};
beforeAll(async () => {
  // (a) no observation at all: time established, nothing observed
  S.none = await open((await observationCampaign()).dirs);
  // (b) an obstructed observation: identical premises, an opaque screen on the path; nothing is earned
  const blocked = await observationCampaign({ scene: screenScene() });
  expect((await observe(blocked.dirs)).result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
  S.obstructed = await open(blocked.dirs);
  // (c) a real observation event committed by the Epistemic owner, but no packet and no sealed current transaction yet
  const partial = await observationCampaign();
  const pc = await open(partial.dirs);
  await decide(pc);
  const decisionKey = pc.store
    .listFacts()
    .find((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION")!.key;
  expect(
    (
      await new EpistemicAccessAdapter(pc.store).establishObservedAccess({
        decision_key: decisionKey,
      })
    ).ok,
  ).toBe(true);
  S.unsealed = pc;
  // (d) the qualified, sealed, current receipt
  const current = await observationCampaign();
  expect((await observe(current.dirs)).result.status).toBe("OBSERVATION_RECEIVED");
  S.current = await open(current.dirs);
  // (e) the same, then a newer sealed transaction at the same basis supersedes it
  const same = await observationCampaign();
  expect((await observe(same.dirs)).result.status).toBe("OBSERVATION_RECEIVED");
  S.sameBasis = await open(same.dirs);
  await must(
    new TemporalCoordinator(S.sameBasis.store, new StageProviderRegistry()).advance(
      stopAtBoundaryRequest("tx-same-basis", { requested: { target: BASIS, condition: null } }),
    ),
  );
  // (f) the same, then canonical time moves on: the packet is historical
  const later = await observationCampaign();
  expect((await observe(later.dirs)).result.status).toBe("OBSERVATION_RECEIVED");
  S.historical = await open(later.dirs);
  await must(
    new TemporalCoordinator(S.historical.store, new StageProviderRegistry()).advance(
      stopAtBoundaryRequest("tx-later", { requested: { target: at(150), condition: null } }),
    ),
  );
  // (g) no canonical time has been established yet
  S.timeless = await open((await observationCampaign({ time: false })).dirs);
}, 120_000);

const tamperedEvent = (c: CanonicalCampaign): ProjectionStateView => {
  const eventFact = c.store.listFacts().find((f) => /^access\/[^/]+\/event$/.test(f.key))!;
  return {
    getFact: (k) =>
      k === eventFact.key
        ? ({ ...eventFact, basis: "not-the-observation-basis" } as OwnerFact)
        : c.store.getFact(k),
    committedGroup: (id) => c.store.committedGroup(id),
  };
};
const hiding = (c: CanonicalCampaign, hidden: (k: string) => boolean): ProjectionStateView => ({
  getFact: (k) => (hidden(k) ? undefined : c.store.getFact(k)),
  committedGroup: (id) => c.store.committedGroup(id),
});

describe("H-1: concealed observation states do not select a different read/validation path", () => {
  it("the states under test are what they claim: only the qualified current receipt is served", () => {
    expect(JSON.parse(read(S.current!.store).out).ok).toBe(true);
    for (const name of ["none", "obstructed", "unsealed", "sameBasis", "historical", "timeless"])
      expect(read(S[name]!.store).out, name).toBe(PROTOCOL_REFUSAL);
    expect(read(tamperedEvent(S.current!)).out).toBe(PROTOCOL_REFUSAL);
    // (c) really holds an owner-committed observation event, with no packet and no sealed transaction
    const keys = S.unsealed!.store.listFacts().map((f) => f.key);
    expect(keys.some((k) => /^access\/[^/]+\/event$/.test(k))).toBe(true);
    expect(keys.some((k) => /^access\/[^/]+\/packet\//.test(k))).toBe(false);
    expect(keys.some((k) => /^temporal\/transaction\//.test(k))).toBe(false);
  });

  it("(a) none, (b) obstructed, (c) event committed but unsealed, (d) qualified current, same-basis supersession, historical, tampered source: one identical ordered read shape of the fixed length", () => {
    const traces = {
      none: read(S.none!.store),
      obstructed: read(S.obstructed!.store),
      unsealed: read(S.unsealed!.store),
      current: read(S.current!.store),
      sameBasis: read(S.sameBasis!.store),
      historical: read(S.historical!.store),
      tamperedSource: read(tamperedEvent(S.current!)),
    };
    const reference = shapeOf(traces.current.calls);
    expect(reference).toHaveLength(EXPECTED_READS);
    expect(reference.filter((m) => m === "committedGroup")).toHaveLength(2);
    for (const [name, t] of Object.entries(traces))
      expect(shapeOf(t.calls), name).toEqual(reference);
  });

  it("the states reachable through the public identity (state, derived event) read the same two identities first, in every state with a canonical time", () => {
    const withTime = ["none", "obstructed", "unsealed", "current", "sameBasis", "historical"];
    for (const name of withTime) {
      const { calls } = read(S[name]!.store);
      expect(calls[0], name).toEqual({ method: "getFact", key: TEMPORAL_STATE_KEY });
      expect(calls[1]!.method).toBe("getFact");
      expect(calls[1]!.key).toMatch(/^access\/obs-[0-9a-f]{64}\/event$/);
    }
    // the sentinel read taken when there is no canonical time still has the same shape
    const timeless = read(S.timeless!.store);
    expect(shapeOf(timeless.calls)).toEqual(shapeOf(read(S.current!.store).calls));
    expect(timeless.calls[0]).toEqual({ method: "getFact", key: TEMPORAL_STATE_KEY });
  });

  it("(g) no canonical time yet, a wrong client recipient, a hidden decision, a hidden premise and a hidden Epistemic record all take the same shape", () => {
    const reference = shapeOf(read(S.current!.store).calls);
    const c = S.current!;
    const decisionKey = c.store
      .listFacts()
      .find((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION")!.key;
    const variants: Record<string, ReturnType<typeof read>> = {
      timeless: read(S.timeless!.store),
      wrongRecipient: read(c.store, GLANCE_REQUEST(), "pc-someone-else"),
      emptyRecipient: read(c.store, GLANCE_REQUEST(), ""),
      hiddenDecision: read(hiding(c, (k) => k === decisionKey)),
      hiddenCustody: read(hiding(c, (k) => k.endsWith("/locus-custody"))),
      hiddenEvent: read(hiding(c, (k) => /^access\/[^/]+\/event$/.test(k))),
      hiddenPacket: read(hiding(c, (k) => /^access\/[^/]+\/packet\//.test(k))),
      hiddenBinding: read(hiding(c, (k) => k.startsWith("role-registry/"))),
      hiddenState: read(hiding(c, (k) => k === TEMPORAL_STATE_KEY)),
    };
    for (const [name, t] of Object.entries(variants)) {
      expect(shapeOf(t.calls), name).toEqual(reference);
      expect(t.out, name).toBe(PROTOCOL_REFUSAL);
    }
  });

  it("a malformed or over-claiming request takes the same shape as a valid one: the request is not a side channel either", () => {
    const reference = shapeOf(read(S.current!.store).calls);
    for (const bad of [
      undefined,
      null,
      "x",
      {},
      GLANCE_REQUEST({ event_id: "obs-x" }),
      GLANCE_REQUEST({ at: BASIS }),
    ]) {
      const t = read(S.current!.store, bad);
      expect(shapeOf(t.calls)).toEqual(reference);
      expect(t.out).toBe(PROTOCOL_REFUSAL);
    }
  });

  it("the positive is unaffected: the qualified current receipt is served unchanged by the fixed shape, repeatedly and after a reopen", async () => {
    const a = read(S.current!.store);
    const b = read(S.current!.store);
    expect(JSON.parse(a.out).ok).toBe(true);
    expect(b.out).toBe(a.out);
    expect(JSON.parse(a.out).value.elements).toEqual([
      { element: "CONTACT", channel: "PERCEPTION" },
      { element: "REFERENT", text: "a patch on the wall facing the character" },
      { element: "CONTENT", text: "a broad patch of bright red on pale plaster" },
    ]);
    expect(shapeOf(b.calls)).toEqual(shapeOf(a.calls));
  });

  it("no read is a listing, scan or prefix: every call is a getFact or a committedGroup by one identity", () => {
    for (const name of ["none", "unsealed", "current", "historical"])
      for (const c of read(S[name]!.store).calls) {
        expect(["getFact", "committedGroup"]).toContain(c.method);
        expect(c.key).not.toMatch(/[*?]|\/$|^$/);
      }
  });
});

describe("the instrument is falsifying: the pre-repair early-exit gateway fails the very same comparison", () => {
  /** The gateway as PR #68 was at 7097c9e (early exits on concealed state), rebuilt here from the unchanged engine exports. */
  function earlyExitGateway(view: ProjectionStateView, recipient: string) {
    const state = view.getFact(TEMPORAL_STATE_KEY);
    if (!state) return "refused";
    const eventId = observationEventId(recipient, (state.value as any).canonical_time);
    const eventFact = view.getFact(accessEventKey(eventId));
    if (!eventFact || !isObservationEarnedFact(eventFact)) return "refused";
    const group = view.committedGroup(eventFact.provenance.intent_id);
    if (
      !group ||
      observationEventViolation(
        { group, value: eventFact.value, basis: eventFact.basis, factOf: (k) => view.getFact(k) },
        "VERIFICATION",
      ) !== null
    )
      return "refused";
    const projection = deriveEventSignalProjection(view, {
      event_id: eventId,
      recipient_id: recipient,
    });
    return projection.ok && presentEventSignal(projection.value).ok ? "served" : "refused";
  }
  const legacyTrace = (c: CanonicalCampaign) => {
    const traced = instrument(c.store);
    const verdict = earlyExitGateway(traced.view, PC_ID);
    return { verdict, calls: traced.calls };
  };

  it("the same refusal outcome from different concealed states is a different read path in the early-exit shape", () => {
    const none = legacyTrace(S.none!);
    const unsealed = legacyTrace(S.unsealed!);
    const historical = legacyTrace(S.historical!);
    expect(none.verdict).toBe("refused");
    expect(unsealed.verdict).toBe("refused");
    expect(historical.verdict).toBe("refused");
    const lengths = new Set([none, unsealed, historical].map((t) => t.calls.length));
    expect(lengths.size).toBeGreaterThan(1); // the defect: concealed state selects the amount and kind of work
    expect(none.calls.length).toBe(2);
    expect(unsealed.calls.length).toBeGreaterThan(none.calls.length);
    // and the repaired gateway collapses every one of those onto the single fixed shape
    const repaired = new Set(
      [S.none!, S.unsealed!, S.historical!].map((c) => shapeOf(read(c.store).calls).join(",")),
    );
    expect(repaired.size).toBe(1);
  });
});
