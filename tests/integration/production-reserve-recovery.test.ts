/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap owner operations to simulate lost acknowledgements */
// Crash / retry for the initial Production Reserve admission (RC-16): a lost reply after the owner commit, a commit that never reached the
// store, a failed reopen after the close, a real SIGKILL of the shipped binary, and a failure before and after EVERY mutating filesystem
// operation of the whole command. Each case reopens and re-presents the SAME confirmed Reserve, which must land on exactly the campaign an
// uninterrupted run produces — never a second or altered Reserve, and never a success claimed before the readback. An unknown write
// outcome is UNKNOWN, never a false refusal or success, until it is reconciled by identity.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { productionReserveKey } from "@immortalis/contracts";
import { CanonicalCampaign, ProductionAdapter, nodeFs } from "@immortalis/engine";
import { productionReserveId } from "@immortalis/operator";
import { instrumentFs, publication } from "@immortalis/testkit";
import {
  LOCALITY_CAMPAIGN,
  RESERVE_ID,
  addReserve,
  headOf,
  localityCampaign,
  openOrdinary,
  reserveArgs,
  reserveDoc,
  writeReserve,
} from "../support/production-reserve.ts";
import { runShipped } from "../support/locality.ts";

afterEach(() => vi.restoreAllMocks());

/** A process id that provably belongs to no running process: what the lock of a crashed process names. */
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;

/** An in-process "crash" leaves the lock naming THIS live process; a real crash leaves a dead holder, which is what is restored. */
function crashedHolder(campaignDir: string): void {
  const lock = join(campaignDir, "LOCK");
  if (existsSync(lock))
    writeFileSync(lock, `${JSON.stringify({ pid: deadPid(), campaign_id: LOCALITY_CAMPAIGN })}\n`);
}

const unknown = { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as const;

/**
 * Makes the Reserve operation of the OPERATOR'S campaign lose its acknowledgement: it commits (or, when `commit` is false, never reaches
 * the store). The first call of a run is the admission check on a scratch package and is left alone; the second is the operator's.
 */
function loseReply(commit: boolean) {
  const original = ProductionAdapter.prototype.establishReserve as (
    ...a: unknown[]
  ) => Promise<unknown>;
  let calls = 0;
  vi.spyOn(ProductionAdapter.prototype as any, "establishReserve").mockImplementation(
    async function (this: object, ...args: unknown[]) {
      calls++;
      if (calls === 1) return original.apply(this, args);
      if (commit) await original.apply(this, args);
      return unknown;
    },
  );
}

async function reference() {
  const dirs = await localityCampaign();
  expect((await addReserve(dirs, writeReserve(reserveDoc()))).result.status).toBe("RESERVE_READY");
  return headOf(dirs.campaignDir);
}

const held = async (dir: string) => {
  const c = await openOrdinary(dir);
  try {
    return c.store.getFact(productionReserveKey(RESERVE_ID)) !== undefined;
  } finally {
    await c.close();
  }
};

describe("a lost acknowledgement of the Reserve commit converges on the uninterrupted campaign", () => {
  for (const [commit, name] of [
    [true, "the commit landed but its reply was lost: the rerun verifies it without asking again"],
    [false, "the group never reached the store: the rerun asks once and commits it"],
  ] as const)
    it(
      name,
      async () => {
        const expected = await reference();
        const dirs = await localityCampaign();
        const before = await headOf(dirs.campaignDir);
        const file = writeReserve(reserveDoc());
        loseReply(commit);
        const first = await addReserve(dirs, file);
        // never a false refusal and never a success on the strength of a reply that did not arrive
        expect(first.result.status).toBe("RESERVE_OUTCOME_UNKNOWN");
        expect(first.terminal.said.some((l) => /STATUS|RESERVE_READY/.test(l))).toBe(false);
        vi.restoreAllMocks();

        // the claim is never made on the strength of the reply: the store holds the Reserve exactly when the commit landed
        expect(await held(dirs.campaignDir).catch(() => commit)).toBe(commit);
        if (!commit) expect(await headOf(dirs.campaignDir)).toEqual(before);

        crashedHolder(dirs.campaignDir);
        const again = await addReserve(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status).toBe("RESERVE_READY");
        expect(again.terminal.asked()).toBe(commit ? 0 : 1);
        expect(await headOf(dirs.campaignDir)).toEqual(expected);
      },
      120_000,
    );

  it("an altered Reserve offered after an uncertain commit that landed is refused as altered, never as a new Reserve", async () => {
    const dirs = await localityCampaign();
    loseReply(true);
    expect((await addReserve(dirs, writeReserve(reserveDoc()))).result.status).toBe(
      "RESERVE_OUTCOME_UNKNOWN",
    );
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const head = await headOf(dirs.campaignDir);
    const altered = reserveDoc({ quantity: { amount: 16, unit: "sack" } });
    const { result, terminal } = await addReserve(dirs, writeReserve(altered), ["confirm"], {
      reclaimStaleLock: true,
    });
    expect(result.status).toBe("RESERVE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a DIFFERENT lawful Reserve after an uncertain commit that landed is its own proposal and is admitted beside the first", async () => {
    const dirs = await localityCampaign();
    loseReply(true);
    expect((await addReserve(dirs, writeReserve(reserveDoc()))).result.status).toBe(
      "RESERVE_OUTCOME_UNKNOWN",
    );
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const other = reserveDoc({ reserve_id: "reserve-second" });
    const { result } = await addReserve(dirs, writeReserve(other), ["confirm"], {
      reclaimStaleLock: true,
    });
    expect(result.status).toBe("RESERVE_READY");
    const c = await openOrdinary(dirs.campaignDir);
    expect(c.verify()).toEqual([]);
    expect(c.store.listFacts().filter((f) => f.owner === "production")).toHaveLength(2);
    await c.close();
  }, 120_000);

  it("an identity committed with different content than the confirmed Reserve is never verified as the confirmed Reserve", async () => {
    const dirs = await localityCampaign();
    const doc = reserveDoc();
    const id = productionReserveId(LOCALITY_CAMPAIGN, doc);
    const c = await openOrdinary(dirs.campaignDir);
    const planted = await new ProductionAdapter(c.store).establishReserve({
      ...publication(80),
      group_id: `operator-production-reserve:${id}`,
      intent_id: `operator-production-reserve-intent:${id}`,
      cause: `operator-production-reserve-cause:${id}`,
      basis: "local-operator-confirmed-choice",
      secrecy: "local-operator-session",
      reserve: { ...doc, quantity: { amount: 99, unit: "sack" } },
    });
    expect(planted.ok).toBe(true);
    await c.close();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addReserve(dirs, writeReserve(doc), []);
    expect(result.status).toBe("RESERVE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("a reopen that fails after the commit is not a success; the rerun verifies by identity", () => {
  it("VERIFICATION_FAILED while the fact is durable, then READY on the rerun without a second write", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const file = writeReserve(reserveDoc());
    const open = CanonicalCampaign.open;
    let calls = 0;
    vi.spyOn(CanonicalCampaign, "open").mockImplementation(async (dir: string, o: any) => {
      calls++;
      if (calls >= 2) return { ok: false, error: { code: "REOPEN_LOST", message: "lost" } } as any;
      return open.call(CanonicalCampaign, dir, o);
    });
    const first = await addReserve(dirs, file);
    expect(first.result.status).toBe("RESERVE_VERIFICATION_FAILED");
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(expected);

    const again = await addReserve(dirs, file, []);
    expect(again.result.status).toBe("RESERVE_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});

describe("a failure before or after EVERY mutating filesystem operation converges on the uninterrupted campaign", () => {
  it("each operation, before and after, then the same Reserve confirmed again", async () => {
    const expected = await reference();
    const file = writeReserve(reserveDoc());

    const probeDirs = await localityCampaign();
    const probe = instrumentFs(nodeFs);
    expect(
      (await addReserve(probeDirs, file, ["confirm"], { campaignFs: probe.fs })).result.status,
    ).toBe("RESERVE_READY");
    const total = probe.count();
    expect(total).toBeGreaterThan(5);

    const seen = new Set<string>();
    for (let failAt = 1; failAt <= total; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dirs = await localityCampaign();
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const first = await addReserve(dirs, file, ["confirm"], { campaignFs: faulty.fs });
        seen.add(first.result.status);
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("RESERVE_CONFLICT");
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("INVALID_RESERVE");

        crashedHolder(dirs.campaignDir);
        const again = await addReserve(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status, `op ${failAt} ${when}`).toBe("RESERVE_READY");
        expect(again.terminal.asked()).toBeLessThanOrEqual(1);
        expect(await headOf(dirs.campaignDir), `op ${failAt} ${when}`).toEqual(expected);
        const c = await openOrdinary(dirs.campaignDir);
        expect(c.verify()).toEqual([]);
        expect(c.store.listFacts().filter((f) => f.owner === "production")).toHaveLength(1);
        await c.close();
      }
    }
    // the faults genuinely produced refused, ambiguous or unverified outcomes — not only clean runs
    expect(seen.size).toBeGreaterThan(1);
    expect(seen.has("RESERVE_READY") && seen.size === 1).toBe(false);
  }, 900_000);
});

describe("a real kill of the shipped binary", () => {
  it("killed at the console, before anything is written: the rerun reclaims the stale lock and commits once", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const file = writeReserve(reserveDoc());
    const killed = await runShipped(reserveArgs(dirs, file), [], { killAfter: /To confirm/ });
    expect(killed.signal).toBe("SIGKILL");
    expect(await headOf(dirs.campaignDir).catch(() => before)).toEqual(before);

    const locked = await runShipped(reserveArgs(dirs, file), ["confirm"]);
    expect(locked.code).not.toBe(0);
    expect(locked.stdout).toContain("SESSION_UNAVAILABLE");

    const rerun = await runShipped(reserveArgs(dirs, file, ["--reclaim-stale-lock"]), ["confirm"]);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS RESERVE_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("killed after the commit and before the acknowledgement: the rerun verifies it by identity without asking again", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const file = writeReserve(reserveDoc());
    const killed = await runShipped(reserveArgs(dirs, file), ["confirm"], {
      killAfter: /PROGRESS reserve COMMITTED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const rerun = await runShipped(reserveArgs(dirs, file, ["--reclaim-stale-lock"]));
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS RESERVE_READY");
    expect(rerun.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});
