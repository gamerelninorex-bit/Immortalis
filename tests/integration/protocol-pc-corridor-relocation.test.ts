/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign store to simulate a refusing Temporal kernel and a drifted source */
// Corridor-qualified confirmed active-PC single-leg relocation gateway — the real path over the real owners. A separately opt-in trusted
// context binds the confirmed choice, the exact World-State corridor the variant requires and the declared delivery boundary; the one
// allowlisted operation checks that corridor read-only BEFORE any PC-side write, then drives the EXISTING PC commitment → PC-owned
// request → source-qualified Logistics commitment → dispatch chain to lawful in-transfer custody, registers that SAME transfer's one
// Temporal object, once, and nothing further. Arrival remains the existing Temporal → Logistics delivery → World-State destination →
// retirement machinery. Mechanism only: the corridor supplies no duration, access or arrival, and the original PC is not moved.
// Register lineage: IA-01/02/03/04/06/14/18/19/20/28 (partial, no status change); RC-02/04/07/10/13/15/16; IM-02/03/05/07/11/12/15/16/17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHOICE_AUTHORITY,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  PcMovementCommitmentSchema,
  TEMPORAL_STATE_KEY,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  pcMovementCommitmentKey,
  pcMovementRequestKey,
  worldEntityTransitionKey,
  worldCorridorKey,
  worldFallbackEntityKey,
  worldProfileKey,
} from "@immortalis/contracts";
import { logisticsTemporalObject } from "@immortalis/engine";
import {
  bindTrustedConfirmedPcCorridorRelocationContext,
  commitConfirmedPcCorridorRelocation,
} from "@immortalis/protocol";
import {
  ACTOR_OTHER,
  LOG_T_DELIVERY,
  fixtureDestinationLocus,
  logPublication,
} from "@immortalis/testkit";
import { at } from "../support/gip-sunset.ts";
import { PC_ID, originalSunsetCampaign } from "../support/original-pc-target.ts";
import { handedOverCampaign } from "../support/pc-locus-custody.ts";
import { corridorInput, establishCorridor } from "../support/logistics-corridor.ts";
import {
  PC,
  REQUEST_ID,
  advanceToDelivery,
  authorityCensus,
  commitMove,
  custodiedCampaign,
  logisticsCommit,
  logisticsDispatch,
  movementSummary,
  mvPublication,
  registerPcTransfer,
  reopenMovement,
  requestMove,
  snapshotFacts,
  type PcMoveSeeded,
} from "../support/pc-movement.ts";
import {
  CORRIDOR_KEY,
  CORRIDOR_REQUEST,
  DEST_LOCUS_ID,
  ORIGIN,
  OTHER_DEST,
  W,
  corridorCampaign,
  driftFact,
  establishOtherLocus,
  relocateViaCorridor,
  trustedCorridorRelocation,
} from "../support/protocol-corridor-relocation.ts";
import {
  RELOCATION_KEYS,
  RELOCATION_TEMPORAL_KEYS,
  RELOCATION_TEMPORAL_OBJECT_KEY,
  confirmedChoice,
  crashBefore,
  loseReplyAfter,
  relocate,
  trustedRelocation,
} from "../support/protocol-relocation.ts";
import { RELOCATION_REFUSAL } from "../support/protocol.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const COMMITTED = { ok: true, value: { status: "RELOCATION_COMMITTED" } };
const REFUSED = JSON.parse(RELOCATION_REFUSAL);
const UNKNOWN = { ok: false, error: { code: "RELOCATION_OUTCOME_UNKNOWN" } };

/** the attempt changes nothing at all: head, every fact, every receipt */
const unchanged = async (s: PcMoveSeeded, attempt: () => Promise<unknown>): Promise<unknown> => {
  const before = movementSummary(s);
  const r = await attempt();
  expect(movementSummary(s)).toEqual(before);
  return r;
};

/** the PC's one-time slot is untouched: no commitment, request, Logistics or Temporal fact of the journey exists */
const slotUnconsumed = (s: PcMoveSeeded) => {
  expect(
    [...RELOCATION_KEYS, ...RELOCATION_TEMPORAL_KEYS].filter((k) => s.campaign.store.getFact(k)),
  ).toEqual([]);
  expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "STATIONARY_AT_ORIGIN" });
};

describe("acceptance 1: a confirmed post-handover PC, a source-owned A→B corridor and a declared boundary lawfully start exactly the existing single-leg transfer", () => {
  it("commits the PC commitment and request, the SOURCE-QUALIFIED Logistics commitment and dispatch, then the transfer's one Temporal object: in transfer, one authority, no time advanced", async () => {
    const s = await corridorCampaign();
    const before = snapshotFacts(s);
    const clock = s.campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    const corridor = s.campaign.corridor(W, ORIGIN, DEST_LOCUS_ID)!;

    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);

    // exactly the four existing facts, the one object and its boundary index were added; nothing that existed (the corridor included) changed
    const after = snapshotFacts(s);
    expect([...after.keys()].filter((k) => !before.has(k)).sort()).toEqual(
      [...RELOCATION_KEYS, ...RELOCATION_TEMPORAL_KEYS].sort(),
    );
    for (const [k, f] of before) expect(after.get(k), k).toEqual(f);
    expect(s.campaign.corridor(W, ORIGIN, DEST_LOCUS_ID)).toEqual(corridor);

    // the PC-side facts are the existing owner's, willingness only: no corridor, route or time is in them
    expect(
      PcMovementCommitmentSchema.parse(
        s.campaign.store.getFact(pcMovementCommitmentKey(PC))!.value,
      ),
    ).toMatchObject({
      pc_id: PC,
      authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
      intent: { kind: "VOLUNTARY_RELOCATION" },
    });
    for (const k of RELOCATION_KEYS.slice(0, 2))
      expect(JSON.stringify(s.campaign.store.getFact(k)!.value), k).not.toMatch(
        /corridor|route|path|duration|speed|arriv|success/,
      );

    // Logistics' commitment is the source-qualified one: the exact corridor version it read, pinned; the boundary is the declared one
    const c = LogisticsCommitmentSchema.parse(s.logistics.commitment(W, PC)!.fact.value);
    expect(c.corridor).toEqual({ owner: "world_state", fact_key: CORRIDOR_KEY, version: 1 });
    expect(c.origin.locus.entity_id).toBe(ORIGIN);
    expect(c.destination.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(c.delivery.at).toEqual(LOG_T_DELIVERY);
    // the group read the exact pinned corridor and the PC's origin locus, and depended on the group that committed the corridor
    const group = s.campaign.store.committedGroup("pc-corridor-relocation-intent:movement:" + PC)!;
    expect(group.reads).toContainEqual({ key: CORRIDOR_KEY, version: 1 });
    expect(group.reads.map((r) => r.key)).toContain(c.origin.locus.fact_key);
    expect(group.depends_on).toContain(corridor.fact.provenance.group_id);

    // Logistics alone holds the in-transfer locus
    const t = LogisticsTransferSchema.parse(s.logistics.transfer(W, PC)!.fact.value);
    expect(t.state.status).toBe("IN_TRANSFER");
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
    });
    expect(authorityCensus(s)).toMatchObject({ stationary: 0, logistics: 1, total: 1 });

    // the one registered object is exactly the one the existing helper derives, at the declared boundary only
    expect(s.coordinator.object(`obj-logistics-${REQUEST_ID}`)!.value).toEqual(
      logisticsTemporalObject(c, t),
    );
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(1);
    // no time advanced, no stage resolved, no delivery, destination or fallback entity
    expect(s.campaign.store.getFact(TEMPORAL_STATE_KEY)).toEqual(clock);
    expect(s.campaign.store.getFact(logisticsDeliveryKey(W, PC))).toBeUndefined();
    expect(s.campaign.store.getFact(worldEntityTransitionKey(W, PC))).toBeUndefined();
    expect(s.campaign.store.getFact(worldFallbackEntityKey(W, PC))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the existing Temporal delivery, World-State destination commit and Logistics retirement then complete by their normal machinery, with the corridor pin kept", async () => {
    const s = await corridorCampaign();
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
    await must(advanceToDelivery(s));
    const where = s.campaign.pcCurrentLocus(PC)!;
    expect(where).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
      movement: null,
    });
    expect(where.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(where.origin.locus.entity_id).toBe(ORIGIN);
    expect(authorityCensus(s)).toMatchObject({ total: 1, destination: 1 });
    // retirement released the same commitment, whose source pin is untouched history
    const released = LogisticsCommitmentSchema.parse(s.logistics.commitment(W, PC)!.fact.value);
    expect(released.state.status).toBe("RELEASED");
    expect(released.corridor).toEqual({ owner: "world_state", fact_key: CORRIDOR_KEY, version: 1 });
    expect(s.logistics.transfer(W, PC)!.value.state.status).toBe("RETIRED");
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the corridor supplies no boundary: the commitment is at whatever boundary the trusted side declared, and the journey is otherwise identical", async () => {
    const later = { unit: LOG_T_DELIVERY.unit, value: LOG_T_DELIVERY.value + 137 };
    const a = await corridorCampaign();
    const b = await corridorCampaign();
    expect(await relocateViaCorridor(trustedCorridorRelocation(a))).toEqual(COMMITTED);
    expect(await relocateViaCorridor(trustedCorridorRelocation(b, { delivery_at: later }))).toEqual(
      COMMITTED,
    );
    expect(a.logistics.commitment(W, PC)!.value.delivery.at).toEqual(LOG_T_DELIVERY);
    expect(b.logistics.commitment(W, PC)!.value.delivery.at).toEqual(later);
  });

  it("the host's invocation alone never advances time or arrives, however often it is repeated", async () => {
    const s = await corridorCampaign();
    const ctx = trustedCorridorRelocation(s);
    for (let i = 0; i < 3; i++) expect(await relocateViaCorridor(ctx)).toEqual(COMMITTED);
    expect(s.campaign.pcCurrentLocus(PC)!.phase).toBe("IN_TRANSFER");
    expect(authorityCensus(s).total).toBe(1);
  });

  it("save → close → reopen conserves one physical locus owner, the corridor's source provenance and the same receipts; a retry writes nothing and arrival still completes", async () => {
    const dir = tempDir();
    const s = await corridorCampaign(dir);
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
    const summary = movementSummary(s);
    await s.campaign.close();
    const reopened = await reopenMovement(dir);
    expect(reopened.campaign.verify()).toEqual([]);
    expect(reopened.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
    });
    expect(authorityCensus(reopened)).toMatchObject({ logistics: 1, total: 1 });
    expect(reopened.logistics.commitment(W, PC)!.value.corridor).toEqual({
      owner: "world_state",
      fact_key: CORRIDOR_KEY,
      version: 1,
    });
    expect(movementSummary(reopened)).toEqual(summary);
    expect(
      await unchanged(reopened, () => relocateViaCorridor(trustedCorridorRelocation(reopened))),
    ).toEqual(COMMITTED);
    await must(advanceToDelivery(reopened));
    expect(reopened.campaign.pcCurrentLocus(PC)!.phase).toBe("DESTINATION_COMMITTED");
    // a replay after arrival is still the same status and writes nothing
    expect(
      await unchanged(reopened, () => relocateViaCorridor(trustedCorridorRelocation(reopened))),
    ).toEqual(COMMITTED);
    expect(reopened.campaign.verify()).toEqual([]);
    await reopened.campaign.close();
  });

  it("the gateway's journey equals the existing owner-path journey (PC → source-qualified Logistics → dispatch → registration) fact for fact", async () => {
    const viaGateway = await corridorCampaign();
    expect(await relocateViaCorridor(trustedCorridorRelocation(viaGateway))).toEqual(COMMITTED);
    const manual = await corridorCampaign();
    await must(commitMove(manual, 1));
    await must(requestMove(manual, 2));
    await must(
      manual.logistics.commitCorridorMovement({
        ...logPublication(3),
        commit: {
          request_key: pcMovementRequestKey(PC),
          corridor_key: CORRIDOR_KEY,
          delivery_at: LOG_T_DELIVERY,
        },
      }),
    );
    await must(logisticsDispatch(manual, 4));
    await registerPcTransfer(manual, 5);
    const values = (s: PcMoveSeeded) =>
      Object.fromEntries(
        [...RELOCATION_KEYS, ...RELOCATION_TEMPORAL_KEYS].map((k) => {
          const f = s.campaign.store.getFact(k)!;
          return [k, { owner: f.owner, facet: f.facet, version: f.version, value: f.value }];
        }),
      );
    expect(values(viaGateway)).toEqual(values(manual));
  });
});

describe("acceptance 2: a missing, wrong or untrusted corridor, or any other known-invalid source, is refused BEFORE any PC commitment or request, with no write", () => {
  it("no A→B corridor: refused with nothing written and the PC's one-time slot unconsumed; the corridor authored only AFTER the refused attempt then serves a later attempt", async () => {
    const s = await custodiedCampaign();
    expect(await unchanged(s, () => relocateViaCorridor(trustedCorridorRelocation(s)))).toEqual(
      REFUSED,
    );
    slotUnconsumed(s);
    // the attempt did not consume the slot, and it is not remembered: once the source independently exists, the same choice commits
    await establishCorridor(s, 1, corridorInput(ORIGIN, DEST_LOCUS_ID));
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
    expect(
      LogisticsCommitmentSchema.parse(s.logistics.commitment(W, PC)!.fact.value).corridor,
    ).toMatchObject({ fact_key: CORRIDOR_KEY, version: 1 });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("only the REVERSE corridor B→A exists: refused with no write", async () => {
    const s = await custodiedCampaign();
    await establishCorridor(s, 1, corridorInput(DEST_LOCUS_ID, ORIGIN));
    expect(await unchanged(s, () => relocateViaCorridor(trustedCorridorRelocation(s)))).toEqual(
      REFUSED,
    );
    expect(
      await unchanged(s, () =>
        relocateViaCorridor(
          trustedCorridorRelocation(s, { corridor_key: corridorKeyOfPair(DEST_LOCUS_ID, ORIGIN) }),
        ),
      ),
    ).toEqual(REFUSED);
    slotUnconsumed(s);
  });

  it("a corridor of other endpoints (not from the PC's origin, or not to the confirmed destination) is refused with no write", async () => {
    const s = await custodiedCampaign();
    await establishOtherLocus(s);
    // OTHER→DEST exists (wrong origin) and ORIGIN→OTHER exists (wrong destination), but ORIGIN→DEST does not
    await establishCorridor(s, 1, corridorInput(OTHER_DEST, DEST_LOCUS_ID));
    await establishCorridor(s, 2, corridorInput(ORIGIN, OTHER_DEST));
    for (const over of [
      {},
      { corridor_key: corridorKeyOfPair(OTHER_DEST, DEST_LOCUS_ID) },
      { corridor_key: corridorKeyOfPair(ORIGIN, OTHER_DEST) },
    ])
      expect(
        await unchanged(s, () => relocateViaCorridor(trustedCorridorRelocation(s, over))),
        JSON.stringify(over),
      ).toEqual(REFUSED);
    slotUnconsumed(s);
  });

  it("a binding that does not name the corridor the committed facts derive is refused even when the named corridor exists, and a wrong world is refused", async () => {
    const s = await corridorCampaign();
    await establishOtherLocus(s);
    await establishCorridor(s, 2, corridorInput(ORIGIN, OTHER_DEST));
    for (const over of [
      // a real, committed corridor — of another connection than the confirmed choice
      { corridor_key: corridorKeyOfPair(ORIGIN, OTHER_DEST) },
      // the right corridor stated for another world
      { corridor_key: CORRIDOR_KEY.replace(W, "world-nowhere") },
      { choice: confirmedChoice({ world_id: "world-nowhere" }) },
      { choice: confirmedChoice({ locus_id: OTHER_DEST }) },
      // the choice and the corridor agree with each other but not with the PC's stationary custody origin
      { choice: confirmedChoice({ locus_id: ORIGIN }) },
    ])
      expect(
        await unchanged(s, () => relocateViaCorridor(trustedCorridorRelocation(s, over))),
        JSON.stringify(over),
      ).toEqual(REFUSED);
    slotUnconsumed(s);
    // the lawful pair still commits afterwards: nothing was spent
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
  });

  it("a source whose owner, endpoints or world differ from the connection the facts derive (a foreign-owner, stale or substituted corridor) is refused with no write", async () => {
    const edits: readonly [string, (f: any) => any][] = [
      ["foreign owner", (f) => ({ ...f, owner: "logistics" })],
      ["another destination", (f) => ({ ...f, value: { ...f.value, to: f.value.from } })],
      ["another origin", (f) => ({ ...f, value: { ...f.value, from: f.value.to } })],
      [
        "another world",
        (f) => ({
          ...f,
          value: { ...f.value, world: { ...f.value.world, entity_id: "world-nowhere" } },
        }),
      ],
      ["a malformed value", (f) => ({ ...f, value: { statement: "no ends" } })],
    ];
    for (const [name, edit] of edits) {
      const s = await corridorCampaign();
      const drift = driftFact(s, CORRIDOR_KEY, edit);
      const before = movementSummary(s);
      expect(await relocateViaCorridor(trustedCorridorRelocation(s)), name).toEqual(REFUSED);
      expect(drift.commits, name).toEqual([]);
      drift.restore();
      expect(movementSummary(s), name).toEqual(before);
      slotUnconsumed(s);
    }
  });

  it("an untrusted or incomplete binding is inert: wrong role/permission, no authority, no corridor, no boundary, no publication material", async () => {
    const s = await corridorCampaign();
    const inert = [
      {
        choice: confirmedChoice({
          authored_under: { role: "role.archivist", permission: "permission.canon.write" },
        }),
      },
      {
        choice: confirmedChoice({
          authored_under: { role: "role.player", permission: "permission.canon.write" },
        }),
      },
      { choice: confirmedChoice({ authored_under: undefined }) },
      { choice: { ...confirmedChoice(), confirmed: true } },
      { choice: { ...confirmedChoice(), corridor_key: CORRIDOR_KEY } },
      { choice: undefined },
      { corridor_key: undefined },
      { corridor_key: "" },
      { corridor_key: 7 },
      { corridor_key: { key: CORRIDOR_KEY } },
      { delivery_at: undefined },
      { delivery_at: { unit: "t" } },
      { publication: undefined },
      { publication: { cause: "c" } },
    ];
    for (const over of inert)
      expect(
        await unchanged(s, () => relocateViaCorridor(trustedCorridorRelocation(s, over))),
        JSON.stringify(over),
      ).toEqual(REFUSED);
    slotUnconsumed(s);
  });

  it("a malformed, over-claiming or unallowlisted host request — including a host-supplied corridor, route or world — and a forged context change nothing", async () => {
    const s = await corridorCampaign();
    const ctx = trustedCorridorRelocation(s);
    for (const request of [
      undefined,
      {},
      CORRIDOR_REQUEST({ confirmed: true }),
      CORRIDOR_REQUEST({ corridor: CORRIDOR_KEY }),
      CORRIDOR_REQUEST({ corridor_key: CORRIDOR_KEY }),
      CORRIDOR_REQUEST({ corridor_key: "world/world-fixture-1/corridor/x/y" }),
      CORRIDOR_REQUEST({ route: [ORIGIN, DEST_LOCUS_ID] }),
      CORRIDOR_REQUEST({ world_id: "world-nowhere" }),
      CORRIDOR_REQUEST({ pc_id: ACTOR_OTHER }),
      CORRIDOR_REQUEST({ delivery_at: { unit: "t", value: 9999 } }),
      { operation: "commit_confirmed_pc_relocation" },
      { operation: "commitCorridorMovement" },
    ])
      expect(
        await unchanged(s, () => relocateViaCorridor(ctx, request)),
        JSON.stringify(request),
      ).toEqual(REFUSED);
    for (const forged of [{}, { ...ctx }, undefined, "ctx"])
      expect(await unchanged(s, () => relocateViaCorridor(forged as never))).toEqual(REFUSED);
    slotUnconsumed(s);
  });

  it("a context bound for one gateway is inert for the other: the opt-in is strict in both directions", async () => {
    const s = await corridorCampaign();
    const plain = trustedRelocation(s);
    const qualified = trustedCorridorRelocation(s);
    expect(await unchanged(s, () => relocateViaCorridor(plain as never))).toEqual(REFUSED);
    expect(await unchanged(s, () => relocate(qualified as never))).toEqual(REFUSED);
    expect(
      await unchanged(s, () =>
        relocateViaCorridor(qualified, { operation: "commit_confirmed_pc_relocation" }),
      ),
    ).toEqual(REFUSED);
    slotUnconsumed(s);
  });

  it("a wrong, inactive or unprepared PC and an unestablished destination are the one refusal and write nothing", async () => {
    const s = await corridorCampaign();
    for (const choice of [
      confirmedChoice({ pc_id: ACTOR_OTHER }),
      confirmedChoice({ pc_id: "actor-nobody" }),
      confirmedChoice({ locus_id: "locus-nowhere" }),
    ])
      expect(
        await unchanged(s, () => relocateViaCorridor(trustedCorridorRelocation(s, { choice }))),
        JSON.stringify(choice),
      ).toEqual(REFUSED);
    // a handed-over PC whose stationary custody was never established, even though a corridor is committed
    const handed = await handedOverCampaign();
    await must(
      handed.campaign.establishLocus({ ...mvPublication(900), locus: fixtureDestinationLocus() }),
    );
    await establishCorridor(handed as never, 1, corridorInput(ORIGIN, DEST_LOCUS_ID));
    expect(
      await unchanged(handed as never, () =>
        relocateViaCorridor(trustedCorridorRelocation(handed)),
      ),
    ).toEqual(REFUSED);
  });

  it("a missing or ill-ordered declared boundary is refused before any PC write: the slot is not consumed, and a lawful boundary then commits", async () => {
    const s = await corridorCampaign();
    const now = s.coordinator.state()!.value.canonical_time;
    for (const delivery_at of [
      now, // not strictly after the canonical basis
      { unit: now.unit, value: now.value - 1 },
      { unit: now.unit, value: 1 },
      { unit: `${now.unit}-other`, value: now.value + 100 }, // another unit: not comparable
      undefined,
    ])
      expect(
        await unchanged(s, () =>
          relocateViaCorridor(trustedCorridorRelocation(s, { delivery_at })),
        ),
        JSON.stringify(delivery_at),
      ).toEqual(REFUSED);
    slotUnconsumed(s);
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an already-occupied one-time PC slot, however it was made, refuses the gateway with no write", async () => {
    // an existing PC commitment made outside the gateway
    const a = await corridorCampaign();
    await must(commitMove(a, 1));
    expect(await unchanged(a, () => relocateViaCorridor(trustedCorridorRelocation(a)))).toEqual(
      REFUSED,
    );
    // an existing commitment and request
    const b = await corridorCampaign();
    await must(commitMove(b, 1));
    await must(requestMove(b, 2));
    expect(await unchanged(b, () => relocateViaCorridor(trustedCorridorRelocation(b)))).toEqual(
      REFUSED,
    );
  });

  it("a competing locus claim — a route-less transfer made by any other path — refuses the gateway with no write, and the route-less commitment is never upgraded", async () => {
    // a route-less Logistics commitment (not dispatched) over the PC's own request
    const a = await corridorCampaign();
    await must(commitMove(a, 1));
    await must(requestMove(a, 2));
    await must(logisticsCommit(a, 3));
    expect(await unchanged(a, () => relocateViaCorridor(trustedCorridorRelocation(a)))).toEqual(
      REFUSED,
    );
    expect(a.logistics.commitment(W, PC)!.value.corridor).toBeUndefined();
    // a route-less dispatched transfer
    const b = await corridorCampaign();
    await must(commitMove(b, 1));
    await must(requestMove(b, 2));
    await must(logisticsCommit(b, 3));
    await must(logisticsDispatch(b, 4));
    expect(await unchanged(b, () => relocateViaCorridor(trustedCorridorRelocation(b)))).toEqual(
      REFUSED,
    );
    // the sibling gateway's own route-less journey: finished, in transfer and after arrival
    const c = await corridorCampaign();
    expect(await relocate(trustedRelocation(c))).toEqual(COMMITTED);
    expect(await unchanged(c, () => relocateViaCorridor(trustedCorridorRelocation(c)))).toEqual(
      REFUSED,
    );
    await must(advanceToDelivery(c));
    expect(await unchanged(c, () => relocateViaCorridor(trustedCorridorRelocation(c)))).toEqual(
      REFUSED,
    );
    expect(c.logistics.commitment(W, PC)!.value.corridor).toBeUndefined();
    // a rival destination commit or transfer for the PC with a fresh PC slot cannot exist; a stray Logistics slot is still refused
    expect(c.campaign.verify()).toEqual([]);
  });

  it("a second journey after the gateway's own — to the same or another destination, or back — is refused with no write, before and after arrival", async () => {
    const s = await corridorCampaign();
    await establishOtherLocus(s);
    await establishCorridor(s, 2, corridorInput(ORIGIN, OTHER_DEST));
    await establishCorridor(s, 3, corridorInput(DEST_LOCUS_ID, ORIGIN));
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
    const second = [
      trustedCorridorRelocation(s, {
        choice: confirmedChoice({ locus_id: OTHER_DEST }),
        corridor_key: corridorKeyOfPair(ORIGIN, OTHER_DEST),
      }),
      // the way back, with the reverse corridor lawfully committed
      trustedCorridorRelocation(s, {
        choice: confirmedChoice({ locus_id: ORIGIN }),
        corridor_key: corridorKeyOfPair(DEST_LOCUS_ID, ORIGIN),
      }),
    ];
    for (const ctx of second)
      expect(await unchanged(s, () => relocateViaCorridor(ctx))).toEqual(REFUSED);
    await must(advanceToDelivery(s));
    for (const ctx of second)
      expect(await unchanged(s, () => relocateViaCorridor(ctx))).toEqual(REFUSED);
    // the same journey presented again is the same committed journey, nothing more
    expect(await unchanged(s, () => relocateViaCorridor(trustedCorridorRelocation(s)))).toEqual(
      COMMITTED,
    );
    expect(authorityCensus(s)).toMatchObject({ destination: 1, total: 1 });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("two campaigns with colliding PC, world, locus and group identities never cross: a context reaches only the campaign it was bound to", async () => {
    const a = await corridorCampaign();
    const b = await corridorCampaign();
    const bBefore = movementSummary(b);
    const ctxA = trustedCorridorRelocation(a);
    expect(await relocateViaCorridor(ctxA)).toEqual(COMMITTED);
    expect(movementSummary(b)).toEqual(bBefore);
    expect(await relocateViaCorridor(ctxA)).toEqual(COMMITTED);
    expect(movementSummary(b)).toEqual(bBefore);
    expect(await relocateViaCorridor(trustedCorridorRelocation(b))).toEqual(COMMITTED);
    expect(b.campaign.store.head().state_sha256).toBe(a.campaign.store.head().state_sha256);
  });
});

describe("acceptance 3: the original activation PC is not moved: its admission stays closed, with no write", () => {
  it("an original-activation PC (custody established from the I-002 activation, not a handover) is refused by the owners and nothing is written", async () => {
    const s = await originalSunsetCampaign(at(5000));
    const world = "world-ashfall";
    const from = "locus-salt-pans";
    const to = "locus-elsewhere";
    const publication = (n: string) => ({
      group_id: `orig-${n}-group`,
      intent_id: `orig-${n}-intent`,
      cause: `orig-${n}-cause`,
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
    });
    await must(
      s.campaign.establishLocus({
        ...publication("locus"),
        locus: {
          ...fixtureDestinationLocus(to),
          world: { fact_key: worldProfileKey(world), entity_id: world },
        },
      }),
    );
    await must(
      s.campaign.establishCorridor({
        ...publication("corridor"),
        corridor: {
          world_id: world,
          from_locus_id: from,
          to_locus_id: to,
          statement: "a test path",
        },
      }),
    );
    const before = movementSummary(s as never);
    const r = await commitConfirmedPcCorridorRelocation(
      bindTrustedConfirmedPcCorridorRelocationContext({
        campaign: s.campaign,
        choice: {
          pc_id: PC_ID,
          destination: { world_id: world, locus_id: to },
          authored_under: { ...PLAYER_CHOICE_AUTHORITY },
        },
        corridor_key: worldCorridorKey(world, from, to),
        delivery_at: at(200),
        publication: { cause: "c", basis: "b", secrecy: "s" },
      }),
      CORRIDOR_REQUEST(),
    );
    expect(r).toEqual(REFUSED);
    expect(movementSummary(s as never)).toEqual(before);
    expect(s.campaign.store.getFact(pcMovementCommitmentKey(PC_ID))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  }, 180_000);
});

describe("acceptance 4: the sibling route-less gateway is unchanged, in a world that holds corridors as in one that holds none", () => {
  it("a corridor in the world neither helps nor hinders it: the route-less journey has no corridor pin and equals the journey of a corridor-free world", async () => {
    const withCorridor = await corridorCampaign();
    expect(await relocate(trustedRelocation(withCorridor))).toEqual(COMMITTED);
    const without = await custodiedCampaign();
    expect(await relocate(trustedRelocation(without))).toEqual(COMMITTED);
    const values = (s: PcMoveSeeded) =>
      Object.fromEntries(
        [...RELOCATION_KEYS, ...RELOCATION_TEMPORAL_KEYS].map((k) => {
          const f = s.campaign.store.getFact(k)!;
          return [k, { owner: f.owner, facet: f.facet, version: f.version, value: f.value }];
        }),
      );
    expect(values(withCorridor)).toEqual(values(without));
    const raw = withCorridor.campaign.store.getFact(logisticsCommitmentKey(W, PC))!;
    expect(Object.keys(raw.value as object)).not.toContain("corridor");
    expect(JSON.stringify(raw.value)).not.toContain("corridor");
    expect(authorityCensus(withCorridor)).toEqual(authorityCensus(without));
    expect(withCorridor.campaign.verify()).toEqual([]);
  });

  it("the sibling gateway cannot be used after the corridor gateway: no route-less rival commitment, extra debit, journey or arrival", async () => {
    const s = await corridorCampaign();
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
    expect(await unchanged(s, () => relocate(trustedRelocation(s)))).toEqual(REFUSED);
    expect(s.logistics.commitment(W, PC)!.value.corridor).toMatchObject({ fact_key: CORRIDOR_KEY });
    expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
  });
});

describe("acceptance 5: retry, duplicate calls, lost replies and crashes reconcile by canonical identity; the only status of an unknown outcome is the indeterminate one", () => {
  const reference = async () => {
    const s = await corridorCampaign();
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
    const summary = movementSummary(s);
    await s.campaign.close();
    return summary;
  };

  it("the uninterrupted gateway run is reproducible: two campaigns reach byte-identical canonical state", async () => {
    const a = await reference();
    const b = await reference();
    expect(a.head.state_sha256).toBe(b.head.state_sha256);
  });

  for (const step of [0, 1, 2, 3, 4]) {
    const name = [
      "PC commitment",
      "PC request",
      "source-qualified Logistics commitment",
      "Logistics dispatch",
      "Temporal registration",
    ][step]!;

    it(`a crash before the ${name} commits is unknown, leaves only the earlier steps, and the same request converges on the uninterrupted run`, async () => {
      const ref = await reference();
      const s = await corridorCampaign();
      const restore = crashBefore(s, step);
      expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toMatchObject(UNKNOWN);
      restore();
      expect(RELOCATION_KEYS.filter((k) => s.campaign.store.getFact(k))).toEqual(
        RELOCATION_KEYS.slice(0, step),
      );
      expect(RELOCATION_TEMPORAL_KEYS.filter((k) => s.campaign.store.getFact(k))).toEqual([]);
      expect(authorityCensus(s).total).toBe(1);
      expect(s.campaign.verify()).toEqual([]);
      expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
      expect(movementSummary(s).head.state_sha256).toBe(ref.head.state_sha256);
      expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
    });

    it(`a lost reply after the ${name} commits is unknown, and the same request replays it and converges with exactly one movement`, async () => {
      const ref = await reference();
      const s = await corridorCampaign();
      const restore = loseReplyAfter(s, step);
      expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toMatchObject(UNKNOWN);
      restore();
      expect(RELOCATION_KEYS.filter((k) => s.campaign.store.getFact(k))).toEqual(
        RELOCATION_KEYS.slice(0, step + 1),
      );
      expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
      expect(movementSummary(s).head.state_sha256).toBe(ref.head.state_sha256);
      expect(
        s.campaign.store.listFacts().filter((f) => f.key.startsWith("logistics/")),
      ).toHaveLength(2);
      expect(s.coordinator.boundaryIndex().entries).toHaveLength(1);
      expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
      expect(s.campaign.verify()).toEqual([]);
    });

    it(`a process crash before the ${name}: save → close → load, a fresh context, and the same request converges with one authority at every cut`, async () => {
      const ref = await reference();
      const dir = tempDir();
      const s = await corridorCampaign(dir);
      crashBefore(s, step);
      expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toMatchObject({ ok: false });
      await s.campaign.close();
      const reopened = await reopenMovement(dir);
      expect(reopened.campaign.verify()).toEqual([]);
      expect(authorityCensus(reopened).total).toBe(1);
      expect(reopened.campaign.corridor(W, ORIGIN, DEST_LOCUS_ID)!.fact.version).toBe(1);
      expect(await relocateViaCorridor(trustedCorridorRelocation(reopened))).toEqual(COMMITTED);
      expect(movementSummary(reopened).head.state_sha256).toBe(ref.head.state_sha256);
      await must(advanceToDelivery(reopened));
      expect(reopened.campaign.pcCurrentLocus(PC)!.phase).toBe("DESTINATION_COMMITTED");
      expect(reopened.campaign.verify()).toEqual([]);
      await reopened.campaign.close();
    });
  }

  it("a changed choice, route or boundary after a partial or committed attempt never reuses the earlier success and changes nothing: no extra journey, debit, arrival or rival owner", async () => {
    const s = await corridorCampaign();
    await establishOtherLocus(s);
    await establishCorridor(s, 2, corridorInput(ORIGIN, OTHER_DEST));
    // the PC-side commitment and request committed; Logistics did not
    const restore = crashBefore(s, 2);
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toMatchObject(UNKNOWN);
    restore();
    const other = trustedCorridorRelocation(s, {
      choice: confirmedChoice({ locus_id: OTHER_DEST }),
      corridor_key: corridorKeyOfPair(ORIGIN, OTHER_DEST),
    });
    expect(await unchanged(s, () => relocateViaCorridor(other))).toEqual(REFUSED);
    expect(authorityCensus(s)).toMatchObject({ stationary: 1, total: 1 });
    // the original identities, unchanged, converge
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
    // and once the commitment is committed a changed boundary is a conflict, never a silent reuse
    const later = { unit: LOG_T_DELIVERY.unit, value: LOG_T_DELIVERY.value + 1 };
    expect(
      await unchanged(s, () =>
        relocateViaCorridor(trustedCorridorRelocation(s, { delivery_at: later })),
      ),
    ).toEqual(REFUSED);
    expect(s.logistics.commitment(W, PC)!.value.delivery.at).toEqual(LOG_T_DELIVERY);
    expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a lost reply for the Logistics commitment, then a changed boundary: refused with no write; the original boundary reconciles", async () => {
    const s = await corridorCampaign();
    const restore = loseReplyAfter(s, 2);
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toMatchObject(UNKNOWN);
    restore();
    const later = { unit: LOG_T_DELIVERY.unit, value: LOG_T_DELIVERY.value + 1 };
    expect(
      await unchanged(s, () =>
        relocateViaCorridor(trustedCorridorRelocation(s, { delivery_at: later })),
      ),
    ).toEqual(REFUSED);
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
    expect(s.logistics.commitment(W, PC)!.value.delivery.at).toEqual(LOG_T_DELIVERY);
  });

  it("a registration group the Temporal kernel refuses after the transfer committed is the unknown outcome, never a safely absent movement; the same request then reconciles", async () => {
    const s = await corridorCampaign();
    const real = s.campaign.store;
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return async (g: any) =>
            g.writes.some((w: any) => w.key === RELOCATION_TEMPORAL_OBJECT_KEY)
              ? { ok: false, error: { code: "VERSION_CONFLICT", message: "refused" } }
              : target.commit(g);
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const r = await relocateViaCorridor(trustedCorridorRelocation(s));
    (s.campaign as any).store = real;
    expect(r).toMatchObject(UNKNOWN);
    expect(JSON.stringify(r)).not.toContain("refused");
    expect(RELOCATION_KEYS.filter((k) => s.campaign.store.getFact(k))).toEqual(RELOCATION_KEYS);
    expect(await relocateViaCorridor(trustedCorridorRelocation(s))).toEqual(COMMITTED);
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });
});

/** the corridor key of an ordered pair of fixture loci */
function corridorKeyOfPair(from: string, to: string): string {
  return `world/${W}/corridor/${from}/${to}`;
}
