/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign store to simulate lost replies, crashes and refused stages */
// Active-PC target-only temporal advance — the real path over the real owners. A separately player-authorized, trusted, exact
// canonical target moves a campaign whose one active PC is stationary; the Temporal kernel alone selects what is due and GIP's own
// `gipSunsetExpiryProvider` alone expires an Instrument at its own earned instant. No fixture authors `expired`, a stage, a due flag
// or a status: the Instrument, its Office and Scope Binding, GIP's enrollment receipt, the PC's handover and custody are all
// committed by their owners before the gateway is called, and the result is read back from GIP's own authoritative read.
// Register lineage: IA-04, IA-06 (partial, no status change); RC-05/15/16; IM-02, IM-06, IM-15, IM-16.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  TEMPORAL_BOUNDARY_INDEX_KEY,
  gipInstrumentKey,
  gipSunsetStage,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import { INSTRUMENT_A } from "@immortalis/testkit";
import { OTHER_SUNSET_AT, SUNSET_AT, SUNSET_LATER, SUNSET_MID, at } from "../support/gip-sunset.ts";
import { gipOf, instrumentFact, lifecycleOf, sunsetPcCampaign } from "../support/pc-gip-sunset.ts";
import {
  PC,
  W,
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
  PC_TARGET_COMMITTED,
  PC_TARGET_REFUSAL,
  PC_TARGET_TX,
  PC_TARGET_TX2,
  PC_TARGET_TX3,
  PC_TARGET_UNKNOWN,
  advancePcTarget,
  crashWhen,
  loseReplyWhen,
  pcTargetTransaction,
  recordCommits,
  refuseGipStageOf,
  stationarySunsetPcCampaign,
  trustedPcHeld,
  trustedPcTarget,
} from "../support/pc-target-advance.ts";
import { ADVANCE_COMMITTED, advance, trustedAdvance } from "../support/protocol-advance.ts";
import { logisticsTransferKey } from "@immortalis/contracts";
import { tempDir } from "../support/tmp.ts";
import { must } from "../support/temporal.ts";

const REFUSED = JSON.parse(PC_TARGET_REFUSAL);
const SUNSET_OBJECT = "obj-gip-sunset-instrument-a-1";
const GIP_STAGE = gipSunsetStage(INSTRUMENT_A);
const GIP_OP = { owner: "gip", operation: "gip-expire-instrument-at-sunset" };

const isGip = (g: CommitGroup) => g.writes.some((w) => w.key === gipInstrumentKey(INSTRUMENT_A));
const isAuthority = (id: string) => (g: CommitGroup) =>
  g.writes.some((w) => w.key === temporalTransactionAuthorityKey(id));
const isTxRecord = (id: string) => (g: CommitGroup) =>
  g.writes.some((w) => w.key === temporalTransactionKey(id));

const timeOf = (s: PcMoveSeeded) => s.coordinator.state()!.value.canonical_time;
const instrumentValue = (s: PcMoveSeeded) => structuredClone(instrumentFact(s)!.value as any);
const tx = (s: PcMoveSeeded, id = PC_TARGET_TX) => s.coordinator.transaction(id)!.value;
const gipRead = (s: PcMoveSeeded): GovernanceInstrument =>
  gipOf(s).governanceInstrument(INSTRUMENT_A)!.value;

/** Runs `attempt` and proves it changed nothing: the whole store (every fact, receipt and head) is as it was. */
const unchanged = async (s: PcMoveSeeded, attempt: () => Promise<unknown>): Promise<unknown> => {
  const before = movementSummary(s);
  const r = await attempt();
  expect(movementSummary(s)).toEqual(before);
  return r;
};

describe("a sunset earned inside the interval is expired by GIP alone, at its own boundary, within the separately authorized target advance", () => {
  it("the stationary active PC's campaign is advanced to the target: GIP's stage runs once at the sunset, the kernel seals the transaction, and a later authoritative GIP read sees `expired`", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const before = snapshotFacts(s);
    const prior = instrumentValue(s);
    // the pre-existing, independently committed antecedents
    expect(s.campaign.binding()?.value.active_pc.entity_id).toBe(PC);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
      authority: "WORLD_STATE",
      movement: null,
    });
    expect(prior.lifecycle_status).toBe("active");
    expect(prior.sunset_condition).toEqual(SUNSET_MID);
    expect(gipRead(s).lifecycle_status).toBe("active");
    expect(s.coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual([SUNSET_OBJECT]);
    expect(timeOf(s)).toEqual(at(100));
    const commits = recordCommits(s);

    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );

    // the GIP read after the fact: the same slot, active → expired, every other field (validity_by_order[] included) retained
    expect(gipRead(s).lifecycle_status).toBe("expired");
    expect(lifecycleOf(s)).toBe("expired");
    expect(instrumentFact(s)!.version).toBe(2);
    expect(instrumentValue(s)).toEqual({ ...prior, lifecycle_status: "expired" });

    // the transaction: the literal target-only request, the player pair, GIP's one stage at GIP's own instant
    const record = tx(s);
    expect(record.requested).toEqual({ target: SUNSET_LATER, condition: null });
    expect(record.continues).toBeNull();
    expect(record.context).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });
    expect(record.outcome).toMatchObject({
      actual_stop: SUNSET_LATER,
      stop_reason: "TARGET_REACHED",
      remainder: null,
      unresolved_dependents: [],
    });
    expect(record.stages.map((x) => x.stage)).toEqual([GIP_STAGE]);
    expect(record.stages[0]!.stage.owner_operation).toEqual(GIP_OP);
    expect(record.boundaries_crossed).toEqual([
      { object_id: SUNSET_OBJECT, boundary_id: expect.any(String), at: SUNSET_MID },
    ]);
    // GIP's stage read exactly its two committed sources (Office, then Scope Binding) as of now
    expect(record.stages[0]!.reads.map((r) => [r.mode, r.source.owner])).toEqual([
      ["AS-OF-NOW", "gip"],
      ["AS-OF-NOW", "gip"],
    ]);

    // the kernel opened the transaction's authority BEFORE the owner stage; the sealed record is last
    const order = commits()
      .map((g) =>
        isAuthority(PC_TARGET_TX)(g)
          ? "authority"
          : isGip(g)
            ? "gip"
            : isTxRecord(PC_TARGET_TX)(g)
              ? "transaction"
              : "other",
      )
      .filter((o) => o !== "other");
    expect(order).toEqual(["authority", "gip", "transaction"]);

    // time, continuation and index: carried to the player's target, nothing held, the sunset spent
    expect(timeOf(s)).toEqual(SUNSET_LATER);
    expect(s.coordinator.state()!.value.continuation).toBeNull();
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    // the PC is exactly where it was: custody, locus and binding untouched
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "STATIONARY_AT_ORIGIN" });

    // nothing else is written: only the Instrument and the kernel's own temporal facts changed; no knowledge, packet,
    // observer, recognition or movement fact exists for the expiry
    const after = snapshotFacts(s);
    const changed = [...after.keys()].filter(
      (k) => JSON.stringify(after.get(k)) !== JSON.stringify(before.get(k)),
    );
    expect(changed.filter((k) => !k.startsWith("temporal/"))).toEqual([
      gipInstrumentKey(INSTRUMENT_A),
    ]);
    expect([...after.keys()].filter((k) => !before.has(k))).toEqual([
      temporalTransactionAuthorityKey(PC_TARGET_TX),
      temporalTransactionKey(PC_TARGET_TX),
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the result survives save → close → reopen; the same identity replays and writes nothing", async () => {
    const dir = tempDir();
    const s = await stationarySunsetPcCampaign(SUNSET_MID, "registered", dir);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    const summary = movementSummary(s);
    await s.campaign.close();

    const reopened = await reopenMovement(dir);
    expect(reopened.campaign.verify()).toEqual([]);
    expect(gipRead(reopened).lifecycle_status).toBe("expired");
    expect(reopened.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "STATIONARY_AT_ORIGIN" });
    expect(timeOf(reopened)).toEqual(SUNSET_LATER);
    expect(movementSummary(reopened)).toEqual(summary);
    expect(
      await unchanged(reopened, () =>
        advancePcTarget(trustedPcTarget(reopened, { target: SUNSET_LATER })),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    await reopened.campaign.close();
  });
});

describe("falsifying contrast: the same legitimate Instrument stays active before its sunset, and expires once at or after it", () => {
  it("a target strictly BEFORE the sunset commits, carries time forward and leaves the Instrument active and enrolled; the sunset is later earned once", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_AT);

    expect(
      await advancePcTarget(
        trustedPcTarget(s, { target: SUNSET_MID, transaction: pcTargetTransaction("tx-before") }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(gipRead(s).lifecycle_status).toBe("active");
    expect(instrumentFact(s)!.version).toBe(1);
    expect(timeOf(s)).toEqual(SUNSET_MID);
    expect(tx(s, "tx-before").stages).toEqual([]);
    expect(tx(s, "tx-before").outcome.stop_reason).toBe("TARGET_REACHED");
    // the sunset stays registered at its own earned boundary
    expect(s.coordinator.boundaryIndex().entries).toEqual([
      expect.objectContaining({ object_id: SUNSET_OBJECT, at: SUNSET_AT }),
    ]);

    // a distinct, newly authorized choice to exactly the sunset instant: t1 >= tS expires it, once
    expect(
      await advancePcTarget(
        trustedPcTarget(s, { target: SUNSET_AT, transaction: pcTargetTransaction("tx-at") }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(gipRead(s).lifecycle_status).toBe("expired");
    expect(instrumentFact(s)!.version).toBe(2);
    expect(tx(s, "tx-at").stages.map((x) => x.stage)).toEqual([GIP_STAGE]);
    expect(timeOf(s)).toEqual(SUNSET_AT);

    // later time is carried with no second expiry
    expect(
      await advancePcTarget(
        trustedPcTarget(s, { target: SUNSET_LATER, transaction: pcTargetTransaction("tx-later") }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(instrumentFact(s)!.version).toBe(2);
    expect(tx(s, "tx-later").stages).toEqual([]);
    expect(timeOf(s)).toEqual(SUNSET_LATER);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a sunset later than the target is not crossed, even when the same target would have crossed an earlier one", async () => {
    const s = await stationarySunsetPcCampaign(OTHER_SUNSET_AT);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    // 250 <= 300: crossed
    expect(gipRead(s).lifecycle_status).toBe("expired");

    const t = await stationarySunsetPcCampaign(OTHER_SUNSET_AT);
    expect(await advancePcTarget(trustedPcTarget(t, { target: SUNSET_AT }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    // 250 > 200: not crossed
    expect(gipRead(t).lifecycle_status).toBe("active");
    expect(timeOf(t)).toEqual(SUNSET_AT);
  });

  it("an Instrument with no sunset term has no GIP stage and no Temporal object: nothing expires", async () => {
    const s = await stationarySunsetPcCampaign(null, "no-sunset");
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(gipRead(s).lifecycle_status).toBe("active");
    expect(tx(s).stages).toEqual([]);
    expect(timeOf(s)).toEqual(SUNSET_LATER);
  });

  it("a legitimately empty due index is not turned into a false failure: with no registered material work at all, time is carried exactly and nothing else is written", async () => {
    const s = await custodiedCampaign();
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    const before = snapshotFacts(s);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(timeOf(s)).toEqual(SUNSET_LATER);
    expect(tx(s).stages).toEqual([]);
    expect(tx(s).engaged).toEqual([]);
    const after = snapshotFacts(s);
    expect([...after.keys()].filter((k) => !k.startsWith("temporal/"))).toEqual(
      [...before.keys()].filter((k) => !k.startsWith("temporal/")),
    );
    for (const [k, v] of before) if (!k.startsWith("temporal/")) expect(after.get(k), k).toEqual(v);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the same Instrument is expired exactly once whichever player choice reaches the sunset first: two choices past it never expire it twice", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    expect(
      await advancePcTarget(
        trustedPcTarget(s, { target: SUNSET_AT, transaction: pcTargetTransaction("tx-1") }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(
      await advancePcTarget(
        trustedPcTarget(s, { target: SUNSET_LATER, transaction: pcTargetTransaction("tx-2") }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(instrumentFact(s)!.version).toBe(2);
    expect(tx(s, "tx-1").stages.map((x) => x.stage)).toEqual([GIP_STAGE]);
    expect(tx(s, "tx-2").stages).toEqual([]);
  });
});

describe("a committed but unregistered sunset refuses the whole request, and completing GIP's enrollment lifts the refusal", () => {
  it("refuses with the one generic refusal and writes nothing; a lawful replay succeeds once the exact enrollment completes", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID, "pending");
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    const refused = await unchanged(s, () =>
      advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER })),
    );
    expect(JSON.stringify(refused)).toBe(PC_TARGET_REFUSAL);
    expect(lifecycleOf(s)).toBe("active");
    expect(timeOf(s)).toEqual(at(100));
    expect(s.coordinator.transaction(PC_TARGET_TX)).toBeUndefined();
    // a target that does not reach the pending sunset is not blocked by it
    expect(await advancePcTarget(trustedPcTarget(s, { target: at(120) }))).toEqual(
      PC_TARGET_COMMITTED,
    );

    expect(
      (
        await gipOf(s).completeSunsetEnrollment({
          group_id: "complete-g",
          intent_id: "complete-i",
          cause: "complete-c",
          basis: "b",
          secrecy: "s",
        })
      ).ok,
    ).toBe(true);
    expect(
      await advancePcTarget(
        trustedPcTarget(s, { target: SUNSET_LATER, transaction: pcTargetTransaction("tx-late") }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(gipRead(s).lifecycle_status).toBe("expired");
  });
});

describe("refuse and hold: nothing pre-authors a verdict or alters a protected state", () => {
  it("a campaign with no operative PC binding, another PC's identity and a non-PC identity are inert", async () => {
    // a NULL-PC campaign (world, institution, office, binding, Instrument; no PC anywhere)
    const { seededSunsetCampaign, establishSunset } = await import("../support/gip-sunset.ts");
    const nullPc = await seededSunsetCampaign(tempDir());
    await establishSunset(nullPc);
    const before = nullPc.campaign.store.head();
    expect(nullPc.campaign.binding()).toBeUndefined();
    expect(
      JSON.stringify(
        await advancePcTarget(trustedPcTarget(nullPc as never, { target: SUNSET_LATER })),
      ),
    ).toBe(PC_TARGET_REFUSAL);
    expect(nullPc.campaign.store.head()).toEqual(before);

    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    for (const pc_id of ["actor-other", "not-a-pc", PC.toUpperCase()])
      expect(
        await unchanged(s, () =>
          advancePcTarget(trustedPcTarget(s, { pc_id, target: SUNSET_LATER })),
        ),
      ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
  });

  it("a PC in transfer (its movement engaged) is refused: the sunset is not expired and the PC does not move", async () => {
    const s = await sunsetPcCampaign(SUNSET_MID);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "IN_TRANSFER" });
    expect(
      await unchanged(s, () => advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))),
    ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "IN_TRANSFER" });
  });

  it("every started-but-unsettled movement step of the PC is refused: willingness, request, Logistics commitment and dispatch", async () => {
    const steps: readonly [string, (s: PcMoveSeeded) => Promise<unknown>][] = [
      ["a movement commitment-of-record only", async (s) => must(commitMove(s, 1))],
      [
        "plus the PC-owned request",
        async (s) => {
          await must(commitMove(s, 1));
          await must(requestMove(s, 2));
        },
      ],
      [
        "plus the Logistics commitment",
        async (s) => {
          await must(commitMove(s, 1));
          await must(requestMove(s, 2));
          await must(logisticsCommit(s, 3));
        },
      ],
      [
        "plus dispatch (in transfer, not yet registered)",
        async (s) => {
          await must(commitMove(s, 1));
          await must(requestMove(s, 2));
          await must(logisticsCommit(s, 3));
          await must(logisticsDispatch(s, 4));
        },
      ],
      [
        "plus the Temporal registration",
        async (s) => {
          await must(commitMove(s, 1));
          await must(requestMove(s, 2));
          await must(logisticsCommit(s, 3));
          await must(logisticsDispatch(s, 4));
          await registerPcTransfer(s, 5);
        },
      ],
    ];
    for (const [name, prepare] of steps) {
      const s = await custodiedCampaign();
      await prepare(s);
      expect(
        await unchanged(s, () => advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))),
        name,
      ).toEqual(REFUSED);
    }
  });

  it("a destination committed by World-State whose Logistics retirement is still pending is refused; once the movement is settled the PC is stationary again and may be advanced", async () => {
    const s = await sunsetPcCampaign(OTHER_SUNSET_AT);
    const restore = crashWhen(
      s,
      (g) => g.owner === "logistics" && g.writes.some((w) => w.key === logisticsTransferKey(W, PC)),
    );
    expect(await advance(trustedAdvance(s))).toMatchObject({ ok: false });
    restore();
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "DESTINATION_COMMITTED_RETIREMENT_PENDING",
    });
    expect(
      await unchanged(s, () => advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))),
    ).toEqual(REFUSED);

    // the stop-at-delivery transaction is re-presented by its own gateway and settles the movement
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "DESTINATION_COMMITTED" });
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
  });

  it("a PC that has arrived and is settled at its destination is stationary: its campaign advances to a target and GIP expires the Instrument, the PC unmoved", async () => {
    const s = await sunsetPcCampaign(OTHER_SUNSET_AT);
    expect(await advance(trustedAdvance(s))).toEqual(ADVANCE_COMMITTED);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
    });
    expect(lifecycleOf(s)).toBe("active");
    const where = structuredClone(s.campaign.pcCurrentLocus(PC));
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(gipRead(s).lifecycle_status).toBe("expired");
    expect(s.campaign.pcCurrentLocus(PC)).toEqual(where);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an authority other than the player pair, a wrong-unit target and a backward target are refused and write nothing", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    for (const transaction of [
      pcTargetTransaction("tx-x", {
        context: { role: "role.archivist", permission: "permission.canon.write" },
      }),
      pcTargetTransaction("tx-x", {
        context: { role: "role.player_character", permission: "permission.player_choice.commit" },
      }),
      pcTargetTransaction("tx-x", {
        context: { role: "role.player", permission: "permission.canon.write" },
      }),
    ])
      expect(
        await unchanged(s, () =>
          advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER, transaction })),
        ),
      ).toEqual(REFUSED);
    for (const target of [
      { unit: "another-unit", value: 300 },
      at(50),
      { unit: SUNSET_LATER.unit, value: -1 },
      { unit: SUNSET_LATER.unit, value: 1.5 },
      "2026-10-10",
      null,
    ])
      expect(
        await unchanged(s, () => advancePcTarget(trustedPcTarget(s, { target }))),
        JSON.stringify(target),
      ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
    expect(timeOf(s)).toEqual(at(100));
  });

  it("a movement's own identity is not a progression instruction", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    for (const id of ["pc-move:" + PC, "obj-logistics-pc-move:" + PC])
      expect(
        await unchanged(s, () =>
          advancePcTarget(
            trustedPcTarget(s, { target: SUNSET_LATER, transaction: pcTargetTransaction(id) }),
          ),
        ),
        id,
      ).toEqual(REFUSED);
  });
});

describe("idempotency: repeated identical authorization neither duplicates the expiry nor the clock; a conflicting replay refuses", () => {
  it("replays the same status however often it is repeated and writes nothing", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    const summary = movementSummary(s);
    for (let i = 0; i < 3; i++)
      expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
        PC_TARGET_COMMITTED,
      );
    expect(movementSummary(s)).toEqual(summary);
    expect(instrumentFact(s)!.version).toBe(2);
  });

  it("the same identity with a different target, cause, trigger or publication is the kernel's conflict: refused, and the committed record is never amended", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    const record = structuredClone(tx(s));
    for (const [target, over] of [
      [at(310), {}],
      [SUNSET_LATER, { cause: "another-cause" }],
      [SUNSET_LATER, { trigger: { kind: "player-pc-target-choice", ref: "another-ref" } }],
    ] as const)
      expect(
        await unchanged(s, () =>
          advancePcTarget(
            trustedPcTarget(s, { target, transaction: pcTargetTransaction(PC_TARGET_TX, over) }),
          ),
        ),
        JSON.stringify([target, over]),
      ).toEqual(REFUSED);
    expect(tx(s)).toEqual(record);
    // a new identity to a target in the past is refused too
    expect(
      await unchanged(s, () =>
        advancePcTarget(
          trustedPcTarget(s, { target: SUNSET_AT, transaction: pcTargetTransaction("tx-new") }),
        ),
      ),
    ).toEqual(REFUSED);
  });

  it("an identity replays only as the branch its binder carries: a held binder never replays an initial record", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    // an initial record (continues null) presented through the held binder, under any claimed lineage, is not ours
    expect(
      await unchanged(s, () =>
        advancePcTarget(
          trustedPcHeld(s, {
            held: { from_transaction: "tx-some-other", target: SUNSET_LATER },
            transaction: pcTargetTransaction(PC_TARGET_TX),
          }),
        ),
      ),
    ).toEqual(REFUSED);
  });
});

describe("a kernel hold is truthful, and only a fresh separately confirmed choice for exactly that lineage continues it", () => {
  /** A stationary campaign whose GIP stage is refused through the store: the first choice commits a truthful held remainder. */
  async function heldCampaign() {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const restore = refuseGipStageOf(s);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    return { s, restore };
  }

  it("a stage GIP cannot lawfully commit holds the work: no expiry, no verdict, time short of the sunset; the host sees the same committed status", async () => {
    const { s, restore } = await heldCampaign();
    restore();
    const held = tx(s);
    expect(held.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(held.outcome.unresolved_dependents.length).toBeGreaterThan(0);
    expect(lifecycleOf(s)).toBe("active");
    expect(instrumentFact(s)!.version).toBe(1);
    expect(timeOf(s).value).toBeLessThan(SUNSET_LATER.value);
    expect(s.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX,
    });
    // the same choice re-presented replays and writes nothing; it neither resumes nor abandons the work
    expect(
      await unchanged(s, () => advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))),
    ).toEqual(PC_TARGET_COMMITTED);
  });

  it("no silent advance: a new initial choice, a re-used initial identity, a changed target, a foreign lineage and the held identity itself are all refused and the hold stays intact", async () => {
    const { s, restore } = await heldCampaign();
    restore();
    const hold = structuredClone(s.coordinator.state()!.value);
    // a new, initial choice never abandons or overrides the hold
    expect(
      await unchanged(s, () =>
        advancePcTarget(
          trustedPcTarget(s, {
            target: SUNSET_LATER,
            transaction: pcTargetTransaction("tx-initial-while-held"),
          }),
        ),
      ),
    ).toEqual(REFUSED);
    for (const held of [
      { from_transaction: PC_TARGET_TX, target: at(250) }, // not the target the player authorized
      { from_transaction: PC_TARGET_TX, target: { unit: "other-unit", value: 300 } },
      { from_transaction: "tx-never-committed", target: SUNSET_LATER }, // a foreign / unknown lineage
      { from_transaction: PC_TARGET_TX },
      { target: SUNSET_LATER },
      { from_transaction: PC_TARGET_TX, target: SUNSET_LATER, requested: null },
    ])
      expect(
        await unchanged(s, () => advancePcTarget(trustedPcHeld(s, { held }))),
        JSON.stringify(held),
      ).toEqual(REFUSED);
    // the new choice is a separate identity: the held transaction's own id is inert
    expect(
      await unchanged(s, () =>
        advancePcTarget(trustedPcHeld(s, { transaction: pcTargetTransaction(PC_TARGET_TX) })),
      ),
    ).toEqual(REFUSED);
    // role/permission other than the player pair on the resume
    expect(
      await unchanged(s, () =>
        advancePcTarget(
          trustedPcHeld(s, {
            transaction: pcTargetTransaction(PC_TARGET_TX2, {
              context: { role: "role.archivist", permission: "permission.canon.write" },
            }),
          }),
        ),
      ),
    ).toEqual(REFUSED);
    expect(s.coordinator.state()!.value).toEqual(hold);
  });

  it("a new separately confirmed choice consumes exactly the held remainder with the earlier request verbatim; GIP then expires the Instrument once; nothing is re-expired afterwards", async () => {
    const { s, restore } = await heldCampaign();
    restore();
    const priorRecord = structuredClone(tx(s));

    expect(await advancePcTarget(trustedPcHeld(s))).toEqual(PC_TARGET_COMMITTED);

    const resumed = tx(s, PC_TARGET_TX2);
    expect(resumed.continues).toBe(PC_TARGET_TX);
    expect(resumed.requested).toEqual(priorRecord.requested);
    expect(resumed.requested).toEqual({ target: SUNSET_LATER, condition: null });
    expect(resumed.outcome).toMatchObject({ stop_reason: "TARGET_REACHED", remainder: null });
    expect(resumed.stages.map((x) => x.stage)).toEqual([GIP_STAGE]);
    expect(tx(s)).toEqual(priorRecord); // committed history is kept
    expect(gipRead(s).lifecycle_status).toBe("expired");
    expect(instrumentFact(s)!.version).toBe(2);
    expect(timeOf(s)).toEqual(SUNSET_LATER);
    expect(s.coordinator.state()!.value.continuation).toBeNull();

    // the resume replays under its identity and writes nothing; the consumed hold cannot be consumed again
    expect(await unchanged(s, () => advancePcTarget(trustedPcHeld(s)))).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(
      await unchanged(s, () =>
        advancePcTarget(trustedPcHeld(s, { transaction: pcTargetTransaction(PC_TARGET_TX3) })),
      ),
    ).toEqual(REFUSED);
    // the resume identity does not replay through the initial branch
    expect(
      await unchanged(s, () =>
        advancePcTarget(
          trustedPcTarget(s, {
            target: SUNSET_LATER,
            transaction: pcTargetTransaction(PC_TARGET_TX2),
          }),
        ),
      ),
    ).toEqual(REFUSED);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a fault that persists commits another truthful hold with no phantom expiry; a third choice resumes only the latest hold", async () => {
    const { s, restore } = await heldCampaign();
    // still faulted: the second choice is also held
    expect(await advancePcTarget(trustedPcHeld(s))).toEqual(PC_TARGET_COMMITTED);
    restore();
    expect(tx(s, PC_TARGET_TX2).outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(lifecycleOf(s)).toBe("active");
    expect(s.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX2,
    });
    // the first hold is stale now
    expect(
      await unchanged(s, () =>
        advancePcTarget(trustedPcHeld(s, { transaction: pcTargetTransaction(PC_TARGET_TX3) })),
      ),
    ).toEqual(REFUSED);
    expect(
      await advancePcTarget(
        trustedPcHeld(s, {
          held: { from_transaction: PC_TARGET_TX2, target: SUNSET_LATER },
          transaction: pcTargetTransaction(PC_TARGET_TX3),
        }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(tx(s, PC_TARGET_TX3).continues).toBe(PC_TARGET_TX2);
    expect(gipRead(s).lifecycle_status).toBe("expired");
    expect(instrumentFact(s)!.version).toBe(2);
    expect(timeOf(s)).toEqual(SUNSET_LATER);
  });

  it("a hold left by the NULL-PC-style kernel request for a different target is not this lineage", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const restore = refuseGipStageOf(s);
    // the held work is for 250, authorized by the player pair under another identity
    expect(
      await advancePcTarget(
        trustedPcTarget(s, { target: at(250), transaction: pcTargetTransaction("tx-250") }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    restore();
    expect(
      await unchanged(s, () =>
        advancePcTarget(
          trustedPcHeld(s, { held: { from_transaction: "tx-250", target: SUNSET_LATER } }),
        ),
      ),
    ).toEqual(REFUSED);
    expect(
      await advancePcTarget(
        trustedPcHeld(s, { held: { from_transaction: "tx-250", target: at(250) } }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(gipRead(s).lifecycle_status).toBe("expired");
  });
});

describe("campaign isolation", () => {
  it("a context bound to one campaign acts on that campaign only, even when another holds identical identifiers", async () => {
    const a = await stationarySunsetPcCampaign(SUNSET_MID);
    const b = await stationarySunsetPcCampaign(SUNSET_MID);
    const bBefore = movementSummary(b);
    expect(await advancePcTarget(trustedPcTarget(a, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(movementSummary(b)).toEqual(bBefore);
    expect(lifecycleOf(a)).toBe("expired");
    expect(lifecycleOf(b)).toBe("active");
  });
});

describe("interrupted-run recovery converges on one expiry under one transaction identity", () => {
  const reference = async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    return movementSummary(s).head.state_sha256;
  };
  const cuts: readonly [string, (g: CommitGroup) => boolean, "active" | "expired"][] = [
    ["transaction authority", isAuthority(PC_TARGET_TX), "active"],
    ["GIP expiry stage", isGip, "active"],
    ["transaction record", isTxRecord(PC_TARGET_TX), "expired"],
  ];

  for (const [name, pred, lifecycle] of cuts) {
    it(`a crash before the ${name} leaves what committed intact; the same request adopts it and converges byte-identically with no second expiry`, async () => {
      const ref = await reference();
      const s = await stationarySunsetPcCampaign(SUNSET_MID);
      const restore = crashWhen(s, pred);
      expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
        PC_TARGET_UNKNOWN,
      );
      restore();
      expect(lifecycleOf(s)).toBe(lifecycle);
      expect(s.coordinator.transaction(PC_TARGET_TX)).toBeUndefined();
      expect(timeOf(s)).toEqual(at(100));
      expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
        PC_TARGET_COMMITTED,
      );
      expect(movementSummary(s).head.state_sha256).toBe(ref);
      expect(instrumentFact(s)!.version).toBe(2);
      expect(tx(s).stages.map((x) => x.stage.owner_operation)).toEqual([GIP_OP]);
      expect(s.campaign.verify()).toEqual([]);
    });
  }

  it("a lost reply after the GIP expiry commits is unknown, never safely absent, and the same request converges with no duplicate expiry", async () => {
    const ref = await reference();
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const restore = loseReplyWhen(s, isGip);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_UNKNOWN,
    );
    restore();
    expect(lifecycleOf(s)).toBe("expired");
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(movementSummary(s).head.state_sha256).toBe(ref);
    expect(instrumentFact(s)!.version).toBe(2);
  });

  it("a lost reply on the sealed record is unknown; the same identity then reports the committed transaction and writes nothing", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const restore = loseReplyWhen(s, isTxRecord(PC_TARGET_TX));
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_UNKNOWN,
    );
    restore();
    const summary = movementSummary(s);
    expect(
      await unchanged(s, () => advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(movementSummary(s)).toEqual(summary);
  });

  it("save → close → reopen after the GIP stage committed but before the sealed record: the same identity converges and the receipt is conserved", async () => {
    const ref = await reference();
    const dir = tempDir();
    const s = await stationarySunsetPcCampaign(SUNSET_MID, "registered", dir);
    crashWhen(s, isTxRecord(PC_TARGET_TX));
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_UNKNOWN,
    );
    await s.campaign.close();

    const reopened = await reopenMovement(dir);
    expect(reopened.campaign.verify()).toEqual([]);
    expect(gipRead(reopened).lifecycle_status).toBe("expired");
    expect(reopened.coordinator.transaction(PC_TARGET_TX)).toBeUndefined();
    expect(reopened.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "STATIONARY_AT_ORIGIN" });
    expect(await advancePcTarget(trustedPcTarget(reopened, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(movementSummary(reopened).head.state_sha256).toBe(ref);
    expect(reopened.coordinator.state()!.value.last_transaction).toBe(PC_TARGET_TX);
    expect(instrumentFact(reopened)!.version).toBe(2);
    expect(reopened.campaign.store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)).toBeDefined();
    await reopened.campaign.close();
  });

  it("a held remainder survives save → close → reopen and is then resumed only by a fresh choice", async () => {
    const dir = tempDir();
    const s = await stationarySunsetPcCampaign(SUNSET_MID, "registered", dir);
    const restore = refuseGipStageOf(s);
    expect(await advancePcTarget(trustedPcTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    restore();
    await s.campaign.close();

    const reopened = await reopenMovement(dir);
    expect(reopened.campaign.verify()).toEqual([]);
    expect(reopened.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX,
    });
    expect(lifecycleOf(reopened)).toBe("active");
    // nothing resumes on reopen or on re-presenting the first choice
    expect(
      await unchanged(reopened, () =>
        advancePcTarget(trustedPcTarget(reopened, { target: SUNSET_LATER })),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(lifecycleOf(reopened)).toBe("active");
    expect(await advancePcTarget(trustedPcHeld(reopened))).toEqual(PC_TARGET_COMMITTED);
    expect(lifecycleOf(reopened)).toBe("expired");
    await reopened.campaign.close();
  });
});
