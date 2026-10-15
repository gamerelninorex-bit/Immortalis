/* eslint-disable @typescript-eslint/no-explicit-any -- a JSON-RPC reply of the test client */
// TEST SUPPORT for the HOST-REQUESTED, independently operator-CONFIRMED active-PC target-only OOC time advance (BLUE v5.2-A1 bounded brief
// 2026-10-15, "Host-Requested Active-PC Target-Only OOC Time"). The campaigns these tests use are built ONLY by the shipped owner paths (see
// ./original-pc-target.ts): `establish-locality`, `author-character`, `establish-character-locus` (each referee-qualified by a scripted host that
// is PLUMBING ONLY), then GIP's own adapter commits its institution, office, Scope Binding and `active` sunset-bearing Instrument (with its
// Temporal registration) and the Temporal owner establishes canonical time. Nothing here authors `expired`, a due flag, a stage, a custody or a
// verdict. The request side is exercised as a REAL stdio MCP process, spoken to as an MCP client would speak to it; the operator's answer is the
// shipped command run either in-process with a scripted console (which types the challenge the service printed) or as a REAL child process
// whose standard input is driven by a separate responder reading its output.
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  gipInstrumentKey,
  type CanonicalTime,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import { INSTRUMENT_A } from "@immortalis/testkit";
import {
  answerAdvanceRequest,
  type AnswerAdvanceRequestParams,
} from "../../packages/operator/src/advance-request-answer.ts";
import {
  advanceRequestDir,
  advanceRequestSecretPath,
} from "../../packages/operator/src/advance-request-exchange.ts";
import {
  runAdvanceRequestAnswerCli,
  runAdvanceRequestBindCli,
} from "../../packages/operator/src/advance-request-cli.ts";
import { runAdvanceRequestMcpCli } from "../../packages/operator/src/advance-request-mcp.ts";
import { SUNSET_LATER, SUNSET_MID, at } from "./gip-sunset.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "./locality.ts";
import { originalSunsetCampaign, type OriginalSunsetSetup } from "./original-pc-target.ts";
import { PC_ID } from "./original-pc.ts";
import { McpClient, recordingFs } from "./player-view.ts";
import { verbConsole } from "./observation.ts";
import type { ScriptedConsole } from "./original-pc.ts";

export { advanceRequestDir, advanceRequestSecretPath, PC_ID, SUNSET_LATER, SUNSET_MID, at };

export const REQUEST_BIN = "packages/operator/src/advance-request-bin.ts";
export const REQUEST_BIND_BIN = "packages/operator/src/advance-request-bind-bin.ts";
export const ANSWER_BIN = "packages/operator/src/advance-request-answer-bin.ts";
export const REQUEST_HOST = "chat-host-1";
export const REQUEST_TOOL = "request_active_pc_target_advance";

/** The one opaque refusal of the request tool, exactly as the transport frames it. */
export const REQUEST_REFUSAL =
  '{"ok":false,"error":{"code":"TARGET_ADVANCE_REQUEST_UNAVAILABLE","message":"no time-advance request can be recorded"}}';

/** The sunset the Instrument carries, a target short of it and a target beyond it (fixture time unit; canonical time starts at 100). */
export const SUNSET = SUNSET_MID;
export const BEFORE_SUNSET = at(120);
export const BEYOND_SUNSET = SUNSET_LATER;

/** The confirmation verb the shipped `pc-target-advance` command uses. */
export const TARGET_VERB = "pc-target-advance";
export const targetConsole = (confirm = true): ScriptedConsole => verbConsole(TARGET_VERB, confirm);

/**
 * A CLOSED original-PC campaign directory built only by owner paths: the character authored, bound and given World-State's qualified custody;
 * GIP's institution, office, Scope Binding and ONE `active` Instrument carrying `sunset` as its own declared term (registered with the Temporal
 * kernel, or as `setup`); canonical time established at 100. Nothing in it says `expired`.
 */
export async function sunsetDirs(
  sunset: CanonicalTime | null = SUNSET,
  setup: OriginalSunsetSetup = "registered",
): Promise<LocalityDirs> {
  const s = await originalSunsetCampaign(sunset, { setup });
  await s.campaign.close();
  return s.dirs;
}

/** What the owners hold, read through the ordinary re-open: the time, the Instrument's lifecycle and version, and the store's own state hash. */
export async function worldOf(dirs: LocalityDirs) {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    const instrument = c.store.getFact(gipInstrumentKey(INSTRUMENT_A))!;
    return {
      time: (c.store.getFact("temporal/state")!.value as any).canonical_time as CanonicalTime,
      lifecycle: (instrument.value as GovernanceInstrument).lifecycle_status,
      instrumentVersion: instrument.version,
      stateHash: c.store.head().state_sha256,
      revision: c.store.head().revision,
      keys: c.store
        .listFacts()
        .map((f) => f.key)
        .sort(),
      transactions: c.store
        .listFacts()
        .filter((f) => /^temporal\/transaction\//.test(f.key))
        .map((f) => f.key)
        .sort(),
    };
  } finally {
    await c.close();
  }
}

/** Runs the shipped request bind action in-process and returns what it printed. */
export async function bindRequestHost(
  dirs: LocalityDirs,
  hostId = REQUEST_HOST,
  campaignId = LOCALITY_CAMPAIGN,
) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runAdvanceRequestBindCli(
    [
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      campaignId,
      "--host-id",
      hostId,
      "--operator-dir",
      dirs.operatorDir,
    ],
    { out: (l) => out.push(l), error: (l) => err.push(l) },
  );
  return {
    code,
    out,
    err,
    secretFile: advanceRequestSecretPath({ stateDir: dirs.operatorDir, campaignId }, hostId),
  };
}

export const requestServerArgs = (
  dirs: LocalityDirs,
  secretFile: string,
  o: { hostId?: string; campaignId?: string } = {},
): string[] => [
  "--campaign",
  dirs.campaignDir,
  "--campaign-id",
  o.campaignId ?? LOCALITY_CAMPAIGN,
  "--operator-dir",
  dirs.operatorDir,
  "--host-id",
  o.hostId ?? REQUEST_HOST,
  "--secret-file",
  secretFile,
];

/** Every pending ask file (each ask is its own file, `request-<id>.json`), full paths, sorted. */
export const askFiles = (dirs: LocalityDirs, campaignId = LOCALITY_CAMPAIGN): string[] => {
  const dir = advanceRequestDir({ stateDir: dirs.operatorDir, campaignId });
  try {
    return readdirSync(dir)
      .filter((f) => /^request-[0-9a-f]{32}\.json$/.test(f))
      .sort()
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
};
export const hasAsk = (dirs: LocalityDirs): boolean => askFiles(dirs).length > 0;
/** The one pending ask's file (throws unless there is exactly one). */
export const askFile = (dirs: LocalityDirs): string => {
  const files = askFiles(dirs);
  if (files.length !== 1)
    throw new Error(`expected exactly one pending ask, found ${files.length}`);
  return files[0]!;
};

/** A started and handshaken REQUEST server (a real stdio process). */
export class RequestClient extends McpClient {
  constructor(args: string[]) {
    super(args, REQUEST_BIN);
  }
  ask(args: unknown = {}) {
    return this.call(args, REQUEST_TOOL);
  }
}

/** One request-tool call against a fresh server for the given arrangement. */
export async function askOnce(
  dirs: LocalityDirs,
  secretFile: string,
  over: { hostId?: string; campaignId?: string } = {},
  args: unknown = {},
) {
  const c = new RequestClient(requestServerArgs(dirs, secretFile, over));
  try {
    await c.handshake();
    const r = await c.ask(args);
    c.end();
    await c.exit();
    return r;
  } finally {
    c.end();
  }
}

/** Drives the shipped operator answer in-process with a console (the TARGET is the operator's own input) and optional fault seams. */
export async function answer(
  dirs: LocalityDirs,
  target: unknown = BEYOND_SUNSET,
  terminal: ScriptedConsole = targetConsole(),
  over: Partial<AnswerAdvanceRequestParams> = {},
) {
  const result = await answerAdvanceRequest({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    operatorDir: dirs.operatorDir,
    target,
    terminal,
    ...over,
  });
  return { result, terminal };
}

/**
 * Runs the shipped answer BINARY as a real child process whose console is its standard input/output. A SEPARATE responder (this function)
 * reads what the child prints, and only after the child has printed its fresh challenge writes the phrase (or a decline) back: the
 * confirmation reaches the child over a channel the requesting host never had.
 */
export async function answerAsProcess(
  dirs: LocalityDirs,
  o: { confirm?: boolean; target?: CanonicalTime; extra?: string[] } = {},
) {
  const target = o.target ?? BEYOND_SUNSET;
  const proc = spawn(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--experimental-strip-types",
      ANSWER_BIN,
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--operator-dir",
      dirs.operatorDir,
      "--target-unit",
      target.unit,
      "--target-value",
      String(target.value),
      ...(o.extra ?? []),
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let out = "";
  let err = "";
  const typed: string[] = [];
  const PHRASE = /To confirm, type exactly "([^"]+)"/;
  proc.stderr.on("data", (d) => (err += d));
  proc.stdout.on("data", (d) => {
    out += d;
    const m = PHRASE.exec(out);
    if (m && typed.length === 0) {
      const line = o.confirm === false ? "no" : m[1]!;
      typed.push(line);
      proc.stdin.write(`${line}\n`);
      proc.stdin.end();
    }
  });
  const code: number | null = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error("the answer process did not finish"));
    }, 90_000);
    proc.on("exit", (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  return { code, out, err, typed };
}

/**
 * Runs the shipped request tool-server entry point IN-PROCESS over the given input lines, with both file-system seams recording. Returns
 * every reply line (parsed) and the operations the server performed on the package and on the retained state.
 */
export async function serveRequestInProcess(
  dirs: LocalityDirs,
  secretFile: string,
  lines: readonly string[],
) {
  const campaign = recordingFs();
  const ledger = recordingFs();
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks: string[] = [];
  output.on("data", (d) => chunks.push(String(d)));
  const errors: string[] = [];
  const done = runAdvanceRequestMcpCli(requestServerArgs(dirs, secretFile), {
    input,
    output,
    error: (l) => errors.push(l),
    campaignFs: campaign.fs,
    ledgerFs: ledger.fs,
  });
  for (const l of lines) input.write(`${l}\n`);
  input.end();
  const code = await done;
  return {
    code,
    errors,
    replies: chunks
      .join("")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => JSON.parse(l)) as any[],
    campaignCalls: campaign.calls,
    ledgerCalls: ledger.calls,
  };
}

export { runAdvanceRequestAnswerCli };
