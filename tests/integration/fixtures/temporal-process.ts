// Runs in its OWN operating-system process so that "close" really discards all in-memory state.
// usage: node --experimental-strip-types temporal-process.ts <create|load|continue> <dir>
import { CanonicalCampaign, TemporalCoordinator } from "@immortalis/engine";
import {
  SYNTH_EXTENSION,
  continuationInput,
  stopAtBoundaryRequest,
  syntheticProviders,
} from "@immortalis/testkit";
import { reopen, seededTemporalCampaign, temporalSummary } from "../../support/temporal.ts";

const [phase, dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: <create|load|continue> <dir>");

const fail = (e: unknown): never => {
  throw new Error(JSON.stringify(e));
};

if (phase === "create") {
  const { campaign, coordinator } = await seededTemporalCampaign(dir, { buildId: "process-1" });
  const r = await coordinator.advance(stopAtBoundaryRequest("tx-1"));
  if (!r.ok) fail(r.error);
  const summary = temporalSummary(campaign, coordinator);
  await campaign.close();
  console.log(JSON.stringify({ summary, outcome: r.ok ? r.value : null }));
} else if (phase === "load") {
  const { campaign, coordinator } = await reopen(dir, "process-2");
  const violations = campaign.verify();
  const summary = temporalSummary(campaign, coordinator);
  await campaign.close();
  console.log(JSON.stringify({ summary, violations }));
} else if (phase === "continue") {
  const opened = await CanonicalCampaign.open(dir, {
    buildId: "process-3",
    extension: SYNTH_EXTENSION,
  });
  if (!opened.ok) fail(opened.error);
  const campaign = opened.ok ? opened.value : (null as never);
  const coordinator = new TemporalCoordinator(campaign.store, syntheticProviders());
  const before = temporalSummary(campaign, coordinator);
  const r = await coordinator.continueRemainder(continuationInput("tx-2"));
  if (!r.ok) fail(r.error);
  const after = temporalSummary(campaign, coordinator);
  const violations = campaign.verify();
  await campaign.close();
  console.log(JSON.stringify({ before, after, violations, outcome: r.ok ? r.value : null }));
} else {
  throw new Error(`unknown phase ${String(phase)}`);
}
