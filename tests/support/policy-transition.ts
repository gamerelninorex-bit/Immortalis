// H-07 S2 MECHANISM test support: a v2 package written under an OLDER history-verification policy, reopened by a build whose
// policy differs. Synthetic disposable data only; no real campaign, host, model or provider is involved.
import {
  CampaignCore,
  createFileCampaign,
  type FileCampaignOptions,
  type WriteAdmission,
} from "@immortalis/engine";
import { TEST_OWNERS, group, write } from "@immortalis/testkit";
import { must } from "./temporal.ts";
import { tempDir } from "./tmp.ts";

export const POLICY_CAMPAIGN = "h07-s2-policy-transition";
export const OLD_POLICY_ID = "h07-s2-old-policy";
export const NEW_POLICY_ID = "h07-s2-new-policy";

/** The n-th commit of a one-fact history: unrelated history length varies, the causal fact stays one. */
export const change = (n: number) =>
  group(
    POLICY_CAMPAIGN,
    n,
    [write("fact/a", n, { expected_version: n - 1 })],
    n > 1 ? { depends_on: [`group-${n - 1}`] } : {},
  );

export interface CountingAdmission {
  readonly admission: WriteAdmission;
  /** groups the historical verifier was actually asked to judge */
  readonly verified: () => number;
}

/** A pure admission under a named history-verification policy that counts every historical judgement. */
export function policyAdmission(
  id: string | undefined,
  verdict: (groupId: string) => { code: "VERSION_CONFLICT"; message: string } | null = () => null,
): CountingAdmission {
  let verified = 0;
  const admission: WriteAdmission = {
    ...(id === undefined ? {} : { historyVerificationId: id }),
    check: () => null,
    verifyHistorical: (g) => {
      verified++;
      return verdict(g.group_id);
    },
  };
  return { admission, verified: () => verified };
}

export const optionsFor = (admission: WriteAdmission, extra: FileCampaignOptions = {}) => ({
  owners: TEST_OWNERS,
  admission,
  ...extra,
});

/** A closed package of `count` entries written under the OLD policy (every group judged by it at commit). */
export async function seedOldPolicy(count: number): Promise<string> {
  const dir = tempDir();
  const store = await must(
    createFileCampaign(dir, {
      campaignId: POLICY_CAMPAIGN,
      ...optionsFor(policyAdmission(OLD_POLICY_ID).admission),
    }),
  );
  for (let n = 1; n <= count; n++) await must(store.commit(change(n)));
  await store.close();
  return dir;
}

/** Counts strict-replay entries (CampaignCore.replay calls) and the distinct cores that replayed, around one async action. */
export async function countReplays<T>(
  action: () => Promise<T>,
): Promise<{ result: T; entries: number; cores: number }> {
  const original = CampaignCore.prototype.replay;
  const perCore = new Map<unknown, number>();
  CampaignCore.prototype.replay = function (this: CampaignCore, ...args) {
    perCore.set(this, (perCore.get(this) ?? 0) + 1);
    return original.apply(this, args);
  };
  try {
    const result = await action();
    return {
      result,
      entries: [...perCore.values()].reduce((a, b) => a + b, 0),
      cores: perCore.size,
    };
  } finally {
    CampaignCore.prototype.replay = original;
  }
}
