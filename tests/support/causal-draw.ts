import {
  CanonicalCampaign,
  CausalDrawAdapter,
  type CampaignStore,
  type CausalDrawAdapterOptions,
  type FileCampaignOptions,
} from "@immortalis/engine";
import type { OwnerFact } from "@immortalis/contracts";
import {
  DRAW_CAMPAIGN,
  DRAW_FIXTURE_EXTENSION,
  RESOLVER,
  SEED_1,
  drawInputKey,
  drawOwnerGroup,
  drawSpecification,
  effectiveRules,
  seededEntropy,
  slotInspectors,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface DrawSeeded {
  readonly campaign: CanonicalCampaign;
  readonly adapter: CausalDrawAdapter;
  readonly entropy: ReturnType<typeof seededEntropy>;
  /** the two committed input facts a default specification pins */
  readonly inputs: readonly OwnerFact[];
}

export interface DrawSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  readonly entropy?: ReturnType<typeof seededEntropy>;
  readonly adapter?: Partial<CausalDrawAdapterOptions>;
}

/** A fresh adapter over `store`, with the synthetic owner's typed slot interface and an always-effective rule seam. */
export const drawAdapter = (
  store: CampaignStore,
  entropy: ReturnType<typeof seededEntropy> = seededEntropy(SEED_1),
  over: Partial<CausalDrawAdapterOptions> = {},
): CausalDrawAdapter =>
  new CausalDrawAdapter(store, {
    slotInspectors: slotInspectors(store),
    ruleAuthority: effectiveRules(),
    entropy,
    ...over,
  });

const wire = (
  campaign: CanonicalCampaign,
  inputs: readonly OwnerFact[],
  o: DrawSeedOptions,
): DrawSeeded => {
  const entropy = o.entropy ?? seededEntropy(SEED_1);
  return {
    campaign,
    entropy,
    inputs,
    adapter: drawAdapter(campaign.store, entropy, o.adapter),
  };
};

/** A canonical campaign (no world, PC or time is needed) with the synthetic owner and two committed input facts. */
export async function seededDrawCampaign(
  dir: string,
  o: DrawSeedOptions = {},
): Promise<DrawSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: DRAW_CAMPAIGN,
      buildId: o.buildId ?? "draw-seed",
      extension: DRAW_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  for (const id of ["i1", "i2"]) {
    await must(
      campaign.store.commit(drawOwnerGroup(drawInputKey(id), `SYNTHETIC FIXTURE: input ${id}`)),
    );
  }
  const inputs = ["i1", "i2"].map((id) => campaign.store.getFact(drawInputKey(id))!);
  return wire(campaign, inputs, o);
}

export async function reopenDraw(dir: string, o: DrawSeedOptions = {}): Promise<DrawSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, {
      buildId: o.buildId ?? "draw-reopen",
      extension: DRAW_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  const inputs = ["i1", "i2"].flatMap((id) => campaign.store.getFact(drawInputKey(id)) ?? []);
  return wire(campaign, inputs, o);
}

/** The default specification over the seeded inputs, and a draw request under the resolver context. */
export const defaultSpecification = (s: Pick<DrawSeeded, "inputs">) => drawSpecification(s.inputs);
export const request = (specification: unknown, resolution: unknown = RESOLVER) =>
  ({ specification, resolution }) as Parameters<CausalDrawAdapter["draw"]>[0];

export const causalDrawFacts = (store: CampaignStore) =>
  store.listFacts().filter((f) => f.key.startsWith("causal-draw/"));

export { must };

/* eslint-disable @typescript-eslint/no-explicit-any -- groups are inspected structurally */
/** A store that "crashes" (nothing committed, unknown outcome) before the first group the predicate names. */
export function crashBefore(inner: CampaignStore, block: (g: any) => boolean): CampaignStore {
  return {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async (g: any) =>
      block(g)
        ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } } as never)
        : inner.commit(g),
  };
}

/** A store that COMMITS the group the predicate names and then loses the reply (unknown outcome). */
export function lostReply(inner: CampaignStore, block: (g: any) => boolean): CampaignStore {
  return {
    ...crashBefore(inner, () => false),
    commit: async (g: any) => {
      const r = await inner.commit(g);
      return block(g)
        ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
        : r;
    },
  };
}

export const isPrecommitGroup = (g: any) => g.group_id.startsWith("cdraw:precommit:group:v1:");
export const isResultGroup = (g: any) => g.group_id.startsWith("cdraw:result:group:v1:");

/** Journal position, to prove a refused draw wrote nothing. */
export const journalMark = (store: CampaignStore) => {
  const h = store.head();
  return { entries: h.journal_entries, head: h.journal_head_sha256, state: h.state_sha256 };
};
