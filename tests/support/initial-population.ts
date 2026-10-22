/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw population documents */
// TEST SUPPORT for the initial local Population and residency Cohort admission. The document is the operator's own authored content,
// written to a local file exactly as an operator would; the base campaign is created by the SHIPPED `establish-locality` path (ordinary
// canonical registry, no fixture owner), the Temporal owner's canonical time is established by the Temporal owner's own operation
// (a disposable scenario premise: the command under test neither creates nor chooses time), and nothing here supplies an owner result,
// a status or a confirmation (the scripted console only TYPES in answer to the challenge the service printed).
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import {
  POPULATION_CLOSE_BASIS,
  populationLedgerKey,
  type CanonicalTime,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PopulationAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  populationBarrierEvaluator,
  populationReconcileDeclaration,
  populationStageProvider,
  populationTemporalObject,
} from "@immortalis/engine";
import { advanceToRequest, at, temporalPublication } from "@immortalis/testkit";
import {
  establishInitialPopulation,
  type EstablishInitialPopulationParams,
} from "@immortalis/operator";
import { scriptedTerminal, type Reply } from "./operator.ts";
import { runShipped, type LocalityDirs } from "./locality.ts";
import { addLocality, localityDoc, writeLocality } from "./additional-locality.ts";
import { tempDir } from "./tmp.ts";

export {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  SOURCE_KEY,
  WORLD_ID,
  freshDirs,
  headOf,
  openOrdinary,
} from "./locality.ts";
export { bindPlayer, localityCampaign } from "./additional-source.ts";
export { NEW_LOCUS_ID, NEW_SOURCE_KEY } from "./additional-locality.ts";

import { LOCALITY_CAMPAIGN, LOCUS_ID, WORLD_ID, openOrdinary } from "./locality.ts";
import { localityCampaign } from "./additional-source.ts";

export const LEDGER_ID = "ledger-ashfall-hamlet";
export const COHORT_ID = "cohort-ashfall-residents";
export const UNIT_CLASS = "inhabitant";
/** A place the sources fix no model for: a free label, here the hamlet's other places */
export const PLACE_QUAY = "place-quay";
export const PLACE_FIELDS = "place-fields";

/** The canonical time the disposable scenario's Temporal owner establishes, and the later point at which Population's close resolves. */
export const T_OPEN: CanonicalTime = at(100);
export const T_CLOSE: CanonicalTime = at(160);

/**
 * The authored opening units: three resident at the locus (one of them present on the quay, one with a recorded burden allocation to the
 * fields), one resident on the quay but present at the locus, one resident and present in the fields. Residence, presence and burden
 * allocation are deliberately distinct facts.
 */
export const unitDocs = (): any[] => [
  { unit_id: "unit-01", residence: LOCUS_ID, presence: LOCUS_ID, burden_allocation: null },
  { unit_id: "unit-02", residence: LOCUS_ID, presence: PLACE_QUAY, burden_allocation: null },
  {
    unit_id: "unit-03",
    residence: LOCUS_ID,
    presence: PLACE_QUAY,
    burden_allocation: PLACE_FIELDS,
  },
  { unit_id: "unit-04", residence: PLACE_QUAY, presence: LOCUS_ID, burden_allocation: null },
  { unit_id: "unit-05", residence: PLACE_FIELDS, presence: PLACE_FIELDS, burden_allocation: null },
];
/** The units whose RESIDENCE is the locus: what Population's own close must derive for the Cohort, never what the test sets. */
export const RESIDENT_IDS = ["unit-01", "unit-02", "unit-03"];

/** The Cohort reference exactly as the brief's bounded family is written, every field explicit (nothing defaulted). */
export const cohortDoc = (over: Record<string, unknown> = {}): any => ({
  cohort_id: COHORT_ID,
  unit_class: UNIT_CLASS,
  count_custodian: "population",
  criterion: { owner: "population", ref: null },
  indexed_fact: "RESIDENCE",
  scope: { ledger_id: LEDGER_ID, place: LOCUS_ID },
  membership_basis: "INDEXED_FACT_AT_PLACE",
  form: "OVERLAPPING_VIEW",
  cardinality_semantics: "EXACT",
  overlap: { declaration: "OVERLAPPING" },
  temporal_read: {
    mode: "AS-OF-DECLARED-CLOSE",
    close_basis: { ...POPULATION_CLOSE_BASIS, producer: { ...POPULATION_CLOSE_BASIS.producer } },
  },
  retention: "CURRENT-ONLY",
  invalidators: [{ fact_key: populationLedgerKey(LEDGER_ID) }],
  retirement: { predicate: "ZERO_LIVE_DEPENDENCIES_AND_NO_REMAINING_NEED" },
  ...over,
});

/** A complete, valid, operator-authored population document at the established original locus (a fresh copy each call). */
export const populationDoc = (): any => ({
  format: "immortalis-initial-population",
  format_version: 1,
  ledger: {
    ledger_id: LEDGER_ID,
    unit_class: UNIT_CLASS,
    world_id: WORLD_ID,
    locus_id: LOCUS_ID,
    units: unitDocs(),
    point: { ...T_OPEN },
  },
  cohort: cohortDoc(),
});

/** Writes a population document as an operator would: a private regular file in a private directory. */
export function writePopulation(doc: unknown, mode = 0o600): string {
  const dir = tempDir("immortalis-initial-population-");
  const file = join(dir, "population.json");
  writeFileSync(file, typeof doc === "string" ? doc : JSON.stringify(doc, null, 2));
  chmodSync(file, mode);
  return file;
}

/** The Temporal owner establishes the campaign's canonical basis (a disposable scenario premise, never the command under test). */
export async function establishTime(
  dirs: LocalityDirs,
  time: CanonicalTime = T_OPEN,
): Promise<void> {
  const campaign = await openOrdinary(dirs.campaignDir);
  try {
    const r = await new TemporalCoordinator(
      campaign.store,
      new StageProviderRegistry(),
    ).establishCanonicalTime({ ...temporalPublication(1), time });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  } finally {
    await campaign.close();
  }
}

/** A campaign whose ORIGINAL locality the shipped `establish-locality` committed and whose Temporal owner holds canonical time T_OPEN. */
export async function timedCampaign(): Promise<LocalityDirs> {
  const dirs = await localityCampaign();
  await establishTime(dirs);
  return dirs;
}

/** The same, then one ADDITIONAL locality (locus and source) the shipped command confirmed. */
export async function timedAdditionalCampaign(): Promise<LocalityDirs> {
  const dirs = await timedCampaign();
  const { result } = await addLocality(dirs, writeLocality(localityDoc()));
  expect(result.status).toBe("ADDITIONAL_LOCALITY_READY");
  return dirs;
}

export const populationArgs = (
  dirs: LocalityDirs,
  populationFile: string,
  over: string[] = [],
  campaignId = LOCALITY_CAMPAIGN,
): string[] => [
  "establish-population",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  campaignId,
  "--operator-dir",
  dirs.operatorDir,
  "--population-file",
  populationFile,
  ...over,
];

/** The shipped binary as a real process, typed at through its standard input. */
export const runPopulation = (
  dirs: LocalityDirs,
  populationFile: string,
  typed: Parameters<typeof runShipped>[1] = [],
) => runShipped(populationArgs(dirs, populationFile), typed);

/** Drives the command in-process with a scripted console and (optionally) a fault-injecting file system. */
export function addPopulation(
  dirs: LocalityDirs,
  populationFile: string,
  replies: Reply[] = ["confirm"],
  over: Partial<EstablishInitialPopulationParams> = {},
) {
  const terminal = scriptedTerminal(...replies);
  return establishInitialPopulation({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    populationFile,
    operatorDir: dirs.operatorDir,
    terminal,
    ...over,
  }).then((result) => ({ result, terminal }));
}

/** What the store holds of the two new facts. */
export async function held(dir: string) {
  const c = await openOrdinary(dir);
  try {
    const population = new PopulationAdapter(c.store);
    return {
      ledger: population.ledger(LEDGER_ID) !== undefined,
      cohort: population.cohort(LEDGER_ID, COHORT_ID) !== undefined,
      violations: c.verify(),
    };
  } finally {
    await c.close();
  }
}

// -- the disposable integration witness: Population's OWN existing close, engaged at a lawful separate Temporal basis -----------------

export interface Witness {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly population: PopulationAdapter;
}

export const OBJECT_POP_CLOSE = "obj-initial-population-close";
export const BOUNDARY_POP_CLOSE = "boundary-initial-population-close";

/** Population's reconciliation as a Temporal object: Population-owned criterion only, no criterion owner and no causal register is read. */
export const closeObject = (ledgerId = LEDGER_ID, cohortIds: string[] = [COHORT_ID]) =>
  populationTemporalObject({
    objectId: OBJECT_POP_CLOSE,
    ledgerId,
    lastResolvedBasis: T_OPEN,
    nextBoundary: { boundary_id: BOUNDARY_POP_CLOSE, at: T_CLOSE },
    declaration: populationReconcileDeclaration({
      ledgerId,
      resultId: "initial-population-close-1",
      cohortIds,
      criteria: [],
      consequenceSources: [],
    }),
  });

/** Opens the finished campaign with the ordinary registry and the genuine Population stage provider (the existing owner operation). */
export async function openWitness(dir: string): Promise<Witness> {
  const campaign = await openOrdinary(dir);
  const coordinator = new TemporalCoordinator(
    campaign.store,
    new StageProviderRegistry([populationStageProvider]),
    populationBarrierEvaluator,
  );
  return { campaign, coordinator, population: new PopulationAdapter(campaign.store) };
}

/** Registers Population's close and resolves it, through the Temporal coordinator, at T_CLOSE. */
export async function engageClose(w: Witness, object = closeObject(), target = T_CLOSE) {
  const registered = await w.coordinator.registerObject({
    ...temporalPublication(2),
    object,
  });
  expect(registered.ok, JSON.stringify(registered)).toBe(true);
  return w.coordinator.advance(advanceToRequest("tx-initial-population-close", target));
}
