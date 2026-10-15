/* eslint-disable @typescript-eslint/no-explicit-any -- a JSON-RPC reply of the test client */
// TEST SUPPORT for the HOST-REQUESTED, independently operator-CONFIRMED active-PC observation (BLUE v5.2-A1 bounded brief 2026-10-15). The
// campaigns these tests use are built ONLY by the shipped paths (see ./observation.ts). The scripted referee host there is PLUMBING ONLY (it
// reads the delivered words by rule and certifies nothing about any AI). The request side is exercised as a REAL stdio MCP process, spoken to
// as an MCP client would speak to it; the operator's answer is the shipped command run either in-process with a scripted console (which types
// the challenge the service printed) or as a REAL child process whose standard input is driven by a separate responder reading its output.
// The expected Glance is whatever the existing direct gateway returns over the very same canon.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import {
  answerObservationRequest,
  type AnswerObservationRequestParams,
} from "../../packages/operator/src/observe-request-answer.ts";
import {
  observeRequestDir,
  observeRequestSecretPath,
} from "../../packages/operator/src/observe-request-exchange.ts";
import {
  runObserveRequestAnswerCli,
  runObserveRequestBindCli,
} from "../../packages/operator/src/observe-request-cli.ts";
import { runObserveRequestMcpCli } from "../../packages/operator/src/observe-request-mcp.ts";
import { LOCALITY_CAMPAIGN, type LocalityDirs } from "./locality.ts";
import { PC_ID, observationPolicy, verbConsole } from "./observation.ts";
import { startScriptedHost, type Policy, type ScriptedConsole } from "./original-pc.ts";
import { McpClient, recordingFs } from "./player-view.ts";

export { observeRequestDir, observeRequestSecretPath, PC_ID };

export const REQUEST_BIN = "packages/operator/src/observe-request-bin.ts";
export const REQUEST_BIND_BIN = "packages/operator/src/observe-request-bind-bin.ts";
export const ANSWER_BIN = "packages/operator/src/observe-request-answer-bin.ts";
export const REQUEST_HOST = "chat-host-1";
export const REQUEST_TOOL = "request_active_pc_observation";

/** The one opaque refusal of the request tool, exactly as the transport frames it. */
export const REQUEST_REFUSAL =
  '{"ok":false,"error":{"code":"OBSERVATION_REQUEST_UNAVAILABLE","message":"no observation request can be recorded"}}';

/** Runs the shipped request bind action in-process and returns what it printed. */
export async function bindRequestHost(
  dirs: LocalityDirs,
  hostId = REQUEST_HOST,
  campaignId = LOCALITY_CAMPAIGN,
) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runObserveRequestBindCli(
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
    secretFile: observeRequestSecretPath({ stateDir: dirs.operatorDir, campaignId }, hostId),
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

/** The pending ask's file. */
export const requestFile = (dirs: LocalityDirs, campaignId = LOCALITY_CAMPAIGN): string =>
  join(observeRequestDir({ stateDir: dirs.operatorDir, campaignId }), "request.json");

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

/** Drives the shipped operator answer in-process with a console, a scripted referee host (plumbing only) and optional fault seams. */
export async function answer(
  dirs: LocalityDirs,
  terminal: ScriptedConsole = verbConsole("observe-surroundings"),
  over: Partial<AnswerObservationRequestParams> = {},
  host: Policy | null = observationPolicy(),
) {
  const h = host ? startScriptedHost(dirs, host) : null;
  try {
    const result = await answerObservationRequest({
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
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

/**
 * Runs the shipped answer BINARY as a real child process whose console is its standard input/output. A SEPARATE responder (this function)
 * reads what the child prints, and only after the child has printed its fresh challenge writes the phrase (or a decline) back: the
 * confirmation reaches the child over a channel the requesting host never had.
 */
export async function answerAsProcess(
  dirs: LocalityDirs,
  o: { confirm?: boolean; host?: Policy | null; extra?: string[] } = {},
) {
  const h = (o.host === undefined ? observationPolicy() : o.host)
    ? startScriptedHost(dirs, o.host === undefined ? observationPolicy() : o.host!)
    : null;
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
      "--referee-wait",
      "20",
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
  try {
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
  } finally {
    await h?.stop();
  }
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
  const done = runObserveRequestMcpCli(requestServerArgs(dirs, secretFile), {
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

export { runObserveRequestAnswerCli };
