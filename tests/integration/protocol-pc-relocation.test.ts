// Trusted, player-confirmed active-PC single-leg relocation gateway (forty-first bounded slice) — the real path over the real
// owners. A trusted context binds the confirmed choice and the declared delivery boundary; the one allowlisted operation drives
// the EXISTING PC commitment → PC-owned request → Logistics commitment → dispatch chain to lawful in-transfer custody and nothing
// further. Arrival remains the existing Temporal → Logistics delivery → World-State destination → retirement machinery.
// Register lineage: IA-01/02/03/04/06/14/18/19/20/28 (partial, no status change); RC-02/04/07/10/13/15/16; IM-02/03/05/07/11/12/15/16/17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PcMovementCommitmentSchema,
  TEMPORAL_STATE_KEY,
  MovementServiceRequestSchema,
  logisticsDeliveryKey,
  pcExistenceContractKey,
  pcMovementCommitmentKey,
  pcMovementRequestKey,
  temporalObjectKey,
  worldActorCouplingKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldPcLocusCustodyKey,
} from "@immortalis/contracts";
import { ACTOR_OTHER, LOG_T_DELIVERY } from "@immortalis/testkit";
import { handedOverCampaign } from "../support/pc-locus-custody.ts";
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
  RELOCATION_KEYS,
  confirmedChoice,
  crashBefore,
  loseReplyAfter,
  relocate,
  trustedRelocation,
} from "../support/protocol-relocation.ts";
import { RELOCATION_REFUSAL, RELOCATION_REQUEST } from "../support/protocol.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const ORIGIN = "locus-fixture-1";
const COMMITTED = { ok: true, value: { status: "RELOCATION_COMMITTED" } };
const protectedKeys = [
  PLAYER_CHARACTER_BINDING_KEY,
  worldActorCouplingKey(PC),
  pcExistenceContractKey(PC),
  worldPcLocusCustodyKey(PC),
];

/** the attempt changes nothing at all: head, every fact, every receipt */
const unchanged = async (s: PcMoveSeeded, attempt: () => Promise<unknown>): Promise<unknown> => {
  const before = movementSummary(s);
  const r = await attempt();
  expect(movementSummary(s)).toEqual(before);
  return r;
};

describe("acceptance 1: a trusted, confirmed choice crosses the seam and lawfully starts exactly the existing single-leg transfer", () => {
  it("commits the PC commitment and request, then Logistics' commitment and dispatch: in transfer, one authority, and no time advanced", async () => {
    const s = await custodiedCampaign();
    const before = snapshotFacts(s);
    const clock = s.campaign.store.getFact(TEMPORAL_STATE_KEY)!;

    const r = await relocate(trustedRelocation(s));
    expect(r).toEqual(COMMITTED);

    // exactly the four existing facts were added; nothing that existed changed
    const after = snapshotFacts(s);
    expect([...after.keys()].filter((k) => !before.has(k)).sort()).toEqual(
      [...RELOCATION_KEYS].sort(),
    );
    for (const [k, f] of before) expect(after.get(k), k).toEqual(f);
    for (const k of protectedKeys) expect(after.get(k)).toEqual(before.get(k));

    // the PC-side facts are the existing owner's, authored under the player's authority, with the existing meaning
    const commitment = s.campaign.store.getFact(pcMovementCommitmentKey(PC))!;
    expect(commitment).toMatchObject({ owner: "pc_existence", facet: "pc_voluntary_commitment" });
    expect(PcMovementCommitmentSchema.parse(commitment.value)).toMatchObject({
      pc_id: PC,
      authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
      intent: { kind: "VOLUNTARY_RELOCATION" },
    });
    const request = s.campaign.store.getFact(pcMovementRequestKey(PC))!;
    expect(request).toMatchObject({ owner: "pc_existence", facet: "pc_voluntary_commitment" });
    expect(MovementServiceRequestSchema.parse(request.value)).toMatchObject({
      request_id: REQUEST_ID,
      priority_authority_ref: null,
    });

    // Logistics alone holds the in-transfer locus, at the explicitly declared boundary
    const c = LogisticsCommitmentSchema.parse(s.logistics.commitment(W, PC)!.fact.value);
    const t = LogisticsTransferSchema.parse(s.logistics.transfer(W, PC)!.fact.value);
    expect(c.delivery.at).toEqual(LOG_T_DELIVERY);
    expect(t.state.status).toBe("IN_TRANSFER");
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
    });
    expect(s.campaign.pcCurrentLocus(PC)!.stationary).toBeNull();
    expect(authorityCensus(s)).toMatchObject({
      stationary: 0,
      logistics: 1,
      destination: 0,
      total: 1,
    });

    // no time advanced, nothing registered with the Temporal kernel, no delivery, destination or fallback entity
    expect(s.campaign.store.getFact(TEMPORAL_STATE_KEY)).toEqual(clock);
    expect(
      s.campaign.store
        .listFacts()
        .filter(
          (f) =>
            f.key.startsWith("temporal/") && f.key !== TEMPORAL_STATE_KEY && !before.has(f.key),
        ),
    ).toEqual([]);
    expect(
      s.campaign.store.getFact(temporalObjectKey(`obj-logistics-${REQUEST_ID}`)),
    ).toBeUndefined();
    expect(s.campaign.store.getFact(logisticsDeliveryKey(W, PC))).toBeUndefined();
    expect(s.campaign.store.getFact(worldEntityTransitionKey(W, PC))).toBeUndefined();
    expect(s.campaign.store.getFact(worldFallbackEntityKey(W, PC))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the existing explicit Temporal delivery and destination path then completes by its normal machinery", async () => {
    const s = await custodiedCampaign();
    expect(await relocate(trustedRelocation(s))).toEqual(COMMITTED);
    await registerPcTransfer(s, 5);
    // registering the object is not arrival either
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
    });
    await must(advanceToDelivery(s));
    const where = s.campaign.pcCurrentLocus(PC)!;
    expect(where).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
      movement: null,
    });
    expect(where.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(where.origin.locus.entity_id).toBe(ORIGIN);
    expect(authorityCensus(s)).toMatchObject({
      total: 1,
      destination: 1,
      destinationLocus: DEST_LOCUS_ID,
    });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the host's invocation alone never advances time or arrives, however often it is repeated", async () => {
    const s = await custodiedCampaign();
    const ctx = trustedRelocation(s);
    for (let i = 0; i < 3; i++) expect(await relocate(ctx)).toEqual(COMMITTED);
    expect(s.campaign.pcCurrentLocus(PC)!.phase).toBe("IN_TRANSFER");
    expect(authorityCensus(s).total).toBe(1);
  });
});

describe("acceptance 2: nothing is written from a forged, unauthorized, mismatched or conflicting attempt", () => {
  it("a malformed, over-claiming or unallowlisted request, and a forged context, change nothing", async () => {
    const s = await custodiedCampaign();
    const ctx = trustedRelocation(s);
    for (const request of [
      undefined,
      {},
      RELOCATION_REQUEST({ confirmed: true }),
      RELOCATION_REQUEST({ pc_id: ACTOR_OTHER }),
      RELOCATION_REQUEST({ destination: { world_id: W, locus_id: "locus-nowhere" } }),
      RELOCATION_REQUEST({ delivery_at: { unit: "t", value: 9999 } }),
      RELOCATION_REQUEST({
        authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
      }),
      { operation: "commitPcVoluntaryMovement" },
      { operation: "dispatch" },
    ])
      expect(await unchanged(s, () => relocate(ctx, request)), JSON.stringify(request)).toEqual(
        JSON.parse(RELOCATION_REFUSAL),
      );
    for (const forged of [{}, { ...ctx }, undefined, "ctx"])
      expect(await unchanged(s, () => relocate(forged as never))).toEqual(
        JSON.parse(RELOCATION_REFUSAL),
      );
  });

  it("an untrusted or incomplete consent or authority binding is inert: wrong role/permission, no authority, no boundary, no publication material", async () => {
    const s = await custodiedCampaign();
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
      { choice: undefined },
      { delivery_at: undefined },
      { delivery_at: { unit: "t" } },
      { publication: undefined },
      { publication: { cause: "c" } },
    ];
    for (const over of inert)
      expect(
        await unchanged(s, () => relocate(trustedRelocation(s, over))),
        JSON.stringify(over),
      ).toEqual(JSON.parse(RELOCATION_REFUSAL));
  });

  it("a wrong, inactive or unprepared PC, and a mismatched or unestablished destination, are the one refusal and write nothing", async () => {
    const s = await custodiedCampaign();
    for (const choice of [
      confirmedChoice({ pc_id: ACTOR_OTHER }),
      confirmedChoice({ pc_id: "actor-nobody" }),
      confirmedChoice({ locus_id: "locus-nowhere" }),
      confirmedChoice({ world_id: "world-nowhere" }),
      confirmedChoice({ locus_id: ORIGIN }), // the PC's own current locus: a relocation changes the locus
    ])
      expect(
        await unchanged(s, () => relocate(trustedRelocation(s, { choice }))),
        JSON.stringify(choice),
      ).toEqual(JSON.parse(RELOCATION_REFUSAL));
    // a handed-over PC whose stationary custody was never established
    const handed = await handedOverCampaign();
    expect(await unchanged(handed as never, () => relocate(trustedRelocation(handed)))).toEqual(
      JSON.parse(RELOCATION_REFUSAL),
    );
  });

  it("a rival: an existing move for the PC (commitment, request, Logistics commitment or transfer, however made) refuses the gateway, and a second journey does too", async () => {
    // an existing PC commitment made outside the gateway
    const a = await custodiedCampaign();
    await must(commitMove(a, 1));
    expect(await unchanged(a, () => relocate(trustedRelocation(a)))).toEqual(
      JSON.parse(RELOCATION_REFUSAL),
    );
    // an existing Logistics transfer made outside the gateway
    const b = await custodiedCampaign();
    await must(commitMove(b, 1));
    await must(requestMove(b, 2));
    await must(logisticsCommit(b, 3));
    await must(logisticsDispatch(b, 4));
    expect(await unchanged(b, () => relocate(trustedRelocation(b)))).toEqual(
      JSON.parse(RELOCATION_REFUSAL),
    );
    // a second journey after the gateway's own, to the same or another destination, or to the PC's present locus
    const c = await custodiedCampaign();
    expect(await relocate(trustedRelocation(c))).toEqual(COMMITTED);
    for (const choice of [
      confirmedChoice({ locus_id: ORIGIN }),
      confirmedChoice({ locus_id: "locus-nowhere" }),
    ])
      expect(await unchanged(c, () => relocate(trustedRelocation(c, { choice })))).toEqual(
        JSON.parse(RELOCATION_REFUSAL),
      );
    // the same journey presented with a different declared boundary is a changed input, never silently reused
    expect(
      await unchanged(c, () =>
        relocate(
          trustedRelocation(c, {
            delivery_at: { unit: LOG_T_DELIVERY.unit, value: LOG_T_DELIVERY.value + 1 },
          }),
        ),
      ),
    ).toEqual(JSON.parse(RELOCATION_REFUSAL));
    // and after arrival
    await registerPcTransfer(c, 5);
    await must(advanceToDelivery(c));
    expect(
      await unchanged(c, () =>
        relocate(trustedRelocation(c, { choice: confirmedChoice({ locus_id: ORIGIN }) })),
      ),
    ).toEqual(JSON.parse(RELOCATION_REFUSAL));
    expect(c.campaign.verify()).toEqual([]);
  });

  it("two campaigns with colliding PC, world, locus and group identities never cross: a context reaches only the campaign it was bound to", async () => {
    const a = await custodiedCampaign();
    const b = await custodiedCampaign();
    const bBefore = movementSummary(b);
    const ctxA = trustedRelocation(a);
    expect(await relocate(ctxA)).toEqual(COMMITTED);
    expect(movementSummary(b)).toEqual(bBefore);
    expect(b.campaign.store.getFact(pcMovementCommitmentKey(PC))).toBeUndefined();
    // the same host request again, through A's context, still touches only A
    expect(await relocate(ctxA)).toEqual(COMMITTED);
    expect(movementSummary(b)).toEqual(bBefore);
    // B's own context then reaches B alone, and produces the same result as A's did
    expect(await relocate(trustedRelocation(b))).toEqual(COMMITTED);
    expect(b.campaign.store.head().state_sha256).toBe(a.campaign.store.head().state_sha256);
    expect(authorityCensus(a).total).toBe(1);
    expect(authorityCensus(b).total).toBe(1);
  });
});

describe("acceptance 3: existing ownership, key spaces, cardinality and provenance are unchanged; nothing is invented", () => {
  it("the gateway's journey equals the existing owner-path journey fact for fact, apart from its own derived publication identities", async () => {
    const viaGateway = await custodiedCampaign();
    expect(await relocate(trustedRelocation(viaGateway))).toEqual(COMMITTED);
    const manual = await custodiedCampaign();
    await must(commitMove(manual, 1));
    await must(requestMove(manual, 2));
    await must(logisticsCommit(manual, 3));
    await must(logisticsDispatch(manual, 4));
    const values = (s: PcMoveSeeded) =>
      Object.fromEntries(
        RELOCATION_KEYS.map((k) => {
          const f = s.campaign.store.getFact(k)!;
          return [k, { owner: f.owner, facet: f.facet, version: f.version, value: f.value }];
        }),
      );
    expect(values(viaGateway)).toEqual(values(manual));
    expect(authorityCensus(viaGateway)).toEqual(authorityCensus(manual));
  });

  it("the result and the committed values state no route, duration, speed, arrival, success or actor motive, and name no owner, key or provenance", async () => {
    const s = await custodiedCampaign();
    const r = await relocate(trustedRelocation(s));
    const json = JSON.stringify(r);
    expect(json).toBe('{"ok":true,"value":{"status":"RELOCATION_COMMITTED"}}');
    for (const k of RELOCATION_KEYS.slice(0, 2)) {
      const v = JSON.stringify(s.campaign.store.getFact(k)!.value);
      for (const word of [
        "route",
        "path",
        "duration",
        "speed",
        "arrival",
        "arrived",
        "success",
        "motive",
      ])
        expect(v, k).not.toContain(word);
    }
  });

  it("only the existing Logistics owns the in-transfer locus: the gateway wrote no World-State, Temporal or rival locus fact", async () => {
    const s = await custodiedCampaign();
    const before = snapshotFacts(s);
    await relocate(trustedRelocation(s));
    const added = s.campaign.store.listFacts().filter((f) => !before.has(f.key));
    expect(added.map((f) => `${f.owner}/${f.facet}`).sort()).toEqual([
      "logistics/logistics_state",
      "logistics/logistics_state",
      "pc_existence/pc_voluntary_commitment",
      "pc_existence/pc_voluntary_commitment",
    ]);
  });
});

describe("acceptance 4: retry, duplicate calls, lost replies and crashes reconcile by canonical identity", () => {
  const reference = async () => {
    const s = await custodiedCampaign();
    expect(await relocate(trustedRelocation(s))).toEqual(COMMITTED);
    const summary = movementSummary(s);
    await s.campaign.close();
    return summary;
  };

  it("a retry by identity returns the same status and writes nothing — in transfer, and after arrival", async () => {
    const s = await custodiedCampaign();
    const ctx = trustedRelocation(s);
    expect(await relocate(ctx)).toEqual(COMMITTED);
    expect(await unchanged(s, () => relocate(ctx))).toEqual(COMMITTED);
    expect(await unchanged(s, () => relocate(trustedRelocation(s)))).toEqual(COMMITTED);
    await registerPcTransfer(s, 5);
    await must(advanceToDelivery(s));
    expect(await unchanged(s, () => relocate(ctx))).toEqual(COMMITTED);
    expect(s.campaign.pcCurrentLocus(PC)!.phase).toBe("DESTINATION_COMMITTED");
    expect(s.campaign.verify()).toEqual([]);
  });

  for (const step of [0, 1, 2, 3]) {
    const name = ["PC commitment", "PC request", "Logistics commitment", "Logistics dispatch"][
      step
    ]!;

    it(`a crash before the ${name} commits is unknown, leaves only the earlier steps, and the same request converges on the uninterrupted run`, async () => {
      const ref = await reference();
      const s = await custodiedCampaign();
      const restore = crashBefore(s, step);
      const r = await relocate(trustedRelocation(s));
      expect(r).toMatchObject({ ok: false, error: { code: "RELOCATION_OUTCOME_UNKNOWN" } });
      restore();
      expect(RELOCATION_KEYS.filter((k) => s.campaign.store.getFact(k))).toEqual(
        RELOCATION_KEYS.slice(0, step),
      );
      expect(authorityCensus(s).total).toBe(1);
      expect(s.campaign.verify()).toEqual([]);
      expect(await relocate(trustedRelocation(s))).toEqual(COMMITTED);
      expect(movementSummary(s).head.state_sha256).toBe(ref.head.state_sha256);
      expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
    });

    it(`a lost reply after the ${name} commits is unknown, and the same request replays it and converges with exactly one movement`, async () => {
      const ref = await reference();
      const s = await custodiedCampaign();
      const restore = loseReplyAfter(s, step);
      const r = await relocate(trustedRelocation(s));
      expect(r).toMatchObject({ ok: false, error: { code: "RELOCATION_OUTCOME_UNKNOWN" } });
      restore();
      expect(RELOCATION_KEYS.filter((k) => s.campaign.store.getFact(k))).toEqual(
        RELOCATION_KEYS.slice(0, step + 1),
      );
      expect(await relocate(trustedRelocation(s))).toEqual(COMMITTED);
      expect(movementSummary(s).head.state_sha256).toBe(ref.head.state_sha256);
      expect(
        s.campaign.store.listFacts().filter((f) => f.key.startsWith("logistics/")),
      ).toHaveLength(2);
      expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
      expect(s.campaign.verify()).toEqual([]);
    });

    it(`a process crash before the ${name}: save → close → load, a fresh context, and the same request converges with one authority at every cut`, async () => {
      const ref = await reference();
      const dir = tempDir();
      const s = await custodiedCampaign(dir);
      crashBefore(s, step);
      expect(await relocate(trustedRelocation(s))).toMatchObject({ ok: false });
      await s.campaign.close();
      const reopened = await reopenMovement(dir);
      expect(reopened.campaign.verify()).toEqual([]);
      expect(authorityCensus(reopened).total).toBe(1);
      expect(reopened.campaign.pcCurrentLocus(PC)!.phase).toBe("STATIONARY_AT_ORIGIN");
      expect(await relocate(trustedRelocation(reopened))).toEqual(COMMITTED);
      expect(movementSummary(reopened).head.state_sha256).toBe(ref.head.state_sha256);
      // and the arrival path completes by its normal machinery after the reload
      await registerPcTransfer(reopened, 5);
      await must(advanceToDelivery(reopened));
      expect(reopened.campaign.pcCurrentLocus(PC)!.phase).toBe("DESTINATION_COMMITTED");
      expect(reopened.campaign.verify()).toEqual([]);
      await reopened.campaign.close();
    });
  }

  it("a declared boundary Logistics refuses leaves only the lawful PC-side commitment and request; no rollback is invented, and the same PC then relocates once with a lawful boundary", async () => {
    const s = await custodiedCampaign();
    // not after the canonical basis (T0 = 100): Logistics refuses the commitment AFTER the two PC-side steps committed
    const past = { unit: LOG_T_DELIVERY.unit, value: 1 };
    expect(await relocate(trustedRelocation(s, { delivery_at: past }))).toEqual(
      JSON.parse(RELOCATION_REFUSAL),
    );
    expect(RELOCATION_KEYS.filter((k) => s.campaign.store.getFact(k))).toEqual(
      RELOCATION_KEYS.slice(0, 2),
    );
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
      authority: "WORLD_STATE",
    });
    expect(authorityCensus(s)).toMatchObject({ stationary: 1, total: 1 });
    expect(s.campaign.verify()).toEqual([]);
    // recoverable only through the existing validated state: the committed steps replay, the rest commit
    expect(await relocate(trustedRelocation(s))).toEqual(COMMITTED);
    expect(authorityCensus(s)).toMatchObject({ logistics: 1, total: 1 });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the uninterrupted gateway run is reproducible: two campaigns reach byte-identical canonical state", async () => {
    const a = await reference();
    const b = await reference();
    expect(a.head.state_sha256).toBe(b.head.state_sha256);
  });
});
