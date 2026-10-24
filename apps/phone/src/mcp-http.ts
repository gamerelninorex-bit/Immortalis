import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AccessClaims, OAuthScope, OAuthServer } from "./oauth.ts";

/**
 * A small MCP server over the Streamable HTTP transport (spec 2025-06-18), for an ordinary chat host that links it through OAuth. It is
 * transport and nothing else: it parses JSON-RPC, enforces authentication and the token's scopes on every request, keeps a session per
 * `initialize`, and hands a tool call to its handler. A tool call that needs a HUMAN's reply may ask the client to collect it through
 * the protocol's own `elicitation/create` request, carried on that call's event stream: the reply goes straight back to the handler, never
 * through a tool argument, so a model cannot supply it (a client that did not declare the capability is never asked).
 */
export const MCP_LATEST = "2025-06-18";
const SUPPORTED = [MCP_LATEST, "2025-03-26", "2024-11-05"];
const MAX_BODY = 256 * 1024;
const SESSION_IDLE_MS = 60 * 60_000;
const MAX_SESSIONS = 16;
const KEEPALIVE_MS = 15_000;

export interface ToolResult {
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
  readonly isError?: boolean;
}
export interface Elicited {
  readonly action: "accept" | "decline" | "cancel";
  readonly content?: Record<string, unknown>;
}
export interface ToolContext {
  readonly scopes: readonly OAuthScope[];
  readonly client: string;
  /** true only when this client declared elicitation AND this call is being carried on an event stream */
  readonly canElicit: boolean;
  /** asks the HUMAN (through the client's own surface) for a reply; null when it was not answered in time or not possible */
  readonly elicit: (
    message: string,
    schema: Record<string, unknown>,
    timeoutMs: number,
  ) => Promise<Elicited | null>;
}
export interface McpTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Record<string, unknown>;
  readonly scope: OAuthScope;
  /** the call may ask the human for a reply, so it is answered on an event stream when the client supports that */
  readonly mayElicit?: boolean;
  readonly handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

/** a question put to the human, bound to the authorization under which the call that asked it was made */
interface Pending {
  readonly grant: string;
  readonly finish: (v: Elicited | null) => void;
}

interface Session {
  readonly id: string;
  readonly client: string;
  /** the authorization (consent) this session was initialized under: another grant, even of the same client, is not this session's */
  readonly grant: string;
  readonly protocol: string;
  readonly elicitation: boolean;
  initialized: boolean;
  seen: number;
  readonly waiting: Map<string, Pending>;
}

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * The operator's one line about an ACCEPTED initialize (24 October diagnostic). It is built from a closed whitelist and nothing a client
 * sent is copied into it: the protocol the client asked for only as one of the supported literals (else OTHER), the protocol answered, whether
 * the client declared `elicitation` (ABSENT, an OBJECT, or OTHER for any other value) with the presence of its `form` and `url` members as
 * booleans, and whether the session is eligible for the existing eliciting transport. No client name or version, no capability key or value,
 * no header, token, session, grant or client identity, and no path or campaign fact can reach it. It is engineering evidence of what a client
 * declared; it shows nothing about whether any client renders a confirmation control.
 */
export function negotiationLine(requested: string, protocol: string, elicitation: unknown): string {
  const kind = elicitation === undefined ? "ABSENT" : record(elicitation) ? "OBJECT" : "OTHER";
  const member = (name: string): string =>
    record(elicitation) ? String(Object.hasOwn(elicitation, name)) : "n/a";
  return [
    "mcp initialize accepted:",
    `requested=${SUPPORTED.includes(requested) ? requested : "OTHER"}`,
    `negotiated=${protocol}`,
    `elicitation=${kind}`,
    `form=${member("form")}`,
    `url=${member("url")}`,
    `eligible=${kind === "OBJECT" && protocol === MCP_LATEST}`,
  ].join(" ");
}

export interface McpHttp {
  readonly handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  readonly closeAll: () => void;
}

export function createMcpHttp(o: {
  readonly oauth: OAuthServer;
  readonly tools: readonly McpTool[];
  readonly instructions: string;
  readonly now: () => number;
  readonly serverInfo: { readonly name: string; readonly version: string };
  /**
   * The operator's diagnostic sink (see `negotiationLine`), called once per accepted initialize and never de-duplicated here. It is optional,
   * and a missing, throwing or rejecting sink changes nothing about the handshake, the session or the authorization.
   */
  readonly negotiation?: (line: string) => void;
}): McpHttp {
  const sessions = new Map<string, Session>();
  const open = new Set<ServerResponse>();
  const publicOrigin = new URL(o.oauth.issuer).origin;

  const head = (extra: Record<string, string> = {}) => ({
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...extra,
  });
  const json = (
    res: ServerResponse,
    status: number,
    body: unknown,
    extra: Record<string, string> = {},
  ) => {
    res.writeHead(status, head({ "content-type": "application/json; charset=utf-8", ...extra }));
    res.end(JSON.stringify(body));
  };
  const rpcError = (id: unknown, code: number, message: string) => ({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  });
  const unauthorized = (res: ServerResponse) =>
    json(
      res,
      401,
      { error: "unauthorized" },
      {
        "www-authenticate": `Bearer resource_metadata="${o.oauth.issuer}/.well-known/oauth-protected-resource"`,
      },
    );

  const readBody = (req: IncomingMessage): Promise<unknown> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          resolve(undefined);
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          resolve(undefined);
        }
      });
      req.on("error", () => resolve(undefined));
    });

  const sweep = () => {
    const t = o.now();
    for (const [id, s] of sessions)
      if (t - s.seen > SESSION_IDLE_MS) {
        for (const w of s.waiting.values()) w.finish(null);
        sessions.delete(id);
      }
  };

  const authenticate = (req: IncomingMessage): AccessClaims | null => {
    const header = req.headers.authorization;
    if (typeof header !== "string") return null;
    const m = /^Bearer ([A-Za-z0-9._~+/=-]{1,4096})$/.exec(header);
    return m ? o.oauth.verifyAccess(m[1]!) : null;
  };

  async function callTool(
    req: IncomingMessage,
    res: ServerResponse,
    session: Session,
    claims: AccessClaims,
    id: unknown,
    params: Record<string, unknown>,
  ) {
    const name = params["name"];
    const tool =
      typeof name === "string"
        ? o.tools.find((t) => t.name === name && claims.scopes.includes(t.scope))
        : undefined;
    if (!tool) return json(res, 200, rpcError(id, -32602, "unknown tool"));
    const args = params["arguments"] === undefined ? {} : params["arguments"];
    if (!record(args)) return json(res, 200, rpcError(id, -32602, "arguments must be an object"));

    const stream =
      Boolean(tool.mayElicit) && session.elicitation && session.protocol === MCP_LATEST;
    const asked = new Set<string>();
    let write: (message: unknown) => void = () => undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    if (stream) {
      res.writeHead(
        200,
        head({ "content-type": "text/event-stream; charset=utf-8", connection: "keep-alive" }),
      );
      write = (message) => {
        if (!res.writableEnded) res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
      };
      timer = setInterval(() => {
        if (!res.writableEnded) res.write(": keepalive\n\n");
      }, KEEPALIVE_MS);
      open.add(res);
      // a client that goes away ends every question it was asked: nothing stays waiting for a reply that cannot come
      res.on("close", () => {
        for (const eid of asked) session.waiting.get(eid)?.finish(null);
      });
    }
    const ctx: ToolContext = {
      scopes: claims.scopes,
      client: claims.client,
      canElicit: stream,
      elicit: (message, schema, timeoutMs) =>
        new Promise((resolve) => {
          if (!stream || res.writableEnded) return resolve(null);
          const eid = `elicit-${randomBytes(8).toString("hex")}`;
          const finish = (v: Elicited | null) => {
            clearTimeout(t);
            session.waiting.delete(eid);
            resolve(v);
          };
          const t = setTimeout(() => {
            write({
              jsonrpc: "2.0",
              method: "notifications/cancelled",
              params: { requestId: eid, reason: "no reply in time" },
            });
            finish(null);
          }, timeoutMs);
          session.waiting.set(eid, { grant: claims.grant, finish });
          asked.add(eid);
          write({
            jsonrpc: "2.0",
            id: eid,
            method: "elicitation/create",
            params: { message, requestedSchema: schema },
          });
        }),
    };
    let result: ToolResult;
    try {
      result = await tool.handler(args, ctx);
    } catch {
      result = { content: [{ type: "text", text: "the tool could not complete" }], isError: true };
    }
    const message = { jsonrpc: "2.0", id, result };
    if (stream) {
      clearInterval(timer);
      write(message);
      open.delete(res);
      res.end();
    } else if (!res.writableEnded) json(res, 200, message);
    void req;
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    sweep();
    // the endpoint answers only under its own public name (a guard against DNS rebinding), and a browser origin only from itself
    if (req.headers.host !== new URL(o.oauth.issuer).host)
      return json(res, 421, { error: "this endpoint is reachable only by its public name" });
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== publicOrigin)
      return json(res, 403, { error: "this origin may not use the endpoint" });
    const claims = authenticate(req);
    if (!claims) return unauthorized(res);
    const sid = req.headers["mcp-session-id"];
    const sessionId = typeof sid === "string" ? sid : undefined;

    if (req.method === "DELETE") {
      const s = sessionId ? sessions.get(sessionId) : undefined;
      if (!s || s.client !== claims.client || s.grant !== claims.grant)
        return json(res, 404, { error: "no such session" });
      for (const w of s.waiting.values()) w.finish(null);
      sessions.delete(s.id);
      res.writeHead(204, head());
      return void res.end();
    }
    // no server-initiated stream is offered: a request that needs a human is carried on its own call's stream
    if (req.method === "GET") {
      res.writeHead(405, head({ allow: "POST, DELETE" }));
      return void res.end();
    }
    if (req.method !== "POST") return json(res, 405, { error: "method not allowed" });
    if (!(req.headers["content-type"] ?? "").startsWith("application/json"))
      return json(res, 415, { error: "JSON only" });
    const body = await readBody(req);
    if (!record(body) || body["jsonrpc"] !== "2.0")
      return json(res, 400, rpcError(null, -32600, "a single JSON-RPC 2.0 message is required"));
    const id = body["id"];
    const method = body["method"];
    const params = body["params"] === undefined ? {} : body["params"];

    // the human's reply to an elicitation (or any client response) arrives as a response message
    if (method === undefined) {
      const s = sessionId ? sessions.get(sessionId) : undefined;
      if (!s || s.client !== claims.client || s.grant !== claims.grant)
        return json(res, 404, { error: "no such session" });
      s.seen = o.now();
      const waiting = typeof id === "string" ? s.waiting.get(id) : undefined;
      // a question is answered only under the authorization that asked it; a public client id is not the authority of a person
      if (waiting && waiting.grant !== claims.grant)
        return json(res, 403, { error: "this authorization did not ask that question" });
      if (waiting && "result" in body) {
        const r = body["result"];
        const action = record(r) ? r["action"] : undefined;
        waiting.finish(
          action === "accept" || action === "decline" || action === "cancel"
            ? {
                action,
                ...(record(r) && record(r["content"]) ? { content: r["content"] } : {}),
              }
            : null,
        );
      } else if (waiting) waiting.finish(null);
      res.writeHead(202, head());
      return void res.end();
    }
    if (typeof method !== "string" || !record(params))
      return json(res, 400, rpcError(id, -32600, "invalid request"));

    if (method === "initialize") {
      const client = params["clientInfo"];
      const requested = params["protocolVersion"];
      if (
        typeof requested !== "string" ||
        !record(params["capabilities"]) ||
        !record(client) ||
        typeof client["name"] !== "string" ||
        typeof client["version"] !== "string" ||
        (typeof id !== "string" && !Number.isSafeInteger(id))
      )
        return json(
          res,
          200,
          rpcError(id, -32602, "initialize needs a protocolVersion, capabilities and clientInfo"),
        );
      if (sessions.size >= MAX_SESSIONS) {
        const oldest = [...sessions.values()].sort((a, b) => a.seen - b.seen)[0];
        if (oldest) sessions.delete(oldest.id);
      }
      const protocol = SUPPORTED.includes(requested) ? requested : MCP_LATEST;
      const s: Session = {
        id: randomBytes(24).toString("hex"),
        client: claims.client,
        grant: claims.grant,
        protocol,
        elicitation: record(params["capabilities"]["elicitation"]),
        initialized: false,
        seen: o.now(),
        waiting: new Map(),
      };
      sessions.set(s.id, s);
      try {
        const reported: unknown = o.negotiation?.(
          negotiationLine(requested, protocol, params["capabilities"]["elicitation"]),
        );
        if (reported instanceof Promise) reported.catch(() => undefined);
      } catch {
        // a diagnostic that fails is never the client's problem
      }
      return json(
        res,
        200,
        {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: protocol,
            capabilities: { tools: { listChanged: false } },
            serverInfo: o.serverInfo,
            instructions: o.instructions,
          },
        },
        { "mcp-session-id": s.id },
      );
    }

    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!sessionId)
      return json(res, 400, rpcError(id, -32600, "the Mcp-Session-Id header is required"));
    if (!session || session.client !== claims.client || session.grant !== claims.grant)
      return json(res, 404, rpcError(id, -32600, "no such session: initialize again"));
    session.seen = o.now();

    if (method === "notifications/initialized") {
      session.initialized = true;
      res.writeHead(202, head());
      return void res.end();
    }
    if (id === undefined) {
      res.writeHead(202, head());
      return void res.end();
    }
    if (method === "ping") return json(res, 200, { jsonrpc: "2.0", id, result: {} });
    if (!session.initialized)
      return json(res, 200, rpcError(id, -32002, "the session has not been initialized"));
    if (method === "tools/list")
      return json(res, 200, {
        jsonrpc: "2.0",
        id,
        result: {
          tools: o.tools
            .filter((t) => claims.scopes.includes(t.scope))
            .map((t) => ({
              name: t.name,
              title: t.title,
              description: t.description,
              inputSchema: t.inputSchema,
              annotations: t.annotations,
            })),
        },
      });
    if (method === "tools/call") return callTool(req, res, session, claims, id, params);
    return json(res, 200, rpcError(id, -32601, "method not found"));
  }

  return {
    handle,
    closeAll: () => {
      for (const s of sessions.values()) for (const w of s.waiting.values()) w.finish(null);
      sessions.clear();
      for (const r of open) r.end();
      open.clear();
    },
  };
}
