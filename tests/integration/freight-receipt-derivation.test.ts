/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and inspect arbitrary owner values */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  economyAcceptedOutputHoldingKey,
  economyDestinationAdequacyKey,
  economyFreightAllocationKey,
  economyFreightRequestKey,
  economyFreightResultKey,
  economyFreightUseConsumptionKey,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsTransferKey,
  worldEntityTransitionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  quarryWorksFixture,
  textileWorkshopFixture,
  type FreightWorldFixture,
} from "@immortalis/testkit";
import {
  deriveDestinationAdequacy,
  deriveFreightReceipt,
  storeSource,
  type ReceiptPrior,
} from "@immortalis/engine";
import {
  createFreightCampaign,
  keysOf,
  throughDeliveryAndAdequacy,
  type Freight,
} from "../support/freight.ts";

let dir: string;
let open: Freight[] = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "imm-freight-receipt-"));
  open = [];
});
afterEach(async () => {
  for (const f of open) await f.campaign.close().catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
});
let seq = 0;

const clone = <T>(x: T): T => structuredClone(x);
const withValue = (fact: OwnerFact, change: (v: any) => void): OwnerFact => {
  const copy = clone(fact);
  change(copy.value);
  return copy;
};

/**
 * The prior of the ER stage: every owner fact exactly as the stage read them at the earned boundary, i.e. the delivered world with
 * the allocation and holding restored to their pre-ER state (the receipt is what moves them).
 */
async function priorOf(fx: FreightWorldFixture): Promise<{ f: Freight; prior: ReceiptPrior }> {
  const f = await createFreightCampaign(join(dir, `w${seq++}`), fx);
  open.push(f);
  const ref = await throughDeliveryAndAdequacy(f);
  const k = keysOf(fx);
  const get = (key: string): OwnerFact => {
    const fact = f.campaign.store.getFact(key);
    if (!fact) throw new Error(`absent ${key}`);
    return fact;
  };
  const request = get(economyFreightRequestKey(ref));
  const consumptionKey = economyFreightUseConsumptionKey((request.value as any).directive_use_id);
  const allocation = withValue(get(economyFreightAllocationKey(ref)), (v) => {
    v.state = {
      status: "dispatch-consumed",
      consumption: { fact_key: consumptionKey, version: 1 },
    };
  });
  const holding = withValue(get(economyAcceptedOutputHoldingKey(fx.worldId, k.entityId)), (v) => {
    // before ER: encumbered by this request's allocation, with no receipt yet (the receipt is what releases it)
    v.status = "encumbered";
    v.restriction_or_authority_ref = economyFreightAllocationKey(ref);
    v.provenance_ref.receipt = null;
  });
  return {
    f,
    prior: {
      request,
      allocation,
      holding,
      consumption: get(consumptionKey),
      commitment: get(logisticsCommitmentKey(fx.worldId, k.entityId)),
      transfer: get(logisticsTransferKey(fx.worldId, k.entityId)),
      delivery: get(logisticsDeliveryKey(fx.worldId, k.entityId)),
      transition: get(worldEntityTransitionKey(fx.worldId, k.entityId)),
      at: fx.service.delivery_boundary_at,
    },
  };
}

/** the refusal's REASON: a negative only counts if the lawful baseline passes and the refusal names the very thing mutated */
const refused = (prior: ReceiptPrior): string => {
  const r = deriveFreightReceipt(prior);
  expect(r.ok, "the mutated prior must be refused").toBe(false);
  return r.ok ? "" : r.error.message;
};

describe("PO-7 — ER is derived, original and exact: no look-alike cargo, other world, wrong beneficiary or stale state satisfies it", () => {
  for (const [name, fx] of [
    ["Quarry Works", quarryWorksFixture],
    ["Textile Workshop", textileWorkshopFixture],
  ] as const) {
    it(`${name}: the lawful prior derives exactly the receipt the stage committed`, async () => {
      const { f, prior } = await priorOf(fx());
      const r = deriveFreightReceipt(prior);
      expect(r.ok ? "" : r.error.message).toBe("");
      if (!r.ok) return;
      const stored = f.campaign.store.getFact(
        economyFreightResultKey((prior.request.value as any).request_ref),
      )!;
      expect(r.value.receipt).toEqual(stored.value);
      // delivery alone, or retirement alone, credits nothing; the receipt moves the allocation to `received` and releases the holding
      expect(r.value.allocation.state.status).toBe("received");
      expect(r.value.holding.status).toBe("available");
    });
  }

  it("a wrong beneficiary, an identical-looking other cargo or another entity cannot satisfy the receipt", async () => {
    const { prior } = await priorOf(quarryWorksFixture());
    expect(
      refused({
        ...prior,
        holding: withValue(prior.holding, (v) => (v.holder_ref = "rival-works")),
      }),
    ).toMatch(/same beneficiary/);
    expect(
      refused({
        ...prior,
        holding: withValue(prior.holding, (v) => (v.object_ref.entity_id = "look-alike-cargo")),
      }),
    ).toMatch(/encumbered accepted output/);
    expect(
      refused({
        ...prior,
        delivery: withValue(prior.delivery, (v) => (v.subject.entity_id = "look-alike-cargo")),
      }),
    ).toMatch(/delivery cause is not this entity's own/);
  });

  it("another world's transition, another delivery cause, or a wrong origin / destination locus is refused", async () => {
    const { prior } = await priorOf(textileWorkshopFixture());
    expect(
      refused({
        ...prior,
        transition: { ...prior.transition, key: "world/other-world/entity-transition/x" },
      }),
    ).toMatch(/not retired this request's transfer against this destination commit/);
    expect(
      refused({
        ...prior,
        transfer: withValue(prior.transfer, (v) => (v.state.destination_commit.version = 2)),
      }),
    ).toMatch(/not retired this request's transfer against this destination commit/);
    for (const mutate of [
      (v: any) => (v.cause.cause_id = "another-delivery"),
      (v: any) => (v.locus.to.locus.entity_id = "elsewhere"),
      (v: any) => (v.locus.from.locus.entity_id = "elsewhere"),
    ])
      expect(refused({ ...prior, transition: withValue(prior.transition, mutate) })).toMatch(
        /has not committed THIS entity's destination for THIS delivery/,
      );
  });

  it("delivery alone credits nothing: a still-committed commitment is refused", async () => {
    const { prior } = await priorOf(quarryWorksFixture());
    expect(
      refused({
        ...prior,
        commitment: withValue(prior.commitment, (v) => (v.state = { status: "COMMITTED" })),
      }),
    ).toMatch(/has not released this request's commitment after the destination commit/);
  });

  it("a stale or wrong boundary instant, a request not at its sealed version, or an allocation in the wrong state is refused", async () => {
    const { prior } = await priorOf(quarryWorksFixture());
    expect(refused({ ...prior, at: { ...prior.at, value: prior.at.value + 1 } as any })).toMatch(
      /own declared boundary instant/,
    );
    expect(refused({ ...prior, request: { ...prior.request, version: 2 } })).toMatch(
      /original sealed request/,
    );
    const consumption = (prior.allocation.value as any).state.consumption;
    const receipt = {
      fact_key: economyFreightResultKey((prior.request.value as any).request_ref),
      version: 1,
    };
    for (const state of [
      { status: "pending" },
      { status: "received", consumption, receipt },
    ] as const)
      expect(
        refused({
          ...prior,
          allocation: withValue(prior.allocation, (v) => (v.state = state)),
        }),
      ).toMatch(/follows the one-use consumption of this very request/);
    // a holding that is already available (already credited) cannot be credited a second time
    expect(
      refused({ ...prior, holding: withValue(prior.holding, (v) => (v.status = "available")) }),
    ).toMatch(/encumbered accepted output/);
  });

  it("AD from CURRENT facts withholds on a unit or amount mismatch or a changed Production specification", async () => {
    const fx = textileWorkshopFixture();
    const f = await createFreightCampaign(join(dir, `w${seq++}`), fx);
    open.push(f);
    const ref = await throughDeliveryAndAdequacy(f);
    const real = storeSource(f.campaign.store);
    const adKey = economyDestinationAdequacyKey(ref);
    const specKey = (f.campaign.store.getFact(economyFreightRequestKey(ref))!.value as any)
      .requirement.specification.fact_key as string;
    // the cut just BEFORE the adequacy conclusion was recorded (the lawful one is hidden), optionally with the specification changed
    const cut = (mutate?: (v: any) => void) => ({
      ...real,
      getFact: (key: string) => {
        if (key === adKey) return undefined;
        const fact = real.getFact(key);
        return fact && mutate && key === specKey ? withValue(fact, mutate) : fact;
      },
    });
    const baseline = deriveDestinationAdequacy(cut(), ref);
    expect(baseline.ok, "the lawful cut derives the adequacy conclusion").toBe(true);
    for (const mutate of [
      (v: any) => (v.quantity.unit = "different-unit"),
      (v: any) => (v.quantity.amount = v.quantity.amount + 1),
      (v: any) => (v.material_class = "other-material"),
    ]) {
      const planned = deriveDestinationAdequacy(cut(mutate), ref);
      expect(planned.ok, "a changed specification does not yield the adequacy conclusion").toBe(
        false,
      );
    }
  });
});
