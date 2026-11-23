/* eslint-disable @typescript-eslint/no-explicit-any -- rejections are read by their `details.reason` */
// F-014B B2-T02 (layers) — the ONE common W2 fence predicate is applied at three call sites: the commit core, the base owner admission and the extension
// binding, in live publication AND in original-policy historical verification. The core alone makes a live write fail (the lifecycle suite proves it end
// to end), so removing the base-admission or the extension-binding copy changes nothing a commit through the store can show. Those copies are
// DEFENCE IN DEPTH, and a defence nobody exercises is not one: this suite calls each layer DIRECTLY on a state that holds an ACTIVE wait and requires the
// refusal from that layer alone, so a layer that stops applying the fence is noticed (docs/evidence/f014b-b2/mutation.md records the mutants these kill).
//
// SCRIPTED TESTKIT MECHANISM ONLY: the wait is opened through the TESTKIT-ONLY fixture admission.
import { describe, expect, it } from "vitest";
import {
  deriveGmWaitFence,
  storeBindings,
  type CampaignState,
  type WriteAdmission,
} from "@immortalis/engine";
import {
  FIXTURE_ADMISSION,
  SYNTH_EXTENSION,
  authorityGroupOf,
  foreignGroup,
  lifecycle,
  seededRig,
  stageGroup,
  tempDir,
} from "./b2-support.ts";

const reasonOf = (r: unknown): string | undefined => (r as any)?.details?.reason;
const extensionAdmission = (): WriteAdmission => {
  const b = storeBindings(SYNTH_EXTENSION, FIXTURE_ADMISSION);
  if (!b.ok) throw new Error(JSON.stringify(b.error));
  return b.value.admission;
};

async function states() {
  const rig = await seededRig(tempDir());
  await lifecycle(rig, "marker");
  const marked = rig.store.canonicalState!() as CampaignState;
  await rig.custody.open(rig.proof);
  const active = rig.store.canonicalState!() as CampaignState;
  const x = deriveGmWaitFence(active).active!.x;
  return { rig, marked, active, x };
}

describe("B2-T02 each fence layer is independently sound", () => {
  it("[control] with only a marker (no durable opening) no layer fences a foreign group", async () => {
    const { marked } = await states();
    const ext = extensionAdmission();
    for (const [name, a] of [
      ["base", FIXTURE_ADMISSION],
      ["extension", ext],
    ] as const) {
      expect(reasonOf(a.check(foreignGroup(1), marked, undefined)), `${name} live`).not.toBe(
        "GM_WAIT_ACTIVE_FOREIGN",
      );
      expect(
        reasonOf(a.verifyHistorical?.(foreignGroup(1), marked)),
        `${name} historical`,
      ).not.toBe("GM_WAIT_ACTIVE_FOREIGN");
    }
  });

  it("the BASE owner admission refuses a foreign group on an ACTIVE state, live and in historical verification, and does not fence the transaction's own stage", async () => {
    const { rig, active, x } = await states();
    const stage = stageGroup(x, authorityGroupOf(rig.store, x), 1);
    expect(reasonOf(FIXTURE_ADMISSION.check(foreignGroup(1), active, undefined))).toBe(
      "GM_WAIT_ACTIVE_FOREIGN",
    );
    expect(reasonOf(FIXTURE_ADMISSION.verifyHistorical?.(foreignGroup(1), active))).toBe(
      "GM_WAIT_ACTIVE_FOREIGN",
    );
    expect(reasonOf(FIXTURE_ADMISSION.check(stage, active, undefined))).not.toBe(
      "GM_WAIT_ACTIVE_FOREIGN",
    );
    expect(reasonOf(FIXTURE_ADMISSION.verifyHistorical?.(stage, active))).not.toBe(
      "GM_WAIT_ACTIVE_FOREIGN",
    );
  });

  it("the EXTENSION binding refuses a foreign extension-owner group on an ACTIVE state AHEAD of its early return, live and in historical verification, and does not fence the stage", async () => {
    const { rig, active, x } = await states();
    const ext = extensionAdmission();
    const stage = stageGroup(x, authorityGroupOf(rig.store, x), 2);
    // the group belongs to the extension owner: without the fence ahead of the early return, `check` would hand it to the extension's own admission
    // and `verifyHistorical` would return null at once (the owner-specific verification of extension groups stays skipped, as the census records)
    expect(reasonOf(ext.check(foreignGroup(2), active, undefined))).toBe("GM_WAIT_ACTIVE_FOREIGN");
    expect(reasonOf(ext.verifyHistorical?.(foreignGroup(2), active))).toBe(
      "GM_WAIT_ACTIVE_FOREIGN",
    );
    expect(reasonOf(ext.check(stage, active, undefined))).not.toBe("GM_WAIT_ACTIVE_FOREIGN");
    expect(reasonOf(ext.verifyHistorical?.(stage, active))).not.toBe("GM_WAIT_ACTIVE_FOREIGN");
  });
});
