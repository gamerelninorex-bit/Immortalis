/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap owner operations to simulate lost acknowledgements */
// Crash / retry for the additional pre-play finite source admission (RC-16): a lost reply after the owner commit, a commit that never
// reached the store, a failed reopen after the close, a real SIGKILL of the shipped binary, and a failure before and after EVERY mutating
// filesystem operation of the whole command. Each case reopens and re-presents the SAME confirmed source, which must land on exactly the
// campaign an uninterrupted run produces — never a second or altered source, and never a success claimed before the readback.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign, nodeFs } from "@immortalis/engine";
import { instrumentFs } from "@immortalis/testkit";
import {
  LOCALITY_CAMPAIGN,
  SECOND_KEY,
  WORLD_ID,
  addArgs,
  addSource,
  headOf,
  localityCampaign,
  openOrdinary,
  sourceDoc,
  writeSource,
} from "../support/additional-source.ts";
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
 * Makes the source operation of the OPERATOR'S campaign lose its acknowledgement: it commits (or, when `commit` is false, never reaches
 * the store). The scratch package the command admission-checks the source on beforehand is left alone.
 */
function loseReply(commit: boolean) {
  const scratch = new WeakSet<object>();
  const create = CanonicalCampaign.create;
  vi.spyOn(CanonicalCampaign, "create").mockImplementation(async (dir: string, p: any) => {
    const made = await create.call(CanonicalCampaign, dir, p);
    if (made.ok && dir.includes("dry-run")) scratch.add(made.value);
    return made;
  });
  const original = CanonicalCampaign.prototype.establishSourceCondition as (
    ...a: unknown[]
  ) => Promise<unknown>;
  vi.spyOn(CanonicalCampaign.prototype as any, "establishSourceCondition").mockImplementation(
    async function (this: object, ...args: unknown[]) {
      if (scratch.has(this)) return original.apply(this, args);
      if (commit) await original.apply(this, args);
      return unknown;
    },
  );
}

async function reference() {
  const dirs = await localityCampaign();
  expect((await addSource(dirs, writeSource(sourceDoc()))).result.status).toBe(
    "ADDITIONAL_SOURCE_READY",
  );
  return headOf(dirs.campaignDir);
}

describe("a lost acknowledgement of the source commit converges on the uninterrupted campaign", () => {
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
        const file = writeSource(sourceDoc());
        loseReply(commit);
        const first = await addSource(dirs, file);
        expect(first.result.status).toBe("ADDITIONAL_SOURCE_OUTCOME_UNKNOWN");
        vi.restoreAllMocks();

        // the claim is never made on the strength of the reply: the store holds the source exactly when the commit landed
        const held = await openOrdinary(dirs.campaignDir).catch(() => undefined);
        if (held) {
          expect(held.sourceCondition(WORLD_ID, SECOND_KEY) !== undefined).toBe(commit);
          await held.close();
        }
        if (!commit) expect(await headOf(dirs.campaignDir)).toEqual(before);

        crashedHolder(dirs.campaignDir);
        const again = await addSource(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status).toBe("ADDITIONAL_SOURCE_READY");
        expect(again.terminal.asked()).toBe(commit ? 0 : 1);
        expect(await headOf(dirs.campaignDir)).toEqual(expected);
      },
      120_000,
    );

  it("after an uncertain commit, a DIFFERENT source is not admitted on the assumption that the first did not land", async () => {
    const dirs = await localityCampaign();
    loseReply(true);
    expect((await addSource(dirs, writeSource(sourceDoc()))).result.status).toBe(
      "ADDITIONAL_SOURCE_OUTCOME_UNKNOWN",
    );
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const head = await headOf(dirs.campaignDir);

    const other = sourceDoc();
    other.source_key = "src-salt-pan-9";
    const { result, terminal } = await addSource(dirs, writeSource(other), ["confirm"], {
      reclaimStaleLock: true,
    });
    expect(result.status).toBe("SOURCE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("an altered source offered after an uncertain commit is refused as altered, never as a new source", async () => {
    const dirs = await localityCampaign();
    loseReply(true);
    expect((await addSource(dirs, writeSource(sourceDoc()))).result.status).toBe(
      "ADDITIONAL_SOURCE_OUTCOME_UNKNOWN",
    );
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const head = await headOf(dirs.campaignDir);
    const altered = sourceDoc();
    altered.quantity.amount = 46;
    const { result } = await addSource(dirs, writeSource(altered), ["confirm"], {
      reclaimStaleLock: true,
    });
    expect(result.status).toBe("SOURCE_CONFLICT");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("a reopen that fails after the commit is not a success; the rerun verifies by identity", () => {
  it("VERIFICATION_FAILED while the fact is durable, then READY on the rerun without a second write", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const file = writeSource(sourceDoc());
    const open = CanonicalCampaign.open;
    let calls = 0;
    vi.spyOn(CanonicalCampaign, "open").mockImplementation(async (dir: string, o: any) => {
      calls++;
      if (calls >= 2) return { ok: false, error: { code: "REOPEN_LOST", message: "lost" } } as any;
      return open.call(CanonicalCampaign, dir, o);
    });
    const first = await addSource(dirs, file);
    expect(first.result.status).toBe("ADDITIONAL_SOURCE_VERIFICATION_FAILED");
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(expected);

    const again = await addSource(dirs, file, []);
    expect(again.result.status).toBe("ADDITIONAL_SOURCE_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});

describe("a failure before or after EVERY mutating filesystem operation converges on the uninterrupted campaign", () => {
  it("each operation, before and after, then the same source confirmed again", async () => {
    const expected = await reference();
    const file = writeSource(sourceDoc());

    const probeDirs = await localityCampaign();
    const probe = instrumentFs(nodeFs);
    expect(
      (await addSource(probeDirs, file, ["confirm"], { campaignFs: probe.fs })).result.status,
    ).toBe("ADDITIONAL_SOURCE_READY");
    const total = probe.count();
    expect(total).toBeGreaterThan(5);

    const seen = new Set<string>();
    for (let failAt = 1; failAt <= total; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dirs = await localityCampaign();
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const first = await addSource(dirs, file, ["confirm"], { campaignFs: faulty.fs });
        seen.add(first.result.status);
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("SOURCE_CONFLICT");

        crashedHolder(dirs.campaignDir);
        const again = await addSource(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status, `op ${failAt} ${when}`).toBe("ADDITIONAL_SOURCE_READY");
        expect(again.terminal.asked()).toBeLessThanOrEqual(1);
        expect(await headOf(dirs.campaignDir), `op ${failAt} ${when}`).toEqual(expected);
        const c = await openOrdinary(dirs.campaignDir);
        expect(c.verify()).toEqual([]);
        await c.close();
      }
    }
    // the faults genuinely produced refused, ambiguous or unverified outcomes — not only clean runs
    expect(seen.size).toBeGreaterThan(1);
    expect(seen.has("ADDITIONAL_SOURCE_READY") && seen.size === 1).toBe(false);
  }, 900_000);
});

describe("a real kill of the shipped binary", () => {
  it("killed at the console, before anything is written: the rerun reclaims the stale lock and commits once", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const file = writeSource(sourceDoc());
    const killed = await runShipped(addArgs(dirs, file), [], { killAfter: /To confirm/ });
    expect(killed.signal).toBe("SIGKILL");
    expect(await headOf(dirs.campaignDir).catch(() => before)).toEqual(before);

    const locked = await runShipped(addArgs(dirs, file), ["confirm"]);
    expect(locked.code).not.toBe(0);
    expect(locked.stdout).toContain("SESSION_UNAVAILABLE");

    const rerun = await runShipped(addArgs(dirs, file, ["--reclaim-stale-lock"]), ["confirm"]);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS ADDITIONAL_SOURCE_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("killed after the commit and before the acknowledgement: the rerun verifies it by identity without asking again", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const file = writeSource(sourceDoc());
    const killed = await runShipped(addArgs(dirs, file), ["confirm"], {
      killAfter: /PROGRESS source COMMITTED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const rerun = await runShipped(addArgs(dirs, file, ["--reclaim-stale-lock"]));
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS ADDITIONAL_SOURCE_READY");
    expect(rerun.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});
