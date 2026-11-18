import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { onTestFinished } from "vitest";
import type { ProcessRun } from "./operator.ts";

type LocalityCut = "before-first-file" | "before-manifest";

/** Inspect a real CLI child paused at the existing FsOps seam, then kill it. No progress-text timing. */
export async function killLocalityAtCut(
  args: string[],
  cut: LocalityCut,
  inspect: () => void | Promise<void>,
): Promise<ProcessRun> {
  const campaign = args[args.indexOf("--campaign") + 1];
  if (!campaign || !args.includes("--campaign")) throw new Error("campaign path required");
  const expected = join(resolve(campaign), cut === "before-first-file" ? "LOCK" : "manifest.json");
  const child = spawn(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--experimental-strip-types",
      "tests/integration/fixtures/locality-cut-process.ts",
      cut,
      ...args,
    ],
    { stdio: ["pipe", "pipe", "pipe", "ipc"] },
  );
  let stdout = "",
    stderr = "",
    scanned = 0;
  child.stderr!.on("data", (data: Buffer) => (stderr += data.toString()));
  child.stdout!.on("data", (data: Buffer) => {
    stdout += data.toString();
    // Type only the actual command's own challenge. This is the same console interaction as runShipped.
    const prompt = /To confirm, type exactly "([^"]+)"[^\n]*\n> /g;
    prompt.lastIndex = scanned;
    for (let match = prompt.exec(stdout); match; match = prompt.exec(stdout)) {
      scanned = prompt.lastIndex;
      child.stdin!.write(`${match[1]}\n`);
    }
  });
  const closed = new Promise<ProcessRun>((done) => {
    child.once("close", (code, signal) => done({ code, signal, stdout, stderr }));
  });
  const ready = new Promise<void>((done, reject) => {
    child.once("error", reject);
    child.once("close", () =>
      reject(new Error(`locality child exited before ${cut}: ${stdout}\n${stderr}`)),
    );
    child.once("message", (message: unknown) => {
      const value = message as { cut?: unknown; path?: unknown } | null;
      if (!value || value.cut !== cut || value.path !== expected)
        reject(new Error("unexpected locality cut acknowledgement"));
      else done();
    });
  });
  // Also clean up if Vitest's existing test deadline fires while a broken fixture is awaiting input.
  onTestFinished(() => {
    child.kill("SIGKILL");
  });
  try {
    await ready;
    await inspect();
    if (!child.kill("SIGKILL")) throw new Error("paused locality child was not alive");
    return await closed;
  } finally {
    child.kill("SIGKILL");
    await closed;
  }
}
