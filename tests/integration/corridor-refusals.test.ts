/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw corridor documents */
// Refusals of the source-qualified local corridor. Each case independently refutes a false success claim: the status is a refusal, the
// console is not asked where the refusal precedes the choice, and the campaign's head (revision, state and journal hashes) is exactly
// what it was — no owner write of any kind.
import { chmodSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { LocalOperatorSession } from "@immortalis/operator";
import { fixtureWorld, publication } from "@immortalis/testkit";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  NEW_LOCUS_ID,
  WORLD_ID,
  addCorridor,
  bindPlayer,
  corridorDoc,
  freshDirs,
  headOf,
  openOrdinary,
  twoLociCampaign,
  writeCorridor,
} from "../support/corridor.ts";
import { localityCampaign } from "../support/additional-locality.ts";

const set = (path: string[], value: unknown) => (d: any) => {
  let o = d;
  for (const k of path.slice(0, -1)) o = o[k];
  o[path.at(-1)!] = value;
};

describe("an unauthored, over-claiming or malformed proposal is refused before the console is asked", () => {
  const over: [string, (d: any) => void][] = [
    ["a duration", set(["corridor", "travel_duration"], 3)],
    ["a distance", set(["corridor", "distance"], { amount: 2, unit: "mile" })],
    ["a speed or rate", set(["corridor", "speed"], 4)],
    ["a capacity", set(["corridor", "capacity"], 5)],
    ["an access right", set(["corridor", "access"], "anyone may pass")],
    ["a passable or feasible claim", set(["corridor", "feasible"], true)],
    ["a delivery claim", set(["corridor", "delivered"], true)],
    ["an actor's agreement", set(["corridor", "agreed_by"], "pc-1")],
    ["a reverse corridor", set(["reverse"], true)],
    ["the same locus at both ends", (d) => (d.corridor.to_locus_id = d.corridor.from_locus_id)],
    ["another format", set(["format"], "immortalis-additional-locality")],
  ];
  it.each(over)("%s", async (_name, change) => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const doc = corridorDoc();
    change(doc);
    const { result, terminal } = await addCorridor(dirs, writeCorridor(doc), []);
    expect(result.status).toBe("INVALID_CORRIDOR");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a malformed, untrusted or unreadable OOC file earns nothing: not JSON, others-writable, a link, a directory, a missing file", async () => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const cases: [string, string, string][] = [
      ["not JSON", writeCorridor("{ not json"), "INVALID_CORRIDOR"],
      ["a list", writeCorridor("[]"), "INVALID_CORRIDOR"],
      ["others can write it", writeCorridor(corridorDoc(), 0o666), "CORRIDOR_FILE_UNTRUSTED"],
      ["group can write it", writeCorridor(corridorDoc(), 0o660), "CORRIDOR_FILE_UNTRUSTED"],
    ];
    const dir = join(dirs.campaignDir, "..", "files");
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o700);
    const real = writeCorridor(corridorDoc());
    symlinkSync(real, join(dir, "link.json"));
    cases.push(["a link", join(dir, "link.json"), "CORRIDOR_FILE_UNREADABLE"]);
    cases.push(["a directory", dir, "CORRIDOR_FILE_UNTRUSTED"]);
    cases.push(["a missing file", join(dir, "missing.json"), "CORRIDOR_FILE_UNREADABLE"]);
    for (const [name, file, status] of cases) {
      const { result, terminal } = await addCorridor(dirs, file, []);
      expect(result.status, name).toBe(status);
      expect(terminal.asked(), name).toBe(0);
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a file changed after it was read cannot change what was confirmed: the shown proposal is the committed proposal", async () => {
    const dirs = await twoLociCampaign();
    const file = writeCorridor(corridorDoc());
    const altered = corridorDoc();
    altered.corridor.statement = "A road to somewhere else entirely.";
    const { result, terminal } = await addCorridor(dirs, file, [
      (challenge: string) => {
        // the file is rewritten between the display and the confirmation; the service holds what it read
        writeFileSync(file, JSON.stringify(altered));
        return challenge;
      },
    ]);
    expect(result.status).toBe("CORRIDOR_READY");
    expect(terminal.said.join("\n")).not.toContain("somewhere else entirely");
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.corridor(WORLD_ID, LOCUS_ID, NEW_LOCUS_ID)!.value.statement).toMatch(/plank walk/);
    } finally {
      await c.close();
    }
  });
});

describe("no package, a foreign package, an unauthorized caller, no established locality", () => {
  it("a package directory that does not exist is never created", async () => {
    const dirs = freshDirs();
    const { result } = await addCorridor(dirs, writeCorridor(corridorDoc()), []);
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(existsSync(dirs.campaignDir)).toBe(false);
  });

  it("another campaign identity is refused and nothing is written", async () => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addCorridor(dirs, writeCorridor(corridorDoc()), [], {
      campaignId: "campaign-other",
    });
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a caller that does not exclusively own the campaign package is unauthorized: refused with nothing written", async () => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    chmodSync(dirs.campaignDir, 0o777);
    try {
      const { result, terminal } = await addCorridor(dirs, writeCorridor(corridorDoc()), []);
      expect(result.status).toBe("SESSION_UNAVAILABLE");
      expect(terminal.asked()).toBe(0);
    } finally {
      chmodSync(dirs.campaignDir, 0o700);
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a retained-state directory that is not exclusively the operator's is refused", async () => {
    const dirs = await twoLociCampaign();
    chmodSync(dirs.operatorDir, 0o777);
    try {
      const { result } = await addCorridor(dirs, writeCorridor(corridorDoc()), []);
      expect(result.status).toBe("SESSION_UNAVAILABLE");
    } finally {
      chmodSync(dirs.operatorDir, 0o700);
    }
  });

  const bare = async (steps: "none" | "world") => {
    const dirs = freshDirs();
    mkdirSync(dirs.campaignDir, { recursive: true, mode: 0o700 });
    const created = await CanonicalCampaign.create(dirs.campaignDir, {
      campaignId: LOCALITY_CAMPAIGN,
      buildId: "corridor-test",
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
      const { result, terminal } = await addCorridor(dirs, writeCorridor(corridorDoc()), []);
      expect(result.status).toBe("LOCALITY_NOT_ESTABLISHED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    });
});

describe("a corridor for another world, an unestablished locus, or a held identity", () => {
  it("a foreign world is refused", async () => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const doc = corridorDoc();
    doc.corridor.world_id = "world-elsewhere";
    const { result, terminal } = await addCorridor(dirs, writeCorridor(doc), []);
    expect(result.status).toBe("WORLD_MISMATCH");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it.each([
    ["an origin", (d: any) => (d.corridor.from_locus_id = "locus-never-established")],
    ["a destination", (d: any) => (d.corridor.to_locus_id = "locus-never-established")],
  ])(
    "%s that is not an established locus is refused: a corridor never creates a locus",
    async (_n, change) => {
      const dirs = await twoLociCampaign();
      const head = await headOf(dirs.campaignDir);
      const doc = corridorDoc();
      change(doc);
      const { result, terminal } = await addCorridor(dirs, writeCorridor(doc), []);
      expect(result.status).toBe("LOCUS_NOT_ESTABLISHED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    },
  );

  it("a campaign with only its first locus has nothing to connect it to: refused, nothing written", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addCorridor(dirs, writeCorridor(corridorDoc()), []);
    expect(result.status).toBe("LOCUS_NOT_ESTABLISHED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a duplicate under another identity is refused: a second corridor for the ordered pair is never a sibling truth", async () => {
    const dirs = await twoLociCampaign();
    expect((await addCorridor(dirs, writeCorridor(corridorDoc()))).result.status).toBe(
      "CORRIDOR_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const doc = corridorDoc();
    doc.corridor.statement = "Another description of the same connection.";
    const { result, terminal } = await addCorridor(dirs, writeCorridor(doc), []);
    expect(result.status).toBe("CORRIDOR_CONFLICT");
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
      (c: string) => c.replace("establish-corridor", "establish-additional-locality"),
    ],
    [
      "the locality verb's phrase",
      (c: string) => c.replace("establish-corridor", "establish-locality"),
    ],
    ["free text", () => "yes"],
    ["an empty line", () => ""],
  ])("%s writes nothing", async (_name, reply) => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addCorridor(dirs, writeCorridor(corridorDoc()), [reply as any]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const campaign = await openOrdinary(dirs.campaignDir);
    expect(campaign.corridor(WORLD_ID, LOCUS_ID, NEW_LOCUS_ID)).toBeUndefined();
    await campaign.close();
  });
});

describe("the campaign must still be at its pre-play setting", () => {
  it("a bound player character closes the path: refused with nothing written", async () => {
    const dirs = await twoLociCampaign();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addCorridor(dirs, writeCorridor(corridorDoc()), []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it.each([
    ["the first source", "/source/src-salt-pan-1"],
    ["the first locus", `/locus/${LOCUS_ID}`],
    ["the world", "/profile"],
  ])(
    "%s advanced by a later owner write closes the path: refused with nothing written",
    async (_name, suffix) => {
      const dirs = await twoLociCampaign();
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
      const { result, terminal } = await addCorridor(dirs, writeCorridor(corridorDoc()), []);
      vi.restoreAllMocks();
      expect(result.status).toBe("PRE_PLAY_CLOSED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    },
  );
});

describe("the owner path is proven before the console is asked", () => {
  it("a refusal by the genuine owner operation on the scratch package leaves nothing written and the console unasked", async () => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const original = CanonicalCampaign.prototype.establishCorridor;
    const spy = vi
      .spyOn(CanonicalCampaign.prototype, "establishCorridor")
      .mockImplementation(async () => ({
        ok: false,
        error: { code: "INPUT_INVALID", message: "refused" },
      }));
    const { result, terminal } = await addCorridor(dirs, writeCorridor(corridorDoc()), []);
    spy.mockRestore();
    expect(CanonicalCampaign.prototype.establishCorridor).toBe(original);
    expect(result.status).toBe("INVALID_CORRIDOR");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("the tampered or unverifiable package is never extended", () => {
  it("a campaign whose canonical integrity reports a violation refuses before the console is asked", async () => {
    const dirs = await twoLociCampaign();
    const head = await headOf(dirs.campaignDir);
    const open = LocalOperatorSession.open;
    vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
      const opened = await open.call(LocalOperatorSession, p);
      if (opened.ok)
        vi.spyOn(opened.value.campaign, "verify").mockReturnValue([
          { key: "x", code: "REFERENCE_INVALID", message: "tampered" },
        ]);
      return opened;
    });
    const { result, terminal } = await addCorridor(dirs, writeCorridor(corridorDoc()), []);
    vi.restoreAllMocks();
    expect(result.status).toBe("CORRIDOR_VERIFICATION_FAILED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});
