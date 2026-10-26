// Economic Holding / Account position — interrupted recovery: a failure at EVERY durable step of the premise, a hold and
// a cancellation (before or after the step takes effect) converges, after restart and re-presentation of the SAME
// intent, on exactly one result — never a lost or duplicated encumbrance, never a position that created or destroyed
// value (RC-16 reconcile by identity; IM-12; IM-17). Local success is NOT provider or recovery acceptance (IA-07).
import { describe, expect, it } from "vitest";
import { CanonicalCampaign, EconomyAdapter, nodeFs } from "@immortalis/engine";
import {
  HOLDING_1,
  establishHoldingInput,
  holdInstruction,
  holdingActPublication,
  holdingPublication,
  instrumentFs,
  releaseInstruction,
} from "@immortalis/testkit";
import {
  holdingSummary,
  reopenHolding,
  seededHoldingCampaign,
  type HoldingSeeded,
} from "../support/economy-holding.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const HOLD_A = "hold-a";

type Step = (s: HoldingSeeded) => Promise<{ ok: boolean; error?: { code: string } }>;

/**
 * Runs `step` once cleanly (the reference), then once per mutating durable operation with the failure injected
 * before and after it; after each, the campaign is restarted, verified, the SAME intent is re-presented, and the final
 * state must be byte-identical to the reference.
 */
async function convergesAtEveryStep(
  seed: (dir: string) => Promise<void>,
  step: Step,
  expected: { available: number; encumbered: number },
) {
  const refDir = tempDir();
  await seed(refDir);
  const ref = await reopenHolding(refDir, "ref");
  await must(step(ref) as never);
  const refHead = ref.campaign.store.head();
  const refSummary = holdingSummary(ref.campaign.store);
  expect(ref.economy.availability(HOLDING_1)).toMatchObject(expected);
  await ref.campaign.close();

  const countDir = tempDir();
  await seed(countDir);
  const probe = instrumentFs(nodeFs);
  const p = await must(CanonicalCampaign.open(countDir, { fs: probe.fs }));
  const afterOpen = probe.count();
  await must(step({ campaign: p, economy: (await reopenLike(p)).economy }) as never);
  const afterStep = probe.count();
  await p.close();
  expect(afterStep - afterOpen).toBeGreaterThanOrEqual(2);

  const finals = new Set<string>();
  const seen = { absent: 0, present: 0 };
  for (let failAt = afterOpen + 1; failAt <= afterStep; failAt++) {
    for (const when of ["before", "after"] as const) {
      const dir = tempDir();
      await seed(dir);
      const inst = instrumentFs(nodeFs, { failAt, when });
      const campaign = await must(CanonicalCampaign.open(dir, { fs: inst.fs }));
      const r = await step({ campaign, economy: (await reopenLike(campaign)).economy });
      if (!r.ok) expect(r.error?.code).toBe("UNKNOWN_OUTCOME");
      await campaign.close();

      const re = await reopenHolding(dir, "restart");
      expect(re.campaign.verify()).toEqual([]);
      const here = re.economy.availability(HOLDING_1);
      if (here?.available === expected.available && here.encumbered === expected.encumbered)
        seen.present++;
      else seen.absent++;
      // the interrupted position is conserved whichever side of the commit the failure fell
      if (here) expect(here.available + here.encumbered).toBe(here.established);
      // re-present the SAME intent: the existing receipt is reached or the group is committed once
      const again = await must(step(re) as never);
      expect(typeof (again as { replayed: boolean }).replayed).toBe("boolean");
      const head = re.campaign.store.head();
      expect(head.revision).toBe(refHead.revision); // no duplicate group anywhere
      expect(holdingSummary(re.campaign.store).economy).toEqual(refSummary.economy);
      finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
      await re.campaign.close();
    }
  }
  expect(finals.size).toBe(1);
  expect([...finals][0]).toBe(`${refHead.state_sha256}/${refHead.journal_head_sha256}`);
  expect(seen.absent).toBeGreaterThan(0);
  expect(seen.present).toBeGreaterThan(0);
}

const reopenLike = (campaign: CanonicalCampaign) =>
  Promise.resolve({ economy: new EconomyAdapter(campaign.store) });

describe("a failure at every durable step converges on one result after restart (RC-16, IM-12, IM-17)", () => {
  it("of the scenario-opening premise", async () => {
    await convergesAtEveryStep(
      async (dir) => {
        const c = await must(
          CanonicalCampaign.create(dir, {
            campaignId: "campaign-economy-holding",
            buildId: "seed",
          }),
        );
        await c.close();
      },
      (s) =>
        s.economy.establishHolding({
          ...holdingPublication(1),
          holding: establishHoldingInput(),
        }),
      { available: 7, encumbered: 0 },
    );
  }, 120_000);

  it("of a hold (the partition and its encumbrance are one group: both or neither)", async () => {
    await convergesAtEveryStep(
      async (dir) => {
        await (await seededHoldingCampaign(dir)).campaign.close();
      },
      (s) =>
        s.economy.holdEncumbrance({
          ...holdingActPublication(1),
          hold: holdInstruction(1, HOLD_A, 3),
        }),
      { available: 4, encumbered: 3 },
    );
  }, 120_000);

  it("of a cancellation (restored exactly once, never twice, never lost)", async () => {
    await convergesAtEveryStep(
      async (dir) => {
        const s = await seededHoldingCampaign(dir);
        await must(
          s.economy.holdEncumbrance({
            ...holdingActPublication(1),
            hold: holdInstruction(1, HOLD_A, 3),
          }),
        );
        await s.campaign.close();
      },
      (s) =>
        s.economy.releaseEncumbrance({
          ...holdingActPublication(2),
          release: releaseInstruction(1, HOLD_A),
        }),
      { available: 7, encumbered: 0 },
    );
  }, 120_000);
});
