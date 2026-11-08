// Reduces the raw per-round JSON of tools/play-context-benchmark.sh to one report: for each declared size of unrelated admitted history, the
// whole-operation cost of the separate reads versus the one-call briefing, and of the terminal read-only status, exact base versus exact
// head. Pooled medians (min-max) of wall time over every round and repetition; counts are deterministic and identical across rounds.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("usage: play-context-compare.ts <evidence dir>");
const raw = join(dir, "raw");
type Journey = {
  tools: string[];
  round_trips: number;
  response_bytes: number;
  wall_ms: { all: number[] };
  counters: Record<string, number>;
};
type Row = {
  unrelated_facts_added: number;
  facts_before: number;
  journal_entries_before: number;
  legacy: Journey;
  one: Journey | null;
  terminal: Journey;
};
const load = (build: string): { sizes: number[]; rows: Map<number, Row[]> } => {
  const rows = new Map<number, Row[]>();
  for (const round of readdirSync(raw).filter(
    (f) => f.startsWith("round-") && !f.endsWith(".log"),
  )) {
    const j = JSON.parse(readFileSync(join(raw, round, `${build}.json`), "utf8"));
    for (const r of j.results as Row[])
      rows.set(r.unrelated_facts_added, [...(rows.get(r.unrelated_facts_added) ?? []), r]);
  }
  return { sizes: [...rows.keys()].sort((a, b) => a - b), rows };
};
const base = load("base");
const head = load("head");
const pooled = (rows: Row[], pick: (r: Row) => Journey | null): number[] =>
  rows.flatMap((r) => pick(r)?.wall_ms.all ?? []).sort((a, b) => a - b);
const ms = (xs: number[]): string =>
  xs.length === 0
    ? "–"
    : `${xs[Math.floor(xs.length / 2)]!.toFixed(0)} (${xs[0]!.toFixed(0)}–${xs.at(-1)!.toFixed(0)})`;
const c = (j: Journey | null | undefined, k: string): string => (j ? String(j.counters[k]) : "–");
const out: string[] = [];
const line = (...cells: (string | number)[]) => out.push(`| ${cells.join(" | ")} |`);
out.push(
  "| unrelated facts added | facts before | journal entries | journey | build | tool round trips | response bytes | verified opens | enumerations by the operation | canonical verifications | fact reads | group reads | enumerations inside open/verify (common) | wall ms median (min–max) |",
);
out.push(
  "| ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
);
for (const size of head.sizes) {
  const h = head.rows.get(size)!;
  const b = base.rows.get(size)!;
  const first = h[0]!;
  const entries = [
    ["separate reads (setting, character, Glance, play_status)", "base", b, (r: Row) => r.legacy],
    ["separate reads (setting, character, Glance, play_status)", "head", h, (r: Row) => r.legacy],
    ["`get_play_context` (one call)", "head", h, (r: Row) => r.one],
    [
      "terminal read-only `play_status` after a material operation",
      "base",
      b,
      (r: Row) => r.terminal,
    ],
    [
      "terminal read-only `play_status` after a material operation",
      "head",
      h,
      (r: Row) => r.terminal,
    ],
  ] as const;
  for (const [label, build, rows, pick] of entries) {
    const j = pick(rows[0]!);
    line(
      size,
      first.facts_before,
      first.journal_entries_before,
      label,
      build,
      j?.round_trips ?? "–",
      j?.response_bytes ?? "–",
      c(j, "opens"),
      c(j, "enumerations"),
      c(j, "verifications"),
      c(j, "fact_reads"),
      c(j, "group_reads"),
      c(j, "enumerations_inside_open_and_verify"),
      ms(pooled(rows, pick)),
    );
  }
}
console.log(out.join("\n"));
