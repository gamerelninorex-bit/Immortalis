/* eslint-disable @typescript-eslint/no-explicit-any -- a scripted MCP client reads untyped JSON-RPC */
// TEST SUPPORT for the ordinary-chat adapter. EVERYTHING DRIVEN THROUGH THIS CLIENT IS A MECHANISM TEST: it is a script that speaks OAuth 2.1
// and the MCP Streamable HTTP transport, not a chat host, not a model and not a person. A scripted "human" below answers an elicitation only
// where a test says so; no test lets the (scripted) assistant side supply that answer.
import { createHash, randomBytes } from "node:crypto";
import { request } from "node:http";
import { createServer } from "node:net";
import { loadConfig, type PhoneConfig } from "../../apps/phone/src/config.ts";

export const PLAYER = "player-secret-0123456789-abcdefghijklmnopqrstuv";
export const REFEREE = "referee-secret-0123456789-abcdefghijklmnopqrstuv";

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const port = typeof a === "object" && a ? a.port : 0;
      s.close(() => resolve(port));
    });
  });
}

export async function chatConfig(over: Partial<PhoneConfig> = {}): Promise<PhoneConfig> {
  const port = await freePort();
  const c = loadConfig({
    IMMORTALIS_CAMPAIGN_DIR: "/data/campaign",
    IMMORTALIS_CAMPAIGN_ID: "campaign-test",
    IMMORTALIS_OPERATOR_DIR: "/data/operator",
    IMMORTALIS_PLAYER_TOKEN: PLAYER,
    IMMORTALIS_REFEREE_TOKEN: REFEREE,
    IMMORTALIS_REFEREE_HOST_IDS: "gm-setup,gm-collection",
    IMMORTALIS_TRANSPORT: "insecure-loopback",
    PORT: String(port),
    IMMORTALIS_PUBLIC_URL: `http://127.0.0.1:${port}`,
  });
  if (!c.ok) throw new Error(c.problems.join("; "));
  return { ...c.value, ...over };
}

export const pkce = () => {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

export interface Elicit {
  readonly message: string;
  readonly requestedSchema: any;
}
export type Human = (
  e: Elicit,
) => { action: "accept" | "decline" | "cancel"; content?: any } | null;

export class Chat {
  access = "";
  refresh = "";
  clientId = "";
  session = "";
  readonly redirect = "https://chat.example/callback";
  readonly base: string;
  constructor(base: string) {
    this.base = base;
  }

  async raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, text, json };
  }

  async register(redirects: string[] = [this.redirect]) {
    const r = await this.raw("POST", "/oauth/register", {
      client_name: "Test Chat",
      redirect_uris: redirects,
      token_endpoint_auth_method: "none",
    });
    if (r.status === 201) this.clientId = r.json.client_id;
    return r;
  }
  authorizeQuery(p: {
    challenge: string;
    scope: string;
    state?: string;
    extra?: Record<string, string>;
  }) {
    return new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirect,
      response_type: "code",
      code_challenge: p.challenge,
      code_challenge_method: "S256",
      scope: p.scope,
      state: p.state ?? "st-1",
      resource: `${this.base}/mcp`,
      ...(p.extra ?? {}),
    });
  }
  async decision(
    q: URLSearchParams,
    typed: { player?: string; referee?: string; approve?: boolean },
    headers: Record<string, string> = {},
  ) {
    return this.raw(
      "POST",
      "/oauth/decision",
      {
        ...Object.fromEntries(q),
        approve: typed.approve ?? true,
        ...(typed.player !== undefined ? { player_token: typed.player } : {}),
        ...(typed.referee !== undefined ? { referee_token: typed.referee } : {}),
      },
      headers,
    );
  }
  async token(form: Record<string, string>) {
    const res = await fetch(`${this.base}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
    });
    return { status: res.status, json: (await res.json().catch(() => undefined)) as any };
  }
  /** the full link: register, the human types the lane secrets on the consent page, the code is exchanged */
  async link(scope: string, typed: { player?: string; referee?: string }) {
    if (!this.clientId) await this.register();
    const { verifier, challenge } = pkce();
    const q = this.authorizeQuery({ challenge, scope });
    const decided = await this.decision(q, typed);
    if (decided.status !== 200) return { ok: false as const, decided };
    const back = new URL(decided.json.redirect);
    const code = back.searchParams.get("code");
    if (!code) return { ok: false as const, decided };
    const t = await this.token({
      grant_type: "authorization_code",
      client_id: this.clientId,
      code,
      redirect_uri: this.redirect,
      code_verifier: verifier,
    });
    if (t.status !== 200) return { ok: false as const, decided, t };
    this.access = t.json.access_token;
    this.refresh = t.json.refresh_token;
    return { ok: true as const, decided, t, code, verifier };
  }

  headers(extra: Record<string, string> = {}) {
    return {
      accept: "application/json, text/event-stream",
      ...(this.access ? { authorization: `Bearer ${this.access}` } : {}),
      ...(this.session ? { "mcp-session-id": this.session } : {}),
      "mcp-protocol-version": "2025-06-18",
      ...extra,
    };
  }
  private id = 0;
  /** one JSON-RPC request; an event-stream answer is followed to its response, answering any elicitation through `human` */
  async rpc(method: string, params: any = {}, human?: Human, extra: Record<string, string> = {}) {
    const id = ++this.id;
    const res = await fetch(`${this.base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.headers(extra) },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const type = res.headers.get("content-type") ?? "";
    const elicited: Elicit[] = [];
    if (!type.startsWith("text/event-stream")) {
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { status: res.status, headers: res.headers, json, elicited, stream: false };
    }
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done)
        return {
          status: res.status,
          headers: res.headers,
          json: undefined,
          elicited,
          stream: true,
        };
      buf += dec.decode(value, { stream: true });
      let at: number;
      while ((at = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, at);
        buf = buf.slice(at + 2);
        const data = block
          .split("\n")
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice(6))
          .join("");
        if (!data) continue;
        const msg = JSON.parse(data);
        if (msg.method === "elicitation/create") {
          elicited.push(msg.params);
          const answer = human?.(msg.params) ?? null;
          if (answer)
            await fetch(`${this.base}/mcp`, {
              method: "POST",
              headers: { "content-type": "application/json", ...this.headers() },
              body: JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: answer }),
            });
        } else if (msg.id === id) {
          await reader.cancel().catch(() => undefined);
          return { status: res.status, headers: res.headers, json: msg, elicited, stream: true };
        }
      }
    }
  }
  async init(capabilities: any = {}) {
    const r = await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities,
      clientInfo: { name: "scripted-chat", version: "0" },
    });
    this.session = r.headers.get("mcp-session-id") ?? "";
    await fetch(`${this.base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.headers() },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    return r;
  }
  /** a tool call; the result's first text parsed as JSON when it is JSON */
  async call(name: string, args: any = {}, human?: Human) {
    const r = await this.rpc("tools/call", { name, arguments: args }, human);
    const result = r.json?.result;
    const text: string | undefined = result?.content?.[0]?.text;
    let data: any;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    return { ...r, result, text, data, isError: result?.isError === true };
  }
}

/** the human, as a script: types exactly the phrase the elicitation shows */
export const phraseOf = (message: string): string => {
  const m = /type exactly "([^"]+)"/.exec(message);
  if (!m) throw new Error("no challenge phrase was shown to the human");
  return m[1]!;
};
export const humanConfirms: Human = (e) => ({
  action: "accept",
  content: { reply: phraseOf(e.message) },
});
export const humanDeclines: Human = () => ({ action: "decline" });

/** a request with a Host header of the caller's choosing (fetch forbids it) */
export function withHost(
  base: string,
  path: string,
  host: string,
  headers: Record<string, string>,
) {
  return new Promise<number>((resolve, reject) => {
    const u = new URL(base);
    const req = request(
      {
        host: u.hostname,
        port: u.port,
        path,
        method: "POST",
        headers: { ...headers, host, "content-type": "application/json" },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }));
  });
}
