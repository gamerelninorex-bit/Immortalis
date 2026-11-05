/* eslint-disable @typescript-eslint/no-explicit-any -- reducer over untyped raw benchmark JSON, never production */
// Reduces the raw samples of tools/bootstrap-bearing-benchmark.sh to a matched bootstrap-bearing versus non-bootstrap report (median, min, max).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , dir, headSha] = process.argv as [string, string, string, string];
const raw = join(dir!, "raw");
const files = readdirSync(raw).filter((f) => f.endsWith(".json"));
const load = (f: string): any => JSON.parse(readFileSync(join(raw, f), "utf8"));
const med = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const f = (xs: number[]) =>
  `${med(xs).toFixed(1)} (${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)})`;
const group = (prefix: string, n: string) =>
  files.filter((x) => x.startsWith(`${prefix}-${n}-`)).map(load);
const counts = [
  ...new Set(files.filter((x) => x.startsWith("fx-plain-")).map((x) => x.split("-")[2]!)),
].sort((a, b) => Number(a) - Number(b));
const first = load(files.find((x) => x.startsWith("fx-plain-"))!);
const summary: any = {
  head_sha: headSha,
  tier: "T1 mechanism only: scripted isolated answers and fixture proofs; no host, model or provider; T2/T3 latency UNRUN",
  node: first.node,
  platform: first.platform,
  cpu_model: first.cpu_model,
  rows: [] as any[],
};
let md = `# Initial Locality Bootstrap v0.9 — bootstrap-bearing versus non-bootstrap cost and recovery (T1 mechanism only)\n\nhead \`${headSha}\` only (the base has no bootstrap route); ${summary.node} on ${summary.platform}; ${summary.cpu_model}; ${group("fx-plain", counts[0]!).length} fresh-process samples per cell. Both columns run under the SAME test-only fixture admission, same code, same runtime and the same journal length: **no-bootstrap** is a campaign with no bootstrap record; **bootstrap-bearing** carries a real intake → SCOPE → Grant → SCENE → Completion (8 journal entries).\n\n`;
md +=
  "| ordinary entries after setup | variant | journal entries | cold open ms | cold CPU ms | cold read bytes | cold groups verified | warm open ms | warm groups verified | ordinary commit ms | peak RSS kB |\n|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n";
for (const n of counts) {
  for (const [label, prefix] of [
    ["no-bootstrap", "fx-plain"],
    ["bootstrap-bearing", "fx-bootstrap"],
  ] as const) {
    const g = group(prefix, n);
    if (g.length === 0) continue;
    const pick = (i: number, k: string) => g.map((s) => s.passes[i][k] as number);
    const row = {
      extra: Number(n),
      variant: label,
      journal_entries: g[0].passes[0].journal_entries,
      cold_ms: pick(0, "elapsed_ms"),
      cold_cpu_ms: g.map((s) => s.passes[0].cpu_user_ms + s.passes[0].cpu_system_ms),
      cold_read_bytes: med(pick(0, "read_bytes")),
      cold_groups: med(pick(0, "groups_historically_verified")),
      warm_ms: pick(1, "elapsed_ms"),
      warm_groups: med(pick(1, "groups_historically_verified")),
      commit_ms: g.map((s) => s.hot_path_commit.commit_ms as number),
      rss_kb: g.map((s) => s.peak_rss_kb as number),
    };
    summary.rows.push({ ...row, samples: g.length });
    md += `| ${n} | ${label} | ${row.journal_entries} | ${f(row.cold_ms)} | ${f(row.cold_cpu_ms)} | ${row.cold_read_bytes} | ${row.cold_groups} | ${f(row.warm_ms)} | ${row.warm_groups} | ${f(row.commit_ms)} | ${f(row.rss_kb)} |\n`;
  }
}
md +=
  "\n## Open after a torn journal tail (a crash mid-append)\n\n| ordinary entries after setup | variant | torn tail reported (bytes) | open ms | open CPU ms | read bytes | peak RSS kB |\n|---:|---|---:|---:|---:|---:|---:|\n";
summary.residue = [] as any[];
for (const n of counts) {
  for (const [label, prefix] of [
    ["no-bootstrap", "residue-plainfx"],
    ["bootstrap-bearing", "residue-bootstrap"],
  ] as const) {
    const g = group(prefix, n);
    if (g.length === 0) continue;
    summary.residue.push({ extra: Number(n), variant: label, samples: g.length });
    md += `| ${n} | ${label} | ${g[0].torn_tail_bytes_reported} | ${f(g.map((s) => s.elapsed_ms))} | ${f(g.map((s) => s.cpu_user_ms + s.cpu_system_ms))} | ${med(g.map((s) => s.read_bytes))} | ${f(g.map((s) => s.peak_rss_kb))} |\n`;
  }
}
const rec = files.filter((x) => x.startsWith("recovery-")).map(load);
summary.recovery = { samples: rec.length };
md += `\n## Bootstrap crash recovery: restart the service over a SCOPE send window left open by a crash and resume\n\nRecover-or-park, never a second driver call. Journal entries at restart: ${rec[0]?.journal_entries}; status after resume: \`${rec[0]?.status}\`; driver calls: ${rec.map((r) => r.driver_calls).join(", ")} (must all be 0).\n\n| resume ms | resume CPU ms | read bytes | write bytes | peak RSS kB |\n|---:|---:|---:|---:|---:|\n| ${f(rec.map((r) => r.elapsed_ms))} | ${f(rec.map((r) => r.cpu_user_ms + r.cpu_system_ms))} | ${med(rec.map((r) => r.read_bytes))} | ${med(rec.map((r) => r.write_bytes))} | ${f(rec.map((r) => r.peak_rss_kb))} |\n`;
writeFileSync(join(dir!, "summary.json"), JSON.stringify(summary, null, 2));
writeFileSync(
  join(dir!, "report.md"),
  md +
    "\nNo SLA is invented; the figures describe this fixture and runtime only. Read bytes count the engine's own file seam.\n",
);
console.log(md);
