import { chmodSync, cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CanonicalCampaign } from "@immortalis/engine";
import { PLAYER_CHOICE_AUTHORITY } from "@immortalis/contracts";
import {
  advanceConfirmedPcTransferToDelivery,
  bindTrustedConfirmedPcRelocationContext,
  bindTrustedConfirmedPcTransferAdvanceContext,
  commitConfirmedPcRelocation,
} from "@immortalis/protocol";
import {
  LocalOperatorSession,
  relocate,
  type CommandContext,
  type OperatorTerminal,
  type SessionParams,
} from "@immortalis/operator";
import { ACTOR_FIXTURE_EXTENSION, FIXTURE_CAMPAIGN } from "@immortalis/testkit";
import { DEST_LOCUS_ID, LOG_T_DELIVERY, PC, W, custodiedCampaign } from "./pc-movement.ts";
import { copyDir, tempDir } from "./tmp.ts";

/**
 * TEST SUPPORT for the local operator command-and-reopen mechanism. The campaign, PC, handover, custody and destination are the
 * REAL owners' (the existing harness commits them independently of the mechanism); the only fixture in the loop is the
 * owner registration the saved campaign was written with (the history source behind the actor is a testkit stand-in). Nothing
 * here supplies an owner result, a status or a confirmation: the scripted console only TYPES, in answer to the challenge the
 * service printed.
 */
export { DEST_LOCUS_ID, FIXTURE_CAMPAIGN, LOG_T_DELIVERY, W };

/** What the operator types to choose the one destination and declare its delivery boundary. */
export const RELOCATE_INPUT = {
  destination: { world_id: W, locus_id: DEST_LOCUS_ID },
  delivery_at: LOG_T_DELIVERY,
};

export type Reply =
  "confirm" | "decline" | "eof" | "stale" | ((challenge: string) => string | null);

export interface ScriptedTerminal extends OperatorTerminal {
  readonly said: string[];
  readonly asked: () => number;
}

const CHALLENGE = /To confirm, type exactly "([^"]+)"/;

/**
 * A console that types back only what the service asked for: `confirm` types the exact phrase just printed; `decline` types
 * something else; `eof` ends the input; `stale` types the previous prompt's phrase (it can never match the new challenge); a
 * function chooses its own line from the printed phrase.
 */
export function scriptedTerminal(...replies: Reply[]): ScriptedTerminal {
  const said: string[] = [];
  let used = 0;
  let previous: string | null = null;
  const challenge = () => {
    for (let i = said.length - 1; i >= 0; i--) {
      const m = CHALLENGE.exec(said[i]!);
      if (m) return m[1]!;
    }
    throw new Error("the service printed no challenge before asking");
  };
  return {
    said,
    asked: () => used,
    say: (text) => {
      said.push(text);
    },
    ask: async () => {
      const reply = replies[used++];
      if (reply === undefined) throw new Error("the service asked more than the test scripted");
      const phrase = challenge();
      const typed =
        reply === "confirm"
          ? phrase
          : reply === "decline"
            ? "no"
            : reply === "eof"
              ? null
              : reply === "stale"
                ? (previous ?? "relocate 000000000000")
                : reply(phrase);
      previous = phrase;
      return typed;
    },
    close: () => undefined,
  };
}

/** A seeded, CLOSED campaign directory (post-handover active PC, custody, one established destination), reusable as a template. */
export async function seedTemplate(): Promise<string> {
  const dir = tempDir("immortalis-operator-template-");
  const s = await custodiedCampaign(dir);
  await s.campaign.close();
  return dir;
}

/** A fresh private copy of a template, with its own owner-only retained-intent directory beside it. */
export function copyCampaign(template: string): { campaignDir: string; operatorDir: string } {
  const campaignDir = copyDir(template);
  const operatorDir = join(mkdtempSync(join(tmpdir(), "immortalis-operator-state-")), "intents");
  return { campaignDir, operatorDir };
}

export const sessionParams = (
  dirs: { campaignDir: string; operatorDir: string },
  over: Partial<SessionParams> = {},
): SessionParams => ({
  campaignDir: dirs.campaignDir,
  operatorDir: dirs.operatorDir,
  expectedCampaignId: FIXTURE_CAMPAIGN,
  extension: ACTOR_FIXTURE_EXTENSION,
  ...over,
});

export async function openSession(
  dirs: { campaignDir: string; operatorDir: string },
  over: Partial<SessionParams> = {},
): Promise<LocalOperatorSession> {
  const opened = await LocalOperatorSession.open(sessionParams(dirs, over));
  if (!opened.ok) throw new Error(`session did not open: ${JSON.stringify(opened.error)}`);
  return opened.value;
}

/** A deterministic identity source, so two runs of the same journey mint the same immutable identities. */
export const fixedIds = (...ids: string[]) => {
  let i = 0;
  return () => ids[i++] ?? `fixed-id-${i++}`;
};

export const ctxOf = (
  session: LocalOperatorSession,
  terminal: OperatorTerminal,
  newId?: () => string,
): CommandContext => ({ session, terminal, ...(newId ? { newId } : {}) });

/**
 * The same journey driven by the UNCHANGED gateways directly, with the material the service is documented to author, written out
 * here independently. Returns the final canonical state hash: the mechanism must add nothing to, and omit nothing from, canon.
 */
export async function reference(template: string, advanceUid: string): Promise<string> {
  const dirs = copyCampaign(template);
  const opened = await CanonicalCampaign.open(dirs.campaignDir, {
    buildId: "operator-reference",
    extension: ACTOR_FIXTURE_EXTENSION,
  });
  if (!opened.ok) throw new Error("reference campaign did not open");
  const campaign = opened.value;
  const material = {
    basis: "local-operator-confirmed-choice",
    secrecy: "local-operator-session",
  };
  const relocation = await commitConfirmedPcRelocation(
    bindTrustedConfirmedPcRelocationContext({
      campaign,
      choice: {
        pc_id: PC,
        destination: { world_id: W, locus_id: DEST_LOCUS_ID },
        authored_under: { ...PLAYER_CHOICE_AUTHORITY },
      },
      delivery_at: LOG_T_DELIVERY,
      publication: { cause: `operator-relocation-cause:${FIXTURE_CAMPAIGN}:${PC}`, ...material },
    }),
    { operation: "commit_confirmed_pc_relocation" },
  );
  const progressed = await advanceConfirmedPcTransferToDelivery(
    bindTrustedConfirmedPcTransferAdvanceContext({
      campaign,
      pc_id: PC,
      transaction: {
        transaction_id: `operator-advance:${advanceUid}`,
        cause: `operator-advance-cause:${advanceUid}`,
        trigger: {
          kind: "operator-progression-choice",
          ref: `operator-confirmation:${advanceUid}`,
        },
        context: { ...PLAYER_CHOICE_AUTHORITY },
        publication: material,
      },
    }),
    { operation: "advance_confirmed_pc_transfer_to_delivery" },
  );
  if (!relocation.ok || !progressed.ok) throw new Error("the reference journey did not commit");
  const hash = campaign.store.head().state_sha256;
  await campaign.close();
  return hash;
}

// -- the real process ----------------------------------------------------------------------------------------------------------

import { spawn, type ChildProcess } from "node:child_process";
import { DEST_LOCUS_ID as DEST, LOG_T_DELIVERY as DELIVERY } from "./pc-movement.ts";

const ENTRY = "tests/support/operator-process-entry.ts";

export interface ProcessRun {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

export const cliArgs = {
  relocate: (dirs: { campaignDir: string; operatorDir: string }, over: string[] = []): string[] => [
    "relocate",
    "--campaign",
    dirs.campaignDir,
    "--campaign-id",
    FIXTURE_CAMPAIGN,
    "--operator-dir",
    dirs.operatorDir,
    "--world",
    W,
    "--locus",
    DEST,
    "--delivery-unit",
    DELIVERY.unit,
    "--delivery-value",
    String(DELIVERY.value),
    ...over,
  ],
  command: (
    name: "advance" | "reconcile" | "status",
    dirs: { campaignDir: string; operatorDir: string },
    over: string[] = [],
  ): string[] => [
    name,
    "--campaign",
    dirs.campaignDir,
    "--campaign-id",
    FIXTURE_CAMPAIGN,
    "--operator-dir",
    dirs.operatorDir,
    ...over,
  ],
};

export type Typed = "confirm" | "decline" | "eof" | { raw: string };

/**
 * Starts the real command line and types at its console: after each challenge the process prints, the next scripted entry is
 * typed (`confirm` types the phrase it just printed). `preTyped` is written the instant the process starts, before any
 * challenge exists. `until` stops the run at that output and kills the process (a crash while the campaign is open).
 */
export function runOperator(
  args: string[],
  typed: Typed[] = [],
  o: { preTyped?: string; killAfter?: RegExp } = {},
): Promise<ProcessRun> {
  const child: ChildProcess = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "--experimental-strip-types", ENTRY, ...args],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  let answered = 0;
  let scanned = 0;
  let killed = false;
  if (o.preTyped !== undefined) child.stdin!.write(o.preTyped);
  child.stderr!.on("data", (d: Buffer) => (stderr += d.toString()));
  child.stdout!.on("data", (d: Buffer) => {
    stdout += d.toString();
    if (o.killAfter && !killed && o.killAfter.test(stdout)) {
      killed = true;
      child.kill("SIGKILL");
      return;
    }
    const pattern = /To confirm, type exactly "([^"]+)"[^\n]*\n> /g;
    pattern.lastIndex = scanned;
    for (let m = pattern.exec(stdout); m; m = pattern.exec(stdout)) {
      scanned = pattern.lastIndex;
      const next = typed[answered++];
      if (next === undefined) child.stdin!.end();
      else if (next === "eof") child.stdin!.end();
      else if (next === "confirm") child.stdin!.write(`${m[1]}\n`);
      else if (next === "decline") child.stdin!.write("no\n");
      else child.stdin!.write(`${next.raw}\n`);
    }
  });
  return new Promise((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
    // a command that never prompts must not wait on an open stdin
    if (typed.length === 0 && o.preTyped === undefined && o.killAfter === undefined)
      child.stdin!.end();
  });
}

// -- retained-state copies and prepared journeys -------------------------------------------------------------------------------

/** A private copy of BOTH the saved campaign and its retained intents. */
export function copyState(dirs: { campaignDir: string; operatorDir: string }) {
  const stateRoot = mkdtempSync(join(tmpdir(), "immortalis-operator-state-"));
  const operatorDir = join(stateRoot, "intents");
  cpSync(dirs.operatorDir, operatorDir, { recursive: true });
  chmodSync(operatorDir, 0o700);
  return { campaignDir: copyDir(dirs.campaignDir), operatorDir };
}

/** A seeded campaign in which the operator has ALREADY made (and had committed) the relocation choice; closed. */
export async function relocatedTemplate(template: string): Promise<{
  campaignDir: string;
  operatorDir: string;
}> {
  const dirs = copyCampaign(template);
  const s = await openSession(dirs);
  const out = await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT);
  if (out.status !== "RELOCATION_COMMITTED")
    throw new Error("the prepared relocation did not commit");
  await s.close();
  return dirs;
}
