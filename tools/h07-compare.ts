// Deterministic acceptance plus matched medians; this is not a universal millisecond SLA.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
const dir = process.argv[2];
if (!dir) throw new Error("supply evidence directory");
const rawDir = join(dir, "raw");
const read = (name: string) => JSON.parse(readFileSync(join(rawDir, name), "utf8"));
const expectedHead = process.env.H07_EXACT_SHA;
assert.match(expectedHead ?? "", /^[0-9a-f]{40}$/);
const phases = ["normal_reopen", "one_fact_commit", "fixed_action", "strict_audit"];
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
type PhaseStat = {
  before: { median: number; range: number[] };
  after: { median: number; range: number[] };
};
type Row = {
  kind: string;
  count: number;
  timing: Record<string, PhaseStat>;
  before_work: unknown;
  after_work: unknown;
};
const summary: Row[] = [];
const digests = new Set<string>();
for (const kind of ["state", "history"])
  for (const count of kind === "state" ? [0, 100, 1000, 5000, 10000] : [0, 100, 500, 2000]) {
    const before = Array.from({ length: 5 }, (_, i) =>
      read(`before-${kind}-${count}-${i + 1}.json`),
    );
    const after = Array.from({ length: 5 }, (_, i) => read(`after-${kind}-${count}-${i + 1}.json`));
    for (let i = 0; i < 5; i++) {
      assert.equal(after[i].sha, expectedHead);
      assert.equal(before[i].sha, "e8fd50b3de6f4f0f1e7be71fa97ff3b5434ea587");
      assert.deepEqual(after[i].env, before[i].env);
      assert.deepEqual(after[i].one_fact_receipt, before[i].one_fact_receipt);
      assert.deepEqual(after[i].action_head, before[i].action_head);
      assert.equal(after[i].action_digest, before[i].action_digest);
      digests.add(after[i].action_digest);
      assert.deepEqual(after[i].coordinator, {
        keyed_reads: 27,
        unique_keys: 10,
        listings: 0,
        groups: 4,
      });
      assert.equal(
        after[i].phases.one_fact_commit.routine_state_file_bytes ??
          after[i].phases.one_fact_commit.state_file_bytes,
        0,
      );
      assert.equal(
        after[i].phases.fixed_action.routine_state_file_bytes ??
          after[i].phases.fixed_action.state_file_bytes,
        0,
      );
      if (kind === "history" && count === 2000)
        assert.ok(after[i].phases.normal_reopen.journal_replayed <= 128);
    }
    const timing = Object.fromEntries(
      phases.map((p) => [
        p,
        {
          before: {
            median: median(before.map((x) => x.phases[p].ms)),
            range: [
              Math.min(...before.map((x) => x.phases[p].ms)),
              Math.max(...before.map((x) => x.phases[p].ms)),
            ],
          },
          after: {
            median: median(after.map((x) => x.phases[p].ms)),
            range: [
              Math.min(...after.map((x) => x.phases[p].ms)),
              Math.max(...after.map((x) => x.phases[p].ms)),
            ],
          },
        },
      ]),
    );
    if (kind === "state" && count === 10000) {
      assert.ok(
        timing.one_fact_commit!.after.median < timing.one_fact_commit!.before.median,
        "large state one-fact median must improve",
      );
      assert.ok(
        timing.fixed_action!.after.median < timing.fixed_action!.before.median,
        "large state fixed-action median must improve",
      );
    }
    if (kind === "history" && count === 2000)
      assert.ok(
        timing.normal_reopen!.after.median < timing.normal_reopen!.before.median,
        "large-history normal reopen median must improve",
      );
    summary.push({
      kind,
      count,
      timing,
      before_work: before[0].phases,
      after_work: after[0].phases,
    });
  }
assert.equal(digests.size, 1, "unrelated state/history cannot change the action result");
const endpoint = (kind: string, count: number) =>
  summary.find((x) => x.kind === kind && x.count === count)!;
const slopes = Object.fromEntries(
  ["state", "history"].map((kind) => {
    const max = kind === "state" ? 10000 : 2000,
      lo = endpoint(kind, 0),
      hi = endpoint(kind, max);
    return [
      kind,
      Object.fromEntries(
        phases.map((p) => [
          p,
          {
            before_ms_per_added_unit:
              (hi.timing[p]!.before.median - lo.timing[p]!.before.median) / max,
            after_ms_per_added_unit:
              (hi.timing[p]!.after.median - lo.timing[p]!.after.median) / max,
          },
        ]),
      ),
    ];
  }),
);
const head = read("after-state-0-1.json").sha;
assert.match(head, /^[0-9a-f]{40}$/);
const rows = summary
  .filter((x) => x.kind === "state" || x.count === 2000)
  .map(
    (x) =>
      `| ${x.kind} ${x.count} | ${x.timing.one_fact_commit!.before.median.toFixed(2)} → ${x.timing.one_fact_commit!.after.median.toFixed(2)} | ${x.timing.fixed_action!.before.median.toFixed(2)} → ${x.timing.fixed_action!.after.median.toFixed(2)} | ${x.timing.normal_reopen!.before.median.toFixed(2)} → ${x.timing.normal_reopen!.after.median.toFixed(2)} |`,
  );
const report = `# H-07 matched mechanism benchmark\n\nExact after HEAD: ${head}\n\nFive measured fresh-process samples per case, plus excluded sample 0. All old/new receipts, journal heads and substantive result digests match. Routine one-key and four-group action state-file payload bytes are zero; periodic checkpoint payloads are reported separately in each phase and in dedicated checkpoint-cycle records. Full hashing, current-state owner checking, migration and strict audit remain explicitly outside any change-driven scaling claim.\n\n| Fixture | One fact ms | Fixed action ms | Normal reopen ms |\n| --- | ---: | ---: | ---: |\n${rows.join("\n")}\n\nEndpoint scaling slopes (ms per added unrelated fact or historical commit): \`${JSON.stringify(slopes)}\`.\n\nThe complete raw records, warmups, medians/ranges, work counters and environment are retained beside this report. Dormant historical corruption requires access or strict audit; no live-client or production acceptance is claimed.\n`;
writeFileSync(
  join(dir, "summary.json"),
  JSON.stringify(
    { head, summary, digest: [...digests][0], raw_samples: readdirSync(rawDir).length },
    null,
    2,
  ),
);
writeFileSync(join(dir, "report.md"), report);
process.stdout.write(report);
