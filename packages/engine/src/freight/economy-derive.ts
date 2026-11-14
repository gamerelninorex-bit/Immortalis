import {
  DurableCompletionEnvelopeSchema,
  EconomyAcceptedOutputHoldingSchema,
  EconomyDestinationAdequacySchema,
  EconomyFreightAllocationSchema,
  EconomyFreightCloseSchema,
  EconomyFreightReceiptSchema,
  EconomyFreightRequestSchema,
  EconomyFreightSlotSchema,
  EconomyFreightUseConsumptionSchema,
  EconomyFreightWithdrawalSchema,
  EconomyOriginAllocationSchema,
  EconomyOriginLotSlotSchema,
  EconomyStatusWitnessSchema,
  EntityTransitionCauseSchema,
  EntityTransitionCloseSchema,
  FREIGHT_PROFILE,
  FallbackPhysicalEntitySchema,
  InputLotPremiseSchema,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  LogisticsUnusedReleaseSchema,
  MaterialSpecificationPremiseSchema,
  ORIGIN_ALLOCATION_NATURE,
  OWNER_ECONOMY,
  OWNER_LOGISTICS,
  OWNER_WORLD_STATE,
  OpeningAttestationSchema,
  ProductionInputLotSchema,
  ProductionMaterialSpecificationSchema,
  ProductionOperationSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  SiteConditionPremiseSchema,
  TEMPORAL_STATE_KEY,
  USE_CONSUMPTION_NATURE,
  WorldSiteConditionSchema,
  compareTime,
  economyAcceptedOutputHoldingKey,
  economyDestinationAdequacyKey,
  economyFreightAllocationKey,
  economyFreightCargoSlotKey,
  economyFreightCloseKey,
  economyFreightDirectiveUseSlotKey,
  economyFreightResultKey,
  economyFreightReceiptStage,
  economyFreightRequestKey,
  economyFreightRequestRef,
  economyFreightRequirementSlotKey,
  economyFreightUseConsumptionKey,
  economyFreightWithdrawalKey,
  economyOriginAllocationId,
  economyOriginAllocationKey,
  economyOriginLotSlotKey,
  economyOriginRequestId,
  economyRequestKey,
  entityTransitionId,
  gipInstitutionIdentityKey,
  logisticsBoundaryId,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsTransferKey,
  logisticsUnusedReleaseEventId,
  logisticsUnusedReleaseKey,
  ok,
  productionCompletionKey,
  productionInputLotKey,
  productionMaterialSpecificationKey,
  productionOperationKey,
  productionOutputReference,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldSiteConditionKey,
  type CanonicalTime,
  type EconomyAcceptedOutputHolding,
  type EconomyDestinationAdequacy,
  type EconomyFreightAllocation,
  type EconomyFreightClose,
  type EconomyFreightReceipt,
  type EconomyFreightRequest,
  type EconomyFreightSlot,
  type EconomyFreightUseConsumption,
  type EconomyFreightWithdrawal,
  type EconomyOriginAllocation,
  type EconomyStatusWitness,
  type FallbackPhysicalEntity,
  type FreightClause,
  type LogisticsCommitment,
  type LogisticsGuard,
  type OpeningAttestation,
  type OwnerFact,
  type ProductionInputLot,
  type ProductionMaterialSpecification,
  type ProductionRequest,
  type Result,
  type WorldSiteCondition,
} from "@immortalis/contracts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { evaluateClauses, readSeal, type ClauseAnswer, type SealContext } from "./gip.ts";
import { resolveEntityLocus } from "../logistics/locus.ts";
import {
  canonicalNow,
  planned,
  refuse,
  sealedSlicesOfKind,
  type FreightRefusalCode,
  type FreightSource,
  type Planned,
} from "./common.ts";

/**
 * IM-06 Economy — pure derivations of the ROADBED first freight profile (R2-D18 v1.2.1 §2.1, §3.3, §3.5, §4, §5; R3-T2 §§2-5
 * EL-01F / EL-02S as corrected by CT-1..CT-4). Economy is the non-agentive processor of an already-determinate rule: it is
 * never an office, an office-holder or a substitute legal decision-maker, and each derivation below takes a SCOPE (the
 * profile's seal, or a fixed request) and the owner event that opened it — never a lot, a quantity, a winner or an outcome.
 *
 * Every legal answer is GIP's, obtained freshly at the act's own cut on the registered GIP → Economy dependency
 * (`evaluateClauses`); nothing here stores eligibility. Every physical answer is World-State's or Logistics' (the one
 * current-locus resolver). Economy writes only its own allocation, holding, request, slots, withdrawal, close, consumption,
 * receipt and adequacy facts.
 */

type Read<T> = { readonly fact: OwnerFact; readonly value: T };
const readAs = <T>(
  src: Pick<FreightSource, "getFact">,
  key: string,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
): Read<T> | undefined => {
  const fact = src.getFact(key);
  if (!fact) return undefined;
  const parsed = schema.safeParse(fact.value);
  return parsed.success ? { fact, value: parsed.data } : undefined;
};
const pinOf = (fact: OwnerFact) => ({ fact_key: fact.key, version: fact.version });
type Refused = {
  ok: false;
  error: { code: FreightRefusalCode; message: string; details?: Record<string, unknown> };
};

// ---------------------------------------------------------------------------------------------
// The profile's closed scope and its one requirement
// ---------------------------------------------------------------------------------------------

export interface ProfileScope {
  readonly seal: SealContext;
  readonly worldId: string;
  readonly attestation: Read<OpeningAttestation>;
  /** the envelope's ONE site condition and ONE material specification (the closed candidate set of the requirement) */
  readonly conditionId: string;
  readonly specificationId: string;
}

/** The sealed profile a seal identity names, with the closed identities of its one requirement. */
export function profileScope(
  src: FreightSource,
  sealId: string,
): Result<ProfileScope, FreightRefusalCode> {
  const seal = readSeal(src, sealId);
  if (!seal)
    return refuse(
      "WITHHELD",
      "legal readiness is not sealed: GIP's applicability is unresolved and Economy selects nothing",
      { applicability: "unresolved", gip_reason: "READINESS_NOT_SEALED" },
    );
  const attestation = readAs(src, seal.seal.attestation.fact_key, OpeningAttestationSchema);
  if (!attestation) return refuse("SOURCE_REFUSED", "the sealed opening attestation is unreadable");
  const conditions = sealedSlicesOfKind(attestation.value, "site_condition");
  const specifications = sealedSlicesOfKind(attestation.value, "material_specification");
  if (conditions.length !== 1 || specifications.length !== 1)
    return refuse(
      "WITHHELD",
      "the sealed source does not fix exactly one objective condition and one material prerequisite",
      { conditions: conditions.length, specifications: specifications.length },
    );
  const condition = SiteConditionPremiseSchema.safeParse(conditions[0]!.premise);
  const specification = MaterialSpecificationPremiseSchema.safeParse(specifications[0]!.premise);
  if (!condition.success || !specification.success)
    return refuse("SOURCE_REFUSED", "a sealed requirement slice is not a typed premise");
  return ok({
    seal,
    worldId: seal.seal.world.entity_id,
    attestation,
    conditionId: condition.data.condition_id,
    specificationId: specification.data.specification_id,
  });
}

export interface Requirement {
  readonly condition: Read<WorldSiteCondition>;
  readonly specification: Read<ProductionMaterialSpecification>;
  /** whether the requirement still stands open: the original condition still stands */
  readonly open: boolean;
}

/**
 * The institutional requirement Economy derives from the EXACT JOIN of World-State's admitted objective condition and
 * Production's admitted prospective specification (R2-D18 §4 step 1). Both must already be owner-admitted; a quantity is never
 * computed from the damage count, and no prior shipment, permission or produced cargo supplies the requirement.
 */
export function requirementOf(
  src: FreightSource,
  scope: ProfileScope,
): Result<Requirement, FreightRefusalCode> {
  const condition = readAs(
    src,
    worldSiteConditionKey(scope.worldId, scope.conditionId),
    WorldSiteConditionSchema,
  );
  const specification = readAs(
    src,
    productionMaterialSpecificationKey(scope.specificationId),
    ProductionMaterialSpecificationSchema,
  );
  if (!condition || !specification)
    return refuse(
      "WITHHELD",
      "the objective condition and the material prerequisite are both owner-admitted before Economy derives a requirement",
      { condition: !!condition, specification: !!specification },
    );
  if (
    specification.value.condition.condition_id !== condition.value.condition_id ||
    specification.value.site.entity_id !== condition.value.site.entity_id
  )
    return refuse(
      "SOURCE_REFUSED",
      "the prerequisite and the condition are not of the same site and condition",
    );
  return ok({
    condition,
    specification,
    open: condition.value.standing.status === "STANDING",
  });
}

const requirementKeys = (scope: ProfileScope): readonly string[] => [
  worldSiteConditionKey(scope.worldId, scope.conditionId),
  productionMaterialSpecificationKey(scope.specificationId),
];

const notApplying = (answers: readonly ClauseAnswer[]): Refused | null => {
  const first = answers.find((a) => a.applicability !== "applies");
  return first
    ? refuse(
        "WITHHELD",
        "a clause this act needs does not currently apply: Economy selects nothing and writes nothing",
        { clause: first.clause, applicability: first.applicability, gip_reason: first.reason },
      )
    : null;
};
const reliance = (answers: readonly ClauseAnswer[]) =>
  answers.map((a) => ({
    clause: a.clause,
    fact_key: a.fact_key,
    version: a.version,
    applicability: "applies" as const,
  }));

// ---------------------------------------------------------------------------------------------
// C-05 — deterministic origin self-provision
// ---------------------------------------------------------------------------------------------

/**
 * C-05 (R2-D18 §2.1): "When the destination's original-envelope condition and Production-owned specification have been
 * admitted and produce exactly one positive, still-unmet material requirement of C/Q/U, and the named dedicated source input
 * lot is physically present, under this institution's lawful control, not claimed or in transfer, and uniquely qualifies for
 * one specified origin operation targeting C/Q/U ... Economy shall atomically fix the input-side allocation and issue the one
 * Production Request while C-01, C-02 and C-05 currently apply."
 *
 * The candidate lots are the sealed envelope's own `input_lot` slices (a closed set): exactly ONE must qualify. A missing
 * prerequisite, two qualifying lots, an open claim on the lot, an unknown owner state or a clause that does not currently apply
 * WITHHOLDS rather than selecting. `ownerEventKey` is the owner-admitted prerequisite whose admission opened this resolution
 * (WS-004 §25): it must be one of this profile's own condition, specification or lot facts.
 */
export function deriveOriginSelfProvision(
  src: FreightSource,
  sealId: string,
  ownerEventKey: string,
): Planned {
  const scope = profileScope(src, sealId);
  if (!scope.ok) return scope;
  const s = scope.value;
  const requirement = requirementOf(src, s);
  if (!requirement.ok) return requirement;
  const { condition, specification, open } = requirement.value;
  if (!open)
    return refuse("WITHHELD", "the requirement no longer stands: nothing is to be provided", {
      key: condition.fact.key,
    });
  const spec = specification.value;

  // the closed candidate set: every sealed input-lot slice whose dedicated operation targets exactly C/Q/U at the origin
  const origin = s.attestation.value.pins.origin.entity_id;
  const qualifying = sealedSlicesOfKind(s.attestation.value, "input_lot")
    .map((slice) => InputLotPremiseSchema.safeParse(slice.premise))
    .flatMap((p) => (p.success ? [p.data] : []))
    .filter(
      (p) =>
        p.origin_locus_id === origin &&
        p.dedicated_operation.output.output_class === spec.material_class &&
        p.dedicated_operation.output.quantity.amount === spec.quantity.amount &&
        p.dedicated_operation.output.quantity.unit === spec.quantity.unit,
    );
  if (qualifying.length !== 1)
    return refuse(
      "WITHHELD",
      qualifying.length === 0
        ? "no dedicated source lot qualifies for one origin operation targeting the requirement's exact class, amount and unit"
        : "more than one dedicated lot qualifies: a tie is never broken by Economy",
      { qualifying_lots: qualifying.map((p) => p.lot_id) },
    );
  const lotId = qualifying[0]!.lot_id;
  const lotKey = productionInputLotKey(lotId);
  const lot = readAs(src, lotKey, ProductionInputLotSchema);
  if (!lot)
    return refuse("WITHHELD", "the dedicated lot is not yet admitted by Production", {
      key: lotKey,
    });
  const reserve = readAs(src, lot.value.reserve.fact_key, ProductionReserveSchema);
  const input = lot.value.dedicated_operation.input.quantity;
  if (
    !reserve ||
    reserve.value.claims.length !== 0 ||
    reserve.value.consumed.length !== 0 ||
    reserve.value.quantity.unit !== input.unit ||
    reserve.value.quantity.amount < input.amount
  )
    return refuse(
      "WITHHELD",
      "the dedicated lot is not physically present, whole and unclaimed: input exclusivity is unproven",
      { key: lot.value.reserve.fact_key },
    );

  const allocationKey = economyOriginAllocationKey(spec.specification_id);
  const slotKey = economyOriginLotSlotKey(lotId);
  const requestId = economyOriginRequestId(spec.specification_id);
  const requestKey = economyRequestKey(requestId);
  if (src.getFact(allocationKey) || src.getFact(slotKey) || src.getFact(requestKey))
    return refuse(
      "NOT_ADMISSIBLE",
      "the one origin allocation is already fixed: a repeated trigger opens no second request",
      { key: allocationKey },
    );

  // the owner event that opened this scoped resolution (WS-004 §25): one of this profile's own admitted prerequisites
  const trigger = src.getFact(ownerEventKey);
  if (!trigger || ![condition.fact.key, specification.fact.key, lotKey].includes(ownerEventKey))
    return refuse(
      "NOT_ADMISSIBLE",
      "an origin resolution is opened only by the owner admission of this profile's condition, prerequisite or dedicated lot",
      { owner_event: ownerEventKey },
    );

  // GIP's fresh answer for C-01, C-02 and C-05, asked about the OWNERS' facts (never about the clause's own terms)
  const institution = lot.value.institution_id;
  const legal = evaluateClauses(src, sealId, [
    { clause: "C-01", subject: { institution_id: institution } },
    {
      clause: "C-02",
      subject: {
        institution_id: institution,
        origin_locus_id: lot.value.origin.entity_id,
        lot_id: lotId,
        operation_class: lot.value.dedicated_operation.operation_class,
      },
    },
    {
      clause: "C-05",
      subject: {
        institution_id: institution,
        origin_locus_id: lot.value.origin.entity_id,
        lot_id: lotId,
        output_class: spec.material_class,
      },
    },
  ]);
  const withheld = notApplying(legal.answers);
  if (withheld) return withheld;

  const now = canonicalNow(src);
  if (!now) return refuse("PREREQUISITE_MISSING", "no canonical temporal basis is established");
  const allocation = EconomyOriginAllocationSchema.parse({
    allocation_id: economyOriginAllocationId(spec.specification_id),
    profile: FREIGHT_PROFILE,
    seal: pinOf(s.seal.fact),
    institution_id: institution,
    requirement: {
      specification: pinOf(specification.fact),
      condition: pinOf(condition.fact),
      material_class: spec.material_class,
      quantity: spec.quantity,
    },
    input_lot: { fact_key: lotKey, lot_id: lotId, version: lot.fact.version },
    reserve: pinOf(reserve.fact),
    production_request: { fact_key: requestKey, request_id: requestId },
    authority: reliance(legal.answers),
    trigger: {
      basis: "OWNER_ADMITTED_PREREQUISITE_OPENS_SCOPED_RESOLUTION",
      owner_event: pinOf(trigger),
    },
    fixed_at: now,
    nature: ORIGIN_ALLOCATION_NATURE,
  } satisfies EconomyOriginAllocation);
  const request = ProductionRequestSchema.parse({
    request_id: requestId,
    source: { owner: OWNER_ECONOMY, cause_ref: allocationKey },
    requested_output: { output_class: spec.material_class, quantity: spec.quantity },
    scope: reserve.value.locality,
    priority_authority_ref: null,
  } satisfies ProductionRequest);
  const slot = EconomyOriginLotSlotSchema.parse({
    lot_id: lotId,
    allocation: { fact_key: allocationKey, allocation_id: allocation.allocation_id },
  });
  return planned(
    [
      { key: allocationKey, value: allocation, expected_version: 0 },
      { key: slotKey, value: slot, expected_version: 0 },
      { key: requestKey, value: request, expected_version: 0 },
    ],
    [
      s.seal.fact.key,
      s.attestation.fact.key,
      ...requirementKeys(s),
      lotKey,
      reserve.fact.key,
      ownerEventKey,
      TEMPORAL_STATE_KEY,
      ...legal.reads,
    ],
  );
}

// ---------------------------------------------------------------------------------------------
// The accepted whole output of the profile's one origin operation
// ---------------------------------------------------------------------------------------------

export interface AcceptedOutput {
  readonly allocation: Read<EconomyOriginAllocation>;
  readonly lot: Read<ProductionInputLot>;
  readonly completion: OwnerFact;
  readonly entity: Read<FallbackPhysicalEntity>;
  readonly reads: readonly string[];
}

/**
 * The ONE independently completed, World-State-accepted whole output the profile's origin allocation fixed: the SAME conserved
 * reference Production completed and World-State accepted. A Production Request is a prospective need, a completion is
 * history, and neither is supply: only the accepted entity is. The candidate set is closed (C-02 retains exactly that one
 * operation's whole output), so "exactly one" is structural.
 */
export function acceptedOutputOf(
  src: FreightSource,
  scope: ProfileScope,
): Result<AcceptedOutput, FreightRefusalCode> {
  const allocationKey = economyOriginAllocationKey(scope.specificationId);
  const allocation = readAs(src, allocationKey, EconomyOriginAllocationSchema);
  if (!allocation)
    return refuse("WITHHELD", "no origin self-provision was fixed for this requirement", {
      key: allocationKey,
    });
  const requestId = allocation.value.production_request.request_id;
  const operationKey = productionOperationKey(requestId);
  const completionKey = productionCompletionKey(requestId);
  const entityId = productionOutputReference(requestId);
  const entityKey = worldFallbackEntityKey(scope.worldId, entityId);
  const reads = [
    allocationKey,
    operationKey,
    completionKey,
    entityKey,
    allocation.value.input_lot.fact_key,
  ];
  const operation = readAs(src, operationKey, ProductionOperationSchema);
  const completion = readAs(src, completionKey, DurableCompletionEnvelopeSchema);
  const entity = readAs(src, entityKey, FallbackPhysicalEntitySchema);
  const lot = readAs(src, allocation.value.input_lot.fact_key, ProductionInputLotSchema);
  if (!operation || operation.value.status.state !== "COMPLETED" || !completion || !entity || !lot)
    return refuse(
      "WITHHELD",
      "no independently completed and World-State-accepted whole output exists: a request or a predicted quantity is not supply",
      { operation: operationKey, completion: completionKey, entity: entityKey },
    );
  if (
    completion.value.conserved_reference !== entityId ||
    entity.value.entity_id !== entityId ||
    entity.value.accepted_from.fact_key !== completionKey ||
    entity.value.accepted_from.operation_id !== requestId
  )
    return refuse(
      "SOURCE_REFUSED",
      "the accepted entity is not the same conserved reference Production completed",
    );
  return ok({
    allocation,
    lot,
    completion: completion.fact,
    entity,
    reads,
  });
}

// ---------------------------------------------------------------------------------------------
// The request-bound Logistics state (read-only; Economy writes no Logistics fact)
// ---------------------------------------------------------------------------------------------

export type RequestService =
  | { readonly kind: "NONE"; readonly commitmentVersion: number }
  | { readonly kind: "COMMITTED"; readonly commitment: Read<LogisticsCommitment> }
  | { readonly kind: "RELEASED_UNUSED"; readonly commitment: Read<LogisticsCommitment> }
  | { readonly kind: "DISPATCHED_OR_DELIVERED"; readonly commitment: Read<LogisticsCommitment> }
  | { readonly kind: "UNREADABLE" };

/**
 * What Logistics' own owner keys say about THIS exact request (EL-01F "Scope/predicate for F4"): the entity-keyed commitment
 * slot either holds no commitment for this request (it is absent, or it holds another request's — which still occupies the
 * entity slot and is guarded at its exact observed version, never as zero), or it holds this request's commitment in its
 * current state. It is a read of canonical owner keys, never a cached list and never a Logistics fact.
 */
export function requestServiceOf(
  src: Pick<FreightSource, "getFact">,
  worldId: string,
  entityId: string,
  requestRef: string,
): RequestService {
  const fact = src.getFact(logisticsCommitmentKey(worldId, entityId));
  if (!fact) return { kind: "NONE", commitmentVersion: 0 };
  const parsed = LogisticsCommitmentSchema.safeParse(fact.value);
  if (!parsed.success) return { kind: "UNREADABLE" };
  const commitment = { fact, value: parsed.data };
  if (parsed.data.request.request_id !== requestRef)
    return { kind: "NONE", commitmentVersion: fact.version };
  if (parsed.data.state.status === "COMMITTED")
    return src.getFact(logisticsTransferKey(worldId, entityId))
      ? { kind: "DISPATCHED_OR_DELIVERED", commitment }
      : { kind: "COMMITTED", commitment };
  if (parsed.data.state.status === "RELEASED_UNUSED")
    return { kind: "RELEASED_UNUSED", commitment };
  return { kind: "DISPATCHED_OR_DELIVERED", commitment };
}

// ---------------------------------------------------------------------------------------------
// C-06 — freight fixation E0 (and the later, genuinely new request E2)
// ---------------------------------------------------------------------------------------------

const slotState = (src: Pick<FreightSource, "getFact">, key: string) => {
  const slot = readAs(src, key, EconomyFreightSlotSchema);
  return { fact: slot?.fact, value: slot?.value, version: slot?.fact.version ?? 0 };
};

/**
 * C-06 (R2-D18 §2.1, §4 step 4): "When the named destination has exactly one open, uncommitted whole requirement of C/Q/U and
 * exactly one independently completed, accepted, stationary-at-origin, institutionally held and otherwise unencumbered whole
 * output of the same C/Q/U meets it, Economy shall atomically claim the unique directive-use, conserved-reference and
 * requirement slots and fix one sealed Movement Service Request. C-03, C-04 and C-06 must each apply at that act."
 *
 * In ONE Economy publication it claims the three globally exclusive slots under absence / exact-version guards, records the
 * accepted-output holding as encumbered, and seals the immutable request (identity, cause, cargo, route, purpose, legal pins,
 * requirement, holder and ceiling). A tie, a partial or mismatched quantity, a cargo that is not stationary at its origin, an
 * occupied or consumed slot, an unknown owner state or a clause that does not currently apply WITHHOLDS. A losing concurrent
 * claimant fails the slot guards and writes nothing, so no orphan slot exists.
 *
 * E2: when the cargo slot was RELEASED by a prior terminal close, the new request carries that close as proof of the prior
 * unused release and no dispatch, takes a NEW identity (the version it claims the slot at) and is fixed only under freshly
 * current authority; it never reuses or replays the earlier identity.
 */
export function deriveFreightFixation(
  src: FreightSource,
  sealId: string,
  ownerEventKey: string,
): Planned {
  const scope = profileScope(src, sealId);
  if (!scope.ok) return scope;
  const s = scope.value;
  const requirement = requirementOf(src, s);
  if (!requirement.ok) return requirement;
  const { condition, specification, open } = requirement.value;
  if (!open)
    return refuse("WITHHELD", "the destination has no open requirement", {
      key: condition.fact.key,
    });
  const output = acceptedOutputOf(src, s);
  if (!output.ok) return output;
  const { allocation: origin, entity, completion } = output.value;
  const spec = specification.value;
  const e = entity.value;
  if (
    e.entity_class !== spec.material_class ||
    e.quantity.unit !== spec.quantity.unit ||
    e.quantity.amount !== spec.quantity.amount
  )
    return refuse(
      "WITHHELD",
      "the accepted output is not the whole requirement's exact class, amount and unit: a partial or mismatched quantity is never fixed",
      { accepted: e.quantity, required: spec.quantity },
    );

  // physical: the one current-locus authority says the whole output is stationary at its accepted origin
  const worldId = s.worldId;
  const commitmentKey = logisticsCommitmentKey(worldId, e.entity_id);
  const transferKey = logisticsTransferKey(worldId, e.entity_id);
  const transitionKey = worldEntityTransitionKey(worldId, e.entity_id);
  const locus = resolveEntityLocus(src, worldId, e.entity_id);
  const priorCommitment = readAs(src, commitmentKey, LogisticsCommitmentSchema);
  if (
    !locus ||
    locus.phase !== "STATIONARY_AT_ORIGIN" ||
    src.getFact(transferKey) ||
    src.getFact(transitionKey) ||
    (src.getFact(commitmentKey) && priorCommitment?.value.state.status !== "RELEASED_UNUSED")
  )
    return refuse(
      "WITHHELD",
      "the whole output is not stationary and unengaged at its origin: an already transferring or committed cargo is never fixed",
      { entity: entity.fact.key },
    );
  const destinationKey = worldLocusKey(worldId, condition.value.site.entity_id);
  if (e.locality.locus.entity_id === condition.value.site.entity_id)
    return refuse("WITHHELD", "the output already lies at the destination site");

  // GIP's fresh answer for C-03, C-04 and C-06 about the owners' own facts
  const institution = origin.value.institution_id;
  const legal = evaluateClauses(src, sealId, [
    {
      clause: "C-03",
      subject: {
        institution_id: institution,
        destination_locus_id: condition.value.site.entity_id,
        material_class: e.entity_class,
      },
    },
    {
      clause: "C-04",
      subject: {
        institution_id: institution,
        world_id: worldId,
        origin_locus_id: e.locality.locus.entity_id,
        destination_locus_id: condition.value.site.entity_id,
        material_class: e.entity_class,
      },
      quantity: e.quantity,
    },
    {
      clause: "C-06",
      subject: {
        institution_id: institution,
        destination_locus_id: condition.value.site.entity_id,
      },
    },
  ]);
  const withheld = notApplying(legal.answers);
  if (withheld) return withheld;
  const permission = legal.answers[1]!.value;
  if (permission?.clause !== "C-04")
    return refuse("SOURCE_REFUSED", "the dispatch permission is unreadable");
  const directiveUse = permission.terms.directive_use_id;

  // the three exclusive slots: each absent, or released by a prior terminal close; never claimed or consumed
  const useKey = economyFreightDirectiveUseSlotKey(directiveUse);
  const cargoKey = economyFreightCargoSlotKey(worldId, e.entity_id);
  const requirementKey = economyFreightRequirementSlotKey(spec.specification_id);
  const slots = [slotState(src, useKey), slotState(src, cargoKey), slotState(src, requirementKey)];
  for (const [i, slot] of slots.entries())
    if (slot.fact && (!slot.value || slot.value.state.status !== "released"))
      return refuse(
        "WITHHELD",
        "an exclusive slot is occupied or already consumed: no second directive use, cargo claim or requirement claim exists",
        {
          key: [useKey, cargoKey, requirementKey][i],
          status: slot.value?.state.status ?? "unreadable",
        },
      );
  const requestRef = economyFreightRequestRef(sealId, slots[1]!.version + 1);
  const requestKey = economyFreightRequestKey(requestRef);
  const allocationKey = economyFreightAllocationKey(requestRef);
  if (src.getFact(requestKey) || src.getFact(allocationKey))
    return refuse("NOT_ADMISSIBLE", "this request identity is already fixed", { key: requestKey });

  // E2: proof of the prior unused release and terminal close for this same entity
  let prior: EconomyFreightRequest["prior_unused_close"] = null;
  const priorReads: string[] = [];
  const cargo = slots[1]!.value;
  if (cargo) {
    if (cargo.state.status !== "released")
      return refuse("WITHHELD", "the cargo slot is not released");
    const priorRef = cargo.state.request_ref;
    const close = src.getFact(economyFreightCloseKey(priorRef));
    const priorAllocation = readAs(
      src,
      economyFreightAllocationKey(priorRef),
      EconomyFreightAllocationSchema,
    );
    if (!close || priorAllocation?.value.state.status !== "terminal")
      return refuse(
        "WITHHELD",
        "a later request for the same entity needs proof of the prior terminal close and no dispatch",
        { prior_request: priorRef },
      );
    prior = { request_ref: priorRef, close: pinOf(close), allocation: pinOf(priorAllocation.fact) };
    priorReads.push(close.key, priorAllocation.fact.key);
  }

  // the accepted-output holding: first derived here from C-02 retention and the completion / acceptance lineage
  const holdingKey = economyAcceptedOutputHoldingKey(worldId, e.entity_id);
  const holdingFact = src.getFact(holdingKey);
  const priorHolding = holdingFact
    ? EconomyAcceptedOutputHoldingSchema.safeParse(holdingFact.value)
    : undefined;
  if (holdingFact && (!priorHolding?.success || priorHolding.data.status !== "available"))
    return refuse("WITHHELD", "the accepted output is already encumbered or restricted", {
      key: holdingKey,
    });
  const retention = origin.value.authority.find((a) => a.clause === "C-02")!;
  const holderRef = gipInstitutionIdentityKey(institution);
  const holding = EconomyAcceptedOutputHoldingSchema.parse({
    holder_ref: holderRef,
    object_ref: { fact_key: entity.fact.key, entity_id: e.entity_id },
    quantity_or_bounded_position: e.quantity,
    status: "encumbered",
    restriction_or_authority_ref: allocationKey,
    lifecycle_status: "active",
    provenance_ref: {
      seal: pinOf(s.seal.fact),
      retention_clause: { fact_key: retention.fact_key, version: retention.version },
      origin_allocation: pinOf(origin.fact),
      completion: pinOf(completion),
      acceptance: {
        owner: OWNER_WORLD_STATE,
        fact_key: entity.fact.key,
        version: entity.fact.version,
      },
      receipt: null,
    },
    output_class: e.entity_class,
  } satisfies EconomyAcceptedOutputHolding);

  // the owner event that opened this fixation: the acceptance, the current requirement fact, or (E2) the prior close
  const trigger = src.getFact(ownerEventKey);
  const lawfulTriggers = [
    entity.fact.key,
    condition.fact.key,
    ...(prior ? [prior.close.fact_key] : []),
  ];
  if (!trigger || !lawfulTriggers.includes(ownerEventKey))
    return refuse(
      "NOT_ADMISSIBLE",
      "a fixation is opened only by the owner acceptance of the output, the admitted requirement, or a prior terminal close",
      { owner_event: ownerEventKey },
    );
  const now = canonicalNow(src);
  if (!now) return refuse("PREREQUISITE_MISSING", "no canonical temporal basis is established");

  const request = EconomyFreightRequestSchema.parse({
    request_class: FREIGHT_PROFILE,
    request_ref: requestRef,
    requesting_owner_ref: OWNER_ECONOMY,
    moved_object_or_quantity_ref: { fact_key: entity.fact.key, entity_id: e.entity_id },
    origin_ref: e.locality,
    destination_or_use_locus_ref: {
      world: e.locality.world,
      locus: { fact_key: destinationKey, entity_id: condition.value.site.entity_id },
    },
    quantity: e.quantity,
    material_handling: { material_class: e.entity_class, cargo: "ONE_WHOLE_CARGO" },
    deadline_or_service: null,
    legal_priority: null,
    institution: { holder_ref: holderRef, beneficiary_ref: holderRef },
    purpose: permission.terms.purpose,
    directive_use_id: directiveUse,
    ceiling: permission.terms.ceiling,
    allocation: { fact_key: allocationKey },
    requirement: { specification: pinOf(specification.fact), condition: pinOf(condition.fact) },
    holding: { fact_key: holdingKey, version: (holdingFact?.version ?? 0) + 1 },
    legal: { seal: pinOf(s.seal.fact), clauses: reliance(legal.answers) },
    trigger: {
      basis: "OWNER_ADMITTED_ACCEPTANCE_OR_REQUIREMENT_OPENS_SCOPED_RESOLUTION",
      owner_event: pinOf(trigger),
    },
    prior_unused_close: prior,
    fixed_at: now,
  } satisfies EconomyFreightRequest);
  const allocation = EconomyFreightAllocationSchema.parse({
    request: { fact_key: requestKey, request_ref: requestRef, version: 1 },
    state: { status: "pending" },
  } satisfies EconomyFreightAllocation);
  const claim = (slot_kind: EconomyFreightSlot["slot_kind"]): EconomyFreightSlot => ({
    slot_kind,
    state: { status: "claimed", request_ref: requestRef },
  });
  return planned(
    [
      { key: requestKey, value: request, expected_version: 0 },
      { key: allocationKey, value: allocation, expected_version: 0 },
      { key: useKey, value: claim("directive-use"), expected_version: slots[0]!.version },
      { key: cargoKey, value: claim("cargo"), expected_version: slots[1]!.version },
      { key: requirementKey, value: claim("requirement"), expected_version: slots[2]!.version },
      { key: holdingKey, value: holding, expected_version: holdingFact?.version ?? 0 },
    ],
    [
      s.seal.fact.key,
      s.attestation.fact.key,
      ...requirementKeys(s),
      ...output.value.reads,
      commitmentKey,
      transferKey,
      transitionKey,
      destinationKey,
      ownerEventKey,
      TEMPORAL_STATE_KEY,
      ...priorReads,
      ...legal.reads,
    ],
  );
}

// ---------------------------------------------------------------------------------------------
// The fixed request and its live facts
// ---------------------------------------------------------------------------------------------

export interface FixedRequest {
  readonly request: Read<EconomyFreightRequest>;
  readonly allocation: Read<EconomyFreightAllocation>;
  readonly worldId: string;
  readonly entityId: string;
  readonly sealId: string;
}

export function fixedRequest(
  src: Pick<FreightSource, "getFact">,
  requestRef: string,
): Result<FixedRequest, FreightRefusalCode> {
  const request = readAs(src, economyFreightRequestKey(requestRef), EconomyFreightRequestSchema);
  const allocation = readAs(
    src,
    economyFreightAllocationKey(requestRef),
    EconomyFreightAllocationSchema,
  );
  if (!request || !allocation || request.fact.version !== 1)
    return refuse(
      "PREREQUISITE_MISSING",
      "no fixed Economy freight request exists at this identity",
      {
        request_ref: requestRef,
      },
    );
  const seal = readAs(src, request.value.legal.seal.fact_key, {
    safeParse: (v) => ({ success: true as const, data: v as { seal_id: string } }),
  });
  if (!seal) return refuse("SOURCE_REFUSED", "the request's sealed legal source is unreadable");
  return ok({
    request,
    allocation,
    worldId: request.value.origin_ref.world.entity_id,
    entityId: request.value.moved_object_or_quantity_ref.entity_id,
    sealId: seal.value.seal_id,
  });
}

/** The first exact pinned live dependency of a request that its owner has since changed or ended (R2-D18 §3.3), or null. */
export function pinnedDependencyChange(
  src: FreightSource,
  f: FixedRequest,
): EconomyFreightWithdrawal["cause"] | null {
  const r = f.request.value;
  const w3 = (
    dependency: "site_condition" | "material_specification" | "cargo_physical_origin" | "holding",
    pinned: { fact_key: string; version: number },
    observedKey: string,
  ): EconomyFreightWithdrawal["cause"] => ({
    kind: "W3",
    reason: "OWNER_ADMITTED_CESSATION_OR_MISMATCH_OF_AN_EXACT_PINNED_DEPENDENCY",
    dependency,
    pinned,
    observed: { fact_key: observedKey, version: src.getFact(observedKey)?.version ?? 0 },
  });
  const condition = src.getFact(r.requirement.condition.fact_key);
  if (!condition || condition.version !== r.requirement.condition.version)
    return w3("site_condition", r.requirement.condition, r.requirement.condition.fact_key);
  const specification = src.getFact(r.requirement.specification.fact_key);
  if (!specification || specification.version !== r.requirement.specification.version)
    return w3(
      "material_specification",
      r.requirement.specification,
      r.requirement.specification.fact_key,
    );
  // the cargo's physical origin: World-State has committed a destination for it by some other cause
  const transitionKey = worldEntityTransitionKey(f.worldId, f.entityId);
  if (src.getFact(transitionKey))
    return w3("cargo_physical_origin", { fact_key: transitionKey, version: 0 }, transitionKey);
  const holding = readAs(src, r.holding.fact_key, EconomyAcceptedOutputHoldingSchema);
  if (
    !holding ||
    holding.fact.version !== r.holding.version ||
    holding.value.status !== "encumbered"
  )
    return w3("holding", r.holding, r.holding.fact_key);
  return null;
}

const dependencyKeys = (f: FixedRequest): readonly string[] => [
  f.request.value.requirement.condition.fact_key,
  f.request.value.requirement.specification.fact_key,
  worldEntityTransitionKey(f.worldId, f.entityId),
  f.request.value.holding.fact_key,
];

/** GIP's fresh answer for the three clauses a pending request needs (C-03, C-04, C-06), about the request's own sealed terms. */
function requestLegal(src: FreightSource, f: FixedRequest) {
  const r = f.request.value;
  const institution = r.institution.holder_ref.split("/")[2] ?? "";
  const destination = r.destination_or_use_locus_ref.locus.entity_id;
  return evaluateClauses(src, f.sealId, [
    {
      clause: "C-03",
      subject: {
        institution_id: institution,
        destination_locus_id: destination,
        material_class: r.material_handling.material_class,
      },
    },
    {
      clause: "C-04",
      subject: {
        institution_id: institution,
        world_id: f.worldId,
        origin_locus_id: r.origin_ref.locus.entity_id,
        destination_locus_id: destination,
        material_class: r.material_handling.material_class,
        purpose: r.purpose,
        directive_use_id: r.directive_use_id,
      },
      quantity: r.quantity,
    },
    { clause: "C-06", subject: { institution_id: institution, destination_locus_id: destination } },
  ]);
}

// ---------------------------------------------------------------------------------------------
// EL-02S — Economy's owner-derived current status for one prospective Logistics act
// ---------------------------------------------------------------------------------------------

export type FreightActKind = EconomyStatusWitness["act"];

export interface FreightStatus {
  readonly witness: EconomyStatusWitness;
  /** every key the derivation read: the Logistics act guards each at its own commit */
  readonly reads: readonly string[];
}

/**
 * EL-02S (R3-T2 §3): the owner-derived current state of the exact fixed request and its current derived legal/allocative
 * eligibility for ONE prospective Logistics act, freshly re-derived at that act (never a durable flag, an E0 snapshot or the
 * E1 outcome of the same act). GIP's current force is computed through GIP → Economy; Logistics receives only this result and
 * the legal pins it carries. A terminal, withdrawal-pending, consumed, mismatched, ineligible or unresolved status is an
 * ACT-LEVEL NON-COMMIT: it blocks the prospective act, leaves the request's claims protected, and is NOT F1 (CT-1 (iii)).
 */
export function deriveFreightStatus(
  src: FreightSource,
  requestRef: string,
  act: FreightActKind,
): Result<FreightStatus, FreightRefusalCode> {
  const fixed = fixedRequest(src, requestRef);
  if (!fixed.ok) return fixed;
  const f = fixed.value;
  const r = f.request.value;
  const nonCommit = (message: string, details?: Record<string, unknown>) =>
    refuse("NOT_ADMISSIBLE", message, { act_level_non_commit: true, f1: false, ...details });
  if (f.allocation.value.state.status !== "pending")
    return nonCommit(
      "the request is not pending: Economy's current status does not support a prospective act",
      {
        status: f.allocation.value.state.status,
      },
    );
  const useKey = economyFreightDirectiveUseSlotKey(r.directive_use_id);
  const cargoKey = economyFreightCargoSlotKey(f.worldId, f.entityId);
  const requirementKey = economyFreightRequirementSlotKey(
    r.requirement.specification.fact_key.split("/").pop() ?? "",
  );
  const slots = [slotState(src, useKey), slotState(src, cargoKey), slotState(src, requirementKey)];
  if (
    slots.some(
      (s) =>
        !s.fact || s.value?.state.status !== "claimed" || s.value.state.request_ref !== requestRef,
    )
  )
    return nonCommit("the request no longer holds its three exclusive slots");
  const changed = pinnedDependencyChange(src, f);
  if (changed)
    return nonCommit("an exact pinned live dependency of the request has changed or ceased", {
      dependency: changed.kind === "W3" ? changed.dependency : undefined,
    });
  const legal = requestLegal(src, f);
  const first = legal.answers.find((a) => a.applicability !== "applies");
  if (first)
    return nonCommit("the required legal force does not currently apply", {
      clause: first.clause,
      applicability: first.applicability,
      gip_reason: first.reason,
    });
  const now = canonicalNow(src);
  if (!now || !legal.seal) return nonCommit("no coherent canonical cut is available");
  const seal = legal.seal;
  const witness = EconomyStatusWitnessSchema.parse({
    act,
    request: { fact_key: f.request.fact.key, request_ref: requestRef, version: 1 },
    allocation: {
      fact_key: f.allocation.fact.key,
      version: f.allocation.fact.version,
      status: "pending",
    },
    slots: {
      directive_use: pinOf(slots[0]!.fact!),
      cargo: pinOf(slots[1]!.fact!),
      requirement: pinOf(slots[2]!.fact!),
    },
    holding: r.holding,
    requirement: r.requirement,
    legal: {
      seal: pinOf(seal.fact),
      gip_owner_head: seal.postSealHead,
      protected_heads: seal.seal.world_state_protected_heads.map((p) => p.head),
      clauses: reliance(legal.answers),
    },
    derived_at: now,
  } satisfies EconomyStatusWitness);
  return ok({
    witness,
    reads: [
      f.request.fact.key,
      f.allocation.fact.key,
      useKey,
      cargoKey,
      requirementKey,
      ...dependencyKeys(f),
      TEMPORAL_STATE_KEY,
      ...legal.reads,
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// C-07 — withdrawal-pending admission (W2 / W3) and terminal close C
// ---------------------------------------------------------------------------------------------

function logisticsGuard(
  src: FreightSource,
  f: FixedRequest,
): Result<LogisticsGuard, FreightRefusalCode> {
  const commitmentKey = logisticsCommitmentKey(f.worldId, f.entityId);
  const transferKey = logisticsTransferKey(f.worldId, f.entityId);
  const service = requestServiceOf(src, f.worldId, f.entityId, f.request.value.request_ref);
  if (service.kind === "UNREADABLE")
    return refuse(
      "WITHHELD",
      "Logistics' owner state for this request is unreadable: unknown evidence is reconciled, never presumed absent",
    );
  if (service.kind === "DISPATCHED_OR_DELIVERED" || src.getFact(transferKey))
    return refuse(
      "NOT_ADMISSIBLE",
      "a first dispatch is committed: unused withdrawal is defeated and the original transit continues",
      { key: transferKey },
    );
  if (service.kind === "RELEASED_UNUSED")
    return refuse("NOT_ADMISSIBLE", "the service of this request was already released unused");
  return ok(
    service.kind === "COMMITTED"
      ? {
          branch: "SERVICE_COMMITTED_NOT_DISPATCHED",
          commitment: {
            fact_key: commitmentKey,
            version: service.commitment.fact.version,
            status: "COMMITTED",
          },
          transfer: { fact_key: transferKey, version: 0 },
        }
      : {
          branch: "NO_SERVICE_FOR_THIS_REQUEST",
          commitment: { fact_key: commitmentKey, version: service.commitmentVersion },
          transfer: { fact_key: transferKey, version: 0 },
        },
  );
}

/**
 * C-07 withdrawal-pending admission (R2-D18 §2.1; CT-2): Economy's single create-once protective act for a pending request,
 * upon the FIRST owner-admitted occurrence it re-derives at this cut — W2 (GIP's own answer that a required clause no longer
 * applies) before W3 (an owner-admitted cessation or mismatch of an exact pinned dependency). It admits protection ONLY: it
 * releases nothing, closes nothing and needs no no-dispatch proof. Its Logistics guard is branch-sensitive: with no service
 * for this request both request-bound keys are guarded at the version read (the Transfer Record at zero), so a concurrent L0
 * or L1 winner defeats the admission; with an existing L0 the commitment is guarded at its exact observed version and status.
 * A committed first dispatch defeats it. No cause is accepted from a caller, and with no owner-admitted trigger nothing is
 * admitted. W1 (a positive definitive F1) and W4 are WITHHELD and have no branch here.
 */
export function deriveWithdrawal(src: FreightSource, requestRef: string): Planned {
  const fixed = fixedRequest(src, requestRef);
  if (!fixed.ok) return fixed;
  const f = fixed.value;
  if (f.allocation.value.state.status !== "pending")
    return refuse(
      "NOT_ADMISSIBLE",
      "only a pending request is admitted to withdrawal-pending, once",
      {
        status: f.allocation.value.state.status,
      },
    );
  const withdrawalKey = economyFreightWithdrawalKey(requestRef);
  if (src.getFact(withdrawalKey))
    return refuse("NOT_ADMISSIBLE", "the protective admission is create-once", {
      key: withdrawalKey,
    });
  const legal = requestLegal(src, f);
  const lost = legal.answers.find((a) => a.applicability !== "applies");
  const cause: EconomyFreightWithdrawal["cause"] | null = lost
    ? {
        kind: "W2",
        reason: "LOSS_OF_REQUIRED_CURRENT_LEGAL_FORCE_OR_PERMANENT_OPENING_ELIGIBILITY",
        clause: lost.clause as FreightClause,
        applicability: lost.applicability as "does_not_apply" | "contested" | "unresolved",
        gip_reason: lost.reason,
      }
    : pinnedDependencyChange(src, f);
  if (!cause)
    return refuse(
      "NOT_ADMISSIBLE",
      "no owner-admitted withdrawal trigger exists at this cut: narration, a shortfall or an unknown response withdraws nothing",
    );
  const guard = logisticsGuard(src, f);
  if (!guard.ok) return guard;
  const now = canonicalNow(src);
  if (!now) return refuse("PREREQUISITE_MISSING", "no canonical temporal basis is established");
  const withdrawal = EconomyFreightWithdrawalSchema.parse({
    request: { fact_key: f.request.fact.key, request_ref: requestRef, version: 1 },
    act: "withdrawal-pending",
    cause,
    entity: f.request.value.moved_object_or_quantity_ref,
    logistics_guard: guard.value,
    cut_basis_revision: src.revision,
    admitted_at: now,
    effect: "PROTECTION_ONLY_RELEASES_NOTHING_CLOSES_NOTHING",
  } satisfies EconomyFreightWithdrawal);
  const allocation = EconomyFreightAllocationSchema.parse({
    request: f.allocation.value.request,
    state: { status: "withdrawal-pending", withdrawal: { fact_key: withdrawalKey, version: 1 } },
  } satisfies EconomyFreightAllocation);
  return planned(
    [
      { key: withdrawalKey, value: withdrawal, expected_version: 0 },
      {
        key: f.allocation.fact.key,
        value: allocation,
        expected_version: f.allocation.fact.version,
      },
    ],
    [
      f.request.fact.key,
      ...dependencyKeys(f),
      guard.value.commitment.fact_key,
      guard.value.transfer.fact_key,
      TEMPORAL_STATE_KEY,
      ...legal.reads,
    ],
  );
}

/**
 * Terminal close C (R2-D18 §4 steps 5 and 7, §5; EL-01F; CT-4): for a withdrawal-pending request, Economy alone marks it
 * terminal, releases the three exclusive slots EXACTLY ONCE and returns the holding to available.
 *
 *  - No service for this request (F4): the request-specific absence is fenced AT THIS COMMIT'S OWN CUT — the request-bound
 *    commitment key at the version read (zero when absent; the exact observed version when it holds another, released
 *    request) and the Transfer Record at zero — so a concurrent L0 or L1 winner defeats the close and it re-derives. The
 *    absence is derived, never stored, and is not a free entity slot.
 *  - A service was committed and released unused (F2): the close consumes Logistics' immutable unused-release event as a
 *    typed external registration and guards the released commitment at its exact observed version and status — never as zero.
 *  - A service is still committed: Logistics' unused release precedes the close. A dispatch precludes it.
 *
 * The closure duty is an irrevocable conservation condition of the originally valid allocation: it is discharged without any
 * new GIP draw, even if the legal basis has since lapsed. F1 alone never closes anything.
 */
export function deriveClose(src: FreightSource, requestRef: string): Planned {
  const fixed = fixedRequest(src, requestRef);
  if (!fixed.ok) return fixed;
  const f = fixed.value;
  const state = f.allocation.value.state;
  if (state.status !== "withdrawal-pending")
    return refuse(
      "NOT_ADMISSIBLE",
      "only a withdrawal-pending request is terminally closed: a trigger admits protection first",
      { status: state.status },
    );
  const withdrawal = src.getFact(state.withdrawal.fact_key);
  if (!withdrawal)
    return refuse("PREREQUISITE_MISSING", "the protective admission is not committed");
  const r = f.request.value;
  const commitmentKey = logisticsCommitmentKey(f.worldId, f.entityId);
  const transferKey = logisticsTransferKey(f.worldId, f.entityId);
  const releaseKey = logisticsUnusedReleaseKey(requestRef);
  const service = requestServiceOf(src, f.worldId, f.entityId, requestRef);
  if (service.kind === "UNREADABLE")
    return refuse(
      "WITHHELD",
      "Logistics' owner state is unreadable: unknown evidence protects the claims",
    );
  if (service.kind === "DISPATCHED_OR_DELIVERED" || src.getFact(transferKey))
    return refuse(
      "NOT_ADMISSIBLE",
      "a first dispatch is committed: there is no unused cancellation, and the original transit stays protected",
      { key: transferKey },
    );
  if (service.kind === "COMMITTED")
    return refuse(
      "NOT_ADMISSIBLE",
      "a service is committed for this request: Logistics' unused release precedes the Economy close",
      { key: commitmentKey },
    );
  let basis: EconomyFreightClose["no_dispatch_basis"];
  const reads = [
    f.request.fact.key,
    withdrawal.key,
    commitmentKey,
    transferKey,
    TEMPORAL_STATE_KEY,
  ];
  if (service.kind === "RELEASED_UNUSED") {
    const event = readAs(src, releaseKey, LogisticsUnusedReleaseSchema);
    if (
      !event ||
      event.fact.version !== 1 ||
      event.value.event_id !== logisticsUnusedReleaseEventId(requestRef) ||
      event.value.request.request_id !== requestRef
    )
      return refuse("WITHHELD", "the unused-release event of this request is not committed", {
        key: releaseKey,
      });
    basis = {
      kind: "UNUSED_RELEASE_REGISTERED",
      registration: {
        outcome: "F2",
        owner: OWNER_LOGISTICS,
        event: {
          fact_key: releaseKey,
          event_id: event.value.event_id,
          version: 1,
          content_sha256: sha256Canonical(event.value),
        },
        commitment: {
          fact_key: commitmentKey,
          version: service.commitment.fact.version,
          status: "RELEASED_UNUSED",
        },
      },
    };
    reads.push(releaseKey);
  } else {
    basis = { kind: "NO_SERVICE_FENCED_AT_THIS_CUT" };
    // no unused-release event may exist for a request that never had a service
    reads.push(releaseKey);
    if (src.getFact(releaseKey))
      return refuse("WITHHELD", "conflicting Logistics evidence for this request", {
        key: releaseKey,
      });
  }
  const now = canonicalNow(src);
  if (!now) return refuse("PREREQUISITE_MISSING", "no canonical temporal basis is established");
  const closeKey = economyFreightCloseKey(requestRef);
  const useKey = economyFreightDirectiveUseSlotKey(r.directive_use_id);
  const cargoKey = economyFreightCargoSlotKey(f.worldId, f.entityId);
  const requirementKey = economyFreightRequirementSlotKey(
    r.requirement.specification.fact_key.split("/").pop() ?? "",
  );
  const slots = [slotState(src, useKey), slotState(src, cargoKey), slotState(src, requirementKey)];
  if (
    slots.some(
      (s) =>
        !s.fact || s.value?.state.status !== "claimed" || s.value.state.request_ref !== requestRef,
    )
  )
    return refuse(
      "SOURCE_REFUSED",
      "the request does not hold its three slots: nothing is released twice",
    );
  const holding = readAs(src, r.holding.fact_key, EconomyAcceptedOutputHoldingSchema);
  if (!holding || holding.value.status !== "encumbered")
    return refuse(
      "SOURCE_REFUSED",
      "the accepted-output holding is not encumbered by this request",
    );
  const close = EconomyFreightCloseSchema.parse({
    request: { fact_key: f.request.fact.key, request_ref: requestRef, version: 1 },
    withdrawal: pinOf(withdrawal),
    no_dispatch_basis: basis,
    released: { directive_use: useKey, cargo: cargoKey, requirement: requirementKey },
    cut_basis_revision: src.revision,
    closed_at: now,
  } satisfies EconomyFreightClose);
  const release = (slot_kind: EconomyFreightSlot["slot_kind"]): EconomyFreightSlot => ({
    slot_kind,
    state: { status: "released", request_ref: requestRef, close: closeKey },
  });
  const allocation = EconomyFreightAllocationSchema.parse({
    request: f.allocation.value.request,
    state: { status: "terminal", close: { fact_key: closeKey, version: 1 } },
  } satisfies EconomyFreightAllocation);
  const released = EconomyAcceptedOutputHoldingSchema.parse({
    ...holding.value,
    status: "available",
    restriction_or_authority_ref: holding.value.provenance_ref.retention_clause.fact_key,
  } satisfies EconomyAcceptedOutputHolding);
  return planned(
    [
      { key: closeKey, value: close, expected_version: 0 },
      {
        key: f.allocation.fact.key,
        value: allocation,
        expected_version: f.allocation.fact.version,
      },
      { key: useKey, value: release("directive-use"), expected_version: slots[0]!.version },
      { key: cargoKey, value: release("cargo"), expected_version: slots[1]!.version },
      { key: requirementKey, value: release("requirement"), expected_version: slots[2]!.version },
      { key: holding.fact.key, value: released, expected_version: holding.fact.version },
    ],
    reads,
  );
}

// ---------------------------------------------------------------------------------------------
// E1 — one-use consumption against the immutable first-dispatch event (EL-01F F3)
// ---------------------------------------------------------------------------------------------

/**
 * E1 (R2-D18 §4 step 8; EL-01F "Consumption identity and replay"): Economy consumes ONE directive use, with its whole
 * source-authorized ceiling including the unused numerical headroom, against the exact committed first dispatch. It is
 * create-once, keyed by the directive identity and the IMMUTABLE first-dispatch event — the Transfer Record's owner key, its
 * committed version (1), its content digest and the canonical dispatch commit receipt (the group and intent that committed
 * it) — never a live Transfer Record version. It is an Economy write, not a GIP change, and it redoes no prospective
 * authority, ceiling or status admission. The three slots become consumed: a committed dispatch precludes unused release.
 */
export function deriveUseConsumption(src: FreightSource, requestRef: string): Planned {
  const fixed = fixedRequest(src, requestRef);
  if (!fixed.ok) return fixed;
  const f = fixed.value;
  const r = f.request.value;
  if (f.allocation.value.state.status !== "pending")
    return refuse(
      "NOT_ADMISSIBLE",
      "the request's one use is consumed once, from a pending request",
      {
        status: f.allocation.value.state.status,
      },
    );
  const transferKey = logisticsTransferKey(f.worldId, f.entityId);
  const transfer = readAs(src, transferKey, LogisticsTransferSchema);
  if (!transfer)
    return refuse(
      "WITHHELD",
      "no committed first dispatch exists: an unknown result is reconciled, never assumed",
      {
        key: transferKey,
      },
    );
  const t = transfer.value;
  if (
    transfer.fact.owner !== OWNER_LOGISTICS ||
    transfer.fact.version !== 1 ||
    t.state.status !== "IN_TRANSFER" ||
    t.request.request_id !== requestRef ||
    t.freight === undefined ||
    t.moved.entity_id !== f.entityId
  )
    return refuse(
      "SOURCE_REFUSED",
      "the Transfer Record is not this request's own committed first dispatch at its original version",
      { key: transferKey },
    );
  if (
    t.freight.dispatched.unit !== r.ceiling.unit ||
    t.freight.dispatched.amount > r.ceiling.amount ||
    t.freight.dispatched.amount !== r.quantity.amount
  )
    return refuse(
      "SOURCE_REFUSED",
      "the dispatched quantity is not the whole cargo within the one-use ceiling",
    );
  const now = canonicalNow(src);
  if (!now) return refuse("PREREQUISITE_MISSING", "no canonical temporal basis is established");
  const consumptionKey = economyFreightUseConsumptionKey(r.directive_use_id);
  const useKey = economyFreightDirectiveUseSlotKey(r.directive_use_id);
  const cargoKey = economyFreightCargoSlotKey(f.worldId, f.entityId);
  const requirementKey = economyFreightRequirementSlotKey(
    r.requirement.specification.fact_key.split("/").pop() ?? "",
  );
  const slots = [slotState(src, useKey), slotState(src, cargoKey), slotState(src, requirementKey)];
  if (
    slots.some(
      (s) =>
        !s.fact || s.value?.state.status !== "claimed" || s.value.state.request_ref !== requestRef,
    )
  )
    return refuse("SOURCE_REFUSED", "the request does not hold its three slots");
  const consumption = EconomyFreightUseConsumptionSchema.parse({
    directive_use_id: r.directive_use_id,
    request: { fact_key: f.request.fact.key, request_ref: requestRef, version: 1 },
    dispatch_event: {
      owner: OWNER_LOGISTICS,
      transfer: {
        fact_key: transferKey,
        transfer_id: t.transfer_id,
        version: 1,
        content_sha256: sha256Canonical(t),
      },
      receipt: {
        group_id: transfer.fact.provenance.group_id,
        intent_id: transfer.fact.provenance.intent_id,
      },
      dispatched_at: t.dispatched_at,
    },
    ceiling: r.ceiling,
    dispatched: t.freight.dispatched,
    unused_headroom: {
      amount: r.ceiling.amount - t.freight.dispatched.amount,
      unit: r.ceiling.unit,
    },
    uses_consumed: 1,
    consumed_at: now,
    nature: USE_CONSUMPTION_NATURE,
  } satisfies EconomyFreightUseConsumption);
  const consume = (slot_kind: EconomyFreightSlot["slot_kind"]): EconomyFreightSlot => ({
    slot_kind,
    state: { status: "consumed", request_ref: requestRef, consumption: consumptionKey },
  });
  const allocation = EconomyFreightAllocationSchema.parse({
    request: f.allocation.value.request,
    state: { status: "dispatch-consumed", consumption: { fact_key: consumptionKey, version: 1 } },
  } satisfies EconomyFreightAllocation);
  return planned(
    [
      { key: consumptionKey, value: consumption, expected_version: 0 },
      {
        key: f.allocation.fact.key,
        value: allocation,
        expected_version: f.allocation.fact.version,
      },
      { key: useKey, value: consume("directive-use"), expected_version: slots[0]!.version },
      { key: cargoKey, value: consume("cargo"), expected_version: slots[1]!.version },
      { key: requirementKey, value: consume("requirement"), expected_version: slots[2]!.version },
    ],
    [f.request.fact.key, transferKey, TEMPORAL_STATE_KEY],
  );
}

// ---------------------------------------------------------------------------------------------
// ER — the receipt-bound Economy result (a stage of the one engaged delivery boundary)
// ---------------------------------------------------------------------------------------------

export interface ReceiptPrior {
  readonly request: OwnerFact;
  readonly allocation: OwnerFact;
  readonly holding: OwnerFact;
  readonly consumption: OwnerFact;
  readonly commitment: OwnerFact;
  readonly transfer: OwnerFact;
  readonly delivery: OwnerFact;
  readonly transition: OwnerFact;
  /** the engaged boundary instant the stage resolves at */
  readonly at: CanonicalTime;
}

export interface ReceiptResult {
  readonly receipt: EconomyFreightReceipt;
  readonly allocation: EconomyFreightAllocation;
  readonly holding: EconomyAcceptedOutputHolding;
}

/**
 * ER (R2-D18 §4 step 10; R3-T2 §4 `LR → ER`): after World-State's ECT-01 and Logistics' retirement, Economy consumes that
 * exact receipt and release ONCE, binds it to the original allocation and closes the in-transit encumbrance. It matches the
 * request, the consumed use, the commitment (RELEASED after the destination commit), the Transfer Record (RETIRED), the
 * delivery cause, the ECT-01 owner / key / version, both loci, the boundary and the beneficiary: an identical-looking other
 * cargo, another world's transition or a wrong beneficiary cannot satisfy it. Delivery alone, or retirement alone, credits
 * nothing.
 */
export function deriveFreightReceipt(p: ReceiptPrior): Result<ReceiptResult, "NOT_RECEIVABLE"> {
  const no = (
    message: string,
  ): { ok: false; error: { code: "NOT_RECEIVABLE"; message: string } } => ({
    ok: false,
    error: { code: "NOT_RECEIVABLE", message },
  });
  const request = EconomyFreightRequestSchema.safeParse(p.request.value);
  const allocation = EconomyFreightAllocationSchema.safeParse(p.allocation.value);
  const holding = EconomyAcceptedOutputHoldingSchema.safeParse(p.holding.value);
  const consumption = EconomyFreightUseConsumptionSchema.safeParse(p.consumption.value);
  const commitment = LogisticsCommitmentSchema.safeParse(p.commitment.value);
  const transfer = LogisticsTransferSchema.safeParse(p.transfer.value);
  const delivery = EntityTransitionCauseSchema.safeParse(p.delivery.value);
  const transition = EntityTransitionCloseSchema.safeParse(p.transition.value);
  if (
    !request.success ||
    !allocation.success ||
    !holding.success ||
    !consumption.success ||
    !commitment.success ||
    !transfer.success ||
    !delivery.success ||
    !transition.success
  )
    return no("a source of the receipt is malformed");
  const r = request.data;
  const requestRef = r.request_ref;
  const worldId = r.origin_ref.world.entity_id;
  const entityId = r.moved_object_or_quantity_ref.entity_id;
  const c = commitment.data;
  const t = transfer.data;
  const tr = transition.data;
  if (p.request.version !== 1 || p.request.key !== economyFreightRequestKey(requestRef))
    return no("the request is the original sealed request");
  if (
    allocation.data.state.status !== "dispatch-consumed" ||
    allocation.data.request.request_ref !== requestRef ||
    allocation.data.state.consumption.fact_key !== p.consumption.key
  )
    return no("the receipt follows the one-use consumption of this very request");
  if (
    consumption.data.request.request_ref !== requestRef ||
    consumption.data.dispatch_event.transfer.fact_key !== p.transfer.key
  )
    return no("the consumed use is this request's own first dispatch");
  if (
    p.commitment.owner !== OWNER_LOGISTICS ||
    p.commitment.key !== logisticsCommitmentKey(worldId, entityId) ||
    c.request.request_id !== requestRef ||
    c.request.fact_key !== p.request.key ||
    c.state.status !== "RELEASED" ||
    c.freight === undefined
  )
    return no("Logistics has not released this request's commitment after the destination commit");
  if (
    p.transfer.owner !== OWNER_LOGISTICS ||
    p.transfer.key !== logisticsTransferKey(worldId, entityId) ||
    t.request.request_id !== requestRef ||
    t.state.status !== "RETIRED" ||
    t.state.delivery.fact_key !== p.delivery.key ||
    t.state.destination_commit.fact_key !== p.transition.key ||
    t.state.destination_commit.version !== p.transition.version
  )
    return no("Logistics has not retired this request's transfer against this destination commit");
  if (
    p.delivery.owner !== OWNER_LOGISTICS ||
    p.delivery.version !== 1 ||
    p.delivery.key !== logisticsDeliveryKey(worldId, entityId) ||
    delivery.data.subject.entity_id !== entityId
  )
    return no("the delivery cause is not this entity's own");
  if (
    p.transition.owner !== OWNER_WORLD_STATE ||
    p.transition.version !== 1 ||
    p.transition.key !== worldEntityTransitionKey(worldId, entityId) ||
    tr.transition_id !== entityTransitionId(delivery.data.cause_id) ||
    tr.entity.entity_id !== entityId ||
    tr.entity.fact_key !== r.moved_object_or_quantity_ref.fact_key ||
    tr.cause.owner !== OWNER_LOGISTICS ||
    tr.cause.fact_key !== p.delivery.key ||
    tr.cause.cause_id !== delivery.data.cause_id ||
    !canonicalEqual(tr.locus.from, r.origin_ref) ||
    !canonicalEqual(tr.locus.to, r.destination_or_use_locus_ref)
  )
    return no(
      "World-State has not committed THIS entity's destination for THIS delivery, from the request's origin to its destination",
    );
  if (
    c.delivery.boundary_id !== logisticsBoundaryId(requestRef) ||
    compareTime(p.at, c.delivery.at) !== 0
  )
    return no("the receipt is recorded at the commitment's own declared boundary instant");
  if (
    holding.data.status !== "encumbered" ||
    holding.data.object_ref.entity_id !== entityId ||
    holding.data.holder_ref !== r.institution.beneficiary_ref ||
    p.holding.key !== r.holding.fact_key
  )
    return no(
      "the holding is not this request's encumbered accepted output of the same beneficiary",
    );
  const receiptKey = economyFreightResultKey(requestRef);
  const receipt = EconomyFreightReceiptSchema.safeParse({
    request: { fact_key: p.request.key, request_ref: requestRef, version: 1 },
    consumption: pinOf(p.consumption),
    entity: r.moved_object_or_quantity_ref,
    commitment: { fact_key: p.commitment.key, version: p.commitment.version, status: "RELEASED" },
    transfer: { fact_key: p.transfer.key, version: p.transfer.version, status: "RETIRED" },
    delivery: { fact_key: p.delivery.key, version: 1, cause_id: delivery.data.cause_id },
    destination_commit: {
      owner: OWNER_WORLD_STATE,
      fact_key: p.transition.key,
      version: 1,
      transition_id: tr.transition_id,
    },
    origin: r.origin_ref,
    destination: r.destination_or_use_locus_ref,
    beneficiary_ref: r.institution.beneficiary_ref,
    boundary: c.delivery,
    received: r.quantity,
    output_class: r.material_handling.material_class,
    received_at: p.at,
    close_stage: economyFreightReceiptStage(requestRef),
  });
  const nextAllocation = EconomyFreightAllocationSchema.safeParse({
    request: allocation.data.request,
    state: {
      status: "received",
      consumption: allocation.data.state.consumption,
      receipt: { fact_key: receiptKey, version: 1 },
    },
  });
  const nextHolding = EconomyAcceptedOutputHoldingSchema.safeParse({
    ...holding.data,
    status: "available",
    restriction_or_authority_ref: holding.data.provenance_ref.retention_clause.fact_key,
    provenance_ref: {
      ...holding.data.provenance_ref,
      receipt: { fact_key: receiptKey, version: 1 },
    },
  });
  if (!receipt.success || !nextAllocation.success || !nextHolding.success)
    return no("the result is not a representable receipt");
  return ok({ receipt: receipt.data, allocation: nextAllocation.data, holding: nextHolding.data });
}

// ---------------------------------------------------------------------------------------------
// AD — independent current destination adequacy
// ---------------------------------------------------------------------------------------------

export type AdequacyStatus =
  | "NO_REQUEST"
  | "UNMET_NO_CARGO_AT_DESTINATION"
  | "ENCUMBERED_IN_TRANSIT"
  | "RECEIVED_ADEQUACY_NOT_YET_ASSESSED"
  | "WHOLE_RECEIVED_QUANTITY_AVAILABLE_FOR_SITE_PROVISIONING"
  | "CLOSED_UNUSED";

/** Economy's derived current answer for one request (a read; nothing is written and no backward credit is inferred). */
export function adequacyStatusOf(src: FreightSource, requestRef: string): AdequacyStatus {
  const fixed = fixedRequest(src, requestRef);
  if (!fixed.ok) return "NO_REQUEST";
  const status = fixed.value.allocation.value.state.status;
  if (status === "terminal") return "CLOSED_UNUSED";
  if (status === "dispatch-consumed") return "ENCUMBERED_IN_TRANSIT";
  if (status === "received")
    return src.getFact(economyDestinationAdequacyKey(requestRef))
      ? "WHOLE_RECEIVED_QUANTITY_AVAILABLE_FOR_SITE_PROVISIONING"
      : "RECEIVED_ADEQUACY_NOT_YET_ASSESSED";
  return "UNMET_NO_CARGO_AT_DESTINATION";
}

/**
 * AD (R2-D18 §4 step 10): the separate AS-OF-NOW institutional-demand-adequacy conclusion, taken at its own cut from CURRENT
 * owner facts: the receipt-bound result exists; the one current-locus authority (World-State, after retirement) places the
 * same conserved entity at the request's destination; the site requirement still stands; the Production specification is
 * unchanged; the received whole quantity meets it in class, amount and unit; GIP's C-03 site-use relation currently applies;
 * and the holding is available by that receipt with no incompatible claim. It then — and only then — records "the whole
 * received quantity available for this site's provisioning". It is not repair, production or duplicate inventory.
 */
export function deriveDestinationAdequacy(src: FreightSource, requestRef: string): Planned {
  const fixed = fixedRequest(src, requestRef);
  if (!fixed.ok) return fixed;
  const f = fixed.value;
  const r = f.request.value;
  const state = f.allocation.value.state;
  if (state.status !== "received")
    return refuse(
      "WITHHELD",
      "no receipt-bound result exists: before the destination commit and the retirement the destination has no free cargo",
      { status: state.status },
    );
  const receipt = readAs(src, state.receipt.fact_key, EconomyFreightReceiptSchema);
  if (!receipt) return refuse("PREREQUISITE_MISSING", "the freight receipt is not committed");
  const adequacyKey = economyDestinationAdequacyKey(requestRef);
  if (src.getFact(adequacyKey))
    return refuse("NOT_ADMISSIBLE", "the adequacy conclusion of this receipt is recorded once", {
      key: adequacyKey,
    });
  const locus = resolveEntityLocus(src, f.worldId, f.entityId);
  const transitionKey = worldEntityTransitionKey(f.worldId, f.entityId);
  const transition = src.getFact(transitionKey);
  if (
    !locus ||
    !transition ||
    locus.phase !== "DESTINATION_COMMITTED" ||
    locus.authority !== "WORLD_STATE" ||
    !canonicalEqual(locus.stationary, r.destination_or_use_locus_ref)
  )
    return refuse(
      "WITHHELD",
      "World-State is not the stationary custodian of this entity at the request's destination",
      { phase: locus?.phase ?? "unknown" },
    );
  const condition = readAs(src, r.requirement.condition.fact_key, WorldSiteConditionSchema);
  const specification = readAs(
    src,
    r.requirement.specification.fact_key,
    ProductionMaterialSpecificationSchema,
  );
  if (!condition || !specification || condition.value.standing.status !== "STANDING")
    return refuse("WITHHELD", "the site requirement no longer stands at this cut");
  const spec = specification.value;
  if (
    receipt.value.output_class !== spec.material_class ||
    receipt.value.received.unit !== spec.quantity.unit ||
    receipt.value.received.amount < spec.quantity.amount
  )
    return refuse(
      "WITHHELD",
      "the received quantity does not meet the site's exact material prerequisite",
    );
  const holding = readAs(src, r.holding.fact_key, EconomyAcceptedOutputHoldingSchema);
  if (
    !holding ||
    holding.value.status !== "available" ||
    holding.value.provenance_ref.receipt?.fact_key !== receipt.fact.key
  )
    return refuse("WITHHELD", "the holding is not available by this very receipt");
  const institution = r.institution.holder_ref.split("/")[2] ?? "";
  const legal = evaluateClauses(src, f.sealId, [
    {
      clause: "C-03",
      subject: {
        institution_id: institution,
        destination_locus_id: r.destination_or_use_locus_ref.locus.entity_id,
        material_class: receipt.value.output_class,
      },
    },
  ]);
  const withheld = notApplying(legal.answers);
  if (withheld) return withheld;
  const now = canonicalNow(src);
  if (!now) return refuse("PREREQUISITE_MISSING", "no canonical temporal basis is established");
  const adequacy = EconomyDestinationAdequacySchema.parse({
    request: { fact_key: f.request.fact.key, request_ref: requestRef, version: 1 },
    receipt: pinOf(receipt.fact),
    requirement: {
      specification: pinOf(specification.fact),
      condition: pinOf(condition.fact),
      material_class: spec.material_class,
      quantity: spec.quantity,
    },
    custody: {
      authority: "WORLD_STATE",
      locus: r.destination_or_use_locus_ref,
      destination_commit: pinOf(transition),
    },
    site_use: reliance(legal.answers)[0]!,
    result: {
      status: "WHOLE_RECEIVED_QUANTITY_AVAILABLE_FOR_SITE_PROVISIONING",
      available: receipt.value.received,
      required: spec.quantity,
      excludes: "NOT_REPAIR_PRODUCTION_OR_DUPLICATE_INVENTORY",
    },
    origin_availability: false,
    assessed_at: now,
  } satisfies EconomyDestinationAdequacy);
  return planned(
    [{ key: adequacyKey, value: adequacy, expected_version: 0 }],
    [
      f.request.fact.key,
      f.allocation.fact.key,
      receipt.fact.key,
      transitionKey,
      logisticsTransferKey(f.worldId, f.entityId),
      condition.fact.key,
      specification.fact.key,
      holding.fact.key,
      TEMPORAL_STATE_KEY,
      ...legal.reads,
    ],
  );
}
