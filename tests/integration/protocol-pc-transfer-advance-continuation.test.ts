/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign store to simulate lost replies, crashes and refused stages */
// Trusted, separately player-authorized HELD-CONTINUATION support for the existing active-PC stop-at-delivery temporal advance
// gateway (forty-fourth bounded slice) — the real path over the real owners. A truthful committed `DEPENDENCY_UNRESOLVED` outer
// transaction holds the original condition-only journey; a NEW player-authored transaction (new trusted context, new identity and
// provenance) invoked through the SAME no-parameter host operation consumes exactly `continues: held.from_transaction` with the
// prior `requested` carried forward verbatim, over the EXISTING `TemporalCoordinator.advance` and the real owner providers.
// Register lineage: IA-01/02/03/04/06/14/18/19/20/28 (partial, no status change); RC-05/10/14/15/16; IM-02/11/15/16.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHOICE_AUTHORITY,
  logisticsBoundaryId,
  logisticsDeliveryKey,
  logisticsObjectId,
  logisticsTransferKey,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  temporalTransactionKey,
  worldEntityTransitionKey,
} from "@immortalis/contracts";
import { TemporalCoordinator } from "@immortalis/engine";
import { LOG_T_DELIVERY } from "@immortalis/testkit";
import {
  PC,
  REQUEST_ID,
  W,
  authorityCensus,
  custodiedCampaign,
  movementProviders,
  movementSummary,
  reopenMovement,
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
  loseReplyWhen,
  refuseDeliveryStage,
  relocatedCampaign,
  trustedAdvance,
} from "../support/protocol-advance.ts";
import { tempDir } from "../support/tmp.ts";

const OBJECT_ID = logisticsObjectId(REQUEST_ID);
const BOUNDARY_ID = logisticsBoundaryId(REQUEST_ID);
const REFUSED = JSON.parse(ADVANCE_REFUSAL);
const TX2 = "tx-pc-second-choice";
const TX3 = "tx-pc-third-choice";
const CONDITION = { kind: "STOP_AFTER_BOUNDARY", object_id: OBJECT_ID, boundary_id: BOUNDARY_ID };
const PRIOR_REQUESTED = { target: null, condition: CONDITION };

const relocated = (dir?: string) => relocatedCampaign(() => custodiedCampaign(dir));
const adv = (s: PcMoveSeeded, id: string) =>
  advance(trustedAdvance(s, { transaction: advanceTransaction(id) }));

/** a PC whose first player-authorized advance committed a truthful `DEPENDENCY_UNRESOLVED` stop: the delivery owner refused */
async function held(dir?: string): Promise<{ s: PcMoveSeeded; restore: () => void }> {
  const s = await relocated(dir);
  const restore = refuseDeliveryStage(s);
  expect(await adv(s, ADVANCE_TX)).toEqual(ADVANCE_COMMITTED);
  return { s, restore };
}

/** the same two-step journey run uninterrupted: the canonical reference for every recovery */
async function reference(): Promise<string> {
  const { s, restore } = await held();
  restore();
  expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
  return movementSummary(s).head.state_sha256;
}

const unchanged = async (s: PcMoveSeeded, attempt: () => Promise<unknown>): Promise<unknown> => {
  const before = movementSummary(s);
  const r = await attempt();
  expect(movementSummary(s)).toEqual(before);
  return r;
};

const isDelivery = (g: any) => g.writes.some((w: any) => w.key === logisticsDeliveryKey(W, PC));
const isDestination = (g: any) =>
  g.writes.some((w: any) => w.key === worldEntityTransitionKey(W, PC));
const isRetirement = (g: any) =>
  g.writes.some((w: any) => w.key === logisticsTransferKey(W, PC)) && g.owner === "logistics";
const isTx2Record = (g: any) => g.writes.some((w: any) => w.key === temporalTransactionKey(TX2));

describe("acceptance 1-2: a new player-authorized choice consumes the held condition-only journey through the existing kernel", () => {
  it("the held outer transaction holds exactly the original condition-only request and nonempty unresolved dependents", async () => {
    const { s } = await held();
    const tx = s.coordinator.transaction(ADVANCE_TX)!.value;
    expect(tx.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(tx.outcome.unresolved_dependents.length).toBeGreaterThan(0);
    expect(tx.requested).toEqual(PRIOR_REQUESTED);
    expect(s.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: ADVANCE_TX,
      toward: null,
    });
  });

  it("mere previous authorization never progresses: re-presenting the first choice replays it and writes nothing", async () => {
    const { s, restore } = await held();
    restore();
    for (let i = 0; i < 3; i++)
      expect(await unchanged(s, () => adv(s, ADVANCE_TX))).toEqual(ADVANCE_COMMITTED);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "IN_TRANSFER" });
    expect(s.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: ADVANCE_TX,
    });
    expect(s.campaign.store.getFact(worldEntityTransitionKey(W, PC))).toBeUndefined();
  });

  it("consumes exactly the held transaction with the prior request verbatim and delivers, commits the destination and retires, once", async () => {
    const { s, restore } = await held();
    restore();
    const before = s.coordinator.state()!.value;
    expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
    const tx = s.coordinator.transaction(TX2)!.value;
    expect(tx.continues).toBe(ADVANCE_TX);
    expect(tx.requested).toEqual(PRIOR_REQUESTED);
    expect(tx.requested).toEqual(s.coordinator.transaction(ADVANCE_TX)!.value.requested);
    expect(tx.context).toEqual(PLAYER_CHOICE_AUTHORITY);
    expect(tx.outcome.stop_reason).not.toBe("DEPENDENCY_UNRESOLVED");
    expect(tx.stages).toHaveLength(3);
    // the earlier committed transaction is unchanged
    expect(s.coordinator.transaction(ADVANCE_TX)!.value.outcome.stop_reason).toBe(
      "DEPENDENCY_UNRESOLVED",
    );
    expect(before.continuation!.from_transaction).toBe(ADVANCE_TX);
    // exact time, one destination commit, retirement, index retirement, conserved locus
    const after = s.coordinator.state()!.value;
    expect(after.canonical_time).toEqual(LOG_T_DELIVERY);
    expect(after.continuation).toBeNull();
    expect(after.last_transaction).toBe(TX2);
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(s.campaign.store.getFact(logisticsDeliveryKey(W, PC))).toBeDefined();
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "DESTINATION_COMMITTED" });
    expect(authorityCensus(s)).toMatchObject({ destination: 1, total: 1 });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the resumed result has the same operation, shape and status as the first progress, and the same arrival as an uninterrupted manual path", async () => {
    const first = await relocated();
    const a = await adv(first, ADVANCE_TX);
    const { s, restore } = await held();
    restore();
    const b = await adv(s, TX2);
    expect(b).toEqual(a);
    expect(Object.keys((b as any).value)).toEqual(["status"]);
    expect(authorityCensus(s)).toEqual(authorityCensus(first));
    expect(s.coordinator.state()!.value.canonical_time).toEqual(
      first.coordinator.state()!.value.canonical_time,
    );
  });

  it("while the dependency remains, a second truthful unresolved stop is committed with a new held remainder: no phantom arrival; a later choice then resolves", async () => {
    const { s, restore } = await held();
    expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
    const tx2 = s.coordinator.transaction(TX2)!.value;
    expect(tx2.continues).toBe(ADVANCE_TX);
    expect(tx2.requested).toEqual(PRIOR_REQUESTED);
    expect(tx2.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(s.coordinator.state()!.value.continuation).toMatchObject({ from_transaction: TX2 });
    expect(s.campaign.store.getFact(logisticsDeliveryKey(W, PC))).toBeUndefined();
    expect(s.campaign.store.getFact(worldEntityTransitionKey(W, PC))).toBeUndefined();
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
    });
    expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(1);
    // the first held transaction was consumed, never abandoned or rewritten; no automatic retry happened
    expect(s.coordinator.transaction(ADVANCE_TX)!.value.outcome.stop_reason).toBe(
      "DEPENDENCY_UNRESOLVED",
    );
    restore();
    expect(await unchanged(s, () => adv(s, TX2))).toEqual(ADVANCE_COMMITTED);
    expect(await adv(s, TX3)).toEqual(ADVANCE_COMMITTED);
    const tx3 = s.coordinator.transaction(TX3)!.value;
    expect(tx3.continues).toBe(TX2);
    expect(tx3.requested).toEqual(PRIOR_REQUESTED);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "DESTINATION_COMMITTED" });
    expect(authorityCensus(s)).toMatchObject({ destination: 1, total: 1 });
    expect(s.coordinator.state()!.value.canonical_time).toEqual(LOG_T_DELIVERY);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("acceptance 3: every unlawful held-continuation attempt fails closed with the one refusal and writes nothing", () => {
  it("a missing or mis-authored new player authorization (inert context) is refused", async () => {
    const { s, restore } = await held();
    restore();
    for (const context of [
      { role: "role.archivist", permission: "permission.canon.write" },
      { ...PLAYER_CHOICE_AUTHORITY, permission: "permission.canon.write" },
      undefined,
    ])
      expect(
        await unchanged(s, () =>
          advance(trustedAdvance(s, { transaction: advanceTransaction(TX2, { context }) })),
        ),
        JSON.stringify(context),
      ).toEqual(REFUSED);
    expect(await unchanged(s, () => advance({} as never))).toEqual(REFUSED);
  });

  it("a new transaction that re-uses the previous choice's trigger is not a new player choice", async () => {
    const { s, restore } = await held();
    restore();
    expect(
      await unchanged(s, () =>
        advance(
          trustedAdvance(s, {
            transaction: advanceTransaction(TX2, { trigger: advanceTransaction().trigger }),
          }),
        ),
      ),
    ).toEqual(REFUSED);
    // …and with a fresh trigger the very same identity is accepted
    expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
  });

  it("malformed or over-claiming host requests are refused, however a continuation is held", async () => {
    const { s, restore } = await held();
    restore();
    for (const req of [
      ADVANCE_REQUEST({ continues: ADVANCE_TX }),
      ADVANCE_REQUEST({ requested: PRIOR_REQUESTED }),
      ADVANCE_REQUEST({ target: { unit: "fixture-time-unit", value: 1 } }),
      ADVANCE_REQUEST({ transaction_id: TX2 }),
      { operation: "continue_confirmed_pc_transfer" },
      {},
      null,
      undefined,
    ])
      expect(
        await unchanged(s, () =>
          advance(trustedAdvance(s, { transaction: advanceTransaction(TX2) }), req),
        ),
        JSON.stringify(req),
      ).toEqual(REFUSED);
    expect(s.coordinator.transaction(TX2)).toBeUndefined();
  });

  it("a wrong, inactive or unknown PC is refused", async () => {
    const { s, restore } = await held();
    restore();
    for (const pc_id of ["pc-someone-else", "", "actor-other"])
      expect(
        await unchanged(s, () =>
          advance(trustedAdvance(s, { pc_id, transaction: advanceTransaction(TX2) })),
        ),
        pc_id,
      ).toEqual(REFUSED);
  });

  it("a held TARGET-based remainder (not the condition-only PC journey) is not accepted: nothing is substituted or consumed", async () => {
    const s = await relocated();
    const restore = refuseDeliveryStage(s);
    const manual = new TemporalCoordinator(s.campaign.store, movementProviders());
    const r = await manual.advance({
      transaction_id: "tx-foreign-target",
      cause: "cause-foreign",
      trigger: { kind: "foreign", ref: "foreign-ref" },
      continues: null,
      requested: { target: { unit: "fixture-time-unit", value: 300 }, condition: null },
      context: { ...PLAYER_CHOICE_AUTHORITY },
      publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
    });
    expect(r.ok).toBe(true);
    restore();
    expect(s.coordinator.state()!.value.continuation).not.toBeNull();
    expect(await unchanged(s, () => adv(s, TX2))).toEqual(REFUSED);
    // a foreign transaction identity presented as the replay of a PC delivery is a conflict, never a replay
    expect(await unchanged(s, () => adv(s, "tx-foreign-target"))).toEqual(REFUSED);
  });

  it("a held remainder whose condition is the PC's but whose target is non-null is refused", async () => {
    const s = await relocated();
    const restore = refuseDeliveryStage(s);
    const manual = new TemporalCoordinator(s.campaign.store, movementProviders());
    const r = await manual.advance({
      transaction_id: "tx-mixed",
      cause: "cause-mixed",
      trigger: { kind: "foreign", ref: "mixed-ref" },
      continues: null,
      requested: {
        target: { unit: "fixture-time-unit", value: 300 },
        condition: CONDITION,
      },
      context: { ...PLAYER_CHOICE_AUTHORITY },
      publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
    });
    expect(r.ok).toBe(true);
    restore();
    expect(await unchanged(s, () => adv(s, TX2))).toEqual(REFUSED);
  });

  it("after the arrival the situation is retired: a further new choice is refused and the earlier committed history is untouched", async () => {
    const { s, restore } = await held();
    restore();
    expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
    expect(await unchanged(s, () => adv(s, TX3))).toEqual(REFUSED);
    expect(authorityCensus(s)).toMatchObject({ destination: 1, total: 1 });
  });

  it("the same transaction identity with a different intent or provenance is a conflict, never fresh authority", async () => {
    const { s, restore } = await held();
    restore();
    expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
    for (const over of [
      { cause: "another-cause" },
      { trigger: { kind: "player-advance-choice", ref: "another-ref" } },
      { publication: { basis: "other-basis", secrecy: "fixture-visibility" } },
    ])
      expect(
        await unchanged(s, () =>
          advance(trustedAdvance(s, { transaction: advanceTransaction(TX2, over) })),
        ),
        JSON.stringify(over),
      ).toEqual(REFUSED);
    // the first transaction's identity can never be re-used as a continuation either
    expect(
      await unchanged(s, () =>
        advance(
          trustedAdvance(s, {
            transaction: advanceTransaction(ADVANCE_TX, { cause: "another-cause" }),
          }),
        ),
      ),
    ).toEqual(REFUSED);
  });

  it("campaigns with colliding identities never cross: continuing one leaves the other held and untouched", async () => {
    const a = await held();
    const b = await held();
    a.restore();
    b.restore();
    const bBefore = movementSummary(b.s);
    expect(await adv(a.s, TX2)).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(b.s)).toEqual(bBefore);
    // a context bound to A's campaign cannot reach B
    expect(b.s.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: ADVANCE_TX,
    });
    expect(b.s.coordinator.transaction(TX2)).toBeUndefined();
  });

  it("OOC reads and relocation-style repeats never advance a held journey", async () => {
    const { s, restore } = await held();
    restore();
    const before = movementSummary(s);
    s.campaign.pcCurrentLocus(PC);
    s.campaign.pcPhysicalLocusCustody(PC);
    s.coordinator.state();
    expect(movementSummary(s)).toEqual(before);
  });
});

describe("acceptance 4: RC-16 retry, lost reply and crash converge on one continuation under one new transaction identity", () => {
  const cuts: readonly [string, (g: any) => boolean][] = [
    ["Logistics delivery", isDelivery],
    ["World-State destination custody", isDestination],
    ["Logistics retirement", isRetirement],
    ["transaction record", isTx2Record],
  ];

  for (const [name, pred] of cuts) {
    it(`a crash before the ${name} commits nothing of the continuation; the same new choice adopts what committed and converges`, async () => {
      const ref = await reference();
      const { s, restore } = await held();
      restore();
      const stop = crashWhen(s, pred);
      expect(await adv(s, TX2)).toEqual(ADVANCE_UNKNOWN);
      stop();
      expect(s.coordinator.transaction(TX2)).toBeUndefined();
      expect(s.coordinator.state()!.value.continuation).toMatchObject({
        from_transaction: ADVANCE_TX,
      });
      expect(authorityCensus(s).total).toBe(1);
      expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
      expect(movementSummary(s).head.state_sha256).toBe(ref);
      expect(s.coordinator.transaction(TX2)!.value.continues).toBe(ADVANCE_TX);
      expect(authorityCensus(s)).toMatchObject({ destination: 1, total: 1 });
      expect(s.campaign.verify()).toEqual([]);
    });

    it(`a lost reply after the ${name} is unknown, never safely absent, and the same request converges with no second advance`, async () => {
      const ref = await reference();
      const { s, restore } = await held();
      restore();
      const stop = loseReplyWhen(s, pred);
      expect(await adv(s, TX2)).toEqual(ADVANCE_UNKNOWN);
      stop();
      expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
      expect(movementSummary(s).head.state_sha256).toBe(ref);
      expect(s.coordinator.state()!.value.canonical_time).toEqual(LOG_T_DELIVERY);
      expect(authorityCensus(s)).toMatchObject({ destination: 1, total: 1 });
      expect(s.campaign.verify()).toEqual([]);
    });

    it(`save → close → reopen after a crash before the ${name}: a fresh context converges on the same continuation`, async () => {
      const ref = await reference();
      const dir = tempDir();
      const { s, restore } = await held(dir);
      restore();
      crashWhen(s, pred);
      expect(await adv(s, TX2)).toEqual(ADVANCE_UNKNOWN);
      await s.campaign.close();
      const reopened = await reopenMovement(dir);
      expect(reopened.campaign.verify()).toEqual([]);
      expect(reopened.coordinator.state()!.value.continuation).toMatchObject({
        from_transaction: ADVANCE_TX,
      });
      expect(authorityCensus(reopened).total).toBe(1);
      expect(await adv(reopened, TX2)).toEqual(ADVANCE_COMMITTED);
      expect(movementSummary(reopened).head.state_sha256).toBe(ref);
      expect(reopened.coordinator.transaction(TX2)!.value.continues).toBe(ADVANCE_TX);
      await reopened.campaign.close();
    });
  }

  it("save → close → reopen while the journey is held, then continued, then replayed after consumption", async () => {
    const ref = await reference();
    const dir = tempDir();
    const { s } = await held(dir);
    await s.campaign.close();
    const held2 = await reopenMovement(dir);
    expect(held2.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: ADVANCE_TX,
    });
    // the original choice replays against the reopened store without abandoning the held request
    expect(await adv(held2, ADVANCE_TX)).toEqual(ADVANCE_COMMITTED);
    expect(held2.coordinator.state()!.value.continuation).not.toBeNull();
    expect(await adv(held2, TX2)).toEqual(ADVANCE_COMMITTED);
    const summary = movementSummary(held2);
    expect(summary.head.state_sha256).toBe(ref);
    await held2.campaign.close();
    const post = await reopenMovement(dir);
    expect(post.campaign.verify()).toEqual([]);
    // replay after the continuation was consumed: both choices replay, nothing is written, time never advances twice
    expect(await unchanged(post, () => adv(post, TX2))).toEqual(ADVANCE_COMMITTED);
    expect(await unchanged(post, () => adv(post, ADVANCE_TX))).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(post)).toEqual(summary);
    await post.campaign.close();
  });

  it("a retry of the continuation however often repeated returns the same status and writes nothing", async () => {
    const { s, restore } = await held();
    restore();
    expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
    const summary = movementSummary(s);
    for (let i = 0; i < 3; i++) expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(s)).toEqual(summary);
  });

  it("the uninterrupted two-step journey is reproducible: two campaigns reach byte-identical canonical state", async () => {
    expect(await reference()).toBe(await reference());
  });

  it("a second unresolved stop is also replayable by identity across reopen, without leaking that a prior stop occurred", async () => {
    const dir = tempDir();
    const { s } = await held(dir);
    expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
    const summary = movementSummary(s);
    await s.campaign.close();
    const post = await reopenMovement(dir);
    expect(await unchanged(post, () => adv(post, TX2))).toEqual(ADVANCE_COMMITTED);
    expect(movementSummary(post)).toEqual(summary);
    expect(post.coordinator.state()!.value.continuation).toMatchObject({ from_transaction: TX2 });
    await post.campaign.close();
  });
});

describe("the kernel stays the final authority", () => {
  it("a continuation adds exactly the kernel's own records: the stages' facts, the transaction, its authority, the clock, the object and index updates", async () => {
    const { s, restore } = await held();
    restore();
    const before = snapshotFacts(s);
    expect(await adv(s, TX2)).toEqual(ADVANCE_COMMITTED);
    const after = snapshotFacts(s);
    const added = [...after.keys()].filter((k) => !before.has(k)).sort();
    expect(added).toEqual(
      [
        logisticsDeliveryKey(W, PC),
        worldEntityTransitionKey(W, PC),
        temporalTransactionKey(TX2),
        `temporal/transaction-authority/${TX2}`,
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
