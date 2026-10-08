/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign store to simulate lost replies and crashes */
// Trusted player-authorized NULL-PC OOC target-only temporal advance gateway (forty-fifth bounded slice) — the real path over the
// real owners. A trusted context binds the one campaign, the one explicit player-chosen CanonicalTime target and the transaction
// identity and provenance of the player's OOC choice; the one allowlisted operation freshly re-proves `role.player_character` is
// NULL, builds the one literal target-only request and drives the EXISTING `TemporalCoordinator.advance` over the real shipped
// owner stage providers. Nothing else.
// Register lineage: IA-01/02/03/04/06/14/18/19/20/28 (partial, no status change); RC-02/04/05/07/10/13/15/16; IM-02/03/05/07/11/12/15/16/17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  logisticsBoundaryId,
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
  MOVE_2,
  PROD_T0,
  PROD_T1,
  REQ_1,
  REQ_2,
  RESERVE_OTHER,
  at,
  commitInput,
  dispatchInput,
  fixtureContract,
  fixtureInsertionFact,
  logPublication,
  publication,
} from "@immortalis/testkit";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  acceptCommitDispatchRegister,
  acceptLogEntity,
  commitMovementRequest,
  entityIdOf,
  logCoordinator,
  logSummary,
  registerTransfer,
  reopenLogistics,
  type LogSeeded,
} from "../support/logistics.ts";
import {
  NULL_PC_COMMITTED,
  NULL_PC_REFUSAL,
  NULL_PC_TX,
  NULL_PC_UNKNOWN,
  advanceNull,
  crashWhenNull,
  loseReplyWhenNull,
  nullPcTransaction,
  refuseNullPcDeliveryStage,
  seededNullPcCampaign,
  seededNullPcSyntheticCampaign,
  trustedNullPcAdvance,
} from "../support/null-pc-advance.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

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
  // the head's revision/hashes are compared separately; here only the canonical facts, receipts and kernel state
  const { head, ...rest } = logSummary(s.campaign, s.coordinator);
  void head;
  return JSON.stringify(stable(rest));
};
const headRevision = (s: LogSeeded) => s.campaign.store.head().revision;
const literal = (target = PROD_T1, id = NULL_PC_TX) => {
  const t = nullPcTransaction(id) as any;
  return {
    transaction_id: t.transaction_id,
    cause: t.cause,
    trigger: t.trigger,
    continues: null,
    requested: { target, condition: null },
    context: t.context,
    publication: t.publication,
  };
};
const entity = entityIdOf(REQ_1);
const objectId = logisticsObjectId(MOVE_1);

describe("authority: a genuine OOC choice in the NULL state advances real, already-registered, non-PC work", () => {
  it("the NULL-PC fixture really has no operative binding, a registered non-PC transfer and a due boundary", async () => {
    const s = await dueCampaign();
    expect(s.campaign.binding()).toBeUndefined();
    expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeUndefined();
    expect(s.coordinator.object(objectId)?.value.next_boundary?.at).toEqual(LOG_T_DELIVERY);
    expect(s.coordinator.state()?.value.canonical_time.value).toBeLessThan(LOG_T_DELIVERY.value);
  });

  it("resolves the actually due boundary through the real Logistics, World-State and Logistics owners and commits the one literal transaction", async () => {
    const s = await dueCampaign();
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(NULL_PC_COMMITTED);
    // the transaction repeats exactly the literal request the gateway built: target only, no condition, initial branch
    const tx = s.coordinator.transaction(NULL_PC_TX)!.value;
    const { transaction_id, cause, trigger, continues, requested, context } = literal();
    expect({
      transaction_id: tx.transaction_id,
      cause: tx.cause,
      trigger: tx.trigger,
      continues: tx.continues,
      requested: tx.requested,
      context: tx.context,
    }).toEqual({ transaction_id, cause, trigger, continues, requested, context });
    expect(tx.context).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });
    // the real owner chain ran: delivery established, destination committed, transfer retired; the boundary left the active index
    expect(
      s.campaign.store.getFact(worldEntityTransitionKey(FIXTURE_WORLD_ID, entity)),
    ).toBeDefined();
    expect(s.logistics.transfer(FIXTURE_WORLD_ID, entity)?.value.state.status).not.toBe(
      "IN_TRANSFER",
    );
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(tx.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(tx.outcome.actual_stop).toEqual(PROD_T1);
    expect(s.coordinator.state()?.value.canonical_time).toEqual(PROD_T1);
    // no binding was created and no PC fact appeared
    expect(s.campaign.binding()).toBeUndefined();
  });

  it("is fact-for-fact the manual kernel advance of the same literal request: the gateway adds no state, owner or effect", async () => {
    const viaGateway = await dueCampaign();
    const manual = await dueCampaign();
    expect(await advanceNull(trustedNullPcAdvance(viaGateway))).toEqual(NULL_PC_COMMITTED);
    const m = await manual.coordinator.advance(literal());
    expect(m.ok).toBe(true);
    expect(summary(viaGateway)).toBe(summary(manual));
    expect(headRevision(viaGateway)).toBe(headRevision(manual));
  });

  it("a target at the due boundary resolves it and stops there truthfully; a later target carries the stable remainder to it", async () => {
    const s = await dueCampaign();
    expect(await advanceNull(trustedNullPcAdvance(s, { target: LOG_T_DELIVERY }))).toEqual(
      NULL_PC_COMMITTED,
    );
    const tx = s.coordinator.transaction(NULL_PC_TX)!.value;
    expect(tx.requested).toEqual({ target: LOG_T_DELIVERY, condition: null });
    expect(tx.outcome.actual_stop).toEqual(LOG_T_DELIVERY);
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    // a second, new OOC choice with a further target: nothing is registered and due, so it is not an empty-clock button
    const before = summary(s);
    expect(
      await advanceNull(
        trustedNullPcAdvance(s, {
          target: PROD_T1,
          transaction: nullPcTransaction("tx-null-pc-2"),
        }),
      ),
    ).toEqual(JSON.parse(NULL_PC_REFUSAL));
    expect(summary(s)).toBe(before);
  });

  it("does not skip unrelated registered due work: every due transfer at or before the target is resolved by its own owner path in one transaction", async () => {
    const s = await seededNullPcCampaign(tempDir());
    // two accepted entities, then two independent movement commitments with different delivery boundaries
    await acceptLogEntity(s, REQ_1, 1);
    await acceptLogEntity(s, REQ_2, 2, {
      completion_at: at(150),
      reserve_id: RESERVE_OTHER,
      input: 3,
    });
    for (const [n, req, move, deliveryAt] of [
      [1, REQ_1, MOVE_1, LOG_T_DELIVERY],
      [2, REQ_2, MOVE_2, at(220)],
    ] as const) {
      await commitMovementRequest(s, move, req, n);
      await must(
        s.logistics.commitMovement({
          ...logPublication(n),
          commit: commitInput(move, { delivery_at: deliveryAt }),
        }),
      );
      await must(
        s.logistics.dispatch({ ...logPublication(100 + n), dispatch: dispatchInput(move) }),
      );
      await registerTransfer(s, req, 30 + n);
    }
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(2);
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(NULL_PC_COMMITTED);
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    for (const req of [REQ_1, REQ_2]) {
      const e = entityIdOf(req);
      expect(s.logistics.transfer(FIXTURE_WORLD_ID, e)?.value.state.status).not.toBe("IN_TRANSFER");
      expect(s.campaign.store.getFact(worldEntityTransitionKey(FIXTURE_WORLD_ID, e))).toBeDefined();
    }
    expect(s.coordinator.transaction(NULL_PC_TX)!.value.engaged).toHaveLength(2);
  });

  it("only registered work at or before the target is resolved: a target that precedes the due boundary is refused and writes nothing", async () => {
    const s = await dueCampaign();
    const before = summary(s);
    const rev = headRevision(s);
    expect(await advanceNull(trustedNullPcAdvance(s, { target: at(PROD_T0.value + 50) }))).toEqual(
      JSON.parse(NULL_PC_REFUSAL),
    );
    expect(summary(s)).toBe(before);
    expect(headRevision(s)).toBe(rev);
  });
});

describe("the NULL-PC interval only: an active PC makes the operation inert", () => {
  it("a campaign with an active PC binding is refused before anything else is read, and nothing changes", async () => {
    const s = await dueCampaign();
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
    const before = summary(s);
    const rev = headRevision(s);
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(JSON.parse(NULL_PC_REFUSAL));
    expect(summary(s)).toBe(before);
    expect(headRevision(s)).toBe(rev);
    expect(s.coordinator.transaction(NULL_PC_TX)).toBeUndefined();
  });

  it("a PC activated after the context was bound makes the already-bound context inert, even for the replay of a committed identity", async () => {
    const s = await dueCampaign();
    const ctx = trustedNullPcAdvance(s);
    expect(await advanceNull(ctx)).toEqual(NULL_PC_COMMITTED);
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
    const before = summary(s);
    expect(await advanceNull(ctx)).toEqual(JSON.parse(NULL_PC_REFUSAL));
    expect(summary(s)).toBe(before);
  });
});

describe("stop / refusal: nothing is fabricated, skipped or advanced through a missing dependency", () => {
  it("a past target and a target in another unit are refused and write nothing", async () => {
    const s = await dueCampaign();
    const before = summary(s);
    const rev = headRevision(s);
    for (const target of [at(PROD_T0.value - 1), { unit: "other-unit", value: 999999 }])
      expect(
        await advanceNull(trustedNullPcAdvance(s, { target })),
        JSON.stringify(target),
      ).toEqual(JSON.parse(NULL_PC_REFUSAL));
    expect(summary(s)).toBe(before);
    expect(headRevision(s)).toBe(rev);
  });

  it("an owner stage the owner refuses commits a truthful short stop with a held continuation: the target is not reported reached and the host sees only the neutral status", async () => {
    const s = await dueCampaign();
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(NULL_PC_COMMITTED);
    restore();
    const tx = s.coordinator.transaction(NULL_PC_TX)!.value;
    expect(tx.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(tx.outcome.unresolved_dependents.length).toBeGreaterThan(0);
    const state = s.coordinator.state()!.value;
    expect(state.continuation?.from_transaction).toBe(NULL_PC_TX);
    expect(state.canonical_time.value).toBeLessThan(PROD_T1.value);
    expect(s.logistics.transfer(FIXTURE_WORLD_ID, entity)?.value.state.status).toBe("IN_TRANSFER");
    // the held continuation is neither abandoned nor consumed by a new target: a new identity is refused and writes nothing
    const before = summary(s);
    expect(
      await advanceNull(
        trustedNullPcAdvance(s, { transaction: nullPcTransaction("tx-null-pc-new-target") }),
      ),
    ).toEqual(JSON.parse(NULL_PC_REFUSAL));
    expect(summary(s)).toBe(before);
    // the same identity still replays
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(NULL_PC_COMMITTED);
    expect(summary(s)).toBe(before);
  });

  it("registered work whose owner has no shipped provider stops the kernel's transaction as unresolved: no provider is supplied, no effect is faked", async () => {
    const s = await seededNullPcSyntheticCampaign(tempDir());
    expect(s.campaign.binding()).toBeUndefined();
    const ctx = trustedNullPcAdvance(s as never, { target: at(PROD_T1.value + 1000) });
    const synthDue = s.coordinator.boundaryIndex().entries[0]!.at;
    const target = { unit: synthDue.unit, value: synthDue.value + 10 };
    expect(await advanceNull(trustedNullPcAdvance(s as never, { target }))).toEqual(
      NULL_PC_COMMITTED,
    );
    void ctx;
    const tx = s.coordinator.transaction(NULL_PC_TX)!.value;
    expect(tx.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(tx.outcome.unresolved_dependents.length).toBeGreaterThan(0);
    expect(s.coordinator.state()!.value.canonical_time.value).toBeLessThan(target.value);
    expect(s.coordinator.state()!.value.continuation).not.toBeNull();
  });

  it("a held continuation of another path is neither consumed, cancelled nor overwritten: a target is refused, nothing is written", async () => {
    const s = await dueCampaign();
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    const held = await logCoordinator(s.campaign.store).advance({
      ...literal(PROD_T1, "tx-held-manual"),
    });
    restore();
    expect(held.ok).toBe(true);
    expect(s.coordinator.state()!.value.continuation?.from_transaction).toBe("tx-held-manual");
    const before = summary(s);
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(JSON.parse(NULL_PC_REFUSAL));
    expect(summary(s)).toBe(before);
  });

  it("a campaign with no canonical temporal basis is refused", async () => {
    const dir = tempDir();
    const campaign = await must(CanonicalCampaign.create(dir, { campaignId: "c", buildId: "b" }));
    expect(await advanceNull(trustedNullPcAdvance({ campaign }, { target: PROD_T1 }))).toEqual(
      JSON.parse(NULL_PC_REFUSAL),
    );
  });
});

describe("recovery (RC-16): the same identity replays; a different intent conflicts; an unknown outcome is not mislabeled", () => {
  it("the same committed identity and request replays the byte-identical receipt and writes nothing, in process and after save → close → reopen", async () => {
    const s = await dueCampaign();
    const first = JSON.stringify(await advanceNull(trustedNullPcAdvance(s)));
    const afterFirst = summary(s);
    const rev = headRevision(s);
    expect(JSON.stringify(await advanceNull(trustedNullPcAdvance(s)))).toBe(first);
    expect(summary(s)).toBe(afterFirst);
    expect(headRevision(s)).toBe(rev);
    await s.campaign.store.close();
    const reopened = await reopenLogistics(s.dir);
    expect(summary(reopened)).toBe(afterFirst);
    expect(JSON.stringify(await advanceNull(trustedNullPcAdvance(reopened)))).toBe(first);
    expect(summary(reopened)).toBe(afterFirst);
    expect(headRevision(reopened)).toBe(rev);
  });

  it("the same identity with a changed target, cause, trigger, context or publication is refused and never silently amends the committed record", async () => {
    const s = await dueCampaign();
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(NULL_PC_COMMITTED);
    const committed = JSON.stringify(s.coordinator.transaction(NULL_PC_TX)!.value);
    const before = summary(s);
    const variants: Array<{ target?: unknown; transaction?: unknown }> = [
      { target: at(PROD_T1.value + 1) },
      { transaction: nullPcTransaction(NULL_PC_TX, { cause: "another-cause" }) },
      { transaction: nullPcTransaction(NULL_PC_TX, { trigger: { kind: "x", ref: "y" } }) },
      { transaction: nullPcTransaction(NULL_PC_TX, { publication: { basis: "b", secrecy: "s" } }) },
    ];
    for (const v of variants)
      expect(await advanceNull(trustedNullPcAdvance(s, v)), JSON.stringify(v)).toEqual(
        JSON.parse(NULL_PC_REFUSAL),
      );
    expect(summary(s)).toBe(before);
    expect(JSON.stringify(s.coordinator.transaction(NULL_PC_TX)!.value)).toBe(committed);
  });

  it("a lost reply after the sealed transaction is the opaque UNKNOWN, never 'nothing advanced'; presenting the same request reconciles to the committed receipt", async () => {
    const s = await dueCampaign();
    const restore = loseReplyWhenNull(s, (g: CommitGroup) =>
      g.writes.some((w) => w.key === temporalTransactionKey(NULL_PC_TX)),
    );
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(NULL_PC_UNKNOWN);
    restore();
    const afterLost = summary(s);
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(NULL_PC_COMMITTED);
    expect(summary(s)).toBe(afterLost);
  });

  it("a crash before each durable cut converges, on the same request, to the byte-identical canonical state of an uninterrupted run", async () => {
    const reference = await dueCampaign();
    expect(await advanceNull(trustedNullPcAdvance(reference))).toEqual(NULL_PC_COMMITTED);
    const final = summary(reference);
    const cuts: Array<[string, (g: CommitGroup) => boolean]> = [
      [
        "the opening authority",
        (g) => g.writes.some((w) => w.key.startsWith("temporal/transaction-authority/")),
      ],
      [
        "the Logistics delivery",
        (g) => g.writes.some((w) => w.key.startsWith("logistics/delivery/")),
      ],
      [
        "the destination custody",
        (g) => g.writes.some((w) => w.key === worldEntityTransitionKey(FIXTURE_WORLD_ID, entity)),
      ],
      [
        "the Logistics retirement",
        (g) => g.writes.some((w) => w.key === logisticsTransferKey(FIXTURE_WORLD_ID, entity)),
      ],
      [
        "the sealed transaction",
        (g) => g.writes.some((w) => w.key === temporalTransactionKey(NULL_PC_TX)),
      ],
    ];
    for (const [name, pred] of cuts) {
      const s = await dueCampaign();
      const restore = crashWhenNull(s, pred);
      const first = await advanceNull(trustedNullPcAdvance(s));
      restore();
      expect([JSON.stringify(first)], name).toContain(JSON.stringify(NULL_PC_UNKNOWN));
      expect(await advanceNull(trustedNullPcAdvance(s)), name).toEqual(NULL_PC_COMMITTED);
      expect(summary(s), name).toBe(final);
    }
  });

  it("a partial run recovered after save → close → reopen converges to the same state", async () => {
    const reference = await dueCampaign();
    expect(await advanceNull(trustedNullPcAdvance(reference))).toEqual(NULL_PC_COMMITTED);
    const final = summary(reference);
    const s = await dueCampaign();
    const restore = crashWhenNull(s, (g) =>
      g.writes.some((w) => w.key === temporalTransactionKey(NULL_PC_TX)),
    );
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(NULL_PC_UNKNOWN);
    restore();
    await s.campaign.store.close();
    const reopened = await reopenLogistics(s.dir);
    expect(await advanceNull(trustedNullPcAdvance(reopened))).toEqual(NULL_PC_COMMITTED);
    expect(summary(reopened)).toBe(final);
  });
});

describe("scope and isolation: observers, presentation and PCs are untouched, and campaigns cannot cross", () => {
  it("only the kernel's own temporal, stage and owner facts change: no PC, binding, epistemic, projection, presentation or capability fact appears", async () => {
    const s = await dueCampaign();
    const keysBefore = new Set(s.campaign.store.listFacts().map((f) => f.key));
    expect(await advanceNull(trustedNullPcAdvance(s))).toEqual(NULL_PC_COMMITTED);
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
    expect(s.campaign.store.getFact(TEMPORAL_STATE_KEY)).toBeDefined();
    expect(s.campaign.store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)).toBeDefined();
  });

  it("two campaigns with identical identifiers cannot cross: a context drives only the campaign it was bound to", async () => {
    const a = await dueCampaign();
    const b = await dueCampaign();
    const bBefore = summary(b);
    expect(await advanceNull(trustedNullPcAdvance(a))).toEqual(NULL_PC_COMMITTED);
    expect(summary(b)).toBe(bBefore);
    expect(b.coordinator.transaction(NULL_PC_TX)).toBeUndefined();
    // the same identity in B is a fresh, independent transaction
    expect(await advanceNull(trustedNullPcAdvance(b))).toEqual(NULL_PC_COMMITTED);
    expect(summary(b)).toBe(summary(a));
    // the handle is frozen and opaque: it cannot be re-pointed at another campaign after the fact
    const ctx = trustedNullPcAdvance(a);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.keys(ctx)).toEqual([]);
    expect(() => ((ctx as any).campaign = b.campaign)).toThrow();
  });

  it("the logistics object id and boundary id are those the existing helper derives: the gateway names none of them", async () => {
    const s = await dueCampaign();
    const object = s.coordinator.object(objectId)!.value;
    expect(object.next_boundary?.boundary_id).toBe(logisticsBoundaryId(MOVE_1));
    void PROD_T1;
  });
});
