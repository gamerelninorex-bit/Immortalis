import {
  EconomyEncumbranceSchema,
  EconomyHoldingSchema,
  economyEncumbranceKey,
  economyHoldingKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { IntegrityViolation } from "../world/integrity.ts";

/**
 * Re-verifies, from committed state alone, that a loaded campaign's Economic Holding / Account positions still tell
 * one conserved story (IM-12 replay/recovery + IM-06; WS-004 §3 conserved holding rule, §4, §20):
 *
 *  - every holding is a well-formed conserved partition (available + encumbered + restricted = established) at its own
 *    key, and every encumbrance is at the key derived from its holding and hold identities;
 *  - every encumbrance belongs to a committed holding, is of that holding's unit, and was admitted against a holding
 *    version that exists (at or before the holding's current version);
 *  - the holding's encumbered amount is EXACTLY the sum of its still-active encumbrances — so no hold is counted
 *    twice, no cancelled hold still encumbers, and no amount was created or destroyed by a tampered state;
 *  - a cancelled encumbrance records its separate cancellation (schema), and the holding's `established` amount is
 *    never exceeded by its active encumbrances.
 *
 * Cost: one pass over the already-listed committed facts per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyEconomyHoldingIntegrity(
  all: readonly OwnerFact[],
): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) => out.push({ key, code: "ECONOMY_STATE", message });
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const holdings = all.filter((f) => kindOf(f) === "economy_holding");
  const encumbrances = all.filter((f) => kindOf(f) === "economy_encumbrance");
  if (holdings.length + encumbrances.length === 0) return out;

  const activeSum = new Map<string, number>();
  const holdingById = new Map<string, { fact: OwnerFact; unit: string }>();
  for (const f of holdings) {
    const h = EconomyHoldingSchema.safeParse(f.value);
    if (!h.success || f.key !== economyHoldingKey(h.data.holding_id)) {
      bad(
        f.key,
        "a holding is a well-formed conserved position at the key derived from its identity",
      );
      continue;
    }
    holdingById.set(h.data.holding_id, { fact: f, unit: h.data.quantity_or_bounded_position.unit });
  }
  for (const f of encumbrances) {
    const e = EconomyEncumbranceSchema.safeParse(f.value);
    if (
      !e.success ||
      f.key !== economyEncumbranceKey(e.data.holding.holding_id, e.data.encumbrance_id)
    ) {
      bad(
        f.key,
        "an encumbrance is well formed at the key derived from its holding and hold identities",
      );
      continue;
    }
    const owner = holdingById.get(e.data.holding.holding_id);
    if (!owner) {
      bad(f.key, "an encumbrance belongs to a committed holding");
      continue;
    }
    if (e.data.quantity.unit !== owner.unit)
      bad(f.key, "an encumbrance is of its holding's own unit");
    if (e.data.admitted_at_holding_version > owner.fact.version)
      bad(f.key, "an encumbrance was admitted against a holding version that exists");
    if (e.data.lifecycle_status === "active")
      activeSum.set(
        e.data.holding.holding_id,
        (activeSum.get(e.data.holding.holding_id) ?? 0) + e.data.quantity.amount,
      );
  }
  for (const [id, { fact }] of holdingById) {
    const h = EconomyHoldingSchema.parse(fact.value);
    const p = h.quantity_or_bounded_position;
    if ((activeSum.get(id) ?? 0) !== p.encumbered)
      bad(
        fact.key,
        "a holding's encumbered amount is exactly the sum of its still-active encumbrances",
      );
  }
  return out;
}
