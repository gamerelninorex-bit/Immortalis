// F-014D BROADCAST_EXPOSURE Access / Dissemination Event (event-only foundation) — executable contracts. The event is a
// strict, sparse shape: identity and causal basis, payload/provenance, reach/channel conditions, ONE coarse authoritative
// audience reference and material exceptions. There is no field in which a recipient, a roster, a packet, an
// access-established time, a receipt, a comprehension, a Knowledge Time or any Population/Culture/KTI effect could be placed
// (F-014D §§2.1, 4.4, 13, 24). The BOUNDED_SHARED_ACCESS branch is unchanged. Synthetic fixtures only.
// Register lineage: IA-02, IA-11 (partial), IA-16 (partial); RC-02, RC-11; IM-10. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  AccessDisseminationEventSchema,
  AccessEventSchema,
  AccessiblePacketSchema,
  BroadcastExposureEventSchema,
  MODE_BOUNDED_SHARED_ACCESS,
  MODE_BROADCAST_EXPOSURE,
  SealedEngineProvenanceSchema,
  accessEventKey,
} from "@immortalis/contracts";
import { ACTOR_SMITH, accessEvent, broadcastEvent } from "@immortalis/testkit";

const ok = (v: unknown) => BroadcastExposureEventSchema.safeParse(v).success;
const event = (over: Record<string, unknown> = {}) => ({ ...broadcastEvent("e1"), ...over });

describe("the BROADCAST_EXPOSURE event is a strict, sparse, event-only shape (F-014D §4.4)", () => {
  it("accepts the one well-formed event, and its mode is the literal fixed at creation", () => {
    expect(ok(broadcastEvent("e1"))).toBe(true);
    expect(broadcastEvent("e1").mode).toBe(MODE_BROADCAST_EXPOSURE);
    for (const mode of [
      MODE_BOUNDED_SHARED_ACCESS,
      "broadcast_exposure",
      "BROADCAST",
      "",
      undefined,
    ])
      expect(ok(event({ mode })), String(mode)).toBe(false);
  });

  it("requires every §4.4 element: identity, causal basis, payload/provenance, reach/channel, audience and exceptions", () => {
    for (const field of [
      "event_id",
      "mode",
      "source",
      "dissemination_basis",
      "payload",
      "reach",
      "audience",
      "exceptions",
    ]) {
      const e: Record<string, unknown> = { ...broadcastEvent("e1") };
      delete e[field];
      expect(ok(e), field).toBe(false);
    }
    // reach and channel conditions are each required prose, never empty and never padded
    for (const reach of [
      {},
      { channel: "a public address" },
      { conditions: "audible across the square" },
      { channel: "", conditions: "audible" },
      { channel: "a public address", conditions: "" },
      { channel: " a public address", conditions: "audible" },
      { channel: "a public address", conditions: "audible", range: 40 },
    ])
      expect(ok(event({ reach })), JSON.stringify(reach)).toBe(false);
  });

  it("is unrepresentable as a recipient event: no participant, recipient, packet, receipt, access time, comprehension, Knowledge Time, KTI, Population or Culture field", () => {
    for (const field of [
      "participants",
      "recipient",
      "recipients",
      "recipient_role",
      "roster",
      "members",
      "member_count",
      "audience_snapshot",
      "packet",
      "receipt",
      "received",
      "access",
      "established_at",
      "channel",
      "representation",
      "comprehension",
      "understood",
      "knowledge_time",
      "actionable_knowledge_time",
      "kti",
      "exposure",
      "adoption",
      "culture",
      "population_effect",
      "is_broadcast",
      "reach_score",
      "attention",
      "presence",
      "score",
    ])
      expect(ok(event({ [field]: field === "participants" ? [ACTOR_SMITH] : 1 })), field).toBe(
        false,
      );
  });

  it("holds the audience as ONE coarse pinned reference, never a roster or per-individual snapshot", () => {
    const audience = broadcastEvent("e1").audience;
    expect(ok(event({ audience }))).toBe(true);
    for (const bad of [
      [audience],
      { ...audience, members: [ACTOR_SMITH] },
      { ...audience, roster: [ACTOR_SMITH] },
      { ...audience, count: 400 },
      { ...audience, version: 0 },
      { ...audience, version: 1.5 },
      { ...audience, fact_key: "" },
      { fact_key: audience.fact_key, version: 1 },
      { ...audience, owner: "epistemic_access" },
      { ...audience, owner: "named_actor" },
      { ...audience, owner: "pc_existence" },
      { ...audience, owner: "role_registry" },
      { ...audience, owner: "temporal_kernel" },
    ])
      expect(ok(event({ audience: bad })), JSON.stringify(bad)).toBe(false);
    // two audiences, or an audience given in place of a pin, are not the shape
    expect(ok(event({ audience: undefined, audiences: [audience] }))).toBe(false);
  });

  it("states exceptions explicitly and as bounded prose: an empty list says there are none, and nothing is derived", () => {
    expect(ok(event({ exceptions: [] }))).toBe(true);
    expect(
      ok(event({ exceptions: ["SYNTHETIC FIXTURE: the sealed east gate was out of earshot"] })),
    ).toBe(true);
    for (const exceptions of [undefined, null, "none", [""], [" padded "], [1], [{ who: "x" }]])
      expect(ok(event({ exceptions })), JSON.stringify(exceptions)).toBe(false);
  });

  it("the payload never carries the engine reference of its true source (the role-context rule)", () => {
    const payload = broadcastEvent("e1").payload;
    const key = broadcastEvent("e1").source.fact_key;
    for (const field of ["content", "referent", "presented_attribution"] as const)
      expect(ok(event({ payload: { ...payload, [field]: `as announced by ${key}` } })), field).toBe(
        false,
      );
    expect(ok(event({ payload: { ...payload, presented_attribution: null } }))).toBe(true);
    expect(ok(event({ payload: { ...payload, truth: "x" } }))).toBe(false);
  });

  it("pins its source exactly as a bounded event does: owner, key and a positive version, no value", () => {
    const source = broadcastEvent("e1").source;
    for (const bad of [
      { ...source, version: 0 },
      { ...source, value: "copied" },
      { owner: source.owner, fact_key: source.fact_key },
      "not-a-pin",
    ])
      expect(ok(event({ source: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("the dissemination basis is a canonical time and is NOT an access-established time", () => {
    expect(ok(event({ dissemination_basis: { unit: "u", value: 3 } }))).toBe(true);
    for (const bad of [null, 3, { unit: "u" }, { value: 3 }, "T0"])
      expect(ok(event({ dissemination_basis: bad })), JSON.stringify(bad)).toBe(false);
  });
});

describe("the two immutable modes share one canonical key and are never merged", () => {
  it("the Access / Dissemination Event family discriminates on the literal mode and keeps each branch strict", () => {
    const bounded = accessEvent("e1", ACTOR_SMITH);
    const broadcast = broadcastEvent("e1");
    const a = AccessDisseminationEventSchema.safeParse(bounded);
    const b = AccessDisseminationEventSchema.safeParse(broadcast);
    expect(a.success && a.data.mode).toBe(MODE_BOUNDED_SHARED_ACCESS);
    expect(b.success && b.data.mode).toBe(MODE_BROADCAST_EXPOSURE);
    expect(AccessDisseminationEventSchema.safeParse({ ...bounded, mode: "OTHER" }).success).toBe(
      false,
    );
    expect(AccessDisseminationEventSchema.safeParse({ ...bounded, mode: undefined }).success).toBe(
      false,
    );
  });

  it("a malformed dual-mode event is rejected by both branches: a broadcast with a participant set, a bounded event with an audience", () => {
    const bounded = accessEvent("e1", ACTOR_SMITH);
    const broadcast = broadcastEvent("e1");
    for (const dual of [
      { ...broadcast, participants: [ACTOR_SMITH] },
      { ...bounded, audience: broadcast.audience },
      { ...bounded, reach: broadcast.reach },
      { ...bounded, mode: MODE_BROADCAST_EXPOSURE },
      { ...broadcast, mode: MODE_BOUNDED_SHARED_ACCESS },
      { ...broadcast, ...bounded, mode: MODE_BROADCAST_EXPOSURE },
    ])
      expect(AccessDisseminationEventSchema.safeParse(dual).success, JSON.stringify(dual)).toBe(
        false,
      );
  });

  it("the BOUNDED_SHARED_ACCESS branch is unchanged: it still refuses the broadcast mode and every audience field", () => {
    expect(AccessEventSchema.safeParse(broadcastEvent("e1")).success).toBe(false);
    expect(AccessEventSchema.safeParse(accessEvent("e1", ACTOR_SMITH)).success).toBe(true);
    for (const field of ["audience", "reach", "exceptions", "dissemination_basis"])
      expect(
        AccessEventSchema.safeParse({ ...accessEvent("e1", ACTOR_SMITH), [field]: 1 }).success,
        field,
      ).toBe(false);
  });

  it("there is no second key space: the broadcast event lives at the event's one canonical key", () => {
    expect(accessEventKey("e1")).toBe("access/e1/event");
  });

  it("neither the packet nor the sealed provenance can carry or point at an audience or a broadcast mode", () => {
    const packetFields = Object.keys(AccessiblePacketSchema.shape);
    const provenanceFields = Object.keys(SealedEngineProvenanceSchema.shape);
    for (const fields of [packetFields, provenanceFields])
      for (const forbidden of ["audience", "reach", "mode", "exceptions", "roster", "members"])
        expect(fields).not.toContain(forbidden);
  });
});
