/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw corridor documents */
// TEST SUPPORT for the source-qualified local corridor. The document is the scenario author's own authored content, written to a local
// file exactly as an operator would; the base campaign is created by the SHIPPED `establish-locality` and `establish-additional-locality`
// paths (ordinary canonical registry, no fixture owner), and nothing here supplies an owner result, a status or a confirmation (the
// scripted console only TYPES in answer to the challenge the service printed).
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { establishCorridor, type EstablishCorridorParams } from "@immortalis/operator";
import { scriptedTerminal, type Reply } from "./operator.ts";
import { runShipped, type LocalityDirs } from "./locality.ts";
import {
  localityCampaign,
  NEW_LOCUS_ID,
  addLocality,
  localityDoc,
  writeLocality,
} from "./additional-locality.ts";
import { tempDir } from "./tmp.ts";

export {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  NEW_LOCUS_ID,
  WORLD_ID,
  bindPlayer,
  freshDirs,
  headOf,
  openOrdinary,
} from "./additional-locality.ts";

import { LOCALITY_CAMPAIGN, LOCUS_ID, WORLD_ID } from "./locality.ts";

export const CORRIDOR_STATEMENT_TEXT =
  "A plank walk runs from the salt pans over the dyke to the reed flats.";

/** A complete, valid, operator-authored corridor document: the first locus to the additional one (a fresh copy each call). */
export const corridorDoc = (): any => ({
  format: "immortalis-corridor",
  format_version: 1,
  corridor: {
    world_id: WORLD_ID,
    from_locus_id: LOCUS_ID,
    to_locus_id: NEW_LOCUS_ID,
    statement: CORRIDOR_STATEMENT_TEXT,
  },
});

/** Writes a corridor document as an operator would: a private regular file in a private directory. */
export function writeCorridor(doc: unknown, mode = 0o600): string {
  const dir = tempDir("immortalis-corridor-");
  const file = join(dir, "corridor.json");
  writeFileSync(file, typeof doc === "string" ? doc : JSON.stringify(doc, null, 2));
  chmodSync(file, mode);
  return file;
}

/** A campaign whose original locality AND one additional locus (without any corridor) the shipped paths confirmed and committed. */
export async function twoLociCampaign(): Promise<LocalityDirs> {
  const dirs = await localityCampaign();
  const { result } = await addLocality(dirs, writeLocality(localityDoc()));
  expect(result.status).toBe("ADDITIONAL_LOCALITY_READY");
  return dirs;
}

export const corridorArgs = (
  dirs: LocalityDirs,
  corridorFile: string,
  over: string[] = [],
  campaignId = LOCALITY_CAMPAIGN,
): string[] => [
  "establish-corridor",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  campaignId,
  "--operator-dir",
  dirs.operatorDir,
  "--corridor-file",
  corridorFile,
  ...over,
];

/** The shipped binary as a real process, typed at through its standard input. */
export const runCorridor = (
  dirs: LocalityDirs,
  corridorFile: string,
  typed: Parameters<typeof runShipped>[1] = [],
) => runShipped(corridorArgs(dirs, corridorFile), typed);

/** Drives the command in-process with a scripted console and (optionally) a fault-injecting file system. */
export function addCorridor(
  dirs: LocalityDirs,
  corridorFile: string,
  replies: Reply[] = ["confirm"],
  over: Partial<EstablishCorridorParams> = {},
) {
  const terminal = scriptedTerminal(...replies);
  return establishCorridor({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    corridorFile,
    operatorDir: dirs.operatorDir,
    terminal,
    ...over,
  }).then((result) => ({ result, terminal }));
}
