/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap owner operations to simulate lost acknowledgements */
// Crash / retry for the confirmed ORIGINAL locality admission (RC-16): an interruption after the package is created, after the world
// commit, after the locus commit, after the source commit and before the acknowledgement. Each case reopens and re-presents the SAME
// confirmed setup, which must land on exactly the campaign an uninterrupted run produces; a changed or conflicting setup must fail
// closed, never mix two choices, and never create a second identity. A partially constructed campaign is never reported ready.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign, nodeFs } from "@immortalis/engine";
import { scriptedTerminal } from "../support/operator.ts";
import { LocalOperatorSession, establishLocality, localityStatus } from "@immortalis/operator";
import { fixtureWorld, instrumentFs, publication } from "@immortalis/testkit";
import {
  LOCALITY_CAMPAIGN,
  establish,
  freshDirs,
  headOf,
  openOrdinary,
  setupDoc,
  writeSetup,
} from "../support/locality.ts";

afterEach(() => vi.restoreAllMocks());

/** A process id that provably belongs to no running process: what the lock of a crashed process names. */
const deadPid = (): number => {
  const child = spawnSync(process.execPath, ["-e", ""]);
  return child.pid;
};

/** An in-process "crash" leaves the lock naming THIS live process; a real crash leaves a dead holder, which is what is restored. */
function crashedHolder(campaignDir: string): void {
  const lock = join(campaignDir, "LOCK");
  if (existsSync(lock))
    writeFileSync(lock, `${JSON.stringify({ pid: deadPid(), campaign_id: LOCALITY_CAMPAIGN })}\n`);
}

const unknown = { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as const;

/**
 * Makes one owner operation of the OPERATOR'S campaign lose its acknowledgement: it commits (or, when `commit` is false, never
 * reaches the store). The scratch package the command admission-checks the setup on beforehand is left alone.
 */
function loseReply(
  op: "establishWorld" | "establishLocus" | "establishSourceCondition",
  commit: boolean,
) {
  const scratch = new WeakSet<object>();
  const create = CanonicalCampaign.create;
  vi.spyOn(CanonicalCampaign, "create").mockImplementation(async (dir: string, p: any) => {
    const made = await create.call(CanonicalCampaign, dir, p);
    if (made.ok && dir.includes("dry-run")) scratch.add(made.value);
    return made;
  });
  const original = (CanonicalCampaign.prototype as any)[op] as (
    ...a: unknown[]
  ) => Promise<unknown>;
  vi.spyOn(CanonicalCampaign.prototype as any, op).mockImplementation(async function (
    this: object,
    ...args: unknown[]
  ) {
    if (scratch.has(this)) return original.apply(this, args);
    if (commit) await original.apply(this, args);
    return unknown;
  });
}

async function reference() {
  const dirs = freshDirs();
  const { result } = await establish(dirs, writeSetup(setupDoc()));
  expect(result.status).toBe("LOCALITY_READY");
  return headOf(dirs.campaignDir);
}

describe("a lost acknowledgement at each of the three owner commits converges on the uninterrupted campaign", () => {
  const cases = [
    ["establishWorld", true, "world", "the world commit landed but its reply was lost"],
    ["establishLocus", true, "locus", "the locus commit landed but its reply was lost"],
    [
      "establishSourceCondition",
      true,
      "source",
      "the source commit landed; the acknowledgement was lost",
    ],
    ["establishWorld", false, "none", "the world group never reached the store"],
    ["establishLocus", false, "world", "the locus group never reached the store"],
    ["establishSourceCondition", false, "locus", "the source group never reached the store"],
  ] as const;
  for (const [op, commit, through, name] of cases) {
    it(
      name,
      async () => {
        const expected = await reference();
        const dirs = freshDirs();
        const file = writeSetup(setupDoc());
        loseReply(op, commit);
        const first = await establish(dirs, file);
        expect(first.result.status).toBe("LOCALITY_OUTCOME_UNKNOWN");
        vi.restoreAllMocks();

        // exactly the stages up to the loss are durable; the campaign is NOT ready
        const held = await openOrdinary(dirs.campaignDir);
        expect(held.store.head().revision).toBe(
          ["none", "world", "locus", "source"].indexOf(through),
        );
        await held.close();
        const opened = await LocalOperatorSession.open({
          campaignDir: dirs.campaignDir,
          operatorDir: dirs.operatorDir,
          expectedCampaignId: LOCALITY_CAMPAIGN,
        });
        if (!opened.ok) throw new Error("did not open");
        const status = localityStatus(opened.value);
        await opened.value.close();
        if (through === "source") expect(status.status).toBe("LOCALITY_READY");
        else expect(status.status).toBe("LOCALITY_INCOMPLETE");

        // the SAME confirmed setup, presented again: replays what committed, commits the rest, never a second identity
        const again = await establish(dirs, file);
        expect(again.result.status).toBe("LOCALITY_READY");
        expect(again.terminal.asked()).toBe(through === "source" ? 0 : 1);
        expect(await headOf(dirs.campaignDir)).toEqual(expected);
      },
      120_000,
    );
  }
});

describe("a failure before or after EVERY mutating filesystem operation converges on the uninterrupted campaign", () => {
  it("each operation, before and after, then the same setup confirmed again", async () => {
    const expected = await reference();
    const file = writeSetup(setupDoc());

    const probeDirs = freshDirs();
    const probe = instrumentFs(nodeFs);
    expect(
      (await establish(probeDirs, file, ["confirm"], { campaignFs: probe.fs })).result.status,
    ).toBe("LOCALITY_READY");
    const total = probe.count();
    expect(total).toBeGreaterThan(20);

    const seen = new Set<string>();
    let unusable = 0;
    for (let failAt = 1; failAt <= total; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dirs = freshDirs();
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const first = await establish(dirs, file, ["confirm"], { campaignFs: faulty.fs });
        seen.add(first.result.status);
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("SETUP_CONFLICT");

        // what the interruption left, judged before the same setup is presented again
        const residue =
          !existsSync(join(dirs.campaignDir, "manifest.json")) &&
          existsSync(dirs.campaignDir) &&
          readdirSync(dirs.campaignDir).length > 0;
        crashedHolder(dirs.campaignDir);
        const again = await establish(dirs, file, ["confirm"], { reclaimStaleLock: true });
        if (residue) {
          // an interrupted package creation is never adopted, completed or cleared
          expect(again.result.status, `op ${failAt} ${when}`).toBe("PACKAGE_UNUSABLE");
          unusable++;
          continue;
        }
        expect(again.result.status, `op ${failAt} ${when}`).toBe("LOCALITY_READY");
        expect(again.terminal.asked()).toBeLessThanOrEqual(1);
        expect(await headOf(dirs.campaignDir), `op ${failAt} ${when}`).toEqual(expected);
        const c = await openOrdinary(dirs.campaignDir);
        expect(c.verify()).toEqual([]);
        await c.close();
      }
    }
    // the faults genuinely produced ambiguous, refused and clean outcomes — not only clean runs
    expect(seen.has("LOCALITY_OUTCOME_UNKNOWN")).toBe(true);
    expect(unusable).toBeGreaterThan(0);
  }, 900_000);
});

describe("a changed or conflicting setup fails closed against what a campaign already holds", () => {
  /** a campaign holding only the world, as left by an interruption after the first commit */
  async function worldOnly() {
    const dirs = freshDirs();
    const file = writeSetup(setupDoc());
    loseReply("establishLocus", false);
    expect((await establish(dirs, file)).result.status).toBe("LOCALITY_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    return { dirs, file, before: await headOf(dirs.campaignDir) };
  }

  const changes: [string, (d: any) => void][] = [
    ["a different premise", (d) => (d.world.premise = "A different premise entirely.")],
    ["a different exact quantity", (d) => (d.source.quantity.amount = 121)],
    ["a different unit", (d) => (d.source.quantity.unit = "barrel")],
    ["a different access fact", (d) => (d.source.access_facts[0].statement = "Only by boat.")],
    ["a different locus designation", (d) => (d.locus.designation = "The north pans")],
    [
      "a second world identity",
      (d) => {
        d.world.world_id = d.locus.world_id = d.source.world_id = "world-other";
      },
    ],
  ];
  for (const [name, change] of changes) {
    it(`${name} is refused after the world was committed; nothing mixes and nothing is created`, async () => {
      const { dirs, before } = await worldOnly();
      const doc = setupDoc();
      change(doc);
      const other = await establish(dirs, writeSetup(doc), ["confirm"]);
      expect(other.result.status).toBe("SETUP_CONFLICT");
      expect(other.terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(before);
    }, 120_000);
  }

  it("the original setup still completes the interrupted campaign afterwards", async () => {
    const expected = await reference();
    const { dirs, file } = await worldOnly();
    const doc = setupDoc();
    doc.source.quantity.amount = 5;
    expect((await establish(dirs, writeSetup(doc))).result.status).toBe("SETUP_CONFLICT");
    expect((await establish(dirs, file)).result.status).toBe("LOCALITY_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("a different campaign identity is refused (no substitution)", async () => {
    const { dirs, file, before } = await worldOnly();
    const other = await establishLocality({
      campaignDir: dirs.campaignDir,
      campaignId: "another-campaign",
      setupFile: file,
      operatorDir: dirs.operatorDir,
      terminal: scriptedTerminal("confirm"),
    });
    expect(other.status).toBe("SESSION_UNAVAILABLE");
    expect(other.code).toBe("CAMPAIGN_MISMATCH");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);

  it("a campaign that already holds other canon is never made a second locality", async () => {
    const dirs = freshDirs();
    const made = await CanonicalCampaign.create(dirs.campaignDir, {
      campaignId: LOCALITY_CAMPAIGN,
      buildId: "foreign",
    });
    if (!made.ok) throw new Error("create");
    const committed = await made.value.establishWorld({ ...publication(1), world: fixtureWorld() });
    expect(committed.ok).toBe(true);
    await made.value.close();
    const before = await headOf(dirs.campaignDir);
    const run = await establish(dirs, writeSetup(setupDoc()));
    expect(run.result.status).toBe("SETUP_CONFLICT");
    expect(run.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);
});
