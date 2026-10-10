/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign store to simulate lost replies, crashes and refused stages */
// Trusted, separately player-authorized NULL-PC OOC HELD-CONTINUATION gateway — the real path over the real owners. A truthful
// committed `DEPENDENCY_UNRESOLVED` transaction of the initial NULL-PC OOC target-only gateway holds an unresolved remainder; a NEW
// player-authored OOC choice (new trusted context, new identity and provenance) invoked through the separate no-parameter host
// operation consumes exactly `continues: held.from_transaction` with the prior `requested` carried forward verbatim, over the
// EXISTING `TemporalCoordinator.advance` and the real owner providers. Nothing else.
// Register lineage: IA-01/02/03/04/06/14/18/19/20/28 (partial, no status change); RC-05/10/14/15/16; IM-02/11/15/16.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHOICE_AUTHORITY,
  PLAYER_CHARACTER_BINDING_KEY,
  logisticsBoundaryId,
  logisticsDeliveryKey,
  logisticsObjectId,
  logisticsTransferKey,
  temporalTransactionKey,
  worldEntityTransitionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  LOG_T_DELIVERY,
  MOVE_1,
  PROD_T1,
  REQ_1,
  at,
  fixtureContract,
  fixtureInsertionFact,
  publication,
} from "@immortalis/testkit";
import {
  acceptCommitDispatchRegister,
  entityIdOf,
  logCoordinator,
  logSummary,
  reopenLogistics,
  type LogSeeded,
} from "../support/logistics.ts";
import {
  HELD_COMMITTED,
  HELD_REFUSAL,
  HELD_REQUEST,
  HELD_TX2,
  HELD_TX3,
  HELD_UNKNOWN,
  NULL_PC_TX,
  advanceNull,
  crashWhenNull,
  loseReplyWhenNull,
  nullPcTransaction,
  refuseNullPcDeliveryStage,
  resumeHeld,
  seededNullPcCampaign,
  trustedHeld,
  trustedNullPcAdvance,
} from "../support/null-pc-held-advance.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const REFUSED = JSON.parse(HELD_REFUSAL);
const entity = entityIdOf(REQ_1);
const PRIOR_REQUESTED = { target: PROD_T1, condition: null };

const dueCampaign = async (dir = tempDir()): Promise<LogSeeded & { dir: string }> => {
  const s = await seededNullPcCampaign(dir);
  await acceptCommitDispatchRegister(s);
  return Object.assign(s, { dir });
};
/** JSON with object keys sorted: a reopened store may return the same canonical values with a different key order. */
const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v !== null && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, x]) => [k, stable(x)]),
        )
      : v;
const summary = (s: LogSeeded) => {
  const { head, ...rest } = logSummary(s.campaign, s.coordinator);
  void head;
  return JSON.stringify(stable(rest));
};
const headRevision = (s: LogSeeded) => s.campaign.store.head().revision;
/** the owner's committed value; its provenance names the transaction that wrote it, which differs between the two journeys */
const fact = (s: LogSeeded, key: string) =>
  JSON.stringify(stable(s.campaign.store.getFact(key)?.value));
const ownerFacts = (s: LogSeeded) => [
  fact(s, logisticsDeliveryKey(FIXTURE_WORLD_ID, entity)),
  fact(s, worldEntityTransitionKey(FIXTURE_WORLD_ID, entity)),
  fact(s, logisticsTransferKey(FIXTURE_WORLD_ID, entity)),
  JSON.stringify(s.coordinator.state()!.value.canonical_time),
];

/** a NULL-PC campaign whose first OOC choice committed a truthful `DEPENDENCY_UNRESOLVED` stop: the delivery owner refused */
async function held(
  dir?: string,
): Promise<{ s: LogSeeded & { dir: string }; restore: () => void }> {
  const s = await dueCampaign(dir);
  const restore = refuseNullPcDeliveryStage(s, REQ_1);
  expect(await advanceNull(trustedNullPcAdvance(s))).toEqual({
    ok: true,
    value: { status: "NULL_PC_ADVANCE_COMMITTED" },
  });
  return { s, restore };
}
const resume = (
  s: LogSeeded,
  id = HELD_TX2,
  from = NULL_PC_TX,
  over: Record<string, unknown> = {},
) =>
  resumeHeld(
    trustedHeld(s, {
      held: { from_transaction: from, target: PROD_T1 },
      transaction: nullPcTransaction(id, over),
    }),
  );
const unchanged = async (s: LogSeeded, attempt: () => Promise<unknown>): Promise<unknown> => {
  const before = summary(s);
  const rev = headRevision(s);
  const r = await attempt();
  expect(summary(s)).toBe(before);
  expect(headRevision(s)).toBe(rev);
  return r;
};

/** the same two-step journey run uninterrupted: the canonical reference for every recovery */
async function reference(): Promise<string> {
  const { s, restore } = await held();
  restore();
  expect(await resume(s)).toEqual(HELD_COMMITTED);
  return summary(s);
}

const isDelivery = (g: CommitGroup) =>
  g.writes.some((w) => w.key === logisticsDeliveryKey(FIXTURE_WORLD_ID, entity));
const isDestination = (g: CommitGroup) =>
  g.writes.some((w) => w.key === worldEntityTransitionKey(FIXTURE_WORLD_ID, entity));
const isRetirement = (g: CommitGroup) =>
  g.writes.some((w) => w.key === logisticsTransferKey(FIXTURE_WORLD_ID, entity)) &&
  g.owner === "logistics";
const isOpening = (g: CommitGroup) =>
  g.writes.some((w) => w.key.startsWith("temporal/transaction-authority/"));
const isTx2Record = (g: CommitGroup) =>
  g.writes.some((w) => w.key === temporalTransactionKey(HELD_TX2));

describe("acceptance 1: a new separately authorized OOC choice resumes the held NULL-PC target through the existing kernel", () => {
  it("the held transaction holds exactly the original target-only request and nonempty unresolved dependents", async () => {
    const { s } = await held();
    const tx = s.coordinator.transaction(NULL_PC_TX)!.value;
    expect(tx.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(tx.outcome.unresolved_dependents.length).toBeGreaterThan(0);
    expect(tx.continues).toBeNull();
    expect(tx.requested).toEqual(PRIOR_REQUESTED);
    expect(tx.context).toEqual(PLAYER_CHOICE_AUTHORITY);
    expect(s.campaign.binding()).toBeUndefined();
    expect(s.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: NULL_PC_TX,
    });
  });

  it("mere previous authorization never progresses: re-presenting the original choice replays it and writes nothing", async () => {
    const { s, restore } = await held();
    restore();
    for (let i = 0; i < 3; i++)
      expect(await unchanged(s, () => advanceNull(trustedNullPcAdvance(s)))).toEqual({
        ok: true,
        value: { status: "NULL_PC_ADVANCE_COMMITTED" },
      });
    expect(s.campaign.store.getFact(worldEntityTransitionKey(FIXTURE_WORLD_ID, entity))).toBe(
      undefined,
    );
    expect(s.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: NULL_PC_TX,
    });
  });

  it("consumes exactly the held transaction with the prior request verbatim, delivers, commits the destination and retires, once", async () => {
    const { s, restore } = await held();
    restore();
    expect(await resume(s)).toEqual(HELD_COMMITTED);
    const tx = s.coordinator.transaction(HELD_TX2)!.value;
    expect(tx.continues).toBe(NULL_PC_TX);
    expect(tx.requested).toEqual(PRIOR_REQUESTED);
    expect(tx.requested).toEqual(s.coordinator.transaction(NULL_PC_TX)!.value.requested);
    expect(tx.context).toEqual(PLAYER_CHOICE_AUTHORITY);
    expect(tx.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(tx.stages).toHaveLength(3);
    // the earlier committed transaction is unchanged
    expect(s.coordinator.transaction(NULL_PC_TX)!.value.outcome.stop_reason).toBe(
      "DEPENDENCY_UNRESOLVED",
    );
    const after = s.coordinator.state()!.value;
    expect(after.continuation).toBeNull();
    expect(after.last_transaction).toBe(HELD_TX2);
    expect(after.canonical_time).toEqual(PROD_T1);
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(s.campaign.store.getFact(logisticsDeliveryKey(FIXTURE_WORLD_ID, entity))).toBeDefined();
    expect(
      s.campaign.store.getFact(worldEntityTransitionKey(FIXTURE_WORLD_ID, entity)),
    ).toBeDefined();
    expect(s.logistics.transfer(FIXTURE_WORLD_ID, entity)?.value.state.status).not.toBe(
      "IN_TRANSFER",
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the owner results are fact-for-fact those of the independently lawful uninterrupted path, and the whole state is the manual kernel continuation of the same literal request", async () => {
    // uninterrupted: no fault, the initial OOC choice resolves everything
    const clean = await dueCampaign();
    expect(await advanceNull(trustedNullPcAdvance(clean))).toEqual({
      ok: true,
      value: { status: "NULL_PC_ADVANCE_COMMITTED" },
    });
    const { s, restore } = await held();
    restore();
    expect(await resume(s)).toEqual(HELD_COMMITTED);
    const a = ownerFacts(clean);
    const b = ownerFacts(s);
    expect(b[0]).toBe(a[0]);
    expect(b[1]).toBe(a[1]);
    expect(b[3]).toBe(a[3]);
    // the manual kernel continuation of the same literal request (same hold, same fix)
    const twin = await held();
    twin.restore();
    const t = nullPcTransaction(HELD_TX2) as any;
    const manual = await logCoordinator(twin.s.campaign.store).advance({
      transaction_id: t.transaction_id,
      cause: t.cause,
      trigger: t.trigger,
      continues: NULL_PC_TX,
      requested: PRIOR_REQUESTED,
      context: t.context,
      publication: t.publication,
    });
    expect(manual.ok).toBe(true);
    expect(summary(s)).toBe(summary(twin.s));
  });

  it("the resumed result has the same operation, shape and status as the first progress", async () => {
    const first = await advanceNull(trustedNullPcAdvance(await dueCampaign()));
    const { s, restore } = await held();
    restore();
    const b = await resume(s);
    expect(Object.keys((b as any).value)).toEqual(["status"]);
    expect(Object.keys((first as any).value)).toEqual(["status"]);
  });

  it("a held remainder persisted by save → close → reopen is resumed by a new choice just the same", async () => {
    const ref = await reference();
    const { s } = await held();
    await s.campaign.store.close();
    const reopened = await reopenLogistics(s.dir);
    expect(reopened.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: NULL_PC_TX,
    });
    expect(await resume(reopened)).toEqual(HELD_COMMITTED);
    expect(summary(reopened)).toBe(ref);
  });
});

describe("acceptance 2: while the dependency remains, another truthful held remainder is committed; a third choice resumes only the latest", () => {
  it("a second unresolved stop commits a new held transaction with no phantom arrival; a later choice then resolves", async () => {
    const { s, restore } = await held();
    expect(await resume(s)).toEqual(HELD_COMMITTED);
    const tx2 = s.coordinator.transaction(HELD_TX2)!.value;
    expect(tx2.continues).toBe(NULL_PC_TX);
    expect(tx2.requested).toEqual(PRIOR_REQUESTED);
    expect(tx2.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(s.coordinator.state()!.value.continuation).toMatchObject({ from_transaction: HELD_TX2 });
    // nothing reached: no delivery, no destination, no retirement, the boundary is still pending
    expect(
      s.campaign.store.getFact(logisticsDeliveryKey(FIXTURE_WORLD_ID, entity)),
    ).toBeUndefined();
    expect(
      s.campaign.store.getFact(worldEntityTransitionKey(FIXTURE_WORLD_ID, entity)),
    ).toBeUndefined();
    expect(s.logistics.transfer(FIXTURE_WORLD_ID, entity)?.value.state.status).toBe("IN_TRANSFER");
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(1);
    // the first held transaction was consumed, never abandoned or rewritten; no automatic retry happened
    expect(s.coordinator.transaction(NULL_PC_TX)!.value.outcome.stop_reason).toBe(
      "DEPENDENCY_UNRESOLVED",
    );
    restore();
    // the first and the second choices only replay themselves
    expect(await unchanged(s, () => resume(s, HELD_TX2))).toEqual(HELD_COMMITTED);
    // a choice that names the already-consumed hold is stale: refused, nothing written
    expect(await unchanged(s, () => resume(s, HELD_TX3, NULL_PC_TX))).toEqual(REFUSED);
    // the third choice names the latest hold and resolves it
    expect(await resume(s, HELD_TX3, HELD_TX2)).toEqual(HELD_COMMITTED);
    const tx3 = s.coordinator.transaction(HELD_TX3)!.value;
    expect(tx3.continues).toBe(HELD_TX2);
    expect(tx3.requested).toEqual(PRIOR_REQUESTED);
    expect(tx3.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(s.coordinator.state()!.value.canonical_time).toEqual(PROD_T1);
    expect(s.coordinator.state()!.value.continuation).toBeNull();
    expect(s.logistics.transfer(FIXTURE_WORLD_ID, entity)?.value.state.status).not.toBe(
      "IN_TRANSFER",
    );
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("acceptance 3: every unlawful held-continuation attempt fails closed with the one refusal and writes nothing", () => {
  it("a missing or mis-authored new player authorization (inert context) is refused", async () => {
    const { s, restore } = await held();
    restore();
    const heldOk = { from_transaction: NULL_PC_TX, target: PROD_T1 };
    for (const over of [
      { transaction: nullPcTransaction(HELD_TX2, { context: undefined }) },
      {
        transaction: nullPcTransaction(HELD_TX2, {
          context: { role: "role.archivist", permission: "permission.canon.write" },
        }),
      },
      {
        transaction: nullPcTransaction(HELD_TX2, {
          context: { role: "role.player_character", permission: "permission.player_choice.commit" },
        }),
      },
      {
        transaction: nullPcTransaction(HELD_TX2, {
          context: { role: "role.player", permission: "permission.canon.write" },
        }),
      },
      { transaction: nullPcTransaction(HELD_TX2, { continues: NULL_PC_TX }) },
      { transaction: nullPcTransaction(HELD_TX2, { requested: PRIOR_REQUESTED }) },
      { transaction: undefined },
      // the new choice is not the held one: the earlier choice never stands for this one
      { transaction: nullPcTransaction(NULL_PC_TX) },
      { campaign: undefined },
      { held: undefined },
      { held: { from_transaction: NULL_PC_TX } },
      { held: { target: PROD_T1 } },
      { held: { ...heldOk, target: { unit: "t", value: -1 } } },
      { held: { ...heldOk, target: "2026-10-10" } },
      { held: { ...heldOk, extra: true } },
    ])
      expect(
        await unchanged(s, () => resumeHeld(trustedHeld(s, over as never))),
        JSON.stringify(over),
      ).toEqual(REFUSED);
    expect(s.coordinator.transaction(HELD_TX2)).toBeUndefined();
  });

  it("host-supplied authority, time or continuation never selects anything: over-claiming requests are refused", async () => {
    const { s, restore } = await held();
    restore();
    const ctx = trustedHeld(s);
    for (const claim of [
      { target: at(PROD_T1.value + 1) },
      { continues: NULL_PC_TX },
      { transaction_id: "tx-host" },
      { from_transaction: NULL_PC_TX },
      { role: "role.player" },
      { confirmed: true },
    ])
      expect(
        await unchanged(s, () => resumeHeld(ctx, HELD_REQUEST(claim))),
        JSON.stringify(claim),
      ).toEqual(REFUSED);
    expect(
      await unchanged(s, () => resumeHeld(ctx, { operation: "advance_null_pc_ooc_to_target" })),
    ).toEqual(REFUSED);
    expect(await unchanged(s, () => resumeHeld(ctx, undefined))).toEqual(REFUSED);
  });

  it("an active-PC binding makes the operation inert, including a PC activated after the context was bound, even for the replay of a committed choice", async () => {
    const { s, restore } = await held();
    restore();
    const ctx = trustedHeld(s);
    expect(await resumeHeld(ctx)).toEqual(HELD_COMMITTED);
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }),
    );
    await must(
      s.campaign.bindPlayerCharacter({
        ...publication(4),
        pc_id: FIXTURE_PC_ID,
        world_id: FIXTURE_WORLD_ID,
        locus_id: FIXTURE_LOCUS_ID,
        insertion: fixtureInsertionFact(),
      }),
    );
    expect(s.campaign.binding()).toBeDefined();
    expect(await unchanged(s, () => resumeHeld(ctx))).toEqual(REFUSED);
    expect(await unchanged(s, () => resume(s, "tx-after-pc"))).toEqual(REFUSED);
  });

  it("no held remainder: a reached initial transaction cannot be 'resumed'", async () => {
    const s = await dueCampaign();
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual({
      ok: true,
      value: { status: "NULL_PC_ADVANCE_COMMITTED" },
    });
    expect(s.coordinator.state()!.value.continuation).toBeNull();
    expect(await unchanged(s, () => resume(s))).toEqual(REFUSED);
    // and a campaign that has no temporal state at all
    const bare = await seededNullPcCampaign(tempDir());
    expect(await unchanged(bare, () => resume(bare))).toEqual(REFUSED);
  });

  it("a stale, foreign or unknown held identity is refused: only the exact current hold may be named", async () => {
    const { s, restore } = await held();
    restore();
    for (const from of ["tx-unknown", HELD_TX2, "tx-held-foreign"])
      expect(await unchanged(s, () => resume(s, HELD_TX3, from)), from).toEqual(REFUSED);
    // a hold of a different path (a transaction another process committed) is not this lineage even if it is the one held
    const other = await dueCampaign();
    const restoreOther = refuseNullPcDeliveryStage(other, REQ_1);
    const t = nullPcTransaction("tx-held-manual") as any;
    const manual = await logCoordinator(other.campaign.store).advance({
      transaction_id: t.transaction_id,
      cause: t.cause,
      trigger: t.trigger,
      continues: null,
      requested: { target: PROD_T1, condition: null },
      context: t.context,
      publication: t.publication,
    });
    restoreOther();
    expect(manual.ok).toBe(true);
    // the player authorized NULL_PC_TX, but the campaign holds another transaction's remainder
    expect(await unchanged(other, () => resume(other))).toEqual(REFUSED);
  });

  it("a changed target is refused: only the originally authorized target may continue", async () => {
    const { s, restore } = await held();
    restore();
    for (const target of [
      at(PROD_T1.value + 1),
      at(PROD_T1.value - 1),
      { unit: "other-unit", value: PROD_T1.value },
      LOG_T_DELIVERY.value === PROD_T1.value ? at(1) : LOG_T_DELIVERY,
    ])
      expect(
        await unchanged(s, () =>
          resumeHeld(trustedHeld(s, { held: { from_transaction: NULL_PC_TX, target } })),
        ),
        JSON.stringify(target),
      ).toEqual(REFUSED);
  });

  it("a different request type is refused: a held condition-only (stop-at-boundary) transaction is not this lineage", async () => {
    const s = await dueCampaign();
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    const t = nullPcTransaction("tx-held-condition") as any;
    const manual = await logCoordinator(s.campaign.store).advance({
      transaction_id: t.transaction_id,
      cause: t.cause,
      trigger: t.trigger,
      continues: null,
      requested: {
        target: null,
        condition: {
          kind: "STOP_AFTER_BOUNDARY",
          object_id: logisticsObjectId(MOVE_1),
          boundary_id: logisticsBoundaryId(MOVE_1),
        },
      },
      context: t.context,
      publication: t.publication,
    });
    restore();
    expect(manual.ok).toBe(true);
    const state = s.coordinator.state()!.value;
    expect(state.continuation?.from_transaction).toBe("tx-held-condition");
    expect(state.continuation?.toward).toBeNull();
    expect(
      await unchanged(s, () =>
        resumeHeld(
          trustedHeld(s, { held: { from_transaction: "tx-held-condition", target: PROD_T1 } }),
        ),
      ),
    ).toEqual(REFUSED);
  });

  it("the initial gateway is not relaxed: it still refuses a new target while a remainder is held and refuses a continuing record's identity", async () => {
    const { s, restore } = await held();
    restore();
    const refusal = JSON.parse(
      JSON.stringify({
        ok: false,
        error: { code: "NULL_PC_ADVANCE_UNAVAILABLE", message: "no advance is available" },
      }),
    );
    expect(
      await unchanged(s, () =>
        advanceNull(trustedNullPcAdvance(s, { transaction: nullPcTransaction("tx-new-initial") })),
      ),
    ).toEqual(refusal);
    expect(await resume(s)).toEqual(HELD_COMMITTED);
    // the continuing record's identity is not an initial-branch replay
    expect(
      await unchanged(s, () =>
        advanceNull(trustedNullPcAdvance(s, { transaction: nullPcTransaction(HELD_TX2) })),
      ),
    ).toEqual(refusal);
  });

  it("the same identity never replays silently across branches: an initial record's identity cannot be presented as a continuation, nor a continuation's as another lineage", async () => {
    const { s, restore } = await held();
    restore();
    expect(await resume(s)).toEqual(HELD_COMMITTED);
    // the initial record's identity as the 'new' choice of a held lineage (it continued nothing)
    expect(
      await unchanged(s, () =>
        resumeHeld(
          trustedHeld(s, {
            held: { from_transaction: HELD_TX2, target: PROD_T1 },
            transaction: nullPcTransaction(NULL_PC_TX),
          }),
        ),
      ),
    ).toEqual(REFUSED);
    // the committed continuation presented under a different held lineage
    expect(await unchanged(s, () => resume(s, HELD_TX2, "tx-other-lineage"))).toEqual(REFUSED);
  });

  it("a replay with a changed intent or provenance is the kernel's conflict: refused, and the committed record is never amended", async () => {
    const { s, restore } = await held();
    restore();
    expect(await resume(s)).toEqual(HELD_COMMITTED);
    const committed = JSON.stringify(s.coordinator.transaction(HELD_TX2)!.value);
    for (const over of [
      { cause: "another-cause" },
      { trigger: { kind: "x", ref: "y" } },
      { publication: { basis: "b", secrecy: "s" } },
    ])
      expect(
        await unchanged(s, () => resume(s, HELD_TX2, NULL_PC_TX, over)),
        JSON.stringify(over),
      ).toEqual(REFUSED);
    expect(JSON.stringify(s.coordinator.transaction(HELD_TX2)!.value)).toBe(committed);
  });

  it("a held remainder the owner cannot yet satisfy is never faked: the neutral status, a truthful short stop, nothing reached", async () => {
    const { s, restore } = await held();
    const before = s.coordinator.state()!.value.canonical_time;
    expect(await resume(s)).toEqual(HELD_COMMITTED);
    restore();
    expect(s.coordinator.state()!.value.canonical_time.value).toBeLessThan(PROD_T1.value);
    expect(before.value).toBeLessThan(PROD_T1.value);
    expect(s.coordinator.transaction(HELD_TX2)!.value.outcome.stop_reason).not.toBe(
      "TARGET_REACHED",
    );
  });
});

describe("recovery (RC-16): the same identity replays; an unknown outcome is not mislabeled; interrupted runs converge", () => {
  it("the same committed choice replays the byte-identical receipt and writes nothing, in process and after save → close → reopen", async () => {
    const { s, restore } = await held();
    restore();
    const first = JSON.stringify(await resume(s));
    const afterFirst = summary(s);
    const rev = headRevision(s);
    expect(JSON.stringify(await resume(s))).toBe(first);
    expect(summary(s)).toBe(afterFirst);
    expect(headRevision(s)).toBe(rev);
    await s.campaign.store.close();
    const reopened = await reopenLogistics(s.dir);
    expect(summary(reopened)).toBe(afterFirst);
    expect(JSON.stringify(await resume(reopened))).toBe(first);
    expect(summary(reopened)).toBe(afterFirst);
    expect(headRevision(reopened)).toBe(rev);
  });

  it("a lost reply after the sealed continuing transaction is the opaque UNKNOWN, never 'nothing advanced'; presenting the same request reconciles to the committed receipt", async () => {
    const { s, restore } = await held();
    restore();
    const unlose = loseReplyWhenNull(s, isTx2Record);
    expect(await resume(s)).toEqual(HELD_UNKNOWN);
    unlose();
    const afterLost = summary(s);
    expect(await resume(s)).toEqual(HELD_COMMITTED);
    expect(summary(s)).toBe(afterLost);
  });

  it("a crash before each durable cut converges, on the same request, to the byte-identical canonical state of an uninterrupted run", async () => {
    const final = await reference();
    const cuts: Array<[string, (g: CommitGroup) => boolean]> = [
      ["the opening authority", isOpening],
      ["the Logistics delivery", isDelivery],
      ["the destination custody", isDestination],
      ["the Logistics retirement", isRetirement],
      ["the sealed continuing transaction", isTx2Record],
    ];
    for (const [name, pred] of cuts) {
      const { s, restore } = await held();
      restore();
      const uncrash = crashWhenNull(s, pred);
      const first = await resume(s);
      uncrash();
      expect(first, name).toEqual(HELD_UNKNOWN);
      expect(await resume(s), name).toEqual(HELD_COMMITTED);
      expect(summary(s), name).toBe(final);
    }
  });

  it("a partial run recovered after save → close → reopen converges to the same state", async () => {
    const final = await reference();
    const { s, restore } = await held();
    restore();
    const uncrash = crashWhenNull(s, isTx2Record);
    expect(await resume(s)).toEqual(HELD_UNKNOWN);
    uncrash();
    await s.campaign.store.close();
    const reopened = await reopenLogistics(s.dir);
    expect(await resume(reopened)).toEqual(HELD_COMMITTED);
    expect(summary(reopened)).toBe(final);
  });

  it("an interrupted resume is not a second progress: after the crash a DIFFERENT new choice does not consume the held work twice", async () => {
    const { s, restore } = await held();
    restore();
    const uncrash = crashWhenNull(s, isTx2Record);
    expect(await resume(s)).toEqual(HELD_UNKNOWN);
    uncrash();
    // the sealed record is not committed, so the hold is intact; the original identity reconciles it exactly once
    expect(await resume(s)).toEqual(HELD_COMMITTED);
    // a second, distinct choice now finds nothing held
    expect(await unchanged(s, () => resume(s, HELD_TX3, HELD_TX2))).toEqual(REFUSED);
    expect(await unchanged(s, () => resume(s, HELD_TX3, NULL_PC_TX))).toEqual(REFUSED);
  });
});

describe("scope and isolation: observers, presentation and PCs are untouched, and campaigns cannot cross", () => {
  it("only the kernel's own temporal, stage and owner facts change: no PC, binding, epistemic, projection, presentation or capability fact appears", async () => {
    const { s, restore } = await held();
    restore();
    const keysBefore = new Set(s.campaign.store.listFacts().map((f) => f.key));
    expect(await resume(s)).toEqual(HELD_COMMITTED);
    const added = s.campaign.store
      .listFacts()
      .map((f) => f.key)
      .filter((k) => !keysBefore.has(k));
    expect(added.length).toBeGreaterThan(0);
    for (const k of added)
      expect(k, k).not.toMatch(
        /^pc\/|role-registry|epistemic|projection|presentation|capability|knowledge|binding/,
      );
    expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeUndefined();
  });

  it("two campaigns with identical identifiers cannot cross: a context drives only the campaign it was bound to", async () => {
    const a = await held();
    const b = await held();
    a.restore();
    b.restore();
    const bBefore = summary(b.s);
    expect(await resume(a.s)).toEqual(HELD_COMMITTED);
    expect(summary(b.s)).toBe(bBefore);
    expect(b.s.coordinator.transaction(HELD_TX2)).toBeUndefined();
    expect(await resume(b.s)).toEqual(HELD_COMMITTED);
    expect(summary(b.s)).toBe(summary(a.s));
    const ctx = trustedHeld(a.s);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.keys(ctx)).toEqual([]);
    expect(() => ((ctx as any).campaign = b.s.campaign)).toThrow();
  });
});
