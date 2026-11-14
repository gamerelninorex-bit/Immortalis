/* eslint-disable @typescript-eslint/no-explicit-any -- process-local measurement instrumentation */
// ROADBED R3-T25 whole-operation cost evidence for the first-profile institutional freight (Foundation F + Integration I).
//
//   node --experimental-strip-types tools/freight-benchmark.ts run <quarry|textile> <dormantLoci>      one sample, one fresh process, JSON on stdout
//   node --experimental-strip-types tools/freight-benchmark.ts matrix [outDir]                         the matched matrix; writes raw samples and a summary
//
// WHAT IS MEASURED. The WHOLE lawful operation of one world, as the owner code performs it over a real file-backed canonical campaign:
// setting, opening attestation, GIP assembly and readiness seal, premises, Production and acceptance, C-05/C-06 fixation, service basis, L0,
// L1/F3, E1, TE, earned LD → WT/ECT-01 → LR → ER and AD. The same operation is run on campaigns that differ ONLY in how much UNRELATED
// dormant history they already carry (extra loci of an unrelated world): the causal work is equal by construction, so the deterministic
// counters must be equal and any elapsed difference is the cost of dormant history, reported as measured samples.
//
// WHAT IS NOT CLAIMED. MECHANISM ONLY (T1): no genuine host, named client, retained storage or paid host; no throughput, capacity or latency
// claim is made or extrapolated. Fixture sizes are measurements, never game limits. Elapsed times are samples on whatever machine ran them.
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const mode = process.argv[2] ?? "run";

// -- counters ---------------------------------------------------------------------------------------------------------------------------
const counts = {
  canonical_commits: 0,
  canonical_writes: 0,
  hash_bytes: 0,
  hash_updates: 0,
  fs_reads: 0,
  fs_read_bytes: 0,
  fs_writes: 0,
  fs_write_bytes: 0,
  fs_metadata: 0,
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
  const support: any = await import("../tests/support/freight.ts");
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
        } else counts.fs_metadata++;
        return result;
      };
      const result = fn(...args);
      return result instanceof Promise ? result.then(record) : record(result);
    };
  }
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name],
    );
  const sourceHash = originalHash("sha256");
  for (const file of ["contracts", "engine", "testkit"]
    .flatMap((p) => walk("packages/" + p + "/src"))
    .sort())
    sourceHash.update(
      file + "\0" + originalHash("sha256").update(readFileSync(file)).digest("hex") + "\n",
    );

  const snapshot = () => ({
    ...counts,
    freight: { ...engine.freightWorkCounters },
  });
  const delta = (a: any, b: any) => ({
    ...Object.fromEntries(Object.keys(counts).map((k) => [k, b[k] - a[k]])),
    freight: Object.fromEntries(
      Object.keys(b.freight).map((k) => [k, b.freight[k] - a.freight[k]]),
    ),
  });

  const fx: any =
    worldName === "textile" ? fixtures.textileWorkshopFixture() : fixtures.quarryWorksFixture();
  const dir = mkdtempSync(join(tmpdir(), "immortalis-freight-bench-"));
  const f: any = await support.createFreightCampaign(dir, fx);

  // per-commit samples through the store (the one durable commit path)
  let phase = "dormant";
  const perCommit: any[] = [];
  const store: any = f.campaign.store;
  const commit = store.commit.bind(store);
  store.commit = async (group: any) => {
    const before = snapshot(),
      start = performance.now(),
      r = await commit(group);
    perCommit.push({
      phase,
      owner: group.owner,
      facet: group.facet,
      first_key: group.writes[0]?.key,
      ok: r.ok,
      replayed: r.value?.replayed ?? false,
      elapsed_ms: performance.now() - start,
      hash_bytes: counts.hash_bytes - before.hash_bytes,
      fs_write_bytes: counts.fs_write_bytes - before.fs_write_bytes,
      fs_read_bytes: counts.fs_read_bytes - before.fs_read_bytes,
    });
    return r;
  };

  // -- unrelated dormant history (NOT measured): an unrelated world carrying `dormant` loci --------------------------------------
  if (dormant > 0) {
    const dormantWorld = { ...fx.world, world_id: "dormant-vale" };
    await must(
      f.campaign.establishWorld({
        ...fixtures.freightPublication("dormant", 0),
        world: dormantWorld,
      }),
    );
    for (let i = 1; i <= dormant; i++)
      await must(
        f.campaign.establishLocus({
          ...fixtures.freightPublication("dormant", i),
          locus: {
            ...fx.origin,
            locus_id: `dormant-locus-${i}`,
            world: { fact_key: "world/dormant-vale/profile", entity_id: "dormant-vale" },
            designation: `SYNTHETIC FIXTURE: unrelated dormant site ${i}`,
          },
        }),
      );
  }

  phase = "operation";
  engine.resetFreightWorkCounters();
  const factsBefore = f.campaign.store.listFacts().length;
  const steps: any[] = [];
  const startAll = performance.now();
  const beforeAll = snapshot();
  for (const step of [...support.settingSteps(), ...support.mainSteps(fx)]) {
    global.gc?.();
    const b = snapshot(),
      c0 = perCommit.length,
      t0 = performance.now();
    await step.run(f);
    steps.push({
      step: step.name,
      elapsed_ms: performance.now() - t0,
      commits: perCommit.length - c0,
      ...delta(b, snapshot()),
    });
  }
  const operation_elapsed_ms = performance.now() - startAll;
  const total = delta(beforeAll, snapshot());
  const factsAfter = f.campaign.store.listFacts().length;
  const verifyViolations = f.campaign.verify().length;
  const head = f.campaign.store.head();
  await f.campaign.close();

  // -- cold reopen: the load-time cost of the history (replay/verification), incl. the freight integrity verifier ----------------
  const reopenStart = snapshot();
  const t1 = performance.now();
  const reopened: any = await must(
    engine.CanonicalCampaign.open(dir, { buildId: "roadbed-freight-bench-reopen" }),
  );
  const reopen_elapsed_ms = performance.now() - t1;
  const reopen = delta(reopenStart, snapshot());
  const reopenViolations = reopened.verify().length;
  await reopened.close();
  rmSync(dir, { recursive: true, force: true });

  const opCommits = perCommit.filter((c) => c.phase === "operation");
  const dormantCommits = perCommit.filter((c) => c.phase === "dormant");
  // reference: what an UNRELATED, non-freight commit costs on this same history (the last dormant commits, taken at the deepest history)
  const refTail = dormantCommits.slice(-Math.min(20, dormantCommits.length));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const sorted = opCommits.map((c) => c.elapsed_ms).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  return {
    meta: {
      tool: "tools/freight-benchmark.ts",
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      commit: process.env["FREIGHT_BENCH_COMMIT"] ?? null,
      runtime_source_sha256: sourceHash.digest("hex"),
      world: worldName,
      fixture_campaign: fx.campaignId,
      dormant_loci: dormant,
      iterations: 1,
      mechanism_only: true,
    },
    facts_before_operation: factsBefore,
    facts_after_operation: factsAfter,
    revision_after_operation: head.revision,
    verify_violations_after_operation: verifyViolations,
    verify_violations_after_reopen: reopenViolations,
    operation: {
      elapsed_ms: operation_elapsed_ms,
      acts: steps.length,
      ...total,
      commit_elapsed_ms: {
        n: sorted.length,
        p50: q(0.5),
        p95: q(0.95),
        max: sorted[sorted.length - 1] ?? 0,
      },
    },
    unrelated_commit_reference: {
      note: "the last <=20 unrelated World-State locus commits of the dormant build, i.e. the cost of a non-freight commit at the deepest dormant history",
      n: refTail.length,
      elapsed_ms_mean: mean(refTail.map((c) => c.elapsed_ms)),
      hash_bytes_mean: mean(refTail.map((c) => c.hash_bytes)),
      fs_write_bytes_mean: mean(refTail.map((c) => c.fs_write_bytes)),
    },
    operation_commit_means: {
      elapsed_ms_mean: mean(opCommits.map((c) => c.elapsed_ms)),
      hash_bytes_mean: mean(opCommits.map((c) => c.hash_bytes)),
      fs_write_bytes_mean: mean(opCommits.map((c) => c.fs_write_bytes)),
    },
    steps,
    cold_reopen: { elapsed_ms: reopen_elapsed_ms, ...reopen },
  };
}

// -- the deterministic part of a sample: what must be EQUAL across dormant sizes for equal causal work ------------------------------
const causal = (s: any) => ({
  acts: s.operation.acts,
  canonical_commits: s.operation.canonical_commits,
  canonical_writes: s.operation.canonical_writes,
  freight: s.operation.freight,
  per_step: s.steps.map((x: any) => ({
    step: x.step,
    commits: x.commits,
    canonical_writes: x.canonical_writes,
    freight: x.freight,
  })),
  facts_added: s.facts_after_operation - s.facts_before_operation,
  verify: [s.verify_violations_after_operation, s.verify_violations_after_reopen],
});

if (mode === "run") {
  const sample = await runSample(process.argv[3] ?? "quarry", Number(process.argv[4] ?? 0));
  console.log(JSON.stringify(sample));
} else if (mode === "matrix") {
  const out = process.argv[3] ?? "/tmp/immortalis-freight-evidence";
  const sizes = (process.env["FREIGHT_BENCH_SIZES"] ?? "0 100 500 2000").split(/\s+/).map(Number);
  const reps = Number(process.env["FREIGHT_BENCH_REPS"] ?? 5);
  const worlds = (process.env["FREIGHT_BENCH_WORLDS"] ?? "quarry textile").split(/\s+/);
  const commit = (() => {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  })();
  mkdirSync(join(out, "raw"), { recursive: true });
  const samples: any[] = [];
  for (const w of worlds)
    for (const n of sizes)
      for (let r = 1; r <= reps; r++) {
        const stdout = execFileSync(
          process.execPath,
          [
            "--experimental-strip-types",
            "--no-warnings",
            "tools/freight-benchmark.ts",
            "run",
            w,
            String(n),
          ],
          {
            encoding: "utf8",
            maxBuffer: 256 * 1024 * 1024,
            env: { ...process.env, FREIGHT_BENCH_COMMIT: commit ?? "" },
          },
        );
        const s = JSON.parse(stdout.trim().split("\n").pop()!);
        s.meta.iteration = r;
        s.meta.iterations = reps;
        writeFileSync(join(out, "raw", `${w}-${n}-${r}.json`), JSON.stringify(s) + "\n");
        samples.push(s);
      }
  // summary
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
  };
  const rows: any[] = [];
  const equalCausal: Record<string, boolean> = {};
  for (const w of worlds) {
    const ws = samples.filter((s) => s.meta.world === w);
    const ref = JSON.stringify(causal(ws[0]));
    equalCausal[w] = ws.every((s) => JSON.stringify(causal(s)) === ref);
    for (const n of sizes) {
      const g = ws.filter((s) => s.meta.dormant_loci === n);
      rows.push({
        world: w,
        dormant_loci: n,
        samples: g.length,
        facts_before: g[0].facts_before_operation,
        operation_ms: g.map((s) => Math.round(s.operation.elapsed_ms * 10) / 10),
        operation_ms_median: median(g.map((s) => s.operation.elapsed_ms)),
        commit_p50_ms_median: median(g.map((s) => s.operation.commit_elapsed_ms.p50)),
        commit_p95_ms_median: median(g.map((s) => s.operation.commit_elapsed_ms.p95)),
        reopen_ms: g.map((s) => Math.round(s.cold_reopen.elapsed_ms * 10) / 10),
        reopen_ms_median: median(g.map((s) => s.cold_reopen.elapsed_ms)),
        canonical_commits: g[0].operation.canonical_commits,
        owner_reads: g[0].operation.freight.ownerReads,
        derivations: g[0].operation.freight.derivations,
        gip_head_scans: g[0].operation.freight.gipHeadScans,
        gip_head_scanned_facts: g[0].operation.freight.gipHeadScannedFacts,
        gip_head_advances: g[0].operation.freight.gipHeadAdvances,
        fs_read_bytes: g[0].operation.fs_read_bytes,
        fs_write_bytes: g[0].operation.fs_write_bytes,
        reopen_gip_head_scanned_facts: g[0].cold_reopen.freight.gipHeadScannedFacts,
        verify_violations: g.map(
          (s) => s.verify_violations_after_operation + s.verify_violations_after_reopen,
        ),
      });
    }
  }
  const summary = {
    meta: {
      tool: "tools/freight-benchmark.ts",
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
    equal_causal_work_across_dormant_sizes: equalCausal,
    rows,
  };
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  if (!Object.values(equalCausal).every(Boolean)) {
    console.error(
      "causal work differed across dormant sizes: the deterministic counters are NOT equal",
    );
    process.exit(1);
  }
} else {
  console.error("usage: freight-benchmark.ts run <quarry|textile> <dormantLoci> | matrix [outDir]");
  process.exit(2);
}
