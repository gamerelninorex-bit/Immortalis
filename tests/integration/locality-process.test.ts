// The SHIPPED command line (packages/operator/src/bin.ts, no owner extension, no fixture) as real processes: a confirmed ORIGINAL
// setup creates the standard campaign package; a SEPARATE ordinary process then opens it and reads the identical facts. The campaign
// is created by the processes below — nothing is seeded by a test, no history is synthesised, no fixture owner is registered.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { worldLocusKey, worldProfileKey, worldSourceConditionKey } from "@immortalis/contracts";
import {
  ACCESS,
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  SOURCE_AMOUNT,
  SOURCE_KEY,
  SOURCE_UNIT,
  WORLD_ID,
  establishArgs,
  freshDirs,
  headOf,
  openOrdinary,
  runShipped,
  setupDoc,
  statusArgs,
  writeSetup,
} from "../support/locality.ts";

const phrase = (s: string) => /type exactly "([^"]+)"/.exec(s)![1]!;

describe("the shipped command: a confirmed ORIGINAL setup creates the standard campaign, and a separate process reads it back", () => {
  it("establish-locality (process 1) → locality-status (process 2) → an ordinary open (process 3) reads the identical facts", async () => {
    const dirs = freshDirs();
    const file = writeSetup(setupDoc());
    expect(existsSync(dirs.campaignDir)).toBe(false);

    const one = await runShipped(establishArgs(dirs, file), ["confirm"]);
    expect(one.stderr).toBe("");
    expect(one.code).toBe(0);
    expect(one.stdout).toContain("STATUS LOCALITY_READY");
    expect(phrase(one.stdout)).toMatch(/^establish-locality [0-9a-f]{12}$/);
    // the three owner publications, in dependency order
    const order = [...one.stdout.matchAll(/PROGRESS (\w+) (COMMITTED|CREATED)/g)].map((m) => m[1]);
    expect(order).toEqual(["package", "world", "locus", "source"]);
    // everything the operator confirmed was shown to them first
    for (const shown of [
      "A quiet salt-marsh hamlet where the tide decides the day.",
      "Ashfall Marsh is an invented place",
      "The salt pans of Ashfall Marsh",
      `EXACT quantity: ${SOURCE_AMOUNT} ${SOURCE_UNIT}`,
      ACCESS.statement,
      "The first pan holds exactly 120 sacks of raw salt.",
      "grants nobody perception, knowledge or",
    ])
      expect(one.stdout.slice(0, one.stdout.indexOf("To confirm")), shown).toContain(shown);
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);
    expect(statSync(dirs.campaignDir).mode & 0o077).toBe(0);

    const two = await runShipped(statusArgs(dirs));
    expect(two.code).toBe(0);
    expect(two.stdout).toContain("STATUS LOCALITY_READY");
    expect(two.stdout).toContain(
      `source: ${SOURCE_KEY} EXACT_FINITE, established ${SOURCE_AMOUNT} ${SOURCE_UNIT} of raw-salt; recoverable now ${SOURCE_AMOUNT} ${SOURCE_UNIT}`,
    );

    // an ordinary process: the canonical owner registry only, no extension, no fixture history
    const campaign = await openOrdinary(dirs.campaignDir);
    expect(campaign.verify()).toEqual([]);
    expect(campaign.store.head()).toMatchObject({ campaign_id: LOCALITY_CAMPAIGN, revision: 3 });
    const facts = campaign.store.listFacts();
    expect(facts.map((f) => f.key).sort()).toEqual(
      [
        worldProfileKey(WORLD_ID),
        worldLocusKey(WORLD_ID, LOCUS_ID),
        worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
      ].sort(),
    );
    expect(facts.every((f) => f.owner === "world_state" && f.version === 1)).toBe(true);
    expect(facts.map((f) => f.facet).sort()).toEqual([
      "world_locus",
      "world_profile",
      "world_source_condition",
    ]);
    const doc = setupDoc();
    expect(campaign.world(WORLD_ID)!.value).toEqual(doc.world);
    expect(campaign.locus(WORLD_ID, LOCUS_ID)!.value).toEqual({
      locus_id: LOCUS_ID,
      world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
      designation: doc.locus.designation,
      constraints: [],
    });
    const source = campaign.sourceCondition(WORLD_ID, SOURCE_KEY)!.value;
    expect(source).toEqual({
      source_key: SOURCE_KEY,
      locality: {
        world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
        locus: { fact_key: worldLocusKey(WORLD_ID, LOCUS_ID), entity_id: LOCUS_ID },
      },
      dimension: "surface-crust",
      material_class: "raw-salt",
      depth: "EXACT_FINITE",
      establishment: {
        kind: "INITIAL_SETTING_FACT",
        statement: doc.source.statement,
        quantity: { amount: SOURCE_AMOUNT, unit: SOURCE_UNIT },
      },
      recoverable: { amount: SOURCE_AMOUNT, unit: SOURCE_UNIT },
      delivered: [],
      access_facts: [ACCESS],
      exhaustion: null,
    });
    // one canonical cause across the three publications; dependency edges world → locus → source
    const [w, l, s] = [
      campaign.world(WORLD_ID)!.fact,
      campaign.locus(WORLD_ID, LOCUS_ID)!.fact,
      campaign.sourceCondition(WORLD_ID, SOURCE_KEY)!.fact,
    ];
    expect(new Set([w, l, s].map((f) => f.provenance.cause)).size).toBe(1);
    expect(new Set([w, l, s].map((f) => f.provenance.group_id)).size).toBe(3);
    const lg = campaign.store.committedGroup(l.provenance.intent_id)!;
    const sg = campaign.store.committedGroup(s.provenance.intent_id)!;
    expect(lg.depends_on).toEqual([w.provenance.group_id]);
    expect([...sg.depends_on].sort()).toEqual(
      [w.provenance.group_id, l.provenance.group_id].sort(),
    );
    await campaign.close();

    // no actor, character, binding, time or history was created: the journal holds exactly the three groups
    const journal = readFileSync(join(dirs.campaignDir, "journal.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(journal).toHaveLength(3);
    expect(readdirSync(dirs.campaignDir).sort()).toEqual([
      "journal.jsonl",
      "manifest.json",
      "state.0000000003.json",
    ]);

    // the next ordinary process also opens it through the existing operator session
    const three = await runShipped([
      "status",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--operator-dir",
      dirs.operatorDir,
    ]);
    expect(three.code).toBe(0);
    expect(three.stdout).toContain("STATUS NO_CHOICE_RETAINED");
  }, 180_000);

  it("rerunning the same confirmed setup on the finished campaign verifies it and writes nothing, asking nothing", async () => {
    const dirs = freshDirs();
    const file = writeSetup(setupDoc());
    expect((await runShipped(establishArgs(dirs, file), ["confirm"])).code).toBe(0);
    const before = await headOf(dirs.campaignDir);
    const again = await runShipped(establishArgs(dirs, file));
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("STATUS LOCALITY_READY");
    expect(again.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 180_000);

  it("a declined, mistyped, pre-typed or absent confirmation creates nothing at all", async () => {
    const dirs = freshDirs();
    const file = writeSetup(setupDoc());
    const attempts = [
      await runShipped(establishArgs(dirs, file), ["decline"]),
      await runShipped(establishArgs(dirs, file), [{ raw: "establish-locality 000000000000" }]),
      await runShipped(establishArgs(dirs, file), [], {
        preTyped: "yes\nconfirm\nestablish-locality 000000000000\n",
      }),
      await runShipped(establishArgs(dirs, file), ["eof"]),
    ];
    for (const run of attempts) {
      expect(run.stdout).toContain("STATUS DECLINED");
      expect(run.code).toBe(2);
    }
    expect(existsSync(dirs.campaignDir)).toBe(false);
    expect(existsSync(dirs.operatorDir)).toBe(false);
  }, 180_000);

  it("refuses unsupported or over-claiming command lines before touching anything", async () => {
    const dirs = freshDirs();
    const file = writeSetup(setupDoc());
    const bad: string[][] = [
      establishArgs(dirs, file, ["--confirmed"]),
      establishArgs(dirs, file, ["--role", "role.archivist"]),
      establishArgs(dirs, file, ["--owner", "world_state"]),
      establishArgs(dirs, file, ["--quantity", "9"]),
      establishArgs(dirs, file, ["--setup", file]),
      establishArgs(dirs, file, ["extra"]),
      establishArgs(dirs, file).filter((a) => a !== "--campaign-id" && a !== LOCALITY_CAMPAIGN),
      establishArgs(dirs, file).filter((a) => a !== "--setup" && a !== file),
      ["locality-status", "--campaign", dirs.campaignDir, "--setup", file],
    ];
    for (const args of bad) {
      const run = await runShipped(args);
      expect(run.code, args.join(" ")).toBe(64);
      expect(run.stdout).toContain("usage:");
    }
    expect(existsSync(dirs.campaignDir)).toBe(false);
  }, 180_000);

  it("a different setup is refused for a finished campaign and the committed facts are untouched", async () => {
    const dirs = freshDirs();
    expect((await runShipped(establishArgs(dirs, writeSetup(setupDoc())), ["confirm"])).code).toBe(
      0,
    );
    const before = await headOf(dirs.campaignDir);
    const other = setupDoc();
    other.source.quantity.amount = 121;
    const run = await runShipped(establishArgs(dirs, writeSetup(other)), ["confirm"]);
    expect(run.stdout).toContain("STATUS SETUP_CONFLICT");
    expect(run.stdout).not.toContain("To confirm");
    expect(run.code).toBe(3);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 180_000);
});

describe("a process killed at each durable step converges on the uninterrupted campaign when the same setup is confirmed again", () => {
  const markers: [string, RegExp][] = [
    ["after the package is created", /PROGRESS package CREATED/],
    ["after the world commit", /PROGRESS world COMMITTED/],
    ["after the locus commit", /PROGRESS locus COMMITTED/],
    ["after the source commit, before the acknowledgement", /PROGRESS source COMMITTED/],
  ];
  for (const [name, killAfter] of markers) {
    it(`SIGKILL ${name}`, async () => {
      const dirs = freshDirs();
      const file = writeSetup(setupDoc());
      const reference = freshDirs();
      expect((await runShipped(establishArgs(reference, file), ["confirm"])).code).toBe(0);

      const killed = await runShipped(establishArgs(dirs, file), ["confirm"], { killAfter });
      expect(killed.signal).toBe("SIGKILL");
      // a kill while the package is open leaves its lock: refused until the operator explicitly reclaims it
      if (existsSync(join(dirs.campaignDir, "LOCK"))) {
        const locked = await runShipped(statusArgs(dirs));
        expect(locked.code).toBe(3);
        expect(locked.stdout).toContain("SESSION_UNAVAILABLE CAMPAIGN_UNAVAILABLE LOCKED");
      }

      // whatever the kill caught, a partially constructed campaign is never advertised as ready
      const state = await runShipped(statusArgs(dirs, ["--reclaim-stale-lock"]));
      if (state.stdout.includes("LOCALITY_READY")) expect(killAfter.source).toContain("source");
      else {
        expect(state.stdout).toContain("STATUS LOCALITY_INCOMPLETE");
        expect(state.code).toBe(3);
      }

      const resumed = await runShipped(establishArgs(dirs, file, ["--reclaim-stale-lock"]), [
        "confirm",
      ]);
      expect(resumed.stdout).toContain("STATUS LOCALITY_READY");
      expect(resumed.code).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(await headOf(reference.campaignDir));
      const c = await openOrdinary(dirs.campaignDir);
      expect(c.verify()).toEqual([]);
      expect(c.store.head().revision).toBe(3);
      await c.close();
    }, 180_000);
  }
});
