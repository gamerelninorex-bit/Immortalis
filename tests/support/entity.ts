import {
  CanonicalCampaign,
  ProductionAdapter,
  TemporalCoordinator,
  entityCurrentLocus,
  entityTransitionTemporalObject,
  productionTemporalObject,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import { EntityTransitionCauseSchema, entityTransitionObjectId } from "@immortalis/contracts";
import {
  CAUSE_1,
  ENTITY_FIXTURE_EXTENSION,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  PROD_T0,
  REQ_1,
  REQ_2,
  REQ_OTHER,
  RESERVE_OTHER,
  acceptedEntityId,
  causeGroup,
  causeKey,
  entPublication,
  entityConsumerObject,
  entityProviders,
  fixtureContract,
  fixtureDestinationLocus,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  prodAdvanceRequest,
  prodPublication,
  publication,
  requestGroup,
  reserveInput,
  startInput,
  temporalPublication,
  transitionCause,
  OTHER_LOCUS_ID,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface EntSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly production: ProductionAdapter;
}

export const entCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, entityProviders());

export interface EntSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
}

const LOCALITY = { worldId: FIXTURE_WORLD_ID, locusId: FIXTURE_LOCUS_ID };

/**
 * The prerequisite canonical campaign (world, its origin locus, two further loci to move to, released PC, active
 * binding), the production proof's synthetic requester's committed requests, two exact local Reserves, and the
 * canonical temporal basis T0. Nothing is started and no entity exists yet.
 */
export async function seededEntityCampaign(
  dir: string,
  o: EntSeedOptions = {},
): Promise<EntSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "ent-seed",
      extension: ENTITY_FIXTURE_EXTENSION,
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
  await must(campaign.establishLocus({ ...publication(5), locus: fixtureDestinationLocus() }));
  await must(
    campaign.establishLocus({
      ...publication(6),
      locus: fixtureDestinationLocus(OTHER_LOCUS_ID),
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
  const coordinator = entCoordinator(store);
  await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: PROD_T0 }));
  return { campaign, coordinator, production };
}

/**
 * Obtains one ACCEPTED fallback physical entity by the existing Production path, unchanged: start an operation on
 * a request, register its object and resolve its completion boundary (canonical time stops at it). The entity of
 * `requestId` is then the transition's subject.
 */
export async function acceptEntity(
  s: EntSeeded,
  requestId: string,
  n: number,
  over: Parameters<typeof startInput>[1] = {},
): Promise<void> {
  await must(
    s.production.startOperation({ ...prodPublication(10 + n), start: startInput(requestId, over) }),
  );
  const op = s.production.operation(requestId)!.value;
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(20 + n),
      object: productionTemporalObject(op, LOCALITY),
    }),
  );
  // exactly to the operation's declared completion boundary: no remainder is held
  await must(s.coordinator.advance(prodAdvanceRequest(`tx-accept-${n}`, op.timing.completion.at)));
}

/** Commits one causing result in the synthetic cause owner's own key space. */
export async function commitCause(
  s: Pick<EntSeeded, "campaign">,
  causeId: string,
  requestId: string,
  n: number,
  over: Parameters<typeof transitionCause>[2] = {},
  value: unknown = transitionCause(causeId, requestId, over),
): Promise<void> {
  await must(s.campaign.store.commit(causeGroup(FIXTURE_CAMPAIGN, n, causeId, value)));
}

/** Registers the one temporal object derived from the committed causing result. */
export async function registerTransition(s: EntSeeded, causeId: string, tn: number): Promise<void> {
  const fact = s.campaign.store.getFact(causeKey(causeId))!;
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: entityTransitionTemporalObject({
        key: fact.key,
        owner: fact.owner,
        value: EntityTransitionCauseSchema.parse(fact.value),
      }),
    }),
  );
}

/** accept the entity of REQ_1, commit CAUSE_1 against it and register its transition object */
export async function acceptCauseRegister(
  s: EntSeeded,
  requestId = REQ_1,
  causeId = CAUSE_1,
  n = 1,
): Promise<void> {
  await acceptEntity(s, requestId, n);
  await commitCause(s, causeId, requestId, n);
  await registerTransition(s, causeId, 30 + n);
}

export async function registerConsumer(
  s: EntSeeded,
  causeId: string,
  requestId: string,
  tn: number,
  over: Parameters<typeof entityConsumerObject>[2] = {},
): Promise<void> {
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: entityConsumerObject(causeId, requestId, over),
    }),
  );
}

export async function reopenEntity(dir: string, buildId = "ent-reopen"): Promise<EntSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: ENTITY_FIXTURE_EXTENSION }),
  );
  return {
    campaign,
    coordinator: entCoordinator(campaign.store),
    production: new ProductionAdapter(campaign.store),
  };
}

export const currentLocusOfRequest = (campaign: CanonicalCampaign, requestId: string) =>
  entityCurrentLocus(campaign.store, FIXTURE_WORLD_ID, acceptedEntityId(requestId));

export { entityTransitionObjectId, entPublication };

export function entSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
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
    entities: under(/^world\/[^/]+\/entity\/[^/]+$/),
    transitions: under(/^world\/[^/]+\/entity\/[^/]+\/transition$/),
    synthetic: under(/^synthetic-/),
    canonical: facts.filter((f) =>
      /^(world\/[^/]+\/(profile|locus)|pc|role-registry)\//.test(f.key),
    ),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}

export { REQ_1, REQ_2, REQ_OTHER, CAUSE_1, FIXTURE_CAMPAIGN };
