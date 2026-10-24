/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw locality documents */
// TEST SUPPORT for the additional pre-play locality with one finite source. The document is the operator's own authored content, written
// to a local file exactly as an operator would; the base campaign is created by the SHIPPED `establish-locality` path (ordinary canonical
// registry, no fixture owner), and nothing here supplies an owner result, a status or a confirmation (the scripted console only TYPES in
// answer to the challenge the service printed).
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  establishAdditionalLocality,
  type EstablishAdditionalLocalityParams,
} from "@immortalis/operator";
import { scriptedTerminal, type Reply } from "./operator.ts";
import { runShipped, type LocalityDirs } from "./locality.ts";
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
export { bindPlayer, localityCampaign, sourceDoc, writeSource } from "./additional-source.ts";

import { LOCALITY_CAMPAIGN, WORLD_ID } from "./locality.ts";

export const NEW_LOCUS_ID = "locus-reed-flats";
export const NEW_SOURCE_KEY = "src-blue-clay-1";
export const NEW_AMOUNT = 30;
export const NEW_UNIT = "basket";
export const NEW_ACCESS = {
  aspect: "terrain",
  statement:
    "The clay bank is reached over the plank walk and a ford that is only passable at slack water.",
};
export const NEW_DESIGNATION = "The reed flats beyond the dyke";
export const NEW_CONSTRAINT = {
  aspect: "ground",
  statement: "Soft silt under standing reed; nothing heavy stands on it.",
};

/** A complete, valid, operator-authored additional locality document (a fresh copy each call). */
export const localityDoc = (): any => ({
  format: "immortalis-additional-locality",
  format_version: 1,
  locus: {
    world_id: WORLD_ID,
    locus_id: NEW_LOCUS_ID,
    designation: NEW_DESIGNATION,
    constraints: [{ ...NEW_CONSTRAINT }],
  },
  source: {
    source_key: NEW_SOURCE_KEY,
    world_id: WORLD_ID,
    locus_id: NEW_LOCUS_ID,
    dimension: "bank-cut",
    material_class: "blue-clay",
    quantity: { amount: NEW_AMOUNT, unit: NEW_UNIT },
    access_facts: [{ ...NEW_ACCESS }],
    statement: "The clay bank holds exactly 30 baskets of blue clay.",
  },
});

/** Writes a locality document as an operator would: a private regular file in a private directory. */
export function writeLocality(doc: unknown, mode = 0o600): string {
  const dir = tempDir("immortalis-additional-locality-");
  const file = join(dir, "locality.json");
  writeFileSync(file, typeof doc === "string" ? doc : JSON.stringify(doc, null, 2));
  chmodSync(file, mode);
  return file;
}

export const localityArgs = (
  dirs: LocalityDirs,
  localityFile: string,
  over: string[] = [],
  campaignId = LOCALITY_CAMPAIGN,
): string[] => [
  "establish-additional-locality",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  campaignId,
  "--operator-dir",
  dirs.operatorDir,
  "--locality-file",
  localityFile,
  ...over,
];

/** The shipped binary as a real process, typed at through its standard input. */
export const runLocality = (
  dirs: LocalityDirs,
  localityFile: string,
  typed: Parameters<typeof runShipped>[1] = [],
) => runShipped(localityArgs(dirs, localityFile), typed);

/** Drives the command in-process with a scripted console and (optionally) a fault-injecting file system. */
export function addLocality(
  dirs: LocalityDirs,
  localityFile: string,
  replies: Reply[] = ["confirm"],
  over: Partial<EstablishAdditionalLocalityParams> = {},
) {
  const terminal = scriptedTerminal(...replies);
  return establishAdditionalLocality({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    localityFile,
    operatorDir: dirs.operatorDir,
    terminal,
    ...over,
  }).then((result) => ({ result, terminal }));
}
