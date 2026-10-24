/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and tamper with arbitrary fact values */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  CausalDrawAdapter,
  createFileCampaign,
  NamedActorAdapter,
  factKind,
  PcCapabilityAdapter,
  TemporalCoordinator,
  pcCapabilityDrawDigest as pcCapabilityDrawDigestOf,
  pcCapabilityDrawSpecification,
  pcRuleAuthority,
  pcSlotInspector,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  EXISTING_ACTOR_COMPILATION,
  EXISTING_ACTOR_HANDOVER,
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  causalDrawResultGroupId,
  causalDrawResultKey,
  parseCapabilityCandidateId,
  pcCapabilityBasisKey,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type ExistenceContract,
  type ExistingActorSourcePin,
  type NamedActorCapabilityBasis,
  type PcExistingActorEstablishmentInput,
  type PcExistingActorRandomizedEstablishmentInput,
  type TemporalObject,
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
  at,
  actorProviders,
  actorPublication,
  capabilityBasis,
  capabilityConsumerObject,
  consumerAdvanceRequest,
  consumerBoundaryId,
  consumerObjectId,
  continuationInput,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  group,
  historyGroup,
  pcCapabilityConsumerObject,
  randomizedEstablishment,
  RESOLVER,
  write,
  publication,
  seededEntropy,
  SEED_1,
  temporalPublication,
} from "@immortalis/testkit";
import { defaultHistoryIds } from "./actor.ts";
import { pcCapabilityCoordinator } from "./pc-capability.ts";
import { must } from "./temporal.ts";
import { tempDir } from "./tmp.ts";

/**
 * SYNTHETIC TEST SUPPORT for the existing-actor I-002 compilation slice. The owners are the real ones; only the history
 * source and the consumer are fixtures (shared with the Named-Actor slice).
 */
export interface ExistingActorSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly actors: NamedActorAdapter;
  readonly pcs: PcCapabilityAdapter;
  /** the trusted-runtime entropy fixture behind the actor's and the PC owner's Causal Draws; counts how often it was asked */
  readonly entropy: ReturnType<typeof seededEntropy>;
}

export const wireExistingActor = (
  campaign: CanonicalCampaign,
  entropy: ReturnType<typeof seededEntropy> = seededEntropy(SEED_1),
): ExistingActorSeeded => {
  return {
    campaign,
    coordinator: new TemporalCoordinator(campaign.store, actorProviders()),
    actors: new NamedActorAdapter(campaign.store, { entropy }),
    pcs: new PcCapabilityAdapter(campaign.store, { entropy }),
    entropy,
  };
};

export interface ExistingActorSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
  /** the trusted-runtime entropy behind both owners' Causal Draws (default: the first fixture seed) */
  readonly entropy?: ReturnType<typeof seededEntropy>;
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
  const s = wireExistingActor(campaign, o.entropy);
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  return s;
}

export async function reopenExistingActor(
  dir: string,
  buildId = "existing-actor-reopen",
  entropy?: ReturnType<typeof seededEntropy>,
): Promise<ExistingActorSeeded> {
  return wireExistingActor(
    await must(CanonicalCampaign.open(dir, { buildId, extension: ACTOR_FIXTURE_EXTENSION })),
    entropy,
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
    coupling: under(/^world-state\/actor\//),
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

// ---------------------------------------------------------------------------------------------
// Existing-Actor World-State Coupling Anchor support
// ---------------------------------------------------------------------------------------------

export const couplingPublication = (n: number) => ({
  group_id: `couple-group-${n}`,
  intent_id: `couple-intent-${n}`,
  cause: `couple-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** The input a caller presents to couple an existing actor to the fixture world's locus (identities and actor-state pins only). */
export const couplingInput = (
  n: number,
  actorId = ACTOR_SMITH,
  over: Partial<{
    world_id: string;
    locus_id: string;
    actor_state: unknown;
  }> = {},
) => ({
  ...couplingPublication(n),
  actor_id: actorId,
  world_id: FIXTURE_WORLD_ID,
  locus_id: FIXTURE_LOCUS_ID,
  actor_state: [actorBasisPin(actorId)] as unknown,
  ...over,
});

/** Couples the existing actor through the one World-State publication path (`coupleExistingActor`). */
export async function coupleActor(
  s: Pick<ExistingActorSeeded, "campaign">,
  n: number,
  actorId = ACTOR_SMITH,
  over: Parameters<typeof couplingInput>[2] = {},
) {
  return s.campaign.coupleExistingActor(couplingInput(n, actorId, over));
}

// ---------------------------------------------------------------------------------------------
// Existing-Actor → PC Role Registry handover support
// ---------------------------------------------------------------------------------------------

export const handoverPublication = (n: number) => ({
  group_id: `handover-group-${n}`,
  intent_id: `handover-intent-${n}`,
  cause: `handover-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** The input a caller presents for the handover: the actor and the world/locus it claims (which must equal its coupling). */
export const handoverInput = (
  n: number,
  pcId = ACTOR_SMITH,
  over: Partial<{ world_id: string; locus_id: string }> = {},
) => ({
  ...handoverPublication(n),
  pc_id: pcId,
  world_id: FIXTURE_WORLD_ID,
  locus_id: FIXTURE_LOCUS_ID,
  ...over,
});

/** Hands the compiled, coupled existing actor over through the one distinct publication path (`handoverExistingActor`). */
export async function handoverActor(
  s: Pick<ExistingActorSeeded, "campaign">,
  n: number,
  pcId = ACTOR_SMITH,
  over: Parameters<typeof handoverInput>[2] = {},
) {
  return s.campaign.handoverExistingActor(handoverInput(n, pcId, over));
}

/**
 * Everything the handover consumes, committed in the lawful order: the actor's own Named-Actor state, its World-State coupling
 * and its I-002 compilation (all through their own owners' paths). The binding slot is still NULL.
 */
export async function readyForHandover(
  s: Pick<ExistingActorSeeded, "campaign" | "actors">,
  actorId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  contract?: ExistenceContract,
): Promise<void> {
  await establishActorBasis(s, 1, actorId, capabilityId);
  await must(coupleActor(s, 1, actorId));
  await must(
    compileExistingActor(
      s,
      1,
      contract ?? existingActorContract(actorId, [actorBasisPin(actorId, capabilityId)]),
    ),
  );
}

/**
 * A raw (store-level) Existing-Actor → PC handover group, built mechanically from the committed facts exactly as
 * `handoverExistingActor` would build it, then optionally edited, so a test can present a fabricated or tampered handover to a
 * store that has admission but is reached without the owner path.
 */
export function rawHandover(
  s: Pick<ExistingActorSeeded, "campaign">,
  n: number,
  pcId = ACTOR_SMITH,
  edit: (value: any) => void = () => undefined,
  groupOver: Partial<CommitGroup> = {},
): CommitGroup {
  const store = s.campaign.store;
  const pcKey = pcExistenceContractKey(pcId);
  const wKey = worldProfileKey(FIXTURE_WORLD_ID);
  const lKey = worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID);
  const cKey = worldActorCouplingKey(pcId);
  const version = (k: string) => store.getFact(k)?.version ?? 0;
  const sources: readonly ExistingActorSourcePin[] =
    s.campaign.playerCharacter(pcId)?.value.existing_actor_compilation?.source_state ?? [];
  const value: any = {
    binding_slot: "role.player_character",
    active_pc: { fact_key: pcKey, entity_id: pcId },
    coupling: {
      world: { fact_key: wKey, entity_id: FIXTURE_WORLD_ID },
      locus: { fact_key: lKey, entity_id: FIXTURE_LOCUS_ID },
    },
    transition: {
      type: EXISTING_ACTOR_HANDOVER,
      basis: {
        pinned_versions: {
          pc: version(pcKey),
          world: version(wKey),
          locus: version(lKey),
          coupling: version(cKey),
        },
      },
    },
    prior_binding: null,
    replacement_binding: null,
    intrinsic_authority_migration: [
      { owner: "world_state", fact_key: cKey, version: version(cKey) },
      ...sources.map((p) => ({ ...p })),
    ],
    writer: { role: "role.archivist", permission: "permission.canon.write" },
  };
  edit(value);
  const keys = [pcKey, wKey, lKey, cKey, ...sources.map((p) => p.fact_key)];
  return group(
    FIXTURE_CAMPAIGN,
    n,
    [
      write(PLAYER_CHARACTER_BINDING_KEY, value as never, {
        owner: "role_registry",
        facet: "player_character_binding",
      }),
    ],
    {
      owner: "role_registry",
      facet: "player_character_binding",
      rule: factKind("player_character_binding").rule,
      reads: keys.map((k) => ({ key: k, version: version(k) })),
      depends_on: [
        ...new Set(
          keys.flatMap((k) => (store.getFact(k) ? [store.getFact(k)!.provenance.group_id] : [])),
        ),
      ],
      ...groupOver,
    },
  );
}

// ---------------------------------------------------------------------------------------------
// Established existing-actor capability → PC capability carry-forward support
// ---------------------------------------------------------------------------------------------

export const carryPublication = (n: number) => ({
  group_id: `carry-group-${n}`,
  intent_id: `carry-intent-${n}`,
  cause: `carry-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** The only input a caller presents for a carry-forward: the identity and the capability (never a marker). */
export const carryInput = (n: number, pcId = ACTOR_SMITH, capabilityId = CAP_METALWORKING) => ({
  ...carryPublication(n),
  carry: { pc_id: pcId, capability_id: capabilityId },
});

/** Carries the handed-over actor's already-authoritative capability through the one distinct publication path. */
export async function carryForward(
  s: Pick<ExistingActorSeeded, "pcs">,
  n: number,
  pcId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
) {
  return s.pcs.carryForwardActorCapability(carryInput(n, pcId, capabilityId));
}

/**
 * Resolves one dependent consequence through the coordinator: registers its engaged object with a boundary AFTER the current
 * canonical time, and runs the transaction that resolves it (consuming a held remainder first, if an earlier stop left one:
 * RC-04 continuity).
 */
async function resolveConsumer(
  coordinator: TemporalCoordinator,
  tn: number,
  consumerId: string,
  txId: string,
  makeObject: (over: Partial<TemporalObject>) => TemporalObject,
) {
  const state = coordinator.state()!.value;
  const now = state.canonical_time;
  await must(
    coordinator.registerObject({
      ...temporalPublication(tn),
      object: makeObject({
        last_resolved_basis: now,
        next_boundary: { boundary_id: consumerBoundaryId(consumerId), at: at(now.value + 20) },
      }),
    }),
  );
  return must(
    state.continuation
      ? coordinator.continueRemainder(continuationInput(txId))
      : coordinator.advance(
          consumerAdvanceRequest(txId, consumerId, {
            requested: {
              target: at(now.value + 100),
              condition: {
                kind: "STOP_AFTER_BOUNDARY",
                object_id: consumerObjectId(consumerId),
                boundary_id: consumerBoundaryId(consumerId),
              },
            },
          }),
        ),
  );
}

/**
 * Makes the actor's capability AUTHORITATIVE the lawful pre-handover way: the actor owner's declared capability close,
 * resolved by the IM-02 coordinator inside the engaged object of a dependent consequence. Returns the committed capability.
 * (`tn` numbers the temporal publication; the consequence reads it AS-OF-DECLARED-CLOSE.)
 */
export async function closeActorCapability(
  s: Pick<ExistingActorSeeded, "actors" | "coordinator">,
  tn: number,
  actorId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  consumerId = `actor-consumer-${actorId}-${capabilityId}`,
) {
  const basis = s.actors.basis(actorId, capabilityId)!.value;
  await resolveConsumer(s.coordinator, tn, consumerId, `tx-actor-close-${tn}`, (over) =>
    capabilityConsumerObject(consumerId, basis, over),
  );
  return s.actors.capability(actorId, capabilityId)!;
}

/**
 * Everything the handover consumes, with the actor's capability already AUTHORITATIVE (its basis established and closed
 * before the cutover). The binding slot is still NULL.
 */
export async function readyForCarryForward(
  s: Pick<ExistingActorSeeded, "campaign" | "actors" | "coordinator">,
  actorId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  over: Partial<NamedActorCapabilityBasis> = {},
): Promise<void> {
  await establishActorBasis(s, 1, actorId, capabilityId, over);
  await must(coupleActor(s, 1, actorId));
  await must(
    compileExistingActor(
      s,
      1,
      existingActorContract(actorId, [actorBasisPin(actorId, capabilityId)]),
    ),
  );
  await closeActorCapability(s, 10, actorId, capabilityId);
}

/**
 * The PC Capability Close of a carried-forward capability, resolved by the existing IM-02 coordinator inside the engaged
 * object of a later dependent consequence (a fresh consumer id, with a boundary after the current canonical time).
 */
export async function closePcCapability(
  s: Pick<ExistingActorSeeded, "pcs" | "campaign">,
  tn: number,
  pcId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  consumerId = `pc-consumer-${pcId}-${capabilityId}`,
) {
  const basis = s.pcs.basis(pcId, capabilityId)!.value;
  const transaction = await resolveConsumer(
    pcCapabilityCoordinator(s.campaign.store),
    tn,
    consumerId,
    `tx-pc-close-${tn}`,
    (over) => pcCapabilityConsumerObject(consumerId, basis, over),
  );
  return { transaction, capability: s.pcs.capability(pcId, capabilityId) };
}

/**
 * A raw (store-level) carry-forward basis group, built mechanically from the committed facts exactly as
 * `carryForwardActorCapability` would build it, then optionally edited, so a test can present a fabricated or tampered
 * carry-forward to a store that has admission but is reached without the owner path. `edit` mutates the basis value;
 * `groupOver` replaces group fields (reads, depends_on, rule, …).
 */
export function rawCarryBasis(
  s: Pick<ExistingActorSeeded, "campaign">,
  n: number,
  pcId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  edit: (value: any) => void = () => undefined,
  groupOver: Partial<CommitGroup> = {},
): CommitGroup {
  const store = s.campaign.store;
  const version = (k: string) => store.getFact(k)?.version ?? 0;
  const source = store.getFact(actorCapabilityKey(pcId, capabilityId));
  const value: any = {
    pc_id: pcId,
    capability_id: capabilityId,
    marker: (source?.value as { marker?: unknown } | undefined)?.marker ?? null,
    establishment: {
      method: "EXISTING_ACTOR_CARRY_FORWARD",
      handover: {
        fact_key: PLAYER_CHARACTER_BINDING_KEY,
        version: version(PLAYER_CHARACTER_BINDING_KEY),
      },
      source: {
        fact_key: actorCapabilityKey(pcId, capabilityId),
        version: version(actorCapabilityKey(pcId, capabilityId)),
      },
    },
  };
  edit(value);
  const keys = [
    pcExistenceContractKey(pcId),
    PLAYER_CHARACTER_BINDING_KEY,
    actorCapabilityKey(pcId, capabilityId),
  ];
  return group(
    FIXTURE_CAMPAIGN,
    n,
    [
      write(pcCapabilityBasisKey(pcId, capabilityId), value as never, {
        owner: "pc_existence",
        facet: "pc_capability_profile",
      }),
    ],
    {
      owner: "pc_existence",
      facet: "pc_capability_profile",
      rule: factKind("pc_capability_basis").rule,
      reads: keys.map((k) => ({ key: k, version: version(k) })),
      depends_on: [
        ...new Set(
          keys.flatMap((k) => (store.getFact(k) ? [store.getFact(k)!.provenance.group_id] : [])),
        ),
      ],
      ...groupOver,
    },
  );
}

// ---------------------------------------------------------------------------------------------
// Existing-actor capability unresolved at handover → PC material-trigger world-prior resolution support
// ---------------------------------------------------------------------------------------------

export const worldPriorPublication = (n: number) => ({
  group_id: `world-prior-group-${n}`,
  intent_id: `world-prior-intent-${n}`,
  cause: `world-prior-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** The synthetic established world/actor causes of the identity (the committed history facts of the seeded campaign). */
export const worldPriorCauses = (pcId = ACTOR_SMITH, capabilityId = CAP_METALWORKING) =>
  randomizedEstablishment(pcId, capabilityId).causes;

/** What the PC owner is told when the causes suffice: identity, capability, pinned causes and the authored marker. */
export const worldPriorInput = (
  pcId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  over: Partial<PcExistingActorEstablishmentInput> = {},
): PcExistingActorEstablishmentInput => ({
  pc_id: pcId,
  capability_id: capabilityId,
  causes: worldPriorCauses(pcId, capabilityId),
  marker: "C",
  ...over,
});

/** What the PC owner decides before any draw: the causes and a bounded prior (SYNTHETIC test coordinates, never a default). */
export const worldPriorRandomizedInput = (
  pcId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  over: Partial<PcExistingActorRandomizedEstablishmentInput> = {},
): PcExistingActorRandomizedEstablishmentInput => ({
  pc_id: pcId,
  capability_id: capabilityId,
  causes: worldPriorCauses(pcId, capabilityId),
  prior: [
    { marker: "C", weight: "3" },
    { marker: "B", weight: "1" },
  ],
  ...over,
});

/** Establishes the unresolved capability by its causes (nothing is drawn) through the one distinct publication path. */
export async function establishWorldPrior(
  s: Pick<ExistingActorSeeded, "pcs">,
  n: number,
  pcId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  over: Partial<PcExistingActorEstablishmentInput> = {},
) {
  return s.pcs.establishExistingActorCapabilityBasis({
    ...worldPriorPublication(n),
    capability: worldPriorInput(pcId, capabilityId, over),
  });
}

/** Establishes the unresolved capability within the owner's bounded prior, fixed by a committed Causal Draw. */
export async function establishWorldPriorRandomized(
  s: Pick<ExistingActorSeeded, "pcs">,
  n: number,
  pcId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  over: Partial<PcExistingActorRandomizedEstablishmentInput> = {},
) {
  return s.pcs.establishExistingActorRandomizedCapabilityBasis({
    ...worldPriorPublication(n),
    capability: worldPriorRandomizedInput(pcId, capabilityId, over),
    resolution: RESOLVER,
  });
}

/**
 * A handed-over existing actor whose capability `capabilityId` (default: swordsmanship) was NEVER fixed before the handover:
 * the actor's other state (a basis for another capability, so the compilation and coupling have their pinned source) is
 * committed, the actor is compiled, coupled and handed over, and nothing is represented for `capabilityId`.
 */
export async function handedOverWithUnresolvedCapability(
  s: Pick<ExistingActorSeeded, "campaign" | "actors">,
  actorId = ACTOR_SMITH,
  otherCapabilityId = CAP_METALWORKING,
): Promise<void> {
  await readyForHandover(s, actorId, otherCapabilityId);
  await must(handoverActor(s, 1, actorId));
}

/** A Causal Draw adapter wired with the PC owner's typed ports over `store` (for a draw made without the owner's operation). */
export const pcDrawAdapter = (
  store: CampaignStore,
  entropy: ReturnType<typeof seededEntropy> = seededEntropy(SEED_1),
): CausalDrawAdapter =>
  new CausalDrawAdapter(store, {
    slotInspectors: new Map([["pc_existence", pcSlotInspector(store)]]),
    ruleAuthority: pcRuleAuthority,
    entropy,
  });

/** The committed-by references a draw over these causes pins (each cause's current committing group). */
export const worldPriorRefs = (
  store: CampaignStore,
  pcId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
) =>
  worldPriorCauses(pcId, capabilityId).map((c) => ({
    owner: c.owner,
    fact_key: c.fact_key,
    version: c.version,
    committed_by: store.getFact(c.fact_key)!.provenance.group_id,
  }));

/** Commits ONLY the Causal Draw (precommit and result) of the PC slot: the draw the owner's own operation would make. */
export async function drawPcSlot(
  store: CampaignStore,
  entropy: ReturnType<typeof seededEntropy> = seededEntropy(SEED_1),
  pcId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  over: Partial<PcExistingActorRandomizedEstablishmentInput> = {},
) {
  return pcDrawAdapter(store, entropy).draw({
    specification: pcCapabilityDrawSpecification(
      worldPriorRandomizedInput(pcId, capabilityId, over),
      worldPriorRefs(store, pcId, capabilityId),
    ),
    resolution: RESOLVER,
  });
}

/**
 * A raw (store-level) world-prior basis group, built mechanically from the committed facts exactly as the owner operation
 * would build it, then optionally edited, so a test can present a fabricated or tampered establishment to a store that has
 * admission but is reached without the owner path. `randomized` reads the committed Causal Draw result of the slot (the draw
 * must already be committed); `edit` mutates the basis value; `groupOver` replaces group fields (reads, depends_on, rule, …).
 */
export function rawWorldPriorBasis(
  s: Pick<ExistingActorSeeded, "campaign">,
  n: number,
  pcId = ACTOR_SMITH,
  capabilityId = CAP_METALWORKING,
  o: { randomized?: boolean; edit?: (value: any) => void; groupOver?: Partial<CommitGroup> } = {},
): CommitGroup {
  const store = s.campaign.store;
  const version = (k: string) => store.getFact(k)?.version ?? 0;
  const causes = worldPriorCauses(pcId, capabilityId);
  const handover = {
    fact_key: PLAYER_CHARACTER_BINDING_KEY,
    version: version(PLAYER_CHARACTER_BINDING_KEY),
  };
  const resultKey = causalDrawResultKey(pcCapabilityDrawDigestOf(pcId, capabilityId));
  const result = store.getFact(resultKey);
  const value: any = o.randomized
    ? {
        pc_id: pcId,
        capability_id: capabilityId,
        marker:
          parseCapabilityCandidateId((result?.value as any)?.selected_candidate_id ?? "")?.marker ??
          null,
        establishment: {
          method: "EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED",
          handover,
          causes,
          draw: {
            draw_id: (result?.value as any)?.draw_id,
            result: { fact_key: resultKey, version: version(resultKey) },
          },
        },
      }
    : {
        pc_id: pcId,
        capability_id: capabilityId,
        marker: "C",
        establishment: { method: "EXISTING_ACTOR_CAUSALLY_DETERMINED", handover, causes },
      };
  o.edit?.(value);
  const keys = [
    pcExistenceContractKey(pcId),
    PLAYER_CHARACTER_BINDING_KEY,
    ...causes.map((c) => c.fact_key),
    ...(o.randomized ? [resultKey] : []),
  ];
  return group(
    FIXTURE_CAMPAIGN,
    n,
    [
      write(pcCapabilityBasisKey(pcId, capabilityId), value as never, {
        owner: "pc_existence",
        facet: "pc_capability_profile",
      }),
    ],
    {
      owner: "pc_existence",
      facet: "pc_capability_profile",
      rule: factKind("pc_capability_basis").rule,
      reads: keys.map((k) => ({ key: k, version: version(k) })),
      depends_on: [
        ...new Set(
          keys.flatMap((k) => (store.getFact(k) ? [store.getFact(k)!.provenance.group_id] : [])),
        ),
      ],
      ...o.groupOver,
    },
  );
}

/** The canonical result group of the PC slot's draw (re-exported from the contracts for tests). */
export const pcDrawResultGroup = (pcId = ACTOR_SMITH, capabilityId = CAP_METALWORKING): string =>
  causalDrawResultGroupId(pcCapabilityDrawDigestOf(pcId, capabilityId));

/**
 * A package built by a store with NO admission: the committed groups of a lawful, closed package `srcDir`, replayed in journal
 * order into a fresh store (`mutate` may alter or drop each group; `append` may add what no lawful path could write). The
 * result is a consistent, replayable history that is not canonical, so only the load verifiers can refuse it.
 */
export async function rogueReplay(
  srcDir: string,
  mutate: (g: CommitGroup, index: number) => CommitGroup | null = (g) => g,
  append: (store: CampaignStore) => Promise<void> = async () => undefined,
): Promise<string> {
  const entries = readFileSync(join(srcDir, "journal.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { group: CommitGroup; receipt: { group_sha256: string } });
  const dir = tempDir();
  const store = await must(
    createFileCampaign(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
    }),
  );
  // a mutated group has a new receipt digest; later groups that cite it (a transaction's stage references) follow it
  const renamed = new Map<string, string>();
  for (const [i, e] of entries.entries()) {
    let text = JSON.stringify(e.group);
    for (const [from, to] of renamed) text = text.replaceAll(from, to);
    const g = mutate(JSON.parse(text) as CommitGroup, i);
    if (!g) continue;
    const committed = await must(store.commit(g));
    if (committed.receipt.group_sha256 !== e.receipt.group_sha256) {
      renamed.set(e.receipt.group_sha256, committed.receipt.group_sha256);
    }
  }
  await append(store);
  await store.close();
  return dir;
}
