// H-01 — Save-game single-writer lock safety (IM-17 prototype file package; IM-11 atomic commit / canonical integrity; RC-16 recovery).
// MECHANISM-ONLY integrity acceptance: the source of truth here is a process/filesystem lock and an authorized writer, not a game fact.
// It is NOT First Playable, provider durability (IA-07 BLOCKED, CAL-09 UNRUN) or production multi-writer acceptance. The LOCK is a
// technical file; no manifest/journal/state format, owner fact or receipt identity is touched.
//
// Every cross-process claim below uses real, separately scheduled OS processes (fixtures/writer-lock-process.ts) and the real
// `nodeFs`; the interleavings are forced with marker files, and crashes are real SIGKILLs at a chosen mutating operation.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileCampaign, nodeFs, openFileCampaign, type FsOps } from "@immortalis/engine";
import { TEST_OWNERS, group, instrumentFs, write } from "@immortalis/testkit";
import { copyDir, snapshotDir, tempDir } from "../support/tmp.ts";

const C = "campaign-writer-lock-1";
const OPTS = { owners: TEST_OWNERS };
const FIXTURE = join(import.meta.dirname, "fixtures", "writer-lock-process.ts");

afterEach(() => vi.restoreAllMocks());

async function must<T>(
  p: Promise<{ ok: true; value: T } | { ok: false; error: unknown }>,
): Promise<T> {
  const r = await p;
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

/** A closed package with three committed groups: real history for every test below to preserve. */
async function seed(): Promise<string> {
  const dir = tempDir("immortalis-wl-");
  const s = await must(createFileCampaign(dir, { campaignId: C, ...OPTS, buildId: "seed" }));
  await must(
    s.commit(group(C, 1, [write("fact/a", { n: 1 }), write("fact/b", "bee", { unit: "unit-x" })])),
  );
  for (const n of [2, 3]) {
    await must(s.commit(group(C, n, [write("fact/a", { n }, { expected_version: n - 1 })])));
  }
  await s.close();
  return dir;
}

const TEMPLATE = await seed();
const freshCopy = () => copyDir(TEMPLATE);

/** A process id that provably belongs to no running process. */
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;
const legacyBody = (pid: number) => `${JSON.stringify({ pid, campaign_id: C })}\n`;
const LOCK = (dir: string) => join(dir, "LOCK");
const lockFamily = (dir: string) =>
  readdirSync(dir).filter((f) => f === "LOCK" || f.startsWith("LOCK."));
const canonicalFiles = (dir: string) =>
  readdirSync(dir)
    .filter((f) => !f.startsWith("LOCK"))
    .sort();
const holderPid = (dir: string): number | undefined =>
  existsSync(LOCK(dir)) ? JSON.parse(readFileSync(LOCK(dir), "utf8")).pid : undefined;

async function headOf(dir: string) {
  const s = await must(openFileCampaign(dir, OPTS));
  const h = s.head();
  await s.close();
  return { revision: h.revision, state: h.state_sha256, journal: h.journal_head_sha256 };
}
const ORIGINAL_HEAD = await headOf(TEMPLATE);
const codeOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code);

// --- real-process contenders ----------------------------------------------------------------------

interface ChildConfig {
  readonly dir: string;
  readonly tag: string;
  readonly sync: string;
  readonly reclaim: boolean;
  readonly pauseAfterLockRead?: boolean;
  readonly crash?: { readonly at: number; readonly when: "before" | "after" };
  readonly hold?: boolean;
  readonly closeAfterOpen?: boolean;
}
interface ChildResult {
  tag: string;
  pid: number;
  ok: boolean;
  code?: string;
  ops: number;
}

const waitFor = async (path: string, ms = 60_000) => {
  const deadline = Date.now() + ms;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};

function launch(cfg: ChildConfig) {
  const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", FIXTURE], {
    env: { ...process.env, WL_CONFIG: JSON.stringify(cfg) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += String(d)));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.on("exit", (code, signal) => resolve({ code, signal })),
  );
  const marker = (name: string) => join(cfg.sync, `${cfg.tag}.${name}`);
  return {
    pid: child.pid!,
    exited,
    stderr: () => stderr,
    go: () => writeFileSync(marker("go"), ""),
    finish: () => writeFileSync(marker("finish"), ""),
    observed: () => waitFor(marker("observed")),
    result: async (): Promise<ChildResult> => {
      await waitFor(marker("result"));
      return JSON.parse(readFileSync(marker("result"), "utf8")) as ChildResult;
    },
    finished: () => waitFor(marker("exit")),
    kill: () => child.kill("SIGKILL"),
  };
}
type Child = ReturnType<typeof launch>;

const contenders = (dir: string, tags: string[], over: Partial<ChildConfig> = {}) => {
  const sync = tempDir("immortalis-wl-sync-");
  return {
    sync,
    children: tags.map((tag) => launch({ dir, tag, sync, reclaim: true, ...over })) as Child[],
  };
};

const deadLock = (dir: string) => writeFileSync(LOCK(dir), legacyBody(deadPid()));

// ===================================================================================================
describe("H-01: two real processes cannot both become the writer of one campaign", () => {
  for (const order of [
    ["A", "B"],
    ["B", "A"],
  ] as const) {
    it(`both observe the same dead holder; ${order[0]} reclaims first, ${order[1]} acts on its stale observation: exactly one owns`, async () => {
      const dir = freshCopy();
      deadLock(dir);
      const { sync, children } = contenders(dir, ["A", "B"], {
        pauseAfterLockRead: true,
        hold: true,
      });
      const byTag = { A: children[0]!, B: children[1]! };
      // both are now holding the SAME stale observation of the dead holder's LOCK
      await Promise.all([byTag.A.observed(), byTag.B.observed()]);

      const [first, second] = order;
      byTag[first].go();
      const firstResult = await byTag[first].result();
      expect(firstResult.ok, byTag[first].stderr()).toBe(true);
      expect(holderPid(dir)).toBe(byTag[first].pid);

      // the loser now resumes and acts on the observation it made BEFORE the winner took the lock
      byTag[second].go();
      const secondResult = await byTag[second].result();
      expect(secondResult.ok, "a stale observation must never displace a live writer").toBe(false);
      expect(secondResult.code).toBe("LOCKED");

      // the non-winner did not delete or replace the winner's lock, and the winner still owns it
      expect(holderPid(dir)).toBe(byTag[first].pid);
      expect(existsSync(join(sync, `${second}.finish`))).toBe(false);

      byTag[first].finish();
      await byTag[first].finished();
      await byTag[second].exited;
      expect(lockFamily(dir).filter((f) => f !== "LOCK")).toEqual([]);
      expect(existsSync(LOCK(dir))).toBe(false);
      // the winner could close and the history it was given is exactly the original
      expect(await headOf(dir)).toEqual(ORIGINAL_HEAD);
    }, 120_000);
  }

  it("stress: independent, unsynchronised contenders over one stale lock — exactly one wins every round", async () => {
    for (let round = 0; round < 8; round++) {
      const dir = freshCopy();
      deadLock(dir);
      const { children } = contenders(dir, ["A", "B", "C"], { hold: true });
      const results = await Promise.all(children.map((c) => c.result()));
      const winners = results.filter((r) => r.ok);
      expect(winners, `round ${round}: ${JSON.stringify(results)}`).toHaveLength(1);
      for (const loser of results.filter((r) => !r.ok)) expect(loser.code).toBe("LOCKED");
      expect(holderPid(dir)).toBe(winners[0]!.pid);
      const winner = children.find((c) => c.pid === winners[0]!.pid)!;
      winner.finish();
      await Promise.all(children.map((c) => c.exited));
      expect(existsSync(LOCK(dir))).toBe(false);
      expect(await headOf(dir)).toEqual(ORIGINAL_HEAD);
    }
  }, 300_000);

  it("a process that holds the lock refuses both an ordinary and a reclaiming opener, and survives the attempts", async () => {
    const dir = freshCopy();
    const { children } = contenders(dir, ["live"], { reclaim: false, hold: true });
    const live = children[0]!;
    expect((await live.result()).ok, live.stderr()).toBe(true);
    for (const reclaimStaleLock of [false, true]) {
      const r = await openFileCampaign(dir, { ...OPTS, reclaimStaleLock });
      expect(codeOf(r)).toBe("LOCKED");
      expect(!r.ok && r.error.details).toMatchObject({ holder_pid: live.pid, holder_alive: true });
    }
    expect(holderPid(dir)).toBe(live.pid);
    live.finish();
    await live.exited;
    expect(existsSync(LOCK(dir))).toBe(false);
  }, 120_000);

  it("a holder that is really killed leaves a lock that is refused by default and taken over only on request", async () => {
    const dir = freshCopy();
    const { children } = contenders(dir, ["victim"], { reclaim: false, hold: true });
    const victim = children[0]!;
    expect((await victim.result()).ok).toBe(true);
    victim.kill();
    await victim.exited;
    expect(holderPid(dir)).toBe(victim.pid);

    const refused = await openFileCampaign(dir, OPTS);
    expect(codeOf(refused)).toBe("LOCKED");
    expect(!refused.ok && refused.error.details).toMatchObject({
      holder_pid: victim.pid,
      holder_alive: false,
    });
    const taken = await must(openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true }));
    expect(taken.head().revision).toBe(3);
    await taken.close();
    expect(lockFamily(dir)).toEqual([]);
  }, 120_000);
});

// ===================================================================================================
describe("H-01: dead-holder policy is unchanged and everything unprovable fails closed", () => {
  it("the default refuses a dead holder; opt-in reclaims it SEQUENTIALLY and the second open then refuses", async () => {
    const dir = freshCopy();
    deadLock(dir);
    const refused = await openFileCampaign(dir, OPTS);
    expect(codeOf(refused)).toBe("LOCKED");
    expect(!refused.ok && refused.error.details).toMatchObject({ holder_alive: false });

    const a = await must(openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true }));
    expect(a.head().revision).toBe(3);
    const b = await openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true });
    expect(codeOf(b)).toBe("LOCKED"); // a live in-process writer is not stealable even with reclaim
    await a.close();
    expect(lockFamily(dir)).toEqual([]);
    expect(await headOf(dir)).toEqual(ORIGINAL_HEAD);
  });

  const unprovable: [string, string][] = [
    ["empty file", ""],
    ["not JSON", "garbage\n"],
    ["JSON without a pid", `${JSON.stringify({ campaign_id: C })}\n`],
    ["string pid", `${JSON.stringify({ pid: "1234", campaign_id: C })}\n`],
    [
      "negative pid (kill(-1) would signal everything)",
      `${JSON.stringify({ pid: -1, campaign_id: C })}\n`,
    ],
    [
      "zero pid (kill(0) addresses the process group)",
      `${JSON.stringify({ pid: 0, campaign_id: C })}\n`,
    ],
    ["fractional pid", `${JSON.stringify({ pid: 1.5, campaign_id: C })}\n`],
    [
      "dead pid recorded on ANOTHER host (liveness is unverifiable here)",
      `${JSON.stringify({ pid: 2 ** 22 + 12345, campaign_id: C, host: "some-other-host", nonce: "00000000-0000-4000-8000-000000000000" })}\n`,
    ],
  ];
  for (const [name, body] of unprovable) {
    it(`fails closed even with reclaim: ${name}`, async () => {
      const dir = freshCopy();
      writeFileSync(LOCK(dir), body);
      for (const reclaimStaleLock of [false, true]) {
        expect(codeOf(await openFileCampaign(dir, { ...OPTS, reclaimStaleLock }))).toBe("LOCKED");
      }
      expect(readFileSync(LOCK(dir), "utf8")).toBe(body); // untouched
      expect(lockFamily(dir)).toEqual(["LOCK"]);
    });
  }

  it("fails closed when liveness cannot be established (EPERM counts as alive; any other error is unknown)", async () => {
    for (const [errno, alive] of [
      ["EPERM", true],
      ["EINVAL", null],
    ] as const) {
      const dir = freshCopy();
      writeFileSync(LOCK(dir), legacyBody(2 ** 22 + 12345));
      const kill = vi.spyOn(process, "kill").mockImplementation(() => {
        throw Object.assign(new Error(errno), { code: errno });
      });
      const r = await openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true });
      kill.mockRestore();
      expect(codeOf(r), errno).toBe("LOCKED");
      expect(!r.ok && r.error.details).toMatchObject({ holder_alive: alive });
      expect(readFileSync(LOCK(dir), "utf8")).toBe(legacyBody(2 ** 22 + 12345));
    }
  });

  it("a lock-family file in the directory is never canonical data or reported residue", async () => {
    const dir = freshCopy();
    for (const stray of [
      "LOCK.claim.11111111-1111-4111-8111-111111111111",
      "LOCK.123.abcdef.tmp",
    ]) {
      writeFileSync(join(dir, stray), "{}\n");
    }
    writeFileSync(join(dir, "notes.txt"), "not a lock file\n");
    const s = await must(openFileCampaign(dir, OPTS));
    expect(s.residue.other_files).toEqual(["notes.txt"]); // the lock family is not residue; real residue still is
    expect(s.head().revision).toBe(3);
    await s.close();
    expect(canonicalFiles(dir)).toEqual(canonicalFiles(TEMPLATE).concat("notes.txt").sort());
  });
});

// ===================================================================================================
describe("H-01: ownership — a former handle can never release or write as the writer", () => {
  const journalState = (dir: string) => {
    const snap = snapshotDir(dir);
    delete snap["LOCK"];
    return snap;
  };

  it("late close() by a handle whose lock was removed and re-taken never releases the successor", async () => {
    const dir = freshCopy();
    const a = await must(openFileCampaign(dir, OPTS));
    rmSync(LOCK(dir)); // authority is lost out from under A (crash recovery elsewhere, operator action, ...)
    const b = await must(openFileCampaign(dir, OPTS));
    const successorLock = readFileSync(LOCK(dir), "utf8");

    const before = journalState(dir);
    const refused = await a.commit(
      group(C, 4, [write("fact/a", { n: 4 }, { expected_version: 3 })]),
    );
    expect(!refused.ok && refused.error.code).toBe("STORE_CLOSED");
    expect(!refused.ok && refused.error.details).toMatchObject({ reason: "WRITER_LOCK_LOST" });
    expect(journalState(dir)).toEqual(before); // canonical journal, state and manifest unchanged

    await a.close(); // late release
    await a.close(); // idempotent
    expect(readFileSync(LOCK(dir), "utf8")).toBe(successorLock);
    expect((await openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true })).ok).toBe(false);

    // the successor is unaffected and is the only writer
    expect(
      (await b.commit(group(C, 4, [write("fact/a", { n: 4 }, { expected_version: 3 })]))).ok,
    ).toBe(true);
    await b.close();
    expect(lockFamily(dir)).toEqual([]);
  });

  it("a handle whose dead-looking lock was reclaimed is refused for every commit (even a replay) and cannot release the new owner", async () => {
    const dir = freshCopy();
    const a = await must(openFileCampaign(dir, OPTS));
    // A is "presumed dead": its lock is replaced by a dead holder's, which an opted-in opener then reclaims
    writeFileSync(LOCK(dir), legacyBody(deadPid()));
    const b = await must(openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true }));
    const owner = readFileSync(LOCK(dir), "utf8");
    const before = journalState(dir);

    const replay = await a.commit(
      group(C, 1, [write("fact/a", { n: 1 }), write("fact/b", "bee", { unit: "unit-x" })]),
    );
    expect(!replay.ok && replay.error.code).toBe("STORE_CLOSED");
    const fresh = await a.commit(group(C, 9, [write("fact/z", 1)]));
    expect(!fresh.ok && fresh.error.code).toBe("STORE_CLOSED");
    await a.close();
    expect(readFileSync(LOCK(dir), "utf8")).toBe(owner);
    expect(journalState(dir)).toEqual(before);
    await b.close();
  });

  it("a handle whose ownership cannot be PROVEN does not commit (unreadable lock)", async () => {
    const dir = freshCopy();
    let unreadable = false;
    const fs: FsOps = {
      ...nodeFs,
      readFile: async (p) => {
        if (unreadable && p.endsWith("/LOCK"))
          throw Object.assign(new Error("EIO"), { code: "EIO" });
        return nodeFs.readFile(p);
      },
    };
    const s = await must(openFileCampaign(dir, { ...OPTS, fs }));
    const before = journalState(dir);
    unreadable = true;
    const r = await s.commit(group(C, 4, [write("fact/a", { n: 4 }, { expected_version: 3 })]));
    expect(!r.ok && r.error.code).toBe("STORE_CLOSED");
    expect(!r.ok && r.error.details).toMatchObject({ reason: "WRITER_LOCK_UNVERIFIED" });
    expect(journalState(dir)).toEqual(before);
    unreadable = false;
    // nothing was lost permanently: once ownership is provable again the same handle may commit
    expect(
      (await s.commit(group(C, 4, [write("fact/a", { n: 4 }, { expected_version: 3 })]))).ok,
    ).toBe(true);
    await s.close();
  });

  it("delayed cleanup of a FAILED open never removes a successor's lock", async () => {
    const dir = freshCopy();
    const journal = join(dir, "journal.jsonl");
    writeFileSync(journal, readFileSync(journal).subarray(0, 10)); // load will fail: JOURNAL_TRUNCATED
    const successor = `${JSON.stringify({ pid: process.pid, campaign_id: C, nonce: "11111111-1111-4111-8111-111111111111", host: (await import("node:os")).hostname() })}\n`;
    const fs: FsOps = {
      ...nodeFs,
      readFile: async (p) => {
        if (p.endsWith("/journal.jsonl")) {
          rmSync(LOCK(dir)); // between this open's lock and its failure cleanup, a successor takes over
          writeFileSync(LOCK(dir), successor);
        }
        return nodeFs.readFile(p);
      },
    };
    const failed = await openFileCampaign(dir, { ...OPTS, fs });
    expect(codeOf(failed)).toBe("JOURNAL_TRUNCATED");
    expect(readFileSync(LOCK(dir), "utf8")).toBe(successor);
    expect(lockFamily(dir)).toEqual(["LOCK"]);
  });

  it("a failed open (without a successor) releases its own lock and leaves no lock-family residue", async () => {
    const dir = freshCopy();
    rmSync(join(dir, "journal.jsonl"));
    expect(codeOf(await openFileCampaign(dir, OPTS))).toBe("MISSING_JOURNAL");
    expect(lockFamily(dir)).toEqual([]);
  });

  it("a campaign being CREATED is under the same discipline: a failed create releases only its own lock", async () => {
    const dir = tempDir("immortalis-wl-create-");
    const fail = instrumentFs(nodeFs, { failAt: 3, when: "before" });
    const r = await createFileCampaign(join(dir, "c"), { campaignId: C, ...OPTS, fs: fail.fs });
    expect(!r.ok && r.error.code).toBe("CREATE_FAILED");
    expect(lockFamily(join(dir, "c"))).toEqual([]);
  });
});

// ===================================================================================================
describe("H-01: interrupted arbitration is recoverable, never split, never permanently blocking", () => {
  /**
   * A real SIGKILL at each mutating filesystem operation of (a) a stale reclaim followed by open+close, and
   * (b) a plain open+close. Afterwards TWO simultaneous recovery contenders race: exactly one becomes the writer,
   * it sees the original history, and nothing outside the lock family is ever disturbed.
   */
  for (const scenario of ["stale-reclaim", "open-close"] as const) {
    it(`SIGKILL at every mutating op of ${scenario}`, async () => {
      const prepare = () => {
        const dir = freshCopy();
        if (scenario === "stale-reclaim") deadLock(dir);
        return dir;
      };
      const counter = contenders(prepare(), ["count"], {
        reclaim: scenario === "stale-reclaim",
        closeAfterOpen: true,
        crash: { at: 0, when: "before" },
      });
      await counter.children[0]!.finished();
      await counter.children[0]!.finished();
      const total = JSON.parse(readFileSync(join(counter.sync, "count.exit"), "utf8"))
        .ops as number;
      expect(total).toBeGreaterThanOrEqual(scenario === "stale-reclaim" ? 8 : 4);

      let killed = 0;
      for (let at = 1; at <= total; at++) {
        for (const when of ["before", "after"] as const) {
          const dir = prepare();
          const crashing = contenders(dir, ["crash"], {
            reclaim: scenario === "stale-reclaim",
            closeAfterOpen: true,
            crash: { at, when },
          }).children[0]!;
          const exit = await crashing.exited;
          if (exit.signal === "SIGKILL") killed++;
          else expect(exit.code, crashing.stderr()).toBe(0); // the op failed anyway (EEXIST) so no crash fired
          const label = `${scenario} op ${at} ${when}`;

          // what a crash may leave: only lock-family files beside the untouched canonical package
          expect(canonicalFiles(dir), label).toEqual(canonicalFiles(TEMPLATE));
          expect(await headOnlyIfFree(dir), label).toBeDefined();

          // default open never produces a second writer next to a dead holder: it refuses or the lock is simply gone
          // (checked via the real contenders below, which are what race)
          const race = contenders(dir, ["X", "Y"], { reclaim: true, hold: true });
          const results = await Promise.all(race.children.map((c) => c.result()));
          const winners = results.filter((r) => r.ok);
          expect(winners, `${label}: ${JSON.stringify(results)}`).toHaveLength(1);
          expect(results.find((r) => !r.ok)!.code, label).toBe("LOCKED");
          expect(holderPid(dir), label).toBe(winners[0]!.pid);
          race.children.find((c) => c.pid === winners[0]!.pid)!.finish();
          await Promise.all(race.children.map((c) => c.exited));

          // the winner released cleanly; the history is exactly the original; any leftover is inert lock-family
          expect(existsSync(LOCK(dir)), label).toBe(false);
          expect(canonicalFiles(dir), label).toEqual(canonicalFiles(TEMPLATE));
          expect(await headOf(dir), label).toEqual(ORIGINAL_HEAD);
          const after = await must(openFileCampaign(dir, OPTS));
          expect(after.residue.other_files, label).toEqual([]);
          await after.close();
        }
      }
      expect(killed).toBeGreaterThan(0);
    }, 600_000);
  }

  /** Reads nothing that changes state; asserts the package itself is still a loadable campaign (via a copy). */
  async function headOnlyIfFree(dir: string) {
    const probe = copyDir(dir);
    rmSync(LOCK(probe), { force: true });
    for (const f of lockFamily(probe)) rmSync(join(probe, f), { force: true });
    return headOf(probe);
  }

  it("an ABANDONED arbiter (claimant killed mid-claim) does not block recovery, and two recoverers still yield one owner", async () => {
    const dir = freshCopy();
    deadLock(dir);
    // stage the exact state a reclaimer killed right after taking its claim leaves behind
    const stale = JSON.parse(readFileSync(LOCK(dir), "utf8"));
    expect(stale.nonce).toBeUndefined(); // legacy instance: identified by content
    const gone = deadPid();
    // claim names embed the instance id, which for a legacy body is a content hash: find it by letting a reclaimer die
    const crasher = contenders(dir, ["crash"], { reclaim: true, crash: { at: 3, when: "before" } })
      .children[0]!;
    expect((await crasher.exited).signal).toBe("SIGKILL");
    const claims = lockFamily(dir).filter((f) => f.startsWith("LOCK.claim."));
    expect(claims).toHaveLength(1);
    const claim = JSON.parse(readFileSync(join(dir, claims[0]!), "utf8"));
    expect(claim.pid).toBe(crasher.pid);
    // ...and make the abandoned arbiter ITSELF carry a dead-but-different holder to prove nested recovery
    writeFileSync(join(dir, claims[0]!), JSON.stringify({ ...claim, pid: gone }) + "\n");

    const race = contenders(dir, ["X", "Y", "Z"], { reclaim: true, hold: true });
    const results = await Promise.all(race.children.map((c) => c.result()));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    race.children.find((c) => c.pid === results.find((r) => r.ok)!.pid)!.finish();
    await Promise.all(race.children.map((c) => c.exited));
    expect(await headOf(dir)).toEqual(ORIGINAL_HEAD);
  }, 120_000);

  it("an arbiter held by a LIVE process is respected: a reclaimer refuses rather than overriding it", async () => {
    const dir = freshCopy();
    deadLock(dir);
    // the live arbiter is this very process, named exactly as a reclaimer of this legacy instance would name it
    const crasher = contenders(dir, ["crash"], { reclaim: true, crash: { at: 3, when: "before" } })
      .children[0]!;
    await crasher.exited;
    const claimFile = lockFamily(dir).find((f) => f.startsWith("LOCK.claim."))!;
    const claim = JSON.parse(readFileSync(join(dir, claimFile), "utf8"));
    writeFileSync(join(dir, claimFile), JSON.stringify({ ...claim, pid: process.pid }) + "\n");
    const r = await openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true });
    expect(codeOf(r)).toBe("LOCKED");
    expect(!r.ok && r.error.message).toMatch(/arbitration/);
    expect(existsSync(LOCK(dir))).toBe(true); // the dead holder's lock was not removed under a live arbiter
  }, 120_000);

  it("injected filesystem errors at every mutating op of reclaim+close leave a correct refusal or a safely recoverable state", async () => {
    const probe = freshCopy();
    deadLock(probe);
    const counting = instrumentFs(nodeFs);
    const s = await must(
      openFileCampaign(probe, { ...OPTS, reclaimStaleLock: true, fs: counting.fs }),
    );
    await s.close();
    const total = counting.count();
    expect(total).toBeGreaterThanOrEqual(8);

    const seen = new Set<string>();
    for (let failAt = 1; failAt <= total; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = freshCopy();
        deadLock(dir);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        let outcome: string;
        try {
          const r = await openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true, fs: faulty.fs });
          outcome = codeOf(r);
          if (r.ok) {
            await r.value.close();
          }
        } catch {
          outcome = "THROWN"; // a failing release surfaces to the caller, as close() always has
        }
        seen.add(outcome);
        const label = `op ${failAt} ${when}: ${outcome}`;
        expect(["OK", "LOCKED", "THROWN"], label).toContain(outcome);
        // this in-process test cannot die, so a lock left naming THIS live pid stands for the dead process it models
        if (existsSync(LOCK(dir)) && holderPid(dir) === process.pid) {
          const body = JSON.parse(readFileSync(LOCK(dir), "utf8"));
          writeFileSync(LOCK(dir), `${JSON.stringify({ ...body, pid: deadPid() })}\n`);
        }
        for (const f of lockFamily(dir).filter((x) => x.startsWith("LOCK.claim."))) {
          const body = JSON.parse(readFileSync(join(dir, f), "utf8"));
          writeFileSync(join(dir, f), `${JSON.stringify({ ...body, pid: deadPid() })}\n`);
        }
        const again = await openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true });
        expect(again.ok, label).toBe(true);
        if (again.ok) {
          expect(again.value.head().revision, label).toBe(3);
          await again.value.close();
        }
        expect(await headOf(dir), label).toEqual(ORIGINAL_HEAD);
      }
    }
    expect(seen.has("OK")).toBe(true);
    expect(seen.has("LOCKED")).toBe(true);
  }, 300_000);
});

// ===================================================================================================
describe("H-01: the exclusive-create primitive itself", () => {
  it("is exclusive, publishes complete content, and leaves no temp file behind", async () => {
    const dir = tempDir("immortalis-wl-prim-");
    await nodeFs.createExclusive(join(dir, "X"), "complete\n");
    expect(readFileSync(join(dir, "X"), "utf8")).toBe("complete\n");
    await expect(nodeFs.createExclusive(join(dir, "X"), "other\n")).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(readFileSync(join(dir, "X"), "utf8")).toBe("complete\n"); // the loser changed nothing
    expect(readdirSync(dir)).toEqual(["X"]);
  });

  it("many racing creators: exactly one wins and every loser sees EEXIST", async () => {
    const dir = tempDir("immortalis-wl-race-");
    mkdirSync(dir, { recursive: true });
    const settled = await Promise.allSettled(
      Array.from({ length: 24 }, (_, i) => nodeFs.createExclusive(join(dir, "X"), `writer-${i}\n`)),
    );
    expect(settled.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    for (const s of settled) {
      if (s.status === "rejected") expect((s.reason as NodeJS.ErrnoException).code).toBe("EEXIST");
    }
    expect(readdirSync(dir)).toEqual(["X"]);
  });
});

// ===================================================================================================
describe("H-01: a thrown I/O failure on ANY open path releases only this attempt's own lock", () => {
  for (const [name, hit] of [
    [
      "reading the journal",
      (op: string, p: string) => op === "readFile" && p.endsWith("/journal.jsonl"),
    ],
    [
      "reading the manifest",
      (op: string, p: string) => op === "readFile" && p.endsWith("/manifest.json"),
    ],
    ["listing the directory for residue", (op: string) => op === "list"],
  ] as const) {
    it(`a transient error ${name} rejects the open, strands no lock, and the same process can reopen at once`, async () => {
      const dir = freshCopy();
      let armed = true;
      const flaky: FsOps = {
        ...nodeFs,
        readFile: async (p) => {
          if (armed && hit("readFile", p)) {
            armed = false;
            throw Object.assign(new Error("EIO: transient"), { code: "EIO" });
          }
          return nodeFs.readFile(p);
        },
        list: async (d) => {
          if (armed && hit("list", d)) {
            armed = false;
            throw Object.assign(new Error("EIO: transient"), { code: "EIO" });
          }
          return nodeFs.list(d);
        },
      };
      // either surfaces as the open rejecting (the I/O error escapes load) or as a typed refusal (load maps it): both
      // are failed opens, and neither may strand the lock
      const first = await openFileCampaign(dir, { ...OPTS, fs: flaky }).then(
        (r) => (r.ok ? "OPENED" : r.error.code),
        (e: Error) => (/EIO/.test(e.message) ? "REJECTED" : "OTHER"),
      );
      expect(["REJECTED", "MALFORMED"], first).toContain(first);
      expect(armed, "the injected failure must actually have been hit").toBe(false);
      expect(lockFamily(dir)).toEqual([]); // no LOCK naming this live pid is left behind
      const again = await must(openFileCampaign(dir, OPTS)); // ordinary open, no reclaim
      expect(again.head().revision).toBe(3);
      await again.close();
      expect(lockFamily(dir)).toEqual([]);
    });
  }

  it("a thrown failure does not remove a successor's lock either", async () => {
    const dir = freshCopy();
    const successor = `${JSON.stringify({ pid: process.pid, campaign_id: C, nonce: "22222222-2222-4222-8222-222222222222", host: hostname() })}\n`;
    const fs: FsOps = {
      ...nodeFs,
      readFile: async (p) => {
        if (p.endsWith("/journal.jsonl")) {
          rmSync(LOCK(dir));
          writeFileSync(LOCK(dir), successor);
          throw Object.assign(new Error("EIO: transient"), { code: "EIO" });
        }
        return nodeFs.readFile(p);
      },
    };
    await expect(openFileCampaign(dir, { ...OPTS, fs })).rejects.toThrow(/EIO/);
    expect(readFileSync(LOCK(dir), "utf8")).toBe(successor);
  });
});

// ===================================================================================================
describe("H-01: recovery from a chain of abandoned arbiters has no depth limit", () => {
  const sha32 = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  /**
   * The on-disk state of N successive recoverers each killed right after taking the claim on its predecessor's
   * (dead) claim: LOCK (dead legacy holder T) <- claim.T held by dead n1 <- claim.n1 held by dead n2 <- ... <- claim.n(N-1) held by dead nN.
   */
  function abandonedChain(dir: string, links: number) {
    const pid = deadPid();
    const body = legacyBody(pid);
    writeFileSync(LOCK(dir), body);
    let claimed = `legacy-${sha32(body)}`;
    for (let i = 1; i <= links; i++) {
      const nonce = uuid(i);
      writeFileSync(
        join(dir, `LOCK.claim.${claimed}`),
        `${JSON.stringify({ pid, claims: claimed, nonce, host: hostname() })}\n`,
      );
      claimed = nonce;
    }
  }

  for (const links of [1, 7, 40]) {
    it(`${links} dead arbiters deep (past any fixed cap) are all recovered by an opted-in opener`, async () => {
      const dir = freshCopy();
      abandonedChain(dir, links);
      expect(lockFamily(dir)).toHaveLength(links + 1);
      const refused = await openFileCampaign(dir, OPTS); // the default still refuses: opt-in is unchanged
      expect(codeOf(refused)).toBe("LOCKED");
      const s = await must(openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true }));
      expect(s.head().revision).toBe(3);
      await s.close();
      expect(await headOf(dir)).toEqual(ORIGINAL_HEAD);
    });
  }

  it("three real processes recovering from a 12-deep abandoned chain: exactly one becomes the writer", async () => {
    const dir = freshCopy();
    abandonedChain(dir, 12);
    const race = contenders(dir, ["X", "Y", "Z"], { reclaim: true, hold: true });
    const results = await Promise.all(race.children.map((c) => c.result()));
    expect(
      results.filter((r) => r.ok),
      JSON.stringify(results),
    ).toHaveLength(1);
    for (const loser of results.filter((r) => !r.ok)) expect(loser.code).toBe("LOCKED");
    race.children.find((c) => c.pid === results.find((r) => r.ok)!.pid)!.finish();
    await Promise.all(race.children.map((c) => c.exited));
    expect(await headOf(dir)).toEqual(ORIGINAL_HEAD);
  }, 120_000);

  it("a corrupted, self-referencing arbiter chain is refused (fail closed) rather than looped on", async () => {
    const dir = freshCopy();
    const pid = deadPid();
    const body = legacyBody(pid);
    writeFileSync(LOCK(dir), body);
    const t = `legacy-${sha32(body)}`;
    const loop = (claimed: string, nonce: string) =>
      writeFileSync(
        join(dir, `LOCK.claim.${claimed}`),
        `${JSON.stringify({ pid, claims: claimed, nonce, host: hostname() })}\n`,
      );
    loop(t, uuid(1));
    loop(uuid(1), uuid(1)); // an arbiter that names itself
    const r = await openFileCampaign(dir, { ...OPTS, reclaimStaleLock: true });
    expect(codeOf(r)).toBe("LOCKED");
    expect(readFileSync(LOCK(dir), "utf8")).toBe(body);
  });
});

// ===================================================================================================
describe("H-01: environment contract — atomic exclusive publication is required, never silently weakened", () => {
  it("on a filesystem without hard links, creating and opening a campaign REFUSE explicitly and leave nothing blocking", async () => {
    const primitiveDir = tempDir("immortalis-wl-nolink-a-");
    const createDir = join(tempDir("immortalis-wl-nolink-b-"), "c");
    const openDir = freshCopy();
    const out = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--no-warnings",
        join(import.meta.dirname, "fixtures", "no-hardlink-process.ts"),
        primitiveDir,
        createDir,
        openDir,
      ],
      { encoding: "utf8" },
    );
    expect(out.status, out.stderr).toBe(0);
    const r = JSON.parse(out.stdout.trim().split("\n").pop()!);
    // the primitive says so explicitly and publishes nothing — no empty or torn LOCK, no temp residue
    expect(r.primitive.code).toBe("EATOMIC_PUBLISH_UNSUPPORTED");
    expect(r.primitive.message).toMatch(/atomic exclusive publication unsupported/);
    expect(r.primitiveFiles).toEqual([]);
    // creating a campaign there fails explicitly, with no lock left behind
    expect(r.created).toBe("CREATE_FAILED");
    expect(r.createdFiles).toEqual([]);
    // opening an existing campaign there is an explicit LOCKED refusal naming the cause, with no stranded lock
    expect(r.opened).toBe("LOCKED");
    expect(r.openedCause).toMatch(/atomic exclusive publication unsupported/);
    expect(r.openedLockFamily).toEqual([]);
  });
});
