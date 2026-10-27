/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP and raw owner readback */
// MECHANISM ONLY. Scripted player/referee; real canonical owners. Actual ChatGPT Work acceptance remains UNRUN.
import { writeFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import { Chat, PLAYER, REFEREE } from "../support/chat-client.ts";
import {
  cloneSlot,
  template,
  resumed,
  stage,
  follow,
  MOMENT,
  TAU,
  openOrdinary,
  type Slot,
} from "../support/chat-route.ts";
let ready: Slot;
beforeAll(async () => {
  ready = await template("READY", { cycle: true });
}, 300_000);
const read = async (s: Slot) => {
  const c = await openOrdinary(s.campaignDir);
  try {
    const facts = c.store.listFacts();
    return {
      head: c.store.head().state_sha256,
      source: (c.store.getFact("world/world-courtyard/source/src-loose-stones")!.value as any)
        .recoverable.amount,
      reserve: (facts.find((f) => f.key.startsWith("production/reserve/"))!.value as any).quantity
        .amount,
      time: (c.store.getFact("temporal/state")!.value as any).canonical_time.value,
      commitments: facts.filter(
        (f) => f.key.includes("/collection/") && f.key.endsWith("/commitment"),
      ).length,
    };
  } finally {
    await c.close();
  }
};

it("single ordinary requests work with elicitation ABSENT; no challenge/page, no inferred finish; reopen and recovery do not duplicate", async () => {
  const s = await cloneSlot(ready);
  let r = await resumed(s);
  const noHuman = () => {
    throw new Error("ordinary gameplay must not elicit a second confirmation");
  };
  try {
    await r.chat.init({}); // exact relevant transport condition, not proof of actual Work support
    const request = {
      jsonrpc: "2.0",
      id: "ordinary-attempt-once",
      method: "tools/call",
      params: { name: "collect", arguments: { amount: 2 } },
    };
    const [first, concurrent] = await Promise.all([
      r.chat.raw("POST", "/mcp", request, r.chat.headers()),
      r.chat.raw("POST", "/mcp", request, r.chat.headers()),
    ]);
    expect(first.json).toEqual(concurrent.json);
    const attempted = { finished: await follow(r.chat, noHuman, 20) };
    expect(attempted.finished.data.state).toBe("FINISHED");
    expect(attempted.finished.data.exit_code).toBe(0);
    expect(attempted.finished.elicited).toEqual([]);
    expect(JSON.stringify(attempted)).not.toMatch(/\/confirm|type exactly/);
    expect(await read(s)).toMatchObject({
      source: 12,
      reserve: 0,
      time: MOMENT.value,
      commitments: 1,
    });
    const once = await read(s);
    const replay = await r.chat.raw("POST", "/mcp", request, r.chat.headers());
    expect(replay.json).toEqual(first.json);
    const changed = await r.chat.raw(
      "POST",
      "/mcp",
      { ...request, params: { name: "collect", arguments: { amount: 3 } } },
      r.chat.headers(),
    );
    expect(changed.json.error).toBeDefined();
    expect(await read(s)).toEqual(once);
    expect((await stage(r.chat, "continue_collection", {}, noHuman)).finished.data.exit_code).toBe(
      0,
    );
    // A new consequential time choice still needs its own matching tool request.
    expect(await read(s)).toMatchObject({ source: 12, reserve: 0, time: MOMENT.value });
    expect((await stage(r.chat, "finish_collection", {}, noHuman)).finished.data.exit_code).toBe(0);
    const completed = await read(s);
    expect(completed).toMatchObject({
      source: 10,
      reserve: 2,
      time: MOMENT.value + 2 * TAU,
      commitments: 1,
    });
    await r.stop();
    r = await resumed(s);
    await r.chat.init({});
    await stage(r.chat, "reconcile_last_action", {}, noHuman);
    expect(await read(s)).toEqual(completed);
    const duplicateFinish = await stage(r.chat, "finish_collection", {}, noHuman);
    expect(duplicateFinish.finished.data.exit_code).toBe(3);
    expect(await read(s)).toEqual(completed);
    expect((await stage(r.chat, "collect", { amount: 1 }, noHuman)).finished.data.exit_code).toBe(
      0,
    );
    expect((await stage(r.chat, "continue_collection", {}, noHuman)).finished.data.exit_code).toBe(
      0,
    );
    expect((await stage(r.chat, "cease_collection", {}, noHuman)).finished.data.exit_code).toBe(0);
    expect(await read(s)).toMatchObject({
      source: 10,
      reserve: 2,
      time: MOMENT.value + 2 * TAU,
      commitments: 2,
    });
  } finally {
    await r.stop();
  }
}, 240_000);

it("absent/referee scope, another grant, model authority fields and a mismatching stored actor cannot dispatch a choice", async () => {
  const s = await cloneSlot(ready);
  const r = await resumed(s);
  try {
    const before = await read(s);
    const none = new Chat(s.base);
    expect((await none.call("collect", { amount: 1 })).status).toBe(401);
    const referee = new Chat(s.base);
    expect((await referee.link("referee", { referee: REFEREE })).ok).toBe(true);
    await referee.init({});
    expect((await referee.call("collect", { amount: 1 })).json.error).toBeDefined();
    const other = new Chat(s.base);
    other.clientId = r.chat.clientId;
    expect((await other.link("player", { player: PLAYER })).ok).toBe(true);
    other.session = r.chat.session;
    expect((await other.call("collect", { amount: 1 })).json.error).toBeDefined();
    for (const key of [
      "confirmed",
      "confirmation",
      "role",
      "permission",
      "campaign",
      "player_character",
      "owner",
      "act_id",
    ]) {
      expect((await r.chat.call("collect", { amount: 1, [key]: true })).isError).toBe(true);
    }
    writeFileSync(
      s.config.scenarioFile,
      JSON.stringify({
        player_character: "other-pc",
        world: "world-courtyard",
        source: "src-loose-stones",
        reserve: "reserve-chat",
        quantity_unit: "lump",
        mechanism: "mechanism-chat",
        basis: "basis-chat",
      }),
      { mode: 0o600 },
    );
    expect((await r.chat.call("finish_collection")).isError).toBe(true);
    expect(await read(s)).toEqual(before);
  } finally {
    await r.stop();
  }
}, 120_000);

it("A2: the same source-qualified ordinary operation at immutable base needs two extra challenges; current needs zero, with bounded adapter I/O", async () => {
  const { execFileSync } = await import("node:child_process");
  const { symlinkSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tempDir } = await import("../support/tmp.ts");
  const { startHosts } = await import("../support/chat-route.ts");
  const base = "189a6fcbd1b3c31fad91331346c0123a9e5f9990";
  const root = process.cwd();
  const extracted = tempDir("ordinary-action-base-");
  const archive = join(extracted, "source.tar");
  execFileSync("git", [
    "archive",
    `--output=${archive}`,
    base,
    "apps/phone/src",
    "packages/operator/src",
  ]);
  execFileSync("tar", ["-xf", archive, "-C", extracted]);
  symlinkSync(join(root, "node_modules"), join(extracted, "node_modules"), "dir");
  symlinkSync(
    join(root, "packages/operator/node_modules"),
    join(extracted, "packages/operator/node_modules"),
    "dir",
  );
  const evidence = [];
  for (const extra of [0, 4]) {
    const seed = await cloneSlot(ready);
    if (extra) {
      const c = await openOrdinary(seed.campaignDir);
      try {
        const original = c.locus("world-courtyard", "locus-courtyard")!.value;
        for (let i = 0; i < extra; i++) {
          const written = await c.establishLocus({
            group_id: `unrelated-${i}:group`,
            intent_id: `unrelated-${i}:intent`,
            cause: `unrelated-${i}`,
            basis: "unrelated measurement fixture",
            secrecy: "local-operator-session",
            locus: { ...original, locus_id: `remote-${i}` },
          });
          expect(written.ok).toBe(true);
        }
      } finally {
        await c.close();
      }
    }
    const pair: any = { extra };
    for (const [label, source] of [
      ["base", extracted],
      ["current", root],
    ] as const) {
      const s = await cloneSlot(seed);
      const hs = startHosts(s);
      const file = join(s.root, "probe.json");
      writeFileSync(file, JSON.stringify(s.config));
      try {
        // Asynchronous child lets the independent scripted referee in this process answer real tasks.
        const { spawn } = await import("node:child_process");
        const raw = await new Promise<string>((resolve, reject) => {
          const p = spawn(
            process.execPath,
            [
              "--experimental-strip-types",
              join(root, "tests/integration/fixtures/ordinary-action-probe.ts"),
              source,
              file,
            ],
            { cwd: root },
          );
          let out = "",
            err = "";
          p.stdout.on("data", (d) => {
            out += String(d);
          });
          p.stderr.on("data", (d) => {
            err += String(d);
          });
          p.on("error", reject);
          p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || out))));
        });
        pair[label!] = JSON.parse(raw);
        expect(await read(s)).toMatchObject({
          source: 10,
          reserve: 2,
          time: MOMENT.value + 2 * TAU,
          commitments: 1,
        });
      } finally {
        for (const h of hs) await h.stop();
      }
    }
    expect(pair.base.challenges).toBe(2);
    expect(pair.current.challenges).toBe(0);
    // No extra canonical load or durable write is introduced by removing the interaction gate.
    expect(pair.current.work.opens).toBe(pair.base.work.opens);
    expect(pair.current.work.fs_writes).toBe(pair.base.work.fs_writes);
    evidence.push(pair);
  }
  console.log(
    "ORDINARY_ACTION_A2",
    JSON.stringify({
      base,
      head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      node: process.version,
      evidence,
    }),
  );
}, 300_000);
