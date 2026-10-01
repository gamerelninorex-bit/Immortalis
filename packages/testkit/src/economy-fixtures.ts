import {
  economyRequestId,
  economyRequestKey,
  type CanonicalTime,
  type DemandCarrierRef,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  economyRealizationProvider,
  productionCompletionProvider,
  worldFallbackAcceptanceProvider,
} from "@immortalis/engine";
import { LEDGER_MAIN } from "./population-fixtures.ts";
import { OUTPUT_CLASS, OUTPUT_UNIT, startInput } from "./production-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the Economy Demand → Production Request → Realized Access Backbone Foundation. Every
 * identifier, class, quantity, unit and coordinate below is a fixture, not IMMORTALIS canon: it carries no game
 * semantics, no price, no currency, no purchasing capability, no entitlement, no preference weight, no rate and no
 * calibration (CAL-01, CAL-02 and CAL-03 stay unresolved). The Economy owner, the Production owner, the
 * Population owner and the World-State fallback custodian are all REAL and live in @immortalis/engine: unlike the
 * predecessor slices there is NO synthetic requester here, because the request's source is Economy itself.
 * Production code must never import this package (Bootstrap Plan §2.2).
 */
export const DEMAND_1 = "demand-1";
export const DEMAND_2 = "demand-2";
export const DEMAND_OTHER = "demand-other";

/** The Production operation identity of a demand IS its Production Request identity (WS-003 §13A). */
export const operationOf = (demandId: string): string => economyRequestId(demandId);

export const unitCarrier = (unitId = "u-1", ledgerId = LEDGER_MAIN): DemandCarrierRef => ({
  kind: "POPULATION_UNIT",
  ledger_id: ledgerId,
  unit_id: unitId,
});
export const cohortCarrier = (cohortId: string, ledgerId = LEDGER_MAIN): DemandCarrierRef => ({
  kind: "POPULATION_COHORT",
  ledger_id: ledgerId,
  cohort_id: cohortId,
});

/** The one material demand of the proof: one unit of the fixture durable. */
export const demandEntry = (amount = 1) => ({
  output_class: OUTPUT_CLASS,
  quantity: { amount, unit: OUTPUT_UNIT },
});

/**
 * Each demand of the proof has its own carrier Unit: the sources do not freeze whether one carrier may carry
 * several demands for one good (WS-004 §5.4 "duplicate representations of the same requirement do not
 * accumulate"), so no fixture relies on it either way.
 */
const defaultCarrier = (demandId: string): DemandCarrierRef =>
  demandId === DEMAND_2 ? unitCarrier("u-2") : unitCarrier();

export const issueInput = (
  demandId: string,
  over: { carrier?: DemandCarrierRef; demand_entry?: ReturnType<typeof demandEntry> } = {},
) => ({
  demand_envelope_id: demandId,
  carrier: over.carrier ?? defaultCarrier(demandId),
  demand_entry: over.demand_entry ?? demandEntry(),
});

/** A Production start on the Economy-owned request that `demandId` allocated to. */
export const economyStartInput = (
  demandId: string,
  over: { reserve_id?: string; input?: number; completion_at?: CanonicalTime } = {},
) => ({
  ...startInput(operationOf(demandId), over),
  request_key: economyRequestKey(operationOf(demandId)),
});

export const economyProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    productionCompletionProvider,
    worldFallbackAcceptanceProvider,
    economyRealizationProvider,
  ]);

export const economyPublication = (n: number) => ({
  group_id: `econ-group-${n}`,
  intent_id: `econ-intent-${n}`,
  cause: `econ-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});
