import {
  CanonicalCampaign,
  ProductionAdapter,
  SourceDrawdownAdapter,
  TemporalCoordinator,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  PRODUCTION_FIXTURE_EXTENSION,
  PROD_T0,
  REQ_1,
  SRC_BASIS_OTHER,
  SRC_REQ_1,
  SRC_REQ_2,
  SRC_REQ_3,
  SRC_RESERVE,
  SRC_RESERVE_OTHER,
  SRC_SOURCE_KEY,
  SRC_SOURCE_OTHER,
  basisInput,
  drawdownProviders,
  drawdownPublication,
  drawdownRequest,
  fixtureLocus,
  fixtureWorld,
  prodPublication,
  publication,
  requestGroup,
  reserveRawInput,
  sourceInput,
  startExtractionInput,
  temporalPublication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface DrawSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly drawdown: SourceDrawdownAdapter;
  readonly production: ProductionAdapter;
}

export const drawCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, drawdownProviders());

export interface DrawSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  /** which requests the synthetic requester commits (default: three raw-material requests of three units each) */
  readonly requests?: readonly { id: string; amount?: number }[];
  /** omit the World-State Source Condition (and so the basis that must rely on it) */
  readonly omitSource?: boolean;
  /** omit Production's Capability / Access basis */
  readonly omitBasis?: boolean;
  /** also establish a second Source Condition (same material and unit) with its own basis, and a second empty Reserve */
  readonly otherSource?: boolean;
}

/**
 * The prerequisite campaign of the drawdown slice: a world and a locus (no Player Character, so the NULL-PC OOC gateway
 * applies), the synthetic requester's committed raw-material requests, ONE canonical World-State Source Condition of
 * exactly five units established BEFORE any request (an initial setting fact), Production's own Capability / Access basis
 * for that source, an empty destination Reserve and the canonical temporal basis T0. Nothing is started.
 */
export async function seededDrawdownCampaign(
  dir: string,
  o: DrawSeedOptions = {},
): Promise<DrawSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "draw-seed",
      extension: PRODUCTION_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  const store = campaign.store;
  let n = 1;
  for (const r of o.requests ?? [{ id: SRC_REQ_1 }, { id: SRC_REQ_2 }, { id: SRC_REQ_3 }])
    await must(
      store.commit(requestGroup(FIXTURE_CAMPAIGN, n++, r.id, drawdownRequest(r.id, r.amount))),
    );
  if (!o.omitSource)
    await must(campaign.establishSourceCondition({ ...publication(5), source: sourceInput() }));
  const drawdown = new SourceDrawdownAdapter(store);
  if (!o.omitSource && !o.omitBasis)
    await must(
      drawdown.establishBasis({ ...drawdownPublication(1), extraction_basis: basisInput() }),
    );
  const production = new ProductionAdapter(store);
  await must(production.establishReserve({ ...prodPublication(1), reserve: reserveRawInput() }));
  if (o.otherSource) {
    await must(
      campaign.establishSourceCondition({
        ...publication(6),
        source: sourceInput({ source_key: SRC_SOURCE_OTHER }),
      }),
    );
    await must(
      drawdown.establishBasis({
        ...drawdownPublication(2),
        extraction_basis: basisInput({ basis_id: SRC_BASIS_OTHER, source_key: SRC_SOURCE_OTHER }),
      }),
    );
    await must(
      production.establishReserve({
        ...prodPublication(2),
        reserve: reserveRawInput(SRC_RESERVE_OTHER),
      }),
    );
  }
  const coordinator = drawCoordinator(store);
  await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: PROD_T0 }));
  return { campaign, coordinator, drawdown, production };
}

/** Starts one extraction (the sealed extraction and the key's account holding its commitment) and registers its object. */
export async function startAndRegisterExtraction(
  s: DrawSeeded,
  requestId: string,
  n: number,
  over: Parameters<typeof startExtractionInput>[1] = {},
): Promise<void> {
  await must(
    s.drawdown.startExtraction({
      ...drawdownPublication(10 + n),
      start: startExtractionInput(`synthetic-request/${requestId}`, over),
    }),
  );
  await registerExtraction(s, requestId, 20 + n);
}

export async function registerExtraction(
  s: DrawSeeded,
  requestId: string,
  tn: number,
): Promise<void> {
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: s.drawdown.temporalObject(requestId)!,
    }),
  );
}

export async function reopenDrawdown(dir: string, buildId = "draw-reopen"): Promise<DrawSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: PRODUCTION_FIXTURE_EXTENSION }),
  );
  return {
    campaign,
    coordinator: drawCoordinator(campaign.store),
    drawdown: new SourceDrawdownAdapter(campaign.store),
    production: new ProductionAdapter(campaign.store),
  };
}

export { REQ_1, SRC_RESERVE, SRC_SOURCE_KEY };

/** Everything material about the drawdown state, for before/after-reload comparison. Diagnostic (lists all facts). */
export function drawSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
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
    sources: under(/^world\/[^/]+\/source/),
    synthetic: under(/^synthetic-/),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}
