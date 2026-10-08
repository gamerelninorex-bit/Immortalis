import {
  MovementServiceRequestSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PcMovementCommitmentSchema,
  pcExistenceContractKey,
  pcMovementCommitmentKey,
  worldPcLocusCustodyKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { factsBefore, type IntegrityViolation } from "../world/integrity.ts";
import { pcMovementCommitmentViolation, pcMovementRequestViolation } from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that every loaded PC-side movement fact still tells one story. Replay
 * proves the HISTORY is intact and canonical integrity proves each fact's owner/facet, typed value, governing rule and authority;
 * this proves the facts still mean what admission required:
 *
 *  - the player's commitment-of-record holds against the facts as they stood BEFORE it (the same single rule admission applies:
 *    the very PC was active, its custody was the one authority, the destination was an established distinct locus, every pin was the
 *    exact current version), and read and depended on each fact it pinned, each committed before it;
 *  - the PC-owned request is exactly what that commitment determines (against the facts as they stood before the request), and
 *    exists only after the commitment: no willingness is created by Logistics or World-State.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), and returns immediately when no PC movement fact exists.
 */
export function verifyPcMovementIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "PC_MOVEMENT_STATE", message });
  const all = store.listFacts();
  const commitments = all.filter((f) => resolveKey(f.key)?.kind.id === "pc_movement_commitment");
  const requests = all.filter((f) => resolveKey(f.key)?.kind.id === "pc_movement_request");
  if (commitments.length + requests.length === 0) return out;

  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;

  const checkPins = (
    fact: OwnerFact,
    pins: readonly { key: string; version: number | null }[],
    revision: number,
  ) => {
    const group = store.committedGroup(fact.provenance.intent_id);
    for (const pin of pins) {
      const target = byKey.get(pin.key);
      if (!target) {
        bad(fact.key, `a pinned fact is committed: ${pin.key}`);
        continue;
      }
      if (revisionOf(target) >= revision) {
        bad(fact.key, `a pinned fact was not committed before this fact: ${pin.key}`);
      }
      if (
        !group ||
        !group.reads.some(
          (r) => r.key === pin.key && (pin.version === null || r.version === pin.version),
        ) ||
        !group.depends_on.includes(target.provenance.group_id)
      ) {
        bad(fact.key, `the fact read the exact pinned fact and depended on its group: ${pin.key}`);
      }
    }
  };

  for (const cf of commitments) {
    const parsed = PcMovementCommitmentSchema.safeParse(cf.value);
    if (!parsed.success) continue; // canonical integrity reports the malformed value
    const c = parsed.data;
    const revision = revisionOf(cf);
    const violation = pcMovementCommitmentViolation(
      cf.key,
      c,
      factsBefore(revision, byKey, revisionOf),
    );
    if (violation) bad(cf.key, violation);
    const pins = c.basis.pinned_versions;
    const d = c.intent.destination;
    checkPins(
      cf,
      [
        { key: pcExistenceContractKey(c.pc_id), version: pins.pc },
        { key: PLAYER_CHARACTER_BINDING_KEY, version: pins.binding },
        { key: worldPcLocusCustodyKey(c.pc_id), version: pins.custody },
        { key: d.world.fact_key, version: pins.world },
        { key: d.locus.fact_key, version: pins.locus },
      ],
      revision,
    );
  }

  for (const rf of requests) {
    const parsed = MovementServiceRequestSchema.safeParse(rf.value);
    if (!parsed.success) continue;
    const r = parsed.data;
    const revision = revisionOf(rf);
    const violation = pcMovementRequestViolation(
      rf.key,
      r,
      factsBefore(revision, byKey, revisionOf),
    );
    if (violation) bad(rf.key, violation);
    checkPins(
      rf,
      [
        { key: pcMovementCommitmentKey(r.subject.entity_id), version: null },
        { key: r.subject.fact_key, version: null },
        { key: r.destination.locus.fact_key, version: null },
      ],
      revision,
    );
  }
  return out;
}
