import {
  BoundaryIndexSchema,
  GM_WAIT_IF6B_POLICY,
  GmWaitStagedTransactionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  timeEquals,
  type CommitGroup,
  type GmWaitTransactionAuthority,
  type SourceRef,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { if6bDueObjects, type If6bCommittedStage } from "./if6b-stage.ts";

/** A staged seal consumes the exact durable stage records. Incomplete work retains the OPEN fence. */
export function if6bSettlement(
  state: CampaignState,
  authority: GmWaitTransactionAuthority,
  stages: readonly If6bCommittedStage[],
  kernelRule: SourceRef,
) {
  const target = authority.requested.target;
  const indexFact = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY);
  const index = BoundaryIndexSchema.safeParse(indexFact?.value);
  if (!stages.length || !index.success || !indexFact) return undefined;
  const due = if6bDueObjects(state, target);
  const writes: { key: string; version: number; value: CommitGroup["writes"][number]["value"] }[] =
    [];
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
      value: { ...object, last_resolved_basis: entry.at, next_boundary: null },
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
    outcome: {
      actual_stop: target,
      stop_reason: "TARGET_REACHED",
      remainder: null,
      unresolved_dependents: [],
    },
  });
  return candidate.success ? { transaction: candidate.data, writes } : undefined;
}
