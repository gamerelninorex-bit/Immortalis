import {
  CanonicalCampaign,
  LogisticsAdapter,
  ProductionAdapter,
  TemporalCoordinator,
  logisticsTemporalObject,
  productionTemporalObject,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import { LogisticsCommitmentSchema, LogisticsTransferSchema } from "@immortalis/contracts";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  LOGISTICS_FIXTURE_EXTENSION,
  MOVE_1,
  MOVE_2,
  MOVE_OTHER,
  OTHER_LOCUS_ID,
  PROD_T0,
  REQ_1,
  REQ_2,
  REQ_OTHER,
  RESERVE_OTHER,
  acceptedEntityId,
  commitInput,
  dispatchInput,
  fixtureContract,
  fixtureDestinationLocus,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  logPublication,
  logisticsProviders,
  movementRequest,
  movementRequestGroup,
  prodAdvanceRequest,
  prodPublication,
  publication,
  requestGroup,
  reserveInput,
  startInput,
  temporalPublication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface LogSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly production: ProductionAdapter;
  readonly logistics: LogisticsAdapter;
}

export const logCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, logisticsProviders());

export interface LogSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
}

const LOCALITY = { worldId: FIXTURE_WORLD_ID, locusId: FIXTURE_LOCUS_ID };

const wire = (campaign: CanonicalCampaign): LogSeeded => ({
  campaign,
  coordinator: logCoordinator(campaign.store),
  production: new ProductionAdapter(campaign.store),
  logistics: new LogisticsAdapter(campaign.store),
});

/**
 * The prerequisite canonical campaign (world, its origin locus, two further loci to move to, released PC, active
 * binding), the production proof's synthetic requester's committed requests, two exact local Reserves, and the
 * canonical temporal basis T0. No entity exists yet, and nothing is moved.
 */
export async function seededLogisticsCampaign(
  dir: string,
  o: LogSeedOptions = {},
): Promise<LogSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "log-seed",
      extension: LOGISTICS_FIXTURE_EXTENSION,
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
  const s = wire(campaign);
  await must(s.production.establishReserve({ ...prodPublication(1), reserve: reserveInput() }));
  await must(
    s.production.establishReserve({
      ...prodPublication(2),
      reserve: reserveInput(RESERVE_OTHER, 7),
    }),
  );
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: PROD_T0 }));
  return s;
}

/** Obtains one ACCEPTED fallback physical entity by the existing Production path, unchanged. */
export async function acceptLogEntity(
  s: LogSeeded,
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
  await must(s.coordinator.advance(prodAdvanceRequest(`tx-accept-${n}`, op.timing.completion.at)));
}

/** The movement requester commits one Movement Service Request for the accepted entity of `entityRequestId`. */
export async function commitMovementRequest(
  s: Pick<LogSeeded, "campaign">,
  moveId: string,
  entityRequestId: string,
  n: number,
  over: Parameters<typeof movementRequest>[2] = {},
  value: unknown = movementRequest(moveId, entityRequestId, over),
): Promise<void> {
  await must(s.campaign.store.commit(movementRequestGroup(FIXTURE_CAMPAIGN, n, moveId, value)));
}

export const entityIdOf = (requestId: string): string => acceptedEntityId(requestId);

/** Registers the one temporal object derived from the committed commitment and dispatched transfer. */
export async function registerTransfer(s: LogSeeded, requestId: string, tn: number): Promise<void> {
  const c = s.logistics.commitment(FIXTURE_WORLD_ID, entityIdOf(requestId))!;
  const t = s.logistics.transfer(FIXTURE_WORLD_ID, entityIdOf(requestId))!;
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: logisticsTemporalObject(
        LogisticsCommitmentSchema.parse(c.fact.value),
        LogisticsTransferSchema.parse(t.fact.value),
      ),
    }),
  );
}

/**
 * accept the entity of `entityRequest`, commit its movement request `moveId` (pre-dispatch): canonical time is the
 * production completion boundary (PROD_TC).
 */
export async function acceptAndCommit(
  s: LogSeeded,
  entityRequest = REQ_1,
  moveId = MOVE_1,
  n = 1,
): Promise<void> {
  await acceptLogEntity(s, entityRequest, n);
  await commitMovementRequest(s, moveId, entityRequest, n);
  await must(s.logistics.commitMovement({ ...logPublication(n), commit: commitInput(moveId) }));
}

/** the full pre-boundary setup: accept, commit, dispatch, register the transfer's object */
export async function acceptCommitDispatchRegister(
  s: LogSeeded,
  entityRequest = REQ_1,
  moveId = MOVE_1,
  n = 1,
): Promise<void> {
  await acceptAndCommit(s, entityRequest, moveId, n);
  await must(s.logistics.dispatch({ ...logPublication(100 + n), dispatch: dispatchInput(moveId) }));
  await registerTransfer(s, entityRequest, 30 + n);
}

export async function reopenLogistics(dir: string, buildId = "log-reopen"): Promise<LogSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: LOGISTICS_FIXTURE_EXTENSION }),
  );
  return wire(campaign);
}

export const locusOfRequest = (s: LogSeeded, requestId: string) =>
  s.logistics.currentLocus(FIXTURE_WORLD_ID, entityIdOf(requestId));

export function logSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
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
    logistics: under(/^logistics\//),
    synthetic: under(/^synthetic-/),
    canonical: facts.filter((f) =>
      /^(world\/[^/]+\/(profile|locus)|pc|role-registry)\//.test(f.key),
    ),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}

export { MOVE_1, MOVE_2, MOVE_OTHER, REQ_1, REQ_2, REQ_OTHER, FIXTURE_CAMPAIGN };
