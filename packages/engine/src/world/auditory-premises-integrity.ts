import {
  ActorRawSensoryStateSchema,
  TEMPORAL_STATE_KEY,
  WorldAcousticEmissionSchema,
  WorldLocusSchema,
  worldSetupClosureKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { presenceRivalViolation } from "./actor-presence.ts";
import {
  acousticProfileLocusViolation,
  actorRawSensoryStateViolation,
  isAuditoryPremisesFact,
  worldAcousticEmissionViolation,
} from "./auditory-premises.ts";
import type { IntegrityViolation } from "./integrity.ts";

/**
 * Re-verifies, from committed state and the journal alone, the S1-P1 chain: typed acoustic profiles on loci, actors' raw sensory
 * states (W1) and acoustic emissions (W2b). Replay proves the HISTORY is intact and canonical integrity proves each fact's
 * owner/facet, typed value, governing rule and authority; this proves each fact still means what admission required:
 *
 *  - the same single rule admission applies holds against the facts as they stood BEFORE the fact (a write is judged at the time
 *    it was made), the pinned facts were read at their exact versions and depended on, were committed in journal order before it,
 *    and the evidence that the owner rule actually ran for the group exists in this process (a replay through the historical
 *    verifier, or a live commit through admission). A history that bears P1 facts and was NOT so verified fails CLOSED;
 *  - the facts that cannot be judged from a snapshot (the Temporal canonical time before W1 or an emission, an ADVANCING fact
 *    committed before the locus) are judged by that historical verifier, never approximated here: a snapshot that says nothing is
 *    not a pass;
 *  - a typed profile precedes its world's setup closure in the journal, W1 follows B2, and the exact-identity exclusion holds
 *    whatever the commit order.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), and rebuilds the pre-state of each P1 fact once.
 */
export function verifyAuditoryPremisesIntegrity(
  store: CampaignStore,
): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const all = store.listFacts();
  const chain = all.filter(isAuditoryPremisesFact);
  if (chain.length === 0) return out;

  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;
  /** The committed facts as they stood BEFORE `revision` (exact for every create-only fact; a lower bound for an ADVANCING one). */
  const before = (revision: number): ReadonlyMap<string, OwnerFact> =>
    new Map([...byKey].filter(([, f]) => revisionOf(f) < revision));
  const checked = store.ruleCheckedGroupIds?.();

  const bad = (fact: OwnerFact, message: string) =>
    out.push({ key: fact.key, code: "AUDITORY_PREMISES_STATE", message });

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
        "this history bears S1-P1 facts but their owner rule did not demonstrably run (no historical verification or admission evidence): the load fails closed",
      );
    }

    if (kind === "actor_raw_sensory_state") {
      const parsed = ActorRawSensoryStateSchema.safeParse(fact.value);
      if (!parsed.success) continue; // canonical integrity reports the malformed value
      const w = parsed.data;
      if (fact.version !== 1) {
        bad(
          fact,
          "stage one admits only the first raw sensory record: a replacement, carry or changed form exists",
        );
      }
      // the Temporal canonical time before this fact is a HISTORICAL statement: the historical verifier judges it
      const violation = actorRawSensoryStateViolation(fact.key, w, facts, { checkClock: false });
      if (violation) bad(fact, violation);
      pinsRead(
        fact,
        group,
        w.dependency_refs.map((r) => ({ key: r.fact_key, version: r.version })),
      );
      if (!group || !group.reads.some((r) => r.key === TEMPORAL_STATE_KEY)) {
        bad(fact, "the raw sensory fact read the committed Temporal state");
      }
      // exact-identity exclusion, whatever the commit order: no rival custodian exists in the final state either
      const rival = presenceRivalViolation(w.actor_id, all);
      if (rival) bad(fact, rival);
    } else if (kind === "world_acoustic_emission") {
      const parsed = WorldAcousticEmissionSchema.safeParse(fact.value);
      if (!parsed.success) continue;
      const e = parsed.data;
      if (fact.version !== 1) bad(fact, "an acoustic emission is create-only: a rewrite exists");
      const violation = worldAcousticEmissionViolation(fact.key, e, facts, { checkClock: false });
      if (violation) bad(fact, violation);
      const closure = byKey.get(worldSetupClosureKey(e.world.entity_id));
      pinsRead(fact, group, [
        { key: e.world.fact_key, version: byKey.get(e.world.fact_key)?.version ?? 0 },
        { key: e.emitting_source.fact_key, version: e.emitting_source.version },
        { key: worldSetupClosureKey(e.world.entity_id), version: closure?.version ?? 0 },
      ]);
      if (!group || !group.reads.some((r) => r.key === TEMPORAL_STATE_KEY)) {
        bad(fact, "the emission read the committed Temporal state");
      }
      const source = byKey.get(e.emitting_source.fact_key);
      if (source && closure && revisionOf(source) >= revisionOf(closure)) {
        bad(fact, "the typed profile was committed before the world's setup closure");
      }
    } else {
      const parsed = WorldLocusSchema.safeParse(fact.value);
      if (!parsed.success) continue;
      const violation = acousticProfileLocusViolation(fact.key, parsed.data, facts);
      if (violation) bad(fact, violation);
      const closure = byKey.get(worldSetupClosureKey(parsed.data.world.entity_id));
      if (closure && revisionOf(closure) <= revision) {
        bad(fact, "the typed profile was committed before the world's setup closure");
      }
    }
  }
  return out;
}
