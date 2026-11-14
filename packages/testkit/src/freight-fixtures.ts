import {
  COVERAGE_ITEMS,
  GM_ADJUDICATION_AUTHORITY,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  worldProfileKey,
  type AttestOpeningInput,
  type CanonicalTime,
  type ClausePremise,
  type CoverageItem,
  type EstablishCorridorInput,
  type GovernanceInstrument,
  type InputLotPremise,
  type InstitutionIdentity,
  type LegalPremise,
  type MaterialSpecificationPremise,
  type OfficeAuthorityLocus,
  type Publication,
  type ScopeBinding,
  type ServicePremise,
  type SiteConditionPremise,
  type WorldLocus,
  type WorldProfile,
} from "@immortalis/contracts";

/**
 * ROADBED first-profile freight — the two INDEPENDENT disposable original-world mechanism fixtures of R2-D18 v1.2.1 §7:
 *
 *   Case A · Quarry Works     — an original charter and competent Works office; Quarry Yard → North Depot; a wall section
 *                               with 12 damaged block identities; an authored prospective prerequisite of 12 cut-stone blocks.
 *   Case B · Textile Workshop — a separate ordinance and authority locus; Weaving House → South Store; five storm-damaged
 *                               cloth screens; an authored prospective prerequisite of 5 bolts; a one-dispatch ceiling of 8.
 *
 * Each has its OWN sealed GM envelope, legally different competent original order, identities, references, clauses and causes.
 * Every statement is ordinary-language GM-authored setting premise; the typed premise beside it is its lowering. Nothing here
 * asserts a decision, an unmet requirement, a produced good, a service result, a delivery or an adequacy conclusion: those are
 * earned by the owners. All of it is SYNTHETIC FIXTURE data: SCRIPTED MECHANISM evidence only, never genuine-host, named-client
 * or retained-storage evidence.
 */

export interface FreightWorldFixture {
  readonly label: "quarry-works" | "textile-workshop";
  readonly campaignId: string;
  readonly worldId: string;
  readonly originLocusId: string;
  readonly destinationLocusId: string;
  readonly world: WorldProfile;
  readonly origin: WorldLocus;
  readonly destination: WorldLocus;
  readonly corridor: EstablishCorridorInput;
  /** the entire original GM envelope, as authored */
  readonly opening: AttestOpeningInput;
  readonly legal: LegalPremise;
  readonly siteCondition: SiteConditionPremise;
  readonly specification: MaterialSpecificationPremise;
  readonly inputLot: InputLotPremise;
  readonly service: ServicePremise;
  readonly institution: InstitutionIdentity;
  readonly office: OfficeAuthorityLocus;
  readonly scopeBinding: ScopeBinding;
  readonly instrument: GovernanceInstrument;
  readonly slices: {
    readonly legal: string;
    readonly siteCondition: string;
    readonly specification: string;
    readonly inputLot: string;
    readonly service: string;
  };
  /** the seal's identity is its Basis's */
  readonly sealId: string;
  readonly timeUnit: string;
  readonly t0: CanonicalTime;
  /** the whole accepted output the fixture expects Production to EARN (never asserted to any owner) */
  readonly expected: {
    readonly outputClass: string;
    readonly unit: string;
    readonly required: number;
    readonly ceiling: number;
    readonly unusedHeadroom: number;
  };
}

const evidenced = (item: CoverageItem["item"], statement: string): CoverageItem => ({
  item,
  disposition: "evidenced",
  statement,
});
const inapplicable = (item: CoverageItem["item"], statement: string): CoverageItem => ({
  item,
  disposition: "established_inapplicable",
  statement,
});

interface Spec {
  readonly label: FreightWorldFixture["label"];
  readonly campaignId: string;
  readonly worldId: string;
  readonly premise: string;
  readonly canon: string;
  readonly origin: { readonly id: string; readonly designation: string };
  readonly destination: { readonly id: string; readonly designation: string };
  readonly corridorStatement: string;
  readonly timeUnit: string;
  readonly t0: number;
  readonly order: { readonly id: string; readonly title: string };
  readonly antecedent: { readonly ref: string; readonly statement: string };
  readonly institution: { readonly id: string; readonly label: string };
  readonly office: {
    readonly id: string;
    readonly competence: string;
    readonly holder?: string;
    readonly body?: string;
  };
  readonly bindingId: string;
  readonly instrumentId: string;
  readonly basisId: string;
  readonly procedure: string;
  readonly coverage: Readonly<Record<CoverageItem["item"], CoverageItem>>;
  readonly provision: (clause: string) => string;
  readonly clauseText: Readonly<Record<string, string>>;
  readonly condition: {
    readonly id: string;
    readonly component: string;
    readonly damaged: readonly string[];
    readonly statement: string;
  };
  readonly specification: {
    readonly id: string;
    readonly materialClass: string;
    readonly unit: string;
    readonly amount: number;
    readonly function: string;
    readonly statement: string;
  };
  readonly lot: {
    readonly id: string;
    readonly materialClass: string;
    readonly unit: string;
    readonly amount: number;
    readonly condition: string;
    readonly operationClass: string;
    readonly outputCondition: string;
    readonly completionAt: number;
    readonly statement: string;
  };
  readonly service: {
    readonly id: string;
    readonly maxAmount: number;
    readonly loading: string;
    readonly receiving: string;
    readonly deliveryAt: number;
    readonly statement: string;
  };
  readonly ceiling: number;
  readonly purpose: string;
  readonly directiveUseId: string;
  readonly siteFunction: string;
  readonly legalStatement: string;
}

function build(s: Spec): FreightWorldFixture {
  const worldKey = worldProfileKey(s.worldId);
  const at = (value: number): CanonicalTime => ({ unit: s.timeUnit, value });
  const world: WorldProfile = {
    world_id: s.worldId,
    premise: s.premise,
    reference_causal_basis: { mode: "ORIGINAL", established_canon: s.canon },
    material_world_law_departures: [],
    insertion_supporting_constraints: [],
  };
  const locus = (l: { id: string; designation: string }): WorldLocus => ({
    locus_id: l.id,
    world: { fact_key: worldKey, entity_id: s.worldId },
    designation: l.designation,
    constraints: [],
  });
  const common = (clause: ClausePremise["clause"]) => ({
    provision_id: s.provision(clause),
    order_id: s.order.id,
    lawful_equivalent_evidence: null,
    statement: s.clauseText[clause]!,
  });
  const clauses: ClausePremise[] = [
    {
      clause: "C-01",
      ...common("C-01"),
      effect_class: "authority_grant",
      terms: {
        institution_id: s.institution.id,
        office_id: s.office.id,
        function: "internal self-provision and single-site supply",
      },
    },
    {
      clause: "C-02",
      ...common("C-02"),
      effect_class: "entitlement",
      terms: {
        institution_id: s.institution.id,
        origin_locus_id: s.origin.id,
        lot_id: s.lot.id,
        operation_class: s.lot.operationClass,
        retention: "EXCLUSIVE_WHOLE_ACCEPTED_OUTPUT",
      },
    },
    {
      clause: "C-03",
      ...common("C-03"),
      effect_class: "entitlement",
      terms: {
        institution_id: s.institution.id,
        destination_locus_id: s.destination.id,
        material_class: s.specification.materialClass,
        site_function: s.siteFunction,
      },
    },
    {
      clause: "C-04",
      ...common("C-04"),
      effect_class: "permission",
      terms: {
        institution_id: s.institution.id,
        world_id: s.worldId,
        origin_locus_id: s.origin.id,
        destination_locus_id: s.destination.id,
        material_class: s.specification.materialClass,
        ceiling: { amount: s.ceiling, unit: s.specification.unit },
        purpose: s.purpose,
        directive_use_id: s.directiveUseId,
        qualifying_first_dispatches: 1,
        sunset: "NONE_ESTABLISHED_BY_SOURCE",
      },
    },
    {
      clause: "C-05",
      ...common("C-05"),
      effect_class: "administrative_direction",
      terms: {
        institution_id: s.institution.id,
        origin_locus_id: s.origin.id,
        lot_id: s.lot.id,
        output_class: s.specification.materialClass,
        trigger: "ONE_UNIQUE_DEDICATED_LOT_AND_ONE_FIXED_UNMET_REQUIREMENT",
      },
    },
    {
      clause: "C-06",
      ...common("C-06"),
      effect_class: "administrative_direction",
      terms: {
        institution_id: s.institution.id,
        destination_locus_id: s.destination.id,
        trigger: "ONE_OPEN_WHOLE_REQUIREMENT_AND_ONE_UNIQUE_ACCEPTED_WHOLE_OUTPUT",
      },
    },
    {
      clause: "C-07",
      ...common("C-07"),
      effect_class: "administrative_direction",
      terms: {
        triggers: ["W1", "W2", "W3", "W4"],
        release_order: "LOGISTICS_PROVES_NO_DISPATCH_THEN_ECONOMY_CLOSES_ONCE",
      },
    },
  ];
  const legal: LegalPremise = {
    basis_id: s.basisId,
    governing_order: { order_id: s.order.id, title: s.order.title },
    antecedent: { provision_ref: s.antecedent.ref, statement: s.antecedent.statement },
    institution: { institution_id: s.institution.id },
    authority_locus: { office_id: s.office.id, competence: s.office.competence },
    scope_binding_id: s.bindingId,
    instrument_id: s.instrumentId,
    procedure: s.procedure,
    jurisdiction: {
      world_id: s.worldId,
      origin_locus_id: s.origin.id,
      destination_locus_id: s.destination.id,
    },
    coverage: COVERAGE_ITEMS.map((item) => s.coverage[item]),
    clauses,
  };
  const siteCondition: SiteConditionPremise = {
    condition_id: s.condition.id,
    site_locus_id: s.destination.id,
    component: s.condition.component,
    damaged_components: [...s.condition.damaged],
  };
  const specification: MaterialSpecificationPremise = {
    specification_id: s.specification.id,
    site_locus_id: s.destination.id,
    condition_id: s.condition.id,
    material_class: s.specification.materialClass,
    quantity: { amount: s.specification.amount, unit: s.specification.unit },
    function: s.specification.function,
  };
  const inputLot: InputLotPremise = {
    lot_id: s.lot.id,
    origin_locus_id: s.origin.id,
    institution_id: s.institution.id,
    material_class: s.lot.materialClass,
    quantity: { amount: s.lot.amount, unit: s.lot.unit },
    condition: s.lot.condition,
    dedicated_operation: {
      operation_class: s.lot.operationClass,
      input: {
        material_class: s.lot.materialClass,
        quantity: { amount: s.lot.amount, unit: s.lot.unit },
      },
      output: {
        output_class: s.specification.materialClass,
        quantity: { amount: s.specification.amount, unit: s.specification.unit },
        condition: s.lot.outputCondition,
      },
      completion_at: at(s.lot.completionAt),
    },
  };
  const service: ServicePremise = {
    basis_id: s.service.id,
    world_id: s.worldId,
    origin_locus_id: s.origin.id,
    destination_locus_id: s.destination.id,
    whole_cargo_slots: 1,
    handling: {
      material_class: s.specification.materialClass,
      max_quantity: { amount: s.service.maxAmount, unit: s.specification.unit },
      loading: s.service.loading,
      receiving: s.service.receiving,
    },
    delivery_boundary_at: at(s.service.deliveryAt),
  };
  const slices = {
    legal: "slice-a-legal",
    siteCondition: "slice-b-site-condition",
    specification: "slice-c-material-specification",
    inputLot: "slice-d-input-lot",
    service: "slice-e-service-premise",
  } as const;
  const opening: AttestOpeningInput = {
    world_id: s.worldId,
    operation_id: `${s.label}-opening`,
    envelope_id: `${s.label}-envelope`,
    origin_locus_id: s.origin.id,
    destination_locus_id: s.destination.id,
    authored_under: { ...GM_ADJUDICATION_AUTHORITY },
    slices: [
      { slice_id: slices.legal, slice_kind: "legal", statement: s.legalStatement, premise: legal },
      {
        slice_id: slices.siteCondition,
        slice_kind: "site_condition",
        statement: s.condition.statement,
        premise: siteCondition,
      },
      {
        slice_id: slices.specification,
        slice_kind: "material_specification",
        statement: s.specification.statement,
        premise: specification,
      },
      {
        slice_id: slices.inputLot,
        slice_kind: "input_lot",
        statement: s.lot.statement,
        premise: inputLot,
      },
      {
        slice_id: slices.service,
        slice_kind: "service_premise",
        statement: s.service.statement,
        premise: service,
      },
    ],
  };
  const officeCommon = {
    office_id: s.office.id,
    institution_id: s.institution.id,
    authority_source_ref: s.antecedent.ref,
    competence_scope: s.office.competence,
    powers: ["administer internal self-provision and single-site supply"],
    duties: ["keep the works in repair"],
    selection_rule: "SYNTHETIC FIXTURE: selection is by the setting's own established custom.",
    succession_rule: "SYNTHETIC FIXTURE: no succession mechanism is established.",
    removal_rule: "SYNTHETIC FIXTURE: no removal mechanism is established.",
  };
  const office: OfficeAuthorityLocus = s.office.holder
    ? { ...officeCommon, holder_ref: s.office.holder }
    : { ...officeCommon, decision_body_ref: s.office.body! };
  return {
    label: s.label,
    campaignId: s.campaignId,
    worldId: s.worldId,
    originLocusId: s.origin.id,
    destinationLocusId: s.destination.id,
    world,
    origin: locus(s.origin),
    destination: locus(s.destination),
    corridor: {
      world_id: s.worldId,
      from_locus_id: s.origin.id,
      to_locus_id: s.destination.id,
      statement: s.corridorStatement,
    },
    opening,
    legal,
    siteCondition,
    specification,
    inputLot,
    service,
    institution: {
      institution_id: s.institution.id,
      identity_label: s.institution.label,
      continuity_status: "continuing",
      constitutive_source_ref: s.antecedent.ref,
    },
    office,
    scopeBinding: {
      scope_binding_id: s.bindingId,
      institution_id: s.institution.id,
      office_id: s.office.id,
      scope_type: "institutional self-provision and single-site supply",
      scope_ref: s.worldId,
      target_condition: `material moved from ${s.origin.id} to ${s.destination.id} for ${s.purpose}`,
    },
    instrument: {
      instrument_id: s.instrumentId,
      source_authority_ref: gipOfficeAuthorityLocusKey(s.institution.id, s.office.id),
      authority_basis_ref: s.basisId,
      // the legacy scalar: the order's own principal effect class, authored once and never interpreted for the clauses
      operative_effect: "administrative_direction",
      scope_binding_ref: gipScopeBindingKey(s.institution.id, s.office.id, s.bindingId),
      validity_by_order: [{ governing_order_ref: s.order.id, validity_status: "valid" }],
      lifecycle_status: "active",
    },
    slices,
    sealId: s.basisId,
    timeUnit: s.timeUnit,
    t0: at(s.t0),
    expected: {
      outputClass: s.specification.materialClass,
      unit: s.specification.unit,
      required: s.specification.amount,
      ceiling: s.ceiling,
      unusedHeadroom: s.ceiling - s.specification.amount,
    },
  };
}

/** Case A — Quarry Works: 12-block requirement, 12-block earned output, 12-block one-dispatch ceiling. */
export const quarryWorksFixture = (): FreightWorldFixture =>
  build({
    label: "quarry-works",
    campaignId: "cmp-roadbed-quarry-works",
    worldId: "quarry-vale",
    premise:
      "SYNTHETIC FIXTURE: a walled upland vale whose Works keeps its own quarry and its northern depot wall.",
    canon:
      "SYNTHETIC FIXTURE: the Vale's Founding Compact, its Works Charter, the Quarry Yard, the North Depot and the breached north wall section are established.",
    origin: {
      id: "quarry-yard",
      designation: "SYNTHETIC FIXTURE: the Quarry Yard of the Vale Works.",
    },
    destination: {
      id: "north-depot",
      designation: "SYNTHETIC FIXTURE: the North Depot beneath the curtain wall.",
    },
    corridorStatement:
      "SYNTHETIC FIXTURE: the works cart-road runs from the Quarry Yard down to the North Depot.",
    timeUnit: "fixture-day",
    t0: 10,
    order: { id: "works-charter", title: "The Works Charter of the Vale" },
    antecedent: {
      ref: "founding-compact.article-3",
      statement:
        "The Founding Compact, Article 3, vests in the Works Office the keeping and provisioning of the Vale's own works.",
    },
    institution: { id: "vale-works", label: "The Vale Works" },
    office: {
      id: "works-office",
      competence: "the keeping, self-provision and single-site supply of the Vale's own works",
      holder: "works-warden",
    },
    bindingId: "works-scope",
    instrumentId: "works-ordinance-7",
    basisId: "works-basis",
    procedure:
      "The Charter operates of its own terms; no further act of the Works Office is required.",
    coverage: {
      constitutive_competence: evidenced(
        "constitutive_competence",
        "Founding Compact Article 3 confers the Works Office's competence over the Vale's own works.",
      ),
      jurisdiction_origin: evidenced(
        "jurisdiction_origin",
        "The Quarry Yard is the Works' own ground under the Charter.",
      ),
      jurisdiction_destination: evidenced(
        "jurisdiction_destination",
        "The North Depot is the Works' own ground under the Charter.",
      ),
      institution_authority_locus: evidenced(
        "institution_authority_locus",
        "The Works Office is the Vale Works' competent authority locus.",
      ),
      applicability_procedure: inapplicable(
        "applicability_procedure",
        "The Charter requires no application procedure for the Works' own provisioning.",
      ),
      publication_or_notice: inapplicable(
        "publication_or_notice",
        "The Charter requires no publication or notice for the Works' internal directions.",
      ),
      concurrence_or_outside_determination: inapplicable(
        "concurrence_or_outside_determination",
        "The Charter requires no concurrence or outside determination.",
      ),
      priority_precedence: inapplicable(
        "priority_precedence",
        "The Charter establishes no priority or precedence among the Works' provisioning.",
      ),
      incorporation: inapplicable("incorporation", "The Charter incorporates no other order."),
      conflicting_orders: inapplicable(
        "conflicting_orders",
        "The Charter establishes that no other order governs the Works' own provisioning.",
      ),
      exceptions: inapplicable(
        "exceptions",
        "The Charter states no exception to these provisions.",
      ),
      sunset_or_expiry: inapplicable(
        "sunset_or_expiry",
        "The Charter expressly provides that the dispatch permission does not lapse by time.",
      ),
    },
    provision: (c) => `charter.${c.toLowerCase()}`,
    clauseText: {
      "C-01":
        "The Works Office may administer the Works' own self-provision and the supply of its one depot.",
      "C-02":
        "The Works holds the dedicated quarry lot at the Quarry Yard for stone-cutting and keeps the whole stone cut from it.",
      "C-03":
        "The Works may receive and use cut stone at the North Depot for the keeping of its wall.",
      "C-04":
        "The Works may send, once, up to twelve blocks of cut stone from the Quarry Yard to the North Depot for the wall's provisioning; this leave does not lapse by time.",
      "C-05":
        "When the wall's fixed need of cut stone stands unmet and the one dedicated lot lies ready, the Works shall cut that stone.",
      "C-06":
        "When the depot's whole need stands open and exactly one whole cut lot lies accepted at the yard, the Works shall set it aside for the depot.",
      "C-07":
        "Before the stone leaves, the Works shall withdraw the setting-aside if carriage is finally refused, the leave or its ground fails, the need or the stone ceases or no longer matches, or a stated carriage cut-off passes; nothing is released until no dispatch is proven.",
    },
    condition: {
      id: "north-wall-breach",
      component: "north curtain wall, section four",
      damaged: Array.from({ length: 12 }, (_, i) => `wall-block-${String(i + 1).padStart(2, "0")}`),
      statement:
        "The north curtain wall above the depot is breached in its fourth section: twelve of its facing blocks are split or fallen.",
    },
    specification: {
      id: "north-wall-stone",
      materialClass: "cut-stone-block",
      unit: "blocks",
      amount: 12,
      function:
        "the hard material prerequisite of restoring the north curtain wall's fourth section",
      statement:
        "To restore that section the Works' masons require twelve cut-stone blocks; nothing less will close it.",
    },
    lot: {
      id: "quarry-lot-one",
      materialClass: "rough-quarried-stone",
      unit: "rough-blocks",
      amount: 12,
      condition: "quarried",
      operationClass: "stone-cutting",
      outputCondition: "dressed",
      completionAt: 20,
      statement:
        "At the Quarry Yard lies one lot of twelve rough-quarried blocks set apart for the Works' own cutting, which yields twelve dressed blocks by the twentieth day.",
    },
    service: {
      id: "works-cart",
      maxAmount: 16,
      loading: "the yard's own hoist loads the cart at the Quarry Yard",
      receiving: "the depot ramp receives the cart at the North Depot",
      deliveryAt: 60,
      statement:
        "The Works' ox-cart runs the cart-road from the Quarry Yard to the North Depot, carries at most sixteen blocks, and reaches the depot on the sixtieth day.",
    },
    ceiling: 12,
    purpose: "north-depot-wall-provisioning",
    directiveUseId: "works-dispatch-use",
    siteFunction: "the keeping of the North Depot's curtain wall",
    legalStatement:
      "The Works Charter of the Vale, made under Article 3 of the Founding Compact, sets out the Works' standing leave and directions for cutting its own stone and supplying its North Depot.",
  });

/** Case B — Textile Workshop: 5-bolt requirement, 5-bolt earned output, 8-bolt one-dispatch ceiling (3 unused). */
export const textileWorkshopFixture = (): FreightWorldFixture =>
  build({
    label: "textile-workshop",
    campaignId: "cmp-roadbed-textile-workshop",
    worldId: "loom-reach",
    premise:
      "SYNTHETIC FIXTURE: a river town whose Weavers' Guild keeps a weaving house and a south store.",
    canon:
      "SYNTHETIC FIXTURE: the Guild Articles, the Cloth Ordinance, the Weaving House, the South Store and its storm-torn screens are established.",
    origin: { id: "weaving-house", designation: "SYNTHETIC FIXTURE: the Guild's Weaving House." },
    destination: { id: "south-store", designation: "SYNTHETIC FIXTURE: the Guild's South Store." },
    corridorStatement:
      "SYNTHETIC FIXTURE: the quay lane runs from the Weaving House to the South Store.",
    timeUnit: "fixture-watch",
    t0: 2,
    order: { id: "cloth-ordinance", title: "The Guild Cloth Ordinance" },
    antecedent: {
      ref: "guild-articles.clause-9",
      statement:
        "The Guild Articles, Clause 9, charge the Stewards' Table with the Guild's own cloth and the furnishing of its houses.",
    },
    institution: { id: "weavers-guild", label: "The Weavers' Guild of the Reach" },
    office: {
      id: "cloth-steward",
      competence: "the Guild's own cloth and the furnishing of its houses",
      body: "stewards-table",
    },
    bindingId: "cloth-scope",
    instrumentId: "cloth-ordinance-2",
    basisId: "cloth-basis",
    procedure: "The Ordinance was read at the Guild's quarter-moot and operates of its own terms.",
    coverage: {
      constitutive_competence: evidenced(
        "constitutive_competence",
        "Guild Articles Clause 9 confers the Stewards' Table's competence over the Guild's own cloth.",
      ),
      jurisdiction_origin: evidenced(
        "jurisdiction_origin",
        "The Weaving House is a Guild house under the Ordinance.",
      ),
      jurisdiction_destination: evidenced(
        "jurisdiction_destination",
        "The South Store is a Guild house under the Ordinance.",
      ),
      institution_authority_locus: evidenced(
        "institution_authority_locus",
        "The Cloth Steward's seat is the Guild's competent authority locus for its own cloth.",
      ),
      applicability_procedure: evidenced(
        "applicability_procedure",
        "The Ordinance took effect on its reading at the quarter-moot, which is recorded.",
      ),
      publication_or_notice: evidenced(
        "publication_or_notice",
        "The Ordinance was read aloud at the quarter-moot, as the Articles require.",
      ),
      concurrence_or_outside_determination: inapplicable(
        "concurrence_or_outside_determination",
        "The Articles require no concurrence outside the Stewards' Table.",
      ),
      priority_precedence: inapplicable(
        "priority_precedence",
        "The Ordinance establishes no priority among the Guild's furnishings.",
      ),
      incorporation: inapplicable("incorporation", "The Ordinance incorporates no other order."),
      conflicting_orders: inapplicable(
        "conflicting_orders",
        "The Ordinance establishes that no town or other order governs the Guild's own cloth.",
      ),
      exceptions: inapplicable(
        "exceptions",
        "The Ordinance states no exception to these provisions.",
      ),
      sunset_or_expiry: inapplicable(
        "sunset_or_expiry",
        "The Ordinance expressly provides that its carrying leave stands until used and does not lapse by time.",
      ),
    },
    provision: (c) => `ordinance.${c.toLowerCase()}`,
    clauseText: {
      "C-01":
        "The Cloth Steward may administer the Guild's own weaving and the furnishing of its South Store.",
      "C-02":
        "The Guild holds the dedicated thread lot at the Weaving House for weaving and keeps the whole cloth woven from it.",
      "C-03":
        "The Guild may receive and use woven cloth at the South Store for the replacing of its screens.",
      "C-04":
        "The Guild may carry, once, up to eight bolts of woven cloth from the Weaving House to the South Store for its screens; this leave stands until used.",
      "C-05":
        "When the store's fixed need of cloth stands unmet and the one dedicated thread lot lies ready, the Guild shall weave that cloth.",
      "C-06":
        "When the store's whole need stands open and exactly one whole woven lot lies accepted at the house, the Guild shall set it aside for the store.",
      "C-07":
        "Before the cloth leaves, the Guild shall withdraw the setting-aside if carriage is finally refused, the leave or its ground fails, the need or the cloth ceases or no longer matches, or a stated carriage cut-off passes; nothing is released until no dispatch is proven.",
    },
    condition: {
      id: "storm-torn-screens",
      component: "the South Store's window screens",
      damaged: ["screen-1", "screen-2", "screen-3", "screen-4", "screen-5"],
      statement: "The storm tore five of the South Store's cloth window screens beyond mending.",
    },
    specification: {
      id: "screen-cloth",
      materialClass: "woven-cloth-bolt",
      unit: "bolts",
      amount: 5,
      function: "the replacement material for the South Store's five named screens",
      statement:
        "Each screen takes one bolt of the Guild's close-woven cloth, so replacing those five screens takes five bolts.",
    },
    lot: {
      id: "thread-lot-a",
      materialClass: "spun-thread",
      unit: "skeins",
      amount: 40,
      condition: "spun",
      operationClass: "weaving",
      outputCondition: "finished",
      completionAt: 8,
      statement:
        "At the Weaving House lies one lot of forty skeins of spun thread set apart for the Guild's own weaving, which makes five finished bolts by the eighth watch.",
    },
    service: {
      id: "store-barrow",
      maxAmount: 8,
      loading: "the house porters load the barrow at the Weaving House door",
      receiving: "the store's keeper receives the barrow at the South Store hatch",
      deliveryAt: 30,
      statement:
        "The Guild's hand-barrow goes by the quay lane from the Weaving House to the South Store, carries at most eight bolts, and arrives at the thirtieth watch.",
    },
    ceiling: 8,
    purpose: "south-store-screen-replacement",
    directiveUseId: "cloth-dispatch-use",
    siteFunction: "the replacing of the South Store's window screens",
    legalStatement:
      "The Guild Cloth Ordinance, made under Clause 9 of the Guild Articles and read at the quarter-moot, sets out the Guild's standing leave and directions for weaving its own cloth and furnishing its South Store.",
  });

/** A fixture publication, namespaced per stage so identities never collide between stages. */
export const freightPublication = (
  stage: string,
  n: number,
  over: Partial<Publication> = {},
): Publication => ({
  group_id: `fr-${stage}-group-${n}`,
  intent_id: `fr-${stage}-intent-${n}`,
  cause: `fr-${stage}-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
  ...over,
});

/** A deep, independent copy of a fixture (for negative cases that alter one authored premise). */
export const cloneFixture = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
