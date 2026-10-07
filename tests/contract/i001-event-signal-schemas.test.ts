// I-001 Event-Signal Projection contract (IM-13 / RC-14): strict, disposable, non-canonical. Every schema rejects an
// unmodelled field (IA-02), so no field exists in which sealed provenance, hidden state, cognition, memory or prose could be
// carried. Register lineage: IA-13 (partial), IA-17 (partial).
import { describe, expect, it } from "vitest";
import {
  EventSignalProjectionSchema,
  EventSignalRequestSchema,
  PROJECTION_EVENT_SIGNAL,
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
} from "@immortalis/contracts";

const valid = {
  projection: "EVENT_SIGNAL",
  disposable: true,
  viewpoint: { role: "role.player_character", entity_id: "pc-1" },
  contact: { channel: "SPEECH" },
  payload: { referent: "the gate rota", content: "the gate opens at first light" },
  presented_attribution: "bearing the seal of the Warden",
};

describe("the Event-Signal Projection is strict and carries only the received envelope and payload", () => {
  it("accepts the projection, with a null Presented Source Attribution", () => {
    expect(EventSignalProjectionSchema.safeParse(valid).success).toBe(true);
    expect(
      EventSignalProjectionSchema.safeParse({ ...valid, presented_attribution: null }).success,
    ).toBe(true);
    expect(PROJECTION_EVENT_SIGNAL).toBe("EVENT_SIGNAL");
  });

  it("is disposable by literal: it can never claim to be state", () => {
    expect(EventSignalProjectionSchema.safeParse({ ...valid, disposable: false }).success).toBe(
      false,
    );
    const without: Record<string, unknown> = { ...valid };
    delete without.disposable;
    expect(EventSignalProjectionSchema.safeParse(without).success).toBe(false);
  });

  it("names exactly the active role.player_character viewpoint and one direct channel", () => {
    for (const role of ["role.player", "role.gm", "role.world", "entity.pc", ""])
      expect(
        EventSignalProjectionSchema.safeParse({ ...valid, viewpoint: { ...valid.viewpoint, role } })
          .success,
      ).toBe(false);
    for (const channel of ["MESSAGE", "RECORD", "MEMORY", "BROADCAST", "MONITOR", ""])
      expect(
        EventSignalProjectionSchema.safeParse({ ...valid, contact: { channel } }).success,
      ).toBe(false);
    expect(
      EventSignalProjectionSchema.safeParse({ ...valid, contact: { channel: "PERCEPTION" } })
        .success,
    ).toBe(true);
  });

  // The structural half of the I-001 guards: no place to put any of these, top level or nested.
  const forbidden = [
    // sealed provenance / engine identity (F-014D §2.1, §18)
    "event_id",
    "packet_id",
    "provenance",
    "sealed_provenance",
    "source",
    "source_key",
    "source_owner",
    "source_version",
    "holder",
    "carrier",
    "true_source",
    "fact_key",
    "version",
    "group_id",
    "intent_id",
    "transaction_id",
    // capability / validator internals
    "capability",
    "capability_close",
    "close",
    "intelligibility",
    "representation",
    "marker",
    "validator",
    "diagnostics",
    "error",
    // hidden-state existence leakage
    "unknown",
    "locked",
    "hidden",
    "redacted",
    "category",
    "withheld",
    // cognition / memory / action (I-001 §11; F-014D §24)
    "comprehension",
    "inference",
    "interpretation",
    "belief",
    "stance",
    "memory",
    "recall",
    "decision",
    "emotion",
    "action",
    "intent",
    "urgency",
    // time / prose
    "arrived_at",
    "established_at",
    "canonical_time",
    "prose",
    "narration",
  ];
  const at = (path: "top" | "viewpoint" | "contact" | "payload") => (extra: string) => {
    const v = structuredClone(valid) as Record<string, unknown>;
    if (path === "top") v[extra] = "x";
    else (v[path] as Record<string, unknown>)[extra] = "x";
    return EventSignalProjectionSchema.safeParse(v).success;
  };
  it.each(forbidden)("rejects an unmodelled %s field at every level", (field) => {
    for (const where of ["top", "viewpoint", "contact", "payload"] as const)
      expect(at(where)(field), `${where}.${field}`).toBe(false);
  });

  it("requires every field: nothing is defaulted", () => {
    for (const k of Object.keys(valid)) {
      const v = structuredClone(valid) as Record<string, unknown>;
      delete v[k];
      expect(EventSignalProjectionSchema.safeParse(v).success, k).toBe(false);
    }
  });

  it("preserves authored text exactly and rejects empty or whitespace-padded text", () => {
    for (const content of ["", " x", "x "])
      expect(
        EventSignalProjectionSchema.safeParse({ ...valid, payload: { ...valid.payload, content } })
          .success,
      ).toBe(false);
  });
});

describe("the request and the one refusal", () => {
  it("a request is exactly an event identity and a recipient identity", () => {
    expect(
      EventSignalRequestSchema.safeParse({ event_id: "e1", recipient_id: "pc-1" }).success,
    ).toBe(true);
    expect(
      EventSignalRequestSchema.safeParse({ event_id: "e1", recipient_id: "pc-1", mode: "x" })
        .success,
    ).toBe(false);
    expect(EventSignalRequestSchema.safeParse({ event_id: "e1" }).success).toBe(false);
  });

  it("the refusal vocabulary is one code and one message, naming no cause", () => {
    expect(PROJECTION_UNAVAILABLE).toBe("PROJECTION_UNAVAILABLE");
    expect(PROJECTION_UNAVAILABLE_MESSAGE).toBe("no projection is available");
    for (const word of [
      "hidden",
      "locked",
      "unknown",
      "sealed",
      "packet",
      "recipient",
      "binding",
      "denied",
    ])
      expect(PROJECTION_UNAVAILABLE_MESSAGE.toLowerCase()).not.toContain(word);
  });
});
