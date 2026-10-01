/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Economy's demand carrier (WS-004 §5.1, §5.3, §27.1): "Every material demand/claim must resolve to an authoritative
// source such as a Population Unit / Cohort", and Economy "does not own count custody". A Cohort carries a demand
// only once Population has composed it with exact, non-empty membership; Economy references it by identity and
// pinned version and copies none of its membership or count. Register lineage: IA-02, IA-03 (partial);
// RC-02, RC-12; IM-03, IM-04, IM-06, IM-11.
import { describe, expect, it } from "vitest";
import { economyDemandKey, populationCohortKey, populationLedgerKey } from "@immortalis/contracts";
import { EconomyAdapter } from "@immortalis/engine";
import {
  COHORT_BURDEN_L,
  COHORT_BURDEN_M,
  COHORT_OTHER,
  COHORT_STATUS_L,
  DEMAND_1,
  DEMAND_2,
  LEDGER_MAIN,
  LEDGER_OTHER,
  POP_TP,
  advanceToRequest,
  cohortCarrier,
  economyPublication,
  issueInput,
  unitCarrier,
} from "@immortalis/testkit";
import { seededPopulationCampaign } from "../support/population.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const issue = (s: { campaign: { store: any } }, n: number, id: string, carrier: any) =>
  new EconomyAdapter(s.campaign.store).issueDemand({
    ...economyPublication(n),
    demand: issueInput(id, { carrier }),
  });

describe("a Population Cohort as the demand carrier", () => {
  it("a composed, non-empty Cohort carries a demand by reference: Economy copies no membership and Population is untouched", async () => {
    const s = await seededPopulationCampaign(tempDir());
    await must(s.coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
    const store = s.campaign.store;
    const cohortFact = store.getFact(populationCohortKey(LEDGER_MAIN, COHORT_BURDEN_L))!;
    const ledgerFact = store.getFact(populationLedgerKey(LEDGER_MAIN))!;
    expect((cohortFact.value as any).result.cardinality.count).toBeGreaterThan(0);
    const populationBefore = store.listFacts().filter((f) => f.key.startsWith("population/"));

    await must(issue(s, 1, DEMAND_1, cohortCarrier(COHORT_BURDEN_L)));
    const demand = new EconomyAdapter(store).demand(DEMAND_1)!;
    expect(demand.value.carrier_ref).toEqual(cohortCarrier(COHORT_BURDEN_L));
    expect(demand.value.carrier_basis_ref).toEqual({
      ledger: { fact_key: ledgerFact.key, version: ledgerFact.version },
      cohort: { fact_key: cohortFact.key, version: cohortFact.version },
    });
    // no member id, count or unit of the Cohort is in the Economy fact
    const members: string[] = (cohortFact.value as any).result.members;
    for (const m of members) expect(JSON.stringify(demand.value)).not.toContain(`"${m}"`);
    expect(JSON.stringify(demand.value)).not.toMatch(/"members"|"count"|"units"|"cardinality"/);
    // Population is byte-identical
    expect(store.listFacts().filter((f) => f.key.startsWith("population/"))).toEqual(
      populationBefore,
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an uncomposed Cohort (no Population result yet), an unquantified one, a Cohort of another ledger and an unknown Cohort carry no demand", async () => {
    const s = await seededPopulationCampaign(tempDir()); // no close has composed any Cohort
    const store = s.campaign.store;
    expect(
      (store.getFact(populationCohortKey(LEDGER_MAIN, COHORT_BURDEN_L))!.value as any).result,
    ).toBeNull();
    const before = store.listFacts().length;
    expect(await codeOf(issue(s, 1, DEMAND_1, cohortCarrier(COHORT_BURDEN_L)))).toBe(
      "VALUE_INVALID",
    );
    expect(await codeOf(issue(s, 2, DEMAND_1, cohortCarrier("cohort-none")))).toBe(
      "PREREQUISITE_MISSING",
    );
    // a Cohort that belongs to the other ledger cannot be named as the main ledger's carrier
    expect(await codeOf(issue(s, 3, DEMAND_1, cohortCarrier(COHORT_OTHER, LEDGER_MAIN)))).toBe(
      "PREREQUISITE_MISSING",
    );
    expect(store.listFacts().length).toBe(before);
    expect(new EconomyAdapter(store).demand(DEMAND_1)).toBeUndefined();
    // composed (close #1) but the Cohort of the OTHER ledger, at its own ledger, is a lawful carrier of ITS ledger
    await must(s.coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
    expect(await codeOf(issue(s, 4, DEMAND_2, cohortCarrier(COHORT_BURDEN_M)))).toBe("OK");
    void [LEDGER_OTHER, COHORT_STATUS_L, unitCarrier, economyDemandKey];
  });

  it("a Unit carrier works on the same campaign, and a carrier's later Population advance does not rewrite the pinned demand", async () => {
    const s = await seededPopulationCampaign(tempDir());
    await must(issue(s, 1, DEMAND_1, unitCarrier("u-1")));
    const store = s.campaign.store;
    const pinned = new EconomyAdapter(store).demand(DEMAND_1)!;
    const before = pinned.fact;
    // Population keeps advancing (ordinary close #1 at TP): the demand's pin is the version it resolved against
    await must(s.coordinator.advance(advanceToRequest("tx-pop-1", POP_TP)));
    expect(store.getFact(populationLedgerKey(LEDGER_MAIN))!.version).toBeGreaterThan(
      pinned.value.carrier_basis_ref.ledger.version,
    );
    expect(store.getFact(economyDemandKey(DEMAND_1))).toEqual(before);
    expect(s.campaign.verify()).toEqual([]); // a historical pin at an older version is lawful
  });
});
