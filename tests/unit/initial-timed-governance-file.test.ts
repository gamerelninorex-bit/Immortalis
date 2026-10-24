/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate raw governance documents */
// The identity of a confirmed governance proposal is a pure function of the authored content and the campaign: the same proposal always
// reaches the same publication identities (so a retry converges), and any change reaches different ones (so a different choice is never
// mistaken for the committed one). The file is read once, strictly: exactly the unchanged GIP records, with nothing added, defaulted,
// relaxed or inferred, and every expected value is written out independently of the GIP adapter.
import { chmodSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GovernanceInstrumentSchema,
  InstitutionIdentitySchema,
  ScopeBindingSchema,
  SunsetEnrollmentSchema,
  OfficeAuthorityLocusHolderSchema,
  OfficeAuthorityLocusDecisionBodySchema,
} from "@immortalis/contracts";
import {
  expectedEnrollment,
  initialTimedGovernanceId,
  readInitialTimedGovernanceFile,
} from "@immortalis/operator";
import {
  T_OPEN,
  T_SUNSET,
  governanceDoc,
  writeGovernance,
} from "../support/initial-timed-governance.ts";

const read = (d: unknown) => {
  const r = readInitialTimedGovernanceFile(writeGovernance(d));
  if (!r.ok) throw new Error(`not valid: ${r.error.code} ${JSON.stringify(r.error.details)}`);
  return r.value;
};
const refused = (d: unknown, mode?: number) =>
  readInitialTimedGovernanceFile(writeGovernance(d, mode));

describe("initialTimedGovernanceId", () => {
  it("is deterministic, 128 bits of hex, and independent of object key order", () => {
    const a = initialTimedGovernanceId("c1", read(governanceDoc()));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(initialTimedGovernanceId("c1", read(governanceDoc()))).toBe(a);
    const d = governanceDoc();
    const reordered = Object.fromEntries(Object.entries(d).reverse());
    expect(initialTimedGovernanceId("c1", read(reordered))).toBe(a);
  });

  const changes: [string, (d: any) => void][] = [
    ["the publication basis", (d) => (d.publication.basis = "other")],
    ["the publication secrecy", (d) => (d.publication.secrecy = "other")],
    [
      "the canonical time",
      (d) => {
        d.canonical_time.value += 1;
      },
    ],
    ["the institution label", (d) => (d.institution.identity_label = "Other")],
    ["an omitted constitutive source", (d) => delete d.institution.constitutive_source_ref],
    ["an office power", (d) => d.office.powers.push("One more.")],
    [
      "the office reference branch",
      (d) => {
        delete d.office.holder_ref;
        d.office.decision_body_ref = "decision-body-ref-x";
      },
    ],
    [
      "a binding exception reference",
      (d) => d.scope_binding.exception_refs.push("exception-ref-x"),
    ],
    ["an omitted binding inheritance rule", (d) => delete d.scope_binding.inheritance_rule],
    ["the operative effect", (d) => (d.instrument.operative_effect = "obligation")],
    ["a validity entry", (d) => (d.instrument.validity_by_order[0].validity_status = "void")],
    ["the sunset", (d) => (d.instrument.sunset_condition.value += 1)],
    [
      "an authored predecessor",
      (d) => (d.instrument.predecessor_instrument_ref = "instrument-ref-x"),
    ],
  ];
  for (const [name, change] of changes)
    it(`changes with ${name}`, () => {
      const base = initialTimedGovernanceId("c1", read(governanceDoc()));
      const doc = governanceDoc();
      change(doc);
      expect(initialTimedGovernanceId("c1", read(doc))).not.toBe(base);
    });

  it("changes with the campaign", () => {
    expect(initialTimedGovernanceId("c1", read(governanceDoc()))).not.toBe(
      initialTimedGovernanceId("c2", read(governanceDoc())),
    );
  });
});

describe("readInitialTimedGovernanceFile accepts exactly the unchanged strict GIP records", () => {
  it("returns exactly what was authored, and the owner schemas have exactly their unchanged fields", () => {
    const doc = governanceDoc();
    const got = read(doc);
    expect(got.institution).toEqual(doc.institution);
    expect(got.office).toEqual(doc.office);
    expect(got.scope_binding).toEqual(doc.scope_binding);
    expect(got.instrument).toEqual(doc.instrument);
    expect(got.canonical_time).toEqual(T_OPEN);
    expect(got.publication).toEqual(doc.publication);

    // the frozen shapes, written out independently of the contract modules
    const keys = (s: { shape: Record<string, unknown> }) => Object.keys(s.shape).sort();
    expect(keys(OfficeAuthorityLocusHolderSchema as any)).toEqual(
      [
        "authority_source_ref",
        "competence_scope",
        "duties",
        "holder_ref",
        "institution_id",
        "office_id",
        "powers",
        "removal_rule",
        "selection_rule",
        "succession_rule",
      ].sort(),
    );
    expect(keys(OfficeAuthorityLocusDecisionBodySchema as any)).toContain("decision_body_ref");
    expect(keys(OfficeAuthorityLocusDecisionBodySchema as any)).not.toContain("holder_ref");
    expect(keys(InstitutionIdentitySchema as any)).toEqual(
      ["constitutive_source_ref", "continuity_status", "identity_label", "institution_id"].sort(),
    );
    expect(keys(ScopeBindingSchema as any)).toEqual(
      [
        "exception_refs",
        "inheritance_rule",
        "institution_id",
        "office_id",
        "priority_or_conflict_rule_ref",
        "scope_binding_id",
        "scope_ref",
        "scope_type",
        "target_condition",
      ].sort(),
    );
    expect(keys(GovernanceInstrumentSchema as any)).toEqual(
      [
        "authority_basis_ref",
        "instrument_id",
        "lifecycle_status",
        "operative_effect",
        "predecessor_instrument_ref",
        "scope_binding_ref",
        "source_authority_ref",
        "sunset_condition",
        "validity_by_order",
      ].sort(),
    );
    expect(keys(SunsetEnrollmentSchema as any)).toEqual(
      ["basis_time", "instrument_id", "sunset_at"].sort(),
    );
    expect(SunsetEnrollmentSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(GovernanceInstrumentSchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it("does not default a missing publication label, canonical time, validity array, lifecycle, sunset or format", () => {
    const mutations: ((d: any) => void)[] = [
      (d) => delete d.publication.basis,
      (d) => delete d.publication.secrecy,
      (d) => delete d.canonical_time,
      (d) => delete d.instrument.validity_by_order,
      (d) => delete d.instrument.lifecycle_status,
      (d) => delete d.instrument.sunset_condition,
      (d) => delete d.format,
      (d) => delete d.office.selection_rule,
    ];
    for (const m of mutations) {
      const d = governanceDoc();
      m(d);
      expect(refused(d)).toMatchObject({ ok: false, error: { code: "INVALID_GOVERNANCE" } });
    }
  });

  it("derives GIP's enrollment receipt independently: the Instrument, its exact sunset and the opening time", () => {
    const doc = read(governanceDoc());
    const receipt = expectedEnrollment(doc);
    expect(SunsetEnrollmentSchema.safeParse(receipt).success).toBe(true);
    expect(receipt).toEqual({
      instrument_id: doc.instrument.instrument_id,
      sunset_at: T_SUNSET,
      basis_time: T_OPEN,
    });
  });

  it("carries an explicitly authored empty validity array and repeated governing orders exactly as authored", () => {
    const d = governanceDoc();
    d.instrument.validity_by_order = [];
    expect(read(d).instrument.validity_by_order).toEqual([]);
    d.instrument.validity_by_order = [
      { governing_order_ref: "order-a", validity_status: "valid" },
      { governing_order_ref: "order-a", validity_status: "void" },
    ];
    expect(read(d).instrument.validity_by_order).toHaveLength(2);
  });
});

describe("a file that is not trustworthy is never read as a proposal", () => {
  it("a file others can write, a link, a directory and a missing file", () => {
    const writable = writeGovernance(governanceDoc(), 0o666);
    chmodSync(writable, 0o666);
    expect(readInitialTimedGovernanceFile(writable)).toMatchObject({
      ok: false,
      error: { code: "GOVERNANCE_FILE_UNTRUSTED" },
    });
    const real = writeGovernance(governanceDoc());
    const link = join(dirname(real), "link.json");
    symlinkSync(real, link);
    expect(readInitialTimedGovernanceFile(link)).toMatchObject({
      ok: false,
      error: { code: "GOVERNANCE_FILE_UNREADABLE" },
    });
    expect(readInitialTimedGovernanceFile(dirname(real))).toMatchObject({
      ok: false,
      error: { code: "GOVERNANCE_FILE_UNTRUSTED" },
    });
    expect(readInitialTimedGovernanceFile(join(dirname(real), "absent.json"))).toMatchObject({
      ok: false,
      error: { code: "GOVERNANCE_FILE_UNREADABLE" },
    });
  });

  it("a group-writable file and a file larger than an opening can be", () => {
    const f = writeGovernance(governanceDoc());
    chmodSync(f, 0o620);
    expect(readInitialTimedGovernanceFile(f)).toMatchObject({
      ok: false,
      error: { code: "GOVERNANCE_FILE_UNTRUSTED" },
    });
    const big = join(dirname(writeGovernance(governanceDoc())), "big.json");
    writeFileSync(big, " ".repeat(70_000) + JSON.stringify(governanceDoc()));
    chmodSync(big, 0o600);
    expect(readInitialTimedGovernanceFile(big)).toMatchObject({
      ok: false,
      error: { code: "INVALID_GOVERNANCE" },
    });
  });
});
