/* eslint-disable @typescript-eslint/no-explicit-any -- process-local measurement instrumentation */
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

// Run ONE case per fresh process. Fixture sizes are measurements, never game limits.
const scenario = process.argv[2] ?? "no-ms",
  size = Number(process.argv[3] ?? 0);
const counts = {
  canonical_writes: 0,
  hash_bytes: 0,
  hash_updates: 0,
  fs_reads: 0,
  fs_read_bytes: 0,
  fs_writes: 0,
  fs_write_bytes: 0,
  fs_metadata: 0,
  package_opens: 0,
  history_index_lookups: 0,
  history_index_node_reads: 0,
  history_index_node_file_reads: 0,
};
const originalHash = crypto.createHash;
function instrumentHash(h: any): any {
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
}
crypto.createHash = ((...args: any[]) =>
  instrumentHash((originalHash as any)(...args))) as typeof crypto.createHash;
syncBuiltinESMExports();
const engine: any = await import("../packages/engine/src/index.ts"),
  fixtures = await import("../packages/testkit/src/index.ts");
const accept = engine.CampaignCore.prototype.accept;
engine.CampaignCore.prototype.accept = function (prepared: any) {
  const result = accept.call(this, prepared);
  counts.canonical_writes += prepared.entry.group.writes.length;
  return result;
};
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name],
  );
const runtimeSourceHash = originalHash("sha256");
for (const file of ["contracts", "engine", "operator"]
  .flatMap((p) => walk("packages/" + p + "/src"))
  .sort())
  runtimeSourceHash.update(
    file + "\0" + originalHash("sha256").update(readFileSync(file)).digest("hex") + "\n",
  );
const runtime_source_sha256 = runtimeSourceHash.digest("hex");
const { HistoryIndex } = await import("../packages/engine/src/persistence/history-index.ts");
const indexLookup = HistoryIndex.prototype.lookup;
const indexRead = HistoryIndex.prototype.read;
HistoryIndex.prototype.lookup = function (...args: Parameters<typeof indexLookup>) {
  counts.history_index_lookups++;
  return indexLookup.apply(this, args);
};
HistoryIndex.prototype.read = function (...args: Parameters<typeof indexRead>) {
  counts.history_index_node_reads++;
  return indexRead.apply(this, args);
};
const must = async (p: Promise<any>) => {
  const r = await p;
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
for (const [name, fn] of Object.entries(engine.nodeFs) as [string, (...a: any[]) => any][]) {
  engine.nodeFs[name] = (...args: any[]) => {
    const record = (result: any) => {
      if (["readFile", "readRange", "readRangeSync"].includes(name)) {
        counts.fs_reads++;
        if (name === "readRangeSync" && String(args[0]).includes("/history/index."))
          counts.history_index_node_file_reads++;
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
const reset = () => {
  for (const k of Object.keys(counts)) (counts as any)[k] = 0;
  if (engine.msFenceMetrics)
    for (const key of Object.keys(engine.msFenceMetrics)) engine.msFenceMetrics[key] = 0;
};
const snapshot = () => ({
  ...counts,
  fence: engine.msFenceMetrics
    ? { ...engine.msFenceMetrics }
    : { reads: 0, scans: 0, rebuilds: 0, scannedFacts: 0, keyInspections: 0, viewReads: 0 },
});
const measure = async (label: string, fn: () => Promise<any>) => {
  global.gc?.();
  reset();
  const before = process.memoryUsage(),
    start = performance.now();
  await fn();
  const elapsed_ms = performance.now() - start,
    after = process.memoryUsage();
  return {
    label,
    elapsed_ms,
    ...snapshot(),
    rss_before: before.rss,
    rss_after: after.rss,
    heap_before: before.heapUsed,
    heap_after: after.heapUsed,
  };
};
let campaign: any,
  dir: string,
  admission: any,
  actorCalls = () => 0;
if (scenario === "no-ms") {
  dir = mkdtempSync(join(tmpdir(), "immortalis-ms-bench-no-"));
  campaign = await must(
    engine.CanonicalCampaign.create(dir, { campaignId: "ms-bench-ordinary", buildId: "ms-bench" }),
  );
} else {
  const { msHarness } = await import("../tests/support/ms-setup.ts");
  const h = await msHarness({ priorScopeSessions: scenario === "active" ? size : 0 });
  if (h.setup.status !== "COMPLETED") throw new Error(JSON.stringify(h.setup));
  campaign = h.campaign;
  dir = h.dir;
  admission = h.admission;
  actorCalls = h.calls;
  if (scenario === "active") {
    const per_commit: any[] = [],
      store: any = h.store,
      commit = store.commit.bind(store);
    store.commit = async (group: any) => {
      const start = performance.now(),
        before = snapshot(),
        r = await commit(group),
        after = snapshot();
      per_commit.push({
        key: group.writes[0].key,
        ok: r.ok,
        replayed: r.value?.replayed ?? false,
        elapsed_ms: performance.now() - start,
        hash_bytes: after.hash_bytes - before.hash_bytes,
        fs_read_bytes: after.fs_read_bytes - before.fs_read_bytes,
        fs_write_bytes: after.fs_write_bytes - before.fs_write_bytes,
        fence_reads: after.fence.reads - before.fence.reads,
        fence_scans: after.fence.scans - before.fence.scans,
      });
      return r;
    };
    const gip = new engine.GipAdapter(h.store);
    const refusal = await measure("complete-active-window-refusal", async () => {
      const r = await gip.establishInstitution({
        ...fixtures.gipPublication(999),
        institution: fixtures.institutionIdentity("active-refusal"),
      });
      if (r.ok || r.error.details?.reason !== "MS_PHASE_FENCE")
        throw new Error("active unrelated group was not refused by the MS fence");
    });
    const active = await measure("complete-active-chain", async () => {
      const r = await h.actorService.advance();
      if (r.status !== "COMPLETED") throw new Error(JSON.stringify(r));
    });
    await campaign.close();
    const cold = await measure("strict-audit-open", async () => {
      counts.package_opens++;
      const c = await must(
        engine.CanonicalCampaign.open(dir, { testkitFixtureAdmission: admission, audit: true }),
      );
      await c.close();
    });
    const forced = await measure("forced-policy-replay-open", async () => {
      counts.package_opens++;
      const c = await must(
        engine.CanonicalCampaign.open(dir, {
          testkitFixtureAdmission: {
            ...admission,
            historyVerificationId: admission.historyVerificationId + "+benchmark-force-policy",
          },
        }),
      );
      await c.close();
    });
    console.log(
      JSON.stringify({
        scenario,
        size,
        node: process.version,
        pid: process.pid,
        platform: process.platform,
        arch: process.arch,
        runtime_source_sha256,
        samples: [active, refusal, cold, forced],
        per_commit,
        actor_model_calls: actorCalls(),
        max_rss_kib: process.resourceUsage().maxRSS,
      }),
    );
    process.exit(0);
  }
  const r = await h.actorService.advance();
  if (r.status !== "COMPLETED") throw new Error(JSON.stringify(r));
}
const gip = new engine.GipAdapter(campaign.store);
for (let n = 0; n < size; n++)
  await must(
    gip.establishInstitution({
      ...fixtures.gipPublication(n + 1),
      institution: fixtures.institutionIdentity("unrelated-" + n),
    }),
  );
const ordinary = await measure("complete-ordinary-owner-operation", () =>
  must(
    gip.establishInstitution({
      ...fixtures.gipPublication(size + 1),
      institution: fixtures.institutionIdentity("ordinary-target"),
    }),
  ),
);
await campaign.close();
const command = await measure("complete-command-open-write-close", async () => {
  counts.package_opens++;
  const c = await must(
    engine.CanonicalCampaign.open(dir, admission ? { testkitFixtureAdmission: admission } : {}),
  );
  await must(
    new engine.GipAdapter(c.store).establishInstitution({
      ...fixtures.gipPublication(size + 2),
      institution: fixtures.institutionIdentity("complete-command-target"),
    }),
  );
  await c.close();
});
const warm = await measure("warm-verified-open", async () => {
  counts.package_opens++;
  const c = await must(
    engine.CanonicalCampaign.open(dir, admission ? { testkitFixtureAdmission: admission } : {}),
  );
  await c.close();
});
const cold = await measure("strict-audit-open", async () => {
  counts.package_opens++;
  const c = await must(
    engine.CanonicalCampaign.open(dir, {
      ...(admission ? { testkitFixtureAdmission: admission } : {}),
      audit: true,
    }),
  );
  await c.close();
});
const policy = admission ?? engine.canonicalAdmission;
const forced = await measure("forced-policy-replay-open", async () => {
  counts.package_opens++;
  const c = await must(
    engine.CanonicalCampaign.open(dir, {
      testkitFixtureAdmission: {
        ...policy,
        historyVerificationId: policy.historyVerificationId + "+benchmark-force-policy",
      },
    }),
  );
  await c.close();
});
console.log(
  JSON.stringify({
    scenario,
    size,
    node: process.version,
    pid: process.pid,
    platform: process.platform,
    arch: process.arch,
    runtime_source_sha256,
    samples: [ordinary, command, warm, cold, forced],
    actor_model_calls: scenario === "no-ms" ? 0 : actorCalls(),
    ordinary_model_calls: 0,
    max_rss_kib: process.resourceUsage().maxRSS,
  }),
);
