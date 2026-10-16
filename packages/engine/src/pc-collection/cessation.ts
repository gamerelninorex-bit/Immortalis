import {
  BoundaryIndexSchema,
  PC_COLLECTION_CESSATION_INTENT_KIND,
  PC_COLLECTION_TERMINATION_DISPOSITION,
  PC_OCCUPANCY_OPEN,
  PcCollectionCessationSchema,
  PcCollectionCommitmentSchema,
  ProductionExtractionSchema,
  ProductionPcCollectionTerminationSchema,
  ProductionPcCollectionWorkSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  compareTime,
  fail,
  ok,
  pcCollectionCessationId,
  pcCollectionCessationKey,
  pcCollectionCommitmentKey,
  pcCollectionRequestId,
  productionExtractionKey,
  productionExtractionObjectId,
  productionPcCollectionTerminationKey,
  productionPcCollectionWorkKey,
  temporalObjectKey,
  type CanonicalTime,
  type OwnerFact,
  type PcCollectionCessation,
  type PcCollectionCessationInput,
  type ProductionExtraction,
  type ProductionPcCollectionTermination,
  type ProductionPcCollectionWork,
  type Result,
  type TemporalObject,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { parseAccount } from "../source-drawdown/derive.ts";
import type { FactView } from "../world/pc-locus-custody.ts";
import { pcStandingViolation } from "./derive.ts";
import { extractionCredited, pcOccupancyRecord } from "./state.ts";

/**
 * BLUE clause D-1 — PC Collection Voluntary Cessation — PROVISIONAL CANDIDATE LOWERING (BLUE disposition pin
 * 2026-10-16T04:43:59.946Z; a PROPOSAL, not adopted, not ratified): the single statement of the rules by which a separately
 * confirmed PC choice ceases the SAME in-flight collection, used by admission when a fact is written and again by load verification
 * against the facts as they stood (so the two cannot drift). Nothing here cancels anything by decree, invents a result or awards
 * credit: the PC-side owner records a request; Production alone resolves the terminal status; only then may Population release the
 * PC's individual occupancy and Temporal retire the pending future boundary.
 *
 * What this deliberately is NOT: it is not the F-014B §10 composed stop/continue (clause D-2, DEPENDENCY-BLOCKED: no §10 evaluator,
 * no actionable-knowledge basis exists) and it never judges, infers or waives actionable knowledge. It is lawful only at a canonical
 * time with no unresolved earlier boundary and no held unresolved dependent, so it never forces its way across an unresolved
 * boundary; the canonical time only ever includes resolved history.
 */

const PREREQ = "PREREQUISITE_MISSING" as const;
const refuse = (message: string) => fail(PREREQ, message);

const parse = <T>(
  facts: FactView,
  key: string,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): { fact: OwnerFact; value: T } | undefined => {
  const fact = facts.get(key);
  const v = fact ? schema.safeParse(fact.value) : undefined;
  return fact && v?.success ? { fact, value: v.data as T } : undefined;
};

const clockOf = (facts: FactView): CanonicalTime | undefined => {
  const c = parse(facts, TEMPORAL_STATE_KEY, TemporalStateSchema);
  return c?.value.canonical_time;
};

/** Every committed fact the withdrawal concerns, by identity. */
export interface CessationFacts {
  readonly work: { fact: OwnerFact; value: ProductionPcCollectionWork };
  readonly extraction: { fact: OwnerFact; value: ProductionExtraction };
  readonly commitment: { fact: OwnerFact };
}

export function collectionFacts(
  facts: FactView,
  pcId: string,
  actId: string,
): CessationFacts | undefined {
  const extractionId = pcCollectionRequestId(pcId, actId);
  const work = parse(
    facts,
    productionPcCollectionWorkKey(extractionId),
    ProductionPcCollectionWorkSchema,
  );
  const extraction = parse(
    facts,
    productionExtractionKey(extractionId),
    ProductionExtractionSchema,
  );
  const commitment = facts.get(pcCollectionCommitmentKey(pcId, actId));
  if (!work || !extraction || !commitment) return undefined;
  return { work, extraction, commitment: { fact: commitment } };
}

/** The pending earned boundary of the act's extraction object, as the temporal state holds it. */
export function engagedExtractionObject(
  facts: FactView,
  extractionId: string,
): { fact: OwnerFact; value: TemporalObject } | undefined {
  return parse(
    facts,
    temporalObjectKey(productionExtractionObjectId(extractionId)),
    TemporalObjectSchema,
  );
}

/**
 * Why a stop is not lawful at `now` (null when it is): an unresolved earlier boundary (an index entry at or before the canonical
 * time, or one the comparison cannot place) or a held unresolved dependent leaves earlier events unresolved, and a withdrawal does
 * not force its way across them (F-014B §10 stays a refusal, never an exemption).
 */
export function unresolvedEarlierBoundary(facts: FactView, now: CanonicalTime): string | null {
  const state = parse(facts, TEMPORAL_STATE_KEY, TemporalStateSchema);
  if (!state) return "no canonical temporal basis is established";
  if ((state.value.continuation?.unresolved_dependents.length ?? 0) > 0)
    return "an earlier boundary is unresolved (a held unresolved dependent): a withdrawal refuses to cross it";
  const index = parse(facts, TEMPORAL_BOUNDARY_INDEX_KEY, BoundaryIndexSchema);
  if (!index) return "no boundary index is established";
  for (const e of index.value.entries) {
    const c = compareTime(e.at, now);
    if (c === null || c <= 0)
      return "an earlier or simultaneous boundary is unresolved: a withdrawal refuses to cross it";
  }
  return null;
}

const earned = (facts: FactView, extractionId: string, work: ProductionPcCollectionWork) => {
  const obj = engagedExtractionObject(facts, extractionId);
  return (
    !!obj?.value.next_boundary &&
    compareTime(obj.value.next_boundary.at, work.derivation.completes_at) === 0
  );
};

// ---------------------------------------------------------------------------------------------
// The PC-side cessation request.
// ---------------------------------------------------------------------------------------------

const cessationBasis = (facts: FactView, pcId: string) => {
  const standing = pcStandingViolation(pcId, facts);
  return "reason" in standing ? standing : { binding: standing.binding, custody: standing.custody };
};

/**
 * The cessation request a separately confirmed lawful choice determines, for the ONE in-flight collection of this PC and act. Pure
 * and mechanical: the caller names identities and the authored authority only; every pin is read from committed state and the
 * request time is the canonical time. Refused (never invented) unless the collection is in flight and the stop is safe.
 */
export function deriveCessation(
  input: PcCollectionCessationInput,
  facts: FactView,
): Result<PcCollectionCessation, typeof PREREQ> {
  const { pc_id: pcId, act_id: actId } = input;
  const c = collectionFacts(facts, pcId, actId);
  if (!c)
    return refuse(
      "no started collection of this PC and act is committed: there is nothing to cease",
    );
  const occ = pcOccupancyRecord(facts, pcId);
  if (!occ || occ.value.act_id !== actId || occ.value.status !== PC_OCCUPANCY_OPEN)
    return refuse("the PC is not occupied by this act: there is no in-flight collection to cease");
  const extractionId = c.work.value.work_id;
  if (extractionCredited(facts, extractionId))
    return refuse("this act's output is already closed: a closed collection cannot be stopped");
  if (facts.has(productionPcCollectionTerminationKey(extractionId)))
    return refuse("this act has already been terminated");
  if (facts.has(pcCollectionCessationKey(pcId, actId)))
    return refuse("a cessation of this act was already requested: it is requested once");
  const basis = cessationBasis(facts, pcId);
  if ("reason" in basis)
    return refuse(`the player has no current action authority over this PC: ${basis.reason}`);
  const now = clockOf(facts);
  if (!now) return refuse("no canonical temporal basis is established");
  const sinceStart = compareTime(now, c.work.value.derivation.started_at);
  const toBoundary = compareTime(now, c.work.value.derivation.completes_at);
  if (sinceStart === null || sinceStart < 0 || toBoundary === null || toBoundary >= 0)
    return refuse(
      "the earned boundary is reached or passed: the work is due to close, not to be stopped",
    );
  const unsafe = unresolvedEarlierBoundary(facts, now);
  if (unsafe) return refuse(unsafe);
  if (!earned(facts, extractionId, c.work.value))
    return refuse(
      "the collection's pending boundary is not engaged: it is reconciled before it can be stopped",
    );
  const value = PcCollectionCessationSchema.safeParse({
    cessation_id: pcCollectionCessationId(pcId, actId),
    pc_id: pcId,
    act_id: actId,
    authored_under: input.authored_under,
    intent: {
      kind: PC_COLLECTION_CESSATION_INTENT_KIND,
      target: {
        commitment: { fact_key: c.commitment.fact.key, version: c.commitment.fact.version },
        work: { fact_key: c.work.fact.key, version: c.work.fact.version },
      },
    },
    requested_at: now,
    basis: {
      pinned_versions: {
        binding: basis.binding.version,
        custody: basis.custody.version,
        occupancy: occ.fact.version,
      },
    },
    committer: { owner: "pc_existence", facet: "pc_voluntary_commitment" },
  });
  return value.success ? ok(value.data) : refuse("the result is not a representable cessation");
}

/**
 * What a cessation request must be, judged against committed facts. At admission (`verify` false) it is exactly what the facts
 * derive now; when a loaded campaign is re-verified (`verify` true) only what is SEALED is re-judged (the clock, the occupancy and
 * the index ADVANCE): the identity, the authored authority, the pins and a request time inside the collection's interval.
 */
export function pcCollectionCessationViolation(
  key: string,
  c: PcCollectionCessation,
  facts: FactView,
  verify = false,
): string | null {
  if (
    key !== pcCollectionCessationKey(c.pc_id, c.act_id) ||
    c.cessation_id !== pcCollectionCessationId(c.pc_id, c.act_id)
  )
    return "a cessation is at the slot, and has the identity, derived from its PC and act identities";
  const f = collectionFacts(facts, c.pc_id, c.act_id);
  if (!f) return "a cessation concerns a started collection of this PC and act";
  const commitment = parse(
    facts,
    pcCollectionCommitmentKey(c.pc_id, c.act_id),
    PcCollectionCommitmentSchema,
  );
  if (!commitment) return "the cessation's commitment-of-record is committed";
  if (!canonicalEqual(commitment.value.authored_under, c.authored_under))
    return "a cessation is authored under the same player authority as the commitment it ceases";
  const w = f.work.value.derivation;
  if (
    c.intent.target.commitment.fact_key !== f.commitment.fact.key ||
    c.intent.target.commitment.version !== f.commitment.fact.version ||
    c.intent.target.work.fact_key !== f.work.fact.key ||
    c.intent.target.work.version !== f.work.fact.version
  )
    return "a cessation targets the exact committed commitment and work of the SAME collection: a stale or forged request fails";
  const startedCmp = compareTime(c.requested_at, w.started_at);
  const completesCmp = compareTime(c.requested_at, w.completes_at);
  if (startedCmp === null || startedCmp < 0 || completesCmp === null || completesCmp >= 0)
    return "a cessation is requested inside the collection's interval, strictly before the earned boundary";
  if (verify) return null;
  const derived = deriveCessation(
    { pc_id: c.pc_id, act_id: c.act_id, authored_under: c.authored_under },
    facts,
  );
  if (!derived.ok) return derived.error.message;
  if (!canonicalEqual(derived.value, c))
    return "a cessation is exactly what the committed facts and the canonical time determine";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Production's terminal disposition.
// ---------------------------------------------------------------------------------------------

const floorDiv = (n: number, d: number): number => Math.floor(n / d);

/**
 * Production's terminal disposition of the withdrawn collection, DERIVED from the committed cessation, the work record and the
 * canonical time (never supplied): the elapsed progress is retained as evidence and awards nothing under the all-at-boundary class.
 */
export function deriveTermination(
  pcId: string,
  actId: string,
  facts: FactView,
): Result<ProductionPcCollectionTermination, typeof PREREQ> {
  const c = collectionFacts(facts, pcId, actId);
  if (!c) return refuse("no started collection of this PC and act is committed");
  const cessation = parse(
    facts,
    pcCollectionCessationKey(pcId, actId),
    PcCollectionCessationSchema,
  );
  if (!cessation)
    return refuse(
      "no cessation request of this act is committed: Production terminates nothing unrequested",
    );
  const extractionId = c.work.value.work_id;
  if (extractionCredited(facts, extractionId))
    return refuse("this act's output is already closed: a closed collection cannot be terminated");
  if (facts.has(productionPcCollectionTerminationKey(extractionId)))
    return refuse("this act has already been terminated");
  const occ = pcOccupancyRecord(facts, pcId);
  if (!occ || occ.value.act_id !== actId || occ.value.status !== PC_OCCUPANCY_OPEN)
    return refuse("the PC is not occupied by this act");
  const now = clockOf(facts);
  if (!now) return refuse("no canonical temporal basis is established");
  const w = c.work.value.derivation;
  const afterRequest = compareTime(now, cessation.value.requested_at);
  const beforeBoundary = compareTime(now, w.completes_at);
  if (afterRequest === null || afterRequest < 0 || beforeBoundary === null || beforeBoundary >= 0)
    return refuse(
      "Production terminates only before the earned boundary: a boundary that is reached or passed closes, it is not stopped",
    );
  const unsafe = unresolvedEarlierBoundary(facts, now);
  if (unsafe) return refuse(unsafe);
  if (!earned(facts, extractionId, c.work.value))
    return refuse("the collection's pending boundary is not engaged");
  const account = parseAccount(facts.get(c.extraction.value.account.fact_key));
  if (!account?.open.some((o) => o.extraction_id === extractionId))
    return refuse("the key's account holds no commitment of this extraction to release");
  const elapsed = now.value - w.started_at.value;
  const value = ProductionPcCollectionTerminationSchema.safeParse({
    termination_id: extractionId,
    pc_id: pcId,
    act_id: actId,
    disposition: PC_COLLECTION_TERMINATION_DISPOSITION,
    pins: {
      cessation: {
        fact_key: pcCollectionCessationKey(pcId, actId),
        version: cessationVersion(facts, pcId, actId),
      },
      work: { fact_key: c.work.fact.key, version: c.work.fact.version },
      extraction: {
        fact_key: productionExtractionKey(extractionId),
        version: c.extraction.fact.version,
      },
    },
    derivation: {
      stopped_at: now,
      elapsed: { unit: now.unit, value: elapsed },
      per_cycle: w.per_cycle,
      cycles_fully_elapsed: floorDiv(elapsed, w.per_cycle.value),
      units_credited: 0,
      source_effect: "NONE",
      reserve_effect: "NONE",
      claim: "RELEASED",
    },
  });
  return value.success ? ok(value.data) : refuse("the result is not a representable termination");
}

const cessationVersion = (facts: FactView, pcId: string, actId: string): number =>
  facts.get(pcCollectionCessationKey(pcId, actId))?.version ?? 0;

/**
 * What a termination must be, judged against committed facts. At admission (`verify` false) it is exactly what the facts derive
 * now; on re-verification (`verify` true) only the SEALED record is re-judged (the identity, the pins, the derived progress and a
 * stop time inside the collection's interval and no earlier than the request). It can never carry a credit, a source or Reserve
 * effect, or a boundary: none is representable.
 */
export function pcCollectionTerminationViolation(
  key: string,
  t: ProductionPcCollectionTermination,
  facts: FactView,
  verify = false,
): string | null {
  const extractionId = pcCollectionRequestId(t.pc_id, t.act_id);
  if (
    key !== productionPcCollectionTerminationKey(extractionId) ||
    t.termination_id !== extractionId
  )
    return "a termination is at the key, and has the identity, derived from its PC and act (the extraction identity)";
  const f = collectionFacts(facts, t.pc_id, t.act_id);
  if (!f) return "a termination concerns a started collection of this PC and act";
  const cessation = parse(
    facts,
    pcCollectionCessationKey(t.pc_id, t.act_id),
    PcCollectionCessationSchema,
  );
  if (!cessation)
    return "a termination answers a committed cessation request: nothing is terminated unrequested";
  if (
    t.pins.cessation.fact_key !== cessation.fact.key ||
    t.pins.cessation.version !== cessation.fact.version ||
    t.pins.work.fact_key !== f.work.fact.key ||
    t.pins.work.version !== f.work.fact.version ||
    t.pins.extraction.fact_key !== f.extraction.fact.key ||
    t.pins.extraction.version !== f.extraction.fact.version
  )
    return "a termination pins the exact committed cessation, work and extraction of the SAME collection";
  const w = f.work.value.derivation;
  const d = t.derivation;
  const afterRequest = compareTime(d.stopped_at, cessation.value.requested_at);
  const beforeBoundary = compareTime(d.stopped_at, w.completes_at);
  const afterStart = compareTime(d.stopped_at, w.started_at);
  if (
    afterRequest === null ||
    afterRequest < 0 ||
    beforeBoundary === null ||
    beforeBoundary >= 0 ||
    afterStart === null ||
    afterStart < 0
  )
    return "a termination stops the work inside its interval, no earlier than the request and strictly before the earned boundary";
  const elapsed = d.stopped_at.value - w.started_at.value;
  if (
    !canonicalEqual(d.per_cycle, w.per_cycle) ||
    d.elapsed.unit !== d.stopped_at.unit ||
    d.elapsed.value !== elapsed ||
    d.cycles_fully_elapsed !== floorDiv(elapsed, w.per_cycle.value) ||
    d.cycles_fully_elapsed >= w.cycles
  )
    return "the retained progress is exactly what the elapsed time and the cycle derive: evidence, never a credit";
  if (verify) return null;
  const derived = deriveTermination(t.pc_id, t.act_id, facts);
  if (!derived.ok) return derived.error.message;
  if (!canonicalEqual(derived.value, t))
    return "a termination is exactly what the committed facts and the canonical time determine";
  return null;
}
