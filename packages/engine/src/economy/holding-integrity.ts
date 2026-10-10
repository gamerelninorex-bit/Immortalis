import {
  EconomyEncumbranceSchema,
  EconomyHoldingSchema,
  EconomyReallocationSchema,
  economyEncumbranceKey,
  economyHoldingKey,
  economyReallocationKey,
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
 *  - every recorded reallocation sits at the key derived from its identity, names two distinct committed positions
 *    (their holders as committed) of ONE object and unit, and was admitted against versions that exist; a position's
 *    `reallocated_in` / `reallocated_out` are EXACTLY the sums of the reallocations that name it, so the two sides of
 *    every movement balance and no amount was moved without a recorded cause (nor recorded without moving);
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
  const reallocations = all.filter((f) => kindOf(f) === "economy_reallocation");
  if (holdings.length + encumbrances.length + reallocations.length === 0) return out;

  const activeSum = new Map<string, number>();
  const holdingById = new Map<string, { fact: OwnerFact; unit: string }>();
  const movedIn = new Map<string, number>();
  const movedOut = new Map<string, number>();
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
  for (const f of reallocations) {
    const t = EconomyReallocationSchema.safeParse(f.value);
    if (!t.success || f.key !== economyReallocationKey(t.data.reallocation_id)) {
      bad(f.key, "a reallocation is well formed at the key derived from its identity");
      continue;
    }
    const from = holdingById.get(t.data.from.holding_id);
    const to = holdingById.get(t.data.to.holding_id);
    if (!from || !to) {
      bad(f.key, "a reallocation names two committed positions");
      continue;
    }
    const fh = EconomyHoldingSchema.parse(from.fact.value);
    const th = EconomyHoldingSchema.parse(to.fact.value);
    if (
      t.data.from.fact_key !== from.fact.key ||
      t.data.to.fact_key !== to.fact.key ||
      t.data.from.holder_ref !== fh.holder_ref ||
      t.data.to.holder_ref !== th.holder_ref
    )
      bad(f.key, "a reallocation names its positions and their holders as committed");
    if (
      t.data.object_ref !== fh.object_ref ||
      t.data.object_ref !== th.object_ref ||
      t.data.quantity.unit !== from.unit ||
      t.data.quantity.unit !== to.unit
    )
      bad(f.key, "a reallocation is of one object and one unit, those of both positions");
    if (
      t.data.from.admitted_at_holding_version > from.fact.version ||
      t.data.to.admitted_at_holding_version > to.fact.version
    )
      bad(f.key, "a reallocation was admitted against position versions that exist");
    movedOut.set(
      t.data.from.holding_id,
      (movedOut.get(t.data.from.holding_id) ?? 0) + t.data.quantity.amount,
    );
    movedIn.set(
      t.data.to.holding_id,
      (movedIn.get(t.data.to.holding_id) ?? 0) + t.data.quantity.amount,
    );
  }
  for (const [id, { fact }] of holdingById) {
    const h = EconomyHoldingSchema.parse(fact.value);
    const p = h.quantity_or_bounded_position;
    if ((p.reallocated_in ?? 0) !== (movedIn.get(id) ?? 0))
      bad(
        fact.key,
        "a position's reallocated-in amount is exactly the sum of the reallocations into it",
      );
    if ((p.reallocated_out ?? 0) !== (movedOut.get(id) ?? 0))
      bad(
        fact.key,
        "a position's reallocated-out amount is exactly the sum of the reallocations out of it",
      );
    if ((activeSum.get(id) ?? 0) !== p.encumbered)
      bad(
        fact.key,
        "a holding's encumbered amount is exactly the sum of its still-active encumbrances",
      );
  }
  return out;
}
