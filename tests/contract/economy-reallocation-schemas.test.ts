/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate arbitrary schema inputs */
// Reallocation — strict contracts (WS-004 §3, §4, §20). Every schema is strict; the instruction has no field in which an
// Economy conclusion could be supplied; the position stays a conserved partition and an old (never reallocated) position
// still parses exactly as before.
import { describe, expect, it } from "vitest";
import {
  EconomyHoldingSchema,
  EconomyReallocationSchema,
  ReallocationInstructionInputSchema,
  economyReallocationKey,
} from "@immortalis/contracts";
import { deriveOpeningHolding, deriveReallocation } from "@immortalis/engine";
import { HOLDING_UNIT, establishHoldingInput, reallocationInstruction } from "@immortalis/testkit";

const opened = (id: string, amount: number) =>
  deriveOpeningHolding(
    establishHoldingInput({ holding_id: id, holder_ref: `holder-${id}`, amount }),
  );
const derived = () => {
  const d = deriveReallocation({
    from: { value: opened("h1", 7), version: 1 },
    to: { value: opened("h2", 2), version: 1 },
    pinnedFromVersion: 1,
    pinnedToVersion: 1,
    reallocationId: "r1",
    instructionId: "i1",
    quantity: { amount: 3, unit: HOLDING_UNIT },
  });
  if (!d.ok) throw new Error("fixture");
  return structuredClone(d.value) as any;
};

describe("the key space", () => {
  it("a reallocation is addressed by its identity alone", () => {
    expect(economyReallocationKey("r1")).toBe("economy/reallocation/r1");
  });
});

describe("the position stays conserved and strict", () => {
  it("an opening position parses unchanged; a reallocated one carries the counters that balance it", () => {
    expect(EconomyHoldingSchema.safeParse(opened("h1", 7)).success).toBe(true);
    const d = derived();
    expect(EconomyHoldingSchema.safeParse(d.from).success).toBe(true);
    expect(EconomyHoldingSchema.safeParse(d.to).success).toBe(true);
  });
  it.each([
    ["value created", (d: any) => (d.to.quantity_or_bounded_position.available += 1)],
    ["value destroyed", (d: any) => (d.from.quantity_or_bounded_position.available -= 1)],
    ["a counter hidden", (d: any) => delete d.from.quantity_or_bounded_position.reallocated_out],
    ["a negative counter", (d: any) => (d.to.quantity_or_bounded_position.reallocated_in = -3)],
    ["a fractional counter", (d: any) => (d.to.quantity_or_bounded_position.reallocated_in = 1.5)],
    ["a restricted amount", (d: any) => (d.to.quantity_or_bounded_position.restricted = 1)],
    ["an authority reference", (d: any) => (d.from.restriction_or_authority_ref = "authority-1")],
    ["an unmodelled field", (d: any) => (d.from.quantity_or_bounded_position.balance_after = 4)],
  ])("rejects %s", (_name, mutate) => {
    const d = derived();
    mutate(d);
    expect(
      EconomyHoldingSchema.safeParse(d.from).success &&
        EconomyHoldingSchema.safeParse(d.to).success,
    ).toBe(false);
  });
});

describe("the reallocation record is strict, create-only provenance with no result", () => {
  it("accepts the derived record", () => {
    expect(EconomyReallocationSchema.safeParse(derived().reallocation).success).toBe(true);
  });
  it.each([
    ["a resulting position", (r: any) => (r.from_after = { available: 4 })],
    ["a verdict", (r: any) => (r.transfer_succeeded = true)],
    ["an owner result", (r: any) => (r.owner_result = "ACCEPTED")],
    ["asserted consent", (r: any) => (r.authorization.in_world_consent = "ASSERTED")],
    ["another basis", (r: any) => (r.authorization.basis = "ACTOR_DECISION")],
    ["another nature", (r: any) => (r.nature = "TITLE_TRANSFER")],
    ["a non-positive amount", (r: any) => (r.quantity.amount = 0)],
    ["a fractional amount", (r: any) => (r.quantity.amount = 1.5)],
    ["the same position on both sides", (r: any) => (r.to = structuredClone(r.from))],
    ["an unmodelled side field", (r: any) => (r.to.restriction_or_authority_ref = "a")],
  ])("rejects %s", (_name, mutate) => {
    const r = derived().reallocation;
    mutate(r);
    expect(EconomyReallocationSchema.safeParse(r).success).toBe(false);
  });
});

describe("the instruction carries no Economy conclusion", () => {
  it("accepts the fixture instruction and rejects every conclusion-bearing or malformed variant", () => {
    expect(
      ReallocationInstructionInputSchema.safeParse(reallocationInstruction(1, 1, 3)).success,
    ).toBe(true);
    const bad: Array<(i: any) => void> = [
      (i) => (i.from_after = { available: 4 }),
      (i) => (i.to_after = { available: 5 }),
      (i) => (i.transfer_succeeded = true),
      (i) => (i.economically_settled = true),
      (i) => (i.approved = true),
      (i) => (i.winner = "h2"),
      (i) => (i.owner_result = "ACCEPTED"),
      (i) => (i.in_world_consent = "ASSERTED"),
      (i) => (i.restriction_or_authority_ref = "authority-1"),
      (i) => (i.legal_priority = 1),
      (i) => (i.price = { amount: 1, unit: HOLDING_UNIT }),
      (i) => delete i.campaign_id,
      (i) => delete i.instruction_id,
      (i) => delete i.reallocation_id,
      (i) => (i.from.holding_version = 0),
      (i) => (i.to.holding_version = 1.5),
      (i) => (i.quantity.amount = -3),
      (i) => (i.from.restriction_or_authority_ref = "a"),
    ];
    for (const mutate of bad) {
      const i = structuredClone(reallocationInstruction(1, 1, 3)) as any;
      mutate(i);
      expect(ReallocationInstructionInputSchema.safeParse(i).success).toBe(false);
    }
  });
});

describe("history written before reallocation existed reopens without reinterpretation", () => {
  it("a pre-reallocation holding (a literal, with a hold) parses as-is and still satisfies the conserved partition", () => {
    const pre = {
      holding_id: "h1",
      holder_ref: "holder-h",
      object_ref: "object-o",
      quantity_or_bounded_position: {
        unit: HOLDING_UNIT,
        established: 7,
        available: 4,
        encumbered: 3,
        restricted: 0,
      },
      restriction_or_authority_ref: null,
      lifecycle_status: "active",
      provenance_ref: { kind: "OOC_SCENARIO_OPENING_PREMISE", premise_id: "premise-1" },
      nature: "ECONOMIC_BOOK_POSITION_NOT_STOCK_TITLE_ISSUANCE_OR_RESERVATION",
    };
    const parsed = EconomyHoldingSchema.parse(pre);
    expect(parsed).toEqual(pre);
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(pre));
  });
});
