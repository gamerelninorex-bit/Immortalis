import type { FsOps } from "@immortalis/engine";
import { bindGmWaitHost } from "./gm-wait-exchange.ts";
import { openAuthorizedPlayerView } from "./player-view.ts";
import { defaultOperatorDir } from "./session.ts";

/**
 * F-014B A1-2a: the one OPERATOR entry point of the GM waiting enrollment. It is not reachable from a host, a player or a model.
 */

interface CliStreams {
  error?: (line: string) => void;
  campaignFs?: FsOps;
  ledgerFs?: FsOps;
  out?: (line: string) => void;
}

export const GM_WAIT_BIND_USAGE =
  "usage: node --experimental-strip-types packages/operator/src/gm-wait-bind-bin.ts --campaign <dir> --campaign-id <id> --host-id <id> [--operator-dir <dir>]";

const errorLineOf = (streams: { error?: (line: string) => void }) =>
  streams.error ?? ((l: string) => process.stderr.write(`${l}\n`));

/** Reads `--flag value` pairs; a repeated, unknown or valueless flag is a usage error. */
function flagsOf(argv: readonly string[], allowed: readonly string[]): Map<string, string> | null {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === undefined || !allowed.includes(k) || v === undefined || v === "" || flags.has(k))
      return null;
    flags.set(k, v);
  }
  return flags;
}

const BIND_FLAGS = ["--campaign", "--campaign-id", "--host-id", "--operator-dir"] as const;

/**
 * The TRUSTED operator action that enrolls one concrete host identity as the campaign's configured GM waiting host, and writes that host's
 * owner-only secret file. The character is never named on the command line: it is the character the operator kept and placed, proved
 * against canon exactly as every read proves it. The enrollment writes no canonical fact and confers no role, no permission beyond the
 * one existing GM adjudication pair for one operation, no time and no player choice.
 */
export async function runGmWaitBindCli(
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
    errorLineOf(streams)(GM_WAIT_BIND_USAGE);
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
    out(`STATUS GM_WAIT_HOST_NOT_ENROLLED ${view.error.code}`);
    out("no player view of this campaign can be proved for a host; nothing was enrolled.");
    return 69;
  }
  const { campaign, pcId, operatorUid } = view.value;
  try {
    const bound = await bindGmWaitHost({
      stateDir,
      campaignId,
      operatorUid,
      hostId,
      pcId,
      ...(streams.ledgerFs ? { fs: streams.ledgerFs } : {}),
    });
    if (!bound.ok) {
      out(`STATUS GM_WAIT_HOST_NOT_ENROLLED ${bound.error.code}`);
      out(bound.error.message);
      return 69;
    }
    out("STATUS GM_WAIT_HOST_ENROLLED");
    out(
      `host ${hostId} is now the configured GM waiting host for the character you kept and placed. It can submit a strictly validated waiting request for verification only: it cannot advance time, record anything, choose for the player or read anything.`,
    );
    out(
      `secret file (owner-only; the trusted server reads it by PATH, never give the contents to a host): ${bound.value.secret_file}`,
    );
    out(`list ${hostId} in IMMORTALIS_GM_WAIT_HOST_IDS so the phone service offers the operation.`);
    return 0;
  } finally {
    await campaign.close().catch(() => undefined);
  }
}
