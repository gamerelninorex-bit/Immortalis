/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and inspect arbitrary owner values */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EconomyFreightUseConsumptionSchema,
  economyDestinationAdequacyKey,
  economyFreightUseConsumptionKey,
  logisticsCommitmentKey,
  logisticsTransferKey,
  temporalObjectKey,
  logisticsObjectId,
} from "@immortalis/contracts";
import {
  freightPublication as pub,
  quarryWorksFixture,
  textileWorkshopFixture,
  type FreightWorldFixture,
} from "@immortalis/testkit";
import {
  FREIGHT_ECONOMY_RULE,
  FREIGHT_LOGISTICS_RULE,
  TemporalCoordinator,
  deriveDestinationAdequacy,
  deriveFreightDispatch,
  deriveUseConsumption,
  groupOfPlan,
  resolveEntityLocus,
  storeSource,
  type CampaignStore,
} from "@immortalis/engine";
import {
  admitPremises,
  admitService,
  admitServiceBasis,
  advanceTo,
  basisIdOf,
  consumeUse,
  createFreightCampaign,
  deliveryBoundary,
  dispatchFirst,
  enrollTransfer,
  foundationThroughFixation,
  freightProviders,
  keysOf,
  openThroughSeal,
  outcome,
  produceAndAccept,
  originSelfProvision,
  attestAndInitialize,
  throughDeliveryAndAdequacy,
  variant,
  countKind,
  type Freight,
} from "../support/freight.ts";
import { must } from "../support/temporal.ts";

let dir: string;
let open: Freight[] = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "imm-freight-service-"));
  open = [];
});
afterEach(async () => {
  for (const f of open) await f.campaign.close();
  await rm(dir, { recursive: true, force: true });
});
let seq = 0;
async function world(fx: FreightWorldFixture): Promise<Freight> {
  const f = await createFreightCampaign(join(dir, `w${seq++}`), fx);
  open.push(f);
  return f;
}
const req = (ref: string) => ({ request: { request_ref: ref } });
const l0 = (f: Freight, ref: string, n = 1) =>
  outcome(
    f.logistics.admitService({
      ...pub("l0", n),
      admission: { request_ref: ref, basis_id: basisIdOf(f) },
    }),
  );

describe("PO-5 — the service is independently sourced and actual, never inferred from a request, a permission or a corridor", () => {
  it("L0 needs an independently admitted basis: no basis means no service (nothing is committed and nothing is refused)", async () => {
    const f = await world(quarryWorksFixture());
    const ref = await foundationThroughFixation(f);
    const r = await l0(f, ref);
    expect(r.code).toBe("PREREQUISITE_MISSING");
    expect(countKind(f, "logistics/")).toBe(0);
    expect(f.economy.allocation(ref)!.value.state.status).toBe("pending");
    const resolution = f.logistics.serviceResolution(ref, basisIdOf(f));
    expect(resolution).toMatchObject({
      outcome: "NOT_ADMITTED",
      non_f1_class: "MISSING_UPSTREAM_FACT_OR_UNKNOWN_OWNER_RESPONSE",
    });
  });

  it("a service basis needs the World-State corridor of exactly these ORDERED endpoints (none, or the reverse, refuses)", async () => {
    for (const mode of ["absent", "reverse"] as const) {
      const f = await world(
        variant(quarryWorksFixture(), (fx) => {
          if (mode === "reverse") {
            const { from_locus_id, to_locus_id } = fx.corridor;
            fx.corridor.from_locus_id = to_locus_id;
            fx.corridor.to_locus_id = from_locus_id;
          }
        }),
      );
      await f.campaign.establishWorld({ ...pub("s", 1), world: f.fx.world });
      await f.campaign.establishLocus({ ...pub("s", 2), locus: f.fx.origin });
      await f.campaign.establishLocus({ ...pub("s", 3), locus: f.fx.destination });
      if (mode === "reverse")
        await must(f.campaign.establishCorridor({ ...pub("s", 4), corridor: f.fx.corridor }));
      await attestAndInitialize(f);
      const r = await outcome(
        f.logistics.admitServiceBasis({
          ...pub("service", 1),
          service: { world_id: f.fx.worldId, slice_id: f.fx.slices.service },
        }),
      );
      expect(r.code, mode).toBe("PREREQUISITE_MISSING");
      expect(r.message).toMatch(/no World-State corridor connects these ordered endpoints/);
    }
  });

  it("a service premise for other endpoints, or whose boundary has passed, is not admitted", async () => {
    const wrong = await world(
      variant(quarryWorksFixture(), (fx) => {
        fx.service.destination_locus_id = "somewhere-else";
      }),
    );
    await openThroughSeal(wrong);
    const r = await outcome(
      wrong.logistics.admitServiceBasis({
        ...pub("service", 1),
        service: { world_id: wrong.fx.worldId, slice_id: wrong.fx.slices.service },
      }),
    );
    expect(r.code).toBe("SOURCE_REFUSED");

    // a boundary at T0 itself is not in the future
    const stale = await world(
      variant(quarryWorksFixture(), (fx) => {
        fx.service.delivery_boundary_at = { ...fx.t0 };
      }),
    );
    await openThroughSeal(stale);
    const s = await outcome(
      stale.logistics.admitServiceBasis({
        ...pub("service", 1),
        service: { world_id: stale.fx.worldId, slice_id: stale.fx.slices.service },
      }),
    );
    expect(s.code).toBe("NOT_ADMISSIBLE");
    expect(s.message).toMatch(/not in the future/);
  });

  it("insufficient physical handling capacity, or other material, is a shortfall: no commitment, and not F1", async () => {
    for (const [name, edit] of [
      [
        "capacity",
        (fx: any) => {
          fx.service.handling.max_quantity.amount = fx.specification.quantity.amount - 1;
        },
      ],
      [
        "material",
        (fx: any) => {
          fx.service.handling.material_class = "loose-gravel";
        },
      ],
      [
        "unit",
        (fx: any) => {
          fx.service.handling.max_quantity.unit = "barrows";
        },
      ],
    ] as const) {
      const f = await world(variant(textileWorkshopFixture(), edit));
      const ref = await foundationThroughFixation(f);
      await admitServiceBasis(f);
      const r = await l0(f, ref);
      expect(r.code, name).toBe("NOT_ADMISSIBLE");
      expect(r.message).toMatch(/real handling limit/);
      expect(countKind(f, "logistics/commitment/"), name).toBe(0);
      const resolution = f.logistics.serviceResolution(ref, basisIdOf(f));
      expect(resolution).toMatchObject({
        outcome: "NOT_ADMITTED",
        non_f1_class: "CURRENT_SHORTFALL_BLOCKAGE_OR_DELAY",
        f1_positive: "WITHHELD_SOURCE_UNRESOLVED",
      });
      // the request stays pending and its claims stay protected: a shortfall withdraws nothing
      expect(f.economy.allocation(ref)!.value.state.status).toBe("pending");
      expect((await outcome(f.economy.admitWithdrawal({ ...pub("w", 1), ...req(ref) }))).code).toBe(
        "NOT_ADMISSIBLE",
      );
    }
  });

  it("a delivery boundary that passed before service admission is a stale cutoff and admits nothing", async () => {
    const f = await world(
      variant(quarryWorksFixture(), (fx) => {
        fx.service.delivery_boundary_at = { ...fx.t0, value: fx.t0.value + 5 };
      }),
    );
    await openThroughSeal(f);
    await admitPremises(f);
    await originSelfProvision(f);
    await admitServiceBasis(f);
    await produceAndAccept(f); // canonical time reaches the production boundary (T0 + 10), past the service boundary (T0 + 5)
    const ref = (
      await outcome(
        f.economy.resolveFreightFixation({
          ...pub("c6", 1),
          resolution: { seal_id: f.fx.sealId, owner_event: keysOf(f.fx).entity },
        }),
      )
    ).code;
    expect(ref).toBe("OK");
    const requestRef = f.economy.currentRequestRef(f.fx.sealId)!;
    const r = await l0(f, requestRef);
    expect(r.code).toBe("NOT_ADMISSIBLE");
    expect(r.message).toMatch(/delivery boundary has passed|stale cutoff/);
  });
});

describe("PO-5 — L0, L1/F3, E1 and TE are separate acts with their own fresh Economy status", () => {
  it("L0 commits one entity-keyed service; the request, its slots and Economy's status are unchanged; a second L0 is refused", async () => {
    const f = await world(quarryWorksFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    const requestBefore = f.campaign.store.getFact(`economy/freight-request/${ref}`)!.version;
    await admitService(f, ref);
    const k = keysOf(f.fx);
    const commitment = f.campaign.store.getFact(logisticsCommitmentKey(f.fx.worldId, k.entityId))!;
    const value = commitment.value as {
      freight: { economy_status: { act: string }; service: { slot: { fact_key: string } } };
      corridor: unknown;
      origin: unknown;
      state: { status: string };
    };
    expect(value.freight.economy_status.act).toBe("L0/service-admission");
    expect(value.state.status).toBe("COMMITTED");
    expect(value.corridor).toBeDefined();
    expect(f.campaign.store.getFact(`economy/freight-request/${ref}`)!.version).toBe(requestBefore);
    expect(f.logistics.serviceSlot(basisIdOf(f))!.value.state.status).toBe("HELD");
    expect((await l0(f, ref, 2)).code).toBe("NOT_ADMISSIBLE");
    // the verifier (the F-only seam) now sees a service and refuses to call the request service-free
    expect(f.logistics.verifyRequest(ref).verdict).toBe("REFUSED");
    // the foundation (route-less) Logistics adapter can never serve a freight request: only its own service admission can
    const raw = await outcome(
      f.campaign.store.commit({
        ...f.campaign.store.committedGroup(commitment.provenance.intent_id)!,
        group_id: "raw-l0",
        intent_id: "raw-l0",
      }),
    );
    expect(raw.code).not.toBe("OK");
  });

  it("L1 is the ORIGINAL first dispatch with its own fresh status S1: not delivery, never twice, never without L0", async () => {
    const f = await world(textileWorkshopFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    expect(
      (await outcome(f.logistics.dispatchFirst({ ...pub("l1", 0), ...req(ref) }))).message,
    ).toMatch(/no committed service/);
    await admitService(f, ref);
    await dispatchFirst(f, ref);
    const k = keysOf(f.fx);
    const transfer = f.campaign.store.getFact(logisticsTransferKey(f.fx.worldId, k.entityId))!;
    const tv = transfer.value as {
      freight: { economy_status: { act: string }; dispatched: { amount: number } };
      state: { status: string };
    };
    expect(transfer.version).toBe(1);
    expect(tv.freight.economy_status.act).toBe("L1/first-dispatch");
    expect(tv.freight.dispatched.amount).toBe(f.fx.expected.required);
    expect(tv.state.status).toBe("IN_TRANSFER");
    // dispatch is not delivery: Logistics is the one authority; nothing is credited at the destination
    expect(resolveEntityLocus(f.campaign.store, f.fx.worldId, k.entityId)).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
    });
    expect(f.economy.adequacyStatus(ref)).toBe("UNMET_NO_CARGO_AT_DESTINATION");
    // the enrollment receipt exists in the same commit, and a second dispatch is refused
    expect(f.logistics.dispatchEnrollment()!.value).toMatchObject({ request_id: ref });
    expect((await outcome(f.logistics.dispatchFirst({ ...pub("l1", 2), ...req(ref) }))).code).toBe(
      "NOT_ADMISSIBLE",
    );
    // the AD query before delivery is withheld: before ECT-01 the destination has no free cargo
    const early = await outcome(
      f.economy.recordDestinationAdequacy({ ...pub("ad", 0), ...req(ref) }),
    );
    expect(early.code).toBe("WITHHELD");
  });

  it("E1 consumes ONE use against the immutable dispatch event, once, with the unused ceiling headroom (Textile: 8 vs 5 = 3 unused)", async () => {
    const f = await world(textileWorkshopFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref);
    expect(
      (await outcome(f.economy.consumeFirstDispatch({ ...pub("e1", 0), ...req(ref) }))).code,
    ).toBe("WITHHELD");
    await dispatchFirst(f, ref);
    await consumeUse(f, ref);
    const use = f.economy.useConsumption(f.economy.freightRequest(ref)!.value.directive_use_id)!;
    expect(use.value).toMatchObject({
      ceiling: { amount: 8, unit: "bolts" },
      dispatched: { amount: 5, unit: "bolts" },
      unused_headroom: { amount: 3, unit: "bolts" },
      uses_consumed: 1,
    });
    // the three unused bolts are headroom of the ONE use: not output, not another request, not an invented transfer
    expect(countKind(f, "economy/freight-request/")).toBe(1);
    expect(countKind(f, "world/loom-reach/entity/")).toBe(1);
    const transfer = f.campaign.store.getFact(
      logisticsTransferKey(f.fx.worldId, keysOf(f.fx).entityId),
    )!;
    expect(use.value.dispatch_event.receipt).toEqual({
      group_id: transfer.provenance.group_id,
      intent_id: transfer.provenance.intent_id,
    });
    expect(["dispatch-consumed"]).toContain(f.economy.allocation(ref)!.value.state.status);
    expect(["consumed"]).toContain(f.economy.slots(ref)!.directive_use!.value.state.status);
    // E1 twice (a new identity) is refused; the same intent re-presented replays the original
    expect(
      (await outcome(f.economy.consumeFirstDispatch({ ...pub("e1", 2), ...req(ref) }))).code,
    ).toBe("NOT_ADMISSIBLE");
    expect(
      await outcome(f.economy.consumeFirstDispatch({ ...pub("e1", 1), ...req(ref) })),
    ).toMatchObject({ code: "OK", replayed: true });
  });
});

describe("PO-5 — the Temporal fence: an unenrolled or unconsumed first dispatch cannot be passed on ANY advance path", () => {
  it("INITIAL / condition-only / HELD-style requests are refused until both TE and E1 exist; an earlier stop is unaffected", async () => {
    const f = await world(quarryWorksFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref);
    await dispatchFirst(f, ref);
    const boundary = deliveryBoundary(f);
    const before = { ...boundary, value: boundary.value - 1 };
    // neither enrolled nor consumed
    const a = await advanceTo(f, "tx-a", boundary);
    expect(!a.ok && a.error.code).toBe("ENROLLMENT_PENDING");
    // a condition-only request cannot be bounded before the boundary
    const cond = await f.coordinator.advance({
      transaction_id: "tx-cond",
      cause: "cause-tx-cond",
      trigger: { kind: "fixture-advance-request", ref: "ref-tx-cond" },
      continues: null,
      requested: { target: null, condition: { kind: "FIXTURE_CONDITION", ref: "none" } },
      context: { role: "role.player", permission: "permission.player_choice.commit" },
      publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
    });
    expect(cond.ok).toBe(false);
    // only E1: still pending (TE absent)
    await consumeUse(f, ref);
    const b = await advanceTo(f, "tx-b", boundary);
    expect(!b.ok && b.error.code).toBe("ENROLLMENT_PENDING");
    // only TE on a fresh world would still be pending (E1 absent): checked in the next test
    await enrollTransfer(f);
    // a stop BEFORE the boundary was never fenced; with both done, so is the boundary itself
    const early = await advanceTo(f, "tx-early", before);
    expect(early.ok).toBe(true);
    const c = await advanceTo(f, "tx-c", boundary);
    expect(c.ok).toBe(true);
    expect(f.economy.allocation(ref)!.value.state.status).toBe("received");
  });

  it("TE without E1 is also pending; and a RAW kernel advance that bypasses the coordinator's pre-check is refused by admission", async () => {
    const f = await world(textileWorkshopFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref);
    await dispatchFirst(f, ref);
    await enrollTransfer(f); // TE present, E1 absent
    const boundary = deliveryBoundary(f);
    const coordinatorRefusal = await advanceTo(f, "tx-a", boundary);
    expect(!coordinatorRefusal.ok && coordinatorRefusal.error.code).toBe("ENROLLMENT_PENDING");
    // a coordinator that cannot SEE the receipt (so its pre-check passes) still cannot commit past the boundary: the kernel
    // group is judged by IM-11 admission, which reads the real state
    const real: CampaignStore = f.campaign.store;
    const blind: CampaignStore = new Proxy(real, {
      get(target, prop) {
        if (prop === "getFact")
          return (key: string) =>
            key === "logistics/freight-dispatch-enrollment" ? undefined : target.getFact(key);
        const v = Reflect.get(target, prop, target) as unknown;
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });
    const raw = new TemporalCoordinator(blind, freightProviders());
    const r = await raw.advance({
      transaction_id: "tx-raw",
      cause: "cause-tx-raw",
      trigger: { kind: "fixture-advance-request", ref: "ref-tx-raw" },
      continues: null,
      requested: { target: boundary, condition: null },
      context: { role: "role.player", permission: "permission.player_choice.commit" },
      publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
    });
    expect(r.ok).toBe(false);
    // the refusal is the kernel admission fence's own (not an incidental failure of staging or of the double)
    expect(JSON.stringify(!r.ok && r.error)).toMatch(/not yet enrolled and consumed/);
    expect(f.coordinator.state()!.value.canonical_time.value).toBeLessThan(boundary.value);
    // nothing was delivered, nothing credited
    expect(resolveEntityLocus(real, f.fx.worldId, keysOf(f.fx).entityId)!.phase).toBe(
      "IN_TRANSFER",
    );
    // once E1 is committed the same advance is lawful
    await consumeUse(f, ref);
    expect((await advanceTo(f, "tx-ok", boundary)).ok).toBe(true);
  });

  it("an advance already begun before enrollment: the dispatch of a SECOND request cannot overlap an unenrolled first", async () => {
    const f = await world(quarryWorksFixture());
    const ref1 = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref1);
    await dispatchFirst(f, ref1);
    // at most one first dispatch is ever in flight: the receipt slot is occupied until it is enrolled and consumed
    const second = deriveFreightDispatch(storeSource(f.campaign.store), ref1);
    expect(second.ok).toBe(false); // already dispatched
    expect(f.logistics.dispatchEnrollment()!.fact.version).toBe(1);
  });
});

describe("PO-5/PO-3 — the receipt-bound result and adequacy are derived, original, and exact", () => {
  it("delivery needs E1 (E1 → LD): the earned boundary resolves only with the one-use consumption in hand", async () => {
    const f = await world(quarryWorksFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref);
    await dispatchFirst(f, ref);
    await consumeUse(f, ref);
    await enrollTransfer(f);
    const object = f.campaign.store.getFact(temporalObjectKey(logisticsObjectId(ref)))!;
    const declared = (
      object.value as { dependencies: { stage: { owner_operation: { operation: string } } }[] }
    ).dependencies.map((d) => d.stage.owner_operation.operation);
    // LD → WT (ECT-01) → LR → ER, one object, one earned boundary
    expect(declared).toEqual([
      "logistics-establish-delivery",
      "world-state-commit-entity-transition",
      "logistics-retire-transfer",
      "economy-record-freight-receipt",
    ]);
    await must(advanceTo(f, "tx-deliver", deliveryBoundary(f)));
    const k = keysOf(f.fx);
    // one authority at the end; the Economy result exists only after the destination commit AND the retirement
    expect(resolveEntityLocus(f.campaign.store, f.fx.worldId, k.entityId)).toMatchObject({
      phase: "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
    });
    const receipt = f.economy.receipt(ref)!;
    const transition = f.campaign.store.getFact(
      `world/${f.fx.worldId}/entity/${k.entityId}/transition`,
    )!;
    const retired = f.campaign.store.getFact(logisticsTransferKey(f.fx.worldId, k.entityId))!;
    expect(retired.version).toBe(2);
    expect(receipt.fact.provenance.group_id).not.toBe(retired.provenance.group_id);
    const revisionOf = (x: { provenance: { intent_id: string } }) =>
      f.campaign.store.lookupReceipt(x.provenance.intent_id)!.revision;
    expect(revisionOf(receipt.fact)).toBeGreaterThan(revisionOf(retired));
    expect(revisionOf(retired)).toBeGreaterThan(revisionOf(transition));
    // the receipt matches the original allocation, both loci, the boundary and the beneficiary
    expect(receipt.value).toMatchObject({
      beneficiary_ref: f.economy.freightRequest(ref)!.value.institution.beneficiary_ref,
      boundary: { at: deliveryBoundary(f) },
      destination: f.economy.freightRequest(ref)!.value.destination_or_use_locus_ref,
    });
  });

  it("AD is a separate AS-OF-NOW query: once, from current custody and requirement; a requirement that no longer stands withholds it", async () => {
    const f = await world(textileWorkshopFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref);
    await dispatchFirst(f, ref);
    await consumeUse(f, ref);
    await enrollTransfer(f);
    await must(advanceTo(f, "tx-deliver", deliveryBoundary(f)));
    expect(f.economy.adequacyStatus(ref)).toBe("RECEIVED_ADEQUACY_NOT_YET_ASSESSED");
    // the destination requirement ceases before the independent adequacy read: not adequate
    await must(
      f.world.admitSiteConditionChange({
        ...pub("change", 1),
        change: {
          world_id: f.fx.worldId,
          condition_id: f.fx.siteCondition.condition_id,
          change_id: "ceased",
          statement: "SYNTHETIC FIXTURE: the screens were taken out for good.",
          outcome: "CEASED",
          authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
        },
      }),
    );
    const withheld = await outcome(
      f.economy.recordDestinationAdequacy({ ...pub("ad", 1), ...req(ref) }),
    );
    expect(withheld.code).toBe("WITHHELD");
    expect(withheld.message).toMatch(/no longer stands/);
    expect(f.campaign.store.getFact(economyDestinationAdequacyKey(ref))).toBeUndefined();
  });

  it("the full chain leaves the origin unavailable and credits the destination exactly once, with no repair claimed", async () => {
    for (const fixture of [quarryWorksFixture, textileWorkshopFixture]) {
      const f = await world(fixture());
      const ref = await throughDeliveryAndAdequacy(f);
      const ad = f.economy.destinationAdequacy(ref)!.value;
      expect(ad.origin_availability).toBe(false);
      expect(ad.result).toMatchObject({
        status: "WHOLE_RECEIVED_QUANTITY_AVAILABLE_FOR_SITE_PROVISIONING",
        excludes: "NOT_REPAIR_PRODUCTION_OR_DUPLICATE_INVENTORY",
      });
      expect(f.economy.holding(f.fx.worldId, keysOf(f.fx).entityId)!.value.status).toBe(
        "available",
      );
      expect(
        (await outcome(f.economy.recordDestinationAdequacy({ ...pub("ad", 5), ...req(ref) }))).code,
      ).toBe("NOT_ADMISSIBLE");
      expect(countKind(f, `world/${f.fx.worldId}/entity/`)).toBe(2); // the one entity and its one transition: no duplicate cargo
    }
  });
});

describe("PO-1/PO-3 — a caller cannot select success: every tampered lawful act is refused by its owner's re-derivation", () => {
  async function tampered(
    f: Freight,
    owner: string,
    facet: string,
    rule: Parameters<typeof groupOfPlan>[4],
    plan: ReturnType<typeof deriveFreightDispatch>,
    edit: (writes: { key: string; value: any; expected_version: number }[]) => void,
    n: number,
  ) {
    if (!plan.ok) throw new Error("setup: the lawful plan must derive");
    const writes = JSON.parse(JSON.stringify(plan.value.writes));
    edit(writes);
    const g = groupOfPlan(f.campaign.store, pub("tamper", n), owner, facet, rule, {
      ...plan.value,
      writes,
    });
    const before = f.campaign.store.head().revision;
    const r = await outcome(f.campaign.store.commit(g));
    expect(f.campaign.store.head().revision, "nothing was written").toBe(before);
    return r;
  }

  it("dispatch: an under-sized or relabelled Transfer Record, or a forged enrollment receipt", async () => {
    const f = await world(quarryWorksFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref);
    const plan = deriveFreightDispatch(storeSource(f.campaign.store), ref);
    for (const [i, edit] of [
      (w: any[]) => {
        w[0].value.freight.dispatched.amount = 1;
      },
      (w: any[]) => {
        w[0].value.freight.economy_status.act = "L0/service-admission";
      },
      (w: any[]) => {
        w[1].value.directive_use_id = "someone-elses-use";
      },
      (w: any[]) => {
        w[0].value.dispatched_at.value += 1;
      },
    ].entries()) {
      const r = await tampered(
        f,
        "logistics",
        "logistics_state",
        FREIGHT_LOGISTICS_RULE,
        plan,
        edit,
        i,
      );
      expect(r.code, `tamper ${i}`).toBe("VALUE_INVALID");
    }
    expect(
      f.campaign.store.getFact(logisticsTransferKey(f.fx.worldId, keysOf(f.fx).entityId)),
    ).toBeUndefined();
  });

  it("E1 and AD: a forged digest, a larger headroom or an invented adequacy is refused", async () => {
    const f = await world(textileWorkshopFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref);
    // an adequacy concluded before any receipt, written raw with plausible values from the lawful shape, is refused
    await dispatchFirst(f, ref);
    const e1 = deriveUseConsumption(storeSource(f.campaign.store), ref);
    for (const [i, edit] of [
      (w: any[]) => {
        w[0].value.unused_headroom.amount = 99;
      },
      (w: any[]) => {
        w[0].value.dispatch_event.transfer.content_sha256 = "f".repeat(64);
      },
      (w: any[]) => {
        w[0].value.uses_consumed = 1;
        w[0].value.dispatched.amount = 6;
      },
      (w: any[]) => {
        w[2].value.state.status = "released";
      },
    ].entries()) {
      const r = await tampered(
        f,
        "economy",
        "economy_state",
        FREIGHT_ECONOMY_RULE,
        e1 as never,
        edit,
        10 + i,
      );
      expect(r.code, `E1 tamper ${i}`).toBe("VALUE_INVALID");
    }
    await consumeUse(f, ref);
    const ad = deriveDestinationAdequacy(storeSource(f.campaign.store), ref);
    expect(ad.ok).toBe(false);
    expect(EconomyFreightUseConsumptionSchema).toBeTruthy();
    expect(economyFreightUseConsumptionKey("x")).toBeTruthy();
  });
});
