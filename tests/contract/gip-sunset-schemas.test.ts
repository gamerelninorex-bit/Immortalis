// Contract evidence for the GIP Governance Instrument Sunset Foundation (GIP sunset bounded slice): the strict Governance Instrument
// gains the one optional WS-007 §4.3 conditional field `sunset_condition`, encoded ONLY as an exact `CanonicalTime` instant, beside the
// twenty-first slice's `predecessor_instrument_ref` and no other §4.3 field. The two earlier historical value classes stay available,
// unchanged. The enrollment receipt is GIP's own strict record. Register lineage: IA-01 (partial), IA-02 (partial), IA-03 (partial);
// RC-02, RC-10; IM-06. Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-007.
import { describe, expect, it } from "vitest";
import {
  CanonicalTimeSchema,
  GIP_SUNSET_ENROLLMENT_KEY,
  GovernanceInstrumentCoreSchema,
  GovernanceInstrumentPredecessorSchema,
  GovernanceInstrumentSchema,
  InstrumentSunsetCondition,
  SunsetEnrollmentSchema,
  gipSunsetBoundaryId,
  gipSunsetObjectId,
  gipSunsetProcessId,
  gipSunsetRegistrationGroupId,
  gipSunsetRegistrationIntentId,
  gipSunsetStage,
  StageKeySchema,
  TemporalObjectSchema,
} from "@immortalis/contracts";
import {
  INSTRUMENT_A,
  governanceInstrument,
  governanceInstrumentWithPredecessor,
} from "@immortalis/testkit";
import { SUNSET_AT, SUNSET_START, at, sunsetInstrument } from "../support/gip-sunset.ts";
import { gipSunsetTemporalObject } from "@immortalis/engine";

const ok = (v: unknown) => GovernanceInstrumentSchema.safeParse(v).success;

describe("sunset_condition is one optional exact CanonicalTime instant and nothing else", () => {
  it("an Instrument without it is unchanged, and omission means absence (no default is synthesized)", () => {
    const r = GovernanceInstrumentSchema.safeParse(governanceInstrument());
    expect(r.success).toBe(true);
    if (r.success) {
      expect("sunset_condition" in r.data).toBe(false);
      expect(JSON.stringify(r.data)).toBe(JSON.stringify(governanceInstrument()));
    }
  });

  it("an Instrument carrying one exact instant parses and is returned exactly as authored", () => {
    const authored = sunsetInstrument();
    const r = GovernanceInstrumentSchema.safeParse(authored);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual(authored);
      expect(r.data.sunset_condition).toEqual(SUNSET_AT);
      expect(JSON.stringify(r.data)).toBe(JSON.stringify(authored));
    }
    // it composes with the one other implemented §4.3 field without altering either
    const both = {
      ...governanceInstrumentWithPredecessor(),
      sunset_condition: SUNSET_AT,
    };
    expect(ok(both)).toBe(true);
  });

  it("the strict shape is exactly the nine-field write surface: the seven core fields stay required, the two §4.3 fields optional", () => {
    expect(Object.keys(GovernanceInstrumentSchema.shape).sort()).toEqual([
      "authority_basis_ref",
      "instrument_id",
      "lifecycle_status",
      "operative_effect",
      "predecessor_instrument_ref",
      "scope_binding_ref",
      "source_authority_ref",
      "sunset_condition",
      "validity_by_order",
    ]);
    for (const k of [
      "instrument_id",
      "source_authority_ref",
      "authority_basis_ref",
      "operative_effect",
      "scope_binding_ref",
      "validity_by_order",
      "lifecycle_status",
    ]) {
      const v: Record<string, unknown> = sunsetInstrument();
      delete v[k];
      expect(ok(v), k).toBe(false);
    }
  });

  it("the encoding is the existing CanonicalTime semantics, reused (not a new calendar, duration or condition language)", () => {
    expect(InstrumentSunsetCondition).toBe(CanonicalTimeSchema);
  });

  it.each([
    ["a natural-language date", "the first day of spring"],
    ["an ISO date string", "2027-03-01T00:00:00Z"],
    ["a bare number", 200],
    ["a duration", { unit: "fixture-time-unit", duration: 100 }],
    ["a contingent condition", { when: "the treaty is repealed" }],
    ["an externally evidenced condition", { evidence_ref: "ref-1" }],
    ["a wrapped instant", { at: { unit: "fixture-time-unit", value: 200 } }],
    ["an array of instants", [{ unit: "fixture-time-unit", value: 200 }]],
    ["an extra key beside the instant", { unit: "fixture-time-unit", value: 200, calendar: "x" }],
    ["a fractional instant", { unit: "fixture-time-unit", value: 200.5 }],
    ["a negative instant", { unit: "fixture-time-unit", value: -1 }],
    ["an unset unit", { value: 200 }],
    ["null", null],
    ["an explicit undefined", undefined],
  ])("%s is not a sunset condition and fails closed", (_name, value) => {
    expect(ok({ ...sunsetInstrument(), sunset_condition: value }), _name).toBe(false);
  });

  it("every OTHER §4.3 conditional field stays unrepresentable, beside a sunset condition too", () => {
    for (const field of [
      "activation_condition",
      "effective_from",
      "renewal_rule",
      "implementation_assignment_ref",
      "administrative_path_ref",
      "sanction_or_remedy",
      "institutional_promulgation_or_publication_requirement",
      "promulgation_act_ref",
      "individual_notice_requirement_ref",
      "appeal_review_override",
      "supersession_ref",
      "provenance_note",
      "expires_at",
      "sunset",
      "valid_until",
      "status",
    ]) {
      expect(ok({ ...sunsetInstrument(), [field]: "x-ref-1" }), field).toBe(false);
      expect(ok({ ...sunsetInstrument(), [field]: SUNSET_AT }), field).toBe(false);
    }
  });

  it("the source identifier is reproduced verbatim: no renamed, plural or aliased form", () => {
    for (const alias of ["sunset_conditions", "sunsetCondition", "sunset_at", "sunset_time"]) {
      expect(ok({ ...sunsetInstrument(), [alias]: SUNSET_AT }), alias).toBe(false);
    }
  });
});

describe("both earlier historical value classes stay exactly what they were", () => {
  it("the sixteenth-slice core-only class refuses sunset_condition and predecessor_instrument_ref", () => {
    expect(GovernanceInstrumentCoreSchema.safeParse(governanceInstrument()).success).toBe(true);
    expect(GovernanceInstrumentCoreSchema.safeParse(sunsetInstrument()).success).toBe(false);
    expect(
      GovernanceInstrumentCoreSchema.safeParse(governanceInstrumentWithPredecessor()).success,
    ).toBe(false);
  });

  it("the twenty-first-slice core-plus-predecessor class admits the reference and refuses sunset_condition", () => {
    const p = (v: unknown) => GovernanceInstrumentPredecessorSchema.safeParse(v).success;
    expect(p(governanceInstrument())).toBe(true);
    expect(p(governanceInstrumentWithPredecessor())).toBe(true);
    expect(p(sunsetInstrument())).toBe(false);
    expect(p({ ...governanceInstrumentWithPredecessor(), sunset_condition: SUNSET_AT })).toBe(
      false,
    );
    expect(Object.keys(GovernanceInstrumentPredecessorSchema.shape).sort()).toEqual([
      "authority_basis_ref",
      "instrument_id",
      "lifecycle_status",
      "operative_effect",
      "predecessor_instrument_ref",
      "scope_binding_ref",
      "source_authority_ref",
      "validity_by_order",
    ]);
  });
});

describe("GIP's enrollment receipt is one strict record with no due flag, status or result", () => {
  const receipt = { instrument_id: INSTRUMENT_A, sunset_at: SUNSET_AT, basis_time: SUNSET_START };

  it("parses exactly the three fields", () => {
    expect(SunsetEnrollmentSchema.safeParse(receipt).success).toBe(true);
    expect(Object.keys(SunsetEnrollmentSchema.shape).sort()).toEqual([
      "basis_time",
      "instrument_id",
      "sunset_at",
    ]);
    for (const k of Object.keys(receipt))
      expect(
        SunsetEnrollmentSchema.safeParse(
          Object.fromEntries(Object.entries(receipt).filter(([x]) => x !== k)),
        ).success,
        k,
      ).toBe(false);
  });

  it.each(["due", "is_due", "expired", "status", "result", "registered", "object_id", "receipt"])(
    "a %s field is refused: whether it is enrolled is the kernel's object, whether it expired is the Instrument",
    (field) => {
      expect(SunsetEnrollmentSchema.safeParse({ ...receipt, [field]: true }).success).toBe(false);
    },
  );

  it("a non-instant sunset or basis is refused", () => {
    expect(SunsetEnrollmentSchema.safeParse({ ...receipt, sunset_at: "soon" }).success).toBe(false);
    expect(SunsetEnrollmentSchema.safeParse({ ...receipt, basis_time: null }).success).toBe(false);
  });

  it("the receipt is a single fixed-key slot", () => {
    expect(GIP_SUNSET_ENROLLMENT_KEY).toBe("gip/sunset-enrollment");
  });
});

describe("GIP's Temporal identities derive from the Instrument alone", () => {
  it("the stage identity is (causal process, owner operation, prospective result) and nothing else", () => {
    const stage = gipSunsetStage(INSTRUMENT_A);
    expect(StageKeySchema.safeParse(stage).success).toBe(true);
    expect(Object.keys(stage).sort()).toEqual([
      "causal_process_id",
      "owner_operation",
      "prospective_result_id",
    ]);
    expect(stage.owner_operation.owner).toBe("gip");
    expect(stage.causal_process_id).toBe(gipSunsetProcessId(INSTRUMENT_A));
    // no horizon, source version or retry can appear in it
    expect(JSON.stringify(stage)).not.toMatch(/horizon|version|retry/);
    expect(gipSunsetStage(INSTRUMENT_A)).toEqual(stage);
    expect(gipSunsetStage("another-instrument")).not.toEqual(stage);
  });

  it("the object, boundary and registration identities are distinct per Instrument and stable across calls", () => {
    expect(gipSunsetObjectId("i-1")).not.toBe(gipSunsetObjectId("i-2"));
    expect(gipSunsetBoundaryId("i-1")).not.toBe(gipSunsetBoundaryId("i-2"));
    expect(gipSunsetRegistrationGroupId("i-1")).toBe(gipSunsetRegistrationGroupId("i-1"));
    expect(gipSunsetRegistrationIntentId("i-1")).not.toBe(gipSunsetRegistrationGroupId("i-1"));
  });

  it("the derived Temporal object is a valid RC-10 object: one earned boundary at the exact sunset, one GIP stage, exact partition", () => {
    const object = gipSunsetTemporalObject(sunsetInstrument(), SUNSET_START);
    expect(TemporalObjectSchema.safeParse(object).success).toBe(true);
    expect(object!.next_boundary).toEqual({
      boundary_id: gipSunsetBoundaryId(INSTRUMENT_A),
      at: SUNSET_AT,
    });
    expect(object!.last_resolved_basis).toEqual(SUNSET_START);
    expect(object!.owning_ref).toEqual({
      owner: "gip",
      process_id: gipSunsetProcessId(INSTRUMENT_A),
    });
    expect(object!.partition).toEqual({ class: "EXACT-PARTITION" });
    expect(object!.dependencies).toHaveLength(1);
    expect(object!.dependencies[0]!.stage).toEqual(gipSunsetStage(INSTRUMENT_A));
    expect(object!.dependencies[0]!.produces).toEqual([`gip/instrument/${INSTRUMENT_A}`]);
    expect(object!.dependencies[0]!.declares_close).toBeNull();
    expect(object!.information_latency).toEqual({ creates_epistemic_interruption: false });
    // an Instrument without a sunset earns no object
    expect(gipSunsetTemporalObject(governanceInstrument(), SUNSET_START)).toBeUndefined();
  });

  it("the object follows the sunset instant, whatever it is, and no other boundary", () => {
    const other = gipSunsetTemporalObject(sunsetInstrument(INSTRUMENT_A, at(777)), SUNSET_START);
    expect(other!.next_boundary!.at).toEqual(at(777));
  });
});
