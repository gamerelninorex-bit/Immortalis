/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign store to simulate refused stages and lost replies */
// ORIGINAL active-PC target-only temporal advance — the real path over the real owners. The same separately player-authorized, trusted,
// exact canonical target gateway that already serves the post-handover PC now also accepts the ORIGINAL first-activation PC whose
// World-State custody was qualified by the two retained referee decisions. The Temporal kernel alone selects what is due and GIP's own
// `gipSunsetExpiryProvider` alone expires an Instrument at its own earned instant.
//
// WHY THIS IS NOT A TAUTOLOGY. The campaign is built only by owner paths that ship: `establish-locality` (world, locus),
// `author-character` (released character, ACTIVATION binding), `establish-character-locus` (World-State's qualified custody), then GIP's
// own adapter (institution, office, Scope Binding, `active` sunset-bearing Instrument and its Temporal registration) and the Temporal
// owner (canonical time). No fixture writes `expired`, a due flag, a stage, a custody or a verdict. Every positive is paired with a
// falsifying control built from the SAME antecedents: the unchanged base gateway refuses this very campaign; a target short of the
// sunset leaves the Instrument active; the same campaign WITHOUT the qualified custody is refused; and the facts are scanned to show no
// `expired` value exists anywhere before the gateway runs. The scripted referee behind the custody proves PLUMBING only, never that an
// AI understood a sentence; no new AI semantic result is claimed. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  ORIGINAL_ACTIVATION,
  PLAYER_CHARACTER_BINDING_KEY,
  RefereeDecisionRecordSchema,
  gipInstrumentKey,
  gipSunsetStage,
  logisticsObjectId,
  pcMovementRequestId,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  worldPcLocusCustodyKey,
  type CommitGroup,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import { advanceActivePcToTarget } from "@immortalis/protocol";
import { INSTRUMENT_A } from "@immortalis/testkit";
import { SUNSET_AT, SUNSET_LATER, SUNSET_MID, at } from "../support/gip-sunset.ts";
import { gipOf, instrumentFact, lifecycleOf } from "../support/pc-gip-sunset.ts";
import {
  ORIGIN_TIME,
  PC_ID,
  advanceOriginal,
  originalSunsetCampaign,
  reopenOriginal,
  trustedOriginalHeld,
  trustedOriginalTarget,
  type OriginalSeeded,
} from "../support/original-pc-target.ts";
import {
  PC_TARGET_COMMITTED,
  PC_TARGET_REFUSAL,
  PC_TARGET_REQUEST,
  PC_TARGET_TX,
  PC_TARGET_TX2,
  PC_TARGET_UNKNOWN,
  crashWhen,
  loseReplyWhen,
  pcTargetTransaction,
  recordCommits,
  refuseGipStageOf,
} from "../support/pc-target-advance.ts";
import { movementSummary, snapshotFacts } from "../support/pc-movement.ts";

const REFUSED = JSON.parse(PC_TARGET_REFUSAL);
const SUNSET_OBJECT = "obj-gip-sunset-instrument-a-1";
const GIP_STAGE = gipSunsetStage(INSTRUMENT_A);
const GIP_OP = { owner: "gip", operation: "gip-expire-instrument-at-sunset" };

const isGip = (g: CommitGroup) => g.writes.some((w) => w.key === gipInstrumentKey(INSTRUMENT_A));
const isAuthority = (id: string) => (g: CommitGroup) =>
  g.writes.some((w) => w.key === temporalTransactionAuthorityKey(id));
const isTxRecord = (id: string) => (g: CommitGroup) =>
  g.writes.some((w) => w.key === temporalTransactionKey(id));

const timeOf = (s: OriginalSeeded) => s.coordinator.state()!.value.canonical_time;
const tx = (s: OriginalSeeded, id = PC_TARGET_TX) => s.coordinator.transaction(id)!.value;
const gipRead = (s: OriginalSeeded): GovernanceInstrument =>
  gipOf(s).governanceInstrument(INSTRUMENT_A)!.value;
const keyOf = (v: unknown) => JSON.stringify(v);

/** Runs `attempt` and proves it changed nothing: the whole store (every fact, receipt and head) is as it was. */
const unchanged = async (s: OriginalSeeded, attempt: () => Promise<unknown>): Promise<unknown> => {
  const before = movementSummary(s);
  const r = await attempt();
  expect(movementSummary(s)).toEqual(before);
  return r;
};

describe("the antecedents are independently owner-committed; nothing in the campaign says `expired` before the gateway runs", () => {
  it("the character is an ORIGINAL ACTIVATION binding with World-State custody qualified by two retained referee decisions; GIP holds an `active` Instrument with a real sunset", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    const binding = s.campaign.binding()!.value;
    expect(binding.active_pc.entity_id).toBe(PC_ID);
    expect(binding.transition.type).toBe(ORIGINAL_ACTIVATION);
    const custody = s.campaign.pcPhysicalLocusCustody(PC_ID)!;
    expect(custody.fact.owner).toBe("world_state");
    expect(custody.value.basis.established_from).toBe(ORIGINAL_ACTIVATION);
    const basis = custody.value.basis;
    if (basis.established_from !== ORIGINAL_ACTIVATION) throw new Error("unreachable");
    for (const pin of [basis.qualified_by.native, basis.qualified_by.physical]) {
      const fact = s.campaign.store.getFact(pin.fact_key)!;
      expect(fact.version).toBe(pin.version);
      expect(fact.owner).toBe("referee_adjudication_kernel");
      expect(RefereeDecisionRecordSchema.safeParse(fact.value).success).toBe(true);
    }
    expect(s.campaign.pcCurrentLocus(PC_ID)).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
      authority: "WORLD_STATE",
      movement: null,
    });
    // no movement of any kind exists for the character
    expect(s.campaign.pcMovementCommitment(PC_ID)).toBeUndefined();
    expect(s.campaign.pcMovementRequest(PC_ID)).toBeUndefined();
    // GIP's own committed source and its own Instrument, still active, with the sunset as ITS declared term
    expect(gipRead(s).lifecycle_status).toBe("active");
    expect(gipRead(s).sunset_condition).toEqual(SUNSET_MID);
    expect(instrumentFact(s)!.owner).toBe("gip");
    expect(s.coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual([SUNSET_OBJECT]);
    expect(timeOf(s)).toEqual(ORIGIN_TIME);
    // the falsifying scan: no committed fact anywhere carries an expired lifecycle (or any lifecycle other than active)
    for (const f of s.campaign.store.listFacts())
      expect(keyOf(f.value), f.key).not.toMatch(/"lifecycle_status":"(?!active")/);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("positive: the original PC's campaign advances to the confirmed target; GIP alone expires the Instrument at its own boundary", () => {
  it("GIP's stage runs once at the sunset, the kernel seals the transaction, and a later authoritative GIP read sees `expired`", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    const before = snapshotFacts(s);
    const prior = structuredClone(instrumentFact(s)!.value as any);
    const commits = recordCommits(s);

    expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );

    expect(gipRead(s).lifecycle_status).toBe("expired");
    expect(lifecycleOf(s)).toBe("expired");
    expect(instrumentFact(s)!.version).toBe(2);
    expect(instrumentFact(s)!.value).toEqual({ ...prior, lifecycle_status: "expired" });

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

    // the kernel opened the authority BEFORE the owner stage; the sealed record is last; GIP, not the gateway, wrote the Instrument
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
    const gipGroups = commits().filter(isGip);
    expect(gipGroups).toHaveLength(1);
    expect(gipGroups[0]!.owner).toBe("gip");
    expect(commits().filter((g) => g.owner === "world_state")).toEqual([]);

    expect(timeOf(s)).toEqual(SUNSET_LATER);
    expect(s.coordinator.state()!.value.continuation).toBeNull();
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);

    // the PC is exactly where it was: the qualified custody, the binding and the locus are byte-identical
    const after = snapshotFacts(s);
    for (const k of [worldPcLocusCustodyKey(PC_ID), PLAYER_CHARACTER_BINDING_KEY]) {
      expect(before.has(k), k).toBe(true);
      expect(after.get(k), k).toEqual(before.get(k));
    }
    expect(s.campaign.pcCurrentLocus(PC_ID)).toMatchObject({ phase: "STATIONARY_AT_ORIGIN" });
    // only the Instrument and the kernel's own temporal facts changed or appeared: no knowledge, packet, observer, movement or world fact
    const changed = [...after.keys()].filter(
      (k) => before.has(k) && JSON.stringify(after.get(k)) !== JSON.stringify(before.get(k)),
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

  it("falsifying control: the UNCHANGED base gateway refused exactly this campaign (original custody is not the handover branch); the Instrument stayed active", async () => {
    // this control is pinned by the conformance suite (the base module's hash) and demonstrated here by the one legal difference:
    // the same sunset-bearing campaign whose character has NO qualified custody is refused, as every non-handover state was
    const s = await originalSunsetCampaign(SUNSET_MID, { custody: false });
    expect(s.campaign.pcPhysicalLocusCustody(PC_ID)).toBeUndefined();
    expect(s.campaign.pcCurrentLocus(PC_ID)).toBeUndefined();
    expect(
      await unchanged(s, () => advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))),
    ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
    expect(timeOf(s)).toEqual(ORIGIN_TIME);
    expect(s.coordinator.transaction(PC_TARGET_TX)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("save → close → reopen: the result survives, the same identity replays and writes nothing", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    const summary = movementSummary(s);
    await s.campaign.close();

    const reopened = await reopenOriginal(s.dirs);
    expect(reopened.campaign.verify()).toEqual([]);
    expect(gipRead(reopened).lifecycle_status).toBe("expired");
    expect(reopened.campaign.pcPhysicalLocusCustody(PC_ID)!.value.basis.established_from).toBe(
      ORIGINAL_ACTIVATION,
    );
    expect(reopened.campaign.pcCurrentLocus(PC_ID)).toMatchObject({
      phase: "STATIONARY_AT_ORIGIN",
    });
    expect(timeOf(reopened)).toEqual(SUNSET_LATER);
    expect(movementSummary(reopened)).toEqual(summary);
    expect(
      await unchanged(reopened, () =>
        advanceOriginal(trustedOriginalTarget(reopened, { target: SUNSET_LATER })),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    // a further, distinct choice past the spent sunset carries time and never expires it a second time
    expect(
      await advanceOriginal(
        trustedOriginalTarget(reopened, {
          target: at(400),
          transaction: pcTargetTransaction("tx-later"),
        }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(instrumentFact(reopened)!.version).toBe(2);
    expect(tx(reopened, "tx-later").stages).toEqual([]);
    await reopened.campaign.close();
  });

  it("replays the same status however often it is repeated and writes nothing; a conflicting replay is refused and never amends the record", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    const summary = movementSummary(s);
    for (let i = 0; i < 3; i++)
      expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
        PC_TARGET_COMMITTED,
      );
    expect(movementSummary(s)).toEqual(summary);
    const conflicts = [
      { target: at(350) },
      { transaction: pcTargetTransaction(PC_TARGET_TX, { cause: "another-cause" }) },
      {
        transaction: pcTargetTransaction(PC_TARGET_TX, {
          trigger: { kind: "player-pc-target-choice", ref: "another-choice" },
        }),
      },
      {
        transaction: pcTargetTransaction(PC_TARGET_TX, {
          publication: { basis: "another-basis", secrecy: "fixture-visibility" },
        }),
      },
    ];
    for (const over of conflicts)
      expect(
        await unchanged(s, () =>
          advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER, ...over })),
        ),
        keyOf(over),
      ).toEqual(REFUSED);
    expect(instrumentFact(s)!.version).toBe(2);
  });
});

describe("falsifying contrast: the same legitimate Instrument stays active before its sunset, and expires once at or after it", () => {
  it("a target strictly BEFORE the sunset commits, carries time and leaves the Instrument active and enrolled; reaching it expires it once", async () => {
    const s = await originalSunsetCampaign(SUNSET_AT);
    expect(
      await advanceOriginal(
        trustedOriginalTarget(s, {
          target: SUNSET_MID,
          transaction: pcTargetTransaction("tx-before"),
        }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(gipRead(s).lifecycle_status).toBe("active");
    expect(instrumentFact(s)!.version).toBe(1);
    expect(timeOf(s)).toEqual(SUNSET_MID);
    expect(tx(s, "tx-before").stages).toEqual([]);
    expect(s.coordinator.boundaryIndex().entries).toEqual([
      expect.objectContaining({ object_id: SUNSET_OBJECT, at: SUNSET_AT }),
    ]);

    expect(
      await advanceOriginal(
        trustedOriginalTarget(s, { target: SUNSET_AT, transaction: pcTargetTransaction("tx-at") }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(gipRead(s).lifecycle_status).toBe("expired");
    expect(instrumentFact(s)!.version).toBe(2);
    expect(tx(s, "tx-at").stages.map((x) => x.stage)).toEqual([GIP_STAGE]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an Instrument with no sunset term has no GIP stage and no Temporal object: nothing expires", async () => {
    const s = await originalSunsetCampaign(null, { setup: "no-sunset" });
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(gipRead(s).lifecycle_status).toBe("active");
    expect(tx(s).stages).toEqual([]);
    expect(timeOf(s)).toEqual(SUNSET_LATER);
  });

  it("a committed but unregistered sunset refuses the whole request, writing nothing; completing GIP's enrollment lifts the refusal", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID, { setup: "pending" });
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(
      await unchanged(s, () => advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))),
    ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
    expect(timeOf(s)).toEqual(ORIGIN_TIME);
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
      await advanceOriginal(
        trustedOriginalTarget(s, {
          target: SUNSET_LATER,
          transaction: pcTargetTransaction("tx-2"),
        }),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(gipRead(s).lifecycle_status).toBe("expired");
  });
});

describe("refusal: the original PC is advanced only on qualified custody, the bound identity and the player's trusted target", () => {
  it("no qualified custody is the one refusal and writes nothing, whatever the target", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID, { custody: false });
    for (const target of [SUNSET_LATER, SUNSET_MID, at(101)])
      expect(
        await unchanged(s, () => advanceOriginal(trustedOriginalTarget(s, { target }))),
        keyOf(target),
      ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
  });

  it("a wrong, foreign or non-PC identity is inert; a campaign not holding the bound PC is inert", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    for (const pc_id of ["pc-someone-else", "locus-salt-pans", "", 7, null])
      expect(
        await unchanged(s, () =>
          advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER, pc_id })),
        ),
        keyOf(pc_id),
      ).toEqual(REFUSED);
    const none = await originalSunsetCampaign(SUNSET_MID, { custody: false });
    expect(
      await unchanged(none, () =>
        advanceOriginal(trustedOriginalTarget(none, { target: SUNSET_LATER })),
      ),
    ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
  });

  it("an authority other than the player pair, and a wrong-unit, backward or malformed target, are refused and write nothing", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    for (const context of [
      { role: "role.archivist", permission: "permission.canon.write" },
      { role: "role.player_character", permission: "permission.player_choice.commit" },
      { role: "role.player", permission: "permission.canon.write" },
    ])
      expect(
        await unchanged(s, () =>
          advanceOriginal(
            trustedOriginalTarget(s, {
              target: SUNSET_LATER,
              transaction: pcTargetTransaction("tx-x", { context }),
            }),
          ),
        ),
        keyOf(context),
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
        await unchanged(s, () => advanceOriginal(trustedOriginalTarget(s, { target }))),
        keyOf(target),
      ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
    expect(timeOf(s)).toEqual(ORIGIN_TIME);
  });

  it("the host cannot name a target, role, authority, confirmation or outcome: any field beyond the operation is refused, and a fabricated context is not a context", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    const bound = () => trustedOriginalTarget(s, { target: SUNSET_LATER });
    for (const over of [
      { target: SUNSET_LATER },
      { target: { unit: SUNSET_LATER.unit, value: 150 } },
      { role: "role.player" },
      { permission: "permission.player_choice.commit" },
      { confirmed: true },
      { expired: true },
      { lifecycle_status: "expired" },
      { instrument: INSTRUMENT_A },
      { duration: 100 },
      { pc_id: PC_ID },
      { transaction_id: "tx-host" },
    ])
      expect(
        await unchanged(s, () => advanceActivePcToTarget(bound(), PC_TARGET_REQUEST(over))),
        keyOf(over),
      ).toEqual(REFUSED);
    for (const request of [undefined, null, "advance_active_pc_to_target", [], {}])
      expect(
        await unchanged(s, () => advanceActivePcToTarget(bound(), request)),
        keyOf(request),
      ).toEqual(REFUSED);
    for (const forged of [
      {},
      Object.freeze({}),
      { target: SUNSET_LATER },
      { ...bound() },
      Object.create(bound()),
      null,
      "context",
    ])
      expect(
        await unchanged(s, () => advanceActivePcToTarget(forged as never, PC_TARGET_REQUEST())),
      ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
    expect(timeOf(s)).toEqual(ORIGIN_TIME);
  });

  it("a movement's own identity is not a progression instruction", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    const requestId = pcMovementRequestId(PC_ID);
    for (const id of [requestId, logisticsObjectId(requestId), `pc-relocation-x:${PC_ID}`])
      expect(
        await unchanged(s, () =>
          advanceOriginal(
            trustedOriginalTarget(s, {
              target: SUNSET_LATER,
              transaction: pcTargetTransaction(id),
            }),
          ),
        ),
        id,
      ).toEqual(REFUSED);
  });
});

describe("the original custody states where the PC IS and nothing more: any movement state contaminating it is refused", () => {
  /** The campaign as the gateway reads it, with one owner read reporting a movement state the owners themselves would not admit. */
  const contaminated = (s: OriginalSeeded, over: Record<string, unknown>) => {
    const c = s.campaign;
    return {
      binding: () => c.binding(),
      pcCurrentLocus: (pcId: string) => c.pcCurrentLocus(pcId),
      pcMovementCommitment: (pcId: string) => c.pcMovementCommitment(pcId),
      pcMovementRequest: (pcId: string) => c.pcMovementRequest(pcId),
      pcPhysicalLocusCustody: (pcId: string) => c.pcPhysicalLocusCustody(pcId),
      get store() {
        return c.store;
      },
      ...over,
    };
  };
  const stray = { fact: {}, value: {} } as never;

  it("the owners themselves admit no movement for an original custody (voluntary movement stays handover-only)", async () => {
    const { derivePcMovementCommitment, pcMovementCommitmentViolation } =
      await import("@immortalis/engine");
    const { PLAYER_CHOICE_AUTHORITY, pcMovementCommitmentKey } =
      await import("@immortalis/contracts");
    const s = await originalSunsetCampaign(SUNSET_MID);
    const commitment = derivePcMovementCommitment(
      {
        pc_id: PC_ID,
        destination: { world_id: "world-ashfall", locus_id: "locus-elsewhere" },
        authored_under: { ...PLAYER_CHOICE_AUTHORITY },
      },
      s.campaign.store,
    );
    if (!commitment.ok) throw new Error("unreachable");
    const facts = new Map(s.campaign.store.listFacts().map((f) => [f.key, f]));
    expect(
      pcMovementCommitmentViolation(pcMovementCommitmentKey(PC_ID), commitment.value, facts),
    ).toMatch(/limited to the post-handover branch/);
  });

  const phaseOf = (s: OriginalSeeded, phase: string) => ({
    pcCurrentLocus: (id: string) => ({ ...s.campaign.pcCurrentLocus(id), phase }) as never,
  });
  const states: readonly [string, (s: OriginalSeeded) => Record<string, unknown>][] = [
    ["a willingness commitment-of-record", () => ({ pcMovementCommitment: () => stray })],
    ["a PC-owned movement request", () => ({ pcMovementRequest: () => stray })],
    ["a locus that is in transfer", (s) => phaseOf(s, "IN_TRANSFER")],
    [
      "a destination commit awaiting retirement",
      (s) => phaseOf(s, "DESTINATION_COMMITTED_RETIREMENT_PENDING"),
    ],
  ];
  for (const [name, over] of states) {
    it(`${name} is refused: the Instrument is not expired and nothing is written`, async () => {
      const s = await originalSunsetCampaign(SUNSET_MID);
      const campaign = contaminated(s, over(s));
      expect(
        await unchanged(s, () =>
          advanceOriginal(trustedOriginalTarget(s, { campaign, target: SUNSET_LATER })),
        ),
      ).toEqual(REFUSED);
      expect(lifecycleOf(s)).toBe("active");
    });
  }

  it("a 'settled destination' is never recognised for an original custody (the movement branch is handover-only)", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    const campaign = contaminated(s, {
      pcMovementCommitment: () => stray,
      pcMovementRequest: () => stray,
      ...phaseOf(s, "DESTINATION_COMMITTED"),
    });
    expect(
      await unchanged(s, () =>
        advanceOriginal(trustedOriginalTarget(s, { campaign, target: SUNSET_LATER })),
      ),
    ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
  });

  it("a custody whose basis is not the one the operative binding carries is refused (an ACTIVATION custody rests on the ACTIVATION binding)", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    const real = s.campaign.binding()!;
    const campaign = contaminated(s, {
      binding: () =>
        ({
          ...real,
          value: {
            ...real.value,
            transition: { ...real.value.transition, type: "EXISTING_ACTOR_HANDOVER" },
          },
        }) as never,
    });
    expect(
      await unchanged(s, () =>
        advanceOriginal(trustedOriginalTarget(s, { campaign, target: SUNSET_LATER })),
      ),
    ).toEqual(REFUSED);
    expect(lifecycleOf(s)).toBe("active");
  });
});

describe("a kernel hold is truthful, and only a fresh separately confirmed choice for exactly that lineage continues it", () => {
  async function heldCampaign() {
    const s = await originalSunsetCampaign(SUNSET_MID);
    const restore = refuseGipStageOf(s);
    expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    restore();
    return s;
  }

  it("a stage GIP cannot lawfully commit holds the work: no expiry, time short of the sunset, the host sees the same committed status", async () => {
    const s = await heldCampaign();
    expect(tx(s).outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(tx(s).outcome.unresolved_dependents.length).toBeGreaterThan(0);
    expect(lifecycleOf(s)).toBe("active");
    expect(instrumentFact(s)!.version).toBe(1);
    expect(timeOf(s).value).toBeLessThan(SUNSET_LATER.value);
    expect(s.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX,
    });
    expect(
      await unchanged(s, () => advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))),
    ).toEqual(PC_TARGET_COMMITTED);
  });

  it("no silent advance: a new initial choice, a changed target, a foreign lineage and the held identity itself are refused and the hold stays intact", async () => {
    const s = await heldCampaign();
    const hold = structuredClone(s.coordinator.state()!.value);
    expect(
      await unchanged(s, () =>
        advanceOriginal(
          trustedOriginalTarget(s, {
            target: SUNSET_LATER,
            transaction: pcTargetTransaction("tx-initial-while-held"),
          }),
        ),
      ),
    ).toEqual(REFUSED);
    for (const held of [
      { from_transaction: PC_TARGET_TX, target: at(250) },
      { from_transaction: PC_TARGET_TX, target: { unit: "other-unit", value: 300 } },
      { from_transaction: "tx-never-committed", target: SUNSET_LATER },
      { from_transaction: PC_TARGET_TX },
      { target: SUNSET_LATER },
      { from_transaction: PC_TARGET_TX, target: SUNSET_LATER, requested: null },
    ])
      expect(
        await unchanged(s, () => advanceOriginal(trustedOriginalHeld(s, { held }))),
        keyOf(held),
      ).toEqual(REFUSED);
    expect(
      await unchanged(s, () =>
        advanceOriginal(trustedOriginalHeld(s, { transaction: pcTargetTransaction(PC_TARGET_TX) })),
      ),
    ).toEqual(REFUSED);
    expect(s.coordinator.state()!.value).toEqual(hold);
  });

  it("a new separately confirmed choice consumes exactly the held remainder with the earlier request verbatim; GIP then expires the Instrument once", async () => {
    const s = await heldCampaign();
    const priorRecord = structuredClone(tx(s));

    expect(await advanceOriginal(trustedOriginalHeld(s))).toEqual(PC_TARGET_COMMITTED);

    const resumed = tx(s, PC_TARGET_TX2);
    expect(resumed.continues).toBe(PC_TARGET_TX);
    expect(resumed.requested).toEqual(priorRecord.requested);
    expect(resumed.requested).toEqual({ target: SUNSET_LATER, condition: null });
    expect(resumed.outcome).toMatchObject({ stop_reason: "TARGET_REACHED", remainder: null });
    expect(resumed.stages.map((x) => x.stage)).toEqual([GIP_STAGE]);
    expect(tx(s)).toEqual(priorRecord);
    expect(gipRead(s).lifecycle_status).toBe("expired");
    expect(instrumentFact(s)!.version).toBe(2);
    expect(timeOf(s)).toEqual(SUNSET_LATER);
    expect(s.coordinator.state()!.value.continuation).toBeNull();
    // the resume replays under its identity and writes nothing; it never replays through the initial branch
    expect(await unchanged(s, () => advanceOriginal(trustedOriginalHeld(s)))).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(
      await unchanged(s, () =>
        advanceOriginal(
          trustedOriginalTarget(s, {
            target: SUNSET_LATER,
            transaction: pcTargetTransaction(PC_TARGET_TX2),
          }),
        ),
      ),
    ).toEqual(REFUSED);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a held remainder survives save → close → reopen and is then resumed only by a fresh choice", async () => {
    const s = await heldCampaign();
    await s.campaign.close();
    const reopened = await reopenOriginal(s.dirs);
    expect(reopened.campaign.verify()).toEqual([]);
    expect(reopened.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: PC_TARGET_TX,
    });
    expect(lifecycleOf(reopened)).toBe("active");
    expect(
      await unchanged(reopened, () =>
        advanceOriginal(trustedOriginalTarget(reopened, { target: SUNSET_LATER })),
      ),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(lifecycleOf(reopened)).toBe("active");
    expect(await advanceOriginal(trustedOriginalHeld(reopened))).toEqual(PC_TARGET_COMMITTED);
    expect(lifecycleOf(reopened)).toBe("expired");
    await reopened.campaign.close();
  });
});

describe("interrupted-run recovery converges on one expiry under one transaction identity", () => {
  const cuts: readonly [string, (g: CommitGroup) => boolean, "active" | "expired"][] = [
    ["transaction authority", isAuthority(PC_TARGET_TX), "active"],
    ["GIP expiry stage", isGip, "active"],
    ["transaction record", isTxRecord(PC_TARGET_TX), "expired"],
  ];

  for (const [name, pred, lifecycle] of cuts) {
    it(`a crash before the ${name} leaves what committed intact; the same request adopts it and converges with no second expiry`, async () => {
      const s = await originalSunsetCampaign(SUNSET_MID);
      const restore = crashWhen(s as never, pred);
      expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
        PC_TARGET_UNKNOWN,
      );
      restore();
      expect(lifecycleOf(s)).toBe(lifecycle);
      expect(s.coordinator.transaction(PC_TARGET_TX)).toBeUndefined();
      expect(timeOf(s)).toEqual(ORIGIN_TIME);
      expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
        PC_TARGET_COMMITTED,
      );
      expect(instrumentFact(s)!.version).toBe(2);
      expect(tx(s).stages.map((x) => x.stage.owner_operation)).toEqual([GIP_OP]);
      expect(s.campaign.verify()).toEqual([]);
    });
  }

  it("a lost reply after the GIP expiry commits is unknown, never safely absent, and the same request converges with no duplicate expiry", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    const restore = loseReplyWhen(s as never, isGip);
    expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_UNKNOWN,
    );
    restore();
    expect(lifecycleOf(s)).toBe("expired");
    expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_COMMITTED,
    );
    expect(instrumentFact(s)!.version).toBe(2);
  });

  it("save → close → reopen after the GIP stage committed but before the sealed record: the same identity converges, the custody untouched", async () => {
    const s = await originalSunsetCampaign(SUNSET_MID);
    const custody = structuredClone(s.campaign.pcPhysicalLocusCustody(PC_ID)!.fact);
    crashWhen(s as never, isTxRecord(PC_TARGET_TX));
    expect(await advanceOriginal(trustedOriginalTarget(s, { target: SUNSET_LATER }))).toEqual(
      PC_TARGET_UNKNOWN,
    );
    await s.campaign.close();

    const reopened = await reopenOriginal(s.dirs);
    expect(reopened.campaign.verify()).toEqual([]);
    expect(gipRead(reopened).lifecycle_status).toBe("expired");
    expect(reopened.coordinator.transaction(PC_TARGET_TX)).toBeUndefined();
    expect(
      await advanceOriginal(trustedOriginalTarget(reopened, { target: SUNSET_LATER })),
    ).toEqual(PC_TARGET_COMMITTED);
    expect(reopened.coordinator.state()!.value.last_transaction).toBe(PC_TARGET_TX);
    expect(instrumentFact(reopened)!.version).toBe(2);
    expect(reopened.campaign.pcPhysicalLocusCustody(PC_ID)!.fact).toEqual(custody);
    await reopened.campaign.close();
  });
});
