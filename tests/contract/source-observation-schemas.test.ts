/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary invalid documents */
// BLUE v5.2-A1 — SOURCE-QUALIFIED original-PC observation: the contracts it rests on are unchanged and closed. The host's answer, the retained
// reading, the Epistemic event, the packet, the sealed provenance and the read request gain NO field, NO owner and NO key space: a source is
// named by the TRUSTED side only (an engine function argument, never a document a host writes), cited by the retained reading as an
// ordinary pinned premise, and pinned by the event as the ordinary foreign source it already was. Strictness is the structural half of that.
import { describe, expect, it } from "vitest";
import {
  AccessEventSchema,
  AccessiblePacketSchema,
  OBSERVATION_BASE_REFS,
  ObservationHostDecisionSchema,
  ObservationPayloadSchema,
  RefereeDecisionRecordSchema,
  RefereeInputRefSchema,
  ReadCurrentObservationGlanceRequestSchema,
  SealedEngineProvenanceSchema,
  parseWorldSourceConditionKey,
  worldSourceConditionKey,
} from "@immortalis/contracts";
import { observationEventId } from "@immortalis/engine";

describe("no host-written document can name, select or carry a source", () => {
  const decision = (over: Record<string, unknown> = {}): any => ({
    task_id: "0".repeat(64),
    faculty: { state: "NOT_ESTABLISHED", premises: [], rule_ids: ["F014D-6"], grounds: "-" },
    position: { state: "NOT_ESTABLISHED", premises: [], rule_ids: ["F014D-6"], grounds: "-" },
    path: { state: "NOT_ESTABLISHED", premises: [], rule_ids: ["F014D-6"], grounds: "-" },
    payload: null,
    assessments: [
      {
        fact_id: "world.premise",
        relation: "NOT_RELEVANT",
        rule_ids: ["IR-7"],
        grounds: "-",
        evidence_quote: null,
      },
    ],
    unresolved_forks: [],
    ...over,
  });

  it("the host's answer is strict: it has no field for a source selector, a source key, a quantity or a verdict", () => {
    expect(ObservationHostDecisionSchema.safeParse(decision()).success).toBe(true);
    for (const extra of [
      { source_key: "src-1" },
      { source: { key: "src-1" } },
      { quantity: 120 },
      { material_class: "raw-salt" },
      { verdict: "OBSERVATION_ESTABLISHED" },
      { scope: "source" },
    ])
      expect(
        ObservationHostDecisionSchema.safeParse(decision(extra)).success,
        JSON.stringify(extra),
      ).toBe(false);
  });

  it("the appearance is strict: raw words and quoted premises only, with no place for a source key or a hidden value", () => {
    const payload = {
      source_fact_id: "source.access.1",
      referent: "a low pale heap",
      content: "a heap of pale crust lying bare",
      basis: [{ from: "WORLD_FACT", ref: "source.access.1", evidence_quote: "lies bare" }],
    };
    expect(ObservationPayloadSchema.safeParse(payload).success).toBe(true);
    for (const extra of [
      { source_key: "src-1" },
      { quantity: { amount: 120, unit: "sack" } },
      { material: "salt" },
    ])
      expect(ObservationPayloadSchema.safeParse({ ...payload, ...extra }).success).toBe(false);
  });

  it("the read request is the one strict operation name: a source, a key, an event, a basis or a recipient over-claims", () => {
    const ok = { operation: "read_current_observation_glance" };
    expect(ReadCurrentObservationGlanceRequestSchema.safeParse(ok).success).toBe(true);
    for (const extra of [
      { source_key: "src-1" },
      { source: "src-1" },
      { event_id: "obs-1" },
      { at: {} },
      { recipient_id: "pc-1" },
    ])
      expect(ReadCurrentObservationGlanceRequestSchema.safeParse({ ...ok, ...extra }).success).toBe(
        false,
      );
  });

  it("the retained reading, the event, the packet and the sealed provenance accept no source-scope field of their own", () => {
    const event = AccessEventSchema.safeParse({
      event_id: "obs-1",
      mode: "BOUNDED_SHARED_ACCESS",
      participants: ["pc-1"],
      source: {
        owner: "world_state",
        fact_key: worldSourceConditionKey("w1", "src-1"),
        version: 1,
      },
      channel: "PERCEPTION",
      established_at: { unit: "u", value: 1 },
      payload: { referent: "a heap", content: "pale crust", presented_attribution: null },
      representation: null,
      recipient_role: "role.player_character",
    });
    // a Source Condition is an ordinary foreign World-State fact to an event: it parses as the pin it always was
    expect(event.success).toBe(true);
    if (event.success) {
      expect(AccessEventSchema.safeParse({ ...event.data, source_key: "src-1" }).success).toBe(
        false,
      );
      expect(AccessEventSchema.safeParse({ ...event.data, scope: "source" }).success).toBe(false);
    }
    // the event's payload cannot carry its own source's engine reference (the existing RC-02 guard covers a Source Condition key too)
    expect(
      AccessEventSchema.safeParse({
        ...(event.success ? event.data : {}),
        payload: {
          referent: `see ${worldSourceConditionKey("w1", "src-1")}`,
          content: "pale crust",
          presented_attribution: null,
        },
      }).success,
    ).toBe(false);
    expect(AccessiblePacketSchema.safeParse({ source_key: "src-1" }).success).toBe(false);
    expect(SealedEngineProvenanceSchema.safeParse({ source_key: "src-1" }).success).toBe(false);
    expect(
      RefereeDecisionRecordSchema.safeParse({
        operation: "F014D_DIRECT_PERCEPTION",
        source_key: "src-1",
      }).success,
    ).toBe(false);
  });
});

describe("the citation of a source is the ordinary one, by key, version and committing group, and nothing else", () => {
  it("the reading cites five premises, or those five and exactly one Source Condition: a premise ref is strict", () => {
    expect(OBSERVATION_BASE_REFS).toBe(5);
    expect(
      RefereeInputRefSchema.safeParse({
        fact_key: worldSourceConditionKey("w1", "src-1"),
        version: 3,
        group_id: "g",
      }).success,
    ).toBe(true);
    for (const extra of [{ value: 1 }, { source_key: "src-1" }, { quantity: 120 }])
      expect(
        RefereeInputRefSchema.safeParse({
          fact_key: worldSourceConditionKey("w1", "src-1"),
          version: 3,
          group_id: "g",
          ...extra,
        }).success,
      ).toBe(false);
  });

  it("a Source Condition key parses only exactly (never a delivery, a profile, a locus, or a key that merely contains one)", () => {
    expect(parseWorldSourceConditionKey(worldSourceConditionKey("w1", "src-1"))).toEqual({
      world_id: "w1",
      source_key: "src-1",
    });
    for (const key of [
      "world/w1/source-delivery/x",
      "world/w1/profile",
      "world/w1/locus/l1",
      "world/w1/source/x/y",
      "prefix/world/w1/source/x",
      "world/w1/source/",
    ])
      expect(parseWorldSourceConditionKey(key), key).toBeNull();
  });

  it("one character has one observation identity per canonical instant, whatever a question is scoped at: the identity takes no source", () => {
    expect(observationEventId.length).toBe(2);
    const at = { unit: "u", value: 1 };
    expect(observationEventId("pc-1", at)).toBe(observationEventId("pc-1", at));
    expect(observationEventId("pc-1", at)).not.toBe(
      observationEventId("pc-1", { unit: "u", value: 2 }),
    );
    expect(observationEventId("pc-1", at)).not.toBe(observationEventId("pc-2", at));
  });
});
