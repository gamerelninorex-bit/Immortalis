/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate arbitrary schema inputs */
// Economic Holding / Account position — strict contracts (WS-004 §2.1, §3, §4, §11, §20). Every schema is strict; the
// INPUT schemas have no field in which an Economy conclusion could be supplied; the position is a conserved partition.
import { describe, expect, it } from "vitest";
import {
  EconomyEncumbranceSchema,
  EconomyHoldingSchema,
  EstablishHoldingInputSchema,
  HoldInstructionInputSchema,
  HoldingActPublicationSchema,
  ReleaseInstructionInputSchema,
  economyEncumbranceKey,
  economyHoldingKey,
} from "@immortalis/contracts";
import { deriveHold, deriveOpeningHolding } from "@immortalis/engine";
import {
  HOLDING_1,
  establishHoldingInput,
  holdInstruction,
  releaseInstruction,
} from "@immortalis/testkit";

const holding = () => structuredClone(deriveOpeningHolding(establishHoldingInput())) as any;
const encumbrance = () => {
  const d = deriveHold({
    holding: { value: deriveOpeningHolding(establishHoldingInput()), version: 1 },
    pinnedVersion: 1,
    holdId: "hold-a",
    instructionId: "instruction-hold-a",
    quantity: { amount: 3, unit: "unit-synthetic" },
  });
  if (!d.ok) throw new Error("fixture");
  return structuredClone(d.value.encumbrance) as any;
};

describe("key spaces and identities", () => {
  it("a holding is addressed by its identity; an encumbrance by its holding AND hold identities (scoped, exclusive)", () => {
    expect(economyHoldingKey("h1")).toBe("economy/holding/h1");
    expect(economyEncumbranceKey("h1", "e1")).toBe("economy/encumbrance/h1/e1");
    expect(economyEncumbranceKey("h1", "e1")).not.toBe(economyEncumbranceKey("h2", "e1"));
  });
});

describe("EconomyHolding is the WS-004 §2.1 sparse relation, strict and conserved", () => {
  it("accepts the opening position with every source field", () => {
    expect(EconomyHoldingSchema.safeParse(holding()).success).toBe(true);
    expect(Object.keys(holding()).sort()).toEqual(
      [
        "holder_ref",
        "holding_id",
        "lifecycle_status",
        "nature",
        "object_ref",
        "provenance_ref",
        "quantity_or_bounded_position",
        "restriction_or_authority_ref",
      ].sort(),
    );
  });
  it.each([
    "holder_ref",
    "object_ref",
    "holding_id",
    "quantity_or_bounded_position",
    "restriction_or_authority_ref",
    "lifecycle_status",
    "provenance_ref",
    "nature",
  ])("requires %s", (field) => {
    const h = holding();
    delete h[field];
    expect(EconomyHoldingSchema.safeParse(h).success).toBe(false);
  });
  it.each([
    "price",
    "currency",
    "payment",
    "title",
    "reserve_ref",
    "balance",
    "owner",
    "entitlement",
  ])(
    "rejects an unmodelled field (%s): nothing can smuggle a price, payment, title, reservation or foreign copy",
    (field) => {
      const h = holding();
      h[field] = 1;
      expect(EconomyHoldingSchema.safeParse(h).success).toBe(false);
    },
  );
  it("is a conserved partition: available + encumbered + restricted = established", () => {
    for (const [a, e] of [
      [4, 3],
      [0, 7],
      [7, 0],
    ] as const) {
      const h = holding();
      h.quantity_or_bounded_position.available = a;
      h.quantity_or_bounded_position.encumbered = e;
      expect(EconomyHoldingSchema.safeParse(h).success).toBe(true);
    }
    for (const [a, e] of [
      [4, 4],
      [3, 3],
      [8, 0],
      [-1, 8],
      [3.5, 3.5],
    ] as const) {
      const h = holding();
      h.quantity_or_bounded_position.available = a;
      h.quantity_or_bounded_position.encumbered = e;
      expect(EconomyHoldingSchema.safeParse(h).success).toBe(false);
    }
  });
  it("represents no restricted partition and no restriction/authority reference (no producer exists); a zero established amount is no position", () => {
    for (const edit of [
      (h: any) => (
        (h.quantity_or_bounded_position.restricted = 1),
        (h.quantity_or_bounded_position.available = 6)
      ),
      (h: any) => (h.restriction_or_authority_ref = { owner: "gip", fact_key: "k", version: 1 }),
      (h: any) => (h.restriction_or_authority_ref = "restricted"),
      (h: any) =>
        (h.quantity_or_bounded_position = {
          unit: "u",
          established: 0,
          available: 0,
          encumbered: 0,
          restricted: 0,
        }),
      (h: any) => (h.lifecycle_status = "transferred"),
      (h: any) => (h.provenance_ref.kind = "PAYMENT_INTENT"),
      (h: any) => (h.nature = "LEGAL_TITLE"),
    ]) {
      const h = holding();
      edit(h);
      expect(EconomyHoldingSchema.safeParse(h).success).toBe(false);
    }
  });
  it("amounts are exact non-negative safe integers; holder and object are real identities", () => {
    for (const bad of [Number.MAX_SAFE_INTEGER + 1, 1.5, -1, Number.NaN, Infinity]) {
      const h = holding();
      h.quantity_or_bounded_position.established = bad;
      expect(EconomyHoldingSchema.safeParse(h).success).toBe(false);
    }
    for (const field of ["holder_ref", "object_ref", "holding_id"]) {
      for (const bad of ["", " x", "a/b", "x\n"]) {
        const h = holding();
        h[field] = bad;
        expect(EconomyHoldingSchema.safeParse(h).success, `${field}=${JSON.stringify(bad)}`).toBe(
          false,
        );
      }
    }
  });
});

describe("EconomyEncumbrance: one economic hold, active until its single cancellation", () => {
  it("accepts an active hold and a cancelled hold with its separate cancellation", () => {
    const e = encumbrance();
    expect(EconomyEncumbranceSchema.safeParse(e).success).toBe(true);
    e.lifecycle_status = "cancelled";
    e.cancellation = { basis: "OOC_SCENARIO_CANCELLATION_INSTRUCTION", instruction_id: "cancel-a" };
    expect(EconomyEncumbranceSchema.safeParse(e).success).toBe(true);
  });
  it("uses only the §11 lifecycle values it needs; an invented state is rejected", () => {
    for (const state of [
      "pending",
      "satisfied",
      "disputed",
      "transferred",
      "released",
      "committed",
    ]) {
      const e = encumbrance();
      e.lifecycle_status = state;
      expect(EconomyEncumbranceSchema.safeParse(e).success, state).toBe(false);
    }
  });
  it("active ⇔ no cancellation; a cancellation is a separate instruction; consent is never asserted", () => {
    const a = encumbrance();
    a.cancellation = { basis: "OOC_SCENARIO_CANCELLATION_INSTRUCTION", instruction_id: "c" };
    expect(EconomyEncumbranceSchema.safeParse(a).success).toBe(false);
    const c = encumbrance();
    c.lifecycle_status = "cancelled";
    expect(EconomyEncumbranceSchema.safeParse(c).success).toBe(false);
    c.cancellation = {
      basis: "OOC_SCENARIO_CANCELLATION_INSTRUCTION",
      instruction_id: c.authorization.instruction_id,
    };
    expect(EconomyEncumbranceSchema.safeParse(c).success).toBe(false);
    const consent = encumbrance();
    consent.authorization.in_world_consent = "ASSERTED";
    expect(EconomyEncumbranceSchema.safeParse(consent).success).toBe(false);
    const basis = encumbrance();
    basis.authorization.basis = "ACTOR_DECISION";
    expect(EconomyEncumbranceSchema.safeParse(basis).success).toBe(false);
  });
  it("a hold is of a positive exact amount, and carries no payment, priority or physical reservation", () => {
    for (const amount of [0, -3, 1.2]) {
      const e = encumbrance();
      e.quantity.amount = amount;
      expect(EconomyEncumbranceSchema.safeParse(e).success).toBe(false);
    }
    for (const field of ["payment", "priority", "reserve_ref", "price", "counterparty", "title"]) {
      const e = encumbrance();
      e[field] = "x";
      expect(EconomyEncumbranceSchema.safeParse(e).success).toBe(false);
    }
  });
});

describe("authored inputs carry no Economy conclusion (the caller cannot encode the downstream result)", () => {
  const conclusions = [
    "available",
    "encumbered",
    "restricted",
    "balance",
    "balance_after",
    "remaining",
    "established",
    "committed",
    "approved",
    "success",
    "result",
    "winner",
    "award",
    "settled",
    "lifecycle_status",
    "status",
    "owner",
    "facet",
    "rule",
    "authority",
    "price",
    "payment",
  ];
  it.each([
    ["EstablishHoldingInput", EstablishHoldingInputSchema, establishHoldingInput()],
    ["HoldInstructionInput", HoldInstructionInputSchema, holdInstruction(1, "hold-a", 3)],
    ["ReleaseInstructionInput", ReleaseInstructionInputSchema, releaseInstruction(1, "hold-a")],
    [
      "HoldingActPublication",
      HoldingActPublicationSchema,
      { group_id: "g", intent_id: "i", cause: "c" },
    ],
  ] as const)(
    "%s accepts its fixture and rejects every conclusion-shaped field",
    (_n, schema, ok) => {
      expect(schema.safeParse(ok).success).toBe(true);
      for (const field of conclusions) {
        expect(schema.safeParse({ ...ok, [field]: 1 }).success, field).toBe(false);
        expect(schema.safeParse({ ...ok, [field]: true }).success, field).toBe(false);
      }
    },
  );
  it("the hold and release instructions pin the versions they saw and name a distinct hold identity", () => {
    expect(
      HoldInstructionInputSchema.safeParse({ ...holdInstruction(1, "h", 3), holding_version: 0 })
        .success,
    ).toBe(false);
    expect(
      ReleaseInstructionInputSchema.safeParse({
        ...releaseInstruction(1, "h"),
        encumbrance_version: 0,
      }).success,
    ).toBe(false);
    expect(
      HoldInstructionInputSchema.safeParse({ ...holdInstruction(1, "h", 3), hold_id: "" }).success,
    ).toBe(false);
    expect(HOLDING_1).toBeTruthy();
  });
  it("a hold / release publication names identities only: no labels (they are the holding's own)", () => {
    expect(
      HoldingActPublicationSchema.safeParse({
        group_id: "g",
        intent_id: "i",
        cause: "c",
        basis: "b",
        secrecy: "s",
      }).success,
    ).toBe(false);
  });
});
