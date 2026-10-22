/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw setup documents */
// MECHANICAL OWNER INTEGRATION ONLY — not live PC work, not a collection action, not a genuine AI-host interpretation, and not a client
// result. A Reserve established by the shipped `establish-reserve` command (an authored initial setting) is the destination of the
// EXISTING, mainline `SourceDrawdownAdapter` path. The Reserve is credited ONLY by the owners' own chain — Production's Source Delta,
// World-State's delivery, then Production's inflow — and a changed or omitted upstream cause changes or prevents the credit. Nothing in
// this file supplies a downstream collection verdict: the request, the basis and the source are the existing test-owned premises of that
// engine path, and the amounts that result are derived by the owners, never written by the test.
import { describe, expect, it } from "vitest";
import { productionReserveKey } from "@immortalis/contracts";
import { CanonicalCampaign, ProductionAdapter, SourceDrawdownAdapter } from "@immortalis/engine";
import {
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  PRODUCTION_FIXTURE_EXTENSION,
  PROD_T0,
  SRC_ACCESS,
  SRC_DIMENSION,
  SRC_ESTABLISHED,
  SRC_MATERIAL,
  SRC_REQ_1,
  SRC_RESERVE,
  SRC_SOURCE_KEY,
  SRC_UNIT,
  basisInput,
  drawdownAdvanceRequest,
  drawdownPublication,
  drawdownRequest,
  requestGroup,
  temporalPublication,
} from "@immortalis/testkit";
import { addReserve, writeReserve } from "../support/production-reserve.ts";
import {
  LOCALITY_CAMPAIGN,
  establish,
  freshDirs,
  setupDoc,
  writeSetup,
} from "../support/locality.ts";
import {
  drawCoordinator,
  startAndRegisterExtraction,
  type DrawSeeded,
} from "../support/source-drawdown.ts";
import { must } from "../support/temporal.ts";

/** The operator's own scenario (shipped `establish-locality`): the world, locus and one finite source, authored to the engine fixture's coordinates. */
const scenarioDoc = (): any => {
  const d = setupDoc();
  d.world.world_id = FIXTURE_WORLD_ID;
  d.locus.world_id = FIXTURE_WORLD_ID;
  d.locus.locus_id = FIXTURE_LOCUS_ID;
  d.source = {
    source_key: SRC_SOURCE_KEY,
    world_id: FIXTURE_WORLD_ID,
    locus_id: FIXTURE_LOCUS_ID,
    dimension: SRC_DIMENSION,
    material_class: SRC_MATERIAL,
    quantity: { amount: SRC_ESTABLISHED, unit: SRC_UNIT },
    access_facts: [SRC_ACCESS],
    statement: "An initial setting fact: exactly this much can ever be recovered here.",
  };
  return d;
};

const reserveAt = (amount: number, over: Record<string, unknown> = {}) => ({
  reserve_id: SRC_RESERVE,
  material_class: SRC_MATERIAL,
  quantity: { amount, unit: SRC_UNIT },
  condition: "dry-stacked",
  world_id: FIXTURE_WORLD_ID,
  locus_id: FIXTURE_LOCUS_ID,
  ...over,
});

/** A campaign written ONLY by the shipped commands: locality, then the Reserve. */
async function operatorCampaign(startAmount: number) {
  const dirs = freshDirs();
  expect((await establish(dirs, writeSetup(scenarioDoc()))).result.status).toBe("LOCALITY_READY");
  const { result } = await addReserve(dirs, writeReserve(reserveAt(startAmount)));
  expect(result.status).toBe("RESERVE_READY");
  return dirs;
}

/** Opens it for the engine-only drawdown with the synthetic requester's registration, and adds the engine path's own premises. */
async function drawdownOver(dirs: { campaignDir: string }, requested: number): Promise<DrawSeeded> {
  const campaign = await must(
    CanonicalCampaign.open(dirs.campaignDir, {
      buildId: "reserve-drawdown",
      extension: PRODUCTION_FIXTURE_EXTENSION,
    }),
  );
  const store = campaign.store;
  await must(
    store.commit(
      requestGroup(LOCALITY_CAMPAIGN, 1, SRC_REQ_1, drawdownRequest(SRC_REQ_1, requested)),
    ),
  );
  const drawdown = new SourceDrawdownAdapter(store);
  await must(
    drawdown.establishBasis({ ...drawdownPublication(1), extraction_basis: basisInput() }),
  );
  const coordinator = drawCoordinator(store);
  await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: PROD_T0 }));
  return { campaign, coordinator, drawdown, production: new ProductionAdapter(store) };
}

const reserveOf = (s: DrawSeeded) => s.drawdown.reserve(SRC_RESERVE)!;
const sourceOf = (s: DrawSeeded) => s.drawdown.sourceCondition(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!;

describe("the operator-established Reserve is credited only by the owners' source-delta → delivery → inflow chain", () => {
  it("a positive authored starting quantity is the established quantity, not an inflow; a three-unit extraction adds exactly its delivered quantity", async () => {
    const dirs = await operatorCampaign(4);
    const s = await drawdownOver(dirs, 3);
    try {
      const before = reserveOf(s);
      expect(before.fact.version).toBe(1);
      expect(before.fact.provenance.group_id).toMatch(/^operator-production-reserve:/);
      expect(before.value.established).toEqual({ amount: 4, unit: SRC_UNIT });
      expect(before.value.quantity).toEqual({ amount: 4, unit: SRC_UNIT });
      expect("inflows" in before.value).toBe(false);
      expect(sourceOf(s).value.recoverable.amount).toBe(5);
      expect(sourceOf(s).value.delivered).toEqual([]);

      await startAndRegisterExtraction(s, SRC_REQ_1, 1);
      // committing the commitment alone moves nothing
      expect(reserveOf(s).value.quantity.amount).toBe(4);
      expect(reserveOf(s).fact.version).toBe(1);

      await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
      const after = reserveOf(s);
      expect(after.fact.version).toBe(2);
      expect(after.value.established).toEqual({ amount: 4, unit: SRC_UNIT });
      expect(after.value.inflows).toEqual([
        { inflow_id: SRC_REQ_1, quantity: { amount: 3, unit: SRC_UNIT } },
      ]);
      expect(after.value.quantity).toEqual({ amount: 7, unit: SRC_UNIT });
      expect(after.value.consumed).toEqual([]);
      // the source is World-State's net, derived: 5 − 3; what left it is exactly what the Reserve gained
      expect(sourceOf(s).value.recoverable.amount).toBe(2);
      expect(SRC_ESTABLISHED - sourceOf(s).value.recoverable.amount).toBe(
        after.value.quantity.amount - before.value.quantity.amount,
      );
      expect(s.drawdown.phase(SRC_REQ_1)).toBe("CREDITED");
      expect(s.campaign.verify()).toEqual([]);
    } finally {
      await s.campaign.close();
    }
  });

  it("an authored empty Reserve receives exactly the delivered quantity", async () => {
    const dirs = await operatorCampaign(0);
    const s = await drawdownOver(dirs, 3);
    try {
      await startAndRegisterExtraction(s, SRC_REQ_1, 1);
      await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
      expect(reserveOf(s).value.quantity).toEqual({ amount: 3, unit: SRC_UNIT });
      expect(reserveOf(s).value.established).toEqual({ amount: 0, unit: SRC_UNIT });
    } finally {
      await s.campaign.close();
    }
  });

  it("with the upstream cause omitted the Reserve is not credited: no extraction, no credit, however far time advances", async () => {
    const dirs = await operatorCampaign(4);
    const s = await drawdownOver(dirs, 3);
    try {
      const r = await must(s.coordinator.advance(drawdownAdvanceRequest("tx-idle")));
      expect(r.transaction.stages).toEqual([]);
      expect(reserveOf(s).fact.version).toBe(1);
      expect(reserveOf(s).value.quantity.amount).toBe(4);
      expect(sourceOf(s).fact.version).toBe(1);
      expect(sourceOf(s).value.recoverable.amount).toBe(5);
    } finally {
      await s.campaign.close();
    }
  });

  it("with the upstream cause started but not yet resolved, an advance short of its boundary credits nothing", async () => {
    const dirs = await operatorCampaign(4);
    const s = await drawdownOver(dirs, 3);
    try {
      await startAndRegisterExtraction(s, SRC_REQ_1, 1);
      const r = await must(
        s.coordinator.advance(
          drawdownAdvanceRequest("tx-short", { unit: PROD_T0.unit, value: 120 }),
        ),
      );
      expect(r.transaction.stages).toEqual([]);
      expect(reserveOf(s).value.quantity.amount).toBe(4);
      expect(reserveOf(s).fact.version).toBe(1);
      expect(s.drawdown.phase(SRC_REQ_1)).toBe("COMMITTED");
    } finally {
      await s.campaign.close();
    }
  });

  it("a changed upstream cause changes the credit: the credit is derived from the delivered quantity, not carried by the Reserve", async () => {
    const credits: number[] = [];
    for (const requested of [1, 2, 4]) {
      const dirs = await operatorCampaign(4);
      const s = await drawdownOver(dirs, requested);
      try {
        await startAndRegisterExtraction(s, SRC_REQ_1, 1);
        await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
        credits.push(reserveOf(s).value.quantity.amount - 4);
        expect(reserveOf(s).value.inflows).toEqual([
          { inflow_id: SRC_REQ_1, quantity: { amount: requested, unit: SRC_UNIT } },
        ]);
      } finally {
        await s.campaign.close();
      }
    }
    expect(credits).toEqual([1, 2, 4]);
  });

  it("the Reserve the operator established is untouched on disk until an owner chain credits it: an ordinary reopen reads it at version 1", async () => {
    const dirs = await operatorCampaign(4);
    const c = await must(CanonicalCampaign.open(dirs.campaignDir, { buildId: "ordinary" }));
    try {
      const fact = c.store.getFact(productionReserveKey(SRC_RESERVE))!;
      expect(fact.version).toBe(1);
      expect((fact.value as any).quantity.amount).toBe(4);
    } finally {
      await c.close();
    }
  });
});
