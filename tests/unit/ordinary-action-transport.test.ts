/* eslint-disable @typescript-eslint/no-explicit-any -- in-memory HTTP and credential fixtures */
// Actual MCP handler, no sockets. Auth fixtures prove transport mechanisms, not human provenance or Work-client UX.
import { Readable } from "node:stream";
import { setImmediate } from "node:timers/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { expect, it } from "vitest";
import { createMcpHttp } from "../../apps/phone/src/mcp-http.ts";
import type { OAuthServer } from "../../apps/phone/src/oauth.ts";

it("a concurrent or completed ordinary request replays once; changed input/grant/scope and full receipt cache dispatch nothing extra", async () => {
  let dispatched = 0;
  const mcp = createMcpHttp({
    oauth: {
      issuer: "http://test.invalid",
      verifyAccess: (token: string) =>
        token === "missing"
          ? null
          : {
              client: "client",
              grant: token === "other" ? "other-grant" : "grant",
              scopes: token === "referee" ? ["referee"] : ["player"],
            },
    } as OAuthServer,
    now: () => 1,
    instructions: "test",
    serverInfo: { name: "test", version: "0" },
    tools: [
      {
        name: "collect",
        title: "collect",
        description: "collect",
        scope: "player",
        ordinaryAction: true,
        inputSchema: {},
        annotations: {},
        handler: async () => {
          dispatched++;
          await setImmediate();
          return { content: [{ type: "text", text: String(dispatched) }] };
        },
      },
    ],
  });
  const call = async (body: unknown, sid?: string, token = "player") => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]) as IncomingMessage;
    Object.assign(req, {
      method: "POST",
      headers: {
        host: "test.invalid",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...(sid ? { "mcp-session-id": sid } : {}),
      },
    });
    const out: { status: number; headers: Record<string, string>; body: any } = {
      status: 0,
      headers: {},
      body: null,
    };
    const res = {
      writableEnded: false,
      writeHead: (status: number, headers: Record<string, string>) => {
        out.status = status;
        out.headers = headers;
      },
      end: (s?: string) => {
        out.body = s ? JSON.parse(s) : null;
      },
    } as unknown as ServerResponse;
    await mcp.handle(req, res);
    return out;
  };
  try {
    const initialized = await call({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "scripted", version: "0" },
      },
    });
    const sid = initialized.headers["mcp-session-id"]!;
    expect(sid).toBeTruthy();
    await call({ jsonrpc: "2.0", method: "notifications/initialized" }, sid);
    const request = (id: number, amount = 2) => ({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: "collect", arguments: { amount } },
    });
    const [a, b] = await Promise.all([call(request(1), sid), call(request(1), sid)]);
    expect(a.body).toEqual(b.body);
    expect(dispatched).toBe(1);
    expect((await call(request(1), sid)).body).toEqual(a.body);
    expect(dispatched).toBe(1);
    expect((await call(request(1, 3), sid)).body.error).toBeDefined();
    expect((await call(request(2), sid, "other")).status).toBe(404);
    expect((await call(request(2), sid, "referee")).body.error).toBeDefined();
    expect((await call(request(2), sid, "missing")).status).toBe(401);
    expect(dispatched).toBe(1);
    for (let i = 2; i <= 256; i++) expect((await call(request(i), sid)).body.error).toBeUndefined();
    expect(dispatched).toBe(256);
    expect((await call(request(257), sid)).body.error).toBeDefined();
    expect((await call(request(1), sid)).body).toEqual(a.body);
    expect(dispatched).toBe(256);
    mcp.closeAll(); // restart/expired session does not recreate a capability from the request
    expect((await call(request(1), sid)).status).toBe(404);
    expect(dispatched).toBe(256);
  } finally {
    mcp.closeAll();
  }
});
