/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw persisted records */
// RC-14 / IM-13 control-flow non-disclosure for the Current Observation Glance gateway now that an observation can cite ONE MORE premise (BLUE
// v5.2-A1: the Source Condition of a source-scoped observation). The gateway reads six premise slots for EVERY observation: the sixth is the
// Source Condition when the retained decision cites one and a fixed sentinel that can name no committed fact when it cites five, so a
// source-scoped and an ordinary observation, and every concealed state of either (none, obstructed, committed-but-unsealed, historical,
// superseded, tampered, a hidden or retargeted source), take the identical ordered read shape of the identical length. This is a
// deterministic bounded-shape claim, NOT a wall-clock constant-time claim. The campaigns are built by the shipped commands; the scripted
// referee host is PLUMBING ONLY (no semantic claim).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  REFEREE_AUTHORITY,
  TEMPORAL_STATE_KEY,
  accessEventKey,
  worldSourceConditionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  EpistemicAccessAdapter,
  RefereeAdjudicationAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  observationEventId,
  observationRecordOf,
  type CanonicalCampaign,
  type ProjectionStateView,
} from "@immortalis/engine";
import {
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { stopAtBoundaryRequest } from "@immortalis/testkit";
import { at } from "../support/gip-sunset.ts";
import { WORLD_ID, openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { observationCampaign, observe } from "../support/observation.ts";
import { GLANCE_REQUEST, PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { plainPolicy } from "../support/original-pc.ts";
import { must } from "../support/temporal.ts";
import {
  BASIS,
  BURIED,
  PC_ID,
  SOURCE_KEY,
  observeSource,
  sourceAnswer,
  sourceCampaign,
  sourceScene,
} from "../support/source-observation.ts";

/** Nine `getFact` and one `committedGroup` of the gateway's own, plus the unchanged IM-13 guard's fixed seven and one. */
const EXPECTED_READS = 14 + 1 + 7 + 1;
/** The sixth premise slot: state, event, group, decision, then premise slots 0..5. */
const SIXTH_PREMISE = 9;
const SENTINEL = "-";

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
  // the ordinary (five-premise) observation, as before this slice
  const ordinary = await observationCampaign({
    scene: sourceScene(undefined, (doc) => {
      doc.locus.constraints.push({
        aspect: "surface",
        statement:
          "The north wall is whitewashed plaster with one broad patch of bright red paint, about an arm-span wide, at the height of a seated person's eyes.",
      });
    }),
  });
  const ord = await observe(ordinary.dirs, undefined, {}, (doc) =>
    doc["operation"] === "F014D_DIRECT_PERCEPTION"
      ? sourceAnswer(doc, {
          ofFact: "locus.constraint.5",
          referent: "a patch on the wall facing the character",
          content: "a broad patch of bright red on pale plaster",
        })
      : plainPolicy(doc),
  );
  expect(ord.result.status).toBe("OBSERVATION_RECEIVED");
  S.ordinary = await open(ordinary.dirs);

  // (a) source-scoped: nothing observed yet
  S.none = await open((await sourceCampaign()).dirs);
  // (b) source-scoped, obstructed: the source's owner states it is covered; nothing is earned
  const covered = await sourceCampaign({ access: [{ aspect: "exposure", statement: BURIED }] });
  expect((await observeSource(covered.dirs)).result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
  S.obstructed = await open(covered.dirs);
  // (c) an owner-committed source-scoped event, but no packet and no sealed current transaction yet
  const partial = await sourceCampaign();
  const pc = await open(partial.dirs);
  const adapter = new RefereeAdjudicationAdapter(pc.store);
  const task = adapter.observationTask({ pc_id: PC_ID, attempt: 0, source_key: SOURCE_KEY });
  if (!task.ok) throw new Error(JSON.stringify(task.error));
  const decided = await adapter.recordObservation({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: "engine-direct-test", claimed_model: null },
    pc_id: PC_ID,
    attempt: 0,
    source_key: SOURCE_KEY,
    answer: sourceAnswer({ task_id: task.value.task_id, context: task.value.context }),
  });
  if (!decided.ok) throw new Error(JSON.stringify(decided.error));
  expect(
    (
      await new EpistemicAccessAdapter(pc.store).establishObservedAccess({
        decision_key: decided.value.record.key,
      })
    ).ok,
  ).toBe(true);
  S.unsealed = pc;
  // (d) the qualified, sealed, current source-scoped receipt
  const current = await sourceCampaign();
  expect((await observeSource(current.dirs)).result.status).toBe("OBSERVATION_RECEIVED");
  S.current = await open(current.dirs);
  // (e) the same, then a newer sealed transaction at the same basis supersedes it
  const same = await sourceCampaign();
  expect((await observeSource(same.dirs)).result.status).toBe("OBSERVATION_RECEIVED");
  S.sameBasis = await open(same.dirs);
  await must(
    new TemporalCoordinator(S.sameBasis.store, new StageProviderRegistry()).advance(
      stopAtBoundaryRequest("tx-same-basis", { requested: { target: BASIS, condition: null } }),
    ),
  );
  // (f) the same, then canonical time moves on: the packet is historical
  const later = await sourceCampaign();
  expect((await observeSource(later.dirs)).result.status).toBe("OBSERVATION_RECEIVED");
  S.historical = await open(later.dirs);
  await must(
    new TemporalCoordinator(S.historical.store, new StageProviderRegistry()).advance(
      stopAtBoundaryRequest("tx-later", { requested: { target: at(150), condition: null } }),
    ),
  );
}, 180_000);

const eventFactOf = (c: CanonicalCampaign) =>
  c.store.listFacts().find((f) => /^access\/[^/]+\/event$/.test(f.key))!;
const sourceKey = worldSourceConditionKey(WORLD_ID, SOURCE_KEY);

const hiding = (c: CanonicalCampaign, hidden: (k: string) => boolean): ProjectionStateView => ({
  getFact: (k) => (hidden(k) ? undefined : c.store.getFact(k)),
  committedGroup: (id) => c.store.committedGroup(id),
});
const tampered = (c: CanonicalCampaign, edit: (e: any) => any): ProjectionStateView => {
  const eventFact = eventFactOf(c);
  return {
    getFact: (k) =>
      k === eventFact.key
        ? ({ ...eventFact, value: edit(structuredClone(eventFact.value)) } as OwnerFact)
        : c.store.getFact(k),
    committedGroup: (id) => c.store.committedGroup(id),
  };
};

describe("a source-scoped and an ordinary observation take the identical read shape, whatever is concealed", () => {
  it("the states under test are what they claim: only the qualified current receipts are served", () => {
    expect(JSON.parse(read(S.current!.store).out).ok).toBe(true);
    expect(JSON.parse(read(S.ordinary!.store).out).ok).toBe(true);
    for (const name of ["none", "obstructed", "unsealed", "sameBasis", "historical"])
      expect(read(S[name]!.store).out, name).toBe(PROTOCOL_REFUSAL);
    const keys = S.unsealed!.store.listFacts().map((f) => f.key);
    expect(keys.some((k) => /^access\/[^/]+\/event$/.test(k))).toBe(true);
    expect(keys.some((k) => /^access\/[^/]+\/packet\//.test(k))).toBe(false);
  });

  it("the sixth premise slot reads the Source Condition of a source-scoped observation and the sentinel of an ordinary one, in the same position", () => {
    const scoped = read(S.current!.store);
    const ordinary = read(S.ordinary!.store);
    expect(scoped.calls[SIXTH_PREMISE]).toEqual({ method: "getFact", key: sourceKey });
    expect(ordinary.calls[SIXTH_PREMISE]).toEqual({ method: "getFact", key: SENTINEL });
    // and every call is a by-identity read: no listing, prefix or scan
    for (const c of [...scoped.calls, ...ordinary.calls]) {
      expect(["getFact", "committedGroup"]).toContain(c.method);
      expect(c.key).not.toMatch(/[*?]|\/$|^$/);
    }
  });

  it("the ordinary and every source-scoped state — none, obstructed, unsealed, current, superseded, historical, tampered, hidden source — share one ordered shape of the fixed length", () => {
    const current = S.current!;
    const traces: Record<string, ReturnType<typeof read>> = {
      ordinary: read(S.ordinary!.store),
      none: read(S.none!.store),
      obstructed: read(S.obstructed!.store),
      unsealed: read(S.unsealed!.store),
      current: read(current.store),
      sameBasis: read(S.sameBasis!.store),
      historical: read(S.historical!.store),
      // the event relabelled, retargeted at another fact, or pinned at another version
      tamperedBasis: read({
        getFact: (k) =>
          k === eventFactOf(current).key
            ? ({ ...eventFactOf(current), basis: "not-the-observation-basis" } as OwnerFact)
            : current.store.getFact(k),
        committedGroup: (id) => current.store.committedGroup(id),
      }),
      retargetedSource: read(
        tampered(current, (e) => ((e.source.fact_key = `world/${WORLD_ID}/profile`), e)),
      ),
      movedVersion: read(tampered(current, (e) => ((e.source.version = 9), e))),
      // the cited source is concealed from the view, or the whole decision is
      hiddenSource: read(hiding(current, (k) => k === sourceKey)),
      hiddenAnySource: read(hiding(current, (k) => /^world\/[^/]+\/source\//.test(k))),
    };
    const reference = shapeOf(traces.current!.calls);
    expect(reference).toHaveLength(EXPECTED_READS);
    expect(reference.filter((m) => m === "committedGroup")).toHaveLength(2);
    for (const [name, t] of Object.entries(traces))
      expect(shapeOf(t.calls), name).toEqual(reference);
    // the same refusal, byte for byte, for every cause
    for (const name of [
      "none",
      "obstructed",
      "unsealed",
      "sameBasis",
      "historical",
      "tamperedBasis",
      "retargetedSource",
      "movedVersion",
      "hiddenSource",
      "hiddenAnySource",
    ])
      expect(traces[name]!.out, name).toBe(PROTOCOL_REFUSAL);
  });

  it("a wrong client, a hidden decision, custody, event or packet, and a malformed or over-claiming request take the same shape as the valid read", () => {
    const c = S.current!;
    const reference = shapeOf(read(c.store).calls);
    const decisionKey = c.store
      .listFacts()
      .find((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION")!.key;
    const variants: Record<string, ReturnType<typeof read>> = {
      wrongRecipient: read(c.store, GLANCE_REQUEST(), "pc-someone-else"),
      emptyRecipient: read(c.store, GLANCE_REQUEST(), ""),
      hiddenDecision: read(hiding(c, (k) => k === decisionKey)),
      hiddenCustody: read(hiding(c, (k) => k.endsWith("/locus-custody"))),
      hiddenEvent: read(hiding(c, (k) => k === eventFactOf(c).key)),
      hiddenPacket: read(hiding(c, (k) => /^access\/[^/]+\/packet\//.test(k))),
      hiddenState: read(hiding(c, (k) => k === TEMPORAL_STATE_KEY)),
      noRequest: read(c.store, undefined),
      overClaimSource: read(c.store, GLANCE_REQUEST({ source_key: SOURCE_KEY })),
      overClaimEvent: read(c.store, GLANCE_REQUEST({ event_id: "obs-x" })),
      overClaimBasis: read(c.store, GLANCE_REQUEST({ at: BASIS })),
    };
    for (const [name, t] of Object.entries(variants)) {
      expect(shapeOf(t.calls), name).toEqual(reference);
      expect(t.out, name).toBe(PROTOCOL_REFUSAL);
    }
  });

  it("the positive is unaffected: the source-scoped receipt is served by the fixed shape, repeatedly and byte for byte, naming no source", () => {
    const a = read(S.current!.store);
    const b = read(S.current!.store);
    expect(JSON.parse(a.out).ok).toBe(true);
    expect(b.out).toBe(a.out);
    expect(shapeOf(b.calls)).toEqual(shapeOf(a.calls));
    expect(a.out).not.toContain(SOURCE_KEY);
    expect(a.out).not.toMatch(/source|world\/|referee|obs-/i);
  });
});

describe("the instrument is falsifying: a gateway that read the sixth premise only when one is cited would tell the two forms apart", () => {
  /** The nine identity reads as a gateway would make them if the sixth premise were read only when the decision cites one. */
  function conditionalSixth(view: ProjectionStateView, recipient: string) {
    const state = view.getFact(TEMPORAL_STATE_KEY);
    const eventId = observationEventId(recipient, (state!.value as any).canonical_time);
    const eventFact = view.getFact(accessEventKey(eventId));
    const group = view.committedGroup(eventFact!.provenance.intent_id);
    const decision = view.getFact(group!.reads[0]!.key);
    const cited = observationRecordOf(decision)!.input.refs;
    for (let n = 0; n < 5; n += 1) view.getFact(cited[n]!.fact_key);
    if (cited.length > 5) view.getFact(cited[5]!.fact_key);
  }
  const trace = (c: CanonicalCampaign) => {
    const traced = instrument(c.store);
    conditionalSixth(traced.view, PC_ID);
    return traced.calls;
  };

  it("an ordinary and a source-scoped observation differ in the amount of work under the conditional shape, and agree under the repaired gateway", () => {
    const ordinary = trace(S.ordinary!);
    const scoped = trace(S.current!);
    expect(scoped.length).toBe(ordinary.length + 1); // the defect: the cited premises select the amount of work
    const repaired = new Set(
      [S.ordinary!, S.current!].map((c) => shapeOf(read(c.store).calls).join(",")),
    );
    expect(repaired.size).toBe(1);
  });
});
