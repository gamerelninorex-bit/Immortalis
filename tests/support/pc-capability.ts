import {
  CanonicalCampaign,
  PcCapabilityAdapter,
  TemporalCoordinator,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import type { ExistenceContract, PcCapabilityBasis } from "@immortalis/contracts";
import {
  ACTOR_FIXTURE_EXTENSION,
  CAP_SAILING,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  T0,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  pcCapabilityBasis,
  pcCapabilityConsumerObject,
  pcCapabilityContract,
  pcCapabilityProviders,
  pcCapabilityPublication,
  publication,
  temporalPublication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface PcCapabilitySeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly pcs: PcCapabilityAdapter;
}

export const pcCapabilityCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, pcCapabilityProviders());

export interface PcCapabilitySeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  /** release the PC (default true); false leaves the campaign without any PC so a test controls the order */
  readonly releasePc?: boolean;
  /** also bind the released PC as the active role.player_character (default true) */
  readonly bind?: boolean;
  /** the released PC's Existence Contract (default: `pcCapabilityContract()`) */
  readonly contract?: ExistenceContract;
}

const wire = (campaign: CanonicalCampaign): PcCapabilitySeeded => ({
  campaign,
  coordinator: pcCapabilityCoordinator(campaign.store),
  pcs: new PcCapabilityAdapter(campaign.store),
});

/**
 * The prerequisite canonical campaign (world, locus, a released PC whose Existence Contract carries accepted claims, its
 * active binding) and the canonical temporal basis T0. No capability exists yet, and nothing is resolved.
 */
export async function seededPcCapabilityCampaign(
  dir: string,
  o: PcCapabilitySeedOptions = {},
): Promise<PcCapabilitySeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "pc-capability-seed",
      extension: ACTOR_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  if (o.releasePc !== false) {
    await must(
      campaign.releasePlayerCharacter({
        ...publication(3),
        contract: o.contract ?? pcCapabilityContract(),
      }),
    );
    if (o.bind !== false) {
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
  }
  const s = wire(campaign);
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  return s;
}

export async function reopenPcCapability(
  dir: string,
  buildId = "pc-capability-reopen",
): Promise<PcCapabilitySeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: ACTOR_FIXTURE_EXTENSION }),
  );
  return wire(campaign);
}

/** Receives the basis of one already-established PC capability (the PC owner's only authored publication). */
export async function receiveBasis(
  s: PcCapabilitySeeded,
  n: number,
  pcId = FIXTURE_PC_ID,
  capabilityId = CAP_SAILING,
  over: Partial<PcCapabilityBasis> = {},
): Promise<PcCapabilityBasis> {
  const basis = pcCapabilityBasis(pcId, capabilityId, over);
  await must(s.pcs.receiveCapabilityBasis({ ...pcCapabilityPublication(n), capability: basis }));
  return basis;
}

/** Registers the engaged object of one dependent consequence that materially requires the PC capability. */
export async function registerPcConsumer(
  s: PcCapabilitySeeded,
  consumerId: string,
  basis: PcCapabilityBasis,
  tn: number,
): Promise<void> {
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: pcCapabilityConsumerObject(consumerId, basis),
    }),
  );
}

export function pcCapabilitySummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
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
    contract: under(/^pc\/[^/]+\/existence-contract$/),
    capability: under(/^pc\/[^/]+\/capability/),
    actor: under(/^actor\//),
    consumer: under(/^synthetic-capability-consumer\//),
    population: under(/^population\//),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}

export { CAP_SAILING, FIXTURE_CAMPAIGN, FIXTURE_PC_ID };
