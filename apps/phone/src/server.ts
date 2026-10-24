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
import { confirmPage, consentPage, landingPage, playerPage, refereePage } from "./pages.ts";
import { createWebTerminal } from "./web-terminal.ts";
import { callRefereeTool } from "./referee-tools.ts";
import { TOOL_INSTRUCTIONS, buildChatTools, type ChatToolDeps } from "./chat-tools.ts";
import { createMcpHttp, type McpHttp } from "./mcp-http.ts";
import { createOAuth, type OAuthServer, type SecretCheck } from "./oauth.ts";
import type { Launch, PlayerRuns, Run } from "./runs.ts";
import { SETUP_READBACK_COMMANDS, captureSetup, setupEvidence } from "./setup-recovery.ts";
import {
  captureObservation,
  clearPending,
  completeObservation,
  observationEvidence,
  readPending,
  writePending,
  type PendingOperation,
  type RecoveryDeps,
} from "./recovery.ts";
import { PENDING_FORMAT } from "./recovery.ts";
import {
  COLLECTION_COMMANDS,
  captureCollection,
  runCollectionOperation,
} from "./collection-recovery.ts";

/**
 * The phone bridge: a small mobile-browser chat over the operator's and the referee's EXISTING commands. It is a transport and a front
 * end, nothing more. Player confirmations are typed by the authenticated player. The private referee lane also exposes the existing
 * three MCP operations to a compatible active AI browser host; no answer is defaulted or scripted. It adds no gameplay, no model and
 * no engine rule, and the existing guards (the operator's
 * owner-only files, the referee exchange's host proofs, the owners' admission) still decide everything that matters.
 *
 * TWO LANES with SEPARATE secrets: the player lane (choices, typed confirmations, the author's setting documents) and the referee lane
 * (bound AI tools, with an optional developer console). A session of one lane can call nothing of the other.
 */
export interface PhoneDeps {
  readonly runCli?: (argv: readonly string[], env: CliEnvironment) => Promise<number>;
  readonly runRefereeConsole?: (
    argv: readonly string[],
    terminal: OperatorTerminal,
  ) => Promise<number>;
  readonly now?: () => number;
  readonly askExpiryMs?: number;
  /** how long an idle or caught-up poll is held open before it answers (default 20 s) */
  readonly pollMs?: number;
  /** how long a shutdown waits for a running command to wind down (it must release the campaign's writer lock) before giving up (default 8 s) */
  readonly shutdownMs?: number;
  /** owner readback seams for the pending-operation recovery (tests substitute them; the defaults read the real campaign) */
  readonly recovery?: RecoveryDeps;
  /** the ordinary-chat adapter's collaborators (tests substitute the earned-Glance read and the referee exchange; never the confirmation) */
  readonly chat?: Pick<ChatToolDeps, "settleMs" | "elicitMs" | "callReferee" | "glance" | "note">;
}

type Role = "player" | "referee";
interface Session {
  readonly role: Role;
  readonly csrf: string;
  readonly created: number;
  seen: number;
}
const IDLE_MS = 30 * 60_000;
const ABSOLUTE_MS = 8 * 3600_000;
const LOCK_MS = 15 * 60_000;
const MAX_FAILS = 5;
const GLOBAL_FAILS = 60;
const MAX_BODY = 128 * 1024;
const POLL_MS = 20_000;
const SHUTDOWN_MS = 8_000;
const UNREADABLE_BLOCKER =
  "the pending-operation record is unreadable; engineering must inspect it";
const newRunId = () => randomBytes(8).toString("hex");
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
  /**
   * The action whose outcome is not established (BLUE R3), restored from the trusted pending-operation record on startup: while it is
   * unresolved NO other mutating action starts (page or chat). It is cleared only by a definite outcome or by owner-side evidence about
   * THAT operation (see recoverPending); a record that cannot be read or maintained keeps everything blocked.
   */
  let pending: PendingOperation | null = null;
  let unresolvedOutcome = false;
  let blocker: string | null = null;
  /** true when no further `reconcile` can help (the record is unreadable, unsupported or unclearable): the operator must intervene */
  let structuralBlock = false;
  {
    const restored = readPending(config);
    if (restored.kind === "PENDING") {
      pending = restored.pending;
      unresolvedOutcome = true;
      blocker =
        restored.pending.blocker ??
        "the server restarted while this action's outcome was not established";
    } else if (restored.kind === "UNREADABLE") {
      unresolvedOutcome = true;
      structuralBlock = true;
      blocker = UNREADABLE_BLOCKER;
    }
  }
  const rec = {
    setupEvidence: deps.recovery?.setupEvidence ?? setupEvidence,
    captureObservation: deps.recovery?.captureObservation ?? captureObservation,
    observationEvidence: deps.recovery?.observationEvidence ?? observationEvidence,
    completeObservation: deps.recovery?.completeObservation ?? completeObservation,
    captureCollection: deps.recovery?.captureCollection ?? captureCollection,
    runCollection: deps.recovery?.runCollection ?? runCollectionOperation,
  };
  let launching = false;
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const inflight = new Set<Promise<unknown>>();
  const track = <T>(work: Promise<T>): Promise<T> => {
    inflight.add(work);
    void work.finally(() => inflight.delete(work)).catch(() => undefined);
    return work;
  };
  const refereeTool: typeof callRefereeTool = (c, body) => {
    if (closing)
      return Promise.resolve({
        status: 503,
        result: { content: [{ type: "text", text: "the server is closing" }], isError: true },
      });
    return track((deps.chat?.callReferee ?? callRefereeTool)(c, body));
  };
  let referee: Run | null = null;
  let refereeCalls = 0;
  const pollMs = deps.pollMs ?? POLL_MS;
  // an idle or finished lane holds a poll open until a new run starts (or `pollMs`), instead of answering at once
  const laneWaiters: Record<Role, Set<() => void>> = { player: new Set(), referee: new Set() };
  const waitLane = (lane: Role, ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        laneWaiters[lane].delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      laneWaiters[lane].add(done);
    });
  const wakeLane = (lane: Role) => {
    for (const w of [...laneWaiters[lane]]) w();
  };
  const runOf = (lane: Role) => (lane === "player" ? player : referee);

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
  /**
   * `touch` records HUMAN activity. The page's automatic polling must not count as activity (it never stops while the page is open), or
   * the 30-minute inactivity expiry could never fire: only a person's own request (a page, a command, a reply, a stop) refreshes it.
   * The 8-hour absolute limit and the inactivity limit are both still checked on every request, polls included.
   */
  const sessionOf = (
    req: IncomingMessage,
    touch = true,
  ): { sid: string; session: Session } | undefined => {
    const sid = cookieOf(req);
    if (!sid || !/^[0-9a-f]{64}$/.test(sid)) return undefined;
    const session = sessions.get(sid);
    if (!session) return undefined;
    const t = now();
    if (t - session.seen > IDLE_MS || t - session.created > ABSOLUTE_MS) {
      sessions.delete(sid);
      return undefined;
    }
    if (touch) session.seen = t;
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
  /**
   * The one place a lane secret is checked (the page sign-in and the OAuth consent both use it): compared as digests in constant time,
   * a wrong role and a wrong secret are the same refusal. Address lockouts still apply; unrelated global failures cannot deny a valid secret.
   */
  function checkLane(who: string, role: unknown, token: unknown): SecretCheck {
    const t = now();
    globalFails = globalFails.filter((x) => t - x < 10 * 60_000);
    const held = fails.get(who);
    if (held && held.until > t) return "locked";
    const expected =
      role === "player" ? config.playerToken : role === "referee" ? config.refereeToken : undefined;
    if (typeof token !== "string" || expected === undefined || !same(token, expected)) {
      if (globalFails.length >= GLOBAL_FAILS) return "locked";
      globalFails.push(t);
      const prior = fails.get(who);
      const count = (prior && prior.until === 0 ? prior.count : 0) + 1;
      fails.set(who, { count, until: count >= MAX_FAILS ? t + LOCK_MS : 0 });
      return "bad";
    }
    fails.delete(who);
    return "ok";
  }
  function login(req: IncomingMessage, res: ServerResponse, body: Record<string, unknown>) {
    const t = now();
    const checked = checkLane(clientOf(req), body["role"], body["token"]);
    if (checked === "locked") return deny(res, 429, "too many attempts: wait before trying again");
    if (checked === "bad") return deny(res, 401, "not authenticated");
    const role = body["role"];
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
  /**
   * Long-poll. `runId` is the run the client's cursor belongs to: when it is not THIS lane's current run the cursor is meaningless
   * (sequence numbers restart per run) and the new run's transcript is sent from its start. A client that names no run keeps its cursor.
   * When there is nothing new, the request is held (for new output while a run is live; for a new run once it is over or absent), so an
   * idle or finished page costs one request per hold, not a stream of immediate answers.
   */
  const poll = async (
    res: ServerResponse,
    lane: Role,
    after: number,
    runId: string | undefined,
  ) => {
    const fromFor = (r: Run) => (runId !== undefined && runId !== r.id ? 0 : after);
    let run = runOf(lane);
    if (!run) {
      await waitLane(lane, pollMs);
      run = runOf(lane);
    } else {
      const from = fromFor(run);
      const now_ = run.terminal.snapshot(from);
      if (now_.lines.length === 0) {
        if (now_.closed) await waitLane(lane, pollMs);
        else await run.terminal.changed(from, pollMs);
        run = runOf(lane) ?? run;
      }
    }
    if (!run)
      return json(res, 200, { running: false, run: null, seq: 0, lines: [], pending: null });
    const snap = run.terminal.snapshot(fromFor(run));
    json(res, 200, { running: !run.done, run: run.id, label: run.label, ...snap });
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

  // -- the player lane's single run slot ---------------------------------------------------------------------------------------
  /** the closed commands that only read: every other one may write canon or owner state, so it is recorded before it is dispatched */
  const READ_ONLY = new Set(["status", "locality-status", "character-status"]);
  /** what the ordinary-chat adapter may start: the player's choices and their follow-up, never setup, binding or authoring */
  const CHAT_COMMANDS = new Set([
    "observe-surroundings",
    "collect",
    "collect-continue",
    "collect-finish",
    "cease",
    "settle-collection-lapse",
    "reconcile",
  ]);
  const UNKNOWN_STATUS = /STATUS \S*(OUTCOME_UNKNOWN|RECONCILIATION_REQUIRED)\b/;

  const refuse = (status: number, reason: string): Launch => ({ ok: false, status, reason });
  const uncertainReason = (lane: "page" | "chat"): string =>
    `an earlier action${pending ? ` (${pending.command}, run ${pending.run_id})` : ""} ended with an UNCERTAIN outcome and is not yet resolved${blocker ? `: ${blocker}` : ""}. ${
      structuralBlock
        ? "Engineering must inspect it; do not retry the action."
        : `Run ${lane === "chat" ? "reconcile_last_action" : "reconcile"} first; do not retry the action.`
    }`;
  const statusLines = (run: Run): string[] =>
    run.terminal
      .snapshot(0)
      .lines.map((l) => l.text)
      .filter((t) => t.startsWith("STATUS "));
  /** a recovery cannot ask the player anything: a prompt it reaches is a decline, never a new choice */
  const noAsking = (t: Run["terminal"]) => ({
    say: (text: string) => t.say(text),
    ask: async (prompt: string) => {
      t.say(`(a recovery cannot ask the player anything; declined) ${prompt}`);
      return null;
    },
    close: () => t.close(),
  });
  const block = (why: string, structural = false): void => {
    unresolvedOutcome = true;
    blocker = why;
    structuralBlock = structural;
    if (pending) {
      pending = { ...pending, state: "UNCERTAIN", blocker: why };
      writePending(config, pending); // a record that cannot be rewritten stays as it was: still blocking
    }
  };
  const resolve = (): boolean => {
    if (!clearPending(config)) {
      block("the pending-operation record could not be cleared", true);
      return false;
    }
    pending = null;
    unresolvedOutcome = false;
    blocker = null;
    structuralBlock = false;
    return true;
  };
  /** a recovery that needs no command: its account is the run */
  const finishedRun = (label: string, lines: string[], code: number): Run => {
    const terminal = createWebTerminal();
    for (const l of lines) terminal.say(l);
    terminal.say(`— command finished (exit code ${code}) —`);
    terminal.close();
    const run: Run = { id: newRunId(), label, terminal, done: true, uncertain: code !== 0 };
    player = run;
    wakeLane("player");
    return run;
  };

  /**
   * Starts one command on the player lane. `after` decides what its end means: a normal journaled run is settled by its own definite
   * outcome; a recovery run is settled only by the owner-side evidence its caller gathers.
   */
  function startRun(
    id: string,
    label: string,
    argv: readonly string[],
    cleanup: () => void,
    opts: { quiet: boolean },
    after: (run: Run, code: number | null) => Promise<void> | void,
    execute: (env: CliEnvironment) => Promise<number> = (env) => cli(argv, env),
  ): Run {
    const terminal = createWebTerminal(
      deps.askExpiryMs === undefined ? {} : { askExpiryMs: deps.askExpiryMs },
    );
    const run: Run = { id, label, terminal, done: false, uncertain: false };
    player = run;
    wakeLane("player");
    const env = opts.quiet
      ? { terminal: noAsking(terminal), out: (line: string) => terminal.say(line) }
      : { terminal, out: (line: string) => terminal.say(line) };
    const chain = execute(env)
      .then(async (code) => {
        terminal.say(`— command finished (exit code ${code}) —`);
        await after(run, code);
      })
      .catch(async () => {
        // an exception can follow a human's confirmation and an owner write: nothing here can establish that nothing was committed
        run.uncertain = true;
        terminal.say(
          "— the command stopped unexpectedly. Whether it changed anything is UNKNOWN: it may have been confirmed and committed. Run `reconcile` (the owner-backed check) before any retry —",
        );
        await after(run, null);
      })
      .catch(() => {
        run.uncertain = true;
        block("the outcome of this action could not be recorded", true);
      })
      .finally(() => {
        cleanup();
        run.done = true;
        terminal.close();
      })
      .catch(() => undefined);
    // a shutdown waits for it: the command releases the campaign's writer lock only when it has wound down
    track(chain);
    return run;
  }

  /** the end of a normal journaled run: a definite outcome settles it; anything else leaves it pending and blocking */
  const settleNormal = (run: Run, code: number | null): void => {
    const statuses = run.terminal.snapshot(0).lines.map((l) => l.text);
    const unknown = code === null || code === 4 || statuses.some((t) => UNKNOWN_STATUS.test(t));
    if (unknown) {
      run.uncertain = true;
      block(
        code === null
          ? "the command ended in an exception"
          : "the command reported an unknown outcome (reconciliation required)",
      );
    } else resolve();
  };

  /** Recovery reads and completes only the captured operation through its existing owners. Status text from an unrelated CLI command
   * cannot settle it; no recovery asks the human or referee again. Missing old identities stay blocked for engineering inspection. */
  async function recoverPending(): Promise<Launch> {
    // The trusted operator may have inspected/replaced/removed the durable record since startup or the last failed run.
    // Never let cached memory overwrite an unreadable replacement or settle a different original operation.
    const again = readPending(config);
    pending = again.kind === "PENDING" ? again.pending : null;
    const cur = pending;
    const label = "reconcile";
    const blocked = (why: string, lines: string[] = [], structural = false): Launch => {
      block(why, structural);
      return {
        ok: true,
        run: finishedRun(label, [...lines, `RECOVERY BLOCKED: ${why}`], 4),
      };
    };
    if (!cur) {
      if (again.kind === "NONE") {
        unresolvedOutcome = false;
        blocker = null;
        structuralBlock = false;
        return {
          ok: true,
          run: finishedRun(
            label,
            [
              "no pending-operation record remains; this is not evidence of the earlier action's outcome",
            ],
            0,
          ),
        };
      }
      return blocked(UNREADABLE_BLOCKER, [], true);
    }
    if (SETUP_READBACK_COMMANDS.has(cur.command)) {
      if (!cur.setup)
        return blocked(
          "the original setup document identity was not recorded; engineering must inspect it",
          [],
          true,
        );
      const evidence = await rec.setupEvidence(config, cur.setup);
      if (closing) return refuse(503, "the server is closing; the operation remains pending");
      if (evidence.kind === "UNAVAILABLE")
        return blocked("the original setup's owner records could not be verified");
      if (evidence.kind === "PARTIAL")
        return blocked(
          "the original setup is partially committed; the operator must inspect and finish the identical document",
          [],
          true,
        );
      if (!resolve()) return blocked(blocker ?? "the record could not be cleared", [], true);
      return {
        ok: true,
        run: finishedRun(
          label,
          [
            evidence.kind === "NONE"
              ? "owner readback: no publication of that original setup was committed"
              : "owner readback: every publication of that original setup is committed and verified",
          ],
          0,
        ),
      };
    }
    if (cur.command === "observe-surroundings") {
      if (!cur.identity)
        return blocked(
          "the observation's original identity was not recorded; it cannot be read back",
          [],
          true,
        );
      const ev = await rec.observationEvidence(config, cur.identity);
      if (closing) return refuse(503, "the server is closing; the operation remains pending");
      if (ev.kind === "UNAVAILABLE") return blocked(ev.detail);
      if (ev.kind === "NONE" || ev.kind === "NEGATIVE" || ev.kind === "COMPLETE") {
        const said =
          ev.kind === "NONE"
            ? "owner readback: no record of that observation exists at its basis; nothing was committed"
            : ev.kind === "NEGATIVE"
              ? "owner readback: the retained reading for that observation is final (nothing was received); nothing further is pending"
              : "owner readback: the observation's event, sealed packet and transaction are all committed and verified";
        if (!resolve()) return blocked(blocker ?? "the record could not be cleared", [said], true);
        return { ok: true, run: finishedRun(label, [said], 0) };
      }
      const after = await rec.completeObservation(config, cur.identity);
      if (after.kind !== "COMPLETE")
        return blocked(
          `the observation's owner records remain incomplete${after.kind === "UNAVAILABLE" ? `: ${after.detail}` : ""}`,
        );
      if (!resolve()) return blocked(blocker ?? "the record could not be cleared", [], true);
      return {
        ok: true,
        run: finishedRun(
          label,
          [
            "owner readback: the original observation's event, packet and Temporal seal are complete and verified",
          ],
          0,
        ),
      };
    }
    if (COLLECTION_COMMANDS.has(cur.command)) {
      if (!cur.collection)
        return blocked(
          "the original collection/ledger identity was not recorded; engineering must inspect it",
          [],
          true,
        );
      const original = cur;
      const run = startRun(
        newRunId(),
        label,
        [],
        () => undefined,
        { quiet: true },
        (r, code) => {
          if (code === 0) resolve();
          else {
            r.uncertain = true;
            const why = r.terminal
              .snapshot(0)
              .lines.map((l) => l.text)
              .findLast((l) => l.startsWith("RECOVERY BLOCKED:"));
            block(
              why?.slice("RECOVERY BLOCKED: ".length) ??
                "the original operation's owner evidence did not settle it",
            );
          }
        },
        (env) => rec.runCollection(config, original, env, true),
      );
      return { ok: true, run };
    }
    return blocked(`no supported owner readback exists for ${cur.command}`, [], true);
  }

  /** the one way a player command starts (the phone page and the chat adapter both use it): the CLOSED builder validates everything */
  function launchPlayer(
    request: { command: unknown; options?: unknown; setup?: unknown },
    lane: "page" | "chat",
  ): Promise<Launch> {
    return track(launchPlayerWork(request, lane));
  }
  async function launchPlayerWork(
    request: { command: unknown; options?: unknown; setup?: unknown },
    lane: "page" | "chat",
  ): Promise<Launch> {
    if (closing) return refuse(503, "the server is closing; nothing was dispatched");
    if (launching || (player && !player.done))
      return refuse(409, "a command is already running: answer it or stop it first");
    launching = true;
    try {
      const built = buildPlayerCommand(config, request);
      if (!built.ok) return refuse(400, built.reason);
      const command = String(request.command);
      if (command === "reconcile" && unresolvedOutcome) {
        built.value.cleanup();
        return await recoverPending();
      }
      if (READ_ONLY.has(command)) {
        return {
          ok: true,
          run: startRun(
            newRunId(),
            command,
            built.value.argv,
            built.value.cleanup,
            { quiet: false },
            (run, code) => {
              // it only reads: an unusual end is reported on the run and gates nothing
              if (
                code === null ||
                code === 4 ||
                statusLines(run).some((t) => UNKNOWN_STATUS.test(t))
              )
                run.uncertain = true;
            },
          ),
        };
      }
      // every command that may write is recorded before it is dispatched, and none starts while an earlier outcome is unresolved
      if (unresolvedOutcome) {
        built.value.cleanup();
        return refuse(409, uncertainReason(lane));
      }
      const options: Record<string, string> = {};
      if (request.options && typeof request.options === "object")
        for (const [k, v] of Object.entries(request.options as Record<string, unknown>))
          if (typeof v === "string") options[k] = v;
      const id = newRunId();
      const setupAt = built.value.argv.indexOf("--setup");
      const setup = SETUP_READBACK_COMMANDS.has(command)
        ? captureSetup(config, command, built.value.argv[setupAt + 1] ?? "")
        : null;
      if (SETUP_READBACK_COMMANDS.has(command) && !setup) {
        built.value.cleanup();
        return refuse(503, "the setup identity could not be established; nothing was dispatched");
      }
      let identity = null;
      if (command === "observe-surroundings") {
        identity = await rec.captureObservation(config, options["player-character"] ?? "");
        if (!identity) {
          built.value.cleanup();
          return refuse(
            503,
            "the observation's identity could not be established; nothing was dispatched",
          );
        }
      }
      const collection = COLLECTION_COMMANDS.has(command)
        ? await rec.captureCollection(config, id)
        : null;
      if (COLLECTION_COMMANDS.has(command) && !collection) {
        built.value.cleanup();
        return refuse(
          503,
          "the operation identity could not be established; nothing was dispatched",
        );
      }
      if (closing) {
        built.value.cleanup();
        return refuse(503, "the server is closing; nothing was dispatched");
      }
      const record: PendingOperation = {
        format: PENDING_FORMAT,
        format_version: 1,
        campaign_id: config.campaignId,
        run_id: id,
        command,
        options,
        dispatched_at: now(),
        state: "DISPATCHED",
        blocker: null,
        identity,
        collection,
        setup,
      };
      if (!writePending(config, record)) {
        built.value.cleanup();
        return refuse(503, "the recovery record could not be maintained; nothing was dispatched");
      }
      pending = record;
      return {
        ok: true,
        run: startRun(
          id,
          command,
          built.value.argv,
          built.value.cleanup,
          { quiet: false },
          settleNormal,
          COLLECTION_COMMANDS.has(command)
            ? (env) => rec.runCollection(config, record, env)
            : undefined,
        ),
      };
    } finally {
      launching = false;
    }
  }
  async function startPlayer(res: ServerResponse, body: Record<string, unknown>) {
    const started = await launchPlayer(
      { command: body["command"], options: body["options"], setup: body["setup"] },
      "page",
    );
    if (!started.ok) return deny(res, started.status, started.reason);
    json(res, 200, { ok: true });
  }
  const playerRuns: PlayerRuns = {
    current: () => player,
    unresolved: () => unresolvedOutcome,
    blocker: () => blocker,
    structural: () => structuralBlock,
    launch: async (command, options) => {
      if (!CHAT_COMMANDS.has(command))
        return { ok: false, status: 400, reason: "that action is not offered here" };
      return launchPlayer({ command, options }, "chat");
    },
    abort: () => player?.terminal.abort(),
    decline: () => {
      const waiting = player?.terminal.snapshot(0).pending;
      if (player && waiting) player.terminal.reply(waiting.id, "");
    },
  };

  function startReferee(res: ServerResponse, body: Record<string, unknown>) {
    if (closing) return deny(res, 503, "the server is closing");
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
    const run: Run = { id: newRunId(), label: hostId, terminal, done: false, uncertain: false };
    referee = run;
    wakeLane("referee");
    track(
      console_(argv, terminal)
        .then((code) => terminal.say(`— referee session closed (code ${code}) —`))
        .catch(() => terminal.say("— the referee session could not run —"))
        .finally(() => {
          run.done = true;
          terminal.close();
        }),
    );
    json(res, 200, { ok: true });
  }
  const stop = (res: ServerResponse, run: Run | null) => {
    run?.terminal.abort();
    json(res, 200, { ok: true });
  };

  // -- the ordinary-chat adapter (off unless the public origin is configured) -------------------------------------------------
  let oauth: OAuthServer | null = null;
  let mcp: McpHttp | null = null;
  if (config.publicUrl !== null) {
    oauth = createOAuth(config, now, (who, role, token) => checkLane(who, role, token));
    mcp = createMcpHttp({
      oauth,
      now,
      serverInfo: { name: "immortalis-chat", version: "0.1.0" },
      instructions: TOOL_INSTRUCTIONS,
      tools: buildChatTools({
        config,
        runs: playerRuns,
        ...(deps.chat ?? {}),
        callReferee: refereeTool,
      }),
    });
  }
  const readForm = (req: IncomingMessage): Promise<Record<string, unknown> | undefined> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > 16 * 1024) {
          resolve(undefined);
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try {
          if ((req.headers["content-type"] ?? "").startsWith("application/json")) {
            const parsed: unknown = JSON.parse(text);
            return resolve(
              parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : undefined,
            );
          }
          resolve(Object.fromEntries(new URLSearchParams(text)));
        } catch {
          resolve(undefined);
        }
      });
      req.on("error", () => resolve(undefined));
    });
  const sameOrigin = (req: IncomingMessage): boolean => {
    const origin = req.headers.origin;
    if (origin === undefined) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  };

  /** the discovery, consent, token and MCP routes; `true` when the request was one of them */
  async function chatRoutes(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (!oauth || !mcp) return false;
    const path = url.pathname;
    const open = { "access-control-allow-origin": "*" };
    if (req.method === "GET") {
      if (
        path === "/.well-known/oauth-protected-resource" ||
        path === "/.well-known/oauth-protected-resource/mcp"
      )
        return (json(res, 200, oauth.protectedResourceMetadata(), open), true);
      if (
        path === "/.well-known/oauth-authorization-server" ||
        path === "/.well-known/openid-configuration"
      )
        return (json(res, 200, oauth.authorizationServerMetadata(), open), true);
      if (path === "/oauth/authorize") {
        const described = oauth.describeRequest(url.searchParams);
        const n = nonce();
        if (!described.ok)
          return (send(res, 400, described.reason, "text/plain; charset=utf-8"), true);
        const q: Record<string, string> = {};
        for (const [k, v] of url.searchParams) q[k] = v.slice(0, 1024);
        return (
          send(res, 200, consentPage(n, q, described), "text/html; charset=utf-8", {}, n),
          true
        );
      }
      return false;
    }
    if (path === "/oauth/register" && req.method === "POST") {
      const body = await readBody(req);
      if (body === undefined) return (json(res, 400, { error: "invalid_client_metadata" }), true);
      const r = oauth.register(body);
      return (json(res, r.status, r.body), true);
    }
    if (path === "/oauth/token" && req.method === "POST") {
      const form = await readForm(req);
      if (form === undefined) return (json(res, 400, { error: "invalid_request" }), true);
      const r = oauth.token(form);
      return (json(res, r.status, r.body), true);
    }
    if (path === "/oauth/decision" && req.method === "POST") {
      if (!sameOrigin(req)) return (deny(res, 403, "cross-origin request refused"), true);
      const body = await readBody(req);
      if (body === undefined) return (json(res, 400, { error: "invalid_request" }), true);
      const r = oauth.decide(body, clientOf(req));
      return (json(res, r.status, r.body), true);
    }
    return false;
  }

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
    if (!mcp && (path === "/mcp" || path.startsWith("/oauth/") || path.startsWith("/.well-known/")))
      return deny(res, 404, "not available");
    if (path === "/mcp" && mcp) return mcp.handle(req, res);
    if (await chatRoutes(req, res, url)) return;
    // an automatic poll is not human activity (see sessionOf)
    const found = sessionOf(req, !(req.method === "GET" && path.endsWith("/poll")));
    if (req.method === "GET") {
      const n = nonce();
      if (path === "/") return send(res, 200, landingPage(n), "text/html; charset=utf-8", {}, n);
      if (path === "/confirm" && config.publicUrl !== null) {
        const signedIn = found?.session.role === "player";
        return send(
          res,
          200,
          confirmPage(n, signedIn ? found.session.csrf : "", signedIn),
          "text/html; charset=utf-8",
          {},
          n,
        );
      }
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
        const run = url.searchParams.get("run");
        return poll(
          res,
          lane,
          Number.isSafeInteger(after) && after >= 0 ? after : 0,
          run !== null && /^[0-9a-f]{16}$/.test(run) ? run : undefined,
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
    if (closing) return deny(res, 503, "the server is closing");
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
      if (path === "/api/ref/tool") {
        if (refereeCalls >= 8) return deny(res, 429, "referee is busy; retry later");
        refereeCalls++;
        try {
          const called = await refereeTool(config, body);
          return json(res, called.status, called.result);
        } finally {
          refereeCalls--;
        }
      }
      if (path === "/api/ref/start") return startReferee(res, body);
      if (path === "/api/ref/reply") return reply(res, referee, body);
      if (path === "/api/ref/stop") return stop(res, referee);
    }
    return deny(res, path.startsWith("/api/") ? 403 : 404, "not available to this lane");
  }

  const server = createServer((req, res) => {
    if (closing) return deny(res, 503, "the server is closing");
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
    close: () => {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = (async () => {
        player?.terminal.abort();
        referee?.terminal.abort();
        mcp?.closeAll();
        wakeLane("player");
        wakeLane("referee");
        // a command that is still running holds the campaign's writer lock until it has wound down: wait for it (bounded) before the
        // process can exit, or a redeploy during any action strands the lock and the restart cannot even read the campaign back
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([
          Promise.allSettled([...inflight]),
          new Promise<void>((done) => {
            timer = setTimeout(done, deps.shutdownMs ?? SHUTDOWN_MS);
          }),
        ]);
        clearTimeout(timer);
        await new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        });
      })();
      return closePromise;
    },
  };
}
