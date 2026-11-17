/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw owner facts */
import { afterEach, describe, expect, it } from "vitest";
import type { GmFreightResult } from "@immortalis/engine";
import { CanonicalCampaign, stepName } from "@immortalis/engine";
import {
  GM_FREIGHT_TOOLS,
  economyFreightRequestRef,
  logisticsCommitmentKey,
  logisticsTransferKey,
} from "@immortalis/contracts";
import {
  freightPublication,
  quarryWorksFixture,
  textileWorkshopFixture,
} from "@immortalis/testkit";
import {
  admitService,
  admitServiceBasis,
  dispatchFirst,
  fixFreight,
  keysOf,
  openFreightCampaign,
  type Freight,
} from "../support/freight.ts";
import {
  authorThroughSeal,
  newGmRig,
  playerAdvancesTo,
  receiptOf,
  statusOf,
  stepNames,
  type GmRig,
} from "../support/gm-freight.ts";
import { must } from "../support/temporal.ts";

/**
 * W2/W3, F2, F3, F4 and the dispatch/enrolment fence, through the bridge. MECHANISM ONLY (T1). Where a test needs the chain cut at a point the
 * bridge would not stop at (it proceeds as far as the owners allow), the cut is SEEDED through the owners' own adapters and labelled so; the
 * bridge then continues from whatever the owners hold. The bridge never causes a withdrawal: it asks, and Economy derives whether a cause exists.
 */

const tool = GM_FREIGHT_TOOLS;
const refusal = (r: GmFreightResult) => {
  if (r.ok) throw new Error("expected a refusal");
  return r.error as { code: string; message: string; details: any };
};

/** authoring, the first ask, and the player's advance to Production's own boundary: the whole output now exists */
async function atProductionDone(rig: GmRig): Promise<void> {
  await authorThroughSeal(rig);
  const go = receiptOf(
    await rig.call(tool.initiate, { operation_id: "go-1", world_id: rig.fx.worldId }),
  );
  if (go.awaiting?.kind !== "PLAYER_OOC_TIME_ADVANCE")
    throw new Error("expected the production boundary");
  expect(await playerAdvancesTo(rig, go.awaiting.to)).toBe("NULL_PC_ADVANCE_COMMITTED");
}

/** run owner-seeded steps on the open campaign through the owners' own adapters, then release it for the bridge */
async function seeded<T>(rig: GmRig, run: (f: Freight) => Promise<T>): Promise<T> {
  const f = await openFreightCampaign(rig.campaignDir, rig.fx);
  try {
    return await run(f);
  } finally {
    await f.campaign.close();
  }
}

const read = async <T>(rig: GmRig, f: (c: CanonicalCampaign) => T): Promise<T> => {
  const c = await must(
    CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-freight-test-read" }),
  );
  try {
    return f(c);
  } finally {
    await c.close();
  }
};

describe.each([
  ["Quarry Works", quarryWorksFixture],
  ["Textile Workshop", textileWorkshopFixture],
] as const)(
  "withdrawal, release and renewal through the bridge — %s (MECHANISM ONLY)",
  (_label, fixture) => {
    let rig: GmRig;
    afterEach(() => undefined);

    it("W3 before any service: the owners admit protection, close once, release the slots once, and Logistics is never written", async () => {
      rig = await newGmRig(fixture());
      const { fx } = rig;
      await atProductionDone(rig);
      const ref = await seeded(rig, (f) => fixFreight(f)); // OWNER-SEEDED CUT: E0 only
      expect(ref).toBe(economyFreightRequestRef(fx.sealId, 1));

      // nothing to withdraw yet: no owner-admitted cause exists, so Economy admits nothing and says why
      const none = refusal(
        await rig.call(tool.withdraw, { operation_id: "w-0", world_id: fx.worldId }),
      );
      expect(none.code).toBe("GM_FREIGHT_REFUSED");
      expect(none.details.halted.code).toBe("NOT_ADMISSIBLE");
      expect(
        statusOf(await rig.call(tool.status, { world_id: fx.worldId })).request?.allocation_status,
      ).toBe("pending");

      // the GM authors a PROSPECTIVE physical change: the damaged section was pulled down for good
      const change = receiptOf(
        await rig.call(tool.reportSiteChange, {
          operation_id: "change-1",
          world_id: fx.worldId,
          condition_id: fx.siteCondition.condition_id,
          change_id: "ceased-by-other-cause",
          statement:
            "SYNTHETIC FIXTURE: the damaged section was pulled down and the breach walled off for good.",
          outcome: "CEASED",
        }),
      );
      expect(stepNames(change)).toEqual(["site-change"]);

      const w = receiptOf(
        await rig.call(tool.withdraw, { operation_id: "w-1", world_id: fx.worldId }),
      );
      expect(stepNames(w)).toEqual([
        stepName("withdraw-admit", ref),
        stepName("withdraw-close", ref),
      ]);
      expect(w.status!.request?.allocation_status).toBe("terminal");

      await read(rig, (c) => {
        const owners = c.store.listFacts().filter((x) => x.owner === "logistics");
        expect(owners).toEqual([]); // F4: request-specific absence, nothing stored, no Logistics write
      });

      // the requirement has ceased: a renewed request is withheld by Economy, never conjured by the bridge
      const again = refusal(
        await rig.call(tool.initiate, { operation_id: "go-2", world_id: fx.worldId }),
      );
      expect(again.code).toBe("GM_FREIGHT_REFUSED");
      expect(again.details.halted.step).toBe(stepName("e2-fixation-after", ref));

      // asking to withdraw a closed request is a no-op: nothing more is written
      const closedAgain = receiptOf(
        await rig.call(tool.withdraw, { operation_id: "w-2", world_id: fx.worldId }),
      );
      expect(closedAgain.steps).toEqual([]);
    }, 300_000);

    it("W3 after a committed service: the exact unused release (F2) precedes the close, then a genuinely new request (E2) delivers", async () => {
      rig = await newGmRig(fixture());
      const { fx } = rig;
      await atProductionDone(rig);
      // OWNER-SEEDED CUT: E0, the service basis and L0, and no dispatch
      const ref1 = await seeded(rig, async (f) => {
        const ref = await fixFreight(f);
        await admitServiceBasis(f);
        await admitService(f, ref);
        return ref;
      });
      // a re-survey that leaves the same pieces damaged is still a prospective occurrence Economy re-derives as a W3 cause
      receiptOf(
        await rig.call(tool.reportSiteChange, {
          operation_id: "change-1",
          world_id: fx.worldId,
          condition_id: fx.siteCondition.condition_id,
          change_id: "re-survey",
          statement: "SYNTHETIC FIXTURE: re-surveyed; the same pieces remain damaged.",
          outcome: "STANDING",
        }),
      );
      const w = receiptOf(
        await rig.call(tool.withdraw, { operation_id: "w-1", world_id: fx.worldId }),
      );
      expect(stepNames(w)).toEqual([
        stepName("withdraw-admit", ref1),
        stepName("withdraw-f2-release", ref1),
        stepName("withdraw-close", ref1),
      ]);
      await read(rig, (c) => {
        const k = keysOf(fx);
        const commitment: any = c.store.getFact(
          logisticsCommitmentKey(fx.worldId, k.entityId),
        )!.value;
        expect(commitment.state.status).toBe("RELEASED_UNUSED");
        expect(c.store.getFact(logisticsTransferKey(fx.worldId, k.entityId))).toBeUndefined(); // never dispatched
      });

      // the bridge continues from what the owners hold: a NEW request under a new identity, with renewed authority
      const go = receiptOf(
        await rig.call(tool.initiate, { operation_id: "go-again", world_id: fx.worldId }),
      );
      const ref2 = go.status!.request!.request_ref;
      expect(ref2).not.toBe(ref1);
      expect(stepNames(go)).toEqual([
        stepName("e2-fixation-after", ref1),
        stepName("l0-service-admission", ref2),
        stepName("l1-first-dispatch", ref2),
        stepName("e1-consume-first-dispatch", ref2),
        stepName("te-enroll-transfer", ref2),
      ]);
      expect(go.awaiting).toMatchObject({
        kind: "PLAYER_OOC_TIME_ADVANCE",
        reason: "SERVICE_DELIVERY_BOUNDARY",
      });
      expect(await playerAdvancesTo(rig, fx.service.delivery_boundary_at)).toBe(
        "NULL_PC_ADVANCE_COMMITTED",
      );
      const done = receiptOf(
        await rig.call(tool.initiate, { operation_id: "go-done", world_id: fx.worldId }),
      );
      expect(stepNames(done)).toEqual([stepName("ad-destination-adequacy", ref2)]);
      expect(done.status!.stage).toBe("COMPLETE");
      await read(rig, (c) => expect(c.verify()).toEqual([]));
    }, 300_000);

    it("W2: an authoritative GIP write after the seal disables this profile only; Economy protects the request, the owners refuse service, and the request is closed once", async () => {
      rig = await newGmRig(fixture());
      const { fx } = rig;
      await atProductionDone(rig);
      const ref = await seeded(rig, async (f) => {
        const r = await fixFreight(f); // OWNER-SEEDED CUT: E0 only
        // a separate act in the same GIP owner, from outside the bridge: another institution is established (unrelated play proceeds)
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
        return r;
      });
      // GIP's current answer for every clause is now unresolved: the bridge's continuation reaches Logistics and the OWNER refuses the service
      const go = refusal(
        await rig.call(tool.initiate, { operation_id: "go-w2", world_id: fx.worldId }),
      );
      expect(go.code).toBe("GM_FREIGHT_REFUSED");
      expect(go.details.halted.step).toBe(stepName("l0-service-admission", ref));
      expect(go.details.steps.map((x: { step: string }) => x.step)).toEqual(["service-basis"]);
      // Economy derives the W2 cause itself; it admits protection only and releases nothing, then closes once
      const w = receiptOf(
        await rig.call(tool.withdraw, { operation_id: "w-2", world_id: fx.worldId }),
      );
      expect(stepNames(w)).toEqual([
        stepName("withdraw-admit", ref),
        stepName("withdraw-close", ref),
      ]);
      await read(rig, (c) => {
        const withdrawal: any = c.store.getFact(`economy/freight-withdrawal/${ref}`)?.value;
        expect(withdrawal.cause).toMatchObject({ kind: "W2", applicability: "unresolved" });
        expect(withdrawal.effect).toBe("PROTECTION_ONLY_RELEASES_NOTHING_CLOSES_NOTHING");
        expect(c.verify()).toEqual([]);
      });
    }, 300_000);

    it("after the first dispatch (F3) no withdrawal is possible: the owner refuses and nothing changes", async () => {
      rig = await newGmRig(fixture());
      const { fx } = rig;
      await atProductionDone(rig);
      const go = receiptOf(
        await rig.call(tool.initiate, { operation_id: "go-2", world_id: fx.worldId }),
      );
      expect(go.status!.milestones["transfer_enrolled_te"]).toBe(true);
      const before = await read(rig, (c) => c.store.head().state_sha256);
      receiptOf(
        await rig.call(tool.reportSiteChange, {
          operation_id: "change-1",
          world_id: fx.worldId,
          condition_id: fx.siteCondition.condition_id,
          change_id: "late-survey",
          statement: "SYNTHETIC FIXTURE: a survey after the cart left.",
          outcome: "STANDING",
        }),
      );
      const r = refusal(
        await rig.call(tool.withdraw, { operation_id: "w-1", world_id: fx.worldId }),
      );
      expect(r.code).toBe("GM_FREIGHT_REFUSED");
      expect(r.details.steps).toEqual([]);
      // only the GM's own prospective change was written after the dispatch; the request, its slots and the transfer are untouched
      const after = statusOf(await rig.call(tool.status, { world_id: fx.worldId }));
      expect(after.request?.allocation_status).toBe("dispatch-consumed");
      expect(before).not.toBe(await read(rig, (c) => c.store.head().state_sha256));
    }, 300_000);

    it("the dispatch/enrolment fence holds on the player's own advance, and the bridge's continuation closes the gap", async () => {
      rig = await newGmRig(fixture());
      const { fx } = rig;
      await atProductionDone(rig);
      // OWNER-SEEDED CUT: the first dispatch committed, its Temporal enrolment not yet made
      await seeded(rig, async (f) => {
        const ref = await fixFreight(f);
        await admitServiceBasis(f);
        await admitService(f, ref);
        await dispatchFirst(f, ref);
      });
      // the player's own advance is refused while a dispatch is unenrolled: the fence applies on the real operator path
      expect(await playerAdvancesTo(rig, fx.service.delivery_boundary_at)).not.toBe(
        "NULL_PC_ADVANCE_COMMITTED",
      );
      const go = receiptOf(
        await rig.call(tool.initiate, { operation_id: "go-fence", world_id: fx.worldId }),
      );
      expect(go.steps.map((s) => s.step.split("-").slice(0, 2).join("-"))).toEqual([
        "e1-consume",
        "te-enroll",
      ]);
      expect(await playerAdvancesTo(rig, fx.service.delivery_boundary_at)).toBe(
        "NULL_PC_ADVANCE_COMMITTED",
      );
    }, 300_000);
  },
);

describe("overlapping host calls", () => {
  it("two simultaneous asks for the chain: one holds the package lock, the other is the opaque refusal, and no act is duplicated", async () => {
    const rig = await newGmRig(quarryWorksFixture());
    await authorThroughSeal(rig);
    const [a, b] = await Promise.all([
      rig.call(tool.initiate, { operation_id: "race-a", world_id: rig.fx.worldId }),
      rig.call(tool.initiate, { operation_id: "race-b", world_id: rig.fx.worldId }),
    ]);
    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    for (const l of losers) expect((l as any).error.code).toBe("GM_FREIGHT_UNAVAILABLE");
    // whichever order, the owners hold exactly one of each fact and the campaign verifies
    const again = receiptOf(
      await rig.call(tool.initiate, { operation_id: "race-c", world_id: rig.fx.worldId }),
    );
    expect(again.steps).toEqual([]);
    await read(rig, (c) => {
      expect(c.verify()).toEqual([]);
      expect(
        c.store.listFacts().filter((x) => x.key.startsWith("production/operation/")),
      ).toHaveLength(1);
    });
  }, 240_000);
});
