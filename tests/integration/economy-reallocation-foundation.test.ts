// Conserved OOC reallocation between two Economy-owned Economic Holding / Account positions (OOC scenario / mechanism
// proof): "two independently committed openings (A = 7, B = 2, same object and unit) → a separately identified OOC
// reallocation instruction for 3 naming both positions at the versions it saw → Economy re-derives eligibility from the
// committed positions and atomically commits A 4 available / B 5 available, combined 9 → a later independent availability
// read and a new hold see the changed answer on BOTH positions → save, close and load keep the same identities,
// quantities and provenance."
// Governing source: WS-004 §2.1, §3 (holdings are conserved across transfers), §4, §20, §27.14, §28, §30 (pin
// 2026-09-24T11:45:02.825Z); F-027 spec lock. A book-position movement only: not a title transfer, payment, settlement,
// delivery, issuance or the holders' in-world consent (all EXTERNAL PREREQUISITES MISSING FOR LIVE COMMERCE). Local
// success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import { economyHoldingKey, economyReallocationKey } from "@immortalis/contracts";
import { EconomyAdapter } from "@immortalis/engine";
import {
  HOLDER_H,
  HOLDER_OTHER,
  HOLDING_1,
  HOLDING_2,
  HOLDING_UNIT,
  OBJECT_O,
  PREMISE_1,
  PREMISE_2,
  REALLOCATION_1,
  establishHoldingInput,
  holdInstruction,
  holdingActPublication,
  holdingPublication,
  reallocationInstruction,
  releaseInstruction,
} from "@immortalis/testkit";
import {
  holdingSummary,
  reopenHolding,
  seededReallocationCampaign,
} from "../support/economy-holding.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const HOLD_A = "hold-a";
const position = (e: EconomyAdapter, id: string) => {
  const a = e.availability(id)!;
  return { available: a.available, encumbered: a.encumbered, established: a.established };
};
const total = (e: EconomyAdapter) =>
  [HOLDING_1, HOLDING_2].reduce(
    (n, id) => n + position(e, id).available + position(e, id).encumbered,
    0,
  );

describe("the two independently committed openings (the IMPLEMENTED precursor)", () => {
  it("are two separate premises, two separate publications, A = 7 and B = 2 of the same object and unit", async () => {
    const s = await seededReallocationCampaign(tempDir());
    const a = s.economy.holding(HOLDING_1)!;
    const b = s.economy.holding(HOLDING_2)!;
    expect(a.value.holder_ref).toBe(HOLDER_H);
    expect(b.value.holder_ref).toBe(HOLDER_OTHER);
    expect(a.value.object_ref).toBe(OBJECT_O);
    expect(b.value.object_ref).toBe(OBJECT_O);
    expect(a.value.quantity_or_bounded_position.unit).toBe(HOLDING_UNIT);
    expect(b.value.quantity_or_bounded_position.unit).toBe(HOLDING_UNIT);
    expect(a.value.provenance_ref.premise_id).toBe(PREMISE_1);
    expect(b.value.provenance_ref.premise_id).toBe(PREMISE_2);
    expect(a.fact.provenance.group_id).not.toBe(b.fact.provenance.group_id);
    expect(position(s.economy, HOLDING_1)).toEqual({ available: 7, encumbered: 0, established: 7 });
    expect(position(s.economy, HOLDING_2)).toEqual({ available: 2, encumbered: 0, established: 2 });
    expect(total(s.economy)).toBe(9);
  });
});

describe("reallocation: Economy derives A 7 → 4 and B 2 → 5 from the openings and the instruction alone (WS-004 §3, §20)", () => {
  it("moves exactly the instructed available amount between the two positions, atomically, with its one record", async () => {
    const s = await seededReallocationCampaign(tempDir());
    const outcome = await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    expect(outcome.replayed).toBe(false);
    expect(position(s.economy, HOLDING_1)).toEqual({ available: 4, encumbered: 0, established: 7 });
    expect(position(s.economy, HOLDING_2)).toEqual({ available: 5, encumbered: 0, established: 2 });
    // nothing was created or destroyed across the two positions
    expect(total(s.economy)).toBe(9);
    // both positions advanced in ONE group together with the one create-only record
    const group = s.campaign.store.committedGroup(holdingActPublication(1).intent_id)!;
    expect(group.writes.map((w) => w.key)).toEqual([
      economyHoldingKey(HOLDING_1),
      economyHoldingKey(HOLDING_2),
      economyReallocationKey(REALLOCATION_1),
    ]);
    expect(group.writes.map((w) => w.expected_version)).toEqual([1, 1, 0]);
    expect(s.economy.holding(HOLDING_1)!.fact.version).toBe(2);
    expect(s.economy.holding(HOLDING_2)!.fact.version).toBe(2);
    expect(s.economy.reallocation(REALLOCATION_1)!.fact.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("keeps each opening premise's identity, established amount and provenance; the movement is recorded beside it", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    const a = s.economy.holding(HOLDING_1)!.value;
    const b = s.economy.holding(HOLDING_2)!.value;
    expect(a.provenance_ref).toEqual({
      kind: "OOC_SCENARIO_OPENING_PREMISE",
      premise_id: PREMISE_1,
    });
    expect(b.provenance_ref).toEqual({
      kind: "OOC_SCENARIO_OPENING_PREMISE",
      premise_id: PREMISE_2,
    });
    expect(a.quantity_or_bounded_position).toEqual({
      unit: HOLDING_UNIT,
      established: 7,
      available: 4,
      encumbered: 0,
      restricted: 0,
      reallocated_out: 3,
    });
    expect(b.quantity_or_bounded_position).toEqual({
      unit: HOLDING_UNIT,
      established: 2,
      available: 5,
      encumbered: 0,
      restricted: 0,
      reallocated_in: 3,
    });
    expect(a.restriction_or_authority_ref).toBeNull();
    expect(b.restriction_or_authority_ref).toBeNull();
  });

  it("records the cause and the read basis, never a result, a verdict or in-world consent", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    const record = s.economy.reallocation(REALLOCATION_1)!;
    expect(record.fact.owner).toBe("economy");
    expect(record.fact.facet).toBe("economy_state");
    expect(record.value).toEqual({
      reallocation_id: REALLOCATION_1,
      object_ref: OBJECT_O,
      quantity: { amount: 3, unit: HOLDING_UNIT },
      from: {
        fact_key: economyHoldingKey(HOLDING_1),
        holding_id: HOLDING_1,
        holder_ref: HOLDER_H,
        admitted_at_holding_version: 1,
      },
      to: {
        fact_key: economyHoldingKey(HOLDING_2),
        holding_id: HOLDING_2,
        holder_ref: HOLDER_OTHER,
        admitted_at_holding_version: 1,
      },
      authorization: {
        basis: "OOC_SCENARIO_REALLOCATION_INSTRUCTION",
        instruction_id: "instruction-reallocation-1",
        in_world_consent: "NOT_ASSERTED",
      },
      nature:
        "ECONOMIC_BOOK_POSITION_REALLOCATION_NOT_TITLE_PAYMENT_SETTLEMENT_DELIVERY_OR_ISSUANCE",
    });
    // the record is group-bound provenance: campaign, intent, cause and group identities survive in the journal
    expect(record.fact.provenance.group_id).toBe(holdingActPublication(1).group_id);
    expect(record.fact.provenance.intent_id).toBe(holdingActPublication(1).intent_id);
    expect(record.fact.provenance.cause).toBe(holdingActPublication(1).cause);
  });

  it("writes only Economy facts: no request, demand, realization, entity, temporal state or foreign owner fact", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    expect(s.campaign.store.listFacts().map((f) => f.key)).toEqual([
      economyHoldingKey(HOLDING_1),
      economyHoldingKey(HOLDING_2),
      economyReallocationKey(REALLOCATION_1),
    ]);
    for (const f of s.campaign.store.listFacts()) {
      expect(f.owner).toBe("economy");
      expect(f.facet).toBe("economy_state");
    }
  });

  it("leaves a position that was never reallocated byte-for-byte in its pre-reallocation shape", async () => {
    const s = await seededReallocationCampaign(tempDir());
    const before = JSON.stringify(s.economy.holding(HOLDING_2)!.value);
    expect(before).not.toMatch(/reallocated/);
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    expect(JSON.stringify(s.economy.holding(HOLDING_2)!.value)).toBe(before);
    expect(JSON.stringify(s.economy.holding(HOLDING_1)!.value)).not.toMatch(/reallocated/);
  });
});

describe("a later independent availability read and a new hold see the changed answer on BOTH positions", () => {
  it("availability reads the committed positions; a hold is judged on the reallocated amounts (future-causal)", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    expect(s.economy.availability(HOLDING_1)).toMatchObject({
      version: 2,
      available: 4,
      status: "AVAILABLE",
    });
    expect(s.economy.availability(HOLDING_2)).toMatchObject({
      version: 2,
      available: 5,
      status: "AVAILABLE",
    });
    // B can now be held for 5 (it could not have been held for more than 2 before), A for no more than 4
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(2),
          hold: holdInstruction(2, "hold-b5", 6, { holding_id: HOLDING_2 }),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(3),
        hold: holdInstruction(2, "hold-b5", 5, { holding_id: HOLDING_2 }),
      }),
    );
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(4),
          hold: holdInstruction(2, "hold-a5", 5),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(5),
        hold: holdInstruction(2, "hold-a4", 4),
      }),
    );
    expect(position(s.economy, HOLDING_1)).toEqual({ available: 0, encumbered: 4, established: 7 });
    expect(position(s.economy, HOLDING_2)).toEqual({ available: 0, encumbered: 5, established: 2 });
    expect(total(s.economy)).toBe(9);
    // the later holds did not rewrite the cause: the record is exactly as committed
    expect(s.economy.reallocation(REALLOCATION_1)!.fact.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a position can be reallocated again from its changed answer, and a hold released after it returns to the same position", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    // back from B to A, by a distinct reallocation identity, against the versions it now saw
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(2),
        reallocation: reallocationInstruction(2, 2, 4, {
          reallocation_id: "reallocation-2",
          from: HOLDING_2,
          to: HOLDING_1,
        }),
      }),
    );
    expect(position(s.economy, HOLDING_1)).toEqual({ available: 8, encumbered: 0, established: 7 });
    expect(position(s.economy, HOLDING_2)).toEqual({ available: 1, encumbered: 0, established: 2 });
    expect(s.economy.holding(HOLDING_1)!.value.quantity_or_bounded_position).toMatchObject({
      reallocated_in: 4,
      reallocated_out: 3,
    });
    expect(s.economy.holding(HOLDING_2)!.value.quantity_or_bounded_position).toMatchObject({
      reallocated_in: 3,
      reallocated_out: 4,
    });
    expect(total(s.economy)).toBe(9);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("an active encumbrance is never spent, evaporated or silently released (WS-004 §4, §20)", () => {
  it("only the AVAILABLE part of the source can move; the hold stays on the source and still releases to it", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    ); // A: 4 available / 3 encumbered, version 2
    expect(
      await codeOf(
        s.economy.reallocateHoldings({
          ...holdingActPublication(2),
          reallocation: reallocationInstruction(2, 1, 5),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(3),
        reallocation: reallocationInstruction(2, 1, 4),
      }),
    );
    expect(position(s.economy, HOLDING_1)).toEqual({ available: 0, encumbered: 3, established: 7 });
    expect(position(s.economy, HOLDING_2)).toEqual({ available: 6, encumbered: 0, established: 2 });
    expect(s.economy.encumbrance(HOLDING_1, HOLD_A)!.value).toMatchObject({
      lifecycle_status: "active",
      quantity: { amount: 3, unit: HOLDING_UNIT },
    });
    // the cancellation returns exactly the recorded 3 to the same source, once
    await must(
      s.economy.releaseEncumbrance({
        ...holdingActPublication(4),
        release: releaseInstruction(1, HOLD_A),
      }),
    );
    expect(position(s.economy, HOLDING_1)).toEqual({ available: 3, encumbered: 0, established: 7 });
    expect(total(s.economy)).toBe(9);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an encumbered 5 of 7 cannot send 3 (only 2 is wholly available)", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 5),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    expect(
      await codeOf(
        s.economy.reallocateHoldings({
          ...holdingActPublication(2),
          reallocation: reallocationInstruction(2, 1, 3),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(3),
        reallocation: reallocationInstruction(2, 1, 2),
      }),
    );
    expect(position(s.economy, HOLDING_1)).toEqual({ available: 0, encumbered: 5, established: 7 });
  });
});

describe("save, close and load retain the same identities, quantities and provenance", () => {
  it("reopens to the same two positions, the same record and a verified campaign; a retry reaches the same one result", async () => {
    const dir = tempDir();
    const s = await seededReallocationCampaign(dir);
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    await s.campaign.close();

    const r = await reopenHolding(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(holdingSummary(r.campaign.store)).toEqual(before);
    expect(position(r.economy, HOLDING_1)).toEqual({ available: 4, encumbered: 0, established: 7 });
    expect(position(r.economy, HOLDING_2)).toEqual({ available: 5, encumbered: 0, established: 2 });
    expect(r.economy.holding(HOLDING_1)!.value.provenance_ref.premise_id).toBe(PREMISE_1);
    expect(r.economy.holding(HOLDING_2)!.value.provenance_ref.premise_id).toBe(PREMISE_2);

    const again = await must(
      r.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    expect(again.replayed).toBe(true);
    expect(holdingSummary(r.campaign.store)).toEqual(before);
    // an incompatible retry (another amount under the reused intent identity) is refused after reopen too
    expect(
      await codeOf(
        r.economy.reallocateHoldings({
          ...holdingActPublication(1),
          reallocation: reallocationInstruction(1, 1, 2),
        }),
      ),
    ).toBe("INTENT_CONFLICT");
    expect(holdingSummary(r.campaign.store)).toEqual(before);
    await r.campaign.close();
  });
});

describe("honest limits: the opening premise and the hold remain exactly what they were", () => {
  it("a premise cannot be re-established to change a position, and the establishing input still has no reallocation field", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    expect(
      await codeOf(
        s.economy.establishHolding({
          ...holdingPublication(9),
          holding: establishHoldingInput({ amount: 9, premise_id: "premise-9" }),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(
      await codeOf(
        s.economy.establishHolding({
          ...holdingPublication(10),
          holding: { ...establishHoldingInput({ holding_id: "holding-9" }), reallocated_in: 3 },
        }),
      ),
    ).toBe("INPUT_INVALID");
    expect(position(s.economy, HOLDING_1).established).toBe(7);
  });
});
