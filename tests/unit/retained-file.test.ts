import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import {
  goalRecordPath,
  readGoal,
  writeGoal,
  type GoalRecord,
} from "../../apps/phone/src/goal-record.ts";
import {
  PENDING_FORMAT,
  clearPending,
  pendingPath,
  readPending,
  writePending,
  type PendingOperation,
} from "../../apps/phone/src/recovery.ts";
import {
  dropInputs,
  emptyRoute,
  readRouteRecord,
  routeRecordPath,
  writeRouteRecord,
} from "../../apps/phone/src/route-record.ts";
import { interrupt, type FileCall } from "../support/rp1-filesystem.ts";
import { tempDir } from "../support/tmp.ts";

const faults = vi.hoisted(() => ({}) as Parameters<typeof interrupt>[0]);
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof fs>();
  const { observeFileOps } = await import("../support/rp1-filesystem.ts");
  return observeFileOps(real, faults);
});
afterEach(() => {
  delete faults.before;
  delete faults.after;
});

const campaign = "campaign-stage-2";
const pending: PendingOperation = {
  format: PENDING_FORMAT,
  format_version: 1,
  campaign_id: campaign,
  run_id: "original-run",
  command: "collect",
  options: { amount: "3" },
  dispatched_at: 115,
  state: "DISPATCHED",
  blocker: null,
  identity: null,
};
const goal: GoalRecord = {
  id: "0000000000000001",
  amount: 3,
  until: "complete",
  outcome: "IN_PROGRESS",
  step: "ADOPTING",
  dispatch_ref: "original-dispatch",
};
const route = { ...emptyRoute({ campaignId: campaign }), handling: "I reach for the low branch." };
const cases = [
  {
    name: "pending",
    path: pendingPath,
    read: readPending,
    old: { kind: "PENDING", pending },
    legacy: pending,
    next: (config: PhoneConfig) =>
      writePending(config, { ...pending, state: "UNCERTAIN", blocker: "readback required" }),
    new: {
      kind: "PENDING",
      pending: { ...pending, state: "UNCERTAIN", blocker: "readback required" },
    },
    remove: clearPending,
  },
  {
    name: "goal",
    path: goalRecordPath,
    read: readGoal,
    old: { kind: "RECORD", goal },
    legacy: { format: "immortalis-chat-goal", format_version: 1, campaign_id: campaign, goal },
    next: (config: PhoneConfig) => writeGoal(config, { ...goal, step: "COMMITTING" }),
    new: { kind: "RECORD", goal: { ...goal, step: "COMMITTING" } },
  },
  {
    name: "route",
    path: routeRecordPath,
    read: readRouteRecord,
    old: { kind: "RECORD", record: route },
    legacy: route,
    next: (config: PhoneConfig) =>
      writeRouteRecord(config, { ...route, handling: "I steady the branch." }),
    new: { kind: "RECORD", record: { ...route, handling: "I steady the branch." } },
    remove: (config: PhoneConfig) => dropInputs(config, ["handling"]),
  },
];
const oldConfig = (): PhoneConfig =>
  ({
    operatorDir: tempDir("rp1-a08-"),
    campaignId: campaign,
  }) as PhoneConfig;
const matches = (op: FileCall["op"], path: string) => (call: FileCall) =>
  call.op === op && call.path === path;
const cuts: readonly [string, (c: FileCall, path: string) => boolean][] = [
  ["temporary open", (c, path) => c.op === "openSync" && c.path.startsWith(path + ".")],
  ["write", (c, path) => c.op === "writeFileSync" && c.path.startsWith(path + ".")],
  ["chmod", (c, path) => c.op === "fchmodSync" && c.path.startsWith(path + ".")],
  ["file sync", (c, path) => c.op === "fsyncSync" && c.path.startsWith(path + ".")],
  ["rename", (c, path) => c.op === "renameSync" && c.destination === path],
  ["record directory sync", (c, path) => matches("fsyncSync", dirname(path))(c)],
];

describe.each(cases)("$name retained-file durability", (record) => {
  for (const [step, cut] of cuts) {
    it.each(["before", "after"] as const)("preserves whole bytes on failure %s " + step, (when) => {
      const config = oldConfig();
      const path = record.path(config);
      const legacyBytes = JSON.stringify(record.legacy) + "\n";
      fs.writeFileSync(path, legacyBytes, { mode: 0o600 });
      expect(record.read(config)).toEqual(record.old);
      const fired = interrupt(faults, when, (c) => cut(c, path));
      expect(record.next(config)).toBe(false);
      expect(fired()).toBe(true);
      const published = step === "record directory sync" || (step === "rename" && when === "after");
      expect(record.read({ ...config })).toEqual(published ? record.new : record.old);
      if (!published) expect(fs.readFileSync(path, "utf8")).toBe(legacyBytes);
      expect(record.next(config)).toBe(true);
      expect(record.read({ ...config })).toEqual(record.new);
      expect(fs.statSync(path).mode & 0o777).toBe(0o600);
    });
  }

  it.each(["before", "after"] as const)(
    "recovers %s creating an operator directory below a new ancestor",
    (when) => {
      const root = tempDir("rp1-a08-first-");
      const config = { ...oldConfig(), operatorDir: join(root, "new", "operator") };
      const fired = interrupt(faults, when, matches("mkdirSync", config.operatorDir));
      expect(record.next(config)).toBe(false);
      expect(fired()).toBe(true);
      expect(record.read(config)).toEqual({ kind: "NONE" });
      expect(record.next(config)).toBe(true);
      expect(record.read(config)).toEqual(record.new);
      expect(fs.statSync(config.operatorDir).mode & 0o777).toBe(0o700);
    },
  );

  it.each(["before", "after"] as const)(
    "retries the first directory-link barrier %s sync",
    (when) => {
      const root = tempDir("rp1-a08-link-");
      const config = { ...oldConfig(), operatorDir: join(root, "new", "operator") };
      const parent = dirname(config.operatorDir);
      const fired = interrupt(faults, when, matches("fsyncSync", parent));
      expect(record.next(config)).toBe(false);
      expect(fired()).toBe(true);
      expect(record.read(config)).toEqual({ kind: "NONE" });
      const retryBarrier = interrupt(faults, "before", matches("fsyncSync", parent));
      expect(record.next(config)).toBe(false);
      expect(retryBarrier()).toBe(true);
      expect(record.next(config)).toBe(true);
      expect(record.read(config)).toEqual(record.new);
    },
  );

  it("ignores an inert sibling after cleanup fails and leaves it outside the record identity", () => {
    const config = oldConfig();
    const path = record.path(config);
    fs.writeFileSync(path, JSON.stringify(record.legacy) + "\n", { mode: 0o600 });
    faults.before = (c) => {
      if ((c.op === "writeFileSync" || c.op === "unlinkSync") && c.path.startsWith(path + "."))
        throw new Error("injected");
    };
    expect(record.next(config)).toBe(false);
    expect(record.read(config)).toEqual(record.old);
    expect(
      fs.readdirSync(config.operatorDir).filter((entry) => entry.endsWith(".tmp")),
    ).toHaveLength(1);
    delete faults.before;
    expect(record.next(config)).toBe(true);
    expect(record.read(config)).toEqual(record.new);
  });

  it.each(["symlink", "writable", "foreign UID"] as const)(
    "rejects a %s file without replacing it",
    (fault) => {
      const config = oldConfig();
      const path = record.path(config);
      const original = fault === "symlink" ? path + ".outside" : path;
      const bytes = JSON.stringify(record.legacy) + "\n";
      fs.writeFileSync(original, bytes, { mode: 0o600 });
      if (fault === "writable") fs.chmodSync(original, 0o620);
      if (fault === "symlink") fs.symlinkSync(original, path);
      if (fault === "foreign UID")
        faults.after = (c, result) => {
          if ((c.op === "fstatSync" || c.op === "lstatSync") && c.path === path)
            Object.assign(result as fs.Stats, { uid: process.getuid!() + 1 });
        };
      expect(record.read(config)).toEqual({ kind: "UNREADABLE" });
      expect(record.next(config)).toBe(false);
      if (record.remove) expect(record.remove(config)).toBe(false);
      expect(fs.readFileSync(original, "utf8")).toBe(bytes);
    },
  );

  if (record.remove) {
    for (const op of ["unlinkSync", "fsyncSync"] as const) {
      it.each(["before", "after"] as const)("refuses to acknowledge removal %s " + op, (when) => {
        const config = oldConfig();
        const path = record.path(config);
        fs.writeFileSync(path, JSON.stringify(record.legacy) + "\n", { mode: 0o600 });
        const fired = interrupt(
          faults,
          when,
          matches(op, op === "unlinkSync" ? path : dirname(path)),
        );
        expect(record.remove!(config)).toBe(false);
        expect(fired()).toBe(true);
        const stillVisible = op === "unlinkSync" && when === "before";
        expect(record.read(config)).toEqual(stillVisible ? record.old : { kind: "NONE" });
        if (!stillVisible) {
          const retryBarrier = interrupt(faults, "before", matches("fsyncSync", dirname(path)));
          expect(record.remove!(config)).toBe(false);
          expect(retryBarrier()).toBe(true);
        }
        expect(record.remove!(config)).toBe(true);
        expect(record.read(config)).toEqual({ kind: "NONE" });
      });
    }
  }
});
