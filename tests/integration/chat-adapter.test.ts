/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON */
// The ORDINARY-CHAT ADAPTER (apps/phone: a remote MCP endpoint with its OAuth 2.1 authorization server), BLUE live-recovery brief v2.
//
// EVERYTHING IN THIS FILE IS A MECHANISM TEST. The client is a script that speaks OAuth and MCP; the "assistant" and the "referee" are
// scripts; the "human" is a script that types a confirmation only where a test says so. None of it is a real chat session, a real model,
// a real player's choice or a real game master's judgment. It proves authentication, scope separation, that a model-side caller cannot
// confirm anything, the confirmation channels, orchestration without deadlock, and that the SHIPPED commands run unchanged behind it.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanonicalCampaign,
  EpistemicAccessAdapter,
  PcCollectionAdapter,
  verifyEpistemicIntegrity,
} from "@immortalis/engine";
import { collect, collectContinue, reconcile, runCli } from "@immortalis/operator";
import {
  createPhoneServer as realPhoneServer,
  type PhoneDeps,
} from "../../apps/phone/src/server.ts";
import {
  OBSERVATION_ATTEMPTS,
  captureObservation as realCapture,
  pendingPath,
  writePending,
  type ObservationIdentity,
} from "../../apps/phone/src/recovery.ts";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import {
  Chat,
  PLAYER,
  REFEREE,
  chatConfig,
  humanConfirms,
  humanDeclines,
  phraseOf,
  pkce,
  withHost,
  type Human,
} from "../support/chat-client.ts";
import { tempDir } from "../support/tmp.ts";
import { LOCALITY_CAMPAIGN, openOrdinary } from "../support/locality.ts";
import { HOST_ID, plainPolicy } from "../support/original-pc.ts";
import {
  PC_ID,
  observationAnswer,
  observationCampaign,
  observationPolicy,
  observe,
  verbConsole,
} from "../support/observation.ts";
import {
  MECH as COL_MECH,
  PC as COL_PC,
  W as COL_W,
  collectionCampaign,
  hostAnswer,
} from "../support/pc-collection.ts";
import {
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  scriptedTerminal,
} from "../support/operator.ts";
import { readLedger } from "../support/operator-pc-target.ts";
import {
  FIXTURE_CAMPAIGN,
  SRC_BASIS_ID,
  SRC_RESERVE,
  SRC_SOURCE_KEY,
  SRC_UNIT,
  ACTOR_FIXTURE_EXTENSION,
} from "@immortalis/testkit";
import { pcCollectionCommitmentKey } from "@immortalis/contracts";
import { Browser } from "../support/phone-browser.ts";
import { stubCollectionIdentity, stubCollectionRecovery } from "../support/chat-recovery.ts";
import {
  captureCollection,
  runCollectionOperation,
} from "../../apps/phone/src/collection-recovery.ts";

// Stub-CLI cases isolate transport behavior. Cases without a recovery double use the real owners.
const createPhoneServer: typeof realPhoneServer = (config, deps = {}) =>
  realPhoneServer(config, {
    ...deps,
    ...(deps.recovery
      ? {
          recovery: {
            ...stubCollectionRecovery(deps.runCli),
            ...deps.recovery,
            completeObservation:
              deps.recovery.completeObservation ??
              (async () => ({ kind: "PARTIAL", detail: "incomplete" })),
          },
        }
      : {}),
  });

const SCENARIO = {
  player_character: "pc-test-1",
  world: "world-test",
  source: "source-test",
  reserve: "reserve-test",
  quantity_unit: "lump",
  mechanism: "mech-test",
  basis: "basis-test",
};

/** an observation identity as the readback sees it: every attempt's task identity (distinct, 64 hex) */
const stubIdentity = (pc: string, value = 100, event_id = "event-stub"): ObservationIdentity => {
  const ids = Array.from({ length: OBSERVATION_ATTEMPTS }, (_, i) =>
    String(value * 10 + i)
      .padEnd(64, "a")
      .slice(0, 64),
  );
  return {
    pc_id: pc,
    basis: { unit: "fixture-time-unit", value },
    task_id: ids[0]!,
    task_ids: ids,
    event_id,
  };
};

/** owner readback stand-ins for the stub-CLI tests (the real-engine tests below use the real readback) */
const STUB_RECOVERY = {
  captureObservation: async (_c: PhoneConfig, pc: string) => stubIdentity(pc),
  observationEvidence: async () => ({ kind: "NONE" as const }),
};

interface Stub {
  readonly argvs: string[][];
  /** the phrase each confirmation prompt asked for, in order */
  readonly phrases: string[];
  release: () => void;
}

/** a stand-in for the shipped CLI: prints a proposal and a challenge, asks, and finishes by the typed answer (it never answers itself) */
function stubCli(
  opts: {
    gate?: Promise<void>;
    crash?: boolean;
    crashAfterConfirm?: boolean;
    /** the (stand-in) shipped command ends with an unknown outcome WITHOUT throwing */
    unknownExit?: { code: number; status: string };
    /** what the stand-in `reconcile` / `settle-collection-lapse` / recovery re-run reports */
    reconcile?: { code: number; status: string };
    /** the first `settle-collection-lapse` ends unknown; later ones report `reconcile` */
    settleUnknownOnce?: boolean;
    /** from its SECOND run on, a command reports this without asking anything (the recovery presenting the same command again) */
    rerun?: { code: number; status: string };
    /** after the human's confirmation the command goes on working until this is released (the confirmation has been given) */
    afterConfirm?: Promise<void>;
    /** the first run of this command ends unknown at once (nothing is asked); later runs follow `rerun` */
    unknownOnce?: string;
  } = {},
): [NonNullable<PhoneDeps["runCli"]>, Stub] {
  const stub: Stub = { argvs: [], phrases: [], release: () => undefined };
  let settled = false;
  const cli: NonNullable<PhoneDeps["runCli"]> = async (argv, env) => {
    stub.argvs.push([...argv]);
    const t = env.terminal!;
    if (opts.crash) throw new Error("boom");
    if (["status", "locality-status", "character-status"].includes(argv[0]!)) {
      t.say("STATUS OK");
      return 0;
    }
    if (opts.unknownOnce === argv[0] && stub.argvs.filter((a) => a[0] === argv[0]).length === 1) {
      t.say("STATUS COLLECTION_OUTCOME_UNKNOWN");
      return 4;
    }
    if (opts.rerun && stub.argvs.filter((a) => a[0] === argv[0]).length >= 2) {
      t.say(`STATUS ${opts.rerun.status}`);
      return opts.rerun.code;
    }
    if (argv[0] === "settle-collection-lapse" && opts.settleUnknownOnce && !settled) {
      settled = true;
      t.say("STATUS COLLECTION_OUTCOME_UNKNOWN");
      return 4;
    }
    if (argv[0] === "reconcile" || argv[0] === "settle-collection-lapse") {
      const r = opts.reconcile ?? { code: 0, status: "NOTHING_TO_RECONCILE" };
      t.say(`STATUS ${r.status}`);
      return r.code;
    }
    t.say(`PROPOSAL ${argv[0]}`);
    if (opts.gate) await opts.gate;
    const phrase = `${argv[0]} ${Math.random().toString(16).slice(2, 14)}`;
    stub.phrases.push(phrase);
    t.say("PROGRESS referee DECIDED referee/abc/decision");
    t.say(`To confirm, type exactly "${phrase}"`);
    const typed = await t.ask(">");
    if (typed === phrase) {
      if (opts.afterConfirm) await opts.afterConfirm;
      t.say("STATUS COMMITTED");
      // a failure that FOLLOWS the human's confirmation and the (stand-in) owner write
      if (opts.crashAfterConfirm) throw new Error("late failure");
      if (opts.unknownExit) {
        t.say(`STATUS ${opts.unknownExit.status}`);
        return opts.unknownExit.code;
      }
      return 0;
    }
    t.say("STATUS DECLINED");
    return 1;
  };
  return [cli, stub];
}

async function serve(
  deps: PhoneDeps = {},
  over: Partial<PhoneConfig> = {},
  scenario: object | null = SCENARIO,
) {
  const dir = tempDir("immortalis-chat-");
  const scenarioFile = join(dir, "chat-scenario.json");
  if (scenario) writeFileSync(scenarioFile, JSON.stringify(scenario));
  mkdirSync(join(dir, "setup"), { recursive: true });
  const operatorDir = join(dir, "operator");
  mkdirSync(operatorDir, { recursive: true });
  const config = await chatConfig({
    scenarioFile,
    setupDir: join(dir, "setup"),
    operatorDir,
    ...over,
  });
  const app = createPhoneServer(config, { pollMs: 300, recovery: STUB_RECOVERY, ...deps });
  await app.listen();
  return { app, config, base: `http://127.0.0.1:${config.port}` };
}

const withChat = async (
  deps: PhoneDeps = {},
  link: { scope: string; player?: string; referee?: string } = { scope: "player", player: PLAYER },
  caps: any = { elicitation: {} },
) => {
  const s = await serve(deps);
  const chat = new Chat(s.base);
  const linked = await chat.link(link.scope, {
    ...(link.player !== undefined ? { player: link.player } : {}),
    ...(link.referee !== undefined ? { referee: link.referee } : {}),
  });
  expect(linked.ok).toBe(true);
  await chat.init(caps);
  return { ...s, chat };
};

describe("MECHANISM: OAuth 2.1 authentication and scope separation for the ordinary-chat endpoint", () => {
  it("unrelated global login failures do not deny valid page or OAuth lane secrets, while bad secrets and locked sources remain refused", async () => {
    let clock = 1_000_000;
    // A trusted edge supplies distinct source identities; no production proxy is contacted.
    const s = await serve({ now: () => clock }, { trustProxy: true });
    const source = (n: number) => ({ "x-forwarded-for": `192.0.2.${n}` });
    try {
      // Twelve sources each exhaust the existing five-failure address limit.
      for (let n = 1; n <= 12; n++) {
        const attacker = new Browser(s.base, source(n));
        for (let i = 0; i < 5; i++)
          expect((await attacker.login("player", "wrong")).status).toBe(401);
        expect((await attacker.login("player", PLAYER)).status).toBe(429);
      }
      const fresh = new Browser(s.base, source(20));
      expect((await fresh.login("player", "wrong")).status).toBe(429);
      expect((await fresh.login("referee", PLAYER)).status).toBe(429);
      expect((await fresh.login("player", PLAYER)).status).toBe(200);
      expect((await new Browser(s.base, source(21)).login("referee", REFEREE)).status).toBe(200);
      const chat = new Chat(s.base);
      expect((await chat.register()).status).toBe(201);
      const q = chat.authorizeQuery({ challenge: pkce().challenge, scope: "player referee" });
      expect((await chat.decision(q, { player: "wrong" }, source(22))).status).toBe(429);
      const linked = await chat.decision(q, { player: PLAYER, referee: REFEREE }, source(22));
      expect(linked.status).toBe(200);
      expect(new URL(linked.json.redirect).searchParams.get("code")).toBeTruthy();
      // Correct logins did not reset the global bad-attempt budget.
      expect((await new Browser(s.base, source(23)).login("player", "wrong")).status).toBe(429);
      clock += 11 * 60_000;
      expect((await new Browser(s.base, source(23)).login("player", "wrong")).status).toBe(401);
      // The original source's fifteen-minute lock still has not expired.
      expect((await new Browser(s.base, source(1)).login("player", PLAYER)).status).toBe(429);
      clock += 5 * 60_000;
      expect((await new Browser(s.base, source(1)).login("player", PLAYER)).status).toBe(200);
    } finally {
      await s.app.close();
    }
  });

  it("is off without a configured public origin; with one, an unauthenticated call is a 401 that points to the protected-resource metadata", async () => {
    const off = await serve({}, { publicUrl: null });
    try {
      expect((await new Chat(off.base).raw("POST", "/mcp", {})).status).toBe(404);
      expect(
        (await new Chat(off.base).raw("GET", "/.well-known/oauth-authorization-server")).status,
      ).toBe(404);
    } finally {
      await off.app.close();
    }
    const s = await serve();
    try {
      const c = new Chat(s.base);
      const r = await c.raw("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "ping" });
      expect(r.status).toBe(401);
      expect(r.headers.get("www-authenticate")).toContain(
        `resource_metadata="${s.config.publicUrl}/.well-known/oauth-protected-resource"`,
      );
      const prm = (await c.raw("GET", "/.well-known/oauth-protected-resource")).json;
      expect(prm.resource).toBe(`${s.config.publicUrl}/mcp`);
      expect(prm.authorization_servers).toEqual([s.config.publicUrl]);
      const asm = (await c.raw("GET", "/.well-known/oauth-authorization-server")).json;
      expect(asm.code_challenge_methods_supported).toEqual(["S256"]);
      expect(asm.token_endpoint_auth_methods_supported).toEqual(["none"]);
      expect(asm.registration_endpoint).toBe(`${s.config.publicUrl}/oauth/register`);
      // a made-up, tampered or wrongly framed bearer is the same 401
      for (const authorization of ["Bearer not.a.token", "Bearer", "Basic abc", "bearer x"])
        expect(
          (
            await c.raw(
              "POST",
              "/mcp",
              { jsonrpc: "2.0", id: 1, method: "ping" },
              { authorization },
            )
          ).status,
        ).toBe(401);
    } finally {
      await s.app.close();
    }
  });

  it("registers only https public clients, and grants a scope only to the matching lane's own secret", async () => {
    const s = await serve();
    try {
      const c = new Chat(s.base);
      expect((await c.register(["http://evil.example/cb"])).status).toBe(400);
      expect((await c.register(["javascript:alert(1)"])).status).toBe(400);
      expect(
        (
          await c.raw("POST", "/oauth/register", {
            redirect_uris: [c.redirect],
            token_endpoint_auth_method: "client_secret_basic",
          })
        ).status,
      ).toBe(400);
      expect((await c.register()).status).toBe(201);
      const q = c.authorizeQuery({ challenge: "x".repeat(43), scope: "player referee" });
      // no secret, a wrong secret and the OTHER lane's secret grant nothing
      expect((await c.decision(q, {})).status).toBe(401);
      expect(
        (await c.decision(q, { player: "wrong-secret-0123456789-abcdefghijklmnopqrstuv" })).status,
      ).toBe(401);
      expect((await c.decision(q, { player: REFEREE })).status).toBe(401);
      expect((await c.decision(q, { referee: PLAYER })).status).toBe(401);
      // declining returns access_denied to the client
      const no = await c.decision(q, { approve: false });
      expect(new URL(no.json.redirect).searchParams.get("error")).toBe("access_denied");
      // the player secret alone grants the player scope only, even where both were requested
      const only = await new Chat(s.base).link("player referee", { player: PLAYER });
      expect(only.ok).toBe(true);
      // the consent page itself states what is being asked and posts nothing by itself
      const page = await c.raw(
        "GET",
        `/oauth/authorize?${c.authorizeQuery({ challenge: "y".repeat(43), scope: "player referee" })}`,
      );
      expect(page.status).toBe(200);
      expect(page.text).toContain("Player secret");
      expect(page.text).toContain("Referee secret");
      expect(page.text).toContain("chat.example");
      expect(
        (
          await c.raw(
            "GET",
            `/oauth/authorize?${new URLSearchParams({ client_id: "bad", redirect_uri: c.redirect })}`,
          )
        ).status,
      ).toBe(400);
      // a cross-origin page cannot post a decision
      expect(
        (await c.decision(q, { player: PLAYER }, { origin: "https://evil.example" })).status,
      ).toBe(403);
    } finally {
      await s.app.close();
    }
  });

  it("enforces PKCE S256, the redirect, the client and single use of a code; a refresh token rotates and cannot be reused", async () => {
    const s = await serve();
    try {
      const a = new Chat(s.base);
      const linked = await a.link("player", { player: PLAYER });
      expect(linked.ok).toBe(true);
      if (!linked.ok || !linked.code) throw new Error("not linked");
      const base = {
        grant_type: "authorization_code",
        client_id: a.clientId,
        code: linked.code,
        redirect_uri: a.redirect,
      };
      // the code was already used
      expect((await a.token({ ...base, code_verifier: linked.verifier })).json.error).toBe(
        "invalid_grant",
      );
      // a second code, wrong verifier / redirect / client
      const q = a.authorizeQuery({ challenge: "z".repeat(43), scope: "player" });
      void q;
      const fresh = async () => {
        const pk = await import("../support/chat-client.ts").then((m) => m.pkce());
        const d = await a.decision(a.authorizeQuery({ challenge: pk.challenge, scope: "player" }), {
          player: PLAYER,
        });
        return { code: new URL(d.json.redirect).searchParams.get("code")!, verifier: pk.verifier };
      };
      let f = await fresh();
      expect(
        (await a.token({ ...base, code: f.code, code_verifier: "w".repeat(50) })).json.error,
      ).toBe("invalid_grant");
      f = await fresh();
      expect(
        (
          await a.token({
            ...base,
            code: f.code,
            code_verifier: f.verifier,
            redirect_uri: "https://evil.example/cb",
          })
        ).json.error,
      ).toBe("invalid_grant");
      f = await fresh();
      const other = new Chat(s.base);
      await other.register();
      expect(
        (
          await a.token({
            ...base,
            code: f.code,
            code_verifier: f.verifier,
            client_id: other.clientId,
          })
        ).json.error,
      ).toBe("invalid_grant");
      f = await fresh();
      expect((await a.token({ ...base, code: f.code, code_verifier: f.verifier })).status).toBe(
        200,
      );
      // refresh: a new pair, and the old refresh token is spent
      const r1 = await a.token({
        grant_type: "refresh_token",
        client_id: a.clientId,
        refresh_token: a.refresh,
      });
      expect(r1.status).toBe(200);
      expect(r1.json.scope).toBe("player");
      expect(
        (
          await a.token({
            grant_type: "refresh_token",
            client_id: a.clientId,
            refresh_token: a.refresh,
          })
        ).json.error,
      ).toBe("invalid_grant");
      expect((await a.token({ grant_type: "password", client_id: a.clientId })).json.error).toBe(
        "unsupported_grant_type",
      );
    } finally {
      await s.app.close();
    }
  });

  it("an access token expires, is audience-bound to this endpoint, and dies when a lane secret is rotated", async () => {
    let t = 1_000_000;
    const s = await serve({ now: () => t });
    try {
      const a = new Chat(s.base);
      expect((await a.link("player", { player: PLAYER })).ok).toBe(true);
      expect((await a.rpc("ping")).status).toBe(400); // no session yet: the header is required
      await a.init({});
      expect((await a.rpc("ping")).status).toBe(200);
      t += 61 * 60_000;
      expect((await a.rpc("ping")).status).toBe(401);
      // refresh yields a working token again (refresh lives for days)
      const r = await a.token({
        grant_type: "refresh_token",
        client_id: a.clientId,
        refresh_token: a.refresh,
      });
      a.access = r.json.access_token;
      // the idle session itself has lapsed; a new one is initialized
      expect((await a.rpc("ping")).status).toBe(404);
      await a.init({});
      expect((await a.rpc("ping")).status).toBe(200);
    } finally {
      await s.app.close();
    }
    // the same token under a server whose lane secrets differ is rejected: the signing key derives from both secrets
    const one = await serve();
    const other = await serve({}, { playerToken: "another-player-secret-0123456789-abcdefghijk" });
    try {
      const a = new Chat(one.base);
      await a.link("player", { player: PLAYER });
      const b = new Chat(other.base);
      b.access = a.access;
      b.clientId = a.clientId;
      expect((await b.rpc("ping")).status).toBe(401);
    } finally {
      await one.app.close();
      await other.app.close();
    }
  });
});

describe("MECHANISM: the MCP transport", () => {
  it("requires initialization, a known session, the session's own client and a same-origin caller; lists only the tools its scopes allow", async () => {
    const s = await serve();
    try {
      const a = new Chat(s.base);
      expect((await a.link("player", { player: PLAYER })).ok).toBe(true);
      // no session
      expect((await a.rpc("tools/list")).status).toBe(400);
      // an under-specified initialize is refused
      const bad = await a.rpc("initialize", { protocolVersion: "2025-06-18" });
      expect(bad.json.error.code).toBe(-32602);
      await a.init({});
      // a request under another host name (DNS rebinding) is refused before anything else
      expect(await withHost(s.base, "/mcp", "evil.example", a.headers())).toBe(421);
      // a browser origin that is not the service's own may not use the endpoint
      expect((await a.rpc("ping", {}, undefined, { origin: "https://evil.example" })).status).toBe(
        403,
      );
      const listed = await a.rpc("tools/list");
      const names: string[] = listed.json.result.tools.map((x: any) => x.name).sort();
      expect(names).toEqual(
        [
          "cancel_action",
          "await_action",
          "collect",
          "continue_collection",
          "finish_collection",
          "cease_collection",
          "observe_surroundings",
          "read_current_observation_glance",
          "reconcile_last_action",
          "settle_collection_lapse",
          "propose_original_setting",
          "original_setting_status",
          "resume_original_setting",
        ].sort(),
      );
      // there is no tool that can reply to a prompt or confirm: no property of any tool is a reply, answer, confirm or challenge
      for (const tool of listed.json.result.tools)
        for (const key of Object.keys(tool.inputSchema.properties ?? {}))
          expect(key).not.toMatch(
            /reply|confirm|answer|challenge|phrase|text|token|secret|path|campaign|role|permission/,
          );
      // a referee tool is unknown to a player-only token
      const refused = await a.call("referee_list_tasks", { host_id: "gm-setup" });
      expect(refused.json.error.code).toBe(-32602);
      // an unknown session id is a 404, and another client's token cannot use it
      const stray = new Chat(s.base);
      expect((await stray.link("player", { player: PLAYER })).ok).toBe(true);
      stray.session = a.session;
      expect((await stray.rpc("tools/list")).status).toBe(404);
      a.session = "0".repeat(48);
      expect((await a.rpc("tools/list")).status).toBe(404);
      // a request before notifications/initialized is refused
      const b = new Chat(s.base);
      await b.link("player", { player: PLAYER });
      const init = await b.rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "x", version: "1" },
      });
      b.session = init.headers.get("mcp-session-id")!;
      expect((await b.rpc("tools/list")).json.error.code).toBe(-32002);
    } finally {
      await s.app.close();
    }
  });

  it("a token with both scopes lists the three referee tools too, each under its own scope", async () => {
    const s = await serve();
    try {
      const a = new Chat(s.base);
      expect((await a.link("player referee", { player: PLAYER, referee: REFEREE })).ok).toBe(true);
      await a.init({});
      const names: string[] = (await a.rpc("tools/list")).json.result.tools.map((x: any) => x.name);
      for (const n of ["referee_list_tasks", "referee_get_task", "referee_submit_decision"])
        expect(names).toContain(n);
      // a referee-only grant lists no player tool
      const r = new Chat(s.base);
      expect((await r.link("referee", { referee: REFEREE })).ok).toBe(true);
      await r.init({});
      const rn: string[] = (await r.rpc("tools/list")).json.result.tools.map((x: any) => x.name);
      expect(rn.sort()).toEqual([
        "referee_get_task",
        "referee_list_tasks",
        "referee_submit_decision",
      ]);
      expect((await r.call("collect", { amount: 1 })).json.error.code).toBe(-32602);
    } finally {
      await s.app.close();
    }
  });
});

describe("MECHANISM: a model-side caller can never confirm; the confirmation is the human's", () => {
  it("collect proposes; the arguments are the amount only; extra arguments, a missing scenario and a second run are refused", async () => {
    const [cli, stub] = stubCli();
    const s = await withChat({ runCli: cli });
    try {
      for (const extra of [
        { amount: 2, confirmed: true },
        { amount: 2, reply: "yes" },
        { amount: 2, world: "other" },
        { amount: 0 },
        { amount: 1.5 },
        { amount: "3" },
        {},
      ])
        expect((await s.chat.call("collect", extra)).isError).toBe(true);
      expect(stub.argvs).toEqual([]);
      const started = await s.chat.call("collect", { amount: 3 });
      expect(started.isError).toBe(false);
      expect(started.data.state).toBe("AWAITING_CONFIRMATION");
      // the engine's argument vector came from configuration and the scenario file, not from the model
      const argv = stub.argvs[0]!;
      expect(argv.slice(0, 1)).toEqual(["collect"]);
      expect(argv).toContain("--amount");
      expect(argv[argv.indexOf("--amount") + 1]).toBe("3");
      expect(argv[argv.indexOf("--world") + 1]).toBe("world-test");
      expect(argv[argv.indexOf("--campaign") + 1]).toBe("/data/campaign");
      // one action at a time
      expect((await s.chat.call("collect", { amount: 1 })).isError).toBe(true);
      expect((await s.chat.call("observe_surroundings")).isError).toBe(true);
      expect(stub.argvs).toHaveLength(1);
    } finally {
      await s.app.close();
    }
  });

  it("the model never sees the challenge phrase, the human's typed reply or audit progress; a client without elicitation is pointed at the confirm page and nothing is confirmed", async () => {
    const [cli, stub] = stubCli();
    const s = await withChat({ runCli: cli }, undefined, {}); // a client that declared no elicitation
    try {
      const started = await s.chat.call("collect", { amount: 2 });
      expect(started.data.state).toBe("AWAITING_CONFIRMATION");
      expect(started.data.confirm_page).toBe(`${s.config.publicUrl}/confirm`);
      const seen =
        JSON.stringify(started.result) +
        JSON.stringify((await s.chat.call("await_action", { wait_seconds: 1 })).result);
      expect(seen).not.toContain(stub.phrases[0]!);
      expect(seen).not.toContain("PROGRESS");
      expect(seen).toContain("PROPOSAL collect");
      // waiting, however long, confirms nothing
      const again = await s.chat.call("await_action", { wait_seconds: 1 });
      expect(again.data.state).toBe("AWAITING_CONFIRMATION");
      expect(again.elicited).toEqual([]);
      // the assistant can only withdraw: that is a decline
      expect((await s.chat.call("cancel_action")).isError).toBe(false);
      const done = await s.chat.call("await_action", { wait_seconds: 2 });
      expect(done.data.state).toBe("FINISHED");
      expect(JSON.stringify(done.data.engine_report)).toContain("STATUS DECLINED");
      expect(JSON.stringify(done.data.engine_report)).not.toContain("COMMITTED");
    } finally {
      await s.app.close();
    }
  });

  it("an elicitation reaches the human with the full proposal and phrase; only an exact, accepted reply commits; a wrong phrase, a decline, a dismissal and silence do not", async () => {
    const [cli, stub] = stubCli();
    const s = await withChat({ runCli: cli, chat: { elicitMs: 400 } });
    try {
      const run = async (human: Human | undefined) => {
        const started = await s.chat.call("collect", { amount: 1 });
        expect(started.data.state).toBe("AWAITING_CONFIRMATION");
        const followed = await s.chat.call("await_action", { wait_seconds: 5 }, human);
        return followed;
      };
      // the exact phrase, typed by the human through the client's own surface
      let r = await run(humanConfirms);
      expect(r.stream).toBe(true);
      expect(phraseOf(r.elicited[0]!.message)).toBe(stub.phrases[0]);
      expect(r.elicited[0]!.message).toContain("PROPOSAL collect");
      expect(r.data.state).toBe("FINISHED");
      expect(JSON.stringify(r.data.engine_report)).toContain("STATUS COMMITTED");
      expect(JSON.stringify(r.result)).not.toContain(stub.phrases[0]!);
      // a wrong phrase
      r = await run(() => ({ action: "accept", content: { reply: "collect 000000000000" } }));
      expect(JSON.stringify(r.data.engine_report)).toContain("STATUS DECLINED");
      // an explicit decline, then a dismissal
      r = await run(humanDeclines);
      expect(JSON.stringify(r.data.engine_report)).toContain("STATUS DECLINED");
      r = await run(() => ({ action: "cancel" }));
      expect(JSON.stringify(r.data.engine_report)).toContain("STATUS DECLINED");
      // silence: the elicitation times out; the proposal stays pending and is NOT confirmed
      const started = await s.chat.call("collect", { amount: 1 });
      expect(started.data.state).toBe("AWAITING_CONFIRMATION");
      const silent = await s.chat.call("await_action", { wait_seconds: 5 }, () => null);
      expect(silent.data.state).toBe("AWAITING_CONFIRMATION");
      expect(JSON.stringify(silent.data.engine_report)).not.toContain("COMMITTED");
    } finally {
      await s.app.close();
    }
  });

  it("a phrase from an earlier proposal does not confirm a later one (fresh, subject-bound, single use)", async () => {
    const [cli, stub] = stubCli();
    const s = await withChat({ runCli: cli });
    try {
      await s.chat.call("collect", { amount: 1 });
      const first = await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
      expect(JSON.stringify(first.data.engine_report)).toContain("COMMITTED");
      await s.chat.call("collect", { amount: 1 });
      const replay = await s.chat.call("await_action", { wait_seconds: 5 }, () => ({
        action: "accept",
        content: { reply: stub.phrases[0]! },
      }));
      expect(stub.phrases[0]).not.toBe(stub.phrases[1]);
      expect(JSON.stringify(replay.data.engine_report)).toContain("DECLINED");
      expect(JSON.stringify(replay.data.engine_report)).not.toContain("COMMITTED");
    } finally {
      await s.app.close();
    }
  });

  it("the confirm page: only the player who holds the player secret can answer; the assistant's token cannot reach the reply path", async () => {
    const [cli, stub] = stubCli();
    const s = await withChat({ runCli: cli }, undefined, {});
    try {
      const started = await s.chat.call("collect", { amount: 2 });
      expect(started.data.state).toBe("AWAITING_CONFIRMATION");
      // the assistant's bearer is not a session: the lane's reply path refuses it
      const viaBearer = await s.chat.raw(
        "POST",
        "/api/play/reply",
        { prompt_id: "x", text: stub.phrases[0] ?? "x" },
        { authorization: `Bearer ${s.chat.access}` },
      );
      expect(viaBearer.status).toBe(401);
      expect(
        (
          await s.chat.raw("GET", "/api/play/poll?after=0", undefined, {
            authorization: `Bearer ${s.chat.access}`,
          })
        ).status,
      ).toBe(401);
      // the page without a session offers only a sign-in; with one it shows the proposal and the prompt
      const anon = await s.chat.raw("GET", "/confirm");
      expect(anon.text).toContain("Player secret");
      expect(anon.text).not.toContain("collect ");
      const human = new Browser(s.base);
      expect(
        (await human.login("player", "wrong-secret-0123456789-abcdefghijklmnopqrstuv")).status,
      ).toBe(401);
      expect((await human.login("player", PLAYER)).status).toBe(200);
      const page = await human.req("GET", "/confirm");
      expect(page.text).toContain("Confirm your choice");
      const step = await human.untilPrompt("play");
      expect(step.seen.map((l: any) => l.text).join("\n")).toContain(
        `type exactly "${stub.phrases[0]}"`,
      );
      const wrong = await human.req("POST", "/api/play/reply", {
        prompt_id: "stale",
        text: stub.phrases[0],
      });
      expect(wrong.status).toBe(409);
      expect(
        (
          await human.req("POST", "/api/play/reply", {
            prompt_id: step.snap.pending.id,
            text: stub.phrases[0],
          })
        ).status,
      ).toBe(200);
      const done = await s.chat.call("await_action", { wait_seconds: 5 });
      expect(done.data.state).toBe("FINISHED");
      expect(JSON.stringify(done.data.engine_report)).toContain("COMMITTED");
      // the replies the human typed never appear in anything the assistant is given
      expect(JSON.stringify(done.result)).not.toContain(stub.phrases[0]!);
    } finally {
      await s.app.close();
    }
  });
});

describe("MECHANISM: orchestration without deadlock, and no blind retry", () => {
  it("one assistant answers the referee task its own proposal raised, between two of its own calls, and the command continues", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const [cli, stub] = stubCli({ gate });
    const submitted: any[] = [];
    const s = await withChat(
      {
        runCli: cli,
        chat: {
          callReferee: async (_c, body) => {
            if (body["tool"] === "referee_submit_decision") {
              submitted.push(body);
              release();
            }
            return {
              status: 200,
              result: {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      tool: body["tool"],
                      tasks: [{ task_id: "a".repeat(64) }],
                    }),
                  },
                ],
              },
            };
          },
        },
      },
      { scope: "player referee", player: PLAYER, referee: REFEREE },
    );
    try {
      const started = await s.chat.call("collect", { amount: 1 });
      expect(started.data.state).toBe("RUNNING"); // the engine is waiting for a referee reading, and the call returned
      expect(started.data.waiting).toMatch(/referee_list_tasks/);
      const t0 = Date.now();
      const quiet = await s.chat.call("await_action", { wait_seconds: 1 });
      expect(quiet.data.state).toBe("RUNNING");
      expect(Date.now() - t0).toBeLessThan(5000); // bounded: it did not hold the host until the engine finished
      // the same assistant now serves the referee side
      const tasks = await s.chat.call("referee_list_tasks", { host_id: "gm-setup" });
      expect(tasks.isError).toBe(false);
      const sub = await s.chat.call("referee_submit_decision", {
        host_id: "gm-setup",
        task_id: "a".repeat(64),
        answer: { task_id: "a".repeat(64), items: [] },
      });
      expect(sub.isError).toBe(false);
      expect(submitted).toHaveLength(1);
      expect(submitted[0].arguments.answer).toEqual({ task_id: "a".repeat(64), items: [] });
      // and only now the human is asked
      const done = await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
      expect(done.data.state).toBe("FINISHED");
      expect(stub.phrases).toHaveLength(1);
      // bad referee requests are refused before any exchange
      for (const bad of [{ host_id: "gm-other" }, { host_id: "gm-setup", extra: 1 }, {}])
        expect((await s.chat.call("referee_list_tasks", bad)).isError).toBe(true);
    } finally {
      await s.app.close();
    }
  });

  it("a command that ends in an exception is reported as UNCERTAIN, never as 'nothing was confirmed'; nothing else may start until the owner-backed reconcile has run; then play resumes", async () => {
    const [cli, stub] = stubCli({ crashAfterConfirm: true });
    const s = await withChat({ runCli: cli });
    try {
      const started = await s.chat.call("collect", { amount: 1 });
      expect(started.data.run_id).toBeTruthy();
      // the human confirms; the (stand-in) owner write happens; THEN the command throws
      const done = await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
      expect(done.data.state).toBe("FINISHED");
      expect(done.data.outcome).toBe("UNCERTAIN");
      expect(done.data.recovery).toMatch(/reconcile_last_action/);
      const report = JSON.stringify(done.data.engine_report);
      expect(report).toContain("UNKNOWN");
      expect(report).toContain("STATUS COMMITTED"); // what the engine itself had already said is not hidden
      expect(report).not.toContain("nothing was confirmed");
      // no blind retry of this or any other action
      for (const again of [
        "collect",
        "observe_surroundings",
        "cease_collection",
        "finish_collection",
      ]) {
        const r = await s.chat.call(again, again === "collect" ? { amount: 1 } : {});
        expect(r.isError, again).toBe(true);
        expect(r.text).toMatch(/UNCERTAIN/);
      }
      expect(stub.argvs.map((a) => a[0])).toEqual(["collect"]);
      // the owner-backed reconcile is the way out, and it is a shipped command
      const rec = await s.chat.call("reconcile_last_action");
      expect(rec.isError).toBe(false);
      expect(rec.data.action).toBe("reconcile");
      const reconciled = await s.chat.call("await_action", { wait_seconds: 5 });
      expect(reconciled.data.state).toBe("FINISHED");
      expect(reconciled.data.exit_code).toBe(0);
      expect(reconciled.data.outcome).toBeUndefined();
      // play resumes
      expect((await s.chat.call("observe_surroundings")).isError).toBe(false);
      // the follow-up tool names a stale run: refused
      expect((await s.chat.call("await_action", { run_id: "0".repeat(16) })).isError).toBe(true);
    } finally {
      await s.app.close();
    }
  });

  it("a crash before any prompt is just as uncertain (nothing can establish that nothing was committed)", async () => {
    const [cli] = stubCli({ crash: true });
    const s = await withChat({ runCli: cli });
    try {
      await s.chat.call("collect", { amount: 1 });
      const done = await s.chat.call("await_action", { wait_seconds: 3 });
      expect(done.data.state).toBe("FINISHED");
      expect(done.data.outcome).toBe("UNCERTAIN");
      expect(JSON.stringify(done.data.engine_report)).not.toContain("nothing was confirmed");
    } finally {
      await s.app.close();
    }
  });

  it("without a configured scenario the collection is refused with the exact gap and nothing is started; look-around needs the character only", async () => {
    const [cli, stub] = stubCli();
    const s = await serve({ runCli: cli }, {}, null);
    try {
      const chat = new Chat(s.base);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({});
      const r = await chat.call("collect", { amount: 1 });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/scenario is not configured/);
      expect((await chat.call("observe_surroundings")).isError).toBe(true);
      // the opaque glance refusal: no host id configured
      const g = await chat.call("read_current_observation_glance");
      expect(g.isError).toBe(true);
      expect(g.text).toMatch(/Nothing is available/);
      expect(stub.argvs).toEqual([]);
    } finally {
      await s.app.close();
    }
  });
});

describe("MECHANISM: the SHIPPED observe-surroundings, the real referee exchange and the earned Glance behind the ordinary-chat endpoint", () => {
  it("the assistant proposes a look; serves the engine's real task through the referee tools between its own calls; the human confirms through the client's elicitation; the earned presentation is read back; nothing was supplied by the model side", async () => {
    const dirs = (await observationCampaign()).dirs;
    const dir = tempDir("immortalis-chat-real-");
    const scenarioFile = join(dir, "chat-scenario.json");
    writeFileSync(scenarioFile, JSON.stringify({ ...SCENARIO, player_character: PC_ID }));
    const config = await chatConfig({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      refereeHostIds: [HOST_ID],
      scenarioFile,
      setupDir: join(dir, "setup"),
      playerViewHostId: "glance-host",
    });
    const app = createPhoneServer(config, { pollMs: 300 });
    await app.listen();
    try {
      const chat = new Chat(`http://127.0.0.1:${config.port}`);
      expect((await chat.link("player referee", { player: PLAYER, referee: REFEREE })).ok).toBe(
        true,
      );
      await chat.init({ elicitation: {} });

      // nothing earned yet: the glance is the one opaque refusal
      const before = await chat.call("read_current_observation_glance");
      expect(before.isError).toBe(true);

      const started = await chat.call("observe_surroundings");
      expect(started.isError, started.text).toBe(false);

      // the shipped command asks for the human's confirmation FIRST: the client asks the human; the real challenge phrase is shown to them only
      const confirmed = await chat.call("await_action", { wait_seconds: 20 }, humanConfirms);
      expect(confirmed.elicited).toHaveLength(1);
      const phrase = phraseOf(confirmed.elicited[0]!.message);
      expect(phrase).toMatch(/^observe-surroundings /);
      expect(JSON.stringify(confirmed.result)).not.toContain(phrase);
      expect(confirmed.data.state).toBe("RUNNING"); // the engine now waits for a referee reading, and the call returned

      // the SAME assistant now serves the referee side: it reads the engine's real task and gives its own reading (a scripted policy here)
      const policy = observationPolicy();
      let answered = 0;
      let done: Awaited<ReturnType<typeof chat.call>> | undefined;
      for (let i = 0; i < 40 && done?.data?.state !== "FINISHED"; i++) {
        const listed = await chat.call("referee_list_tasks", { host_id: HOST_ID });
        const tasks: { task_id: string }[] = JSON.parse(listed.text ?? "{}").tasks ?? [];
        for (const t of tasks) {
          const got = await chat.call("referee_get_task", { host_id: HOST_ID, task_id: t.task_id });
          const doc = JSON.parse(got.text!);
          const answer = policy(doc.document ?? doc);
          if (answer === null) continue;
          const sub = await chat.call("referee_submit_decision", {
            host_id: HOST_ID,
            task_id: t.task_id,
            answer,
            claimed_model: "scripted-test-policy (NOT an AI)",
          });
          expect(sub.isError, sub.text).toBe(false);
          answered++;
        }
        // between its referee calls the assistant follows its own proposal (bounded waits; the human is never asked again)
        done = await chat.call("await_action", { wait_seconds: 2 });
        expect(done.elicited).toEqual([]);
      }
      expect(answered).toBeGreaterThan(0);
      expect(done?.data.state, done?.text).toBe("FINISHED");
      expect(done?.data.exit_code).toBe(0);
      expect(JSON.stringify(done?.data.engine_report)).toContain("STATUS ");
      expect(JSON.stringify(done?.result)).not.toContain(phrase);

      // the engine's own earned presentation, through the existing player-view transport
      const glance = await chat.call("read_current_observation_glance");
      expect(glance.isError, glance.text).toBe(false);
      expect(glance.text).toBeTruthy();

      // a second proposal that the human declines changes nothing
      const keysBefore = await factsOf(dirs.campaignDir);
      const second = await chat.call("observe_surroundings");
      expect(second.isError).toBe(false);
      let declined = await chat.call("await_action", { wait_seconds: 20 }, humanDeclines);
      for (let i = 0; i < 10 && declined.data.state !== "FINISHED"; i++)
        declined = await chat.call("await_action", { wait_seconds: 5 }, humanDeclines);
      expect(declined.data.state).toBe("FINISHED");
      expect(JSON.stringify(declined.data.engine_report)).not.toMatch(/COMMITTED|ESTABLISHED/);
      expect(await factsOf(dirs.campaignDir)).toEqual(keysBefore);
    } finally {
      await app.close();
    }
  }, 240_000);
});

describe("static scope of the ordinary-chat adapter", () => {
  const read = (f: string) => readFileSync(join("apps/phone/src", f), "utf8");
  it("has exactly one path from the client's elicitation answer to a prompt, and no tool, process, file or provider surface", () => {
    const tools = read("chat-tools.ts");
    const mcp = read("mcp-http.ts");
    const oauth = read("oauth.ts");
    // the only place a prompt is answered from the MCP side is the human's elicitation reply
    expect(tools.match(/\.terminal\.reply\(/g) ?? []).toHaveLength(1);
    expect(tools).toMatch(/asked\.action === "accept"/);
    expect(mcp).not.toMatch(/\.reply\(|terminal/);
    // no process, shell, provider or network client in any of the three modules; only the OAuth module writes, and only an
    // exclusive-create marker for a spent grant
    for (const code of [tools, mcp, oauth])
      expect(code).not.toMatch(
        /child_process|execSync|execFile|spawn|fetch\(|anthropic|openai|@modelcontextprotocol|XMLHttpRequest|eval\(|new Function/i,
      );
    for (const code of [tools, mcp]) expect(code).not.toMatch(/writeFile/);
    expect(oauth.match(/writeFileSync\(/g) ?? []).toHaveLength(1);
    expect(oauth).toMatch(/flag: "wx"/);
    // the model-supplied arguments never name a campaign, path, role, permission, identity, time, owner key or confirmation
    expect(tools).not.toMatch(/args\["(campaign|path|role|permission|confirm|reply|time|key)/);
  });
});

describe("MECHANISM (BLUE R1): spent OAuth grants stay spent across a restart", () => {
  it("a redeemed code and a rotated refresh token are refused after the process is recreated; the unspent refresh and a new consent still work; concurrent redemption spends once", async () => {
    const s = await serve();
    let app2: ReturnType<typeof createPhoneServer> | undefined;
    try {
      const a = new Chat(s.base);
      await a.register();
      const redeem = async () => {
        const { verifier, challenge } = pkce();
        const d = await a.decision(a.authorizeQuery({ challenge, scope: "player" }), {
          player: PLAYER,
        });
        const code = new URL(d.json.redirect).searchParams.get("code")!;
        return { code, verifier };
      };
      const form = (c: { code: string; verifier: string }) => ({
        grant_type: "authorization_code",
        client_id: a.clientId,
        code: c.code,
        redirect_uri: a.redirect,
        code_verifier: c.verifier,
      });
      // a code is redeemed once; its first refresh token is rotated away
      const spent = await redeem();
      const t1 = await a.token(form(spent));
      expect(t1.status).toBe(200);
      const oldRefresh: string = t1.json.refresh_token;
      const t2 = await a.token({
        grant_type: "refresh_token",
        client_id: a.clientId,
        refresh_token: oldRefresh,
      });
      expect(t2.status).toBe(200);
      const liveRefresh: string = t2.json.refresh_token;
      // the same instance refuses both replays
      expect((await a.token(form(spent))).status).toBe(400);
      expect(
        (
          await a.token({
            grant_type: "refresh_token",
            client_id: a.clientId,
            refresh_token: oldRefresh,
          })
        ).status,
      ).toBe(400);
      // an unredeemed code that was never used is still usable after the restart (it is not spent)
      const unused = await redeem();

      // the process is lost and recreated with identical configuration
      await s.app.close();
      app2 = createPhoneServer(s.config, { pollMs: 300 });
      await app2.listen();

      // NEGATIVES: nothing spent revives
      expect((await a.token(form(spent))).json.error).toBe("invalid_grant");
      expect(
        (
          await a.token({
            grant_type: "refresh_token",
            client_id: a.clientId,
            refresh_token: oldRefresh,
          })
        ).json.error,
      ).toBe("invalid_grant");
      // POSITIVES: the rotated, unspent refresh token continues the grant — exactly once
      const t3 = await a.token({
        grant_type: "refresh_token",
        client_id: a.clientId,
        refresh_token: liveRefresh,
      });
      expect(t3.status).toBe(200);
      expect(
        (
          await a.token({
            grant_type: "refresh_token",
            client_id: a.clientId,
            refresh_token: liveRefresh,
          })
        ).status,
      ).toBe(400);
      // a never-redeemed code, and a brand-new consent, still work
      expect((await a.token(form(unused))).status).toBe(200);
      const fresh = await new Chat(s.base).link("player", { player: PLAYER });
      expect(fresh.ok).toBe(true);
      // the access token issued before the restart is still valid (the signing key derives from the lane secrets), its session is not
      const before = new Chat(s.base);
      before.access = t1.json.access_token;
      expect((await before.rpc("ping")).status).toBe(400);

      // CONCURRENCY: the same code redeemed by many requests at once spends exactly once
      const race = await redeem();
      const results = await Promise.all(Array.from({ length: 8 }, () => a.token(form(race))));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(7);
      // and the same for one refresh token
      const racer = (await a.token(form(await redeem()))).json.refresh_token as string;
      const refreshes = await Promise.all(
        Array.from({ length: 8 }, () =>
          a.token({ grant_type: "refresh_token", client_id: a.clientId, refresh_token: racer }),
        ),
      );
      expect(refreshes.filter((r) => r.status === 200)).toHaveLength(1);
    } finally {
      await s.app.close();
      await app2?.close();
    }
  });

  it("a redemption that cannot be recorded is refused (fail closed), not granted", async () => {
    // the operator directory is a regular file: no marker can be created
    const dir = tempDir("immortalis-chat-nostate-");
    const blocker = join(dir, "not-a-directory");
    writeFileSync(blocker, "x");
    const s = await serve({}, { operatorDir: blocker });
    try {
      const a = new Chat(s.base);
      const linked = await a.link("player", { player: PLAYER });
      expect(linked.ok).toBe(false);
      expect(JSON.stringify(linked)).toContain("invalid_grant");
    } finally {
      await s.app.close();
    }
  });
});

describe("MECHANISM (BLUE R2): a question is answered only under the authorization that asked it", () => {
  it("a referee-only grant of the SAME registered client cannot answer, use or end a player session's elicitation; the authorized human still can, across a refresh", async () => {
    const [cli, stub] = stubCli();
    const s = await serve({ runCli: cli, chat: { elicitMs: 1500 } });
    try {
      const player = new Chat(s.base);
      expect((await player.link("player", { player: PLAYER })).ok).toBe(true);
      await player.init({ elicitation: {} });
      // the same registered client, a different authorization with the OTHER scope only
      const ref = new Chat(s.base);
      ref.clientId = player.clientId;
      expect((await ref.link("referee", { referee: REFEREE })).ok).toBe(true);

      const forge = (id: string, phrase: string) =>
        fetch(`${s.base}/mcp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...ref.headers({ "mcp-session-id": player.session }),
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { action: "accept", content: { reply: phrase } },
          }),
        });

      // 1. the forged answer arrives while the player's question is open, and the human then stays silent
      expect((await player.call("collect", { amount: 1 })).data.state).toBe(
        "AWAITING_CONFIRMATION",
      );
      const forged: number[] = [];
      const silent = await player.call("await_action", { wait_seconds: 5 }, async (e) => {
        forged.push((await forge("elicit-0", phraseOf(e.message))).status);
        return null; // the human says nothing
      });
      expect(forged).toEqual([404]);
      expect(silent.data.state).toBe("AWAITING_CONFIRMATION");
      expect(JSON.stringify(silent.data.engine_report)).not.toContain("COMMITTED");

      // 2. the referee-only token cannot use the player's session at all, nor end it
      const asRef = await ref.rpc("tools/list", {}, undefined, {
        "mcp-session-id": player.session,
      });
      expect(asRef.status).toBe(404);
      const del = await fetch(`${s.base}/mcp`, {
        method: "DELETE",
        headers: ref.headers({ "mcp-session-id": player.session }),
      });
      expect(del.status).toBe(404);
      expect((await player.rpc("ping")).status).toBe(200);

      // 3. the authorized human answers (here after the player's grant refreshed its access token): that works
      const answered = await player.call("await_action", { wait_seconds: 5 }, async (e) => {
        const t = await player.token({
          grant_type: "refresh_token",
          client_id: player.clientId,
          refresh_token: player.refresh,
        });
        player.access = t.json.access_token;
        player.refresh = t.json.refresh_token;
        return { action: "accept", content: { reply: phraseOf(e.message) } };
      });
      expect(answered.data.state).toBe("FINISHED");
      expect(JSON.stringify(answered.data.engine_report)).toContain("STATUS COMMITTED");
      expect(stub.phrases).toHaveLength(1);

      // 4. a replayed answer to a question that is already closed does nothing
      const replay = await fetch(`${s.base}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", ...player.headers() },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "elicit-0",
          result: { action: "accept", content: { reply: stub.phrases[0] } },
        }),
      });
      expect(replay.status).toBe(202);
      expect(stub.argvs).toHaveLength(1);
    } finally {
      await s.app.close();
    }
  });

  it("a deliberately dual-scoped grant keeps working: one assistant asks, the human answers, and it serves the referee side", async () => {
    const [cli] = stubCli();
    const s = await withChat(
      { runCli: cli },
      { scope: "player referee", player: PLAYER, referee: REFEREE },
    );
    try {
      await s.chat.call("collect", { amount: 1 });
      const done = await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
      expect(done.data.state).toBe("FINISHED");
      expect(
        (await s.chat.call("referee_list_tasks", { host_id: "gm-setup" })).json.error,
      ).toBeUndefined();
    } finally {
      await s.app.close();
    }
  });
});

describe("MECHANISM (BLUE R3): a failure after the human's confirmation and the owner's commit is UNCERTAIN, and recovery is the owner-backed reconcile", () => {
  it("the SHIPPED observe-surroundings commits, then the process step throws: the report is UNCERTAIN, nothing else may start, reconcile reads back what committed, and play resumes with no duplicate consequence", async () => {
    const dirs = (await observationCampaign()).dirs;
    const dir = tempDir("immortalis-chat-r3-");
    const scenarioFile = join(dir, "chat-scenario.json");
    writeFileSync(scenarioFile, JSON.stringify({ ...SCENARIO, player_character: PC_ID }));
    const config = await chatConfig({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      refereeHostIds: [HOST_ID],
      scenarioFile,
      setupDir: join(dir, "setup"),
    });
    let failed = false;
    const app = createPhoneServer(config, {
      pollMs: 300,
      // the real command runs to completion and commits; the failure then arrives from the process around it
      runCli: async (argv, env) => {
        const code = await runCli(argv, env);
        if (argv[0] === "observe-surroundings" && !failed) {
          failed = true;
          throw new Error("failure after the commit");
        }
        return code;
      },
    });
    await app.listen();
    try {
      const chat = new Chat(`http://127.0.0.1:${config.port}`);
      expect((await chat.link("player referee", { player: PLAYER, referee: REFEREE })).ok).toBe(
        true,
      );
      await chat.init({ elicitation: {} });
      expect((await chat.call("observe_surroundings")).isError).toBe(false);
      const confirmed = await chat.call("await_action", { wait_seconds: 20 }, humanConfirms);
      expect(confirmed.elicited).toHaveLength(1);

      // the same assistant serves the engine's real referee task until the command ends
      const policy = observationPolicy();
      let done: Awaited<ReturnType<typeof chat.call>> | undefined;
      for (let i = 0; i < 40 && done?.data?.state !== "FINISHED"; i++) {
        const listed = await chat.call("referee_list_tasks", { host_id: HOST_ID });
        for (const t of (JSON.parse(listed.text ?? "{}").tasks ?? []) as { task_id: string }[]) {
          const got = await chat.call("referee_get_task", { host_id: HOST_ID, task_id: t.task_id });
          const doc = JSON.parse(got.text!);
          const answer = policy(doc.document ?? doc);
          if (answer !== null)
            await chat.call("referee_submit_decision", {
              host_id: HOST_ID,
              task_id: t.task_id,
              answer,
              claimed_model: "scripted-test-policy (NOT an AI)",
            });
        }
        done = await chat.call("await_action", { wait_seconds: 2 });
      }
      expect(failed).toBe(true);
      expect(done?.data.state).toBe("FINISHED");
      expect(done?.data.outcome).toBe("UNCERTAIN");
      expect(JSON.stringify(done?.data.engine_report)).not.toContain("nothing was confirmed");
      expect(JSON.stringify(done?.data.engine_report)).toContain("UNKNOWN");

      // canonical readback (names, versions AND values): the command had completed, so the observation is whole: the affirmative
      // F-014D reading, the event, the sealed packet and provenance, verified by the Epistemic owner - exactly once
      const committed = await factsOf(dirs.campaignDir);
      const readings = [...committed.entries()].filter(
        ([k, v]) =>
          /^referee\/.+\/decision$/.test(k) &&
          JSON.parse(v.slice(v.indexOf(":") + 1)).operation === "F014D_DIRECT_PERCEPTION",
      );
      expect(readings).toHaveLength(1);
      expect(JSON.parse(readings[0]![1].slice(readings[0]![1].indexOf(":") + 1)).verdict).toBe(
        "OBSERVATION_ESTABLISHED",
      );
      const packets = [...committed.keys()].filter((k) => /^access\/.+\/packet\//.test(k));
      expect(packets).toHaveLength(1);
      expect([...committed.keys()].filter((k) => /^access\/.+\/event$/.test(k))).toHaveLength(1);

      // no blind retry of this or any other action
      for (const again of ["observe_surroundings", "cease_collection"]) {
        const r = await chat.call(again);
        expect(r.isError, again).toBe(true);
        expect(r.text).toMatch(/UNCERTAIN/);
      }
      expect(await factsOf(dirs.campaignDir)).toEqual(committed);

      // the existing owner-backed reconcile reads the canonical record and creates no second consequence
      expect((await chat.call("reconcile_last_action")).isError).toBe(false);
      let rec = await chat.call("await_action", { wait_seconds: 20 });
      for (let i = 0; i < 10 && rec.data.state !== "FINISHED"; i++)
        rec = await chat.call("await_action", { wait_seconds: 5 });
      expect(rec.data.state).toBe("FINISHED");
      expect(rec.data.exit_code).toBe(0);
      expect(rec.data.outcome).toBeUndefined();
      expect(await factsOf(dirs.campaignDir)).toEqual(committed);

      // recovery is complete: the engine is not asked again for a decision it already holds, and nothing is duplicated
      const next = await chat.call("observe_surroundings");
      expect(next.isError, next.text).toBe(false);
      let declined = await chat.call("await_action", { wait_seconds: 20 }, humanDeclines);
      for (let i = 0; i < 10 && declined.data.state !== "FINISHED"; i++)
        declined = await chat.call("await_action", { wait_seconds: 5 }, humanDeclines);
      expect(declined.data.state).toBe("FINISHED");
      expect(await factsOf(dirs.campaignDir)).toEqual(committed);
    } finally {
      await app.close();
    }
  }, 240_000);
});

const pendingFile = (c: PhoneConfig) => pendingPath(c);
const MUTATING: [string, any][] = [
  ["collect", { amount: 1 }],
  ["observe_surroundings", {}],
  ["continue_collection", {}],
  ["finish_collection", {}],
  ["cease_collection", {}],
  ["settle_collection_lapse", {}],
];

describe("MECHANISM (BLUE R3-a): the recovery block is a persisted, campaign-bound pending operation", () => {
  it("restart after a lost confirmed outcome keeps every mutation blocked until the SAME operation is resolved from its recorded identity", async () => {
    const [cli] = stubCli({ crashAfterConfirm: true });
    const s = await withChat({ runCli: cli });
    let app2: ReturnType<typeof createPhoneServer> | undefined;
    try {
      await s.chat.call("collect", { amount: 2 });
      const lost = await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
      expect(lost.data.outcome).toBe("UNCERTAIN");
      // the trusted record exists, names the original operation and its arguments, and is owner-only
      const rec = JSON.parse(readFileSync(pendingFile(s.config), "utf8"));
      expect(rec).toMatchObject({
        format: "immortalis-chat-pending-operation",
        campaign_id: s.config.campaignId,
        command: "collect",
        state: "UNCERTAIN",
      });
      expect(rec.options["amount"]).toBe("2");
      expect(rec.run_id).toBe(lost.data.run_id);
      expect(statSync(pendingFile(s.config)).mode & 0o777).toBe(0o600);

      // the process is lost; a healthy one comes back on the same persistent directories
      await s.app.close();
      const [cli2, stub2] = stubCli();
      app2 = createPhoneServer(s.config, { pollMs: 300, recovery: STUB_RECOVERY, runCli: cli2 });
      await app2.listen();
      await s.chat.init({ elicitation: {} });
      for (const [tool, args] of MUTATING) {
        const r = await s.chat.call(tool, args);
        expect(r.isError, tool).toBe(true);
        expect(r.text, tool).toMatch(/UNCERTAIN/);
        expect(r.text, tool).toContain("collect");
        expect(r.text, tool).toContain(rec.run_id);
      }
      expect(stub2.argvs).toEqual([]); // nothing was dispatched on the strength of a forgotten block
      // the SAME operation is resolved (here by the shipped reconcile, for a confirmed-ledger operation), and play resumes
      expect((await s.chat.call("reconcile_last_action")).isError).toBe(false);
      const done = await s.chat.call("await_action", { wait_seconds: 5 });
      expect(done.data.state).toBe("FINISHED");
      expect(done.data.exit_code).toBe(0);
      expect(done.data.outcome).toBeUndefined();
      expect(existsSync(pendingFile(s.config))).toBe(false);
      expect((await s.chat.call("observe_surroundings")).isError).toBe(false);
    } finally {
      await s.app.close();
      await app2?.close();
    }
  });

  it("a server that is lost while an action is still running comes back blocked, with the dispatched operation on record", async () => {
    const never = new Promise<void>(() => undefined); // the command never returns: the process is lost
    const [cli] = stubCli({ gate: never });
    const s = await withChat({ runCli: cli, shutdownMs: 50 });
    let app2: ReturnType<typeof createPhoneServer> | undefined;
    try {
      const started = await s.chat.call("collect", { amount: 3 });
      expect(started.data.state).toBe("RUNNING");
      expect(JSON.parse(readFileSync(pendingFile(s.config), "utf8")).state).toBe("DISPATCHED");
      await s.app.close();
      const [cli2, stub2] = stubCli();
      app2 = createPhoneServer(s.config, { pollMs: 300, recovery: STUB_RECOVERY, runCli: cli2 });
      await app2.listen();
      await s.chat.init({ elicitation: {} });
      for (const [tool, args] of MUTATING)
        expect((await s.chat.call(tool, args)).isError, tool).toBe(true);
      expect(stub2.argvs).toEqual([]);
    } finally {
      await s.app.close();
      await app2?.close();
    }
  });

  it("an unreadable record, or one that cannot be written, never admits an action", async () => {
    // unreadable at startup
    const [cli, stub] = stubCli();
    const s = await serve({ runCli: cli }, {}, SCENARIO);
    await s.app.close();
    writeFileSync(pendingFile(s.config), "{ not json");
    const app = createPhoneServer(s.config, { pollMs: 300, recovery: STUB_RECOVERY, runCli: cli });
    await app.listen();
    try {
      const chat = new Chat(s.base);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({});
      const r = await chat.call("collect", { amount: 1 });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/unreadable/);
      // the reconcile route cannot identify what to resolve: an exact blocker, still blocked
      await chat.call("reconcile_last_action");
      const blocked = await chat.call("await_action", { wait_seconds: 2 });
      expect(blocked.data.outcome).toBe("UNCERTAIN");
      expect(blocked.data.blocker).toMatch(/unreadable|no recoverable/);
      expect((await chat.call("collect", { amount: 1 })).isError).toBe(true);
      expect(stub.argvs.map((a) => a[0])).toEqual([]);
    } finally {
      await app.close();
    }
    // the record cannot be maintained: nothing is dispatched
    const [cli2, stub2] = stubCli();
    const t = await withChat({ runCli: cli2 });
    try {
      mkdirSync(pendingFile(t.config)); // a directory where the record file must go: it cannot be replaced
      const refused = await t.chat.call("collect", { amount: 1 });
      expect(refused.isError).toBe(true);
      expect(refused.text).toMatch(
        /recovery record could not be maintained; nothing was dispatched/,
      );
      expect(stub2.argvs).toEqual([]);
    } finally {
      await t.app.close();
    }
  });
});

describe("MECHANISM (BLUE R3-b): resolution only on owner-side evidence about the ORIGINAL operation", () => {
  it("an engine status of RECONCILIATION_REQUIRED (exit 4, no exception) is uncertain; an unsettled or failed recovery leaves the block, with the exact blocker", async () => {
    for (const bad of [
      { code: 4, status: "RECONCILIATION_REQUIRED" },
      { code: 0, status: "STALE_INTENT" },
      { code: 3, status: "UNAVAILABLE" },
      { code: 0, status: "COLLECTION_OUTCOME_UNKNOWN" },
    ]) {
      const [cli] = stubCli({
        unknownExit: { code: 4, status: "RECONCILIATION_REQUIRED" },
        reconcile: bad,
      });
      const s = await withChat({ runCli: cli });
      try {
        await s.chat.call("collect", { amount: 1 });
        const first = await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
        expect(first.data.exit_code).toBe(4);
        expect(first.data.outcome, JSON.stringify(bad)).toBe("UNCERTAIN"); // no exception was thrown
        expect((await s.chat.call("reconcile_last_action")).isError).toBe(false);
        const tried = await s.chat.call("await_action", { wait_seconds: 5 });
        expect(tried.data.state).toBe("FINISHED");
        expect(tried.data.outcome, JSON.stringify(bad)).toBe("UNCERTAIN");
        expect(tried.data.blocker).toContain(bad.status);
        // and everything stays blocked
        expect((await s.chat.call("collect", { amount: 1 })).isError).toBe(true);
        expect(existsSync(pendingFile(s.config))).toBe(true);
      } finally {
        await s.app.close();
      }
    }
  });

  it("a lapse settlement is recovered by re-presenting it (it derives from canon), and only a COMMITTED status resolves it", async () => {
    for (const [reconcile, resolves] of [
      [{ code: 0, status: "COLLECTION_COMMITTED" }, true],
      [{ code: 0, status: "NOTHING_TO_RECONCILE" }, false],
      [{ code: 3, status: "UNAVAILABLE" }, false],
    ] as const) {
      const [cli, stub] = stubCli({ settleUnknownOnce: true, reconcile });
      const s = await withChat({ runCli: cli });
      try {
        expect((await s.chat.call("settle_collection_lapse")).isError).toBe(false);
        const first = await s.chat.call("await_action", { wait_seconds: 3 });
        expect(first.data.outcome).toBe("UNCERTAIN");
        expect((await s.chat.call("reconcile_last_action")).isError).toBe(false);
        const rec = await s.chat.call("await_action", { wait_seconds: 3 });
        expect(rec.data.state).toBe("FINISHED");
        // the recovery presented THE SAME command again — not the generic reconcile, which proves nothing about a lapse
        expect(stub.argvs.map((a) => a[0])).toEqual([
          "settle-collection-lapse",
          "settle-collection-lapse",
        ]);
        if (resolves) {
          expect(rec.data.outcome).toBeUndefined();
          expect(existsSync(pendingFile(s.config))).toBe(false);
        } else {
          expect(rec.data.outcome, reconcile.status).toBe("UNCERTAIN");
          expect(rec.data.blocker).toContain(reconcile.status);
          expect(existsSync(pendingFile(s.config))).toBe(true);
          expect((await s.chat.call("collect", { amount: 1 })).isError).toBe(true);
        }
      } finally {
        await s.app.close();
      }
    }
  });
});

describe("MECHANISM (BLUE R3-b): an observation is read back from ITS OWN records at its ORIGINAL basis, never cleared by a generic reconcile", () => {
  type Ev = import("../../apps/phone/src/recovery.ts").ObservationEvidence;
  const lostObservation = async (
    evidence: () => Ev,
    cliOpts: Parameters<typeof stubCli>[0] = {},
  ) => {
    const [cli, stub] = stubCli({ crashAfterConfirm: true, ...cliOpts });
    const captured: string[] = [];
    const s = await withChat({
      runCli: cli,
      recovery: {
        captureObservation: async (_c, pc) => {
          captured.push(pc);
          return stubIdentity(pc, 100, "event-original");
        },
        observationEvidence: async (_c, identity) => {
          // the readback is of the ORIGINAL identity captured before dispatch
          expect(identity.event_id).toBe("event-original");
          expect(identity.basis.value).toBe(100);
          return evidence();
        },
      },
    });
    expect((await s.chat.call("observe_surroundings")).isError).toBe(false);
    const lost = await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
    expect(lost.data.outcome).toBe("UNCERTAIN");
    expect(JSON.parse(readFileSync(pendingFile(s.config), "utf8")).identity.event_id).toBe(
      "event-original",
    );
    return { s, stub, captured };
  };

  it("nothing at the original basis, a retained negative, or a verified complete observation resolve it from OWNER evidence, without running any command", async () => {
    for (const kind of ["NONE", "NEGATIVE", "COMPLETE"] as const) {
      const { s, stub } = await lostObservation(() => ({ kind }));
      try {
        expect((await s.chat.call("reconcile_last_action")).isError).toBe(false);
        const done = await s.chat.call("await_action", { wait_seconds: 3 });
        expect(done.data.state).toBe("FINISHED");
        expect(done.data.outcome, kind).toBeUndefined();
        expect(JSON.stringify(done.data.engine_report)).toContain("owner readback");
        expect(stub.argvs.map((a) => a[0])).toEqual(["observe-surroundings"]); // no reconcile, no re-run
        expect(existsSync(pendingFile(s.config))).toBe(false);
      } finally {
        await s.app.close();
      }
    }
  });

  it("an unsupported or unavailable readback stays uncertain with the exact blocker; so does a partial observation the owner cannot complete", async () => {
    // owner readback unavailable
    let { s } = await lostObservation(() => ({
      kind: "UNAVAILABLE",
      detail: "the campaign did not open: LOCKED",
    }));
    try {
      await s.chat.call("reconcile_last_action");
      const r = await s.chat.call("await_action", { wait_seconds: 3 });
      expect(r.data.outcome).toBe("UNCERTAIN");
      expect(r.data.blocker).toBe("the campaign did not open: LOCKED");
      expect((await s.chat.call("observe_surroundings")).isError).toBe(true);
    } finally {
      await s.app.close();
    }
    // PARTIAL: the owner completion is attempted by retained identity; here the test seam cannot complete it.
    let evidence: Ev = {
      kind: "PARTIAL",
      detail: "the observation's owner records are incomplete",
    };
    const lost = await lostObservation(() => evidence);
    s = lost.s;
    try {
      await s.chat.call("reconcile_last_action");
      const r = await s.chat.call("await_action", { wait_seconds: 5 });
      expect(r.data.state).toBe("FINISHED");
      expect(r.data.outcome).toBe("UNCERTAIN");
      expect(r.data.blocker).toMatch(/owner records remain incomplete/);
      expect(lost.stub.argvs.map((a) => a[0])).toEqual(["observe-surroundings"]);
      expect(r.elicited).toEqual([]); // owner completion has no human or referee interaction
      expect((await s.chat.call("collect", { amount: 1 })).isError).toBe(true);
      // once the owners hold the completed observation, the same recovery resolves it
      evidence = { kind: "COMPLETE" };
      await s.chat.call("reconcile_last_action");
      const ok = await s.chat.call("await_action", { wait_seconds: 3 });
      expect(ok.data.outcome).toBeUndefined();
      expect((await s.chat.call("collect", { amount: 1 })).isError).toBe(false);
    } finally {
      await s.app.close();
    }
  });
});

/** follows the action in progress until it has finished (each call is bounded; a loaded machine may need several) */
async function untilFinished(chat: Chat, tries = 10) {
  let r = await chat.call("await_action", { wait_seconds: 20 });
  for (let i = 0; i < tries && r.data?.state !== "FINISHED"; i++)
    r = await chat.call("await_action", { wait_seconds: 20 });
  return r;
}

afterEach(() => vi.restoreAllMocks());

/** every fact of a campaign with its version and its VALUE (not just its name) */
const factsOf = async (
  campaignDir: string,
  extension?: typeof ACTOR_FIXTURE_EXTENSION,
): Promise<Map<string, string>> => {
  const opened = await CanonicalCampaign.open(campaignDir, {
    buildId: "chat-adapter-reader",
    ...(extension ? { extension } : {}),
  });
  if (!opened.ok) throw new Error(`did not open: ${JSON.stringify(opened.error)}`);
  const c = opened.value;
  try {
    return new Map(
      c.store.listFacts().map((f) => [f.key, `${f.version}:${JSON.stringify(f.value)}`]),
    );
  } finally {
    await c.close();
  }
};

describe("MECHANISM (BLUE R3): a REAL partial observation is completed by identity from owner evidence, never cleared by a generic reconcile", () => {
  it("the retained reading and the earned event land, the reply is lost before the packet forms: UNCERTAIN, blocked across a restart, a failed recovery stays blocked, and the recovery completes the SAME observation with no new choice, reroll or duplicate — equal to an uninterrupted run", async () => {
    // the reference: the same campaign, uninterrupted
    const refDirs = (await observationCampaign()).dirs;
    expect((await observe(refDirs)).result.status).toBe("OBSERVATION_RECEIVED");
    const reference = await factsOf(refDirs.campaignDir);

    const dirs = (await observationCampaign()).dirs;
    const before = await factsOf(dirs.campaignDir);
    const dir = tempDir("immortalis-chat-r3-partial-");
    const scenarioFile = join(dir, "chat-scenario.json");
    writeFileSync(scenarioFile, JSON.stringify({ ...SCENARIO, player_character: PC_ID }));
    const config = await chatConfig({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      refereeHostIds: [HOST_ID],
      scenarioFile,
      setupDir: join(dir, "setup"),
      playerViewHostId: "glance-host",
    });
    const ran: string[] = [];
    const deps: PhoneDeps = {
      pollMs: 300,
      runCli: async (argv, env) => {
        ran.push(argv[0]!);
        return runCli(argv, env);
      },
    };
    let app = createPhoneServer(config, deps);
    await app.listen();
    try {
      const chat = new Chat(`http://127.0.0.1:${config.port}`);
      expect((await chat.link("player referee", { player: PLAYER, referee: REFEREE })).ok).toBe(
        true,
      );
      await chat.init({ elicitation: {} });

      // the Epistemic owner's event commits, then its reply is lost: the packet is never formed
      const proto = EpistemicAccessAdapter.prototype as any;
      const original = proto.establishObservedAccess as (...a: unknown[]) => Promise<unknown>;
      const spy = vi.spyOn(proto, "establishObservedAccess").mockImplementation(async function (
        this: object,
        ...args: unknown[]
      ) {
        await original.apply(this, args);
        return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } };
      });

      expect((await chat.call("observe_surroundings")).isError).toBe(false);
      const confirmed = await chat.call("await_action", { wait_seconds: 20 }, humanConfirms);
      expect(confirmed.elicited).toHaveLength(1);
      const policy = observationPolicy();
      let submitted = 0;
      let last: Awaited<ReturnType<typeof chat.call>> | undefined;
      for (let i = 0; i < 40 && last?.data?.state !== "FINISHED"; i++) {
        for (const t of (JSON.parse(
          (await chat.call("referee_list_tasks", { host_id: HOST_ID })).text ?? "{}",
        ).tasks ?? []) as { task_id: string }[]) {
          const doc = JSON.parse(
            (await chat.call("referee_get_task", { host_id: HOST_ID, task_id: t.task_id })).text!,
          );
          const answer = policy(doc.document ?? doc);
          if (answer !== null) {
            await chat.call("referee_submit_decision", {
              host_id: HOST_ID,
              task_id: t.task_id,
              answer,
              claimed_model: "scripted-test-policy (NOT an AI)",
            });
            submitted++;
          }
        }
        last = await chat.call("await_action", { wait_seconds: 2 });
      }
      // an engine status of UNKNOWN (exit 4), not an exception: the shipped classification must catch it
      expect(last?.data.state).toBe("FINISHED");
      expect(last?.data.exit_code).toBe(4);
      expect(last?.data.outcome).toBe("UNCERTAIN");
      expect(submitted).toBe(1);

      // the owners hold exactly a PARTIAL observation: the affirmative reading and the event, but no sealed packet
      const partial = await factsOf(dirs.campaignDir);
      const added = [...partial.keys()].filter((k) => !before.has(k));
      expect(added.some((k) => /^referee\/.+\/decision$/.test(k))).toBe(true);
      expect(added.some((k) => k.startsWith("access/event/") || /access.*event/i.test(k))).toBe(
        true,
      );
      expect(added.some((k) => /packet/i.test(k))).toBe(false);
      for (const [k, v] of before) expect(partial.get(k), k).toBe(v); // nothing that existed changed

      // the record names the ORIGINAL operation, basis and identities
      const rec = JSON.parse(readFileSync(pendingFile(config), "utf8"));
      expect(rec).toMatchObject({ command: "observe-surroundings", state: "UNCERTAIN" });
      expect(rec.options["player-character"]).toBe(PC_ID);
      expect(rec.identity.basis).toEqual({ unit: "fixture-time-unit", value: 100 });

      // a restart loses nothing: every other mutation is refused, with the original operation named
      await app.close();
      app = createPhoneServer(config, deps);
      await app.listen();
      await chat.init({ elicitation: {} });
      for (const [tool, args] of MUTATING) {
        const r = await chat.call(tool, args);
        expect(r.isError, tool).toBe(true);
        expect(r.text, tool).toContain("observe-surroundings");
      }
      expect(await factsOf(dirs.campaignDir)).toEqual(partial);

      // the recovery is attempted while the owner step still loses its reply: it stays blocked, with the exact blocker
      const ranBefore = ran.length;
      expect((await chat.call("reconcile_last_action")).isError).toBe(false);
      const failed = await untilFinished(chat);
      expect(failed.data.state).toBe("FINISHED");
      expect(failed.data.outcome).toBe("UNCERTAIN");
      expect(failed.data.blocker).toMatch(/owner records remain incomplete/);
      expect(ran.slice(ranBefore)).toEqual([]); // direct owner completion, no command selection
      expect((await chat.call("collect", { amount: 1 })).isError).toBe(true);
      expect(await factsOf(dirs.campaignDir)).toEqual(partial);

      // the owner step works again: the retained decision completes the SAME observation
      spy.mockRestore();
      const ranMid = ran.length;
      expect((await chat.call("reconcile_last_action")).isError).toBe(false);
      const done = await untilFinished(chat);
      expect(done.data.state).toBe("FINISHED");
      expect(done.data.exit_code).toBe(0);
      expect(done.data.outcome).toBeUndefined();
      expect(ran.slice(ranMid)).toEqual([]);
      expect(done.elicited).toEqual([]);
      expect(JSON.stringify(done.data.engine_report)).toContain("owner readback");
      expect(existsSync(pendingFile(config))).toBe(false);

      // no new player choice (one human confirmation in all), no referee reroll (one reading in all, nothing pending)
      expect(
        JSON.parse((await chat.call("referee_list_tasks", { host_id: HOST_ID })).text ?? "{}")
          .tasks,
      ).toEqual([]);
      expect(submitted).toBe(1);

      // the final canon equals an uninterrupted run's, fact for fact and version for version, and keeps everything that pre-existed
      const after = await factsOf(dirs.campaignDir);
      // everything that existed is unchanged, except the Temporal state the packet formation lawfully advances at an UNCHANGED canonical time
      for (const [k, v] of before) {
        if (k === "temporal/state") {
          const was = JSON.parse(v.slice(v.indexOf(":") + 1));
          const now_ = JSON.parse(after.get(k)!.slice(after.get(k)!.indexOf(":") + 1));
          expect(now_.canonical_time).toEqual(was.canonical_time);
          expect(now_.continuation).toEqual(was.continuation);
        } else expect(after.get(k), k).toBe(v);
      }
      // ... and the observation's evidence equals the uninterrupted run's, value for value (event, packet, provenance, the Temporal
      // transaction and state; the referee decisions by operation and verdict - their task identities are per campaign)
      const evidenceOf = (m: Map<string, string>) => ({
        facts: [...m]
          .filter(([k]) => /^(access|temporal)\//.test(k))
          .sort((a, b) => a[0].localeCompare(b[0])),
        decisions: [...m]
          .filter(([k]) => /^referee\/.+\/decision$/.test(k))
          .map(([, v]) => {
            const r = JSON.parse(v.slice(v.indexOf(":") + 1));
            return `${r.operation}:${r.verdict}`;
          })
          .sort(),
      });
      expect(evidenceOf(after)).toEqual(evidenceOf(reference));
      expect(
        evidenceOf(after).decisions.filter((d) => d.startsWith("F014D_DIRECT_PERCEPTION")),
      ).toEqual(["F014D_DIRECT_PERCEPTION:OBSERVATION_ESTABLISHED"]); // one reading in all: no reroll
      // operation-specific evidence: an affirmative retained reading, the event, the sealed packet, the Epistemic owner's own verification
      const c = await openOrdinary(dirs.campaignDir);
      try {
        const keys = [...after.keys()];
        const decisionKey = keys.find(
          (k) =>
            /^referee\/.+\/decision$/.test(k) &&
            !k.includes("pc-") &&
            JSON.parse(after.get(k)!.slice(after.get(k)!.indexOf(":") + 1)).verdict ===
              "OBSERVATION_ESTABLISHED",
        );
        expect(decisionKey).toBeDefined();
        expect(keys.some((k) => /packet/i.test(k))).toBe(true);
        expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      } finally {
        await c.close();
      }
      // and what the player may now learn comes only through the earned presentation
      const glance = await chat.call("read_current_observation_glance");
      expect(glance.isError, glance.text).toBe(false);
    } finally {
      await app.close();
    }
  }, 300_000);
});

describe("MECHANISM (BLUE R3): a REAL collection uncertainty is resolved by the shipped reconcile (the retained positive), and only by evidence that covers it", () => {
  it("the confirmed attempt was recorded by the trusted side and the process step then threw: UNCERTAIN, blocked, and the shipped reconcile presents the ORIGINAL act to the owners; a second reconcile writes nothing", async () => {
    const dirs = copyCampaign(await collectionTemplate());
    const before = await factsOf(dirs.campaignDir, ACTOR_FIXTURE_EXTENSION);
    const dir = tempDir("immortalis-chat-r3-collect-");
    const scenarioFile = join(dir, "chat-scenario.json");
    writeFileSync(
      scenarioFile,
      JSON.stringify({
        player_character: COL_PC,
        world: COL_W,
        source: SRC_SOURCE_KEY,
        reserve: SRC_RESERVE,
        quantity_unit: SRC_UNIT,
        mechanism: COL_MECH,
        basis: SRC_BASIS_ID,
      }),
    );
    const config = await chatConfig({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      campaignId: FIXTURE_CAMPAIGN,
      scenarioFile,
      setupDir: join(dir, "setup"),
    });
    const ran: string[] = [];
    let originalAct = "";
    const app = createPhoneServer(config, {
      pollMs: 300,
      recovery: {
        captureCollection: (c, uid) =>
          captureCollection(c, uid, { extension: ACTOR_FIXTURE_EXTENSION }),
        runCollection: async (c, p, env, recovering) => {
          ran.push(recovering ? "reconcile" : p.command);
          if (!recovering && p.command === "collect") {
            const uid = p.collection!.uid;
            originalAct = `operator-act-${uid}`;
            // what the shipped `collect` does first: the trusted side retains the player's confirmed attempt durably ...
            const session = await openSession(dirs);
            const retained = await session.ledger.record({
              kind: "COLLECTION",
              intent_id: `operator-intent:${uid}`,
              pc_id: COL_PC,
              choice: {
                pc_id: COL_PC,
                act_id: originalAct,
                source: { world_id: COL_W, source_key: SRC_SOURCE_KEY },
                reserve_id: SRC_RESERVE,
                quantity: { amount: 3, unit: SRC_UNIT },
                authored_under: {
                  role: "role.player",
                  permission: "permission.player_choice.commit",
                },
              },
              mechanism_id: COL_MECH,
              basis_id: SRC_BASIS_ID,
              publication: {
                cause: `operator-collection-cause:${c.campaignId}:${uid}`,
                basis: "local-operator-confirmed-choice",
                secrecy: "local-operator-session",
              },
            });
            expect(retained.ok).toBe(true);
            await session.close();
            // ... and the process around it then fails before the owners are invoked
            throw new Error("failure after the confirmed attempt was retained");
          }
          return runCollectionOperation(c, p, env, recovering, {
            extension: ACTOR_FIXTURE_EXTENSION,
          });
        },
      },
    });
    await app.listen();
    try {
      const chat = new Chat(`http://127.0.0.1:${config.port}`);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({});
      expect((await chat.call("collect", { amount: 3 })).isError).toBe(false);
      const lost = await chat.call("await_action", { wait_seconds: 5 });
      expect(lost.data.outcome).toBe("UNCERTAIN");
      expect(readLedger({ operatorDir: dirs.operatorDir }).intents[0].status).toBe("CONFIRMED");
      const mid = await factsOf(dirs.campaignDir, ACTOR_FIXTURE_EXTENSION);
      expect(mid.has(pcCollectionCommitmentKey(COL_PC, originalAct))).toBe(false);
      expect(mid).toEqual(before);
      // blocked until that SAME operation is resolved
      for (const [tool, args] of MUTATING)
        expect((await chat.call(tool, args)).isError, tool).toBe(true);
      expect(await factsOf(dirs.campaignDir, ACTOR_FIXTURE_EXTENSION)).toEqual(before);

      // the shipped reconcile presents the retained act to the owners by its ORIGINAL identity
      expect((await chat.call("reconcile_last_action")).isError).toBe(false);
      const done = await untilFinished(chat);
      expect(done.text, done.text).toContain('"FINISHED"');
      expect(done.data.state).toBe("FINISHED");
      expect(done.data.exit_code).toBe(0);
      expect(done.data.outcome).toBeUndefined();
      expect(JSON.stringify(done.data.engine_report)).toContain("STATUS COLLECTION_COMMITTED");
      expect(ran).toEqual(["collect", "reconcile"]);
      const after = await factsOf(dirs.campaignDir, ACTOR_FIXTURE_EXTENSION);
      expect(after.has(pcCollectionCommitmentKey(COL_PC, originalAct))).toBe(true);
      expect(readLedger({ operatorDir: dirs.operatorDir }).intents[0].status).toBe("COMMITTED");
      // what existed is unchanged in value and version, except what the commitment lawfully advances
      for (const [k, v] of before) {
        if (after.get(k) === v) continue;
        expect(k, `${k} changed`).toMatch(/^(temporal\/state|production\/|population\/|world\/)/);
      }
      expect(existsSync(pendingFile(config))).toBe(false);

      // presenting it again is a no-op, and an unrelated mutation is admitted again
      const head = await factsOf(dirs.campaignDir, ACTOR_FIXTURE_EXTENSION);
      expect((await chat.call("reconcile_last_action")).isError).toBe(false);
      const again = await chat.call("await_action", { wait_seconds: 10 });
      expect(JSON.stringify(again.data.engine_report)).toContain("STATUS NOTHING_TO_RECONCILE");
      expect(await factsOf(dirs.campaignDir, ACTOR_FIXTURE_EXTENSION)).toEqual(head);
      expect(ran.at(-1)).toBe("reconcile");
    } finally {
      await app.close();
    }
  }, 240_000);
});

// -- BLUE R3 delta: the review's findings, each pinned (stub-level: the server's own decisions) ---------------------------------------

const restarted = async (s: { config: PhoneConfig; chat: Chat }, deps: PhoneDeps) => {
  const app = createPhoneServer(s.config, { pollMs: 300, recovery: STUB_RECOVERY, ...deps });
  await app.listen();
  await s.chat.init({ elicitation: {} });
  return app;
};

/** a record exactly as the adapter itself writes it (a process that was lost leaves one of these behind) */
const recordOf = (config: PhoneConfig, over: Record<string, unknown> = {}) => ({
  format: "immortalis-chat-pending-operation",
  format_version: 1,
  campaign_id: config.campaignId,
  run_id: "0123456789abcdef",
  command: "collect",
  options: {},
  dispatched_at: 1,
  state: "UNCERTAIN",
  blocker: null,
  identity: null,
  collection: stubCollectionIdentity("0123456789abcdef"),
  ...over,
});

describe("MECHANISM (BLUE R3 delta): collect-continue has no ledger intent of its own, so a generic reconcile is never its evidence", () => {
  it("is recovered by presenting the SAME command again (never the generic reconcile), and only a COMMITTED status resolves it", async () => {
    for (const [rerun, resolves] of [
      [{ code: 0, status: "COLLECTION_COMMITTED" }, true],
      [{ code: 0, status: "NOTHING_TO_RECONCILE" }, false],
      [{ code: 3, status: "UNAVAILABLE" }, false],
      [{ code: 4, status: "COLLECTION_OUTCOME_UNKNOWN" }, false],
    ] as const) {
      const [cli, stub] = stubCli({
        unknownExit: { code: 4, status: "COLLECTION_OUTCOME_UNKNOWN" },
        rerun,
      });
      const s = await withChat({ runCli: cli });
      try {
        expect((await s.chat.call("continue_collection")).isError).toBe(false);
        const first = await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
        expect(first.data.outcome).toBe("UNCERTAIN");
        expect((await s.chat.call("reconcile_last_action")).isError).toBe(false);
        const rec = await s.chat.call("await_action", { wait_seconds: 5 });
        expect(rec.data.state).toBe("FINISHED");
        expect(stub.argvs.map((a) => a[0])).toEqual(["collect-continue", "collect-continue"]);
        expect(stub.argvs[1]).toEqual(stub.argvs[0]); // the original arguments, unchanged
        if (resolves) {
          expect(rec.data.outcome).toBeUndefined();
          expect(existsSync(pendingFile(s.config))).toBe(false);
          expect((await s.chat.call("finish_collection")).isError).toBe(false);
        } else {
          expect(rec.data.outcome, rerun.status).toBe("UNCERTAIN");
          expect(rec.data.blocker).toContain(rerun.status);
          expect(existsSync(pendingFile(s.config))).toBe(true);
          expect((await s.chat.call("finish_collection")).isError).toBe(true);
        }
      } finally {
        await s.app.close();
      }
    }
  });
});

describe("MECHANISM (BLUE R3 delta): the recovery presents the ORIGINAL command with its recorded options", () => {
  it("a page-launched collect-continue with a referee wait that ends unknown is presented again with the same wait", async () => {
    const [cli, stub] = stubCli({
      unknownOnce: "collect-continue",
      rerun: { code: 0, status: "COLLECTION_COMMITTED" },
    });
    const s = await withChat({ runCli: cli });
    try {
      const page = new Browser(s.base);
      expect((await page.login("player", PLAYER)).status).toBe(200);
      expect(
        (
          await page.req("POST", "/api/play/command", {
            command: "collect-continue",
            options: { "referee-wait": "120" },
          })
        ).status,
      ).toBe(200);
      for (let i = 0; i < 40 && !existsSync(pendingFile(s.config)); i++)
        await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 300));
      const rec = JSON.parse(readFileSync(pendingFile(s.config), "utf8"));
      expect(rec).toMatchObject({ command: "collect-continue", state: "UNCERTAIN" });
      expect(rec.options).toEqual({ "referee-wait": "120" });
      expect((await page.req("POST", "/api/play/command", { command: "reconcile" })).status).toBe(
        200,
      );
      for (let i = 0; i < 40 && existsSync(pendingFile(s.config)); i++)
        await new Promise((r) => setTimeout(r, 100));
      expect(existsSync(pendingFile(s.config))).toBe(false);
      expect(stub.argvs.map((a) => a[0])).toEqual(["collect-continue", "collect-continue"]);
      expect(stub.argvs[1]).toEqual(stub.argvs[0]);
      expect(stub.argvs[1]).toContain("--referee-wait");
      expect(stub.argvs[1]![stub.argvs[1]!.indexOf("--referee-wait") + 1]).toBe("120");
    } finally {
      await s.app.close();
    }
  });
});

describe("MECHANISM (BLUE R3 delta): the real collect-continue, lost part-way, is finished by presenting it again — the shipped reconcile alone leaves it unfinished", () => {
  it("the reach reading landed, the start did not: reconcile says NOTHING_TO_RECONCILE and changes nothing; the recovery runs collect-continue and the occupancy, extraction and hold exist by value", async () => {
    const dirs = copyCampaign(await collectionTemplate());
    const dir = tempDir("immortalis-chat-r3-continue-");
    const scenarioFile = join(dir, "chat-scenario.json");
    writeFileSync(
      scenarioFile,
      JSON.stringify({
        player_character: COL_PC,
        world: COL_W,
        source: SRC_SOURCE_KEY,
        reserve: SRC_RESERVE,
        quantity_unit: SRC_UNIT,
        mechanism: COL_MECH,
        basis: SRC_BASIS_ID,
      }),
    );
    const config = await chatConfig({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      campaignId: FIXTURE_CAMPAIGN,
      scenarioFile,
      setupDir: join(dir, "setup"),
    });
    // 1. the player's confirmed collect commits (the ledger intent is COMMITTED); the gathering is not started yet
    let session = await openSession(dirs);
    const committed = await collect(ctxOf(session, scriptedTerminal("confirm"), fixedIds("c1")), {
      source: { world_id: COL_W, source_key: SRC_SOURCE_KEY },
      reserve_id: SRC_RESERVE,
      quantity: { amount: 3, unit: SRC_UNIT },
      mechanism_id: COL_MECH,
      basis_id: SRC_BASIS_ID,
    });
    expect(committed.status).toBe("COLLECTION_COMMITTED");
    await session.close();
    const collection = await captureCollection(config, "0123456789abcdef", {
      extension: ACTOR_FIXTURE_EXTENSION,
    });
    expect(collection).not.toBeNull();
    // 2. collect-continue: the reach reading lands, then the start chain loses its reply part-way
    const lose = vi
      .spyOn(PcCollectionAdapter.prototype as any, "registerOccupancy")
      .mockImplementation(async () => ({
        ok: false,
        error: { code: "UNKNOWN_OUTCOME", message: "reply lost" },
      }));
    session = await openSession(dirs);
    const lost = await collectContinue({
      ...ctxOf(session, scriptedTerminal(), fixedIds("x")),
      reachHost: async (task: any) => hostAnswer(task, "OPEN", "NOT_AT_ISSUE"),
    });
    expect(lost.status).toBe("COLLECTION_OUTCOME_UNKNOWN");
    await session.close();
    lose.mockRestore();
    const stateOf = async () => {
      const t = await openSession(dirs);
      try {
        const a = new PcCollectionAdapter(t.campaign.store);
        return {
          reach: a.reach(COL_PC, "operator-act-c1")?.value.verdict ?? null,
          occupancy: a.occupancy(COL_PC)?.value ?? null,
          extraction: a.extraction(COL_PC, "operator-act-c1") ? "present" : null,
          hold: a.hold(COL_PC).state,
        };
      } finally {
        await t.close();
      }
    };
    const midway = await stateOf();
    expect(midway).toMatchObject({ reach: "REACHABLE", occupancy: null, extraction: null });
    // the shipped reconcile has no CONFIRMED intent to present: it reports there is nothing to reconcile, and the gathering stays unstarted
    session = await openSession(dirs);
    const generic = await reconcile(ctxOf(session, scriptedTerminal(), fixedIds("r")));
    expect(generic.map((r) => r.status)).toEqual(["NOTHING_TO_RECONCILE"]);
    await session.close();
    expect(await stateOf()).toEqual(midway);

    // the process that ran collect-continue is lost: its record is what a restart finds
    expect(
      writePending(config, {
        ...recordOf(config, { command: "collect-continue", state: "DISPATCHED", collection }),
      } as any),
    ).toBe(true);
    const ran: string[] = [];
    const app = createPhoneServer(config, {
      pollMs: 300,
      recovery: {
        captureCollection: (c, uid) =>
          captureCollection(c, uid, { extension: ACTOR_FIXTURE_EXTENSION }),
        runCollection: async (c, p, env, recovering) => {
          ran.push(p.command);
          return runCollectionOperation(c, p, env, recovering, {
            extension: ACTOR_FIXTURE_EXTENSION,
          });
        },
      },
    });
    await app.listen();
    try {
      const chat = new Chat(`http://127.0.0.1:${config.port}`);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({});
      expect((await chat.call("finish_collection")).isError).toBe(true); // blocked
      expect((await chat.call("reconcile_last_action")).isError).toBe(false);
      const done = await untilFinished(chat);
      expect(done.data.exit_code).toBe(0);
      expect(done.data.outcome).toBeUndefined();
      expect(ran).toEqual(["collect-continue"]); // the same command — the generic reconcile is not what recovers it
      expect(JSON.stringify(done.data.engine_report)).toContain("STATUS COLLECTION_COMMITTED");
      const finished = await stateOf();
      expect(finished.reach).toBe("REACHABLE");
      expect(finished.occupancy).not.toBeNull();
      expect(finished.extraction).toBe("present");
      expect(finished.hold).not.toBe("NONE");
      expect(existsSync(pendingFile(config))).toBe(false);
      expect((await chat.call("finish_collection")).isError).toBe(false); // play resumes
    } finally {
      await app.close();
    }
  }, 240_000);
});

describe("MECHANISM (BLUE R3 delta): every command that can write is recorded first and gated — page and chat alike", () => {
  const WRITERS: [string, any, string?][] = [
    ["collect-finish", {}],
    ["attest-cycle", { mechanism: "mech-x" }],
    ["clarify-collection-cycle", { "player-character": "pc-x" }],
    ["author-character", { world: "w", locus: "l", "player-character": "pc-x" }],
    ["establish-character-locus", { "player-character": "pc-x" }],
    ["referee-bind-host", { "host-id": "gm-setup" }],
    ["declare-closed-setting", {}, "{}"],
  ];

  it("while an outcome is unresolved the page refuses every writing command (409, UNCERTAIN), runs the read-only ones, and recovers through its own `reconcile`", async () => {
    const [cli, stub] = stubCli({ crashAfterConfirm: true });
    const s = await withChat({ runCli: cli });
    try {
      await s.chat.call("collect", { amount: 2 });
      const lost = await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
      expect(lost.data.outcome).toBe("UNCERTAIN");
      const page = new Browser(s.base);
      expect((await page.login("player", PLAYER)).status).toBe(200);
      const dispatched = stub.argvs.length;
      for (const [command, options, setup] of WRITERS) {
        const r = await page.req("POST", "/api/play/command", {
          command,
          options,
          ...(setup !== undefined ? { setup } : {}),
        });
        expect(r.status, command).toBe(409);
        expect(r.text, command).toMatch(/UNCERTAIN/);
        expect(r.text, command).toContain("Run reconcile first"); // the page's own command name, not a chat tool
      }
      expect(stub.argvs.length).toBe(dispatched); // nothing reached the CLI
      // the read-only commands still run
      expect((await page.req("POST", "/api/play/command", { command: "status" })).status).toBe(200);
      expect(stub.argvs.at(-1)![0]).toBe("status");
      // the page's own `reconcile` is the recovery (the stub reports the confirmed collection settled)
      await page.untilPrompt("play").catch(() => undefined);
      expect((await page.req("POST", "/api/play/command", { command: "reconcile" })).status).toBe(
        200,
      );
      for (let i = 0; i < 40 && existsSync(pendingFile(s.config)); i++)
        await new Promise((r) => setTimeout(r, 100));
      expect(existsSync(pendingFile(s.config))).toBe(false);
      // a writing page command is then admitted — and is itself recorded before it is dispatched
      expect(
        (
          await page.req("POST", "/api/play/command", {
            command: "attest-cycle",
            options: { mechanism: "mech-x" },
          })
        ).status,
      ).toBe(200);
      const rec = JSON.parse(readFileSync(pendingFile(s.config), "utf8"));
      expect(rec).toMatchObject({ command: "attest-cycle", state: "DISPATCHED" });
      expect(rec.options).toEqual({ mechanism: "mech-x" });
      await page.req("POST", "/api/play/stop", {});
      for (let i = 0; i < 40 && existsSync(pendingFile(s.config)); i++)
        await new Promise((r) => setTimeout(r, 100));
      expect(existsSync(pendingFile(s.config))).toBe(false); // a definite end (a decline) removes it
    } finally {
      await s.app.close();
    }
  });

  it("a page-launched command that itself ends unknown raises the barrier too, and has no supported readback: the operator must intervene", async () => {
    const [cli] = stubCli({ crash: true });
    const s = await withChat({ runCli: cli });
    try {
      const page = new Browser(s.base);
      expect((await page.login("player", PLAYER)).status).toBe(200);
      expect(
        (
          await page.req("POST", "/api/play/command", {
            command: "author-character",
            options: { world: "w", locus: "l", "player-character": "pc-x" },
          })
        ).status,
      ).toBe(200);
      for (let i = 0; i < 40 && !existsSync(pendingFile(s.config)); i++)
        await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => setTimeout(r, 300));
      expect(JSON.parse(readFileSync(pendingFile(s.config), "utf8"))).toMatchObject({
        command: "author-character",
        state: "UNCERTAIN",
      });
      // chat is gated by it as well
      const r = await s.chat.call("collect", { amount: 1 });
      expect(r.isError).toBe(true);
      expect(r.text).toMatch(/author-character/);
      // there is no owner readback for an authoring command: recovery names that exactly, and the advice is for the operator
      expect((await s.chat.call("reconcile_last_action")).isError).toBe(false);
      const blocked = await s.chat.call("await_action", { wait_seconds: 3 });
      expect(blocked.data.outcome).toBe("UNCERTAIN");
      expect(blocked.data.blocker).toBe("no supported owner readback exists for author-character");
      expect(blocked.data.recovery).toMatch(/operator must inspect/);
      expect(blocked.data.recovery).not.toMatch(/Call reconcile_last_action/);
      const refused = await s.chat.call("collect", { amount: 1 });
      expect(refused.text).toMatch(/Engineering must inspect it/);
      expect(refused.text).not.toMatch(/Run reconcile_last_action first/);
    } finally {
      await s.app.close();
    }
  });

  it("a `reconcile` launched with nothing pending is itself recorded: if it ends unknown the barrier is raised, survives a restart and is cleared by presenting it again", async () => {
    const [cli, stub] = stubCli({
      reconcile: { code: 4, status: "COLLECTION_OUTCOME_UNKNOWN" },
      rerun: { code: 0, status: "NOTHING_TO_RECONCILE" },
    });
    const s = await withChat({ runCli: cli });
    let app2: ReturnType<typeof createPhoneServer> | undefined;
    try {
      expect((await s.chat.call("reconcile_last_action")).isError).toBe(false);
      const first = await s.chat.call("await_action", { wait_seconds: 3 });
      expect(first.data.exit_code).toBe(4);
      expect(first.data.outcome).toBe("UNCERTAIN");
      expect(JSON.parse(readFileSync(pendingFile(s.config), "utf8"))).toMatchObject({
        command: "reconcile",
        state: "UNCERTAIN",
      });
      for (const [tool, args] of MUTATING)
        expect((await s.chat.call(tool, args)).isError, tool).toBe(true);
      await s.app.close();
      const [cli2, stub2] = stubCli({ reconcile: { code: 0, status: "NOTHING_TO_RECONCILE" } });
      app2 = await restarted(s, { runCli: cli2 });
      for (const [tool, args] of MUTATING)
        expect((await s.chat.call(tool, args)).isError, tool).toBe(true);
      expect(stub2.argvs).toEqual([]);
      expect((await s.chat.call("reconcile_last_action")).isError).toBe(false);
      const done = await s.chat.call("await_action", { wait_seconds: 3 });
      expect(done.data.outcome).toBeUndefined();
      expect(stub2.argvs.map((a) => a[0])).toEqual(["reconcile"]);
      expect(existsSync(pendingFile(s.config))).toBe(false);
      expect(stub.argvs.map((a) => a[0])).toEqual(["reconcile"]);
    } finally {
      await s.app.close();
      await app2?.close();
    }
  });
});

describe("MECHANISM (BLUE R3 delta): the pending record is per campaign, validated, and an unreadable one is the operator's to inspect", () => {
  it.each(["NONE", "COMPLETE", "PARTIAL"] as const)(
    "dispatch pins the setup document and reconciles %s without another command or confirmation",
    async (kind) => {
      const cli = vi.fn(async () => {
        throw new Error("synthetic lost reply");
      });
      const evidence = vi.fn<NonNullable<NonNullable<PhoneDeps["recovery"]>["setupEvidence"]>>(
        async () => ({ kind }),
      );
      const s = await withChat({ runCli: cli, recovery: { setupEvidence: evidence } });
      const page = new Browser(s.base);
      await page.login("player", PLAYER);
      try {
        const setup = JSON.stringify({
          format: "immortalis-starting-chronology",
          format_version: 1,
          time: { unit: "season", value: 7 },
          statement: "SYNTHETIC FIXTURE: survey morning",
        });
        expect(
          (await page.req("POST", "/api/play/command", { command: "initialize-time", setup }))
            .status,
        ).toBe(200);
        await s.chat.call("await_action", { wait_seconds: 1 });
        const original = JSON.parse(readFileSync(pendingFile(s.config), "utf8"));
        expect(original.setup.document).toBe(setup);
        await s.chat.call("reconcile_last_action");
        const result = await s.chat.call("await_action", { wait_seconds: 1 });
        expect(evidence.mock.calls[0]?.[1]).toEqual(original.setup);
        expect(result.data.outcome).toBe(kind === "PARTIAL" ? "UNCERTAIN" : undefined);
        expect(existsSync(pendingFile(s.config))).toBe(kind === "PARTIAL");
        expect(cli).toHaveBeenCalledTimes(1);
        expect(result.elicited).toEqual([]);
      } finally {
        await s.app.close();
      }
    },
  );
  it("re-reads a cached operation after trusted same-process removal, replacement, corruption or an unreadable replacement", async () => {
    const [cli] = stubCli({ crash: true });
    const s = await withChat({ runCli: cli });
    try {
      await s.chat.call("collect", { amount: 1 });
      await s.chat.call("await_action", { wait_seconds: 1 });
      expect(existsSync(pendingFile(s.config))).toBe(true);
      const replacement = recordOf(s.config, { command: "attest-cycle", run_id: "replacement" });
      writeFileSync(pendingFile(s.config), JSON.stringify(replacement));
      await s.chat.call("reconcile_last_action");
      expect((await s.chat.call("await_action", { wait_seconds: 1 })).data.blocker).toBe(
        "no supported owner readback exists for attest-cycle",
      );
      expect(JSON.parse(readFileSync(pendingFile(s.config), "utf8")).run_id).toBe("replacement");
      for (const text of ["{ torn", JSON.stringify({ ...replacement, campaign_id: "foreign" })]) {
        writeFileSync(pendingFile(s.config), text);
        await s.chat.call("reconcile_last_action");
        expect((await s.chat.call("await_action", { wait_seconds: 1 })).data.outcome).toBe(
          "UNCERTAIN",
        );
        expect(readFileSync(pendingFile(s.config), "utf8")).toBe(text);
      }
      rmSync(pendingFile(s.config));
      mkdirSync(pendingFile(s.config));
      await s.chat.call("reconcile_last_action");
      expect((await s.chat.call("await_action", { wait_seconds: 1 })).data.outcome).toBe(
        "UNCERTAIN",
      );
      expect(statSync(pendingFile(s.config)).isDirectory()).toBe(true);
      rmSync(pendingFile(s.config), { recursive: true });
      await s.chat.call("reconcile_last_action");
      const lifted = await s.chat.call("await_action", { wait_seconds: 1 });
      expect(lifted.data.outcome).toBeUndefined();
      expect(JSON.stringify(lifted.data.engine_report)).not.toMatch(
        /nothing was committed|all committed/,
      );
    } finally {
      await s.app.close();
    }
  });
  it("another campaign's record never blocks this one and is never touched; a record under this campaign's name for another campaign, a malformed identity and a directory in its place are all unreadable", async () => {
    const [cli, stub] = stubCli();
    const s = await serve({ runCli: cli }, {}, SCENARIO);
    await s.app.close();
    // (a) another campaign's block lives in its own file
    const other = join(s.config.operatorDir, "chat-pending-operation.some-other-campaign.json");
    const otherText = JSON.stringify(recordOf(s.config, { campaign_id: "some-other-campaign" }));
    writeFileSync(other, otherText);
    const app = createPhoneServer(s.config, { pollMs: 300, recovery: STUB_RECOVERY, runCli: cli });
    await app.listen();
    try {
      const chat = new Chat(s.base);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({});
      expect((await chat.call("collect", { amount: 1 })).isError).toBe(false);
      await chat.call("cancel_action");
      await chat.call("await_action", { wait_seconds: 3 });
    } finally {
      await app.close();
    }
    expect(readFileSync(other, "utf8")).toBe(otherText); // never modified or removed
    rmSync(pendingFile(s.config), { force: true });

    // (b) unreadable ones, each a separate startup
    const unreadable: [string, () => void][] = [
      [
        "this campaign's file naming another campaign",
        () =>
          writeFileSync(
            pendingFile(s.config),
            JSON.stringify(recordOf(s.config, { campaign_id: "some-other-campaign" })),
          ),
      ],
      [
        "an observation whose identity is malformed",
        () =>
          writeFileSync(
            pendingFile(s.config),
            JSON.stringify(
              recordOf(s.config, {
                command: "observe-surroundings",
                identity: { pc_id: "p", basis: 1, task_id: "x", event_id: "e" },
              }),
            ),
          ),
      ],
      ["a directory in the record's place", () => mkdirSync(pendingFile(s.config))],
    ];
    for (const [why, make] of unreadable) {
      rmSync(pendingFile(s.config), { force: true, recursive: true });
      make();
      const a = createPhoneServer(s.config, { pollMs: 300, recovery: STUB_RECOVERY, runCli: cli });
      await a.listen();
      try {
        const chat = new Chat(s.base);
        expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
        await chat.init({});
        const r = await chat.call("collect", { amount: 1 });
        expect(r.isError, why).toBe(true);
        expect(r.text, why).toMatch(/unreadable/);
        // nothing a chat can do repairs it: the advice is for the operator, not another reconcile
        expect(r.text, why).toMatch(/Engineering must inspect it/);
        expect(r.text, why).not.toMatch(/Run reconcile_last_action first/);
      } finally {
        await a.close();
      }
    }
    expect(stub.argvs.map((a) => a[0])).toEqual(["collect"]); // only the first, admitted one ever ran
  });

  it("an operator who inspects an unreadable record and removes it lifts the block on the next reconcile, with no restart", async () => {
    const [cli, stub] = stubCli();
    const s = await serve({ runCli: cli }, {}, SCENARIO);
    await s.app.close();
    writeFileSync(pendingFile(s.config), "{ not json");
    const app = createPhoneServer(s.config, { pollMs: 300, recovery: STUB_RECOVERY, runCli: cli });
    await app.listen();
    try {
      const chat = new Chat(s.base);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({});
      expect((await chat.call("collect", { amount: 1 })).isError).toBe(true);
      // still unreadable: a reconcile changes nothing
      await chat.call("reconcile_last_action");
      expect((await chat.call("await_action", { wait_seconds: 2 })).data.outcome).toBe("UNCERTAIN");
      expect((await chat.call("collect", { amount: 1 })).isError).toBe(true);
      // the operator removes the record after inspecting it
      rmSync(pendingFile(s.config));
      await chat.call("reconcile_last_action");
      const lifted = await chat.call("await_action", { wait_seconds: 2 });
      expect(lifted.data.state).toBe("FINISHED");
      expect(lifted.data.outcome).toBeUndefined();
      expect(lifted.data.exit_code).toBe(0);
      expect((await chat.call("collect", { amount: 1 })).isError).toBe(false);
      expect(stub.argvs.map((a) => a[0])).toEqual(["collect"]);
    } finally {
      await app.close();
    }
  });

  it("a record that names no supported readback, or an observation with no recorded identity, stays blocked with the exact blocker and removes nothing", async () => {
    for (const [over, blocker] of [
      [{ command: "attest-cycle" }, "no supported owner readback exists for attest-cycle"],
      [{ command: "relocate" }, "no supported owner readback exists for relocate"],
      [
        { command: "observe-surroundings", identity: null },
        "the observation's original identity was not recorded; it cannot be read back",
      ],
    ] as const) {
      const [cli, stub] = stubCli();
      const s = await serve({ runCli: cli }, {}, SCENARIO);
      await s.app.close();
      writeFileSync(pendingFile(s.config), JSON.stringify(recordOf(s.config, over)));
      const app = createPhoneServer(s.config, {
        pollMs: 300,
        recovery: STUB_RECOVERY,
        runCli: cli,
      });
      await app.listen();
      try {
        const chat = new Chat(s.base);
        expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
        await chat.init({});
        expect((await chat.call("collect", { amount: 1 })).isError).toBe(true);
        await chat.call("reconcile_last_action");
        const r = await chat.call("await_action", { wait_seconds: 2 });
        expect(r.data.outcome, JSON.stringify(over)).toBe("UNCERTAIN");
        expect(r.data.blocker).toBe(blocker);
        expect(existsSync(pendingFile(s.config))).toBe(true);
        expect((await chat.call("collect", { amount: 1 })).isError).toBe(true);
        expect(stub.argvs).toEqual([]); // no command was run on the strength of an unsupported record
      } finally {
        await app.close();
      }
    }
  });
});

describe("MECHANISM (BLUE R3 delta): the readback is of the ORIGINAL identity, and what the assistant is told is neutral", () => {
  it("a clock that has moved on never changes what is read back: every identity the readback is given is the one captured before dispatch", async () => {
    let captures = 0;
    const seen: number[] = [];
    const [cli] = stubCli({ crashAfterConfirm: true });
    const s = await withChat({
      runCli: cli,
      recovery: {
        captureObservation: async (_c, pc) => {
          const n = captures++;
          return stubIdentity(pc, n === 0 ? 100 : 200, n === 0 ? "event-original" : "event-later");
        },
        observationEvidence: async (_c, identity) => {
          seen.push(identity.basis.value);
          return identity.basis.value === 100
            ? { kind: "PARTIAL" as const, detail: "incomplete" }
            : { kind: "NONE" as const };
        },
      },
    });
    try {
      expect((await s.chat.call("observe_surroundings")).isError).toBe(false);
      const lost = await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
      expect(lost.data.outcome).toBe("UNCERTAIN");
      await s.chat.call("reconcile_last_action");
      const r = await s.chat.call("await_action", { wait_seconds: 5 });
      expect(r.data.outcome).toBe("UNCERTAIN");
      expect(captures).toBe(1); // the recovery captured nothing: it used the record
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.every((b) => b === 100)).toBe(true);
    } finally {
      await s.app.close();
    }
  });

  it("the detail of a half-formed observation never reaches the assistant: not in the blocker, the report or a refusal", async () => {
    const SECRET = "SEALED-DETAIL-AFFIRMATIVE-READING";
    const [cli] = stubCli({ crashAfterConfirm: true });
    const s = await withChat({
      runCli: cli,
      recovery: {
        captureObservation: async (_c, pc) => stubIdentity(pc),
        observationEvidence: async () => ({ kind: "PARTIAL" as const, detail: SECRET }),
      },
    });
    try {
      expect((await s.chat.call("observe_surroundings")).isError).toBe(false);
      await s.chat.call("await_action", { wait_seconds: 5 }, humanConfirms);
      await s.chat.call("reconcile_last_action");
      const r = await s.chat.call("await_action", { wait_seconds: 5 });
      expect(r.data.outcome).toBe("UNCERTAIN");
      expect(r.data.blocker).toMatch(/owner records remain incomplete/);
      const refused = await s.chat.call("collect", { amount: 1 });
      expect(refused.isError).toBe(true);
      for (const text of [JSON.stringify(r.data), refused.text ?? ""])
        expect(text).not.toContain(SECRET);
    } finally {
      await s.app.close();
    }
  });
});

describe("MECHANISM (BLUE R3 delta): cancel_action does not claim what it cannot know", () => {
  it("after the human has confirmed, nothing is waiting to be withdrawn: it says so, claims neither result, and the action goes on to commit", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const [cli] = stubCli({ afterConfirm: gate });
    const s = await withChat({ runCli: cli });
    try {
      await s.chat.call("collect", { amount: 2 });
      const confirmed = await s.chat.call("await_action", { wait_seconds: 1 }, humanConfirms);
      expect(confirmed.elicited).toHaveLength(1);
      expect(confirmed.data.state).toBe("RUNNING"); // confirmed, and still working
      const cancel = await s.chat.call("cancel_action");
      expect(cancel.isError).toBe(true);
      expect(cancel.text).not.toMatch(/nothing was confirmed/);
      expect(cancel.text).not.toMatch(/was withdrawn/);
      expect(cancel.text).toMatch(/nothing to withdraw/);
      release();
      const done = await s.chat.call("await_action", { wait_seconds: 5 });
      expect(done.data.state).toBe("FINISHED");
      expect(done.data.exit_code).toBe(0);
      expect(JSON.stringify(done.data.engine_report)).toContain("COMMITTED");
    } finally {
      release();
      await s.app.close();
    }
  });
});

describe("MECHANISM (BLUE R3 delta): a shutdown waits for the running command to wind down, so the campaign's writer lock is not stranded", () => {
  it("drains a recovery read and preserves the original uncertainty instead of dispatching completion after closing", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const started = new Promise<void>((r) => (entered = r));
    const complete = vi.fn(async () => ({ kind: "COMPLETE" as const }));
    const [cli] = stubCli({ crash: true });
    const s = await withChat({
      runCli: cli,
      recovery: {
        ...STUB_RECOVERY,
        observationEvidence: async () => {
          entered();
          await gate;
          return { kind: "PARTIAL", detail: "synthetic incomplete operation" };
        },
        completeObservation: complete,
      },
    });
    await s.chat.call("observe_surroundings");
    await s.chat.call("await_action", { wait_seconds: 1 });
    const original = readFileSync(pendingFile(s.config), "utf8");
    const recovery = s.chat.call("reconcile_last_action").catch(() => undefined);
    await started;
    let closed = false;
    const closing = s.app.close().then(() => {
      closed = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    const closedBeforeReadFinished = closed;
    release();
    await closing;
    await recovery;
    expect(closedBeforeReadFinished).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    expect(readFileSync(pendingFile(s.config), "utf8")).toBe(original);
  });
  it("drains an already active referee tool before close completes", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const started = new Promise<void>((r) => (entered = r));
    const s = await withChat(
      {
        chat: {
          callReferee: async () => {
            entered();
            await gate;
            return { status: 200, result: { content: [] } };
          },
        },
      },
      { scope: "referee", referee: REFEREE },
    );
    const call = s.chat.call("referee_list_tasks", { host_id: "gm-setup" }).catch(() => undefined);
    await started;
    let closed = false;
    const closing = s.app.close().then(() => {
      closed = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    const closedBeforeToolFinished = closed;
    release();
    await closing;
    await call;
    expect(closedBeforeToolFinished).toBe(false);
  });
  it("latches shutdown and drains a launch already capturing identity without dispatching it", async () => {
    let release!: () => void;
    let captured!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const entered = new Promise<void>((r) => (captured = r));
    const cli = vi.fn(async () => 0);
    const s = await withChat({
      runCli: cli,
      recovery: {
        captureObservation: async (_c, pc) => {
          captured();
          await gate;
          return stubIdentity(pc);
        },
      },
    });
    const page = new Browser(s.base);
    await page.login("player", PLAYER);
    const launch = page
      .req("POST", "/api/play/command", {
        command: "observe-surroundings",
        options: { "player-character": SCENARIO.player_character },
      })
      .catch(() => undefined);
    await entered;
    let closed = false;
    const closing = s.app.close().then(() => {
      closed = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    const closedBeforeCaptureFinished = closed;
    release();
    await closing;
    await launch;
    expect(closedBeforeCaptureFinished).toBe(false);
    expect(cli).not.toHaveBeenCalled();
    expect(existsSync(pendingFile(s.config))).toBe(false);
  });

  it("an await on an aborted terminal yields while the command winds down", async () => {
    let winding = false;
    const cli: NonNullable<PhoneDeps["runCli"]> = async (_a, env) => {
      await env.terminal!.ask(">");
      await new Promise((r) => setTimeout(r, 50));
      winding = true;
      return 1;
    };
    const s = await withChat({ runCli: cli }, undefined, {});
    const page = new Browser(s.base);
    await page.login("player", PLAYER);
    try {
      await s.chat.call("collect", { amount: 1 });
      const waiting = await s.chat.call("await_action", { wait_seconds: 1 });
      await page.req("POST", "/api/play/stop", {});
      const started = Date.now();
      await s.chat.call("await_action", { after: waiting.data.next_after, wait_seconds: 1 });
      expect(winding).toBe(true);
      expect(Date.now() - started).toBeLessThan(800);
    } finally {
      await s.app.close();
    }
  });
  it("close() resolves only after the aborted command has finished its own teardown, and the definite end clears the record", async () => {
    let wound = false;
    const cli: NonNullable<PhoneDeps["runCli"]> = async (_argv, env) => {
      const t = env.terminal!;
      t.say("PROPOSAL collect");
      await t.ask(">"); // the shutdown declines it
      await new Promise((r) => setTimeout(r, 300)); // the command releases what it holds
      wound = true;
      t.say("STATUS DECLINED");
      return 1;
    };
    const s = await withChat({ runCli: cli });
    await s.chat.call("collect", { amount: 1 });
    expect(existsSync(pendingFile(s.config))).toBe(true);
    await s.app.close();
    expect(wound).toBe(true);
    expect(existsSync(pendingFile(s.config))).toBe(false); // a definite end: the record was settled before the process could exit
  });

  it("is bounded: a command that never winds down does not hold the shutdown for longer than the configured wait", async () => {
    const never = new Promise<void>(() => undefined);
    const [cli] = stubCli({ gate: never });
    const s = await withChat({ runCli: cli, shutdownMs: 150 });
    await s.chat.call("collect", { amount: 1 });
    const started = Date.now();
    await s.app.close();
    expect(Date.now() - started).toBeLessThan(3000);
    // and the lost command leaves exactly what a restart needs: the dispatched record
    expect(JSON.parse(readFileSync(pendingFile(s.config), "utf8")).state).toBe("DISPATCHED");
  });
});

// -- BLUE R3 delta: real-engine restart/recovery scenarios behind the chat adapter -----------------------------------------------------

/** a real original character with canonical time, the phone server over it with the SHIPPED CLI, and a chat that is both player and referee */
async function observationServer(caps: any = { elicitation: {} }) {
  const dirs = (await observationCampaign()).dirs;
  const dir = tempDir("immortalis-chat-r3-real-");
  const scenarioFile = join(dir, "chat-scenario.json");
  writeFileSync(scenarioFile, JSON.stringify({ ...SCENARIO, player_character: PC_ID }));
  const config = await chatConfig({
    campaignDir: dirs.campaignDir,
    operatorDir: dirs.operatorDir,
    campaignId: LOCALITY_CAMPAIGN,
    refereeHostIds: [HOST_ID],
    scenarioFile,
    setupDir: join(dir, "setup"),
    playerViewHostId: "glance-host",
  });
  const ran: string[] = [];
  const deps: PhoneDeps = {
    pollMs: 300,
    runCli: async (argv, env) => {
      ran.push(argv[0]!);
      return runCli(argv, env);
    },
  };
  const app = createPhoneServer(config, deps);
  await app.listen();
  const chat = new Chat(`http://127.0.0.1:${config.port}`);
  expect((await chat.link("player referee", { player: PLAYER, referee: REFEREE })).ok).toBe(true);
  await chat.init(caps);
  return { dirs, config, app, chat, ran, deps };
}

/** the same assistant serves the engine's real referee tasks (a scripted policy, plumbing only) until the running command ends */
async function serveReferee(chat: Chat) {
  const policy = observationPolicy();
  let submitted = 0;
  let last: Awaited<ReturnType<typeof chat.call>> | undefined;
  for (let i = 0; i < 40 && last?.data?.state !== "FINISHED"; i++) {
    for (const t of (JSON.parse(
      (await chat.call("referee_list_tasks", { host_id: HOST_ID })).text ?? "{}",
    ).tasks ?? []) as { task_id: string }[]) {
      const doc = JSON.parse(
        (await chat.call("referee_get_task", { host_id: HOST_ID, task_id: t.task_id })).text!,
      );
      const answer = policy(doc.document ?? doc);
      if (answer !== null) {
        await chat.call("referee_submit_decision", {
          host_id: HOST_ID,
          task_id: t.task_id,
          answer,
          claimed_model: "scripted-test-policy (NOT an AI)",
        });
        submitted++;
      }
    }
    last = await chat.call("await_action", { wait_seconds: 2 });
  }
  return { last: last!, submitted };
}

/** the observation's own evidence in a campaign: access and temporal facts by version and value, and the retained decisions by verdict */
const observationEvidenceOf = (m: Map<string, string>) => ({
  facts: [...m]
    .filter(([k]) => /^(access|temporal)\//.test(k))
    .sort((a, b) => a[0].localeCompare(b[0])),
  decisions: [...m]
    .filter(([k]) => /^referee\/.+\/decision$/.test(k))
    .map(([, v]) => {
      const r = JSON.parse(v.slice(v.indexOf(":") + 1));
      return `${r.operation}:${r.verdict}`;
    })
    .sort(),
});

describe("MECHANISM (BLUE R3 delta): REAL observation recovery at the boundaries the review found", () => {
  it("the packet is formed but the sealed Temporal transaction (the last write) is lost: UNCERTAIN, never 'complete'; its retained decision finishes it, and the evidence equals an uninterrupted run's", async () => {
    const refDirs = (await observationCampaign()).dirs;
    expect((await observe(refDirs)).result.status).toBe("OBSERVATION_RECEIVED");
    const reference = await factsOf(refDirs.campaignDir);

    const s = await observationServer();
    const before = await factsOf(s.dirs.campaignDir);
    // only the sealed-transaction commit loses its reply; the event, the packet and everything else land
    let loseSeal = true;
    const realOpen = CanonicalCampaign.open.bind(CanonicalCampaign);
    vi.spyOn(CanonicalCampaign, "open").mockImplementation(async (...a: any[]) => {
      const r: any = await (realOpen as any)(...a);
      if (r.ok) {
        const store: any = r.value.store;
        const commit = store.commit.bind(store);
        store.commit = async (g: any) =>
          loseSeal &&
          typeof g?.group_id === "string" &&
          g.group_id.startsWith("transaction-group:observation-tx-")
            ? { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } }
            : commit(g);
      }
      return r;
    });
    try {
      expect((await s.chat.call("observe_surroundings")).isError).toBe(false);
      const confirmed = await s.chat.call("await_action", { wait_seconds: 20 }, humanConfirms);
      expect(confirmed.elicited).toHaveLength(1);
      const first = await serveReferee(s.chat);
      expect(first.last.data.state).toBe("FINISHED");
      expect(first.last.data.exit_code).toBe(4);
      expect(first.last.data.outcome).toBe("UNCERTAIN");
      expect(first.submitted).toBe(1);
      const partial = await factsOf(s.dirs.campaignDir);
      const added = [...partial.keys()].filter((k) => !before.has(k));
      expect(added.some((k) => /packet/i.test(k))).toBe(true);
      expect(added.some((k) => k.startsWith("temporal/transaction/"))).toBe(false); // sealed: no

      // the owners can read the packet and still the observation is NOT complete: recovery completes the retained decision
      loseSeal = false;
      const ranBefore = s.ran.length;
      expect((await s.chat.call("reconcile_last_action")).isError).toBe(false);
      const done = await untilFinished(s.chat);
      expect(done.data.exit_code).toBe(0);
      expect(done.data.outcome).toBeUndefined();
      expect(s.ran.slice(ranBefore)).toEqual([]); // no CLI or referee replay
      expect(done.elicited).toEqual([]); // nothing was asked of the player
      expect(JSON.stringify(done.data.engine_report)).toContain("owner readback");
      expect(existsSync(pendingFile(s.config))).toBe(false);
      expect(
        JSON.parse((await s.chat.call("referee_list_tasks", { host_id: HOST_ID })).text ?? "{}")
          .tasks,
      ).toEqual([]); // no referee reroll
      const after = await factsOf(s.dirs.campaignDir);
      expect(
        [...after.keys()].some((k) => k.startsWith("temporal/transaction/observation-tx-")),
      ).toBe(true);
      expect(observationEvidenceOf(after)).toEqual(observationEvidenceOf(reference));
      const c = await openOrdinary(s.dirs.campaignDir);
      try {
        expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      } finally {
        await c.close();
      }
    } finally {
      vi.restoreAllMocks();
      await s.app.close();
    }
  }, 300_000);

  it("a reading retained under attempt >= 1 survives a lost reply and a RESTART: the original decision completes without a new choice, reroll or duplicate", async () => {
    const { dirs } = await observationCampaign();
    const dir = tempDir("immortalis-chat-r3-attempt-");
    const scenarioFile = join(dir, "chat-scenario.json");
    writeFileSync(scenarioFile, JSON.stringify({ ...SCENARIO, player_character: PC_ID }));
    const config = await chatConfig({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      refereeHostIds: [HOST_ID],
      scenarioFile,
      setupDir: join(dir, "setup"),
      playerViewHostId: "glance-host",
    });
    // what the adapter writes BEFORE it dispatches (the original character, basis and every attempt's identity) ...
    const identity = await realCapture(config, PC_ID);
    expect(identity).not.toBeNull();
    expect(
      writePending(config, {
        ...recordOf(config, {
          command: "observe-surroundings",
          state: "DISPATCHED",
          options: { "player-character": PC_ID },
          identity,
        }),
      } as any),
    ).toBe(true);
    // ... then the shipped command runs: its first answer is set aside, the second is retained, and the Epistemic owner's step is lost
    const proto = EpistemicAccessAdapter.prototype as any;
    const lose = vi.spyOn(proto, "establishObservedAccess").mockImplementation(async () => ({
      ok: false,
      error: { code: "UNKNOWN_OUTCOME", message: "reply lost" },
    }));
    const lost = await observe(dirs, verbConsole("observe-surroundings"), {}, ((doc: any) =>
      doc.operation === "F014D_DIRECT_PERCEPTION"
        ? doc.context.attempt === 0
          ? { task_id: doc.task_id, nonsense: true }
          : observationAnswer(doc)
        : plainPolicy(doc)) as any);
    lose.mockRestore();
    expect(lost.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
    const partial = await factsOf(dirs.campaignDir);
    const readings = [...partial.entries()].filter(
      ([k, v]) =>
        /^referee\/.+\/decision$/.test(k) &&
        JSON.parse(v.slice(v.indexOf(":") + 1)).operation === "F014D_DIRECT_PERCEPTION",
    );
    expect(readings).toHaveLength(1);
    expect(JSON.parse(readings[0]![1].slice(readings[0]![1].indexOf(":") + 1)).attempt).toBe(1);

    // the process comes back: the block is restored from the record and the REAL readback reads every attempt's identity
    const ran: string[] = [];
    const app = createPhoneServer(config, {
      pollMs: 300,
      runCli: async (argv, env) => {
        ran.push(argv[0]!);
        return runCli(argv, env);
      },
    });
    await app.listen();
    try {
      const chat = new Chat(`http://127.0.0.1:${config.port}`);
      expect((await chat.link("player referee", { player: PLAYER, referee: REFEREE })).ok).toBe(
        true,
      );
      await chat.init({ elicitation: {} });
      for (const [tool, args] of MUTATING)
        expect((await chat.call(tool, args)).isError, tool).toBe(true);
      expect((await chat.call("reconcile_last_action")).isError).toBe(false);
      const r = await untilFinished(chat);
      expect(r.data.exit_code).toBe(0);
      expect(r.data.outcome).toBeUndefined();
      expect(JSON.stringify(r.data.engine_report)).toContain("original observation");
      expect(JSON.stringify(r.data)).not.toMatch(/affirmative|OBSERVATION_ESTABLISHED/i);
      expect(r.elicited).toEqual([]); // no new player choice
      expect(ran).toEqual([]); // the owner uses the attempt-1 decision; no CLI or referee replay
      expect(
        JSON.parse((await chat.call("referee_list_tasks", { host_id: HOST_ID })).text ?? "{}")
          .tasks,
      ).toEqual([]); // no referee reroll
      const complete = await factsOf(dirs.campaignDir);
      for (const [k, v] of partial) {
        if (k === "temporal/state") {
          const value = (s: string) => JSON.parse(s.slice(s.indexOf(":") + 1));
          expect(value(complete.get(k)!).canonical_time).toEqual(value(v).canonical_time);
        } else expect(complete.get(k), k).toBe(v);
      }
      expect(complete.get(readings[0]![0])).toBe(readings[0]![1]);
      expect([...complete.keys()].some((k) => /packet/i.test(k))).toBe(true);
      expect(
        [...complete.keys()].some((k) => k.startsWith("temporal/transaction/observation-tx-")),
      ).toBe(true);
      expect(existsSync(pendingFile(config))).toBe(false);
      expect((await chat.call("read_current_observation_glance")).isError).toBe(false);
      await chat.call("reconcile_last_action");
      await untilFinished(chat);
      expect(await factsOf(dirs.campaignDir)).toEqual(complete);
    } finally {
      await app.close();
    }
  }, 300_000);

  it("a shutdown during a command that holds the campaign's writer lock waits for it, so the lock is released and the restart can read the campaign back", async () => {
    const s = await observationServer({});
    try {
      expect((await s.chat.call("observe_surroundings")).isError).toBe(false);
      let waiting = await s.chat.call("await_action", { wait_seconds: 3 });
      for (let i = 0; i < 10 && waiting.data.state !== "AWAITING_CONFIRMATION"; i++)
        waiting = await s.chat.call("await_action", { wait_seconds: 3 });
      expect(waiting.data.state).toBe("AWAITING_CONFIRMATION");
      // the command holds the campaign's writer lock while it waits for the player
      expect(existsSync(join(s.dirs.campaignDir, "LOCK"))).toBe(true);
      expect(existsSync(pendingFile(s.config))).toBe(true);
    } finally {
      await s.app.close();
    }
    // the shutdown waited for the command's own teardown: the lock is gone, the record settled (a decline is definite), the campaign opens
    expect(existsSync(join(s.dirs.campaignDir, "LOCK"))).toBe(false);
    expect(existsSync(pendingFile(s.config))).toBe(false);
    const opened = await CanonicalCampaign.open(s.dirs.campaignDir, { buildId: "after-shutdown" });
    expect(opened.ok).toBe(true);
    if (opened.ok) await opened.value.close();
  }, 120_000);
});

describe("MECHANISM (24 October repair): the cause of a cause-free refusal reaches the OPERATOR's log, never the player or the assistant", () => {
  it("a defective scenario file and an unset player-view host are named to the operator note; the assistant is told only that nothing is available or configured", async () => {
    const notes: string[] = [];
    const [cli] = stubCli();
    const s = await serve(
      { runCli: cli, chat: { note: (m: string) => notes.push(m) } },
      { playerViewHostId: null },
      { ...SCENARIO, host: "not-offered" },
    );
    try {
      const chat = new Chat(s.base);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({});
      const collect = await chat.call("collect", { amount: 1 });
      expect(collect.isError).toBe(true);
      expect(collect.text).toMatch(/scenario is not configured for chat play/);
      const glance = await chat.call("read_current_observation_glance");
      expect(glance.isError).toBe(true);
      expect(glance.text).toMatch(/Nothing is available to present/);
      // the operator hears both causes, in words
      expect(notes.join("\n")).toMatch(/the scenario file has keys that are not offered: host/);
      expect(notes.join("\n")).toMatch(/IMMORTALIS_PLAYER_VIEW_HOST_ID is not set/);
      // the assistant hears neither, and the glance refusal is the same cause-free text it always was
      for (const t of [collect.text ?? "", glance.text ?? ""]) {
        expect(t).not.toMatch(/IMMORTALIS_|not offered|host/i);
      }
    } finally {
      await s.app.close();
    }
  });

  it("a well-formed scenario and a configured host raise no note", async () => {
    const notes: string[] = [];
    const [cli] = stubCli();
    const s = await serve({ runCli: cli, chat: { note: (m: string) => notes.push(m) } });
    try {
      const chat = new Chat(s.base);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await chat.init({});
      expect((await chat.call("collect", { amount: 1 })).isError).toBe(false);
      expect(notes.filter((n) => /scenario/.test(n))).toEqual([]);
    } finally {
      await s.app.close();
    }
  });
});

async function collectionTemplate(): Promise<string> {
  const dir = tempDir("immortalis-chat-collect-");
  const s = await collectionCampaign({ dir });
  await s.campaign.close();
  return dir;
}
