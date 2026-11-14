import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  quarryWorksFixture,
  textileWorkshopFixture,
  freightPublication,
} from "@immortalis/testkit";
import {
  admitPremises,
  createFreightCampaign,
  fixFreight,
  foundationThroughFixation,
  keysOf,
  openThroughSeal,
  originSelfProvision,
  produceAndAccept,
  reopenFreightCampaign,
  type Freight,
} from "../support/freight.ts";
import { must } from "../support/temporal.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "imm-freight-foundation-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe.each([
  ["Quarry Works", quarryWorksFixture],
  ["Textile Workshop", textileWorkshopFixture],
] as const)("Foundation F — %s (MECHANISM ONLY)", (_label, fixture) => {
  let f: Freight;
  beforeEach(async () => {
    f = await createFreightCampaign(dir, fixture());
  });
  afterEach(async () => {
    await f.campaign.close();
  });

  it("earns the whole output and fixes ONE request with three exclusive slots, with no Logistics write", async () => {
    const requestRef = await foundationThroughFixation(f);
    const { fx } = f;
    const k = keysOf(fx);
    // the SAME conserved entity Production completed and World-State accepted, in the exact authored class/amount/unit
    const entity = f.campaign.store.getFact(k.entity)!;
    expect(entity.owner).toBe("world_state");
    expect((entity.value as { quantity: unknown }).quantity).toEqual({
      amount: fx.expected.required,
      unit: fx.expected.unit,
    });
    const request = f.economy.freightRequest(requestRef)!;
    expect(request.fact.version).toBe(1);
    expect(request.value.quantity).toEqual({
      amount: fx.expected.required,
      unit: fx.expected.unit,
    });
    expect(request.value.ceiling).toEqual({ amount: fx.expected.ceiling, unit: fx.expected.unit });
    expect(f.economy.allocation(requestRef)!.value.state.status).toBe("pending");
    const slots = f.economy.slots(requestRef)!;
    for (const slot of [slots.directive_use, slots.cargo, slots.requirement])
      expect(slot!.value.state).toEqual({ status: "claimed", request_ref: requestRef });
    expect(f.economy.holding(fx.worldId, k.entityId)!.value.status).toBe("encumbered");
    // Foundation F writes no Logistics fact
    expect(f.campaign.store.listFacts().filter((x) => x.owner === "logistics")).toEqual([]);
    // survives a fully re-verified open
    f = await reopenFreightCampaign(f);
    expect(f.economy.allocation(requestRef)!.value.state.status).toBe("pending");
  });

  it("W3: an owner-admitted cessation of the requirement is admitted as protection, then closed once with F4 at the close's own cut", async () => {
    const requestRef = await foundationThroughFixation(f);
    const { fx } = f;
    // nothing to withdraw yet: no owner-admitted trigger exists
    const none = await f.economy.admitWithdrawal({
      ...freightPublication("withdraw", 0),
      request: { request_ref: requestRef },
    });
    expect(none.ok ? "OK" : none.error.code).toBe("NOT_ADMISSIBLE");
    // World-State admits a prospective physical change: the condition has ceased
    await must(
      f.world.admitSiteConditionChange({
        ...freightPublication("change", 1),
        change: {
          world_id: fx.worldId,
          condition_id: fx.siteCondition.condition_id,
          change_id: "ceased-by-other-cause",
          statement:
            "SYNTHETIC FIXTURE: the damaged section was pulled down and the breach walled off for good.",
          outcome: "CEASED",
          authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
        },
      }),
    );
    await must(
      f.economy.admitWithdrawal({
        ...freightPublication("withdraw", 1),
        request: { request_ref: requestRef },
      }),
    );
    const withdrawal = f.economy.withdrawal(requestRef)!.value;
    expect(withdrawal.cause.kind).toBe("W3");
    expect(withdrawal.logistics_guard.branch).toBe("NO_SERVICE_FOR_THIS_REQUEST");
    // protection only: nothing released, nothing closed
    expect(f.economy.allocation(requestRef)!.value.state.status).toBe("withdrawal-pending");
    expect(f.economy.slots(requestRef)!.cargo!.value.state.status).toBe("claimed");
    await must(
      f.economy.closeWithdrawnRequest({
        ...freightPublication("close", 1),
        request: { request_ref: requestRef },
      }),
    );
    expect(f.economy.allocation(requestRef)!.value.state.status).toBe("terminal");
    const slots = f.economy.slots(requestRef)!;
    for (const slot of [slots.directive_use, slots.cargo, slots.requirement]) {
      expect(slot!.value.state.status).toBe("released");
      expect(slot!.fact.version).toBe(2);
    }
    expect(f.economy.close(requestRef)!.value.no_dispatch_basis.kind).toBe(
      "NO_SERVICE_FENCED_AT_THIS_CUT",
    );
    expect(f.campaign.store.listFacts().filter((x) => x.owner === "logistics")).toEqual([]);
  });
});

it("placeholder import use", () => {
  expect(
    [admitPremises, fixFreight, openThroughSeal, originSelfProvision, produceAndAccept].length,
  ).toBe(5);
});
