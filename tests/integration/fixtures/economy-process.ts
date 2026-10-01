// Runs in its OWN operating-system process so that "close" really discards all in-memory state.
// usage: node --experimental-strip-types economy-process.ts <create|load|continue> <dir>
import { CanonicalCampaign } from "@immortalis/engine";
import { DEMAND_1, PROD_T1, prodAdvanceRequest } from "@immortalis/testkit";
import {
  econCoordinator,
  econSummary,
  issueStartRegister,
  reopenEconomy,
  seededEconomyCampaign,
} from "../../support/economy.ts";
import { EconomyAdapter } from "@immortalis/engine";

const [phase, dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: <create|load|continue> <dir>");

const fail = (e: unknown): never => {
  throw new Error(JSON.stringify(e));
};

if (phase === "create") {
  // established campaign → carrier ledger → ONE demand + request → ONE started operation, persisted BEFORE
  // its completion boundary
  const s = await seededEconomyCampaign(dir, { buildId: "process-1" });
  await issueStartRegister(s, DEMAND_1, 1);
  const summary = econSummary(s.campaign, s.coordinator);
  const violations = s.campaign.verify();
  await s.campaign.close();
  console.log(JSON.stringify({ summary, violations }));
} else if (phase === "load") {
  const s = await reopenEconomy(dir, "process-2");
  const violations = s.campaign.verify();
  const summary = econSummary(s.campaign, s.coordinator);
  const access = s.economy.access(DEMAND_1);
  await s.campaign.close();
  console.log(JSON.stringify({ summary, violations, access }));
} else if (phase === "continue") {
  const opened = await CanonicalCampaign.open(dir, { buildId: "process-3" });
  if (!opened.ok) fail(opened.error);
  const campaign = opened.ok ? opened.value : (null as never);
  const coordinator = econCoordinator(campaign.store);
  const before = econSummary(campaign, coordinator);
  const r = await coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1));
  if (!r.ok) fail(r.error);
  const after = econSummary(campaign, coordinator);
  const again = await coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1));
  if (!again.ok) fail(again.error);
  const afterReplay = econSummary(campaign, coordinator);
  const violations = campaign.verify();
  const access = new EconomyAdapter(campaign.store).access(DEMAND_1).state;
  await campaign.close();
  console.log(
    JSON.stringify({
      before,
      after,
      afterReplay,
      violations,
      access,
      replayed: again.ok ? again.value.replayed : null,
      outcome: r.ok ? r.value : null,
    }),
  );
} else {
  throw new Error(`unknown phase ${String(phase)}`);
}
