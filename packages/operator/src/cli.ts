import { parseArgs } from "node:util";
import type { StageOwnerExtension, FsOps } from "@immortalis/engine";
import {
  advance,
  nullAdvance,
  nullResume,
  pcTargetAdvance,
  pcTargetResume,
  reconcile,
  relocate,
  status,
  type CommandResult,
  type CommandStatus,
} from "./commands.ts";
import { establishLocality, localityStatus, type LocalityStatus } from "./locality.ts";
import { OOC_BANNER, OOC_DEBUG_NOTE } from "./ooc.ts";
import { authorCharacter, characterStatus, type CharacterStatus } from "./original-pc.ts";
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
  immortalis-operator null-advance --campaign <dir> --campaign-id <id> --target-unit <unit> --target-value <n>
  immortalis-operator null-resume  --campaign <dir> --campaign-id <id>
  immortalis-operator pc-target-advance --campaign <dir> --campaign-id <id> --target-unit <unit> --target-value <n>
  immortalis-operator pc-target-resume  --campaign <dir> --campaign-id <id>
  immortalis-operator reconcile --campaign <dir> --campaign-id <id>
  immortalis-operator establish-locality --campaign <dir> --campaign-id <id> --setup <file>
  immortalis-operator locality-status    --campaign <dir> [--campaign-id <id>]
  immortalis-operator author-character   --campaign <dir> --campaign-id <id> --world <id> --locus <id> --player-character <id>
  immortalis-operator character-status   --campaign <dir> [--campaign-id <id>]
  immortalis-operator status    --campaign <dir> [--campaign-id <id>]
options (all commands): [--operator-dir <dir>] [--reclaim-stale-lock]

relocate: --world/--locus are the character's chosen destination (confirmation 1 of 2).
  --delivery-unit/--delivery-value are NOT part of that choice: they are the out-of-character SCENARIO DELIVERY BOUNDARY, an
  exact canonical-time value you declare from outside the world to exercise the movement foundation. Both are required; there
  is no default, nothing is calculated, and it is no travel time, ETA, forecast or guarantee of arrival.
advance: a separate, second confirmation to advance time to that declared boundary and no further.
null-advance / null-resume: for a campaign with NO active character only (the active-PC commands above refuse it, and these refuse
  a campaign with one). null-advance is ONE explicit OOC choice to advance canonical time to the exact target given by
  --target-unit/--target-value (an exact canonical-time value, not a duration or a date; both required, no default) and no
  further. null-resume is a separate, later OOC choice with its own confirmation to take up the remainder the world kept of an
  earlier null-advance, toward that earlier target only (it accepts no target). A committed status is a transaction status, not a
  report that the target was attained, that anything occurred, or what anyone perceives or knows; nothing resumes on its own.
pc-target-advance / pc-target-resume: for a campaign WITH an active character that is stationary (the NULL-PC commands refuse it, and
  these refuse a campaign without one). pc-target-advance is ONE explicit OOC choice to advance canonical time to the exact target
  given by --target-unit/--target-value (an exact canonical-time value, not a duration or a date; both required, no default) and no
  further; it is not an action the character takes, and a character in transfer or with a movement in flight is refused.
  pc-target-resume is a separate, later choice with its own confirmation to take up the remainder the world kept of an earlier
  pc-target-advance, toward that earlier target only (it accepts no target). A committed status is a transaction status, not a
  report that the target was attained, that anything occurred, or what the character or anyone perceives or knows; nothing
  resumes on its own.
establish-locality: creates (or faithfully resumes) ONE standard campaign package holding ONE curated ORIGINAL world, ONE locus of it
  and ONE authored EXACT_FINITE source condition at that locus, from a local setup file YOU author (a regular file you own that
  nobody else can write; see docs/original-locality-admission-foundation.md). Nothing is inferred, approximated or defaulted: the file
  states the premise, the locus, the exact quantity and the physical access facts, and the whole of it is shown back for ONE explicit
  typed confirmation before anything is written. The same confirmed setup converges after an interruption (pass --reclaim-stale-lock
  if the package lock was left behind); a different setup is refused for a campaign that already holds one. It is a physical
  setting only: it creates no character, actor or relationship, advances no time, and grants nobody perception, knowledge or
  permission to extract.
locality-status: reports what a campaign holds of an operator-confirmed locality and says READY only when all three facts are
  committed and the campaign verifies; a partially constructed campaign is INCOMPLETE.
author-character: for a campaign whose --world and --locus are ALREADY established (this command never creates, defaults or infers
  either). YOU author an ordinary continuing character in your own words on the console, review the complete Character Mirror, revise
  it as often as you like (every change shows the whole Mirror again) and keep the last display by typing its fresh keep phrase;
  only then is the character released (I-002). Placement is a SEPARATE, second choice: you state in your own words that the character
  is originally present at that locus (native, already there - no arrival, portal or transfer) and confirm it with its own fresh
  phrase; only then is the character bound as the operative player character (Role Registry). --player-character is the character's technical
  identity. A character released but not bound is reported as exactly that, and running the command again resumes at placement
  without repeating anything. Neither step gives the character a physical position or custody, perception, knowledge, action or time.
character-status: reports from canon alone whether a character of this command is held, released but unbound, or bound (verified).
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

const exitOf = (s: CommandStatus | LocalityStatus | CharacterStatus): number => {
  switch (s) {
    case "CHARACTER_BOUND":
    case "CHARACTER_NONE":
      return EXIT.OK;
    case "CHARACTER_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "LOCALITY_READY":
      return EXIT.OK;
    case "LOCALITY_OUTCOME_UNKNOWN":
      return EXIT.UNKNOWN;
    case "RELOCATION_COMMITTED":
    case "ADVANCE_COMMITTED":
    case "NULL_PC_ADVANCE_COMMITTED":
    case "NULL_PC_HELD_ADVANCE_COMMITTED":
    case "PC_TARGET_ADVANCE_COMMITTED":
    case "NOTHING_TO_RECONCILE":
      return EXIT.OK;
    case "DECLINED":
      return EXIT.DECLINED;
    case "RELOCATION_OUTCOME_UNKNOWN":
    case "ADVANCE_OUTCOME_UNKNOWN":
    case "NULL_PC_ADVANCE_OUTCOME_UNKNOWN":
    case "NULL_PC_HELD_ADVANCE_OUTCOME_UNKNOWN":
    case "PC_TARGET_ADVANCE_OUTCOME_UNKNOWN":
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
  "target-unit": { type: "string" },
  "target-value": { type: "string" },
  setup: { type: "string" },
  "player-character": { type: "string" },
} as const;

const COMMAND_OPTIONS: Record<string, readonly string[]> = {
  relocate: ["world", "locus", "delivery-unit", "delivery-value"],
  advance: [],
  "null-advance": ["target-unit", "target-value"],
  "null-resume": [],
  "pc-target-advance": ["target-unit", "target-value"],
  "pc-target-resume": [],
  reconcile: [],
  status: [],
  "establish-locality": ["setup"],
  "locality-status": [],
  "author-character": ["world", "locus", "player-character"],
  "character-status": [],
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
      command !== "locality-status" &&
      command !== "character-status" &&
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

  let nullAdvanceInput: unknown;
  if (command === "null-advance" || command === "pc-target-advance") {
    const value = str("target-value") ?? "";
    if (!NON_NEGATIVE_INTEGER.test(value) || !Number.isSafeInteger(Number(value))) {
      out(USAGE);
      return EXIT.USAGE;
    }
    nullAdvanceInput = { target: { unit: str("target-unit"), value: Number(value) } };
  }

  const terminal =
    env.terminal ??
    (command === "status" || command === "locality-status" || command === "character-status"
      ? undefined
      : stdioTerminal());
  try {
    if (command === "establish-locality") {
      const r = await establishLocality({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        setupFile: str("setup") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
    if (command === "author-character") {
      const r = await authorCharacter({
        campaignDir: str("campaign") ?? "",
        campaignId: str("campaign-id") ?? "",
        worldId: str("world") ?? "",
        locusId: str("locus") ?? "",
        pcId: str("player-character") ?? "",
        terminal: terminal!,
        ...(str("operator-dir") !== undefined ? { operatorDir: str("operator-dir")! } : {}),
        ...(values["reclaim-stale-lock"] === true ? { reclaimStaleLock: true } : {}),
        ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
        ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
      });
      out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
      out(r.message);
      for (const line of r.details) out(line);
      return exitOf(r.status);
    }
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
      if (command === "locality-status") {
        const r = localityStatus(session);
        out(`STATUS ${r.status}`);
        out(r.message);
        for (const line of r.details) out(line);
        return exitOf(r.status);
      }
      if (command === "character-status") {
        const r = characterStatus(session);
        out(`STATUS ${r.status}`);
        out(r.message);
        for (const line of r.details) out(line);
        return exitOf(r.status);
      }
      if (command === "status") {
        const report = status(session);
        const retained =
          report.relocation !== "NONE" ||
          report.advances.length > 0 ||
          report.ooc_choices.length > 0 ||
          report.pc_target_choices.length > 0;
        out(`STATUS ${retained ? "CHOICES_RETAINED" : "NO_CHOICE_RETAINED"}`);
        out(`campaign: ${report.campaign_id}`);
        out(`operator: ${report.operator}`);
        out(`relocation choice: ${report.relocation}`);
        out(
          `progression choices: ${report.advances.length === 0 ? "none" : report.advances.join(", ")}`,
        );
        out(
          `ooc choices: ${report.ooc_choices.length === 0 ? "none" : report.ooc_choices.map((c) => `${c.kind} ${c.status}`).join(", ")}`,
        );
        out(
          `character target choices: ${report.pc_target_choices.length === 0 ? "none" : report.pc_target_choices.map((c) => `${c.kind} ${c.status}`).join(", ")}`,
        );
        return EXIT.OK;
      }
      const ctx = { session, terminal: terminal! };
      const results: readonly CommandResult[] =
        command === "relocate"
          ? [await relocate(ctx, relocateInput)]
          : command === "advance"
            ? [await advance(ctx)]
            : command === "null-advance"
              ? [await nullAdvance(ctx, nullAdvanceInput)]
              : command === "null-resume"
                ? [await nullResume(ctx)]
                : command === "pc-target-advance"
                  ? [await pcTargetAdvance(ctx, nullAdvanceInput)]
                  : command === "pc-target-resume"
                    ? [await pcTargetResume(ctx)]
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
