/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and tamper with arbitrary fact values */
import {
  PLAYER_CHOICE_AUTHORITY,
  SourceAccountSchema,
  WorldSourceConditionSchema,
  productionReserveKey,
  productionSourceAccountKey,
  pcCollectionRequestId,
  worldSourceConditionKey,
  type PcCollectionCycleTask,
  type CanonicalTime,
  type PcCollectionCommitInput,
  type PcCollectionReachTask,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PcCollectionAdapter,
  PopulationAdapter,
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
  DEST_LOCUS_ID,
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
  popPublication,
  prodPublication,
  publication,
  reserveRawInput,
  sourceInput,
  at,
} from "@immortalis/testkit";
import { actorBasisPin, existingActorContract, wireExistingActor } from "./existing-actor.ts";
import { custodiedCampaign, type PcMoveSeeded, PC } from "./pc-movement.ts";
import { must } from "./temporal.ts";

/**
 * SYNTHETIC TEST SUPPORT for the CPAA-C1 (v0.3 design ratified; implementation acceptance pending) consequential-collection slice. Every owner is the real one: the existing-actor
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

/**
 * The PC's AUTHORED words, in its accepted `embodiment_topology` claim. The mechanism is grounded only in verbatim quotations of this
 * claim: the actuator words, the traversal words and the words that state the exact cycle (numeral and canonical unit).
 */
export const ACTUATOR_WORDS = "the hands of this body gather loose material by hand";
export const TRAVERSAL_CANNOT = "these hands cannot pass a sealed barrier";
export const TRAVERSAL_CAN = "these hands can pass a sealed barrier";
export const cycleWords = (tau: CanonicalTime): string =>
  `one handful every ${tau.value} ${tau.unit}`;
const DEFAULT_TAU: CanonicalTime = { unit: T0.unit, value: TAU };

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
  /** the campaign holds no Production Reserve and no extraction basis (an operator preparation establishes them) */
  readonly noPhysicalSetup?: boolean;
  /** the author declares the setting a closed domain (default: yes; false leaves the solitary class WITHHELD for want of a closure) */
  readonly sceneClosure?: boolean;
  /** Population declares the locality's workforce scope (default: yes; false leaves the PC's relation UNKNOWN for want of a scope) */
  readonly workforceScope?: boolean;
  /** stated source access facts (default: the fixture's "loose on the surface" statement) */
  readonly access?: readonly { aspect: string; statement: string }[];
  /** the cycle the PC's authored claim states (default: TAU canonical units) */
  readonly tau?: CanonicalTime;
  /** does the PC's authored claim say its hands can pass a sealed barrier (default: cannot) */
  readonly ableToPass?: boolean;
  /** replaces the whole authored claim (so a test can author a claim that states no cycle) */
  readonly claimStatement?: string;
  /** replaces the words the mechanism quotes (so a test can present wording the claim does not state) */
  readonly quote?: { actuator?: string; traversal?: string; cycle?: string };
  /** the cycle duration the mechanism asserts (default: the authored tau) */
  readonly assertedTau?: CanonicalTime;
  readonly noMechanism?: boolean;
  /** no I-002 semantic attestation of the cycle is committed (the exact positive is then withheld) */
  readonly noAttestation?: boolean;
  /** no Population ledger attaches to the PC's locus (the owners then hold no presence or representation evidence) */
  readonly noLedger?: boolean;
  /** the units Population's ledger at the PC's locus counts (default: one resident of another place) */
  readonly ledgerUnits?: readonly {
    unit_id: string;
    residence: string;
    presence: string;
    burden_allocation: string | null;
  }[];
  readonly sourceAmount?: number;
}

/** What a faithful I-002 compiler/adjudicator host reads from the delivered task: one same-form unit in one serial cycle, quoted. */
export const cycleAnswer = (
  task: PcCollectionCycleTask,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  task_digest: task.digest,
  reading: "ONE_SAME_FORM_UNIT_ONE_SERIAL_CYCLE",
  actuator_ground: task.actuator,
  cycle_ground: cycleWords(task.cycle),
  grounds: [task.actuator],
  ...over,
});

export const LEDGER_COL = "ledger-col";
export const OTHER_RESIDENT = "unit-other-resident";
const defaultUnits = () => [
  {
    unit_id: OTHER_RESIDENT,
    residence: "place-village",
    presence: "place-village",
    burden_allocation: null,
  },
];

export const authoredClaim = (o: CollectionSeedOptions = {}): string =>
  o.claimStatement ??
  `SYNTHETIC FIXTURE: one body; ${ACTUATOR_WORDS}; ${cycleWords(o.tau ?? DEFAULT_TAU)}; ${
    o.ableToPass ? TRAVERSAL_CAN : TRAVERSAL_CANNOT
  }.`;

/** The existing actor's I-002 contract, with the authored `embodiment_topology` claim the mechanism will quote. */
export const authoredContract = (o: CollectionSeedOptions = {}) =>
  existingActorContract(PC, [actorBasisPin(PC)], {
    embodiment_topology: { statement: authoredClaim(o), provenance: "SAFELY-INHERITED" },
  });

/** A custodied, handed-over PC with a finite source (5), an empty Reserve, Production's basis and the PC's P-1 mechanism: nothing is committed. */
export async function collectionCampaign(o: CollectionSeedOptions = {}): Promise<CollectionSeeded> {
  const base = await custodiedCampaign(o.dir, authoredContract(o));
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
  if (!o.noPhysicalSetup) {
    await must(
      s.drawdown.establishBasis({
        ...drawdownPublication(950),
        extraction_basis: basisInput({ relies_on: access[0] }),
      }),
    );
    await must(
      s.production.establishReserve({ ...prodPublication(950), reserve: reserveRawInput() }),
    );
  }
  if (!o.noLedger)
    await must(
      new PopulationAdapter(s.campaign.store).establishLedger({
        ...popPublication(950),
        ledger: {
          ledger_id: LEDGER_COL,
          unit_class: "synthetic-unit-class",
          world_id: FIXTURE_WORLD_ID,
          locus_id: FIXTURE_LOCUS_ID,
          units: o.ledgerUnits ?? defaultUnits(),
          point: T0,
        },
      }),
    );
  await declareClosedSetting(s, {
    ...(o.sceneClosure === false ? { closure: false } : {}),
    ...(o.workforceScope === false ? { scope: false } : {}),
  });
  if (!o.noMechanism) {
    await must(establishMechanism(s, o));
    if (!o.noAttestation) {
      // a cycle authored in a unit that is not the campaign's canonical unit CANNOT be attested (Temporal keeps unit authority)
      const attested = await attestMechanism(s);
      if (!attested.ok && !o.tau) throw new Error(JSON.stringify(attested.error));
    }
  }
  return s;
}

/**
 * The setting AUTHOR's declaration (BLUE HOLD H-1/H-2, newly authorized): the locus is a closed domain, the source is unencumbered
 * in it, and Population's workforce scope for the locality is the representations it holds. The test supplies only what an author
 * states; the coverage and the accounting are derived by the owners, so a later resident, ledger or actor makes both STALE.
 */
export async function declareClosedSetting(
  s: CollectionSeeded,
  o: {
    closure?: boolean;
    scope?: boolean;
    worldId?: string;
    locusId?: string;
    sourceKey?: string;
    n?: number;
  } = {},
) {
  const worldId = o.worldId ?? W;
  const locusId = o.locusId ?? FIXTURE_LOCUS_ID;
  const sourceKey = o.sourceKey ?? SRC_SOURCE_KEY;
  const n = o.n ?? 980;
  if (o.closure !== false)
    await must(
      s.collect.establishSceneClosure({
        ...colPublication(n),
        world_id: worldId,
        locus_id: locusId,
        domain: {
          designation: "SYNTHETIC FIXTURE: a closed hollow",
          topology: "SYNTHETIC FIXTURE: one open floor ringed by sheer walls; no passage in or out",
        },
        closure: {
          statement:
            "SYNTHETIC FIXTURE: nothing else acts in this hollow beyond what the owners cover; no autonomous process is declared.",
        },
        source_rights: [
          {
            source_fact_key: worldSourceConditionKey(worldId, sourceKey),
            ground:
              "SYNTHETIC FIXTURE: the loose material here is held by no one; no claim on it is established.",
          },
        ],
      }),
    );
  if (o.scope !== false)
    await must(
      s.collect.establishWorkforceScope({
        ...colPublication(n + 1),
        world_id: worldId,
        locus_id: locusId,
        scope: {
          statement:
            "SYNTHETIC FIXTURE: the representations listed are all that account workforce for this hollow.",
        },
      }),
    );
}

/** the I-002 compiler/adjudicator reading of the delivered task, validated by the engine and written by the archivist path */
export async function attestMechanism(
  s: CollectionSeeded,
  over: Record<string, unknown> = {},
  mechanismId = MECH,
) {
  const task = s.collect.cycleTask(PC, mechanismId);
  if (!task) throw new Error("no cycle task");
  return s.collect.attestCycle({
    pc_id: PC,
    mechanism_id: mechanismId,
    answer: cycleAnswer(task, over),
  });
}

/** Population's own determination of the PC's relation to its aggregate workforce (derived; the caller supplies no content) */
export const determineRepresentation = (s: CollectionSeeded, n = 301) =>
  s.collect.determineRepresentation({
    group_id: `rep-group-${n}`,
    intent_id: `rep-intent-${n}`,
    cause: `rep-cause-${n}`,
    basis: "fixture-basis",
    secrecy: "fixture-visibility",
    pc_id: PC,
    source_fact_key: worldSourceConditionKey(W, SRC_SOURCE_KEY),
  });

export const establishMechanism = (s: CollectionSeeded, o: CollectionSeedOptions = {}, n = 951) =>
  s.collect.establishMechanism({
    ...colPublication(n),
    mechanism: {
      pc_id: PC,
      mechanism_id: MECH,
      claims: [{ section: "embodiment_topology", index: 0 }],
      actuator: { statement: o.quote?.actuator ?? ACTUATOR_WORDS },
      traversal: {
        statement: o.quote?.traversal ?? (o.ableToPass ? TRAVERSAL_CAN : TRAVERSAL_CANNOT),
      },
      cycle_duration: o.assertedTau ?? o.tau ?? DEFAULT_TAU,
      cycle_quote: o.quote?.cycle ?? cycleWords(o.tau ?? DEFAULT_TAU),
    },
  });

export const DEST_SOURCE_KEY = "source-dest";
export const DEST_RESERVE = "reserve-dest";
export const DEST_BASIS = "basis-dest";

/** A second finite source (5) and empty Reserve at the journey's DESTINATION locus, with Production's basis for it. */
export async function establishDestinationSource(s: CollectionSeeded): Promise<void> {
  await must(
    s.campaign.establishSourceCondition({
      ...publication(970),
      source: sourceInput({ source_key: DEST_SOURCE_KEY, locus_id: DEST_LOCUS_ID }),
    }),
  );
  await must(
    s.drawdown.establishBasis({
      ...drawdownPublication(970),
      extraction_basis: basisInput({
        basis_id: DEST_BASIS,
        source_key: DEST_SOURCE_KEY,
        relies_on: SRC_ACCESS,
      }),
    }),
  );
  await must(
    s.production.establishReserve({
      ...prodPublication(970),
      reserve: { ...reserveRawInput(DEST_RESERVE), locus_id: DEST_LOCUS_ID },
    }),
  );
  // the owners' presence evidence at the destination: a ledger attached to that locus (one resident who is not the PC)
  await must(
    new PopulationAdapter(s.campaign.store).establishLedger({
      ...popPublication(970),
      ledger: {
        ledger_id: "ledger-dest",
        unit_class: "synthetic-unit-class",
        world_id: FIXTURE_WORLD_ID,
        locus_id: DEST_LOCUS_ID,
        units: [
          {
            unit_id: "unit-dest-resident",
            residence: "place-hamlet",
            presence: "place-hamlet",
            burden_allocation: null,
          },
        ],
        point: T0,
      },
    }),
  );
}

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
  scene: "SOLITARY" | "ENGAGED" | "UNDETERMINED" | "SOLITARY_UNACKNOWLEDGED" = "SOLITARY",
): Record<string, unknown> {
  const sceneGrounds =
    scene === "UNDETERMINED"
      ? []
      : [
          task.scene.statements[0]!,
          ...(scene === "SOLITARY_UNACKNOWLEDGED"
            ? []
            : task.scene.presence_here.map((p) => p.statement)),
        ];
  return {
    scene: {
      reading:
        scene === "ENGAGED"
          ? "CO_PRESENT_CONSEQUENTIAL_INTERACTION"
          : scene === "UNDETERMINED"
            ? "NOT_ESTABLISHED"
            : "NO_CO_PRESENT_CONSEQUENTIAL_INTERACTION",
      grounds: sceneGrounds,
    },
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
  reading: [
    Parameters<typeof hostAnswer>[1],
    Parameters<typeof hostAnswer>[2],
    Parameters<typeof hostAnswer>[3]?,
  ] = ["OPEN", "NOT_AT_ISSUE"],
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

/** commit → reach judgment → Population's registration, but NOT Production's start (so a test can attempt the start its own way). */
export async function prepareToStart(
  s: CollectionSeeded,
  act: string,
  quantity: number,
  reading: [
    Parameters<typeof hostAnswer>[1],
    Parameters<typeof hostAnswer>[2],
    Parameters<typeof hostAnswer>[3]?,
  ] = ["OPEN", "NOT_AT_ISSUE"],
) {
  const ctx = trustedCollection(s, act, quantity);
  const committed = await commitConfirmedPcCollection(ctx, COMMIT_REQ);
  const task = getPcCollectionReachTask(ctx, TASK_REQ);
  if (!task.ok) throw new Error("no reach task");
  const judged = await submitPcCollectionReach(
    ctx,
    reachReq(hostAnswer(task.value.task, ...reading)),
  );
  await determineRepresentation(s);
  const occ = await s.collect.registerOccupancy({
    ...colPublication(300),
    pc_id: PC,
    act_id: act,
    mechanism_id: MECH,
  });
  return { ctx, task: task.value.task, committed, judged, occ };
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

/** The gateway's own identities (RC-16) for Population's determination, so a test that stops the chain half-way converges by identity. */
export const gatewayRepresentation = (s: CollectionSeeded, act: string) =>
  s.collect.determineRepresentation({
    group_id: `pc-collect-group:representation:${PC}:${act}`,
    intent_id: `pc-collect-intent:representation:${PC}:${act}`,
    cause: `cause-${act}`,
    basis: "fixture-basis",
    secrecy: "fixture-visibility",
    pc_id: PC,
    source_fact_key: worldSourceConditionKey(W, SRC_SOURCE_KEY),
  });
