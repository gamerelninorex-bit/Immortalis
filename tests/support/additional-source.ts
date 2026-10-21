/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw source documents */
// TEST SUPPORT for the additional pre-play finite Source Condition admission. The source document is the operator's own authored
// content, written to a local file exactly as an operator would; the base campaign is created by the SHIPPED `establish-locality`
// path (ordinary canonical registry, no fixture owner), and nothing here supplies an owner result, a status or a confirmation (the
// scripted console only TYPES in answer to the challenge the service printed).
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { fixtureContract, fixtureInsertionFact, publication } from "@immortalis/testkit";
import {
  establishAdditionalSource,
  type EstablishAdditionalSourceParams,
} from "@immortalis/operator";
import { scriptedTerminal, type Reply } from "./operator.ts";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  WORLD_ID,
  establish,
  freshDirs,
  openOrdinary,
  runShipped,
  setupDoc,
  writeSetup,
  type LocalityDirs,
} from "./locality.ts";
import { tempDir } from "./tmp.ts";

export {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  WORLD_ID,
  freshDirs,
  headOf,
  openOrdinary,
} from "./locality.ts";

export const SECOND_KEY = "src-salt-pan-2";
export const SECOND_AMOUNT = 45;
export const SECOND_UNIT = "sack";
export const SECOND_ACCESS = {
  aspect: "terrain",
  statement: "The second pan lies behind the dyke and is reached over the plank walk.",
};

/** A complete, valid, operator-authored ADDITIONAL source document at the established locality (a fresh copy each call). */
export const sourceDoc = (): any => ({
  source_key: SECOND_KEY,
  world_id: WORLD_ID,
  locus_id: LOCUS_ID,
  dimension: "surface-crust",
  material_class: "grey-salt",
  quantity: { amount: SECOND_AMOUNT, unit: SECOND_UNIT },
  access_facts: [{ ...SECOND_ACCESS }],
  statement: "The second pan holds exactly 45 sacks of grey salt.",
});

/** Writes a source document as an operator would: a private regular file in a private directory. */
export function writeSource(doc: unknown, mode = 0o600): string {
  const dir = tempDir("immortalis-additional-source-");
  const file = join(dir, "source.json");
  writeFileSync(file, typeof doc === "string" ? doc : JSON.stringify(doc, null, 2));
  chmodSync(file, mode);
  return file;
}

/** A campaign whose original locality (world, locus, first source) the shipped `establish-locality` confirmed and committed. */
export async function localityCampaign(): Promise<LocalityDirs> {
  const dirs = freshDirs();
  const { result } = await establish(dirs, writeSetup(setupDoc()));
  expect(result.status).toBe("LOCALITY_READY");
  return dirs;
}

export const addArgs = (
  dirs: LocalityDirs,
  sourceFile: string,
  over: string[] = [],
  campaignId = LOCALITY_CAMPAIGN,
): string[] => [
  "establish-additional-source",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  campaignId,
  "--operator-dir",
  dirs.operatorDir,
  "--source-file",
  sourceFile,
  ...over,
];

/** The shipped binary as a real process, typed at through its standard input. */
export const runAdd = (
  dirs: LocalityDirs,
  sourceFile: string,
  typed: Parameters<typeof runShipped>[1] = [],
) => runShipped(addArgs(dirs, sourceFile), typed);

/** Drives the command in-process with a scripted console and (optionally) a fault-injecting file system. */
export function addSource(
  dirs: LocalityDirs,
  sourceFile: string,
  replies: Reply[] = ["confirm"],
  over: Partial<EstablishAdditionalSourceParams> = {},
) {
  const terminal = scriptedTerminal(...replies);
  return establishAdditionalSource({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    sourceFile,
    operatorDir: dirs.operatorDir,
    terminal,
    ...over,
  }).then((result) => ({ result, terminal }));
}

/** Releases and binds a player character at the established locality through the genuine owner operations (the campaign is then past pre-play). */
export async function bindPlayer(dirs: LocalityDirs): Promise<void> {
  const campaign = await openOrdinary(dirs.campaignDir);
  try {
    const released = await campaign.releasePlayerCharacter({
      ...publication(901),
      contract: fixtureContract({ pc_id: "pc-ashfall-1" }),
    });
    if (!released.ok) throw new Error(`release: ${released.error.code}`);
    const bound = await campaign.bindPlayerCharacter({
      ...publication(902),
      pc_id: "pc-ashfall-1",
      world_id: WORLD_ID,
      locus_id: LOCUS_ID,
      insertion: fixtureInsertionFact(),
    });
    if (!bound.ok) throw new Error(`bind: ${bound.error.code}`);
  } finally {
    await campaign.close();
  }
}
