import {
  CanonicalCampaign,
  EconomyAdapter,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  FIXTURE_HOLDING_CAMPAIGN,
  HOLDING_1,
  establishHoldingInput,
  holdingPublication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface HoldingSeeded {
  readonly campaign: CanonicalCampaign;
  readonly economy: EconomyAdapter;
}

const adaptersOf = (campaign: CanonicalCampaign): HoldingSeeded => ({
  campaign,
  economy: new EconomyAdapter(campaign.store),
});

/**
 * A bare canonical campaign with ONE scenario-opening premise: holding H of object O, an exact 7 available. Nothing
 * else is needed (no world, Population, Production, Temporal or Reserve): the position is an Economy-owned book
 * position and the proof must not lean on a physical owner.
 */
export async function seededHoldingCampaign(
  dir: string,
  o: {
    readonly buildId?: string;
    readonly fs?: FileCampaignOptions["fs"];
    readonly amount?: number;
    readonly noPremise?: boolean;
  } = {},
): Promise<HoldingSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_HOLDING_CAMPAIGN,
      buildId: o.buildId ?? "holding-seed",
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  const s = adaptersOf(campaign);
  if (!o.noPremise)
    await must(
      s.economy.establishHolding({
        ...holdingPublication(1),
        holding: establishHoldingInput({ holding_id: HOLDING_1, amount: o.amount ?? 7 }),
      }),
    );
  return s;
}

export async function reopenHolding(dir: string, buildId = "holding-reopen") {
  return adaptersOf(await must(CanonicalCampaign.open(dir, { buildId })));
}

export const holdingSummary = (store: CampaignStore) => {
  const head = store.head();
  return {
    head: {
      revision: head.revision,
      state_sha256: head.state_sha256,
      journal_entries: head.journal_entries,
      journal_head_sha256: head.journal_head_sha256,
    },
    economy: store.listFacts().filter((f) => f.key.startsWith("economy/")),
  };
};
