/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary values */
// Contract evidence for the Single-Leg Logistics Transfer & Destination Handoff Backbone Foundation (eighth slice):
// the strict Movement Service Request envelope, Movement-Service Commitment and Transfer Record, their derived
// identities and key spaces. Malformed objects are rejected; no field exists in which a route, path, carrier,
// capacity, rate, priority, cargo quantity or condition, loss, partial delivery, second leg, diversion, labor/agency
// claim or actor could be stored, and a dispatch has no field in which a delivery could be asserted.
// Register lineage: IA-02, IA-03; RC-02/04/07/10. Governing lock: spec/f027/spec-lock.json (F-027 v1.0).
import { describe, expect, it } from "vitest";
import {
  CommitMovementInputSchema,
  DispatchMovementInputSchema,
  LOGISTICS_OPERATION_ESTABLISH_DELIVERY,
  LOGISTICS_OPERATION_RETIRE_TRANSFER,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  MovementServiceRequestSchema,
  logisticsBoundaryId,
  logisticsCommitmentId,
  logisticsCommitmentKey,
  logisticsDeliveryId,
  logisticsDeliveryKey,
  logisticsDeliveryStage,
  logisticsObjectId,
  logisticsProcessId,
  logisticsRequestIdOfDelivery,
  logisticsRetirementStage,
  logisticsTransferId,
  logisticsTransferKey,
  parseStageKey,
} from "@immortalis/contracts";

const t = (value: number) => ({ unit: "u", value });
const ref = (world: string, locus: string) => ({
  world: { fact_key: `world/${world}/profile`, entity_id: world },
  locus: { fact_key: `world/${world}/locus/${locus}`, entity_id: locus },
});
const owner = {
  owner: "world_state",
  facet: "world_fallback_physical_entity",
  basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
};

const request = (over: Record<string, unknown> = {}) => ({
  request_id: "m-1",
  source: { owner: "mover", cause_ref: "need-1" },
  subject: { fact_key: "world/w/entity/e-1", entity_id: "e-1" },
  destination: ref("w", "l2"),
  priority_authority_ref: null,
  ...over,
});
const commitment = (over: Record<string, unknown> = {}) => ({
  commitment_id: logisticsCommitmentId("m-1"),
  request: { owner: "mover", fact_key: "mover/request/m-1", request_id: "m-1", version: 1 },
  moved: { fact_key: "world/w/entity/e-1", entity_id: "e-1", version: 1, substantive_owner: owner },
  origin: ref("w", "l1"),
  destination: ref("w", "l2"),
  service_basis: "NON_AGENTIVE_SINGLE_LEG_UNCONTENDED",
  committed_at: t(100),
  delivery: { boundary_id: logisticsBoundaryId("m-1"), at: t(200) },
  release_condition: "AFTER_DESTINATION_OWNER_COMMIT",
  state: { status: "COMMITTED" },
  ...over,
});
const inTransfer = {
  status: "IN_TRANSFER",
  movement_locus: {
    authority: "LOGISTICS_TRANSFER_RECORD",
    leg: "SINGLE_LEG",
    from: ref("w", "l1"),
    to: ref("w", "l2"),
  },
};
const retired = {
  status: "RETIRED",
  movement_locus: "CLOSED",
  delivery: { fact_key: logisticsDeliveryKey("w", "e-1"), version: 1 },
  destination_commit: { fact_key: "world/w/entity/e-1/transition", version: 1 },
  retired_at: t(200),
  by_stage: logisticsRetirementStage("m-1"),
};
const transfer = (over: Record<string, unknown> = {}) => ({
  transfer_id: logisticsTransferId("m-1"),
  commitment: {
    fact_key: logisticsCommitmentKey("w", "e-1"),
    commitment_id: logisticsCommitmentId("m-1"),
    version: 1,
  },
  request: { request_id: "m-1" },
  moved: { fact_key: "world/w/entity/e-1", entity_id: "e-1" },
  dispatched_at: t(120),
  state: inTransfer,
  ...over,
});

const keysOf = (v: unknown): string[] =>
  v && typeof v === "object"
    ? Object.entries(v as object).flatMap(([k, x]) => [k, ...keysOf(x)])
    : [];

describe("derived identities and key spaces (one request fixes one of each)", () => {
  it("are pure functions of the request / entity identity, entity-keyed, and distinct", () => {
    expect(logisticsCommitmentKey("w", "e-1")).toBe("logistics/commitment/w/e-1");
    expect(logisticsTransferKey("w", "e-1")).toBe("logistics/transfer/w/e-1");
    expect(logisticsDeliveryKey("w", "e-1")).toBe("logistics/delivery/w/e-1");
    expect(logisticsCommitmentId("m-1")).toBe("commitment:m-1");
    expect(logisticsTransferId("m-1")).toBe("transfer:m-1");
    expect(logisticsDeliveryId("m-1")).toBe("delivery:m-1");
    expect(logisticsProcessId("m-1")).toBe("logistics-transfer:m-1");
    expect(logisticsObjectId("m-1")).toBe("obj-logistics-m-1");
    expect(logisticsBoundaryId("m-1")).toBe("boundary-logistics-delivery-m-1");
    expect(
      new Set([
        logisticsCommitmentId("m-1"),
        logisticsTransferId("m-1"),
        logisticsDeliveryId("m-1"),
        logisticsObjectId("m-1"),
      ]).size,
    ).toBe(4);
    expect(logisticsObjectId("m-1")).not.toBe(logisticsObjectId("m-2"));
    expect(logisticsRequestIdOfDelivery("delivery:m-1")).toBe("m-1");
    for (const bad of ["m-1", "delivery:", "transition:m-1"])
      expect(logisticsRequestIdOfDelivery(bad)).toBeNull();
  });
  it("the two Logistics stage keys are valid RC-04 StageKeys with no horizon, version, retry or slice dimension", () => {
    for (const k of [logisticsDeliveryStage("m-1"), logisticsRetirementStage("m-1")]) {
      expect(parseStageKey(k).ok).toBe(true);
      expect(Object.keys(k).sort()).toEqual([
        "causal_process_id",
        "owner_operation",
        "prospective_result_id",
      ]);
      expect(k.owner_operation.owner).toBe("logistics");
    }
    expect(logisticsDeliveryStage("m-1").owner_operation.operation).toBe(
      LOGISTICS_OPERATION_ESTABLISH_DELIVERY,
    );
    expect(logisticsRetirementStage("m-1").owner_operation.operation).toBe(
      LOGISTICS_OPERATION_RETIRE_TRANSFER,
    );
    expect(logisticsDeliveryStage("m-1")).not.toEqual(logisticsRetirementStage("m-1"));
    expect(logisticsDeliveryStage("m-1")).toEqual(logisticsDeliveryStage("m-1"));
  });
});

describe("Movement Service Request (WS-010 §3.1): an interface envelope, not Logistics state", () => {
  it("accepts the envelope and nothing else: no priority authority, no quantity, no route, no carrier", () => {
    expect(MovementServiceRequestSchema.safeParse(request()).success).toBe(true);
    for (const over of [
      { priority_authority_ref: "authority-1" },
      { quantity: { amount: 1, unit: "d" } },
      { route: ["a", "b"] },
      { carrier: "ship-1" },
      { deadline: t(300) },
      { extra: 1 },
    ])
      expect(
        MovementServiceRequestSchema.safeParse(request(over)).success,
        JSON.stringify(over),
      ).toBe(false);
    expect(
      MovementServiceRequestSchema.safeParse({ ...request(), source: { owner: "mover" } }).success,
    ).toBe(false);
    expect(
      MovementServiceRequestSchema.safeParse({ ...request(), destination: undefined }).success,
    ).toBe(false);
  });
});

describe("Movement-Service Commitment (WS-010 §3.2, §4.1)", () => {
  it("accepts the one single-leg non-agentive commitment, before and after its release", () => {
    expect(LogisticsCommitmentSchema.safeParse(commitment()).success).toBe(true);
    expect(
      LogisticsCommitmentSchema.safeParse(
        commitment({
          state: {
            status: "RELEASED",
            released_at: t(200),
            destination_commit: { fact_key: "world/w/entity/e-1/transition", version: 1 },
            by_stage: logisticsRetirementStage("m-1"),
          },
        }),
      ).success,
    ).toBe(true);
  });
  it("has no field for a capacity, route, carrier, quantity, condition, cargo, priority, agent or actor", () => {
    for (const k of [
      "capacity",
      "route",
      "carrier",
      "quantity",
      "condition",
      "cargo",
      "priority",
      "agent",
      "actor",
      "rate",
      "path",
      "hub",
    ])
      expect(LogisticsCommitmentSchema.safeParse(commitment({ [k]: 1 })).success, k).toBe(false);
    expect(
      LogisticsCommitmentSchema.safeParse(
        commitment({ moved: { ...commitment().moved, quantity: { amount: 1, unit: "d" } } }),
      ).success,
    ).toBe(false);
    const names = keysOf(commitment()).join(" ");
    for (const word of [
      "quantity",
      "amount",
      "capacity",
      "route",
      "carrier",
      "priority",
      "cargo",
      "path",
    ])
      expect(names).not.toContain(word);
  });
  it.each<[string, Record<string, unknown>]>([
    [
      "a delivery boundary not after the commitment",
      { delivery: { boundary_id: "b", at: t(100) } },
    ],
    ["a delivery boundary before the commitment", { delivery: { boundary_id: "b", at: t(90) } }],
    [
      "a delivery boundary in another unit",
      { delivery: { boundary_id: "b", at: { unit: "other", value: 300 } } },
    ],
    ["a movement into another world", { destination: ref("w2", "l2") }],
    ["a movement that does not change the locus", { destination: ref("w", "l1") }],
    [
      "another service basis (agentive, contended, multi-leg)",
      { service_basis: "AGENTIVE_MULTI_LEG" },
    ],
    ["another release condition", { release_condition: "ON_DISPATCH" }],
    [
      "a substantive owner other than World-State's fallback",
      { moved: { ...commitment().moved, substantive_owner: { ...owner, owner: "logistics" } } },
    ],
    ["a pinned version 0", { request: { ...commitment().request, version: 0 } }],
    ["an unknown state", { state: { status: "CANCELLED" } }],
    [
      "a released state with no destination commit",
      {
        state: {
          status: "RELEASED",
          released_at: t(200),
          by_stage: logisticsRetirementStage("m-1"),
        },
      },
    ],
  ])("rejects %s", (_n, over) => {
    expect(LogisticsCommitmentSchema.safeParse(commitment(over)).success).toBe(false);
  });
});

describe("Transfer Record (WS-010 §3.4, §10.1, §11)", () => {
  it("accepts a transfer in transfer and a retired transfer", () => {
    expect(LogisticsTransferSchema.safeParse(transfer()).success).toBe(true);
    expect(LogisticsTransferSchema.safeParse(transfer({ state: retired })).success).toBe(true);
  });
  it("dispatch is not delivery: a transfer in transfer has no field for a delivery, a destination commit or an arrival", () => {
    const inT = transfer() as any;
    expect(Object.keys(inT.state).sort()).toEqual(["movement_locus", "status"]);
    for (const k of [
      "delivered",
      "arrived",
      "delivery",
      "destination_commit",
      "current_locus",
      "position",
      "eta",
      "leg",
    ])
      expect(
        LogisticsTransferSchema.safeParse(transfer({ state: { ...inTransfer, [k]: 1 } })).success,
        k,
      ).toBe(false);
    expect(
      LogisticsTransferSchema.safeParse(transfer({ delivered_scope: { quantity: 1 } })).success,
    ).toBe(false);
  });
  it("holds the entity only by reference: no identity, quantity, condition, class or custody is stored", () => {
    const names = keysOf(transfer({ state: inTransfer }))
      .concat(keysOf(transfer({ state: retired })))
      .join(" ");
    for (const word of [
      "quantity",
      "amount",
      "condition",
      "entity_class",
      "custody",
      "holder",
      "title",
      "carrier",
      "route",
      "capacity",
    ])
      expect(names).not.toContain(word);
  });
  it.each<[string, Record<string, unknown>]>([
    [
      "a movement locus that is not the Logistics Transfer Record",
      {
        state: {
          ...inTransfer,
          movement_locus: { ...inTransfer.movement_locus, authority: "WORLD_STATE" },
        },
      },
    ],
    [
      "a multi-leg movement locus",
      {
        state: {
          ...inTransfer,
          movement_locus: { ...inTransfer.movement_locus, leg: "SECOND_LEG" },
        },
      },
    ],
    [
      "a movement locus with a position",
      { state: { ...inTransfer, movement_locus: { ...inTransfer.movement_locus, position: 0.5 } } },
    ],
    [
      "a retired transfer that keeps the movement locus open",
      { state: { ...retired, movement_locus: "OPEN" } },
    ],
    [
      "a retired transfer with no destination commit",
      { state: { ...retired, destination_commit: undefined } },
    ],
    ["a retired transfer with no delivery", { state: { ...retired, delivery: undefined } }],
    [
      "a retired transfer reading a delivery that advanced",
      { state: { ...retired, delivery: { ...retired.delivery, version: 2 } } },
    ],
    ["a retired transfer with no retirement stage", { state: { ...retired, by_stage: undefined } }],
    ["an unknown state (delivered, diverted, lost, seized)", { state: { status: "DELIVERED" } }],
    ["a missing dispatch basis", { dispatched_at: undefined }],
  ])("rejects %s", (_n, over) => {
    expect(LogisticsTransferSchema.safeParse(transfer(over)).success).toBe(false);
  });
});

describe("the two authored inputs", () => {
  it("a commit names the request and the explicit delivery boundary; a dispatch names only the request", () => {
    expect(
      CommitMovementInputSchema.safeParse({ request_key: "k", delivery_at: t(200) }).success,
    ).toBe(true);
    expect(DispatchMovementInputSchema.safeParse({ request_key: "k" }).success).toBe(true);
    for (const bad of [
      { request_key: "k" },
      { request_key: "k", delivery_at: t(200), carrier: "c" },
      { request_key: "k", delivery_at: t(200), duration: 3 },
    ])
      expect(CommitMovementInputSchema.safeParse(bad).success).toBe(false);
    for (const bad of [
      {},
      { request_key: "k", at: t(1) },
      { request_key: "k", destination: ref("w", "l") },
    ])
      expect(DispatchMovementInputSchema.safeParse(bad).success).toBe(false);
  });
});
