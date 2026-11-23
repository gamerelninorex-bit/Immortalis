/* eslint-disable @typescript-eslint/no-explicit-any -- child results are JSON of a fixed but test-local shape */
// F-014B B2-T05 — TWO (here: several) REAL OPERATING-SYSTEM PROCESSES against ONE campaign directory.
//
// The file package serializes writers with an `O_EXCL` lock; that is existing code and it is not claimed here as production persistence
// (`provider_acceptance` stays NONE, H-07 stays unaccepted). This test exercises its ACTUAL process behaviour for the GM-wait custody: contending
// processes start behind a barrier, lose or win the lock for real, and each reads the durable truth when it finally holds it.
//
// Invariants asserted (whichever process wins, in whatever order the OS schedules them):
//   - exactly ONE serialized winner for the slot; no split brain; one marker fact, one index chain
//   - every process that carries the winning X learns the SAME original receipt (no lost receipt)
//   - OPEN and NO_OPEN never both commit, and a NO_OPEN never coexists with an opening authority (no false NO_OPEN)
//   - a store built without the W2 admission hook, or with a wrapper that lacks it, refuses to open writable once it holds custody, and refuses
//     the custody write before it holds any
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  temporalGmWaitByPcKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
} from "@immortalis/contracts";
import { verifyTemporalIntegrity } from "@immortalis/engine";
import {
  FIXTURE_PC_ID,
  TARGET,
  lifecycle,
  must,
  reopen,
  seededRig,
  tempDir,
  txOf,
} from "./b2-support.ts";

const FIXTURE = join(import.meta.dirname, "fixtures", "b2-custody-process.ts");

interface Child {
  readonly role: string;
  readonly session?: string;
  readonly rpc?: string;
  readonly host?: string;
  readonly admission?: "fixture" | "none" | "wrapped";
}
interface ChildResult {
  readonly role: string;
  readonly opened: boolean;
  readonly openError?: { code: string; message: string };
  readonly lockedAttempts: number;
  readonly step?: any;
  readonly slot?: { state: string; x: string; version: number } | null;
  readonly head?: { revision: number; journal_head_sha256: string };
  readonly stderr: string;
  readonly exit: number | null;
}

/** Starts every child behind one barrier file and waits for all of them. */
async function race(dir: string, children: readonly Child[]): Promise<ChildResult[]> {
  const root = tempDir("b2-proc-");
  const go = join(root, "GO");
  const running = children.map((c, i) => {
    const out = join(root, `out-${i}.json`);
    const config = join(root, `config-${i}.json`);
    writeFileSync(
      config,
      JSON.stringify({
        role: c.role,
        dir,
        go,
        out,
        session: c.session ?? "session-original-1",
        rpc: c.rpc ?? "1",
        host: c.host ?? "authenticated-host-1",
        admission: c.admission ?? "fixture",
        target: TARGET.value,
      }),
    );
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", FIXTURE, config],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000);
    const done = new Promise<ChildResult>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) => {
        clearTimeout(timer);
        const body = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
        resolve({ ...body, role: c.role, stderr, exit: code });
      });
    });
    return done;
  });
  // let every child reach the barrier, then release them together
  await new Promise((r) => setTimeout(r, 2500));
  mkdirSync(root, { recursive: true });
  writeFileSync(go, "go");
  const results = await Promise.all(running);
  for (const r of results) expect(r.exit, `${r.role}: ${r.stderr}`).toBe(0);
  return results;
}

const markerRig = async () => {
  const rig = await seededRig(tempDir());
  return rig;
};

describe("B2-T05 two or more real OS processes on one campaign directory", () => {
  it("competing markers: exactly one serialized winner for the PC's slot, every carrier of the winning X learns the SAME original receipt, no other X is stored", async () => {
    const rig = await markerRig();
    await rig.campaign.close();
    const results = await race(rig.dir, [
      { role: "marker", rpc: "1" }, // X1
      { role: "marker", rpc: "1" }, // the same logical operation, a duplicate process (a retry / reconnect with the exact original ids)
      { role: "marker", rpc: "2" }, // a different transport request id: a different X
      { role: "marker", rpc: '"1"' }, // the STRING id "1": a different X again
    ]);
    const winners = results.filter((r) => r.step?.committed && !r.step.replayed);
    expect(winners, "exactly one process wrote a new marker").toHaveLength(1);
    const winningX = winners[0]!.step.x as string;
    const carriers = results.filter((r) => r.step?.x === winningX);
    for (const c of carriers) {
      expect(c.step.committed, "a carrier of the winning X learns it committed").toBe(true);
      expect(c.step.revision, "...and the SAME original receipt").toBe(winners[0]!.step.revision);
      expect(c.step.group_sha256).toBe(winners[0]!.step.group_sha256);
    }
    const others = results.filter((r) => r.step?.x !== winningX);
    expect(others.length).toBeGreaterThan(0);
    for (const o of others) {
      expect(o.step.committed).toBe(false);
      expect(o.step.error.reason, "a different X cannot take an occupied slot").toBe(
        "GM_WAIT_SLOT_OCCUPIED",
      );
    }
    // the durable truth, read cold by this process: one marker, one index version, the winner's X
    const cold = await must(reopen(rig.dir));
    const markers = cold.store
      .listFacts()
      .filter((f) => f.key.startsWith("temporal/gm-wait/marker/"));
    expect(markers).toHaveLength(1);
    const index = cold.store.getFact(temporalGmWaitByPcKey(FIXTURE_PC_ID))!;
    expect(index.version).toBe(1);
    expect((index.value as any).x).toBe(winningX);
    expect((index.value as any).state).toBe("MARKED");
    expect([...cold.verify(), ...verifyTemporalIntegrity(cold.store)]).toEqual([]);
    await cold.close();
    // at least one process actually contended for the lock (the race was real), or the run was so serialized by the OS that none did
    console.log(
      `lock contention observed (locked attempts per process): ${results.map((r) => r.lockedAttempts).join(",")}`,
    );
  }, 240_000);

  it("OPEN versus NO_OPEN: exactly one of the two commits, never both, and a NO_OPEN never coexists with an opening authority (repeated)", async () => {
    const outcomes: string[] = [];
    // the role order is varied per round: whichever process reaches the lock first tends to win, so a fixed order would only ever test one direction
    const orders: Child[][] = [
      [{ role: "open" }, { role: "noopen" }, { role: "open" }, { role: "noopen" }],
      [{ role: "noopen" }, { role: "open" }, { role: "noopen" }, { role: "open" }],
      [{ role: "noopen" }, { role: "noopen" }, { role: "noopen" }, { role: "open" }],
      [{ role: "open" }, { role: "open" }, { role: "open" }, { role: "noopen" }],
    ];
    for (const order of orders) {
      const rig = await markerRig();
      const { x } = await lifecycle(rig, "marker");
      await rig.campaign.close();
      const results = await race(rig.dir, order);
      const committedOpen = results.filter(
        (r) => r.role === "open" && r.step?.committed && !r.step.replayed,
      );
      const committedNoOpen = results.filter(
        (r) => r.role === "noopen" && r.step?.committed && !r.step.replayed,
      );
      expect(committedOpen.length + committedNoOpen.length, "exactly one transition won").toBe(1);
      const cold = await must(reopen(rig.dir));
      const state = (cold.store.getFact(temporalGmWaitByPcKey(FIXTURE_PC_ID))!.value as any)
        .state as string;
      const authority = cold.store.getFact(temporalTransactionAuthorityKey(txOf(x)));
      const seal = cold.store.getFact(temporalTransactionKey(txOf(x)));
      if (committedOpen.length === 1) {
        expect(state).toBe("OPEN");
        expect(authority).toBeDefined();
        // the losing NO_OPEN processes were refused, and wrote nothing
        for (const r of results.filter((r) => r.role === "noopen"))
          expect(r.step.committed).toBe(false);
      } else {
        expect(state).toBe("NO_OPEN");
        expect(
          authority,
          "NO FALSE NO_OPEN: a NO_OPEN with an opening authority can never exist",
        ).toBeUndefined();
        expect(seal).toBeUndefined();
        for (const r of results.filter((r) => r.role === "open"))
          expect(r.step.committed).toBe(false);
      }
      // a process that carried the winner's role and lost the lock race first reads the winner's receipt as a replay
      expect([...cold.verify(), ...verifyTemporalIntegrity(cold.store)]).toEqual([]);
      outcomes.push(state);
      await cold.close();
    }
    console.log(`OPEN/NO_OPEN race winners over 4 rounds: ${outcomes.join(", ")}`);
  }, 360_000);

  it("a store built WITHOUT the admission hook, or with a wrapper that lacks the W2 custody verifier, refuses to open writable once it holds custody", async () => {
    const rig = await markerRig();
    await lifecycle(rig, "marker");
    await rig.campaign.close();
    const results = await race(rig.dir, [
      { role: "status", admission: "none" },
      { role: "status", admission: "wrapped" },
    ]);
    for (const r of results) {
      expect(r.opened).toBe(false);
      expect(r.openError?.code).toBe("PROTECTED_STORE_REQUIRES_ADMISSION");
    }
    // the control: the same package opens under the fixture admission
    const ok = await race(rig.dir, [{ role: "status", admission: "fixture" }]);
    expect(ok[0]!.opened).toBe(true);
    expect(ok[0]!.slot?.state).toBe("MARKED");
  }, 240_000);

  it("a store with NO admission refuses the custody write itself before it holds any custody (fail closed prior to the writable guard)", async () => {
    const rig = await markerRig();
    const revision = rig.store.head().revision;
    await rig.campaign.close();
    const results = await race(rig.dir, [
      { role: "raw-marker", admission: "none" },
      { role: "raw-marker", admission: "wrapped" },
    ]);
    for (const r of results) {
      // the group is lawful and well-shaped; only the admission differs from the control below
      expect(r.opened).toBe(true);
      expect(r.step.committed).toBe(false);
      expect(r.step.error.reason).toBe("GM_WAIT_ADMISSION_ABSENT");
      expect(r.head!.revision).toBe(revision);
    }
    const cold = await must(reopen(rig.dir));
    expect(cold.store.listFacts().some((f) => f.key.startsWith("temporal/gm-wait/"))).toBe(false);
    await cold.close();
  }, 240_000);
});
