// The active-PC target-only operation, exercised over a RECORDING campaign (no real owner): the host names nothing, an inert or
// forged context touches nothing, a campaign without the bound active PC is inert before any other fact is read, and nothing a host
// sends can widen what is touched or read.
// Register lineage: IA-18 / IA-19 / IA-20 / IA-28 (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcHeldTargetAdvanceContext,
  bindTrustedActivePcTargetAdvanceContext,
} from "@immortalis/protocol";
import {
  PC_TARGET_REFUSAL,
  PC_TARGET_REQUEST,
  pcTargetTransaction,
} from "../support/pc-target-advance.ts";

const TARGET = { unit: "u", value: 10 };
const HELD = { from_transaction: "tx-held", target: TARGET };

/** A campaign that records every access to it and to its store; `active` makes the binding read return the PC. */
const recording = (active = false) => {
  const touches: string[] = [];
  const store = new Proxy(
    {},
    {
      get(_t, prop) {
        touches.push(`store.${String(prop)}`);
        return prop === "head" ? () => ({ revision: 1 }) : () => undefined;
      },
    },
  );
  const read = (name: string) => (): undefined => {
    touches.push(name);
    return undefined;
  };
  const campaign = {
    store,
    binding: () => {
      touches.push("binding");
      return active ? { value: { active_pc: { entity_id: "pc-1" } } } : undefined;
    },
    pcCurrentLocus: read("pcCurrentLocus"),
    pcMovementCommitment: read("pcMovementCommitment"),
    pcMovementRequest: read("pcMovementRequest"),
    pcPhysicalLocusCustody: read("pcPhysicalLocusCustody"),
  };
  return { campaign: campaign as never, touches };
};
const initial = (campaign: never, over: Record<string, unknown> = {}) =>
  bindTrustedActivePcTargetAdvanceContext({
    campaign,
    pc_id: "pc-1",
    target: TARGET,
    transaction: pcTargetTransaction("tx-new"),
    ...over,
  } as never);
const resumed = (campaign: never, over: Record<string, unknown> = {}) =>
  bindTrustedActivePcHeldTargetAdvanceContext({
    campaign,
    pc_id: "pc-1",
    held: HELD,
    transaction: pcTargetTransaction("tx-new"),
    ...over,
  } as never);
const run = async (ctx: unknown, request: unknown) =>
  JSON.stringify(
    await advanceActivePcToTarget(
      ctx as ReturnType<typeof bindTrustedActivePcTargetAdvanceContext>,
      request,
    ),
  );

describe("rejected requests and unprepared contexts touch nothing", () => {
  const hostile: unknown[] = [
    undefined,
    null,
    "advance_active_pc_to_target",
    {},
    PC_TARGET_REQUEST({ confirmed: true }),
    PC_TARGET_REQUEST({ continues: "tx-held" }),
    PC_TARGET_REQUEST({ from_transaction: "tx-other" }),
    PC_TARGET_REQUEST({ target: { unit: "u", value: 99 } }),
    PC_TARGET_REQUEST({ pc_id: "actor-other" }),
    PC_TARGET_REQUEST({ transaction_id: "tx-host" }),
    PC_TARGET_REQUEST({ role: "role.player", permission: "permission.player_choice.commit" }),
    { operation: "advance" },
    { operation: "advance_null_pc_ooc_to_target" },
    { operation: "getFact" },
  ];

  it("a malformed, over-claiming or other-operation request is the one refusal, with no campaign or store access", async () => {
    for (const bind of [initial, resumed])
      for (const request of hostile) {
        const r = recording(true);
        expect(await run(bind(r.campaign), request), JSON.stringify(request)).toBe(
          PC_TARGET_REFUSAL,
        );
        expect(r.touches, JSON.stringify(request)).toEqual([]);
      }
  });

  it("a fabricated, parsed, spread, prototype-copied or non-object context is not a context: refused, nothing touched", async () => {
    const r = recording(true);
    for (const real of [initial(r.campaign), resumed(r.campaign)]) {
      const forgeries: unknown[] = [
        {},
        Object.freeze({}),
        { ...real },
        JSON.parse(JSON.stringify(real)),
        Object.create(real),
        Object.assign(Object.create(null), real),
        undefined,
        null,
        "context",
        42,
      ];
      for (const [i, forged] of forgeries.entries())
        expect(await run(forged, PC_TARGET_REQUEST()), `forgery ${i}`).toBe(PC_TARGET_REFUSAL);
    }
    expect(r.touches).toEqual([]);
  });

  it("an incomplete, mis-authored or over-claiming initial binding is inert: refused without a read", async () => {
    const inert: Record<string, unknown>[] = [
      { pc_id: undefined },
      { pc_id: "" },
      { pc_id: 7 },
      { target: undefined },
      { target: null },
      { target: "2026-10-10" },
      { target: 10 },
      { target: { unit: "u" } },
      { target: { unit: "u", value: -1 } },
      { target: { unit: "u", value: 1.5 } },
      { target: { unit: "u", value: 10, calendar: "x" } },
      { transaction: undefined },
      { transaction: {} },
      { transaction: pcTargetTransaction("tx-new", { transaction_id: undefined }) },
      { transaction: pcTargetTransaction("tx-new", { cause: undefined }) },
      { transaction: pcTargetTransaction("tx-new", { trigger: { kind: "k" } }) },
      { transaction: pcTargetTransaction("tx-new", { context: undefined }) },
      {
        transaction: pcTargetTransaction("tx-new", {
          context: { role: "role.archivist", permission: "permission.canon.write" },
        }),
      },
      {
        transaction: pcTargetTransaction("tx-new", {
          context: { role: "role.player_character", permission: "permission.player_choice.commit" },
        }),
      },
      {
        transaction: pcTargetTransaction("tx-new", {
          context: { role: "role.player", permission: "permission.canon.write" },
        }),
      },
      { transaction: pcTargetTransaction("tx-new", { publication: { basis: "b" } }) },
      // fields the trusted side may not state: the continuation and request are the gateway's, never the transaction's
      { transaction: pcTargetTransaction("tx-new", { continues: "tx-held" }) },
      {
        transaction: pcTargetTransaction("tx-new", {
          requested: { target: TARGET, condition: null },
        }),
      },
      { transaction: pcTargetTransaction("tx-new", { confirmed: true }) },
      // the PC movement's own identities are not a progression instruction
      { transaction: pcTargetTransaction("pc-move:pc-1") },
      { transaction: pcTargetTransaction("tx-new", { cause: "pc-move:pc-1" }) },
      {
        transaction: pcTargetTransaction("tx-new", {
          trigger: { kind: "k", ref: "obj-logistics-pc-move:pc-1" },
        }),
      },
    ];
    for (const over of inert) {
      const r = recording(true);
      expect(await run(initial(r.campaign, over), PC_TARGET_REQUEST()), JSON.stringify(over)).toBe(
        PC_TARGET_REFUSAL,
      );
      expect(r.touches, JSON.stringify(over)).toEqual([]);
    }
  });

  it("an incomplete, mis-authored or over-claiming held binding is inert: refused without a read", async () => {
    const inert: Record<string, unknown>[] = [
      { held: undefined },
      { held: null },
      { held: "tx-held" },
      { held: {} },
      { held: { from_transaction: "tx-held" } },
      { held: { target: TARGET } },
      { held: { ...HELD, from_transaction: "" } },
      { held: { ...HELD, from_transaction: 7 } },
      { held: { ...HELD, from_transaction: undefined } },
      { held: { ...HELD, target: null } },
      { held: { ...HELD, target: "2026-10-10" } },
      { held: { ...HELD, target: { unit: "u" } } },
      { held: { ...HELD, target: { unit: "u", value: -1 } } },
      { held: { ...HELD, target: { unit: "u", value: 1.5 } } },
      { held: { ...HELD, target: { unit: "u", value: 10, calendar: "x" } } },
      { held: { ...HELD, continues: "tx-x" } },
      { held: { ...HELD, requested: { target: TARGET, condition: null } } },
      { pc_id: "" },
      { transaction: undefined },
      { transaction: pcTargetTransaction("tx-new", { continues: "tx-held" }) },
      {
        transaction: pcTargetTransaction("tx-new", {
          context: { role: "role.archivist", permission: "permission.canon.write" },
        }),
      },
      // the new choice is a separate choice: it cannot be the held transaction itself
      { transaction: pcTargetTransaction("tx-held") },
    ];
    for (const over of inert) {
      const r = recording(true);
      expect(await run(resumed(r.campaign, over), PC_TARGET_REQUEST()), JSON.stringify(over)).toBe(
        PC_TARGET_REFUSAL,
      );
      expect(r.touches, JSON.stringify(over)).toEqual([]);
    }
  });

  it("a hostile or throwing request object is refused, never propagated", async () => {
    const r = recording(true);
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
    expect(await run(initial(r.campaign), throwing)).toBe(PC_TARGET_REFUSAL);
    expect(r.touches).toEqual([]);
  });

  it("a context is opaque and frozen: it reveals nothing about the campaign, PC, target, lineage or transaction", () => {
    for (const ctx of [initial(recording().campaign), resumed(recording().campaign)]) {
      expect(Object.isFrozen(ctx)).toBe(true);
      expect(Object.keys(ctx)).toEqual([]);
      expect(JSON.stringify(ctx)).toBe("{}");
      expect(Object.getOwnPropertySymbols(ctx)).toHaveLength(0);
    }
  });
});

describe("the bound active PC is proven first, and a thrown campaign read never escapes", () => {
  it("a campaign without the bound PC (none, or another) makes the operation inert: only the head and the binding are read, nothing else, and nothing is committed", async () => {
    for (const bind of [initial, resumed]) {
      const none = recording(false);
      expect(await run(bind(none.campaign), PC_TARGET_REQUEST())).toBe(PC_TARGET_REFUSAL);
      expect(none.touches).toEqual(["store.head", "binding"]);
      const other = recording(true);
      expect(await run(bind(other.campaign, { pc_id: "pc-2" }), PC_TARGET_REQUEST())).toBe(
        PC_TARGET_REFUSAL,
      );
      expect(other.touches).toEqual(["store.head", "binding"]);
    }
  });

  it("the bound PC with no custody (so nothing positively recognised) is the one refusal, and no commit is attempted", async () => {
    const r = recording(true);
    expect(await run(initial(r.campaign), PC_TARGET_REQUEST())).toBe(PC_TARGET_REFUSAL);
    expect(r.touches).not.toContain("store.commit");
  });

  it("a thrown binding or store read is the one refusal when nothing was written", async () => {
    const throwingStore = {
      get store(): never {
        throw new Error("boom");
      },
      binding: () => undefined,
    };
    expect(await run(initial(throwingStore as never), PC_TARGET_REQUEST())).toBe(PC_TARGET_REFUSAL);
    const throwingBinding = {
      store: { head: () => ({ revision: 1 }) },
      binding: (): never => {
        throw new Error("boom");
      },
    };
    expect(await run(initial(throwingBinding as never), PC_TARGET_REQUEST())).toBe(
      PC_TARGET_REFUSAL,
    );
  });
});
