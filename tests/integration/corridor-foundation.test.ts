// The source-qualified local corridor, end to end: a campaign whose ORIGINAL locality and one additional locus the shipped paths already
// committed gains exactly ONE more World-State fact — a directed corridor between the two loci, at version 1 under the owner's derived
// references, from one explicit typed confirmation — and every earlier fact is left byte-identical. The shipped binary reads it back from
// a separate ordinary process. Nothing here asserts a downstream movement, route calibration, travel time, access, availability or
// delivery verdict.
import { describe, expect, it } from "vitest";
import { worldCorridorKey, worldLocusKey, worldProfileKey } from "@immortalis/contracts";
import { canonicalEqual } from "@immortalis/engine";
import { runShipped } from "../support/locality.ts";
import {
  CORRIDOR_STATEMENT_TEXT,
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  NEW_LOCUS_ID,
  WORLD_ID,
  addCorridor,
  corridorArgs,
  corridorDoc,
  headOf,
  openOrdinary,
  runCorridor,
  twoLociCampaign,
  writeCorridor,
} from "../support/corridor.ts";

const phrase = (s: string) => /type exactly "([^"]+)"/.exec(s)![1]!;
const KEY = worldCorridorKey(WORLD_ID, LOCUS_ID, NEW_LOCUS_ID);

describe("one confirmed corridor is added between two established loci", () => {
  it("writes exactly the corridor at version 1 and leaves the world, both loci, the sources and everything else byte-identical", async () => {
    const dirs = await twoLociCampaign();
    const before = await openOrdinary(dirs.campaignDir);
    const factsBefore = before.store.listFacts();
    const headBefore = before.store.head();
    await before.close();
    expect(factsBefore.map((f) => f.key).sort()).toEqual(
      [
        worldProfileKey(WORLD_ID),
        worldLocusKey(WORLD_ID, LOCUS_ID),
        worldLocusKey(WORLD_ID, NEW_LOCUS_ID),
        `world/${WORLD_ID}/source/src-salt-pan-1`,
        `world/${WORLD_ID}/source/src-blue-clay-1`,
      ].sort(),
    );

    const { result, terminal } = await addCorridor(dirs, writeCorridor(corridorDoc()));
    expect(result.status, JSON.stringify(result.details)).toBe("CORRIDOR_READY");
    expect(terminal.said.filter((l) => l.startsWith("PROGRESS"))).toEqual([
      `PROGRESS corridor COMMITTED ${KEY}`,
    ]);
    expect(terminal.asked()).toBe(1);

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
      expect(
        factsAfter.filter((f) => !factsBefore.some((b) => b.key === f.key)).map((f) => f.key),
      ).toEqual([KEY]);

      const corridor = after.corridor(WORLD_ID, LOCUS_ID, NEW_LOCUS_ID)!;
      expect(corridor.fact.owner).toBe("world_state");
      expect(corridor.fact.facet).toBe("world_locus");
      expect(corridor.fact.version).toBe(1);
      expect(corridor.fact.provenance.group_id).toMatch(/^operator-corridor:[0-9a-f]{32}$/);
      expect(corridor.fact.provenance.intent_id).toMatch(/^operator-corridor-intent:[0-9a-f]{32}$/);
      expect(corridor.value).toEqual({
        world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
        from: { fact_key: worldLocusKey(WORLD_ID, LOCUS_ID), entity_id: LOCUS_ID },
        to: { fact_key: worldLocusKey(WORLD_ID, NEW_LOCUS_ID), entity_id: NEW_LOCUS_ID },
        statement: CORRIDOR_STATEMENT_TEXT,
      });
      // the connection is directed: nothing is inferred in the other direction
      expect(after.corridor(WORLD_ID, NEW_LOCUS_ID, LOCUS_ID)).toBeUndefined();
      // no time, request, entity, commitment or character exists because of it
      expect(
        factsAfter
          .map((f) => f.key)
          .filter((k) =>
            /logistics|production|economy|temporal|pc\/|role-registry|synthetic/.test(k),
          ),
      ).toEqual([]);
    } finally {
      await after.close();
    }
  });

  it("the facts are exactly the five before and the one new corridor key: no route, edge, distance, duration, actor or binding appears", async () => {
    const dirs = await twoLociCampaign();
    expect((await addCorridor(dirs, writeCorridor(corridorDoc()))).result.status).toBe(
      "CORRIDOR_READY",
    );
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const keys = c.store.listFacts().map((f) => f.key);
      expect(keys.filter((k) => !k.startsWith(`world/${WORLD_ID}/`))).toEqual([]);
      expect(keys.filter((k) => /\/corridor\//.test(k))).toEqual([KEY]);
      expect(
        keys.filter((k) => /route|edge|path|distance|travel|duration|actor|binding/i.test(k)),
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

  it("shows the whole connection for one confirmation before anything is written, and writes nothing on a refusal to confirm", async () => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addCorridor(dirs, writeCorridor(corridorDoc()), ["decline"]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const shown = terminal.said.join("\n");
    for (const part of [
      WORLD_ID,
      `FROM locus: ${LOCUS_ID}`,
      `TO   locus: ${NEW_LOCUS_ID}`,
      CORRIDOR_STATEMENT_TEXT,
      "DIRECTED connection",
      "states no distance, travel time, speed",
      "NO reverse corridor",
      "no route calibration",
      "moves and requests nothing",
      "supplies neither",
    ])
      expect(shown, part).toContain(part);
    expect(terminal.said.filter((l) => l.startsWith("PROGRESS"))).toEqual([]);
    const c = await openOrdinary(dirs.campaignDir);
    expect(c.corridor(WORLD_ID, LOCUS_ID, NEW_LOCUS_ID)).toBeUndefined();
    await c.close();
  });

  it("the shown authored text is JSON-quoted, so a control sequence in the statement cannot rewrite the console", async () => {
    const dirs = await twoLociCampaign();
    const doc = corridorDoc();
    doc.corridor.statement = "a road\u001b[2J\nSTATUS CORRIDOR_READY";
    const { result, terminal } = await addCorridor(dirs, writeCorridor(doc), ["decline"]);
    expect(result.status).toBe("DECLINED");
    const shown = terminal.said.join("\n");
    expect(shown).not.toContain("\u001b");
    expect(shown).toContain(JSON.stringify(doc.corridor.statement));
    expect(shown.split("\n").some((l) => l.startsWith("STATUS "))).toBe(false);
  });

  it("repeating the same confirmed proposal is idempotent: verified and reported without a new console question or a new write", async () => {
    const dirs = await twoLociCampaign();
    const file = writeCorridor(corridorDoc());
    expect((await addCorridor(dirs, file)).result.status).toBe("CORRIDOR_READY");
    const head = await headOf(dirs.campaignDir);
    const again = await addCorridor(dirs, file, []);
    expect(again.result.status).toBe("CORRIDOR_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an altered corridor for the same ordered pair is refused and nothing is replaced", async () => {
    const dirs = await twoLociCampaign();
    expect((await addCorridor(dirs, writeCorridor(corridorDoc()))).result.status).toBe(
      "CORRIDOR_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const doc = corridorDoc();
    doc.corridor.statement = "A different road.";
    const { result, terminal } = await addCorridor(dirs, writeCorridor(doc), []);
    expect(result.status).toBe("CORRIDOR_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the reverse connection is a separate fact admitted only by its own authoring and confirmation, and leaves the forward one untouched", async () => {
    const dirs = await twoLociCampaign();
    const file = writeCorridor(corridorDoc());
    expect((await addCorridor(dirs, file)).result.status).toBe("CORRIDOR_READY");
    const forward = await openOrdinary(dirs.campaignDir);
    const forwardFact = forward.store.getFact(KEY)!;
    await forward.close();

    const reverse = corridorDoc();
    reverse.corridor.from_locus_id = NEW_LOCUS_ID;
    reverse.corridor.to_locus_id = LOCUS_ID;
    reverse.corridor.statement = "The steep way back over the dyke.";
    const { result, terminal } = await addCorridor(dirs, writeCorridor(reverse));
    expect(result.status, JSON.stringify(result.details)).toBe("CORRIDOR_READY");
    expect(terminal.asked()).toBe(1);
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.corridor(WORLD_ID, NEW_LOCUS_ID, LOCUS_ID)!.value.statement).toBe(
        "The steep way back over the dyke.",
      );
      expect(canonicalEqual(c.store.getFact(KEY), forwardFact)).toBe(true);
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  });

  it("a different campaign is isolated: its facts are unaffected", async () => {
    const one = await twoLociCampaign();
    const two = await twoLociCampaign();
    expect((await addCorridor(one, writeCorridor(corridorDoc()))).result.status).toBe(
      "CORRIDOR_READY",
    );
    const other = await openOrdinary(two.campaignDir);
    try {
      expect(other.corridor(WORLD_ID, LOCUS_ID, NEW_LOCUS_ID)).toBeUndefined();
      expect(other.store.listFacts()).toHaveLength(5);
    } finally {
      await other.close();
    }
  });
});

describe("the shipped binary, as real processes", () => {
  it("confirms at a real console, exits 0, and a separate process reads the same corridor back", async () => {
    const dirs = await twoLociCampaign();
    const file = writeCorridor(corridorDoc());
    const run = await runCorridor(dirs, file, ["confirm"]);
    expect(run.code, run.stderr).toBe(0);
    expect(run.stdout).toContain("STATUS CORRIDOR_READY");
    expect(run.stdout).toContain(`PROGRESS corridor COMMITTED ${KEY}`);
    expect(run.stdout).toContain(
      "CONFIRMATION — ONE PHYSICAL CORRIDOR BETWEEN TWO ESTABLISHED LOCI",
    );
    expect(run.stdout).toContain("OOC DEVELOPMENT / SCENARIO INSTRUMENTATION");

    // a separate, second process verifies it again without asking
    const again = await runCorridor(dirs, file, []);
    expect(again.code, again.stderr).toBe(0);
    expect(again.stdout).toContain("STATUS CORRIDOR_READY");
    expect(again.stdout).not.toContain("To confirm, type exactly");
    const c = await openOrdinary(dirs.campaignDir);
    expect(c.corridor(WORLD_ID, LOCUS_ID, NEW_LOCUS_ID)).toBeDefined();
    await c.close();
  });

  it("a declined confirmation exits 2 and writes nothing; end of input also declines", async () => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const file = writeCorridor(corridorDoc());
    const declined = await runCorridor(dirs, file, ["decline"]);
    expect(declined.code).toBe(2);
    expect(declined.stdout).toContain("STATUS DECLINED");
    const eof = await runCorridor(dirs, file, ["eof"]);
    expect(eof.code).toBe(2);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a confirmation typed before the challenge existed cannot match it", async () => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const file = writeCorridor(corridorDoc());
    const first = await runCorridor(dirs, file, ["decline"]);
    const old = phrase(first.stdout);
    expect(old).toMatch(/^establish-corridor [0-9a-f]{12}$/);
    const replay = await runShipped(corridorArgs(dirs, file), [], { preTyped: `${old}\n` });
    expect(replay.code).not.toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the usage names the command and its one file option, and the command accepts nothing else", async () => {
    const dirs = await twoLociCampaign();
    const file = writeCorridor(corridorDoc());
    const extra = await runShipped(corridorArgs(dirs, file, ["--world", WORLD_ID]), []);
    expect(extra.code).toBe(64);
    expect(extra.stdout).toContain(
      "establish-corridor --campaign <dir> --campaign-id <id> --corridor-file <file>",
    );
    const none = await runShipped(
      [
        "establish-corridor",
        "--campaign",
        dirs.campaignDir,
        "--campaign-id",
        LOCALITY_CAMPAIGN,
        "--operator-dir",
        dirs.operatorDir,
      ],
      [],
    );
    expect(none.code).not.toBe(0);
  });
});
