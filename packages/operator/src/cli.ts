import { parseArgs } from "node:util";
import type { StageOwnerExtension, FsOps } from "@immortalis/engine";
import {
  advance,
  reconcile,
  relocate,
  status,
  type CommandResult,
  type CommandStatus,
} from "./commands.ts";
import { OOC_BANNER, OOC_DEBUG_NOTE } from "./ooc.ts";
import { LocalOperatorSession } from "./session.ts";
import { stdioTerminal, type OperatorTerminal } from "./terminal.ts";

/**
 * The operator-facing local command line: `relocate`, `advance`, `reconcile`, `status`. Each invocation is one process and one
 * session: verify the local operator, open (and lock) the chosen campaign, run the one command (which asks for its own
 * confirmation on the console), close. Nothing is remembered between invocations except the campaign package and the owner-only
 * retained intents, so every reopen is a fresh, re-verified session.
 *
 * The command set is closed: there is no free-text command, no interpreter, no generic action and no way to name a role,
 * permission, identity, owner, status or "already confirmed" on the command line.
 */

export const USAGE = `${OOC_BANNER}
usage:
  immortalis-operator relocate  --campaign <dir> --campaign-id <id> --world <id> --locus <id> --delivery-unit <unit> --delivery-value <n>
  immortalis-operator advance   --campaign <dir> --campaign-id <id>
  immortalis-operator reconcile --campaign <dir> --campaign-id <id>
  immortalis-operator status    --campaign <dir> [--campaign-id <id>]
options (all commands): [--operator-dir <dir>] [--reclaim-stale-lock]

relocate: --world/--locus are the character's chosen destination (confirmation 1 of 2).
  --delivery-unit/--delivery-value are NOT part of that choice: they are the out-of-character SCENARIO DELIVERY BOUNDARY, an
  exact canonical-time value you declare from outside the world to exercise the movement foundation. Both are required; there
  is no default, nothing is calculated, and it is no travel time, ETA, forecast or guarantee of arrival.
advance: a separate, second confirmation to advance time to that declared boundary and no further.
${OOC_DEBUG_NOTE}`;

export interface CliEnvironment {
  readonly terminal?: OperatorTerminal;
  /** owner registrations the saved campaign was written with (an embedding supplies them; the shipped binary has none) */
  readonly extension?: StageOwnerExtension;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
  readonly out?: (line: string) => void;
}

export const EXIT = {
  OK: 0,
  DECLINED: 2,
  UNAVAILABLE: 3,
  UNKNOWN: 4,
  USAGE: 64,
} as const;

const exitOf = (s: CommandStatus): number => {
  switch (s) {
    case "RELOCATION_COMMITTED":
    case "ADVANCE_COMMITTED":
    case "NOTHING_TO_RECONCILE":
      return EXIT.OK;
    case "DECLINED":
      return EXIT.DECLINED;
    case "RELOCATION_OUTCOME_UNKNOWN":
    case "ADVANCE_OUTCOME_UNKNOWN":
    case "RECONCILIATION_REQUIRED":
      return EXIT.UNKNOWN;
    default:
      return EXIT.UNAVAILABLE;
  }
};

const OPTIONS = {
  campaign: { type: "string" },
  "campaign-id": { type: "string" },
  "operator-dir": { type: "string" },
  "reclaim-stale-lock": { type: "boolean" },
  world: { type: "string" },
  locus: { type: "string" },
  "delivery-unit": { type: "string" },
  "delivery-value": { type: "string" },
} as const;

const COMMAND_OPTIONS: Record<string, readonly string[]> = {
  relocate: ["world", "locus", "delivery-unit", "delivery-value"],
  advance: [],
  reconcile: [],
  status: [],
};

type Parsed =
  | {
      readonly ok: true;
      readonly command: string;
      readonly values: Readonly<Record<string, string | boolean | undefined>>;
    }
  | { readonly ok: false };

function parse(argv: readonly string[]): Parsed {
  try {
    const parsedArgs = parseArgs({
      args: [...argv],
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    });
    const values: Readonly<Record<string, string | boolean | undefined>> = parsedArgs.values;
    const { positionals } = parsedArgs;
    const [command, ...rest] = positionals;
    if (command === undefined || rest.length > 0 || !(command in COMMAND_OPTIONS))
      return { ok: false };
    // a flag given twice is ambiguous input, not "the last one wins"
    const flags = argv.filter((a) => a.startsWith("--")).map((a) => a.split("=")[0]);
    if (new Set(flags).size !== flags.length) return { ok: false };
    const allowed = new Set([
      "campaign",
      "campaign-id",
      "operator-dir",
      "reclaim-stale-lock",
      ...(COMMAND_OPTIONS[command] ?? []),
    ]);
    for (const [name, value] of Object.entries(values))
      if (value !== undefined && !allowed.has(name)) return { ok: false };
    for (const need of ["campaign", ...(COMMAND_OPTIONS[command] ?? [])])
      if (typeof values[need] !== "string" || values[need] === "") return { ok: false };
    if (
      command !== "status" &&
      (typeof values["campaign-id"] !== "string" || values["campaign-id"] === "")
    )
      return { ok: false };
    return { ok: true, command, values };
  } catch {
    return { ok: false };
  }
}

const NON_NEGATIVE_INTEGER = /^(0|[1-9][0-9]*)$/;

export async function runCli(argv: readonly string[], env: CliEnvironment = {}): Promise<number> {
  const out = env.out ?? ((line: string) => process.stdout.write(`${line}\n`));
  const parsed = parse(argv);
  if (!parsed.ok) {
    out(USAGE);
    return EXIT.USAGE;
  }
  const { command, values } = parsed;
  out(OOC_BANNER);
  const str = (name: string): string | undefined =>
    typeof values[name] === "string" ? values[name] : undefined;

  let relocateInput: unknown;
  if (command === "relocate") {
    const value = str("delivery-value") ?? "";
    if (!NON_NEGATIVE_INTEGER.test(value) || !Number.isSafeInteger(Number(value))) {
      out(USAGE);
      return EXIT.USAGE;
    }
    relocateInput = {
      destination: { world_id: str("world"), locus_id: str("locus") },
      delivery_at: { unit: str("delivery-unit"), value: Number(value) },
    };
  }

  const terminal = env.terminal ?? (command === "status" ? undefined : stdioTerminal());
  try {
    const opened = await LocalOperatorSession.open({
      campaignDir: str("campaign") ?? "",
      ...(str("campaign-id") !== undefined ? { expectedCampaignId: str("campaign-id")! } : {}),
      ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
      ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
      ...(env.extension ? { extension: env.extension } : {}),
      ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
      ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
    });
    if (!opened.ok) {
      const code = (opened.error.details as { code?: string } | undefined)?.code;
      out(`STATUS SESSION_UNAVAILABLE ${opened.error.code}${code ? ` ${code}` : ""}`);
      out(opened.error.message);
      return EXIT.UNAVAILABLE;
    }
    const session = opened.value;
    try {
      if (command === "status") {
        const report = status(session);
        out(`STATUS ${report.relocation === "NONE" ? "NO_CHOICE_RETAINED" : "CHOICES_RETAINED"}`);
        out(`campaign: ${report.campaign_id}`);
        out(`operator: ${report.operator}`);
        out(`relocation choice: ${report.relocation}`);
        out(
          `progression choices: ${report.advances.length === 0 ? "none" : report.advances.join(", ")}`,
        );
        return EXIT.OK;
      }
      const ctx = { session, terminal: terminal! };
      const results: readonly CommandResult[] =
        command === "relocate"
          ? [await relocate(ctx, relocateInput)]
          : command === "advance"
            ? [await advance(ctx)]
            : await reconcile(ctx);
      for (const r of results) {
        out(`STATUS ${r.status}`);
        out(r.message);
      }
      return results.reduce<number>((code, r) => Math.max(code, exitOf(r.status)), EXIT.OK);
    } finally {
      await session.close();
    }
  } finally {
    if (!env.terminal) terminal?.close();
  }
}
