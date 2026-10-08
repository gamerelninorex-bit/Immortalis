/* eslint-disable @typescript-eslint/no-explicit-any -- tests present hostile values and swap the campaign's store on purpose */
// IM-15 / IM-16 security evidence for the one allowlisted confirmed stop-at-delivery advance: no host input can supply authority,
// confirmation, identity, time, target, condition, boundary or ownership; no refusal reveals a cause; nothing sealed or internal
// appears in a result; a forged or unprepared context reads and writes nothing. The trusted context is an internal prerequisite:
// authentication, sessions and the confirmation interaction itself are NOT modelled and NOT claimed. Register lineage: IA-18 /
// IA-19 / IA-20 / IA-28 (partial, no status change); RC-05; RC-15; RC-16; IM-15; IM-16.
import { describe, expect, it } from "vitest";
import { CANON_WRITE_AUTHORITY } from "@immortalis/contracts";
import { ACTOR_OTHER } from "@immortalis/testkit";
import {
  PC,
  REQUEST_ID,
  advanceToDelivery,
  commitMove,
  custodiedCampaign,
  logisticsCommit,
  logisticsDispatch,
  movementSummary,
  requestMove,
} from "../support/pc-movement.ts";
import {
  ADVANCE_REFUSAL,
  ADVANCE_REQUEST,
  advance,
  advanceTransaction,
  refuseDeliveryStage,
  relocatedCampaign,
  trustedAdvance,
} from "../support/protocol-advance.ts";
import { must, spyStore } from "../support/temporal.ts";

const OK = '{"ok":true,"value":{"status":"ADVANCE_COMMITTED"}}';
const relocated = () => relocatedCampaign(() => custodiedCampaign());
const call = async (ctx: ReturnType<typeof trustedAdvance>, request: unknown) =>
  JSON.stringify(await advance(ctx, request));

describe("IA-18 / IA-28: host input cannot supply authority, confirmation, identity, time, target, condition, boundary or ownership", () => {
  it("every claim is refused, never honoured, and nothing is read or written", async () => {
    const s = await relocated();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const ctx = trustedAdvance(s);
    for (const claim of [
      { confirmed: true },
      { confirmation: { by: "player", at: 1 } },
      { player_confirmed: true },
      { approved: "yes" },
      { campaign_id: "other-campaign" },
      { pc_id: ACTOR_OTHER },
      { pc: ACTOR_OTHER },
      { route: ["a", "b"] },
      { destination: { world_id: "world-1", locus_id: "locus-fixture-other" } },
      { clock: { unit: "t", value: 1 } },
      { now: { unit: "t", value: 1 } },
      { target: { unit: "fixture-time-unit", value: 9999 } },
      { until: { unit: "fixture-time-unit", value: 9999 } },
      { advance_to: { unit: "fixture-time-unit", value: 9999 } },
      { duration: 1 },
      { wait: 100 },
      { boundary_id: "boundary-x" },
      { object_id: "obj-x" },
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
      { authorization: "Bearer abc" },
      { token: "abc" },
      { session: { id: "1" } },
    ])
      expect(await call(ctx, ADVANCE_REQUEST(claim)), JSON.stringify(claim)).toBe(ADVANCE_REFUSAL);
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
    expect(spy.listCalls()).toBe(0);
  });

  it("a hostile or throwing request object is refused, never propagated", async () => {
    const s = await relocated();
    const ctx = trustedAdvance(s);
    const before = movementSummary(s);
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
    expect(await call(ctx, throwing)).toBe(ADVANCE_REFUSAL);
    expect(
      await call(
        ctx,
        JSON.parse('{"operation":"advance_confirmed_pc_transfer_to_delivery","__proto__":{"a":1}}'),
      ),
    ).toBe(ADVANCE_REFUSAL);
    expect(movementSummary(s)).toEqual(before);
  });

  it("a field smuggled through the prototype chain is refused or never read: the stop is only ever the one the committed state earns", async () => {
    const s = await relocated();
    const ctx = trustedAdvance(s);
    const inherited = Object.create({
      target: { unit: "fixture-time-unit", value: 99999 },
      condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "obj-other", boundary_id: "b-other" },
      transaction_id: "tx-host",
    });
    inherited.operation = "advance_confirmed_pc_transfer_to_delivery";
    expect([OK, ADVANCE_REFUSAL]).toContain(await call(ctx, inherited));
    expect(s.coordinator.transaction("tx-host")).toBeUndefined();
    const tx = s.coordinator.transaction("tx-pc-player-advance")?.value;
    if (tx) expect(tx.requested.target).toBeNull();
  });

  it("the operation allowlist: other operation names, including internal and sibling ones, are refused", async () => {
    const s = await relocated();
    const ctx = trustedAdvance(s);
    const before = movementSummary(s);
    for (const operation of [
      "getFact",
      "listFacts",
      "advance",
      "continueRemainder",
      "registerObject",
      "establishCanonicalTime",
      "commit_confirmed_pc_relocation",
      "read_current_event_signal_presentation",
      "deliver_causal_event_signal_presentation",
      "ADVANCE_CONFIRMED_PC_TRANSFER_TO_DELIVERY",
      "advance_confirmed_pc_transfer_to_delivery ",
    ])
      expect(await call(ctx, { operation }), operation).toBe(ADVANCE_REFUSAL);
    expect(movementSummary(s)).toEqual(before);
  });

  it("a forged, copied, parsed or stale-object context is refused before any state is read or written", async () => {
    const s = await relocated();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    const real = trustedAdvance(s);
    for (const forged of [
      {},
      { ...real },
      JSON.parse(JSON.stringify(real)),
      Object.create(real),
      undefined,
      null,
      7,
    ])
      expect(await call(forged as never, ADVANCE_REQUEST())).toBe(ADVANCE_REFUSAL);
    expect(spy.getFacts).toEqual([]);
    expect(spy.commits).toEqual([]);
  });
});

describe("IA-19 / IA-20: every refusal is the same refusal, and a success reveals only the minimum status", () => {
  it("each distinct cause — wrong PC, no movement, unenrolled transfer, resolved boundary, held remainder, conflicting identity, forbidden permission — yields byte-identical refusals that name no cause", async () => {
    const refusals = new Set<string>();
    // a wrong or unknown PC
    const a = await relocated();
    for (const pc_id of [ACTOR_OTHER, "actor-nobody"])
      refusals.add(await call(trustedAdvance(a, { pc_id }), ADVANCE_REQUEST()));
    // a forbidden permission is an inert context
    refusals.add(
      await call(
        trustedAdvance(a, {
          transaction: advanceTransaction("tx-pc-player-advance", {
            context: { role: "role.archivist", permission: "permission.canon.write" },
          }),
        }),
        ADVANCE_REQUEST(),
      ),
    );
    // no movement at all
    const b = await custodiedCampaign();
    refusals.add(await call(trustedAdvance(b), ADVANCE_REQUEST()));
    // a transfer never enrolled with the Temporal kernel
    const c = await custodiedCampaign();
    await must(commitMove(c, 1));
    await must(requestMove(c, 2));
    await must(logisticsCommit(c, 3));
    await must(logisticsDispatch(c, 4));
    refusals.add(await call(trustedAdvance(c), ADVANCE_REQUEST()));
    // a boundary someone else already resolved
    const d = await relocated();
    await must(advanceToDelivery(d, "tx-foreign"));
    refusals.add(await call(trustedAdvance(d), ADVANCE_REQUEST()));
    // a held remainder and a conflicting identity
    const e = await relocated();
    const restore = refuseDeliveryStage(e);
    expect(await call(trustedAdvance(e), ADVANCE_REQUEST())).toBe(OK);
    restore();
    refusals.add(
      await call(
        trustedAdvance(e, { transaction: advanceTransaction("tx-pc-second-choice") }),
        ADVANCE_REQUEST(),
      ),
    );
    refusals.add(
      await call(
        trustedAdvance(e, {
          transaction: advanceTransaction("tx-pc-player-advance", { cause: "another" }),
        }),
        ADVANCE_REQUEST(),
      ),
    );
    expect([...refusals]).toEqual([ADVANCE_REFUSAL]);
  });

  it("the success carries no owner, key, revision, hash, provenance, sealed, route, locus, time, stop-reason or arrival vocabulary — and a retry is indistinguishable from the first call", async () => {
    const s = await relocated();
    const ctx = trustedAdvance(s);
    const first = await call(ctx, ADVANCE_REQUEST());
    expect(first).toBe(OK);
    expect(await call(ctx, ADVANCE_REQUEST())).toBe(first);
    expect(first).not.toMatch(
      /owner|key|revision|sha256|provenance|sealed|route|locus|arriv|deliver|replayed|receipt|stop|reason|time|boundary|pc_existence|logistics|world/i,
    );
  });

  it("an unresolved stop and an arrival are byte-identical to the host: the stop reason is not a side channel", async () => {
    const arrived = await relocated();
    const stopped = await relocated();
    const restore = refuseDeliveryStage(stopped);
    const a = await call(trustedAdvance(arrived), ADVANCE_REQUEST());
    const b = await call(trustedAdvance(stopped), ADVANCE_REQUEST());
    restore();
    expect(b).toBe(a);
    expect(a).toBe(OK);
  });

  it("a refusal never echoes an owner message, key, identity or detail from the store or the kernel", async () => {
    const s = await relocated();
    const out = await call(trustedAdvance(s, { pc_id: "actor-nobody" }), ADVANCE_REQUEST());
    expect(out).toBe(ADVANCE_REFUSAL);
    expect(out).not.toContain("actor-nobody");
    expect(out).not.toContain(PC);
    expect(out).not.toContain(REQUEST_ID);
  });
});

describe("IA-20: the only writes are the kernel's own transaction groups, by the archivist path, under identities derived from the trusted transaction and the stage", () => {
  it("exactly the opening authority, the three owner stages and the sealed transaction commit, each under canon-write authority, and none is player-authored or host-named", async () => {
    const s = await relocated();
    const spy = spyStore(s.campaign.store);
    (s.campaign as any).store = spy.store;
    expect(await call(trustedAdvance(s), ADVANCE_REQUEST())).toBe(OK);
    expect(spy.commits).toHaveLength(5);
    for (const g of spy.commits) {
      expect(g.authority).toEqual(CANON_WRITE_AUTHORITY);
      expect(g.cause).toBe("transaction:tx-pc-player-advance");
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
});
