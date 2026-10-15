import {
  PC_TARGET_ADVANCE_OUTCOME_UNKNOWN,
  canonicalJson,
  type CanonicalTime,
} from "@immortalis/contracts";
import { committedCanonicalTime, type FsOps } from "@immortalis/engine";
import { pcTargetAdvance, type CommandStatus } from "./commands.ts";
import { verifyLocalOperator } from "./local-operator.ts";
import {
  discardAdvanceRequest,
  listAdvanceRequests,
  readAdvanceRequestConfig,
  type AdvanceRequestRecord,
} from "./advance-request-exchange.ts";
import { openAuthorizedPlayerView } from "./player-view.ts";
import { LocalOperatorSession, defaultOperatorDir } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * The OPERATOR's half of the host-requested active-PC target-only OOC time advance (BLUE v5.2-A1 bounded brief 2026-10-15; the host's half is
 * `advance-request.ts`, which shares no code path with this module and imports nothing of confirmation, the command set or the terminal).
 * Run on the operator's own console in the operator's own process, it re-proves the pending ask against canon (the host binding, the
 * character, the current canonical basis and the ask's own identity) and then hands the character to the existing shipped `pcTargetAdvance`
 * command, UNCHANGED, with the exact target THE OPERATOR supplied on this command line. That command shows the operator the exact choice,
 * obtains the separate, fresh, subject-bound, one-time nonce confirmation on the console, retains the confirmed intent durably with its own
 * newly minted transaction identity, and only then invokes the existing `advanceActivePcToTarget` gateway, which binds the player-choice
 * role and permission itself from that confirmation. The ask never stands for that confirmation or for that target: the only confirmation
 * `pcTargetAdvance` accepts is a line typed on the console AFTER its challenge was drawn, and the only target it accepts is the operator's.
 *
 * Nothing here names a Temporal request, a stage, a GIP status or any owner fact: whether anything falls due by the target is decided by
 * the Temporal kernel and each owning domain. A committed status is a transaction status, never attainment, expiry or perception.
 */

export type AnswerStatus =
  | CommandStatus
  | "SESSION_UNAVAILABLE"
  | "TARGET_ADVANCE_REQUEST_NONE"
  | "TARGET_ADVANCE_REQUEST_STALE"
  | "TARGET_ADVANCE_REQUEST_INVALID"
  | "TARGET_ADVANCE_REQUEST_UNAVAILABLE";

export interface AnswerResult {
  readonly status: AnswerStatus;
  readonly message: string;
  readonly code?: string;
  readonly details: readonly string[];
}

export interface AnswerAdvanceRequestParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  /** the exact canonical-time target the OPERATOR supplied; it is intent only and is judged by the existing command, gateway and kernel */
  readonly target: unknown;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
  /** how many times the retained state is looked at for a pending request before reporting none (default: once) */
  readonly requestPolls?: number;
  readonly requestPollMs?: number;
}

/**
 * The statuses after which the ask is not discarded: the choice was not finally settled (an unknown outcome or an unreconciled or stale
 * retained choice must be dealt with first, and a target the console refused is the operator's to correct), so the operator runs the same
 * command again.
 */
const KEEPS_THE_ASK: ReadonlySet<AnswerStatus> = new Set<AnswerStatus>([
  PC_TARGET_ADVANCE_OUTCOME_UNKNOWN,
  "RECONCILIATION_REQUIRED",
  "STALE_INTENT",
  "INVALID_INPUT",
  "SESSION_CLOSED",
  "SESSION_UNAVAILABLE",
]);

const answer = (
  status: AnswerStatus,
  message: string,
  details: readonly string[] = [],
  code?: string,
): AnswerResult => ({ status, message, details, ...(code !== undefined ? { code } : {}) });

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The operator answers the pending ask, if any. This function holds no confirmation, builds none and accepts none: the choice to advance is
 * made, if at all, inside the existing `pcTargetAdvance`, on `terminal`, by a line typed after its fresh challenge.
 */
export async function answerAdvanceRequest(p: AnswerAdvanceRequestParams): Promise<AnswerResult> {
  try {
    return await answerPending(p);
  } catch {
    // reachable only before the session that holds the choice exists (everything after it is settled inside `answerPending`): nothing has been
    // chosen, confirmed or committed, so the ask is kept and the operator runs the same command again
    return answer(
      "TARGET_ADVANCE_REQUEST_UNAVAILABLE",
      "the pending time-advance request cannot be answered right now; the request is kept and nothing was changed",
    );
  }
}

async function answerPending(p: AnswerAdvanceRequestParams): Promise<AnswerResult> {
  const owner = verifyLocalOperator(p.campaignDir, "campaign");
  const stateDir = p.operatorDir ?? defaultOperatorDir(p.campaignDir);
  const state = verifyLocalOperator(stateDir, "operator-state");
  if (!owner.ok || !state.ok || state.value.uid !== owner.value.uid)
    return answer("SESSION_UNAVAILABLE", "the local operator is not verified for this campaign");
  const uid = owner.value.uid;
  const exchange = {
    stateDir,
    campaignId: p.campaignId,
    ...(p.ledgerFs ? { fs: p.ledgerFs } : {}),
  };

  // the pending asks, looked for (a bounded number of times) in the operator's own retained state. Every cleanup below names an ask BY ITS
  // OWN IDENTITY (the ask is its own file), so settling an ask can never remove a newer one that arrived meanwhile.
  let asks: readonly AdvanceRequestRecord[] = [];
  for (let i = 0; i < Math.max(1, p.requestPolls ?? 1); i++) {
    const listed = await listAdvanceRequests(exchange, uid);
    if (!listed.ok)
      return answer(
        "TARGET_ADVANCE_REQUEST_UNAVAILABLE",
        "the pending time-advance requests cannot be read right now; nothing was changed",
        [],
        listed.error.code,
      );
    asks = listed.value.asks;
    if (asks.length > 0) break;
    if (listed.value.invalid > 0)
      return answer(
        "TARGET_ADVANCE_REQUEST_INVALID",
        "a pending time-advance request is not a valid request of this campaign and operator; nothing was changed",
        [],
        "REQUEST_INVALID",
      );
    if (i + 1 < Math.max(1, p.requestPolls ?? 1)) await sleep(p.requestPollMs ?? 500);
  }
  if (asks.length === 0)
    return answer(
      "TARGET_ADVANCE_REQUEST_NONE",
      "no host has asked for a time advance; nothing was changed",
    );
  const discard = (ask: AdvanceRequestRecord) =>
    discardAdvanceRequest(exchange, ask.request_id, uid);

  // an ask must still be one the operator's own binding makes: the same bound host, for the same character
  const config = await readAdvanceRequestConfig(exchange, uid);
  if (!config.ok && config.error.code === "IO_FAILED")
    // the binding cannot be read right now: reported, and the asks are kept
    return answer(
      "TARGET_ADVANCE_REQUEST_UNAVAILABLE",
      "the time-advance-request binding cannot be read right now; the request is kept and nothing was changed",
      [],
      config.error.code,
    );
  const isBound = (a: AdvanceRequestRecord) =>
    config.ok && config.value.hosts.some((h) => h.host_id === a.host_id && h.pc_id === a.pc_id);
  const bound = asks.filter(isBound);
  for (const unbound of asks.filter((a) => !isBound(a))) await discard(unbound);
  if (bound.length === 0)
    return answer(
      "TARGET_ADVANCE_REQUEST_INVALID",
      "the pending time-advance request is not from a host this operator has bound for that character; it was discarded and nothing was changed",
    );

  // an ask must still be for the CURRENT canonical basis and the proved player view (a writer, an interrupted commit or an unreconciled
  // package is reported, not repaired, and the asks are kept)
  const view = await openAuthorizedPlayerView({
    campaignDir: p.campaignDir,
    campaignId: p.campaignId,
    stateDir,
    boundPcId: bound[0]!.pc_id,
    ...(p.buildId !== undefined ? { buildId: p.buildId } : {}),
    ...(p.campaignFs ? { campaignFs: p.campaignFs } : {}),
    ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
  });
  if (!view.ok)
    return answer(
      "TARGET_ADVANCE_REQUEST_UNAVAILABLE",
      "the campaign's player view cannot be proved right now; the request is kept and nothing was changed",
      [],
      view.error.code,
    );
  let now: CanonicalTime | null;
  try {
    now = committedCanonicalTime((k) => view.value.campaign.store.getFact(k));
  } finally {
    await view.value.campaign.close().catch(() => undefined);
  }
  const sameBasis = (a: AdvanceRequestRecord, at: CanonicalTime | null) =>
    at !== null && canonicalJson(at) === canonicalJson(a.basis);
  const current = (a: AdvanceRequestRecord) => view.value.pcId === a.pc_id && sameBasis(a, now);
  const live = bound.filter(current);
  for (const stale of bound.filter((a) => !current(a))) await discard(stale);
  if (live.length === 0)
    return answer(
      "TARGET_ADVANCE_REQUEST_STALE",
      "the request was made for another canonical basis or character; it was discarded and nothing was changed. The host must ask again",
    );
  // the live asks are one ask (one character at the one current basis): the lowest identity is served, and all of them are settled with it
  const pending = live[0]!;

  // the existing command's own session: the package's single-writer lock, owner-verified re-open and the operator's retained intents
  const opened = await LocalOperatorSession.open({
    campaignDir: p.campaignDir,
    expectedCampaignId: p.campaignId,
    operatorDir: stateDir,
    ...(p.reclaimStaleLock ? { reclaimStaleLock: true } : {}),
    ...(p.buildId !== undefined ? { buildId: p.buildId } : {}),
    ...(p.campaignFs ? { campaignFs: p.campaignFs } : {}),
    ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
  });
  if (!opened.ok) {
    const code = (opened.error.details as { code?: string } | undefined)?.code;
    return answer(
      "SESSION_UNAVAILABLE",
      "the campaign cannot be opened for the operator right now; the request is kept and nothing was changed",
      [],
      code ?? opened.error.code,
    );
  }
  const session = opened.value;
  let outcome: AnswerResult;
  try {
    // between the proof above and this session another writer may have moved the basis or changed the character: the ask is re-proved here,
    // in the very session that will be shown the choice, so the operator is never asked about a basis the ask was not made at
    const basis = committedCanonicalTime((k) => session.campaign.store.getFact(k));
    const pcNow = session.campaign.binding()?.value.active_pc.entity_id;
    if (pcNow !== pending.pc_id || !sameBasis(pending, basis)) {
      for (const stale of live) await discard(stale);
      return answer(
        "TARGET_ADVANCE_REQUEST_STALE",
        "the request was made for another canonical basis or character; it was discarded and nothing was changed. The host must ask again",
      );
    }

    p.terminal.say(
      "A HOST HAS ASKED THAT YOU CONSIDER ADVANCING THE WORLD'S TIME. That is only a request: it names no target, it is not your choice, it confirms nothing, and no time has advanced.",
    );
    p.terminal.say(`requesting host: ${pending.host_id}`);
    p.terminal.say(
      "The exact target below is the one YOU gave on this command line, not the host's. You will now be shown the exact choice and a fresh phrase. Only that phrase, typed here by you, makes the choice; anything else declines and advances nothing.",
    );

    const advanced = await pcTargetAdvance({ session, terminal: p.terminal }, { target: p.target });
    outcome = answer(advanced.status, advanced.message);
  } catch {
    // an unexpected failure after any write may have left that write landed or not: an unknown outcome, never a success
    session.markAmbiguous();
    outcome = answer(
      PC_TARGET_ADVANCE_OUTCOME_UNKNOWN,
      "the outcome is not known; close, reopen and reconcile it by its original identity",
    );
  } finally {
    await session.close().catch(() => undefined);
  }
  if (!KEEPS_THE_ASK.has(outcome.status)) for (const settled of live) await discard(settled);
  return outcome;
}
