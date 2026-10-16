/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted browser reads untyped JSON */
// The R-5 PHONE BRIDGE (apps/phone): a mobile-browser chat front end over the operator's and the referee's existing commands.
//
// EVERYTHING IN THIS FILE IS A MECHANISM TEST. The HTTP client below is a script, not a person: it proves transport, authentication,
// lane separation, the closed command set, fail-closed configuration and that the shipped commands run unchanged behind the front end.
// It is NOT a real player's choice, NOT a real game master's reading, and NOT First Playable evidence. No model or paid API is involved.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, type PhoneConfig } from "../../apps/phone/src/config.ts";
import { buildPlayerCommand, PLAYER_COMMANDS } from "../../apps/phone/src/commands.ts";
import { createPhoneServer, type PhoneDeps } from "../../apps/phone/src/server.ts";
import { createWebTerminal } from "../../apps/phone/src/web-terminal.ts";
import { LOCALITY_CAMPAIGN, setupDoc } from "../support/locality.ts";
import { tempDir } from "../support/tmp.ts";

const PLAYER = "player-secret-0123456789-abcdefghijklmnopqrstuv";
const REFEREE = "referee-secret-0123456789-abcdefghijklmnopqrstuv";

const baseEnv = (over: Record<string, string> = {}): Record<string, string> => ({
  IMMORTALIS_CAMPAIGN_DIR: "/data/campaign",
  IMMORTALIS_CAMPAIGN_ID: "campaign-test",
  IMMORTALIS_OPERATOR_DIR: "/data/operator",
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
  const app = createPhoneServer(config(over), deps);
  const port = await app.listen();
  return { app, base: `http://127.0.0.1:${port}` };
}

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
      "commands.ts",
      "config.ts",
      "main.ts",
      "pages.ts",
      "server.ts",
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
