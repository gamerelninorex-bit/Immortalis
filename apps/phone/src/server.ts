import { canonicalJson } from "@immortalis/contracts";
import {
  applyEdits,
  compileContract,
  judgeStatement,
  missingOf,
  runCli,
  runRefereeConsole,
  secretPath,
  type CharacterDraft,
  type CliEnvironment,
  type Edit,
  type OperatorTerminal,
} from "@immortalis/operator";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  bindOrdinaryAction,
  revokeOrdinaryAction,
  type OrdinaryAction,
  type OrdinaryVerb,
} from "../../../packages/operator/src/ordinary-action.ts";
import type { ReviewRequest } from "../../../packages/operator/src/review-evidence.ts";
import {
  CHARACTER_COMMAND,
  characterOutcome,
  contractSha,
  readCharacter,
  readbackOf,
  type CharacterIdentity,
  type CharacterOutcome,
  type CharacterState,
} from "./character-evidence.ts";
import {
  MAX_REVISIONS,
  chosenCharacterId,
  clearCharacterRecord,
  contractOfDraft,
  draftSha,
  readCharacterRecord,
  refereeReadiness,
  runCharacterOperation,
  writeCharacterRecord,
  type CharacterRecord,
  type CharacterRunOptions,
} from "./character-recovery.ts";
import {
  TOOL_INSTRUCTIONS,
  buildChatTools,
  fitsCharacterConfirmation,
  type ChatToolDeps,
} from "./chat-tools.ts";
import {
  COLLECTION_COMMANDS,
  captureCollection,
  runCollectionOperation,
} from "./collection-recovery.ts";
import { PLAYER_COMMANDS, buildPlayerCommand } from "./commands.ts";
import type { PhoneConfig } from "./config.ts";
import type { LocalityOutcome } from "./locality-evidence.ts";
import type { ToolContext } from "./mcp-http.ts";
import { createMcpHttp, type McpHttp } from "./mcp-http.ts";
import { createOAuth, type OAuthServer, type SecretCheck } from "./oauth.ts";
import { confirmPage, consentPage, landingPage, playerPage, refereePage } from "./pages.ts";
import {
  PENDING_FORMAT,
  captureObservation,
  clearPending,
  completeObservation,
  observationEvidence,
  readPending,
  writePending,
  type PendingOperation,
  type RecoveryDeps,
} from "./recovery.ts";
import { callRefereeTool } from "./referee-tools.ts";
import { RequestCommitments } from "./request-commitments.ts";
import { stageEvidence as acceptedStageEvidence, entryEvidence } from "./review-sources.ts";
import type { OpeningSources } from "./reviews.ts";
import type { StageExpectation } from "./route-confirm.ts";
import { fitsReview, expectationOf as stageReview } from "./route-confirm.ts";
import {
  probeOf,
  readRoute,
  stageOutcome,
  type RouteFacts,
  type StageOutcome,
} from "./route-evidence.ts";
import {
  deriveScenario,
  finishOutcome,
  installState,
  refereeCoverage,
  runFinish,
  stageEvidence,
} from "./route-finish.ts";
import { planStage, probeFor, type PlannedRun, type StageRequest } from "./route-plan.ts";
import {
  dropInputs,
  emptyRoute,
  readRouteRecord,
  retainInput,
  type RouteRecord,
} from "./route-record.ts";
import { refereeWaitSeconds, runClarify } from "./route-run.ts";
import {
  STAGE_COMMAND,
  parseChronology,
  parseDeclare,
  parsePrepare,
  type StageIdentity,
  type StageKind,
} from "./route-stages.ts";
import { earlierStagesDone, routeStatus, type Barrier, type RouteStatus } from "./route-status.ts";
import type {
  CharacterExpectation,
  CharacterLaunch,
  CharacterStatusReport,
  Launch,
  PlayerRuns,
  ReviewLaunch,
  Run,
  SettingStatus,
  StageLaunch,
} from "./runs.ts";
import { checkScenarioFile } from "./scenario.ts";
import {
  LOCALITY_COMMAND,
  SETUP_DOCUMENT_COMMANDS,
  SETUP_READBACK_COMMANDS,
  campaignSetting,
  captureSetup,
  explainLocalitySetup,
  localityEvidence,
  setupEvidence,
} from "./setup-recovery.ts";
import { createWebTerminal } from "./web-terminal.ts";

/**
 * The phone bridge: a small mobile-browser chat over the operator's and the referee's EXISTING commands. It is a transport and a front
 * end, nothing more. Mandatory acceptances are typed by the authenticated player; explicitly requested ordinary chat actions use a private one-shot capability. The private referee lane also exposes the existing
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
  /** the operator's initialize-negotiation sink: one bounded line per accepted initialize, controlled values only (see `negotiationLine`) */
  readonly negotiation?: (line: string) => void;
  /** the shipped character authoring and its referee waits (tests wrap the command to inject faults and shorten the waits) */
  readonly character?: CharacterRunOptions;
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
  const reviews = new RequestCommitments(config);
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
  /** true while the unresolved operation is the ORIGINAL locality setup, confirmed and partly committed: only its own resumption finishes it */
  let resumableBlock = false;
  /** which retained operation a resumable barrier belongs to */
  let resumeWhat: "SETTING" | "CHARACTER" | "STAGE" = "SETTING";
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
    localityEvidence: deps.recovery?.localityEvidence ?? localityEvidence,
    campaignSetting: deps.recovery?.campaignSetting ?? campaignSetting,
    captureObservation: deps.recovery?.captureObservation ?? captureObservation,
    observationEvidence: deps.recovery?.observationEvidence ?? observationEvidence,
    completeObservation: deps.recovery?.completeObservation ?? completeObservation,
    captureCollection: deps.recovery?.captureCollection ?? captureCollection,
    runCollection: deps.recovery?.runCollection ?? runCollectionOperation,
    characterOutcome: deps.recovery?.characterOutcome ?? characterOutcome,
    readCharacter: deps.recovery?.readCharacter ?? readCharacter,
    stageOutcome: deps.recovery?.stageOutcome ?? stageEvidence,
  };
  let launching = false;
  let openingActive = false;
  /** while the setting is being read from the campaign, a command that would open the same package waits (it would meet the writer lock) */
  let readingSetting = 0;
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
        : resumableBlock
          ? resumeWhat === "STAGE"
            ? lane === "chat"
              ? "Only resume_collection_setup (the same retained input and original request authorization) can finish it; do not offer anything else or retry."
              : "Only the same retained input, confirmed again by the player, can finish it; the operator can repeat the identical shipped command. Do not retry the action."
            : resumeWhat === "CHARACTER"
              ? lane === "chat"
                ? "Only resume_original_character (the player's retained keep, finished without asking it again) can finish it; do not offer another character or retry."
                : "Only the same retained keep, finished by the operator's author-character command, can finish it. Do not retry the action."
              : lane === "chat"
                ? "Only resume_original_setting (the same retained setup and original request authorization) can finish it; do not propose another setting or retry."
                : "Only the same retained setup, confirmed again, can finish it; the operator can resume it with the identical document. Do not retry the action."
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
  const block = (
    why: string,
    structural = false,
    resumable = false,
    what: "SETTING" | "CHARACTER" | "STAGE" = "SETTING",
  ): void => {
    unresolvedOutcome = true;
    blocker = why;
    structuralBlock = structural;
    resumableBlock = resumable && !structural;
    resumeWhat = what;
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
    resumableBlock = false;
    resumeWhat = "SETTING";
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
    opts: { quiet: boolean; review?: ReviewLaunch; actor?: string },
    after: (run: Run, code: number | null) => Promise<void> | void,
    execute: (env: CliEnvironment) => Promise<number> = (env) => cli(argv, env),
  ): Run {
    const terminal = createWebTerminal(
      deps.askExpiryMs === undefined ? {} : { askExpiryMs: deps.askExpiryMs },
    );
    const run: Run = { id, label, terminal, done: false, uncertain: false };
    player = run;
    wakeLane("player");
    const baseTerminal = opts.quiet ? noAsking(terminal) : terminal;
    const reviewed = opts.review
      ? reviews.terminal(baseTerminal, {
          authority: opts.review.authority,
          ...(opts.review.recover ? { recover: true } : {}),
          ...(opts.review.originalRun ? { originalRun: opts.review.originalRun } : {}),
          ...(opts.review.internal ? { internal: true } : {}),
          runId: id,
          dispatch: pending?.character ?? pending?.stage ?? pending?.setup,
          actor: opts.actor ?? null,
          ...(opts.review.sources
            ? { sources: { ...opts.review.sources, campaign: config.campaignId } }
            : {}),
          ...(opts.review.derived ? { derived: opts.review.derived } : {}),
          active: () => !closing && !run.done && player?.id === id && pending?.run_id === id,
        })
      : baseTerminal;
    const env = { terminal: reviewed, out: (line: string) => terminal.say(line) };
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
        if (opts.review) pumpOpening?.(opts.review);
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

  const RESUME_BLOCKER =
    "the original setup is incomplete; only that same retained document under its original authorization and owner evidence can finish it";
  /**
   * Applies owner-side evidence about the ORIGINAL locality setup to the barrier: a verified completion or a proven absence of effect
   * settles it; a confirmed, partly committed setup keeps it (resumable by the same document only); anything the evidence cannot
   * reconcile keeps it, and a read that failed keeps it. Returns true only when the barrier was cleared.
   */
  const applyLocalityEvidence = (ev: LocalityOutcome, run?: Run): boolean => {
    if (ev.kind === "COMPLETE" || ev.kind === "NO_EFFECT") {
      const settled = resolve();
      // the owners' evidence has answered what the run itself could not: it is no longer an uncertain run
      if (run && settled) run.uncertain = false;
      return settled;
    }
    if (run) run.uncertain = true;
    if (ev.kind === "RESUMABLE") block(RESUME_BLOCKER, false, true);
    else if (ev.kind === "BLOCKED") block(ev.detail, true);
    else block("the original setup's owner records could not be verified");
    return false;
  };
  /** the end of a locality setup run (page or chat, first dispatch or resumption): settled by owner evidence about THAT document, never by a status line */
  const settleLocality = async (run: Run): Promise<void> => {
    const cur = pending;
    if (!cur?.setup || !SETUP_DOCUMENT_COMMANDS.has(cur.command)) {
      run.uncertain = true;
      block(
        "the original setup document identity was not recorded; engineering must inspect it",
        true,
      );
      return;
    }
    const ev = await rec.localityEvidence(config, cur.setup);
    // a shutdown leaves the record as it is: the restart reads the same evidence
    if (closing) return;
    applyLocalityEvidence(ev, run);
  };

  const CHARACTER_RESUME_BLOCKER =
    "the player's keep of the character is retained but the release is not complete; only that same keep, finished without a new question, can complete it";
  /**
   * Applies owner-side evidence about ONE dispatched character operation to the barrier: a proven absence of effect, a verified release
   * (with the placement still the player's separate choice) or a verified binding settles it; a durable keep whose release is not
   * committed keeps it (resumable by that keep alone); anything the evidence cannot reconcile keeps it, and a read that failed keeps it.
   * Returns true only when the barrier was cleared.
   */
  const applyCharacterEvidence = (ev: CharacterOutcome, run?: Run): boolean => {
    if (ev.kind === "NO_EFFECT" || ev.kind === "RELEASED_UNBOUND" || ev.kind === "BOUND") {
      const settled = resolve();
      // the owners' evidence has answered what the run itself could not: it is no longer an uncertain run
      if (run && settled) run.uncertain = false;
      // the words live in canon once bound; a leftover noncanonical record is harmless and never consulted for a bound character
      if (settled && ev.kind === "BOUND") clearCharacterRecord(config);
      return settled;
    }
    if (run) run.uncertain = true;
    if (ev.kind === "KEPT_UNRELEASED") block(CHARACTER_RESUME_BLOCKER, false, true, "CHARACTER");
    else if (ev.kind === "BLOCKED") block(ev.detail, true);
    else block("the character's owner records could not be verified");
    return false;
  };
  /** the end of a character run (first dispatch or resumption): settled by owner evidence about THAT operation, never by a status line */
  const settleCharacter = async (run: Run): Promise<void> => {
    const cur = pending;
    if (!cur?.character || cur.command !== CHARACTER_COMMAND || cur.run_id !== run.id) {
      run.uncertain = true;
      block(
        "the character operation's identity was not recorded; engineering must inspect it",
        true,
      );
      return;
    }
    const ev = await rec.characterOutcome(config, cur.character);
    // a shutdown leaves the record as it is: the restart reads the same evidence
    if (closing) return;
    applyCharacterEvidence(ev, run);
  };

  const STAGE_RESUME_BLOCKER =
    "a stage of the collection preparation is incomplete; only that same retained input under its original authorization and owner evidence can finish it";
  const ROUTE_WORDS_BLOCKER =
    "the retained route inputs are unreadable; engineering must inspect them";
  /** what a finished stage no longer needs the adapter to retain of the player's words */
  const retainedByKind = (
    kind: StageKind,
  ): readonly (keyof Omit<RouteRecord, "format" | "format_version" | "campaign_id">)[] =>
    kind === "CHRONOLOGY"
      ? ["chronology"]
      : kind === "CLARIFY"
        ? ["handling"]
        : kind === "PREPARE"
          ? ["preparation"]
          : kind === "DECLARE"
            ? ["declaration"]
            : [];
  const retainedBy = (id: StageIdentity) => retainedByKind(id.kind);
  /**
   * Applies owner-side evidence about ONE dispatched stage to the barrier: a verified completion, a proven absence of effect, a committed
   * stage that an owner's later change has made stale, and a finishing stage that is only partly done (it asks nobody, and running it
   * again finishes exactly what is missing) settle it; a confirmed, partly committed stage keeps it (resumable by its own retained input
   * alone); anything the evidence cannot reconcile keeps it, and a read that failed keeps it. Returns true only when the barrier was cleared.
   */
  const applyStageEvidence = (ev: StageOutcome, id: StageIdentity, run?: Run): boolean => {
    if (
      ev.kind === "COMPLETE" ||
      ev.kind === "NO_EFFECT" ||
      ev.kind === "STALE" ||
      (ev.kind === "PARTIAL" && id.kind === "FINISH")
    ) {
      const settled = resolve();
      // the owners' evidence has answered what the run itself could not: it is no longer an uncertain run
      if (run && settled) run.uncertain = false;
      // what the player said is dropped only once its stage stands in canon; a leftover noncanonical record is harmless
      if (settled && ev.kind === "COMPLETE") dropInputs(config, retainedBy(id));
      return settled;
    }
    if (run) run.uncertain = true;
    if (ev.kind === "PARTIAL") block(STAGE_RESUME_BLOCKER, false, true, "STAGE");
    else if (ev.kind === "BLOCKED") block(ev.detail, true);
    else block("the stage's owner records could not be verified");
    return false;
  };
  /** the end of a stage run (first dispatch or resumption): settled by owner evidence about THAT operation, never by a status line */
  const settleStage = async (run: Run): Promise<void> => {
    const cur = pending;
    if (!cur?.stage || cur.run_id !== run.id) {
      run.uncertain = true;
      block("the stage's identity was not recorded; engineering must inspect it", true);
      return;
    }
    const ev = await rec.stageOutcome(config, cur.stage);
    // a shutdown leaves the record as it is: the restart reads the same evidence
    if (closing) return;
    applyStageEvidence(ev, cur.stage, run);
  };
  const stageReadback = (id: StageIdentity, ev: StageOutcome): string => {
    const what: Record<StageKind, string> = {
      LOCUS: "the character's physical location",
      CHRONOLOGY: "the starting chronology",
      CLARIFY: "the player's handling-cycle clarification",
      PREPARE: "the collection preparation",
      DECLARE: "the closed-setting declaration",
      FINISH: "the cycle attestation and the connection",
    };
    return ev.kind === "COMPLETE"
      ? `owner readback: ${what[id.kind]} is committed, current and verified`
      : ev.kind === "STALE"
        ? `owner readback: ${what[id.kind]} was committed and an owner's later change has made it stale; it must be declared again`
        : ev.kind === "PARTIAL"
          ? `owner readback: ${what[id.kind]} is partly done; running the finishing stage again completes exactly what is missing and asks nobody`
          : "owner readback: nothing of that stage was committed";
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
    if (cur.stage) {
      const ev = await rec.stageOutcome(config, cur.stage);
      if (closing) return refuse(503, "the server is closing; the operation remains pending");
      if (ev.kind === "PARTIAL" && cur.stage.kind !== "FINISH") {
        block(STAGE_RESUME_BLOCKER, false, true, "STAGE");
        return {
          ok: true,
          run: finishedRun(
            label,
            [
              `owner readback: ${ev.landed.join(", ")} of this stage are committed and the rest is not`,
              `RECOVERY BLOCKED: ${STAGE_RESUME_BLOCKER}`,
            ],
            4,
          ),
        };
      }
      if (ev.kind === "BLOCKED") return blocked(ev.detail, [], true);
      if (ev.kind === "UNAVAILABLE")
        return blocked("the stage's owner records could not be verified");
      if (!resolve()) return blocked(blocker ?? "the record could not be cleared", [], true);
      if (ev.kind === "COMPLETE") dropInputs(config, retainedBy(cur.stage));
      return { ok: true, run: finishedRun(label, [stageReadback(cur.stage, ev)], 0) };
    }
    if (cur.command === LOCALITY_COMMAND) {
      if (!cur.setup)
        return blocked(
          "the original setup document identity was not recorded; engineering must inspect it",
          [],
          true,
        );
      const ev = await rec.localityEvidence(config, cur.setup);
      if (closing) return refuse(503, "the server is closing; the operation remains pending");
      if (ev.kind === "RESUMABLE") {
        block(RESUME_BLOCKER, false, true);
        return {
          ok: true,
          run: finishedRun(
            label,
            [
              `owner readback: the original setup is confirmed; ${ev.committed.length} of 3 publications are committed${ev.package === "ABSENT" ? " (the package does not exist yet)" : ""}`,
              `RECOVERY BLOCKED: ${RESUME_BLOCKER}`,
            ],
            4,
          ),
        };
      }
      if (ev.kind === "BLOCKED") return blocked(ev.detail, [], true);
      if (ev.kind === "UNAVAILABLE")
        return blocked("the original setup's owner records could not be verified");
      if (!resolve()) return blocked(blocker ?? "the record could not be cleared", [], true);
      return {
        ok: true,
        run: finishedRun(
          label,
          [
            ev.kind === "COMPLETE"
              ? "owner readback: the original setup's retained identity, all three publications and a fresh owner-verified open agree with its document"
              : "owner readback: that original setup was never confirmed; no publication of it exists",
          ],
          0,
        ),
      };
    }
    if (cur.command === CHARACTER_COMMAND && cur.character) {
      const ev = await rec.characterOutcome(config, cur.character);
      if (closing) return refuse(503, "the server is closing; the operation remains pending");
      if (ev.kind === "KEPT_UNRELEASED") {
        block(CHARACTER_RESUME_BLOCKER, false, true, "CHARACTER");
        return {
          ok: true,
          run: finishedRun(
            label,
            [
              "owner readback: the player's keep is retained and the release is not committed",
              `RECOVERY BLOCKED: ${CHARACTER_RESUME_BLOCKER}`,
            ],
            4,
          ),
        };
      }
      if (ev.kind === "BLOCKED") return blocked(ev.detail, [], true);
      if (ev.kind === "UNAVAILABLE")
        return blocked("the character's owner records could not be verified");
      if (!resolve()) return blocked(blocker ?? "the record could not be cleared", [], true);
      if (ev.kind === "BOUND") clearCharacterRecord(config);
      return {
        ok: true,
        run: finishedRun(
          label,
          [
            ev.kind === "BOUND"
              ? "owner readback: the character's release, its separately confirmed native placement and the referee evidence are all committed and verified"
              : ev.kind === "RELEASED_UNBOUND"
                ? "owner readback: the character is released and verified; it is NOT placed (the placement is a separate choice the player has not completed)"
                : "owner readback: no keep was retained and no character was released; the player's words are still held for another offer",
          ],
          0,
        ),
      };
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
    authority?: Pick<ToolContext, "scopes" | "client" | "grant">,
    review?: ReviewLaunch,
  ): Promise<Launch> {
    return track(launchPlayerWork(request, lane, authority, review));
  }
  async function launchPlayerWork(
    request: { command: unknown; options?: unknown; setup?: unknown },
    lane: "page" | "chat",
    authority?: Pick<ToolContext, "scopes" | "client" | "grant">,
    review?: ReviewLaunch,
  ): Promise<Launch> {
    if (closing) return refuse(503, "the server is closing; nothing was dispatched");
    if (launching || (player && !player.done))
      return refuse(409, "a command is already running: answer it or stop it first");
    if (readingSetting > 0)
      return refuse(
        409,
        "the setting is being read; try again in a moment. Nothing was dispatched",
      );
    launching = true;
    try {
      const built = buildPlayerCommand(config, request);
      if (!built.ok) return refuse(400, built.reason);
      const command = String(request.command);
      const ordinary = lane === "chat" && CHAT_COMMANDS.has(command) && command !== "reconcile";
      if (
        ordinary &&
        (!authority?.scopes.includes("player") || !authority.client || !authority.grant)
      ) {
        built.value.cleanup();
        return refuse(403, "an authenticated player request is required; nothing was dispatched");
      }
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
      const setup = SETUP_DOCUMENT_COMMANDS.has(command)
        ? captureSetup(config, command, built.value.argv[setupAt + 1] ?? "")
        : null;
      if (SETUP_DOCUMENT_COMMANDS.has(command) && !setup) {
        const why =
          command === LOCALITY_COMMAND
            ? explainLocalitySetup(built.value.argv[setupAt + 1] ?? "")
            : [];
        built.value.cleanup();
        return why.length > 0
          ? refuse(
              400,
              `the setting is not a complete, valid ORIGINAL locality setup (${why.join("; ")}); nothing was dispatched`,
            )
          : refuse(503, "the setup identity could not be established; nothing was dispatched");
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
      // Re-read the operator-owned scenario after capture. No model-provided actor/owner identity may select this capability.
      let accepted: OrdinaryAction | undefined;
      if (ordinary) {
        const sc = checkScenarioFile(config.scenarioFile, { strict: true });
        const actor = identity?.pc_id ?? collection?.pc_id;
        const matches =
          sc.ok &&
          actor === sc.scenario.player_character &&
          (command !== "collect" ||
            (options["world"] === sc.scenario.world &&
              options["source"] === sc.scenario.source &&
              options["reserve"] === sc.scenario.reserve &&
              options["mechanism"] === sc.scenario.mechanism &&
              options["basis"] === sc.scenario.basis &&
              options["quantity-unit"] === sc.scenario.quantity_unit));
        if (!matches || !actor) {
          built.value.cleanup();
          return refuse(
            409,
            "the stored scenario and operation's character do not agree; nothing was dispatched",
          );
        }
        const verb =
          command === "collect" ||
          command === "collect-finish" ||
          command === "cease" ||
          command === "observe-surroundings"
            ? (command as OrdinaryVerb)
            : null;
        if (verb)
          accepted = bindOrdinaryAction({
            campaignId: config.campaignId,
            pcId: actor,
            operationId: id,
            client: authority!.client,
            grant: authority!.grant,
            verb,
            ...(collection ? { revision: collection.revision } : {}),
            action:
              command === "collect"
                ? {
                    source: { world_id: options["world"], source_key: options["source"] },
                    reserve_id: options["reserve"],
                    quantity: { amount: Number(options["amount"]), unit: options["quantity-unit"] },
                    mechanism_id: options["mechanism"],
                    basis_id: options["basis"],
                  }
                : command === "collect-finish"
                  ? { act_id: collection?.act_id, target: collection?.target }
                  : command === "cease"
                    ? { act_id: collection?.act_id }
                    : { task_id: identity?.task_id },
          });
      }
      if (closing) {
        if (accepted) revokeOrdinaryAction(accepted);
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
        if (accepted) revokeOrdinaryAction(accepted);
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
          () => {
            if (accepted) revokeOrdinaryAction(accepted);
            built.value.cleanup();
          },
          { quiet: false, ...(review ? { review } : {}) },
          command === LOCALITY_COMMAND ? settleLocality : settleNormal,
          (env) => {
            const execution = accepted ? { ...env, ordinaryAction: accepted } : env;
            return COLLECTION_COMMANDS.has(command)
              ? rec.runCollection(config, record, execution)
              : cli(built.value.argv, execution);
          },
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
  /**
   * Finishes the ONE retained, confirmed, interrupted locality setup with ITS OWN document: the document comes from the trusted pending
   * record (validated against its digest and this campaign), never from the caller, and the shipped `establish-locality` asks the player
   * for a fresh confirmation exactly as it would for a first run. It is offered only when the owners' evidence says this setup is
   * confirmed and not yet whole; every other state is refused with its own reason and nothing is dispatched.
   */
  async function resumeSetupWork(review?: ReviewLaunch): Promise<Launch> {
    if (closing) return refuse(503, "the server is closing; nothing was dispatched");
    if (launching || (player && !player.done))
      return refuse(409, "a command is already running: answer it or stop it first");
    if (readingSetting > 0)
      return refuse(
        409,
        "the setting is being read; try again in a moment. Nothing was dispatched",
      );
    launching = true;
    try {
      const again = readPending(config);
      pending = again.kind === "PENDING" ? again.pending : null;
      if (again.kind === "UNREADABLE") {
        block(UNREADABLE_BLOCKER, true);
        return refuse(409, UNREADABLE_BLOCKER);
      }
      const cur = pending;
      if (!cur || cur.command !== LOCALITY_COMMAND)
        return refuse(409, "no interrupted original setup is waiting to be resumed");
      unresolvedOutcome = true;
      if (!cur.setup) {
        block(
          "the original setup document identity was not recorded; engineering must inspect it",
          true,
        );
        return refuse(409, blocker ?? "the original setup cannot be resumed");
      }
      if (review && !reviews.ownsRun(review.authority, cur.request_run_id ?? cur.run_id))
        return refuse(403, "the original request belongs to another authority or is unavailable");
      const ev = await rec.localityEvidence(config, cur.setup);
      if (closing) return refuse(503, "the server is closing; nothing was dispatched");
      if (ev.kind !== "RESUMABLE") {
        if (ev.kind === "BLOCKED") block(ev.detail, true);
        return refuse(
          409,
          ev.kind === "COMPLETE" || ev.kind === "NO_EFFECT"
            ? "the owners' evidence already settles the original setup: run reconcile_last_action"
            : ev.kind === "BLOCKED"
              ? `the original setup cannot be resumed: ${ev.detail}; engineering must inspect it`
              : "the original setup's owner records could not be verified now; nothing was dispatched",
        );
      }
      const built = buildPlayerCommand(config, {
        command: LOCALITY_COMMAND,
        setup: cur.setup.document,
      });
      if (!built.ok)
        return refuse(503, "the retained setup could not be prepared; nothing was dispatched");
      if (closing) {
        built.value.cleanup();
        return refuse(503, "the server is closing; nothing was dispatched");
      }
      const id = newRunId();
      const resumed = {
        ...cur,
        request_run_id: cur.request_run_id ?? cur.run_id,
        run_id: id,
        dispatched_at: now(),
        state: "DISPATCHED" as const,
        blocker: null,
      };
      if (!writePending(config, resumed)) {
        built.value.cleanup();
        return refuse(503, "the original recovery record could not be maintained");
      }
      pending = resumed;
      const reviewed = review
        ? {
            ...review,
            recover: true,
            originalRun: cur.request_run_id ?? cur.run_id,
            sources: reviews.sources(review.authority),
          }
        : undefined;
      return {
        ok: true,
        run: startRun(
          id,
          LOCALITY_COMMAND,
          built.value.argv,
          built.value.cleanup,
          { quiet: false, ...(reviewed ? { review: reviewed } : {}) },
          settleLocality,
        ),
      };
    } finally {
      launching = false;
    }
  }
  const settingProposal = (identity: PendingOperation["setup"]): unknown => {
    if (!identity) return undefined;
    try {
      return JSON.parse(identity.document);
    } catch {
      return undefined;
    }
  };
  /** the owner-backed account of the setting: read-only, it settles nothing, starts nothing and reads no campaign while a command holds it */
  async function settingStatusWork(): Promise<SettingStatus> {
    // a command that is starting or running holds (or is about to take) the campaign's writer lock: reading now would meet it
    if (launching)
      return { state: "UNAVAILABLE", barrier: "NONE", detail: "another command is starting now" };
    readingSetting++;
    try {
      return await readSetting();
    } finally {
      readingSetting--;
    }
  }
  async function readSetting(): Promise<SettingStatus> {
    const running = player && !player.done && player.label === LOCALITY_COMMAND ? player : null;
    const held = readPending(config);
    const mine =
      held.kind === "PENDING" && held.pending.command === LOCALITY_COMMAND ? held.pending : null;
    if (running) {
      const proposal = settingProposal(mine?.setup);
      return {
        state: running.terminal.snapshot(0).pending ? "AWAITING_CONFIRMATION" : "IN_PROGRESS",
        barrier: "NONE",
        ...(proposal !== undefined ? { proposal } : {}),
      };
    }
    if (held.kind === "UNREADABLE")
      return { state: "BLOCKED", barrier: "ENGINEERING", detail: UNREADABLE_BLOCKER };
    if (player && !player.done)
      return { state: "UNAVAILABLE", barrier: "NONE", detail: "another command is running now" };
    if (mine) {
      if (!mine.setup)
        return {
          state: "BLOCKED",
          barrier: "ENGINEERING",
          detail: "the original setup document identity was not recorded",
        };
      const ev = await rec.localityEvidence(config, mine.setup);
      const proposal = settingProposal(mine.setup);
      if (ev.kind === "COMPLETE")
        return { state: "ESTABLISHED", barrier: "RECONCILE", readback: ev.readback };
      if (ev.kind === "NO_EFFECT")
        return {
          state: "NOT_CONFIRMED",
          barrier: "RECONCILE",
          detail: ev.detail,
          ...(proposal !== undefined ? { proposal } : {}),
        };
      if (ev.kind === "RESUMABLE")
        return {
          state: "RESUMABLE",
          barrier: "RESUME",
          committed: ev.committed,
          ...(proposal !== undefined ? { proposal } : {}),
        };
      if (ev.kind === "BLOCKED")
        return {
          state: "BLOCKED",
          barrier: "ENGINEERING",
          detail: ev.detail,
          ...(proposal !== undefined ? { proposal } : {}),
        };
      return {
        state: "UNAVAILABLE",
        barrier: "RECONCILE",
        detail: ev.detail,
        ...(proposal !== undefined ? { proposal } : {}),
      };
    }
    const slot = await rec.campaignSetting(config);
    if (slot.kind === "ESTABLISHED")
      return { state: "ESTABLISHED", barrier: "NONE", readback: slot.readback };
    if (slot.kind === "NOT_STARTED") return { state: "NOT_STARTED", barrier: "NONE" };
    if (slot.kind === "INCOMPLETE")
      return {
        state: "BLOCKED",
        barrier: "ENGINEERING",
        committed: slot.committed,
        detail:
          "a confirmed setup is not complete and the adapter holds no record of its document; the operator must finish it",
      };
    if (slot.kind === "BLOCKED")
      return { state: "BLOCKED", barrier: "ENGINEERING", detail: slot.detail };
    return { state: "UNAVAILABLE", barrier: "NONE", detail: slot.detail };
  }
  // -- the player's ORIGINAL character: staged runs of the shipped `author-character` -----------------------------------------------
  type CharacterRequest =
    | { readonly kind: "PROPOSE"; readonly draft: CharacterDraft }
    | { readonly kind: "REVISE"; readonly edits: readonly Edit[] }
    | { readonly kind: "PLACE"; readonly statement: string }
    | { readonly kind: "RESUME" };
  const CHARACTER_WORDS_BLOCKER =
    "the retained character words are unreadable or not this campaign's; engineering must inspect them";
  const STATE_WORDS: Readonly<Record<string, string>> = {
    KEPT_UNRELEASED:
      "a character has already been kept for this campaign and its release is not complete: a kept character is never replaced or asked again; call resume_original_character to finish that release",
    RELEASED_UNBOUND:
      "a character has already been kept and released for this campaign: a kept character is never replaced here. Its placement is a separate choice (place_original_character)",
    BOUND:
      "a character has already been kept, released and placed for this campaign: a kept character is never replaced here",
  };
  const WORDS_CONFLICT =
    "the retained character words belong to another world, place or character than the verified ones; engineering must inspect them";
  /**
   * A retained words record that is PRESENT must belong to the independently verified world, place and character (the kept or
   * released character's own identity, or the service's technical one while none exists). Present-but-conflicting is a conflict, never
   * "absent": it is not ignored, re-identified, adopted or overwritten.
   */
  const reconcileWords = (
    held: CharacterRecord | null,
    st: { readonly world_id: string; readonly locus_id: string; readonly pc_id: string | null },
  ): { readonly ok: true; readonly words: CharacterRecord | null } | { readonly ok: false } =>
    held === null ||
    (held.world_id === st.world_id &&
      held.locus_id === st.locus_id &&
      held.pc_id === (st.pc_id ?? chosenCharacterId(config)))
      ? { ok: true, words: held }
      : { ok: false };

  async function launchCharacterWork(
    req: CharacterRequest,
    review?: ReviewLaunch,
  ): Promise<CharacterLaunch> {
    if (closing) return refuse(503, "the server is closing; nothing was dispatched");
    if (launching || (player && !player.done))
      return refuse(409, "a command is already running: answer it or stop it first");
    if (readingSetting > 0)
      return refuse(
        409,
        "the setting is being read; try again in a moment. Nothing was dispatched",
      );
    launching = true;
    try {
      // the trusted operator may have inspected, replaced or removed the durable record: it is read afresh, never taken from memory
      const again = readPending(config);
      pending = again.kind === "PENDING" ? again.pending : null;
      if (again.kind === "UNREADABLE") {
        block(UNREADABLE_BLOCKER, true);
        return refuse(409, UNREADABLE_BLOCKER);
      }
      if (again.kind === "PENDING" && !unresolvedOutcome) {
        unresolvedOutcome = true;
        blocker ??= "an earlier action's outcome is not established";
      }
      let resuming = false;
      if (unresolvedOutcome) {
        const cur = pending;
        if (req.kind !== "RESUME" || !cur || cur.command !== CHARACTER_COMMAND || !cur.character)
          return refuse(409, uncertainReason("chat"));
        const ev = await rec.characterOutcome(config, cur.character);
        if (closing) return refuse(503, "the server is closing; nothing was dispatched");
        if (ev.kind !== "KEPT_UNRELEASED") {
          if (ev.kind === "BLOCKED") block(ev.detail, true);
          return refuse(
            409,
            ev.kind === "BLOCKED"
              ? `the character cannot be resumed: ${ev.detail}; engineering must inspect it`
              : ev.kind === "UNAVAILABLE"
                ? "the character's owner records could not be verified now; nothing was dispatched"
                : "the owners' evidence already settles the character operation: run reconcile_last_action",
          );
        }
        resuming = true;
      }
      const read = readCharacterRecord(config);
      if (read.kind === "UNREADABLE") return refuse(409, CHARACTER_WORDS_BLOCKER);
      const st: CharacterState = await rec.readCharacter(config);
      if (closing) return refuse(503, "the server is closing; nothing was dispatched");
      if (st.kind === "NO_SETTING")
        return refuse(
          409,
          "the player's original setting is not established yet; establish it first. Nothing was dispatched",
        );
      if (st.kind === "BLOCKED")
        return refuse(
          409,
          `the character cannot be continued: ${st.detail}; engineering must inspect it. Nothing was dispatched`,
        );
      if (st.kind === "UNAVAILABLE")
        return refuse(
          409,
          "the character's owner records could not be verified now; nothing was dispatched",
        );
      const pcId = st.kind === "NONE" ? chosenCharacterId(config) : st.pc_id;
      if (review && req.kind === "RESUME" && !reviews.ownsActor(review.authority, pcId))
        return refuse(
          403,
          "the original character request belongs to another authority or is unavailable",
        );
      const place = { world_id: st.world_id, locus_id: st.locus_id };
      const reconciled = reconcileWords(read.kind === "RECORD" ? read.record : null, st);
      if (!reconciled.ok) return refuse(409, `${WORDS_CONFLICT}; nothing was dispatched`);
      const held = reconciled.words;
      const notReady = async (needs: Parameters<typeof refereeReadiness>[1]) => {
        const ready = await refereeReadiness(config, needs);
        return ready.ok ? null : refuse(409, `${ready.reason}; nothing was dispatched`);
      };

      let identity: CharacterIdentity;
      let words: { draft?: CharacterDraft; presence?: string } = {};
      let retain: CharacterRecord | null = null;
      const offer = async (draft: CharacterDraft, revision: number): Promise<Launch | null> => {
        const contract = contractOfDraft(pcId, draft);
        if (!contract)
          return refuse(
            400,
            `the character still lacks: ${missingOf(draft).join("; ")}; nothing was dispatched`,
          );
        // the whole mandatory review must be deliverable, or nothing is asked
        if (!fitsCharacterConfirmation(pcId, draft))
          return refuse(
            400,
            "this character is too large to be shown whole to the player for review; nothing was dispatched. Offer fewer or shorter statements",
          );
        const blockedBy = await notReady(["I002_CLASSIFY", "IR_NATIVE_COMPATIBILITY"]);
        if (blockedBy) return blockedBy;
        retain = {
          format: "immortalis-chat-character-words",
          format_version: 1,
          campaign_id: config.campaignId,
          pc_id: pcId,
          ...place,
          draft,
          revision,
          draft_sha256: draftSha(draft),
          placement: null,
        };
        identity = {
          stage: "KEEP",
          pc_id: pcId,
          ...place,
          draft,
          contract_sha256: contractSha(contract),
          statement: null,
        };
        words = { draft };
        return null;
      };

      if (req.kind === "PROPOSE" || req.kind === "REVISE") {
        if (st.kind !== "NONE") return refuse(409, STATE_WORDS[st.kind] ?? "a character is held");
        let draft: CharacterDraft;
        let revision: number;
        if (req.kind === "PROPOSE") {
          draft = req.draft;
          revision = held?.draft
            ? held.draft_sha256 === draftSha(draft)
              ? held.revision
              : held.revision + 1
            : 1;
        } else {
          if (!held?.draft)
            return refuse(
              409,
              "no draft is retained to revise; offer the character with propose_original_character",
            );
          const applied = applyEdits(held.draft, req.edits);
          if (!applied.ok)
            return refuse(
              400,
              `CHANGE REFUSED, the character is unchanged: ${applied.reason}; nothing was dispatched`,
            );
          draft = applied.draft;
          revision = held.revision + 1;
        }
        if (revision > MAX_REVISIONS)
          return refuse(409, `a character may be revised at most ${MAX_REVISIONS} times`);
        if (missingOf(draft).length > 0) {
          // an incomplete revision is RETAINED (the console keeps it too) and nothing is asked
          const kept: CharacterRecord = {
            format: "immortalis-chat-character-words",
            format_version: 1,
            campaign_id: config.campaignId,
            pc_id: pcId,
            ...place,
            draft,
            revision,
            draft_sha256: draftSha(draft),
            placement: null,
          };
          if (!writeCharacterRecord(config, kept))
            return refuse(503, "the character words could not be retained; nothing was dispatched");
          return {
            ok: true,
            run: null,
            retained: {
              state: "DRAFT_RETAINED",
              barrier: "NONE",
              draft,
              missing: missingOf(draft),
              revision,
            },
          };
        }
        const refused = await offer(draft, revision);
        if (refused) return refused;
      } else if (req.kind === "PLACE") {
        if (st.kind !== "RELEASED_UNBOUND")
          return refuse(
            409,
            st.kind === "BOUND"
              ? "the character is already placed; nothing was dispatched"
              : st.kind === "KEPT_UNRELEASED"
                ? "the character is kept but its release is not complete: call resume_original_character first. Placement is a separate, later choice"
                : "no character has been kept and released yet: placement is a separate, later choice and needs a released character",
          );
        const judged = judgeStatement(req.statement);
        if (!judged.ok) return refuse(400, `${judged.reason}; nothing was dispatched`);
        const blockedBy = await notReady(["IR_NATIVE_COMPATIBILITY"]);
        if (blockedBy) return blockedBy;
        retain = held
          ? { ...held, placement: { statement: judged.text } }
          : {
              format: "immortalis-chat-character-words",
              format_version: 1,
              campaign_id: config.campaignId,
              pc_id: pcId,
              ...place,
              draft: null,
              revision: 1,
              draft_sha256: null,
              placement: { statement: judged.text },
            };
        identity = {
          stage: "PLACE",
          pc_id: pcId,
          ...place,
          draft: null,
          contract_sha256: null,
          statement: judged.text,
        };
        words = { presence: judged.text };
      } else {
        // a resumption finishes only what the owners and the retained words show was begun; a fresh question is asked only where a fresh
        // confirmation is still required
        if (st.kind === "BOUND")
          return refuse(409, "the character is already placed; there is nothing to resume");
        if (st.kind === "KEPT_UNRELEASED") {
          identity = {
            stage: "KEEP",
            pc_id: pcId,
            ...place,
            draft: null,
            contract_sha256: null,
            statement: null,
          };
          // the release is finished from exactly what was kept: it needs the referee's classification evidence the player already saw
        } else if (st.kind === "RELEASED_UNBOUND") {
          const statement = held?.placement?.statement;
          if (statement === undefined)
            return refuse(
              409,
              "no placement statement is retained: the player says where the character is originally present (place_original_character)",
            );
          const blockedBy = await notReady(["IR_NATIVE_COMPATIBILITY"]);
          if (blockedBy) return blockedBy;
          identity = {
            stage: "PLACE",
            pc_id: pcId,
            ...place,
            draft: null,
            contract_sha256: null,
            statement,
          };
          words = { presence: statement };
        } else {
          if (!held?.draft)
            return refuse(
              409,
              "no complete draft is retained to review again; offer the character with propose_original_character",
            );
          const refused = await offer(held.draft, held.revision);
          if (refused) return refused;
        }
      }

      if (closing) return refuse(503, "the server is closing; nothing was dispatched");
      if (retain && !writeCharacterRecord(config, retain))
        return refuse(503, "the character words could not be retained; nothing was dispatched");
      const originalRequestRun =
        req.kind === "RESUME" ? (pending?.request_run_id ?? pending?.run_id) : undefined;
      const id = newRunId();
      const operation: PendingOperation = {
        format: PENDING_FORMAT,
        format_version: 1,
        campaign_id: config.campaignId,
        run_id: id,
        ...(originalRequestRun ? { request_run_id: originalRequestRun } : {}),
        command: CHARACTER_COMMAND,
        options: {},
        dispatched_at: now(),
        state: "DISPATCHED",
        blocker: null,
        identity: null,
        collection: null,
        setup: null,
        character: identity!,
      };
      if (!writePending(config, operation))
        return refuse(503, "the recovery record could not be maintained; nothing was dispatched");
      pending = operation;
      if (resuming) {
        // the earlier record is replaced by this run's: the barrier stays until the owners' evidence about THIS run settles it
        unresolvedOutcome = true;
      }
      const dispatched = identity!;
      const inherited =
        review && req.kind === "RESUME" ? reviews.sources(review.authority) : undefined;
      const reviewed = review
        ? {
            ...review,
            ...(req.kind === "RESUME"
              ? {
                  recover: true,
                  ...(originalRequestRun ? { originalRun: originalRequestRun } : {}),
                }
              : {}),
            sources: {
              ...inherited,
              ...review.sources,
              generation: {
                ...inherited?.generation,
                ...review.sources?.generation,
                pc: dispatched.pc_id,
                world: dispatched.world_id,
                locus: dispatched.locus_id,
              },
            },
            derived: (request: ReviewRequest, source = reviews.sources(review.authority)) =>
              entryEvidence(source, request),
          }
        : undefined;
      const run = startRun(
        id,
        CHARACTER_COMMAND,
        [],
        () => undefined,
        { quiet: false, ...(reviewed ? { review: reviewed, actor: dispatched.pc_id } : {}) },
        settleCharacter,
        (env) => runCharacterOperation(config, dispatched, words, env, deps.character),
      );
      run.stage = dispatched.stage;
      return { ok: true, run };
    } finally {
      launching = false;
    }
  }

  const draftReport = (
    held: CharacterRecord | null,
    base: Pick<CharacterStatusReport, "barrier"> & { detail?: string },
  ): CharacterStatusReport =>
    held?.draft
      ? {
          state: "DRAFT_RETAINED",
          ...base,
          draft: held.draft,
          missing: missingOf(held.draft),
          revision: held.revision,
        }
      : { state: "NOT_STARTED", ...base };

  /** the owner-backed account of the character: read-only, it settles nothing, starts nothing and reads no campaign while a command holds it */
  async function characterStatusWork(): Promise<CharacterStatusReport> {
    if (launching)
      return { state: "UNAVAILABLE", barrier: "NONE", detail: "another command is starting now" };
    readingSetting++;
    try {
      return await readCharacterStatus();
    } finally {
      readingSetting--;
    }
  }
  async function readCharacterStatus(): Promise<CharacterStatusReport> {
    const running = player && !player.done && player.label === CHARACTER_COMMAND ? player : null;
    const held = readPending(config);
    const mine =
      held.kind === "PENDING" && held.pending.command === CHARACTER_COMMAND ? held.pending : null;
    if (running) {
      const id = mine?.character ?? null;
      return {
        state: running.terminal.snapshot(0).pending ? "AWAITING_CONFIRMATION" : "IN_PROGRESS",
        barrier: "NONE",
        ...(id
          ? {
              stage: id.stage,
              ...(id.draft ? { draft: id.draft } : {}),
              ...(id.statement !== null ? { placement: id.statement } : {}),
            }
          : {}),
      };
    }
    if (held.kind === "UNREADABLE")
      return { state: "BLOCKED", barrier: "ENGINEERING", detail: UNREADABLE_BLOCKER };
    if (player && !player.done)
      return { state: "UNAVAILABLE", barrier: "NONE", detail: "another command is running now" };
    const words = readCharacterRecord(config);
    if (words.kind === "UNREADABLE")
      return { state: "BLOCKED", barrier: "ENGINEERING", detail: CHARACTER_WORDS_BLOCKER };
    // another action's unresolved outcome is reported as such: a character that exists does not clear a mutation barrier
    const other: Pick<CharacterStatusReport, "barrier"> & { detail?: string } =
      held.kind === "PENDING" && !mine
        ? {
            barrier: structuralBlock ? "ENGINEERING" : "RECONCILE",
            detail: "another action's outcome is not established yet",
          }
        : { barrier: "NONE" };
    const wordsOf = (st: { world_id: string; locus_id: string; pc_id: string | null }) => {
      const reconciled = reconcileWords(words.kind === "RECORD" ? words.record : null, st);
      return reconciled.ok ? reconciled.words : null;
    };
    const fromState = (
      st: CharacterState,
      base: Pick<CharacterStatusReport, "barrier"> & { detail?: string },
    ): CharacterStatusReport => {
      if (st.kind === "NO_SETTING")
        return { state: "SETTING_NOT_ESTABLISHED", barrier: base.barrier, detail: st.detail };
      if (st.kind === "BLOCKED")
        return { state: "BLOCKED", barrier: "ENGINEERING", detail: st.detail };
      if (st.kind === "UNAVAILABLE")
        return {
          state: "UNAVAILABLE",
          barrier: base.barrier === "NONE" ? "NONE" : base.barrier,
          detail: st.detail,
        };
      // a present record that is not the verified setting's and character's is a conflict, reported as one
      if (!reconcileWords(words.kind === "RECORD" ? words.record : null, st).ok)
        return { state: "BLOCKED", barrier: "ENGINEERING", detail: WORDS_CONFLICT };
      if (st.kind === "NONE") return draftReport(wordsOf(st), base);
      const readback = readbackOf(st);
      // only the retained keep, finished without a new question, completes a release: it is named whenever nothing else is in the way
      if (st.kind === "KEPT_UNRELEASED")
        return {
          state: "KEPT_AWAITING_RELEASE",
          barrier: base.barrier === "NONE" ? "RESUME" : base.barrier,
          readback,
        };
      if (st.kind === "RELEASED_UNBOUND") {
        const statement = wordsOf(st)?.placement?.statement;
        return {
          state: "RELEASED_UNBOUND",
          ...base,
          readback,
          ...(statement !== undefined ? { placement: statement } : {}),
        };
      }
      return { state: "BOUND", ...base, readback };
    };
    if (mine) {
      if (!mine.character)
        return {
          state: "BLOCKED",
          barrier: "ENGINEERING",
          detail: "the character operation's identity was not recorded",
        };
      const ev = await rec.characterOutcome(config, mine.character);
      if (ev.kind === "KEPT_UNRELEASED") {
        const st = await rec.readCharacter(config);
        return fromState(st, { barrier: "RESUME" });
      }
      if (ev.kind === "BLOCKED")
        return { state: "BLOCKED", barrier: "ENGINEERING", detail: ev.detail };
      if (ev.kind === "UNAVAILABLE")
        return { state: "UNAVAILABLE", barrier: "RECONCILE", detail: ev.detail };
      const st = await rec.readCharacter(config);
      return fromState(st, { barrier: "RECONCILE" });
    }
    return fromState(await rec.readCharacter(config), other);
  }
  const expectationOf = (run: Run): CharacterExpectation | null => {
    const cur = pending;
    if (run.label !== CHARACTER_COMMAND || !cur?.character || cur.run_id !== run.id) return null;
    const id = cur.character;
    if (id.stage === "PLACE")
      return id.statement === null ? null : { stage: "PLACE", statement: id.statement };
    if (id.draft === null) return null;
    const contract = compileContract(id.pc_id, id.draft);
    return contract ? { stage: "KEEP", contract } : null;
  };

  // -- the stages that follow the character: physical location, chronology, the player's handling duration, preparation, declaration, finishing ----
  type RouteRequest = Exclude<StageRequest, { kind: "RESUME" }>;
  const sentence = (reason: string): string =>
    `${reason.replace(/[.;\s]+$/, "")}. Nothing was dispatched`;

  /** the first retained input of the player (in route order) that a bare resumption offers again; null when nothing is retained */
  const retainedRequest = (r: RouteRecord): RouteRequest | null =>
    r.chronology
      ? { kind: "CHRONOLOGY", input: r.chronology }
      : r.handling
        ? { kind: "CLARIFY", words: r.handling }
        : r.preparation
          ? { kind: "PREPARE", input: r.preparation }
          : r.declaration
            ? { kind: "DECLARE", input: r.declaration }
            : null;

  /** why the route cannot be read at all, in the words a refusal may carry */
  const unreadable = (
    read: Exclude<Awaited<ReturnType<typeof readRoute>>, { kind: "OPEN" }>,
  ): string =>
    read.kind === "NO_SETTING"
      ? "the player's original setting is not established yet; establish it first. Nothing was dispatched"
      : read.kind === "BLOCKED"
        ? `the route cannot be continued: ${read.detail}; engineering must inspect it. Nothing was dispatched`
        : "the campaign's owner records could not be verified now; nothing was dispatched";

  /** the installation as the owners' files stand now, for a route whose scenario can be derived (null otherwise) */
  const installOf = async (r: RouteFacts) => {
    if (!earlierStagesDone(r)) return null;
    const derived = deriveScenario(r);
    return derived.ok ? installState(config, derived.scenario, r.package_residue) : null;
  };

  async function launchStageWork(req: StageRequest, review?: ReviewLaunch): Promise<StageLaunch> {
    if (closing) return refuse(503, "the server is closing; nothing was dispatched");
    if (launching || (player && !player.done))
      return refuse(409, "a command is already running: answer it or stop it first");
    if (readingSetting > 0)
      return refuse(
        409,
        "the setting is being read; try again in a moment. Nothing was dispatched",
      );
    launching = true;
    try {
      // the trusted operator may have inspected, replaced or removed the durable record: it is read afresh, never taken from memory
      const again = readPending(config);
      pending = again.kind === "PENDING" ? again.pending : null;
      if (again.kind === "UNREADABLE") {
        block(UNREADABLE_BLOCKER, true);
        return refuse(409, UNREADABLE_BLOCKER);
      }
      if (again.kind === "PENDING" && !unresolvedOutcome) {
        unresolvedOutcome = true;
        blocker ??= "an earlier action's outcome is not established";
      }
      const held = readRouteRecord(config);
      if (held.kind === "UNREADABLE") return refuse(409, ROUTE_WORDS_BLOCKER);
      const record = held.kind === "RECORD" ? held.record : emptyRoute(config);
      const wait = refereeWaitSeconds(deps.character);

      let planned: PlannedRun;
      let originalDeclaration: Extract<StageIdentity, { kind: "DECLARE" }> | undefined;
      let boundEntry: OpeningSources | undefined;
      let resuming = false;
      if (unresolvedOutcome) {
        // only the partly committed stage's own retained input, confirmed afresh, can continue: nothing else starts
        const cur = pending;
        if (req.kind !== "RESUME" || !cur?.stage) return refuse(409, uncertainReason("chat"));
        if (review && !reviews.ownsRun(review.authority, cur.request_run_id ?? cur.run_id))
          return refuse(
            403,
            "the original setup request belongs to another authority or is unavailable",
          );
        const ev = await rec.stageOutcome(config, cur.stage);
        if (closing) return refuse(503, "the server is closing; nothing was dispatched");
        if (ev.kind !== "PARTIAL" || cur.stage.kind === "FINISH") {
          if (ev.kind === "BLOCKED") block(ev.detail, true);
          return refuse(
            409,
            ev.kind === "BLOCKED"
              ? `the stage cannot be resumed: ${ev.detail}; engineering must inspect it`
              : ev.kind === "UNAVAILABLE"
                ? "the stage's owner records could not be verified now; nothing was dispatched"
                : "the owners' evidence already settles the stage: run reconcile_last_action",
          );
        }
        const id = cur.stage;
        if (id.kind === "PREPARE" || id.kind === "DECLARE") {
          // the very document the human confirmed, run again with a fresh confirmation; a declaration is bound to the owners' CURRENT versions
          let identity: StageIdentity = id;
          if (id.kind === "DECLARE") {
            originalDeclaration = id;
            const read = await readRoute(config);
            if (closing) return refuse(503, "the server is closing; nothing was dispatched");
            if (read.kind !== "OPEN") return refuse(409, unreadable(read));
            identity = {
              ...id,
              closure_version: read.route.declaration.closure?.version ?? 0,
              scope_version: read.route.declaration.scope?.version ?? 0,
            };
          }
          planned = {
            identity,
            command: STAGE_COMMAND[id.kind],
            setup: id.kind === "PREPARE" ? id.setup.document : id.document,
            options: {},
            retain:
              id.kind === "PREPARE" && record.preparation
                ? { preparation: record.preparation }
                : id.kind === "DECLARE" && record.declaration
                  ? { declaration: record.declaration }
                  : {},
          };
          resuming = true;
        } else
          return refuse(
            409,
            "the owners' evidence already settles the stage: run reconcile_last_action",
          );
      } else {
        let request: RouteRequest;
        if (req.kind === "RESUME") {
          const retained = retainedRequest(record);
          if (retained === null)
            return refuse(
              409,
              "nothing is retained to resume: the player's earlier words for a stage are kept only until that stage is complete",
            );
          request = retained;
        } else request = req;
        const coverage = await refereeCoverage(config);
        const read = await readRoute(config, (facts) => probeFor(config, facts, request));
        if (closing) return refuse(503, "the server is closing; nothing was dispatched");
        if (read.kind !== "OPEN") return refuse(409, unreadable(read));
        if (read.route.character.kind === "BOUND") {
          const c = read.route.character;
          boundEntry = {
            campaign: config.campaignId,
            generation: {
              pc: c.pc_id,
              world: c.world_id,
              locus: c.locus_id,
              presence: c.statement,
            },
          };
        }
        const plan = planStage(
          config,
          read.route,
          request,
          coverage,
          request.kind === "FINISH" ? await installOf(read.route) : null,
        );
        if (plan.kind === "REFUSE") return refuse(plan.status, sentence(plan.reason));
        if (plan.kind === "DONE") {
          // the owners already hold it: nobody is asked, nothing is dispatched, and what the player said for it is no longer needed
          dropInputs(config, retainedByKind(plan.step));
          return { ok: true, run: null, done: { step: plan.step, message: plan.message } };
        }
        planned = plan.run;
        // the whole mandatory review must be deliverable, or nobody is asked
        if (!fitsReview(planned.identity))
          return refuse(
            400,
            "this is too large to be shown whole to the player for review; nothing was dispatched",
          );
      }

      if (closing) return refuse(503, "the server is closing; nothing was dispatched");
      const options: Record<string, string> = { ...planned.options };
      const direct = planned.identity.kind === "CLARIFY" || planned.identity.kind === "FINISH";
      if (wait !== null && planned.identity.kind === "LOCUS") options["referee-wait"] = wait;
      const built = direct
        ? null
        : buildPlayerCommand(config, {
            command: planned.command,
            options,
            ...(planned.setup !== null ? { setup: planned.setup } : {}),
          });
      if (built && !built.ok) return refuse(400, `${built.reason}; nothing was dispatched`);
      // the player's own words are retained BEFORE dispatch (never as consent), so an interruption, a decline or a restart costs them nothing
      if (Object.keys(planned.retain).length > 0 && !retainInput(config, planned.retain)) {
        built?.value.cleanup();
        return refuse(503, "the player's words could not be retained; nothing was dispatched");
      }
      const id = newRunId();
      const originalRequestRun =
        req.kind === "RESUME" ? (pending?.request_run_id ?? pending?.run_id) : undefined;
      const operation: PendingOperation = {
        format: PENDING_FORMAT,
        format_version: 1,
        campaign_id: config.campaignId,
        run_id: id,
        ...(originalRequestRun ? { request_run_id: originalRequestRun } : {}),
        command: planned.command,
        options,
        dispatched_at: now(),
        state: "DISPATCHED",
        blocker: null,
        identity: null,
        collection: null,
        setup: null,
        character: null,
        stage: planned.identity,
      };
      if (!writePending(config, operation)) {
        built?.value.cleanup();
        return refuse(503, "the recovery record could not be maintained; nothing was dispatched");
      }
      pending = operation;
      // the earlier record is replaced by this run's: the barrier stays until the owners' evidence about THIS run settles it
      if (resuming) unresolvedOutcome = true;
      const identity = planned.identity;
      const reviewed = review
        ? {
            ...review,
            ...(req.kind === "RESUME"
              ? {
                  recover: true,
                  ...(originalRequestRun ? { originalRun: originalRequestRun } : {}),
                }
              : {}),
            derived: (request: ReviewRequest, source = reviews.sources(review.authority)) => {
              if (
                acceptedStageEvidence(source, planned, request) ||
                (planned.identity.kind === "LOCUS" &&
                  !!boundEntry &&
                  entryEvidence(boundEntry, request))
              )
                return true;
              // The owners proved a partial ORIGINAL declaration. Only its own refreshed technical versions may reuse its exact signed human receipt.
              if (
                originalDeclaration &&
                planned.identity.kind === "DECLARE" &&
                request.verb === "declare-closed-setting"
              ) {
                const current = JSON.parse(request.subject);
                const originalSubject = canonicalJson({
                  campaign_id: config.campaignId,
                  declaration: JSON.parse(originalDeclaration.document),
                  closure_version: originalDeclaration.closure_version,
                  scope_version: originalDeclaration.scope_version,
                });
                return (
                  current.campaign_id === config.campaignId &&
                  canonicalJson(current.declaration) ===
                    canonicalJson(JSON.parse(originalDeclaration.document)) &&
                  current.closure_version === planned.identity.closure_version &&
                  current.scope_version === planned.identity.scope_version &&
                  reviews.accepted(review.authority, null, originalSubject)
                );
              }
              return false;
            },
          }
        : undefined;
      const run = startRun(
        id,
        planned.command,
        built ? built.value.argv : [],
        built ? built.value.cleanup : () => undefined,
        {
          quiet: false,
          ...(reviewed
            ? { review: reviewed, ...("pc_id" in identity ? { actor: identity.pc_id } : {}) }
            : {}),
        },
        settleStage,
        identity.kind === "CLARIFY"
          ? (env) => runClarify(config, identity, env, deps.character)
          : identity.kind === "FINISH"
            ? (env) => runFinish(config, cli, identity, env, wait)
            : undefined,
      );
      run.step = identity.kind;
      return { ok: true, run };
    } finally {
      launching = false;
    }
  }

  /** the owner-backed account of the route: read-only, it settles nothing, starts nothing and reads no campaign while a command holds it */
  async function routeStatusWork(): Promise<RouteStatus> {
    if (launching)
      return {
        state: "UNAVAILABLE",
        stages: [],
        next: null,
        readiness: { prepared_to_request_collection: false, campaign_started: false },
        barrier: "NONE",
        detail: "another command is starting now",
      };
    readingSetting++;
    try {
      return await readRouteStatus();
    } finally {
      readingSetting--;
    }
  }
  async function readRouteStatus(): Promise<RouteStatus> {
    const running = player && !player.done && player.step ? player : null;
    if (player && !player.done && !running)
      return {
        state: "UNAVAILABLE",
        stages: [],
        next: null,
        readiness: { prepared_to_request_collection: false, campaign_started: false },
        barrier: "NONE",
        detail: "another command is running now",
      };
    const held = readPending(config);
    const mine = held.kind === "PENDING" && held.pending.stage ? held.pending.stage : null;
    if (running) {
      // the running command holds the campaign: nothing is read while it does (the status says only what the run is doing)
      return {
        state: "OPEN",
        stages: [
          {
            stage: running.step ?? "stage",
            state: running.terminal.snapshot(0).pending ? "AWAITING_CONFIRMATION" : "IN_PROGRESS",
          },
        ],
        next: null,
        readiness: { prepared_to_request_collection: false, campaign_started: false },
        barrier: "NONE",
      };
    }
    const record = readRouteRecord(config);
    // ONE owner-verified open serves the whole status, and the barrier's evidence when a stage is unresolved
    const read = await readRoute(config, mine ? probeOf(mine) : {});
    const installation = read.kind === "OPEN" ? await installOf(read.route) : null;
    let barrier: Barrier = "NONE";
    let barrierDetail: string | undefined;
    if (held.kind === "UNREADABLE") {
      barrier = "ENGINEERING";
      barrierDetail = UNREADABLE_BLOCKER;
    } else if (record.kind === "UNREADABLE") {
      barrier = "ENGINEERING";
      barrierDetail = ROUTE_WORDS_BLOCKER;
    } else if (held.kind === "PENDING") {
      if (mine) {
        const ev =
          read.kind === "OPEN" && mine.kind === "FINISH"
            ? finishOutcome(
                read.route.attestation?.current === true,
                installation ?? {
                  kind: "UNAVAILABLE",
                  code: "PREREQUISITES_UNAVAILABLE",
                  detail: "the finishing prerequisites cannot be verified now",
                },
                mine,
              )
            : stageOutcome(read, mine, config.campaignId);
        barrier =
          ev.kind === "PARTIAL" && mine.kind !== "FINISH"
            ? "RESUME"
            : ev.kind === "BLOCKED"
              ? "ENGINEERING"
              : "RECONCILE";
        if (ev.kind === "BLOCKED") barrierDetail = ev.detail;
      } else {
        barrier = structuralBlock ? "ENGINEERING" : "RECONCILE";
        barrierDetail = "another action's outcome is not established yet";
      }
    }
    const coverage = await refereeCoverage(config);
    return routeStatus({
      read,
      record,
      playerViewHost: config.playerViewHostId !== null,
      coverage,
      install: installation,
      running: null,
      barrier,
      ...(barrierDetail !== undefined ? { barrierDetail } : {}),
    });
  }
  const stageExpectationOf = (run: Run): StageExpectation | null => {
    const cur = pending;
    if (!run.step || !cur?.stage || cur.run_id !== run.id) return null;
    return stageReview(cur.stage);
  };

  const playerRuns: PlayerRuns = {
    resumeKind: () => (resumableBlock ? resumeWhat : null),
    proposeCharacter: (draft, review) =>
      track(launchCharacterWork({ kind: "PROPOSE", draft }, review)),
    reviseCharacter: (edits, review) =>
      track(launchCharacterWork({ kind: "REVISE", edits }, review)),
    placeCharacter: (statement, review) =>
      track(launchCharacterWork({ kind: "PLACE", statement }, review)),
    resumeCharacter: (review) => track(launchCharacterWork({ kind: "RESUME" }, review)),
    characterStatus: () =>
      closing || openingActive
        ? Promise.resolve({
            state: "UNAVAILABLE",
            barrier: "NONE",
            detail: "the server is closing",
          } as CharacterStatusReport)
        : track(characterStatusWork()),
    characterExpectation: expectationOf,
    stage: (request, review) => track(launchStageWork(request, review)),
    routeStatus: () =>
      closing || openingActive
        ? Promise.resolve({
            state: "UNAVAILABLE",
            stages: [],
            next: null,
            readiness: { prepared_to_request_collection: false, campaign_started: false },
            barrier: "NONE",
            detail: "the server is closing",
          } as RouteStatus)
        : track(routeStatusWork()),
    stageExpectation: stageExpectationOf,
    proposeSetup: (document, review) =>
      launchPlayer({ command: LOCALITY_COMMAND, setup: document }, "chat", undefined, review),
    resumeSetup: (review) => track(resumeSetupWork(review)),
    settingStatus: () =>
      closing
        ? Promise.resolve({
            state: "UNAVAILABLE",
            barrier: "NONE",
            detail: "the server is closing",
          })
        : track(settingStatusWork()),
    current: () => player,
    unresolved: () => unresolvedOutcome,
    blocker: () => blocker,
    structural: () => structuralBlock,
    resumable: () => resumableBlock,
    launch: async (command, options, authority) => {
      if (!CHAT_COMMANDS.has(command))
        return { ok: false, status: 400, reason: "that action is not offered here" };
      return launchPlayer({ command, options }, "chat", authority);
    },
    abort: () => {
      reviews.decline();
      player?.terminal.abort();
    },
    decline: () => {
      reviews.decline();
      const waiting = player?.terminal.snapshot(0).pending;
      if (player && waiting) player.terminal.reply(waiting.id, "");
    },
  };

  function pumpOpening(review: ReviewLaunch) {
    if (
      openingActive ||
      closing ||
      readingSetting > 0 ||
      (player && !player.done) ||
      reviews.opening?.state === "PREPARED"
    )
      return;
    if (unresolvedOutcome && !pending?.stage && !pending?.character) return;
    let source: OpeningSources;
    try {
      source = reviews.sources(review.authority);
    } catch {
      reviews.opening = {
        state: "BLOCKED",
        detail: "Accepted-source receipts cannot be verified.",
      };
      return;
    }
    if (!source.generation?.grouped || !source.generation.presence) return;
    openingActive = true;
    const internal: ReviewLaunch = { authority: review.authority, internal: true };
    const waitRun = async (launched: Launch | StageLaunch | CharacterLaunch) => {
      if (!launched.ok) {
        reviews.opening = { state: "BLOCKED", detail: launched.reason };
        return false;
      }
      if (launched.run) {
        while (!launched.run.done && !closing)
          await new Promise((resolve) => setTimeout(resolve, 20));
        if (launched.run.uncertain || unresolvedOutcome) {
          reviews.opening = {
            state: "RECONCILE",
            detail: "Reconcile the same original owner operation before continuing.",
          };
          return false;
        }
        if (exitCodeOfRun(launched.run) !== 0) {
          // KEEP intentionally reports released-unbound as exit 3. Owner readback, not that CLI status, proves release completion.
          if (launched.run.label === CHARACTER_COMMAND && launched.run.stage === "KEEP") {
            const state = await rec.readCharacter(config);
            if (state.kind === "RELEASED_UNBOUND" || state.kind === "BOUND") return !closing;
          }
          reviews.opening = {
            state: "BLOCKED",
            detail:
              "The owners refused or did not establish the next supported step; no new approval was inferred.",
          };
          return false;
        }
      }
      return !closing;
    };
    const chain = async () => {
      reviews.opening = {
        state: "REALIZING",
        detail: "Realizing the accepted opening through its existing owners.",
      };
      if (unresolvedOutcome && pending?.stage) {
        if (!(await waitRun(await launchStageWork({ kind: "RESUME" }, internal)))) return;
      }
      const st = await rec.readCharacter(config);
      if (st.kind === "KEPT_UNRELEASED" || st.kind === "NONE") {
        if (!(await waitRun(await launchCharacterWork({ kind: "RESUME" }, internal)))) return;
      }
      const current = await rec.readCharacter(config);
      if (current.kind === "RELEASED_UNBOUND") {
        if (
          !(await waitRun(
            await launchCharacterWork(
              { kind: "PLACE", statement: source.generation!.presence! },
              internal,
            ),
          ))
        )
          return;
      } else if (current.kind !== "BOUND") {
        reviews.opening = {
          state: "BLOCKED",
          detail: "No accepted released character is available to place.",
        };
        return;
      }
      if (!(await waitRun(await launchStageWork({ kind: "LOCUS" }, internal)))) return;
      const r = await readRoute(config);
      if (r.kind !== "OPEN") {
        reviews.opening = { state: "BLOCKED", detail: "The current owner records cannot be read." };
        return;
      }
      if (r.route.collection_commitment) {
        reviews.opening = {
          state: "EXISTING_PLAY",
          detail:
            "This campaign already has ordinary play history. Reconnecting does not rerun setup or refresh declarations; the current owners decide what actions remain available.",
        };
        return;
      }
      if (!r.route.time) {
        const c = source.setting?.chronology;
        const parsed =
          c && typeof c === "object" ? parseChronology(c as Record<string, unknown>) : null;
        if (!parsed?.ok) {
          reviews.opening = {
            state: "MISSING_SOURCE",
            detail:
              "Exact starting chronology has no source. Daylight is preserved as lighting, not invented as an epoch or unit.",
          };
          return;
        }
        if (
          !(await waitRun(
            await launchStageWork({ kind: "CHRONOLOGY", input: parsed.value }, internal),
          ))
        )
          return;
      }
      const p = source.generation?.preparation;
      const prepared =
        p && typeof p === "object" ? parsePrepare(p as Record<string, unknown>) : null;
      if (!prepared?.ok) {
        reviews.opening = {
          state: "MISSING_SOURCE",
          detail:
            "No complete projection of an actually accepted numeric handling cycle is available. No duration or capability was invented.",
        };
        return;
      }
      if (
        !(await waitRun(
          await launchStageWork({ kind: "PREPARE", input: prepared.value }, internal),
        ))
      )
        return;
      const d = source.setting?.declaration;
      const declared =
        d && typeof d === "object" ? parseDeclare(d as Record<string, unknown>) : null;
      if (!declared?.ok) {
        reviews.opening = {
          state: "MISSING_SOURCE",
          detail:
            "Closure, source grounds or workforce completeness lacks an independent authored source; the yard description and silence supply none.",
        };
        return;
      }
      if (
        !(await waitRun(
          await launchStageWork({ kind: "DECLARE", input: declared.value }, internal),
        ))
      )
        return;
      if (!(await waitRun(await launchStageWork({ kind: "FINISH" }, internal)))) return;
      reviews.opening = {
        state: "PREPARED",
        detail:
          "The source-complete opening is prepared. Setup collected nothing, earned no observation and advanced no time. Ordinary play still needs the player's separate request.",
      };
    };
    track(
      chain()
        .catch(() => {
          reviews.opening = {
            state: "BLOCKED",
            detail: "Opening realization was interrupted; reconcile the original operation.",
          };
        })
        .finally(() => {
          openingActive = false;
        }),
    );
  }
  function exitCodeOfRun(run: Run): number | null {
    for (const line of run.terminal.snapshot(0).lines.slice().reverse()) {
      const m = /exit code (\d+)/.exec(line.text);
      if (m) return Number(m[1]);
    }
    return null;
  }

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
      ...(deps.negotiation ? { negotiation: deps.negotiation } : {}),
      instructions: TOOL_INSTRUCTIONS,
      tools: buildChatTools({
        reviews,
        advanceOpening: (ctx) => pumpOpening({ authority: ctx, internal: true }),
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
      reviews.decline();
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
