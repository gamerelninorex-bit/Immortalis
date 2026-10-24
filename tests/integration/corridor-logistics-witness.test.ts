// The disposable integration witness: the topology is authored by the SHIPPED operator commands (ordinary canonical registry, one typed
// confirmation each, in a fresh pre-play campaign, independently of any Logistics demand) and is only THEN consumed by the existing
// Logistics chain, whose test-owned requester, entity and declared delivery boundary are separate fixtures. It proves the mechanism across
// the two owners — NOT a live route-calibration producer, an actor decision, an AI-semantics witness or ordinary player travel.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0, unchanged). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  LogisticsCommitmentSchema,
  worldCorridorKey,
  worldFallbackEntityKey,
} from "@immortalis/contracts";
import { CanonicalCampaign, LogisticsAdapter, ProductionAdapter } from "@immortalis/engine";
import {
  DEST_LOCUS_ID,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  LOGISTICS_FIXTURE_EXTENSION,
  LOG_T_DELIVERY,
  MOVE_1,
  PROD_T0,
  REQ_1,
  REQ_2,
  REQ_OTHER,
  RESERVE_OTHER,
  dispatchInput,
  logPublication,
  logStopAtBoundaryRequest,
  movementRequest,
  movementRequestGroup,
  prodPublication,
  requestGroup,
  reserveInput,
  temporalPublication,
  transitionKeyOf,
} from "@immortalis/testkit";
import {
  acceptLogEntity,
  entityIdOf,
  locusOfRequest,
  logCoordinator,
  registerTransfer,
  type LogSeeded,
} from "../support/logistics.ts";
import { corridorCommit } from "../support/logistics-corridor.ts";
import { addCorridor, writeCorridor } from "../support/corridor.ts";
import { addLocality, localityDoc, writeLocality } from "../support/additional-locality.ts";
import {
  LOCALITY_CAMPAIGN,
  establish,
  freshDirs,
  setupDoc,
  writeSetup,
} from "../support/locality.ts";
import { must } from "../support/temporal.ts";

/** The test-owned requester commits its request into this (operator-created) campaign, under its own identity. */
const commitMovementRequest = (s: LogSeeded, moveId: string, entityRequestId: string, n: number) =>
  must(
    s.campaign.store.commit(
      movementRequestGroup(LOCALITY_CAMPAIGN, n, moveId, movementRequest(moveId, entityRequestId)),
    ),
  );

const W = FIXTURE_WORLD_ID;
const E = entityIdOf(REQ_1);

/** The pre-play scenario, authored through the shipped commands with the logistics fixture's world and loci identities. */
async function authoredScenario() {
  const dirs = freshDirs();
  const setup = setupDoc();
  setup.world.world_id = W;
  setup.locus.world_id = W;
  setup.locus.locus_id = FIXTURE_LOCUS_ID;
  setup.source.world_id = W;
  setup.source.locus_id = FIXTURE_LOCUS_ID;
  expect((await establish(dirs, writeSetup(setup))).result.status).toBe("LOCALITY_READY");

  const second = localityDoc();
  second.locus.world_id = W;
  second.locus.locus_id = DEST_LOCUS_ID;
  second.source.world_id = W;
  second.source.locus_id = DEST_LOCUS_ID;
  expect((await addLocality(dirs, writeLocality(second))).result.status).toBe(
    "ADDITIONAL_LOCALITY_READY",
  );

  const corridor = {
    format: "immortalis-corridor",
    format_version: 1,
    corridor: {
      world_id: W,
      from_locus_id: FIXTURE_LOCUS_ID,
      to_locus_id: DEST_LOCUS_ID,
      statement: "A plank walk joins the first settlement to the second (test prose).",
    },
  };
  const { result } = await addCorridor(dirs, writeCorridor(corridor));
  expect(result.status, JSON.stringify(result.details)).toBe("CORRIDOR_READY");
  return dirs;
}

/** Opens the operator-authored package with the test-owned requester registered, and seeds the Logistics fixtures' other parties. */
async function consumer(dir: string): Promise<LogSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dir, {
      buildId: "corridor-witness",
      extension: LOGISTICS_FIXTURE_EXTENSION,
    }),
  );
  const s: LogSeeded = {
    campaign,
    coordinator: logCoordinator(campaign.store),
    production: new ProductionAdapter(campaign.store),
    logistics: new LogisticsAdapter(campaign.store),
  };
  let n = 1;
  for (const id of [REQ_1, REQ_2, REQ_OTHER])
    await must(campaign.store.commit(requestGroup(LOCALITY_CAMPAIGN, n++, id)));
  await must(s.production.establishReserve({ ...prodPublication(1), reserve: reserveInput() }));
  await must(
    s.production.establishReserve({
      ...prodPublication(2),
      reserve: reserveInput(RESERVE_OTHER, 7),
    }),
  );
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: PROD_T0 }));
  return s;
}

describe("a corridor authored by the shipped command is consumed by Logistics, and the existing chain completes", () => {
  it("authored first, independently of any demand; then request, source-qualified commitment, dispatch, due boundary, destination commit and retirement", async () => {
    const dirs = await authoredScenario();
    const s = await consumer(dirs.campaignDir);
    try {
      const corridorFact = s.campaign.store.getFact(
        worldCorridorKey(W, FIXTURE_LOCUS_ID, DEST_LOCUS_ID),
      )!;
      // the operator's own provenance, long before any request, entity or commitment existed
      expect(corridorFact.provenance.group_id).toMatch(/^operator-corridor:[0-9a-f]{32}$/);
      expect(s.campaign.store.listFacts().some((f) => f.key.startsWith("logistics/"))).toBe(false);

      await acceptLogEntity(s, REQ_1, 1);
      await commitMovementRequest(s, MOVE_1, REQ_1, 1);
      await must(
        s.logistics.commitCorridorMovement({
          ...logPublication(1),
          commit: corridorCommit(MOVE_1, { corridor_key: corridorFact.key }),
        }),
      );
      const commitment = LogisticsCommitmentSchema.parse(s.logistics.commitment(W, E)!.fact.value);
      expect(commitment.corridor).toEqual({
        owner: "world_state",
        fact_key: corridorFact.key,
        version: 1,
      });
      expect(commitment.delivery.at).toEqual(LOG_T_DELIVERY); // the declared boundary is the test requester's, not the corridor's
      expect(locusOfRequest(s, REQ_1)).toMatchObject({
        phase: "STATIONARY_AT_ORIGIN",
        authority: "WORLD_STATE",
      });

      await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
      expect(locusOfRequest(s, REQ_1)).toMatchObject({
        phase: "IN_TRANSFER",
        authority: "LOGISTICS",
      });
      await registerTransfer(s, REQ_1, 31);

      const done = await must(s.coordinator.advance(logStopAtBoundaryRequest("tx-move", MOVE_1)));
      expect(done.transaction.outcome.actual_stop).toEqual(LOG_T_DELIVERY);
      expect(locusOfRequest(s, REQ_1)).toMatchObject({
        phase: "DESTINATION_COMMITTED",
        authority: "WORLD_STATE",
      });
      expect(locusOfRequest(s, REQ_1)!.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
      expect(s.campaign.store.getFact(transitionKeyOf(REQ_1))!.version).toBe(1);
      // the operator-authored corridor, the first locus, the source facts and the entity were never rewritten
      expect(s.campaign.store.getFact(corridorFact.key)).toEqual(corridorFact);
      expect(s.campaign.store.getFact(worldFallbackEntityKey(W, E))!.version).toBe(1);
      expect(s.campaign.verify()).toEqual([]);
    } finally {
      await s.campaign.close();
    }
  }, 120_000);

  it("without the authored corridor the same request earns no source-qualified commitment; the corridor is read, not assumed", async () => {
    const dirs = freshDirs();
    const setup = setupDoc();
    setup.world.world_id = W;
    setup.locus.world_id = W;
    setup.locus.locus_id = FIXTURE_LOCUS_ID;
    setup.source.world_id = W;
    setup.source.locus_id = FIXTURE_LOCUS_ID;
    expect((await establish(dirs, writeSetup(setup))).result.status).toBe("LOCALITY_READY");
    const second = localityDoc();
    second.locus.world_id = W;
    second.locus.locus_id = DEST_LOCUS_ID;
    second.source.world_id = W;
    second.source.locus_id = DEST_LOCUS_ID;
    expect((await addLocality(dirs, writeLocality(second))).result.status).toBe(
      "ADDITIONAL_LOCALITY_READY",
    );
    const s = await consumer(dirs.campaignDir);
    try {
      await acceptLogEntity(s, REQ_1, 1);
      await commitMovementRequest(s, MOVE_1, REQ_1, 1);
      const r = await s.logistics.commitCorridorMovement({
        ...logPublication(1),
        commit: corridorCommit(MOVE_1, {
          corridor_key: worldCorridorKey(W, FIXTURE_LOCUS_ID, DEST_LOCUS_ID),
        }),
      });
      expect(r.ok ? "OK" : r.error.code).toBe("PREREQUISITE_MISSING");
      expect(s.logistics.commitment(W, E)).toBeUndefined();
    } finally {
      await s.campaign.close();
    }
  }, 120_000);
});
