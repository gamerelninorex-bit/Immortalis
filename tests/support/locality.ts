/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw setup documents */
// TEST SUPPORT for the confirmed ORIGINAL locality & finite source admission. The setup document below is the operator's own authored
// content, written to a local file exactly as an operator would; nothing here supplies an owner result, a status or a confirmation
// (the scripted console only TYPES in answer to the challenge the service printed), and no fixture owner is registered: every
// campaign these tests read was created by the shipped code path with the ordinary canonical owner registry.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CanonicalCampaign } from "@immortalis/engine";
import { establishLocality, type EstablishLocalityParams } from "@immortalis/operator";
import { SHIPPED_BIN, runOperator, scriptedTerminal, type Reply, type Typed } from "./operator.ts";
import { tempDir } from "./tmp.ts";

export const LOCALITY_CAMPAIGN = "campaign-ashfall";
export const WORLD_ID = "world-ashfall";
export const LOCUS_ID = "locus-salt-pans";
export const SOURCE_KEY = "src-salt-pan-1";
export const SOURCE_AMOUNT = 120;
export const SOURCE_UNIT = "sack";
export const ACCESS = {
  aspect: "terrain",
  statement: "Reachable on foot across the dry crust at low tide.",
};

/** A complete, valid, operator-authored setup document (a fresh copy each call). */
export const setupDoc = (): any => ({
  format: "immortalis-original-locality-setup",
  format_version: 1,
  world: {
    world_id: WORLD_ID,
    premise: "A quiet salt-marsh hamlet where the tide decides the day.",
    reference_causal_basis: {
      mode: "ORIGINAL",
      established_canon:
        "Ashfall Marsh is an invented place; its tides and salt pans are as authored here.",
    },
    material_world_law_departures: [],
    insertion_supporting_constraints: [],
  },
  locus: {
    world_id: WORLD_ID,
    locus_id: LOCUS_ID,
    designation: "The salt pans of Ashfall Marsh",
    constraints: [],
  },
  source: {
    source_key: SOURCE_KEY,
    world_id: WORLD_ID,
    locus_id: LOCUS_ID,
    dimension: "surface-crust",
    material_class: "raw-salt",
    quantity: { amount: SOURCE_AMOUNT, unit: SOURCE_UNIT },
    access_facts: [{ ...ACCESS }],
    statement: "The first pan holds exactly 120 sacks of raw salt.",
  },
});

/** Writes a setup document as an operator would: a private regular file in a private directory. */
export function writeSetup(doc: unknown, mode = 0o600): string {
  const dir = tempDir("immortalis-locality-setup-");
  const file = join(dir, "setup.json");
  writeFileSync(file, typeof doc === "string" ? doc : JSON.stringify(doc, null, 2));
  chmodSync(file, mode);
  return file;
}

export interface LocalityDirs {
  /** does not exist yet: the shipped path creates it */
  readonly campaignDir: string;
  readonly operatorDir: string;
}

export function freshDirs(): LocalityDirs {
  const root = tempDir("immortalis-locality-");
  chmodSync(root, 0o700);
  return { campaignDir: join(root, "campaign"), operatorDir: join(root, "operator-state") };
}

export const establishArgs = (
  dirs: LocalityDirs,
  setupFile: string,
  over: string[] = [],
  campaignId = LOCALITY_CAMPAIGN,
): string[] => [
  "establish-locality",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  campaignId,
  "--operator-dir",
  dirs.operatorDir,
  "--setup",
  setupFile,
  ...over,
];

export const statusArgs = (dirs: LocalityDirs, over: string[] = []): string[] => [
  "locality-status",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  LOCALITY_CAMPAIGN,
  "--operator-dir",
  dirs.operatorDir,
  ...over,
];

/** The shipped binary — no owner extension, no fixture — as a real process, typed at through its standard input. */
export const runShipped = (
  args: string[],
  typed: Typed[] = [],
  o: { preTyped?: string; killAfter?: RegExp } = {},
) => runOperator(args, typed, { ...o, entry: SHIPPED_BIN });

/** Drives the shipped command in-process with a scripted console and (optionally) a fault-injecting file system. */
export function establish(
  dirs: LocalityDirs,
  setupFile: string,
  replies: Reply[] = ["confirm"],
  over: Partial<EstablishLocalityParams> = {},
) {
  const terminal = scriptedTerminal(...replies);
  return establishLocality({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    setupFile,
    operatorDir: dirs.operatorDir,
    terminal,
    ...over,
  }).then((result) => ({ result, terminal }));
}

/** Opens a finished campaign with the ordinary canonical registry only, as any other normal process would. */
export async function openOrdinary(dir: string): Promise<CanonicalCampaign> {
  const opened = await CanonicalCampaign.open(dir, { buildId: "locality-test-reader" });
  if (!opened.ok) throw new Error(`did not open: ${JSON.stringify(opened.error)}`);
  return opened.value;
}

export async function headOf(dir: string) {
  const c = await openOrdinary(dir);
  const head = c.store.head();
  await c.close();
  return { revision: head.revision, state: head.state_sha256, journal: head.journal_head_sha256 };
}

export const ensureDir = (dir: string): void => {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
};
