/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP and operator documents */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { refereeDir } from "../../packages/operator/src/referee-exchange.ts";
import {
  DECLARATION,
  chain,
  cloneSlot,
  resumed,
  stage,
  status,
  type Position,
  type Slot,
} from "../support/chat-route.ts";

let steps: Partial<Record<Position, Slot>>;
beforeAll(async () => {
  steps = await chain();
}, 400_000);

it("unreadable referee grants withhold readiness and dispatch, then recover without new player consent", async () => {
  const s = await cloneSlot(steps.READY!);
  const file = join(
    refereeDir({ stateDir: s.operatorDir, campaignId: s.config.campaignId }),
    "config.json",
  );
  const original = readFileSync(file, "utf8");
  const r = await resumed(s);
  try {
    writeFileSync(file, "{");
    const read = (await status(r.chat)).route;
    expect(read.state).toBe("UNAVAILABLE");
    expect(read.readiness.prepared_to_request_collection).toBe(false);
    expect(read.blockers).toContain("REFEREE_GRANTS_UNAVAILABLE");
    const attempt = await r.chat.call("finish_collection_setup");
    expect(attempt.isError).toBe(true);
    expect(attempt.elicited).toEqual([]);
    writeFileSync(file, original);
    const again = (await status(r.chat)).route;
    expect(again.readiness.prepared_to_request_collection).toBe(true);
    expect((await r.chat.call("finish_collection_setup")).elicited).toEqual([]);
  } finally {
    await r.stop();
  }
}, 120_000);

it("the same installed scenario in a different JSON member order converges without a replacement or question", async () => {
  const s = await cloneSlot(steps.READY!);
  const scenario = JSON.parse(readFileSync(s.config.scenarioFile, "utf8"));
  const reordered = JSON.stringify(Object.fromEntries(Object.entries(scenario).reverse()));
  writeFileSync(s.config.scenarioFile, reordered);
  const r = await resumed(s);
  try {
    expect((await status(r.chat)).route.readiness.prepared_to_request_collection).toBe(true);
    const out = await r.chat.call("finish_collection_setup");
    expect(out.isError).toBe(false);
    expect(out.elicited).toEqual([]);
    expect(out.data.run_id).toBeUndefined();
    expect(readFileSync(s.config.scenarioFile, "utf8")).toBe(reordered);
  } finally {
    await r.stop();
  }
}, 120_000);

it("a long Unicode declaration delivers every early and late field in consecutive review parts before consent", async () => {
  const s = await cloneSlot(steps.PREPARED!);
  const r = await resumed(s);
  const authored = Object.fromEntries(
    Object.keys(DECLARATION).map((k, i) => [k, `begin-${i} ${"庭🌒é".repeat(850)} end-${i}`]),
  );
  try {
    const out = await stage(r.chat, "declare_closed_setting", authored);
    expect(out.finished.data.exit_code).toBe(0);
    expect(out.finished.elicited.length).toBeGreaterThan(1);
    const reviews = out.finished.elicited.join("\n");
    for (const text of Object.values(authored)) expect(reviews).toContain(text);
    expect(out.finished.elicited.filter((s: string) => /type exactly "/.test(s))).toHaveLength(1);
    expect(out.finished.elicited.at(-1)).toContain("type exactly");
    expect(reviews).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/u);
  } finally {
    await r.stop();
  }
}, 180_000);
