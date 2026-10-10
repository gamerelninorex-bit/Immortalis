// IM-15 contracts for the one active-PC target-only temporal advance operation: the host-visible request carries the operation name
// and nothing else, and the success receipt carries one status and nothing else. Register lineage: IA-18 / IA-19 / IA-20 / IA-28
// (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  AdvanceActivePcToTargetRequestSchema,
  PC_TARGET_ADVANCE_COMMITTED,
  PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET,
  PcTargetAdvanceReceiptSchema,
} from "@immortalis/contracts";
import { PC_TARGET_REQUEST } from "../support/pc-target-advance.ts";

describe("the request carries the operation name and nothing else", () => {
  it("accepts only the strict one-field request", () => {
    const parsed = AdvanceActivePcToTargetRequestSchema.safeParse(PC_TARGET_REQUEST());
    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.success ? parsed.data : {})).toEqual(["operation"]);
    expect(PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET).toBe("advance_active_pc_to_target");
  });

  it("rejects every campaign, PC, target, duration, condition, continuation, held-transaction, authority, session, identity, owner-result or provenance field", () => {
    for (const extra of [
      { confirmed: true },
      { confirmation: "yes" },
      { campaign_id: "other" },
      { pc_id: "pc-1" },
      { active_pc: null },
      { target: { unit: "t", value: 1 } },
      { until: { unit: "t", value: 1 } },
      { date: "2026-10-10" },
      { duration: 5 },
      { wait: "until the Instrument lapses" },
      { text: "wait a while" },
      { condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "o", boundary_id: "b" } },
      { requested: { target: { unit: "t", value: 1 }, condition: null } },
      { continues: "tx-1" },
      { from_transaction: "tx-1" },
      { held: { from_transaction: "tx-1" } },
      { toward: { unit: "t", value: 1 } },
      { transaction_id: "tx-2" },
      { cause: "c" },
      { trigger: { kind: "k", ref: "r" } },
      { role: "role.player", permission: "permission.player_choice.commit" },
      { context: { role: "role.player", permission: "permission.player_choice.commit" } },
      { session: "s" },
      { authority: "x" },
      { provider: "gip" },
      { publication: { basis: "b", secrecy: "s" } },
      { lifecycle_status: "expired" },
      { expired: true },
      { due: true },
      { outcome: "TARGET_REACHED" },
      { owner: "gip" },
      { source: "x", rule: "y", provenance: "z" },
    ])
      expect(
        AdvanceActivePcToTargetRequestSchema.safeParse(PC_TARGET_REQUEST(extra)).success,
        JSON.stringify(extra),
      ).toBe(false);
  });

  it("rejects other operation names (including the NULL-PC and stop-at-delivery gateways') and non-objects", () => {
    for (const bad of [
      undefined,
      null,
      "advance_active_pc_to_target",
      42,
      [],
      {},
      { operation: "getFact" },
      { operation: "advance" },
      { operation: "wait" },
      { operation: "continueRemainder" },
      { operation: "advance_null_pc_ooc_to_target" },
      { operation: "resume_null_pc_ooc_held_advance" },
      { operation: "advance_confirmed_pc_transfer_to_delivery" },
      { operation: "commit_confirmed_pc_relocation" },
      { operation: "read_current_event_signal_presentation", event_id: "e" },
      { operation: "advance_active_pc_to_target " },
      { operation: "ADVANCE_ACTIVE_PC_TO_TARGET" },
    ])
      expect(AdvanceActivePcToTargetRequestSchema.safeParse(bad).success).toBe(false);
  });
});

describe("the success receipt is one status and nothing else", () => {
  it("accepts only the committed status", () => {
    expect(
      PcTargetAdvanceReceiptSchema.safeParse({ status: PC_TARGET_ADVANCE_COMMITTED }).success,
    ).toBe(true);
    for (const bad of [
      {},
      { status: "TARGET_REACHED" },
      { status: "NULL_PC_ADVANCE_COMMITTED" },
      { status: "ADVANCE_COMMITTED" },
      { status: "EXPIRED" },
      { status: PC_TARGET_ADVANCE_COMMITTED, stop_reason: "TARGET_REACHED" },
      { status: PC_TARGET_ADVANCE_COMMITTED, canonical_time: { unit: "t", value: 1 } },
      { status: PC_TARGET_ADVANCE_COMMITTED, held: true },
      { status: PC_TARGET_ADVANCE_COMMITTED, replayed: true },
      { status: PC_TARGET_ADVANCE_COMMITTED, lifecycle_status: "expired" },
    ])
      expect(PcTargetAdvanceReceiptSchema.safeParse(bad).success).toBe(false);
  });
});
