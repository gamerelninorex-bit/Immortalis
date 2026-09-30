/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Repairs for the Blue exact-SHA review of PR #4 (head 42526f8, MODIFY). One block per finding.
//   1. canonical time cannot bypass an active earned boundary through a raw/tampered kernel commit;
//      CONDITION_SATISFIED is proved by the exact requested boundary crossing
//   2. RC-05 `engaged` keeps every causally engaged object, distinguishing RETIRED from STILL_ACTIVE
//   3. a held continuation cannot be silently abandoned (coordinator AND raw kernel admission)
//   4. same-transaction replay includes the immutable publication metadata
// Register lineage: IA-04 (partial), IA-06; RC-05, RC-10, RC-16; IM-02, IM-11. No status change.
import { describe, expect, it } from "vitest";
import {
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  temporalObjectKey,
  temporalTransactionKey,
  type CommitGroup,
  type OwnerFact,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  TemporalCoordinator,
  verifyCanonicalIntegrity,
  verifyTemporalIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  BOUNDARY_ID,
  FIXTURE_CAMPAIGN,
  OBJECT_ENGAGED,
  PRODUCER_STAGE,
  SYNTH_OP_INDEPENDENT,
  SYNTH_OWNER,
  SYNTH_PRODUCER_RESULT_KEY,
  T0,
  T1,
  TB,
  at,
  closeBasis,
  continuationInput,
  dormantObject,
  engagedObject,
  stopAtBoundaryRequest,
  syntheticProviders,
  syntheticSourceGroup,
} from "@immortalis/testkit";
import { codeOf, must, reopen, seededTemporalCampaign } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

// -- helpers ---------------------------------------------------------------------------------------

const [P, C] = engagedObject().dependencies;
/** A consumer whose CLOSE read names a close the producer does not declare: unresolved. */
const badConsumer = {
  ...C!,
  reads: [{ ...C!.reads[0]!, close_basis: closeBasis("undeclared-close") }],
} as typeof C;
/** The engaged object with one unresolved stage (the producer still resolves). */
const unresolvedObject = (over: Partial<TemporalObject> = {}) =>
  engagedObject({ dependencies: [P!, badConsumer!], ...over });
/** A second object with one independent, lawful stage, earned at `when`. */
const second = (id: string, when: number): TemporalObject =>
  dormantObject({
    object_id: id,
    owning_ref: { owner: SYNTH_OWNER, process_id: `proc-${id}` },
    next_boundary: { boundary_id: `boundary-${id}`, at: at(when) },
    dependencies: [
      {
        stage: {
          causal_process_id: `proc-${id}`,
          owner_operation: { owner: SYNTH_OWNER, operation: SYNTH_OP_INDEPENDENT },
          prospective_result_id: `result-${id}`,
        },
        reads: [],
        produces: [`synthetic/second/${id}`],
        declares_close: null,
      },
    ],
    invalidators: [],
  });
const toTarget = (id: string, target = T1) =>
  stopAtBoundaryRequest(id, { requested: { target, condition: null } });
const conditionOnly = (id: string) =>
  stopAtBoundaryRequest(id, {
    requested: {
      target: null,
      condition: {
        kind: "STOP_AFTER_BOUNDARY",
        object_id: OBJECT_ENGAGED,
        boundary_id: BOUNDARY_ID,
      },
    },
  });
const TX1 = temporalTransactionKey("tx-1");
const OBJ = temporalObjectKey(OBJECT_ENGAGED);

/** A store whose kernel group is altered on the way in: IM-11, not the coordinator, must refuse it. */
function tamper(inner: CampaignStore, mutate: (g: CommitGroup) => CommitGroup) {
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
const edit = (g: CommitGroup, key: string, f: (v: any) => void): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) => {
    if (w.key !== key) return w;
    const value = structuredClone(w.value) as any;
    f(value);
    return { ...w, value };
  }),
});
const without = (g: CommitGroup, ...keys: string[]): CommitGroup => ({
  ...g,
  writes: g.writes.filter((w) => !keys.includes(w.key)),
});

/** Runs `advance` through a tampering store and returns the refusal, asserting nothing was published. */
async function refused(
  campaign: Awaited<ReturnType<typeof seededTemporalCampaign>>["campaign"],
  request: unknown,
  mutate: (g: CommitGroup) => CommitGroup,
) {
  const t = tamper(campaign.store, mutate);
  const c = new TemporalCoordinator(t.store, syntheticProviders());
  const before = campaign.store.getFact(TEMPORAL_STATE_KEY)!;
  const r = await c.advance(request);
  expect(t.tampered()).toBe(1);
  expect(r.ok).toBe(false);
  // the kernel group published nothing: state, transaction and index are as before
  expect(campaign.store.getFact(TEMPORAL_STATE_KEY)).toEqual(before);
  const id = (request as { transaction_id: string }).transaction_id;
  expect(campaign.store.getFact(temporalTransactionKey(id))).toBeUndefined();
  return r.ok ? null : r.error;
}

/** A store view that reports altered facts, for load-time verification (explicit wrappers). */
function view(inner: CampaignStore, facts: readonly OwnerFact[]): CampaignStore {
  return {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => facts,
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    commit: (g) => inner.commit(g),
    close: () => inner.close(),
  };
}
const cloneFacts = (s: CampaignStore) => structuredClone([...s.listFacts()]) as OwnerFact[];
const codes = (v: readonly { code: string }[]) => [...new Set(v.map((x) => x.code))];

// ==========================================================================================
// Finding 1
// ==========================================================================================

describe("Finding 1 — canonical time cannot bypass an active earned boundary (IM-11, not the coordinator)", () => {
  it("a raw/tampered transaction that skips a boundary strictly before its stop is refused", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    // the honest request would resolve the boundary at Tb=140 on the way to 200; the tampered group
    // records a transaction that never engaged it and moves time to the target anyway
    const error = await refused(campaign, toTarget("tx-1"), (g) => {
      let h = without(g, OBJ, TEMPORAL_BOUNDARY_INDEX_KEY);
      h = edit(h, TX1, (t) => {
        t.engaged = [];
        t.boundaries_crossed = [];
        t.stages = [];
      });
      return { ...h, depends_on: h.depends_on.slice(0, 1) };
    });
    expect(error?.code).toBe("REFERENCE_INVALID");
    expect(error?.message).toContain("may not pass an active earned boundary");
    // the honest coordinator, re-presented, resolves it (stage groups are adopted, nothing is lost)
    const honest = new TemporalCoordinator(campaign.store, syntheticProviders());
    const again = await must(honest.advance(toTarget("tx-1")));
    expect(again.transaction.boundaries_crossed.map((b) => b.boundary_id)).toEqual([BOUNDARY_ID]);
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("a successful stop may not leave a due boundary AT the stop either (target coincides with the boundary)", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    const error = await refused(campaign, toTarget("tx-1", TB), (g) => {
      let h = without(g, OBJ, TEMPORAL_BOUNDARY_INDEX_KEY);
      h = edit(h, TX1, (t) => {
        t.engaged = [];
        t.boundaries_crossed = [];
        t.stages = [];
      });
      return { ...h, depends_on: h.depends_on.slice(0, 1) };
    });
    expect(error?.code).toBe("REFERENCE_INVALID");
    expect(error?.message).toContain("must be resolved");
    await campaign.close();
  });

  it("the same bypass is refused with several boundaries: a later boundary left active before the stop", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir(), {
      objects: [engagedObject(), second("obj-second", 160)],
    });
    // honest: retires both. Tampered: retires only the first and leaves 160 active while time goes to 200.
    const error = await refused(campaign, toTarget("tx-1"), (g) => {
      const secondKey = temporalObjectKey("obj-second");
      let h = without(g, secondKey);
      h = edit(h, TX1, (t) => {
        t.engaged = t.engaged.filter((e: any) => e.object_id !== "obj-second");
        t.boundaries_crossed = t.boundaries_crossed.filter(
          (b: any) => b.object_id !== "obj-second",
        );
        t.stages = t.stages.filter(
          (s: any) => s.stage.prospective_result_id !== "result-obj-second",
        );
      });
      h = edit(h, TEMPORAL_BOUNDARY_INDEX_KEY, (idx) => {
        idx.entries = [
          { object_id: "obj-second", boundary_id: "boundary-obj-second", at: at(160) },
        ];
      });
      return h;
    });
    expect(error?.code).toBe("REFERENCE_INVALID");
    expect(error?.message).toContain("may not pass an active earned boundary");
    await campaign.close();
  });

  it("CONDITION_SATISFIED needs the exact requested boundary crossed by THIS transaction", async () => {
    const { campaign } = await seededTemporalCampaign(tempDir());
    // claim the condition was satisfied while the requested boundary was not crossed
    const error = await refused(campaign, stopAtBoundaryRequest("tx-1"), (g) => {
      let h = without(g, OBJ, TEMPORAL_BOUNDARY_INDEX_KEY);
      h = edit(h, TX1, (t) => {
        t.engaged = [];
        t.boundaries_crossed = [];
        t.stages = [];
      });
      return { ...h, depends_on: h.depends_on.slice(0, 1) };
    });
    expect(error?.code).toBe("VALUE_INVALID"); // the record itself is not a valid CONDITION_SATISFIED stop
    // claim it with a DIFFERENT boundary than the one requested
    const other = await refused(campaign, stopAtBoundaryRequest("tx-2"), (g) =>
      edit(g, temporalTransactionKey("tx-2"), (t) => {
        t.boundaries_crossed[0].boundary_id = "a-boundary-nobody-requested";
      }),
    );
    expect(other?.code).toBe("VALUE_INVALID");
    await campaign.close();
  });

  it("DEPENDENCY_UNRESOLVED lawfully leaves the blocked boundary active at the stop basis — and nothing retires it", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [unresolvedObject()],
    });
    const before = campaign.store.getFact(OBJ)!;
    const r = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.actual_stop).toEqual(TB);
    // the unresolved object and its earned boundary are untouched and still indexed at the stop
    expect(campaign.store.getFact(OBJ)).toEqual(before);
    expect(coordinator.boundaryIndex().entries).toEqual([
      { object_id: OBJECT_ENGAGED, boundary_id: BOUNDARY_ID, at: TB },
    ]);
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("an unresolved stop cannot retire, drop or outrun the unresolved work (tampered groups)", async () => {
    const make = () => seededTemporalCampaign(tempDir(), { objects: [unresolvedObject()] });
    // (a) retire the unresolved boundary although the work did not resolve: write the object as resolved
    {
      const { campaign } = await make();
      const error = await refused(campaign, stopAtBoundaryRequest("tx-1"), (g) => {
        const o = campaign.store.getFact(OBJ)!;
        const resolved = { ...(o.value as any), next_boundary: null, last_resolved_basis: TB };
        return {
          ...g,
          writes: [
            ...g.writes.filter((w) => w.key !== TEMPORAL_BOUNDARY_INDEX_KEY),
            { ...g.writes[0]!, key: OBJ, value: resolved, expected_version: o.version },
            {
              ...g.writes[0]!,
              key: TEMPORAL_BOUNDARY_INDEX_KEY,
              value: { entries: [] },
              expected_version: campaign.store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)!.version,
            },
          ],
        };
      });
      expect(error?.code).toBe("REFERENCE_INVALID");
      await campaign.close();
    }
    // (b) drop the unresolved boundary from the index
    {
      const { campaign } = await make();
      const error = await refused(campaign, stopAtBoundaryRequest("tx-1"), (g) => ({
        ...g,
        writes: [
          ...g.writes,
          {
            ...g.writes[0]!,
            key: TEMPORAL_BOUNDARY_INDEX_KEY,
            value: { entries: [] },
            expected_version: campaign.store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)!.version,
          },
        ],
      }));
      expect(error?.code).toBe("REFERENCE_INVALID");
      await campaign.close();
    }
    // (c) outrun it: canonical time moves past the still-active boundary
    {
      const { campaign } = await make();
      const error = await refused(campaign, stopAtBoundaryRequest("tx-1"), (g) => {
        let h = edit(g, TEMPORAL_STATE_KEY, (s) => {
          s.canonical_time = at(180);
        });
        h = edit(h, TX1, (t) => {
          t.outcome.actual_stop = at(180);
          t.outcome.remainder = { from: at(180), to: T1 };
        });
        return h;
      });
      expect(error?.code).toBe("REFERENCE_INVALID");
      await campaign.close();
    }
  });

  describe("load-time verification fails closed on the same cases", () => {
    const healthy = async () => {
      const s = await seededTemporalCampaign(tempDir());
      await must(s.coordinator.advance(stopAtBoundaryRequest("tx-1")));
      return s;
    };
    it("an active boundary strictly before canonical time", async () => {
      const { campaign } = await healthy();
      const facts = cloneFacts(campaign.store);
      const obj = facts.find((f) => f.key === temporalObjectKey("obj-dormant"))!;
      (obj.value as any).next_boundary = { boundary_id: "b-old", at: at(120) };
      facts.find((f) => f.key === TEMPORAL_BOUNDARY_INDEX_KEY)!.value = {
        entries: [{ object_id: "obj-dormant", boundary_id: "b-old", at: at(120) }],
      };
      expect(codes(verifyTemporalIntegrity(view(campaign.store, facts)))).toEqual([
        "TEMPORAL_INDEX",
      ]);
      await campaign.close();
    });
    it("an active boundary at canonical time after a SUCCESSFUL stop", async () => {
      const { campaign } = await healthy();
      const facts = cloneFacts(campaign.store);
      const obj = facts.find((f) => f.key === temporalObjectKey("obj-dormant"))!;
      (obj.value as any).next_boundary = { boundary_id: "b-now", at: TB };
      facts.find((f) => f.key === TEMPORAL_BOUNDARY_INDEX_KEY)!.value = {
        entries: [{ object_id: "obj-dormant", boundary_id: "b-now", at: TB }],
      };
      expect(codes(verifyTemporalIntegrity(view(campaign.store, facts)))).toEqual([
        "TEMPORAL_INDEX",
      ]);
      await campaign.close();
    });
    it("an unresolved stop may leave ITS still-active object at the stop, but no other object", async () => {
      const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
        objects: [unresolvedObject(), second("obj-other", 500)],
      });
      await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
      expect(campaign.verify()).toEqual([]); // the lawful unresolved case verifies
      const facts = cloneFacts(campaign.store);
      const other = facts.find((f) => f.key === temporalObjectKey("obj-other"))!;
      (other.value as any).next_boundary = { boundary_id: "boundary-obj-other", at: TB };
      facts.find((f) => f.key === TEMPORAL_BOUNDARY_INDEX_KEY)!.value = {
        entries: [
          { object_id: OBJECT_ENGAGED, boundary_id: BOUNDARY_ID, at: TB },
          { object_id: "obj-other", boundary_id: "boundary-obj-other", at: TB },
        ],
      };
      expect(codes(verifyTemporalIntegrity(view(campaign.store, facts)))).toEqual([
        "TEMPORAL_INDEX",
      ]);
      await campaign.close();
    });
    it("a stored CONDITION_SATISFIED record whose requested boundary was not crossed is not a valid record", async () => {
      const { campaign, coordinator } = await healthy();
      const facts = cloneFacts(campaign.store);
      const tx = facts.find((f) => f.key === TX1)!;
      (tx.value as any).boundaries_crossed[0].boundary_id = "someone-elses-boundary";
      const v = view(campaign.store, facts);
      expect(() => verifyTemporalIntegrity(v)).not.toThrow(); // fails closed, never crashes
      expect(verifyCanonicalIntegrity(v).map((x) => [x.key, x.code])).toContainEqual([
        TX1,
        "VALUE_INVALID",
      ]);
      void coordinator;
      await campaign.close();
    });
  });
});

// ==========================================================================================
// Finding 2
// ==========================================================================================

describe("Finding 2 — RC-05 engaged references survive an unresolved stop", () => {
  it("an unresolved dependent transaction still represents the causally engaged object, untouched", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [unresolvedObject()],
    });
    const before = campaign.store.getFact(OBJ)!;
    const r = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const t = r.transaction;
    expect(t.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(t.outcome.unresolved_dependents).toHaveLength(1);
    // the object is engaged (RC-05) and is explicitly STILL_ACTIVE: no version_after, nothing crossed
    expect(t.engaged).toEqual([
      {
        boundary: "STILL_ACTIVE",
        object_id: OBJECT_ENGAGED,
        fact_key: OBJ,
        version_before: before.version,
      },
    ]);
    expect(t.boundaries_crossed).toEqual([]);
    // its committed producer stage is part of the evidence; the unresolved consumer is not credited
    expect(t.stages.map((s) => s.stage.prospective_result_id)).toEqual(["producer-result-1"]);
    // recording that it was engaged did not mutate or retire the TemporalObject
    expect(campaign.store.getFact(OBJ)).toEqual(before);
    expect(coordinator.object(OBJECT_ENGAGED)!.value.next_boundary).toMatchObject({ at: TB });
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("the engaged evidence survives save, close and load", async () => {
    const dir = tempDir();
    const a = await seededTemporalCampaign(dir, { objects: [unresolvedObject()] });
    const r = await must(a.coordinator.advance(stopAtBoundaryRequest("tx-1")));
    await a.campaign.close();
    const b = await reopen(dir);
    expect(b.coordinator.transaction("tx-1")!.value.engaged).toEqual(r.transaction.engaged);
    expect(b.campaign.verify()).toEqual([]);
    await b.campaign.close();
  });

  it("a mixed transaction records both objects, mutating only the retired one", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [unresolvedObject(), second("obj-second", TB.value)],
    });
    const blockedBefore = campaign.store.getFact(OBJ)!;
    const secondBefore = campaign.store.getFact(temporalObjectKey("obj-second"))!;
    const r = await must(coordinator.advance(toTarget("tx-1")));
    const t = r.transaction;
    expect(t.engaged).toEqual([
      { boundary: "STILL_ACTIVE", object_id: OBJECT_ENGAGED, fact_key: OBJ, version_before: 1 },
      {
        boundary: "RETIRED",
        object_id: "obj-second",
        fact_key: temporalObjectKey("obj-second"),
        version_before: 1,
        version_after: 2,
      },
    ]);
    expect(t.boundaries_crossed.map((b) => b.object_id)).toEqual(["obj-second"]);
    expect(campaign.store.getFact(OBJ)).toEqual(blockedBefore); // not mutated
    expect(campaign.store.getFact(temporalObjectKey("obj-second"))!.version).toBe(
      secondBefore.version + 1,
    );
    expect(coordinator.boundaryIndex().entries.map((e) => e.object_id)).toEqual([OBJECT_ENGAGED]);
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
  });

  it("IM-11 refuses a tampered record that mutates, relabels or omits the engaged unresolved object", async () => {
    const make = () => seededTemporalCampaign(tempDir(), { objects: [unresolvedObject()] });
    // (a) mutate the unresolved object "to record that it was engaged"
    {
      const { campaign } = await make();
      const o = campaign.store.getFact(OBJ)!;
      const error = await refused(campaign, stopAtBoundaryRequest("tx-1"), (g) => ({
        ...g,
        writes: [
          ...g.writes,
          { ...g.writes[0]!, key: OBJ, value: o.value, expected_version: o.version },
        ],
      }));
      expect(error?.code).toBe("REFERENCE_INVALID");
      expect(error?.message).toContain("objects written");
      await campaign.close();
    }
    // (b) relabel it RETIRED without retiring it
    {
      const { campaign } = await make();
      const error = await refused(campaign, stopAtBoundaryRequest("tx-1"), (g) =>
        edit(g, TX1, (t) => {
          const e = t.engaged[0];
          e.boundary = "RETIRED";
          e.version_after = e.version_before + 1;
        }),
      );
      expect(error).not.toBeNull(); // schema (crossing/stop coherence) or admission, but never published
      await campaign.close();
    }
    // (c) omit it from the evidence while still reporting its unresolved stage
    {
      const { campaign } = await make();
      const error = await refused(campaign, stopAtBoundaryRequest("tx-1"), (g) =>
        edit(g, TX1, (t) => {
          t.engaged = [];
        }),
      );
      expect(error).not.toBeNull();
      await campaign.close();
    }
    // (d) claim the unresolved dependent belongs to no engaged object (a stranger's stage)
    {
      const { campaign } = await make();
      const error = await refused(campaign, stopAtBoundaryRequest("tx-1"), (g) =>
        edit(g, TX1, (t) => {
          t.outcome.unresolved_dependents[0].stage.prospective_result_id =
            "a-stage-nobody-declared";
        }),
      );
      expect(error?.code).toBe("REFERENCE_INVALID");
      await campaign.close();
    }
  });
});

// ==========================================================================================
// Finding 3
// ==========================================================================================

describe("Finding 3 — a held continuation cannot be silently abandoned", () => {
  it("held remainder + continues:null fails closed, whatever the target or condition, and commits nothing", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1"))); // holds a remainder toward T1
    const entries = campaign.store.head().journal_entries;
    const state = campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    for (const requested of [
      { target: at(300), condition: null }, // a further horizon
      { target: T1, condition: null }, // the very same remainder, but not declared as continuing
      { target: at(150), condition: null }, // a nearer horizon
    ]) {
      const r = await coordinator.advance(stopAtBoundaryRequest("tx-x", { requested }));
      expect(!r.ok && r.error.code).toBe("CONTINUATION_HELD");
    }
    expect(campaign.store.head().journal_entries).toBe(entries);
    expect(campaign.store.getFact(TEMPORAL_STATE_KEY)).toEqual(state);
    expect(coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: "tx-1",
      toward: T1,
    });
    await campaign.close();
  });

  it("a held unresolved-dependency continuation (with and without a remainder) also fails closed", async () => {
    // (a) unresolved with a remainder toward the target
    const a = await seededTemporalCampaign(tempDir(), { objects: [unresolvedObject()] });
    await must(a.coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(a.coordinator.state()!.value.continuation).toMatchObject({ toward: T1 });
    expect(await codeOf(a.coordinator.advance(toTarget("tx-2", at(300))))).toBe(
      "CONTINUATION_HELD",
    );
    await a.campaign.close();
    // (b) unresolved with NO target (condition-only request): the continuation holds only the blocked work
    const b = await seededTemporalCampaign(tempDir(), { objects: [unresolvedObject()] });
    await must(b.coordinator.advance(conditionOnly("tx-1")));
    const held = b.coordinator.state()!.value.continuation!;
    expect(held.toward).toBeNull();
    expect(held.unresolved_dependents).toHaveLength(1);
    expect(await codeOf(b.coordinator.advance(toTarget("tx-2", at(300))))).toBe(
      "CONTINUATION_HELD",
    );
    expect(await codeOf(b.coordinator.advance(conditionOnly("tx-3")))).toBe("CONTINUATION_HELD");
    await b.campaign.close();
  });

  it("the correct explicit continuation still succeeds — including one that holds only blocked work", async () => {
    // a producer that needs a source which is not committed yet: unresolved (SOURCE_ABSENT), then fixable
    const needsLate = {
      ...P!,
      reads: [
        ...P!.reads,
        {
          mode: "AS-OF-NOW" as const,
          source: { owner: SYNTH_OWNER, fact_key: "synthetic/late-source" },
          invalidators: [],
        },
      ],
    };
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [engagedObject({ dependencies: [needsLate, C!] })],
    });
    const r1 = await must(coordinator.advance(conditionOnly("tx-1")));
    expect(r1.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(coordinator.state()!.value.continuation!.toward).toBeNull();
    expect(await codeOf(coordinator.advance(toTarget("tx-2")))).toBe("CONTINUATION_HELD");
    // the source arrives; the held continuation is consumed explicitly and correctly
    await must(
      campaign.store.commit(
        syntheticSourceGroup(FIXTURE_CAMPAIGN, 9, "late", 0, "synthetic/late-source"),
      ),
    );
    const r2 = await must(
      coordinator.advance(
        stopAtBoundaryRequest("tx-2", {
          continues: "tx-1",
          requested: conditionOnly("tx-1").requested, // the original unfinished request, unchanged
        }),
      ),
    );
    expect(r2.transaction.continues).toBe("tx-1");
    expect(r2.transaction.requested).toEqual(r1.transaction.requested);
    expect(r2.transaction.outcome).toMatchObject({
      actual_stop: TB,
      stop_reason: "CONDITION_SATISFIED",
      remainder: null,
    });
    expect(r2.transaction.engaged).toMatchObject([
      { boundary: "RETIRED", object_id: OBJECT_ENGAGED },
    ]);
    expect(coordinator.state()!.value.continuation).toBeNull(); // consumed
    expect(campaign.verify()).toEqual([]);
    await campaign.close();
    // and the remainder case, through both entry points
    const s = await seededTemporalCampaign(tempDir());
    await must(s.coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const explicit = await must(
      s.coordinator.advance(
        stopAtBoundaryRequest("tx-2", {
          continues: "tx-1",
          requested: { target: T1, condition: null },
        }),
      ),
    );
    expect(explicit.transaction.outcome.stop_reason).toBe("TARGET_REACHED");
    await s.campaign.close();
    const t = await seededTemporalCampaign(tempDir());
    await must(t.coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(
      (await must(t.coordinator.continueRemainder(continuationInput("tx-2")))).transaction
        .continues,
    ).toBe("tx-1");
    await t.campaign.close();
  });

  it("an explicit continuation that does not consume exactly what is held is still refused", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const wrong = (over: object) => stopAtBoundaryRequest("tx-x", over);
    expect(
      await codeOf(
        coordinator.advance(
          wrong({ continues: "tx-1", requested: { target: at(999), condition: null } }),
        ),
      ),
    ).toBe("CONTINUATION_MISMATCH");
    expect(
      await codeOf(
        coordinator.advance(
          wrong({ continues: "tx-other", requested: { target: T1, condition: null } }),
        ),
      ),
    ).toBe("CONTINUATION_MISMATCH");
    await campaign.close();
  });

  it("the raw kernel admission refuses an abandoned or invented continuation, for both kinds of held continuation", async () => {
    // remainder held: tamper the continuing transaction so it no longer declares what it consumes
    {
      const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
      await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
      const error = await refused(
        campaign,
        {
          ...continuationInput("tx-2"),
          continues: "tx-1",
          requested: { target: T1, condition: null },
        },
        (g) =>
          edit(g, temporalTransactionKey("tx-2"), (t) => {
            t.continues = null;
          }),
      );
      expect(error?.code).toBe("REFERENCE_INVALID");
      expect(error?.message).toContain("held continuation must be consumed");
      await campaign.close();
    }
    // blocked-only continuation held: same abandonment, raw
    {
      const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
        objects: [unresolvedObject()],
      });
      await must(coordinator.advance(conditionOnly("tx-1")));
      const error = await refused(
        campaign,
        stopAtBoundaryRequest("tx-2", {
          continues: "tx-1",
          requested: conditionOnly("tx-1").requested,
        }),
        (g) =>
          edit(g, temporalTransactionKey("tx-2"), (t) => {
            t.continues = null;
          }),
      );
      expect(error?.code).toBe("REFERENCE_INVALID");
      expect(error?.message).toContain("held continuation must be consumed");
      await campaign.close();
    }
    // nothing held: a transaction may not invent a continuation
    {
      const { campaign } = await seededTemporalCampaign(tempDir());
      const error = await refused(campaign, toTarget("tx-1"), (g) =>
        edit(g, TX1, (t) => {
          t.continues = "tx-ghost";
        }),
      );
      expect(error?.code).toBe("REFERENCE_INVALID");
      await campaign.close();
    }
  });

  it("load-time verification refuses a history that abandoned a held continuation", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    await must(coordinator.continueRemainder(continuationInput("tx-2")));
    expect(campaign.verify()).toEqual([]);
    const facts = cloneFacts(campaign.store);
    (facts.find((f) => f.key === temporalTransactionKey("tx-2"))!.value as any).continues = null;
    expect(codes(verifyTemporalIntegrity(view(campaign.store, facts)))).toEqual([
      "TEMPORAL_TRANSACTION",
    ]);
    await campaign.close();
  });

  it("save/close/load/continue is unchanged: the held continuation survives reload, is still not abandonable, and is consumed", async () => {
    const dir = tempDir();
    const a = await seededTemporalCampaign(dir);
    await must(a.coordinator.advance(stopAtBoundaryRequest("tx-1")));
    await a.campaign.close();
    const b = await reopen(dir);
    expect(b.coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: "tx-1",
      toward: T1,
    });
    expect(await codeOf(b.coordinator.advance(toTarget("tx-2", at(300))))).toBe(
      "CONTINUATION_HELD",
    );
    const done = await must(b.coordinator.continueRemainder(continuationInput("tx-2")));
    expect(done.transaction.outcome).toMatchObject({
      actual_stop: T1,
      stop_reason: "TARGET_REACHED",
      remainder: null,
    });
    expect(b.coordinator.state()!.value.continuation).toBeNull();
    expect(b.campaign.verify()).toEqual([]);
    await b.campaign.close();
    // and with the continuation consumed, fresh progress is lawful again
    const c = await reopen(dir);
    await must(c.coordinator.advance(toTarget("tx-3", at(400))));
    await c.campaign.close();
  });
});

// ==========================================================================================
// Finding 4
// ==========================================================================================

describe("Finding 4 — replay includes the immutable publication metadata", () => {
  it("the same request with the same publication replays; the authoritative evidence carries its basis and secrecy", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    const first = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const entries = campaign.store.head().journal_entries;
    const again = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(campaign.store.head().journal_entries).toBe(entries);
    const fact = campaign.store.getFact(TX1)!;
    expect([fact.basis, fact.secrecy]).toEqual(["fixture-basis", "fixture-visibility"]);
    const group = campaign.store.committedGroup("transaction-intent:tx-1")!;
    expect(
      group.writes.every((w) => w.basis === "fixture-basis" && w.secrecy === "fixture-visibility"),
    ).toBe(true);
    await campaign.close();
  });

  it.each([
    ["basis", { basis: "a-different-basis", secrecy: "fixture-visibility" }],
    ["secrecy", { basis: "fixture-basis", secrecy: "a-different-secrecy" }],
    ["basis and secrecy", { basis: "another-basis", secrecy: "another-secrecy" }],
  ])(
    "a changed publication %s is TRANSACTION_CONFLICT, never the same immutable request",
    async (_what, publication) => {
      const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
      await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
      const entries = campaign.store.head().journal_entries;
      const head = campaign.store.head().state_sha256;
      const r = await coordinator.advance(stopAtBoundaryRequest("tx-1", { publication }));
      expect(!r.ok && r.error.code).toBe("TRANSACTION_CONFLICT");
      // nothing was written, re-resolved or recreated
      expect(campaign.store.head().journal_entries).toBe(entries);
      expect(campaign.store.head().state_sha256).toBe(head);
      await campaign.close();
    },
  );

  it("the comparison is against the committed evidence, so it holds after reload", async () => {
    const dir = tempDir();
    const a = await seededTemporalCampaign(dir);
    await must(a.coordinator.advance(stopAtBoundaryRequest("tx-1")));
    await a.campaign.close();
    const b = await reopen(dir);
    expect(
      await codeOf(
        b.coordinator.advance(
          stopAtBoundaryRequest("tx-1", {
            publication: { basis: "x", secrecy: "fixture-visibility" },
          }),
        ),
      ),
    ).toBe("TRANSACTION_CONFLICT");
    expect(
      await codeOf(
        b.coordinator.advance(
          stopAtBoundaryRequest("tx-1", { publication: { basis: "fixture-basis", secrecy: "y" } }),
        ),
      ),
    ).toBe("TRANSACTION_CONFLICT");
    expect((await must(b.coordinator.advance(stopAtBoundaryRequest("tx-1")))).replayed).toBe(true);
    await b.campaign.close();
  });
});

// ==========================================================================================
// Finding 3 (second review) — a held continuation is UNFINISHED REQUESTED WORK
// ==========================================================================================

describe("Finding 3 (re-review) — a continuation of unresolved work preserves the original request", () => {
  /** A producer that needs a source not yet committed: unresolved (SOURCE_ABSENT), fixable later. */
  const needsLate = {
    ...P!,
    reads: [
      ...P!.reads,
      {
        mode: "AS-OF-NOW" as const,
        source: { owner: SYNTH_OWNER, fact_key: "synthetic/late-source" },
        invalidators: [],
      },
    ],
  };
  const blockedObject = () => engagedObject({ dependencies: [needsLate, C!] });
  const lateSource = (campaign: CampaignStore) =>
    campaign.commit(syntheticSourceGroup(FIXTURE_CAMPAIGN, 9, "late", 0, "synthetic/late-source"));
  const cond = conditionOnly("x").requested.condition!;
  const resume = (id: string, requested: unknown) =>
    stopAtBoundaryRequest(id, { continues: "tx-1", requested: requested as never });
  const ORIGINAL_BLOCKED_ONLY = conditionOnly("x").requested; // { target: null, condition: C }
  const ORIGINAL_WITH_TARGET = stopAtBoundaryRequest("x").requested; // { target: T1, condition: C }

  it("blocked-only: resumed with the same original condition it succeeds once the dependency is resolvable — across save/close/load", async () => {
    const dir = tempDir();
    const a = await seededTemporalCampaign(dir, { objects: [blockedObject()] });
    const r1 = await must(a.coordinator.advance(conditionOnly("tx-1")));
    expect(r1.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(a.coordinator.state()!.value.continuation).toMatchObject({ toward: null });
    await a.campaign.close();

    const b = await reopen(dir); // the held continuation and its sealed request persisted
    await must(lateSource(b.campaign.store));
    const r2 = await must(b.coordinator.advance(resume("tx-2", ORIGINAL_BLOCKED_ONLY)));
    expect(r2.transaction.continues).toBe("tx-1");
    expect(r2.transaction.requested).toEqual(r1.transaction.requested);
    expect(r2.transaction.outcome).toMatchObject({
      actual_stop: TB,
      stop_reason: "CONDITION_SATISFIED",
      remainder: null,
      unresolved_dependents: [],
    });
    expect(r2.transaction.engaged).toMatchObject([
      { boundary: "RETIRED", object_id: OBJECT_ENGAGED },
    ]);
    expect(b.coordinator.state()!.value.continuation).toBeNull();
    expect(b.campaign.verify()).toEqual([]);
    // replay is unchanged: the same request replays, a different one conflicts
    expect(
      (await must(b.coordinator.advance(resume("tx-2", ORIGINAL_BLOCKED_ONLY)))).replayed,
    ).toBe(true);
    expect(
      await codeOf(b.coordinator.advance(resume("tx-2", { target: T1, condition: null }))),
    ).toBe("TRANSACTION_CONFLICT");
    await b.campaign.close();
  });

  it.each([
    [
      "changing the held condition (another boundary)",
      { target: null, condition: { ...cond, boundary_id: "some-other-boundary" } },
    ],
    [
      "changing the held condition (another object)",
      { target: null, condition: { ...cond, object_id: "obj-other" } },
    ],
    ["dropping the held condition for a target", { target: T1, condition: null }],
    [
      "replacing the blocked-only request with an unrelated target",
      { target: at(300), condition: null },
    ],
    [
      "adding a target to the held condition (not the same request)",
      { target: T1, condition: cond },
    ],
  ])("blocked-only: %s is rejected, and nothing is committed", async (_what, requested) => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [blockedObject()],
    });
    await must(coordinator.advance(conditionOnly("tx-1")));
    await must(lateSource(campaign.store)); // even when the dependency IS resolvable
    const entries = campaign.store.head().journal_entries;
    const state = campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    expect(await codeOf(coordinator.advance(resume("tx-2", requested)))).toBe(
      "CONTINUATION_MISMATCH",
    );
    expect(campaign.store.head().journal_entries).toBe(entries);
    expect(campaign.store.getFact(TEMPORAL_STATE_KEY)).toEqual(state);
    expect(coordinator.state()!.value.continuation).toMatchObject({
      from_transaction: "tx-1",
      toward: null,
    });
    // dropping BOTH target and condition is not even a request
    expect(
      await codeOf(coordinator.advance(resume("tx-3", { target: null, condition: null }))),
    ).toBe("INPUT_INVALID");
    await campaign.close();
  });

  it("unresolved work with a remainder target: the condition and the target must both be preserved", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [unresolvedObject()],
    });
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(coordinator.state()!.value.continuation).toMatchObject({ toward: T1 });
    for (const requested of [
      { target: T1, condition: null }, // drops the condition (the previously accepted looser form)
      { target: at(300), condition: cond }, // changes the target
      { target: T1, condition: { ...cond, boundary_id: "some-other-boundary" } },
    ]) {
      expect(await codeOf(coordinator.advance(resume("tx-2", requested)))).toBe(
        "CONTINUATION_MISMATCH",
      );
    }
    // the original request, unchanged, is accepted
    const ok = await must(coordinator.advance(resume("tx-2", ORIGINAL_WITH_TARGET)));
    expect(ok.transaction.requested).toEqual(ORIGINAL_WITH_TARGET);
    // the helper carries the original request forward too
    const { campaign: c2, coordinator: k2 } = await seededTemporalCampaign(tempDir(), {
      objects: [unresolvedObject()],
    });
    await must(k2.advance(stopAtBoundaryRequest("tx-1")));
    const viaHelper = await must(k2.continueRemainder(continuationInput("tx-2")));
    expect(viaHelper.transaction.requested).toEqual(ORIGINAL_WITH_TARGET);
    await c2.close();
    await campaign.close();
  });

  it("the existing lawful case is unchanged: a plain target remainder is continued toward that target, condition free", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir());
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1"))); // condition resolved, target remains
    expect(coordinator.state()!.value.continuation).toMatchObject({
      toward: T1,
      unresolved_dependents: [],
    });
    const done = await must(coordinator.advance(resume("tx-2", { target: T1, condition: null })));
    expect(done.transaction.outcome).toMatchObject({
      actual_stop: T1,
      stop_reason: "TARGET_REACHED",
    });
    expect(coordinator.state()!.value.continuation).toBeNull();
    await campaign.close();
    // and through the helper, and with a wrong target still refused
    const s = await seededTemporalCampaign(tempDir());
    await must(s.coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(
      await codeOf(s.coordinator.advance(resume("tx-2", { target: at(150), condition: null }))),
    ).toBe("CONTINUATION_MISMATCH");
    expect(
      (await must(s.coordinator.continueRemainder(continuationInput("tx-2")))).transaction
        .requested,
    ).toEqual({ target: T1, condition: null });
    await s.campaign.close();
  });

  it("raw kernel admission refuses equivalent tampering of the continuing request", async () => {
    // tx-1 blocked-only; tx-2 resumes it (still blocked, no late source) so the record stays schema-valid
    const tamperCases: [string, unknown][] = [
      [
        "changed condition",
        { target: null, condition: { ...cond, boundary_id: "some-other-boundary" } },
      ],
      ["dropped condition, unrelated target", { target: at(300), condition: null }],
      ["condition replaced by a target", { target: T1, condition: null }],
    ];
    for (const [, requested] of tamperCases) {
      const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
        objects: [blockedObject()],
      });
      await must(coordinator.advance(conditionOnly("tx-1")));
      const error = await refused(campaign, resume("tx-2", ORIGINAL_BLOCKED_ONLY), (g) =>
        edit(g, temporalTransactionKey("tx-2"), (t) => {
          t.requested = requested;
        }),
      );
      expect(error?.code).toBe("REFERENCE_INVALID");
      expect(error?.message).toContain("preserve the original requested target and condition");
      await campaign.close();
    }
    // unresolved with a remainder target: dropping the condition is refused raw as well
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [unresolvedObject()],
    });
    await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const error = await refused(campaign, resume("tx-2", ORIGINAL_WITH_TARGET), (g) =>
      edit(g, temporalTransactionKey("tx-2"), (t) => {
        t.requested = { target: T1, condition: null };
      }),
    );
    expect(error?.code).toBe("REFERENCE_INVALID");
    expect(error?.message).toContain("preserve the original requested target and condition");
    await campaign.close();
    // the lawful target-remainder case is NOT tightened: a raw group with condition free is admitted
    const ok = await seededTemporalCampaign(tempDir());
    await must(ok.coordinator.advance(stopAtBoundaryRequest("tx-1")));
    const passthrough = tamper(ok.campaign.store, (g) => g);
    const c = new TemporalCoordinator(passthrough.store, syntheticProviders());
    expect((await c.advance(resume("tx-2", { target: T1, condition: null }))).ok).toBe(true);
    await ok.campaign.close();
  });

  it("load-time verification refuses equivalent historical tampering, and accepts the lawful histories", async () => {
    // history: tx-1 blocked-only, tx-2 resumes it (still blocked), so its request can be altered validly
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [blockedObject()],
    });
    await must(coordinator.advance(conditionOnly("tx-1")));
    await must(coordinator.advance(resume("tx-2", ORIGINAL_BLOCKED_ONLY)));
    expect(campaign.verify()).toEqual([]); // the lawful history verifies
    for (const requested of [
      { target: null, condition: { ...cond, boundary_id: "some-other-boundary" } },
      { target: at(300), condition: null },
      { target: T1, condition: null },
    ]) {
      const facts = cloneFacts(campaign.store);
      (facts.find((f) => f.key === temporalTransactionKey("tx-2"))!.value as any).requested =
        requested;
      const found = verifyTemporalIntegrity(view(campaign.store, facts));
      expect(codes(found)).toEqual(["TEMPORAL_TRANSACTION"]);
      expect(found[0]!.message).toContain("preserve the original requested target and condition");
    }
    await campaign.close();
    // the lawful target-remainder history (condition free on the continuation) verifies, also after reload
    const dir = tempDir();
    const a = await seededTemporalCampaign(dir);
    await must(a.coordinator.advance(stopAtBoundaryRequest("tx-1")));
    await must(a.coordinator.continueRemainder(continuationInput("tx-2")));
    await a.campaign.close();
    const b = await reopen(dir);
    expect(b.campaign.verify()).toEqual([]);
    await b.campaign.close();
  });
});

describe("regression guards for the repairs", () => {
  it("an object's stage set and identities are unchanged: the producer is still the same StageKey", async () => {
    const { campaign, coordinator } = await seededTemporalCampaign(tempDir(), {
      objects: [unresolvedObject()],
    });
    const r = await must(coordinator.advance(stopAtBoundaryRequest("tx-1")));
    expect(r.transaction.stages[0]!.stage).toEqual(PRODUCER_STAGE);
    expect(campaign.store.getFact(SYNTH_PRODUCER_RESULT_KEY)!.version).toBe(1);
    expect(T0.value).toBe(100);
    await campaign.close();
  });
});
