import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import {
  PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE,
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  fail,
} from "@immortalis/contracts";
import type { FsOps } from "@immortalis/engine";
import type { ReadCurrentObservationGlanceResult } from "@immortalis/protocol";
import { defaultOperatorDir } from "./session.ts";
import { bindPlayerViewHost, readPlayerViewSecretFile } from "./player-view-exchange.ts";
import { openAuthorizedPlayerView, readPlayerViewGlance } from "./player-view.ts";

/**
 * The local, client-neutral stdio MCP transport of the existing CURRENT ACTIVE-PC GLANCE read (BLUE v5.2 bounded brief 2026-10-15): a standard
 * Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0) that a compatible, locally configured chat/agent host starts and
 * calls. It is a transport and nothing else: the engine calls no model, holds no model credential and opens no network, and the host is
 * given no authority by calling it.
 *
 * ONE tool, and nothing else (no shell, no file system, no database, no listing, no search, no game command):
 *
 *   read_current_observation_glance     takes NO arguments; returns the Event-Signal presentation the character has actually earned and that
 *                                        is still current, or one opaque refusal
 *
 * The host's request carries nothing the trusted side could use: any argument at all is an over-claim and is refused, never carried. The
 * trusted side (`player-view.ts`) selects the campaign, proves the one authorized player view against canon, binds the trusted context and
 * invokes the existing strict gateway. EVERY failure of a tool call — an unbound host, a wrong or foreign secret, another campaign or
 * operating-system user, a character that does not match, a writer that is active, an unreconciled package, an over-claiming argument and
 * every hidden observation state — is the one existing `PROJECTION_UNAVAILABLE` refusal, byte for byte and with the same flag, so no cause
 * is host-visible. This server never opens the campaign itself and never writes anything.
 */

export interface PlayerViewMcpOptions {
  /** the trusted read: the host's untrusted arguments in, the existing gateway result out */
  readonly read: (request: unknown) => Promise<ReadCurrentObservationGlanceResult>;
  readonly input: Readable;
  readonly output: Writable;
}

const SERVER_INFO = { name: "immortalis-player-view", version: "0.1.0" } as const;
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** One request line is a small JSON-RPC envelope; a longer line is not one. */
const MAX_LINE_CHARS = 65_536;

export const PLAYER_VIEW_TOOL = PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE;

const INSTRUCTIONS =
  "IMMORTALIS player view. One read-only tool, read_current_observation_glance, takes no arguments and returns only what the player's character has actually perceived and that is still the character's current awareness, or a refusal that says nothing about why. Present only what is returned. Do not add, infer or embellish anything beyond it. You hold no role or permission by calling it, and you cannot make anything happen or be perceived.";

const TOOLS = [
  {
    name: PLAYER_VIEW_TOOL,
    description:
      "Read the character's current awareness: exactly the contact, referent and content the engine has delivered to the player's character, if any is currently earned. Takes no arguments. A refusal means nothing is available to present; it does not say why.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
] as const;

interface RpcRequest {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The strict request the gateway receives. A call with no arguments (or an empty object) is the one valid request. ANY argument is an
 * over-claim: it is handed on marked as such, so the unchanged gateway refuses it on the very same path as a valid request and nothing
 * the host named is ever carried.
 */
export const playerViewRequestOf = (args: unknown): unknown => {
  const empty = args === undefined || (isPlainRecord(args) && Object.keys(args).length === 0);
  return empty
    ? { operation: PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE }
    : { operation: PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE, arguments: args };
};

const refusalResult = (): ReadCurrentObservationGlanceResult =>
  fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);

export async function servePlayerViewMcp(o: PlayerViewMcpOptions): Promise<void> {
  const send = (message: unknown): void => {
    o.output.write(`${JSON.stringify(message)}\n`);
  };
  const reply = (id: unknown, result: unknown) => send({ jsonrpc: "2.0", id, result });
  const error = (id: unknown, code: number, message: string) =>
    send({ jsonrpc: "2.0", id, error: { code, message } });

  const call = async (args: unknown) => {
    let result: ReadCurrentObservationGlanceResult;
    try {
      result = await o.read(playerViewRequestOf(args));
    } catch {
      result = refusalResult();
    }
    // the gateway's own value or its own refusal, serialized exactly as the direct read serializes it
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      ...(result.ok ? {} : { isError: true }),
    };
  };

  const rl = createInterface({ input: o.input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim() === "") continue;
    if (line.length > MAX_LINE_CHARS) {
      error(null, -32600, "invalid request");
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      error(null, -32700, "parse error");
      continue;
    }
    // `null`, a scalar or an array is valid JSON but not a request: refuse it, never dereference it
    if (!isPlainRecord(parsed)) {
      error(null, -32600, "invalid request");
      continue;
    }
    const req = parsed as RpcRequest;
    const idGiven = req.id !== undefined;
    const idValid =
      typeof req.id === "string" || (typeof req.id === "number" && Number.isFinite(req.id));
    if (typeof req.method !== "string") {
      error(idGiven && idValid ? req.id : null, -32600, "invalid request");
      continue;
    }
    if (!idGiven) continue; // notifications (e.g. notifications/initialized) need no reply
    if (!idValid) {
      error(null, -32600, "invalid request");
      continue;
    }
    const method = req.method;
    const params = asRecord(req.params);
    try {
      if (method === "initialize") {
        const asked =
          typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : "";
        reply(req.id, {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
      } else if (method === "ping") reply(req.id, {});
      else if (method === "tools/list") reply(req.id, { tools: TOOLS });
      else if (method === "tools/call") {
        // the closed tool surface: any other name is not a tool of this server (a protocol error, never a read)
        if (params["name"] !== PLAYER_VIEW_TOOL) error(req.id, -32602, "unknown tool");
        else reply(req.id, await call(params["arguments"]));
      } else error(req.id, -32601, "method not found");
    } catch {
      error(req.id, -32603, "internal error");
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The two entry points: the host's tool server, and the operator's trusted bind action
// ---------------------------------------------------------------------------------------------

interface CliStreams {
  input?: Readable;
  output?: Writable;
  error?: (line: string) => void;
  campaignFs?: FsOps;
  ledgerFs?: FsOps;
}

const errorLine = (streams: CliStreams) =>
  streams.error ?? ((l: string) => process.stderr.write(`${l}\n`));

/** Reads `--flag value` pairs; a repeated, unknown or valueless flag is a usage error. */
function flagsOf(argv: readonly string[], allowed: readonly string[]): Map<string, string> | null {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === undefined || !allowed.includes(k) || v === undefined || v === "" || flags.has(k))
      return null;
    flags.set(k, v);
  }
  return flags;
}

export const PLAYER_VIEW_MCP_USAGE =
  "usage: immortalis-player-view --campaign <dir> --campaign-id <id> --operator-dir <dir> --host-id <id> --secret-file <file>\n(a stdio MCP server; started by the AI host, not run by hand)";

const SERVE_FLAGS = [
  "--campaign",
  "--campaign-id",
  "--operator-dir",
  "--host-id",
  "--secret-file",
] as const;

/** The host's tool server. Only the flags and the secret file are checked here; everything else is proved afresh on every call. */
export async function runPlayerViewMcpCli(
  argv: readonly string[],
  streams: CliStreams = {},
): Promise<number> {
  const flags = flagsOf(argv, SERVE_FLAGS);
  const secret =
    flags?.get("--secret-file") !== undefined
      ? readPlayerViewSecretFile(flags.get("--secret-file")!)
      : null;
  if (!flags || flags.size !== SERVE_FLAGS.length || secret === null) {
    errorLine(streams)(PLAYER_VIEW_MCP_USAGE);
    return 64;
  }
  const params = {
    campaignDir: flags.get("--campaign")!,
    campaignId: flags.get("--campaign-id")!,
    stateDir: flags.get("--operator-dir")!,
    hostId: flags.get("--host-id")!,
    secret,
    ...(streams.campaignFs ? { campaignFs: streams.campaignFs } : {}),
    ...(streams.ledgerFs ? { ledgerFs: streams.ledgerFs } : {}),
  };
  await servePlayerViewMcp({
    read: (request) => readPlayerViewGlance(params, request),
    input: streams.input ?? process.stdin,
    output: streams.output ?? process.stdout,
  });
  return 0;
}

export const PLAYER_VIEW_BIND_USAGE =
  "usage: immortalis-player-view-bind --campaign <dir> --campaign-id <id> --host-id <id> [--operator-dir <dir>]";

const BIND_FLAGS = ["--campaign", "--campaign-id", "--host-id", "--operator-dir"] as const;

/**
 * The TRUSTED operator action that binds one concrete host identity to the campaign's ONE authorized player view and writes that host's
 * owner-only secret file. The character is never named on the command line: it is the character the operator kept and placed, proved
 * against canon exactly as every read proves it. It confers nothing by itself (no role, no permission, no observation).
 */
export async function runPlayerViewBindCli(
  argv: readonly string[],
  streams: CliStreams & { out?: (line: string) => void } = {},
): Promise<number> {
  const out = streams.out ?? ((l: string) => process.stdout.write(`${l}\n`));
  const flags = flagsOf(argv, BIND_FLAGS);
  if (
    !flags ||
    !flags.has("--campaign") ||
    !flags.has("--campaign-id") ||
    !flags.has("--host-id")
  ) {
    errorLine(streams)(PLAYER_VIEW_BIND_USAGE);
    return 64;
  }
  const campaignDir = flags.get("--campaign")!;
  const campaignId = flags.get("--campaign-id")!;
  const hostId = flags.get("--host-id")!;
  const stateDir = flags.get("--operator-dir") ?? defaultOperatorDir(campaignDir);
  const view = await openAuthorizedPlayerView({
    campaignDir,
    campaignId,
    stateDir,
    ...(streams.campaignFs ? { campaignFs: streams.campaignFs } : {}),
    ...(streams.ledgerFs ? { ledgerFs: streams.ledgerFs } : {}),
  });
  if (!view.ok) {
    out(`STATUS PLAYER_VIEW_HOST_NOT_BOUND ${view.error.code}`);
    out("no player view of this campaign can be proved for a host; nothing was bound.");
    return 69;
  }
  const { campaign, pcId, operatorUid } = view.value;
  try {
    const bound = await bindPlayerViewHost({
      stateDir,
      campaignId,
      operatorUid,
      hostId,
      pcId,
      ...(streams.ledgerFs ? { fs: streams.ledgerFs } : {}),
    });
    if (!bound.ok) {
      out(`STATUS PLAYER_VIEW_HOST_NOT_BOUND ${bound.error.code}`);
      out(bound.error.message);
      return 69;
    }
    out("STATUS PLAYER_VIEW_HOST_BOUND");
    out(
      `host ${hostId} is bound to this campaign's authorized player view (the character you kept and placed), for the one read-only current-awareness read.`,
    );
    out(
      `secret file (owner-only; give the PATH to the host's tool server, never the contents): ${bound.value.secret_file}`,
    );
    out(
      `tool server: immortalis-player-view --campaign ${campaignDir} --campaign-id ${campaignId} --operator-dir ${stateDir} --host-id ${hostId} --secret-file ${bound.value.secret_file}`,
    );
    out(
      "binding confers no role or permission and earns no observation; the character must still earn one through observe-surroundings.",
    );
    return 0;
  } finally {
    await campaign.close().catch(() => undefined);
  }
}
