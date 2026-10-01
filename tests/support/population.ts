import {
  CanonicalCampaign,
  PopulationAdapter,
  TemporalCoordinator,
  populationBarrierEvaluator,
  type CampaignStore,
  type FileCampaignOptions,
} from "@immortalis/engine";
import {
  COHORT_BURDEN_L,
  COHORT_BURDEN_M,
  COHORT_OTHER,
  CRITERION_KEY,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  LEDGER_MAIN,
  LEDGER_OTHER,
  PLACE_L,
  POPULATION_FIXTURE_EXTENSION,
  POP_T0,
  POP_TP,
  SYNTH_CAUSE_OWNER,
  SYNTH_CRITERION_OWNER,
  at,
  burdenCohort,
  criterion,
  entryEnvelope,
  exitEnvelope,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  ledgerInput,
  otherUnits,
  popClose1Object,
  popConsumerObject,
  POP_TC,
  advanceToRequest,
  popClose2Object,
  popOtherObject,
  popPublication,
  populationProviders,
  publication,
  register,
  registerKey,
  statusViewCohort,
  syntheticGroup,
  temporalPublication,
  unit,
  PLACE_M,
  PARTITION_BURDEN,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export interface PopSeeded {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly population: PopulationAdapter;
}

export const popCoordinator = (store: CampaignStore): TemporalCoordinator =>
  new TemporalCoordinator(store, populationProviders(), populationBarrierEvaluator);

export interface PopSeedOptions {
  readonly buildId?: string;
  readonly fs?: FileCampaignOptions["fs"];
}

/** Ordinary envelopes already committed before close #1: Entry u-5, Exit (cessation) u-4. */
export const ORDINARY_ENVELOPES = () => [
  entryEnvelope("env-a", unit("u-5", PLACE_L, PLACE_L), at(110)),
  exitEnvelope("env-b", "u-4", at(115)),
];

/**
 * The prerequisite canonical campaign (world, locus, released PC, active binding) plus the Population
 * proof's synthetic parties: the Criterion Owner's fact established for TP, the causal owner's registers,
 * two established ledgers (one engaged, one unrelated and dormant), their sparse Cohorts, the canonical
 * temporal basis T0 and the Population/consumer temporal objects. Nothing is resolved yet.
 */
export async function seededPopulationCampaign(
  dir: string,
  o: PopSeedOptions = {},
): Promise<PopSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "pop-seed",
      extension: POPULATION_FIXTURE_EXTENSION,
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
  await must(
    campaign.bindPlayerCharacter({
      ...publication(4),
      pc_id: FIXTURE_PC_ID,
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
      insertion: fixtureInsertionFact(),
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
  await must(
    store.commit(
      syntheticGroup(
        FIXTURE_CAMPAIGN,
        SYNTH_CAUSE_OWNER,
        3,
        registerKey(LEDGER_OTHER),
        register(LEDGER_OTHER, [exitEnvelope("env-o", "o-2", at(110), "CESSATION", LEDGER_OTHER)]),
        0,
      ),
    ),
  );
  const population = new PopulationAdapter(store);
  await must(population.establishLedger({ ...popPublication(1), ledger: ledgerInput() }));
  await must(
    population.establishLedger({
      ...popPublication(2),
      ledger: ledgerInput(LEDGER_OTHER, otherUnits()),
    }),
  );
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
  await must(
    population.instantiateCohort({
      ...popPublication(6),
      ref: burdenCohort(COHORT_OTHER, PLACE_L, LEDGER_OTHER, {
        overlap: { declaration: "DISJOINT_PARTITION", partition_id: PARTITION_BURDEN },
      }),
    }),
  );
  const coordinator = popCoordinator(store);
  await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: POP_T0 }));
  let n = 2;
  for (const object of [
    popClose1Object(),
    popClose2Object(),
    popOtherObject(),
    popConsumerObject(1),
  ]) {
    await must(coordinator.registerObject({ ...temporalPublication(n++), object }));
  }
  return { campaign, coordinator, population };
}

export async function reopenPopulation(dir: string, buildId = "pop-reopen"): Promise<PopSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, { buildId, extension: POPULATION_FIXTURE_EXTENSION }),
  );
  return {
    campaign,
    coordinator: popCoordinator(campaign.store),
    population: new PopulationAdapter(campaign.store),
  };
}

/** The pending-consequence envelope committed AFTER close #1: Exit (reversible) of u-2 at 130. */
export const PENDING_ENVELOPE = () =>
  exitEnvelope("env-c", "u-2", at(130), "REVERSIBLE_MEMBERSHIP_EXIT");

/** Commits (as the causal owner) the register carrying `extra` beside the ordinary envelopes. */
export async function commitRegister(
  store: CampaignStore,
  n: number,
  extra: ReturnType<typeof entryEnvelope>[],
  ledger = LEDGER_MAIN,
  ordinary = ledger === LEDGER_MAIN ? ORDINARY_ENVELOPES() : [],
): Promise<void> {
  const cur = store.getFact(registerKey(ledger));
  await must(
    store.commit(
      syntheticGroup(
        FIXTURE_CAMPAIGN,
        SYNTH_CAUSE_OWNER,
        n,
        registerKey(ledger),
        register(ledger, [...ordinary, ...extra]),
        cur?.version ?? 0,
      ),
    ),
  );
}

/** The Criterion Owner establishes its fact for `point` (create or advance). */
export async function commitCriterion(
  store: CampaignStore,
  n: number,
  point: ReturnType<typeof at>,
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
 * Close #1 resolved (ordinary reconciliation at TP), then the pending envelope is committed and the
 * Criterion Owner establishes its fact for the consumer's resolution point TC. The consumer's
 * transaction (which PCB-01 makes depend on a second reconciliation) is NOT yet run.
 */
export async function seededPendingConsumer(
  dir: string,
  o: PopSeedOptions & { readonly withPending?: boolean } = {},
): Promise<PopSeeded> {
  const s = await seededPopulationCampaign(dir, o);
  await must(s.coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
  if (o.withPending !== false) await commitRegister(s.campaign.store, 10, [PENDING_ENVELOPE()]);
  await commitCriterion(s.campaign.store, 11, POP_TC, ["u-1", "u-3", "u-5"]);
  return s;
}

export function popSummary(campaign: CanonicalCampaign, coordinator: TemporalCoordinator) {
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
    population: under(/^population\//),
    synthetic: under(/^synthetic-/),
    canonical: facts.filter((f) => /^(world|pc|role-registry)\//.test(f.key)),
    receipts: facts
      .map((f) => campaign.store.lookupReceipt(f.provenance.intent_id))
      .filter((r) => r !== null),
  };
}
