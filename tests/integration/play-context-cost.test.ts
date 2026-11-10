/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP replies and raw owner readback are untyped JSON */
// WHOLE-OPERATION COST of resuming play, MECHANISM / T1 only: scripted client, scripted hosts, real owners, real authenticated transport,
// ONE process, a local temporary disk. No host, model or provider is involved, so MODEL AND CLIENT LATENCY, a genuine AI host, a named
// client and RETAINED STORAGE are UNRUN and nothing here is a performance SLA.
//
// The causal fixture is held fixed (a READY first-play campaign with one gather and one earned look) while UNRELATED admitted history
// varies by declared sizes. For each size it records, per journey: tool round trips, response bytes, wall time (median of repetitions) and
// - from one separate instrumented pass - verified opens, full enumerations made by the operation (outside the package's own open/verify),
// canonical verifications, and fact and group reads. The package's own `open` and `verify` are the COMMON verified-open cost of any open.
//
//   legacy   original_setting_status, original_character_status, read_current_observation_glance, play_status   (the separate reads)
//   one      get_play_context                                                                                    (the briefing; head only)
//   terminal the read-only `play_status` that follows a material operation
//
// The very same file runs unchanged against the exact base tree (where only the legacy journey and the terminal status exist) and the
// exact head. Environment (all optional; defaults make a fast regression comparison):
//   PLAY_CONTEXT_SIZES          unrelated admitted worlds added per size       (default "0,40")
//   PLAY_CONTEXT_REPS           timed repetitions per journey                  (default 1)
//   PLAY_CONTEXT_EVIDENCE_DIR   where the raw JSON is written                  (default: not written)
//   PLAY_CONTEXT_BUILD          "base" | "head" label recorded in the raw JSON (default "head")
//   PLAY_CONTEXT_EXACT_SHA      the exact commit under test                    (default "unknown")
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { cpus, platform, release } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { beforeAll, describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { fixtureWorld, publication } from "@immortalis/testkit";
import { cloneSlot, resumed, type Slot } from "../support/chat-route.ts";
import {
  buildReady,
  canonOf,
  gatherAndLook,
  metered,
  policyOf,
  serviceOver,
  storeProtoOf,
  until,
  finished,
} from "../support/play-context.ts";
import { openOrdinary } from "../support/locality.ts";
import { readPlayContext } from "../../apps/phone/src/play-context.ts";
import { keepFileName } from "../../packages/operator/src/original-pc-keep.ts";

const sizes = (process.env["PLAY_CONTEXT_SIZES"] ?? "0,40").split(",").map(Number);
const reps = Number(process.env["PLAY_CONTEXT_REPS"] ?? "1");
const evidenceDir = process.env["PLAY_CONTEXT_EVIDENCE_DIR"];
const build = process.env["PLAY_CONTEXT_BUILD"] ?? "head";
const exactSha = process.env["PLAY_CONTEXT_EXACT_SHA"] ?? "unknown";
const comparisonBase = process.env["PLAY_CONTEXT_COMPARE_BASE_DIR"];
const parity: { case: string; sha256: string }[] = [];

const LEGACY = [
  "original_setting_status",
  "original_character_status",
  "read_current_observation_glance",
  "play_status",
] as const;

/** unrelated admitted history: independent worlds through the canonical owner's own publication, none of them this campaign's setting */
async function pad(slot: Slot, count: number): Promise<void> {
  if (count === 0) return;
  const c = await openOrdinary(slot.campaignDir);
  try {
    for (let i = 0; i < count; i++) {
      const w = await c.establishWorld({
        ...publication(900_000 + i),
        world: fixtureWorld({ world_id: `unrelated-world-${i}` }),
      } as any);
      if (!w.ok) throw new Error(`padding ${i}: ${JSON.stringify(w.error)}`);
    }
  } finally {
    await c.close();
  }
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const bytes = (t: string | undefined) => Buffer.byteLength(t ?? "", "utf8");

interface Journey {
  readonly tools: readonly string[];
  readonly round_trips: number;
  readonly response_bytes: number;
  readonly wall_ms: { readonly median: number; readonly all: number[] };
  readonly counters: {
    readonly opens: number;
    readonly enumerations: number;
    readonly verifications: number;
    readonly owner_verification_passes: number;
    readonly fact_reads: number;
    readonly group_reads: number;
    readonly enumerations_inside_open_and_verify: number;
    readonly campaign_fs_reads: number;
    readonly campaign_fs_read_bytes: number;
    readonly campaign_fs_writes: number;
    readonly campaign_fs_write_bytes: number;
    readonly campaign_fs_metadata_reads: number;
  };
}

async function measure(chat: any, tools: readonly string[], proto: any): Promise<Journey> {
  const all: number[] = [];
  let responseBytes = 0;
  for (let rep = 0; rep < Math.max(1, reps); rep++) {
    const t0 = performance.now();
    responseBytes = 0;
    for (const tool of tools) {
      const r = await chat.call(tool);
      if (r.isError && tool !== "read_current_observation_glance")
        throw new Error(`${tool}: ${r.text}`);
      responseBytes += bytes(r.text);
    }
    all.push(performance.now() - t0);
  }
  // one separate instrumented pass: the wrappers perturb timing, so they are never mixed with the timed ones
  const m = await metered(async () => {
    for (const tool of tools) await chat.call(tool);
  }, proto);
  return {
    tools,
    round_trips: tools.length,
    response_bytes: responseBytes,
    wall_ms: {
      median: Math.round(median(all) * 10) / 10,
      all: all.map((x) => Math.round(x * 10) / 10),
    },
    counters: {
      opens: m.counts.open,
      enumerations: m.counts.listDirect,
      verifications: m.counts.verifyDirect,
      owner_verification_passes: m.counts.ownerVerificationPasses,
      fact_reads: m.counts.getFact,
      group_reads: m.counts.group,
      enumerations_inside_open_and_verify: m.counts.listInOpen,
      campaign_fs_reads: m.counts.fsReads,
      campaign_fs_read_bytes: m.counts.fsReadBytes,
      campaign_fs_writes: m.counts.fsWrites,
      campaign_fs_write_bytes: m.counts.fsWriteBytes,
      campaign_fs_metadata_reads: m.counts.fsMetadataReads,
    },
  };
}

let looked: Slot;
let proto: any;
const raw: any[] = [];

beforeAll(async () => {
  const ready = (await buildReady()).ready;
  proto = await storeProtoOf(ready.campaignDir);
  const a = await serviceOver(ready, { scene: {} });
  try {
    await a.chat.init({});
    const done = await gatherAndLook(a);
    expect(done.look.finished.isError).toBe(false);
  } finally {
    await a.stop();
  }
  looked = a.s;
}, 900_000);

describe("whole-operation cost of resuming play: matched fixture, unrelated history varied", () => {
  for (const size of sizes) {
    it(`+${size} unrelated admitted facts`, async () => {
      const slot = await cloneSlot(looked);
      await pad(slot, size);
      const before = await canonOf(slot.campaignDir);
      const r = await resumed(slot, { policy: policyOf() });
      try {
        await r.chat.init({});
        const hasContext = (await r.chat.rpc("tools/list")).json.result.tools.some(
          (t: any) => t.name === "get_play_context",
        );
        // warm the process once so the first timed sample is not a cold-start artefact
        await r.chat.call("play_status");
        const legacy = await measure(r.chat, LEGACY, proto);
        const one = hasContext ? await measure(r.chat, ["get_play_context"], proto) : null;
        // the after-operation journey: a material operation, then the read-only status that follows it
        expect((await r.chat.call("gather", { amount: 1, until: "complete" })).isError).toBe(false);
        await until(r.chat, finished);
        const terminal = await measure(r.chat, ["play_status"], proto);
        const after = await canonOf(slot.campaignDir);
        raw.push({
          unrelated_facts_added: size,
          facts_before: before.facts,
          journal_entries_before: before.revision,
          journal_entries_after: after.revision,
          legacy,
          one,
          terminal,
        });

        // ---- deterministic regression checks (counts, never timings) ----
        // the legacy journey is four round trips and several verified opens
        expect(legacy.round_trips).toBe(4);
        expect(legacy.counters.opens).toBeGreaterThanOrEqual(4);
        if (one) {
          // the briefing is ONE round trip and ONE verified open, and enumerates the package once for all of its readers
          expect(one.round_trips).toBe(1);
          expect(one.counters.opens).toBe(1);
          const reuse =
            typeof (CanonicalCampaign.prototype as any).withReadVerification === "function";
          expect(one.counters.verifications).toBe(reuse ? 0 : 1);
          expect(one.counters.owner_verification_passes).toBe(reuse ? 1 : 2);
          expect(one.counters.enumerations).toBeLessThanOrEqual(reuse ? 4 : 2);
          expect(one.counters.opens).toBeLessThan(legacy.counters.opens);
          expect(one.counters.enumerations).toBeLessThan(legacy.counters.enumerations);
          // the terminal read-only status carries the briefing from ONE open as well (it used to open once for the play state alone)
          expect(terminal.counters.opens).toBe(1);
        }
      } finally {
        await r.stop();
      }
    }, 900_000);
  }

  it("operation COUNTS do not depend on unrelated history (only the cost of each pass does)", () => {
    const [a, b] = [raw[0], raw.at(-1)];
    if (!a || !b || raw.length < 2 || !a.one) return;
    for (const key of [
      "opens",
      "enumerations",
      "verifications",
      "fact_reads",
      "group_reads",
    ] as const) {
      expect(b.one.counters[key], key).toBe(a.one.counters[key]);
      expect(b.legacy.counters[key], key).toBe(a.legacy.counters[key]);
      expect(b.terminal.counters[key], key).toBe(a.terminal.counters[key]);
    }
    expect(b.journal_entries_before).toBeGreaterThan(a.journal_entries_before);
  });

  it.skipIf(!comparisonBase)(
    "returns byte-identical readbacks to the exact base on the SAME retained package",
    async () => {
      for (const kind of [
        "earned",
        "unbound-host",
        "wrong-campaign",
        "missing-keep",
        "corrupt-manifest",
      ] as const) {
        const s = await cloneSlot(looked);
        const config = { ...s.config };
        if (kind === "unbound-host") config.playerViewHostId = "unbound-host";
        if (kind === "wrong-campaign") config.campaignId = "another-campaign";
        if (kind === "missing-keep") rmSync(join(s.operatorDir, keepFileName(s.config.campaignId)));
        if (kind === "corrupt-manifest") {
          const file = join(s.campaignDir, "manifest.json");
          writeFileSync(
            file,
            readFileSync(file, "utf8").replace(s.config.campaignId, "forged-campaign"),
          );
        }
        const input = JSON.stringify(config);
        const baseOutput = execFileSync(
          process.execPath,
          [
            "--experimental-strip-types",
            "--disable-warning=ExperimentalWarning",
            "--input-type=module",
            "--eval",
            'import {readFileSync} from "node:fs"; const {readPlayContext}=await import(process.argv[1]); process.stdout.write(JSON.stringify(await readPlayContext(JSON.parse(readFileSync(0,"utf8")))));',
            pathToFileURL(join(comparisonBase!, "apps/phone/src/play-context.ts")).href,
          ],
          { input, encoding: "utf8", maxBuffer: 1024 * 1024 },
        );
        const headOutput = JSON.stringify(await readPlayContext(config));
        expect(headOutput, kind).toBe(baseOutput);
        parity.push({ case: kind, sha256: createHash("sha256").update(headOutput).digest("hex") });
      }
    },
    120_000,
  );

  it("records the raw measurements when asked", () => {
    if (!evidenceDir) return;
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(
      join(evidenceDir, `${build}.json`),
      JSON.stringify(
        {
          build,
          exact_sha: exactSha,
          node: process.version,
          os: `${platform()} ${release()}`,
          cpus: cpus().length,
          cpu_model: cpus()[0]?.model,
          process_memory: process.memoryUsage(),
          process_resources: process.resourceUsage(),
          repetitions: Math.max(1, reps),
          sizes,
          label:
            "MECHANISM / T1 only: scripted client and hosts, real owners and transport, one process, local temporary disk. Model/client latency, genuine host, named client and retained storage are UNRUN.",
          campaign_open_is_CanonicalCampaign_open: typeof CanonicalCampaign.open === "function",
          results: raw,
          exact_base_output_parity: parity,
        },
        null,
        2,
      ),
    );
  });
});
