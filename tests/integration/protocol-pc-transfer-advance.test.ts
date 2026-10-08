/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign store to simulate lost replies and crashes */
// Trusted, separately player-authorized active-PC stop-at-delivery temporal advance gateway (forty-third bounded slice) — the real
// path over the real owners. A trusted context binds the operative PC and the transaction identity and provenance of the player's
// SEPARATE progression choice; the one allowlisted operation freshly re-reads the committed Logistics and Temporal state, builds the
// one literal `STOP_AFTER_BOUNDARY` request and drives the EXISTING `TemporalCoordinator.advance` over the real Logistics delivery,
// World-State destination and Logistics retirement providers. Nothing else.
// Register lineage: IA-01/02/03/04/06/14/18/19/20/28 (partial, no status change); RC-02/04/05/07/10/13/15/16; IM-02/03/05/07/11/12/15/16/17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  logisticsBoundaryId,
  logisticsDeliveryKey,
  logisticsObjectId,
  logisticsTransferKey,
  pcExistenceContractKey,
  temporalTransactionKey,
  worldActorCouplingKey,
  worldEntityTransitionKey,
  worldPcLocusCustodyKey,
} from "@immortalis/contracts";
import { ACTOR_OTHER, LOG_T_DELIVERY } from "@immortalis/testkit";
import {
  DEST_LOCUS_ID,
  PC,
  REQUEST_ID,
  W,
  advanceToDelivery,
  authorityCensus,
  commitMove,
  custodiedCampaign,
  logisticsCommit,
  logisticsDispatch,
  movementSummary,
  registerPcTransfer,
  reopenMovement,
  requestMove,
  snapshotFacts,
  type PcMoveSeeded,
} from "../support/pc-movement.ts";
import {
  ADVANCE_COMMITTED,
  ADVANCE_REFUSAL,
  ADVANCE_REQUEST,
  ADVANCE_TX,
  ADVANCE_UNKNOWN,
  advance,
  advanceTransaction,
  crashWhen,
  expectedAdvanceRequest,
  loseReplyWhen,
  refuseDeliveryStage,
  relocatedCampaign,
  trustedAdvance,
} from "../support/protocol-advance.ts";
import { relocate, trustedRelocation } from "../support/protocol-relocation.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const OBJECT_ID = logisticsObjectId(REQUEST_ID);
const BOUNDARY_ID = logisticsBoundaryId(REQUEST_ID);
const ORIGIN = "locus-fixture-1";
const protectedKeys = [
  PLAYER_CHARACTER_BINDING_KEY,
  worldActorCouplingKey(PC),
  pcExistenceContractKey(PC),
  worldPcLocusCustodyKey(PC),
];

/** a campaign that has committed the ratified relocation: in transfer, one Temporal object, no time advanced */
const relocated = (dir?: string) => relocatedCampaign(() => custodiedCampaign(dir));
const reference = async () => {
  const s = await relocated();
  expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
  return movementSummary(s);
};

/** the attempt changes nothing at all: head, every fact, every receipt */
const unchanged = async (s: PcMoveSeeded, attempt: () => Promise<unknown>): Promise<unknown> => {
  const before = movementSummary(s);
  const r = await attempt();
  expect(movementSummary(s)).toEqual(before);
  return r;
};
const REFUSED = JSON.parse(ADVANCE_REFUSAL);

const isDelivery = (g: any) => g.writes.some((w: any) => w.key === logisticsDeliveryKey(W, PC));
const isDestination = (g: any) =>
  g.writes.some((w: any) => w.key === worldEntityTransitionKey(W, PC));
const isRetirement = (g: any) =>
  g.writes.some((w: any) => w.key === logisticsTransferKey(W, PC)) && g.owner === "logistics";
const isTransaction = (g: any) =>
  g.writes.some((w: any) => w.key === temporalTransactionKey(ADVANCE_TX));

describe("acceptance 1-2: a separately authorized advance resolves the PC's one in-transfer movement to its earned delivery boundary through the existing kernel", () => {
  it("delivers, commits the destination custody and retires the transfer in that order, in one recorded transaction, with one authority at every cut", async () => {
    const s = await relocated();
    const origin = authorityCensus(s);
    expect(origin).toMatchObject({ logistics: 1, total: 1 });
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
    });
    const before = snapshotFacts(s);
    const clock = s.campaign.store.getFact(TEMPORAL_STATE_KEY)!;

    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);

    // the PC is at its destination under World-State alone; Logistics' movement locus lapsed and the transfer is retired
    const where = s.campaign.pcCurrentLocus(PC)!;
    expect(where).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
      movement: null,
    });
    expect(where.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(where.origin.locus.entity_id).toBe(ORIGIN);
    expect(authorityCensus(s)).toMatchObject({
      stationary: 0,
      logistics: 0,
      destination: 1,
      total: 1,
      destinationLocus: DEST_LOCUS_ID,
    });

    // the canonical time moved only through the one recorded transaction, to the earned boundary
    const state = s.coordinator.state()!.value;
    expect(state.canonical_time).toEqual(LOG_T_DELIVERY);
    expect(state.last_transaction).toBe(ADVANCE_TX);
    expect(state.continuation).toBeNull();
    expect(s.campaign.store.getFact(TEMPORAL_STATE_KEY)!.version).toBe(clock.version + 1);
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);

    // the transaction is exactly the literal request the trusted side authored and the committed state earned
    const tx = s.coordinator.transaction(ADVANCE_TX)!.value;
    const wanted = expectedAdvanceRequest(OBJECT_ID, BOUNDARY_ID);
    expect(tx).toMatchObject({
      transaction_id: wanted.transaction_id,
      cause: wanted.cause,
      trigger: wanted.trigger,
      continues: null,
      requested: { target: null, condition: wanted.requested.condition },
      context: { role: "role.player", permission: "permission.player_choice.commit" },
      outcome: {
        actual_stop: LOG_T_DELIVERY,
        stop_reason: "CONDITION_SATISFIED",
        remainder: null,
        unresolved_dependents: [],
      },
    });
    expect(tx.boundaries_crossed).toEqual([
      { object_id: OBJECT_ID, boundary_id: BOUNDARY_ID, at: LOG_T_DELIVERY },
    ]);
    expect(tx.engaged).toMatchObject([{ boundary: "RETIRED", object_id: OBJECT_ID }]);
    // the three owner stages, in the kernel's order: Logistics delivery → World-State destination custody → Logistics retirement
    expect(tx.stages.map((x) => x.stage.owner_operation)).toEqual([
      { owner: "logistics", operation: "logistics-establish-delivery" },
      { owner: "world_state", operation: "world-state-commit-entity-transition" },
      { owner: "logistics", operation: "logistics-retire-transfer" },
    ]);

    // the Role Registry binding, handover, coupling and contract are unchanged
    const after = snapshotFacts(s);
    for (const k of protectedKeys) expect(after.get(k), k).toEqual(before.get(k));
    expect(s.campaign.verify()).toEqual([]);
  });

  it("is fact-for-fact the arrival the existing explicit Temporal advance produces over the manual owner path", async () => {
    const viaGateway = await relocated();
    expect(await advance(trustedAdvance(viaGateway))).toEqual(ADVANCE_COMMITTED);
    const manual = await custodiedCampaign();
    await must(commitMove(manual, 1));
    await must(requestMove(manual, 2));
    await must(logisticsCommit(manual, 3));
    await must(logisticsDispatch(manual, 4));
    await registerPcTransfer(manual, 5);
    await must(advanceToDelivery(manual));
    const owned = (s: PcMoveSeeded) =>
      new Map(
        s.campaign.store
          .listFacts()
          .filter((f) => !f.key.startsWith("temporal/transaction") && f.key !== TEMPORAL_STATE_KEY)
          .map((f) => [
            f.key,
            { owner: f.owner, facet: f.facet, version: f.version, value: f.value },
          ]),
      );
    expect(owned(viaGateway)).toEqual(owned(manual));
    expect(viaGateway.coordinator.state()!.value.canonical_time).toEqual(
      manual.coordinator.state()!.value.canonical_time,
    );
    expect(viaGateway.coordinator.boundaryIndex()).toEqual(manual.coordinator.boundaryIndex());
  });

  it("builds the one literal request from the PC's committed Logistics object and its one registered boundary: condition only, no target, no continuation", async () => {
    const s = await relocated();
    expect(s.coordinator.boundaryIndex().entries).toEqual([
      { object_id: OBJECT_ID, boundary_id: BOUNDARY_ID, at: LOG_T_DELIVERY },
    ]);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    const tx = s.coordinator.transaction(ADVANCE_TX)!.value;
    expect(tx.requested.target).toBeNull();
    expect(tx.continues).toBeNull();
    expect(tx.requested.condition).toEqual({
      kind: "STOP_AFTER_BOUNDARY",
      object_id: OBJECT_ID,
      boundary_id: BOUNDARY_ID,
    });
  });
});

describe("acceptance 6: the movement's confirmation alone never advances time; only a separately bound progression choice does", () => {
  it("relocating, repeating the relocation and reading never move the clock or arrive; the advance context is a different thing from the relocation context", async () => {
    const s = await custodiedCampaign();
    const clock = s.campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    const reloc = trustedRelocation(s);
    for (let i = 0; i < 3; i++) await relocate(reloc);
    expect(s.campaign.store.getFact(TEMPORAL_STATE_KEY)).toEqual(clock);
    expect(s.campaign.pcCurrentLocus(PC)!.phase).toBe("IN_TRANSFER");
    // a relocation context is not an advance context, and the relocation request is not the advance request
    expect(await unchanged(s, () => advance(reloc as never))).toEqual(REFUSED);
    expect(
      await unchanged(s, () =>
        advance(trustedAdvance(s), { operation: "commit_confirmed_pc_relocation" }),
      ),
    ).toEqual(REFUSED);
    // an advance context that was never invoked advances nothing, and the clock is still the one the movement left
    trustedAdvance(s);
    expect(s.campaign.store.getFact(TEMPORAL_STATE_KEY)).toEqual(clock);
    expect(s.coordinator.transaction(ADVANCE_TX)).toBeUndefined();
    // the advance context cannot start a movement, either
    expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
  });

  it("the movement's own identities are not a progression instruction: a context stated with them is inert and nothing is touched", async () => {
    const s = await relocated();
    for (const ids of [
      { transaction_id: REQUEST_ID },
      { transaction_id: OBJECT_ID },
      { transaction_id: `pc-relocation-intent:temporal:${PC}` },
      { transaction_id: `pc-relocation-group:dispatch:${PC}` },
      { cause: REQUEST_ID },
      { trigger: { kind: "player-advance-choice", ref: REQUEST_ID } },
      { trigger: { kind: "player-advance-choice", ref: BOUNDARY_ID } },
    ])
      expect(
        await unchanged(s, () =>
          advance(trustedAdvance(s, { transaction: advanceTransaction(ADVANCE_TX, ids) })),
        ),
        JSON.stringify(ids),
      ).toEqual(REFUSED);
  });
});

describe("acceptance 3: every unlawful, stale or unfounded attempt fails closed with the one refusal and writes nothing", () => {
  it("a PC with no movement (stationary at origin) and a PC with a committed but undispatched move are refused", async () => {
    const a = await custodiedCampaign();
    expect(await unchanged(a, () => advance(trustedAdvance(a)))).toEqual(REFUSED);
    const b = await custodiedCampaign();
    await must(commitMove(b, 1));
    await must(requestMove(b, 2));
    await must(logisticsCommit(b, 3));
    expect(await unchanged(b, () => advance(trustedAdvance(b)))).toEqual(REFUSED);
  });

  it("a transfer that was dispatched but never enrolled with the Temporal kernel is refused: no registration, no invented boundary", async () => {
    const s = await custodiedCampaign();
    await must(commitMove(s, 1));
    await must(requestMove(s, 2));
    await must(logisticsCommit(s, 3));
    await must(logisticsDispatch(s, 4));
    expect(s.campaign.pcCurrentLocus(PC)!.phase).toBe("IN_TRANSFER");
    expect(await unchanged(s, () => advance(trustedAdvance(s)))).toEqual(REFUSED);
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(s.coordinator.object(OBJECT_ID)).toBeUndefined();
  });

  it("a wrong, inactive or unknown PC is refused, however the context states it", async () => {
    const s = await relocated();
    for (const pc_id of [ACTOR_OTHER, "actor-nobody", "", undefined, 7, { id: PC }])
      expect(
        await unchanged(s, () => advance(trustedAdvance(s, { pc_id }))),
        String(pc_id),
      ).toEqual(REFUSED);
  });

  it("a boundary already resolved by someone else's transaction is not re-run under a new identity: refused, nothing written", async () => {
    const s = await relocated();
    await must(advanceToDelivery(s, "tx-foreign"));
    expect(s.campaign.pcCurrentLocus(PC)!.phase).toBe("DESTINATION_COMMITTED");
    expect(await unchanged(s, () => advance(trustedAdvance(s)))).toEqual(REFUSED);
    expect(authorityCensus(s)).toMatchObject({ destination: 1, total: 1 });
  });

  it("a dependency the kernel cannot honestly resolve stops the transaction before delivery: committed as a transaction, never as an arrival, and a held continuation is not abandoned", async () => {
    const s = await relocated();
    const restore = refuseDeliveryStage(s);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    restore();
    // the transaction is recorded as an unresolved stop; nothing was delivered, committed at the destination or retired
    const tx = s.coordinator.transaction(ADVANCE_TX)!.value;
    expect(tx.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(tx.engaged).toMatchObject([{ boundary: "STILL_ACTIVE", object_id: OBJECT_ID }]);
    expect(tx.boundaries_crossed).toEqual([]);
    expect(s.campaign.store.getFact(logisticsDeliveryKey(W, PC))).toBeUndefined();
    expect(s.campaign.store.getFact(worldEntityTransitionKey(W, PC))).toBeUndefined();
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
    });
    expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
    expect(s.coordinator.state()!.value.continuation).not.toBeNull();
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(1);
    // the same choice re-presented replays the same transaction and writes nothing; the held remainder is never abandoned, and a
    // new identity that re-uses the previous choice's trigger is not a new player choice (see the continuation block below)
    expect(await unchanged(s, () => advance(trustedAdvance(s)))).toEqual(ADVANCE_COMMITTED);
    expect(
      await unchanged(s, () =>
        advance(
          trustedAdvance(s, {
            transaction: advanceTransaction("tx-pc-second-choice", {
              trigger: advanceTransaction().trigger,
            }),
          }),
        ),
      ),
    ).toEqual(REFUSED);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the same transaction identity presented by a trusted side with different provenance is a conflict, never a silent reuse", async () => {
    const s = await relocated();
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    for (const over of [
      { cause: "another-cause" },
      { trigger: { kind: "player-advance-choice", ref: "another-ref" } },
      { publication: { basis: "other-basis", secrecy: "fixture-visibility" } },
    ])
      expect(
        await unchanged(s, () =>
          advance(trustedAdvance(s, { transaction: advanceTransaction(ADVANCE_TX, over) })),
        ),
        JSON.stringify(over),
      ).toEqual(REFUSED);
  });

  it("two campaigns with colliding PC, world, locus, object and transaction identities never cross: a context reaches only the campaign it was bound to", async () => {
    const a = await relocated();
    const b = await relocated();
    const bBefore = movementSummary(b);
    const ctxA = trustedAdvance(a);
    expect(await advance(ctxA)).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(b)).toEqual(bBefore);
    expect(await advance(ctxA)).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(b)).toEqual(bBefore);
    expect(await advance(trustedAdvance(b))).toEqual(ADVANCE_COMMITTED);
    expect(b.campaign.store.head().state_sha256).toBe(a.campaign.store.head().state_sha256);
  });

  it("a context kept across a close is stale: it is refused and never throws", async () => {
    const dir = tempDir();
    const s = await relocated(dir);
    const stale = trustedAdvance(s);
    await s.campaign.close();
    await expect(advance(stale)).resolves.toMatchObject({ ok: false });
    const reopened = await reopenMovement(dir);
    expect(reopened.campaign.pcCurrentLocus(PC)!.phase).toBe("IN_TRANSFER");
    expect(await advance(stale)).toMatchObject({ ok: false });
    expect(reopened.campaign.pcCurrentLocus(PC)!.phase).toBe("IN_TRANSFER");
    await reopened.campaign.close();
  });
});

describe("acceptance 4: retry, lost reply and crash at each durable cut converge on one arrival under one transaction identity", () => {
  const cuts: readonly [string, (g: any) => boolean, string][] = [
    ["Logistics delivery", isDelivery, "IN_TRANSFER"],
    ["World-State destination custody", isDestination, "IN_TRANSFER"],
    ["Logistics retirement", isRetirement, "DESTINATION_COMMITTED_RETIREMENT_PENDING"],
    ["transaction record", isTransaction, "DESTINATION_COMMITTED"],
  ];

  for (const [name, pred, phase] of cuts) {
    it(`a crash before the ${name} leaves one authority; the same confirmed request adopts what committed and converges`, async () => {
      const ref = await reference();
      const s = await relocated();
      const restore = crashWhen(s, pred);
      expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_UNKNOWN);
      restore();
      expect(s.campaign.pcCurrentLocus(PC)!.phase).toBe(phase);
      expect(authorityCensus(s).total).toBe(1);
      expect(s.coordinator.transaction(ADVANCE_TX)).toBeUndefined();
      expect(s.coordinator.boundaryIndex().entries).toHaveLength(1);
      expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
      expect(movementSummary(s).head.state_sha256).toBe(ref.head.state_sha256);
      expect(authorityCensus(s)).toMatchObject({ destination: 1, total: 1 });
      expect(s.coordinator.transaction(ADVANCE_TX)!.value.stages).toHaveLength(3);
      expect(s.campaign.verify()).toEqual([]);
    });

    it(`a lost reply after the ${name} commits is unknown, never safely absent, and the same request converges with no second arrival or clock advance`, async () => {
      const ref = await reference();
      const s = await relocated();
      const restore = loseReplyWhen(s, pred);
      expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_UNKNOWN);
      restore();
      expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
      expect(movementSummary(s).head.state_sha256).toBe(ref.head.state_sha256);
      expect(s.coordinator.state()!.value.canonical_time).toEqual(LOG_T_DELIVERY);
      expect(authorityCensus(s)).toMatchObject({ destination: 1, total: 1 });
      expect(s.campaign.verify()).toEqual([]);
    });

    it(`save → close → reopen after a crash before the ${name}: one authority at the cut, a fresh context converges on the same transaction`, async () => {
      const ref = await reference();
      const dir = tempDir();
      const s = await relocated(dir);
      crashWhen(s, pred);
      expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_UNKNOWN);
      await s.campaign.close();
      const reopened = await reopenMovement(dir);
      expect(reopened.campaign.verify()).toEqual([]);
      expect(reopened.campaign.pcCurrentLocus(PC)!.phase).toBe(phase);
      expect(authorityCensus(reopened).total).toBe(1);
      expect(await advance(trustedAdvance(reopened))).toEqual(ADVANCE_COMMITTED);
      expect(movementSummary(reopened).head.state_sha256).toBe(ref.head.state_sha256);
      expect(reopened.coordinator.state()!.value.last_transaction).toBe(ADVANCE_TX);
      expect(authorityCensus(reopened)).toMatchObject({ destination: 1, total: 1 });
      expect(reopened.campaign.verify()).toEqual([]);
      await reopened.campaign.close();
    });
  }

  it("save → close → reopen at the pre-advance and post-transaction cuts conserves the truthful result and one custody authority", async () => {
    const dir = tempDir();
    const s = await relocated(dir);
    await s.campaign.close();
    const pre = await reopenMovement(dir);
    expect(pre.campaign.pcCurrentLocus(PC)!.phase).toBe("IN_TRANSFER");
    expect(authorityCensus(pre)).toMatchObject({ logistics: 1, total: 1 });
    expect(await advance(trustedAdvance(pre))).toEqual(ADVANCE_COMMITTED);
    const summary = movementSummary(pre);
    await pre.campaign.close();
    const post = await reopenMovement(dir);
    expect(post.campaign.verify()).toEqual([]);
    expect(post.coordinator.state()!.value.last_transaction).toBe(ADVANCE_TX);
    expect(post.campaign.pcCurrentLocus(PC)!.phase).toBe("DESTINATION_COMMITTED");
    expect(authorityCensus(post)).toMatchObject({ destination: 1, total: 1 });
    expect(await unchanged(post, () => advance(trustedAdvance(post)))).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(post)).toEqual(summary);
    await post.campaign.close();
  });

  it("a retry after the committed transaction returns the same status and writes nothing, however often it is repeated", async () => {
    const s = await relocated();
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    const summary = movementSummary(s);
    for (let i = 0; i < 3; i++) expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(s)).toEqual(summary);
  });

  it("the uninterrupted run is reproducible: two campaigns reach byte-identical canonical state", async () => {
    expect((await reference()).head.state_sha256).toBe((await reference()).head.state_sha256);
  });

  it("an unrecognized request after the committed transaction is still refused and writes nothing", async () => {
    const s = await relocated();
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    expect(
      await unchanged(s, () =>
        advance(trustedAdvance(s), ADVANCE_REQUEST({ target: { unit: "t", value: 1 } })),
      ),
    ).toEqual(REFUSED);
  });
});

describe("the boundary index and temporal object stay the kernel's", () => {
  it("the gateway adds exactly the kernel's own records: stages' facts, the transaction, its authority, the clock, the object and index updates", async () => {
    const s = await relocated();
    const before = snapshotFacts(s);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    const after = snapshotFacts(s);
    const added = [...after.keys()].filter((k) => !before.has(k)).sort();
    expect(added).toEqual(
      [
        logisticsDeliveryKey(W, PC),
        worldEntityTransitionKey(W, PC),
        temporalTransactionKey(ADVANCE_TX),
        `temporal/transaction-authority/${ADVANCE_TX}`,
      ].sort(),
    );
    const changed = [...before.keys()]
      .filter((k) => JSON.stringify(after.get(k)!.value) !== JSON.stringify(before.get(k)!.value))
      .sort();
    expect(changed).toEqual(
      [
        logisticsTransferKey(W, PC),
        TEMPORAL_STATE_KEY,
        TEMPORAL_BOUNDARY_INDEX_KEY,
        `temporal/object/${OBJECT_ID}`,
        `logistics/commitment/${W}/${PC}`,
      ].sort(),
    );
  });
});
