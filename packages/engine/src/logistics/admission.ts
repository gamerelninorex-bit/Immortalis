import {
  EntityTransitionCauseSchema,
  EntityTransitionCloseSchema,
  FallbackPhysicalEntitySchema,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  MovementServiceRequestSchema,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  WorldLocusSchema,
  compareTime,
  logisticsBoundaryId,
  logisticsCommitmentId,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsDeliveryStage,
  logisticsObjectId,
  logisticsRetirementStage,
  logisticsTransferKey,
  temporalObjectKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type CanonicalTime,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import {
  deriveCommitment,
  deriveDelivery,
  deriveRetirement,
  deriveTransfer,
  deliveryOfTransfer,
} from "./derive.ts";

/**
 * IM-11 admission for the IM-05 Logistics owner (IM-03 owner resolution; WS-010 §§2, 3, 4.1, 9, 10, 11, 23, 27).
 * Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the owner
 * operations. Key-space exclusivity (nobody but `logistics`/`logistics_state` can write a Logistics key, and
 * Logistics can write no World-State, Production, Economy, Population or kernel key) is enforced by the owner
 * registry before this runs; this enforces that even Logistics itself can change its state only in one of four
 * lawful ways, each RE-DERIVED from committed facts:
 *
 *  1. COMMITMENT: one Movement-Service Commitment for one already-accepted entity that has not changed locus, from
 *     a committed request in its source's own key space (pinned, never copied), at the canonical basis.
 *  2. DISPATCH: the one Transfer Record the commitment determines, at the canonical basis, strictly before the
 *     declared delivery boundary. From it, and only until the destination owner's commit, Logistics is the
 *     entity's sole authoritative movement locus. A dispatch states a movement in progress, never a delivery.
 *  3. DELIVERY-COMPLETE RESULT, only as its IM-02 stage: exactly what the request, commitment and transfer
 *     determine. It names the destination and the one required locus change; it is no destination truth.
 *  4. RETIREMENT, only as its IM-02 stage and only from the committed chain: the delivery result and World-State's
 *     committed ECT-01 transition for it are read at their current versions and the next commitment and transfer
 *     are RE-DERIVED from them. Without the destination owner's commit there is nothing to read, so a transfer can
 *     never be retired early, whoever publishes the group.
 */
export function logisticsGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  const ws = group.writes;
  const of = (id: string) => ws.filter((w) => kindOf(w.key) === id);
  const commitmentW = of("logistics_commitment");
  const transferW = of("logistics_transfer");
  const deliveryW = of("logistics_delivery");

  if (commitmentW.length === 1 && ws.length === 1 && commitmentW[0]!.expected_version === 0)
    return checkCommitment(group, state, commitmentW[0]!);
  if (transferW.length === 1 && ws.length === 1 && transferW[0]!.expected_version === 0)
    return checkDispatch(group, state, transferW[0]!);
  if (deliveryW.length === 1 && ws.length === 1 && deliveryW[0]!.expected_version === 0)
    return checkDelivery(group, state, deliveryW[0]!);
  if (
    commitmentW.length === 1 &&
    transferW.length === 1 &&
    ws.length === 2 &&
    commitmentW[0]!.expected_version > 0 &&
    transferW[0]!.expected_version > 0
  )
    return checkRetirement(group, state, commitmentW[0]!, transferW[0]!);
  return reject(
    "VALUE_INVALID",
    "Logistics state changes only by commitment, dispatch, delivery-complete result or retirement",
  );
}

type Write = CommitGroup["writes"][number];

const bad = (message: string, details?: Record<string, unknown>) =>
  reject("VALUE_INVALID", message, details);
const ref = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

/** The canonical temporal basis, pinned by the group (the group must read it at its current version). */
function pinnedNow(group: CommitGroup, state: CampaignState): CanonicalTime | Rejection {
  const clock = requirePrerequisite(
    group,
    state,
    TEMPORAL_STATE_KEY,
    "the canonical temporal state",
  );
  if (isRejection(clock)) return clock;
  return TemporalStateSchema.parse(clock.fact.value).canonical_time;
}

function checkCommitment(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const c = LogisticsCommitmentSchema.parse(w.value);
  const rid = c.request.request_id;
  const world = c.origin.world.entity_id;
  if (
    w.key !== logisticsCommitmentKey(world, c.moved.entity_id) ||
    c.commitment_id !== logisticsCommitmentId(rid) ||
    c.delivery.boundary_id !== logisticsBoundaryId(rid) ||
    c.moved.fact_key !== worldFallbackEntityKey(world, c.moved.entity_id)
  ) {
    return ref(
      "the commitment is at the key derived from its entity, with identities from its request",
    );
  }
  if (c.state.status !== "COMMITTED")
    return bad("a commitment is established committed, never released");

  // the request: a foreign fact in its SOURCE's own key space, pinned at its current version, never copied
  const requestP = requirePrerequisite(
    group,
    state,
    c.request.fact_key,
    "the Movement Service Request",
  );
  if (isRejection(requestP)) return requestP;
  const request = MovementServiceRequestSchema.safeParse(requestP.fact.value);
  if (
    !request.success ||
    requestP.fact.owner !== c.request.owner ||
    requestP.fact.version !== c.request.version ||
    request.data.request_id !== rid
  ) {
    return ref(
      "the request is its source's own fact, pinned at its current version, and fixes this commitment",
      { key: c.request.fact_key },
    );
  }
  // the moved entity: World-State's accepted fallback entity, pinned (identity, quantity and condition stay there)
  const entityP = requirePrerequisite(group, state, c.moved.fact_key, "the accepted entity");
  if (isRejection(entityP)) return entityP;
  const entity = FallbackPhysicalEntitySchema.safeParse(entityP.fact.value);
  if (!entity.success || entityP.fact.version !== c.moved.version) {
    return ref("the entity is pinned at its current version", { key: c.moved.fact_key });
  }
  // the destination is an established locus of the entity's world: a commitment creates none
  const dest = c.destination;
  const worldP = requirePrerequisite(group, state, dest.world.fact_key, "the world profile");
  if (isRejection(worldP)) return worldP;
  const locusP = requirePrerequisite(group, state, dest.locus.fact_key, "the destination locus");
  if (isRejection(locusP)) return locusP;
  const locus = WorldLocusSchema.safeParse(locusP.fact.value);
  if (
    dest.world.fact_key !== worldProfileKey(dest.world.entity_id) ||
    dest.locus.fact_key !== worldLocusKey(dest.world.entity_id, dest.locus.entity_id) ||
    !locus.success ||
    locus.data.world.entity_id !== dest.world.entity_id
  ) {
    return ref("the destination is an established locus of the entity's world", {
      key: dest.locus.fact_key,
    });
  }
  const now = pinnedNow(group, state);
  if ("code" in now) return now;
  if (compareTime(now, c.committed_at) !== 0)
    return bad("a commitment is established at the canonical temporal basis");

  const derived = deriveCommitment({
    request: {
      key: requestP.fact.key,
      owner: requestP.fact.owner,
      version: requestP.fact.version,
      value: request.data,
    },
    entity: { key: entityP.fact.key, version: entityP.fact.version, value: entity.data },
    transitioned: state.facts.has(worldEntityTransitionKey(world, c.moved.entity_id)),
    now,
    delivery_at: c.delivery.at,
  });
  if (!derived.ok) return bad(derived.error.message, { key: w.key });
  if (!canonicalEqual(derived.value, c)) {
    return bad(
      "a commitment is exactly what the request and the accepted entity determine: one single-leg movement of that entity to that locus",
      { key: w.key },
    );
  }
  return null;
}

function checkDispatch(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const t = LogisticsTransferSchema.parse(w.value);
  const commitmentP = requirePrerequisite(group, state, t.commitment.fact_key, "the commitment");
  if (isRejection(commitmentP)) return commitmentP;
  const commitment = LogisticsCommitmentSchema.safeParse(commitmentP.fact.value);
  if (!commitment.success || commitmentP.fact.version !== t.commitment.version) {
    return ref("the commitment is pinned at its current version", { key: t.commitment.fact_key });
  }
  const c = commitment.data;
  const world = c.origin.world.entity_id;
  if (w.key !== logisticsTransferKey(world, c.moved.entity_id)) {
    return ref("the transfer is at the key derived from its entity", { key: w.key });
  }
  const now = pinnedNow(group, state);
  if ("code" in now) return now;
  if (!state.facts.has(c.moved.fact_key))
    return reject("PREREQUISITE_MISSING", "the moved entity is not committed", {
      key: c.moved.fact_key,
    });
  const derived = deriveTransfer({
    commitment: {
      key: commitmentP.fact.key,
      owner: commitmentP.fact.owner,
      version: commitmentP.fact.version,
      value: c,
    },
    transitioned: state.facts.has(worldEntityTransitionKey(world, c.moved.entity_id)),
    now,
  });
  if (!derived.ok) return bad(derived.error.message, { key: w.key });
  if (!canonicalEqual(derived.value, t)) {
    return bad(
      "a dispatch is exactly what the commitment determines: one transfer in progress, at the canonical basis",
      { key: w.key },
    );
  }
  return null;
}

/** The engaged, unretired, declared boundary a Logistics stage commits at (the object is the engagement). */
function engagedBoundaryViolation(
  state: CampaignState,
  requestId: string,
  boundaryAt: CanonicalTime,
): string | null {
  const obj = state.facts.get(temporalObjectKey(logisticsObjectId(requestId)));
  const clock = state.facts.get(TEMPORAL_STATE_KEY);
  const o = obj ? TemporalObjectSchema.safeParse(obj.value) : undefined;
  const s = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  if (
    !o?.success ||
    !s?.success ||
    !o.data.next_boundary ||
    o.data.next_boundary.boundary_id !== logisticsBoundaryId(requestId) ||
    compareTime(o.data.next_boundary.at, boundaryAt) !== 0 ||
    ![-1, 0].includes(compareTime(s.data.canonical_time, boundaryAt) ?? 1)
  ) {
    return "a Logistics stage is committed only for an engaged transfer whose declared delivery boundary has not been retired";
  }
  return null;
}

function checkDelivery(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const d = EntityTransitionCauseSchema.parse(w.value);
  const world = d.outcome.destination.world.entity_id;
  const entityId = d.subject.entity_id;
  if (w.key !== logisticsDeliveryKey(world, entityId)) {
    return ref("the delivery-complete result is at the key derived from its entity", {
      key: w.key,
    });
  }
  const commitmentFact = state.facts.get(logisticsCommitmentKey(world, entityId));
  const transferFact = state.facts.get(logisticsTransferKey(world, entityId));
  const commitment = commitmentFact
    ? LogisticsCommitmentSchema.safeParse(commitmentFact.value)
    : undefined;
  const transfer = transferFact ? LogisticsTransferSchema.safeParse(transferFact.value) : undefined;
  if (!commitment?.success || !transfer?.success) {
    return reject(
      "PREREQUISITE_MISSING",
      "a delivery-complete result needs a committed commitment and a dispatched transfer",
      { key: w.key },
    );
  }
  const c = commitment.data;
  const t = transfer.data;
  // Dispatch is not delivery, and nothing is delivered twice or after the retirement: only a transfer still in
  // transfer, backed by a still-committed commitment, can establish its delivery
  if (c.state.status !== "COMMITTED" || t.state.status !== "IN_TRANSFER") {
    return bad("only a transfer still in transfer establishes its delivery", { key: w.key });
  }
  const requestP = requirePrerequisite(
    group,
    state,
    c.request.fact_key,
    "the Movement Service Request",
  );
  if (isRejection(requestP)) return requestP;
  const request = MovementServiceRequestSchema.safeParse(requestP.fact.value);
  if (
    !request.success ||
    requestP.fact.owner !== c.request.owner ||
    requestP.fact.version !== c.request.version
  ) {
    return ref("the request is still the one this commitment pinned", { key: c.request.fact_key });
  }
  const expected = deliveryOfTransfer(c, t);
  const fromRequest = deriveDelivery(request.data, t.dispatched_at, c.delivery.at);
  if (!expected.ok || !fromRequest.ok || !canonicalEqual(expected.value, fromRequest.value)) {
    return bad("the request is the one the commitment was derived from", { key: w.key });
  }
  if (!canonicalEqual(d, expected.value)) {
    return bad(
      "a delivery-complete result is exactly what the commitment and transfer determine: the one required locus change, established from the dispatch, taking effect at the declared boundary",
      { key: w.key },
    );
  }
  const identity = stageAuthorityViolation(
    group,
    logisticsDeliveryStage(c.request.request_id),
    state.facts,
    c.delivery.at,
    "ADMISSION",
  );
  if (identity) return ref(identity, { key: w.key });
  const engaged = engagedBoundaryViolation(state, c.request.request_id, c.delivery.at);
  if (engaged) return ref(engaged, { key: w.key });
  return null;
}

function checkRetirement(
  group: CommitGroup,
  state: CampaignState,
  commitmentW: Write,
  transferW: Write,
): Rejection | null {
  const priorCommitment = state.facts.get(commitmentW.key);
  const priorTransfer = state.facts.get(transferW.key);
  if (!priorCommitment || !priorTransfer) {
    return reject("PREREQUISITE_MISSING", "a retirement advances a committed, dispatched transfer");
  }
  const c = LogisticsCommitmentSchema.parse(priorCommitment.value);
  const t = LogisticsTransferSchema.parse(priorTransfer.value);
  const world = c.origin.world.entity_id;
  const entityId = c.moved.entity_id;
  // every upstream fact is read at its CURRENT version and depended upon (a stage pins what it read)
  const deliveryP = requirePrerequisite(
    group,
    state,
    logisticsDeliveryKey(world, entityId),
    "the delivery-complete result",
  );
  if (isRejection(deliveryP)) return deliveryP;
  const transitionP = requirePrerequisite(
    group,
    state,
    worldEntityTransitionKey(world, entityId),
    "the destination owner's committed transition",
  );
  if (isRejection(transitionP)) return transitionP;
  const delivery = EntityTransitionCauseSchema.safeParse(deliveryP.fact.value);
  const transition = EntityTransitionCloseSchema.safeParse(transitionP.fact.value);
  if (!delivery.success || !transition.success) {
    return ref("a retirement reads a delivery-complete result and the committed transition");
  }
  const derived = deriveRetirement({
    commitment: {
      key: priorCommitment.key,
      owner: priorCommitment.owner,
      version: priorCommitment.version,
      value: c,
    },
    transfer: {
      key: priorTransfer.key,
      owner: priorTransfer.owner,
      version: priorTransfer.version,
      value: t,
    },
    delivery: {
      key: deliveryP.fact.key,
      owner: deliveryP.fact.owner,
      version: deliveryP.fact.version,
      value: delivery.data,
    },
    transition: {
      key: transitionP.fact.key,
      owner: transitionP.fact.owner,
      version: transitionP.fact.version,
      value: transition.data,
    },
    at: c.delivery.at,
  });
  if (!derived.ok) return bad(derived.error.message, { key: transferW.key });
  if (
    !canonicalEqual(commitmentW.value, derived.value.commitment) ||
    !canonicalEqual(transferW.value, derived.value.transfer)
  ) {
    return bad(
      "a retirement is exactly what the committed chain determines: the transfer closed and the commitment released, once, after the destination commit",
      { key: transferW.key },
    );
  }
  const identity = stageAuthorityViolation(
    group,
    logisticsRetirementStage(c.request.request_id),
    state.facts,
    c.delivery.at,
    "ADMISSION",
  );
  if (identity) return ref(identity, { key: transferW.key });
  const engaged = engagedBoundaryViolation(state, c.request.request_id, c.delivery.at);
  if (engaged) return ref(engaged, { key: transferW.key });
  return null;
}
