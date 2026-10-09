import {
  CanonicalCampaign,
  CultureAdapter,
  CultureAdjudicationAdapter,
  CultureContextAttestor,
  PopulationAdapter,
  PopulationScopeCloseVerifier,
  TemporalCoordinator,
  populationBarrierEvaluator,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  OWNER_CULTURE,
  populationCohortKey,
  worldLocusKey,
  type CanonicalTime,
  type CjaContextAttestation,
  type CultureUpdateContext,
  type ResolutionRequest,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  CJA_TEST_RULE,
  COHORT_BURDEN_L,
  COHORT_BURDEN_M,
  CRITERION_KEY,
  CULTURE_CONSEQUENCE_SOURCES,
  CULTURE_CONTEXT_MARKET,
  CULTURE_FIXTURE_EXTENSION,
  DEFAULT_OBSERVATIONS,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  GM_OPERATION,
  LEDGER_MAIN,
  PLACE_L,
  PLACE_M,
  POP_TP,
  SYNTH_CAUSE_OWNER,
  SYNTH_CRITERION_OWNER,
  TEST_CONSUMER_QUESTION,
  at,
  advanceToRequest,
  burdenCohort,
  criterion,
  cultureConsumerBoundaryId,
  cultureConsumerObject,
  cultureReaderObject,
  cultureProviders,
  fixtureLocus,
  fixtureWorld,
  ledgerInput,
  observationGroup,
  observationKey,
  popClose1Object,
  popClose2Object,
  popPublication,
  publication,
  register,
  registerKey,
  scriptedJudgment,
  statusViewCohort,
  syntheticGroup,
  temporalPublication,
  type ScriptedKind,
  type TestObservation,
  exitEnvelope,
  entryEnvelope,
  unit,
  POP_T0,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export const SECOND_LOCUS_ID = "locus-fixture-2";
/** The bound referent (a committed World-State locus) and scope (a second one) of the primary scenario. */
export const REFERENT_KEY = worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID);
export const SCOPE_KEY = worldLocusKey(FIXTURE_WORLD_ID, SECOND_LOCUS_ID);
/** the ONE RC-12 Cohort scope of the primary scenario */
export const COHORT_KEY = populationCohortKey(LEDGER_MAIN, COHORT_BURDEN_L);

export interface CultureSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly culture: CultureAdapter;
  /** the REAL Port A */
  readonly attestor: CultureContextAttestor;
  /** the merged CJA1 adjudication adapter, wired to the real attestor */
  readonly gm: CultureAdjudicationAdapter;
}

export interface CultureSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
}

export const cultureCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, cultureProviders(), populationBarrierEvaluator);

export const populationScope = (store: Pick<CampaignStore, "getFact">) =>
  new PopulationScopeCloseVerifier(store, { consequenceSources: CULTURE_CONSEQUENCE_SOURCES });

export const gmAdapter = (store: CampaignStore, attestor = new CultureContextAttestor(store)) =>
  new CultureAdjudicationAdapter(store, {
    contextPort: attestor,
    consumer: {
      owner: OWNER_CULTURE,
      operation: CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
    },
    rule: CJA_TEST_RULE,
  });

const wire = (campaign: CanonicalCampaign): CultureSeeded => {
  const attestor = new CultureContextAttestor(campaign.store);
  return {
    campaign,
    coordinator: cultureCoordinator(campaign.store),
    culture: new CultureAdapter(campaign.store, {
      populationScope: populationScope(campaign.store),
    }),
    attestor,
    gm: gmAdapter(campaign.store, attestor),
  };
};

/**
 * The prerequisite canonical campaign: a world and two loci (the referent and the scope); the Population proof's synthetic
 * parties (the Criterion Owner's fact, the causal owner's register, one ledger and its Cohorts); the canonical temporal basis;
 * and ordinary Population close #1 RESOLVED at TP, so a REAL Cohort stamped by a REAL close exists. No observation, context,
 * decision or shared meaning exists yet.
 */
export async function seededCultureCampaign(
  dir: string,
  o: CultureSeedOptions = {},
): Promise<CultureSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "culture-seed",
      extension: CULTURE_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(
    campaign.establishLocus({
      ...publication(3),
      locus: fixtureLocus({ locus_id: SECOND_LOCUS_ID }),
    }),
  );
  const store = campaign.store;
  await must(
    store.commit(
      syntheticGroup(
        FIXTURE_CAMPAIGN,
        SYNTH_CRITERION_OWNER,
        1,
        CRITERION_KEY,
        criterion(POP_TP, ["u-1", "u-2", "u-5"]),
        0,
      ),
    ),
  );
  await must(
    store.commit(
      syntheticGroup(
        FIXTURE_CAMPAIGN,
        SYNTH_CAUSE_OWNER,
        2,
        registerKey(LEDGER_MAIN),
        register(LEDGER_MAIN, ORDINARY_ENVELOPES()),
        0,
      ),
    ),
  );
  const population = new PopulationAdapter(store);
  await must(population.establishLedger({ ...popPublication(1), ledger: ledgerInput() }));
  await must(
    population.instantiateCohort({
      ...popPublication(3),
      ref: burdenCohort(COHORT_BURDEN_L, PLACE_L),
    }),
  );
  await must(
    population.instantiateCohort({
      ...popPublication(4),
      ref: burdenCohort(COHORT_BURDEN_M, PLACE_M),
    }),
  );
  await must(population.instantiateCohort({ ...popPublication(5), ref: statusViewCohort() }));
  const s = wire(campaign);
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: POP_T0 }));
  await must(
    s.coordinator.registerObject({ ...temporalPublication(2), object: popClose1Object() }),
  );
  await must(s.coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
  return s;
}

export async function reopenCulture(
  dir: string,
  buildId = "culture-reopen",
): Promise<CultureSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: CULTURE_FIXTURE_EXTENSION }),
  );
  return wire(campaign);
}

/** Ordinary envelopes already committed before close #1: Entry u-5, Exit (cessation) u-4. */
export const ORDINARY_ENVELOPES = () => [
  entryEnvelope("env-a", unit("u-5", PLACE_L, PLACE_L), at(110)),
  exitEnvelope("env-b", "u-4", at(115)),
];

/** Commits (as the causal owner) the register carrying `extra` beside the ordinary envelopes: new pending consequences. */
export async function commitPending(
  store: CampaignStore,
  n: number,
  extra: ReturnType<typeof entryEnvelope>[],
): Promise<void> {
  const cur = store.getFact(registerKey(LEDGER_MAIN));
  await must(
    store.commit(
      syntheticGroup(
        FIXTURE_CAMPAIGN,
        SYNTH_CAUSE_OWNER,
        n,
        registerKey(LEDGER_MAIN),
        register(LEDGER_MAIN, [...ORDINARY_ENVELOPES(), ...extra]),
        cur?.version ?? 0,
      ),
    ),
  );
}

/** A pending Exit of a current member of the burden Cohort, effective BEFORE the canonical time and absent from close #1. */
export const lateExit = () =>
  exitEnvelope("env-late", "u-1", at(118), "REVERSIBLE_MEMBERSHIP_EXIT");

/** Commits the synthetic observations (acts / participants / exposure only), ids in order. */
export async function commitObservations(
  s: CultureSeeded,
  observations: readonly TestObservation[] = DEFAULT_OBSERVATIONS,
  start = 1,
): Promise<void> {
  let n = start;
  for (const ob of observations) {
    await must(s.campaign.store.commit(observationGroup(FIXTURE_CAMPAIGN, n++, ob.id, ob.value)));
  }
}

/** The primary seal request: the four observations (the first is the trigger), the burden Cohort, the referent and scope. */
export const sealRequest = (
  over: Partial<{
    referent_key: string;
    scope_key: string;
    context_id: string;
    inputs: unknown[];
    trigger_fact_key: string;
    cohort_fact_key: string;
    consumer_question: string;
  }> = {},
) => ({
  referent_key: REFERENT_KEY,
  scope_key: SCOPE_KEY,
  context_id: CULTURE_CONTEXT_MARKET,
  inputs: DEFAULT_OBSERVATIONS.map((ob) => ({
    fact_key: observationKey(ob.id),
    read: { basis: "AS-OF-NOW" },
  })),
  trigger_fact_key: observationKey("obs-trigger"),
  cohort_fact_key: COHORT_KEY,
  consumer_question: TEST_CONSUMER_QUESTION,
  ...over,
});

export const seal = (s: CultureSeeded, request: unknown = sealRequest(), n = 1) =>
  s.culture.sealUpdateContext({ basis: `culture-fixture-basis-${n}`, request });

/** The Culture contexts committed so far, as {update id, value}. */
export const sealedContexts = (s: CultureSeeded) =>
  s.campaign.store
    .listFacts()
    .filter((f) => /^culture\/update\/[0-9a-f]{64}\/context$/.test(f.key))
    .map((f) => ({
      updateId: f.key.split("/")[2]!,
      fact: f,
      value: f.value as CultureUpdateContext,
    }));

/** Observations committed, context sealed: the prerequisite of every adjudication. Returns the sealed context. */
export async function preparedCulture(s: CultureSeeded) {
  await commitObservations(s);
  await must(seal(s));
  return sealedContexts(s)[0]!;
}

export const attestationOf = (s: CultureSeeded, updateId: string): CjaContextAttestation => {
  const r = s.attestor.attest(updateId);
  if (r.status !== "ATTESTED") throw new Error("no context attested");
  return r.attestation as CjaContextAttestation;
};

/** The scripted GM judges the sealed context of `updateId` under the trusted operation precondition. */
export const judge = (s: CultureSeeded, updateId: string, kind: ScriptedKind = "positive") =>
  s.gm.adjudicate({
    operation: GM_OPERATION,
    judgment: scriptedJudgment(attestationOf(s, updateId), kind),
  });

/**
 * The full authored pipeline in the CJA1 §3.3 / §10.B order — commit cause, seal the context, REGISTER the consuming object
 * (when `consumer` is given), commit the judgment — up to (not including) the temporal close.
 */
export async function judgedCulture(
  s: CultureSeeded,
  kind: ScriptedKind = "positive",
  consumer?: { readonly id: string; readonly tn: number; readonly boundary?: CanonicalTime },
) {
  const ctx = await preparedCulture(s);
  if (consumer)
    await registerCultureConsumer(s, consumer.id, ctx.value, consumer.tn, consumer.boundary);
  await must(judge(s, ctx.updateId, kind));
  return ctx;
}

/** A test coordinate strictly after the current canonical time: an engaged object's earned boundary must lie in the future. */
export const boundaryAfterNow = (s: CultureSeeded): CanonicalTime => {
  const now = s.coordinator.state()!.value.canonical_time;
  return at(now.value + 10);
};

export const requestTo = (
  txId: string,
  target: CanonicalTime,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: txId,
  cause: `cause-${txId}`,
  trigger: { kind: "fixture-advance-request", ref: `ref-${txId}` },
  continues: null,
  requested: { target, condition: null },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

export const requestToBoundary = (
  s: CultureSeeded,
  txId: string,
  objectId: string,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => {
  const object = s.coordinator.object(objectId);
  if (!object?.value.next_boundary) throw new Error(`no engaged boundary for ${objectId}`);
  return requestTo(txId, object.value.next_boundary.at, over);
};

export const cultureConsumerObjectAt = (
  s: CultureSeeded,
  consumerId: string,
  context: CultureUpdateContext,
  over: Partial<TemporalObject> = {},
): TemporalObject =>
  cultureConsumerObject(consumerId, context, {
    last_resolved_basis: s.coordinator.state()!.value.canonical_time,
    next_boundary: { boundary_id: cultureConsumerBoundaryId(consumerId), at: boundaryAfterNow(s) },
    ...over,
  });

/** Registers the engaged object of one dependent consequence that materially requires the shared meaning/norm. */
export async function registerCultureConsumer(
  s: CultureSeeded,
  consumerId: string,
  context: CultureUpdateContext,
  tn: number,
  boundary?: CanonicalTime,
): Promise<void> {
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: cultureConsumerObjectAt(
        s,
        consumerId,
        context,
        boundary
          ? { next_boundary: { boundary_id: cultureConsumerBoundaryId(consumerId), at: boundary } }
          : {},
      ),
    }),
  );
}

/** A later consequence that only READS the committed meaning (declares no Culture stage): lawful after the decision. */
export async function registerCultureReader(
  s: CultureSeeded,
  consumerId: string,
  context: CultureUpdateContext,
  tn: number,
): Promise<void> {
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: cultureReaderObject(consumerId, context.slot_id, {
        last_resolved_basis: s.coordinator.state()!.value.canonical_time,
        next_boundary: {
          boundary_id: cultureConsumerBoundaryId(consumerId),
          at: boundaryAfterNow(s),
        },
      }),
    }),
  );
}

/** Advances toward one Culture consumer's earned boundary and no further. */
export const advanceCulture = (s: CultureSeeded, txId: string, consumerId: string) =>
  s.coordinator.advance(requestToBoundary(s, txId, `culture-consumer-obj-${consumerId}`));

export function cultureSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
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
    culture: under(/^culture\//),
    adjudication: under(/^adjudication-culture\//),
    consumer: under(/^synthetic-culture-result-consumer\//),
    observations: under(/^synthetic-cja-observation\//),
    world: under(/^world\//),
    population: under(/^population\//),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}

export { CULTURE_CONTEXT_MARKET, FIXTURE_CAMPAIGN };

/** The Criterion Owner establishes its fact for `point` (create or advance). */
export async function commitCriterionAt(
  store: CampaignStore,
  n: number,
  point: CanonicalTime,
  ids: string[],
): Promise<void> {
  const cur = store.getFact(CRITERION_KEY);
  await must(
    store.commit(
      syntheticGroup(
        FIXTURE_CAMPAIGN,
        SYNTH_CRITERION_OWNER,
        n,
        CRITERION_KEY,
        criterion(point, ids),
        cur?.version ?? 0,
      ),
    ),
  );
}

/**
 * A SECOND ordinary Population reconciliation, resolved at 140 on its own earned boundary: the Population ledger, close and
 * Cohorts advance to new versions and consume any pending consequence. After it, nothing is due.
 */
export async function completePopulationClose2(s: CultureSeeded, n = 40): Promise<void> {
  const to = at(140);
  await commitCriterionAt(s.campaign.store, n, to, ["u-1", "u-2", "u-5"]);
  await must(
    s.coordinator.registerObject({
      ...temporalPublication(n),
      object: popClose2Object({
        last_resolved_basis: POP_TP,
        next_boundary: { boundary_id: "boundary-pop-close-2", at: to },
      }),
    }),
  );
  await must(s.coordinator.advance(advanceToRequest(`tx-pop-${n}`, to)));
}
