import {
  AdmitFreightServiceInputSchema,
  AdmitServiceBasisInputSchema,
  EconomyFreightAllocationSchema,
  EconomyFreightRequestSchema,
  FACET_LOGISTICS_STATE,
  FREIGHT_PROFILE,
  FreightRequestTargetSchema,
  LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY,
  LogisticsCommitmentSchema,
  LogisticsFreightDispatchEnrollmentSchema,
  LogisticsServiceBasisSchema,
  LogisticsServiceSlotSchema,
  LogisticsTransferSchema,
  LogisticsUnusedReleaseSchema,
  OWNER_ECONOMY,
  OWNER_LOGISTICS,
  OWNER_WORLD_STATE,
  PublicationSchema,
  ServicePremiseSchema,
  TEMPORAL_STATE_KEY,
  WorldCorridorSchema,
  compareTime,
  economyFreightAllocationKey,
  economyFreightRequestKey,
  economyFreightUseConsumptionKey,
  fail,
  logisticsBoundaryId,
  logisticsCommitmentKey,
  logisticsObjectId,
  logisticsServiceBasisKey,
  logisticsServiceSlotKey,
  logisticsTransferKey,
  logisticsUnusedReleaseEventId,
  logisticsUnusedReleaseKey,
  ok,
  temporalObjectKey,
  worldCorridorKey,
  worldEntityTransitionKey,
  worldLocusKey,
  worldProfileKey,
  type CanonicalTime,
  type CommitGroup,
  type EconomyFreightRequest,
  type EconomyStatusWitness,
  type LogisticsCommitment,
  type LogisticsFreightDispatchEnrollment,
  type LogisticsServiceBasis,
  type LogisticsServiceSlot,
  type LogisticsTransfer,
  type LogisticsUnusedRelease,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { deriveFreightStatus, requestServiceOf } from "./economy-derive.ts";
import {
  canonicalNow,
  checkPlan,
  committedAct,
  planned,
  publishPlan,
  refuse,
  sealedSlice,
  stateSource,
  storeSource,
  type FreightErrorCode,
  type FreightRefusalCode,
  type FreightSource,
  type Planned,
} from "./common.ts";
import { FREIGHT_LOGISTICS_RULE, resolveKey } from "../owners/registry.ts";
import { reject, type Rejection } from "../owners/rejection.ts";
import type { CampaignStore, CommitOutcome } from "../persistence/store.ts";
import { worldCorridorViolation } from "../world/corridor.ts";
import { parsePhysicalSubject } from "../world/physical-subject.ts";
import { deriveCommitment, deriveTransfer, movementRequestOfFreight } from "../logistics/derive.ts";
import { resolveEntityLocus } from "../logistics/locus.ts";
import { readDispatchEnrollment, pendingDispatchEnrollment } from "./dispatch-fence.ts";

/**
 * IM-05 Logistics — the service half of the ROADBED first freight profile (R2-D18 v1.2.1 §4 steps 5-8, §5; R3-T2 §§2-5 EL-01F
 * / EL-02S as corrected by CT-1..CT-4).
 *
 * Logistics owns the Non-Agentive Service Basis, the service commitment (L0), its unused release (F2), the Transfer Record and
 * first dispatch (L1 / F3), delivery and retirement. It never owns the economic request, never evaluates GIP, and reads only
 * Economy's owner-derived current status (EL-02S), freshly re-derived at EACH act and guarded at that act's own commit.
 *
 *   F  (Foundation)   `verifyFreightRequest`      read-only: the live request, its slots and Economy's current status; NO write
 *   L0 (Integration)  `deriveFreightCommitment`   service admission against an independently sourced, actual service
 *   F2                `deriveUnusedRelease`       the UNUSED release of an existing L0, with the Transfer Record guarded absent
 *   L1 / F3           `deriveFreightDispatch`     the committed first dispatch (never delivery) and its enrollment receipt
 *
 * WITHHELD: a positive definitive F1 terminal refusal. `deriveServiceResolution` reports Logistics' derived, non-authoritative
 * service-resolution outcome for one exact request and classifies every non-commit as one of CT-1's three NON-F1 classes; it
 * never yields a positive F1, writes nothing, and no Logistics refusal kind, key, state or receipt exists.
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
const same = canonicalEqual;

function sealedRequest(
  src: Pick<FreightSource, "getFact">,
  requestRef: string,
): Result<Read<EconomyFreightRequest>, FreightRefusalCode> {
  const key = economyFreightRequestKey(requestRef);
  const request = readAs(src, key, EconomyFreightRequestSchema);
  if (
    !request ||
    request.fact.owner !== OWNER_ECONOMY ||
    request.fact.version !== 1 ||
    request.value.request_class !== FREIGHT_PROFILE ||
    request.value.request_ref !== requestRef
  )
    return refuse(
      "PREREQUISITE_MISSING",
      "no sealed first-profile Economy freight request exists at this identity: Logistics invents no request",
      { key },
    );
  return ok(request);
}

// ---------------------------------------------------------------------------------------------
// Non-Agentive Service Basis
// ---------------------------------------------------------------------------------------------

/**
 * The Service Basis its own sealed `service_premise` slice determines (R2-D18 §4 step 6): an independently admitted,
 * Logistics-owned, non-agentive service for the EXACT ordered World-State corridor and endpoints, with one whole-cargo slot,
 * real handling / loading / receiving capability and a source-qualified future delivery boundary. It is not created from a
 * request, from the permission or from corridor topology alone: the World-State corridor of exactly these ordered endpoints
 * must itself be committed (a missing, reverse or wrong-world corridor refuses), and the authored boundary must still lie in
 * the future.
 */
export function deriveServiceBasis(src: FreightSource, worldId: string, sliceId: string): Planned {
  const sealed = sealedSlice(src, worldId, sliceId, "service_premise");
  if (!sealed.ok) return sealed;
  const { attestation, slice, provenance } = sealed.value;
  const premise = ServicePremiseSchema.safeParse(slice.premise);
  if (!premise.success)
    return refuse("SOURCE_REFUSED", "the slice is not a typed non-agentive service premise", {
      slice_id: sliceId,
    });
  const p = premise.data;
  const pins = attestation.value.pins;
  if (
    p.world_id !== worldId ||
    p.origin_locus_id !== pins.origin.entity_id ||
    p.destination_locus_id !== pins.destination.entity_id
  )
    return refuse(
      "SOURCE_REFUSED",
      "the service runs the attested origin to the attested destination, in that order",
      {
        slice_id: sliceId,
      },
    );
  const corridorKey = worldCorridorKey(worldId, p.origin_locus_id, p.destination_locus_id);
  const corridor = readAs(src, corridorKey, WorldCorridorSchema);
  if (!corridor || corridor.fact.owner !== OWNER_WORLD_STATE)
    return refuse(
      "PREREQUISITE_MISSING",
      "no World-State corridor connects these ordered endpoints: a service is never inferred from a request or a permission",
      { key: corridorKey },
    );
  const topology = worldCorridorViolation(corridor.fact.key, corridor.fact.value, {
    get: (k) => src.getFact(k),
  });
  if (topology) return refuse("SOURCE_REFUSED", topology, { key: corridorKey });
  const now = canonicalNow(src);
  if (!now) return refuse("PREREQUISITE_MISSING", "no canonical temporal basis is established");
  if (compareTime(now, p.delivery_boundary_at) !== -1)
    return refuse(
      "NOT_ADMISSIBLE",
      "the service's source-qualified delivery boundary is not in the future",
      {
        delivery_boundary_at: p.delivery_boundary_at,
      },
    );
  const key = logisticsServiceBasisKey(p.basis_id);
  if (src.getFact(key))
    return refuse("NOT_ADMISSIBLE", "the service basis is admitted from its sealed slice once", {
      key,
    });
  const worldKey = worldProfileKey(worldId);
  const locality = (locusId: string) => ({
    world: { fact_key: worldKey, entity_id: worldId },
    locus: { fact_key: worldLocusKey(worldId, locusId), entity_id: locusId },
  });
  const value = LogisticsServiceBasisSchema.parse({
    basis_id: p.basis_id,
    basis: "NON_AGENTIVE_SOURCE_QUALIFIED_SINGLE_WHOLE_CARGO_LEG",
    origin: locality(p.origin_locus_id),
    destination: locality(p.destination_locus_id),
    corridor: { owner: OWNER_WORLD_STATE, fact_key: corridorKey, version: corridor.fact.version },
    whole_cargo_slots: 1,
    handling: p.handling,
    delivery_boundary_at: p.delivery_boundary_at,
    original: provenance,
  } satisfies LogisticsServiceBasis);
  return planned(
    [{ key, value, expected_version: 0 }],
    [attestation.fact.key, corridorKey, TEMPORAL_STATE_KEY],
  );
}

// ---------------------------------------------------------------------------------------------
// L0 — service admission
// ---------------------------------------------------------------------------------------------

/**
 * L0 (R2-D18 §4 step 6; R3-T2 §4): Logistics commits ONE entity-keyed service for the exact sealed request, without changing
 * Economy's request. It requires, at this act's own cut:
 *
 *  - Economy's fresh EL-02S status S0 for THIS service-admission act (which renews GIP applicability through Economy); a
 *    non-positive status is an act-level non-commit and is not F1;
 *  - an independently admitted Service Basis whose ordered endpoints EQUAL the request's, whose handling takes this cargo's
 *    material and whole quantity, and whose delivery boundary is still in the future;
 *  - the basis's one whole-cargo slot free (a held slot is contested capacity);
 *  - the whole cargo stationary at its origin under the one current-locus authority, with no Transfer Record or transition,
 *    and the entity's commitment slot either absent or holding a prior request's UNUSED release.
 *
 * Every fact Economy's status relied on is guarded at this commit, so a concurrent withdrawal-pending admission or terminal
 * close defeats the service admission (and this commitment's own key defeats a concurrent no-service withdrawal or close).
 */
export function deriveFreightCommitment(
  src: FreightSource,
  requestRef: string,
  basisId: string,
): Planned {
  const request = sealedRequest(src, requestRef);
  if (!request.ok) return request;
  const r = request.value.value;
  const basisKey = logisticsServiceBasisKey(basisId);
  const basis = readAs(src, basisKey, LogisticsServiceBasisSchema);
  if (!basis)
    return refuse(
      "PREREQUISITE_MISSING",
      "no independently admitted service basis exists: nothing is committed and nothing is refused",
      { key: basisKey },
    );
  const status = deriveFreightStatus(src, requestRef, "L0/service-admission");
  if (!status.ok) return status;
  const b = basis.value;
  if (!same(b.origin, r.origin_ref) || !same(b.destination, r.destination_or_use_locus_ref))
    return refuse(
      "NOT_ADMISSIBLE",
      "the service's ordered endpoints are not exactly the request's",
      {
        key: basisKey,
      },
    );
  if (
    b.handling.material_class !== r.material_handling.material_class ||
    b.handling.max_quantity.unit !== r.quantity.unit ||
    r.quantity.amount > b.handling.max_quantity.amount
  )
    return refuse(
      "NOT_ADMISSIBLE",
      "the service cannot load, carry and receive this whole cargo: its real handling limit is not met",
      { capacity: b.handling.max_quantity, cargo: r.quantity },
    );
  const corridor = readAs(src, b.corridor.fact_key, WorldCorridorSchema);
  if (!corridor || corridor.fact.version !== b.corridor.version)
    return refuse(
      "NOT_ADMISSIBLE",
      "the service's corridor is no longer the one it was admitted on",
    );
  const now = canonicalNow(src);
  if (!now) return refuse("PREREQUISITE_MISSING", "no canonical temporal basis is established");
  if (compareTime(now, b.delivery_boundary_at) !== -1)
    return refuse(
      "NOT_ADMISSIBLE",
      "the service's delivery boundary has passed: a stale cutoff admits nothing",
    );
  const slotKey = logisticsServiceSlotKey(basisId);
  const slot = readAs(src, slotKey, LogisticsServiceSlotSchema);
  if (src.getFact(slotKey) && slot?.value.state.status !== "FREE")
    return refuse(
      "NOT_ADMISSIBLE",
      "the service's one whole-cargo slot is held: contested capacity admits nothing",
      {
        key: slotKey,
      },
    );
  const worldId = r.origin_ref.world.entity_id;
  const entityId = r.moved_object_or_quantity_ref.entity_id;
  const entityFact = src.getFact(r.moved_object_or_quantity_ref.fact_key);
  const entity = entityFact ? parsePhysicalSubject(entityFact.value) : undefined;
  const commitmentKey = logisticsCommitmentKey(worldId, entityId);
  const transferKey = logisticsTransferKey(worldId, entityId);
  const transitionKey = worldEntityTransitionKey(worldId, entityId);
  const prior = readAs(src, commitmentKey, LogisticsCommitmentSchema);
  const locus = resolveEntityLocus(src, worldId, entityId);
  if (
    !entityFact ||
    !entity ||
    !locus ||
    locus.phase !== "STATIONARY_AT_ORIGIN" ||
    src.getFact(transferKey) ||
    src.getFact(transitionKey) ||
    (src.getFact(commitmentKey) && prior?.value.state.status !== "RELEASED_UNUSED")
  )
    return refuse(
      "NOT_ADMISSIBLE",
      "the cargo is not stationary and unengaged at its origin: the entity's one movement slot is occupied or spent",
      { key: commitmentKey },
    );
  const base = deriveCommitment({
    request: {
      key: request.value.fact.key,
      owner: request.value.fact.owner,
      version: request.value.fact.version,
      value: movementRequestOfFreight(r),
    },
    entity: { key: entityFact.key, version: entityFact.version, value: entity },
    transitioned: false,
    now,
    delivery_at: b.delivery_boundary_at,
    corridor: {
      key: corridor.fact.key,
      owner: corridor.fact.owner,
      version: corridor.fact.version,
      value: corridor.value,
    },
  });
  if (!base.ok) return refuse("NOT_ADMISSIBLE", base.error.message);
  const commitment = LogisticsCommitmentSchema.safeParse({
    ...base.value,
    freight: {
      request_class: FREIGHT_PROFILE,
      directive_use_id: r.directive_use_id,
      service: { basis: pinOf(basis.fact), slot: { fact_key: slotKey } },
      cargo: { material_class: r.material_handling.material_class, quantity: r.quantity },
      economy_status: status.value.witness,
      unused_release_condition: "BEFORE_DISPATCH_ONLY_WITH_TRANSFER_RECORD_GUARDED_ABSENT",
    },
  } satisfies LogisticsCommitment);
  if (!commitment.success)
    return refuse("NOT_ADMISSIBLE", "the result is not a representable freight commitment");
  const held = LogisticsServiceSlotSchema.parse({
    basis: { fact_key: basisKey, basis_id: basisId },
    state: { status: "HELD", commitment: { fact_key: commitmentKey, request_id: requestRef } },
  } satisfies LogisticsServiceSlot);
  return planned(
    [
      { key: commitmentKey, value: commitment.data, expected_version: prior?.fact.version ?? 0 },
      { key: slotKey, value: held, expected_version: slot?.fact.version ?? 0 },
    ],
    [
      request.value.fact.key,
      basisKey,
      corridor.fact.key,
      entityFact.key,
      transferKey,
      transitionKey,
      TEMPORAL_STATE_KEY,
      ...status.value.reads,
    ],
  );
}

// ---------------------------------------------------------------------------------------------
// F2 — unused release of an existing L0
// ---------------------------------------------------------------------------------------------

/**
 * F2 (R2-D18 §4 step 7, §5; EL-01F; CT-2(b), CT-4; grounded by the WS-010 release act §§3.2, 4.3, 9, 10.4): Logistics alone
 * commits the UNUSED release of its own existing Movement-Service Commitment — as one immutable release event, the commitment
 * advanced to RELEASED_UNUSED and the service slot freed, atomically — only when:
 *
 *  - Economy has ALREADY admitted its protective withdrawal-pending state for this exact request (read and guarded here);
 *  - this request's commitment is still COMMITTED; and
 *  - NO Transfer Record exists, guarded at version zero IN THIS COMMIT, so a concurrent first dispatch (which creates that
 *    key and pins this commitment's version) and this release cannot both win.
 *
 * It is not delivery and is never the after-destination release. Economy's terminal close then consumes this event.
 */
export function deriveUnusedRelease(src: FreightSource, requestRef: string): Planned {
  const request = sealedRequest(src, requestRef);
  if (!request.ok) return request;
  const r = request.value.value;
  const worldId = r.origin_ref.world.entity_id;
  const entityId = r.moved_object_or_quantity_ref.entity_id;
  const transferKey = logisticsTransferKey(worldId, entityId);
  const service = requestServiceOf(src, worldId, entityId, requestRef);
  if (service.kind === "DISPATCHED_OR_DELIVERED" || src.getFact(transferKey))
    return refuse(
      "NOT_ADMISSIBLE",
      "a first dispatch is committed: a dispatched service is never released unused",
      { key: transferKey },
    );
  if (service.kind !== "COMMITTED" || service.commitment.value.freight === undefined)
    return refuse(
      "NOT_ADMISSIBLE",
      "there is no committed, undispatched service of this request to release",
      {
        service: service.kind,
      },
    );
  const allocationKey = economyFreightAllocationKey(requestRef);
  const allocation = readAs(src, allocationKey, EconomyFreightAllocationSchema);
  if (!allocation || allocation.value.state.status !== "withdrawal-pending")
    return refuse(
      "NOT_ADMISSIBLE",
      "an unused release follows Economy's protective withdrawal-pending admission: Logistics releases nothing on its own motion",
      { status: allocation?.value.state.status ?? "absent" },
    );
  const withdrawal = src.getFact(allocation.value.state.withdrawal.fact_key);
  if (!withdrawal)
    return refuse("PREREQUISITE_MISSING", "the protective admission is not committed");
  const c = service.commitment.value;
  const slotKey = c.freight!.service.slot.fact_key;
  const slot = readAs(src, slotKey, LogisticsServiceSlotSchema);
  if (
    !slot ||
    slot.value.state.status !== "HELD" ||
    slot.value.state.commitment.request_id !== requestRef
  )
    return refuse("SOURCE_REFUSED", "the service slot is not held by this commitment", {
      key: slotKey,
    });
  const now = canonicalNow(src);
  if (!now) return refuse("PREREQUISITE_MISSING", "no canonical temporal basis is established");
  const releaseKey = logisticsUnusedReleaseKey(requestRef);
  const eventId = logisticsUnusedReleaseEventId(requestRef);
  if (src.getFact(releaseKey))
    return refuse("NOT_ADMISSIBLE", "the unused release of this request is committed once", {
      key: releaseKey,
    });
  const event = LogisticsUnusedReleaseSchema.parse({
    event_id: eventId,
    outcome: "F2",
    request: {
      owner: OWNER_ECONOMY,
      fact_key: request.value.fact.key,
      request_id: requestRef,
      version: 1,
    },
    commitment: {
      fact_key: service.commitment.fact.key,
      commitment_id: c.commitment_id,
      version_before: service.commitment.fact.version,
    },
    moved: { fact_key: c.moved.fact_key, entity_id: c.moved.entity_id },
    no_dispatch: "TRANSFER_RECORD_GUARDED_ABSENT_IN_THIS_COMMIT",
    protective_state: {
      owner: OWNER_ECONOMY,
      withdrawal: pinOf(withdrawal),
      allocation: pinOf(allocation.fact),
    },
    service_slot: { fact_key: slotKey },
    released_at: now,
  } satisfies LogisticsUnusedRelease);
  const released = LogisticsCommitmentSchema.parse({
    ...c,
    state: {
      status: "RELEASED_UNUSED",
      released_at: now,
      unused_release: { fact_key: releaseKey, event_id: eventId },
    },
  } satisfies LogisticsCommitment);
  const free = LogisticsServiceSlotSchema.parse({
    basis: slot.value.basis,
    state: { status: "FREE", released_by: { fact_key: releaseKey, event_id: eventId } },
  } satisfies LogisticsServiceSlot);
  return planned(
    [
      { key: releaseKey, value: event, expected_version: 0 },
      {
        key: service.commitment.fact.key,
        value: released,
        expected_version: service.commitment.fact.version,
      },
      { key: slotKey, value: free, expected_version: slot.fact.version },
    ],
    [request.value.fact.key, allocationKey, withdrawal.key, transferKey, TEMPORAL_STATE_KEY],
  );
}

// ---------------------------------------------------------------------------------------------
// L1 / F3 — committed first dispatch and its enrollment receipt
// ---------------------------------------------------------------------------------------------

/**
 * L1 / F3 (R2-D18 §4 step 6; R3-T2 §2 "F3", §4 "L1"): Logistics commits the ORIGINAL first dispatch — the Transfer Record
 * that makes it the entity's one authoritative movement locus — and, in the same group, its enrollment receipt. It is never
 * delivery, destination receipt, availability, ownership or credit. It requires, at this act's own cut and independently of
 * L0: this request's commitment still COMMITTED; Economy's fresh EL-02S status S1 for THIS first-dispatch act (GIP's current
 * force renewed through Economy, the unconsumed one-use ceiling and the live allocation); no Transfer Record and no
 * transition; and the previous first dispatch, if any, already enrolled and consumed (at most one is ever in flight).
 *
 * Every fact S1 relied on is guarded at this commit, so a terminal close, a withdrawal-pending admission or an unused release
 * that wins first defeats the dispatch, and this dispatch's Transfer Record key defeats each of them.
 */
export function deriveFreightDispatch(src: FreightSource, requestRef: string): Planned {
  const request = sealedRequest(src, requestRef);
  if (!request.ok) return request;
  const r = request.value.value;
  const worldId = r.origin_ref.world.entity_id;
  const entityId = r.moved_object_or_quantity_ref.entity_id;
  const transferKey = logisticsTransferKey(worldId, entityId);
  const transitionKey = worldEntityTransitionKey(worldId, entityId);
  const service = requestServiceOf(src, worldId, entityId, requestRef);
  if (service.kind === "DISPATCHED_OR_DELIVERED" || src.getFact(transferKey))
    return refuse("NOT_ADMISSIBLE", "the request's one first dispatch is already committed", {
      key: transferKey,
    });
  if (service.kind !== "COMMITTED" || service.commitment.value.freight === undefined)
    return refuse(
      "NOT_ADMISSIBLE",
      "there is no committed service of this request to dispatch: a released or absent service dispatches nothing",
      { service: service.kind },
    );
  const status = deriveFreightStatus(src, requestRef, "L1/first-dispatch");
  if (!status.ok) return status;
  const now = canonicalNow(src);
  if (!now) return refuse("PREREQUISITE_MISSING", "no canonical temporal basis is established");
  const c = service.commitment.value;
  const base = deriveTransfer({
    commitment: {
      key: service.commitment.fact.key,
      owner: service.commitment.fact.owner,
      version: service.commitment.fact.version,
      value: c,
    },
    transitioned: src.getFact(transitionKey) !== undefined,
    now,
  });
  if (!base.ok) return refuse("NOT_ADMISSIBLE", base.error.message);
  const transfer = LogisticsTransferSchema.safeParse({
    ...base.value,
    freight: {
      request_class: FREIGHT_PROFILE,
      economy_status: status.value.witness,
      dispatched: r.quantity,
    },
  } satisfies LogisticsTransfer);
  if (!transfer.success)
    return refuse("NOT_ADMISSIBLE", "the result is not a representable first dispatch");
  const prior = readDispatchEnrollment({ get: (k) => src.getFact(k) });
  const priorReads: string[] = [];
  if (prior) {
    const objectKey = temporalObjectKey(logisticsObjectId(prior.value.request_id));
    const consumptionKey = economyFreightUseConsumptionKey(prior.value.directive_use_id);
    priorReads.push(objectKey, consumptionKey);
    if (!src.getFact(objectKey) || !src.getFact(consumptionKey))
      return refuse(
        "NOT_ADMISSIBLE",
        "a previous first dispatch is not yet enrolled and consumed: at most one is ever in flight",
        { request_id: prior.value.request_id },
      );
  }
  const receipt = LogisticsFreightDispatchEnrollmentSchema.parse({
    request_id: requestRef,
    transfer: { fact_key: transferKey, transfer_id: transfer.data.transfer_id },
    directive_use_id: r.directive_use_id,
    delivery: { boundary_id: logisticsBoundaryId(requestRef), at: c.delivery.at },
    dispatched_at: now,
  } satisfies LogisticsFreightDispatchEnrollment);
  return planned(
    [
      { key: transferKey, value: transfer.data, expected_version: 0 },
      {
        key: LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY,
        value: receipt,
        expected_version: prior?.fact.version ?? 0,
      },
    ],
    [
      request.value.fact.key,
      service.commitment.fact.key,
      transitionKey,
      TEMPORAL_STATE_KEY,
      ...priorReads,
      ...status.value.reads,
    ],
  );
}

// ---------------------------------------------------------------------------------------------
// Foundation F — the read-only verifier, and the derived (never positive) service resolution
// ---------------------------------------------------------------------------------------------

export type FreightVerification =
  | {
      readonly verdict: "VERIFIED_LIVE_REQUEST_NO_SERVICE";
      readonly request_ref: string;
      readonly economy_status: EconomyStatusWitness;
      /** the request-bound Logistics keys the verifier read, at the versions read (zero = absent) */
      readonly logistics_keys: readonly { readonly fact_key: string; readonly version: number }[];
    }
  | {
      readonly verdict: "REFUSED";
      readonly request_ref: string;
      readonly reason: string;
      readonly details?: Record<string, unknown>;
    };

/**
 * Foundation F's restricted READ-ONLY verifier (R2-D18 §4 step 5, §6 "F exit qualification"): it checks the registered
 * Economy request, its live slots and Economy's owner-rederived current legal / physical / economic status, and reads the
 * request-bound Logistics keys. It is a pure read: it creates no commitment, no transfer and no other fact, so it can never
 * create a service. A terminal, withdrawn, mismatched or unresolved request is refused; a missing receipt is never a negative.
 */
export function verifyFreightRequest(src: FreightSource, requestRef: string): FreightVerification {
  const refusedAs = (reason: string, details?: Record<string, unknown>): FreightVerification => ({
    verdict: "REFUSED",
    request_ref: requestRef,
    reason,
    ...(details ? { details } : {}),
  });
  const request = sealedRequest(src, requestRef);
  if (!request.ok) return refusedAs(request.error.message, request.error.details);
  const r = request.value.value;
  const status = deriveFreightStatus(src, requestRef, "L0/service-admission");
  if (!status.ok) return refusedAs(status.error.message, status.error.details);
  const worldId = r.origin_ref.world.entity_id;
  const entityId = r.moved_object_or_quantity_ref.entity_id;
  const commitmentKey = logisticsCommitmentKey(worldId, entityId);
  const transferKey = logisticsTransferKey(worldId, entityId);
  const service = requestServiceOf(src, worldId, entityId, requestRef);
  if (service.kind !== "NONE" || src.getFact(transferKey))
    return refusedAs("a Logistics service or transfer exists for this request or is unreadable", {
      service: service.kind,
    });
  return {
    verdict: "VERIFIED_LIVE_REQUEST_NO_SERVICE",
    request_ref: requestRef,
    economy_status: status.value.witness,
    logistics_keys: [
      { fact_key: commitmentKey, version: service.commitmentVersion },
      { fact_key: transferKey, version: 0 },
    ],
  };
}

/** CT-1's three classes of a non-commit that are NOT F1: each leaves the request pending and its claims protected. */
export type NonF1Class =
  | "CURRENT_SHORTFALL_BLOCKAGE_OR_DELAY"
  | "MISSING_UPSTREAM_FACT_OR_UNKNOWN_OWNER_RESPONSE"
  | "ACT_LEVEL_NON_COMMIT";

export interface ServiceResolution {
  readonly request_ref: string;
  readonly outcome: "ADMISSIBLE" | "NOT_ADMITTED";
  readonly non_f1_class: NonF1Class | null;
  readonly reason: string;
  /**
   * A positive definitive F1 terminal refusal is SOURCE-UNRESOLVED (R3-T23 B1-C; CT-1): no existing lawful source rule makes
   * any resolution here definitive for the exact request, so none is ever derived. This is a constant, not a computed value.
   */
  readonly f1_positive: "WITHHELD_SOURCE_UNRESOLVED";
  /** what this derived answer licenses: nothing — it admits no withdrawal, closes nothing and releases nothing */
  readonly effect: "NONE_REQUEST_STAYS_PENDING_AND_PROTECTED";
}

/**
 * Logistics' derived, non-authoritative, request-attached service-resolution outcome for one exact request and one service
 * basis at this cut (WS-010 §§3.1, 3.7, 5). A read: it writes nothing, is no Logistics state, key, record or receipt, and is
 * never proof that no commitment or Transfer Record exists. A GM may narrate it; it creates no engine-owned fact.
 */
export function deriveServiceResolution(
  src: FreightSource,
  requestRef: string,
  basisId: string,
): ServiceResolution {
  const plan = deriveFreightCommitment(src, requestRef, basisId);
  const common = {
    request_ref: requestRef,
    f1_positive: "WITHHELD_SOURCE_UNRESOLVED",
    effect: "NONE_REQUEST_STAYS_PENDING_AND_PROTECTED",
  } as const;
  if (plan.ok)
    return {
      ...common,
      outcome: "ADMISSIBLE",
      non_f1_class: null,
      reason: "the service can admit this request",
    };
  const { code, message, details } = plan.error;
  const non_f1_class: NonF1Class =
    details?.["act_level_non_commit"] === true
      ? "ACT_LEVEL_NON_COMMIT"
      : code === "PREREQUISITE_MISSING" || code === "WITHHELD" || code === "SOURCE_REFUSED"
        ? "MISSING_UPSTREAM_FACT_OR_UNKNOWN_OWNER_RESPONSE"
        : "CURRENT_SHORTFALL_BLOCKAGE_OR_DELAY";
  return { ...common, outcome: "NOT_ADMITTED", non_f1_class, reason: message };
}

// ---------------------------------------------------------------------------------------------
// IM-11 admission
// ---------------------------------------------------------------------------------------------

const kindOf = (key: string): string | undefined => resolveKey(key)?.kind.id;
const FREIGHT_LOGISTICS_KINDS = new Set([
  "logistics_service_basis",
  "logistics_service_slot",
  "logistics_unused_release",
  "logistics_freight_dispatch_enrollment",
]);
export const writesLogisticsFreightKind = (group: CommitGroup): boolean =>
  group.writes.some((w) => FREIGHT_LOGISTICS_KINDS.has(kindOf(w.key) ?? ""));

/** The service-basis identity a committed basis key names. */
const basisIdOfKey = (key: string): string | undefined => {
  const resolved = resolveKey(key);
  return resolved?.kind.id === "logistics_service_basis" ? resolved.ids[0] : undefined;
};

/**
 * Logistics' first-profile state changes only by the four re-derived acts above (raw `store.commit` included): a service
 * slot, an unused-release event or an enrollment receipt is never written on its own, and a freight commitment or Transfer
 * Record is never written without the act that determines it.
 */
export function logisticsFreightGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  const src = stateSource(state);
  const one = (id: string) => {
    const found = group.writes.filter((w) => kindOf(w.key) === id);
    return found.length === 1 ? found[0] : undefined;
  };
  const basis = one("logistics_service_basis");
  if (basis && group.writes.length === 1) {
    const b = LogisticsServiceBasisSchema.parse(basis.value);
    return checkPlan(
      group,
      state,
      deriveServiceBasis(src, b.origin.world.entity_id, b.original.slice_id),
    );
  }
  const commitment = one("logistics_commitment");
  const slot = one("logistics_service_slot");
  const release = one("logistics_unused_release");
  if (release && commitment && slot && group.writes.length === 3) {
    const e = LogisticsUnusedReleaseSchema.parse(release.value);
    return checkPlan(group, state, deriveUnusedRelease(src, e.request.request_id));
  }
  if (commitment && slot && group.writes.length === 2) {
    const c = LogisticsCommitmentSchema.parse(commitment.value);
    const basisId = c.freight ? basisIdOfKey(c.freight.service.basis.fact_key) : undefined;
    if (!c.freight || !basisId)
      return reject(
        "VALUE_INVALID",
        "a service slot is held only by a first-profile freight commitment",
      );
    return checkPlan(group, state, deriveFreightCommitment(src, c.request.request_id, basisId));
  }
  const transfer = one("logistics_transfer");
  if (transfer && one("logistics_freight_dispatch_enrollment") && group.writes.length === 2) {
    const t = LogisticsTransferSchema.parse(transfer.value);
    return checkPlan(group, state, deriveFreightDispatch(src, t.request.request_id));
  }
  return reject(
    "VALUE_INVALID",
    "Logistics' first-profile freight state changes only by service-basis admission, service admission, unused release or first dispatch",
  );
}

// ---------------------------------------------------------------------------------------------
// Authored operations (archivist path)
// ---------------------------------------------------------------------------------------------

const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, {
    issues: e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
  });
const refusedPlan = (r: {
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
 * IM-05 Logistics — the authored path of the first freight profile. A caller names the fixed Economy request (and, for a
 * service admission, the service basis) and nothing else: no status, verdict, boundary, quantity or outcome. There is no
 * refusal writer, no delivery writer and no slot or receipt setter; delivery and retirement remain the IM-02 stages.
 */
export class LogisticsFreightAdapter {
  readonly #store: CampaignStore;
  constructor(store: CampaignStore) {
    this.#store = store;
  }

  async #publish(
    p: Publication,
    sameAct: (prior: CommitGroup) => boolean,
    derive: (src: FreightSource) => Planned,
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const prior = committedAct(this.#store, p, sameAct);
    if (!prior.ok) return prior;
    if (prior.value) return this.#store.commit(prior.value);
    const plan = derive(storeSource(this.#store));
    if (!plan.ok) return refusedPlan(plan);
    return publishPlan(
      this.#store,
      p,
      OWNER_LOGISTICS,
      FACET_LOGISTICS_STATE,
      FREIGHT_LOGISTICS_RULE,
      plan.value,
    );
  }

  /** Admits the Non-Agentive Service Basis from its own sealed slice. */
  async admitServiceBasis(
    input: Publication & { readonly service: unknown },
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = AdmitServiceBasisInputSchema.safeParse(input.service);
    if (!i.success) return invalid("service", i.error);
    return this.#publish(
      p.data,
      (g) =>
        g.writes.some((w) => {
          const b = LogisticsServiceBasisSchema.safeParse(w.value);
          return (
            b.success &&
            b.data.origin.world.entity_id === i.data.world_id &&
            b.data.original.slice_id === i.data.slice_id
          );
        }),
      (src) => deriveServiceBasis(src, i.data.world_id, i.data.slice_id),
    );
  }

  /** L0: admits the service for one fixed request against one independently admitted service basis. */
  async admitService(
    input: Publication & { readonly admission: unknown },
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = AdmitFreightServiceInputSchema.safeParse(input.admission);
    if (!i.success) return invalid("admission", i.error);
    const basisKey = logisticsServiceBasisKey(i.data.basis_id);
    return this.#publish(
      p.data,
      (g) =>
        g.writes.some((w) => {
          const c = LogisticsCommitmentSchema.safeParse(w.value);
          return (
            c.success &&
            c.data.state.status === "COMMITTED" &&
            c.data.request.request_id === i.data.request_ref &&
            c.data.freight?.service.basis.fact_key === basisKey
          );
        }),
      (src) => deriveFreightCommitment(src, i.data.request_ref, i.data.basis_id),
    );
  }

  async #request(
    input: Publication & { readonly request: unknown },
    sameAct: (prior: CommitGroup, requestRef: string) => boolean,
    derive: (src: FreightSource, requestRef: string) => Planned,
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = FreightRequestTargetSchema.safeParse(input.request);
    if (!i.success) return invalid("request", i.error);
    return this.#publish(
      p.data,
      (g) => sameAct(g, i.data.request_ref),
      (src) => derive(src, i.data.request_ref),
    );
  }

  /** F2: releases, unused, the committed service of a request Economy has admitted to withdrawal-pending. */
  releaseUnusedService(input: Publication & { readonly request: unknown }) {
    return this.#request(
      input,
      (g, requestRef) =>
        g.writes.some(
          (w) =>
            kindOf(w.key) === "logistics_unused_release" &&
            (w.value as { request?: { request_id?: string } }).request?.request_id === requestRef,
        ),
      deriveUnusedRelease,
    );
  }

  /** L1 / F3: commits the request's one first dispatch. Dispatch is not delivery. */
  dispatchFirst(input: Publication & { readonly request: unknown }) {
    return this.#request(
      input,
      (g, requestRef) =>
        g.writes.some(
          (w) =>
            kindOf(w.key) === "logistics_transfer" &&
            (w.value as { request?: { request_id?: string } }).request?.request_id === requestRef,
        ),
      deriveFreightDispatch,
    );
  }

  // -- reads and derived answers (none scans, none writes) --------------------------------------

  /** Foundation F: the restricted read-only verification of a fixed Economy request. It writes nothing. */
  verifyRequest(requestRef: string): FreightVerification {
    return verifyFreightRequest(storeSource(this.#store), requestRef);
  }
  /** Logistics' derived, non-authoritative service resolution for one request and basis. Never a positive F1; writes nothing. */
  serviceResolution(requestRef: string, basisId: string): ServiceResolution {
    return deriveServiceResolution(storeSource(this.#store), requestRef, basisId);
  }
  serviceBasis(basisId: string): Read<LogisticsServiceBasis> | undefined {
    return readAs(this.#store, logisticsServiceBasisKey(basisId), LogisticsServiceBasisSchema);
  }
  serviceSlot(basisId: string): Read<LogisticsServiceSlot> | undefined {
    return readAs(this.#store, logisticsServiceSlotKey(basisId), LogisticsServiceSlotSchema);
  }
  unusedRelease(requestRef: string): Read<LogisticsUnusedRelease> | undefined {
    return readAs(this.#store, logisticsUnusedReleaseKey(requestRef), LogisticsUnusedReleaseSchema);
  }
  dispatchEnrollment(): Read<LogisticsFreightDispatchEnrollment> | undefined {
    return readDispatchEnrollment({ get: (k) => this.#store.getFact(k) });
  }
}
