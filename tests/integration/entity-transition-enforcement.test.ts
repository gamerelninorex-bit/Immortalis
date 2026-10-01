/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// World-State Entity Continuity / Transition Close — enforcement that does not depend on the coordinator or on the
// custodian's operation behaving. IM-11 admission holds for a raw `store.commit` and for a TAMPERED group; owner
// exclusivity holds for everyone (the cause owner, a consumer, Production, Economy, Population, the kernel, the
// PC/role owners, World-State's other facets); load-time verification fails closed on drift; a failure at every
// durable step of the transition transaction converges by identity with no duplicate or sibling transition.
// Register lineage: IA-02, IA-03, IA-06, IA-30 (partial); RC-02, RC-04, RC-10, RC-16; IM-02, IM-03, IM-11, IM-12,
// IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  EntityTransitionCauseSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  OWNER_WORLD_STATE,
  entityTransitionStage,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  TemporalCoordinator,
  WORLD_ENTITY_TRANSITION_RULE,
  deriveEntityTransition,
  entityTransitionTemporalObject,
  nodeFs,
  stageGroupId,
  stageIntentId,
  verifyEntityTransitionIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  CAUSE_1,
  CAUSE_2,
  DEST_LOCUS_ID,
  ENT_T_EFFECT,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  OTHER_LOCUS_ID,
  PROD_T1,
  REQ_1,
  REQ_2,
  RESERVE_OTHER,
  SYNTH_ENTITY_CAUSE_OWNER,
  SYNTH_ENTITY_CONSUMER_OWNER,
  acceptedEntityId,
  acceptedEntityKey,
  at,
  causeGroup,
  causeKey,
  entityConsumerResultKey,
  entityProviders,
  fixtureLocus,
  fixtureWorld,
  instrumentFs,
  locusRef,
  prodAdvanceRequest,
  publication,
  temporalPublication,
  transitionCause,
  transitionKeyOf,
} from "@immortalis/testkit";
import {
  acceptCauseRegister,
  acceptEntity,
  commitCause,
  currentLocusOfRequest,
  entCoordinator,
  entSummary,
  registerConsumer,
  registerTransition,
  reopenEntity,
  seededEntityCampaign,
  type EntSeeded,
} from "../support/entity.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const entityKey = acceptedEntityKey(REQ_1);
const transitionKey = transitionKeyOf(REQ_1);
const ck = causeKey(CAUSE_1);
const stage = entityTransitionStage(CAUSE_1);
const destLocusKey = worldLocusKey(FIXTURE_WORLD_ID, DEST_LOCUS_ID);
const worldKey = worldProfileKey(FIXTURE_WORLD_ID);
const otherLocusKey = worldLocusKey(FIXTURE_WORLD_ID, OTHER_LOCUS_ID);

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

/** Applies an in-place edit to one write's value (the edit's own result is ignored). */
const withWrite = (g: CommitGroup, key: string, edit: (v: any) => unknown): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) => {
    if (w.key !== key) return w;
    const value = structuredClone(w.value) as any;
    edit(value);
    return { ...w, value: value as never };
  }),
});

const rawGroup = (
  n: number,
  owner: string,
  facet: string,
  writes: { key: string; value: unknown; expected_version: number }[],
  over: Partial<CommitGroup> = {},
): CommitGroup => ({
  campaign_id: FIXTURE_CAMPAIGN,
  group_id: `raw-group-${n}`,
  intent_id: `raw-intent-${n}`,
  owner,
  facet,
  cause: `raw-cause-${n}`,
  rule: WORLD_ENTITY_TRANSITION_RULE,
  authority: { ...CANON_WRITE_AUTHORITY },
  reads: [],
  depends_on: [],
  writes: writes.map((w) => ({
    ...w,
    owner,
    facet,
    value: w.value as never,
    unit: null,
    basis: "raw-basis",
    secrecy: "raw-secrecy",
  })),
  ...over,
});

const pins = (store: CampaignStore, keys: string[]) => ({
  reads: keys.map((k) => ({ key: k, version: store.getFact(k)?.version ?? 0 })),
  depends_on: [...new Set(keys.flatMap((k) => store.getFact(k)?.provenance.group_id ?? []))],
});

/** The exact value the cause determines, derived the way the owner operation and admission derive it. */
function derivedValue(s: EntSeeded, causeId = CAUSE_1, requestId = REQ_1) {
  const store = s.campaign.store;
  const cf = store.getFact(causeKey(causeId))!;
  const ef = store.getFact(acceptedEntityKey(requestId))!;
  const d = deriveEntityTransition({
    cause: {
      key: cf.key,
      owner: cf.owner,
      version: cf.version,
      value: EntityTransitionCauseSchema.parse(cf.value),
    },
    entity: { key: ef.key, version: ef.version, value: ef.value as never },
    at: ENT_T_EFFECT,
  });
  if (!d.ok) throw new Error(d.error.message);
  return d.value;
}

/** The raw transition group of the EXACT derived value, under whatever identity the caller chooses. */
function rawTransition(s: EntSeeded, n: number, over: Partial<CommitGroup> = {}) {
  const value = derivedValue(s);
  return rawGroup(
    n,
    OWNER_WORLD_STATE,
    FACET_WORLD_FALLBACK_ENTITY,
    [{ key: transitionKey, value, expected_version: 0 }],
    { ...pins(s.campaign.store, [ck, entityKey, worldKey, destLocusKey]), ...over },
  );
}

const advanceAll = (s: EntSeeded | { coordinator: TemporalCoordinator }, id = "tx-1") =>
  s.coordinator.advance(prodAdvanceRequest(id, PROD_T1));

/** One accepted entity, its cause committed and its transition object registered: nothing resolved yet. */
async function registered(): Promise<EntSeeded> {
  const s = await seededEntityCampaign(tempDir());
  await acceptCauseRegister(s);
  return s;
}

describe("only World-State can write the entity's transition or location (IA-03; F-016 v0.4 §2)", () => {
  it("no other owner or facet — the cause owner, a consumer, Production, Economy, Population, the kernel, the PC and role owners, even World-State's other facets — can write the transition key space", async () => {
    const s = await registered();
    const value = derivedValue(s);
    const owners: [string, string][] = [
      [SYNTH_ENTITY_CAUSE_OWNER, "synthetic-entity-cause"],
      [SYNTH_ENTITY_CONSUMER_OWNER, "synthetic-entity-consumer"],
      ["production", "production_state"],
      ["economy", "economy_state"],
      ["population", "population_state"],
      ["temporal_kernel", "temporal_coordination"],
      ["pc_existence", "existence_contract"],
      ["role_registry", "player_character_binding"],
      [OWNER_WORLD_STATE, "world_profile"],
      [OWNER_WORLD_STATE, "world_locus"],
    ];
    let n = 0;
    for (const [owner, facet] of owners) {
      for (const key of [transitionKey, entityKey]) {
        const r = await s.campaign.store.commit(
          rawGroup(300 + n++, owner, facet, [{ key, value, expected_version: 0 }], {
            ...pins(s.campaign.store, [ck, entityKey, worldKey, destLocusKey]),
          }),
        );
        expect(r.ok, `${owner}/${facet} → ${key}`).toBe(false);
        expect(!r.ok && r.error.code, `${owner}/${facet} → ${key}`).toMatch(
          /KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT|OWNER_NOT_REGISTERED|WRITE_OWNER_MISMATCH/,
        );
      }
    }
    expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("World-State cannot write the cause owner's key space, and the cause owner cannot write World-State's", async () => {
    const s = await registered();
    const cause = s.campaign.store.getFact(ck)!;
    const asWorld = await s.campaign.store.commit(
      rawGroup(
        310,
        OWNER_WORLD_STATE,
        FACET_WORLD_FALLBACK_ENTITY,
        [{ key: ck, value: cause.value, expected_version: cause.version }],
        pins(s.campaign.store, [ck]),
      ),
    );
    expect(!asWorld.ok && asWorld.error.code).toMatch(/KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT/);
    const asCause = await s.campaign.store.commit(
      causeGroup(FIXTURE_CAMPAIGN, 311, CAUSE_1, cause.value, 1),
    );
    expect(asCause.ok).toBe(true); // its own key space, its own lifecycle: nothing here can reach the entity
    expect(
      await codeOf(
        s.campaign.store.commit({
          ...causeGroup(FIXTURE_CAMPAIGN, 312, CAUSE_1, cause.value, 0),
          writes: [
            {
              ...causeGroup(FIXTURE_CAMPAIGN, 312, CAUSE_1, cause.value, 0).writes[0]!,
              key: transitionKey,
            },
          ],
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
  });

  it("the sealed entity can never be amended — the origin cannot be rewritten by anyone, World-State included", async () => {
    const s = await registered();
    const entity = s.campaign.store.getFact(entityKey)!;
    const amended = await s.campaign.store.commit(
      rawGroup(
        320,
        OWNER_WORLD_STATE,
        FACET_WORLD_FALLBACK_ENTITY,
        [
          {
            key: entityKey,
            value: {
              ...(entity.value as any),
              locality: { ...(entity.value as any).locality, locus: locusRef(DEST_LOCUS_ID).locus },
            },
            expected_version: entity.version,
          },
        ],
        pins(s.campaign.store, [entityKey]),
      ),
    );
    expect(!amended.ok && amended.error.code).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(s.campaign.store.getFact(entityKey)).toEqual(entity);
  });
});

describe("IM-11 refuses an unlawful transition — raw or tampered (F-016 v0.4 §2 R-1; CG-2)", () => {
  it("a raw publication of the EXACT derived value under any identity but its IM-02 stage is refused; the lawful result is the stage", async () => {
    const s = await registered();
    const raw = await s.campaign.store.commit(rawTransition(s, 100));
    expect(!raw.ok && raw.error.code).toBe("REFERENCE_INVALID");
    expect(!raw.ok && raw.error.message).toContain("published only as its IM-02 stage");
    // the right group and intent identity but no transaction cause: still refused
    const noCause = await s.campaign.store.commit(
      rawTransition(s, 101, { group_id: stageGroupId(stage), intent_id: stageIntentId(stage) }),
    );
    expect(!noCause.ok && noCause.error.code).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();
    // the lawful transition: World-State's stage, resolved by the coordinator
    await must(advanceAll(s));
    expect(s.campaign.store.getFact(transitionKey)!.version).toBe(1);
    // a duplicate cannot be credited, under any identity
    const dup = await s.campaign.store.commit(rawTransition(s, 102));
    expect(dup.ok).toBe(false);
    expect(s.campaign.store.listFacts().filter((f) => f.key.endsWith("/transition"))).toHaveLength(
      1,
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a transition cannot be published before its cause is registered as an engaged boundary, whoever publishes it", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptEntity(s, REQ_1, 1);
    await commitCause(s, CAUSE_1, REQ_1, 1); // committed, but no temporal object: nothing is engaged
    const honest = rawTransition(s, 110, {
      group_id: stageGroupId(stage),
      intent_id: stageIntentId(stage),
      cause: "transaction:tx-raw",
    });
    const r = await s.campaign.store.commit(honest);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    // refused for want of a durable transaction authority (nothing opened a transaction), before any boundary question
    expect(!r.ok && r.error.message).toContain("durable authority of its open transaction");
    expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();
  });

  const L = (id: string) => locusRef(id);
  const mutations: [string, (g: CommitGroup) => CommitGroup, string, RegExp][] = [
    [
      "a different destination than the cause required, not pinned",
      (g) => withWrite(g, transitionKey, (v) => (v.locus.to = L(OTHER_LOCUS_ID))),
      "REFERENCE_INVALID",
      /must read the destination locus/,
    ],
    [
      "a different destination than the cause required, even fully pinned",
      (g) => ({
        ...withWrite(g, transitionKey, (v) => (v.locus.to = L(OTHER_LOCUS_ID))),
        reads: [...g.reads, { key: otherLocusKey, version: 1 }],
        depends_on: [...g.depends_on, "wf-group-6"], // the group that established that locus (publication 6)
      }),
      "VALUE_INVALID",
      /exactly what the cause determines/,
    ],
    [
      "a rewritten origin (the accepted locus is history)",
      (g) => withWrite(g, transitionKey, (v) => (v.locus.from = L(OTHER_LOCUS_ID))),
      "VALUE_INVALID",
      /exactly what the cause determines/,
    ],
    [
      "a different instant than the cause declared",
      (g) => withWrite(g, transitionKey, (v) => (v.closed_at.value = 201)),
      "VALUE_INVALID",
      /takes effect at its own declared instant/,
    ],
    [
      "an entity pinned at another version",
      (g) => withWrite(g, transitionKey, (v) => (v.entity.version = 2)),
      "REFERENCE_INVALID",
      /pinned at its current version/,
    ],
    [
      "a cause pinned at another version",
      (g) => withWrite(g, transitionKey, (v) => (v.cause.version = 2)),
      "REFERENCE_INVALID",
      /pinned at its current version/,
    ],
    [
      "a new successor instead of the same entity",
      (g) => withWrite(g, transitionKey, (v) => (v.continuity.relation = "NEW_SUCCESSOR")),
      "VALUE_INVALID",
      /entity_transition|contract/,
    ],
    [
      "a changed form",
      (g) => withWrite(g, transitionKey, (v) => (v.continuity.form = "CHANGED")),
      "VALUE_INVALID",
      /contract/,
    ],
    [
      "a smuggled quantity or condition (a second physical writer)",
      (g) =>
        withWrite(g, transitionKey, (v) => {
          v.physical = { quantity: { amount: 5, unit: "synthetic-unit-d" }, condition: "damaged" };
        }),
      "VALUE_INVALID",
      /contract/,
    ],
    [
      "the entity rewritten in the same group",
      (g) => ({
        ...g,
        writes: [
          ...g.writes,
          { ...g.writes[0]!, key: entityKey, expected_version: 1, value: { not: "an entity" } },
        ],
      }),
      "AMENDMENT_NOT_SUPPORTED",
      /sealed/,
    ],
    [
      "a transition filed in another entity's slot",
      (g) => ({
        ...g,
        writes: g.writes.map((w) => ({
          ...w,
          key: `world/${FIXTURE_WORLD_ID}/entity/someone-else/transition`,
        })),
      }),
      "VALUE_INVALID",
      /identity does not match the key/,
    ],
    [
      "a missing pin of the destination locus it depends on",
      (g) => ({
        ...g,
        reads: g.reads.filter((r) => r.key !== destLocusKey),
        depends_on: g.depends_on,
      }),
      "REFERENCE_INVALID",
      /must read the destination locus/,
    ],
    [
      "no dependency on the group that committed the causing result",
      (g) => ({ ...g, depends_on: g.depends_on.filter((d) => d !== "ent-fixture-group-1") }),
      "REFERENCE_INVALID",
      /must depend on the group that committed/,
    ],
  ];
  it.each(mutations)("refuses %s", async (_name, mutate, code, message) => {
    const s = await registered();
    const before = entSummary(s.campaign, s.coordinator);
    const t = tamperStore(s.campaign.store, OWNER_WORLD_STATE, mutate);
    const coordinator = new TemporalCoordinator(t.store, entityProviders());
    const r = await must(coordinator.advance(prodAdvanceRequest("tx-1", PROD_T1)));
    expect(t.tampered()).toBe(1);
    // refused by IM-11, not by the operation: nothing is published or credited and the work stays pending
    expect(r.rejections).toEqual([{ stage, code }]);
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents).toEqual([
      { stage, reason: "VALIDATION_REJECTED" },
    ]);
    expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();
    expect(s.campaign.store.getFact(entityKey)).toEqual(before.entities[0]);
    expect(s.campaign.verify()).toEqual([]);
    // and the message names the rule
    const raw = await s.campaign.store.commit(mutate(rawTransition(s, 120)));
    expect(raw.ok).toBe(false);
    expect(!raw.ok && raw.error.message).toMatch(message);
  });
});

describe("the exact forged-stage hole (Blue review of PR #8): the copied StageKey identity and a forged transaction cause", () => {
  it("after the temporal object is lawfully registered, a raw stage with the right group and intent ids, the forged cause 'transaction:forged', the correct pinned reads and dependencies and the exact derived value is REFUSED: no transition, the current locus is unchanged, integrity is clean", async () => {
    const s = await registered();
    // the state Blue named, exactly: accepted entity, cause and transition object registered; canonical time still
    // before the outcome's instant; the boundary active and unretired
    expect(s.coordinator.state()!.value.canonical_time.value).toBeLessThan(ENT_T_EFFECT.value);
    expect(s.coordinator.object(`obj-entity-transition-${CAUSE_1}`)!.value.next_boundary).toEqual({
      boundary_id: `boundary-entity-transition-${CAUSE_1}`,
      at: ENT_T_EFFECT,
    });
    const before = entSummary(s.campaign, s.coordinator);
    const originBefore = currentLocusOfRequest(s.campaign, REQ_1)!;
    expect(originBefore.current.locus.entity_id).toBe(FIXTURE_LOCUS_ID);

    const forged = rawTransition(s, 130, {
      group_id: stageGroupId(stage),
      intent_id: stageIntentId(stage),
      cause: "transaction:forged",
    });
    // everything but the authority is exactly what the coordinator would publish
    expect(forged.group_id).toBe(stageGroupId(stage));
    expect(forged.intent_id).toBe(stageIntentId(stage));
    expect(forged.reads.map((r) => r.key).sort()).toEqual(
      [ck, entityKey, worldKey, destLocusKey].sort(),
    );
    const r = await s.campaign.store.commit(forged);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toContain("durable authority of its open transaction");
    // no transition fact, no new commit of any kind, the origin is still the one current locus, and it verifies
    expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();
    expect(entSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(currentLocusOfRequest(s.campaign, REQ_1)!.current.locus.entity_id).toBe(
      FIXTURE_LOCUS_ID,
    );
    expect(currentLocusOfRequest(s.campaign, REQ_1)!.transition).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);

    // the lawful transaction is unaffected: it opens its own authority, commits the stage under it, exactly once
    await must(advanceAll(s, "tx-honest"));
    const tf = s.campaign.store.getFact(transitionKey)!;
    expect(tf.provenance.cause).toBe("transaction:tx-honest");
    expect(s.campaign.store.getFact("temporal/transaction-authority/tx-honest")).toBeDefined();
    expect(currentLocusOfRequest(s.campaign, REQ_1)!.current.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("duplicate, replayed and incompatible transitions fail closed (acceptance 8, 9)", () => {
  it("replaying the committed transaction returns it, writes nothing and emits no second result", async () => {
    const s = await registered();
    const first = await must(advanceAll(s));
    const before = entSummary(s.campaign, s.coordinator);
    const again = await must(advanceAll(s));
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(entSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(s.campaign.store.listFacts().filter((f) => f.key.endsWith("/transition"))).toHaveLength(
      1,
    );
    // a changed request under the same transaction identity is a conflict, not a second transition
    expect(
      await codeOf(
        s.coordinator.advance(
          prodAdvanceRequest("tx-1", PROD_T1, { cause: "a-different-cause" }),
        ) as never,
      ),
    ).toBe("TRANSACTION_CONFLICT");
  });

  it("a second cause for an entity that already transitioned earns no boundary, however it is committed", async () => {
    const s = await registered();
    await must(advanceAll(s));
    await commitCause(s, CAUSE_2, REQ_1, 2, { destination: OTHER_LOCUS_ID });
    const fact = s.campaign.store.getFact(causeKey(CAUSE_2))!;
    const r = await s.coordinator.registerObject({
      ...temporalPublication(60),
      object: entityTransitionTemporalObject({
        key: fact.key,
        owner: fact.owner,
        value: EntityTransitionCauseSchema.parse(fact.value),
      }),
    });
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toContain("already transitioned");
    // the entity has exactly one current locus: the first transition's destination
    expect((s.campaign.store.getFact(transitionKey)!.value as any).locus.to.locus.entity_id).toBe(
      DEST_LOCUS_ID,
    );
  });

  it("two causes registered before either resolves: one transition commits, the other stays unresolved and fails closed — no sibling current locus", async () => {
    const s = await registered();
    await commitCause(s, CAUSE_2, REQ_1, 2, { destination: OTHER_LOCUS_ID });
    await registerTransition(s, CAUSE_2, 61);
    const r = await must(advanceAll(s));
    const transitions = s.campaign.store.listFacts().filter((f) => f.key.endsWith("/transition"));
    expect(transitions).toHaveLength(1);
    expect(transitions[0]!.version).toBe(1);
    const won = (transitions[0]!.value as any).cause.cause_id as string;
    const lost = won === CAUSE_1 ? CAUSE_2 : CAUSE_1;
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents).toEqual([
      { stage: entityTransitionStage(lost), reason: "SOURCE_INVALID" },
    ]);
    // the loser's boundary stays active and untouched: nothing was credited for it
    expect(
      s.coordinator.object(`obj-entity-transition-${lost}`)!.value.next_boundary,
    ).not.toBeNull();
    expect(s.campaign.verify()).toEqual([]);
  });

  const L = (id: string, world = FIXTURE_WORLD_ID) => locusRef(id, world);
  const incompatible: [string, (c: any) => void, RegExp][] = [
    [
      "a destination that is the entity's own locus (not a material transition)",
      (c) => (c.outcome.destination = L(FIXTURE_LOCUS_ID)),
      /changes the entity's locus|cannot lawfully transition/,
    ],
    [
      "a destination locus that was never established (a transition creates none)",
      (c) => (c.outcome.destination = L("locus-never-established")),
      /established locus of the entity's world/,
    ],
    [
      "a subject that was never accepted",
      (c) =>
        (c.subject = {
          fact_key: acceptedEntityKey("req-never"),
          entity_id: acceptedEntityId("req-never"),
        }),
      /already-accepted entity/,
    ],
    [
      "a result that names another source than the one that wrote it",
      (c) => (c.source.owner = "someone-else"),
      /committed causing result that fixes it/,
    ],
    [
      "an outcome that takes effect no later than it was established",
      (c) => (c.timing.occurs_at = at(140)),
      /committed causing result that fixes it/,
    ],
  ];
  it.each(incompatible)(
    "refuses %s at registration: it earns no boundary",
    async (_n, mutate, why) => {
      const s = await seededEntityCampaign(tempDir());
      await acceptEntity(s, REQ_1, 1);
      const cause = structuredClone(transitionCause(CAUSE_1, REQ_1)) as any;
      mutate(cause);
      await commitCause(s, CAUSE_1, REQ_1, 1, {}, cause);
      const fact = s.campaign.store.getFact(ck)!;
      const parsed = EntityTransitionCauseSchema.safeParse(fact.value);
      // hand the registration the object a lawful cause would earn, over the committed (incompatible) cause
      const lawful = entityTransitionTemporalObject({
        key: fact.key,
        owner: fact.owner,
        value: parsed.success ? parsed.data : (transitionCause(CAUSE_1, REQ_1) as never),
      });
      const object: TemporalObject = parsed.success
        ? lawful
        : {
            ...lawful,
            dependencies: [{ ...lawful.dependencies[0]!, produces: [transitionKey] }],
          };
      const r = await s.coordinator.registerObject({ ...temporalPublication(40), object });
      expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
      expect(!r.ok && r.error.message).toMatch(why);
      expect(s.coordinator.object(`obj-entity-transition-${CAUSE_1}`)).toBeUndefined();
      expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    },
  );

  it("a destination in ANOTHER, fully established world earns no boundary: a same-entity transition stays within its world", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptEntity(s, REQ_1, 1);
    await must(
      s.campaign.establishWorld({
        ...publication(70),
        world: fixtureWorld({ world_id: "another-world" }),
      }),
    );
    await must(
      s.campaign.establishLocus({
        ...publication(71),
        locus: {
          ...fixtureLocus({ locus_id: "elsewhere" }),
          world: { fact_key: worldProfileKey("another-world"), entity_id: "another-world" },
        },
      }),
    );
    const cause = structuredClone(transitionCause(CAUSE_1, REQ_1)) as any;
    cause.outcome.destination = locusRef("elsewhere", "another-world");
    await commitCause(s, CAUSE_1, REQ_1, 1, {}, cause);
    const fact = s.campaign.store.getFact(ck)!;
    const r = await s.coordinator.registerObject({
      ...temporalPublication(40),
      object: entityTransitionTemporalObject({
        key: fact.key,
        owner: fact.owner,
        value: EntityTransitionCauseSchema.parse(fact.value),
      }),
    });
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/stays within the entity's world/);
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
  });

  it("a result advanced past its establishment before registration earns no boundary: it is read as established", async () => {
    const s = await seededEntityCampaign(tempDir());
    await acceptEntity(s, REQ_1, 1);
    await commitCause(s, CAUSE_1, REQ_1, 1);
    await must(
      s.campaign.store.commit(
        causeGroup(FIXTURE_CAMPAIGN, 2, CAUSE_1, transitionCause(CAUSE_1, REQ_1), 1),
      ),
    );
    const fact = s.campaign.store.getFact(ck)!;
    expect(fact.version).toBe(2);
    const r = await s.coordinator.registerObject({
      ...temporalPublication(40),
      object: entityTransitionTemporalObject({
        key: fact.key,
        owner: fact.owner,
        value: EntityTransitionCauseSchema.parse(fact.value),
      }),
    });
    expect(!r.ok && r.error.message).toMatch(/establishment \(version 1\)/);
  });
});

describe("the causing owner keeps its own lifecycle and never becomes an entity writer (F-016 v0.4 §2)", () => {
  it("a result advanced after registration but before its boundary leaves the transition pending, uncredited and fail-closed", async () => {
    const s = await registered();
    await must(
      s.campaign.store.commit(
        causeGroup(
          FIXTURE_CAMPAIGN,
          5,
          CAUSE_1,
          transitionCause(CAUSE_1, REQ_1, { destination: OTHER_LOCUS_ID }),
          1,
        ),
      ),
    );
    const r = await must(advanceAll(s));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents).toEqual([
      { stage, reason: "SOURCE_INVALID" },
    ]);
    expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a result advanced AFTER the transition committed neither alters the sealed transition nor fails the load", async () => {
    const dir = tempDir();
    const s = await seededEntityCampaign(dir);
    await acceptCauseRegister(s);
    await must(advanceAll(s));
    const tf = s.campaign.store.getFact(transitionKey)!;
    await must(
      s.campaign.store.commit(
        causeGroup(
          FIXTURE_CAMPAIGN,
          5,
          CAUSE_1,
          transitionCause(CAUSE_1, REQ_1, { destination: OTHER_LOCUS_ID }),
          1,
        ),
      ),
    );
    expect(s.campaign.store.getFact(transitionKey)).toEqual(tf);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
    const re = await reopenEntity(dir, "after-cause-advance");
    expect(re.campaign.store.getFact(transitionKey)).toEqual(tf);
    await re.campaign.close();
  });
});

describe("RC-10: an entity-transition temporal object is exactly the one derived from its committed cause", () => {
  async function seededCause() {
    const s = await seededEntityCampaign(tempDir());
    await acceptEntity(s, REQ_1, 1);
    await commitCause(s, CAUSE_1, REQ_1, 1);
    const fact = s.campaign.store.getFact(ck)!;
    const lawful = entityTransitionTemporalObject({
      key: fact.key,
      owner: fact.owner,
      value: EntityTransitionCauseSchema.parse(fact.value),
    });
    return { s, lawful };
  }
  const decl = (o: TemporalObject) => o.dependencies[0]!;
  const objects: [string, (o: TemporalObject) => TemporalObject, RegExp][] = [
    [
      "another boundary instant",
      (o) => ({ ...o, next_boundary: { ...o.next_boundary!, at: at(210) } }),
      /earns exactly the outcome's declared boundary/,
    ],
    [
      "another resolved basis",
      (o) => ({ ...o, last_resolved_basis: at(120) }),
      /earns exactly the outcome's declared boundary/,
    ],
    [
      "a read that is not the committed cause",
      (o) => ({
        ...o,
        dependencies: [
          { ...decl(o), reads: [{ ...decl(o).reads[0]!, source: { owner: "x", fact_key: ck } }] },
        ],
      }),
      /committed causing result that fixes it/,
    ],
    [
      "a changed read set (the destination locus dropped)",
      (o) => ({ ...o, dependencies: [{ ...decl(o), reads: decl(o).reads.slice(0, 3) }] }),
      /exactly the object derived from its cause/,
    ],
    [
      "no declared close",
      (o) => ({ ...o, dependencies: [{ ...decl(o), declares_close: null }] }),
      /exactly the object derived from its cause/,
    ],
    [
      "a different produced key",
      (o) => ({
        ...o,
        dependencies: [{ ...decl(o), produces: [`world/${FIXTURE_WORLD_ID}/entity/x/transition`] }],
      }),
      /exactly the object derived from its cause/,
    ],
    [
      "a second declared stage",
      (o) => ({
        ...o,
        dependencies: [
          decl(o),
          {
            ...decl(o),
            stage: { ...decl(o).stage, prospective_result_id: "again" },
            declares_close: null,
            produces: [`world/${FIXTURE_WORLD_ID}/entity/x/transition`],
          },
        ],
      }),
      /exactly the object derived from its cause/,
    ],
    [
      "an identity that is not derived from its cause",
      (o) => ({ ...o, object_id: "obj-something-else" }),
      /identity derived from its cause/,
    ],
    [
      "another owner for the process",
      (o) => ({
        ...o,
        owning_ref: { owner: "world_state", process_id: "entity-transition:other" },
      }),
      /exactly the object derived from its cause/,
    ],
  ];
  it.each(objects)("refuses a hand-written object with %s", async (_n, mutate, why) => {
    const { s, lawful } = await seededCause();
    const r = await s.coordinator.registerObject({
      ...temporalPublication(40),
      object: mutate(lawful),
    });
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(why);
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    // the lawful object still registers
    await must(s.coordinator.registerObject({ ...temporalPublication(41), object: lawful }));
  });

  it("an object naming a cause that is not committed, or that fixes a different object identity, is refused", async () => {
    const { s, lawful } = await seededCause();
    const missing = {
      ...lawful,
      dependencies: [
        {
          ...decl(lawful),
          reads: [
            {
              ...decl(lawful).reads[0]!,
              source: { owner: SYNTH_ENTITY_CAUSE_OWNER, fact_key: causeKey("never") },
            },
            ...decl(lawful).reads.slice(1),
          ],
        },
      ],
    };
    const r = await s.coordinator.registerObject({ ...temporalPublication(40), object: missing });
    expect(!r.ok && r.error.message).toMatch(/committed causing result that fixes it/);
    const renamed = { ...lawful, object_id: "obj-entity-transition-not-this-cause" };
    const r2 = await s.coordinator.registerObject({ ...temporalPublication(42), object: renamed });
    expect(!r2.ok && r2.error.message).toMatch(/committed causing result that fixes it/);
  });
});

describe("load-time verification fails closed on entity-transition drift (IA-30 partial)", () => {
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    opts: { complete?: boolean } = {},
  ) {
    const s = await registered();
    if (opts.complete !== false) await must(advanceAll(s));
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
    const out = verifyEntityTransitionIntegrity(bound);
    await s.campaign.close();
    return out.map((v) => v.message).join(" | ");
  }
  const edit = (key: string, f: (v: any, fact: any) => void) => (facts: OwnerFact[]) => {
    f(
      facts.find((x) => x.key === key)!.value,
      facts.find((x) => x.key === key),
    );
    return facts;
  };

  it("healthy campaigns verify, before and after the transition resolves", async () => {
    expect(await drifted((f) => f)).toBe("");
    expect(await drifted((f) => f, { complete: false })).toBe("");
  });
  it("detects a transition that is not what its cause determines (destination, origin, instant)", async () => {
    for (const f of [
      (v: any) => (v.locus.to = locusRef(OTHER_LOCUS_ID)),
      (v: any) => (v.locus.from = locusRef(OTHER_LOCUS_ID)),
      (v: any) => (v.closed_at.value = 201),
    ])
      expect(await drifted(edit(transitionKey, f))).toMatch(
        /exactly what the committed cause determines/,
      );
  });
  it("detects a transition with no committed cause or no accepted entity", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== ck))).toMatch(
      /no committed causing result or accepted entity/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== entityKey))).toMatch(
      /no committed causing result or accepted entity/,
    );
  });
  it("detects a transition that is not its IM-02 stage, and one credited by no transaction", async () => {
    expect(
      await drifted(edit(transitionKey, (_v, fact) => (fact.provenance.group_id = "raw-group"))),
    ).toMatch(/published only as its IM-02 stage/);
    expect(
      await drifted((f) => f.filter((x) => !x.key.startsWith("temporal/transaction/"))),
    ).toMatch(/credited by no resolution transaction/);
  });
  it("detects a retired boundary that left the subject without its transition", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== transitionKey))).toMatch(
      /retired entity-transition boundary has its transition/,
    );
  });
  it("detects a transition committed no later than the cause or entity it pins", async () => {
    const swapped = await drifted((facts) => {
      const t = facts.find((x) => x.key === transitionKey)!;
      const c = facts.find((x) => x.key === ck)!;
      c.provenance.intent_id = t.provenance.intent_id; // the cause now "committed" with the transition
      return facts;
    });
    expect(swapped).toMatch(/not committed after the cause and the entity it pins/);
  });
  it("detects a hand-altered temporal object", async () => {
    expect(
      await drifted(
        edit(
          "temporal/object/obj-entity-transition-cause-1",
          (o) => (o.dependencies[0].produces = ["x"]),
        ),
      ),
    ).toMatch(/exactly the object derived from its cause/);
  });

  it("tampering with the persisted journal fails the open under the existing integrity model", async () => {
    const dir = tempDir();
    const s = await seededEntityCampaign(dir);
    await acceptCauseRegister(s);
    await must(advanceAll(s));
    await s.campaign.close();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("CAUSING_RESULT_CHANGES_CURRENT_LOCUS_ONLY");
    writeFileSync(
      journal,
      text.replace(
        "CAUSING_RESULT_CHANGES_CURRENT_LOCUS_ONLY",
        "CAUSING_RESULT_CHANGES_CURRENT_LOCUS_ONLX",
      ),
    );
    expect((await CanonicalCampaign.open(dir)).ok).toBe(false);
  });
});

describe("unknown outcome is reconciled by identity: a failure at EVERY durable step of the transition transaction", () => {
  it("(transition stage, downstream consumer stage, kernel group) converges on one transition and one consumer result", async () => {
    const seed = async (dir: string) => {
      const s = await seededEntityCampaign(dir);
      await acceptCauseRegister(s);
      await registerConsumer(s, CAUSE_1, REQ_1, 41);
      await s.campaign.close();
    };
    const refDir = tempDir();
    await seed(refDir);
    const ref = await reopenEntity(refDir, "ref");
    const refResult = await must(advanceAll(ref, "tx-transition"));
    const refHead = ref.campaign.store.head();
    const refSummary = entSummary(ref.campaign, ref.coordinator);
    await ref.campaign.close();

    const countDir = tempDir();
    await seed(countDir);
    const probe = instrumentFs(nodeFs);
    const p = await must(
      CanonicalCampaign.open(countDir, {
        fs: probe.fs,
        extension: (await import("@immortalis/testkit")).ENTITY_FIXTURE_EXTENSION,
      }),
    );
    const afterOpen = probe.count();
    await must(entCoordinator(p.store).advance(prodAdvanceRequest("tx-transition", PROD_T1)));
    const afterAdvance = probe.count();
    await p.close();
    // two stages + the kernel group: three commits of at least four durable steps each
    expect(afterAdvance - afterOpen).toBeGreaterThanOrEqual(12);

    const { ENTITY_FIXTURE_EXTENSION } = await import("@immortalis/testkit");
    const consumerStageId = stageIntentId({
      causal_process_id: `entity-consumer-now:${CAUSE_1}`,
      owner_operation: {
        owner: SYNTH_ENTITY_CONSUMER_OWNER,
        operation: "synthetic-entity-transition-consume-now",
      },
      prospective_result_id: `consumer-result:${CAUSE_1}`,
    });
    const seen = { rolledBack: 0, partial: 0, committed: 0 };
    const finals = new Set<string>();
    for (let failAt = afterOpen + 1; failAt <= afterAdvance; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const campaign = await must(
          CanonicalCampaign.open(dir, { fs: inst.fs, extension: ENTITY_FIXTURE_EXTENSION }),
        );
        const r = await entCoordinator(campaign.store).advance(
          prodAdvanceRequest("tx-transition", PROD_T1),
        );
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await campaign.close();

        const re = await reopenEntity(dir, "restart");
        expect(re.campaign.verify()).toEqual([]); // whatever survived is internally consistent
        const transitionCommitted = re.campaign.store.lookupReceipt(stageIntentId(stage)) !== null;
        const consumerCommitted = re.campaign.store.lookupReceipt(consumerStageId) !== null;
        if (re.coordinator.transaction("tx-transition")) seen.committed++;
        else if (transitionCommitted || consumerCommitted) seen.partial++;
        else seen.rolledBack++;
        // the reader never commits before the transition it reads
        if (consumerCommitted) expect(transitionCommitted).toBe(true);
        expect(
          re.campaign.store.listFacts().filter((f) => f.key.endsWith("/transition")).length,
        ).toBeLessThanOrEqual(1);

        // re-present the SAME request: existing receipts are reached; a committed stage is adopted, never recomputed
        const again = await must(advanceAll(re, "tx-transition"));
        if (transitionCommitted && !re.coordinator.transaction("tx-transition")) {
          expect(again.recomputed_in_place).toEqual([]);
          expect(again.adopted.length).toBeGreaterThan(0);
        }
        const head = re.campaign.store.head();
        expect(head.revision).toBe(refHead.revision); // no duplicate group anywhere
        const sum = entSummary(re.campaign, re.coordinator);
        expect(sum.transitions).toEqual(refSummary.transitions);
        expect(sum.entities).toEqual(refSummary.entities);
        expect(sum.synthetic).toEqual(refSummary.synthetic);
        expect(re.campaign.store.getFact(transitionKey)!.version).toBe(1);
        expect(re.campaign.store.getFact(entityConsumerResultKey(CAUSE_1))!.version).toBe(1);
        expect(again.transaction.stages.map((x) => x.group_id)).toEqual(
          refResult.transaction.stages.map((x) => x.group_id),
        );
        finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
        await re.campaign.close();
        const last = await reopenEntity(dir, "last");
        expect(last.campaign.verify()).toEqual([]);
        await last.campaign.close();
      }
    }
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBe(`${refHead.state_sha256}/${refHead.journal_head_sha256}`);
    expect(seen.rolledBack).toBeGreaterThan(0);
    expect(seen.partial).toBeGreaterThan(0);
    expect(seen.committed).toBeGreaterThan(0);
  }, 480_000);
});

describe("a refused or unresolved transition leaves nothing behind", () => {
  it("an entity not yet accepted cannot be the subject: the cause earns no object, boundary or transition", async () => {
    const s = await seededEntityCampaign(tempDir());
    await commitCause(s, CAUSE_1, REQ_2, 1); // REQ_2's entity does not exist yet
    const fact = s.campaign.store.getFact(ck)!;
    const r = await s.coordinator.registerObject({
      ...temporalPublication(40),
      object: entityTransitionTemporalObject({
        key: fact.key,
        owner: fact.owner,
        value: EntityTransitionCauseSchema.parse(fact.value),
      }),
    });
    expect(!r.ok && r.error.message).toMatch(/already-accepted entity/);
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(
      s.campaign.store.listFacts().filter((f) => /\/transition$|obj-entity-transition/.test(f.key)),
    ).toEqual([]);
    void RESERVE_OTHER;
  });
});
