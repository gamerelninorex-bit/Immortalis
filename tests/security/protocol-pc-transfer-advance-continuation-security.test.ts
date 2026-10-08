/* eslint-disable @typescript-eslint/no-explicit-any -- tests present hostile values and swap the campaign's store on purpose */
// IM-15 / IM-16 security evidence for the held-continuation support of the one allowlisted confirmed stop-at-delivery advance
// (forty-fourth bounded slice): the host cannot distinguish a first progress from a resumed one nor learn a stop reason; no
// refusal reveals a cause or that a prior stop was held; no host field selects a continuation, request, target or identity; a
// refused attempt reads nothing it should not and writes nothing. Authentication and sessions are NOT modelled and NOT claimed.
// Register lineage: IA-18 / IA-19 / IA-20 / IA-28 (partial, no status change); RC-05; RC-15; RC-16; IM-15; IM-16.
import { describe, expect, it } from "vitest";
import { CANON_WRITE_AUTHORITY, PLAYER_CHOICE_AUTHORITY } from "@immortalis/contracts";
import { custodiedCampaign, movementSummary, type PcMoveSeeded } from "../support/pc-movement.ts";
import {
  ADVANCE_REFUSAL,
  ADVANCE_REQUEST,
  ADVANCE_TX,
  advance,
  advanceTransaction,
  refuseDeliveryStage,
  relocatedCampaign,
  trustedAdvance,
} from "../support/protocol-advance.ts";
import { spyStore } from "../support/temporal.ts";

const OK = '{"ok":true,"value":{"status":"ADVANCE_COMMITTED"}}';
const TX2 = "tx-pc-second-choice";
const relocated = () => relocatedCampaign(() => custodiedCampaign());
const call = async (s: PcMoveSeeded, id: string, request: unknown = ADVANCE_REQUEST()) =>
  JSON.stringify(
    await advance(trustedAdvance(s, { transaction: advanceTransaction(id) }), request),
  );
const held = async () => {
  const s = await relocated();
  const restore = refuseDeliveryStage(s);
  expect(await call(s, ADVANCE_TX)).toBe(OK);
  return { s, restore };
};

describe("the host cannot tell a first progress from a held continuation, nor learn a stop reason", () => {
  it("first progress, a resumed progress that arrives and a resumed progress that stops again are byte-identical on the wire", async () => {
    const first = await relocated();
    const a = await call(first, ADVANCE_TX);
    const arriving = await held();
    arriving.restore();
    const b = await call(arriving.s, TX2);
    const again = await held();
    const c = await call(again.s, TX2);
    expect([a, b, c]).toEqual([OK, OK, OK]);
  });

  it("a replay of the held choice and a replay of the continuing choice are byte-identical to the original reply", async () => {
    const { s, restore } = await held();
    restore();
    expect(await call(s, ADVANCE_TX)).toBe(OK);
    expect(await call(s, TX2)).toBe(OK);
    expect(await call(s, TX2)).toBe(OK);
    expect(await call(s, ADVANCE_TX)).toBe(OK);
  });
});

describe("IA-18 / IA-28: no host field selects a continuation, a request, a target or an identity", () => {
  it("every claim is refused identically whether or not a continuation is held, and nothing is written", async () => {
    const { s, restore } = await held();
    restore();
    const fresh = await relocated();
    const before = movementSummary(s);
    const freshBefore = movementSummary(fresh);
    for (const claim of [
      { continues: ADVANCE_TX },
      { continuation: { from_transaction: ADVANCE_TX } },
      { resume: true },
      { held: ADVANCE_TX },
      { requested: { target: null, condition: null } },
      { target: { unit: "fixture-time-unit", value: 9999 } },
      { transaction_id: TX2 },
      { role: "role.player" },
      { permission: "permission.player_choice.commit" },
      { context: { ...PLAYER_CHOICE_AUTHORITY } },
    ]) {
      const a = await call(s, TX2, ADVANCE_REQUEST(claim));
      const b = await call(fresh, TX2, ADVANCE_REQUEST(claim));
      expect(a, JSON.stringify(claim)).toBe(ADVANCE_REFUSAL);
      expect(b, JSON.stringify(claim)).toBe(ADVANCE_REFUSAL);
    }
    expect(movementSummary(s)).toEqual(before);
    expect(movementSummary(fresh)).toEqual(freshBefore);
  });

  it("a trusted side that states the canon-write authority, or another PC, cannot consume a held continuation", async () => {
    const { s, restore } = await held();
    restore();
    const before = movementSummary(s);
    for (const ctx of [
      trustedAdvance(s, {
        transaction: advanceTransaction(TX2, { context: { ...CANON_WRITE_AUTHORITY } }),
      }),
      trustedAdvance(s, { pc_id: "pc-someone-else", transaction: advanceTransaction(TX2) }),
      trustedAdvance(s, { transaction: advanceTransaction(TX2, { continues: ADVANCE_TX }) }),
      trustedAdvance(s, {
        transaction: advanceTransaction(TX2, { requested: { target: null, condition: null } }),
      }),
    ])
      expect(JSON.stringify(await advance(ctx))).toBe(ADVANCE_REFUSAL);
    expect(movementSummary(s)).toEqual(before);
  });

  it("a refusal never reveals that a continuation was held: a held and an unheld campaign refuse the same bytes", async () => {
    const { s, restore } = await held();
    restore();
    const fresh = await relocated();
    expect(await call(s, TX2, "nope")).toBe(await call(fresh, TX2, "nope"));
    // a re-used trigger on a held journey is the one refusal as well
    const reused = trustedAdvance(s, {
      transaction: advanceTransaction(TX2, { trigger: advanceTransaction().trigger }),
    });
    expect(JSON.stringify(await advance(reused))).toBe(ADVANCE_REFUSAL);
  });
});

describe("the gateway only observes: it reads the committed state and the kernel writes", () => {
  it("a refused continuation attempt commits nothing, and an accepted one commits only under the kernel's canon-write authority groups", async () => {
    const { s, restore } = await held();
    restore();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    expect(await call(s, TX2, { operation: "other" })).toBe(ADVANCE_REFUSAL);
    expect(spy.commits).toHaveLength(0);
    expect(await call(s, TX2)).toBe(OK);
    expect(spy.commits).toHaveLength(5);
    for (const g of spy.commits) {
      expect(g.authority).toEqual(CANON_WRITE_AUTHORITY);
      expect(g.cause).toBe(`transaction:${TX2}`);
    }
    expect(spy.commits.map((g) => g.owner)).toEqual([
      "temporal_kernel",
      "logistics",
      "world_state",
      "logistics",
      "temporal_kernel",
    ]);
  });
});
