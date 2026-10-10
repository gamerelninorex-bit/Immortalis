import {
  ENCUMBRANCE_NATURE,
  HOLDING_POSITION_NATURE,
  OOC_CANCELLATION_INSTRUCTION,
  OOC_HOLD_INSTRUCTION,
  OOC_OPENING_PREMISE,
  economyHoldingKey,
  fail,
  ok,
  type EconomyEncumbrance,
  type EconomyHolding,
  type EstablishHoldingInput,
  type Result,
} from "@immortalis/contracts";

/**
 * The single statement of the Economic Holding / Account partition rule (WS-004 §2.1, §4, §20). Pure and
 * deterministic; the owner adapter, IM-11 admission and the load-time verifier all re-derive through it, so none of
 * them can drift, and nobody — caller, fixture or tampered group — supplies a resulting amount.
 *
 * Conservation is structural: a hold moves `quantity` from `available` to `encumbered`, a release moves exactly that
 * `quantity` back, and `established` is never touched. Nothing is created or destroyed, and nothing here knows a
 * price, a payer, a title, a payment or a physical stock.
 */

const refuse = (message: string): Result<never, "REFUSED"> => fail("REFUSED", message);

/** The opening position: the whole established amount available, nothing encumbered or restricted. */
export function deriveOpeningHolding(input: EstablishHoldingInput): EconomyHolding {
  return {
    holding_id: input.holding_id,
    holder_ref: input.holder_ref,
    object_ref: input.object_ref,
    quantity_or_bounded_position: {
      unit: input.quantity.unit,
      established: input.quantity.amount,
      available: input.quantity.amount,
      encumbered: 0,
      restricted: 0,
    },
    restriction_or_authority_ref: null,
    lifecycle_status: "active",
    provenance_ref: { kind: OOC_OPENING_PREMISE, premise_id: input.premise_id },
    nature: HOLDING_POSITION_NATURE,
  };
}

/** The establishment input a committed opening position answers to (used to re-derive an opening). */
export const openingInputOf = (h: EconomyHolding): EstablishHoldingInput => ({
  holding_id: h.holding_id,
  holder_ref: h.holder_ref,
  object_ref: h.object_ref,
  quantity: {
    amount: h.quantity_or_bounded_position.established,
    unit: h.quantity_or_bounded_position.unit,
  },
  premise_id: h.provenance_ref.premise_id,
});

export interface HoldDerivation {
  readonly holding: EconomyHolding;
  readonly encumbrance: EconomyEncumbrance;
}

/**
 * A hold: Economy checks the Economy-owned side AS-OF-NOW (the holding at the very version the instruction saw, with
 * the actual current available amount) and, if the requested quantity is wholly available, partitions the same
 * conserved position. Otherwise nothing is derived.
 */
export function deriveHold(args: {
  readonly holding: { readonly value: EconomyHolding; readonly version: number };
  readonly pinnedVersion: number;
  readonly holdId: string;
  readonly instructionId: string;
  readonly quantity: { readonly amount: number; readonly unit: string };
}): Result<HoldDerivation, "REFUSED"> {
  const { holding, quantity } = args;
  const p = holding.value.quantity_or_bounded_position;
  if (args.pinnedVersion !== holding.version)
    return refuse(
      "the hold was requested against a holding version that is no longer current: re-read the position",
    );
  if (quantity.unit !== p.unit)
    return refuse("a hold is of the holding's own unit: units are never converted or substituted");
  if (quantity.amount < 1) return refuse("a hold is of a positive amount");
  if (quantity.amount > p.available)
    return refuse(
      "the requested amount is not wholly available: the same conserved position cannot fund two uses",
    );
  return ok({
    holding: {
      ...holding.value,
      quantity_or_bounded_position: {
        ...p,
        available: p.available - quantity.amount,
        encumbered: p.encumbered + quantity.amount,
      },
    },
    encumbrance: {
      encumbrance_id: args.holdId,
      holding: {
        fact_key: economyHoldingKey(holding.value.holding_id),
        holding_id: holding.value.holding_id,
      },
      admitted_at_holding_version: holding.version,
      quantity: { amount: quantity.amount, unit: quantity.unit },
      authorization: {
        basis: OOC_HOLD_INSTRUCTION,
        instruction_id: args.instructionId,
        in_world_consent: "NOT_ASSERTED",
      },
      lifecycle_status: "active",
      cancellation: null,
      nature: ENCUMBRANCE_NATURE,
    },
  });
}

/**
 * A cancellation: only a STILL-ACTIVE encumbrance of THIS holding is released, and exactly its recorded quantity
 * returns from encumbered to available. The encumbrance becomes `cancelled` and can never be released again.
 */
export function deriveRelease(args: {
  readonly holding: { readonly value: EconomyHolding };
  readonly encumbrance: { readonly value: EconomyEncumbrance };
  readonly instructionId: string;
}): Result<HoldDerivation, "REFUSED"> {
  const { holding, encumbrance } = args;
  const e = encumbrance.value;
  const p = holding.value.quantity_or_bounded_position;
  if (e.holding.holding_id !== holding.value.holding_id)
    return refuse("the encumbrance belongs to a different holding");
  if (e.lifecycle_status !== "active")
    return refuse("only a still-active encumbrance can be released, once");
  if (e.quantity.unit !== p.unit || e.quantity.amount > p.encumbered)
    return refuse("the encumbrance is not covered by the holding's encumbered amount");
  if (args.instructionId === e.authorization.instruction_id)
    return refuse("the cancellation is a separate instruction from the hold it releases");
  return ok({
    holding: {
      ...holding.value,
      quantity_or_bounded_position: {
        ...p,
        available: p.available + e.quantity.amount,
        encumbered: p.encumbered - e.quantity.amount,
      },
    },
    encumbrance: {
      ...e,
      lifecycle_status: "cancelled",
      cancellation: { basis: OOC_CANCELLATION_INSTRUCTION, instruction_id: args.instructionId },
    },
  });
}
