// IM-15 contracts for the one confirmed active-PC relocation operation: the host-visible request carries the operation name and
// nothing else, and the success receipt carries one status and nothing else. Register lineage: IA-18 / IA-19 / IA-20 / IA-28
// (no status or evidence change); IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  CommitConfirmedPcRelocationRequestSchema,
  PC_RELOCATION_COMMITTED,
  PROTOCOL_OP_COMMIT_CONFIRMED_PC_RELOCATION,
  PcRelocationReceiptSchema,
} from "@immortalis/contracts";
import { RELOCATION_REQUEST } from "../support/protocol.ts";

describe("the request carries the operation name and nothing else", () => {
  it("accepts only the strict one-field request", () => {
    const parsed = CommitConfirmedPcRelocationRequestSchema.safeParse(RELOCATION_REQUEST());
    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.success ? parsed.data : {})).toEqual(["operation"]);
    expect(PROTOCOL_OP_COMMIT_CONFIRMED_PC_RELOCATION).toBe("commit_confirmed_pc_relocation");
  });

  it("rejects every authority, identity, confirmation, destination, timing, owner, source or provenance field", () => {
    for (const extra of [
      { confirmed: true },
      { confirmation: "yes" },
      { pc_id: "pc-1" },
      { campaign_id: "other" },
      { destination: { world_id: "w", locus_id: "l" } },
      { locus_id: "l" },
      { delivery_at: { unit: "t", value: 1 } },
      { duration: 5 },
      { route: ["a"] },
      { authored_under: { role: "role.player", permission: "permission.player_choice.commit" } },
      { role: "role.player", permission: "permission.player_choice.commit" },
      { owner: "logistics" },
      { subject: "pc-1" },
      { request_key: "pc/pc-1/movement/request" },
      { group_id: "g", intent_id: "i" },
      { source: "x", rule: "y", provenance: "z" },
    ])
      expect(
        CommitConfirmedPcRelocationRequestSchema.safeParse(RELOCATION_REQUEST(extra)).success,
        JSON.stringify(extra),
      ).toBe(false);
  });

  it("rejects other operation names (including internal ones) and non-objects", () => {
    for (const bad of [
      undefined,
      null,
      "commit_confirmed_pc_relocation",
      42,
      [],
      {},
      { operation: "getFact" },
      { operation: "listFacts" },
      { operation: "commitPcVoluntaryMovement" },
      { operation: "dispatch" },
      { operation: "read_current_event_signal_presentation", event_id: "e" },
      { operation: "commit_confirmed_pc_relocation " },
    ])
      expect(CommitConfirmedPcRelocationRequestSchema.safeParse(bad).success).toBe(false);
  });
});

describe("the success receipt is one status and nothing else", () => {
  it("accepts only the committed status", () => {
    expect(PcRelocationReceiptSchema.safeParse({ status: PC_RELOCATION_COMMITTED }).success).toBe(
      true,
    );
    for (const bad of [
      {},
      { status: "ARRIVED" },
      { status: PC_RELOCATION_COMMITTED, locus: "x" },
      { status: PC_RELOCATION_COMMITTED, revision: 3 },
      { status: PC_RELOCATION_COMMITTED, replayed: true },
    ])
      expect(PcRelocationReceiptSchema.safeParse(bad).success).toBe(false);
  });
});
