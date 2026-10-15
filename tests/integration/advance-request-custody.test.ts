// BLUE v5.2-A1 (Host-Requested Active-PC Target-Only OOC Time), race/recovery obligations: the custody of the ONE pending ask. The pattern is the
// one PR #70's H-1 repair established (HOLD H-1, native pin 2026-10-15T14:10:50.624Z), applied from the start to the time-advance ask. A cleanup of ask X that
// has already validated X's identity must never remove a newer valid ask Y that a concurrent, lawful request installed in between — whether
// the cleanup is the operator's post-answer discard or the recorder's own stale replacement. The interleaving is made DETERMINISTIC by a
// file-system seam that PAUSES the cleanup's removal, runs the replacement to completion, then releases the cleanup. These tests are written
// against the exchange's public surface (record / discard / read) so they fail at the reviewed HEAD 8e58642 (a pathname-only unlink) and pass
// once an identity-bound removal is in place. They add no canonical state: the ask remains a non-canonical routing record.
import { chmodSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { StageProviderRegistry, TemporalCoordinator, nodeFs, type FsOps } from "@immortalis/engine";
import { stopAtBoundaryRequest } from "@immortalis/testkit";
import {
  discardAdvanceRequest,
  advanceRequestDir,
  readAdvanceRequest,
  recordAdvanceRequest,
} from "../../packages/operator/src/advance-request-exchange.ts";
import { requestActivePcTargetAdvance } from "../../packages/operator/src/advance-request.ts";
import { at } from "../support/gip-sunset.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { scriptedConsole } from "../support/original-pc.ts";
import {
  BEFORE_SUNSET,
  BEYOND_SUNSET,
  REQUEST_HOST,
  answer,
  askFile,
  askFiles,
  askOnce,
  bindRequestHost,
  sunsetDirs,
  targetConsole,
  worldOf,
} from "../support/advance-request.ts";
import { copyDirs } from "../support/player-view.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

vi.setConfig({ testTimeout: 120_000 });

const UID = process.getuid!();
const ASK_FILE = /request(?:-[0-9a-f]{32})?\.json$/;

const stateDir = () => {
  const d = tempDir("immortalis-adv-request-custody-");
  chmodSync(d, 0o700);
  return d;
};
const params = (dir: string, fs?: FsOps) => ({
  stateDir: dir,
  campaignId: "campaign-a",
  ...(fs ? { fs } : {}),
});
const ask = (value: number, host_id = "host-1") => ({
  campaign_id: "campaign-a",
  operator_uid: UID,
  host_id,
  pc_id: "pc-1",
  basis: { unit: "tick", value },
});
/** Every ask file in a state directory, as the bases they carry (implementation-neutral: parses whatever ask files exist). */
const basesOf = (dir: string): number[] => {
  const d = advanceRequestDir(params(dir));
  return readdirSync(d)
    .filter((f) => ASK_FILE.test(f))
    .map((f) => JSON.parse(readFileSync(join(d, f), "utf8")).basis.value as number)
    .sort((a, b) => a - b);
};

/** A file-system seam that PAUSES the first removal of an ask file: `hook` runs to completion before the removal proceeds. */
function pausedRemoval(hook: () => Promise<void>): { fs: FsOps; paused: () => number } {
  let n = 0;
  return {
    paused: () => n,
    fs: {
      ...nodeFs,
      remove: async (path: string) => {
        if (ASK_FILE.test(path) && n === 0) {
          n += 1;
          await hook();
        }
        return nodeFs.remove(path);
      },
    },
  };
}

describe("H-1 at the exchange: a cleanup of X paused after validating X cannot remove the newer ask Y", () => {
  it("post-answer discard path: A validates X, B replaces it with Y (a later basis), A resumes — Y survives and is still servable", async () => {
    const dir = stateDir();
    const x = await recordAdvanceRequest(params(dir), ask(100));
    if (!x.ok) throw new Error("record failed");
    let y: { request_id: string } | undefined;
    const a = pausedRemoval(async () => {
      const r = await recordAdvanceRequest(params(dir), ask(150));
      if (!r.ok) throw new Error("replacement failed");
      y = r.value;
    });
    await discardAdvanceRequest(params(dir, a.fs), x.value.request_id, UID);
    expect(a.paused()).toBe(1);
    expect(y).toBeDefined();
    // the newer ask is still pending, and is the one the operator would serve
    expect(basesOf(dir)).toEqual([150]);
    const held = await readAdvanceRequest(params(dir), UID);
    expect(held.ok && held.value?.request_id).toBe(y!.request_id);
    expect(held.ok && held.value?.basis).toEqual({ unit: "tick", value: 150 });
  });

  it("stale-replacement path: B's replacement of stale X is paused after validating X while C installs Y — Y survives B's resumed cleanup", async () => {
    const dir = stateDir();
    expect((await recordAdvanceRequest(params(dir), ask(100))).ok).toBe(true);
    let y: { request_id: string } | undefined;
    const b = pausedRemoval(async () => {
      const r = await recordAdvanceRequest(params(dir), ask(200));
      if (!r.ok) throw new Error("replacement failed");
      y = r.value;
    });
    const recorded = await recordAdvanceRequest(params(dir, b.fs), ask(150));
    expect(recorded.ok).toBe(true);
    expect(b.paused()).toBe(1);
    // the stale ask is gone, and the lawful newer ask C installed is NOT erased by B's resumed cleanup
    const bases = basesOf(dir);
    expect(bases).toContain(200);
    expect(bases).not.toContain(100);
    const held = await readAdvanceRequest(params(dir), UID);
    expect(held.ok).toBe(true);
    expect(y).toBeDefined();
  });

  it("a cleanup that names an identity which no longer exists removes nothing, whatever is installed since", async () => {
    const dir = stateDir();
    const x = await recordAdvanceRequest(params(dir), ask(100));
    if (!x.ok) throw new Error("record failed");
    expect(await discardAdvanceRequest(params(dir), x.value.request_id, UID)).toBe(true);
    const y = await recordAdvanceRequest(params(dir), ask(100)); // the same ask, asked again after the first was settled
    if (!y.ok) throw new Error("record failed");
    expect(y.value.request_id).not.toBe(x.value.request_id);
    // a late, duplicate cleanup of the FIRST incarnation (a second operator process, a retry) cannot touch the second
    expect(await discardAdvanceRequest(params(dir), x.value.request_id, UID)).toBe(false);
    expect(basesOf(dir)).toEqual([100]);
    expect((await readAdvanceRequest(params(dir), UID)).ok).toBe(true);
  });

  it("a cleanup paused at EVERY removal it makes — however many reads precede it — still leaves the newer ask", async () => {
    // inserting one more read before the unlink would not close a pathname race; identity-bound custody does not depend on it
    for (const extraReads of [0, 1, 3]) {
      const dir = stateDir();
      const x = await recordAdvanceRequest(params(dir), ask(100));
      if (!x.ok) throw new Error("record failed");
      const a = pausedRemoval(async () => {
        expect((await recordAdvanceRequest(params(dir), ask(150))).ok).toBe(true);
      });
      const reading: FsOps = {
        ...a.fs,
        readFile: async (path: string) => {
          if (ASK_FILE.test(path))
            for (let i = 0; i < extraReads; i += 1) await nodeFs.readFile(path);
          return nodeFs.readFile(path);
        },
      };
      await discardAdvanceRequest(params(dir, reading), x.value.request_id, UID);
      expect(basesOf(dir), `${extraReads} extra reads`).toEqual([150]);
    }
  });
});

describe("the race through the operator and the host: the replacement Y is still served after the paused cleanup of X", () => {
  let fresh: LocalityDirs;
  beforeAll(async () => {
    fresh = await sunsetDirs();
  }, 240_000);

  const askingParams = async (dirs: LocalityDirs) => {
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

  const advanceTo = async (dirs: LocalityDirs, target: number) => {
    const campaign = await openOrdinary(dirs.campaignDir);
    await must(
      new TemporalCoordinator(campaign.store, new StageProviderRegistry()).advance(
        stopAtBoundaryRequest(`tx-custody-${target}`, {
          requested: { target: at(target), condition: null },
        }),
      ),
    );
    await campaign.close();
  };

  it("the operator's post-answer cleanup of X (a declined advance) is paused; time advances and the host's new request Y is installed; Y survives and the operator then serves it", async () => {
    const dirs = copyDirs(fresh);
    const host = await askingParams(dirs);
    expect((await requestActivePcTargetAdvance(host)).ok).toBe(true); // X at the established basis

    let installed = false;
    const a = pausedRemoval(async () => {
      await advanceTo(dirs, 110); // a lawful, separate time advance
      const y = await requestActivePcTargetAdvance(host); // the host's newer request Y (replaces the stale X)
      expect(y.ok).toBe(true);
      installed = true;
    });
    // the operator DECLINES X's advance (its choice); the answer then cleans up X: paused between validating X and removing it
    const declined = await answer(dirs, BEFORE_SUNSET, scriptedConsole("no"), { ledgerFs: a.fs });
    expect(declined.result.status).toBe("DECLINED");
    expect(a.paused()).toBe(1);
    expect(installed).toBe(true);

    // Y survived the cleanup of X, and the operator can still serve it: a fresh, separate confirmation at the NEW basis
    const held = await readAdvanceRequest(
      { stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN },
      UID,
    );
    expect(held.ok && held.value).toBeTruthy();
    expect(held.ok && held.value?.basis).toEqual(at(110));
    const console_ = targetConsole();
    const served = await answer(dirs, BEYOND_SUNSET, console_);
    expect(served.result.status, JSON.stringify(served.result)).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(console_.asked()).toBe(1);
    expect((await worldOf(dirs)).lifecycle).toBe("expired");
  });

  it("contending request PROCESSES converge on one ask (the package lock serializes the recorders), and a restart finds exactly that ask", async () => {
    const dirs = copyDirs(fresh);
    const bound = await bindRequestHost(dirs);
    const results = await Promise.all(
      [0, 1, 2, 3, 4, 5].map(() => askOnce(dirs, bound.secretFile)),
    );
    expect(results.some((r) => !r.isError)).toBe(true);
    for (const r of results)
      if (r.isError) expect(r.text).toContain("TARGET_ADVANCE_REQUEST_UNAVAILABLE");
    expect(askFiles(dirs)).toHaveLength(1);
    // a fresh process (a restart) finds that ask and serves it
    expect((await answer(dirs, BEYOND_SUNSET)).result.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(askFiles(dirs)).toHaveLength(0);
  });

  it("a crash while an ask is being created leaves only inert residue: it is never served, never blocks a new ask, and a restart is unaffected", async () => {
    const dirs = copyDirs(fresh);
    const host = await askingParams(dirs);
    const dir = advanceRequestDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN });
    // a create interrupted before it was published: the engine's atomic create leaves only a temporary name
    writeFileSync(
      join(dir, `request-${"ab".repeat(16)}.json.4242.deadbeef0000.tmp`),
      '{"partial":',
    );
    expect(askFiles(dirs)).toHaveLength(0);
    const quiet = scriptedConsole();
    expect((await answer(dirs, BEYOND_SUNSET, quiet)).result.status).toBe(
      "TARGET_ADVANCE_REQUEST_NONE",
    );
    expect(quiet.asked()).toBe(0);
    expect((await requestActivePcTargetAdvance(host)).ok).toBe(true);
    expect(askFiles(dirs)).toHaveLength(1);
  });

  it("duplicates of one ask (recorders that did not hold the lock) are served ONCE, by the lowest identity, and are settled together, each by its own name", async () => {
    const dirs = copyDirs(fresh);
    const host = await askingParams(dirs);
    expect((await requestActivePcTargetAdvance(host)).ok).toBe(true);
    const original = askFile(dirs);
    const dir = advanceRequestDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN });
    const dupId = "ff".repeat(16);
    const doc = JSON.parse(readFileSync(original, "utf8"));
    writeFileSync(
      join(dir, `request-${dupId}.json`),
      JSON.stringify({ ...doc, request_id: dupId }),
    );
    expect(askFiles(dirs)).toHaveLength(2);
    const console_ = targetConsole();
    expect((await answer(dirs, BEYOND_SUNSET, console_)).result.status).toBe(
      "PC_TARGET_ADVANCE_COMMITTED",
    );
    expect(console_.asked()).toBe(1);
    expect(askFiles(dirs)).toHaveLength(0);
  });

  it("an ask left in the retained state by another operating-system user or another campaign is never served and never removed", async () => {
    const dirs = copyDirs(fresh);
    await askingParams(dirs);
    const dir = advanceRequestDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN });
    const foreignId = "ee".repeat(16);
    const foreign = join(dir, `request-${foreignId}.json`);
    writeFileSync(
      foreign,
      JSON.stringify({
        format: "immortalis-operator-advance-request",
        format_version: 1,
        campaign_id: "campaign-other",
        operator_uid: UID + 1,
        request_id: foreignId,
        host_id: REQUEST_HOST,
        pc_id: "pc-maren",
        basis: at(100),
      }),
    );
    const console_ = scriptedConsole();
    const ans = await answer(dirs, BEYOND_SUNSET, console_);
    expect(ans.result.status).toBe("TARGET_ADVANCE_REQUEST_INVALID");
    expect(console_.asked()).toBe(0);
    expect(readFileSync(foreign, "utf8")).toContain("campaign-other");
    expect((await worldOf(dirs)).lifecycle).toBe("active");
  });
});
