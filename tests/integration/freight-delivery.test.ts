import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveEntityLocus } from "@immortalis/engine";
import { quarryWorksFixture, textileWorkshopFixture } from "@immortalis/testkit";
import {
  createFreightCampaign,
  keysOf,
  reopenFreightCampaign,
  throughDeliveryAndAdequacy,
  type Freight,
} from "../support/freight.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "imm-freight-delivery-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe.each([
  ["Quarry Works", quarryWorksFixture],
  ["Textile Workshop", textileWorkshopFixture],
] as const)("Integration I end-to-end — %s (MECHANISM ONLY)", (_label, fixture) => {
  let f: Freight;
  beforeEach(async () => {
    f = await createFreightCampaign(dir, fixture());
  });
  afterEach(async () => {
    await f.campaign.close();
  });

  it("delivers the earned whole output and reaches independent destination adequacy", async () => {
    const requestRef = await throughDeliveryAndAdequacy(f);
    const { fx } = f;
    const k = keysOf(fx);
    const locus = resolveEntityLocus(f.campaign.store, fx.worldId, k.entityId);
    expect(locus?.phase).toBe("DESTINATION_COMMITTED");
    const use = f.economy.useConsumption(f.economy.freightRequest(requestRef)!.value.directive_use_id)!;
    expect(use.value.dispatched.amount).toBe(fx.expected.required);
    expect(use.value.unused_headroom.amount).toBe(fx.expected.unusedHeadroom);
    expect(f.economy.receipt(requestRef)!.value.received).toEqual({
      amount: fx.expected.required,
      unit: fx.expected.unit,
    });
    const ad = f.economy.destinationAdequacy(requestRef)!.value;
    expect(ad.result.available.amount).toBe(fx.expected.required);
    expect(ad.origin_availability).toBe(false);
    expect(f.economy.adequacyStatus(requestRef)).toBe(
      "WHOLE_RECEIVED_QUANTITY_AVAILABLE_FOR_SITE_PROVISIONING",
    );
    f = await reopenFreightCampaign(f);
    expect(f.economy.destinationAdequacy(requestRef)!.value.result.available.amount).toBe(
      fx.expected.required,
    );
  });
});
