import {
  CanonicalCampaign,
  EpistemicAccessAdapter,
  KtiAdapter,
  NamedActorAdapter,
  TemporalCoordinator,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import type {
  AccessEvent,
  CanonicalTime,
  ResolutionRequest,
  TemporalObject,
  KtiDevelopmentObject,
  KtiTransferBasis,
  NamedActorCapabilityBasis,
} from "@immortalis/contracts";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  KTI_FIXTURE_EXTENSION,
  OBJECT_GATE_ROTA,
  SOURCE_SCROLL,
  SOURCE_SPEAKER,
  T0,
  accessEvent,
  accessPublication,
  actorPublication,
  capabilityBasis,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  historyGroup,
  at,
  ktiBasis,
  ktiConsumerBoundaryId,
  ktiConsumerObject,
  ktiObject,
  ktiProviders,
  ktiPublication,
  packetConsumerBoundaryId,
  packetConsumerObject,
  publication,
  sourceGroup,
  temporalPublication,
} from "@immortalis/testkit";
import { defaultHistoryIds } from "./actor.ts";
import { must } from "./temporal.ts";

export interface KtiSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly actors: NamedActorAdapter;
  readonly access: EpistemicAccessAdapter;
  readonly kti: KtiAdapter;
}

export const ktiCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, ktiProviders());

export interface KtiSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  /** also establish the world, locus, a released PC and its active binding (default true) */
  readonly canonical?: boolean;
}

const wire = (campaign: CanonicalCampaign): KtiSeeded => ({
  campaign,
  coordinator: ktiCoordinator(campaign.store),
  actors: new NamedActorAdapter(campaign.store),
  access: new EpistemicAccessAdapter(campaign.store),
  kti: new KtiAdapter(campaign.store),
});

/**
 * The prerequisite canonical campaign (world, locus, released PC, active binding), the committed causal history of three
 * Named Actors, two committed access carriers/contexts and the canonical temporal basis T0. No development object, access
 * event, packet, basis or package exists yet, and nothing is resolved.
 */
export async function seededKtiCampaign(dir: string, o: KtiSeedOptions = {}): Promise<KtiSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "kti-seed",
      extension: KTI_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  if (o.canonical !== false) {
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
  }
  let n = 1;
  for (const actor of [ACTOR_SMITH, ACTOR_SWORD, ACTOR_OTHER])
    for (const id of defaultHistoryIds(actor))
      await must(campaign.store.commit(historyGroup(FIXTURE_CAMPAIGN, n++, id)));
  for (const id of [SOURCE_SPEAKER, SOURCE_SCROLL])
    await must(campaign.store.commit(sourceGroup(FIXTURE_CAMPAIGN, n++, id)));
  const s = wire(campaign);
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  return s;
}

export async function reopenKti(dir: string, buildId = "kti-reopen"): Promise<KtiSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: KTI_FIXTURE_EXTENSION }),
  );
  return wire(campaign);
}

/** A test coordinate strictly after the current canonical time: an engaged object's earned boundary must lie in the future. */
export const boundaryAfterNow = (s: KtiSeeded) => {
  const now = s.coordinator.state()!.value.canonical_time;
  return at(now.value + 10);
};

/**
 * A request that resolves exactly up to one engaged object's earned boundary: target = the boundary, no stop condition, so
 * no remainder is held and the next transaction needs no continuation.
 */
export const requestToBoundary = (
  s: KtiSeeded,
  txId: string,
  objectId: string,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => {
  const object = s.coordinator.object(objectId);
  if (!object?.value.next_boundary) throw new Error(`no engaged boundary for ${objectId}`);
  return requestTo(txId, object.value.next_boundary.at, over);
};

/** The same request with an explicit target: stable across a retired object, so a replay presents the identical request. */
export const requestTo = (
  txId: string,
  target: CanonicalTime,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: txId,
  cause: `cause-${txId}`,
  trigger: { kind: "fixture-advance-request", ref: `ref-${txId}` },
  continues: null,
  requested: { target, condition: null },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

/** The KTI consumer's engaged object with its one earned boundary strictly after the current canonical time. */
export const ktiConsumerObjectAt = (
  s: KtiSeeded,
  consumerId: string,
  basis: KtiTransferBasis,
  over: Partial<TemporalObject> = {},
): TemporalObject =>
  ktiConsumerObject(consumerId, basis, {
    next_boundary: { boundary_id: ktiConsumerBoundaryId(consumerId), at: boundaryAfterNow(s) },
    ...over,
  });

/** Commits the authored BOUNDED_SHARED_ACCESS event (the Epistemic owner's only authored publication). */
export async function establishAccess(
  s: KtiSeeded,
  n: number,
  eventId: string,
  recipient = ACTOR_SMITH,
  over: Partial<AccessEvent> = {},
): Promise<AccessEvent> {
  const event = accessEvent(eventId, recipient, over);
  await must(s.access.establishBoundedSharedAccess({ ...accessPublication(n), event }));
  return event;
}

/** Commits the authored establishment basis of one Named-Actor capability. */
export async function establishCapability(
  s: KtiSeeded,
  n: number,
  actorId: string,
  capabilityId: string,
  over: Partial<NamedActorCapabilityBasis> = {},
): Promise<NamedActorCapabilityBasis> {
  const basis = capabilityBasis(actorId, capabilityId, over);
  await must(s.actors.establishCapabilityBasis({ ...actorPublication(n), capability: basis }));
  return basis;
}

/**
 * Seals one recipient's Accessible Content Packet BEFORE any KTI state exists: an access event, then the engaged object of
 * an earlier dependent consequence that forms the packet (the existing Epistemic packet consumer). `n` is the publication
 * number of the event; the formation registers its object under temporal publication `tn`.
 */
export async function sealPacket(
  s: KtiSeeded,
  n: number,
  tn: number,
  eventId: string,
  recipient = ACTOR_SMITH,
  consumerId = `seal-${eventId}`,
  over: Partial<AccessEvent> = {},
): Promise<AccessEvent> {
  const event = await establishAccess(s, n, eventId, recipient, over);
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: packetConsumerObject(consumerId, event, null, {
        next_boundary: {
          boundary_id: packetConsumerBoundaryId(consumerId),
          at: boundaryAfterNow(s),
        },
      }),
    }),
  );
  await must(
    s.coordinator.advance(
      requestToBoundary(s, `tx-${consumerId}`, `packet-consumer-obj-${consumerId}`),
    ),
  );
  return event;
}

/** Commits the authored Class-A development object (KTI's own definition). */
export async function establishObject(
  s: KtiSeeded,
  n: number,
  objectId = OBJECT_GATE_ROTA,
  over: Partial<KtiDevelopmentObject> = {},
): Promise<KtiDevelopmentObject> {
  const object = ktiObject(objectId, over);
  await must(s.kti.establishDevelopmentObject({ ...ktiPublication(n), object }));
  return object;
}

/** Commits the authored Transfer Package basis resting on a committed object and a sealed packet. */
export async function establishTransfer(
  s: KtiSeeded,
  n: number,
  recipient: string,
  eventId: string,
  objectId = OBJECT_GATE_ROTA,
  over: Partial<KtiTransferBasis> = {},
): Promise<KtiTransferBasis> {
  const transfer = ktiBasis(recipient, eventId, objectId, over);
  await must(s.kti.establishTransferBasis({ ...ktiPublication(n), transfer }));
  return transfer;
}

/** Registers the engaged object of one dependent consequence that materially requires the Transfer Package. */
export async function registerKtiConsumer(
  s: KtiSeeded,
  consumerId: string,
  basis: KtiTransferBasis,
  tn: number,
): Promise<void> {
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: ktiConsumerObjectAt(s, consumerId, basis),
    }),
  );
}

/** Advances toward one KTI consumer's earned boundary and no further. */
export const advanceKti = (s: KtiSeeded, txId: string, consumerId: string) =>
  s.coordinator.advance(requestToBoundary(s, txId, `kti-consumer-obj-${consumerId}`));

export function ktiSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
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
    actor: under(/^actor\//),
    access: under(/^access\//),
    kti: under(/^kti\//),
    consumer: under(/^synthetic-kti-result-consumer\//),
    packetConsumer: under(/^synthetic-packet-consumer\//),
    source: under(/^synthetic-access-source\//),
    history: under(/^synthetic-actor-history\//),
    population: under(/^population\//),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}

export { ACTOR_OTHER, ACTOR_SMITH, ACTOR_SWORD, FIXTURE_CAMPAIGN };
