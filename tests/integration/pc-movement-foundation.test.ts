// Active-PC Voluntary Movement Commitment → Single-Leg Physical Relocation Foundation (fortieth bounded slice) — "the player commits
// to one voluntary relocation; the PC-owned Movement Service Request names the continuing PC; the World-State custody record is
// admitted as the moved subject; Logistics holds the in-transfer locus; Logistics completion causes World-State's destination
// commit; only then does Logistics retire."
// Register lineage: IA-01/02/03/04/06/14 (partial); RC-02/04/07/10/13/16; IM-02, IM-03, IM-05, IM-07, IM-11, IM-12, IM-17.
// Sources: frozen Active-PC Post-Handover Physical Locus Ownership & Relocation Contract (pin 2026-10-08T01:25:36.611Z, §§4-11, 13,
// 14; NOT a spec-lock pin); spec/f027/spec-lock.json — WS-010, F-016 ECT-01, F-017, I-002 pins. CAL-01 stays UNCALIBRATED (EXACT
// only). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  EntityTransitionCloseSchema,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  MovementServiceRequestSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PcMovementCommitmentSchema,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsDeliveryStage,
  logisticsRetirementStage,
  logisticsTransferKey,
  pcExistenceContractKey,
  pcMovementCommitmentKey,
  pcMovementRequestKey,
  worldActorCouplingKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldPcLocusCustodyKey,
  entityTransitionStage,
} from "@immortalis/contracts";
import { TemporalCoordinator, stageIntentId } from "@immortalis/engine";
import { logStopAtBoundaryRequest } from "@immortalis/testkit";
import {
  DEST_LOCUS_ID,
  LOG_T_DELIVERY,
  PC,
  REQUEST_ID,
  W,
  advanceToDelivery,
  authorityCensus,
  blockingStore,
  commitMove,
  commitRequestDispatchRegister,
  custodiedCampaign,
  isRetirementGroup,
  isTransitionGroup,
  logisticsCommit,
  logisticsDispatch,
  movementProviders,
  registerPcTransfer,
  requestMove,
  snapshotFacts,
} from "../support/pc-movement.ts";
import { must } from "../support/temporal.ts";

const ORIGIN = "locus-fixture-1";
const custodyKey = worldPcLocusCustodyKey(PC);
const protectedKeys = [
  PLAYER_CHARACTER_BINDING_KEY,
  worldActorCouplingKey(PC),
  pcExistenceContractKey(PC),
  custodyKey,
];

describe("a complete lawful single-leg relocation of the active PC (acceptance 1)", () => {
  it("commitment → PC-owned request → Logistics commitment → dispatch → delivery → World-State destination commit → retirement, and the destination is persistent truth", async () => {
    const s = await custodiedCampaign();
    const before = snapshotFacts(s);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
      authority: "WORLD_STATE",
    });
    expect(s.campaign.pcCurrentLocus(PC)!.stationary!.locus.entity_id).toBe(ORIGIN);

    await commitRequestDispatchRegister(s);
    await must(advanceToDelivery(s));

    const where = s.campaign.pcCurrentLocus(PC)!;
    expect(where).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
      movement: null,
    });
    expect(where.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(where.origin.locus.entity_id).toBe(ORIGIN);

    // World-State's ECT-01 transition is the destination truth for the SAME continuing PC reference
    const transition = EntityTransitionCloseSchema.parse(
      s.campaign.store.getFact(worldEntityTransitionKey(W, PC))!.value,
    );
    expect(transition.entity).toMatchObject({ fact_key: custodyKey, entity_id: PC, version: 1 });
    expect(transition.continuity).toMatchObject({ predecessor: PC, successor: PC });
    expect(transition.locus.from.locus.entity_id).toBe(ORIGIN);
    expect(transition.locus.to.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(transition.cause).toMatchObject({
      owner: "logistics",
      fact_key: logisticsDeliveryKey(W, PC),
    });
    expect(transition.custodian.owner).toBe("world_state");

    // Logistics' lifecycle is closed
    const c = LogisticsCommitmentSchema.parse(s.logistics.commitment(W, PC)!.fact.value);
    const t = LogisticsTransferSchema.parse(s.logistics.transfer(W, PC)!.fact.value);
    expect(c.state.status).toBe("RELEASED");
    expect(t.state.status).toBe("RETIRED");
    expect(s.campaign.verify()).toEqual([]);

    // nothing the slice consumed was rewritten (the origin custody and the handover facts are immutable provenance)
    for (const k of protectedKeys) expect(s.campaign.store.getFact(k)).toEqual(before.get(k));
    // the fallback entity of a Production durable was never created for the PC
    expect(s.campaign.store.getFact(worldFallbackEntityKey(W, PC))).toBeUndefined();
  });

  it("a replay of the committed transaction writes nothing: no second delivery, transition or retirement", async () => {
    const s = await custodiedCampaign();
    await commitRequestDispatchRegister(s);
    await must(advanceToDelivery(s));
    const after = snapshotFacts(s);
    const head = s.campaign.store.head();
    const replay = await must(advanceToDelivery(s));
    expect(replay.replayed).toBe(true);
    expect(s.campaign.store.head()).toEqual(head);
    expect(snapshotFacts(s)).toEqual(after);
  });
});

describe("commitment and request ownership stay distinct from Logistics execution (acceptance 2)", () => {
  it("the commitment-of-record is the PC-state owner's willingness only; it is not a world result and moves nothing", async () => {
    const s = await custodiedCampaign();
    const before = snapshotFacts(s);
    await must(commitMove(s, 1));
    const fact = s.campaign.store.getFact(pcMovementCommitmentKey(PC))!;
    expect(fact).toMatchObject({
      owner: "pc_existence",
      facet: "pc_voluntary_commitment",
      version: 1,
    });
    const v = PcMovementCommitmentSchema.parse(fact.value);
    expect(v.authored_under).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });
    expect(v.intent.destination.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(v.basis.pinned_versions).toEqual({ pc: 1, binding: 1, custody: 1, world: 1, locus: 1 });
    // exactly one new fact; the PC is still stationary at the origin; no request, Logistics, transition or fallback fact exists
    const after = snapshotFacts(s);
    expect([...after.keys()].filter((k) => !before.has(k))).toEqual([pcMovementCommitmentKey(PC)]);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
      authority: "WORLD_STATE",
    });
    expect(s.campaign.store.listFacts().filter((f) => f.owner === "logistics")).toEqual([]);
    // the committed value states no route, duration, cost, arrival or success
    const json = JSON.stringify(fact.value);
    for (const word of [
      "route",
      "path",
      "duration",
      "speed",
      "cost",
      "arrival",
      "arrived",
      "success",
    ])
      expect(json).not.toContain(word);
  });

  it("the PC-owned Movement Service Request is derived from the commitment, lives in the PC owner's key space and is not Logistics state", async () => {
    const s = await custodiedCampaign();
    await must(commitMove(s, 1));
    await must(requestMove(s, 2));
    const fact = s.campaign.store.getFact(pcMovementRequestKey(PC))!;
    expect(fact).toMatchObject({
      owner: "pc_existence",
      facet: "pc_voluntary_commitment",
      version: 1,
    });
    expect(fact.key.startsWith("logistics/")).toBe(false);
    const r = MovementServiceRequestSchema.parse(fact.value);
    expect(r).toEqual({
      request_id: REQUEST_ID,
      source: { owner: "pc_existence", cause_ref: pcMovementCommitmentKey(PC) },
      subject: { fact_key: custodyKey, entity_id: PC },
      destination: s.campaign.pcMovementCommitment(PC)!.value.intent.destination,
      priority_authority_ref: null,
    });
    // still no Logistics fact, no transfer object: a request is not a commitment to move
    expect(s.campaign.store.listFacts().filter((f) => f.owner === "logistics")).toEqual([]);
    expect(s.campaign.pcCurrentLocus(PC)!.authority).toBe("WORLD_STATE");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("Logistics creates no willingness: with no PC commitment there is no request and Logistics cannot commit a movement", async () => {
    const s = await custodiedCampaign();
    const noRequest = await logisticsCommit(s, 1);
    expect(!noRequest.ok && noRequest.error.code).toBe("PREREQUISITE_MISSING");
    const noCommitment = await requestMove(s, 2);
    expect(!noCommitment.ok && noCommitment.error.code).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.listFacts().filter((f) => f.owner === "logistics")).toEqual([]);
  });

  it("the Logistics commitment pins the PC's custody record as the moved subject, from the lawful physical custodian (never a fabricated fallback entity)", async () => {
    const s = await custodiedCampaign();
    await must(commitMove(s, 1));
    await must(requestMove(s, 2));
    await must(logisticsCommit(s, 3));
    const c = LogisticsCommitmentSchema.parse(s.logistics.commitment(W, PC)!.fact.value);
    expect(c.moved).toEqual({
      fact_key: custodyKey,
      entity_id: PC,
      version: 1,
      substantive_owner: {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
        basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
      },
    });
    expect(c.request).toMatchObject({ owner: "pc_existence", fact_key: pcMovementRequestKey(PC) });
    expect(c.origin).toEqual(s.campaign.pcPhysicalLocusCustody(PC)!.value.stationary_locus);
    expect(c.destination.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(c.delivery.at).toEqual(LOG_T_DELIVERY);
    expect(c.state).toEqual({ status: "COMMITTED" });
    expect(s.campaign.store.getFact(worldFallbackEntityKey(W, PC))).toBeUndefined();
    // the commitment copies nothing of the PC's identity or intrinsic state
    const json = JSON.stringify(c);
    for (const copied of ["identity_agency", "embodiment", "capability", "stationary_locus"])
      expect(json).not.toContain(copied);
  });
});

describe("exactly one physical-locus authority at every durable cut (acceptance 3)", () => {
  it("through commitment, request, Logistics commitment, dispatch, delivery, destination commit and retirement", async () => {
    const s = await custodiedCampaign();
    const seen: string[] = [];
    const note = () => {
      const w = s.campaign.pcCurrentLocus(PC)!;
      const census = authorityCensus(s);
      // the raw facts name exactly one authority, and the resolver agrees with them
      expect(census.total).toBe(1);
      expect((w.stationary === null) !== (w.movement === null)).toBe(true);
      expect(w.authority === "LOGISTICS").toBe(census.logistics === 1);
      expect(w.authority === "WORLD_STATE").toBe(census.logistics === 0);
      seen.push(`${w.phase}/${w.authority}/delivered=${w.delivery_established}`);
      expect(s.campaign.verify()).toEqual([]);
      return w;
    };
    note(); // custody established
    await must(commitMove(s, 1));
    note();
    await must(requestMove(s, 2));
    note();
    await must(logisticsCommit(s, 3));
    note(); // committed, not dispatched: still the stationary custodian
    await must(logisticsDispatch(s, 4));
    const inTransfer = note();
    expect(inTransfer).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
      stationary: null,
    });
    await registerPcTransfer(s, 5);
    note();

    // (1) the delivery result commits; the destination commit is withheld
    const noTransition = blockingStore(s.campaign.store, isTransitionGroup);
    const c1 = new TemporalCoordinator(noTransition.store, movementProviders());
    expect((await c1.advance(logStopAtBoundaryRequest("tx-pc-move", REQUEST_ID))).ok).toBe(false);
    expect(noTransition.blocked()).toBe(1);
    const delivered = note();
    // Logistics' arrival is NOT destination truth: it is still the movement locus, and the PC is nowhere stationary
    expect(delivered).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
      delivery_established: true,
    });
    expect(s.campaign.store.getFact(worldEntityTransitionKey(W, PC))).toBeUndefined();

    // (2) the destination commit lands; the retirement is withheld — destination commit PRECEDES Logistics retirement
    const noRetire = blockingStore(s.campaign.store, isRetirementGroup);
    const c2 = new TemporalCoordinator(noRetire.store, movementProviders());
    expect((await c2.advance(logStopAtBoundaryRequest("tx-pc-move", REQUEST_ID))).ok).toBe(false);
    expect(noRetire.blocked()).toBe(1);
    const pending = note();
    expect(pending).toMatchObject({
      phase: "DESTINATION_COMMITTED_RETIREMENT_PENDING",
      authority: "WORLD_STATE",
    });
    expect(pending.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
    // Logistics' record is not retired yet: its movement locus has LAPSED with the destination commit and is no rival
    expect(
      LogisticsTransferSchema.parse(s.logistics.transfer(W, PC)!.fact.value).state.status,
    ).toBe("IN_TRANSFER");

    // (3) the same transaction re-presented: the committed stages are adopted and the retirement commits once
    const done = await must(advanceToDelivery(s));
    expect(done.adopted).toHaveLength(2);
    expect(note().phase).toBe("DESTINATION_COMMITTED");
    expect(seen).toEqual([
      "STATIONARY_AT_ORIGIN/WORLD_STATE/delivered=false",
      "STATIONARY_AT_ORIGIN/WORLD_STATE/delivered=false",
      "STATIONARY_AT_ORIGIN/WORLD_STATE/delivered=false",
      "STATIONARY_AT_ORIGIN/WORLD_STATE/delivered=false",
      "IN_TRANSFER/LOGISTICS/delivered=false",
      "IN_TRANSFER/LOGISTICS/delivered=false",
      "IN_TRANSFER/LOGISTICS/delivered=true",
      "DESTINATION_COMMITTED_RETIREMENT_PENDING/WORLD_STATE/delivered=true",
      "DESTINATION_COMMITTED/WORLD_STATE/delivered=true",
    ]);
  });

  it("at dispatch the stationary custodian yields to Logistics: the origin custody is predecessor provenance only, byte-identical, and answers no current locus", async () => {
    const s = await custodiedCampaign();
    const custodyBefore = structuredClone(s.campaign.store.getFact(custodyKey)!);
    await must(commitMove(s, 1));
    await must(requestMove(s, 2));
    await must(logisticsCommit(s, 3));
    expect(s.campaign.pcCurrentLocus(PC)!.authority).toBe("WORLD_STATE");
    await must(logisticsDispatch(s, 4));
    const w = s.campaign.pcCurrentLocus(PC)!;
    expect(w.authority).toBe("LOGISTICS");
    expect(w.stationary).toBeNull();
    expect(w.movement!.from.locus.entity_id).toBe(ORIGIN);
    expect(w.movement!.to.locus.entity_id).toBe(DEST_LOCUS_ID);
    // the sealed origin record is untouched; it is the "from" of the movement, not a competing current location
    expect(s.campaign.store.getFact(custodyKey)).toEqual(custodyBefore);
    expect(s.campaign.pcPhysicalLocusCustody(PC)!.value.stationary_locus.locus.entity_id).toBe(
      ORIGIN,
    );
  });
});

describe("destination commit precedes Logistics retirement; delivery is distinct from dispatch (acceptance 4)", () => {
  it("the stage order is delivery → destination commit → retirement, each credited by the transaction, in revision order", async () => {
    const s = await custodiedCampaign();
    await commitRequestDispatchRegister(s);
    const r = await must(advanceToDelivery(s));
    const stages = [
      logisticsDeliveryStage(REQUEST_ID),
      entityTransitionStage(`delivery:${REQUEST_ID}`),
      logisticsRetirementStage(REQUEST_ID),
    ];
    const revisions = stages.map((st) => {
      const receipt = s.campaign.store.lookupReceipt(stageIntentId(st));
      expect(receipt).not.toBeNull();
      return receipt!.revision;
    });
    expect(r.transaction.stages).toHaveLength(3);
    expect([...revisions].sort((a, b) => a - b)).toEqual(revisions);
    // retirement pins the destination commit, and its transfer carries that very pin
    const t = LogisticsTransferSchema.parse(s.logistics.transfer(W, PC)!.fact.value);
    expect(t.state.status === "RETIRED" && t.state.destination_commit).toEqual({
      fact_key: worldEntityTransitionKey(W, PC),
      version: 1,
    });
  });

  it("Logistics completion alone does not assert destination truth: the delivery result names where, never that the PC IS there", async () => {
    const s = await custodiedCampaign();
    await commitRequestDispatchRegister(s);
    const noTransition = blockingStore(s.campaign.store, isTransitionGroup);
    const c1 = new TemporalCoordinator(noTransition.store, movementProviders());
    await c1.advance(logStopAtBoundaryRequest("tx-pc-move", REQUEST_ID));
    const delivery = s.logistics.delivery(W, PC)!;
    expect(delivery.value.outcome).toEqual({
      kind: "SAME_ENTITY_LOCUS_CHANGE_REQUIRED",
      destination: s.logistics.commitment(W, PC)!.value.destination,
    });
    expect(delivery.value.subject).toEqual({ fact_key: custodyKey, entity_id: PC });
    expect(s.campaign.pcCurrentLocus(PC)!.authority).toBe("LOGISTICS");
    expect(s.logistics.transfer(W, PC)!.fact.version).toBe(1);
  });
});

describe("existing Role Registry and coupling records remain unchanged (acceptance 5)", () => {
  it("the binding, the consumed coupling, the existence contract and the origin custody are byte-for-byte unchanged across the whole journey, and the binding's referent is never current truth", async () => {
    const s = await custodiedCampaign();
    const before = snapshotFacts(s);
    const binding = s.campaign.binding()!;
    await commitRequestDispatchRegister(s);
    await must(advanceToDelivery(s));
    for (const k of protectedKeys) expect(s.campaign.store.getFact(k)).toEqual(before.get(k));
    expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!.version).toBe(1);
    expect(s.campaign.binding()).toEqual(binding);
    // Role Registry = origin while the physical owner = destination: harmless, because the binding is not read as current truth
    expect(s.campaign.binding()!.value.coupling.locus.entity_id).toBe(ORIGIN);
    expect(s.campaign.pcCurrentLocus(PC)!.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
    // no Role Registry or Insertion write happened at all: the journal gained no role_registry fact
    const after = snapshotFacts(s);
    const changed = [...after.keys()].filter(
      (k) => !before.has(k) || before.get(k)!.version !== after.get(k)!.version,
    );
    expect(changed.some((k) => k.startsWith("role-registry/"))).toBe(false);
    expect(changed.some((k) => k.startsWith("world-state/actor/"))).toBe(false);
    expect(changed.some((k) => k.startsWith("pc/") && k.endsWith("existence-contract"))).toBe(
      false,
    );
  });
});

describe("an explicit delivery boundary is required and none is invented (acceptance 6)", () => {
  it("Logistics refuses a commitment with no declared boundary, and one that is not after the commitment", async () => {
    const s = await custodiedCampaign();
    await must(commitMove(s, 1));
    await must(requestMove(s, 2));
    const missing = await s.logistics.commitMovement({
      group_id: "log-group-1",
      intent_id: "log-intent-1",
      cause: "log-cause-1",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      commit: { request_key: pcMovementRequestKey(PC) },
    });
    expect(!missing.ok && missing.error.code).toBe("INPUT_INVALID");
    const early = await logisticsCommit(s, 2, { unit: LOG_T_DELIVERY.unit, value: 100 });
    expect(early.ok).toBe(false);
    expect(s.campaign.store.listFacts().filter((f) => f.owner === "logistics")).toEqual([]);
  });

  it("the declared boundary is the one earned boundary: the PC is delivered exactly there, with no route, duration or default anywhere", async () => {
    const s = await custodiedCampaign();
    await commitRequestDispatchRegister(s);
    const c = LogisticsCommitmentSchema.parse(s.logistics.commitment(W, PC)!.fact.value);
    expect(c.delivery.at).toEqual(LOG_T_DELIVERY);
    const object = s.coordinator.object(`obj-logistics-${REQUEST_ID}`)!;
    expect(object.value.next_boundary!.at).toEqual(LOG_T_DELIVERY);
    await must(advanceToDelivery(s));
    const delivery = s.logistics.delivery(W, PC)!.value;
    expect(delivery.timing).toEqual({ established_at: LOG_T_DELIVERY, occurs_at: LOG_T_DELIVERY });
    const transition = EntityTransitionCloseSchema.parse(
      s.campaign.store.getFact(worldEntityTransitionKey(W, PC))!.value,
    );
    expect(transition.closed_at).toEqual(LOG_T_DELIVERY);
    for (const key of [
      pcMovementCommitmentKey(PC),
      pcMovementRequestKey(PC),
      logisticsCommitmentKey(W, PC),
      logisticsTransferKey(W, PC),
      logisticsDeliveryKey(W, PC),
    ]) {
      const json = JSON.stringify(s.campaign.store.getFact(key)!.value);
      for (const word of ["route", "duration", "speed", "distance", "path"])
        expect(json).not.toContain(word);
    }
  });
});
