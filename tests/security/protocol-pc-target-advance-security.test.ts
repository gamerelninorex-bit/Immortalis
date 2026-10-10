/* eslint-disable @typescript-eslint/no-explicit-any -- tests present hostile values and swap the campaign's store on purpose */
// IM-15 / IM-16 security evidence for the one allowlisted active-PC target-only advance: no host input can supply authority,
// identity, time, target, continuation, owner result or ownership; no refusal reveals a cause; nothing sealed or internal appears in
// a result; a forged or unprepared context reads and writes nothing; a campaign without the bound active PC makes the operation
// inert; and GIP's `expired` is never an input anywhere. The trusted context is an internal prerequisite: authentication, sessions
// and the choice interaction itself are NOT modelled and NOT claimed.
// Register lineage: IA-18 / IA-19 / IA-20 / IA-28 (partial, no status change); RC-05; RC-15; RC-16; IM-15; IM-16.
import { describe, expect, it } from "vitest";
import { CANON_WRITE_AUTHORITY, PLAYER_CHARACTER_BINDING_KEY } from "@immortalis/contracts";
import { SUNSET_LATER, SUNSET_MID, at } from "../support/gip-sunset.ts";
import { lifecycleOf, sunsetPcCampaign } from "../support/pc-gip-sunset.ts";
import { PC, movementSummary, type PcMoveSeeded } from "../support/pc-movement.ts";
import {
  PC_TARGET_REFUSAL,
  PC_TARGET_REQUEST,
  PC_TARGET_TX,
  PC_TARGET_TX2,
  PC_TARGET_TX3,
  advancePcTarget,
  pcTargetTransaction,
  refuseGipStageOf,
  stationarySunsetPcCampaign,
  trustedPcHeld,
  trustedPcTarget,
} from "../support/pc-target-advance.ts";
import { spyStore } from "../support/temporal.ts";

const OK = '{"ok":true,"value":{"status":"PC_TARGET_ADVANCE_COMMITTED"}}';
const call = async (ctx: ReturnType<typeof trustedPcTarget>, request: unknown) =>
  JSON.stringify(await advancePcTarget(ctx, request));
const summary = (s: PcMoveSeeded) => JSON.stringify(movementSummary(s));
const target = { target: SUNSET_LATER };

describe("IA-18 / IA-28: host input cannot supply authority, identity, time, target, continuation, owner result or ownership", () => {
  it("every claim is refused, never honoured, and nothing is read or written", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const ctx = trustedPcTarget(s, target);
    for (const claim of [
      { confirmed: true },
      { confirmation: { by: "player", at: 1 } },
      { approved: "yes" },
      { campaign_id: "other-campaign" },
      { pc_id: "actor-other" },
      { active_pc: null },
      { target: at(999999) },
      { until: at(999999) },
      { date: "2027-01-01" },
      { duration: 1 },
      { text: "wait until the court's order lapses" },
      { condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "o", boundary_id: "b" } },
      { requested: { target: null, condition: null } },
      { continues: PC_TARGET_TX },
      { from_transaction: PC_TARGET_TX },
      { held: { from_transaction: PC_TARGET_TX } },
      { toward: SUNSET_LATER },
      { transaction_id: "tx-host" },
      { cause: "host-cause" },
      { trigger: { kind: "host", ref: "host" } },
      { role: "role.player" },
      { permission: "permission.player_choice.commit" },
      { context: { role: "role.player", permission: "permission.player_choice.commit" } },
      { authority: CANON_WRITE_AUTHORITY },
      { provider: "gip" },
      { publication: { basis: "b", secrecy: "s" } },
      { lifecycle_status: "expired" },
      { instrument: { lifecycle_status: "expired" } },
      { expired: true },
      { due: true },
      { stage: { owner: "gip" } },
      { outcome: "TARGET_REACHED" },
      { owner: "gip" },
      { group_id: "g", intent_id: "i" },
      { source: "x", rule: "y", provenance: "z" },
      { sudo: true },
      { omniscient: true },
      { authorization: "Bearer abc" },
      { token: "abc" },
      { session: { id: "1" } },
    ])
      expect(await call(ctx, PC_TARGET_REQUEST(claim)), JSON.stringify(claim)).toBe(
        PC_TARGET_REFUSAL,
      );
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
    expect(spy.listCalls()).toBe(0);
  });

  it("a hostile or throwing request object is refused, never propagated", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const ctx = trustedPcTarget(s, target);
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
    expect(await call(ctx, throwing)).toBe(PC_TARGET_REFUSAL);
    expect(
      await call(
        ctx,
        JSON.parse('{"operation":"advance_active_pc_to_target","__proto__":{"a":1}}'),
      ),
    ).toBe(PC_TARGET_REFUSAL);
    expect(summary(s)).toBe(before);
  });

  it("a field smuggled through the prototype chain is never read: the target, continuation, request and identity are only ever the trusted ones", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const ctx = trustedPcTarget(s, target);
    const inherited = Object.create({
      target: at(1),
      continues: "tx-host-continuation",
      condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "obj-other", boundary_id: "b-other" },
      transaction_id: "tx-host",
    });
    inherited.operation = "advance_active_pc_to_target";
    expect([OK, PC_TARGET_REFUSAL]).toContain(await call(ctx, inherited));
    expect(s.coordinator.transaction("tx-host")).toBeUndefined();
    const tx = s.coordinator.transaction(PC_TARGET_TX)?.value;
    if (tx) {
      expect(tx.continues).toBeNull();
      expect(tx.requested).toEqual({ target: SUNSET_LATER, condition: null });
    }
  });

  it("the operation allowlist: other operation names, including internal and sibling ones, are refused", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const ctx = trustedPcTarget(s, target);
    const before = summary(s);
    for (const operation of [
      "getFact",
      "listFacts",
      "advance",
      "wait",
      "continueRemainder",
      "registerObject",
      "establishCanonicalTime",
      "expire_instrument",
      "advance_null_pc_ooc_to_target",
      "resume_null_pc_ooc_held_advance",
      "advance_confirmed_pc_transfer_to_delivery",
      "commit_confirmed_pc_relocation",
      "read_current_event_signal_presentation",
      "deliver_causal_event_signal_presentation",
      "ADVANCE_ACTIVE_PC_TO_TARGET",
      "advance_active_pc_to_target ",
    ])
      expect(await call(ctx, { operation }), operation).toBe(PC_TARGET_REFUSAL);
    expect(summary(s)).toBe(before);
  });

  it("a forged, copied, parsed or stale-object context is refused before any state is read or written, and no sibling gateway's context is accepted", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const real = trustedPcTarget(s, target);
    const {
      bindTrustedNullPcOocTargetAdvanceContext,
      bindTrustedConfirmedPcTransferAdvanceContext,
    } = await import("@immortalis/protocol");
    for (const forged of [
      {},
      { ...real },
      JSON.parse(JSON.stringify(real)),
      Object.create(real),
      bindTrustedNullPcOocTargetAdvanceContext({
        campaign: s.campaign,
        target: SUNSET_LATER,
        transaction: pcTargetTransaction("tx-null") as never,
      }),
      bindTrustedConfirmedPcTransferAdvanceContext({
        campaign: s.campaign,
        pc_id: PC,
        transaction: pcTargetTransaction("tx-adv") as never,
      }),
      undefined,
      null,
      7,
    ])
      expect(await call(forged as never, PC_TARGET_REQUEST())).toBe(PC_TARGET_REFUSAL);
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
  });

  it("a campaign with no operative PC, and the player-character role as a context, are inert: only the binding is read, nothing is written", async () => {
    const { seededSunsetCampaign, establishSunset } = await import("../support/gip-sunset.ts");
    const { tempDir } = await import("../support/tmp.ts");
    const nullPc = await seededSunsetCampaign(tempDir());
    await establishSunset(nullPc);
    const spy = spyStore(nullPc.campaign.store);
    (nullPc.campaign as any).store = spy.store;
    expect(await call(trustedPcTarget(nullPc as never, target), PC_TARGET_REQUEST())).toBe(
      PC_TARGET_REFUSAL,
    );
    expect(await call(trustedPcHeld(nullPc as never), PC_TARGET_REQUEST())).toBe(PC_TARGET_REFUSAL);
    // the only fact read is the operative binding itself: nothing of the world, the PC or the Temporal state
    expect(spy.getFacts).toEqual([PLAYER_CHARACTER_BINDING_KEY, PLAYER_CHARACTER_BINDING_KEY]);
    expect(spy.commits).toEqual([]);

    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const asCharacter = pcTargetTransaction("tx-as-pc", {
      context: { role: "role.player_character", permission: "permission.player_choice.commit" },
    });
    const before = summary(s);
    expect(
      await call(trustedPcTarget(s, { ...target, transaction: asCharacter }), PC_TARGET_REQUEST()),
    ).toBe(PC_TARGET_REFUSAL);
    expect(summary(s)).toBe(before);
  });
});

describe("IA-19 / IA-20: every refusal is the same refusal, and a success reveals only the minimum status", () => {
  it("each distinct cause — no PC, another PC, PC in transfer, held remainder, stale hold, unregistered sunset, wrong unit, backward target, forbidden permission, conflicting identity — yields byte-identical refusals that name no cause", async () => {
    const refusals = new Set<string>();
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    // another PC, wrong unit, backward target
    refusals.add(
      await call(trustedPcTarget(s, { ...target, pc_id: "actor-other" }), PC_TARGET_REQUEST()),
    );
    refusals.add(
      await call(
        trustedPcTarget(s, { target: { unit: "other-unit", value: 300 } }),
        PC_TARGET_REQUEST(),
      ),
    );
    refusals.add(await call(trustedPcTarget(s, { target: at(50) }), PC_TARGET_REQUEST()));
    // a forbidden permission is an inert context
    refusals.add(
      await call(
        trustedPcTarget(s, {
          ...target,
          transaction: pcTargetTransaction("tx-x", {
            context: { role: "role.archivist", permission: "permission.canon.write" },
          }),
        }),
        PC_TARGET_REQUEST(),
      ),
    );
    // a PC in transfer
    const moving = await sunsetPcCampaign(SUNSET_MID);
    refusals.add(await call(trustedPcTarget(moving, target), PC_TARGET_REQUEST()));
    // an unregistered sunset
    const pending = await stationarySunsetPcCampaign(SUNSET_MID, "pending");
    refusals.add(await call(trustedPcTarget(pending, target), PC_TARGET_REQUEST()));
    // a held remainder blocks a new initial choice; a stale hold and a conflicting identity after a real resume
    const held = await stationarySunsetPcCampaign(SUNSET_MID);
    const restore = refuseGipStageOf(held);
    expect(await call(trustedPcTarget(held, target), PC_TARGET_REQUEST())).toBe(OK);
    restore();
    refusals.add(
      await call(
        trustedPcTarget(held, { ...target, transaction: pcTargetTransaction("tx-other") }),
        PC_TARGET_REQUEST(),
      ),
    );
    expect(await call(trustedPcHeld(held), PC_TARGET_REQUEST())).toBe(OK);
    refusals.add(
      await call(
        trustedPcHeld(held, { transaction: pcTargetTransaction(PC_TARGET_TX3) }),
        PC_TARGET_REQUEST(),
      ),
    );
    refusals.add(
      await call(
        trustedPcHeld(held, {
          transaction: pcTargetTransaction(PC_TARGET_TX2, { cause: "another" }),
        }),
        PC_TARGET_REQUEST(),
      ),
    );
    expect([...refusals]).toEqual([PC_TARGET_REFUSAL]);
    expect(lifecycleOf(moving)).toBe("active");
    expect(lifecycleOf(pending)).toBe("active");
  });

  it("the success carries no owner, key, revision, hash, provenance, sealed, event, recipient, time, stop-reason, expiry or target-attainment vocabulary — and a retry is indistinguishable from the first call", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const ctx = trustedPcTarget(s, target);
    const first = await call(ctx, PC_TARGET_REQUEST());
    expect(first).toBe(OK);
    expect(await call(ctx, PC_TARGET_REQUEST())).toBe(first);
    expect(first).not.toMatch(
      /owner|key|revision|sha256|provenance|sealed|event|recipient|replayed|receipt|stop|reason|time|boundary|reached|attain|gip|instrument|expire|lifecycle|sunset|remain/i,
    );
  });

  it("an advance that expires an Instrument, one that crosses nothing, and one that stops again unresolved are byte-identical to the host: owner results and stop reasons are no side channel", async () => {
    const expiring = await stationarySunsetPcCampaign(SUNSET_MID);
    const quiet = await stationarySunsetPcCampaign(SUNSET_MID);
    const stopped = await stationarySunsetPcCampaign(SUNSET_MID);
    const restore = refuseGipStageOf(stopped);
    const a = await call(trustedPcTarget(expiring, target), PC_TARGET_REQUEST());
    const b = await call(trustedPcTarget(quiet, { target: at(120) }), PC_TARGET_REQUEST());
    const c = await call(trustedPcTarget(stopped, target), PC_TARGET_REQUEST());
    restore();
    expect([b, c]).toEqual([a, a]);
    expect(a).toBe(OK);
    expect(lifecycleOf(expiring)).toBe("expired");
    expect(lifecycleOf(quiet)).toBe("active");
    expect(lifecycleOf(stopped)).toBe("active");
    expect(stopped.coordinator.transaction(PC_TARGET_TX)!.value.outcome.stop_reason).toBe(
      "DEPENDENCY_UNRESOLVED",
    );
  });

  it("a refusal never echoes an owner message, key, identity, target or detail from the store or the kernel", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const out = await call(
      trustedPcHeld(s, {
        held: {
          from_transaction: "tx-secret-hold",
          target: { unit: "secret-unit", value: 123456 },
        },
      }),
      PC_TARGET_REQUEST(),
    );
    expect(out).toBe(PC_TARGET_REFUSAL);
    for (const leak of ["secret-unit", "123456", "tx-secret-hold", PC_TARGET_TX, PC_TARGET_TX2])
      expect(out).not.toContain(leak);
  });
});

describe("IA-20: the only writes are the kernel's own transaction groups and GIP's own stage, by the archivist path, under identities derived from the trusted transaction", () => {
  it("exactly the opening authority, GIP's one stage and the sealed transaction commit, each under canon-write authority, and none is player-authored or host-named", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    expect(await call(trustedPcTarget(s, target), PC_TARGET_REQUEST())).toBe(OK);
    expect(spy.commits).toHaveLength(3);
    for (const g of spy.commits) {
      expect(g.authority).toEqual(CANON_WRITE_AUTHORITY);
      expect(g.cause).toBe(`transaction:${PC_TARGET_TX}`);
    }
    expect(spy.commits.map((g) => g.owner)).toEqual(["temporal_kernel", "gip", "temporal_kernel"]);
    // no PC, custody, binding, packet or knowledge fact is written by the advance
    const written = spy.commits.flatMap((g) => g.writes.map((w) => w.key));
    expect(written.filter((k) => !k.startsWith("temporal/"))).toEqual([
      expect.stringMatching(/^gip\/instrument\//),
    ]);
    expect(spy.listCalls()).toBe(0);
  });

  it("reads only by identity: no whole-campaign scan is made", async () => {
    const s = await stationarySunsetPcCampaign(SUNSET_MID);
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    await call(trustedPcTarget(s, target), PC_TARGET_REQUEST());
    expect(spy.listCalls()).toBe(0);
    expect(spy.getFacts.length).toBeGreaterThan(0);
  });
});
