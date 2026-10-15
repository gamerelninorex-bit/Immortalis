import { canonicalJson, type CanonicalTime } from "@immortalis/contracts";
import { committedCanonicalTime, type FsOps } from "@immortalis/engine";
import { verifyLocalOperator } from "./local-operator.ts";
import {
  discardObserveRequest,
  readObserveRequest,
  readObserveRequestConfig,
} from "./observe-request-exchange.ts";
import { observeSurroundings } from "./observation.ts";
import type { CharacterResult, CharacterStatus } from "./original-pc.ts";
import { openAuthorizedPlayerView } from "./player-view.ts";
import { defaultOperatorDir } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * The OPERATOR's half of the host-requested observation (BLUE v5.2-A1 bounded brief 2026-10-15; the host's half is `observe-request.ts`,
 * which shares no code path with this module and imports nothing of confirmation, observation or the terminal). Run on the operator's own
 * console in the operator's own process, it re-proves the pending ask against canon and then hands the character to the existing
 * `observeSurroundings`, UNCHANGED, which obtains the separate, fresh, subject-bound, one-time nonce confirmation on that console, asks the AI
 * referee host the existing F-014D question, and commits the existing receipt and packet only if the engine derives OBSERVATION_ESTABLISHED.
 * The ask never stands for that confirmation: the only confirmation `observeSurroundings` accepts is a line typed on the console AFTER its
 * challenge was drawn.
 */

export type AnswerStatus =
  | CharacterStatus
  | "OBSERVATION_REQUEST_NONE"
  | "OBSERVATION_REQUEST_STALE"
  | "OBSERVATION_REQUEST_INVALID"
  | "OBSERVATION_REQUEST_UNAVAILABLE";

export interface AnswerResult {
  readonly status: AnswerStatus;
  readonly message: string;
  readonly code?: string;
  readonly details: readonly string[];
}

export interface AnswerObservationRequestParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly terminal: OperatorTerminal;
  readonly operatorDir?: string;
  readonly reclaimStaleLock?: boolean;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
  readonly refereePolls?: number;
  readonly refereePollMs?: number;
  /** how many times the retained state is looked at for a pending request before reporting none (default: once) */
  readonly requestPolls?: number;
  readonly requestPollMs?: number;
}

/** The statuses after which the ask is not discarded: the choice was not finally settled, so the operator runs the same command again. */
const KEEPS_THE_ASK: ReadonlySet<AnswerStatus> = new Set([
  "REFEREE_PENDING",
  "REFEREE_UNAVAILABLE",
  "REFEREE_ANSWER_REFUSED",
  "CHARACTER_OUTCOME_UNKNOWN",
  "SESSION_UNAVAILABLE",
  "OBSERVATION_VERIFICATION_FAILED",
]);

const answer = (
  status: AnswerStatus,
  message: string,
  details: readonly string[] = [],
  code?: string,
): AnswerResult => ({ status, message, details, ...(code !== undefined ? { code } : {}) });

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The operator answers the pending ask, if any. This function holds no confirmation, builds none and accepts none: the choice to look is
 * made, if at all, inside the existing `observeSurroundings`, on `terminal`, by a line typed after its fresh challenge.
 */
export async function answerObservationRequest(
  p: AnswerObservationRequestParams,
): Promise<AnswerResult> {
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

  // the pending ask, looked for (a bounded number of times) in the operator's own retained state
  let ask = null;
  for (let i = 0; i < Math.max(1, p.requestPolls ?? 1); i++) {
    const read = await readObserveRequest(exchange, uid);
    if (!read.ok)
      return answer(
        "OBSERVATION_REQUEST_INVALID",
        "the pending observation request is not a valid request of this campaign and operator; nothing was changed",
        [],
        read.error.code,
      );
    ask = read.value;
    if (ask !== null) break;
    if (i + 1 < Math.max(1, p.requestPolls ?? 1)) await sleep(p.requestPollMs ?? 500);
  }
  if (ask === null)
    return answer(
      "OBSERVATION_REQUEST_NONE",
      "no host has asked for an observation; nothing was changed",
    );
  const pending = ask;
  const discard = () => discardObserveRequest(exchange, pending.request_id, uid);

  // the ask must still be one the operator's own binding makes: the same bound host, for the same character
  const config = await readObserveRequestConfig(exchange, uid);
  if (!config.ok && config.error.code === "IO_FAILED") {
    // the binding cannot be read right now: reported, and the ask is kept
    return answer(
      "OBSERVATION_REQUEST_UNAVAILABLE",
      "the observation-request binding cannot be read right now; the request is kept and nothing was changed",
      [],
      config.error.code,
    );
  }
  const bound = config.ok
    ? config.value.hosts.find((h) => h.host_id === pending.host_id && h.pc_id === pending.pc_id)
    : undefined;
  if (!bound) {
    await discard();
    return answer(
      "OBSERVATION_REQUEST_INVALID",
      "the pending observation request is not from a host this operator has bound for that character; it was discarded and nothing was changed",
    );
  }

  // the ask must still be for the CURRENT canonical basis and the proved player view (a writer, an interrupted commit or an unreconciled
  // package is reported, not repaired, and the ask is kept)
  const view = await openAuthorizedPlayerView({
    campaignDir: p.campaignDir,
    campaignId: p.campaignId,
    stateDir,
    boundPcId: pending.pc_id,
    ...(p.buildId !== undefined ? { buildId: p.buildId } : {}),
    ...(p.campaignFs ? { campaignFs: p.campaignFs } : {}),
    ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
  });
  if (!view.ok)
    return answer(
      "OBSERVATION_REQUEST_UNAVAILABLE",
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
  if (
    view.value.pcId !== pending.pc_id ||
    now === null ||
    canonicalJson(now) !== canonicalJson(pending.basis)
  ) {
    await discard();
    return answer(
      "OBSERVATION_REQUEST_STALE",
      "the request was made for another canonical basis or character; it was discarded and nothing was changed. The host must ask again",
    );
  }

  p.terminal.say(
    "A HOST HAS ASKED THAT YOUR CHARACTER LOOK. That is only a request: it is not your choice, it confirms nothing, and nothing has been observed.",
  );
  p.terminal.say(`requesting host: ${pending.host_id}`);
  p.terminal.say(
    "You will now be shown the exact choice and a fresh phrase. Only that phrase, typed here by you, makes the choice; anything else declines and leaves nothing observed.",
  );

  const observed: CharacterResult = await observeSurroundings({
    campaignDir: p.campaignDir,
    campaignId: p.campaignId,
    pcId: pending.pc_id,
    terminal: p.terminal,
    operatorDir: stateDir,
    ...(p.reclaimStaleLock ? { reclaimStaleLock: true } : {}),
    ...(p.buildId !== undefined ? { buildId: p.buildId } : {}),
    ...(p.campaignFs ? { campaignFs: p.campaignFs } : {}),
    ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
    ...(p.refereePolls !== undefined ? { refereePolls: p.refereePolls } : {}),
    ...(p.refereePollMs !== undefined ? { refereePollMs: p.refereePollMs } : {}),
  });
  if (!KEEPS_THE_ASK.has(observed.status)) await discard();
  return {
    status: observed.status,
    message: observed.message,
    details: observed.details,
    ...(observed.code !== undefined ? { code: observed.code } : {}),
  };
}
