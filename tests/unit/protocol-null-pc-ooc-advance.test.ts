// The NULL-PC OOC target-only advance operation, exercised over a RECORDING campaign (no real owner): the host names nothing, an
// inert or forged context touches nothing, an active PC makes the operation inert before any other read, and nothing a host sends
// can widen what is touched or read.
// Register lineage: IA-18 / IA-19 / IA-20 / IA-28 (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  advanceNullPcOocToTarget,
  bindTrustedNullPcOocTargetAdvanceContext,
} from "@immortalis/protocol";
import { NULL_PC_REFUSAL, NULL_PC_REQUEST, nullPcTransaction } from "../support/null-pc-advance.ts";

const TARGET = { unit: "u", value: 10 };

/** A campaign that records every access to it and to its store; `active` makes the binding read return a PC. */
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
  const campaign = {
    store,
    binding: () => {
      touches.push("binding");
      return active ? { value: { active_pc: { entity_id: "pc-1" } } } : undefined;
    },
  };
  return { campaign: campaign as never, touches };
};
const bind = (campaign: never, over: Record<string, unknown> = {}) =>
  bindTrustedNullPcOocTargetAdvanceContext({
    campaign,
    target: TARGET,
    transaction: nullPcTransaction("tx-1"),
    ...over,
  } as never);
const run = async (ctx: unknown, request: unknown) =>
  JSON.stringify(
    await advanceNullPcOocToTarget(
      ctx as ReturnType<typeof bindTrustedNullPcOocTargetAdvanceContext>,
      request,
    ),
  );

describe("rejected requests and unprepared contexts touch nothing", () => {
  const hostile: unknown[] = [
    undefined,
    null,
    "advance_null_pc_ooc_to_target",
    {},
    NULL_PC_REQUEST({ confirmed: true }),
    NULL_PC_REQUEST({ pc_id: "pc-other" }),
    NULL_PC_REQUEST({ target: { unit: "u", value: 99 } }),
    NULL_PC_REQUEST({ duration: 5 }),
    NULL_PC_REQUEST({ transaction_id: "tx-host" }),
    NULL_PC_REQUEST({ role: "role.player", permission: "permission.player_choice.commit" }),
    { operation: "advance" },
    { operation: "advance_confirmed_pc_transfer_to_delivery" },
    { operation: "getFact" },
  ];

  it("a malformed, over-claiming or other-operation request is the one refusal, with no campaign or store access", async () => {
    for (const request of hostile) {
      const r = recording();
      expect(await run(bind(r.campaign), request), JSON.stringify(request)).toBe(NULL_PC_REFUSAL);
      expect(r.touches, JSON.stringify(request)).toEqual([]);
    }
  });

  it("a fabricated, parsed, spread, prototype-copied or non-object context is not a context: refused, nothing touched", async () => {
    const r = recording();
    const real = bind(r.campaign);
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
      expect(await run(forged, NULL_PC_REQUEST()), `forgery ${i}`).toBe(NULL_PC_REFUSAL);
    expect(r.touches).toEqual([]);
  });

  it("an incomplete, mis-authored or over-claiming binding is inert: refused without a read", async () => {
    const inert: Record<string, unknown>[] = [
      { target: undefined },
      { target: null },
      { target: {} },
      { target: "2026-10-08" },
      { target: 10 },
      { target: { unit: "u" } },
      { target: { value: 10 } },
      { target: { unit: "", value: 10 } },
      { target: { unit: "u", value: -1 } },
      { target: { unit: "u", value: 1.5 } },
      { target: { unit: "u", value: "10" } },
      { target: { unit: "u", value: Number.MAX_SAFE_INTEGER + 1 } },
      { target: { unit: "u", value: 10, calendar: "x" } },
      { transaction: undefined },
      { transaction: {} },
      { transaction: nullPcTransaction("tx-1", { transaction_id: undefined }) },
      { transaction: nullPcTransaction("tx-1", { cause: undefined }) },
      { transaction: nullPcTransaction("tx-1", { trigger: undefined }) },
      { transaction: nullPcTransaction("tx-1", { trigger: { kind: "k" } }) },
      { transaction: nullPcTransaction("tx-1", { context: undefined }) },
      { transaction: nullPcTransaction("tx-1", { context: { role: "role.player" } }) },
      {
        transaction: nullPcTransaction("tx-1", {
          context: { role: "role.archivist", permission: "permission.canon.write" },
        }),
      },
      {
        transaction: nullPcTransaction("tx-1", {
          context: { role: "role.player_character", permission: "permission.player_choice.commit" },
        }),
      },
      {
        transaction: nullPcTransaction("tx-1", {
          context: { role: "role.player", permission: "permission.canon.write" },
        }),
      },
      { transaction: nullPcTransaction("tx-1", { publication: undefined }) },
      { transaction: nullPcTransaction("tx-1", { publication: { basis: "b" } }) },
      // a field the trusted side may not state here: the kernel input's target and continuation are not the transaction's
      {
        transaction: nullPcTransaction("tx-1", { requested: { target: TARGET, condition: null } }),
      },
      { transaction: nullPcTransaction("tx-1", { continues: "tx-0" }) },
      { transaction: nullPcTransaction("tx-1", { confirmed: true }) },
    ];
    for (const over of inert) {
      const r = recording();
      expect(await run(bind(r.campaign, over), NULL_PC_REQUEST()), JSON.stringify(over)).toBe(
        NULL_PC_REFUSAL,
      );
      expect(r.touches, JSON.stringify(over)).toEqual([]);
    }
  });

  it("a hostile or throwing request object is refused, never propagated", async () => {
    const r = recording();
    const ctx = bind(r.campaign);
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
    expect(await run(ctx, throwing)).toBe(NULL_PC_REFUSAL);
    expect(r.touches).toEqual([]);
  });

  it("a context is opaque and frozen: it reveals nothing about the campaign, target or transaction", () => {
    const ctx = bind(recording().campaign);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.keys(ctx)).toEqual([]);
    expect(JSON.stringify(ctx)).toBe("{}");
    expect(Object.getOwnPropertySymbols(ctx)).toHaveLength(0);
  });
});

describe("the NULL state is proven first, and a thrown campaign read never escapes", () => {
  it("an active PC makes the operation inert: only the head and the binding are read, nothing else, and nothing is committed", async () => {
    const r = recording(true);
    expect(await run(bind(r.campaign), NULL_PC_REQUEST())).toBe(NULL_PC_REFUSAL);
    expect(r.touches).toEqual(["store.head", "binding"]);
  });

  it("a campaign that holds no temporal basis is the one refusal", async () => {
    const r = recording();
    expect(await run(bind(r.campaign), NULL_PC_REQUEST())).toBe(NULL_PC_REFUSAL);
  });

  it("a thrown binding or store read is the one refusal when nothing was written", async () => {
    const throwingStore = {
      get store(): never {
        throw new Error("boom");
      },
      binding: () => undefined,
    };
    expect(await run(bind(throwingStore as never), NULL_PC_REQUEST())).toBe(NULL_PC_REFUSAL);
    const throwingBinding = {
      store: { head: () => ({ revision: 1 }) },
      binding: (): never => {
        throw new Error("boom");
      },
    };
    expect(await run(bind(throwingBinding as never), NULL_PC_REQUEST())).toBe(NULL_PC_REFUSAL);
  });
});
