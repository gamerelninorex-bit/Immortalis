import {
  AssembleLegalInputSchema,
  COVERAGE_ITEMS,
  OpeningBasisSchema,
  FACET_GIP_INSTITUTION_IDENTITY,
  FREIGHT_CLAUSES,
  FREIGHT_CLAUSE_EFFECT,
  FREIGHT_PROFILE,
  GovernanceInstrumentSchema,
  InputLotPremiseSchema,
  InstitutionIdentitySchema,
  InstrumentClauseSchema,
  LegalPremiseSchema,
  LegalReadinessSealSchema,
  MaterialSpecificationPremiseSchema,
  OWNER_GIP,
  OfficeAuthorityLocusSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PublicationSchema,
  ScopeBindingSchema,
  ServicePremiseSchema,
  SiteConditionPremiseSchema,
  TEMPORAL_STATE_KEY,
  fail,
  gipOpeningBasisKey,
  gipInstitutionIdentityKey,
  gipInstrumentClauseKey,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipReadinessSealKey,
  gipScopeBindingKey,
  logisticsServiceBasisKey,
  ok,
  productionInputLotKey,
  productionMaterialSpecificationKey,
  worldSiteConditionKey,
  type ClauseApplicability,
  type ClausePremise,
  type CommitGroup,
  type OpeningBasis,
  type FreightClause,
  type GipOwnerHead,
  type InstrumentClause,
  type LegalPremise,
  type LegalReadinessSeal,
  type OpeningAttestation,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import {
  canonicalNow,
  checkPlan,
  committedAct,
  planned,
  publishPlan,
  refuse,
  sealedSlice,
  sealedSlicesOfKind,
  stateSource,
  storeSource,
  type FreightErrorCode,
  type FreightRefusalCode,
  type FreightSource,
  type Planned,
} from "./common.ts";
import { FREIGHT_GIP_RULE, resolveKey } from "../owners/registry.ts";
import { reject, type Rejection } from "../owners/rejection.ts";
import type { CampaignStore, CommitOutcome } from "../persistence/store.ts";
import {
  protectedHeadChange,
  protectedHeadKeys,
  protectedHeadPins,
  readOpeningAttestation,
} from "./world.ts";
import { gipOwnerHeadAfterCreate } from "./gip-owner-head.ts";

/**
 * IM-06 GIP — the legal half of the ROADBED first freight profile (R2-D18 v1.2.1 §§1, 1.1, 1.2, 2, 2.1, 3.1, 3.2, 3.5).
 *
 * GIP alone owns legal coverage, competence and current force. From the ONE sealed `legal` slice of the attested opening it
 * establishes the Opening Constitutive Basis (with the Closed Governing Coverage), the separately addressable clauses of ONE
 * Governance Instrument (whose legacy scalar `operative_effect` is untouched and never becomes an array), and the Legal
 * Readiness Seal. Applicability is never stored: `evaluateClauses` derives applies / does_not_apply / contested / unresolved
 * for exact clause identities against one coherent cut, and a caller's verdict is never accepted. After the seal the profile
 * writes NO authoritative GIP fact: no use counter, implementation status, new scope, clause, office act or seal rewrite.
 */

// ---------------------------------------------------------------------------------------------
// The one legal slice
// ---------------------------------------------------------------------------------------------

interface LegalSource {
  readonly attestation: { readonly fact: OwnerFact; readonly value: OpeningAttestation };
  readonly premise: LegalPremise;
  readonly provenance: OpeningBasis["original"];
}

/**
 * The typed legal premise of a world's attested opening. Exactly ONE legal slice exists: a second one is a second governing
 * order, which may not be folded into the one Instrument for convenience (R2-D18 §1.2), and none is no competent order.
 */
function legalSource(src: FreightSource, worldId: string): Result<LegalSource, FreightRefusalCode> {
  const attestation = readOpeningAttestation(src, worldId);
  if (!attestation)
    return refuse(
      "PREREQUISITE_MISSING",
      "no Opening Source Attestation is committed for this world",
    );
  const legal = sealedSlicesOfKind(attestation.value, "legal");
  if (legal.length !== 1)
    return refuse(
      "SOURCE_REFUSED",
      legal.length === 0
        ? "the sealed envelope carries no governing order"
        : "the sealed envelope carries more than one governing order: a distinct order is not folded into one Instrument",
      { legal_slices: legal.length },
    );
  const sealed = sealedSlice(src, worldId, legal[0]!.slice_id, "legal");
  if (!sealed.ok) return sealed;
  const premise = LegalPremiseSchema.safeParse(sealed.value.slice.premise);
  if (!premise.success)
    return refuse("SOURCE_REFUSED", "the legal slice is not a typed governing order", {
      issues: premise.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  const p = premise.data;
  const pins = attestation.value.pins;
  if (
    p.jurisdiction.world_id !== worldId ||
    p.jurisdiction.origin_locus_id !== pins.origin.entity_id ||
    p.jurisdiction.destination_locus_id !== pins.destination.entity_id
  )
    return refuse(
      "SOURCE_REFUSED",
      "the order's jurisdiction is exactly the attested world and its two endpoints",
    );
  return ok({ attestation, premise: p, provenance: sealed.value.provenance });
}

// ---------------------------------------------------------------------------------------------
// Opening Constitutive Basis with Closed Governing Coverage
// ---------------------------------------------------------------------------------------------

/**
 * The Basis the legal slice determines. The Closed Governing Coverage lists every coverage item exactly once (silence is not
 * absence: a missing or repeated item refuses) and every clause provision the order establishes. It records the order's
 * dispositions as authored — an unresolved or contested item is carried, and it is the SEAL that then refuses readiness.
 * Established after canonical T0 and before any other assembly write.
 */
export function deriveOpeningBasis(src: FreightSource, worldId: string): Planned {
  const source = legalSource(src, worldId);
  if (!source.ok) return source;
  const { attestation, premise: p, provenance } = source.value;
  if (!canonicalNow(src))
    return refuse("PREREQUISITE_MISSING", "canonical T0 is initialized before the legal assembly", {
      key: TEMPORAL_STATE_KEY,
    });
  const items = COVERAGE_ITEMS.map((item) => p.coverage.filter((c) => c.item === item));
  if (items.some((found) => found.length !== 1) || p.coverage.length !== COVERAGE_ITEMS.length)
    return refuse(
      "SOURCE_REFUSED",
      "the Closed Governing Coverage disposes of every coverage item exactly once: silence is not absence",
    );
  const bySlot = FREIGHT_CLAUSES.map((clause) => p.clauses.filter((c) => c.clause === clause));
  if (bySlot.some((found) => found.length > 1))
    return refuse("SOURCE_REFUSED", "a clause slot is established by at most one provision");
  if (bySlot.some((found) => found.length === 0))
    return refuse(
      "SOURCE_REFUSED",
      "the order does not establish all seven operative clauses: permission alone never supplies a direction",
      { missing: FREIGHT_CLAUSES.filter((_, i) => bySlot[i]!.length === 0) },
    );
  const key = gipOpeningBasisKey(p.basis_id);
  if (src.getFact(key)) return refuse("NOT_ADMISSIBLE", "the Basis is established once", { key });
  const value = OpeningBasisSchema.safeParse({
    basis_id: p.basis_id,
    profile: FREIGHT_PROFILE,
    governing_order: p.governing_order,
    antecedent: p.antecedent,
    constitutive_competence: {
      institution_id: p.institution.institution_id,
      office_id: p.authority_locus.office_id,
      competence: p.authority_locus.competence,
      procedure: p.procedure,
    },
    closed_governing_coverage: {
      world_id: p.jurisdiction.world_id,
      origin_locus_id: p.jurisdiction.origin_locus_id,
      destination_locus_id: p.jurisdiction.destination_locus_id,
      instrument_id: p.instrument_id,
      scope_binding_id: p.scope_binding_id,
      clause_provision_ids: bySlot.map((found) => found[0]!.provision_id),
      items: items.map((found) => found[0]!),
    },
    original: provenance,
  });
  if (!value.success)
    return refuse("SOURCE_REFUSED", "the legal slice is not a representable Basis");
  return planned(
    [{ key, value: value.data, expected_version: 0 }],
    [attestation.fact.key, TEMPORAL_STATE_KEY],
  );
}

// ---------------------------------------------------------------------------------------------
// The separately addressable clauses of ONE Instrument
// ---------------------------------------------------------------------------------------------

function effectViolation(c: ClausePremise): string | null {
  const required = FREIGHT_CLAUSE_EFFECT[c.clause];
  if (c.effect_class === required)
    return c.lawful_equivalent_evidence === null
      ? null
      : "a clause of its own effect class carries no equivalence evidence";
  // R2-D18 §2: only C-02 may carry "the order's demonstrably correct equivalent", and only with that evidence
  if (c.clause === "C-02" && c.lawful_equivalent_evidence !== null) return null;
  return `${c.clause} is a ${required}: a provision of another effect class is not this clause`;
}

/**
 * The clause facts the legal slice determines for its one committed Instrument: one fact per provision, each with its own
 * stable provision identity, effect class, typed terms, scope, covered revision and slice provenance. Refused when any
 * provision names a different governing order (one Instrument is lawful only if the SAME original order creates all effects),
 * carries the wrong effect class, or does not address the profile's own institution, endpoints and lot.
 */
export function deriveInstrumentClauses(src: FreightSource, worldId: string): Planned {
  const source = legalSource(src, worldId);
  if (!source.ok) return source;
  const { premise: p, provenance } = source.value;
  const basisKey = gipOpeningBasisKey(p.basis_id);
  const instrumentKey = gipInstrumentKey(p.instrument_id);
  const basis = src.getFact(basisKey);
  const instrument = src.getFact(instrumentKey);
  if (!basis || !instrument)
    return refuse(
      "PREREQUISITE_MISSING",
      "the Basis and the Instrument are established before its clauses",
      { basis: basisKey, instrument: instrumentKey },
    );
  const inst = GovernanceInstrumentSchema.safeParse(instrument.value);
  if (!inst.success) return refuse("SOURCE_REFUSED", "the Instrument is malformed");
  const order = p.governing_order.order_id;
  const j = p.jurisdiction;
  const institution = p.institution.institution_id;
  const writes = [];
  for (const c of p.clauses) {
    if (c.order_id !== order)
      return refuse(
        "SOURCE_REFUSED",
        "a provision of a different governing order is not a clause of this Instrument",
        { provision_id: c.provision_id, order_id: c.order_id },
      );
    const effect = effectViolation(c);
    if (effect) return refuse("SOURCE_REFUSED", effect, { provision_id: c.provision_id });
    const t = c.terms as Record<string, unknown>;
    const mismatch =
      ("institution_id" in t && t["institution_id"] !== institution) ||
      ("office_id" in t && t["office_id"] !== p.authority_locus.office_id) ||
      ("world_id" in t && t["world_id"] !== j.world_id) ||
      ("origin_locus_id" in t && t["origin_locus_id"] !== j.origin_locus_id) ||
      ("destination_locus_id" in t && t["destination_locus_id"] !== j.destination_locus_id);
    if (mismatch)
      return refuse(
        "SOURCE_REFUSED",
        "a clause addresses exactly the order's own institution, authority locus, world and endpoints",
        { provision_id: c.provision_id },
      );
    const key = gipInstrumentClauseKey(p.instrument_id, c.provision_id);
    if (src.getFact(key)) return refuse("NOT_ADMISSIBLE", "a clause is established once", { key });
    const value = InstrumentClauseSchema.safeParse({
      clause: c.clause,
      provision_id: c.provision_id,
      instrument: {
        fact_key: instrumentKey,
        instrument_id: p.instrument_id,
        version: instrument.version,
      },
      governing_order_ref: order,
      effect_class: c.effect_class,
      lawful_equivalent_evidence: c.lawful_equivalent_evidence,
      statement: c.statement,
      scope_binding_ref: inst.data.scope_binding_ref,
      covered_revision: { basis: { fact_key: basisKey, version: basis.version } },
      original: provenance,
      terms: c.terms,
    });
    if (!value.success)
      return refuse("SOURCE_REFUSED", "the provision is not a representable clause", {
        provision_id: c.provision_id,
      });
    writes.push({ key, value: value.data, expected_version: 0 });
  }
  if (writes.length === 0) return refuse("SOURCE_REFUSED", "the order establishes no clause");
  if (new Set(writes.map((w) => w.key)).size !== writes.length)
    return refuse("SOURCE_REFUSED", "provision identities are unique within the Instrument");
  return planned(writes, [source.value.attestation.fact.key, basisKey, instrumentKey]);
}

// ---------------------------------------------------------------------------------------------
// Legal Readiness Seal
// ---------------------------------------------------------------------------------------------

const READY: Readonly<Record<(typeof COVERAGE_ITEMS)[number], readonly string[]>> = {
  constitutive_competence: ["evidenced"],
  jurisdiction_origin: ["evidenced"],
  jurisdiction_destination: ["evidenced"],
  institution_authority_locus: ["evidenced"],
  applicability_procedure: ["evidenced", "established_inapplicable"],
  publication_or_notice: ["evidenced", "established_inapplicable"],
  concurrence_or_outside_determination: ["evidenced", "established_inapplicable"],
  priority_precedence: ["evidenced", "established_inapplicable"],
  incorporation: ["evidenced", "established_inapplicable"],
  // a second order is never "evidenced into" this Instrument: it is expressly established inapplicable or readiness fails
  conflicting_orders: ["established_inapplicable"],
  exceptions: ["evidenced", "established_inapplicable"],
  // Variant A: the source must expressly establish that no sunset applies; absence of a date is not that proof
  sunset_or_expiry: ["established_inapplicable"],
};

/** Keys of the owner admissions the envelope's OTHER slices determine: each must still be absent when the seal closes. */
function prematureAdmissionKeys(a: OpeningAttestation): readonly string[] {
  const worldId = a.world.entity_id;
  const keys: string[] = [];
  for (const s of a.envelope.slices) {
    if (s.slice_kind === "site_condition") {
      const p = SiteConditionPremiseSchema.safeParse(s.premise);
      if (p.success) keys.push(worldSiteConditionKey(worldId, p.data.condition_id));
    } else if (s.slice_kind === "material_specification") {
      const p = MaterialSpecificationPremiseSchema.safeParse(s.premise);
      if (p.success) keys.push(productionMaterialSpecificationKey(p.data.specification_id));
    } else if (s.slice_kind === "input_lot") {
      const p = InputLotPremiseSchema.safeParse(s.premise);
      if (p.success) keys.push(productionInputLotKey(p.data.lot_id));
    } else if (s.slice_kind === "service_premise") {
      const p = ServicePremiseSchema.safeParse(s.premise);
      if (p.success) keys.push(logisticsServiceBasisKey(p.data.basis_id));
    }
  }
  return keys;
}

/** The seal's identity is its Basis's: one Basis is sealed once, and a second seal is unrepresentable. */
export const sealIdOfBasis = (basisId: string): string => basisId;

/**
 * The Legal Readiness Seal the assembled legal source determines. It is refused (with GIP's own answer: `contested` when the
 * order or its validity is contested, `unresolved` otherwise) unless: every coverage item is evidenced or expressly established
 * inapplicable as that item requires; the institution, the office (whose authority source is the ANTECEDENT provision, never
 * the Instrument), the Scope Binding and the Instrument are the ones the order names; the Instrument is `active`, carries no
 * sunset, rests on this Basis and is `valid` under this governing order and under no other; all seven clauses are established;
 * canonical time is still exactly T0 (no advance); no player character is bound; and no premise of the envelope's other slices
 * has been admitted early. It pins the per-class World-State protected heads and records the GIP owner head BEFORE its own
 * commit, so the post-seal head is obtained from the completed commit and never from a digest of itself.
 */
export function deriveReadinessSeal(src: FreightSource, worldId: string): Planned {
  const source = legalSource(src, worldId);
  if (!source.ok) return source;
  const { attestation, premise: p } = source.value;
  const not = (applicability: ClauseApplicability, message: string, details?: object) =>
    refuse("WITHHELD", message, { applicability, ...details });

  const basisKey = gipOpeningBasisKey(p.basis_id);
  const institutionKey = gipInstitutionIdentityKey(p.institution.institution_id);
  const officeKey = gipOfficeAuthorityLocusKey(
    p.institution.institution_id,
    p.authority_locus.office_id,
  );
  const bindingKey = gipScopeBindingKey(
    p.institution.institution_id,
    p.authority_locus.office_id,
    p.scope_binding_id,
  );
  const instrumentKey = gipInstrumentKey(p.instrument_id);
  const facts = {
    basis: src.getFact(basisKey),
    institution: src.getFact(institutionKey),
    office: src.getFact(officeKey),
    binding: src.getFact(bindingKey),
    instrument: src.getFact(instrumentKey),
  };
  if (!facts.basis || !facts.institution || !facts.office || !facts.binding || !facts.instrument)
    return refuse(
      "PREREQUISITE_MISSING",
      "the Basis, institution, office, Scope Binding and Instrument are assembled before the seal",
      {
        missing: Object.entries(facts)
          .filter(([, f]) => !f)
          .map(([k]) => k),
      },
    );
  const basis = OpeningBasisSchema.safeParse(facts.basis.value);
  const institution = InstitutionIdentitySchema.safeParse(facts.institution.value);
  const office = OfficeAuthorityLocusSchema.safeParse(facts.office.value);
  const binding = ScopeBindingSchema.safeParse(facts.binding.value);
  const instrument = GovernanceInstrumentSchema.safeParse(facts.instrument.value);
  if (
    !basis.success ||
    !institution.success ||
    !office.success ||
    !binding.success ||
    !instrument.success
  )
    return refuse("SOURCE_REFUSED", "an assembled legal fact is malformed");

  // Closed Governing Coverage: every item evidenced or expressly established inapplicable, as the item requires
  for (const item of basis.data.closed_governing_coverage.items) {
    if (item.disposition === "contested")
      return not("contested", "the order's coverage is contested: not readiness", {
        item: item.item,
      });
    if (!READY[item.item].includes(item.disposition))
      return not(
        "unresolved",
        "a coverage item is neither evidenced nor expressly established inapplicable as it must be",
        { item: item.item, disposition: item.disposition },
      );
  }
  // competence: the office's authority rests on the independently authored antecedent provision
  if (office.data.authority_source_ref !== p.antecedent.provision_ref)
    return not(
      "unresolved",
      "the authority locus does not rest on the antecedent provision: an Instrument cannot create its own competence",
    );
  const i = instrument.data;
  if (
    i.source_authority_ref !== officeKey ||
    i.scope_binding_ref !== bindingKey ||
    i.authority_basis_ref !== p.basis_id
  )
    return not(
      "unresolved",
      "the Instrument is not the one this order's authority, scope and Basis determine",
    );
  const order = p.governing_order.order_id;
  if (i.validity_by_order.some((v) => v.governing_order_ref !== order))
    return not(
      "unresolved",
      "the Instrument carries validity under another governing order: a second order is unresolved here",
    );
  if (i.validity_by_order.length === 0)
    return not("unresolved", "the Instrument carries no validity under its governing order");
  if (i.validity_by_order.some((v) => v.validity_status === "contested"))
    return not("contested", "the Instrument's validity under its governing order is contested");
  if (i.validity_by_order.some((v) => v.validity_status !== "valid"))
    return not("unresolved", "the Instrument is not valid under its governing order");
  if (i.lifecycle_status !== "active")
    return not("unresolved", "the Instrument is not operative in the setting at T0");
  if (i.sunset_condition !== undefined)
    return not(
      "unresolved",
      "the Instrument carries a sunset: an order whose permission expires is Variant B, excluded from this profile",
    );

  // all seven clauses, in slot order, each the committed fact its provision determines
  const clauses = [];
  const clauseKeys = [];
  for (const slot of FREIGHT_CLAUSES) {
    const c = p.clauses.find((x) => x.clause === slot);
    const key = c ? gipInstrumentClauseKey(p.instrument_id, c.provision_id) : undefined;
    const fact = key ? src.getFact(key) : undefined;
    const parsed = fact ? InstrumentClauseSchema.safeParse(fact.value) : undefined;
    if (!c || !key || !fact || !parsed?.success || parsed.data.clause !== slot)
      return refuse(
        "PREREQUISITE_MISSING",
        "every one of the seven operative clauses is established before the seal",
        { clause: slot },
      );
    clauses.push({
      clause: slot,
      provision_id: c.provision_id,
      fact_key: key,
      version: fact.version,
    });
    clauseKeys.push(key);
  }

  // T0, NULL-PC and no premature premise admission
  const clock = src.getFact(TEMPORAL_STATE_KEY);
  const now = canonicalNow(src);
  if (!clock || !now)
    return refuse("PREREQUISITE_MISSING", "canonical T0 is initialized before the seal");
  if (clock.version !== 1)
    return refuse(
      "NOT_ADMISSIBLE",
      "canonical time advanced during the opening: readiness is sealed at T0 with no intervening advance",
    );
  if (src.getFact(PLAYER_CHARACTER_BINDING_KEY))
    return refuse("NOT_ADMISSIBLE", "the opening is the NULL-PC original-world profile only");
  const premature = prematureAdmissionKeys(attestation.value);
  const early = premature.find((k) => src.getFact(k));
  if (early)
    return refuse(
      "NOT_ADMISSIBLE",
      "only the named opening writes are allowed through readiness: a premise was admitted before the seal",
      { key: early },
    );

  const heads = protectedHeadPins(src, attestation);
  if (!heads.ok) return refuse("SOURCE_REFUSED", heads.error.message, heads.error.details);
  const sealId = sealIdOfBasis(p.basis_id);
  const key = gipReadinessSealKey(sealId);
  if (src.getFact(key))
    return refuse(
      "NOT_ADMISSIBLE",
      "readiness is sealed once: the seal is never reopened or recomputed",
      {
        key,
      },
    );
  const value = LegalReadinessSealSchema.parse({
    seal_id: sealId,
    profile: FREIGHT_PROFILE,
    world: attestation.value.world,
    basis: { fact_key: basisKey, version: facts.basis.version },
    institution: { fact_key: institutionKey, version: facts.institution.version },
    office: { fact_key: officeKey, version: facts.office.version },
    scope_binding: { fact_key: bindingKey, version: facts.binding.version },
    instrument: { fact_key: instrumentKey, version: facts.instrument.version },
    clauses,
    attestation: { fact_key: attestation.fact.key, version: attestation.fact.version },
    envelope_digest: attestation.value.envelope.digest,
    world_state_protected_heads: [...heads.value],
    gip_owner_head_before: src.gipOwnerHead(),
    t0: { temporal_state: { fact_key: TEMPORAL_STATE_KEY, version: 1 }, at: now },
  } satisfies LegalReadinessSeal);
  return planned(
    [{ key, value, expected_version: 0 }],
    [
      attestation.fact.key,
      basisKey,
      institutionKey,
      officeKey,
      bindingKey,
      instrumentKey,
      ...clauseKeys,
      ...protectedHeadKeys(heads.value),
      TEMPORAL_STATE_KEY,
      PLAYER_CHARACTER_BINDING_KEY,
      ...premature,
    ],
  );
}

// ---------------------------------------------------------------------------------------------
// Derived current applicability (never stored)
// ---------------------------------------------------------------------------------------------

export interface SealContext {
  readonly fact: OwnerFact;
  readonly seal: LegalReadinessSeal;
  /** the head the completed seal commit produced: the pre-seal head plus the seal's one create */
  readonly postSealHead: GipOwnerHead;
}

export function readSeal(
  src: Pick<FreightSource, "getFact">,
  sealId: string,
): SealContext | undefined {
  const fact = src.getFact(gipReadinessSealKey(sealId));
  const parsed = fact ? LegalReadinessSealSchema.safeParse(fact.value) : undefined;
  if (!fact || !parsed?.success) return undefined;
  return {
    fact,
    seal: parsed.data,
    postSealHead: gipOwnerHeadAfterCreate(parsed.data.gip_owner_head_before, 1),
  };
}

/** The act-specific facts one clause is asked about. A field left out is simply not asserted by this act. */
export interface ClauseQuery {
  readonly clause: FreightClause;
  readonly subject: Readonly<Record<string, string>>;
  /** C-04 only: the whole quantity to dispatch, checked against the positive one-use ceiling in its own unit */
  readonly quantity?: { readonly amount: number; readonly unit: string };
}

export interface ClauseAnswer {
  readonly clause: FreightClause;
  readonly applicability: ClauseApplicability;
  /** GIP's reason, a stable code (never prose a caller could author) */
  readonly reason: string;
  readonly fact_key: string;
  readonly version: number;
  readonly value: InstrumentClause | undefined;
}

export interface ClauseEvaluation {
  readonly answers: readonly ClauseAnswer[];
  /** every key the evaluation read: the act that relies on it guards each at the version read */
  readonly reads: readonly string[];
  readonly seal: SealContext | undefined;
}

/**
 * GIP's fresh, query-scoped answer for exact clause identities at ONE coherent cut (R2-D18 §3.1): fail-closed and derived.
 *
 *  - `unresolved`: readiness is not sealed; the sealed GIP owner head no longer equals the campaign's (ANY authoritative GIP
 *    write since the seal); a protected World-State head P-1..P-4 differs from the sealed one; or a pinned legal fact is
 *    missing or moved. The first freight profile is then permanently unusable for prospective acts — and nothing is written.
 *  - `contested`: the Instrument's validity under its governing order is contested.
 *  - `does_not_apply`: the Instrument is not valid or not `active` (expired / repealed force), or the act's subject proves a
 *    mismatch with the clause's exact terms (institution, world, endpoints, lot, material, unit, or a quantity over the ceiling).
 *  - `applies`: otherwise.
 */
export function evaluateClauses(
  src: FreightSource,
  sealId: string,
  queries: readonly ClauseQuery[],
): ClauseEvaluation {
  const sealKey = gipReadinessSealKey(sealId);
  const ctx = readSeal(src, sealId);
  const reads = new Set<string>([sealKey]);
  const all = (applicability: ClauseApplicability, reason: string): ClauseEvaluation => ({
    answers: queries.map((q) => {
      const pin = ctx?.seal.clauses.find((c) => c.clause === q.clause);
      return {
        clause: q.clause,
        applicability,
        reason,
        fact_key: pin?.fact_key ?? sealKey,
        version: pin?.version ?? 0,
        value: undefined,
      };
    }),
    reads: [...reads],
    seal: ctx,
  });
  if (!ctx) return all("unresolved", "READINESS_NOT_SEALED");
  const { seal } = ctx;
  for (const k of protectedHeadKeys(seal.world_state_protected_heads)) reads.add(k);
  reads.add(seal.instrument.fact_key);
  reads.add(seal.basis.fact_key);

  // the Instrument as it now stands: order-relative validity and lifecycle are separate dimensions
  const instrumentFact = src.getFact(seal.instrument.fact_key);
  const instrument = instrumentFact
    ? GovernanceInstrumentSchema.safeParse(instrumentFact.value)
    : undefined;
  if (!instrumentFact || !instrument?.success) return all("unresolved", "INSTRUMENT_UNREADABLE");
  const validity = instrument.data.validity_by_order;
  if (validity.some((v) => v.validity_status === "contested"))
    return all("contested", "INSTRUMENT_VALIDITY_CONTESTED");
  if (validity.some((v) => v.validity_status === "unresolved"))
    return all("unresolved", "INSTRUMENT_VALIDITY_UNRESOLVED");
  if (validity.length === 0 || validity.some((v) => v.validity_status !== "valid"))
    return all("does_not_apply", "INSTRUMENT_NOT_VALID");
  if (instrument.data.lifecycle_status !== "active")
    return all("does_not_apply", "INSTRUMENT_NOT_IN_FORCE");

  // any authoritative GIP change anywhere in the campaign since the seal
  const head = src.gipOwnerHead();
  if (!canonicalEqual(head, ctx.postSealHead)) return all("unresolved", "GIP_OWNER_HEAD_CHANGED");
  // any owner-admitted protected World-State governing-premise change since the seal
  const changed = protectedHeadChange(src, seal.world_state_protected_heads);
  if (changed) return all("unresolved", `PROTECTED_HEAD_CHANGED_${changed.protected_class}`);

  const answers = queries.map((q): ClauseAnswer => {
    const pin = seal.clauses.find((c) => c.clause === q.clause)!;
    reads.add(pin.fact_key);
    const fact = src.getFact(pin.fact_key);
    const parsed = fact ? InstrumentClauseSchema.safeParse(fact.value) : undefined;
    const base = { clause: q.clause, fact_key: pin.fact_key, version: fact?.version ?? 0 };
    if (!fact || !parsed?.success || fact.version !== pin.version)
      return {
        ...base,
        applicability: "unresolved",
        reason: "CLAUSE_UNREADABLE",
        value: undefined,
      };
    const value = parsed.data;
    const terms = value.terms as Record<string, unknown>;
    for (const [field, asserted] of Object.entries(q.subject))
      if (field in terms && terms[field] !== asserted)
        return {
          ...base,
          applicability: "does_not_apply",
          reason: `SUBJECT_MISMATCH_${field.toUpperCase()}`,
          value,
        };
    if (value.clause === "C-04" && q.quantity) {
      if (q.quantity.unit !== value.terms.ceiling.unit)
        return { ...base, applicability: "does_not_apply", reason: "SUBJECT_MISMATCH_UNIT", value };
      if (q.quantity.amount > value.terms.ceiling.amount)
        return { ...base, applicability: "does_not_apply", reason: "CEILING_EXCEEDED", value };
    }
    return { ...base, applicability: "applies", reason: "APPLIES", value };
  });
  return { answers, reads: [...reads], seal: ctx };
}

// ---------------------------------------------------------------------------------------------
// IM-11 admission
// ---------------------------------------------------------------------------------------------

const FREIGHT_GIP_KINDS = new Set([
  "gip_opening_basis",
  "gip_instrument_clause",
  "gip_legal_readiness_seal",
]);
export const writesGipFreightKind = (group: CommitGroup): boolean =>
  group.writes.some((w) => FREIGHT_GIP_KINDS.has(resolveKey(w.key)?.kind.id ?? ""));

/** GIP's first-profile facts change only by the three re-derived assembly acts (raw `store.commit` included). */
export function gipFreightGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const src = stateSource(state);
  const kinds = new Set(group.writes.map((w) => resolveKey(w.key)?.kind.id));
  if (kinds.size !== 1)
    return reject("VALUE_INVALID", "a legal assembly act writes one kind of GIP fact");
  const first = group.writes[0]!;
  if (kinds.has("gip_opening_basis")) {
    const b = OpeningBasisSchema.parse(first.value);
    return checkPlan(
      group,
      state,
      deriveOpeningBasis(src, b.closed_governing_coverage.world_id),
    );
  }
  if (kinds.has("gip_instrument_clause")) {
    const c = InstrumentClauseSchema.parse(first.value);
    const basis = src.getFact(c.covered_revision.basis.fact_key);
    const parsed = basis ? OpeningBasisSchema.safeParse(basis.value) : undefined;
    if (!parsed?.success)
      return reject("PREREQUISITE_MISSING", "a clause is qualified under a committed Basis", {
        key: c.covered_revision.basis.fact_key,
      });
    return checkPlan(
      group,
      state,
      deriveInstrumentClauses(src, parsed.data.closed_governing_coverage.world_id),
    );
  }
  const s = LegalReadinessSealSchema.parse(first.value);
  return checkPlan(group, state, deriveReadinessSeal(src, s.world.entity_id));
}

// ---------------------------------------------------------------------------------------------
// Authored operations (archivist path)
// ---------------------------------------------------------------------------------------------

const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, {
    issues: e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
  });
const refused = (r: {
  error: { code: string; message: string; details?: Record<string, unknown> };
}) => fail(r.error.code as FreightErrorCode, r.error.message, r.error.details);
const pick = (i: Publication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: i.secrecy,
});

/**
 * The three first-profile legal assembly acts. A caller names the world whose attested opening is being assembled and nothing
 * else: every legal value comes from the sealed slice, and each act is refused unless it is exactly what that slice and the
 * already-committed GIP facts determine. There is no applicability setter, no eligibility writer and no post-seal GIP write.
 */
export class GipFreightAdapter {
  readonly #store: CampaignStore;
  constructor(store: CampaignStore) {
    this.#store = store;
  }

  async #act(
    input: Publication & { readonly assembly: unknown },
    kind: string,
    derive: (src: FreightSource, worldId: string) => Planned,
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = AssembleLegalInputSchema.safeParse(input.assembly);
    if (!i.success) return invalid("assembly", i.error);
    const attestation = readOpeningAttestation(this.#store, i.data.world_id);
    const prior = committedAct(this.#store, p.data, (g) =>
      g.writes.every((w) => {
        if (resolveKey(w.key)?.kind.id !== kind) return false;
        const original = (w.value as { original?: { attestation?: { fact_key?: string } } })
          .original;
        const sealed = (w.value as { attestation?: { fact_key?: string } }).attestation;
        return (original?.attestation ?? sealed)?.fact_key === attestation?.fact.key;
      }),
    );
    if (!prior.ok) return prior;
    if (prior.value) return this.#store.commit(prior.value);
    const plan = derive(storeSource(this.#store), i.data.world_id);
    if (!plan.ok) return refused(plan);
    return publishPlan(
      this.#store,
      p.data,
      OWNER_GIP,
      FACET_GIP_INSTITUTION_IDENTITY,
      FREIGHT_GIP_RULE,
      plan.value,
    );
  }

  /** Establishes the Opening Constitutive Basis (with the Closed Governing Coverage) from the sealed legal slice. */
  establishOpeningBasis(input: Publication & { readonly assembly: unknown }) {
    return this.#act(input, "gip_opening_basis", deriveOpeningBasis);
  }

  /** Establishes the separately addressable clauses of the one committed Instrument from the sealed legal slice. */
  establishInstrumentClauses(input: Publication & { readonly assembly: unknown }) {
    return this.#act(input, "gip_instrument_clause", deriveInstrumentClauses);
  }

  /** Closes the assembled legal source with the Legal Readiness Seal. */
  sealReadiness(input: Publication & { readonly assembly: unknown }) {
    return this.#act(input, "gip_legal_readiness_seal", deriveReadinessSeal);
  }

  // -- typed reads and the derived query, by identity (none scans, none writes) ------------------

  openingBasis(basisId: string): { fact: OwnerFact; value: OpeningBasis } | undefined {
    const fact = this.#store.getFact(gipOpeningBasisKey(basisId));
    const parsed = fact ? OpeningBasisSchema.safeParse(fact.value) : undefined;
    return fact && parsed?.success ? { fact, value: parsed.data } : undefined;
  }
  clause(
    instrumentId: string,
    provisionId: string,
  ): { fact: OwnerFact; value: InstrumentClause } | undefined {
    const fact = this.#store.getFact(gipInstrumentClauseKey(instrumentId, provisionId));
    const parsed = fact ? InstrumentClauseSchema.safeParse(fact.value) : undefined;
    return fact && parsed?.success ? { fact, value: parsed.data } : undefined;
  }
  readinessSeal(sealId: string): SealContext | undefined {
    return readSeal(this.#store, sealId);
  }
  /** GIP's derived current applicability for exact clauses at this cut. Read-only: it stores nothing. */
  applicability(sealId: string, queries: readonly ClauseQuery[]): ClauseEvaluation {
    return evaluateClauses(storeSource(this.#store), sealId, queries);
  }
}
