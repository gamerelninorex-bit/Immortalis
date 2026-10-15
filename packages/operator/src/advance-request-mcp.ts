import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { fail } from "@immortalis/contracts";
import type { FsOps } from "@immortalis/engine";
import {
  ADVANCE_REQUEST_UNAVAILABLE,
  ADVANCE_REQUEST_UNAVAILABLE_MESSAGE,
  requestActivePcTargetAdvance,
  type AdvanceRequestResult,
} from "./advance-request.ts";
import { readAdvanceRequestSecretFile } from "./advance-request-exchange.ts";

/**
 * The local, client-neutral stdio MCP transport of a HOST-REQUESTED active-PC target-only time advance (BLUE v5.2-A1 bounded brief 2026-10-15):
 * a standard Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0) that a compatible, locally configured chat/agent host
 * starts and calls. It is a SEPARATE server from the read-only player-view server (`player-view-mcp.ts`) and from the observation-request
 * server (`observe-request-mcp.ts`): a different binary, a different credential, a different binding directory. The read and observation
 * credentials are never made a time-advance command, and this credential is never made a reader or an observer. The engine calls no model,
 * holds no model credential and opens no network, and the host is given no authority by calling it.
 *
 * ONE tool, and nothing else (no shell, no file system, no database, no listing, no search, no read, no target, no confirmation, no game
 * command):
 *
 *   request_active_pc_target_advance    takes NO arguments; leaves ONE non-canonical request for the operator to consider; returns that it was
 *                                        left, or one opaque refusal
 *
 * Calling it advances nothing, decides nothing, confirms nothing and writes no canonical record of any kind: the player's choice of an exact
 * target is made separately and freshly on the operator's own console (`advance-request-answer`, which runs the existing `pcTargetAdvance`).
 * Any argument at all is an over-claim: the call is refused before the package or the retained state is touched, and nothing the host named is
 * ever carried. EVERY failure of a tool call — an unbound host, a wrong or foreign secret, another campaign or operating-system user, a
 * character that does not match, a writer that is active, an unreconciled package, an unestablished basis and an over-claiming argument — is
 * the one opaque `TARGET_ADVANCE_REQUEST_UNAVAILABLE` refusal, byte for byte and with the same flag, so no cause is host-visible.
 */

export interface AdvanceRequestMcpOptions {
  /** the trusted request: the host's untrusted arguments in, the framed result out */
  readonly request: (args: unknown) => Promise<AdvanceRequestResult>;
  readonly input: Readable;
  readonly output: Writable;
}

const SERVER_INFO = { name: "immortalis-advance-request", version: "0.1.0" } as const;
const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** One request line is a small JSON-RPC envelope; a longer line is not one. */
const MAX_LINE_CHARS = 65_536;

export const ADVANCE_REQUEST_TOOL = "request_active_pc_target_advance";

const INSTRUCTIONS =
  "IMMORTALIS time-advance request. One tool, request_active_pc_target_advance, takes no arguments and leaves a request that the player consider advancing the world's canonical time, out of character. A request is not the player's choice and not a decision, and it names no target: no time advances unless the player separately names an exact target and confirms it on their own console, and they may decline. You cannot confirm for the player, cannot name a target, duration, character, role or permission, and cannot make anything happen, expire or be perceived. A time advance is not waiting in the story, is not something the character does and earns the character no knowledge. Do not tell the player that time passed or that anything happened because you asked; read the character's current awareness through the separate read-only tool, and present only what it returns.";

const TOOLS = [
  {
    name: ADVANCE_REQUEST_TOOL,
    description:
      "Ask that the player consider advancing the world's canonical time (out of character). Takes no arguments and names no target. This only leaves a request for the player to consider on their own console; it is not the player's choice, it advances nothing and it is never confirmation. A refusal does not say why.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
] as const;

interface RpcRequest {
  readonly jsonrpc?: unknown;
  readonly id?: unknown;
  readonly method?: unknown;
  readonly params?: unknown;
}

const isPlainRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asRecord = (v: unknown): Record<string, unknown> => (isPlainRecord(v) ? v : {});

/** MCP request identities are strings or integers; a fraction, boolean, object, `null` or unsafe number is not an identity. */
const isRequestId = (v: unknown): v is string | number =>
  typeof v === "string" || (typeof v === "number" && Number.isSafeInteger(v));

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** The MCP `initialize` request carries a protocol version, the client's capabilities and the client's identity (name and version). */
const isInitializeParams = (p: Record<string, unknown>): boolean => {
  const info = p["clientInfo"];
  return (
    isNonEmptyString(p["protocolVersion"]) &&
    isPlainRecord(p["capabilities"]) &&
    isPlainRecord(info) &&
    isNonEmptyString(info["name"]) &&
    isNonEmptyString(info["version"])
  );
};

const refusalResult = (): AdvanceRequestResult =>
  fail(ADVANCE_REQUEST_UNAVAILABLE, ADVANCE_REQUEST_UNAVAILABLE_MESSAGE);

export async function serveAdvanceRequestMcp(o: AdvanceRequestMcpOptions): Promise<void> {
  const send = (message: unknown): void => {
    o.output.write(`${JSON.stringify(message)}\n`);
  };
  const reply = (id: unknown, result: unknown) => send({ jsonrpc: "2.0", id, result });
  const error = (id: unknown, code: number, message: string) =>
    send({ jsonrpc: "2.0", id, error: { code, message } });

  const call = async (args: unknown) => {
    let result: AdvanceRequestResult;
    try {
      result = await o.request(args);
    } catch {
      result = refusalResult();
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      ...(result.ok ? {} : { isError: true }),
    };
  };

  // MCP lifecycle: no tool may be listed or called before the client has initialized the session (an `initialize` request the server
  // answered, then the client's `notifications/initialized`). A message out of phase is refused before anything is read or disclosed.
  let phase: "NEW" | "INITIALIZED" | "READY" = "NEW";

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
    const idValid = isRequestId(req.id);
    // a message that is not JSON-RPC 2.0 is not a request: answered under its id only when that id is itself usable
    if (req.jsonrpc !== "2.0" || typeof req.method !== "string" || (idGiven && !idValid)) {
      error(idGiven && idValid ? req.id : null, -32600, "invalid request");
      continue;
    }
    const method = req.method;
    if (!idGiven) {
      // a notification needs no reply; only the client's initialization notice changes anything, and only in its place
      if (
        method === "notifications/initialized" &&
        phase === "INITIALIZED" &&
        (req.params === undefined || isPlainRecord(req.params))
      )
        phase = "READY";
      continue;
    }
    try {
      if (req.params !== undefined && !isPlainRecord(req.params)) {
        error(req.id, -32602, "invalid params");
        continue;
      }
      const params = asRecord(req.params);
      if (method === "ping") reply(req.id, {});
      else if (method === "initialize") {
        if (phase !== "NEW") error(req.id, -32600, "already initialized");
        else if (!isInitializeParams(params)) error(req.id, -32602, "invalid params");
        else {
          phase = "INITIALIZED";
          const asked = params["protocolVersion"] as string;
          reply(req.id, {
            protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
            instructions: INSTRUCTIONS,
          });
        }
      } else if (method === "tools/list" || method === "tools/call") {
        if (phase !== "READY") error(req.id, -32600, "server not initialized");
        else if (method === "tools/list") reply(req.id, { tools: TOOLS });
        // the closed tool surface: any other name is not a tool of this server (a protocol error, never a request)
        else if (params["name"] !== ADVANCE_REQUEST_TOOL) error(req.id, -32602, "unknown tool");
        else reply(req.id, await call(params["arguments"]));
      } else error(req.id, -32601, "method not found");
    } catch {
      error(req.id, -32603, "internal error");
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The host's tool-server entry point
// ---------------------------------------------------------------------------------------------

export interface AdvanceRequestCliStreams {
  input?: Readable;
  output?: Writable;
  error?: (line: string) => void;
  campaignFs?: FsOps;
  ledgerFs?: FsOps;
}

export const errorLineOf = (streams: { error?: (line: string) => void }) =>
  streams.error ?? ((l: string) => process.stderr.write(`${l}\n`));

/** Reads `--flag value` pairs; a repeated, unknown or valueless flag is a usage error. */
export function flagsOf(
  argv: readonly string[],
  allowed: readonly string[],
): Map<string, string> | null {
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

export const ADVANCE_REQUEST_MCP_USAGE =
  "usage: immortalis-advance-request --campaign <dir> --campaign-id <id> --operator-dir <dir> --host-id <id> --secret-file <file>\n(a stdio MCP server; started by the AI host, not run by hand)";

const SERVE_FLAGS = [
  "--campaign",
  "--campaign-id",
  "--operator-dir",
  "--host-id",
  "--secret-file",
] as const;

/** The host's tool server. Only the flags and the secret file are checked here; everything else is proved afresh on every call. */
export async function runAdvanceRequestMcpCli(
  argv: readonly string[],
  streams: AdvanceRequestCliStreams = {},
): Promise<number> {
  const flags = flagsOf(argv, SERVE_FLAGS);
  const secret =
    flags?.get("--secret-file") !== undefined
      ? readAdvanceRequestSecretFile(flags.get("--secret-file")!)
      : null;
  if (!flags || flags.size !== SERVE_FLAGS.length || secret === null) {
    errorLineOf(streams)(ADVANCE_REQUEST_MCP_USAGE);
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
  await serveAdvanceRequestMcp({
    request: (args) => requestActivePcTargetAdvance(params, args),
    input: streams.input ?? process.stdin,
    output: streams.output ?? process.stdout,
  });
  return 0;
}
