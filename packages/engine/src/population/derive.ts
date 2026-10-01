import {
  burdenLocus,
  canonicalJson,
  compareTime,
  fail,
  indexedPlace,
  ok,
  timeAtOrBefore,
  type BasisStamp,
  type CanonicalTime,
  type Cardinality,
  type CohortRef,
  type CohortResult,
  type ConsequenceEnvelope,
  type ExternalCriterion,
  type PopulationBasis,
  type PopulationUnit,
  type ReconciliationClose,
  type Result,
  type SourceFactRef,
} from "@immortalis/contracts";

/**
 * Pure Population derivation (IM-04). Nothing here reads a store, a clock or a random source, and nothing
 * here is a rate, coefficient or default: it is exact arithmetic over typed units and typed envelopes.
 * The reconciliation operation computes with it and IM-11 admission recomputes with it, so the two cannot
 * drift.
 */

const byId = <T extends { readonly unit_id: string }>(a: T, b: T): number =>
  a.unit_id < b.unit_id ? -1 : a.unit_id > b.unit_id ? 1 : 0;

// ---------------------------------------------------------------------------------------------
// Envelope eligibility and application (WS-001 §1, RC-08)
// ---------------------------------------------------------------------------------------------

export type DeriveErrorCode =
  "ENVELOPE_INVALID" | "BASIS_INCOMPARABLE" | "DUPLICATE_UNIT" | "UNIT_ABSENT";

/**
 * Eligible = addressed to this ledger, effective at or before the resolution point, and not yet
 * consumed. An envelope effective after the resolution point is not eligible; it stays pending. Returns
 * a failure when an envelope's basis is not comparable with the resolution point (different unit): no
 * time is guessed.
 */
export function eligibleEnvelopes(
  envelopes: readonly ConsequenceEnvelope[],
  ledger: PopulationBasis,
  point: CanonicalTime,
): Result<readonly ConsequenceEnvelope[], DeriveErrorCode> {
  const consumed = new Set(ledger.consumed_envelopes);
  const out: ConsequenceEnvelope[] = [];
  for (const e of envelopes) {
    if (e.downstream_consumer.ledger_id !== ledger.ledger_id || consumed.has(e.envelope_id))
      continue;
    const c = compareTime(e.basis.at, point);
    if (c === null)
      return fail("BASIS_INCOMPARABLE", "an envelope's basis is in another unit than the point", {
        envelope_id: e.envelope_id,
      });
    if (timeAtOrBefore(e.basis.at, point)) out.push(e);
  }
  return ok(
    out.sort((a, b) =>
      a.basis.at.value !== b.basis.at.value
        ? a.basis.at.value - b.basis.at.value
        : a.envelope_id < b.envelope_id
          ? -1
          : 1,
    ),
  );
}

/** Entry/Exit records before the register each came from is attached (`withSources`). */
export type EntryRec = Omit<ReconciliationClose["entries"][number], "source">;
export type ExitRec = Omit<ReconciliationClose["exits"][number], "source">;

export interface Applied {
  readonly units: readonly PopulationUnit[];
  readonly entries: readonly EntryRec[];
  readonly exits: readonly ExitRec[];
  readonly consumed: readonly string[];
}

/** Attaches to each record the declared register its envelope came from (by envelope id). */
export function withSources(
  a: Applied,
  sourceOf: ReadonlyMap<string, SourceFactRef>,
): { entries: ReconciliationClose["entries"]; exits: ReconciliationClose["exits"] } | null {
  const entries = a.entries.map((e) => ({ ...e, source: sourceOf.get(e.envelope_id) }));
  const exits = a.exits.map((e) => ({ ...e, source: sourceOf.get(e.envelope_id) }));
  if ([...entries, ...exits].some((r) => r.source === undefined)) return null;
  return {
    entries: entries as ReconciliationClose["entries"],
    exits: exits as ReconciliationClose["exits"],
  };
}

/**
 * The Entry envelopes that QUALIFY for a Cohort (WS-015 §VI–VII): they land where the Cohort is indexed
 * and, for an external criterion, are in the Criterion Owner's set established at the resolution point.
 * Evaluated per envelope, so a unit that is later Exited in the same close is still shown to have
 * qualified. An unquantified Cohort has no discrete membership to qualify for.
 */
export function qualifyingEntrants(
  ref: CohortRef,
  eligible: readonly ConsequenceEnvelope[],
  criterion: ExternalCriterion | null,
): string[] {
  if (ref.cardinality_semantics === "UNQUANTIFIED") return [];
  const qualifying = criterion ? new Set(criterion.qualifying_unit_ids) : null;
  return eligible
    .flatMap((e) =>
      e.consequence.kind === "ENTRY" ? [{ id: e.envelope_id, u: e.consequence.unit }] : [],
    )
    .filter(({ u }) => indexedPlace(u, ref.indexed_fact) === ref.scope.place)
    .filter(({ u }) => qualifying === null || qualifying.has(u.unit_id))
    .map(({ id }) => id)
    .sort();
}

/**
 * Applies typed Entries and Exits to the opening units. Every unit enters at most once and leaves only
 * if it is present: Population records the membership change, it never creates an Exit for a unit that
 * is not accounted. The same envelope id is never applied twice.
 */
export function applyEnvelopes(
  opening: readonly PopulationUnit[],
  envelopes: readonly ConsequenceEnvelope[],
): Result<Applied, DeriveErrorCode> {
  const units = new Map(opening.map((u) => [u.unit_id, u]));
  const seen = new Set<string>();
  const entries: EntryRec[] = [];
  const exits: ExitRec[] = [];
  const entriesOut = entries;
  const exitsOut = exits;
  for (const e of envelopes) {
    if (seen.has(e.envelope_id))
      return fail("ENVELOPE_INVALID", "an envelope may be applied only once", {
        envelope_id: e.envelope_id,
      });
    seen.add(e.envelope_id);
    const c = e.consequence;
    if (c.kind === "ENTRY") {
      if (units.has(c.unit.unit_id))
        return fail("DUPLICATE_UNIT", "a unit already accounted cannot enter again", {
          unit_id: c.unit.unit_id,
        });
      units.set(c.unit.unit_id, c.unit);
      entriesOut.push({
        envelope_id: e.envelope_id,
        unit_id: c.unit.unit_id,
        adapter: c.adapter,
        causing_event: e.causing_event,
        effective_at: e.basis.at,
      });
    } else {
      if (!units.has(c.unit_id))
        return fail("UNIT_ABSENT", "an exit must name a unit the ledger accounts", {
          unit_id: c.unit_id,
        });
      units.delete(c.unit_id);
      exitsOut.push({
        envelope_id: e.envelope_id,
        unit_id: c.unit_id,
        adapter: c.adapter,
        disposition: c.disposition,
        continuity_ref: c.continuity_ref,
        causing_event: e.causing_event,
        effective_at: e.basis.at,
      });
    }
  }
  return ok({
    units: [...units.values()].sort(byId),
    entries,
    exits,
    consumed: [...seen].sort(),
  });
}

// ---------------------------------------------------------------------------------------------
// Cohort derivation (WS-015 §VI–§IX): Population composes its units with the Criterion Owner's fact at
// ONE basis, and is the sole producer of the resulting count/membership.
// ---------------------------------------------------------------------------------------------

export function cohortMembers(
  ref: CohortRef,
  units: readonly PopulationUnit[],
  criterion: ExternalCriterion | null,
): readonly string[] {
  const qualifying = criterion ? new Set(criterion.qualifying_unit_ids) : null;
  return units
    .filter((u) => indexedPlace(u, ref.indexed_fact) === ref.scope.place)
    .filter((u) => qualifying === null || qualifying.has(u.unit_id))
    .map((u) => u.unit_id)
    .sort();
}

/**
 * The derived result of one Cohort at one basis. The caller has already verified that the criterion (when
 * external) is established at the same resolution point as the Population units; this never mixes bases.
 */
export function composeCohortResult(
  ref: CohortRef,
  units: readonly PopulationUnit[],
  criterion: ExternalCriterion | null,
  stamp: BasisStamp,
): CohortResult {
  if (ref.cardinality_semantics === "UNQUANTIFIED")
    return { cardinality: { semantics: "UNQUANTIFIED" }, members: null, basis_stamp: stamp };
  const members = cohortMembers(ref, units, criterion);
  return {
    cardinality: { semantics: "EXACT", count: members.length },
    members: [...members],
    basis_stamp: stamp,
  };
}

// ---------------------------------------------------------------------------------------------
// Cohort arithmetic (WS-015 §IX, §X). Overlapping Cohorts are non-additive unless a declared
// partition proves otherwise; UNQUANTIFIED never enters conserved or additive calculation; every view
// in one calculation is composed at the same single basis.
// ---------------------------------------------------------------------------------------------

export type ArithmeticErrorCode =
  | "UNQUANTIFIED_IN_ARITHMETIC"
  | "OVERLAP_NOT_ADDITIVE"
  | "PARTITION_MISMATCH"
  | "MIXED_BASIS"
  | "RESULT_ABSENT"
  | "EMPTY";

export interface CohortView {
  readonly ref: CohortRef;
  readonly result: CohortResult | null;
}

const basisKey = (s: BasisStamp): string => canonicalJson(s.basis);

/**
 * The total of Cohorts that a declared partition proves additive: siblings of ONE partition, indexed on
 * the same Population fact, composed at one basis, none UNQUANTIFIED. Anything else fails closed — in
 * particular two overlapping views, a view added to a partition, a residence Cohort added to a burden
 * Cohort, or a closed Population basis combined with another point.
 */
export function additiveTotal(
  views: readonly CohortView[],
): Result<Cardinality, ArithmeticErrorCode> {
  const first = views[0];
  if (!first) return fail("EMPTY", "nothing to add");
  for (const v of views) {
    if (
      v.ref.cardinality_semantics === "UNQUANTIFIED" ||
      v.result?.cardinality.semantics === "UNQUANTIFIED"
    )
      return fail(
        "UNQUANTIFIED_IN_ARITHMETIC",
        "an unquantified Cohort cannot enter additive arithmetic",
        {
          cohort_id: v.ref.cohort_id,
        },
      );
    if (!v.result)
      return fail("RESULT_ABSENT", "a Cohort that was never composed has no total", {
        cohort_id: v.ref.cohort_id,
      });
  }
  for (const v of views) {
    if (v.ref.overlap.declaration !== "DISJOINT_PARTITION")
      return fail("OVERLAP_NOT_ADDITIVE", "overlapping Cohort totals are not additive", {
        cohort_id: v.ref.cohort_id,
      });
  }
  const part = (v: CohortView) =>
    v.ref.overlap.declaration === "DISJOINT_PARTITION" ? v.ref.overlap.partition_id : "";
  for (const v of views) {
    if (
      part(v) !== part(first) ||
      v.ref.indexed_fact !== first.ref.indexed_fact ||
      v.ref.scope.ledger_id !== first.ref.scope.ledger_id
    )
      return fail(
        "PARTITION_MISMATCH",
        "only disjoint siblings of one declared partition are additive",
        {
          cohort_id: v.ref.cohort_id,
        },
      );
  }
  for (const v of views) {
    if (
      basisKey((v.result as CohortResult).basis_stamp) !==
      basisKey((first.result as CohortResult).basis_stamp)
    )
      return fail("MIXED_BASIS", "Cohort results composed at different bases cannot be combined", {
        cohort_id: v.ref.cohort_id,
      });
  }
  let lower = 0;
  let upper = 0;
  let exact = true;
  for (const v of views) {
    const c = (v.result as CohortResult).cardinality;
    if (c.semantics === "EXACT") {
      lower += c.count;
      upper += c.count;
    } else if (c.semantics === "BOUNDED") {
      exact = false;
      lower += c.lower;
      upper += c.upper;
    }
  }
  return ok(exact ? { semantics: "EXACT", count: lower } : { semantics: "BOUNDED", lower, upper });
}

/**
 * Population-produced intersection of two composed Cohorts (Criterion × Population-partition share):
 * exact member intersection, at one basis only. Both must be EXACT; a mixed basis fails closed.
 */
export function intersectionCount(
  a: CohortView,
  b: CohortView,
): Result<number, ArithmeticErrorCode> {
  for (const v of [a, b]) {
    if (
      v.ref.cardinality_semantics === "UNQUANTIFIED" ||
      v.result?.cardinality.semantics === "UNQUANTIFIED"
    )
      return fail(
        "UNQUANTIFIED_IN_ARITHMETIC",
        "an unquantified Cohort cannot enter conserved arithmetic",
        {
          cohort_id: v.ref.cohort_id,
        },
      );
    if (!v.result?.members)
      return fail("RESULT_ABSENT", "a Cohort without exact members has no intersection", {
        cohort_id: v.ref.cohort_id,
      });
  }
  const ra = a.result as CohortResult;
  const rb = b.result as CohortResult;
  if (basisKey(ra.basis_stamp) !== basisKey(rb.basis_stamp))
    return fail("MIXED_BASIS", "Cohort results composed at different bases cannot be intersected");
  const other = new Set(rb.members);
  return ok((ra.members ?? []).filter((m) => other.has(m)).length);
}

/** Burden-Locus carrier check (WS-015 §XII): each unit is counted exactly once across carriers. */
export function burdenCarrierCounts(units: readonly PopulationUnit[]): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const u of units) m.set(burdenLocus(u), (m.get(burdenLocus(u)) ?? 0) + 1);
  return m;
}
