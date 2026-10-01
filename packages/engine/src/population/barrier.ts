import {
  CohortFactSchema,
  PopulationBasisSchema,
  ReconciliationCloseSchema,
  ConsequenceRegisterSchema,
  canonicalJson,
  indexedPlace,
  populationCloseKey,
  populationLedgerKey,
  populationCohortKey,
  timeAtOrBefore,
  timeEquals,
  OWNER_POPULATION,
  type CohortFact,
  type ConsequenceEnvelope,
  type OwnerFact,
  type PendingConsequenceBarrier,
  type PopulationBasis,
} from "@immortalis/contracts";
import type { BarrierEvaluation, ConsequenceBarrierEvaluator } from "../temporal/providers.ts";

/**
 * IM-04's answer to IM-02's PCB-01 question (F-017 PCB-01; WS-001 §32). The frozen conditions, each
 * evaluated from committed facts by identity — never by scanning, polling or wall-clock:
 *
 *  1. the envelope is ALREADY COMMITTED, ELIGIBLE (addressed to this ledger, effective at or before the
 *     consumer's resolution point) and UNCONSUMED (not in the ledger's consumed set);
 *  2. it causally precedes the consumer: it is committed now, in its writer's own register, and its
 *     effective basis does not lie after the instant the consumer's boundary resolves;
 *  3. it MATERIALLY INTERSECTS the consumer's engaged Population dependency: the ledger scope, or — for a
 *     scoped consumer — a Cohort the envelope can change. An Exit intersects when the unit is a member
 *     (or the Cohort has no composed membership yet); an Entry intersects when the new unit lands where
 *     the Cohort is indexed (it could qualify). Every consequence this slice carries is a membership
 *     change and so touches every declared discrete facet;
 *  4. the LATEST CLOSE OMITS it (it is not consumed), and incorporation COULD change the discrete
 *     outcome, which is the structural intersection of (3). No probability, rate or threshold exists.
 *
 * It is a pure question; the answer carries no state. Absent a ledger, a register or any of the above, the
 * answer is "not due" and the consumer reads the latest committed close (or fails closed if none).
 */
const notDue = (reason: string): BarrierEvaluation => ({ due: false, reason });

function intersects(e: ConsequenceEnvelope, cohort: CohortFact | null): boolean {
  if (!cohort) return true; // ledger scope: any consumption changes the scoped population
  const { ref, result } = cohort;
  const c = e.consequence;
  if (c.kind === "ENTRY") return indexedPlace(c.unit, ref.indexed_fact) === ref.scope.place;
  return result?.members == null ? true : result.members.includes(c.unit_id);
}

export const populationBarrierEvaluator: ConsequenceBarrierEvaluator = {
  evaluate(barrier, instant, getFact): BarrierEvaluation {
    const { ledger_id, cohort_id } = barrier.population;
    const ledgerFact = getFact(populationLedgerKey(ledger_id));
    if (!ledgerFact || ledgerFact.owner !== OWNER_POPULATION) return notDue("LEDGER_ABSENT");
    // A malformed value is never trusted or thrown on: nothing is due, and the load-time verifier reports it.
    const parsedLedger = PopulationBasisSchema.safeParse(ledgerFact.value);
    if (!parsedLedger.success) return notDue("LEDGER_INVALID");
    const ledger: PopulationBasis = parsedLedger.data;
    let cohort: CohortFact | null = null;
    if (cohort_id !== null) {
      const f = getFact(populationCohortKey(ledger_id, cohort_id));
      if (!f) return notDue("COHORT_ABSENT");
      const c = CohortFactSchema.safeParse(f.value);
      if (!c.success) return notDue("COHORT_INVALID");
      cohort = c.data;
    }
    const consumed = new Set(ledger.consumed_envelopes);
    const due: string[] = [];
    for (const src of barrier.consequence_sources) {
      const fact = getFact(src.fact_key);
      if (!fact || fact.owner !== src.owner) continue;
      const reg = ConsequenceRegisterSchema.safeParse(fact.value);
      if (!reg.success || reg.data.ledger_id !== ledger_id) continue;
      for (const e of reg.data.envelopes) {
        if (e.writer.owner !== fact.owner || e.downstream_consumer.ledger_id !== ledger_id)
          continue;
        if (consumed.has(e.envelope_id)) continue;
        if (e.basis.at.unit !== instant.unit || !timeAtOrBefore(e.basis.at, instant)) continue;
        if (intersects(e, cohort)) due.push(e.envelope_id);
      }
    }
    return due.length > 0
      ? { due: true, envelope_ids: [...new Set(due)].sort() }
      : notDue("NO_ELIGIBLE_INTERSECTING_UNCONSUMED_ENVELOPE");
  },

  closeSourceLawful(barrier: PendingConsequenceBarrier, fact: OwnerFact, getFact): boolean {
    if (fact.owner !== OWNER_POPULATION) return false;
    const { ledger_id } = barrier.population;
    const closeFact = getFact(populationCloseKey(ledger_id));
    if (!closeFact) return false;
    const close = ReconciliationCloseSchema.safeParse(closeFact.value);
    if (
      !close.success ||
      canonicalJson(close.data.close_basis) !== canonicalJson(barrier.close_basis)
    )
      return false;
    if (fact.key === closeFact.key) return true;
    const cohort = CohortFactSchema.safeParse(fact.value);
    if (!cohort.success || !fact.key.startsWith(`population/${ledger_id}/cohort/`)) return false;
    const basis = cohort.data.result?.basis_stamp.basis;
    // a Cohort result is a lawful read only if it is the LATEST close's: older results are stale
    return (
      basis?.kind === "RECONCILIATION_CLOSE" &&
      canonicalJson(basis.close_basis) === canonicalJson(barrier.close_basis) &&
      timeEquals(basis.resolution_point, close.data.resolution_point)
    );
  },
};
