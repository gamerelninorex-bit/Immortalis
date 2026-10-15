/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary invalid values */
// BLUE v5.2 — the contracts of the direct-perception referee operation and the observation-earned event: closed vocabularies, strict
// shapes, the unchanged Access Event / packet / provenance contracts, and the one Epistemic-only exception in the Temporal object schema.
import { describe, expect, it } from "vitest";
import {
  AccessEventSchema,
  AccessiblePacketSchema,
  OBSERVATION_FACULTY_STATES,
  OBSERVATION_PATH_STATES,
  OBSERVATION_PLACEMENT_REF,
  OBSERVATION_POSITION_STATES,
  OBSERVATION_PREMISE_KINDS,
  OBSERVATION_RESOLVER_AUTHORITY,
  RESOLVER_AUTHORITY,
  OBSERVATION_VERDICTS,
  ObservationHostDecisionSchema,
  ObservationPayloadSchema,
  ObservationPremiseSchema,
  OWNER_EPISTEMIC_ACCESS,
  PHYSICAL_VERDICTS,
  IR_VERDICTS,
  I002_VERDICTS,
  REFEREE_OP_OBSERVATION,
  REFEREE_SOURCES,
  RefereeDecisionRecordSchema,
  RefereeVerdictSchema,
  SealedEngineProvenanceSchema,
  TemporalObjectSchema,
} from "@immortalis/contracts";

const at = (value: number) => ({ unit: "u", value });
const premise = { from: "WORLD_FACT", ref: "locus.constraint.1", evidence_quote: "a quote" };
const element = (state: string) => ({
  state,
  premises: [premise],
  rule_ids: ["F014D-6"],
  grounds: "why",
});
const decision = (): any => ({
  task_id: "a".repeat(64),
  faculty: element("ESTABLISHED"),
  position: element("ESTABLISHED"),
  path: element("OPEN"),
  payload: {
    source_fact_id: "locus.constraint.1",
    referent: "a stripe",
    content: "a green stripe",
    basis: [premise],
  },
  assessments: [
    {
      fact_id: "locus.constraint.1",
      relation: "SUPPORTS",
      rule_ids: ["IR-7"],
      grounds: "g",
      evidence_quote: "a quote",
    },
  ],
  unresolved_forks: [],
});
const record = (): any => ({
  record_version: 1,
  task_id: "a".repeat(64),
  campaign_id: "c1",
  attempt: 0,
  authority: { role: "role.gm", permission: "permission.rule.adjudicate" },
  validated_under: { role: "role.resolver", permission: "permission.resolution.execute" },
  host: { host_id: "h1", claimed_model: null },
  subject: { pc_id: "pc-1" },
  input: {
    digest: "b".repeat(64),
    candidate_digest: null,
    candidate: null,
    statement_digest: "c".repeat(64),
    statement: "I am here.",
    refs: [{ fact_key: "pc/pc-1/existence-contract", version: 1, group_id: "g1" }],
    observed_at: at(100),
  },
  operation: "F014D_DIRECT_PERCEPTION",
  decision: decision(),
  verdict: "OBSERVATION_ESTABLISHED",
});
const ok = (s: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  s.safeParse(v).success;

describe("the host's direct-perception answer is a closed, strict shape", () => {
  it("accepts the stated shape and nothing else", () => {
    expect(ok(ObservationHostDecisionSchema, decision())).toBe(true);
    expect(ok(ObservationHostDecisionSchema, { ...decision(), payload: null })).toBe(true);
    for (const extra of [
      "verdict",
      "visible",
      "recognised",
      "place_name",
      "belief",
      "memory",
      "elapsed",
      "expected",
    ]) {
      expect(ok(ObservationHostDecisionSchema, { ...decision(), [extra]: true }), extra).toBe(
        false,
      );
      expect(ok(ObservationPayloadSchema, { ...decision().payload, [extra]: true }), extra).toBe(
        false,
      );
    }
  });

  it("states each element in its own closed vocabulary, never a bare flag", () => {
    expect([...OBSERVATION_FACULTY_STATES]).toEqual(["ESTABLISHED", "NOT_ESTABLISHED"]);
    expect([...OBSERVATION_POSITION_STATES]).toEqual(["ESTABLISHED", "NOT_ESTABLISHED"]);
    expect([...OBSERVATION_PATH_STATES]).toEqual(["OPEN", "BLOCKED", "NOT_ESTABLISHED"]);
    expect([...OBSERVATION_PREMISE_KINDS]).toEqual([
      "PC_STATEMENT",
      "PLACEMENT_STATEMENT",
      "WORLD_FACT",
    ]);
    expect(OBSERVATION_PLACEMENT_REF).toBe("placement.statement");
    for (const bad of [true, "VISIBLE", "visible", "yes", 1, null]) {
      expect(ok(ObservationHostDecisionSchema, { ...decision(), path: bad })).toBe(false);
      expect(
        ok(ObservationHostDecisionSchema, {
          ...decision(),
          path: { ...decision().path, state: bad },
        }),
      ).toBe(false);
    }
    expect(
      ok(ObservationHostDecisionSchema, {
        ...decision(),
        faculty: { ...decision().faculty, state: "OPEN" },
      }),
    ).toBe(false);
    expect(
      ok(ObservationHostDecisionSchema, {
        ...decision(),
        path: { ...decision().path, state: "ESTABLISHED" },
      }),
    ).toBe(false);
  });

  it("anchors every premise to a kind, a reference and a non-empty quotation", () => {
    expect(ok(ObservationPremiseSchema, premise)).toBe(true);
    for (const bad of [
      { ...premise, from: "HOST_KNOWLEDGE" },
      { ...premise, evidence_quote: "" },
      { ...premise, ref: "" },
      { ...premise, extra: 1 },
    ])
      expect(ok(ObservationPremiseSchema, bad)).toBe(false);
  });

  it("bounds the appearance: a non-empty, untrimmed-free referent and content, an anchoring basis, no attribution field", () => {
    for (const bad of [
      { ...decision().payload, referent: "" },
      { ...decision().payload, content: " padded" },
      { ...decision().payload, content: "x".repeat(501) },
      { ...decision().payload, basis: [] },
      { ...decision().payload, presented_attribution: "a seal" },
    ])
      expect(ok(ObservationPayloadSchema, bad)).toBe(false);
  });
});

describe("the retained record and its derived verdicts", () => {
  it("is a fourth referee operation whose verdicts are its own, distinct from every other operation's", () => {
    expect(REFEREE_OP_OBSERVATION).toBe("F014D_DIRECT_PERCEPTION");
    expect([...OBSERVATION_VERDICTS]).toEqual([
      "OBSERVATION_ESTABLISHED",
      "OBSERVATION_OBSTRUCTED",
      "OBSERVATION_UNRESOLVED",
      "OBSERVATION_WORLD_CONFLICT",
    ]);
    for (const v of OBSERVATION_VERDICTS) {
      expect(ok(RefereeVerdictSchema, v)).toBe(true);
      for (const other of [...I002_VERDICTS, ...IR_VERDICTS, ...PHYSICAL_VERDICTS])
        expect(other).not.toBe(v);
    }
  });

  it("accepts a valid record, and refuses a missing basis time, an extra field, a foreign verdict or a foreign decision shape", () => {
    expect(ok(RefereeDecisionRecordSchema, record())).toBe(true);
    const noTime = record();
    delete noTime.input.observed_at;
    expect(ok(RefereeDecisionRecordSchema, noTime)).toBe(false);
    expect(ok(RefereeDecisionRecordSchema, { ...record(), extra: 1 })).toBe(false);
    for (const verdict of ["PHYSICAL_ELIGIBLE", "BIND_ELIGIBLE", "CLOSED", "VISIBLE"])
      expect(ok(RefereeDecisionRecordSchema, { ...record(), verdict })).toBe(false);
    expect(
      ok(RefereeDecisionRecordSchema, {
        ...record(),
        decision: { task_id: "a".repeat(64), items: [] },
      }),
    ).toBe(false);
  });

  it("no earlier operation's record gains or needs the basis time (their serialization is unchanged)", () => {
    const earlier = {
      ...record(),
      operation: "IR_PHYSICAL_PLACEMENT",
      verdict: "PHYSICAL_ELIGIBLE",
    };
    expect(ok(RefereeDecisionRecordSchema, earlier)).toBe(false); // wrong decision shape for that operation
    const ir: any = { ...record(), operation: "IR_NATIVE_COMPATIBILITY", verdict: "BIND_ELIGIBLE" };
    expect(ok(RefereeDecisionRecordSchema, ir)).toBe(false);
  });

  it("the three roles are bound to the operation apart: gm interprets, resolver validates, archivist commits - and no other pair is accepted", () => {
    expect(OBSERVATION_RESOLVER_AUTHORITY).toEqual(RESOLVER_AUTHORITY);
    for (const validated_under of [
      { role: "role.gm", permission: "permission.rule.adjudicate" },
      { role: "role.archivist", permission: "permission.canon.write" },
      { role: "role.player", permission: "permission.player_choice.commit" },
      { role: "role.resolver", permission: "permission.canon.write" },
      { role: "persona.steward", permission: "permission.resolution.execute" },
    ])
      expect(ok(RefereeDecisionRecordSchema, { ...record(), validated_under })).toBe(false);
    const missing = record();
    delete missing.validated_under;
    expect(ok(RefereeDecisionRecordSchema, missing)).toBe(false);
  });

  it("the delivered source clauses are the pinned F-014D clauses", () => {
    for (const id of ["F014D-2", "F014D-5", "F014D-6", "F014D-18", "F014D-24"] as const) {
      expect(REFEREE_SOURCES[id].artifact).toBe(
        "https://app.notion.com/p/3e020af901e08103b81aec5f7119318e",
      );
      expect(REFEREE_SOURCES[id].native_pin).toBe("2026-09-24T16:25:17.059Z");
      expect(REFEREE_SOURCES[id].text.length).toBeGreaterThan(40);
    }
  });
});

describe("the event, packet and provenance contracts are unchanged: an observation-earned event is the same immutable event", () => {
  it("the Access Event is still the one-recipient BOUNDED_SHARED_ACCESS shape with no new field", () => {
    const e = AccessEventSchema as any;
    expect(Object.keys(e.def.in ? e.def.in.shape : (e.shape ?? e.def.shape)).sort()).toEqual([
      "channel",
      "established_at",
      "event_id",
      "mode",
      "participants",
      "payload",
      "recipient_role",
      "representation",
      "source",
    ]);
    expect(
      ok(AccessEventSchema, {
        event_id: "e1",
        mode: "BOUNDED_SHARED_ACCESS",
        participants: ["pc-1"],
        source: { owner: "world_state", fact_key: "world/w/locus/l", version: 1 },
        channel: "PERCEPTION",
        established_at: at(1),
        payload: { referent: "a patch", content: "a broad patch", presented_attribution: null },
        representation: null,
        recipient_role: "role.player_character",
        observed: true,
      }),
    ).toBe(false);
  });

  it("the packet has no field for the source, a decoding, a recognition or any engine reference; the provenance keeps them", () => {
    const packet = {
      recipient: "pc-1",
      payload: { referent: "r", content: "c" },
      presented_attribution: null,
      access: { result: "RECEIVED", channel: "PERCEPTION", established_at: at(1) },
      intelligibility: { result: "REPRESENTATION_ACCESSIBLE", basis: "NO_CAPABILITY_DEPENDENCY" },
    };
    expect(ok(AccessiblePacketSchema, packet)).toBe(true);
    for (const extra of ["source", "event", "provenance", "recognition", "verdict", "place_name"])
      expect(ok(AccessiblePacketSchema, { ...packet, [extra]: "x" }), extra).toBe(false);
    expect(
      ok(SealedEngineProvenanceSchema, {
        event: { fact_key: "access/e/event", version: 1 },
        recipient: "pc-1",
        packet: { fact_key: "access/e/packet/pc-1" },
        source: { owner: "world_state", fact_key: "world/w/locus/l", version: 1 },
        channel: "PERCEPTION",
        capability_close: null,
      }),
    ).toBe(true);
  });
});

describe("the Temporal object boundary remains strictly future for every owner", () => {
  const object = (owner: string, boundaryAt: number, resolved = 100): any => ({
    object_id: "obj-1",
    owning_ref: { owner, process_id: "p" },
    last_resolved_basis: at(resolved),
    partition: { class: "EXACT-PARTITION" },
    next_boundary: { boundary_id: "b", at: at(boundaryAt) },
    dependencies: [],
    continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
    invalidators: [],
    information_latency: { creates_epistemic_interruption: false },
  });
  it("no object, including the Epistemic owner, carries a boundary at or before its resolved basis", () => {
    expect(ok(TemporalObjectSchema, object(OWNER_EPISTEMIC_ACCESS, 100))).toBe(false);
    expect(ok(TemporalObjectSchema, object(OWNER_EPISTEMIC_ACCESS, 150))).toBe(true);
    expect(ok(TemporalObjectSchema, object(OWNER_EPISTEMIC_ACCESS, 50))).toBe(false);
    for (const owner of ["gip", "population", "temporal_kernel", "logistics", "world_state"]) {
      expect(ok(TemporalObjectSchema, object(owner, 100)), owner).toBe(false);
      expect(ok(TemporalObjectSchema, object(owner, 50)), owner).toBe(false);
      expect(ok(TemporalObjectSchema, object(owner, 150)), owner).toBe(true);
    }
  });
});
