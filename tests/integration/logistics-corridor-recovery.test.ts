/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Source-Qualified Local Corridor and Logistics Read — save → close → load → continue across every durable cut, and a failure at every
// durable step of the corridor publication, of the corridor-qualified commitment and of the due-stage completion transaction. The path
// reuses the existing persistence, receipts, journal and stage-identity machinery: after any crash, lost reply, retry, replay or reload
// the corridor, the commitment (with its corridor pin), the active transfer, the delivery result, the destination transition and the
// retirement each exist exactly once, and "where is the entity?" has exactly one authority at every cut.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0, unchanged). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  LogisticsCommitmentSchema,
  entityTransitionStage,
  logisticsDeliveryStage,
  logisticsRetirementStage,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  LogisticsAdapter,
  nodeFs,
  stageGroupId,
  stageIntentId,
  type CampaignStore,
} from "@immortalis/engine";
import {
  DEST_LOCUS_ID,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  LOGISTICS_FIXTURE_EXTENSION,
  MOVE_1,
  REQ_1,
  dispatchInput,
  instrumentFs,
  logPublication,
  logStopAtBoundaryRequest,
  movementRequestKey,
  transitionKeyOf,
} from "@immortalis/testkit";
import {
  acceptLogEntity,
  commitMovementRequest,
  entityIdOf,
  logCoordinator,
  logSummary,
  registerTransfer,
  reopenLogistics,
  seededLogisticsCampaign,
  type LogSeeded,
} from "../support/logistics.ts";
import {
  acceptAndCommitViaCorridor,
  corridorCommit,
  corridorCommitDispatchRegister,
  corridorInput,
  corridorKeyOf,
  corridorPublication,
  establishCorridor,
} from "../support/logistics-corridor.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const W = FIXTURE_WORLD_ID;
const E = entityIdOf(REQ_1);
const deliveryStage = logisticsDeliveryStage(MOVE_1);
const retirementStage = logisticsRetirementStage(MOVE_1);
const transitionStage = entityTransitionStage(`delivery:${MOVE_1}`);
const advance = (s: Pick<LogSeeded, "coordinator">) =>
  s.coordinator.advance(logStopAtBoundaryRequest("tx-move", MOVE_1));
const where = (s: LogSeeded) => {
  const r = s.logistics.currentLocus(W, E)!;
  expect((r.stationary === null) !== (r.movement === null)).toBe(true);
  return `${r.phase}/${r.authority}`;
};
const versions = (s: LogSeeded) => {
  const f = (k: string) => s.campaign.store.getFact(k)?.version ?? 0;
  return {
    corridor: f(corridorKeyOf()),
    commitment: f(`logistics/commitment/${W}/${E}`),
    transfer: f(`logistics/transfer/${W}/${E}`),
    delivery: f(`logistics/delivery/${W}/${E}`),
    transition: f(transitionKeyOf(REQ_1)),
  };
};
function crashBefore(inner: CampaignStore, block: (g: any) => boolean): CampaignStore {
  return {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async (g: any) =>
      block(g)
        ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } } as never)
        : inner.commit(g),
  };
}
const hasKey = (suffix: string) => (g: any) => g.writes.some((w: any) => w.key.endsWith(suffix));
const crashedAdvance = (s: LogSeeded, block: (g: any) => boolean) =>
  logCoordinator(crashBefore(s.campaign.store, block)).advance(
    logStopAtBoundaryRequest("tx-move", MOVE_1),
  );

async function referenceRun() {
  const s = await seededLogisticsCampaign(tempDir());
  await corridorCommitDispatchRegister(s);
  await must(advance(s));
  const head = s.campaign.store.head();
  const summary = logSummary(s.campaign, s.coordinator);
  await s.campaign.close();
  return { head, summary };
}

/** present-from-the-cut helpers: continue with the SAME publications and identities as the uninterrupted run */
async function continueFrom(re: LogSeeded) {
  if (!re.campaign.corridor(W, FIXTURE_LOCUS_ID, DEST_LOCUS_ID)) await establishCorridor(re);
  if (!re.campaign.store.getFact(`world/${W}/entity/${E}`)) await acceptLogEntity(re, REQ_1, 1);
  if (!re.campaign.store.getFact(movementRequestKey(MOVE_1)))
    await commitMovementRequest(re, MOVE_1, REQ_1, 1);
  if (!re.logistics.commitment(W, E)) {
    await must(
      re.logistics.commitCorridorMovement({ ...logPublication(1), commit: corridorCommit(MOVE_1) }),
    );
  }
  if (!re.logistics.transfer(W, E)) {
    await must(re.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
  }
  if (!re.coordinator.object(`obj-logistics-${MOVE_1}`)) await registerTransfer(re, REQ_1, 31);
  return must(advance(re));
}

type Cut = { name: string; expected: string; build: (s: LogSeeded) => Promise<void> };
const cuts: Cut[] = [
  {
    name: "corridor authored; nothing requested or moved",
    expected: "n/a",
    build: (s) => establishCorridor(s),
  },
  {
    name: "corridor, entity and request exist; no commitment yet",
    expected: "STATIONARY_AT_ORIGIN/WORLD_STATE",
    build: async (s) => {
      await establishCorridor(s);
      await acceptLogEntity(s, REQ_1, 1);
      await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    },
  },
  {
    name: "corridor-qualified commitment established, before dispatch",
    expected: "STATIONARY_AT_ORIGIN/WORLD_STATE",
    build: async (s) => {
      await establishCorridor(s);
      await acceptAndCommitViaCorridor(s);
    },
  },
  {
    name: "dispatched (active transfer), its object not yet registered",
    expected: "IN_TRANSFER/LOGISTICS",
    build: async (s) => {
      await establishCorridor(s);
      await acceptAndCommitViaCorridor(s);
      await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    },
  },
  {
    name: "dispatched and registered, boundary not yet resolved",
    expected: "IN_TRANSFER/LOGISTICS",
    build: (s) => corridorCommitDispatchRegister(s),
  },
  {
    name: "delivery-complete established, destination not yet committed",
    expected: "IN_TRANSFER/LOGISTICS",
    build: async (s) => {
      await corridorCommitDispatchRegister(s);
      await crashedAdvance(s, hasKey("/transition"));
      expect(versions(s)).toMatchObject({ commitment: 1, transfer: 1, delivery: 1, transition: 0 });
    },
  },
  {
    name: "destination committed by World-State, Logistics retirement pending",
    expected: "DESTINATION_COMMITTED_RETIREMENT_PENDING/WORLD_STATE",
    build: async (s) => {
      await corridorCommitDispatchRegister(s);
      await crashedAdvance(
        s,
        (g) =>
          g.owner === "logistics" &&
          g.writes.some((w: any) => w.key.startsWith("logistics/transfer/")),
      );
      expect(versions(s)).toMatchObject({ commitment: 1, transfer: 1, delivery: 1, transition: 1 });
    },
  },
  {
    name: "all stages committed, the kernel transaction not",
    expected: "DESTINATION_COMMITTED/WORLD_STATE",
    build: async (s) => {
      await corridorCommitDispatchRegister(s);
      await crashedAdvance(s, (g) => g.group_id.startsWith("transaction-group:"));
      expect(versions(s)).toMatchObject({ commitment: 2, transfer: 2, delivery: 1, transition: 1 });
    },
  },
  {
    name: "completed and sealed by its transaction",
    expected: "DESTINATION_COMMITTED/WORLD_STATE",
    build: async (s) => {
      await corridorCommitDispatchRegister(s);
      await must(advance(s));
    },
  },
];

describe("save → close → load → continue at every durable cut of the corridor-qualified lifecycle", () => {
  it.each(cuts)(
    "$name: reload changes nothing; the continuation completes the lifecycle exactly once",
    async (cut) => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededLogisticsCampaign(dir);
      await cut.build(s);
      if (cut.expected !== "n/a") expect(where(s)).toBe(cut.expected);
      expect(s.campaign.verify()).toEqual([]);
      const before = logSummary(s.campaign, s.coordinator);
      const corridorBefore = s.campaign.store.getFact(corridorKeyOf());
      await s.campaign.close();

      const re = await reopenLogistics(dir, "reload");
      expect(re.campaign.verify()).toEqual([]);
      expect(logSummary(re.campaign, re.coordinator)).toEqual(before); // reloading re-resolves nothing
      expect(re.campaign.store.getFact(corridorKeyOf())).toEqual(corridorBefore);
      if (cut.expected !== "n/a") expect(where(re)).toBe(cut.expected);

      const done = await continueFrom(re);
      expect(re.campaign.verify()).toEqual([]);
      expect(versions(re)).toEqual({
        corridor: 1,
        commitment: 2,
        transfer: 2,
        delivery: 1,
        transition: 1,
      });
      expect(where(re)).toBe("DESTINATION_COMMITTED/WORLD_STATE");
      expect(done.transaction.stages.map((x) => x.group_id)).toEqual(
        [deliveryStage, transitionStage, retirementStage].map((st) => stageGroupId(st)),
      );
      // the corridor pin survived intact through every cut
      expect(
        LogisticsCommitmentSchema.parse(re.logistics.commitment(W, E)!.fact.value).corridor,
      ).toEqual({ owner: "world_state", fact_key: corridorKeyOf(), version: 1 });
      const head = re.campaign.store.head();
      expect(head.revision).toBe(ref.head.revision);
      expect(head.state_sha256).toBe(ref.head.state_sha256);
      expect(head.journal_head_sha256).toBe(ref.head.journal_head_sha256);
      await re.campaign.close();

      // and once more after a second close and load: still exactly one of each; a replay writes nothing
      const again = await reopenLogistics(dir, "reload-2");
      expect(again.campaign.verify()).toEqual([]);
      const replay = await must(advance(again));
      expect(replay.replayed).toBe(true);
      expect(again.campaign.store.head().state_sha256).toBe(ref.head.state_sha256);
      await again.campaign.close();
    },
    120_000,
  );
});

describe("a failure at EVERY durable step converges by identity", () => {
  const seedTo = async (build: (s: LogSeeded) => Promise<void>) => {
    const dir = tempDir();
    const s = await seededLogisticsCampaign(dir);
    await build(s);
    await s.campaign.close();
    return dir;
  };
  const openWith = async (dir: string, fs: any) => {
    const campaign = await must(
      CanonicalCampaign.open(dir, { fs, extension: LOGISTICS_FIXTURE_EXTENSION }),
    );
    return {
      campaign,
      logistics: new LogisticsAdapter(campaign.store),
      coordinator: logCoordinator(campaign.store),
    };
  };

  it("the CORRIDOR publication: every durable step, before and after taking effect, converges on one corridor and never a second", async () => {
    const seed = () => seedTo(async () => undefined);
    const refDir = await seed();
    const ref = await reopenLogistics(refDir, "ref");
    await establishCorridor(ref);
    const refHead = ref.campaign.store.head();
    await ref.campaign.close();

    const countDir = await seed();
    const probe = instrumentFs(nodeFs);
    const c = await openWith(countDir, probe.fs);
    const afterOpen = probe.count();
    await must(
      c.campaign.establishCorridor({ ...corridorPublication(1), corridor: corridorInput() }),
    );
    const steps = probe.count() - afterOpen;
    await c.campaign.close();
    expect(steps).toBeGreaterThanOrEqual(4);

    const seen = { absent: 0, present: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterOpen + steps; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = await seed();
        const inst = instrumentFs(nodeFs, { failAt, when });
        const x = await openWith(dir, inst.fs);
        const r = await x.campaign.establishCorridor({
          ...corridorPublication(1),
          corridor: corridorInput(),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await x.campaign.close();
        const re = await reopenLogistics(dir, "restart");
        expect(re.campaign.verify()).toEqual([]);
        if (re.campaign.corridor(W, FIXTURE_LOCUS_ID, DEST_LOCUS_ID)) seen.present++;
        else seen.absent++;
        // re-present the SAME publication: the existing receipt is reached, or the corridor is made once
        await establishCorridor(re);
        expect(versions(re).corridor).toBe(1);
        expect(re.campaign.store.head().revision).toBe(refHead.revision);
        expect(re.campaign.store.head().state_sha256).toBe(refHead.state_sha256);
        // an altered retry (another statement) is refused and never a second corridor
        const altered = await re.campaign.establishCorridor({
          ...corridorPublication(1),
          corridor: corridorInput(FIXTURE_LOCUS_ID, DEST_LOCUS_ID, { statement: "altered" }),
        });
        expect(altered.ok).toBe(false);
        expect(re.campaign.store.head().state_sha256).toBe(refHead.state_sha256);
        await re.campaign.close();
      }
    }
    expect(seen.absent).toBeGreaterThan(0);
    expect(seen.present).toBeGreaterThan(0);
  }, 300_000);

  it("the CORRIDOR-QUALIFIED COMMITMENT: every durable step converges on one commitment with its one corridor pin; an altered retry refuses", async () => {
    const seed = () =>
      seedTo(async (s) => {
        await establishCorridor(s);
        await acceptLogEntity(s, REQ_1, 1);
        await commitMovementRequest(s, MOVE_1, REQ_1, 1);
      });
    const refDir = await seed();
    const ref = await reopenLogistics(refDir, "ref");
    await must(
      ref.logistics.commitCorridorMovement({
        ...logPublication(1),
        commit: corridorCommit(MOVE_1),
      }),
    );
    const refHead = ref.campaign.store.head();
    await ref.campaign.close();

    const countDir = await seed();
    const probe = instrumentFs(nodeFs);
    const c = await openWith(countDir, probe.fs);
    const afterOpen = probe.count();
    await must(
      c.logistics.commitCorridorMovement({ ...logPublication(1), commit: corridorCommit(MOVE_1) }),
    );
    const steps = probe.count() - afterOpen;
    await c.campaign.close();
    expect(steps).toBeGreaterThanOrEqual(4);

    const seen = { absent: 0, present: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterOpen + steps; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = await seed();
        const inst = instrumentFs(nodeFs, { failAt, when });
        const x = await openWith(dir, inst.fs);
        const r = await x.logistics.commitCorridorMovement({
          ...logPublication(1),
          commit: corridorCommit(MOVE_1),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await x.campaign.close();
        const re = await reopenLogistics(dir, "restart");
        expect(re.campaign.verify()).toEqual([]);
        if (re.logistics.commitment(W, E)) seen.present++;
        else seen.absent++;
        // where the commitment survived, an altered retry never produces a second one: a different boundary is refused
        if (re.logistics.commitment(W, E)) {
          const altered = await re.logistics.commitCorridorMovement({
            ...logPublication(1),
            commit: corridorCommit(MOVE_1, {
              delivery_at: { unit: "fixture-time-unit", value: 999 },
            }),
          });
          expect(altered.ok).toBe(false);
        }
        // the honest retry is the same receipt or the commitment, once
        await must(
          re.logistics.commitCorridorMovement({
            ...logPublication(1),
            commit: corridorCommit(MOVE_1),
          }),
        );
        expect(versions(re).commitment).toBe(1);
        expect(re.campaign.store.head().revision).toBe(refHead.revision);
        expect(re.campaign.store.head().state_sha256).toBe(refHead.state_sha256);
        expect(
          LogisticsCommitmentSchema.parse(re.logistics.commitment(W, E)!.fact.value).corridor,
        ).toEqual({ owner: "world_state", fact_key: corridorKeyOf(), version: 1 });
        expect(re.campaign.verify()).toEqual([]);
        await re.campaign.close();
      }
    }
    expect(seen.absent).toBeGreaterThan(0);
    expect(seen.present).toBeGreaterThan(0);
  }, 300_000);

  it("the COMPLETION TRANSACTION of a corridor-qualified transfer: every durable step converges on one of each, in order", async () => {
    const seed = () => seedTo((s) => corridorCommitDispatchRegister(s));
    const ref = await referenceRun();

    const countDir = await seed();
    const probe = instrumentFs(nodeFs);
    const c = await openWith(countDir, probe.fs);
    const afterOpen = probe.count();
    await must(c.coordinator.advance(logStopAtBoundaryRequest("tx-move", MOVE_1)));
    const afterAdvance = probe.count();
    await c.campaign.close();
    expect(afterAdvance - afterOpen).toBeGreaterThanOrEqual(20);

    const cutsSeen = new Set<string>();
    const finals = new Set<string>();
    for (let failAt = afterOpen + 1; failAt <= afterAdvance; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = await seed();
        const inst = instrumentFs(nodeFs, { failAt, when });
        const x = await openWith(dir, inst.fs);
        const r = await x.coordinator.advance(logStopAtBoundaryRequest("tx-move", MOVE_1));
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await x.campaign.close();

        const re = await reopenLogistics(dir, "restart");
        expect(re.campaign.verify()).toEqual([]);
        const has = (st: any) => re.campaign.store.lookupReceipt(stageIntentId(st)) !== null;
        const delivered = has(deliveryStage);
        const destination = has(transitionStage);
        const retired = has(retirementStage);
        if (destination) expect(delivered).toBe(true);
        if (retired) expect(destination).toBe(true);
        expect(where(re)).toBe(
          destination
            ? retired
              ? "DESTINATION_COMMITTED/WORLD_STATE"
              : "DESTINATION_COMMITTED_RETIREMENT_PENDING/WORLD_STATE"
            : "IN_TRANSFER/LOGISTICS",
        );
        cutsSeen.add(`${delivered}/${destination}/${retired}`);
        await must(advance(re));
        expect(versions(re)).toEqual({
          corridor: 1,
          commitment: 2,
          transfer: 2,
          delivery: 1,
          transition: 1,
        });
        const head = re.campaign.store.head();
        expect(head.revision).toBe(ref.head.revision);
        expect(logSummary(re.campaign, re.coordinator).logistics).toEqual(ref.summary.logistics);
        finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
        await re.campaign.close();
        const last = await reopenLogistics(dir, "last");
        expect(last.campaign.verify()).toEqual([]);
        await last.campaign.close();
      }
    }
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBe(`${ref.head.state_sha256}/${ref.head.journal_head_sha256}`);
    expect([...cutsSeen].sort()).toEqual([
      "false/false/false",
      "true/false/false",
      "true/true/false",
      "true/true/true",
    ]);
  }, 600_000);
});
