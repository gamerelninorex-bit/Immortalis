/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw tool results */
import { describe, expect, it } from "vitest";
import { GM_FREIGHT_TOOLS } from "@immortalis/contracts";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  freightPublication,
  quarryWorksFixture,
  textileWorkshopFixture,
  type FreightWorldFixture,
} from "@immortalis/testkit";
import {
  bindGmFreightHost,
  readGmFreightSecretFile,
} from "../../packages/operator/src/gm-freight-exchange.ts";
import { callGmFreight } from "../../packages/operator/src/gm-freight.ts";
import {
  admitService,
  admitServiceBasis,
  fixFreight,
  openFreightCampaign,
  type Freight,
} from "../support/freight.ts";
import { cutMatrix, wrap, head } from "../support/gm-freight-cuts.ts";
import {
  authorThroughSeal,
  newGmRig,
  playerAdvancesTo,
  receiptOf,
  settingRequest,
  stepNames,
  type GmRig,
} from "../support/gm-freight.ts";
import { must } from "../support/temporal.ts";

/**
 * BLUE R-5: the crash / lost-acknowledgement matrix for the mutating calls the first head did NOT cut — `report_site_change`, the W2 and W3
 * withdrawals (before L0, and with the exact unused release F2), and the renewed request E2 after a proven unused close — plus competition
 * between two bound hosts. Every cell is: the call, the filesystem failing at exactly one durable operation (before it takes effect, or after
 * it took effect so the caller sees a failure), the operator reclaiming the dead lock, strict re-open, `gm_freight_reconcile`, the SAME call
 * with the SAME token again, and a final canonical state byte-identical to the uninterrupted run. MECHANISM ONLY (T1) over real local files.
 *
 * Prefix states the bridge itself would not stop at (it proceeds as far as the owners allow) are SEEDED through the owners' own adapters and
 * labelled so; the call under test is always the bridge's.
 */

const tool = GM_FREIGHT_TOOLS;

const seeded = async <T>(rig: GmRig, run: (f: Freight) => Promise<T>): Promise<T> => {
  const f = await openFreightCampaign(rig.campaignDir, rig.fx);
  try {
    return await run(f);
  } finally {
    await f.campaign.close();
  }
};

/** authoring, the first ask, and the player's advance to Production's own boundary */
async function atProductionDone(rig: GmRig): Promise<void> {
  await authorThroughSeal(rig);
  const go = receiptOf(
    await rig.call(tool.initiate, { operation_id: "go-1", world_id: rig.fx.worldId }),
  );
  if (go.awaiting?.kind !== "PLAYER_OOC_TIME_ADVANCE") throw new Error("expected the boundary");
  expect(await playerAdvancesTo(rig, go.awaiting.to)).toBe("NULL_PC_ADVANCE_COMMITTED");
}

const siteChange = (
  fx: FreightWorldFixture,
  op: string,
  id: string,
  outcome: "STANDING" | "CEASED",
) => ({
  operation_id: op,
  world_id: fx.worldId,
  condition_id: fx.siteCondition.condition_id,
  change_id: id,
  statement: "SYNTHETIC FIXTURE: a prospective physical change of the standing condition.",
  outcome,
});

const withdrawCall = (op: string) =>
  wrap(tool.withdraw, (r) => ({ operation_id: op, world_id: r.fx.worldId }));

describe("R-5 recovery cuts of the withdrawal family — Quarry Works (MECHANISM ONLY)", () => {
  const fixture = quarryWorksFixture;

  it("report_site_change (one owner act, after the condition is admitted)", async () => {
    const prefix = await newGmRig(fixture());
    await authorThroughSeal(prefix);
    receiptOf(
      await prefix.call(tool.initiate, { operation_id: "go-1", world_id: prefix.fx.worldId }),
    );
    const m = await cutMatrix(prefix, {
      name: "report_site_change",
      operation: "cut-change",
      call: wrap(tool.reportSiteChange, (r) =>
        siteChange(r.fx, "cut-change", "cut-change-1", "CEASED"),
      ),
    });
    expect(m.scenarios).toBeGreaterThan(6);
    expect(m.unknown).toBeGreaterThan(0);
  }, 900_000);

  it("W3 before any service (admit protection, then close once)", async () => {
    const prefix = await newGmRig(fixture());
    await atProductionDone(prefix);
    await seeded(prefix, (f) => fixFreight(f)); // OWNER-SEEDED: E0 only
    receiptOf(
      await prefix.call(tool.reportSiteChange, siteChange(prefix.fx, "change-1", "gone", "CEASED")),
    );
    const m = await cutMatrix(prefix, {
      name: "withdraw-w3-before-l0",
      operation: "cut-w3a",
      call: withdrawCall("cut-w3a"),
    });
    expect(m.scenarios).toBeGreaterThan(10);
    expect(m.unknown).toBeGreaterThan(0);
  }, 900_000);

  it("W3 after a committed service (admit, the exact unused release F2, close)", async () => {
    const prefix = await newGmRig(fixture());
    await atProductionDone(prefix);
    await seeded(prefix, async (f) => {
      // OWNER-SEEDED: E0, the service basis and L0, and no dispatch
      const ref = await fixFreight(f);
      await admitServiceBasis(f);
      await admitService(f, ref);
    });
    receiptOf(
      await prefix.call(
        tool.reportSiteChange,
        siteChange(prefix.fx, "change-1", "re-survey", "STANDING"),
      ),
    );
    const m = await cutMatrix(prefix, {
      name: "withdraw-w3-f2-close",
      operation: "cut-w3b",
      call: withdrawCall("cut-w3b"),
    });
    expect(m.scenarios).toBeGreaterThan(15);
    expect(m.unknown).toBeGreaterThan(0);
  }, 900_000);

  it("W2 (a GIP write after the seal: protection only, then close once)", async () => {
    const prefix = await newGmRig(fixture());
    await atProductionDone(prefix);
    await seeded(prefix, async (f) => {
      await fixFreight(f); // OWNER-SEEDED: E0 only
      await must(
        f.gip.establishInstitution({
          ...freightPublication("other", 1),
          institution: {
            institution_id: "rival-works",
            identity_label: "A rival works",
            continuity_status: "continuing",
          },
        }),
      );
    });
    const m = await cutMatrix(prefix, {
      name: "withdraw-w2",
      operation: "cut-w2",
      call: withdrawCall("cut-w2"),
    });
    expect(m.scenarios).toBeGreaterThan(10);
    expect(m.unknown).toBeGreaterThan(0);
  }, 900_000);

  it("the renewed request E2 after a proven unused close, through enrolment (initiate)", async () => {
    const prefix = await newGmRig(fixture());
    await atProductionDone(prefix);
    await seeded(prefix, async (f) => {
      const ref = await fixFreight(f); // OWNER-SEEDED: E0, the service basis, L0
      await admitServiceBasis(f);
      await admitService(f, ref);
    });
    receiptOf(
      await prefix.call(
        tool.reportSiteChange,
        siteChange(prefix.fx, "change-1", "re-survey", "STANDING"),
      ),
    );
    receiptOf(
      await prefix.call(tool.withdraw, { operation_id: "w-1", world_id: prefix.fx.worldId }),
    );
    const m = await cutMatrix(prefix, {
      name: "initiate-e2-renewal",
      operation: "cut-e2",
      call: wrap(tool.initiate, (r) => ({ operation_id: "cut-e2", world_id: r.fx.worldId })),
    });
    expect(m.scenarios).toBeGreaterThan(20);
  }, 900_000);
});

describe("R-5 recovery cuts — Textile Workshop: W3 with the unused release (MECHANISM ONLY)", () => {
  it("withdraw (admit, F2, close)", async () => {
    const prefix = await newGmRig(textileWorkshopFixture());
    await atProductionDone(prefix);
    await seeded(prefix, async (f) => {
      const ref = await fixFreight(f); // OWNER-SEEDED: E0, the service basis, L0
      await admitServiceBasis(f);
      await admitService(f, ref);
    });
    receiptOf(
      await prefix.call(
        tool.reportSiteChange,
        siteChange(prefix.fx, "change-1", "re-survey", "STANDING"),
      ),
    );
    const m = await cutMatrix(prefix, {
      name: "withdraw-w3-f2-close",
      operation: "cut-w3b",
      call: withdrawCall("cut-w3b"),
    });
    expect(m.scenarios).toBeGreaterThan(15);
  }, 900_000);
});

describe("R-5 two bound hosts on one campaign (MECHANISM ONLY)", () => {
  /** bind a SECOND host to the same campaign and state directory; the two share no secret */
  async function secondHost(rig: GmRig): Promise<GmRig["call"]> {
    const uid = typeof process.getuid === "function" ? process.getuid() : 0;
    const bound = await must(
      bindGmFreightHost({
        stateDir: rig.stateDir,
        campaignId: rig.fx.campaignId,
        operatorUid: uid,
        hostId: "gm-host-2",
      }),
    );
    const secret = readGmFreightSecretFile(bound.secret_file);
    if (secret === null) throw new Error("the second host's secret could not be read");
    return (t, a, over) =>
      callGmFreight({ ...rig.params, hostId: "gm-host-2", secret, ...over }, t, a);
  }

  it("two hosts racing the same chain: one holds the package lock, the other is the opaque refusal, and no act is duplicated", async () => {
    const rig = await newGmRig(quarryWorksFixture());
    await authorThroughSeal(rig);
    const other = await secondHost(rig);
    const [a, b] = await Promise.all([
      rig.call(tool.initiate, { operation_id: "host1-go", world_id: rig.fx.worldId }),
      other(tool.initiate, { operation_id: "host2-go", world_id: rig.fx.worldId }),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    for (const l of [a, b].filter((r) => !r.ok))
      expect((l as any).error.code).toBe("GM_FREIGHT_UNAVAILABLE");
    // whichever host won, the other host's next call finds the work done and writes nothing
    const again = receiptOf(
      await other(tool.initiate, { operation_id: "host2-go-2", world_id: rig.fx.worldId }),
    );
    expect(again.steps).toEqual([]);
    const c = await must(
      CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-freight-test-read" }),
    );
    try {
      expect(c.verify()).toEqual([]);
      expect(
        c.store.listFacts().filter((x) => x.key.startsWith("production/operation/")),
      ).toHaveLength(1);
    } finally {
      await c.close();
    }
  }, 240_000);

  it("a token is the host's own: the other host presenting it with different terms is a conflict and commits nothing; with the same terms it replays", async () => {
    const rig = await newGmRig(quarryWorksFixture());
    const other = await secondHost(rig);
    receiptOf(await rig.call(tool.establishSetting, settingRequest(rig.fx, "shared-token")));
    const before = await head(rig);

    // the same terms: every act is the owner's replay of what committed; nothing new is written
    const same = receiptOf(
      await other(tool.establishSetting, settingRequest(rig.fx, "shared-token")),
    );
    expect(same.steps.every((s) => s.disposition === "REPLAYED")).toBe(true);
    expect(await head(rig)).toEqual(before);

    // different terms under the same token: the owner's INTENT_CONFLICT, reported as such, and nothing changes
    const changed = settingRequest(rig.fx, "shared-token");
    const edited = {
      ...changed,
      world: { ...changed.world, premise: `${changed.world.premise} (host two)` },
    };
    const r = await other(tool.establishSetting, edited);
    expect(r.ok ? "OK" : r.error.code).toBe("GM_FREIGHT_INTENT_CONFLICT");
    expect(await head(rig)).toEqual(before);
    expect(stepNames(same)).toEqual([
      "setting-world",
      "setting-origin",
      "setting-destination",
      "setting-corridor",
    ]);
  }, 180_000);
});
