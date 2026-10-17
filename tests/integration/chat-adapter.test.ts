/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON */
// The ORDINARY-CHAT ADAPTER (apps/phone: a remote MCP endpoint with its OAuth 2.1 authorization server), BLUE live-recovery brief v2.
//
// EVERYTHING IN THIS FILE IS A MECHANISM TEST. The client is a script that speaks OAuth and MCP; the "assistant" and the "referee" are
// scripts; the "human" is a script that types a confirmation only where a test says so. None of it is a real chat session, a real model,
// a real player's choice or a real game master's judgment. It proves authentication, scope separation, that a model-side caller cannot
// confirm anything, the confirmation channels, orchestration without deadlock, and that the SHIPPED commands run unchanged behind it.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
  withHost,
  type Human,
} from "../support/chat-client.ts";
import { tempDir } from "../support/tmp.ts";
import { LOCALITY_CAMPAIGN, openOrdinary } from "../support/locality.ts";
import { HOST_ID } from "../support/original-pc.ts";
import { PC_ID, observationCampaign, observationPolicy } from "../support/observation.ts";
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

interface Stub {
  readonly argvs: string[][];
  /** the phrase each confirmation prompt asked for, in order */
  readonly phrases: string[];
  release: () => void;
}

/** a stand-in for the shipped CLI: prints a proposal and a challenge, asks, and finishes by the typed answer (it never answers itself) */
function stubCli(
  opts: { gate?: Promise<void>; crash?: boolean } = {},
): [NonNullable<PhoneDeps["runCli"]>, Stub] {
  const stub: Stub = { argvs: [], phrases: [], release: () => undefined };
  const cli: NonNullable<PhoneDeps["runCli"]> = async (argv, env) => {
    stub.argvs.push([...argv]);
    const t = env.terminal!;
    if (opts.crash) throw new Error("boom");
    t.say(`PROPOSAL ${argv[0]}`);
    if (opts.gate) await opts.gate;
    const phrase = `${argv[0]} ${Math.random().toString(16).slice(2, 14)}`;
    stub.phrases.push(phrase);
    t.say("PROGRESS referee DECIDED referee/abc/decision");
    t.say(`To confirm, type exactly "${phrase}"`);
    const typed = await t.ask(">");
    if (typed === phrase) {
      t.say("STATUS COMMITTED");
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
  const config = await chatConfig({ scenarioFile, setupDir: join(dir, "setup"), ...over });
  const app = createPhoneServer(config, { pollMs: 300, ...deps });
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

  it("an action that is still running blocks a second one; a crashed command is reported as not confirmed; reconcile is a shipped command, never a retry", async () => {
    const [cli] = stubCli({ crash: true });
    const s = await withChat({ runCli: cli });
    try {
      const started = await s.chat.call("collect", { amount: 1 });
      const done = await s.chat.call("await_action", { wait_seconds: 2 });
      expect(started.data.run_id).toBeTruthy();
      expect(done.data.state).toBe("FINISHED");
      expect(JSON.stringify(done.data.engine_report)).toContain("nothing was confirmed");
      const rec = await s.chat.call("reconcile_last_action");
      expect(rec.isError).toBe(false);
      expect(rec.data.action).toBe("reconcile");
      // the follow-up tool names a stale run: refused
      expect((await s.chat.call("await_action", { run_id: "0".repeat(16) })).isError).toBe(true);
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
      const keysBefore = await keysOf(dirs.campaignDir);
      const second = await chat.call("observe_surroundings");
      expect(second.isError).toBe(false);
      const declined = await chat.call("await_action", { wait_seconds: 20 }, humanDeclines);
      expect(declined.data.state).toBe("FINISHED");
      expect(JSON.stringify(declined.data.engine_report)).not.toMatch(/COMMITTED|ESTABLISHED/);
      expect(await keysOf(dirs.campaignDir)).toEqual(keysBefore);
    } finally {
      await app.close();
    }
  }, 240_000);
});

const keysOf = async (campaignDir: string): Promise<string[]> => {
  const c = await openOrdinary(campaignDir);
  try {
    return c.store
      .listFacts()
      .map((f) => f.key)
      .sort();
  } finally {
    await c.close();
  }
};

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
    // no process, shell, provider, network client or file write in any of the three modules
    for (const code of [tools, mcp, oauth])
      expect(code).not.toMatch(
        /child_process|execSync|execFile|spawn|writeFile|fetch\(|anthropic|openai|@modelcontextprotocol|XMLHttpRequest|eval\(|new Function/i,
      );
    // the model-supplied arguments never name a campaign, path, role, permission, identity, time, owner key or confirmation
    expect(tools).not.toMatch(/args\["(campaign|path|role|permission|confirm|reply|time|key)/);
  });
});
