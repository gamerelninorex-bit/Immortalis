import {
  REFEREE_OP_I002,
  RefereeDecisionRecordSchema,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";

/**
 * R1 Stage-One v1.1 — the strict first-stage setup-eligibility predicate (WG "R1 Stage-One v1.1 Sovereign-Ratified Successor —
 * Setup Placement and Exclusive NPC Presence"; BLUE executable lowering freeze).
 *
 * A world may receive an actor setup placement, and be closed, only while the already COMMITTED fact set consists of the
 * explicitly enumerated setup kinds. Every other kind, every other referee operation, every unresolvable key (an extension owner's
 * included) and every malformed record ends setup eligibility, so a campaign that has begun to play is never blessed
 * retroactively. There is no `is_setup` flag, no timestamp and no caller claim: the committed facts are the only evidence, and the
 * same predicate runs at write admission and again at replay over the real incremental pre-state. It is a deliberately restrictive
 * first-stage rule, not a taxonomy of game setup: randomized Named-Actor establishments (they read a committed Causal Draw)
 * are excluded from stage one, not prohibited generally.
 */
export const SETUP_ELIGIBLE_KIND_IDS: ReadonlySet<string> = new Set([
  "world_profile",
  "world_locus",
  "world_corridor",
  "pc_existence_contract",
  "pc_capability_basis",
  "named_actor_capability_basis",
  "world_actor_coupling",
  "actor_setup_placement",
  "world_setup_closure",
]);

/** The first fact that ends setup eligibility, as a message, or null when every fact is a permitted setup fact. */
export function setupEligibilityViolation(facts: Iterable<OwnerFact>): string | null {
  for (const fact of facts) {
    const resolved = resolveKey(fact.key);
    if (!resolved) {
      return `a committed fact outside every registered key space ends setup eligibility: ${fact.key}`;
    }
    const id = resolved.kind.id;
    if (SETUP_ELIGIBLE_KIND_IDS.has(id)) continue;
    if (id === "referee_decision") {
      const record = RefereeDecisionRecordSchema.safeParse(fact.value);
      if (record.success && record.data.operation === REFEREE_OP_I002) continue;
      return `a referee decision other than the I-002 classification ends setup eligibility: ${fact.key}`;
    }
    return `a committed ${id} fact ends setup eligibility: ${fact.key}`;
  }
  return null;
}
