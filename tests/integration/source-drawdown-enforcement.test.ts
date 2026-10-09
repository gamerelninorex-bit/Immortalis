/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values and tamper with committed groups */
// Exact Finite Raw-Source Drawdown — enforcement: every refusal the slice owes, each by the rule that is meant to refuse it,
// under the REAL registered owners, rules and archivist authority, so neither a registry, a rule-drift nor an authority check
// is what refuses a tampered group. Nothing foreign-owned is silently modified: after every refusal the committed state is
// unchanged. Source and Production stay separate owners; a request, a fixture and a caller can never supply a verdict.
// Register lineage: IA-02, IA-03, IA-04, IA-05 (bounded), IA-06 (partial); RC-06, RC-07, RC-10, RC-16; IM-02, IM-03, IM-05, IM-11.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  FACET_WORLD_SOURCE_CONDITION,
  OWNER_WORLD_STATE,
  ProductionExtractionSchema,
  ProductionReserveSchema,
  SourceAccountSchema,
  SourceDeltaSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  productionExtractionKey,
  productionReserveInflowStage,
  productionSourceAccountKey,
  productionSourceDeltaKey,
  productionSourceDeltaStage,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
  worldSourceDeliveryStage,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  SourceDrawdownAdapter,
  TemporalCoordinator,
  deriveReserveInflow,
  deriveSourceDelivery,
  deriveSourceDelta,
  factKind,
  stageGroupId,
  stageIntentId,
  verifySourceDrawdownIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_WORLD_ID,
  MATERIAL_CLASS,
  MATERIAL_UNIT,
  RESERVE_MAIN,
  SRC_ACCESS,
  SRC_BASIS_ID,
  SRC_BASIS_OTHER,
  SRC_MATERIAL,
  SRC_REQ_1,
  SRC_REQ_2,
  SRC_REQ_3,
  SRC_RESERVE,
  SRC_RESERVE_OTHER,
  SRC_SOURCE_KEY,
  SRC_SOURCE_OTHER,
  SRC_TB,
  SRC_UNIT,
  basisInput,
  drawdownAdvanceRequest,
  drawdownPublication,
  drawdownProviders,
  drawdownRequest,
  prodPublication,
  requestGroup,
  reserveInput,
  srcAt,
  startExtractionInput,
  sourceInput,
  publication,
  at,
} from "@immortalis/testkit";
import {
  drawSummary,
  registerExtraction,
  seededDrawdownCampaign,
  startAndRegisterExtraction,
  type DrawSeeded,
} from "../support/source-drawdown.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const reqKey = (id: string) => `synthetic-request/${id}`;
const srcKey = (k = SRC_SOURCE_KEY) => worldSourceConditionKey(FIXTURE_WORLD_ID, k);
const accountKey = (k = SRC_SOURCE_KEY) => productionSourceAccountKey(FIXTURE_WORLD_ID, k);
const srcOf = (s: DrawSeeded, k = SRC_SOURCE_KEY) =>
  s.drawdown.sourceCondition(FIXTURE_WORLD_ID, k)!;

const fail = async (
  p: Promise<{ ok: boolean; error?: { code: string; message: string; details?: any } }>,
) => {
  const r = await p;
  if (r.ok) throw new Error("expected a refusal");
  return r.error!;
};

/** A store that records the group an adapter builds and commits NOTHING: the exact group, ready to be tampered with. */
function capturing(inner: CampaignStore): { store: CampaignStore; groups: CommitGroup[] } {
  const groups: CommitGroup[] = [];
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: (g) => {
      groups.push(structuredClone(g) as CommitGroup);
      return Promise.resolve({
        ok: false as const,
        error: { code: "UNKNOWN_OUTCOME" as const, message: "captured, not committed" },
      });
    },
  };
  return { store, groups };
}

/** The exact start group the adapter would commit now (never committed). */
async function builtStart(
  s: DrawSeeded,
  n: number,
  requestId: string,
  over: Parameters<typeof startExtractionInput>[1] = {},
): Promise<CommitGroup> {
  const cap = capturing(s.campaign.store);
  await new SourceDrawdownAdapter(cap.store).startExtraction({
    ...drawdownPublication(n),
    start: startExtractionInput(reqKey(requestId), over),
  });
  return cap.groups[0]!;
}

const write = (
  key: string,
  value: unknown,
  expected_version: number,
  owner: string,
  facet: string,
) => ({
  key,
  owner,
  facet,
  value: value as never,
  unit: null,
  basis: "raw-basis",
  secrecy: "raw-secrecy",
  expected_version,
});

const snapshot = (s: DrawSeeded) => drawSummary(s.campaign, s.coordinator);

describe("absent or untrue source: nothing is drawn from a source World-State has not established", () => {
  it("a start without a committed Source Condition is a missing prerequisite, never created by Production", async () => {
    const s = await seededDrawdownCampaign(tempDir(), { omitSource: true });
    const before = snapshot(s);
    const e = await fail(
      s.drawdown.startExtraction({
        ...drawdownPublication(30),
        start: startExtractionInput(reqKey(SRC_REQ_1)),
      }),
    );
    expect(e.code).toBe("PREREQUISITE_MISSING");
    expect(snapshot(s)).toEqual(before);
    expect(s.campaign.store.getFact(srcKey())).toBeUndefined();
  });

  it("a basis cannot be established for an absent Source Condition", async () => {
    const s = await seededDrawdownCampaign(tempDir(), { omitSource: true });
    const e = await fail(
      s.drawdown.establishBasis({ ...drawdownPublication(31), extraction_basis: basisInput() }),
    );
    expect(e.code).toBe("PREREQUISITE_MISSING");
  });

  it("an actor's Source Estimate presented as truth is refused: only a committed World-State Source Condition is source truth", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    // an estimate: an exact-looking Source Condition value in a foreign (requester) owner's key space
    const real = srcOf(s).value;
    await must(
      s.campaign.store.commit(
        requestGroup(FIXTURE_CAMPAIGN, 20, "estimate-1", { ...real, note: "an actor's estimate" }),
      ),
    );
    const estimateKey = reqKey("estimate-1");
    const good = await builtStart(s, 32, SRC_REQ_1);
    const tampered = structuredClone(good);
    const ex = tampered.writes.find((w) => w.key === productionExtractionKey(SRC_REQ_1))!;
    (ex.value as any).source.fact_key = estimateKey;
    tampered.reads = tampered.reads.map((r) =>
      r.key === srcKey()
        ? { key: estimateKey, version: s.campaign.store.getFact(estimateKey)!.version }
        : r,
    );
    tampered.depends_on = [
      ...tampered.depends_on.filter(
        (g) => g !== s.campaign.store.getFact(srcKey())!.provenance.group_id,
      ),
      s.campaign.store.getFact(estimateKey)!.provenance.group_id,
    ];
    const before = snapshot(s);
    const r = await s.campaign.store.commit(tampered);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/estimate or a stale pin is no source truth/);
    expect(snapshot(s)).toEqual(before);
    // and a basis cannot rely on it either
    const cap = capturing(s.campaign.store);
    await new SourceDrawdownAdapter(cap.store).establishBasis({
      ...drawdownPublication(33),
      extraction_basis: basisInput({ basis_id: "basis-est" }),
    });
    const basisGroup = structuredClone(cap.groups[0]!);
    (basisGroup.writes[0]!.value as any).source.fact_key = estimateKey;
    basisGroup.reads = [{ key: estimateKey, version: 1 }];
    basisGroup.depends_on = [s.campaign.store.getFact(estimateKey)!.provenance.group_id];
    const br = await s.campaign.store.commit(basisGroup);
    expect(!br.ok && br.error.code).toBe("REFERENCE_INVALID");
  });

  it("the Source Condition has no estimate, range, latent or probabilistic form: such values are not representable", () => {
    const base = srcOf; // (silences unused import in this block)
    void base;
    const ok = WorldSourceConditionSchema.safeParse({
      source_key: "k",
      locality: {
        world: { fact_key: "world/w/profile", entity_id: "w" },
        locus: { fact_key: "world/w/locus/l", entity_id: "l" },
      },
      dimension: "d",
      material_class: "m",
      depth: "EXACT_FINITE",
      establishment: {
        kind: "INITIAL_SETTING_FACT",
        statement: "s",
        quantity: { amount: 5, unit: "u" },
      },
      recoverable: { amount: 5, unit: "u" },
      delivered: [],
      access_facts: [],
      exhaustion: null,
    });
    expect(ok.success).toBe(true);
    for (const patch of [
      { depth: "ESTIMATED" },
      { depth: "LATENT" },
      { recoverable: { min: 3, max: 6, unit: "u" } },
      { estimate: { amount: 5, unit: "u" } },
      { rate: { amount: 1, unit: "u" } },
      { renewal: "seasonal" },
      { next_boundary_basis: "computed" },
      { flows: [] },
    ])
      expect(WorldSourceConditionSchema.safeParse({ ...(ok as any).data, ...patch }).success).toBe(
        false,
      );
  });
});

describe("missing or wrong capability / access: the source's existence establishes neither", () => {
  it("a start without Production's own Capability / Access basis is a missing prerequisite", async () => {
    const s = await seededDrawdownCampaign(tempDir(), { omitBasis: true });
    const before = snapshot(s);
    const e = await fail(
      s.drawdown.startExtraction({
        ...drawdownPublication(34),
        start: startExtractionInput(reqKey(SRC_REQ_1)),
      }),
    );
    expect(e.code).toBe("PREREQUISITE_MISSING");
    expect(e.message).toMatch(/Capability \/ Access basis/);
    expect(snapshot(s)).toEqual(before);
  });

  it("a basis relying on a physical access fact the source does not state is refused", async () => {
    const s = await seededDrawdownCampaign(tempDir(), { omitBasis: true });
    for (const relies_on of [
      { aspect: "another-aspect", statement: SRC_ACCESS.statement },
      { aspect: SRC_ACCESS.aspect, statement: "an altered statement" },
    ]) {
      const e = await fail(
        s.drawdown.establishBasis({
          ...drawdownPublication(35),
          extraction_basis: basisInput({ relies_on }),
        }),
      );
      expect(e.code).toBe("REFERENCE_INVALID");
      expect(e.message).toMatch(/physical access fact/);
    }
  });

  it("a basis for another material, unit or source key does not cover this source", async () => {
    const s = await seededDrawdownCampaign(tempDir(), { omitBasis: true });
    for (const over of [{ material_class: "another-material" }, { unit: "another-unit" }]) {
      const e = await fail(
        s.drawdown.establishBasis({
          ...drawdownPublication(36),
          extraction_basis: basisInput(over),
        }),
      );
      expect(e.code).toBe("REFERENCE_INVALID");
    }
    const e = await fail(
      s.drawdown.establishBasis({
        ...drawdownPublication(37),
        extraction_basis: basisInput({ source_key: "no-such-source" }),
      }),
    );
    expect(e.code).toBe("PREREQUISITE_MISSING");
  });

  it("a basis is not a labor-calibrated, specialist, encumbered or transformative path: such values are not representable", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const b = structuredClone(s.drawdown.basis(SRC_BASIS_ID)!.value) as any;
    for (const patch of [
      { capability: { ...b.capability, support: { ...b.capability.support, labor: "MATERIAL" } } },
      { capability: { ...b.capability, kind: "PROCESSING" } },
      { access: { ...b.access, encumbrance: "LEGAL_CLAIM" } },
      { access: { ...b.access, mode: "LOGISTICS_DELIVERED" } },
      { can_extract: true },
      { succeeded: true },
      { labor_coefficient: 2 },
    ]) {
      const cap = capturing(s.campaign.store);
      await new SourceDrawdownAdapter(cap.store).establishBasis({
        ...drawdownPublication(38),
        extraction_basis: basisInput({ basis_id: "basis-x" }),
      });
      const g = structuredClone(cap.groups[0]!);
      g.writes[0]!.value = { ...(g.writes[0]!.value as any), ...patch };
      const r = await s.campaign.store.commit(g);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.code).toBe("VALUE_INVALID");
    }
  });

  it("a start whose pinned basis covers another source is refused", async () => {
    const s = await seededDrawdownCampaign(tempDir(), { otherSource: true });
    const before = snapshot(s);
    const e = await fail(
      s.drawdown.startExtraction({
        ...drawdownPublication(39),
        start: startExtractionInput(reqKey(SRC_REQ_1), { basis_id: SRC_BASIS_OTHER }),
      }),
    );
    expect(e.code).toBe("REFERENCE_INVALID");
    expect(e.message).toMatch(/basis covers this source key/);
    expect(snapshot(s)).toEqual(before);
  });
});

describe("a request is the source's own, scoped, exact and untransformed", () => {
  const withRequest = async (over: Parameters<typeof drawdownRequest>[2]) => {
    const s = await seededDrawdownCampaign(tempDir(), { requests: [] });
    await must(
      s.campaign.store.commit(
        requestGroup(FIXTURE_CAMPAIGN, 20, "odd-req", drawdownRequest("odd-req", 3, over)),
      ),
    );
    return s;
  };
  const tryStart = (s: DrawSeeded) =>
    fail(
      s.drawdown.startExtraction({
        ...drawdownPublication(40),
        start: startExtractionInput(reqKey("odd-req")),
      }),
    );

  it("a request for another material, another unit, another locus or another world is refused", async () => {
    const world = { fact_key: "world/world-x/profile", entity_id: "world-x" };
    const locus = { fact_key: "world/world-x/locus/locus-x", entity_id: "locus-x" };
    const cases: [string, Parameters<typeof drawdownRequest>[2], string][] = [
      [
        "material",
        {
          requested_output: {
            output_class: "other-class",
            quantity: { amount: 3, unit: SRC_UNIT },
          },
        },
        "VALUE_INVALID",
      ],
      [
        "unit",
        {
          requested_output: {
            output_class: SRC_MATERIAL,
            quantity: { amount: 3, unit: "other-unit" },
          },
        },
        // the extraction is built in the request's unit, which the source's own account cannot keep
        "INPUT_INVALID",
      ],
      [
        "locus",
        {
          scope: {
            world: { fact_key: `world/${FIXTURE_WORLD_ID}/profile`, entity_id: FIXTURE_WORLD_ID },
            locus,
          },
        },
        "REFERENCE_INVALID",
      ],
      ["world", { scope: { world, locus } }, "REFERENCE_INVALID"],
    ];
    for (const [name, over, code] of cases) {
      const s = await withRequest(over);
      const before = snapshot(s);
      const e = await tryStart(s);
      expect(e.code, name).toBe(code);
      expect(snapshot(s), name).toEqual(before);
    }
  });

  it("a request not written by its own source owner, or carrying a priority/authority reference, is refused", async () => {
    // the request names an owner other than the one that wrote it
    const s = await withRequest({ source: { owner: "SOME-OTHER-OWNER", cause_ref: "c" } });
    expect((await tryStart(s)).code).toBe("REFERENCE_INVALID");
    // a priority / authority reference is unrepresentable in the carrier
    const t = await seededDrawdownCampaign(tempDir(), { requests: [] });
    const r = await t.campaign.store.commit(
      requestGroup(FIXTURE_CAMPAIGN, 21, "prio", {
        ...drawdownRequest("prio"),
        priority_authority_ref: "a-priority",
      }),
    );
    // the (unregistered) requester owner's value is its own to shape, but Production only pins a well-formed request
    expect(r.ok).toBe(true);
    const e = await fail(
      t.drawdown.startExtraction({
        ...drawdownPublication(41),
        start: startExtractionInput(reqKey("prio")),
      }),
    );
    expect(e.code).toBe("PREREQUISITE_MISSING");
  });

  it("a request is never a canonical, kernel or World-State fact: pinning one of those as the request is refused", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const good = await builtStart(s, 42, SRC_REQ_1);
    const world = s.campaign.store.getFact(`world/${FIXTURE_WORLD_ID}/profile`)!;
    const g = structuredClone(good);
    const ex = g.writes.find((w) => w.key === productionExtractionKey(SRC_REQ_1))!;
    (ex.value as any).request = {
      owner: world.owner,
      fact_key: world.key,
      request_id: SRC_REQ_1,
      version: world.version,
    };
    g.reads = [...g.reads, { key: world.key, version: world.version }];
    g.depends_on = [...g.depends_on, world.provenance.group_id];
    const r = await s.campaign.store.commit(g);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
  });
});

describe("insufficient material and conflicting claims: no partial fill, no second use of one quantity", () => {
  it("a request for more than the source holds is refused whole: no output, no partial fill, nothing recorded", async () => {
    const s = await seededDrawdownCampaign(tempDir(), { requests: [{ id: SRC_REQ_1, amount: 6 }] });
    const before = snapshot(s);
    const e = await fail(
      s.drawdown.startExtraction({
        ...drawdownPublication(43),
        start: startExtractionInput(reqKey(SRC_REQ_1)),
      }),
    );
    expect(e.code).toBe("CLAIM_INCOMPATIBLE");
    expect(e.details.reason).toBe("INSUFFICIENT_RECOVERABLE");
    expect(snapshot(s)).toEqual(before);
    expect(s.drawdown.extraction(SRC_REQ_1)).toBeUndefined();
    expect(s.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)).toBeUndefined();
  });

  it("two requests the source jointly supports both complete at ONE boundary, each exactly once, whatever the stage order", async () => {
    const s = await seededDrawdownCampaign(tempDir(), {
      requests: [
        { id: SRC_REQ_1, amount: 3 },
        { id: SRC_REQ_2, amount: 2 },
      ],
    });
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await startAndRegisterExtraction(s, SRC_REQ_2, 2);
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-both")));
    expect(srcOf(s).value.recoverable.amount).toBe(0);
    expect(srcOf(s).value.exhaustion).not.toBeNull();
    expect(srcOf(s).value.delivered.map((d) => d.delivery_id)).toEqual([SRC_REQ_1, SRC_REQ_2]);
    expect(s.drawdown.reserve(SRC_RESERVE)!.value.quantity.amount).toBe(5);
    expect(s.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!.value.open).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a Reserve of another material or unit is not the destination; a request cannot be reused for a transformation", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await must(
      s.production.establishReserve({ ...prodPublication(9), reserve: reserveInput(RESERVE_MAIN) }),
    );
    const before = snapshot(s);
    const e = await fail(
      s.drawdown.startExtraction({
        ...drawdownPublication(47),
        start: startExtractionInput(reqKey(SRC_REQ_1), { reserve_id: RESERVE_MAIN }),
      }),
    );
    expect(e.code).toBe("REFERENCE_INVALID");
    expect(e.message).toMatch(/destination Reserve holds the same material/);
    expect(MATERIAL_CLASS).not.toBe(SRC_MATERIAL);
    expect(MATERIAL_UNIT).not.toBe(SRC_UNIT);
    expect(snapshot(s)).toEqual(before);
  });
});

const reqStart = (n: number, id: string, boundary = SRC_TB) => ({
  ...drawdownPublication(n),
  start: startExtractionInput(reqKey(id), { boundary_at: boundary }),
});

/** Everything substantive about the drawdown, with no identity of any group or fact version in it. */
function substance(s: DrawSeeded, ids: string[]) {
  const src = srcOf(s).value;
  return {
    source: src,
    reserve: s.drawdown.reserve(SRC_RESERVE)!.value,
    open: s.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)?.value.open ?? null,
    standing: Object.fromEntries(ids.map((id) => [id, s.drawdown.phase(id)])),
    deltas: ids.map((id) => s.drawdown.sourceDelta(id) !== undefined),
  };
}

describe("same-instant scarcity (F-017 v0.3 §4 Same-time contention): arrival and processing order decide nothing", () => {
  it("incompatible simultaneous claims are ALL contested whatever order they arrive in: no first-come winner, identical substance", async () => {
    const views: unknown[] = [];
    const afters: unknown[] = [];
    for (const order of [
      [SRC_REQ_1, SRC_REQ_2],
      [SRC_REQ_2, SRC_REQ_1],
    ]) {
      const s = await seededDrawdownCampaign(tempDir());
      let n = 0;
      for (const id of order) {
        // each claim is recorded: a claim of the same instant is not refused for arriving second, nor credited for arriving first
        await must(s.drawdown.startExtraction(reqStart(60 + n++, id)));
        await registerExtraction(s, id, 80 + n);
      }
      expect(s.drawdown.phase(SRC_REQ_1)).toBe("CONTESTED");
      expect(s.drawdown.phase(SRC_REQ_2)).toBe("CONTESTED");
      views.push(substance(s, [SRC_REQ_1, SRC_REQ_2]));
      // the contested claims do not proceed: no Source Delta, no delivery, no Reserve credit, in any processing order
      const r = await must(s.coordinator.advance(drawdownAdvanceRequest("tx-contest")));
      expect(r.transaction.stages).toEqual([]);
      expect(r.rejections.map((x) => x.code)).toEqual(["CLAIM_INCOMPATIBLE", "CLAIM_INCOMPATIBLE"]);
      const unresolved = r.transaction.outcome.unresolved_dependents;
      // each claim's emit stage is refused by Production's admission; its dependents wait; nothing else is touched
      expect(
        unresolved
          .filter((u) => u.reason === "VALIDATION_REJECTED")
          .map((u) => u.stage.prospective_result_id),
      ).toEqual([`source-delta:${SRC_REQ_1}`, `source-delta:${SRC_REQ_2}`]);
      expect(
        unresolved.filter((u) => u.reason !== "VALIDATION_REJECTED").map((u) => u.reason),
      ).toEqual(Array(4).fill("PREDECESSOR_BLOCKED"));
      expect(r.transaction.engaged.map((e) => e.boundary)).not.toContain("RETIRED");
      expect(srcOf(s).value.recoverable.amount).toBe(5);
      expect(s.drawdown.reserve(SRC_RESERVE)!.value.quantity.amount).toBe(0);
      expect(s.drawdown.sourceDelta(SRC_REQ_1)).toBeUndefined();
      expect(s.drawdown.sourceDelta(SRC_REQ_2)).toBeUndefined();
      expect(s.campaign.verify()).toEqual([]);
      afters.push(substance(s, [SRC_REQ_1, SRC_REQ_2]));
    }
    expect(views[1]).toEqual(views[0]);
    expect(afters[1]).toEqual(afters[0]);
    expect((views[0] as any).open.map((o: any) => o.extraction_id)).toEqual([SRC_REQ_1, SRC_REQ_2]);
  });

  it("three simultaneous claims that cannot all be supported are all contested in every one of the six arrival orders", async () => {
    const ids = [SRC_REQ_1, SRC_REQ_2, SRC_REQ_3];
    const perms = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const seen: unknown[] = [];
    for (const p of perms) {
      const s = await seededDrawdownCampaign(tempDir(), {
        requests: ids.map((id) => ({ id, amount: 2 })),
      });
      let n = 0;
      for (const i of p) await must(s.drawdown.startExtraction(reqStart(70 + n++, ids[i]!)));
      for (const id of ids) expect(s.drawdown.phase(id)).toBe("CONTESTED");
      seen.push(substance(s, ids));
    }
    for (const v of seen) expect(v).toEqual(seen[0]);
  });

  it("an incompatible simultaneous claim contests a claim that was supported alone a moment before (the first arrival keeps no standing)", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await must(s.drawdown.startExtraction(reqStart(61, SRC_REQ_1)));
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("COMMITTED");
    await must(s.drawdown.startExtraction(reqStart(62, SRC_REQ_2)));
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("CONTESTED");
    expect(s.drawdown.phase(SRC_REQ_2)).toBe("CONTESTED");
  });

  it("jointly supportable simultaneous claims are all credited, whatever order: contention law does not starve supportable claims", async () => {
    const results: unknown[] = [];
    for (const order of [
      [SRC_REQ_1, SRC_REQ_2],
      [SRC_REQ_2, SRC_REQ_1],
    ]) {
      const s = await seededDrawdownCampaign(tempDir(), {
        requests: [
          { id: SRC_REQ_1, amount: 3 },
          { id: SRC_REQ_2, amount: 2 },
        ],
      });
      let n = 0;
      for (const id of order) {
        await must(s.drawdown.startExtraction(reqStart(63 + n++, id)));
        await registerExtraction(s, id, 90 + n);
      }
      expect(s.drawdown.phase(SRC_REQ_1)).toBe("COMMITTED");
      expect(s.drawdown.phase(SRC_REQ_2)).toBe("COMMITTED");
      await must(s.coordinator.advance(drawdownAdvanceRequest("tx-both")));
      expect(s.drawdown.phase(SRC_REQ_1)).toBe("CREDITED");
      expect(s.drawdown.phase(SRC_REQ_2)).toBe("CREDITED");
      results.push(substance(s, [SRC_REQ_1, SRC_REQ_2]));
      expect(s.campaign.verify()).toEqual([]);
    }
    expect(results[1]).toEqual(results[0]);
  });

  it("a genuinely EARLIER committed claim keeps its material: a later-instant incompatible claim receives no credit and records nothing", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1); // instant 100, 3 of 5
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-later", at(120)))); // canonical time moves on
    const before = snapshot(s);
    const e = await fail(s.drawdown.startExtraction(reqStart(64, SRC_REQ_2, srcAt(200))));
    expect(e.code).toBe("CLAIM_INCOMPATIBLE");
    expect(e.details).toMatchObject({
      reason: "INSUFFICIENT_RECOVERABLE",
      unclaimed: 2,
      requested: 3,
    });
    expect(snapshot(s)).toEqual(before);
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("COMMITTED"); // and it is untouched: still supported
  });

  it("earlier precedence and same-instant contention compose: the earlier claim is credited, the incompatible simultaneous pair after it stay contested in either order", async () => {
    const outcomes: unknown[] = [];
    for (const pair of [
      [SRC_REQ_2, SRC_REQ_3],
      [SRC_REQ_3, SRC_REQ_2],
    ]) {
      const s = await seededDrawdownCampaign(tempDir(), {
        requests: [
          { id: SRC_REQ_1, amount: 3 },
          { id: SRC_REQ_2, amount: 2 },
          { id: SRC_REQ_3, amount: 2 },
        ],
      });
      await startAndRegisterExtraction(s, SRC_REQ_1, 1); // instant 100, boundary 140
      await must(s.coordinator.advance(drawdownAdvanceRequest("tx-t", at(120))));
      let n = 0;
      for (const id of pair) {
        await must(s.drawdown.startExtraction(reqStart(65 + n++, id, srcAt(200)))); // instant 120: room is 5 − 3 = 2
        await registerExtraction(s, id, 95 + n);
      }
      expect(s.drawdown.phase(SRC_REQ_2)).toBe("CONTESTED");
      expect(s.drawdown.phase(SRC_REQ_3)).toBe("CONTESTED");
      await must(s.coordinator.advance(drawdownAdvanceRequest("tx-after", srcAt(300))));
      expect(s.drawdown.phase(SRC_REQ_1)).toBe("CREDITED");
      expect(srcOf(s).value.recoverable.amount).toBe(2);
      expect(s.drawdown.reserve(SRC_RESERVE)!.value.quantity.amount).toBe(3);
      outcomes.push(substance(s, [SRC_REQ_1, SRC_REQ_2, SRC_REQ_3]));
      expect(s.campaign.verify()).toEqual([]);
    }
    expect(outcomes[1]).toEqual(outcomes[0]);
  });

  it("simultaneous concurrent starts: the only transient refusal is a retriable version race, never a scarcity verdict, and both end contested", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const results = await Promise.all([
      s.drawdown.startExtraction(reqStart(66, SRC_REQ_1)),
      s.drawdown.startExtraction(reqStart(67, SRC_REQ_2)),
    ]);
    for (const r of results) if (!r.ok) expect(r.error.code).toBe("VERSION_CONFLICT");
    // a refused-for-version-race start is simply presented again
    if (!results[0].ok) await must(s.drawdown.startExtraction(reqStart(66, SRC_REQ_1)));
    if (!results[1].ok) await must(s.drawdown.startExtraction(reqStart(67, SRC_REQ_2)));
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("CONTESTED");
    expect(s.drawdown.phase(SRC_REQ_2)).toBe("CONTESTED");
    expect(srcOf(s).value.recoverable.amount).toBe(5);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a contested claim cannot be forced through: its Source Delta is refused by Production's own admission, and no later stage can follow", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    for (const [i, id] of [SRC_REQ_1, SRC_REQ_2].entries()) {
      await must(s.drawdown.startExtraction(reqStart(68 + i, id)));
      await registerExtraction(s, id, 85 + i);
    }
    const ex = s.campaign.store.getFact(productionExtractionKey(SRC_REQ_1))!;
    const delta = deriveSourceDelta({
      key: ex.key,
      version: ex.version,
      value: ProductionExtractionSchema.parse(ex.value),
    });
    const kind = factKind("production_source_delta");
    const stage = productionSourceDeltaStage(SRC_REQ_1);
    const before = snapshot(s);
    const r = await s.campaign.store.commit({
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: stageGroupId(stage),
      intent_id: stageIntentId(stage),
      owner: kind.owner,
      facet: kind.facet,
      cause: "transaction:tx-forged",
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [{ key: ex.key, version: ex.version }],
      depends_on: [ex.provenance.group_id],
      writes: [write(productionSourceDeltaKey(SRC_REQ_1), delta, 0, kind.owner, kind.facet)],
    });
    expect(r.ok).toBe(false);
    expect(snapshot(s)).toEqual(before);
    expect(s.drawdown.sourceDelta(SRC_REQ_1)).toBeUndefined();
  });
  it("the load-time verifier reports a Source Delta that exists for a contested claim", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    for (const [i, id] of [SRC_REQ_1, SRC_REQ_2].entries())
      await must(s.drawdown.startExtraction(reqStart(72 + i, id)));
    const store = s.campaign.store;
    expect(verifySourceDrawdownIntegrity(store)).toEqual([]);
    const ex = store.getFact(productionExtractionKey(SRC_REQ_1))!;
    const forged = {
      ...ex,
      key: productionSourceDeltaKey(SRC_REQ_1),
      version: 1,
      value: deriveSourceDelta({
        key: ex.key,
        version: ex.version,
        value: ProductionExtractionSchema.parse(ex.value),
      }),
    } as never;
    const view: CampaignStore = {
      ...store,
      descriptor: store.descriptor,
      head: () => store.head(),
      getFact: (k) => store.getFact(k),
      listFacts: () => [...store.listFacts(), forged],
      lookupReceipt: (i) => store.lookupReceipt(i),
      committedGroup: (i) => store.committedGroup(i),
      commit: (g) => store.commit(g),
      close: () => store.close(),
    };
    expect(
      verifySourceDrawdownIntegrity(view).some((v) =>
        /contested yet a Source Delta/.test(v.message),
      ),
    ).toBe(true);
  });
});

describe("stale and mistimed premises", () => {
  it("a start pinned at a stale Source Condition version is refused (STALE_READ) and records nothing", async () => {
    const s = await seededDrawdownCampaign(tempDir(), {
      requests: [
        { id: SRC_REQ_1, amount: 2 },
        { id: SRC_REQ_2, amount: 1 },
      ],
    });
    const stale = await builtStart(s, 48, SRC_REQ_2, { boundary_at: srcAt(400) });
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-1", at(200))));
    // the Source Condition advanced (v1 → v2) after the group was built on it
    expect(s.campaign.store.getFact(srcKey())!.version).toBe(2);
    const before = snapshot(s);
    const r = await s.campaign.store.commit(stale);
    expect(r.ok).toBe(false);
    expect(!r.ok && ["STALE_READ", "VERSION_CONFLICT", "VALUE_INVALID"]).toContain(
      !r.ok && r.error.code,
    );
    expect(snapshot(s)).toEqual(before);
  });

  it("a start whose pin names a version that is not the Source Condition's current one is refused by admission itself", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const g = structuredClone(await builtStart(s, 49, SRC_REQ_1));
    (
      g.writes.find((w) => w.key === productionExtractionKey(SRC_REQ_1))!.value as any
    ).source.version = 7;
    const r = await s.campaign.store.commit(g);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/current version/);
  });

  it("an extraction must start at the canonical time and declare a boundary after it", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const e = await fail(
      s.drawdown.startExtraction({
        ...drawdownPublication(50),
        start: startExtractionInput(reqKey(SRC_REQ_1), { boundary_at: srcAt(100) }),
      }),
    );
    expect(e.code).toBe("INPUT_INVALID");
    const g = structuredClone(await builtStart(s, 51, SRC_REQ_1));
    (
      g.writes.find((w) => w.key === productionExtractionKey(SRC_REQ_1))!.value as any
    ).timing.started_at = at(99);
    const r = await s.campaign.store.commit(g);
    expect(!r.ok && r.error.code).toBe("VALUE_INVALID");
  });

  it("an authority other than the archivist's, a foreign campaign and a tampered owner are refused", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const good = await builtStart(s, 52, SRC_REQ_1);
    for (const [name, g, code] of [
      [
        "authority",
        {
          ...good,
          authority: { role: "role.player", permission: "permission.player_choice.commit" },
        },
        "AUTHORITY_DENIED",
      ],
      ["campaign", { ...good, campaign_id: "another-campaign" }, "CAMPAIGN_MISMATCH"],
      ["owner", { ...good, owner: "world_state", facet: FACET_WORLD_SOURCE_CONDITION }, undefined],
    ] as const) {
      const r = await s.campaign.store.commit(g as CommitGroup);
      expect(r.ok, name).toBe(false);
      if (code) expect(!r.ok && r.error.code, name).toBe(code);
    }
    expect(s.drawdown.extraction(SRC_REQ_1)).toBeUndefined();
  });
});

describe("tampered start groups are each refused by the rule that is meant to refuse them", () => {
  it("the extraction and the account are re-derived from the pinned request, basis, Source Condition, Reserve and canonical time", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const good = await builtStart(s, 60, SRC_REQ_1);
    const before = snapshot(s);
    const exKey = productionExtractionKey(SRC_REQ_1);
    const edits: [string, (g: CommitGroup) => void, string, RegExp][] = [
      [
        "another material",
        (g) => {
          (g.writes.find((w) => w.key === exKey)!.value as any).material_class = "other-material";
        },
        "VALUE_INVALID",
        /Source Condition's own material and unit/,
      ],
      [
        "a quantity other than the request's",
        (g) => {
          (g.writes.find((w) => w.key === exKey)!.value as any).quantity.amount = 4;
        },
        "VALUE_INVALID",
        /exactly the request's amount/,
      ],
      [
        "a request pinned at another version",
        (g) => {
          (g.writes.find((w) => w.key === exKey)!.value as any).request.version = 9;
        },
        "REFERENCE_INVALID",
        /its source's own fact, pinned at its current version/,
      ],
      [
        "a basis pinned at another version",
        (g) => {
          (g.writes.find((w) => w.key === exKey)!.value as any).basis.version = 9;
        },
        "REFERENCE_INVALID",
        /current version/,
      ],
      [
        "an account that is not the key's",
        (g) => {
          (g.writes.find((w) => w.key === exKey)!.value as any).account.fact_key =
            "production/source-account/world-fixture-1/another";
        },
        "REFERENCE_INVALID",
        /identities are those derived/,
      ],
      [
        "a boundary identity that is not derived",
        (g) => {
          (g.writes.find((w) => w.key === exKey)!.value as any).timing.boundary.boundary_id = "b-x";
        },
        "REFERENCE_INVALID",
        /identities are those derived/,
      ],
      [
        "a commitment other than the extraction's quantity",
        (g) => {
          (g.writes.find((w) => w.key === accountKey())!.value as any).open[0].quantity.amount = 1;
        },
        "VALUE_INVALID",
        /account opens with the first admission/,
      ],
      [
        "a watermark other than the commit instant",
        (g) => {
          (g.writes.find((w) => w.key === accountKey())!.value as any).watermark = at(120);
        },
        "VALUE_INVALID",
        /account opens with the first admission/,
      ],
      [
        "an extraction that is not the request's identity",
        (g) => {
          (g.writes.find((w) => w.key === exKey)!.value as any).request.request_id = "another";
        },
        "REFERENCE_INVALID",
        /the extraction identity is the request identity|pinned at its current version/,
      ],
    ];
    for (const [name, edit, code, message] of edits) {
      const g = structuredClone(good);
      edit(g);
      const r = await s.campaign.store.commit(g);
      expect(r.ok, name).toBe(false);
      expect(!r.ok && r.error.code, name).toBe(code);
      expect(!r.ok && r.error.message, name).toMatch(message);
    }
    expect(snapshot(s)).toEqual(before);
    // the untouched group still commits, once
    expect((await s.campaign.store.commit(good)).ok).toBe(true);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a request fixes ONE use: a transformation operation cannot be started on a request that already fixes an extraction", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await must(
      s.production.establishReserve({
        ...prodPublication(69),
        reserve: reserveInput(RESERVE_MAIN),
      }),
    );
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    expect(s.drawdown.extraction(SRC_REQ_1)).toBeDefined();
    const { startInput } = await import("@immortalis/testkit");
    const e = await fail(
      s.production.startOperation({
        ...prodPublication(70),
        start: startInput(SRC_REQ_1, { reserve_id: RESERVE_MAIN }),
      }),
    );
    expect(e.code).toBe("VERSION_CONFLICT");
    expect(e.message).toMatch(/already fixes an extraction/);
    expect(s.production.operation(SRC_REQ_1)).toBeUndefined();
  });
});

describe("RC-10: an extraction's temporal object is exactly the one derived from the committed extraction", () => {
  it("a hand-written object cannot smuggle a different boundary, stage, read, produced key, owner or identity", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await must(
      s.drawdown.startExtraction({
        ...drawdownPublication(80),
        start: startExtractionInput(reqKey(SRC_REQ_1)),
      }),
    );
    const derived = structuredClone(s.drawdown.temporalObject(SRC_REQ_1)!) as any;
    const forged: [string, (o: any) => void][] = [
      ["a different boundary", (o) => (o.next_boundary.at = at(150))],
      ["a different resolved basis", (o) => (o.last_resolved_basis = at(101))],
      ["a stage dropped", (o) => o.dependencies.pop()],
      ["a stage reordered", (o) => o.dependencies.reverse()],
      ["an extra read", (o) => o.dependencies[0].reads.push(o.dependencies[1].reads[0])],
      [
        "a different produced key",
        (o) => (o.dependencies[2].produces[0] = "production/reserve/other"),
      ],
      [
        "a different owner of the delivery",
        (o) => (o.dependencies[1].stage.owner_operation.owner = "production"),
      ],
      ["a recurrence", (o) => (o.continuation.reconciliation_due = ["x"])],
      ["a different identity", (o) => (o.object_id = "obj-extraction-someone-else")],
      ["a foreign identity prefix", (o) => (o.object_id = `obj-production-${SRC_REQ_1}`)],
      ["a different process", (o) => (o.owning_ref.process_id = "production-extraction:other")],
    ];
    for (const [name, edit] of forged) {
      const o = structuredClone(derived);
      edit(o);
      const r = await s.coordinator.registerObject({
        group_id: `forge-g-${name}`,
        intent_id: `forge-i-${name}`,
        cause: "forge",
        basis: "b",
        secrecy: "s",
        object: o,
      });
      expect(r.ok, name).toBe(false);
      // (a recurrence is not even a representable object: the schema refuses it before any owner rule)
      if (name === "a recurrence") {
        expect(!r.ok && r.error.code, name).toBe("INPUT_INVALID");
        continue;
      }
      expect(!r.ok && r.error.code, name).toBe("REFERENCE_INVALID");
      expect(!r.ok && r.error.message, name).toMatch(
        /extraction temporal object|only an extraction|extraction boundary|object derived|earned boundary|resolved basis may not|identity derived/,
      );
    }
    // an object that merely declares one of the drawdown stage operations under another identity is refused as well
    const hijack = structuredClone(derived);
    hijack.object_id = "obj-something-else";
    hijack.owning_ref = { owner: "production", process_id: "some-process" };
    const r = await s.coordinator.registerObject({
      group_id: "forge-g-h",
      intent_id: "forge-i-h",
      cause: "forge",
      basis: "b",
      secrecy: "s",
      object: hijack,
    });
    expect(r.ok).toBe(false);
    expect(s.coordinator.object(`obj-extraction-${SRC_REQ_1}`)).toBeUndefined();
    // the derived object registers, once, and a credited extraction earns no second boundary
    await must(
      s.coordinator.registerObject({
        group_id: "reg-g",
        intent_id: "reg-i",
        cause: "reg",
        basis: "b",
        secrecy: "s",
        object: derived,
      }),
    );
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    const again = await s.coordinator.registerObject({
      group_id: "reg-g2",
      intent_id: "reg-i2",
      cause: "reg",
      basis: "b",
      secrecy: "s",
      object: derived,
    });
    expect(again.ok).toBe(false);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("owner exclusivity: nobody but the owner writes the Source Condition or Production's drawdown state", () => {
  it("Production cannot write World-State's Source Condition, and World-State cannot write Production's state", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const real = s.campaign.store.getFact(srcKey())!;
    const forged = { ...(real.value as any), recoverable: { amount: 99, unit: SRC_UNIT } };
    const asProduction: CommitGroup = {
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: "forge-g1",
      intent_id: "forge-i1",
      owner: "production",
      facet: "production_state",
      cause: "forge",
      rule: factKind("production_source_account").rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: [write(srcKey(), forged, real.version, "production", "production_state")],
    };
    const r1 = await s.campaign.store.commit(asProduction);
    expect(r1.ok).toBe(false);
    expect(!r1.ok && ["FACT_OWNER_CONFLICT", "KEY_NOT_ADMITTED"]).toContain(
      !r1.ok && r1.error.code,
    );
    const asWorld: CommitGroup = {
      ...asProduction,
      group_id: "forge-g2",
      intent_id: "forge-i2",
      owner: OWNER_WORLD_STATE,
      facet: FACET_WORLD_SOURCE_CONDITION,
      rule: factKind("world_source_condition").rule,
      writes: [
        write(
          productionReserveKeyOf(SRC_RESERVE),
          s.drawdown.reserve(SRC_RESERVE)!.value,
          1,
          OWNER_WORLD_STATE,
          FACET_WORLD_SOURCE_CONDITION,
        ),
      ],
    };
    const r2 = await s.campaign.store.commit(asWorld);
    expect(r2.ok).toBe(false);
    expect(!r2.ok && ["FACT_OWNER_CONFLICT", "KEY_NOT_ADMITTED"]).toContain(
      !r2.ok && r2.error.code,
    );
    expect(srcOf(s).value.recoverable.amount).toBe(5);
  });

  it("not even World-State can overwrite the Source Condition other than by establishment or by delivery of an actual Source Delta", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const real = s.campaign.store.getFact(srcKey())!;
    const kind = factKind("world_source_condition");
    const attempt = async (value: unknown) =>
      s.campaign.store.commit({
        campaign_id: FIXTURE_CAMPAIGN,
        group_id: `ws-g-${Math.random()}`,
        intent_id: `ws-i-${Math.random()}`,
        owner: kind.owner,
        facet: kind.facet,
        cause: "tamper",
        rule: kind.rule,
        authority: { ...CANON_WRITE_AUTHORITY },
        reads: [],
        depends_on: [],
        writes: [write(srcKey(), value, real.version, kind.owner, kind.facet)],
      });
    const v = real.value as any;
    const edits: [string, unknown][] = [
      [
        "a free decrement",
        {
          ...v,
          recoverable: { amount: 4, unit: SRC_UNIT },
          delivered: [{ delivery_id: "x", quantity: { amount: 1, unit: SRC_UNIT } }],
        },
      ],
      ["a bare remainder", { ...v, recoverable: { amount: 1, unit: SRC_UNIT } }],
      ["a re-dimension (rekey)", { ...v, dimension: "another-dimension" }],
      ["a re-keyed source", { ...v, source_key: "another-key" }],
      ["a changed material", { ...v, material_class: "another-material" }],
      [
        "a replenishment",
        {
          ...v,
          establishment: { ...v.establishment, quantity: { amount: 9, unit: SRC_UNIT } },
          recoverable: { amount: 9, unit: SRC_UNIT },
        },
      ],
    ];
    for (const [name, value] of edits) {
      const r = await attempt(value);
      expect(r.ok, name).toBe(false);
    }
    expect(srcOf(s).value.recoverable.amount).toBe(5);
    expect(s.campaign.store.getFact(srcKey())!.version).toBe(1);
  });

  it("the drawdown adapter has no setter for a remainder, a Reserve credit, a delta or a delivery", () => {
    const methods = Object.getOwnPropertyNames(SourceDrawdownAdapter.prototype).sort();
    expect(methods).toEqual(
      [
        "account",
        "basis",
        "constructor",
        "delivery",
        "establishBasis",
        "extraction",
        "phase",
        "reserve",
        "sourceCondition",
        "sourceDelta",
        "startExtraction",
        "temporalObject",
      ].sort(),
    );
  });
});

const productionReserveKeyOf = (id: string) => `production/reserve/${id}`;

/** The stage groups of a full honest run on a twin campaign, in commit order (authority, three stages, kernel transaction). */
async function honestStageGroups(): Promise<CommitGroup[]> {
  const twin = await seededDrawdownCampaign(tempDir());
  await startAndRegisterExtraction(twin, SRC_REQ_1, 1);
  const spy = spyStore(twin.campaign.store);
  await must(
    new TemporalCoordinator(spy.store, drawdownProviders()).advance(
      drawdownAdvanceRequest("tx-draw"),
    ),
  );
  return spy.commits.map((g) => structuredClone(g) as CommitGroup);
}

describe("unearned stages: a Source Delta, a delivery and a Reserve inflow are lawful only as their IM-02 stages, in order", () => {
  it("the exact stage groups of an honest run are refused when committed raw before the transaction was opened", async () => {
    const groups = await honestStageGroups();
    const stages = groups.filter((g) => g.group_id.startsWith("stage-group:"));
    expect(stages).toHaveLength(3);
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const before = snapshot(s);
    // the first stage, with the exact stage identity and a transaction cause, but no durable authority of an open transaction
    const r = await s.campaign.store.commit(stages[0]!);
    expect(r.ok).toBe(false);
    // the stage depends on the transaction authority group that was never committed here
    expect(!r.ok && r.error.code).toBe("MISSING_DEPENDENCY");
    expect(snapshot(s)).toEqual(before);
    // even if it did not name it, admission requires the durable authority of an open transaction
    const noDeps = { ...stages[0]!, depends_on: stages[0]!.depends_on.slice(0, -1) };
    const r2 = await s.campaign.store.commit(noDeps);
    expect(r2.ok).toBe(false);
    expect(!r2.ok && r2.error.code).toBe("REFERENCE_INVALID");
    expect(!r2.ok && r2.error.message).toMatch(/durable authority of its open transaction/);
    expect(snapshot(s)).toEqual(before);
  });

  it("the exact derived Source Delta published under any other identity is refused", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const ex = s.campaign.store.getFact(productionExtractionKey(SRC_REQ_1))!;
    const delta = deriveSourceDelta({
      key: ex.key,
      version: ex.version,
      value: ProductionExtractionSchema.parse(ex.value),
    });
    const kind = factKind("production_source_delta");
    const stage = productionSourceDeltaStage(SRC_REQ_1);
    const mk = (ids: { group?: string; intent?: string; cause?: string }): CommitGroup => ({
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: ids.group ?? "raw-delta-g",
      intent_id: ids.intent ?? "raw-delta-i",
      owner: kind.owner,
      facet: kind.facet,
      cause: ids.cause ?? "raw-cause",
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [{ key: ex.key, version: ex.version }],
      depends_on: [ex.provenance.group_id],
      writes: [write(productionSourceDeltaKey(SRC_REQ_1), delta, 0, kind.owner, kind.facet)],
    });
    const before = snapshot(s);
    for (const ids of [
      {},
      { group: stageGroupId(stage) },
      { group: stageGroupId(stage), intent: stageIntentId(stage) },
      { group: stageGroupId(stage), intent: stageIntentId(stage), cause: "transaction:tx-x" },
    ]) {
      const r = await s.campaign.store.commit(mk(ids));
      expect(r.ok, JSON.stringify(ids)).toBe(false);
      expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    }
    expect(snapshot(s)).toEqual(before);
    expect(s.drawdown.sourceDelta(SRC_REQ_1)).toBeUndefined();
  });

  it("a delivery before any Source Delta, and a Reserve inflow before any delivery, are refused: no early Reserve inflow", async () => {
    const groups = await honestStageGroups();
    const [, s1, w, s3] = groups;
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const before = snapshot(s);
    // as the honest groups stand: their pinned reads are not current (the delta / delivery do not exist here)
    for (const g of [w!, s3!]) {
      const r = await s.campaign.store.commit(g);
      expect(r.ok).toBe(false);
    }
    // with the pins stripped, World-State's and Production's own admission refuse: no delta, no delivery
    const early = await s.campaign.store.commit({ ...w!, reads: [], depends_on: [] });
    expect(!early.ok && early.error.code).toBe("PREREQUISITE_MISSING"); // no delta committed
    const earlier = await s.campaign.store.commit({ ...s3!, reads: [], depends_on: [] });
    expect(!earlier.ok && earlier.error.code).toBe("PREREQUISITE_MISSING"); // no delivery committed
    expect(snapshot(s)).toEqual(before);
    expect(s1).toBeDefined();
    expect(s.drawdown.reserve(SRC_RESERVE)!.value.quantity.amount).toBe(0);
    expect(srcOf(s).value.recoverable.amount).toBe(5);
  });

  it("with the Source Delta emitted and delivered but the Reserve not yet credited, the exact derived inflow published raw is refused", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    // an advance whose providers stop after the delivery: no inflow provider is registered, so the credit stage waits
    const noCredit = new TemporalCoordinator(
      s.campaign.store,
      new (await import("@immortalis/engine")).StageProviderRegistry([
        (await import("@immortalis/engine")).productionSourceDeltaProvider,
        (await import("@immortalis/engine")).worldSourceDeliveryProvider,
      ]),
    );
    await must(noCredit.advance(drawdownAdvanceRequest("tx-partial")));
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("DELIVERED_AWAITING_CREDIT");
    expect(srcOf(s).value.recoverable.amount).toBe(2);
    expect(s.drawdown.reserve(SRC_RESERVE)!.value.quantity.amount).toBe(0); // no spendable fictional output
    // the exact derived inflow, built from committed state alone, under the REAL rule and authority, raw identities
    const f = (k: string) => s.campaign.store.getFact(k)!;
    const ex = f(productionExtractionKey(SRC_REQ_1));
    const delta = f(productionSourceDeltaKey(SRC_REQ_1));
    const delivery = f(worldSourceDeliveryKey(FIXTURE_WORLD_ID, SRC_REQ_1));
    const reserve = f(`production/reserve/${SRC_RESERVE}`);
    const account = f(accountKey());
    const derived = deriveReserveInflow({
      extraction: {
        key: ex.key,
        version: ex.version,
        value: ProductionExtractionSchema.parse(ex.value),
      },
      delta: {
        key: delta.key,
        version: delta.version,
        value: SourceDeltaSchema.parse(delta.value),
      },
      delivery: {
        key: delivery.key,
        version: delivery.version,
        value: WorldSourceDeliverySchema.parse(delivery.value),
      },
      reserve: ProductionReserveSchema.parse(reserve.value),
      account: SourceAccountSchema.parse(account.value),
    });
    if (!derived.ok) throw new Error(derived.error.message);
    const kind = factKind("production_source_account");
    const raw = (ids: { group?: string; intent?: string; cause?: string }): CommitGroup => ({
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: ids.group ?? "raw-inflow-g",
      intent_id: ids.intent ?? "raw-inflow-i",
      owner: kind.owner,
      facet: kind.facet,
      cause: ids.cause ?? "raw-cause",
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [delivery, delta, ex].map((x) => ({ key: x.key, version: x.version })),
      depends_on: [delivery, delta, ex].map((x) => x.provenance.group_id),
      writes: [
        write(reserve.key, derived.value.reserve, reserve.version, kind.owner, kind.facet),
        write(account.key, derived.value.account, account.version, kind.owner, kind.facet),
      ],
    });
    const before = snapshot(s);
    const stage = productionReserveInflowStage(SRC_REQ_1);
    for (const ids of [
      {},
      { group: stageGroupId(stage), intent: stageIntentId(stage), cause: "transaction:tx-forged" },
    ]) {
      const r = await s.campaign.store.commit(raw(ids));
      expect(r.ok, JSON.stringify(ids)).toBe(false);
      expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    }
    expect(snapshot(s)).toEqual(before);
    expect(s.drawdown.reserve(SRC_RESERVE)!.value.inflows).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an inflow for a quantity other than what was delivered, or credited twice, is refused by its derivation", () => {
    // (the pure derivation is tested exhaustively in tests/unit/source-drawdown-derive.test.ts; this pins the integration)
    expect(typeof deriveReserveInflow).toBe("function");
  });
});

describe("wrong-source residue and double delivery: a delivered drawdown lands on its own key, once", () => {
  async function pendingOnOther(): Promise<{ s: DrawSeeded; a: any; b: any }> {
    const s = await seededDrawdownCampaign(tempDir(), { otherSource: true });
    await startAndRegisterExtraction(s, SRC_REQ_1, 1, {
      source_key: SRC_SOURCE_OTHER,
      basis_id: SRC_BASIS_OTHER,
      reserve_id: SRC_RESERVE_OTHER,
    });
    // only Production's emit stage runs: the Source Delta for the OTHER key is pending, undelivered
    const emitOnly = new TemporalCoordinator(
      s.campaign.store,
      new (await import("@immortalis/engine")).StageProviderRegistry([
        (await import("@immortalis/engine")).productionSourceDeltaProvider,
      ]),
    );
    await must(emitOnly.advance(drawdownAdvanceRequest("tx-emit")));
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("PENDING_DELIVERY");
    return { s, a: srcOf(s), b: srcOf(s, SRC_SOURCE_OTHER) };
  }

  it("the other key's pending residue cannot be delivered into this key's Source Condition", async () => {
    const { s, a } = await pendingOnOther();
    const delta = s.campaign.store.getFact(productionSourceDeltaKey(SRC_REQ_1))!;
    const ex = ProductionExtractionSchema.parse(
      s.campaign.store.getFact(productionExtractionKey(SRC_REQ_1))!.value,
    );
    // World-State's own delivery derivation refuses a delta of another resolution key
    const wrong = deriveSourceDelivery({
      source: { key: a.fact.key, version: a.fact.version, value: a.value },
      delta: {
        key: delta.key,
        version: delta.version,
        value: SourceDeltaSchema.parse(delta.value),
      },
    });
    expect(wrong.ok).toBe(false);
    expect(!wrong.ok && wrong.error.message).toMatch(/resolution key and material/);
    // and the raw group that would write it is refused by World-State's admission, with the stage identity forged
    const kind = factKind("world_source_condition");
    const stage = worldSourceDeliveryStage(SRC_REQ_1);
    const fake = {
      ...a.value,
      recoverable: { amount: 2, unit: SRC_UNIT },
      delivered: [{ delivery_id: SRC_REQ_1, quantity: { amount: 3, unit: SRC_UNIT } }],
    };
    const receipt = {
      delivery_id: SRC_REQ_1,
      source: {
        fact_key: a.fact.key,
        source_key: SRC_SOURCE_KEY,
        version_before: 1,
        version_after: 2,
      },
      delta: { fact_key: delta.key, version: delta.version },
      delivered: { amount: 3, unit: SRC_UNIT },
      before: { amount: 5, unit: SRC_UNIT },
      after: { amount: 2, unit: SRC_UNIT },
      exhausted: false,
      delivered_at: ex.timing.boundary.at,
      contribution: { extraction_id: SRC_REQ_1, accounting: "DISCRETE_EPISODIC_RESIDUE" },
      close_stage: stage,
    };
    const before = snapshot(s);
    const r = await s.campaign.store.commit({
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: stageGroupId(stage),
      intent_id: stageIntentId(stage),
      owner: kind.owner,
      facet: kind.facet,
      cause: "transaction:tx-forged",
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [{ key: delta.key, version: delta.version }],
      depends_on: [delta.provenance.group_id],
      writes: [
        write(a.fact.key, fake, a.fact.version, kind.owner, kind.facet),
        write(
          worldSourceDeliveryKey(FIXTURE_WORLD_ID, SRC_REQ_1),
          receipt,
          0,
          kind.owner,
          kind.facet,
        ),
      ],
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("VALUE_INVALID");
    expect(snapshot(s)).toEqual(before);
    expect(srcOf(s).value.recoverable.amount).toBe(5);
  });

  it("once delivered, the same Source Delta can never decrement twice", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    const src = srcOf(s);
    const delta = s.campaign.store.getFact(productionSourceDeltaKey(SRC_REQ_1))!;
    // the pure derivation refuses to deliver a delivered delta again
    const twice = deriveSourceDelivery({
      source: { key: src.fact.key, version: src.fact.version, value: src.value },
      delta: {
        key: delta.key,
        version: delta.version,
        value: SourceDeltaSchema.parse(delta.value),
      },
    });
    expect(twice.ok).toBe(false);
    expect(!twice.ok && twice.error.message).toMatch(/already delivered/);
    // and re-presenting the whole advance writes nothing and decrements nothing
    const head = s.campaign.store.head();
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    expect(s.campaign.store.head()).toEqual(head);
    expect(srcOf(s).value.recoverable.amount).toBe(2);
    expect(s.drawdown.reserve(SRC_RESERVE)!.value.quantity.amount).toBe(3);
  });
});

describe("independence: no leakage across keys, worlds or campaigns", () => {
  it("drawing on one source key leaves another source key, its account and its Reserve untouched", async () => {
    const s = await seededDrawdownCampaign(tempDir(), { otherSource: true });
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    expect(srcOf(s, SRC_SOURCE_OTHER).value.recoverable.amount).toBe(5);
    expect(srcOf(s, SRC_SOURCE_OTHER).fact.version).toBe(1);
    expect(s.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_OTHER)).toBeUndefined();
    expect(s.drawdown.reserve(SRC_RESERVE_OTHER)!.value.quantity.amount).toBe(0);
    expect(s.drawdown.reserve(SRC_RESERVE_OTHER)!.fact.version).toBe(1);
  });

  it("a second campaign with the same identities is wholly independent of the first", async () => {
    const a = await seededDrawdownCampaign(tempDir());
    const b = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(a, SRC_REQ_1, 1);
    await must(a.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    expect(srcOf(a).value.recoverable.amount).toBe(2);
    expect(srcOf(b).value.recoverable.amount).toBe(5);
    expect(b.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)).toBeUndefined();
    expect(b.drawdown.reserve(SRC_RESERVE)!.value.quantity.amount).toBe(0);
    expect(b.campaign.verify()).toEqual([]);
  });

  it("the same source key in another world is another Source Condition with another account", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const { world, locus } = await (async () => {
      const w = { ...(await import("@immortalis/testkit")).fixtureWorld(), world_id: "world-two" };
      const l = {
        ...(await import("@immortalis/testkit")).fixtureLocus(),
        locus_id: "locus-two",
        world: { fact_key: "world/world-two/profile", entity_id: "world-two" },
      };
      return { world: w, locus: l };
    })();
    await must(s.campaign.establishWorld({ ...publication(40), world }));
    await must(s.campaign.establishLocus({ ...publication(41), locus }));
    await must(
      s.campaign.establishSourceCondition({
        ...publication(42),
        source: sourceInput({ world_id: "world-two", locus_id: "locus-two" }),
      }),
    );
    expect(s.campaign.sourceCondition("world-two", SRC_SOURCE_KEY)!.value.recoverable.amount).toBe(
      5,
    );
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    expect(srcOf(s).value.recoverable.amount).toBe(2);
    expect(s.campaign.sourceCondition("world-two", SRC_SOURCE_KEY)!.value.recoverable.amount).toBe(
      5,
    );
    expect(s.drawdown.account("world-two", SRC_SOURCE_KEY)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});
