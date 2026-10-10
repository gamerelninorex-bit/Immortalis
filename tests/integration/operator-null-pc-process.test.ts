// The REAL command line as a process, typed at through its standard input, for the NULL-PC OOC commands. The campaign (NULL-PC,
// GIP institution/office/binding/Instrument, or the Logistics chain and its kernel hold) exists independently of every process
// below, committed by the real owners; the processes create none of it.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  gipInstrumentKey,
  worldEntityTransitionKey,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import {
  FIXTURE_WORLD_ID,
  INSTRUMENT_A,
  LOGISTICS_FIXTURE_EXTENSION,
  REQ_1,
} from "@immortalis/testkit";
import { nullAdvance } from "@immortalis/operator";
import { SUNSET_AT, SUNSET_MID } from "../support/gip-sunset.ts";
import { refuseNullPcDeliveryStage } from "../support/null-pc-advance.ts";
import { entityIdOf } from "../support/logistics.ts";
import {
  NULL_PC_LOGISTICS_ENTRY,
  SHIPPED_BIN,
  cliArgs,
  copyCampaign,
  ctxOf,
  fixedIds,
  runOperator,
  scriptedTerminal,
  seedTemplate,
} from "../support/operator.ts";
import {
  LOGISTICS_EXTENSION,
  PROD_T1,
  gipSunsetNullTemplate,
  logisticsNullTemplate,
  openNull,
} from "../support/operator-null-pc.ts";

let gipTemplate: string;
let logTemplate: string;
let pcTemplate: string;
beforeAll(async () => {
  gipTemplate = await gipSunsetNullTemplate();
  logTemplate = await logisticsNullTemplate();
  pcTemplate = await seedTemplate();
}, 180_000);

const lifecycle = async (dir: string): Promise<string> => {
  const opened = await CanonicalCampaign.open(dir);
  if (!opened.ok) throw new Error("did not reopen");
  const v = (
    opened.value.store.getFact(gipInstrumentKey(INSTRUMENT_A))!.value as GovernanceInstrument
  ).lifecycle_status;
  await opened.value.close();
  return v;
};
const hashOf = async (dir: string, ext?: typeof LOGISTICS_FIXTURE_EXTENSION): Promise<string> => {
  const opened = await CanonicalCampaign.open(dir, ext ? { extension: ext } : {});
  if (!opened.ok) throw new Error("did not reopen");
  const h = opened.value.store.head().state_sha256;
  await opened.value.close();
  return h;
};
const phrase = (s: string) => /type exactly "([^"]+)"/.exec(s)![1]!;

describe("the shipped binary: before-boundary contrast, then the earned boundary, across separate processes", () => {
  it("null-advance short of the sunset (process 1), status (process 2), null-advance to the sunset (process 3): GIP's Instrument expires only in the last", async () => {
    const dirs = copyCampaign(gipTemplate);
    expect(await lifecycle(dirs.campaignDir)).toBe("active");

    const one = await runOperator(cliArgs.nullAdvance(dirs, SUNSET_MID), ["confirm"], {
      entry: SHIPPED_BIN,
    });
    expect(one.code).toBe(0);
    expect(one.stdout).toContain("STATUS NULL_PC_ADVANCE_COMMITTED");
    expect(await lifecycle(dirs.campaignDir)).toBe("active");
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);

    const two = await runOperator(cliArgs.command("status", dirs), [], { entry: SHIPPED_BIN });
    expect(two.code).toBe(0);
    expect(two.stdout).toContain("ooc choices: ADVANCE COMMITTED");

    const three = await runOperator(cliArgs.nullAdvance(dirs, SUNSET_AT), ["confirm"], {
      entry: SHIPPED_BIN,
    });
    expect(three.code).toBe(0);
    expect(three.stdout).toContain("STATUS NULL_PC_ADVANCE_COMMITTED");
    expect(await lifecycle(dirs.campaignDir)).toBe("expired");

    // distinct fresh challenges, and the verb names the choice
    expect(phrase(one.stdout)).toMatch(/^null-advance [0-9a-f]{12}$/);
    expect(phrase(three.stdout)).toMatch(/^null-advance [0-9a-f]{12}$/);
    expect(phrase(one.stdout)).not.toBe(phrase(three.stdout));
    // the console reports a transaction status and nothing of the world
    expect(one.stdout + three.stdout).not.toMatch(
      /expired|sunset|lifecycle|gip\/|instrument-a|DEPENDENCY|sha256/i,
    );
    expect(three.stdout).toMatch(/OOC DEVELOPMENT/);

    // the process left a campaign a further process reconciles to nothing
    const four = await runOperator(cliArgs.command("reconcile", dirs), [], { entry: SHIPPED_BIN });
    expect(four.stdout).toContain("STATUS NOTHING_TO_RECONCILE");
  }, 240_000);

  it("a declined, mistyped, pre-typed or absent confirmation changes nothing", async () => {
    const dirs = copyCampaign(gipTemplate);
    const start = await hashOf(dirs.campaignDir);
    for (const [typed, pre] of [
      [["decline"], undefined],
      [["eof"], undefined],
      [[{ raw: "null-advance 000000000000" }], undefined],
      [[{ raw: "advance 000000000000" }], undefined],
      [[], "null-advance 000000000000\nyes\n"],
    ] as const) {
      const r = await runOperator(cliArgs.nullAdvance(dirs, SUNSET_AT), [...typed], {
        entry: SHIPPED_BIN,
        ...(pre !== undefined ? { preTyped: pre } : {}),
      });
      expect(r.code).toBe(2);
      expect(r.stdout).toContain("STATUS DECLINED");
      expect(await hashOf(dirs.campaignDir)).toBe(start);
      expect(await lifecycle(dirs.campaignDir)).toBe("active");
    }
  }, 240_000);

  it("a malformed or over-claiming command line is refused as usage before the campaign is touched", async () => {
    const dirs = copyCampaign(gipTemplate);
    const start = await hashOf(dirs.campaignDir);
    const base = cliArgs.nullAdvance(dirs, SUNSET_AT);
    const cases: string[][] = [
      base.filter((a, i) => !(a === "--target-value" || base[i - 1] === "--target-value")),
      base.filter((a, i) => !(a === "--target-unit" || base[i - 1] === "--target-unit")),
      [...base, "--target-value", "200"],
      [...base, "--confirmed"],
      [...base, "--role", "role.player"],
      [...base, "--pc", "pc-1"],
      [...base, "--world", "w"],
      [...base, "--delivery-value", "5"],
      [...base, "--transaction-id", "x"],
      cliArgs.nullAdvance(dirs, { unit: SUNSET_AT.unit, value: -1 }),
      cliArgs.nullAdvance(dirs, { unit: SUNSET_AT.unit, value: 1.5 }),
      [...cliArgs.command("null-resume", dirs), "--target-value", "200"],
      [...cliArgs.command("null-resume", dirs), "--target-unit", "u"],
      [...cliArgs.command("advance", dirs), "--target-value", "200"],
      ["null-advance", "extra", ...base.slice(1)],
    ];
    for (const args of cases) {
      const r = await runOperator(args);
      expect(r.code, args.join(" ")).toBe(64);
      expect(r.stdout, args.join(" ")).toContain("usage:");
    }
    // no campaign id: refused too (every mutating command names its campaign)
    const noId = base.filter((a, i) => !(a === "--campaign-id" || base[i - 1] === "--campaign-id"));
    expect((await runOperator(noId)).code).toBe(64);
    // a different campaign id is refused as a mismatch, not adopted
    const wrong = base.map((a) =>
      a === "campaign-world-foundation-1" ? "some-other-campaign" : a,
    );
    const mismatch = await runOperator(wrong, ["confirm"], { entry: SHIPPED_BIN });
    expect(mismatch.code).toBe(3);
    expect(mismatch.stdout).toContain("SESSION_UNAVAILABLE");
    expect(await hashOf(dirs.campaignDir)).toBe(start);
  }, 240_000);

  it("the NULL-PC command refuses a campaign with an active character, and the active-PC commands refuse a NULL-PC campaign, without a prompt", async () => {
    const pc = copyCampaign(pcTemplate);
    const r = await runOperator(cliArgs.nullAdvance(pc, SUNSET_AT));
    expect(r.code).toBe(3);
    expect(r.stdout).toContain("STATUS UNAVAILABLE");
    expect(r.stdout).not.toContain("To confirm");
    const nullPc = copyCampaign(gipTemplate);
    for (const args of [cliArgs.command("advance", nullPc)]) {
      const x = await runOperator(args, [], { entry: SHIPPED_BIN });
      expect(x.code).toBe(3);
      expect(x.stdout).toContain("STATUS UNAVAILABLE");
      expect(x.stdout).not.toContain("To confirm");
    }
    const resume = await runOperator(cliArgs.command("null-resume", nullPc), [], {
      entry: SHIPPED_BIN,
    });
    expect(resume.code).toBe(3);
    expect(resume.stdout).toContain("STATUS UNAVAILABLE");
    expect(resume.stdout).not.toContain("To confirm");
  }, 240_000);
});

describe("a kernel-held lineage resumed by the real command line in a NEW process", () => {
  it("null-resume (its own challenge, its own identity) takes up exactly the remainder; reconcile and status are nothing afterwards", async () => {
    const dirs = copyCampaign(logTemplate);
    // the first choice and its truthful kernel hold are made in-process (the stage is refused through the store), then closed
    const s = await openNull(dirs, LOGISTICS_EXTENSION);
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    expect(
      (
        await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds("proc-1")), {
          target: PROD_T1,
        })
      ).status,
    ).toBe("NULL_PC_ADVANCE_COMMITTED");
    restore();
    await s.close();
    const delivered = async () => {
      const o = await CanonicalCampaign.open(dirs.campaignDir, {
        extension: LOGISTICS_FIXTURE_EXTENSION,
      });
      if (!o.ok) throw new Error("did not reopen");
      const has =
        o.value.store.getFact(worldEntityTransitionKey(FIXTURE_WORLD_ID, entityIdOf(REQ_1))) !==
        undefined;
      await o.value.close();
      return has;
    };
    expect(await delivered()).toBe(false);

    // the held remainder is neither retried by a status nor by a reconcile process
    const before = await hashOf(dirs.campaignDir, LOGISTICS_FIXTURE_EXTENSION);
    const status = await runOperator(cliArgs.command("status", dirs), [], {
      entry: NULL_PC_LOGISTICS_ENTRY,
    });
    expect(status.stdout).toContain("ooc choices: ADVANCE COMMITTED");
    const idle = await runOperator(cliArgs.command("reconcile", dirs), [], {
      entry: NULL_PC_LOGISTICS_ENTRY,
    });
    expect(idle.stdout).toContain("STATUS NOTHING_TO_RECONCILE");
    expect(await hashOf(dirs.campaignDir, LOGISTICS_FIXTURE_EXTENSION)).toBe(before);

    // a declined resume resumes nothing; the confirmed one is its own choice with its own verb and challenge
    const declined = await runOperator(cliArgs.command("null-resume", dirs), ["decline"], {
      entry: NULL_PC_LOGISTICS_ENTRY,
    });
    expect(declined.stdout).toContain("STATUS DECLINED");
    expect(await delivered()).toBe(false);
    const resumed = await runOperator(cliArgs.command("null-resume", dirs), ["confirm"], {
      entry: NULL_PC_LOGISTICS_ENTRY,
    });
    expect(resumed.code).toBe(0);
    expect(resumed.stdout).toContain("STATUS NULL_PC_HELD_ADVANCE_COMMITTED");
    expect(phrase(resumed.stdout)).toMatch(/^null-resume [0-9a-f]{12}$/);
    expect(resumed.stdout).toMatch(/choice #2/);
    expect(await delivered()).toBe(true);
    const after = await runOperator(cliArgs.command("status", dirs), [], {
      entry: NULL_PC_LOGISTICS_ENTRY,
    });
    expect(after.stdout).toContain("ooc choices: ADVANCE COMMITTED, RESUME COMMITTED");
    // nothing remains to resume
    const again = await runOperator(cliArgs.command("null-resume", dirs), [], {
      entry: NULL_PC_LOGISTICS_ENTRY,
    });
    expect(again.stdout).toContain("STATUS UNAVAILABLE");
    expect(again.stdout).not.toContain("To confirm");
  }, 240_000);
});
