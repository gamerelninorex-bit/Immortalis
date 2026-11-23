import {
  ResolutionTransactionStoredSchema,
  type StageKey,
  type StageRecord,
} from "@immortalis/contracts";
import { gmWaitTransactionId, type CampaignStore } from "@immortalis/engine";
import { temporalTransactionKey } from "@immortalis/contracts";

export function requireLaneXEvidence(store: CampaignStore, x: string, stage: StageKey): boolean {
  const seal = store.getFact(temporalTransactionKey(gmWaitTransactionId(x)));
  const parsed = ResolutionTransactionStoredSchema.safeParse(seal?.value);
  if (!seal || !parsed.success || !("origin" in parsed.data) || parsed.data.x !== x) return false;
  const records: readonly StageRecord[] = parsed.data.stages;
  const entry = records.find((record) => JSON.stringify(record.stage) === JSON.stringify(stage));
  if (!entry || !store.ruleCheckedGroupIds?.().has(entry.group_id)) return false;
  const group = store.committedGroupById?.(entry.group_id);
  return !!group && store.lookupReceipt(group.intent_id)?.revision === entry.revision;
}
