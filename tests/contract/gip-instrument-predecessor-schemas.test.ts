// Contract evidence for the GIP Governance Instrument Predecessor Reference Foundation (twenty-first bounded slice): the strict
// Governance Instrument gains exactly one optional, singular, opaque `predecessor_instrument_ref` (WS-007 §4.3) and no other §4.3
// field. The historical sixteenth-slice core-only value shape stays available, unchanged, as the class of value the superseded
// citation may still carry. Register lineage: IA-01 (partial), IA-02 (partial), IA-03 (partial); RC-02; IM-06. Source lock:
// spec/f027/spec-lock.json (F-027 v1.0): WS-007.
import { describe, expect, it } from "vitest";
import {
  EntityId,
  GovernanceInstrumentCoreSchema,
  GovernanceInstrumentSchema,
  gipInstrumentKey,
} from "@immortalis/contracts";
import {
  GOVERNING_ORDER_REF_A,
  INSTITUTION_COURT,
  INSTRUMENT_A,
  INSTRUMENT_B,
  OFFICE_MAGISTRATE,
  PREDECESSOR_INSTRUMENT_REF_A,
  PREDECESSOR_INSTRUMENT_REF_B,
  SCOPE_BINDING_A,
  governanceInstrument,
  governanceInstrumentWithPredecessor,
  officeRef,
} from "@immortalis/testkit";

const instrument = (over: Record<string, unknown> = {}) => ({ ...governanceInstrument(), ...over });
const ok = (v: unknown) => GovernanceInstrumentSchema.safeParse(v).success;
const okCore = (v: unknown) => GovernanceInstrumentCoreSchema.safeParse(v).success;

describe("the optional predecessor_instrument_ref is the one added WS-007 §4.3 field", () => {
  it("the core-only Instrument still parses, and omission means absence: no default is synthesized", () => {
    const r = GovernanceInstrumentSchema.safeParse(governanceInstrument());
    expect(r.success).toBe(true);
    if (r.success) {
      expect("predecessor_instrument_ref" in r.data).toBe(false);
      expect(Object.keys(r.data)).toEqual(Object.keys(governanceInstrument()));
      // the parse reproduces the authored bytes exactly
      expect(JSON.stringify(r.data)).toBe(JSON.stringify(governanceInstrument()));
    }
  });

  it("an Instrument carrying one authored reference parses and is returned exactly as authored", () => {
    const authored = governanceInstrumentWithPredecessor();
    const r = GovernanceInstrumentSchema.safeParse(authored);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual(authored);
      expect(r.data.predecessor_instrument_ref).toBe(PREDECESSOR_INSTRUMENT_REF_A);
      expect(JSON.stringify(r.data)).toBe(JSON.stringify(authored));
    }
  });

  it("the strict shape is the eight-field Twenty-First-slice surface plus the sunset slice's sunset_condition; the seven core fields stay required", () => {
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
      const v: Record<string, unknown> = governanceInstrumentWithPredecessor();
      delete v[k];
      expect(ok(v), k).toBe(false);
    }
  });

  it("the reference is carried verbatim: no alias, normalisation, expansion, trimming, case-folding or derived surrogate", () => {
    for (const ref of ["Instrument-1", "NS:Law.1_a-b", "a", "0", "x".repeat(40), "ns:law.."]) {
      const r = GovernanceInstrumentSchema.safeParse(
        instrument({ predecessor_instrument_ref: ref }),
      );
      expect(r.success, ref).toBe(true);
      if (r.success) expect(r.data.predecessor_instrument_ref).toBe(ref);
    }
  });

  it("the reference is carried whatever it names: another Instrument's id, its own id or nothing that exists", () => {
    for (const ref of [INSTRUMENT_B, INSTRUMENT_A, "instrument-that-does-not-exist-9", "x:y"])
      expect(ok(instrument({ predecessor_instrument_ref: ref })), ref).toBe(true);
  });
});

describe("the reference uses the existing canonical opaque-reference representation (EntityId) and is singular", () => {
  it("accepts exactly what EntityId accepts and refuses exactly what it refuses (no narrowed or widened rule)", () => {
    for (const v of [
      PREDECESSOR_INSTRUMENT_REF_A,
      INSTRUMENT_A,
      "any-referent-kind",
      "",
      " padded",
      "two words",
      "a/b",
      officeRef(),
      "-leading",
      7,
      true,
      {},
    ])
      expect(ok(instrument({ predecessor_instrument_ref: v })), JSON.stringify(v)).toBe(
        EntityId.safeParse(v).success,
      );
  });

  it("a malformed or non-reference value fails closed: null, undefined, empty, padded, structured, numeric, boolean", () => {
    for (const bad of [
      null,
      undefined,
      "",
      " c",
      "c ",
      "two words",
      "a/b",
      7,
      true,
      {},
      { id: "c" },
    ])
      expect(ok(instrument({ predecessor_instrument_ref: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("an explicit undefined is refused rather than carried as a second form of absence", () => {
    expect(ok({ ...governanceInstrument(), predecessor_instrument_ref: undefined })).toBe(false);
  });

  it("the field is singular: arrays (empty, one, many) and map / object surrogates fail closed", () => {
    for (const bad of [
      [],
      [PREDECESSOR_INSTRUMENT_REF_A],
      [PREDECESSOR_INSTRUMENT_REF_A, PREDECESSOR_INSTRUMENT_REF_B],
      { instrument_id: PREDECESSOR_INSTRUMENT_REF_A },
      { ref: PREDECESSOR_INSTRUMENT_REF_A },
      { [PREDECESSOR_INSTRUMENT_REF_A]: true },
    ])
      expect(ok(instrument({ predecessor_instrument_ref: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("renamed, plural and aliased forms fail closed (the exact identifier is the only one)", () => {
    for (const alias of [
      "predecessor_instrument_refs",
      "predecessor_instrument_ids",
      "predecessor_instrument_id",
      "predecessor_instruments",
      "predecessor_instrument",
      "predecessor_ref",
      "predecessor_refs",
      "predecessor_id",
      "predecessor_ids",
      "predecessorInstrumentRef",
      "predecessor-instrument-ref",
      "PredecessorInstrumentRef",
      "previous_instrument_ref",
      "prior_instrument_ref",
      "replaces_ref",
      "replaced_instrument_ref",
      "supersedes_ref",
      "amends_instrument_ref",
      "parent_instrument_ref",
      "successor_instrument_ref",
      "instrument_ref",
    ])
      for (const value of [PREDECESSOR_INSTRUMENT_REF_A, [PREDECESSOR_INSTRUMENT_REF_A]])
        expect(ok(instrument({ [alias]: value })), `${alias}=${JSON.stringify(value)}`).toBe(false);
  });
});

describe("the historical sixteenth-slice core shape stays exactly the seven §4.1 fields", () => {
  it("a core-only Instrument conforms to the historical shape, and the historical shape refuses predecessor_instrument_ref", () => {
    expect(okCore(governanceInstrument())).toBe(true);
    expect(Object.keys(GovernanceInstrumentCoreSchema.shape).sort()).toEqual([
      "authority_basis_ref",
      "instrument_id",
      "lifecycle_status",
      "operative_effect",
      "scope_binding_ref",
      "source_authority_ref",
      "validity_by_order",
    ]);
    for (const ref of [PREDECESSOR_INSTRUMENT_REF_A, "x", null, undefined, [], {}]) {
      expect(okCore(instrument({ predecessor_instrument_ref: ref })), JSON.stringify(ref)).toBe(
        false,
      );
      expect(
        GovernanceInstrumentCoreSchema.safeParse(instrument({ predecessor_instrument_ref: ref }))
          .error?.issues[0]?.code,
      ).toBe("unrecognized_keys");
    }
  });

  it("everything the historical shape accepts the current shape accepts too (the successor only adds the optional field)", () => {
    for (const v of [
      governanceInstrument(),
      instrument({ validity_by_order: [] }),
      instrument({
        validity_by_order: [
          { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
          { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "invalid" },
        ],
      }),
      instrument({ operative_effect: "repeal", lifecycle_status: "repealed" }),
    ]) {
      expect(okCore(v)).toBe(true);
      expect(ok(v)).toBe(true);
    }
  });
});

// (`sunset_condition` is no longer in this list: the sunset slice added it as an exact CanonicalTime instant only, and the
// twenty-first-slice class of value, GovernanceInstrumentPredecessorSchema, still refuses it: gip-sunset-schemas.test.ts)
describe("every other §4.3 conditional field and every §4.4 clause stays unrepresentable beside a predecessor reference", () => {
  const withRef = (over: Record<string, unknown>) =>
    instrument({ predecessor_instrument_ref: PREDECESSOR_INSTRUMENT_REF_A, ...over });

  it.each([
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
  ])("%s is refused, alone or beside predecessor_instrument_ref", (field) => {
    for (const value of ["x-ref-1", "authored text", ["x-ref-1"], { a: 1 }, null]) {
      expect(ok(instrument({ [field]: value })), `${field}=${JSON.stringify(value)}`).toBe(false);
      expect(ok(withRef({ [field]: value })), `${field}=${JSON.stringify(value)}`).toBe(false);
    }
    expect(
      GovernanceInstrumentSchema.safeParse(withRef({ [field]: "x-ref-1" })).error?.issues[0]?.code,
    ).toBe("unrecognized_keys");
  });

  it("clause and multi-effect surrogates stay unrepresentable beside a predecessor reference", () => {
    for (const extra of [
      "clauses",
      "clause_refs",
      "clause_id",
      "effects",
      "operative_effects",
      "sub_instruments",
    ])
      expect(ok(withRef({ [extra]: [{ operative_effect: "obligation" }] })), extra).toBe(false);
  });

  it("every authored lifecycle value is accepted exactly as before (the reference neither requires nor implies one), and the same-authority cross-check still holds beside it", () => {
    for (const lifecycle_status of ["proposed", "active", "superseded", "repealed", "expired"])
      expect(ok(withRef({ lifecycle_status })), lifecycle_status).toBe(true);
    expect(
      ok(
        withRef({
          scope_binding_ref: `${officeRef("institution-other-1", OFFICE_MAGISTRATE)}/scope-binding/${SCOPE_BINDING_A}`,
        }),
      ),
    ).toBe(false);
  });
});

describe("the reference is not an identity dimension: the key is derived from instrument_id alone", () => {
  it("the key is identical with the reference absent, present or different", () => {
    const key = gipInstrumentKey(INSTRUMENT_A);
    expect(key).toBe(`gip/instrument/${INSTRUMENT_A}`);
    for (const v of [
      governanceInstrument(),
      governanceInstrumentWithPredecessor(INSTRUMENT_A, PREDECESSOR_INSTRUMENT_REF_A),
      governanceInstrumentWithPredecessor(INSTRUMENT_A, PREDECESSOR_INSTRUMENT_REF_B),
      governanceInstrumentWithPredecessor(INSTRUMENT_A, INSTRUMENT_B, INSTITUTION_COURT),
    ]) {
      const r = GovernanceInstrumentSchema.safeParse(v);
      expect(r.success).toBe(true);
      if (r.success) expect(gipInstrumentKey(r.data.instrument_id)).toBe(key);
    }
  });
});
