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
 * its close — each consumed envelope with its effective point and the register it came from, plus, per
 * recomposed Cohort, the membership BEFORE and the Entry envelopes that QUALIFY — and the engaged scope.
 *
 * The consumed envelopes are REPLAYED in application order (effective point, then envelope id), so the
 * cause is never lost to final state: a qualifying Entry that a later Exit of the same unit nets out is
 * still an Entry that intersected, and so is that Exit (the unit was a member by then). An envelope is a
 * trigger only if it came from one of the barrier's DECLARED consequence sources — an envelope from some
 * other lawful register, though consumed by the same close, can never make this consumer's
 * reconciliation due. For a ledger scope every declared-source envelope is a trigger; for a Cohort: an
 * Exit of a then-member, a qualifying Entry, or anything while the Cohort was not yet composed.
 */
export function derivePcbTriggers(
  barrier: PendingConsequenceBarrier,
  close: ReconciliationClose,
  cohort: CohortFact | null,
): Pcb01Evidence["triggers"] {
  const declared = (s: { owner: string; fact_key: string }) =>
    barrier.consequence_sources.some((d) => d.owner === s.owner && d.fact_key === s.fact_key);
  // The consumer's DECLARED sources govern the causal state, not just the emitted evidence: only their
  // envelopes are replayed. Population consumed the others too (they are in the close and in conservation),
  // but for THIS consumer they neither intersect nor alter the membership against which a declared
  // envelope is judged — exactly the live predicate, which reads only the declared registers against the
  // Cohort as it stood before the close.
  const consumed = [
    ...close.entries.map((e) => ({ ...e, kind: "ENTRY" as const })),
    ...close.exits.map((e) => ({ ...e, kind: "EXIT" as const })),
  ]
    .filter((c) => declared(c.source))
    .sort((x, y) =>
      x.effective_at.value !== y.effective_at.value
        ? x.effective_at.value - y.effective_at.value
        : x.envelope_id < y.envelope_id
          ? -1
          : 1,
    );
  const out: Pcb01Evidence["triggers"] = [];
  const cohortId = barrier.population.cohort_id;
  const trigger = (
    c: (typeof consumed)[number],
    basis: Pcb01Evidence["triggers"][number]["basis"],
  ) => {
    out.push({ envelope_id: c.envelope_id, basis, source: c.source });
  };
  if (cohortId === null) {
    for (const c of consumed) trigger(c, "LEDGER_SCOPE");
  } else {
    const composition = close.cohorts.find((k) => k.cohort_id === cohortId);
    if (!composition || !cohort || cohort.ref.cardinality_semantics === "UNQUANTIFIED") return [];
    if (composition.members_before === null) {
      for (const c of consumed) trigger(c, "COHORT_NOT_YET_COMPOSED");
    } else {
      const running = new Set(composition.members_before);
      const qualifying = new Set(composition.qualifying_entrants);
      for (const c of consumed) {
        if (c.kind === "ENTRY") {
          if (!qualifying.has(c.envelope_id)) continue;
          running.add(c.unit_id);
          trigger(c, "COHORT_QUALIFYING_ENTRY");
        } else if (running.delete(c.unit_id)) {
          trigger(c, "COHORT_MEMBER_EXIT");
        }
      }
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
