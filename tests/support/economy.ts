import {
  CanonicalCampaign,
  EconomyAdapter,
  PopulationAdapter,
  ProductionAdapter,
  TemporalCoordinator,
  productionTemporalObject,
  type CampaignStore,
  type FileCampaignOptions,
  type StageOwnerExtension,
} from "@immortalis/engine";
import {
  DEMAND_1,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  LEDGER_OTHER,
  PROD_T0,
  RESERVE_OTHER,
  economyProviders,
  economyPublication,
  economyStartInput,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  issueInput,
  ledgerInput,
  operationOf,
  otherUnits,
  popPublication,
  prodPublication,
  publication,
  reserveInput,
  temporalPublication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface EconSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly population: PopulationAdapter;
  readonly production: ProductionAdapter;
  readonly economy: EconomyAdapter;
}

export const econCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, economyProviders());

export interface EconSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  /** a synthetic extension owner, only to prove that it cannot write an Economy key space */
  readonly extension?: StageOwnerExtension;
}

const LOCALITY = { worldId: FIXTURE_WORLD_ID, locusId: FIXTURE_LOCUS_ID };

const adaptersOf = (campaign: CanonicalCampaign, coordinator: TemporalCoordinator): EconSeeded => ({
  campaign,
  coordinator,
  population: new PopulationAdapter(campaign.store),
  production: new ProductionAdapter(campaign.store),
  economy: new EconomyAdapter(campaign.store),
});

/**
 * The prerequisite canonical campaign (world, locus, released PC, active binding), two established Population
 * ledgers (the carrier's and an unrelated one), two established exact local Production Reserves (one engaged, one
 * unrelated) and the canonical temporal basis T0. NO synthetic owner is registered: Economy is a real owner.
 * No demand is issued yet.
 */
export async function seededEconomyCampaign(
  dir: string,
  o: EconSeedOptions = {},
): Promise<EconSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "econ-seed",
      ...(o.extension ? { extension: o.extension } : {}),
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
  const population = new PopulationAdapter(store);
  await must(population.establishLedger({ ...popPublication(1), ledger: ledgerInput() }));
  await must(
    population.establishLedger({
      ...popPublication(2),
      ledger: ledgerInput(LEDGER_OTHER, otherUnits()),
    }),
  );
  const production = new ProductionAdapter(store);
  await must(production.establishReserve({ ...prodPublication(1), reserve: reserveInput() }));
  await must(
    production.establishReserve({
      ...prodPublication(2),
      reserve: reserveInput(RESERVE_OTHER, 7),
    }),
  );
  const coordinator = econCoordinator(store);
  await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: PROD_T0 }));
  return adaptersOf(campaign, coordinator);
}

/** Issues one demand (demand + its one request), starts the Production operation on it and registers its object. */
export async function issueStartRegister(
  s: EconSeeded,
  demandId: string,
  n: number,
  over: Parameters<typeof economyStartInput>[1] = {},
  issue: Parameters<typeof issueInput>[1] = {},
): Promise<void> {
  await must(
    s.economy.issueDemand({ ...economyPublication(n), demand: issueInput(demandId, issue) }),
  );
  await startAndRegisterOperation(s, demandId, n, over);
}

export async function startAndRegisterOperation(
  s: EconSeeded,
  demandId: string,
  n: number,
  over: Parameters<typeof economyStartInput>[1] = {},
): Promise<void> {
  await must(
    s.production.startOperation({
      ...prodPublication(10 + n),
      start: economyStartInput(demandId, over),
    }),
  );
  await registerEconomyOperation(s, demandId, 20 + n);
}

export async function registerEconomyOperation(
  s: EconSeeded,
  demandId: string,
  tn: number,
): Promise<void> {
  const op = s.production.operation(operationOf(demandId))!.value;
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: productionTemporalObject(op, LOCALITY),
    }),
  );
}

export async function reopenEconomy(dir: string, buildId = "econ-reopen"): Promise<EconSeeded> {
  const campaign = await must(CanonicalCampaign.open(dir, { buildId }));
  return adaptersOf(campaign, econCoordinator(campaign.store));
}

export { DEMAND_1 };

export function econSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
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
    economy: under(/^economy\//),
    production: under(/^production\//),
    population: under(/^population\//),
    entities: under(/^world\/[^/]+\/entity\//),
    canonical: facts.filter((f) =>
      /^(world\/[^/]+\/(profile|locus)|pc|role-registry)\//.test(f.key),
    ),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}
