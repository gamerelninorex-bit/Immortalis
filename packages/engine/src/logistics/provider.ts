import {
  EntityTransitionCauseSchema,
  EntityTransitionCloseSchema,
  FACET_LOGISTICS_STATE,
  LOGISTICS_OPERATION_ESTABLISH_DELIVERY,
  LOGISTICS_OPERATION_RETIRE_TRANSFER,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  MovementServiceRequestSchema,
  OWNER_LOGISTICS,
  OWNER_WORLD_STATE,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsTransferKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { LOGISTICS_RULE, resolveKey } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { deriveDelivery, deriveRetirement } from "./derive.ts";

/**
 * IM-05 — the two Logistics owner operations (WS-010 §10.4, §23), exposed to the IM-02 coordinator through the
 * owner-adapter seam. Pure and deterministic: identical input, identical writes. They are the first and the third
 * stage of a dispatched transfer's one temporal object; World-State's destination commit is the second.
 *
 * Neither invents anything: no route, duration, capacity, carrier, priority or loss. Each resolves only at the
 * commitment's own declared delivery boundary, never a requested horizon, and each throws StageUnresolvedError
 * (nothing published, nothing credited, dependents wait) when the chain does not support it.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

/** Stage 1: Logistics establishes the delivery-complete result from the committed request it serves. */
export const logisticsDeliveryProvider: StageProvider = {
  owner: OWNER_LOGISTICS,
  facet: FACET_LOGISTICS_STATE,
  operation: LOGISTICS_OPERATION_ESTABLISH_DELIVERY,
  rule: LOGISTICS_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    // the one read: the request, in its source's own key space (no registered key space holds it) — or, for the active PC, the
    // PC-owned request in the PC-state owner's own request slot
    const requests = input.reads.filter((r) => {
      const kind = resolveKey(r.fact.key)?.kind.id;
      return kind === undefined || kind === "pc_movement_request";
    });
    if (input.reads.length !== 1 || requests.length !== 1)
      throw unresolved("SOURCE_ABSENT", "a delivery reads exactly one movement request");
    const requestFact = requests[0]!.fact;
    const request = MovementServiceRequestSchema.safeParse(requestFact.value);
    if (!request.success) throw unresolved("SOURCE_INVALID", "the request violates its contract");
    const key = logisticsDeliveryKey(
      request.data.destination.world.entity_id,
      request.data.subject.entity_id,
    );
    if (input.produces.length !== 1 || input.produces[0] !== key)
      throw unresolved("SOURCE_INVALID", "the delivery does not write its entity's own slot");
    if (input.prior.has(key))
      throw unresolved("SOURCE_INVALID", "the delivery is already established");
    // established and effective AT the declared boundary being resolved (never backdated to the dispatch, never at
    // a requested horizon)
    const derived = deriveDelivery(request.data, input.span.to);
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    EntityTransitionCauseSchema.parse(derived.value);
    return [
      {
        key,
        value: derived.value as never,
        unit: null,
        basis: requestFact.basis,
        secrecy: requestFact.secrecy,
      },
    ];
  },
};

/** Stage 3: Logistics retires the transfer and releases the commitment, after the destination owner's commit. */
export const logisticsRetirementProvider: StageProvider = {
  owner: OWNER_LOGISTICS,
  facet: FACET_LOGISTICS_STATE,
  operation: LOGISTICS_OPERATION_RETIRE_TRANSFER,
  rule: LOGISTICS_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    const readOf = (owner: string, kind: string): OwnerFact => {
      const found = input.reads.filter(
        (r) => r.fact.owner === owner && resolveKey(r.fact.key)?.kind.id === kind,
      );
      if (input.reads.length !== 2 || found.length !== 1)
        throw unresolved("SOURCE_ABSENT", `a retirement reads exactly one ${kind}`);
      return found[0]!.fact;
    };
    const deliveryFact = readOf(OWNER_LOGISTICS, "logistics_delivery");
    const transitionFact = readOf(OWNER_WORLD_STATE, "world_entity_transition");
    const delivery = EntityTransitionCauseSchema.safeParse(deliveryFact.value);
    const transition = EntityTransitionCloseSchema.safeParse(transitionFact.value);
    if (!delivery.success || !transition.success)
      throw unresolved("SOURCE_INVALID", "a source of the retirement is malformed");
    const world = delivery.data.outcome.destination.world.entity_id;
    const entityId = delivery.data.subject.entity_id;
    const commitmentKey = logisticsCommitmentKey(world, entityId);
    const transferKey = logisticsTransferKey(world, entityId);
    if (
      input.produces.length !== 2 ||
      !input.produces.includes(commitmentKey) ||
      !input.produces.includes(transferKey)
    )
      throw unresolved(
        "SOURCE_INVALID",
        "the retirement does not write its own commitment and transfer",
      );
    const commitmentFact = input.prior.get(commitmentKey);
    const transferFact = input.prior.get(transferKey);
    if (!commitmentFact || !transferFact)
      throw unresolved("SOURCE_ABSENT", "a retirement advances a committed, dispatched transfer");
    const commitment = LogisticsCommitmentSchema.safeParse(commitmentFact.value);
    const transfer = LogisticsTransferSchema.safeParse(transferFact.value);
    if (!commitment.success || !transfer.success)
      throw unresolved("SOURCE_INVALID", "the commitment or the transfer violates its contract");
    const derived = deriveRetirement({
      commitment: {
        key: commitmentFact.key,
        owner: commitmentFact.owner,
        version: commitmentFact.version,
        value: commitment.data,
      },
      transfer: {
        key: transferFact.key,
        owner: transferFact.owner,
        version: transferFact.version,
        value: transfer.data,
      },
      delivery: {
        key: deliveryFact.key,
        owner: deliveryFact.owner,
        version: deliveryFact.version,
        value: delivery.data,
      },
      transition: {
        key: transitionFact.key,
        owner: transitionFact.owner,
        version: transitionFact.version,
        value: transition.data,
      },
      at: input.span.to,
    });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    const write = (key: string, value: unknown): StageWrite => ({
      key,
      value: value as never,
      unit: null,
      basis: commitmentFact.basis,
      secrecy: commitmentFact.secrecy,
    });
    return [
      write(commitmentKey, derived.value.commitment),
      write(transferKey, derived.value.transfer),
    ];
  },
};
