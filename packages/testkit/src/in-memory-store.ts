import {
  BUILD_SPEC_IDENTITY,
  ok,
  type CommitReceipt,
  type OwnerFact,
  type Result,
} from "@immortalis/contracts";
import {
  CampaignCore,
  emptyState,
  stateSha256,
  stateToFile,
  type CampaignHead,
  type CampaignStore,
  type CommitOutcome,
  type OwnerRegistry,
  type StoreCommitErrorCode,
  type StoreDescriptor,
} from "@immortalis/engine";
import { ENGINE_PACKAGE, ENGINE_VERSION } from "@immortalis/engine";

/**
 * NON-PRODUCTION test double for the IM-17 persistence interface. It keeps nothing durable, so it can
 * never demonstrate save/load, restart, failover, PITR, backup or archive restore, and it cannot turn
 * IA-07 / CAL-09 into PASS (Bootstrap Plan §2.2, §11.11).
 */
export const IN_MEMORY_DESCRIPTOR: StoreDescriptor = {
  kind: "test-double-in-memory",
  production: false,
  provider_acceptance: "NONE",
};

export function createInMemoryCampaign(params: {
  campaignId: string;
  owners: OwnerRegistry;
}): CampaignStore {
  const core = new CampaignCore({
    campaignId: params.campaignId,
    specLockSha256: BUILD_SPEC_IDENTITY.spec_lock_sha256,
    owners: params.owners,
    state: emptyState(params.campaignId),
    headSha256: "0".repeat(64),
  });
  const build = { package: ENGINE_PACKAGE, version: ENGINE_VERSION, build_id: null };
  let entries = 0;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    descriptor: IN_MEMORY_DESCRIPTOR,
    head(): CampaignHead {
      return {
        campaign_id: params.campaignId,
        revision: core.state.revision,
        state_sha256: stateSha256(core.state),
        journal_entries: entries,
        journal_head_sha256: core.headSha256,
        spec_identity: BUILD_SPEC_IDENTITY,
        last_saved_spec_identity: BUILD_SPEC_IDENTITY,
        created_with: build,
        last_saved_with: build,
      };
    },
    getFact: (key: string): OwnerFact | undefined => core.state.facts.get(key),
    listFacts: () => stateToFile(core.state).facts,
    lookupReceipt: (intentId: string): CommitReceipt | null => core.lookupReceipt(intentId),
    commit(group: unknown): Promise<Result<CommitOutcome, StoreCommitErrorCode>> {
      const run = queue.then(async () => {
        const prepared = core.prepare(group);
        if (!prepared.ok) return prepared;
        if (prepared.value.kind === "replay")
          return ok({ receipt: prepared.value.receipt, replayed: true });
        core.accept(prepared.value);
        entries += 1;
        return ok({ receipt: prepared.value.entry.receipt, replayed: false });
      });
      queue = run.catch(() => undefined);
      return run;
    },
    close: async () => {
      await queue.catch(() => undefined);
    },
  };
}
