/* eslint-disable @typescript-eslint/no-explicit-any -- tests present hostile values and swap the campaign's store on purpose */
// IM-15 / IM-16 security evidence for the one allowlisted NULL-PC OOC held-continuation advance: no host input can supply authority,
// identity, time, target, continuation or ownership; no refusal reveals a cause; nothing sealed or internal appears in a result; a
// forged or unprepared context reads and writes nothing; an active PC makes the operation inert. The trusted context is an internal
// prerequisite: authentication, sessions and the OOC choice interaction itself are NOT modelled and NOT claimed.
// Register lineage: IA-18 / IA-19 / IA-20 / IA-28 (partial, no status change); RC-05; RC-15; RC-16; IM-15; IM-16.
import { describe, expect, it } from "vitest";
import { CANON_WRITE_AUTHORITY, PLAYER_CHARACTER_BINDING_KEY } from "@immortalis/contracts";
import {
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  PROD_T1,
  at,
  fixtureContract,
  fixtureInsertionFact,
  publication,
} from "@immortalis/testkit";
import { acceptCommitDispatchRegister, logSummary, type LogSeeded } from "../support/logistics.ts";
import {
  HELD_REFUSAL,
  HELD_REQUEST,
  HELD_TX2,
  HELD_TX3,
  NULL_PC_TX,
  advanceNull,
  nullPcTransaction,
  refuseNullPcDeliveryStage,
  resumeHeld,
  seededNullPcCampaign,
  trustedHeld,
  trustedNullPcAdvance,
} from "../support/null-pc-held-advance.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const OK = '{"ok":true,"value":{"status":"NULL_PC_HELD_ADVANCE_COMMITTED"}}';
/** a NULL-PC campaign holding the truthful `DEPENDENCY_UNRESOLVED` remainder of its first OOC choice; the fault has been removed */
const heldCampaign = async (): Promise<LogSeeded> => {
  const s = await seededNullPcCampaign(tempDir());
  await acceptCommitDispatchRegister(s);
  const restore = refuseNullPcDeliveryStage(s, "req-1");
  await advanceNull(trustedNullPcAdvance(s));
  restore();
  return s;
};
const call = async (ctx: ReturnType<typeof trustedHeld>, request: unknown) =>
  JSON.stringify(await resumeHeld(ctx, request));
const summary = (s: LogSeeded) => JSON.stringify(logSummary(s.campaign, s.coordinator));

describe("IA-18 / IA-28: host input cannot supply authority, identity, time, target, continuation or ownership", () => {
  it("every claim is refused, never honoured, and nothing is read or written", async () => {
    const s = await heldCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const ctx = trustedHeld(s);
    for (const claim of [
      { confirmed: true },
      { confirmation: { by: "player", at: 1 } },
      { approved: "yes" },
      { campaign_id: "other-campaign" },
      { pc_id: FIXTURE_PC_ID },
      { active_pc: null },
      { target: PROD_T1 },
      { target: at(999999) },
      { until: at(999999) },
      { date: "2027-01-01" },
      { duration: 1 },
      { text: "keep going until something happens" },
      { condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "o", boundary_id: "b" } },
      { requested: { target: null, condition: null } },
      { continues: NULL_PC_TX },
      { from_transaction: NULL_PC_TX },
      { held: { from_transaction: NULL_PC_TX } },
      { toward: PROD_T1 },
      { unresolved_dependents: [] },
      { transaction_id: "tx-host" },
      { cause: "host-cause" },
      { trigger: { kind: "host", ref: "host" } },
      { role: "role.player" },
      { permission: "permission.player_choice.commit" },
      { context: { role: "role.player", permission: "permission.player_choice.commit" } },
      { authority: CANON_WRITE_AUTHORITY },
      { provider: "logistics" },
      { publication: { basis: "b", secrecy: "s" } },
      { outcome: "TARGET_REACHED" },
      { owner: "logistics" },
      { group_id: "g", intent_id: "i" },
      { source: "x", rule: "y", provenance: "z" },
      { sudo: true },
      { omniscient: true },
      { authorization: "Bearer abc" },
      { token: "abc" },
      { session: { id: "1" } },
    ])
      expect(await call(ctx, HELD_REQUEST(claim)), JSON.stringify(claim)).toBe(HELD_REFUSAL);
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
    expect(spy.listCalls()).toBe(0);
  });

  it("a hostile or throwing request object is refused, never propagated", async () => {
    const s = await heldCampaign();
    const ctx = trustedHeld(s);
    const before = summary(s);
    const throwing = new Proxy(
      {},
      {
        get: () => {
          throw new Error("hostile");
        },
        ownKeys: () => {
          throw new Error("hostile");
        },
      },
    );
    expect(await call(ctx, throwing)).toBe(HELD_REFUSAL);
    expect(
      await call(
        ctx,
        JSON.parse('{"operation":"resume_null_pc_ooc_held_advance","__proto__":{"a":1}}'),
      ),
    ).toBe(HELD_REFUSAL);
    expect(summary(s)).toBe(before);
  });

  it("a field smuggled through the prototype chain is never read: the continuation, request and identity are only ever the trusted and recorded ones", async () => {
    const s = await heldCampaign();
    const ctx = trustedHeld(s);
    const inherited = Object.create({
      target: at(1),
      continues: "tx-host-continuation",
      condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "obj-other", boundary_id: "b-other" },
      transaction_id: "tx-host",
    });
    inherited.operation = "resume_null_pc_ooc_held_advance";
    expect([OK, HELD_REFUSAL]).toContain(await call(ctx, inherited));
    expect(s.coordinator.transaction("tx-host")).toBeUndefined();
    const tx = s.coordinator.transaction(HELD_TX2)?.value;
    if (tx) {
      expect(tx.continues).toBe(NULL_PC_TX);
      expect(tx.requested).toEqual({ target: PROD_T1, condition: null });
    }
  });

  it("the operation allowlist: other operation names, including internal and sibling ones, are refused", async () => {
    const s = await heldCampaign();
    const ctx = trustedHeld(s);
    const before = summary(s);
    for (const operation of [
      "getFact",
      "listFacts",
      "advance",
      "resume",
      "continueRemainder",
      "registerObject",
      "establishCanonicalTime",
      "advance_null_pc_ooc_to_target",
      "advance_confirmed_pc_transfer_to_delivery",
      "commit_confirmed_pc_relocation",
      "read_current_event_signal_presentation",
      "deliver_causal_event_signal_presentation",
      "RESUME_NULL_PC_OOC_HELD_ADVANCE",
      "resume_null_pc_ooc_held_advance ",
    ])
      expect(await call(ctx, { operation }), operation).toBe(HELD_REFUSAL);
    expect(summary(s)).toBe(before);
  });

  it("a forged, copied, parsed or stale-object context is refused before any state is read or written, and the initial gateway's context is not a held-continuation context", async () => {
    const s = await heldCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const real = trustedHeld(s);
    for (const forged of [
      {},
      { ...real },
      JSON.parse(JSON.stringify(real)),
      Object.create(real),
      trustedNullPcAdvance(s, { transaction: nullPcTransaction(HELD_TX2) }),
      undefined,
      null,
      7,
    ])
      expect(await call(forged as never, HELD_REQUEST())).toBe(HELD_REFUSAL);
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
  });

  it("an active PC makes every otherwise-valid call inert, and the player-character role is never a context the gateway accepts", async () => {
    const s = await heldCampaign();
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }),
    );
    await must(
      s.campaign.bindPlayerCharacter({
        ...publication(4),
        pc_id: FIXTURE_PC_ID,
        world_id: FIXTURE_WORLD_ID,
        locus_id: FIXTURE_LOCUS_ID,
        insertion: fixtureInsertionFact(),
      }),
    );
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    expect(await call(trustedHeld(s), HELD_REQUEST())).toBe(HELD_REFUSAL);
    const asCharacter = nullPcTransaction("tx-as-pc", {
      context: { role: "role.player_character", permission: "permission.player_choice.commit" },
    });
    expect(await call(trustedHeld(s, { transaction: asCharacter }), HELD_REQUEST())).toBe(
      HELD_REFUSAL,
    );
    expect(spy.commits).toEqual([]);
    // the only fact read is the operative binding itself: nothing of the world, the PC or the Temporal state
    expect(spy.getFacts).toEqual([PLAYER_CHARACTER_BINDING_KEY]);
  });
});

describe("IA-19 / IA-20: every refusal is the same refusal, and a success reveals only the minimum status", () => {
  it("each distinct cause — no hold, stale hold, unknown hold, changed target, forbidden permission, active PC, conflicting identity — yields byte-identical refusals that name no cause", async () => {
    const refusals = new Set<string>();
    const a = await heldCampaign();
    // an unknown hold and a changed target
    refusals.add(
      await call(
        trustedHeld(a, { held: { from_transaction: "tx-unknown", target: PROD_T1 } }),
        HELD_REQUEST(),
      ),
    );
    refusals.add(
      await call(
        trustedHeld(a, { held: { from_transaction: NULL_PC_TX, target: at(PROD_T1.value + 1) } }),
        HELD_REQUEST(),
      ),
    );
    // a forbidden permission is an inert context
    refusals.add(
      await call(
        trustedHeld(a, {
          transaction: nullPcTransaction(HELD_TX2, {
            context: { role: "role.archivist", permission: "permission.canon.write" },
          }),
        }),
        HELD_REQUEST(),
      ),
    );
    // no hold at all
    const clean = await seededNullPcCampaign(tempDir());
    await acceptCommitDispatchRegister(clean);
    expect(await advanceNull(trustedNullPcAdvance(clean))).toMatchObject({ ok: true });
    refusals.add(await call(trustedHeld(clean), HELD_REQUEST()));
    // a stale hold, and a conflicting identity, after a real resume
    expect(await call(trustedHeld(a), HELD_REQUEST())).toBe(OK);
    refusals.add(
      await call(trustedHeld(a, { transaction: nullPcTransaction(HELD_TX3) }), HELD_REQUEST()),
    );
    refusals.add(
      await call(
        trustedHeld(a, { transaction: nullPcTransaction(HELD_TX2, { cause: "another" }) }),
        HELD_REQUEST(),
      ),
    );
    expect([...refusals]).toEqual([HELD_REFUSAL]);
  });

  it("the success carries no owner, key, revision, hash, provenance, sealed, event, recipient, time, stop-reason or target-attainment vocabulary — and a retry is indistinguishable from the first call", async () => {
    const s = await heldCampaign();
    const ctx = trustedHeld(s);
    const first = await call(ctx, HELD_REQUEST());
    expect(first).toBe(OK);
    expect(await call(ctx, HELD_REQUEST())).toBe(first);
    expect(first).not.toMatch(
      /owner|key|revision|sha256|provenance|sealed|event|recipient|replayed|receipt|stop|reason|time|boundary|reached|attain|logistics|world|remain/i,
    );
  });

  it("a resume that reaches the target and one that stops again unresolved are byte-identical to the host: the stop reason is not a side channel", async () => {
    const reached = await heldCampaign();
    const stopped = await heldCampaign();
    const restore = refuseNullPcDeliveryStage(stopped, "req-1");
    const a = await call(trustedHeld(reached), HELD_REQUEST());
    const b = await call(trustedHeld(stopped), HELD_REQUEST());
    restore();
    expect(b).toBe(a);
    expect(a).toBe(OK);
    expect(reached.coordinator.transaction(HELD_TX2)!.value.outcome.stop_reason).toBe(
      "TARGET_REACHED",
    );
    expect(stopped.coordinator.transaction(HELD_TX2)!.value.outcome.stop_reason).toBe(
      "DEPENDENCY_UNRESOLVED",
    );
  });

  it("a refusal never echoes an owner message, key, identity, target or detail from the store or the kernel", async () => {
    const s = await heldCampaign();
    const out = await call(
      trustedHeld(s, {
        held: {
          from_transaction: "tx-secret-hold",
          target: { unit: "secret-unit", value: 123456 },
        },
      }),
      HELD_REQUEST(),
    );
    expect(out).toBe(HELD_REFUSAL);
    for (const leak of ["secret-unit", "123456", "tx-secret-hold", NULL_PC_TX, HELD_TX2])
      expect(out).not.toContain(leak);
  });
});

describe("IA-20: the only writes are the kernel's own transaction groups, by the archivist path, under identities derived from the trusted transaction and the stage", () => {
  it("exactly the opening authority, the three owner stages and the sealed transaction commit, each under canon-write authority, and none is player-authored or host-named", async () => {
    const s = await heldCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    expect(await call(trustedHeld(s), HELD_REQUEST())).toBe(OK);
    expect(spy.commits).toHaveLength(5);
    for (const g of spy.commits) {
      expect(g.authority).toEqual(CANON_WRITE_AUTHORITY);
      expect(g.cause).toBe(`transaction:${HELD_TX2}`);
    }
    expect(spy.commits.map((g) => g.owner)).toEqual([
      "temporal_kernel",
      "logistics",
      "world_state",
      "logistics",
      "temporal_kernel",
    ]);
    expect(spy.listCalls()).toBe(0);
  });

  it("reads only by identity: no whole-campaign scan is made", async () => {
    const s = await heldCampaign();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    await call(trustedHeld(s), HELD_REQUEST());
    expect(spy.listCalls()).toBe(0);
    expect(spy.getFacts.length).toBeGreaterThan(0);
  });
});
