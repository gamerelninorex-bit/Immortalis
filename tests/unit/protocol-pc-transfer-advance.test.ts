// The confirmed stop-at-delivery advance operation, exercised over a RECORDING campaign (no real owner): the host names nothing, an
// inert or forged context touches nothing, and nothing a host sends can widen what is touched or read.
// Register lineage: IA-18 / IA-19 / IA-20 / IA-28 (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  advanceConfirmedPcTransferToDelivery,
  bindTrustedConfirmedPcTransferAdvanceContext,
} from "@immortalis/protocol";
import {
  ADVANCE_REFUSAL,
  ADVANCE_REQUEST,
  advanceTransaction,
} from "../support/protocol-advance.ts";

/** A campaign that records every access to it and to its store. */
const recording = () => {
  const touches: string[] = [];
  const touching = (name: string) => () => {
    touches.push(name);
    return undefined;
  };
  const store = new Proxy(
    {},
    {
      get(_t, prop) {
        touches.push(`store.${String(prop)}`);
        return () => undefined;
      },
    },
  );
  const campaign = {
    store,
    binding: touching("binding"),
    pcCurrentLocus: touching("pcCurrentLocus"),
    pcPhysicalLocusCustody: touching("pcPhysicalLocusCustody"),
  };
  return { campaign: campaign as never, touches };
};
const bind = (campaign: never, over: Record<string, unknown> = {}) =>
  bindTrustedConfirmedPcTransferAdvanceContext({
    campaign,
    pc_id: "pc-1",
    transaction: advanceTransaction("tx-1"),
    ...over,
  } as never);
const run = async (ctx: unknown, request: unknown) =>
  JSON.stringify(
    await advanceConfirmedPcTransferToDelivery(
      ctx as ReturnType<typeof bindTrustedConfirmedPcTransferAdvanceContext>,
      request,
    ),
  );

describe("rejected requests and unprepared contexts touch nothing", () => {
  const hostile: unknown[] = [
    undefined,
    null,
    "advance_confirmed_pc_transfer_to_delivery",
    {},
    ADVANCE_REQUEST({ confirmed: true }),
    ADVANCE_REQUEST({ pc_id: "pc-other" }),
    ADVANCE_REQUEST({ target: { unit: "t", value: 0 } }),
    ADVANCE_REQUEST({ transaction_id: "tx-host" }),
    ADVANCE_REQUEST({ role: "role.player", permission: "permission.player_choice.commit" }),
    { operation: "advance" },
    { operation: "commit_confirmed_pc_relocation" },
    { operation: "getFact" },
  ];

  it("a malformed, over-claiming or other-operation request is the one refusal, with no campaign or store access", async () => {
    for (const request of hostile) {
      const r = recording();
      expect(await run(bind(r.campaign), request), JSON.stringify(request)).toBe(ADVANCE_REFUSAL);
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
      expect(await run(forged, ADVANCE_REQUEST()), `forgery ${i}`).toBe(ADVANCE_REFUSAL);
    expect(r.touches).toEqual([]);
  });

  it("an incomplete, mis-authored or over-claiming binding is inert: refused without a read", async () => {
    const inert: Record<string, unknown>[] = [
      { pc_id: undefined },
      { pc_id: "" },
      { pc_id: "not an entity id" },
      { pc_id: { id: "pc-1" } },
      { transaction: undefined },
      { transaction: {} },
      { transaction: advanceTransaction("tx-1", { transaction_id: undefined }) },
      { transaction: advanceTransaction("tx-1", { cause: undefined }) },
      { transaction: advanceTransaction("tx-1", { trigger: undefined }) },
      { transaction: advanceTransaction("tx-1", { trigger: { kind: "k" } }) },
      { transaction: advanceTransaction("tx-1", { context: undefined }) },
      { transaction: advanceTransaction("tx-1", { context: { role: "role.player" } }) },
      {
        transaction: advanceTransaction("tx-1", {
          context: { role: "role.archivist", permission: "permission.canon.write" },
        }),
      },
      {
        transaction: advanceTransaction("tx-1", {
          context: { role: "role.player", permission: "permission.canon.write" },
        }),
      },
      { transaction: advanceTransaction("tx-1", { publication: undefined }) },
      { transaction: advanceTransaction("tx-1", { publication: { basis: "b" } }) },
      // a field the trusted side may not state: the kernel input has no target and no continuation here
      { transaction: advanceTransaction("tx-1", { requested: { target: null, condition: null } }) },
      { transaction: advanceTransaction("tx-1", { continues: "tx-0" }) },
      { transaction: advanceTransaction("tx-1", { confirmed: true }) },
      // the movement's own identities
      { transaction: advanceTransaction("pc-move:pc-1") },
      { transaction: advanceTransaction("obj-logistics-pc-move:pc-1") },
      { transaction: advanceTransaction("pc-relocation-intent:dispatch:pc-1") },
      { transaction: advanceTransaction("tx-1", { cause: "pc-move:pc-1" }) },
      { transaction: advanceTransaction("tx-1", { trigger: { kind: "k", ref: "pc-move:pc-1" } }) },
    ];
    for (const over of inert) {
      const r = recording();
      expect(await run(bind(r.campaign, over), ADVANCE_REQUEST()), JSON.stringify(over)).toBe(
        ADVANCE_REFUSAL,
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
    expect(await run(ctx, throwing)).toBe(ADVANCE_REFUSAL);
    expect(r.touches).toEqual([]);
  });

  it("a context is opaque and frozen: it reveals nothing about the campaign, PC or transaction", () => {
    const ctx = bind(recording().campaign);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Object.keys(ctx)).toEqual([]);
    expect(JSON.stringify(ctx)).toBe("{}");
    expect(Object.getOwnPropertySymbols(ctx)).toHaveLength(0);
  });

  it("a campaign that holds no committed movement is the one refusal, and a thrown campaign read never escapes", async () => {
    const r = recording();
    expect(await run(bind(r.campaign), ADVANCE_REQUEST())).toBe(ADVANCE_REFUSAL);
    const throwing = {
      get store(): never {
        throw new Error("boom");
      },
      binding: () => undefined,
      pcCurrentLocus: () => undefined,
      pcPhysicalLocusCustody: () => undefined,
    };
    expect(await run(bind(throwing as never), ADVANCE_REQUEST())).toBe(ADVANCE_REFUSAL);
  });
});
