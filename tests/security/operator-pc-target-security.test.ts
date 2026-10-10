// Security and trust-boundary evidence for the operator's ACTIVE-PC target commands. Static checks over the package's own source
// plus bounded behavioural checks over real journeys. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED); no remote
// authentication, observer disclosure or narration is implemented or claimed.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { pcTargetAdvance, pcTargetResume } from "@immortalis/operator";
import { code } from "../support/f027.ts";
import { SUNSET_LATER, SUNSET_MID, at } from "../support/gip-sunset.ts";
import {
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  scriptedTerminal,
} from "../support/operator.ts";
import { gipSunsetPcTemplate, readLedger } from "../support/operator-pc-target.ts";
import { refuseGipStageOf } from "../support/pc-target-advance.ts";
import { PC } from "../support/pc-movement.ts";

const SRC = "packages/operator/src";
const files = readdirSync(SRC).map((f) => `${SRC}/${f}`);
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");

let gipTemplate: string;
beforeAll(async () => {
  gipTemplate = await gipSunsetPcTemplate(SUNSET_MID);
}, 180_000);

describe("the active-PC target commands cannot author a world fact, a time, an authority or a character", () => {
  it("the commands take exactly the target (advance) or nothing (resume): no PC, world, condition, duration, identity or hold can be stated", () => {
    const cmd = code(`${SRC}/commands.ts`);
    expect(cmd).toMatch(
      /export async function pcTargetResume\(ctx: CommandContext\): Promise<CommandResult>/,
    );
    expect(cmd).toMatch(
      /export async function pcTargetAdvance\(ctx: CommandContext, input: unknown\): Promise<CommandResult>/,
    );
    const cli = identifiers(`${SRC}/cli.ts`);
    expect(cli).not.toMatch(/\bheld\b|from_transaction|continues|\bpc_id\b|authored_under/);
    expect(readFileSync(`${SRC}/cli.ts`, "utf8")).not.toMatch(
      /--duration|--days|--date|--until|--for\b|--wait|--pc\b|--character/,
    );
  });

  it("the character is read from canon, never from input; the operator's target is the exact value, never defaulted, offset, parsed from a date or inferred", () => {
    const cmd = identifiers(`${SRC}/commands.ts`);
    const start = cmd.indexOf("export async function pcTargetAdvance(");
    const end = cmd.indexOf("// -- reconciliation");
    expect(start).toBeGreaterThan(-1);
    const section = cmd.slice(start, end);
    expect(section).toMatch(/const pcId = guarded;/);
    expect(section).not.toMatch(
      /target(\.value)?\s*[-+*/]\s*[\w(]|\btarget\s*=\s*\{|defaultTarget|\bDate\b|toISOString|parseDate|Math\.(floor|ceil|round)/,
    );
    // the stationary judgement is the gateway's: this section reads a place for the console only, and writes nothing
    expect(section).not.toMatch(/\.commit\(|\.advance\(|new TemporalCoordinator|continueRemainder/);
  });

  it("reaches the Temporal kernel only through the one gateway, over an empty registry for reads: it never advances", () => {
    const src = files.map((f) => identifiers(f)).join("\n");
    expect(src).not.toMatch(/\.advance\(|\.continueRemainder\(/);
    expect(src.match(/advanceActivePcToTarget\(/g)).toHaveLength(1);
  });
});

describe("what the operator and the console may see", () => {
  async function journey() {
    const dirs = copyCampaign(gipTemplate);
    const s = await openSession(dirs);
    const restore = refuseGipStageOf(s);
    const t1 = scriptedTerminal("confirm");
    const a = await pcTargetAdvance(ctxOf(s, t1, fixedIds("sec-1")), { target: SUNSET_LATER });
    restore();
    const t2 = scriptedTerminal("confirm");
    const b = await pcTargetResume(ctxOf(s, t2, fixedIds("sec-2")));
    await s.close();
    return { dirs, shown: [...t1.said, ...t2.said, a.message, b.message].join("\n"), a, b };
  }

  it("shows no fact key, revision, hash, identity, stop reason, remainder, owner or GIP result on either choice", async () => {
    const { shown, a, b } = await journey();
    expect(a.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(b.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(shown).not.toMatch(
      /sha256|state_sha|revision|journal|group_id|intent_id|operator-pc-target|operator-intent|operator-confirmation|pc\/|gip\/|temporal\/|DEPENDENCY_UNRESOLVED|STOP_AFTER|TARGET_REACHED|continuation|unresolved|\bstage|provider|expired|lifecycle|sunset|\binstrument\b/i,
    );
    // the receipt of a committed transaction is the same text whether the work finished or stayed open
    expect(a.message).toBe(b.message);
    expect(a.message).toMatch(/transaction status only/);
  }, 180_000);

  it("keeps the retained intents owner-only and outside the package, holding no secret, world fact, outcome or hold detail", async () => {
    const { dirs } = await journey();
    expect(statSync(dirs.operatorDir).mode & 0o077).toBe(0);
    expect(readdirSync(dirs.campaignDir)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/intents/)]),
    );
    const [file] = readdirSync(dirs.operatorDir);
    const text = readFileSync(join(dirs.operatorDir, file!), "utf8");
    expect(text).not.toMatch(
      /sha256|state_sha|token|password|secret|credential|stop_reason|unresolved|DEPENDENCY|expired|lifecycle|gip/i,
    );
    const parsed = readLedger(dirs) as { intents: { kind: string; status: string }[] };
    expect(parsed.intents.map((i) => [i.kind, i.status])).toEqual([
      ["PC_TARGET_ADVANCE", "COMMITTED"],
      ["PC_TARGET_RESUME", "COMMITTED"],
    ]);
    expect(readLedger(dirs).format_version).toBe(1);
  }, 180_000);

  it("a retained resume carries only the lineage the operator confirmed: the same character, no hold detail, the same target as the choice it continues", async () => {
    const { dirs } = await journey();
    const [first, second] = readLedger(dirs).intents;
    expect(Object.keys(first).sort()).toEqual([
      "intent_id",
      "kind",
      "pc_id",
      "seq",
      "status",
      "target",
      "transaction",
    ]);
    expect(Object.keys(second).sort()).toEqual([
      "held",
      "intent_id",
      "kind",
      "pc_id",
      "seq",
      "status",
      "transaction",
    ]);
    expect(first.pc_id).toBe(PC);
    expect(second.pc_id).toBe(PC);
    expect(second.held).toEqual({
      from_transaction: first.transaction.transaction_id,
      target: first.target,
    });
    expect(second.transaction.transaction_id).not.toBe(first.transaction.transaction_id);
    expect(second.transaction.trigger.ref).not.toBe(first.transaction.trigger.ref);
    expect(first.transaction.context).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });
  }, 180_000);

  it("a GIP sunset journey reports the same minimum status whether or not anything fell due", async () => {
    const reports: string[] = [];
    for (const target of [at(120), SUNSET_MID, SUNSET_LATER]) {
      const s = await openSession(copyCampaign(gipTemplate));
      const out = await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds("same")), {
        target,
      });
      reports.push(`${out.status}|${out.message}`);
      await s.close();
    }
    expect(new Set(reports).size).toBe(1);
  }, 180_000);
});
