// One contender for a campaign's single-writer lock, in its OWN operating-system process.
// usage: WL_CONFIG='<json>' node --experimental-strip-types writer-lock-process.ts
//
// It opens the package through the real `nodeFs`, wrapped only to (a) pause at a named point so a test can
// force an exact cross-process interleaving, and (b) SIGKILL the process at the Nth mutating filesystem
// operation, so a crash at each arbitration point is a real process death rather than a thrown exception.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nodeFs, openFileCampaign, type FsOps } from "@immortalis/engine";
import { TEST_OWNERS } from "@immortalis/testkit";

interface Config {
  readonly dir: string;
  readonly tag: string;
  /** directory the test and the contenders exchange marker files in */
  readonly sync: string;
  readonly reclaim: boolean;
  /** after the first successful read of LOCK, announce `<tag>.observed` and wait for `<tag>.go` */
  readonly pauseAfterLockRead?: boolean;
  /** SIGKILL this process at the `at`th mutating op (1-based); `at: 0` only counts */
  readonly crash?: { readonly at: number; readonly when: "before" | "after" };
  /** after acquiring, wait for `<tag>.finish`, then close */
  readonly hold?: boolean;
  /** after acquiring, close immediately (the release path then runs inside this process) */
  readonly closeAfterOpen?: boolean;
}

const cfg = JSON.parse(process.env.WL_CONFIG ?? "null") as Config;
const marker = (name: string) => join(cfg.sync, `${cfg.tag}.${name}`);
const wait = async (path: string) => {
  const deadline = Date.now() + 60_000;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};

const MUTATING = [
  "writeFileDurable",
  "appendDurable",
  "truncate",
  "remove",
  "createExclusive",
  "mkdirp",
] as const;
let ops = 0;
let paused = false;
const fs: Record<string, unknown> = { ...nodeFs };
for (const name of MUTATING) {
  const original = nodeFs[name] as (...a: never[]) => Promise<void>;
  fs[name] = async (...args: never[]) => {
    ops += 1;
    if (cfg.crash && cfg.crash.at === ops && cfg.crash.when === "before")
      process.kill(process.pid, "SIGKILL");
    await original(...args);
    if (cfg.crash && cfg.crash.at === ops && cfg.crash.when === "after")
      process.kill(process.pid, "SIGKILL");
  };
}
if (cfg.pauseAfterLockRead) {
  fs.readFile = async (path: string) => {
    const data = await nodeFs.readFile(path);
    if (!paused && path.endsWith("/LOCK")) {
      paused = true;
      writeFileSync(marker("observed"), "");
      await wait(marker("go"));
    }
    return data;
  };
}

const opened = await openFileCampaign(cfg.dir, {
  owners: TEST_OWNERS,
  reclaimStaleLock: cfg.reclaim,
  buildId: `contender-${cfg.tag}`,
  fs: fs as unknown as FsOps,
});
const result = opened.ok
  ? { tag: cfg.tag, pid: process.pid, ok: true, ops }
  : { tag: cfg.tag, pid: process.pid, ok: false, code: opened.error.code, ops };
writeFileSync(marker("result"), JSON.stringify(result));
console.log(JSON.stringify(result));
if (opened.ok) {
  if (cfg.hold) {
    await wait(marker("finish"));
    await opened.value.close();
  } else if (cfg.closeAfterOpen) {
    await opened.value.close();
  }
}
writeFileSync(marker("exit"), JSON.stringify({ ops }));
