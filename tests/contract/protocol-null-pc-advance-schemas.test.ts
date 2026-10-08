// IM-15 contracts for the one NULL-PC OOC target-only temporal advance operation: the host-visible request carries the operation
// name and nothing else, and the success receipt carries one status and nothing else. Register lineage: IA-18 / IA-19 / IA-20 /
// IA-28 (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  AdvanceNullPcOocToTargetRequestSchema,
  NULL_PC_OOC_ADVANCE_COMMITTED,
  NullPcOocAdvanceReceiptSchema,
  PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET,
} from "@immortalis/contracts";
import { NULL_PC_REQUEST } from "../support/null-pc-advance.ts";

describe("the request carries the operation name and nothing else", () => {
  it("accepts only the strict one-field request", () => {
    const parsed = AdvanceNullPcOocToTargetRequestSchema.safeParse(NULL_PC_REQUEST());
    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.success ? parsed.data : {})).toEqual(["operation"]);
    expect(PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET).toBe("advance_null_pc_ooc_to_target");
  });

  it("rejects every campaign, PC, target, duration, unit, condition, authority, session, transaction, trigger or provenance field", () => {
    for (const extra of [
      { confirmed: true },
      { confirmation: "yes" },
      { campaign_id: "other" },
      { pc_id: "pc-1" },
      { active_pc: null },
      { target: { unit: "t", value: 1 } },
      { until: { unit: "t", value: 1 } },
      { date: "2026-10-08" },
      { calendar: "gregorian" },
      { unit: "t" },
      { duration: 5 },
      { wait: "a week" },
      { text: "let a week pass" },
      { condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "o", boundary_id: "b" } },
      { requested: { target: { unit: "t", value: 1 }, condition: null } },
      { continues: "tx-1" },
      { transaction_id: "tx-1" },
      { cause: "c" },
      { trigger: { kind: "k", ref: "r" } },
      { role: "role.player", permission: "permission.player_choice.commit" },
      { context: { role: "role.player", permission: "permission.player_choice.commit" } },
      { session: "s" },
      { authority: "x" },
      { publication: { basis: "b", secrecy: "s" } },
      { owner: "logistics" },
      { source: "x", rule: "y", provenance: "z" },
    ])
      expect(
        AdvanceNullPcOocToTargetRequestSchema.safeParse(NULL_PC_REQUEST(extra)).success,
        JSON.stringify(extra),
      ).toBe(false);
  });

  it("rejects other operation names (including internal and sibling ones) and non-objects", () => {
    for (const bad of [
      undefined,
      null,
      "advance_null_pc_ooc_to_target",
      42,
      [],
      {},
      { operation: "getFact" },
      { operation: "advance" },
      { operation: "wait" },
      { operation: "continueRemainder" },
      { operation: "registerObject" },
      { operation: "advance_confirmed_pc_transfer_to_delivery" },
      { operation: "commit_confirmed_pc_relocation" },
      { operation: "read_current_event_signal_presentation", event_id: "e" },
      { operation: "advance_null_pc_ooc_to_target " },
      { operation: "ADVANCE_NULL_PC_OOC_TO_TARGET" },
    ])
      expect(AdvanceNullPcOocToTargetRequestSchema.safeParse(bad).success).toBe(false);
  });
});

describe("the success receipt is one status and nothing else", () => {
  it("accepts only the committed status", () => {
    expect(
      NullPcOocAdvanceReceiptSchema.safeParse({ status: NULL_PC_OOC_ADVANCE_COMMITTED }).success,
    ).toBe(true);
    for (const bad of [
      {},
      { status: "TARGET_REACHED" },
      { status: "ADVANCED" },
      { status: NULL_PC_OOC_ADVANCE_COMMITTED, stop_reason: "TARGET_REACHED" },
      { status: NULL_PC_OOC_ADVANCE_COMMITTED, canonical_time: { unit: "t", value: 1 } },
      { status: NULL_PC_OOC_ADVANCE_COMMITTED, replayed: true },
      { status: NULL_PC_OOC_ADVANCE_COMMITTED, events: [] },
    ])
      expect(NullPcOocAdvanceReceiptSchema.safeParse(bad).success).toBe(false);
  });
});
