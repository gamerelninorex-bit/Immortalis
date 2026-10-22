/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw Reserve documents and swap owner operations */
// Refusals of the initial Production Reserve admission. Each case independently refutes a false success claim: the status is a
// refusal, the console is not asked where the refusal precedes the choice, and the campaign's head (revision, state and journal
// hashes) is exactly what it was — no owner write of any kind, and no Reserve.
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { productionReserveKey, worldProfileKey } from "@immortalis/contracts";
import { CanonicalCampaign, ProductionAdapter } from "@immortalis/engine";
import { LocalOperatorSession } from "@immortalis/operator";
import { fixtureWorld, publication } from "@immortalis/testkit";
import {
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  NEW_LOCUS_ID,
  RESERVE_ID,
  SOURCE_KEY,
  WORLD_ID,
  addReserve,
  additionalLocalityCampaign,
  bindPlayer,
  freshDirs,
  headOf,
  localityCampaign,
  openOrdinary,
  reserveDoc,
  writeReserve,
} from "../support/production-reserve.ts";

const noReserve = async (dir: string) => {
  const c = await openOrdinary(dir);
  try {
    return c.store.listFacts().filter((f) => f.owner === "production");
  } finally {
    await c.close();
  }
};

describe("an unauthored, over-claiming or malformed Reserve is refused before the console is asked", () => {
  const invalid: [string, (d: any) => void][] = [
    ["a negative quantity", (d) => (d.quantity.amount = -3)],
    ["a non-integer quantity", (d) => (d.quantity.amount = 2.5)],
    ["a string quantity", (d) => (d.quantity.amount = "15")],
    ["an unsafe-integer quantity", (d) => (d.quantity.amount = 2 ** 53)],
    ["no unit", (d) => delete d.quantity.unit],
    ["no condition", (d) => delete d.condition],
    ["no material class", (d) => delete d.material_class],
    ["an owner field", (d) => (d.owner = "production")],
    ["a held-quantity field", (d) => (d.held = { amount: 99, unit: "sack" })],
    [
      "an inflow field",
      (d) => (d.inflows = [{ inflow_id: "x", quantity: { amount: 1, unit: "sack" } }]),
    ],
    ["a claims field", (d) => (d.claims = ["claim-1"])],
    ["a title field", (d) => (d.title = "the miller")],
    ["a confirmed claim", (d) => (d.confirmed = true)],
  ];
  for (const [name, mutate] of invalid)
    it(name, async () => {
      const dirs = await localityCampaign();
      const head = await headOf(dirs.campaignDir);
      const doc = reserveDoc();
      mutate(doc);
      const { result, terminal } = await addReserve(dirs, writeReserve(doc), []);
      expect(result.status).toBe("INVALID_RESERVE");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
      expect(await noReserve(dirs.campaignDir)).toEqual([]);
    });

  it("a Reserve file that is not JSON, or is a list, or is empty", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    for (const text of ["{not json", "[]", "", "null", '"salt"']) {
      const { result, terminal } = await addReserve(dirs, writeReserve(text), []);
      expect(result.status, text).toBe("INVALID_RESERVE");
      expect(terminal.asked()).toBe(0);
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("an untrusted, unreadable or tampered Reserve file is refused", () => {
  it("a file others can write, a missing file", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const writable = writeReserve(reserveDoc(), 0o666);
    chmodSync(writable, 0o666);
    expect((await addReserve(dirs, writable, [])).result.status).toBe("RESERVE_FILE_UNTRUSTED");
    expect((await addReserve(dirs, `${writable}.absent`, [])).result.status).toBe(
      "RESERVE_FILE_UNREADABLE",
    );
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a file changed after it was read cannot change what was confirmed: the shown Reserve is the committed Reserve", async () => {
    const dirs = await localityCampaign();
    const file = writeReserve(reserveDoc());
    const tampered = reserveDoc({
      reserve_id: "reserve-tampered",
      quantity: { amount: 9999, unit: "sack" },
    });
    const { result } = await addReserve(dirs, file, [
      (challenge) => {
        writeFileSync(file, JSON.stringify(tampered));
        return challenge;
      },
    ]);
    expect(result.status).toBe("RESERVE_READY");
    const campaign = await openOrdinary(dirs.campaignDir);
    try {
      expect(campaign.store.getFact(productionReserveKey(RESERVE_ID))).toBeDefined();
      expect(campaign.store.getFact(productionReserveKey("reserve-tampered"))).toBeUndefined();
    } finally {
      await campaign.close();
    }
  });
});

describe("no confirmed original locality, no package, a foreign package", () => {
  it("a package directory that does not exist is never created", async () => {
    const dirs = freshDirs();
    const { result } = await addReserve(dirs, writeReserve(reserveDoc()), []);
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(existsSync(dirs.campaignDir)).toBe(false);
  });

  it("another campaign identity is refused and nothing is written", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addReserve(dirs, writeReserve(reserveDoc()), [], {
      campaignId: "campaign-other",
    });
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a package directory that others can write is not the operator's: refused with nothing written", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    chmodSync(dirs.campaignDir, 0o777);
    try {
      const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc()), []);
      expect(result.status).toBe("SESSION_UNAVAILABLE");
      expect(result.code).toContain("OPERATOR_UNVERIFIED");
      expect(terminal.asked()).toBe(0);
    } finally {
      chmodSync(dirs.campaignDir, 0o700);
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  const bare = async (steps: "none" | "world") => {
    const dirs = freshDirs();
    mkdirSync(dirs.campaignDir, { recursive: true, mode: 0o700 });
    const created = await CanonicalCampaign.create(dirs.campaignDir, {
      campaignId: LOCALITY_CAMPAIGN,
      buildId: "production-reserve-test",
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
      const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc()), []);
      expect(result.status).toBe("LOCALITY_NOT_ESTABLISHED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    });
});

describe("a Reserve whose world or locus is not one the confirmed scenario committed", () => {
  it.each([
    ["a foreign world", { world_id: "world-other" }],
    ["a locus that is not committed", { locus_id: "locus-elsewhere" }],
    ["a locus id that exists nowhere in the world", { locus_id: "locus-nowhere" }],
  ])("%s", async (_name, over) => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc(over)), []);
    expect(result.status).toBe("RESERVE_NOT_AT_LOCALITY");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect(await noReserve(dirs.campaignDir)).toEqual([]);
  });

  it("a locus of the world that something other than the operator's confirmed commands committed is not offered", async () => {
    const dirs = await localityCampaign();
    const c = await openOrdinary(dirs.campaignDir);
    const committed = await c.establishLocus({
      ...publication(77),
      locus: {
        locus_id: "locus-foreign",
        designation: "A locus another writer committed",
        constraints: [],
        world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
      },
    });
    expect(committed.ok).toBe(true);
    await c.close();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addReserve(
      dirs,
      writeReserve(reserveDoc({ locus_id: "locus-foreign" })),
      [],
    );
    expect(result.status).toBe("RESERVE_NOT_AT_LOCALITY");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an additional locus whose source is not committed is an incomplete locality and is not offered", async () => {
    const dirs = await localityCampaign();
    const c = await openOrdinary(dirs.campaignDir);
    const id = "b".repeat(32);
    const committed = await c.establishLocus({
      ...publication(78),
      group_id: `operator-additional-locality:${id}:locus`,
      intent_id: `operator-additional-locality-intent:${id}:locus`,
      locus: {
        locus_id: NEW_LOCUS_ID,
        designation: "A locus committed without its source",
        constraints: [],
        world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
      },
    });
    expect(committed.ok).toBe(true);
    await c.close();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addReserve(
      dirs,
      writeReserve(reserveDoc({ locus_id: NEW_LOCUS_ID })),
      [],
    );
    expect(result.status).toBe("RESERVE_NOT_AT_LOCALITY");
    expect(result.details.join(" ")).toContain("incomplete additional locality");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("a Reserve identifier that is already held is never replaced", () => {
  it("a Reserve another writer established under the same identifier — even with identical content — is a conflict", async () => {
    const dirs = await localityCampaign();
    const c = await openOrdinary(dirs.campaignDir);
    const established = await new ProductionAdapter(c.store).establishReserve({
      ...publication(79),
      reserve: reserveDoc(),
    });
    expect(established.ok).toBe(true);
    await c.close();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc()), []);
    expect(result.status).toBe("RESERVE_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the key of a Reserve established earlier by this command is a conflict for any other content", async () => {
    const dirs = await localityCampaign();
    expect((await addReserve(dirs, writeReserve(reserveDoc()))).result.status).toBe(
      "RESERVE_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const other = reserveDoc({ locus_id: LOCUS_ID, condition: "scattered" });
    const { result, terminal } = await addReserve(dirs, writeReserve(other), []);
    expect(result.status).toBe("RESERVE_CONFLICT");
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
      (c: string) => c.replace("establish-reserve", "establish-additional-source"),
    ],
    ["the locality's phrase", (c: string) => c.replace("establish-reserve", "establish-locality")],
    ["free text", () => "yes"],
    ["an empty line", () => ""],
    ["the phrase with a wrong challenge", () => "establish-reserve 000000000000"],
  ])("%s writes nothing", async (_name, reply) => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addReserve(dirs, writeReserve(reserveDoc()), [reply as any]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect(await noReserve(dirs.campaignDir)).toEqual([]);
  });
});

describe("the campaign must still be at its pre-play setting", () => {
  it("a bound player character closes the path: refused with nothing written", async () => {
    const dirs = await localityCampaign();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc()), []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect(await noReserve(dirs.campaignDir)).toEqual([]);
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
    const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc()), []);
    vi.restoreAllMocks();
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an already established Reserve that Production has since advanced is reported as closed, not as established", async () => {
    const dirs = await localityCampaign();
    const file = writeReserve(reserveDoc());
    expect((await addReserve(dirs, file)).result.status).toBe("RESERVE_READY");
    const head = await headOf(dirs.campaignDir);
    const open = LocalOperatorSession.open;
    vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
      const opened = await open.call(LocalOperatorSession, p);
      if (opened.ok) {
        const store = opened.value.campaign.store;
        const getFact = store.getFact.bind(store);
        vi.spyOn(store, "getFact").mockImplementation((key: string) => {
          const f = getFact(key);
          return f && f.key === productionReserveKey(RESERVE_ID) ? { ...f, version: 2 } : f;
        });
      }
      return opened;
    });
    const again = await addReserve(dirs, file, []);
    vi.restoreAllMocks();
    expect(again.result.status).toBe("PRE_PLAY_CLOSED");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});

describe("only the Production owner operation writes, and its refusal is a refusal", () => {
  it("an owner refusal after the confirmation is RESERVE_REFUSED: nothing is committed and no success is claimed", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const original = ProductionAdapter.prototype.establishReserve;
    let calls = 0;
    vi.spyOn(ProductionAdapter.prototype, "establishReserve").mockImplementation(function (
      this: ProductionAdapter,
      ...args: Parameters<typeof original>
    ) {
      calls++;
      // the first call is the scratch admission check; the second is the operator's campaign
      if (calls === 2)
        return Promise.resolve({
          ok: false,
          error: { code: "VALUE_INVALID", message: "refused by the owner" },
        } as any);
      return original.apply(this, args);
    });
    const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc()));
    vi.restoreAllMocks();
    expect(calls).toBe(2);
    expect(result.status).toBe("RESERVE_REFUSED");
    expect(result.code).toBe("VALUE_INVALID");
    expect(terminal.said.some((l) => l.startsWith("PROGRESS"))).toBe(false);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a Reserve the owner path refuses on the scratch check is INVALID_RESERVE, before the console is asked", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    vi.spyOn(ProductionAdapter.prototype, "establishReserve").mockResolvedValue({
      ok: false,
      error: { code: "VALUE_INVALID", message: "refused by the owner" },
    } as any);
    const { result, terminal } = await addReserve(dirs, writeReserve(reserveDoc()), []);
    vi.restoreAllMocks();
    expect(result.status).toBe("INVALID_RESERVE");
    expect(result.details.join(" ")).toContain("reserve: VALUE_INVALID");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an unexpected failure is neither a success nor a clean refusal; a failure of the scratch check is a refusal before the console", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const original = ProductionAdapter.prototype.establishReserve;
    let calls = 0;
    vi.spyOn(ProductionAdapter.prototype, "establishReserve").mockImplementation(function (
      this: ProductionAdapter,
      ...args: Parameters<typeof original>
    ) {
      calls++;
      if (calls === 2) throw new Error("boom");
      return original.apply(this, args);
    });
    const { result } = await addReserve(dirs, writeReserve(reserveDoc()));
    vi.restoreAllMocks();
    expect(result.status).toBe("RESERVE_OUTCOME_UNKNOWN");
    expect(await headOf(dirs.campaignDir)).toEqual(head);

    vi.spyOn(ProductionAdapter.prototype, "establishReserve").mockImplementation(() => {
      throw new Error("boom");
    });
    const scratch = await addReserve(dirs, writeReserve(reserveDoc()), []);
    vi.restoreAllMocks();
    expect(scratch.result.status).toBe("INVALID_RESERVE");
    expect(scratch.terminal.asked()).toBe(0);
  });
});

describe("the additional locality is still pre-play: a Reserve there needs the same conditions", () => {
  it("a bound player character closes the additional locus too", async () => {
    const dirs = await additionalLocalityCampaign();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result } = await addReserve(
      dirs,
      writeReserve(reserveDoc({ locus_id: NEW_LOCUS_ID })),
      [],
    );
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});
