/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap owner operations to simulate lost acknowledgements */
// Crash / retry for the additional pre-play locality with one finite source (RC-16). The crash matrix: before the locus, after the locus
// but before the source, after the source but before the reply, after the close but before the readback, an incompatible replay, and an
// uncertain store outcome — plus a real SIGKILL of the shipped binary at each durable cut and a failure before AND after EVERY mutating
// filesystem operation of the whole command. Each case reopens and re-presents the SAME confirmed proposal, which must land on exactly the
// campaign an uninterrupted run produces — never a second, altered or substituted locus or source, never a source without its locus,
// and never a success claimed before the owner-verified readback of both.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign, nodeFs } from "@immortalis/engine";
import { instrumentFs } from "@immortalis/testkit";
import {
  LOCALITY_CAMPAIGN,
  NEW_LOCUS_ID,
  NEW_SOURCE_KEY,
  WORLD_ID,
  addLocality,
  bindPlayer,
  headOf,
  localityArgs,
  localityCampaign,
  localityDoc,
  openOrdinary,
  writeLocality,
} from "../support/additional-locality.ts";
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

type Op = "establishLocus" | "establishSourceCondition";

/**
 * Makes one owner operation of the OPERATOR'S campaign lose its acknowledgement: it commits (or, when `commit` is false, never reaches the
 * store). The scratch package the command admission-checks the proposal on beforehand is left alone. Returns the calls the live campaign
 * made of each operation, so the ORDER of the two publications can be asserted.
 */
function loseReply(op: Op, commit: boolean) {
  const scratch = new WeakSet<object>();
  const calls: Op[] = [];
  const create = CanonicalCampaign.create;
  vi.spyOn(CanonicalCampaign, "create").mockImplementation(async (dir: string, p: any) => {
    const made = await create.call(CanonicalCampaign, dir, p);
    if (made.ok && dir.includes("dry-run")) scratch.add(made.value);
    return made;
  });
  for (const name of ["establishLocus", "establishSourceCondition"] as const) {
    const original = CanonicalCampaign.prototype[name] as (...a: unknown[]) => Promise<unknown>;
    vi.spyOn(CanonicalCampaign.prototype as any, name).mockImplementation(async function (
      this: object,
      ...args: unknown[]
    ) {
      if (scratch.has(this)) return original.apply(this, args);
      calls.push(name);
      if (name !== op) return original.apply(this, args);
      if (commit) await original.apply(this, args);
      return unknown;
    });
  }
  return calls;
}

/** Makes one live owner operation REFUSE, definitively (a known refusal, not an unknown outcome). Returns the live calls of each operation. */
function refuse(op: Op) {
  const scratch = new WeakSet<object>();
  const calls: Op[] = [];
  const create = CanonicalCampaign.create;
  vi.spyOn(CanonicalCampaign, "create").mockImplementation(async (dir: string, p: any) => {
    const made = await create.call(CanonicalCampaign, dir, p);
    if (made.ok && dir.includes("dry-run")) scratch.add(made.value);
    return made;
  });
  for (const name of ["establishLocus", "establishSourceCondition"] as const) {
    const original = CanonicalCampaign.prototype[name] as (...a: unknown[]) => Promise<unknown>;
    vi.spyOn(CanonicalCampaign.prototype as any, name).mockImplementation(async function (
      this: object,
      ...args: unknown[]
    ) {
      if (scratch.has(this)) return original.apply(this, args);
      calls.push(name);
      if (name !== op) return original.apply(this, args);
      return { ok: false, error: { code: "INPUT_INVALID", message: "refused" } };
    });
  }
  return calls;
}

async function reference() {
  const dirs = await localityCampaign();
  expect((await addLocality(dirs, writeLocality(localityDoc()))).result.status).toBe(
    "ADDITIONAL_LOCALITY_READY",
  );
  return headOf(dirs.campaignDir);
}

/** What the store holds of the two new facts. */
async function held(dir: string) {
  const c = await openOrdinary(dir);
  try {
    return {
      locus: c.locus(WORLD_ID, NEW_LOCUS_ID) !== undefined,
      source: c.sourceCondition(WORLD_ID, NEW_SOURCE_KEY) !== undefined,
      violations: c.verify(),
    };
  } finally {
    await c.close();
  }
}

describe("a lost acknowledgement of either commit converges on the uninterrupted campaign", () => {
  const cases: [Op, boolean, string, boolean, boolean, number][] = [
    // op, commit, name, locus held, source held, asks on the rerun
    [
      "establishLocus",
      false,
      "before the locus: the locus never reached the store; the rerun asks once and commits both",
      false,
      false,
      1,
    ],
    [
      "establishLocus",
      true,
      "the locus landed but its reply was lost: the source was never attempted, and the rerun asks once and commits it",
      true,
      false,
      1,
    ],
    [
      "establishSourceCondition",
      false,
      "after the locus, before the source: the source never reached the store; the rerun asks once and commits it",
      true,
      false,
      1,
    ],
    [
      "establishSourceCondition",
      true,
      "after the source, before the reply: the rerun verifies both without asking again",
      true,
      true,
      0,
    ],
  ];
  for (const [op, commit, name, locus, source, asks] of cases)
    it(
      name,
      async () => {
        const expected = await reference();
        const dirs = await localityCampaign();
        const file = writeLocality(localityDoc());
        const calls = loseReply(op, commit);
        const first = await addLocality(dirs, file);
        expect(first.result.status).toBe("ADDITIONAL_LOCALITY_OUTCOME_UNKNOWN");
        // the source is attempted only after the locus acknowledged; a locus of unknown outcome is never followed by a source
        expect(calls).toEqual(
          op === "establishLocus"
            ? ["establishLocus"]
            : ["establishLocus", "establishSourceCondition"],
        );
        vi.restoreAllMocks();

        // the claim is never made on the strength of the reply: the store holds exactly what landed, and never a source without its locus
        const now = await held(dirs.campaignDir).catch(() => undefined);
        if (now) {
          expect({ locus: now.locus, source: now.source }).toEqual({ locus, source });
          expect(now.violations).toEqual([]);
        }

        crashedHolder(dirs.campaignDir);
        const again = await addLocality(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status).toBe("ADDITIONAL_LOCALITY_READY");
        expect(again.terminal.asked()).toBe(asks);
        expect(await headOf(dirs.campaignDir)).toEqual(expected);
      },
      120_000,
    );

  it("a locus without its source is never reported established, and the same console confirmation text names only the remaining stage", async () => {
    const dirs = await localityCampaign();
    const file = writeLocality(localityDoc());
    loseReply("establishSourceCondition", false);
    expect((await addLocality(dirs, file)).result.status).toBe(
      "ADDITIONAL_LOCALITY_OUTCOME_UNKNOWN",
    );
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const again = await addLocality(dirs, file, ["decline"], { reclaimStaleLock: true });
    expect(again.result.status).toBe("DECLINED");
    expect(again.terminal.said.join("\n")).toContain("to commit, in this order: source");
    expect(again.terminal.said.join("\n")).not.toContain("locus →");
    expect(await held(dirs.campaignDir)).toEqual({ locus: true, source: false, violations: [] });
  }, 120_000);
});

describe("a known refusal of the source after the locus committed is INCOMPLETE, never established", () => {
  it("reports the partial state, then the same proposal finishes it", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const file = writeLocality(localityDoc());
    refuse("establishSourceCondition");
    const first = await addLocality(dirs, file);
    expect(first.result.status).toBe("ADDITIONAL_LOCALITY_INCOMPLETE");
    expect(first.result.details.join("\n")).toContain("not committed: source");
    vi.restoreAllMocks();
    expect(await held(dirs.campaignDir)).toEqual({ locus: true, source: false, violations: [] });

    const again = await addLocality(dirs, file);
    expect(again.result.status).toBe("ADDITIONAL_LOCALITY_READY");
    expect(again.terminal.asked()).toBe(1);
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("an incompatible proposal offered while a locus is held without its source is refused, never substituted", async () => {
    const dirs = await localityCampaign();
    const file = writeLocality(localityDoc());
    refuse("establishSourceCondition");
    expect((await addLocality(dirs, file)).result.status).toBe("ADDITIONAL_LOCALITY_INCOMPLETE");
    vi.restoreAllMocks();
    const head = await headOf(dirs.campaignDir);

    // the same keys with other content (a different quantity, designation or access)
    for (const change of [
      (d: any) => (d.source.quantity.amount = 31),
      (d: any) => (d.locus.designation = "Another place entirely"),
      (d: any) => (d.source.access_facts = [{ aspect: "terrain", statement: "By boat." }]),
      (d: any) => (d.source.material_class = "red-clay"),
    ]) {
      const doc = localityDoc();
      change(doc);
      const { result, terminal } = await addLocality(dirs, writeLocality(doc), []);
      expect(result.status).toBe("LOCALITY_CONFLICT");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    }
    // a different locus and source while this one is incomplete
    const other = localityDoc();
    other.locus.locus_id = "locus-north-dyke";
    other.source.locus_id = "locus-north-dyke";
    other.source.source_key = "src-dyke-stone-1";
    const { result, terminal } = await addLocality(dirs, writeLocality(other), []);
    expect(result.status).toBe("LOCALITY_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect(await held(dirs.campaignDir)).toEqual({ locus: true, source: false, violations: [] });
  }, 120_000);

  it("a character bound between the locus and the resumed source closes the path: no source is written", async () => {
    const dirs = await localityCampaign();
    const file = writeLocality(localityDoc());
    refuse("establishSourceCondition");
    expect((await addLocality(dirs, file)).result.status).toBe("ADDITIONAL_LOCALITY_INCOMPLETE");
    vi.restoreAllMocks();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addLocality(dirs, file, ["confirm"]);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect((await held(dirs.campaignDir)).source).toBe(false);
  }, 120_000);
});

describe("an owner refusal of the locus writes nothing", () => {
  it("a definitive refusal of the first publication leaves the campaign untouched and the source unattempted", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const calls = refuse("establishLocus");
    const { result } = await addLocality(dirs, writeLocality(localityDoc()));
    expect(result.status).toBe("ADDITIONAL_LOCALITY_REFUSED");
    expect(calls).toEqual(["establishLocus"]);
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("a reopen that fails after the commit is not a success; the rerun verifies by identity", () => {
  it("VERIFICATION_FAILED while both facts are durable, then READY on the rerun without a second write", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const file = writeLocality(localityDoc());
    const open = CanonicalCampaign.open;
    let calls = 0;
    vi.spyOn(CanonicalCampaign, "open").mockImplementation(async (dir: string, o: any) => {
      calls++;
      if (calls >= 2) return { ok: false, error: { code: "REOPEN_LOST", message: "lost" } } as any;
      return open.call(CanonicalCampaign, dir, o);
    });
    const first = await addLocality(dirs, file);
    expect(first.result.status).toBe("ADDITIONAL_LOCALITY_VERIFICATION_FAILED");
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(expected);

    const again = await addLocality(dirs, file, []);
    expect(again.result.status).toBe("ADDITIONAL_LOCALITY_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});

describe("a failure before or after EVERY mutating filesystem operation converges on the uninterrupted campaign", () => {
  it("each operation, before and after, then the same proposal confirmed again", async () => {
    const expected = await reference();
    const file = writeLocality(localityDoc());

    const probeDirs = await localityCampaign();
    const probe = instrumentFs(nodeFs);
    expect(
      (await addLocality(probeDirs, file, ["confirm"], { campaignFs: probe.fs })).result.status,
    ).toBe("ADDITIONAL_LOCALITY_READY");
    const total = probe.count();
    expect(total).toBeGreaterThan(8);

    const seen = new Set<string>();
    for (let failAt = 1; failAt <= total; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dirs = await localityCampaign();
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const first = await addLocality(dirs, file, ["confirm"], { campaignFs: faulty.fs });
        seen.add(first.result.status);
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("LOCALITY_CONFLICT");
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("SOURCE_CONFLICT");

        // whatever was durable at the cut, a source is never present without its locus
        const cut = await held(dirs.campaignDir).catch(() => undefined);
        if (cut) expect(cut.source && !cut.locus, `op ${failAt} ${when}`).toBe(false);

        crashedHolder(dirs.campaignDir);
        const again = await addLocality(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status, `op ${failAt} ${when}`).toBe("ADDITIONAL_LOCALITY_READY");
        expect(again.terminal.asked()).toBeLessThanOrEqual(1);
        expect(await headOf(dirs.campaignDir), `op ${failAt} ${when}`).toEqual(expected);
        const c = await openOrdinary(dirs.campaignDir);
        expect(c.verify()).toEqual([]);
        await c.close();
      }
    }
    // the faults genuinely produced refused, ambiguous, incomplete or unverified outcomes — not only clean runs
    expect(seen.size).toBeGreaterThan(1);
    expect(seen.has("ADDITIONAL_LOCALITY_READY") && seen.size === 1).toBe(false);
  }, 1_800_000);
});

describe("a real kill of the shipped binary", () => {
  it("killed at the console, before anything is written: the rerun reclaims the stale lock and commits both once", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const file = writeLocality(localityDoc());
    const killed = await runShipped(localityArgs(dirs, file), [], { killAfter: /To confirm/ });
    expect(killed.signal).toBe("SIGKILL");
    expect(await headOf(dirs.campaignDir).catch(() => before)).toEqual(before);

    const locked = await runShipped(localityArgs(dirs, file), ["confirm"]);
    expect(locked.code).not.toBe(0);
    expect(locked.stdout).toContain("SESSION_UNAVAILABLE");

    const rerun = await runShipped(localityArgs(dirs, file, ["--reclaim-stale-lock"]), ["confirm"]);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS ADDITIONAL_LOCALITY_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("killed after the locus and before the source: the rerun asks once about the source only and finishes the same locality", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const file = writeLocality(localityDoc());
    const killed = await runShipped(localityArgs(dirs, file), ["confirm"], {
      killAfter: /PROGRESS locus COMMITTED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const rerun = await runShipped(localityArgs(dirs, file, ["--reclaim-stale-lock"]), ["confirm"]);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("to commit, in this order: source");
    expect(rerun.stdout).toContain("STATUS ADDITIONAL_LOCALITY_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("killed after the source and before the acknowledgement: the rerun verifies both by identity without asking again", async () => {
    const expected = await reference();
    const dirs = await localityCampaign();
    const file = writeLocality(localityDoc());
    const killed = await runShipped(localityArgs(dirs, file), ["confirm"], {
      killAfter: /PROGRESS source COMMITTED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const rerun = await runShipped(localityArgs(dirs, file, ["--reclaim-stale-lock"]));
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS ADDITIONAL_LOCALITY_READY");
    expect(rerun.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});
