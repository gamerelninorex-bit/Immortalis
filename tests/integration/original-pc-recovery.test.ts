/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap owner operations to simulate lost acknowledgements */
// Crash / retry for the original player-character authorship and first native ACTIVATION. The release (I-002) and the binding (Role
// Registry) are two owners' separate publications, so an interruption between them leaves a released but UNBOUND character: it is
// reported as exactly that, the same command resumes at placement without repeating the release, and a binding whose reply was lost
// is recognised by its identity and is never duplicated. Each rerun must land on the campaign an uninterrupted run produces.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign, nodeFs } from "@immortalis/engine";
import { instrumentFs } from "@immortalis/testkit";
import { openOrdinary } from "../support/locality.ts";
import {
  CAMPAIGN,
  PC_ID,
  STANDARD,
  author,
  localityCampaign,
  respondingConsole,
  shapeOf,
} from "../support/original-pc.ts";

afterEach(() => vi.restoreAllMocks());

const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;

/** An in-process "crash" leaves the lock naming THIS live process; a real crash leaves a dead holder, which is what is restored. */
function crashedHolder(campaignDir: string): void {
  const lock = join(campaignDir, "LOCK");
  if (existsSync(lock))
    writeFileSync(lock, `${JSON.stringify({ pid: deadPid(), campaign_id: CAMPAIGN })}\n`);
}

const unknown = { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as const;

/** Makes one owner operation lose its acknowledgement: it commits (or, when `commit` is false, never reaches the store). */
function loseReply(op: "releasePlayerCharacter" | "bindPlayerCharacter", commit: boolean) {
  const original = (CanonicalCampaign.prototype as any)[op] as (
    ...a: unknown[]
  ) => Promise<unknown>;
  vi.spyOn(CanonicalCampaign.prototype as any, op).mockImplementation(async function (
    this: object,
    ...args: unknown[]
  ) {
    if (commit) await original.apply(this, args);
    return unknown;
  });
}

async function reference() {
  const dirs = await localityCampaign();
  const { result } = await author(dirs, respondingConsole(STANDARD));
  expect(result.status).toBe("CHARACTER_BOUND");
  return shapeOf(dirs);
}

describe("a lost acknowledgement at each of the two owner commits converges on the uninterrupted campaign", () => {
  const cases = [
    ["releasePlayerCharacter", true, "the release landed but its reply was lost", 2, 4],
    [
      "releasePlayerCharacter",
      false,
      "the release never reached the store: the retained keep is released as kept, not asked again",
      2,
      3,
    ],
    ["bindPlayerCharacter", true, "the binding landed but its reply was lost", 0, 5],
    ["bindPlayerCharacter", false, "the binding never reached the store", 2, 4],
  ] as const;
  for (const [op, commit, name, reAsked, revisionAfterFirst] of cases) {
    it(
      name,
      async () => {
        const expected = await reference();
        const dirs = await localityCampaign();
        loseReply(op, commit);
        const first = await author(dirs, respondingConsole(STANDARD));
        expect(first.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
        expect(first.result.message).toContain("not known");
        vi.restoreAllMocks();

        const held = await openOrdinary(dirs.campaignDir);
        expect(held.store.head().revision).toBe(revisionAfterFirst);
        await held.close();

        // the same command again: it reads what the campaign holds and repeats nothing that committed
        const again = await author(dirs, respondingConsole(STANDARD));
        expect(again.result.status).toBe("CHARACTER_BOUND");
        if (reAsked === 0) expect(again.terminal.asked()).toBe(0);
        else if (reAsked === 2) {
          // placement alone: the kept character is read back, never asked for or released again
          expect(again.terminal.asked()).toBe(2);
          expect(again.terminal.said.join("\n")).not.toContain("identity>");
        } else expect(again.terminal.asked()).toBeGreaterThan(10);
        expect(await shapeOf(dirs)).toEqual(expected);
        const campaign = await openOrdinary(dirs.campaignDir);
        expect(campaign.playerCharacter(PC_ID)!.fact.version).toBe(1);
        expect(campaign.binding()!.fact.version).toBe(1);
        await campaign.close();
      },
      120_000,
    );
  }

  it("an unexpected failure after the release is an unknown outcome, never a clean success or refusal", async () => {
    const dirs = await localityCampaign();
    vi.spyOn(CanonicalCampaign.prototype as any, "bindPlayerCharacter").mockRejectedValue(
      new Error("boom"),
    );
    const first = await author(dirs, respondingConsole(STANDARD));
    expect(first.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    const again = await author(dirs, respondingConsole(STANDARD));
    expect(again.result.status).toBe("CHARACTER_BOUND");
  }, 120_000);
});

describe("a failure before or after EVERY mutating filesystem operation converges on the uninterrupted campaign", () => {
  it("each operation, before and after, then the same command again", async () => {
    const expected = await reference();

    const probeDirs = await localityCampaign();
    const probe = instrumentFs(nodeFs);
    const probed = await author(probeDirs, respondingConsole(STANDARD), { campaignFs: probe.fs });
    expect(probed.result.status).toBe("CHARACTER_BOUND");
    const total = probe.count();
    expect(total).toBeGreaterThan(4);

    for (let n = 1; n <= total; n++) {
      for (const when of ["before", "after"] as const) {
        const dirs = await localityCampaign();
        const { fs } = instrumentFs(nodeFs, { failAt: n, when });
        const first = await author(dirs, respondingConsole(STANDARD), { campaignFs: fs });
        crashedHolder(dirs.campaignDir);
        const again = await author(dirs, respondingConsole(STANDARD), { reclaimStaleLock: true });
        expect(again.result.status, `${when} op ${n}`).toBe("CHARACTER_BOUND");
        // a command that had already reported the binding (the fault was in releasing the lock) asks and writes nothing more
        if (first.result.status === "CHARACTER_BOUND") expect(again.terminal.asked()).toBe(0);
        expect(await shapeOf(dirs), `${when} op ${n}`).toEqual(expected);
      }
    }
  }, 900_000);
});
