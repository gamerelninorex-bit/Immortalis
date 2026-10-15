/* eslint-disable @typescript-eslint/no-explicit-any -- a JSON-RPC reply of the test client */
// TEST SUPPORT for the local player-view MCP transport (BLUE v5.2 bounded brief 2026-10-15). The campaigns these tests read are built ONLY by
// the shipped paths (see ./observation.ts): the observation is earned by the real `observe-surroundings` producer chain, the scripted
// referee host there is PLUMBING ONLY (it reads the delivered words by rule and certifies nothing about any AI), and nothing here supplies a
// verdict, receipt, packet, presentation or Glance success as an upstream fact. The MCP side is exercised as a REAL stdio process spoken to
// as an MCP client would speak to it; the expected value is whatever the existing direct gateway returns over the very same canon.
import { spawn } from "node:child_process";
import { chmodSync, cpSync } from "node:fs";
import { PassThrough } from "node:stream";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { expect } from "vitest";
import {
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { playerViewDir } from "../../packages/operator/src/player-view-exchange.ts";
import {
  runPlayerViewBindCli,
  runPlayerViewMcpCli,
} from "../../packages/operator/src/player-view-mcp.ts";
import { nodeFs, type FsOps } from "@immortalis/engine";
import { GLANCE_REQUEST } from "./protocol.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "./locality.ts";
import { PC_ID } from "./observation.ts";
import { tempDir } from "./tmp.ts";

export { playerViewDir };

export const SERVER_BIN = "packages/operator/src/player-view-bin.ts";
export const BIND_BIN = "packages/operator/src/player-view-bind-bin.ts";
export const PLAYER_VIEW_HOST = "chat-host-1";
export const PLAYER_VIEW_TOOL = "read_current_observation_glance";

/** Runs the shipped bind action in-process and returns what it printed. */
export async function bindHost(
  dirs: LocalityDirs,
  hostId = PLAYER_VIEW_HOST,
  campaignId = LOCALITY_CAMPAIGN,
) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runPlayerViewBindCli(
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
    secretFile: join(playerViewDir({ stateDir: dirs.operatorDir, campaignId }), `${hostId}.secret`),
  };
}

export const serverArgs = (
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
  o.hostId ?? PLAYER_VIEW_HOST,
  "--secret-file",
  secretFile,
];

export class McpClient {
  readonly #proc;
  readonly #lines: string[] = [];
  readonly #waiters: ((l: string) => void)[] = [];
  readonly stderrText: Promise<string>;
  readonly stdoutLines: string[] = [];
  #id = 0;
  constructor(args: string[], bin = SERVER_BIN) {
    this.#proc = spawn(
      process.execPath,
      ["--disable-warning=ExperimentalWarning", "--experimental-strip-types", bin, ...args],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    createInterface({ input: this.#proc.stdout }).on("line", (l) => {
      this.stdoutLines.push(l);
      const w = this.#waiters.shift();
      if (w) w(l);
      else this.#lines.push(l);
    });
    this.stderrText = new Promise((resolve) => {
      let out = "";
      this.#proc.stderr.on("data", (d) => (out += d));
      this.#proc.on("exit", () => resolve(out));
    });
  }
  exit(): Promise<number | null> {
    return new Promise((resolve) => {
      if (this.#proc.exitCode !== null) resolve(this.#proc.exitCode);
      else this.#proc.on("exit", (c) => resolve(c));
    });
  }
  next(): Promise<string> {
    const l = this.#lines.shift();
    if (l !== undefined) return Promise.resolve(l);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("the MCP server did not reply")), 30_000);
      this.#waiters.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
    });
  }
  async rpc(method: string, params: unknown = {}): Promise<any> {
    const id = ++this.#id;
    this.#proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    const msg = JSON.parse(await this.next());
    expect(msg.id).toBe(id);
    return msg;
  }
  /** Writes a raw line and returns the one reply line. */
  async raw(line: string): Promise<any> {
    this.#proc.stdin.write(`${line}\n`);
    return JSON.parse(await this.next());
  }
  async handshake(): Promise<any> {
    const init = await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "0" },
    });
    this.notify("notifications/initialized");
    return init;
  }
  /** The tool result, exactly as an MCP client receives it. */
  async call(
    args: unknown = {},
    name = PLAYER_VIEW_TOOL,
  ): Promise<{ text: string; isError: boolean; raw: any }> {
    const msg = await this.rpc(
      "tools/call",
      args === undefined ? { name } : { name, arguments: args },
    );
    const r = msg.result;
    return { text: r.content[0].text, isError: r.isError === true, raw: msg };
  }
  notify(method: string, params?: unknown): void {
    this.#proc.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) })}\n`,
    );
  }
  end(): void {
    this.#proc.stdin.end();
  }
}

/** Runs `fn` against a started and handshaken server, always shutting it down. */
export async function withServer<T>(
  args: string[],
  fn: (c: McpClient) => Promise<T>,
): Promise<{ value: T; exit: number | null; stderr: string; stdout: string[] }> {
  const c = new McpClient(args);
  try {
    await c.handshake();
    const value = await fn(c);
    c.end();
    const exit = await c.exit();
    return { value, exit, stderr: await c.stderrText, stdout: c.stdoutLines };
  } finally {
    c.end();
  }
}

/** The existing DIRECT gateway over the very same canon, with the trusted context built by the test itself (the oracle for byte equality). */
export async function directGlance(dirs: LocalityDirs, recipient = PC_ID): Promise<string> {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return JSON.stringify(
      readCurrentObservationGlance(
        bindTrustedCurrentPlayerContext({ view: c.store, recipient_id: recipient }),
        GLANCE_REQUEST(),
      ),
    );
  } finally {
    await c.close();
  }
}

/** A private, independent copy of a campaign and its retained state (so each test can mutate its own). */
export function copyDirs(from: LocalityDirs): LocalityDirs {
  const root = tempDir("immortalis-player-view-");
  chmodSync(root, 0o700);
  const campaignDir = join(root, "campaign");
  const operatorDir = join(root, "operator-state");
  cpSync(from.campaignDir, campaignDir, { recursive: true, preserveTimestamps: true });
  cpSync(from.operatorDir, operatorDir, { recursive: true, preserveTimestamps: true });
  chmodSync(campaignDir, 0o755);
  chmodSync(operatorDir, 0o700);
  return { campaignDir, operatorDir };
}

/** A file-system seam that records the name of every operation (read or write) it is asked to perform. */
export function recordingFs(): { fs: FsOps; calls: string[] } {
  const calls: string[] = [];
  const wrapped: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(nodeFs)) {
    wrapped[name] = (...args: unknown[]) => {
      calls.push(name);
      return (fn as (...a: unknown[]) => unknown).apply(nodeFs, args);
    };
  }
  return { fs: wrapped as unknown as FsOps, calls };
}

/**
 * Runs the shipped tool-server entry point IN-PROCESS over the given input lines, with both file-system seams recording. Returns every reply
 * line (parsed) and the operations the server performed on the package and on the retained state.
 */
export async function serveInProcess(
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
  const done = runPlayerViewMcpCli(serverArgs(dirs, secretFile), {
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
