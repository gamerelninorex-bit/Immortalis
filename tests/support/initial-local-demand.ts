/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw demand documents */
// TEST SUPPORT for the initial local demand and independently authored production start admission. The document is the operator's own
// authored content, written to a local file exactly as an operator would. The base campaign is built ONLY by the SHIPPED commands
// (`establish-locality`, `establish-population`, `establish-reserve`: ordinary canonical registry, no fixture owner) plus the Temporal
// owner's own canonical-time operation (a disposable scenario premise: the command under test neither creates nor chooses time). Nothing
// here supplies an owner result, a status or a confirmation (the scripted console only TYPES in answer to the challenge the service
// printed). The earned-boundary witness drives the EXISTING Temporal coordinator with the EXISTING Production, World-State and Economy
// stage providers; the registration of the operation's Temporal object is a disposable test step and is not shipped as a producer.
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import {
  economyRequestId,
  economyRequestKey,
  type CanonicalTime,
  type ResolutionRequest,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  EconomyAdapter,
  PopulationAdapter,
  ProductionAdapter,
  TemporalCoordinator,
  economyRealizationProvider,
  productionCompletionProvider,
  productionTemporalObject,
  StageProviderRegistry,
  worldFallbackAcceptanceProvider,
} from "@immortalis/engine";
import { advanceToRequest, at, temporalPublication } from "@immortalis/testkit";
import {
  establishInitialLocalDemand,
  type EstablishInitialLocalDemandParams,
} from "@immortalis/operator";
import { scriptedTerminal, type Reply } from "./operator.ts";
import { runShipped, type LocalityDirs } from "./locality.ts";
import {
  addPopulation,
  populationDoc,
  timedCampaign,
  writePopulation,
} from "./initial-population.ts";
import { addReserve, reserveDoc, writeReserve } from "./production-reserve.ts";
import { tempDir } from "./tmp.ts";

export {
  COHORT_ID,
  LEDGER_ID,
  T_CLOSE,
  T_OPEN,
  engageClose,
  bindPlayer,
  freshDirs,
  headOf,
  openOrdinary,
  openWitness as openPopulationWitness,
  populationDoc,
  writePopulation,
} from "./initial-population.ts";
export { LOCALITY_CAMPAIGN, LOCUS_ID, WORLD_ID } from "./initial-population.ts";
export {
  RESERVE_AMOUNT,
  RESERVE_ID,
  RESERVE_MATERIAL,
  RESERVE_UNIT,
  reserveDoc,
  writeReserve,
} from "./production-reserve.ts";

import {
  COHORT_ID,
  LEDGER_ID,
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  WORLD_ID,
  openOrdinary,
} from "./initial-population.ts";
import { RESERVE_ID, RESERVE_UNIT } from "./production-reserve.ts";

export const DEMAND_ID = "demand-ashfall-1";
export const OUTPUT_CLASS = "cured-salt";
export const OUTPUT_UNIT = "sack";
export const OUTPUT_CONDITION = "dry-cured";
export const INPUT_AMOUNT = 6;
/** The declared completion boundary of the stipulated operation: strictly after the campaign's canonical time T_OPEN (100). */
export const T_DUE: CanonicalTime = at(160);
export const OPERATION_ID = economyRequestId(DEMAND_ID);
export const REQUEST_KEY = economyRequestKey(OPERATION_ID);

export const unitCarrier = (unitId = "unit-01") => ({
  kind: "POPULATION_UNIT",
  ledger_id: LEDGER_ID,
  unit_id: unitId,
});
export const cohortCarrier = (cohortId = COHORT_ID) => ({
  kind: "POPULATION_COHORT",
  ledger_id: LEDGER_ID,
  cohort_id: cohortId,
});

/** A complete, valid, operator-authored demand document: the demand and, as its own section, the separately authored production start. */
export const demandDoc = (): any => ({
  format: "immortalis-initial-local-demand",
  format_version: 1,
  demand: {
    demand_envelope_id: DEMAND_ID,
    carrier: unitCarrier(),
    demand_entry: { output_class: OUTPUT_CLASS, quantity: { amount: 1, unit: OUTPUT_UNIT } },
  },
  production: {
    request_key: REQUEST_KEY,
    reserve_id: RESERVE_ID,
    transformation: {
      input_quantity: { amount: INPUT_AMOUNT, unit: RESERVE_UNIT },
      output_quantity: { amount: 1, unit: OUTPUT_UNIT },
      output_class: OUTPUT_CLASS,
      output_condition: OUTPUT_CONDITION,
    },
    completion_at: { ...T_DUE },
  },
});

/** Writes a demand document as an operator would: a private regular file in a private directory. */
export function writeDemand(doc: unknown, mode = 0o600): string {
  const dir = tempDir("immortalis-initial-local-demand-");
  const file = join(dir, "demand.json");
  writeFileSync(file, typeof doc === "string" ? doc : JSON.stringify(doc, null, 2));
  chmodSync(file, mode);
  return file;
}

/**
 * A campaign built only by the shipped commands: the confirmed ORIGINAL locality, the canonical time T_OPEN (the Temporal owner's own
 * operation), the confirmed initial Population (ledger and RESIDENCE Cohort at the locus) and one confirmed fresh Production Reserve at
 * that same locus. No demand has been issued and no process exists.
 */
export async function scenarioCampaign(
  over: { reserve?: Record<string, unknown> } = {},
): Promise<LocalityDirs> {
  const dirs = await timedCampaign();
  const population = await addPopulation(dirs, writePopulation(populationDoc()));
  expect(population.result.status).toBe("POPULATION_READY");
  const reserve = await addReserve(dirs, writeReserve(reserveDoc(over.reserve ?? {})));
  expect(reserve.result.status).toBe("RESERVE_READY");
  return dirs;
}

export const demandArgs = (
  dirs: LocalityDirs,
  demandFile: string,
  over: string[] = [],
  campaignId = LOCALITY_CAMPAIGN,
): string[] => [
  "establish-local-demand",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  campaignId,
  "--operator-dir",
  dirs.operatorDir,
  "--demand-file",
  demandFile,
  ...over,
];

/** The shipped binary as a real process, typed at through its standard input. */
export const runDemand = (
  dirs: LocalityDirs,
  demandFile: string,
  typed: Parameters<typeof runShipped>[1] = [],
) => runShipped(demandArgs(dirs, demandFile), typed);

/** Drives the command in-process with a scripted console and (optionally) a fault-injecting file system. */
export function addDemand(
  dirs: LocalityDirs,
  demandFile: string,
  replies: Reply[] = ["confirm"],
  over: Partial<EstablishInitialLocalDemandParams> = {},
) {
  const terminal = scriptedTerminal(...replies);
  return establishInitialLocalDemand({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    demandFile,
    operatorDir: dirs.operatorDir,
    terminal,
    ...over,
  }).then((result) => ({ result, terminal }));
}

/** What the store holds of the process, by identity (and whether the package still verifies). */
export async function held(dir: string) {
  const c = await openOrdinary(dir);
  try {
    const economy = new EconomyAdapter(c.store);
    const production = new ProductionAdapter(c.store);
    return {
      demand: economy.demand(DEMAND_ID) !== undefined,
      request: economy.request(DEMAND_ID) !== undefined,
      operation: production.operation(OPERATION_ID) !== undefined,
      claim: production.claim(`claim:${OPERATION_ID}`) !== undefined,
      violations: c.verify(),
    };
  } finally {
    await c.close();
  }
}

// -- the disposable integration witness: the EXISTING owner chain, engaged at a lawful separate Temporal basis ---------------------------

export interface Witness {
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
  readonly economy: EconomyAdapter;
  readonly production: ProductionAdapter;
  readonly population: PopulationAdapter;
}

export const witnessProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    productionCompletionProvider,
    worldFallbackAcceptanceProvider,
    economyRealizationProvider,
  ]);

/** Opens the finished campaign with the ordinary registry and the genuine Production, World-State and Economy stage providers. */
export async function openWitness(
  dir: string,
  providers: StageProviderRegistry = witnessProviders(),
): Promise<Witness> {
  const campaign = await openOrdinary(dir);
  return {
    campaign,
    coordinator: new TemporalCoordinator(campaign.store, providers),
    economy: new EconomyAdapter(campaign.store),
    production: new ProductionAdapter(campaign.store),
    population: new PopulationAdapter(campaign.store),
  };
}

/** The Temporal owner registers the committed operation's object (a disposable scenario step, never the command under test). */
export async function registerOperation(w: Witness, n = 2) {
  const op = w.production.operation(OPERATION_ID)!.value;
  const r = await w.coordinator.registerObject({
    ...temporalPublication(n),
    object: productionTemporalObject(op, { worldId: WORLD_ID, locusId: LOCUS_ID }),
  });
  expect(r.ok, JSON.stringify(r)).toBe(true);
}

export const advanceRequest = (id: string, target: CanonicalTime = T_DUE): ResolutionRequest =>
  advanceToRequest(id, target);

/** Every fact the process touches, plus the physical and Population state it must leave alone, for before/after comparison. */
export function processSummary(w: Witness) {
  const facts = w.campaign.store.listFacts();
  const under = (re: RegExp) => facts.filter((f) => re.test(f.key));
  return {
    head: w.campaign.store.head(),
    economy: under(/^economy\//),
    production: under(/^production\//),
    population: under(/^population\//),
    entities: under(/^world\/[^/]+\/entity\//),
    objects: under(/^temporal\/object\//),
    state: w.coordinator.state()?.fact ?? null,
    index: w.coordinator.boundaryIndex(),
  };
}
