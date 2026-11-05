/* eslint-disable @typescript-eslint/no-explicit-any -- reducer over untyped raw benchmark JSON, never production */
// Reduces the raw samples of tools/bootstrap-benchmark.sh to a matched base-versus-head report (medians, with min/max retained).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , dir, baseSha, headSha] = process.argv as [string, string, string, string, string];
const raw = join(dir!, "raw");
const files = readdirSync(raw).filter((f) => f.endsWith(".json"));
const load = (f: string): any => JSON.parse(readFileSync(join(raw, f), "utf8"));
const med = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const range = (xs: number[]) => ({ median: med(xs), min: Math.min(...xs), max: Math.max(...xs) });
const group = (variant: string, n: string) =>
  files.filter((f) => f.startsWith(`${variant}-${n}-`)).map(load);
const counts = [
  ...new Set(files.filter((f) => f.startsWith("before-")).map((f) => f.split("-")[1]!)),
].sort((a, b) => Number(a) - Number(b));
const rows: any[] = [];
for (const n of counts) {
  const out: any = { extra_sources: Number(n) };
  for (const variant of ["before", "after-oldid", "after-native"]) {
    const g = group(variant, n);
    if (g.length === 0) continue;
    const pick = (i: number, k: string) => g.map((s) => s.passes[i][k] as number);
    out[variant] = {
      samples: g.length,
      journal_entries: g[0].passes[0].journal_entries,
      history_verification_id: g[0].history_verification_id,
      cold_open_ms: range(pick(0, "elapsed_ms")),
      cold_open_cpu_ms: range(g.map((s) => s.passes[0].cpu_user_ms + s.passes[0].cpu_system_ms)),
      cold_open_read_bytes: med(pick(0, "read_bytes")),
      cold_open_read_calls: med(pick(0, "read_calls")),
      cold_open_write_bytes: med(pick(0, "write_bytes")),
      cold_open_groups_verified: med(pick(0, "groups_historically_verified")),
      warm_open_ms: range(pick(1, "elapsed_ms")),
      warm_open_groups_verified: med(pick(1, "groups_historically_verified")),
      hot_path_commit_ms: range(g.map((s) => s.hot_path_commit.commit_ms)),
      hot_path_write_bytes: med(g.map((s) => s.hot_path_commit.write_bytes)),
      hot_path_admission_checks: med(g.map((s) => s.hot_path_commit.admission_checks)),
      peak_rss_kb: range(g.map((s) => s.peak_rss_kb)),
      fixture_bytes: g[0].fixture_bytes,
    };
  }
  rows.push(out);
}
const guard = files.filter((f) => f.startsWith("guard-")).map(load);
const first = load(files.find((f) => f.startsWith("before-"))!);
const summary = {
  base_sha: baseSha,
  head_sha: headSha,
  tier: "T1 mechanism only: no host, model or provider; T2/T3 latency UNRUN",
  node: first.node,
  platform: first.platform,
  cpu_model: first.cpu_model,
  repetitions_per_cell: rows[0]?.before?.samples,
  rows,
  option_a_presence_guard_scan: guard,
};
writeFileSync(join(dir!, "summary.json"), JSON.stringify(summary, null, 2));
const f = (r: any) => `${r.median.toFixed(1)} (${r.min.toFixed(1)}–${r.max.toFixed(1)})`;
let md = `# Initial Locality Bootstrap v0.9 — matched cost evidence (T1 mechanism only)\n\nbase \`${baseSha}\` versus head \`${headSha}\`; ${summary.node} on ${summary.platform}; ${summary.cpu_model}; ${summary.repetitions_per_cell} fresh-process samples per cell.\nColumns: **before** = base code on a base-built fixture; **after, old id** = head code on the SAME fixture (first open after the historyVerificationId change); **after, native** = head code on a head-built fixture.\n\n`;
md +=
  "| journal entries | variant | cold open ms | cold CPU ms | cold read bytes | cold groups verified | warm open ms | warm groups verified | ordinary commit ms | peak RSS kB |\n|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|\n";
for (const r of rows)
  for (const v of ["before", "after-oldid", "after-native"])
    if (r[v])
      md += `| ${r[v].journal_entries} | ${v} | ${f(r[v].cold_open_ms)} | ${f(r[v].cold_open_cpu_ms)} | ${r[v].cold_open_read_bytes} | ${r[v].cold_open_groups_verified} | ${f(r[v].warm_open_ms)} | ${r[v].warm_open_groups_verified} | ${f(r[v].hot_path_commit_ms)} | ${r[v].peak_rss_kb.median} |\n`;
md +=
  "\n## Option A presence-guard scan (head only)\n\n| facts in prefix | first call ms (kinds not yet cached) | steady-state ms per call |\n|---:|---:|---:|\n";
for (const g of guard)
  md += `| ${g.facts} | ${g.qualifies_first_call_ms.toFixed(3)} | ${g.qualifies_warm_ms_per_call.toFixed(3)} |\n`;
writeFileSync(
  join(dir!, "report.md"),
  md + "\nNo SLA is invented; the figures describe this fixture and runtime only.\n",
);
console.log(md);
