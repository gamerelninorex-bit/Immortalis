import {
  LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY,
  LogisticsFreightDispatchEnrollmentSchema,
  compareTime,
  economyFreightUseConsumptionKey,
  logisticsObjectId,
  temporalObjectKey,
  type CanonicalTime,
  type LogisticsFreightDispatchEnrollment,
  type OwnerFact,
} from "@immortalis/contracts";

/**
 * The first-profile dispatch / enrollment fence (ROADBED R2-D18 v1.2.1 §4 step 8). It is stated ONCE here, from committed
 * facts alone, and used unchanged by the first dispatch act (at most one dispatch in flight), the IM-02 coordinator (a typed
 * pre-stage refusal on INITIAL, HELD and RESUME) and kernel admission (a raw canonical advance), so the three cannot drift.
 * It names no owner operation: it reads one receipt slot, one temporal object key and one consumption key.
 */
type Read<T> = { readonly fact: OwnerFact; readonly value: T };
/** The enrollment receipt of the most recent first-profile first dispatch, by its one fixed key. */
export function readDispatchEnrollment(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): Read<LogisticsFreightDispatchEnrollment> | undefined {
  const fact = facts.get(LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY);
  const parsed = fact ? LogisticsFreightDispatchEnrollmentSchema.safeParse(fact.value) : undefined;
  return fact && parsed?.success ? { fact, value: parsed.data } : undefined;
}

/**
 * Whether a committed first dispatch is still unsafe to pass: its Temporal object is not registered (TE) or Economy's one-use
 * consumption (E1) is absent. Both hang independently off L1; both are prerequisites of the earned delivery.
 */
export function pendingDispatchEnrollment(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): LogisticsFreightDispatchEnrollment | undefined {
  const fact = facts.get(LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY);
  const parsed = fact ? LogisticsFreightDispatchEnrollmentSchema.safeParse(fact.value) : undefined;
  if (!parsed?.success) return undefined;
  const receipt = parsed.data;
  const enrolled =
    facts.get(temporalObjectKey(logisticsObjectId(receipt.request_id))) !== undefined;
  const consumed =
    facts.get(economyFreightUseConsumptionKey(receipt.directive_use_id)) !== undefined;
  return enrolled && consumed ? undefined : receipt;
}

/**
 * The dispatch / enrollment fence (R2-D18 §4 step 8): while a committed first dispatch is not yet both enrolled with the
 * Temporal kernel and consumed by Economy, canonical time may not REACH its original delivery boundary — on any path. The
 * same rule is used by the coordinator (a typed pre-stage refusal on INITIAL, HELD and RESUME) and by kernel admission (a raw
 * commit, always with the transaction's actual stop), so they cannot drift. It holds the affected advance only: an advance
 * that stops before the boundary is unaffected, and completing the enrollment and the consumption lifts the refusal. Returns a
 * message, or null.
 */
export function freightDispatchPendingViolation(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
  stop: CanonicalTime | null,
): string | null {
  const pending = pendingDispatchEnrollment(facts);
  if (!pending) return null;
  if (stop === null)
    return "a condition-only request cannot be bounded before the delivery boundary of a committed first dispatch that is not yet enrolled and consumed";
  const c = compareTime(stop, pending.delivery.at);
  if (c === -1) return null;
  return "canonical time may not reach the delivery boundary of a committed first dispatch that is not yet enrolled and consumed: complete the Temporal enrollment and Economy's one-use consumption first";
}
