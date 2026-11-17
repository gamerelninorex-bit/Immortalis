import {
  BoundaryIndexSchema,
  FACET_POPULATION_STATE,
  OWNER_POPULATION,
  POPULATION_CLOSE_BASIS,
  PopulationBasisSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  TransactionAuthoritySchema,
  compareTime,
  populationCloseKey,
  populationCohortKey,
  populationLedgerKey,
  temporalObjectKey,
  temporalTransactionAuthorityKey,
  timeEquals,
  type CommitGroup,
  type DependencyDeclaration,
  type ReconciliationClose,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import { analyzeStageGraph, type GraphEdge } from "../temporal/graph.ts";
import { stageGroupId, stageId, stageIntentId } from "../temporal/identity.ts";
import { populationBarrierEvaluator } from "./barrier.ts";

/**
 * WS-001 §32 / F-017 §§3–4: a Population close is an opened, engaged owner stage, not just valid math.
 * Both live admission and historical replay call this pure predicate on the ACTUAL pre-state. In
 * particular, a genuine interrupted close precedes the transaction's final clock/object writes.
 * Nothing here reconstructs that pre-state from today's snapshot, adds an authority record, changes
 * stage identity, or lists campaign facts. Engagement follows the existing active boundary index and
 * the engaged consumers' explicitly named PCB-01 objects, as in TemporalCoordinator.
 */
export function populationStageAuthorityViolation(
  group: CommitGroup,
  state: CampaignState,
  close: ReconciliationClose,
): string | null {
  const { facts } = state;
  const stage = close.close_stage,
    point = close.resolution_point;
  const authorityError = stageAuthorityViolation(group, stage, facts, point, "ADMISSION");
  if (authorityError) return authorityError;
  const authorityFact = facts.get(
    temporalTransactionAuthorityKey(group.cause.slice("transaction:".length)),
  )!;
  const authority = TransactionAuthoritySchema.parse(authorityFact.value);
  const clockFact = facts.get(TEMPORAL_STATE_KEY);
  const clock = TemporalStateSchema.safeParse(clockFact?.value);
  // A held unresolved boundary may resume AT the opening basis. It is neither a new
  // past boundary nor a replayed close: the previous transaction credited no such stage.
  const fromOpening = compareTime(authority.opening.basis_time, point);
  const continuingAtOpening =
    fromOpening === 0 &&
    authority.continues !== null &&
    clock.success &&
    clock.data.continuation?.from_transaction === authority.continues;
  if (
    !clock.success ||
    clockFact!.version !== authority.opening.state_version ||
    !timeEquals(clock.data.canonical_time, authority.opening.basis_time) ||
    (fromOpening !== -1 && !continuingAtOpening)
  ) {
    return "a Population close belongs to its transaction's still-current opening and its engaged resolution point (including a held continuation)";
  }
  if (
    group.owner !== OWNER_POPULATION ||
    group.facet !== FACET_POPULATION_STATE ||
    !canonicalEqual(close.close_basis, POPULATION_CLOSE_BASIS) ||
    !group.writes.some((w) => w.key === populationLedgerKey(close.ledger_id)) ||
    !group.writes.some((w) => w.key === populationCloseKey(close.ledger_id)) ||
    group.writes.some((w) => {
      const r = resolveKey(w.key);
      return (
        !r ||
        r.kind.owner !== OWNER_POPULATION ||
        r.ids[0] !== close.ledger_id ||
        w.owner !== OWNER_POPULATION ||
        w.facet !== FACET_POPULATION_STATE
      );
    })
  ) {
    return "a Population stage advances its own ledger and ordinary close, with only that ledger's Cohort results";
  }
  const index = BoundaryIndexSchema.safeParse(facts.get(TEMPORAL_BOUNDARY_INDEX_KEY)?.value);
  if (!index.success) return "a Population stage has an active Temporal boundary index";
  const ledgerKey = populationLedgerKey(close.ledger_id);
  const priorFact = facts.get(ledgerKey);
  const prior = PopulationBasisSchema.safeParse(priorFact?.value);
  const next = PopulationBasisSchema.safeParse(
    group.writes.find((w) => w.key === ledgerKey)?.value,
  );
  if (
    !prior.success ||
    !next.success ||
    next.data.ledger_id !== close.ledger_id ||
    next.data.basis_stamp.basis.kind !== "RECONCILIATION_CLOSE" ||
    !timeEquals(next.data.basis_stamp.basis.resolution_point, point)
  ) {
    return "a Population stage advances its ledger at the resolution point of its ordinary close";
  }
  // Earlier closes of THIS ledger are required predecessors, not independent work. Objects/index
  // entries are retired only by the final kernel group, so an earlier close in the same interrupted
  // transaction may already be committed. Its ledger basis proves that, without a new history API:
  // at the predecessor's point it must bear that exact stage; a later basis was itself checked by
  // this rule against its pre-state. Replay establishes the same induction for every old close.
  const before = prior.data.basis_stamp.basis;
  const beforePoint =
    before.kind === "RECONCILIATION_CLOSE" ? before.resolution_point : before.point;
  if (compareTime(beforePoint, point) !== -1) {
    return "a Population stage closes strictly after its established opening or previous reconciliation basis";
  }
  for (const entry of index.data.entries) {
    if (compareTime(entry.at, point) !== -1) continue;
    const object = TemporalObjectSchema.safeParse(
      facts.get(temporalObjectKey(entry.object_id))?.value,
    );
    if (!object.success) continue;
    for (const predecessor of object.data.dependencies) {
      if (
        predecessor.stage.owner_operation.owner !== OWNER_POPULATION ||
        !predecessor.produces.includes(ledgerKey)
      )
        continue;
      const order =
        before.kind === "RECONCILIATION_CLOSE"
          ? compareTime(entry.at, before.resolution_point)
          : null;
      if (
        order === null ||
        order === 1 ||
        (order === 0 &&
          (priorFact!.provenance.group_id !== stageGroupId(predecessor.stage) ||
            priorFact!.provenance.intent_id !== stageIntentId(predecessor.stage)))
      ) {
        return "a Population close waits for every earlier declared close of the same ledger";
      }
    }
  }
  const condition = authority.requested.condition;
  if (condition) {
    const stop = index.data.entries.find(
      (e) => e.object_id === condition.object_id && e.boundary_id === condition.boundary_id,
    );
    if (!stop || compareTime(point, stop.at) === null || compareTime(point, stop.at) === 1) {
      return "a Population stage is reachable before its transaction's requested stop condition";
    }
  }

  const declarations: DependencyDeclaration[] = [];
  const engagedIds = new Set<string>();
  for (const entry of index.data.entries.filter((e) => timeEquals(e.at, point))) {
    const parsed = TemporalObjectSchema.safeParse(
      facts.get(temporalObjectKey(entry.object_id))?.value,
    );
    if (
      !parsed.success ||
      !parsed.data.next_boundary ||
      parsed.data.next_boundary.boundary_id !== entry.boundary_id ||
      !timeEquals(parsed.data.next_boundary.at, point)
    ) {
      return "a Population stage's engaged frontier holds its earned indexed boundary";
    }
    engagedIds.add(entry.object_id);
    declarations.push(...parsed.data.dependencies);
  }

  // A dormant reconciliation is engaged only by a genuinely due, indexed consumer's PCB-01 barrier.
  // At this pre-state its triggering envelopes have not yet been consumed. Recovery of a committed
  // stage uses its original receipt before admission, so it never needs a newly fabricated trigger.
  const dueIds = new Set<string>();
  for (const d of [...declarations]) {
    const barrier = d.pending_consequence_barrier;
    if (!barrier || dueIds.has(barrier.reconciliation_object_id)) continue;
    const objectFact = facts.get(temporalObjectKey(barrier.reconciliation_object_id));
    const parsed = TemporalObjectSchema.safeParse(objectFact?.value);
    if (
      !parsed.success ||
      objectFact!.version !== 1 ||
      parsed.data.next_boundary !== null ||
      engagedIds.has(barrier.reconciliation_object_id) ||
      compareTime(parsed.data.last_resolved_basis, point) !== -1 ||
      !populationBarrierEvaluator.evaluate(barrier, point, (k) => facts.get(k)).due
    )
      continue;
    // A barrier for another Population scope cannot authorize this ledger's dormant close.
    const candidate = parsed.data.dependencies.find((candidate) =>
      canonicalEqual(candidate.stage, stage),
    );
    if (
      candidate &&
      (barrier.population.ledger_id !== close.ledger_id ||
        !canonicalEqual(barrier.close_basis, close.close_basis) ||
        (barrier.population.cohort_id !== null &&
          !candidate.produces.includes(
            populationCohortKey(close.ledger_id, barrier.population.cohort_id),
          )))
    )
      continue;
    dueIds.add(barrier.reconciliation_object_id);
    declarations.push(...parsed.data.dependencies);
  }
  const matches = declarations.filter((d) => canonicalEqual(d.stage, stage));
  if (matches.length !== 1)
    return "a Population close is declared by exactly one engaged Temporal object";
  const declaration = matches[0]!;
  if (
    declaration.declares_close?.name !== close.close_basis.name ||
    !canonicalEqual(stage.owner_operation, close.close_basis.producer) ||
    !canonicalEqual([...declaration.produces].sort(), group.writes.map((w) => w.key).sort()) ||
    group.reads.length !== declaration.reads.length ||
    group.depends_on.length !== declaration.reads.length + 1 ||
    group.depends_on.at(-1) !== authorityFact.provenance.group_id
  ) {
    return "a Population close publishes exactly its engaged declaration and depends on its opened authority";
  }

  const producedBy = new Map(declarations.flatMap((d) => d.produces.map((k) => [k, d] as const)));
  const edges: GraphEdge[] = [];
  for (const d of declarations)
    for (const read of d.reads) {
      const producer = producedBy.get(read.source.fact_key);
      if (producer)
        edges.push({
          from: stageId(producer.stage),
          to: stageId(d.stage),
          mode: read.mode === "AS-OF-NOW" ? "NOW" : "CLOSE",
        });
    }
  if (
    analyzeStageGraph(
      declarations.map((d) => ({ id: stageId(d.stage), stage: d.stage })),
      edges,
    ).blocked.has(stageId(stage))
  ) {
    return "a Population stage waits for its lawful dependency frontier (no unresolved instantaneous cycle)";
  }
  for (let i = 0; i < declaration.reads.length; i++) {
    const read = declaration.reads[i]!,
      pin = group.reads[i]!;
    const fact = facts.get(read.source.fact_key);
    if (
      !fact ||
      fact.owner !== read.source.owner ||
      pin.key !== fact.key ||
      pin.version !== fact.version ||
      group.depends_on[i] !== fact.provenance.group_id
    ) {
      return "a Population stage reads each declared source at its current version and depends on its committed predecessor";
    }
    const producer = producedBy.get(fact.key);
    if (
      producer &&
      (fact.provenance.group_id !== stageGroupId(producer.stage) ||
        fact.provenance.intent_id !== stageIntentId(producer.stage))
    ) {
      return "a Population stage waits for the engaged source producer to commit, rather than reading its earlier value";
    }
    if (
      read.mode === "AS-OF-DECLARED-CLOSE" &&
      (!producer ||
        producer.declares_close?.name !== read.close_basis.name ||
        !canonicalEqual(producer.stage.owner_operation, read.close_basis.producer))
    ) {
      return "a Population CLOSE input has its declared producer's committed named close";
    }
  }
  return null;
}
