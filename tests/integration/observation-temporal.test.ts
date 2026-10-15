/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw persisted records */
// BLUE v5.2 — the Temporal invariants of the direct observation, and the kernel carrying on after it (F-014B §§2, 6, 13, 17; F-017 §4;
// F-027 RC-05, RC-10). The observation is a current-state event-triggered transaction: it registers no Temporal object, indexes no
// boundary, crosses none, and leaves canonical time exactly where it was. It must also leave the kernel able to advance time as before,
// and a second look at a later basis must be its own event and its own transaction (a changed basis is a different question).
import { describe, expect, it } from "vitest";
import {
  AccessEventSchema,
  BoundaryIndexSchema,
  OBSERVATION_TRIGGER_KIND,
  ResolutionTransactionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  accessEventKey,
  accessPacketStage,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  TemporalCoordinator,
  deriveEventSignalProjection,
  formObservedPacket,
  verifyEpistemicIntegrity,
} from "@immortalis/engine";
import { stopAtBoundaryRequest } from "@immortalis/testkit";
import { at } from "../support/gip-sunset.ts";
import { openOrdinary } from "../support/locality.ts";
import { BASIS, PC_ID, observationCampaign, observe } from "../support/observation.ts";
import { must } from "../support/temporal.ts";

const LATER = at(150);

describe("the observation's Temporal invariants", () => {
  it("registers no object, indexes no boundary, crosses none and leaves canonical time where it was", async () => {
    const { dirs } = await observationCampaign();
    const beforeC = await openOrdinary(dirs.campaignDir);
    const before = {
      index: beforeC.store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)?.value,
      objects: beforeC.store.listFacts().filter((f) => f.key.startsWith("temporal/object/")).length,
    };
    await beforeC.close();

    const { result } = await observe(dirs);
    expect(result.status, JSON.stringify(result.details)).toBe("OBSERVATION_RECEIVED");

    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      const state = TemporalStateSchema.parse(c.store.getFact(TEMPORAL_STATE_KEY)!.value);
      expect(state.canonical_time).toEqual(BASIS);
      // the boundary index and the object set are exactly what they were
      expect(c.store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)?.value).toEqual(before.index);
      expect(c.store.listFacts().filter((f) => f.key.startsWith("temporal/object/")).length).toBe(
        before.objects,
      );
      expect(BoundaryIndexSchema.parse(before.index ?? { entries: [] }).entries).toEqual([]);

      const txs = c.store
        .listFacts()
        .filter((f) => /^temporal\/transaction\/[^/]+$/.test(f.key))
        .map((f) => ResolutionTransactionSchema.parse(f.value));
      expect(txs).toHaveLength(1);
      const tx = txs[0]!;
      expect(tx.trigger.kind).toBe(OBSERVATION_TRIGGER_KIND);
      expect(tx.engaged).toEqual([]);
      expect(tx.boundaries_crossed).toEqual([]);
      expect(tx.opening.basis_time).toEqual(BASIS);
      expect(tx.requested.target).toEqual(BASIS);
      expect(tx.outcome.actual_stop).toEqual(BASIS);
      expect(tx.outcome.stop_reason).toBe("TARGET_REACHED");
      expect(tx.outcome.remainder).toBeNull();
      expect(tx.outcome.unresolved_dependents).toEqual([]);
      const event = AccessEventSchema.parse(c.store.getFact(accessEventKey(tx.trigger.ref))!.value);
      expect(tx.stages).toHaveLength(1);
      expect(tx.stages[0]!.stage).toEqual(accessPacketStage(event.event_id, PC_ID));
    } finally {
      await c.close();
    }
  });

  it("the kernel advances time afterwards as it did before, and a replay of the formation writes nothing", async () => {
    const { dirs } = await observationCampaign();
    const first = await observe(dirs);
    expect(first.result.status).toBe("OBSERVATION_RECEIVED");

    const c = await openOrdinary(dirs.campaignDir);
    try {
      const decisionKey = c.store
        .listFacts()
        .find((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION")!.key;
      const head = c.store.head();
      const replay = await formObservedPacket(c.store, decisionKey);
      expect(replay.ok).toBe(true);
      if (replay.ok) expect(replay.value.replayed).toBe(true);
      expect(c.store.head().revision).toBe(head.revision);
      expect(c.store.head().state_sha256).toBe(head.state_sha256);

      // a plain advance of canonical time with nothing engaged
      const coordinator = new TemporalCoordinator(c.store, new StageProviderRegistry());
      await must(
        coordinator.advance(
          stopAtBoundaryRequest("tx-after-observation", {
            requested: { target: LATER, condition: null },
          }),
        ),
      );
      expect(
        TemporalStateSchema.parse(c.store.getFact(TEMPORAL_STATE_KEY)!.value).canonical_time,
      ).toEqual(LATER);
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
    } finally {
      await c.close();
    }
    // reopen: everything still verifies and the observation's replay is still a no-op
    const again = await openOrdinary(dirs.campaignDir);
    try {
      expect(again.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(again.store)).toEqual([]);
    } finally {
      await again.close();
    }
  });

  it("a second look at a later basis is its own event and transaction; the first stays held", async () => {
    const { dirs } = await observationCampaign();
    expect((await observe(dirs)).result.status).toBe("OBSERVATION_RECEIVED");

    const c0 = await openOrdinary(dirs.campaignDir);
    try {
      await must(
        new TemporalCoordinator(c0.store, new StageProviderRegistry()).advance(
          stopAtBoundaryRequest("tx-between", {
            requested: { target: LATER, condition: null },
          }),
        ),
      );
    } finally {
      await c0.close();
    }

    const second = await observe(dirs);
    expect(second.result.status, JSON.stringify(second.result.details)).toBe(
      "OBSERVATION_RECEIVED",
    );

    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      const events = c.store
        .listFacts()
        .filter((f) => /^access\/[^/]+\/event$/.test(f.key))
        .map((f) => AccessEventSchema.parse(f.value));
      expect(events.map((e) => e.established_at.value).sort()).toEqual([BASIS.value, LATER.value]);
      const txs = c.store
        .listFacts()
        .filter(
          (f) =>
            /^temporal\/transaction\/[^/]+$/.test(f.key) &&
            (f.value as any).trigger.kind === OBSERVATION_TRIGGER_KIND,
        );
      expect(txs).toHaveLength(2);
      // the delivery is of the current arrival; the first packet is held but is no longer it
      const current = events.find((e) => e.established_at.value === LATER.value)!;
      const projected = deriveEventSignalProjection(c.store, {
        event_id: current.event_id,
        recipient_id: PC_ID,
      });
      expect(projected.ok).toBe(true);
    } finally {
      await c.close();
    }
  });
});
