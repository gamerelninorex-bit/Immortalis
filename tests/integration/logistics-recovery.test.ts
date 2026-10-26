/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and process output */
// Single-Leg Logistics Transfer — save → close → load → continue across EVERY meaningful durable cut of the
// transfer lifecycle, and a failure at every durable step of each Logistics publication and of the completion
// transaction (delivery stage, destination commit, retirement stage, authority, kernel group). The Logistics path
// reuses the existing persistence, receipts, journal and stage-identity machinery: after any crash, retry, replay or
// reload the commitment, the active transfer, the delivery result, the destination transition and the retirement
// each exist exactly once, and "where is the entity?" has exactly one authority at every cut.
// Register lineage: IA-06, IA-22, IA-30 (partial); RC-04, RC-05, RC-16; IM-02, IM-03, IM-05, IM-12, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  logisticsDeliveryStage,
  logisticsRetirementStage,
  entityTransitionStage,
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
  FIXTURE_WORLD_ID,
  LOGISTICS_FIXTURE_EXTENSION,
  MOVE_1,
  REQ_1,
  commitInput,
  dispatchInput,
  instrumentFs,
  logPublication,
  logStopAtBoundaryRequest,
  transitionKeyOf,
} from "@immortalis/testkit";
import {
  acceptAndCommit,
  acceptCommitDispatchRegister,
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
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const E = entityIdOf(REQ_1);
const deliveryStage = logisticsDeliveryStage(MOVE_1);
const retirementStage = logisticsRetirementStage(MOVE_1);
const transitionStage = entityTransitionStage(`delivery:${MOVE_1}`);
const advance = (s: Pick<LogSeeded, "coordinator">) =>
  s.coordinator.advance(logStopAtBoundaryRequest("tx-move", MOVE_1));
const where = (s: LogSeeded) => {
  const r = s.logistics.currentLocus(FIXTURE_WORLD_ID, E)!;
  // exactly one authority carries a locus
  expect((r.stationary === null) !== (r.movement === null)).toBe(true);
  return `${r.phase}/${r.authority}`;
};
const versions = (s: LogSeeded) => {
  const f = (k: string) => s.campaign.store.getFact(k)?.version ?? 0;
  return {
    commitment: f(`logistics/commitment/${FIXTURE_WORLD_ID}/${E}`),
    transfer: f(`logistics/transfer/${FIXTURE_WORLD_ID}/${E}`),
    delivery: f(`logistics/delivery/${FIXTURE_WORLD_ID}/${E}`),
    transition: f(transitionKeyOf(REQ_1)),
  };
};

/** A store that "crashes" (nothing committed, unknown outcome) before the first group the predicate names. */
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

/** The deterministic reference: the whole lifecycle, uninterrupted. */
async function referenceRun() {
  const dir = tempDir();
  const s = await seededLogisticsCampaign(dir);
  await acceptCommitDispatchRegister(s);
  await must(advance(s));
  const head = s.campaign.store.head();
  const summary = logSummary(s.campaign, s.coordinator);
  await s.campaign.close();
  return { head, summary };
}

type Cut = { name: string; expected: string; build: (s: LogSeeded) => Promise<void> };
const cuts: Cut[] = [
  {
    name: "entity accepted, no movement yet",
    expected: "STATIONARY_AT_ORIGIN/WORLD_STATE",
    build: async (s) => {
      await acceptLogEntity(s, REQ_1, 1);
      await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    },
  },
  {
    name: "commitment established, before dispatch",
    expected: "STATIONARY_AT_ORIGIN/WORLD_STATE",
    build: (s) => acceptAndCommit(s),
  },
  {
    name: "dispatched (active transfer), its object not yet registered",
    expected: "IN_TRANSFER/LOGISTICS",
    build: async (s) => {
      await acceptAndCommit(s);
      await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    },
  },
  {
    name: "dispatched and registered, boundary not yet resolved",
    expected: "IN_TRANSFER/LOGISTICS",
    build: (s) => acceptCommitDispatchRegister(s),
  },
  {
    name: "delivery-complete established, destination not yet committed",
    expected: "IN_TRANSFER/LOGISTICS",
    build: async (s) => {
      await acceptCommitDispatchRegister(s);
      await crashedAdvance(s, hasKey("/transition"));
      expect(versions(s)).toEqual({ commitment: 1, transfer: 1, delivery: 1, transition: 0 });
    },
  },
  {
    name: "destination committed by World-State, Logistics retirement pending",
    expected: "DESTINATION_COMMITTED_RETIREMENT_PENDING/WORLD_STATE",
    build: async (s) => {
      await acceptCommitDispatchRegister(s);
      await crashedAdvance(
        s,
        (g) =>
          g.owner === "logistics" &&
          g.writes.some((w: any) => w.key.startsWith("logistics/transfer/")),
      );
      expect(versions(s)).toEqual({ commitment: 1, transfer: 1, delivery: 1, transition: 1 });
    },
  },
  {
    name: "all stages committed, the kernel transaction not",
    expected: "DESTINATION_COMMITTED/WORLD_STATE",
    build: async (s) => {
      await acceptCommitDispatchRegister(s);
      await crashedAdvance(s, (g) => g.group_id.startsWith("transaction-group:"));
      expect(versions(s)).toEqual({ commitment: 2, transfer: 2, delivery: 1, transition: 1 });
    },
  },
  {
    name: "completed and sealed by its transaction",
    expected: "DESTINATION_COMMITTED/WORLD_STATE",
    build: async (s) => {
      await acceptCommitDispatchRegister(s);
      await must(advance(s));
    },
  },
];

describe("save → close → load → continue at every durable cut of the transfer lifecycle (acceptance 13, 14)", () => {
  it.each(cuts)(
    "$name: reload changes nothing; the continuation completes the lifecycle exactly once",
    async (cut) => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededLogisticsCampaign(dir);
      await cut.build(s);
      expect(where(s)).toBe(cut.expected);
      expect(s.campaign.verify()).toEqual([]);
      const before = logSummary(s.campaign, s.coordinator);
      await s.campaign.close();

      const re = await reopenLogistics(dir, "reload");
      expect(re.campaign.verify()).toEqual([]);
      expect(logSummary(re.campaign, re.coordinator)).toEqual(before); // reloading re-resolves nothing
      expect(where(re)).toBe(cut.expected);

      // continue from the cut with the same publications and the same transaction identity
      if (!re.logistics.commitment(FIXTURE_WORLD_ID, E)) {
        await must(
          re.logistics.commitMovement({ ...logPublication(1), commit: commitInput(MOVE_1) }),
        );
      }
      if (!re.logistics.transfer(FIXTURE_WORLD_ID, E)) {
        await must(
          re.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }),
        );
      }
      if (!re.coordinator.object(`obj-logistics-${MOVE_1}`)) await registerTransfer(re, REQ_1, 31);
      const done = await must(advance(re));
      expect(re.campaign.verify()).toEqual([]);
      // the lifecycle ends exactly as the uninterrupted one: nothing duplicated, nothing missing
      expect(versions(re)).toEqual({ commitment: 2, transfer: 2, delivery: 1, transition: 1 });
      expect(where(re)).toBe("DESTINATION_COMMITTED/WORLD_STATE");
      expect(done.transaction.stages.map((x) => x.group_id)).toEqual(
        [deliveryStage, transitionStage, retirementStage].map((st) => stageGroupId(st)),
      );
      const head = re.campaign.store.head();
      expect(head.revision).toBe(ref.head.revision);
      expect(head.state_sha256).toBe(ref.head.state_sha256);
      expect(head.journal_head_sha256).toBe(ref.head.journal_head_sha256);
      expect(logSummary(re.campaign, re.coordinator).logistics).toEqual(ref.summary.logistics);
      await re.campaign.close();

      // and once more after a second close and load: still exactly one of each, replay writes nothing
      const again = await reopenLogistics(dir, "reload-2");
      expect(again.campaign.verify()).toEqual([]);
      expect(versions(again)).toEqual({ commitment: 2, transfer: 2, delivery: 1, transition: 1 });
      const replay = await must(advance(again));
      expect(replay.replayed).toBe(true);
      expect(again.campaign.store.head().state_sha256).toBe(ref.head.state_sha256);
      await again.campaign.close();
    },
    120_000,
  );
});

describe("a failure at EVERY durable step converges by identity (acceptance 12, 14)", () => {
  /** Seeds a campaign up to a state and closes it. */
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

  it("the COMMITMENT publication: every durable step, both before and after taking effect, converges on one commitment", async () => {
    const seed = () =>
      seedTo(async (s) => {
        await acceptLogEntity(s, REQ_1, 1);
        await commitMovementRequest(s, MOVE_1, REQ_1, 1);
      });
    const refDir = await seed();
    const ref = await reopenLogistics(refDir, "ref");
    await must(ref.logistics.commitMovement({ ...logPublication(1), commit: commitInput(MOVE_1) }));
    const refHead = ref.campaign.store.head();
    await ref.campaign.close();

    const countDir = await seed();
    const probe = instrumentFs(nodeFs);
    const c = await openWith(countDir, probe.fs);
    const afterOpen = probe.count();
    await must(c.logistics.commitMovement({ ...logPublication(1), commit: commitInput(MOVE_1) }));
    const steps = probe.count() - afterOpen;
    await c.campaign.close();
    expect(steps).toBeGreaterThanOrEqual(2);

    const seen = { absent: 0, present: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterOpen + steps; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = await seed();
        const inst = instrumentFs(nodeFs, { failAt, when });
        const x = await openWith(dir, inst.fs);
        const r = await x.logistics.commitMovement({
          ...logPublication(1),
          commit: commitInput(MOVE_1),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await x.campaign.close();
        const re = await reopenLogistics(dir, "restart");
        expect(re.campaign.verify()).toEqual([]);
        if (re.logistics.commitment(FIXTURE_WORLD_ID, E)) seen.present++;
        else seen.absent++;
        // re-present the SAME publication: the existing receipt is reached, or the commitment is made once
        await must(
          re.logistics.commitMovement({ ...logPublication(1), commit: commitInput(MOVE_1) }),
        );
        expect(versions(re).commitment).toBe(1);
        expect(re.campaign.store.head().revision).toBe(refHead.revision);
        expect(re.campaign.store.head().state_sha256).toBe(refHead.state_sha256);
        expect(re.campaign.verify()).toEqual([]);
        await re.campaign.close();
      }
    }
    expect(seen.absent).toBeGreaterThan(0);
    expect(seen.present).toBeGreaterThan(0);
  }, 300_000);

  it("the DISPATCH publication: every durable step converges on one transfer — and never a second movement locus", async () => {
    const seed = () => seedTo((s) => acceptAndCommit(s));
    const refDir = await seed();
    const ref = await reopenLogistics(refDir, "ref");
    await must(ref.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    const refHead = ref.campaign.store.head();
    await ref.campaign.close();

    const countDir = await seed();
    const probe = instrumentFs(nodeFs);
    const c = await openWith(countDir, probe.fs);
    const afterOpen = probe.count();
    await must(c.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    const steps = probe.count() - afterOpen;
    await c.campaign.close();

    const seen = { absent: 0, present: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterOpen + steps; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = await seed();
        const inst = instrumentFs(nodeFs, { failAt, when });
        const x = await openWith(dir, inst.fs);
        const r = await x.logistics.dispatch({
          ...logPublication(101),
          dispatch: dispatchInput(MOVE_1),
        });
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await x.campaign.close();
        const re = await reopenLogistics(dir, "restart");
        expect(re.campaign.verify()).toEqual([]);
        // whatever survived has exactly one authority: World-State before the dispatch, Logistics after it
        const w = where(re);
        if (re.logistics.transfer(FIXTURE_WORLD_ID, E)) {
          seen.present++;
          expect(w).toBe("IN_TRANSFER/LOGISTICS");
        } else {
          seen.absent++;
          expect(w).toBe("STATIONARY_AT_ORIGIN/WORLD_STATE");
        }
        await must(
          re.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }),
        );
        expect(versions(re).transfer).toBe(1);
        expect(re.campaign.store.head().revision).toBe(refHead.revision);
        expect(re.campaign.store.head().state_sha256).toBe(refHead.state_sha256);
        expect(re.campaign.verify()).toEqual([]);
        await re.campaign.close();
      }
    }
    expect(seen.absent).toBeGreaterThan(0);
    expect(seen.present).toBeGreaterThan(0);
  }, 300_000);

  it("the COMPLETION TRANSACTION (authority, delivery stage, destination commit, retirement stage, kernel group): every durable step converges on one of each, in order", async () => {
    const seed = () => seedTo((s) => acceptCommitDispatchRegister(s));
    const ref = await referenceRun();

    const countDir = await seed();
    const probe = instrumentFs(nodeFs);
    const c = await openWith(countDir, probe.fs);
    const afterOpen = probe.count();
    await must(c.coordinator.advance(logStopAtBoundaryRequest("tx-move", MOVE_1)));
    const afterAdvance = probe.count();
    await c.campaign.close();
    // authority + three stages + the kernel group: five commits of at least two durable steps each
    expect(afterAdvance - afterOpen).toBeGreaterThanOrEqual(10);

    const seen = { rolledBack: 0, partial: 0, committed: 0 };
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
        expect(re.campaign.verify()).toEqual([]); // whatever survived is internally consistent
        const has = (st: any) => re.campaign.store.lookupReceipt(stageIntentId(st)) !== null;
        const delivered = has(deliveryStage);
        const destination = has(transitionStage);
        const retired = has(retirementStage);
        // the order is never violated: nothing follows a stage that did not commit
        if (destination) expect(delivered).toBe(true);
        if (retired) expect(destination).toBe(true);
        // exactly one authority at this cut, and it is the lawful one for what is durable
        const w = where(re);
        expect(w).toBe(
          destination
            ? retired
              ? "DESTINATION_COMMITTED/WORLD_STATE"
              : "DESTINATION_COMMITTED_RETIREMENT_PENDING/WORLD_STATE"
            : "IN_TRANSFER/LOGISTICS",
        );
        cutsSeen.add(`${delivered}/${destination}/${retired}`);
        if (re.coordinator.transaction("tx-move")) seen.committed++;
        else if (delivered || destination || retired) seen.partial++;
        else seen.rolledBack++;

        // re-present the SAME request: existing receipts are reached; a committed stage is adopted, never recomputed
        const again = await must(advance(re));
        if (
          (delivered || destination || retired) &&
          !re.coordinator.transaction("tx-move")?.fact.version
        ) {
          expect(again.recomputed_in_place).toEqual([]);
        }
        expect(versions(re)).toEqual({ commitment: 2, transfer: 2, delivery: 1, transition: 1 });
        const head = re.campaign.store.head();
        expect(head.revision).toBe(ref.head.revision); // no duplicate group anywhere
        expect(logSummary(re.campaign, re.coordinator).logistics).toEqual(ref.summary.logistics);
        expect(logSummary(re.campaign, re.coordinator).transitions).toEqual(
          ref.summary.transitions,
        );
        expect(where(re)).toBe("DESTINATION_COMMITTED/WORLD_STATE");
        finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
        await re.campaign.close();
        const last = await reopenLogistics(dir, "last");
        expect(last.campaign.verify()).toEqual([]);
        await last.campaign.close();
      }
    }
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBe(`${ref.head.state_sha256}/${ref.head.journal_head_sha256}`);
    expect(seen.rolledBack).toBeGreaterThan(0);
    expect(seen.partial).toBeGreaterThan(0);
    expect(seen.committed).toBeGreaterThan(0);
    // the meaningful cuts were all actually exercised: nothing, delivery only, +destination, +retirement
    expect([...cutsSeen].sort()).toEqual([
      "false/false/false",
      "true/false/false",
      "true/true/false",
      "true/true/true",
    ]);
  }, 600_000);
});

describe("real operating-system processes (acceptance 13)", () => {
  it("create → close → load → continue, replay, and a second continue writes nothing; the movement completes exactly once", () => {
    const dir = tempDir();
    const script = join(import.meta.dirname, "fixtures", "logistics-process.ts");
    const run = (phase: string) =>
      JSON.parse(
        execFileSync(process.execPath, ["--experimental-strip-types", script, phase, dir], {
          encoding: "utf8",
        }),
      );
    const created = run("create");
    expect(created.violations).toEqual([]);
    expect(created.where).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
      stationary: null,
      origin: "locus-fixture-1",
    });
    const loaded = run("load");
    expect(loaded.violations).toEqual([]);
    expect(loaded.summary).toEqual(created.summary);
    expect(loaded.where).toEqual(created.where);
    const cont = run("continue");
    expect(cont.violations).toEqual([]);
    expect(cont.afterReplay).toEqual(cont.after);
    expect(cont.replayed).toBe(true);
    expect(cont.stop[0]).toBe("CONDITION_SATISFIED");
    // nothing but the movement's chain and the kernel records appeared; the entity is byte-untouched
    expect(cont.before.transitions).toEqual([]);
    expect(cont.after.transitions.map((f: any) => f.key)).toEqual([transitionKeyOf(REQ_1)]);
    expect(cont.after.logistics.map((f: any) => [f.key.split("/")[1], f.version]).sort()).toEqual([
      ["commitment", 2],
      ["delivery", 1],
      ["transfer", 2],
    ]);
    expect(cont.after.entities).toEqual(cont.before.entities);
    expect(cont.after.production).toEqual(cont.before.production);
    expect(cont.after.canonical).toEqual(cont.before.canonical);
    expect(cont.where).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
      movement: null,
      stationary: "locus-fixture-dest",
      origin: "locus-fixture-1",
    });
    // a fresh process after the continue sees the same single chain
    const last = run("load");
    expect(last.violations).toEqual([]);
    expect(last.summary.logistics).toEqual(cont.after.logistics);
    expect(last.summary.transitions).toEqual(cont.after.transitions);
    expect(last.where).toEqual(cont.where);
  }, 180_000);
});
