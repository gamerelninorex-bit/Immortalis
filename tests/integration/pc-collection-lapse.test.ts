/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and tamper with raw facts */
// R-4 — BLUE Lapse Settlement v1.2 (NEWLY AUTHORIZED; independent BLUE review pending). Positive AND falsifying, each from a real campaign
// driven through the existing gateways; the only new surface is the mechanical settlement presenter. Nothing is a real player or GM.
import { describe, expect, it } from "vitest";
import {
  PlayerCharacterBindingSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  productionSourceAccountKey,
} from "@immortalis/contracts";
import {
  PcCollectionAdapter,
  POPULATION_PC_OCCUPANCY_LAPSE_RULE,
  TEMPORAL_PC_COLLECTION_LAPSE_RETIREMENT_RULE,
  acceptableHeldLineage,
  lapseLineageHolds,
  lapseReasonClass,
} from "@immortalis/engine";
import { advanceToRequest, FIXTURE_LOCUS_ID } from "@immortalis/testkit";
import {
  ACT_A,
  COLLECTION_REFUSAL,
  PC,
  SRC_SOURCE_KEY,
  T0,
  TAU,
  W,
  at,
  accountOf,
  collectionCampaign,
  confirmAndStart,
  reserveAmount,
  sourceRemaining,
} from "../support/pc-collection.ts";
import { cease, forge, keys, refusedWith, revision } from "../support/pc-cessation.ts";
import {
  addLedger,
  advanceTo,
  holdAtBoundary,
  keySet,
  lapseKey,
  lapsePub,
  objectKey,
  resident,
  resumeHeld,
  settle,
  stateOf,
} from "../support/pc-lapse.ts";

const viewOf = (s: { campaign: any }) => ({
  get: (k: string) => s.campaign.store.getFact(k),
  has: (k: string) => s.campaign.store.getFact(k) !== undefined,
});
const B = T0.value + 3 * TAU;
const TARGET = T0.value + 4 * TAU;
const COMMITTED = { ok: true, value: { status: "COLLECTION_COMMITTED" } };

/** a started act whose premise is then lost mid-work (a resident arrives at the locus), time held at its boundary by the player's advance */
async function held(extra?: (s: Awaited<ReturnType<typeof collectionCampaign>>) => Promise<void>) {
  const s = await collectionCampaign();
  await confirmAndStart(s, ACT_A, 3);
  await advanceTo(s, T0.value + 4, "tx-pre");
  await addLedger(s, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 953);
  await extra?.(s);
  const crossed = await holdAtBoundary(s, TARGET, "tx-cross");
  return { s, ...crossed };
}

describe("R-4 lapse settlement: the positive chain", () => {
  it("premise lost mid-work → the player's advance is held at B → the settlement lapses the act (5→5, 0→0), retires the boundary, releases the PC and leaves the held continuation untouched; only a NEW player choice then consumes it", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 4, "tx-pre");
    await addLedger(s, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 953);
    expect(s.collect.hold(PC).state).toBe("INVALIDATED");

    const { state } = await holdAtBoundary(s, TARGET, "tx-cross");
    expect(state.canonical_time).toEqual(at(B));
    expect(state.continuation?.toward).toEqual(at(TARGET));
    const heldTx = state.continuation!.from_transaction;
    const unresolved = state.continuation!.unresolved_dependents;
    expect(unresolved.length).toBeGreaterThan(0);
    // while held, the voluntary stop is refused (the deadlock R-4 resolves) and the campaign clock is held for a fresh advance too
    expect(JSON.stringify(await cease(s))).toBe(COLLECTION_REFUSAL);

    const keysBefore = keySet(s);
    const settled = await settle(s);
    expect(settled).toEqual(COMMITTED);

    const lapse = new PcCollectionAdapter(s.campaign.store).lapseRecord(PC, ACT_A)!.value;
    expect(lapse.disposition).toBe("NONPRODUCTIVE_LAPSE");
    expect(lapse.reason).toBe("NOT_ESTABLISHED");
    expect(lapse.derivation).toMatchObject({
      units_credited: 0,
      source_effect: "NONE",
      reserve_effect: "NONE",
      claim: "RELEASED",
    });
    // no player-facing or world-facing fact exists beyond the lapse record itself: no Event, Observation, Report or notice
    const added = [...keySet(s)].filter((k) => !keysBefore.has(k));
    expect(added).toEqual([lapseKey()]);
    // nothing was drawn, credited or held on the account
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    expect(accountOf(s)?.open).toEqual([]);
    // the boundary is retired and the PC is released, distinctly from a denial and a termination
    expect((s.campaign.store.getFact(objectKey())!.value as any).next_boundary).toBeNull();
    expect(s.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "LAPSED",
    });
    expect(s.collect.termination(PC, ACT_A)).toBeUndefined();
    expect(s.collect.cessation(PC, ACT_A)).toBeUndefined();

    // the settlement never resumed time: the clock and the held continuation are exactly what the kernel stopped with
    const after = stateOf(s);
    expect(after.canonical_time).toEqual(at(B));
    expect(after.continuation).toEqual({
      from_transaction: heldTx,
      toward: at(TARGET),
      unresolved_dependents: unresolved,
    });

    // re-presenting the settlement changes nothing
    const rev = revision(s);
    expect(await settle(s)).toEqual(COMMITTED);
    expect(revision(s)).toBe(rev);

    // only the player's NEW, separate held-resume consumes the original request: it now completes with no dependent left
    const resumed = await resumeHeld(s, heldTx, at(TARGET), "tx-resume");
    expect(resumed).toEqual({ ok: true, value: { status: "PC_TARGET_ADVANCE_COMMITTED" } });
    const final = stateOf(s);
    expect(final.canonical_time).toEqual(at(TARGET));
    expect(final.continuation).toBeNull();
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
  }, 240_000);

  it("the ordinary success is unchanged: premises hold → the same advance completes 5→2 and 0→3, nothing lapses, nothing is held", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    const { r, state } = await holdAtBoundary(s, TARGET, "tx-ok");
    expect(r).toEqual({ ok: true, value: { status: "PC_TARGET_ADVANCE_COMMITTED" } });
    expect(state.continuation).toBeNull();
    expect(sourceRemaining(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
    expect(s.campaign.store.getFact(lapseKey())).toBeUndefined();
    expect(await settle(s)).toMatchObject({ ok: false });
  }, 240_000);
});

describe("R-4 lapse settlement: nothing applicable derives → the one refusal and nothing is written", () => {
  const unchanged = async (s: { campaign: any }, run: () => Promise<unknown>) => {
    const before = s.campaign.store.head().state_sha256;
    const out = await run();
    expect(s.campaign.store.head().state_sha256).toBe(before);
    return out;
  };

  it("never before B: a premise lost mid-work with the clock short of the boundary is not settled (the player may still cease)", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 4, "tx-pre");
    await addLedger(s, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 953);
    expect(s.collect.hold(PC).state).toBe("INVALIDATED");
    expect(JSON.stringify(await unchanged(s, () => settle(s)))).toBe(COLLECTION_REFUSAL);
    expect((await cease(s)).ok).toBe(true);
  }, 240_000);

  it("no premise lost: nothing lapses, whatever the clock", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    expect(JSON.stringify(await unchanged(s, () => settle(s)))).toBe(COLLECTION_REFUSAL);
  }, 240_000);

  it("a D-1 terminated act is a distinct disposition: it is never also lapsed", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 4, "tx-pre");
    expect((await cease(s)).ok).toBe(true);
    expect(JSON.stringify(await unchanged(s, () => settle(s)))).toBe(COLLECTION_REFUSAL);
    expect(s.campaign.store.getFact(lapseKey())).toBeUndefined();
  }, 240_000);

  it("a raw request with a condition is outside this route: it stays held under the kernel and is neither lapsed nor retired", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 4, "tx-pre");
    await addLedger(s, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 953);
    const objectId = (s.campaign.store.getFact(objectKey())!.value as any).object_id as string;
    const boundaryId = (s.campaign.store.getFact(objectKey())!.value as any).next_boundary
      .boundary_id as string;
    const conditioned = await s.coordinator.advance(
      advanceToRequest("tx-cond", at(TARGET), {
        requested: {
          target: at(TARGET),
          condition: { kind: "STOP_AFTER_BOUNDARY", object_id: objectId, boundary_id: boundaryId },
        },
      }),
    );
    expect(conditioned.ok).toBe(true);
    expect(stateOf(s).continuation).not.toBeNull();
    expect(acceptableHeldLineage(viewOf(s)).ok).toBe(false);
    expect(JSON.stringify(await unchanged(s, () => settle(s)))).toBe(COLLECTION_REFUSAL);
    expect(s.campaign.store.getFact(lapseKey())).toBeUndefined();
  }, 240_000);

  it("RED C-1: a premise-input fact committed AFTER the crossing transaction opened is not an admissible cause, so nothing is derived from it", async () => {
    const { s } = await held();
    // an unrelated later arrival, committed after the stop
    await addLedger(s, "ledger-late", [resident("unit-late", "place-elsewhere")], 954);
    expect(JSON.stringify(await unchanged(s, () => settle(s)))).toBe(COLLECTION_REFUSAL);
    expect(s.campaign.store.getFact(lapseKey())).toBeUndefined();
    // the clock stays held and the voluntary stop stays unavailable: this is the documented conservative residue of C-1
    expect(stateOf(s).continuation).not.toBeNull();
  }, 240_000);
});

describe("R-4 lapse settlement: crash and retry, the gate, and what the owners refuse", () => {
  it("each step is its own committed fact: a lapse alone holds the PC and refuses every crossing uniformly; re-presenting finishes the chain once, to a distinct released status, and the player's separate resume then works", async () => {
    const { s, state } = await held();
    const a = new PcCollectionAdapter(s.campaign.store);
    const heldTx = state.continuation!.from_transaction;
    expect((await a.lapse({ ...lapsePub("l"), pc_id: PC, act_id: ACT_A })).ok).toBe(true);
    expect(s.collect.hold(PC)).toEqual({ state: "LAPSED_AWAITING_RELEASE", act_id: ACT_A });
    // release incomplete: a resume is refused and the PC stays occupied
    expect((await resumeHeld(s, heldTx, at(TARGET), "tx-early")).ok).toBe(false);
    expect(s.collect.occupancyState(PC)).toEqual({ state: "OPEN", act_id: ACT_A });
    // a second lapse of the same act is never written
    expect((await a.lapse({ ...lapsePub("l2"), pc_id: PC, act_id: ACT_A })).ok).toBe(false);
    // the presenter finishes what is left, once
    expect(await settle(s)).toEqual(COMMITTED);
    expect(s.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "LAPSED",
    });
    const rev = revision(s);
    expect(await settle(s)).toEqual(COMMITTED);
    expect(revision(s)).toBe(rev);
    expect((await resumeHeld(s, heldTx, at(TARGET), "tx-late")).ok).toBe(true);
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
  }, 240_000);

  it("the owners themselves refuse a raw retirement or release that does not follow the lapse, and a lapse that the facts do not derive", async () => {
    const { s } = await held();
    const k = keys();
    const obj = s.campaign.store.getFact(k.object)!;
    const index = s.campaign.store.getFact(k.index)!;
    const retireRaw = (n: string) =>
      s.campaign.store.commit(
        forge(
          s,
          n,
          "temporal_kernel",
          "temporal_coordination",
          TEMPORAL_PC_COLLECTION_LAPSE_RETIREMENT_RULE,
          [
            {
              key: k.object,
              value: { ...(obj.value as any), next_boundary: null },
              expected_version: obj.version,
            },
            {
              key: k.index,
              value: {
                entries: (index.value as any).entries.filter(
                  (e: any) => e.object_id !== (obj.value as any).object_id,
                ),
              },
              expected_version: index.version,
            },
          ],
          [k.object, k.index],
        ),
      );
    const occ = s.collect.occupancy(PC)!;
    const releaseRaw = (n: string) =>
      s.campaign.store.commit(
        forge(
          s,
          n,
          "population",
          "population_pc_occupancy",
          POPULATION_PC_OCCUPANCY_LAPSE_RULE,
          [
            {
              key: k.occupancy,
              value: { ...occ.value, status: "RELEASED_LAPSED" },
              expected_version: occ.fact.version,
            },
          ],
          [k.occupancy, k.object, lapseKey()],
        ),
      );
    // before any lapse, neither a retirement nor a release can cite one
    expect(await refusedWith(retireRaw("x-none"))).toBe("PREREQUISITE_MISSING");
    expect(await refusedWith(releaseRaw("r-none"))).toBe("PREREQUISITE_MISSING");
    // a lapse record the owners do not derive (a forged reason class is not a derivation, a claim kept on the account is not a release)
    const a = new PcCollectionAdapter(s.campaign.store);
    expect((await a.lapse({ ...lapsePub("l"), pc_id: PC, act_id: ACT_A })).ok).toBe(true);
    // the lapse is committed but the boundary is not retired: the release is refused until Temporal retires it
    expect(await refusedWith(releaseRaw("r-early"))).toBe("CLAIM_INCOMPATIBLE");
    expect(s.collect.occupancyState(PC)).toEqual({ state: "OPEN", act_id: ACT_A });
    // a lapse never writes the Source, the Reserve or a delta
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    expect(s.campaign.store.getFact(productionSourceAccountKey(W, SRC_SOURCE_KEY))).toBeDefined();
  }, 240_000);
});

describe("R-4 lapse reason classes (T-1): INCOMPATIBLE only on affirmative owner facts, every other reason NOT_ESTABLISHED, identical effects", () => {
  it("a binding that names another PC is INCOMPATIBLE; a changed scene or an unknown representation is NOT_ESTABLISHED", async () => {
    const { s } = await held();
    const facts = new Map(s.campaign.store.listFacts().map((f) => [f.key, f]));
    const view = (m: Map<string, any>) => ({
      get: (k: string) => m.get(k),
      has: (k: string) => m.has(k),
      values: () => m.values(),
    });
    expect(lapseReasonClass(PC, ACT_A, view(facts))).toBe("NOT_ESTABLISHED");
    const binding = facts.get(PLAYER_CHARACTER_BINDING_KEY)!;
    const parsed = PlayerCharacterBindingSchema.parse(binding.value);
    const other = new Map(facts);
    other.set(PLAYER_CHARACTER_BINDING_KEY, {
      ...binding,
      value: { ...parsed, active_pc: { ...parsed.active_pc, entity_id: "pc-someone-else" } },
    });
    expect(lapseReasonClass(PC, ACT_A, view(other))).toBe("INCOMPATIBLE");
    // the committed commitment (and so its source) absent → INCOMPATIBLE
    const noCommitment = new Map(facts);
    for (const key of facts.keys())
      if (key.includes(`/collection/${ACT_A}/commitment`)) noCommitment.delete(key);
    expect(lapseReasonClass(PC, ACT_A, view(noCommitment))).toBe("INCOMPATIBLE");
  }, 240_000);
});

describe("R-4 RED C-2: Temporal independently requires a held lineage a held-resume gateway would accept", () => {
  it("with the continuation consumed or absent there is no lineage to settle, so a retirement citing the lapse would be refused", async () => {
    const { s } = await held();
    expect((await settle(s)).ok).toBe(true);
    expect(lapseLineageHolds(viewOf(s))).toBeNull();
    // the same facts with the held continuation consumed (a view whose temporal state holds none)
    const state = s.campaign.store.getFact(keys().clock)!;
    const consumed = {
      get: (k: string) =>
        k === keys().clock
          ? { ...state, value: { ...(state.value as any), continuation: null } }
          : s.campaign.store.getFact(k),
      has: (k: string) => s.campaign.store.getFact(k) !== undefined,
    };
    expect(lapseLineageHolds(consumed)).toMatch(/no held continuation/);
  }, 240_000);
});
