import {
  PopulationPcOccupancySchema,
  ProductionExtractionSchema,
  ProductionReserveSchema,
  pcCollectionRequestId,
  pcMovementCommitmentKey,
  pcMovementRequestKey,
  popPcOccupancyKey,
  productionExtractionKey,
  type OwnerFact,
  type PopulationPcOccupancy,
} from "@immortalis/contracts";

/**
 * CPAA-C1 v0.2 PROVISIONAL — the small, dependency-light state predicates both the collection rules and the (unchanged-in-meaning)
 * movement admission read, so that the bilateral exclusion needs no import cycle. Pure functions of a committed fact view.
 */
type Facts = Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">;

/** Has the extraction's Reserve inflow been credited (the work is closed)? Derived from the facts that follow it; never stored. */
export function extractionCredited(facts: Facts, extractionId: string): boolean {
  const ex = facts.get(productionExtractionKey(extractionId));
  const e = ex ? ProductionExtractionSchema.safeParse(ex.value) : undefined;
  if (!e?.success) return false;
  const reserve = facts.get(e.data.reserve.fact_key);
  const r = reserve ? ProductionReserveSchema.safeParse(reserve.value) : undefined;
  return !!r?.success && (r.data.inflows ?? []).some((i) => i.inflow_id === extractionId);
}

/** The PC's one occupancy slot, or undefined. */
export function pcOccupancyRecord(
  facts: Facts,
  pcId: string,
): { fact: OwnerFact; value: PopulationPcOccupancy } | undefined {
  const fact = facts.get(popPcOccupancyKey(pcId));
  const v = fact ? PopulationPcOccupancySchema.safeParse(fact.value) : undefined;
  return fact && v?.success ? { fact, value: v.data } : undefined;
}

export type PcOccupancyState =
  | { readonly state: "NONE" }
  | { readonly state: "OPEN"; readonly act_id: string }
  | { readonly state: "RELEASED"; readonly act_id: string; readonly why: "DENIED" | "CLOSED" };

/**
 * Is the PC occupied now? OPEN from its registration until either a lawful denial (the recorded release) or the work's close (the
 * Reserve inflow credited: derived, with no write). Occupancy is conserved: a PC has one at a time.
 */
export function pcOccupancyState(facts: Facts, pcId: string): PcOccupancyState {
  const rec = pcOccupancyRecord(facts, pcId);
  if (!rec) return { state: "NONE" };
  const act = rec.value.act_id;
  if (rec.value.status === "RELEASED_DENIED")
    return { state: "RELEASED", act_id: act, why: "DENIED" };
  return extractionCredited(facts, pcCollectionRequestId(pcId, act))
    ? { state: "RELEASED", act_id: act, why: "CLOSED" }
    : { state: "OPEN", act_id: act };
}

export const pcHasOpenOccupancy = (facts: Facts, pcId: string): boolean =>
  pcOccupancyState(facts, pcId).state === "OPEN";

/**
 * Has the PC any voluntary-movement record? The collection class is movement-free (C5): a PC with a movement commitment or request
 * (whether pending, in transfer or settled) is not eligible, and a PC that is occupied may not start one (bilateral refusal).
 */
export const pcHasMovementRecords = (facts: Facts, pcId: string): boolean =>
  facts.has(pcMovementCommitmentKey(pcId)) || facts.has(pcMovementRequestKey(pcId));
