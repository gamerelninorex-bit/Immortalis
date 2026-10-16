/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and tamper with arbitrary fact values */
import {
  PLAYER_CHOICE_AUTHORITY,
  SourceAccountSchema,
  WorldSourceConditionSchema,
  productionReserveKey,
  productionSourceAccountKey,
  pcCollectionRequestId,
  type CanonicalTime,
  type PcCollectionCommitInput,
  type PcCollectionReachTask,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PcCollectionAdapter,
  ProductionAdapter,
  SourceDrawdownAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
  productionReserveInflowProvider,
  productionSourceDeltaProvider,
  worldEntityTransitionProvider,
  worldSourceDeliveryProvider,
} from "@immortalis/engine";
import {
  bindTrustedConfirmedPcCollectionContext,
  commitConfirmedPcCollection,
  getPcCollectionReachTask,
  startConfirmedPcCollection,
  submitPcCollectionReach,
} from "@immortalis/protocol";
import {
  ACTOR_FIXTURE_EXTENSION,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  SRC_ACCESS,
  SRC_BASIS_ID,
  SRC_RESERVE,
  SRC_SOURCE_KEY,
  SRC_UNIT,
  T0,
  basisInput,
  drawdownPublication,
  prodPublication,
  publication,
  reserveRawInput,
  sourceInput,
  at,
} from "@immortalis/testkit";
import { wireExistingActor } from "./existing-actor.ts";
import { custodiedCampaign, type PcMoveSeeded, PC } from "./pc-movement.ts";
import { must } from "./temporal.ts";

/**
 * SYNTHETIC TEST SUPPORT for the CPAA-C1 v0.2 PROVISIONAL consequential-collection slice. Every owner is the real one: the existing-actor
 * harness supplies the completed handover, PR #41's custody path the stationary custody record, World-State the finite Source Condition,
 * Production its Capability / Access basis and Reserve, the PC-side owner the P-1 mechanism, and the Temporal kernel the clock. The
 * only fixture values are the numbers the test coordinates use: the source holds five units; τ (the mechanism's authored cycle) is a
 * test coordinate, never an adopted constant, and every other duration in a test is DERIVED by the engine from it.
 */
export { PC, T0 };
export const W = FIXTURE_WORLD_ID;
export const MECH = "mech-hands-1";
/** the test coordinate for τ: one serial cycle takes this many canonical units (fixture evidence only, never a default) */
export const TAU = 7;
export const ACT_A = "act-a";
export const ACT_B = "act-b";
export const ACT_C = "act-c";

export const TRAVERSAL_STATEMENT =
  "SYNTHETIC FIXTURE: the hands of this body cannot pass a sealed barrier.";
export const ACTUATOR_STATEMENT =
  "SYNTHETIC FIXTURE: two bare hands gather loose material by hand.";

export interface CollectionSeeded extends PcMoveSeeded {
  readonly drawdown: SourceDrawdownAdapter;
  readonly production: ProductionAdapter;
  readonly collect: PcCollectionAdapter;
}

export const collectionProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    productionSourceDeltaProvider,
    worldSourceDeliveryProvider,
    productionReserveInflowProvider,
    worldEntityTransitionProvider,
    logisticsDeliveryProvider,
    logisticsRetirementProvider,
  ]);

const wire = (s: PcMoveSeeded): CollectionSeeded => ({
  ...s,
  coordinator: new TemporalCoordinator(s.campaign.store, collectionProviders()),
  drawdown: new SourceDrawdownAdapter(s.campaign.store),
  production: new ProductionAdapter(s.campaign.store),
  collect: new PcCollectionAdapter(s.campaign.store),
});

export const colPublication = (n: number) => ({
  group_id: `col-group-${n}`,
  intent_id: `col-intent-${n}`,
  cause: `col-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

export interface CollectionSeedOptions {
  readonly dir?: string;
  /** stated source access facts (default: the fixture's "loose on the surface" statement) */
  readonly access?: readonly { aspect: string; statement: string }[];
  readonly floor?: unknown;
  readonly tau?: CanonicalTime;
  readonly traversal?: string;
  readonly noMechanism?: boolean;
  readonly sourceAmount?: number;
  readonly tamper?: boolean;
}

/** A custodied, handed-over PC with a finite source (5), an empty Reserve, Production's basis and the PC's P-1 mechanism: nothing is committed. */
export async function collectionCampaign(o: CollectionSeedOptions = {}): Promise<CollectionSeeded> {
  const base = await custodiedCampaign(o.dir);
  const s = wire(base);
  const access = o.access ?? [SRC_ACCESS];
  await must(
    s.campaign.establishSourceCondition({
      ...publication(950),
      source: sourceInput({
        access_facts: access,
        ...(o.sourceAmount !== undefined
          ? { quantity: { amount: o.sourceAmount, unit: SRC_UNIT } }
          : {}),
      }),
    }),
  );
  await must(
    s.drawdown.establishBasis({
      ...drawdownPublication(950),
      extraction_basis: basisInput({ relies_on: access[0] }),
    }),
  );
  await must(
    s.production.establishReserve({ ...prodPublication(950), reserve: reserveRawInput() }),
  );
  if (!o.noMechanism) await establishMechanism(s, o);
  return s;
}

export const establishMechanism = (s: CollectionSeeded, o: CollectionSeedOptions = {}, n = 951) =>
  s.collect.establishMechanism({
    ...colPublication(n),
    mechanism: {
      pc_id: PC,
      mechanism_id: MECH,
      claims: [{ section: "embodiment_topology", index: 0 }],
      actuator: { statement: ACTUATOR_STATEMENT },
      traversal: { statement: o.traversal ?? TRAVERSAL_STATEMENT },
      cycle_duration: o.tau ?? { unit: T0.unit, value: TAU },
      interaction_floor: o.floor ?? {
        status: "NOT_APPLICABLE",
        ground: "SYNTHETIC FIXTURE: a single handful is not a consequential interaction.",
      },
    },
  });

/** What the player confirmed for one attempt. */
export const choice = (
  actId: string,
  quantity = 3,
  over: Record<string, unknown> = {},
): PcCollectionCommitInput =>
  ({
    pc_id: PC,
    act_id: actId,
    source: { world_id: W, source_key: SRC_SOURCE_KEY },
    reserve_id: SRC_RESERVE,
    quantity: { amount: quantity, unit: SRC_UNIT },
    authored_under: { ...PLAYER_CHOICE_AUTHORITY },
    ...over,
  }) as PcCollectionCommitInput;

/** The trusted side's context after the player's confirmation of ONE exact attempt. */
export const trustedCollection = (
  s: Pick<CollectionSeeded, "campaign">,
  actId: string,
  quantity = 3,
  over: { choice?: unknown; mechanism_id?: string; basis_id?: string } = {},
) =>
  bindTrustedConfirmedPcCollectionContext({
    campaign: s.campaign as never,
    choice: ("choice" in over ? over.choice : choice(actId, quantity)) as never,
    mechanism_id: over.mechanism_id ?? MECH,
    basis_id: over.basis_id ?? SRC_BASIS_ID,
    publication: { cause: `cause-${actId}`, basis: "fixture-basis", secrecy: "fixture-visibility" },
  });

export const COMMIT_REQ = { operation: "commit_confirmed_pc_collection" };
export const TASK_REQ = { operation: "get_pc_collection_reach_task" };
export const START_REQ = { operation: "start_confirmed_pc_collection" };
export const reachReq = (answer: Record<string, unknown>) => ({
  operation: "submit_pc_collection_reach",
  answer,
});

export const COLLECTION_COMMITTED = { ok: true, value: { status: "COLLECTION_COMMITTED" } };
export const COLLECTION_REFUSAL = JSON.stringify({
  ok: false,
  error: { code: "COLLECTION_UNAVAILABLE", message: "no collection is available" },
});

/** A scripted GM host: reads the verbatim quotations of the task and states its UNTRUSTED readings. It never states a verdict. */
export function hostAnswer(
  task: PcCollectionReachTask,
  path: "OPEN" | "CLOSED",
  mechanism: "ABLE_TO_PASS" | "UNABLE_TO_PASS" | "NOT_AT_ISSUE",
): Record<string, unknown> {
  return {
    task_digest: task.digest,
    path: {
      reading: path,
      grounds: task.source.access_facts.slice(0, 1).map((f) => f.statement),
    },
    mechanism: {
      reading: mechanism,
      grounds: mechanism === "NOT_AT_ISSUE" ? [] : [task.mechanism.traversal],
    },
  };
}

/** The full confirmed path up to (not including) time passing: commit → reach judgment → start. Returns the three statuses. */
export async function confirmAndStart(
  s: CollectionSeeded,
  actId: string,
  quantity = 3,
  reading: [Parameters<typeof hostAnswer>[1], Parameters<typeof hostAnswer>[2]] = [
    "OPEN",
    "NOT_AT_ISSUE",
  ],
) {
  const ctx = trustedCollection(s, actId, quantity);
  const committed = await commitConfirmedPcCollection(ctx, COMMIT_REQ);
  const task = getPcCollectionReachTask(ctx, TASK_REQ);
  const judged = task.ok
    ? await submitPcCollectionReach(ctx, reachReq(hostAnswer(task.value.task, ...reading)))
    : task;
  const started = await startConfirmedPcCollection(ctx, START_REQ);
  return { ctx, committed, task, judged, started };
}

export async function reopenCollection(
  dir: string,
  buildId = "col-reopen",
): Promise<CollectionSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: ACTOR_FIXTURE_EXTENSION }),
  );
  return wire({ ...wireExistingActor(campaign), logistics: undefined as never } as never);
}

// -- observations (test-only reads of the owners' committed facts) --------------------------------------
export const sourceRemaining = (s: Pick<CollectionSeeded, "campaign">): number | undefined => {
  const f = s.campaign.store.getFact(`world/${W}/source/${SRC_SOURCE_KEY}`);
  const v = f ? WorldSourceConditionSchema.safeParse(f.value) : undefined;
  return v?.success ? v.data.recoverable.amount : undefined;
};
export const reserveAmount = (s: Pick<CollectionSeeded, "campaign">): number | undefined => {
  const f = s.campaign.store.getFact(productionReserveKey(SRC_RESERVE));
  return f ? (f.value as any).quantity.amount : undefined;
};
export const accountOf = (s: Pick<CollectionSeeded, "campaign">) => {
  const f = s.campaign.store.getFact(productionSourceAccountKey(W, SRC_SOURCE_KEY));
  return f ? SourceAccountSchema.parse(f.value) : undefined;
};
export const clock = (s: Pick<CollectionSeeded, "coordinator">) =>
  s.coordinator.state()!.value.canonical_time;
export const extractionOf = (s: CollectionSeeded, actId: string) => s.collect.extraction(PC, actId);
export const extractionId = (actId: string) => pcCollectionRequestId(PC, actId);
export { at, FIXTURE_LOCUS_ID, SRC_RESERVE, SRC_SOURCE_KEY, SRC_BASIS_ID, SRC_UNIT, SRC_ACCESS };
