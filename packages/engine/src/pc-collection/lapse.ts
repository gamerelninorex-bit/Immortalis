import {
  PC_COLLECTION_LAPSE_DISPOSITION,
  PC_LAPSE_REASON_INCOMPATIBLE,
  PC_LAPSE_REASON_NOT_ESTABLISHED,
  PC_OCCUPANCY_OPEN,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  PcCollectionCommitmentSchema,
  PcPhysicalLocusCustodySchema,
  ProductionPcCollectionLapseSchema,
  ResolutionTransactionSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  WorldSourceConditionSchema,
  compareTime,
  fail,
  ok,
  pcCollectionCessationKey,
  pcCollectionCommitmentKey,
  pcCollectionRequestId,
  pcExistenceContractKey,
  productionExtractionKey,
  productionPcCollectionLapseKey,
  productionPcCollectionTerminationKey,
  productionSourceDeltaStage,
  temporalTransactionKey,
  worldPcLocusCustodyKey,
  type CanonicalTime,
  type OwnerFact,
  type ProductionPcCollectionLapse,
  type ResolutionTransaction,
  type Result,
  type UnresolvedDependent,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { parseAccount } from "../source-drawdown/derive.ts";
import type { FactView } from "../world/pc-locus-custody.ts";
import { collectionFacts, engagedExtractionObject } from "./cessation.ts";
import { pcCollectionPremiseViolation, pcStandingViolation } from "./derive.ts";
import type { ScanFacts } from "./determinations.ts";
import { extractionCredited, pcOccupancyRecord } from "./state.ts";

/**
 * R-4 — BLUE Lapse Settlement v1.2 (NEWLY AUTHORIZED under the Sovereign's standing bounded semantic delegation; Notion pin
 * 2026-10-16T15:11:53.372Z; exact RED v1.1 MODIFY replacement passages; no RED CONCUR page published; independent BLUE review of this code
 * pending): the single statement of when, and as what, Production seals the NON-VOLUNTARY, NON-PRODUCTIVE lapse of an admitted PC collection at
 * its own held earned boundary. Used by admission when the fact is written and again by load verification, so the two cannot drift.
 *
 * What it is: the owner re-evaluation C6 requires at the held boundary, as one new class-level rule: the act's pins are immutable and no
 * re-pin or restoration route exists, so once its requisite eligibility is no longer supported its sole outcome is the lapse. It is derived
 * (never supplied), never evaluated before B, never in response to a horizon and never by player or operator choice.
 *
 * What it is NOT: it claims nothing about whether anything was physically gathered and asserts no elapsed cycle, progress or change time; it
 * credits nothing; it answers no cessation (it is not the D-1 termination); it creates no Event, Observation, Report or notice; it does not
 * resume, advance, consume or cancel the held continuation; it removes, supersedes or retargets no condition. Only an original Temporal request
 * whose `condition` is null (the existing player routes) is in scope: a raw request with a condition stays held under the kernel's authority.
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

// ---------------------------------------------------------------------------------------------
// C-2 — the held lineage an existing held-resume gateway would itself accept.
// ---------------------------------------------------------------------------------------------

export interface HeldLineage {
  /** the held transaction (the one the continuation comes from) and its committed fact */
  readonly held: { readonly fact: OwnerFact; readonly value: ResolutionTransaction };
  /** the one target every transaction of the lineage requested (the target a held-resume choice binds) */
  readonly target: CanonicalTime;
  /** the unresolved dependents the held continuation lists */
  readonly unresolved: readonly UnresolvedDependent[];
}

/**
 * The held lineage, or why there is none. It is exactly the lineage the existing active-PC and NULL-PC held-resume gateways accept (their
 * `heldRequest` rule, which both share): the continuation comes from a committed transaction, and that transaction and every transaction
 * it continued back to its initial one requested exactly ONE target and NO condition (target-only, so a stop condition is not this
 * lineage), and stopped `DEPENDENCY_UNRESOLVED` with unfinished dependents. The player-choice context is the kernel's own schema. The
 * remainder may be empty (the stop was AT the requested target): the gateways bind the target the player chose, not the remainder. A pure
 * function of committed facts, so Production's derivation and Temporal's retirement each re-prove it independently (RED C-2).
 */
export function acceptableHeldLineage(facts: FactView): Result<HeldLineage, typeof PREREQ> {
  const state = parse(facts, TEMPORAL_STATE_KEY, TemporalStateSchema);
  if (!state) return refuse("no canonical temporal basis is established");
  const c = state.value.continuation;
  if (!c || c.unresolved_dependents.length === 0)
    return refuse("no held continuation with unresolved dependents is committed");
  const seen = new Set<string>();
  let held: { fact: OwnerFact; value: ResolutionTransaction } | undefined;
  let target: CanonicalTime | undefined;
  let id: string | null = c.from_transaction;
  while (id !== null) {
    if (seen.has(id)) return refuse("the held lineage is not a chain");
    seen.add(id);
    const tx: { fact: OwnerFact; value: ResolutionTransaction } | undefined = parse(
      facts,
      temporalTransactionKey(id),
      ResolutionTransactionSchema,
    );
    if (
      !tx ||
      tx.value.transaction_id !== id ||
      tx.value.requested.condition !== null ||
      tx.value.requested.target === null ||
      (target !== undefined && !canonicalEqual(tx.value.requested.target, target)) ||
      tx.value.outcome.stop_reason !== "DEPENDENCY_UNRESOLVED" ||
      tx.value.outcome.unresolved_dependents.length === 0
    )
      return refuse(
        "the held lineage is not a target-only, condition-free request stopped with unfinished dependents",
      );
    held ??= tx;
    target ??= tx.value.requested.target;
    id = tx.value.continues;
  }
  if (!held || !target) return refuse("no held transaction is committed");
  if (c.toward !== null && !canonicalEqual(c.toward, target))
    return refuse("the held remainder is not toward the lineage's one requested target");
  return ok({ held, target, unresolved: c.unresolved_dependents });
}

// ---------------------------------------------------------------------------------------------
// T-1 — the closed reason classes.
// ---------------------------------------------------------------------------------------------

/**
 * INCOMPATIBLE only where committed owner facts AFFIRMATIVELY show that the PC is no longer the operative bound PC, no longer holds the
 * pinned physical-locus custody, is no longer at the source's locus, or that the committed source or commitment is absent. Every other
 * reason is NOT_ESTABLISHED (changed or unreadable scene evidence, a Population representation that is INCLUDED, UNKNOWN or stale, a
 * changed mechanism, reach or path-facts version or digest, a binding or custody version change with standing intact), and so is any reason
 * not mapped. The two classes have identical owner effects; neither claims physical failure, and UNKNOWN is never promoted.
 */
export function lapseReasonClass(
  pcId: string,
  actId: string,
  facts: ScanFacts,
): typeof PC_LAPSE_REASON_INCOMPATIBLE | typeof PC_LAPSE_REASON_NOT_ESTABLISHED {
  const bindingFact = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const binding = bindingFact ? PlayerCharacterBindingSchema.safeParse(bindingFact.value) : null;
  if (binding?.success && binding.data.active_pc.entity_id !== pcId)
    return PC_LAPSE_REASON_INCOMPATIBLE;
  const commitment = parse(
    facts,
    pcCollectionCommitmentKey(pcId, actId),
    PcCollectionCommitmentSchema,
  );
  const sourceFact = commitment ? facts.get(commitment.value.intent.source.fact_key) : undefined;
  const source = sourceFact ? WorldSourceConditionSchema.safeParse(sourceFact.value) : undefined;
  if (!commitment || !source?.success) return PC_LAPSE_REASON_INCOMPATIBLE;
  const standing = pcStandingViolation(pcId, facts);
  if ("reason" in standing) {
    // the custody record is committed and well-formed, and the binding names this PC: what fails is the custody itself
    const custodyFact = facts.get(worldPcLocusCustodyKey(pcId));
    const custody = custodyFact ? PcPhysicalLocusCustodySchema.safeParse(custodyFact.value) : null;
    return binding?.success &&
      custody?.success &&
      facts.get(pcExistenceContractKey(pcId)) !== undefined
      ? PC_LAPSE_REASON_INCOMPATIBLE
      : PC_LAPSE_REASON_NOT_ESTABLISHED;
  }
  if (!canonicalEqual(source.data.locality, standing.sourceLocus))
    return PC_LAPSE_REASON_INCOMPATIBLE;
  return PC_LAPSE_REASON_NOT_ESTABLISHED;
}

// ---------------------------------------------------------------------------------------------
// The Production lapse record.
// ---------------------------------------------------------------------------------------------

/**
 * Production's lapse of this act, DERIVED from committed facts alone. Refused (writing nothing) unless every one of these holds:
 * the act is admitted, OPEN-occupied, uncredited, not terminated under D-1, with no cessation request and no earlier lapse; canonical time
 * is exactly the act's own earned boundary B, still pending in its engaged object; the held lineage is one the held-resume gateways would
 * accept; the held transaction stopped at B with this extraction's first stage unresolved by Production's own premise refusal
 * (`VALIDATION_REJECTED`); the C6 premise re-evaluation STILL finds the act's requisite eligibility unsupported (a cured premise lapses
 * nothing: the stage will simply complete on the player's resume); and the key's account still holds this extraction's claim.
 */
export function deriveLapse(
  pcId: string,
  actId: string,
  facts: ScanFacts,
): Result<ProductionPcCollectionLapse, typeof PREREQ> {
  const c = collectionFacts(facts, pcId, actId);
  if (!c) return refuse("no started collection of this PC and act is committed");
  const extractionId = c.work.value.work_id;
  const occ = pcOccupancyRecord(facts, pcId);
  if (!occ || occ.value.act_id !== actId || occ.value.status !== PC_OCCUPANCY_OPEN)
    return refuse("the PC is not occupied by this act");
  if (extractionCredited(facts, extractionId))
    return refuse("this act's output is already closed: a closed collection cannot lapse");
  if (facts.has(productionPcCollectionTerminationKey(extractionId)))
    return refuse("this act was terminated under D-1: the lapse is a distinct class");
  if (facts.has(productionPcCollectionLapseKey(extractionId)))
    return refuse("this act has already lapsed");
  if (facts.has(pcCollectionCessationKey(pcId, actId)))
    return refuse("a cessation of this act was requested: the lapse does not settle it");
  const state = parse(facts, TEMPORAL_STATE_KEY, TemporalStateSchema);
  if (!state) return refuse("no canonical temporal basis is established");
  const w = c.work.value.derivation;
  if (compareTime(state.value.canonical_time, w.completes_at) !== 0)
    return refuse("the lapse is settled at the held earned boundary instant only");
  const object = engagedExtractionObject(facts, extractionId);
  if (
    !object?.value.next_boundary ||
    compareTime(object.value.next_boundary.at, w.completes_at) !== 0
  )
    return refuse("the collection's earned boundary is not pending");
  const lineage = acceptableHeldLineage(facts);
  if (!lineage.ok) return refuse(lineage.error.message);
  const { held, unresolved } = lineage.value;
  const stage = productionSourceDeltaStage(extractionId);
  const refused = (list: readonly UnresolvedDependent[]) =>
    list.some((d) => canonicalEqual(d.stage, stage) && d.reason === "VALIDATION_REJECTED");
  if (
    compareTime(held.value.outcome.actual_stop, w.completes_at) !== 0 ||
    !refused(held.value.outcome.unresolved_dependents) ||
    !refused(unresolved)
  )
    return refuse(
      "the held transaction did not stop at this act's boundary on Production's own premise refusal",
    );
  if (
    !held.value.engaged.some(
      (e) => e.boundary === "STILL_ACTIVE" && e.object_id === object.value.object_id,
    )
  )
    return refuse("the held transaction did not engage this act's object");
  if (pcCollectionPremiseViolation(c.work.value, facts) === null)
    return refuse("the act's premises still hold: nothing lapses");
  const account = parseAccount(facts.get(c.extraction.value.account.fact_key));
  if (!account?.open.some((o) => o.extraction_id === extractionId))
    return refuse("the key's account holds no commitment of this extraction to release");
  const value = ProductionPcCollectionLapseSchema.safeParse({
    lapse_id: extractionId,
    pc_id: pcId,
    act_id: actId,
    disposition: PC_COLLECTION_LAPSE_DISPOSITION,
    reason: lapseReasonClass(pcId, actId, facts),
    pins: {
      commitment: { fact_key: c.commitment.fact.key, version: c.commitment.fact.version },
      work: { fact_key: c.work.fact.key, version: c.work.fact.version },
      extraction: {
        fact_key: productionExtractionKey(extractionId),
        version: c.extraction.fact.version,
      },
      stage,
      held_transaction: { fact_key: held.fact.key, version: held.fact.version },
    },
    derivation: {
      started_at: w.started_at,
      boundary_at: w.completes_at,
      per_cycle: w.per_cycle,
      units_credited: 0,
      source_effect: "NONE",
      reserve_effect: "NONE",
      claim: "RELEASED",
    },
  });
  return value.success ? ok(value.data) : refuse("the result is not a representable lapse");
}

/**
 * What a lapse must be, judged against committed facts. At admission (`verify` false) it is exactly what the facts derive now. On load
 * verification (`verify` true, RED C-3) ONLY the SEALED record is re-judged against its immutable pins: the identity, the exact sealed
 * commitment/work/extraction it pins, the sealed held transaction it pins (condition-free, target-only, stopped at the boundary with the
 * pinned stage unresolved) and the plan data it states. The premise judgment is NOT re-derived from facts that moved afterwards.
 */
export function pcCollectionLapseViolation(
  key: string,
  l: ProductionPcCollectionLapse,
  facts: ScanFacts,
  verify = false,
): string | null {
  const extractionId = pcCollectionRequestId(l.pc_id, l.act_id);
  if (key !== productionPcCollectionLapseKey(extractionId) || l.lapse_id !== extractionId)
    return "a lapse is at the key, and has the identity, derived from its PC and act (the extraction identity)";
  const f = collectionFacts(facts, l.pc_id, l.act_id);
  if (!f) return "a lapse concerns a started collection of this PC and act";
  if (
    l.pins.commitment.fact_key !== f.commitment.fact.key ||
    l.pins.commitment.version !== f.commitment.fact.version ||
    l.pins.work.fact_key !== f.work.fact.key ||
    l.pins.work.version !== f.work.fact.version ||
    l.pins.extraction.fact_key !== f.extraction.fact.key ||
    l.pins.extraction.version !== f.extraction.fact.version
  )
    return "a lapse pins the exact committed commitment, work and extraction of the SAME collection";
  if (!canonicalEqual(l.pins.stage, productionSourceDeltaStage(extractionId)))
    return "a lapse pins the extraction's own first stage";
  const w = f.work.value.derivation;
  const d = l.derivation;
  if (
    !canonicalEqual(d.started_at, w.started_at) ||
    !canonicalEqual(d.boundary_at, w.completes_at) ||
    !canonicalEqual(d.per_cycle, w.per_cycle)
  )
    return "a lapse states only the plan data of its work: the interval start, the held boundary and the per-cycle figure";
  const heldFact = facts.get(l.pins.held_transaction.fact_key);
  const tx = heldFact ? ResolutionTransactionSchema.safeParse(heldFact.value) : undefined;
  if (
    !heldFact ||
    !tx?.success ||
    heldFact.version !== l.pins.held_transaction.version ||
    heldFact.key !== temporalTransactionKey(tx.data.transaction_id) ||
    tx.data.requested.condition !== null ||
    tx.data.requested.target === null ||
    tx.data.outcome.stop_reason !== "DEPENDENCY_UNRESOLVED" ||
    compareTime(tx.data.outcome.actual_stop, w.completes_at) !== 0 ||
    !tx.data.outcome.unresolved_dependents.some(
      (u) => canonicalEqual(u.stage, l.pins.stage) && u.reason === "VALIDATION_REJECTED",
    )
  )
    return "a lapse pins the sealed, condition-free transaction that stopped at the boundary with its first stage refused";
  if (verify) return null;
  const derived = deriveLapse(l.pc_id, l.act_id, facts);
  if (!derived.ok) return derived.error.message;
  if (!canonicalEqual(derived.value, l))
    return "a lapse is exactly what the committed facts derive: never a caller's statement";
  return null;
}

/**
 * C-2 for Temporal: independently of Production's derivation, retirement requires that a held lineage which an existing active-PC or NULL-PC
 * held-resume gateway would accept is still held (the settlement leaves it untouched). It need not be the very transaction the lapse pinned:
 * a raw kernel continuation may have re-held the same target-only request, and the sealed lapse stays judged against its own pins (C-3).
 */
export function lapseLineageHolds(facts: FactView): string | null {
  const lineage = acceptableHeldLineage(facts);
  return lineage.ok ? null : lineage.error.message;
}

// ---------------------------------------------------------------------------------------------
// C-1 — the cause is judged against the crossing transaction's admissible basis.
// ---------------------------------------------------------------------------------------------

/** The owner spaces whose facts the C6 premise judgment can read (the PC's standing, the scene, Population, the source, the mechanism). */
const PREMISE_INPUT_PREFIXES = [
  "world/",
  "world-state/",
  "population/",
  "population-pc/",
  "population-scope/",
  "pc/",
  "role-registry/",
] as const;

/**
 * RED C-1. The decisive premise is judged against what was committed BEFORE the crossing transaction opened (an earlier-than-B cause);
 * a premise-input fact whose current version was committed at or after that opening is NOT an admissible cause, because the engine
 * cannot tell a post-stop (or undeclared same-instant sibling) change from a decisive one, and a lapse is never derived from it. A fact
 * committed after the lapse itself (`until`) is not the lapse's basis at all. `revisionOf` is the commit revision of a fact's current
 * version (the store's receipt); a fact with no revision is judged as post-opening (fail closed).
 */
export function lapseBasisViolation(
  facts: Iterable<OwnerFact>,
  openedAt: number,
  until: number | null,
  revisionOf: (f: OwnerFact) => number | undefined,
): string | null {
  for (const f of facts) {
    if (!PREMISE_INPUT_PREFIXES.some((p) => f.key.startsWith(p))) continue;
    const r = revisionOf(f);
    if (r === undefined)
      return `the commit revision of ${f.key} is unknown: no lapse is derived from it`;
    if (r >= openedAt && (until === null || r < until))
      return `${f.key} changed after the crossing transaction opened: a later or same-instant change is not an admissible cause`;
  }
  return null;
}
