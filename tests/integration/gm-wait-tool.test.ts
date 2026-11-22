/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw JSON-RPC replies */
// F-014B A1-2a (BLUE v6.2 pinned brief, 22 Nov 2026): the connected-client GM waiting ingress through the REAL Phone OAuth ledger and the REAL MCP
// Streamable HTTP transport. T1 MECHANISM ONLY: the scripted client below is a script that speaks OAuth 2.1 and MCP, not a chat host and not a model;
// no AI GM semantic interpretation, named client or retained-storage result is claimed. The campaign is built only by the shipped commands, the host
// is enrolled by the shipped bind action, the grant is issued by the real consent decision, and every verdict is whatever the unchanged trusted
// ingress returns. Nothing here mutates a live campaign: each case works in its own copy.
import { createServer } from "node:http";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPhoneServer } from "../../apps/phone/src/server.ts";
import { loadConfig, type PhoneConfig } from "../../apps/phone/src/config.ts";
import { GM_WAIT_TOOL, buildGmWaitTool } from "../../apps/phone/src/gm-wait-tool.ts";
import { parseGmWaitRequest } from "../../packages/contracts/src/temporal-gm-wait.ts";
import { createMcpHttp, type ToolContext } from "../../apps/phone/src/mcp-http.ts";
import { createOAuth, type OAuthScope } from "../../apps/phone/src/oauth.ts";
import { openOAuthGrantLedger } from "../../apps/phone/src/oauth-ledger.ts";
import { runGmWaitBindCli } from "../../packages/operator/src/gm-wait-cli.ts";
import { bindGmWaitClient } from "../../packages/operator/src/gm-wait-exchange.ts";
import { Chat, PLAYER, REFEREE, chatConfig, pkce } from "../support/chat-client.ts";
import { LOCALITY_CAMPAIGN, type LocalityDirs } from "../support/locality.ts";
import { BASIS, observationCampaign } from "../support/observation.ts";
import { stubCollectionRecovery } from "../support/chat-recovery.ts";
import { copyDirs } from "../support/player-view.ts";
import { treeOf } from "../support/tree.ts";

vi.setConfig({ testTimeout: 120_000 });

const HOST = "gm-wait-1";
const SHA = "a".repeat(64);
const initial = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  transaction_id: "gm-wait-tx-1",
  cause: "cause-gm-wait-1",
  trigger: { kind: "GM_INTERPRETED_PC_WAIT", ref: "ref-gm-wait-1" },
  continues: null,
  requested: { target: { unit: BASIS.unit, value: BASIS.value + 120 }, condition: null },
  publication: { basis: "basis-label-1", secrecy: "secrecy-label-1" },
  gm_wait: {
    phase: "INITIAL",
    duration_value: 2,
    duration_unit: "minute",
    observed_basis: BASIS,
    interpretation_mode: "EXPLICIT_DURATION",
    conversion_rule_version: "SI_SUBDAY_V1",
    catalogue_sha256: SHA,
  },
  ...over,
});

let base: LocalityDirs;
beforeAll(async () => {
  base = (await observationCampaign()).dirs;
}, 240_000);

interface Rig {
  readonly dirs: LocalityDirs;
  readonly config: PhoneConfig;
  readonly oauth: ReturnType<typeof createOAuth>;
  readonly ledger: ReturnType<typeof openOAuthGrantLedger>;
  /** a real consent and token exchange; a referee client is AUTHORIZED for the host by the operator unless `authorize` is false */
  readonly link: (scope: OAuthScope, authorize?: boolean) => Promise<Chat>;
  /** the operator authorizes (or withdraws) the OAuth client of a linked chat for the host */
  readonly authorize: (chat: Chat, mode?: "add" | "remove") => Promise<void>;
  /** a legitimately renewed grant: a second consent of the SAME registered client, a new grant, a new session */
  readonly renew: (chat: Chat) => Promise<void>;
  readonly disk: () => { campaign: Record<string, string>; operator: Record<string, string> };
  readonly stop: () => Promise<void>;
  readonly calls: { verified: number };
  readonly beforeVerify: { hook: () => void };
}

/** One isolated campaign copy with the host enrolled, a real grant ledger, a real authorization server and the real MCP transport serving ONLY this tool. */
async function rig(over: { hosts?: string[]; enroll?: boolean } = {}): Promise<Rig> {
  const dirs = copyDirs(base);
  if (over.enroll !== false) {
    const out: string[] = [];
    const code = await runGmWaitBindCli(
      [
        "--campaign",
        dirs.campaignDir,
        "--campaign-id",
        LOCALITY_CAMPAIGN,
        "--host-id",
        HOST,
        "--operator-dir",
        dirs.operatorDir,
      ],
      { out: (l) => out.push(l) },
    );
    expect(code, out.join("\n")).toBe(0);
  }
  const config = await chatConfig({
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    operatorDir: dirs.operatorDir,
    gmWaitHostIds: over.hosts ?? [HOST],
  });
  const ledger = openOAuthGrantLedger({
    dir: join(config.operatorDir, "oauth-ledger"),
    campaignId: config.campaignId,
    now: Date.now,
  });
  const oauth = createOAuth(
    config,
    Date.now,
    (_who, role, secret) => (secret === (role === "player" ? PLAYER : REFEREE) ? "ok" : "bad"),
    ledger,
  );
  const calls = { verified: 0 };
  const beforeVerify = { hook: () => undefined as void };
  const tool = buildGmWaitTool({
    config,
    now: Date.now,
    oauthStatus: (client, grant) => ledger.status(client, grant),
    verify: async (...args) => {
      calls.verified += 1;
      const { verifyGmWaitIngress } =
        await import("../../packages/operator/src/gm-wait-ingress.ts");
      const result = await verifyGmWaitIngress(...args, parseGmWaitRequest);
      beforeVerify.hook();
      return result;
    },
  });
  const mcp = createMcpHttp({
    oauth,
    tools: [tool],
    instructions: "GM waiting ingress test only",
    now: Date.now,
    serverInfo: { name: "gm-wait-test", version: "0" },
  });
  const server = createServer((req, res) => void mcp.handle(req, res));
  await new Promise<void>((resolve) => server.listen(config.port, "127.0.0.1", resolve));
  const authorize = async (chat: Chat, mode: "add" | "remove" = "add"): Promise<void> => {
    // an unenrolled host cannot be given a client: that refusal is the point of the unenrolled case
    await bindGmWaitClient({
      stateDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: process.getuid!(),
      hostId: HOST,
      client: chat.clientId,
      mode,
    });
  };
  const consent = async (chat: Chat, scope: OAuthScope): Promise<void> => {
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
    chat.session = "";
    await chat.init();
  };
  const renew = (chat: Chat) => consent(chat, "referee");
  const link = async (scope: OAuthScope, authorizeClient = scope === "referee"): Promise<Chat> => {
    const chat = new Chat(config.publicUrl!);
    const registration = oauth.register({ redirect_uris: [chat.redirect] });
    chat.clientId = String(registration.body["client_id"]);
    await consent(chat, scope);
    if (authorizeClient) await authorize(chat);
    return chat;
  };
  return {
    dirs,
    config,
    oauth,
    ledger,
    link,
    authorize,
    renew,
    calls,
    beforeVerify,
    disk: () => ({ campaign: treeOf(dirs.campaignDir), operator: treeOf(dirs.operatorDir) }),
    stop: async () => {
      mcp.closeAll();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const OPAQUE = "no GM waiting readiness can be established";
const names = (r: any): string[] => r.json.result.tools.map((t: { name: string }) => t.name);

describe("[A1-2a] [mechanism only] the connected-client ingress over the real OAuth ledger and MCP transport", () => {
  it("[A1-2a] [mechanism only] P01 a real referee-lane grant, an enrolled host and a strict request yield noncanonical readiness; the tool is offered to the referee lane only; nothing is written", async () => {
    const r = await rig();
    try {
      const gm = await r.link("referee");
      const player = await r.link("player");
      expect(names(await gm.rpc("tools/list"))).toEqual([GM_WAIT_TOOL]);
      expect(names(await player.rpc("tools/list"))).toEqual([]);
      const before = r.disk();
      const ready = await gm.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      expect(ready.isError).toBe(false);
      expect(ready.data).toMatchObject({
        status: "GM_WAIT_REQUEST_READY",
        canonical: false,
        effects: "NONE",
        source: { role: "role.gm", permission: "permission.rule.adjudicate", host_id: HOST },
      });
      expect(r.disk()).toEqual(before);
      // a player-scope grant cannot even name the tool
      const denied = await player.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      expect(denied.json.error.code).toBe(-32602);
      expect(r.calls.verified).toBe(1);
      expect(r.disk()).toEqual(before);
    } finally {
      await r.stop();
    }
  });

  it("[A1-2a] [mechanism only] P03 the same request re-read in the same and in a new session is a fresh, identical verdict with no commit", async () => {
    const r = await rig();
    try {
      const gm = await r.link("referee");
      const before = r.disk();
      const first = await gm.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      const again = await gm.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      await gm.init(); // a new MCP session of the same grant
      const next = await gm.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      for (const x of [first, again, next]) expect(x.data?.status).toBe("GM_WAIT_REQUEST_READY");
      expect(again.data.request_sha256).toBe(first.data.request_sha256);
      // the transport reference names the call's session and request: a re-read is not a replayed receipt
      expect(again.data.transport_ref_sha256).not.toBe(first.data.transport_ref_sha256);
      expect(next.data.transport_ref_sha256).not.toBe(first.data.transport_ref_sha256);
      expect(r.calls.verified).toBe(3);
      expect(r.disk()).toEqual(before);
    } finally {
      await r.stop();
    }
  });

  it("[A1-2a] [mechanism only] A01 a revoked grant, an expired token and an unissued grant yield no verdict", async () => {
    const r = await rig();
    try {
      const gm = await r.link("referee");
      // the operator revokes the one actual client and grant: the transport denies before any tool runs
      const grants = r.oauth.grants()!;
      expect(grants.length).toBeGreaterThan(0);
      const before = r.disk();
      const revoked = r.oauth.revokeGrant(grants[0]!.client, grants[0]!.grant, "OPERATOR");
      expect(revoked).toBe("REVOKED");
      const after = await gm.rpc("tools/call", {
        name: GM_WAIT_TOOL,
        arguments: { host_id: HOST, request: initial() },
      });
      expect(after.status).toBe(401);
      expect(r.calls.verified).toBe(0);
      // the trusted handler re-checks on its own: an unissued grant, an expired token, and a missing scope are each opaque, and nothing runs
      const tool = buildGmWaitTool({
        config: r.config,
        now: Date.now,
        oauthStatus: (c, g) => r.ledger.status(c, g),
        verify: async () => {
          throw new Error("must not run");
        },
      });
      const ctx = (over: Partial<ToolContext>): ToolContext => ({
        request: { session: "s", id: "1", tool: GM_WAIT_TOOL, input: "x" },
        canReview: false,
        supportsElicitation: false,
        scopes: ["referee"],
        client: grants[0]!.client,
        grant: "grant-never-issued",
        accessExpiresAtMs: Date.now() + 60_000,
        canElicit: false,
        elicit: async () => null,
        ...over,
      });
      const args = { host_id: HOST, request: initial() };
      const unissued = await tool.handler(args, ctx({}));
      const expired = await tool.handler(
        args,
        ctx({ grant: grants[0]!.grant, accessExpiresAtMs: Date.now() - 1 }),
      );
      const stale = await tool.handler(args, ctx({ grant: grants[0]!.grant })); // the revoked grant itself
      const noScope = await tool.handler(args, ctx({ scopes: ["player"] }));
      const noRequest = await tool.handler(args, ctx({ request: undefined as never }));
      const wrongTool = await tool.handler(
        args,
        ctx({ request: { session: "s", id: "1", tool: "referee_get_task", input: "x" } }),
      );
      for (const x of [unissued, expired, stale, noScope, noRequest, wrongTool]) {
        expect(x.isError).toBe(true);
        expect(x.content[0]!.text).toBe(OPAQUE);
      }
      expect(r.disk()).toEqual({ ...before, operator: r.disk().operator });
    } finally {
      await r.stop();
    }
  });

  it("[A1-2a] [mechanism only] A02 another grant cannot use a session it did not initialize, and a model-supplied host, campaign, character or extra argument is opaque or refused", async () => {
    const r = await rig();
    try {
      const gm = await r.link("referee");
      const other = await r.link("referee");
      const before = r.disk();
      // the other grant presents the first grant's session id with its own valid token
      other.session = gm.session;
      const stolen = await other.rpc("tools/call", {
        name: GM_WAIT_TOOL,
        arguments: { host_id: HOST, request: initial() },
      });
      expect(stolen.status).toBe(404);
      expect(r.calls.verified).toBe(0);
      for (const args of [
        { host_id: "gm-scene", request: initial() },
        { host_id: HOST, request: initial(), campaign_id: "campaign-other" },
        { host_id: HOST, request: initial(), pc_id: "pc-other" },
        { host_id: HOST },
        { request: initial() },
        { host_id: 7, request: initial() },
      ]) {
        const x = await gm.call(GM_WAIT_TOOL, args);
        expect(x.isError, JSON.stringify(args)).toBe(true);
        expect(x.text, JSON.stringify(args)).toBe(OPAQUE);
      }
      expect(r.calls.verified).toBe(0);
      // a model-supplied role inside the request is the specific over-claim refusal, once the caller is proved the enrolled GM
      const forged = await gm.call(GM_WAIT_TOOL, {
        host_id: HOST,
        request: initial({
          context: { role: "role.gm", permission: "permission.rule.adjudicate" },
        }),
      });
      expect(forged.isError).toBe(true);
      expect(forged.data).toMatchObject({
        status: "GM_WAIT_REQUEST_REFUSED",
        reason: "OVERCLAIM",
        issues: ["context"],
      });
      expect(r.disk()).toEqual(before);
    } finally {
      await r.stop();
    }
  });

  it("[A1-2a] [mechanism only] A1R-01 two independently valid referee clients: B cannot select A's host, A passes, a revoked A fails, a legitimately renewed A succeeds, a withdrawn A fails", async () => {
    const r = await rig();
    try {
      const a = await r.link("referee"); // authorized by the operator for the host
      const b = await r.link("referee", false); // a valid referee-lane client the operator never authorized
      expect(a.clientId).not.toBe(b.clientId);
      const before = r.disk();
      // B: a valid grant, the referee scope, the listed host id: the tool is offered and the ingress is reached, and it is refused opaquely
      expect(names(await b.rpc("tools/list"))).toEqual([GM_WAIT_TOOL]);
      const denied = await b.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      expect(denied.isError).toBe(true);
      expect(denied.text).toBe(OPAQUE);
      expect(JSON.stringify(denied.json)).not.toMatch(/GM_WAIT_REQUEST_READY/);
      // A: passes
      const granted = await a.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      expect(granted.data?.status).toBe("GM_WAIT_REQUEST_READY");
      expect(r.calls.verified).toBe(2);
      // B's own malformed or forged request is no better: the opaque refusal comes before any request-specific reason
      const probe = await b.call(GM_WAIT_TOOL, {
        host_id: HOST,
        request: initial({
          context: { role: "role.gm", permission: "permission.rule.adjudicate" },
        }),
      });
      expect(probe.text).toBe(OPAQUE);
      // a legitimately renewed grant of the SAME client A: a new grant and a new session, and it passes
      const grantsBefore = r.oauth.grants()!.length;
      await r.renew(a);
      expect(r.oauth.grants()!.length).toBe(grantsBefore + 1);
      expect((await a.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() })).data?.status).toBe(
        "GM_WAIT_REQUEST_READY",
      );
      // the operator revokes A's grants: the transport denies, and B is still refused
      for (const g of r.oauth.grants()!.filter((x) => x.client === a.clientId))
        expect(r.oauth.revokeGrant(g.client, g.grant, "OPERATOR")).toBe("REVOKED");
      const calledBefore = r.calls.verified;
      const revoked = await a.rpc("tools/call", {
        name: GM_WAIT_TOOL,
        arguments: { host_id: HOST, request: initial() },
      });
      expect(revoked.status).toBe(401);
      expect(r.calls.verified).toBe(calledBefore);
      expect((await b.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() })).text).toBe(OPAQUE);
      // the operator withdraws A's client authorization (a fresh consent of A is then a valid grant of an unauthorized client)
      await r.renew(a);
      expect((await a.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() })).isError).toBe(
        false,
      );
      await r.authorize(a, "remove");
      const withdrawn = await a.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      expect(withdrawn.isError).toBe(true);
      expect(withdrawn.text).toBe(OPAQUE);
      // and nothing was written by any of it (the ledger and the client binding are the operator's, not this call's)
      expect(r.disk().campaign).toEqual(before.campaign);
    } finally {
      await r.stop();
    }
  });

  it("[A1-2a] [mechanism only] A03 a host that is not listed or not enrolled yields no verdict", async () => {
    const unlisted = await rig({ hosts: ["gm-other"] });
    try {
      const gm = await unlisted.link("referee");
      const x = await gm.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      expect(x.text).toBe(OPAQUE);
      expect(unlisted.calls.verified).toBe(0);
    } finally {
      await unlisted.stop();
    }
    const unenrolled = await rig({ enroll: false });
    try {
      const gm = await unenrolled.link("referee");
      const before = unenrolled.disk();
      const x = await gm.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      expect(x.isError).toBe(true);
      expect(x.text).toBe(OPAQUE);
      expect(unenrolled.calls.verified).toBe(0); // no secret file: refused before the ingress is asked
      expect(unenrolled.disk()).toEqual(before);
    } finally {
      await unenrolled.stop();
    }
  });

  it("[A1-2a] [mechanism only] A11 a grant revoked while the call is in flight yields no verdict, though the ingress ran", async () => {
    const r = await rig();
    try {
      const gm = await r.link("referee");
      const grant = r.oauth.grants()![0]!;
      r.beforeVerify.hook = () => void r.oauth.revokeGrant(grant.client, grant.grant, "OPERATOR");
      const before = r.disk();
      const x = await gm.call(GM_WAIT_TOOL, { host_id: HOST, request: initial() });
      expect(r.calls.verified).toBe(1);
      expect(x.isError).toBe(true);
      expect(x.text).toBe(OPAQUE);
      expect(r.disk().campaign).toEqual(before.campaign);
    } finally {
      await r.stop();
    }
  });

  it("[A1-2a] [mechanism only] A12 and A16 the real phone server offers exactly the one tool only when a GM waiting host is listed, and no existing tool changes", async () => {
    const listFor = async (gmWaitHostIds?: string[]) => {
      const dir = copyDirs(base);
      const config = await chatConfig({
        campaignDir: dir.campaignDir,
        campaignId: LOCALITY_CAMPAIGN,
        operatorDir: dir.operatorDir,
        ...(gmWaitHostIds ? { gmWaitHostIds } : {}),
      });
      const app = createPhoneServer(config, {
        pollMs: 300,
        recovery: stubCollectionRecovery(),
      } as any);
      await app.listen();
      try {
        const chat = new Chat(`http://127.0.0.1:${config.port}`);
        expect((await chat.link("referee", { referee: REFEREE })).ok).toBe(true);
        await chat.init();
        const tools = (await chat.rpc("tools/list")).json.result.tools as {
          name: string;
          description: string;
          inputSchema: unknown;
        }[];
        return tools;
      } finally {
        await app.close();
      }
    };
    const bare = await listFor();
    const listed = await listFor([HOST]);
    expect(bare.map((t) => t.name)).not.toContain(GM_WAIT_TOOL);
    expect(listed.map((t) => t.name)).toEqual([...bare.map((t) => t.name), GM_WAIT_TOOL]);
    // every tool the service already offered is byte-for-byte what it was
    expect(listed.slice(0, -1)).toEqual(bare);
    const tool = listed[listed.length - 1] as any;
    expect(tool.inputSchema.properties.host_id.enum).toEqual([HOST]);
    expect(tool.inputSchema.additionalProperties).toBe(false);
    // configuration: the optional host list is closed, bounded and never overlaps the referee hosts
    const env = (extra: Record<string, string>) =>
      loadConfig({
        IMMORTALIS_CAMPAIGN_DIR: "/data/campaign",
        IMMORTALIS_CAMPAIGN_ID: "campaign-test",
        IMMORTALIS_OPERATOR_DIR: "/data/operator",
        IMMORTALIS_PLAYER_TOKEN: PLAYER,
        IMMORTALIS_REFEREE_TOKEN: REFEREE,
        IMMORTALIS_REFEREE_HOST_IDS: "gm-setup,gm-collection",
        IMMORTALIS_TRANSPORT: "insecure-loopback",
        ...extra,
      });
    const plain = env({});
    expect(plain.ok && plain.value.gmWaitHostIds).toBeFalsy();
    const on = env({ IMMORTALIS_GM_WAIT_HOST_IDS: "gm-wait-1" });
    expect(on.ok && on.value.gmWaitHostIds).toEqual(["gm-wait-1"]);
    for (const bad of ["gm-setup", "a,a", "a,b,c,d,e", "bad host", "-x"])
      expect(env({ IMMORTALIS_GM_WAIT_HOST_IDS: bad }).ok, bad).toBe(false);
  });
});
