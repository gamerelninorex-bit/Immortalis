// Each phase runs in its OWN operating-system process so that "close" really discards all in-memory
// state. usage: node --experimental-strip-types world-foundation-process.ts <establish|bind|inspect> <dir>
import { CanonicalCampaign } from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureLocus,
  fixtureWorld,
  publication,
} from "@immortalis/testkit";

const [phase, dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: <establish|bind|inspect> <dir>");

const must = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
const snapshot = (c: CanonicalCampaign) => ({
  head: c.store.head(),
  facts: c.store.listFacts(),
  violations: c.verify(),
});
const bindInput = {
  ...publication(4),
  pc_id: FIXTURE_PC_ID,
  world_id: FIXTURE_WORLD_ID,
  locus_id: FIXTURE_LOCUS_ID,
};

if (phase === "establish") {
  const c = must(
    await CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, buildId: "process-1" }),
  );
  must(await c.establishWorld({ ...publication(1), world: fixtureWorld() }));
  must(await c.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  must(await c.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
  console.log(JSON.stringify(snapshot(c)));
  await c.close();
} else if (phase === "bind") {
  const c = must(await CanonicalCampaign.open(dir, { buildId: "process-2" }));
  const before = snapshot(c);
  const receipt = must(await c.bindPlayerCharacter(bindInput));
  console.log(JSON.stringify({ before, receipt, after: snapshot(c) }));
  await c.close();
} else if (phase === "inspect") {
  const c = must(await CanonicalCampaign.open(dir, { buildId: "process-3" }));
  const before = snapshot(c);
  const replay = must(await c.bindPlayerCharacter(bindInput));
  const second = await c.bindPlayerCharacter({ ...bindInput, ...publication(5) });
  console.log(
    JSON.stringify({
      before,
      replay,
      second: second.ok ? "OK" : second.error.code,
      after: snapshot(c),
    }),
  );
  await c.close();
} else {
  throw new Error(`unknown phase ${String(phase)}`);
}
