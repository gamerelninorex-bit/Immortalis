import { CanonicalCampaign, type FsOps } from "@immortalis/engine";
import { PLAYER_CHARACTER_BINDING_KEY } from "@immortalis/contracts";
import { bindGmFreightHost } from "./gm-freight-exchange.ts";
import { GM_FREIGHT_BUILD_ID } from "./gm-freight.ts";
import { gmFreightFlagsOf } from "./gm-freight-mcp.ts";
import { ensureOperatorStateDirectory, verifyLocalOperator } from "./local-operator.ts";
import { defaultOperatorDir } from "./session.ts";

/**
 * The OPERATOR entry point of the GM freight bridge: the trusted action that binds one concrete host identity to the campaign's GM
 * freight tools and writes that host's owner-only secret file. It is not reachable from a host request.
 */

interface CliStreams {
  error?: (line: string) => void;
  campaignFs?: FsOps;
  ledgerFs?: FsOps;
  out?: (line: string) => void;
}

export const GM_FREIGHT_BIND_USAGE =
  "usage: immortalis-gm-freight-bind --campaign <dir> --campaign-id <id> --host-id <id> [--operator-dir <dir>]";

const BIND_FLAGS = ["--campaign", "--campaign-id", "--host-id", "--operator-dir"] as const;

/**
 * Binds one host identity to the GM freight tools of an operator-owned NULL-PC campaign. The campaign is proved first, exactly as every
 * call proves it: the operator owns the package and the owner-only state directory, the package opens under its lock and is the named
 * campaign, and NO player character is bound (the first profile is the NULL-PC original-world profile; a campaign with a bound
 * character is refused and nothing is bound). Binding confers no role, no permission, no time and no read of any other lane.
 */
export async function runGmFreightBindCli(
  argv: readonly string[],
  streams: CliStreams = {},
): Promise<number> {
  const out = streams.out ?? ((l: string) => process.stdout.write(`${l}\n`));
  const err = streams.error ?? ((l: string) => process.stderr.write(`${l}\n`));
  const flags = gmFreightFlagsOf(argv, BIND_FLAGS);
  if (
    !flags ||
    !flags.has("--campaign") ||
    !flags.has("--campaign-id") ||
    !flags.has("--host-id")
  ) {
    err(GM_FREIGHT_BIND_USAGE);
    return 64;
  }
  const campaignDir = flags.get("--campaign")!;
  const campaignId = flags.get("--campaign-id")!;
  const hostId = flags.get("--host-id")!;
  const stateDir = flags.get("--operator-dir") ?? defaultOperatorDir(campaignDir);
  const notBound = (why: string): number => {
    out("STATUS GM_FREIGHT_HOST_NOT_BOUND");
    out(`${why}; nothing was bound.`);
    return 69;
  };
  const owner = verifyLocalOperator(campaignDir, "campaign");
  try {
    // the owner-only retained-state directory is created when absent; an existing looser one is judged, never loosened
    ensureOperatorStateDirectory(stateDir);
  } catch {
    return notBound("the operator state directory cannot be created");
  }
  const state = verifyLocalOperator(stateDir, "operator-state");
  if (!owner.ok || !state.ok || state.value.uid !== owner.value.uid)
    return notBound("the local operator is not verified for this campaign");
  const opened = await CanonicalCampaign.open(campaignDir, {
    buildId: GM_FREIGHT_BUILD_ID,
    ...(streams.campaignFs ? { fs: streams.campaignFs } : {}),
  });
  if (!opened.ok) return notBound("the campaign cannot be opened");
  const campaign = opened.value;
  try {
    if (campaign.store.head().campaign_id !== campaignId)
      return notBound("this is not the named campaign");
    if (campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY) !== undefined)
      return notBound("a player character is bound: the first freight profile is NULL-PC only");
    const bound = await bindGmFreightHost({
      stateDir,
      campaignId,
      operatorUid: owner.value.uid,
      hostId,
      ...(streams.ledgerFs ? { fs: streams.ledgerFs } : {}),
    });
    if (!bound.ok) {
      out(`STATUS GM_FREIGHT_HOST_NOT_BOUND ${bound.error.code}`);
      out(bound.error.message);
      return 69;
    }
    out("STATUS GM_FREIGHT_HOST_BOUND");
    out(
      `host ${hostId} may now author the original setting of this NULL-PC campaign, read owner-backed freight status and ask the already-governed first-profile chain to proceed. It cannot state a role, a permission, an outcome or a time, cannot advance time, and cannot read what any character perceives.`,
    );
    out(
      `secret file (owner-only; give the PATH to the host's tool server, never the contents): ${bound.value.secret_file}`,
    );
    out(
      `tool server: immortalis-gm-freight --campaign ${campaignDir} --campaign-id ${campaignId} --operator-dir ${stateDir} --host-id ${hostId} --secret-file ${bound.value.secret_file}`,
    );
    out(
      "binding confers no role or permission. The starting chronology is yours (immortalis-operator initialize-time) and every advance of time is your own choice (immortalis-operator null-advance).",
    );
    return 0;
  } finally {
    await campaign.close().catch(() => undefined);
  }
}
