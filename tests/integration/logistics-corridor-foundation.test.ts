// Source-Qualified Local Corridor and Logistics Read — the engine-level causal witness.
// Mechanism only: ONE World-State corridor (topological connection A→B, nothing more) is established independently of any Logistics
// demand; the explicitly source-qualified Logistics path reads and exact-pins it with the request and the entity's current origin;
// and the EXISTING commitment → dispatch → Temporal due → delivery → World-State ECT-01 destination commit → retirement chain runs
// as a disposable integration witness with a separately declared boundary. The corridor supplies no duration and asserts no delivery.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0, unchanged). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  WorldCorridorSchema,
  logisticsDeliveryKey,
  worldFallbackEntityKey,
  worldLocusKey,
} from "@immortalis/contracts";
import {
  DEST_LOCUS_ID,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  LOG_T_DELIVERY,
  MOVE_1,
  OTHER_LOCUS_ID,
  REQ_1,
  at,
  commitInput,
  dispatchInput,
  logPublication,
  logStopAtBoundaryRequest,
  movementRequestKey,
  prodAdvanceRequest,
  transitionKeyOf,
} from "@immortalis/testkit";
import {
  acceptAndCommit,
  acceptLogEntity,
  commitMovementRequest,
  entityIdOf,
  locusOfRequest,
  registerTransfer,
  reopenLogistics,
  seededLogisticsCampaign,
  type LogSeeded,
} from "../support/logistics.ts";
import {
  CORRIDOR_STATEMENT,
  acceptAndCommitViaCorridor,
  corridorCommit,
  corridorCommitDispatchRegister,
  corridorInput,
  corridorKeyOf,
  corridorPublication,
  establishCorridor,
} from "../support/logistics-corridor.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const W = FIXTURE_WORLD_ID;
const entityKey = worldFallbackEntityKey(W, entityIdOf(REQ_1));
const commitmentOf = (s: LogSeeded) => s.logistics.commitment(W, entityIdOf(REQ_1))!;
const transferOf = (s: LogSeeded) => s.logistics.transfer(W, entityIdOf(REQ_1))!;
const advance = (s: LogSeeded, id = "tx-move") =>
  s.coordinator.advance(logStopAtBoundaryRequest(id, MOVE_1));

describe("the World-State corridor is topology only, authored independently of any Logistics demand", () => {
  it("one confirmed A→B corridor reads back as exactly that connection: no reverse edge, duration, access or outcome is anywhere", async () => {
    const dir = tempDir();
    const s = await seededLogisticsCampaign(dir);
    const before = s.campaign.store.listFacts().length;
    await establishCorridor(s);
    const c = s.campaign.corridor(W, FIXTURE_LOCUS_ID, DEST_LOCUS_ID)!;
    expect(c.fact).toMatchObject({
      key: corridorKeyOf(),
      owner: "world_state",
      facet: "world_locus",
      version: 1,
    });
    expect(c.fact.provenance.group_id).toBe(corridorPublication(1).group_id);
    expect(c.value).toEqual({
      world: { fact_key: `world/${W}/profile`, entity_id: W },
      from: { fact_key: worldLocusKey(W, FIXTURE_LOCUS_ID), entity_id: FIXTURE_LOCUS_ID },
      to: { fact_key: worldLocusKey(W, DEST_LOCUS_ID), entity_id: DEST_LOCUS_ID },
      statement: CORRIDOR_STATEMENT,
    });
    // only the corridor was added: the world, the loci and every other fact are untouched
    expect(s.campaign.store.listFacts().length).toBe(before + 1);
    // the connection is directed: nothing is inferred in the other direction, to another locus or from the first locus to itself
    expect(s.campaign.corridor(W, DEST_LOCUS_ID, FIXTURE_LOCUS_ID)).toBeUndefined();
    expect(s.campaign.corridor(W, FIXTURE_LOCUS_ID, OTHER_LOCUS_ID)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
    // no time moved and nothing was requested, dispatched or delivered
    expect(s.coordinator.state()!.value.canonical_time.value).toBe(100);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("logistics/"))).toEqual([]);

    // reopen derives the same corridor and the same canon
    const head = s.campaign.store.head();
    await s.campaign.close();
    const re = await reopenLogistics(dir);
    expect(re.campaign.corridor(W, FIXTURE_LOCUS_ID, DEST_LOCUS_ID)!.value).toEqual(c.value);
    expect(re.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(re.campaign.verify()).toEqual([]);
  });

  it("the reverse connection exists only when it is independently authored, and is then a separate fact", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await establishCorridor(s, 1);
    await establishCorridor(
      s,
      2,
      corridorInput(DEST_LOCUS_ID, FIXTURE_LOCUS_ID, { statement: "a steep way back" }),
    );
    const forward = s.campaign.corridor(W, FIXTURE_LOCUS_ID, DEST_LOCUS_ID)!;
    const reverse = s.campaign.corridor(W, DEST_LOCUS_ID, FIXTURE_LOCUS_ID)!;
    expect(forward.fact.key).not.toBe(reverse.fact.key);
    expect(forward.value.statement).not.toBe(reverse.value.statement);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the stored value has no place for a duration, speed, capacity, access, hazard or outcome", () => {
    const parsed = WorldCorridorSchema.safeParse({
      world: { fact_key: `world/${W}/profile`, entity_id: W },
      from: { fact_key: worldLocusKey(W, FIXTURE_LOCUS_ID), entity_id: FIXTURE_LOCUS_ID },
      to: { fact_key: worldLocusKey(W, DEST_LOCUS_ID), entity_id: DEST_LOCUS_ID },
      statement: "x",
    });
    expect(parsed.success).toBe(true);
    for (const extra of [
      "duration",
      "travel_time",
      "speed",
      "capacity",
      "throughput",
      "passable",
      "access",
      "hazard",
      "feasible",
      "delivered",
      "route",
      "distance",
    ]) {
      const withExtra = WorldCorridorSchema.safeParse({ ...parsed.data, [extra]: 1 });
      expect(withExtra.success, extra).toBe(false);
    }
  });
});

describe("the source-qualified Logistics consumer reads and exact-pins the corridor before its own commitment", () => {
  it("the commitment pins the corridor, the request and the entity; the corridor supplies neither the boundary nor the outcome", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await establishCorridor(s);
    const corridorFact = s.campaign.store.getFact(corridorKeyOf())!;
    await acceptLogEntity(s, REQ_1, 1);
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    const entityBefore = s.campaign.store.getFact(entityKey)!;
    const requestBefore = s.campaign.store.getFact(movementRequestKey(MOVE_1))!;
    await must(
      s.logistics.commitCorridorMovement({ ...logPublication(1), commit: corridorCommit(MOVE_1) }),
    );
    const c = commitmentOf(s);
    const v = LogisticsCommitmentSchema.parse(c.fact.value);
    expect(v.corridor).toEqual({
      owner: "world_state",
      fact_key: corridorKeyOf(),
      version: corridorFact.version,
    });
    // the declared boundary is the caller's own declared value, never the corridor's
    expect(v.delivery.at).toEqual(LOG_T_DELIVERY);
    expect(v.state).toEqual({ status: "COMMITTED" });
    // the committed group read the corridor (and the entity's origin locus) at the exact versions and depended on their groups
    const group = s.campaign.store.committedGroup(logPublication(1).intent_id)!;
    expect(group.reads).toContainEqual({ key: corridorKeyOf(), version: 1 });
    expect(group.reads).toContainEqual({ key: worldLocusKey(W, FIXTURE_LOCUS_ID), version: 1 });
    expect(group.depends_on).toContain(corridorFact.provenance.group_id);
    // nothing is dispatched or delivered, and nothing upstream was rewritten
    expect(s.logistics.transfer(W, entityIdOf(REQ_1))).toBeUndefined();
    expect(s.logistics.delivery(W, entityIdOf(REQ_1))).toBeUndefined();
    expect(s.campaign.store.getFact(corridorKeyOf())).toEqual(corridorFact);
    expect(s.campaign.store.getFact(entityKey)).toEqual(entityBefore);
    expect(s.campaign.store.getFact(movementRequestKey(MOVE_1))).toEqual(requestBefore);
    expect(locusOfRequest(s, REQ_1)).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
      authority: "WORLD_STATE",
    });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the route-less foundation path is unchanged: it reads no corridor, pins none, and a committed corridor does not alter it", async () => {
    const plain = await seededLogisticsCampaign(tempDir());
    await acceptAndCommit(plain);
    const withCorridor = await seededLogisticsCampaign(tempDir());
    await establishCorridor(withCorridor);
    await acceptAndCommit(withCorridor);
    for (const s of [plain, withCorridor]) {
      const v = commitmentOf(s).value as Record<string, unknown>;
      expect("corridor" in v).toBe(false);
      expect(s.campaign.verify()).toEqual([]);
    }
    // identical commitment values with or without a corridor in the world
    expect(commitmentOf(withCorridor).value).toEqual(commitmentOf(plain).value);
  });

  it("the full existing chain runs on a corridor-qualified commitment: one delivery, one destination commit, one retirement; exactly one owner answers the locus at every cut", async () => {
    const dir = tempDir();
    const s = await seededLogisticsCampaign(dir);
    await establishCorridor(s);
    const corridorBefore = s.campaign.store.getFact(corridorKeyOf())!;
    await acceptAndCommitViaCorridor(s);
    const entityBefore = s.campaign.store.getFact(entityKey)!;
    const stationary = () => locusOfRequest(s, REQ_1)!;
    expect(stationary()).toMatchObject({ phase: "STATIONARY_AT_ORIGIN", authority: "WORLD_STATE" });

    await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    expect(stationary()).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
      stationary: null,
    });
    // the transfer is the existing single-leg record: it carries no corridor, route or duration
    const tv = LogisticsTransferSchema.parse(transferOf(s).fact.value);
    expect(JSON.stringify(tv)).not.toContain("corridor");
    await registerTransfer(s, REQ_1, 31);
    // an object that is engaged, but not yet due: nothing is delivered before the declared boundary
    expect(s.logistics.delivery(W, entityIdOf(REQ_1))).toBeUndefined();
    expect(s.campaign.store.getFact(transitionKeyOf(REQ_1))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);

    const r = await must(advance(s));
    expect(r.transaction.outcome.stop_reason).toBe("CONDITION_SATISFIED");
    expect(r.transaction.outcome.actual_stop).toEqual(LOG_T_DELIVERY);
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
    expect(r.rejections).toEqual([]);

    // one and only one of each result
    const d = s.logistics.delivery(W, entityIdOf(REQ_1))!;
    expect(d.fact.key).toBe(logisticsDeliveryKey(W, entityIdOf(REQ_1)));
    expect(d.fact.version).toBe(1);
    expect(s.campaign.store.getFact(transitionKeyOf(REQ_1))!.version).toBe(1);
    expect(transferOf(s).fact.version).toBe(2);
    expect(commitmentOf(s).fact.version).toBe(2);
    expect(stationary()).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
      movement: null,
    });
    expect(stationary().stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
    // the corridor pin survives retirement unchanged: the release rewrites state only
    const released = LogisticsCommitmentSchema.parse(commitmentOf(s).fact.value);
    expect(released.state.status).toBe("RELEASED");
    expect(released.corridor).toEqual({
      owner: "world_state",
      fact_key: corridorKeyOf(),
      version: 1,
    });
    // the corridor, the entity (identity, quantity, condition, history) and the request were never rewritten
    expect(s.campaign.store.getFact(corridorKeyOf())).toEqual(corridorBefore);
    expect(s.campaign.store.getFact(entityKey)).toEqual(entityBefore);
    expect(s.campaign.store.getFact(movementRequestKey(MOVE_1))!.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);

    // save → close → reopen: the same pins, order, sole current locus and final owner facts
    const head = s.campaign.store.head();
    await s.campaign.close();
    const re = await reopenLogistics(dir);
    expect(re.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(re.campaign.verify()).toEqual([]);
    expect(locusOfRequest(re, REQ_1)).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
    });
  });

  it("the corridor never advances time: with a corridor and no registered boundary nothing is delivered, whatever canonical time reads", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await establishCorridor(s);
    await acceptAndCommitViaCorridor(s);
    await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    // never registered: no boundary is earned, so the movement stays in transfer however far canonical time is later advanced
    expect(await codeOf(advance(s, "tx-unregistered"))).toBe("CONDITION_NOT_REACHABLE");
    await must(
      s.coordinator.advance(
        prodAdvanceRequest("tx-time", { unit: "fixture-time-unit", value: 400 }),
      ),
    );
    expect(s.coordinator.state()!.value.canonical_time.value).toBe(400);
    expect(locusOfRequest(s, REQ_1)).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
    });
    expect(s.logistics.delivery(W, entityIdOf(REQ_1))).toBeUndefined();
  });

  it("an engaged corridor-qualified transfer completes only at the declared boundary, and a boundary that is not later than the commitment is refused", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await establishCorridor(s);
    await acceptLogEntity(s, REQ_1, 1);
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    const refused = await s.logistics.commitCorridorMovement({
      ...logPublication(1),
      commit: corridorCommit(MOVE_1, { delivery_at: at(140) }),
    });
    expect(refused.ok).toBe(false);
    expect(s.logistics.commitment(W, entityIdOf(REQ_1))).toBeUndefined();
    await corridorCommitDispatchRegisterRest(s);
    expect(commitmentOf(s).value.delivery.at).toEqual(LOG_T_DELIVERY);
    await must(advance(s));
    expect(locusOfRequest(s, REQ_1)!.phase).toBe("DESTINATION_COMMITTED");
    expect(refused.ok ? "OK" : refused.error.code).toBe("INPUT_INVALID");
  });

  it("a whole corridor-qualified movement can be built by the shared setup helper and verifies", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await corridorCommitDispatchRegister(s);
    await must(advance(s));
    expect(s.campaign.verify()).toEqual([]);
    expect(commitInput(MOVE_1).request_key).toBe(movementRequestKey(MOVE_1));
  });
});

/** finish a movement whose request and entity already exist: the commitment (declared boundary), dispatch and registration */
async function corridorCommitDispatchRegisterRest(s: LogSeeded): Promise<void> {
  await must(
    s.logistics.commitCorridorMovement({ ...logPublication(2), commit: corridorCommit(MOVE_1) }),
  );
  await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
  await registerTransfer(s, REQ_1, 31);
}
