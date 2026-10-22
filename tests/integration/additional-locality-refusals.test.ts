/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw locality documents */
// Refusals of the additional pre-play locality with one finite source. Each case independently refutes a false success claim: the status
// is a refusal, the console is not asked where the refusal precedes the choice, and the campaign's head (revision, state and journal
// hashes) is exactly what it was — no owner write of any kind, and in particular never a locus without its source or a source without
// its locus.
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { LocalOperatorSession } from "@immortalis/operator";
import { fixtureWorld, publication } from "@immortalis/testkit";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  NEW_LOCUS_ID,
  NEW_SOURCE_KEY,
  SOURCE_KEY,
  WORLD_ID,
  addLocality,
  bindPlayer,
  freshDirs,
  headOf,
  localityCampaign,
  localityDoc,
  openOrdinary,
  sourceDoc,
  writeLocality,
  writeSource,
} from "../support/additional-locality.ts";
import { addSource } from "../support/additional-source.ts";

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
  ["no format", without(["format"])],
  ["another format", set(["format"], "immortalis-original-locality-setup")],
  ["another format version", set(["format_version"], 2)],
  ["no locus section", without(["locus"])],
  ["no source section", without(["source"])],
  ["a top-level extra field", set(["route"], { from: "locus-salt-pans", to: "locus-reed-flats" })],
  ["a world section (this command creates no world)", set(["world"], { world_id: "w" })],
  ["no locus id", without(["locus", "locus_id"])],
  ["no locus world", without(["locus", "world_id"])],
  ["no designation", without(["locus", "designation"])],
  ["an empty designation", set(["locus", "designation"], "")],
  ["no constraints array (required, never defaulted)", without(["locus", "constraints"])],
  ["a locus id that is a key path", set(["locus", "locus_id"], "locus/reed")],
  ["a route field on the locus", set(["locus", "route"], "plank walk to the first pan")],
  ["a distance field on the locus", set(["locus", "distance"], { amount: 3, unit: "pace" })],
  ["a travel-duration field on the locus", set(["locus", "travel_duration"], 2)],
  ["an edge field on the locus", set(["locus", "edges"], ["locus-salt-pans"])],
  ["an owner field on the locus", set(["locus", "owner"], "world_state")],
  ["a version field on the locus", set(["locus", "version"], 1)],
  ["a world reference on the locus (derived, never authored)", set(["locus", "world"], {})],
  [
    "an unknown constraint field",
    set(["locus", "constraints"], [{ aspect: "ground", statement: "Silt.", visible: true }]),
  ],
  ["a source key that is a key path", set(["source", "source_key"], "src/clay")],
  ["no source key", without(["source", "source_key"])],
  ["no dimension", without(["source", "dimension"])],
  ["no material class", without(["source", "material_class"])],
  ["no quantity", without(["source", "quantity"])],
  ["no unit", without(["source", "quantity", "unit"])],
  ["no access-facts array (required, never defaulted)", without(["source", "access_facts"])],
  ["no physical access fact (this path's own eligibility)", set(["source", "access_facts"], [])],
  ["no statement", without(["source", "statement"])],
  ["a zero quantity", set(["source", "quantity", "amount"], 0)],
  ["a negative quantity", set(["source", "quantity", "amount"], -3)],
  ["a non-integer quantity", set(["source", "quantity", "amount"], 2.5)],
  ["a string quantity", set(["source", "quantity", "amount"], "30")],
  ["an unsafe-integer quantity", set(["source", "quantity", "amount"], 2 ** 53)],
  ["a non-finite quantity", set(["source", "quantity", "amount"], null)],
  ["a ranged quantity", set(["source", "quantity"], { min: 20, max: 40, unit: "basket" })],
  ["an estimate field", set(["source", "estimate"], { amount: 30, unit: "basket" })],
  ["a rate field", set(["source", "rate"], 3)],
  ["a renewal field", set(["source", "renewal"], "daily")],
  ["an owner field", set(["source", "owner"], "world_state")],
  ["a depth field", set(["source", "depth"], "EXACT_FINITE")],
  ["a recoverable field", set(["source", "recoverable"], { amount: 30, unit: "basket" })],
  ["a delivered field", set(["source", "delivered"], [])],
  ["a confirmed claim", set(["confirmed"], true)],
  [
    "an unknown access-fact field",
    set(["source", "access_facts"], [{ aspect: "terrain", statement: "On foot.", visible: true }]),
  ],
  [
    "duplicate access aspects (refused by the genuine owner path)",
    set(
      ["source", "access_facts"],
      [
        { aspect: "terrain", statement: "On foot." },
        { aspect: "terrain", statement: "By boat." },
      ],
    ),
  ],
  [
    "a source that belongs to another world than the locus",
    set(["source", "world_id"], "world-other"),
  ],
  [
    "a source at another locus than the new one (the first locus's source cannot be authored here)",
    set(["source", "locus_id"], LOCUS_ID),
  ],
];

describe("an unauthored, over-claiming or ineligible proposal is refused before the console is asked", () => {
  for (const [name, mutate] of invalid)
    it(name, async () => {
      const dirs = await localityCampaign();
      const head = await headOf(dirs.campaignDir);
      const doc = localityDoc();
      mutate(doc);
      const { result, terminal } = await addLocality(dirs, writeLocality(doc), []);
      expect(result.status).toBe("INVALID_LOCALITY");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    });

  it("a file that is not JSON, or is a list, or is empty", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    for (const text of ["{not json", "[]", "", "null", '"clay"']) {
      const { result, terminal } = await addLocality(dirs, writeLocality(text), []);
      expect(result.status, text).toBe("INVALID_LOCALITY");
      expect(terminal.asked()).toBe(0);
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a bare source document (no locus section) is not a locality", async () => {
    const dirs = await localityCampaign();
    const { result } = await addLocality(dirs, writeLocality(sourceDoc()), []);
    expect(result.status).toBe("INVALID_LOCALITY");
  });
});

describe("an untrusted, unreadable, stale or tampered file is refused", () => {
  it("a file others can write, a link, a directory, a missing file", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const writable = writeLocality(localityDoc(), 0o666);
    chmodSync(writable, 0o666);
    expect((await addLocality(dirs, writable, [])).result.status).toBe("LOCALITY_FILE_UNTRUSTED");

    const real = writeLocality(localityDoc());
    const link = join(dirname(real), "link.json");
    symlinkSync(real, link);
    expect((await addLocality(dirs, link, [])).result.status).toBe("LOCALITY_FILE_UNREADABLE");

    expect((await addLocality(dirs, dirname(real), [])).result.status).toBe(
      "LOCALITY_FILE_UNTRUSTED",
    );

    const gone = writeLocality(localityDoc());
    rmSync(gone);
    expect((await addLocality(dirs, gone, [])).result.status).toBe("LOCALITY_FILE_UNREADABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a file larger than a locality can be", async () => {
    const dirs = await localityCampaign();
    const doc = localityDoc();
    doc.source.statement = "x".repeat(70_000);
    const { result } = await addLocality(dirs, writeLocality(doc), []);
    expect(result.status).toBe("INVALID_LOCALITY");
  });

  it("a file changed after it was read cannot change what was confirmed: the shown proposal is the committed proposal", async () => {
    const dirs = await localityCampaign();
    const file = writeLocality(localityDoc());
    const tampered = localityDoc();
    tampered.source.quantity.amount = 9999;
    tampered.source.source_key = "src-tampered";
    tampered.locus.locus_id = "locus-tampered";
    tampered.source.locus_id = "locus-tampered";
    const { result } = await addLocality(dirs, file, [
      (challenge) => {
        writeFileSync(file, JSON.stringify(tampered));
        return challenge;
      },
    ]);
    expect(result.status).toBe("ADDITIONAL_LOCALITY_READY");
    const campaign = await openOrdinary(dirs.campaignDir);
    try {
      expect(campaign.sourceCondition(WORLD_ID, NEW_SOURCE_KEY)?.value.recoverable.amount).toBe(30);
      expect(campaign.locus(WORLD_ID, "locus-tampered")).toBeUndefined();
      expect(campaign.sourceCondition(WORLD_ID, "src-tampered")).toBeUndefined();
    } finally {
      await campaign.close();
    }
  });
});

describe("no confirmed original locality, no package, a foreign package", () => {
  it("a package directory that does not exist is never created", async () => {
    const dirs = freshDirs();
    const { result } = await addLocality(dirs, writeLocality(localityDoc()), []);
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(existsSync(dirs.campaignDir)).toBe(false);
  });

  it("another campaign identity is refused and nothing is written", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addLocality(dirs, writeLocality(localityDoc()), [], {
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
      buildId: "additional-locality-test",
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
      const { result, terminal } = await addLocality(dirs, writeLocality(localityDoc()), []);
      expect(result.status).toBe("LOCALITY_NOT_ESTABLISHED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    });

  it("a world carrying the locality identities but without its locus and source is not an established locality (uncommitted first locus/source)", async () => {
    const dirs = freshDirs();
    mkdirSync(dirs.campaignDir, { recursive: true, mode: 0o700 });
    const created = await CanonicalCampaign.create(dirs.campaignDir, {
      campaignId: LOCALITY_CAMPAIGN,
      buildId: "additional-locality-test",
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
    const { result, terminal } = await addLocality(dirs, writeLocality(localityDoc()), []);
    expect(result.status).toBe("LOCALITY_NOT_ESTABLISHED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("a proposal for another world, or one that collides with a held identity", () => {
  it("a foreign world (both sections agree on it) is refused", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const doc = localityDoc();
    doc.locus.world_id = "world-other";
    doc.source.world_id = "world-other";
    const { result, terminal } = await addLocality(dirs, writeLocality(doc), []);
    expect(result.status).toBe("WORLD_MISMATCH");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the first locus's identity is a colliding locus: the first locus is not replaced and the console is not asked", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const doc = localityDoc();
    doc.locus.locus_id = LOCUS_ID;
    doc.source.locus_id = LOCUS_ID;
    const { result, terminal } = await addLocality(dirs, writeLocality(doc), []);
    expect(result.status).toBe("LOCALITY_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the first source's key is a colliding source: the first source is not replaced and no locus is written alone", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const doc = localityDoc();
    doc.source.source_key = SOURCE_KEY;
    const { result, terminal } = await addLocality(dirs, writeLocality(doc), []);
    expect(result.status).toBe("SOURCE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const c = await openOrdinary(dirs.campaignDir);
    expect(c.locus(WORLD_ID, NEW_LOCUS_ID)).toBeUndefined();
    await c.close();
  });

  it("the key of an earlier additional source (establish-additional-source) is a colliding source", async () => {
    const dirs = await localityCampaign();
    expect((await addSource(dirs, writeSource(sourceDoc()))).result.status).toBe(
      "ADDITIONAL_SOURCE_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const doc = localityDoc();
    doc.source.source_key = sourceDoc().source_key;
    const { result, terminal } = await addLocality(dirs, writeLocality(doc), []);
    expect(result.status).toBe("SOURCE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an already-admitted locus id with a different source is refused: a committed locus is never reused under another proposal", async () => {
    const dirs = await localityCampaign();
    expect((await addLocality(dirs, writeLocality(localityDoc()))).result.status).toBe(
      "ADDITIONAL_LOCALITY_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const doc = localityDoc();
    doc.source.source_key = "src-blue-clay-2";
    const { result, terminal } = await addLocality(dirs, writeLocality(doc), []);
    expect(result.status).toBe("LOCALITY_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an already-admitted source key at a different locus is refused: a committed source is never moved", async () => {
    const dirs = await localityCampaign();
    expect((await addLocality(dirs, writeLocality(localityDoc()))).result.status).toBe(
      "ADDITIONAL_LOCALITY_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const doc = localityDoc();
    doc.locus.locus_id = "locus-other-flats";
    doc.source.locus_id = "locus-other-flats";
    const { result, terminal } = await addLocality(dirs, writeLocality(doc), []);
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
      (c: string) => c.replace("establish-additional-locality", "establish-additional-source"),
    ],
    [
      "the locality verb's phrase",
      (c: string) => c.replace("establish-additional-locality", "establish-locality"),
    ],
    ["free text", () => "yes"],
    ["an empty line", () => ""],
  ])("%s writes nothing", async (_name, reply) => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addLocality(dirs, writeLocality(localityDoc()), [reply as any]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const campaign = await openOrdinary(dirs.campaignDir);
    expect(campaign.locus(WORLD_ID, NEW_LOCUS_ID)).toBeUndefined();
    expect(campaign.sourceCondition(WORLD_ID, NEW_SOURCE_KEY)).toBeUndefined();
    await campaign.close();
  });
});

describe("the campaign must still be at its pre-play setting", () => {
  it("a bound player character closes the path: refused with nothing written", async () => {
    const dirs = await localityCampaign();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addLocality(dirs, writeLocality(localityDoc()), []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it.each([
    ["the first source", `/source/${SOURCE_KEY}`],
    ["the first locus", `/locus/${LOCUS_ID}`],
    ["the world", "/profile"],
  ])(
    "%s advanced by a later owner write closes the path: refused with nothing written",
    async (_name, suffix) => {
      const dirs = await localityCampaign();
      const head = await headOf(dirs.campaignDir);
      const open = LocalOperatorSession.open;
      vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
        const opened = await open.call(LocalOperatorSession, p);
        if (opened.ok) {
          const store = opened.value.campaign.store;
          const advance = (f: any) => (f && f.key.endsWith(suffix) ? { ...f, version: 2 } : f);
          const getFact = store.getFact.bind(store);
          vi.spyOn(store, "getFact").mockImplementation((key: string) => advance(getFact(key)));
          const listFacts = store.listFacts.bind(store);
          vi.spyOn(store, "listFacts").mockImplementation(() => listFacts().map(advance));
        }
        return opened;
      });
      const { result, terminal } = await addLocality(dirs, writeLocality(localityDoc()), []);
      vi.restoreAllMocks();
      expect(result.status).toBe("PRE_PLAY_CLOSED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    },
  );
});
