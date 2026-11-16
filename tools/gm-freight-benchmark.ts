/* eslint-disable @typescript-eslint/no-explicit-any -- process-local measurement instrumentation */
// ROADBED GM-native freight bridge: whole-operation cost evidence (BLUE v6.2 Continuation Preflight §1A).
//
//   node --experimental-strip-types tools/gm-freight-benchmark.ts run <quarry|textile> <dormantLoci>   one bridge sample, one fresh process, JSON on stdout
//   node --experimental-strip-types tools/gm-freight-benchmark.ts matrix [outDir]                      the matched before/after matrix; raw samples + summary
//
// WHAT IS MEASURED. The SAME whole lawful freight operation of one world on campaigns that differ ONLY in how much UNRELATED dormant history they
// carry (an unrelated world with extra loci):
//   BEFORE  the owner code driven directly by the scripted double over ONE open campaign (tools/freight-benchmark.ts, unchanged)
//   AFTER   the same operation driven through the authenticated GM tool path (callGmFreight, the function the stdio MCP server calls): per call the
//           operating-system owner, the host secret, a strict re-open of the whole campaign under its lock, one engine operation, a close; and the
//           operator's chronology and the player's two time advances as the real operator commands.
// Counted: host (tool) calls, campaign opens, canonical commits/writes, exact-key owner reads and derivations, GIP-head scans, file read/write bytes,
// hash bytes and elapsed time, per call and in total. The deterministic counters must be EQUAL across dormant sizes for equal causal work; elapsed
// time is reported as measured samples.
//
// WHAT IS NOT CLAIMED. MECHANISM ONLY (T1): no genuine host, named client, retained storage or paid host; no throughput, capacity or latency claim,
// no SLA and no extrapolation. Fixture sizes are measurements, never game limits.
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const mode = process.argv[2] ?? "run";

const counts = {
  canonical_commits: 0,
  canonical_writes: 0,
  hash_bytes: 0,
  hash_updates: 0,
  fs_reads: 0,
  fs_read_bytes: 0,
  fs_writes: 0,
  fs_write_bytes: 0,
  campaign_opens: 0,
  campaign_open_ms: 0,
};

async function runSample(worldName: string, dormant: number) {
  const originalHash = crypto.createHash;
  const instrumentHash = (h: any): any => {
    const update = h.update.bind(h),
      copy = h.copy?.bind(h);
    h.update = (bytes: any, ...args: any[]) => {
      counts.hash_updates++;
      counts.hash_bytes +=
        typeof bytes === "string" ? Buffer.byteLength(bytes, args[0]) : bytes.byteLength;
      return update(bytes, ...args);
    };
    if (copy) h.copy = (...args: any[]) => instrumentHash(copy(...args));
    return h;
  };
  crypto.createHash = ((...args: any[]) =>
    instrumentHash((originalHash as any)(...args))) as typeof crypto.createHash;
  syncBuiltinESMExports();

  const engine: any = await import("../packages/engine/src/index.ts");
  const fixtures: any = await import("../packages/testkit/src/index.ts");
  const gm: any = await import("../tests/support/gm-freight.ts");
  const { must } = (await import("../tests/support/temporal.ts")) as any;

  const accept = engine.CampaignCore.prototype.accept;
  engine.CampaignCore.prototype.accept = function (prepared: any) {
    const result = accept.call(this, prepared);
    counts.canonical_commits++;
    counts.canonical_writes += prepared.entry.group.writes.length;
    return result;
  };
  for (const [name, fn] of Object.entries(engine.nodeFs) as [string, (...a: any[]) => any][]) {
    engine.nodeFs[name] = (...args: any[]) => {
      const record = (result: any) => {
        if (["readFile", "readRange", "readRangeSync"].includes(name)) {
          counts.fs_reads++;
          counts.fs_read_bytes += result.length;
        } else if (["writeFileDurable", "appendDurable", "createExclusive"].includes(name)) {
          counts.fs_writes++;
          counts.fs_write_bytes +=
            typeof args[1] === "string" ? Buffer.byteLength(args[1]) : args[1].byteLength;
        }
        return result;
      };
      const result = fn(...args);
      return result instanceof Promise ? result.then(record) : record(result);
    };
  }
  const open = engine.CanonicalCampaign.open.bind(engine.CanonicalCampaign);
  engine.CanonicalCampaign.open = async (...args: any[]) => {
    const t = performance.now();
    const r = await open(...args);
    counts.campaign_opens++;
    counts.campaign_open_ms += performance.now() - t;
    return r;
  };
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name],
    );
  const sourceHash = originalHash("sha256");
  for (const file of ["contracts", "engine", "operator", "testkit"]
    .flatMap((p) => walk("packages/" + p + "/src"))
    .sort())
    sourceHash.update(
      file + "\0" + originalHash("sha256").update(readFileSync(file)).digest("hex") + "\n",
    );

  const snapshot = () => ({
    ...counts,
    freight: { ...engine.freightWorkCounters },
    gm: {
      operations: engine.gmFreightWorkCounters.operations,
      owner_acts_attempted: engine.gmFreightWorkCounters.owner_acts_attempted,
      position_reads: engine.gmFreightWorkCounters.position_reads,
      ...Object.fromEntries(
        Object.entries(engine.gmFreightWorkCounters.in_operation).map(([k, v]) => [
          `in_op_${k}`,
          v,
        ]),
      ),
    },
  });
  const delta = (a: any, b: any) => ({
    ...Object.fromEntries(Object.keys(counts).map((k) => [k, b[k] - a[k]])),
    freight: Object.fromEntries(
      Object.keys(b.freight).map((k) => [k, b.freight[k] - a.freight[k]]),
    ),
    gm: Object.fromEntries(Object.keys(b.gm).map((k) => [k, b.gm[k] - a.gm[k]])),
  });

  const fx: any =
    worldName === "textile" ? fixtures.textileWorkshopFixture() : fixtures.quarryWorksFixture();
  const rig: any = await gm.newGmRig(fx);

  // -- unrelated dormant history (NOT measured): an unrelated world carrying `dormant` loci ------------------------------------
  if (dormant > 0) {
    const c: any = await must(
      engine.CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-bench-dormant" }),
    );
    await must(
      c.establishWorld({
        ...fixtures.freightPublication("dormant", 0),
        world: { ...fx.world, world_id: "dormant-vale" },
      }),
    );
    for (let i = 1; i <= dormant; i++)
      await must(
        c.establishLocus({
          ...fixtures.freightPublication("dormant", i),
          locus: {
            ...fx.origin,
            locus_id: `dormant-locus-${i}`,
            world: { fact_key: "world/dormant-vale/profile", entity_id: "dormant-vale" },
            designation: `SYNTHETIC FIXTURE: unrelated dormant site ${i}`,
          },
        }),
      );
    await c.close();
  }

  // -- the WHOLE operation through the authenticated tool path -------------------------------------------------------------------
  engine.resetFreightWorkCounters();
  engine.resetGmFreightWorkCounters();
  const calls: any[] = [];
  let hostCalls = 0;
  const timed = async (
    label: string,
    kind: "host_call" | "operator_command",
    run: () => Promise<any>,
  ) => {
    global.gc?.();
    const b = snapshot(),
      t0 = performance.now();
    const out = await run();
    if (kind === "host_call") hostCalls++;
    calls.push({ label, kind, elapsed_ms: performance.now() - t0, ...delta(b, snapshot()) });
    return out;
  };
  const tool = (name: string, args: unknown) =>
    timed(name, "host_call", () => rig.call(name, args));
  const must1 = (r: any) => {
    if (!r.ok) throw new Error(`call refused: ${JSON.stringify(r.error)}`);
    return r.value;
  };
  const beforeAll = snapshot();
  const startAll = performance.now();
  must1(await tool("gm_freight_status", {}));
  must1(await tool("gm_freight_establish_setting", gm.settingRequest(fx)));
  must1(await tool("gm_freight_attest_opening", gm.attestRequest(fx)));
  if (
    (await timed("operator:initialize-time", "operator_command", () =>
      gm.operatorStartsChronology(rig),
    )) !== "TIME_ESTABLISHED"
  )
    throw new Error("chronology");
  must1(await tool("gm_freight_establish_legal", gm.legalRequest(fx)));
  let go = must1(
    await tool("gm_freight_initiate", { operation_id: "bench-go-1", world_id: fx.worldId }),
  );
  for (let i = 2; go.awaiting?.kind === "PLAYER_OOC_TIME_ADVANCE"; i++) {
    const to = go.awaiting.to;
    if (
      (await timed(`player:null-advance-${i - 1}`, "operator_command", () =>
        gm.playerAdvancesTo(rig, to),
      )) !== "NULL_PC_ADVANCE_COMMITTED"
    )
      throw new Error("advance");
    go = must1(
      await tool("gm_freight_initiate", { operation_id: `bench-go-${i}`, world_id: fx.worldId }),
    );
  }
  const status = must1(await tool("gm_freight_status", { world_id: fx.worldId }));
  const operation_elapsed_ms = performance.now() - startAll;
  const total: any = delta(beforeAll, snapshot());

  // -- cold reopen after the operation (the load-time cost of the history, incl. the freight integrity verifier) -----------------
  const reopenStart = snapshot();
  const t1 = performance.now();
  const reopened: any = await must(
    engine.CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-bench-reopen" }),
  );
  const reopen_elapsed_ms = performance.now() - t1;
  const reopen = delta(reopenStart, snapshot());
  const violations = reopened.verify().length;
  const head = reopened.store.head();
  await reopened.close();
  rmSync(join(rig.campaignDir, ".."), { recursive: true, force: true });

  const hostOnly = calls.filter((c) => c.kind === "host_call");
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    meta: {
      tool: "tools/gm-freight-benchmark.ts",
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      commit: process.env["FREIGHT_BENCH_COMMIT"] ?? null,
      runtime_source_sha256: sourceHash.digest("hex"),
      world: worldName,
      dormant_loci: dormant,
      iterations: 1,
      mechanism_only: true,
    },
    revision_after_operation: head.revision,
    stage_after_operation: status.stage,
    verify_violations_after_reopen: violations,
    operation: {
      elapsed_ms: operation_elapsed_ms,
      host_calls: hostCalls,
      operator_commands: calls.length - hostCalls,
      ...total,
      host_call_elapsed_ms: {
        n: hostOnly.length,
        mean: mean(hostOnly.map((c) => c.elapsed_ms)),
        max: Math.max(...hostOnly.map((c) => c.elapsed_ms)),
      },
      mean_open_ms_per_open: total.campaign_opens
        ? total.campaign_open_ms / total.campaign_opens
        : 0,
    },
    calls,
    cold_reopen: { elapsed_ms: reopen_elapsed_ms, ...reopen },
  };
}

// the deterministic part of a sample: what must be EQUAL across dormant sizes for equal causal work. The GIP-head scan counters are NOT part of it:
// every call's strict re-open visits each committed fact once to build the incremental GIP head, so they measure the HISTORY a re-open carries
// (reported separately per size as the open-scaling dimension), not the causal work of the act.
const inOperation = (g: any) => ({
  operations: g.operations,
  owner_acts_attempted: g.owner_acts_attempted,
  position_reads: g.position_reads,
  ownerReads: g.in_op_ownerReads,
  derivations: g.in_op_derivations,
  gipHeadScans: g.in_op_gipHeadScans,
  gipHeadScannedFacts: g.in_op_gipHeadScannedFacts,
  gipHeadAdvances: g.in_op_gipHeadAdvances,
});
const causal = (s: any) => ({
  stage: s.stage_after_operation,
  host_calls: s.operation.host_calls,
  operator_commands: s.operation.operator_commands,
  campaign_opens: s.operation.campaign_opens,
  canonical_commits: s.operation.canonical_commits,
  canonical_writes: s.operation.canonical_writes,
  in_operation: inOperation(s.operation.gm),
  per_call: s.calls.map((c: any) => ({
    label: c.label,
    commits: c.canonical_commits,
    opens: c.campaign_opens,
    in_operation: inOperation(c.gm),
  })),
  verify: s.verify_violations_after_reopen,
});

if (mode === "run") {
  console.log(
    JSON.stringify(await runSample(process.argv[3] ?? "quarry", Number(process.argv[4] ?? 0))),
  );
} else if (mode === "matrix") {
  const out = process.argv[3] ?? "/tmp/immortalis-gm-freight-evidence";
  const sizes = (process.env["FREIGHT_BENCH_SIZES"] ?? "0 100 500 2000").split(/\s+/).map(Number);
  const reps = Number(process.env["FREIGHT_BENCH_REPS"] ?? 3);
  const worlds = (process.env["FREIGHT_BENCH_WORLDS"] ?? "quarry textile").split(/\s+/);
  const commit = (() => {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  })();
  mkdirSync(join(out, "raw"), { recursive: true });
  const runTool = (script: string, w: string, n: number) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        ["--experimental-strip-types", "--no-warnings", script, "run", w, String(n)],
        {
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024,
          env: { ...process.env, FREIGHT_BENCH_COMMIT: commit ?? "" },
        },
      )
        .trim()
        .split("\n")
        .pop()!,
    );
  const after: any[] = [];
  const before: any[] = [];
  for (const w of worlds)
    for (const n of sizes)
      for (let r = 1; r <= reps; r++) {
        const b = runTool("tools/freight-benchmark.ts", w, n);
        b.meta.iteration = r;
        writeFileSync(join(out, "raw", `before-${w}-${n}-${r}.json`), JSON.stringify(b) + "\n");
        before.push(b);
        const a = runTool("tools/gm-freight-benchmark.ts", w, n);
        a.meta.iteration = r;
        a.meta.iterations = reps;
        writeFileSync(join(out, "raw", `after-${w}-${n}-${r}.json`), JSON.stringify(a) + "\n");
        after.push(a);
      }
  const median = (xs: number[]) => {
    const s = [...xs].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)] ?? 0;
  };
  const rows: any[] = [];
  const equalCausal: Record<string, boolean> = {};
  const equalFreightCounters: Record<string, boolean> = {};
  for (const w of worlds) {
    const as = after.filter((s) => s.meta.world === w);
    const ref = JSON.stringify(causal(as[0]));
    equalCausal[w] = as.every((s) => JSON.stringify(causal(s)) === ref);
    // the freight owner counters of BEFORE and AFTER describe the same owner work: compare them directly
    const bs = before.filter((s) => s.meta.world === w);
    // the exact-key owner reads of the SAME owner acts: the bridge adds its planner's reads, so the two are reported, not required equal
    equalFreightCounters[w] = bs.every(
      (s) => s.operation.freight.ownerReads === bs[0].operation.freight.ownerReads,
    );
    for (const n of sizes) {
      const a = as.filter((s) => s.meta.dormant_loci === n);
      const b = bs.filter((s) => s.meta.dormant_loci === n);
      rows.push({
        world: w,
        dormant_loci: n,
        samples: a.length,
        facts_before: b[0]?.facts_before_operation ?? null,
        before_operation_ms_median: median(b.map((s) => s.operation.elapsed_ms)),
        after_operation_ms_median: median(a.map((s) => s.operation.elapsed_ms)),
        after_over_before:
          median(a.map((s) => s.operation.elapsed_ms)) /
          median(b.map((s) => s.operation.elapsed_ms)),
        after_operation_ms: a.map((s) => Math.round(s.operation.elapsed_ms)),
        host_calls: a[0].operation.host_calls,
        operator_commands: a[0].operation.operator_commands,
        campaign_opens: a[0].operation.campaign_opens,
        mean_open_ms_per_open_median: median(a.map((s) => s.operation.mean_open_ms_per_open)),
        host_call_ms_mean_median: median(a.map((s) => s.operation.host_call_elapsed_ms.mean)),
        host_call_ms_max_median: median(a.map((s) => s.operation.host_call_elapsed_ms.max)),
        canonical_commits: a[0].operation.canonical_commits,
        before_canonical_commits: b[0].operation.canonical_commits,
        in_operation_owner_reads: a[0].operation.gm.in_op_ownerReads,
        in_operation_derivations: a[0].operation.gm.in_op_derivations,
        in_operation_gip_head_scans: a[0].operation.gm.in_op_gipHeadScans,
        in_operation_gip_head_advances: a[0].operation.gm.in_op_gipHeadAdvances,
        owner_acts_attempted: a[0].operation.gm.owner_acts_attempted,
        position_reads: a[0].operation.gm.position_reads,
        total_derivations_incl_open_replay_median: median(
          a.map((s) => s.operation.freight.derivations),
        ),
        total_owner_reads_incl_open_median: median(a.map((s) => s.operation.freight.ownerReads)),
        gip_head_scans_at_opens: a[0].operation.freight.gipHeadScans,
        gip_head_scanned_facts_at_opens: a[0].operation.freight.gipHeadScannedFacts,
        fs_read_bytes: a[0].operation.fs_read_bytes,
        fs_write_bytes: a[0].operation.fs_write_bytes,
        before_fs_read_bytes: b[0].operation.fs_read_bytes,
        hash_bytes: a[0].operation.hash_bytes,
        cold_reopen_ms_median: median(a.map((s) => s.cold_reopen.elapsed_ms)),
        verify_violations: a.map((s) => s.verify_violations_after_reopen),
        stage: a[0].stage_after_operation,
      });
    }
  }
  const summary = {
    meta: {
      tool: "tools/gm-freight-benchmark.ts (after) vs tools/freight-benchmark.ts (before)",
      commit,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      sizes,
      reps,
      worlds,
      mechanism_only: true,
      claims:
        "NONE beyond the measured samples: no throughput, capacity or latency claim; no genuine host, named client, retained storage or paid host",
    },
    equal_bridge_causal_work_across_dormant_sizes: equalCausal,
    equal_direct_owner_reads_across_dormant_sizes: equalFreightCounters,
    rows,
  };
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  if (!Object.values(equalCausal).every(Boolean)) {
    console.error(
      "bridge causal work differed across dormant sizes: the deterministic counters are NOT equal",
    );
    process.exit(1);
  }
} else {
  console.error(
    "usage: gm-freight-benchmark.ts run <quarry|textile> <dormantLoci> | matrix [outDir]",
  );
  process.exit(2);
}
