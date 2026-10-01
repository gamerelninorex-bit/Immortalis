import {
  LOGISTICS_OBJECT_PREFIX,
  LOGISTICS_OPERATION_ESTABLISH_DELIVERY,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  MovementServiceRequestSchema,
  OWNER_LOGISTICS,
  OWNER_WORLD_STATE,
  READ_MODE_NOW,
  logisticsBoundaryId,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsDeliveryStage,
  logisticsObjectId,
  logisticsProcessId,
  logisticsRetirementStage,
  logisticsTransferKey,
  worldEntityTransitionKey,
  type DependencyDeclaration,
  type LogisticsCommitment,
  type LogisticsTransfer,
  type SourceFactRef,
  type TemporalObject,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { entityTransitionDeclaration } from "../world/entity-transition.ts";
import { deliveryOfCommitment } from "./derive.ts";

/**
 * Builders for the Logistics side of the temporal declaration (RC-10 "dependency declarations"; WS-010 §20; F-017
 * §23 completion edge pair). One dispatched transfer is ONE temporal object with ONE earned boundary (its
 * explicitly declared delivery boundary) and three declared stages, in the order WS-010 §10.4 / §23 name:
 *
 *   1. Logistics establishes the delivery-complete result (reads the request it was committed for);
 *   2. World-State commits the destination — the existing ECT-01 / Entity Transition Close stage, which reads
 *      that result AS-OF-NOW and writes the entity's one transition;
 *   3. Logistics retires the transfer and releases the commitment — reads the delivery result and the committed
 *      transition AS-OF-NOW, so it is a dependent of the destination commit and cannot precede it.
 *
 * The three are a NOW chain over three distinct produced facts: Logistics' completion → the destination owner's
 * commit → Logistics' retirement is a lawful ORDER, never an instantaneous cycle. No second object, boundary,
 * scheduler, tick or polling path exists: the chain resolves only when the coordinator resolves the one engaged
 * boundary. A pure function of the commitment and the dispatched transfer, so registration admission can demand
 * exactly this object (a hand-written object cannot smuggle a different stage, read, boundary or recurrence).
 */

const now = (source: SourceFactRef) => ({
  mode: READ_MODE_NOW as typeof READ_MODE_NOW,
  source,
  invalidators: [{ fact_key: source.fact_key }],
});

/** Stage 1: Logistics establishes the delivery-complete result. */
export function logisticsDeliveryDeclaration(c: LogisticsCommitment): DependencyDeclaration {
  const world = c.origin.world.entity_id;
  return {
    stage: logisticsDeliveryStage(c.request.request_id),
    reads: [now({ owner: c.request.owner, fact_key: c.request.fact_key })],
    produces: [logisticsDeliveryKey(world, c.moved.entity_id)],
    declares_close: null,
  };
}

/** Stage 3: Logistics retires the transfer and releases the commitment, only after the destination commit. */
export function logisticsRetirementDeclaration(c: LogisticsCommitment): DependencyDeclaration {
  const world = c.origin.world.entity_id;
  const entityId = c.moved.entity_id;
  return {
    stage: logisticsRetirementStage(c.request.request_id),
    reads: [
      now({ owner: OWNER_LOGISTICS, fact_key: logisticsDeliveryKey(world, entityId) }),
      now({ owner: OWNER_WORLD_STATE, fact_key: worldEntityTransitionKey(world, entityId) }),
    ],
    produces: [logisticsCommitmentKey(world, entityId), logisticsTransferKey(world, entityId)],
    declares_close: null,
  };
}

export function logisticsTemporalObject(
  c: LogisticsCommitment,
  t: LogisticsTransfer,
): TemporalObject {
  const rid = c.request.request_id;
  const delivery = deliveryOfCommitment(c);
  if (!delivery.ok) throw new Error(delivery.error.message);
  const deliveryKey = logisticsDeliveryKey(c.origin.world.entity_id, c.moved.entity_id);
  const first = logisticsDeliveryDeclaration(c);
  const second = entityTransitionDeclaration({
    key: deliveryKey,
    owner: OWNER_LOGISTICS,
    value: delivery.value,
  });
  const third = logisticsRetirementDeclaration(c);
  return {
    object_id: logisticsObjectId(rid),
    owning_ref: { owner: OWNER_LOGISTICS, process_id: logisticsProcessId(rid) },
    last_resolved_basis: t.dispatched_at,
    partition: { class: "EXACT-PARTITION" },
    next_boundary: { boundary_id: logisticsBoundaryId(rid), at: c.delivery.at },
    dependencies: [first, second, third],
    continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
    // the facts the object's work depends on that no engaged stage of it produces
    invalidators: [...first.reads, ...second.reads]
      .filter((r) => r.source.fact_key !== deliveryKey)
      .map((r) => ({ fact_key: r.source.fact_key })),
    information_latency: { creates_epistemic_interruption: false },
  };
}

/**
 * RC-10: a Logistics transfer's temporal object is exactly the one derived from its committed commitment and
 * dispatched transfer (one earned boundary: the declared delivery boundary; its three stages; EXACT-PARTITION; no
 * recurrence). Applies to every object that names Logistics as its owner or declares a Logistics stage, so a
 * hand-written object cannot smuggle a different boundary, read, stage or owner. `registered` is the
 * registration-time form (the transfer must be in transfer, the commitment still committed); the load-time form
 * allows the resolved basis and retired boundary an object legitimately has after its transaction.
 */
export function logisticsObjectViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
  registered: boolean,
): string | null {
  const concerned =
    o.owning_ref.owner === OWNER_LOGISTICS ||
    o.dependencies.some((d) => d.stage.owner_operation.owner === OWNER_LOGISTICS);
  if (!concerned) return null;
  if (!o.object_id.startsWith(LOGISTICS_OBJECT_PREFIX)) {
    return "a Logistics temporal object has the identity derived from its request";
  }
  const requestId = o.object_id.slice(LOGISTICS_OBJECT_PREFIX.length);
  const first = o.dependencies.find(
    (d) =>
      d.stage.owner_operation.owner === OWNER_LOGISTICS &&
      d.stage.owner_operation.operation === LOGISTICS_OPERATION_ESTABLISH_DELIVERY,
  );
  const requestRead = first?.reads[0];
  const requestFact = requestRead ? state.facts.get(requestRead.source.fact_key) : undefined;
  const request = requestFact
    ? MovementServiceRequestSchema.safeParse(requestFact.value)
    : undefined;
  if (!requestFact || !request?.success || request.data.request_id !== requestId) {
    return "a Logistics temporal object names a committed request that fixes it";
  }
  const world = request.data.destination.world.entity_id;
  const entityId = request.data.subject.entity_id;
  const commitmentFact = state.facts.get(logisticsCommitmentKey(world, entityId));
  const transferFact = state.facts.get(logisticsTransferKey(world, entityId));
  const commitment = commitmentFact
    ? LogisticsCommitmentSchema.safeParse(commitmentFact.value)
    : undefined;
  const transfer = transferFact ? LogisticsTransferSchema.safeParse(transferFact.value) : undefined;
  if (
    !commitment?.success ||
    !transfer?.success ||
    commitment.data.request.request_id !== requestId
  ) {
    return "only a committed and dispatched transfer earns a delivery boundary";
  }
  if (
    registered &&
    (transfer.data.state.status !== "IN_TRANSFER" || commitment.data.state.status !== "COMMITTED")
  ) {
    return "only a transfer still in transfer, backed by a committed commitment, earns a delivery boundary";
  }
  const expected = logisticsTemporalObject(commitment.data, transfer.data);
  const loose = (x: TemporalObject) => ({ ...x, last_resolved_basis: null, next_boundary: null });
  if (!canonicalEqual(loose(o), loose(expected))) {
    return "a Logistics temporal object is exactly the object derived from its commitment and transfer";
  }
  if (registered) {
    if (
      !canonicalEqual(o.next_boundary, expected.next_boundary) ||
      !canonicalEqual(o.last_resolved_basis, expected.last_resolved_basis)
    )
      return "a Logistics temporal object earns exactly the commitment's declared delivery boundary";
  } else if (o.next_boundary !== null && !canonicalEqual(o.next_boundary, expected.next_boundary)) {
    return "a Logistics temporal object's boundary is the commitment's declared delivery boundary";
  }
  return null;
}
