// IM-15 host request contract for the one allowlisted Event-Signal read: the host names the operation and one event, and
// nothing else. Register lineage: IA-18 / IA-20 / IA-28 (partial); RC-14; IM-15; IM-16.
import { describe, expect, it } from "vitest";
import {
  PROTOCOL_OP_READ_EVENT_SIGNAL_PRESENTATION,
  ReadEventSignalPresentationRequestSchema,
} from "@immortalis/contracts";

const good = { operation: PROTOCOL_OP_READ_EVENT_SIGNAL_PRESENTATION, event_id: "event-signal-1" };

describe("the host-visible request names only the operation and one event", () => {
  it("accepts exactly the allowlisted operation and an event identity", () => {
    expect(ReadEventSignalPresentationRequestSchema.safeParse(good).success).toBe(true);
    expect(Object.keys(ReadEventSignalPresentationRequestSchema.shape).sort()).toEqual([
      "event_id",
      "operation",
    ]);
  });

  it("rejects every authority-bearing, source-bearing, path-bearing or unmodelled field", () => {
    for (const extra of [
      "campaign_id",
      "campaign",
      "recipient_id",
      "recipient",
      "player_id",
      "entity_id",
      "role",
      "permission",
      "permissions",
      "viewpoint",
      "pc",
      "binding",
      "source",
      "source_key",
      "provenance",
      "packet",
      "key",
      "path",
      "file",
      "sql",
      "projection",
      "presentation",
      "token",
      "session",
      "__proto__",
      "constructor",
    ])
      expect(
        ReadEventSignalPresentationRequestSchema.safeParse({ ...good, [extra]: "x" }).success,
        extra,
      ).toBe(false);
  });

  it("rejects any other operation name, a missing field and a malformed event identity", () => {
    for (const operation of [
      "getFact",
      "listFacts",
      "committedGroup",
      "derive_event_signal_projection",
      "read_campaign",
      "",
    ])
      expect(
        ReadEventSignalPresentationRequestSchema.safeParse({ ...good, operation }).success,
      ).toBe(false);
    expect(ReadEventSignalPresentationRequestSchema.safeParse({ event_id: "e" }).success).toBe(
      false,
    );
    expect(
      ReadEventSignalPresentationRequestSchema.safeParse({ operation: good.operation }).success,
    ).toBe(false);
    for (const event_id of ["", "-", "../etc/passwd", " x", 7, null, { a: 1 }, ["e"]])
      expect(
        ReadEventSignalPresentationRequestSchema.safeParse({ ...good, event_id }).success,
      ).toBe(false);
    for (const v of [null, undefined, "event-signal-1", 3, [], [good]])
      expect(ReadEventSignalPresentationRequestSchema.safeParse(v).success).toBe(false);
  });
});
