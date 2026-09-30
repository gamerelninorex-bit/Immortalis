// Runs in its OWN operating-system process so that "close" really discards all in-memory state.
// usage: node --experimental-strip-types continuity-process.ts <create|continue> <dir>
import { createFileCampaign, openFileCampaign } from "@immortalis/engine";
import { TEST_OWNERS, group, write } from "@immortalis/testkit";

const [phase, dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: <create|continue> <dir>");
const CAMPAIGN = "campaign-continuity-1";

if (phase === "create") {
  const created = await createFileCampaign(dir, {
    campaignId: CAMPAIGN,
    owners: TEST_OWNERS,
    buildId: "process-1",
  });
  if (!created.ok) throw new Error(JSON.stringify(created.error));
  const store = created.value;
  const r = await store.commit(
    group(CAMPAIGN, 1, [write("fact/a", { n: 1 }), write("fact/b", "bee")]),
  );
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  console.log(JSON.stringify({ head: store.head(), receipt: r.value.receipt }));
  await store.close();
} else if (phase === "continue") {
  const opened = await openFileCampaign(dir, { owners: TEST_OWNERS, buildId: "process-2" });
  if (!opened.ok) throw new Error(JSON.stringify(opened.error));
  const store = opened.value;
  const before = { head: store.head(), facts: store.listFacts() };
  const r = await store.commit(
    group(
      CAMPAIGN,
      2,
      [write("fact/a", { n: 2 }, { expected_version: 1 }), write("fact/c", true)],
      {
        reads: [{ key: "fact/b", version: 1 }],
      },
    ),
  );
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  console.log(JSON.stringify({ before, after: { head: store.head(), facts: store.listFacts() } }));
  await store.close();
} else {
  throw new Error(`unknown phase ${String(phase)}`);
}
