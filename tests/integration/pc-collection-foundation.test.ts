// CPAA-C1 v0.2 PROVISIONAL — consequential active-PC action: bounded direct collection from a finite source. "The player confirms one
// exact attempt; the PC-owned commitment and request exist; a role.gm reading of the physical reach is judged; Population registers
// the PC's occupied interval; Production DERIVES the cycles, the causal duration and the earned completion; the PC's time passes
// through the existing Temporal → Production → World-State → Production chain; the source drops once, the Reserve rises once; a
// separately confirmed second attempt meets the real remaining source."
// NOT ratified: C1/P-1/P-2 are provisional candidate lowerings (see packages/contracts/src/pc-collection.ts). Local success is not
// provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import { advanceActivePcToTarget } from "@immortalis/protocol";
import { cpSync } from "node:fs";
import {
  ACT_A,
  ACT_B,
  COLLECTION_COMMITTED,
  COLLECTION_REFUSAL,
  PC,
  START_REQ,
  TAU,
  W,
  accountOf,
  clock,
  collectionCampaign,
  confirmAndStart,
  extractionId,
  reopenCollection,
  reserveAmount,
  sourceRemaining,
  T0,
  at,
  trustedCollection,
} from "../support/pc-collection.ts";
import {
  PC_TARGET_COMMITTED,
  PC_TARGET_REFUSAL,
  PC_TARGET_TX,
  advancePcTarget,
  pcTargetTransaction,
} from "../support/pc-target-advance.ts";
import { startConfirmedPcCollection } from "@immortalis/protocol";
import { bindTrustedActivePcTargetAdvanceContext } from "@immortalis/protocol";
import { tempDir } from "../support/tmp.ts";

const target = (value: number) => at(value);
const advanceTo = (s: Awaited<ReturnType<typeof collectionCampaign>>, value: number, tx: string) =>
  advanceActivePcToTarget(
    bindTrustedActivePcTargetAdvanceContext({
      campaign: s.campaign as never,
      pc_id: PC,
      target: target(value),
      transaction: pcTargetTransaction(tx) as never,
    }),
    { operation: "advance_active_pc_to_target" },
  );

describe("CPAA-C1 v0.2 PROVISIONAL — the minimum witness: collect 3 from 5 → source 2, Reserve 3; a second 3 meets the real 2", () => {
  it("runs the whole chain, with every duration and the source and Reserve outcomes derived, never authored", async () => {
    const s = await collectionCampaign();
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    const t0 = clock(s).value;
    expect(t0).toBe(T0.value);

    const a = await confirmAndStart(s, ACT_A, 3);
    expect(a.committed).toEqual(COLLECTION_COMMITTED);
    expect(a.judged).toEqual(COLLECTION_COMMITTED);
    expect(a.started).toEqual(COLLECTION_COMMITTED);

    // started: nothing has moved. Time did not pass, the source is untouched, the Reserve is empty.
    expect(clock(s).value).toBe(t0);
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    // the earned completion is DERIVED: 3 serial cycles of τ from the start
    const ex = s.collect.extraction(PC, ACT_A)!;
    expect(ex.value.timing.boundary.at.value).toBe(t0 + 3 * TAU);
    expect(ex.value.timing.started_at.value).toBe(t0);
    expect(s.collect.work(PC, ACT_A)!.value.derivation).toMatchObject({ cycles: 3 });
    expect(s.collect.occupancyState(PC).state).toBe("OPEN");

    // an advance short of the earned boundary resolves nothing of the collection
    expect(await advanceTo(s, t0 + 3 * TAU - 1, PC_TARGET_TX)).toEqual(PC_TARGET_COMMITTED);
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    expect(s.collect.closed(PC, ACT_A)).toBe(false);

    // an advance across the boundary resolves it once
    expect(await advanceTo(s, t0 + 3 * TAU + 2, "tx-pc-collect-2")).toEqual(PC_TARGET_COMMITTED);
    expect(sourceRemaining(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
    expect(s.collect.closed(PC, ACT_A)).toBe(true);
    expect(s.collect.occupancyState(PC)).toMatchObject({
      state: "RELEASED",
      why: "CLOSED",
      act_id: ACT_A,
    });
    expect(accountOf(s)?.open ?? []).toEqual([]);

    // a separately confirmed second attempt for 3 is refused against the REAL remaining source; nothing moves
    const head = s.campaign.store.head().revision;
    const b = await confirmAndStart(s, ACT_B, 3);
    expect(b.committed).toEqual(COLLECTION_COMMITTED);
    expect(b.judged).toEqual(COLLECTION_COMMITTED);
    expect(JSON.stringify(b.started)).toBe(COLLECTION_REFUSAL);
    expect(head).toBeLessThan(s.campaign.store.head().revision);
    expect(sourceRemaining(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
    expect(s.collect.extraction(PC, ACT_B)).toBeUndefined();
    // the registration of the refused attempt was released by lawful denial: the PC is not left occupied
    expect(s.collect.occupancyState(PC)).toMatchObject({
      state: "RELEASED",
      why: "DENIED",
      act_id: ACT_B,
    });
    void extractionId;
    void W;
  });

  it("is reopen- and replay-stable at each durable cut, and re-presenting a request reconciles by identity", async () => {
    const dir = tempDir("immortalis-col-");
    const s = await collectionCampaign({ dir });
    const t0 = clock(s).value;
    await confirmAndStart(s, ACT_A, 3);
    const started = s.campaign.store.head();
    await s.campaign.close();

    const copy = tempDir("immortalis-col-copy-");
    cpSync(dir, copy, { recursive: true });
    const r = await reopenCollection(dir);
    expect(r.campaign.store.head().state_sha256).toBe(started.state_sha256);
    expect(sourceRemaining(r)).toBe(5);

    // RC-16: the same confirmed request again returns the original commitment, and writes nothing new
    const before = r.campaign.store.head();
    expect(await startConfirmedPcCollection(trustedCollection(r, ACT_A), START_REQ)).toEqual(
      COLLECTION_COMMITTED,
    );
    expect(r.campaign.store.head().state_sha256).toBe(before.state_sha256);

    expect(await advanceTo(r, t0 + 3 * TAU, "tx-after-reopen")).toEqual(PC_TARGET_COMMITTED);
    expect(sourceRemaining(r)).toBe(2);
    expect(reserveAmount(r)).toBe(3);
    const done = r.campaign.store.head();
    await r.campaign.close();

    const again = await reopenCollection(dir);
    expect(again.campaign.store.head().state_sha256).toBe(done.state_sha256);
    expect(sourceRemaining(again)).toBe(2);
    expect(reserveAmount(again)).toBe(3);
    void PC_TARGET_REFUSAL;
    void advancePcTarget;
  });
});
