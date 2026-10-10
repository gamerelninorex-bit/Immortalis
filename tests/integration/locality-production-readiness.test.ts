/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw fact values */
// Non-circular cross-owner readiness: the REAL Production extraction-basis interface (`SourceDrawdownAdapter.establishBasis`) reads the
// World-State Source Condition that the SHIPPED command line committed in a separate process. The source is not a fixture and its truth
// is not produced by Production; Production only pins it and checks that the physical access fact it relies on is the source's own.
// This claims NOTHING about extraction: no request, extraction, source delta, delivery or Reserve inflow exists or is asserted, the
// source stays whole, and no capability or permission verdict is made by the setup.
import { beforeAll, describe, expect, it } from "vitest";
import {
  ExtractionBasisSchema,
  productionExtractionBasisKey,
  worldSourceConditionKey,
} from "@immortalis/contracts";
import { SourceDrawdownAdapter } from "@immortalis/engine";
import {
  ACCESS,
  SOURCE_AMOUNT,
  SOURCE_KEY,
  SOURCE_UNIT,
  WORLD_ID,
  establishArgs,
  freshDirs,
  openOrdinary,
  runShipped,
  setupDoc,
  writeSetup,
} from "../support/locality.ts";
import { copyDir } from "../support/tmp.ts";

let template: string;
beforeAll(async () => {
  const dirs = freshDirs();
  const run = await runShipped(establishArgs(dirs, writeSetup(setupDoc())), ["confirm"]);
  expect(run.code).toBe(0);
  template = dirs.campaignDir;
}, 120_000);

const pub = (n: number) => ({
  group_id: `prod-basis-group-${n}`,
  intent_id: `prod-basis-intent-${n}`,
  cause: `prod-basis-cause-${n}`,
  basis: "production-test-basis",
  secrecy: "production-test-secrecy",
});

const basis = (over: Record<string, unknown> = {}) => ({
  basis_id: "basis-salt-1",
  world_id: WORLD_ID,
  source_key: SOURCE_KEY,
  material_class: "raw-salt",
  unit: SOURCE_UNIT,
  relies_on: ACCESS,
  ...over,
});

const copyOfTemplate = () => copyDir(template);

describe("Production's extraction basis reads the committed World-State source and relies on its own access fact", () => {
  it("a basis relying on the source's stated access fact is established against the exact committed source version", async () => {
    const dir = copyOfTemplate();
    const campaign = await openOrdinary(dir);
    const source = campaign.sourceCondition(WORLD_ID, SOURCE_KEY)!;
    const drawdown = new SourceDrawdownAdapter(campaign.store);
    const committed = await drawdown.establishBasis({ ...pub(1), extraction_basis: basis() });
    expect(committed.ok).toBe(true);

    const fact = campaign.store.getFact(productionExtractionBasisKey("basis-salt-1"))!;
    expect(fact.owner).toBe("production");
    const stored = ExtractionBasisSchema.parse(fact.value);
    expect(stored.source).toEqual({
      fact_key: worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
      source_key: SOURCE_KEY,
    });
    expect(stored.locality).toEqual(source.value.locality);
    expect(stored.access.relies_on).toEqual(ACCESS);
    expect(source.value.access_facts).toContainEqual(stored.access.relies_on);
    // it pins the exact version of the World-State source and depends on the group that committed it
    const group = campaign.store.committedGroup("prod-basis-intent-1")!;
    expect(group.reads).toContainEqual({ key: source.fact.key, version: source.fact.version });
    expect(group.depends_on).toEqual([source.fact.provenance.group_id]);

    // nothing about extraction is claimed or created: the source is whole, and no request/extraction/delta/account/Reserve exists
    const after = campaign.sourceCondition(WORLD_ID, SOURCE_KEY)!;
    expect(after.fact.version).toBe(1);
    expect(after.value.recoverable).toEqual({ amount: SOURCE_AMOUNT, unit: SOURCE_UNIT });
    expect(after.value.delivered).toEqual([]);
    expect(
      campaign.store
        .listFacts()
        .map((f) => f.owner)
        .sort(),
    ).toEqual(["production", "world_state", "world_state", "world_state"]);
    expect(campaign.verify()).toEqual([]);

    // durable: a fresh ordinary open still verifies the Production → World-State chain
    await campaign.close();
    const reopened = await openOrdinary(dir);
    expect(reopened.verify()).toEqual([]);
    expect(reopened.store.getFact(productionExtractionBasisKey("basis-salt-1"))).toBeDefined();
    await reopened.close();
  }, 120_000);

  const refusals: [string, Record<string, unknown>, string][] = [
    [
      "an access fact the source does not state (Access is not assumed from existence)",
      { relies_on: { aspect: "terrain", statement: "Reachable only by boat." } },
      "REFERENCE_INVALID",
    ],
    [
      "an access aspect the source does not state",
      { relies_on: { aspect: "ownership", statement: ACCESS.statement } },
      "REFERENCE_INVALID",
    ],
    ["another material", { material_class: "raw-clay" }, "REFERENCE_INVALID"],
    ["another unit", { unit: "barrel" }, "REFERENCE_INVALID"],
    [
      "a source that is not established",
      { source_key: "src-unestablished" },
      "PREREQUISITE_MISSING",
    ],
    ["a source of another world", { world_id: "world-other" }, "PREREQUISITE_MISSING"],
  ];
  for (const [name, over, code] of refusals) {
    it(`refuses a basis naming ${name}, and writes nothing`, async () => {
      const campaign = await openOrdinary(copyOfTemplate());
      const before = campaign.store.head();
      const refused = await new SourceDrawdownAdapter(campaign.store).establishBasis({
        ...pub(2),
        extraction_basis: basis(over),
      });
      expect(refused.ok).toBe(false);
      expect((refused as any).error.code).toBe(code);
      expect(campaign.store.head()).toEqual(before);
      expect(campaign.store.getFact(productionExtractionBasisKey("basis-salt-1"))).toBeUndefined();
      await campaign.close();
    }, 60_000);
  }

  it("a campaign whose confirmed source states a different access fact refuses the basis that relied on the first", async () => {
    const other = setupDoc();
    other.source.access_facts = [{ aspect: "terrain", statement: "Reachable only by boat." }];
    const dirs = freshDirs();
    expect((await runShipped(establishArgs(dirs, writeSetup(other)), ["confirm"])).code).toBe(0);
    const campaign = await openOrdinary(dirs.campaignDir);
    const drawdown = new SourceDrawdownAdapter(campaign.store);
    const refused = await drawdown.establishBasis({ ...pub(3), extraction_basis: basis() });
    expect(refused.ok).toBe(false);
    const accepted = await drawdown.establishBasis({
      ...pub(4),
      extraction_basis: basis({ relies_on: other.source.access_facts[0] }),
    });
    expect(accepted.ok).toBe(true);
    await campaign.close();
  }, 120_000);
});
