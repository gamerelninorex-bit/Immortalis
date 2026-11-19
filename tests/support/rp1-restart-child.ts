// Invoked in a fresh Node process by the restart witness. Its output contains only
// outcome labels and filesystem operation counts for the private synthetic fixture.
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  authorizeAdvanceRequestHost,
  bindAdvanceRequestHost,
  advanceRequestSecretPath,
} from "../../packages/operator/src/advance-request-exchange.ts";
import {
  authorizeObserveRequestHost,
  bindObserveRequestHost,
  observeRequestSecretPath,
} from "../../packages/operator/src/observe-request-exchange.ts";
import {
  clearPending,
  PENDING_FORMAT,
  pendingPath,
  readPending,
  writePending,
} from "../../apps/phone/src/recovery.ts";
import { goalRecordPath, readGoal, writeGoal } from "../../apps/phone/src/goal-record.ts";
import {
  dropInputs,
  emptyRoute,
  readRouteRecord,
  routeRecordPath,
  writeRouteRecord,
} from "../../apps/phone/src/route-record.ts";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import { observeFileOps } from "./rp1-filesystem.ts";

const [root, kind, action, cut] = process.argv.slice(2);
assert(root && kind && action);
const stateDir = join(root, "operator");
const campaignId = "campaign-rp1";
const bindParams = {
  stateDir,
  campaignId,
  operatorUid: process.getuid!(),
  hostId: "host-a",
  pcId: "pc-a",
};
const config = { operatorDir: stateDir, campaignId } as PhoneConfig;
const value = action === "prepare" ? "old" : "new";
const phone = {
  pending: {
    path: pendingPath(config),
    write: () =>
      writePending(config, {
        format: PENDING_FORMAT,
        format_version: 1,
        campaign_id: campaignId,
        run_id: "original-run",
        request_run_id: "original-request",
        command: "collect",
        options: { amount: "3" },
        dispatched_at: 115,
        state: "DISPATCHED",
        blocker: value,
        identity: null,
      }),
    read: () => {
      const got = readPending(config);
      return got.kind === "PENDING" ? got.pending.blocker : got.kind;
    },
    remove: () => clearPending(config),
  },
  goal: {
    path: goalRecordPath(config),
    write: () =>
      writeGoal(config, {
        id: "0000000000000001",
        amount: 3,
        until: "complete",
        outcome: "IN_PROGRESS",
        step: value === "old" ? "ADOPTING" : "COMMITTING",
        dispatch_ref: "original-dispatch",
      }),
    read: () => {
      const got = readGoal(config);
      return got.kind === "RECORD" ? got.goal.step : got.kind;
    },
  },
  route: {
    path: routeRecordPath(config),
    write: () =>
      writeRouteRecord(config, {
        ...emptyRoute(config),
        handling: value === "old" ? "I take the low branch." : "I steady the branch.",
      }),
    read: () => {
      const got = readRouteRecord(config);
      return got.kind === "RECORD" ? got.record.handling : got.kind;
    },
    remove: () => dropInputs(config, ["handling"]),
  },
};
const record = phone[kind as keyof typeof phone];
const path =
  record?.path ??
  (kind === "advance" ? advanceRequestSecretPath : observeRequestSecretPath)(
    bindParams,
    bindParams.hostId,
  );

const counts: Record<string, number> = {};
const begin = performance.now();
const output = (result: unknown) => {
  fs.writeSync(1, `${JSON.stringify({ result, counts, ms: performance.now() - begin })}\n`);
};
function count(op: string, path: string): void {
  if (path === root || path.startsWith(root + "/")) counts[op] = (counts[op] ?? 0) + 1;
}
function crash(): never {
  output("interrupted");
  process.kill(process.pid, "SIGKILL");
  throw new Error("SIGKILL did not stop the fixture");
}
const callCounts: Record<string, string> = {
  openSync: "open",
  readFileSync: "read",
  writeFileSync: "write",
  writeSync: "write",
  fsyncSync: "sync",
  fchmodSync: "mode",
  chmodSync: "mode",
  linkSync: "link",
  renameSync: "rename",
  unlinkSync: "unlink",
  rmSync: "unlink",
  mkdirSync: "mkdir",
  readdirSync: "list",
  fstatSync: "stat",
  lstatSync: "stat",
};
const tracked = observeFileOps(
  { ...fs },
  {
    before(c) {
      count(callCounts[c.op]!, c.path);
    },
    after(c) {
      if (
        cut === "publish" &&
        (c.op === "linkSync" || c.op === "renameSync") &&
        c.destination === path
      )
        crash();
      if (cut === "remove" && (c.op === "unlinkSync" || c.op === "rmSync") && c.path === path)
        crash();
    },
  },
);
for (const name of [...Object.keys(callCounts), "closeSync"] as (keyof typeof fs)[])
  Object.assign(fs, { [name]: tracked[name] });
const fsp = fs.promises;
for (const op of [
  "link",
  "unlink",
  "rename",
  "mkdir",
  "chmod",
  "stat",
  "readFile",
  "readdir",
] as const) {
  const original = fsp[op];
  const category =
    op === "chmod" ? "mode" : op === "readFile" ? "read" : op === "readdir" ? "list" : op;
  Object.assign(fsp, {
    [op]: async (...args: unknown[]) => {
      count(category, String(args[0]));
      const result: unknown = await Reflect.apply(original, fsp, args);
      if (cut === "publish" && (op === "link" || op === "rename") && args[1] === path) crash();
      return result;
    },
  });
}
const open = fsp.open;
fsp.open = async (path, flags, mode) => {
  count("open", String(path));
  const file = await open(path, flags, mode);
  const sync = file.sync.bind(file);
  file.sync = () => {
    count("sync", String(path));
    return sync();
  };
  const write = file.writeFile.bind(file);
  file.writeFile = (...args) => {
    count("write", String(path));
    return write(...args);
  };
  return file;
};
syncBuiltinESMExports();

if (record) {
  let result: unknown;
  if (action === "prepare" || action === "write") result = record.write();
  else if (action === "read") result = record.read();
  else if (action === "remove" && "remove" in record) result = record.remove();
  else throw new Error("unknown fixture action");
  output(result);
} else {
  const bind = kind === "advance" ? bindAdvanceRequestHost : bindObserveRequestHost;
  const authorize = kind === "advance" ? authorizeAdvanceRequestHost : authorizeObserveRequestHost;
  if (action === "bind") {
    const result = await bind(bindParams);
    output(result.ok ? "bound" : result.error.code);
  } else {
    const credential = fs.readFileSync(path, "utf8").trim();
    const auth = await authorize(bindParams, bindParams.operatorUid, bindParams.hostId, credential);
    output(auth.ok ? auth.value.pc_id : auth.error.code);
  }
}
