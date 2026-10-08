/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and meaning values */
// Culture & Society — save → close → load → continue across every meaningful durable cut of the update lifecycle, a failure at
// every durable step of the multi-step boundaries this slice introduces (the evidence-pinning context seal, then the
// Communicative Convention Close transaction: authority, Culture stage, consuming stage, kernel group), and load-time failure
// on a corrupted or inconsistent save. The Culture path reuses the existing persistence, receipts, journal and stage-identity
// machinery: after any crash, retry, replay or reload the context and the meaning each exist exactly once, keep their
// identity, their pinned evidence and their close evidence, and are never re-published, improved or re-rolled (no randomness
// exists).
// Register lineage: IA-06, IA-16 (partial), IA-22 (partial), IA-30 (partial); RC-04, RC-05, RC-11, RC-16; IM-02, IM-03, IM-09,
// IM-12, IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMMUNICATIVE_CONVENTION_CLOSE,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CULTURE_RULE,
  CanonicalCampaign,
  CultureAdapter,
  createFileCampaign,
  stageGroupId,
  stageIntentId,
  type CampaignStore,
} from "@immortalis/engine";
import {
  CULTURE_FIXTURE_EXTENSION,
  FIXTURE_CAMPAIGN,
  at,
  cultureConsumerResultKey,
  culturePublication,
  evidenceInput,
  group,
  socialEvidenceKey,
  write,
} from "@immortalis/testkit";
import {
  REFERENT_KEY,
  SCOPE_KEY,
  commitEvidence,
  cultureCoordinator,
  cultureSummary,
  primaryContext,
  registerCultureConsumer,
  reopenCulture,
  requestTo,
  sealContext,
  seededCultureCampaign,
  type CultureSeeded,
} from "../support/culture.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const context = primaryContext();
const ctxKey = cultureUpdateContextKey(context.update_id);
const meaningKey = cultureSharedMeaningKey(context.update_id);
const evKey = socialEvidenceKey("ev1");
const stage = cultureConventionStage(context.update_id);
// the consumer's one earned boundary: the seeded canonical time is 100, so the consequence is due at 110 (deterministic)
const request = () => requestTo("tx-1", at(110));
const advance = (s: Pick<CultureSeeded, "coordinator">) => s.coordinator.advance(request());

/** A store that "crashes" (nothing committed, unknown outcome) before the first group the predicate names. */
function crashBefore(inner: CampaignStore, block: (g: any) => boolean): CampaignStore {
  return {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async (g: any) =>
      block(g)
        ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } } as never)
        : inner.commit(g),
  };
}
/** A store that COMMITS the group the predicate names and then loses the reply (unknown outcome). */
function lostReply(inner: CampaignStore, block: (g: any) => boolean): CampaignStore {
  return {
    ...crashBefore(inner, () => false),
    commit: async (g: any) => {
      const r = await inner.commit(g);
      return block(g)
        ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
        : r;
    },
  };
}
const isStageGroup = (g: any) => g.writes.some((w: any) => w.key === meaningKey);
const isConsumerGroup = (g: any) =>
  g.writes.some((w: any) => w.key === cultureConsumerResultKey("c1"));
const isKernelGroup = (g: any) => g.group_id.startsWith("transaction-group:");
const isAuthorityGroup = (g: any) => g.group_id.startsWith("transaction-authority-group:");
const isContextGroup = (g: any) => g.writes.some((w: any) => w.key === ctxKey);

/** The lifecycle as ordered steps, each idempotent in intent: the evidence is committed first, Culture state follows it. */
const steps = {
  evidence: (s: CultureSeeded) => commitEvidence(s, 1, "ev1"),
  context: (s: CultureSeeded) => sealContext(s, 1, context).then(() => undefined),
  register: (s: CultureSeeded) => registerCultureConsumer(s, "c1", context, 2),
  advance: (s: CultureSeeded) => must(advance(s)).then(() => undefined),
};
const prepare = async (s: CultureSeeded) => {
  await steps.evidence(s);
  await steps.context(s);
  await steps.register(s);
};

/** The deterministic reference: the whole lifecycle, uninterrupted. */
async function referenceRun() {
  const s = await seededCultureCampaign(tempDir());
  await prepare(s);
  await must(advance(s));
  const head = s.campaign.store.head();
  const summary = cultureSummary(s.campaign, s.coordinator);
  await s.campaign.close();
  return { head, summary };
}
const same = (head: ReturnType<CampaignStore["head"]>, ref: ReturnType<CampaignStore["head"]>) => {
  expect(head.state_sha256).toBe(ref.state_sha256);
  expect(head.journal_entries).toBe(ref.journal_entries);
  expect(head.journal_head_sha256).toBe(ref.journal_head_sha256);
};
const versions = (s: CultureSeeded) => {
  const f = (k: string) => s.campaign.store.getFact(k)?.version ?? 0;
  return {
    evidence: f(evKey),
    context: f(ctxKey),
    meaning: f(meaningKey),
    consumer: f(cultureConsumerResultKey("c1")),
  };
};

type Cut = {
  name: string;
  build: (s: CultureSeeded) => Promise<void>;
  /** the remaining lifecycle steps that finish it */
  rest: (keyof typeof steps)[];
  versions: ReturnType<typeof versions>;
};
const cuts: Cut[] = [
  {
    name: "canonical world and temporal basis committed, no evidence yet",
    build: async () => {},
    rest: ["evidence", "context", "register", "advance"],
    versions: { evidence: 0, context: 0, meaning: 0, consumer: 0 },
  },
  {
    name: "evidence committed, no sealed context yet",
    build: steps.evidence,
    rest: ["context", "register", "advance"],
    versions: { evidence: 1, context: 0, meaning: 0, consumer: 0 },
  },
  {
    name: "context sealed, its consequence not yet registered",
    build: async (s) => {
      await steps.evidence(s);
      await steps.context(s);
    },
    rest: ["register", "advance"],
    versions: { evidence: 1, context: 1, meaning: 0, consumer: 0 },
  },
  {
    name: "consequence registered, boundary not yet resolved",
    build: prepare,
    rest: ["advance"],
    versions: { evidence: 1, context: 1, meaning: 0, consumer: 0 },
  },
  {
    name: "Communicative Convention Close committed, consuming stage not",
    build: async (s) => {
      await prepare(s);
      const r = await cultureCoordinator(crashBefore(s.campaign.store, isConsumerGroup)).advance(
        request(),
      );
      expect(r.ok).toBe(false);
    },
    rest: ["advance"],
    versions: { evidence: 1, context: 1, meaning: 1, consumer: 0 },
  },
  {
    name: "all stages committed, the kernel transaction not",
    build: async (s) => {
      await prepare(s);
      await cultureCoordinator(crashBefore(s.campaign.store, isKernelGroup)).advance(request());
    },
    rest: ["advance"],
    versions: { evidence: 1, context: 1, meaning: 1, consumer: 1 },
  },
  {
    name: "completed and sealed by its transaction",
    build: async (s) => {
      await prepare(s);
      await steps.advance(s);
    },
    rest: [],
    versions: { evidence: 1, context: 1, meaning: 1, consumer: 1 },
  },
];

describe("save → close → load → continue at every durable cut of the update lifecycle (acceptance: durability across reload)", () => {
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, verifies, and the continuation converges on the uninterrupted result`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededCultureCampaign(dir);
      await cut.build(s);
      expect(versions(s)).toEqual(cut.versions);
      const before = cultureSummary(s.campaign, s.coordinator);
      expect(s.campaign.verify()).toEqual([]);
      await s.campaign.close();
      const r = await reopenCulture(dir);
      expect(r.campaign.verify()).toEqual([]);
      expect(cultureSummary(r.campaign, r.coordinator)).toEqual(before);
      expect(versions(r)).toEqual(cut.versions);
      // continue: whatever the cut, finishing the lifecycle reaches the reference result
      for (const step of cut.rest) await steps[step](r);
      if (cut.rest.length === 0) expect((await must(advance(r))).replayed).toBe(true);
      same(r.campaign.store.head(), ref.head);
      expect(cultureSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the established fact is addressably readable after a reload and continues: identity, pinned evidence and close evidence are preserved; nothing is re-published", async () => {
    const dir = tempDir();
    const s = await seededCultureCampaign(dir);
    await prepare(s);
    await must(advance(s));
    const meaning = structuredClone(s.campaign.store.getFact(meaningKey)!);
    const ctx = structuredClone(s.campaign.store.getFact(ctxKey)!);
    const evidence = structuredClone(s.campaign.store.getFact(evKey)!);
    const receipt = s.campaign.store.lookupReceipt(stageIntentId(stage))!;
    await s.campaign.close();
    const r = await reopenCulture(dir);
    expect(r.campaign.store.getFact(meaningKey)).toEqual(meaning);
    expect(r.campaign.store.getFact(ctxKey)).toEqual(ctx);
    expect(r.campaign.store.getFact(evKey)).toEqual(evidence);
    expect(r.campaign.store.lookupReceipt(stageIntentId(stage))).toEqual(receipt);
    const m = r.culture.sharedMeaning(context.update_id)!;
    expect(m.close_group).toBe(stageGroupId(stage));
    expect(m.value.close).toEqual({ name: COMMUNICATIVE_CONVENTION_CLOSE, stage });
    expect(m.value.establishment.update).toEqual({ fact_key: ctxKey, version: 1 });
    expect(m.value.establishment.evidence).toEqual(context.inputs);
    expect(m.value.referent).toEqual({ fact_key: REFERENT_KEY, version: 1 });
    expect(m.value.scope).toEqual({ fact_key: SCOPE_KEY, version: 1 });
    // the saved Culture state is engine-sealed and holds no evidence content
    expect(m.fact.secrecy).toBe("culture.engine-sealed");
    expect(JSON.stringify(m.value)).not.toContain("CONTINUING_SHARED_RECOGNITION");
    // idempotent recovery: continuing replays; no group is committed again, and the slot stays occupied
    const again = await must(advance(r));
    expect(again.replayed).toBe(true);
    expect(r.campaign.store.getFact(meaningKey)).toEqual(meaning);
    const dup = await r.culture.sealUpdateContext({ ...culturePublication(77), context });
    expect(dup.ok).toBe(false);
    // a later change is a new cause, never a silent overwrite of the same result identity
    expect(r.campaign.store.getFact(meaningKey)!.version).toBe(1);
    await r.campaign.close();
  });
});

describe("a failure at EVERY durable step converges by identity (acceptance: idempotence / recovery / no duplicate effect)", () => {
  const converge = async (
    build: (s: CultureSeeded) => Promise<void>,
    finish: (s: CultureSeeded) => Promise<void>,
  ) => {
    const ref = await referenceRun();
    const dir = tempDir();
    const s = await seededCultureCampaign(dir);
    await build(s);
    await s.campaign.close();
    const r = await reopenCulture(dir);
    await finish(r);
    same(r.campaign.store.head(), ref.head);
    expect(cultureSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  };

  it("the CONTEXT seal: a crash before it, and a lost reply after it, converge on one sealed context", async () => {
    // crash before the group takes effect
    {
      const s = await seededCultureCampaign(tempDir());
      await steps.evidence(s);
      const adapter = new CultureAdapter(crashBefore(s.campaign.store, isContextGroup));
      const r = await adapter.sealUpdateContext({ ...culturePublication(1), context });
      expect(!r.ok && r.error.code).toBe("UNKNOWN_OUTCOME");
      expect(s.campaign.store.getFact(ctxKey)).toBeUndefined();
      await steps.context(s);
      expect(s.campaign.store.getFact(ctxKey)!.version).toBe(1);
      await s.campaign.close();
    }
    // lost reply AFTER it took effect: re-presenting converges on the existing result
    {
      const s = await seededCultureCampaign(tempDir());
      await steps.evidence(s);
      const adapter = new CultureAdapter(lostReply(s.campaign.store, isContextGroup));
      const lost = await adapter.sealUpdateContext({ ...culturePublication(1), context });
      expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");
      const committed = structuredClone(s.campaign.store.getFact(ctxKey)!);
      expect(committed.version).toBe(1);
      const head = s.campaign.store.head();
      const replay = await must(
        new CultureAdapter(s.campaign.store).sealUpdateContext({
          ...culturePublication(1),
          context,
        }),
      );
      expect(replay.replayed).toBe(true);
      expect(s.campaign.store.head()).toEqual(head);
      expect(s.campaign.store.getFact(ctxKey)).toEqual(committed);
      // a CHANGED intent under the same identity is a conflict, never a silent reuse of the old receipt
      const changed = await s.culture.sealUpdateContext({
        ...culturePublication(1),
        context: primaryContext([evidenceInput("ev1")], { contextName: "another-context" }),
      });
      expect(changed.ok).toBe(false);
      expect(s.culture.updateContext(context.update_id)!.value).toEqual(context);
      await s.campaign.close();
    }
  });

  it("the CLOSE TRANSACTION: a crash before each durable step (authority, Culture stage, consuming stage, kernel group) converges on the identical campaign", async () => {
    for (const [name, block] of [
      ["authority", isAuthorityGroup],
      ["Culture stage", isStageGroup],
      ["consuming stage", isConsumerGroup],
      ["kernel group", isKernelGroup],
    ] as const) {
      await converge(
        async (s) => {
          await prepare(s);
          const r = await cultureCoordinator(crashBefore(s.campaign.store, block)).advance(
            request(),
          );
          expect(r.ok, name).toBe(false);
        },
        async (s) => void (await must(advance(s))),
      );
    }
  });

  it("the CLOSE TRANSACTION: a lost reply after each durable step converges, and a committed result is adopted, never recomputed or re-published", async () => {
    for (const [name, block] of [
      ["Culture stage", isStageGroup],
      ["consuming stage", isConsumerGroup],
      ["kernel group", isKernelGroup],
    ] as const) {
      await converge(
        async (s) => {
          await prepare(s);
          const r = await cultureCoordinator(lostReply(s.campaign.store, block)).advance(request());
          expect(r.ok, name).toBe(false);
          if (name === "Culture stage") expect(s.campaign.store.getFact(meaningKey)).toBeDefined();
        },
        async (s) => {
          const r = await must(advance(s));
          if (name !== "kernel group") expect(r.adopted.length).toBeGreaterThan(0);
          if (name === "Culture stage") expect(r.adopted).toContainEqual(stage);
        },
      );
    }
  });

  it("an UNKNOWN outcome is reconciled by identity before any retry can create another result: no sibling meaning, no second close, no improved fact", async () => {
    const s = await seededCultureCampaign(tempDir());
    await prepare(s);
    await cultureCoordinator(lostReply(s.campaign.store, isStageGroup)).advance(request());
    const receipt = s.campaign.store.lookupReceipt(stageIntentId(stage))!;
    const meaning = structuredClone(s.campaign.store.getFact(meaningKey)!);
    for (let i = 0; i < 3; i++) await must(advance(s));
    expect(s.campaign.store.lookupReceipt(stageIntentId(stage))).toEqual(receipt);
    expect(s.campaign.store.getFact(meaningKey)).toEqual(meaning);
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("culture/meaning/")),
    ).toHaveLength(1);
    expect(s.campaign.store.getFact(meaningKey)!.version).toBe(1);
    expect(s.campaign.store.getFact(meaningKey)!.provenance.group_id).toBe(stageGroupId(stage));
    await s.campaign.close();
  });
});

describe("load fails closed on a corrupted or inconsistent save (acceptance: durability across reload)", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededCultureCampaign(dir);
    await prepare(s);
    await must(advance(s));
    await s.campaign.close();
    return dir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { extension: CULTURE_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  const savedEdits: Record<string, [string, (fact: any) => void]> = {
    "meaning status retired": [meaningKey, (f) => (f.value.status = "RETIRED")],
    "meaning manifestation changed": [
      meaningKey,
      (f) => (f.value.manifestation = "manifestation-b"),
    ],
    "meaning referent swapped": [meaningKey, (f) => (f.value.referent.fact_key = SCOPE_KEY)],
    "meaning evidence re-pinned": [
      meaningKey,
      (f) => (f.value.establishment.evidence[0].version = 9),
    ],
    "meaning close renamed": [meaningKey, (f) => (f.value.close.name = "social-relation-close")],
    "meaning identity forged": [meaningKey, (f) => (f.value.update_id = "culture-update-forged")],
    "prevalence added to the meaning": [meaningKey, (f) => (f.value.prevalence = 0.7)],
    "cohort added to the meaning": [
      meaningKey,
      (f) => (f.value.cohort = "population/l1/cohort/c1"),
    ],
    "meaning class opened": [meaningKey, (f) => (f.secrecy = "epistemic.actor-accessible")],
    "meaning owner changed": [meaningKey, (f) => (f.owner = "world_state")],
    "meaning facet changed": [meaningKey, (f) => (f.facet = "meaning")],
    "meaning version changed": [meaningKey, (f) => (f.version = 2)],
    "meaning provenance group altered": [meaningKey, (f) => (f.provenance.group_id = "raw-group")],
    "context scope swapped": [ctxKey, (f) => (f.value.scope.fact_key = REFERENT_KEY)],
    "context input dropped": [ctxKey, (f) => (f.value.inputs = [])],
    "context input basis changed": [
      ctxKey,
      (f) =>
        (f.value.inputs[0].read = {
          basis: "AS-OF-DECLARED-CLOSE",
          close_basis: { name: "c", producer: { owner: "o", operation: "p" } },
        }),
    ],
    "context manifestation asserted": [ctxKey, (f) => (f.value.manifestation = "manifestation-a")],
    "context admission toggled": [
      ctxKey,
      (f) => (f.value.admission.may_alter_later_answer = false),
    ],
    "context identity forged": [ctxKey, (f) => (f.value.update_id = "culture-update-forged")],
    "context class opened": [ctxKey, (f) => (f.secrecy = "epistemic.actor-accessible")],
  };

  it("an edit of the saved meaning or context — owner, facet, schema, class, status, references, identity or provenance — is not silently normalized", async () => {
    for (const [name, [key, edit]] of Object.entries(savedEdits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === key));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 60_000);

  it("an edit of the saved evidence underneath the Culture state is not silently normalized either", async () => {
    const edits: Record<string, (fact: any) => void> = {
      "evidence manifestation changed": (f) => (f.value.manifestation = "manifestation-b"),
      "evidence no longer continuing": (f) => (f.value.recognition = "ONCE"),
      "evidence referent changed": (f) => (f.value.referent = SCOPE_KEY),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === evKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("a journal edit of the context's or evidence's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("CONTINUING_SHARED_RECOGNITION");
    writeFileSync(
      journal,
      text.replace("CONTINUING_SHARED_RECOGNITION", "CONTINUING_SHARED_RECOGNITION "),
    );
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  it("a build that does not register the Culture owner cannot open the campaign", async () => {
    const dir = await saved();
    const r = await CanonicalCampaign.open(dir);
    expect(r.ok).toBe(false);
  });

  /** A history built by a store with NO admission: consistent and replayable, but not canonical. */
  async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, {
        campaignId: FIXTURE_CAMPAIGN,
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...CULTURE_FIXTURE_EXTENSION.owners]),
      }),
    );
    await build(s);
    await s.close();
    return dir;
  }
  const put = (n: number, key: string, value: unknown, over: any = {}, groupOver: any = {}) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(key, value as never, {
          owner: "culture",
          facet: "culture_social",
          secrecy: "culture.engine-sealed",
          ...over,
        }),
      ],
      { owner: "culture", facet: "culture_social", rule: CULTURE_RULE, ...groupOver },
    );

  it("a context with no committed referent, scope or evidence, and a meaning with no context, are CULTURE_STATE", async () => {
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(put(1, ctxKey, context)));
        }),
      ),
    ).toMatch(/CULTURE_STATE/);
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(
            s.commit(
              put(1, meaningKey, {
                update_id: context.update_id,
                status: "ESTABLISHED",
                referent: context.referent,
                scope: context.scope,
                context: context.context,
                manifestation: "manifestation-a",
                establishment: {
                  update: { fact_key: ctxKey, version: 1 },
                  evidence: context.inputs,
                },
                close: { name: COMMUNICATIVE_CONVENTION_CLOSE, stage },
              }),
            ),
          );
        }),
      ),
    ).toMatch(/CULTURE_STATE/);
  });

  it("owner drift, rule drift, an unregistered Culture key, an overwritten seal and a malformed value are each detected on load", async () => {
    expect(
      await openOutcome(
        await rogue(
          async (s) =>
            void (await must(s.commit(put(1, "culture/relation/r1", { prevalence: 0.5 })))),
        ),
      ),
    ).toBe("UNREGISTERED_KEY");
    expect(
      await openOutcome(
        await rogue(
          async (s) =>
            void (await must(
              s.commit(
                put(
                  1,
                  ctxKey,
                  context,
                  { owner: "world_state", facet: "world_profile" },
                  { owner: "world_state", facet: "world_profile" },
                ),
              ),
            )),
        ),
      ),
    ).toMatch(/WRONG_OWNER_FACET/);
    expect(
      await openOutcome(
        await rogue(
          async (s) =>
            void (await must(
              s.commit(
                put(1, ctxKey, context, {}, { rule: { ...CULTURE_RULE, clause: "drifted" } }),
              ),
            )),
        ),
      ),
    ).toMatch(/RULE_DRIFT/);
    for (const bad of [
      { ...context, prevalence: 0.5 },
      { ...context, inputs: [] },
      { ...context, update_id: "" },
    ])
      expect(
        await openOutcome(
          await rogue(async (s) => void (await must(s.commit(put(1, ctxKey, bad))))),
        ),
        JSON.stringify(bad).slice(0, 60),
      ).toMatch(/VALUE_INVALID/);
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(put(1, ctxKey, context)));
          await must(s.commit(put(2, ctxKey, context, { expected_version: 1 })));
        }),
      ),
    ).toMatch(/UNSUPPORTED_AMENDMENT/);
  });
});
