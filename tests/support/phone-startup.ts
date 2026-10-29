/* eslint-disable @typescript-eslint/no-explicit-any -- real-process probe and scripted MCP */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Chat, PLAYER, REFEREE } from "./chat-client.ts";
import type { Slot } from "./chat-setting.ts";
export const BASE = "8490f94cb3d29f3e538425bf89ed8fac08477cff";

export async function boot(
  s: Slot,
  o: { source?: string; env?: Record<string, string>; cut?: string; when?: string } = {},
) {
  const source = o.source ?? process.cwd();
  const input = join(s.root, "boot-probe.json");
  writeFileSync(
    input,
    JSON.stringify({ root: s.root, campaignDir: s.campaignDir, cut: o.cut, when: o.when }),
    { mode: 0o600 },
  );
  const config = s.config;
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      join(process.cwd(), "tests/integration/fixtures/phone-startup-process.ts"),
      source,
      input,
    ],
    {
      cwd: source,
      env: {
        ...process.env,
        IMMORTALIS_CAMPAIGN_DIR: config.campaignDir,
        IMMORTALIS_CAMPAIGN_ID: config.campaignId,
        IMMORTALIS_OPERATOR_DIR: config.operatorDir,
        IMMORTALIS_PLAYER_TOKEN: PLAYER,
        IMMORTALIS_REFEREE_TOKEN: REFEREE,
        IMMORTALIS_REFEREE_HOST_IDS: config.refereeHostIds.join(","),
        IMMORTALIS_TRANSPORT: "insecure-loopback",
        IMMORTALIS_PUBLIC_URL: s.base,
        IMMORTALIS_SCENARIO_FILE: config.scenarioFile,
        IMMORTALIS_PLAYER_VIEW_HOST_ID: config.playerViewHostId ?? "",
        PORT: String(config.port),
        ...(config.refereeBindings
          ? {
              IMMORTALIS_REFEREE_BINDINGS: JSON.stringify(
                Object.fromEntries(config.refereeBindings.map((b) => [b.hostId, b.operations])),
              ),
            }
          : {}),
        ...o.env,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  let logs = "";
  child.stdout!.on("data", (d) => {
    logs += String(d);
  });
  child.stderr!.on("data", (d) => {
    logs += String(d);
  });
  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const result = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("startup did not settle within probe deadline"));
    }, 20_000);
    child.once("message", (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    void exited.then((exit) => {
      clearTimeout(timer);
      resolve({ ready: false, ...exit });
    }, reject);
  });
  return {
    ...result,
    logs: () => logs,
    child,
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      await exited;
    },
  };
}
export async function linked(s: Slot, lane: "player" | "referee") {
  const chat = new Chat(s.base);
  if (!(await chat.link(lane, lane === "player" ? { player: PLAYER } : { referee: REFEREE })).ok)
    throw new Error("probe authentication failed");
  await chat.init({});
  return chat;
}
/** Digests, modes and mtimes only; never print private contents or generated secrets. */
export function snapshot(dir: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  function walk(path: string) {
    const st = lstatSync(path);
    if (st.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
    else
      result[path.slice(dir.length)] = {
        mode: st.mode & 0o777,
        mtime: st.mtimeMs,
        digest: st.isSymbolicLink()
          ? "symlink"
          : createHash("sha256").update(readFileSync(path)).digest("hex"),
      };
  }
  walk(dir);
  return result;
}
