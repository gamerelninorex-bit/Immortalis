import {
  BoundaryIndexSchema,
  GM_WAIT_IF6B_POLICY,
  GM_WAIT_IF6B_QUIET_SEAL_SEGMENT,
  GmWaitStagedTransactionSchema,
  JsonValueSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  compareTime,
  timeEquals,
  type BoundaryIndex,
  type GmWaitMarker,
  type TemporalState,
  type CommitGroup,
  type GmWaitTransactionAuthority,
  type SourceRef,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import {
  if6bDueObjects,
  if6bOccurrenceBoundary,
  if6bWorkHorizon,
  type If6bCommittedStage,
} from "./if6b-stage.ts";

type SettlementWrite = {
  key: string;
  version: number;
  value: CommitGroup["writes"][number]["value"];
};

/**
 * G1: the ordinary quiet seal (R-5(2) TARGET_REACHED). It exists only under the history identity that carries the G1 segment immediately before the
 * terminal IF-6b segment, so an earlier identity refuses it. Nothing is due: the active boundary index parses (so it is sorted, duplicate-free and in
 * one unit) AND every entry lies STRICTLY after the target, which refuses an incomparable entry, a boundary exactly at the target and anything earlier.
 * A missing, malformed or contradictory index is never read as "nothing due". Time moves to the target and nowhere else: the clock and the seal are the
 * only writes, so no object, boundary or index fact is touched and no boundary is retired.
 */
function quietSettlement(
  authority: GmWaitTransactionAuthority,
  marker: GmWaitMarker,
  index: BoundaryIndex,
  kernelRule: SourceRef,
) {
  const target = authority.requested.target;
  if (
    !marker.policy.history_verification_id.endsWith(
      GM_WAIT_IF6B_QUIET_SEAL_SEGMENT + "+" + GM_WAIT_IF6B_POLICY,
    ) ||
    index.entries.some((entry) => compareTime(entry.at, target) !== 1)
  )
    return undefined;
  const { publication, ...opening } = authority;
  void publication;
  const candidate = GmWaitStagedTransactionSchema.safeParse({
    ...opening,
    stage_policy: GM_WAIT_IF6B_POLICY,
    engaged: [],
    boundaries_crossed: [],
    stages: [],
    rule_versions: [kernelRule],
    outcome: {
      actual_stop: target,
      stop_reason: "TARGET_REACHED",
      remainder: null,
      unresolved_dependents: [],
    },
  });
  if (!candidate.success) return undefined;
  const nextClock: TemporalState = {
    canonical_time: target,
    last_transaction: authority.transaction_id,
    continuation: null,
  };
  const writes: SettlementWrite[] = [];
  return { transaction: candidate.data, nextClock, writes };
}

/** A staged seal consumes the exact durable stage records. Incomplete work retains the OPEN fence. */
export function if6bSettlement(
  state: CampaignState,
  authority: GmWaitTransactionAuthority,
  marker: GmWaitMarker,
  stages: readonly If6bCommittedStage[],
  kernelRule: SourceRef,
) {
  const target = authority.requested.target;
  const indexFact = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY);
  const index = BoundaryIndexSchema.safeParse(indexFact?.value);
  if (!index.success || !indexFact) return undefined;
  // An absent occurrence boundary is not proof of a quiet wait: the expected original object must exist, valid, in the index.
  const boundary = if6bOccurrenceBoundary(state, marker);
  if (!boundary) return undefined;
  if (!stages.length) return quietSettlement(authority, marker, index.data, kernelRule);
  const horizon = if6bWorkHorizon(boundary, target, stages);
  const occurrence = stages.find(
    ({ record, occurrence }) => occurrence && canonicalEqual(record.stage, boundary.stage),
  );
  if (!timeEquals(horizon, target) && !occurrence) return undefined;
  const due = if6bDueObjects(state, horizon);
  const writes: SettlementWrite[] = [];
  const matched = new Set<string>();
  const engaged = [];
  for (const { entry, fact, object } of due) {
    if (
      !fact ||
      !object?.next_boundary ||
      !timeEquals(entry.at, object.next_boundary.at) ||
      entry.boundary_id !== object.next_boundary.boundary_id ||
      !object.dependencies.length
    )
      return undefined;
    for (const declaration of object.dependencies) {
      const credited = stages.find((s) => canonicalEqual(s.record.stage, declaration.stage));
      if (!credited || !timeEquals(credited.at, entry.at) || matched.has(credited.record.group_id))
        return undefined;
      matched.add(credited.record.group_id);
    }
    writes.push({
      key: fact.key,
      version: fact.version,
      value: JsonValueSchema.parse({
        ...object,
        last_resolved_basis: entry.at,
        next_boundary: null,
      }),
    });
    engaged.push({
      boundary: "RETIRED" as const,
      object_id: entry.object_id,
      fact_key: fact.key,
      version_before: fact.version,
      version_after: fact.version + 1,
    });
  }
  if (matched.size !== stages.length) return undefined;
  const retired = new Set(due.map(({ entry }) => entry.object_id));
  writes.push({
    key: TEMPORAL_BOUNDARY_INDEX_KEY,
    version: indexFact.version,
    value: { entries: index.data.entries.filter((e) => !retired.has(e.object_id)) },
  });
  const rules = [kernelRule];
  for (const { rule } of stages) if (!rules.some((r) => canonicalEqual(rule, r))) rules.push(rule);
  const { publication, ...opening } = authority;
  void publication;
  const candidate = GmWaitStagedTransactionSchema.safeParse({
    ...opening,
    stage_policy: GM_WAIT_IF6B_POLICY,
    engaged: engaged.sort((a, b) => a.object_id.localeCompare(b.object_id)),
    boundaries_crossed: due.map(({ entry }) => entry),
    stages: stages.map(({ record }) => record),
    rule_versions: rules,
    outcome: timeEquals(horizon, target)
      ? {
          actual_stop: target,
          stop_reason: "TARGET_REACHED",
          remainder: null,
          unresolved_dependents: [],
        }
      : {
          actual_stop: horizon,
          stop_reason: "INTERRUPTED",
          remainder: { from: horizon, to: target },
          unresolved_dependents: [],
          interruption: {
            object_id: boundary.entry.object_id,
            boundary_id: boundary.entry.boundary_id,
            occurrence_group_id: occurrence!.record.group_id,
          },
        },
  });
  if (!candidate.success) return undefined;
  const nextClock: TemporalState = {
    canonical_time: horizon,
    last_transaction: authority.transaction_id,
    continuation: candidate.data.outcome.remainder
      ? { from_transaction: authority.transaction_id, toward: target, unresolved_dependents: [] }
      : null,
  };
  return { transaction: candidate.data, nextClock, writes };
}
