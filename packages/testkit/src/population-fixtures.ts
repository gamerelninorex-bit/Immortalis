import {
  CANON_WRITE_AUTHORITY,
  POPULATION_CLOSE_BASIS,
  populationCloseKey,
  populationCohortKey,
  READ_MODE_CLOSE,
  type CanonicalTime,
  type CohortRef,
  type CommitGroup,
  type ConsequenceEnvelope,
  type ConsequenceRegister,
  type DependencyDeclaration,
  type ExternalCriterion,
  type PendingConsequenceBarrier,
  type SourceFactRef,
  type PopulationUnit,
  type ResolutionRequest,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  populationCloseStage,
  populationReconcileDeclaration,
  populationStageProvider,
  populationTemporalObject,
  type StageOwnerExtension,
  type StageProvider,
  type WriteAdmission,
} from "@immortalis/engine";
import { FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID } from "./canonical-fixtures.ts";
import { SYNTH_RULE, TIME_UNIT, at } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the Population & Cohort Reconciliation Backbone Foundation. Every owner,
 * place, unit, envelope, coordinate and value below is a fixture, not IMMORTALIS canon: it carries no
 * game semantics, no demographic rate, no labor coefficient, no capacity and no tolerance (CAL-01 and
 * CAL-02 stay unresolved). The Population owner itself is NOT synthetic and lives in @immortalis/engine;
 * what is synthetic here are the OTHER parties of the proof — an external Criterion Owner, a causal owner
 * that commits consequence envelopes, and a dependent consumer — each registered through an extension
 * that cannot write a canonical, kernel or Population key space. Production code must never import this
 * package (Bootstrap Plan §2.2).
 */
export const SYNTH_CRITERION_OWNER = "SYNTHETIC-CRITERION-OWNER";
export const SYNTH_CAUSE_OWNER = "SYNTHETIC-CAUSE-OWNER";
export const SYNTH_CONSUMER_OWNER = "SYNTHETIC-POPULATION-CONSUMER";

const PREFIX: Record<string, string> = {
  [SYNTH_CRITERION_OWNER]: "synthetic-criterion/",
  [SYNTH_CAUSE_OWNER]: "synthetic-cause/",
  [SYNTH_CONSUMER_OWNER]: "synthetic-consumer/",
};
const FACET: Record<string, string> = {
  [SYNTH_CRITERION_OWNER]: "synthetic-criterion",
  [SYNTH_CAUSE_OWNER]: "synthetic-cause",
  [SYNTH_CONSUMER_OWNER]: "synthetic-consumer",
};

/** Each synthetic owner may write only under its own prefix (a synthetic owner is still an owner). */
const POPULATION_FIXTURE_ADMISSION: WriteAdmission = {
  check(group) {
    for (const w of group.writes) {
      if (!w.key.startsWith(PREFIX[group.owner] ?? "\u0000")) {
        return {
          code: "KEY_NOT_ADMITTED",
          message: "not this synthetic owner's key",
          details: { key: w.key },
        };
      }
    }
    return null;
  },
};

export const POPULATION_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map(Object.entries(FACET).map(([o, f]) => [o, new Set([f])])),
  admission: POPULATION_FIXTURE_ADMISSION,
};

// -- coordinates (test coordinates only) ---------------------------------------------------------------
export const POP_T0 = at(100);
export const POP_TP = at(120); // ordinary Population close #1
export const POP_TC = at(160); // the dependent consumer's earned boundary
export const POP_TC2 = at(220); // a second dependent consumer (after reload)
export const POP_T1 = at(300);
export { TIME_UNIT };

// -- places and units -----------------------------------------------------------------------------------
/** The canonical locus the ledger is attached to is a place; "place-m" is an elsewhere. */
export const PLACE_L = FIXTURE_LOCUS_ID;
export const PLACE_M = "place-m";
export const LEDGER_MAIN = "ledger-main";
export const LEDGER_OTHER = "ledger-other";

/**
 * Residence, Presence and Burden Locus deliberately differ (WS-001 §2, WS-015 §IV):
 *   u-1 resident L, present L                      → burden L (present)
 *   u-2 resident L, present M, no allocation       → burden M (present)
 *   u-3 resident L, present M, burden allocated L  → burden L (the recorded allocation controls)
 *   u-4 resident M, present M                      → burden M
 */
export const unit = (
  unit_id: string,
  residence: string,
  presence: string,
  burden_allocation: string | null = null,
): PopulationUnit => ({ unit_id, residence, presence, burden_allocation });

export const mainUnits = (): PopulationUnit[] => [
  unit("u-1", PLACE_L, PLACE_L),
  unit("u-2", PLACE_L, PLACE_M),
  unit("u-3", PLACE_L, PLACE_M, PLACE_L),
  unit("u-4", PLACE_M, PLACE_M),
];
export const otherUnits = (): PopulationUnit[] => [
  unit("o-1", PLACE_L, PLACE_L),
  unit("o-2", PLACE_L, PLACE_L),
];

export const ledgerInput = (ledger_id = LEDGER_MAIN, units = mainUnits(), point = POP_T0) => ({
  ledger_id,
  unit_class: "synthetic-unit-class",
  world_id: FIXTURE_WORLD_ID,
  locus_id: FIXTURE_LOCUS_ID,
  units,
  point,
});

// -- cohorts --------------------------------------------------------------------------------------------
export const COHORT_BURDEN_L = "cohort-burden-l";
export const COHORT_BURDEN_M = "cohort-burden-m";
export const COHORT_STATUS_L = "cohort-status-l";
export const COHORT_OTHER = "cohort-other";
export const CRITERION_KEY = "synthetic-criterion/status";
export const PARTITION_BURDEN = "partition-burden-carriers";

const popCloseRead = { mode: "AS-OF-DECLARED-CLOSE", close_basis: POPULATION_CLOSE_BASIS } as const;

const baseRef = (ledger: string) => ({
  unit_class: "synthetic-unit-class",
  count_custodian: "population" as const,
  cardinality_semantics: "EXACT" as const,
  temporal_read: popCloseRead,
  retention: "CURRENT-ONLY" as const,
  retirement: { predicate: "ZERO_LIVE_DEPENDENCIES_AND_NO_REMAINING_NEED" as const },
  scope: (place: string) => ({ ledger_id: ledger, place }),
  invalidators: [{ fact_key: `population/${ledger}/ledger` }],
});

/** A Population-owned Conserved Partition Cohort indexed on Burden Locus. */
export const burdenCohort = (
  cohort_id: string,
  place: string,
  ledger = LEDGER_MAIN,
  over: Partial<CohortRef> = {},
): CohortRef => {
  const b = baseRef(ledger);
  return {
    cohort_id,
    unit_class: b.unit_class,
    count_custodian: b.count_custodian,
    criterion: { owner: "population", ref: null },
    indexed_fact: "BURDEN_LOCUS",
    scope: b.scope(place),
    membership_basis: "INDEXED_FACT_AT_PLACE",
    form: "CONSERVED_PARTITION",
    cardinality_semantics: b.cardinality_semantics,
    overlap: { declaration: "DISJOINT_PARTITION", partition_id: PARTITION_BURDEN },
    temporal_read: b.temporal_read,
    retention: b.retention,
    invalidators: b.invalidators,
    retirement: b.retirement,
    ...over,
  };
};

/** An externally qualified derived view: criterion owned by the synthetic Criterion Owner. */
export const statusViewCohort = (over: Partial<CohortRef> = {}): CohortRef => {
  const b = baseRef(LEDGER_MAIN);
  return {
    cohort_id: COHORT_STATUS_L,
    unit_class: b.unit_class,
    count_custodian: b.count_custodian,
    criterion: {
      owner: SYNTH_CRITERION_OWNER,
      ref: { owner: SYNTH_CRITERION_OWNER, fact_key: CRITERION_KEY },
    },
    indexed_fact: "RESIDENCE",
    scope: b.scope(PLACE_L),
    membership_basis: "INDEXED_FACT_AT_PLACE_AND_EXTERNAL_CRITERION",
    form: "OVERLAPPING_VIEW",
    cardinality_semantics: b.cardinality_semantics,
    overlap: { declaration: "OVERLAPPING" },
    temporal_read: b.temporal_read,
    retention: b.retention,
    invalidators: [...b.invalidators, { fact_key: CRITERION_KEY }],
    retirement: b.retirement,
    ...over,
  };
};

// -- criterion and causal-owner publications ----------------------------------------------------------------
export const criterion = (resolution_point: CanonicalTime, ids: string[]): ExternalCriterion => ({
  resolution_point,
  qualifying_unit_ids: [...ids].sort(),
});

export const registerKey = (ledger: string): string => `synthetic-cause/register/${ledger}`;
/** A second, lawful register of the same causal owner — one the consumer's barrier does NOT declare. */
export const registerBKey = (ledger: string): string => `synthetic-cause/register-b/${ledger}`;

export const envelope = (
  envelope_id: string,
  ledger: string,
  consequence: ConsequenceEnvelope["consequence"],
  atPoint: CanonicalTime,
  over: Partial<ConsequenceEnvelope> = {},
): ConsequenceEnvelope => ({
  envelope_id,
  causing_event: { owner: SYNTH_CAUSE_OWNER, event_id: `event-${envelope_id}` },
  affected: {
    ledger_id: ledger,
    unit_ids: [consequence.kind === "ENTRY" ? consequence.unit.unit_id : consequence.unit_id],
  },
  basis: { at: atPoint },
  consequence,
  writer: { owner: SYNTH_CAUSE_OWNER },
  downstream_consumer: { owner: "population", ledger_id: ledger },
  ...over,
});

export const entryEnvelope = (
  id: string,
  u: PopulationUnit,
  atPoint: CanonicalTime,
  ledger = LEDGER_MAIN,
) => envelope(id, ledger, { kind: "ENTRY", adapter: "synthetic-entry-adapter", unit: u }, atPoint);
export const exitEnvelope = (
  id: string,
  unit_id: string,
  atPoint: CanonicalTime,
  disposition: "REVERSIBLE_MEMBERSHIP_EXIT" | "CESSATION" = "CESSATION",
  ledger = LEDGER_MAIN,
) =>
  envelope(
    id,
    ledger,
    {
      kind: "EXIT",
      adapter: "synthetic-exit-adapter",
      disposition,
      unit_id,
      continuity_ref: disposition === "CESSATION" ? null : `continuity-${id}`,
    },
    atPoint,
  );

export const register = (
  ledger: string,
  envelopes: ConsequenceEnvelope[],
): ConsequenceRegister => ({
  ledger_id: ledger,
  envelopes: [...envelopes].sort((a, b) => (a.envelope_id < b.envelope_id ? -1 : 1)),
});

/** A synthetic-owner publication (criterion or causal owner): create (version 0) or advance. */
export function syntheticGroup(
  campaignId: string,
  owner: string,
  n: number,
  key: string,
  value: unknown,
  expectedVersion: number,
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: `pop-fixture-group-${n}`,
    intent_id: `pop-fixture-intent-${n}`,
    owner,
    facet: FACET[owner]!,
    cause: `pop-fixture-cause-${n}`,
    rule: SYNTH_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key,
        owner,
        facet: FACET[owner]!,
        value: value as never,
        unit: null,
        basis: "pop-fixture-basis",
        secrecy: "pop-fixture-secrecy",
        expected_version: expectedVersion,
      },
    ],
  };
}

// -- the dependent consumer ---------------------------------------------------------------------------------
export const SYNTH_OP_POP_CONSUME = "synthetic-population-consume";
export const CONSUMER_PROCESS = "synthetic-consumer-process";
export const CONSUMER_RESULT_1 = "synthetic-consumer/result/1";
export const CONSUMER_RESULT_2 = "synthetic-consumer/result/2";
export const CONSUMER_ATTACHMENT = "synthetic-consumer/attachment/cohort-status-l";

export const popConsumerStage = (n: 1 | 2) => ({
  causal_process_id: `${CONSUMER_PROCESS}-${n}`,
  owner_operation: { owner: SYNTH_CONSUMER_OWNER, operation: SYNTH_OP_POP_CONSUME },
  prospective_result_id: `consumer-result-${n}`,
});

export const populationBarrier = (
  over: Partial<PendingConsequenceBarrier> = {},
): PendingConsequenceBarrier => ({
  barrier: "PCB-01",
  population: { ledger_id: LEDGER_MAIN, cohort_id: COHORT_STATUS_L },
  discrete_facets: ["MEMBERSHIP", "PRESENCE"],
  consequence_sources: [{ owner: SYNTH_CAUSE_OWNER, fact_key: registerKey(LEDGER_MAIN) }],
  reconciliation_object_id: "obj-pop-close-2",
  close_basis: POPULATION_CLOSE_BASIS,
  ...over,
});

/** Reads the Population close and the externally qualified view AS-OF-DECLARED-CLOSE (named close basis). */
export const popConsumerDeclaration = (
  n: 1 | 2 = 1,
  barrier: PendingConsequenceBarrier | null = populationBarrier(),
): DependencyDeclaration => ({
  stage: popConsumerStage(n),
  reads: [
    {
      mode: READ_MODE_CLOSE,
      source: { owner: "population", fact_key: populationCloseKey(LEDGER_MAIN) },
      close_basis: POPULATION_CLOSE_BASIS,
      invalidators: [{ fact_key: populationCloseKey(LEDGER_MAIN) }],
    },
    {
      mode: READ_MODE_CLOSE,
      source: { owner: "population", fact_key: populationCohortKey(LEDGER_MAIN, COHORT_STATUS_L) },
      close_basis: POPULATION_CLOSE_BASIS,
      invalidators: [{ fact_key: populationCohortKey(LEDGER_MAIN, COHORT_STATUS_L) }],
    },
  ],
  produces: [n === 1 ? CONSUMER_RESULT_1 : CONSUMER_RESULT_2],
  declares_close: null,
  ...(barrier ? { pending_consequence_barrier: barrier } : {}),
});

const common = {
  partition: { class: "EXACT-PARTITION" as const },
  continuation: { resume_from: "LAST_RESOLVED_BASIS" as const, reconciliation_due: [] as [] },
  information_latency: { creates_epistemic_interruption: false as const },
};

export const popConsumerObject = (
  n: 1 | 2 = 1,
  over: Partial<TemporalObject> = {},
  barrier: PendingConsequenceBarrier | null = populationBarrier(),
): TemporalObject => ({
  object_id: `obj-consumer-${n}`,
  owning_ref: { owner: SYNTH_CONSUMER_OWNER, process_id: `${CONSUMER_PROCESS}-${n}` },
  last_resolved_basis: POP_T0,
  next_boundary: { boundary_id: `boundary-consumer-${n}`, at: n === 1 ? POP_TC : POP_TC2 },
  dependencies: [popConsumerDeclaration(n, barrier)],
  invalidators: [],
  ...common,
  ...over,
});

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The synthetic consumer's operation: records exactly what close and view it read. Pure. */
export const populationConsumerProvider: StageProvider = {
  owner: SYNTH_CONSUMER_OWNER,
  facet: FACET[SYNTH_CONSUMER_OWNER]!,
  operation: SYNTH_OP_POP_CONSUME,
  rule: SYNTH_RULE,
  compute({ reads, produces }) {
    const close = reads[0]!.fact.value;
    const view = reads[1]!.fact.value;
    const result = isPlain(view) ? view["result"] : null;
    return produces.map((key) => ({
      key,
      value: {
        observed_close_point: isPlain(close) ? close["resolution_point"] : null,
        observed_close_count: isPlain(close) ? close["closing"] : null,
        observed_view: isPlain(result) ? result["members"] : null,
        read_close_version: reads[0]!.read.source_basis.version,
        read_view_version: reads[1]!.read.source_basis.version,
      } as never,
      unit: null,
      basis: "pop-fixture-basis",
      secrecy: "pop-fixture-secrecy",
    }));
  },
};

export const populationProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([populationStageProvider, populationConsumerProvider]);

// -- Population temporal objects -------------------------------------------------------------------------------
export const OBJECT_POP_CLOSE_1 = "obj-pop-close-1";
export const OBJECT_POP_CLOSE_2 = "obj-pop-close-2";
export const OBJECT_POP_OTHER = "obj-pop-other";
export const BOUNDARY_POP_CLOSE_1 = "boundary-pop-close-1";

const mainSpec = (resultId: string, extraSources: SourceFactRef[] = []) => ({
  ledgerId: LEDGER_MAIN,
  resultId,
  cohortIds: [COHORT_BURDEN_L, COHORT_BURDEN_M, COHORT_STATUS_L],
  criteria: [{ owner: SYNTH_CRITERION_OWNER, fact_key: CRITERION_KEY }],
  consequenceSources: [
    { owner: SYNTH_CAUSE_OWNER, fact_key: registerKey(LEDGER_MAIN) },
    ...extraSources,
  ],
});

/** Ordinary close #1: earns its boundary at TP. */
export const popClose1Object = (over: Partial<TemporalObject> = {}): TemporalObject => ({
  ...populationTemporalObject({
    objectId: OBJECT_POP_CLOSE_1,
    ledgerId: LEDGER_MAIN,
    lastResolvedBasis: POP_T0,
    nextBoundary: { boundary_id: BOUNDARY_POP_CLOSE_1, at: POP_TP },
    declaration: populationReconcileDeclaration(mainSpec("close-1")),
  }),
  ...over,
});

/** The next eligible reconciliation: dormant (no earned boundary), made due only by a PCB-01 barrier. */
export const popClose2Object = (
  over: Partial<TemporalObject> = {},
  extraSources: SourceFactRef[] = [],
): TemporalObject => ({
  ...populationTemporalObject({
    objectId: OBJECT_POP_CLOSE_2,
    ledgerId: LEDGER_MAIN,
    lastResolvedBasis: POP_T0,
    nextBoundary: null,
    declaration: populationReconcileDeclaration(mainSpec("close-2", extraSources)),
  }),
  ...over,
});

/** An unrelated Population ledger's reconciliation: dormant, never engaged by the proof. */
export const popOtherObject = (): TemporalObject =>
  populationTemporalObject({
    objectId: OBJECT_POP_OTHER,
    ledgerId: LEDGER_OTHER,
    lastResolvedBasis: POP_T0,
    nextBoundary: null,
    declaration: populationReconcileDeclaration({
      ledgerId: LEDGER_OTHER,
      resultId: "close-1",
      cohortIds: [COHORT_OTHER],
      criteria: [],
      consequenceSources: [{ owner: SYNTH_CAUSE_OWNER, fact_key: registerKey(LEDGER_OTHER) }],
    }),
  });

export const popCloseStage = populationCloseStage;

// -- requests ----------------------------------------------------------------------------------------------
const CONTEXT = { role: "role.player", permission: "permission.player_choice.commit" } as const;

/** A target-only request: resolve every earned boundary due by `target`, then stop exactly there. */
export const advanceToRequest = (
  id: string,
  target: CanonicalTime,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "fixture-advance-request", ref: `ref-${id}` },
  continues: null,
  requested: { target, condition: null },
  context: CONTEXT,
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

export const popPublication = (n: number) => ({
  group_id: `pop-group-${n}`,
  intent_id: `pop-intent-${n}`,
  cause: `pop-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});
