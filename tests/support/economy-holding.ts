import {
  CanonicalCampaign,
  EconomyAdapter,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  FIXTURE_HOLDING_CAMPAIGN,
  HOLDER_OTHER,
  HOLDING_1,
  HOLDING_2,
  PREMISE_2,
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

/**
 * The reallocation witness's two independently committed openings (separate premises, separate publications): position
 * A = holder H, 7 of object O; position B = another holder, 2 of the SAME object and unit. Both at version 1.
 */
export async function seededReallocationCampaign(
  dir: string,
  o: {
    readonly amountA?: number;
    readonly amountB?: number;
    readonly fs?: FileCampaignOptions["fs"];
  } = {},
): Promise<HoldingSeeded> {
  const s = await seededHoldingCampaign(dir, {
    ...(o.amountA !== undefined ? { amount: o.amountA } : {}),
    ...(o.fs ? { fs: o.fs } : {}),
  });
  await must(
    s.economy.establishHolding({
      ...holdingPublication(2),
      holding: establishHoldingInput({
        holding_id: HOLDING_2,
        holder_ref: HOLDER_OTHER,
        amount: o.amountB ?? 2,
        premise_id: PREMISE_2,
      }),
    }),
  );
  return s;
}
