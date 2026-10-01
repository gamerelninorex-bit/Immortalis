// Runs in its OWN operating-system process so that "close" really discards all in-memory state.
// usage: node --experimental-strip-types production-process.ts <create|load|continue> <dir>
import { CanonicalCampaign } from "@immortalis/engine";
import {
  PRODUCTION_FIXTURE_EXTENSION,
  PROD_T1,
  REQ_1,
  prodAdvanceRequest,
} from "@immortalis/testkit";
import {
  prodCoordinator,
  prodSummary,
  reopenProduction,
  seededProductionCampaign,
  startAndRegister,
} from "../../support/production.ts";

const [phase, dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: <create|load|continue> <dir>");

const fail = (e: unknown): never => {
  throw new Error(JSON.stringify(e));
};

if (phase === "create") {
  // established campaign → exact Reserve → ONE started operation, persisted BEFORE its completion boundary
  const s = await seededProductionCampaign(dir, { buildId: "process-1" });
  await startAndRegister(s, REQ_1, 1);
  const summary = prodSummary(s.campaign, s.coordinator);
  const violations = s.campaign.verify();
  await s.campaign.close();
  console.log(JSON.stringify({ summary, violations }));
} else if (phase === "load") {
  const s = await reopenProduction(dir, "process-2");
  const violations = s.campaign.verify();
  const summary = prodSummary(s.campaign, s.coordinator);
  const availability = s.production.availability(REQ_1);
  await s.campaign.close();
  console.log(JSON.stringify({ summary, violations, availability }));
} else if (phase === "continue") {
  const opened = await CanonicalCampaign.open(dir, {
    buildId: "process-3",
    extension: PRODUCTION_FIXTURE_EXTENSION,
  });
  if (!opened.ok) fail(opened.error);
  const campaign = opened.ok ? opened.value : (null as never);
  const coordinator = prodCoordinator(campaign.store);
  const before = prodSummary(campaign, coordinator);
  const r = await coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1));
  if (!r.ok) fail(r.error);
  const after = prodSummary(campaign, coordinator);
  const again = await coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1));
  if (!again.ok) fail(again.error);
  const afterReplay = prodSummary(campaign, coordinator);
  const violations = campaign.verify();
  await campaign.close();
  console.log(
    JSON.stringify({
      before,
      after,
      afterReplay,
      violations,
      replayed: again.ok ? again.value.replayed : null,
      outcome: r.ok ? r.value : null,
    }),
  );
} else {
  throw new Error(`unknown phase ${String(phase)}`);
}
