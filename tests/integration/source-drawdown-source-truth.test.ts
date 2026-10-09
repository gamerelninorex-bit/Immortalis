/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Exact Finite Raw-Source Drawdown — World-State Source Condition establishment: the source truth is committed by World-State
// alone, as an initial setting fact at an established world locus, exactly once; a contradictory second claim about the same
// physical key, a locus that is not the world's, a pre-spent or pre-exhausted condition and an estimate are all refused, and a
// caller can neither state a remainder nor a delivery. Nothing foreign is silently modified.
// Register lineage: IA-02, IA-03 (partial); RC-02; IM-03, IM-11.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  worldLocusKey,
  worldProfileKey,
  worldSourceConditionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { CanonicalCampaign, factKind } from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  PRODUCTION_FIXTURE_EXTENSION,
  SRC_ACCESS,
  SRC_SOURCE_KEY,
  SRC_UNIT,
  fixtureLocus,
  fixtureWorld,
  publication,
  sourceInput,
} from "@immortalis/testkit";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const key = worldSourceConditionKey(FIXTURE_WORLD_ID, SRC_SOURCE_KEY);

async function worldOnly() {
  const campaign = await must(
    CanonicalCampaign.create(tempDir(), {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: "src-truth",
      extension: PRODUCTION_FIXTURE_EXTENSION,
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  return campaign;
}

describe("a Source Condition is an initial setting fact at an established world locus, committed once by World-State", () => {
  it("is established whole, reads and depends on the world and locus, and nothing is delivered", async () => {
    const c = await worldOnly();
    const r = await must(c.establishSourceCondition({ ...publication(3), source: sourceInput() }));
    expect(r.replayed).toBe(false);
    const src = c.sourceCondition(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!;
    expect(src.fact.owner).toBe("world_state");
    expect(src.fact.facet).toBe("world_source_condition");
    expect(src.fact.version).toBe(1);
    expect(src.value.recoverable).toEqual(src.value.establishment.quantity);
    expect(src.value.delivered).toEqual([]);
    expect(src.value.access_facts).toEqual([SRC_ACCESS]);
    const group = c.store.committedGroup("wf-intent-3")!;
    expect(group.reads.map((x) => x.key).sort()).toEqual(
      [worldProfileKey(FIXTURE_WORLD_ID), worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID)].sort(),
    );
    expect(c.verify()).toEqual([]);
  });

  it("cannot precede its world or its locus: it is never created for them", async () => {
    const campaign = await must(
      CanonicalCampaign.create(tempDir(), {
        campaignId: FIXTURE_CAMPAIGN,
        buildId: "src-truth-empty",
        extension: PRODUCTION_FIXTURE_EXTENSION,
      }),
    );
    const none = await campaign.establishSourceCondition({
      ...publication(3),
      source: sourceInput(),
    });
    expect(!none.ok && none.error.code).toBe("PREREQUISITE_MISSING");
    await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
    const noLocus = await campaign.establishSourceCondition({
      ...publication(4),
      source: sourceInput(),
    });
    expect(!noLocus.ok && noLocus.error.code).toBe("PREREQUISITE_MISSING");
    expect(campaign.sourceCondition(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)).toBeUndefined();
  });

  it("a contradictory second claim about the same physical key is refused, and the committed truth is unchanged", async () => {
    const c = await worldOnly();
    await must(c.establishSourceCondition({ ...publication(3), source: sourceInput() }));
    const before = c.store.head();
    for (const over of [
      { quantity: { amount: 9, unit: SRC_UNIT } },
      { material_class: "another-material" },
      { dimension: "another-dimension" },
      {},
    ]) {
      const r = await c.establishSourceCondition({
        ...publication(5),
        intent_id: `wf-intent-x-${JSON.stringify(over)}`,
        group_id: `wf-group-x-${JSON.stringify(over)}`,
        source: sourceInput(over),
      });
      expect(r.ok, JSON.stringify(over)).toBe(false);
      expect(!r.ok && r.error.code).toBe("VERSION_CONFLICT");
    }
    expect(c.store.head()).toEqual(before);
    expect(c.sourceCondition(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!.value.recoverable.amount).toBe(5);
  });

  it("an input that is not an exact finite initial setting fact is refused before any commit", async () => {
    const c = await worldOnly();
    const head = c.store.head();
    for (const over of [
      { quantity: { amount: 0, unit: SRC_UNIT } },
      { quantity: { amount: 2.5, unit: SRC_UNIT } },
      { quantity: { amount: -1, unit: SRC_UNIT } },
      { quantity: { min: 3, max: 6, unit: SRC_UNIT } },
      { estimate: { amount: 5, unit: SRC_UNIT } },
      { rate: 1 },
      { renewal: "seasonal" },
      { delivered: [] },
      { recoverable: { amount: 5, unit: SRC_UNIT } },
      { statement: "" },
      { source_key: "bad key/with slash" },
    ]) {
      const r = await c.establishSourceCondition({ ...publication(6), source: sourceInput(over) });
      expect(r.ok, JSON.stringify(over)).toBe(false);
      expect(!r.ok && r.error.code, JSON.stringify(over)).toBe("INPUT_INVALID");
    }
    expect(c.store.head()).toEqual(head);
  });

  it("admission refuses what the adapter would never build: a pre-spent or pre-exhausted condition, a locus that is not the world's, a foreign authority, a misplaced key", async () => {
    const c = await worldOnly();
    await must(c.establishSourceCondition({ ...publication(3), source: sourceInput() }));
    const real = c.store.getFact(key)!;
    const v = structuredClone(real.value) as any;
    const kind = factKind("world_source_condition");
    const mk = (
      k: string,
      value: unknown,
      n: number,
      over: Partial<CommitGroup> = {},
    ): CommitGroup => ({
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: `raw-src-g-${n}`,
      intent_id: `raw-src-i-${n}`,
      owner: kind.owner,
      facet: kind.facet,
      cause: "raw",
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [
        { key: worldProfileKey(FIXTURE_WORLD_ID), version: 1 },
        { key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID), version: 1 },
      ],
      depends_on: [
        c.store.getFact(worldProfileKey(FIXTURE_WORLD_ID))!.provenance.group_id,
        c.store.getFact(worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID))!.provenance.group_id,
      ],
      writes: [
        {
          key: k,
          owner: kind.owner,
          facet: kind.facet,
          value: value as never,
          unit: null,
          basis: "b",
          secrecy: "s",
          expected_version: 0,
        },
      ],
      ...over,
    });
    const other = worldSourceConditionKey(FIXTURE_WORLD_ID, "source-raw");
    const fresh = { ...v, source_key: "source-raw" };
    const cases: [string, CommitGroup, string][] = [
      [
        "pre-spent",
        mk(
          other,
          {
            ...fresh,
            recoverable: { amount: 3, unit: SRC_UNIT },
            delivered: [{ delivery_id: "x", quantity: { amount: 2, unit: SRC_UNIT } }],
          },
          1,
        ),
        "VALUE_INVALID",
      ],
      [
        "pre-exhausted",
        mk(
          other,
          {
            ...fresh,
            recoverable: { amount: 0, unit: SRC_UNIT },
            delivered: [{ delivery_id: "x", quantity: { amount: 5, unit: SRC_UNIT } }],
            exhaustion: { kind: "PHYSICAL", delivery_id: "x" },
          },
          2,
        ),
        "VALUE_INVALID",
      ],
      [
        "a locus that is not the world's",
        mk(
          other,
          {
            ...fresh,
            locality: {
              world: v.locality.world,
              locus: { fact_key: "world/world-x/locus/nowhere", entity_id: "nowhere" },
            },
          },
          3,
        ),
        "REFERENCE_INVALID",
      ],
      [
        "a key that is not derived from the resolution key",
        mk(worldSourceConditionKey(FIXTURE_WORLD_ID, "elsewhere"), fresh, 4),
        "VALUE_INVALID",
      ],
      [
        "a foreign authority",
        mk(other, fresh, 5, {
          authority: { role: "role.player", permission: "permission.player_choice.commit" },
        }),
        "AUTHORITY_DENIED",
      ],
    ];
    const before = c.store.head();
    for (const [name, group, code] of cases) {
      const r = await c.store.commit(group);
      expect(r.ok, name).toBe(false);
      expect(!r.ok && r.error.code, name).toBe(code);
    }
    expect(c.store.head()).toEqual(before);
    // the same fresh condition, lawfully built, commits
    expect((await c.store.commit(mk(other, fresh, 6))).ok).toBe(true);
    expect(c.verify()).toEqual([]);
  });
});
