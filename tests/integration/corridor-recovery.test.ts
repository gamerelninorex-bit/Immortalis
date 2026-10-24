/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap owner operations to simulate lost acknowledgements */
// Crash / retry for the source-qualified local corridor (RC-16). The crash matrix: before the corridor, after the corridor and before the
// reply (a lost acknowledgement), after the close and before the readback (a failed reopen), a definitive owner refusal — plus a real
// SIGKILL of the shipped binary at the console and after the commit, and a failure before AND after EVERY mutating filesystem operation of
// the whole command. Each case reopens and re-presents the SAME confirmed proposal, which must land on exactly the campaign an
// uninterrupted run produces — never a second, altered or substituted corridor, and never a success claimed before the owner-verified
// readback.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign, nodeFs } from "@immortalis/engine";
import { instrumentFs } from "@immortalis/testkit";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  NEW_LOCUS_ID,
  WORLD_ID,
  addCorridor,
  bindPlayer,
  corridorArgs,
  corridorDoc,
  headOf,
  openOrdinary,
  twoLociCampaign,
  writeCorridor,
} from "../support/corridor.ts";
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
 * Makes the owner operation of the OPERATOR'S campaign lose its acknowledgement: it commits (or, when `commit` is false, never reaches
 * the store). The scratch package the command admission-checks the proposal on beforehand is left alone.
 */
function loseReply(commit: boolean) {
  const scratch = new WeakSet<object>();
  let live = 0;
  const create = CanonicalCampaign.create;
  vi.spyOn(CanonicalCampaign, "create").mockImplementation(async (dir: string, p: any) => {
    const made = await create.call(CanonicalCampaign, dir, p);
    if (made.ok && dir.includes("dry-run")) scratch.add(made.value);
    return made;
  });
  const original = CanonicalCampaign.prototype.establishCorridor as (
    ...a: unknown[]
  ) => Promise<unknown>;
  vi.spyOn(CanonicalCampaign.prototype as any, "establishCorridor").mockImplementation(
    async function (this: object, ...args: unknown[]) {
      if (scratch.has(this)) return original.apply(this, args);
      live++;
      if (commit) await original.apply(this, args);
      return unknown;
    },
  );
  return () => live;
}

function refuse() {
  const scratch = new WeakSet<object>();
  let live = 0;
  const create = CanonicalCampaign.create;
  vi.spyOn(CanonicalCampaign, "create").mockImplementation(async (dir: string, p: any) => {
    const made = await create.call(CanonicalCampaign, dir, p);
    if (made.ok && dir.includes("dry-run")) scratch.add(made.value);
    return made;
  });
  const original = CanonicalCampaign.prototype.establishCorridor as (
    ...a: unknown[]
  ) => Promise<unknown>;
  vi.spyOn(CanonicalCampaign.prototype as any, "establishCorridor").mockImplementation(
    async function (this: object, ...args: unknown[]) {
      if (scratch.has(this)) return original.apply(this, args);
      live++;
      return { ok: false, error: { code: "INPUT_INVALID", message: "refused" } };
    },
  );
  return () => live;
}

async function reference() {
  const dirs = await twoLociCampaign();
  expect((await addCorridor(dirs, writeCorridor(corridorDoc()))).result.status).toBe(
    "CORRIDOR_READY",
  );
  return headOf(dirs.campaignDir);
}

async function held(dir: string) {
  const c = await openOrdinary(dir);
  try {
    return {
      corridor: c.corridor(WORLD_ID, LOCUS_ID, NEW_LOCUS_ID) !== undefined,
      violations: c.verify(),
    };
  } finally {
    await c.close();
  }
}

describe("a lost acknowledgement of the commit converges on the uninterrupted campaign", () => {
  const cases: [boolean, string, boolean, number][] = [
    [
      false,
      "before the corridor: it never reached the store; the rerun asks once and commits it",
      false,
      1,
    ],
    [
      true,
      "after the corridor, before the reply: the rerun verifies it by identity without asking again",
      true,
      0,
    ],
  ];
  for (const [commit, name, corridor, asks] of cases)
    it(
      name,
      async () => {
        const expected = await reference();
        const dirs = await twoLociCampaign();
        const file = writeCorridor(corridorDoc());
        const calls = loseReply(commit);
        const first = await addCorridor(dirs, file);
        expect(first.result.status).toBe("CORRIDOR_OUTCOME_UNKNOWN");
        expect(calls()).toBe(1);
        vi.restoreAllMocks();

        // the claim is never made on the strength of the reply: the store holds exactly what landed
        const now = await held(dirs.campaignDir).catch(() => undefined);
        if (now) {
          expect(now.corridor).toBe(corridor);
          expect(now.violations).toEqual([]);
        }

        crashedHolder(dirs.campaignDir);
        const again = await addCorridor(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status).toBe("CORRIDOR_READY");
        expect(again.terminal.asked()).toBe(asks);
        expect(await headOf(dirs.campaignDir)).toEqual(expected);
      },
      120_000,
    );

  it("an altered proposal offered after an unknown outcome is refused, never substituted: only the exact original proposal can finish it", async () => {
    const dirs = await twoLociCampaign();
    const file = writeCorridor(corridorDoc());
    loseReply(true);
    expect((await addCorridor(dirs, file)).result.status).toBe("CORRIDOR_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const altered = corridorDoc();
    altered.corridor.statement = "A different road.";
    const { result, terminal } = await addCorridor(dirs, writeCorridor(altered), [], {
      reclaimStaleLock: true,
    });
    expect(result.status).toBe("CORRIDOR_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await held(dirs.campaignDir)).toEqual({ corridor: true, violations: [] });
  }, 120_000);
});

describe("a known refusal writes nothing", () => {
  it("a definitive refusal of the owner operation leaves the campaign untouched, and the same proposal then succeeds", async () => {
    const expected = await reference();
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const file = writeCorridor(corridorDoc());
    const calls = refuse();
    const first = await addCorridor(dirs, file);
    expect(first.result.status).toBe("CORRIDOR_REFUSED");
    expect(calls()).toBe(1);
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const again = await addCorridor(dirs, file);
    expect(again.result.status).toBe("CORRIDOR_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("a character bound before a resumed attempt closes the path: nothing is written", async () => {
    const dirs = await twoLociCampaign();
    const file = writeCorridor(corridorDoc());
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addCorridor(dirs, file, ["confirm"]);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("a reopen that fails after the commit is not a success; the rerun verifies by identity", () => {
  it("VERIFICATION_FAILED while the corridor is durable, then READY on the rerun without a second write", async () => {
    const expected = await reference();
    const dirs = await twoLociCampaign();
    const file = writeCorridor(corridorDoc());
    const open = CanonicalCampaign.open;
    let calls = 0;
    vi.spyOn(CanonicalCampaign, "open").mockImplementation(async (dir: string, o: any) => {
      calls++;
      if (calls >= 2) return { ok: false, error: { code: "REOPEN_LOST", message: "lost" } } as any;
      return open.call(CanonicalCampaign, dir, o);
    });
    const first = await addCorridor(dirs, file);
    expect(first.result.status).toBe("CORRIDOR_VERIFICATION_FAILED");
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(expected);

    const again = await addCorridor(dirs, file, []);
    expect(again.result.status).toBe("CORRIDOR_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});

describe("a failure before or after EVERY mutating filesystem operation converges on the uninterrupted campaign", () => {
  it("each operation, before and after, then the same proposal confirmed again", async () => {
    const expected = await reference();
    const file = writeCorridor(corridorDoc());

    const probeDirs = await twoLociCampaign();
    const probe = instrumentFs(nodeFs);
    expect(
      (await addCorridor(probeDirs, file, ["confirm"], { campaignFs: probe.fs })).result.status,
    ).toBe("CORRIDOR_READY");
    const total = probe.count();
    expect(total).toBeGreaterThan(4);

    const seen = new Set<string>();
    for (let failAt = 1; failAt <= total; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dirs = await twoLociCampaign();
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const first = await addCorridor(dirs, file, ["confirm"], { campaignFs: faulty.fs });
        seen.add(first.result.status);
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("CORRIDOR_CONFLICT");

        crashedHolder(dirs.campaignDir);
        const again = await addCorridor(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status, `op ${failAt} ${when}`).toBe("CORRIDOR_READY");
        expect(again.terminal.asked()).toBeLessThanOrEqual(1);
        expect(await headOf(dirs.campaignDir), `op ${failAt} ${when}`).toEqual(expected);
        const c = await openOrdinary(dirs.campaignDir);
        expect(c.verify()).toEqual([]);
        await c.close();
      }
    }
    // the faults genuinely produced refused, ambiguous or unverified outcomes — not only clean runs
    expect(seen.size).toBeGreaterThan(1);
  }, 1_800_000);
});

describe("a real kill of the shipped binary", () => {
  it("killed at the console, before anything is written: the rerun reclaims the stale lock and commits once", async () => {
    const expected = await reference();
    const dirs = await twoLociCampaign();
    const before = await headOf(dirs.campaignDir);
    const file = writeCorridor(corridorDoc());
    const killed = await runShipped(corridorArgs(dirs, file), [], { killAfter: /To confirm/ });
    expect(killed.signal).toBe("SIGKILL");
    expect(await headOf(dirs.campaignDir).catch(() => before)).toEqual(before);

    const locked = await runShipped(corridorArgs(dirs, file), ["confirm"]);
    expect(locked.code).not.toBe(0);
    expect(locked.stdout).toContain("SESSION_UNAVAILABLE");

    const rerun = await runShipped(corridorArgs(dirs, file, ["--reclaim-stale-lock"]), ["confirm"]);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS CORRIDOR_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("killed after the corridor and before the acknowledgement: the rerun verifies it by identity without asking again", async () => {
    const expected = await reference();
    const dirs = await twoLociCampaign();
    const file = writeCorridor(corridorDoc());
    const killed = await runShipped(corridorArgs(dirs, file), ["confirm"], {
      killAfter: /PROGRESS corridor COMMITTED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const rerun = await runShipped(corridorArgs(dirs, file, ["--reclaim-stale-lock"]));
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS CORRIDOR_READY");
    expect(rerun.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});
