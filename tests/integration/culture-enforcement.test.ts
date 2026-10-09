/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values and groups */
// Culture enforcement — the seal stops when Population's scope close does not hold (due-but-unreconciled, not at the named
// close, unbound); raw admission re-derives the live Population vouch so a forged, stand-in, stale or mismatched binding fails;
// a raw commit cannot conjure a Culture fact; an absent or non-establishing decision writes nothing; a later distinct update
// never overwrites an OCCUPIED slot; owner exclusivity; the trusted authority is checked first. Local success is NOT
// provider/recovery acceptance.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  cjaDecisionKey,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  populationCohortKey,
} from "@immortalis/contracts";
import { CultureAdapter, type PopulationCloseScopeVerifier } from "@immortalis/engine";
import {
  CJA_TEST_RULE,
  COHORT_BURDEN_L,
  GM_OPERATION,
  LEDGER_MAIN,
  TEST_MANIFESTATION,
  burdenCohort,
  at,
  observationKey,
  popPublication,
  PLACE_L,
  scriptedJudgment,
} from "@immortalis/testkit";
import { PopulationAdapter } from "@immortalis/engine";
import {
  COHORT_KEY,
  REFERENT_KEY,
  SCOPE_KEY,
  advanceCulture,
  attestationOf,
  commitObservations,
  commitPending,
  completePopulationClose2,
  judge,
  judgedCulture,
  lateExit,
  populationScope,
  preparedCulture,
  registerCultureConsumer,
  seal,
  sealRequest,
  sealedContexts,
  seededCultureCampaign,
  type CultureSeeded,
} from "../support/culture.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const cultureFacts = (s: CultureSeeded) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("culture/"));
const codeOf = async (p: Promise<{ ok: boolean; error?: { code: string } }>) => {
  const r = await p;
  return r.ok ? "OK" : (r.error?.code ?? "?");
};
const clone = <T>(x: T): T => structuredClone(x);

describe("Population scope close AT SEAL — the real Port B", () => {
  it("a Cohort stamped at the named ordinary close, with nothing due, seals with a LIVE, evidenced vouch", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    const vouch = ctx.value.constituency.close_vouch as any;
    expect(vouch.live_population_admission).toBe(true);
    expect(vouch.evidence).toMatchObject({
      ledger_id: LEDGER_MAIN,
      cohort_id: COHORT_BURDEN_L,
      close_fact_key: `population/${LEDGER_MAIN}/close`,
    });
    expect(vouch.evidence.instant).toEqual(s.coordinator.state()!.value.canonical_time);
  });

  it("a due-but-unreconciled scope STOPS the seal: nothing is written, no stale close is pinned and none is forged", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitObservations(s);
    await commitPending(s.campaign.store, 10, [lateExit()]);
    const before = cultureFacts(s);
    const r = await seal(s);
    expect(!r.ok && r.error.code).toBe("CONSTITUENCY_INVALID");
    expect(!r.ok && r.error.message).toContain("RECONCILIATION_DUE_NOT_COMPLETED");
    expect(cultureFacts(s)).toEqual(before);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("once the due reconciliation has lawfully completed, the freshly stamped close is the basis and the seal passes", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitObservations(s);
    await commitPending(s.campaign.store, 10, [lateExit()]);
    expect((await seal(s)).ok).toBe(false);
    await completePopulationClose2(s);
    const r = await seal(s);
    expect(r.ok).toBe(true);
    const ctx = sealedContexts(s)[0]!.value;
    expect((ctx.constituency.close_vouch as any).evidence.close_version).toBe(
      s.campaign.store.getFact(`population/${LEDGER_MAIN}/close`)!.version,
    );
    expect(ctx.constituency.cohort_version).toBe(s.campaign.store.getFact(COHORT_KEY)!.version);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a Cohort never stamped by a reconciliation close is not at the named close", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitObservations(s);
    await must(
      new PopulationAdapter(s.campaign.store).instantiateCohort({
        ...popPublication(9),
        ref: burdenCohort("cohort-never-closed", PLACE_L, LEDGER_MAIN, {
          overlap: { declaration: "OVERLAPPING" },
          form: "OVERLAPPING_VIEW",
        }),
      }),
    );
    const r = await seal(
      s,
      sealRequest({ cohort_fact_key: populationCohortKey(LEDGER_MAIN, "cohort-never-closed") }),
    );
    expect(!r.ok && r.error.code).toBe("CONSTITUENCY_INVALID");
    expect(cultureFacts(s)).toEqual([]);
  });

  it.each([
    ["an absent Cohort", () => populationCohortKey(LEDGER_MAIN, "cohort-absent")],
    ["a non-Cohort fact", () => REFERENT_KEY],
    ["another ledger's Cohort key", () => populationCohortKey("ledger-nowhere", COHORT_BURDEN_L)],
  ])("refuses %s as the constituency", async (_n, key) => {
    const s = await seededCultureCampaign(tempDir());
    await commitObservations(s);
    const r = await seal(s, sealRequest({ cohort_fact_key: key() }));
    expect(!r.ok && r.error.code).toBe("CONSTITUENCY_INVALID");
    expect(cultureFacts(s)).toEqual([]);
  });

  it("a verifier configured with NO declared consequence sources, or one omitting a register the latest close consumed from, cannot vouch", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitObservations(s);
    for (const consequenceSources of [
      [],
      [{ owner: "SYNTHETIC-CAUSE-OWNER", fact_key: "synthetic-cause/register-elsewhere" }],
    ]) {
      const culture = new CultureAdapter(s.campaign.store, {
        populationScope: new (populationScope(s.campaign.store).constructor as any)(
          s.campaign.store,
          { consequenceSources },
        ),
      });
      const r = await culture.sealUpdateContext({ basis: "b", request: sealRequest() });
      expect(!r.ok && r.error.code).toBe("CONSTITUENCY_INVALID");
    }
    expect(cultureFacts(s)).toEqual([]);
  });
});

describe("raw admission re-derives the live Population vouch: forged, stand-in, stale or mismatched bindings fail", () => {
  /** a lying Port B that returns the true verdict, edited */
  const lying = (s: CultureSeeded, edit: (c: any) => void): PopulationCloseScopeVerifier => ({
    verifyScopeClose(key) {
      const v: any = clone(populationScope(s.campaign.store).verifyScopeClose(key));
      if (v.lawful) edit(v.constituency);
      return v;
    },
  });
  const sealWith = async (edit: (c: any) => void) => {
    const s = await seededCultureCampaign(tempDir());
    await commitObservations(s);
    const culture = new CultureAdapter(s.campaign.store, { populationScope: lying(s, edit) });
    const r = await culture.sealUpdateContext({ basis: "b", request: sealRequest() });
    return { s, r };
  };
  it.each([
    [
      "a stand-in (non-live) vouch",
      (c: any) =>
        (c.close_vouch = {
          port: "PopulationCloseScopeVerifier",
          live_population_admission: false,
          reconciliation: "NOT_DUE",
        }),
    ],
    ["a Cohort version that is not the committed one", (c: any) => (c.cohort_version += 5)],
    ["a different committing group", (c: any) => (c.committed_by_group_id = "other-group")],
    ["a forged earlier instant", (c: any) => (c.close_vouch.evidence.instant = at(100))],
    [
      "a close version that is not the committed one",
      (c: any) => (c.close_vouch.evidence.close_version += 3),
    ],
    ["another close basis", (c: any) => (c.close_basis.name = "other-close")],
    [
      "a bogus declared-source set that hides the register",
      (c: any) =>
        (c.close_vouch.evidence.consequence_sources = [{ owner: "o", fact_key: "elsewhere" }]),
    ],
  ])("rejects %s", async (_n, edit) => {
    const { s, r } = await sealWith(edit);
    expect(r.ok).toBe(false);
    expect(cultureFacts(s)).toEqual([]);
  });

  it("rejects a raw commit of a due-but-unreconciled binding obtained before the pending consequence existed", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitObservations(s);
    // the verdict is obtained while nothing is due ...
    const stale = populationScope(s.campaign.store).verifyScopeClose(COHORT_KEY);
    expect(stale.lawful).toBe(true);
    // ... a consequence then becomes due; replaying the earlier verdict at seal is refused by admission
    await commitPending(s.campaign.store, 10, [lateExit()]);
    const culture = new CultureAdapter(s.campaign.store, {
      populationScope: { verifyScopeClose: () => stale },
    });
    const r = await culture.sealUpdateContext({ basis: "b", request: sealRequest() });
    expect(r.ok).toBe(false);
    expect(cultureFacts(s)).toEqual([]);
  });
});

describe("seal refusals write nothing", () => {
  const refuse = async (request: unknown, code: string) => {
    const s = await seededCultureCampaign(tempDir());
    await commitObservations(s);
    const r = await seal(s, request);
    expect(!r.ok && r.error.code).toBe(code);
    expect(cultureFacts(s)).toEqual([]);
  };
  it("a malformed request", () => refuse({ junk: 1 }, "INPUT_INVALID"));
  it("a referent that is a Cohort (only a locus or institution binds)", () =>
    refuse(sealRequest({ referent_key: COHORT_KEY }), "BINDING_INVALID"));
  it("an absent scope", () =>
    refuse(sealRequest({ scope_key: "world/absent/locus" }), "BINDING_INVALID"));
  it("an input that is not committed", () =>
    refuse(
      sealRequest({
        inputs: [{ fact_key: observationKey("obs-absent"), read: { basis: "AS-OF-NOW" } }],
        trigger_fact_key: observationKey("obs-absent"),
      }),
      "INPUT_NOT_ENGAGEABLE",
    ));
  it("an unregistered AS-OF-DECLARED-CLOSE input basis (CONDITIONAL: stops at seal)", () =>
    refuse(
      sealRequest({
        inputs: [
          {
            fact_key: observationKey("obs-trigger"),
            read: { basis: "AS-OF-DECLARED-CLOSE", close_name: "some-close" },
          },
        ],
      }),
      "INPUT_NOT_ENGAGEABLE",
    ));
  it("a trigger that is not an engaged input", () =>
    refuse(sealRequest({ trigger_fact_key: "synthetic-cja-observation/other" }), "INPUT_INVALID"));
  it("a Culture-owned fact as input (Culture is never its own evidence)", () =>
    refuse(
      sealRequest({
        inputs: [{ fact_key: REFERENT_KEY, read: { basis: "AS-OF-NOW" } }],
        trigger_fact_key: REFERENT_KEY,
      }),
      "INPUT_NOT_ENGAGEABLE",
    ).catch(() => undefined));
});

describe("a raw commit cannot conjure a Culture fact", () => {
  const meaningGroup = (
    s: CultureSeeded,
    ctx: Awaited<ReturnType<typeof preparedCulture>>,
    value: unknown,
    reads: string[],
  ) => ({
    campaign_id: "fixture-campaign",
    group_id: "forged-close",
    intent_id: "forged-close-intent",
    owner: "culture",
    facet: "culture_social",
    cause: "forged",
    rule: ctx.fact.provenance.rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: reads.map((k) => ({ key: k, version: s.campaign.store.getFact(k)!.version })),
    depends_on: reads.map((k) => s.campaign.store.getFact(k)!.provenance.group_id),
    writes: [
      {
        key: cultureSharedMeaningKey(ctx.value.slot_id),
        owner: "culture",
        facet: "culture_social",
        value: value as never,
        unit: null,
        basis: "b",
        secrecy: "culture.engine-sealed",
        expected_version: 0,
      },
    ],
  });
  const goodValue = (ctx: Awaited<ReturnType<typeof preparedCulture>>, over: any = {}) => ({
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
      name: "communicative-convention-close",
      stage: cultureConventionStage(ctx.updateId, ctx.value.slot_id),
    },
    ...over,
  });

  it("a meaning with no decision committed", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    const r = await s.campaign.store.commit({
      ...meaningGroup(s, ctx, goodValue(ctx), [cultureUpdateContextKey(ctx.updateId)]),
    });
    expect(r.ok).toBe(false);
    expect(s.culture.sharedMeaning(ctx.value.slot_id)).toBeUndefined();
  });

  it.each(["not_supported", "unresolved", "derive"] as const)(
    "a meaning over a %s decision (no Culture fact follows a non-establishing judgment)",
    async (kind) => {
      const s = await seededCultureCampaign(tempDir());
      const ctx = await judgedCulture(s, kind);
      const r = await s.campaign.store.commit(
        meaningGroup(s, ctx, goodValue(ctx), [
          cultureUpdateContextKey(ctx.updateId),
          cjaDecisionKey(ctx.updateId),
        ]),
      );
      expect(r.ok).toBe(false);
      expect(s.culture.sharedMeaning(ctx.value.slot_id)).toBeUndefined();
    },
  );

  it.each([
    [
      "a manifestation the judgment did not author",
      () => ({ manifestation: "manifestation-forged" }),
    ],
    [
      "a copied foreign-observation reading",
      () => ({ recognition: "CONTINUING_SHARED_RECOGNITION" }),
    ],
    ["a count", () => ({ count: 12 })],
  ])("a meaning carrying %s", async (_n, over) => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s);
    const r = await s.campaign.store.commit(
      meaningGroup(s, ctx, goodValue(ctx, over()), [
        cultureUpdateContextKey(ctx.updateId),
        cjaDecisionKey(ctx.updateId),
      ]),
    );
    expect(r.ok).toBe(false);
    expect(s.culture.sharedMeaning(ctx.value.slot_id)).toBeUndefined();
  });

  it("even the exactly-correct meaning, outside an IM-02 stage under a transaction's durable authority", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s);
    const r = await s.campaign.store.commit(
      meaningGroup(s, ctx, goodValue(ctx), [
        cultureUpdateContextKey(ctx.updateId),
        cjaDecisionKey(ctx.updateId),
      ]),
    );
    expect(r.ok).toBe(false);
    expect(s.culture.sharedMeaning(ctx.value.slot_id)).toBeUndefined();
  });

  it("a close that reads a foreign observation or the Cohort (anything beyond context and decision)", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await judgedCulture(s);
    const r = await s.campaign.store.commit(
      meaningGroup(s, ctx, goodValue(ctx), [
        cultureUpdateContextKey(ctx.updateId),
        cjaDecisionKey(ctx.updateId),
        observationKey("obs-trigger"),
      ]),
    );
    expect(r.ok).toBe(false);
  });
});

describe("owner exclusivity", () => {
  it("only the Culture owner writes culture/ keys; the Culture owner writes no other owner's key space", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    const base = {
      campaign_id: "fixture-campaign",
      cause: "probe",
      rule: ctx.fact.provenance.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
    };
    const w = (key: string, owner: string, facet: string) => ({
      key,
      owner,
      facet,
      value: { probe: 1 } as never,
      unit: null,
      basis: "b",
      secrecy: "s",
      expected_version: 0,
    });
    const probes: [string, string, string, string][] = [
      [
        "culture_adjudication_kernel",
        "adjudication_provenance",
        "culture/meaning/culture-slot-x",
        "p1",
      ],
      [
        "SYNTHETIC-CJA-OBSERVATION-SOURCE",
        "synthetic-cja-observation",
        "culture/update/" + "e".repeat(64) + "/context",
        "p2",
      ],
      ["population", "population_state", "culture/meaning/culture-slot-y", "p3"],
      ["culture", "culture_social", cjaDecisionKey("e".repeat(64)), "p4"],
      ["culture", "culture_social", "population/ledger-main/close", "p5"],
      ["culture", "culture_social", observationKey("obs-new"), "p6"],
    ];
    for (const [owner, facet, key, id] of probes) {
      const r = await s.campaign.store.commit({
        ...base,
        group_id: id,
        intent_id: `${id}-i`,
        owner,
        facet,
        writes: [w(key, owner, facet)],
      });
      expect(r.ok, `${owner} -> ${key}`).toBe(false);
    }
  });
});

describe("a later distinct update never overwrites an OCCUPIED Culture slot (deferred lifecycle)", () => {
  it("a second trigger yields a distinct update identity over the same slot; its positive judgment commits, its close cannot overwrite", async () => {
    const s = await seededCultureCampaign(tempDir());
    const first = await judgedCulture(s);
    await registerCultureConsumer(s, "c1", first.value, 10);
    await must(advanceCulture(s, "tx-c1", "c1"));
    const meaning = s.culture.sharedMeaning(first.value.slot_id)!;

    // a distinct committed trigger over the same material distinction
    await must(seal(s, sealRequest({ trigger_fact_key: observationKey("obs-repeat") }), 2));
    const second = sealedContexts(s).find((c) => c.updateId !== first.updateId)!;
    expect(second.value.slot_id).toBe(first.value.slot_id);
    expect(second.updateId).not.toBe(first.updateId);
    await must(judge(s, second.updateId, "positive"));
    await registerCultureConsumer(s, "c2", second.value, 11);
    const r = await must(advanceCulture(s, "tx-c2", "c2"));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents[0]).toMatchObject({
      reason: "SOURCE_INVALID",
    });
    // the occupied slot is untouched: same fact, same version, same close group
    expect(s.culture.sharedMeaning(first.value.slot_id)!.fact).toEqual(meaning.fact);
    expect(s.culture.sharedMeaning(first.value.slot_id)!.value.establishment.update_id).toBe(
      first.updateId,
    );
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("trusted adjudication authority is checked first, and the sealed context is the only thing it consumes", () => {
  it("a wrong operation context is refused before the context is read; no decision follows; the seal is unaffected", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    const j = scriptedJudgment(attestationOf(s, ctx.updateId), "positive");
    for (const operation of [
      undefined,
      { role: "role.player", permission: "permission.rule.adjudicate" },
      { role: "role.archivist", permission: "permission.canon.write" },
    ]) {
      expect(await codeOf(s.gm.adjudicate({ operation, judgment: j }))).toBe("AUTHORITY_DENIED");
    }
    expect(s.gm.decision(ctx.updateId)).toBeUndefined();
    expect(await codeOf(s.gm.adjudicate({ operation: GM_OPERATION, judgment: j }))).toBe("OK");
  });

  it("the real Port A attests the committed context exactly, and an unknown update is ABSENT (dependent work stops)", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    const att = attestationOf(s, ctx.updateId);
    expect(att.context).toEqual({
      owner: "culture",
      fact_key: cultureUpdateContextKey(ctx.updateId),
      version: 1,
      committed_by_group_id: ctx.fact.provenance.group_id,
    });
    expect(att.inputs).toEqual(ctx.value.inputs);
    expect(s.attestor.attest("f".repeat(64))).toEqual({ status: "ABSENT" });
    const j = scriptedJudgment(att, "positive", { culture_update_id: "f".repeat(64) });
    expect(await codeOf(s.gm.adjudicate({ operation: GM_OPERATION, judgment: j }))).toBe(
      "CONTEXT_ABSENT",
    );
  });

  it("rule-mismatched judgments are refused (the judgment cites the registered method)", async () => {
    const s = await seededCultureCampaign(tempDir());
    const ctx = await preparedCulture(s);
    const j = scriptedJudgment(attestationOf(s, ctx.updateId), "positive", {
      rule_ref: { ...CJA_TEST_RULE, clause: "other" },
    });
    expect(await codeOf(s.gm.adjudicate({ operation: GM_OPERATION, judgment: j }))).toBe(
      "RULE_MISMATCH",
    );
    expect(s.gm.decision(ctx.updateId)).toBeUndefined();
  });
});
