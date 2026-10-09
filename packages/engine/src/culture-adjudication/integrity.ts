import {
  CjaDecisionRecordSchema,
  OWNER_CULTURE_ADJUDICATION_KERNEL,
  cjaDecisionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import {
  cjaDependsOn,
  cjaGroupIdentityViolation,
  cjaMetadataViolation,
  cjaRecordViolation,
  cjaSealedProofViolation,
} from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's adjudication records are neither
 * malformed nor non-rederivable (IM-12 replay/recovery; CJA1 §§8.4, 10.A). Replay proves the HISTORY is intact and canonical
 * integrity proves each fact's owner, schema, key identity, sealing and governing rule; this proves the evidence still tells
 * one story — WITHOUT the context port, a model, or any live foreign value:
 *
 *  - every record carries the fixed OwnerFact metadata and sits at the key its update identity derives;
 *  - its identities re-derive from its own trigger, opportunity, distinction and operation; its sealed references are
 *    closed, its judgment coherent (C6) and its Cohort scope lawful;
 *  - it was committed as ONE group under the deterministic RC-16 identities and the governing rule, writing only itself,
 *    READING only the sealed context at its cited version and DEPENDING on exactly the context's group and the cited source
 *    groups;
 *  - the sealed context's own journaled group read every cited source at its cited version and depended on its committing
 *    group (the historical proof), and the record was committed after that context.
 *
 * A LATER foreign owner version never makes a record a violation. Cost: lists committed facts once per open (a diagnostic path,
 * CAL-06), like the other verifiers; it is never an advance path.
 */
export function verifyCultureAdjudicationIntegrity(
  store: CampaignStore,
): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "CULTURE_ADJUDICATION_STATE", message });
  const all = store.listFacts();
  const decisions = all.filter(
    (f) => resolveKey(f.key)?.kind.id === "culture_adjudication_decision",
  );
  if (decisions.length === 0) return out;
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;

  for (const df of decisions) {
    const metadata = cjaMetadataViolation(df);
    if (metadata) bad(df.key, metadata);
    const parsed = CjaDecisionRecordSchema.safeParse(df.value);
    if (!parsed.success) {
      bad(df.key, "a record satisfies its adjudication record contract");
      continue;
    }
    const r = parsed.data;
    if (df.key !== cjaDecisionKey(r.culture_update_id)) {
      bad(df.key, "a record is at the key its update identity derives");
      continue;
    }
    const violation = cjaRecordViolation(r);
    if (violation) bad(df.key, `${violation.code}: ${violation.message}`);

    const group = store.committedGroup(df.provenance.intent_id);
    if (!group || group.writes.length !== 1 || group.writes[0]!.key !== df.key) {
      bad(df.key, "the committing group is in the journal and writes only this record");
      continue;
    }
    const identity = cjaGroupIdentityViolation(group, r.culture_update_id);
    if (identity) bad(df.key, identity);
    if (
      group.reads.length !== 1 ||
      group.reads[0]!.key !== r.context_ref.fact_key ||
      group.reads[0]!.version !== r.context_ref.version
    ) {
      bad(df.key, "the record read exactly the sealed context at its cited version");
    }
    const expected = cjaDependsOn(r);
    if (
      group.depends_on.length !== expected.length ||
      expected.some((g) => !group.depends_on.includes(g))
    ) {
      bad(
        df.key,
        "the record depended on exactly the sealed context's group and the cited source groups",
      );
    }
    const proof = cjaSealedProofViolation(byKey, store, r);
    if (proof) bad(df.key, `${proof.code}: ${proof.message}`);
    const context = byKey.get(r.context_ref.fact_key);
    if (context && revisionOf(context) >= revisionOf(df)) {
      bad(df.key, "the record was not committed after the sealed context it rests on");
    }
    if (
      df.owner !== OWNER_CULTURE_ADJUDICATION_KERNEL ||
      !canonicalEqual(df.provenance.rule, group.rule)
    ) {
      bad(df.key, "the record carries the adjudication owner and the group's governing rule");
    }
  }
  return out;
}
