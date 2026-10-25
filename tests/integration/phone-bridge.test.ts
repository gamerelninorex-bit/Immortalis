/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted browser reads untyped JSON */
// The R-5 PHONE BRIDGE (apps/phone): a mobile-browser chat front end over the operator's and the referee's existing commands.
//
// EVERYTHING IN THIS FILE IS A MECHANISM TEST. The HTTP client below is a script, not a person: it proves transport, authentication,
// lane separation, the closed command set, fail-closed configuration and that the shipped commands run unchanged behind the front end.
// It is NOT a real player's choice, NOT a real game master's reading, and NOT First Playable evidence. No model or paid API is involved.
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig, type PhoneConfig } from "../../apps/phone/src/config.ts";
import { buildPlayerCommand, PLAYER_COMMANDS } from "../../apps/phone/src/commands.ts";
import { COMMON_JS, REFEREE_TOOLS_JS } from "../../apps/phone/src/pages.ts";
import { createPhoneServer, type PhoneDeps } from "../../apps/phone/src/server.ts";
import { stubCollectionRecovery } from "../support/chat-recovery.ts";
import { pendingPath } from "../../apps/phone/src/recovery.ts";
import { createWebTerminal } from "../../apps/phone/src/web-terminal.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, setupDoc } from "../support/locality.ts";
import { tempDir } from "../support/tmp.ts";
import { ACTUATOR_WORDS, TRAVERSAL_CANNOT } from "../support/pc-collection.ts";
import { BASIS, PC_WORDS, observationCampaign } from "../support/observation.ts";
import {
  HOST_ID,
  STANDARD,
  author,
  PC_ID,
  localityCampaign,
  plainPolicy,
  respondingConsole,
  startScriptedHost,
} from "../support/original-pc.ts";

// the operator directory is real (the front end keeps its pending-operation record there) and private to this file
const OPERATOR_DIR = tempDir("immortalis-phone-operator-");
beforeEach(() => rmSync(pendingPath(config()), { force: true }));

const PLAYER = "player-secret-0123456789-abcdefghijklmnopqrstuv";
const REFEREE = "referee-secret-0123456789-abcdefghijklmnopqrstuv";

const baseEnv = (over: Record<string, string> = {}): Record<string, string> => ({
  IMMORTALIS_CAMPAIGN_DIR: "/data/campaign",
  IMMORTALIS_CAMPAIGN_ID: "campaign-test",
  IMMORTALIS_OPERATOR_DIR: OPERATOR_DIR,
  IMMORTALIS_PLAYER_TOKEN: PLAYER,
  IMMORTALIS_REFEREE_TOKEN: REFEREE,
  IMMORTALIS_REFEREE_HOST_IDS: "gm-setup,gm-collection",
  ...over,
});

const config = (over: Partial<PhoneConfig> = {}): PhoneConfig => {
  const c = loadConfig(baseEnv({ IMMORTALIS_TRANSPORT: "insecure-loopback", PORT: "8080" }));
  if (!c.ok) throw new Error(c.problems.join("; "));
  return { ...c.value, port: 0, ...over };
};

/** a scripted browser: it keeps a cookie jar and the request token, exactly as the page's script does */
class Browser {
  cookie = "";
  csrf = "";
  readonly base: string;
  readonly extra: Record<string, string>;
  constructor(base: string, extra: Record<string, string> = {}) {
    this.base = base;
    this.extra = extra;
  }
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(this.csrf ? { "x-immortalis-csrf": this.csrf } : {}),
        ...this.extra,
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0] ?? "";
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, text, json };
  }
  async login(role: "player" | "referee", token: string) {
    const r = await this.req("POST", "/api/login", { role, token });
    if (r.status === 200) this.csrf = r.json.csrf;
    return r;
  }
  /** long-polls until the lane shows a pending prompt (or the run is over) */
  async untilPrompt(lane: "play" | "ref", from = 0) {
    let after = from;
    const seen: any[] = [];
    for (let i = 0; i < 60; i++) {
      const r = await this.req("GET", `/api/${lane}/poll?after=${after}`);
      seen.push(...(r.json?.lines ?? []));
      after = r.json?.seq ?? after;
      if (r.json?.pending || (r.json && r.json.running === false && seen.length > 0))
        return { snap: r.json, seen, after };
    }
    throw new Error("no prompt or end");
  }
}

async function serve(over: Partial<PhoneConfig> = {}, deps: PhoneDeps = {}) {
  const app = createPhoneServer(config(over), {
    pollMs: 300,
    ...(deps.runCli
      ? {
          recovery: {
            ...stubCollectionRecovery(deps.runCli),
            captureObservation: async (_c, pc) => ({
              pc_id: pc,
              basis: { value: 0, unit: "second" },
              task_id: "0".repeat(64),
              task_ids: Array.from({ length: 5 }, (_, i) => String(i).repeat(64)),
              event_id: "stub-observation",
            }),
          },
        }
      : {}),
    ...deps,
  });
  const port = await app.listen();
  return { app, base: `http://127.0.0.1:${port}` };
}

describe("MECHANISM: authenticated AI browser tools over the unchanged referee MCP", () => {
  it("only the referee session can call tools; player, cross-origin, wrong token and extra authority/path inputs are refused", async () => {
    const { app, base } = await serve();
    const request = { host_id: "gm-setup", tool: "referee_list_tasks", arguments: {} };
    try {
      const p = new Browser(base);
      expect((await p.req("POST", "/api/ref/tool", request)).status).toBe(401);
      await p.login("player", PLAYER);
      expect((await p.req("POST", "/api/ref/tool", request)).status).toBe(403);
      const r = new Browser(base);
      await r.login("referee", REFEREE);
      expect(
        (await r.req("POST", "/api/ref/tool", request, { origin: "https://evil.example" })).status,
      ).toBe(403);
      expect(
        (await r.req("POST", "/api/ref/tool", request, { "x-immortalis-csrf": "wrong" })).status,
      ).toBe(403);
      for (const changed of [
        { ...request, host_id: "../other" },
        { ...request, tool: "run_shell" },
        { ...request, campaign_id: "other" },
        { ...request, arguments: { permission: "rule.adjudicate" } },
        { ...request, tool: "referee_get_task", arguments: { task_id: "bad" } },
      ])
        expect((await r.req("POST", "/api/ref/tool", changed)).status).toBe(400);
      // Offered is not bound: no engine or canned answer stands in for the missing host.
      expect((await r.req("POST", "/api/ref/tool", request)).status).toBe(503);
    } finally {
      await app.close();
    }
  });

  it("carries actual engine tasks and rejects incomplete readings before accepting a scripted mechanism answer, once", async () => {
    const dirs = await localityCampaign();
    const asked = await author(
      dirs,
      respondingConsole(STANDARD),
      { refereePolls: 1, refereePollMs: 1 },
      null,
    );
    expect(asked.result.status).toBe("REFEREE_PENDING");
    const { app, base } = await serve({
      operatorDir: dirs.operatorDir,
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
      refereeHostIds: [HOST_ID],
    });
    try {
      const r = new Browser(base);
      await r.login("referee", REFEREE);
      const call = (tool: string, args: Record<string, unknown>) =>
        r.req("POST", "/api/ref/tool", { host_id: HOST_ID, tool, arguments: args });
      const listed = await call("referee_list_tasks", {});
      const tasks = JSON.parse(listed.json.content[0].text).tasks;
      expect(tasks).toHaveLength(1);
      const task_id = tasks[0].task_id;
      const got = await call("referee_get_task", { task_id });
      const doc = JSON.parse(got.json.content[0].text);
      expect(doc.task_id).toBe(task_id);
      expect(doc.nonce).toBeTruthy();
      expect(got.text).not.toContain(dirs.operatorDir);
      const answer = plainPolicy(doc) as { items: unknown[] };
      const bad = await call("referee_submit_decision", {
        task_id,
        answer: { ...answer, items: answer.items.slice(1) },
      });
      expect(bad.json.isError).toBe(true);
      expect(bad.text).toContain("COVERAGE_INCOMPLETE");
      expect(
        JSON.parse((await call("referee_list_tasks", {})).json.content[0].text).tasks,
      ).toHaveLength(1);
      const good = await call("referee_submit_decision", {
        task_id,
        answer,
        claimed_model: "scripted transport test, NOT AI",
      });
      expect(good.status).toBe(200);
      expect(good.json.isError).not.toBe(true);
      expect((await call("referee_submit_decision", { task_id, answer })).json.isError).toBe(true);
      expect(JSON.parse((await call("referee_list_tasks", {})).json.content[0].text).tasks).toEqual(
        [],
      );
    } finally {
      await app.close();
    }
  }, 120_000);

  it("registers exactly three tools without making an inference or submission; the AI supplies the answer and provenance", async () => {
    const registered: any[] = [];
    const calls: any[] = [];
    const state = { textContent: "" };
    const ctx = createContext({
      document: { modelContext: { registerTool: (spec: unknown) => registered.push(spec) } },
      navigator: {},
      HOSTS: ["gm-setup"],
      $: () => state,
      addLine: () => undefined,
      post: async (path: string, body: unknown) => {
        calls.push({ path, body });
        return { status: 200, body: { content: [{ type: "text", text: "recorded" }] } };
      },
    });
    await runInContext(REFEREE_TOOLS_JS, ctx);
    expect(registered.map((s) => s.name)).toEqual([
      "referee_list_tasks",
      "referee_get_task",
      "referee_submit_decision",
    ]);
    expect(calls).toEqual([]);
    const input = {
      host_id: "gm-setup",
      task_id: "a".repeat(64),
      answer: { reading: "the AI's own reasoning" },
      claimed_model: "actual host label",
    };
    await registered[2].execute(input);
    expect(calls).toEqual([
      {
        path: "/api/ref/tool",
        body: {
          host_id: input.host_id,
          tool: "referee_submit_decision",
          arguments: {
            task_id: input.task_id,
            answer: input.answer,
            claimed_model: input.claimed_model,
          },
        },
      },
    ]);
    expect(state.textContent).toContain("No unattended AI worker");
  });
});

describe("MECHANISM: configuration fails closed", () => {
  it("refuses to start without every secret, with a short, whitespace or shared token, or with plain HTTP off loopback", () => {
    expect(loadConfig(baseEnv()).ok).toBe(true);
    const bad = (over: Record<string, string>, drop: string[] = []) => {
      const env = baseEnv(over);
      for (const d of drop) delete env[d];
      return loadConfig(env);
    };
    for (const drop of [
      "IMMORTALIS_PLAYER_TOKEN",
      "IMMORTALIS_REFEREE_TOKEN",
      "IMMORTALIS_CAMPAIGN_DIR",
      "IMMORTALIS_CAMPAIGN_ID",
      "IMMORTALIS_OPERATOR_DIR",
      "IMMORTALIS_REFEREE_HOST_IDS",
    ])
      expect(bad({}, [drop]).ok, drop).toBe(false);
    expect(bad({ IMMORTALIS_PLAYER_TOKEN: "short" }).ok).toBe(false);
    expect(bad({ IMMORTALIS_PLAYER_TOKEN: `${PLAYER} with spaces` }).ok).toBe(false);
    expect(bad({ IMMORTALIS_REFEREE_TOKEN: PLAYER }).ok).toBe(false); // one secret for both lanes
    expect(bad({ IMMORTALIS_REFEREE_HOST_IDS: "a,a" }).ok).toBe(false);
    expect(bad({ IMMORTALIS_REFEREE_HOST_IDS: "bad host" }).ok).toBe(false);
    expect(bad({ IMMORTALIS_TRANSPORT: "http" }).ok).toBe(false);
    expect(
      bad({ IMMORTALIS_TRANSPORT: "insecure-loopback", IMMORTALIS_BIND_HOST: "0.0.0.0" }).ok,
    ).toBe(false);
    expect(bad({ IMMORTALIS_TRANSPORT: "insecure-loopback" }).ok).toBe(true);
    expect(bad({ PORT: "0" }).ok).toBe(false);
    expect(bad({ IMMORTALIS_CAMPAIGN_DIR: "relative/path" }).ok).toBe(false);
    // a refusal names the problem and never repeats a secret
    const refused = bad({ IMMORTALIS_PLAYER_TOKEN: "short" });
    expect(JSON.stringify(refused)).not.toContain(REFEREE);
  });
});

describe("MECHANISM: the closed command set builds the argument vector from the configuration, never from the request", () => {
  const cfg = () => ({ ...config(), setupDir: join(tempDir("phone-setup-"), "s") });

  it("accepts a listed command with its own options, and names the configured campaign", () => {
    const c = cfg();
    const built = buildPlayerCommand(c, {
      command: "collect",
      options: {
        world: "w",
        source: "s",
        reserve: "r",
        amount: "3",
        "quantity-unit": "sack",
        mechanism: "m",
        basis: "b",
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.argv.slice(0, 7)).toEqual([
      "collect",
      "--campaign",
      c.campaignDir,
      "--campaign-id",
      c.campaignId,
      "--operator-dir",
      c.operatorDir,
    ]);
  });

  it("refuses an unlisted command, an unlisted option, a campaign or directory named by the phone, a malformed value and a missing one", () => {
    const c = cfg();
    const refuse = (request: Parameters<typeof buildPlayerCommand>[1]) =>
      expect(buildPlayerCommand(c, request).ok, JSON.stringify(request)).toBe(false);
    refuse({ command: "rm -rf /" });
    refuse({ command: "constructor" });
    refuse({ command: "__proto__" });
    refuse({ command: "relocate", options: {} }); // a real operator command this front end does not offer
    refuse({ command: "status", options: { campaign: "/etc" } });
    refuse({ command: "status", options: { "operator-dir": "/tmp" } });
    refuse({ command: "cease", options: { confirmed: "true" } });
    refuse({ command: "collect", options: { world: "w" } });
    refuse({
      command: "collect",
      options: {
        world: "w; ls",
        source: "s",
        reserve: "r",
        amount: "3",
        "quantity-unit": "x",
        mechanism: "m",
        basis: "b",
      },
    });
    refuse({
      command: "collect",
      options: {
        world: "w",
        source: "s",
        reserve: "r",
        amount: "-1",
        "quantity-unit": "x",
        mechanism: "m",
        basis: "b",
      },
    });
    refuse({ command: "attest-cycle", options: { mechanism: "m", "referee-wait": "999999" } });
    refuse({ command: "initialize-time" }); // a setup command needs its document
    refuse({ command: "initialize-time", setup: "not json" });
    refuse({ command: "initialize-time", setup: "x".repeat(70_000) });
    refuse({ command: "status", setup: "{}" }); // no setup is accepted for a command that reads none
  });

  it("a pasted setting is written to a fresh owner-only file the server names, and removed afterwards", () => {
    const c = cfg();
    const built = buildPlayerCommand(c, { command: "initialize-time", setup: '{"a":1}' });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const file = built.value.argv[built.value.argv.indexOf("--setup") + 1]!;
    expect(file.startsWith(c.setupDir)).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(c.setupDir).mode & 0o777).toBe(0o700);
    expect(readFileSync(file, "utf8")).toBe('{"a":1}');
    built.value.cleanup();
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(c.setupDir)).toEqual([]);
  });

  it("offers exactly the collection loop's commands, none that move time by a stated horizon or relocate the character", () => {
    expect(Object.keys(PLAYER_COMMANDS).sort()).toEqual(
      [
        "attest-cycle",
        "author-character",
        "cease",
        "character-status",
        "clarify-collection-cycle",
        "collect",
        "collect-continue",
        "collect-finish",
        "declare-closed-setting",
        "establish-character-locus",
        "establish-locality",
        "initialize-time",
        "locality-status",
        "observe-surroundings",
        "prepare-collection",
        "reconcile",
        "referee-bind-collection-host",
        "referee-bind-host",
        "settle-collection-lapse",
        "status",
      ].sort(),
    );
  });
});

describe("MECHANISM: the browser console answers only what the person types", () => {
  it("a reply is accepted once, only for the current prompt; nothing answers by itself; an unanswered prompt is a DECLINE", async () => {
    const t = createWebTerminal({ askExpiryMs: 60 });
    const asked = t.ask("Type confirm:");
    const first = t.snapshot(0).pending!;
    expect(first.prompt).toBe("Type confirm:");
    expect(t.reply("not-the-id", "confirm")).toBe(false);
    expect(t.reply(first.id, "confirm")).toBe(true);
    expect(await asked).toBe("confirm");
    expect(t.reply(first.id, "confirm")).toBe(false); // once
    // an unanswered prompt expires as null (a decline), never as a confirmation
    const lonely = t.ask("Type confirm again:");
    expect(await lonely).toBeNull();
    // a second prompt while one waits is refused as a decline, not queued
    const a = t.ask("one");
    expect(await t.ask("two")).toBeNull();
    t.abort();
    expect(await a).toBeNull();
    await expect(t.ask("after close")).resolves.toBeNull();
  });
});

describe("MECHANISM: authentication, lanes and transport", () => {
  it("answers health without a secret, serves no page without a session and keeps security headers on every response", async () => {
    const { app, base } = await serve();
    try {
      const b = new Browser(base);
      const health = await b.req("GET", "/healthz");
      expect(health.status).toBe(200);
      expect(health.text).toBe("ok");
      for (const path of ["/play", "/referee"]) {
        const r = await b.req("GET", path);
        expect(r.status, path).toBe(303);
        expect(r.headers.get("location")).toBe("/");
      }
      for (const path of ["/api/play/poll", "/api/ref/poll"])
        expect((await b.req("GET", path)).status, path).toBe(401);
      const landing = await b.req("GET", "/");
      expect(landing.status).toBe(200);
      expect(landing.headers.get("cache-control")).toBe("no-store");
      expect(landing.headers.get("x-frame-options")).toBe("DENY");
      expect(landing.headers.get("content-security-policy")).toMatch(/default-src 'none'.*nonce-/);
      expect(landing.text).not.toContain(PLAYER);
      expect(landing.text).not.toContain(REFEREE);
    } finally {
      await app.close();
    }
  });

  it("refuses a wrong token, the other lane's token and a wrong role identically, and locks an address out after repeated failures", async () => {
    let clock = 1_000_000;
    const { app, base } = await serve({}, { now: () => clock });
    try {
      const b = new Browser(base);
      expect((await b.login("player", REFEREE)).status).toBe(401);
      expect((await b.login("referee", PLAYER)).status).toBe(401);
      expect((await b.login("player", "x".repeat(50))).status).toBe(401);
      const wrongRole = await b.req("POST", "/api/login", { role: "admin", token: PLAYER });
      expect(wrongRole.status).toBe(401);
      expect(wrongRole.json).toEqual({ error: "not authenticated" });
      expect((await b.login("player", "y".repeat(50))).status).toBe(401);
      // five failures: the right token is refused too while locked
      expect((await b.login("player", PLAYER)).status).toBe(429);
      clock += 16 * 60_000;
      expect((await b.login("player", PLAYER)).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("a signed-in player cannot reach the referee lane and a signed-in referee cannot reach the player lane", async () => {
    const { app, base } = await serve();
    try {
      const p = new Browser(base);
      expect((await p.login("player", PLAYER)).status).toBe(200);
      const r = new Browser(base);
      expect((await r.login("referee", REFEREE)).status).toBe(200);
      expect((await p.req("GET", "/referee")).status).toBe(303);
      expect((await r.req("GET", "/play")).status).toBe(303);
      expect((await p.req("GET", "/api/ref/poll")).status).toBe(403);
      expect((await r.req("GET", "/api/play/poll")).status).toBe(403);
      expect((await p.req("POST", "/api/ref/start", { host_id: "gm-setup" })).status).toBe(403);
      expect((await r.req("POST", "/api/play/command", { command: "status" })).status).toBe(403);
      expect((await p.req("GET", "/play")).status).toBe(200);
      expect((await r.req("GET", "/referee")).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("a session needs its own request token, JSON, and a same-origin request; logout ends it", async () => {
    const { app, base } = await serve();
    try {
      const p = new Browser(base);
      await p.login("player", PLAYER);
      const noToken = await p.req("POST", "/api/play/stop", {}, { "x-immortalis-csrf": "wrong" });
      expect(noToken.status).toBe(403);
      const cross = await p.req("POST", "/api/play/stop", {}, { origin: "https://evil.example" });
      expect(cross.status).toBe(403);
      const notJson = await fetch(`${base}/api/play/stop`, {
        method: "POST",
        headers: { cookie: p.cookie, "x-immortalis-csrf": p.csrf, "content-type": "text/plain" },
        body: "{}",
      });
      expect(notJson.status).toBe(415);
      expect((await p.req("POST", "/api/play/stop", {})).status).toBe(200);
      expect((await p.req("POST", "/api/logout", {})).status).toBe(200);
      expect((await p.req("GET", "/api/play/poll")).status).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("signing in again ends the lane's earlier session (one session per lane)", async () => {
    const { app, base } = await serve();
    try {
      const first = new Browser(base);
      await first.login("player", PLAYER);
      const second = new Browser(base);
      await second.login("player", PLAYER);
      expect((await first.req("GET", "/api/play/poll?after=0")).status).toBe(401);
      expect((await second.req("GET", "/api/play/poll?after=0")).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("proxy mode serves only HTTPS (as the edge reports it), sets a Secure cookie and trusts nothing else", async () => {
    const proxy = loadConfig(baseEnv());
    if (!proxy.ok) throw new Error("config");
    const { app, base } = await serve({ transport: "proxy", bindHost: "127.0.0.1" });
    void proxy;
    try {
      const plain = new Browser(base);
      expect((await plain.req("GET", "/")).status).toBe(421);
      expect((await plain.req("GET", "/healthz")).status).toBe(200); // the platform's health probe
      const tls = new Browser(base, { "x-forwarded-proto": "https" });
      const r = await tls.login("player", PLAYER);
      expect(r.status).toBe(200);
      const cookie = r.headers.get("set-cookie") ?? "";
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Secure/);
      expect(r.text).not.toContain(PLAYER);
    } finally {
      await app.close();
    }
  });
});

describe("MECHANISM: the lanes run the commands as given, with nothing supplied for the person", () => {
  it("runs the closed command with the configured campaign, relays its prompts, and a typed reply is the only answer it gets", async () => {
    const calls: string[][] = [];
    const answers: (string | null)[] = [];
    const deps: PhoneDeps = {
      runCli: async (argv, env) => {
        calls.push([...argv]);
        env.out?.("(banner)");
        answers.push(await env.terminal!.ask("Type confirm to proceed:"));
        env.out?.("STATUS DONE");
        return 0;
      },
    };
    const { app, base } = await serve({}, deps);
    try {
      const p = new Browser(base);
      await p.login("player", PLAYER);
      // a command that is not offered never reaches the runner
      expect((await p.req("POST", "/api/play/command", { command: "relocate" })).status).toBe(400);
      expect(calls).toEqual([]);
      expect((await p.req("POST", "/api/play/command", { command: "cease" })).status).toBe(200);
      // a second command while one runs is refused
      expect((await p.req("POST", "/api/play/command", { command: "status" })).status).toBe(409);
      const { snap } = await p.untilPrompt("play");
      expect(snap.pending.prompt).toBe("Type confirm to proceed:");
      expect(answers).toEqual([]); // nothing has answered it
      expect(
        (await p.req("POST", "/api/play/reply", { prompt_id: "stale", text: "confirm" })).status,
      ).toBe(409);
      expect(answers).toEqual([]);
      expect(
        (await p.req("POST", "/api/play/reply", { prompt_id: snap.pending.id, text: "I confirm" }))
          .status,
      ).toBe(200);
      const done = await p.untilPrompt("play", snap.seq);
      expect(done.snap.running).toBe(false);
      expect(answers).toEqual(["I confirm"]); // exactly what was typed, nothing added or normalized
      expect(calls[0]!.slice(0, 7)).toEqual([
        "cease",
        "--campaign",
        config().campaignDir,
        "--campaign-id",
        config().campaignId,
        "--operator-dir",
        config().operatorDir,
      ]);
    } finally {
      await app.close();
    }
  });

  it("stopping a command declines its pending prompt: the command sees no confirmation", async () => {
    const answers: (string | null)[] = [];
    const { app, base } = await serve(
      {},
      {
        runCli: async (_argv, env) => {
          answers.push(await env.terminal!.ask("Type confirm:"));
          return 2;
        },
      },
    );
    try {
      const p = new Browser(base);
      await p.login("player", PLAYER);
      await p.req("POST", "/api/play/command", { command: "cease" });
      await p.untilPrompt("play");
      expect((await p.req("POST", "/api/play/stop", {})).status).toBe(200);
      for (let i = 0; i < 50 && answers.length === 0; i++)
        await new Promise((r) => setTimeout(r, 20));
      expect(answers).toEqual([null]);
    } finally {
      await app.close();
    }
  });

  it("the referee lane serves only the configured bound hosts, with the exchange's own secret file, and its answers are the referee's typed words", async () => {
    const seen: { argv: readonly string[]; asked: (string | null)[] }[] = [];
    const { app, base } = await serve(
      {},
      {
        runRefereeConsole: async (argv, terminal) => {
          const record = { argv: [...argv], asked: [] as (string | null)[] };
          seen.push(record);
          record.asked.push(
            await terminal.ask("Enter your own answer as one JSON object, or skip:"),
          );
          return 0;
        },
      },
    );
    try {
      const r = new Browser(base);
      await r.login("referee", REFEREE);
      expect((await r.req("POST", "/api/ref/start", { host_id: "not-bound" })).status).toBe(400);
      expect((await r.req("POST", "/api/ref/start", { host_id: "../../etc/passwd" })).status).toBe(
        400,
      );
      expect(seen).toEqual([]);
      expect((await r.req("POST", "/api/ref/start", { host_id: "gm-collection" })).status).toBe(
        200,
      );
      const { snap } = await r.untilPrompt("ref");
      expect(seen[0]!.argv.slice(0, 6)).toEqual([
        "--operator-dir",
        config().operatorDir,
        "--campaign-id",
        config().campaignId,
        "--host-id",
        "gm-collection",
      ]);
      expect(seen[0]!.argv[6]).toBe("--secret-file");
      expect(seen[0]!.argv[7]).toMatch(/gm-collection\.secret$/);
      expect(seen[0]!.asked).toEqual([]);
      const typed = '{"reading":"the GM\'s own words"}';
      await r.req("POST", "/api/ref/reply", { prompt_id: snap.pending.id, text: typed });
      for (let i = 0; i < 50 && seen[0]!.asked.length === 0; i++)
        await new Promise((res) => setTimeout(res, 20));
      expect(seen[0]!.asked).toEqual([typed]);
    } finally {
      await app.close();
    }
  });
});

/**
 * The page's OWN script (COMMON_JS) run in a stub browser: the same cursor, run-identity and backoff code the phone runs, against either
 * the real server (over HTTP, with the signed-in cookie and request token) or a stub fetch. A script, not a person.
 */
function pageClient(o: {
  fetchImpl: (url: string, init?: any) => Promise<any>;
  csrf?: string;
  setTimeoutImpl?: (fn: () => void, ms: number) => number;
  clearTimeoutImpl?: (id: number) => void;
}) {
  const els = new Map<string, any>();
  const el = (id: string) => {
    if (!els.has(id))
      els.set(id, {
        id,
        value: "",
        disabled: false,
        hidden: false,
        textContent: "",
        focus() {},
        appendChild(d: any) {
          log.push(d);
        },
      });
    return els.get(id);
  };
  const log: { className: string; textContent: string }[] = [];
  const ctx = createContext({
    document: {
      getElementById: el,
      querySelector: () => (o.csrf ? { content: o.csrf } : null),
      createElement: () => ({ className: "", textContent: "", scrollIntoView() {} }),
    },
    location: { href: "" },
    fetch: o.fetchImpl,
    setTimeout: o.setTimeoutImpl ?? setTimeout,
    clearTimeout: o.clearTimeoutImpl ?? clearTimeout,
    onState: undefined,
  });
  const api = runInContext(
    `${COMMON_JS};({loop,sendReply,post,state:()=>({after,runId,pending})})`,
    ctx,
  ) as {
    loop: (base: string) => Promise<void>;
    sendReply: (base: string) => Promise<void>;
    post: (path: string, body: unknown) => Promise<{ status: number; body: any }>;
    state: () => { after: number; runId: string | null; pending: { id: string } | null };
  };
  return { api, log, el, texts: () => log.map((l) => l.textContent), ctx };
}

const until = async (cond: () => boolean, what: string, ms = 8000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** a page whose script talks to the real server as the signed-in browser */
async function signedInPage(base: string, role: "player" | "referee") {
  const b = new Browser(base);
  await b.login(role, role === "player" ? PLAYER : REFEREE);
  let halt = false;
  const page = pageClient({
    csrf: b.csrf,
    fetchImpl: async (url, init = {}) => {
      if (halt) return { status: 401, json: async () => ({}) };
      const res = await fetch(`${base}${url}`, {
        ...init,
        headers: { ...(init.headers ?? {}), cookie: b.cookie },
      });
      return { status: res.status, json: () => res.json() };
    },
  });
  const base_ = role === "player" ? "/api/play" : "/api/ref";
  void page.api.loop(base_);
  return { page, base_, stop: () => (halt = true) };
}

describe("MECHANISM (BLUE P-2): every new run replays from its own start; no line of a later command is lost", () => {
  it("two successive real commands on one signed-in phone session: every output line and prompt of the second command is shown, and each reply reaches only the current prompt", async () => {
    const answers: (string | null)[] = [];
    let n = 0;
    const { app, base } = await serve(
      {},
      {
        runCli: async (_argv, env) => {
          const k = ++n;
          const lines = k === 1 ? 20 : 6;
          for (let i = 1; i <= lines; i++) env.out?.(`run${k}-line${i}`);
          answers.push(await env.terminal!.ask(`run${k}-prompt`));
          env.out?.(`run${k}-after-answer`);
          return 0;
        },
      },
    );
    const { page, stop } = await signedInPage(base, "player");
    try {
      expect((await page.api.post("/api/play/command", { command: "status" })).status).toBe(200);
      await until(() => page.api.state().pending !== null, "run 1 prompt");
      expect(page.texts().filter((t) => t.startsWith("run1-line"))).toHaveLength(20);
      page.el("reply").value = "first typed";
      await page.api.sendReply("/api/play");
      await until(() => page.texts().includes("run1-after-answer"), "run 1 end");
      await until(() => page.api.state().pending === null, "prompt cleared");
      const afterFirst = page.api.state();
      expect(afterFirst.after).toBeGreaterThan(20); // the cursor sits past run 1's output, as in the reported failure

      await until(() => !page.el("state").textContent.startsWith("running"), "run 1 done");
      expect((await page.api.post("/api/play/command", { command: "status" })).status).toBe(200);
      await until(() => page.api.state().pending !== null, "run 2 prompt");
      // every one of run 2's lines arrived although the old cursor was past their sequence numbers
      for (let i = 1; i <= 6; i++) expect(page.texts()).toContain(`run2-line${i}`);
      expect(page.texts()).toContain("run2-prompt");
      // run 2's lines are shown once and run 1's were not replayed
      expect(page.texts().filter((t) => t === "run2-line1")).toHaveLength(1);
      expect(page.texts().filter((t) => t === "run1-line1")).toHaveLength(1);
      expect(page.api.state().runId).not.toBe(afterFirst.runId);
      page.el("reply").value = "second typed";
      await page.api.sendReply("/api/play");
      await until(() => page.texts().includes("run2-after-answer"), "run 2 end");
      // each reply reached only the prompt that was current
      expect(answers).toEqual(["first typed", "second typed"]);
    } finally {
      stop();
      await app.close();
    }
  });

  it("two distinct referee sessions on one signed-in GM session: the second session's context and prompt are all shown", async () => {
    const answers: (string | null)[] = [];
    let n = 0;
    const { app, base } = await serve(
      {},
      {
        runRefereeConsole: async (_argv, terminal) => {
          const k = ++n;
          for (let i = 1; i <= (k === 1 ? 15 : 4); i++) terminal.say(`gm${k}-context${i}`);
          answers.push(await terminal.ask(`gm${k}-question`));
          return 0;
        },
      },
    );
    const { page, stop } = await signedInPage(base, "referee");
    try {
      for (const k of [1, 2]) {
        expect((await page.api.post("/api/ref/start", { host_id: "gm-collection" })).status).toBe(
          200,
        );
        await until(() => page.texts().includes(`gm${k}-question`), `gm${k} prompt`);
        await until(() => page.api.state().pending !== null, `gm${k} pending`);
        for (let i = 1; i <= (k === 1 ? 15 : 4); i++)
          expect(page.texts()).toContain(`gm${k}-context${i}`);
        page.el("reply").value = `reading ${k}`;
        await page.api.sendReply("/api/ref");
        await until(() => page.el("state").textContent === "idle", `gm${k} closed`);
      }
      expect(answers).toEqual(["reading 1", "reading 2"]);
    } finally {
      stop();
      await app.close();
    }
  });

  it("the server itself names the run and restarts a stale cursor at the new run's first line", async () => {
    let n = 0;
    const { app, base } = await serve(
      {},
      {
        runCli: async (_argv, env) => {
          const k = ++n;
          for (let i = 1; i <= 5; i++) env.out?.(`r${k}-${i}`);
          return 0;
        },
      },
    );
    try {
      const p = new Browser(base);
      await p.login("player", PLAYER);
      await p.req("POST", "/api/play/command", { command: "status" });
      const first = await p.untilPrompt("play");
      const run1 = (await p.req("GET", `/api/play/poll?after=${first.after}`)).json.run;
      expect(run1).toMatch(/^[0-9a-f]{16}$/);
      await p.req("POST", "/api/play/command", { command: "status" });
      // the old cursor (past 5) with the OLD run's identity must not hide the new run's lines
      const stale = await p.req("GET", `/api/play/poll?after=${first.after}&run=${run1}`);
      expect(stale.json.run).not.toBe(run1);
      expect(stale.json.lines.map((l: any) => l.text)).toContain("r2-1");
      expect(stale.json.lines[0].seq).toBe(1);
    } finally {
      await app.close();
    }
  });
});

describe("MECHANISM (BLUE P-1): an idle or finished page does not hammer the server, and the idle expiry is not defeated by polling", () => {
  it("the page's own script, given a server that answers an idle lane at once, makes a bounded number of requests over ten minutes", async () => {
    const timers: { id: number; at: number; fn: () => void }[] = [];
    let clock = 0;
    let next = 0;
    let requests = 0;
    const page = pageClient({
      fetchImpl: async () => {
        requests++;
        if (requests > 5000) return new Promise(() => undefined); // an unbounded loop is stopped here and fails the bound below
        return {
          status: 200,
          json: async () => ({ running: false, run: null, seq: 0, lines: [], pending: null }),
        };
      },
      setTimeoutImpl: (fn, ms) => {
        timers.push({ id: ++next, at: clock + ms, fn });
        return next;
      },
      clearTimeoutImpl: (id) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    void page.api.loop("/api/play");
    const TEN_MINUTES = 10 * 60_000;
    for (;;) {
      await new Promise((r) => setImmediate(r));
      if (requests > 5000 || timers.length === 0) break;
      timers.sort((a, b) => a.at - b.at);
      const t = timers.shift()!;
      if (t.at > TEN_MINUTES) break;
      clock = t.at;
      t.fn();
    }
    // 1,2,4,8 s then every 10 s: about 65 requests in ten minutes — not thousands
    expect(requests).toBeGreaterThan(10);
    expect(requests).toBeLessThanOrEqual(70);
  });

  it("the page answers new output at once: a run that produces lines is polled again with no wait", async () => {
    let calls = 0;
    const waits: number[] = [];
    const page = pageClient({
      fetchImpl: async () => {
        calls++;
        if (calls > 6) return new Promise(() => undefined);
        return {
          status: 200,
          json: async () => ({
            running: true,
            run: "aaaaaaaaaaaaaaaa",
            label: "x",
            seq: calls,
            lines: [{ seq: calls, kind: "say", text: `l${calls}` }],
            pending: null,
          }),
        };
      },
      setTimeoutImpl: (fn, ms) => {
        waits.push(ms);
        fn();
        return 1;
      },
    });
    void page.api.loop("/api/play");
    await until(() => calls > 6, "six polls");
    expect(waits).toEqual([]); // no sleeping between polls while output keeps arriving
    expect(page.texts()).toEqual(["l1", "l2", "l3", "l4", "l5", "l6"]);
  });

  it("the server holds a poll on an idle lane and on a finished run instead of answering at once, and wakes it when a new run starts", async () => {
    const { app, base } = await serve(
      {},
      {
        pollMs: 600,
        runCli: async (_argv, env) => {
          env.out?.("done");
          return 0;
        },
      },
    );
    try {
      const p = new Browser(base);
      await p.login("player", PLAYER);
      const t0 = Date.now();
      const idle = await p.req("GET", "/api/play/poll?after=0");
      expect(Date.now() - t0).toBeGreaterThanOrEqual(500); // held, not answered at once
      expect(idle.json.run).toBeNull();

      await p.req("POST", "/api/play/command", { command: "status" });
      const fin = await p.untilPrompt("play");
      const t1 = Date.now();
      const caughtUp = await p.req("GET", `/api/play/poll?after=${fin.after}`);
      expect(Date.now() - t1).toBeGreaterThanOrEqual(500); // a finished, caught-up run is held too
      expect(caughtUp.json.running).toBe(false);

      // ...and a held poll returns promptly when a NEW run starts
      const held = p.req("GET", `/api/play/poll?after=${fin.after}&run=${caughtUp.json.run}`);
      await new Promise((r) => setTimeout(r, 100));
      const t2 = Date.now();
      await p.req("POST", "/api/play/command", { command: "status" });
      const woke = await held;
      expect(Date.now() - t2).toBeLessThan(400);
      expect(woke.json.lines.map((l: any) => l.text)).toContain("done");
    } finally {
      await app.close();
    }
  });

  it("automatic polling does not keep a session alive: with a poll every minute the 30-minute inactivity expiry still ends it; a person's own request does refresh it", async () => {
    let t = Date.UTC(2026, 9, 16, 12, 0, 0);
    const { app, base } = await serve({}, { pollMs: 5, now: () => t });
    try {
      const p = new Browser(base);
      await p.login("player", PLAYER);
      const statuses: number[] = [];
      for (let minute = 1; minute <= 33; minute++) {
        t += 60_000;
        statuses.push((await p.req("GET", "/api/play/poll?after=0")).status);
      }
      // polls through minute 30 are within the inactivity limit; from minute 31 the session is gone although it polled every minute
      expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
      expect(statuses.slice(30).every((s) => s === 401)).toBe(true);

      // a person's own request (a stop, a reply, a command) is activity
      const q = new Browser(base);
      await q.login("player", PLAYER);
      t += 25 * 60_000;
      expect((await q.req("POST", "/api/play/stop", {})).status).toBe(200); // human activity at +25 min
      t += 25 * 60_000;
      expect((await q.req("GET", "/api/play/poll?after=0")).status).toBe(200); // 25 min after the person, not 50
      t += 10 * 60_000; // 35 min after the person; the poll five lines above does not count
      expect((await q.req("GET", "/api/play/poll?after=0")).status).toBe(401);
    } finally {
      await app.close();
    }
  });
});

// -- BLUE live R-5 blocker: a complete referee task must reach the phone whole ------------------------------------------------------
/** what a consumer of successive polls sees: consecutive lines of one text (`more`) are one text, in order */
const reconstruct = (
  lines: readonly { kind: string; text: string; more?: boolean }[],
): string[] => {
  const out: string[] = [];
  let open = false;
  for (const l of lines) {
    if (open) out[out.length - 1] += l.text;
    else out.push(l.text);
    open = l.more === true;
  }
  return out;
};

/** a referee task as the exchange returns it: many candidate items with long quoted evidence, well over one line and over 16 kB */
const bigTask = () => {
  const items = Array.from({ length: 90 }, (_, i) => ({
    item_id: `item-${String(i).padStart(3, "0")}-${"f".repeat(48)}`,
    quoted_evidence: `Continuity text ${i}: “I am one co${"mrade among many, ".repeat(6)}” 😀 — naïve café ${"ü".repeat(10)}`,
  }));
  return JSON.stringify(
    {
      task_id: "b63c08048c155684f8b6face88aaa9d13398ccb6003461885bbe75b0d75b5a5b",
      context: { candidate: items },
      response_shape: { each_item: "required" },
    },
    null,
    2,
  );
};

describe("MECHANISM (BLUE live R-5 blocker): a long referee task is carried whole to the phone, never cut", () => {
  it("carries a text of any length above one line as ordered lines that rebuild the original exactly, never splitting a character", () => {
    const edge = `${"a".repeat(8191)}😀${"b".repeat(100)}`; // a surrogate pair straddles the line boundary
    const cases = [
      "",
      "x",
      "y".repeat(8192),
      "z".repeat(8193),
      edge,
      bigTask(),
      `${bigTask()}${bigTask()}${bigTask()}`,
    ];
    for (const text of cases) {
      const t = createWebTerminal();
      t.say(text);
      const { lines } = t.snapshot(0);
      expect(reconstruct(lines)).toEqual([text]);
      for (const l of lines) {
        expect(l.text.length).toBeLessThanOrEqual(8192);
        expect(l.text).not.toContain("…");
        expect(() => encodeURIComponent(l.text)).not.toThrow(); // no lone surrogate at a cut
      }
      expect(lines.map((l) => l.seq)).toEqual(lines.map((_, i) => i + 1));
      expect(lines.slice(0, -1).every((l) => l.more === true)).toBe(true);
      expect(lines.at(-1)!.more).toBeUndefined();
    }
    expect(bigTask().length).toBeGreaterThan(16 * 1024);
  });

  it("an ask and a typed reply longer than one line are carried whole too; only a text beyond the bound is shortened, and the loss is announced", async () => {
    const t = createWebTerminal({ askExpiryMs: 5000 });
    const question = bigTask();
    const answer = JSON.stringify({ reading: "r".repeat(15000) });
    const asked = t.ask(question);
    const snap = t.snapshot(0);
    expect(snap.pending!.prompt).toBe(question);
    expect(t.reply(snap.pending!.id, answer)).toBe(true);
    expect(await asked).toBe(answer);
    expect(reconstruct(t.snapshot(0).lines)).toEqual([question, answer]);

    const huge = "h".repeat(1024 * 1024 + 500);
    const u = createWebTerminal();
    u.say(huge);
    const rebuilt = reconstruct(u.snapshot(0).lines);
    expect(rebuilt[0]).toBe("h".repeat(1024 * 1024));
    expect(rebuilt[1]).toMatch(/500 further characters .* too long to show/);
  });

  it("the whole task reaches the GM's phone through successive polls (real server, the page's own script), and the player lane cannot see it", async () => {
    const task = bigTask();
    const answers: (string | null)[] = [];
    const { app, base } = await serve(
      {},
      {
        runRefereeConsole: async (_argv, terminal) => {
          terminal.say(task); // exactly what the real console does with `got.text`
          answers.push(await terminal.ask("Enter your own answer as one JSON object, or skip:"));
          return 0;
        },
      },
    );
    const { page, stop } = await signedInPage(base, "referee");
    try {
      expect((await page.api.post("/api/ref/start", { host_id: "gm-setup" })).status).toBe(200);
      await until(() => page.api.state().pending !== null, "the GM prompt");
      // the page shows the task as ONE contiguous text, complete, in the order sent
      expect(page.texts()).toContain(task);
      expect(page.texts().filter((x) => x.includes("item-089-"))).toHaveLength(1);
      expect(
        JSON.parse(page.texts().find((x) => x.startsWith("{"))!).context.candidate,
      ).toHaveLength(90);

      // the same, read by hand over several raw polls with the cursor
      const gm = new Browser(base);
      await gm.login("referee", REFEREE);
      const got: any[] = [];
      let after = 0;
      let run = "";
      for (let i = 0; i < 20; i++) {
        const r = await gm.req("GET", `/api/ref/poll?after=${after}${run ? `&run=${run}` : ""}`);
        got.push(...r.json.lines);
        after = r.json.seq;
        run = r.json.run;
        if (r.json.pending) break;
      }
      expect(got.filter((l) => l.kind === "say").length).toBeGreaterThan(2); // several mobile-sized lines
      expect(reconstruct(got.filter((l) => l.kind === "say"))).toEqual([task]);

      // role separation: the player lane (and no one) cannot read the GM's text
      const player = new Browser(base);
      await player.login("player", PLAYER);
      const denied = await player.req("GET", "/api/ref/poll?after=0");
      expect(denied.status).toBe(403);
      expect(denied.text).not.toContain("item-000");
      expect((await new Browser(base).req("GET", "/api/ref/poll?after=0")).status).toBe(401);
      expect(answers).toEqual([]); // nothing answered it
    } finally {
      stop();
      await app.close();
    }
  });
});

describe("MECHANISM: the SHIPPED commands run unchanged behind the front end (a script types the replies; this is not a person)", () => {
  it("establish-locality over HTTP creates the campaign only when the typed confirmation is given; the referee lane serves a really bound host", async () => {
    const root = tempDir("phone-e2e-");
    const campaignDir = join(root, "campaign");
    const operatorDir = join(root, "operator");
    const { app, base } = await serve({
      campaignDir,
      operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      setupDir: join(operatorDir, "phone-setup"),
    });
    try {
      const p = new Browser(base);
      await p.login("player", PLAYER);
      const doc = JSON.stringify(setupDoc());

      const phraseOf = (lines: any[]) => {
        const m = /type exactly "([^"]+)"/.exec(lines.map((l: any) => l.text).join("\n"));
        if (!m) throw new Error("no challenge phrase was shown");
        return m[1]!;
      };
      const finish = async (from: number) => {
        let after = from;
        for (let i = 0; i < 400; i++) {
          const s = await p.req("GET", `/api/play/poll?after=${after}`);
          after = s.json.seq ?? after;
          if (s.json.running === false) return s.json;
        }
        throw new Error("the command did not finish");
      };

      // 1. a WRONG typed reply (the word "confirm", not the challenge phrase) is a decline: nothing is written
      await p.req("POST", "/api/play/command", { command: "establish-locality", setup: doc });
      let step = await p.untilPrompt("play");
      expect(phraseOf(step.seen)).toMatch(/^establish-locality [0-9a-f]+$/);
      await p.req("POST", "/api/play/reply", { prompt_id: step.snap.pending.id, text: "confirm" });
      await finish(0);
      expect(existsSync(campaignDir)).toBe(false);
      expect(readdirSync(join(operatorDir, "phone-setup"))).toEqual([]); // the pasted file is gone

      // 2. the exact challenge phrase, typed: the same shipped command now creates the campaign
      await p.req("POST", "/api/play/command", { command: "establish-locality", setup: doc });
      step = await p.untilPrompt("play");
      await p.req("POST", "/api/play/reply", {
        prompt_id: step.snap.pending.id,
        text: phraseOf(step.seen),
      });
      const end = await finish(0);
      const all = (await p.req("GET", "/api/play/poll?after=0")).json.lines
        .map((l: any) => l.text)
        .join("\n");
      expect(all).toMatch(/ready|established|committed/i);
      expect(end.running).toBe(false);
      expect(existsSync(campaignDir)).toBe(true);

      // 3. a read-only command through the same front end
      await p.req("POST", "/api/play/command", { command: "locality-status" });
      const status = await p.untilPrompt("play");
      expect(status.seen.map((l: any) => l.text).join("\n")).toContain(LOCALITY_CAMPAIGN);

      // 4. the referee lane: bind a real host through the player lane's operator command, then open its real console
      await p.req("POST", "/api/play/command", {
        command: "referee-bind-host",
        options: { "host-id": "gm-setup" },
      });
      step = await p.untilPrompt("play");
      if (step.snap.pending)
        await p.req("POST", "/api/play/reply", {
          prompt_id: step.snap.pending.id,
          text: phraseOf(step.seen),
        });
      await finish(0);
      const r = new Browser(base);
      await r.login("referee", REFEREE);
      expect((await r.req("POST", "/api/ref/start", { host_id: "gm-setup" })).status).toBe(200);
      const gm = await r.untilPrompt("ref");
      const shown = gm.seen.map((l: any) => l.text).join("\n");
      expect(shown).toMatch(/REFEREE CONSOLE/);
      expect(gm.snap.pending.prompt).toMatch(/task_id/);
      await r.req("POST", "/api/ref/reply", { prompt_id: gm.snap.pending.id, text: "quit" });
      const closed = await r.untilPrompt("ref", gm.after);
      expect(closed.snap.running).toBe(false);
    } finally {
      await app.close();
    }
  }, 120_000);
});

describe("static: the front end opens no shell, evaluates nothing and holds no model or provider", () => {
  const dir = "apps/phone/src";
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  it("has no process execution, dynamic code, wall-clock identity or provider reference, and reads the environment in main.ts alone", () => {
    expect(files.sort()).toEqual([
      "character-evidence.ts",
      "character-recovery.ts",
      "chat-tools.ts",
      "collection-recovery.ts",
      "commands.ts",
      "config.ts",
      "locality-evidence.ts",
      "main.ts",
      "mcp-http.ts",
      "oauth.ts",
      "pages.ts",
      "preflight.ts",
      "prepare-chat.ts",
      "recovery.ts",
      "referee-tools.ts",
      "runs.ts",
      "scenario.ts",
      "server.ts",
      "setup-recovery.ts",
      "web-terminal.ts",
    ]);
    for (const f of files) {
      const code = readFileSync(join(dir, f), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(code, f).not.toMatch(
        /child_process|\beval\b|new Function|\brequire\(|\bimport\(|vm\.|worker_threads/,
      );
      expect(code, f).not.toMatch(/anthropic|openai|api[_-]?key|Math\.random/i);
      if (f !== "main.ts") expect(code, f).not.toMatch(/process\.env/);
    }
  });

  it("the pages insert server text only as text and carry no inline event handler or secret", () => {
    const pages = readFileSync(join(dir, "pages.ts"), "utf8");
    expect(pages).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\bon[a-z]+=["']/,
    );
    expect(pages).toMatch(/textContent/);
  });

  it("serves no file from disk and executes no operator-supplied path", () => {
    const code = readFileSync(join(dir, "server.ts"), "utf8");
    expect(code).not.toMatch(/readFile|createReadStream|serveStatic/);
    const cmd = readFileSync(join(dir, "commands.ts"), "utf8");
    expect(cmd).not.toMatch(/exec|spawn/);
  });
});

describe("MECHANISM (R-5): the SHIPPED clarify-collection-cycle runs unchanged behind the front end (a script types the player's words; this is not a person)", () => {
  it("the player's words are typed at the console prompt; a wrong confirmation writes nothing; the exact phrase makes them an accepted claim; the request itself can carry neither words nor a rate", async () => {
    const dirs = (
      await observationCampaign({
        words: { embodiment: `${PC_WORDS.embodiment}; ${ACTUATOR_WORDS}; ${TRAVERSAL_CANNOT}` },
      })
    ).dirs;
    const host = startScriptedHost(dirs, plainPolicy); // PLUMBING ONLY: the scripted policy stands in for the bound referee host
    const { app, base } = await serve({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      setupDir: join(dirs.operatorDir, "phone-setup"),
    });
    const keysOf = async () => {
      const c = await openOrdinary(dirs.campaignDir);
      try {
        return c.store.listFacts().map((f) => f.key);
      } finally {
        await c.close();
      }
    };
    const clarifications = (keys: string[]) =>
      keys.filter((k) => k.startsWith(`pc/${PC_ID}/intrinsic-clarification/`));
    try {
      const p = new Browser(base);
      await p.login("player", PLAYER);
      const phraseOf = (lines: any[]) => {
        const m = /type exactly "([^"]+)"/.exec(lines.map((l: any) => l.text).join("\n"));
        if (!m) throw new Error("no challenge phrase was shown");
        return m[1]!;
      };
      const finish = async () => {
        let after = 0;
        for (let i = 0; i < 400; i++) {
          const s = await p.req("GET", `/api/play/poll?after=${after}`);
          after = s.json.seq ?? after;
          if (s.json.running === false) return s.json;
        }
        throw new Error("the command did not finish");
      };
      const transcript = async () =>
        (await p.req("GET", "/api/play/poll?after=0")).json.lines
          .map((l: any) => l.text)
          .join("\n");
      const start = () =>
        p.req("POST", "/api/play/command", {
          command: "clarify-collection-cycle",
          options: { "player-character": PC_ID, "referee-wait": "20" },
        });
      const words = `It takes me 12 ${BASIS.unit} to lift and carry one lump`;
      expect(clarifications(await keysOf())).toEqual([]);

      // the words are NOT part of the request: the command accepts no words, no rate and no option beyond its two
      expect(
        (
          await p.req("POST", "/api/play/command", {
            command: "clarify-collection-cycle",
            options: { "player-character": PC_ID, words, rate: "12" },
          })
        ).status,
      ).toBe(400);

      // 1. the words are typed at the prompt; a WRONG confirmation ("confirm") declines and writes nothing
      expect((await start()).status).toBe(200);
      let step = await p.untilPrompt("play");
      expect(step.snap.pending.prompt).toMatch(/own account/);
      await p.req("POST", "/api/play/reply", { prompt_id: step.snap.pending.id, text: words });
      step = await p.untilPrompt("play", step.after);
      expect(phraseOf(step.seen)).toMatch(/^accept-clarification [0-9a-f]+$/);
      await p.req("POST", "/api/play/reply", { prompt_id: step.snap.pending.id, text: "confirm" });
      await finish();
      expect(await transcript()).toContain("STATUS DECLINED");
      expect(clarifications(await keysOf())).toEqual([]);

      // 2. the exact phrase, typed: the same shipped command makes the words an accepted claim of the character
      expect((await start()).status).toBe(200);
      step = await p.untilPrompt("play");
      await p.req("POST", "/api/play/reply", { prompt_id: step.snap.pending.id, text: words });
      step = await p.untilPrompt("play", step.after);
      await p.req("POST", "/api/play/reply", {
        prompt_id: step.snap.pending.id,
        text: phraseOf(step.seen),
      });
      const end = await finish();
      expect(end.running).toBe(false);
      const shown = await transcript();
      expect(shown).toContain("STATUS CLARIFICATION_ACCEPTED");
      expect(shown).toContain('"clarified"');
      expect(clarifications(await keysOf())).toHaveLength(1);
    } finally {
      await app.close();
      await host.stop();
    }
  }, 240_000);
});
