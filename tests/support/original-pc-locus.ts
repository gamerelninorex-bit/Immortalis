// TEST SUPPORT for the original active-PC qualified physical-locus custody (BLUE v5.1). The campaign these tests start from is built by
// the SHIPPED paths only: `establish-locality` commits the world and locus, `author-character` releases and binds the character (each
// qualified by the referee seam), and only then `establish-character-locus` is exercised. Nothing here supplies a physical verdict, a
// status or a confirmation: the scripted referee host is a policy the TEST wrote that reads the DELIVERED words (plumbing only; it
// proves nothing about whether an AI understood any sentence), and the scripted console only TYPES the phrase the service printed.
import { expect } from "vitest";
import { establishCharacterLocus, type EstablishCharacterLocusParams } from "@immortalis/operator";
import { LOCALITY_CAMPAIGN, type LocalityDirs } from "./locality.ts";
import {
  PC_ID,
  STANDARD,
  author,
  localityCampaign,
  plainPolicy,
  respondingConsole,
  startScriptedHost,
  type Policy,
  type Responder,
  type ScriptedConsole,
} from "./original-pc.ts";

export const CONFIRM = "establish-character-locus";
const PHRASE = /To confirm, type exactly "([^"]+)"/;

/** A console that confirms the physical locus with the phrase the service just printed (or declines with "no"). */
export function locusConsole(confirm = true): ScriptedConsole {
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
    ask: async (prompt) => {
      used++;
      if (prompt.trim() !== ">") throw new Error(`unexpected prompt ${JSON.stringify(prompt)}`);
      let line = "no";
      if (confirm)
        for (let i = said.length - 1; i >= 0; i--) {
          const m = PHRASE.exec(said[i]!);
          if (m && m[1]!.startsWith(`${CONFIRM} `)) {
            line = m[1]!;
            break;
          }
        }
      typed.push(line);
      return line;
    },
    close: () => undefined,
  };
}

/** A campaign whose character was authored, kept, released and bound through the shipped command (scripted referee: plumbing only). */
export async function boundCampaign(
  o: {
    mutate?: Parameters<typeof localityCampaign>[0];
    responder?: Responder;
    host?: Policy;
  } = {},
): Promise<LocalityDirs> {
  const dirs = await localityCampaign(o.mutate);
  const { result, terminal } = await author(
    dirs,
    respondingConsole(o.responder ?? STANDARD),
    {},
    o.host ?? plainPolicy,
  );
  expect(result.status, JSON.stringify(result.details) + terminal.said.join("\n")).toBe(
    "CHARACTER_BOUND",
  );
  return dirs;
}

/** Drives the shipped `establish-character-locus` in-process with a console, a scripted host (plumbing only) and optional fault seams. */
export async function establishLocus(
  dirs: LocalityDirs,
  terminal: ScriptedConsole,
  over: Partial<EstablishCharacterLocusParams> = {},
  host: Policy | null = plainPolicy,
) {
  const h = host ? startScriptedHost(dirs, host) : null;
  try {
    const result = await establishCharacterLocus({
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
      pcId: PC_ID,
      operatorDir: dirs.operatorDir,
      terminal,
      refereePolls: 400,
      refereePollMs: 10,
      ...over,
    });
    return { result, terminal, host: h };
  } finally {
    await h?.stop();
  }
}

export const locusArgs = (dirs: LocalityDirs, over: string[] = [], pcId = PC_ID): string[] => [
  "establish-character-locus",
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  LOCALITY_CAMPAIGN,
  "--operator-dir",
  dirs.operatorDir,
  "--player-character",
  pcId,
  ...over,
];
