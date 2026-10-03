import { ExistingActorCouplingSchema, type OwnerFact } from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { existingActorCouplingViolation } from "./actor-coupling.ts";
import type { IntegrityViolation } from "./integrity.ts";

/**
 * Re-verifies, from committed state and the journal alone, that every loaded Existing-Actor World-State coupling still
 * tells one story. Replay proves the HISTORY is intact and canonical integrity proves each fact's owner/facet, typed value,
 * governing rule and authority; this proves the coupling still means what admission required:
 *
 *  - each pinned fact (the actor's own Named-Actor state, the world, the locus) was committed BEFORE the coupling, and the
 *    coupling read it at exactly the version pinned and depended on the group that committed it (referenced, never copied);
 *  - the same single rule admission applies (`existingActorCouplingViolation`) holds against the facts as they stood
 *    BEFORE the coupling, so the actor was already an existing non-PC actor when it was coupled;
 *
 * Whether the coupled identity is still no Player Character other than by the explicit existing-actor compilation (and the
 * one lawful Existing-Actor → PC handover that consumes this coupling) is a statement about the Role Registry binding, so
 * it is made by canonical integrity (`verifyCanonicalIntegrity`, world_actor_coupling branch), under the same
 * `ACTOR_COUPLING_STATE` code.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyExistingActorCouplingIntegrity(
  store: CampaignStore,
): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "ACTOR_COUPLING_STATE", message });
  const all = store.listFacts();
  const couplings = all.filter((f) => resolveKey(f.key)?.kind.id === "world_actor_coupling");
  if (couplings.length === 0) return out;

  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;
  /** The committed facts as they stood BEFORE `revision`: the coupling is judged at the time of the write. */
  const factsBefore = (revision: number) => ({
    get: (k: string) => {
      const f = byKey.get(k);
      return f && revisionOf(f) < revision ? f : undefined;
    },
    has: (k: string) => {
      const f = byKey.get(k);
      return f !== undefined && revisionOf(f) < revision;
    },
  });

  for (const cf of couplings) {
    const parsed = ExistingActorCouplingSchema.safeParse(cf.value);
    if (!parsed.success) continue; // canonical integrity reports the malformed value
    const c = parsed.data;
    const revision = revisionOf(cf);
    const violation = existingActorCouplingViolation(cf.key, c, factsBefore(revision));
    if (violation) bad(cf.key, violation);

    const group = store.committedGroup(cf.provenance.intent_id);
    const pins = [
      ...c.actor_state.map((s) => ({ key: s.fact_key, version: s.version })),
      { key: c.coupling.world.fact_key, version: c.pinned_versions.world },
      { key: c.coupling.locus.fact_key, version: c.pinned_versions.locus },
    ];
    for (const pin of pins) {
      const target = byKey.get(pin.key);
      if (!target) {
        bad(cf.key, `a pinned fact is committed: ${pin.key}`);
        continue;
      }
      if (revisionOf(target) >= revision) {
        bad(cf.key, `a pinned fact was not committed before the coupling: ${pin.key}`);
      }
      if (
        !group ||
        !group.reads.some((r) => r.key === pin.key && r.version === pin.version) ||
        !group.depends_on.includes(target.provenance.group_id)
      ) {
        bad(
          cf.key,
          `a coupling read the exact pinned fact and depended on the group that committed it: ${pin.key}`,
        );
      }
    }
  }
  return out;
}
