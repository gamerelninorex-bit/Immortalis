// The NULL-PC OOC held-continuation operation, exercised over a RECORDING campaign (no real owner): the host names nothing, an
// inert or forged context touches nothing, an active PC makes the operation inert before any other read, and nothing a host sends
// can widen what is touched or read.
// Register lineage: IA-18 / IA-19 / IA-20 / IA-28 (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  bindTrustedNullPcOocHeldContinuationContext,
  resumeNullPcOocHeldAdvance,
} from "@immortalis/protocol";
import { nullPcTransaction } from "../support/null-pc-advance.ts";
import { HELD_REFUSAL, HELD_REQUEST } from "../support/null-pc-held-advance.ts";

const TARGET = { unit: "u", value: 10 };
const HELD = { from_transaction: "tx-held", target: TARGET };

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
  bindTrustedNullPcOocHeldContinuationContext({
    campaign,
    held: HELD,
    transaction: nullPcTransaction("tx-new"),
    ...over,
  } as never);
const run = async (ctx: unknown, request: unknown) =>
  JSON.stringify(
    await resumeNullPcOocHeldAdvance(
      ctx as ReturnType<typeof bindTrustedNullPcOocHeldContinuationContext>,
      request,
    ),
  );

describe("rejected requests and unprepared contexts touch nothing", () => {
  const hostile: unknown[] = [
    undefined,
    null,
    "resume_null_pc_ooc_held_advance",
    {},
    HELD_REQUEST({ confirmed: true }),
    HELD_REQUEST({ continues: "tx-held" }),
    HELD_REQUEST({ from_transaction: "tx-other" }),
    HELD_REQUEST({ target: { unit: "u", value: 99 } }),
    HELD_REQUEST({ transaction_id: "tx-host" }),
    HELD_REQUEST({ role: "role.player", permission: "permission.player_choice.commit" }),
    { operation: "resume" },
    { operation: "advance_null_pc_ooc_to_target" },
    { operation: "getFact" },
  ];

  it("a malformed, over-claiming or other-operation request is the one refusal, with no campaign or store access", async () => {
    for (const request of hostile) {
      const r = recording();
      expect(await run(bind(r.campaign), request), JSON.stringify(request)).toBe(HELD_REFUSAL);
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
      expect(await run(forged, HELD_REQUEST()), `forgery ${i}`).toBe(HELD_REFUSAL);
    expect(r.touches).toEqual([]);
  });

  it("an incomplete, mis-authored or over-claiming binding is inert: refused without a read", async () => {
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
      { transaction: undefined },
      { transaction: {} },
      { transaction: nullPcTransaction("tx-new", { transaction_id: undefined }) },
      { transaction: nullPcTransaction("tx-new", { cause: undefined }) },
      { transaction: nullPcTransaction("tx-new", { trigger: { kind: "k" } }) },
      { transaction: nullPcTransaction("tx-new", { context: undefined }) },
      {
        transaction: nullPcTransaction("tx-new", {
          context: { role: "role.archivist", permission: "permission.canon.write" },
        }),
      },
      {
        transaction: nullPcTransaction("tx-new", {
          context: { role: "role.player_character", permission: "permission.player_choice.commit" },
        }),
      },
      {
        transaction: nullPcTransaction("tx-new", {
          context: { role: "role.player", permission: "permission.canon.write" },
        }),
      },
      { transaction: nullPcTransaction("tx-new", { publication: { basis: "b" } }) },
      // fields the trusted side may not state here: the continuation and request are the held lineage's, never the transaction's
      { transaction: nullPcTransaction("tx-new", { continues: "tx-held" }) },
      {
        transaction: nullPcTransaction("tx-new", {
          requested: { target: TARGET, condition: null },
        }),
      },
      { transaction: nullPcTransaction("tx-new", { confirmed: true }) },
      // the new choice is a separate choice: it cannot be the held transaction itself
      { transaction: nullPcTransaction("tx-held") },
    ];
    for (const over of inert) {
      const r = recording();
      expect(await run(bind(r.campaign, over), HELD_REQUEST()), JSON.stringify(over)).toBe(
        HELD_REFUSAL,
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
    expect(await run(ctx, throwing)).toBe(HELD_REFUSAL);
    expect(r.touches).toEqual([]);
  });

  it("a context is opaque and frozen: it reveals nothing about the campaign, held lineage or transaction", () => {
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
    expect(await run(bind(r.campaign), HELD_REQUEST())).toBe(HELD_REFUSAL);
    expect(r.touches).toEqual(["store.head", "binding"]);
  });

  it("a campaign that holds no temporal state is the one refusal", async () => {
    const r = recording();
    expect(await run(bind(r.campaign), HELD_REQUEST())).toBe(HELD_REFUSAL);
  });

  it("a thrown binding or store read is the one refusal when nothing was written", async () => {
    const throwingStore = {
      get store(): never {
        throw new Error("boom");
      },
      binding: () => undefined,
    };
    expect(await run(bind(throwingStore as never), HELD_REQUEST())).toBe(HELD_REFUSAL);
    const throwingBinding = {
      store: { head: () => ({ revision: 1 }) },
      binding: (): never => {
        throw new Error("boom");
      },
    };
    expect(await run(bind(throwingBinding as never), HELD_REQUEST())).toBe(HELD_REFUSAL);
  });
});
