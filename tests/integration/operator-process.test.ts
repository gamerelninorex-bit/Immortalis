// The REAL command line as a process, typed at through its standard input — not a binder called by the test. The campaign, PC,
// handover, custody and destination exist independently of it (committed by the real owners before any process starts); the
// processes below create none of them.
/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw fact values */
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { ACTOR_FIXTURE_EXTENSION } from "@immortalis/testkit";
import { LocalOperatorSession } from "@immortalis/operator";
import { PC, authorityCensus, movementSummary } from "../support/pc-movement.ts";
import {
  DEST_LOCUS_ID,
  FIXTURE_CAMPAIGN,
  cliArgs,
  copyCampaign,
  openSession,
  runOperator,
  seedTemplate,
  sessionParams,
} from "../support/operator.ts";

let template: string;
beforeAll(async () => {
  template = await seedTemplate();
}, 120_000);

const inspect = async (dir: string) => {
  const opened = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
  if (!opened.ok) throw new Error("did not reopen");
  const s = { campaign: opened.value };
  const out = {
    summary: movementSummary(s),
    census: authorityCensus(s),
    phase: opened.value.pcCurrentLocus(PC)?.phase,
  };
  await opened.value.close();
  return out;
};

describe("the real process: operator command → confirmation → owner chain → close → reopen → second confirmation", () => {
  it("relocate (process 1), status (process 2), advance (process 3): same campaign, same PC, distinct typed confirmations", async () => {
    const dirs = copyCampaign(template);
    const start = await inspect(dirs.campaignDir);

    const one = await runOperator(cliArgs.relocate(dirs), ["confirm"]);
    expect(one.stdout).toContain("STATUS RELOCATION_COMMITTED");
    expect(one.code).toBe(0);
    const afterOne = await inspect(dirs.campaignDir);
    expect(afterOne.phase).toBe("IN_TRANSFER");
    expect(afterOne.census).toMatchObject({ logistics: 1, total: 1, destination: 0 });
    // process 1 advanced no time (canonical time and the delivery boundary are as they were)
    const clock = (r: typeof start) =>
      (r.summary.facts.find((f) => f.key === "temporal/state")!.value as any).canonical_time;
    expect(clock(afterOne)).toEqual(clock(start));
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);

    const two = await runOperator(cliArgs.command("status", dirs));
    expect(two.code).toBe(0);
    expect(two.stdout).toContain("relocation choice: COMMITTED");
    expect(two.stdout).toContain("progression choices: none");

    const three = await runOperator(cliArgs.command("advance", dirs), ["confirm"]);
    expect(three.stdout).toContain("STATUS ADVANCE_COMMITTED");
    expect(three.code).toBe(0);
    const end = await inspect(dirs.campaignDir);
    expect(end.census).toMatchObject({ destination: 1, logistics: 0, total: 1 });
    expect(end.census.destinationLocus).toBe(DEST_LOCUS_ID);

    // the two confirmations used different fresh challenges
    const phrase = (s: string) => /type exactly "([^"]+)"/.exec(s)![1]!;
    expect(phrase(one.stdout)).toMatch(/^relocate [0-9a-f]{12}$/);
    expect(phrase(three.stdout)).toMatch(/^advance [0-9a-f]{12}$/);
    expect(one.stdout + three.stdout).not.toMatch(/\barrived\b/);
  }, 180_000);

  it("a declined, mistyped, pre-typed or absent confirmation changes nothing and is never a confirmation", async () => {
    const dirs = copyCampaign(template);
    const before = (await inspect(dirs.campaignDir)).summary;
    const attempts = [
      await runOperator(cliArgs.relocate(dirs), ["decline"]),
      await runOperator(cliArgs.relocate(dirs), [{ raw: "relocate 000000000000" }]),
      await runOperator(cliArgs.relocate(dirs), [], {
        preTyped: "yes\nconfirm\nrelocate 000000000000\n",
      }),
      await runOperator(cliArgs.relocate(dirs), ["eof"]),
    ];
    for (const run of attempts) {
      expect(run.stdout).toContain("STATUS DECLINED");
      expect(run.code).toBe(2);
    }
    expect((await inspect(dirs.campaignDir)).summary).toEqual(before);
  }, 180_000);

  it("refuses unsupported, malformed or over-claiming command lines before touching the campaign", async () => {
    const dirs = copyCampaign(template);
    const before = (await inspect(dirs.campaignDir)).summary;
    const bad: string[][] = [
      ["wait", "--campaign", dirs.campaignDir, "--campaign-id", "x"],
      ["relocate", "to", "the", "market"],
      [...cliArgs.relocate(dirs), "--confirmed"],
      [...cliArgs.relocate(dirs), "--role", "role.player"],
      [...cliArgs.relocate(dirs), "--pc", PC],
      [...cliArgs.relocate(dirs), "--world", "other"],
      cliArgs.relocate(dirs, ["extra"]),
      [...cliArgs.command("advance", dirs), "--transaction-id", "tx"],
      cliArgs
        .command("advance", dirs)
        .filter((a) => a !== "--campaign-id" && a !== FIXTURE_CAMPAIGN),
      ["status"],
      cliArgs.relocate(dirs).map((a) => (a === "200" ? "-3" : a)),
      cliArgs.relocate(dirs).map((a) => (a === "200" ? "2.5" : a)),
    ];
    for (const args of bad) {
      const run = await runOperator(args);
      expect(run.code, args.join(" ")).toBe(64);
      expect(run.stdout).toContain("usage:");
    }
    expect((await inspect(dirs.campaignDir)).summary).toEqual(before);
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);
  }, 180_000);

  it("a wrong campaign identity, a foreign-writable package or a held lock refuses the session", async () => {
    const dirs = copyCampaign(template);
    const wrong = await runOperator(
      cliArgs.command("status", dirs).map((a) => (a === FIXTURE_CAMPAIGN ? "other-campaign" : a)),
    );
    expect(wrong.code).toBe(3);
    expect(wrong.stdout).toContain("SESSION_UNAVAILABLE CAMPAIGN_MISMATCH");
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);

    const held = await openSession(dirs);
    const locked = await runOperator(cliArgs.command("status", dirs));
    expect(locked.code).toBe(3);
    expect(locked.stdout).toContain("SESSION_UNAVAILABLE CAMPAIGN_UNAVAILABLE LOCKED");
    await held.close();
  }, 120_000);

  it("a crash with the campaign open leaves a stale lock that only an explicit reclaim takes over; the same journey then completes", async () => {
    const dirs = copyCampaign(template);
    const crashed = await runOperator(cliArgs.relocate(dirs), [], {
      killAfter: /To confirm, type exactly/,
    });
    expect(crashed.signal).toBe("SIGKILL");
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(true);

    const refused = await runOperator(cliArgs.relocate(dirs), ["confirm"]);
    expect(refused.code).toBe(3);
    expect(refused.stdout).toContain("LOCKED");

    const resumed = await runOperator(cliArgs.relocate(dirs, ["--reclaim-stale-lock"]), [
      "confirm",
    ]);
    expect(resumed.stdout).toContain("STATUS RELOCATION_COMMITTED");
    expect((await inspect(dirs.campaignDir)).phase).toBe("IN_TRANSFER");
  }, 180_000);

  it("a session over a campaign another operating-system user could write is not verified", async () => {
    const dirs = copyCampaign(template);
    chmodSync(dirs.campaignDir, 0o777);
    const run = await runOperator(cliArgs.command("status", dirs));
    expect(run.code).toBe(3);
    expect(run.stdout).toContain("SESSION_UNAVAILABLE OPERATOR_UNVERIFIED WRITABLE_BY_OTHERS");
    chmodSync(dirs.campaignDir, 0o700);
    const opened = await LocalOperatorSession.open(sessionParams(dirs));
    expect(opened.ok).toBe(true);
    if (opened.ok) await opened.value.close();
  }, 120_000);
});
