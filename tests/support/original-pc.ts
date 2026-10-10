// TEST SUPPORT for the original player-character authorship and first native ACTIVATION slice (`author-character`,
// `character-status`). The world and locus these tests start from are committed by the SHIPPED `establish-locality` path (an
// independent owner, with its own receipts), never by a fixture owner. Nothing here supplies the player's acceptance, a status or the
// expected binding: the scripted consoles only TYPE, in answer to the prompts and challenges the service printed, and the keep and
// placement phrases they type are the ones the service just printed.
import { spawn } from "node:child_process";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  WORLD_ID,
  establish,
  freshDirs,
  setupDoc,
  writeSetup,
  type LocalityDirs,
} from "./locality.ts";
import { SHIPPED_BIN, type ProcessRun } from "./operator.ts";
import {
  authorCharacter,
  type AuthorCharacterParams,
  type OperatorTerminal,
} from "@immortalis/operator";

export { LOCALITY_CAMPAIGN as CAMPAIGN, LOCUS_ID, WORLD_ID };
export const PC_ID = "pc-maren";

/** What the player types for the standard journey. The first identity is deliberately wrong in one material detail. */
export const WORDS = {
  identityFirst: "Maren Voss, a human salt-raker of about thirty winters",
  identityFinal: "Maren Voss, a human salt-raker of about forty winters",
  contact: "A weathered woman in a salt-stained coat who speaks the local tongue",
  embodiment: "One ordinary human body",
  continuity: "I remain myself for as long as I live; when my body dies I am dead.",
  possession: "A salt-raker's knife and a coil of rope",
  presence: "I have always lived here: I am originally present at the salt pans of Ashfall Marsh.",
} as const;

export const KEEP = { phrase: "keep-character" } as const;
export const PLACE = { phrase: "place-character" } as const;
export type Line =
  string | null | typeof KEEP | typeof PLACE | ((said: readonly string[]) => string | null);

const PHRASE = /To confirm, type exactly "([^"]+)"/;
const lastPhrase = (said: readonly string[], verb: string): string => {
  for (let i = said.length - 1; i >= 0; i--) {
    const m = PHRASE.exec(said[i]!);
    if (m && m[1]!.startsWith(`${verb} `)) return m[1]!;
  }
  throw new Error(`the service printed no ${verb} challenge before asking`);
};
const resolve = (line: Line, said: readonly string[]): string | null =>
  line === null
    ? null
    : typeof line === "string"
      ? line
      : typeof line === "function"
        ? line(said)
        : lastPhrase(said, line.phrase);

export interface ScriptedConsole extends OperatorTerminal {
  readonly said: string[];
  /** every line the console typed, in order */
  readonly typed: (string | null)[];
  readonly asked: () => number;
}

/** A console that types the given lines, in order, one per `ask`. KEEP/PLACE type the latest challenge of that verb. */
export function scriptedConsole(...script: Line[]): ScriptedConsole {
  const said: string[] = [];
  const typed: (string | null)[] = [];
  let used = 0;
  return {
    said,
    typed,
    asked: () => used,
    say: (t) => {
      said.push(t);
    },
    ask: async () => {
      const line = script[used++];
      if (line === undefined) throw new Error("the service asked more than the test scripted");
      const out = resolve(line, said);
      typed.push(out);
      return out;
    },
    close: () => undefined,
  };
}

export interface Responder {
  /** lines typed at the `change>` prompt on the first Mirror decision (omit to keep the first display) */
  readonly revision?: readonly string[];
  readonly identity?: string;
  readonly presence?: string | null;
  /** type nothing but end of input at this prompt label */
  readonly eofAt?: string;
  /** answer a prompt label with a fixed line instead of the standard one */
  readonly override?: Readonly<Record<string, string | null>>;
  readonly skipPlace?: boolean;
}

/**
 * A console that answers by what is being asked, so a rerun after an interruption (which asks for less) is answered the same way as a
 * first run. It types only what a person would: free text for the authoring prompts, and the exact phrase just printed for a keep or a
 * placement. `identity`/`presence` choose the free text; `revision` is the one change made at the first Mirror.
 */
export function respondingConsole(r: Responder = {}): ScriptedConsole {
  const said: string[] = [];
  const typed: (string | null)[] = [];
  let used = 0;
  let contactDone = false;
  let revised = false;
  let editsSent = 0;
  const answer = (prompt: string): string | null => {
    const label = prompt.trim();
    if (r.eofAt === label) return null;
    if (r.override && label in r.override) return r.override[label]!;
    switch (label) {
      case "identity>":
        return r.identity ?? WORDS.identityFirst;
      case "contact>":
        if (contactDone) return "";
        contactDone = true;
        return WORDS.contact;
      case "embodiment>":
        return WORDS.embodiment;
      case "continuity>":
        return WORDS.continuity;
      case "exception>":
      case "open>":
      case "possession>":
        return "";
      case "presence>":
        return r.presence === undefined ? WORDS.presence : r.presence;
      case "change>": {
        const edits = r.revision ?? [];
        return editsSent < edits.length ? edits[editsSent++]! : "";
      }
      case ">": {
        let verb = "";
        for (let i = said.length - 1; i >= 0; i--) {
          const m = PHRASE.exec(said[i]!);
          if (m) {
            verb = m[1]!.split(" ")[0]!;
            break;
          }
        }
        if (verb === "keep-character") {
          if (r.revision && !revised) {
            revised = true;
            return "change";
          }
          return lastPhrase(said, "keep-character");
        }
        if (verb === "place-character")
          return r.skipPlace ? "no" : lastPhrase(said, "place-character");
        return "no";
      }
      default:
        throw new Error(`unexpected prompt ${JSON.stringify(prompt)}`);
    }
  };
  return {
    said,
    typed,
    asked: () => used,
    say: (t) => {
      said.push(t);
    },
    ask: async (prompt) => {
      used++;
      const out = answer(prompt);
      typed.push(out);
      return out;
    },
    close: () => undefined,
  };
}

/** The whole standard journey: first display has the wrong age, one revision cycle corrects it and adds a possession, then keep. */
export const STANDARD: Responder = {
  revision: [`set identity ${WORDS.identityFinal}`, `add possession ${WORDS.possession}`],
};

/** A fresh campaign whose world, locus and finite source were committed by the shipped `establish-locality` path. */
export async function localityCampaign(): Promise<LocalityDirs> {
  const dirs = freshDirs();
  const { result } = await establish(dirs, writeSetup(setupDoc()));
  if (result.status !== "LOCALITY_READY") throw new Error(`locality not ready: ${result.status}`);
  return dirs;
}

export const authorArgs = (dirs: LocalityDirs, over: string[] = [], pcId = PC_ID): string[] => [
  "author-character",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  LOCALITY_CAMPAIGN,
  "--operator-dir",
  dirs.operatorDir,
  "--world",
  WORLD_ID,
  "--locus",
  LOCUS_ID,
  "--player-character",
  pcId,
  ...over,
];

export const characterStatusArgs = (dirs: LocalityDirs, over: string[] = []): string[] => [
  "character-status",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  LOCALITY_CAMPAIGN,
  "--operator-dir",
  dirs.operatorDir,
  ...over,
];

/** Drives the shipped command in-process with a console and (optionally) a fault-injecting file system. */
export async function author(
  dirs: LocalityDirs,
  terminal: ScriptedConsole,
  over: Partial<AuthorCharacterParams> = {},
) {
  const result = await authorCharacter({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    worldId: WORLD_ID,
    locusId: LOCUS_ID,
    pcId: PC_ID,
    operatorDir: dirs.operatorDir,
    terminal,
    ...over,
  });
  return { result, terminal };
}

/**
 * The shipped binary as a real process, typed at through its standard input: whenever the process is waiting at a prompt (its output
 * ends with "> "), the next entry is typed. KEEP/PLACE type the phrase of that verb the process most recently printed.
 */
export function runAuthor(
  args: string[],
  script: Line[],
  o: { killAfter?: RegExp } = {},
): Promise<ProcessRun> {
  const child = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "--experimental-strip-types", SHIPPED_BIN, ...args],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  let answered = 0;
  let answeredAt = 0;
  let killed = false;
  child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
  child.stdout.on("data", (d: Buffer) => {
    stdout += d.toString();
    if (o.killAfter && !killed && o.killAfter.test(stdout)) {
      killed = true;
      child.kill("SIGKILL");
      return;
    }
    if (stdout.length > answeredAt && stdout.endsWith("> ")) {
      answeredAt = stdout.length;
      const next = script[answered++];
      const said = stdout.split("\n");
      const line = next === undefined ? null : resolve(next, said);
      if (line === null) child.stdin.end();
      else child.stdin.write(`${line}\n`);
    }
  });
  if (script.length === 0 && o.killAfter === undefined) child.stdin.end();
  return new Promise((res) => {
    child.on("close", (code, signal) => res({ code, signal, stdout, stderr }));
  });
}

/** The script of the standard journey for a process (one entry per prompt, in the order the service asks). */
export const standardScript = (): Line[] => [
  WORDS.identityFirst,
  WORDS.contact,
  "",
  WORDS.embodiment,
  WORDS.continuity,
  "",
  "",
  "",
  "change",
  `set identity ${WORDS.identityFinal}`,
  `add possession ${WORDS.possession}`,
  "",
  KEEP,
  WORDS.presence,
  PLACE,
];
