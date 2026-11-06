/* eslint-disable @typescript-eslint/no-explicit-any -- scripted mechanism evidence process */
// No live model, supported client or retained-storage claim. Executes either the exact base or candidate adapter against unchanged owners.
import { CanonicalCampaign } from "@immortalis/engine";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { Chat, PLAYER } from "../../support/chat-client.ts";
import { routeMeter, subtractWork } from "../../support/route-meter.ts";
const { config, setting, character, omission, dormant } = JSON.parse(
  readFileSync(process.argv[3]!, "utf8"),
);
const { createPhoneServer } = await import(
  pathToFileURL(`${process.argv[2]}/apps/phone/src/server.ts`).href
);
const app = createPhoneServer(config, { pollMs: 10, chat: { settleMs: 20 } });
await app.listen();
const chat = new Chat(`http://127.0.0.1:${config.port}`);
const meter = routeMeter();
let tools = 0,
  requests = 0,
  requestBytes = 0,
  readbackBytes = 0;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  requests++;
  requestBytes += init?.body ? Buffer.byteLength(String(init.body)) : 0;
  const response = await nativeFetch(input, init);
  readbackBytes += (await response.clone().arrayBuffer()).byteLength;
  return response;
};
const call = async (name: string, args: any = {}) => {
  tools++;
  const r = await chat.call(name, args, () => {
    throw new Error("unexpected approval");
  });
  if (r.result?._meta?.review) throw new Error("unexpected approval surface");
  return r;
};
async function drive(name: string, args: any = {}) {
  let r = await call(name, args);
  for (let n = 0; n < 100 && !r.isError; n++) {
    if (r.data?.state === "FINISHED" || r.result?.structuredContent?.opening?.state === "REALIZING")
      return r;
    r = await call("await_action", { after: 0, wait_seconds: 1 });
  }
  return r;
}
async function settled() {
  for (let n = 0; n < 120; n++) {
    const r = await call("await_action", { after: 0, wait_seconds: 1 });
    const o = r.result?.structuredContent?.opening;
    if (o && o.state !== "REALIZING") return o.state;
  }
  throw new Error("opening did not settle");
}
async function readOwner() {
  meter.active(false);
  const opened = await CanonicalCampaign.open(config.campaignDir, {
    buildId: "handling-evidence-read",
  });
  if (!opened.ok) throw new Error(opened.error.code);
  const c = opened.value;
  try {
    const facts = c.store.listFacts();
    return {
      source: c.sourceCondition("world-courtyard", "src-loose-stones")!.value.recoverable.amount,
      reserves: facts
        .filter((f) => f.key.startsWith("production/reserve/"))
        .map((f) => (f.value as any).quantity.amount),
      time: (c.store.getFact("temporal/state")?.value as any)?.canonical_time.value ?? null,
      characters: facts.filter(
        (f) => f.owner === "pc_existence" && f.facet === "existence_contract",
      ).length,
      commitments: facts.filter((f) => f.key.endsWith("/commitment")).length,
      refereeRecords: facts.filter((f) => f.owner === "referee_adjudication_kernel").length,
    };
  } finally {
    await c.close();
    meter.active(true);
  }
}
const counters = () => ({ tools, requests, requestBytes, readbackBytes });
async function measure(f: () => Promise<unknown>) {
  const before = meter.snapshot(),
    traffic = counters(),
    start = performance.now();
  const value = await f();
  return {
    value,
    ms: performance.now() - start,
    work: subtractWork(meter.snapshot(), before),
    traffic: subtractWork(counters(), traffic),
  };
}
try {
  if (!(await chat.link("player", { player: PLAYER })).ok) throw new Error("link failed");
  const init = await chat.init({});
  const list = await chat.rpc("tools/list");
  const guidanceBytes = {
    initialize: Buffer.byteLength(JSON.stringify(init.json)),
    tools: Buffer.byteLength(JSON.stringify(list.json)),
  };
  const setup = await drive("propose_original_setting", setting);
  if (setup.isError || setup.data.exit_code !== 0) throw new Error(setup.text);
  // Independently owned dormant setup state, excluded symmetrically from journey measurements.
  meter.active(false);
  const opened = await CanonicalCampaign.open(config.campaignDir, {
    buildId: "handling-dormant-fixture",
  });
  if (!opened.ok) throw new Error(opened.error.code);
  try {
    const c = opened.value,
      locus = c.locus("world-courtyard", "locus-courtyard")!.value;
    for (let n = 0; n < dormant; n++) {
      const r = await c.establishLocus({
        group_id: `handling-dormant-${n}-group`,
        intent_id: `handling-dormant-${n}-intent`,
        cause: "independent dormant fixture",
        basis: "unrelated remote locus",
        secrecy: "local-operator-session",
        locus: { ...locus, locus_id: `unused-${n}`, designation: `Unrelated unused locus ${n}` },
      });
      if (!r.ok) throw new Error(r.error.code);
    }
  } finally {
    await opened.value.close();
    meter.active(true);
  }
  const offered = structuredClone(character);
  if (omission) offered.exceptions = [];
  const attempt = await measure(async () => {
    const r = await drive("propose_original_character", offered);
    return { refused: r.isError, opening: r.isError ? null : await settled() };
  });
  const afterAttempt = await readOwner();
  const correction =
    omission && (attempt.value as any).refused
      ? await measure(async () => {
          const r = await drive("propose_original_character", character);
          if (r.isError) throw new Error(r.text);
          return settled();
        })
      : null;
  const prepared = await readOwner();
  const move = prepared.reserves.length
    ? await measure(async () => {
        for (const [name, args] of [
          ["collect", { amount: 1 }],
          ["continue_collection", {}],
          ["finish_collection", {}],
        ] as const) {
          const r = await drive(name, args);
          if (r.isError || r.data.exit_code !== 0) throw new Error(`${name}: ${r.text}`);
        }
        return "COMPLETED";
      })
    : null;
  const final = await readOwner();
  process.stdout.write(
    JSON.stringify({
      guidanceBytes,
      attempt,
      afterAttempt,
      correction,
      prepared,
      move,
      final,
      approvals: 0,
    }),
  );
} finally {
  meter.stop();
  globalThis.fetch = nativeFetch;
  await app.close();
}
