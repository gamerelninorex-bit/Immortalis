/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw locality documents */
// The additional pre-play locality with one finite source, end to end: a campaign whose ORIGINAL locality the shipped path already
// committed gains exactly TWO more World-State facts — a distinct locus and a source at it, each at version 1 under the owner's derived
// fields, published locus first — and every earlier fact is left byte-identical. The shipped binary then reads it back from a separate
// ordinary process. Nothing here asserts a downstream movement, route, perception, availability or extraction verdict.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { worldLocusKey, worldProfileKey, worldSourceConditionKey } from "@immortalis/contracts";
import { canonicalEqual } from "@immortalis/engine";
import { sourceScene } from "../support/source-observation.ts";
import { establishLocus, locusConsole } from "../support/original-pc-locus.ts";
import {
  STANDARD,
  author,
  localityCampaign as boundBase,
  plainPolicy,
  respondingConsole,
} from "../support/original-pc.ts";
import { establishTime, observe } from "../support/observation.ts";
import { runShipped, statusArgs } from "../support/locality.ts";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  NEW_ACCESS,
  NEW_AMOUNT,
  NEW_CONSTRAINT,
  NEW_DESIGNATION,
  NEW_LOCUS_ID,
  NEW_SOURCE_KEY,
  NEW_UNIT,
  SOURCE_KEY,
  WORLD_ID,
  addLocality,
  headOf,
  localityCampaign,
  localityDoc,
  openOrdinary,
  runLocality,
  sourceDoc,
  writeLocality,
  writeSource,
} from "../support/additional-locality.ts";
import { addSource } from "../support/additional-source.ts";

const phrase = (s: string) => /type exactly "([^"]+)"/.exec(s)![1]!;

describe("one confirmed additional locus with its source is added to an established original locality", () => {
  it("writes exactly the locus and then the source at version 1 and leaves the world, first locus, first source and everything else byte-identical", async () => {
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

    const { result, terminal } = await addLocality(dirs, writeLocality(localityDoc()));
    expect(result.status, JSON.stringify(result.details)).toBe("ADDITIONAL_LOCALITY_READY");
    const progress = terminal.said.filter((l) => l.startsWith("PROGRESS"));
    expect(progress).toEqual([
      `PROGRESS locus COMMITTED ${worldLocusKey(WORLD_ID, NEW_LOCUS_ID)}`,
      `PROGRESS source COMMITTED ${worldSourceConditionKey(WORLD_ID, NEW_SOURCE_KEY)}`,
    ]);
    expect(terminal.asked()).toBe(1);

    // an ordinary reopen, as any other normal process would
    const after = await openOrdinary(dirs.campaignDir);
    try {
      expect(after.verify()).toEqual([]);
      const head = after.store.head();
      expect(head.campaign_id).toBe(LOCALITY_CAMPAIGN);
      expect(head.revision).toBe(headBefore.revision + 2);
      const factsAfter = after.store.listFacts();
      expect(factsAfter).toHaveLength(factsBefore.length + 2);
      for (const f of factsBefore) expect(canonicalEqual(f, after.store.getFact(f.key))).toBe(true);
      expect(
        factsAfter
          .filter((f) => !factsBefore.some((b) => b.key === f.key))
          .map((f) => f.key)
          .sort(),
      ).toEqual(
        [
          worldLocusKey(WORLD_ID, NEW_LOCUS_ID),
          worldSourceConditionKey(WORLD_ID, NEW_SOURCE_KEY),
        ].sort(),
      );

      const locus = after.locus(WORLD_ID, NEW_LOCUS_ID)!;
      expect(locus.fact.owner).toBe("world_state");
      expect(locus.fact.facet).toBe("world_locus");
      expect(locus.fact.version).toBe(1);
      expect(locus.fact.provenance.group_id).toMatch(
        /^operator-additional-locality:[0-9a-f]{32}:locus$/,
      );
      expect(locus.value).toEqual({
        locus_id: NEW_LOCUS_ID,
        world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
        designation: NEW_DESIGNATION,
        constraints: [NEW_CONSTRAINT],
      });

      const source = after.sourceCondition(WORLD_ID, NEW_SOURCE_KEY)!;
      expect(source.fact.owner).toBe("world_state");
      expect(source.fact.facet).toBe("world_source_condition");
      expect(source.fact.version).toBe(1);
      expect(source.fact.provenance.group_id).toMatch(
        /^operator-additional-locality:[0-9a-f]{32}:source$/,
      );
      expect(source.value.depth).toBe("EXACT_FINITE");
      expect(source.value.establishment.kind).toBe("INITIAL_SETTING_FACT");
      expect(source.value.recoverable).toEqual({ amount: NEW_AMOUNT, unit: NEW_UNIT });
      expect(source.value.delivered).toEqual([]);
      expect(source.value.exhaustion).toBeNull();
      expect(source.value.access_facts).toEqual([NEW_ACCESS]);
      // the source is at the NEW locus, not the first one
      expect(source.value.locality).toEqual({
        world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
        locus: { fact_key: worldLocusKey(WORLD_ID, NEW_LOCUS_ID), entity_id: NEW_LOCUS_ID },
      });
      // the first source is still whole, still at the first locus, and still the one the confirmed setup committed
      const first = after.sourceCondition(WORLD_ID, SOURCE_KEY)!;
      expect(first.fact.version).toBe(1);
      expect(first.value.recoverable.amount).toBe(120);
      expect(first.value.locality.locus.entity_id).toBe(LOCUS_ID);
    } finally {
      await after.close();
    }
  });

  it("creates no route, edge, distance, time, actor or binding between the two loci: the facts are exactly the two new keys", async () => {
    const dirs = await localityCampaign();
    expect((await addLocality(dirs, writeLocality(localityDoc()))).result.status).toBe(
      "ADDITIONAL_LOCALITY_READY",
    );
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const keys = c.store.listFacts().map((f) => f.key);
      expect(keys.filter((k) => !k.startsWith(`world/${WORLD_ID}/`))).toEqual([]);
      expect(
        keys.filter((k) => /route|edge|path|distance|travel|time|actor|binding/i.test(k)),
      ).toEqual([]);
      expect(new Set(c.store.listFacts().map((f) => `${f.owner}/${f.facet}`))).toEqual(
        new Set([
          "world_state/world_profile",
          "world_state/world_locus",
          "world_state/world_source_condition",
        ]),
      );
    } finally {
      await c.close();
    }
  });

  it("shows the whole proposal for one confirmation before anything is written, and writes nothing on a refusal to confirm", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addLocality(dirs, writeLocality(localityDoc()), ["decline"]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const shown = terminal.said.join("\n");
    for (const part of [
      NEW_LOCUS_ID,
      NEW_DESIGNATION,
      NEW_CONSTRAINT.statement,
      NEW_SOURCE_KEY,
      `EXACT quantity: ${NEW_AMOUNT} ${NEW_UNIT}`,
      "blue-clay",
      NEW_ACCESS.statement,
      "The clay bank holds exactly 30 baskets of blue clay.",
      "locus → source",
      "route, corridor, distance or travel",
      "grants nobody perception, knowledge or permission to extract",
    ])
      expect(shown, part).toContain(part);
    expect(terminal.said.filter((l) => l.startsWith("PROGRESS"))).toEqual([]);
  });

  it("repeating the same confirmed proposal is idempotent: verified and reported without a new console question or a new write", async () => {
    const dirs = await localityCampaign();
    const file = writeLocality(localityDoc());
    expect((await addLocality(dirs, file)).result.status).toBe("ADDITIONAL_LOCALITY_READY");
    const head = await headOf(dirs.campaignDir);

    const again = await addLocality(dirs, file, []);
    expect(again.result.status).toBe("ADDITIONAL_LOCALITY_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an altered proposal under the same keys is refused and nothing is replaced", async () => {
    const dirs = await localityCampaign();
    expect((await addLocality(dirs, writeLocality(localityDoc()))).result.status).toBe(
      "ADDITIONAL_LOCALITY_READY",
    );
    const head = await headOf(dirs.campaignDir);
    for (const change of [
      (d: any) => (d.locus.designation = "A different place"),
      (d: any) => (d.locus.constraints = []),
      (d: any) => (d.source.quantity.amount = NEW_AMOUNT + 1),
      (d: any) => (d.source.material_class = "red-clay"),
      (d: any) =>
        (d.source.access_facts = [{ aspect: "terrain", statement: "A different access." }]),
      (d: any) => (d.source.statement = "A different statement."),
    ]) {
      const doc = localityDoc();
      change(doc);
      const { result, terminal } = await addLocality(dirs, writeLocality(doc), []);
      expect(result.status).toBe("LOCALITY_CONFLICT");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    }
  });

  it("a different campaign is isolated: its facts are unaffected", async () => {
    const one = await localityCampaign();
    const two = await localityCampaign();
    expect((await addLocality(one, writeLocality(localityDoc()))).result.status).toBe(
      "ADDITIONAL_LOCALITY_READY",
    );
    const other = await openOrdinary(two.campaignDir);
    try {
      expect(other.locus(WORLD_ID, NEW_LOCUS_ID)).toBeUndefined();
      expect(other.sourceCondition(WORLD_ID, NEW_SOURCE_KEY)).toBeUndefined();
      expect(other.store.listFacts()).toHaveLength(3);
    } finally {
      await other.close();
    }
  });

  it("an earlier additional source (establish-additional-source) at the first locus is preserved byte for byte beside the new pair", async () => {
    const dirs = await localityCampaign();
    expect((await addSource(dirs, writeSource(sourceDoc()))).result.status).toBe(
      "ADDITIONAL_SOURCE_READY",
    );
    const before = await openOrdinary(dirs.campaignDir);
    const factsBefore = before.store.listFacts();
    await before.close();
    expect(factsBefore).toHaveLength(4);

    const { result } = await addLocality(dirs, writeLocality(localityDoc()));
    expect(result.status, JSON.stringify(result.details)).toBe("ADDITIONAL_LOCALITY_READY");
    const after = await openOrdinary(dirs.campaignDir);
    try {
      expect(after.store.listFacts()).toHaveLength(6);
      for (const f of factsBefore) expect(canonicalEqual(f, after.store.getFact(f.key))).toBe(true);
    } finally {
      await after.close();
    }
  });

  it("the command places no arbitrary global restriction on lawful distinct keys: a further distinct locus and source is admitted the same way", async () => {
    const dirs = await localityCampaign();
    expect((await addLocality(dirs, writeLocality(localityDoc()))).result.status).toBe(
      "ADDITIONAL_LOCALITY_READY",
    );
    const third = localityDoc();
    third.locus.locus_id = "locus-north-dyke";
    third.source.locus_id = "locus-north-dyke";
    third.source.source_key = "src-dyke-stone-1";
    const { result } = await addLocality(dirs, writeLocality(third));
    expect(result.status, JSON.stringify(result.details)).toBe("ADDITIONAL_LOCALITY_READY");
    const after = await openOrdinary(dirs.campaignDir);
    try {
      expect(after.verify()).toEqual([]);
      expect(after.store.listFacts()).toHaveLength(7);
      expect(after.locus(WORLD_ID, NEW_LOCUS_ID)?.fact.version).toBe(1);
      expect(after.locus(WORLD_ID, "locus-north-dyke")?.fact.version).toBe(1);
    } finally {
      await after.close();
    }
  }, 60_000);

  it("establish-locality's own status for the campaign is unchanged: the first locality is still the one confirmed setup", async () => {
    const dirs = await localityCampaign();
    expect((await addLocality(dirs, writeLocality(localityDoc()))).result.status).toBe(
      "ADDITIONAL_LOCALITY_READY",
    );
    const run = await runShipped(statusArgs(dirs));
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("STATUS LOCALITY_READY");
    expect(run.stdout).toContain(worldLocusKey(WORLD_ID, LOCUS_ID));
    expect(run.stdout).not.toContain(NEW_LOCUS_ID);
  });
});

describe("the shipped command as real processes", () => {
  it("establish-additional-locality (process 1) → an ordinary reopen (process 2) reads the identical facts; a repeat (process 3) converges", async () => {
    const dirs = await localityCampaign();
    const file = writeLocality(localityDoc());

    const one = await runLocality(dirs, file, ["confirm"]);
    expect(one.stderr).toBe("");
    expect(one.code).toBe(0);
    expect(one.stdout).toContain("STATUS ADDITIONAL_LOCALITY_READY");
    expect(phrase(one.stdout)).toMatch(/^establish-additional-locality [0-9a-f]{12}$/);
    expect(one.stdout).toContain(
      `source: ${NEW_SOURCE_KEY} EXACT_FINITE, established ${NEW_AMOUNT} ${NEW_UNIT} of blue-clay; recoverable now ${NEW_AMOUNT} ${NEW_UNIT}`,
    );
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);

    const read = await openOrdinary(dirs.campaignDir);
    expect(read.locus(WORLD_ID, NEW_LOCUS_ID)?.value.designation).toBe(NEW_DESIGNATION);
    expect(read.sourceCondition(WORLD_ID, NEW_SOURCE_KEY)?.value.recoverable.amount).toBe(
      NEW_AMOUNT,
    );
    await read.close();
    const head = await headOf(dirs.campaignDir);

    const three = await runLocality(dirs, file);
    expect(three.code).toBe(0);
    expect(three.stdout).toContain("STATUS ADDITIONAL_LOCALITY_READY");
    expect(three.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a declined confirmation exits 2 and writes nothing", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const run = await runLocality(dirs, writeLocality(localityDoc()), ["decline"]);
    expect(run.code).toBe(2);
    expect(run.stdout).toContain("STATUS DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the command requires --locality-file and refuses the options of other commands", async () => {
    const dirs = await localityCampaign();
    const missing = await runShipped([
      "establish-additional-locality",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
    ]);
    expect(missing.code).toBe(64);
    for (const other of ["--setup", "--source-file"]) {
      const foreign = await runShipped([
        "establish-additional-locality",
        "--campaign",
        dirs.campaignDir,
        "--campaign-id",
        LOCALITY_CAMPAIGN,
        "--locality-file",
        writeLocality(localityDoc()),
        other,
        "x",
      ]);
      expect(foreign.code, other).toBe(64);
    }
  });
});

describe("downstream boundary: the new source is not co-located with a character at the first locus", () => {
  it("a bound, physically placed original PC at the first locus cannot name the source at the new locus: refused, host never asked, nothing written", async () => {
    // the pair is admitted while the campaign is still pre-play; the character is authored and placed afterwards through the shipped paths
    const dirs = await boundBase(sourceScene());
    const added = await addLocality(dirs, writeLocality(localityDoc()));
    expect(added.result.status, JSON.stringify(added.result.details)).toBe(
      "ADDITIONAL_LOCALITY_READY",
    );
    const authored = await author(dirs, respondingConsole(STANDARD), {}, plainPolicy);
    expect(authored.result.status, JSON.stringify(authored.result.details)).toBe("CHARACTER_BOUND");
    const located = await establishLocus(dirs, locusConsole());
    expect(located.result.status).toBe("LOCUS_ESTABLISHED");
    await establishTime(dirs);

    const read = async () => {
      const c = await openOrdinary(dirs.campaignDir);
      try {
        const h = c.store.head();
        return { revision: h.revision, state: h.state_sha256, journal: h.journal_head_sha256 };
      } finally {
        await c.close();
      }
    };
    const before = await read();
    const asked: unknown[] = [];
    const absent = await observe(dirs, undefined, { sourceKey: "src-does-not-exist" }, (doc) => {
      asked.push(doc);
      return plainPolicy(doc);
    });
    const elsewhere = await observe(dirs, undefined, { sourceKey: NEW_SOURCE_KEY }, (doc) => {
      asked.push(doc);
      return plainPolicy(doc);
    });
    expect(elsewhere.result.status).toBe("OBSERVATION_NOT_AVAILABLE");
    // no detail distinguishes a source at another locus from an absent one
    expect(JSON.stringify(elsewhere.result)).toBe(JSON.stringify(absent.result));
    expect(elsewhere.terminal.asked()).toBe(0);
    expect(asked.filter((d: any) => d["operation"] === "F014D_DIRECT_PERCEPTION")).toEqual([]);
    expect(await read()).toEqual(before);
  }, 120_000);
});
