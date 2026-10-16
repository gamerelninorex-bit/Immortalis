/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw setup documents */
// TEST SUPPORT for the confirmed ORIGINAL locality & finite source admission. The setup document below is the operator's own authored
// content, written to a local file exactly as an operator would; nothing here supplies an owner result, a status or a confirmation
// (the scripted console only TYPES in answer to the challenge the service printed), and no fixture owner is registered: every
// campaign these tests read was created by the shipped code path with the ordinary canonical owner registry.
import { PC_INDEPENDENT_EVIDENCE_EXTENSION } from "@immortalis/testkit";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CanonicalCampaign, nodeFs, type FsOps } from "@immortalis/engine";
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
  const opened = await CanonicalCampaign.open(dir, {
    buildId: "locality-test-reader",
    extension: PC_INDEPENDENT_EVIDENCE_EXTENSION,
  });
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

// -- a deterministically interleaved pair of writers on the retained-state file system seam (BLUE F60-R2) ---------------------------

export interface PinRace {
  /** the ordered events of both writers: reads that observed the pin absent, arrivals at the first pin mutation, and each pin mutation */
  readonly log: string[];
  /** the retained-state `FsOps` for one writer */
  fs(who: string): FsOps;
}

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

/**
 * Two writers share one retained-state directory. Each writer's FIRST mutation of the pin file is held until BOTH writers have arrived
 * at their own first mutation — so each has already passed every read it makes of the pin, all of which observed it absent — and only
 * then is the writer named first in `order` released; the second is released only after the first's mutation has completed. No writer
 * is merely serialised: both are past an observed-absent read before either commits a pin, and the interleaving is forced, not hoped
 * for. A wait that never resolves fails the test instead of hanging it.
 */
export function pinRace(order: readonly [string, string] = ["A", "B"]): PinRace {
  const log: string[] = [];
  const arrived = new Set<string>();
  const passed = new Set<string>();
  const bothArrived = deferred();
  const firstDone = deferred();
  const within = <T>(p: Promise<T>, what: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`pin race did not progress: ${what}`)), 20_000),
      ),
    ]);
  const isPin = (path: string) => /locality-setup-[0-9a-f]+\.json$/.test(path);

  return {
    log,
    fs(who: string): FsOps {
      const inner = nodeFs;
      const mutating =
        <A extends unknown[]>(name: string, op: (path: string, ...a: A) => Promise<void>) =>
        async (path: string, ...a: A): Promise<void> => {
          if (!isPin(path)) return op(path, ...a);
          if (!passed.has(who)) {
            arrived.add(who);
            log.push(`${who} arrives at ${name}`);
            if (arrived.size === 2) bothArrived.resolve();
            await within(bothArrived.promise, `${who} waiting for the other writer`);
            if (who !== order[0])
              await within(firstDone.promise, `${who} waiting for the first writer`);
            passed.add(who);
          }
          log.push(`${who} ${name} start`);
          try {
            await op(path, ...a);
          } finally {
            log.push(`${who} ${name} end`);
            if (who === order[0]) firstDone.resolve();
          }
        };
      return {
        ...inner,
        fileSize: async (path) => {
          const size = await inner.fileSize(path);
          if (isPin(path) && size === null) log.push(`${who} observed the pin absent`);
          return size;
        },
        createExclusive: mutating("createExclusive", (path, data: string) =>
          inner.createExclusive(path, data),
        ),
        writeFileDurable: mutating("writeFileDurable", (path, data: string) =>
          inner.writeFileDurable(path, data),
        ),
      };
    },
  };
}
