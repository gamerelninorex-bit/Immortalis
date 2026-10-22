// The initial Production Reserve admission, end to end: a campaign whose ORIGINAL locality (and, in one case, an additional locality) the
// shipped commands already committed gains exactly ONE more fact — a Production-owned Reserve at version 1, under the owner's derived
// fields — and every earlier fact, source included, is left byte-identical. The shipped binary then reads it back from a separate
// ordinary process. The starting quantity is an authored initial setting: nothing here asserts a collection, a delivery, an entitlement
// or a downstream success.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ProductionReserveSchema,
  productionReserveKey,
  worldLocusKey,
  worldProfileKey,
  worldSourceConditionKey,
} from "@immortalis/contracts";
import { canonicalEqual } from "@immortalis/engine";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  NEW_LOCUS_ID,
  RESERVE_AMOUNT,
  RESERVE_CONDITION,
  RESERVE_ID,
  RESERVE_MATERIAL,
  RESERVE_UNIT,
  SOURCE_KEY,
  WORLD_ID,
  addReserve,
  additionalLocalityCampaign,
  headOf,
  localityCampaign,
  openOrdinary,
  reserveDoc,
  runReserve,
  writeReserve,
} from "../support/production-reserve.ts";

const phrase = (s: string) => /type exactly "([^"]+)"/.exec(s)![1]!;

/** The Reserve the Production owner is required to derive from `reserveDoc()`, written out independently of the adapter (WS-003 §2, §4). */
const EXPECTED_VALUE = (amount = RESERVE_AMOUNT, locus = LOCUS_ID, id = RESERVE_ID) => ({
  reserve_id: id,
  material_class: RESERVE_MATERIAL,
  established: { amount, unit: RESERVE_UNIT },
  quantity: { amount, unit: RESERVE_UNIT },
  consumed: [],
  condition: RESERVE_CONDITION,
  locality: {
    world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
    locus: { fact_key: worldLocusKey(WORLD_ID, locus), entity_id: locus },
  },
  holding: "HELD_LOCAL_BY_PRODUCTION",
  claims: [],
});

describe("one confirmed initial Reserve is established at an established original locus", () => {
  it("writes exactly the new Production key at version 1 and leaves the world, locus, source and everything else byte-identical", async () => {
    const dirs = await localityCampaign();
    const before = await openOrdinary(dirs.campaignDir);
    const factsBefore = before.store.listFacts();
    const headBefore = before.store.head();
    await before.close();
    expect(factsBefore.map((f) => f.key).sort()).toEqual(
      [
        worldProfileKey(WORLD_ID),
        worldLocusKey(WORLD_ID, LOCUS_ID),
        worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
      ].sort(),
    );

    const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc()));
    expect(result.status).toBe("RESERVE_READY");
    expect(terminal.said.some((l) => l.startsWith("PROGRESS reserve COMMITTED"))).toBe(true);

    // an ordinary reopen, as any other normal process would
    const after = await openOrdinary(dirs.campaignDir);
    try {
      expect(after.verify()).toEqual([]);
      const head = after.store.head();
      expect(head.campaign_id).toBe(LOCALITY_CAMPAIGN);
      expect(head.revision).toBe(headBefore.revision + 1);
      const factsAfter = after.store.listFacts();
      expect(factsAfter).toHaveLength(factsBefore.length + 1);
      for (const f of factsBefore) expect(canonicalEqual(f, after.store.getFact(f.key))).toBe(true);

      const fact = after.store.getFact(productionReserveKey(RESERVE_ID))!;
      expect(fact.key).toBe(`production/reserve/${RESERVE_ID}`);
      expect(fact.owner).toBe("production");
      expect(fact.facet).toBe("production_state");
      expect(fact.version).toBe(1);
      expect(fact.provenance.group_id).toMatch(/^operator-production-reserve:[0-9a-f]{32}$/);
      expect(fact.provenance.intent_id).toMatch(
        /^operator-production-reserve-intent:[0-9a-f]{32}$/,
      );
      expect(fact.value).toEqual(EXPECTED_VALUE());
      expect(ProductionReserveSchema.safeParse(fact.value).success).toBe(true);
      // optional existing collection, absent at establishment
      expect("inflows" in (fact.value as object)).toBe(false);

      // the committed record reads and depends on exactly the world and the locus
      const group = after.store.committedGroup(fact.provenance.intent_id)!;
      expect(group.owner).toBe("production");
      expect(group.writes).toHaveLength(1);
      expect(group.writes[0]!.expected_version).toBe(0);
      expect(group.reads.map((r) => `${r.key}@${r.version}`).sort()).toEqual(
        [`${worldProfileKey(WORLD_ID)}@1`, `${worldLocusKey(WORLD_ID, LOCUS_ID)}@1`].sort(),
      );

      // the source is still whole: establishing a Reserve neither drew from it nor delivered anything
      const source = after.sourceCondition(WORLD_ID, SOURCE_KEY)!;
      expect(source.fact.version).toBe(1);
      expect(source.value.recoverable.amount).toBe(120);
      expect(source.value.delivered).toEqual([]);
      expect(source.value.exhaustion).toBeNull();
    } finally {
      await after.close();
    }
  });

  it("an authored starting quantity of zero is admitted exactly as authored (an empty Reserve is a lawful setting)", async () => {
    const dirs = await localityCampaign();
    const doc = reserveDoc({ quantity: { amount: 0, unit: RESERVE_UNIT } });
    const { result } = await addReserve(dirs, writeReserve(doc));
    expect(result.status).toBe("RESERVE_READY");
    const c = await openOrdinary(dirs.campaignDir);
    expect(c.store.getFact(productionReserveKey(RESERVE_ID))!.value).toEqual(EXPECTED_VALUE(0));
    await c.close();
  });

  it("shows the whole Reserve for one confirmation before anything is written, and writes nothing on a refusal to confirm", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc()), ["decline"]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const shown = terminal.said.join("\n");
    for (const part of [
      RESERVE_ID,
      RESERVE_MATERIAL,
      RESERVE_CONDITION,
      `EXACT starting quantity: ${RESERVE_AMOUNT} ${RESERVE_UNIT}`,
      LOCUS_ID,
      WORLD_ID,
      "NOT a collection, conversion or delivery from any source",
      "entitlement, title,",
    ])
      expect(shown, part).toContain(part);
    expect(terminal.asked()).toBe(1);
    expect(terminal.said.filter((l) => l.startsWith("PROGRESS"))).toEqual([]);
  });

  it("repeating the same confirmed Reserve is idempotent: verified and reported without a new console question or a new write", async () => {
    const dirs = await localityCampaign();
    const file = writeReserve(reserveDoc());
    expect((await addReserve(dirs, file)).result.status).toBe("RESERVE_READY");
    const head = await headOf(dirs.campaignDir);

    const again = await addReserve(dirs, file, []);
    expect(again.result.status).toBe("RESERVE_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an altered Reserve under the same identifier is refused and nothing is replaced", async () => {
    const dirs = await localityCampaign();
    expect((await addReserve(dirs, writeReserve(reserveDoc()))).result.status).toBe(
      "RESERVE_READY",
    );
    const head = await headOf(dirs.campaignDir);
    for (const over of [
      { quantity: { amount: RESERVE_AMOUNT + 1, unit: RESERVE_UNIT } },
      { quantity: { amount: RESERVE_AMOUNT, unit: "bag" } },
      { material_class: "red-salt" },
      { condition: "wet" },
    ]) {
      const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc(over)), []);
      expect(result.status, JSON.stringify(over)).toBe("RESERVE_CONFLICT");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    }
  });

  it("the command can be invoked again with a distinct lawful reserve identifier: there is no per-locus or per-campaign limit", async () => {
    const dirs = await localityCampaign();
    for (const [i, id] of ["reserve-one", "reserve-two", "reserve-three"].entries()) {
      const { result } = await addReserve(
        dirs,
        writeReserve(reserveDoc({ reserve_id: id, quantity: { amount: i, unit: RESERVE_UNIT } })),
      );
      expect(result.status, id).toBe("RESERVE_READY");
    }
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.verify()).toEqual([]);
      const reserves = c.store.listFacts().filter((f) => f.owner === "production");
      expect(reserves.map((f) => f.key).sort()).toEqual([
        "production/reserve/reserve-one",
        "production/reserve/reserve-three",
        "production/reserve/reserve-two",
      ]);
      expect(reserves.every((f) => f.version === 1)).toBe(true);
    } finally {
      await c.close();
    }
  });

  it("a different campaign is isolated: its facts are unaffected", async () => {
    const one = await localityCampaign();
    const two = await localityCampaign();
    expect((await addReserve(one, writeReserve(reserveDoc()))).result.status).toBe("RESERVE_READY");
    const other = await openOrdinary(two.campaignDir);
    try {
      expect(other.store.getFact(productionReserveKey(RESERVE_ID))).toBeUndefined();
      expect(other.store.listFacts()).toHaveLength(3);
    } finally {
      await other.close();
    }
  });
});

describe("a Reserve at an additional locus the operator already confirmed", () => {
  it("is admitted at the additional locus, with that locus (not the first) as its locality", async () => {
    const dirs = await additionalLocalityCampaign();
    const before = await openOrdinary(dirs.campaignDir);
    const factsBefore = before.store.listFacts();
    await before.close();
    expect(factsBefore).toHaveLength(5);

    const doc = reserveDoc({ locus_id: NEW_LOCUS_ID });
    const { result } = await addReserve(dirs, writeReserve(doc));
    expect(result.status).toBe("RESERVE_READY");
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.verify()).toEqual([]);
      expect(c.store.getFact(productionReserveKey(RESERVE_ID))!.value).toEqual(
        EXPECTED_VALUE(RESERVE_AMOUNT, NEW_LOCUS_ID),
      );
      for (const f of factsBefore) expect(canonicalEqual(f, c.store.getFact(f.key))).toBe(true);
      expect(c.store.listFacts()).toHaveLength(6);
    } finally {
      await c.close();
    }
  });

  it("a Reserve at each locus coexists", async () => {
    const dirs = await additionalLocalityCampaign();
    expect((await addReserve(dirs, writeReserve(reserveDoc()))).result.status).toBe(
      "RESERVE_READY",
    );
    expect(
      (
        await addReserve(
          dirs,
          writeReserve(reserveDoc({ reserve_id: "reserve-reed", locus_id: NEW_LOCUS_ID })),
        )
      ).result.status,
    ).toBe("RESERVE_READY");
  });
});

describe("the shipped command as real processes", () => {
  it("establish-reserve (process 1) → an ordinary reopen (process 2) reads the identical fact; a repeat (process 3) converges", async () => {
    const dirs = await localityCampaign();
    const file = writeReserve(reserveDoc());

    const one = await runReserve(dirs, file, ["confirm"]);
    expect(one.stderr).toBe("");
    expect(one.code).toBe(0);
    expect(one.stdout).toContain("STATUS RESERVE_READY");
    expect(phrase(one.stdout)).toMatch(/^establish-reserve [0-9a-f]{12}$/);
    expect(one.stdout).toContain(
      `reserve: ${RESERVE_ID} HELD_LOCAL_BY_PRODUCTION, established ${RESERVE_AMOUNT} ${RESERVE_UNIT} of ${RESERVE_MATERIAL}`,
    );
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);

    const read = await openOrdinary(dirs.campaignDir);
    expect(read.store.getFact(productionReserveKey(RESERVE_ID))!.value).toEqual(EXPECTED_VALUE());
    await read.close();
    const head = await headOf(dirs.campaignDir);

    const three = await runReserve(dirs, file);
    expect(three.code).toBe(0);
    expect(three.stdout).toContain("STATUS RESERVE_READY");
    expect(three.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a declined confirmation exits 2 and writes nothing", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const run = await runReserve(dirs, writeReserve(reserveDoc()), ["decline"]);
    expect(run.code).toBe(2);
    expect(run.stdout).toContain("STATUS DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a pre-typed confirmation cannot stand for the challenge: the end of input declines", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const run = await runReserve(dirs, writeReserve(reserveDoc()));
    expect(run.code).toBe(2);
    expect(run.stdout).toContain("STATUS DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the command requires --reserve-file and refuses the options of other commands", async () => {
    const dirs = await localityCampaign();
    const { runShipped } = await import("../support/locality.ts");
    const missing = await runShipped([
      "establish-reserve",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
    ]);
    expect(missing.code).toBe(64);
    const foreign = await runShipped([
      "establish-reserve",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--reserve-file",
      writeReserve(reserveDoc()),
      "--source-file",
      "x",
    ]);
    expect(foreign.code).toBe(64);
    const doubled = await runShipped([
      "establish-reserve",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--reserve-file",
      writeReserve(reserveDoc()),
      "--reserve-file",
      writeReserve(reserveDoc()),
    ]);
    expect(doubled.code).toBe(64);
  });
});
