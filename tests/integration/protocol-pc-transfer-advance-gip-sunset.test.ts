/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign store to simulate lost replies, crashes and refused stages */
// Active-PC stop-at-delivery advance over a registered GIP sunset — the real path over the real owners. The existing, separately
// player-authorized advance now registers GIP's own `gipSunsetExpiryProvider`, so an Instrument whose exact `sunset_condition` is
// earned at or before the PC's delivery boundary is expired by GIP alone, at its own boundary, while World-State and Logistics
// independently deliver the PC at the original boundary. No fixture authors `expired`, a stage or a due flag: the Instrument, its
// office and Scope Binding, GIP's enrollment receipt and the PC's movement are all committed by their owners.
// Register lineage: IA-04, IA-06 (partial, no status change); RC-05/15/16; IM-02, IM-06, IM-15, IM-16.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  TEMPORAL_BOUNDARY_INDEX_KEY,
  gipInstrumentKey,
  gipSunsetStage,
  logisticsBoundaryId,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsObjectId,
  logisticsTransferKey,
  temporalTransactionKey,
  worldEntityTransitionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { INSTRUMENT_A, LOG_T_DELIVERY } from "@immortalis/testkit";
import { OTHER_SUNSET_AT, SUNSET_AT, SUNSET_MID, at } from "../support/gip-sunset.ts";
import { gipOf, instrumentFact, lifecycleOf, sunsetPcCampaign } from "../support/pc-gip-sunset.ts";
import {
  PC,
  REQUEST_ID,
  W,
  authorityCensus,
  movementSummary,
  reopenMovement,
  snapshotFacts,
  type PcMoveSeeded,
} from "../support/pc-movement.ts";
import {
  ADVANCE_COMMITTED,
  ADVANCE_REFUSAL,
  ADVANCE_TX,
  ADVANCE_UNKNOWN,
  advance,
  advanceTransaction,
  crashWhen,
  loseReplyWhen,
  trustedAdvance,
} from "../support/protocol-advance.ts";
import { tempDir } from "../support/tmp.ts";

const OBJECT_ID = logisticsObjectId(REQUEST_ID);
const BOUNDARY_ID = logisticsBoundaryId(REQUEST_ID);
const REFUSED = JSON.parse(ADVANCE_REFUSAL);
const TX2 = "tx-pc-second-choice";
const SUNSET_OBJECT = "obj-gip-sunset-instrument-a-1";
const GIP_STAGE = gipSunsetStage(INSTRUMENT_A);
const OPS = {
  gip: { owner: "gip", operation: "gip-expire-instrument-at-sunset" },
  delivery: { owner: "logistics", operation: "logistics-establish-delivery" },
  destination: { owner: "world_state", operation: "world-state-commit-entity-transition" },
  retirement: { owner: "logistics", operation: "logistics-retire-transfer" },
} as const;

const isGip = (g: CommitGroup) => g.writes.some((w) => w.key === gipInstrumentKey(INSTRUMENT_A));
const isDelivery = (g: CommitGroup) => g.writes.some((w) => w.key === logisticsDeliveryKey(W, PC));
const isDestination = (g: CommitGroup) =>
  g.writes.some((w) => w.key === worldEntityTransitionKey(W, PC));
const isTxRecord = (g: CommitGroup) =>
  g.writes.some((w) => w.key === temporalTransactionKey(ADVANCE_TX));

const opsOf = (s: PcMoveSeeded, id = ADVANCE_TX) =>
  s.coordinator.transaction(id)!.value.stages.map((x) => x.stage.owner_operation);
const timeOf = (s: PcMoveSeeded) => s.coordinator.state()!.value.canonical_time;
const instrumentValue = (s: PcMoveSeeded) => structuredClone(instrumentFact(s)!.value as any);

const unchanged = async (s: PcMoveSeeded, attempt: () => Promise<unknown>): Promise<unknown> => {
  const before = movementSummary(s);
  const r = await attempt();
  expect(movementSummary(s)).toEqual(before);
  return r;
};

/** Every commit group, in the order it reached the store, recorded without altering any of them. */
function recordCommits(s: PcMoveSeeded): () => readonly CommitGroup[] {
  const real = s.campaign.store;
  const seen: CommitGroup[] = [];
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return async (g: CommitGroup) => {
          const r = await target.commit(g);
          if (r.ok) seen.push(g);
          return r;
        };
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => seen;
}

/** Swap the store for one whose admission-time view refuses the GIP expiry stage (the stage's write is made inadmissible). */
function refuseGipStage(s: PcMoveSeeded): () => void {
  const real = s.campaign.store;
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return (g: CommitGroup) =>
          target.commit(
            isGip(g) && g.writes.length === 1 && g.owner === "gip"
              ? {
                  ...g,
                  writes: g.writes.map((w) => ({
                    ...w,
                    value: { ...(w.value as any), sunset_condition: at(999) },
                  })),
                }
              : g,
          );
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => ((s.campaign as any).store = real);
}

describe("a sunset earned before the PC's delivery is expired by GIP alone, at its own boundary, within the separately authorized advance", () => {
  it("expires the same Instrument slot once at the sunset, then delivers, commits the destination and retires at the original PC boundary", async () => {
    const s = await sunsetPcCampaign(SUNSET_MID);
    const before = snapshotFacts(s);
    const prior = instrumentValue(s);
    expect(prior.lifecycle_status).toBe("active");
    expect(s.coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual([
      SUNSET_OBJECT,
      OBJECT_ID,
    ]);
    const commits = recordCommits(s);

    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);

    // the Instrument: the same slot, active → expired, every other field (validity_by_order[] included) retained
    expect(lifecycleOf(s)).toBe("expired");
    expect(instrumentFact(s)!.version).toBe(2);
    expect(instrumentValue(s)).toEqual({ ...prior, lifecycle_status: "expired" });

    // the transaction: GIP's stage at GIP's own instant, then the PC chain at the PC's boundary, in the kernel's order
    const tx = s.coordinator.transaction(ADVANCE_TX)!.value;
    expect(tx.requested).toEqual({
      target: null,
      condition: { kind: "STOP_AFTER_BOUNDARY", object_id: OBJECT_ID, boundary_id: BOUNDARY_ID },
    });
    expect(tx.continues).toBeNull();
    expect(tx.context).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });
    expect(tx.outcome).toMatchObject({
      actual_stop: LOG_T_DELIVERY,
      stop_reason: "CONDITION_SATISFIED",
      remainder: null,
      unresolved_dependents: [],
    });
    expect(opsOf(s)).toEqual([OPS.gip, OPS.delivery, OPS.destination, OPS.retirement]);
    expect(tx.stages[0]!.stage).toEqual(GIP_STAGE);
    expect(tx.boundaries_crossed).toEqual([
      { object_id: SUNSET_OBJECT, boundary_id: expect.any(String), at: SUNSET_MID },
      { object_id: OBJECT_ID, boundary_id: BOUNDARY_ID, at: LOG_T_DELIVERY },
    ]);
    expect(tx.engaged.map((e) => [e.object_id, e.boundary])).toEqual([
      [SUNSET_OBJECT, "RETIRED"],
      [OBJECT_ID, "RETIRED"],
    ]);
    // GIP's stage read exactly its committed source office and Scope Binding as of now
    expect(tx.stages[0]!.reads.map((r) => r.mode)).toEqual(["AS-OF-NOW", "AS-OF-NOW"]);
    expect(tx.stages[0]!.reads.map((r) => r.source.owner)).toEqual(["gip", "gip"]);

    // the journal commits the stages in that order, and the transaction record last
    const order = commits().map((g) =>
      isGip(g)
        ? "gip"
        : isDelivery(g)
          ? "delivery"
          : isDestination(g)
            ? "destination"
            : g.writes.some((w) => w.key === logisticsTransferKey(W, PC)) && g.owner === "logistics"
              ? "retirement"
              : isTxRecord(g)
                ? "transaction"
                : "other",
    );
    expect(order.filter((o) => o !== "other")).toEqual([
      "gip",
      "delivery",
      "destination",
      "retirement",
      "transaction",
    ]);

    // the PC is truthfully at its destination under World-State alone; time stopped at the PC's selected boundary
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
      movement: null,
    });
    expect(authorityCensus(s)).toMatchObject({ destination: 1, total: 1 });
    expect(timeOf(s)).toEqual(LOG_T_DELIVERY);
    expect(s.coordinator.state()!.value.continuation).toBeNull();
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);

    // nothing else is written: the Instrument, the clock, the transaction and the PC chain are the only changed facts, and no
    // packet, knowledge, recognition or other owner fact exists for the expiry
    const after = snapshotFacts(s);
    const changed = [...after.keys()].filter(
      (k) => JSON.stringify(after.get(k)) !== JSON.stringify(before.get(k)),
    );
    expect(changed.filter((k) => !k.startsWith("temporal/")).sort()).toEqual(
      [
        gipInstrumentKey(INSTRUMENT_A),
        logisticsCommitmentKey(W, PC),
        logisticsDeliveryKey(W, PC),
        logisticsTransferKey(W, PC),
        worldEntityTransitionKey(W, PC),
      ].sort(),
    );
    expect(
      [...after.keys()].filter((k) => !before.has(k) && !k.startsWith("temporal/")).sort(),
    ).toEqual([logisticsDeliveryKey(W, PC), worldEntityTransitionKey(W, PC)].sort());
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a later exact-key read establishes the inactive lifecycle while the PC's custody reads its committed result, across save → close → reopen", async () => {
    const dir = tempDir();
    const s = await sunsetPcCampaign(SUNSET_MID, "registered", dir);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    const summary = movementSummary(s);
    await s.campaign.close();

    const reopened = await reopenMovement(dir);
    expect(reopened.campaign.verify()).toEqual([]);
    expect(lifecycleOf(reopened)).toBe("expired");
    expect(reopened.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
    });
    expect(movementSummary(reopened)).toEqual(summary);
    // the same transaction identity replays against the reopened campaign and writes nothing
    expect(await unchanged(reopened, () => advance(trustedAdvance(reopened)))).toEqual(
      ADVANCE_COMMITTED,
    );
    await reopened.campaign.close();
  });

  it("a sunset at the PC's own delivery boundary expires with the delivery under same-time law, with no precedence invented between the independent owners", async () => {
    expect(SUNSET_AT).toEqual(LOG_T_DELIVERY);
    const s = await sunsetPcCampaign(SUNSET_AT);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);

    expect(lifecycleOf(s)).toBe("expired");
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "DESTINATION_COMMITTED" });
    expect(timeOf(s)).toEqual(LOG_T_DELIVERY);
    const ops = opsOf(s);
    // each owner's stage appears exactly once; only the PC chain's own causal order is asserted
    expect(ops).toHaveLength(4);
    expect(ops).toEqual(
      expect.arrayContaining([OPS.gip, OPS.delivery, OPS.destination, OPS.retirement]),
    );
    const chain = ops.filter((o) => o.owner !== "gip");
    expect(chain).toEqual([OPS.delivery, OPS.destination, OPS.retirement]);
    const tx = s.coordinator.transaction(ADVANCE_TX)!.value;
    expect(tx.boundaries_crossed.map((b) => b.at)).toEqual([LOG_T_DELIVERY, LOG_T_DELIVERY]);
    expect(tx.outcome.stop_reason).toBe("CONDITION_SATISFIED");
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("contrast: a sunset that is not earned, or does not exist, expires nothing and moves nothing it should not", () => {
  it("a sunset after the PC's delivery is not expired and the advance stops at the PC's selected boundary, leaving the sunset enrolled", async () => {
    const s = await sunsetPcCampaign(OTHER_SUNSET_AT);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);

    expect(lifecycleOf(s)).toBe("active");
    expect(instrumentFact(s)!.version).toBe(1);
    expect(opsOf(s)).toEqual([OPS.delivery, OPS.destination, OPS.retirement]);
    expect(timeOf(s)).toEqual(LOG_T_DELIVERY);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "DESTINATION_COMMITTED" });
    // the later sunset stays registered at its own earned boundary
    expect(s.coordinator.boundaryIndex().entries).toEqual([
      expect.objectContaining({ object_id: SUNSET_OBJECT, at: OTHER_SUNSET_AT }),
    ]);
    expect(s.coordinator.transaction(ADVANCE_TX)!.value.boundaries_crossed).toEqual([
      { object_id: OBJECT_ID, boundary_id: BOUNDARY_ID, at: LOG_T_DELIVERY },
    ]);
  });

  it("an Instrument with no sunset term has no GIP expiry stage and no Temporal object", async () => {
    const s = await sunsetPcCampaign(null, "no-sunset");
    expect(s.coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual([OBJECT_ID]);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    expect(lifecycleOf(s)).toBe("active");
    expect(opsOf(s)).toEqual([OPS.delivery, OPS.destination, OPS.retirement]);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "DESTINATION_COMMITTED" });
  });
});

describe("a committed but unregistered sunset refuses the whole request, and completing GIP's enrollment lifts the refusal", () => {
  it("refuses with the one generic refusal, writes no authority, stage or time, and a lawful replay succeeds once the exact enrollment completes", async () => {
    const s = await sunsetPcCampaign(SUNSET_MID, "pending");
    expect(s.coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual([OBJECT_ID]);
    const refused = await unchanged(s, () => advance(trustedAdvance(s)));
    expect(JSON.stringify(refused)).toBe(ADVANCE_REFUSAL);
    expect(lifecycleOf(s)).toBe("active");
    expect(timeOf(s)).toEqual(at(100));
    expect(s.coordinator.transaction(ADVANCE_TX)).toBeUndefined();
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "IN_TRANSFER" });
    // the refusal is stable
    expect(await unchanged(s, () => advance(trustedAdvance(s)))).toEqual(REFUSED);

    expect(
      (
        await gipOf(s).completeSunsetEnrollment({
          group_id: "complete-g",
          intent_id: "complete-i",
          cause: "complete-c",
          basis: "b",
          secrecy: "s",
        })
      ).ok,
    ).toBe(true);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    expect(lifecycleOf(s)).toBe("expired");
    expect(opsOf(s)).toEqual([OPS.gip, OPS.delivery, OPS.destination, OPS.retirement]);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "DESTINATION_COMMITTED" });
  });

  it("the pending refusal survives save → close → reopen", async () => {
    const dir = tempDir();
    const s = await sunsetPcCampaign(SUNSET_MID, "pending", dir);
    await s.campaign.close();
    const reopened = await reopenMovement(dir);
    expect(await unchanged(reopened, () => advance(trustedAdvance(reopened)))).toEqual(REFUSED);
    expect(lifecycleOf(reopened)).toBe("active");
    await reopened.campaign.close();
  });
});

describe("fail-closed: nothing fabricates expiry, knowledge or arrival", () => {
  it("a stage GIP cannot lawfully commit holds the journey as a truthful unresolved stop: no expiry, no arrival; a distinct authorized choice then completes both", async () => {
    const s = await sunsetPcCampaign(SUNSET_MID);
    const restore = refuseGipStage(s);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    restore();

    const held = s.coordinator.transaction(ADVANCE_TX)!.value;
    expect(held.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(held.outcome.unresolved_dependents.length).toBeGreaterThan(0);
    expect(lifecycleOf(s)).toBe("active");
    expect(instrumentFact(s)!.version).toBe(1);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "IN_TRANSFER" });
    expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
    expect(timeOf(s).value).toBeLessThan(LOG_T_DELIVERY.value);
    const heldState = s.coordinator.state()!.value.continuation;
    expect(heldState).not.toBeNull();

    // the same choice re-presented replays and writes nothing; it neither resumes nor abandons the held journey
    expect(await unchanged(s, () => advance(trustedAdvance(s)))).toEqual(ADVANCE_COMMITTED);

    // only a distinct, newly authorized transaction consumes it, with the earlier `requested` verbatim; committed history is kept
    const priorRecord = structuredClone(s.coordinator.transaction(ADVANCE_TX)!.value);
    expect(await advance(trustedAdvance(s, { transaction: advanceTransaction(TX2) }))).toEqual(
      ADVANCE_COMMITTED,
    );
    const resumed = s.coordinator.transaction(TX2)!.value;
    expect(resumed.continues).toBe(ADVANCE_TX);
    expect(resumed.requested).toEqual(priorRecord.requested);
    expect(s.coordinator.transaction(ADVANCE_TX)!.value).toEqual(priorRecord);
    expect(lifecycleOf(s)).toBe("expired");
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "DESTINATION_COMMITTED" });
    expect(timeOf(s)).toEqual(LOG_T_DELIVERY);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an unauthorized or wrong-PC attempt is refused with a sunset registered, and neither the Instrument nor the PC moves", async () => {
    const s = await sunsetPcCampaign(SUNSET_MID);
    const bad = [
      advanceTransaction("tx-x", {
        context: { role: "role.archivist", permission: "permission.canon.write" },
      }),
    ];
    for (const transaction of bad)
      expect(await unchanged(s, () => advance(trustedAdvance(s, { transaction })))).toEqual(
        REFUSED,
      );
    expect(await unchanged(s, () => advance(trustedAdvance(s, { pc_id: "actor-other" })))).toEqual(
      REFUSED,
    );
    expect(lifecycleOf(s)).toBe("active");
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "IN_TRANSFER" });
  });
});

describe("idempotency: repeated identical authorization neither duplicates the expiry nor the delivery; a conflicting replay refuses", () => {
  it("replays the same status however often it is repeated and writes nothing", async () => {
    const s = await sunsetPcCampaign(SUNSET_MID);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    const summary = movementSummary(s);
    for (let i = 0; i < 3; i++) expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(s)).toEqual(summary);
    expect(instrumentFact(s)!.version).toBe(2);
  });

  it("the same identity with different provenance, and a new identity after the boundary is resolved, are refused and write nothing", async () => {
    const s = await sunsetPcCampaign(SUNSET_MID);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    for (const over of [
      { cause: "another-cause" },
      { trigger: { kind: "player-advance-choice", ref: "another-ref" } },
    ])
      expect(
        await unchanged(s, () =>
          advance(trustedAdvance(s, { transaction: advanceTransaction(ADVANCE_TX, over) })),
        ),
      ).toEqual(REFUSED);
    expect(
      await unchanged(s, () =>
        advance(trustedAdvance(s, { transaction: advanceTransaction("tx-new-identity") })),
      ),
    ).toEqual(REFUSED);
  });
});

describe("interrupted-run recovery converges on one expiry and one arrival under one transaction identity", () => {
  const reference = async () => {
    const s = await sunsetPcCampaign(SUNSET_MID);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    return movementSummary(s).head.state_sha256;
  };
  const cuts: readonly [string, (g: CommitGroup) => boolean, "active" | "expired"][] = [
    ["GIP expiry stage", isGip, "active"],
    ["Logistics delivery", isDelivery, "expired"],
    ["transaction record", isTxRecord, "expired"],
  ];

  for (const [name, pred, lifecycle] of cuts) {
    it(`a crash before the ${name} leaves what committed intact; the same request adopts it and converges byte-identically with no second expiry`, async () => {
      const ref = await reference();
      const s = await sunsetPcCampaign(SUNSET_MID);
      const restore = crashWhen(s, pred);
      expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_UNKNOWN);
      restore();
      expect(lifecycleOf(s)).toBe(lifecycle);
      expect(s.coordinator.transaction(ADVANCE_TX)).toBeUndefined();
      expect(authorityCensus(s).total).toBe(1);
      expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
      expect(movementSummary(s).head.state_sha256).toBe(ref);
      expect(instrumentFact(s)!.version).toBe(2);
      expect(opsOf(s)).toEqual([OPS.gip, OPS.delivery, OPS.destination, OPS.retirement]);
      expect(s.campaign.verify()).toEqual([]);
    });
  }

  it("a lost reply after the GIP expiry commits is unknown, never safely absent, and the same request converges with no duplicate expiry", async () => {
    const ref = await reference();
    const s = await sunsetPcCampaign(SUNSET_MID);
    const restore = loseReplyWhen(s, isGip);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_UNKNOWN);
    restore();
    expect(lifecycleOf(s)).toBe("expired");
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(s).head.state_sha256).toBe(ref);
    expect(instrumentFact(s)!.version).toBe(2);
  });

  it("save → close → reopen after the GIP stage committed but before the PC chain: the same transaction identity converges and the receipt is conserved", async () => {
    const ref = await reference();
    const dir = tempDir();
    const s = await sunsetPcCampaign(SUNSET_MID, "registered", dir);
    crashWhen(s, isDelivery);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_UNKNOWN);
    await s.campaign.close();

    const reopened = await reopenMovement(dir);
    expect(reopened.campaign.verify()).toEqual([]);
    expect(lifecycleOf(reopened)).toBe("expired");
    expect(reopened.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "IN_TRANSFER" });
    expect(authorityCensus(reopened)).toMatchObject({ logistics: 1, total: 1 });
    expect(await advance(trustedAdvance(reopened))).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(reopened).head.state_sha256).toBe(ref);
    expect(reopened.coordinator.state()!.value.last_transaction).toBe(ADVANCE_TX);
    expect(instrumentFact(reopened)!.version).toBe(2);
    expect(reopened.campaign.store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)).toBeDefined();
    await reopened.campaign.close();
  });
});
