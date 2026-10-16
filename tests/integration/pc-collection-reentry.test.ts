/* eslint-disable @typescript-eslint/no-explicit-any -- tests read arbitrary fact values */
// CPAA-C1 v0.2 PROVISIONAL — movement re-entry. The historic movement records of a PC no longer exclude a collection once its single
// voluntary leg has SETTLED: the PC is then stationary at World-State's destination (the one authority for it), and a collection
// there is judged by the same rules. A movement that is pending or in flight still excludes it, and the settled PC cannot collect
// at its old locus. No new journey rule, no travel and no cancellation is involved.
import { describe, expect, it } from "vitest";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
} from "@immortalis/protocol";
import {
  ACT_A,
  ACT_B,
  COLLECTION_COMMITTED,
  COLLECTION_REFUSAL,
  DEST_BASIS,
  DEST_RESERVE,
  DEST_SOURCE_KEY,
  PC,
  T0,
  TAU,
  W,
  at,
  choice,
  collectionCampaign,
  confirmAndStart,
  establishDestinationSource,
  reopenCollection,
  trustedCollection,
  type CollectionSeeded,
} from "../support/pc-collection.ts";
import {
  advanceToDelivery,
  commitMove,
  logisticsCommit,
  logisticsDispatch,
  registerPcTransfer,
  requestMove,
} from "../support/pc-movement.ts";
import {
  commitConfirmedPcCollection,
  getPcCollectionReachTask,
  startConfirmedPcCollection,
  submitPcCollectionReach,
} from "@immortalis/protocol";
import { COMMIT_REQ, START_REQ, TASK_REQ, hostAnswer, reachReq } from "../support/pc-collection.ts";
import { PC_TARGET_COMMITTED, pcTargetTransaction } from "../support/pc-target-advance.ts";
import { ADVANCE_COMMITTED, advance, trustedAdvance } from "../support/protocol-advance.ts";
import { relocate, trustedRelocation } from "../support/protocol-relocation.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const advanceTo = (s: CollectionSeeded, value: number, tx: string) =>
  advanceActivePcToTarget(
    bindTrustedActivePcTargetAdvanceContext({
      campaign: s.campaign as never,
      pc_id: PC,
      target: at(value),
      transaction: pcTargetTransaction(tx) as never,
    }),
    { operation: "advance_active_pc_to_target" },
  );

const destChoice = (act: string, quantity = 3) =>
  choice(act, quantity, {
    source: { world_id: W, source_key: DEST_SOURCE_KEY },
    reserve_id: DEST_RESERVE,
  });

async function collectAtDestination(s: CollectionSeeded, act: string, quantity: number) {
  const ctx = trustedCollection(s, act, quantity, {
    choice: destChoice(act, quantity),
    basis_id: DEST_BASIS,
  });
  const committed = await commitConfirmedPcCollection(ctx, COMMIT_REQ);
  const task = getPcCollectionReachTask(ctx, TASK_REQ);
  const judged = task.ok
    ? await submitPcCollectionReach(
        ctx,
        reachReq(hostAnswer(task.value.task, "OPEN", "NOT_AT_ISSUE")),
      )
    : task;
  const started = await startConfirmedPcCollection(ctx, START_REQ);
  return { committed, judged, started };
}

/** The leg's steps; each is re-presentable under its fixed identity, so a test may stop after any of them. */
/** The ratified relocation gateway commits the leg (in transfer, enrolled); the ratified stop-at-delivery gateway settles it. */
async function settleJourney(s: CollectionSeeded): Promise<void> {
  expect(await relocate(trustedRelocation(s))).toMatchObject({ ok: true });
  expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
}

const journey = {
  commit: (s: CollectionSeeded) => must(commitMove(s, 1)),
  request: (s: CollectionSeeded) => must(requestMove(s, 2)),
  logistics: (s: CollectionSeeded) => must(logisticsCommit(s, 3)),
  dispatch: (s: CollectionSeeded) => must(logisticsDispatch(s, 4)),
  register: (s: CollectionSeeded) => registerPcTransfer(s, 5),
  settle: (s: CollectionSeeded) => must(advanceToDelivery(s)),
};

describe("a settled single-leg movement does not exclude a collection at the destination", () => {
  it("collect at the origin, journey to the destination, collect there: each source drops once, each Reserve rises once", async () => {
    const s = await collectionCampaign();
    await establishDestinationSource(s);

    // act A at the origin, to its close
    expect((await confirmAndStart(s, ACT_A, 3)).started).toEqual(COLLECTION_COMMITTED);
    expect(await advanceTo(s, T0.value + 3 * TAU, "tx-origin-collect")).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(s.collect.closed(PC, ACT_A)).toBe(true);

    // the PC is released from the collection, so it may now commit to its one journey, and the journey settles
    await settleJourney(s);

    // the origin source is out of reach now: the PC is not there
    const stale = await confirmAndStart(s, ACT_B, 2);
    expect(JSON.stringify(stale.started)).toBe(COLLECTION_REFUSAL);
    expect(s.collect.extraction(PC, ACT_B)).toBeUndefined();

    // act C at the destination, under the same rules
    const now = s.coordinator.state()!.value.canonical_time.value;
    expect(now).toBeGreaterThan(T0.value + 3 * TAU);
    const c = await collectAtDestination(s, "act-c", 3);
    expect(c.committed).toEqual(COLLECTION_COMMITTED);
    expect(c.judged).toEqual(COLLECTION_COMMITTED);
    expect(c.started).toEqual(COLLECTION_COMMITTED);
    expect(s.collect.extraction(PC, "act-c")!.value.timing.boundary.at.value).toBe(now + 3 * TAU);
    expect(await advanceTo(s, now + 3 * TAU, "tx-dest-collect")).toEqual(PC_TARGET_COMMITTED);
    expect(s.collect.closed(PC, "act-c")).toBe(true);
    const dest = s.campaign.store.getFact(`world/${W}/source/${DEST_SOURCE_KEY}`)!.value as any;
    expect(dest.recoverable.amount).toBe(2);
    const reserve = s.campaign.store.getFact(`production/reserve/${DEST_RESERVE}`)!.value as any;
    expect(reserve.quantity.amount).toBe(3);
    // the origin Reserve still holds act A's three, and the origin source is still two
    expect(
      (s.campaign.store.getFact("production/reserve/reserve-raw")!.value as any).quantity.amount,
    ).toBe(3);
    expect(
      (s.campaign.store.getFact(`world/${W}/source/source-main`)!.value as any).recoverable.amount,
    ).toBe(2);
  });

  it("reopens cleanly after the whole history (the origin act still verifies at the origin it was made at)", async () => {
    const dir = tempDir("immortalis-col-reentry-");
    const s = await collectionCampaign({ dir });
    await establishDestinationSource(s);
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 3 * TAU, "tx-origin-collect");
    await settleJourney(s);
    await collectAtDestination(s, "act-c", 3);
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenCollection(dir);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    await r.campaign.close();
  });
});

describe("a movement that is pending or in flight still excludes a collection, at every stage", () => {
  const stages: [string, (s: CollectionSeeded) => Promise<unknown>][] = [
    ["the commitment-of-record only", async (s) => journey.commit(s)],
    [
      "the PC-owned request",
      async (s) => {
        await journey.commit(s);
        await journey.request(s);
      },
    ],
    [
      "a Logistics commitment, not dispatched",
      async (s) => {
        await journey.commit(s);
        await journey.request(s);
        await journey.logistics(s);
      },
    ],
    [
      "in transfer",
      async (s) => {
        await journey.commit(s);
        await journey.request(s);
        await journey.logistics(s);
        await journey.dispatch(s);
        await journey.register(s);
      },
    ],
  ];
  it.each(stages)("%s", async (_name, setup) => {
    const s = await collectionCampaign();
    await setup(s);
    const r = await confirmAndStart(s, ACT_A, 3);
    expect(JSON.stringify(r.started)).toBe(COLLECTION_REFUSAL);
    expect(s.collect.extraction(PC, ACT_A)).toBeUndefined();
    expect(s.collect.occupancyState(PC).state).toBe("NONE");
  });
});
