// Security and trust-boundary evidence for the operator's NULL-PC OOC commands. Static checks over the package's own source plus
// bounded behavioural checks over real journeys. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED); no remote
// authentication, observer disclosure or narration is implemented or claimed.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { nullAdvance, nullResume } from "@immortalis/operator";
import { REQ_1 } from "@immortalis/testkit";
import { code } from "../support/f027.ts";
import { SUNSET_AT } from "../support/gip-sunset.ts";
import { refuseNullPcDeliveryStage } from "../support/null-pc-advance.ts";
import { copyCampaign, ctxOf, fixedIds, scriptedTerminal } from "../support/operator.ts";
import {
  LOGISTICS_EXTENSION,
  PROD_T1,
  gipSunsetNullTemplate,
  logisticsNullTemplate,
  openNull,
  readLedger,
} from "../support/operator-null-pc.ts";

const SRC = "packages/operator/src";
const files = readdirSync(SRC).map((f) => `${SRC}/${f}`);
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");

let gipTemplate: string;
let logTemplate: string;
beforeAll(async () => {
  gipTemplate = await gipSunsetNullTemplate();
  logTemplate = await logisticsNullTemplate();
}, 180_000);

describe("the NULL-PC commands cannot author a world fact, a time, or an authority", () => {
  it("the operator names no GIP term, lifecycle, expiry, Temporal resolution, stage or process anywhere in its source", () => {
    // `time-initialization.ts` alone may name `establishCanonicalTime` (the author's starting chronology, once); it is bound by its own,
    // narrower check (tests/conformance/time-initialization-conformance.test.ts) and names none of the other terms
    // `initial-timed-governance.ts` is the one module the initial-timed-governance brief authorizes to name the GIP owner operations
    // (and the sunset term they register); it is not a NULL-PC command, and it is bound by its own, narrower checks
    // (tests/security/initial-timed-governance-security.test.ts), which forbid it any live clock, advance, expiry or lifecycle write.
    // `initial-local-demand.ts` is likewise not a NULL-PC command: it writes the RC-06 claim's `lifecycle` literal into the value it derives
    // independently to verify the Production owner's claim, and is bound by its own checks
    // (tests/security/initial-local-demand-security.test.ts), which forbid it any clock, advance, registration or stage surface.
    for (const f of files.filter(
      (x) => !x.endsWith("/initial-timed-governance.ts") && !x.endsWith("/initial-local-demand.ts"),
    ))
      expect(identifiers(f), f).not.toMatch(
        f.endsWith("/time-initialization.ts")
          ? /\bgip|expired|lifecycle|sunset|\bInstrument\b|resolveStage|StageKey|boundary_index|temporalBoundary|registerObject/i
          : /\bgip|expired|lifecycle|sunset|\bInstrument\b|resolveStage|StageKey|boundary_index|temporalBoundary|registerObject|establishCanonicalTime/i,
      );
  });

  it("reaches the Temporal kernel only through the two NULL-PC gateways: it reads state, never advances", () => {
    const src = files.map((f) => identifiers(f)).join("\n");
    expect(src).not.toMatch(/\.advance\(|\.continueRemainder\(|(?<!Promise)\.resolve\(/);
    const cmd = identifiers(`${SRC}/commands.ts`);
    expect(cmd.match(/new TemporalCoordinator\(/g)).toHaveLength(2);
    expect(cmd.match(/new TemporalCoordinator\([^;]*?\)\s*\.(?:state|object)\(/gs)).toHaveLength(2);
    // every coordinator it builds is over an EMPTY provider registry: it can read, never resolve a stage
    expect(cmd.match(/new StageProviderRegistry\(\)/g)).toHaveLength(2);
  });

  it("the target is the operator's exact value: never defaulted, derived, offset, parsed from a date or inferred", () => {
    for (const f of files) {
      const src = identifiers(f);
      expect(src, f).not.toMatch(
        /target(\.value)?\s*[-+*/]\s*[\w(]|\btarget\s*=\s*\{|defaultTarget|DEFAULT_TARGET|\bDate\b|toISOString|parseDate|Math\.(floor|ceil|round)/,
      );
    }
    const cli = readFileSync(`${SRC}/cli.ts`, "utf8");
    expect(cli).toMatch(/\^\(0\|\[1-9\]\[0-9\]\*\)\$/);
    expect(cli).not.toMatch(/--duration|--days|--date|--until|--for\b|--wait/);
  });

  it("the resume takes no operator input at all: no target, lineage, transaction or hold can be stated", () => {
    const cmd = code(`${SRC}/commands.ts`);
    expect(cmd).toMatch(
      /export async function nullResume\(ctx: CommandContext\): Promise<CommandResult>/,
    );
    const cli = identifiers(`${SRC}/cli.ts`);
    expect(cli).not.toMatch(/\bheld\b|from_transaction|continues/);
  });

  it("states the player's authority only through the contracts' constant; the request fields are read for comparison only, never built", () => {
    for (const f of files)
      expect(code(f), f).not.toMatch(/role\.player|permission\.player_choice|role\.archivist/);
    const cmd = identifiers(`${SRC}/commands.ts`);
    // the only place the operator names the kernel's request fields or stop reason is the read-only comparison of a retained
    // choice with canon's sealed record; it builds no request, passes none to a gateway and never writes
    const start = cmd.indexOf("function canonStanding(");
    const end = cmd.indexOf("function nullPcGuard(");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const outside = cmd.slice(0, start) + cmd.slice(end);
    expect(outside).not.toMatch(/continues|requested\s*:|condition\s*:|stop_reason|\.engaged/);
    const inside = cmd.slice(start, end);
    expect(inside).not.toMatch(
      /\.commit\(|\.advance\(|bindTrusted|advanceNullPc|resumeNullPc|new TemporalCoordinator|getFact\([^)]*\)\s*=/,
    );
    expect(inside.match(/getFact\(/g)).toHaveLength(3);
  });
});

describe("what the operator and the console may see", () => {
  it("shows no fact key, revision, hash, identity, stop reason, remainder or world result on either journey", async () => {
    const dirs = copyCampaign(logTemplate);
    const s = await openNull(dirs, LOGISTICS_EXTENSION);
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    const t1 = scriptedTerminal("confirm");
    const a = await nullAdvance(ctxOf(s, t1, fixedIds("sec-1")), { target: PROD_T1 });
    restore();
    const t2 = scriptedTerminal("confirm");
    const b = await nullResume(ctxOf(s, t2, fixedIds("sec-2")));
    const shown = [...t1.said, ...t2.said, a.message, b.message].join("\n");
    expect(shown).not.toMatch(
      /sha256|state_sha|revision|journal|group_id|intent_id|operator-null|operator-intent|operator-confirmation|pc\/|logistics\/|temporal\/|obj-logistics|DEPENDENCY_UNRESOLVED|STOP_AFTER|TARGET_REACHED|continuation|unresolved|\bstage|provider/i,
    );
    // the receipt of a committed transaction is the same text whether the work finished or stayed open
    expect(a.message).toMatch(/transaction status only/);
    expect(b.message).toMatch(/transaction status only/);
    await s.close();
  }, 120_000);

  it("keeps the retained intents owner-only and outside the package, holding no secret, world fact, outcome or hold detail", async () => {
    const dirs = copyCampaign(logTemplate);
    const s = await openNull(dirs, LOGISTICS_EXTENSION);
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds("sec-1")), {
      target: PROD_T1,
    });
    restore();
    await nullResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds("sec-2")));
    await s.close();
    expect(statSync(dirs.operatorDir).mode & 0o077).toBe(0);
    expect(readdirSync(dirs.campaignDir)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/intents/)]),
    );
    const [file] = readdirSync(dirs.operatorDir);
    const text = readFileSync(join(dirs.operatorDir, file!), "utf8");
    expect(text).not.toMatch(
      /sha256|state_sha|token|password|secret|credential|stop_reason|unresolved|DEPENDENCY/i,
    );
    const parsed = readLedger(dirs) as { intents: { kind: string; status: string }[] };
    expect(parsed.intents.map((i) => [i.kind, i.status])).toEqual([
      ["NULL_ADVANCE", "COMMITTED"],
      ["NULL_RESUME", "COMMITTED"],
    ]);
    expect(readLedger(dirs).format_version).toBe(1);
  }, 120_000);

  it("a retained resume carries only the lineage the operator confirmed: no PC, no hold detail, the same target as the choice it continues", async () => {
    const dirs = copyCampaign(logTemplate);
    const s = await openNull(dirs, LOGISTICS_EXTENSION);
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds("sec-1")), {
      target: PROD_T1,
    });
    restore();
    await nullResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds("sec-2")));
    await s.close();
    const [first, second] = readLedger(dirs).intents;
    expect(Object.keys(first).sort()).toEqual([
      "intent_id",
      "kind",
      "seq",
      "status",
      "target",
      "transaction",
    ]);
    expect(Object.keys(second).sort()).toEqual([
      "held",
      "intent_id",
      "kind",
      "seq",
      "status",
      "transaction",
    ]);
    expect(second.held).toEqual({
      from_transaction: first.transaction.transaction_id,
      target: first.target,
    });
    expect(second.transaction.transaction_id).not.toBe(first.transaction.transaction_id);
    expect(second.transaction.trigger.ref).not.toBe(first.transaction.trigger.ref);
  }, 120_000);

  it("a GIP sunset journey reports the same minimum status whether or not anything fell due", async () => {
    const reports: string[] = [];
    for (const target of [{ unit: SUNSET_AT.unit, value: 150 }, SUNSET_AT]) {
      const s = await openNull(copyCampaign(gipTemplate));
      const out = await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds("same")), {
        target,
      });
      reports.push(`${out.status}|${out.message}`);
      await s.close();
    }
    expect(new Set(reports).size).toBe(1);
  }, 120_000);
});
