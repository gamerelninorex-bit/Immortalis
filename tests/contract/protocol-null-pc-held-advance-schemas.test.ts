// IM-15 contracts for the one NULL-PC OOC held-continuation temporal advance operation: the host-visible request carries the
// operation name and nothing else, and the success receipt carries one status and nothing else. Register lineage: IA-18 / IA-19 /
// IA-20 / IA-28 (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  NULL_PC_OOC_HELD_ADVANCE_COMMITTED,
  NullPcOocHeldAdvanceReceiptSchema,
  PROTOCOL_OP_RESUME_NULL_PC_OOC_HELD_ADVANCE,
  ResumeNullPcOocHeldAdvanceRequestSchema,
} from "@immortalis/contracts";
import { HELD_REQUEST } from "../support/null-pc-held-advance.ts";

describe("the request carries the operation name and nothing else", () => {
  it("accepts only the strict one-field request", () => {
    const parsed = ResumeNullPcOocHeldAdvanceRequestSchema.safeParse(HELD_REQUEST());
    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.success ? parsed.data : {})).toEqual(["operation"]);
    expect(PROTOCOL_OP_RESUME_NULL_PC_OOC_HELD_ADVANCE).toBe("resume_null_pc_ooc_held_advance");
  });

  it("rejects every campaign, PC, target, continuation, held-transaction, authority, session, identity, provider or provenance field", () => {
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
      { text: "keep going" },
      { condition: { kind: "STOP_AFTER_BOUNDARY", object_id: "o", boundary_id: "b" } },
      { requested: { target: { unit: "t", value: 1 }, condition: null } },
      { continues: "tx-1" },
      { from_transaction: "tx-1" },
      { held: { from_transaction: "tx-1" } },
      { toward: { unit: "t", value: 1 } },
      { unresolved_dependents: [] },
      { transaction_id: "tx-2" },
      { cause: "c" },
      { trigger: { kind: "k", ref: "r" } },
      { role: "role.player", permission: "permission.player_choice.commit" },
      { context: { role: "role.player", permission: "permission.player_choice.commit" } },
      { session: "s" },
      { authority: "x" },
      { provider: "logistics" },
      { publication: { basis: "b", secrecy: "s" } },
      { outcome: "TARGET_REACHED" },
      { owner: "logistics" },
      { source: "x", rule: "y", provenance: "z" },
    ])
      expect(
        ResumeNullPcOocHeldAdvanceRequestSchema.safeParse(HELD_REQUEST(extra)).success,
        JSON.stringify(extra),
      ).toBe(false);
  });

  it("rejects other operation names (including the initial NULL-PC gateway's and sibling ones) and non-objects", () => {
    for (const bad of [
      undefined,
      null,
      "resume_null_pc_ooc_held_advance",
      42,
      [],
      {},
      { operation: "getFact" },
      { operation: "resume" },
      { operation: "continueRemainder" },
      { operation: "advance_null_pc_ooc_to_target" },
      { operation: "advance_confirmed_pc_transfer_to_delivery" },
      { operation: "commit_confirmed_pc_relocation" },
      { operation: "read_current_event_signal_presentation", event_id: "e" },
      { operation: "resume_null_pc_ooc_held_advance " },
      { operation: "RESUME_NULL_PC_OOC_HELD_ADVANCE" },
    ])
      expect(ResumeNullPcOocHeldAdvanceRequestSchema.safeParse(bad).success).toBe(false);
  });
});

describe("the success receipt is one status and nothing else", () => {
  it("accepts only the committed status", () => {
    expect(
      NullPcOocHeldAdvanceReceiptSchema.safeParse({ status: NULL_PC_OOC_HELD_ADVANCE_COMMITTED })
        .success,
    ).toBe(true);
    for (const bad of [
      {},
      { status: "TARGET_REACHED" },
      { status: "NULL_PC_ADVANCE_COMMITTED" },
      { status: "RESUMED" },
      { status: NULL_PC_OOC_HELD_ADVANCE_COMMITTED, stop_reason: "TARGET_REACHED" },
      { status: NULL_PC_OOC_HELD_ADVANCE_COMMITTED, canonical_time: { unit: "t", value: 1 } },
      { status: NULL_PC_OOC_HELD_ADVANCE_COMMITTED, held: true },
      { status: NULL_PC_OOC_HELD_ADVANCE_COMMITTED, replayed: true },
    ])
      expect(NullPcOocHeldAdvanceReceiptSchema.safeParse(bad).success).toBe(false);
  });
});
