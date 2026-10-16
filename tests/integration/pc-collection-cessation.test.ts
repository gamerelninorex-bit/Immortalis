/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and tamper with raw facts */
// BLUE clause D-1 (PC Collection Voluntary Cessation) — PROVISIONAL CANDIDATE LOWERING, proposed and NOT adopted, built on the unmerged
// PR #72 under the Sovereign's construction-approved non-final handoff. It is a separately confirmed PC choice to cease the SAME in-flight
// collection: the PC-side owner records the request with identity and version provenance; Production alone resolves the terminal status
// (retaining the elapsed progress as evidence, awarding no unearned unit under the all-at-boundary class, leaving the source and the
// Reserve untouched, releasing only its own claim on the source); only then does Temporal retire the pending boundary and Population
// release the SAME PC's occupied interval. These tests prove the spec's minimum falsifying set; they are not First Playable evidence, not
// a live player or host, and not the F-014B §10 composed stop/continue (D-2, DEPENDENCY-BLOCKED).
import { describe, expect, it } from "vitest";
import { GipAdapter } from "@immortalis/engine";
import {
  PLAYER_CHOICE_AUTHORITY,
  productionExtractionKey,
  productionSourceAccountKey,
} from "@immortalis/contracts";
import {
  PC_COLLECTION_CESSATION_RULE,
  POPULATION_PC_OCCUPANCY_TERMINATION_RULE,
  PRODUCTION_PC_COLLECTION_TERMINATION_RULE,
  TEMPORAL_PC_COLLECTION_RETIREMENT_RULE,
} from "@immortalis/engine";
import {
  INSTRUMENT_A,
  INSTITUTION_COURT,
  OFFICE_MAGISTRATE,
  SCOPE_BINDING_A,
  gipPublication,
} from "@immortalis/testkit";
import { establishInstitution, establishOffice, establishScopeBinding } from "../support/gip.ts";
import { sunsetInstrument } from "../support/gip-sunset.ts";
import { commitMove } from "../support/pc-movement.ts";
import {
  PC_TARGET_COMMITTED,
  PC_TARGET_REFUSAL,
  pcTargetTransaction,
} from "../support/pc-target-advance.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import {
  ACT_A,
  ACT_B,
  ACT_C,
  COLLECTION_COMMITTED,
  COLLECTION_REFUSAL,
  PC,
  T0,
  TAU,
  W,
  SRC_SOURCE_KEY,
  accountOf,
  at,
  clock,
  collectionCampaign,
  colPublication,
  confirmAndStart,
  extractionId,
  prepareToStart,
  reopenCollection,
  reserveAmount,
  sourceRemaining,
  type CollectionSeeded,
} from "../support/pc-collection.ts";
import {
  CEASE_REQ,
  cease,
  ceasePublication,
  cessationChoice,
  forge,
  indexHasObject,
  keys,
  objectIdOf,
  rawAdvance,
  rawAdvanceOk,
  refusedWith,
  revision,
  trustedCessation,
} from "../support/pc-cessation.ts";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
  ceaseConfirmedPcCollection,
} from "@immortalis/protocol";

const UNKNOWN_OUTCOME = JSON.stringify({
  ok: false,
  error: {
    code: "COLLECTION_OUTCOME_UNKNOWN",
    message: "the outcome is not known: present the same request again",
  },
});

const advanceTo = (s: CollectionSeeded, value: number, tx: string) =>
  advanceActivePcToTarget(
    bindTrustedActivePcTargetAdvanceContext({
      campaign: s.campaign as never,
      pc_id: PC,
      target: at(value),
      transaction: pcTargetTransaction(tx) as never,
    }),
    { operation: "advance_active_pc_to_target" },
  );

/** a started collection whose earned boundary (T0+21) lies BEYOND an independent foreign Temporal object (a GIP sunset at T0+5) */
async function blocked(dir?: string): Promise<CollectionSeeded> {
  const s = await collectionCampaign(dir ? { dir } : {});
  await confirmAndStart(s, ACT_A, 3);
  const gip = new GipAdapter(s.campaign.store);
  await establishInstitution({ gip }, 1, INSTITUTION_COURT);
  await establishOffice({ gip }, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
  await establishScopeBinding({ gip }, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
  await must(
    gip.establishSunsetInstrument({
      ...gipPublication(4),
      instrument: sunsetInstrument(INSTRUMENT_A, at(T0.value + 5)),
    }),
  );
  return s;
}

const occupancyStatus = (s: CollectionSeeded) => s.collect.occupancy(PC)?.value.status;

describe("D-1 (PROVISIONAL): a separately confirmed cessation runs the owners' own chain and nothing else", () => {
  it("in-flight work behind a foreign event is stopped at a safe canonical time: Production resolves it, the claim, the boundary and the occupancy are each released once, and nothing is credited", async () => {
    const dir = tempDir("immortalis-col-cease-");
    const s = await blocked(dir);
    // the work is in flight and the crossing of the foreign event is refused (the earlier hold behaviour is unchanged)
    expect(JSON.stringify(await advanceTo(s, T0.value + 3 * TAU, "tx-held"))).toBe(
      PC_TARGET_REFUSAL,
    );
    expect(await advanceTo(s, T0.value + 4, "tx-pre")).toEqual(PC_TARGET_COMMITTED);
    expect(s.collect.hold(PC)).toEqual({ state: "IN_FLIGHT", act_id: ACT_A });
    expect(accountOf(s)!.open.map((o) => o.extraction_id)).toEqual([extractionId(ACT_A)]);
    expect(indexHasObject(s)).toBe(true);

    expect(await cease(s)).toEqual(COLLECTION_COMMITTED);

    // the PC-side owner's request: identity, authority, the canonical time it was read at, and the exact versions it targets
    const request = s.collect.cessation(PC, ACT_A)!.value;
    expect(request).toMatchObject({
      cessation_id: `pc-collect-cessation:${PC}:${ACT_A}`,
      authored_under: PLAYER_CHOICE_AUTHORITY,
      requested_at: at(T0.value + 4),
      intent: { kind: "VOLUNTARY_CESSATION_OF_COLLECTION" },
    });
    // Production alone resolved it: the elapsed progress is evidence, the credit is nil, the source and the Reserve are untouched
    const t = s.collect.termination(PC, ACT_A)!.value;
    expect(t.disposition).toBe("WITHDRAWN_BEFORE_EARNED_BOUNDARY");
    expect(t.derivation).toMatchObject({
      stopped_at: at(T0.value + 4),
      elapsed: { value: 4 },
      per_cycle: at(TAU),
      cycles_fully_elapsed: 0,
      units_credited: 0,
      source_effect: "NONE",
      reserve_effect: "NONE",
      claim: "RELEASED",
    });
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    expect(accountOf(s)!.open).toEqual([]);
    // Temporal retired only that work's pending boundary (superseded, never resolved); canonical time did not move
    expect(s.coordinator.object(objectIdOf())!.value.next_boundary).toBeNull();
    expect(indexHasObject(s)).toBe(false);
    expect(s.coordinator.boundaryIndex().entries).toHaveLength(1); // the foreign object's boundary is untouched
    expect(clock(s)).toEqual(at(T0.value + 4));
    // Population released the SAME PC's interval once, after both
    expect(occupancyStatus(s)).toBe("RELEASED_TERMINATED");
    expect(s.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "TERMINATED",
    });
    expect(s.collect.hold(PC)).toEqual({ state: "NONE" });
    expect(s.collect.closed(PC, ACT_A)).toBe(false);

    // save/reopen: the termination is durable and every load-time verifier still agrees
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenCollection(dir);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(r.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "TERMINATED",
    });
    expect(r.collect.termination(PC, ACT_A)!.value.derivation.units_credited).toBe(0);
    expect(indexHasObject(r)).toBe(false);

    // the PC is free of its own act, but the independent process (the foreign sunset at T0+5) is still there and still due inside any
    // new interval: enrollment is defeated and the cause is not suppressed. The source is the real, unchanged one.
    const b = await confirmAndStart(r, ACT_B, 3);
    expect(JSON.stringify(b.started)).toBe(COLLECTION_REFUSAL);
    // the refused start leaves the PC free (a denial release for the refused act), nothing extracted, nothing held
    expect(r.collect.occupancyState(PC).state).toBe("RELEASED");
    expect(r.collect.extraction(PC, ACT_B)).toBeUndefined();
    expect(sourceRemaining(r)).toBe(5);
    await r.campaign.close();
  }, 120_000);

  it("a stopped collection credits nothing and frees the real source: a later act completes 5→2 / 0→3 and a third for 3 meets the real 2", async () => {
    const s = await collectionCampaign();
    expect((await confirmAndStart(s, ACT_A, 3)).started).toEqual(COLLECTION_COMMITTED);
    expect(await advanceTo(s, T0.value + 10, "tx-mid")).toEqual(PC_TARGET_COMMITTED);
    expect(await cease(s)).toEqual(COLLECTION_COMMITTED);
    const t = s.collect.termination(PC, ACT_A)!.value.derivation;
    expect(t).toMatchObject({
      stopped_at: at(T0.value + 10),
      elapsed: { value: 10 },
      cycles_fully_elapsed: 1,
    });
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    expect(s.collect.closed(PC, ACT_A)).toBe(false);

    // the PC is free exactly now: a movement is no longer refused for occupancy, and a new act starts at the present canonical time
    expect((await confirmAndStart(s, ACT_B, 3)).started).toEqual(COLLECTION_COMMITTED);
    expect(await advanceTo(s, T0.value + 10 + 3 * TAU, "tx-end")).toEqual(PC_TARGET_COMMITTED);
    expect(sourceRemaining(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
    expect(s.collect.closed(PC, ACT_B)).toBe(true);
    expect(s.collect.closed(PC, ACT_A)).toBe(false);
    expect(s.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_B,
      why: "CLOSED",
    });
    // the independently confirmed next attempt for 3 refuses against the canonical remaining 2
    expect(JSON.stringify((await confirmAndStart(s, ACT_C, 3)).started)).toBe(COLLECTION_REFUSAL);
    expect(sourceRemaining(s)).toBe(2);
  }, 120_000);
});

describe("D-1: every unconfirmed, forged, stale, wrong-actor or not-in-flight cessation is refused and writes nothing", () => {
  it("a fabricated handle, a wrong authority, a wrong PC, a never-started act and an unknown operation are all the one refusal", async () => {
    const s = await blocked();
    await advanceTo(s, T0.value + 4, "tx-pre");
    const sha = s.campaign.store.head().state_sha256;
    const refusal = async (ctx: any, req: unknown = CEASE_REQ) =>
      JSON.stringify(await ceaseConfirmedPcCollection(ctx, req));
    expect(await refusal({})).toBe(COLLECTION_REFUSAL);
    expect(await refusal(Object.freeze({}))).toBe(COLLECTION_REFUSAL);
    expect(
      await refusal(
        trustedCessation(s, ACT_A, {
          choice: cessationChoice(ACT_A, {
            authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
          }),
        }),
      ),
    ).toBe(COLLECTION_REFUSAL);
    expect(
      await refusal(
        trustedCessation(s, ACT_A, { choice: cessationChoice(ACT_A, { pc_id: "pc-other" }) }),
      ),
    ).toBe(COLLECTION_REFUSAL);
    expect(await refusal(trustedCessation(s, ACT_B))).toBe(COLLECTION_REFUSAL); // never started
    expect(await refusal(trustedCessation(s, ACT_A, { choice: { pc_id: PC } }))).toBe(
      COLLECTION_REFUSAL,
    );
    expect(await refusal(trustedCessation(s, ACT_A), { operation: "cease_everything" })).toBe(
      COLLECTION_REFUSAL,
    );
    expect(await refusal(trustedCessation(s, ACT_A), { ...CEASE_REQ, act_id: ACT_A })).toBe(
      COLLECTION_REFUSAL,
    );
    expect(
      JSON.stringify(await ceaseConfirmedPcCollection(trustedCessation(s, ACT_A), undefined)),
    ).toBe(COLLECTION_REFUSAL);
    expect(s.campaign.store.head().state_sha256).toBe(sha);
    expect(s.collect.hold(PC)).toEqual({ state: "IN_FLIGHT", act_id: ACT_A });
    expect(s.collect.cessation(PC, ACT_A)).toBeUndefined();
  }, 120_000);

  it("an earlier unresolved boundary is never forced: the stop is refused while canonical time holds one, and nothing is written", async () => {
    const s = await blocked();
    // a raw advance onto the foreign boundary, with no provider to resolve it, leaves it unresolved at the canonical time
    const stop = await rawAdvance(s, "tx-raw-5", T0.value + 5);
    const unresolved =
      !stop.ok || (stop.value as any).transaction.outcome.unresolved_dependents.length > 0;
    expect(unresolved).toBe(true);
    const sha = s.campaign.store.head().state_sha256;
    expect(JSON.stringify(await cease(s))).toBe(COLLECTION_REFUSAL);
    expect(s.campaign.store.head().state_sha256).toBe(sha);
    expect(s.collect.hold(PC).state).toBe("IN_FLIGHT");
    expect(occupancyStatus(s)).toBe("OPEN");
  }, 120_000);

  it("a pre-start registration is a denial, never a stop; a closed output is never stoppable; each stays what it is", async () => {
    const t = await collectionCampaign();
    await prepareToStart(t, ACT_A, 3);
    expect(t.collect.hold(PC)).toEqual({ state: "REGISTERED", act_id: ACT_A });
    expect(JSON.stringify(await cease(t))).toBe(COLLECTION_REFUSAL); // no work was started: nothing to stop
    expect(
      (await t.collect.releaseOccupancyDenied({ ...colPublication(902), pc_id: PC, act_id: ACT_A }))
        .ok,
    ).toBe(true);
    expect(occupancyStatus(t)).toBe("RELEASED_DENIED");
    expect(t.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "DENIED",
    });
    expect(t.collect.termination(PC, ACT_A)).toBeUndefined();

    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    expect(await advanceTo(s, T0.value + 3 * TAU, "tx-end")).toEqual(PC_TARGET_COMMITTED);
    expect(s.collect.closed(PC, ACT_A)).toBe(true);
    const sha = s.campaign.store.head().state_sha256;
    expect(JSON.stringify(await cease(s))).toBe(COLLECTION_REFUSAL);
    expect(s.campaign.store.head().state_sha256).toBe(sha);
    expect(sourceRemaining(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
    expect(occupancyStatus(s)).toBe("OPEN"); // closed by the credit, with no write: the stored status is unchanged
    expect(s.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "CLOSED",
    });
  }, 120_000);
});

describe("D-1: raw forgeries of each owner's write are refused by admission, not trusted", () => {
  const request = (
    s: CollectionSeeded,
    requestedAt: number,
    over: Record<string, unknown> = {},
  ) => {
    const k = keys();
    const v = (key: string) => s.campaign.store.getFact(key)!.version;
    return {
      cessation_id: `pc-collect-cessation:${PC}:${ACT_A}`,
      pc_id: PC,
      act_id: ACT_A,
      authored_under: { ...PLAYER_CHOICE_AUTHORITY },
      intent: {
        kind: "VOLUNTARY_CESSATION_OF_COLLECTION",
        target: {
          commitment: { fact_key: k.commitment, version: v(k.commitment) },
          work: { fact_key: k.work, version: v(k.work) },
        },
      },
      requested_at: at(requestedAt),
      basis: {
        pinned_versions: {
          binding: v(k.binding),
          custody: v(k.custody),
          occupancy: v(k.occupancy),
        },
      },
      committer: { owner: "pc_existence", facet: "pc_voluntary_commitment" },
      ...over,
    };
  };
  const commitRequest = (
    s: CollectionSeeded,
    n: string,
    value: unknown,
    rule = PC_COLLECTION_CESSATION_RULE,
  ) => {
    const k = keys();
    return s.campaign.store.commit(
      forge(
        s,
        n,
        "pc_existence",
        "pc_voluntary_commitment",
        rule,
        [{ key: k.cessation, value, expected_version: 0 }],
        [k.commitment, k.work, k.binding, k.custody, k.occupancy, k.clock, k.index],
      ),
    );
  };
  const termination = (
    s: CollectionSeeded,
    stoppedAt: number,
    over: Record<string, unknown> = {},
  ) => {
    const k = keys();
    // a request that was never committed has no version to pin: the forgery pins a made-up one
    const f = (key: string) => s.campaign.store.getFact(key) ?? { version: 1 };
    return {
      termination_id: extractionId(ACT_A),
      pc_id: PC,
      act_id: ACT_A,
      disposition: "WITHDRAWN_BEFORE_EARNED_BOUNDARY",
      pins: {
        cessation: { fact_key: k.cessation, version: f(k.cessation).version },
        work: { fact_key: k.work, version: f(k.work).version },
        extraction: {
          fact_key: productionExtractionKey(extractionId(ACT_A)),
          version: f(productionExtractionKey(extractionId(ACT_A))).version,
        },
      },
      derivation: {
        stopped_at: at(stoppedAt),
        elapsed: { unit: T0.unit, value: stoppedAt - T0.value },
        per_cycle: at(TAU),
        cycles_fully_elapsed: Math.floor((stoppedAt - T0.value) / TAU),
        units_credited: 0,
        source_effect: "NONE",
        reserve_effect: "NONE",
        claim: "RELEASED",
      },
      ...over,
    };
  };
  const commitTermination = (
    s: CollectionSeeded,
    n: string,
    value: unknown,
    account: unknown | null = "RELEASE",
    rule = PRODUCTION_PC_COLLECTION_TERMINATION_RULE,
  ) => {
    const k = keys();
    const accountKey = productionSourceAccountKey(W, SRC_SOURCE_KEY);
    const accountFact = s.campaign.store.getFact(accountKey)!;
    const released =
      account === "RELEASE"
        ? {
            ...accountOf(s)!,
            open: accountOf(s)!.open.filter((o) => o.extraction_id !== extractionId(ACT_A)),
          }
        : account;
    return s.campaign.store.commit(
      forge(
        s,
        n,
        "production",
        "production_state",
        rule,
        [
          { key: k.termination, value, expected_version: 0 },
          ...(released === null
            ? []
            : [{ key: accountKey, value: released, expected_version: accountFact.version }]),
        ],
        [
          k.cessation,
          k.work,
          productionExtractionKey(extractionId(ACT_A)),
          k.occupancy,
          k.clock,
          k.index,
          k.object,
          accountKey,
        ],
      ),
    );
  };

  it("a cessation: stale pins, a request time that is not the canonical time, a foreign authority and a wrong rule are all refused", async () => {
    const s = await blocked();
    await advanceTo(s, T0.value + 4, "tx-pre");
    const k = keys();
    const sha = s.campaign.store.head().state_sha256;
    // a request time other than the canonical time read (earlier: retroactive; later: from the future)
    expect(await refusedWith(commitRequest(s, "c-early", request(s, T0.value + 3)))).toBe(
      "REFERENCE_INVALID",
    );
    expect(await refusedWith(commitRequest(s, "c-late", request(s, T0.value + 9)))).toBe(
      "REFERENCE_INVALID",
    );
    // at or after the earned boundary
    expect(await refusedWith(commitRequest(s, "c-bound", request(s, T0.value + 21)))).toBe(
      "REFERENCE_INVALID",
    );
    // stale / forged targets
    const stale = request(s, T0.value + 4);
    (stale.intent.target.work as any).version += 1;
    expect(await refusedWith(commitRequest(s, "c-stale", stale))).toBe("REFERENCE_INVALID");
    const badBinding = request(s, T0.value + 4);
    badBinding.basis.pinned_versions.binding += 1;
    expect(await refusedWith(commitRequest(s, "c-bind", badBinding))).toBe("REFERENCE_INVALID");
    // a foreign authority is not representable
    expect(
      await refusedWith(
        commitRequest(
          s,
          "c-gm",
          request(s, T0.value + 4, {
            authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
          }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    // a result field is not representable
    expect(
      await refusedWith(
        commitRequest(s, "c-result", { ...request(s, T0.value + 4), units_credited: 3 }),
      ),
    ).toBe("VALUE_INVALID");
    // the right content under the wrong governing rule
    expect(
      await refusedWith(
        commitRequest(
          s,
          "c-rule",
          request(s, T0.value + 4),
          PRODUCTION_PC_COLLECTION_TERMINATION_RULE,
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    // a request for an act that was never started
    expect(
      await refusedWith(
        commitRequest(
          s,
          "c-act",
          request(s, T0.value + 4, {
            act_id: ACT_B,
            cessation_id: `pc-collect-cessation:${PC}:${ACT_B}`,
          }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(s.campaign.store.head().state_sha256).toBe(sha);
    expect(s.collect.cessation(PC, ACT_A)).toBeUndefined();
    // the lawful request is admitted exactly once, then a second is a version conflict
    expect((await commitRequest(s, "c-ok", request(s, T0.value + 4))).ok).toBe(true);
    expect(s.collect.hold(PC)).toEqual({ state: "CESSATION_REQUESTED", act_id: ACT_A });
    expect(k.cessation).toBe(`pc/${PC}/collection/${ACT_A}/cessation`);
    expect(await refusedWith(commitRequest(s, "c-dup", request(s, T0.value + 4)))).toBe(
      "VERSION_CONFLICT",
    );
  }, 120_000);

  it("a termination: unrequested, post-dated, credited, boundary-bearing, without the claim release or with more than it, or under the wrong rule is refused", async () => {
    const s = await blocked();
    await advanceTo(s, T0.value + 4, "tx-pre");
    // nothing is terminated unrequested
    expect(await refusedWith(commitTermination(s, "t-none", termination(s, T0.value + 4)))).toBe(
      "PREREQUISITE_MISSING",
    );
    expect((await commitRequest(s, "c-ok", request(s, T0.value + 4))).ok).toBe(true);
    const sha = s.campaign.store.head().state_sha256;
    // a stop time that is not the canonical time, and one at the earned boundary
    expect(await refusedWith(commitTermination(s, "t-post", termination(s, T0.value + 9)))).toBe(
      "REFERENCE_INVALID",
    );
    expect(await refusedWith(commitTermination(s, "t-bound", termination(s, T0.value + 21)))).toBe(
      "REFERENCE_INVALID",
    );
    // an invented partial credit, a source or Reserve effect, a boundary: not representable
    expect(
      await refusedWith(
        commitTermination(
          s,
          "t-credit",
          termination(s, T0.value + 4, {
            derivation: { ...termination(s, T0.value + 4).derivation, units_credited: 1 },
          }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(
      await refusedWith(
        commitTermination(
          s,
          "t-src",
          termination(s, T0.value + 4, {
            derivation: { ...termination(s, T0.value + 4).derivation, source_effect: "DEPLETED" },
          }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(
      await refusedWith(
        commitTermination(s, "t-extra", {
          ...termination(s, T0.value + 4),
          reserve_inflow: { amount: 1 },
        }),
      ),
    ).toBe("VALUE_INVALID");
    // progress that is not what the elapsed time derives
    expect(
      await refusedWith(
        commitTermination(
          s,
          "t-prog",
          termination(s, T0.value + 4, {
            derivation: { ...termination(s, T0.value + 4).derivation, cycles_fully_elapsed: 2 },
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    // the claim release is part of the group: a termination alone, or with a changed account, is refused
    expect(
      await refusedWith(commitTermination(s, "t-alone", termination(s, T0.value + 4), null)),
    ).toBe("VALUE_INVALID");
    const account = accountOf(s)!;
    expect(
      await refusedWith(
        commitTermination(s, "t-wm", termination(s, T0.value + 4), {
          ...account,
          open: [],
          watermark: at(T0.value + 4),
        }),
      ),
    ).toBe("VALUE_INVALID");
    expect(
      await refusedWith(commitTermination(s, "t-keep", termination(s, T0.value + 4), account)),
    ).toBe("VALUE_INVALID");
    // the right content under the wrong rule
    expect(
      await refusedWith(
        commitTermination(
          s,
          "t-rule",
          termination(s, T0.value + 4),
          "RELEASE",
          PC_COLLECTION_CESSATION_RULE,
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.head().state_sha256).toBe(sha);
    expect(sourceRemaining(s)).toBe(5);
    expect(accountOf(s)!.open).toHaveLength(1);
  }, 120_000);

  it("a premature release and a premature retirement are refused; each is lawful only after Production's termination (and the release only after the retirement)", async () => {
    const s = await blocked();
    await advanceTo(s, T0.value + 4, "tx-pre");
    const k = keys();
    const releaseRaw = (n: string) => {
      const occ = s.collect.occupancy(PC)!;
      return s.campaign.store.commit(
        forge(
          s,
          n,
          "population",
          "population_pc_occupancy",
          POPULATION_PC_OCCUPANCY_TERMINATION_RULE,
          [
            {
              key: k.occupancy,
              value: { ...occ.value, status: "RELEASED_TERMINATED" },
              expected_version: occ.fact.version,
            },
          ],
          [k.occupancy, k.object, k.termination],
        ),
      );
    };
    const retireRaw = (n: string, objectId = objectIdOf(), keepIndex = false) => {
      const obj = s.coordinator.object(objectId)!;
      const index = s.campaign.store.getFact(k.index)!;
      return s.campaign.store.commit(
        forge(
          s,
          n,
          "temporal_kernel",
          "temporal_coordination",
          TEMPORAL_PC_COLLECTION_RETIREMENT_RULE,
          [
            {
              key: `temporal/object/${objectId}`,
              value: { ...obj.value, next_boundary: null },
              expected_version: obj.fact.version,
            },
            {
              key: k.index,
              value: {
                entries: s.coordinator
                  .boundaryIndex()
                  .entries.filter((e) => keepIndex || e.object_id !== objectId),
              },
              expected_version: index.version,
            },
          ],
          [`temporal/object/${objectId}`, k.index],
        ),
      );
    };
    // before any request or termination
    expect(await refusedWith(releaseRaw("r-none"))).toBe("PREREQUISITE_MISSING");
    expect(
      (
        await s.collect.releaseOccupancyTerminated({
          ...ceasePublication("rel-none"),
          pc_id: PC,
          act_id: ACT_A,
        })
      ).ok,
    ).toBe(false);
    expect(await refusedWith(retireRaw("x-none"))).toBe("PREREQUISITE_MISSING");
    expect(
      (
        await s.coordinator.retireTerminatedObject({
          ...ceasePublication("ret-none"),
          object_id: objectIdOf(),
          evidence_key: keys().termination,
        })
      ).ok,
    ).toBe(false);
    // a request alone changes none of the three
    expect(
      (await s.collect.cease({ ...ceasePublication("req"), cessation: cessationChoice(ACT_A) })).ok,
    ).toBe(true);
    expect(await refusedWith(releaseRaw("r-req"))).toBe("PREREQUISITE_MISSING");
    expect(await refusedWith(retireRaw("x-req"))).toBe("PREREQUISITE_MISSING");
    expect(indexHasObject(s)).toBe(true);
    expect(occupancyStatus(s)).toBe("OPEN");
    // after Production's termination: the occupancy is NOT yet releasable (the pending boundary is still held), and the retirement
    // is lawful only for that very work's own object
    expect(
      (await s.collect.terminate({ ...ceasePublication("term"), pc_id: PC, act_id: ACT_A })).ok,
    ).toBe(true);
    expect(s.collect.hold(PC)).toEqual({ state: "TERMINATED_AWAITING_RELEASE", act_id: ACT_A });
    expect(await refusedWith(releaseRaw("r-term"))).toBe("CLAIM_INCOMPATIBLE");
    expect(
      (
        await s.collect.releaseOccupancyTerminated({
          ...ceasePublication("rel-term"),
          pc_id: PC,
          act_id: ACT_A,
        })
      ).ok,
    ).toBe(false);
    expect(occupancyStatus(s)).toBe("OPEN");
    // a second act, a movement and a restart are all refused while the PC is occupied
    expect(JSON.stringify((await confirmAndStart(s, ACT_B, 1)).started)).toBe(COLLECTION_REFUSAL);
    expect((await commitMove(s, 1)).ok).toBe(false);
    // a retirement that leaves the index entry, one of a foreign object, and one with nothing pending are refused
    expect(await refusedWith(retireRaw("x-keep", objectIdOf(), true))).toBe("REFERENCE_INVALID");
    const foreign = s.coordinator
      .boundaryIndex()
      .entries.find((e) => e.object_id !== objectIdOf())!;
    expect(
      (
        await s.coordinator.retireTerminatedObject({
          ...ceasePublication("ret-foreign"),
          object_id: foreign.object_id,
          evidence_key: keys().termination,
        })
      ).ok,
    ).toBe(false);
    expect(await refusedWith(retireRaw("x-foreign", foreign.object_id))).toBe("REFERENCE_INVALID");
    // the lawful retirement, then the lawful release
    expect(
      (
        await s.coordinator.retireTerminatedObject({
          ...ceasePublication("ret"),
          object_id: objectIdOf(),
          evidence_key: keys().termination,
        })
      ).ok,
    ).toBe(true);
    expect(s.coordinator.object(objectIdOf())!.value.next_boundary).toBeNull();
    expect(
      (
        await s.collect.releaseOccupancyTerminated({
          ...ceasePublication("rel"),
          pc_id: PC,
          act_id: ACT_A,
        })
      ).ok,
    ).toBe(true);
    expect(s.collect.hold(PC)).toEqual({ state: "NONE" });
    // no second release, no second retirement, no second termination, no second request
    expect(
      (
        await s.collect.releaseOccupancyTerminated({
          ...ceasePublication("rel2"),
          pc_id: PC,
          act_id: ACT_A,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await s.coordinator.retireTerminatedObject({
          ...ceasePublication("ret2"),
          object_id: objectIdOf(),
          evidence_key: keys().termination,
        })
      ).ok,
    ).toBe(false);
    expect(
      (await s.collect.terminate({ ...ceasePublication("term2"), pc_id: PC, act_id: ACT_A })).ok,
    ).toBe(false);
    expect(
      (await s.collect.cease({ ...ceasePublication("req2"), cessation: cessationChoice(ACT_A) }))
        .ok,
    ).toBe(false);
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
  }, 120_000);
});

describe("D-1: recovery, replay and the stop that comes too late", () => {
  it("a chain that stopped between steps is visible at each stage, durable across reopen, holds time still, and finishes by presenting the same stop again", async () => {
    const dir = tempDir("immortalis-col-cease-partial-");
    const s = await blocked(dir);
    await advanceTo(s, T0.value + 4, "tx-pre");
    // step 1 only: the request is committed and Production has not resolved it
    expect(
      (await s.collect.cease({ ...ceasePublication("p1"), cessation: cessationChoice(ACT_A) })).ok,
    ).toBe(true);
    expect(s.collect.hold(PC)).toEqual({ state: "CESSATION_REQUESTED", act_id: ACT_A });
    // time may not pass over a PC that has asked to stop until Production has resolved it
    expect(JSON.stringify(await advanceTo(s, T0.value + 4, "tx-while"))).toBe(PC_TARGET_REFUSAL);
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenCollection(dir);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(r.collect.hold(PC)).toEqual({ state: "CESSATION_REQUESTED", act_id: ACT_A });
    // step 2 only
    expect(
      (await r.collect.terminate({ ...ceasePublication("p2"), pc_id: PC, act_id: ACT_A })).ok,
    ).toBe(true);
    expect(r.collect.hold(PC)).toEqual({ state: "TERMINATED_AWAITING_RELEASE", act_id: ACT_A });
    expect(sourceRemaining(r)).toBe(5);
    await r.campaign.close();
    const r2 = await reopenCollection(dir);
    expect(r2.collect.hold(PC)).toEqual({ state: "TERMINATED_AWAITING_RELEASE", act_id: ACT_A });
    // the SAME stop presented again finishes the remaining steps by identity, and presenting it once more changes nothing
    expect(await cease(r2)).toEqual(COLLECTION_COMMITTED);
    expect(r2.collect.hold(PC)).toEqual({ state: "NONE" });
    expect(occupancyStatus(r2)).toBe("RELEASED_TERMINATED");
    expect(indexHasObject(r2)).toBe(false);
    const done = revision(r2);
    expect(await cease(r2)).toEqual(COLLECTION_COMMITTED);
    expect(revision(r2)).toBe(done);
    await r2.campaign.close();
    const r3 = await reopenCollection(dir);
    expect(r3.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "TERMINATED",
    });
    await r3.campaign.close();
  }, 120_000);

  it("no retroactive cancellation: work that continued after the request is elapsed progress up to the moment Production resolves it", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 4, "tx-pre");
    expect(
      (await s.collect.cease({ ...ceasePublication("q1"), cessation: cessationChoice(ACT_A) })).ok,
    ).toBe(true);
    // time passes by another route before Production resolves the request
    await rawAdvanceOk(s, "tx-raw-10", T0.value + 10);
    expect(await cease(s)).toEqual(COLLECTION_COMMITTED);
    const request = s.collect.cessation(PC, ACT_A)!.value;
    const t = s.collect.termination(PC, ACT_A)!.value;
    expect(request.requested_at).toEqual(at(T0.value + 4));
    expect(t.derivation).toMatchObject({
      stopped_at: at(T0.value + 10),
      elapsed: { value: 10 },
      cycles_fully_elapsed: 1,
      units_credited: 0,
    });
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
  }, 120_000);

  it("a stop that comes too late is not retroactive: the earned boundary closes the work as ever, the request stays inert, and nothing is terminated", async () => {
    const dir = tempDir("immortalis-col-cease-late-");
    const s = await collectionCampaign({ dir });
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 4, "tx-pre");
    expect(
      (await s.collect.cease({ ...ceasePublication("l1"), cessation: cessationChoice(ACT_A) })).ok,
    ).toBe(true);
    await rawAdvanceOk(s, "tx-raw-end", T0.value + 3 * TAU);
    // the work closed at its earned boundary: 5→2, 0→3
    expect(s.collect.closed(PC, ACT_A)).toBe(true);
    expect(sourceRemaining(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
    const before = revision(s);
    expect(JSON.stringify(await cease(s))).toBe(COLLECTION_REFUSAL);
    expect(
      (await s.collect.terminate({ ...ceasePublication("l2"), pc_id: PC, act_id: ACT_A })).ok,
    ).toBe(false);
    expect(revision(s)).toBe(before);
    expect(s.collect.termination(PC, ACT_A)).toBeUndefined();
    expect(s.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "CLOSED",
    });
    // the inert request does not disturb a reopen's verification
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenCollection(dir);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(r.collect.cessation(PC, ACT_A)).toBeDefined();
    await r.campaign.close();
  }, 120_000);

  it("an unreconciled outcome after a step committed is reported as unknown (present the same stop again), never as absent", async () => {
    const s = await blocked();
    await advanceTo(s, T0.value + 4, "tx-pre");
    expect(
      (await s.collect.cease({ ...ceasePublication("u1"), cessation: cessationChoice(ACT_A) })).ok,
    ).toBe(true);
    // an unresolved earlier boundary appears after the request committed: Production cannot resolve it now
    await rawAdvance(s, "tx-raw-5", T0.value + 5);
    const sha = s.campaign.store.head().state_sha256;
    expect(JSON.stringify(await cease(s))).toBe(UNKNOWN_OUTCOME);
    expect(s.campaign.store.head().state_sha256).toBe(sha);
    expect(s.collect.hold(PC)).toEqual({ state: "CESSATION_REQUESTED", act_id: ACT_A });
  }, 120_000);
});
