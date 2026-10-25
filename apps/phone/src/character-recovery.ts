import {
  chmodSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { canonicalJson } from "@immortalis/contracts";
import {
  authorCharacter,
  compileContract,
  missingOf,
  readConfig,
  type CharacterDraft,
  type CharacterStatus,
  type CliEnvironment,
} from "@immortalis/operator";
import { parseDraft, type CharacterIdentity } from "./character-evidence.ts";
import { checkScenarioFile } from "./scenario.ts";
import type { PhoneConfig } from "./config.ts";

/**
 * The chat adapter's retained, NONCANONICAL record of the player's own character words (BLUE v5.2-A1). It holds the exact draft the
 * player offered, in its latest revision, and - once the character is released - the exact native-presence statement the player offered
 * and has not yet confirmed. It is bookkeeping in the operator directory, never an owner fact and never model-readable: it is NOT consent
 * (the human's keep and placement confirmations are typed only at the trusted terminal), it is campaign-bound, and committed facts are
 * always re-judged against canon. A record that cannot be read keeps the character lane closed; it is never repaired or adopted.
 */
export const CHARACTER_RECORD_FORMAT = "immortalis-chat-character-words";

/** the most revisions one character's draft may go through (the shipped console's own bound) */
export const MAX_REVISIONS = 50;

export interface CharacterRecord {
  readonly format: typeof CHARACTER_RECORD_FORMAT;
  readonly format_version: 1;
  readonly campaign_id: string;
  readonly pc_id: string;
  readonly world_id: string;
  readonly locus_id: string;
  /** the latest draft the player offered (null when the character was released by another path and only a placement is retained) */
  readonly draft: CharacterDraft | null;
  readonly revision: number;
  readonly draft_sha256: string | null;
  /** the player's own presence statement, offered but not yet confirmed (a fresh confirmation is always required) */
  readonly placement: { readonly statement: string } | null;
}

export const characterRecordPath = (config: PhoneConfig): string =>
  join(config.operatorDir, `chat-character.${config.campaignId}.json`);

export const draftSha = (d: CharacterDraft): string =>
  createHash("sha256").update(canonicalJson(d), "utf8").digest("hex");

export type CharacterRecordRead =
  | { readonly kind: "NONE" }
  | { readonly kind: "UNREADABLE" }
  | { readonly kind: "RECORD"; readonly record: CharacterRecord };

const ENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

export function readCharacterRecord(config: PhoneConfig): CharacterRecordRead {
  let text: string;
  try {
    text = readFileSync(characterRecordPath(config), "utf8");
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "NONE" }
      : { kind: "UNREADABLE" };
  }
  try {
    const v: unknown = JSON.parse(text);
    if (
      !record(v) ||
      v["format"] !== CHARACTER_RECORD_FORMAT ||
      v["format_version"] !== 1 ||
      v["campaign_id"] !== config.campaignId ||
      typeof v["revision"] !== "number" ||
      !Number.isSafeInteger(v["revision"]) ||
      v["revision"] < 1 ||
      v["revision"] > MAX_REVISIONS
    )
      return { kind: "UNREADABLE" };
    for (const k of ["pc_id", "world_id", "locus_id"])
      if (typeof v[k] !== "string" || !ENTITY.test(v[k])) return { kind: "UNREADABLE" };
    const draft = v["draft"] === null ? null : parseDraft(v["draft"]);
    if (v["draft"] !== null && draft === null) return { kind: "UNREADABLE" };
    if (v["draft_sha256"] !== (draft === null ? null : draftSha(draft)))
      return { kind: "UNREADABLE" };
    const p = v["placement"];
    if (p !== null) {
      if (!record(p) || Object.keys(p).length !== 1 || typeof p["statement"] !== "string")
        return { kind: "UNREADABLE" };
    }
    const placement =
      p === null ? null : { statement: String((p as { statement: string }).statement) };
    return {
      kind: "RECORD",
      record: {
        format: CHARACTER_RECORD_FORMAT,
        format_version: 1,
        campaign_id: config.campaignId,
        pc_id: String(v["pc_id"]),
        world_id: String(v["world_id"]),
        locus_id: String(v["locus_id"]),
        draft,
        revision: v["revision"],
        draft_sha256: draft === null ? null : draftSha(draft),
        placement,
      },
    };
  } catch {
    return { kind: "UNREADABLE" };
  }
}

/** Atomic replace (write a sibling, fsync, rename): a reader sees the old record or the new one, never a torn one. false = not recorded. */
export function writeCharacterRecord(config: PhoneConfig, r: CharacterRecord): boolean {
  const target = characterRecordPath(config);
  const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    mkdirSync(config.operatorDir, { recursive: true, mode: 0o700 });
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeSync(fd, `${JSON.stringify(r)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(temp, 0o600);
    renameSync(temp, target);
    return true;
  } catch {
    try {
      rmSync(temp, { force: true });
    } catch {
      // nothing more to do: the record was not maintained
    }
    return false;
  }
}

export function clearCharacterRecord(config: PhoneConfig): boolean {
  try {
    rmSync(characterRecordPath(config), { force: true });
    return true;
  } catch {
    return false;
  }
}

// -- the service-owned technical identity -----------------------------------------------------------------------------------------

/**
 * The character's technical identity. The player authors who the character IS; the identity it is filed under is the service's: the
 * operator's scenario names it when a valid scenario file is configured (so a later play uses the same character), otherwise it is
 * derived from the campaign identity alone. It is never a tool argument and never the player's.
 */
export function chosenCharacterId(config: PhoneConfig): string {
  const scenario = checkScenarioFile(config.scenarioFile);
  if (scenario.ok) return scenario.scenario.player_character;
  return `pc-${createHash("sha256")
    .update(`immortalis-chat-player-character:${config.campaignId}`, "utf8")
    .digest("hex")
    .slice(0, 16)}`;
}

// -- the referee readiness the character's two readings need -----------------------------------------------------------------------

export type Readiness = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Whether a trusted host binding holds the grants the character's journey needs, checked BEFORE the player is asked anything
 * (`I002_CLASSIFY` for the review; `IR_NATIVE_COMPATIBILITY` for the placement). It reads the operator-written binding only and
 * discloses no host identity, grant list or path.
 */
export async function refereeReadiness(
  config: PhoneConfig,
  needs: readonly ("I002_CLASSIFY" | "IR_NATIVE_COMPATIBILITY")[],
): Promise<Readiness> {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined) return { ok: false, reason: "no local operator can be verified here" };
  const bound = await readConfig(
    { stateDir: config.operatorDir, campaignId: config.campaignId },
    uid,
  );
  if (!bound.ok)
    return { ok: false, reason: "no AI referee host is bound to this campaign for the character" };
  for (const need of needs)
    if (!bound.value.hosts.some((h) => h.operations.includes(need)))
      return {
        ok: false,
        reason:
          need === "I002_CLASSIFY"
            ? "no AI referee host is bound to read the character's own words"
            : "no AI referee host is bound to read where the character is originally present",
      };
  return { ok: true };
}

// -- one dispatched operation ------------------------------------------------------------------------------------------------------

export interface CharacterRunOptions {
  /** the shipped authoring command (tests wrap it to inject faults; the default is the real one) */
  readonly author?: typeof authorCharacter;
  readonly refereePolls?: number;
  readonly refereePollMs?: number;
}

const OK_STATUSES: ReadonlySet<CharacterStatus> = new Set(["CHARACTER_BOUND", "CHARACTER_NONE"]);

/**
 * Runs ONE staged operation of the shipped `author-character` over the player lane's terminal, and reports it the way the command line
 * does (a `STATUS` line, the fixed sentence, then its bounded details). The player's words come from the retained identity and the
 * record; every confirmation is typed by the human at the trusted terminal. Returns the shipped exit codes' classes.
 */
export async function runCharacterOperation(
  config: PhoneConfig,
  identity: CharacterIdentity,
  words: { readonly draft?: CharacterDraft; readonly presence?: string },
  env: CliEnvironment,
  options: CharacterRunOptions = {},
): Promise<number> {
  const out = env.out ?? (() => undefined);
  const run = options.author ?? authorCharacter;
  const r = await run({
    campaignDir: config.campaignDir,
    campaignId: config.campaignId,
    worldId: identity.world_id,
    locusId: identity.locus_id,
    pcId: identity.pc_id,
    terminal: env.terminal!,
    operatorDir: config.operatorDir,
    ...(env.campaignFs ? { campaignFs: env.campaignFs } : {}),
    ...(env.ledgerFs ? { ledgerFs: env.ledgerFs } : {}),
    ...(options.refereePolls !== undefined ? { refereePolls: options.refereePolls } : {}),
    ...(options.refereePollMs !== undefined ? { refereePollMs: options.refereePollMs } : {}),
    chat:
      identity.stage === "KEEP"
        ? { stage: "KEEP", ...(words.draft ? { draft: words.draft } : {}) }
        : { stage: "PLACE", presence: words.presence ?? "" },
  });
  out(`STATUS ${r.status}${r.code ? ` ${r.code}` : ""}`);
  out(r.message);
  for (const line of r.details) out(line);
  if (OK_STATUSES.has(r.status)) return 0;
  if (r.status === "CHARACTER_OUTCOME_UNKNOWN") return 4;
  if (r.status === "DECLINED") return 2;
  return 3;
}

/** The character the draft compiles to, or null while it still lacks something the player must state. */
export const contractOfDraft = (pcId: string, d: CharacterDraft) =>
  missingOf(d).length > 0 ? null : compileContract(pcId, d);
