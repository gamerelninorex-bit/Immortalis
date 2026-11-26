import {
  CANON_WRITE_AUTHORITY,
  GmWaitByPcIndexSchema,
  GmWaitStoredTransactionSchema,
  temporalGmWaitByPcKey,
  temporalTransactionKey,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  type CommitGroup,
  type OwnerFact,
  type SourceRef,
} from "@immortalis/contracts";
import type { WorkshopFactRef } from "../../../../contracts/src/workshop-opening.ts";
import type { CampaignState } from "../../commit/campaign-core.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../gm-wait-catalogue-current.ts";
import { gmWaitTransactionId } from "../../gm-wait-identity.ts";
import { canonicalEqual, sha256Canonical } from "../../hash.ts";
import type { CampaignStore } from "../../persistence/store.ts";

export type WorkshopView = Pick<CampaignState, "campaign_id" | "revision"> & {
  readonly get: (key: string) => OwnerFact | undefined;
};
export const workshopView = (store: CampaignStore): WorkshopView => {
  const { campaign_id, revision } = store.head();
  return { campaign_id, revision, get: (key) => store.getFact(key) };
};
export const workshopRef = (fact: OwnerFact): WorkshopFactRef => ({
  owner: fact.owner,
  facet: fact.facet,
  key: fact.key,
  version: fact.version,
  group_id: fact.provenance.group_id,
});
export const workshopMatches = (
  fact: OwnerFact | undefined,
  ref: WorkshopFactRef,
): fact is OwnerFact => fact !== undefined && canonicalEqual(workshopRef(fact), ref);

export const workshopPolicy = (rule: SourceRef, historyId: string) => ({
  source_rule_ref: rule,
  history_verification_id: historyId,
  catalogue_sha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
});

export function workshopClock(view: WorkshopView) {
  const fact = view.get(TEMPORAL_STATE_KEY);
  if (!fact) return undefined;
  const clock = TemporalStateSchema.safeParse(fact.value);
  if (!clock.success) return undefined;
  return { fact, at: clock.data.canonical_time };
}

export function workshopGroup(
  view: WorkshopView,
  rule: SourceRef,
  owner: string,
  facet: string,
  writes: readonly {
    key: string;
    value: CommitGroup["writes"][number]["value"];
    expected_version: number;
  }[],
  refs: readonly OwnerFact[],
): CommitGroup {
  const digest = sha256Canonical([view.campaign_id, rule, ...writes]);
  const pinned = [...new Map(refs.map((f) => [f.key, f])).values()];
  return {
    group_id: `workshop-group:${digest}`,
    intent_id: `workshop-intent:${digest}`,
    campaign_id: view.campaign_id,
    owner,
    facet,
    cause: "workshop-original-owner",
    authority: CANON_WRITE_AUTHORITY,
    rule,
    reads: pinned.map((f) => ({ key: f.key, version: f.version })),
    depends_on: [...new Set(pinned.map((f) => f.provenance.group_id))],
    writes: writes.map((w) => ({
      ...w,
      owner,
      facet,
      unit: null,
      basis: "workshop-qualification",
      secrecy: "sealed",
    })),
  };
}

/** Compose owner reads with the committed preparation, slot and OPEN. Every read retains its own dependency position. */
export function workshopStageGroup(
  group: CommitGroup,
  view: WorkshopView,
  enrolment: OwnerFact,
  slot: OwnerFact,
  authority: OwnerFact,
): CommitGroup | undefined {
  const readKeys = [...new Set([...group.reads.map((r) => r.key), enrolment.key, slot.key])];
  const facts = readKeys.map((key) => view.get(key));
  if (facts.some((f) => !f)) return undefined;
  return {
    ...group,
    reads: facts.map((f) => ({ key: f!.key, version: f!.version })),
    depends_on: [...facts.map((f) => f!.provenance.group_id), authority.provenance.group_id],
  };
}

/** The original event can trigger its post-seal Health and Epistemic owner records before by-PC reconciliation. */
export function workshopSealedCut(view: WorkshopView, pc: string, x: string) {
  const indexFact = view.get(temporalGmWaitByPcKey(pc));
  const index = GmWaitByPcIndexSchema.safeParse(indexFact?.value);
  const seal = view.get(temporalTransactionKey(gmWaitTransactionId(x)));
  const settled = GmWaitStoredTransactionSchema.safeParse(seal?.value);
  return indexFact &&
    index.success &&
    index.data.state === "OPEN" &&
    index.data.x === x &&
    settled.success &&
    "stage_policy" in settled.data &&
    settled.data.x === x &&
    seal
    ? { indexFact, seal, settlement: settled.data }
    : undefined;
}
