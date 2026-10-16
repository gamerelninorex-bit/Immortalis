/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and tamper with arbitrary fact values */
import {
  EntityTransitionCloseSchema,
  PLAYER_CHARACTER_BINDING_KEY as BINDING_KEY,
  PLAYER_CHOICE_AUTHORITY,
  PcMovementCommitmentSchema as CommitmentSchemaForRaw,
  pcExistenceContractKey,
  logisticsTransferKey,
  worldEntityTransitionKey,
  pcMovementCommitmentKey,
  pcMovementRequestId,
  pcMovementRequestKey,
  worldPcLocusCustodyKey,
  type CanonicalTime,
  type CommitGroup,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  LogisticsAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  derivePcMovementCommitment,
  derivePcMovementRequest,
  factKind,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
  logisticsTemporalObject,
  worldEntityTransitionProvider,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  DEST_LOCUS_ID,
  FIXTURE_CAMPAIGN,
  FIXTURE_WORLD_ID,
  LOG_T_DELIVERY,
  fixtureDestinationLocus,
  group,
  logPublication,
  logStopAtBoundaryRequest,
  publication,
  temporalPublication,
  write,
} from "@immortalis/testkit";
import { wireExistingActor, type ExistingActorSeeded } from "./existing-actor.ts";
import { PC, establishCustody, handedOverCampaign } from "./pc-locus-custody.ts";
import { must } from "./temporal.ts";
import { tempDir } from "./tmp.ts";

/**
 * SYNTHETIC TEST SUPPORT for the Active-PC voluntary-movement slice. The owners are the real ones: the existing-actor harness
 * supplies the completed handover, PR #41's custody path supplies the stationary custody record, and the PC-owned commitment and
 * request, Logistics, World-State's ECT-01 and the Temporal kernel are all the engine's. Only the delivery boundary is a fixture
 * coordinate (an explicit, externally declared value, never a default).
 */
export { PC, DEST_LOCUS_ID, LOG_T_DELIVERY };
export const W = FIXTURE_WORLD_ID;
export const OTHER_DEST = "locus-fixture-other";
export const REQUEST_ID = pcMovementRequestId(PC);

export interface PcMoveSeeded extends ExistingActorSeeded {
  readonly logistics: LogisticsAdapter;
}

export const movementProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    worldEntityTransitionProvider,
    logisticsDeliveryProvider,
    logisticsRetirementProvider,
  ]);

const wire = (s: ExistingActorSeeded): PcMoveSeeded => ({
  ...s,
  coordinator: new TemporalCoordinator(s.campaign.store, movementProviders()),
  logistics: new LogisticsAdapter(s.campaign.store),
});

export const mvPublication = (n: number) => ({
  group_id: `mv-group-${n}`,
  intent_id: `mv-intent-${n}`,
  cause: `mv-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** The lawful handover, PR #41's custody record and one established destination locus: nothing is committed or moved yet. */
export async function custodiedCampaign(
  dir = tempDir(),
  contract?: Parameters<typeof handedOverCampaign>[2],
): Promise<PcMoveSeeded> {
  const s = wire(await handedOverCampaign(dir, {}, contract));
  await must(establishCustody(s, 1));
  await must(s.campaign.establishLocus({ ...publication(900), locus: fixtureDestinationLocus() }));
  return s;
}

export async function reopenMovement(
  dir: string,
  buildId = "pc-move-reopen",
): Promise<PcMoveSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: ACTOR_FIXTURE_EXTENSION }),
  );
  return wire(wireExistingActor(campaign));
}

/** What a player commits: the structured, lowered intent plus the authored authority (never defaulted). */
export const playerCommit = (
  n: number,
  over: { pc_id?: string; locus_id?: string; world_id?: string; authored_under?: unknown } = {},
) => ({
  ...mvPublication(n),
  pc_id: over.pc_id ?? PC,
  destination: { world_id: over.world_id ?? W, locus_id: over.locus_id ?? DEST_LOCUS_ID },
  // `authored_under` is supplied by the caller and never defaulted by the engine; the fixture defaults it only when omitted
  authored_under: "authored_under" in over ? over.authored_under : { ...PLAYER_CHOICE_AUTHORITY },
});

export const commitMove = (
  s: Pick<ExistingActorSeeded, "campaign">,
  n: number,
  over: Parameters<typeof playerCommit>[1] = {},
) => s.campaign.commitPcVoluntaryMovement(playerCommit(n, over));

export const requestMove = (s: Pick<ExistingActorSeeded, "campaign">, n: number, pcId = PC) =>
  s.campaign.establishPcMovementRequest({ ...mvPublication(n), pc_id: pcId });

export const logisticsCommit = (
  s: Pick<PcMoveSeeded, "logistics">,
  n: number,
  delivery_at: CanonicalTime = LOG_T_DELIVERY,
) =>
  s.logistics.commitMovement({
    ...logPublication(n),
    commit: { request_key: pcMovementRequestKey(PC), delivery_at },
  });

export const logisticsDispatch = (s: Pick<PcMoveSeeded, "logistics">, n: number) =>
  s.logistics.dispatch({
    ...logPublication(n),
    dispatch: { request_key: pcMovementRequestKey(PC) },
  });

export async function registerPcTransfer(s: PcMoveSeeded, tn: number): Promise<void> {
  const c = s.logistics.commitment(W, PC)!;
  const t = s.logistics.transfer(W, PC)!;
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

/** The full pre-boundary setup: commitment-of-record, PC-owned request, Logistics commitment, dispatch, registration. */
export async function commitRequestDispatchRegister(s: PcMoveSeeded): Promise<void> {
  await must(commitMove(s, 1));
  await must(requestMove(s, 2));
  await must(logisticsCommit(s, 3));
  await must(logisticsDispatch(s, 4));
  await registerPcTransfer(s, 5);
}

export const advanceToDelivery = (s: PcMoveSeeded, id = "tx-pc-move") =>
  s.coordinator.advance(logStopAtBoundaryRequest(id, REQUEST_ID));

/** Every committed fact, by key, cloned: lets a test prove that nothing but the intended facts changed. */
export const snapshotFacts = (s: Pick<ExistingActorSeeded, "campaign">) =>
  new Map(s.campaign.store.listFacts().map((f) => [f.key, structuredClone(f)]));

export const commitmentKeyOf = pcMovementCommitmentKey;
export const requestKeyOf = pcMovementRequestKey;
export const custodyKeyOf = worldPcLocusCustodyKey;
export { factKind, group, write, FIXTURE_CAMPAIGN };
export type { CampaignStore, CommitGroup };

// -- durable-cut helpers ---------------------------------------------------------------------------------------------------

/** A store that refuses (as an unknown outcome, committing NOTHING) the first group the predicate names. */
export function blockingStore(
  inner: CampaignStore,
  block: (g: CommitGroup) => boolean,
): { store: CampaignStore; blocked: () => number } {
  let blocked = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async (g: any) => {
      if (block(g as CommitGroup)) {
        blocked++;
        return {
          ok: false,
          error: { code: "UNKNOWN_OUTCOME", message: "simulated crash before this group" },
        } as never;
      }
      return inner.commit(g);
    },
  };
  return { store, blocked: () => blocked };
}
export const isTransitionGroup = (g: CommitGroup) =>
  g.writes.some((w) => w.key.endsWith("/transition"));
export const isRetirementGroup = (g: CommitGroup) =>
  g.owner === "logistics" && g.writes.some((w) => w.key.startsWith("logistics/transfer/"));

/**
 * How many authorities answer "where is the PC now?", counted from the RAW committed facts (never through the resolver), so a test
 * can prove that the resolver and the facts agree: the stationary custodian (no active transfer, no destination commit), Logistics
 * (a transfer in transfer, no destination commit), or World-State's destination (the committed ECT-01 transition). Exactly one.
 */
export function authorityCensus(s: Pick<ExistingActorSeeded, "campaign">, pcId = PC) {
  const store = s.campaign.store;
  const custody = store.getFact(worldPcLocusCustodyKey(pcId));
  const transfer = store.getFact(logisticsTransferKey(W, pcId));
  const transition = store.getFact(worldEntityTransitionKey(W, pcId));
  const inTransfer = (transfer?.value as any)?.state?.status === "IN_TRANSFER";
  const stationary = custody !== undefined && !inTransfer && transition === undefined ? 1 : 0;
  const logistics = inTransfer && transition === undefined ? 1 : 0;
  const destination = transition !== undefined ? 1 : 0;
  return {
    stationary,
    logistics,
    destination,
    total: stationary + logistics + destination,
    destinationLocus: transition
      ? EntityTransitionCloseSchema.parse(transition.value).locus.to.locus.entity_id
      : null,
  };
}

// -- raw (store-level) builders --------------------------------------------------------------------------------------------

const PC_OWNER = { owner: "pc_existence", facet: "pc_voluntary_commitment" } as const;

const readsAndDeps = (store: CampaignStore, keys: readonly string[]) => ({
  reads: keys.map((k) => ({ key: k, version: store.getFact(k)?.version ?? 0 })),
  depends_on: [
    ...new Set(
      keys.flatMap((k) => (store.getFact(k) ? [store.getFact(k)!.provenance.group_id] : [])),
    ),
  ],
});

/**
 * A raw (store-level) commitment-of-record group, built mechanically exactly as `commitPcVoluntaryMovement` would build it, then
 * optionally edited, so a test can present a forged or tampered record to a store that has admission but is reached without the
 * owner path.
 */
export function rawCommitment(
  s: Pick<ExistingActorSeeded, "campaign">,
  n: number,
  edit: (value: any) => void = () => undefined,
  groupOver: Partial<CommitGroup> = {},
  locusId = DEST_LOCUS_ID,
): CommitGroup {
  const store = s.campaign.store;
  const derived = derivePcMovementCommitment(
    {
      pc_id: PC,
      destination: { world_id: W, locus_id: locusId },
      authored_under: { ...PLAYER_CHOICE_AUTHORITY },
    },
    store,
  );
  if (!derived.ok) throw new Error(derived.error.message);
  const value: any = structuredClone(derived.value);
  edit(value);
  const keys = [
    pcExistenceContractKey(value.pc_id),
    BINDING_KEY,
    worldPcLocusCustodyKey(value.pc_id),
    value.intent.destination.world.fact_key,
    value.intent.destination.locus.fact_key,
  ];
  return group(FIXTURE_CAMPAIGN, 7000 + n, [write(pcMovementCommitmentKey(PC), value, PC_OWNER)], {
    ...PC_OWNER,
    rule: factKind("pc_movement_commitment").rule,
    ...readsAndDeps(store, keys),
    ...groupOver,
  });
}

/** A raw PC-owned request group, derived from the committed commitment-of-record, then optionally edited. */
export function rawRequest(
  s: Pick<ExistingActorSeeded, "campaign">,
  n: number,
  edit: (value: any) => void = () => undefined,
  groupOver: Partial<CommitGroup> = {},
): CommitGroup {
  const store = s.campaign.store;
  const commitment = CommitmentSchemaForRaw.parse(
    store.getFact(pcMovementCommitmentKey(PC))!.value,
  );
  const value: any = structuredClone(derivePcMovementRequest(commitment));
  edit(value);
  const keys = [
    pcMovementCommitmentKey(PC),
    value.subject.fact_key,
    value.destination.locus.fact_key,
  ];
  return group(FIXTURE_CAMPAIGN, 7500 + n, [write(pcMovementRequestKey(PC), value, PC_OWNER)], {
    ...PC_OWNER,
    rule: factKind("pc_movement_request").rule,
    ...readsAndDeps(store, keys),
    ...groupOver,
  });
}

/** A stable summary of everything durable: the head, every fact (value, version, provenance) and every receipt. */
export function movementSummary(s: Pick<PcMoveSeeded, "campaign">) {
  const head = s.campaign.store.head();
  const facts = s.campaign.store.listFacts();
  return {
    head: {
      revision: head.revision,
      state_sha256: head.state_sha256,
      journal_entries: head.journal_entries,
      journal_head_sha256: head.journal_head_sha256,
    },
    facts: facts.map((f) => structuredClone(f)),
    receipts: facts.map((f) => s.campaign.store.lookupReceipt(f.provenance.intent_id)),
  };
}

/** Re-presents every step of the journey under its fixed identity: done steps replay, the rest commit. */
export async function finishJourney(s: PcMoveSeeded): Promise<void> {
  await must(commitMove(s, 1));
  await must(requestMove(s, 2));
  await must(logisticsCommit(s, 3));
  await must(logisticsDispatch(s, 4));
  // the registration is made once; a later presentation (after the boundary has been engaged or resolved) is not re-made
  if (!s.coordinator.object(`obj-logistics-${REQUEST_ID}`)) await registerPcTransfer(s, 5);
  await must(advanceToDelivery(s));
}
