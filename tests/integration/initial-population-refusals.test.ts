/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw population documents */
// Refusals of the initial local Population and residency Cohort admission. Each case independently refutes a false success claim: the
// status is a refusal, the console is not asked where the refusal precedes the choice, and the campaign's head (revision, state and
// journal hashes) is exactly what it was — no owner write of any kind, and in particular never a ledger without its Cohort, a duplicate
// unit, a Cohort result, a close or an adopted synthetic outcome.
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  FACET_POPULATION_STATE,
  OWNER_POPULATION,
  populationCloseKey,
  populationCohortKey,
  populationLedgerKey,
  worldProfileKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { CanonicalCampaign } from "@immortalis/engine";
import { LocalOperatorSession } from "@immortalis/operator";
import { fixtureWorld, publication, syntheticGroup } from "@immortalis/testkit";
import {
  COHORT_ID,
  LEDGER_ID,
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  PLACE_QUAY,
  RESIDENT_IDS,
  SOURCE_KEY,
  T_OPEN,
  WORLD_ID,
  addPopulation,
  bindPlayer,
  freshDirs,
  headOf,
  held,
  localityCampaign,
  openOrdinary,
  openWitness,
  populationDoc,
  timedAdditionalCampaign,
  timedCampaign,
  writePopulation,
} from "../support/initial-population.ts";

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
  // the envelope of the document
  ["no format", without(["format"])],
  ["another format", set(["format"], "immortalis-additional-locality")],
  ["another format version", set(["format_version"], 2)],
  ["no ledger section", without(["ledger"])],
  ["no cohort section", without(["cohort"])],
  ["a top-level extra field", set(["members"], ["unit-01"])],
  ["a close claimed at the top level", set(["close"], { name: "x" })],
  ["a confirmed claim", set(["confirmed"], true)],
  // the ledger: exactly EstablishLedgerInput
  ["no ledger id", without(["ledger", "ledger_id"])],
  ["a ledger id that is a key path", set(["ledger", "ledger_id"], "led/ger")],
  ["no unit class", without(["ledger", "unit_class"])],
  ["no world", without(["ledger", "world_id"])],
  ["no locus", without(["ledger", "locus_id"])],
  ["no point (the opening time is never defaulted)", without(["ledger", "point"])],
  ["a point without its unit", without(["ledger", "point", "unit"])],
  ["a negative point", set(["ledger", "point", "value"], -1)],
  ["a non-integer point", set(["ledger", "point", "value"], 1.5)],
  ["no units array", without(["ledger", "units"])],
  ["an empty population (this path admits nonzero residents only)", set(["ledger", "units"], [])],
  ["a caller-supplied count", set(["ledger", "count"], { semantics: "EXACT", count: 5 })],
  ["a caller-supplied count number", set(["ledger", "count"], 5)],
  ["an owner field", set(["ledger", "owner"], "population")],
  ["a version field", set(["ledger", "version"], 1)],
  ["a consumed-envelopes field", set(["ledger", "consumed_envelopes"], [])],
  ["a basis-stamp field", set(["ledger", "basis_stamp"], {})],
  ["a locality field (derived, never authored)", set(["ledger", "locality"], {})],
  ["a labour-rate field", set(["ledger", "labor_rate"], 0.3)],
  ["a birth-rate field", set(["ledger", "birth_rate"], 0.02)],
  ["a unit with no id", without(["ledger", "units", "0", "unit_id"])],
  ["a unit with no residence", without(["ledger", "units", "0", "residence"])],
  ["a unit with no presence", without(["ledger", "units", "0", "presence"])],
  [
    "a unit with no burden allocation (required, null when none, never defaulted)",
    without(["ledger", "units", "0", "burden_allocation"]),
  ],
  ["a unit that names an actor", set(["ledger", "units", "0", "actor_id"], "pc-1")],
  ["a unit with a labour claim", set(["ledger", "units", "0", "labor_claim"], "mill")],
  ["a unit with a mind", set(["ledger", "units", "0", "loyalty"], "high")],
  ["a unit id that is a key path", set(["ledger", "units", "0", "unit_id"], "unit/01")],
  ["an empty residence", set(["ledger", "units", "0", "residence"], "")],
  [
    "duplicate unit ids (a unit is counted once)",
    (d) => d.ledger.units.push({ ...d.ledger.units[0] }),
  ],
  // the Cohort: the bounded family, each field explicit
  ["no Cohort id", without(["cohort", "cohort_id"])],
  ["no unit class on the Cohort (never defaulted)", without(["cohort", "unit_class"])],
  ["no custodian", without(["cohort", "count_custodian"])],
  ["another custodian", set(["cohort", "count_custodian"], "culture")],
  ["no criterion", without(["cohort", "criterion"])],
  ["an external criterion owner", set(["cohort", "criterion"], { owner: "culture", ref: null })],
  [
    "an externally qualified criterion",
    set(["cohort", "criterion"], {
      owner: "culture",
      ref: { owner: "culture", fact_key: "culture/status" },
    }),
  ],
  [
    "a Population criterion that carries a reference",
    set(["cohort", "criterion"], {
      owner: "population",
      ref: { owner: "population", fact_key: "x" },
    }),
  ],
  ["no indexed fact", without(["cohort", "indexed_fact"])],
  ["a PRESENCE-indexed Cohort", set(["cohort", "indexed_fact"], "PRESENCE")],
  ["a BURDEN_LOCUS-indexed Cohort", set(["cohort", "indexed_fact"], "BURDEN_LOCUS")],
  [
    "a LABOR_CLAIM-indexed Cohort (not representable)",
    set(["cohort", "indexed_fact"], "LABOR_CLAIM"),
  ],
  ["a NAMED_SUBSET Cohort", set(["cohort", "indexed_fact"], "NAMED_SUBSET")],
  ["no scope", without(["cohort", "scope"])],
  ["another ledger in scope", set(["cohort", "scope", "ledger_id"], "ledger-other")],
  ["no place in scope", without(["cohort", "scope", "place"])],
  [
    "a place that is not the selected established locus",
    set(["cohort", "scope", "place"], PLACE_QUAY),
  ],
  ["a unit class that is not the ledger's", set(["cohort", "unit_class"], "livestock")],
  ["no membership basis", without(["cohort", "membership_basis"])],
  [
    "the external-criterion membership basis",
    set(["cohort", "membership_basis"], "INDEXED_FACT_AT_PLACE_AND_EXTERNAL_CRITERION"),
  ],
  ["no form", without(["cohort", "form"])],
  [
    "a CONSERVED_PARTITION form",
    (d) => {
      d.cohort.form = "CONSERVED_PARTITION";
      d.cohort.overlap = { declaration: "DISJOINT_PARTITION", partition_id: "partition-1" };
    },
  ],
  [
    "a partition overlap on a view",
    set(["cohort", "overlap"], { declaration: "DISJOINT_PARTITION", partition_id: "p" }),
  ],
  ["no overlap declaration", without(["cohort", "overlap"])],
  ["a BOUNDED cardinality", set(["cohort", "cardinality_semantics"], "BOUNDED")],
  ["an UNQUANTIFIED cardinality", set(["cohort", "cardinality_semantics"], "UNQUANTIFIED")],
  ["no cardinality", without(["cohort", "cardinality_semantics"])],
  ["no temporal read", without(["cohort", "temporal_read"])],
  ["an AS-OF-NOW temporal read", set(["cohort", "temporal_read", "mode"], "AS-OF-NOW")],
  [
    "another close basis",
    set(["cohort", "temporal_read", "close_basis"], {
      name: "culture-close",
      producer: { owner: "culture", operation: "x" },
    }),
  ],
  ["no retention", without(["cohort", "retention"])],
  ["VERSIONED retention", set(["cohort", "retention"], "VERSIONED")],
  ["no invalidators", without(["cohort", "invalidators"])],
  ["empty invalidators (required, nonempty)", set(["cohort", "invalidators"], [])],
  [
    "an extra invalidator",
    set(
      ["cohort", "invalidators"],
      [{ fact_key: populationLedgerKey(LEDGER_ID) }, { fact_key: "other/key" }],
    ),
  ],
  [
    "another ledger's invalidator",
    set(["cohort", "invalidators"], [{ fact_key: populationLedgerKey("ledger-other") }]),
  ],
  ["no retirement", without(["cohort", "retirement"])],
  ["another retirement predicate", set(["cohort", "retirement", "predicate"], "NEVER")],
  // a result, a count, a close or a rate has no place in the proposal
  [
    "a Cohort result",
    set(["cohort", "result"], {
      cardinality: { semantics: "EXACT", count: 3 },
      members: RESIDENT_IDS,
    }),
  ],
  ["a Cohort member list", set(["cohort", "members"], RESIDENT_IDS)],
  ["a Cohort count", set(["cohort", "count"], 3)],
  ["a rate field", set(["cohort", "rate"], 0.5)],
  ["a probability field", set(["cohort", "probability"], 0.5)],
];

describe("an unauthored, over-claiming or ineligible proposal is refused before the console is asked", () => {
  for (const [name, mutate] of invalid)
    it(name, async () => {
      const dirs = await timedCampaign();
      const head = await headOf(dirs.campaignDir);
      const doc = populationDoc();
      mutate(doc);
      const { result, terminal } = await addPopulation(dirs, writePopulation(doc), []);
      expect(result.status, JSON.stringify(result.details)).toBe("INVALID_POPULATION");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
      expect(await held(dirs.campaignDir)).toEqual({
        ledger: false,
        cohort: false,
        violations: [],
      });
    });

  it("a file that is not JSON, or is a list, or is empty", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    for (const text of ["{not json", "[]", "", "null", '"people"']) {
      const { result, terminal } = await addPopulation(dirs, writePopulation(text), []);
      expect(result.status, text).toBe("INVALID_POPULATION");
      expect(terminal.asked()).toBe(0);
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a bare ledger input (no Cohort, no envelope) is not a population", async () => {
    const dirs = await timedCampaign();
    const { result } = await addPopulation(dirs, writePopulation(populationDoc().ledger), []);
    expect(result.status).toBe("INVALID_POPULATION");
  });
});

describe("an untrusted, unreadable, stale or tampered file is refused", () => {
  it("a file others can write, a link, a directory, a missing file", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const writable = writePopulation(populationDoc(), 0o666);
    chmodSync(writable, 0o666);
    expect((await addPopulation(dirs, writable, [])).result.status).toBe(
      "POPULATION_FILE_UNTRUSTED",
    );

    const real = writePopulation(populationDoc());
    const link = join(dirname(real), "link.json");
    symlinkSync(real, link);
    expect((await addPopulation(dirs, link, [])).result.status).toBe("POPULATION_FILE_UNREADABLE");

    expect((await addPopulation(dirs, dirname(real), [])).result.status).toBe(
      "POPULATION_FILE_UNTRUSTED",
    );

    const gone = writePopulation(populationDoc());
    rmSync(gone);
    expect((await addPopulation(dirs, gone, [])).result.status).toBe("POPULATION_FILE_UNREADABLE");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a file larger than a population can be", async () => {
    const dirs = await timedCampaign();
    const doc = populationDoc();
    doc.ledger.units = Array.from({ length: 1500 }, (_, i) => ({
      unit_id: `unit-${String(i).padStart(5, "0")}`,
      residence: LOCUS_ID,
      presence: LOCUS_ID,
      burden_allocation: null,
    }));
    const { result } = await addPopulation(dirs, writePopulation(doc), []);
    expect(result.status).toBe("INVALID_POPULATION");
  });

  it("a file changed after it was read cannot change what was confirmed: the shown proposal is the committed proposal", async () => {
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    const tampered = populationDoc();
    tampered.ledger.ledger_id = "ledger-tampered";
    tampered.cohort.scope.ledger_id = "ledger-tampered";
    tampered.cohort.invalidators = [{ fact_key: populationLedgerKey("ledger-tampered") }];
    tampered.ledger.units = tampered.ledger.units.slice(0, 1);
    const { result } = await addPopulation(dirs, file, [
      (challenge) => {
        writeFileSync(file, JSON.stringify(tampered));
        return challenge;
      },
    ]);
    expect(result.status).toBe("POPULATION_READY");
    const campaign = await openOrdinary(dirs.campaignDir);
    try {
      expect(campaign.store.getFact(populationLedgerKey(LEDGER_ID))).toBeDefined();
      expect(campaign.store.getFact(populationLedgerKey("ledger-tampered"))).toBeUndefined();
    } finally {
      await campaign.close();
    }
  });
});

describe("no confirmed original locality, no package, a foreign package", () => {
  it("a package directory that does not exist is never created", async () => {
    const dirs = freshDirs();
    const { result } = await addPopulation(dirs, writePopulation(populationDoc()), []);
    expect(result.status).toBe("SESSION_UNAVAILABLE");
    expect(existsSync(dirs.campaignDir)).toBe(false);
  });

  it("another campaign identity is refused and nothing is written", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addPopulation(dirs, writePopulation(populationDoc()), [], {
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
      buildId: "initial-population-test",
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
      const { result, terminal } = await addPopulation(dirs, writePopulation(populationDoc()), []);
      expect(result.status).toBe("LOCALITY_NOT_ESTABLISHED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    });
});

describe("the canonical time the opening state is established at must exist and be the campaign's", () => {
  it("a campaign that holds no canonical time is refused as a missing prerequisite — never as a success, and no time is created", async () => {
    const dirs = await localityCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addPopulation(dirs, writePopulation(populationDoc()), []);
    expect(result.status).toBe("TIME_NOT_ESTABLISHED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const c = await openOrdinary(dirs.campaignDir);
    expect(c.store.getFact("temporal/state")).toBeUndefined();
    await c.close();
  });

  it.each([
    [
      "an earlier point",
      (d: any) => (d.ledger.point = { unit: T_OPEN.unit, value: T_OPEN.value - 1 }),
    ],
    [
      "a later point",
      (d: any) => (d.ledger.point = { unit: T_OPEN.unit, value: T_OPEN.value + 1 }),
    ],
    [
      "a point in another unit",
      (d: any) => (d.ledger.point = { unit: "other-unit", value: T_OPEN.value }),
    ],
    ["the zero point", (d: any) => (d.ledger.point = { unit: T_OPEN.unit, value: 0 })],
  ])(
    "%s is not the campaign's canonical time: refused before the console is asked",
    async (_n, mutate) => {
      const dirs = await timedCampaign();
      const head = await headOf(dirs.campaignDir);
      const doc = populationDoc();
      mutate(doc);
      const { result, terminal } = await addPopulation(dirs, writePopulation(doc), []);
      expect(result.status).toBe("TIME_MISMATCH");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    },
  );
});

describe("a proposal for another world or locus, or one that collides with a held identity", () => {
  it("a foreign world is refused", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const doc = populationDoc();
    doc.ledger.world_id = "world-other";
    const { result, terminal } = await addPopulation(dirs, writePopulation(doc), []);
    expect(result.status).toBe("POPULATION_NOT_AT_LOCALITY");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a locus that no owner committed is refused (an uncommitted locus is not a place to settle)", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const doc = populationDoc();
    doc.ledger.locus_id = "locus-nowhere";
    doc.cohort.scope.place = "locus-nowhere";
    const { result, terminal } = await addPopulation(dirs, writePopulation(doc), []);
    expect(result.status).toBe("POPULATION_NOT_AT_LOCALITY");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a locus committed by another writer than the operator's confirmed commands is refused", async () => {
    const dirs = await timedCampaign();
    const c = await openOrdinary(dirs.campaignDir);
    const r = await c.establishLocus({
      ...publication(70),
      locus: {
        locus_id: "locus-foreign",
        world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
        designation: "A place somebody else committed",
        constraints: [],
      },
    });
    expect(r.ok).toBe(true);
    await c.close();
    const head = await headOf(dirs.campaignDir);
    const doc = populationDoc();
    doc.ledger.locus_id = "locus-foreign";
    doc.cohort.scope.place = "locus-foreign";
    const { result, terminal } = await addPopulation(dirs, writePopulation(doc), []);
    expect(result.status).toBe("POPULATION_NOT_AT_LOCALITY");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an additional locus committed without its source is incomplete and is refused", async () => {
    const dirs = await timedCampaign();
    const c = await openOrdinary(dirs.campaignDir);
    const id = "b".repeat(32);
    const r = await c.establishLocus({
      ...publication(71),
      group_id: `operator-additional-locality:${id}:locus`,
      intent_id: `operator-additional-locality-intent:${id}:locus`,
      locus: {
        locus_id: "locus-half",
        world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
        designation: "A locus whose source never committed",
        constraints: [],
      },
    });
    expect(r.ok).toBe(true);
    await c.close();
    const head = await headOf(dirs.campaignDir);
    const doc = populationDoc();
    doc.ledger.locus_id = "locus-half";
    doc.cohort.scope.place = "locus-half";
    const { result, terminal } = await addPopulation(dirs, writePopulation(doc), []);
    expect(result.status).toBe("POPULATION_NOT_AT_LOCALITY");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a second population is refused while a ledger is held: a different ledger, the same cohort id under another ledger, or the same ledger with another Cohort", async () => {
    const dirs = await timedAdditionalCampaign();
    expect((await addPopulation(dirs, writePopulation(populationDoc()))).result.status).toBe(
      "POPULATION_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const variants: [string, (d: any) => void][] = [
      [
        "another ledger at another locus",
        (d) => {
          d.ledger.ledger_id = "ledger-second";
          d.cohort.scope.ledger_id = "ledger-second";
          d.cohort.invalidators = [{ fact_key: populationLedgerKey("ledger-second") }];
          d.cohort.cohort_id = "cohort-second";
        },
      ],
      [
        "the same cohort id under another ledger",
        (d) => {
          d.ledger.ledger_id = "ledger-second";
          d.cohort.scope.ledger_id = "ledger-second";
          d.cohort.invalidators = [{ fact_key: populationLedgerKey("ledger-second") }];
        },
      ],
      ["the same ledger with another Cohort id", (d) => (d.cohort.cohort_id = "cohort-second")],
      ["the same ledger with a changed unit", (d) => (d.ledger.units[0].residence = PLACE_QUAY)],
    ];
    for (const [name, mutate] of variants) {
      const doc = populationDoc();
      mutate(doc);
      const { result, terminal } = await addPopulation(dirs, writePopulation(doc), []);
      expect(result.status, name).toBe("LEDGER_CONFLICT");
      expect(terminal.asked(), name).toBe(0);
      expect(await headOf(dirs.campaignDir), name).toEqual(head);
    }
  });
});

describe("the operator's confirmation is required and exact", () => {
  it.each([
    ["decline", "decline" as const],
    ["end of input", "eof" as const],
    ["a stale (previous prompt's) phrase", "stale" as const],
    [
      "another verb's phrase",
      (c: string) => c.replace("establish-population", "establish-reserve"),
    ],
    [
      "the locality verb's phrase",
      (c: string) => c.replace("establish-population", "establish-locality"),
    ],
    ["free text", () => "yes"],
    ["an empty line", () => ""],
  ])("%s writes nothing", async (_name, reply) => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result } = await addPopulation(dirs, writePopulation(populationDoc()), [reply as any]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect(await held(dirs.campaignDir)).toEqual({ ledger: false, cohort: false, violations: [] });
  });
});

describe("the campaign must still be at its pre-play setting", () => {
  it("a bound player character closes the path: refused with nothing written", async () => {
    const dirs = await timedCampaign();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addPopulation(dirs, writePopulation(populationDoc()), []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a bound player character closes the path even for an identical replay of a committed population", async () => {
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    expect((await addPopulation(dirs, file)).result.status).toBe("POPULATION_READY");
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addPopulation(dirs, file, []);
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
      const dirs = await timedCampaign();
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
      const { result, terminal } = await addPopulation(dirs, writePopulation(populationDoc()), []);
      vi.restoreAllMocks();
      expect(result.status).toBe("PRE_PLAY_CLOSED");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    },
  );
});

describe("nobody can supply the count, the Cohort result or a close around the owner", () => {
  const rawAsPopulation = (
    store: CanonicalCampaign["store"],
    key: string,
    value: unknown,
    expected: number,
  ): CommitGroup => ({
    campaign_id: LOCALITY_CAMPAIGN,
    group_id: `raw-${key}`,
    intent_id: `raw-intent-${key}`,
    owner: OWNER_POPULATION,
    facet: FACET_POPULATION_STATE,
    cause: "raw",
    rule: store.getFact(populationLedgerKey(LEDGER_ID))!.provenance.rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key,
        owner: OWNER_POPULATION,
        facet: FACET_POPULATION_STATE,
        value: value as never,
        unit: null,
        basis: "b",
        secrecy: "s",
        expected_version: expected,
      },
    ],
  });
  const codeOf = async (p: Promise<{ ok: boolean; error?: { code: string } }>) => {
    const r = await p;
    return r.ok ? "OK" : r.error!.code;
  };

  it("a fabricated close, a caller-set count, a forged Cohort result and a foreign owner's write are all refused, and the view stays unavailable", async () => {
    const dirs = await timedCampaign();
    expect((await addPopulation(dirs, writePopulation(populationDoc()))).result.status).toBe(
      "POPULATION_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const w = await openWitness(dirs.campaignDir);
    try {
      const store = w.campaign.store;
      const ledgerFact = store.getFact(populationLedgerKey(LEDGER_ID))!;
      const cohortFact = store.getFact(populationCohortKey(LEDGER_ID, COHORT_ID))!;

      // a fabricated close (no reconciliation produced it)
      expect(
        await codeOf(
          store.commit(
            rawAsPopulation(store, populationCloseKey(LEDGER_ID), { fabricated: true }, 0),
          ) as never,
        ),
      ).not.toBe("OK");
      // a caller-set count on the established ledger
      const inflated: any = structuredClone(ledgerFact.value);
      inflated.units.push({
        unit_id: "unit-99",
        residence: LOCUS_ID,
        presence: LOCUS_ID,
        burden_allocation: null,
      });
      inflated.count.count = inflated.units.length;
      expect(
        await codeOf(
          store.commit(
            rawAsPopulation(store, populationLedgerKey(LEDGER_ID), inflated, ledgerFact.version),
          ) as never,
        ),
      ).toBe("VALUE_INVALID");
      // a forged Cohort result: members and cardinality written outside a reconciliation
      const forged: any = structuredClone(cohortFact.value);
      forged.result = {
        cardinality: { semantics: "EXACT", count: 1 },
        members: ["unit-01"],
        basis_stamp: { basis: { kind: "ESTABLISHMENT", point: T_OPEN }, constituents: [] },
      };
      expect(
        await codeOf(
          store.commit(
            rawAsPopulation(
              store,
              populationCohortKey(LEDGER_ID, COHORT_ID),
              forged,
              cohortFact.version,
            ),
          ) as never,
        ),
      ).not.toBe("OK");
      // a second Cohort instantiated with a result already attached
      const second: any = structuredClone(cohortFact.value);
      second.ref.cohort_id = "cohort-forged";
      second.result = forged.result;
      expect(
        await codeOf(
          store.commit(
            rawAsPopulation(store, populationCohortKey(LEDGER_ID, "cohort-forged"), second, 0),
          ) as never,
        ),
      ).not.toBe("OK");
      // another owner's group over the Population key space
      for (const key of [
        populationLedgerKey(LEDGER_ID),
        populationCloseKey(LEDGER_ID),
        populationCohortKey(LEDGER_ID, COHORT_ID),
      ])
        expect(["KEY_NOT_ADMITTED", "FACT_OWNER_CONFLICT", "OWNER_NOT_REGISTERED"], key).toContain(
          await codeOf(
            store.commit(
              syntheticGroup(
                LOCALITY_CAMPAIGN,
                "SYNTHETIC-CRITERION-OWNER",
                901,
                key,
                { count: 99 },
                1,
              ),
            ) as never,
          ),
        );

      expect(w.population.cohortView(LEDGER_ID, COHORT_ID)).toMatchObject({
        ok: false,
        error: { code: "VIEW_UNAVAILABLE" },
      });
      expect(w.population.close(LEDGER_ID)).toBeUndefined();
      expect(w.campaign.verify()).toEqual([]);
    } finally {
      await w.campaign.close();
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });
});
