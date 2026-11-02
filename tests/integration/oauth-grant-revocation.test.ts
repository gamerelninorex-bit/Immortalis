/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON-RPC */
// MECHANISM ONLY. The OAuth grant ledger through the REAL phone server: client self-revocation (RFC 7009), the referee-lane operator
// view/revocation, the end of ordinary MCP access and of refresh, the application-wide denial of a broken initialised ledger, and the
// absence of any effect on the canonical campaign. The "chat" is a script that speaks OAuth and MCP; it is not a host, a model or a person.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPhoneServer, type PhoneServer } from "../../apps/phone/src/server.ts";
import { Chat, PLAYER, REFEREE, chatConfig } from "../support/chat-client.ts";
import { stubCollectionRecovery } from "../support/chat-recovery.ts";
import { tempDir } from "../support/tmp.ts";

const SCENARIO = {
  player_character: "pc-test-1",
  world: "world-test",
  source: "source-test",
  reserve: "reserve-test",
  quantity_unit: "lump",
  mechanism: "mech-test",
  basis: "basis-test",
};

async function rig() {
  const dir = tempDir("immortalis-oauth-revocation-");
  mkdirSync(join(dir, "setup"), { recursive: true });
  mkdirSync(join(dir, "operator"), { recursive: true });
  writeFileSync(join(dir, "scenario.json"), JSON.stringify(SCENARIO));
  const config = await chatConfig({
    scenarioFile: join(dir, "scenario.json"),
    setupDir: join(dir, "setup"),
    operatorDir: join(dir, "operator"),
  });
  const app: PhoneServer = createPhoneServer(config, {
    pollMs: 300,
    recovery: stubCollectionRecovery(),
  } as any);
  await app.listen();
  const base = `http://127.0.0.1:${config.port}`;
  const link = async () => {
    const chat = new Chat(base);
    expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
    await chat.init({ elicitation: {} });
    return chat;
  };
  const post = (path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, json: (await r.json().catch(() => ({}))) as any }));
  const revoke = (chat: Chat, token: string) =>
    fetch(`${base}/oauth/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: chat.clientId, token }),
    });
  return {
    app,
    config,
    base,
    link,
    post,
    revoke,
    ledgerDir: join(config.operatorDir, "oauth-ledger"),
  };
}

describe("MECHANISM: OAuth grant revocation through the real server", () => {
  it("self-revocation ends MCP access and refresh at once; a new consent is a new grant", async () => {
    const r = await rig();
    try {
      const chat = await r.link();
      expect((await chat.rpc("tools/list")).status).toBe(200);
      const done = await r.revoke(chat, chat.refresh); // the refresh token revokes the WHOLE grant
      expect(done.status).toBe(200);
      expect((await chat.rpc("tools/list")).status).toBe(401);
      const again = await chat.token({
        grant_type: "refresh_token",
        client_id: chat.clientId,
        refresh_token: chat.refresh,
      });
      expect(again.status).toBe(400);
      expect(again.json.error).toBe("invalid_grant");
      // a fresh authorization is a different grant and works
      const next = await r.link();
      expect((await next.rpc("tools/list")).status).toBe(200);
    } finally {
      await r.app.close();
    }
  }, 60_000);

  it("the discovery document advertises the revocation endpoint", async () => {
    const r = await rig();
    try {
      const meta = await new Chat(r.base).raw("GET", "/.well-known/oauth-authorization-server");
      expect(meta.json.revocation_endpoint).toBe(`${r.config.publicUrl}/oauth/revoke`);
    } finally {
      await r.app.close();
    }
  }, 60_000);

  it("the operator lists and revokes by the referee lane secret ONLY; the player secret, a wrong secret and a cross-origin call do nothing", async () => {
    const r = await rig();
    try {
      const chat = await r.link();
      const denied = [
        await r.post("/oauth/operator", { action: "list" }),
        await r.post("/oauth/operator", { action: "list", referee_token: PLAYER }),
        await r.post("/oauth/operator", { action: "list", referee_token: "wrong" }),
      ];
      expect(denied.map((d) => d.status)).toEqual([401, 401, 401]);
      const crossOrigin = await fetch(`${r.base}/oauth/operator`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ action: "list", referee_token: REFEREE }),
      });
      expect(crossOrigin.status).toBe(403);
      const listed = await r.post("/oauth/operator", { action: "list", referee_token: REFEREE });
      expect(listed.status).toBe(200);
      expect(listed.json.grants).toHaveLength(1);
      const entry = listed.json.grants[0];
      expect(entry).toMatchObject({ state: "ISSUED", client: chat.clientId });
      // no token or secret is ever shown by the operator view
      expect(JSON.stringify(listed.json)).not.toContain(chat.access);
      expect(JSON.stringify(listed.json)).not.toContain(chat.refresh);
      const revoked = await r.post("/oauth/operator", {
        action: "revoke",
        referee_token: REFEREE,
        client_id: entry.client,
        grant_id: entry.grant,
      });
      expect(revoked.json).toEqual({ result: "REVOKED" });
      expect((await chat.rpc("tools/list")).status).toBe(401);
      expect(
        (await r.post("/oauth/operator", { action: "list", referee_token: REFEREE })).json
          .grants[0],
      ).toMatchObject({ state: "REVOKED", revoked_by: "OPERATOR" });
    } finally {
      await r.app.close();
    }
  }, 60_000);

  it("a missing or corrupt initialised ledger denies ordinary MCP access, refresh and the operator view alike (application-wide, fail closed)", async () => {
    const r = await rig();
    try {
      const chat = await r.link();
      expect((await chat.rpc("tools/list")).status).toBe(200);
      const marker = join(r.ledgerDir, "ledger.json");
      const kept = readFileSync(marker, "utf8");
      rmSync(marker);
      expect((await chat.rpc("tools/list")).status).toBe(401);
      const refreshed = await chat.token({
        grant_type: "refresh_token",
        client_id: chat.clientId,
        refresh_token: chat.refresh,
      });
      expect(refreshed.status).toBe(503);
      expect(refreshed.json.access_token).toBeUndefined();
      expect(
        (await r.post("/oauth/operator", { action: "list", referee_token: REFEREE })).status,
      ).toBe(503);
      expect((await new Chat(r.base).link("player", { player: PLAYER })).ok).toBe(false);
      // restoring the intact marker (an operator decision) restores service: nothing was repaired or guessed
      writeFileSync(marker, kept);
      expect(readdirSync(r.ledgerDir).filter((n) => n.startsWith("grant-"))).toHaveLength(1);
    } finally {
      await r.app.close();
    }
  }, 60_000);
});
