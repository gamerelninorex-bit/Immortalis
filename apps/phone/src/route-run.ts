import {
  clarifyCollectionCycle,
  type CharacterStatus,
  type CliEnvironment,
} from "@immortalis/operator";
import type { CharacterRunOptions } from "./character-recovery.ts";
import type { PhoneConfig } from "./config.ts";
import type { ClarifyStage } from "./route-stages.ts";

/**
 * Runs ONE R-5 clarification over the player lane's terminal: the shipped `clarify-collection-cycle`, with the player's own words (the
 * retained identity's) in place of the console question, and reports it the way the command line does (a `STATUS` line, the fixed
 * sentence, then its bounded details). The referee's classification and the player's separate confirmation are the command's own; the
 * human types that confirmation at the trusted terminal.
 */
export async function runClarify(
  config: PhoneConfig,
  id: ClarifyStage,
  env: CliEnvironment,
  options: CharacterRunOptions = {},
): Promise<number> {
  const out = env.out ?? (() => undefined);
  const r = await clarifyCollectionCycle({
    campaignDir: config.campaignDir,
    campaignId: config.campaignId,
    pcId: id.pc_id,
    terminal: env.terminal!,
    operatorDir: config.operatorDir,
    ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
    ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
    ...(options.refereePolls !== undefined ? { refereePolls: options.refereePolls } : {}),
    ...(options.refereePollMs !== undefined ? { refereePollMs: options.refereePollMs } : {}),
    chat: { words: id.words },
  });
  out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
  out(r.message);
  for (const line of r.details) out(line);
  const ok: ReadonlySet<CharacterStatus> = new Set(["CLARIFICATION_ACCEPTED"]);
  if (ok.has(r.status)) return 0;
  if (r.status === "CHARACTER_OUTCOME_UNKNOWN") return 4;
  if (r.status === "DECLINED") return 2;
  return 3;
}

/**
 * The seconds a shipped command waits for a bound referee host, when a test (or the service's configuration) shortens the default
 * (ten minutes). `undefined` leaves the command's own default.
 */
export function refereeWaitSeconds(options: CharacterRunOptions | undefined): string | null {
  if (options?.refereePolls === undefined) return null;
  const ms = options.refereePolls * (options.refereePollMs ?? 500);
  return String(Math.max(1, Math.ceil(ms / 1000)));
}
