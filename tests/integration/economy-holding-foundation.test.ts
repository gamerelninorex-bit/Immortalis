// Economic Holding / Account position and its reversible economic encumbrance (OOC scenario / mechanism proof):
// "a separately authored scenario-opening premise fixes holder H, object O and an exact 7 available → a distinct OOC hold
// instruction for 3 → Economy checks actual current availability and atomically partitions the SAME conserved position
// into 4 available / 3 encumbered → a later availability read and a competing hold see the changed answer → a separate
// cancellation of the still-active hold restores 7 / 0 exactly once; across save, close and load, no value is created or
// destroyed and nothing is double-encumbered."
// Governing source: WS-004 §2.1, §3, §4, §11, §20, §27.14, §28, §30 (pin 2026-09-24T11:45:02.825Z); F-027 spec lock.
// Not proved (and not representable): payment, settlement, transfer, title, legal priority, issuance, physical reserve,
// the holder's in-world consent, any actor decision. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  economyEncumbranceKey,
  economyHoldingKey,
  economyRealizationKey,
} from "@immortalis/contracts";
import { EconomyAdapter } from "@immortalis/engine";
import {
  HOLDER_H,
  HOLDING_1,
  HOLDING_2,
  HOLDING_UNIT,
  OBJECT_O,
  PREMISE_1,
  PREMISE_2,
  establishHoldingInput,
  holdInstruction,
  holdingActPublication,
  holdingPublication,
  releaseInstruction,
} from "@immortalis/testkit";
import {
  holdingSummary,
  reopenHolding,
  seededHoldingCampaign,
} from "../support/economy-holding.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const HOLD_A = "hold-a";
const HOLD_B = "hold-b";
const position = (e: EconomyAdapter, id = HOLDING_1) => {
  const a = e.availability(id)!;
  return { available: a.available, encumbered: a.encumbered, established: a.established };
};

describe("the scenario-opening premise (WS-004 §2.1, §3)", () => {
  it("commits an independently authored holding whose whole amount is available, with its provenance", async () => {
    const s = await seededHoldingCampaign(tempDir());
    const h = s.economy.holding(HOLDING_1)!;
    expect(h.fact.key).toBe(economyHoldingKey(HOLDING_1));
    expect(h.fact.version).toBe(1);
    expect(h.fact.owner).toBe("economy");
    expect(h.fact.facet).toBe("economy_state");
    expect(h.value).toEqual({
      holding_id: HOLDING_1,
      holder_ref: HOLDER_H,
      object_ref: OBJECT_O,
      quantity_or_bounded_position: {
        unit: HOLDING_UNIT,
        established: 7,
        available: 7,
        encumbered: 0,
        restricted: 0,
      },
      restriction_or_authority_ref: null,
      lifecycle_status: "active",
      provenance_ref: { kind: "OOC_SCENARIO_OPENING_PREMISE", premise_id: PREMISE_1 },
      nature: "ECONOMIC_BOOK_POSITION_NOT_STOCK_TITLE_ISSUANCE_OR_RESERVATION",
    });
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ status: "AVAILABLE", available: 7 });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("creates no other fact: no encumbrance, request, demand, realization, entity or temporal state", async () => {
    const s = await seededHoldingCampaign(tempDir());
    expect(s.campaign.store.listFacts().map((f) => f.key)).toEqual([economyHoldingKey(HOLDING_1)]);
    expect(s.campaign.store.getFact(economyRealizationKey(HOLDING_1))).toBeUndefined();
  });

  it("establishes a holding once; a second premise for the same identity is refused without mutation", async () => {
    const s = await seededHoldingCampaign(tempDir());
    const before = holdingSummary(s.campaign.store);
    expect(
      await codeOf(
        s.economy.establishHolding({
          ...holdingPublication(2),
          holding: establishHoldingInput({ amount: 99, premise_id: PREMISE_2 }),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(position(s.economy)).toEqual({ available: 7, encumbered: 0, established: 7 });
  });

  it("two independent premises are two independent conserved positions", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await must(
      s.economy.establishHolding({
        ...holdingPublication(2),
        holding: establishHoldingInput({ holding_id: HOLDING_2, amount: 2, premise_id: PREMISE_2 }),
      }),
    );
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    expect(position(s.economy, HOLDING_1)).toEqual({ available: 4, encumbered: 3, established: 7 });
    expect(position(s.economy, HOLDING_2)).toEqual({ available: 2, encumbered: 0, established: 2 });
  });
});

describe("hold: Economy derives 7 → 4 available + 3 encumbered from the premise and the instruction alone (WS-004 §20)", () => {
  it("partitions the same conserved position atomically and records one active encumbrance", async () => {
    const s = await seededHoldingCampaign(tempDir());
    const outcome = await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    expect(outcome.replayed).toBe(false);
    const h = s.economy.holding(HOLDING_1)!;
    expect(h.fact.version).toBe(2);
    expect(h.value.quantity_or_bounded_position).toMatchObject({
      established: 7,
      available: 4,
      encumbered: 3,
      restricted: 0,
    });
    const e = s.economy.encumbrance(HOLDING_1, HOLD_A)!;
    expect(e.fact.key).toBe(economyEncumbranceKey(HOLDING_1, HOLD_A));
    expect(e.value).toMatchObject({
      encumbrance_id: HOLD_A,
      admitted_at_holding_version: 1,
      quantity: { amount: 3, unit: HOLDING_UNIT },
      lifecycle_status: "active",
      cancellation: null,
      authorization: {
        basis: "OOC_SCENARIO_HOLD_INSTRUCTION",
        in_world_consent: "NOT_ASSERTED",
      },
    });
    // one group wrote both: the partition and its encumbrance cannot be seen apart
    expect(e.fact.provenance.group_id).toBe(h.fact.provenance.group_id);
    // labels are inherited from the holding, never defaulted
    expect(e.fact.basis).toBe(h.fact.basis);
    expect(e.fact.secrecy).toBe(h.fact.secrecy);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("does not touch the premise's provenance, holder, object, establishment or restriction", async () => {
    const s = await seededHoldingCampaign(tempDir());
    const before = s.economy.holding(HOLDING_1)!.value;
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    const after = s.economy.holding(HOLDING_1)!.value;
    expect({ ...after, quantity_or_bounded_position: null }).toEqual({
      ...before,
      quantity_or_bounded_position: null,
    });
    expect(after.quantity_or_bounded_position.established).toBe(
      before.quantity_or_bounded_position.established,
    );
  });

  it("changes the later answer: availability reads 4 / 3, a competing hold of 5 is refused, a genuine second hold of up to 4 succeeds", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    expect(s.economy.availability(HOLDING_1)).toMatchObject({
      version: 2,
      available: 4,
      encumbered: 3,
      status: "PARTLY_ENCUMBERED",
    });

    // 5 > 4: the same conserved position cannot fund both uses — refused, nothing changes
    const before = holdingSummary(s.campaign.store);
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(2),
          hold: holdInstruction(2, "hold-too-big", 5),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(s.economy.encumbrance(HOLDING_1, "hold-too-big")).toBeUndefined();

    // a genuinely distinct second hold of exactly the 4 that remain
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(3),
        hold: holdInstruction(2, HOLD_B, 4),
      }),
    );
    expect(s.economy.availability(HOLDING_1)).toMatchObject({
      version: 3,
      available: 0,
      encumbered: 7,
      status: "ENCUMBERED",
    });
    // nothing remains to hold
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(4),
          hold: holdInstruction(3, "hold-none", 1),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a distinct initial available position of 2 refuses a request for 3 without any mutation (no self-justifying success)", async () => {
    const s = await seededHoldingCampaign(tempDir(), { amount: 2 });
    const before = holdingSummary(s.campaign.store);
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(1),
          hold: holdInstruction(1, HOLD_A, 3),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(position(s.economy)).toEqual({ available: 2, encumbered: 0, established: 2 });
    // the SAME instruction shape succeeds exactly when the premise supports it
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(2),
        hold: holdInstruction(1, HOLD_B, 2),
      }),
    );
    expect(position(s.economy)).toEqual({ available: 0, encumbered: 2, established: 2 });
  });

  it("is a function of the premise: the same instruction yields different partitions over different premises", async () => {
    const results: Array<[number, number]> = [];
    for (const amount of [3, 5, 7, 100]) {
      const s = await seededHoldingCampaign(tempDir(), { amount });
      await must(
        s.economy.holdEncumbrance({
          ...holdingActPublication(1),
          hold: holdInstruction(1, HOLD_A, 3),
        }),
      );
      const p = position(s.economy);
      results.push([p.available, p.encumbered]);
    }
    expect(results).toEqual([
      [0, 3],
      [2, 3],
      [4, 3],
      [97, 3],
    ]);
  });
});

describe("release: a separate cancellation of the still-active hold restores availability exactly once", () => {
  it("returns to 7 available / 0 encumbered and marks the hold cancelled with its own instruction", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    await must(
      s.economy.releaseEncumbrance({
        ...holdingActPublication(2),
        release: releaseInstruction(1, HOLD_A),
      }),
    );
    expect(position(s.economy)).toEqual({ available: 7, encumbered: 0, established: 7 });
    expect(s.economy.holding(HOLDING_1)!.fact.version).toBe(3);
    const e = s.economy.encumbrance(HOLDING_1, HOLD_A)!;
    expect(e.fact.version).toBe(2);
    expect(e.value.lifecycle_status).toBe("cancelled");
    expect(e.value.cancellation).toEqual({
      basis: "OOC_SCENARIO_CANCELLATION_INSTRUCTION",
      instruction_id: `cancel-${HOLD_A}`,
    });
    // the original authorization and quantity are untouched
    expect(e.value.quantity).toEqual({ amount: 3, unit: HOLDING_UNIT });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("restores exactly once: a second cancellation, a stale one and a reused hold identity are refused", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    await must(
      s.economy.releaseEncumbrance({
        ...holdingActPublication(2),
        release: releaseInstruction(1, HOLD_A),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    // already cancelled at version 2: pinned at 2 → not active
    expect(
      await codeOf(
        s.economy.releaseEncumbrance({
          ...holdingActPublication(3),
          release: releaseInstruction(2, HOLD_A, { instruction_id: "cancel-again" }),
        }),
      ),
    ).toBe("ENCUMBRANCE_NOT_ACTIVE");
    // pinned at the version it no longer has
    expect(
      await codeOf(
        s.economy.releaseEncumbrance({
          ...holdingActPublication(4),
          release: releaseInstruction(1, HOLD_A, { instruction_id: "cancel-stale" }),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    // a spent hold identity cannot be placed again
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(5),
          hold: holdInstruction(3, HOLD_A, 3),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(position(s.economy)).toEqual({ available: 7, encumbered: 0, established: 7 });
  });

  it("releases only the named hold: the other hold keeps encumbering, and the freed amount can be held again under a new identity", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(2),
        hold: holdInstruction(2, HOLD_B, 4),
      }),
    );
    expect(position(s.economy)).toEqual({ available: 0, encumbered: 7, established: 7 });
    await must(
      s.economy.releaseEncumbrance({
        ...holdingActPublication(3),
        release: releaseInstruction(1, HOLD_A),
      }),
    );
    expect(position(s.economy)).toEqual({ available: 3, encumbered: 4, established: 7 });
    expect(s.economy.encumbrance(HOLDING_1, HOLD_B)!.value.lifecycle_status).toBe("active");
    // 4 is no longer available (only the 3 just freed)
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(4),
          hold: holdInstruction(4, "hold-c", 4),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(5),
        hold: holdInstruction(4, "hold-c", 3),
      }),
    );
    expect(position(s.economy)).toEqual({ available: 0, encumbered: 7, established: 7 });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("refuses an unknown hold, a hold of another holding and an unknown holding without mutation", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await must(
      s.economy.establishHolding({
        ...holdingPublication(2),
        holding: establishHoldingInput({ holding_id: HOLDING_2, amount: 5, premise_id: PREMISE_2 }),
      }),
    );
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    for (const [n, release] of [
      [2, releaseInstruction(1, "no-such-hold")],
      [3, releaseInstruction(1, HOLD_A, { holding_id: HOLDING_2 })], // foreign: H2 has no such hold
      [4, releaseInstruction(1, HOLD_A, { holding_id: "no-such-holding" })],
    ] as const) {
      expect(
        await codeOf(s.economy.releaseEncumbrance({ ...holdingActPublication(n), release })),
      ).toBe("PREREQUISITE_MISSING");
    }
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(position(s.economy, HOLDING_1)).toEqual({ available: 4, encumbered: 3, established: 7 });
    expect(position(s.economy, HOLDING_2)).toEqual({ available: 5, encumbered: 0, established: 5 });
  });
});

describe("save, close and load recover availability and encumbrance exactly (IM-12, IM-17)", () => {
  it("recovers the premise, the hold and the release across a real close and reopen, and continues from them", async () => {
    const dir = tempDir();
    const s = await seededHoldingCampaign(dir);
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    await s.campaign.close();

    const r = await reopenHolding(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(holdingSummary(r.campaign.store)).toEqual(before);
    expect(r.economy.availability(HOLDING_1)).toMatchObject({ available: 4, encumbered: 3 });
    // the recovered competing hold still sees the changed state
    expect(
      await codeOf(
        r.economy.holdEncumbrance({
          ...holdingActPublication(2),
          hold: holdInstruction(2, HOLD_B, 5),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    await must(
      r.economy.releaseEncumbrance({
        ...holdingActPublication(3),
        release: releaseInstruction(1, HOLD_A),
      }),
    );
    await r.campaign.close();

    const again = await reopenHolding(dir, "holding-reopen-2");
    expect(again.campaign.verify()).toEqual([]);
    expect(position(again.economy)).toEqual({ available: 7, encumbered: 0, established: 7 });
    expect(again.economy.encumbrance(HOLDING_1, HOLD_A)!.value.lifecycle_status).toBe("cancelled");
    // and a cancelled hold is still not releasable after the restart
    expect(
      await codeOf(
        again.economy.releaseEncumbrance({
          ...holdingActPublication(4),
          release: releaseInstruction(2, HOLD_A, { instruction_id: "cancel-after-restart" }),
        }),
      ),
    ).toBe("ENCUMBRANCE_NOT_ACTIVE");
    await again.campaign.close();
  });
});
