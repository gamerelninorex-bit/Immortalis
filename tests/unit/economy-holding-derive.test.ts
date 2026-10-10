// The single statement of the Economic Holding partition rule (WS-004 §2.1, §4, §20): pure, deterministic, conserved.
import { describe, expect, it } from "vitest";
import {
  EconomyEncumbranceSchema,
  EconomyHoldingSchema,
  type EconomyEncumbrance,
  type EconomyHolding,
} from "@immortalis/contracts";
import {
  deriveHold,
  deriveOpeningHolding,
  deriveRelease,
  openingInputOf,
} from "@immortalis/engine";
import { HOLDING_UNIT, establishHoldingInput } from "@immortalis/testkit";

const opening = (amount = 7) => deriveOpeningHolding(establishHoldingInput({ amount }));
const total = (h: EconomyHolding) => {
  const p = h.quantity_or_bounded_position;
  return p.available + p.encumbered + p.restricted;
};
const hold = (
  h: EconomyHolding,
  version: number,
  amount: number,
  id = "hold-a",
  pinned = version,
) =>
  deriveHold({
    holding: { value: h, version },
    pinnedVersion: pinned,
    holdId: id,
    instructionId: `instruction-${id}`,
    quantity: { amount, unit: HOLDING_UNIT },
  });

describe("deriveOpeningHolding", () => {
  it("opens the whole amount as available, round-trips through its own input, and validates", () => {
    const h = opening();
    expect(h.quantity_or_bounded_position).toEqual({
      unit: HOLDING_UNIT,
      established: 7,
      available: 7,
      encumbered: 0,
      restricted: 0,
    });
    expect(deriveOpeningHolding(openingInputOf(h))).toEqual(h);
    expect(EconomyHoldingSchema.safeParse(h).success).toBe(true);
  });
});

describe("deriveHold (Economy checks the actual current availability, as of now)", () => {
  it("7 with a hold of 3 → 4 available / 3 encumbered, one active encumbrance, the position conserved", () => {
    const r = hold(opening(), 1, 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.holding.quantity_or_bounded_position).toMatchObject({
      available: 4,
      encumbered: 3,
      established: 7,
    });
    expect(total(r.value.holding)).toBe(7);
    expect(r.value.encumbrance).toMatchObject({
      lifecycle_status: "active",
      cancellation: null,
      admitted_at_holding_version: 1,
    });
    expect(EconomyEncumbranceSchema.safeParse(r.value.encumbrance).success).toBe(true);
  });
  it("is a function of the premise: the result differs with the available amount, never with a supplied verdict", () => {
    const outcomes = [1, 2, 3, 4, 7].map((amount) => {
      const r = hold(opening(amount), 1, 3);
      return r.ok
        ? [
            r.value.holding.quantity_or_bounded_position.available,
            r.value.holding.quantity_or_bounded_position.encumbered,
          ]
        : "REFUSED";
    });
    expect(outcomes).toEqual(["REFUSED", "REFUSED", [0, 3], [1, 3], [4, 3]]);
  });
  it("refuses more than is available, at the boundary, without deriving anything", () => {
    const h = hold(opening(), 1, 3);
    if (!h.ok) throw new Error("fixture");
    expect(hold(h.value.holding, 2, 5, "hold-b").ok).toBe(false);
    expect(hold(h.value.holding, 2, 4, "hold-b").ok).toBe(true);
    expect(hold(h.value.holding, 2, 4, "hold-b").ok && total(h.value.holding)).toBe(7);
  });
  it("refuses a stale pinned version, another unit and a non-positive amount", () => {
    expect(hold(opening(), 2, 3, "hold-a", 1).ok).toBe(false);
    expect(hold(opening(), 1, 3, "hold-a", 2).ok).toBe(false);
    expect(
      deriveHold({
        holding: { value: opening(), version: 1 },
        pinnedVersion: 1,
        holdId: "h",
        instructionId: "i",
        quantity: { amount: 1, unit: "another-unit" },
      }).ok,
    ).toBe(false);
    expect(hold(opening(), 1, 0).ok).toBe(false);
  });
  it("is deterministic and does not mutate its inputs", () => {
    const h = opening();
    const before = structuredClone(h);
    const a = hold(h, 1, 3);
    const b = hold(h, 1, 3);
    expect(a).toEqual(b);
    expect(h).toEqual(before);
  });
});

describe("deriveRelease (exactly the recorded amount, exactly once)", () => {
  const held = () => {
    const r = hold(opening(), 1, 3);
    if (!r.ok) throw new Error("fixture");
    return r.value;
  };
  const release = (h: EconomyHolding, e: EconomyEncumbrance, instruction = "cancel-a") =>
    deriveRelease({ holding: { value: h }, encumbrance: { value: e }, instructionId: instruction });

  it("returns exactly the recorded amount to available and cancels the hold", () => {
    const { holding, encumbrance } = held();
    const r = release(holding, encumbrance);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.holding).toEqual(opening());
    expect(r.value.encumbrance.lifecycle_status).toBe("cancelled");
    expect(r.value.encumbrance.cancellation?.instruction_id).toBe("cancel-a");
    expect(EconomyEncumbranceSchema.safeParse(r.value.encumbrance).success).toBe(true);
  });
  it("releases only the named hold: a second hold keeps encumbering", () => {
    const first = held();
    const second = hold(first.holding, 2, 4, "hold-b");
    if (!second.ok) throw new Error("fixture");
    const r = release(second.value.holding, first.encumbrance);
    expect(r.ok && r.value.holding.quantity_or_bounded_position).toMatchObject({
      available: 3,
      encumbered: 4,
    });
  });
  it("refuses a cancelled hold (once only), a hold of another holding, a mismatched unit and a reused instruction", () => {
    const { holding, encumbrance } = held();
    const done = release(holding, encumbrance);
    if (!done.ok) throw new Error("fixture");
    expect(release(done.value.holding, done.value.encumbrance, "cancel-again").ok).toBe(false);
    expect(release({ ...holding, holding_id: "other" }, encumbrance).ok).toBe(false);
    expect(
      release(holding, { ...encumbrance, quantity: { ...encumbrance.quantity, unit: "u2" } }).ok,
    ).toBe(false);
    expect(release(holding, encumbrance, encumbrance.authorization.instruction_id).ok).toBe(false);
  });
  it("refuses a hold the holding no longer covers (cannot restore what was never encumbered)", () => {
    const { holding, encumbrance } = held();
    expect(release(opening(), encumbrance).ok).toBe(false);
    expect(holding.quantity_or_bounded_position.encumbered).toBe(3);
  });
});
