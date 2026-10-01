import {
  EntityTransitionCauseSchema,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsTransferKey,
  type EntityTransitionCause,
  type LocusRef,
  type LogisticsCommitment,
  type LogisticsTransfer,
  type OwnerFact,
} from "@immortalis/contracts";
import { entityCurrentLocus } from "../world/entity-transition.ts";

/**
 * Where is this entity currently? ONE lawful answer at every stage (WS-010 §10.1, §27: an active moved object may
 * never hold a rival ordinary current location beside a Logistics movement locus). The single rule, three reads by
 * identity and no scan:
 *
 *  1. World-State has committed the entity's destination (its Entity Transition Close exists): the destination is
 *     the one authoritative locus, and World-State is the authority. A Logistics transfer that is not yet retired
 *     is then only awaiting its own retirement stage — its movement locus has LAPSED with the destination commit,
 *     so it is not a second claim (`DESTINATION_COMMITTED_RETIREMENT_PENDING`).
 *  2. Otherwise, while a Logistics transfer is IN_TRANSFER the entity has no stationary locus at all: Logistics'
 *     movement locus is the one authority. This holds across delivery-complete establishment too — Logistics'
 *     arrival is not destination truth.
 *  3. Otherwise (no movement yet, or a commitment not yet dispatched) the stationary locus World-State holds: the
 *     locality the entity was accepted at.
 *
 * The accepted entity is never rewritten: its locality stays the historical origin in every phase.
 */
export type EntityLocusPhase =
  | "STATIONARY_AT_ORIGIN"
  | "IN_TRANSFER"
  | "DESTINATION_COMMITTED_RETIREMENT_PENDING"
  | "DESTINATION_COMMITTED";

export interface ResolvedEntityLocus {
  readonly phase: EntityLocusPhase;
  readonly authority: "WORLD_STATE" | "LOGISTICS";
  /** the one stationary locus, exactly when World-State is the authority */
  readonly stationary: LocusRef | null;
  /** the movement locus (origin → destination), exactly when Logistics is the authority */
  readonly movement: { readonly from: LocusRef; readonly to: LocusRef } | null;
  /** history that stays true: where the entity was accepted */
  readonly origin: LocusRef;
  /** Logistics has established delivery completion (it is not destination truth) */
  readonly delivery_established: boolean;
}

export function resolveEntityLocus(
  source: { getFact(key: string): OwnerFact | undefined },
  worldId: string,
  entityId: string,
): ResolvedEntityLocus | undefined {
  const current = entityCurrentLocus(source, worldId, entityId);
  if (!current) return undefined;
  const transferFact = source.getFact(logisticsTransferKey(worldId, entityId));
  const transfer = transferFact ? LogisticsTransferSchema.parse(transferFact.value) : undefined;
  const deliveryFact = source.getFact(logisticsDeliveryKey(worldId, entityId));
  const delivery_established = deliveryFact !== undefined;
  const origin = current.origin;
  if (current.transition) {
    return {
      phase:
        transfer?.state.status === "IN_TRANSFER"
          ? "DESTINATION_COMMITTED_RETIREMENT_PENDING"
          : "DESTINATION_COMMITTED",
      authority: "WORLD_STATE",
      stationary: current.current,
      movement: null,
      origin,
      delivery_established,
    };
  }
  if (transfer?.state.status === "IN_TRANSFER") {
    return {
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
      stationary: null,
      movement: { from: transfer.state.movement_locus.from, to: transfer.state.movement_locus.to },
      origin,
      delivery_established,
    };
  }
  return {
    phase: "STATIONARY_AT_ORIGIN",
    authority: "WORLD_STATE",
    stationary: current.current,
    movement: null,
    origin,
    delivery_established,
  };
}

/** Typed reads by identity (none scans). */
export const logisticsFactsOf = (
  source: { getFact(key: string): OwnerFact | undefined },
  worldId: string,
  entityId: string,
): {
  readonly commitment: { fact: OwnerFact; value: LogisticsCommitment } | undefined;
  readonly transfer: { fact: OwnerFact; value: LogisticsTransfer } | undefined;
  readonly delivery: { fact: OwnerFact; value: EntityTransitionCause } | undefined;
} => {
  const commitment = source.getFact(logisticsCommitmentKey(worldId, entityId));
  const transfer = source.getFact(logisticsTransferKey(worldId, entityId));
  const delivery = source.getFact(logisticsDeliveryKey(worldId, entityId));
  return {
    commitment: commitment
      ? { fact: commitment, value: LogisticsCommitmentSchema.parse(commitment.value) }
      : undefined,
    transfer: transfer
      ? { fact: transfer, value: LogisticsTransferSchema.parse(transfer.value) }
      : undefined,
    delivery: delivery
      ? { fact: delivery, value: EntityTransitionCauseSchema.parse(delivery.value) }
      : undefined,
  };
};
