// MECHANISM ONLY: cancellation returns PENDING without publishing, rejecting or inventing a referee decision.
import { nodeFs, type FsOps } from "@immortalis/engine";
import { awaitDecision, type RefereeTaskFile } from "@immortalis/operator";
import { withRefereeCancellation } from "../../packages/operator/src/referee-cancellation.ts";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());
const task = (id: string): RefereeTaskFile => ({
  format: "immortalis-operator-referee-task",
  format_version: 1,
  task_id: id.repeat(64),
  operation: "I002_CLASSIFY",
  campaign_id: "cancel-fixture",
  nonce: "0".repeat(32),
  document: {},
});
it("cancels one pending wait promptly while another run retains its original poll schedule; neither creates a decision", async () => {
  vi.useFakeTimers();
  const reads: string[] = [];
  const writes: string[] = [];
  const fs: FsOps = {
    ...nodeFs,
    fileSize: async (path) => {
      reads.push(path);
      return null;
    },
    createExclusive: async (path) => {
      writes.push(path);
    },
    writeFileDurable: async (path) => {
      writes.push(path);
    },
    readFile: async () => {
      throw new Error("no answer file exists");
    },
  };
  const p = {
    stateDir: "/private-disposable-fixture",
    campaignId: "cancel-fixture",
    operatorUid: 1,
    fs,
  };
  const a = new AbortController(),
    b = new AbortController();
  const first = withRefereeCancellation(a.signal, () => awaitDecision(p, task("a"), 1, 1000));
  let secondDone = false;
  const second = withRefereeCancellation(b.signal, () => awaitDecision(p, task("b"), 1, 1000)).then(
    (result) => {
      secondDone = true;
      return result;
    },
  );
  await vi.advanceTimersByTimeAsync(0);
  a.abort();
  expect(await first).toEqual({ ok: true, value: null });
  expect(secondDone).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await second).toEqual({ ok: true, value: null });
  expect(reads.filter((path) => path.endsWith(`${"a".repeat(64)}.json`))).toHaveLength(1);
  expect(reads.filter((path) => path.endsWith(`${"b".repeat(64)}.json`))).toHaveLength(2);
  expect(writes).toEqual([]);
});
it("an already stopped run performs no referee read and returns no answer", async () => {
  const control = new AbortController();
  control.abort();
  const read = vi.fn(async () => null);
  expect(
    await withRefereeCancellation(control.signal, () =>
      awaitDecision(
        {
          stateDir: "/private-disposable-fixture",
          campaignId: "cancel-fixture",
          operatorUid: 1,
          fs: { ...nodeFs, fileSize: read },
        },
        task("a"),
        1200,
        500,
      ),
    ),
  ).toEqual({ ok: true, value: null });
  expect(read).not.toHaveBeenCalled();
});
