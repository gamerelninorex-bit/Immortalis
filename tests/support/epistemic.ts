import {
  CanonicalCampaign,
  EpistemicAccessAdapter,
  NamedActorAdapter,
  PcCapabilityAdapter,
  TemporalCoordinator,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import type {
  AccessEvent,
  ExistenceContract,
  NamedActorCapabilityBasis,
  PcCapabilityBasis,
} from "@immortalis/contracts";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_METALWORKING,
  EPISTEMIC_FIXTURE_EXTENSION,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  SOURCE_SCROLL,
  SOURCE_SPEAKER,
  T0,
  accessEvent,
  accessPublication,
  actorPublication,
  capabilityBasis,
  epistemicProviders,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  historyGroup,
  packetConsumerObject,
  pcCapabilityBasis,
  pcCapabilityPublication,
  publication,
  sourceGroup,
  temporalPublication,
} from "@immortalis/testkit";
import { defaultHistoryIds } from "./actor.ts";
import { must } from "./temporal.ts";

export interface EpistemicSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly actors: NamedActorAdapter;
  readonly pcs: PcCapabilityAdapter;
  readonly access: EpistemicAccessAdapter;
}

export const epistemicCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, epistemicProviders());

export interface EpistemicSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  /** also establish the world, locus, a released PC and its active binding (default true) */
  readonly canonical?: boolean;
  /** the released PC's Existence Contract (default `fixtureContract()`; a PC capability basis needs accepted claims) */
  readonly pcContract?: ExistenceContract;
}

const wire = (campaign: CanonicalCampaign): EpistemicSeeded => ({
  campaign,
  coordinator: epistemicCoordinator(campaign.store),
  actors: new NamedActorAdapter(campaign.store),
  pcs: new PcCapabilityAdapter(campaign.store),
  access: new EpistemicAccessAdapter(campaign.store),
});

/**
 * The prerequisite canonical campaign (world, locus, released PC, active binding), the committed causal history of three
 * Named Actors (the facts a capability basis may pin), two committed access carriers/contexts, and the canonical temporal
 * basis T0. No capability, no access event and no packet exists yet, and nothing is resolved.
 */
export async function seededEpistemicCampaign(
  dir: string,
  o: EpistemicSeedOptions = {},
): Promise<EpistemicSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "access-seed",
      extension: EPISTEMIC_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  if (o.canonical !== false) {
    await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
    await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
    await must(
      campaign.releasePlayerCharacter({
        ...publication(3),
        contract: o.pcContract ?? fixtureContract(),
      }),
    );
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

export async function reopenEpistemic(
  dir: string,
  buildId = "access-reopen",
): Promise<EpistemicSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: EPISTEMIC_FIXTURE_EXTENSION }),
  );
  return wire(campaign);
}

/** Commits the authored BOUNDED_SHARED_ACCESS event (the Epistemic owner's only authored publication). */
export async function establishAccess(
  s: EpistemicSeeded,
  n: number,
  eventId: string,
  recipient = ACTOR_SMITH,
  over: Partial<AccessEvent> = {},
): Promise<AccessEvent> {
  const event = accessEvent(eventId, recipient, over);
  await must(s.access.establishBoundedSharedAccess({ ...accessPublication(n), event }));
  return event;
}

/** Commits the authored establishment basis of one Named-Actor capability (the actor owner's only authored publication). */
export async function establishCapability(
  s: EpistemicSeeded,
  n: number,
  actorId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  over: Partial<NamedActorCapabilityBasis> = {},
): Promise<NamedActorCapabilityBasis> {
  const basis = capabilityBasis(actorId, capabilityId, over);
  await must(s.actors.establishCapabilityBasis({ ...actorPublication(n), capability: basis }));
  return basis;
}

/** Receives the basis of one already-established PC capability (the PC owner's only authored publication). */
export async function establishPcCapability(
  s: EpistemicSeeded,
  n: number,
  pcId = FIXTURE_PC_ID,
  capabilityId = CAP_METALWORKING,
  over: Partial<PcCapabilityBasis> = {},
): Promise<PcCapabilityBasis> {
  const basis = pcCapabilityBasis(pcId, capabilityId, over);
  await must(s.pcs.receiveCapabilityBasis({ ...pcCapabilityPublication(n), capability: basis }));
  return basis;
}

/** Registers the engaged object of one dependent consequence that materially requires the recipient's packet. */
export async function registerPacketConsumer(
  s: EpistemicSeeded,
  consumerId: string,
  event: AccessEvent,
  basis: NamedActorCapabilityBasis | PcCapabilityBasis | null,
  tn: number,
): Promise<void> {
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: packetConsumerObject(consumerId, event, basis),
    }),
  );
}

export function epistemicSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
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
    consumer: under(/^synthetic-packet-consumer\//),
    source: under(/^synthetic-access-source\//),
    history: under(/^synthetic-actor-history\//),
    population: under(/^population\//),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}

export { ACTOR_OTHER, ACTOR_SMITH, ACTOR_SWORD, CAP_METALWORKING, FIXTURE_CAMPAIGN };
