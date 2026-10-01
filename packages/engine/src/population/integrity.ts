import {
  CohortFactSchema,
  PopulationBasisSchema,
  ReconciliationCloseSchema,
  populationCloseKey,
  populationLedgerKey,
  timeEquals,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { cohortMembers } from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's Population state
 * still tells one story (IM-12 replay/recovery + IM-04). Replay proves the HISTORY is intact and canonical
 * integrity proves each fact's type; this proves the Population facts still cohere:
 *
 *  - the ledger and its close advance together, once each per reconciliation, in ONE journaled group;
 *  - the close is the ledger's own: opening/closing counts and versions, resolution point, consumed set;
 *  - a Cohort result stamped with the latest close is exactly that close's: stamped with the ledger
 *    version it produced, members within the ledger's units, and — where Population owns the criterion —
 *    equal to what the ledger's units derive. An external view's constituents are checked against the
 *    versions its journaled group actually pinned; it is NEVER revalidated against a later criterion.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyPopulationIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "POPULATION_STATE", message });
  const facts = store.listFacts().filter((f) => {
    const id = resolveKey(f.key)?.kind.id;
    return id === "population_ledger" || id === "population_close" || id === "population_cohort";
  });
  const byKey = new Map(facts.map((f) => [f.key, f]));
  const parsed = <T>(
    f: OwnerFact,
    schema: { safeParse(v: unknown): { success: boolean; data?: T } },
  ) => {
    const r = schema.safeParse(f.value);
    return r.success ? (r.data as T) : undefined;
  };
  const ledgerIds = new Set(facts.map((f) => resolveKey(f.key)!.ids[0]!));
  for (const ledgerId of ledgerIds) {
    const ledgerFact = byKey.get(populationLedgerKey(ledgerId));
    const closeFact = byKey.get(populationCloseKey(ledgerId));
    if (!ledgerFact) {
      bad(populationLedgerKey(ledgerId), "Population facts exist without their ledger");
      continue;
    }
    const ledger = parsed(ledgerFact, PopulationBasisSchema);
    if (!ledger) continue;
    const stamp = ledger.basis_stamp.basis;
    if (stamp.kind === "ESTABLISHMENT") {
      if (closeFact || ledgerFact.version !== 1)
        bad(
          ledgerFact.key,
          "an established ledger that was never reconciled has no close and one version",
        );
    } else {
      const close = closeFact && parsed(closeFact, ReconciliationCloseSchema);
      if (!closeFact || !close) {
        bad(ledgerFact.key, "a reconciled ledger has no close");
      } else {
        if (ledgerFact.version !== 1 + closeFact.version)
          bad(
            ledgerFact.key,
            "the ledger and its close must advance together, once per reconciliation",
          );
        if (ledgerFact.provenance.group_id !== closeFact.provenance.group_id)
          bad(closeFact.key, "the ledger and its close were not published atomically in one group");
        if (
          close.closing.count !== ledger.count.count ||
          close.closing.ledger_version !== ledgerFact.version ||
          !timeEquals(close.resolution_point, stamp.resolution_point)
        )
          bad(closeFact.key, "the close is not the ledger's own closing basis");
        if (!close.consumed_envelopes.every((id) => ledger.consumed_envelopes.includes(id)))
          bad(closeFact.key, "the close consumed an envelope the ledger does not record");
        const exited = new Set(close.exits.map((x) => x.unit_id));
        const entered = close.entries.map((x) => x.unit_id);
        const held = new Set(ledger.units.map((u) => u.unit_id));
        if (entered.some((id) => !held.has(id)) || [...exited].some((id) => held.has(id)))
          bad(
            closeFact.key,
            "the close's entries and exits are not reflected in the ledger's units",
          );
      }
    }
    for (const f of facts) {
      const r = resolveKey(f.key)!;
      if (r.kind.id !== "population_cohort" || r.ids[0] !== ledgerId) continue;
      const cohort = parsed(f, CohortFactSchema);
      if (!cohort?.result) continue;
      const basis = cohort.result.basis_stamp.basis;
      if (basis.kind !== "RECONCILIATION_CLOSE") continue;
      const close = closeFact && parsed(closeFact, ReconciliationCloseSchema);
      if (!close || !timeEquals(basis.resolution_point, close.resolution_point)) continue; // older: stale, unread
      const ledgerStamp = cohort.result.basis_stamp.constituents.find(
        (k) => k.key === ledgerFact.key,
      );
      if (ledgerStamp?.version !== ledgerFact.version)
        bad(f.key, "a Cohort result stamped with the latest close names another ledger version");
      if (f.provenance.group_id !== ledgerFact.provenance.group_id)
        bad(f.key, "a Cohort result of the latest close was not published in the close's group");
      const held = new Set(ledger.units.map((u) => u.unit_id));
      if (cohort.result.members?.some((m) => !held.has(m)))
        bad(f.key, "a Cohort result names a member the ledger does not account");
      const ref = cohort.ref.criterion.ref;
      if (!ref && cohort.ref.cardinality_semantics === "EXACT") {
        if (!canonicalEqual(cohort.result.members, cohortMembers(cohort.ref, ledger.units, null)))
          bad(f.key, "a Population-owned Cohort result is not what the ledger's units derive");
      }
      if (ref && cohort.ref.cardinality_semantics === "EXACT") {
        const pinned = store
          .committedGroup(f.provenance.intent_id)
          ?.reads.find((r) => r.key === ref.fact_key);
        const stamped = cohort.result.basis_stamp.constituents.find((k) => k.key === ref.fact_key);
        if (!pinned || !stamped || pinned.version !== stamped.version)
          bad(f.key, "a derived view's criterion stamp differs from the version its group pinned");
      }
    }
  }
  return out;
}
