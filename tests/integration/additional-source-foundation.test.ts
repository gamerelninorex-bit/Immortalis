/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw source documents */
// The additional pre-play finite Source Condition admission, end to end: a campaign whose ORIGINAL locality the shipped path already
// committed gains exactly ONE more World-State source fact — at version 1, under the owner's derived fields — and every earlier fact is
// left byte-identical. The shipped binary then reads it back from a separate ordinary process. Nothing here asserts a downstream
// perception, availability or extraction verdict.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { worldLocusKey, worldProfileKey, worldSourceConditionKey } from "@immortalis/contracts";
import { canonicalEqual } from "@immortalis/engine";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  SECOND_ACCESS,
  SECOND_AMOUNT,
  SECOND_KEY,
  SECOND_UNIT,
  WORLD_ID,
  addSource,
  headOf,
  localityCampaign,
  openOrdinary,
  runAdd,
  sourceDoc,
  writeSource,
} from "../support/additional-source.ts";
import { SOURCE_KEY } from "../support/locality.ts";

const phrase = (s: string) => /type exactly "([^"]+)"/.exec(s)![1]!;

describe("one confirmed additional source is added to an established original locality", () => {
  it("writes exactly the new key at version 1 and leaves the world, locus, first source and everything else byte-identical", async () => {
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

    const { result, terminal } = await addSource(dirs, writeSource(sourceDoc()));
    expect(result.status).toBe("ADDITIONAL_SOURCE_READY");
    expect(terminal.said.some((l) => l.startsWith("PROGRESS source COMMITTED"))).toBe(true);

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

      const key = worldSourceConditionKey(WORLD_ID, SECOND_KEY);
      const fact = after.store.getFact(key)!;
      expect(fact.owner).toBe("world_state");
      expect(fact.facet).toBe("world_source_condition");
      expect(fact.version).toBe(1);
      expect(fact.provenance.group_id).toMatch(/^operator-additional-source:[0-9a-f]{32}$/);
      const typed = after.sourceCondition(WORLD_ID, SECOND_KEY)!.value;
      expect(typed.depth).toBe("EXACT_FINITE");
      expect(typed.establishment.kind).toBe("INITIAL_SETTING_FACT");
      expect(typed.recoverable).toEqual({ amount: SECOND_AMOUNT, unit: SECOND_UNIT });
      expect(typed.delivered).toEqual([]);
      expect(typed.exhaustion).toBeNull();
      expect(typed.access_facts).toEqual([SECOND_ACCESS]);
      expect(typed.locality).toEqual({
        world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
        locus: { fact_key: worldLocusKey(WORLD_ID, LOCUS_ID), entity_id: LOCUS_ID },
      });
      // the first source is still whole and still the one the confirmed setup committed
      const first = after.sourceCondition(WORLD_ID, SOURCE_KEY)!;
      expect(first.fact.version).toBe(1);
      expect(first.value.recoverable.amount).toBe(120);
    } finally {
      await after.close();
    }
  });

  it("shows the whole source for one confirmation before anything is written, and writes nothing on a refusal to confirm", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addSource(dirs, writeSource(sourceDoc()), ["decline"]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const shown = terminal.said.join("\n");
    for (const part of [
      SECOND_KEY,
      `EXACT quantity: ${SECOND_AMOUNT} ${SECOND_UNIT}`,
      "grey-salt",
      SECOND_ACCESS.statement,
      "The second pan holds exactly 45 sacks of grey salt.",
      "grants nobody perception, knowledge or permission to extract",
    ])
      expect(shown, part).toContain(part);
    expect(terminal.said.filter((l) => l.startsWith("PROGRESS"))).toEqual([]);
  });

  it("repeating the same confirmed source is idempotent: verified and reported without a new console question or a new write", async () => {
    const dirs = await localityCampaign();
    const file = writeSource(sourceDoc());
    expect((await addSource(dirs, file)).result.status).toBe("ADDITIONAL_SOURCE_READY");
    const head = await headOf(dirs.campaignDir);

    const again = await addSource(dirs, file, []);
    expect(again.result.status).toBe("ADDITIONAL_SOURCE_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an altered source under the same identity is refused and nothing is replaced", async () => {
    const dirs = await localityCampaign();
    expect((await addSource(dirs, writeSource(sourceDoc()))).result.status).toBe(
      "ADDITIONAL_SOURCE_READY",
    );
    const head = await headOf(dirs.campaignDir);
    for (const change of [
      (d: any) => (d.quantity.amount = SECOND_AMOUNT + 1),
      (d: any) => (d.material_class = "red-salt"),
      (d: any) => (d.access_facts = [{ aspect: "terrain", statement: "A different access." }]),
      (d: any) => (d.statement = "A different statement."),
    ]) {
      const doc = sourceDoc();
      change(doc);
      const { result, terminal } = await addSource(dirs, writeSource(doc), []);
      expect(result.status).toBe("SOURCE_CONFLICT");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    }
  });

  it("a different campaign is isolated: its sources are unaffected", async () => {
    const one = await localityCampaign();
    const two = await localityCampaign();
    expect((await addSource(one, writeSource(sourceDoc()))).result.status).toBe(
      "ADDITIONAL_SOURCE_READY",
    );
    const other = await openOrdinary(two.campaignDir);
    try {
      expect(other.sourceCondition(WORLD_ID, SECOND_KEY)).toBeUndefined();
      expect(other.store.listFacts()).toHaveLength(3);
    } finally {
      await other.close();
    }
  });
});

describe("the shipped command as real processes", () => {
  it("establish-additional-source (process 1) → an ordinary reopen (process 2) reads the identical fact; a repeat (process 3) converges", async () => {
    const dirs = await localityCampaign();
    const file = writeSource(sourceDoc());

    const one = await runAdd(dirs, file, ["confirm"]);
    expect(one.stderr).toBe("");
    expect(one.code).toBe(0);
    expect(one.stdout).toContain("STATUS ADDITIONAL_SOURCE_READY");
    expect(phrase(one.stdout)).toMatch(/^establish-additional-source [0-9a-f]{12}$/);
    expect(one.stdout).toContain(
      `source: ${SECOND_KEY} EXACT_FINITE, established ${SECOND_AMOUNT} ${SECOND_UNIT} of grey-salt; recoverable now ${SECOND_AMOUNT} ${SECOND_UNIT}`,
    );
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);

    const read = await openOrdinary(dirs.campaignDir);
    expect(read.sourceCondition(WORLD_ID, SECOND_KEY)?.value.recoverable.amount).toBe(
      SECOND_AMOUNT,
    );
    await read.close();
    const head = await headOf(dirs.campaignDir);

    const three = await runAdd(dirs, file);
    expect(three.code).toBe(0);
    expect(three.stdout).toContain("STATUS ADDITIONAL_SOURCE_READY");
    expect(three.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a declined confirmation exits 2 and writes nothing", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const run = await runAdd(dirs, writeSource(sourceDoc()), ["decline"]);
    expect(run.code).toBe(2);
    expect(run.stdout).toContain("STATUS DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the command requires --source-file and refuses the options of other commands", async () => {
    const dirs = await localityCampaign();
    const bare = await runAdd(dirs, writeSource(sourceDoc()));
    expect(bare.code).toBe(2); // eof at the console: declined
    const missing = await (
      await import("../support/locality.ts")
    ).runShipped([
      "establish-additional-source",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
    ]);
    expect(missing.code).toBe(64);
    const foreign = await (
      await import("../support/locality.ts")
    ).runShipped([
      "establish-additional-source",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--source-file",
      writeSource(sourceDoc()),
      "--setup",
      "x",
    ]);
    expect(foreign.code).toBe(64);
  });
});
