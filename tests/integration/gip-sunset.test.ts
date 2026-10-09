/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and state values */
// GIP Governance Instrument Sunset Foundation (sunset slice) — Deterministic GIP Governance Instrument Sunset / Temporal
// Earned-Boundary Lifecycle Close (WS-007 §4.1 `lifecycle_status`, §4.3 `sunset_condition`, §21.2; Amendment A7; F-014B Turnless
// Temporal; F-017 stage identity). A GIP-authored, already committed `active` Instrument with an exact `sunset_condition` becomes
// `expired` ONLY after the Temporal kernel's earned later boundary is reached and GIP's own authorized lifecycle stage commits.
// The outcome is determined by the REGISTERED term and canonical time: no fixture here authors an `expired` Instrument, supplies a
// `due` flag or hands the stage the answer. Register lineage: IA-01/02/03/04/06 (partial), IA-22 (partial); RC-02/05/10/16; IM-02,
// IM-06, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-007. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  GIP_SUNSET_ENROLLMENT_KEY,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  gipInstrumentKey,
  gipSunsetBoundaryId,
  gipSunsetObjectId,
  gipSunsetStage,
  temporalObjectKey,
  temporalTransactionKey,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import {
  GIP_INSTRUMENT_RULE,
  readGovernanceInstrument,
  stageGroupId,
  stageIntentId,
  verifyGipIntegrity,
  verifyTemporalIntegrity,
} from "@immortalis/engine";
import {
  GOVERNING_ORDER_REF_A,
  GOVERNING_ORDER_REF_B,
  INSTRUMENT_A,
  INSTRUMENT_B,
  PREDECESSOR_INSTRUMENT_REF_A,
} from "@immortalis/testkit";
import { reopenGip } from "../support/gip.ts";
import {
  omit,
  OTHER_SUNSET_AT,
  SUNSET_AT,
  SUNSET_LATER,
  SUNSET_MID,
  SUNSET_START,
  advanceTo,
  at,
  establishSunset,
  instrumentOf,
  seededSunsetCampaign,
  sunsetInstrument,
  wireSunset,
} from "../support/gip-sunset.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const lifecycle = (s: Parameters<typeof instrumentOf>[0], id = INSTRUMENT_A) =>
  (instrumentOf(s, id)!.value as GovernanceInstrument).lifecycle_status;
const index = (s: Parameters<typeof instrumentOf>[0]) =>
  (s.campaign.store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)?.value as any)?.entries ?? [];
const withoutLifecycle = (v: unknown) => {
  return omit(v as GovernanceInstrument, "lifecycle_status");
};

/** An Instrument that exercises every field the sunset must leave alone. */
const richInstrument = (id = INSTRUMENT_A, sunset = SUNSET_AT) =>
  sunsetInstrument(id, sunset, {
    operative_effect: "authority_grant",
    predecessor_instrument_ref: PREDECESSOR_INSTRUMENT_REF_A,
    validity_by_order: [
      { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
      { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "void" },
      { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "contested" },
    ],
  });

describe("establishment: a committed active Instrument with an exact future sunset, enrolled with the Temporal kernel", () => {
  it("GIP publishes the Instrument and its enrollment receipt in one group, the kernel registers the derived object, and nothing is executed or expired", async () => {
    const s = await seededSunsetCampaign(tempDir());
    const before = s.campaign.store.head();
    const authored = richInstrument();
    const out = await establishSunset(s, 4, authored);

    expect(out.instrument.replayed).toBe(false);
    expect(out.registration.replayed).toBe(false);
    // exactly two commits: GIP's publication, then the kernel's registration
    expect(s.campaign.store.head().revision).toBe(before.revision + 2);

    const instrument = instrumentOf(s)!;
    expect([instrument.owner, instrument.facet, instrument.version]).toEqual([
      "gip",
      "gip_institution_identity",
      1,
    ]);
    expect(instrument.value).toEqual(authored);
    expect(lifecycle(s)).toBe("active");
    expect(instrument.provenance.rule).toEqual(GIP_INSTRUMENT_RULE);

    // GIP's own enrollment receipt: which Instrument, the exact sunset, and the canonical time of the commit
    const receipt = s.campaign.store.getFact(GIP_SUNSET_ENROLLMENT_KEY)!;
    expect([receipt.owner, receipt.version]).toEqual(["gip", 1]);
    expect(receipt.value).toEqual({
      instrument_id: INSTRUMENT_A,
      sunset_at: SUNSET_AT,
      basis_time: SUNSET_START,
    });
    expect(receipt.provenance.group_id).toBe(instrument.provenance.group_id);
    expect(s.gip.sunsetEnrollment()?.registered).toBe(true);

    // the kernel owns the object, its timestamp, boundary identity and index; it is not GIP's fact
    const object = s.campaign.store.getFact(temporalObjectKey(gipSunsetObjectId(INSTRUMENT_A)))!;
    expect([object.owner, object.version]).toEqual(["temporal_kernel", 1]);
    expect((object.value as any).next_boundary).toEqual({
      boundary_id: gipSunsetBoundaryId(INSTRUMENT_A),
      at: SUNSET_AT,
    });
    expect(index(s)).toEqual([
      {
        object_id: gipSunsetObjectId(INSTRUMENT_A),
        boundary_id: gipSunsetBoundaryId(INSTRUMENT_A),
        at: SUNSET_AT,
      },
    ]);

    // registration is not execution: time did not move, no transaction exists, no second Instrument was created
    expect((s.campaign.store.getFact("temporal/state")!.value as any).canonical_time).toEqual(
      SUNSET_START,
    );
    expect(s.campaign.store.getFact(temporalTransactionKey("tx-1"))).toBeUndefined();
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("gip/instrument/")),
    ).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a plain Instrument (no sunset) is unaffected: it registers nothing, writes no receipt and never expires", async () => {
    const s = await seededSunsetCampaign(tempDir());
    const plain = omit(sunsetInstrument(), "sunset_condition");
    await must(
      s.gip.establishGovernanceInstrument({
        group_id: "g-plain",
        intent_id: "i-plain",
        cause: "c-plain",
        basis: "b",
        secrecy: "s",
        instrument: plain,
      }),
    );
    expect(s.campaign.store.getFact(GIP_SUNSET_ENROLLMENT_KEY)).toBeUndefined();
    expect(index(s)).toEqual([]);
    await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_LATER)));
    expect(lifecycle(s)).toBe("active");
    expect(instrumentOf(s)!.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the earned-boundary lifecycle close: active → expired exactly at the sunset, never before, never twice", () => {
  it("before the boundary the Instrument stays active; at the boundary GIP's own stage expires it once, changing nothing but lifecycle_status", async () => {
    const s = await seededSunsetCampaign(tempDir());
    const authored = richInstrument();
    await establishSunset(s, 4, authored);

    // before: advancing short of the sunset resolves nothing and leaves the Instrument and its boundary exactly as they were
    const early = await must(s.coordinator.advance(advanceTo("tx-early", SUNSET_MID)));
    expect(early.transaction.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(early.transaction.engaged).toEqual([]);
    expect(early.transaction.stages).toEqual([]);
    expect(lifecycle(s)).toBe("active");
    expect(instrumentOf(s)!.version).toBe(1);
    expect(index(s)).toHaveLength(1);

    // at: the separately registered boundary is reached and the Instrument expires once
    const atSunset = await must(s.coordinator.advance(advanceTo("tx-at", SUNSET_AT)));
    const tx = atSunset.transaction;
    expect(tx.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(tx.outcome.actual_stop).toEqual(SUNSET_AT);
    expect(tx.boundaries_crossed).toEqual([
      {
        object_id: gipSunsetObjectId(INSTRUMENT_A),
        boundary_id: gipSunsetBoundaryId(INSTRUMENT_A),
        at: SUNSET_AT,
      },
    ]);
    expect(tx.engaged.map((e) => [e.object_id, e.boundary])).toEqual([
      [gipSunsetObjectId(INSTRUMENT_A), "RETIRED"],
    ]);
    expect(tx.stages.map((x) => x.stage)).toEqual([gipSunsetStage(INSTRUMENT_A)]);
    expect(tx.stages[0]!.writes).toEqual([{ key: gipInstrumentKey(INSTRUMENT_A), version: 2 }]);
    expect(tx.stages[0]!.reads.map((r) => r.source.fact_key)).toEqual([
      "gip/institution/institution-court-1/office/office-magistrate-1",
      "gip/institution/institution-court-1/office/office-magistrate-1/scope-binding/scope-binding-a-1",
    ]);

    // the observable result: the same exact-key slot, one version on, owned and committed by GIP's own stage
    const after = instrumentOf(s)!;
    expect([after.owner, after.facet, after.version]).toEqual([
      "gip",
      "gip_institution_identity",
      2,
    ]);
    expect(lifecycle(s)).toBe("expired");
    expect(after.provenance.group_id).toBe(stageGroupId(gipSunsetStage(INSTRUMENT_A)));
    expect(after.provenance.intent_id).toBe(stageIntentId(gipSunsetStage(INSTRUMENT_A)));
    expect(after.provenance.cause).toBe("transaction:tx-at");
    expect(after.provenance.rule).toEqual(GIP_INSTRUMENT_RULE);
    // every non-lifecycle governed field is unchanged: source office, Scope Binding, authority basis, operative_effect,
    // validity_by_order[] (all three entries, in order, repeated reference included), predecessor reference and the term itself
    expect(withoutLifecycle(after.value)).toEqual(withoutLifecycle(authored));
    expect((after.value as GovernanceInstrument).validity_by_order).toEqual(
      authored.validity_by_order,
    );
    // the kernel retired the boundary; no entry is left and the object resolves to the boundary
    expect(index(s)).toEqual([]);
    const object = s.campaign.store.getFact(temporalObjectKey(gipSunsetObjectId(INSTRUMENT_A)))!;
    expect((object.value as any).next_boundary).toBeNull();
    expect((object.value as any).last_resolved_basis).toEqual(SUNSET_AT);
    expect(object.version).toBe(2);
    // the receipt is history, not a result: it was not touched
    expect(s.campaign.store.getFact(GIP_SUNSET_ENROLLMENT_KEY)!.version).toBe(1);

    // a later exact-key read reports the inactive lifecycle, through the lawful read path
    expect(readGovernanceInstrument(s.campaign.store, INSTRUMENT_A)?.value.lifecycle_status).toBe(
      "expired",
    );
    expect(s.gip.governanceInstrument(INSTRUMENT_A)?.value.lifecycle_status).toBe("expired");
    expect(s.campaign.verify()).toEqual([]);
    expect(verifyGipIntegrity(s.campaign.store)).toEqual([]);
    expect(verifyTemporalIntegrity(s.campaign.store)).toEqual([]);
  });

  it("one advance past the sunset resolves AT the sunset instant (never at the requested horizon) and stops at the requested target", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s);
    const r = await must(s.coordinator.advance(advanceTo("tx-far", SUNSET_LATER)));
    expect(r.transaction.outcome.actual_stop).toEqual(SUNSET_LATER);
    expect(r.transaction.boundaries_crossed.map((b) => b.at)).toEqual([SUNSET_AT]);
    expect(lifecycle(s)).toBe("expired");
    expect((s.campaign.store.getFact("temporal/state")!.value as any).canonical_time).toEqual(
      SUNSET_LATER,
    );
    expect(instrumentOf(s)!.version).toBe(2);
  });

  it("the outcome is determined by the REGISTERED term and canonical time: the same advance expires one Instrument and not another", async () => {
    const early = await seededSunsetCampaign(tempDir());
    const late = await seededSunsetCampaign(tempDir());
    await establishSunset(early, 4, sunsetInstrument(INSTRUMENT_A, SUNSET_AT));
    await establishSunset(late, 4, sunsetInstrument(INSTRUMENT_A, OTHER_SUNSET_AT));
    // the two authored Instruments differ in nothing but the term
    expect(withoutSunset(instrumentOf(early)!.value)).toEqual(
      withoutSunset(instrumentOf(late)!.value),
    );
    await must(early.coordinator.advance(advanceTo("tx-1", at(220))));
    await must(late.coordinator.advance(advanceTo("tx-1", at(220))));
    expect(lifecycle(early)).toBe("expired");
    expect(lifecycle(late)).toBe("active");
    // …and the later one expires exactly when its own boundary is reached
    const exactly = await must(late.coordinator.advance(advanceTo("tx-2", OTHER_SUNSET_AT)));
    expect(exactly.transaction.boundaries_crossed.map((b) => b.at)).toEqual([OTHER_SUNSET_AT]);
    expect(lifecycle(late)).toBe("expired");
  });

  it("an instant one coordinate short of the sunset does not expire; the sunset coordinate does (no early, no late expiry)", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s);
    await must(s.coordinator.advance(advanceTo("tx-1", at(SUNSET_AT.value - 1))));
    expect(lifecycle(s)).toBe("active");
    expect(index(s)).toHaveLength(1);
    const r = await must(s.coordinator.advance(advanceTo("tx-2", SUNSET_AT)));
    expect(r.transaction.engaged).toHaveLength(1);
    expect(lifecycle(s)).toBe("expired");
  });

  it("a requested stop condition naming the sunset boundary is satisfied exactly by its crossing: the transaction stops there with the Instrument expired", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s);
    const r = await must(
      s.coordinator.advance(
        advanceTo("tx-cond", SUNSET_LATER, {
          requested: {
            target: SUNSET_LATER,
            condition: {
              kind: "STOP_AFTER_BOUNDARY",
              object_id: gipSunsetObjectId(INSTRUMENT_A),
              boundary_id: gipSunsetBoundaryId(INSTRUMENT_A),
            },
          },
        }),
      ),
    );
    expect(r.transaction.outcome.stop_reason).toBe("CONDITION_SATISFIED");
    expect(r.transaction.outcome.actual_stop).toEqual(SUNSET_AT);
    expect(lifecycle(s)).toBe("expired");
    expect(r.transaction.outcome.remainder?.to).toEqual(SUNSET_LATER);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("two Instruments sunsetting at the same instant expire in one transaction, each by its own stage, neither disturbing the other", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s, 4, sunsetInstrument(INSTRUMENT_A, SUNSET_AT));
    await establishSunset(s, 5, sunsetInstrument(INSTRUMENT_B, SUNSET_AT));
    const r = await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_AT)));
    expect(
      r.transaction.stages
        .map((x) => x.stage)
        .sort((a, b) => a.causal_process_id.localeCompare(b.causal_process_id)),
    ).toEqual([gipSunsetStage(INSTRUMENT_A), gipSunsetStage(INSTRUMENT_B)]);
    expect(lifecycle(s, INSTRUMENT_A)).toBe("expired");
    expect(lifecycle(s, INSTRUMENT_B)).toBe("expired");
    expect([
      instrumentOf(s, INSTRUMENT_A)!.version,
      instrumentOf(s, INSTRUMENT_B)!.version,
    ]).toEqual([2, 2]);
    expect(index(s)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the Instrument is expired once: the committed transaction replays, a further advance neither re-expires nor rewrites it", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s);
    await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_AT)));
    const settled = s.campaign.store.head();
    const fact = structuredClone(instrumentOf(s));

    const replay = await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_AT)));
    expect(replay.replayed).toBe(true);
    expect(s.campaign.store.head()).toEqual(settled);

    await must(s.coordinator.advance(advanceTo("tx-2", SUNSET_LATER)));
    expect(instrumentOf(s)).toEqual(fact);
    expect(instrumentOf(s)!.version).toBe(2);
    expect(index(s)).toEqual([]);
  });

  it("an Instrument that is not enrolled with a sunset never expires, however far time moves", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s, 4, sunsetInstrument(INSTRUMENT_A, SUNSET_AT));
    const plain = omit(sunsetInstrument(INSTRUMENT_B), "sunset_condition");
    await must(
      s.gip.establishGovernanceInstrument({
        group_id: "g-b",
        intent_id: "i-b",
        cause: "c-b",
        basis: "b",
        secrecy: "s",
        instrument: plain,
      }),
    );
    await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_LATER)));
    expect(lifecycle(s, INSTRUMENT_A)).toBe("expired");
    expect(lifecycle(s, INSTRUMENT_B)).toBe("active");
    expect(instrumentOf(s, INSTRUMENT_B)!.version).toBe(1);
  });

  it("successive sunset-bearing Instruments each earn their own object and expire at their own instants", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s, 4, sunsetInstrument(INSTRUMENT_A, SUNSET_AT));
    await establishSunset(s, 5, sunsetInstrument(INSTRUMENT_B, OTHER_SUNSET_AT));
    expect(s.campaign.store.getFact(GIP_SUNSET_ENROLLMENT_KEY)!.version).toBe(2);
    expect(index(s).map((e: any) => e.object_id)).toEqual([
      gipSunsetObjectId(INSTRUMENT_A),
      gipSunsetObjectId(INSTRUMENT_B),
    ]);
    await must(s.coordinator.advance(advanceTo("tx-1", at(220))));
    expect([lifecycle(s, INSTRUMENT_A), lifecycle(s, INSTRUMENT_B)]).toEqual(["expired", "active"]);
    await must(s.coordinator.advance(advanceTo("tx-2", SUNSET_LATER)));
    expect([lifecycle(s, INSTRUMENT_A), lifecycle(s, INSTRUMENT_B)]).toEqual([
      "expired",
      "expired",
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });
});

const withoutSunset = (v: unknown) => {
  const rest = omit(v as GovernanceInstrument, "sunset_condition");
  return rest;
};

describe("save → close → load → continue preserves the registered term, the expiry and the single outcome", () => {
  it("a save taken before the boundary reopens active with its boundary, and the continuation expires it exactly once", async () => {
    const dir = tempDir();
    const s = await seededSunsetCampaign(dir);
    await establishSunset(s);
    await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_MID)));
    const saved = structuredClone(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("gip/") || f.key.startsWith("temporal/")),
    );
    await s.campaign.close();

    const r = wireSunset((await reopenGip(dir)).campaign);
    expect(r.campaign.verify()).toEqual([]);
    expect(
      r.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("gip/") || f.key.startsWith("temporal/")),
    ).toEqual(saved);
    expect(lifecycle(r)).toBe("active");
    expect(index(r)).toHaveLength(1);
    await must(r.coordinator.advance(advanceTo("tx-2", SUNSET_AT)));
    expect(lifecycle(r)).toBe("expired");
    expect(instrumentOf(r)!.version).toBe(2);
    await r.campaign.close();
  });

  it("a save taken after the expiry reopens expired with unchanged fields, and a retry of the committed transaction writes nothing", async () => {
    const dir = tempDir();
    const s = await seededSunsetCampaign(dir);
    const authored = richInstrument();
    await establishSunset(s, 4, authored);
    await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_AT)));
    const expired = structuredClone(instrumentOf(s));
    await s.campaign.close();

    const r = wireSunset((await reopenGip(dir)).campaign);
    expect(r.campaign.verify()).toEqual([]);
    expect(instrumentOf(r)).toEqual(expired);
    expect(r.gip.governanceInstrument(INSTRUMENT_A)?.value.lifecycle_status).toBe("expired");
    expect(withoutLifecycle(instrumentOf(r)!.value)).toEqual(withoutLifecycle(authored));
    const head = r.campaign.store.head();
    const replay = await must(r.coordinator.advance(advanceTo("tx-1", SUNSET_AT)));
    expect(replay.replayed).toBe(true);
    expect(r.campaign.store.head()).toEqual(head);
    // re-presenting the establishment does not re-create, re-enroll or revert anything
    const again = await must(
      r.gip.establishSunsetInstrument({ ...gipPublicationFor(4), instrument: authored }),
    );
    expect(again.instrument.replayed).toBe(true);
    expect(again.registration.replayed).toBe(true);
    expect(lifecycle(r)).toBe("expired");
    expect(r.campaign.store.head()).toEqual(head);
    await r.campaign.close();
  });
});

import { gipPublication as gipPublicationFor } from "@immortalis/testkit";
