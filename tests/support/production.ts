import {
  productionTemporalObject,
  CanonicalCampaign,
  ProductionAdapter,
  TemporalCoordinator,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  PRODUCTION_FIXTURE_EXTENSION,
  PROD_T0,
  REQ_1,
  REQ_2,
  REQ_OTHER,
  RESERVE_MAIN,
  RESERVE_OTHER,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  prodPublication,
  productionProviders,
  publication,
  requestGroup,
  reserveInput,
  startInput,
  temporalPublication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface ProdSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly production: ProductionAdapter;
}

export const prodCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, productionProviders());

export interface ProdSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
}

const LOCALITY = { worldId: FIXTURE_WORLD_ID, locusId: FIXTURE_LOCUS_ID };

/**
 * The prerequisite canonical campaign (world, locus, released PC, active binding) plus the proof's synthetic
 * requester's committed requests, two established exact local Reserves (one engaged, one unrelated), and the
 * canonical temporal basis T0. No operation is started yet.
 */
export async function seededProductionCampaign(
  dir: string,
  o: ProdSeedOptions = {},
): Promise<ProdSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "prod-seed",
      extension: PRODUCTION_FIXTURE_EXTENSION,
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
  const store = campaign.store;
  let n = 1;
  for (const id of [REQ_1, REQ_2, REQ_OTHER])
    await must(store.commit(requestGroup(FIXTURE_CAMPAIGN, n++, id)));
  const production = new ProductionAdapter(store);
  await must(production.establishReserve({ ...prodPublication(1), reserve: reserveInput() }));
  await must(
    production.establishReserve({
      ...prodPublication(2),
      reserve: reserveInput(RESERVE_OTHER, 7),
    }),
  );
  const coordinator = prodCoordinator(store);
  await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: PROD_T0 }));
  return { campaign, coordinator, production };
}

/** Starts one operation (operation + claim + open-claim entry) and registers its temporal object. */
export async function startAndRegister(
  s: ProdSeeded,
  requestId: string,
  n: number,
  over: Parameters<typeof startInput>[1] = {},
): Promise<void> {
  await must(
    s.production.startOperation({
      ...prodPublication(10 + n),
      start: startInput(requestId, over),
    }),
  );
  await registerOperation(s, requestId, 20 + n);
}

export async function registerOperation(
  s: ProdSeeded,
  requestId: string,
  tn: number,
): Promise<void> {
  const op = s.production.operation(requestId)!.value;
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: productionTemporalObject(op, LOCALITY),
    }),
  );
}

export async function reopenProduction(dir: string, buildId = "prod-reopen"): Promise<ProdSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: PRODUCTION_FIXTURE_EXTENSION }),
  );
  return {
    campaign,
    coordinator: prodCoordinator(campaign.store),
    production: new ProductionAdapter(campaign.store),
  };
}

export { RESERVE_MAIN };

export function prodSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
  const head = campaign.store.head();
  const facts = campaign.store.listFacts();
  const under = (re: RegExp) => facts.filter((f) => re.test(f.key));
  return {
    head: {
      revision: head.revision,
      state_sha256: head.state_sha256,
      journal_entries: head.journal_entries,
      journal_head_sha256: head.journal_head_sha256,
    },
    state: coordinator.state()?.fact ?? null,
    index: coordinator.boundaryIndex(),
    objects: under(/^temporal\/object\//),
    transactions: under(/^temporal\/transaction\//),
    production: under(/^production\//),
    entities: under(/^world\/[^/]+\/entity\//),
    synthetic: under(/^synthetic-/),
    canonical: facts.filter((f) =>
      /^(world\/[^/]+\/(profile|locus)|pc|role-registry)\//.test(f.key),
    ),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}
