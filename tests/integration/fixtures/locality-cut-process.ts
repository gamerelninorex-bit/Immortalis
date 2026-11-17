// Test-only entry into the real CLI through its existing campaignFs seam. No owner extension.
// The IPC channel holds the process at an actual filesystem boundary until the parent kills it.
import { join, resolve } from "node:path";
import { nodeFs, type FsOps } from "@immortalis/engine";
import { runCli } from "@immortalis/operator";

const [cut, ...args] = process.argv.slice(2);
if (cut !== "before-first-file" && cut !== "before-manifest")
  throw new Error("unknown locality test cut");
const campaign = args[args.indexOf("--campaign") + 1];
if (!campaign || !args.includes("--campaign")) throw new Error("campaign path required");
const target = resolve(campaign);

function hold(path: string): Promise<never> {
  const send = process.send?.bind(process);
  if (!send) throw new Error("the locality cut requires a parent IPC channel");
  return new Promise((_, reject) => {
    // A message listener keeps the IPC channel referenced. There is deliberately no release path:
    // the test must inspect the paused state and terminate this real process with SIGKILL.
    process.once("message", () =>
      reject(new Error("the locality cut must be killed, not released")),
    );
    send({ cut, path }, (error) => {
      if (error) reject(error);
    });
  });
}

const fs: FsOps = {
  ...nodeFs,
  createExclusive: async (path, data) => {
    if (cut === "before-first-file" && resolve(path) === join(target, "LOCK")) await hold(path);
    await nodeFs.createExclusive(path, data);
  },
  writeFileDurable: async (path, data) => {
    if (cut === "before-manifest" && resolve(path) === join(target, "manifest.json"))
      await hold(path);
    await nodeFs.writeFileDurable(path, data);
  },
};

process.exitCode = await runCli(args, { campaignFs: fs });
