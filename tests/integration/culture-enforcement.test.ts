/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Culture & Society — enforcement that does not depend on the coordinator or on the owner operation behaving. IM-11 admission
// holds for a raw `store.commit` and for a TAMPERED group; owner exclusivity holds for everyone; a shared meaning/norm is
// never conjured by a caller, a contact, a policy, a packet or its refusal, a KTI receipt, a Cohort count, a lone or
// disagreeing reading or an unbound referent/scope; the sealed context and the meaning are create-only; stage order and the
// source-preserving read basis are enforced at registration; and no read scans the world.
// Register lineage: IA-02, IA-03, IA-04 (partial), IA-14 (partial); RC-02, RC-03, RC-04, RC-07, RC-11, RC-16; IM-02, IM-03,
// IM-09, IM-11, IM-12, IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_CULTURE_ENGINE_SIDE,
  CANON_WRITE_AUTHORITY,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  type CommitGroup,
  type CultureUpdateContext,
} from "@immortalis/contracts";
import {
  CULTURE_RULE,
  CultureAdapter,
  TemporalCoordinator,
  cultureConventionCloseRead,
  cultureConventionDeclaration,
  cultureSharedMeaningNowRead,
  cultureUpdateId,
  deriveSharedMeaning,
  stageGroupId,
  verifyCultureIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  CULTURE_CONTEXT_MARKET,
  CULTURE_CONTEXT_OTHER,
  FIXTURE_CAMPAIGN,
  MANIFESTATION_A,
  MANIFESTATION_B,
  SYNTH_CULTURE_CONSUMER_OWNER,
  SYNTH_SOCIAL_EVIDENCE_OWNER,
  cultureConsumerDeclaration,
  cultureConsumerResultKey,
  cultureContext,
  cultureProviders,
  culturePublication,
  evidenceInput,
  evidenceReading,
  socialEvidenceKey,
  temporalPublication,
} from "@immortalis/testkit";
import {
  INSTITUTION_KEY,
  REFERENT_KEY,
  SCOPE_KEY,
  advanceCulture,
  commitEvidence,
  commitInstitution,
  cultureConsumerObjectAt,
  cultureSummary,
  preparedCulture,
  primaryContext,
  registerCultureConsumer,
  requestToBoundary,
  sealContext,
  seededCultureCampaign,
  type CultureSeeded,
} from "../support/culture.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { expectedAdapterMethods } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const contextKey = (c: CultureUpdateContext) => cultureUpdateContextKey(c.update_id);
const meaningKey = (c: CultureUpdateContext) => cultureSharedMeaningKey(c.update_id);
const cultureFacts = (s: CultureSeeded) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("culture/"));
const sealCode = (s: CultureSeeded, n: number, context: unknown) =>
  codeOf(s.culture.sealUpdateContext({ ...culturePublication(n), context }));

const wr = (
  key: string,
  value: unknown,
  over: { owner?: string; facet?: string; secrecy?: string; expected_version?: number } = {},
) => ({
  key,
  owner: over.owner ?? "culture",
  facet: over.facet ?? "culture_social",
  value: value as never,
  unit: null,
  basis: "culture-fixture-basis",
  secrecy: over.secrecy ?? ACCESS_CLASS_CULTURE_ENGINE_SIDE,
  expected_version: over.expected_version ?? 0,
});

/** A raw context group built from the committed state, exactly as an unauthorized (or sloppy) caller might build it. */
function rawContext(
  s: CultureSeeded,
  over: Partial<CommitGroup> & { value?: unknown; key?: string; secrecy?: string } = {},
  context: CultureUpdateContext = primaryContext(),
  n = 901,
): CommitGroup {
  const { value, key, secrecy, ...group } = over;
  const pinned = [
    ...new Set([
      context.referent.fact_key,
      context.scope.fact_key,
      ...context.inputs.map((i) => i.fact_key),
    ]),
  ];
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner: "culture",
    facet: "culture_social",
    group_id: `raw-context-group-${n}`,
    intent_id: `raw-context-intent-${n}`,
    cause: `raw-context-cause-${n}`,
    rule: CULTURE_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: pinned.map((k) => ({ key: k, version: s.campaign.store.getFact(k)?.version ?? 0 })),
    depends_on: [
      ...new Set(pinned.flatMap((k) => s.campaign.store.getFact(k)?.provenance.group_id ?? [])),
    ],
    writes: [
      wr(key ?? contextKey(context), "value" in over ? value : context, {
        ...(secrecy ? { secrecy } : {}),
      }),
    ],
    ...group,
  };
}

/** A raw meaning group built from the values the committed context and evidence determine (lawful content, any identity). */
function formation(
  s: CultureSeeded,
  context: CultureUpdateContext,
  over: Partial<CommitGroup> = {},
) {
  const ctxFact = s.campaign.store.getFact(contextKey(context))!;
  const evidence = context.inputs.map((i) => s.campaign.store.getFact(i.fact_key)!);
  const derived = deriveSharedMeaning({
    context: { key: ctxFact.key, owner: ctxFact.owner, version: ctxFact.version, value: context },
    evidence: evidence.map((f) => ({
      key: f.key,
      owner: f.owner,
      version: f.version,
      value: f.value,
    })),
  });
  if (!derived.ok) throw new Error("fixture");
  const facts = [ctxFact, ...evidence];
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner: "culture",
    facet: "culture_social",
    group_id: "raw-formation-group",
    intent_id: "raw-formation-intent",
    cause: "raw-formation-cause",
    rule: CULTURE_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: facts.map((f) => ({ key: f.key, version: f.version })),
    depends_on: facts.map((f) => f.provenance.group_id),
    writes: [wr(meaningKey(context), derived.value)],
    ...over,
  } as CommitGroup;
}

/** A store whose groups of the named owner are altered on the way in, to prove IM-11 (not the operation) refuses. */
function tamperStore(
  inner: CampaignStore,
  owner: string,
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
      if (group.owner !== owner) return inner.commit(g);
      n += 1;
      return inner.commit(mutate(group));
    },
  };
  return { store, tampered: () => n };
}

describe("owner exclusivity: only the Culture owner writes Culture state (acceptance: non-Culture owner write refusal)", () => {
  it("every other registered owner, including the evidence source and the consumer, is refused both key spaces", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = primaryContext();
    const owners: [string, string][] = [
      ["world_state", "world_profile"],
      ["pc_existence", "existence_contract"],
      ["role_registry", "player_character_binding"],
      ["temporal_kernel", "temporal_coordination"],
      ["population", "population_state"],
      ["production", "production_state"],
      ["economy", "economy_state"],
      ["logistics", "logistics_state"],
      ["named_actor", "actor_profile"],
      ["epistemic_access", "epistemic_access"],
      ["kti", "kti_development"],
      ["gip", "gip_institution_identity"],
      ["diplomacy", "diplomacy_framework"],
      [SYNTH_SOCIAL_EVIDENCE_OWNER, "synthetic-social-evidence"],
      [SYNTH_CULTURE_CONSUMER_OWNER, "synthetic-culture-result-consumer"],
    ];
    let n = 0;
    for (const [owner, facet] of owners)
      for (const key of [contextKey(context), meaningKey(context)])
        expect(
          await codeOf(
            s.campaign.store.commit({
              ...rawContext(s, {}, context, n++),
              owner,
              facet,
              writes: [wr(key, context, { owner, facet })],
            }),
          ),
          `${owner} → ${key}`,
        ).toBe("KEY_NOT_ADMITTED");
    expect(cultureFacts(s)).toEqual([]);
  });

  it("an unregistered owner, a wrong facet and a fallback owner are refused: there is no generic fallback", async () => {
    const s = await seededCultureCampaign(tempDir());
    for (const [owner, facet] of [
      ["cultures", "culture_social"],
      ["culture", "social"],
      ["culture", "culture"],
      ["society", "culture_social"],
      ["social", "culture_social"],
      ["generic", "fallback"],
      ["host", "culture_social"],
      ["role.gm", "culture_social"],
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(rawContext(s, { owner, facet }))),
        owner + facet,
      ).toBe("OWNER_NOT_REGISTERED");
  });

  it("the Culture owner cannot write a foreign key space, nor an unmodelled Culture key (relation, position, prevalence, adoption…)", async () => {
    const s = await seededCultureCampaign(tempDir());
    await preparedCulture(s);
    for (const key of [
      "world/w1/profile",
      "pc/p1/existence-contract",
      "population/l1/ledger",
      "population/l1/cohort/c1",
      "economy/demand/d1",
      "kti/object/o1",
      "gip/institution/i1/identity",
      "access/e1/packet/a1",
      "actor/a1/capability/c1",
      "temporal/state",
      "synthetic-social-evidence/ev9",
      "synthetic-culture-result-consumer/result/x",
      "culture/relation/r1",
      "culture/position/p1",
      "culture/prevalence/u1",
      "culture/update/u1",
      "culture/update/u1/context/extra",
      "culture/update/u1/result",
      "culture/meaning",
      "culture/meaning/u1/extra",
      "cultures/meaning/u1",
    ])
      expect(await codeOf(s.campaign.store.commit(rawContext(s, { key }))), key).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
      );
  });

  it("a Culture key the Culture owner already holds cannot be taken over by another owner's group", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    expect(
      await codeOf(
        s.campaign.store.commit({
          ...rawContext(s, { owner: "world_state", facet: "world_profile" }, context),
          writes: [
            wr(contextKey(context), context, { owner: "world_state", facet: "world_profile" }),
          ],
        }),
      ),
    ).toBe("FACT_OWNER_CONFLICT");
  });

  it("canonical publication needs role.archivist + permission.canon.write: a persona, player, GM or host role writes nothing", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    for (const authority of [
      { role: "role.player", permission: "permission.player_choice.commit" },
      { role: "role.archivist", permission: "permission.player_choice.commit" },
      { role: "role.gm", permission: "permission.canon.write" },
      { role: "host.tool", permission: "permission.canon.write" },
    ])
      expect(await codeOf(s.campaign.store.commit(rawContext(s, { authority })))).toBe(
        "AUTHORITY_DENIED",
      );
    expect(cultureFacts(s)).toEqual([]);
  });

  it("the adapter exposes one authored publication and typed reads: no fact writer, setter, update, rebinding, contestation, retirement, relation, position, prevalence, adoption or belief method", () => {
    const methods = adapterMethods(CultureAdapter);
    expect(methods).toEqual(expectedAdapterMethods("CultureAdapter"));
    expect(
      methods.filter((m) =>
        /write|retire|rebind|contest|relation|position|prevalence|adopt|belief|motive|tick|sweep|drift|infer|score|percent|count|cohort|meaning(?!$)/i.test(
          m,
        ),
      ),
    ).toEqual([]);
  });
});

describe("a shared meaning is established by evidence, never asserted by whoever seals the context (acceptance: evidence-absent and non-material refusals, no fact)", () => {
  it("a context that carries any asserted meaning, norm, manifestation, prevalence, count, strength, adoption, belief or Cohort is refused, committing nothing", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    const base = primaryContext();
    for (const extra of [
      { manifestation: MANIFESTATION_A },
      { meaning: "taboo" },
      { norm: "deference" },
      { prevalence: 0.6 },
      { percentage: 60 },
      { count: 12 },
      { strength: "high" },
      { adoption: "complete" },
      { belief: "shared" },
      { cohort: { fact_key: "population/l1/cohort/c1" } },
      { status: "ESTABLISHED" },
    ]) {
      const value = { ...base, ...extra };
      expect(await sealCode(s, 1, value), JSON.stringify(extra)).toBe("INPUT_INVALID");
      expect(
        await codeOf(s.campaign.store.commit(rawContext(s, { value }, base))),
        JSON.stringify(extra),
      ).toBe("VALUE_INVALID");
    }
    // and the admission gate is a literal restatement, not a toggle
    for (const admission of [
      { ...base.admission, may_alter_later_answer: false },
      { ...base.admission, independent_causal_inertia: undefined },
      { ...base.admission, not_faithfully_reconstructable: "yes" },
    ])
      expect(await sealCode(s, 2, { ...base, admission })).toBe("INPUT_INVALID");
    expect(cultureFacts(s)).toEqual([]);
  });

  it("evidence that is not yet committed seals nothing: a context may not precede the evidence it seals", async () => {
    const s = await seededCultureCampaign(tempDir());
    expect(await sealCode(s, 1, primaryContext())).toBe("PREREQUISITE_MISSING");
    expect(cultureFacts(s)).toEqual([]);
    // once the evidence is committed, the same context seals
    await commitEvidence(s, 1, "ev1");
    expect(await sealCode(s, 2, primaryContext())).toBe("OK");
  });

  it("contact, policy, packet-refusal, KTI-receipt and Cohort-count look-alikes — and any reading short of a continuing shared recognition — establish nothing", async () => {
    const s = await seededCultureCampaign(tempDir());
    const good = evidenceReading(REFERENT_KEY, SCOPE_KEY);
    const lookalikes: Record<string, unknown> = {
      contact: { kind: "CONTACT", referent: REFERENT_KEY, scope: SCOPE_KEY },
      policy: { kind: "POLICY_ENACTED", referent: REFERENT_KEY, instrument: "i1" },
      "packet refusal": { kind: "PACKET_REFUSED", event_id: "e1", recipient: "a1" },
      "kti receipt": { package_id: "transfer-1", status: "ACTIVE", recipient: "a1" },
      "cohort count": { cohort: "population/l1/cohort/c1", count: 40 },
      "string only": "SYNTHETIC FIXTURE: they all did it",
      "recognition not continuing": { ...good, recognition: "ONCE" },
      "recognition missing": Object.fromEntries(
        Object.entries(good).filter(([k]) => k !== "recognition"),
      ),
      "extra prevalence": { ...good, prevalence: 0.6 },
      "extra strength": { ...good, strength: 3 },
      "manifestation missing": Object.fromEntries(
        Object.entries(good).filter(([k]) => k !== "manifestation"),
      ),
    };
    let n = 1;
    for (const [name, value] of Object.entries(lookalikes)) {
      const id = `la-${n}`;
      await commitEvidence(s, n, id, value);
      expect(await sealCode(s, n, primaryContext([evidenceInput(id)])), name).toBe(
        "REFERENCE_INVALID",
      );
      n += 1;
    }
    expect(cultureFacts(s)).toEqual([]);
  });

  it("evidence for another referent, scope or context establishes nothing here, and a lone contradicting reading makes the whole set establish nothing", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "other-referent", evidenceReading(SCOPE_KEY, SCOPE_KEY));
    await commitEvidence(s, 2, "other-scope", evidenceReading(REFERENT_KEY, REFERENT_KEY));
    await commitEvidence(
      s,
      3,
      "other-context",
      evidenceReading(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_OTHER),
    );
    await commitEvidence(s, 4, "ev1");
    await commitEvidence(
      s,
      5,
      "disagrees",
      evidenceReading(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_MARKET, MANIFESTATION_B),
    );
    for (const id of ["other-referent", "other-scope", "other-context"])
      expect(await sealCode(s, 10, primaryContext([evidenceInput(id)])), id).toBe(
        "REFERENCE_INVALID",
      );
    // contestation is not implemented: disagreeing evidence establishes neither manifestation
    expect(
      await sealCode(s, 11, primaryContext([evidenceInput("ev1"), evidenceInput("disagrees")])),
    ).toBe("REFERENCE_INVALID");
    expect(cultureFacts(s)).toEqual([]);
  });

  it("another owner's real facts are not evidence: a World-State locus, a GIP Institution Identity or a Culture fact pinned as an input establishes nothing", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitInstitution(s, 1);
    await commitEvidence(s, 1, "ev1");
    const realInputs = [
      { owner: "world_state", fact_key: SCOPE_KEY },
      { owner: "gip", fact_key: INSTITUTION_KEY },
    ];
    for (const [i, r] of realInputs.entries())
      expect(
        await sealCode(s, i + 1, primaryContext([{ ...evidenceInput("ev1"), ...r, version: 1 }])),
        r.owner,
      ).toBe("REFERENCE_INVALID");
    // a Culture owner never counts as its own evidence
    const context = await sealContext(s, 5);
    const loop = primaryContext(
      [{ ...evidenceInput("ev1"), owner: "culture", fact_key: contextKey(context), version: 1 }],
      { contextName: CULTURE_CONTEXT_OTHER },
    );
    await commitEvidence(
      s,
      2,
      "ev2",
      evidenceReading(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_OTHER),
    );
    expect(await sealCode(s, 6, loop)).toBe("REFERENCE_INVALID");
    expect(cultureFacts(s)).toHaveLength(1);
  });

  it("an input pinned at a stale or future version, owned by another owner, or engaged twice seals nothing", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    for (const [name, inputs] of Object.entries({
      "future version": [evidenceInput("ev1", { version: 2 })],
      "stale version": [evidenceInput("ev1", { version: 0 })],
      "wrong owner": [evidenceInput("ev1", { owner: "world_state" })],
      "engaged twice": [evidenceInput("ev1"), evidenceInput("ev1")],
    }))
      expect(await sealCode(s, 1, primaryContext(inputs)), name).not.toBe("OK");
    expect(cultureFacts(s)).toEqual([]);
  });

  it("an AS-OF-DECLARED-CLOSE input needs its owner's registered, named close: none is registered, so it is CONDITIONAL and nothing is sealed, declared or written", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    const closeInput = evidenceInput("ev1", {
      read: {
        basis: "AS-OF-DECLARED-CLOSE",
        close_basis: {
          name: "synthetic-evidence-close",
          producer: { owner: SYNTH_SOCIAL_EVIDENCE_OWNER, operation: "synthetic-op" },
        },
      },
    });
    const context = primaryContext([closeInput]);
    expect(await sealCode(s, 1, context)).toBe("REFERENCE_INVALID");
    // the declaration builder refuses too: a stage is never declared over an input without a registered basis
    expect(cultureConventionDeclaration(context)).toBeNull();
    expect(cultureFacts(s)).toEqual([]);
  });
});

describe("a referent and a scope are bound to existing canonical authority, or the context fails closed (acceptance: source-basis enforcement)", () => {
  it("an uncommitted fact, a non-canonical owner's fact, a fact of an unbindable kind or a wrong pinned version is refused for the referent and the scope", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    const bad: Record<string, string> = {
      "uncommitted locus": "world/world-fixture-1/locus/never-established",
      "evidence source fact": socialEvidenceKey("ev1"),
      "temporal state": "temporal/state",
      "Population Cohort": "population/l1/cohort/c1",
      "KTI object": "kti/object/o1",
      "unregistered key": "something/else",
    };
    for (const [name, key] of Object.entries(bad)) {
      for (const field of ["referent", "scope"] as const) {
        const ref = { fact_key: key, version: 1 };
        const c = primaryContext([evidenceInput("ev1")], {
          [field]: ref,
          update_id: cultureUpdateId(
            field === "referent" ? key : REFERENT_KEY,
            field === "scope" ? key : SCOPE_KEY,
            CULTURE_CONTEXT_MARKET,
          ),
        });
        expect(await sealCode(s, 1, c), `${name} as ${field}`).toBe("REFERENCE_INVALID");
      }
    }
    // a committed locus pinned at the wrong version
    const staleReferent = primaryContext([evidenceInput("ev1")], {
      referent: { fact_key: REFERENT_KEY, version: 2 },
    });
    expect(await sealCode(s, 2, staleReferent)).toBe("REFERENCE_INVALID");
    expect(cultureFacts(s)).toEqual([]);
  });

  it("the update identity is exactly referent × scope × context: a forged identity or a mismatched key is refused", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    const forged = primaryContext([evidenceInput("ev1")], { update_id: "culture-update-forged" });
    expect(await codeOf(s.campaign.store.commit(rawContext(s, {}, forged)))).toBe(
      "REFERENCE_INVALID",
    );
    const ok = primaryContext([evidenceInput("ev1")]);
    expect(
      await codeOf(s.campaign.store.commit(rawContext(s, { key: contextKey(forged) }, ok))),
    ).toBe("VALUE_INVALID");
    expect(cultureFacts(s)).toEqual([]);
  });

  it("a context that does not pin exactly its referent, scope and inputs, in order and at their current versions, is refused", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    const c = primaryContext();
    const full = rawContext(s, {}, c);
    const dropRead = { ...full, reads: full.reads.slice(1) };
    const dropDep = { ...full, depends_on: full.depends_on.slice(1) };
    const stale = { ...full, reads: full.reads.map((r) => ({ ...r, version: 9 })) };
    const reordered = { ...full, reads: [...full.reads].reverse() };
    for (const [name, g] of Object.entries({ dropRead, dropDep, stale, reordered }))
      expect(await codeOf(s.campaign.store.commit(g)), name).toMatch(
        /^(REFERENCE_INVALID|STALE_READ)$/,
      );
    expect(cultureFacts(s)).toEqual([]);
  });

  it("the secrecy class is the owner's, never the caller's: a caller-supplied label cannot make Culture state actor-accessible", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    for (const secrecy of [
      "epistemic.actor-accessible",
      "culture.actor-accessible",
      "fixture-visibility",
    ])
      expect(await codeOf(s.campaign.store.commit(rawContext(s, { secrecy })))).toBe(
        "VALUE_INVALID",
      );
    expect(cultureFacts(s)).toEqual([]);
  });
});

describe("the slot is occupied and sealed: no overwrite, duplicate effect or silent reuse (acceptance: repeat / retry / no duplicate effect)", () => {
  it("a second context for the same referent × scope × context is refused, with different or identical inputs, and the first stands", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    await commitEvidence(s, 2, "ev2");
    const first = await sealContext(s, 1, primaryContext([evidenceInput("ev1")]));
    const stored = structuredClone(s.campaign.store.getFact(contextKey(first))!);
    expect(await sealCode(s, 2, primaryContext([evidenceInput("ev1"), evidenceInput("ev2")]))).toBe(
      "VERSION_CONFLICT",
    );
    expect(await sealCode(s, 3, primaryContext([evidenceInput("ev1")]))).toBe("VERSION_CONFLICT");
    expect(s.campaign.store.getFact(contextKey(first))).toEqual(stored);
    expect(cultureFacts(s)).toHaveLength(1);
  });

  it("re-presenting the very intent that committed is the same receipt; a changed input under it is a conflict, never a silent reuse", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    const c = primaryContext();
    const first = await must(s.culture.sealUpdateContext({ ...culturePublication(1), context: c }));
    const again = await must(s.culture.sealUpdateContext({ ...culturePublication(1), context: c }));
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(
      await sealCode(
        s,
        1,
        primaryContext([evidenceInput("ev1")], { contextName: CULTURE_CONTEXT_OTHER }),
      ),
    ).toBe("INTENT_CONFLICT");
    expect(cultureFacts(s)).toHaveLength(1);
  });

  it("a different context for the same referent and scope is a different slot, not a sibling of or an overwrite of the first", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    await commitEvidence(
      s,
      2,
      "ev2",
      evidenceReading(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_OTHER, MANIFESTATION_B),
    );
    const a = await sealContext(s, 1, primaryContext([evidenceInput("ev1")]));
    const b = await sealContext(
      s,
      2,
      primaryContext([evidenceInput("ev2")], {
        contextName: CULTURE_CONTEXT_OTHER,
        update_id: cultureUpdateId(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_OTHER),
        context: CULTURE_CONTEXT_OTHER,
      }),
    );
    expect(a.update_id).not.toBe(b.update_id);
    await registerCultureConsumer(s, "c1", a, 3);
    await registerCultureConsumer(s, "c2", b, 4);
    // both consequences are due at the same instant and resolve in one transaction, each declaring its own, distinct close
    await must(advanceCulture(s, "tx-c1", "c1"));
    expect(s.culture.sharedMeaning(a.update_id)!.value.manifestation).toBe(MANIFESTATION_A);
    expect(s.culture.sharedMeaning(b.update_id)!.value.manifestation).toBe(MANIFESTATION_B);
  });

  it("the committed context and meaning are sealed: re-publication, improvement or any rewrite is refused, even through the owner", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    await registerCultureConsumer(s, "c1", context, 2);
    await must(advanceCulture(s, "tx-c1", "c1"));
    const meaning = structuredClone(s.campaign.store.getFact(meaningKey(context))!);
    const ctx = structuredClone(s.campaign.store.getFact(contextKey(context))!);
    for (const [key, value] of [
      [meaningKey(context), { ...(meaning.value as object), manifestation: MANIFESTATION_B }],
      [meaningKey(context), meaning.value],
      [contextKey(context), { ...context, context: context.context }],
    ] as const) {
      for (const expected_version of [0, 1]) {
        const code = await codeOf(
          s.campaign.store.commit({
            ...rawContext(s, {}, context, 700 + expected_version),
            writes: [wr(key, value, { expected_version })],
          }),
        );
        expect(code, `${key} v${expected_version}`).toMatch(
          /^(VERSION_CONFLICT|AMENDMENT_NOT_SUPPORTED|VALUE_INVALID|REFERENCE_INVALID)$/,
        );
      }
    }
    expect(s.campaign.store.getFact(meaningKey(context))).toEqual(meaning);
    expect(s.campaign.store.getFact(contextKey(context))).toEqual(ctx);
  });
});

describe("a meaning is exactly what its context and evidence determine, only as its stage, under an open transaction (acceptance: stage-order enforcement)", () => {
  it("no meaning exists without its sealed context: a raw formation, even exactly shaped, has nothing to derive from", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    const context = primaryContext();
    // seal in a scratch campaign only to obtain the lawful value; the target campaign has NO sealed context
    const scratch = await seededCultureCampaign(tempDir());
    await commitEvidence(scratch, 1, "ev1");
    await sealContext(scratch, 1, context);
    const g = formation(scratch, context);
    expect(await codeOf(s.campaign.store.commit(g))).toMatch(/^(PREREQUISITE_MISSING|STALE_READ)$/);
    expect(cultureFacts(s)).toEqual([]);
  });

  it("a raw formation commits only under the stage identity and a durable open transaction authority: a forged or absent cause publishes nothing", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    const stage = cultureConventionStage(context.update_id);
    // no authority at all
    expect(await codeOf(s.campaign.store.commit(formation(s, context)))).toBe("REFERENCE_INVALID");
    // the stage identity without an authority
    expect(
      await codeOf(
        s.campaign.store.commit(
          formation(s, context, {
            group_id: stageGroupId(stage),
            cause: "transaction:tx-forged",
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.culture.sharedMeaning(context.update_id)).toBeUndefined();
  });

  it("a stage group whose content is not what the context and evidence determine publishes nothing: a tampered manifestation, status, referent, scope, context, evidence, close or extra field is refused, and the consequence is unresolved", async () => {
    const mutations: Record<string, (v: any) => void> = {
      "manifestation changed": (v) => (v.manifestation = MANIFESTATION_B),
      "status retired": (v) => (v.status = "RETIRED"),
      "referent swapped": (v) => (v.referent.fact_key = SCOPE_KEY),
      "scope swapped": (v) => (v.scope.fact_key = REFERENT_KEY),
      "context renamed": (v) => (v.context = CULTURE_CONTEXT_OTHER),
      "evidence dropped": (v) => (v.establishment.evidence = v.establishment.evidence.slice(1)),
      "evidence re-pinned": (v) => (v.establishment.evidence[0].version = 9),
      "update re-pinned": (v) => (v.establishment.update.version = 9),
      "close renamed": (v) => (v.close.name = "social-relation-close"),
      "prevalence added": (v) => (v.prevalence = 0.7),
      "cohort added": (v) => (v.cohort = { fact_key: "population/l1/cohort/c1" }),
      "update identity forged": (v) => (v.update_id = "culture-update-forged"),
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const s = await seededCultureCampaign(tempDir());
      const context = await preparedCulture(s);
      await registerCultureConsumer(s, "c1", context, 2);
      const t = tamperStore(s.campaign.store, "culture", (g) => ({
        ...g,
        writes: g.writes.map((w) => {
          const v = structuredClone(w.value) as any;
          mutate(v);
          return { ...w, value: v };
        }),
      }));
      const r = await new TemporalCoordinator(t.store, cultureProviders()).advance(
        requestToBoundary(s, "tx-c1", "culture-consumer-obj-c1"),
      );
      expect(t.tampered(), name).toBeGreaterThan(0);
      expect(s.culture.sharedMeaning(context.update_id), name).toBeUndefined();
      expect(s.campaign.store.getFact(cultureConsumerResultKey("c1")), name).toBeUndefined();
      expect(
        r.ok && r.value.transaction.outcome.unresolved_dependents.length,
        name,
      ).toBeGreaterThan(0);
    }
  });

  it("a result close that drops a declared read, reads another fact or reads a different version is refused", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    await commitEvidence(s, 2, "ev2");
    const context = await sealContext(
      s,
      1,
      primaryContext([evidenceInput("ev1"), evidenceInput("ev2")]),
    );
    await registerCultureConsumer(s, "c1", context, 2);
    for (const [name, mutate] of Object.entries({
      "drops the context": (g: CommitGroup) => ({ ...g, reads: g.reads.slice(1) }),
      "drops an input": (g: CommitGroup) => ({ ...g, reads: g.reads.slice(0, -1) }),
      "reads another fact": (g: CommitGroup) => ({
        ...g,
        reads: [...g.reads.slice(0, -1), { key: REFERENT_KEY, version: 1 }],
      }),
      "reads a stale version": (g: CommitGroup) => ({
        ...g,
        reads: g.reads.map((r) => ({ ...r, version: r.version + 1 })),
      }),
    })) {
      const t = tamperStore(s.campaign.store, "culture", mutate);
      const r = await new TemporalCoordinator(t.store, cultureProviders()).advance(
        requestToBoundary(s, `tx-${name}`, "culture-consumer-obj-c1"),
      );
      // either the advance fails closed or it reports the dependents unresolved; the meaning is never published
      if (r.ok)
        expect(r.value.transaction.outcome.unresolved_dependents.length, name).toBeGreaterThan(0);
      expect(s.culture.sharedMeaning(context.update_id), name).toBeUndefined();
    }
  });
});

describe("temporal registration: Culture state is visible downstream only as the committed fact after the Communicative Convention Close (acceptance: source-basis and stage-order enforcement)", () => {
  const register = async (s: CultureSeeded, object: any, tn = 50) =>
    codeOf(s.coordinator.registerObject({ ...temporalPublication(tn), object }));

  it("accepts the two settled read forms of the committed fact: AS-OF-NOW after the close and AS-OF-DECLARED-CLOSE naming it", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    const base = cultureConsumerObjectAt(s, "ok1", context);
    expect(await register(s, base, 50)).toBe("OK");
    // a second consequence at another instant reading the fact by the CLOSE form
    const closeConsumer = cultureConsumerObjectAt(s, "ok2", context, {
      next_boundary: { boundary_id: "b-ok2", at: { unit: "fixture-time-unit", value: 190 } },
      dependencies: [
        {
          ...cultureConsumerDeclaration("ok2", context.update_id),
          reads: [cultureConventionCloseRead(context.update_id)],
        },
      ],
    });
    expect(await register(s, closeConsumer, 51)).toBe("OK");
    expect(cultureSharedMeaningNowRead(context.update_id).mode).toBe("AS-OF-NOW");
  });

  it("refuses a consequence that reads the sealed context, a close naming another basis, an extra invalidator or a Culture-owned object", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    const consumer = (reads: unknown[], id: string) =>
      cultureConsumerObjectAt(s, id, context, {
        dependencies: [
          cultureConventionDeclaration(context)!,
          { ...cultureConsumerDeclaration(id, context.update_id), reads: reads as never },
        ],
      });
    const closeRead = cultureConventionCloseRead(context.update_id) as any;
    const nowRead = cultureSharedMeaningNowRead(context.update_id);
    const bad: Record<string, unknown[]> = {
      "the sealed context NOW": [
        {
          mode: "AS-OF-NOW",
          source: { owner: "culture", fact_key: contextKey(context) },
          invalidators: [],
        },
      ],
      "another close basis": [
        { ...closeRead, close_basis: { ...closeRead.close_basis, name: "social-relation-close" } },
      ],
      "another producer operation": [
        {
          ...closeRead,
          close_basis: {
            ...closeRead.close_basis,
            producer: { owner: "culture", operation: "other" },
          },
        },
      ],
      "an extra invalidator": [{ ...nowRead, invalidators: [{ fact_key: contextKey(context) }] }],
      "a foreign owner for the key": [
        { ...nowRead, source: { owner: "kti", fact_key: meaningKey(context) } },
      ],
      "an unmodelled culture key": [
        {
          mode: "AS-OF-NOW",
          source: { owner: "culture", fact_key: "culture/relation/r1" },
          invalidators: [],
        },
      ],
    };
    let i = 0;
    for (const [name, reads] of Object.entries(bad))
      expect(await register(s, consumer(reads, `bad${i}`), 60 + i++), name).toBe(
        "REFERENCE_INVALID",
      );
    // a Culture-owned object: there is no standalone Culture process, tick or sweep
    expect(
      await register(
        s,
        cultureConsumerObjectAt(s, "owned", context, {
          owning_ref: { owner: "culture", process_id: "culture-process" },
        }),
        80,
      ),
    ).toBe("REFERENCE_INVALID");
  });

  it("a consequence cannot conjure the update it needs: its object is refused without a committed sealed context", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1");
    const unsealed = primaryContext();
    expect(await register(s, cultureConsumerObjectAt(s, "c1", unsealed))).toBe("REFERENCE_INVALID");
    await sealContext(s, 1, unsealed);
    expect(await register(s, cultureConsumerObjectAt(s, "c1", unsealed))).toBe("OK");
  });

  it("a forged stage is refused: another operation, extra or reordered reads, a different close or a different product", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    const real = cultureConventionDeclaration(context)!;
    const forged: Record<string, unknown> = {
      "another operation": {
        ...real,
        stage: { ...real.stage, owner_operation: { owner: "culture", operation: "other-op" } },
      },
      "dropped evidence read": { ...real, reads: real.reads.slice(0, 1) },
      "reordered reads": { ...real, reads: [...real.reads].reverse() },
      "no close": { ...real, declares_close: null },
      "another close": { ...real, declares_close: { name: "social-relation-close" } },
      "another product": { ...real, produces: [...real.produces, "culture/relation/r1"] },
    };
    let i = 0;
    for (const [name, d] of Object.entries(forged))
      expect(
        await register(
          s,
          cultureConsumerObjectAt(s, `f${i}`, context, {
            dependencies: [d as never, cultureConsumerDeclaration(`f${i}`, context.update_id)],
          }),
          90 + i++,
        ),
        name,
      ).toBe("REFERENCE_INVALID");
  });

  it("a stage outside the Culture owner cannot declare that it produces a Culture key", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    const decl = cultureConsumerDeclaration("p1", context.update_id);
    expect(
      await register(
        s,
        cultureConsumerObjectAt(s, "p1", context, {
          dependencies: [{ ...decl, produces: [meaningKey(context)] }],
        }),
      ),
    ).toBe("REFERENCE_INVALID");
  });

  it("two consequences due at the same instant share one close: a second declaration of the stage is refused, a read-only consequence is not", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    await registerCultureConsumer(s, "c1", context, 2);
    expect(await register(s, cultureConsumerObjectAt(s, "c2", context), 3)).toBe(
      "REFERENCE_INVALID",
    );
    const readOnly = cultureConsumerObjectAt(s, "c3", context, {
      dependencies: [cultureConsumerDeclaration("c3", context.update_id)],
    });
    expect(await register(s, readOnly, 4)).toBe("OK");
  });

  it("a consequence that reads the fact without declaring the stage is unresolved — fail closed — and publishes nothing", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    const lone = cultureConsumerObjectAt(s, "lone", context, {
      dependencies: [cultureConsumerDeclaration("lone", context.update_id)],
    });
    expect(await register(s, lone, 5)).toBe("OK");
    const r = await must(
      s.coordinator.advance(requestToBoundary(s, "tx-lone", "culture-consumer-obj-lone")),
    );
    expect(r.transaction.outcome.unresolved_dependents.length).toBeGreaterThan(0);
    expect(s.culture.sharedMeaning(context.update_id)).toBeUndefined();
    expect(s.campaign.store.getFact(cultureConsumerResultKey("lone"))).toBeUndefined();
  });
});

describe("the sealed context is not backfilled by anything that follows it (acceptance: source-basis and stage-order enforcement)", () => {
  it("evidence committed after the seal is not part of it: the close rests on exactly the sealed inputs", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    // a later, even disagreeing, reading changes neither the sealed context nor the fact the close commits
    await commitEvidence(
      s,
      2,
      "late",
      evidenceReading(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_MARKET, MANIFESTATION_B),
    );
    await registerCultureConsumer(s, "c1", context, 2);
    await must(advanceCulture(s, "tx-c1", "c1"));
    const m = s.culture.sharedMeaning(context.update_id)!;
    expect(m.value.manifestation).toBe(MANIFESTATION_A);
    expect(m.value.establishment.evidence.map((e) => e.fact_key)).toEqual([
      socialEvidenceKey("ev1"),
    ]);
    expect(s.culture.updateContext(context.update_id)!.value).toEqual(context);
  });

  it("a downstream consequence's own result is never evidence for the update it consumed: it cannot be sealed as an input", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    await registerCultureConsumer(s, "c1", context, 2);
    await must(advanceCulture(s, "tx-c1", "c1"));
    const downstream = s.campaign.store.getFact(cultureConsumerResultKey("c1"))!;
    expect(downstream.owner).toBe(SYNTH_CULTURE_CONSUMER_OWNER);
    const next = primaryContext(
      [
        evidenceInput("ev1", {
          owner: downstream.owner,
          fact_key: downstream.key,
          version: downstream.version,
        }),
      ],
      {
        contextName: CULTURE_CONTEXT_OTHER,
        context: CULTURE_CONTEXT_OTHER,
        update_id: cultureUpdateId(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_OTHER),
      },
    );
    expect(await sealCode(s, 9, next)).toBe("REFERENCE_INVALID");
    // nor the Culture fact it read, nor a Culture fact of any kind
    for (const key of [meaningKey(context), contextKey(context)])
      expect(
        await sealCode(s, 10, {
          ...next,
          inputs: [evidenceInput("ev1", { owner: "culture", fact_key: key })],
        }),
        key,
      ).toBe("REFERENCE_INVALID");
    expect(
      cultureFacts(s)
        .map((f) => f.key)
        .sort(),
    ).toEqual([contextKey(context), meaningKey(context)].sort());
  });

  it("a referent may be its own scope (the meaning of a place within that place): the shared pin is de-duplicated and the fact is established as usual", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitEvidence(s, 1, "ev1", evidenceReading(REFERENT_KEY, REFERENT_KEY));
    const context = cultureContext(REFERENT_KEY, REFERENT_KEY, [evidenceInput("ev1")]);
    await sealContext(s, 1, context);
    expect(s.campaign.store.committedGroup("culture-intent-1")!.reads.map((r) => r.key)).toEqual([
      REFERENT_KEY,
      socialEvidenceKey("ev1"),
    ]);
    await registerCultureConsumer(s, "c1", context, 2);
    await must(advanceCulture(s, "tx-c1", "c1"));
    expect(s.culture.sharedMeaning(context.update_id)!.value.scope.fact_key).toBe(REFERENT_KEY);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("no hidden state, no global scan and no cross-owner effect (acceptance: hidden-state and global-scan guards)", () => {
  it("the close reads only the engaged context and its pinned inputs by identity: no list, no unrelated update, no unrelated evidence", async () => {
    const s = await seededCultureCampaign(tempDir());
    // an unrelated update, evidence and consumer that must stay untouched and unread
    await commitEvidence(
      s,
      1,
      "ev-other",
      evidenceReading(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_OTHER, MANIFESTATION_B),
    );
    await sealContext(
      s,
      1,
      primaryContext([evidenceInput("ev-other")], {
        context: CULTURE_CONTEXT_OTHER,
        update_id: cultureUpdateId(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_OTHER),
      }),
    );
    await commitEvidence(s, 2, "ev1");
    const context = await sealContext(s, 2);
    await registerCultureConsumer(s, "c1", context, 2);
    const unrelated = s.campaign.store
      .listFacts()
      .filter(
        (f) =>
          f.key.includes("ev-other") ||
          f.key.includes(cultureUpdateId(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_OTHER)),
      );
    expect(unrelated.length).toBeGreaterThan(0);
    const spy = spyStore(s.campaign.store);
    await must(
      new TemporalCoordinator(spy.store, cultureProviders()).advance(
        requestToBoundary(s, "tx-c1", "culture-consumer-obj-c1"),
      ),
    );
    expect(spy.listCalls()).toBe(0);
    const read = new Set(spy.getFacts);
    for (const f of unrelated) {
      expect(read.has(f.key), f.key).toBe(false);
      expect(s.campaign.store.getFact(f.key)).toEqual(f);
    }
    for (const g of spy.commits)
      for (const w of g.writes) expect(unrelated.some((f) => f.key === w.key)).toBe(false);
    expect(read.has(contextKey(context))).toBe(true);
    expect(read.has(socialEvidenceKey("ev1"))).toBe(true);
  });

  it("establishing a shared meaning writes only Culture's own key: no Population, Cohort, GIP, Economy, KTI, Epistemic, Actor, World or evidence fact, and no belief, motive, count or response", async () => {
    const s = await seededCultureCampaign(tempDir());
    await commitInstitution(s, 1);
    const context = await preparedCulture(s);
    await registerCultureConsumer(s, "c1", context, 2);
    const before = cultureSummary(s.campaign, s.coordinator);
    await must(advanceCulture(s, "tx-c1", "c1"));
    const after = cultureSummary(s.campaign, s.coordinator);
    for (const k of ["evidence", "world", "gip", "population"] as const)
      expect(after[k], k).toEqual(before[k]);
    expect(after.culture.map((f) => f.key).sort()).toEqual(
      [contextKey(context), meaningKey(context)].sort(),
    );
    const keys = s.campaign.store.listFacts().map((f) => f.key);
    expect(
      keys.filter((k) => /^(access|kti|actor|economy|production|logistics)\//.test(k)),
    ).toEqual([]);
    const m = JSON.stringify(s.culture.sharedMeaning(context.update_id)!.value);
    expect(m).not.toMatch(
      /prevalence|percent|count|score|strength|belief|motive|loyalty|compel|cohort|adopt/i,
    );
  });
});

describe("load-time verification fails closed on Culture drift", () => {
  it("healthy campaigns verify before the close and after it", async () => {
    const s = await seededCultureCampaign(tempDir());
    expect(s.campaign.verify()).toEqual([]);
    const context = await preparedCulture(s);
    expect(s.campaign.verify()).toEqual([]);
    await registerCultureConsumer(s, "c1", context, 2);
    expect(s.campaign.verify()).toEqual([]);
    await must(advanceCulture(s, "tx-c1", "c1"));
    expect(s.campaign.verify()).toEqual([]);
    expect(verifyCultureIntegrity(s.campaign.store)).toEqual([]);
  });

  it("detects a meaning that is not what its context and evidence determine, and one carrying the wrong access class", async () => {
    const s = await seededCultureCampaign(tempDir());
    const context = await preparedCulture(s);
    await registerCultureConsumer(s, "c1", context, 2);
    await must(advanceCulture(s, "tx-c1", "c1"));
    const fact = s.campaign.store.getFact(meaningKey(context))!;
    const view = (edit: (f: any) => void): CampaignStore => {
      const copy = structuredClone(s.campaign.store.listFacts()) as any[];
      edit(copy.find((f) => f.key === fact.key));
      const inner = s.campaign.store;
      return {
        descriptor: inner.descriptor,
        head: () => inner.head(),
        getFact: (k) => inner.getFact(k),
        listFacts: () => copy,
        lookupReceipt: (i) => inner.lookupReceipt(i),
        committedGroup: (i) => inner.committedGroup(i),
        close: () => inner.close(),
        commit: (g) => inner.commit(g),
      } as CampaignStore;
    };
    expect(
      verifyCultureIntegrity(view((f) => (f.value.manifestation = MANIFESTATION_B))).map(
        (v) => v.code,
      ),
    ).toContain("CULTURE_STATE");
    expect(
      verifyCultureIntegrity(view((f) => (f.secrecy = "epistemic.actor-accessible"))).map(
        (v) => v.code,
      ),
    ).toContain("CULTURE_STATE");
    expect(
      verifyCultureIntegrity(view((f) => (f.value.close.stage.causal_process_id = "x"))).length,
    ).toBeGreaterThan(0);
  });
});
