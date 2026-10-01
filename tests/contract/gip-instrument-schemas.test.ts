// Contract evidence for the GIP Governance Instrument Core Backbone Foundation (sixteenth slice): the executable Instrument
// contract carries the WS-007 §4.1 mandatory fields exactly as the source names them — strict, explicit, uninterpreted, singular
// `operative_effect`, exact literals, order-relative validity separate from lifecycle — with every deferred surface (the §4.3
// conditional fields, addressable clauses, a multi-effect array, procedure, applicability, promulgation) unrepresentable.
// Register lineage: IA-01/IA-02 (partial), IA-03 (partial); RC-02; IM-06.
// Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-007.
import { describe, expect, it } from "vitest";
import {
  GovernanceInstrumentSchema,
  INSTRUMENT_LIFECYCLE_STATUSES,
  INSTRUMENT_OPERATIVE_EFFECTS,
  INSTRUMENT_VALIDITY_STATUSES,
  InstrumentValidityEntrySchema,
  gipInstrumentKey,
  parseInstrumentScopeBindingRef,
  parseInstrumentSourceAuthorityRef,
} from "@immortalis/contracts";
import {
  GOVERNING_ORDER_REF_A,
  GOVERNING_ORDER_REF_B,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  INSTRUMENT_A,
  OFFICE_MAGISTRATE,
  OFFICE_TREASURER,
  SCOPE_BINDING_A,
  governanceInstrument,
  officeRef,
  scopeBindingRef,
} from "@immortalis/testkit";

const instrument = (over: Record<string, unknown> = {}) => ({ ...governanceInstrument(), ...over });
const ok = (v: unknown) => GovernanceInstrumentSchema.safeParse(v).success;
const FIELDS = [
  "instrument_id",
  "source_authority_ref",
  "authority_basis_ref",
  "operative_effect",
  "scope_binding_ref",
  "validity_by_order",
  "lifecycle_status",
];

describe("the Instrument contract is the WS-007 §4.1 mandatory fields, exactly as the source names them", () => {
  it("accepts a well-formed Instrument and names exactly the seven source identifiers and nothing else", () => {
    expect(ok(instrument())).toBe(true);
    expect(Object.keys(GovernanceInstrumentSchema.shape).sort()).toEqual([...FIELDS].sort());
    // the identifiers are the source's own: singular `operative_effect`, `validity_by_order` (the source's `validity_by_order[]`)
    for (const wrong of [
      "operative_effects",
      "operativeEffect",
      "validity_by_orders",
      "validity",
      "lifecycle",
      "status",
      "legal_status",
      "institution_id",
      "office_id",
      "scope_binding_id",
    ])
      expect(ok(instrument({ [wrong]: "x" })), wrong).toBe(false);
  });

  it("carries an Instrument exactly as authored: no default, normalisation, reordering, merging or added field", () => {
    const v = instrument({
      validity_by_order: [
        { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "void" },
        { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
      ],
    });
    expect(GovernanceInstrumentSchema.parse(v)).toEqual(v);
    expect(Object.keys(GovernanceInstrumentSchema.parse(v)).sort()).toEqual([...FIELDS].sort());
  });

  it("is addressed by its canonical instrument_id alone: one key, no office, binding, order, recipient or lifecycle dimension", () => {
    expect(gipInstrumentKey("i1")).toBe("gip/instrument/i1");
    expect(gipInstrumentKey(INSTRUMENT_A)).toBe(`gip/instrument/${INSTRUMENT_A}`);
    expect(gipInstrumentKey.length).toBe(1);
  });
});

describe("every mandatory field is explicit: missing, null, empty and malformed values fail closed", () => {
  it.each(FIELDS)("an Instrument without %s is refused", (field) => {
    const v: Record<string, unknown> = instrument();
    delete v[field];
    expect(ok(v)).toBe(false);
  });

  it.each(FIELDS)(
    "an Instrument whose %s is null, empty, or of another type is refused",
    (field) => {
      for (const bad of [null, "", 0, true, {}, undefined])
        expect(ok(instrument({ [field]: bad })), String(bad)).toBe(false);
    },
  );

  it("an unmodelled field fails closed: no property bag, convenience field or discriminator", () => {
    for (const extra of [
      "note",
      "properties",
      "kind",
      "type",
      "discriminator",
      "clauses",
      "recipient_ref",
    ])
      expect(ok(instrument({ [extra]: "x" })), extra).toBe(false);
  });

  it("an authority basis is an opaque reference identity: malformed identifiers are refused, a well-formed one is never dereferenced", () => {
    expect(ok(instrument({ authority_basis_ref: "authority-basis-never-established" }))).toBe(true);
    for (const bad of ["has space", "a/b", "-lead", " x"])
      expect(ok(instrument({ authority_basis_ref: bad }))).toBe(false);
  });
});

describe("`operative_effect` is ONE singular scalar with the exact §4.2 literals", () => {
  it("is exactly the twenty source literals, in the source's order", () => {
    expect([...INSTRUMENT_OPERATIVE_EFFECTS]).toEqual([
      "obligation",
      "prohibition",
      "permission",
      "authority_grant",
      "delegation",
      "privilege",
      "entitlement",
      "immunity",
      "constitutive_creation",
      "status_change",
      "appropriation",
      "reservation",
      "appointment",
      "removal",
      "confirmation",
      "suspension",
      "repeal",
      "supersession",
      "invalidation",
      "administrative_direction",
    ]);
  });

  it.each([...INSTRUMENT_OPERATIVE_EFFECTS])("accepts the exact literal %s", (effect) => {
    expect(ok(instrument({ operative_effect: effect }))).toBe(true);
    expect(
      GovernanceInstrumentSchema.parse(instrument({ operative_effect: effect })).operative_effect,
    ).toBe(effect);
  });

  it("refuses an array, a multi-effect surrogate, an unknown literal and every normalised alias", () => {
    for (const bad of [
      ["obligation"],
      ["obligation", "prohibition"],
      [],
      { effect: "obligation" },
      "Obligation",
      "OBLIGATION",
      " obligation",
      "obligations",
      "authority-grant",
      "authority grant",
      "authorityGrant",
      "grant",
      "constitutive-creation",
      "creation",
      "admin_direction",
      "administrative direction",
      "unknown",
      "setting_specific",
      "other",
    ])
      expect(ok(instrument({ operative_effect: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("`operative_effects` (plural) fails whether it replaces or accompanies the singular field", () => {
    const v: Record<string, unknown> = instrument();
    delete v["operative_effect"];
    expect(ok({ ...v, operative_effects: ["obligation"] })).toBe(false);
    expect(ok({ ...v, operative_effects: "obligation" })).toBe(false);
    expect(ok(instrument({ operative_effects: ["obligation"] }))).toBe(false);
    expect(ok(instrument({ operative_effects: ["obligation", "prohibition"] }))).toBe(false);
  });
});

describe("validity is order-relative and separate from lifecycle, with the exact core literals", () => {
  it("the validity literals are exactly the five source literals; `void` is not `invalid`", () => {
    expect([...INSTRUMENT_VALIDITY_STATUSES]).toEqual([
      "valid",
      "invalid",
      "void",
      "contested",
      "unresolved",
    ]);
    expect(INSTRUMENT_VALIDITY_STATUSES).toContain("void");
    expect(INSTRUMENT_VALIDITY_STATUSES).toContain("invalid");
  });

  it("the lifecycle literals are exactly the eight source literals", () => {
    expect([...INSTRUMENT_LIFECYCLE_STATUSES]).toEqual([
      "proposed",
      "pending",
      "active",
      "suspended",
      "superseded",
      "repealed",
      "terminated",
      "expired",
    ]);
  });

  it.each([...INSTRUMENT_VALIDITY_STATUSES])(
    "accepts the exact validity literal %s, carried exactly",
    (status) => {
      const v = instrument({
        validity_by_order: [
          { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: status },
        ],
      });
      expect(ok(v)).toBe(true);
      expect(GovernanceInstrumentSchema.parse(v).validity_by_order[0]!.validity_status).toBe(
        status,
      );
    },
  );

  it.each([...INSTRUMENT_LIFECYCLE_STATUSES])(
    "accepts the exact lifecycle literal %s, carried exactly",
    (status) => {
      expect(
        GovernanceInstrumentSchema.parse(instrument({ lifecycle_status: status })).lifecycle_status,
      ).toBe(status);
    },
  );

  it("refuses unknown and normalised validity and lifecycle values, a catch-all and a collapsed void", () => {
    for (const bad of [
      "Valid",
      "VALID",
      "voided",
      "null_and_void",
      "nullity",
      "illegal",
      "legal",
      "in_force",
      "setting_specific",
      "",
      null,
      ["valid"],
      1,
    ])
      expect(
        ok(
          instrument({
            validity_by_order: [
              { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: bad },
            ],
          }),
        ),
        JSON.stringify(bad),
      ).toBe(false);
    for (const bad of [
      "Active",
      "ACTIVE",
      "in_effect",
      "in_force",
      "enacted",
      "repealed_",
      "ended",
      "revoked",
      "withdrawn",
      "setting_specific",
      "",
      null,
      ["active"],
      1,
    ])
      expect(ok(instrument({ lifecycle_status: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("every validity literal combines with every lifecycle literal: neither dimension constrains or rewrites the other", () => {
    for (const validity of INSTRUMENT_VALIDITY_STATUSES)
      for (const lifecycle of INSTRUMENT_LIFECYCLE_STATUSES) {
        const v = instrument({
          lifecycle_status: lifecycle,
          validity_by_order: [
            { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: validity },
          ],
        });
        expect(GovernanceInstrumentSchema.parse(v)).toEqual(v);
      }
  });

  it("validity_by_order[] is an array of strict entries carrying only governing_order_ref and validity_status", () => {
    expect(Object.keys(InstrumentValidityEntrySchema.shape).sort()).toEqual([
      "governing_order_ref",
      "validity_status",
    ]);
    const entry = { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" };
    expect(InstrumentValidityEntrySchema.safeParse(entry).success).toBe(true);
    for (const extra of [
      { lifecycle_status: "active" },
      { reason: "x" },
      { order: "x" },
      { governing_order: "x" },
      { status: "valid" },
    ])
      expect(
        InstrumentValidityEntrySchema.safeParse({ ...entry, ...extra }).success,
        JSON.stringify(extra),
      ).toBe(false);
    for (const missing of ["governing_order_ref", "validity_status"]) {
      const e: Record<string, unknown> = { ...entry };
      delete e[missing];
      expect(InstrumentValidityEntrySchema.safeParse(e).success, missing).toBe(false);
    }
    // an entry list, never a single object, a map or a scalar
    for (const bad of [
      entry,
      { [GOVERNING_ORDER_REF_A]: "valid" },
      "valid",
      [[entry]],
      [entry, "x"],
      null,
    ])
      expect(ok(instrument({ validity_by_order: bad })), JSON.stringify(bad)).toBe(false);
  });

  it("one Instrument carries several orders' validity inside itself: valid under one order, void under another, unresolved under a third", () => {
    const v = instrument({
      validity_by_order: [
        { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
        { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "void" },
        { governing_order_ref: "governing-order-ref-c-1", validity_status: "unresolved" },
      ],
    });
    expect(GovernanceInstrumentSchema.parse(v)).toEqual(v);
  });

  it("fails closed on an empty validity array and on two entries for one governing order (order-relative: one order, one authored status)", () => {
    expect(ok(instrument({ validity_by_order: [] }))).toBe(false);
    expect(
      ok(
        instrument({
          validity_by_order: [
            { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
            { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "invalid" },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      ok(
        instrument({
          validity_by_order: [
            { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
            { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe("the WS-007 §4.3 conditional fields and §4.4 clauses are unsupported in this slice and fail closed", () => {
  const CONDITIONAL = [
    "activation_condition",
    "effective_from",
    "sunset_condition",
    "renewal_rule",
    "implementation_assignment_ref",
    "administrative_path_ref",
    "sanction_or_remedy",
    "institutional_promulgation_or_publication_requirement",
    "promulgation_act_ref",
    "individual_notice_requirement_ref",
    "appeal_review_override",
    "predecessor_instrument_ref",
    "supersession_ref",
    "provenance_note",
  ];
  it.each(CONDITIONAL)(
    "an Instrument carrying %s is refused, never ignored, renamed or carried",
    (field) => {
      for (const value of ["x-ref-1", "authored text", ["x-ref-1"], { a: 1 }, null])
        expect(ok(instrument({ [field]: value })), `${field}=${JSON.stringify(value)}`).toBe(false);
      expect(
        GovernanceInstrumentSchema.safeParse(instrument({ [field]: "x-ref-1" })).error?.issues[0]
          ?.code,
      ).toBe("unrecognized_keys");
    },
  );

  it("an addressable-clause or multi-effect surrogate is refused: no `clauses`, `clause_refs`, `effects`, `operative_effects` or per-clause validity exists", () => {
    for (const extra of [
      "clauses",
      "clause_refs",
      "clause_id",
      "effects",
      "operative_effects",
      "sub_instruments",
    ])
      expect(ok(instrument({ [extra]: [{ operative_effect: "obligation" }] })), extra).toBe(false);
  });

  it("no procedure, vote, calculation, applicability, promulgation, dissemination, Reach, implementation or compliance field exists", () => {
    for (const extra of [
      "procedure",
      "vote",
      "enacted_by",
      "decision_ref",
      "calculated_validity",
      "current_force",
      "applicability",
      "applies",
      "promulgated",
      "disseminated",
      "awareness",
      "reach",
      "implemented",
      "compliance",
    ])
      expect(ok(instrument({ [extra]: "x" })), extra).toBe(false);
  });
});

describe("source_authority_ref and scope_binding_ref are exact addresses, and the binding must belong to the same authority", () => {
  it("source_authority_ref is exactly one office address: institution and office identities, nothing else", () => {
    expect(parseInstrumentSourceAuthorityRef(officeRef())).toEqual({
      institution_id: INSTITUTION_COURT,
      office_id: OFFICE_MAGISTRATE,
    });
    for (const bad of [
      "",
      OFFICE_MAGISTRATE,
      INSTITUTION_COURT,
      `gip/institution/${INSTITUTION_COURT}/identity`,
      `${officeRef()}/`,
      `${officeRef()}/x`,
      scopeBindingRef(),
      `gip/instrument/${INSTRUMENT_A}`,
      `gip/institution/${INSTITUTION_COURT}/office/`,
      `gip/institution//office/${OFFICE_MAGISTRATE}`,
      ` ${officeRef()}`,
      `${officeRef()}\n`,
      officeRef().toUpperCase(),
    ]) {
      expect(parseInstrumentSourceAuthorityRef(bad), JSON.stringify(bad)).toBeUndefined();
      expect(ok(instrument({ source_authority_ref: bad })), JSON.stringify(bad)).toBe(false);
    }
  });

  it("scope_binding_ref is exactly one Scope Binding address: its office address and its scope_binding_id", () => {
    expect(parseInstrumentScopeBindingRef(scopeBindingRef())).toEqual({
      institution_id: INSTITUTION_COURT,
      office_id: OFFICE_MAGISTRATE,
      scope_binding_id: SCOPE_BINDING_A,
    });
    for (const bad of [
      "",
      SCOPE_BINDING_A,
      officeRef(),
      `${scopeBindingRef()}/`,
      `${scopeBindingRef()}/x`,
      ` ${scopeBindingRef()}`,
    ]) {
      expect(parseInstrumentScopeBindingRef(bad), JSON.stringify(bad)).toBeUndefined();
      expect(ok(instrument({ scope_binding_ref: bad })), JSON.stringify(bad)).toBe(false);
    }
  });

  it("a Scope Binding of a different office or institution than the source authority is refused: no cross-authority binding", () => {
    expect(
      ok(instrument({ scope_binding_ref: scopeBindingRef(INSTITUTION_COURT, OFFICE_TREASURER) })),
    ).toBe(false);
    expect(
      ok(instrument({ scope_binding_ref: scopeBindingRef(INSTITUTION_GUILD, OFFICE_MAGISTRATE) })),
    ).toBe(false);
    expect(
      ok(instrument({ source_authority_ref: officeRef(INSTITUTION_COURT, OFFICE_TREASURER) })),
    ).toBe(false);
    expect(
      ok(
        instrument({
          source_authority_ref: officeRef(INSTITUTION_GUILD, OFFICE_TREASURER),
          scope_binding_ref: scopeBindingRef(INSTITUTION_GUILD, OFFICE_TREASURER),
        }),
      ),
    ).toBe(true);
    // a binding whose office id merely starts like the authority's is a different authority
    expect(
      ok(
        instrument({
          scope_binding_ref: scopeBindingRef(INSTITUTION_COURT, `${OFFICE_MAGISTRATE}-2`),
        }),
      ),
    ).toBe(false);
  });
});
