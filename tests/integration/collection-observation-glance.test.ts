/* eslint-disable @typescript-eslint/no-explicit-any -- corrupt-view tests mutate raw owner facts */
// Real owners and scripted decisions: mechanism evidence only. The appearance is the independently authored red wall,
// never inferred from the mechanical sentence announcing completion of gathering.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  productionExtractionKey,
  productionReserveKey,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  formObservedPacket,
  observationEventId,
  type CanonicalCampaign,
  type ProjectionStateView,
} from "@immortalis/engine";
import {
  bindTrustedCausalEventSignalContext,
  bindTrustedCurrentPlayerContext,
  deliverCausalEventSignalPresentation,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { openOrdinary, SOURCE_KEY, WORLD_ID } from "../support/locality.ts";
import { BASIS, PC_ID } from "../support/observation.ts";
import {
  SALT,
  SALT_TAU,
  collectAndComplete,
  decideOutcome,
  originalCollectionCampaign,
} from "../support/pc-collection-original.ts";
import { CAUSAL_REQUEST, GLANCE_REQUEST, PROTOCOL_REFUSAL } from "../support/protocol.ts";

const boundary = { unit: BASIS.unit, value: BASIS.value + 3 * SALT_TAU };
const extractionId = `pc-collect:${PC_ID}:act-glance`;
const delivery = worldSourceDeliveryKey(WORLD_ID, extractionId);
const keys = [
  worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
  productionExtractionKey(extractionId),
  productionReserveKey(SALT.reserve),
];
let c: CanonicalCampaign;
let campaignDir: string;
function read(
  change: (key: string, fact: OwnerFact | undefined) => OwnerFact | undefined = (_k, f) => f,
) {
  const calls: { method: string; key: string }[] = [];
  const view: ProjectionStateView = {
    getFact: (key) => {
      calls.push({ method: "getFact", key });
      return change(key, c.store.getFact(key));
    },
    committedGroup: (key) => {
      calls.push({ method: "committedGroup", key });
      return c.store.committedGroup(key);
    },
  };
  const out = readCurrentObservationGlance(
    bindTrustedCurrentPlayerContext({ view, recipient_id: PC_ID }),
    GLANCE_REQUEST(),
  );
  return { out, calls, shape: calls.map((call) => call.method) };
}
beforeAll(async () => {
  const { dirs } = await originalCollectionCampaign();
  campaignDir = dirs.campaignDir;
  c = await openOrdinary(campaignDir);
  await collectAndComplete(c, "act-glance", 3, "tx-glance", boundary);
  const decision = await decideOutcome(c, { of: "scene" });
  expect(decision.recorded.ok, JSON.stringify(decision.recorded)).toBe(true);
  expect(decision.context.refs).toHaveLength(6);
  expect(decision.context.refs[5]?.fact_key).toBe(delivery);
  const record = c.store
    .listFacts()
    .find((f) => (f.value as any).operation === "F014D_DIRECT_PERCEPTION")!;
  expect((await formObservedPacket(c.store, record.key)).ok).toBe(true);
});
afterAll(async () => {
  await c?.close();
});

describe("completed-collection qualification through the fixed Glance consumer", () => {
  it("delivers independent appearance exactly as the existing causal presentation, repeatedly and after reopening", async () => {
    const before = c.store.head().state_sha256;
    const a = read();
    expect(a.out.ok, JSON.stringify(a.out)).toBe(true);
    expect(JSON.stringify(a.out)).toContain("a broad patch of bright red on pale plaster");
    expect(JSON.stringify(a.out)).not.toMatch(/117|120|gathering|completed|source-delivery/);
    const causal = deliverCausalEventSignalPresentation(
      bindTrustedCausalEventSignalContext({
        view: c.store,
        recipient_id: PC_ID,
        event_id: observationEventId(PC_ID, boundary),
      }),
      CAUSAL_REQUEST(),
    );
    expect(a.out).toEqual(causal);
    expect(a.calls).toHaveLength(22); // fourteen gateway reads (one fixed citation slot for the viewing circumstance), unchanged eight projection reads
    // the sixth citation (the delivery), then the one fixed GM-scene citation slot (a sentinel here), then the delivery's own source and its owners
    expect(a.calls.slice(9, 14).map((r) => r.key)).toEqual([delivery, "-", ...keys]);
    expect(read().out).toEqual(causal);
    expect(c.store.head().state_sha256).toBe(before);
    await c.close();
    c = await openOrdinary(campaignDir);
    expect(read().out).toEqual(causal);
  });

  it("missing, malformed, foreign-owned, invalid-version, wrong-key and throwing qualification facts refuse with the identical ordered shape", () => {
    const positive = read();
    expect(positive.out.ok).toBe(true);
    for (const key of keys) {
      const corruptions: ((f: OwnerFact) => OwnerFact | undefined)[] = [
        () => undefined,
        (f) => ({ ...f, value: {} }),
        (f) => ({ ...f, owner: "foreign-owner" }),
        (f) => ({ ...f, version: 0 }),
        (f) => ({ ...f, key: "world/foreign/source/foreign" }),
        () => {
          throw new Error("synthetic failed view");
        },
      ];
      for (const corrupt of corruptions) {
        const result = read((k, f) => (k === key && f ? corrupt(f) : f));
        expect(JSON.stringify(result.out), key).toBe(PROTOCOL_REFUSAL);
        expect(result.shape, key).toEqual(positive.shape);
      }
    }
    const noDelivery = read((key, f) => (key === delivery ? undefined : f));
    expect(JSON.stringify(noDelivery.out)).toBe(PROTOCOL_REFUSAL);
    expect(noDelivery.shape).toEqual(positive.shape);
    expect(noDelivery.calls.slice(10, 13).map((r) => r.key)).toEqual(["-", "-", "-"]);
  });
});
