import {
  ActorPhysicalPresenceSchema,
  ActorSetupPlacementSchema,
  TEMPORAL_STATE_KEY,
  WorldSetupClosureSchema,
  actorSetupPlacementKey,
  worldSetupClosureKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import {
  actorPhysicalPresenceViolation,
  actorSetupPlacementViolation,
  isActorPresenceChainFact,
  presenceRivalViolation,
  worldSetupClosureViolation,
} from "./actor-presence.ts";
import type { IntegrityViolation } from "./integrity.ts";

/**
 * Re-verifies, from committed state and the journal alone, the R1 Stage-One v1.1 presence chain (actor setup placements, world
 * setup closures and first physical presences). Replay proves the HISTORY is intact and canonical integrity proves each fact's
 * owner/facet, typed value, governing rule and authority; this proves each fact still means what admission required:
 *
 *  - the same single rule admission applies holds against the facts as they stood BEFORE the fact (a write is judged at the time
 *    it was made), the pinned facts were read at their exact versions and depended on, and the evidence that the owner rule
 *    actually ran for the group exists in this process: a replay through the historical verifier, or a live commit through
 *    admission. A history that bears R1 facts and was NOT so verified fails CLOSED;
 *  - the facts that cannot be judged from a snapshot (the Temporal canonical time before B2, an ADVANCING fact committed before
 *    a setup placement) are judged by that historical verifier, never approximated here: a snapshot that says nothing is not a pass;
 *  - the exact-identity exclusion holds whatever the commit order: a presence-bearing actor has no rival physical custodian.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), and rebuilds the pre-state of each R1 fact once.
 */
export function verifyActorPresenceIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const all = store.listFacts();
  const chain = all.filter(isActorPresenceChainFact);
  if (chain.length === 0) return out;

  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;
  /** The committed facts as they stood BEFORE `revision` (exact for every create-only fact; a lower bound for an ADVANCING one). */
  const before = (revision: number): ReadonlyMap<string, OwnerFact> =>
    new Map([...byKey].filter(([, f]) => revisionOf(f) < revision));
  const checked = store.ruleCheckedGroupIds?.();

  const bad = (fact: OwnerFact, message: string) =>
    out.push({
      key: fact.key,
      code:
        resolveKey(fact.key)?.kind.id === "actor_physical_presence"
          ? "ACTOR_PRESENCE_STATE"
          : "ACTOR_SETUP_STATE",
      message,
    });

  const pinsRead = (
    fact: OwnerFact,
    group: CommitGroup | null,
    pins: readonly { key: string; version: number }[],
  ) => {
    for (const pin of pins) {
      const target = byKey.get(pin.key);
      if (!target) {
        bad(fact, `a pinned fact is committed: ${pin.key}`);
        continue;
      }
      if (revisionOf(target) >= revisionOf(fact)) {
        bad(fact, `a pinned fact was not committed before this fact: ${pin.key}`);
      }
      if (
        !group ||
        !group.reads.some((r) => r.key === pin.key && r.version === pin.version) ||
        !group.depends_on.includes(target.provenance.group_id)
      ) {
        bad(
          fact,
          `the group read the exact pinned fact and depended on the group that committed it: ${pin.key}`,
        );
      }
    }
  };

  for (const fact of chain) {
    const kind = resolveKey(fact.key)!.kind.id;
    const revision = revisionOf(fact);
    const facts = before(revision);
    const group = store.committedGroup(fact.provenance.intent_id);

    if (checked === undefined || !checked.has(fact.provenance.group_id)) {
      bad(
        fact,
        "this history bears R1 presence-chain facts but their owner rule did not demonstrably run (no historical verification or admission evidence): the load fails closed",
      );
    }

    if (kind === "actor_setup_placement") {
      const parsed = ActorSetupPlacementSchema.safeParse(fact.value);
      if (!parsed.success) continue; // canonical integrity reports the malformed value
      const p = parsed.data;
      const violation = actorSetupPlacementViolation(fact.key, p, facts);
      if (violation) bad(fact, violation);
      pinsRead(fact, group, [
        ...p.actor_state.map((s) => ({ key: s.fact_key, version: s.version })),
        { key: p.world.fact_key, version: p.pinned_versions.world },
        { key: p.locus.fact_key, version: p.pinned_versions.locus },
      ]);
    } else if (kind === "world_setup_closure") {
      const parsed = WorldSetupClosureSchema.safeParse(fact.value);
      if (!parsed.success) continue;
      const c = parsed.data;
      const violation = worldSetupClosureViolation(fact.key, c, facts);
      if (violation) bad(fact, violation);
      pinsRead(fact, group, [
        { key: c.world.fact_key, version: byKey.get(c.world.fact_key)?.version ?? 0 },
        ...c.placements.map((e) => ({ key: e.fact_key, version: e.version })),
      ]);
    } else {
      const parsed = ActorPhysicalPresenceSchema.safeParse(fact.value);
      if (!parsed.success) continue;
      const p = parsed.data;
      if (fact.version !== 1) {
        bad(
          fact,
          "stage one admits only the initial presence record: a successor, move or carry exists",
        );
      }
      // the Temporal canonical time before this fact is a HISTORICAL statement: the historical verifier judges it
      const violation = actorPhysicalPresenceViolation(fact.key, p, facts, { checkClock: false });
      if (violation) bad(fact, violation);
      pinsRead(fact, group, [
        { key: p.world.fact_key, version: p.pinned_versions.world },
        { key: p.locus.fact_key, version: p.pinned_versions.locus },
        { key: actorSetupPlacementKey(p.actor_id), version: p.pinned_versions.placement },
        { key: worldSetupClosureKey(p.world.entity_id), version: p.pinned_versions.closure },
      ]);
      if (!group || !group.reads.some((r) => r.key === TEMPORAL_STATE_KEY)) {
        bad(fact, "the presence read the committed Temporal state");
      }
      // exact-identity exclusion, whatever the commit order: no rival custodian exists in the final state either
      const rival = presenceRivalViolation(p.actor_id, all);
      if (rival) bad(fact, rival);
    }
  }
  return out;
}
