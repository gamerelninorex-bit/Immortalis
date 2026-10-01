/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Population & Cohort Reconciliation Backbone — enforcement that does not depend on the coordinator or
// the Population operation behaving. IM-11 admission holds for a raw `store.commit` and for a TAMPERED
// reconciliation group; load-time verification fails closed on Population drift; a failure at every
// durable step of a PCB-01 transaction converges by identity with no duplicate consumption.
// Register lineage: IA-02, IA-03, IA-04, IA-06, IA-30 (partial); RC-02, RC-08, RC-12, RC-16; IM-04, IM-11,
// IM-12, IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  FACET_POPULATION_STATE,
  OWNER_POPULATION,
  populationCloseKey,
  populationCohortKey,
  populationLedgerKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PopulationAdapter,
  TemporalCoordinator,
  nodeFs,
  populationBarrierEvaluator,
  stageIntentId,
  verifyPopulationIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  COHORT_BURDEN_L,
  COHORT_STATUS_L,
  CONSUMER_ATTACHMENT,
  CRITERION_KEY,
  FIXTURE_CAMPAIGN,
  LEDGER_MAIN,
  POPULATION_FIXTURE_EXTENSION,
  POP_TC,
  SYNTH_CAUSE_OWNER,
  SYNTH_CONSUMER_OWNER,
  SYNTH_CRITERION_OWNER,
  advanceToRequest,
  burdenCohort,
  instrumentFs,
  popCloseStage,
  populationProviders,
  syntheticGroup,
  ledgerInput,
  popPublication,
} from "@immortalis/testkit";
import {
  popCoordinator,
  popSummary,
  reopenPopulation,
  seededPendingConsumer,
  seededPopulationCampaign,
} from "../support/population.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

/** A store whose Population groups are altered on the way in, to prove IM-11 (not the operation) refuses them. */
function tamperStore(
  inner: CampaignStore,
  mutate: (g: CommitGroup) => CommitGroup,
): { store: CampaignStore; tampered: () => number } {
  let n = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: (g) => {
      const group = g as CommitGroup;
      if (group.owner !== OWNER_POPULATION) return inner.commit(g);
      n += 1;
      return inner.commit(mutate(group));
    },
  };
  return { store, tampered: () => n };
}

const withWrite = (g: CommitGroup, key: string, f: (v: any) => unknown): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) =>
    w.key === key ? { ...w, value: f(structuredClone(w.value)) as never } : w,
  ),
});

const ledgerKey = populationLedgerKey(LEDGER_MAIN);
const closeKey = populationCloseKey(LEDGER_MAIN);
const statusKey = populationCohortKey(LEDGER_MAIN, COHORT_STATUS_L);

describe("Population-owned count and membership cannot be written by anyone else (RC-12 guard; IA-03)", () => {
  it("a consumer, a criterion owner, a causal owner and a synthetic owner cannot write any Population key space", async () => {
    const s = await seededPendingConsumer(tempDir());
    const store = s.campaign.store;
    const ledger = store.getFact(ledgerKey)!;
    for (const owner of [SYNTH_CONSUMER_OWNER, SYNTH_CRITERION_OWNER, SYNTH_CAUSE_OWNER]) {
      for (const key of [ledgerKey, closeKey, statusKey]) {
        const g = syntheticGroup(FIXTURE_CAMPAIGN, owner, 900, key, { count: 99 }, 1);
        // an existing Population fact is refused as another owner's fact; either way it is refused
        expect(["KEY_NOT_ADMITTED", "FACT_OWNER_CONFLICT"]).toContain(
          await codeOf(store.commit(g)),
        );
      }
    }
    expect(store.getFact(ledgerKey)).toEqual(ledger); // untouched
  });

  it("a consumer may attach to a Cohort BY REFERENCE (its own fact, its own key space) without altering the Cohort", async () => {
    const s = await seededPendingConsumer(tempDir());
    await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    const store = s.campaign.store;
    const cohort = store.getFact(statusKey)!;
    const g = syntheticGroup(
      FIXTURE_CAMPAIGN,
      SYNTH_CONSUMER_OWNER,
      901,
      CONSUMER_ATTACHMENT,
      { cohort: { fact_key: statusKey, version: cohort.version }, domain_state: "consumer-only" },
      0,
    );
    const attached = {
      ...g,
      reads: [{ key: statusKey, version: cohort.version }],
      depends_on: [cohort.provenance.group_id],
    };
    await must(store.commit(attached));
    // the attachment is the consumer's; the Cohort's membership, count and provenance are untouched
    expect(store.getFact(statusKey)).toEqual(cohort);
    expect(store.getFact(CONSUMER_ATTACHMENT)!.owner).toBe(SYNTH_CONSUMER_OWNER);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("there is no fallback Population owner and no raw bypass into Population-owned key space", async () => {
    const s = await seededPendingConsumer(tempDir());
    const store = s.campaign.store;
    const asPopulation = (key: string, value: unknown, expected = 0): CommitGroup => ({
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: "raw-g",
      intent_id: "raw-i",
      owner: OWNER_POPULATION,
      facet: FACET_POPULATION_STATE,
      cause: "raw",
      rule: store.getFact(ledgerKey)!.provenance.rule,
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
    // a key outside every registered space, even as the real owner
    expect(await codeOf(store.commit(asPopulation("population/ledger-main/units", {})))).toBe(
      "KEY_NOT_ADMITTED",
    );
    // a foreign owner's key space is not Population's to write
    expect(["KEY_NOT_ADMITTED", "FACT_OWNER_CONFLICT"]).toContain(
      await codeOf(store.commit(asPopulation(CRITERION_KEY, {}))),
    );
    expect(await codeOf(store.commit(asPopulation("synthetic-criterion/new", {})))).toBe(
      "KEY_NOT_ADMITTED",
    );
    // a wrong facet / unregistered pair
    expect(
      await codeOf(store.commit({ ...asPopulation(ledgerKey, {}), facet: "population_fallback" })),
    ).toBe("OWNER_NOT_REGISTERED");
    // the owner itself cannot set a count: inflating the ledger without a reconciliation is refused
    const l: any = structuredClone(store.getFact(ledgerKey)!.value);
    l.units.push({
      unit_id: "u-9",
      residence: "place-m",
      presence: "place-m",
      burden_allocation: null,
    });
    l.count.count = l.units.length;
    const cur = store.getFact(ledgerKey)!.version;
    expect(await codeOf(store.commit(asPopulation(ledgerKey, l, cur)))).toBe("VALUE_INVALID");
    // and a count that disagrees with the units is not even a representable value
    const m: any = structuredClone(store.getFact(ledgerKey)!.value);
    m.count.count += 1;
    expect(await codeOf(store.commit(asPopulation(ledgerKey, m, cur)))).toBe("VALUE_INVALID");
    // a Cohort result cannot be written outside a reconciliation, and a ledger cannot be re-established
    const c: any = structuredClone(store.getFact(statusKey)!.value);
    c.result.members = ["u-1"];
    c.result.cardinality = { semantics: "EXACT", count: 1 };
    expect(
      await codeOf(store.commit(asPopulation(statusKey, c, store.getFact(statusKey)!.version))),
    ).toBe("AMENDMENT_NOT_SUPPORTED");
    const pop = new PopulationAdapter(store);
    expect(
      await codeOf(pop.establishLedger({ ...popPublication(40), ledger: ledgerInput() })),
    ).toBe("VERSION_CONFLICT");
  });

  it("the adapter exposes no ledger/count/result writer", () => {
    const proto = Object.getOwnPropertyNames(PopulationAdapter.prototype).sort();
    expect(proto).toEqual(
      [
        "close",
        "cohort",
        "cohortView",
        "constructor",
        "establishLedger",
        "instantiateCohort",
        "ledger",
      ].sort(),
    );
  });
});

describe("IM-11 refuses an unlawful reconciliation — even a TAMPERED one (WS-001 §1, RC-08 once-only)", () => {
  async function tamperedOutcome(mutate: (g: CommitGroup) => CommitGroup) {
    const s = await seededPendingConsumer(tempDir());
    const t = tamperStore(s.campaign.store, mutate);
    const c = new TemporalCoordinator(t.store, populationProviders(), populationBarrierEvaluator);
    const r = await must(c.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    expect(t.tampered()).toBe(1);
    // the honest group would have committed close-2; the tampered one did not: nothing was credited
    expect(r.rejections.map((x) => x.code)).toEqual(["VALUE_INVALID"]);
    expect(s.population.ledger(LEDGER_MAIN)!.fact.version).toBe(2);
    expect(s.population.ledger(LEDGER_MAIN)!.value.consumed_envelopes).toEqual(["env-a", "env-b"]);
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(s.campaign.verify()).toEqual([]);
  }
  const cases: [string, (g: CommitGroup) => CommitGroup][] = [
    [
      "a unit credited from nothing (no envelope)",
      (g) =>
        withWrite(g, ledgerKey, (l) => {
          l.units.push({
            unit_id: "u-9",
            residence: "place-m",
            presence: "place-m",
            burden_allocation: null,
          });
          l.count.count = l.units.length;
          return l;
        }),
    ],
    [
      "an eligible envelope omitted from the close",
      (g) =>
        withWrite(
          withWrite(g, closeKey, (c) => {
            c.exits = [];
            c.consumed_envelopes = [];
            c.closing.count = c.opening.count;
            return c;
          }),
          ledgerKey,
          (l) => ({
            ...l,
            units: [
              ...l.units,
              {
                unit_id: "u-2",
                residence: "locus-fixture-1",
                presence: "place-m",
                burden_allocation: null,
              },
            ].sort((a: any, b: any) => (a.unit_id < b.unit_id ? -1 : 1)),
            count: { semantics: "EXACT", count: 4 },
            consumed_envelopes: l.consumed_envelopes.filter((x: string) => x !== "env-c"),
          }),
        ),
    ],
    [
      "an already-consumed envelope credited a second time",
      (g) =>
        withWrite(g, closeKey, (c) => {
          c.entries.push({
            envelope_id: "env-a",
            unit_id: "u-5",
            adapter: "synthetic-entry-adapter",
            causing_event: { owner: SYNTH_CAUSE_OWNER, event_id: "event-env-a" },
          });
          c.consumed_envelopes = [...c.consumed_envelopes, "env-a"].sort();
          c.closing.count = c.opening.count + c.entries.length - c.exits.length;
          return c;
        }),
    ],
    [
      "a derived view composed from closed units and the EARLIER criterion (mixed time)",
      (g) =>
        withWrite(g, statusKey, (v) => {
          v.result.members = ["u-1", "u-5"]; // {u-1,u-2,u-5} (TP criterion) ∩ remaining units
          v.result.cardinality = { semantics: "EXACT", count: 2 };
          return v;
        }),
    ],
    [
      "a Cohort result of another basis stamp",
      (g) =>
        withWrite(g, statusKey, (v) => {
          v.result.basis_stamp.constituents[1].version = 1;
          return v;
        }),
    ],
    [
      "a rewritten Cohort reference (the reconciliation recomposes results, never references)",
      (g) =>
        withWrite(g, populationCohortKey(LEDGER_MAIN, COHORT_BURDEN_L), (v) => {
          v.ref.scope.place = "place-m";
          return v;
        }),
    ],
    [
      "a close that does not advance the ledger it names",
      (g) =>
        withWrite(g, closeKey, (c) => {
          c.opening.ledger_version = 1;
          c.closing.ledger_version = 2;
          return c;
        }),
    ],
    [
      "an extra write beside the reconciliation",
      (g) => ({
        ...g,
        writes: [
          ...g.writes,
          { ...g.writes[0]!, key: "population/ledger-main/cohort/ghost", expected_version: 0 },
        ],
      }),
    ],
  ];
  for (const [name, mutate] of cases) {
    it(`refuses ${name}`, async () => {
      await tamperedOutcome(mutate);
    });
  }

  it("a reconciliation cannot rewrite the ledger's identity or locality", async () => {
    await tamperedOutcome((g) =>
      withWrite(g, ledgerKey, (l) => {
        l.locality.locus.entity_id = "locus-elsewhere";
        return l;
      }),
    );
  });
});

describe("a causal owner cannot forge envelopes for another writer, and Population trusts only its register", () => {
  it("an envelope whose writer is not the register's owner makes the stage fail closed (SOURCE_INVALID)", async () => {
    const s = await seededPendingConsumer(tempDir());
    const key = "synthetic-cause/register/ledger-main";
    const cur = s.campaign.store.getFact(key)!;
    const reg: any = structuredClone(cur.value);
    reg.envelopes[0].writer.owner = SYNTH_CRITERION_OWNER; // claims another writer
    await must(
      s.campaign.store.commit(
        syntheticGroup(FIXTURE_CAMPAIGN, SYNTH_CAUSE_OWNER, 31, key, reg, cur.version),
      ),
    );
    const r = await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents.map((u) => u.reason)).toContain(
      "SOURCE_INVALID",
    );
    expect(s.population.ledger(LEDGER_MAIN)!.fact.version).toBe(2);
  });
});

describe("load-time verification fails closed on Population drift (IA-30 partial)", () => {
  async function drifted(mutate: (facts: OwnerFact[]) => OwnerFact[]) {
    const s = await seededPendingConsumer(tempDir());
    await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    const inner = s.campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
    const bound: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => facts,
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      commit: (g) => inner.commit(g),
      close: () => inner.close(),
    };
    const out = verifyPopulationIntegrity(bound);
    await s.campaign.close();
    return out;
  }
  const edit = (key: string, f: (v: any, fact: any) => void) => (facts: OwnerFact[]) => {
    const fact = facts.find((x) => x.key === key)!;
    f(fact.value, fact);
    return facts;
  };

  it("a healthy campaign verifies", async () => {
    expect(await drifted((f) => f)).toEqual([]);
  });
  it("detects a ledger whose close is gone", async () => {
    const v = await drifted((f) => f.filter((x) => x.key !== closeKey));
    expect(v.map((x) => x.message).join()).toMatch(/has no close/);
  });
  it("detects a count/unit change that is not the close's closing basis", async () => {
    const v = await drifted(
      edit(closeKey, (c) => {
        c.closing.count = 4;
        c.entries.push({ ...c.exits[0], disposition: undefined, continuity_ref: undefined });
      }),
    );
    expect(v.length).toBeGreaterThan(0);
  });
  it("detects a ledger and close that did not advance together", async () => {
    const v = await drifted(edit(closeKey, (_c, fact) => (fact.version += 1)));
    expect(v.map((x) => x.message).join()).toMatch(/advance together/);
  });
  it("detects a Population-owned Cohort result that is not what the ledger's units derive", async () => {
    const v = await drifted(
      edit(populationCohortKey(LEDGER_MAIN, COHORT_BURDEN_L), (c) => {
        c.result.members = ["u-1"];
        c.result.cardinality = { semantics: "EXACT", count: 1 };
      }),
    );
    expect(v.map((x) => x.message).join()).toMatch(/derive/);
  });
  it("detects a view naming a member the ledger does not account", async () => {
    const v = await drifted(
      edit(statusKey, (c) => {
        c.result.members = ["u-1", "u-3", "u-77"];
      }),
    );
    expect(v.map((x) => x.message).join()).toMatch(/does not account/);
  });
  it("detects a derived view whose criterion stamp differs from what its group pinned", async () => {
    const v = await drifted(
      edit(statusKey, (c) => {
        c.result.basis_stamp.constituents[1].version = 99;
      }),
    );
    expect(v.map((x) => x.message).join()).toMatch(/criterion stamp/);
  });
  it("detects a view stamped with another ledger version", async () => {
    const v = await drifted(
      edit(statusKey, (c) => {
        c.result.basis_stamp.constituents[0].version = 2;
      }),
    );
    expect(v.map((x) => x.message).join()).toMatch(/another ledger version/);
  });
  it("detects Population facts whose ledger is missing", async () => {
    const v = await drifted((f) => f.filter((x) => x.key !== ledgerKey));
    expect(v.map((x) => x.message).join()).toMatch(/without their ledger/);
  });

  it("tampering with the persisted journal fails the open under the existing integrity model", async () => {
    const dir = tempDir();
    const s = await seededPendingConsumer(dir);
    await must(s.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
    await s.campaign.close();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("env-c");
    writeFileSync(journal, text.replace('"u-3"', '"u-4"'));
    const opened = await CanonicalCampaign.open(dir, { extension: POPULATION_FIXTURE_EXTENSION });
    expect(opened.ok).toBe(false);
  });
});

describe("unknown outcome is reconciled by identity: a failure at EVERY durable step of the PCB-01 transaction", () => {
  it("converges on the identical campaign with exactly one reconciliation and one consumption of the envelope", async () => {
    const refDir = tempDir();
    const ref = await seededPendingConsumer(refDir);
    const refResult = await must(
      ref.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)),
    );
    const refHead = ref.campaign.store.head();
    const refPop = popSummary(ref.campaign, ref.coordinator).population;
    await ref.campaign.close();

    // count the durable steps of the transaction on a dry run
    const countDir = tempDir();
    await (await seededPendingConsumer(countDir)).campaign.close();
    const probe = instrumentFs(nodeFs);
    const p = await must(
      CanonicalCampaign.open(countDir, { fs: probe.fs, extension: POPULATION_FIXTURE_EXTENSION }),
    );
    const afterOpen = probe.count();
    await must(popCoordinator(p.store).advance(advanceToRequest("tx-consumer-1", POP_TC)));
    const afterAdvance = probe.count();
    await p.close();
    // Population stage + consumer stage + kernel group: three commits of at least four durable steps each
    expect(afterAdvance - afterOpen).toBeGreaterThanOrEqual(12);

    const seen = { rolledBack: 0, partial: 0, committed: 0 };
    const finals = new Set<string>();
    for (let failAt = afterOpen + 1; failAt <= afterAdvance; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await (await seededPendingConsumer(dir)).campaign.close();
        const inst = instrumentFs(nodeFs, { failAt, when });
        const campaign = await must(
          CanonicalCampaign.open(dir, { fs: inst.fs, extension: POPULATION_FIXTURE_EXTENSION }),
        );
        const r = await popCoordinator(campaign.store).advance(
          advanceToRequest("tx-consumer-1", POP_TC),
        );
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await campaign.close();

        const re = await reopenPopulation(dir, "restart");
        expect(re.campaign.verify()).toEqual([]); // whatever survived is internally consistent
        const popStage = re.campaign.store.lookupReceipt(
          stageIntentId(popCloseStage(LEDGER_MAIN, "close-2")),
        );
        if (re.coordinator.transaction("tx-consumer-1")) seen.committed++;
        else if (popStage) seen.partial++;
        else seen.rolledBack++;

        // re-present the SAME request: existing receipts are reached; a committed stage is adopted
        const again = await must(re.coordinator.advance(advanceToRequest("tx-consumer-1", POP_TC)));
        if (popStage && !re.coordinator.transaction("tx-consumer-1")) {
          expect(again.adopted.map((s) => s.owner_operation.operation)).toContain(
            "population-reconcile-close",
          );
          expect(again.recomputed_in_place).toEqual([]);
        }
        const head = re.campaign.store.head();
        expect(head.revision).toBe(refHead.revision); // no duplicate group anywhere
        expect(popSummary(re.campaign, re.coordinator).population).toEqual(refPop);
        // exactly one consumption of the envelope, whatever the interruption
        expect(re.population.close(LEDGER_MAIN)!.value.consumed_envelopes).toEqual(["env-c"]);
        expect(
          re.population.ledger(LEDGER_MAIN)!.value.consumed_envelopes.filter((x) => x === "env-c"),
        ).toHaveLength(1);
        expect(again.transaction.stages.map((s) => s.group_id)).toEqual(
          refResult.transaction.stages.map((s) => s.group_id),
        );
        finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
        expect(re.campaign.verify()).toEqual([]);
        await re.campaign.close();
        const last = await reopenPopulation(dir, "last");
        expect(last.campaign.verify()).toEqual([]);
        await last.campaign.close();
      }
    }
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBe(`${refHead.state_sha256}/${refHead.journal_head_sha256}`);
    expect(seen.rolledBack).toBeGreaterThan(0);
    expect(seen.partial).toBeGreaterThan(0);
    expect(seen.committed).toBeGreaterThan(0);
  }, 180_000);
});

describe("seeding is itself lawful: the fixture establishes no Population without the canonical locus", () => {
  it("a ledger cannot be attached to a locus that is not committed", async () => {
    const s = await seededPopulationCampaign(tempDir());
    const pop = new PopulationAdapter(s.campaign.store);
    const r = await pop.establishLedger({
      ...popPublication(41),
      ledger: { ...ledgerInput("ledger-orphan"), locus_id: "locus-not-there" },
    });
    expect(!r.ok && r.error.code).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.getFact(populationLedgerKey("ledger-orphan"))).toBeUndefined();
  });

  it("a Cohort is typed by its key space, not its spelling: a Cohort named like a ledger is still a Cohort", async () => {
    const s = await seededPopulationCampaign(tempDir());
    const pop = new PopulationAdapter(s.campaign.store);
    await must(
      pop.instantiateCohort({
        ...popPublication(42),
        ref: burdenCohort("ledger", "locus-fixture-1"),
      }),
    );
    expect(pop.cohort(LEDGER_MAIN, "ledger")?.value.ref.cohort_id).toBe("ledger");
    expect(s.campaign.store.getFact(populationCohortKey(LEDGER_MAIN, "ledger"))!.facet).toBe(
      FACET_POPULATION_STATE,
    );
    expect(s.campaign.verify()).toEqual([]);
  });
});
