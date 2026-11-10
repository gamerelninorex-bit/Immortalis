import { describe, it, expect } from "vitest";
import {
  CanonicalCampaign,
  SourceDrawdownAdapter,
  ProductionAdapter,
  TemporalCoordinator,
  verifyMsIntegrity,
  inspectMsFenceView,
} from "@immortalis/engine";
import {
  PRODUCTION_FIXTURE_EXTENSION,
  requestGroup,
  drawdownRequest,
  drawdownPublication,
  basisInput,
  prodPublication,
  reserveRawInput,
  drawdownProviders,
  drawdownAdvanceRequest,
  SRC_REQ_1,
  SRC_RESERVE,
  FIXTURE_WORLD_ID,
  SRC_SOURCE_KEY,
  SRC_T0,
} from "@immortalis/testkit";
import { msHarness } from "../support/ms-setup.ts";
import { startAndRegisterExtraction } from "../support/source-drawdown.ts";
import { must } from "../support/temporal.ts";

describe("MS three verification tiers after advancing source/time", () => {
  it("preserves the past release and verifies/reopens a lawful later source drawdown under warm evidence and forced strict policy replay", async () => {
    const h = await msHarness({
      extension: PRODUCTION_FIXTURE_EXTENSION,
      doc: {
        format: "immortalis-starting-chronology",
        format_version: 1,
        time: SRC_T0,
        statement: "SYNTHETIC FIXTURE: source-drawdown starting chronology",
      },
    });
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    await must(
      h.store.commit(requestGroup(h.campaignId, 1, SRC_REQ_1, drawdownRequest(SRC_REQ_1))),
    );
    const drawdown = new SourceDrawdownAdapter(h.store),
      production = new ProductionAdapter(h.store),
      coordinator = new TemporalCoordinator(h.store, drawdownProviders());
    await must(
      drawdown.establishBasis({ ...drawdownPublication(1), extraction_basis: basisInput() }),
    );
    await must(production.establishReserve({ ...prodPublication(1), reserve: reserveRawInput() }));
    await startAndRegisterExtraction(
      { campaign: h.campaign, drawdown, production, coordinator },
      SRC_REQ_1,
      1,
    );
    await must(coordinator.advance(drawdownAdvanceRequest("tx-ms-source-drawdown")));
    expect(drawdown.sourceCondition(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!.fact.version).toBe(2);
    expect(drawdown.reserve(SRC_RESERVE)!.value.quantity.amount).toBe(3);
    expect(inspectMsFenceView(h.state())).toMatchObject({ released: true });
    expect(verifyMsIntegrity(h.store)).toEqual([]);
    expect(h.campaign.verify()).toEqual([]);
    const head = h.store.head();
    await h.campaign.close();
    let opened = await must(h.reopen());
    expect(opened.store.head()).toEqual(head);
    expect(opened.verify()).toEqual([]);
    await opened.close();
    const forced = {
      ...h.admission,
      historyVerificationId: h.admission.historyVerificationId + "+test-force-replay",
    };
    opened = await must(
      CanonicalCampaign.open(h.dir, {
        testkitFixtureAdmission: forced,
        extension: PRODUCTION_FIXTURE_EXTENSION,
      }),
    );
    expect(opened.store.head()).toEqual(head);
    expect(opened.verify()).toEqual([]);
    await opened.close();
  });
});
