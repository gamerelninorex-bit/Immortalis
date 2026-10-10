// The single statement of the reallocation rule (WS-004 §3, §4, §20): pure, deterministic, conserving, and the opening /
// hold / release derivations the merged holding relies on are unchanged by it.
import { describe, expect, it } from "vitest";
import { type EconomyHolding } from "@immortalis/contracts";
import { deriveHold, deriveOpeningHolding, deriveReallocation } from "@immortalis/engine";
import { HOLDING_1, HOLDING_2, HOLDING_UNIT, establishHoldingInput } from "@immortalis/testkit";

const a = (): EconomyHolding => deriveOpeningHolding(establishHoldingInput({ amount: 7 }));
const b = (): EconomyHolding =>
  deriveOpeningHolding(
    establishHoldingInput({ holding_id: HOLDING_2, holder_ref: "holder-other", amount: 2 }),
  );

const run = (over: Partial<Parameters<typeof deriveReallocation>[0]> = {}) =>
  deriveReallocation({
    from: { value: a(), version: 1 },
    to: { value: b(), version: 1 },
    pinnedFromVersion: 1,
    pinnedToVersion: 1,
    reallocationId: "r1",
    instructionId: "i1",
    quantity: { amount: 3, unit: HOLDING_UNIT },
    ...over,
  });

describe("deriveReallocation", () => {
  it("moves exactly the amount from the source's available to the receiver's available, creating and destroying nothing", () => {
    const r = run();
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.from.quantity_or_bounded_position).toEqual({
      unit: HOLDING_UNIT,
      established: 7,
      available: 4,
      encumbered: 0,
      restricted: 0,
      reallocated_out: 3,
    });
    expect(r.value.to.quantity_or_bounded_position).toEqual({
      unit: HOLDING_UNIT,
      established: 2,
      available: 5,
      encumbered: 0,
      restricted: 0,
      reallocated_in: 3,
    });
    expect(r.value.reallocation).toMatchObject({
      reallocation_id: "r1",
      quantity: { amount: 3, unit: HOLDING_UNIT },
      from: { holding_id: HOLDING_1, admitted_at_holding_version: 1 },
      to: { holding_id: HOLDING_2, admitted_at_holding_version: 1 },
      authorization: { instruction_id: "i1", in_world_consent: "NOT_ASSERTED" },
    });
  });

  it("is deterministic and does not mutate its inputs", () => {
    const from = a();
    const snapshot = structuredClone(from);
    const one = run({ from: { value: from, version: 1 } });
    const two = run({ from: { value: from, version: 1 } });
    expect(one).toEqual(two);
    expect(from).toEqual(snapshot);
  });

  it("accumulates the counters across successive movements, in both directions", () => {
    const r = run();
    if (!r.ok) throw new Error("fixture");
    const back = deriveReallocation({
      from: { value: r.value.to, version: 2 },
      to: { value: r.value.from, version: 2 },
      pinnedFromVersion: 2,
      pinnedToVersion: 2,
      reallocationId: "r2",
      instructionId: "i2",
      quantity: { amount: 1, unit: HOLDING_UNIT },
    });
    if (!back.ok) throw new Error(back.error.message);
    expect(back.value.to.quantity_or_bounded_position).toMatchObject({
      available: 5,
      reallocated_in: 1,
      reallocated_out: 3,
    });
    expect(back.value.from.quantity_or_bounded_position).toMatchObject({
      available: 4,
      reallocated_in: 3,
      reallocated_out: 1,
    });
  });

  it("refuses a source that cannot wholly cover the amount, counting only the AVAILABLE part", () => {
    expect(run({ from: { value: b(), version: 1 }, to: { value: a(), version: 1 } }).ok).toBe(
      false,
    );
    const held = deriveHold({
      holding: { value: a(), version: 1 },
      pinnedVersion: 1,
      holdId: "h",
      instructionId: "i",
      quantity: { amount: 5, unit: HOLDING_UNIT },
    });
    if (!held.ok) throw new Error("fixture");
    const refused = run({ from: { value: held.value.holding, version: 2 }, pinnedFromVersion: 2 });
    expect(refused.ok).toBe(false);
    expect(
      run({
        from: { value: held.value.holding, version: 2 },
        pinnedFromVersion: 2,
        quantity: { amount: 2, unit: HOLDING_UNIT },
      }).ok,
    ).toBe(true);
  });

  it("refuses the same position twice, stale pins, another object, another unit and a non-positive amount", () => {
    expect(run({ to: { value: a(), version: 1 } }).ok).toBe(false);
    expect(run({ pinnedFromVersion: 2 }).ok).toBe(false);
    expect(run({ pinnedToVersion: 2 }).ok).toBe(false);
    expect(run({ to: { value: { ...b(), object_ref: "object-other" }, version: 1 } }).ok).toBe(
      false,
    );
    const otherUnit = b();
    otherUnit.quantity_or_bounded_position.unit = "unit-other";
    expect(run({ to: { value: otherUnit, version: 1 } }).ok).toBe(false);
    expect(run({ quantity: { amount: 3, unit: "unit-other" } }).ok).toBe(false);
    expect(run({ quantity: { amount: 0, unit: HOLDING_UNIT } }).ok).toBe(false);
  });

  it("leaves the merged derivations unchanged: an opening position has no movement counters", () => {
    expect(JSON.stringify(a())).not.toMatch(/reallocated/);
    const held = deriveHold({
      holding: { value: a(), version: 1 },
      pinnedVersion: 1,
      holdId: "h",
      instructionId: "i",
      quantity: { amount: 3, unit: HOLDING_UNIT },
    });
    if (!held.ok) throw new Error("fixture");
    expect(JSON.stringify(held.value.holding)).not.toMatch(/reallocated/);
  });
});
