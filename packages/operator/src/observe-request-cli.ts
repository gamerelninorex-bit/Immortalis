import { parseArgs } from "node:util";
import type { FsOps } from "@immortalis/engine";
import { flagsOf, errorLineOf } from "./observe-request-mcp.ts";
import { bindObserveRequestHost } from "./observe-request-exchange.ts";
import { answerObservationRequest, type AnswerStatus } from "./observe-request-answer.ts";
import { OOC_BANNER } from "./ooc.ts";
import { openAuthorizedPlayerView } from "./player-view.ts";
import { defaultOperatorDir } from "./session.ts";
import { stdioTerminal, type OperatorTerminal } from "./terminal.ts";

/**
 * The two OPERATOR entry points of the host-requested observation: the trusted action that binds a host identity to the right to ask, and the
 * operator's own console command that answers the pending ask. Neither is reachable from a host request.
 */

interface CliStreams {
  error?: (line: string) => void;
  campaignFs?: FsOps;
  ledgerFs?: FsOps;
  out?: (line: string) => void;
}

export const OBSERVE_REQUEST_BIND_USAGE =
  "usage: immortalis-observe-request-bind --campaign <dir> --campaign-id <id> --host-id <id> [--operator-dir <dir>]";

const BIND_FLAGS = ["--campaign", "--campaign-id", "--host-id", "--operator-dir"] as const;

/**
 * The TRUSTED operator action that binds one concrete host identity to the campaign's ONE authorized player view for the single purpose of
 * leaving an observation request, and writes that host's owner-only secret file. The character is never named on the command line: it is the
 * character the operator kept and placed, proved against canon exactly as every read proves it. It confers nothing by itself (no role, no
 * permission, no observation, and no read: the read-only player-view binding is separate).
 */
export async function runObserveRequestBindCli(
  argv: readonly string[],
  streams: CliStreams = {},
): Promise<number> {
  const out = streams.out ?? ((l: string) => process.stdout.write(`${l}\n`));
  const flags = flagsOf(argv, BIND_FLAGS);
  if (
    !flags ||
    !flags.has("--campaign") ||
    !flags.has("--campaign-id") ||
    !flags.has("--host-id")
  ) {
    errorLineOf(streams)(OBSERVE_REQUEST_BIND_USAGE);
    return 64;
  }
  const campaignDir = flags.get("--campaign")!;
  const campaignId = flags.get("--campaign-id")!;
  const hostId = flags.get("--host-id")!;
  const stateDir = flags.get("--operator-dir") ?? defaultOperatorDir(campaignDir);
  const view = await openAuthorizedPlayerView({
    campaignDir,
    campaignId,
    stateDir,
    ...(streams.campaignFs ? { campaignFs: streams.campaignFs } : {}),
    ...(streams.ledgerFs ? { ledgerFs: streams.ledgerFs } : {}),
  });
  if (!view.ok) {
    out(`STATUS OBSERVE_REQUEST_HOST_NOT_BOUND ${view.error.code}`);
    out("no player view of this campaign can be proved for a host; nothing was bound.");
    return 69;
  }
  const { campaign, pcId, operatorUid } = view.value;
  try {
    const bound = await bindObserveRequestHost({
      stateDir,
      campaignId,
      operatorUid,
      hostId,
      pcId,
      ...(streams.ledgerFs ? { fs: streams.ledgerFs } : {}),
    });
    if (!bound.ok) {
      out(`STATUS OBSERVE_REQUEST_HOST_NOT_BOUND ${bound.error.code}`);
      out(bound.error.message);
      return 69;
    }
    out("STATUS OBSERVE_REQUEST_HOST_BOUND");
    out(
      `host ${hostId} may now ASK that the character you kept and placed look (it cannot make the look happen, confirm it, or read anything).`,
    );
    out(
      `secret file (owner-only; give the PATH to the host's tool server, never the contents): ${bound.value.secret_file}`,
    );
    out(
      `tool server: immortalis-observe-request --campaign ${campaignDir} --campaign-id ${campaignId} --operator-dir ${stateDir} --host-id ${hostId} --secret-file ${bound.value.secret_file}`,
    );
    out(
      "binding confers no role or permission and earns no observation; you answer a request on your own console with immortalis-observe-request-answer. Reading what the character perceived is a separate binding (immortalis-player-view-bind).",
    );
    return 0;
  } finally {
    await campaign.close().catch(() => undefined);
  }
}

export const OBSERVE_REQUEST_ANSWER_USAGE = `usage: immortalis-observe-request-answer --campaign <dir> --campaign-id <id> [--operator-dir <dir>] [--referee-wait <seconds>] [--request-wait <seconds>] [--reclaim-stale-lock]
Run on YOUR console. If a host has asked that your character look, shows you the exact choice and a fresh phrase; only that phrase, typed by you, makes the choice.`;

export const ANSWER_EXIT = { OK: 0, DECLINED: 2, UNAVAILABLE: 3, UNKNOWN: 4, USAGE: 64 } as const;

const exitOf = (s: AnswerStatus): number => {
  switch (s) {
    case "OBSERVATION_RECEIVED":
    case "OBSERVATION_REQUEST_NONE":
      return ANSWER_EXIT.OK;
    case "DECLINED":
      return ANSWER_EXIT.DECLINED;
    case "CHARACTER_OUTCOME_UNKNOWN":
      return ANSWER_EXIT.UNKNOWN;
    default:
      return ANSWER_EXIT.UNAVAILABLE;
  }
};

const SECONDS = /^[1-9][0-9]{0,5}$/;

/**
 * The operator's own console command. The terminal is the operator's console (standard input/output by default): the one channel a
 * confirmation can enter, and the one the host is never given. It never prints the host's secret, the setting, the host's reasoning or why
 * nothing was received.
 */
export async function runObserveRequestAnswerCli(
  argv: readonly string[],
  streams: CliStreams & { terminal?: OperatorTerminal } = {},
): Promise<number> {
  const out = streams.out ?? ((l: string) => process.stdout.write(`${l}\n`));
  let values: Record<string, string | boolean | undefined>;
  try {
    const parsed = parseArgs({
      args: [...argv],
      options: {
        campaign: { type: "string" },
        "campaign-id": { type: "string" },
        "operator-dir": { type: "string" },
        "referee-wait": { type: "string" },
        "request-wait": { type: "string" },
        "reclaim-stale-lock": { type: "boolean" },
      },
      allowPositionals: false,
      strict: true,
    });
    values = parsed.values;
    const flags = argv.filter((a) => a.startsWith("--")).map((a) => a.split("=")[0]);
    if (new Set(flags).size !== flags.length) throw new Error("repeated");
  } catch {
    out(OBSERVE_REQUEST_ANSWER_USAGE);
    return ANSWER_EXIT.USAGE;
  }
  const str = (n: string): string | undefined =>
    typeof values[n] === "string" ? (values[n] as string) : undefined;
  const campaign = str("campaign");
  const campaignId = str("campaign-id");
  const refereeWait = str("referee-wait");
  const requestWait = str("request-wait");
  if (
    !campaign ||
    !campaignId ||
    (refereeWait !== undefined && !SECONDS.test(refereeWait)) ||
    (requestWait !== undefined && !SECONDS.test(requestWait))
  ) {
    out(OBSERVE_REQUEST_ANSWER_USAGE);
    return ANSWER_EXIT.USAGE;
  }
  out(OOC_BANNER);
  const terminal = streams.terminal ?? stdioTerminal();
  const result = await answerObservationRequest({
    campaignDir: campaign,
    campaignId,
    terminal,
    ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
    ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
    ...(streams.campaignFs ? { campaignFs: streams.campaignFs } : {}),
    ...(streams.ledgerFs ? { ledgerFs: streams.ledgerFs } : {}),
    ...(refereeWait !== undefined ? { refereePolls: Number(refereeWait) * 2 } : {}),
    ...(requestWait !== undefined ? { requestPolls: Number(requestWait) * 2 } : {}),
  });
  out(`STATUS ${result.status}${result.code ? ` ${result.code}` : ""}`);
  out(result.message);
  for (const line of result.details) out(line);
  if (streams.terminal === undefined) terminal.close();
  return exitOf(result.status);
}
