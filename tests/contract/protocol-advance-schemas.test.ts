// IM-15 contracts for the one confirmed active-PC stop-at-delivery temporal advance operation: the host-visible request carries the
// operation name and nothing else, and the success receipt carries one status and nothing else. Register lineage: IA-18 / IA-19 /
// IA-20 / IA-28 (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  AdvanceConfirmedPcTransferRequestSchema,
  PC_TRANSFER_ADVANCE_COMMITTED,
  PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER,
  PcTransferAdvanceReceiptSchema,
} from "@immortalis/contracts";
import { ADVANCE_REQUEST } from "../support/protocol-advance.ts";

describe("the request carries the operation name and nothing else", () => {
  it("accepts only the strict one-field request", () => {
    const parsed = AdvanceConfirmedPcTransferRequestSchema.safeParse(ADVANCE_REQUEST());
    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.success ? parsed.data : {})).toEqual(["operation"]);
    expect(PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER).toBe(
      "advance_confirmed_pc_transfer_to_delivery",
    );
  });

  it("rejects every campaign, PC, route, destination, clock, target, boundary, condition, role, permission, confirmation, transaction, source or provenance field", () => {
    for (const extra of [
      { confirmed: true },
      { confirmation: "yes" },
      { campaign_id: "other" },
      { pc_id: "pc-1" },
      { route: ["a"] },
      { destination: { world_id: "w", locus_id: "l" } },
      { clock: { unit: "t", value: 1 } },
      { time: { unit: "t", value: 1 } },
      { target: { unit: "t", value: 1 } },
      { until: { unit: "t", value: 1 } },
      { duration: 5 },
      { boundary_id: "b" },
      { object_id: "o" },
      { condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "o", boundary_id: "b" } },
      { requested: { target: null, condition: null } },
      { continues: "tx-1" },
      { transaction_id: "tx-1" },
      { cause: "c" },
      { trigger: { kind: "k", ref: "r" } },
      { role: "role.player", permission: "permission.player_choice.commit" },
      { context: { role: "role.player", permission: "permission.player_choice.commit" } },
      { publication: { basis: "b", secrecy: "s" } },
      { owner: "logistics" },
      { group_id: "g", intent_id: "i" },
      { source: "x", rule: "y", provenance: "z" },
    ])
      expect(
        AdvanceConfirmedPcTransferRequestSchema.safeParse(ADVANCE_REQUEST(extra)).success,
        JSON.stringify(extra),
      ).toBe(false);
  });

  it("rejects other operation names (including internal and sibling ones) and non-objects", () => {
    for (const bad of [
      undefined,
      null,
      "advance_confirmed_pc_transfer_to_delivery",
      42,
      [],
      {},
      { operation: "getFact" },
      { operation: "advance" },
      { operation: "continueRemainder" },
      { operation: "registerObject" },
      { operation: "commit_confirmed_pc_relocation" },
      { operation: "read_current_event_signal_presentation", event_id: "e" },
      { operation: "advance_confirmed_pc_transfer_to_delivery " },
    ])
      expect(AdvanceConfirmedPcTransferRequestSchema.safeParse(bad).success).toBe(false);
  });
});

describe("the success receipt is one status and nothing else", () => {
  it("accepts only the committed status", () => {
    expect(
      PcTransferAdvanceReceiptSchema.safeParse({ status: PC_TRANSFER_ADVANCE_COMMITTED }).success,
    ).toBe(true);
    for (const bad of [
      {},
      { status: "ARRIVED" },
      { status: "DELIVERED" },
      { status: PC_TRANSFER_ADVANCE_COMMITTED, locus: "x" },
      { status: PC_TRANSFER_ADVANCE_COMMITTED, stop_reason: "CONDITION_SATISFIED" },
      { status: PC_TRANSFER_ADVANCE_COMMITTED, canonical_time: { unit: "t", value: 1 } },
      { status: PC_TRANSFER_ADVANCE_COMMITTED, replayed: true },
    ])
      expect(PcTransferAdvanceReceiptSchema.safeParse(bad).success).toBe(false);
  });
});
