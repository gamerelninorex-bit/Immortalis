// CPAA-C1 v0.2 PROVISIONAL — in-flight safety. The existing contracts authorise a release of the PC's occupied time only by the work's
// CLOSE or by the lawful DENIAL of work that was never admitted; Timed Work preserves resolved progress and recalculates only an
// unresolved future, and CPAA-C1 C6 forbids marking the attempt cancelled, fabricating partial output or creating a new player choice.
// So the safe behavior is FAIL-CLOSED and DURABLE: an act that cannot cross keeps the PC occupied, visibly (`hold`), across reopen, and
// nothing can release, cancel, credit or replace it. These tests prove that; they do not provide a way out (see the foundation document).
import { describe, expect, it } from "vitest";
import { GipAdapter } from "@immortalis/engine";
import {
  INSTRUMENT_A,
  INSTITUTION_COURT,
  OFFICE_MAGISTRATE,
  SCOPE_BINDING_A,
  gipPublication,
} from "@immortalis/testkit";
import { establishInstitution, establishOffice, establishScopeBinding } from "../support/gip.ts";
import { sunsetInstrument } from "../support/gip-sunset.ts";
import { commitMove } from "../support/pc-movement.ts";
import {
  PC_TARGET_COMMITTED,
  PC_TARGET_REFUSAL,
  pcTargetTransaction,
} from "../support/pc-target-advance.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import {
  ACT_A,
  ACT_B,
  COLLECTION_REFUSAL,
  PC,
  T0,
  TAU,
  at,
  collectionCampaign,
  colPublication,
  confirmAndStart,
  prepareToStart,
  reopenCollection,
  reserveAmount,
  sourceRemaining,
  type CollectionSeeded,
} from "../support/pc-collection.ts";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
} from "@immortalis/protocol";

const advanceTo = (s: CollectionSeeded, value: number, tx: string) =>
  advanceActivePcToTarget(
    bindTrustedActivePcTargetAdvanceContext({
      campaign: s.campaign as never,
      pc_id: PC,
      target: at(value),
      transaction: pcTargetTransaction(tx) as never,
    }),
    { operation: "advance_active_pc_to_target" },
  );

/** a started collection whose earned boundary lies BEYOND an independent foreign Temporal object (a GIP sunset at T0+5) */
async function blocked(dir?: string): Promise<CollectionSeeded> {
  const s = await collectionCampaign(dir ? { dir } : {});
  const gip = new GipAdapter(s.campaign.store);
  await establishInstitution({ gip }, 1, INSTITUTION_COURT);
  await establishOffice({ gip }, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
  await establishScopeBinding({ gip }, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
  await must(
    gip.establishSunsetInstrument({
      ...gipPublication(4),
      instrument: sunsetInstrument(INSTRUMENT_A, at(T0.value + 5)),
    }),
  );
  await confirmAndStart(s, ACT_A, 3);
  return s;
}

describe("an act that cannot cross keeps the PC occupied: durably, visibly, and with no way out the contracts do not authorise", () => {
  it("the held act is named, refuses every second use of the PC's time, and cannot be released, denied, credited, replaced or restarted", async () => {
    const s = await blocked();
    const end = T0.value + 3 * TAU;
    expect(s.collect.hold(PC)).toEqual({ state: "IN_FLIGHT", act_id: ACT_A });

    // the crossing is refused (the foreign object lies inside it); nothing is resolved, nothing is released
    const before = s.campaign.store.head().state_sha256;
    expect(JSON.stringify(await advanceTo(s, end, "tx-held"))).toBe(PC_TARGET_REFUSAL);
    expect(s.campaign.store.head().state_sha256).toBe(before);
    expect(s.collect.hold(PC)).toEqual({ state: "IN_FLIGHT", act_id: ACT_A });
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);

    // a release of admitted work is not a denial: admission refuses it
    const denied = await s.collect.releaseOccupancyDenied({
      ...colPublication(900),
      pc_id: PC,
      act_id: ACT_A,
    });
    expect(denied.ok).toBe(false);
    // a second act, a movement, and a restart of the same act are all refused
    expect(JSON.stringify((await confirmAndStart(s, ACT_B, 1)).started)).toBe(COLLECTION_REFUSAL);
    expect((await commitMove(s, 1)).ok).toBe(false);
    const restart = await s.collect.startWork({
      ...colPublication(901),
      pc_id: PC,
      act_id: ACT_A,
      mechanism_id: "mech-hands-1",
      basis_id: "basis-main",
    });
    expect(restart.ok).toBe(false);
    expect(s.collect.hold(PC)).toEqual({ state: "IN_FLIGHT", act_id: ACT_A });
    // the PC may still pass time up to, but not across, the foreign object's instant, and stays held
    expect(await advanceTo(s, T0.value + 4, "tx-before")).toEqual(PC_TARGET_COMMITTED);
    expect(s.collect.hold(PC)).toEqual({ state: "IN_FLIGHT", act_id: ACT_A });
    expect(sourceRemaining(s)).toBe(5);
  });

  it("the hold is durable: reopen changes nothing, the act is still the one held cause, and the refusal is the same", async () => {
    const dir = tempDir("immortalis-col-hold-");
    const s = await blocked(dir);
    expect(JSON.stringify(await advanceTo(s, T0.value + 3 * TAU, "tx-held"))).toBe(
      PC_TARGET_REFUSAL,
    );
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenCollection(dir);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(r.collect.hold(PC)).toEqual({ state: "IN_FLIGHT", act_id: ACT_A });
    expect(JSON.stringify(await advanceTo(r, T0.value + 3 * TAU, "tx-held"))).toBe(
      PC_TARGET_REFUSAL,
    );
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(sourceRemaining(r)).toBe(5);
    expect(reserveAmount(r)).toBe(0);
    await r.campaign.close();
  });

  it("a registration Production never started is a distinct, visible hold, and the PC's own lawful denial still releases it", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3); // started: IN_FLIGHT
    expect(s.collect.hold(PC).state).toBe("IN_FLIGHT");
    const t = await collectionCampaign();
    await prepareToStart(t, ACT_A, 3);
    expect(t.collect.hold(PC)).toEqual({ state: "REGISTERED", act_id: ACT_A });
    const released = await t.collect.releaseOccupancyDenied({
      ...colPublication(902),
      pc_id: PC,
      act_id: ACT_A,
    });
    expect(released.ok).toBe(true);
    expect(t.collect.hold(PC)).toEqual({ state: "NONE" });
  });
});
