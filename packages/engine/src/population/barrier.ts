import {
  CohortFactSchema,
  PopulationBasisSchema,
  ReconciliationCloseSchema,
  ConsequenceRegisterSchema,
  ExternalCriterionSchema,
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
  type CanonicalTime,
  type OwnerFact,
  type PendingConsequenceBarrier,
  type Pcb01Evidence,
  type PopulationBasis,
  type ReconciliationClose,
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
 *     scoped consumer — a Cohort whose composed result the envelope CAN change: an Exit of a current member
 *     (or any consequence while the Cohort has no composed membership yet); an Entry that lands where the
 *     Cohort is indexed AND is not shown by the authoritative Criterion Owner fact — read at the
 *     consumer's resolution point — to fail the criterion. An unquantified Cohort has no discrete result
 *     to change. Where the external criterion is not established at that point it cannot say, so the
 *     answer stays "could change" (and the reconciliation, if it cannot lawfully compose, fails closed);
 *  4. the LATEST CLOSE OMITS it (it is not consumed), and incorporation COULD change the discrete
 *     outcome — which is exactly (3). No probability, rate or threshold exists.
 *
 * The same predicate is RE-DERIVED from the committed Population stage group after the fact
 * (`pcb01Evidence` / `pcb01EvidenceViolation`), so the retained due claim is verifiable at raw admission
 * and on load without any second log.
 *
 * It is a pure question; the answer carries no state. Absent a ledger, a register or any of the above, the
 * answer is "not due" and the consumer reads the latest committed close (or fails closed if none).
 */
const notDue = (reason: string): BarrierEvaluation => ({ due: false, reason });

function intersects(
  e: ConsequenceEnvelope,
  cohort: CohortFact | null,
  instant: CanonicalTime,
  getFact: (key: string) => OwnerFact | undefined,
): boolean {
  if (!cohort) return true; // ledger scope: any consumption changes the scoped population
  const { ref, result } = cohort;
  if (ref.cardinality_semantics === "UNQUANTIFIED") return false;
  const c = e.consequence;
  if (c.kind === "EXIT") return result?.members == null ? true : result.members.includes(c.unit_id);
  if (indexedPlace(c.unit, ref.indexed_fact) !== ref.scope.place) return false;
  if (!ref.criterion.ref) return true; // Population-owned criterion: the place is the membership
  const f = getFact(ref.criterion.ref.fact_key);
  const crit =
    f && f.owner === ref.criterion.owner ? ExternalCriterionSchema.safeParse(f.value) : undefined;
  if (!crit?.success || !timeEquals(crit.data.resolution_point, instant)) return true; // cannot say
  return crit.data.qualifying_unit_ids.includes(c.unit.unit_id); // the authoritative criterion decides
}

/**
 * The triggers of a PCB-01 due claim, derived ONLY from what the committed Population stage group wrote:
 * its close (the consumed Entries/Exits and each recomposed Cohort's membership before) and the Cohort's
 * composed result after. An envelope is a trigger when it intersects the engaged scope: any consumed
 * envelope for a ledger scope; for a Cohort, an Exit of a member before, an Entry that is a member after
 * (it qualifies), or anything while the Cohort was not yet composed.
 */
export function derivePcbTriggers(
  barrier: PendingConsequenceBarrier,
  close: ReconciliationClose,
  cohort: CohortFact | null,
): Pcb01Evidence["triggers"] {
  const out: Pcb01Evidence["triggers"] = [];
  const consumed = [
    ...close.entries.map((e) => ({ id: e.envelope_id, unit: e.unit_id, kind: "ENTRY" as const })),
    ...close.exits.map((e) => ({ id: e.envelope_id, unit: e.unit_id, kind: "EXIT" as const })),
  ];
  const cohortId = barrier.population.cohort_id;
  if (cohortId === null) {
    for (const c of consumed) out.push({ envelope_id: c.id, basis: "LEDGER_SCOPE" });
  } else {
    const composition = close.cohorts.find((k) => k.cohort_id === cohortId);
    if (!composition || !cohort || cohort.ref.cardinality_semantics === "UNQUANTIFIED") return [];
    const before = composition.members_before;
    const after = cohort.result?.members ?? null;
    for (const c of consumed) {
      if (before === null) out.push({ envelope_id: c.id, basis: "COHORT_NOT_YET_COMPOSED" });
      else if (c.kind === "EXIT" && before.includes(c.unit))
        out.push({ envelope_id: c.id, basis: "COHORT_MEMBER_EXIT" });
      else if (c.kind === "ENTRY" && after?.includes(c.unit))
        out.push({ envelope_id: c.id, basis: "COHORT_QUALIFYING_ENTRY" });
    }
  }
  return out.sort((a, b) => (a.envelope_id < b.envelope_id ? -1 : 1));
}

/** `valueOf` yields the value the committed Population stage group wrote for a key (or undefined). */
type StageValues = (key: string) => unknown;

/** The evidence of a PCB-01 due reconciliation, or null when no frozen condition is supported. */
export function pcb01Evidence(
  barrier: PendingConsequenceBarrier,
  instant: CanonicalTime,
  valueOf: StageValues,
): Pcb01Evidence | null {
  const { ledger_id, cohort_id } = barrier.population;
  const close = ReconciliationCloseSchema.safeParse(valueOf(populationCloseKey(ledger_id)));
  if (!close.success || close.data.ledger_id !== ledger_id) return null;
  if (!timeEquals(close.data.resolution_point, instant)) return null;
  if (canonicalJson(close.data.close_basis) !== canonicalJson(barrier.close_basis)) return null;
  let cohort: CohortFact | null = null;
  if (cohort_id !== null) {
    const c = CohortFactSchema.safeParse(valueOf(populationCohortKey(ledger_id, cohort_id)));
    if (!c.success) return null;
    cohort = c.data;
  }
  const triggers = derivePcbTriggers(barrier, close.data, cohort);
  return triggers.length === 0 ? null : { scope: { ledger_id, cohort_id }, instant, triggers };
}

/**
 * Independent verification of a recorded PCB-01 claim against the committed stage group: the claim must
 * be exactly what the group's own facts support, at the consumer's single resolution point. Returns a
 * message, or null. Used by raw kernel admission and by load-time verification, so they cannot drift.
 */
export function pcb01EvidenceViolation(input: {
  readonly recorded: Pcb01Evidence;
  readonly barrier: PendingConsequenceBarrier;
  readonly instant: CanonicalTime;
  readonly valueOf: StageValues;
}): string | null {
  const { recorded, barrier, instant, valueOf } = input;
  if (
    !timeEquals(recorded.instant, instant) ||
    recorded.scope.ledger_id !== barrier.population.ledger_id ||
    recorded.scope.cohort_id !== barrier.population.cohort_id
  ) {
    return "the PCB-01 evidence is not for the consumer's engaged scope and resolution point";
  }
  const derived = pcb01Evidence(barrier, instant, valueOf);
  if (!derived) {
    return "no PCB-01 trigger condition is supported by the committed reconciliation: an eligible, unconsumed envelope that intersects the engaged scope and could change its discrete result";
  }
  return canonicalJson(derived) === canonicalJson(recorded)
    ? null
    : "the recorded PCB-01 triggers are not what the committed reconciliation supports";
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
        if (intersects(e, cohort, instant, getFact)) due.push(e.envelope_id);
      }
    }
    return due.length > 0
      ? { due: true, envelope_ids: [...new Set(due)].sort() }
      : notDue("NO_ELIGIBLE_INTERSECTING_UNCONSUMED_ENVELOPE");
  },

  evidence(barrier, instant, valueOf): Pcb01Evidence | null {
    return pcb01Evidence(barrier, instant, valueOf);
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
