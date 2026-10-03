import {
  CanonicalCampaign,
  NamedActorAdapter,
  TemporalCoordinator,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import type {
  NamedActorCapabilityBasis,
  NamedActorRandomizedEstablishment,
} from "@immortalis/contracts";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_METALWORKING,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  T0,
  actorProviders,
  actorPublication,
  capabilityBasis,
  capabilityConsumerObject,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  historyGroup,
  publication,
  randomizedEstablishment,
  seededEntropy,
  RESOLVER,
  SEED_1,
  temporalPublication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface ActorSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly actors: NamedActorAdapter;
  /** the trusted-runtime entropy fixture behind the actor owner's Causal Draws; counts how often it was asked */
  readonly entropy: ReturnType<typeof seededEntropy>;
}

export const actorCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, actorProviders());

export interface ActorSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  readonly entropy?: ReturnType<typeof seededEntropy>;
  /** also establish the world, locus, a released PC and its active binding (default true) */
  readonly canonical?: boolean;
}

const wire = (
  campaign: CanonicalCampaign,
  entropy: ReturnType<typeof seededEntropy> = seededEntropy(SEED_1),
): ActorSeeded => ({
  campaign,
  entropy,
  coordinator: actorCoordinator(campaign.store),
  actors: new NamedActorAdapter(campaign.store, { entropy }),
});

/** The history ids a basis built by `capabilityBasis(actor, …)` pins by default. */
export const defaultHistoryIds = (actorId: string): string[] => [
  `${actorId}-biography`,
  `${actorId}-occupation`,
];

/**
 * The prerequisite canonical campaign (world, locus, released PC, active binding), the canonical temporal basis T0 and
 * the committed causal history of three Named Actors. No capability exists yet, and nothing is resolved.
 */
export async function seededActorCampaign(
  dir: string,
  o: ActorSeedOptions = {},
): Promise<ActorSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "actor-seed",
      extension: ACTOR_FIXTURE_EXTENSION,
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
  const s = wire(campaign, o.entropy);
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  return s;
}

export async function reopenActor(
  dir: string,
  buildId = "actor-reopen",
  entropy?: ReturnType<typeof seededEntropy>,
): Promise<ActorSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: ACTOR_FIXTURE_EXTENSION }),
  );
  return wire(campaign, entropy);
}

/** Commits the authored establishment basis of one capability (the actor owner's only authored publication). */
export async function establishBasis(
  s: ActorSeeded,
  n: number,
  actorId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  over: Partial<NamedActorCapabilityBasis> = {},
): Promise<NamedActorCapabilityBasis> {
  const basis = capabilityBasis(actorId, capabilityId, over);
  await must(s.actors.establishCapabilityBasis({ ...actorPublication(n), capability: basis }));
  return basis;
}

/**
 * Commits the randomized establishment of one capability (WS-016 §16 steps 3–4): the owner's bounded prior is drawn by
 * the Causal Draw, then the owner's own basis is committed by reference to that result. Returns the committed basis.
 */
export async function establishRandomized(
  s: ActorSeeded,
  n: number,
  over: Partial<NamedActorRandomizedEstablishment> = {},
  actorId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
): Promise<NamedActorCapabilityBasis> {
  await must(
    s.actors.establishRandomizedCapabilityBasis({
      ...actorPublication(n),
      capability: randomizedEstablishment(actorId, capabilityId, over),
      resolution: RESOLVER,
    }),
  );
  return s.actors.basis(actorId, capabilityId)!.value;
}

/** Registers the engaged object of one dependent consequence that materially requires the capability. */
export async function registerConsumer(
  s: ActorSeeded,
  consumerId: string,
  basis: NamedActorCapabilityBasis,
  tn: number,
): Promise<void> {
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: capabilityConsumerObject(consumerId, basis),
    }),
  );
}

export function actorSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
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
    consumer: under(/^synthetic-capability-consumer\//),
    history: under(/^synthetic-actor-history\//),
    population: under(/^population\//),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}

export { ACTOR_OTHER, ACTOR_SMITH, ACTOR_SWORD, CAP_METALWORKING, FIXTURE_CAMPAIGN };
