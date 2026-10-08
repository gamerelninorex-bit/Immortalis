/* eslint-disable @typescript-eslint/no-explicit-any -- tests present hostile values and swap the campaign's store on purpose */
// IM-15 / IM-16 security evidence for the one allowlisted NULL-PC OOC target-only advance: no host input can supply authority,
// identity, time, target, condition or ownership; no refusal reveals a cause; nothing sealed or internal appears in a result; a
// forged or unprepared context reads and writes nothing; an active PC makes the operation inert. The trusted context is an internal
// prerequisite: authentication, sessions and the OOC choice interaction itself are NOT modelled and NOT claimed.
// Register lineage: IA-18 / IA-19 / IA-20 / IA-28 (partial, no status change); RC-05; RC-15; RC-16; IM-15; IM-16.
import { describe, expect, it } from "vitest";
import { CANON_WRITE_AUTHORITY, PLAYER_CHARACTER_BINDING_KEY } from "@immortalis/contracts";
import {
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  PROD_T0,
  PROD_T1,
  at,
  fixtureContract,
  fixtureInsertionFact,
  publication,
} from "@immortalis/testkit";
import { acceptCommitDispatchRegister, logSummary, type LogSeeded } from "../support/logistics.ts";
import {
  NULL_PC_REFUSAL,
  NULL_PC_REQUEST,
  NULL_PC_TX,
  advanceNull,
  nullPcTransaction,
  refuseNullPcDeliveryStage,
  seededNullPcCampaign,
  seededNullPcSyntheticCampaign,
  trustedNullPcAdvance,
} from "../support/null-pc-advance.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const OK = '{"ok":true,"value":{"status":"NULL_PC_ADVANCE_COMMITTED"}}';
const due = async (): Promise<LogSeeded> => {
  const s = await seededNullPcCampaign(tempDir());
  await acceptCommitDispatchRegister(s);
  return s;
};
const call = async (ctx: ReturnType<typeof trustedNullPcAdvance>, request: unknown) =>
  JSON.stringify(await advanceNull(ctx, request));
const summary = (s: LogSeeded) => JSON.stringify(logSummary(s.campaign, s.coordinator));

describe("IA-18 / IA-28: host input cannot supply authority, identity, time, target, condition or ownership", () => {
  it("every claim is refused, never honoured, and nothing is read or written", async () => {
    const s = await due();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const ctx = trustedNullPcAdvance(s);
    for (const claim of [
      { confirmed: true },
      { confirmation: { by: "player", at: 1 } },
      { player_confirmed: true },
      { approved: "yes" },
      { campaign_id: "other-campaign" },
      { pc_id: FIXTURE_PC_ID },
      { pc: null },
      { active_pc: null },
      { role_player_character: null },
      { clock: { unit: "t", value: 1 } },
      { now: { unit: "t", value: 1 } },
      { target: PROD_T1 },
      { target: at(999999) },
      { until: at(999999) },
      { advance_to: at(999999) },
      { date: "2027-01-01" },
      { calendar: "gregorian" },
      { unit: "days" },
      { duration: 1 },
      { wait: 100 },
      { text: "skip ahead until something happens" },
      { condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "o", boundary_id: "b" } },
      { requested: { target: null, condition: null } },
      { continues: "tx-0" },
      { transaction_id: "tx-host" },
      { cause: "host-cause" },
      { trigger: { kind: "host", ref: "host" } },
      { role: "role.player" },
      { permission: "permission.player_choice.commit" },
      { context: { role: "role.player", permission: "permission.player_choice.commit" } },
      { authority: CANON_WRITE_AUTHORITY },
      { publication: { basis: "b", secrecy: "s" } },
      { owner: "logistics" },
      { group_id: "g", intent_id: "i" },
      { source: "x", rule: "y", provenance: "z" },
      { sudo: true },
      { omniscient: true },
      { authorization: "Bearer abc" },
      { token: "abc" },
      { session: { id: "1" } },
    ])
      expect(await call(ctx, NULL_PC_REQUEST(claim)), JSON.stringify(claim)).toBe(NULL_PC_REFUSAL);
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
    expect(spy.listCalls()).toBe(0);
  });

  it("a hostile or throwing request object is refused, never propagated", async () => {
    const s = await due();
    const ctx = trustedNullPcAdvance(s);
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
    expect(await call(ctx, throwing)).toBe(NULL_PC_REFUSAL);
    expect(
      await call(
        ctx,
        JSON.parse('{"operation":"advance_null_pc_ooc_to_target","__proto__":{"a":1}}'),
      ),
    ).toBe(NULL_PC_REFUSAL);
    expect(summary(s)).toBe(before);
  });

  it("a field smuggled through the prototype chain is never read: the target and identity are only ever the trusted ones", async () => {
    const s = await due();
    const ctx = trustedNullPcAdvance(s);
    const inherited = Object.create({
      target: at(1),
      condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "obj-other", boundary_id: "b-other" },
      transaction_id: "tx-host",
    });
    inherited.operation = "advance_null_pc_ooc_to_target";
    expect([OK, NULL_PC_REFUSAL]).toContain(await call(ctx, inherited));
    expect(s.coordinator.transaction("tx-host")).toBeUndefined();
    const tx = s.coordinator.transaction(NULL_PC_TX)?.value;
    if (tx) expect(tx.requested).toEqual({ target: PROD_T1, condition: null });
  });

  it("the operation allowlist: other operation names, including internal and sibling ones, are refused", async () => {
    const s = await due();
    const ctx = trustedNullPcAdvance(s);
    const before = summary(s);
    for (const operation of [
      "getFact",
      "listFacts",
      "advance",
      "wait",
      "skip_time",
      "continueRemainder",
      "registerObject",
      "establishCanonicalTime",
      "advance_confirmed_pc_transfer_to_delivery",
      "commit_confirmed_pc_relocation",
      "read_current_event_signal_presentation",
      "deliver_causal_event_signal_presentation",
      "ADVANCE_NULL_PC_OOC_TO_TARGET",
      "advance_null_pc_ooc_to_target ",
    ])
      expect(await call(ctx, { operation }), operation).toBe(NULL_PC_REFUSAL);
    expect(summary(s)).toBe(before);
  });

  it("a forged, copied, parsed or stale-object context is refused before any state is read or written", async () => {
    const s = await due();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const real = trustedNullPcAdvance(s);
    for (const forged of [
      {},
      { ...real },
      JSON.parse(JSON.stringify(real)),
      Object.create(real),
      undefined,
      null,
      7,
    ])
      expect(await call(forged as never, NULL_PC_REQUEST())).toBe(NULL_PC_REFUSAL);
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
  });

  it("an active PC makes every otherwise-valid call inert, and the player-character role is never a context the gateway accepts", async () => {
    const s = await due();
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
    expect(await call(trustedNullPcAdvance(s), NULL_PC_REQUEST())).toBe(NULL_PC_REFUSAL);
    const asCharacter = nullPcTransaction("tx-as-pc", {
      context: { role: "role.player_character", permission: "permission.player_choice.commit" },
    });
    expect(
      await call(trustedNullPcAdvance(s, { transaction: asCharacter }), NULL_PC_REQUEST()),
    ).toBe(NULL_PC_REFUSAL);
    expect(spy.commits).toEqual([]);
    // the only fact read is the operative binding itself: nothing of the world, the PC or the Temporal state
    expect(spy.getFacts).toEqual([PLAYER_CHARACTER_BINDING_KEY]);
  });
});

describe("IA-19 / IA-20: every refusal is the same refusal, and a success reveals only the minimum status", () => {
  it("each distinct cause — past target, wrong unit, nothing due, held continuation, conflicting identity, forbidden permission, active PC, no basis — yields byte-identical refusals that name no cause", async () => {
    const refusals = new Set<string>();
    const a = await due();
    // a past target and a target in another unit
    for (const target of [at(PROD_T0.value - 1), { unit: "other-unit", value: 1 }])
      refusals.add(await call(trustedNullPcAdvance(a, { target }), NULL_PC_REQUEST()));
    // a target before the due boundary (nothing due at or before it)
    refusals.add(
      await call(trustedNullPcAdvance(a, { target: at(PROD_T0.value + 50) }), NULL_PC_REQUEST()),
    );
    // a forbidden permission is an inert context
    refusals.add(
      await call(
        trustedNullPcAdvance(a, {
          transaction: nullPcTransaction(NULL_PC_TX, {
            context: { role: "role.archivist", permission: "permission.canon.write" },
          }),
        }),
        NULL_PC_REQUEST(),
      ),
    );
    // a held continuation offered a new target, and a conflicting identity
    const b = await due();
    const restore = refuseNullPcDeliveryStage(b, "req-1");
    expect(await call(trustedNullPcAdvance(b), NULL_PC_REQUEST())).toBe(OK);
    restore();
    refusals.add(
      await call(
        trustedNullPcAdvance(b, { transaction: nullPcTransaction("tx-null-pc-second-choice") }),
        NULL_PC_REQUEST(),
      ),
    );
    refusals.add(
      await call(
        trustedNullPcAdvance(b, {
          transaction: nullPcTransaction(NULL_PC_TX, { cause: "another" }),
        }),
        NULL_PC_REQUEST(),
      ),
    );
    // a campaign that is not yet a Temporal campaign at all
    const c = await seededNullPcSyntheticCampaign(tempDir());
    refusals.add(
      await call(trustedNullPcAdvance(c as never, { target: at(1) }), NULL_PC_REQUEST()),
    );
    expect([...refusals]).toEqual([NULL_PC_REFUSAL]);
  });

  it("the success carries no owner, key, revision, hash, provenance, sealed, event, recipient, time, stop-reason or target-attainment vocabulary — and a retry is indistinguishable from the first call", async () => {
    const s = await due();
    const ctx = trustedNullPcAdvance(s);
    const first = await call(ctx, NULL_PC_REQUEST());
    expect(first).toBe(OK);
    expect(await call(ctx, NULL_PC_REQUEST())).toBe(first);
    expect(first).not.toMatch(
      /owner|key|revision|sha256|provenance|sealed|event|recipient|replayed|receipt|stop|reason|time|boundary|reached|attain|logistics|world/i,
    );
  });

  it("an unresolved stop and a reached target are byte-identical to the host: the stop reason is not a side channel", async () => {
    const reached = await due();
    const stopped = await due();
    const restore = refuseNullPcDeliveryStage(stopped, "req-1");
    const a = await call(trustedNullPcAdvance(reached), NULL_PC_REQUEST());
    const b = await call(trustedNullPcAdvance(stopped), NULL_PC_REQUEST());
    restore();
    expect(b).toBe(a);
    expect(a).toBe(OK);
    expect(stopped.coordinator.transaction(NULL_PC_TX)!.value.outcome.stop_reason).toBe(
      "DEPENDENCY_UNRESOLVED",
    );
    expect(reached.coordinator.transaction(NULL_PC_TX)!.value.outcome.stop_reason).toBe(
      "TARGET_REACHED",
    );
  });

  it("a refusal never echoes an owner message, key, identity, target or detail from the store or the kernel", async () => {
    const s = await due();
    const out = await call(
      trustedNullPcAdvance(s, { target: { unit: "secret-unit", value: 123456 } }),
      NULL_PC_REQUEST(),
    );
    expect(out).toBe(NULL_PC_REFUSAL);
    expect(out).not.toContain("secret-unit");
    expect(out).not.toContain("123456");
    expect(out).not.toContain(NULL_PC_TX);
  });
});

describe("IA-20: the only writes are the kernel's own transaction groups, by the archivist path, under identities derived from the trusted transaction and the stage", () => {
  it("exactly the opening authority, the three owner stages and the sealed transaction commit, each under canon-write authority, and none is player-authored or host-named", async () => {
    const s = await due();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    expect(await call(trustedNullPcAdvance(s), NULL_PC_REQUEST())).toBe(OK);
    expect(spy.commits).toHaveLength(5);
    for (const g of spy.commits) {
      expect(g.authority).toEqual(CANON_WRITE_AUTHORITY);
      expect(g.cause).toBe(`transaction:${NULL_PC_TX}`);
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
    const s = await due();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    await call(trustedNullPcAdvance(s), NULL_PC_REQUEST());
    expect(spy.listCalls()).toBe(0);
    expect(spy.getFacts.length).toBeGreaterThan(0);
  });
});
