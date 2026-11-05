/* eslint-disable @typescript-eslint/no-explicit-any -- reducer over untyped raw benchmark JSON, never production */
// Reduces the raw samples of tools/h07-s3-benchmark.sh to the matched BASE versus HEAD report (median, min, max over the measured
// repetitions; rep 0 of every cell is the excluded warmup) and checks that both builds produced the identical canonical outcome.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , dir, baseSha, headSha] = process.argv as [string, string, string, string, string];
const rawDir = join(dir!, "raw");
const SERIES = "canonical|store|shape-early|shape-middle|shape-late|shape-rotate";
const NAME = new RegExp(
  `^(sample|interrupted|profile|counters)-(${SERIES})(?:-(old|native))?-(\\d+)-(\\d+)-(base|head)\\.json$`,
);
const SERIES_LIST = SERIES.split("|");
interface Raw {
  kind: string;
  series: string;
  variant: string;
  n: number;
  rep: number;
  build: string;
  data: any;
}
const raws: Raw[] = readdirSync(rawDir)
  .map((f) => {
    const m = NAME.exec(f);
    if (!m) return null;
    return {
      kind: m[1]!,
      series: m[2]!,
      variant: m[3] ?? "old",
      n: Number(m[4]),
      rep: Number(m[5]),
      build: m[6]!,
      data: JSON.parse(readFileSync(join(rawDir, f), "utf8")),
    } as Raw;
  })
  .filter((x): x is Raw => x !== null);

const med = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const fmt = (xs: number[], d = 1) =>
  xs.length === 0
    ? "–"
    : `${med(xs).toFixed(d)} (${Math.min(...xs).toFixed(d)}–${Math.max(...xs).toFixed(d)})`;
const int = (xs: number[]) => (xs.length === 0 ? "–" : Math.round(med(xs)).toLocaleString("en-US"));
const cell = (kind: string, series: string, variant: string, n: number, build: string) =>
  raws.filter(
    (r) =>
      r.kind === kind &&
      r.series === series &&
      r.variant === variant &&
      r.n === n &&
      r.build === build &&
      r.rep >= 1,
  );
const sizes = (kind: string, series: string, variant: string) =>
  [
    ...new Set(
      raws
        .filter((r) => r.kind === kind && r.series === series && r.variant === variant)
        .map((r) => r.n),
    ),
  ].sort((a, b) => a - b);
const pass = (g: Raw[], label: string, key: string) =>
  g.map((r) => r.data.passes.find((p: any) => p.label === label)[key] as number);
const cpu = (g: Raw[], label: string) =>
  g.map((r) => {
    const p = r.data.passes.find((x: any) => x.label === label);
    return p.cpu_user_ms + p.cpu_system_ms;
  });
const whole = (g: Raw[]) =>
  g.map((r) =>
    ["first-open", "accepted-commit", "close"]
      .map((l) => r.data.passes.find((p: any) => p.label === l).elapsed_ms as number)
      .reduce((a, b) => a + b, 0),
  );
const ratio = (a: number[], b: number[]) =>
  a.length && b.length && med(b) > 0 ? `${(med(a) / med(b)).toFixed(2)}×` : "–";

const sample0 = raws.find((r) => r.kind === "sample")?.data;
const summary: any = {
  base_sha: baseSha,
  head_sha: headSha,
  tier: "T1 mechanism only: no host, model or provider; T2/T3 latency UNRUN",
  node: sample0?.node,
  platform: sample0?.platform,
  cpu_model: sample0?.cpu_model,
  logical_cpus: sample0?.logical_cpus,
  fs_type: sample0?.fs_type,
  samples: raws.length,
  identical_outcomes: [] as any[],
  rows: [] as any[],
};
let md = `# H-07 S3 — strict historical replay cost of a policy-transition first open: exact BASE versus exact HEAD (T1 mechanism only, OB-030)\n\nbase \`${baseSha}\`; head code \`${headSha}\`; ${summary.node} on ${summary.platform}; ${summary.cpu_model} (${summary.logical_cpus} logical CPUs); filesystem type ${summary.fs_type}. Each cell: fresh process per sample on a private copy of the SAME fixture, one excluded warmup, then the measured repetitions (median (min–max)). BASE and HEAD alternate within a cell so drift affects both. No SLA is invented; the figures describe these synthetic fixtures and this runtime only.\n\n`;

function transitionTable(series: string, title: string) {
  const ns = sizes("sample", series, "old");
  if (!ns.length) return;
  md += `## ${title}\n\n`;
  md +=
    "| entries | build | n | first open ms | first open CPU ms | strict passes | entries replayed | groups verified | full-state digests | MB hashed by SHA-256 (physical) | MB the digests cover (logical) | prefix states copied | sha256 calls | journal full reads | read MB | write KB | fsyncs | peak RSS kB | whole first use ms (open+commit+close) | commit ms | 2nd open ms | 3rd open ms |\n|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n";
  for (const n of ns)
    for (const build of ["base", "head"]) {
      const g = cell("sample", series, "old", n, build);
      if (!g.length) continue;
      const f = (k: string) => pass(g, "first-open", k);
      const row = {
        series,
        entries: n,
        build,
        n: g.length,
        first_open_ms: f("elapsed_ms"),
        first_open_cpu_ms: cpu(g, "first-open"),
        strict_passes: f("strict_passes"),
        replay_entries: f("replay_entries"),
        groups_verified: f("groups_verified"),
        full_state_hashes: f("full_state_hashes"),
        full_state_hash_bytes: f("full_state_hash_bytes"),
        full_state_logical_bytes: f("full_state_logical_bytes"),
        hash_copies: f("hash_copies"),
        sha256_calls: f("sha256_calls"),
        journal_full_reads: f("journal_full_reads"),
        read_bytes: f("read_bytes"),
        write_bytes: f("write_bytes"),
        fsyncs: f("fsyncs"),
        peak_rss_kb: f("peak_rss_kb"),
        whole_first_use_ms: whole(g),
        commit_ms: pass(g, "accepted-commit", "elapsed_ms"),
        second_open_ms: pass(g, "second-open", "elapsed_ms"),
        third_open_ms: pass(g, "third-open", "elapsed_ms"),
        second_open_groups_verified: pass(g, "second-open", "groups_verified"),
      };
      summary.rows.push({ ...row, kind: "transition" });
      md += `| ${n} | ${build} | ${g.length} | ${fmt(row.first_open_ms)} | ${fmt(row.first_open_cpu_ms)} | ${int(row.strict_passes)} | ${int(row.replay_entries)} | ${int(row.groups_verified)} | ${int(row.full_state_hashes)} | ${(med(row.full_state_hash_bytes) / 1e6).toFixed(1)} | ${(med(row.full_state_logical_bytes) / 1e6).toFixed(1)} | ${int(row.hash_copies)} | ${int(row.sha256_calls)} | ${int(row.journal_full_reads)} | ${(med(row.read_bytes) / 1e6).toFixed(1)} | ${(med(row.write_bytes) / 1e3).toFixed(0)} | ${int(row.fsyncs)} | ${int(row.peak_rss_kb)} | ${fmt(row.whole_first_use_ms)} | ${fmt(row.commit_ms)} | ${fmt(row.second_open_ms)} | ${fmt(row.third_open_ms)} |\n`;
    }
  md += `\n**BASE ÷ HEAD (medians):**\n\n| entries | first open wall | first open CPU | strict passes | entries replayed | groups verified | full-state hashes | read bytes | peak RSS | whole first use |\n|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
  for (const n of ns) {
    const b = cell("sample", series, "old", n, "base");
    const h = cell("sample", series, "old", n, "head");
    if (!b.length || !h.length) continue;
    const r = (k: string) => ratio(pass(b, "first-open", k), pass(h, "first-open", k));
    md += `| ${n} | ${r("elapsed_ms")} | ${ratio(cpu(b, "first-open"), cpu(h, "first-open"))} | ${r("strict_passes")} | ${r("replay_entries")} | ${r("groups_verified")} | ${r("full_state_hashes")} | ${r("read_bytes")} | ${r("peak_rss_kb")} | ${ratio(whole(b), whole(h))} |\n`;
  }
  md += "\n";
}
transitionTable(
  "canonical",
  "First open of a canonical old-policy package (real owners; the package was written by the exact prior-contract build; state AND history grow)",
);
transitionTable(
  "store",
  "First open of a one-fact old-policy package (history grows, state does not)",
);
for (const shape of ["early", "middle", "late", "rotate"])
  transitionTable(
    `shape-${shape}`,
    `First open of an old-policy package with a fixed-size state whose history rewrites an EXISTING fact at the ${shape} position of the key order (adversarial for prefix reuse)`,
  );

function nativeTable(series: string, title: string) {
  const ns = sizes("sample", series, "native");
  if (!ns.length) return;
  md += `## ${title}\n\nThe policy already matches this build: the ordinary path, which this change must not regress.\n\n| entries | build | n | open ms | groups verified | commit ms | 2nd open ms | peak RSS kB |\n|---:|---|---:|---:|---:|---:|---:|---:|\n`;
  for (const n of ns)
    for (const build of ["base", "head"]) {
      const g = cell("sample", series, "native", n, build);
      if (!g.length) continue;
      summary.rows.push({
        kind: "native",
        series,
        entries: n,
        build,
        open_ms: pass(g, "first-open", "elapsed_ms"),
        commit_ms: pass(g, "accepted-commit", "elapsed_ms"),
        second_open_ms: pass(g, "second-open", "elapsed_ms"),
      });
      md += `| ${n} | ${build} | ${g.length} | ${fmt(pass(g, "first-open", "elapsed_ms"))} | ${int(pass(g, "first-open", "groups_verified"))} | ${fmt(pass(g, "accepted-commit", "elapsed_ms"))} | ${fmt(pass(g, "second-open", "elapsed_ms"))} | ${int(pass(g, "first-open", "peak_rss_kb"))} |\n`;
    }
  md += "\n";
}
nativeTable("canonical", "Ordinary open and commit, canonical package (matched policy)");
nativeTable("store", "Ordinary open and commit, one-fact package (matched policy)");
for (const shape of ["early", "middle", "late", "rotate"])
  nativeTable(
    `shape-${shape}`,
    `Ordinary open and commit, ${shape}-rewrite package (matched policy)`,
  );

function interruptedTable() {
  const rows = SERIES_LIST.flatMap((series) =>
    [
      ...new Set(
        raws.filter((r) => r.kind === "interrupted" && r.series === series).map((r) => r.n),
      ),
    ]
      .sort((a, b) => a - b)
      .map((n) => ({ series, n })),
  );
  if (!rows.length) return;
  md += `## Crash before the manifest publication, then the recovery open\n\nThe first open is killed just before the manifest rename (successor files exist, the old manifest is authoritative); the recovery open is a fresh open under the new policy. HEAD only where the BASE cost is unbounded for a repeated crash fixture.\n\n| series | entries | build | n | killed first open ms | recovery open ms | recovery strict passes | recovery entries replayed | policy after kill | policy after recovery |\n|---|---:|---|---:|---:|---:|---:|---:|---|---|\n`;
  for (const { series, n } of rows)
    for (const build of ["base", "head"]) {
      const g = cell("interrupted", series, "old", n, build);
      if (!g.length) continue;
      const p = (label: string, k: string) => pass(g, label, k);
      summary.rows.push({
        kind: "interrupted",
        series,
        entries: n,
        build,
        killed_ms: p("killed-first-open", "elapsed_ms"),
        recovery_ms: p("recovery-open", "elapsed_ms"),
      });
      md += `| ${series} | ${n} | ${build} | ${g.length} | ${fmt(p("killed-first-open", "elapsed_ms"))} | ${fmt(p("recovery-open", "elapsed_ms"))} | ${int(p("recovery-open", "strict_passes"))} | ${int(p("recovery-open", "replay_entries"))} | ${g[0]!.data.policy_after_kill} | ${g[0]!.data.policy_after_recovery} |\n`;
    }
  md += "\n";
}
interruptedTable();

const profiles = raws.filter((r) => r.kind === "profile");
if (profiles.length) {
  md += `## Where the first open of a canonical old-policy package spends its time (inspector profile, inclusive ms; the profiler perturbs timing)\n\n| entries | build | profiled ms | GC ms | replay | stateSha256 (reference) | incremental digest | canonicalJson | owner validation (verifyAll) | loadCheckpoint | reconcileCheckpointStates | proveSuccessor | index extend | index lookup |\n|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
  for (const r of profiles.sort((a, b) => a.n - b.n || a.build.localeCompare(b.build))) {
    const i = r.data.inclusive_ms as Record<string, number>;
    const k = (name: string) => (i[name] ?? 0).toFixed(0);
    summary.rows.push({ kind: "profile", entries: r.n, build: r.build, inclusive_ms: i });
    md += `| ${r.n} | ${r.build} | ${r.data.profiled_ms.toFixed(0)} | ${r.data.gc_ms.toFixed(0)} | ${k("replay campaign-core.ts")} | ${k("stateSha256 campaign-core.ts")} | ${k("digest state-digest.ts")} | ${k("canonicalJson json.ts")} | ${k("verifyAll canonical-campaign.ts")} | ${k("loadCheckpoint checkpoint-package.ts")} | ${k("reconcileCheckpointStates checkpoint-package.ts")} | ${k("proveSuccessor checkpoint-package.ts")} | ${k("extend history-index.ts")} | ${k("lookup history-index.ts")} |\n`;
  }
  md += "\n";
}

const counterRows = raws.filter((r) => r.kind === "counters");
if (counterRows.length) {
  md += `## What the first open serialises, sorts, copies and encodes (untimed instrumented pass, one per build)\n\nThe instrumentation (JSON.stringify and Array.prototype.sort wrappers, a Map constructor proxy, Buffer.from) perturbs timing, so these counts are never mixed with the timed samples. "Large" means 64 or more elements. State-sized Map copies are \`new Map(state.facts)\`, one per replayed entry on both builds.\n\n| series | entries | build | JSON.stringify calls | JSON.stringify chars (M) | large sorts | elements sorted (M) | state-sized Map copies | entries copied (M) | Buffer.from(string) calls | bytes encoded (MB) | full-state digests | MB hashed (physical) | MB covered (logical) | prefix states copied |\n|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
  for (const r of counterRows.sort(
    (a, b) => a.series.localeCompare(b.series) || a.n - b.n || a.build.localeCompare(b.build),
  )) {
    const c = r.data.first_open_counters;
    summary.rows.push({
      kind: "counters",
      series: r.series,
      entries: r.n,
      build: r.build,
      counters: c,
    });
    md += `| ${r.series} | ${r.n} | ${r.build} | ${Math.round(c.json_stringify_calls).toLocaleString("en-US")} | ${(c.json_stringify_chars / 1e6).toFixed(1)} | ${c.large_sorts} | ${(c.large_sort_elements / 1e6).toFixed(2)} | ${c.state_map_copies} | ${(c.state_map_copy_entries / 1e6).toFixed(2)} | ${c.buffer_from_string_calls.toLocaleString("en-US")} | ${(c.buffer_from_string_bytes / 1e6).toFixed(1)} | ${c.full_state_hashes} | ${(c.full_state_hash_bytes / 1e6).toFixed(1)} | ${(c.full_state_logical_bytes / 1e6).toFixed(1)} | ${c.hash_copies.toLocaleString("en-US")} |\n`;
  }
  md += "\n";
}

// identical canonical outcome (head, every fact, probe receipts/groups, journal bytes, the accepted commit's receipt) for every matched pair
md +=
  "## Identical canonical outcome (BASE versus HEAD, every measured sample)\n\n| kind | series | variant | entries | samples | distinct outcome digests | identical |\n|---|---|---|---:|---:|---:|---|\n";
const keys = [
  ...new Set(
    raws
      .filter((r) => r.kind !== "profile" && r.kind !== "counters")
      .map((r) => `${r.kind}|${r.series}|${r.variant}|${r.n}`),
  ),
];
let allIdentical = true;
for (const key of keys.sort()) {
  const [kind, series, variant, n] = key.split("|") as [string, string, string, string];
  const g = raws.filter(
    (r) => r.kind === kind && r.series === series && r.variant === variant && r.n === Number(n),
  );
  const digests = new Set(g.map((r) => r.data.outcome_sha256 as string));
  const builds = new Set(g.map((r) => r.build));
  const identical = digests.size === 1;
  if (!identical) allIdentical = false;
  summary.identical_outcomes.push({
    kind,
    series,
    variant,
    entries: Number(n),
    builds: [...builds],
    digests: [...digests],
  });
  md += `| ${kind} | ${series} | ${variant} | ${n} | ${g.length} (${[...builds].join("+")}) | ${digests.size} | ${identical ? "yes" : "**NO**"} |\n`;
}
summary.all_outcomes_identical = allIdentical;
md += `\nAll compared outcomes identical: **${allIdentical ? "yes" : "NO"}**.\n`;
writeFileSync(join(dir!, "summary.json"), JSON.stringify(summary, null, 2));
writeFileSync(join(dir!, "report.md"), md);
console.log(md);
