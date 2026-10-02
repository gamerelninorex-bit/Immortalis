/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary values */
// Diplomacy Externalized Claim / Dispute Core Backbone Foundation (eighteenth slice) — the strict executable contract of the
// WS-008 §7 minimum claim / dispute entry plus the v1.1 repair overlay (§29.3 dependency_refs[], §29.4 effect_on). Every
// identifier is the source's own, reproduced exactly; status is NOT a closed enum; communicated_position_entries[] has no
// invented entry schema; no array minimum, uniqueness or deduplication is invented; effect_on is never defaulted.
// Register lineage: IA-01, IA-02 (partial). Source lock: spec/f027/spec-lock.json: WS-008.
import { describe, expect, it } from "vitest";
import {
  EFFECT_ON_VALUES,
  ExternalizedClaimDisputeSchema,
  FACET_DIPLOMACY_EXTERNALIZED_CLAIM_DISPUTE,
  OWNER_DIPLOMACY,
  diplomacyDisputeKey,
  disputeDependencyKeys,
} from "@immortalis/contracts";
import {
  DISPUTE_A,
  externalizedClaimDispute,
  fullExternalizedClaimDispute,
} from "@immortalis/testkit";

/** WS-008 §7 and §29.3 / §29.4, copied verbatim from the frozen source text (independent of the contract's own constants). */
const SOURCE_REQUIRED = [
  "dispute_id",
  "party_refs",
  "underlying_subject_ref",
  "communicated_position_entries",
  "status",
  "provenance_ref",
];
const SOURCE_OPTIONAL = [
  "requested_remedy_or_demand",
  "interpretation_issue_ref",
  "instrument_or_clause_ref",
  "adjudication_basis_ref",
];
const SOURCE_CONDITIONAL = ["dependency_refs", "effect_on"];
const SOURCE_EFFECT_ON = ["issuance", "addressee_receipt", "instrument_or_setting_specified"];

const parses = (v: unknown) => ExternalizedClaimDisputeSchema.safeParse(v).success;
const dispute = (over: Record<string, unknown> = {}) =>
  externalizedClaimDispute(DISPUTE_A, over as never);

describe("the contract reproduces the WS-008 identifiers verbatim (IA-01)", () => {
  it("the schema's fields are exactly the source's six required, four optional and two conditional fields", () => {
    expect(Object.keys(ExternalizedClaimDisputeSchema.shape).sort()).toEqual(
      [...SOURCE_REQUIRED, ...SOURCE_OPTIONAL, ...SOURCE_CONDITIONAL].sort(),
    );
  });

  it("the owner is the existing Diplomacy owner, with one Claim / Dispute facet and a key from dispute_id alone", () => {
    expect(OWNER_DIPLOMACY).toBe("diplomacy");
    expect(FACET_DIPLOMACY_EXTERNALIZED_CLAIM_DISPUTE).toBe("diplomacy_externalized_claim_dispute");
    expect(diplomacyDisputeKey("d1")).toBe("diplomacy/dispute/d1");
  });

  it("the fixed effect_on literals are exactly the source's three, and no other", () => {
    expect([...EFFECT_ON_VALUES]).toEqual(SOURCE_EFFECT_ON);
  });
});

describe("a complete dispute is carried exactly as authored (IA-02)", () => {
  it("the minimum record (every required field, no optional or conditional field) parses and round-trips unchanged", () => {
    const v = dispute();
    const out = ExternalizedClaimDisputeSchema.parse(v);
    expect(out).toEqual(v);
    expect(Object.keys(out).sort()).toEqual([...SOURCE_REQUIRED].sort());
  });

  it("each optional §7 field round-trips both present and absent, without default synthesis", () => {
    const full = fullExternalizedClaimDispute();
    expect(ExternalizedClaimDisputeSchema.parse(full)).toEqual(full);
    for (const f of SOURCE_OPTIONAL) expect((full as any)[f], f).toBeDefined();
    const bare = ExternalizedClaimDisputeSchema.parse(dispute()) as any;
    for (const f of [...SOURCE_OPTIONAL, ...SOURCE_CONDITIONAL])
      expect(f in bare, `bare ${f}`).toBe(false);
    // each may be present without the others
    const values: Record<string, unknown> = {
      requested_remedy_or_demand: "a remedy",
      interpretation_issue_ref: "issue-ref",
      instrument_or_clause_ref: "clause-ref",
      adjudication_basis_ref: "adjudication-ref",
    };
    for (const [f, v] of Object.entries(values)) {
      const one = ExternalizedClaimDisputeSchema.parse(dispute({ [f]: v })) as any;
      expect(one[f]).toEqual(v);
      for (const other of SOURCE_OPTIONAL.filter((o) => o !== f))
        expect(other in one, `${f} alone: ${other}`).toBe(false);
    }
  });

  it("every required field is required: a record missing any one fails closed", () => {
    for (const f of SOURCE_REQUIRED) {
      const v: any = dispute();
      delete v[f];
      expect(parses(v), f).toBe(false);
    }
  });

  it("an omitted optional or conditional field is absent, never an explicit undefined; a null is not a substitute for absence on the reference, array and literal fields", () => {
    for (const f of [...SOURCE_OPTIONAL, ...SOURCE_CONDITIONAL])
      expect(parses({ ...dispute(), [f]: undefined }), `${f} undefined`).toBe(false);
    for (const f of [
      "interpretation_issue_ref",
      "instrument_or_clause_ref",
      "adjudication_basis_ref",
      "dependency_refs",
      "effect_on",
    ])
      expect(parses({ ...dispute(), [f]: null }), `${f} null`).toBe(false);
  });

  it("source identifiers are never replaced by aliases or normalized names", () => {
    const aliases: Record<string, string> = {
      dispute_id: "id",
      party_refs: "parties",
      underlying_subject_ref: "subject_ref",
      communicated_position_entries: "position_entries",
      requested_remedy_or_demand: "remedy",
      interpretation_issue_ref: "interpretation_ref",
      instrument_or_clause_ref: "instrument_ref",
      adjudication_basis_ref: "adjudication_ref",
      status: "dispute_status",
      provenance_ref: "provenance",
      dependency_refs: "dependencies",
      effect_on: "effective_on",
    };
    for (const [exact, alias] of Object.entries(aliases)) {
      const v: any = fullExternalizedClaimDispute(DISPUTE_A, {
        dependency_refs: ["k"],
        effect_on: "issuance",
      });
      v[alias] = v[exact];
      delete v[exact];
      expect(parses(v), `${alias} for ${exact}`).toBe(false);
    }
    // pluralised / singularised variants
    expect(parses({ ...dispute(), party_ref: ["a"] })).toBe(false);
    expect(parses({ ...dispute(), communicated_position_entry: "x" })).toBe(false);
    expect(parses({ ...dispute(), dependency_ref: "k" })).toBe(false);
    expect(parses({ ...dispute(), underlying_subject_refs: ["a"] })).toBe(false);
  });

  it("no collateral Diplomacy construct, score or generic field is representable (strict)", () => {
    for (const extra of [
      "recognition_id",
      "relation_id",
      "relation_edge_ref",
      "channel_ref",
      "negotiation_ref",
      "instrument_ref",
      "clause_refs",
      "binding_entry_refs",
      "framework_ref",
      "receipt_event_ref",
      "dispute_score",
      "trust",
      "reputation",
      "influence",
      "private_belief",
      "future_behavior",
      "objective_truth",
      "properties",
    ])
      expect(parses({ ...dispute(), [extra]: "x" }), extra).toBe(false);
  });
});

describe("array fields keep their array shape; no cardinality, uniqueness or ordering rule is invented (IA-02)", () => {
  it("party_refs[] is an array of opaque references: empty, single, repeated and unsorted arrays are carried exactly", () => {
    for (const refs of [[], ["a"], ["a", "b"], ["a", "a"], ["b", "a", "b"]])
      expect(
        ExternalizedClaimDisputeSchema.parse(dispute({ party_refs: refs })).party_refs,
      ).toEqual(refs);
  });

  it("party_refs[] is not a singular reference and holds only references", () => {
    for (const bad of ["a", { p: "a" }, [["a"]], [1], [""], [null], [{ p: "a" }], null, undefined])
      expect(parses({ ...dispute(), party_refs: bad }), JSON.stringify(bad)).toBe(false);
  });

  it("no party class is fixed: any authored diplomatic-party reference is carried, and nothing is classified", () => {
    const refs = ["a-polity", "a-person", "faction-1", "gip/institution/i/office/o", "x y"];
    expect(ExternalizedClaimDisputeSchema.parse(dispute({ party_refs: refs })).party_refs).toEqual(
      refs,
    );
  });

  it("communicated_position_entries[] accepts any authored canonical JSON entry, carried exactly, with no entry schema, minimum, uniqueness or ordering", () => {
    const entries = [
      "an asserted position",
      "",
      " padded ",
      0,
      1.5,
      true,
      false,
      null,
      [],
      ["nested", ["list"]],
      {},
      { party: "a", act: "protest", detail: { n: 1 } },
      "an asserted position",
    ];
    for (const e of [[], [entries[0]], entries, [entries[11], entries[11]], [...entries].reverse()])
      expect(
        ExternalizedClaimDisputeSchema.parse(dispute({ communicated_position_entries: e }))
          .communicated_position_entries,
      ).toEqual(e);
  });

  it("communicated_position_entries[] is an array of canonical JSON values only", () => {
    for (const bad of ["a", { e: 1 }, null, undefined, 3, true])
      expect(parses({ ...dispute(), communicated_position_entries: bad }), String(bad)).toBe(false);
    for (const badEntry of [undefined, NaN, Infinity, new Map(), () => 1, 1n, Symbol("x")])
      expect(
        parses({ ...dispute(), communicated_position_entries: [badEntry] }),
        String(badEntry),
      ).toBe(false);
  });

  it("dependency_refs[] is conditional: absent for a purely authored baseline; when present, an array of fact keys with no invented minimum, uniqueness or deduplication", () => {
    expect(parses(dispute())).toBe(true);
    for (const refs of [[], ["k1"], ["k1", "k2"], ["k1", "k1"], ["k2", "k1", "k2"]])
      expect(
        ExternalizedClaimDisputeSchema.parse(dispute({ dependency_refs: refs })).dependency_refs,
      ).toEqual(refs);
    for (const bad of ["k1", { k: "k1" }, [["k1"]], [1], [""], [null]])
      expect(parses({ ...dispute(), dependency_refs: bad }), JSON.stringify(bad)).toBe(false);
  });

  it("the facts admission must see pinned are the distinct keys, while the authored array is untouched", () => {
    const r = ExternalizedClaimDisputeSchema.parse(
      dispute({ dependency_refs: ["k2", "k1", "k2"] }),
    );
    expect(disputeDependencyKeys(r)).toEqual(["k2", "k1"]);
    expect(r.dependency_refs).toEqual(["k2", "k1", "k2"]);
    expect(disputeDependencyKeys(ExternalizedClaimDisputeSchema.parse(dispute()))).toEqual([]);
  });
});

describe("singular fields stay singular (IA-02)", () => {
  it("underlying_subject_ref, interpretation_issue_ref, instrument_or_clause_ref, adjudication_basis_ref and provenance_ref are singular opaque references, never arrays", () => {
    for (const f of [
      "underlying_subject_ref",
      "interpretation_issue_ref",
      "instrument_or_clause_ref",
      "adjudication_basis_ref",
      "provenance_ref",
    ])
      for (const bad of [["a"], [], { ref: "a" }, "", " a", null])
        expect(
          parses({ ...fullExternalizedClaimDispute(), [f]: bad }),
          `${f} ${JSON.stringify(bad)}`,
        ).toBe(false);
  });

  it("references are opaque: any authored reference, including one naming another owner, is carried exactly", () => {
    for (const ref of ["a-subject", "gip/institution/i/office/o", "world/w/locus/l", "x y"]) {
      const out = ExternalizedClaimDisputeSchema.parse(
        fullExternalizedClaimDispute(DISPUTE_A, {
          underlying_subject_ref: ref,
          interpretation_issue_ref: ref,
          instrument_or_clause_ref: ref,
          adjudication_basis_ref: ref,
          provenance_ref: ref,
        }),
      );
      expect([
        out.underlying_subject_ref,
        out.interpretation_issue_ref,
        out.instrument_or_clause_ref,
        out.adjudication_basis_ref,
        out.provenance_ref,
      ]).toEqual([ref, ref, ref, ref, ref]);
    }
  });

  it("requested_remedy_or_demand is optional and singular: any one canonical JSON scalar or object is carried exactly, and an array is refused", () => {
    for (const ok of [
      "a remedy",
      "",
      " padded ",
      0,
      2.5,
      true,
      false,
      null,
      {},
      { demand: "a", n: [1] },
    ])
      expect(
        ExternalizedClaimDisputeSchema.parse(dispute({ requested_remedy_or_demand: ok }))
          .requested_remedy_or_demand,
        JSON.stringify(ok),
      ).toEqual(ok);
    for (const many of [[], ["a"], ["a", "b"], [{ demand: "a" }], [null]])
      expect(parses({ ...dispute(), requested_remedy_or_demand: many }), JSON.stringify(many)).toBe(
        false,
      );
    for (const bad of [undefined, NaN, Infinity, new Map(), () => 1, 1n])
      expect(parses({ ...dispute(), requested_remedy_or_demand: bad })).toBe(false);
  });

  it("dispute_id is a key-safe canonical identity; no other value is an identity dimension", () => {
    for (const bad of ["", "a/b", " a", "a b", "-a"])
      expect(parses({ ...dispute(), dispute_id: bad }), bad).toBe(false);
    expect(parses({ ...dispute(), dispute_id: ["a"] })).toBe(false);
  });
});

describe("status is required, singular and not a closed enum (IA-02)", () => {
  it("any authored singular value round-trips exactly: open named values, any casing, structured values, no alias normalization and no text-only subtype", () => {
    for (const ok of [
      "open",
      "asserted",
      "denied",
      "protested",
      "reserved",
      "recognized",
      "disputed",
      "Disputed",
      "DISPUTED",
      "resolved_by_settlement",
      "a status the source never listed",
      "",
      " padded ",
      0,
      3,
      true,
      false,
      null,
      {},
      { phase: "open", n: 2 },
    ])
      expect(
        ExternalizedClaimDisputeSchema.parse(dispute({ status: ok })).status,
        JSON.stringify(ok),
      ).toEqual(ok);
  });

  it("it is required and singular: absent, undefined, array-valued and non-canonical values are refused", () => {
    const v: any = dispute();
    delete v.status;
    expect(parses(v)).toBe(false);
    for (const bad of [undefined, [], ["open"], ["open", "closed"], NaN, Infinity, new Map(), 1n])
      expect(parses({ ...dispute(), status: bad }), String(bad)).toBe(false);
  });
});

describe("effect_on is conditional and exactly three literals, never defaulted (IA-02)", () => {
  it("every fixed literal round-trips exactly when the conditional field is used", () => {
    for (const lit of SOURCE_EFFECT_ON)
      expect(ExternalizedClaimDisputeSchema.parse(dispute({ effect_on: lit })).effect_on).toBe(lit);
  });

  it("omission does not generate a default: absent stays absent", () => {
    const out = ExternalizedClaimDisputeSchema.parse(dispute()) as any;
    expect("effect_on" in out).toBe(false);
    expect(out.effect_on).toBeUndefined();
  });

  it("no fourth value, alias, case variant, padded or structured value is accepted", () => {
    for (const bad of [
      "receipt",
      "Issuance",
      "ISSUANCE",
      "addressee-receipt",
      "issuance ",
      "instrument_specified",
      "setting_specified",
      "broadcast_exposure",
      "BROADCAST_EXPOSURE",
      "",
      "default",
      ["issuance"],
      { effect_on: "issuance" },
      1,
      true,
    ])
      expect(parses({ ...dispute(), effect_on: bad }), JSON.stringify(bad)).toBe(false);
  });

  it("effect_on neither requires nor implies another field: it carries with and without the instrument reference and dependencies", () => {
    expect(parses(dispute({ effect_on: "instrument_or_setting_specified" }))).toBe(true);
    expect(
      parses(
        fullExternalizedClaimDispute(DISPUTE_A, {
          effect_on: "addressee_receipt",
          dependency_refs: ["k"],
        }),
      ),
    ).toBe(true);
  });
});
