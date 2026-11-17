import { describe, expect, it } from "vitest";
import { GM_FREIGHT_TOOLS } from "@immortalis/contracts";
import { quarryWorksFixture, textileWorkshopFixture } from "@immortalis/testkit";
import { cutMatrix, wrap } from "../support/gm-freight-cuts.ts";
import {
  attestRequest,
  authorThroughSeal,
  legalRequest,
  newGmRig,
  operatorStartsChronology,
  playerAdvancesTo,
  receiptOf,
  settingRequest,
} from "../support/gm-freight.ts";

/**
 * Crash, lost acknowledgement and strict-replay recovery at EVERY durable cut of EVERY mutating GM tool call. MECHANISM ONLY (T1) over
 * real local files: it is not retained-host, provider or hosted-continuity evidence.
 *
 * For each mutating tool at its natural point in the chain: a campaign is copied, the call is run with the filesystem failing at exactly one
 * mutating operation (before it takes effect, or after it took effect so that the caller sees a failure: the lost acknowledgement), the
 * dead process's package lock is reclaimed by the operator, the campaign is re-opened under strict replay (every first-profile group
 * re-derived against its true pre-state) and verified, `gm_freight_reconcile` reports what committed, and the SAME call with the SAME
 * operation_id is presented again. It must converge on a final canonical state byte-identical to the uninterrupted run, and a faulted call
 * that left a commit behind must never have been reported as a plain refusal.
 */

const tool = GM_FREIGHT_TOOLS;

describe("recovery at every durable cut of every mutating GM call — Quarry Works (MECHANISM ONLY)", () => {
  const fx = quarryWorksFixture();

  it("establish_setting", async () => {
    const prefix = await newGmRig(fx);
    const m = await cutMatrix(prefix, {
      name: "establish_setting",
      operation: "cut-setting",
      call: wrap(tool.establishSetting, (r) => settingRequest(r.fx, "cut-setting")),
    });
    expect(m.scenarios).toBeGreaterThan(20);
    expect(m.unknown).toBeGreaterThan(0);
  }, 900_000);

  it("attest_opening", async () => {
    const prefix = await newGmRig(fx);
    receiptOf(await prefix.call(tool.establishSetting, settingRequest(fx)));
    const m = await cutMatrix(prefix, {
      name: "attest_opening",
      operation: "cut-attest",
      call: wrap(tool.attestOpening, (r) => attestRequest(r.fx, "cut-attest")),
    });
    expect(m.scenarios).toBeGreaterThan(4);
  }, 900_000);

  it("establish_legal (seven discrete owner acts)", async () => {
    const prefix = await newGmRig(fx);
    receiptOf(await prefix.call(tool.establishSetting, settingRequest(fx)));
    receiptOf(await prefix.call(tool.attestOpening, attestRequest(fx)));
    expect(await operatorStartsChronology(prefix)).toBe("TIME_ESTABLISHED");
    const m = await cutMatrix(prefix, {
      name: "establish_legal",
      operation: "cut-legal",
      call: wrap(tool.establishLegal, (r) => legalRequest(r.fx, "cut-legal")),
    });
    expect(m.scenarios).toBeGreaterThan(30);
    expect(m.unknown).toBeGreaterThan(0);
  }, 900_000);

  it("initiate, first ask (premises, C-05, Production's operation and its registration)", async () => {
    const prefix = await newGmRig(fx);
    await authorThroughSeal(prefix);
    const m = await cutMatrix(prefix, {
      name: "initiate-1",
      operation: "cut-go-1",
      call: wrap(tool.initiate, (r) => ({ operation_id: "cut-go-1", world_id: r.fx.worldId })),
    });
    expect(m.scenarios).toBeGreaterThan(30);
  }, 900_000);

  it("initiate, second ask (E0 through enrolment) after the player's advance", async () => {
    const prefix = await newGmRig(fx);
    await authorThroughSeal(prefix);
    const go = receiptOf(
      await prefix.call(tool.initiate, { operation_id: "go-1", world_id: fx.worldId }),
    );
    if (go.awaiting?.kind !== "PLAYER_OOC_TIME_ADVANCE")
      throw new Error("expected the production boundary");
    expect(await playerAdvancesTo(prefix, go.awaiting.to)).toBe("NULL_PC_ADVANCE_COMMITTED");
    const m = await cutMatrix(prefix, {
      name: "initiate-2",
      operation: "cut-go-2",
      call: wrap(tool.initiate, (r) => ({ operation_id: "cut-go-2", world_id: r.fx.worldId })),
    });
    expect(m.scenarios).toBeGreaterThan(30);
  }, 900_000);
});

describe("recovery — Textile Workshop: the receipt and adequacy cuts (MECHANISM ONLY)", () => {
  it("initiate after the delivery boundary (adequacy)", async () => {
    const fx = textileWorkshopFixture();
    const prefix = await newGmRig(fx);
    await authorThroughSeal(prefix);
    let go = receiptOf(
      await prefix.call(tool.initiate, { operation_id: "go-1", world_id: fx.worldId }),
    );
    for (let i = 2; go.awaiting?.kind === "PLAYER_OOC_TIME_ADVANCE"; i++) {
      expect(await playerAdvancesTo(prefix, go.awaiting.to)).toBe("NULL_PC_ADVANCE_COMMITTED");
      if (go.awaiting.reason === "SERVICE_DELIVERY_BOUNDARY") break;
      go = receiptOf(
        await prefix.call(tool.initiate, { operation_id: `go-${i}`, world_id: fx.worldId }),
      );
    }
    const m = await cutMatrix(prefix, {
      name: "initiate-adequacy",
      operation: "cut-go-ad",
      call: wrap(tool.initiate, (r) => ({ operation_id: "cut-go-ad", world_id: r.fx.worldId })),
    });
    expect(m.scenarios).toBeGreaterThan(6);
  }, 900_000);
});
