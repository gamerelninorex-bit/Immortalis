import {
  CanonicalCampaign,
  NamedActorAdapter,
  PcCapabilityAdapter,
  TemporalCoordinator,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  EXISTING_ACTOR_COMPILATION,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  type ExistenceContract,
  type ExistingActorSourcePin,
  type NamedActorCapabilityBasis,
} from "@immortalis/contracts";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_METALWORKING,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  T0,
  actorProviders,
  actorPublication,
  capabilityBasis,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  historyGroup,
  publication,
  seededEntropy,
  SEED_1,
  temporalPublication,
} from "@immortalis/testkit";
import { defaultHistoryIds } from "./actor.ts";
import { must } from "./temporal.ts";

/**
 * SYNTHETIC TEST SUPPORT for the existing-actor I-002 compilation slice. The owners are the real ones; only the history
 * source and the consumer are fixtures (shared with the Named-Actor slice).
 */
export interface ExistingActorSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly actors: NamedActorAdapter;
  readonly pcs: PcCapabilityAdapter;
}

export const wireExistingActor = (campaign: CanonicalCampaign): ExistingActorSeeded => ({
  campaign,
  coordinator: new TemporalCoordinator(campaign.store, actorProviders()),
  actors: new NamedActorAdapter(campaign.store, { entropy: seededEntropy(SEED_1) }),
  pcs: new PcCapabilityAdapter(campaign.store),
});

export interface ExistingActorSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
}

/**
 * A world and a locus (so a binding could be attempted), the committed causal history of three Named Actors and the
 * canonical temporal basis T0. No Player Character is released or bound: the binding slot is NULL and every identity is a
 * free actor identity until a test says otherwise.
 */
export async function seededExistingActorCampaign(
  dir: string,
  o: ExistingActorSeedOptions = {},
): Promise<ExistingActorSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "existing-actor-seed",
      extension: ACTOR_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  let n = 1;
  for (const actor of [ACTOR_SMITH, ACTOR_SWORD, ACTOR_OTHER])
    for (const id of defaultHistoryIds(actor))
      await must(campaign.store.commit(historyGroup(FIXTURE_CAMPAIGN, n++, id)));
  const s = wireExistingActor(campaign);
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  return s;
}

export async function reopenExistingActor(
  dir: string,
  buildId = "existing-actor-reopen",
): Promise<ExistingActorSeeded> {
  return wireExistingActor(
    await must(CanonicalCampaign.open(dir, { buildId, extension: ACTOR_FIXTURE_EXTENSION })),
  );
}

/** Commits the actor owner's establishment basis of one capability (the already-existing actor's authoritative state). */
export async function establishActorBasis(
  s: Pick<ExistingActorSeeded, "actors">,
  n: number,
  actorId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  over: Partial<NamedActorCapabilityBasis> = {},
): Promise<NamedActorCapabilityBasis> {
  const basis = capabilityBasis(actorId, capabilityId, over);
  await must(s.actors.establishCapabilityBasis({ ...actorPublication(n), capability: basis }));
  return basis;
}

/** The pin of one committed Named-Actor fact (a freshly committed sealed fact is at version 1). */
export const actorBasisPin = (
  actorId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  version = 1,
): ExistingActorSourcePin => ({
  owner: "named_actor",
  fact_key: actorCapabilityBasisKey(actorId, capabilityId),
  version,
});
export const actorCapabilityPin = (
  actorId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  version = 1,
): ExistingActorSourcePin => ({
  owner: "named_actor",
  fact_key: actorCapabilityKey(actorId, capabilityId),
  version,
});

/**
 * An Existence Contract that compiles an already-existing actor: every claim SAFELY-INHERITED, no player overrides, and the
 * explicit classification pinning the actor's own committed state.
 */
export const existingActorContract = (
  actorId = ACTOR_SMITH,
  sources: readonly ExistingActorSourcePin[] = [actorBasisPin(actorId)],
  over: Partial<ExistenceContract> = {},
): ExistenceContract => {
  const inherited = (statement: string) => ({
    statement: `SYNTHETIC FIXTURE: ${statement}`,
    provenance: "SAFELY-INHERITED" as const,
  });
  return fixtureContract({
    pc_id: actorId,
    identity_agency: inherited("the actor's one continuing agency."),
    contact: { kind: "CONTACT_ANCHOR", surfaces: [inherited("a visible form.")] },
    embodiment_topology: inherited("one body."),
    continuity_rule: inherited("continuity follows the one body."),
    baseline_exception: {
      safely_inherited: [inherited("an inherited baseline claim.")],
      player_overrides: [],
      hypotheses: [],
      unresolved: [],
    },
    entry_envelope: { items: [] },
    existing_actor_compilation: {
      classification: EXISTING_ACTOR_COMPILATION,
      source_state: sources.map((s) => ({ ...s })),
    },
    ...over,
  });
};

export const compilationPublication = (n: number) => ({
  group_id: `compile-group-${n}`,
  intent_id: `compile-intent-${n}`,
  cause: `compile-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** Compiles the existing actor through the one I-002 publication path (`releasePlayerCharacter`). */
export async function compileExistingActor(
  s: Pick<ExistingActorSeeded, "campaign">,
  n: number,
  contract: ExistenceContract = existingActorContract(),
) {
  return s.campaign.releasePlayerCharacter({ ...compilationPublication(n), contract });
}

/** The binding input a caller would present for the ordinary first ACTIVATION. */
export const bindingInput = (pcId: string, n: number) => ({
  ...publication(n, { group_id: `bind-group-${n}`, intent_id: `bind-intent-${n}` }),
  pc_id: pcId,
  world_id: FIXTURE_WORLD_ID,
  locus_id: FIXTURE_LOCUS_ID,
  insertion: fixtureInsertionFact(),
});

export function existingActorSummary(
  campaign: CanonicalCampaign,
  coordinator: TemporalCoordinator,
) {
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
    pc_capability: under(/^pc\/[^/]+\/capability/),
    binding: under(/^role-registry\//),
    actor: under(/^actor\//),
    consumer: under(/^synthetic-capability-consumer\//),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}

export type { CampaignStore };
