import { parseArgs } from "node:util";
import { PC_TARGET_ADVANCE_OUTCOME_UNKNOWN } from "@immortalis/contracts";
import type { FsOps } from "@immortalis/engine";
import { flagsOf, errorLineOf } from "./advance-request-mcp.ts";
import { bindAdvanceRequestHost } from "./advance-request-exchange.ts";
import { answerAdvanceRequest, type AnswerStatus } from "./advance-request-answer.ts";
import { OOC_BANNER } from "./ooc.ts";
import { openAuthorizedPlayerView } from "./player-view.ts";
import { defaultOperatorDir } from "./session.ts";
import { stdioTerminal, type OperatorTerminal } from "./terminal.ts";

/**
 * The two OPERATOR entry points of the host-requested active-PC target-only time advance: the trusted action that binds a host identity to the
 * right to ask, and the operator's own console command that answers the pending ask. Neither is reachable from a host request.
 */

interface CliStreams {
  error?: (line: string) => void;
  campaignFs?: FsOps;
  ledgerFs?: FsOps;
  out?: (line: string) => void;
}

export const ADVANCE_REQUEST_BIND_USAGE =
  "usage: immortalis-advance-request-bind --campaign <dir> --campaign-id <id> --host-id <id> [--operator-dir <dir>]";

const BIND_FLAGS = ["--campaign", "--campaign-id", "--host-id", "--operator-dir"] as const;

/**
 * The TRUSTED operator action that binds one concrete host identity to the campaign's ONE authorized player view for the single purpose of
 * leaving a time-advance request, and writes that host's owner-only secret file. The character is never named on the command line: it is the
 * character the operator kept and placed, proved against canon exactly as every read proves it. It confers nothing by itself (no role, no
 * permission, no target, no time advance, no observation, and no read: the read-only player-view binding and the observation-request binding
 * are separate).
 */
export async function runAdvanceRequestBindCli(
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
    errorLineOf(streams)(ADVANCE_REQUEST_BIND_USAGE);
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
    out(`STATUS ADVANCE_REQUEST_HOST_NOT_BOUND ${view.error.code}`);
    out("no player view of this campaign can be proved for a host; nothing was bound.");
    return 69;
  }
  const { campaign, pcId, operatorUid } = view.value;
  try {
    const bound = await bindAdvanceRequestHost({
      stateDir,
      campaignId,
      operatorUid,
      hostId,
      pcId,
      ...(streams.ledgerFs ? { fs: streams.ledgerFs } : {}),
    });
    if (!bound.ok) {
      out(`STATUS ADVANCE_REQUEST_HOST_NOT_BOUND ${bound.error.code}`);
      out(bound.error.message);
      return 69;
    }
    out("STATUS ADVANCE_REQUEST_HOST_BOUND");
    out(
      `host ${hostId} may now ASK that you consider an out-of-character time advance for the character you kept and placed (it cannot name a target, make time advance, confirm anything, or read anything).`,
    );
    out(
      `secret file (owner-only; give the PATH to the host's tool server, never the contents): ${bound.value.secret_file}`,
    );
    out(
      `tool server: immortalis-advance-request --campaign ${campaignDir} --campaign-id ${campaignId} --operator-dir ${stateDir} --host-id ${hostId} --secret-file ${bound.value.secret_file}`,
    );
    out(
      "binding confers no role or permission and advances no time; you answer a request on your own console with immortalis-advance-request-answer, naming the exact target yourself. Reading what the character perceived is a separate binding (immortalis-player-view-bind).",
    );
    return 0;
  } finally {
    await campaign.close().catch(() => undefined);
  }
}

export const ADVANCE_REQUEST_ANSWER_USAGE = `usage: immortalis-advance-request-answer --campaign <dir> --campaign-id <id> --target-unit <unit> --target-value <n> [--operator-dir <dir>] [--request-wait <seconds>] [--reclaim-stale-lock]
Run on YOUR console. If a host has asked that you consider advancing the world's time, shows you the exact choice for the target YOU name here (an exact canonical-time value, not a duration or a date) and a fresh phrase; only that phrase, typed by you, makes the choice.`;

export const ANSWER_EXIT = { OK: 0, DECLINED: 2, UNAVAILABLE: 3, UNKNOWN: 4, USAGE: 64 } as const;

const exitOf = (s: AnswerStatus): number => {
  switch (s) {
    case "PC_TARGET_ADVANCE_COMMITTED":
    case "TARGET_ADVANCE_REQUEST_NONE":
      return ANSWER_EXIT.OK;
    case "DECLINED":
      return ANSWER_EXIT.DECLINED;
    case PC_TARGET_ADVANCE_OUTCOME_UNKNOWN:
    case "RECONCILIATION_REQUIRED":
      return ANSWER_EXIT.UNKNOWN;
    default:
      return ANSWER_EXIT.UNAVAILABLE;
  }
};

const SECONDS = /^[1-9][0-9]{0,5}$/;
const NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;

/**
 * The operator's own console command. The terminal is the operator's console (standard input/output by default): the one channel a
 * confirmation can enter, and the one the host is never given. The target is typed by the operator on THIS command line, exactly as for
 * `immortalis-operator pc-target-advance`. It never prints the host's secret, the host's reasoning or what the advance did or did not cause.
 */
export async function runAdvanceRequestAnswerCli(
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
        "target-unit": { type: "string" },
        "target-value": { type: "string" },
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
    out(ADVANCE_REQUEST_ANSWER_USAGE);
    return ANSWER_EXIT.USAGE;
  }
  const str = (n: string): string | undefined =>
    typeof values[n] === "string" ? (values[n] as string) : undefined;
  const campaign = str("campaign");
  const campaignId = str("campaign-id");
  const targetUnit = str("target-unit");
  const targetValue = str("target-value");
  const requestWait = str("request-wait");
  if (
    !campaign ||
    !campaignId ||
    !targetUnit ||
    targetValue === undefined ||
    !NON_NEGATIVE_INTEGER.test(targetValue) ||
    !Number.isSafeInteger(Number(targetValue)) ||
    (requestWait !== undefined && !SECONDS.test(requestWait))
  ) {
    out(ADVANCE_REQUEST_ANSWER_USAGE);
    return ANSWER_EXIT.USAGE;
  }
  out(OOC_BANNER);
  const terminal = streams.terminal ?? stdioTerminal();
  const result = await answerAdvanceRequest({
    campaignDir: campaign,
    campaignId,
    target: { unit: targetUnit, value: Number(targetValue) },
    terminal,
    ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
    ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
    ...(streams.campaignFs ? { campaignFs: streams.campaignFs } : {}),
    ...(streams.ledgerFs ? { ledgerFs: streams.ledgerFs } : {}),
    ...(requestWait !== undefined ? { requestPolls: Number(requestWait) * 2 } : {}),
  });
  out(`STATUS ${result.status}${result.code ? ` ${result.code}` : ""}`);
  out(result.message);
  for (const line of result.details) out(line);
  if (streams.terminal === undefined) terminal.close();
  return exitOf(result.status);
}
