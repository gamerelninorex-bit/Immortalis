/* eslint-disable @typescript-eslint/no-explicit-any -- rejections are read by their `details.reason` */
// F-014B B2-T02 (layers) — the ONE common W2 fence predicate is applied at three call sites: the commit core, the base owner admission and the extension
// binding, in live publication AND in original-policy historical verification. The core alone makes a live write fail (the lifecycle suite proves it end
// to end), so removing the base-admission or the extension-binding copy changes nothing a commit through the store can show. Those copies are
// DEFENCE IN DEPTH, and a defence nobody exercises is not one: this suite calls each layer DIRECTLY on a state that holds an ACTIVE wait and requires the
// refusal from that layer alone, so a layer that stops applying the fence is noticed (docs/evidence/f014b-b2/mutation.md records the mutants these kill).
//
// SCRIPTED TESTKIT MECHANISM ONLY: the wait is opened through the TESTKIT-ONLY fixture admission.
import { describe, expect, it } from "vitest";
import type { CommitGroup } from "@immortalis/contracts";
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
  stageClaim,
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
  const { x } = await lifecycle(rig, "marker");
  const marked = rig.store.canonicalState!() as CampaignState;
  await rig.custody.open(rig.proof);
  const active = rig.store.canonicalState!() as CampaignState;
  if (deriveGmWaitFence(active).active?.x !== x) throw new Error("the wait is not ACTIVE");
  return { rig, marked, active, x };
}

/** the verdicts of one layer on one group, as the reasons the fence gave: live, then in original-policy historical verification */
const verdicts = (a: WriteAdmission, group: CommitGroup, state: CampaignState) => ({
  live: reasonOf(a.check(group, state, undefined)),
  historical: reasonOf(a.verifyHistorical?.(group, state)),
});

describe("B2-T02 each fence layer is independently sound", () => {
  it("[control + F-2] with only a marker (no durable opening) no layer fences an ordinary foreign group, yet every layer refuses a claim to be a stage of X that hangs from the marker", async () => {
    const { marked, x } = await states();
    const claim = stageClaim(x, `gm-wait-marker-group:${x}`, 1);
    for (const [name, a] of [
      ["base", FIXTURE_ADMISSION],
      ["extension", extensionAdmission()],
    ] as const) {
      const ordinary = verdicts(a, foreignGroup(1), marked);
      expect(ordinary.live, `${name} live`).not.toBe("GM_WAIT_ACTIVE_FOREIGN");
      expect(ordinary.historical, `${name} historical`).not.toBe("GM_WAIT_ACTIVE_FOREIGN");
      expect(verdicts(a, claim, marked), `${name} claim`).toEqual({
        live: "GM_WAIT_STAGE_CLAIM_UNSOURCED",
        historical: "GM_WAIT_STAGE_CLAIM_UNSOURCED",
      });
    }
  });

  it("the BASE owner admission refuses a foreign group (ACTIVE) and a claim to be a stage (unsourced) on an ACTIVE state, live and in historical verification", async () => {
    const { rig, active, x } = await states();
    const claim = stageClaim(x, authorityGroupOf(rig.store, x), 1);
    expect(verdicts(FIXTURE_ADMISSION, foreignGroup(1), active)).toEqual({
      live: "GM_WAIT_ACTIVE_FOREIGN",
      historical: "GM_WAIT_ACTIVE_FOREIGN",
    });
    expect(verdicts(FIXTURE_ADMISSION, claim, active)).toEqual({
      live: "GM_WAIT_STAGE_CLAIM_UNSOURCED",
      historical: "GM_WAIT_STAGE_CLAIM_UNSOURCED",
    });
  });

  it("the EXTENSION binding refuses the same two groups AHEAD of its early return, live and in historical verification", async () => {
    const { rig, active, x } = await states();
    const ext = extensionAdmission();
    const claim = stageClaim(x, authorityGroupOf(rig.store, x), 2);
    // the groups belong to the extension owner: without the fence ahead of the early return, `check` would hand them to the extension's own admission
    // and `verifyHistorical` would return null at once (the owner-specific verification of extension groups stays skipped, as the census records)
    expect(verdicts(ext, foreignGroup(2), active)).toEqual({
      live: "GM_WAIT_ACTIVE_FOREIGN",
      historical: "GM_WAIT_ACTIVE_FOREIGN",
    });
    expect(verdicts(ext, claim, active)).toEqual({
      live: "GM_WAIT_STAGE_CLAIM_UNSOURCED",
      historical: "GM_WAIT_STAGE_CLAIM_UNSOURCED",
    });
  });
});
