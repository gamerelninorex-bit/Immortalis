// Runs in its OWN operating-system process so that "close" really discards all in-memory state.
// usage: node --experimental-strip-types entity-process.ts <create|load|continue> <dir>
import { ENTITY_FIXTURE_EXTENSION, PROD_T1, REQ_1, prodAdvanceRequest } from "@immortalis/testkit";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  acceptCauseRegister,
  currentLocusOfRequest,
  entCoordinator,
  entSummary,
  registerConsumer,
  seededEntityCampaign,
} from "../../support/entity.ts";
import { CAUSE_1 } from "@immortalis/testkit";

const [phase, dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: <create|load|continue> <dir>");

const fail = (e: unknown): never => {
  throw new Error(JSON.stringify(e));
};
const locusOf = (campaign: CanonicalCampaign) => {
  const r = currentLocusOfRequest(campaign, REQ_1);
  return r
    ? {
        current: r.current.locus.entity_id,
        origin: r.origin.locus.entity_id,
        transitioned: r.transition !== undefined,
      }
    : null;
};

if (phase === "create") {
  // established campaign → accepted entity → ONE causing result → its transition object, persisted BEFORE its boundary
  const s = await seededEntityCampaign(dir, { buildId: "process-1" });
  await acceptCauseRegister(s);
  await registerConsumer(s, CAUSE_1, REQ_1, 41);
  const summary = entSummary(s.campaign, s.coordinator);
  const violations = s.campaign.verify();
  const locus = locusOf(s.campaign);
  await s.campaign.close();
  console.log(JSON.stringify({ summary, violations, locus }));
} else if (phase === "load") {
  const opened = await CanonicalCampaign.open(dir, {
    buildId: "process-2",
    extension: ENTITY_FIXTURE_EXTENSION,
  });
  if (!opened.ok) fail(opened.error);
  const campaign = opened.ok ? opened.value : (null as never);
  const violations = campaign.verify();
  const summary = entSummary(campaign, entCoordinator(campaign.store));
  const locus = locusOf(campaign);
  await campaign.close();
  console.log(JSON.stringify({ summary, violations, locus }));
} else if (phase === "continue") {
  const opened = await CanonicalCampaign.open(dir, {
    buildId: "process-3",
    extension: ENTITY_FIXTURE_EXTENSION,
  });
  if (!opened.ok) fail(opened.error);
  const campaign = opened.ok ? opened.value : (null as never);
  const coordinator = entCoordinator(campaign.store);
  const before = entSummary(campaign, coordinator);
  const r = await coordinator.advance(prodAdvanceRequest("tx-transition", PROD_T1));
  if (!r.ok) fail(r.error);
  const after = entSummary(campaign, coordinator);
  const again = await coordinator.advance(prodAdvanceRequest("tx-transition", PROD_T1));
  if (!again.ok) fail(again.error);
  const afterReplay = entSummary(campaign, coordinator);
  const violations = campaign.verify();
  const locus = locusOf(campaign);
  await campaign.close();
  console.log(
    JSON.stringify({
      before,
      after,
      afterReplay,
      violations,
      locus,
      replayed: again.ok ? again.value.replayed : null,
      outcome: r.ok ? r.value : null,
    }),
  );
} else {
  throw new Error(`unknown phase ${String(phase)}`);
}
