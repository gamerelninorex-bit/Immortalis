// Runs in its OWN operating-system process so that "close" really discards all in-memory state.
// usage: node --experimental-strip-types logistics-process.ts <create|load|continue> <dir>
import {
  LOGISTICS_FIXTURE_EXTENSION,
  LOG_T_DELIVERY,
  MOVE_1,
  REQ_1,
  logStopAtBoundaryRequest,
} from "@immortalis/testkit";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  acceptCommitDispatchRegister,
  entityIdOf,
  logCoordinator,
  logSummary,
  seededLogisticsCampaign,
} from "../../support/logistics.ts";

const [phase, dir] = process.argv.slice(2);
if (!dir) throw new Error("usage: <create|load|continue> <dir>");

const fail = (e: unknown): never => {
  throw new Error(JSON.stringify(e));
};
const phaseOf = async (campaign: CanonicalCampaign) => {
  const { LogisticsAdapter } = await import("@immortalis/engine");
  const r = new LogisticsAdapter(campaign.store).currentLocus("world-fixture-1", entityIdOf(REQ_1));
  return r
    ? {
        phase: r.phase,
        authority: r.authority,
        stationary: r.stationary?.locus.entity_id ?? null,
        movement: r.movement
          ? [r.movement.from.locus.entity_id, r.movement.to.locus.entity_id]
          : null,
        origin: r.origin.locus.entity_id,
      }
    : null;
};

if (phase === "create") {
  // established campaign → accepted entity → commitment → dispatch → the transfer's object, persisted BEFORE its boundary
  const s = await seededLogisticsCampaign(dir, { buildId: "process-1" });
  await acceptCommitDispatchRegister(s);
  const summary = logSummary(s.campaign, s.coordinator);
  const violations = s.campaign.verify();
  const where = await phaseOf(s.campaign);
  await s.campaign.close();
  console.log(JSON.stringify({ summary, violations, where }));
} else if (phase === "load") {
  const opened = await CanonicalCampaign.open(dir, {
    buildId: "process-2",
    extension: LOGISTICS_FIXTURE_EXTENSION,
  });
  if (!opened.ok) fail(opened.error);
  const campaign = opened.ok ? opened.value : (null as never);
  const violations = campaign.verify();
  const summary = logSummary(campaign, logCoordinator(campaign.store));
  const where = await phaseOf(campaign);
  await campaign.close();
  console.log(JSON.stringify({ summary, violations, where }));
} else if (phase === "continue") {
  const opened = await CanonicalCampaign.open(dir, {
    buildId: "process-3",
    extension: LOGISTICS_FIXTURE_EXTENSION,
  });
  if (!opened.ok) fail(opened.error);
  const campaign = opened.ok ? opened.value : (null as never);
  const coordinator = logCoordinator(campaign.store);
  const before = logSummary(campaign, coordinator);
  const r = await coordinator.advance(logStopAtBoundaryRequest("tx-move", MOVE_1));
  if (!r.ok) fail(r.error);
  const after = logSummary(campaign, coordinator);
  const again = await coordinator.advance(logStopAtBoundaryRequest("tx-move", MOVE_1));
  if (!again.ok) fail(again.error);
  const afterReplay = logSummary(campaign, coordinator);
  const violations = campaign.verify();
  const where = await phaseOf(campaign);
  await campaign.close();
  console.log(
    JSON.stringify({
      before,
      after,
      afterReplay,
      violations,
      where,
      replayed: again.ok ? again.value.replayed : null,
      stop: r.ok
        ? [r.value.transaction.outcome.stop_reason, r.value.transaction.outcome.actual_stop]
        : null,
      boundary: LOG_T_DELIVERY,
    }),
  );
} else {
  throw new Error(`unknown phase ${String(phase)}`);
}
