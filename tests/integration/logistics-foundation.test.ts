/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Single-Leg Logistics Transfer & Destination Handoff Backbone Foundation — "an already-accepted fallback physical
// entity exists at Place A → an authorized Movement Service Request exists → Logistics establishes the minimum
// lawful movement-service commitment → the entity dispatches → Logistics is the sole authoritative movement locus
// while the entity is in transfer → Logistics establishes delivery completion → World-State commits the destination
// through the existing ECT-01 seam → only then does Logistics retire the transfer and release the commitment."
// Register lineage: IA-01/02/03/04 (partial), IA-05/IA-06/IA-22 (reused / partial); RC-02/04/07/10/16; IM-02,
// IM-03, IM-05, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0). CAL-01 stays UNCALIBRATED
// (EXACT only). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  EntityTransitionCloseSchema,
  FallbackPhysicalEntitySchema,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  entityTransitionStage,
  logisticsDeliveryKey,
  logisticsDeliveryStage,
  logisticsRetirementStage,
  worldFallbackEntityKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  TemporalCoordinator,
  stageGroupId,
  stageIntentId,
  type CampaignStore,
} from "@immortalis/engine";
import {
  DEST_LOCUS_ID,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  LOG_T_DELIVERY,
  MOVE_1,
  MOVE_2,
  PROD_T1,
  REQ_1,
  REQ_2,
  RESERVE_OTHER,
  at,
  commitInput,
  dispatchInput,
  logPublication,
  logStopAtBoundaryRequest,
  logisticsProviders,
  movementRequestKey,
  prodAdvanceRequest,
  transitionKeyOf,
} from "@immortalis/testkit";
import {
  acceptAndCommit,
  acceptCommitDispatchRegister,
  acceptLogEntity,
  commitMovementRequest,
  entityIdOf,
  locusOfRequest,
  logSummary,
  registerTransfer,
  seededLogisticsCampaign,
  type LogSeeded,
} from "../support/logistics.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const entityKey = (rid: string) => worldFallbackEntityKey(FIXTURE_WORLD_ID, entityIdOf(rid));
const commitmentOf = (s: LogSeeded, rid = REQ_1) =>
  s.logistics.commitment(FIXTURE_WORLD_ID, entityIdOf(rid))!;
const transferOf = (s: LogSeeded, rid = REQ_1) =>
  s.logistics.transfer(FIXTURE_WORLD_ID, entityIdOf(rid))!;
const advance = (s: LogSeeded, id = "tx-move", rid = MOVE_1) =>
  s.coordinator.advance(logStopAtBoundaryRequest(id, rid));

const deliveryStage = logisticsDeliveryStage(MOVE_1);
const retirementStage = logisticsRetirementStage(MOVE_1);
const transitionStage = entityTransitionStage(`delivery:${MOVE_1}`);

/** A store that refuses (as an unknown outcome, committing NOTHING) the first group the predicate names. */
function blockingStore(
  inner: CampaignStore,
  block: (g: CommitGroup) => boolean,
): { store: CampaignStore; blocked: () => number } {
  let blocked = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async (g: any) => {
      if (block(g as CommitGroup)) {
        blocked++;
        return {
          ok: false,
          error: { code: "UNKNOWN_OUTCOME", message: "simulated crash before this group" },
        } as never;
      }
      return inner.commit(g);
    },
  };
  return { store, blocked: () => blocked };
}
const isTransitionGroup = (g: CommitGroup) => g.writes.some((w) => w.key.endsWith("/transition"));
const isRetirementGroup = (g: CommitGroup) =>
  g.owner === "logistics" && g.writes.some((w) => w.key.startsWith("logistics/transfer/"));

describe("an already-accepted entity, a request and a commitment (acceptance 1, 2, 3)", () => {
  it("before any movement the World-State stationary locus is the one authority", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(s, REQ_1, 1);
    const where = locusOfRequest(s, REQ_1)!;
    expect(where).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
      authority: "WORLD_STATE",
      movement: null,
      delivery_established: false,
    });
    expect(where.stationary!.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    expect(s.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a request from another owner leads to ONE Logistics commitment that owns none of the entity's identity, quantity, condition or stationary truth", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(s, REQ_1, 1);
    const entityBefore = s.campaign.store.getFact(entityKey(REQ_1))!;
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    const request = s.campaign.store.getFact(movementRequestKey(MOVE_1))!;
    // the request is the SYNTHETIC requester's own fact, in its own key space: not Logistics state
    expect(request.owner).toBe("SYNTHETIC-MOVEMENT-REQUESTER");
    expect(request.key.startsWith("logistics/")).toBe(false);

    const r = await must(
      s.logistics.commitMovement({ ...logPublication(1), commit: commitInput(MOVE_1) }),
    );
    expect(r.replayed).toBe(false);
    const c = commitmentOf(s);
    expect(c.fact.owner).toBe("logistics");
    expect(c.fact.facet).toBe("logistics_state");
    expect(c.fact.version).toBe(1);
    const v = LogisticsCommitmentSchema.parse(c.fact.value);
    expect(v.state).toEqual({ status: "COMMITTED" });
    expect(v.service_basis).toBe("NON_AGENTIVE_SINGLE_LEG_UNCONTENDED");
    expect(v.release_condition).toBe("AFTER_DESTINATION_OWNER_COMMIT");
    // the request and the entity are PINNED references: nothing of the entity is copied
    expect(v.request).toEqual({
      owner: request.owner,
      fact_key: request.key,
      request_id: MOVE_1,
      version: request.version,
    });
    expect(v.moved).toMatchObject({
      fact_key: entityKey(REQ_1),
      entity_id: entityIdOf(REQ_1),
      version: entityBefore.version,
      substantive_owner: { owner: "world_state" },
    });
    const json = JSON.stringify(c.fact.value);
    for (const copied of ["quantity", '"condition"', "entity_class", "amount"])
      expect(json).not.toContain(copied);
    expect(v.origin.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    expect(v.destination.locus.entity_id).toBe(DEST_LOCUS_ID);
    // the commitment is not a dispatch, and creates no transfer, delivery, object or boundary
    expect(s.logistics.transfer(FIXTURE_WORLD_ID, entityIdOf(REQ_1))).toBeUndefined();
    expect(s.logistics.delivery(FIXTURE_WORLD_ID, entityIdOf(REQ_1))).toBeUndefined();
    expect(s.coordinator.object(`obj-logistics-${MOVE_1}`)).toBeUndefined();
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    // the stationary World-State locus is still the one authority; the entity is byte-untouched
    expect(locusOfRequest(s, REQ_1)).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
      authority: "WORLD_STATE",
    });
    expect(s.campaign.store.getFact(entityKey(REQ_1))).toEqual(entityBefore);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("dispatch: Logistics becomes the sole authoritative movement locus; dispatch is not delivery (acceptance 4, 5)", () => {
  it("after dispatch and before the destination commit there is exactly one authority — Logistics — and the entity is nowhere stationary", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptAndCommit(s);
    const entityBefore = s.campaign.store.getFact(entityKey(REQ_1))!;
    await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    const t = transferOf(s);
    expect(t.fact.owner).toBe("logistics");
    const v = LogisticsTransferSchema.parse(t.fact.value);
    expect(v.state.status).toBe("IN_TRANSFER");
    expect(v.dispatched_at.value).toBe(140); // the canonical basis at dispatch
    expect(v.commitment.fact_key).toBe(commitmentOf(s).fact.key);
    expect(v.moved).toEqual({ fact_key: entityKey(REQ_1), entity_id: entityIdOf(REQ_1) });
    const where = locusOfRequest(s, REQ_1)!;
    expect(where).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
      stationary: null,
      delivery_established: false,
    });
    expect(where.movement!.from.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    expect(where.movement!.to.locus.entity_id).toBe(DEST_LOCUS_ID);
    // dispatch is not delivery: nothing at the destination, no delivery result, no World-State transition
    expect(s.logistics.delivery(FIXTURE_WORLD_ID, entityIdOf(REQ_1))).toBeUndefined();
    expect(s.campaign.store.getFact(transitionKeyOf(REQ_1))).toBeUndefined();
    // the commitment is untouched (still committed: it backs the active transfer) and so is the entity
    expect(LogisticsCommitmentSchema.parse(commitmentOf(s).fact.value).state.status).toBe(
      "COMMITTED",
    );
    expect(s.campaign.store.getFact(entityKey(REQ_1))).toEqual(entityBefore);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a dispatch may follow the commitment after canonical time has moved, and still states only a movement in progress", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptAndCommit(s);
    await must(
      s.coordinator.advance(
        prodAdvanceRequest("tx-time", { unit: "fixture-time-unit", value: 160 }),
      ),
    );
    await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    expect(transferOf(s).value.dispatched_at.value).toBe(160);
    expect(commitmentOf(s).value.committed_at.value).toBe(140);
    await registerTransfer(s, REQ_1, 31);
    expect(s.coordinator.object(`obj-logistics-${MOVE_1}`)!.value.last_resolved_basis.value).toBe(
      160,
    );
    await must(advance(s));
    expect(s.campaign.verify()).toEqual([]);
    expect(locusOfRequest(s, REQ_1)!.phase).toBe("DESTINATION_COMMITTED");
  });
});

describe("the primary path: delivery → World-State's destination commit → retirement, in one engaged boundary (acceptance 6, 7, 8, 9, 10)", () => {
  it("the same entity continues unchanged; Logistics completion alone is not destination truth; retirement follows the destination commit", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptCommitDispatchRegister(s);
    const entityBefore = s.campaign.store.getFact(entityKey(REQ_1))!;
    const productionBefore = s.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("production/"));

    const r = await must(advance(s));
    // stops exactly at the declared delivery boundary
    expect(r.transaction.outcome.stop_reason).toBe("CONDITION_SATISFIED");
    expect(r.transaction.outcome.actual_stop).toEqual(LOG_T_DELIVERY);
    // Logistics completion → the destination owner's commit → Logistics retirement: a lawful ORDER of three stages
    expect(
      r.transaction.stages.map((x) => [
        x.stage.owner_operation.owner,
        x.stage.owner_operation.operation,
      ]),
    ).toEqual([
      ["logistics", "logistics-establish-delivery"],
      ["world_state", "world-state-commit-entity-transition"],
      ["logistics", "logistics-retire-transfer"],
    ]);
    expect(r.transaction.stages.map((x) => x.revision)).toEqual(
      [...r.transaction.stages.map((x) => x.revision)].sort((a, b) => a - b),
    );
    expect(r.rejections).toEqual([]);
    expect(r.transaction.outcome.unresolved_dependents).toEqual([]);

    // Logistics' delivery-complete result: Logistics' own sealed fact, naming where and never that the entity IS there
    const d = s.logistics.delivery(FIXTURE_WORLD_ID, entityIdOf(REQ_1))!;
    expect(d.fact.owner).toBe("logistics");
    expect(d.fact.version).toBe(1);
    expect(d.fact.key).toBe(logisticsDeliveryKey(FIXTURE_WORLD_ID, entityIdOf(REQ_1)));
    expect(d.fact.provenance.group_id).toBe(stageGroupId(deliveryStage));
    expect(d.value.outcome.kind).toBe("SAME_ENTITY_LOCUS_CHANGE_REQUIRED");
    expect(d.value.source.owner).toBe("logistics");
    // Logistics establishes the result AT the delivery boundary, never at the dispatch: it is not backdated
    expect(d.value.timing.established_at).toEqual(LOG_T_DELIVERY);
    expect(d.value.timing.established_at).not.toEqual(transferOf(s).value.dispatched_at);
    expect(d.value.timing.occurs_at).toEqual(LOG_T_DELIVERY);

    // the destination: World-State's ECT-01 transition, committed under the existing Entity Transition Close
    const tf = s.campaign.store.getFact(transitionKeyOf(REQ_1))!;
    expect(tf.owner).toBe("world_state");
    expect(tf.provenance.group_id).toBe(stageGroupId(transitionStage));
    const tr = EntityTransitionCloseSchema.parse(tf.value);
    expect(tr.close.name).toBe("Entity Transition Close");
    expect(tr.cause).toMatchObject({ owner: "logistics", fact_key: d.fact.key, version: 1 });
    expect(tr.locus.from.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    expect(tr.locus.to.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(tr.continuity.relation).toBe("SAME_ENTITY_CONTINUES");

    // the retirement: the transfer closed and the commitment released, atomically, pinning the destination commit
    const t = transferOf(s);
    const c = commitmentOf(s);
    expect(t.fact.version).toBe(2);
    expect(c.fact.version).toBe(2);
    expect(t.fact.provenance.group_id).toBe(stageGroupId(retirementStage));
    expect(c.fact.provenance.group_id).toBe(t.fact.provenance.group_id);
    const tv = LogisticsTransferSchema.parse(t.fact.value);
    expect(tv.state).toMatchObject({
      status: "RETIRED",
      movement_locus: "CLOSED",
      destination_commit: { fact_key: tf.key, version: 1 },
      delivery: { fact_key: d.fact.key, version: 1 },
    });
    expect(LogisticsCommitmentSchema.parse(c.fact.value).state).toMatchObject({
      status: "RELEASED",
      destination_commit: { fact_key: tf.key, version: 1 },
    });
    // retirement is committed strictly after the destination commit, which is after the delivery result
    const rev = (f: { provenance: { intent_id: string } }) =>
      s.campaign.store.lookupReceipt(f.provenance.intent_id)!.revision;
    expect(rev(d.fact)).toBeLessThan(rev(tf));
    expect(rev(tf)).toBeLessThan(rev(t.fact));

    // the destination World-State locus is now the one authority; the movement locus is closed
    const where = locusOfRequest(s, REQ_1)!;
    expect(where).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
      movement: null,
      delivery_established: true,
    });
    expect(where.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(where.origin.locus.entity_id).toBe(FIXTURE_LOCUS_ID); // history is intact

    // the SAME entity, byte-identical: identity, quantity, condition, version, provenance and accepted locality
    expect(s.campaign.store.getFact(entityKey(REQ_1))).toEqual(entityBefore);
    expect(FallbackPhysicalEntitySchema.parse(entityBefore.value).locality.locus.entity_id).toBe(
      FIXTURE_LOCUS_ID,
    );
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("production/"))).toEqual(
      productionBefore,
    );
    expect(s.production.availability(REQ_1).state).toBe("ACCEPTED_AVAILABLE");
    expect(
      s.campaign.store.listFacts().filter((f) => /^world\/[^/]+\/entity\/[^/]+$/.test(f.key)),
    ).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("every stage is published under the identity derived from its StageKey, caused by the one transaction, under its durable authority", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptCommitDispatchRegister(s);
    const r = await must(advance(s));
    for (const st of [deliveryStage, transitionStage, retirementStage]) {
      expect(s.campaign.store.lookupReceipt(stageIntentId(st))).not.toBeNull();
      const g = s.campaign.store.committedGroup(stageIntentId(st))!;
      expect(g.group_id).toBe(stageGroupId(st));
      expect(g.cause).toBe("transaction:tx-move");
      expect(g.depends_on).toContain(
        s.campaign.store.getFact("temporal/transaction-authority/tx-move")!.provenance.group_id,
      );
    }
    expect(r.transaction.stages).toHaveLength(3);
    // the object's boundary is retired, the index holds nothing, and canonical time stopped at the boundary
    expect(s.coordinator.object(`obj-logistics-${MOVE_1}`)!.value.next_boundary).toBeNull();
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
  });

  it("replaying the committed transaction returns it and writes nothing: no second transfer, delivery, transition or retirement", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptCommitDispatchRegister(s);
    await must(advance(s));
    const after = logSummary(s.campaign, s.coordinator);
    const replay = await must(advance(s));
    expect(replay.replayed).toBe(true);
    expect(logSummary(s.campaign, s.coordinator)).toEqual(after);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("logistics/"))).toHaveLength(
      3,
    ); // one commitment, one transfer, one delivery: nothing more
  });
});

describe("one lawful answer to 'where is this entity?' at EVERY durable cut of the lifecycle (acceptance 9, 14)", () => {
  it("never two authorities: before dispatch, in transfer, delivered-but-uncommitted, destination-committed-awaiting-retirement, and retired", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptCommitDispatchRegister(s);
    const seen: string[] = [];
    const note = () => {
      const w = locusOfRequest(s, REQ_1)!;
      // exactly one authority carries a locus; the other carries none
      expect((w.stationary === null) !== (w.movement === null)).toBe(true);
      expect(w.authority === "LOGISTICS").toBe(w.movement !== null);
      seen.push(`${w.phase}/${w.authority}/delivered=${w.delivery_established}`);
      return w;
    };
    expect(note().phase).toBe("IN_TRANSFER");

    // (1) the delivery result commits; the transition is withheld (the process stops before it)
    const noTransition = blockingStore(s.campaign.store, isTransitionGroup);
    const c1 = new TemporalCoordinator(noTransition.store, logisticsProviders());
    const r1 = await c1.advance(logStopAtBoundaryRequest("tx-move", MOVE_1));
    expect(r1.ok).toBe(false);
    expect(noTransition.blocked()).toBe(1);
    const afterDelivery = note();
    // Logistics' arrival is NOT destination truth: it is still the movement locus
    expect(afterDelivery).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
      delivery_established: true,
    });
    expect(s.campaign.store.getFact(transitionKeyOf(REQ_1))).toBeUndefined();
    expect(transferOf(s).fact.version).toBe(1); // it cannot retire merely because delivery was established
    expect(s.campaign.verify()).toEqual([]);

    // (2) the destination commit lands; the retirement is withheld
    const noRetire = blockingStore(s.campaign.store, isRetirementGroup);
    const c2 = new TemporalCoordinator(noRetire.store, logisticsProviders());
    const r2 = await c2.advance(logStopAtBoundaryRequest("tx-move", MOVE_1));
    expect(r2.ok).toBe(false);
    expect(noRetire.blocked()).toBe(1);
    const afterDestination = note();
    expect(afterDestination).toMatchObject({
      phase: "DESTINATION_COMMITTED_RETIREMENT_PENDING",
      authority: "WORLD_STATE",
    });
    expect(afterDestination.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
    // Logistics' record is still not retired — pending its own stage — and is not a rival claim
    expect(LogisticsTransferSchema.parse(transferOf(s).fact.value).state.status).toBe(
      "IN_TRANSFER",
    );
    expect(s.campaign.verify()).toEqual([]);

    // (3) the same transaction, re-presented: the committed stages are adopted, the retirement commits once
    const done = await must(advance(s));
    expect(done.adopted).toHaveLength(2);
    expect(done.recomputed_in_place).toEqual([]);
    expect(note().phase).toBe("DESTINATION_COMMITTED");
    expect(seen).toEqual([
      "IN_TRANSFER/LOGISTICS/delivered=false",
      "IN_TRANSFER/LOGISTICS/delivered=true",
      "DESTINATION_COMMITTED_RETIREMENT_PENDING/WORLD_STATE/delivered=true",
      "DESTINATION_COMMITTED/WORLD_STATE/delivered=true",
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("history stays valid (acceptance 11)", () => {
  it("the Economy-realized entity moves through Logistics; the demand, request, operation, completion, acceptance and realized access are byte-identical and verify", async () => {
    const { issueStartRegister, seededEconomyCampaign } = await import("../support/economy.ts");
    const {
      DEMAND_1,
      LOGISTICS_FIXTURE_EXTENSION,
      PROD_TC,
      operationOf,
      fixtureDestinationLocus,
      publication,
      movementRequest,
      movementRequestGroup,
      FIXTURE_CAMPAIGN,
      temporalPublication,
    } = await import("@immortalis/testkit");
    const { LogisticsAdapter, entityCurrentLocus, logisticsTemporalObject } =
      await import("@immortalis/engine");
    const { economyRealizationKey, productionOutputReference } =
      await import("@immortalis/contracts");
    const s = await seededEconomyCampaign(tempDir(), { extension: LOGISTICS_FIXTURE_EXTENSION });
    await must(s.campaign.establishLocus({ ...publication(7), locus: fixtureDestinationLocus() }));
    await issueStartRegister(s, DEMAND_1, 1);
    const coordinator = new TemporalCoordinator(s.campaign.store, logisticsProviders());
    await must(coordinator.advance(prodAdvanceRequest("tx-realize", PROD_TC)));
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    const opId = operationOf(DEMAND_1);
    const entityId = productionOutputReference(opId);
    const history = () =>
      s.campaign.store
        .listFacts()
        .filter((f) => /^(economy|production)\/|^world\/[^/]+\/entity\/[^/]+$/.test(f.key));
    const before = history();
    const realization = s.campaign.store.getFact(economyRealizationKey(DEMAND_1))!;

    await must(
      s.campaign.store.commit(
        movementRequestGroup(FIXTURE_CAMPAIGN, 1, MOVE_1, movementRequest(MOVE_1, opId)),
      ),
    );
    const logistics = new LogisticsAdapter(s.campaign.store);
    await must(logistics.commitMovement({ ...logPublication(1), commit: commitInput(MOVE_1) }));
    await must(logistics.dispatch({ ...logPublication(2), dispatch: dispatchInput(MOVE_1) }));
    await must(
      coordinator.registerObject({
        ...temporalPublication(60),
        object: logisticsTemporalObject(
          LogisticsCommitmentSchema.parse(
            logistics.commitment(FIXTURE_WORLD_ID, entityId)!.fact.value,
          ),
          LogisticsTransferSchema.parse(logistics.transfer(FIXTURE_WORLD_ID, entityId)!.fact.value),
        ),
      }),
    );
    await must(coordinator.advance(prodAdvanceRequest("tx-move", PROD_T1)));

    expect(
      entityCurrentLocus(s.campaign.store, FIXTURE_WORLD_ID, entityId)!.current.locus.entity_id,
    ).toBe(DEST_LOCUS_ID);
    expect(history()).toEqual(before);
    expect(s.campaign.store.getFact(economyRealizationKey(DEMAND_1))).toEqual(realization);
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    expect(s.production.availability(opId).state).toBe("ACCEPTED_AVAILABLE");
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("bounded scope: only the engaged movement is read, resolved or written (acceptance 16)", () => {
  it("an unrelated accepted entity with its own committed (undispatched) movement is never read, staged or written; nothing is scanned", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    // REQ_1's entity has a committed, undispatched movement (MOVE_1); REQ_2's entity has the engaged transfer (MOVE_2)
    await acceptLogEntity(s, REQ_1, 1);
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    await must(
      s.logistics.commitMovement({
        ...logPublication(1),
        commit: commitInput(MOVE_1, { delivery_at: at(230) }),
      }),
    );
    await acceptLogEntity(s, REQ_2, 2, { reserve_id: RESERVE_OTHER, completion_at: at(150) });
    await commitMovementRequest(s, MOVE_2, REQ_2, 2);
    await must(
      s.logistics.commitMovement({
        ...logPublication(2),
        commit: commitInput(MOVE_2, { delivery_at: at(240) }),
      }),
    );
    await must(s.logistics.dispatch({ ...logPublication(102), dispatch: dispatchInput(MOVE_2) }));
    await registerTransfer(s, REQ_2, 32);

    const unrelatedFacts = s.campaign.store
      .listFacts()
      .filter((f) => f.key.includes(entityIdOf(REQ_1)) || f.key.includes(MOVE_1));
    expect(unrelatedFacts.length).toBeGreaterThan(0);
    const unrelatedKeys = new Set(unrelatedFacts.map((f) => f.key));
    const spy = spyStore(s.campaign.store);
    const coordinator = new TemporalCoordinator(spy.store, logisticsProviders());
    await must(coordinator.advance(logStopAtBoundaryRequest("tx-move-2", MOVE_2)));
    expect(spy.listCalls()).toBe(0);
    for (const g of spy.commits)
      for (const w of g.writes) expect(unrelatedKeys.has(w.key)).toBe(false);
    for (const f of unrelatedFacts) expect(s.campaign.store.getFact(f.key)).toEqual(f);
    // exactly the engaged chain was read, by identity: nothing of the unrelated entity or movement
    const read = new Set(spy.getFacts);
    expect(read.has(movementRequestKey(MOVE_2))).toBe(true);
    for (const k of unrelatedKeys) expect(read.has(k)).toBe(false);
    expect([...read].some((k) => k.startsWith("production/"))).toBe(false);
    // the unrelated movement is still exactly where it was: committed, not dispatched; its entity stationary
    expect(locusOfRequest(s, REQ_1)).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
      authority: "WORLD_STATE",
    });
    expect(locusOfRequest(s, REQ_2)).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
    });
    expect(s.campaign.verify()).toEqual([]);
  });
});
