/* eslint-disable @typescript-eslint/no-explicit-any -- isolated real-process fault harness */
// This child runs the real authenticated service. Referees run independently in the parent.
// SIGKILL is deliberate; no test-only owner, result or confirmation is installed.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import {
  CanonicalCampaign,
  PcCollectionAdapter,
  ProductionAdapter,
  RefereeAdjudicationAdapter,
  SourceDrawdownAdapter,
  TemporalCoordinator,
  nodeFs,
} from "@immortalis/engine";
import { createPhoneServer } from "../../../apps/phone/src/server.ts";
import { pendingPath } from "../../../apps/phone/src/recovery.ts";
import { Chat, PLAYER, humanConfirms } from "../../support/chat-client.ts";

const cfg = JSON.parse(fs.readFileSync(process.argv[2]!, "utf8"));
const { config, target, when, tool, args, marker, fault } = cfg;
function hit(phase: string) {
  if (phase !== when) return;
  fs.appendFileSync(marker, `${phase}\n`);
  if (fault === "EIO") throw Object.assign(new Error("injected filesystem fault"), { code: "EIO" });
  process.kill(process.pid, "SIGKILL");
}
const classes: Record<string, any> = {
  CanonicalCampaign,
  PcCollectionAdapter,
  ProductionAdapter,
  RefereeAdjudicationAdapter,
  SourceDrawdownAdapter,
  TemporalCoordinator,
};
if (target.includes(".")) {
  const [name, op] = target.split(".");
  const proto = classes[name].prototype;
  const original = proto[op];
  let publishing = false;
  if (fault === "EIO") {
    const write = nodeFs.writeFileDurable;
    nodeFs.writeFileDurable = async (path, data) => {
      const match = publishing && path === `${config.campaignDir}/manifest.json`;
      if (match) hit("before");
      await write(path, data);
      if (match) hit("after");
    };
  }
  proto[op] = async function (...a: unknown[]) {
    if (fault !== "EIO") hit("before");
    publishing = true;
    try {
      const result = await original.apply(this, a);
      if (fault !== "EIO") {
        if (!result.ok) throw new Error(`publication refused: ${JSON.stringify(result.error)}`);
        hit("after");
      }
      return result;
    } finally {
      publishing = false;
    }
  };
} else if (target === "scenario") {
  const original = fs.linkSync;
  fs.linkSync = ((from: any, to: any) => {
    if (String(to) === config.scenarioFile) hit("before");
    const result = original(from, to);
    if (String(to) === config.scenarioFile) hit("after");
    return result;
  }) as typeof fs.linkSync;
  syncBuiltinESMExports();
} else if (target === "settlement") {
  const original = fs.rmSync;
  fs.rmSync = ((path: any, options: any) => {
    if (String(path) === pendingPath(config)) hit("before");
    const result = original(path, options);
    if (String(path) === pendingPath(config)) hit("after");
    return result;
  }) as typeof fs.rmSync;
  syncBuiltinESMExports();
} else if (target === "manifest") {
  const original = nodeFs.writeFileDurable;
  nodeFs.writeFileDurable = async (path, data) => {
    const match = path === `${config.campaignDir}/manifest.json`;
    if (match) hit("before");
    await original(path, data);
    if (match) hit("after");
  };
} else throw new Error("unknown fault target");

const app = createPhoneServer(config, { pollMs: 10, chat: { settleMs: 20 } });
await app.listen();
const chat = new Chat(`http://127.0.0.1:${config.port}`);
if (!(await chat.link("player", { player: PLAYER })).ok) throw new Error("link failed");
await chat.init({ elicitation: {} });
const human = (e: any) => {
  if (e.requestedSchema?.properties?.accept || e.requestedSchema?.properties?.reply) {
    fs.appendFileSync(`${marker}.consent`, "human confirmed\n");
    return humanConfirms(e);
  }
  return { action: "accept" as const, content: {} };
};
const start = await chat.call(tool, args);
if (start.isError) throw new Error(start.text);
for (let i = 0; i < 20; i++) {
  const out = await chat.call("await_action", { wait_seconds: 10 }, human);
  if (out.data?.state === "FINISHED") break;
}
await app.close();
if (!fs.existsSync(marker)) throw new Error("fault boundary was never reached");
