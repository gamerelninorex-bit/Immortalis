/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and process output */
// Exact Finite Raw-Source Drawdown & Conserved Production Reserve Inflow — "the canonical campaign holds an exact, finite
// World-State Source Condition established BEFORE any request and Production's own, distinct Capability / Access basis;
// one separately authorized request for an exact amount of the same untransformed raw material is started; at its declared
// boundary the IM-02 kernel resolves, in dependency order, Production's Source Delta, World-State's net Source Condition
// (delivery) and — only after that — Production's Reserve inflow; the later source remainder and the Reserve increase are
// DERIVED by the owners, never supplied by a fixture, and a second request cannot draw what is spent."
// Register lineage: IA-01/02/03/04 (partial), IA-05 (bounded RC-06 partial), IA-06/IA-22 (reused / partial); RC-02/04/06/07/10/16;
// IM-02, IM-03, IM-05, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0). CAL-01 stays UNCALIBRATED
// (EXACT only), CAL-02/L-50 stays OPEN (no labor path), CAL-03 has no adopted number. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED). The fixture's five and three units are test evidence of one same-unit, non-transformative case.
import { describe, expect, it } from "vitest";
import {
  FACET_WORLD_SOURCE_CONDITION,
  TEMPORAL_STATE_KEY,
  productionExtractionKey,
  productionReserveKey,
  productionSourceAccountKey,
  productionSourceDeltaKey,
  temporalTransactionKey,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
} from "@immortalis/contracts";
import { TemporalCoordinator } from "@immortalis/engine";
import {
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  SRC_ACCESS,
  SRC_DIMENSION,
  SRC_ESTABLISHED,
  SRC_MATERIAL,
  SRC_REQ_1,
  SRC_REQ_2,
  SRC_REQ_3,
  SRC_REQUESTED,
  SRC_RESERVE,
  SRC_SOURCE_KEY,
  SRC_T0,
  SRC_TB,
  SRC_UNIT,
  drawdownAdvanceRequest,
  drawdownProviders,
  drawdownPublication,
  drawdownStopAtBoundaryRequest,
  srcAt,
  startExtractionInput,
  at,
} from "@immortalis/testkit";
import {
  drawSummary,
  reopenDrawdown,
  seededDrawdownCampaign,
  startAndRegisterExtraction,
} from "../support/source-drawdown.ts";
import {
  NULL_PC_COMMITTED,
  advanceNull,
  nullPcTransaction,
  trustedNullPcAdvance,
} from "../support/null-pc-advance.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const OP_EMIT = "production-emit-source-delta";
const OP_DELIVER = "world-state-deliver-source-drawdown";
const OP_CREDIT = "production-credit-reserve-inflow";
const srcOf = (s: Awaited<ReturnType<typeof seededDrawdownCampaign>>) =>
  s.drawdown.sourceCondition(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!;
const reserveOf = (s: Awaited<ReturnType<typeof seededDrawdownCampaign>>) =>
  s.drawdown.reserve(SRC_RESERVE)!;

describe("premises: an exact finite Source Condition (World-State) and Production's own Capability / Access basis", () => {
  it("the Source Condition is World-State's exact, finite truth, established before any extraction, with no remainder to be supplied", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const src = srcOf(s);
    expect(src.fact.owner).toBe("world_state");
    expect(src.fact.facet).toBe(FACET_WORLD_SOURCE_CONDITION);
    expect(src.fact.key).toBe(worldSourceConditionKey(FIXTURE_WORLD_ID, SRC_SOURCE_KEY));
    expect(src.value).toMatchObject({
      source_key: SRC_SOURCE_KEY,
      dimension: SRC_DIMENSION,
      material_class: SRC_MATERIAL,
      depth: "EXACT_FINITE",
      establishment: { kind: "INITIAL_SETTING_FACT", quantity: { amount: 5, unit: SRC_UNIT } },
      recoverable: { amount: SRC_ESTABLISHED, unit: SRC_UNIT },
      delivered: [],
      access_facts: [SRC_ACCESS],
      exhaustion: null,
    });
    expect(src.value.locality.locus.entity_id).toBe(FIXTURE_LOCUS_ID);
    // established before the extraction exists, by the world authority, nothing else in the campaign carries the figure
    expect(s.drawdown.extraction(SRC_REQ_1)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("Production's Capability / Access basis is its own, distinct fact: Tier A embedded, direct raw collection, naming the source-owned access fact", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const b = s.drawdown.basis("basis-main")!;
    expect(b.fact.owner).toBe("production");
    expect(b.value.capability).toEqual({
      kind: "DIRECT_RAW_PHYSICAL_COLLECTION",
      support: {
        tier: "TIER_A_EMBEDDED_BASELINE",
        labor: "NON_MATERIAL_EMBEDDED",
        specialist_competence: "NON_MATERIAL",
      },
    });
    expect(b.value.access).toEqual({
      mode: "DIRECT_PHYSICAL",
      relies_on: SRC_ACCESS,
      encumbrance: "NONE",
    });
    // capability / access carry no assertion that extraction can or did succeed
    expect(JSON.stringify(b.value)).not.toMatch(/can_extract|succeeded|yield|rate/i);
    // the source was not written by Production, and the basis not by World-State
    expect(srcOf(s).fact.owner).not.toBe(b.fact.owner);
  });
});

describe("the primary witness: five recoverable units, a separately authorized three-unit removal", () => {
  it("starting commits the commitment only: the source is unchanged, no Source Delta exists, the Reserve is empty", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const ex = s.drawdown.extraction(SRC_REQ_1)!.value;
    expect(ex.quantity).toEqual({ amount: SRC_REQUESTED, unit: SRC_UNIT }); // the REQUEST's quantity, pinned
    expect(ex.request).toMatchObject({ owner: "SYNTHETIC-PRODUCTION-REQUESTER", version: 1 });
    expect(ex.timing).toEqual({
      started_at: SRC_T0,
      boundary: { boundary_id: `boundary-extraction-${SRC_REQ_1}`, at: SRC_TB },
    });
    expect(ex.support_basis.labor).toBe("NON_MATERIAL_EMBEDDED");
    expect(JSON.stringify(ex)).not.toContain("synthetic-cause"); // a pinned request is referenced, never copied
    const account = s.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!.value;
    expect(account.open).toEqual([
      { extraction_id: SRC_REQ_1, quantity: { amount: 3, unit: SRC_UNIT } },
    ]);
    expect(account.watermark).toEqual(SRC_T0); // opened by the first admission, at that commit instant
    expect(srcOf(s).value.recoverable.amount).toBe(5);
    expect(reserveOf(s).value.quantity.amount).toBe(0);
    expect(s.drawdown.sourceDelta(SRC_REQ_1)).toBeUndefined();
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("COMMITTED");
    expect(s.coordinator.boundaryIndex().entries).toEqual([
      {
        object_id: `obj-extraction-${SRC_REQ_1}`,
        boundary_id: `boundary-extraction-${SRC_REQ_1}`,
        at: SRC_TB,
      },
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an advance short of the boundary changes nothing physical", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const r = await must(s.coordinator.advance(drawdownAdvanceRequest("tx-short", at(120))));
    expect(r.transaction.stages).toEqual([]);
    expect(srcOf(s).value.recoverable.amount).toBe(5);
    expect(reserveOf(s).value.quantity.amount).toBe(0);
    expect(s.drawdown.sourceDelta(SRC_REQ_1)).toBeUndefined();
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("COMMITTED");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("at the declared boundary the owners derive: source remainder two units, Reserve increase three units, in dependency order", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const r = await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    const t = r.transaction;
    expect(t.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(t.engaged.map((e) => e.boundary)).toEqual(["RETIRED"]);
    expect(t.boundaries_crossed).toEqual([
      {
        object_id: `obj-extraction-${SRC_REQ_1}`,
        boundary_id: `boundary-extraction-${SRC_REQ_1}`,
        at: SRC_TB,
      },
    ]);
    // owner order: Production emits, World-State delivers, Production credits
    expect(t.stages.map((x) => x.stage.owner_operation)).toEqual([
      { owner: "production", operation: OP_EMIT },
      { owner: "world_state", operation: OP_DELIVER },
      { owner: "production", operation: OP_CREDIT },
    ]);
    expect(t.stages[0]!.reads.map((x) => x.mode)).toEqual(["AS-OF-NOW"]);
    expect(t.stages[1]!.reads.map((x) => x.mode)).toEqual(["AS-OF-NOW"]);
    expect(t.stages[2]!.reads.map((x) => x.mode)).toEqual(["AS-OF-NOW", "AS-OF-NOW", "AS-OF-NOW"]);

    // the source truth is World-State's net, derived: 5 − 3
    const src = srcOf(s);
    expect(src.fact.owner).toBe("world_state");
    expect(src.value.recoverable).toEqual({ amount: 2, unit: SRC_UNIT });
    expect(src.value.delivered).toEqual([
      { delivery_id: SRC_REQ_1, quantity: { amount: 3, unit: SRC_UNIT } },
    ]);
    expect(src.value.exhaustion).toBeNull();
    expect(src.fact.version).toBe(2);
    // the Reserve is Production's, credited exactly the delivered quantity, once
    const reserve = reserveOf(s);
    expect(reserve.fact.owner).toBe("production");
    expect(reserve.value.quantity).toEqual({ amount: 3, unit: SRC_UNIT });
    expect(reserve.value.inflows).toEqual([
      { inflow_id: SRC_REQ_1, quantity: { amount: 3, unit: SRC_UNIT } },
    ]);
    expect(reserve.value.established).toEqual({ amount: 0, unit: SRC_UNIT });
    expect(reserve.value.consumed).toEqual([]);
    // conservation, both sides: established = recoverable + delivered; established + inflows = held + consumed
    expect(src.value.establishment.quantity.amount).toBe(
      src.value.recoverable.amount + src.value.delivered.reduce((n, d) => n + d.quantity.amount, 0),
    );
    expect(
      reserve.value.established.amount +
        reserve.value.inflows!.reduce((n, i) => n + i.quantity.amount, 0),
    ).toBe(reserve.value.quantity.amount + 0);
    // nothing was lost or created between the owners: what left the source is exactly what the Reserve holds
    expect(SRC_ESTABLISHED - src.value.recoverable.amount).toBe(reserve.value.quantity.amount);

    // the Production-caused Source Delta: cause, magnitude, precise source-resolution key, provenance; discrete, never a rate
    const delta = s.drawdown.sourceDelta(SRC_REQ_1)!;
    expect(delta.fact.version).toBe(1);
    expect(delta.value).toMatchObject({
      delta_id: SRC_REQ_1,
      cause: { kind: "PRODUCTION_EXTRACTION_DRAWDOWN" },
      magnitude: { amount: 3, unit: SRC_UNIT },
      source: { fact_key: src.fact.key, source_key: SRC_SOURCE_KEY },
      accounting: "DISCRETE_EPISODIC_RESIDUE",
      emitted_at: SRC_TB, // the declared boundary, never the requested horizon
    });
    // the delivery: World-State consumed the ACTUAL delta, net of it, at the boundary instant
    const delivery = s.drawdown.delivery(FIXTURE_WORLD_ID, SRC_REQ_1)!;
    expect(delivery.fact.owner).toBe("world_state");
    expect(delivery.value).toMatchObject({
      delivered: { amount: 3 },
      before: { amount: 5 },
      after: { amount: 2 },
      exhausted: false,
      delivered_at: SRC_TB,
      delta: { fact_key: delta.fact.key, version: delta.fact.version },
      source: { version_before: 1, version_after: 2 },
      contribution: { extraction_id: SRC_REQ_1, accounting: "DISCRETE_EPISODIC_RESIDUE" },
    });
    // the account closed the commitment and advanced the delivery watermark to the delivery
    const account = s.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!.value;
    expect(account.open).toEqual([]);
    expect(account.watermark).toEqual(SRC_TB);
    expect(s.drawdown.phase(SRC_REQ_1)).toBe("CREDITED");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the results are DERIVED by the owners, not carried by the fixture: other amounts give other remainders and increases", async () => {
    for (const amount of [1, 2, 4, 5]) {
      const s = await seededDrawdownCampaign(tempDir(), {
        requests: [{ id: SRC_REQ_1, amount }],
      });
      await startAndRegisterExtraction(s, SRC_REQ_1, 1);
      await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
      expect(srcOf(s).value.recoverable.amount, `remainder for ${amount}`).toBe(5 - amount);
      expect(reserveOf(s).value.quantity.amount, `increase for ${amount}`).toBe(amount);
      // PHYSICAL exhaustion is the source owner's fact, only when nothing physically remains
      expect(srcOf(s).value.exhaustion, `exhaustion for ${amount}`).toEqual(
        amount === 5 ? { kind: "PHYSICAL", delivery_id: SRC_REQ_1 } : null,
      );
      expect(s.campaign.verify()).toEqual([]);
    }
  });

  it("a later independent request for another three units is refused against the net source: it cannot draw what is spent, and nothing is recorded", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    const before = drawSummary(s.campaign, s.coordinator);
    const r = await s.drawdown.startExtraction({
      ...drawdownPublication(40),
      start: startExtractionInput(`synthetic-request/${SRC_REQ_2}`, {
        boundary_at: srcAt(400),
      }),
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe("CLAIM_INCOMPATIBLE");
    expect(!r.ok && (r.error.details as any).reason).toBe("INSUFFICIENT_RECOVERABLE");
    expect(!r.ok && (r.error.details as any)).toMatchObject({
      recoverable: 2,
      unclaimed: 2,
      requested: 3,
    });
    // nothing was credited or recorded: no extraction, no object, no change to the source, the account or the Reserve
    expect(s.drawdown.extraction(SRC_REQ_2)).toBeUndefined();
    expect(s.coordinator.object(`obj-extraction-${SRC_REQ_2}`)).toBeUndefined();
    expect(drawSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(srcOf(s).value.recoverable.amount).toBe(2);
    expect(reserveOf(s).value.quantity.amount).toBe(3);
    // what remains is still drawable, exactly: the same source supports two units, not three
    const ok2 = await s.drawdown.startExtraction({
      ...drawdownPublication(41),
      start: startExtractionInput(`synthetic-request/${SRC_REQ_3}`, { boundary_at: srcAt(400) }),
    });
    expect(!ok2.ok && ok2.error.code).toBe("CLAIM_INCOMPATIBLE"); // REQ_3 also asks for three
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the remaining two units are exactly drawable by a two-unit request, after which the source is physically exhausted and nothing more is drawable", async () => {
    const s = await seededDrawdownCampaign(tempDir(), {
      requests: [
        { id: SRC_REQ_1, amount: 3 },
        { id: SRC_REQ_2, amount: 2 },
        { id: SRC_REQ_3, amount: 1 },
      ],
    });
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-1", at(200))));
    await startAndRegisterExtraction(s, SRC_REQ_2, 2, { boundary_at: srcAt(300) });
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-2")));
    expect(srcOf(s).value.recoverable.amount).toBe(0);
    expect(srcOf(s).value.exhaustion).toEqual({ kind: "PHYSICAL", delivery_id: SRC_REQ_2 });
    expect(reserveOf(s).value.quantity.amount).toBe(5);
    expect(reserveOf(s).value.inflows!.map((i) => i.inflow_id)).toEqual([SRC_REQ_1, SRC_REQ_2]);
    const r = await s.drawdown.startExtraction({
      ...drawdownPublication(42),
      start: startExtractionInput(`synthetic-request/${SRC_REQ_3}`, { boundary_at: srcAt(400) }),
    });
    expect(!r.ok && r.error.code).toBe("CLAIM_INCOMPATIBLE");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("holds no second physical truth: the remaining endowment lives only in World-State; the Reserve only what it was credited", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    const facts = s.campaign.store.listFacts();
    // Production holds no remaining-endowment figure: no Production fact carries the source's recoverable field
    for (const f of facts.filter((x) => x.owner === "production"))
      expect(JSON.stringify(f.value), f.key).not.toContain('"recoverable"');
    // World-State holds no Reserve: nothing of its own names a Reserve quantity
    for (const f of facts.filter((x) => x.owner === "world_state" && /\/source/.test(x.key)))
      expect(JSON.stringify(f.value), f.key).not.toContain("reserve");
    expect(facts.filter((f) => f.key === srcOf(s).fact.key)).toHaveLength(1);
  });
});

describe("Turnless Temporal: earned, exact, horizon-independent, engaged-only", () => {
  it("resolves at its own declared boundary whatever the requested horizon, and any slicing reaches the same state", async () => {
    const a = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(a, SRC_REQ_1, 1);
    await must(a.coordinator.advance(drawdownAdvanceRequest("tx-far", srcAt(5000))));
    const b = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(b, SRC_REQ_1, 1);
    await must(b.coordinator.advance(drawdownAdvanceRequest("tx-a", at(120))));
    await must(b.coordinator.advance(drawdownAdvanceRequest("tx-b", at(139))));
    await must(b.coordinator.advance(drawdownAdvanceRequest("tx-c", srcAt(5000))));
    const view = (s: typeof a) => ({
      source: srcOf(s).value,
      reserve: reserveOf(s).value,
      delta: s.drawdown.sourceDelta(SRC_REQ_1)!.value,
      delivery: s.drawdown.delivery(FIXTURE_WORLD_ID, SRC_REQ_1)!.value,
      account: s.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!.value,
    });
    expect(view(a)).toEqual(view(b));
    expect(view(a).delta.emitted_at).toEqual(SRC_TB);
    expect(view(a).delivery.delivered_at).toEqual(SRC_TB);
  });

  it("an object is stage-identity stable: its three stages carry the ids derived from the extraction, not a horizon or a retry", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownStopAtBoundaryRequest("tx-stop", SRC_REQ_1)));
    const tx = s.campaign.store.getFact(temporalTransactionKey("tx-stop"))!.value as any;
    expect(tx.stages.map((x: any) => x.stage.causal_process_id)).toEqual([
      `production-extraction:${SRC_REQ_1}`,
      `production-extraction:${SRC_REQ_1}`,
      `production-extraction:${SRC_REQ_1}`,
    ]);
    expect(tx.stages.map((x: any) => x.stage.prospective_result_id)).toEqual([
      `source-delta:${SRC_REQ_1}`,
      `source-delivery:${SRC_REQ_1}`,
      `reserve-inflow:${SRC_REQ_1}`,
    ]);
    expect(tx.outcome.actual_stop).toEqual(SRC_TB);
  });

  it("only the engaged extraction becomes active: an unrelated key's account and Reserve are neither read, staged nor written, and nothing is scanned", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const spy = spyStore(s.campaign.store);
    const coordinator = new TemporalCoordinator(spy.store, drawdownProviders());
    await must(coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    expect(spy.listCalls()).toBe(0);
    const allowed = [
      TEMPORAL_STATE_KEY,
      productionExtractionKey(SRC_REQ_1),
      productionSourceDeltaKey(SRC_REQ_1),
      worldSourceDeliveryKey(FIXTURE_WORLD_ID, SRC_REQ_1),
      worldSourceConditionKey(FIXTURE_WORLD_ID, SRC_SOURCE_KEY),
      productionReserveKey(SRC_RESERVE),
      productionSourceAccountKey(FIXTURE_WORLD_ID, SRC_SOURCE_KEY),
    ];
    const touched = new Set(
      spy.getFacts.filter(
        (k) => !k.startsWith("temporal/") && !k.startsWith("synthetic-") && !k.startsWith("gip/"),
      ),
    );
    for (const k of touched) expect(allowed, k).toContain(k);
    expect(spy.commits.map((g) => g.owner)).toEqual([
      "temporal_kernel", // the transaction's durable authority, opened before any owner stage
      "production",
      "world_state",
      "production",
      "temporal_kernel",
    ]);
  });
});

describe("the shipped player-authorized NULL-PC OOC advance resolves the drawdown through the real owners", () => {
  it("a target past the boundary commits the whole chain once, and a retry by identity writes nothing", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    expect(
      await advanceNull(
        trustedNullPcAdvance(s, {
          target: srcAt(5000),
          transaction: nullPcTransaction("tx-null-draw"),
        }),
      ),
    ).toEqual(NULL_PC_COMMITTED);
    expect(srcOf(s).value.recoverable.amount).toBe(2);
    expect(reserveOf(s).value.quantity.amount).toBe(3);
    const head = s.campaign.store.head();
    expect(
      await advanceNull(
        trustedNullPcAdvance(s, {
          target: srcAt(5000),
          transaction: nullPcTransaction("tx-null-draw"),
        }),
      ),
    ).toEqual(NULL_PC_COMMITTED);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("persistence: one canon, replayed and reopened", () => {
  it("save → close → load before the boundary continues to the same result as an uninterrupted run", async () => {
    const dir = tempDir();
    const s = await seededDrawdownCampaign(dir);
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const before = drawSummary(s.campaign, s.coordinator);
    await s.campaign.close();
    const re = await reopenDrawdown(dir);
    expect(re.campaign.verify()).toEqual([]);
    expect(drawSummary(re.campaign, re.coordinator)).toEqual(before);
    await must(re.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    const straight = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(straight, SRC_REQ_1, 1);
    await must(straight.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    const state = (x: typeof re) => ({
      source: srcOf(x).value,
      reserve: reserveOf(x).value,
      account: x.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!.value,
    });
    expect(state(re)).toEqual(state(straight));
    expect(re.campaign.verify()).toEqual([]);
  });

  it("save → close → load after the boundary preserves the net source and the Reserve, and a later request still cannot draw what is spent", async () => {
    const dir = tempDir();
    const s = await seededDrawdownCampaign(dir);
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    await must(s.coordinator.advance(drawdownAdvanceRequest("tx-draw")));
    const before = drawSummary(s.campaign, s.coordinator);
    await s.campaign.close();
    const re = await reopenDrawdown(dir);
    expect(re.campaign.verify()).toEqual([]);
    expect(drawSummary(re.campaign, re.coordinator)).toEqual(before);
    expect(srcOf(re).value.recoverable.amount).toBe(2);
    expect(reserveOf(re).value.quantity.amount).toBe(3);
    const r = await re.drawdown.startExtraction({
      ...drawdownPublication(70),
      start: startExtractionInput(`synthetic-request/${SRC_REQ_2}`, { boundary_at: srcAt(400) }),
    });
    expect(!r.ok && r.error.code).toBe("CLAIM_INCOMPATIBLE");
  });

  it("registering the extraction's object twice or starting it twice creates nothing twice", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    await startAndRegisterExtraction(s, SRC_REQ_1, 1);
    const again = await s.drawdown.startExtraction({
      ...drawdownPublication(99),
      start: startExtractionInput(`synthetic-request/${SRC_REQ_1}`),
    });
    expect(!again.ok && again.error.code).toBe("VERSION_CONFLICT");
    const reg = await s.coordinator.registerObject({
      group_id: "reg-g-dup",
      intent_id: "reg-i-dup",
      cause: "reg-c-dup",
      basis: "b",
      secrecy: "s",
      object: s.drawdown.temporalObject(SRC_REQ_1)!,
    });
    expect(reg.ok).toBe(false);
    expect(s.drawdown.account(FIXTURE_WORLD_ID, SRC_SOURCE_KEY)!.value.open).toHaveLength(1);
  });
});

describe("a re-presented start reconciles by identity (RC-16)", () => {
  it("identical input reaches the original receipt; a changed input is refused as a conflict", async () => {
    const s = await seededDrawdownCampaign(tempDir());
    const start = startExtractionInput(`synthetic-request/${SRC_REQ_1}`);
    const first = await must(s.drawdown.startExtraction({ ...drawdownPublication(50), start }));
    const replay = await must(s.drawdown.startExtraction({ ...drawdownPublication(50), start }));
    expect(replay.replayed).toBe(true);
    expect(replay.receipt).toEqual(first.receipt);
    const changed = await s.drawdown.startExtraction({
      ...drawdownPublication(50),
      start: { ...start, boundary_at: srcAt(150) },
    });
    expect(changed.ok).toBe(false);
    expect(!changed.ok && changed.error.code).toBe("INTENT_CONFLICT");
    expect(s.drawdown.extraction(SRC_REQ_1)!.value.timing.boundary.at).toEqual(SRC_TB);
  });
});
