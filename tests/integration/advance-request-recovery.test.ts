// RC-16 recovery for the host-requested, independently operator-confirmed target-only advance (BLUE v5.2-A1 bounded brief 2026-10-15, race/recovery
// obligations): a lost reply or a crash at EVERY durable cut of the campaign package and of the retained state while the operator's answer runs,
// an unknown outcome that is never reported as "no effect", and reconciliation by the ORIGINAL identity to exactly the canon an uninterrupted
// run produces — one transaction, one GIP expiry, no silent progression. Every campaign is built only by the shipped owner paths; the scripted
// console only types the phrase the service printed.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { nodeFs, type FsOps } from "@immortalis/engine";
import { runCli } from "@immortalis/operator";
import { SimulatedCrash } from "@immortalis/testkit";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { scriptedConsole } from "../support/original-pc.ts";
import {
  BEYOND_SUNSET,
  REQUEST_HOST,
  answer,
  askFiles,
  bindRequestHost,
  sunsetDirs,
  targetConsole,
  worldOf,
} from "../support/advance-request.ts";
import { requestActivePcTargetAdvance } from "../../packages/operator/src/advance-request.ts";
import { copyDirs } from "../support/player-view.ts";

vi.setConfig({ testTimeout: 900_000 });

const WHEN = ["before", "after"] as const;
let fresh: LocalityDirs;
/** What an uninterrupted run leaves, in terms independent of the random transaction identity. */
let reference: { transactions: number; revision: number };

const host = async (dirs: LocalityDirs) => {
  const bound = await bindRequestHost(dirs);
  expect(bound.code).toBe(0);
  return {
    campaignDir: dirs.campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    stateDir: dirs.operatorDir,
    hostId: REQUEST_HOST,
    secret: readFileSync(bound.secretFile, "utf8").trim(),
  };
};

const MUTATING = [
  "writeFileDurable",
  "appendDurable",
  "truncate",
  "remove",
  "createExclusive",
  "mkdirp",
] as const;

/**
 * The testkit's fault seam, restricted to the DURABLE DATA the operator's answer writes: the package's single-writer lock file is exempt. An
 * in-process simulated crash cannot die, so a fault in the lock's own create or release would leave this very process holding a lock that only
 * the explicit `--reclaim-stale-lock` of a dead holder takes over; the lock's lifecycle is the engine's own, covered by its writer-lock tests.
 */
function durableFs(plan?: { failAt: number; when: "before" | "after" }): {
  fs: FsOps;
  count: () => number;
} {
  let n = 0;
  const wrapped: Record<string, unknown> = { ...nodeFs };
  for (const name of MUTATING) {
    const original = nodeFs[name] as (...args: never[]) => Promise<void>;
    wrapped[name] = async (...args: never[]) => {
      const exempt = /(^|[\\/])LOCK(\.|$)/.test(String(args[0]));
      if (!exempt) n += 1;
      const mine = n;
      const hit = !exempt && plan !== undefined && mine === plan.failAt;
      if (hit && plan!.when === "before") throw new SimulatedCrash(mine);
      await original.apply(nodeFs, args);
      if (hit && plan!.when === "after") throw new SimulatedCrash(mine);
    };
  }
  return { fs: wrapped as unknown as FsOps, count: () => n };
}

const reconcileCli = (dirs: LocalityDirs) =>
  runCli(
    [
      "reconcile",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--operator-dir",
      dirs.operatorDir,
    ],
    { terminal: scriptedConsole(), out: () => undefined },
  );

beforeAll(async () => {
  fresh = await sunsetDirs();
  const dirs = copyDirs(fresh);
  const h = await host(dirs);
  expect((await requestActivePcTargetAdvance(h)).ok).toBe(true);
  expect((await answer(dirs, BEYOND_SUNSET)).result.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
  const w = await worldOf(dirs);
  expect(w.lifecycle).toBe("expired");
  reference = { transactions: w.transactions.length, revision: w.revision };
}, 300_000);

/**
 * After whatever happened, the operator's own shipped recovery converges on the uninterrupted canon: reconcile the retained intent by its
 * original identity (asked nothing), and if no choice had been retained the host simply asks again and the operator answers once.
 */
async function converge(dirs: LocalityDirs, h: Awaited<ReturnType<typeof host>>, label: string) {
  await reconcileCli(dirs);
  let w = await worldOf(dirs);
  if (w.lifecycle !== "expired") {
    expect(w.transactions, label).toEqual([]);
    expect((await requestActivePcTargetAdvance(h)).ok, label).toBe(true);
    const r = await answer(dirs, BEYOND_SUNSET, targetConsole());
    expect(r.result.status, `${label} ${JSON.stringify(r.result)}`).toBe(
      "PC_TARGET_ADVANCE_COMMITTED",
    );
    w = await worldOf(dirs);
  }
  expect(w.lifecycle, label).toBe("expired");
  expect(w.instrumentVersion, label).toBe(2);
  expect(w.time, label).toEqual(BEYOND_SUNSET);
  // exactly the uninterrupted canon: one transaction, no second GIP expiry, no extra revision
  expect(w.transactions.length, label).toBe(reference.transactions);
  expect(w.revision, label).toBe(reference.revision);
  await expectNothingToAsk(dirs, label);
}

/** The package's reported residue (never adopted by the engine): a snapshot file a crash left before the manifest moved. */
async function residueOf(dirs: LocalityDirs) {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return c.store.residue;
  } finally {
    await c.close();
  }
}

/**
 * A replayed answer asks the operator nothing and commits nothing. Where the interrupted run left residue the engine REPORTS and never adopts
 * (a snapshot file written before the manifest moved), the read proof fails closed exactly as the read and request paths do: the ask is kept and
 * the answer is unavailable; the ordinary operator commands (reconcile) are unaffected and have already converged the canon.
 */
async function expectNothingToAsk(dirs: LocalityDirs, label: string) {
  const quiet = scriptedConsole();
  const before = await worldOf(dirs);
  const askPending = askFiles(dirs).length > 0;
  const replay = await answer(dirs, BEYOND_SUNSET, quiet);
  expect(quiet.asked(), label).toBe(0);
  expect(await worldOf(dirs), label).toEqual(before);
  const residue = await residueOf(dirs);
  if (askPending && (residue.other_files.length > 0 || residue.journal_tail_bytes > 0)) {
    expect(replay.result.status, `${label} ${JSON.stringify(replay.result)}`).toBe(
      "TARGET_ADVANCE_REQUEST_UNAVAILABLE",
    );
    expect(replay.result.code, label).toBe("CAMPAIGN_NOT_RECONCILED");
  } else {
    expect(
      ["TARGET_ADVANCE_REQUEST_NONE", "TARGET_ADVANCE_REQUEST_STALE"],
      `${label} ${JSON.stringify(replay.result)}`,
    ).toContain(replay.result.status);
    expect(askFiles(dirs), label).toHaveLength(0);
  }
}

describe("a lost reply or crash at each durable cut while the operator answers a host's request", () => {
  for (const seam of ["campaignFs", "ledgerFs"] as const) {
    it(`every mutating operation of the ${seam}, before and after: never a false no-effect, and recovery reaches the uninterrupted canon`, async () => {
      const dirs0 = copyDirs(fresh);
      const h0 = await host(dirs0);
      expect((await requestActivePcTargetAdvance(h0)).ok).toBe(true);
      const probe = durableFs();
      const counted = await answer(dirs0, BEYOND_SUNSET, targetConsole(), { [seam]: probe.fs });
      expect(counted.result.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
      const total = probe.count();
      expect(total).toBeGreaterThan(2);

      const seen = new Set<string>();
      for (let failAt = 1; failAt <= total; failAt++) {
        for (const when of WHEN) {
          const label = `${seam} op ${failAt} ${when}`;
          const dirs = copyDirs(fresh);
          const h = await host(dirs);
          expect((await requestActivePcTargetAdvance(h)).ok, label).toBe(true);
          const before = await worldOf(dirs);
          const faulty = durableFs({ failAt, when });
          const r = await answer(dirs, BEYOND_SUNSET, targetConsole(), { [seam]: faulty.fs });
          seen.add(r.result.status);
          const status = r.result.status;
          const w = await worldOf(dirs);
          // an unknown outcome is never reported as "no effect", and the ask is kept for the original identity's reconciliation
          if (status === "PC_TARGET_ADVANCE_OUTCOME_UNKNOWN") {
            expect(r.result.message, label).toMatch(/not known/);
            expect(askFiles(dirs).length, label).toBeGreaterThan(0);
          }
          // a definite refusal or an unavailable answer left the world exactly as it was; a committed one reached the owners' result
          if (
            status === "UNAVAILABLE" ||
            status === "SESSION_UNAVAILABLE" ||
            status === "TARGET_ADVANCE_REQUEST_UNAVAILABLE"
          )
            expect(w.stateHash, label).toBe(before.stateHash);
          if (status === "PC_TARGET_ADVANCE_COMMITTED") {
            expect(w.lifecycle, label).toBe("expired");
            expect(w.transactions.length, label).toBe(reference.transactions);
          }
          await converge(dirs, h, label);
        }
      }
      // the cuts exercised a committed outcome, and (in the package) an unknown one
      expect(seen.has("PC_TARGET_ADVANCE_COMMITTED"), [...seen].join()).toBe(true);
      if (seam === "campaignFs")
        expect(seen.has("PC_TARGET_ADVANCE_OUTCOME_UNKNOWN"), [...seen].join()).toBe(true);
    }, 1_800_000);
  }

  it("an unknown outcome refuses everything until the campaign is closed and reopened, then reconciles by the original identity without a new confirmation", async () => {
    const dirs = copyDirs(fresh);
    const h = await host(dirs);
    expect((await requestActivePcTargetAdvance(h)).ok).toBe(true);
    // the journal append takes effect but the operator sees a failure: the commit landed, the reply was lost
    const probe = durableFs();
    const counted = copyDirs(fresh);
    const hc = await host(counted);
    expect((await requestActivePcTargetAdvance(hc)).ok).toBe(true);
    await answer(counted, BEYOND_SUNSET, targetConsole(), { campaignFs: probe.fs });
    const total = probe.count();
    let unknownAt: number | null = null;
    for (let failAt = total; failAt >= 1 && unknownAt === null; failAt--) {
      const d = copyDirs(fresh);
      const hd = await host(d);
      expect((await requestActivePcTargetAdvance(hd)).ok).toBe(true);
      const r = await answer(d, BEYOND_SUNSET, targetConsole(), {
        campaignFs: durableFs({ failAt, when: "after" }).fs,
      });
      if (r.result.status === "PC_TARGET_ADVANCE_OUTCOME_UNKNOWN") {
        unknownAt = failAt;
        // the operator's own reconciliation settles it by the retained identity, asking nothing
        const silent = scriptedConsole();
        const code = await runCli(
          [
            "reconcile",
            "--campaign",
            d.campaignDir,
            "--campaign-id",
            LOCALITY_CAMPAIGN,
            "--operator-dir",
            d.operatorDir,
          ],
          { terminal: silent, out: () => undefined },
        );
        expect(code).toBe(0);
        expect(silent.asked()).toBe(0);
        const w = await worldOf(d);
        expect(w.lifecycle).toBe("expired");
        expect(w.instrumentVersion).toBe(2);
        expect(w.transactions.length).toBe(reference.transactions);
        // the kept ask is now for a basis that has moved: stale, and the operator is asked nothing
        await expectNothingToAsk(d, `unknown at op ${failAt}`);
      }
    }
    expect(unknownAt).not.toBeNull();
  });
});
