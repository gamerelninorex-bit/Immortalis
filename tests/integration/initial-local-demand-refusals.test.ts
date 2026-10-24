/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw demand documents and poke at raw groups */
// Refusals of the initial local demand and independently authored production start. Each case independently refutes a false success claim:
// the status is a refusal, the console is not asked where the refusal precedes the choice, and the campaign's head (revision, state and
// journal hashes) is exactly what it was — no owner write of any kind, and in particular never a demand without the premise it was
// authored with silently dropped, a stock, title or priority, an output, a satisfied demand, a second operation or a smuggled verdict.
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  economyDemandKey,
  economyRealizationKey,
  economyRequestKey,
  productionCompletionKey,
  productionOperationKey,
  productionReserveKey,
  worldFallbackEntityKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { CanonicalCampaign, PopulationAdapter } from "@immortalis/engine";
import { LocalOperatorSession } from "@immortalis/operator";
import { at, fixtureWorld, publication } from "@immortalis/testkit";
import {
  DEMAND_ID,
  LEDGER_ID,
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  OPERATION_ID,
  OUTPUT_CLASS,
  OUTPUT_UNIT,
  REQUEST_KEY,
  RESERVE_AMOUNT,
  RESERVE_ID,
  RESERVE_UNIT,
  T_OPEN,
  WORLD_ID,
  addDemand,
  bindPlayer,
  cohortCarrier,
  demandDoc,
  engageClose,
  freshDirs,
  headOf,
  held,
  openOrdinary,
  openPopulationWitness,
  openWitness,
  populationDoc,
  scenarioCampaign,
  unitCarrier,
  writeDemand,
} from "../support/initial-local-demand.ts";
import { addPopulation, writePopulation } from "../support/initial-population.ts";
import { addReserve, reserveDoc, writeReserve } from "../support/production-reserve.ts";
import { addLocality, localityDoc, writeLocality } from "../support/additional-locality.ts";
import { localityCampaign } from "../support/additional-source.ts";

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

const NOTHING = { demand: false, request: false, operation: false, claim: false, violations: [] };

/** A refusal before the console: the status, no question asked, the head unchanged and no part of the process held. */
async function refused(
  dirs: Awaited<ReturnType<typeof scenarioCampaign>>,
  doc: unknown,
  status: string,
  detail?: RegExp,
  expectedHeld: typeof NOTHING = NOTHING,
) {
  const head = await headOf(dirs.campaignDir);
  const { result, terminal } = await addDemand(dirs, writeDemand(doc), []);
  expect(result.status, JSON.stringify(result)).toBe(status);
  if (detail) expect(JSON.stringify(result.details)).toMatch(detail);
  expect(terminal.asked()).toBe(0);
  expect(await headOf(dirs.campaignDir)).toEqual(head);
  expect(await held(dirs.campaignDir)).toEqual(expectedHeld);
}

const invalid: [string, (d: any) => void][] = [
  // the envelope of the document
  ["no format", without(["format"])],
  ["another format", set(["format"], "immortalis-initial-population")],
  ["another format version", set(["format_version"], 2)],
  ["no demand section", without(["demand"])],
  ["no production section (a demand never grants the second act)", without(["production"])],
  ["a top-level extra field", set(["stock"], { amount: 1 })],
  ["a confirmed claim", set(["confirmed"], true)],
  ["a smuggled downstream verdict at the top level", set(["satisfied"], true)],
  ["a smuggled realized access at the top level", set(["realized_access"], { output_class: "x" })],
  // the demand: exactly IssueDemandInput
  ["no demand id", without(["demand", "demand_envelope_id"])],
  ["a demand id that is a key path", set(["demand", "demand_envelope_id"], "dem/and")],
  ["no carrier", without(["demand", "carrier"])],
  ["an unknown carrier kind", set(["demand", "carrier", "kind"], "NAMED_ACTOR")],
  ["a carrier with an extra actor reference", set(["demand", "carrier", "actor_id"], "actor-1")],
  ["no demand entry", without(["demand", "demand_entry"])],
  ["no demanded class", without(["demand", "demand_entry", "output_class"])],
  ["a zero demanded quantity", set(["demand", "demand_entry", "quantity", "amount"], 0)],
  ["a negative demanded quantity", set(["demand", "demand_entry", "quantity", "amount"], -1)],
  ["a fractional demanded quantity", set(["demand", "demand_entry", "quantity", "amount"], 1.5)],
  ["a demand claiming stock", set(["demand", "stock"], { amount: 1 })],
  ["a demand claiming title", set(["demand", "title"], "owner-1")],
  ["a demand claiming priority", set(["demand", "priority"], 1)],
  ["a demand claiming a price", set(["demand", "price"], { amount: 1 })],
  ["a caller-supplied availability", set(["demand", "pre_commit_availability"], { supply: 1 })],
  ["a caller-supplied carrier basis", set(["demand", "carrier_basis_ref"], {})],
  ["a caller-supplied allocation", set(["demand", "allocation"], {})],
  // the production act: exactly StartOperationInput
  ["no request key", without(["production", "request_key"])],
  [
    "a request key that is not the one this demand allocates to",
    set(["production", "request_key"], "economy/request/request:demand-other"),
  ],
  ["no Reserve", without(["production", "reserve_id"])],
  [
    "no transformation (no yield or rate is ever defaulted)",
    without(["production", "transformation"]),
  ],
  ["no input quantity", without(["production", "transformation", "input_quantity"])],
  ["a zero input quantity", set(["production", "transformation", "input_quantity", "amount"], 0)],
  ["no output quantity", without(["production", "transformation", "output_quantity"])],
  ["no output class", without(["production", "transformation", "output_class"])],
  ["no output condition", without(["production", "transformation", "output_condition"])],
  ["a derived yield", set(["production", "transformation", "yield"], 0.5)],
  ["a rate", set(["production", "rate"], 3)],
  [
    "a duration (a completion boundary is exact, never a duration)",
    set(["production", "duration"], 60),
  ],
  ["a labour claim", set(["production", "labor"], { amount: 2 })],
  ["a priority claim", set(["production", "priority_basis"], "first")],
  ["no completion boundary (never defaulted)", without(["production", "completion_at"])],
  ["a completion boundary without its unit", without(["production", "completion_at", "unit"])],
  ["a negative completion boundary", set(["production", "completion_at", "value"], -1)],
  ["a claimed completion", set(["production", "completed"], true)],
  ["a claimed output", set(["production", "output"], { amount: 1 })],
];

describe("an unauthored, over-claiming or ineligible proposal is refused before the console is asked", () => {
  for (const [name, mutate] of invalid)
    it(
      name,
      async () => {
        const dirs = await scenarioCampaign();
        const doc = demandDoc();
        mutate(doc);
        await refused(dirs, doc, "INVALID_PROCESS");
      },
      120_000,
    );

  it("a file that is not JSON, or is a list, or is empty", async () => {
    const dirs = await scenarioCampaign();
    const head = await headOf(dirs.campaignDir);
    for (const text of ["{not json", "[]", "", "null", '"demand"']) {
      const { result, terminal } = await addDemand(dirs, writeDemand(text), []);
      expect(result.status, text).toBe("INVALID_PROCESS");
      expect(terminal.asked()).toBe(0);
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a bare demand input (no production act) is not a process", async () => {
    const dirs = await scenarioCampaign();
    await refused(dirs, demandDoc().demand, "INVALID_PROCESS");
  }, 120_000);
});

describe("an untrusted, unreadable, stale or tampered file is refused", () => {
  it("a file others can write, a link, a directory, a missing file", async () => {
    const dirs = await scenarioCampaign();
    const head = await headOf(dirs.campaignDir);
    const writable = writeDemand(demandDoc(), 0o666);
    chmodSync(writable, 0o666);
    expect((await addDemand(dirs, writable, [])).result.status).toBe("PROCESS_FILE_UNTRUSTED");

    const real = writeDemand(demandDoc());
    const link = join(dirname(real), "link.json");
    symlinkSync(real, link);
    expect((await addDemand(dirs, link, [])).result.status).toBe("PROCESS_FILE_UNREADABLE");

    expect((await addDemand(dirs, dirname(real), [])).result.status).toBe("PROCESS_FILE_UNTRUSTED");

    const gone = writeDemand(demandDoc());
    rmSync(gone);
    expect((await addDemand(dirs, gone, [])).result.status).toBe("PROCESS_FILE_UNREADABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a file larger than a demand can be", async () => {
    const dirs = await scenarioCampaign();
    const doc = demandDoc();
    doc.demand.demand_entry.output_class = "x".repeat(70_000);
    const { result } = await addDemand(dirs, writeDemand(doc), []);
    expect(result.status).toBe("INVALID_PROCESS");
  }, 120_000);

  it("a file changed after it was read cannot change what was confirmed: the shown proposal is the committed proposal", async () => {
    const dirs = await scenarioCampaign();
    const file = writeDemand(demandDoc());
    const tampered = demandDoc();
    tampered.demand.demand_envelope_id = "demand-tampered";
    tampered.demand.demand_entry.quantity.amount = 5;
    const { result } = await addDemand(dirs, file, [
      (challenge) => {
        writeFileSync(file, JSON.stringify(tampered));
        return challenge;
      },
    ]);
    expect(result.status).toBe("LOCAL_DEMAND_READY");
    const w = await openWitness(dirs.campaignDir);
    try {
      expect(w.economy.demand(DEMAND_ID)!.value.demand_entry.quantity.amount).toBe(1);
      expect(w.economy.demand("demand-tampered")).toBeUndefined();
    } finally {
      await w.campaign.close();
    }
  }, 120_000);
});

describe("no confirmed original locality, no package, a foreign package", () => {
  it("a package directory that does not exist is never created", async () => {
    const dirs = freshDirs();
    const { result } = await addDemand(dirs, writeDemand(demandDoc()), []);
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(existsSync(dirs.campaignDir)).toBe(false);
  });

  it("another campaign identity is refused and nothing is written", async () => {
    const dirs = await scenarioCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addDemand(dirs, writeDemand(demandDoc()), [], {
      campaignId: "campaign-other",
    });
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  for (const steps of ["none", "world"] as const)
    it(`a campaign holding ${steps === "none" ? "nothing" : "only a world not committed by establish-locality"} is not an established locality`, async () => {
      const dirs = freshDirs();
      mkdirSync(dirs.campaignDir, { recursive: true, mode: 0o700 });
      const created = await CanonicalCampaign.create(dirs.campaignDir, {
        campaignId: LOCALITY_CAMPAIGN,
        buildId: "initial-local-demand-test",
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
      const head = await headOf(dirs.campaignDir);
      const { result, terminal } = await addDemand(dirs, writeDemand(demandDoc()), []);
      expect(result.status).toBe("LOCALITY_NOT_ESTABLISHED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    });
});

describe("the Population carrier must be a committed one at the confirmed locality", () => {
  it("an absent ledger, an absent Unit, an absent Cohort and a Cohort Population has not composed are all refused", async () => {
    const dirs = await scenarioCampaign();
    const cases: [string, (d: any) => void, RegExp][] = [
      [
        "absent ledger",
        set(["demand", "carrier", "ledger_id"], "ledger-none"),
        /no Population ledger/,
      ],
      ["absent unit", set(["demand", "carrier", "unit_id"], "unit-none"), /not a Unit of ledger/],
      [
        "absent cohort",
        set(["demand", "carrier"], cohortCarrier("cohort-none")),
        /no Cohort cohort-none/,
      ],
      [
        "uncomposed cohort",
        set(["demand", "carrier"], cohortCarrier()),
        /has not been composed by Population/,
      ],
    ];
    for (const [name, mutate, detail] of cases) {
      const doc = demandDoc();
      mutate(doc);
      await refused(dirs, doc, "CARRIER_NOT_COMMITTED", detail);
      void name;
    }
  }, 120_000);

  it("a Population carrier with no Reserve counterpart still names a ledger of this scenario: a ledger of another world is not offered", async () => {
    const dirs = await scenarioCampaign();
    const doc = demandDoc();
    doc.demand.carrier = { ...unitCarrier(), ledger_id: `${LEDGER_ID}-other` };
    await refused(dirs, doc, "CARRIER_NOT_COMMITTED");
  }, 120_000);
});

describe("the canonical time the demand is made AS-OF-NOW at, and the declared boundary after it", () => {
  it("a campaign that holds no canonical time is refused as a missing prerequisite — never as a success, and no time is created", async () => {
    // a Population ledger committed by the Population owner itself carries its own point; no Temporal owner state exists
    const dirs = await localityCampaign();
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const doc = populationDoc();
      const r = await new PopulationAdapter(c.store).establishLedger({
        group_id: "g-ledger",
        intent_id: "i-ledger",
        cause: "c-ledger",
        basis: "b",
        secrecy: "s",
        ledger: doc.ledger,
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
    } finally {
      await c.close();
    }
    const reserve = await addReserve(dirs, writeReserve(reserveDoc()));
    expect(reserve.result.status).toBe("RESERVE_READY");
    await refused(dirs, demandDoc(), "TIME_NOT_ESTABLISHED");
    const w = await openWitness(dirs.campaignDir);
    try {
      expect(w.coordinator.state()).toBeUndefined();
    } finally {
      await w.campaign.close();
    }
  }, 120_000);

  it.each([
    ["equal to the canonical time", T_OPEN],
    ["before the canonical time", at(40)],
    ["in another unit", { unit: "other-unit", value: 500 }],
  ])(
    "a completion boundary %s is not ahead and is refused",
    async (_name, boundary) => {
      const dirs = await scenarioCampaign();
      const doc = demandDoc();
      doc.production.completion_at = boundary;
      await refused(dirs, doc, "HORIZON_NOT_AHEAD");
    },
    120_000,
  );
});

describe("the Reserve must be a fresh one at the carrier's own locus, and the owners must admit the pair", () => {
  it("an absent Reserve is refused", async () => {
    const dirs = await scenarioCampaign();
    const doc = demandDoc();
    doc.production.reserve_id = "reserve-none";
    await refused(dirs, doc, "RESERVE_NOT_COMMITTED", /no Reserve reserve-none/);
  }, 120_000);

  it("a Reserve at another locus of the same world is refused: the process is local", async () => {
    const dirs = await localityCampaign();
    const added = await addLocality(dirs, writeLocality(localityDoc()));
    expect(added.result.status).toBe("ADDITIONAL_LOCALITY_READY");
    const t = await import("../support/initial-population.ts");
    await t.establishTime(dirs);
    expect((await addPopulation(dirs, writePopulation(populationDoc()))).result.status).toBe(
      "POPULATION_READY",
    );
    const { NEW_LOCUS_ID } = await import("../support/additional-locality.ts");
    expect(
      (await addReserve(dirs, writeReserve(reserveDoc({ locus_id: NEW_LOCUS_ID })))).result.status,
    ).toBe("RESERVE_READY");
    await refused(dirs, demandDoc(), "RESERVE_NOT_AT_LOCALITY", new RegExp(`locus ${LOCUS_ID}`));
  }, 120_000);

  const owner: [string, (d: any) => void, RegExp][] = [
    [
      "an input the Reserve cannot support (an incompatible claim)",
      set(["production", "transformation", "input_quantity", "amount"], RESERVE_AMOUNT + 1),
      /start: CLAIM_INCOMPATIBLE/,
    ],
    [
      "an input in another unit than the Reserve is accounted in",
      set(["production", "transformation", "input_quantity", "unit"], "barrel"),
      /start: /,
    ],
    [
      "an output of another class than the demand asked for",
      set(["production", "transformation", "output_class"], "other-good"),
      /start: /,
    ],
    [
      "an output of another quantity than the demand asked for",
      set(["production", "transformation", "output_quantity", "amount"], 2),
      /start: /,
    ],
    [
      "an output in another unit than the demand asked for",
      set(["production", "transformation", "output_quantity", "unit"], "barrel"),
      /start: /,
    ],
  ];
  for (const [name, mutate, detail] of owner)
    it(`${name} is refused by the owner path before anything is written`, async () => {
      const dirs = await scenarioCampaign();
      const doc = demandDoc();
      mutate(doc);
      await refused(dirs, doc, "INVALID_PROCESS", detail);
    }, 120_000);

  it("an input of exactly the whole Reserve is supported, and a claim is not consumption", async () => {
    const dirs = await scenarioCampaign();
    const doc = demandDoc();
    doc.production.transformation.input_quantity.amount = RESERVE_AMOUNT;
    const { result } = await addDemand(dirs, writeDemand(doc));
    expect(result.status, JSON.stringify(result)).toBe("LOCAL_DEMAND_READY");
    const w = await openWitness(dirs.campaignDir);
    try {
      expect(w.production.reserve(RESERVE_ID)!.value.quantity.amount).toBe(RESERVE_AMOUNT);
    } finally {
      await w.campaign.close();
    }
  }, 120_000);
});

describe("one initial process: another demand or operation is never built beside", () => {
  it("a demand another writer issued blocks the path, even under another identifier", async () => {
    const dirs = await scenarioCampaign();
    const c = await openWitness(dirs.campaignDir);
    try {
      const r = await c.economy.issueDemand({
        group_id: "g-foreign",
        intent_id: "i-foreign",
        cause: "c-foreign",
        basis: "b",
        secrecy: "s",
        demand: {
          demand_envelope_id: "demand-foreign",
          carrier: unitCarrier("unit-02"),
          demand_entry: { output_class: OUTPUT_CLASS, quantity: { amount: 1, unit: OUTPUT_UNIT } },
        },
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
    } finally {
      await c.campaign.close();
    }
    await refused(dirs, demandDoc(), "DEMAND_CONFLICT", /another demand is already held/, {
      ...NOTHING,
      demand: false,
    });
  }, 120_000);

  it("the same demand identifier already held by another writer is a conflict, never replaced", async () => {
    const dirs = await scenarioCampaign();
    const c = await openWitness(dirs.campaignDir);
    try {
      const other = demandDoc().demand;
      other.demand_entry.quantity.amount = 2;
      const r = await c.economy.issueDemand({
        group_id: "g-foreign",
        intent_id: "i-foreign",
        cause: "c-foreign",
        basis: "b",
        secrecy: "s",
        demand: other,
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
    } finally {
      await c.campaign.close();
    }
    await refused(dirs, demandDoc(), "DEMAND_CONFLICT", undefined, {
      ...NOTHING,
      demand: true,
      request: true,
    });
  }, 120_000);

  it("a second process offered after the first is established is refused: a duplicate operation, a second demand and a restart of the same request", async () => {
    const dirs = await scenarioCampaign();
    expect((await addDemand(dirs, writeDemand(demandDoc()))).result.status).toBe(
      "LOCAL_DEMAND_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const second = demandDoc();
    second.demand.demand_envelope_id = "demand-ashfall-2";
    second.production.request_key = economyRequestKey("request:demand-ashfall-2");
    const a = await addDemand(dirs, writeDemand(second), []);
    expect(a.result.status).toBe("DEMAND_CONFLICT");
    expect(a.terminal.asked()).toBe(0);

    // the same demand with a different premise for its production act is a different proposal over a held demand
    const changed = demandDoc();
    changed.production.completion_at = at(300);
    const b = await addDemand(dirs, writeDemand(changed), []);
    expect(b.result.status).toBe("DEMAND_CONFLICT");
    expect(b.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);

    // owner level: the request fixes ONE operation (a duplicate is refused) and a retried intent with other content is a conflict
    const w = await openWitness(dirs.campaignDir);
    try {
      const dup = await w.production.startOperation({
        group_id: "g-dup",
        intent_id: "i-dup",
        cause: "c-dup",
        basis: "b",
        secrecy: "s",
        start: {
          request_key: REQUEST_KEY,
          reserve_id: RESERVE_ID,
          transformation: {
            input_quantity: { amount: 1, unit: RESERVE_UNIT },
            output_quantity: { amount: 1, unit: OUTPUT_UNIT },
            output_class: OUTPUT_CLASS,
            output_condition: "dry-cured",
          },
          completion_at: at(300),
        },
      });
      expect(dup.ok ? "OK" : dup.error.code).toBe("VERSION_CONFLICT");
      const altered = demandDoc().demand;
      altered.demand_entry.quantity.amount = 9;
      const retry = await w.economy.issueDemand({
        group_id: "operator-initial-local-demand:x:demand",
        intent_id: w.campaign.store.getFact(economyDemandKey(DEMAND_ID))!.provenance.intent_id,
        cause: "c",
        basis: "b",
        secrecy: "s",
        demand: altered,
      });
      expect(retry.ok ? "OK" : retry.error.code).toBe("INTENT_CONFLICT");
    } finally {
      await w.campaign.close();
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("the operator's confirmation is required and exact", () => {
  it.each([
    ["decline", "decline" as const],
    ["end of input", "eof" as const],
    ["a stale (previous prompt's) phrase", "stale" as const],
    [
      "another verb's phrase",
      (c: string) => c.replace("establish-local-demand", "establish-population"),
    ],
    [
      "the reserve verb's phrase",
      (c: string) => c.replace("establish-local-demand", "establish-reserve"),
    ],
    ["free text", () => "yes"],
    ["an empty line", () => ""],
  ])(
    "%s writes nothing",
    async (_name, reply) => {
      const dirs = await scenarioCampaign();
      const head = await headOf(dirs.campaignDir);
      const { result } = await addDemand(dirs, writeDemand(demandDoc()), [reply as any]);
      expect(result.status).toBe("DECLINED");
      expect(await headOf(dirs.campaignDir)).toEqual(head);
      expect(await held(dirs.campaignDir)).toEqual(NOTHING);
    },
    120_000,
  );
});

describe("the campaign must still be at its pre-play setting", () => {
  it("a bound player character closes the path: refused with nothing written", async () => {
    const dirs = await scenarioCampaign();
    await bindPlayer(dirs);
    await refused(dirs, demandDoc(), "PRE_PLAY_CLOSED", /player character/);
  }, 120_000);

  it("a bound player character closes the path even for an identical replay of a committed process", async () => {
    const dirs = await scenarioCampaign();
    const file = writeDemand(demandDoc());
    expect((await addDemand(dirs, file)).result.status).toBe("LOCAL_DEMAND_READY");
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addDemand(dirs, file, []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it.each([
    ["the first source", /\/source\//],
    ["the first locus", /^world\/[^/]+\/locus\//],
    ["the world", /\/profile$/],
  ])(
    "%s advanced by a later owner write closes the path: refused with nothing written",
    async (_name, pattern) => {
      const dirs = await scenarioCampaign();
      const head = await headOf(dirs.campaignDir);
      const open = LocalOperatorSession.open;
      vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
        const opened = await open.call(LocalOperatorSession, p);
        if (opened.ok) {
          const store = opened.value.campaign.store;
          const advance = (f: any) => (f && pattern.test(f.key) ? { ...f, version: 2 } : f);
          const getFact = store.getFact.bind(store);
          vi.spyOn(store, "getFact").mockImplementation((key: string) => advance(getFact(key)));
          const listFacts = store.listFacts.bind(store);
          vi.spyOn(store, "listFacts").mockImplementation(() => listFacts().map(advance));
        }
        return opened;
      });
      const { result, terminal } = await addDemand(dirs, writeDemand(demandDoc()), []);
      vi.restoreAllMocks();
      expect(result.status).toBe("PRE_PLAY_CLOSED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    },
    120_000,
  );

  it("a Reserve Production has already changed is not a fresh Reserve: the second act is refused", async () => {
    const dirs = await scenarioCampaign();
    const head = await headOf(dirs.campaignDir);
    const open = LocalOperatorSession.open;
    vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
      const opened = await open.call(LocalOperatorSession, p);
      if (opened.ok) {
        const store = opened.value.campaign.store;
        const advance = (f: any) =>
          f && f.key === productionReserveKey(RESERVE_ID) ? { ...f, version: 2 } : f;
        const getFact = store.getFact.bind(store);
        vi.spyOn(store, "getFact").mockImplementation((key: string) => advance(getFact(key)));
      }
      return opened;
    });
    const { result, terminal } = await addDemand(dirs, writeDemand(demandDoc()), []);
    vi.restoreAllMocks();
    expect(result.status).toBe("RESERVE_NOT_COMMITTED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("once the earned boundary has resolved the operation, an identical rerun is PRE_PLAY_CLOSED, never READY or a conflict", async () => {
    const dirs = await scenarioCampaign();
    const file = writeDemand(demandDoc());
    expect((await addDemand(dirs, file)).result.status).toBe("LOCAL_DEMAND_READY");
    const { registerOperation, advanceRequest } =
      await import("../support/initial-local-demand.ts");
    const w = await openWitness(dirs.campaignDir);
    try {
      await registerOperation(w);
      expect((await w.coordinator.advance(advanceRequest("tx-due"))).ok).toBe(true);
    } finally {
      await w.campaign.close();
    }
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addDemand(dirs, file, []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 180_000);

  it("a canonical time that moved after the process was established (even short of the boundary) closes the replay", async () => {
    const dirs = await scenarioCampaign();
    const file = writeDemand(demandDoc());
    expect((await addDemand(dirs, file)).result.status).toBe("LOCAL_DEMAND_READY");
    const { registerOperation, advanceRequest } =
      await import("../support/initial-local-demand.ts");
    const w = await openWitness(dirs.campaignDir);
    try {
      await registerOperation(w);
      expect((await w.coordinator.advance(advanceRequest("tx-early", at(130)))).ok).toBe(true);
    } finally {
      await w.campaign.close();
    }
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addDemand(dirs, file, []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(result.details.join(" ")).toContain("canonical time has moved");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 180_000);

  it("a Population ledger and Cohort composed AFTER the demand was committed (stale pins) close the replay", async () => {
    const dirs = await scenarioCampaign();
    const file = writeDemand(demandDoc());
    expect((await addDemand(dirs, file)).result.status).toBe("LOCAL_DEMAND_READY");
    const pop = await openPopulationWitness(dirs.campaignDir);
    try {
      expect((await engageClose(pop)).ok).toBe(true);
    } finally {
      await pop.campaign.close();
    }
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addDemand(dirs, file, []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 180_000);
});

describe("nobody can supply the output, the satisfaction or the access around the owners", () => {
  const raw = (
    store: CanonicalCampaign["store"],
    owner: string,
    facet: string,
    key: string,
    value: unknown,
    expected: number,
    anchor: string,
  ): CommitGroup => ({
    campaign_id: LOCALITY_CAMPAIGN,
    group_id: `raw-${key}`,
    intent_id: `raw-intent-${key}`,
    owner,
    facet,
    cause: "raw",
    rule: store.getFact(anchor)!.provenance.rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key,
        owner,
        facet,
        value: value as never,
        unit: null,
        basis: "b",
        secrecy: "s",
        expected_version: expected,
      },
    ],
  });

  it("a fabricated completion, accepted entity, realization and a rewritten demand, operation or Reserve are all refused; the demand stays open", async () => {
    const dirs = await scenarioCampaign();
    expect((await addDemand(dirs, writeDemand(demandDoc()))).result.status).toBe(
      "LOCAL_DEMAND_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const w = await openWitness(dirs.campaignDir);
    try {
      const store = w.campaign.store;
      const demand = store.getFact(economyDemandKey(DEMAND_ID))!;
      const op = store.getFact(productionOperationKey(OPERATION_ID))!;
      const reserve = store.getFact(productionReserveKey(RESERVE_ID))!;
      const attempts: [string, CommitGroup][] = [
        [
          "a fabricated realization",
          raw(
            store,
            "economy",
            "economy_state",
            economyRealizationKey(DEMAND_ID),
            { realized_access: {} },
            0,
            economyDemandKey(DEMAND_ID),
          ),
        ],
        [
          "a fabricated completion",
          raw(
            store,
            "production",
            "production_state",
            productionCompletionKey(OPERATION_ID),
            { completed: true },
            0,
            productionOperationKey(OPERATION_ID),
          ),
        ],
        [
          "a fabricated accepted entity",
          raw(
            store,
            "world_state",
            "world_fallback_physical_entity",
            worldFallbackEntityKey(WORLD_ID, `durable:${OPERATION_ID}`),
            { entity_id: `durable:${OPERATION_ID}` },
            0,
            productionOperationKey(OPERATION_ID),
          ),
        ],
        [
          "a rewritten demand (quantity)",
          raw(
            store,
            "economy",
            "economy_state",
            demand.key,
            {
              ...(demand.value as any),
              demand_entry: {
                output_class: OUTPUT_CLASS,
                quantity: { amount: 9, unit: OUTPUT_UNIT },
              },
            },
            demand.version,
            demand.key,
          ),
        ],
        [
          "an operation marked completed by hand",
          raw(
            store,
            "production",
            "production_state",
            op.key,
            {
              ...(op.value as any),
              status: { state: "COMPLETED", completed_at: at(160), completion_fact_key: "x" },
            },
            op.version,
            op.key,
          ),
        ],
        [
          "a Reserve debited by hand",
          raw(
            store,
            "production",
            "production_state",
            reserve.key,
            { ...(reserve.value as any), quantity: { amount: 1, unit: RESERVE_UNIT } },
            reserve.version,
            reserve.key,
          ),
        ],
      ];
      for (const [name, group] of attempts) {
        const r = await store.commit(group);
        expect(r.ok, name).toBe(false);
      }
      expect(w.economy.access(DEMAND_ID)).toEqual({ state: "DEMAND_OPEN" });
      expect(w.production.availability(OPERATION_ID)).toEqual({ state: "NOT_COMPLETED" });
    } finally {
      await w.campaign.close();
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("the opening does not make the demand a title, a stock, a priority or a purchasing capability", async () => {
    const dirs = await scenarioCampaign();
    expect((await addDemand(dirs, writeDemand(demandDoc()))).result.status).toBe(
      "LOCAL_DEMAND_READY",
    );
    const w = await openWitness(dirs.campaignDir);
    try {
      const text = JSON.stringify([
        w.economy.demand(DEMAND_ID)!.value,
        w.economy.request(DEMAND_ID)!.value,
        w.production.operation(OPERATION_ID)!.value,
        w.production.claim(`claim:${OPERATION_ID}`)!.value,
      ]);
      expect(text).not.toMatch(
        /"(stock|title|holder|price|currency|purchas\w*|entitlement|inventory)"/,
      );
      expect(w.economy.request(DEMAND_ID)!.value.priority_authority_ref).toBeNull();
      expect(w.production.claim(`claim:${OPERATION_ID}`)!.value.priority_basis).toBeNull();
      expect(w.economy.demand(DEMAND_ID)!.value.allocation.nature).toBe(
        "ECONOMIC_ALLOCATION_CLAIM_NOT_STOCK_TITLE_OR_RESERVATION",
      );
    } finally {
      await w.campaign.close();
    }
  }, 120_000);
});
