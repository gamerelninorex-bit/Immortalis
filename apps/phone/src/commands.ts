import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PhoneConfig } from "./config.ts";

/**
 * The player lane's CLOSED command set. A request names one of these commands and values for ITS options only; the argument vector is
 * built here from the configured campaign, never from the request, so the request cannot name a campaign, a directory, a role, a
 * permission, an identity of another lane, an "already confirmed" flag or any option that is not listed. There is no shell, no
 * free-text command and no file path from the phone: a pasted setting is written to a fresh owner-only file the server names.
 */
type Kind = "id" | "int" | "unit";
interface Spec {
  /** option → kind of value */
  readonly options: Readonly<Record<string, Kind>>;
  readonly optional?: readonly string[];
  /** the command reads one pasted setting document (`--setup <file>` is set by the server) */
  readonly setup?: true;
}

const ID = /^[A-Za-z0-9._:-]{1,128}$/;
const INT = /^(0|[1-9][0-9]{0,8})$/;
const UNIT = /^[A-Za-z0-9._ :-]{1,64}$/;
const VALUE: Record<Kind, RegExp> = { id: ID, int: INT, unit: UNIT };

export const PLAYER_COMMANDS: Readonly<Record<string, Spec>> = {
  status: { options: {} },
  "locality-status": { options: {} },
  "character-status": { options: {} },
  "establish-locality": { options: {}, setup: true },
  "referee-bind-host": { options: { "host-id": "id" } },
  "referee-bind-collection-host": { options: { "host-id": "id" } },
  "author-character": {
    options: { world: "id", locus: "id", "player-character": "id", "referee-wait": "int" },
    optional: ["referee-wait"],
  },
  "establish-character-locus": {
    options: { "player-character": "id", "referee-wait": "int" },
    optional: ["referee-wait"],
  },
  "initialize-time": { options: {}, setup: true },
  // R-5: the player's own words for the one unresolved handling cycle (typed at the console prompt, never in this request)
  "clarify-collection-cycle": {
    options: { "player-character": "id", "referee-wait": "int" },
    optional: ["referee-wait"],
  },
  "prepare-collection": { options: {}, setup: true },
  "declare-closed-setting": { options: {}, setup: true },
  "attest-cycle": {
    options: { mechanism: "id", "referee-wait": "int" },
    optional: ["referee-wait"],
  },
  collect: {
    options: {
      world: "id",
      source: "id",
      reserve: "id",
      amount: "int",
      "quantity-unit": "unit",
      mechanism: "id",
      basis: "id",
    },
  },
  "collect-continue": { options: { "referee-wait": "int" }, optional: ["referee-wait"] },
  "collect-finish": { options: {} },
  cease: { options: {} },
  "settle-collection-lapse": { options: {} },
  "observe-surroundings": {
    options: { "player-character": "id", "referee-wait": "int" },
    optional: ["referee-wait"],
  },
  reconcile: { options: {} },
};

export const MAX_SETUP_BYTES = 64 * 1024;
const MAX_REFEREE_WAIT = 3600;

export interface BuiltCommand {
  readonly argv: readonly string[];
  /** removes the pasted setting file (idempotent) */
  readonly cleanup: () => void;
}

export type BuildResult =
  | { readonly ok: true; readonly value: BuiltCommand }
  | { readonly ok: false; readonly reason: string };

export interface CommandRequest {
  readonly command: unknown;
  readonly options?: unknown;
  readonly setup?: unknown;
}

/** Validates a phone request against the closed set and builds the argument vector the shipped CLI parses (it re-validates strictly). */
export function buildPlayerCommand(config: PhoneConfig, request: CommandRequest): BuildResult {
  const name = typeof request.command === "string" ? request.command : "";
  const spec = Object.hasOwn(PLAYER_COMMANDS, name) ? PLAYER_COMMANDS[name] : undefined;
  if (!spec) return { ok: false, reason: "that is not a command this front end offers" };
  const given =
    request.options && typeof request.options === "object" && !Array.isArray(request.options)
      ? (request.options as Record<string, unknown>)
      : {};
  for (const key of Object.keys(given))
    if (!Object.hasOwn(spec.options, key))
      return { ok: false, reason: `option ${key} is not accepted` };
  const argv: string[] = [
    name,
    "--campaign",
    config.campaignDir,
    "--campaign-id",
    config.campaignId,
    "--operator-dir",
    config.operatorDir,
  ];
  for (const [option, kind] of Object.entries(spec.options)) {
    const raw = given[option];
    if (raw === undefined || raw === "") {
      if (spec.optional?.includes(option)) continue;
      return { ok: false, reason: `option ${option} is required` };
    }
    if (typeof raw !== "string" || !VALUE[kind].test(raw))
      return { ok: false, reason: `option ${option} is not valid` };
    if (option === "referee-wait" && Number(raw) > MAX_REFEREE_WAIT)
      return { ok: false, reason: "referee-wait is too long" };
    argv.push(`--${option}`, raw);
  }
  if (!spec.setup) {
    if (request.setup !== undefined)
      return { ok: false, reason: "that command reads no setting document" };
    return { ok: true, value: { argv, cleanup: () => undefined } };
  }
  const text = request.setup;
  if (
    typeof text !== "string" ||
    text.trim() === "" ||
    Buffer.byteLength(text, "utf8") > MAX_SETUP_BYTES
  )
    return { ok: false, reason: "paste the setting document (JSON, at most 64 KB)" };
  try {
    JSON.parse(text);
  } catch {
    return { ok: false, reason: "the pasted setting is not valid JSON" };
  }
  mkdirSync(config.setupDir, { recursive: true, mode: 0o700 });
  chmodSync(config.setupDir, 0o700);
  const file = join(config.setupDir, `${randomBytes(16).toString("hex")}.json`);
  writeFileSync(file, text, { mode: 0o600, flag: "wx" });
  chmodSync(file, 0o600);
  return {
    ok: true,
    value: {
      argv: [...argv, "--setup", file],
      cleanup: () => rmSync(file, { force: true }),
    },
  };
}
