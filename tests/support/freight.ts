import {
  CanonicalCampaign,
  EconomyFreightAdapter,
  GipAdapter,
  GipFreightAdapter,
  LogisticsFreightAdapter,
  ProductionAdapter,
  ProductionFreightAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  WorldFreightAdapter,
  economyFreightReceiptProvider,
  productionCompletionProvider,
  productionTemporalObject,
  worldEntityTransitionProvider,
  worldFallbackAcceptanceProvider,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
  logisticsTemporalObject,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  economyOriginRequestId,
  economyRequestKey,
  productionInputLotKey,
  productionMaterialSpecificationKey,
  productionOutputReference,
  worldFallbackEntityKey,
  worldSiteConditionKey,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  logisticsCommitmentKey,
  logisticsTransferKey,
  type CanonicalTime,
} from "@immortalis/contracts";
import {
  cloneFixture,
  freightPublication,
  prodAdvanceRequest,
  type FreightWorldFixture,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

/**
 * Test harness of the ROADBED first-profile freight proof. Every helper drives the PRODUCTION owner operations over a real
 * file-backed canonical campaign (the same commit path, admission and journal a served campaign uses); none seeds a fact, a
 * flag or a result. A scripted double plays the GM's session: MECHANISM ONLY evidence.
 */
export interface Freight {
  readonly dir: string;
  readonly fx: FreightWorldFixture;
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly world: WorldFreightAdapter;
  readonly gip: GipAdapter;
  readonly gipFreight: GipFreightAdapter;
  readonly production: ProductionAdapter;
  readonly productionFreight: ProductionFreightAdapter;
  readonly economy: EconomyFreightAdapter;
  readonly logistics: LogisticsFreightAdapter;
}

export const freightProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    productionCompletionProvider,
    worldFallbackAcceptanceProvider,
    worldEntityTransitionProvider,
    logisticsDeliveryProvider,
    logisticsRetirementProvider,
    economyFreightReceiptProvider,
  ]);

const wire = (dir: string, fx: FreightWorldFixture, campaign: CanonicalCampaign): Freight => ({
  dir,
  fx,
  campaign,
  coordinator: new TemporalCoordinator(campaign.store, freightProviders()),
  world: new WorldFreightAdapter(campaign.store),
  gip: new GipAdapter(campaign.store),
  gipFreight: new GipFreightAdapter(campaign.store),
  production: new ProductionAdapter(campaign.store),
  productionFreight: new ProductionFreightAdapter(campaign.store),
  economy: new EconomyFreightAdapter(campaign.store),
  logistics: new LogisticsFreightAdapter(campaign.store),
});

export async function createFreightCampaign(
  dir: string,
  fx: FreightWorldFixture,
  o: { readonly buildId?: string; readonly fs?: FileCampaignOptions["fs"] } = {},
): Promise<Freight> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: fx.campaignId,
      buildId: o.buildId ?? "roadbed-freight",
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  return wire(dir, fx, campaign);
}

export async function reopenFreightCampaign(
  f: Freight,
  buildId = "roadbed-freight-reopen",
): Promise<Freight> {
  await f.campaign.close();
  const campaign = await must(CanonicalCampaign.open(f.dir, { buildId }));
  return wire(f.dir, f.fx, campaign);
}

const pub = freightPublication;

/** The GM's original setting: the world and its two established sites, and the cart-road between them. */
export async function establishSetting(f: Freight): Promise<void> {
  const { campaign, fx } = f;
  await must(campaign.establishWorld({ ...pub("setting", 1), world: fx.world }));
  await must(campaign.establishLocus({ ...pub("setting", 2), locus: fx.origin }));
  await must(campaign.establishLocus({ ...pub("setting", 3), locus: fx.destination }));
  await must(campaign.establishCorridor({ ...pub("setting", 4), corridor: fx.corridor }));
}

/** World-State attests the whole original GM envelope; then Temporal initializes canonical T0. */
export async function attestAndInitialize(f: Freight): Promise<void> {
  await must(f.world.attestOpening({ ...pub("opening", 1), opening: f.fx.opening }));
  await must(f.coordinator.establishCanonicalTime({ ...pub("opening", 2), time: f.fx.t0 }));
}

/** The bounded GIP assembly, in the source's order: Basis → institution → office → Scope Binding → Instrument → clauses. */
export async function assembleLegal(f: Freight): Promise<void> {
  const { fx, gip, gipFreight } = f;
  const assembly = { world_id: fx.worldId };
  await must(gipFreight.establishOpeningBasis({ ...pub("legal", 1), assembly }));
  await must(gip.establishInstitution({ ...pub("legal", 2), institution: fx.institution }));
  await must(gip.establishOffice({ ...pub("legal", 3), office: fx.office }));
  await must(gip.establishScopeBinding({ ...pub("legal", 4), scope_binding: fx.scopeBinding }));
  await must(gip.establishGovernanceInstrument({ ...pub("legal", 5), instrument: fx.instrument }));
  await must(gipFreight.establishInstrumentClauses({ ...pub("legal", 6), assembly }));
}

export async function sealReadiness(f: Freight): Promise<void> {
  await must(
    f.gipFreight.sealReadiness({ ...pub("legal", 7), assembly: { world_id: f.fx.worldId } }),
  );
}

/** The whole opening through the Legal Readiness Seal. */
export async function openThroughSeal(f: Freight): Promise<void> {
  await establishSetting(f);
  await attestAndInitialize(f);
  await assembleLegal(f);
  await sealReadiness(f);
}

// ---------------------------------------------------------------------------------------------
// Identities the fixture's sealed premises determine (derived, never asserted to an owner)
// ---------------------------------------------------------------------------------------------

export const keysOf = (fx: FreightWorldFixture) => {
  const originRequestId = economyOriginRequestId(fx.specification.specification_id);
  const entityId = productionOutputReference(originRequestId);
  return {
    condition: worldSiteConditionKey(fx.worldId, fx.siteCondition.condition_id),
    specification: productionMaterialSpecificationKey(fx.specification.specification_id),
    lot: productionInputLotKey(fx.inputLot.lot_id),
    originRequestId,
    originRequest: economyRequestKey(originRequestId),
    entityId,
    entity: worldFallbackEntityKey(fx.worldId, entityId),
  };
};

/** The three owner admissions of the sealed premises: World-State's condition, then Production's prerequisite and lot. */
export async function admitPremises(f: Freight): Promise<void> {
  const { fx } = f;
  await must(
    f.world.admitSiteCondition({
      ...pub("premise", 1),
      condition: { world_id: fx.worldId, slice_id: fx.slices.siteCondition },
    }),
  );
  await must(
    f.productionFreight.admitMaterialSpecification({
      ...pub("premise", 2),
      premise: { world_id: fx.worldId, slice_id: fx.slices.specification },
    }),
  );
  await must(
    f.productionFreight.admitInputLot({
      ...pub("premise", 3),
      premise: { world_id: fx.worldId, slice_id: fx.slices.inputLot },
    }),
  );
}

/** C-05: the lot admission is the owner event that opens Economy's scoped origin resolution. */
export async function originSelfProvision(
  f: Freight,
  ownerEvent = keysOf(f.fx).lot,
): Promise<void> {
  await must(
    f.economy.resolveOriginSelfProvision({
      ...pub("origin", 1),
      resolution: { seal_id: f.fx.sealId, owner_event: ownerEvent },
    }),
  );
}

/** A target-only OOC advance of canonical time (the existing NULL-PC advance context; no player choice is invented). */
export async function advanceTo(f: Freight, id: string, target: CanonicalTime) {
  return f.coordinator.advance(prodAdvanceRequest(id, target));
}

/**
 * Production independently starts the dedicated lot's sealed operation, its temporal object is registered, and canonical
 * time advances to the operation's own declared boundary: Production completes and World-State accepts the SAME entity.
 */
export async function produceAndAccept(f: Freight): Promise<void> {
  const k = keysOf(f.fx);
  const start = f.productionFreight.dedicatedStartInput(k.originRequest)!;
  await must(f.production.startOperation({ ...pub("produce", 1), start }));
  const op = f.production.operation(k.originRequestId)!.value;
  await must(
    f.coordinator.registerObject({
      ...pub("produce", 2),
      object: productionTemporalObject(op, { worldId: f.fx.worldId, locusId: f.fx.originLocusId }),
    }),
  );
  await must(advanceTo(f, "tx-produce", op.timing.completion.at));
}

/** C-06: the World-State acceptance of the output is the owner event that opens Economy's fixation resolution. */
export async function fixFreight(
  f: Freight,
  ownerEvent = keysOf(f.fx).entity,
  n = 1,
): Promise<string> {
  await must(
    f.economy.resolveFreightFixation({
      ...pub("fixation", n),
      resolution: { seal_id: f.fx.sealId, owner_event: ownerEvent },
    }),
  );
  return f.economy.currentRequestRef(f.fx.sealId)!;
}

/** Foundation F through the fixed request E0. */
export async function foundationThroughFixation(f: Freight): Promise<string> {
  await openThroughSeal(f);
  await admitPremises(f);
  await originSelfProvision(f);
  await produceAndAccept(f);
  return fixFreight(f);
}

// ---------------------------------------------------------------------------------------------
// Integration I
// ---------------------------------------------------------------------------------------------

/** Logistics independently admits its Non-Agentive Service Basis from its own sealed slice. */
export async function admitServiceBasis(f: Freight): Promise<void> {
  await must(
    f.logistics.admitServiceBasis({
      ...pub("service", 1),
      service: { world_id: f.fx.worldId, slice_id: f.fx.slices.service },
    }),
  );
}

export const basisIdOf = (f: Freight): string => f.fx.service.basis_id;

/** L0: service admission for one fixed request. */
export async function admitService(f: Freight, requestRef: string, n = 1): Promise<void> {
  await must(
    f.logistics.admitService({
      ...pub("l0", n),
      admission: { request_ref: requestRef, basis_id: basisIdOf(f) },
    }),
  );
}

/** L1 / F3: the first dispatch. */
export async function dispatchFirst(f: Freight, requestRef: string, n = 1): Promise<void> {
  await must(f.logistics.dispatchFirst({ ...pub("l1", n), request: { request_ref: requestRef } }));
}

/** E1: Economy consumes the one directive use against the committed first dispatch. */
export async function consumeUse(f: Freight, requestRef: string, n = 1): Promise<void> {
  await must(f.economy.consumeFirstDispatch({ ...pub("e1", n), request: { request_ref: requestRef } }));
}

/** TE: Temporal registers the original request-derived object and boundary of the dispatched transfer. */
export async function enrollTransfer(f: Freight, n = 1): Promise<void> {
  const { fx } = f;
  const entityId = keysOf(fx).entityId;
  const c = f.campaign.store.getFact(logisticsCommitmentKey(fx.worldId, entityId))!;
  const t = f.campaign.store.getFact(logisticsTransferKey(fx.worldId, entityId))!;
  await must(
    f.coordinator.registerObject({
      ...pub("te", n),
      object: logisticsTemporalObject(
        LogisticsCommitmentSchema.parse(c.value),
        LogisticsTransferSchema.parse(t.value),
      ),
    }),
  );
}

/** The service boundary of the sealed service premise: the earned delivery boundary. */
export const deliveryBoundary = (f: Freight): CanonicalTime => f.fx.service.delivery_boundary_at;

/** Everything through a safely enrolled and consumed first dispatch. */
export async function throughDispatch(f: Freight): Promise<string> {
  const requestRef = await foundationThroughFixation(f);
  await admitServiceBasis(f);
  await admitService(f, requestRef);
  await dispatchFirst(f, requestRef);
  await consumeUse(f, requestRef);
  await enrollTransfer(f);
  return requestRef;
}

/** The full chain: advance to the earned boundary, then Economy's independent adequacy conclusion. */
export async function throughDeliveryAndAdequacy(f: Freight): Promise<string> {
  const requestRef = await throughDispatch(f);
  await must(advanceTo(f, "tx-deliver", deliveryBoundary(f)));
  await must(
    f.economy.recordDestinationAdequacy({ ...pub("ad", 1), request: { request_ref: requestRef } }),
  );
  return requestRef;
}

// ---------------------------------------------------------------------------------------------
// Variants and probes
// ---------------------------------------------------------------------------------------------

/** Writes the typed premises of a (possibly edited) fixture back into its sealed GM envelope, exactly as authored. */
export function syncOpening(fx: FreightWorldFixture): FreightWorldFixture {
  const premiseOf: Record<string, unknown> = {
    [fx.slices.legal]: fx.legal,
    [fx.slices.siteCondition]: fx.siteCondition,
    [fx.slices.specification]: fx.specification,
    [fx.slices.inputLot]: fx.inputLot,
    [fx.slices.service]: fx.service,
  };
  for (const slice of fx.opening.slices)
    if (slice.slice_id in premiseOf) (slice as { premise: unknown }).premise = premiseOf[slice.slice_id];
  return fx;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };

/** An independent copy of a fixture world with ONE authored premise edited, and its sealed envelope kept in step. */
export function variant(
  base: FreightWorldFixture,
  edit: (fx: Mutable<FreightWorldFixture>) => void,
): FreightWorldFixture {
  const fx = cloneFixture(base) as Mutable<FreightWorldFixture>;
  edit(fx);
  return syncOpening(fx as FreightWorldFixture);
}

export const outcome = async (
  p: Promise<{ ok: true; value: unknown } | { ok: false; error: { code: string; message: string; details?: unknown } }>,
): Promise<{ code: string; message: string; details?: unknown; replayed?: boolean }> => {
  const r = await p;
  return r.ok
    ? { code: "OK", message: "", replayed: (r.value as { replayed: boolean }).replayed === true }
    : { code: r.error.code, message: r.error.message, details: r.error.details };
};

/** The number of committed facts of one owner (a probe: "nothing was written"). */
export const countOwner = (f: Freight, owner: string): number =>
  f.campaign.store.listFacts().filter((x) => x.owner === owner).length;
export const countKind = (f: Freight, prefix: string): number =>
  f.campaign.store.listFacts().filter((x) => x.key.startsWith(prefix)).length;
