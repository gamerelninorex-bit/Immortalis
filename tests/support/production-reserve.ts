/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw Reserve documents */
// TEST SUPPORT for the initial Production Reserve admission. The Reserve document is the operator's own authored content, written to a
// local file exactly as an operator would; the base campaign is created by the SHIPPED `establish-locality` path (ordinary canonical
// registry, no fixture owner), and nothing here supplies an owner result, a status or a confirmation (the scripted console only TYPES in
// answer to the challenge the service printed).
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import {
  establishProductionReserve,
  type EstablishProductionReserveParams,
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

import { LOCALITY_CAMPAIGN, LOCUS_ID, WORLD_ID } from "./locality.ts";
import { localityCampaign } from "./additional-source.ts";

export const RESERVE_ID = "reserve-salt-store";
export const RESERVE_MATERIAL = "raw-salt";
export const RESERVE_UNIT = "sack";
export const RESERVE_AMOUNT = 15;
export const RESERVE_CONDITION = "dry-stacked";

/** A complete, valid, operator-authored Reserve document at the established original locus (a fresh copy each call). */
export const reserveDoc = (over: Record<string, unknown> = {}): any => ({
  reserve_id: RESERVE_ID,
  material_class: RESERVE_MATERIAL,
  quantity: { amount: RESERVE_AMOUNT, unit: RESERVE_UNIT },
  condition: RESERVE_CONDITION,
  world_id: WORLD_ID,
  locus_id: LOCUS_ID,
  ...over,
});

/** Writes a Reserve document as an operator would: a private regular file in a private directory. */
export function writeReserve(doc: unknown, mode = 0o600): string {
  const dir = tempDir("immortalis-production-reserve-");
  const file = join(dir, "reserve.json");
  writeFileSync(file, typeof doc === "string" ? doc : JSON.stringify(doc, null, 2));
  chmodSync(file, mode);
  return file;
}

/** A campaign whose ORIGINAL locality, and then one additional locality (locus and source), the shipped commands confirmed and committed. */
export async function additionalLocalityCampaign(): Promise<LocalityDirs> {
  const dirs = await localityCampaign();
  const { result } = await addLocality(dirs, writeLocality(localityDoc()));
  expect(result.status).toBe("ADDITIONAL_LOCALITY_READY");
  return dirs;
}

export const reserveArgs = (
  dirs: LocalityDirs,
  reserveFile: string,
  over: string[] = [],
  campaignId = LOCALITY_CAMPAIGN,
): string[] => [
  "establish-reserve",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  campaignId,
  "--operator-dir",
  dirs.operatorDir,
  "--reserve-file",
  reserveFile,
  ...over,
];

/** The shipped binary as a real process, typed at through its standard input. */
export const runReserve = (
  dirs: LocalityDirs,
  reserveFile: string,
  typed: Parameters<typeof runShipped>[1] = [],
) => runShipped(reserveArgs(dirs, reserveFile), typed);

/** Drives the command in-process with a scripted console and (optionally) a fault-injecting file system. */
export function addReserve(
  dirs: LocalityDirs,
  reserveFile: string,
  replies: Reply[] = ["confirm"],
  over: Partial<EstablishProductionReserveParams> = {},
) {
  const terminal = scriptedTerminal(...replies);
  return establishProductionReserve({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    reserveFile,
    operatorDir: dirs.operatorDir,
    terminal,
    ...over,
  }).then((result) => ({ result, terminal }));
}
