import {
  EntityTransitionCauseSchema,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  OWNER_LOGISTICS,
  OWNER_PC_EXISTENCE,
  OWNER_WORLD_STATE,
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  compareTime,
  entityTransitionId,
  fail,
  logisticsBoundaryId,
  logisticsCommitmentId,
  logisticsCommitmentKey,
  logisticsDeliveryId,
  logisticsDeliveryKey,
  logisticsRetirementStage,
  logisticsTransferId,
  logisticsTransferKey,
  ok,
  pcMovementRequestKey,
  worldCorridorKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  type CanonicalTime,
  type EntityTransitionCause,
  type EntityTransitionClose,
  type LogisticsCommitment,
  type LogisticsTransfer,
  type MovementServiceRequest,
  type Result,
  type WorldCorridor,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { physicalSubjectOf, type PhysicalSubjectValue } from "../world/physical-subject.ts";

/**
 * Pure derivations of the Logistics side of the single-leg transfer (WS-010 §3.2, §3.4, §9, §10.1, §10.4, §23).
 * Each is the single statement of its rule: the owner operations compute with it and IM-11 admission and
 * load-time verification re-derive with it, so a committed Logistics fact is exactly what the committed upstream
 * facts determine and nothing else.
 *
 * They invent nothing: no route, path, carrier, capacity, rate, priority, duration or loss. The delivery boundary
 * is an explicitly declared input. The moved entity's identity, quantity and condition are neither input nor
 * output: Logistics references the entity and never copies it.
 */

/** A committed fact read by identity: its key, the owner that wrote it, the version it was read at and its value. */
export interface LogisticsFact<T> {
  readonly key: string;
  readonly owner: string;
  readonly version: number;
  readonly value: T;
}

const SUBSTANTIVE_OWNER = {
  owner: OWNER_WORLD_STATE,
  facet: FACET_WORLD_FALLBACK_ENTITY,
  basis: FALLBACK_BASIS,
} as const;

/** The world and entity identities of a request or commitment-like subject, by the entity's own key. */
const worldOf = (r: Pick<MovementServiceRequest, "destination">): string =>
  r.destination.world.entity_id;

/**
 * Whether a request is its source's own fact lawfully readable by Logistics: held in the SOURCE owner's own key
 * space — never any registered owner's, so never Logistics' or World-State's — and written by the source it names
 * (WS-010 §3.1: the request is an interface envelope, not Logistics-owned state). Returns a message, or null.
 */
export function requestSourceViolation(
  key: string,
  owner: string,
  request: MovementServiceRequest,
): string | null {
  // The one registered key space a request may live in: the active PC's own Movement Service Request, held by the PC-state owner
  // at its one slot (WS-010 §3.1: the request is with its requester; the frozen Post-Handover contract §10: a voluntary movement
  // request is PC/player-side). It is never Logistics' or World-State's.
  if (resolveKey(key)?.kind.id === "pc_movement_request") {
    if (
      owner !== OWNER_PC_EXISTENCE ||
      request.source.owner !== owner ||
      key !== pcMovementRequestKey(request.subject.entity_id)
    )
      return "a PC-owned movement request is the PC-state owner's own fact at the PC's own request slot";
    return null;
  }
  if (resolveKey(key) !== null || owner === OWNER_LOGISTICS || owner === OWNER_WORLD_STATE)
    return "a movement request is its source's own fact, never Logistics' or another registered owner's";
  if (request.source.owner !== owner) return "a movement request is written by the source it names";
  return null;
}

/**
 * Whether a World-State corridor, read by Logistics on the explicitly source-qualified path, is the one source-owned connection of the
 * movement the request names: World-State's own fact, at the key the ORDERED endpoints derive (so a reverse, wrong-endpoint or
 * wrong-world corridor is a different key and is refused), connecting exactly the entity's current stationary origin locus to the
 * requested destination locus of the same world. It judges topology only: the corridor supplies no duration, access, capability or
 * delivery, and Logistics reads none from it. Returns a message, or null.
 */
export function corridorReadViolation(
  corridor: LogisticsFact<WorldCorridor>,
  origin: MovementServiceRequest["destination"],
  destination: MovementServiceRequest["destination"],
): string | null {
  const c = corridor.value;
  if (corridor.owner !== OWNER_WORLD_STATE)
    return "a corridor is World-State's own topology fact, never another owner's";
  if (
    corridor.key !==
    worldCorridorKey(
      destination.world.entity_id,
      origin.locus.entity_id,
      destination.locus.entity_id,
    )
  )
    return "the corridor connects the entity's origin to the requested destination, in that order, within their world: a reverse, wrong-endpoint or wrong-world corridor is a different connection";
  if (
    c.world.entity_id !== destination.world.entity_id ||
    c.from.fact_key !== origin.locus.fact_key ||
    c.from.entity_id !== origin.locus.entity_id ||
    c.to.fact_key !== destination.locus.fact_key ||
    c.to.entity_id !== destination.locus.entity_id
  )
    return "the corridor's endpoints are the entity's origin and the requested destination";
  return null;
}

export interface CommitmentPrior {
  readonly request: LogisticsFact<MovementServiceRequest>;
  /**
   * the physical subject to be moved: an accepted fallback entity, or (admitted from the lawful PC physical custodian, never a
   * fabricated fallback entity) the active PC's stationary physical-locus custody record
   */
  readonly entity: {
    readonly key: string;
    readonly version: number;
    readonly value: PhysicalSubjectValue;
  };
  /** whether World-State has already committed a transition for the entity (its one slot is spent) */
  readonly transitioned: boolean;
  /** the canonical basis the commitment is established at */
  readonly now: CanonicalTime;
  /** the explicit, declared delivery boundary */
  readonly delivery_at: CanonicalTime;
  /**
   * The World-State corridor read on the explicitly source-qualified path (pinned at the version read), or absent for the route-less
   * foundation commitment, which is unchanged. It is a topological prerequisite only: it never supplies the delivery boundary.
   */
  readonly corridor?: LogisticsFact<WorldCorridor>;
}

/**
 * The Movement-Service Commitment a request and an accepted entity determine (WS-010 §3.2, §4.1): exactly the one
 * single-leg, non-agentive, uncontended movement the request names, for the entity it names, from the stationary
 * locus World-State holds (its accepted locality) to the requested established locus of the same world. Refused
 * unless the request names this very entity, stays within its world, changes the locus materially, the entity has
 * not already transitioned (the one-transition limitation fails closed) and the declared delivery boundary lies
 * after the commitment.
 */
export function deriveCommitment(
  p: CommitmentPrior,
): Result<LogisticsCommitment, "NOT_COMMITTABLE"> {
  const { request, entity } = p;
  const refuse = (message: string) => fail("NOT_COMMITTABLE", message);
  const r = request.value;
  const e = physicalSubjectOf(entity.value);
  const source = requestSourceViolation(request.key, request.owner, r);
  if (source) return refuse(source);
  if (
    entity.key !== e.key ||
    r.subject.fact_key !== entity.key ||
    r.subject.entity_id !== e.entity_id
  )
    return refuse("the request names this accepted entity, by its own key");
  // request ownership and physical-subject ownership stay separate (frozen contract §10): the active PC is moved only by its OWN
  // PC-owned request, and a PC-owned request moves only its own PC
  if (e.kind === "ACTIVE_PC" && request.key !== pcMovementRequestKey(e.entity_id))
    return refuse("the active PC is moved only by its own PC-owned Movement Service Request");
  if (e.kind === "FALLBACK_ENTITY" && request.owner === OWNER_PC_EXISTENCE)
    return refuse("a PC-owned Movement Service Request moves only the PC that owns it");
  const to = r.destination;
  if (
    to.world.fact_key !== worldProfileKey(to.world.entity_id) ||
    to.locus.fact_key !== worldLocusKey(to.world.entity_id, to.locus.entity_id)
  )
    return refuse("destination references do not match their key identities");
  if (to.world.entity_id !== e.locality.world.entity_id)
    return refuse("a single-leg movement stays within the entity's world");
  if (to.locus.entity_id === e.locality.locus.entity_id)
    return refuse("a movement changes the entity's locus");
  if (p.transitioned)
    return refuse(
      "the entity has already changed locus: a later movement needs semantics this tranche does not ratify",
    );
  if (p.corridor !== undefined) {
    // the source-qualified path reads the corridor of the subject's stationary origin and the requested destination. It moves a fallback
    // entity, or the active PC only by its OWN PC-owned request (refused above otherwise): the confirmed post-handover PC's single
    // transfer is the one the ratified Post-Handover contract §§4, 8-16 already authorizes, and the corridor adds topology to it, never
    // a second journey, an original-activation move, a duration or any other permission
    const violation = corridorReadViolation(p.corridor, e.locality, to);
    if (violation) return refuse(violation);
  }
  const rid = r.request_id;
  const value = LogisticsCommitmentSchema.safeParse({
    commitment_id: logisticsCommitmentId(rid),
    request: {
      owner: request.owner,
      fact_key: request.key,
      request_id: rid,
      version: request.version,
    },
    // absent (never `undefined`) for the route-less foundation commitment, whose serialization is unchanged
    ...(p.corridor !== undefined
      ? {
          corridor: {
            owner: OWNER_WORLD_STATE,
            fact_key: p.corridor.key,
            version: p.corridor.version,
          },
        }
      : {}),
    moved: {
      fact_key: entity.key,
      entity_id: e.entity_id,
      version: entity.version,
      substantive_owner: SUBSTANTIVE_OWNER,
    },
    origin: e.locality,
    destination: to,
    service_basis: "NON_AGENTIVE_SINGLE_LEG_UNCONTENDED",
    committed_at: p.now,
    delivery: { boundary_id: logisticsBoundaryId(rid), at: p.delivery_at },
    release_condition: "AFTER_DESTINATION_OWNER_COMMIT",
    state: { status: "COMMITTED" },
  });
  if (!value.success) return refuse("the result is not a representable commitment");
  return ok(value.data);
}

export interface TransferPrior {
  readonly commitment: LogisticsFact<LogisticsCommitment>;
  readonly transitioned: boolean;
  /** the canonical basis the dispatch commits at */
  readonly now: CanonicalTime;
}

/**
 * The Transfer Record a dispatch determines (WS-010 §9, §10.1, §11): from dispatch the transfer is the entity's one
 * authoritative movement locus. Dispatch commits at the canonical basis, after the commitment and strictly before
 * the declared delivery boundary, and is refused for an entity that has already changed locus. It states a movement
 * in progress between two established loci; it never states that the entity is anywhere else.
 */
export function deriveTransfer(p: TransferPrior): Result<LogisticsTransfer, "NOT_DISPATCHABLE"> {
  const { commitment } = p;
  const refuse = (message: string) => fail("NOT_DISPATCHABLE", message);
  const c = commitment.value;
  const world = c.origin.world.entity_id;
  if (commitment.key !== logisticsCommitmentKey(world, c.moved.entity_id))
    return refuse("the commitment is not at its own key");
  if (c.state.status !== "COMMITTED")
    return refuse("only a committed, unreleased commitment dispatches");
  if (p.transitioned)
    return refuse("the entity has already changed locus: nothing remains to dispatch");
  const afterCommit = compareTime(c.committed_at, p.now);
  const beforeDelivery = compareTime(p.now, c.delivery.at);
  if (afterCommit === null || afterCommit === 1 || beforeDelivery !== -1)
    return refuse(
      "a dispatch is at or after the commitment and strictly before the declared delivery boundary",
    );
  const value = LogisticsTransferSchema.safeParse({
    transfer_id: logisticsTransferId(c.request.request_id),
    commitment: {
      fact_key: commitment.key,
      commitment_id: c.commitment_id,
      version: commitment.version,
    },
    request: { request_id: c.request.request_id },
    moved: { fact_key: c.moved.fact_key, entity_id: c.moved.entity_id },
    dispatched_at: p.now,
    state: {
      status: "IN_TRANSFER",
      movement_locus: {
        authority: "LOGISTICS_TRANSFER_RECORD",
        leg: "SINGLE_LEG",
        from: c.origin,
        to: c.destination,
      },
    },
  });
  if (!value.success) return refuse("the result is not a representable transfer");
  return ok(value.data);
}

/** What a delivery-complete result is derived from: a request or a commitment both carry it. */
export interface DeliverySubject {
  readonly request_id: string;
  readonly subject: { readonly fact_key: string; readonly entity_id: string };
  readonly destination: MovementServiceRequest["destination"];
}

/**
 * The delivery-complete result (WS-010 §10.4(1), §23.3): Logistics establishes that the movement completed, with
 * its destination, and names — exactly as the existing causing-result envelope does — that one same-entity locus
 * change is required. It does not assert that the entity IS at the destination: that is the destination owner's
 * own commit (§23.4).
 *
 * Logistics establishes completion when its delivery stage resolves AT the declared delivery boundary, so the result
 * is established at, and takes effect at, that one instant: it is never backdated to the dispatch (dispatch is not
 * delivery, §11). Cause-before-effect is not a timestamp gap; it is the IM-02 stage order inside the engaged
 * boundary — this result's commit precedes World-State's destination commit, which precedes the retirement.
 */
export function deriveDelivery(
  s: DeliverySubject,
  at: CanonicalTime,
): Result<EntityTransitionCause, "NOT_DELIVERABLE"> {
  const refuse = (message: string) => fail("NOT_DELIVERABLE", message);
  const world = worldOf(s);
  if (
    s.subject.fact_key !== worldFallbackEntityKey(world, s.subject.entity_id) &&
    s.subject.fact_key !== worldPcLocusCustodyKey(s.subject.entity_id)
  )
    return refuse("the delivery names its entity by its own key, in the destination's world");
  const value = EntityTransitionCauseSchema.safeParse({
    cause_id: logisticsDeliveryId(s.request_id),
    source: {
      owner: OWNER_LOGISTICS,
      cause_ref: logisticsTransferKey(world, s.subject.entity_id),
    },
    subject: { fact_key: s.subject.fact_key, entity_id: s.subject.entity_id },
    outcome: { kind: "SAME_ENTITY_LOCUS_CHANGE_REQUIRED", destination: s.destination },
    timing: { established_at: at, occurs_at: at },
  });
  if (!value.success) return refuse("the result is not a representable delivery-complete result");
  return ok(value.data);
}

/** The delivery-complete result a commitment determines, established at and effective at the declared boundary. */
export const deliveryOfCommitment = (
  commitment: LogisticsCommitment,
): Result<EntityTransitionCause, "NOT_DELIVERABLE"> =>
  deriveDelivery(
    {
      request_id: commitment.request.request_id,
      subject: { fact_key: commitment.moved.fact_key, entity_id: commitment.moved.entity_id },
      destination: commitment.destination,
    },
    commitment.delivery.at,
  );

export interface RetirementPrior {
  readonly commitment: LogisticsFact<LogisticsCommitment>;
  readonly transfer: LogisticsFact<LogisticsTransfer>;
  readonly delivery: LogisticsFact<EntityTransitionCause>;
  /** World-State's committed destination (ECT-01): retirement exists only because this exists */
  readonly transition: LogisticsFact<EntityTransitionClose>;
  /** the instant the stage resolved at */
  readonly at: CanonicalTime;
}

/**
 * Retirement of the active transfer and release of the commitment (WS-010 §10.4(3), §23.5): the next versions of
 * the commitment and the transfer, derived only when the destination owner has lawfully committed. It is refused
 * unless the whole chain holds — the commitment is still committed and the transfer still in transfer, the
 * delivery-complete result is exactly what they determine, and the ECT-01 transition is World-State's committed
 * consequence of THAT delivery for THAT entity, from the commitment's origin to its destination. Logistics'
 * completion alone is therefore never enough: without the destination commit there is nothing to read.
 */
export function deriveRetirement(
  p: RetirementPrior,
): Result<{ commitment: LogisticsCommitment; transfer: LogisticsTransfer }, "NOT_RETIRABLE"> {
  const { commitment, transfer, delivery, transition } = p;
  const refuse = (message: string) => fail("NOT_RETIRABLE", message);
  const c = commitment.value;
  const t = transfer.value;
  const rid = c.request.request_id;
  const world = c.origin.world.entity_id;
  const entityId = c.moved.entity_id;
  if (
    commitment.key !== logisticsCommitmentKey(world, entityId) ||
    transfer.key !== logisticsTransferKey(world, entityId)
  )
    return refuse("the commitment and the transfer are at their own keys");
  if (c.state.status !== "COMMITTED" || t.state.status !== "IN_TRANSFER")
    return refuse("only a committed commitment and a transfer still in transfer are retired");
  if (
    t.commitment.fact_key !== commitment.key ||
    t.commitment.commitment_id !== c.commitment_id ||
    t.commitment.version !== commitment.version ||
    t.transfer_id !== logisticsTransferId(rid) ||
    t.request.request_id !== rid ||
    t.moved.fact_key !== c.moved.fact_key ||
    t.moved.entity_id !== entityId
  )
    return refuse("the transfer is the one this commitment backs");
  const expectedDelivery = deliveryOfCommitment(c);
  if (
    !expectedDelivery.ok ||
    delivery.version !== 1 ||
    delivery.owner !== OWNER_LOGISTICS ||
    delivery.key !== logisticsDeliveryKey(world, entityId) ||
    !canonicalEqual(delivery.value, expectedDelivery.value)
  )
    return refuse(
      "the delivery-complete result is exactly what the commitment and transfer determine",
    );
  const tr = transition.value;
  if (
    transition.key !== worldEntityTransitionKey(world, entityId) ||
    transition.owner !== OWNER_WORLD_STATE ||
    transition.version !== 1 ||
    tr.transition_id !== entityTransitionId(delivery.value.cause_id) ||
    tr.entity.fact_key !== c.moved.fact_key ||
    tr.entity.entity_id !== entityId ||
    tr.cause.owner !== OWNER_LOGISTICS ||
    tr.cause.fact_key !== delivery.key ||
    tr.cause.version !== delivery.version ||
    tr.cause.cause_id !== delivery.value.cause_id ||
    !canonicalEqual(tr.locus.from, c.origin) ||
    !canonicalEqual(tr.locus.to, c.destination)
  )
    return refuse(
      "the destination owner has not committed this delivery: Logistics completion alone is not destination truth, and cannot retire the transfer",
    );
  if (compareTime(p.at, c.delivery.at) !== 0)
    return refuse("retirement is recorded at the commitment's own declared boundary instant");
  const by_stage = logisticsRetirementStage(rid);
  const destination_commit = { fact_key: transition.key, version: transition.version };
  const nextCommitment = LogisticsCommitmentSchema.safeParse({
    ...c,
    state: { status: "RELEASED", released_at: p.at, destination_commit, by_stage },
  });
  const nextTransfer = LogisticsTransferSchema.safeParse({
    ...t,
    state: {
      status: "RETIRED",
      movement_locus: "CLOSED",
      delivery: { fact_key: delivery.key, version: delivery.version },
      destination_commit,
      retired_at: p.at,
      by_stage,
    },
  });
  if (!nextCommitment.success || !nextTransfer.success)
    return refuse("the result is not a representable retirement");
  return ok({ commitment: nextCommitment.data, transfer: nextTransfer.data });
}
