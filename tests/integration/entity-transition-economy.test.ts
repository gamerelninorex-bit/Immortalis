/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// World-State Entity Continuity / Transition Close — history stays valid (acceptance 11). An entity the existing
// Economy path realized (demand → Production request → completion → acceptance → realized access) transitions
// LATER, and the earlier Production and Economy facts are byte-identical and still verify: a later current locus
// never rewrites an earlier fact, because the accepted entity those facts pin is never rewritten.
// Register lineage: IA-02, IA-03, IA-30 (partial); RC-02, RC-10; IM-03, IM-06, IM-11. Local success is NOT
// provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  economyRealizationKey,
  productionOutputReference,
  worldFallbackEntityKey,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  EconomyAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  economyRealizationProvider,
  entityCurrentLocus,
  entityTransitionTemporalObject,
  productionCompletionProvider,
  worldEntityTransitionProvider,
  worldFallbackAcceptanceProvider,
} from "@immortalis/engine";
import { EntityTransitionCauseSchema } from "@immortalis/contracts";
import {
  CAUSE_1,
  DEMAND_1,
  DEST_LOCUS_ID,
  ENTITY_FIXTURE_EXTENSION,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  PROD_T1,
  PROD_TC,
  causeKey,
  fixtureDestinationLocus,
  operationOf,
  prodAdvanceRequest,
  publication,
  temporalPublication,
} from "@immortalis/testkit";
import { commitCause } from "../support/entity.ts";
import { issueStartRegister, seededEconomyCampaign } from "../support/economy.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const opId = operationOf(DEMAND_1);
const entityId = productionOutputReference(opId);
const providers = () =>
  new StageProviderRegistry([
    productionCompletionProvider,
    worldFallbackAcceptanceProvider,
    economyRealizationProvider,
    worldEntityTransitionProvider,
  ]);

describe("a later entity transition does not rewrite the Production or Economy facts it follows", () => {
  it("an Economy-realized entity moves; the demand, request, operation, completion, acceptance and realized access are byte-identical and still verify", async () => {
    const dir = tempDir();
    const s = await seededEconomyCampaign(dir, { extension: ENTITY_FIXTURE_EXTENSION });
    // the destination is a locus of the world, established by World-State beforehand (a transition creates none)
    await must(s.campaign.establishLocus({ ...publication(7), locus: fixtureDestinationLocus() }));
    await issueStartRegister(s, DEMAND_1, 1);
    const coordinator = new TemporalCoordinator(s.campaign.store, providers());
    // the whole Economy chain resolves at its declared boundary; canonical time stops exactly there
    await must(coordinator.advance(prodAdvanceRequest("tx-realize", PROD_TC)));
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");

    const history = () =>
      s.campaign.store
        .listFacts()
        .filter((f) => /^(economy|production)\/|^world\/[^/]+\/entity\/[^/]+$/.test(f.key));
    const before = history();
    const realization = s.campaign.store.getFact(economyRealizationKey(DEMAND_1))!;
    expect((realization.value as any).delivery_result.version).toBe(1);

    // an external cause later requires the realized entity to change locus
    await commitCause(s, CAUSE_1, opId, 1);
    const cause = s.campaign.store.getFact(causeKey(CAUSE_1))!;
    await must(
      coordinator.registerObject({
        ...temporalPublication(60),
        object: entityTransitionTemporalObject({
          key: cause.key,
          owner: cause.owner,
          value: EntityTransitionCauseSchema.parse(cause.value),
        }),
      }),
    );
    await must(coordinator.advance(prodAdvanceRequest("tx-transition", PROD_T1)));

    // the entity is now elsewhere; every earlier fact is exactly as it was, and everything still verifies
    const where = entityCurrentLocus(s.campaign.store, FIXTURE_WORLD_ID, entityId)!;
    expect(where.origin.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    expect(where.current.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(history()).toEqual(before);
    expect(s.campaign.store.getFact(economyRealizationKey(DEMAND_1))).toEqual(realization);
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    expect(s.production.availability(opId).state).toBe("ACCEPTED_AVAILABLE");
    expect(s.campaign.verify()).toEqual([]);

    // and after a close and load, in a fresh build
    await s.campaign.close();
    const re = await must(
      CanonicalCampaign.open(dir, { buildId: "econ-after", extension: ENTITY_FIXTURE_EXTENSION }),
    );
    expect(re.verify()).toEqual([]);
    expect(new EconomyAdapter(re.store).access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    expect(entityCurrentLocus(re.store, FIXTURE_WORLD_ID, entityId)!.current.locus.entity_id).toBe(
      DEST_LOCUS_ID,
    );
    expect(re.store.getFact(worldFallbackEntityKey(FIXTURE_WORLD_ID, entityId))!.version).toBe(1);
    await re.close();
  });
});
