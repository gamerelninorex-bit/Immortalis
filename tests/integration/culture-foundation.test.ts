/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Culture & Society Established Shared Meaning / Norm Result-Close Backbone Foundation — "one sealed Social Update Context
// over committed non-Culture evidence → one Culture-owned established shared meaning/norm → one declared Communicative
// Convention Close through the existing IM-02 machinery → readable AS-OF-NOW after that close" — and nothing more.
// Register lineage: IA-01/02/03/04 (partial), IA-14 (partial), IA-22 (reused / partial); RC-02/03/04/05/11/16; IM-02, IM-03,
// IM-09, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-005. CAL-01 stays UNCALIBRATED (no
// number exists). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  COMMUNICATIVE_CONVENTION_CLOSE,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
} from "@immortalis/contracts";
import { CULTURE_RULE, cultureUpdateId } from "@immortalis/engine";
import {
  CULTURE_CONTEXT_MARKET,
  MANIFESTATION_A,
  cultureConsumerResultKey,
  evidenceInput,
  evidenceReading,
  socialEvidenceKey,
} from "@immortalis/testkit";
import {
  INSTITUTION_KEY,
  REFERENT_KEY,
  SCOPE_KEY,
  advanceCulture,
  commitEvidence,
  commitInstitution,
  cultureSummary,
  preparedCulture,
  primaryContext,
  registerCultureConsumer,
  sealContext,
  seededCultureCampaign,
} from "../support/culture.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const cultureFacts = (s: Awaited<ReturnType<typeof seededCultureCampaign>>) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("culture/"));

describe("a sealed Social Update Context is Culture's own input assembly and creates no social fact (acceptance 1)", () => {
  it("commits under the sole Culture owner/facet, engine-sealed and create-only, with exactly one write and no meaning, norm or foreign fact", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    const before = cultureSummary(s.campaign, s.coordinator);
    const context = await sealContext(s, 1);
    const stored = s.culture.updateContext(context.update_id)!;
    expect(stored.value).toEqual(context);
    expect(stored.fact).toMatchObject({
      key: cultureUpdateContextKey(context.update_id),
      owner: "culture",
      facet: "culture_social",
      version: 1,
      unit: null,
      basis: "culture-fixture-basis",
      secrecy: "culture.engine-sealed",
    });
    expect(stored.fact.provenance.rule).toEqual(CULTURE_RULE);
    const after = cultureSummary(s.campaign, s.coordinator);
    expect(after.culture).toHaveLength(1);
    // the context carries no meaning: the manifestation is read from the evidence, never asserted by whoever seals it
    expect(JSON.stringify(stored.value)).not.toContain(MANIFESTATION_A);
    expect(s.culture.sharedMeaning(context.update_id)).toBeUndefined();
    for (const k of [
      "evidence",
      "world",
      "gip",
      "population",
      "objects",
      "transactions",
    ] as const) {
      expect(after[k], k).toEqual(before[k]);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("is identified by exactly referent × scope × context, and the group pins the bound referent, scope and evidence, never copying them", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    expect(context.update_id).toBe(
      cultureUpdateId(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_MARKET),
    );
    const group = s.campaign.store.committedGroup("culture-intent-1")!;
    expect(group.reads.map((r) => r.key)).toEqual([
      REFERENT_KEY,
      SCOPE_KEY,
      socialEvidenceKey("ev1"),
    ]);
    expect(group.reads.every((r) => r.version === 1)).toBe(true);
  });
});

describe("the primary path: sealed context + committed evidence → the shared meaning at the Communicative Convention Close (acceptance 2)", () => {
  it("commits the Culture-owned fact only as the declared close of the dependent consequence, and the consequence reads it AS-OF-NOW after the close", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    await registerCultureConsumer(s, "c1", context, 2);
    // registration alone publishes nothing: there is no tick, sweep or standalone Culture process
    expect(s.culture.sharedMeaning(context.update_id)).toBeUndefined();
    const r = await must(advanceCulture(s, "tx-c1", "c1"));
    expect(r.transaction.outcome).toMatchObject({
      stop_reason: "TARGET_REACHED",
      unresolved_dependents: [],
    });
    // the Culture close is credited by the transaction, ahead of the consequence that reads it
    expect(r.transaction.stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "culture",
      "SYNTHETIC-CULTURE-RESULT-CONSUMER",
    ]);
    const meaning = s.culture.sharedMeaning(context.update_id)!;
    expect(meaning.fact).toMatchObject({
      key: cultureSharedMeaningKey(context.update_id),
      owner: "culture",
      facet: "culture_social",
      version: 1,
      secrecy: "culture.engine-sealed",
    });
    expect(meaning.fact.provenance.rule).toEqual(CULTURE_RULE);
    expect(meaning.value).toEqual({
      update_id: context.update_id,
      status: "ESTABLISHED",
      referent: { fact_key: REFERENT_KEY, version: 1 },
      scope: { fact_key: SCOPE_KEY, version: 1 },
      context: CULTURE_CONTEXT_MARKET,
      manifestation: MANIFESTATION_A,
      establishment: {
        update: { fact_key: cultureUpdateContextKey(context.update_id), version: 1 },
        evidence: context.inputs,
      },
      close: {
        name: COMMUNICATIVE_CONVENTION_CLOSE,
        stage: cultureConventionStage(context.update_id),
      },
    });
    // the consequence observed exactly the committed fact, read after the close that committed it
    const observed = s.campaign.store.getFact(cultureConsumerResultKey("c1"))!.value as any;
    expect(observed.observed_meaning).toEqual(meaning.value);
    expect(observed.observed_close_group).toBe(meaning.close_group);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("binds a scope to a committed GIP Institution Identity just as to a World-State locus", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitInstitution(s, 1);
    await commitEvidence(s, 1, "ev1", evidenceReading(REFERENT_KEY, INSTITUTION_KEY));
    const context = primaryContext([evidenceInput("ev1")], {
      scope: { fact_key: INSTITUTION_KEY, version: 1 },
      update_id: cultureUpdateId(REFERENT_KEY, INSTITUTION_KEY, CULTURE_CONTEXT_MARKET),
    });
    await sealContext(s, 1, context);
    await registerCultureConsumer(s, "c1", context, 2);
    await must(advanceCulture(s, "tx-c1", "c1"));
    expect(s.culture.sharedMeaning(context.update_id)!.value.scope.fact_key).toBe(INSTITUTION_KEY);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("several agreeing evidence inputs establish the one manifestation they state, each referenced and none copied", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    await commitEvidence(s, 2, "ev2");
    const context = await sealContext(
      s,
      1,
      primaryContext([evidenceInput("ev1"), evidenceInput("ev2")]),
    );
    await registerCultureConsumer(s, "c1", context, 2);
    await must(advanceCulture(s, "tx-c1", "c1"));
    const m = s.culture.sharedMeaning(context.update_id)!;
    expect(m.value.manifestation).toBe(MANIFESTATION_A);
    expect(m.value.establishment.evidence.map((e) => e.fact_key)).toEqual([
      socialEvidenceKey("ev1"),
      socialEvidenceKey("ev2"),
    ]);
    expect(
      s.campaign.store.committedGroup(m.fact.provenance.intent_id)!.reads.map((r) => r.key),
    ).toEqual([
      cultureUpdateContextKey(context.update_id),
      socialEvidenceKey("ev1"),
      socialEvidenceKey("ev2"),
    ]);
  });

  it("a second consequence of the same update adopts the committed fact by identity: it is never duplicated, recomputed or improved", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    await registerCultureConsumer(s, "c1", context, 2);
    await must(advanceCulture(s, "tx-c1", "c1"));
    const first = s.culture.sharedMeaning(context.update_id)!;
    const before = cultureFacts(s);
    await registerCultureConsumer(s, "c2", context, 3);
    await must(advanceCulture(s, "tx-c2", "c2"));
    const second = s.culture.sharedMeaning(context.update_id)!;
    expect(second.fact).toEqual(first.fact);
    expect(cultureFacts(s)).toEqual(before);
    const observed = s.campaign.store.getFact(cultureConsumerResultKey("c2"))!.value as any;
    expect(observed.observed_close_group).toBe(first.close_group);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("no consequence engaged means no meaning is ever committed, however many contexts exist (no tick, sweep or drift)", async () => {
    const s = await seededCultureCampaign(tempDir());
    await preparedCulture(s);
    await s.coordinator.advance({
      transaction_id: "tx-idle",
      cause: "cause-tx-idle",
      trigger: { kind: "fixture-advance-request", ref: "ref-tx-idle" },
      continues: null,
      requested: { target: { unit: "fixture-time-unit", value: 150 }, condition: null },
      context: { role: "role.player", permission: "permission.player_choice.commit" },
      publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
    });
    expect(cultureFacts(s).map((f) => f.key)).toEqual([
      cultureUpdateContextKey(primaryContext().update_id),
    ]);
  });
});
