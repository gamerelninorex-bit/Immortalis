/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts */
// The REAL command line as a process, typed at through its standard input, for the active-PC target commands. The campaign (the
// stationary active PC, its handover and custody, GIP's institution/office/binding/Instrument) exists independently of every
// process below, committed by the real owners; the processes create none of it.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { gipInstrumentKey, type GovernanceInstrument } from "@immortalis/contracts";
import { ACTOR_FIXTURE_EXTENSION, INSTRUMENT_A } from "@immortalis/testkit";
import { pcTargetAdvance } from "@immortalis/operator";
import { SUNSET_LATER, SUNSET_MID, at } from "../support/gip-sunset.ts";
import { refuseGipStageOf } from "../support/pc-target-advance.ts";
import {
  SHIPPED_BIN,
  cliArgs,
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  runOperator,
  scriptedTerminal,
  seedTemplate,
} from "../support/operator.ts";
import { gipSunsetNullTemplate } from "../support/operator-null-pc.ts";
import { gipSunsetPcTemplate } from "../support/operator-pc-target.ts";

let gipTemplate: string;
let plainTemplate: string;
beforeAll(async () => {
  gipTemplate = await gipSunsetPcTemplate(SUNSET_MID);
  plainTemplate = await seedTemplate();
}, 180_000);

const inspect = async (dir: string) => {
  const opened = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
  if (!opened.ok) throw new Error("did not reopen");
  const c = opened.value;
  const out = {
    lifecycle: (c.store.getFact(gipInstrumentKey(INSTRUMENT_A))!.value as GovernanceInstrument)
      .lifecycle_status,
    hash: c.store.head().state_sha256,
    time: (c.store.getFact("temporal/state")!.value as any).canonical_time,
    phase: c.pcCurrentLocus("actor-smith")?.phase,
  };
  await c.close();
  return out;
};
const phrase = (s: string) => /type exactly "([^"]+)"/.exec(s)![1]!;

describe("the shipped command line: before-boundary contrast, then the earned boundary, across separate processes", () => {
  it("pc-target-advance short of the sunset (process 1), status (process 2), pc-target-advance past it (process 3): GIP's Instrument expires only in the last, the character never moves", async () => {
    const dirs = copyCampaign(gipTemplate);
    expect((await inspect(dirs.campaignDir)).lifecycle).toBe("active");

    const one = await runOperator(cliArgs.pcTargetAdvance(dirs, at(120)), ["confirm"]);
    expect(one.code).toBe(0);
    expect(one.stdout).toContain("STATUS PC_TARGET_ADVANCE_COMMITTED");
    expect((await inspect(dirs.campaignDir)).lifecycle).toBe("active");
    expect((await inspect(dirs.campaignDir)).time).toEqual(at(120));
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);

    const two = await runOperator(cliArgs.command("status", dirs), []);
    expect(two.code).toBe(0);
    expect(two.stdout).toContain("character target choices: ADVANCE COMMITTED");
    expect(two.stdout).toContain("ooc choices: none");

    const three = await runOperator(cliArgs.pcTargetAdvance(dirs, SUNSET_LATER), ["confirm"]);
    expect(three.code).toBe(0);
    expect(three.stdout).toContain("STATUS PC_TARGET_ADVANCE_COMMITTED");
    const end = await inspect(dirs.campaignDir);
    expect(end.lifecycle).toBe("expired");
    expect(end.time).toEqual(SUNSET_LATER);
    expect(end.phase).toBe("STATIONARY_AT_ORIGIN");

    // distinct fresh challenges, and the verb names the choice
    expect(phrase(one.stdout)).toMatch(/^pc-target-advance [0-9a-f]{12}$/);
    expect(phrase(three.stdout)).toMatch(/^pc-target-advance [0-9a-f]{12}$/);
    expect(phrase(one.stdout)).not.toBe(phrase(three.stdout));
    // the console reports a transaction status and nothing of the world
    expect(one.stdout + three.stdout).not.toMatch(
      /expired|sunset|lifecycle|gip\/|instrument-a|DEPENDENCY|sha256/i,
    );
    expect(three.stdout).toMatch(/OOC DEVELOPMENT/);

    // the process left a campaign a further process reconciles to nothing
    const four = await runOperator(cliArgs.command("reconcile", dirs), []);
    expect(four.stdout).toContain("STATUS NOTHING_TO_RECONCILE");
  }, 240_000);

  it("a declined, mistyped, pre-typed or absent confirmation changes nothing", async () => {
    const dirs = copyCampaign(gipTemplate);
    const start = await inspect(dirs.campaignDir);
    for (const [typed, pre] of [
      [["decline"], undefined],
      [["eof"], undefined],
      [[{ raw: "pc-target-advance 000000000000" }], undefined],
      [[{ raw: "null-advance 000000000000" }], undefined],
      [[], "pc-target-advance 000000000000\nyes\n"],
    ] as const) {
      const r = await runOperator(cliArgs.pcTargetAdvance(dirs, SUNSET_LATER), [...typed], {
        ...(pre !== undefined ? { preTyped: pre } : {}),
      });
      expect(r.code).toBe(2);
      expect(r.stdout).toContain("STATUS DECLINED");
      expect(await inspect(dirs.campaignDir)).toEqual(start);
    }
  }, 240_000);

  it("a malformed or over-claiming command line is refused as usage before the campaign is touched", async () => {
    const dirs = copyCampaign(gipTemplate);
    const start = await inspect(dirs.campaignDir);
    const base = cliArgs.pcTargetAdvance(dirs, SUNSET_LATER);
    const cases: string[][] = [
      base.filter((a, i) => !(a === "--target-value" || base[i - 1] === "--target-value")),
      base.filter((a, i) => !(a === "--target-unit" || base[i - 1] === "--target-unit")),
      [...base, "--target-value", "200"],
      [...base, "--confirmed"],
      [...base, "--role", "role.player"],
      [...base, "--pc", "actor-smith"],
      [...base, "--world", "w"],
      [...base, "--delivery-value", "5"],
      [...base, "--transaction-id", "x"],
      [...base, "--duration", "5"],
      cliArgs.pcTargetAdvance(dirs, { unit: SUNSET_LATER.unit, value: -1 }),
      cliArgs.pcTargetAdvance(dirs, { unit: SUNSET_LATER.unit, value: 1.5 }),
      [...cliArgs.command("pc-target-resume", dirs), "--target-value", "200"],
      [...cliArgs.command("pc-target-resume", dirs), "--target-unit", "u"],
      [...cliArgs.command("advance", dirs), "--target-value", "200"],
      ["pc-target-advance", "extra", ...base.slice(1)],
    ];
    for (const args of cases) {
      const r = await runOperator(args);
      expect(r.code, args.join(" ")).toBe(64);
      expect(r.stdout, args.join(" ")).toContain("usage:");
    }
    const noId = base.filter((a, i) => !(a === "--campaign-id" || base[i - 1] === "--campaign-id"));
    expect((await runOperator(noId)).code).toBe(64);
    // a different campaign id is refused as a mismatch, not adopted
    const wrong = base.map((a) =>
      a === "campaign-world-foundation-1" ? "some-other-campaign" : a,
    );
    const mismatch = await runOperator(wrong, ["confirm"]);
    expect(mismatch.code).toBe(3);
    expect(mismatch.stdout).toContain("SESSION_UNAVAILABLE");
    expect(await inspect(dirs.campaignDir)).toEqual(start);
  }, 240_000);

  it("the command refuses a campaign with no active character and a character whose movement is begun, without a prompt", async () => {
    const nullPc = copyCampaign(await gipSunsetNullTemplate());
    for (const args of [
      cliArgs.pcTargetAdvance(nullPc, SUNSET_LATER),
      cliArgs.command("pc-target-resume", nullPc),
    ]) {
      const x = await runOperator(args, [], { entry: SHIPPED_BIN });
      expect(x.code).toBe(3);
      expect(x.stdout).toContain("STATUS UNAVAILABLE");
      expect(x.stdout).not.toContain("To confirm");
    }
    // the character's relocation is begun but not progressed: it is in transfer
    const moving = copyCampaign(plainTemplate);
    const relocated = await runOperator(cliArgs.relocate(moving), ["confirm"]);
    expect(relocated.stdout).toContain("STATUS RELOCATION_COMMITTED");
    const refused = await runOperator(cliArgs.pcTargetAdvance(moving, SUNSET_LATER), []);
    expect(refused.code).toBe(3);
    expect(refused.stdout).toContain("STATUS UNAVAILABLE");
    expect(refused.stdout).not.toContain("To confirm");
  }, 240_000);

  it("a crash with the campaign open leaves a stale lock that only an explicit reclaim takes over; the same choice then completes once", async () => {
    const dirs = copyCampaign(gipTemplate);
    const crashed = await runOperator(cliArgs.pcTargetAdvance(dirs, SUNSET_LATER), [], {
      killAfter: /To confirm, type exactly/,
    });
    expect(crashed.signal).toBe("SIGKILL");
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(true);
    const refused = await runOperator(cliArgs.pcTargetAdvance(dirs, SUNSET_LATER), ["confirm"]);
    expect(refused.code).toBe(3);
    expect(refused.stdout).toContain("LOCKED");
    const resumed = await runOperator(
      cliArgs.pcTargetAdvance(dirs, SUNSET_LATER, ["--reclaim-stale-lock"]),
      ["confirm"],
    );
    expect(resumed.code).toBe(0);
    expect(resumed.stdout).toContain("STATUS PC_TARGET_ADVANCE_COMMITTED");
    expect((await inspect(dirs.campaignDir)).lifecycle).toBe("expired");
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);
  }, 240_000);
});

describe("a kernel-held lineage resumed by the real command line in a NEW process", () => {
  it("pc-target-resume (its own challenge, its own identity) takes up exactly the remainder; reconcile and status are nothing afterwards", async () => {
    const dirs = copyCampaign(gipTemplate);
    // the first choice and its truthful kernel hold are made in-process (GIP's stage is refused through the store), then closed
    const s = await openSession(dirs);
    const restore = refuseGipStageOf(s);
    expect(
      (
        await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds("proc-1")), {
          target: SUNSET_LATER,
        })
      ).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");
    restore();
    await s.close();
    expect((await inspect(dirs.campaignDir)).lifecycle).toBe("active");

    // the held remainder is neither retried by a status nor by a reconcile process
    const before = await inspect(dirs.campaignDir);
    const status = await runOperator(cliArgs.command("status", dirs), []);
    expect(status.stdout).toContain("character target choices: ADVANCE COMMITTED");
    const idle = await runOperator(cliArgs.command("reconcile", dirs), []);
    expect(idle.stdout).toContain("STATUS NOTHING_TO_RECONCILE");
    expect(await inspect(dirs.campaignDir)).toEqual(before);

    // a new initial choice never abandons it; a declined resume resumes nothing; the confirmed one is its own choice
    const initial = await runOperator(cliArgs.pcTargetAdvance(dirs, SUNSET_LATER), []);
    expect(initial.stdout).toContain("STATUS UNAVAILABLE");
    expect(initial.stdout).not.toContain("To confirm");
    const declined = await runOperator(cliArgs.command("pc-target-resume", dirs), ["decline"]);
    expect(declined.stdout).toContain("STATUS DECLINED");
    expect((await inspect(dirs.campaignDir)).lifecycle).toBe("active");
    const resumed = await runOperator(cliArgs.command("pc-target-resume", dirs), ["confirm"]);
    expect(resumed.code).toBe(0);
    expect(resumed.stdout).toContain("STATUS PC_TARGET_ADVANCE_COMMITTED");
    expect(phrase(resumed.stdout)).toMatch(/^pc-target-resume [0-9a-f]{12}$/);
    expect(resumed.stdout).toMatch(/choice #2/);
    expect((await inspect(dirs.campaignDir)).lifecycle).toBe("expired");
    const after = await runOperator(cliArgs.command("status", dirs), []);
    expect(after.stdout).toContain("character target choices: ADVANCE COMMITTED, RESUME COMMITTED");
    // nothing remains to resume
    const again = await runOperator(cliArgs.command("pc-target-resume", dirs), []);
    expect(again.stdout).toContain("STATUS UNAVAILABLE");
    expect(again.stdout).not.toContain("To confirm");
  }, 240_000);
});
