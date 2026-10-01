import {
  EconomyRealizationSchema,
  OWNER_ECONOMY,
  OWNER_WORLD_STATE,
  economyDemandKey,
  economyRealizationStage,
  economyRequestKey,
  fail,
  ok,
  productionCompletionKey,
  productionOperationKey,
  compareTime,
  type CanonicalTime,
  type DurableCompletionEnvelope,
  type EconomyDemandEnvelope,
  type EconomyRealization,
  type FallbackPhysicalEntity,
  type ProductionOperation,
  type ProductionRequest,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { deriveAcceptedEntity } from "../world/fallback-custody.ts";

/**
 * Pure derivations of the Economy side of the Demand → Production Request → Realized Access chain (WS-004 §8,
 * §20, §21, §27.1, §27.2, §27.14). Each is the single statement of its rule: the owner operation computes with
 * it and IM-11 admission and load-time verification re-derive with it, so a committed Economy fact is exactly
 * what the committed upstream facts determine and nothing else.
 *
 * They invent nothing: no price, no purchasing capability, no entitlement, no preference weight, no rate, no
 * substitution and no partial satisfaction. A demand is satisfied exactly, by the one physical result the
 * custodian accepted for the one request that demand allocated to, or not at all.
 */

/** The Production Request a demand allocates to: exactly the demanded output, at the demand's own locality. */
export function deriveEconomyRequest(demand: EconomyDemandEnvelope): ProductionRequest {
  return {
    request_id: demand.allocation.request.request_id,
    source: { owner: OWNER_ECONOMY, cause_ref: economyDemandKey(demand.demand_envelope_id) },
    requested_output: {
      output_class: demand.demand_entry.output_class,
      quantity: demand.demand_entry.quantity,
    },
    scope: demand.material_scope,
    /** no priority or authority basis exists: the demand is not a winner over anything */
    priority_authority_ref: null,
  };
}

/** A committed fact read by identity: its key, the version it was read at and its typed value. */
export interface Pinned<T> {
  readonly key: string;
  readonly version: number;
  readonly value: T;
}

export interface RealizationPrior {
  readonly demand: Pinned<EconomyDemandEnvelope>;
  readonly request: Pinned<ProductionRequest>;
  readonly operation: Pinned<ProductionOperation>;
  readonly completion: Pinned<DurableCompletionEnvelope>;
  /** the World-State custodian's accepted entity: realized access exists only because this exists */
  readonly entity: Pinned<FallbackPhysicalEntity>;
  /** the instant the stage resolved at */
  readonly at: CanonicalTime;
}

/**
 * Realized access (WS-004 §8 step 6; §27.2 "realized output AS-OF-NOW only after Production establishes it"):
 * the consequence of a demand whose physical result the World-State custodian has accepted. It is refused unless
 * the whole chain holds — the request is what the demand allocated, the operation is the one that request fixed
 * and is completed, the entity is exactly what the completion's acceptance derives (the SAME conserved
 * reference, accepted once) and is exactly the demanded good and quantity at the demanded locality. Production
 * completion alone is therefore never enough: without the custodian's acceptance there is no entity to read.
 */
export function deriveRealization(
  p: RealizationPrior,
): Result<EconomyRealization, "NOT_REALIZABLE"> {
  const { demand, request, operation, completion, entity } = p;
  const refuse = (message: string) => fail("NOT_REALIZABLE", message);
  const d = demand.value;
  const op = operation.value;
  const opId = op.operation_id;

  if (demand.key !== economyDemandKey(d.demand_envelope_id))
    return refuse("the demand is not at its own key");
  if (
    request.key !== economyRequestKey(d.allocation.request.request_id) ||
    request.key !== d.allocation.request.fact_key ||
    !canonicalEqual(request.value, deriveEconomyRequest(d))
  )
    return refuse("the request is not the one this demand allocated to");
  if (
    operation.key !== productionOperationKey(opId) ||
    opId !== request.value.request_id ||
    !canonicalEqual(op.request, {
      owner: OWNER_ECONOMY,
      fact_key: request.key,
      request_id: request.value.request_id,
      version: request.version,
    })
  )
    return refuse("the operation is not the one this request fixed");
  if (op.status.state !== "COMPLETED") return refuse("the operation is not completed");
  if (
    completion.key !== productionCompletionKey(opId) ||
    completion.value.operation_id !== opId ||
    completion.value.conserved_reference !== op.transformation.output.reference
  )
    return refuse("the completion is not this operation's Durable Completion Envelope");
  if (
    entity.version !== 1 ||
    entity.key !== completion.value.destination_custodian.entity_fact_key ||
    !canonicalEqual(entity.value, deriveAcceptedEntity(completion.value, completion.version))
  )
    return refuse(
      "the custodian has not accepted this completion's conserved reference: completion alone is not satisfaction",
    );
  if (
    !canonicalEqual(
      { output_class: entity.value.entity_class, quantity: entity.value.quantity },
      d.demand_entry,
    ) ||
    !canonicalEqual(entity.value.locality, d.material_scope)
  )
    return refuse("the accepted entity is not exactly the demanded good, quantity and locality");
  if (compareTime(p.at, op.timing.completion.at) !== 0)
    return refuse("realized access is recorded at the operation's own declared boundary instant");

  const value = EconomyRealizationSchema.safeParse({
    demand_envelope_id: d.demand_envelope_id,
    demand: { fact_key: demand.key, version: demand.version },
    request: {
      fact_key: request.key,
      request_id: request.value.request_id,
      version: request.version,
    },
    production: {
      operation: { fact_key: operation.key, operation_id: opId, version: operation.version },
      completion: { fact_key: completion.key, version: completion.version },
    },
    delivery_result: {
      owner: OWNER_WORLD_STATE,
      fact_key: entity.key,
      entity_id: entity.value.entity_id,
      version: entity.version,
    },
    realized_access: {
      basis: "CUSTODIAN_ACCEPTED_SAME_CONSERVED_REFERENCE",
      output_class: entity.value.entity_class,
      quantity: entity.value.quantity,
      physical_custody: "REMAINS_WITH_WORLD_STATE_FALLBACK_CUSTODIAN",
    },
    realized_at: p.at,
    close_stage: economyRealizationStage(opId),
  });
  if (!value.success) return refuse("the result is not a representable realized access");
  return ok(value.data);
}
