// MECHANISM ONLY: a harmless, isolated registration proves the transport extension seam; it is not a game operation.
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createMcpHttp, type McpTool } from "../../apps/phone/src/mcp-http.ts";
import { createOAuth, type OAuthScope } from "../../apps/phone/src/oauth.ts";
import { Chat, PLAYER, REFEREE, chatConfig, pkce } from "../support/chat-client.ts";
import { tempDir } from "../support/tmp.ts";

describe("provider-neutral authenticated tool registration", () => {
  it("registers a typed harmless handler on the existing transport and refuses a different scope and an unregistered owner operation", async () => {
    const config = await chatConfig({ operatorDir: tempDir("registration-") });
    const oauth = createOAuth(config, Date.now, (_who, role, secret) =>
      secret === (role === "player" ? PLAYER : REFEREE) ? "ok" : "bad",
    );
    let calls = 0;
    const tool: McpTool = {
      name: "test_echo",
      title: "Test echo",
      description: "Isolated test, no campaign access or game authority.",
      scope: "player",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      handler: async (args) => {
        // The per-operation handler owns its validation; MCP descriptor metadata grants no authority.
        if (Object.keys(args).length !== 1 || typeof args["text"] !== "string")
          return { content: [{ type: "text", text: "invalid input" }], isError: true };
        calls++;
        return { content: [{ type: "text", text: args["text"] }] };
      },
    };
    const mcp = createMcpHttp({
      oauth,
      tools: [tool],
      instructions: "Registration test only",
      now: Date.now,
      serverInfo: { name: "registration-test", version: "0" },
    });
    const server = createServer((req, res) => void mcp.handle(req, res));
    await new Promise<void>((resolve) => server.listen(config.port, "127.0.0.1", resolve));
    const client = async (scope: OAuthScope) => {
      const chat = new Chat(config.publicUrl!);
      const registration = oauth.register({ redirect_uris: [chat.redirect] });
      chat.clientId = String(registration.body["client_id"]);
      const { verifier, challenge } = pkce();
      const decision = oauth.decide(
        {
          ...Object.fromEntries(chat.authorizeQuery({ challenge, scope })),
          approve: true,
          ...(scope === "player" ? { player_token: PLAYER } : { referee_token: REFEREE }),
        },
        "isolated-test-human",
      );
      expect(decision.status).toBe(200);
      const token = oauth.token({
        grant_type: "authorization_code",
        client_id: chat.clientId,
        redirect_uri: chat.redirect,
        code: new URL(String(decision.body["redirect"])).searchParams.get("code"),
        code_verifier: verifier,
      });
      expect(token.status).toBe(200);
      chat.access = String(token.body["access_token"]);
      await chat.init();
      return chat;
    };
    try {
      const player = await client("player");
      const referee = await client("referee");
      expect(
        (await player.rpc("tools/list")).json.result.tools.map((t: { name: string }) => t.name),
      ).toEqual(["test_echo"]);
      expect((await referee.rpc("tools/list")).json.result.tools).toEqual([]);
      expect((await player.call("test_echo", { text: "hello" })).text).toBe("hello");
      expect((await player.call("test_echo", { text: "hello", owner: "world" })).isError).toBe(
        true,
      );
      expect((await referee.call("test_echo", { text: "hello" })).json.error.code).toBe(-32602);
      expect((await player.call("read_owner", {})).json.error.code).toBe(-32602);
      const stranger = new Chat(config.publicUrl!);
      expect(
        (await stranger.rpc("tools/call", { name: "test_echo", arguments: { text: "hello" } }))
          .status,
      ).toBe(401);
      expect(calls).toBe(1);
    } finally {
      mcp.closeAll();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
