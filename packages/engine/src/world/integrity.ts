import {
  CANON_WRITE_AUTHORITY,
  PlayerCharacterBindingSchema,
  WorldLocusSchema,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { identityMismatch } from "../owners/admission.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";

export interface IntegrityViolation {
  readonly key: string;
  readonly code:
    | "UNREGISTERED_KEY"
    | "WRONG_OWNER_FACET"
    | "VALUE_INVALID"
    | "RULE_DRIFT"
    | "AUTHORITY_DRIFT"
    | "UNSUPPORTED_AMENDMENT"
    | "PREREQUISITE_MISSING"
    | "REFERENCE_INVALID"
    | "DEPENDENCY_ORDER";
  readonly message: string;
}

/**
 * Re-verifies, from committed state alone, that a loaded canonical campaign still has the owner/facet
 * assignments, typed values, governing-rule provenance and dependency direction that admission
 * enforced when each fact was written. Replay proves the *history* is intact; this proves the
 * *meaning* still matches the running build's specification-backed owners (no owner/facet drift).
 *
 * A campaign containing any fact outside the registered key spaces is not a canonical campaign of
 * this build: it fails closed rather than being partially trusted. Diagnostic full listing (CAL-06):
 * cost is proportional to the number of canonical facts, once per open.
 */
export function verifyCanonicalIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const facts = new Map<string, OwnerFact>(store.listFacts().map((f) => [f.key, f]));
  const out: IntegrityViolation[] = [];
  const bad = (key: string, code: IntegrityViolation["code"], message: string) =>
    out.push({ key, code, message });
  const revisionOf = (f: OwnerFact): number =>
    store.lookupReceipt(f.provenance.intent_id)?.revision ?? -1;

  const needs = (of: OwnerFact, key: string): OwnerFact | undefined => {
    const target = facts.get(key);
    if (!target) {
      bad(of.key, "PREREQUISITE_MISSING", `prerequisite ${key} is not committed`);
      return undefined;
    }
    if (revisionOf(target) >= revisionOf(of)) {
      bad(of.key, "DEPENDENCY_ORDER", `prerequisite ${key} was not committed before this fact`);
    }
    return target;
  };

  for (const fact of facts.values()) {
    const resolved = resolveKey(fact.key);
    if (!resolved) {
      bad(fact.key, "UNREGISTERED_KEY", "key is outside every registered key space");
      continue;
    }
    const { kind, ids } = resolved;
    if (fact.owner !== kind.owner || fact.facet !== kind.facet) {
      bad(fact.key, "WRONG_OWNER_FACET", `owner/facet is not ${kind.owner}/${kind.facet}`);
      continue;
    }
    if (fact.version !== 1) bad(fact.key, "UNSUPPORTED_AMENDMENT", "sealed canon was overwritten");
    if (!canonicalEqual(fact.provenance.rule, kind.rule)) {
      bad(fact.key, "RULE_DRIFT", "governing rule differs from the registered source citation");
    }
    const receipt = store.lookupReceipt(fact.provenance.intent_id);
    if (!receipt || !canonicalEqual(receipt.basis.authority, CANON_WRITE_AUTHORITY)) {
      bad(fact.key, "AUTHORITY_DRIFT", "not committed by role.archivist + permission.canon.write");
    }
    const parsed = kind.valueSchema.safeParse(fact.value);
    if (!parsed.success) {
      bad(fact.key, "VALUE_INVALID", "value violates its typed contract");
      continue;
    }
    const mismatch = identityMismatch(kind, ids, parsed.data);
    if (mismatch) {
      bad(fact.key, "VALUE_INVALID", mismatch);
      continue;
    }

    if (kind.id === "world_locus") {
      const locus = WorldLocusSchema.parse(parsed.data);
      if (
        locus.world.fact_key !== worldProfileKey(locus.world.entity_id) ||
        fact.key !== worldLocusKey(locus.world.entity_id, locus.locus_id)
      ) {
        bad(fact.key, "REFERENCE_INVALID", "locus world reference does not match its key");
      }
      needs(fact, worldProfileKey(locus.world.entity_id));
    } else if (kind.id === "player_character_binding") {
      const b = PlayerCharacterBindingSchema.parse(parsed.data);
      const worldKey = worldProfileKey(b.coupling.world.entity_id);
      const locusKey = worldLocusKey(b.coupling.world.entity_id, b.coupling.locus.entity_id);
      if (
        b.active_pc.fact_key !== pcExistenceContractKey(b.active_pc.entity_id) ||
        b.coupling.world.fact_key !== worldKey ||
        b.coupling.locus.fact_key !== locusKey
      ) {
        bad(fact.key, "REFERENCE_INVALID", "binding references do not match their key identities");
      }
      needs(fact, b.active_pc.fact_key);
      needs(fact, worldKey);
      const locusFact = needs(fact, locusKey);
      if (locusFact) {
        const committed = WorldLocusSchema.safeParse(locusFact.value);
        if (!committed.success || !canonicalEqual(committed.data.world, b.coupling.world)) {
          bad(fact.key, "REFERENCE_INVALID", "the locus does not belong to the coupled world");
        }
      }
    }
  }
  return out;
}
