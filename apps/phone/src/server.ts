import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  runCli,
  runRefereeConsole,
  secretPath,
  type CliEnvironment,
  type OperatorTerminal,
} from "@immortalis/operator";
import { PLAYER_COMMANDS, buildPlayerCommand } from "./commands.ts";
import type { PhoneConfig } from "./config.ts";
import { landingPage, playerPage, refereePage } from "./pages.ts";
import { createWebTerminal, type WebTerminal } from "./web-terminal.ts";

/**
 * The phone bridge: a small mobile-browser chat over the operator's and the referee's EXISTING commands. It is a transport and a front
 * end, nothing more. Every prompt shown comes from the shipped command; every answer is typed by the authenticated person; nothing is
 * defaulted, scripted or confirmed here. It adds no gameplay, no model and no engine rule, and the existing guards (the operator's
 * owner-only files, the referee exchange's host proofs, the owners' admission) still decide everything that matters.
 *
 * TWO LANES with SEPARATE secrets: the player lane (choices, typed confirmations, the author's setting documents) and the referee lane
 * (the bound referee console: read a task, give your own reading). A session of one lane can call nothing of the other.
 */
export interface PhoneDeps {
  readonly runCli?: (argv: readonly string[], env: CliEnvironment) => Promise<number>;
  readonly runRefereeConsole?: (
    argv: readonly string[],
    terminal: OperatorTerminal,
  ) => Promise<number>;
  readonly now?: () => number;
  readonly askExpiryMs?: number;
}

type Role = "player" | "referee";
interface Session {
  readonly role: Role;
  readonly csrf: string;
  readonly created: number;
  seen: number;
}
interface Run {
  readonly label: string;
  readonly terminal: WebTerminal;
  done: boolean;
}

const IDLE_MS = 30 * 60_000;
const ABSOLUTE_MS = 8 * 3600_000;
const LOCK_MS = 15 * 60_000;
const MAX_FAILS = 5;
const GLOBAL_FAILS = 60;
const MAX_BODY = 128 * 1024;
const POLL_MS = 20_000;
const COOKIE = "immortalis_sid";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export interface PhoneServer {
  readonly server: Server;
  readonly listen: () => Promise<number>;
  readonly close: () => Promise<void>;
}

export function createPhoneServer(config: PhoneConfig, deps: PhoneDeps = {}): PhoneServer {
  const now = deps.now ?? (() => Date.now());
  const cli = deps.runCli ?? runCli;
  const console_ = deps.runRefereeConsole ?? runRefereeConsole;
  const sessions = new Map<string, Session>();
  const fails = new Map<string, { count: number; until: number }>();
  let globalFails: number[] = [];
  let player: Run | null = null;
  let referee: Run | null = null;

  const nonce = () => randomBytes(16).toString("base64");

  function send(
    res: ServerResponse,
    status: number,
    body: string,
    type: string,
    extra: Record<string, string> = {},
    script?: string,
  ) {
    res.writeHead(status, {
      "content-type": type,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
      "content-security-policy":
        `default-src 'none'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; ` +
        `script-src ${script ? `'nonce-${script}'` : "'none'"}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      ...extra,
    });
    res.end(body);
  }
  const json = (
    res: ServerResponse,
    status: number,
    value: unknown,
    extra: Record<string, string> = {},
  ) => send(res, status, JSON.stringify(value), "application/json; charset=utf-8", extra);
  const deny = (res: ServerResponse, status: number, error: string) => json(res, status, { error });

  const cookieOf = (req: IncomingMessage): string | undefined => {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === COOKIE) return v.join("=");
    }
    return undefined;
  };
  const sessionOf = (req: IncomingMessage): { sid: string; session: Session } | undefined => {
    const sid = cookieOf(req);
    if (!sid || !/^[0-9a-f]{64}$/.test(sid)) return undefined;
    const session = sessions.get(sid);
    if (!session) return undefined;
    const t = now();
    if (t - session.seen > IDLE_MS || t - session.created > ABSOLUTE_MS) {
      sessions.delete(sid);
      return undefined;
    }
    session.seen = t;
    return { sid, session };
  };
  const clientOf = (req: IncomingMessage): string => {
    if (config.trustProxy) {
      const forwarded = req.headers["x-forwarded-for"];
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
      if (first) return first.slice(0, 64);
    }
    return req.socket.remoteAddress ?? "unknown";
  };
  const readBody = (req: IncomingMessage): Promise<Record<string, unknown> | undefined> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          resolve(undefined);
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        try {
          const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve(
            parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
              ? (parsed as Record<string, unknown>)
              : undefined,
          );
        } catch {
          resolve(undefined);
        }
      });
      req.on("error", () => resolve(undefined));
    });

  // -- login ---------------------------------------------------------------------------------------------------------------
  function login(req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>) {
    const t = now();
    const who = clientOf(req);
    globalFails = globalFails.filter((x) => t - x < 10 * 60_000);
    const held = fails.get(who);
    if (globalFails.length >= GLOBAL_FAILS || (held && held.until > t))
      return deny(res, 429, "too many attempts: wait before trying again");
    const role = body["role"];
    const token = body["token"];
    const expected =
      role === "player" ? config.playerToken : role === "referee" ? config.refereeToken : undefined;
    // compared as digests in constant time; a wrong role and a wrong token are the same refusal
    if (typeof token !== "string" || expected === undefined || !same(token, expected)) {
      globalFails.push(t);
      const prior = fails.get(who);
      const count = (prior && prior.until === 0 ? prior.count : 0) + 1;
      fails.set(who, { count, until: count >= MAX_FAILS ? t + LOCK_MS : 0 });
      return deny(res, 401, "not authenticated");
    }
    fails.delete(who);
    // one session per lane: signing in again ends the earlier one
    for (const [sid, s] of sessions) if (s.role === role) sessions.delete(sid);
    const sid = randomBytes(32).toString("hex");
    const session: Session = {
      role: role as Role,
      csrf: randomBytes(24).toString("hex"),
      created: t,
      seen: t,
    };
    sessions.set(sid, session);
    const secure = config.transport === "proxy" ? "; Secure" : "";
    json(
      res,
      200,
      { ok: true, next: role === "player" ? "/play" : "/referee", csrf: session.csrf },
      {
        "set-cookie": `${COOKIE}=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ABSOLUTE_MS / 1000}${secure}`,
      },
    );
  }

  // -- a lane's run ----------------------------------------------------------------------------------------------------------
  const poll = async (res: ServerResponse, run: Run | null, after: number) => {
    if (!run) return json(res, 200, { running: false, seq: 0, lines: [], pending: null });
    await run.terminal.changed(after, POLL_MS);
    const snap = run.terminal.snapshot(after);
    json(res, 200, { running: !run.done, label: run.label, ...snap });
  };
  const reply = (res: ServerResponse, run: Run | null, body: Record<string, unknown>) => {
    const id = body["prompt_id"];
    const text = body["text"];
    if (!run || run.done || typeof id !== "string" || typeof text !== "string")
      return deny(res, 409, "there is no prompt waiting");
    return run.terminal.reply(id, text)
      ? json(res, 200, { ok: true })
      : deny(res, 409, "that prompt is no longer waiting for an answer");
  };

  function startPlayer(res: ServerResponse, body: Record<string, unknown>) {
    if (player && !player.done)
      return deny(res, 409, "a command is already running: answer it or stop it first");
    const built = buildPlayerCommand(config, {
      command: body["command"],
      options: body["options"],
      setup: body["setup"],
    });
    if (!built.ok) return deny(res, 400, built.reason);
    const terminal = createWebTerminal(
      deps.askExpiryMs === undefined ? {} : { askExpiryMs: deps.askExpiryMs },
    );
    const run: Run = { label: String(body["command"]), terminal, done: false };
    player = run;
    void cli(built.value.argv, { terminal, out: (line) => terminal.say(line) })
      .then((code) => terminal.say(`— command finished (exit code ${code}) —`))
      .catch(() => terminal.say("— the command could not run; nothing was confirmed —"))
      .finally(() => {
        built.value.cleanup();
        run.done = true;
        terminal.close();
      });
    json(res, 200, { ok: true });
  }

  function startReferee(res: ServerResponse, body: Record<string, unknown>) {
    if (referee && !referee.done)
      return deny(res, 409, "a referee session is already open: stop it first");
    const hostId = body["host_id"];
    if (typeof hostId !== "string" || !config.refereeHostIds.includes(hostId))
      return deny(res, 400, "that referee host is not offered");
    const argv = [
      "--operator-dir",
      config.operatorDir,
      "--campaign-id",
      config.campaignId,
      "--host-id",
      hostId,
      "--secret-file",
      secretPath({ stateDir: config.operatorDir, campaignId: config.campaignId }, hostId),
    ];
    const terminal = createWebTerminal(
      deps.askExpiryMs === undefined ? {} : { askExpiryMs: deps.askExpiryMs },
    );
    const run: Run = { label: hostId, terminal, done: false };
    referee = run;
    void console_(argv, terminal)
      .then((code) => terminal.say(`— referee session closed (code ${code}) —`))
      .catch(() => terminal.say("— the referee session could not run —"))
      .finally(() => {
        run.done = true;
        terminal.close();
      });
    json(res, 200, { ok: true });
  }
  const stop = (res: ServerResponse, run: Run | null) => {
    run?.terminal.abort();
    json(res, 200, { ok: true });
  };

  // -- routing ---------------------------------------------------------------------------------------------------------------
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://phone.invalid");
    const path = url.pathname;
    if (req.method === "GET" && path === "/healthz")
      return send(res, 200, "ok", "text/plain; charset=utf-8");
    if (config.transport === "proxy") {
      const proto = req.headers["x-forwarded-proto"];
      const first = (Array.isArray(proto) ? proto[0] : proto)?.split(",")[0]?.trim();
      if (first !== "https") return deny(res, 421, "this service is reachable only over HTTPS");
    }
    const found = sessionOf(req);
    if (req.method === "GET") {
      const n = nonce();
      if (path === "/") return send(res, 200, landingPage(n), "text/html; charset=utf-8", {}, n);
      if (path === "/play" || path === "/referee") {
        const want: Role = path === "/play" ? "player" : "referee";
        if (!found || found.session.role !== want)
          return send(res, 303, "", "text/plain; charset=utf-8", { location: "/" });
        const page = want === "player" ? playerPage : refereePage;
        const extra =
          want === "player"
            ? { commands: PLAYER_COMMANDS, hosts: [] }
            : { commands: {}, hosts: config.refereeHostIds };
        return send(
          res,
          200,
          page(n, found.session.csrf, extra),
          "text/html; charset=utf-8",
          {},
          n,
        );
      }
      const lane = path.startsWith("/api/play/")
        ? "player"
        : path.startsWith("/api/ref/")
          ? "referee"
          : undefined;
      if (lane && path.endsWith("/poll")) {
        if (!found || found.session.role !== lane)
          return deny(res, found ? 403 : 401, "not authenticated for this lane");
        const after = Number(url.searchParams.get("after") ?? "0");
        return poll(
          res,
          lane === "player" ? player : referee,
          Number.isSafeInteger(after) && after >= 0 ? after : 0,
        );
      }
      return deny(res, 404, "not found");
    }
    if (req.method !== "POST") return deny(res, 405, "method not allowed");
    // every POST: JSON, the session's own CSRF token, and (when present) a same-origin Origin
    if (!(req.headers["content-type"] ?? "").startsWith("application/json"))
      return deny(res, 415, "JSON only");
    const origin = req.headers.origin;
    if (
      origin !== undefined &&
      (() => {
        try {
          return new URL(origin).host !== req.headers.host;
        } catch {
          return true;
        }
      })()
    )
      return deny(res, 403, "cross-origin request refused");
    const body = await readBody(req);
    if (body === undefined)
      return deny(res, 400, "the request body is not a JSON object within the size limit");
    if (path === "/api/login") return login(req, res, body);
    if (!found) return deny(res, 401, "not authenticated");
    const csrf = req.headers["x-immortalis-csrf"];
    if (typeof csrf !== "string" || !same(csrf, found.session.csrf))
      return deny(res, 403, "bad request token");
    if (path === "/api/logout") {
      sessions.delete(found.sid);
      return json(
        res,
        200,
        { ok: true },
        { "set-cookie": `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` },
      );
    }
    const role = found.session.role;
    if (role === "player") {
      if (path === "/api/play/command") return startPlayer(res, body);
      if (path === "/api/play/reply") return reply(res, player, body);
      if (path === "/api/play/stop") return stop(res, player);
    } else {
      if (path === "/api/ref/start") return startReferee(res, body);
      if (path === "/api/ref/reply") return reply(res, referee, body);
      if (path === "/api/ref/stop") return stop(res, referee);
    }
    return deny(res, path.startsWith("/api/") ? 403 : 404, "not available to this lane");
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) deny(res, 500, "the request could not be handled");
      else res.end();
    });
  });
  server.headersTimeout = 15_000;
  server.requestTimeout = 60_000;
  server.keepAliveTimeout = 5_000;

  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.bindHost, () => {
          const address = server.address();
          resolve(typeof address === "object" && address ? address.port : config.port);
        });
      }),
    close: () =>
      new Promise((resolve) => {
        player?.terminal.abort();
        referee?.terminal.abort();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
