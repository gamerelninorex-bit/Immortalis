import {
  PLAYER_CHARACTER_BINDING_KEY,
  PcPhysicalLocusCustodySchema,
  pcExistenceContractKey,
  worldActorCouplingKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { factsBefore, type IntegrityViolation } from "./integrity.ts";
import { pcPhysicalLocusCustodyViolation } from "./pc-locus-custody.ts";

/**
 * Re-verifies, from committed state and the journal alone, that every loaded Active-PC physical-locus custody record still
 * tells one story. Replay proves the HISTORY is intact and canonical integrity proves each fact's owner/facet, typed value,
 * governing rule and authority; this proves the record still means what admission required:
 *
 *  - each pinned fact (the PC's contract, the operative binding, the consumed coupling, the world, the locus) was committed
 *    BEFORE the record, and the record read it at exactly the version pinned and depended on the group that committed it
 *    (referenced, never copied);
 *  - the same single rule admission applies (`pcPhysicalLocusCustodyViolation`) holds against the facts as they stood BEFORE
 *    the record: the PC was already handed over, the stationary locus is the consumed coupling's, and no other current-locus
 *    authority existed for the identity.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyPcPhysicalLocusCustodyIntegrity(
  store: CampaignStore,
): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "PC_LOCUS_CUSTODY_STATE", message });
  const all = store.listFacts();
  const records = all.filter((f) => resolveKey(f.key)?.kind.id === "world_pc_locus_custody");
  if (records.length === 0) return out;

  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;

  // exactly one authority answers "where is the PC?": at most one stationary record may exist for the one active PC
  if (records.length > 1) {
    for (const r of records)
      bad(r.key, "more than one stationary physical-locus custody record exists");
  }

  for (const rf of records) {
    const parsed = PcPhysicalLocusCustodySchema.safeParse(rf.value);
    if (!parsed.success) continue; // canonical integrity reports the malformed value
    const c = parsed.data;
    const revision = revisionOf(rf);
    const violation = pcPhysicalLocusCustodyViolation(
      rf.key,
      c,
      factsBefore(revision, byKey, revisionOf),
    );
    if (violation) bad(rf.key, violation);

    const group = store.committedGroup(rf.provenance.intent_id);
    const pins = [
      { key: pcExistenceContractKey(c.pc_id), version: c.basis.pinned_versions.pc },
      { key: PLAYER_CHARACTER_BINDING_KEY, version: c.basis.pinned_versions.binding },
      { key: worldActorCouplingKey(c.pc_id), version: c.basis.pinned_versions.coupling },
      { key: c.stationary_locus.world.fact_key, version: c.basis.pinned_versions.world },
      { key: c.stationary_locus.locus.fact_key, version: c.basis.pinned_versions.locus },
    ];
    for (const pin of pins) {
      const target = byKey.get(pin.key);
      if (!target) {
        bad(rf.key, `a pinned fact is committed: ${pin.key}`);
        continue;
      }
      if (revisionOf(target) >= revision) {
        bad(rf.key, `a pinned fact was not committed before the custody record: ${pin.key}`);
      }
      if (
        !group ||
        !group.reads.some((r) => r.key === pin.key && r.version === pin.version) ||
        !group.depends_on.includes(target.provenance.group_id)
      ) {
        bad(
          rf.key,
          `a custody record read the exact pinned fact and depended on the group that committed it: ${pin.key}`,
        );
      }
    }
  }
  return out;
}
