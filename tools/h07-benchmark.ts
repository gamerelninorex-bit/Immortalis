/* eslint-disable @typescript-eslint/no-explicit-any -- isolated benchmark instrumentation, never production */
// Synthetic Temporal mechanism, held fixed while unrelated state/history varies. No host/model/API.
import { cpSync, mkdtempSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { tmpdir, cpus, platform, arch, release } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import {
  CanonicalCampaign,
  CampaignCore,
  TemporalCoordinator,
  nodeFs,
  sha256Canonical,
} from "@immortalis/engine";
import { BUILD_SPEC_IDENTITY } from "@immortalis/contracts";
import {
  FIXTURE_CAMPAIGN,
  SYNTH_EXTENSION,
  SYNTH_PRODUCER_RESULT_KEY,
  SYNTH_CONSUMER_RESULT_KEY,
  stopAtBoundaryRequest,
  syntheticProviders,
  syntheticSourceGroup,
} from "@immortalis/testkit";
import { must, seededTemporalCampaign, spyStore } from "../tests/support/temporal.ts";

function meter() {
  let active = false;
  const zero = () => ({
    read_bytes: 0,
    read_calls: 0,
    write_bytes: 0,
    durable_writes: 0,
    fsyncs: 0,
    state_file_bytes: 0,
    state_file_writes: 0,
    index_bytes: 0,
    index_reads: 0,
    index_read_bytes: 0,
    journal_parsed: 0,
    journal_replayed: 0,
    facts_copied: 0,
    facts_sorted: 0,
    full_hashes: 0,
    full_hash_bytes: 0,
    serialized_bytes: 0,
    serializations: 0,
    checkpoint_io_ms: 0,
  });
  let counts = zero();
  for (const method of ["readFile", "readRange", "readRangeSync"] as const) {
    const original = (nodeFs as any)[method];
    const record = (path: string, b: Buffer) => {
      if (active) {
        counts.read_calls++;
        counts.read_bytes += b.length;
        if (/history\/index\./.test(path)) {
          counts.index_reads++;
          counts.index_read_bytes += b.length;
        }
      }
      return b;
    };
    (nodeFs as any)[method] =
      method === "readRangeSync"
        ? (path: string, ...args: any[]) => record(path, original(path, ...args))
        : async (path: string, ...args: any[]) => record(path, await original(path, ...args));
  }
  for (const method of ["writeFileDurable", "appendDurable", "createExclusive"] as const) {
    const original = nodeFs[method];
    nodeFs[method] = async (path, data) => {
      const start = performance.now();
      if (active) {
        const bytes = Buffer.byteLength(data);
        counts.write_bytes += bytes;
        counts.durable_writes++;
        counts.fsyncs += method === "writeFileDurable" ? 2 : 1;
        if (/state\.\d+\.json$/.test(path)) {
          counts.state_file_bytes += bytes;
          counts.state_file_writes++;
        }
        if (/history\/index\./.test(path)) counts.index_bytes += bytes;
      }
      await original(path, data);
      if (active && (/state\.\d+\.json$/.test(path) || /history\/index\./.test(path)))
        counts.checkpoint_io_ms += performance.now() - start;
    };
  }
  const replay = CampaignCore.prototype.replay;
  CampaignCore.prototype.replay = function (...args) {
    if (active) {
      counts.journal_replayed++;
      counts.journal_parsed++;
    }
    return replay.apply(this, args);
  };
  const originalHash = crypto.createHash;
  crypto.createHash = ((...args: any[]) => {
    const h = Reflect.apply(originalHash, crypto, args);
    const update = h.update;
    h.update = function (data: any, ...rest: any[]) {
      if (
        active &&
        typeof data === "string" &&
        data.startsWith('{"campaign_id":') &&
        data.slice(0, 140).includes('"facts":[')
      ) {
        counts.full_hashes++;
        counts.full_hash_bytes += Buffer.byteLength(data);
      }
      return Reflect.apply(update, this, [data, ...rest]);
    };
    return h;
  }) as typeof crypto.createHash;
  syncBuiltinESMExports();
  const stringify = JSON.stringify;
  JSON.stringify = ((...args: any[]) => {
    const s = Reflect.apply(stringify, JSON, args);
    if (active && typeof s === "string") {
      counts.serializations++;
      counts.serialized_bytes += Buffer.byteLength(s);
    }
    return s;
  }) as typeof JSON.stringify;
  const NativeMap = Map;
  (globalThis as any).Map = new Proxy(NativeMap, {
    construct(target, args) {
      if (active && args[0] instanceof NativeMap) {
        const first = args[0].values().next().value;
        if (first && typeof first === "object" && "key" in first && "provenance" in first)
          counts.facts_copied += args[0].size;
      }
      return Reflect.construct(target, args);
    },
  });
  const sort = Array.prototype.sort;
  Array.prototype.sort = function (...args: any[]) {
    if (
      active &&
      this[0] &&
      typeof this[0] === "object" &&
      "key" in this[0] &&
      "provenance" in this[0]
    )
      counts.facts_sorted += this.length;
    return Reflect.apply(sort, this, args);
  };
  return {
    start() {
      counts = zero();
      active = true;
      return performance.now();
    },
    finish(start: number) {
      active = false;
      return { ms: performance.now() - start, ...counts };
    },
  };
}
const work = meter();
const env = {
  node: process.version,
  platform: platform(),
  arch: arch(),
  kernel: release(),
  cpu: cpus()[0]?.model,
  filesystem_type: statfsSync(".").type,
  cache: "warm OS cache; fresh process per sample",
  package_manager: "pnpm@10.33.0 lock; direct Node execution",
  spec: BUILD_SPEC_IDENTITY,
};
const [mode, kind, countText, path, output] = process.argv.slice(2);
if (!mode || !kind || !countText || !path)
  throw new Error("usage: h07-benchmark.ts seed|sample state|history <count> <fixture> [output]");
const count = Number(countText);
const open = (dir: string, audit = false) => {
  const options = { extension: SYNTH_EXTENSION, audit };
  return must(CanonicalCampaign.open(dir, options));
};
if (mode === "seed") {
  const start = work.start();
  const { campaign } = await seededTemporalCampaign(path);
  const initial = campaign.store.listFacts().length;
  const total = 140 - initial + (kind === "state" ? count : 0);
  const g = syntheticSourceGroup(FIXTURE_CAMPAIGN, 10000, "padding", 0);
  const template = g.writes[0]!;
  await must(
    campaign.store.commit({
      ...g,
      writes: Array.from({ length: total }, (_, i) => ({
        ...template,
        key: `synthetic/h07/cold/${String(i).padStart(5, "0")}`,
        value: { marker: i, payload: "x".repeat(256) },
      })),
    }),
  );
  if (kind === "history")
    for (let i = 0; i < count; i++)
      await must(
        campaign.store.commit(
          syntheticSourceGroup(
            FIXTURE_CAMPAIGN,
            20000 + i,
            `historical-${i}`,
            i + 1,
            "synthetic/dormant/source",
          ),
        ),
      );
  assert.equal(campaign.store.listFacts().length, 140 + (kind === "state" ? count : 0));
  assert.equal(campaign.store.head().journal_entries, 10 + (kind === "history" ? count : 0));
  await campaign.close();
  const seed = work.finish(start);
  writeFileSync(`${path}.seed.json`, JSON.stringify({ kind, count, seed, env }, null, 2));
} else if (mode === "sample") {
  const made: string[] = [];
  const clone = () => {
    const dir = mkdtempSync(join(tmpdir(), "h07-sample-"));
    cpSync(path, dir, { recursive: true });
    made.push(dir);
    return dir;
  };
  const results: any = {
    kind,
    count,
    env,
    sha: process.env.H07_EXACT_SHA ?? "UNCOMMITTED",
    phases: {},
  };
  try {
    let dir = clone();
    let start = work.start();
    let campaign = await open(dir);
    const head = campaign.store.head();
    await campaign.close();
    results.phases.normal_reopen = work.finish(start);
    dir = clone();
    campaign = await open(dir);
    const fact = campaign.store.getFact("synthetic/dormant/source")!;
    start = work.start();
    const one = await must(
      campaign.store.commit(
        syntheticSourceGroup(
          FIXTURE_CAMPAIGN,
          30000,
          "one-fact",
          fact.version,
          "synthetic/dormant/source",
        ),
      ),
    );
    results.phases.one_fact_commit = work.finish(start);
    results.one_fact_receipt = one.receipt;
    await campaign.close();
    dir = clone();
    campaign = await open(dir);
    const spy = spyStore(campaign.store);
    const coordinator = new TemporalCoordinator(spy.store, syntheticProviders());
    start = work.start();
    const result = await must(coordinator.advance(stopAtBoundaryRequest("h07-fixed")));
    results.phases.fixed_action = work.finish(start);
    assert.equal(spy.getFacts.length, 27);
    assert.equal(new Set(spy.getFacts).size, 10);
    assert.equal(spy.listCalls(), 0);
    assert.equal(spy.commits.length, 4);
    assert.ok(spy.getFacts.every((key) => !key.startsWith("synthetic/h07/cold/")));
    assert.equal(result.transaction.outcome.actual_stop.value, 140);
    results.action_digest = sha256Canonical({
      transaction: result.transaction,
      producer: campaign.store.getFact(SYNTH_PRODUCER_RESULT_KEY),
      consumer: campaign.store.getFact(SYNTH_CONSUMER_RESULT_KEY),
    });
    results.coordinator = {
      keyed_reads: spy.getFacts.length,
      unique_keys: new Set(spy.getFacts).size,
      listings: spy.listCalls(),
      groups: spy.commits.length,
    };
    results.action_head = campaign.store.head();
    const replay = await must(coordinator.advance(stopAtBoundaryRequest("h07-fixed")));
    assert.equal(replay.replayed, true);
    assert.deepEqual(campaign.store.head(), results.action_head);
    await campaign.close();
    campaign = await open(dir);
    assert.deepEqual(campaign.store.head(), results.action_head);
    await campaign.close();
    dir = clone();
    start = work.start();
    campaign = await open(dir, true);
    assert.deepEqual(campaign.store.head(), head);
    await campaign.close();
    results.phases.strict_audit = work.finish(start);
    results.fixture_head = head;
    if (output) writeFileSync(output, JSON.stringify(results, null, 2));
    else process.stdout.write(`${JSON.stringify(results)}\n`);
  } finally {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  }
} else throw new Error("unknown benchmark mode");
