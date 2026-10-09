/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Culture & Society Established Shared Meaning / Norm — amended forty-sixth slice: "one earlier committed foreign trigger and
// its engaged observations → one OUTCOME-NEUTRAL sealed Culture context (with the Cohort scope vouched LIVE by Population at
// seal) → one immutable GM adjudication (merged F-027-CJA1) → ONE declared Communicative Convention Close that reads exactly the
// context and the decision → readable AS-OF-NOW after that close". Register lineage: IA-01/02/03/04 (partial), IA-14 (partial),
// IA-22 (reused / partial); RC-02/03/04/05/09/11/12/16; IM-02, IM-03, IM-09, IM-11, IM-12, IM-17. CAL-01 stays UNCALIBRATED (no
// number exists). CJA1 is Sovereign-approved, NOT native-pinned and NOT spec-locked. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  COMMUNICATIVE_CONVENTION_CLOSE,
  cjaDecisionKey,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
} from "@immortalis/contracts";
import { CULTURE_RULE, verifyCultureAdjudicationIntegrity } from "@immortalis/engine";
import {
  DEFAULT_OBSERVATIONS,
  TEST_MANIFESTATION,
  cultureConsumerResultKey,
  observationKey,
} from "@immortalis/testkit";
import {
  COHORT_KEY,
  REFERENT_KEY,
  SCOPE_KEY,
  advanceCulture,
  commitObservations,
  cultureConsumerObjectAt,
  cultureSummary,
  judge,
  judgedCulture,
  preparedCulture,
  registerCultureConsumer,
  registerCultureReader,
  seal,
  sealRequest,
  sealedContexts,
  seededCultureCampaign,
} from "../support/culture.ts";
import { must } from "../support/temporal.ts";
import { temporalPublication } from "@immortalis/testkit";
import { tempDir } from "../support/tmp.ts";

const cultureFacts = (s: Awaited<ReturnType<typeof seededCultureCampaign>>) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("culture/"));

describe("a sealed Social Update Context is Culture's own OUTCOME-NEUTRAL input assembly and creates no social fact (acceptance 1)", () => {
  it("commits under the sole Culture owner/facet, engine-sealed and create-only, with exactly one write and no meaning, norm, verdict or foreign fact", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitObservations(s);
    const before = cultureSummary(s.campaign, s.coordinator);
    const r = await must(seal(s));
    expect(r.replayed).toBe(false);
    const [ctx] = sealedContexts(s);
    const stored = s.culture.updateContext(ctx!.updateId)!;
    expect(stored.fact).toMatchObject({
      key: cultureUpdateContextKey(ctx!.updateId),
      owner: "culture",
      facet: "culture_social",
      version: 1,
      unit: null,
      secrecy: "culture.engine-sealed",
    });
    expect(stored.fact.provenance.rule).toEqual(CULTURE_RULE);
    const after = cultureSummary(s.campaign, s.coordinator);
    expect(after.culture).toHaveLength(1);
    expect(after.adjudication).toHaveLength(0);
    // outcome-neutral: no manifestation, no verdict, no recognition tag, no admission flag in the sealed context
    const text = JSON.stringify(stored.value);
    for (const banned of [
      TEST_MANIFESTATION,
      "CONTINUING_SHARED_RECOGNITION",
      "ESTABLISH_SUPPORTED",
      "NOT_SUPPORTED",
      "independent_causal_inertia",
      "recognition",
    ]) {
      expect(text).not.toContain(banned);
    }
    expect(s.culture.sharedMeaning(stored.value.slot_id)).toBeUndefined();
    for (const k of [
      "observations",
      "world",
      "population",
      "objects",
      "transactions",
      "consumer",
    ] as const) {
      expect(after[k], k).toEqual(before[k]);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("pins the referent, scope, every engaged source and the Cohort by identity at their current versions and groups, never copying them", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    const group = s.campaign.store.committedGroup(ctx.fact.provenance.intent_id)!;
    expect(group.reads.map((r) => r.key)).toEqual([
      REFERENT_KEY,
      SCOPE_KEY,
      ...DEFAULT_OBSERVATIONS.map((o) => observationKey(o.id)),
      COHORT_KEY,
    ]);
    const c = ctx.value;
    expect(c.inputs.map((i) => i.fact_key)).toEqual(
      DEFAULT_OBSERVATIONS.map((o) => observationKey(o.id)),
    );
    expect(c.trigger_ref.fact_key).toBe(observationKey("obs-trigger"));
    expect(c.constituency.cohort_fact_key).toBe(COHORT_KEY);
    expect(c.constituency.close_vouch).toMatchObject({
      live_population_admission: true,
      reconciliation: "NOT_DUE",
    });
    // the Cohort's CURRENT-ONLY value is not copied
    expect(JSON.stringify(c)).not.toMatch(/members|headcount|"count"|roster/);
  });

  it("separates the Culture state slot, the CJA1 update identity and the prospective result", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    const c = ctx.value;
    expect(c.update_id).toMatch(/^[0-9a-f]{64}$/);
    expect(c.slot_id).toMatch(/^culture-slot-[0-9a-f]{64}$/);
    expect(c.update_id).not.toContain(c.slot_id);
    expect(cultureSharedMeaningKey(c.slot_id)).toBe(`culture/meaning/${c.slot_id}`);
    expect(cultureConventionStage(c.update_id, c.slot_id).causal_process_id).toBe(
      `culture-update/${c.update_id}`,
    );
  });
});

describe("the primary path: sealed context + committed ESTABLISH_SUPPORTED decision → the shared meaning at the Communicative Convention Close (acceptance 2)", () => {
  it("commits the Culture-owned fact only as the declared close of the dependent consequence, reading EXACTLY the context and the decision, and the consequence reads it AS-OF-NOW after the close", async () => {
    const s = await seededCultureCampaign(tempDir());
    // CJA1 §3.3 order: cause (observations) → seal → REGISTER the consumer → judgment → close
    const ctx = await judgedCulture(s, "positive", { id: "c1", tn: 10 });
    // registration alone publishes nothing: there is no tick, sweep or standalone Culture process
    expect(s.culture.sharedMeaning(ctx.value.slot_id)).toBeUndefined();
    const r = await must(advanceCulture(s, "tx-c1", "c1"));
    expect(r.transaction.outcome).toMatchObject({
      stop_reason: "TARGET_REACHED",
      unresolved_dependents: [],
    });
    expect(r.transaction.stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "culture",
      "SYNTHETIC-CULTURE-RESULT-CONSUMER",
    ]);
    const meaning = s.culture.sharedMeaning(ctx.value.slot_id)!;
    expect(meaning.fact).toMatchObject({
      key: cultureSharedMeaningKey(ctx.value.slot_id),
      owner: "culture",
      facet: "culture_social",
      version: 1,
      secrecy: "culture.engine-sealed",
    });
    expect(meaning.value).toEqual({
      slot_id: ctx.value.slot_id,
      status: "ESTABLISHED",
      referent_key: REFERENT_KEY,
      scope_key: SCOPE_KEY,
      context_id: ctx.value.distinction.context_id,
      manifestation: TEST_MANIFESTATION,
      establishment: {
        update_id: ctx.updateId,
        context: { fact_key: cultureUpdateContextKey(ctx.updateId), version: 1 },
        decision: {
          fact_key: cjaDecisionKey(ctx.updateId),
          version: 1,
          decision_id: `cjadj:v1:${ctx.updateId}`,
        },
      },
      close: {
        name: COMMUNICATIVE_CONVENTION_CLOSE,
        stage: cultureConventionStage(ctx.updateId, ctx.value.slot_id),
      },
    });
    // EXACTLY two reads, context then decision: no foreign observation, trigger or Cohort is read at the close
    const closeGroup = s.campaign.store.committedGroup(meaning.fact.provenance.intent_id)!;
    expect(closeGroup.reads.map((x) => x.key)).toEqual([
      cultureUpdateContextKey(ctx.updateId),
      cjaDecisionKey(ctx.updateId),
    ]);
    const culturePlan = s.coordinator
      .object("culture-consumer-obj-c1")!
      .value.dependencies.find((d) => d.stage.owner_operation.owner === "culture")!;
    expect(culturePlan.reads.map((x) => [x.mode, x.source.owner, x.source.fact_key])).toEqual([
      ["AS-OF-NOW", "culture", cultureUpdateContextKey(ctx.updateId)],
      ["AS-OF-NOW", "culture_adjudication_kernel", cjaDecisionKey(ctx.updateId)],
    ]);
    // the consequence observed exactly the committed fact, read after the close that committed it
    const observed = s.campaign.store.getFact(cultureConsumerResultKey("c1"))!.value as any;
    expect(observed.observed_meaning).toEqual(meaning.value);
    expect(observed.observed_close_group).toBe(meaning.close_group);
    expect(s.campaign.verify()).toEqual([]);
    expect(verifyCultureAdjudicationIntegrity(s.campaign.store)).toEqual([]);
  });

  it("the sealed context admits contradictory and not-probative observations: the positive judgment accounts for them, they cause no refusal", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s);
    const record = s.gm.decision(ctx.updateId)!.value;
    expect(record.assessment.map((a) => a.classification)).toEqual([
      "SUPPORTS",
      "SUPPORTS",
      "CONTRADICTS",
      "NOT_PROBATIVE",
    ]);
    expect(record.verdict).toBe("ESTABLISH_SUPPORTED");
  });

  it("the foreign observations carry acts, participants and exposure only: no verdict, no recognition tag, no manifestation identifier", () => {
    const text = JSON.stringify(DEFAULT_OBSERVATIONS);
    for (const banned of [
      TEST_MANIFESTATION,
      "CONTINUING_SHARED_RECOGNITION",
      "ESTABLISH_SUPPORTED",
      "NOT_SUPPORTED",
      "recognition",
      "adopt",
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it("a second consequence of the same update adopts the committed fact by identity: it is never duplicated, recomputed or improved", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s, "positive", { id: "c1", tn: 10 });
    await must(advanceCulture(s, "tx-c1", "c1"));
    const first = s.culture.sharedMeaning(ctx.value.slot_id)!;
    const before = cultureFacts(s);
    // a later consequence READS the committed fact and declares no second Culture stage (registering one after the decision
    // is refused — see the registration-order tests)
    await registerCultureReader(s, "c2", ctx.value, 11);
    await must(advanceCulture(s, "tx-c2", "c2"));
    expect(s.culture.sharedMeaning(ctx.value.slot_id)!.fact).toEqual(first.fact);
    expect(cultureFacts(s)).toEqual(before);
    const observed = s.campaign.store.getFact(cultureConsumerResultKey("c2"))!.value as any;
    expect(observed.observed_close_group).toBe(first.close_group);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("no consequence engaged means no meaning is ever committed, however many contexts and decisions exist (no tick, sweep or drift)", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s);
    await s.coordinator.advance({
      transaction_id: "tx-idle",
      cause: "cause-tx-idle",
      trigger: { kind: "fixture-advance-request", ref: "ref-tx-idle" },
      continues: null,
      requested: { target: { unit: "fixture-time-unit", value: 150 }, condition: null },
      context: { role: "role.player", permission: "permission.player_choice.commit" },
      publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
    });
    expect(cultureFacts(s).map((f) => f.key)).toEqual([cultureUpdateContextKey(ctx.updateId)]);
  });
});

describe("outcome swap (C7): the same outcome-neutral sealed context admits every verdict, and only ESTABLISH_SUPPORTED writes a Culture fact", () => {
  it.each([
    ["not_supported", "NOT_SUPPORTED"],
    ["unresolved", "UNRESOLVED"],
    ["derive", "DERIVE_WITHOUT_PERSISTENCE"],
  ] as const)(
    "a %s decision in an independent campaign is structurally admissible, writes no Culture meaning, and leaves the dependent stage unresolved",
    async (kind, verdict) => {
      const s = await seededCultureCampaign(tempDir());
      const ctx = await preparedCulture(s);
      await registerCultureConsumer(s, "c1", ctx.value, 10);
      const out = await must(judge(s, ctx.updateId, kind));
      expect(out.verdict).toBe(verdict);
      const r = await must(advanceCulture(s, "tx-c1", "c1"));
      expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
      expect(r.transaction.stages).toEqual([]);
      expect(s.culture.sharedMeaning(ctx.value.slot_id)).toBeUndefined();
      expect(cultureFacts(s).map((f) => f.key)).toEqual([cultureUpdateContextKey(ctx.updateId)]);
      expect(s.campaign.store.getFact(cultureConsumerResultKey("c1"))).toBeUndefined();
      expect(s.campaign.verify()).toEqual([]);
    },
  );

  it("the four independent campaigns share an identical sealed context and differ only in the judgment's verdict (non-tautology)", async () => {
    const seen = new Set<string>();
    const verdicts = new Set<string>();
    for (const kind of ["positive", "not_supported", "unresolved", "derive"] as const) {
      const s = await seededCultureCampaign(tempDir());
      const ctx = await preparedCulture(s);
      seen.add(JSON.stringify(ctx.value));
      verdicts.add((await must(judge(s, ctx.updateId, kind))).verdict);
    }
    expect(seen.size).toBe(1);
    expect(verdicts.size).toBe(4);
  });

  it("an absent decision blocks the dependent stage without marking a Culture close, and a later positive judgment then completes it", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    await registerCultureConsumer(s, "c1", ctx.value, 10);
    const held = await must(advanceCulture(s, "tx-c1", "c1"));
    expect(held.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(held.transaction.outcome.unresolved_dependents[0]).toMatchObject({
      reason: "SOURCE_ABSENT",
    });
    expect(held.transaction.stages).toEqual([]);
    expect(s.culture.sharedMeaning(ctx.value.slot_id)).toBeUndefined();
    await must(judge(s, ctx.updateId, "positive"));
    const next = await must(
      s.coordinator.advance({
        transaction_id: "tx-c2",
        cause: "cause-tx-c2",
        trigger: { kind: "fixture-advance-request", ref: "ref-tx-c2" },
        continues: "tx-c1",
        requested: { target: held.transaction.requested.target, condition: null },
        context: { role: "role.player", permission: "permission.player_choice.commit" },
        publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
      }),
    );
    expect(next.transaction.outcome.unresolved_dependents).toEqual([]);
    expect(s.culture.sharedMeaning(ctx.value.slot_id)!.value.manifestation).toBe(
      TEST_MANIFESTATION,
    );
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("registration order: the consuming object may register only after the context is sealed", () => {
  it("rejects an object that declares a Culture close for an unsealed update", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    const sealed = ctx.value;
    // a context that was never committed: a different distinction
    const other = {
      ...sealed,
      update_id: "d".repeat(64),
    };
    await expect(registerCultureConsumer(s, "c1", other, 10)).rejects.toThrow();
    expect(s.coordinator.object("culture-consumer-obj-c1")).toBeUndefined();
  });

  it("sealing is idempotent by update identity: a retry returns the original receipt and never re-seals", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitObservations(s);
    const a = await must(seal(s));
    const b = await must(seal(s));
    expect(b.replayed).toBe(true);
    expect(b.receipt).toEqual(a.receipt);
    expect(cultureFacts(s)).toHaveLength(1);
    // a different question for the SAME update identity is a conflict, not a second seal
    const clash = await seal(
      s,
      sealRequest({ consumer_question: "SYNTHETIC FIXTURE: a different question." }),
    );
    expect(!clash.ok && clash.error.code).toBe("CONTEXT_CONFLICT");
    expect(cultureFacts(s)).toHaveLength(1);
  });
});

describe("CJA1 §3.3 / §10.B order: cause → seal → REGISTER the consuming object → decision → close", () => {
  it.each(["positive", "not_supported", "unresolved", "derive"] as const)(
    "refuses to register a Culture-producing object AFTER the update's %s decision: a committed record cannot bootstrap it",
    async (kind) => {
      const s = await seededCultureCampaign(tempDir());
      const ctx = await judgedCulture(s, kind);
      const before = cultureSummary(s.campaign, s.coordinator);
      await expect(registerCultureConsumer(s, "late", ctx.value, 10)).rejects.toThrow(
        /REFERENCE_INVALID|registers before/,
      );
      expect(s.coordinator.object("culture-consumer-obj-late")).toBeUndefined();
      // nothing was written by the refusal, and no close can ever be credited for the update
      expect(cultureSummary(s.campaign, s.coordinator)).toEqual(before);
      expect(s.culture.sharedMeaning(ctx.value.slot_id)).toBeUndefined();
      expect(s.campaign.verify()).toEqual([]);
    },
  );

  it("the refusal is the kernel's state-based registration admission, with its precise reason", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s, "positive");
    const probe = await s.coordinator
      .registerObject({
        ...temporalPublication(10),
        object: cultureConsumerObjectAt(s, "late", ctx.value),
      })
      .then((r) => r);
    expect(probe.ok).toBe(false);
    expect(!probe.ok && probe.error.code).toBe("REFERENCE_INVALID");
    expect(!probe.ok && probe.error.message).toContain(
      "registers before its update's adjudication decision",
    );
  });

  it("registering BEFORE the decision is lawful, and a legitimate later reader of the committed fact stays lawful, declares no second close and duplicates nothing", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s, "positive", { id: "c1", tn: 10 });
    await must(advanceCulture(s, "tx-c1", "c1"));
    const meaning = s.culture.sharedMeaning(ctx.value.slot_id)!;
    const facts = cultureFacts(s);
    // an unrelated consequence with no Culture declaration, and a reader of the committed fact, register after the decision
    await registerCultureReader(s, "reader", ctx.value, 11);
    await must(advanceCulture(s, "tx-reader", "reader"));
    expect(cultureFacts(s)).toEqual(facts);
    expect(s.culture.sharedMeaning(ctx.value.slot_id)!.fact).toEqual(meaning.fact);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the absent-decision held continuation still recovers: register, hold, judge, continue — with no duplicate close and no extra Temporal read", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    await registerCultureConsumer(s, "c1", ctx.value, 10);
    const held = await must(advanceCulture(s, "tx-c1", "c1"));
    expect(held.transaction.stages).toEqual([]);
    await must(judge(s, ctx.updateId, "positive"));
    const next = await must(
      s.coordinator.advance({
        transaction_id: "tx-c2",
        cause: "cause-tx-c2",
        trigger: { kind: "fixture-advance-request", ref: "ref-tx-c2" },
        continues: "tx-c1",
        requested: { target: held.transaction.requested.target, condition: null },
        context: { role: "role.player", permission: "permission.player_choice.commit" },
        publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
      }),
    );
    expect(
      next.transaction.stages.filter((x) => x.stage.owner_operation.owner === "culture"),
    ).toHaveLength(1);
    const plan = s.coordinator
      .object("culture-consumer-obj-c1")!
      .value.dependencies.find((d) => d.stage.owner_operation.owner === "culture")!;
    expect(plan.reads).toHaveLength(2);
    expect(cultureFacts(s)).toHaveLength(2); // the context and the one meaning
    expect(s.campaign.verify()).toEqual([]);
  });
});
