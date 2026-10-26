import { legacyStateText } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Economy Demand → Production Request → Realized Access — enforcement that does not depend on the coordinator or
// on the Economy / Production / custodian operations behaving. IM-11 admission holds for a raw `store.commit` and
// for a TAMPERED group; owner exclusivity holds for everyone (Population, Production, World-State, the kernel, a
// foreign extension owner, and Economy itself outside its own key spaces); load-time verification fails closed on
// drift; a failure at every durable step of the issuance and of the completion transaction converges by identity
// with no duplicate demand, request, operation, consumption, output, acceptance or Economy result.
// Register lineage: IA-02, IA-03, IA-05 (bounded partial), IA-06, IA-30 (partial); RC-02, RC-06, RC-07, RC-10,
// RC-12, RC-16; IM-02, IM-03, IM-04, IM-05, IM-06, IM-11, IM-12, IM-17. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  FACET_ECONOMY_STATE,
  OWNER_ECONOMY,
  OWNER_POPULATION,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  TEMPORAL_STATE_KEY,
  economyDemandKey,
  economyRealizationKey,
  economyRealizationStage,
  economyRequestKey,
  populationLedgerKey,
  productionClaimKey,
  productionCompletionKey,
  productionOperationKey,
  productionReserveKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  EconomyAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  nodeFs,
  productionCompletionProvider,
  productionTemporalObject,
  stageGroupId,
  stageIntentId,
  verifyEconomyIntegrity,
  worldFallbackAcceptanceProvider,
  type CampaignStore,
} from "@immortalis/engine";
import {
  DEMAND_1,
  DEMAND_2,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  LEDGER_MAIN,
  PRODUCTION_FIXTURE_EXTENSION,
  PROD_T1,
  PROD_TC,
  RESERVE_MAIN,
  SYNTH_REQUESTER_OWNER,
  at,
  continuationInput,
  demandEntry,
  economyProviders,
  economyPublication,
  economyStartInput,
  instrumentFs,
  issueInput,
  operationOf,
  prodAdvanceRequest,
  prodPublication,
  temporalPublication,
  unitCarrier,
} from "@immortalis/testkit";
import {
  econCoordinator,
  econSummary,
  issueStartRegister,
  registerEconomyOperation,
  reopenEconomy,
  seededEconomyCampaign,
  type EconSeeded,
} from "../support/economy.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { expectedAdapterMethods } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const LOCALITY = { worldId: FIXTURE_WORLD_ID, locusId: FIXTURE_LOCUS_ID };
const opId = operationOf(DEMAND_1);
const entityKey = (id: string) => worldFallbackEntityKey(FIXTURE_WORLD_ID, `durable:${id}`);
const demandKey = economyDemandKey(DEMAND_1);
const requestKey = economyRequestKey(opId);
const realizationKey = economyRealizationKey(DEMAND_1);
const ledgerKey = populationLedgerKey(LEDGER_MAIN);
const reserveKey = productionReserveKey(RESERVE_MAIN);
const opKey = productionOperationKey(opId);
const claimKey = productionClaimKey(`claim:${opId}`);
const completionKey = productionCompletionKey(opId);
const stage = economyRealizationStage(opId);

/** A store whose groups of the named owner are altered on the way in, to prove IM-11 (not the operation) refuses. */
function tamperStore(
  inner: CampaignStore,
  owner: string,
  mutate: (g: CommitGroup) => CommitGroup,
): { store: CampaignStore; tampered: () => number } {
  let n = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: (g) => {
      const group = g as CommitGroup;
      if (group.owner !== owner) return inner.commit(g);
      n += 1;
      return inner.commit(mutate(group));
    },
  };
  return { store, tampered: () => n };
}

const withWrite = (g: CommitGroup, key: string, f: (v: any) => unknown): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) =>
    w.key === key ? { ...w, value: f(structuredClone(w.value)) as never } : w,
  ),
});

const rawGroup = (
  n: number,
  owner: string,
  facet: string,
  writes: { key: string; value: unknown; expected_version: number }[],
  over: Partial<CommitGroup> = {},
): CommitGroup => ({
  campaign_id: FIXTURE_CAMPAIGN,
  group_id: `raw-group-${n}`,
  intent_id: `raw-intent-${n}`,
  owner,
  facet,
  cause: `raw-cause-${n}`,
  rule: {
    artifact: "test://raw",
    native_pin: "p",
    clause: "c",
    authority_lineage: ["l"],
    effective_basis: "b",
    supersedes: null,
  },
  authority: { ...CANON_WRITE_AUTHORITY },
  reads: [],
  depends_on: [],
  writes: writes.map((w) => ({
    ...w,
    owner,
    facet,
    value: w.value as never,
    unit: null,
    basis: "raw-basis",
    secrecy: "raw-secrecy",
  })),
  ...over,
});

const pins = (store: CampaignStore, keys: string[]) => ({
  reads: keys.map((k) => ({ key: k, version: store.getFact(k)?.version ?? 0 })),
  depends_on: [...new Set(keys.flatMap((k) => store.getFact(k)?.provenance.group_id ?? []))],
});

/** The coordinator with the custodian's acceptance AND Economy's realization absent: only Production completes. */
const productionOnly = (store: CampaignStore) =>
  new TemporalCoordinator(store, new StageProviderRegistry([productionCompletionProvider]));
/** Production + the custodian, without Economy: a result that is accepted and not yet realized. */
const withoutEconomy = (store: CampaignStore) =>
  new TemporalCoordinator(
    store,
    new StageProviderRegistry([productionCompletionProvider, worldFallbackAcceptanceProvider]),
  );

/** One demand, accepted and not yet realized. */
async function acceptedNotRealized(): Promise<EconSeeded> {
  const s = await seededEconomyCampaign(tempDir());
  await issueStartRegister(s, DEMAND_1, 1);
  await must(withoutEconomy(s.campaign.store).advance(prodAdvanceRequest("tx-1", PROD_T1)));
  expect(s.economy.access(DEMAND_1).state).toBe("DEMAND_OPEN");
  expect(s.production.availability(opId).state).toBe("ACCEPTED_AVAILABLE");
  return s;
}

/** The raw realization group of the EXACT derived value, under whatever identity the caller chooses. */
function rawRealization(s: EconSeeded, n: number, over: Partial<CommitGroup> = {}) {
  const store = s.campaign.store;
  const keys = [demandKey, requestKey, opKey, completionKey, entityKey(opId)];
  const value = {
    demand_envelope_id: DEMAND_1,
    demand: { fact_key: demandKey, version: 1 },
    request: { fact_key: requestKey, request_id: opId, version: 1 },
    production: {
      operation: { fact_key: opKey, operation_id: opId, version: store.getFact(opKey)!.version },
      completion: { fact_key: completionKey, version: 1 },
    },
    delivery_result: {
      owner: OWNER_WORLD_STATE,
      fact_key: entityKey(opId),
      entity_id: `durable:${opId}`,
      version: 1,
    },
    realized_access: {
      basis: "CUSTODIAN_ACCEPTED_SAME_CONSERVED_REFERENCE",
      output_class: "synthetic-durable-d",
      quantity: { amount: 1, unit: "synthetic-unit-d" },
      physical_custody: "REMAINS_WITH_WORLD_STATE_FALLBACK_CUSTODIAN",
    },
    realized_at: PROD_TC,
    close_stage: stage,
  };
  return {
    value,
    group: rawGroup(
      n,
      OWNER_ECONOMY,
      FACET_ECONOMY_STATE,
      [{ key: realizationKey, value, expected_version: 0 }],
      { ...pins(store, keys), ...over },
    ),
  };
}

describe("Economy-owned state cannot be authoritatively written by anyone else (IA-03; WS-004 §2)", () => {
  it("Population, Production, World-State, the kernel and a foreign extension owner cannot write any Economy key space", async () => {
    const s = await seededEconomyCampaign(tempDir(), { extension: PRODUCTION_FIXTURE_EXTENSION });
    await issueStartRegister(s, DEMAND_1, 1);
    const demand = s.campaign.store.getFact(demandKey)!;
    const attempts: [string, string, string][] = [
      [SYNTH_REQUESTER_OWNER, "synthetic-requester", demandKey],
      [SYNTH_REQUESTER_OWNER, "synthetic-requester", requestKey],
      [SYNTH_REQUESTER_OWNER, "synthetic-requester", realizationKey],
      [OWNER_POPULATION, "population_state", demandKey],
      [OWNER_PRODUCTION, "production_state", demandKey],
      [OWNER_PRODUCTION, "production_state", requestKey],
      [OWNER_PRODUCTION, "production_state", realizationKey],
      [OWNER_WORLD_STATE, "world_fallback_physical_entity", realizationKey],
      ["temporal_kernel", "temporal_coordination", realizationKey],
    ];
    for (const [i, [owner, facet, key]] of attempts.entries()) {
      const r = await s.campaign.store.commit(
        rawGroup(i, owner, facet, [
          {
            key,
            value: demand.value,
            expected_version: s.campaign.store.getFact(key)?.version ?? 0,
          },
        ]),
      );
      expect(r.ok, `${owner}/${facet} → ${key}`).toBe(false);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("Economy cannot write Population, Production, World-State or kernel state: no count, claim, reserve, entity or time", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-1", PROD_T1)));
    const before = econSummary(s.campaign, s.coordinator);
    const foreign = [
      ledgerKey,
      reserveKey,
      claimKey,
      opKey,
      completionKey,
      entityKey(opId),
      worldProfileKey(FIXTURE_WORLD_ID),
      worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
      TEMPORAL_STATE_KEY,
      "temporal/object/x",
    ];
    for (const [i, key] of foreign.entries()) {
      const fact = s.campaign.store.getFact(key);
      const r = await s.campaign.store.commit(
        rawGroup(20 + i, OWNER_ECONOMY, FACET_ECONOMY_STATE, [
          { key, value: fact?.value ?? {}, expected_version: fact?.version ?? 0 },
        ]),
      );
      // an unregistered-for-Economy key space, or an existing fact another owner holds: refused either way
      expect(["KEY_NOT_ADMITTED", "FACT_OWNER_CONFLICT"], key).toContain(!r.ok && r.error.code);
    }
    expect(econSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an extension may not claim the Economy owner, and there is no generic, market, currency, holding or logistics owner", async () => {
    const dir = tempDir();
    const clash = await CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      extension: { owners: new Map([[OWNER_ECONOMY, new Set(["x"])]]) },
    });
    expect(!clash.ok && clash.error.code).toBe("EXTENSION_INVALID");
    const s = await seededEconomyCampaign(tempDir());
    const w = [{ key: "x/y", value: {}, expected_version: 0 }];
    for (const [i, owner] of [
      "asset",
      "inventory",
      "market",
      "exchange",
      "currency",
      "credit",
      "holding",
      "logistics",
      "kti",
    ].entries()) {
      expect(await codeOf(s.campaign.store.commit(rawGroup(i, owner, "any", w)))).toBe(
        "OWNER_NOT_REGISTERED",
      );
    }
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawGroup(30, OWNER_ECONOMY, "other-facet", [
            { key: "economy/market/x", value: {}, expected_version: 0 },
          ]),
        ),
      ),
    ).toBe("OWNER_NOT_REGISTERED");
    // (`economy/holding/…` and `economy/encumbrance/…` are the bounded Holding slice's registered key spaces: their own
    // enforcement lives in economy-holding-enforcement.test.ts; an account, balance or ledger key space still has none)
    for (const key of [
      "economy/market/x",
      "economy/account/x",
      "economy/balance/x",
      "economy/ledger/x",
      "economy/price/x",
      "economy/x",
    ]) {
      expect(
        await codeOf(
          s.campaign.store.commit(
            rawGroup(31, OWNER_ECONOMY, FACET_ECONOMY_STATE, [
              { key, value: {}, expected_version: 0 },
            ]),
          ),
        ),
      ).toBe("KEY_NOT_ADMITTED");
    }
  });

  it("the Economy adapter exposes no setter, no satisfaction marker, no supply or stock writer and no release other than the bounded encumbrance release", () => {
    const methods = adapterMethods(EconomyAdapter);
    expect(methods).toEqual(expectedAdapterMethods("EconomyAdapter"));
    expect(
      methods.filter((m) => /^(set|update|write|release|cancel|publish|satisfy|fulfil)/i.test(m)),
    ).toEqual(["releaseEncumbrance"]);
  });

  it("the sealed demand, request and realized access can be neither amended nor re-created, by Economy or anyone", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-1", PROD_T1)));
    for (const [i, key] of [demandKey, requestKey, realizationKey].entries()) {
      const fact = s.campaign.store.getFact(key)!;
      const edited = structuredClone(fact.value) as any;
      if (edited.demand_entry) edited.demand_entry.quantity.amount = 9;
      if (edited.requested_output) edited.requested_output.quantity.amount = 9;
      if (edited.realized_access) edited.realized_access.quantity.amount = 9;
      const amend = await s.campaign.store.commit(
        rawGroup(40 + i, OWNER_ECONOMY, FACET_ECONOMY_STATE, [
          { key, value: edited, expected_version: fact.version },
        ]),
      );
      expect(!amend.ok && amend.error.code, key).toBe("AMENDMENT_NOT_SUPPORTED");
      const recreate = await s.campaign.store.commit(
        rawGroup(50 + i, OWNER_ECONOMY, FACET_ECONOMY_STATE, [
          { key, value: edited, expected_version: 0 },
        ]),
      );
      expect(recreate.ok, key).toBe(false);
      expect(s.campaign.store.getFact(key)).toEqual(fact);
    }
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("IM-11 refuses an unlawful ISSUANCE — even a TAMPERED one (WS-004 §5, §8, §27.1, §27.2)", () => {
  const mutations: [string, (g: CommitGroup) => CommitGroup, string][] = [
    [
      "a request for more than the demand",
      (g) => withWrite(g, requestKey, (r) => ((r.requested_output.quantity.amount = 2), r)),
      "exactly the output the demand allocates",
    ],
    [
      "a request for another good",
      (g) => withWrite(g, requestKey, (r) => ((r.requested_output.output_class = "other"), r)),
      "exactly the output the demand allocates",
    ],
    [
      "a request from another source",
      (g) =>
        withWrite(g, requestKey, (r) => ((r.source = { owner: "someone", cause_ref: "x" }), r)),
      "exactly the output the demand allocates",
    ],
    [
      "a request at another locality",
      (g) => withWrite(g, requestKey, (r) => ((r.scope.locus.entity_id = "elsewhere"), r)),
      "exactly the output the demand allocates",
    ],
    [
      "a request carrying a priority/authority reference",
      (g) => withWrite(g, requestKey, (r) => ((r.priority_authority_ref = "authority-1"), r)),
      "value violates the economy_request",
    ],
    [
      "a request id that is not the one derived from the demand",
      (g) =>
        withWrite(g, demandKey, (d) => ((d.allocation.request.request_id = "request:other"), d)),
      "derived from the demand identity",
    ],
    [
      "an allocation that is not an economic claim",
      (g) => withWrite(g, demandKey, (d) => ((d.allocation.nature = "PHYSICAL_RESERVATION"), d)),
      "value violates the economy_demand",
    ],
    [
      "a pre-commit availability read at another time",
      (g) => withWrite(g, demandKey, (d) => ((d.pre_commit_availability.at.value = 99), d)),
      "pre-commit availability",
    ],
    [
      "a pre-commit availability that asserts supply",
      (g) =>
        withWrite(
          g,
          demandKey,
          (d) => ((d.pre_commit_availability.supply_for_request = "PRESENT"), d),
        ),
      "value violates the economy_demand",
    ],
    [
      "a pre-commit availability pinned at another temporal version",
      (g) =>
        withWrite(g, demandKey, (d) => ((d.pre_commit_availability.temporal_state.version = 9), d)),
      "pre-commit availability",
    ],
    [
      "no read of the temporal basis at all",
      (g) => ({ ...g, reads: g.reads.filter((r) => r.key !== TEMPORAL_STATE_KEY) }),
      "must read the canonical temporal state",
    ],
    [
      "a carrier that is not a Unit of the ledger",
      (g) => withWrite(g, demandKey, (d) => ((d.carrier_ref.unit_id = "nobody"), d)),
      "not a Population Unit of that ledger",
    ],
    [
      "a carrier pinned at another ledger version",
      (g) => withWrite(g, demandKey, (d) => ((d.carrier_basis_ref.ledger.version = 9), d)),
      "pinned at the committed ledger version",
    ],
    [
      "a Cohort basis for a Unit carrier",
      (g) =>
        withWrite(
          g,
          demandKey,
          (d) => ((d.carrier_basis_ref.cohort = { fact_key: "x", version: 1 }), d),
        ),
      "value violates the economy_demand",
    ],
    [
      "a demand carried at another locality than its carrier's",
      (g) =>
        withWrite(
          withWrite(g, demandKey, (d) => ((d.material_scope.locus.entity_id = "elsewhere"), d)),
          requestKey,
          (r) => ((r.scope.locus.entity_id = "elsewhere"), r),
        ),
      "locality references do not match",
    ],
    [
      "no read of the Population ledger",
      (g) => ({ ...g, reads: g.reads.filter((r) => r.key !== ledgerKey) }),
      "must read the Population ledger",
    ],
    [
      "a demand that is not create-only",
      (g) => ({ ...g, writes: g.writes.map((w) => ({ ...w, expected_version: 1 })) }),
      "expected_version is not current",
    ],
    [
      "a demand without its request",
      (g) => ({ ...g, writes: g.writes.filter((w) => w.key !== requestKey) }),
      "only by issuing one demand with its one Production Request",
    ],
    [
      "a request without its demand",
      (g) => ({ ...g, writes: g.writes.filter((w) => w.key !== demandKey) }),
      "only by issuing one demand with its one Production Request",
    ],
  ];
  it.each(mutations)("refuses %s", async (_name, mutate, why) => {
    const s = await seededEconomyCampaign(tempDir());
    const t = tamperStore(s.campaign.store, OWNER_ECONOMY, mutate);
    const before = econSummary(s.campaign, s.coordinator);
    const r = await new EconomyAdapter(t.store).issueDemand({
      ...economyPublication(60),
      demand: issueInput(DEMAND_1),
    });
    expect(t.tampered()).toBe(1);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.message).toContain(why); // refused by the intended rule
    expect(econSummary(s.campaign, s.coordinator)).toEqual(before); // nothing credited, nothing recorded
    // the honest issuance then commits
    expect(
      (
        await new EconomyAdapter(s.campaign.store).issueDemand({
          ...economyPublication(61),
          demand: issueInput(DEMAND_1),
        })
      ).ok,
    ).toBe(true);
  });

  it("an issuance that duplicates a request, creates supply, or names a missing carrier fails closed", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    const demand = s.campaign.store.getFact(demandKey)!;
    const request = s.campaign.store.getFact(requestKey)!;
    // a second demand cannot reuse the first one's request (a request fixes one operation): version conflict
    const dupe = await s.campaign.store.commit(
      rawGroup(70, OWNER_ECONOMY, FACET_ECONOMY_STATE, [
        { key: economyDemandKey("demand-x"), value: demand.value, expected_version: 0 },
        { key: requestKey, value: request.value, expected_version: 0 },
      ]),
    );
    expect(dupe.ok).toBe(false);
    // demand does not create supply: nothing physical exists for it, however it is issued
    expect(s.campaign.store.listFacts().filter((f) => f.key.includes("/entity/"))).toEqual([]);
    expect(s.economy.demand("demand-x")).toBeUndefined();
    expect(s.economy.access(DEMAND_1).state).toBe("DEMAND_OPEN");
    expect(
      await codeOf(
        s.economy.issueDemand({
          ...economyPublication(71),
          demand: issueInput(DEMAND_2, { carrier: unitCarrier("u-1", "ledger-none") }),
        }),
      ),
    ).toBe("PREREQUISITE_MISSING");
  });
});

describe("IM-11 refuses a realization that the accepted chain does not determine — raw, tampered or early (CG-2 + WS-004 §27.2)", () => {
  it("a raw publication of the EXACT derived value under any identity but its IM-02 stage is refused; the lawful result is the stage", async () => {
    const s = await acceptedNotRealized();
    const { group } = rawRealization(s, 100);
    const raw = await s.campaign.store.commit(group);
    expect(!raw.ok && raw.error.code).toBe("REFERENCE_INVALID");
    expect(!raw.ok && raw.error.message).toContain("published only as its IM-02 stage");
    // right group and intent identity but no transaction cause: still refused
    const noCause = await s.campaign.store.commit(
      rawGroup(
        101,
        OWNER_ECONOMY,
        FACET_ECONOMY_STATE,
        [{ key: realizationKey, value: rawRealization(s, 101).value, expected_version: 0 }],
        {
          ...pins(s.campaign.store, [demandKey, requestKey, opKey, completionKey, entityKey(opId)]),
          group_id: stageGroupId(stage),
          intent_id: stageIntentId(stage),
        },
      ),
    );
    expect(!noCause.ok && noCause.error.code).toBe("REFERENCE_INVALID");
    expect(s.economy.access(DEMAND_1)).toEqual({ state: "DEMAND_OPEN" });
    // the lawful realization: Economy's stage, resolved by the coordinator's continuation
    await must(
      new TemporalCoordinator(s.campaign.store, econCoordinatorProviders()).continueRemainder(
        continuationInput("tx-honest"),
      ),
    );
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    expect(s.economy.realization(DEMAND_1)!.fact.version).toBe(1);
    // a duplicate cannot be credited
    const dup = await s.campaign.store.commit(rawRealization(s, 102).group);
    expect(dup.ok).toBe(false);
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("economy/realization/")),
    ).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a raw realization that COPIES the derived stage identity and names an arbitrary transaction is refused: no durable transaction authority (Blue review of PR #8)", async () => {
    const s = await acceptedNotRealized();
    const before = econSummary(s.campaign, s.coordinator);
    const forged = rawRealization(s, 103, {
      group_id: stageGroupId(stage),
      intent_id: stageIntentId(stage),
      cause: "transaction:forged",
    }).group;
    const r = await s.campaign.store.commit(forged);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/durable authority of its open transaction/);
    expect(s.economy.access(DEMAND_1)).toEqual({ state: "DEMAND_OPEN" });
    expect(econSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(s.campaign.verify()).toEqual([]);
    // the honest continuation still records access exactly once
    await must(
      new TemporalCoordinator(s.campaign.store, econCoordinatorProviders()).continueRemainder(
        continuationInput("tx-honest"),
      ),
    );
    expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
    expect(s.economy.realization(DEMAND_1)!.fact.version).toBe(1);
  });

  it("Production completion alone cannot be realized: with no acceptance there is no entity to read, whoever publishes", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    await must(productionOnly(s.campaign.store).advance(prodAdvanceRequest("tx-1", PROD_T1)));
    expect(s.production.availability(opId).state).toBe("COMPLETED_PENDING_ACCEPTANCE");
    const { value } = rawRealization(s, 110);
    const stageGroup = (n: number) =>
      rawGroup(
        n,
        OWNER_ECONOMY,
        FACET_ECONOMY_STATE,
        [{ key: realizationKey, value, expected_version: 0 }],
        {
          ...pins(s.campaign.store, [demandKey, requestKey, opKey, completionKey]),
          group_id: stageGroupId(stage),
          intent_id: stageIntentId(stage),
          cause: "transaction:forged",
        },
      );
    // with the entity read pinned at version 0 (absent) and with it omitted: refused — the entity does not exist
    for (const [n, g] of [
      [111, stageGroup(111)],
      [
        112,
        {
          ...stageGroup(112),
          reads: [...stageGroup(112).reads, { key: entityKey(opId), version: 0 }],
        },
      ],
    ] as const) {
      const r = await s.campaign.store.commit(g);
      expect(!r.ok && r.error.code, String(n)).toBe("PREREQUISITE_MISSING");
    }
    expect(s.economy.access(DEMAND_1)).toEqual({ state: "DEMAND_OPEN" });
    expect(s.campaign.store.getFact(realizationKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  const tampered: [string, (v: any) => void, string][] = [
    [
      "an inflated quantity",
      (v) => (v.realized_access.quantity.amount = 2),
      "exactly what the accepted chain determines",
    ],
    [
      "another good",
      (v) => (v.realized_access.output_class = "other"),
      "exactly what the accepted chain determines",
    ],
    [
      "a result stamped at a requested horizon, not the boundary",
      (v) => (v.realized_at = at(300)),
      "operation's own declared boundary instant",
    ],
    [
      "a result pinned to another entity version",
      (v) => (v.delivery_result.version = 2),
      "exactly what the accepted chain determines",
    ],
    [
      "a demand pinned at the wrong version",
      (v) => (v.demand.version = 2),
      "exactly what the accepted chain determines",
    ],
    [
      "a request pinned at the wrong version",
      (v) => (v.request.version = 2),
      "exactly what the accepted chain determines",
    ],
    [
      "another demand identity",
      (v) => (v.demand_envelope_id = "demand-x"),
      "demand_envelope_id does not match the key",
    ],
    [
      "another IM-02 stage identity",
      (v) => (v.close_stage.prospective_result_id = "x"),
      "exactly what the accepted chain determines",
    ],
    [
      "physical custody claimed by Economy",
      (v) => (v.realized_access.physical_custody = "HELD_BY_ECONOMY"),
      "value violates the economy_realization",
    ],
    [
      "a holder or title field",
      (v) => (v.holder = "someone"),
      "value violates the economy_realization",
    ],
  ];
  it.each(tampered)(
    "Economy's stage with %s is refused: nothing is credited, and the honest continuation then records access once",
    async (_n, edit, why) => {
      const s = await acceptedNotRealized();
      const t = tamperStore(s.campaign.store, OWNER_ECONOMY, (g) =>
        withWrite(g, realizationKey, (v) => (edit(v), v)),
      );
      const before = econSummary(s.campaign, s.coordinator);
      const c = new TemporalCoordinator(t.store, econCoordinatorProviders());
      const r = await must(c.continueRemainder(continuationInput("tx-2")));
      expect(t.tampered()).toBeGreaterThan(0);
      expect(r.rejections.map((x) => [x.stage.owner_operation.owner, x.code])).toEqual([
        ["economy", expect.stringMatching(/VALUE_INVALID|REFERENCE_INVALID/)],
      ]);
      expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
      expect(r.transaction.outcome.unresolved_dependents.map((u) => u.reason)).toEqual([
        "VALIDATION_REJECTED",
      ]);
      expect(why.length).toBeGreaterThan(0);
      expect(s.economy.access(DEMAND_1)).toEqual({ state: "DEMAND_OPEN" });
      expect(econSummary(s.campaign, s.coordinator).economy).toEqual(before.economy);
      // the honest continuation records access exactly once
      await must(
        new TemporalCoordinator(s.campaign.store, econCoordinatorProviders()).continueRemainder(
          continuationInput("tx-3"),
        ),
      );
      expect(s.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
      expect(s.economy.realization(DEMAND_1)!.fact.version).toBe(1);
      expect(s.campaign.verify()).toEqual([]);
    },
  );

  it("raw tamper messages name the rule that refused them", async () => {
    const s = await acceptedNotRealized();
    const bogus = (n: number, edit: (v: any) => void) => {
      const { value } = rawRealization(s, n);
      edit(value);
      return s.campaign.store.commit(
        rawGroup(
          n,
          OWNER_ECONOMY,
          FACET_ECONOMY_STATE,
          [{ key: realizationKey, value, expected_version: 0 }],
          {
            ...pins(s.campaign.store, [
              demandKey,
              requestKey,
              opKey,
              completionKey,
              entityKey(opId),
            ]),
            group_id: stageGroupId(stage),
            intent_id: stageIntentId(stage),
            cause: "transaction:forged",
          },
        ),
      );
    };
    for (const [i, [, edit, why]] of tampered.entries()) {
      const r = await bogus(120 + i, edit);
      expect(r.ok, String(i)).toBe(false);
      expect(!r.ok && r.error.message, String(i)).toContain(why);
    }
    expect(s.economy.access(DEMAND_1)).toEqual({ state: "DEMAND_OPEN" });
  });
});

describe("RC-10: an Economy-sourced operation's temporal object is exactly the one derived from its committed operation", () => {
  it("a hand-written object — no Economy stage, an Economy-only object, another boundary, a duplicate stage — is refused at registration", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await must(s.economy.issueDemand({ ...economyPublication(1), demand: issueInput(DEMAND_1) }));
    await must(
      s.production.startOperation({ ...prodPublication(11), start: economyStartInput(DEMAND_1) }),
    );
    const op = s.production.operation(opId)!.value;
    const honest = productionTemporalObject(op, LOCALITY);
    expect(honest.dependencies.map((d) => d.stage.owner_operation.owner)).toEqual([
      "production",
      "world_state",
      "economy",
    ]);
    const economyStage = honest.dependencies[2]!;
    const variants: [string, unknown][] = [
      [
        "no Economy stage (the demand would be silently unsatisfiable)",
        { ...honest, dependencies: honest.dependencies.slice(0, 2) },
      ],
      ["no custodian stage", { ...honest, dependencies: [honest.dependencies[0], economyStage] }],
      [
        "an Economy stage that reads nothing",
        {
          ...honest,
          dependencies: [
            honest.dependencies[0],
            honest.dependencies[1],
            { ...economyStage, reads: [] },
          ],
        },
      ],
      [
        "an Economy stage that reads the completion before acceptance only",
        {
          ...honest,
          dependencies: [
            honest.dependencies[0],
            honest.dependencies[1],
            { ...economyStage, reads: economyStage.reads.slice(0, 4) },
          ],
        },
      ],
      [
        "a second Economy stage",
        {
          ...honest,
          dependencies: [
            ...honest.dependencies,
            { ...economyStage, stage: { ...economyStage.stage, prospective_result_id: "x" } },
          ],
        },
      ],
      ["another boundary", { ...honest, next_boundary: { ...honest.next_boundary!, at: at(150) } }],
      [
        "an Economy-owned object that carries only the Economy stage",
        {
          ...honest,
          object_id: `obj-economy-${DEMAND_1}`,
          owning_ref: { owner: "economy", process_id: honest.owning_ref.process_id },
          dependencies: [economyStage],
        },
      ],
      [
        "an object for an operation that is not committed",
        { ...honest, object_id: "obj-production-request:none" },
      ],
    ];
    for (const [name, object] of variants) {
      const r = await s.coordinator.registerObject({ ...temporalPublication(60), object });
      expect(r.ok, name).toBe(false);
    }
    expect(s.coordinator.object(`obj-production-${opId}`)).toBeUndefined();
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    await must(s.coordinator.registerObject({ ...temporalPublication(61), object: honest }));
    expect(
      await codeOf(s.coordinator.registerObject({ ...temporalPublication(62), object: honest })),
    ).toBe("VERSION_CONFLICT");
  });

  it("a Production start on a request that is not its source's own fact, or is another owner's registered fact, is refused", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await must(s.economy.issueDemand({ ...economyPublication(1), demand: issueInput(DEMAND_1) }));
    // the DEMAND (an Economy fact that is not a request) cannot be pinned as a request
    for (const request_key of [
      demandKey,
      ledgerKey,
      reserveKey,
      worldProfileKey(FIXTURE_WORLD_ID),
    ]) {
      const r = await s.production.startOperation({
        ...prodPublication(80),
        start: { ...economyStartInput(DEMAND_1), request_key },
      });
      expect(r.ok, request_key).toBe(false);
    }
    expect(s.production.operation(opId)).toBeUndefined();
    expect(
      (
        await s.production.startOperation({
          ...prodPublication(81),
          start: economyStartInput(DEMAND_1),
        })
      ).ok,
    ).toBe(true);
  });
});

describe("load-time verification fails closed on Economy drift (IA-30 partial)", () => {
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    opts: { complete?: boolean } = {},
  ) {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1);
    if (opts.complete !== false)
      await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const inner = s.campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
    const bound: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => facts,
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      commit: (g) => inner.commit(g),
      close: () => inner.close(),
    };
    const out = verifyEconomyIntegrity(bound);
    await s.campaign.close();
    return out.map((v) => v.message).join(" | ");
  }
  const edit = (key: string, f: (v: any, fact: any) => void) => (facts: OwnerFact[]) => {
    f(
      facts.find((x) => x.key === key)!.value,
      facts.find((x) => x.key === key),
    );
    return facts;
  };

  it("healthy campaigns verify, before and after completion", async () => {
    expect(await drifted((f) => f)).toBe("");
    expect(await drifted((f) => f, { complete: false })).toBe("");
  });
  it("detects a request that is not what its demand allocated, and a request with no demand", async () => {
    expect(
      await drifted(
        edit(requestKey, (r) => (r.requested_output.quantity.amount = 3)),
        { complete: false },
      ),
    ).toMatch(/exactly the one Production Request it allocated to/);
    expect(await drifted((f) => f.filter((x) => x.key !== demandKey), { complete: false })).toMatch(
      /request has no demand/,
    );
  });
  it("detects a demand and request that were not published atomically", async () => {
    expect(
      await drifted(
        edit(requestKey, (_r, fact) => (fact.provenance.group_id = "other-group")),
        {
          complete: false,
        },
      ),
    ).toMatch(/atomically/);
  });
  it("detects a demand whose carrier is gone or at another locality", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== ledgerKey), { complete: false })).toMatch(
      /committed Population ledger/,
    );
    expect(
      await drifted(
        edit(ledgerKey, (l) => (l.locality.locus.entity_id = "elsewhere")),
        {
          complete: false,
        },
      ),
    ).toMatch(/committed Population ledger/);
  });
  it("detects a realization that is not what the accepted chain determines", async () => {
    expect(
      await drifted(edit(realizationKey, (z) => (z.realized_access.quantity.amount = 3))),
    ).toMatch(/exactly what the accepted chain determines/);
    expect(await drifted(edit(realizationKey, (z) => (z.realized_at.value = 300)))).toMatch(
      /exactly what the accepted chain determines/,
    );
  });
  it("detects a realization with no accepted entity, and a retired boundary that left an accepted result without its Economy consequence", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== entityKey(opId)))).toMatch(
      /no committed demand, request, operation, completion or accepted entity/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== realizationKey))).toMatch(
      /retired boundary of an Economy-sourced operation has its Economy result/,
    );
  });
  it("detects a realization that is not its IM-02 stage, and one credited by no transaction", async () => {
    expect(
      await drifted(edit(realizationKey, (_z, fact) => (fact.provenance.group_id = "raw-group"))),
    ).toMatch(/published only as its IM-02 stage/);
    expect(
      await drifted((f) => f.filter((x) => !x.key.startsWith("temporal/transaction/"))),
    ).toMatch(/credited by no resolution transaction/);
  });
  it("detects realized output that existed before the demand it answers (it may not feed the pre-commit availability)", async () => {
    const swapped = await drifted((facts) => {
      const z = facts.find((x) => x.key === realizationKey)!;
      const d = facts.find((x) => x.key === demandKey)!;
      d.provenance.intent_id = z.provenance.intent_id; // the demand now "committed" after the entity it saw
      return facts;
    });
    expect(swapped).toMatch(
      /physical result for the request existed before the demand was committed/,
    );
  });

  it("tampering with the persisted journal or state fails the open under the existing integrity model", async () => {
    const dir = tempDir();
    const s = await seededEconomyCampaign(dir);
    await issueStartRegister(s, DEMAND_1, 1);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    await s.campaign.close();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("ECONOMIC_ALLOCATION_CLAIM_NOT_STOCK_TITLE_OR_RESERVATION");
    writeFileSync(
      journal,
      text.replace(
        "CUSTODIAN_ACCEPTED_SAME_CONSERVED_REFERENCE",
        "CUSTODIAN_ACCEPTED_SAME_CONSERVED_REFERENCX",
      ),
    );
    expect((await CanonicalCampaign.open(dir)).ok).toBe(false);

    const dir2 = tempDir();
    const s2 = await seededEconomyCampaign(dir2);
    await issueStartRegister(s2, DEMAND_1, 1);
    await s2.campaign.close();
    const stateFile = readdirSync(dir2)
      .filter((f) => /^state\./.test(f))
      .sort()
      .pop()!;
    const state = legacyStateText(join(dir2, stateFile));
    expect(state).toContain('"ABSENT"');
    writeFileSync(join(dir2, stateFile), state.replace('"ABSENT"', '"PRESENT"'));
    expect((await CanonicalCampaign.open(dir2)).ok).toBe(false);
  });
});

describe("unknown outcome is reconciled by identity: a failure at EVERY durable step", () => {
  it("of the issuance converges on one demand and one request", async () => {
    const seed = async (dir: string) => {
      const s = await seededEconomyCampaign(dir);
      await s.campaign.close();
    };
    const issue = (campaign: CanonicalCampaign) =>
      new EconomyAdapter(campaign.store).issueDemand({
        ...economyPublication(1),
        demand: issueInput(DEMAND_1),
      });
    const refDir = tempDir();
    await seed(refDir);
    const ref = await reopenEconomy(refDir, "ref");
    await must(issue(ref.campaign));
    const refHead = ref.campaign.store.head();
    const refSummary = econSummary(ref.campaign, ref.coordinator);
    await ref.campaign.close();

    const countDir = tempDir();
    await seed(countDir);
    const probe = instrumentFs(nodeFs);
    const p = await must(CanonicalCampaign.open(countDir, { fs: probe.fs }));
    const afterOpen = probe.count();
    await must(issue(p));
    const afterIssue = probe.count();
    await p.close();
    expect(afterIssue - afterOpen).toBeGreaterThanOrEqual(2);

    const finals = new Set<string>();
    const seen = { absent: 0, present: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterIssue; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const campaign = await must(CanonicalCampaign.open(dir, { fs: inst.fs }));
        const r = await issue(campaign);
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await campaign.close();
        const re = await reopenEconomy(dir, "restart");
        expect(re.campaign.verify()).toEqual([]);
        if (re.economy.demand(DEMAND_1)) seen.present++;
        else seen.absent++;
        // re-present the SAME intent: the existing receipt is reached or the group is committed once
        const again = await must(issue(re.campaign));
        expect(typeof again.replayed).toBe("boolean");
        const head = re.campaign.store.head();
        expect(head.revision).toBe(refHead.revision); // no duplicate group anywhere
        expect(econSummary(re.campaign, re.coordinator).economy).toEqual(refSummary.economy);
        finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
        await re.campaign.close();
      }
    }
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBe(`${refHead.state_sha256}/${refHead.journal_head_sha256}`);
    expect(seen.absent).toBeGreaterThan(0);
    expect(seen.present).toBeGreaterThan(0);
  }, 240_000);

  it("of the completion transaction (completion, acceptance, realized access, kernel group) converges on one of each", async () => {
    const seed = async (dir: string) => {
      const s = await seededEconomyCampaign(dir);
      await issueStartRegister(s, DEMAND_1, 1);
      await s.campaign.close();
    };
    const refDir = tempDir();
    await seed(refDir);
    const ref = await reopenEconomy(refDir, "ref");
    const refResult = await must(
      ref.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)),
    );
    const refHead = ref.campaign.store.head();
    const refSummary = econSummary(ref.campaign, ref.coordinator);
    await ref.campaign.close();

    const countDir = tempDir();
    await seed(countDir);
    const probe = instrumentFs(nodeFs);
    const p = await must(CanonicalCampaign.open(countDir, { fs: probe.fs }));
    const afterOpen = probe.count();
    await must(econCoordinator(p.store).advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    const afterAdvance = probe.count();
    await p.close();
    // three stages + the kernel group: four commits of at least two durable steps each
    expect(afterAdvance - afterOpen).toBeGreaterThanOrEqual(8);

    const seen = { rolledBack: 0, partial: 0, committed: 0 };
    const finals = new Set<string>();
    const stages = ["production", "world_state", "economy"].map((owner, i) =>
      stageIntentId({
        causal_process_id: `production-operation:${opId}`,
        owner_operation: {
          owner,
          operation: [
            "production-complete-operation",
            "world-state-accept-fallback-durable",
            "economy-record-realized-access",
          ][i]!,
        },
        prospective_result_id: [`completion:${opId}`, `acceptance:${opId}`, `realization:${opId}`][
          i
        ]!,
      }),
    );
    for (let failAt = afterOpen + 1; failAt <= afterAdvance; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const campaign = await must(CanonicalCampaign.open(dir, { fs: inst.fs }));
        const r = await econCoordinator(campaign.store).advance(
          prodAdvanceRequest("tx-complete", PROD_T1),
        );
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await campaign.close();

        const re = await reopenEconomy(dir, "restart");
        expect(re.campaign.verify()).toEqual([]); // whatever survived is internally consistent
        const stageCommitted = stages.map((i) => re.campaign.store.lookupReceipt(i) !== null);
        if (re.coordinator.transaction("tx-complete")) seen.committed++;
        else if (stageCommitted.some(Boolean)) seen.partial++;
        else seen.rolledBack++;
        // stages commit in order: never an acceptance without its completion, nor Economy without acceptance
        if (stageCommitted[2]) expect(stageCommitted[1] && stageCommitted[0]).toBe(true);
        if (stageCommitted[1]) expect(stageCommitted[0]).toBe(true);
        expect(re.production.reserve(RESERVE_MAIN)!.value.consumed.length).toBeLessThanOrEqual(1);
        // Economy never records access before the custodian accepted
        if (re.economy.realization(DEMAND_1))
          expect(re.production.availability(opId).state).toBe("ACCEPTED_AVAILABLE");

        // re-present the SAME request: existing receipts are reached; a committed stage is adopted
        const again = await must(
          re.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)),
        );
        if (stageCommitted.some(Boolean) && !re.coordinator.transaction("tx-complete")) {
          expect(again.recomputed_in_place).toEqual([]);
        }
        const head = re.campaign.store.head();
        expect(head.revision).toBe(refHead.revision); // no duplicate group anywhere
        const sum = econSummary(re.campaign, re.coordinator);
        expect(sum.economy).toEqual(refSummary.economy);
        expect(sum.production).toEqual(refSummary.production);
        expect(sum.entities).toEqual(refSummary.entities);
        expect(re.production.reserve(RESERVE_MAIN)!.value.consumed).toHaveLength(1);
        expect(re.production.availability(opId).state).toBe("ACCEPTED_AVAILABLE");
        expect(re.economy.access(DEMAND_1).state).toBe("REALIZED_ACCESS");
        expect(again.transaction.stages.map((s) => s.group_id)).toEqual(
          refResult.transaction.stages.map((s) => s.group_id),
        );
        finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
        await re.campaign.close();
        const last = await reopenEconomy(dir, "last");
        expect(last.campaign.verify()).toEqual([]);
        await last.campaign.close();
      }
    }
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBe(`${refHead.state_sha256}/${refHead.journal_head_sha256}`);
    expect(seen.rolledBack).toBeGreaterThan(0);
    expect(seen.partial).toBeGreaterThan(0);
    expect(seen.committed).toBeGreaterThan(0);
  }, 480_000);
});

describe("a refused or unmet demand leaves nothing behind", () => {
  it("a demand whose Production start is refused records no operation, claim, object, boundary, entity or Economy result", async () => {
    const s = await seededEconomyCampaign(tempDir());
    await issueStartRegister(s, DEMAND_1, 1, { input: 6 });
    await must(s.economy.issueDemand({ ...economyPublication(2), demand: issueInput(DEMAND_2) }));
    const before = econSummary(s.campaign, s.coordinator);
    const r = await s.production.startOperation({
      ...prodPublication(130),
      start: economyStartInput(DEMAND_2, { input: 9 }),
    });
    expect(!r.ok && r.error.code).toBe("CLAIM_INCOMPATIBLE");
    expect(econSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(1);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-complete", PROD_T1)));
    // once material is free the SAME request can be presented again: it was never recorded as an operation
    const later = await s.production.startOperation({
      ...prodPublication(131),
      start: economyStartInput(DEMAND_2, { input: 4, completion_at: at(400) }),
    });
    expect(later.ok).toBe(true);
    await registerEconomyOperation(s, DEMAND_2, 50);
    await must(s.coordinator.advance(prodAdvanceRequest("tx-later", at(500))));
    expect(s.economy.access(DEMAND_2).state).toBe("REALIZED_ACCESS");
    expect(s.economy.realization(DEMAND_2)!.value.realized_at).toEqual(at(400));
    expect(s.campaign.verify()).toEqual([]);
    void demandEntry;
  });
});

function econCoordinatorProviders() {
  return economyProviders();
}
