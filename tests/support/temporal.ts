import {
  CanonicalCampaign,
  TemporalCoordinator,
  sha256Canonical,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  SYNTH_EXTENSION,
  T0,
  dormantObject,
  engagedObject,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  publication,
  syntheticProviders,
  syntheticSourceGroup,
  temporalPublication,
} from "@immortalis/testkit";
import type { CommitGroup, TemporalObject } from "@immortalis/contracts";

export async function must<T>(
  p: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>,
): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

export const codeOf = async (p: Promise<{ ok: boolean; error?: { code: string } }>) => {
  const r = await p;
  return r.ok ? "OK" : (r.error?.code ?? "?");
};

export interface Seeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
}

export interface SeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  /** objects to register, in order; defaults to the engaged object then the dormant control */
  readonly objects?: readonly TemporalObject[];
  readonly sourceValue?: unknown;
}

/**
 * The prerequisite canonical campaign of the third slice — world, locus, released PC and active
 * binding from the merged predecessor foundation — plus the synthetic source fact, the initial
 * canonical temporal basis T0, the engaged object (earned boundary Tb) and the dormant control.
 */
export async function seededTemporalCampaign(dir: string, o: SeedOptions = {}): Promise<Seeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "seed",
      extension: SYNTH_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
  await must(
    campaign.bindPlayerCharacter({
      ...publication(4),
      pc_id: FIXTURE_PC_ID,
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
      insertion: fixtureInsertionFact(),
    }),
  );
  await must(
    campaign.store.commit(
      syntheticSourceGroup(FIXTURE_CAMPAIGN, 1, o.sourceValue ?? "source-v1", 0),
    ),
  );
  await must(
    campaign.store.commit(
      syntheticSourceGroup(FIXTURE_CAMPAIGN, 2, "dormant-source-v1", 0, "synthetic/dormant/source"),
    ),
  );
  const coordinator = new TemporalCoordinator(campaign.store, syntheticProviders());
  await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  const objects = o.objects ?? [engagedObject(), dormantObject()];
  let n = 2;
  for (const object of objects) {
    await must(coordinator.registerObject({ ...temporalPublication(n++), object }));
  }
  return { campaign, coordinator };
}

export async function reopen(dir: string, buildId = "reopen"): Promise<Seeded> {
  const campaign = await must(CanonicalCampaign.open(dir, { buildId, extension: SYNTH_EXTENSION }));
  return { campaign, coordinator: new TemporalCoordinator(campaign.store, syntheticProviders()) };
}

/** Records every read the coordinator makes through the store, to prove nothing is scanned. */
export function spyStore(inner: CampaignStore): {
  store: CampaignStore;
  getFacts: string[];
  listCalls: () => number;
  commits: CommitGroup[];
} {
  const getFacts: string[] = [];
  const commits: CommitGroup[] = [];
  let listed = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (key) => {
      getFacts.push(key);
      return inner.getFact(key);
    },
    listFacts: () => {
      listed += 1;
      return inner.listFacts();
    },
    commit: (group) => {
      commits.push(group as CommitGroup);
      return inner.commit(group);
    },
    lookupReceipt: (id) => inner.lookupReceipt(id),
    committedGroup: (id) => inner.committedGroup(id),
    close: () => inner.close(),
  };
  return { store, getFacts, listCalls: () => listed, commits };
}

/**
 * Everything material about the campaign's temporal, stage, dormant and canonical state, for
 * before/after-reload comparison. Diagnostic (lists all facts).
 */
export function temporalSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
  const head = campaign.store.head();
  const facts = campaign.store.listFacts();
  const under = (prefix: string) => facts.filter((f) => f.key.startsWith(prefix));
  return {
    head: {
      campaign_id: head.campaign_id,
      revision: head.revision,
      state_sha256: head.state_sha256,
      journal_entries: head.journal_entries,
      journal_head_sha256: head.journal_head_sha256,
      spec_identity_sha256: sha256Canonical(head.spec_identity),
    },
    state: coordinator.state()?.fact ?? null,
    index: coordinator.boundaryIndex(),
    objects: under("temporal/object/"),
    transactions: under("temporal/transaction/"),
    synthetic: under("synthetic/"),
    canonical: facts.filter((f) => /^(world|pc|role-registry)\//.test(f.key)),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}
