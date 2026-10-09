import {
  CanonicalCampaign,
  CultureAdjudicationAdapter,
  type CampaignStore,
  type CultureAdjudicationAdapterOptions,
  type FileCampaignOptions,
} from "@immortalis/engine";
import type { CjaContextAttestation, CommitGroup } from "@immortalis/contracts";
import {
  CJA_FIXTURE_EXTENSION,
  CJA_TEST_CONSUMER,
  CJA_TEST_RULE,
  DEFAULT_OBSERVATIONS,
  TestContextPort,
  observationGroup,
  testAttestation,
  testContextGroup,
  type TestContextSpec,
  type TestObservation,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export const CJA_CAMPAIGN = "cja-campaign";

export interface CjaSeeded {
  readonly campaign: CanonicalCampaign;
  readonly adapter: CultureAdjudicationAdapter;
  /** the sealed-context attestation PORT A stand-in will return */
  readonly attestation: CjaContextAttestation;
}

export interface CjaSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  readonly observations?: readonly TestObservation[];
  readonly spec?: TestContextSpec;
  readonly adapter?: Partial<CultureAdjudicationAdapterOptions>;
  /** wrap the store the adapter sees (spies, crashes) */
  readonly wrap?: (store: CampaignStore) => CampaignStore;
}

export const cjaAdapter = (
  store: CampaignStore,
  over: Partial<CultureAdjudicationAdapterOptions> = {},
): CultureAdjudicationAdapter =>
  new CultureAdjudicationAdapter(store, {
    contextPort: new TestContextPort(store),
    consumer: { ...CJA_TEST_CONSUMER },
    rule: CJA_TEST_RULE,
    ...over,
  });

/** commit the observation groups, then the test-owned sealed context, over an open campaign */
export async function sealTestContext(
  campaign: CanonicalCampaign,
  observations: readonly TestObservation[] = DEFAULT_OBSERVATIONS,
  spec: TestContextSpec = {},
): Promise<CjaContextAttestation> {
  const refs = new Map<string, { version: number; group_id: string }>();
  let n = 0;
  for (const o of observations) {
    n += 1;
    const g = observationGroup(CJA_CAMPAIGN, n, o.id, o.value);
    await must(campaign.store.commit(g));
    refs.set(o.id, { version: 1, group_id: g.group_id });
  }
  const contextGroupId = `cja-ctx-group-${n + 1}`;
  const attestation = testAttestation(
    refs,
    contextGroupId,
    spec.inputs ? spec : { ...spec, inputs: observations.map((o) => o.id) },
  );
  const group: CommitGroup = testContextGroup(CJA_CAMPAIGN, n + 1, attestation);
  await must(campaign.store.commit(group));
  return attestation;
}

export async function seededCjaCampaign(dir: string, o: CjaSeedOptions = {}): Promise<CjaSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: CJA_CAMPAIGN,
      buildId: o.buildId ?? "cja-seed",
      extension: CJA_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  const attestation = await sealTestContext(campaign, o.observations, o.spec);
  const store = o.wrap ? o.wrap(campaign.store) : campaign.store;
  return {
    campaign,
    attestation,
    adapter: cjaAdapter(store, { contextPort: new TestContextPort(campaign.store), ...o.adapter }),
  };
}

export async function reopenCja(dir: string, o: CjaSeedOptions = {}) {
  const campaign = await must(
    CanonicalCampaign.open(dir, {
      buildId: o.buildId ?? "cja-reopen",
      extension: CJA_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  const store = o.wrap ? o.wrap(campaign.store) : campaign.store;
  return {
    campaign,
    adapter: cjaAdapter(store, { contextPort: new TestContextPort(campaign.store), ...o.adapter }),
  };
}

export const adjudicationFacts = (store: CampaignStore) =>
  store.listFacts().filter((f) => f.key.startsWith("adjudication-culture/"));

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

export const isDecisionGroup = (g: any) => g.group_id.startsWith("cjadj:group:v1:");

/** A store that records every call, to prove nothing was touched. */
export function spyStore(inner: CampaignStore) {
  const calls: string[] = [];
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => (calls.push("head"), inner.head()),
    getFact: (k) => (calls.push(`getFact:${k}`), inner.getFact(k)),
    listFacts: () => (calls.push("listFacts"), inner.listFacts()),
    lookupReceipt: (i) => (calls.push("lookupReceipt"), inner.lookupReceipt(i)),
    committedGroup: (i) => (calls.push("committedGroup"), inner.committedGroup(i)),
    close: () => inner.close(),
    commit: (g: any) => (calls.push("commit"), inner.commit(g)),
  };
  return { store, calls };
}

export { must };
