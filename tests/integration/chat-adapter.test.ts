/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON */
// The ORDINARY-CHAT ADAPTER (apps/phone: a remote MCP endpoint with its OAuth 2.1 authorization server), BLUE live-recovery brief v2.
//
// EVERYTHING IN THIS FILE IS A MECHANISM TEST. The client is a script that speaks OAuth and MCP; the "assistant" and the "referee" are
// scripts; the "human" is a script that types a confirmation only where a test says so. None of it is a real chat session, a real model,
// a real player's choice or a real game master's judgment. It proves authentication, scope separation, that a model-side caller cannot
// confirm anything, the confirmation channels, orchestration without deadlock, and that the SHIPPED commands run unchanged behind it.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanonicalCampaign,
  EpistemicAccessAdapter,
  verifyEpistemicIntegrity,
} from "@immortalis/engine";
import { runCli } from "@immortalis/operator";
import { createPhoneServer, type PhoneDeps } from "../../apps/phone/src/server.ts";
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
import { HOST_ID } from "../support/original-pc.ts";
import { PC_ID, observationCampaign, observationPolicy, observe } from "../support/observation.ts";
import {
  MECH as COL_MECH,
  PC as COL_PC,
  W as COL_W,
  collectionCampaign,
} from "../support/pc-collection.ts";
import { copyCampaign, openSession } from "../support/operator.ts";
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

const SCENARIO = {
  player_character: "pc-test-1",
  world: "world-test",
  source: "source-test",
  reserve: "reserve-test",
  quantity_unit: "lump",
  mechanism: "mech-test",
  basis: "basis-test",
};

/** owner readback stand-ins for the stub-CLI tests (the real-engine tests below use the real readback) */
const STUB_RECOVERY = {
  captureObservation: async (_c: PhoneConfig, pc: string) => ({
    pc_id: pc,
    basis: { unit: "fixture-time-unit", value: 100 },
    task_id: "a".repeat(64),
    event_id: "event-stub",
  }),
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
  } = {},
): [NonNullable<PhoneDeps["runCli"]>, Stub] {
  const stub: Stub = { argvs: [], phrases: [], release: () => undefined };
  let settled = false;
  const cli: NonNullable<PhoneDeps["runCli"]> = async (argv, env) => {
    stub.argvs.push([...argv]);
    const t = env.terminal!;
    if (opts.crash) throw new Error("boom");
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
      const declined = await chat.call("await_action", { wait_seconds: 20 }, humanDeclines);
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
      const declined = await chat.call("await_action", { wait_seconds: 20 }, humanDeclines);
      expect(declined.data.state).toBe("FINISHED");
      expect(await factsOf(dirs.campaignDir)).toEqual(committed);
    } finally {
      await app.close();
    }
  }, 240_000);
});

const pendingFile = (c: PhoneConfig) => join(c.operatorDir, "chat-pending-operation.json");
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
    const s = await withChat({ runCli: cli });
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
      const [cli] = stubCli({ settleUnknownOnce: true, reconcile });
      const s = await withChat({ runCli: cli });
      try {
        expect((await s.chat.call("settle_collection_lapse")).isError).toBe(false);
        const first = await s.chat.call("await_action", { wait_seconds: 3 });
        expect(first.data.outcome).toBe("UNCERTAIN");
        expect((await s.chat.call("reconcile_last_action")).isError).toBe(false);
        const rec = await s.chat.call("await_action", { wait_seconds: 3 });
        expect(rec.data.state).toBe("FINISHED");
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
          return {
            pc_id: pc,
            basis: { unit: "fixture-time-unit", value: 100 },
            task_id: "b".repeat(64),
            event_id: "event-original",
          };
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

  it("an unsupported or unavailable readback stays uncertain with the exact blocker; so does a partial observation the same command cannot complete", async () => {
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
    // PARTIAL: the same command is re-run by identity (it cannot ask the player anything); here it does not complete it
    let evidence: Ev = {
      kind: "PARTIAL",
      detail: "the observation event is committed without its sealed packet",
    };
    const lost = await lostObservation(() => evidence);
    s = lost.s;
    try {
      await s.chat.call("reconcile_last_action");
      const r = await s.chat.call("await_action", { wait_seconds: 5 });
      expect(r.data.state).toBe("FINISHED");
      expect(r.data.outcome).toBe("UNCERTAIN");
      expect(r.data.blocker).toMatch(/partial observation .* was not completed/);
      // the recovery re-ran ONLY the original command, never the generic reconcile; the stand-in asked the player (a decline), twice at most
      expect(lost.stub.argvs.map((a) => a[0])).toEqual([
        "observe-surroundings",
        "observe-surroundings",
      ]);
      expect(lost.stub.argvs[1]).toEqual(lost.stub.argvs[0]); // the original arguments, unchanged
      expect(JSON.stringify(r.data.engine_report)).toContain(
        "a recovery cannot ask the player anything",
      );
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
      expect(failed.data.blocker).toMatch(/partial observation .* was not completed/);
      expect(ran.slice(ranBefore)).toEqual(["observe-surroundings"]); // the original command, never the generic reconcile
      expect((await chat.call("collect", { amount: 1 })).isError).toBe(true);
      expect(await factsOf(dirs.campaignDir)).toEqual(partial);

      // the owner step works again: the SAME command, by identity, completes the SAME observation
      spy.mockRestore();
      const ranMid = ran.length;
      expect((await chat.call("reconcile_last_action")).isError).toBe(false);
      const done = await untilFinished(chat);
      expect(done.data.state).toBe("FINISHED");
      expect(done.data.exit_code).toBe(0);
      expect(done.data.outcome).toBeUndefined();
      expect(ran.slice(ranMid)).toEqual(["observe-surroundings"]);
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
    const app = createPhoneServer(config, {
      pollMs: 300,
      runCli: async (argv, env) => {
        ran.push(argv[0]!);
        if (argv[0] === "collect") {
          // what the shipped `collect` does first: the trusted side retains the player's confirmed attempt durably ...
          const session = await openSession(dirs);
          const retained = await session.ledger.record({
            kind: "COLLECTION",
            intent_id: "operator-intent:lost",
            pc_id: COL_PC,
            choice: {
              pc_id: COL_PC,
              act_id: "operator-act-lost",
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
              cause: "operator-collection-cause:lost",
              basis: "local-operator-confirmed-choice",
              secrecy: "local-operator-session",
            },
          });
          expect(retained.ok).toBe(true);
          await session.close();
          // ... and the process around it then fails before the owners are invoked
          throw new Error("failure after the confirmed attempt was retained");
        }
        return runCli(argv, { ...env, extension: ACTOR_FIXTURE_EXTENSION });
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
      expect(mid.has(pcCollectionCommitmentKey(COL_PC, "operator-act-lost"))).toBe(false);
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
      expect(after.has(pcCollectionCommitmentKey(COL_PC, "operator-act-lost"))).toBe(true);
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

async function collectionTemplate(): Promise<string> {
  const dir = tempDir("immortalis-chat-collect-");
  const s = await collectionCampaign({ dir });
  await s.campaign.close();
  return dir;
}
