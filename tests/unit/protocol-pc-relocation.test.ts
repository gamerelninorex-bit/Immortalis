// The confirmed relocation operation, exercised over a RECORDING campaign (no real owner): the host names nothing, the trusted
// context supplies the one exact choice and the delivery boundary, nothing a host sends can widen what is touched, and the four
// owner paths are invoked once each, in their ratified order, under identities derived from the canonical PC identity alone.
// Register lineage: IA-18 / IA-19 / IA-20 / IA-28 (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHOICE_AUTHORITY,
  type CanonicalTime,
  type CommitGroup,
  type PcMovementCommitInput,
} from "@immortalis/contracts";
import {
  bindTrustedConfirmedPcRelocationContext,
  commitConfirmedPcRelocation,
} from "@immortalis/protocol";
import { RELOCATION_REFUSAL, RELOCATION_REQUEST } from "../support/protocol.ts";

const CHOICE: PcMovementCommitInput = {
  pc_id: "pc-1",
  destination: { world_id: "world-1", locus_id: "locus-2" },
  authored_under: { ...PLAYER_CHOICE_AUTHORITY },
};
const DELIVERY: CanonicalTime = { unit: "t", value: 200 };
const MATERIAL = { cause: "cause-1", basis: "basis-1", secrecy: "secrecy-1" };

type Call = { what: string; input: unknown };
/** A campaign that records every call and every store touch, and answers each owner path with a configurable result. */
const recording = (answer: (what: string) => unknown = () => ({ ok: true, value: {} })) => {
  const calls: Call[] = [];
  const touches: string[] = [];
  const store = new Proxy(
    {},
    {
      get(_t, prop) {
        touches.push(String(prop));
        if (prop === "commit")
          return async (g: CommitGroup) => {
            calls.push({ what: "store.commit", input: g });
            return answer("store.commit");
          };
        return () => undefined;
      },
    },
  );
  const campaign = {
    store,
    commitPcVoluntaryMovement: async (input: unknown) => {
      calls.push({ what: "commitPcVoluntaryMovement", input });
      return answer("commitPcVoluntaryMovement");
    },
    establishPcMovementRequest: async (input: unknown) => {
      calls.push({ what: "establishPcMovementRequest", input });
      return answer("establishPcMovementRequest");
    },
  };
  return { campaign: campaign as never, calls, touches };
};
const bind = (campaign: never, over: Record<string, unknown> = {}) =>
  bindTrustedConfirmedPcRelocationContext({
    campaign,
    choice: CHOICE,
    delivery_at: DELIVERY,
    publication: MATERIAL,
    ...over,
  } as never);
const run = async (ctx: unknown, request: unknown) =>
  JSON.stringify(
    await commitConfirmedPcRelocation(
      ctx as ReturnType<typeof bindTrustedConfirmedPcRelocationContext>,
      request,
    ),
  );

describe("rejected requests and unprepared contexts touch nothing", () => {
  const hostile: unknown[] = [
    undefined,
    null,
    "commit_confirmed_pc_relocation",
    {},
    RELOCATION_REQUEST({ confirmed: true }),
    RELOCATION_REQUEST({ pc_id: "pc-other" }),
    RELOCATION_REQUEST({ destination: { world_id: "w", locus_id: "l" } }),
    RELOCATION_REQUEST({ delivery_at: { unit: "t", value: 0 } }),
    RELOCATION_REQUEST({ role: "role.player", permission: "permission.player_choice.commit" }),
    { operation: "commitPcVoluntaryMovement" },
    { operation: "dispatch" },
    { operation: "getFact" },
  ];

  it("a malformed, over-claiming or other-operation request is the one refusal, with no owner path invoked and no store access", async () => {
    for (const request of hostile) {
      const r = recording();
      expect(await run(bind(r.campaign), request), JSON.stringify(request)).toBe(
        RELOCATION_REFUSAL,
      );
      expect(r.calls, JSON.stringify(request)).toEqual([]);
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
      expect(await run(forged, RELOCATION_REQUEST()), `forgery ${i}`).toBe(RELOCATION_REFUSAL);
    expect(r.calls).toEqual([]);
    expect(r.touches).toEqual([]);
  });

  it("a binding that is not complete and schema-valid is inert: no choice authority, no boundary, no publication material, no confirmation by flag", async () => {
    const bad: Record<string, unknown>[] = [
      { choice: { ...CHOICE, authored_under: undefined } },
      {
        choice: {
          ...CHOICE,
          authored_under: { role: "role.archivist", permission: "permission.canon.write" },
        },
      },
      {
        choice: {
          ...CHOICE,
          authored_under: { role: "role.player", permission: "permission.canon.write" },
        },
      },
      {
        choice: {
          ...CHOICE,
          authored_under: { role: "role.persona", permission: "permission.player_choice.commit" },
        },
      },
      { choice: { ...CHOICE, confirmed: true } },
      { choice: { ...CHOICE, pc_id: "" } },
      { choice: { ...CHOICE, destination: { world_id: "w" } } },
      { choice: { ...CHOICE, destination: { ...CHOICE.destination, route: [] } } },
      { choice: undefined },
      { delivery_at: undefined },
      { delivery_at: null },
      { delivery_at: { unit: "t" } },
      { delivery_at: { unit: "t", value: -1 } },
      { delivery_at: { unit: "t", value: 1.5 } },
      { delivery_at: 200 },
      { publication: undefined },
      { publication: { cause: "c", basis: "b" } },
      { publication: { ...MATERIAL, cause: "" } },
      { confirmed: true, choice: undefined },
    ];
    for (const over of bad) {
      const r = recording();
      expect(await run(bind(r.campaign, over), RELOCATION_REQUEST()), JSON.stringify(over)).toBe(
        RELOCATION_REFUSAL,
      );
      expect(r.calls, JSON.stringify(over)).toEqual([]);
      expect(r.touches, JSON.stringify(over)).toEqual([]);
    }
  });
});

describe("the lawful context drives the existing owner paths in their ratified order, from the trusted binding only", () => {
  it("the PC-side commitment, then the PC-owned request, with identities derived from the PC identity and the trusted material verbatim", async () => {
    const r = recording();
    // Logistics (the real adapter) finds no committed request in this recording store, so the chain stops there: one refusal
    expect(await run(bind(r.campaign), RELOCATION_REQUEST())).toBe(RELOCATION_REFUSAL);
    expect(r.calls).toEqual([
      {
        what: "commitPcVoluntaryMovement",
        input: {
          group_id: "pc-relocation-group:commitment:pc-1",
          intent_id: "pc-relocation-intent:commitment:pc-1",
          ...MATERIAL,
          ...CHOICE,
        },
      },
      {
        what: "establishPcMovementRequest",
        input: {
          group_id: "pc-relocation-group:request:pc-1",
          intent_id: "pc-relocation-intent:request:pc-1",
          ...MATERIAL,
          pc_id: "pc-1",
        },
      },
    ]);
    // the only store access of the recording campaign is Logistics' read-by-identity of the request it was handed
    expect(r.touches.filter((t) => t !== "getFact")).toEqual([]);
  });

  it("the choice handed to the PC owner is the bound one: a later mutation of the caller's object changes nothing", async () => {
    const r = recording();
    const choice = { ...CHOICE, destination: { ...CHOICE.destination } };
    const ctx = bind(r.campaign, { choice });
    choice.destination.locus_id = "locus-other";
    choice.pc_id = "pc-other";
    await run(ctx, RELOCATION_REQUEST());
    expect((r.calls[0]!.input as { pc_id: string }).pc_id).toBe("pc-1");
    expect((r.calls[0]!.input as { destination: unknown }).destination).toEqual(CHOICE.destination);
  });

  it("an owner refusal stops the chain at once: later steps are never attempted, and the refusal is the one refusal", async () => {
    const r = recording(() => ({
      ok: false,
      error: { code: "VERSION_CONFLICT", message: "a hidden owner detail" },
    }));
    const out = await run(bind(r.campaign), RELOCATION_REQUEST());
    expect(out).toBe(RELOCATION_REFUSAL);
    expect(out).not.toContain("hidden");
    expect(r.calls.map((c) => c.what)).toEqual(["commitPcVoluntaryMovement"]);
  });

  it("an unknown infrastructure outcome is neither success nor refusal, and stops the chain: the same request reconciles it", async () => {
    const r = recording(() => ({
      ok: false,
      error: { code: "UNKNOWN_OUTCOME", message: "x" },
    }));
    expect(JSON.parse(await run(bind(r.campaign), RELOCATION_REQUEST()))).toEqual({
      ok: false,
      error: {
        code: "RELOCATION_OUTCOME_UNKNOWN",
        message: "the outcome is not known: present the same request again",
      },
    });
    expect(r.calls.map((c) => c.what)).toEqual(["commitPcVoluntaryMovement"]);
  });

  it("an exception is never propagated: refusal when nothing was attempted, unknown once a commit was issued", async () => {
    const before = {
      get store(): never {
        throw new Error("boom");
      },
      commitPcVoluntaryMovement: async () => ({ ok: true }),
      establishPcMovementRequest: async () => ({ ok: true }),
    };
    expect(await run(bind(before as never), RELOCATION_REQUEST())).toBe(RELOCATION_REFUSAL);
    const during = {
      store: {},
      commitPcVoluntaryMovement: async () => {
        throw new Error("boom");
      },
      establishPcMovementRequest: async () => ({ ok: true }),
    };
    expect(JSON.parse(await run(bind(during as never), RELOCATION_REQUEST())).error.code).toBe(
      "RELOCATION_OUTCOME_UNKNOWN",
    );
  });

  it("the context is an opaque, frozen handle that reveals nothing about the campaign, choice or boundary", () => {
    const ctx = bind(recording().campaign) as object;
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(Reflect.ownKeys(ctx)).toEqual([]);
    expect(JSON.stringify(ctx)).toBe("{}");
    expect(commitConfirmedPcRelocation.length).toBe(2);
  });
});
