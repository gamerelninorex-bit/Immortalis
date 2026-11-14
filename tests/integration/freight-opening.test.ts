import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FREIGHT_CLAUSES,
  gipInstrumentClauseKey,
  gipReadinessSealKey,
  worldOpeningAttestationKey,
} from "@immortalis/contracts";
import { quarryWorksFixture, textileWorkshopFixture } from "@immortalis/testkit";
import {
  createFreightCampaign,
  openThroughSeal,
  reopenFreightCampaign,
  type Freight,
} from "../support/freight.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "imm-freight-opening-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe.each([
  ["Quarry Works", quarryWorksFixture],
  ["Textile Workshop", textileWorkshopFixture],
] as const)("first-profile opening — %s (MECHANISM ONLY)", (_label, fixture) => {
  let f: Freight;
  beforeEach(async () => {
    f = await createFreightCampaign(dir, fixture());
  });
  afterEach(async () => {
    await f.campaign.close();
  });

  it("attests the original GM envelope, assembles the seven clauses of one Instrument and seals readiness at T0", async () => {
    await openThroughSeal(f);
    const { fx, campaign } = f;
    const attestation = campaign.store.getFact(worldOpeningAttestationKey(fx.worldId))!;
    expect(attestation.owner).toBe("world_state");
    const seal = f.gipFreight.readinessSeal(fx.sealId)!;
    expect(seal.seal.clauses.map((c) => c.clause)).toEqual([...FREIGHT_CLAUSES]);
    // seven separately addressable provisions of the ONE Instrument, whose legacy scalar effect is untouched
    for (const c of fx.legal.clauses) {
      const fact = campaign.store.getFact(
        gipInstrumentClauseKey(fx.legal.instrument_id, c.provision_id),
      )!;
      expect((fact.value as { effect_class: string }).effect_class).toBe(c.effect_class);
    }
    expect(f.gip.governanceInstrument(fx.legal.instrument_id)!.value.operative_effect).toBe(
      "administrative_direction",
    );
    // every clause currently applies, as GIP's own derived answer
    const answers = f.gipFreight.applicability(
      fx.sealId,
      FREIGHT_CLAUSES.map((clause) => ({ clause, subject: {} })),
    ).answers;
    expect(answers.map((a) => a.applicability)).toEqual(FREIGHT_CLAUSES.map(() => "applies"));
    expect(campaign.store.getFact(gipReadinessSealKey(fx.sealId))!.version).toBe(1);
    // survives close and a fully re-verified open
    f = await reopenFreightCampaign(f);
    expect(f.gipFreight.readinessSeal(fx.sealId)!.seal.seal_id).toBe(fx.sealId);
  });
});
