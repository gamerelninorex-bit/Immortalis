import { z } from "zod";
import { Id, Sha256, Version } from "./ids.ts";
import { JsonValueSchema } from "./json.ts";
import { INSTRUMENT_OPERATIVE_EFFECTS } from "./gip-instrument.ts";
import { OWNER_ECONOMY } from "./economy.ts";
import { GM_ADJUDICATION_AUTHORITY } from "./culture-adjudication.ts";
import { PositiveQuantitySchema, ProductionQuantitySchema } from "./production.ts";
import { CanonicalTimeSchema, StageKeySchema } from "./temporal.ts";
import { EntityId, FactRefSchema, OWNER_WORLD_STATE, Text } from "./world-foundation.ts";

/**
 * ROADBED first-profile institutional freight (Foundation F + Integration I) — executable contracts.
 *
 * Governing sources: ROADBED R2-D18 v1.2.1 (source pin 2026-11-11T16:11:26.161Z; Sovereign scoped ratification R2-D22
 * 2026-11-11T16:29:38.518Z); R3-T2 §§2-5 EL-01F / EL-02S and the F-017 first-freight stage overlay as corrected by the exact
 * R3-T17 CT-1..CT-4 successor (Sovereign scoped ratification R3-T20, 2026-11-13T04:35:38.950Z; documentary re-freeze R3-T21);
 * BLUE Formal Universal Hard Preflight v6.2 R3-T25 (the bounded Builder brief). Owner contracts: WS-007 GIP v2.1 §§4.1-4.4, §5;
 * WS-004 Economy v1.1 §§2.1, 9.1, 20, 25-28; WS-010 Logistics v1 §§3.1, 3.2, 3.4, 9-11, 23; WS-003 Production v1 §§2, 3, 13A; WG
 * World-State (F-016 fallback custody, ECT-01); F-014B Temporal.
 *
 * EVERY identifier, key, kind label and literal in this file that the sources do not themselves spell is a TECHNICAL LOWERING of
 * ratified semantics, never a new source field (R3-T25 §4 "Technical source-lock receipt route"). The source-to-schema map is
 * `docs/roadbed-freight-first-profile-foundation.md`. Source-literal vocabulary reproduced exactly: the WS-007 §4.2 effect
 * classes, the four applicability results (applies / does_not_apply / contested / unresolved), the WS-004 §2.1 Holding field
 * names and the available / encumbered / restricted status, the WS-010 §3.1 request field names, and the EL-02S request states
 * pending / withdrawal-pending / terminal.
 *
 * WITHHELD (R3-T23 B1-C, CT-1): a positive definitive F1 terminal refusal has no representation here. There is no Logistics
 * refusal kind, key, state or receipt, and the withdrawal cause vocabulary below has no W1 member. W4 (a separately
 * source-qualified service-by boundary) is likewise unrepresentable: no source-qualified cutoff producer exists in this lowering.
 *
 * Every schema is strict: an unmodelled field is rejected, never carried.
 */

/** R3-T2 §2 / G-6: the canonical request-class discriminator. No other request class inherits EL-01F / EL-02S. */
export const FREIGHT_PROFILE = "R2-D18-v1.2.1/first-profile/economy-fixed-freight";
export const FreightProfileLiteral = z.literal(FREIGHT_PROFILE);

/** Logistics' owner identifier (kept literal here: ./logistics.ts imports this module). */
const OWNER_LOGISTICS = "logistics";
const FactPin = z.strictObject({ fact_key: Id, version: Version.min(1) });
export type FreightFactPin = z.infer<typeof FactPin>;
const Locality = z.strictObject({ world: FactRefSchema, locus: FactRefSchema });
const sortedUnique = (xs: readonly string[]): boolean =>
  xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);

/**
 * R2-D18 §1.1: the authorized GM supplies already-established setting premises through a trusted session with role.gm and
 * permission.rule.adjudicate. It is supplied, never defaulted, and is neither an in-world office act nor a player choice.
 */
export const GmAuthoredUnderSchema = z.strictObject({
  role: z.literal(GM_ADJUDICATION_AUTHORITY.role),
  permission: z.literal(GM_ADJUDICATION_AUTHORITY.permission),
});

// =============================================================================================
// WORLD-STATE — Opening Source Attestation (R2-D18 §1, §1.1; protected kind P-2)
// =============================================================================================

export const FACET_WORLD_OPENING_PROVENANCE = "world_opening_provenance";
export const FACET_WORLD_SITE_CONDITION = "world_site_condition";
export const FACET_WORLD_GOVERNING_PREMISE = "world_governing_premise";

export const worldOpeningAttestationKey = (worldId: string): string =>
  `world/${worldId}/opening-attestation`;
export const worldSiteConditionKey = (worldId: string, conditionId: string): string =>
  `world/${worldId}/site-condition/${conditionId}`;
export const PROTECTED_CLASSES = ["P-1", "P-2", "P-3", "P-4"] as const;
export const ProtectedClass = z.enum(PROTECTED_CLASSES);
export type ProtectedClass = z.infer<typeof ProtectedClass>;
export const worldGoverningPremiseKey = (
  worldId: string,
  protectedClass: string,
  premiseId: string,
): string => `world/${worldId}/governing-premise/${protectedClass}/${premiseId}`;
export const worldGoverningPremiseHeadKey = (worldId: string, protectedClass: string): string =>
  `world/${worldId}/governing-premise-head/${protectedClass}`;

/** The individually addressable premise-slice kinds of the one original accepted GM envelope (R2-D18 §1.1). */
export const OPENING_SLICE_KINDS = [
  "legal",
  "site_condition",
  "material_specification",
  "input_lot",
  "service_premise",
] as const;
export const OpeningSliceKind = z.enum(OPENING_SLICE_KINDS);
export type OpeningSliceKind = z.infer<typeof OpeningSliceKind>;

/**
 * One sealed premise slice. `statement` is the GM's ordinary-language premise exactly as authored; `premise` is its typed
 * lowering. World-State attests both and interprets neither: each slice is validated only by the owner that later admits it
 * (GIP owns legal coverage and competence; Production the material prerequisite; Logistics the service basis). `digest` is the
 * SHA-256 of the canonical JSON of {slice_id, slice_kind, statement, premise}.
 */
export const OpeningSliceSchema = z.strictObject({
  slice_id: EntityId,
  slice_kind: OpeningSliceKind,
  statement: Text,
  premise: JsonValueSchema,
  digest: Sha256,
});
export type OpeningSlice = z.infer<typeof OpeningSliceSchema>;

export const OpeningAttestationSchema = z
  .strictObject({
    world: FactRefSchema,
    profile: FreightProfileLiteral,
    /** the one trusted original GM setup operation; its receipt is this fact's own commit receipt (provenance) */
    setup_operation: z.strictObject({
      operation_id: EntityId,
      authored_under: GmAuthoredUnderSchema,
      authorship: z.literal("GM_AUTHORED_ORIGINAL_SETTING_PREMISES_NOT_PLAYER_CHOICE"),
    }),
    /** NULL-PC original-world profile only (R2-D18 §0): the binding slot was read absent at attestation */
    mode: z.literal("ORIGINAL_WORLD_NULL_PC"),
    /** source-profile / origin / destination pins */
    pins: z.strictObject({
      world_profile: FactPin,
      origin: z.strictObject({ fact_key: Id, entity_id: EntityId, version: Version.min(1) }),
      destination: z.strictObject({ fact_key: Id, entity_id: EntityId, version: Version.min(1) }),
    }),
    /** the ENTIRE original accepted envelope; unused slices stay sealed (no retroactive rescue) */
    envelope: z.strictObject({
      envelope_id: EntityId,
      /** SHA-256 of the canonical JSON of {envelope_id, operation_id, world_id, slices: [slice digests in order]} */
      digest: Sha256,
      closed: z.literal(true),
      slices: z.array(OpeningSliceSchema).min(1),
    }),
  })
  .superRefine((a, ctx) => {
    if (!sortedUnique(a.envelope.slices.map((s) => s.slice_id)))
      ctx.addIssue({
        code: "custom",
        message: "slices are individually addressable: sorted by slice_id, free of duplicates",
        path: ["envelope", "slices"],
      });
    if (a.pins.origin.entity_id === a.pins.destination.entity_id)
      ctx.addIssue({
        code: "custom",
        message: "origin and destination are two established sites",
        path: ["pins"],
      });
  });
export type OpeningAttestation = z.infer<typeof OpeningAttestationSchema>;

export const AttestOpeningInputSchema = z.strictObject({
  world_id: EntityId,
  operation_id: EntityId,
  envelope_id: EntityId,
  origin_locus_id: EntityId,
  destination_locus_id: EntityId,
  authored_under: GmAuthoredUnderSchema,
  slices: z
    .array(
      z.strictObject({
        slice_id: EntityId,
        slice_kind: OpeningSliceKind,
        statement: Text,
        premise: JsonValueSchema,
      }),
    )
    .min(1),
});
export type AttestOpeningInput = z.infer<typeof AttestOpeningInputSchema>;

/** The exact provenance every owner admission from a sealed slice carries (never the content: referenced, not copied). */
export const SliceProvenanceSchema = z.strictObject({
  attestation: FactPin,
  envelope_digest: Sha256,
  slice_id: EntityId,
  slice_digest: Sha256,
});
export type SliceProvenance = z.infer<typeof SliceProvenanceSchema>;

// ---------------------------------------------------------------------------------------------
// WORLD-STATE — objective destination site condition (R2-D18 §1: physical site/component identity, damaged state/count and
// admitted evidence; no legal priority or work authorization). NOT a protected kind (§3.2 exclusion).
// ---------------------------------------------------------------------------------------------

export const SiteConditionPremiseSchema = z.strictObject({
  condition_id: EntityId,
  site_locus_id: EntityId,
  /** the physical component identity (a label, never a vocabulary) */
  component: Text,
  /** the damaged component identities; their count is a fact, never an input to any quantity */
  damaged_components: z
    .array(EntityId)
    .min(1)
    .refine(sortedUnique, "damaged components are sorted and free of duplicates"),
});
export type SiteConditionPremise = z.infer<typeof SiteConditionPremiseSchema>;

export const WorldSiteConditionSchema = z.strictObject({
  condition_id: EntityId,
  world: FactRefSchema,
  site: FactRefSchema,
  component: Text,
  damaged_components: z.array(EntityId).min(1).refine(sortedUnique, "sorted, unique"),
  /** the immutable original slice this condition was admitted from */
  original: SliceProvenanceSchema,
  /**
   * The live standing of the condition. Version 1 is the original. A later version exists only by one owner-admitted
   * PROSPECTIVE physical change (R2-D18 §3.3): it never rewrites the opening, and it may either leave the same damaged
   * components standing or record that the condition has ceased. A materially different later condition would need its own
   * source-authorized profile and has no representation.
   */
  standing: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("STANDING") }),
    z.strictObject({ status: z.literal("CEASED") }),
  ]),
  prospective_change: z
    .strictObject({
      change_id: EntityId,
      statement: Text,
      authored_under: GmAuthoredUnderSchema,
      at: CanonicalTimeSchema,
    })
    .nullable(),
});
export type WorldSiteCondition = z.infer<typeof WorldSiteConditionSchema>;

export const AdmitSiteConditionInputSchema = z.strictObject({
  world_id: EntityId,
  slice_id: EntityId,
});
export const AdmitSiteConditionChangeInputSchema = z.strictObject({
  world_id: EntityId,
  condition_id: EntityId,
  change_id: EntityId,
  statement: Text,
  outcome: z.enum(["STANDING", "CEASED"]),
  authored_under: GmAuthoredUnderSchema,
});

// ---------------------------------------------------------------------------------------------
// WORLD-STATE — typed governing-premise admission with per-class isolated heads (R2-D18 §3.2 P-1..P-4). Every such admission
// maps to exactly one protected class or is refused; each advances ONLY its own class head, in the same group, so a write of
// any other kind can never advance a protected head and a new entry is always detected.
// ---------------------------------------------------------------------------------------------

export const GOVERNING_PREMISE_ACTIONS = [
  "new",
  "replacement",
  "correction",
  "retirement",
] as const;
export const WorldGoverningPremiseSchema = z.strictObject({
  premise_id: EntityId,
  world: FactRefSchema,
  protected_class: ProtectedClass,
  action: z.enum(GOVERNING_PREMISE_ACTIONS),
  /** what the premise establishes or alters: jurisdiction, territorial scope, precedence/incorporation premise or legal reach */
  subject: Text,
  statement: Text,
  authored_under: GmAuthoredUnderSchema,
  admitted_at: CanonicalTimeSchema,
});
export type WorldGoverningPremise = z.infer<typeof WorldGoverningPremiseSchema>;

export const WorldGoverningPremiseHeadSchema = z.strictObject({
  world: FactRefSchema,
  protected_class: ProtectedClass,
  /** the number of admitted premises of this class in this world */
  count: z.number().int().positive(),
  /** SHA-256 of the canonical JSON of {prev: prior chain digest | null, fact_key, value_sha256} */
  chain_digest: Sha256,
  last: z.strictObject({ fact_key: Id, premise_id: EntityId }),
});
export type WorldGoverningPremiseHead = z.infer<typeof WorldGoverningPremiseHeadSchema>;

export const AdmitGoverningPremiseInputSchema = z.strictObject({
  world_id: EntityId,
  premise_id: EntityId,
  protected_class: ProtectedClass,
  action: z.enum(GOVERNING_PREMISE_ACTIONS),
  subject: Text,
  statement: Text,
  authored_under: GmAuthoredUnderSchema,
});

/** One protected World-State head as pinned by the Legal Readiness Seal: its fixed sealed facts and its premise-class head. */
export const ProtectedHeadPinSchema = z.strictObject({
  protected_class: ProtectedClass,
  /** the sealed facts whose canonical purpose is this class (each pinned at the version read) */
  fixed: z.array(FactPin),
  /** the class head; version 0 is owner-proven absence of any admitted premise of this class */
  head: z.strictObject({ fact_key: Id, version: Version }),
});
export type ProtectedHeadPin = z.infer<typeof ProtectedHeadPinSchema>;

// =============================================================================================
// GIP — legal premise (the `legal` slice), Opening Constitutive Basis with Closed Governing Coverage, the seven separately
// addressable clauses of ONE Instrument, the Legal Readiness Seal, and derived applicability (R2-D18 §§1, 1.2, 2, 2.1, 3.1).
// =============================================================================================

export const gipOpeningBasisKey = (basisId: string): string => `gip/opening-basis/${basisId}`;
export const gipInstrumentClauseKey = (instrumentId: string, provisionId: string): string =>
  `gip/instrument/${instrumentId}/clause/${provisionId}`;
export const gipReadinessSealKey = (sealId: string): string => `gip/readiness-seal/${sealId}`;

/** The seven clause slots of the first profile (R2-D18 §2). The slot is a profile label; `provision_id` is the order's own. */
export const FREIGHT_CLAUSES = ["C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07"] as const;
export const FreightClause = z.enum(FREIGHT_CLAUSES);
export type FreightClause = z.infer<typeof FreightClause>;

/** The effect class each slot must carry (R2-D18 §2; R3-T25 §4). C-02 alone admits an evidenced lawful equivalent. */
export const FREIGHT_CLAUSE_EFFECT: Readonly<Record<FreightClause, string>> = {
  "C-01": "authority_grant",
  "C-02": "entitlement",
  "C-03": "entitlement",
  "C-04": "permission",
  "C-05": "administrative_direction",
  "C-06": "administrative_direction",
  "C-07": "administrative_direction",
};

/** GIP's order-relative, act-scoped applicability answer (R2-D18 §2, §3.1). Derived AS-OF-NOW; never stored as eligibility. */
export const CLAUSE_APPLICABILITY = [
  "applies",
  "does_not_apply",
  "contested",
  "unresolved",
] as const;
export const ClauseApplicability = z.enum(CLAUSE_APPLICABILITY);
export type ClauseApplicability = z.infer<typeof ClauseApplicability>;

/** The closed set of coverage items the governing order must positively dispose of (R2-D18 §1.2: silence is not absence). */
export const COVERAGE_ITEMS = [
  "constitutive_competence",
  "jurisdiction_origin",
  "jurisdiction_destination",
  "institution_authority_locus",
  "applicability_procedure",
  "publication_or_notice",
  "concurrence_or_outside_determination",
  "priority_precedence",
  "incorporation",
  "conflicting_orders",
  "exceptions",
  "sunset_or_expiry",
] as const;
export const CoverageItemKind = z.enum(COVERAGE_ITEMS);
export const COVERAGE_DISPOSITIONS = [
  "evidenced",
  "established_inapplicable",
  "unresolved",
  "contested",
] as const;
export const CoverageItemSchema = z.strictObject({
  item: CoverageItemKind,
  disposition: z.enum(COVERAGE_DISPOSITIONS),
  statement: Text,
});
export type CoverageItem = z.infer<typeof CoverageItemSchema>;

const clauseCommon = {
  /** the order's own stable provision identity */
  provision_id: EntityId,
  /** the governing order that establishes THIS provision: one Instrument is lawful only when every clause names the same order */
  order_id: EntityId,
  effect_class: z.enum(INSTRUMENT_OPERATIVE_EFFECTS),
  /** required exactly when C-02 carries a class other than `entitlement`: the order's evidenced lawful equivalent */
  lawful_equivalent_evidence: Text.nullable(),
  /** the operative text of the provision, as authored (part of the source terms) */
  statement: Text,
};

/** Typed, independently evaluable terms per clause slot (R2-D18 §2 table, §2.1 operative text). */
const TermsC01 = z.strictObject({ institution_id: EntityId, office_id: EntityId, function: Text });
const TermsC02 = z.strictObject({
  institution_id: EntityId,
  origin_locus_id: EntityId,
  lot_id: EntityId,
  operation_class: Id,
  retention: z.literal("EXCLUSIVE_WHOLE_ACCEPTED_OUTPUT"),
});
const TermsC03 = z.strictObject({
  institution_id: EntityId,
  destination_locus_id: EntityId,
  material_class: Id,
  site_function: Text,
});
const TermsC04 = z.strictObject({
  institution_id: EntityId,
  world_id: EntityId,
  origin_locus_id: EntityId,
  destination_locus_id: EntityId,
  material_class: Id,
  /** the positive whole-output ceiling of the one dispatch, in the cargo's unit */
  ceiling: PositiveQuantitySchema,
  purpose: Id,
  directive_use_id: EntityId,
  qualifying_first_dispatches: z.literal(1),
  /** Variant A: the source explicitly establishes a genuine no-sunset permission */
  sunset: z.literal("NONE_ESTABLISHED_BY_SOURCE"),
});
const TermsC05 = z.strictObject({
  institution_id: EntityId,
  origin_locus_id: EntityId,
  lot_id: EntityId,
  output_class: Id,
  trigger: z.literal("ONE_UNIQUE_DEDICATED_LOT_AND_ONE_FIXED_UNMET_REQUIREMENT"),
});
const TermsC06 = z.strictObject({
  institution_id: EntityId,
  destination_locus_id: EntityId,
  trigger: z.literal("ONE_OPEN_WHOLE_REQUIREMENT_AND_ONE_UNIQUE_ACCEPTED_WHOLE_OUTPUT"),
});
const TermsC07 = z.strictObject({
  /** the order's own closed trigger list (R2-D18 §2.1 W1..W4), reproduced as the source names them */
  triggers: z.tuple([z.literal("W1"), z.literal("W2"), z.literal("W3"), z.literal("W4")]),
  release_order: z.literal("LOGISTICS_PROVES_NO_DISPATCH_THEN_ECONOMY_CLOSES_ONCE"),
});

export const ClausePremiseSchema = z.discriminatedUnion("clause", [
  z.strictObject({ clause: z.literal("C-01"), ...clauseCommon, terms: TermsC01 }),
  z.strictObject({ clause: z.literal("C-02"), ...clauseCommon, terms: TermsC02 }),
  z.strictObject({ clause: z.literal("C-03"), ...clauseCommon, terms: TermsC03 }),
  z.strictObject({ clause: z.literal("C-04"), ...clauseCommon, terms: TermsC04 }),
  z.strictObject({ clause: z.literal("C-05"), ...clauseCommon, terms: TermsC05 }),
  z.strictObject({ clause: z.literal("C-06"), ...clauseCommon, terms: TermsC06 }),
  z.strictObject({ clause: z.literal("C-07"), ...clauseCommon, terms: TermsC07 }),
]);
export type ClausePremise = z.infer<typeof ClausePremiseSchema>;

/** The typed lowering of the one `legal` slice: the original governing order as the GM authored it. */
export const LegalPremiseSchema = z.strictObject({
  basis_id: EntityId,
  governing_order: z.strictObject({ order_id: EntityId, title: Text }),
  /** the independently authored antecedent provision that confers competence (the Instrument cannot create its own) */
  antecedent: z.strictObject({ provision_ref: EntityId, statement: Text }),
  institution: z.strictObject({ institution_id: EntityId }),
  authority_locus: z.strictObject({ office_id: EntityId, competence: Text }),
  scope_binding_id: EntityId,
  instrument_id: EntityId,
  procedure: Text,
  jurisdiction: z.strictObject({
    world_id: EntityId,
    origin_locus_id: EntityId,
    destination_locus_id: EntityId,
  }),
  coverage: z.array(CoverageItemSchema),
  clauses: z.array(ClausePremiseSchema),
});
export type LegalPremise = z.infer<typeof LegalPremiseSchema>;

/** Opening Constitutive Basis, including the Closed Governing Coverage as one immutable component (R2-D18 §1, §1.2). */
export const OpeningBasisSchema = z.strictObject({
  basis_id: EntityId,
  profile: FreightProfileLiteral,
  governing_order: z.strictObject({ order_id: EntityId, title: Text }),
  antecedent: z.strictObject({ provision_ref: EntityId, statement: Text }),
  constitutive_competence: z.strictObject({
    institution_id: EntityId,
    office_id: EntityId,
    competence: Text,
    procedure: Text,
  }),
  closed_governing_coverage: z.strictObject({
    world_id: EntityId,
    origin_locus_id: EntityId,
    destination_locus_id: EntityId,
    instrument_id: EntityId,
    scope_binding_id: EntityId,
    /** all operative clause provision ids, in clause-slot order C-01..C-07 */
    clause_provision_ids: z.array(EntityId).length(FREIGHT_CLAUSES.length),
    /** every coverage item exactly once, in COVERAGE_ITEMS order, each evidenced or expressly established inapplicable */
    items: z.array(CoverageItemSchema).length(COVERAGE_ITEMS.length),
  }),
  original: SliceProvenanceSchema,
});
export type OpeningBasis = z.infer<typeof OpeningBasisSchema>;

const clauseFactCommon = {
  provision_id: EntityId,
  /** the ONE Instrument that exposes this clause; its legacy scalar `operative_effect` is untouched */
  instrument: z.strictObject({ fact_key: Id, instrument_id: EntityId, version: Version.min(1) }),
  governing_order_ref: EntityId,
  effect_class: z.enum(INSTRUMENT_OPERATIVE_EFFECTS),
  lawful_equivalent_evidence: Text.nullable(),
  statement: Text,
  /** exact scope: the Instrument's own committed Scope Binding */
  scope_binding_ref: Id,
  /** the covered legal revision: the Basis this clause was qualified under */
  covered_revision: z.strictObject({ basis: FactPin }),
  original: SliceProvenanceSchema,
};
/** One separately addressable operative clause (WS-007 §4.4; R2-D18 §2). */
export const InstrumentClauseSchema = z.discriminatedUnion("clause", [
  z.strictObject({ clause: z.literal("C-01"), ...clauseFactCommon, terms: TermsC01 }),
  z.strictObject({ clause: z.literal("C-02"), ...clauseFactCommon, terms: TermsC02 }),
  z.strictObject({ clause: z.literal("C-03"), ...clauseFactCommon, terms: TermsC03 }),
  z.strictObject({ clause: z.literal("C-04"), ...clauseFactCommon, terms: TermsC04 }),
  z.strictObject({ clause: z.literal("C-05"), ...clauseFactCommon, terms: TermsC05 }),
  z.strictObject({ clause: z.literal("C-06"), ...clauseFactCommon, terms: TermsC06 }),
  z.strictObject({ clause: z.literal("C-07"), ...clauseFactCommon, terms: TermsC07 }),
]);
export type InstrumentClause = z.infer<typeof InstrumentClauseSchema>;

/**
 * The campaign-wide GIP owner head: a monotone signature over every GIP-owned fact (facts are never deleted and versions only
 * rise, so ANY authoritative GIP write strictly increases `versions`). It is derived from committed state, never authored.
 */
export const GipOwnerHeadSchema = z.strictObject({
  facts: z.number().int().nonnegative(),
  versions: z.number().int().nonnegative(),
});
export type GipOwnerHead = z.infer<typeof GipOwnerHeadSchema>;

/**
 * Legal Readiness Seal (R2-D18 §1, §1.1, §3.1, §3.2): closes the assembled legal source. It stores immutable assembly
 * provenance and the covered legal revision — never a validity oracle. The post-seal GIP owner head is obtained from the
 * completed commit (`gip_owner_head_before` plus this one create), so the seal never embeds a digest of itself.
 */
export const LegalReadinessSealSchema = z.strictObject({
  seal_id: EntityId,
  profile: FreightProfileLiteral,
  world: FactRefSchema,
  basis: FactPin,
  institution: FactPin,
  office: FactPin,
  scope_binding: FactPin,
  instrument: FactPin,
  /** the seven clauses in slot order C-01..C-07 */
  clauses: z
    .array(
      z.strictObject({
        clause: FreightClause,
        provision_id: EntityId,
        fact_key: Id,
        version: Version.min(1),
      }),
    )
    .length(FREIGHT_CLAUSES.length),
  attestation: FactPin,
  envelope_digest: Sha256,
  /** the closed, isolated per-class World-State governing-premise heads P-1..P-4, in class order */
  world_state_protected_heads: z.array(ProtectedHeadPinSchema).length(PROTECTED_CLASSES.length),
  gip_owner_head_before: GipOwnerHeadSchema,
  /** canonical T0: the temporal state as initialized, with no intervening advance */
  t0: z.strictObject({
    temporal_state: z.strictObject({ fact_key: Id, version: z.literal(1) }),
    at: CanonicalTimeSchema,
  }),
});
export type LegalReadinessSeal = z.infer<typeof LegalReadinessSealSchema>;

export const AssembleLegalInputSchema = z.strictObject({ world_id: EntityId });
export const SealReadinessInputSchema = z.strictObject({ world_id: EntityId, seal_id: EntityId });

// =============================================================================================
// PRODUCTION — prospective repair-material specification and dedicated input lot (R2-D18 §1, §1.1; C-05).
// =============================================================================================

export const productionMaterialSpecificationKey = (specificationId: string): string =>
  `production/material-specification/${specificationId}`;
export const productionInputLotKey = (lotId: string): string => `production/input-lot/${lotId}`;

/**
 * The typed lowering of a `material_specification` slice. The exact class, positive total amount and unit are authored opening
 * facts: there is no rate, per-component or computed field, so a quantity can never be derived from a damage count.
 */
export const MaterialSpecificationPremiseSchema = z.strictObject({
  specification_id: EntityId,
  site_locus_id: EntityId,
  condition_id: EntityId,
  material_class: Id,
  quantity: PositiveQuantitySchema,
  function: Text,
});
export type MaterialSpecificationPremise = z.infer<typeof MaterialSpecificationPremiseSchema>;

export const MATERIAL_SPECIFICATION_NATURE =
  "PROSPECTIVE_HARD_MATERIAL_PREREQUISITE_NOT_UNDERTAKING_OPERATION_RESERVE_OR_INVENTORY";
export const ProductionMaterialSpecificationSchema = z.strictObject({
  specification_id: EntityId,
  world: FactRefSchema,
  site: FactRefSchema,
  /** World-State's admitted objective condition, pinned at its original version */
  condition: z.strictObject({ fact_key: Id, condition_id: EntityId, version: z.literal(1) }),
  material_class: Id,
  quantity: PositiveQuantitySchema,
  function: Text,
  nature: z.literal(MATERIAL_SPECIFICATION_NATURE),
  original: SliceProvenanceSchema,
});
export type ProductionMaterialSpecification = z.infer<typeof ProductionMaterialSpecificationSchema>;

/** The typed lowering of an `input_lot` slice: the dedicated lot and the ONE exact declared operation it qualifies for. */
export const InputLotPremiseSchema = z.strictObject({
  lot_id: EntityId,
  origin_locus_id: EntityId,
  institution_id: EntityId,
  material_class: Id,
  quantity: PositiveQuantitySchema,
  condition: Id,
  dedicated_operation: z.strictObject({
    operation_class: Id,
    input: z.strictObject({ material_class: Id, quantity: PositiveQuantitySchema }),
    output: z.strictObject({ output_class: Id, quantity: PositiveQuantitySchema, condition: Id }),
    /** the explicit declared completion boundary of the dedicated operation (no Production default exists) */
    completion_at: CanonicalTimeSchema,
  }),
});
export type InputLotPremise = z.infer<typeof InputLotPremiseSchema>;

export const ProductionInputLotSchema = z.strictObject({
  lot_id: EntityId,
  world: FactRefSchema,
  origin: FactRefSchema,
  institution_id: EntityId,
  /** the Production Reserve established for this lot in the same group (its establishment version) */
  reserve: z.strictObject({ fact_key: Id, reserve_id: EntityId, version: z.literal(1) }),
  material_class: Id,
  quantity: PositiveQuantitySchema,
  condition: Id,
  dedicated_operation: InputLotPremiseSchema.shape.dedicated_operation,
  original: SliceProvenanceSchema,
});
export type ProductionInputLot = z.infer<typeof ProductionInputLotSchema>;

export const AdmitMaterialSpecificationInputSchema = z.strictObject({
  world_id: EntityId,
  slice_id: EntityId,
});
export const AdmitInputLotInputSchema = z.strictObject({ world_id: EntityId, slice_id: EntityId });

// =============================================================================================
// ECONOMY — C-05 origin self-provision, accepted-output holding, C-06 fixed freight request E0 with three exclusive slots,
// C-07 withdrawal-pending admission and terminal close C, E1 one-use consumption, ER receipt, AD adequacy.
// =============================================================================================

export const economyOriginAllocationKey = (specificationId: string): string =>
  `economy/origin-allocation/${specificationId}`;
export const economyOriginLotSlotKey = (lotId: string): string =>
  `economy/origin-lot-slot/${lotId}`;
export const economyAcceptedOutputHoldingKey = (worldId: string, entityId: string): string =>
  `economy/accepted-output-holding/${worldId}/${entityId}`;
export const economyFreightRequestKey = (requestRef: string): string =>
  `economy/freight-request/${requestRef}`;
export const economyFreightAllocationKey = (requestRef: string): string =>
  `economy/freight-allocation/${requestRef}`;
export const economyFreightDirectiveUseSlotKey = (directiveUseId: string): string =>
  `economy/freight-slot/directive-use/${directiveUseId}`;
export const economyFreightCargoSlotKey = (worldId: string, entityId: string): string =>
  `economy/freight-slot/cargo/${worldId}/${entityId}`;
export const economyFreightRequirementSlotKey = (specificationId: string): string =>
  `economy/freight-slot/requirement/${specificationId}`;
export const economyFreightWithdrawalKey = (requestRef: string): string =>
  `economy/freight-withdrawal/${requestRef}`;
export const economyFreightCloseKey = (requestRef: string): string =>
  `economy/freight-close/${requestRef}`;
export const economyFreightUseConsumptionKey = (directiveUseId: string): string =>
  `economy/freight-use/${directiveUseId}`;
export const economyFreightResultKey = (requestRef: string): string =>
  `economy/freight-result/${requestRef}`;
export const economyDestinationAdequacyKey = (requestRef: string): string =>
  `economy/destination-adequacy/${requestRef}`;

/** Identities derived from committed identities alone: nothing is a clock, a counter the caller supplies, or a random value. */
export const economyOriginAllocationId = (specificationId: string): string =>
  `origin:${specificationId}`;
/** The one Production Request of the C-05 self-provision: the Production operation identity IS the request identity. */
export const economyOriginRequestId = (specificationId: string): string =>
  `origin:${specificationId}`;
const FREIGHT_REQUEST_PREFIX = "freight:";
/**
 * The immutable Economy request identity: the profile's seal and the version the cargo slot is claimed AT. A first request
 * claims the absent slot (version 1); a later, genuinely new request after a proven unused close (E2) claims the released slot
 * at a higher version, so it can never reuse, relabel or replay the earlier identity.
 */
export const economyFreightRequestRef = (sealId: string, cargoSlotClaimVersion: number): string =>
  `${FREIGHT_REQUEST_PREFIX}${sealId}:${cargoSlotClaimVersion}`;
export const isEconomyFreightRequestRef = (requestRef: string): boolean =>
  requestRef.startsWith(FREIGHT_REQUEST_PREFIX);

/** The applicability pins Economy carries for each clause it relied on at an act (GIP → Economy; Logistics compares, never evaluates). */
const ClauseReliance = z.strictObject({
  clause: FreightClause,
  fact_key: Id,
  version: Version.min(1),
  applicability: z.literal("applies"),
});

export const ORIGIN_ALLOCATION_NATURE =
  "ECONOMIC_SELF_PROVISION_ALLOCATION_NOT_PHYSICAL_RESERVE_TITLE_OR_SUPPLY";
/** C-05: the exclusive input-side allocation fixed together with the one Production Request (R2-D18 §2.1, §4 step 2). */
export const EconomyOriginAllocationSchema = z.strictObject({
  allocation_id: EntityId,
  profile: FreightProfileLiteral,
  seal: FactPin,
  institution_id: EntityId,
  /** the one positive, still-unmet requirement C/Q/U Economy derived from the exact join of condition and specification */
  requirement: z.strictObject({
    specification: FactPin,
    condition: FactPin,
    material_class: Id,
    quantity: PositiveQuantitySchema,
  }),
  input_lot: z.strictObject({ fact_key: Id, lot_id: EntityId, version: Version.min(1) }),
  /** the lot's Reserve, read unclaimed at this version (input exclusivity is Production's to prove again at start) */
  reserve: FactPin,
  production_request: z.strictObject({ fact_key: Id, request_id: EntityId }),
  /** C-01, C-02 and C-05, each currently applying at this act */
  authority: z.array(ClauseReliance).length(3),
  /** WS-004 §25: the owner-admitted event that opened this scoped resolution; the caller supplies no choice */
  trigger: z.strictObject({
    basis: z.literal("OWNER_ADMITTED_PREREQUISITE_OPENS_SCOPED_RESOLUTION"),
    owner_event: FactPin,
  }),
  fixed_at: CanonicalTimeSchema,
  nature: z.literal(ORIGIN_ALLOCATION_NATURE),
});
export type EconomyOriginAllocation = z.infer<typeof EconomyOriginAllocationSchema>;

export const EconomyOriginLotSlotSchema = z.strictObject({
  lot_id: EntityId,
  allocation: z.strictObject({ fact_key: Id, allocation_id: EntityId }),
});
export type EconomyOriginLotSlot = z.infer<typeof EconomyOriginLotSlotSchema>;

/**
 * Accepted Output Holding (WS-004 §2.1 field names, reproduced exactly): Economy's holding relation over the ONE whole
 * accepted output, derived from C-02 retention and the Production completion / World-State acceptance lineage. It is not
 * physical custody (World-State's), legal title (GIP's) or a second Reserve.
 */
export const HOLDING_STATUSES = ["available", "encumbered", "restricted"] as const;
export const EconomyAcceptedOutputHoldingSchema = z.strictObject({
  holder_ref: Id,
  object_ref: z.strictObject({ fact_key: Id, entity_id: EntityId }),
  quantity_or_bounded_position: PositiveQuantitySchema,
  status: z.enum(HOLDING_STATUSES),
  /** available: the C-02 retention clause; encumbered: the freight allocation that encumbers it */
  restriction_or_authority_ref: Id,
  lifecycle_status: z.literal("active"),
  provenance_ref: z.strictObject({
    seal: FactPin,
    retention_clause: FactPin,
    origin_allocation: FactPin,
    completion: FactPin,
    acceptance: z.strictObject({
      owner: z.literal(OWNER_WORLD_STATE),
      fact_key: Id,
      version: Version.min(1),
    }),
    /** present once a receipt-bound result exists (ER): the holding is then at the destination by that receipt */
    receipt: FactPin.nullable(),
  }),
  output_class: Id,
});
export type EconomyAcceptedOutputHolding = z.infer<typeof EconomyAcceptedOutputHoldingSchema>;

/**
 * The sealed Movement Service Request (WS-010 §3.1 foreign-owner request; field names reproduced from the source): Economy's
 * own fact, in Economy's own key space. Logistics pins it and never copies or owns it. Create-only: its identity and version
 * (1) are immutable; a changed term is a different, refused write.
 */
export const EconomyFreightRequestSchema = z.strictObject({
  request_class: FreightProfileLiteral,
  request_ref: EntityId,
  requesting_owner_ref: z.literal(OWNER_ECONOMY),
  /** the conserved whole physical entity: referenced, never copied */
  moved_object_or_quantity_ref: z.strictObject({ fact_key: Id, entity_id: EntityId }),
  origin_ref: Locality,
  destination_or_use_locus_ref: Locality,
  /** applicable positive quantity/unit: the whole accepted output */
  quantity: PositiveQuantitySchema,
  material_handling: z.strictObject({ material_class: Id, cargo: z.literal("ONE_WHOLE_CARGO") }),
  /** deadline/service: no source-qualified service-by boundary exists in this profile lowering */
  deadline_or_service: z.null(),
  /** legal priority: none is established by the order, so none is representable */
  legal_priority: z.null(),
  /** same institution as holder and beneficiary (R2-D18 §2.1: roles collapse unless a material divergence makes it ineligible) */
  institution: z.strictObject({ holder_ref: Id, beneficiary_ref: Id }),
  purpose: Id,
  directive_use_id: EntityId,
  /** the positive one-use ceiling the permission fixes (C-04), carried for Logistics' equality check */
  ceiling: PositiveQuantitySchema,
  allocation: z.strictObject({ fact_key: Id }),
  requirement: z.strictObject({ specification: FactPin, condition: FactPin }),
  holding: FactPin,
  /** the legal pins of the fixation act: the seal and C-03, C-04, C-06, each applying at E0 */
  legal: z.strictObject({ seal: FactPin, clauses: z.array(ClauseReliance).length(3) }),
  /** WS-004 §25: the owner-admitted event that opened the fixation resolution */
  trigger: z.strictObject({
    basis: z.literal("OWNER_ADMITTED_ACCEPTANCE_OR_REQUIREMENT_OPENS_SCOPED_RESOLUTION"),
    owner_event: FactPin,
  }),
  /**
   * E2 only: proof that the prior request for this same entity was terminally closed unused (its close, which itself carries
   * the no-dispatch basis). Null for a first request.
   */
  prior_unused_close: z
    .strictObject({ request_ref: EntityId, close: FactPin, allocation: FactPin })
    .nullable(),
  fixed_at: CanonicalTimeSchema,
});
export type EconomyFreightRequest = z.infer<typeof EconomyFreightRequestSchema>;

/**
 * The live state of one fixed request (EL-02S). `pending`, `withdrawal-pending` and `terminal` are the source's; the two
 * post-dispatch states are technical: a request whose one use was consumed, and one whose receipt-bound result exists.
 */
export const FREIGHT_ALLOCATION_STATUSES = [
  "pending",
  "withdrawal-pending",
  "terminal",
  "dispatch-consumed",
  "received",
] as const;
export const EconomyFreightAllocationSchema = z.strictObject({
  request: z.strictObject({ fact_key: Id, request_ref: EntityId, version: z.literal(1) }),
  state: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("pending") }),
    z.strictObject({ status: z.literal("withdrawal-pending"), withdrawal: FactPin }),
    z.strictObject({ status: z.literal("terminal"), close: FactPin }),
    z.strictObject({ status: z.literal("dispatch-consumed"), consumption: FactPin }),
    z.strictObject({
      status: z.literal("received"),
      consumption: FactPin,
      receipt: FactPin,
    }),
  ]),
});
export type EconomyFreightAllocation = z.infer<typeof EconomyFreightAllocationSchema>;

/** One of the three individually exclusive slots (directive-use, conserved cargo, site requirement). */
export const FREIGHT_SLOT_KINDS = ["directive-use", "cargo", "requirement"] as const;
export const EconomyFreightSlotSchema = z.strictObject({
  slot_kind: z.enum(FREIGHT_SLOT_KINDS),
  state: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("claimed"), request_ref: EntityId }),
    z.strictObject({ status: z.literal("released"), request_ref: EntityId, close: Id }),
    z.strictObject({ status: z.literal("consumed"), request_ref: EntityId, consumption: Id }),
  ]),
});
export type EconomyFreightSlot = z.infer<typeof EconomyFreightSlotSchema>;

/**
 * The request-bound Logistics guard of an Economy act (CT-2): either no commitment for this request exists (both keys guarded
 * at the version read, the Transfer Record at zero), or the request's commitment exists and is guarded at its exact observed
 * version and status with the Transfer Record at zero. It is the act's own guard, never a Logistics fact.
 */
export const LogisticsGuardSchema = z.discriminatedUnion("branch", [
  z.strictObject({
    branch: z.literal("NO_SERVICE_FOR_THIS_REQUEST"),
    commitment: z.strictObject({ fact_key: Id, version: Version }),
    transfer: z.strictObject({ fact_key: Id, version: z.literal(0) }),
  }),
  z.strictObject({
    branch: z.literal("SERVICE_COMMITTED_NOT_DISPATCHED"),
    commitment: z.strictObject({
      fact_key: Id,
      version: Version.min(1),
      status: z.literal("COMMITTED"),
    }),
    transfer: z.strictObject({ fact_key: Id, version: z.literal(0) }),
  }),
]);
export type LogisticsGuard = z.infer<typeof LogisticsGuardSchema>;

/**
 * C-07 withdrawal causes ADMISSIBLE in this lowering. W1 is absent by construction (positive F1 is WITHHELD) and W4 is absent
 * because no source-qualified service-by boundary is producible; neither can be written.
 */
export const FREIGHT_WITHDRAWAL_CAUSES = ["W2", "W3"] as const;
export const W3_DEPENDENCIES = [
  "site_condition",
  "material_specification",
  "cargo_physical_origin",
  "holding",
] as const;
/**
 * Economy's single create-once protective admission (CT-2): keyed by the sealed request identity; it admits protection ONLY —
 * it releases nothing, closes nothing and needs no no-dispatch proof. The cause is an owner-admitted occurrence Economy
 * re-derived at this cut, never a caller's verdict.
 */
export const EconomyFreightWithdrawalSchema = z.strictObject({
  request: z.strictObject({ fact_key: Id, request_ref: EntityId, version: z.literal(1) }),
  act: z.literal("withdrawal-pending"),
  cause: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("W2"),
      reason: z.literal("LOSS_OF_REQUIRED_CURRENT_LEGAL_FORCE_OR_PERMANENT_OPENING_ELIGIBILITY"),
      /** the first required clause that no longer applies, with GIP's own answer and reason */
      clause: FreightClause,
      applicability: z.enum(["does_not_apply", "contested", "unresolved"]),
      gip_reason: Id,
    }),
    z.strictObject({
      kind: z.literal("W3"),
      reason: z.literal("OWNER_ADMITTED_CESSATION_OR_MISMATCH_OF_AN_EXACT_PINNED_DEPENDENCY"),
      dependency: z.enum(W3_DEPENDENCIES),
      /** what the sealed request pinned, and the owner fact as it now stands */
      pinned: z.strictObject({ fact_key: Id, version: Version }),
      observed: z.strictObject({ fact_key: Id, version: Version }),
    }),
  ]),
  entity: z.strictObject({ fact_key: Id, entity_id: EntityId }),
  logistics_guard: LogisticsGuardSchema,
  /** limited provenance on Economy's own act: the campaign revision of the coherent cut it was admitted against */
  cut_basis_revision: z.number().int().nonnegative(),
  admitted_at: CanonicalTimeSchema,
  effect: z.literal("PROTECTION_ONLY_RELEASES_NOTHING_CLOSES_NOTHING"),
});
export type EconomyFreightWithdrawal = z.infer<typeof EconomyFreightWithdrawalSchema>;

/**
 * Terminal close C (R2-D18 §4 steps 5, 7; EL-01F): Economy alone marks the request terminal and releases the three slots
 * exactly once. Where a service existed it consumes the typed external F2 outcome (the immutable unused-release event); where
 * none did, the request-specific absence (F4) is fenced at THIS commit's own cut by the group's zero-version reads and is not
 * persisted here or anywhere.
 */
export const EconomyFreightCloseSchema = z.strictObject({
  request: z.strictObject({ fact_key: Id, request_ref: EntityId, version: z.literal(1) }),
  withdrawal: FactPin,
  no_dispatch_basis: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("NO_SERVICE_FENCED_AT_THIS_CUT") }),
    z.strictObject({
      kind: z.literal("UNUSED_RELEASE_REGISTERED"),
      /** WS-004 §28 typed external registration of the precise F2 outcome, by its immutable event identity */
      registration: z.strictObject({
        outcome: z.literal("F2"),
        owner: z.literal(OWNER_LOGISTICS),
        event: z.strictObject({
          fact_key: Id,
          event_id: EntityId,
          version: z.literal(1),
          content_sha256: Sha256,
        }),
        commitment: z.strictObject({
          fact_key: Id,
          version: Version.min(2),
          status: z.literal("RELEASED_UNUSED"),
        }),
      }),
    }),
  ]),
  released: z.strictObject({
    directive_use: Id,
    cargo: Id,
    requirement: Id,
  }),
  cut_basis_revision: z.number().int().nonnegative(),
  closed_at: CanonicalTimeSchema,
});
export type EconomyFreightClose = z.infer<typeof EconomyFreightCloseSchema>;

export const USE_CONSUMPTION_NATURE =
  "ONE_DIRECTIVE_USE_CONSUMED_WITH_ITS_UNUSED_HEADROOM_NOT_DELIVERY_RECEIPT_AVAILABILITY_OR_CREDIT";
/**
 * E1 (EL-01F F3 consumption): create-once, keyed by the directive identity and bound to the IMMUTABLE committed first-dispatch
 * event — the Transfer Record's owner key, its committed version (1), its content digest and the canonical dispatch commit
 * receipt — never to a live Transfer Record version, so later delivery or retirement can neither invalidate nor resurrect it.
 */
export const EconomyFreightUseConsumptionSchema = z.strictObject({
  directive_use_id: EntityId,
  request: z.strictObject({ fact_key: Id, request_ref: EntityId, version: z.literal(1) }),
  dispatch_event: z.strictObject({
    owner: z.literal(OWNER_LOGISTICS),
    transfer: z.strictObject({
      fact_key: Id,
      transfer_id: EntityId,
      version: z.literal(1),
      content_sha256: Sha256,
    }),
    receipt: z.strictObject({ group_id: Id, intent_id: Id }),
    dispatched_at: CanonicalTimeSchema,
  }),
  ceiling: PositiveQuantitySchema,
  dispatched: PositiveQuantitySchema,
  /** the numerical headroom of the one-use ceiling that this single use also consumes; it is never another output or request */
  unused_headroom: ProductionQuantitySchema,
  uses_consumed: z.literal(1),
  consumed_at: CanonicalTimeSchema,
  nature: z.literal(USE_CONSUMPTION_NATURE),
});
export type EconomyFreightUseConsumption = z.infer<typeof EconomyFreightUseConsumptionSchema>;

export const ECONOMY_OPERATION_RECORD_FREIGHT_RECEIPT = "economy-record-freight-receipt";
/** ER shares the transfer's causal process: it is the fourth stage of the one engaged delivery boundary. */
export const economyFreightReceiptStage = (requestRef: string) =>
  ({
    causal_process_id: `logistics-transfer:${requestRef}`,
    owner_operation: { owner: OWNER_ECONOMY, operation: ECONOMY_OPERATION_RECORD_FREIGHT_RECEIPT },
    prospective_result_id: `freight-receipt:${requestRef}`,
  }) as const;

/**
 * ER: the receipt-bound Economy result, consumed exactly once after World-State's ECT-01 and Logistics' retirement, bound to
 * the original allocation. It matches campaign/world, output, request/commitment/transfer, delivery cause, the ECT-01
 * owner/key/version, both loci, the boundary and the beneficiary.
 */
export const EconomyFreightReceiptSchema = z.strictObject({
  request: z.strictObject({ fact_key: Id, request_ref: EntityId, version: z.literal(1) }),
  consumption: FactPin,
  entity: z.strictObject({ fact_key: Id, entity_id: EntityId }),
  commitment: z.strictObject({
    fact_key: Id,
    version: Version.min(2),
    status: z.literal("RELEASED"),
  }),
  transfer: z.strictObject({ fact_key: Id, version: Version.min(2), status: z.literal("RETIRED") }),
  delivery: z.strictObject({ fact_key: Id, version: z.literal(1), cause_id: EntityId }),
  destination_commit: z.strictObject({
    owner: z.literal(OWNER_WORLD_STATE),
    fact_key: Id,
    version: z.literal(1),
    transition_id: EntityId,
  }),
  origin: Locality,
  destination: Locality,
  beneficiary_ref: Id,
  boundary: z.strictObject({ boundary_id: Id, at: CanonicalTimeSchema }),
  received: PositiveQuantitySchema,
  output_class: Id,
  received_at: CanonicalTimeSchema,
  close_stage: StageKeySchema,
});
export type EconomyFreightReceipt = z.infer<typeof EconomyFreightReceiptSchema>;

/**
 * AD: the independent AS-OF-NOW institutional-demand-adequacy conclusion (R2-D18 §4 step 10). It reads current destination
 * custody, the site requirement, the Production specification, the C-03 site-use relation and incompatible claims at its own
 * cut. It is not repair, production or duplicate inventory, and origin availability for the conserved output stays false.
 */
export const EconomyDestinationAdequacySchema = z.strictObject({
  request: z.strictObject({ fact_key: Id, request_ref: EntityId, version: z.literal(1) }),
  receipt: FactPin,
  requirement: z.strictObject({
    specification: FactPin,
    condition: FactPin,
    material_class: Id,
    quantity: PositiveQuantitySchema,
  }),
  custody: z.strictObject({
    authority: z.literal("WORLD_STATE"),
    locus: Locality,
    destination_commit: FactPin,
  }),
  site_use: ClauseReliance,
  result: z.strictObject({
    status: z.literal("WHOLE_RECEIVED_QUANTITY_AVAILABLE_FOR_SITE_PROVISIONING"),
    available: PositiveQuantitySchema,
    required: PositiveQuantitySchema,
    excludes: z.literal("NOT_REPAIR_PRODUCTION_OR_DUPLICATE_INVENTORY"),
  }),
  origin_availability: z.literal(false),
  assessed_at: CanonicalTimeSchema,
});
export type EconomyDestinationAdequacy = z.infer<typeof EconomyDestinationAdequacySchema>;

/** The scope of one Economy resolution: the profile's seal, by identity. The caller supplies no lot, quantity, winner or outcome. */
export const FreightResolutionScopeSchema = z.strictObject({ seal_id: EntityId });
export type FreightResolutionScope = z.infer<typeof FreightResolutionScopeSchema>;
/**
 * One Economy resolution: its scope (the profile's seal) and the owner-admitted event that opened it (WS-004 §25). The event is
 * named by its own fact key and must be one of the profile's own owner facts; it is never a choice among outcomes.
 */
export const FreightResolutionInputSchema = z.strictObject({ seal_id: EntityId, owner_event: Id });
export type FreightResolutionInput = z.infer<typeof FreightResolutionInputSchema>;
export const FreightRequestTargetSchema = z.strictObject({ request_ref: EntityId });
export type FreightRequestTarget = z.infer<typeof FreightRequestTargetSchema>;

// =============================================================================================
// EL-02S — Economy's owner-derived per-act current status, as witnessed on a Logistics act (R3-T2 §3). Freshly re-derived at
// each separate Logistics act and guarded at that act's own commit; never a durable eligibility flag.
// =============================================================================================

export const FREIGHT_ACT_KINDS = ["L0/service-admission", "L1/first-dispatch"] as const;
export const EconomyStatusWitnessSchema = z.strictObject({
  act: z.enum(FREIGHT_ACT_KINDS),
  request: z.strictObject({ fact_key: Id, request_ref: EntityId, version: z.literal(1) }),
  allocation: z.strictObject({
    fact_key: Id,
    version: Version.min(1),
    status: z.literal("pending"),
  }),
  slots: z.strictObject({ directive_use: FactPin, cargo: FactPin, requirement: FactPin }),
  holding: FactPin,
  requirement: z.strictObject({ specification: FactPin, condition: FactPin }),
  /** the legal provenance carried by Economy's result: Logistics compares it for equality and never evaluates GIP */
  legal: z.strictObject({
    seal: FactPin,
    gip_owner_head: GipOwnerHeadSchema,
    protected_heads: z
      .array(z.strictObject({ fact_key: Id, version: Version }))
      .length(PROTECTED_CLASSES.length),
    clauses: z.array(ClauseReliance).length(3),
  }),
  derived_at: CanonicalTimeSchema,
});
export type EconomyStatusWitness = z.infer<typeof EconomyStatusWitnessSchema>;

// =============================================================================================
// LOGISTICS — Non-Agentive Service Basis, its one whole-cargo slot, the immutable unused-release event (F2) and the freight
// dispatch enrollment receipt (the Temporal fence). The commitment and transfer extensions live in ./logistics.ts.
// =============================================================================================

export const logisticsServiceBasisKey = (basisId: string): string =>
  `logistics/service-basis/${basisId}`;
export const logisticsServiceSlotKey = (basisId: string): string =>
  `logistics/service-slot/${basisId}`;
export const logisticsUnusedReleaseKey = (requestId: string): string =>
  `logistics/unused-release/${requestId}`;
export const logisticsUnusedReleaseEventId = (requestId: string): string =>
  `unused-release:${requestId}`;
/** ONE receipt slot per campaign: the most recent first-profile freight dispatch, found by key, never by scan. */
export const LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY = "logistics/freight-dispatch-enrollment";

/** The typed lowering of a `service_premise` slice: an independently sourced, actual, non-agentive service. */
export const ServicePremiseSchema = z.strictObject({
  basis_id: EntityId,
  world_id: EntityId,
  origin_locus_id: EntityId,
  destination_locus_id: EntityId,
  whole_cargo_slots: z.literal(1),
  handling: z.strictObject({
    material_class: Id,
    /** the real physical limit of one whole cargo this service can load, carry and receive */
    max_quantity: PositiveQuantitySchema,
    loading: Text,
    receiving: Text,
  }),
  /** the source-qualified future delivery boundary: an authored instant, never a Logistics default or a travel-time model */
  delivery_boundary_at: CanonicalTimeSchema,
});
export type ServicePremise = z.infer<typeof ServicePremiseSchema>;

export const LogisticsServiceBasisSchema = z.strictObject({
  basis_id: EntityId,
  basis: z.literal("NON_AGENTIVE_SOURCE_QUALIFIED_SINGLE_WHOLE_CARGO_LEG"),
  origin: Locality,
  destination: Locality,
  /** the World-State corridor of exactly these ordered endpoints, pinned (topology only) */
  corridor: z.strictObject({
    owner: z.literal(OWNER_WORLD_STATE),
    fact_key: Id,
    version: Version.min(1),
  }),
  whole_cargo_slots: z.literal(1),
  handling: ServicePremiseSchema.shape.handling,
  delivery_boundary_at: CanonicalTimeSchema,
  original: SliceProvenanceSchema,
});
export type LogisticsServiceBasis = z.infer<typeof LogisticsServiceBasisSchema>;

export const LogisticsServiceSlotSchema = z.strictObject({
  basis: z.strictObject({ fact_key: Id, basis_id: EntityId }),
  state: z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("HELD"),
      commitment: z.strictObject({ fact_key: Id, request_id: EntityId }),
    }),
    z.strictObject({
      status: z.literal("FREE"),
      released_by: z.strictObject({ fact_key: Id, event_id: EntityId }),
    }),
  ]),
});
export type LogisticsServiceSlot = z.infer<typeof LogisticsServiceSlotSchema>;

/**
 * F2: the immutable canonical event of an UNUSED release of an existing Movement-Service Commitment (WS-010 §§3.2, 4.3, 9,
 * 10.4), committed by Logistics alone and only with the Transfer Record guarded absent in the same commit, after Economy's
 * protective withdrawal-pending admission. It is not delivery, and it is not the after-destination release.
 */
export const LogisticsUnusedReleaseSchema = z.strictObject({
  event_id: EntityId,
  outcome: z.literal("F2"),
  request: z.strictObject({
    owner: z.literal(OWNER_ECONOMY),
    fact_key: Id,
    request_id: EntityId,
    version: z.literal(1),
  }),
  commitment: z.strictObject({
    fact_key: Id,
    commitment_id: EntityId,
    version_before: Version.min(1),
  }),
  moved: z.strictObject({ fact_key: Id, entity_id: EntityId }),
  no_dispatch: z.literal("TRANSFER_RECORD_GUARDED_ABSENT_IN_THIS_COMMIT"),
  /** the protective Economy state this release follows (owner, key and exact version read) */
  protective_state: z.strictObject({
    owner: z.literal(OWNER_ECONOMY),
    withdrawal: FactPin,
    allocation: FactPin,
  }),
  service_slot: z.strictObject({ fact_key: Id }),
  released_at: CanonicalTimeSchema,
});
export type LogisticsUnusedRelease = z.infer<typeof LogisticsUnusedReleaseSchema>;

/**
 * Logistics' pending-until-safe enrollment receipt for the most recent first-profile first dispatch. While its Temporal object
 * is unregistered or Economy's one-use consumption is absent, canonical time may not reach its delivery boundary on any path.
 */
export const LogisticsFreightDispatchEnrollmentSchema = z.strictObject({
  request_id: EntityId,
  transfer: z.strictObject({ fact_key: Id, transfer_id: EntityId }),
  directive_use_id: EntityId,
  delivery: z.strictObject({ boundary_id: Id, at: CanonicalTimeSchema }),
  dispatched_at: CanonicalTimeSchema,
});
export type LogisticsFreightDispatchEnrollment = z.infer<
  typeof LogisticsFreightDispatchEnrollmentSchema
>;

/** What a service admission names: the fixed Economy request and the independently admitted service basis. Nothing else. */
export const AdmitFreightServiceInputSchema = z.strictObject({
  request_ref: EntityId,
  basis_id: EntityId,
});
export const AdmitServiceBasisInputSchema = z.strictObject({
  world_id: EntityId,
  slice_id: EntityId,
});

/** The freight part of a first-profile Movement-Service Commitment (L0). */
export const LogisticsFreightCommitmentSchema = z.strictObject({
  request_class: FreightProfileLiteral,
  /** the request's directive-use identity, by reference (EL-01F "Unit and identity"): it names Economy's one-use consumption */
  directive_use_id: EntityId,
  service: z.strictObject({
    basis: FactPin,
    slot: z.strictObject({ fact_key: Id }),
  }),
  cargo: z.strictObject({ material_class: Id, quantity: PositiveQuantitySchema }),
  /** EL-02S S0: Economy's current status for THIS service-admission act, guarded at this commit */
  economy_status: EconomyStatusWitnessSchema,
  unused_release_condition: z.literal("BEFORE_DISPATCH_ONLY_WITH_TRANSFER_RECORD_GUARDED_ABSENT"),
});
export type LogisticsFreightCommitment = z.infer<typeof LogisticsFreightCommitmentSchema>;

/** The freight part of a first-profile Transfer Record (L1 / F3: first dispatch, never delivery). */
export const LogisticsFreightTransferSchema = z.strictObject({
  request_class: FreightProfileLiteral,
  /** EL-02S S1: Economy's current status for THIS first-dispatch act, independently re-derived */
  economy_status: EconomyStatusWitnessSchema,
  dispatched: PositiveQuantitySchema,
});
export type LogisticsFreightTransfer = z.infer<typeof LogisticsFreightTransferSchema>;
