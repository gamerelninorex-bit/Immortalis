// Runs in its OWN operating-system process so that "close" really discards all in-memory state.
// usage: node --experimental-strip-types population-process.ts <create|load|continue> <dir>
import { CanonicalCampaign } from "@immortalis/engine";
import {
  POPULATION_FIXTURE_EXTENSION,
  POP_TC,
  POP_TC2,
  advanceToRequest,
  popConsumerObject,
  temporalPublication,
} from "@immortalis/testkit";
import {
  popCoordinator,
  popSummary,
  reopenPopulation,
  seededPendingConsumer,
} from "../../support/population.ts";

const [phase, dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: <create|load|continue> <dir>");

const fail = (e: unknown): never => {
  throw new Error(JSON.stringify(e));
};

if (phase === "create") {
  const { campaign, coordinator } = await seededPendingConsumer(dir, { buildId: "process-1" });
  const r = await coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC));
  if (!r.ok) fail(r.error);
  const summary = popSummary(campaign, coordinator);
  await campaign.close();
  console.log(JSON.stringify({ summary, outcome: r.ok ? r.value : null }));
} else if (phase === "load") {
  const { campaign, coordinator, population } = await reopenPopulation(dir, "process-2");
  const violations = campaign.verify();
  const summary = popSummary(campaign, coordinator);
  const view = population.cohortView("ledger-main", "cohort-status-l");
  await campaign.close();
  console.log(JSON.stringify({ summary, violations, view: view.ok ? view.value : view }));
} else if (phase === "continue") {
  const opened = await CanonicalCampaign.open(dir, {
    buildId: "process-3",
    extension: POPULATION_FIXTURE_EXTENSION,
  });
  if (!opened.ok) fail(opened.error);
  const campaign = opened.ok ? opened.value : (null as never);
  const coordinator = popCoordinator(campaign.store);
  const before = popSummary(campaign, coordinator);
  const again = await coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC));
  if (!again.ok) fail(again.error);
  const afterReplay = popSummary(campaign, coordinator);
  const reg = await coordinator.registerObject({
    ...temporalPublication(50),
    object: popConsumerObject(2),
  });
  if (!reg.ok) fail(reg.error);
  const r = await coordinator.advance(advanceToRequest("tx-consumer-2", POP_TC2));
  if (!r.ok) fail(r.error);
  const after = popSummary(campaign, coordinator);
  const violations = campaign.verify();
  await campaign.close();
  console.log(
    JSON.stringify({
      before,
      afterReplay,
      after,
      violations,
      replayed: again.ok ? again.value.replayed : null,
      outcome: r.ok ? r.value : null,
    }),
  );
} else {
  throw new Error(`unknown phase ${String(phase)}`);
}
