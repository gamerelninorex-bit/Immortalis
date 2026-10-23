// SYNTHETIC TEST SUPPORT for R1 Stage-One v1.1 (actor setup placement B1, world setup closure, first actor physical presence B2).
// The owners are the real ones. The chain is MECHANISM-ONLY evidence: no perception, no faculty, no Health, no movement. The actor's
// pre-Temporal Named-Actor basis is caused by a committed World-State fact (the locus), a foreign non-kernel cause; whether that
// cause semantically supports the marker is an authoring-content question these fixtures cannot prove.
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  NamedActorAdapter,
  TemporalCoordinator,
  WORLD_ACTOR_PRESENCE_RULE,
  createFileCampaign,
  factKind,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  NON_PC_INITIAL,
  OWNER_WORLD_STATE,
  CANON_WRITE_AUTHORITY,
  actorCapabilityBasisKey,
  actorPhysicalPresenceKey,
  actorSetupPlacementKey,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
  type CommitGroup,
  type NamedActorCapabilityBasis,
} from "@immortalis/contracts";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_SMITH,
  CAP_METALWORKING,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  T0,
  actorProviders,
  actorPublication,
  capabilityBasis,
  fixtureLocus,
  fixtureWorld,
  group,
  publication,
  temporalPublication,
  write,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export const A = ACTOR_SMITH;
export const CAP = CAP_METALWORKING;
export const W = FIXTURE_WORLD_ID;
export const L = FIXTURE_LOCUS_ID;
export const L2 = "locus-fixture-2";
export const W2 = "world-fixture-2";
export const PLACEMENT_KEY = actorSetupPlacementKey(A);
export const CLOSURE_KEY = worldSetupClosureKey(W);
export const PRESENCE_KEY = actorPhysicalPresenceKey(A);

export interface R1Scene {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly actors: NamedActorAdapter;
  readonly basis: NamedActorCapabilityBasis;
}

export const wire = (campaign: CanonicalCampaign): R1Scene => ({
  campaign,
  coordinator: new TemporalCoordinator(campaign.store, actorProviders()),
  actors: new NamedActorAdapter(campaign.store),
  basis: R1_BASIS,
});

/** The actor's causally determined basis: its only cause is the committed World-State locus (a foreign, non-kernel fact). */
export const R1_BASIS: NamedActorCapabilityBasis = capabilityBasis(A, CAP, {
  establishment: {
    method: "CAUSALLY_DETERMINED",
    causes: [
      {
        aspect: "BIOGRAPHY_HISTORY",
        owner: OWNER_WORLD_STATE,
        fact_key: worldLocusKey(W, L),
        version: 1,
      },
    ],
  },
});

export const reopen = async (dir: string, buildId = "r1-reopen") =>
  wire(await must(CanonicalCampaign.open(dir, { buildId, extension: ACTOR_FIXTURE_EXTENSION })));

export interface R1Options {
  /** a second locus (id L2) of the world, and a second world W2 */
  readonly extras?: boolean;
  /** skip the actor's basis */
  readonly noBasis?: boolean;
  readonly buildId?: string;
}

/** A world, its loci and the actor's pre-Temporal basis. Nothing placed, nothing closed, no canonical time. */
export async function r1Scene(dir: string, o: R1Options = {}): Promise<R1Scene> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "r1-presence",
      extension: ACTOR_FIXTURE_EXTENSION,
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  if (o.extras) {
    await must(
      campaign.establishLocus({
        ...publication(3),
        locus: fixtureLocus({ locus_id: L2, designation: "A second stone hall" }),
      }),
    );
    await must(
      campaign.establishWorld({ ...publication(4), world: fixtureWorld({ world_id: W2 }) }),
    );
  }
  const s = wire(campaign);
  if (!o.noBasis)
    await must(s.actors.establishCapabilityBasis({ ...actorPublication(1), capability: R1_BASIS }));
  return s;
}

const ref = (key: string, id: string) => ({ fact_key: key, entity_id: id });

export const placementValue = (over: Record<string, unknown> = {}, actor = A, locus = L) => ({
  actor_id: actor,
  world: ref(worldProfileKey(W), W),
  locus: ref(worldLocusKey(W, locus), locus),
  actor_state: [
    { owner: "named_actor", fact_key: actorCapabilityBasisKey(actor, CAP), version: 1 },
  ],
  pinned_versions: { world: 1, locus: 1 },
  statement: "The smith is placed at the stone hall at the opening of the story.",
  ...over,
});

export const closureValue = (
  placements: readonly { fact_key: string; version: number }[],
  world = W,
) => ({
  world: ref(worldProfileKey(world), world),
  placements: placements.map((p) => ({ ...p })),
});

export const presenceValue = (over: Record<string, unknown> = {}, actor = A, locus = L) => ({
  actor_id: actor,
  world: ref(worldProfileKey(W), W),
  locus: ref(worldLocusKey(W, locus), locus),
  pinned_versions: { world: 1, locus: 1, placement: 1, closure: 1 },
  effective_instant: T0,
  initial_custody: NON_PC_INITIAL,
  custodian: {
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_FALLBACK_ENTITY,
    basis: FALLBACK_BASIS,
  },
  ...over,
});

let counter = 0;

/** A World-State group writing one R1 fact, reading and depending on each pinned fact at its current version. */
export function r1Group(
  store: Pick<CampaignStore, "getFact">,
  key: string,
  value: unknown,
  pins: readonly string[],
  over: Partial<CommitGroup> = {},
  expectedVersion = 0,
): CommitGroup {
  counter++;
  const facts = pins.map((k) => store.getFact(k));
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: `r1-group-${counter}`,
    intent_id: `r1-intent-${counter}`,
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_FALLBACK_ENTITY,
    cause: `r1-cause-${counter}`,
    rule: WORLD_ACTOR_PRESENCE_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: pins.map((k, i) => ({ key: k, version: facts[i]?.version ?? 1 })),
    depends_on: [...new Set(facts.flatMap((f) => (f ? [f.provenance.group_id] : [])))],
    writes: [
      {
        key,
        owner: OWNER_WORLD_STATE,
        facet: FACET_WORLD_FALLBACK_ENTITY,
        value: value as never,
        unit: null,
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        expected_version: expectedVersion,
      },
    ],
    ...over,
  };
}

const worldPins = (locus = L) => [worldProfileKey(W), worldLocusKey(W, locus)];

export const commitPlacement = (
  s: R1Scene,
  over: Record<string, unknown> = {},
  actor = A,
  locus = L,
) =>
  s.campaign.store.commit(
    r1Group(s.campaign.store, actorSetupPlacementKey(actor), placementValue(over, actor, locus), [
      actorCapabilityBasisKey(actor, CAP),
      ...worldPins(locus),
    ]),
  );

export const commitClosure = (
  s: R1Scene,
  placements: readonly { fact_key: string; version: number }[] = [
    { fact_key: PLACEMENT_KEY, version: 1 },
  ],
  world = W,
) =>
  s.campaign.store.commit(
    r1Group(s.campaign.store, worldSetupClosureKey(world), closureValue(placements, world), [
      worldProfileKey(world),
      ...placements.map((p) => p.fact_key),
    ]),
  );

export const establishClock = (s: R1Scene, n = 1, time: unknown = T0) =>
  s.coordinator.establishCanonicalTime({ ...temporalPublication(n), time });

export const commitPresence = (
  s: R1Scene,
  over: Record<string, unknown> = {},
  actor = A,
  locus = L,
) =>
  s.campaign.store.commit(
    r1Group(s.campaign.store, actorPhysicalPresenceKey(actor), presenceValue(over, actor, locus), [
      ...worldPins(locus),
      actorSetupPlacementKey(actor),
      worldSetupClosureKey(W),
      "temporal/state",
    ]),
  );

/** The full lawful stage-one chain: basis → B1 → closure → initial Temporal establishment → B2. */
export async function fullChain(s: R1Scene): Promise<void> {
  await must(commitPlacement(s));
  await must(commitClosure(s));
  await must(establishClock(s));
  await must(commitPresence(s));
}

export const code = async (
  p: Promise<{ ok: boolean; error?: { code: string } }>,
): Promise<string> => {
  const r = await p;
  return r.ok ? "OK" : (r.error?.code ?? "?");
};

// ---------------------------------------------------------------------------------------------
// A package built by a store with NO admission: a consistent, replayable history that is not canonical.
// ---------------------------------------------------------------------------------------------

export interface RogueScene {
  readonly store: CampaignStore;
  readonly coordinator: TemporalCoordinator;
  readonly actors: NamedActorAdapter;
}

/** A raw store (no admission) holding the world, the locus and the actor's pre-Temporal basis. */
export async function rogueScene(dir: string): Promise<RogueScene> {
  const store = await must(
    createFileCampaign(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
    }),
  );
  await must(
    store.commit(
      group(
        FIXTURE_CAMPAIGN,
        901,
        [
          write(worldProfileKey(W), fixtureWorld() as never, {
            owner: "world_state",
            facet: "world_profile",
          }),
        ],
        { owner: "world_state", facet: "world_profile", rule: factKind("world_profile").rule },
      ),
    ),
  );
  await must(
    store.commit(
      group(
        FIXTURE_CAMPAIGN,
        902,
        [
          write(worldLocusKey(W, L), fixtureLocus() as never, {
            owner: "world_state",
            facet: "world_locus",
          }),
        ],
        {
          owner: "world_state",
          facet: "world_locus",
          rule: factKind("world_locus").rule,
          reads: [{ key: worldProfileKey(W), version: 1 }],
          depends_on: ["group-901"],
        },
      ),
    ),
  );
  const actors = new NamedActorAdapter(store);
  await must(actors.establishCapabilityBasis({ ...actorPublication(1), capability: R1_BASIS }));
  return { store, coordinator: new TemporalCoordinator(store, actorProviders()), actors };
}

export const rogueView = (r: RogueScene): R1Scene => ({
  campaign: { store: r.store } as never,
  coordinator: r.coordinator,
  actors: r.actors,
  basis: R1_BASIS,
});
