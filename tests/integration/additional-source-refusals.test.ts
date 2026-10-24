/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw source documents */
// Refusals of the additional pre-play finite source admission. Each case independently refutes a false success claim: the status is a
// refusal, the console is not asked where the refusal precedes the choice, and the campaign's head (revision, state and journal
// hashes) is exactly what it was — no owner write of any kind.
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { LocalOperatorSession } from "@immortalis/operator";
import { fixtureWorld, publication } from "@immortalis/testkit";
import {
  LOCALITY_CAMPAIGN,
  SECOND_KEY,
  WORLD_ID,
  addSource,
  bindPlayer,
  freshDirs,
  headOf,
  localityCampaign,
  openOrdinary,
  sourceDoc,
  writeSource,
} from "../support/additional-source.ts";
import { SOURCE_KEY } from "../support/locality.ts";

const without = (path: string[]) => (d: any) => {
  let o = d;
  for (const k of path.slice(0, -1)) o = o[k];
  delete o[path.at(-1)!];
};
const set = (path: string[], value: unknown) => (d: any) => {
  let o = d;
  for (const k of path.slice(0, -1)) o = o[k];
  o[path.at(-1)!] = value;
};

const invalid: [string, (d: any) => void][] = [
  ["no source key", without(["source_key"])],
  ["no world", without(["world_id"])],
  ["no locus", without(["locus_id"])],
  ["no dimension", without(["dimension"])],
  ["no material class", without(["material_class"])],
  ["no quantity", without(["quantity"])],
  ["no unit", without(["quantity", "unit"])],
  ["no access-facts array (required, never defaulted)", without(["access_facts"])],
  ["no physical access fact (this path's own eligibility)", set(["access_facts"], [])],
  ["no statement", without(["statement"])],
  ["an empty statement", set(["statement"], "")],
  ["a zero quantity", set(["quantity", "amount"], 0)],
  ["a negative quantity", set(["quantity", "amount"], -3)],
  ["a non-integer quantity", set(["quantity", "amount"], 2.5)],
  ["a string quantity", set(["quantity", "amount"], "45")],
  ["an unsafe-integer quantity", set(["quantity", "amount"], 2 ** 53)],
  ["a ranged quantity", set(["quantity"], { min: 40, max: 50, unit: "sack" })],
  ["an estimate field", set(["estimate"], { amount: 40, unit: "sack" })],
  ["a rate field", set(["rate"], 3)],
  ["a renewal field", set(["renewal"], "daily")],
  ["an owner field", set(["owner"], "world_state")],
  ["a facet field", set(["facet"], "world_source_condition")],
  ["a version field", set(["version"], 1)],
  ["a depth field", set(["depth"], "EXACT_FINITE")],
  ["a recoverable field", set(["recoverable"], { amount: 45, unit: "sack" })],
  ["a delivered field", set(["delivered"], [])],
  ["an establishment field", set(["establishment"], { kind: "INITIAL_SETTING_FACT" })],
  ["a confirmed claim", set(["confirmed"], true)],
  [
    "an unknown access-fact field",
    set(["access_facts"], [{ aspect: "terrain", statement: "On foot.", visible: true }]),
  ],
  [
    "duplicate access aspects (refused by the genuine owner path)",
    set(
      ["access_facts"],
      [
        { aspect: "terrain", statement: "On foot." },
        { aspect: "terrain", statement: "By boat." },
      ],
    ),
  ],
  ["a source key that is a key path", set(["source_key"], "src/salt")],
];

describe("an unauthored, over-claiming or ineligible source is refused before the console is asked", () => {
  for (const [name, mutate] of invalid)
    it(name, async () => {
      const dirs = await localityCampaign();
      const head = await headOf(dirs.campaignDir);
      const doc = sourceDoc();
      mutate(doc);
      const { result, terminal } = await addSource(dirs, writeSource(doc), []);
      expect(result.status).toBe("INVALID_SOURCE");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    });

  it("a source file that is not JSON, or is a list, or is empty", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    for (const text of ["{not json", "[]", "", "null", '"salt"']) {
      const { result, terminal } = await addSource(dirs, writeSource(text), []);
      expect(result.status, text).toBe("INVALID_SOURCE");
      expect(terminal.asked()).toBe(0);
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("an untrusted, unreadable, stale or tampered source file is refused", () => {
  it("a file others can write, a link, a directory, a missing file", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const writable = writeSource(sourceDoc(), 0o666);
    chmodSync(writable, 0o666);
    expect((await addSource(dirs, writable, [])).result.status).toBe("SOURCE_FILE_UNTRUSTED");

    const real = writeSource(sourceDoc());
    const link = join(dirname(real), "link.json");
    symlinkSync(real, link);
    expect((await addSource(dirs, link, [])).result.status).toBe("SOURCE_FILE_UNREADABLE");

    expect((await addSource(dirs, dirname(real), [])).result.status).toBe("SOURCE_FILE_UNTRUSTED");

    const gone = writeSource(sourceDoc());
    rmSync(gone);
    expect((await addSource(dirs, gone, [])).result.status).toBe("SOURCE_FILE_UNREADABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a file larger than a source can be", async () => {
    const dirs = await localityCampaign();
    const doc = sourceDoc();
    doc.statement = "x".repeat(70_000);
    const { result } = await addSource(dirs, writeSource(doc), []);
    expect(result.status).toBe("INVALID_SOURCE");
  });

  it("a file changed after it was read cannot change what was confirmed: the shown source is the committed source", async () => {
    const dirs = await localityCampaign();
    const file = writeSource(sourceDoc());
    const tampered = sourceDoc();
    tampered.quantity.amount = 9999;
    tampered.source_key = "src-tampered";
    const { result } = await addSource(dirs, file, [
      (challenge) => {
        writeFileSync(file, JSON.stringify(tampered));
        return challenge;
      },
    ]);
    expect(result.status).toBe("ADDITIONAL_SOURCE_READY");
    const campaign = await openOrdinary(dirs.campaignDir);
    try {
      expect(campaign.sourceCondition(WORLD_ID, SECOND_KEY)?.value.recoverable.amount).toBe(45);
      expect(campaign.sourceCondition(WORLD_ID, "src-tampered")).toBeUndefined();
    } finally {
      await campaign.close();
    }
  });
});

describe("no confirmed original locality, no package, a foreign package", () => {
  it("a package directory that does not exist is never created", async () => {
    const dirs = freshDirs();
    const { result } = await addSource(dirs, writeSource(sourceDoc()), []);
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(existsSync(dirs.campaignDir)).toBe(false);
  });

  it("another campaign identity is refused and nothing is written", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addSource(dirs, writeSource(sourceDoc()), [], {
      campaignId: "campaign-other",
    });
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  const bare = async (steps: "none" | "world") => {
    const dirs = freshDirs();
    mkdirSync(dirs.campaignDir, { recursive: true, mode: 0o700 });
    const created = await CanonicalCampaign.create(dirs.campaignDir, {
      campaignId: LOCALITY_CAMPAIGN,
      buildId: "additional-source-test",
    });
    if (!created.ok) throw new Error("create");
    if (steps === "world") {
      const w = await created.value.establishWorld({
        ...publication(1),
        world: fixtureWorld({ world_id: WORLD_ID }),
      });
      if (!w.ok) throw new Error("world");
    }
    await created.value.close();
    return dirs;
  };

  for (const steps of ["none", "world"] as const)
    it(`a campaign holding ${steps === "none" ? "nothing" : "only a world not committed by establish-locality"} is not an established locality`, async () => {
      const dirs = await bare(steps);
      const head = await headOf(dirs.campaignDir);
      const { result, terminal } = await addSource(dirs, writeSource(sourceDoc()), []);
      expect(result.status).toBe("LOCALITY_NOT_ESTABLISHED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    });

  it("a world carrying the locality identities but without its locus and source is not an established locality", async () => {
    const dirs = freshDirs();
    mkdirSync(dirs.campaignDir, { recursive: true, mode: 0o700 });
    const created = await CanonicalCampaign.create(dirs.campaignDir, {
      campaignId: LOCALITY_CAMPAIGN,
      buildId: "additional-source-test",
    });
    if (!created.ok) throw new Error("create");
    const id = "a".repeat(32);
    const w = await created.value.establishWorld({
      ...publication(1),
      group_id: `operator-locality:${id}:world`,
      intent_id: `operator-locality-intent:${id}:world`,
      world: fixtureWorld({ world_id: WORLD_ID }),
    });
    if (!w.ok) throw new Error("world");
    await created.value.close();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addSource(dirs, writeSource(sourceDoc()), []);
    expect(result.status).toBe("LOCALITY_NOT_ESTABLISHED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("a source that is not at the established locality, or duplicates a held key", () => {
  it.each([
    ["a foreign world", set(["world_id"], "world-other")],
    ["a foreign locus of the same world", set(["locus_id"], "locus-elsewhere")],
  ])("%s", async (_name, mutate) => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const doc = sourceDoc();
    mutate(doc);
    const { result, terminal } = await addSource(dirs, writeSource(doc), []);
    expect(result.status).toBe("SOURCE_NOT_AT_LOCALITY");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the key of the first source is a duplicate and the first source is not replaced", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const doc = sourceDoc();
    doc.source_key = SOURCE_KEY;
    const { result, terminal } = await addSource(dirs, writeSource(doc), []);
    expect(result.status).toBe("SOURCE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a second, different additional source is refused: this path admits one", async () => {
    const dirs = await localityCampaign();
    expect((await addSource(dirs, writeSource(sourceDoc()))).result.status).toBe(
      "ADDITIONAL_SOURCE_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const third = sourceDoc();
    third.source_key = "src-salt-pan-3";
    const { result, terminal } = await addSource(dirs, writeSource(third), []);
    expect(result.status).toBe("SOURCE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("the operator's confirmation is required and exact", () => {
  it.each([
    ["decline", "decline" as const],
    ["end of input", "eof" as const],
    ["a stale (previous prompt's) phrase", "stale" as const],
    [
      "another verb's phrase",
      (c: string) => c.replace("establish-additional-source", "establish-locality"),
    ],
    ["free text", () => "yes"],
    ["an empty line", () => ""],
  ])("%s writes nothing", async (_name, reply) => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addSource(dirs, writeSource(sourceDoc()), [reply as any]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const campaign = await openOrdinary(dirs.campaignDir);
    expect(campaign.sourceCondition(WORLD_ID, SECOND_KEY)).toBeUndefined();
    await campaign.close();
  });
});

describe("the campaign must still be at its pre-play setting", () => {
  it("a bound player character closes the path: refused with nothing written", async () => {
    const dirs = await localityCampaign();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addSource(dirs, writeSource(sourceDoc()), []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an established source that World-State has since advanced closes the path: refused with nothing written", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const open = LocalOperatorSession.open;
    vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
      const opened = await open.call(LocalOperatorSession, p);
      if (opened.ok) {
        const store = opened.value.campaign.store;
        const getFact = store.getFact.bind(store);
        vi.spyOn(store, "getFact").mockImplementation((key: string) => {
          const f = getFact(key);
          return f && f.key.endsWith(`/source/${SOURCE_KEY}`) ? { ...f, version: 2 } : f;
        });
        const listFacts = store.listFacts.bind(store);
        vi.spyOn(store, "listFacts").mockImplementation(() =>
          listFacts().map((f) =>
            f.key.endsWith(`/source/${SOURCE_KEY}`) ? { ...f, version: 2 } : f,
          ),
        );
      }
      return opened;
    });
    const { result, terminal } = await addSource(dirs, writeSource(sourceDoc()), []);
    vi.restoreAllMocks();
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});
