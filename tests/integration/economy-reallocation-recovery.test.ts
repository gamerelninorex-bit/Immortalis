// Conserved OOC reallocation between two Economic Holding / Account positions — interrupted recovery: a failure at EVERY
// durable step of the reallocation (before or after the step takes effect) converges, after restart and re-presentation
// of the SAME intent, on exactly one result — never a lost or duplicated movement, never one side moved without the
// other, never a position that created or destroyed value (RC-16 reconcile by identity; IM-12; IM-17). Local success is
// NOT provider or recovery acceptance (IA-07).
import { describe, expect, it } from "vitest";
import { CanonicalCampaign, EconomyAdapter, nodeFs } from "@immortalis/engine";
import {
  HOLDING_1,
  HOLDING_2,
  holdInstruction,
  holdingActPublication,
  instrumentFs,
  reallocationInstruction,
} from "@immortalis/testkit";
import {
  holdingSummary,
  reopenHolding,
  seededReallocationCampaign,
  type HoldingSeeded,
} from "../support/economy-holding.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const HOLD_A = "hold-a";

type Step = (s: HoldingSeeded) => Promise<{ ok: boolean; error?: { code: string } }>;

const pair = (e: EconomyAdapter) => {
  const a = e.availability(HOLDING_1)!;
  const b = e.availability(HOLDING_2)!;
  return { a, b, total: a.available + a.encumbered + b.available + b.encumbered };
};

/**
 * Runs `step` once cleanly (the reference), then once per mutating durable operation with the failure injected
 * before and after it; after each, the campaign is restarted, verified, the SAME intent is re-presented, and the final
 * state must be byte-identical to the reference. Whichever side of the commit the failure fell, the interrupted pair is
 * either wholly before or wholly after the movement and always totals the same.
 */
async function convergesAtEveryStep(
  seed: (dir: string) => Promise<void>,
  step: Step,
  expected: { a: number; b: number },
) {
  const refDir = tempDir();
  await seed(refDir);
  const ref = await reopenHolding(refDir, "ref");
  await must(step(ref) as never);
  const refHead = ref.campaign.store.head();
  const refSummary = holdingSummary(ref.campaign.store);
  expect(ref.economy.availability(HOLDING_1)!.available).toBe(expected.a);
  expect(ref.economy.availability(HOLDING_2)!.available).toBe(expected.b);
  const grandTotal = pair(ref.economy).total;
  await ref.campaign.close();

  const countDir = tempDir();
  await seed(countDir);
  const probe = instrumentFs(nodeFs);
  const p = await must(CanonicalCampaign.open(countDir, { fs: probe.fs }));
  const afterOpen = probe.count();
  await must(step({ campaign: p, economy: new EconomyAdapter(p.store) }) as never);
  const afterStep = probe.count();
  await p.close();
  expect(afterStep - afterOpen).toBeGreaterThanOrEqual(3);

  const finals = new Set<string>();
  const seen = { absent: 0, present: 0 };
  for (let failAt = afterOpen + 1; failAt <= afterStep; failAt++) {
    for (const when of ["before", "after"] as const) {
      const dir = tempDir();
      await seed(dir);
      const inst = instrumentFs(nodeFs, { failAt, when });
      const campaign = await must(CanonicalCampaign.open(dir, { fs: inst.fs }));
      const r = await step({ campaign, economy: new EconomyAdapter(campaign.store) });
      if (!r.ok) expect(r.error?.code).toBe("UNKNOWN_OUTCOME");
      await campaign.close();

      const re = await reopenHolding(dir, "restart");
      expect(re.campaign.verify()).toEqual([]);
      const here = pair(re.economy);
      if (here.a.available === expected.a && here.b.available === expected.b) seen.present++;
      else seen.absent++;
      // never one side moved without the other, never value created or destroyed
      expect(here.total).toBe(grandTotal);
      expect([here.a.available === expected.a, here.b.available === expected.b]).not.toEqual([
        true,
        false,
      ]);
      expect([here.a.available === expected.a, here.b.available === expected.b]).not.toEqual([
        false,
        true,
      ]);
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

describe("a failure at every durable step converges on one reallocation after restart (RC-16, IM-12, IM-17)", () => {
  it("of the two positions and their record (both sides and the record are one group: all or none)", async () => {
    await convergesAtEveryStep(
      async (dir) => {
        await (await seededReallocationCampaign(dir)).campaign.close();
      },
      (s) =>
        s.economy.reallocateHoldings({
          ...holdingActPublication(1),
          reallocation: reallocationInstruction(1, 1, 3),
        }),
      { a: 4, b: 5 },
    );
  }, 120_000);

  it("of a reallocation over an active encumbrance (the hold survives every interruption; only the available part moves)", async () => {
    await convergesAtEveryStep(
      async (dir) => {
        const s = await seededReallocationCampaign(dir);
        await must(
          s.economy.holdEncumbrance({
            ...holdingActPublication(1),
            hold: holdInstruction(1, HOLD_A, 3),
          }),
        );
        await s.campaign.close();
      },
      (s) =>
        s.economy.reallocateHoldings({
          ...holdingActPublication(2),
          reallocation: reallocationInstruction(2, 1, 4),
        }),
      { a: 0, b: 6 },
    );
  }, 120_000);
});

describe("the reopened campaign keeps every position, hold and the one record after each restart", () => {
  it("restart after the reallocation and after a later hold retains the same identities and quantities", async () => {
    const dir = tempDir();
    const s = await seededReallocationCampaign(dir);
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    await s.campaign.close();
    const r1 = await reopenHolding(dir, "r1");
    await must(
      r1.economy.holdEncumbrance({
        ...holdingActPublication(2),
        hold: holdInstruction(2, "hold-b", 4, { holding_id: HOLDING_2 }),
      }),
    );
    const summary = holdingSummary(r1.campaign.store);
    await r1.campaign.close();
    const r2 = await reopenHolding(dir, "r2");
    expect(r2.campaign.verify()).toEqual([]);
    expect(holdingSummary(r2.campaign.store)).toEqual(summary);
    expect(pair(r2.economy).b).toMatchObject({ available: 1, encumbered: 4 });
    expect(pair(r2.economy).a).toMatchObject({ available: 4, encumbered: 0 });
    expect(r2.economy.reallocation("reallocation-1")!.value.quantity.amount).toBe(3);
    await r2.campaign.close();
  });
});
