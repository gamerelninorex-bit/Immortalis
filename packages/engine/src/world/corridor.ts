import {
  WorldCorridorSchema,
  WorldLocusSchema,
  worldCorridorKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";

/**
 * The single statement of what a World-State corridor must be, given committed facts (WG "Edge / Corridor State"): the world and BOTH
 * endpoints are committed World-State facts, each endpoint is a locus of THAT world, and the corridor sits at the key its ordered
 * endpoints derive. Used by admission when the corridor is written and again by load verification, so the two cannot drift. It judges
 * topology and identity only: the corridor states no duration, access or outcome, so there is nothing else to judge.
 *
 * Returns a message, or null when the corridor holds.
 */
export function worldCorridorViolation(
  key: string,
  value: unknown,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): string | null {
  const corridor = WorldCorridorSchema.safeParse(value);
  if (!corridor.success) return "the corridor violates its contract";
  const c = corridor.data;
  if (key !== worldCorridorKey(c.world.entity_id, c.from.entity_id, c.to.entity_id))
    return "the corridor is at the key its world and ordered endpoints derive";
  if (!facts.get(c.world.fact_key)) return "the corridor's world is not committed";
  for (const end of [c.from, c.to]) {
    const locus = facts.get(end.fact_key);
    const parsed = locus ? WorldLocusSchema.safeParse(locus.value) : undefined;
    if (!locus || !parsed?.success)
      return `a corridor endpoint is not a committed locus: ${end.fact_key}`;
    if (!canonicalEqual(parsed.data.world, c.world))
      return `a corridor endpoint is not a locus of the corridor's world: ${end.fact_key}`;
  }
  return null;
}
