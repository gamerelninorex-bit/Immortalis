import {
  FACET_POPULATION_STATE,
  OWNER_POPULATION,
  POPULATION_CLOSE_NAME,
  POPULATION_OPERATION_RECONCILE,
  populationCloseKey,
  populationCohortKey,
  populationLedgerKey,
  READ_MODE_NOW,
  type CanonicalTime,
  type DependencyDeclaration,
  type SourceFactRef,
  type StageKey,
  type TemporalObject,
} from "@immortalis/contracts";

/**
 * Builders for the IM-04 Population side of the temporal declaration (RC-10 "dependency declarations").
 * Population reconciliation enters IM-02's causally engaged dependency graph only when its object is
 * engaged: by its own earned boundary, or — as a dormant object with no boundary — by a consumer's PCB-01
 * barrier. The graph built from these declarations is transient and is never persisted.
 */
export const populationProcessId = (ledgerId: string): string =>
  `population-reconciliation:${ledgerId}`;

/** StageKey of one ordinary reconciliation close: (process, owner operation, prospective result). */
export const populationCloseStage = (ledgerId: string, resultId: string): StageKey => ({
  causal_process_id: populationProcessId(ledgerId),
  owner_operation: { owner: OWNER_POPULATION, operation: POPULATION_OPERATION_RECONCILE },
  prospective_result_id: resultId,
});

export interface PopulationReconcileSpec {
  readonly ledgerId: string;
  /** the prospective result identity of this close (never a horizon, version or counter of retries) */
  readonly resultId: string;
  /** Cohorts whose results this close recomposes (their keys are produced) */
  readonly cohortIds: readonly string[];
  /**
   * External criteria read AS-OF-NOW at the Population composition point (WS-015 §VIII: Criterion Owner →
   * Population is NOW, established at the composition point).
   */
  readonly criteria: readonly SourceFactRef[];
  /** the causal owners' registers of pending consequence envelopes, read AS-OF-NOW (already committed) */
  readonly consequenceSources: readonly SourceFactRef[];
}

export function populationReconcileDeclaration(
  spec: PopulationReconcileSpec,
): DependencyDeclaration {
  const nowRead = (source: SourceFactRef) => ({
    mode: READ_MODE_NOW as typeof READ_MODE_NOW,
    source,
    invalidators: [{ fact_key: source.fact_key }],
  });
  return {
    stage: populationCloseStage(spec.ledgerId, spec.resultId),
    reads: [...spec.criteria, ...spec.consequenceSources].map(nowRead),
    produces: [
      populationLedgerKey(spec.ledgerId),
      populationCloseKey(spec.ledgerId),
      ...spec.cohortIds.map((c) => populationCohortKey(spec.ledgerId, c)),
    ],
    // committing this stage IS the Population ordinary reconciliation close
    declares_close: { name: POPULATION_CLOSE_NAME },
  };
}

export interface PopulationObjectSpec {
  readonly objectId: string;
  readonly ledgerId: string;
  readonly lastResolvedBasis: CanonicalTime;
  /** the one earned boundary, or null for a dormant reconciliation made due only by PCB-01 */
  readonly nextBoundary: { boundary_id: string; at: CanonicalTime } | null;
  readonly declaration: DependencyDeclaration;
}

export function populationTemporalObject(spec: PopulationObjectSpec): TemporalObject {
  return {
    object_id: spec.objectId,
    owning_ref: { owner: OWNER_POPULATION, process_id: populationProcessId(spec.ledgerId) },
    last_resolved_basis: spec.lastResolvedBasis,
    partition: { class: "EXACT-PARTITION" },
    next_boundary: spec.nextBoundary,
    dependencies: [spec.declaration],
    continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
    invalidators: spec.declaration.reads.map((r) => ({ fact_key: r.source.fact_key })),
    information_latency: { creates_epistemic_interruption: false },
  };
}

export { FACET_POPULATION_STATE };
