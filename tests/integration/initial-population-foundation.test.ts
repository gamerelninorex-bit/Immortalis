/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw population documents */
// The initial local Population and residency Cohort admission, end to end: a campaign whose ORIGINAL locality (and, in one case, an
// additional locality) the shipped commands committed, and whose Temporal owner holds canonical time, gains exactly TWO more facts — a
// Population-owned ledger and a Population-owned residency Cohort reference with no result, each at version 1 — and every earlier fact is
// left byte-identical. In a DISPOSABLE witness only, Population's own existing ordinary close is then engaged at a separate Temporal
// basis and derives the Cohort's exact members and count from the authored units' residence; the test sets neither. The units are
// authored opening premises: nothing here asserts an actor, a mind, a social truth, labour, a perception or a collection.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CohortFactSchema,
  PopulationBasisSchema,
  populationCloseKey,
  populationCohortKey,
  populationLedgerKey,
  worldLocusKey,
  worldProfileKey,
  worldSourceConditionKey,
} from "@immortalis/contracts";
import { canonicalEqual } from "@immortalis/engine";
import {
  COHORT_ID,
  LEDGER_ID,
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  NEW_LOCUS_ID,
  RESIDENT_IDS,
  SOURCE_KEY,
  T_CLOSE,
  T_OPEN,
  UNIT_CLASS,
  WORLD_ID,
  addPopulation,
  cohortDoc,
  engageClose,
  headOf,
  held,
  openOrdinary,
  openWitness,
  populationDoc,
  runPopulation,
  timedAdditionalCampaign,
  timedCampaign,
  unitDocs,
  writePopulation,
} from "../support/initial-population.ts";

const phrase = (s: string) => /type exactly "([^"]+)"/.exec(s)![1]!;

/** The ledger the Population owner is required to derive from `populationDoc()`, written out independently of the adapter (WS-001 §1, §2). */
const EXPECTED_LEDGER = (locus = LOCUS_ID, units = unitDocs()) => ({
  ledger_id: LEDGER_ID,
  unit_class: UNIT_CLASS,
  count_custodian: "population",
  locality: {
    world: { fact_key: worldProfileKey(WORLD_ID), entity_id: WORLD_ID },
    locus: { fact_key: worldLocusKey(WORLD_ID, locus), entity_id: locus },
  },
  overlap: "DISJOINT_RESIDENT_POPULATION",
  units,
  count: { semantics: "EXACT", count: units.length },
  consumed_envelopes: [],
  basis_stamp: { basis: { kind: "ESTABLISHMENT", point: T_OPEN }, constituents: [] },
});

describe("one confirmed initial Population is established at an established original locus", () => {
  it("writes exactly the ledger and the Cohort at version 1 and leaves the world, locus, source and time byte-identical", async () => {
    const dirs = await timedCampaign();
    const before = await openOrdinary(dirs.campaignDir);
    const factsBefore = before.store.listFacts();
    const headBefore = before.store.head();
    await before.close();
    expect(factsBefore.map((f) => f.key).sort()).toEqual(
      [
        worldProfileKey(WORLD_ID),
        worldLocusKey(WORLD_ID, LOCUS_ID),
        worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
        "temporal/state",
      ].sort(),
    );

    const { result, terminal } = await addPopulation(dirs, writePopulation(populationDoc()));
    expect(result.status, JSON.stringify(result.details)).toBe("POPULATION_READY");
    expect(
      terminal.said.filter((l) => l.startsWith("PROGRESS")).map((l) => l.split(" ")[1]),
    ).toEqual(["ledger", "cohort"]);

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

      const ledger = after.store.getFact(populationLedgerKey(LEDGER_ID))!;
      expect(ledger.key).toBe(`population/${LEDGER_ID}/ledger`);
      expect([ledger.owner, ledger.facet, ledger.version]).toEqual([
        "population",
        "population_state",
        1,
      ]);
      expect(ledger.provenance.group_id).toMatch(
        /^operator-initial-population:[0-9a-f]{32}:ledger$/,
      );
      expect(ledger.value).toEqual(EXPECTED_LEDGER());
      expect(PopulationBasisSchema.safeParse(ledger.value).success).toBe(true);

      const cohort = after.store.getFact(populationCohortKey(LEDGER_ID, COHORT_ID))!;
      expect(cohort.key).toBe(`population/${LEDGER_ID}/cohort/${COHORT_ID}`);
      expect([cohort.owner, cohort.facet, cohort.version]).toEqual([
        "population",
        "population_state",
        1,
      ]);
      expect(cohort.provenance.group_id).toMatch(
        /^operator-initial-population:[0-9a-f]{32}:cohort$/,
      );
      expect(cohort.value).toEqual({ ref: cohortDoc(), result: null });
      expect(CohortFactSchema.safeParse(cohort.value).success).toBe(true);

      // the ledger reads and depends on exactly the world and the locus; the Cohort on exactly the ledger
      const lg = after.store.committedGroup(ledger.provenance.intent_id)!;
      expect(lg.owner).toBe("population");
      expect(lg.writes).toHaveLength(1);
      expect(lg.writes[0]!.expected_version).toBe(0);
      expect(lg.reads.map((r) => `${r.key}@${r.version}`).sort()).toEqual(
        [`${worldProfileKey(WORLD_ID)}@1`, `${worldLocusKey(WORLD_ID, LOCUS_ID)}@1`].sort(),
      );
      const cg = after.store.committedGroup(cohort.provenance.intent_id)!;
      expect(cg.reads.map((r) => `${r.key}@${r.version}`)).toEqual([
        `${populationLedgerKey(LEDGER_ID)}@1`,
      ]);
      expect(cg.depends_on).toEqual([ledger.provenance.group_id]);

      // no close exists, and no Cohort result: nothing was derived by establishing
      expect(after.store.getFact(populationCloseKey(LEDGER_ID))).toBeUndefined();
      expect(after.store.getFact("temporal/state")!.version).toBe(1);
    } finally {
      await after.close();
    }
  });

  it("the authored residence, presence and burden allocation stay separate facts, and the count is the owner's EXACT count of units held", async () => {
    const dirs = await timedCampaign();
    expect((await addPopulation(dirs, writePopulation(populationDoc()))).result.status).toBe(
      "POPULATION_READY",
    );
    const w = await openWitness(dirs.campaignDir);
    try {
      const ledger = w.population.ledger(LEDGER_ID)!.value;
      expect(ledger.count).toEqual({ semantics: "EXACT", count: 5 });
      const by = new Map(ledger.units.map((u) => [u.unit_id, u]));
      expect(by.get("unit-02")).toMatchObject({ residence: LOCUS_ID, presence: "place-quay" });
      expect(by.get("unit-03")).toMatchObject({ burden_allocation: "place-fields" });
      expect(by.get("unit-04")).toMatchObject({ residence: "place-quay", presence: LOCUS_ID });
    } finally {
      await w.campaign.close();
    }
  });

  it("units authored out of order converge on the same ordered ledger and the same identity", async () => {
    const a = await timedCampaign();
    const b = await timedCampaign();
    const shuffled = populationDoc();
    shuffled.ledger.units = [...unitDocs()].reverse();
    expect((await addPopulation(a, writePopulation(populationDoc()))).result.status).toBe(
      "POPULATION_READY",
    );
    expect((await addPopulation(b, writePopulation(shuffled))).result.status).toBe(
      "POPULATION_READY",
    );
    expect(await headOf(a.campaignDir)).toEqual(await headOf(b.campaignDir));
  });

  it("shows the whole proposal for one confirmation before anything is written, and writes nothing on a refusal to confirm", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addPopulation(dirs, writePopulation(populationDoc()), [
      "decline",
    ]);
    expect(result.status).toBe("DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const shown = terminal.said.join("\n");
    for (const part of [
      LEDGER_ID,
      COHORT_ID,
      UNIT_CLASS,
      LOCUS_ID,
      WORLD_ID,
      "unit-04",
      "place-quay",
      "place-fields",
      "EXACT count: 5 authored units",
      "to commit, in this order: ledger → cohort",
      "result: NONE",
      "a Population Unit is not an actor",
      "no close is run",
    ])
      expect(shown, part).toContain(part);
    expect(terminal.asked()).toBe(1);
    expect(terminal.said.filter((l) => l.startsWith("PROGRESS"))).toEqual([]);
    expect(await held(dirs.campaignDir)).toEqual({ ledger: false, cohort: false, violations: [] });
  });

  it("repeating the same confirmed proposal is idempotent: verified and reported without a new console question or a new write", async () => {
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    expect((await addPopulation(dirs, file)).result.status).toBe("POPULATION_READY");
    const head = await headOf(dirs.campaignDir);

    const again = await addPopulation(dirs, file, []);
    expect(again.result.status).toBe("POPULATION_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("an altered proposal under the same ledger identifier is refused and nothing is replaced", async () => {
    const dirs = await timedCampaign();
    expect((await addPopulation(dirs, writePopulation(populationDoc()))).result.status).toBe(
      "POPULATION_READY",
    );
    const head = await headOf(dirs.campaignDir);
    const changes: ((d: any) => void)[] = [
      (d) => d.ledger.units.pop(),
      (d) => (d.ledger.units[0].presence = "place-elsewhere"),
      (d) => (d.ledger.units[0].unit_id = "unit-99"),
      (d) => (d.ledger.unit_class = "other-class"),
      (d) => (d.cohort.unit_class = "other-class"),
      (d) => (d.cohort.cohort_id = "cohort-other"),
    ];
    for (const change of changes) {
      const doc = populationDoc();
      change(doc);
      if (doc.cohort.unit_class !== doc.ledger.unit_class) continue;
      const { result, terminal } = await addPopulation(dirs, writePopulation(doc), []);
      expect(result.status, JSON.stringify(doc.ledger.units)).toBe("LEDGER_CONFLICT");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    }
  });
});

describe("a population at an additional locus the operator already confirmed", () => {
  it("is admitted at the additional locus, with that locus (not the first) as its locality and as the Cohort's place", async () => {
    const dirs = await timedAdditionalCampaign();
    const before = await openOrdinary(dirs.campaignDir);
    const factsBefore = before.store.listFacts();
    await before.close();

    const doc = populationDoc();
    doc.ledger.locus_id = NEW_LOCUS_ID;
    doc.cohort.scope.place = NEW_LOCUS_ID;
    doc.ledger.units = [
      {
        unit_id: "unit-01",
        residence: NEW_LOCUS_ID,
        presence: NEW_LOCUS_ID,
        burden_allocation: null,
      },
      { unit_id: "unit-02", residence: LOCUS_ID, presence: NEW_LOCUS_ID, burden_allocation: null },
    ];
    const { result } = await addPopulation(dirs, writePopulation(doc));
    expect(result.status, JSON.stringify(result.details)).toBe("POPULATION_READY");
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.verify()).toEqual([]);
      expect(c.store.getFact(populationLedgerKey(LEDGER_ID))!.value).toEqual(
        EXPECTED_LEDGER(NEW_LOCUS_ID, doc.ledger.units),
      );
      for (const f of factsBefore) expect(canonicalEqual(f, c.store.getFact(f.key))).toBe(true);
      expect(c.store.listFacts()).toHaveLength(factsBefore.length + 2);
    } finally {
      await c.close();
    }
  });
});

describe("a different campaign is isolated", () => {
  it("establishing in one leaves the other's facts unaffected", async () => {
    const one = await timedCampaign();
    const two = await timedCampaign();
    expect((await addPopulation(one, writePopulation(populationDoc()))).result.status).toBe(
      "POPULATION_READY",
    );
    expect(await held(two.campaignDir)).toEqual({ ledger: false, cohort: false, violations: [] });
  });
});

describe("the disposable witness: Population's OWN existing close derives the Cohort from the authored units", () => {
  it("before any close, the Cohort has no result and no consumer view is available", async () => {
    const dirs = await timedCampaign();
    expect((await addPopulation(dirs, writePopulation(populationDoc()))).result.status).toBe(
      "POPULATION_READY",
    );
    const w = await openWitness(dirs.campaignDir);
    try {
      expect(w.population.cohort(LEDGER_ID, COHORT_ID)!.value.result).toBeNull();
      expect(w.population.cohortView(LEDGER_ID, COHORT_ID)).toMatchObject({
        ok: false,
        error: { code: "VIEW_UNAVAILABLE" },
      });
      expect(w.population.close(LEDGER_ID)).toBeUndefined();
    } finally {
      await w.campaign.close();
    }
  });

  it("the genuine close at a later canonical time yields exactly the units RESIDENT at the locus — not those merely present there, nor those resident elsewhere", async () => {
    const dirs = await timedCampaign();
    expect((await addPopulation(dirs, writePopulation(populationDoc()))).result.status).toBe(
      "POPULATION_READY",
    );
    const w = await openWitness(dirs.campaignDir);
    try {
      const run = await engageClose(w);
      expect(run.ok, JSON.stringify(run)).toBe(true);
      expect(w.campaign.verify()).toEqual([]);

      const close = w.population.close(LEDGER_ID)!.value;
      expect(close.opening).toEqual({ count: 5, ledger_version: 1 });
      expect(close.closing).toEqual({ count: 5, ledger_version: 2 });
      expect(close.entries).toEqual([]);
      expect(close.exits).toEqual([]);
      expect(close.consumed_envelopes).toEqual([]);
      expect(close.resolution_point).toEqual(T_CLOSE);

      const cohort = w.population.cohort(LEDGER_ID, COHORT_ID)!;
      expect(cohort.fact.version).toBe(2);
      // the reference the operator committed is untouched by the close
      expect(cohort.value.ref).toEqual(cohortDoc());
      expect(cohort.value.result).toMatchObject({
        cardinality: { semantics: "EXACT", count: RESIDENT_IDS.length },
        members: RESIDENT_IDS,
        basis_stamp: { basis: { kind: "RECONCILIATION_CLOSE", resolution_point: T_CLOSE } },
      });
      // unit-04 is PRESENT at the locus but RESIDES on the quay; unit-05 resides in the fields: both are outside the Cohort
      expect(cohort.value.result!.members).not.toContain("unit-04");
      expect(cohort.value.result!.members).not.toContain("unit-05");
      // the existing typed read now answers, stamped with the latest ordinary close
      const view = w.population.cohortView(LEDGER_ID, COHORT_ID);
      expect(view.ok && view.value.result?.members).toEqual(RESIDENT_IDS);
    } finally {
      await w.campaign.close();
    }
  });

  it("the derived view follows the authored input: a different resident distribution yields a different, independently computed Cohort (no fixed headcount)", async () => {
    const cases: [string, any[], string[]][] = [
      [
        "everyone resident at the locus",
        unitDocs().map((u) => ({ ...u, residence: LOCUS_ID })),
        ["unit-01", "unit-02", "unit-03", "unit-04", "unit-05"],
      ],
      [
        "one resident",
        [
          { unit_id: "a-1", residence: LOCUS_ID, presence: "place-quay", burden_allocation: null },
          { unit_id: "a-2", residence: "place-quay", presence: LOCUS_ID, burden_allocation: null },
        ],
        ["a-1"],
      ],
      [
        "none resident",
        [{ unit_id: "b-1", residence: "place-quay", presence: LOCUS_ID, burden_allocation: null }],
        [],
      ],
    ];
    for (const [name, units, members] of cases) {
      const dirs = await timedCampaign();
      const doc = populationDoc();
      doc.ledger.units = units;
      expect((await addPopulation(dirs, writePopulation(doc))).result.status, name).toBe(
        "POPULATION_READY",
      );
      const w = await openWitness(dirs.campaignDir);
      try {
        expect((await engageClose(w)).ok, name).toBe(true);
        const result = w.population.cohort(LEDGER_ID, COHORT_ID)!.value.result!;
        expect(result.members, name).toEqual(members);
        expect(result.cardinality, name).toEqual({ semantics: "EXACT", count: members.length });
      } finally {
        await w.campaign.close();
      }
    }
  });

  it("once Population has closed, pre-play is over: a repeat of the same command is refused rather than reporting readiness", async () => {
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    expect((await addPopulation(dirs, file)).result.status).toBe("POPULATION_READY");
    const w = await openWitness(dirs.campaignDir);
    try {
      expect((await engageClose(w)).ok).toBe(true);
    } finally {
      await w.campaign.close();
    }
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addPopulation(dirs, file, []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    void T_CLOSE;
  });
});

describe("the shipped command as real processes", () => {
  it("establish-population (process 1) → an ordinary reopen (process 2) reads the identical facts; a repeat (process 3) converges", async () => {
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());

    const one = await runPopulation(dirs, file, ["confirm"]);
    expect(one.stderr).toBe("");
    expect(one.code).toBe(0);
    expect(one.stdout).toContain("STATUS POPULATION_READY");
    expect(phrase(one.stdout)).toMatch(/^establish-population [0-9a-f]{12}$/);
    expect(one.stdout).toContain(`ledger: ${LEDGER_ID} DISJOINT_RESIDENT_POPULATION, EXACT 5`);
    expect(existsSync(join(dirs.campaignDir, "LOCK"))).toBe(false);

    const read = await openOrdinary(dirs.campaignDir);
    expect(read.store.getFact(populationLedgerKey(LEDGER_ID))!.value).toEqual(EXPECTED_LEDGER());
    await read.close();
    const head = await headOf(dirs.campaignDir);

    const three = await runPopulation(dirs, file);
    expect(three.code).toBe(0);
    expect(three.stdout).toContain("STATUS POPULATION_READY");
    expect(three.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a declined confirmation exits 2 and writes nothing", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const run = await runPopulation(dirs, writePopulation(populationDoc()), ["decline"]);
    expect(run.code).toBe(2);
    expect(run.stdout).toContain("STATUS DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("a pre-typed confirmation cannot stand for the challenge: the end of input declines", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const run = await runPopulation(dirs, writePopulation(populationDoc()));
    expect(run.code).toBe(2);
    expect(run.stdout).toContain("STATUS DECLINED");
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  });

  it("the command requires --population-file and refuses the options of other commands", async () => {
    const dirs = await timedCampaign();
    const { runShipped } = await import("../support/locality.ts");
    const base = [
      "establish-population",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
    ];
    expect((await runShipped(base)).code).toBe(64);
    const file = writePopulation(populationDoc());
    expect(
      (await runShipped([...base, "--population-file", file, "--reserve-file", "x"])).code,
    ).toBe(64);
    expect(
      (await runShipped([...base, "--population-file", file, "--population-file", file])).code,
    ).toBe(64);
  });
});
