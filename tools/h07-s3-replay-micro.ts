// H-07 S3 focused, in-process measurement of the strict replay's per-entry cost, independent of the file store: a chain of `entries`
// one-fact commits over a state of at most `facts` facts is built by the live path, then replayed 7 times by fresh CampaignCores.
// It uses only the engine's public surface, so the same file runs unchanged in the exact BASE tree and the exact HEAD tree.
//   usage (from inside a checkout, with its packages installed): node --experimental-strip-types --no-warnings
//         tools/h07-s3-replay-micro.ts <label> <entries> <facts>
// T1 mechanism measurement only; no host, model or provider.
import type { CommitGroup, JournalEntry } from "@immortalis/contracts";
import { CampaignCore, emptyState } from "@immortalis/engine";
import { TEST_OWNERS, group, write } from "@immortalis/testkit";

const [, , label, entriesArg, factsArg] = process.argv;
const entries = Number(entriesArg);
const facts = Number(factsArg);
if (!label || !(entries > 0) || !(facts > 0)) throw new Error("usage: <label> <entries> <facts>");

const fresh = () =>
  new CampaignCore({
    campaignId: "c",
    specLockSha256: "a".repeat(64),
    owners: TEST_OWNERS,
    state: emptyState("c"),
    headSha256: "b".repeat(64),
  });
const source = fresh();
const journal: JournalEntry[] = [];
for (let n = 1; n <= entries; n++) {
  const key = `fact/${String(n % facts).padStart(5, "0")}`;
  const g: CommitGroup = group("c", n, [
    write(
      key,
      { n, pad: "x".repeat(300) },
      { expected_version: source.state.facts.get(key)?.version ?? 0 },
    ),
  ]);
  const prepared = source.prepare(g);
  if (!prepared.ok || prepared.value.kind !== "apply") throw new Error("fixture refused");
  source.accept(prepared.value);
  journal.push(prepared.value.entry);
}
const times: number[] = [];
for (let rep = 0; rep < 7; rep++) {
  const core = fresh();
  const started = performance.now();
  for (const entry of journal) if (!core.replay(entry).ok) throw new Error("replay refused");
  times.push(performance.now() - started);
}
times.sort((a, b) => a - b);
const median = times[3]!;
console.log(
  `${label} entries=${entries} facts<=${facts}: median replay ${median.toFixed(1)} ms (${((median / entries) * 1000).toFixed(1)} us/entry), min ${times[0]!.toFixed(1)} ms, max ${times[6]!.toFixed(1)} ms`,
);
