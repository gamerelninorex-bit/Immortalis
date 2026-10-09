/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values and groups */
// Culture recovery — later ordinary source and Population version churn never strands, renames, invalidates or rerolls the
// sealed judgment; RC-16 retries and reopen never re-adjudicate or duplicate; load integrity (the Culture and CJA1
// verifiers, from committed state and the journal alone) fails a corrupt decision, context, source group or Cohort group.
import { describe, expect, it } from "vitest";
import {
  cjaDecisionKey,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  type CjaDecisionRecord,
} from "@immortalis/contracts";
import {
  CultureAdapter,
  verifyCultureAdjudicationIntegrity,
  verifyCultureIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import { at, observationGroup, observationKey } from "@immortalis/testkit";
import {
  FIXTURE_CAMPAIGN,
  advanceCulture,
  completePopulationClose2,
  commitPending,
  judge,
  judgedCulture,
  lateExit,
  registerCultureReader,
  reopenCulture,
  seal,
  sealedContexts,
  seededCultureCampaign,
  commitObservations,
  populationScope,
  sealRequest,
  type CultureSeeded,
} from "../support/culture.ts";
import { crashBefore, lostReply } from "../support/culture-adjudication.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const cultureKeys = (s: CultureSeeded) =>
  s.campaign.store
    .listFacts()
    .filter((f) => f.key.startsWith("culture/") || f.key.startsWith("adjudication-culture/"))
    .map((f) => f.key);

describe("ordinary version churn after seal never invalidates the sealed truth", () => {
  it("a foreign source advancing and a second Population reconciliation after seal and judgment leave the same sealed close, reading exactly two facts", async () => {
    const s = await seededCultureCampaign(tempDir());
    // the consumer registers (with a boundary beyond all the churn) BEFORE the judgment: cause → seal → register → decision
    const ctx = await judgedCulture(s, "positive", { id: "c1", tn: 70, boundary: at(200) });
    const decisionBefore = s.gm.decision(ctx.updateId)!;
    // real source churn: a cited observation advances to v2 ...
    await must(
      s.campaign.store.commit(
        observationGroup(
          FIXTURE_CAMPAIGN,
          90,
          "obs-repeat",
          { kind: "OBSERVED_ACT", later: true },
          1,
        ),
      ),
    );
    // ... and real Population churn: a pending consequence is consumed by a second reconciliation (Cohort/close/ledger advance)
    await commitPending(s.campaign.store, 60, [lateExit()]);
    const cohortBefore = s.campaign.store.getFact(ctx.value.constituency.cohort_fact_key)!.version;
    await completePopulationClose2(s);
    expect(s.campaign.store.getFact(observationKey("obs-repeat"))!.version).toBe(2);
    expect(
      s.campaign.store.getFact(ctx.value.constituency.cohort_fact_key)!.version,
    ).toBeGreaterThan(cohortBefore);

    const r = await must(advanceCulture(s, "tx-c1", "c1"));
    expect(r.transaction.outcome.unresolved_dependents).toEqual([]);
    const meaning = s.culture.sharedMeaning(ctx.value.slot_id)!;
    expect(meaning.value.establishment.update_id).toBe(ctx.updateId);
    expect(
      s.campaign.store.committedGroup(meaning.fact.provenance.intent_id)!.reads.map((x) => x.key),
    ).toEqual([cultureUpdateContextKey(ctx.updateId), cjaDecisionKey(ctx.updateId)]);
    // the decision is the same immutable record: never renamed, rerolled or re-adjudicated
    expect(s.gm.decision(ctx.updateId)).toEqual(decisionBefore);
    expect(s.campaign.verify()).toEqual([]);
    expect(verifyCultureIntegrity(s.campaign.store)).toEqual([]);
    expect(verifyCultureAdjudicationIntegrity(s.campaign.store)).toEqual([]);
  });

  it("retrying the seal and the judgment after the world has moved replays the originals by identity", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s);
    await must(
      s.campaign.store.commit(
        observationGroup(
          FIXTURE_CAMPAIGN,
          91,
          "obs-repeat",
          { kind: "OBSERVED_ACT", later: true },
          1,
        ),
      ),
    );
    const again = await must(seal(s));
    expect(again.replayed).toBe(true);
    const judged = await must(judge(s, ctx.updateId, "positive"));
    expect(judged.disposition).toBe("REPLAYED");
    expect(cultureKeys(s)).toEqual(
      [cultureUpdateContextKey(ctx.updateId), cjaDecisionKey(ctx.updateId)].sort(),
    );
    // a changed judgment for the same immutable update is a conflict that replaces nothing
    const changed = await judge(s, ctx.updateId, "not_supported");
    expect(!changed.ok && changed.error.code).toBe("DECISION_CONFLICT");
  });
});

describe("save, close and reopen", () => {
  it("a reopened campaign keeps context, decision and (after the close) meaning; nothing is re-adjudicated or duplicated; a second consumer adopts the fact", async () => {
    const dir = tempDir();
    const s = await seededCultureCampaign(dir);
    const ctx = await judgedCulture(s, "positive", { id: "c1", tn: 10 });
    await must(advanceCulture(s, "tx-c1", "c1"));
    const head = s.campaign.store.head();
    await s.campaign.store.close();

    const r = await reopenCulture(dir);
    expect(r.campaign.store.head().journal_head_sha256).toBe(head.journal_head_sha256);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.culture.sharedMeaning(ctx.value.slot_id)!.value.manifestation).toBe(
      "manifestation-visitor-first-seating",
    );
    const replay = await must(judge(r, ctx.updateId, "positive"));
    expect(replay.disposition).toBe("REPLAYED");
    expect(r.campaign.store.head().journal_entries).toBe(head.journal_entries);
    const sealAgain = await must(seal(r));
    expect(sealAgain.replayed).toBe(true);
    await registerCultureReader(r, "c2", ctx.value, 11);
    await must(advanceCulture(r, "tx-c2", "c2"));
    expect(cultureKeys(r)).toHaveLength(3);
    expect(r.campaign.verify()).toEqual([]);
  });

  it("a lost reply and a crash at the seal reconcile by the deterministic identity", async () => {
    for (const wrap of [lostReply, crashBefore]) {
      const dir = tempDir();
      const s = await seededCultureCampaign(dir);
      await commitObservations(s);
      const blocked = wrap(s.campaign.store, (g: any) =>
        g.group_id.startsWith("culture:context:group:v1:"),
      ) as CampaignStore;
      const flaky = new CultureAdapter(blocked, {
        populationScope: populationScope(s.campaign.store),
      });
      const first = await flaky.sealUpdateContext({
        basis: "b",
        request: sealRequest(),
      });
      expect(!first.ok && first.error.code).toBe("UNKNOWN_OUTCOME");
      await s.campaign.store.close();
      const r = await reopenCulture(dir);
      const retry = await must(seal(r));
      expect(retry.replayed).toBe(wrap === lostReply);
      expect(sealedContexts(r)).toHaveLength(1);
      expect(r.campaign.verify()).toEqual([]);
    }
  });
});

/** a rogue view of the store: the same campaign with one fact rewritten and/or the journal's group lookups lied about */
const rogue = (
  inner: CampaignStore,
  o: {
    fact?: (f: any) => any;
    groupById?: (id: string) => string;
    group?: (g: any) => any;
  },
): CampaignStore => ({
  descriptor: inner.descriptor,
  head: () => inner.head(),
  getFact: (k) => (o.fact ? o.fact(inner.getFact(k)) : inner.getFact(k)),
  listFacts: () => (o.fact ? inner.listFacts().map((f) => o.fact!(f)) : inner.listFacts()),
  lookupReceipt: (i) => inner.lookupReceipt(i),
  committedGroup: (i) => {
    const g = inner.committedGroup(i);
    return o.group && g ? o.group(structuredClone(g)) : g;
  },
  committedGroupById: (id) => inner.committedGroupById!(o.groupById ? o.groupById(id) : id),
  close: () => inner.close(),
  commit: (g) => inner.commit(g),
});

describe("load integrity fails a corrupt decision, context, source group or Cohort group", () => {
  const closed = async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s, "positive", { id: "c1", tn: 10 });
    await must(advanceCulture(s, "tx-c1", "c1"));
    return { s, ctx };
  };
  const bothViolations = (store: CampaignStore) => [
    ...verifyCultureIntegrity(store),
    ...verifyCultureAdjudicationIntegrity(store),
  ];

  it("the untampered closed campaign is clean", async () => {
    const { s } = await closed();
    expect(bothViolations(s.campaign.store)).toEqual([]);
  });

  it.each([
    [
      "a decision whose verdict no longer coheres",
      (v: any) => (v.verdict = "DERIVE_WITHOUT_PERSISTENCE"),
      "decision",
    ],
    [
      "a decision citing another context group",
      (v: any) => (v.context_ref.committed_by_group_id = "other"),
      "decision",
    ],
    ["a decision with a dropped assessment", (v: any) => v.assessment.pop(), "decision"],
    ["a context with a rewritten trigger", (v: any) => (v.trigger_ref.version = 9), "context"],
    [
      "a context with a rewritten slot",
      (v: any) => (v.slot_id = "culture-slot-" + "1".repeat(64)),
      "context",
    ],
    [
      "a context with a stand-in vouch",
      (v: any) =>
        (v.constituency.close_vouch = {
          port: "PopulationCloseScopeVerifier",
          live_population_admission: false,
          reconciliation: "NOT_DUE",
        }),
      "context",
    ],
    [
      "a meaning with another manifestation",
      (v: any) => (v.manifestation = "manifestation-forged"),
      "meaning",
    ],
  ])("reports %s", async (_n, edit, which) => {
    const { s, ctx } = await closed();
    const key =
      which === "decision"
        ? cjaDecisionKey(ctx.updateId)
        : which === "context"
          ? cultureUpdateContextKey(ctx.updateId)
          : cultureSharedMeaningKey(ctx.value.slot_id);
    const view = rogue(s.campaign.store, {
      fact: (f) => {
        if (!f || f.key !== key) return f;
        const c = structuredClone(f);
        edit(c.value);
        return c;
      },
    });
    expect(bothViolations(view).length).toBeGreaterThan(0);
  });

  it("reports a source version the journal does not show its cited group writing", async () => {
    const { s, ctx } = await closed();
    const cited = ctx.value.inputs[1]!.committed_by_group_id;
    const other = ctx.value.inputs[2]!.committed_by_group_id;
    const view = rogue(s.campaign.store, { groupById: (id) => (id === cited ? other : id) });
    const bad = verifyCultureIntegrity(view);
    expect(bad.some((b) => b.message.includes("HISTORICAL_SOURCE_PROOF_MISSING"))).toBe(true);
  });

  it("reports a Cohort whose cited reconciliation group the journal does not show writing it", async () => {
    const { s, ctx } = await closed();
    const cited = ctx.value.constituency.committed_by_group_id;
    const other = ctx.value.inputs[0]!.committed_by_group_id;
    const view = rogue(s.campaign.store, { groupById: (id) => (id === cited ? other : id) });
    const bad = verifyCultureIntegrity(view);
    expect(bad.some((b) => b.message.includes("HISTORICAL_SOURCE_PROOF_MISSING"))).toBe(true);
  });

  it("reports a context group that no longer reads exactly what the context pins", async () => {
    const { s, ctx } = await closed();
    const view = rogue(s.campaign.store, {
      group: (g) =>
        g.group_id.startsWith("culture:context:group:v1:") ? { ...g, reads: g.reads.slice(1) } : g,
    });
    expect(verifyCultureIntegrity(view).length).toBeGreaterThan(0);
    expect(ctx.updateId).toBeTruthy();
  });

  it("reports a close that read more than its context and decision", async () => {
    const { s } = await closed();
    const view = rogue(s.campaign.store, {
      group: (g) =>
        g.writes?.[0]?.key?.startsWith("culture/meaning/")
          ? { ...g, reads: [...g.reads, { key: observationKey("obs-trigger"), version: 1 }] }
          : g,
    });
    expect(verifyCultureIntegrity(view).length).toBeGreaterThan(0);
  });

  it("reports a meaning that rests on no decision", async () => {
    const { s, ctx } = await closed();
    const view = rogue(s.campaign.store, {
      fact: (f) => f,
    });
    const nodec: CampaignStore = {
      ...view,
      listFacts: () => view.listFacts().filter((f) => f.key !== cjaDecisionKey(ctx.updateId)),
    };
    expect(verifyCultureIntegrity(nodec).length).toBeGreaterThan(0);
  });

  it("a stored decision record of another verdict does not fabricate a meaning: no decision of an ESTABLISH_SUPPORTED verdict, no fact", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s, "not_supported");
    const rec = s.gm.decision(ctx.updateId)!.value as CjaDecisionRecord;
    expect(rec.verdict).toBe("NOT_SUPPORTED");
    expect(s.culture.sharedMeaning(ctx.value.slot_id)).toBeUndefined();
    expect(bothViolations(s.campaign.store)).toEqual([]);
  });
});
