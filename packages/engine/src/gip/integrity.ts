import {
  InstitutionIdentitySchema,
  TemporalObjectSchema,
  gipInstitutionIdentityKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { gipObjectViolation } from "./declaration.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's GIP state still tells one story (IM-12
 * replay/recovery + IM-06). Replay proves the HISTORY is intact and canonical integrity proves each fact's owner, schema, key
 * identity, governing rule and authority; this proves the GIP facts still cohere:
 *
 *  - an Institution Identity is at the key its canonical `institution_id` derives, is one create-only version and was
 *    committed by a group that wrote exactly that one key and read and depended on nothing foreign (so it is GIP's own
 *    identity record and a loaded campaign cannot hold an identity another path created beside its own);
 *  - no temporal object declares a GIP stage, close or owned object: GIP has no tick, phase or polling loop.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyGipIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) => out.push({ key, code: "GIP_STATE", message });
  const all = store.listFacts();
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;

  for (const f of all) {
    if (kindOf(f) === "gip_institution_identity") {
      const parsed = InstitutionIdentitySchema.safeParse(f.value);
      if (!parsed.success) continue;
      if (f.key !== gipInstitutionIdentityKey(parsed.data.institution_id)) {
        bad(
          f.key,
          "an Institution Identity is at the key derived from its canonical institution_id",
        );
        continue;
      }
      const group = store.committedGroup(f.provenance.intent_id);
      if (
        !group ||
        group.writes.length !== 1 ||
        group.writes[0]!.key !== f.key ||
        group.reads.length !== 0 ||
        group.depends_on.length !== 0
      ) {
        bad(
          f.key,
          "an Institution Identity is GIP's own identity record: one write, no foreign read or dependency",
        );
      }
    } else if (kindOf(f) === "temporal_object") {
      const o = TemporalObjectSchema.safeParse(f.value);
      const violation = o.success ? gipObjectViolation(o.data) : null;
      if (violation) bad(f.key, violation);
    }
  }
  return out;
}
