/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Turnless Temporal Foundation — enforcement that does not depend on the coordinator behaving.
// IM-11 admission holds for a raw `store.commit` and for a TAMPERED kernel group; load-time
// verification fails closed on every kind of temporal drift (brief §5.6: "a required temporal/
// provenance record is missing or inconsistent after reload").
// Register lineage: IA-03, IA-04 (partial), IA-06, IA-30 (partial); RC-05, RC-10, RC-16; IM-02, IM-11.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  temporalObjectKey,
  temporalTransactionKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  TemporalCoordinator,
  verifyTemporalIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  OBJECT_DORMANT,
  OBJECT_ENGAGED,
  SYNTH_EXTENSION,
  SYNTH_FACET,
  SYNTH_OWNER,
  T0,
  T1,
  TB,
  at,
  dormantObject,
  engagedObject,
  stopAtBoundaryRequest,
  syntheticProviders,
  temporalPublication,
} from "@immortalis/testkit";
import { codeOf, must, seededTemporalCampaign } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

/** A store whose kernel groups are altered on the way in, to prove IM-11 (not the coordinator) refuses them. */
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
      if (group.owner !== "temporal_kernel") return inner.commit(g);
      n += 1;
      return inner.commit(mutate(group));
    },
  };
  return { store, tampered: () => n };
}

/** A store that reports altered facts/receipts; explicit wrappers (a spread would drop prototype methods). */
function viewStore(
  inner: CampaignStore,
  over: {
    facts?: readonly OwnerFact[];
    receipt?: (id: string) => ReturnType<CampaignStore["lookupReceipt"]> | undefined;
  },
): CampaignStore {
  return {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => over.facts ?? inner.listFacts(),
    lookupReceipt: (id) => {
      const o = over.receipt?.(id);
      return o === undefined ? inner.lookupReceipt(id) : o;
    },
    committedGroup: (id) => inner.committedGroup(id),
    commit: (g) => inner.commit(g),
    close: () => inner.close(),
  };
}

const write = (g: CommitGroup, key: string) => g.writes.find((w) => w.key === key)!;
const withWrite = (g: CommitGroup, key: string, f: (v: any) => unknown): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) =>
    w.key === key ? { ...w, value: f(structuredClone(w.value)) as never } : w,
  ),
});

describe("IM-11 admission refuses unlawful kernel groups — even tampered ones (brief §4.5, §5.6)", () => {
  const cases: [string, (g: CommitGroup) => CommitGroup][] = [
    [
      "a transaction that also rewrites an unrelated (dormant) object",
      (g) => ({
        ...g,
        writes: [
          ...g.writes,
          {
            ...write(g, temporalObjectKey(OBJECT_ENGAGED)),
            key: temporalObjectKey(OBJECT_DORMANT),
            value: dormantObject() as never,
            expected_version: 1,
          },
        ],
      }),
    ],
    [
      "canonical time that is not the transaction's actual stop",
      (g) => withWrite(g, TEMPORAL_STATE_KEY, (s) => ({ ...s, canonical_time: T1 })),
    ],
    [
      "a continuation that is not the transaction's stop/remainder",
      (g) => withWrite(g, TEMPORAL_STATE_KEY, (s) => ({ ...s, continuation: null })),
    ],
    [
      "a stage group it cites but does not depend on",
      (g) => ({ ...g, depends_on: g.depends_on.slice(0, 1) }),
    ],
    [
      "a transaction that leaves its resolved boundary in the active index",
      (g) => ({
        ...g,
        writes: g.writes.filter((w) => w.key !== TEMPORAL_BOUNDARY_INDEX_KEY),
      }),
    ],
    [
      "a resolved object that keeps its earned boundary",
      (g) =>
        withWrite(g, temporalObjectKey(OBJECT_ENGAGED), (o) => ({
          ...o,
          next_boundary: { boundary_id: "boundary-engaged-1", at: TB },
        })),
    ],
    [
      "a resolved object whose declarations were rewritten",
      (g) => withWrite(g, temporalObjectKey(OBJECT_ENGAGED), (o) => ({ ...o, dependencies: [] })),
    ],
    [
      "an opening basis that is not the state it read",
      (g) =>
        withWrite(g, temporalTransactionKey("tx-1"), (t) => ({
          ...t,
          opening: { ...t.opening, state_version: 7 },
        })),
    ],
    [
      "a continuing transaction that consumes a remainder that does not exist",
      (g) => withWrite(g, temporalTransactionKey("tx-1"), (t) => ({ ...t, continues: "tx-0" })),
    ],
    [
      "a state write with no transaction (a tick)",
      (g) => ({
        ...g,
        writes: g.writes.filter((w) => w.key !== temporalTransactionKey("tx-1")),
      }),
    ],
    [
      "a transaction that does not advance the state",
      (g) => ({ ...g, writes: g.writes.filter((w) => w.key !== TEMPORAL_STATE_KEY) }),
    ],
    [
      "canonical time moving backward",
      (g) =>
        withWrite(
          withWrite(g, TEMPORAL_STATE_KEY, (s) => ({ ...s, canonical_time: at(50) })),
          temporalTransactionKey("tx-1"),
          (t) => ({
            ...t,
            outcome: { ...t.outcome, actual_stop: at(50), remainder: { from: at(50), to: T1 } },
          }),
        ),
    ],
    [
      "a rewritten authority",
      (g) => ({
        ...g,
        authority: { role: "role.player", permission: "permission.player_choice.commit" },
      }),
    ],
  ];

  it.each(cases)("%s", async (_name, mutate) => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    const tamper = tamperStore(campaign.store, mutate);
    const c = new TemporalCoordinator(tamper.store, syntheticProviders());
    const before = campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    const r = await c.advance(stopAtBoundaryRequest("tx-1"));
    expect(r.ok).toBe(false);
    expect(tamper.tampered()).toBe(1);
    // nothing of the kernel group was published: the state, object, index and transaction are as before
    expect(campaign.store.getFact(TEMPORAL_STATE_KEY)).toEqual(before);
    expect(campaign.store.getFact(temporalTransactionKey("tx-1"))).toBeUndefined();
    expect(campaign.store.getFact(temporalObjectKey(OBJECT_ENGAGED))!.version).toBe(1);
    expect(campaign.store.getFact(temporalObjectKey(OBJECT_DORMANT))!.version).toBe(1);
    expect(
      new TemporalCoordinator(campaign.store, syntheticProviders()).boundaryIndex().entries,
    ).toHaveLength(1);
    // the stage groups (independent, lawful publications) are durable and are ADOPTED on re-presentation
    const honest = new TemporalCoordinator(campaign.store, syntheticProviders());
    const again = await must(honest.advance(stopAtBoundaryRequest("tx-1")));
    expect(again.adopted).toHaveLength(2);
    expect(again.recomputed_in_place).toEqual([]);
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("the index may lose only the resolved boundaries of engaged objects", async () => {
    const later = dormantObject({
      object_id: "obj-later",
      next_boundary: { boundary_id: "boundary-later", at: at(900) },
    });
    const { campaign } = await seededTemporalCampaign(tempDir(), {
      objects: [engagedObject(), later],
    });
    const tamper = tamperStore(campaign.store, (g) =>
      withWrite(g, TEMPORAL_BOUNDARY_INDEX_KEY, () => ({ entries: [] })),
    );
    const c = new TemporalCoordinator(tamper.store, syntheticProviders());
    const r = await c.advance(stopAtBoundaryRequest("tx-1"));
    expect(r.ok).toBe(false);
    expect(
      new TemporalCoordinator(campaign.store, syntheticProviders()).boundaryIndex().entries,
    ).toHaveLength(2);
    await campaign.close();
  });
});

describe("the kernel's key spaces are exclusive, for a raw store.commit as much as for the coordinator", () => {
  const raw = (over: Partial<CommitGroup>): CommitGroup => ({
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: "raw-group",
    intent_id: "raw-intent",
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    cause: "raw-cause",
    rule: {
      artifact: "a",
      native_pin: "p",
      clause: "c",
      authority_lineage: ["l"],
      effective_basis: "b",
      supersedes: null,
    },
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [],
    ...over,
  });
  const w = (key: string, value: unknown, over: object = {}) => ({
    key,
    owner: "temporal_kernel",
    facet: "temporal_coordination",
    value: value as never,
    unit: null,
    basis: "b",
    secrecy: "s",
    expected_version: 0,
    ...over,
  });

  it("canonical time cannot be established twice, advanced alone, or replaced", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    const state = { canonical_time: at(500), last_transaction: null, continuation: null };
    // a second establishment over the existing basis
    expect(
      await codeOf(campaign.store.commit(raw({ writes: [w(TEMPORAL_STATE_KEY, state)] }))),
    ).toBe("VERSION_CONFLICT");
    // an advance that is not inside a transaction is a tick, and there is none
    const tick = await campaign.store.commit(
      raw({
        writes: [
          w(TEMPORAL_STATE_KEY, { ...state, canonical_time: at(500) }, { expected_version: 1 }),
        ],
        reads: [{ key: TEMPORAL_STATE_KEY, version: 1 }],
        depends_on: [campaign.store.getFact(TEMPORAL_STATE_KEY)!.provenance.group_id],
      }),
    );
    expect(!tick.ok && tick.error.code).toBe("REFERENCE_INVALID");
    expect(campaign.store.getFact(TEMPORAL_STATE_KEY)!.value).toMatchObject({ canonical_time: T0 });
    await campaign.close();
  });

  it("the initial basis is established alone and carries no transaction or continuation", async () => {
    const dir = tempDir();
    const c = await must(
      CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, extension: SYNTH_EXTENSION }),
    );
    const bad = { canonical_time: T0, last_transaction: "tx-9", continuation: null };
    expect(await codeOf(c.store.commit(raw({ writes: [w(TEMPORAL_STATE_KEY, bad)] })))).toBe(
      "VALUE_INVALID",
    );
    expect(
      await codeOf(
        c.store.commit(
          raw({
            writes: [
              w(TEMPORAL_STATE_KEY, {
                canonical_time: T0,
                last_transaction: null,
                continuation: null,
              }),
              w(TEMPORAL_BOUNDARY_INDEX_KEY, { entries: [] }),
            ],
          }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    await c.close();
  });

  it("an object registers only against an established basis, and never already behind it", async () => {
    const dir = tempDir();
    const c = await must(
      CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, extension: SYNTH_EXTENSION }),
    );
    const co = new TemporalCoordinator(c.store, syntheticProviders());
    // no canonical temporal basis yet
    expect(
      await codeOf(co.registerObject({ ...temporalPublication(2), object: engagedObject() })),
    ).toBe("TEMPORAL_STATE_ABSENT");
    await must(co.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
    // an earned boundary that is not after the canonical time would be retroactive
    const retro = engagedObject({
      last_resolved_basis: at(50),
      next_boundary: { boundary_id: "b", at: T0 },
    });
    expect(await codeOf(co.registerObject({ ...temporalPublication(2), object: retro }))).toBe(
      "REFERENCE_INVALID",
    );
    // an object already resolved past the canonical time is from the future
    const future = engagedObject({
      last_resolved_basis: at(120),
      next_boundary: { boundary_id: "b", at: at(150) },
    });
    expect(await codeOf(co.registerObject({ ...temporalPublication(3), object: future }))).toBe(
      "REFERENCE_INVALID",
    );
    // a malformed object never reaches the store
    expect(
      await codeOf(
        co.registerObject({
          ...temporalPublication(4),
          object: { ...engagedObject(), partition: { class: "APPROXIMATE-PARTITION" } },
        }),
      ),
    ).toBe("INPUT_INVALID");
    expect(c.store.head().revision).toBe(1); // only the basis
    await c.close();
  });

  it("an object cannot be advanced, nor a transaction overwritten, outside the coordinator's transaction", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    await must(
      new TemporalCoordinator(campaign.store, syntheticProviders()).advance(
        stopAtBoundaryRequest("tx-1"),
      ),
    );
    const stateFact = campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    const pins = {
      reads: [{ key: TEMPORAL_STATE_KEY, version: stateFact.version }],
      depends_on: [stateFact.provenance.group_id],
    };
    const obj = campaign.store.getFact(temporalObjectKey(OBJECT_ENGAGED))!;
    expect(
      await codeOf(
        campaign.store.commit(
          raw({ ...pins, writes: [w(obj.key, obj.value, { expected_version: obj.version })] }),
        ),
      ),
    ).toBe("AMENDMENT_NOT_SUPPORTED");
    const tx = campaign.store.getFact(temporalTransactionKey("tx-1"))!;
    expect(
      await codeOf(
        campaign.store.commit(
          raw({ ...pins, writes: [w(tx.key, tx.value, { expected_version: 1 })] }),
        ),
      ),
    ).toBe("AMENDMENT_NOT_SUPPORTED"); // sealed
    await campaign.close();
  });

  it("an object's earned boundary and the active index must agree at publication", async () => {
    const dir = tempDir();
    const c = await must(
      CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, extension: SYNTH_EXTENSION }),
    );
    const co = new TemporalCoordinator(c.store, syntheticProviders());
    await must(co.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
    const st = c.store.getFact(TEMPORAL_STATE_KEY)!;
    const pins = {
      reads: [{ key: TEMPORAL_STATE_KEY, version: 1 }],
      depends_on: [st.provenance.group_id],
    };
    const o = engagedObject();
    // an earned boundary missing from the index
    expect(
      await codeOf(
        c.store.commit(raw({ ...pins, writes: [w(temporalObjectKey(o.object_id), o)] })),
      ),
    ).toBe("REFERENCE_INVALID");
    // an index entry that is not an object's earned boundary
    const entry = { object_id: o.object_id, boundary_id: "boundary-engaged-1", at: TB };
    expect(
      await codeOf(
        c.store.commit(
          raw({ ...pins, writes: [w(TEMPORAL_BOUNDARY_INDEX_KEY, { entries: [entry] })] }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    // a boundary time that disagrees with the object's
    expect(
      await codeOf(
        c.store.commit(
          raw({
            ...pins,
            writes: [
              w(temporalObjectKey(o.object_id), o),
              w(TEMPORAL_BOUNDARY_INDEX_KEY, { entries: [{ ...entry, at: at(141) }] }),
            ],
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    // the lawful registration through the coordinator succeeds
    await must(co.registerObject({ ...temporalPublication(2), object: o }));
    await c.close();
  });

  it("the kernel owns no substantive fact, and no other owner may write kernel or canonical key spaces", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    // the kernel writing a world fact
    expect(await codeOf(campaign.store.commit(raw({ writes: [w("world/w-x/profile", {})] })))).toBe(
      "KEY_NOT_ADMITTED",
    );
    // the kernel writing a synthetic owner fact
    expect(await codeOf(campaign.store.commit(raw({ writes: [w("synthetic/x", 1)] })))).toBe(
      "KEY_NOT_ADMITTED",
    );
    // an extension owner writing kernel and canonical key spaces
    const ext = (key: string) =>
      raw({
        owner: SYNTH_OWNER,
        facet: SYNTH_FACET,
        writes: [w(key, {}, { owner: SYNTH_OWNER, facet: SYNTH_FACET })],
      });
    // (a key that already exists under its owner is refused one step earlier, by the core)
    expect(await codeOf(campaign.store.commit(ext(temporalTransactionKey("forged"))))).toBe(
      "KEY_NOT_ADMITTED",
    );
    expect(await codeOf(campaign.store.commit(ext("world/w-x/profile")))).toBe("KEY_NOT_ADMITTED");
    for (const existing of [TEMPORAL_STATE_KEY, PLAYER_CHARACTER_BINDING_KEY]) {
      expect(await codeOf(campaign.store.commit(ext(existing)))).toBe("FACT_OWNER_CONFLICT");
    }
    // the existing world/PC facts are still the ones their owners wrote
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("an extension cannot reuse a canonical or kernel owner, and registers no role or permission", async () => {
    for (const owner of ["temporal_kernel", "world_state", "pc_existence", "role_registry"]) {
      const r = await CanonicalCampaign.create(tempDir(), {
        campaignId: FIXTURE_CAMPAIGN,
        extension: { owners: new Map([[owner, new Set(["x"])]]) },
      });
      expect(!r.ok && r.error.code).toBe("EXTENSION_INVALID");
    }
    const empty = await CanonicalCampaign.create(tempDir(), {
      campaignId: FIXTURE_CAMPAIGN,
      extension: { owners: new Map([["some-owner", new Set<string>()]]) },
    });
    expect(!empty.ok && empty.error.code).toBe("EXTENSION_INVALID");
  });
});

describe("load-time verification fails closed on every kind of temporal drift (brief §5.6)", () => {
  /** A store view of a healthy campaign with one mutation applied to what it reports. */
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    receipts: (id: string) => ReturnType<CampaignStore["lookupReceipt"]> = () => undefined as never,
  ) {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const inner = campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
    const view = viewStore(inner, { facts, receipt: receipts });
    const out = verifyTemporalIntegrity(view);
    await campaign.close();
    return out;
  }
  const edit =
    (key: string, f: (v: any) => void, version?: (n: number) => number) => (facts: OwnerFact[]) => {
      const fact = facts.find((x) => x.key === key)!;
      const value = fact.value as any;
      f(value);
      if (version) (fact as any).version = version(fact.version);
      return facts;
    };
  const codes = (v: readonly { code: string }[]) => [...new Set(v.map((x) => x.code))];

  it("a healthy campaign verifies", async () => {
    expect(await drifted((f) => f)).toEqual([]);
  });
  it("temporal facts without a canonical basis", async () => {
    expect(codes(await drifted((f) => f.filter((x) => x.key !== TEMPORAL_STATE_KEY)))).toEqual([
      "TEMPORAL_STATE",
    ]);
  });
  it("canonical time that is not the last transaction's stop", async () => {
    expect(
      codes(
        await drifted(
          edit(TEMPORAL_STATE_KEY, (v) => (v.canonical_time = { ...v.canonical_time, value: 141 })),
        ),
      ),
    ).toEqual(["TEMPORAL_STATE"]);
  });
  it("a continuation that is not the last transaction's remainder", async () => {
    expect(codes(await drifted(edit(TEMPORAL_STATE_KEY, (v) => (v.continuation = null))))).toEqual([
      "TEMPORAL_STATE",
    ]);
  });
  it("a state that moved without a transaction (a hidden tick)", async () => {
    expect(
      codes(
        await drifted(
          edit(
            TEMPORAL_STATE_KEY,
            () => undefined,
            (n) => n + 1,
          ),
        ),
      ),
    ).toEqual(["TEMPORAL_STATE"]);
  });
  it("a state that names a different last transaction", async () => {
    expect(
      codes(
        await drifted(
          edit(TEMPORAL_STATE_KEY, (v) => {
            v.last_transaction = "tx-other";
            v.continuation = { ...v.continuation, from_transaction: "tx-other" };
          }),
        ),
      ),
    ).toContain("TEMPORAL_STATE");
  });
  it("a stage evidence reference that differs from the journal's receipt", async () => {
    const v = await drifted(
      edit(temporalTransactionKey("tx-1"), (t) => (t.stages[0].group_sha256 = "f".repeat(64))),
    );
    expect(codes(v)).toEqual(["TEMPORAL_EVIDENCE"]);
  });
  it("realized reads that differ from the journaled group", async () => {
    const v = await drifted(
      edit(temporalTransactionKey("tx-1"), (t) => (t.stages[0].reads[1].source_basis.version = 9)),
    );
    expect(codes(v)).toEqual(["TEMPORAL_EVIDENCE"]);
  });
  it("a stage not committed under the identity derived from its StageKey", async () => {
    const v = await drifted(
      edit(
        temporalTransactionKey("tx-1"),
        (t) => (t.stages[1].stage.prospective_result_id = "renamed"),
      ),
    );
    expect(codes(v)).toEqual(["TEMPORAL_EVIDENCE"]);
  });
  it("a cited stage group with no receipt in the journal", async () => {
    const v = await drifted(
      (f) => f,
      (id) => (id.startsWith("stage-intent:") ? null : (undefined as never)),
    );
    expect(codes(v)).toEqual(["TEMPORAL_EVIDENCE"]);
  });
  it("recorded deltas that differ from the journaled group", async () => {
    const v = await drifted(
      edit(temporalTransactionKey("tx-1"), (t) => (t.stages[0].writes[0].version = 4)),
    );
    expect(codes(v)).toEqual(["TEMPORAL_EVIDENCE"]);
  });
  it("a transaction that does not open where the previous one stopped", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    await must(
      coordinator.continueRemainder({
        transaction_id: "tx-2",
        cause: "c",
        trigger: { kind: "k", ref: "r" },
        context: { role: "role.player", permission: "permission.player_choice.commit" },
        publication: { basis: "b", secrecy: "s" },
      }),
    );
    const facts = structuredClone([...campaign.store.listFacts()]) as OwnerFact[];
    const tx2 = facts.find((f) => f.key === temporalTransactionKey("tx-2"))!.value as any;
    tx2.opening.basis_time.value = 120;
    const view = viewStore(campaign.store, { facts });
    expect(codes(verifyTemporalIntegrity(view))).toEqual(["TEMPORAL_TRANSACTION"]);
    await campaign.close();
  });
  it("a boundary retired by a transaction that reappears in the active index", async () => {
    const v = await drifted((f) => {
      const idx = f.find((x) => x.key === TEMPORAL_BOUNDARY_INDEX_KEY);
      const entry = { object_id: OBJECT_ENGAGED, boundary_id: "boundary-engaged-1", at: TB };
      if (idx) (idx.value as any).entries = [entry];
      return f;
    });
    expect(codes(v)).toEqual(["TEMPORAL_INDEX"]);
  });
  it("an object whose earned boundary is missing from the index", async () => {
    const v = await drifted(
      edit(
        temporalObjectKey(OBJECT_DORMANT),
        (o) => (o.next_boundary = { boundary_id: "b", at: at(300) }),
      ),
    );
    expect(codes(v)).toEqual(["TEMPORAL_INDEX"]);
  });
  it("an object resolved past the canonical time", async () => {
    const v = await drifted(
      edit(temporalObjectKey(OBJECT_DORMANT), (o) => (o.last_resolved_basis = at(900))),
    );
    expect(codes(v)).toEqual(["TEMPORAL_STATE"]);
  });
  it("an engaged object that is missing or older than the transaction that engaged it", async () => {
    const v = await drifted((f) => f.filter((x) => x.key !== temporalObjectKey(OBJECT_ENGAGED)));
    expect(codes(v)).toContain("TEMPORAL_EVIDENCE");
  });
  it("a corrupted value does not crash verification (it is reported by canonical integrity)", async () => {
    const v = await drifted(edit(TEMPORAL_STATE_KEY, (s) => (s.tick = 1)));
    expect(v).toEqual([]);
  });
  it("a campaign opened WITHOUT the owner extension that wrote its facts is not a canonical campaign of this build", async () => {
    const dir = tempDir();
    const { campaign, coordinator } = await seededTemporalCampaign(dir);
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    await campaign.close();
    const r = await CanonicalCampaign.open(dir, {});
    expect(!r.ok && r.error.code).toBe("CANON_INTEGRITY");
  });
});
