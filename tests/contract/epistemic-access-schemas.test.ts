// Contract evidence for the Epistemic Access / Sealed Accessible Content Packet Backbone Foundation (tenth slice): the
// executable contracts are strict and sparse, the two surfaces are structurally separate, and BROADCAST_EXPOSURE has no
// representation. Register lineage: IA-02 (partial), IA-03 (partial), IA-11 (partial), IA-16 (partial); RC-11, RC-14,
// RC-04; IM-10. Source lock: spec/f027/spec-lock.json (F-027 v1.0): F-014D.
import { describe, expect, it } from "vitest";
import {
  ACCESS_CHANNELS,
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  AccessEventSchema,
  AccessiblePacketSchema,
  EPISTEMIC_OPERATION_FORM_ACCESSIBLE_PACKET,
  MODE_BOUNDED_SHARED_ACCESS,
  MODE_BROADCAST_EXPOSURE,
  OWNER_EPISTEMIC_ACCESS,
  RepresentationalIntelligibilitySchema,
  SealedEngineProvenanceSchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  parseStageKey,
} from "@immortalis/contracts";
import { deriveAccessProducts } from "@immortalis/engine";
import { ACTOR_SMITH, SOURCE_SPEAKER, accessEvent, sourceKey } from "@immortalis/testkit";

const event = (over: Record<string, unknown> = {}) => ({
  ...accessEvent("e1", ACTOR_SMITH),
  ...over,
});
const products = () => {
  const d = deriveAccessProducts({
    event: {
      key: accessEventKey("e1"),
      owner: OWNER_EPISTEMIC_ACCESS,
      version: 1,
      value: accessEvent("e1", ACTOR_SMITH),
    },
    capability: null,
  });
  if (!d.ok) throw new Error("fixture");
  return d.value;
};
const capabilityRef = {
  capability_id: "cap",
  fact_key: "actor/a/capability/cap",
  version: 1,
  close: { name: "actor-profile-capability-close", group_id: "g" },
};

describe("keys and the packet-formation stage identity (RC-04)", () => {
  it("derives three disjoint key spaces from the event and the recipient", () => {
    expect(accessEventKey("e")).toBe("access/e/event");
    expect(accessPacketKey("e", "r")).toBe("access/e/packet/r");
    expect(accessProvenanceKey("e", "r")).toBe("access/e/provenance/r");
  });

  it("the stage is a valid StageKey derived from the event and recipient alone, owned by the Epistemic owner", () => {
    const s = accessPacketStage("e", "r");
    expect(parseStageKey(s).ok).toBe(true);
    expect(s).toEqual({
      causal_process_id: "epistemic-access/e/r",
      owner_operation: { owner: "epistemic_access", operation: "epistemic-form-accessible-packet" },
      prospective_result_id: "access/e/packet/r",
    });
    expect(OWNER_EPISTEMIC_ACCESS).toBe("epistemic_access");
    expect(EPISTEMIC_OPERATION_FORM_ACCESSIBLE_PACKET).toBe("epistemic-form-accessible-packet");
    // identity is a pure function of (event, recipient): another recipient or event is another stage
    expect(accessPacketStage("e", "r")).toEqual(accessPacketStage("e", "r"));
    expect(accessPacketStage("e", "r2")).not.toEqual(accessPacketStage("e", "r"));
    expect(accessPacketStage("e2", "r")).not.toEqual(accessPacketStage("e", "r"));
  });
});

describe("the access event: BOUNDED_SHARED_ACCESS only, one named recipient, sealed (acceptance 1, 10, 11)", () => {
  it("accepts a well-formed event, with and without a capability requirement", () => {
    expect(AccessEventSchema.safeParse(event()).success).toBe(true);
    expect(
      AccessEventSchema.safeParse(event({ representation: { capability_id: "cap" } })).success,
    ).toBe(true);
    expect(MODE_BOUNDED_SHARED_ACCESS).toBe("BOUNDED_SHARED_ACCESS");
  });

  it("BROADCAST_EXPOSURE and every other mode are unrepresentable: the mode is a literal, fixed at creation", () => {
    expect(AccessEventSchema.safeParse(event({ mode: MODE_BROADCAST_EXPOSURE })).success).toBe(
      false,
    );
    for (const mode of ["broadcast", "BOUNDED", "SHARED", "", null, undefined, 1])
      expect(AccessEventSchema.safeParse(event({ mode })).success).toBe(false);
    const noMode: Record<string, unknown> = { ...event() };
    delete noMode["mode"];
    expect(AccessEventSchema.safeParse(noMode).success).toBe(false);
  });

  it("the participant set is exactly one named recipient: empty and multi-recipient sets are refused", () => {
    expect(AccessEventSchema.safeParse(event({ participants: [] })).success).toBe(false);
    expect(
      AccessEventSchema.safeParse(event({ participants: [ACTOR_SMITH, "actor-other"] })).success,
    ).toBe(false);
    expect(AccessEventSchema.safeParse(event({ participants: ["bad/id"] })).success).toBe(false);
    expect(AccessEventSchema.safeParse(event({ participants: [""] })).success).toBe(false);
  });

  it("there is no field for an audience, cohort, scene, membership, office, group, reach, exclusion, latency, comprehension or number", () => {
    for (const extra of [
      { audience: "everyone" },
      { cohort: { id: "c" } },
      { scene_id: "s" },
      { membership: ["a"] },
      { office: "warden" },
      { group: "council" },
      { reach: { area: "town" } },
      { exceptions: [] },
      { latency: { value: 1 } },
      { comprehension: "understood" },
      { credibility: "high" },
      { belief: "accepted" },
      { relevance: 3 },
      { received: true },
    ])
      expect(AccessEventSchema.safeParse(event(extra)).success, JSON.stringify(extra)).toBe(false);
  });

  it("only the direct, co-present channels are representable: no message, record, memory, monitor or broadcast channel", () => {
    expect(ACCESS_CHANNELS).toEqual(["PERCEPTION", "SPEECH"]);
    for (const channel of ["MESSAGE", "RECORD", "MEMORY", "MONITOR", "BROADCAST", "speech", ""])
      expect(AccessEventSchema.safeParse(event({ channel })).success).toBe(false);
  });

  it("the source is a pin (owner, key, version ≥ 1) with no value: nothing is copied from the foreign fact", () => {
    const base = event().source;
    expect(AccessEventSchema.safeParse(event({ source: { ...base, version: 0 } })).success).toBe(
      false,
    );
    expect(
      AccessEventSchema.safeParse(event({ source: { ...base, value: "copied" } })).success,
    ).toBe(false);
    expect(AccessEventSchema.safeParse(event({ source: { owner: base.owner } })).success).toBe(
      false,
    );
  });

  it("the access basis time is explicit, a canonical coordinate, and never defaulted", () => {
    const noTime: Record<string, unknown> = { ...event() };
    delete noTime["established_at"];
    expect(AccessEventSchema.safeParse(noTime).success).toBe(false);
    expect(
      AccessEventSchema.safeParse(event({ established_at: { unit: "u", value: -1 } })).success,
    ).toBe(false);
    expect(AccessEventSchema.safeParse(event({ established_at: 3 })).success).toBe(false);
  });

  it("the Presented Source Attribution is stated explicitly (text or null) and the payload carries no engine reference of its true source", () => {
    const e = accessEvent("e1", ACTOR_SMITH);
    expect(
      AccessEventSchema.safeParse({ ...e, payload: { ...e.payload, presented_attribution: null } })
        .success,
    ).toBe(true);
    const partial: Record<string, unknown> = { ...e.payload };
    delete partial["presented_attribution"];
    expect(AccessEventSchema.safeParse({ ...e, payload: partial }).success).toBe(false);
    expect(AccessEventSchema.safeParse({ ...e, payload: { ...e.payload, extra: 1 } }).success).toBe(
      false,
    );
    const key = sourceKey(SOURCE_SPEAKER);
    for (const field of ["referent", "content", "presented_attribution"] as const)
      expect(
        AccessEventSchema.safeParse({
          ...e,
          payload: { ...e.payload, [field]: `leaks ${key} here` },
        }).success,
        field,
      ).toBe(false);
  });

  it("the capability requirement names one capability and nothing else: no level, marker, score or threshold", () => {
    for (const representation of [
      { capability_id: "cap", minimum: "B" },
      { capability_id: "cap", level: 2 },
      { capability: "cap" },
      {},
      "cap",
    ])
      expect(AccessEventSchema.safeParse(event({ representation })).success).toBe(false);
  });
});

describe("the Accessible Content Packet carries only actor-admissible material (acceptance 6, 7, 8)", () => {
  it("accepts exactly the derived packet and exposes no source/holder/carrier/provenance field", () => {
    const { packet } = products();
    expect(AccessiblePacketSchema.safeParse(packet).success).toBe(true);
    expect(Object.keys(packet).sort()).toEqual([
      "access",
      "intelligibility",
      "payload",
      "presented_attribution",
      "recipient",
    ]);
    expect(JSON.stringify(packet)).not.toMatch(
      /source|holder|carrier|provenance|engine|event|synthetic-access-source/i,
    );
  });

  it("refuses every field that would smuggle engine provenance or a downstream consequence into it", () => {
    const { packet } = products();
    for (const extra of [
      { source: { owner: "o", fact_key: "k", version: 1 } },
      { true_source: "x" },
      { holder: "x" },
      { carrier_chain: [] },
      { event_id: "e1" },
      { event: { fact_key: "access/e1/event", version: 1 } },
      { provenance: {} },
      { sealed_engine_provenance: {} },
      { engine_reference: "x" },
      { comprehension: "understood" },
      { recognition: true },
      { inference: "x" },
      { credibility: 1 },
      { belief: "x" },
      { stance: "x" },
      { decision: "x" },
      { behaviour: "x" },
      { significance: "x" },
    ])
      expect(AccessiblePacketSchema.safeParse({ ...packet, ...extra }).success).toBe(false);
    expect(
      AccessiblePacketSchema.safeParse({
        ...packet,
        access: { ...packet.access, comprehension: "x" },
      }).success,
    ).toBe(false);
    expect(
      AccessiblePacketSchema.safeParse({
        ...packet,
        payload: { ...packet.payload, true_source: "x" },
      }).success,
    ).toBe(false);
  });

  it("access has exactly one representable result: RECEIVED (no broadcast, retrieved or perceived-by-audience result)", () => {
    const { packet } = products();
    for (const result of ["BROADCAST", "RETRIEVED", "EXPOSED", "NOT_ACCESSED", "received", ""])
      expect(
        AccessiblePacketSchema.safeParse({ ...packet, access: { ...packet.access, result } })
          .success,
      ).toBe(false);
  });

  it("intelligibility is a determination about access to the representation, never comprehension; the capability is referenced, never copied", () => {
    const none = { result: "REPRESENTATION_ACCESSIBLE", basis: "NO_CAPABILITY_DEPENDENCY" };
    const est = {
      result: "REPRESENTATION_ACCESSIBLE",
      basis: "ESTABLISHED_CAPABILITY",
      capability: capabilityRef,
    };
    expect(RepresentationalIntelligibilitySchema.safeParse(none).success).toBe(true);
    expect(RepresentationalIntelligibilitySchema.safeParse(est).success).toBe(true);
    // a capability reference only with the established-capability basis, and required there
    expect(
      RepresentationalIntelligibilitySchema.safeParse({ ...none, capability: capabilityRef })
        .success,
    ).toBe(false);
    expect(
      RepresentationalIntelligibilitySchema.safeParse({
        result: "REPRESENTATION_ACCESSIBLE",
        basis: "ESTABLISHED_CAPABILITY",
      }).success,
    ).toBe(false);
    for (const bad of [
      { ...none, result: "COMPREHENDED" },
      { ...none, result: "UNDERSTOOD" },
      { ...none, comprehension: "full" },
      { ...est, capability: { ...capabilityRef, marker: "A" } },
      { ...est, capability: { ...capabilityRef, grade: "S" } },
      { ...est, capability: { ...capabilityRef, level: 3 } },
      { ...est, capability: { ...capabilityRef, close: { ...capabilityRef.close, name: "now" } } },
      { ...est, capability: { ...capabilityRef, version: 0 } },
    ])
      expect(RepresentationalIntelligibilitySchema.safeParse(bad).success).toBe(false);
  });
});

describe("Sealed Engine Provenance is a separate engine-only surface (acceptance 6, 7)", () => {
  it("holds the true source, the carrier channel and the engine references the packet lacks, and points at the packet (not the reverse)", () => {
    const { packet, provenance } = products();
    expect(SealedEngineProvenanceSchema.safeParse(provenance).success).toBe(true);
    expect(provenance.source).toEqual(accessEvent("e1", ACTOR_SMITH).source);
    expect(provenance.event.fact_key).toBe(accessEventKey("e1"));
    expect(provenance.packet.fact_key).toBe(accessPacketKey("e1", ACTOR_SMITH));
    expect(provenance.capability_close).toBeNull();
    expect(JSON.stringify(packet)).not.toContain(accessPacketKey("e1", ACTOR_SMITH));
    expect(JSON.stringify(packet)).not.toContain(provenance.source.fact_key);
  });

  it("is strict: no payload, no attribution, no comprehension, no number", () => {
    const { provenance } = products();
    for (const extra of [
      { payload: {} },
      { presented_attribution: "x" },
      { comprehension: "x" },
      { score: 1 },
      { credibility: "x" },
    ])
      expect(SealedEngineProvenanceSchema.safeParse({ ...provenance, ...extra }).success).toBe(
        false,
      );
  });

  it("the two access classes are distinct, fixed labels", () => {
    expect(ACCESS_CLASS_ENGINE_SEALED).not.toBe(ACCESS_CLASS_ACTOR_ACCESSIBLE);
    expect(ACCESS_CLASS_ENGINE_SEALED).toBe("epistemic.engine-sealed");
    expect(ACCESS_CLASS_ACTOR_ACCESSIBLE).toBe("epistemic.actor-accessible");
  });
});
