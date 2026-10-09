import type {
  BuildInfo,
  CommitGroup,
  CommitReceipt,
  Failure,
  OwnerFact,
  Result,
  SpecIdentity,
} from "@immortalis/contracts";
import type { CommitErrorCode } from "../commit/campaign-core.ts";

/**
 * IM-17 — provider-neutral persistence contract for one open campaign.
 *
 * `provider_acceptance: "NONE"` is a literal type on purpose: no implementation of this interface
 * available at this horizon may claim provider, restart/failover/PITR/backup/archive-restore
 * acceptance (IA-07, CAL-09 remain BLOCKED/UNRUN). Local success is not provider acceptance.
 */
export interface StoreDescriptor {
  readonly kind: string;
  readonly production: false;
  readonly provider_acceptance: "NONE";
}

export interface CampaignHead {
  readonly campaign_id: string;
  readonly revision: number;
  readonly state_sha256: string;
  readonly journal_entries: number;
  readonly journal_head_sha256: string;
  /** spec line the campaign was created under (immutable provenance) */
  readonly spec_identity: SpecIdentity;
  /** spec line in force at the most recent save (provenance; never gates loading) */
  readonly last_saved_spec_identity: SpecIdentity;
  readonly created_with: BuildInfo;
  readonly last_saved_with: BuildInfo;
}

/** Failure classes a commit can return besides domain rejections (kept distinct: Charter principle 20). */
export type StoreCommitErrorCode =
  CommitErrorCode | "UNKNOWN_OUTCOME" | "STORE_POISONED" | "STORE_CLOSED";

export interface CommitOutcome {
  readonly receipt: CommitReceipt;
  /** true when the same identity + same intent had already committed; nothing changed */
  readonly replayed: boolean;
}

export interface CampaignStore {
  readonly descriptor: StoreDescriptor;
  head(): CampaignHead;
  getFact(key: string): OwnerFact | undefined;
  /** All committed facts sorted by key. Full listing is an exceptional/diagnostic path (CAL-06). */
  listFacts(): readonly OwnerFact[];
  /**
   * Validates and atomically publishes one group. Domain rejections are returned. If the durable
   * outcome is not known the result is `UNKNOWN_OUTCOME`: do not retry blindly — reopen and call
   * `lookupReceipt(intent_id)` (RC-16: reconcile by identity before retry).
   */
  commit(group: unknown): Promise<Result<CommitOutcome, StoreCommitErrorCode>>;
  lookupReceipt(intentId: string): CommitReceipt | null;
  /**
   * IM-12 cold-history lookup: the exact group that committed under `intentId`, as recorded in the
   * hash-chained journal, or null. Read-only evidence; it is the same record the receipt attests.
   */
  committedGroup(intentId: string): CommitGroup | null;
  /**
   * The exact group committed under `groupId` (the same hash-chained record, by its group identity), or null. Read-only
   * evidence for historical-source proofs (F-027-CJA1): an exact-key lookup, never a scan. OPTIONAL so that a store without
   * it fails every dependent historical proof CLOSED rather than being assumed truthful.
   */
  committedGroupById?(groupId: string): CommitGroup | null;
  /** Releases the campaign. Committed state is already durable; close never "saves". */
  close(): Promise<void>;
}

export type StoreFailure = Failure<string>;
