// SYNTHETIC TEST SUPPORT for S1-P1 (typed acoustic profile on a locus, W1 actor raw sensory state, W2b acoustic emission).
// The owners are the real ones. Every physical fact is submitted as a RAW SOURCE FACT through real owner admission (or, for the
// forged histories, through a raw store with no admission): no fixture ever asserts the evaluator's output, an individual
// perception, a Health availability or a flag that says "can hear". MECHANISM-ONLY evidence: no Health, no receipt, no player state.
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  NamedActorAdapter,
  TemporalCoordinator,
  WORLD_AUDITORY_PREMISES_RULE,
  createFileCampaign,
  factKind,
  evaluateAuditoryPremises,
  type AuditoryPremisesResult,
  type CampaignStore,
} from "@immortalis/engine";
import {
  CANON_WRITE_AUTHORITY,
  FACET_WORLD_FALLBACK_ENTITY,
  FACET_WORLD_LOCUS,
  OWNER_WORLD_STATE,
  actorPhysicalPresenceKey,
  actorRawSensoryStateKey,
  comparePlacementPins,
  worldAcousticEmissionKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  ACTOR_FIXTURE_EXTENSION,
  FIXTURE_CAMPAIGN,
  T0,
  actorProviders,
  actorPublication,
  capabilityConsumerObject,
  consumerAdvanceRequest,
  fixtureLocus,
  fixtureWorld,
  group,
  publication,
  temporalPublication,
  write,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";
import {
  A,
  L,
  L2,
  R1_BASIS,
  W,
  commitClosure,
  commitPlacement,
  commitPresence,
  establishClock,
  fullChain,
  wire,
  type R1Scene,
} from "./actor-presence.ts";

export { A, L, L2, W, fullChain, type R1Scene };

export const EMITTER = "emitter-hall-gong";
export const EMITTER_2 = "emitter-second-bell";
export const EMISSION = "emission-gong-1";
export const RAW_KEY = actorRawSensoryStateKey(A);
export const EMISSION_KEY = worldAcousticEmissionKey(W, L, EMISSION);
export const LOCUS_KEY = worldLocusKey(W, L);

const ref = (key: string, id: string) => ({ fact_key: key, entity_id: id });

/** A qualifying typed whole-locus profile with an independently described concrete environmental emitter. */
export const acousticProfile = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  channel: "AIRBORNE_SOUND",
  scope: "FULL_LOCUS",
  coverage: "FULL_LOCUS_STRONG",
  coverage_basis: {
    whole_locus_reach:
      "The vaulted stone hall is one undivided volume of air: a struck note reaches every place within it.",
    no_material_obstruction:
      "No wall, screen, hanging or fixture stands inside the hall to break the open air between any two places in it.",
    no_material_attenuation:
      "The bare stone and the open vault deaden nothing of consequence: no crowd, padding or drapery absorbs a note.",
  },
  exclusions: [],
  environmental_emitter_basis: {
    emitter_id: EMITTER,
    physical_source_statement: "A bronze gong hangs on a chain from the central beam of the hall.",
    bounded_impulse_possible_statement:
      "Its beam can settle and strike the gong once, ringing a single bounded note.",
  },
  ...over,
});

export interface P1Options {
  /** the first locus' typed profile: a value, or false for a locus authored WITHOUT one */
  readonly profile?: Record<string, unknown> | false;
  /** a second locus (id L2) of the world: plain, or carrying its own typed profile with a different emitter */
  readonly extras?: boolean | "profiled";
  /** free-text constraints authored on the first locus (an untyped statement, which is never a profile) */
  readonly constraints?: readonly { aspect: string; statement: string }[];
  readonly buildId?: string;
}

/** A world, a locus carrying (by default) the typed profile, and the actor's pre-Temporal basis. Nothing placed or closed. */
export async function p1Scene(dir: string, o: P1Options = {}): Promise<R1Scene> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "s1-p1",
      extension: ACTOR_FIXTURE_EXTENSION,
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  const profile = o.profile === false ? undefined : (o.profile ?? acousticProfile());
  await must(
    campaign.establishLocus({
      ...publication(2),
      locus: fixtureLocus({
        ...(profile === undefined ? {} : ({ acoustic_profile_v1: profile } as never)),
        ...(o.constraints === undefined ? {} : { constraints: [...o.constraints] }),
      }),
    }),
  );
  if (o.extras) {
    await must(
      campaign.establishLocus({
        ...publication(3),
        locus: fixtureLocus({
          locus_id: L2,
          designation: "A second stone hall",
          ...(o.extras === "profiled"
            ? ({
                acoustic_profile_v1: acousticProfile({
                  coverage_basis: {
                    whole_locus_reach:
                      "The second hall is one undivided volume of air from wall to wall.",
                    no_material_obstruction:
                      "Nothing stands in the second hall to break the open air.",
                    no_material_attenuation:
                      "The second hall's bare stone deadens nothing of consequence.",
                  },
                  environmental_emitter_basis: {
                    emitter_id: EMITTER_2,
                    physical_source_statement:
                      "A cracked bell hangs in the second hall's tower arch.",
                    bounded_impulse_possible_statement:
                      "A loose clapper can fall once against the cracked bell.",
                  },
                }),
              } as never)
            : {}),
        }),
      }),
    );
  }
  const s = wire(campaign);
  await must(s.actors.establishCapabilityBasis({ ...actorPublication(1), capability: R1_BASIS }));
  return s;
}

const sortedPins = (pins: readonly { fact_key: string; version: number }[]) =>
  [...pins].sort(comparePlacementPins);

export const rawSensoryValue = (over: Record<string, unknown> = {}, actor = A, locus = L) => ({
  actor_id: actor,
  world: ref(worldProfileKey(W), W),
  locus: ref(worldLocusKey(W, locus), locus),
  presence: { fact_key: actorPhysicalPresenceKey(actor), version: 1 },
  modality: "AIRBORNE_HEARING",
  physical_form_statement:
    "The smith's ears are ordinary human ears, open and undamaged, with a clear passage to the inner ear on both sides.",
  raw_transduction: "PRESENT",
  ordinary_receptivity: "RECEPTIVE",
  source_provenance:
    "World-State physical fallback custodian: the smith's bodily form as authored in the setting's source text.",
  effective_instant: T0,
  dependency_refs: sortedPins([
    { fact_key: worldProfileKey(W), version: 1 },
    { fact_key: worldLocusKey(W, locus), version: 1 },
    { fact_key: actorPhysicalPresenceKey(actor), version: 1 },
  ]),
  ...over,
});

export const emissionValue = (over: Record<string, unknown> = {}, locus = L) => ({
  emission_id: EMISSION,
  world: ref(worldProfileKey(W), W),
  locus: ref(worldLocusKey(W, locus), locus),
  profile_locus_version: 1,
  emitter_id: EMITTER,
  emitting_source: { fact_key: worldLocusKey(W, locus), version: 1 },
  channel: "AIRBORNE_SOUND",
  audible_material: "One deep bronze note, struck once, ringing for a few breaths.",
  event_instant: T0,
  source_provenance:
    "World-State event record: the gong's beam settled and struck it at the committed event basis.",
  ...over,
});

let counter = 0;

/** A World-State group writing one P1 fact, reading and depending on each pinned fact at its current version. */
export function p1Group(
  store: Pick<CampaignStore, "getFact">,
  key: string,
  value: unknown,
  pins: readonly string[],
  facet: string,
  over: Partial<CommitGroup> = {},
  expectedVersion = 0,
): CommitGroup {
  counter++;
  const facts = pins.map((k) => store.getFact(k));
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: `p1-group-${counter}`,
    intent_id: `p1-intent-${counter}`,
    owner: OWNER_WORLD_STATE,
    facet,
    cause: `p1-cause-${counter}`,
    rule: WORLD_AUDITORY_PREMISES_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: pins.map((k, i) => ({ key: k, version: facts[i]?.version ?? 1 })),
    depends_on: [...new Set(facts.flatMap((f) => (f ? [f.provenance.group_id] : [])))],
    writes: [
      {
        key,
        owner: OWNER_WORLD_STATE,
        facet,
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

export const rawPins = (actor = A, locus = L) => [
  worldProfileKey(W),
  worldLocusKey(W, locus),
  actorPhysicalPresenceKey(actor),
  "temporal/state",
];
export const emissionPins = (locus = L) => [
  worldProfileKey(W),
  worldLocusKey(W, locus),
  `world/${W}/setup-closure`,
  "temporal/state",
];

export const commitRaw = (
  s: Pick<R1Scene, "campaign">,
  over: Record<string, unknown> = {},
  actor = A,
  locus = L,
  group: Partial<CommitGroup> = {},
) =>
  s.campaign.store.commit(
    p1Group(
      s.campaign.store,
      actorRawSensoryStateKey(actor),
      rawSensoryValue(over, actor, locus),
      rawPins(actor, locus),
      FACET_WORLD_FALLBACK_ENTITY,
      group,
    ),
  );

export const commitEmission = (
  s: Pick<R1Scene, "campaign">,
  over: Record<string, unknown> = {},
  locus = L,
  group: Partial<CommitGroup> = {},
  id = EMISSION,
) =>
  s.campaign.store.commit(
    p1Group(
      s.campaign.store,
      worldAcousticEmissionKey(W, locus, id),
      emissionValue({ emission_id: id, ...over }, locus),
      emissionPins(locus),
      FACET_WORLD_LOCUS,
      group,
    ),
  );

/** The full lawful S1-P1 chain: profiled locus → basis → B1 → closure → clock → B2 → W1 → emission. */
export async function p1Chain(s: R1Scene): Promise<void> {
  await fullChain(s);
  await must(commitRaw(s));
  await must(commitEmission(s));
}

/** Advances Temporal canonical time from T0 to the declared boundary TB through a real resolution transaction. */
export async function advanceTime(s: R1Scene, n = 1): Promise<void> {
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(20 + n),
      object: capabilityConsumerObject(`adv${n}`, s.basis),
    }),
  );
  await must(s.coordinator.advance(consumerAdvanceRequest(`tx-adv${n}`, `adv${n}`)));
}

export const evaluate = (
  s: Pick<R1Scene, "campaign">,
  over: Partial<{ actor_id: string; world_id: string; locus_id: string; emission_id: string }> = {},
): AuditoryPremisesResult =>
  evaluateAuditoryPremises(s.campaign.store, {
    actor_id: A,
    world_id: W,
    locus_id: L,
    emission_id: EMISSION,
    ...over,
  });

export { commitClosure, commitPlacement, commitPresence, establishClock };

// ---------------------------------------------------------------------------------------------
// A package built by a store with NO admission: a consistent, replayable history that is not canonical.
// ---------------------------------------------------------------------------------------------

export interface RogueP1 {
  readonly store: CampaignStore;
  readonly view: R1Scene;
}

/** A raw store (no admission) holding the world, a locus (typed profile by default) and the actor's pre-Temporal basis. */
export async function rogueP1(
  dir: string,
  o: { profile?: Record<string, unknown> | false } = {},
): Promise<RogueP1> {
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
  const profile = o.profile === false ? undefined : (o.profile ?? acousticProfile());
  await must(
    store.commit(
      group(
        FIXTURE_CAMPAIGN,
        902,
        [
          write(
            worldLocusKey(W, L),
            fixtureLocus(
              profile === undefined ? {} : ({ acoustic_profile_v1: profile } as never),
            ) as never,
            { owner: "world_state", facet: "world_locus" },
          ),
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
  const view: R1Scene = {
    campaign: { store } as never,
    coordinator: new TemporalCoordinator(store, actorProviders()),
    actors,
    basis: R1_BASIS,
  };
  return { store, view };
}
