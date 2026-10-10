/**
 * SYNTHETIC TEST DATA for the Economic Holding / Account position and its reversible economic encumbrance (OOC scenario /
 * mechanism proof). Every identifier, object, unit and amount below is a fixture, not IMMORTALIS canon: it carries no
 * price, rate, currency, tax, credit, unit adoption, title, issuance or world-side wealth origination. The opening
 * position is a separately authored scenario premise; nothing here states a balance after a hold, a winner, an award
 * or an approval — those are Economy's to derive. Production code must never import this package.
 */
export const FIXTURE_HOLDING_CAMPAIGN = "campaign-economy-holding";
export const HOLDING_1 = "holding-1";
export const HOLDING_2 = "holding-2";
export const HOLDER_H = "holder-h";
export const HOLDER_OTHER = "holder-other";
export const OBJECT_O = "object-o";
export const HOLDING_UNIT = "unit-synthetic";
export const PREMISE_1 = "premise-1";
export const PREMISE_2 = "premise-2";

/** Full publication (labels included) for an authored premise. */
export const holdingPublication = (n: number) => ({
  group_id: `holding-group-${n}`,
  intent_id: `holding-intent-${n}`,
  cause: `holding-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** A hold / release publication carries identities only; labels are the holding's own. */
export const holdingActPublication = (n: number) => ({
  group_id: `holding-act-group-${n}`,
  intent_id: `holding-act-intent-${n}`,
  cause: `holding-act-cause-${n}`,
});

export const establishHoldingInput = (
  over: {
    holding_id?: string;
    holder_ref?: string;
    object_ref?: string;
    amount?: number;
    unit?: string;
    premise_id?: string;
  } = {},
) => ({
  holding_id: over.holding_id ?? HOLDING_1,
  holder_ref: over.holder_ref ?? HOLDER_H,
  object_ref: over.object_ref ?? OBJECT_O,
  quantity: { amount: over.amount ?? 7, unit: over.unit ?? HOLDING_UNIT },
  premise_id: over.premise_id ?? PREMISE_1,
});

export const holdInstruction = (
  holdingVersion: number,
  holdId: string,
  amount: number,
  over: { holding_id?: string; instruction_id?: string; unit?: string } = {},
) => ({
  holding_id: over.holding_id ?? HOLDING_1,
  holding_version: holdingVersion,
  hold_id: holdId,
  instruction_id: over.instruction_id ?? `instruction-${holdId}`,
  quantity: { amount, unit: over.unit ?? HOLDING_UNIT },
});

export const releaseInstruction = (
  encumbranceVersion: number,
  holdId: string,
  over: { holding_id?: string; instruction_id?: string } = {},
) => ({
  holding_id: over.holding_id ?? HOLDING_1,
  hold_id: holdId,
  encumbrance_version: encumbranceVersion,
  instruction_id: over.instruction_id ?? `cancel-${holdId}`,
});

export const REALLOCATION_1 = "reallocation-1";

/**
 * An OOC reallocation instruction between two positions at the versions it saw. It carries identities, the two pinned
 * versions and an amount only: no resulting position, verdict, approval, restriction, title or consent.
 */
export const reallocationInstruction = (
  fromVersion: number,
  toVersion: number,
  amount: number,
  over: {
    campaign_id?: string;
    reallocation_id?: string;
    instruction_id?: string;
    from?: string;
    to?: string;
    unit?: string;
  } = {},
) => ({
  campaign_id: over.campaign_id ?? FIXTURE_HOLDING_CAMPAIGN,
  reallocation_id: over.reallocation_id ?? REALLOCATION_1,
  instruction_id: over.instruction_id ?? `instruction-${over.reallocation_id ?? REALLOCATION_1}`,
  from: { holding_id: over.from ?? HOLDING_1, holding_version: fromVersion },
  to: { holding_id: over.to ?? HOLDING_2, holding_version: toVersion },
  quantity: { amount, unit: over.unit ?? HOLDING_UNIT },
});
