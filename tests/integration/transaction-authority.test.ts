/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// The durable pre-stage transaction authority (Blue decision on the Implementation Escalation of PR #8; F-014B §2
// "active requested target/condition and player-facing transaction identity/provenance", §6 step 1 "open one
// resolution transaction before resolving the crossed material causal work"; RC-05; IM-02/IM-11/IM-12/IM-17).
// Before ANY IM-02-coordinated owner stage can commit, durable kernel coordination state establishes the exact
// active transaction that permits it, and the stage depends on that authority; copying a stage's deterministic
// identity and naming an arbitrary `transaction:<id>` is not enough. The legitimate stage-before-kernel-commit crash
// window is preserved: the authority is durable first, a genuine stage commits under it, and the same transaction,
// re-presented, adopts that stage and completes exactly once.
// Register lineage: IA-02, IA-03, IA-04, IA-06 (partial); RC-02, RC-05, RC-16; IM-02, IM-11, IM-12, IM-17.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  EntityTransitionCauseSchema,
  FACET_TEMPORAL_COORDINATION,
  OWNER_TEMPORAL_KERNEL,
  OWNER_WORLD_STATE,
  FACET_WORLD_FALLBACK_ENTITY,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  TransactionAuthoritySchema,
  entityTransitionStage,
  temporalTransactionAuthorityKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  TemporalCoordinator,
  WORLD_ENTITY_TRANSITION_RULE,
  deriveEntityTransition,
  factKind,
  nodeFs,
  stageGroupId,
  stageIntentId,
  transactionAuthorityGroupId,
  transactionAuthorityIntentId,
  transactionCause,
  verifyEntityTransitionIntegrity,
  verifyTemporalIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  CAUSE_1,
  DEST_LOCUS_ID,
  ENTITY_FIXTURE_EXTENSION,
  ENT_T_EFFECT,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  PROD_T1,
  REQ_1,
  acceptedEntityKey,
  at,
  causeKey,
  entityProviders,
  instrumentFs,
  prodAdvanceRequest,
  transitionKeyOf,
} from "@immortalis/testkit";
import {
  acceptCauseRegister,
  currentLocusOfRequest,
  entCoordinator,
  entSummary,
  reopenEntity,
  seededEntityCampaign,
  type EntSeeded,
} from "../support/entity.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const transitionKey = transitionKeyOf(REQ_1);
const entityKey = acceptedEntityKey(REQ_1);
const stage = entityTransitionStage(CAUSE_1);
const authKey = temporalTransactionAuthorityKey;
const CONTEXT = { role: "role.player", permission: "permission.player_choice.commit" } as const;
const PUBLICATION = { basis: "fixture-basis", secrecy: "fixture-visibility" } as const;

/** One accepted entity, its cause committed and its transition object registered; canonical time before the boundary. */
async function registered(): Promise<EntSeeded> {
  const s = await seededEntityCampaign(tempDir());
  await acceptCauseRegister(s);
  return s;
}

/**
 * A raw kernel group opening a transaction: exactly the shape the coordinator publishes, built by hand. Whatever it
 * claims is judged by kernel admission alone.
 */
function rawAuthority(
  store: CampaignStore,
  id: string,
  over: Record<string, unknown> = {},
  group: Partial<CommitGroup> = {},
): CommitGroup {
  const stateFact = store.getFact(TEMPORAL_STATE_KEY)!;
  const state = TemporalStateSchema.parse(stateFact.value);
  const value = {
    transaction_id: id,
    cause: `cause-${id}`,
    trigger: { kind: "fixture-advance-request", ref: `ref-${id}` },
    continues: null,
    opening: { basis_time: state.canonical_time, state_version: stateFact.version },
    requested: { target: PROD_T1, condition: null },
    context: CONTEXT,
    publication: PUBLICATION,
    ...over,
  };
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: transactionAuthorityGroupId(id),
    intent_id: transactionAuthorityIntentId(id),
    owner: OWNER_TEMPORAL_KERNEL,
    facet: FACET_TEMPORAL_COORDINATION,
    cause: transactionCause(id),
    rule: factKind("temporal_state").rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [{ key: TEMPORAL_STATE_KEY, version: stateFact.version }],
    depends_on: [stateFact.provenance.group_id],
    writes: [
      {
        key: authKey(id),
        owner: OWNER_TEMPORAL_KERNEL,
        facet: FACET_TEMPORAL_COORDINATION,
        value: value as never,
        unit: null,
        basis: PUBLICATION.basis,
        secrecy: PUBLICATION.secrecy,
        expected_version: 0,
      },
    ],
    ...group,
  };
}

/** The EXACT derived transition value, as any raw caller could build it from committed state alone. */
function derived(store: CampaignStore) {
  const cf = store.getFact(causeKey(CAUSE_1))!;
  const ef = store.getFact(entityKey)!;
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

/** A raw stage with the derived identity, naming `cause`, with the correct reads and (optionally) extra dependencies. */
function rawStage(
  store: CampaignStore,
  cause: string,
  dependsOnAuthority: string[] = [],
): CommitGroup {
  const keys = [
    causeKey(CAUSE_1),
    entityKey,
    worldProfileKey(FIXTURE_WORLD_ID),
    worldLocusKey(FIXTURE_WORLD_ID, DEST_LOCUS_ID),
  ];
  const ef = store.getFact(entityKey)!;
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: stageGroupId(stage),
    intent_id: stageIntentId(stage),
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_FALLBACK_ENTITY,
    cause,
    rule: WORLD_ENTITY_TRANSITION_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: keys.map((k) => ({ key: k, version: store.getFact(k)!.version })),
    depends_on: [
      ...new Set(keys.map((k) => store.getFact(k)!.provenance.group_id)),
      ...dependsOnAuthority,
    ],
    writes: [
      {
        key: transitionKey,
        owner: OWNER_WORLD_STATE,
        facet: FACET_WORLD_FALLBACK_ENTITY,
        value: derived(store) as never,
        unit: null,
        basis: ef.basis,
        secrecy: ef.secrecy,
        expected_version: 0,
      },
    ],
  };
}

const nothingTransitioned = (s: EntSeeded) => {
  expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();
  expect(currentLocusOfRequest(s.campaign, REQ_1)!.current.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
};

const advance = (s: EntSeeded | { coordinator: TemporalCoordinator }, id: string, over = {}) =>
  s.coordinator.advance(prodAdvanceRequest(id, PROD_T1, over));

describe("a genuine coordinator transaction opens its durable authority BEFORE its owner stages (F-014B §6 step 1)", () => {
  it("commits the opening first, every owner stage depends on it, and the sealed transaction repeats exactly what was opened", async () => {
    const s = await registered();
    const spy = spyStore(s.campaign.store);
    const r = await must(
      new TemporalCoordinator(spy.store, entityProviders()).advance(
        prodAdvanceRequest("tx-1", PROD_T1),
      ),
    );
    // the publication order: opening (kernel), the owner stage, the transaction (kernel)
    expect(spy.commits.map((g) => [g.owner, g.writes.map((w) => w.key)])).toEqual([
      [OWNER_TEMPORAL_KERNEL, [authKey("tx-1")]],
      [OWNER_WORLD_STATE, [transitionKey]],
      [
        OWNER_TEMPORAL_KERNEL,
        expect.arrayContaining(["temporal/transaction/tx-1", "temporal/state"]),
      ],
    ]);
    const [opening, owner, kernel] = spy.commits as [CommitGroup, CommitGroup, CommitGroup];
    expect(opening.group_id).toBe(transactionAuthorityGroupId("tx-1"));
    expect(opening.cause).toBe("transaction:tx-1");
    expect(owner.depends_on).toContain(opening.group_id);
    expect(owner.cause).toBe("transaction:tx-1");
    expect(kernel.depends_on).toContain(opening.group_id);
    // the authority is the RC-05 opening and nothing substantive; the sealed transaction repeats it
    const a = TransactionAuthoritySchema.parse(s.campaign.store.getFact(authKey("tx-1"))!.value);
    const t = r.transaction;
    expect(a).toEqual({
      transaction_id: "tx-1",
      cause: t.cause,
      trigger: t.trigger,
      continues: t.continues,
      opening: t.opening,
      requested: t.requested,
      context: t.context,
      publication: PUBLICATION,
    });
    expect(s.campaign.store.getFact(authKey("tx-1"))!.version).toBe(1);
    // an owner stage's reads stay exactly its declared reads (owners stamp and re-derive from them)
    expect(owner.reads.map((x) => x.key)).toHaveLength(4);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a transaction that commits no owner stage opens nothing: no extra record, no behavior change", async () => {
    const s = await registered();
    const before = s.campaign.store.head().revision;
    // a target before the boundary engages nothing and resolves no stage
    await must(s.coordinator.advance(prodAdvanceRequest("tx-carry", at(150))));
    expect(s.campaign.store.getFact(authKey("tx-carry"))).toBeUndefined();
    expect(s.campaign.store.head().revision).toBe(before + 1); // only the kernel's own transaction group
    expect(s.campaign.verify()).toEqual([]);
  });

  it("stage identity stays independent of the horizon, retry and slicing: the same stage group and intent under any request", async () => {
    const ids: string[] = [];
    for (const [id, target, over] of [
      ["tx-a", PROD_T1, {}],
      ["tx-b", at(260), {}],
      ["tx-c", PROD_T1, {}],
    ] as const) {
      const s = await registered();
      const r = await must(
        s.coordinator.advance(prodAdvanceRequest(id, target, over), { slices: [at(170), at(190)] }),
      );
      ids.push(r.transaction.stages[0]!.group_id + "/" + r.transaction.stages[0]!.intent_id);
    }
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(`${stageGroupId(stage)}/${stageIntentId(stage)}`);
  });
});

describe("a raw stage that copies the derived identity is refused without a lawful durable authority", () => {
  it("naming a transaction that was never opened, with or without a dependency on any authority, is refused; nothing transitions", async () => {
    const s = await registered();
    const before = entSummary(s.campaign, s.coordinator);
    const r = await s.campaign.store.commit(rawStage(s.campaign.store, "transaction:forged"));
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toContain("durable authority of its open transaction");
    // depending on ANOTHER transaction's real authority does not make 'forged' a transaction
    await must(s.campaign.store.commit(rawAuthority(s.campaign.store, "tx-other")));
    const other = s.campaign.store.getFact(authKey("tx-other"))!;
    const r2 = await s.campaign.store.commit(
      rawStage(s.campaign.store, "transaction:forged", [other.provenance.group_id]),
    );
    expect(!r2.ok && r2.error.code).toBe("REFERENCE_INVALID");
    expect(!r2.ok && r2.error.message).toContain("durable authority of its open transaction");
    nothingTransitioned(s);
    expect(entSummary(s.campaign, s.coordinator).transitions).toEqual(before.transitions);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a stage that names an open transaction but does not depend on its authority is refused", async () => {
    const s = await registered();
    await must(s.campaign.store.commit(rawAuthority(s.campaign.store, "tx-other")));
    const r = await s.campaign.store.commit(rawStage(s.campaign.store, "transaction:tx-other"));
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toContain("depends on the durable authority");
    nothingTransitioned(s);
  });

  it("a COMMITTED transaction's authority authorizes no further stage, however it is cited", async () => {
    const s = await registered();
    // tx-accept-1 genuinely opened and committed (it accepted the entity)
    const committed = s.campaign.store.getFact(authKey("tx-accept-1"))!;
    expect(committed).toBeDefined();
    expect(s.coordinator.transaction("tx-accept-1")).toBeDefined();
    const r = await s.campaign.store.commit(
      rawStage(s.campaign.store, "transaction:tx-accept-1", [committed.provenance.group_id]),
    );
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toContain(
      "committed transaction authorizes no further owner stage",
    );
    nothingTransitioned(s);
  });

  it("a stage beyond what its transaction requested is refused: the authority bounds the work it permits", async () => {
    const s = await registered();
    // lawfully opened, but only toward a target before the boundary
    await must(
      s.campaign.store.commit(
        rawAuthority(s.campaign.store, "tx-short", {
          requested: { target: at(150), condition: null },
        }),
      ),
    );
    const a = s.campaign.store.getFact(authKey("tx-short"))!;
    const r = await s.campaign.store.commit(
      rawStage(s.campaign.store, "transaction:tx-short", [a.provenance.group_id]),
    );
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toContain("lies within what its transaction requested");
    nothingTransitioned(s);
  });

  it("a stage under a genuinely OPEN transaction is the crash-window state: the same transaction, re-presented, adopts it and completes once", async () => {
    const s = await registered();
    // the opening the coordinator would commit for tx-other (lawful: this basis, this state, nothing held)
    await must(s.campaign.store.commit(rawAuthority(s.campaign.store, "tx-other")));
    const a = s.campaign.store.getFact(authKey("tx-other"))!;
    await must(
      s.campaign.store.commit(
        rawStage(s.campaign.store, "transaction:tx-other", [a.provenance.group_id]),
      ),
    );
    expect(s.campaign.verify()).toEqual([]); // an interrupted transaction awaiting its engaged boundary
    const r = await must(advance(s, "tx-other"));
    expect(r.adopted).toEqual([stage]);
    expect(r.recomputed_in_place).toEqual([]);
    expect(s.campaign.store.getFact(transitionKey)!.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
    expect((await must(advance(s, "tx-other"))).replayed).toBe(true);
  });
});

describe("kernel admission of a transaction's opening (IM-11; RC-05)", () => {
  const refused: [string, (s: EntSeeded) => CommitGroup, string, RegExp][] = [
    [
      "an identity not derived from the transaction",
      (s) => rawAuthority(s.campaign.store, "tx-x", {}, { group_id: "my-own-group" }),
      "REFERENCE_INVALID",
      /identity derived from the transaction alone/,
    ],
    [
      "a cause not derived from the transaction",
      (s) => rawAuthority(s.campaign.store, "tx-x", {}, { cause: "transaction:another" }),
      "REFERENCE_INVALID",
      /identity derived from the transaction alone/,
    ],
    [
      "an opening at a state version it did not read",
      (s) =>
        rawAuthority(s.campaign.store, "tx-x", {
          opening: {
            basis_time: TemporalStateSchema.parse(
              s.campaign.store.getFact(TEMPORAL_STATE_KEY)!.value,
            ).canonical_time,
            state_version: 9,
          },
        }),
      "REFERENCE_INVALID",
      /opens at the temporal state it read/,
    ],
    [
      "an opening at another basis time",
      (s) =>
        rawAuthority(s.campaign.store, "tx-x", {
          opening: {
            basis_time: at(1),
            state_version: s.campaign.store.getFact(TEMPORAL_STATE_KEY)!.version,
          },
        }),
      "REFERENCE_INVALID",
      /opens at the temporal state it read/,
    ],
    [
      "a target before the canonical time",
      (s) =>
        rawAuthority(s.campaign.store, "tx-x", { requested: { target: at(1), condition: null } }),
      "REFERENCE_INVALID",
      /target may not precede/,
    ],
    [
      "a continuation that is not held",
      (s) => rawAuthority(s.campaign.store, "tx-x", { continues: "tx-accept-1" }),
      "REFERENCE_INVALID",
      /must consume a continuation the state holds/,
    ],
    [
      "a second write beside it",
      (s) => {
        const g = rawAuthority(s.campaign.store, "tx-x");
        return {
          ...g,
          writes: [...g.writes, { ...g.writes[0]!, key: "temporal/transaction/tx-x" }],
        };
      },
      "VALUE_INVALID",
      /./,
    ],
    [
      "an unknown field (a substantive fact smuggled into coordination state)",
      (s) => rawAuthority(s.campaign.store, "tx-x", { entity_locus: "somewhere" }),
      "VALUE_INVALID",
      /contract/,
    ],
  ];
  it.each(refused)("refuses %s", async (_n, build, code, message) => {
    const s = await registered();
    const before = s.campaign.store.head().revision;
    const r = await s.campaign.store.commit(build(s));
    expect(!r.ok && r.error.code).toBe(code);
    expect(!r.ok && r.error.message).toMatch(message);
    expect(s.campaign.store.head().revision).toBe(before);
  });

  it("a transaction identity that is already COMMITTED cannot be opened again, and an existing opening cannot be amended", async () => {
    const s = await registered();
    // a transaction that committed with no owner stage opened nothing; its identity is still spent
    await must(s.coordinator.advance(prodAdvanceRequest("tx-carry", at(150))));
    expect(s.coordinator.transaction("tx-carry")).toBeDefined();
    const r = await s.campaign.store.commit(rawAuthority(s.campaign.store, "tx-carry"));
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/committed transaction cannot be opened again/);
    expect(s.campaign.store.getFact(authKey("tx-carry"))).toBeUndefined();
    // an existing opening is sealed: it can be neither rewritten nor re-versioned
    await must(s.campaign.store.commit(rawAuthority(s.campaign.store, "tx-z")));
    const opening = s.campaign.store.getFact(authKey("tx-z"))!;
    const g = rawAuthority(s.campaign.store, "tx-z", {
      requested: { target: at(500), condition: null },
    });
    const amend = await s.campaign.store.commit({
      ...g,
      group_id: "another-group",
      intent_id: "another-intent",
      writes: [{ ...g.writes[0]!, expected_version: 1 }],
    });
    expect(amend.ok).toBe(false);
    expect(s.campaign.store.getFact(authKey("tx-z"))).toEqual(opening);
  });

  it("no owner but the kernel can open a transaction: the cause owner, a consumer, Production, Economy, Population and World-State are refused", async () => {
    const s = await registered();
    const base = rawAuthority(s.campaign.store, "tx-x");
    for (const [owner, facet] of [
      ["SYNTHETIC-ENTITY-TRANSITION-CAUSE-OWNER", "synthetic-entity-cause"],
      ["SYNTHETIC-ENTITY-TRANSITION-CONSUMER", "synthetic-entity-consumer"],
      ["production", "production_state"],
      ["economy", "economy_state"],
      ["population", "population_state"],
      [OWNER_WORLD_STATE, FACET_WORLD_FALLBACK_ENTITY],
    ] as const) {
      const r = await s.campaign.store.commit({
        ...base,
        owner,
        facet,
        writes: base.writes.map((w) => ({ ...w, owner, facet })),
      });
      expect(r.ok, owner).toBe(false);
      expect(!r.ok && r.error.code, owner).toMatch(
        /KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT|WRITE_OWNER_MISMATCH/,
      );
    }
  });

  it("a lawful opening is accepted, idempotent by identity and conflicts when the same identity is re-presented with another request", async () => {
    const s = await registered();
    const first = await must(s.campaign.store.commit(rawAuthority(s.campaign.store, "tx-y")));
    const again = await must(s.campaign.store.commit(rawAuthority(s.campaign.store, "tx-y")));
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawAuthority(s.campaign.store, "tx-y", {
            requested: { target: at(500), condition: null },
          }),
        ),
      ),
    ).toMatch(/INTENT_CONFLICT|GROUP_ID_CONFLICT|VERSION_CONFLICT|AMENDMENT/);
    expect(s.campaign.store.getFact(authKey("tx-y"))!.version).toBe(1);
  });

  it("the sealed transaction must repeat exactly what its authority opened: a tampered transaction group is refused", async () => {
    const s = await registered();
    const mutations: [string, (v: any) => void][] = [
      ["another trigger", (v) => (v.trigger.ref = "someone-elses")],
      ["another requested target", (v) => (v.requested.target = at(250))],
      ["another context", (v) => (v.context.permission = "permission.canon.write")],
      ["another continuation", (v) => (v.continues = "tx-accept-1")],
    ];
    for (const [name, edit] of mutations) {
      const inner = s.campaign.store;
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
          if (!group.group_id.startsWith("transaction-group:")) return inner.commit(g);
          return inner.commit({
            ...group,
            writes: group.writes.map((w) => {
              if (!w.key.startsWith("temporal/transaction/")) return w;
              const value = structuredClone(w.value) as any;
              edit(value);
              return { ...w, value };
            }),
          });
        },
      };
      const r = await new TemporalCoordinator(store, entityProviders()).advance(
        prodAdvanceRequest(`tx-t-${name.length}`, PROD_T1),
      );
      // refused by the kernel (never committed): the coordinator surfaces the rejection, nothing is credited
      expect(r.ok, name).toBe(false);
      expect(s.coordinator.transaction(`tx-t-${name.length}`), name).toBeUndefined();
    }
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("retry and replay: the same transaction completes exactly once; another request under its identity is a conflict", () => {
  it("re-presenting an opened transaction with a DIFFERENT request is a conflict: no second opening, no second transition", async () => {
    const s = await registered();
    await must(advance(s, "tx-1"));
    const opening = s.campaign.store.getFact(authKey("tx-1"))!;
    const r = await s.coordinator.advance(prodAdvanceRequest("tx-1", at(260)));
    expect(!r.ok && r.error.code).toBe("TRANSACTION_CONFLICT");
    expect(s.campaign.store.getFact(authKey("tx-1"))).toEqual(opening);
    expect(s.campaign.store.listFacts().filter((f) => f.key.endsWith("/transition"))).toHaveLength(
      1,
    );
  });

  it("an opened-but-uncommitted transaction cannot be re-presented under another request either", async () => {
    const s = await registered();
    await must(s.campaign.store.commit(rawAuthority(s.campaign.store, "tx-1")));
    const r = await s.coordinator.advance(prodAdvanceRequest("tx-1", at(260)));
    expect(!r.ok && r.error.code).toBe("TRANSACTION_CONFLICT");
    nothingTransitioned(s);
    // the opened request, re-presented, completes
    await must(advance(s, "tx-1"));
    expect(s.campaign.store.getFact(transitionKey)!.version).toBe(1);
  });
});

describe("the crash windows around the opening are recoverable by identity, without duplicates", () => {
  it("crash AFTER the opening, BEFORE the first owner stage: reopen verifies; the same transaction completes once under the same opening", async () => {
    const dir = tempDir();
    const s = await seededEntityCampaign(dir);
    await acceptCauseRegister(s);
    let lost = 0;
    const inner = s.campaign.store;
    const crashing: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => inner.listFacts(),
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      close: () => inner.close(),
      commit: async (g: any) => {
        if (g.owner === OWNER_WORLD_STATE) {
          lost++;
          return {
            ok: false,
            error: { code: "UNKNOWN_OUTCOME", message: "crash before the stage" },
          } as never;
        }
        return inner.commit(g);
      },
    };
    const r = await new TemporalCoordinator(crashing, entityProviders()).advance(
      prodAdvanceRequest("tx-1", PROD_T1),
    );
    expect(lost).toBe(1);
    expect(r.ok).toBe(false);
    const opening = inner.getFact(authKey("tx-1"))!;
    await s.campaign.close();

    const re = await reopenEntity(dir, "after-opening-crash");
    expect(re.campaign.verify()).toEqual([]);
    expect(re.campaign.store.getFact(authKey("tx-1"))).toEqual(opening); // durable across the reload
    expect(re.campaign.store.getFact(transitionKey)).toBeUndefined();
    expect(re.coordinator.transaction("tx-1")).toBeUndefined();
    const done = await must(advance(re, "tx-1"));
    expect(done.transaction.stages).toHaveLength(1);
    expect(re.campaign.store.getFact(authKey("tx-1"))).toEqual(opening); // never reopened, never duplicated
    expect(re.campaign.store.getFact(transitionKey)!.provenance.cause).toBe("transaction:tx-1");
    expect((await must(advance(re, "tx-1"))).replayed).toBe(true);
    expect(re.campaign.verify()).toEqual([]);
    await re.campaign.close();
  });

  it("crash AFTER the owner stage, BEFORE the kernel transaction (the legitimate window): reopen verifies; the same transaction adopts the stage and completes exactly once", async () => {
    const dir = tempDir();
    const s = await seededEntityCampaign(dir);
    await acceptCauseRegister(s);
    const inner = s.campaign.store;
    const crashing: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => inner.listFacts(),
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      close: () => inner.close(),
      commit: async (g: any) =>
        g.group_id.startsWith("transaction-group:")
          ? ({
              ok: false,
              error: { code: "UNKNOWN_OUTCOME", message: "crash before the kernel group" },
            } as never)
          : inner.commit(g),
    };
    const r = await new TemporalCoordinator(crashing, entityProviders()).advance(
      prodAdvanceRequest("tx-1", PROD_T1),
    );
    expect(r.ok).toBe(false);
    const opening = inner.getFact(authKey("tx-1"))!;
    const tf = inner.getFact(transitionKey)!;
    expect(tf.provenance.cause).toBe("transaction:tx-1");
    await s.campaign.close();

    const re = await reopenEntity(dir, "after-stage-crash");
    expect(re.campaign.verify()).toEqual([]); // authority + stage durable; boundary unretired: an interrupted transaction
    expect(re.coordinator.transaction("tx-1")).toBeUndefined();
    const done = await must(advance(re, "tx-1"));
    expect(done.adopted).toEqual([stage]);
    expect(done.recomputed_in_place).toEqual([]);
    expect(re.campaign.store.getFact(transitionKey)).toEqual(tf); // the same fact: never recomputed, never a sibling
    expect(re.campaign.store.getFact(authKey("tx-1"))).toEqual(opening);
    expect(re.coordinator.transaction("tx-1")!.value.stages.map((x) => x.group_id)).toEqual([
      stageGroupId(stage),
    ]);
    expect((await must(advance(re, "tx-1"))).replayed).toBe(true);
    expect(re.campaign.store.listFacts().filter((f) => f.key.endsWith("/transition"))).toHaveLength(
      1,
    );
    expect(re.campaign.verify()).toEqual([]);
    await re.campaign.close();
  });

  it("a failure at EVERY durable step of the whole transaction (opening, stage, kernel) converges on the identical campaign", async () => {
    const seed = async (dir: string) => {
      const s = await seededEntityCampaign(dir);
      await acceptCauseRegister(s);
      await s.campaign.close();
    };
    const refDir = tempDir();
    await seed(refDir);
    const ref = await reopenEntity(refDir, "ref");
    await must(advance(ref, "tx-1"));
    const refHead = ref.campaign.store.head();
    await ref.campaign.close();

    const countDir = tempDir();
    await seed(countDir);
    const probe = instrumentFs(nodeFs);
    const p = await must(
      CanonicalCampaign.open(countDir, { fs: probe.fs, extension: ENTITY_FIXTURE_EXTENSION }),
    );
    const afterOpen = probe.count();
    await must(entCoordinator(p.store).advance(prodAdvanceRequest("tx-1", PROD_T1)));
    const afterAdvance = probe.count();
    await p.close();
    // three commits (opening, stage, transaction) of at least four durable steps each
    expect(afterAdvance - afterOpen).toBeGreaterThanOrEqual(12);

    const finals = new Set<string>();
    const seen = { noOpening: 0, openingOnly: 0, stageNoTx: 0, committed: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterAdvance; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const c = await must(
          CanonicalCampaign.open(dir, { fs: inst.fs, extension: ENTITY_FIXTURE_EXTENSION }),
        );
        const r = await entCoordinator(c.store).advance(prodAdvanceRequest("tx-1", PROD_T1));
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await c.close();
        const re = await reopenEntity(dir, "restart");
        expect(re.campaign.verify()).toEqual([]);
        const opened = re.campaign.store.getFact(authKey("tx-1")) !== undefined;
        const staged = re.campaign.store.getFact(transitionKey) !== undefined;
        // the authority is always durable BEFORE the stage: never a stage without its opening
        if (staged) expect(opened).toBe(true);
        if (re.coordinator.transaction("tx-1")) seen.committed++;
        else if (staged) seen.stageNoTx++;
        else if (opened) seen.openingOnly++;
        else seen.noOpening++;
        await must(advance(re, "tx-1"));
        const head = re.campaign.store.head();
        expect(head.revision).toBe(refHead.revision); // no duplicate opening, stage or transaction anywhere
        expect(
          re.campaign.store.listFacts().filter((f) => f.key.includes("transaction-authority/")),
        ).toHaveLength(
          2, // tx-accept-1 (the entity's acceptance) and tx-1
        );
        finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
        await re.campaign.close();
      }
    }
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBe(`${refHead.state_sha256}/${refHead.journal_head_sha256}`);
    expect(seen.noOpening).toBeGreaterThan(0);
    expect(seen.openingOnly).toBeGreaterThan(0);
    expect(seen.stageNoTx).toBeGreaterThan(0);
    expect(seen.committed).toBeGreaterThan(0);
  }, 480_000);
});

describe("tampered persisted state fails closed: a stage with no lawful opening cannot be smuggled through load", () => {
  async function completed() {
    const s = await registered();
    await must(advance(s, "tx-1"));
    return s;
  }
  /** verify the kernel, entity and Production views over a copy of the committed state with edits applied */
  function drift(
    inner: CampaignStore,
    over: {
      facts?: (f: OwnerFact[]) => OwnerFact[];
      group?: (intent: string, g: CommitGroup | null) => CommitGroup | null;
    },
  ) {
    const facts = (over.facts ?? ((f) => f))(
      structuredClone([...inner.listFacts()]) as OwnerFact[],
    );
    const view: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => facts.find((f) => f.key === k),
      listFacts: () => facts,
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => (over.group ?? ((_i, g) => g))(i, inner.committedGroup(i)),
      commit: (g) => inner.commit(g),
      close: () => inner.close(),
    };
    return [...verifyTemporalIntegrity(view), ...verifyEntityTransitionIntegrity(view)]
      .map((v) => v.message)
      .join(" | ");
  }

  it("a healthy campaign verifies", async () => {
    const s = await completed();
    expect(drift(s.campaign.store, {})).toBe("");
  });
  it("a stage whose transaction authority is gone", async () => {
    const s = await completed();
    const m = drift(s.campaign.store, {
      facts: (f) => f.filter((x) => x.key !== authKey("tx-1")),
    });
    expect(m).toMatch(/durable authority of its open transaction/);
    expect(m).toMatch(/transaction with owner stages has the durable authority it opened/);
  });
  it("an authority that is not what the sealed transaction repeats", async () => {
    const s = await completed();
    for (const edit of [
      (v: any) => (v.requested.target.value = 301),
      (v: any) => (v.trigger.ref = "forged"),
      (v: any) => (v.opening.state_version = 7),
    ])
      expect(
        drift(s.campaign.store, {
          facts: (f) => {
            edit(f.find((x) => x.key === authKey("tx-1"))!.value);
            return f;
          },
        }),
      ).toMatch(/durable authority it opened|never existed/);
  });
  it("a stage whose journaled group no longer depends on any opening, or whose cause names a transaction that was never opened", async () => {
    const s = await completed();
    expect(
      drift(s.campaign.store, {
        group: (_i, g) =>
          g && g.group_id === stageGroupId(stage)
            ? { ...g, depends_on: [...g.depends_on.slice(0, -1), "wf-group-1"] }
            : g,
      }),
    ).toMatch(/did not depend on the durable authority of an opened transaction/);
    expect(
      drift(s.campaign.store, {
        group: (_i, g) =>
          g && g.group_id === stageGroupId(stage) ? { ...g, cause: "transaction:forged" } : g,
        facts: (f) => {
          f.find((x) => x.key === transitionKey)!.provenance.cause = "transaction:forged";
          return f;
        },
      }),
    ).toMatch(/durable authority of its open transaction|published only as its IM-02 stage/);
  });
  it("an authority opened after the stage it authorizes", async () => {
    const s = await completed();
    const m = drift(s.campaign.store, {
      facts: (f) => {
        // the opening now "committed" with the transaction record, i.e. after its stage
        f.find((x) => x.key === authKey("tx-1"))!.provenance.intent_id = f.find(
          (x) => x.key === "temporal/transaction/tx-1",
        )!.provenance.intent_id;
        return f;
      },
    });
    expect(m).toMatch(/committed before its transaction was opened/);
  });
});
