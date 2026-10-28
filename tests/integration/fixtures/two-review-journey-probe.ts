/* eslint-disable @typescript-eslint/no-explicit-any -- scripted authenticated human/referee plumbing */
// Whole-operation mechanism counters. No Work/client or genuine interpretation claim.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { CanonicalCampaign } from "@immortalis/engine";
import { Chat, PLAYER, humanConfirms } from "../../support/chat-client.ts";
import { routeMeter } from "../../support/route-meter.ts";
const input = JSON.parse(readFileSync(process.argv[3]!, "utf8"));
const { config, setting, character, variation, missing, mode } = input;
const { createPhoneServer } = await import(
  pathToFileURL(`${process.argv[2]}/apps/phone/src/server.ts`).href
);
const meter = routeMeter();
const begin = performance.now();
const app = createPhoneServer(config, { pollMs: 10, chat: { settleMs: 20 } });
await app.listen();
const chat = new Chat(`http://127.0.0.1:${config.port}`);
const reviews: any[] = [];
const tools: Record<string, number> = {};
let reviewParts = 0;
let typed = 0,
  fixtureMs = 0,
  requests = 0,
  requestBytes = 0,
  responseBytes = 0;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  requests++;
  if (init?.body) requestBytes += Buffer.byteLength(String(init.body));
  return nativeFetch(input, init);
};
const human = (e: any) => {
  reviewParts++;
  if (e.requestedSchema?.properties?.accept || e.requestedSchema?.properties?.reply) {
    reviews.push({
      channel: "elicitation",
      category: /CHARACTER|character's|PHYSICAL LOCUS|NATIVE PRESENCE/.test(e.message)
        ? "generation"
        : "setting",
    });
    if (e.requestedSchema.properties.reply) typed++;
  }
  return e.requestedSchema?.properties?.accept || e.requestedSchema?.properties?.reply
    ? humanConfirms(e)
    : { action: "accept" as const, content: {} };
};
const call = async (name: string, args: any = {}) => {
  tools[name] = (tools[name] ?? 0) + 1;
  const r = await chat.call(name, args, human);
  responseBytes += Buffer.byteLength(JSON.stringify(r.result ?? r.json));
  return r;
};
async function drive(name: string, args: any = {}) {
  let r = await call(name, args);
  const deadline = Date.now() + 45_000;
  for (;;) {
    if (r.isError) throw new Error(`${name}: ${r.text}`);
    const view = r.result?._meta?.review;
    if (view) {
      reviews.push({ channel: "ui", category: view.category });
      r = await call("submit_review_decision", {
        proposal_id: view.proposal_id,
        digest: view.digest,
        capability: view.capability,
        decision: "accept",
      });
    }
    if (r.data?.state === "FINISHED") return r;
    if (Date.now() > deadline) throw new Error(`did not settle ${name}`);
    r = await call("await_action", { after: 0, wait_seconds: 1 });
  }
}
async function unrelated() {
  meter.active(false);
  const start = performance.now();
  const c = await CanonicalCampaign.open(config.campaignDir, {
    buildId: "two-review-dormant-fixture",
  });
  if (!c.ok) throw new Error(c.error.code);
  try {
    const original = c.value.locus("world-courtyard", "locus-courtyard")!.value;
    const pub = (n: number) => ({
      group_id: `dormant:${n}:group`,
      intent_id: `dormant:${n}:intent`,
      cause: `dormant:${n}`,
      basis: "independent dormant fixture",
      secrecy: "local-operator-session",
    });
    if (variation.facts || variation.history) {
      for (let n = 0; n < Math.max(1, variation.facts); n++) {
        const r = await c.value.establishLocus({
          ...pub(n),
          locus: { ...original, locus_id: `unused-${n}`, designation: `Remote unused locus ${n}` },
        });
        if (!r.ok) throw new Error(r.error.code);
      }
      for (let n = 0; n < variation.history; n++) {
        // Immutable independent remote-locus publications grow dormant journal history legally before chronology/PC release.
        // This history fixture also grows rows; it does not claim to isolate journal depth from state cardinality.
        const r = await c.value.establishLocus({
          ...pub(n + 1000),
          locus: {
            ...original,
            locus_id: `history-unused-${n}`,
            designation: `Independent remote history publication ${n}`,
          },
        });
        if (!r.ok) throw new Error(r.error.code);
      }
    }
  } finally {
    await c.value.close();
    fixtureMs += performance.now() - start;
    meter.active(true);
  }
}
try {
  if (!(await chat.link("player", { player: PLAYER })).ok) throw new Error("link failed");
  // Both modes receive the same capabilities. Base ignores UI and uses native elicitation; current selects the inline card.
  await chat.init({
    elicitation: {},
    extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } },
  });
  const resource = await chat.rpc("resources/read", { uri: "ui://immortalis/review-v1.html" });
  const inlineResource = !!resource.json?.result?.contents;
  const { opening: settingOpening, ...physicalSetting } = setting;
  const { opening: characterOpening, ...pc } = character;
  await drive("propose_original_setting", mode === "base" ? physicalSetting : setting);
  await unrelated();
  await drive("propose_original_character", mode === "base" ? pc : character);
  if (mode === "base") {
    await drive("place_original_character", { statement: characterOpening.presence });
    await drive("establish_character_location");
    if (!missing) {
      await drive("state_starting_moment", settingOpening.chronology);
      await drive("propose_collection_preparation", characterOpening.preparation);
      await drive("declare_closed_setting", settingOpening.declaration);
      await drive("finish_collection_setup");
    }
  } else {
    for (let n = 0; n < 100; n++) {
      const r = await call("await_action", { after: 0, wait_seconds: 1 });
      if (r.result?._meta?.review) throw new Error("redundant technical review");
      const o = r.result?.structuredContent?.opening;
      if (o && o.state !== "REALIZING") {
        if (o.state !== (missing ? "MISSING_SOURCE" : "PREPARED"))
          throw new Error(JSON.stringify(o));
        break;
      }
      if (n === 99) throw new Error("opening not settled");
    }
  }
  if (!missing)
    for (const [name, args] of [
      ["collect", { amount: 5 }],
      ["continue_collection", {}],
      ["finish_collection", {}],
    ] as const) {
      const completed = await drive(name, args);
      if (completed.data?.exit_code !== 0)
        throw new Error(`${mode} ordinary ${name} failed (${completed.data?.exit_code})`);
    }
  const work = meter.snapshot();
  const ms = performance.now() - begin - fixtureMs;
  meter.active(false);
  const opened = await CanonicalCampaign.open(config.campaignDir, {
    buildId: "two-review-evidence-read",
  });
  if (!opened.ok) throw new Error(opened.error.code);
  let state: any;
  try {
    const c = opened.value;
    const facts = c.store.listFacts();
    state = {
      source: c.sourceCondition("world-courtyard", "src-loose-stones")!.value.recoverable.amount,
      reserves: facts
        .filter((f) => f.key.startsWith("production/reserve/"))
        .map((f) => (f.value as any).quantity.amount),
      time: (c.store.getFact("temporal/state")?.value as any)?.canonical_time.value ?? null,
      commitments: facts.filter(
        (f) => f.key.includes("/collection/") && f.key.endsWith("/commitment"),
      ).length,
      custody: !!c.pcPhysicalLocusCustody(c.binding()!.value.active_pc.entity_id),
    };
  } finally {
    await opened.value.close();
  }
  process.stdout.write(
    JSON.stringify({
      mode,
      missing,
      inlineResource,
      variation,
      reviews,
      typedChallenges: typed,
      reviewParts,
      scriptedOAuthLinks: 1,
      pageSwitches: 0,
      tools,
      requests,
      requestBytes,
      responseBytes,
      ms,
      work,
      state,
    }),
  );
} finally {
  meter.stop();
  globalThis.fetch = nativeFetch;
  await app.close();
}
