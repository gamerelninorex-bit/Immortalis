import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  economyFreightAllocationKey,
  economyFreightCargoSlotKey,
  economyFreightResultKey,
  economyFreightUseConsumptionKey,
  logisticsUnusedReleaseKey,
  worldGoverningPremiseHeadKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  freightPublication as pub,
  quarryWorksFixture,
  textileWorkshopFixture,
  type FreightWorldFixture,
} from "@immortalis/testkit";
import { verifyFreightIntegrity } from "@immortalis/engine";
import {
  admitService,
  admitServiceBasis,
  createFreightCampaign,
  foundationThroughFixation,
  keysOf,
  throughDeliveryAndAdequacy,
  type Freight,
} from "../support/freight.ts";
import { must } from "../support/temporal.ts";

let dir: string;
let open: Freight[] = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "imm-freight-integrity-"));
  open = [];
});
afterEach(async () => {
  for (const f of open) await f.campaign.close().catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
});
let seq = 0;
async function world(fx: FreightWorldFixture): Promise<Freight> {
  const f = await createFreightCampaign(join(dir, `w${seq++}`), fx);
  open.push(f);
  return f;
}

/** A read-only view of the real store whose fact listing is mutated: the verifier reads only what the store lists. */
function mutated(
  f: Freight,
  change: (facts: OwnerFact[]) => void,
): Parameters<typeof verifyFreightIntegrity>[0] {
  const facts = f.campaign.store.listFacts().map((x) => structuredClone(x)) as OwnerFact[];
  change(facts);
  return new Proxy(f.campaign.store, {
    get(target, prop) {
      if (prop === "listFacts") return () => facts;
      const v = Reflect.get(target, prop) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
}
const factOf = (facts: OwnerFact[], key: string): OwnerFact => {
  const x = facts.find((y) => y.key === key);
  if (!x) throw new Error(`no fact ${key}`);
  return x;
};
const set = (facts: OwnerFact[], key: string, patch: (v: Record<string, unknown>) => void) =>
  patch(factOf(facts, key).value as Record<string, unknown>);
const drop = (facts: OwnerFact[], key: string) => {
  const i = facts.findIndex((y) => y.key === key);
  if (i < 0) throw new Error(`no fact ${key}`);
  facts.splice(i, 1);
};
const messages = (f: Freight, change: (facts: OwnerFact[]) => void) =>
  verifyFreightIntegrity(mutated(f, change)).map((v) => `${v.key}: ${v.message}`);

async function receivedWorld(fx: FreightWorldFixture): Promise<{ f: Freight; ref: string }> {
  const f = await world(fx);
  const ref = await throughDeliveryAndAdequacy(f);
  return { f, ref };
}

/** W3 → protective admission → F2 unused release → terminal close: the whole unused branch. */
async function closedUnusedWorld(fx: FreightWorldFixture): Promise<{ f: Freight; ref: string }> {
  const f = await world(fx);
  const ref = await foundationThroughFixation(f);
  await admitServiceBasis(f);
  await admitService(f, ref);
  await must(
    f.world.admitSiteConditionChange({
      ...pub("change", 1),
      change: {
        world_id: f.fx.worldId,
        condition_id: f.fx.siteCondition.condition_id,
        change_id: "re-survey",
        statement: "SYNTHETIC FIXTURE: re-surveyed; the same pieces remain damaged.",
        outcome: "STANDING",
        authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
      },
    }),
  );
  await must(f.economy.admitWithdrawal({ ...pub("w", 1), request: { request_ref: ref } }));
  await must(f.logistics.releaseUnusedService({ ...pub("f2", 1), request: { request_ref: ref } }));
  await must(f.economy.closeWithdrawnRequest({ ...pub("c", 1), request: { request_ref: ref } }));
  return { f, ref };
}

describe("freight load-time integrity: lawful state is clean, and every cross-fact tear is named", () => {
  for (const [name, fx] of [
    ["Quarry Works", quarryWorksFixture],
    ["Textile Workshop", textileWorkshopFixture],
  ] as const) {
    it(`${name}: a delivered, receipted world verifies clean`, async () => {
      const { f } = await receivedWorld(fx());
      expect(verifyFreightIntegrity(f.campaign.store)).toEqual([]);
    });
    it(`${name}: the withdrawn → released-unused → closed world verifies clean`, async () => {
      const { f } = await closedUnusedWorld(fx());
      expect(verifyFreightIntegrity(f.campaign.store)).toEqual([]);
    });
  }

  it("a received request cannot lose its consumption or its result, nor be quietly turned back to pending", async () => {
    const { f, ref } = await receivedWorld(quarryWorksFixture());
    const use = keysOf(f.fx);
    void use;
    const directiveUse = (f.economy.freightRequest(ref)!.value as { directive_use_id: string })
      .directive_use_id;
    expect(messages(f, (x) => drop(x, economyFreightUseConsumptionKey(directiveUse)))).toEqual(
      expect.arrayContaining([expect.stringContaining("consumption")]),
    );
    expect(messages(f, (x) => drop(x, economyFreightResultKey(ref)))).toEqual(
      expect.arrayContaining([expect.stringContaining("result")]),
    );
    expect(
      messages(f, (x) =>
        set(x, economyFreightAllocationKey(ref), (v) => {
          v.state = { status: "pending" };
        }),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("a consumed slot cannot be released, nor held by another request, once its one use was consumed", async () => {
    const { f, ref } = await receivedWorld(quarryWorksFixture());
    const cargo = economyFreightCargoSlotKey(f.fx.worldId, keysOf(f.fx).entityId);
    expect(
      messages(f, (x) =>
        set(x, cargo, (v) => {
          v.state = { status: "released", request_ref: ref, close: "forged-close" };
        }),
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining("expected consumed")]));
    expect(
      messages(f, (x) =>
        set(x, cargo, (v) => {
          v.state = { status: "claimed", request_ref: "a-rival-request" };
        }),
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining("a-rival-request")]));
  });

  it("a governing-premise head must count exactly the admitted premises of its class", async () => {
    const { f } = await receivedWorld(textileWorkshopFixture());
    const heads = f.campaign.store
      .listFacts()
      .filter((x) => x.key.includes("/governing-premise-head/"));
    // the opening may admit no premise at all; admit one so the head exists, then tear it
    if (heads.length === 0) {
      await must(
        f.world.admitGoverningPremise({
          ...pub("p3", 1),
          premise: {
            world_id: f.fx.worldId,
            premise_id: "integrity-premise",
            protected_class: "P-3",
            action: "new",
            subject: "a boundary",
            statement: "SYNTHETIC FIXTURE: the boundary is drawn at the south wall.",
            authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
          },
        }),
      );
    }
    expect(verifyFreightIntegrity(f.campaign.store)).toEqual([]);
    const headKey = worldGoverningPremiseHeadKey(f.fx.worldId, "P-3");
    expect(
      messages(f, (x) =>
        set(x, headKey, (v) => {
          v.count = (v.count as number) + 1;
        }),
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining("head counts")]));
  });

  it("an unused release is the one immutable event its commitment, slot and close name", async () => {
    const { f, ref } = await closedUnusedWorld(quarryWorksFixture());
    const releaseKey = logisticsUnusedReleaseKey(ref);
    // the event vanishes: the close that consumed it and the FREE slot that names it both tear
    const gone = messages(f, (x) => drop(x, releaseKey));
    expect(gone).toEqual(
      expect.arrayContaining([
        expect.stringContaining("unused-release event that is not committed"),
        expect.stringContaining("release event that is not committed"),
      ]),
    );
    // the commitment is quietly returned to COMMITTED although a release exists
    const commitmentKey = (
      f.campaign.store
        .listFacts()
        .find((x) => x.key.startsWith("logistics/commitment/")) as OwnerFact
    ).key;
    expect(
      messages(f, (x) =>
        set(x, commitmentKey, (v) => {
          v.state = { status: "COMMITTED" };
        }),
      ),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("release exists but its commitment")]),
    );
    // the service slot is quietly returned to HELD
    const slotKey = (
      f.campaign.store
        .listFacts()
        .find((x) => x.key.startsWith("logistics/service-slot/")) as OwnerFact
    ).key;
    expect(
      messages(f, (x) =>
        set(x, slotKey, (v) => {
          v.state = {
            status: "HELD",
            commitment: { fact_key: commitmentKey, request_id: ref },
          };
        }),
      ).length,
    ).toBeGreaterThan(0);
  });

  it("a terminal request cannot keep a claimed slot, and a close needs its protective withdrawal", async () => {
    const { f, ref } = await closedUnusedWorld(textileWorkshopFixture());
    const cargo = economyFreightCargoSlotKey(f.fx.worldId, keysOf(f.fx).entityId);
    expect(
      messages(f, (x) =>
        set(x, cargo, (v) => {
          v.state = { status: "claimed", request_ref: ref };
        }),
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining("expected released")]));
    expect(messages(f, (x) => drop(x, `economy/freight-withdrawal/${ref}`))).toEqual(
      expect.arrayContaining([expect.stringContaining("withdrawal")]),
    );
  });

  it("the Legal Readiness Seal cannot pin a fact that is not committed", async () => {
    const { f } = await receivedWorld(quarryWorksFixture());
    const sealKey = `gip/readiness-seal/${f.fx.sealId}`;
    const instrument = (
      factOf(f.campaign.store.listFacts() as OwnerFact[], sealKey).value as {
        instrument: { fact_key: string };
      }
    ).instrument.fact_key;
    expect(messages(f, (x) => drop(x, instrument))).toEqual(
      expect.arrayContaining([expect.stringContaining("pins instrument")]),
    );
  });
});
