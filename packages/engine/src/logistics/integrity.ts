import {
  EntityTransitionCauseSchema,
  EntityTransitionCloseSchema,
  FallbackPhysicalEntitySchema,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  MovementServiceRequestSchema,
  ResolutionTransactionSchema,
  TemporalObjectSchema,
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
  type LogisticsCommitment,
  type LogisticsTransfer,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { journaledStageViolation } from "../production/admission.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { logisticsObjectViolation } from "./declaration.ts";
import {
  deriveCommitment,
  deriveRetirement,
  deriveTransfer,
  deliveryOfTransfer,
  requestSourceViolation,
} from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's Logistics state still tells
 * one story (IM-12 replay/recovery + IM-05 + the World-State destination commit). Replay proves the HISTORY is
 * intact and canonical integrity proves each fact's type; this proves the facts still cohere:
 *
 *  - a commitment is exactly what its pinned request and the accepted entity determine (the same re-derivation
 *    admission uses), for an entity whose accepted locality is its origin, and a movement slot exists per entity;
 *  - a transfer is exactly what its commitment determines, dispatched after it; while in transfer it is backed by a
 *    committed commitment, and a retired transfer is backed by a released one, both advanced atomically;
 *  - a delivery-complete result is exactly what the commitment and transfer determine, sealed once, published only
 *    as its IM-02 stage and credited by a committed ResolutionTransaction — or an interrupted one still awaiting
 *    its engaged, unretired boundary;
 *  - a retirement exists only after World-State's committed transition for that very delivery, re-derived from the
 *    committed chain, published only as its IM-02 stage; a retired boundary never leaves a transfer in transfer;
 *  - an entity Logistics is committed to move changes locus only through that movement's own delivery result, so no
 *    rival current locus can exist; and a Logistics temporal object is the one derived from its commitment.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyLogisticsIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) => out.push({ key, code: "LOGISTICS_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const ofKind = (id: string) => all.filter((f) => kindOf(f) === id);
  const commitments = ofKind("logistics_commitment");
  const transfers = ofKind("logistics_transfer");
  const deliveries = ofKind("logistics_delivery");
  const logisticsObjects = all.flatMap((f) => {
    if (kindOf(f) !== "temporal_object") return [];
    const o = TemporalObjectSchema.safeParse(f.value);
    return o.success &&
      (o.data.owning_ref.owner === "logistics" ||
        o.data.dependencies.some((d) => d.stage.owner_operation.owner === "logistics"))
      ? [{ fact: f, value: o.data }]
      : [];
  });
  if (commitments.length + transfers.length + deliveries.length + logisticsObjects.length === 0)
    return out;

  const parsed = <T>(
    f: OwnerFact | undefined,
    schema: { safeParse(v: unknown): { success: boolean; data?: T } },
  ): T | undefined => {
    if (!f) return undefined;
    const r = schema.safeParse(f.value);
    return r.success ? (r.data as T) : undefined;
  };
  const transactions = all
    .filter((f) => kindOf(f) === "resolution_transaction")
    .flatMap((f) => {
      const t = parsed(f, ResolutionTransactionSchema);
      return t ? [t] : [];
    });
  const cited = (groupId: string) =>
    transactions.some((t) => t.stages.some((s) => s.group_id === groupId));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;
  const worldOfKey = (f: OwnerFact) => resolveKey(f.key)!.ids[0]!;
  const entityOfKey = (f: OwnerFact) => resolveKey(f.key)!.ids[1]!;

  for (const cf of commitments) {
    const c = parsed(cf, LogisticsCommitmentSchema);
    if (!c) continue;
    const world = worldOfKey(cf);
    const entityId = entityOfKey(cf);
    const rid = c.request.request_id;
    const requestFact = byKey.get(c.request.fact_key);
    const request = parsed(requestFact, MovementServiceRequestSchema);
    const entityFact = byKey.get(c.moved.fact_key);
    const entity = parsed(entityFact, FallbackPhysicalEntitySchema);
    if (!requestFact || !request || !entityFact || !entity) {
      bad(cf.key, "a commitment has no committed request or accepted entity");
      continue;
    }
    if (
      cf.key !== logisticsCommitmentKey(world, entityId) ||
      c.commitment_id !== logisticsCommitmentId(rid) ||
      c.delivery.boundary_id !== logisticsBoundaryId(rid) ||
      requestFact.owner !== c.request.owner ||
      requestFact.version < c.request.version ||
      entityFact.version < c.moved.version
    ) {
      bad(cf.key, "a commitment pins the request and the entity it names, at its own key");
      continue;
    }
    const source = requestSourceViolation(requestFact.key, requestFact.owner, request);
    if (source) bad(cf.key, source);
    // Re-derived against the request and entity at the versions pinned. A pin is history: the sources keep their
    // own lifecycle, so the derivation is checked where each source is unchanged.
    if (requestFact.version === c.request.version && entityFact.version === c.moved.version) {
      const derived = deriveCommitment({
        request: {
          key: requestFact.key,
          owner: requestFact.owner,
          version: requestFact.version,
          value: request,
        },
        entity: { key: entityFact.key, version: entityFact.version, value: entity },
        transitioned: false,
        now: c.committed_at,
        delivery_at: c.delivery.at,
      });
      const committed = { ...c, state: { status: "COMMITTED" as const } };
      if (!derived.ok || !canonicalEqual(derived.value, committed)) {
        bad(cf.key, "a commitment is exactly what the request and the entity determine");
      }
    }
    if (
      requestFact.version === c.request.version &&
      cf.version === 1 &&
      revisionOf(cf) <= revisionOf(requestFact)
    )
      bad(cf.key, "the commitment was not committed after the request it pins");
    // an entity committed to a movement changes locus only through that movement's own delivery result
    const transitionFact = byKey.get(worldEntityTransitionKey(world, entityId));
    const transition = parsed(transitionFact, EntityTransitionCloseSchema);
    if (transitionFact && transition) {
      if (transition.cause.fact_key !== logisticsDeliveryKey(world, entityId))
        bad(
          cf.key,
          "an entity committed to a movement changed locus through a cause that is not that movement's delivery",
        );
    }
    const transferFact = byKey.get(logisticsTransferKey(world, entityId));
    const transfer = parsed(transferFact, LogisticsTransferSchema);
    if (transferFact && !transfer) continue;
    if (c.state.status === "COMMITTED") {
      if (transfer?.state.status === "RETIRED")
        bad(cf.key, "a retired transfer's commitment is released with it, atomically");
      if (cf.version !== 1) bad(cf.key, "a committed commitment is at its establishment");
    } else {
      if (!transfer || transfer.state.status !== "RETIRED")
        bad(cf.key, "a released commitment is released only with the retirement of its transfer");
      if (transferFact && cf.provenance.group_id !== transferFact.provenance.group_id)
        bad(cf.key, "the commitment and the transfer were not retired atomically in one group");
      const stageIdentity = journaledStageViolation(
        store,
        byKey,
        cf,
        logisticsRetirementStage(rid),
        c.delivery.at,
      );
      if (stageIdentity) bad(cf.key, stageIdentity);
    }
  }

  for (const tf of transfers) {
    const t = parsed(tf, LogisticsTransferSchema);
    if (!t) continue;
    const world = worldOfKey(tf);
    const entityId = entityOfKey(tf);
    const commitmentFact = byKey.get(logisticsCommitmentKey(world, entityId));
    const c = parsed(commitmentFact, LogisticsCommitmentSchema);
    if (!commitmentFact || !c) {
      bad(tf.key, "a transfer has no commitment");
      continue;
    }
    const rid = c.request.request_id;
    if (
      t.commitment.fact_key !== commitmentFact.key ||
      t.commitment.commitment_id !== c.commitment_id ||
      t.commitment.version !== 1 ||
      t.request.request_id !== rid ||
      t.moved.fact_key !== c.moved.fact_key ||
      t.moved.entity_id !== c.moved.entity_id
    ) {
      bad(tf.key, "a transfer pins the commitment that backs it");
      continue;
    }
    // the transfer as dispatched: derived from the commitment as it was committed
    const dispatched = deriveTransfer({
      commitment: {
        key: commitmentFact.key,
        owner: commitmentFact.owner,
        version: 1,
        value: { ...c, state: { status: "COMMITTED" } },
      },
      transitioned: false,
      now: t.dispatched_at,
    });
    if (!dispatched.ok)
      bad(
        tf.key,
        `a dispatch is exactly what the commitment determines: ${dispatched.error.message}`,
      );
    if (revisionOf(tf) <= revisionOf(commitmentFact) && tf.version === 1)
      bad(tf.key, "the transfer was not dispatched after its commitment");
    const objFact = byKey.get(temporalObjectKey(logisticsObjectId(rid)));
    const obj = parsed(objFact, TemporalObjectSchema);
    const unretired = obj?.next_boundary != null;
    const deliveryFact = byKey.get(logisticsDeliveryKey(world, entityId));
    const transitionFact = byKey.get(worldEntityTransitionKey(world, entityId));
    if (t.state.status === "IN_TRANSFER") {
      if (c.state.status !== "COMMITTED")
        bad(tf.key, "a transfer in transfer is backed by a committed commitment");
      if (tf.version !== 1) bad(tf.key, "a transfer in transfer is at its dispatch");
      if (
        t.state.movement_locus.from.locus.entity_id !== c.origin.locus.entity_id ||
        t.state.movement_locus.to.locus.entity_id !== c.destination.locus.entity_id
      )
        bad(tf.key, "the movement locus is the commitment's single leg");
      // a boundary retired without the retirement would leave Logistics a movement locus that nothing answers for
      if (obj && obj.next_boundary === null)
        bad(tf.key, "a retired Logistics boundary never leaves a transfer in transfer");
      if (transitionFact && !unretired)
        bad(
          tf.key,
          "a committed destination never leaves its transfer unretired past its boundary",
        );
    } else {
      if (c.state.status !== "RELEASED") bad(tf.key, "a retired transfer releases its commitment");
      const delivery = parsed(deliveryFact, EntityTransitionCauseSchema);
      const transition = parsed(transitionFact, EntityTransitionCloseSchema);
      if (!deliveryFact || !delivery || !transitionFact || !transition) {
        bad(
          tf.key,
          "a transfer is retired only after its delivery and the destination owner's commit",
        );
      } else {
        const derived = deriveRetirement({
          commitment: {
            key: commitmentFact.key,
            owner: commitmentFact.owner,
            version: 1,
            value: { ...c, state: { status: "COMMITTED" } },
          },
          transfer: {
            key: tf.key,
            owner: tf.owner,
            version: 1,
            value: { ...t, state: dispatchedState(c) },
          },
          delivery: {
            key: deliveryFact.key,
            owner: deliveryFact.owner,
            version: deliveryFact.version,
            value: delivery,
          },
          transition: {
            key: transitionFact.key,
            owner: transitionFact.owner,
            version: transitionFact.version,
            value: transition,
          },
          at: c.delivery.at,
        });
        if (
          !derived.ok ||
          !canonicalEqual(derived.value.transfer, t) ||
          !canonicalEqual(derived.value.commitment, c)
        )
          bad(tf.key, "a retirement is exactly what the committed chain determines");
        if (
          revisionOf(tf) <= revisionOf(transitionFact) ||
          revisionOf(tf) <= revisionOf(deliveryFact)
        )
          bad(
            tf.key,
            "the retirement was not committed after the delivery and the destination commit",
          );
      }
      const stageIdentity = journaledStageViolation(
        store,
        byKey,
        tf,
        logisticsRetirementStage(rid),
        c.delivery.at,
      );
      if (stageIdentity) bad(tf.key, stageIdentity);
      if (!cited(tf.provenance.group_id) && !unretired)
        bad(
          tf.key,
          "a retirement is credited by no resolution transaction and its boundary is retired",
        );
      if (tf.version !== 2) bad(tf.key, "a retired transfer is at its retirement");
    }
  }

  for (const df of deliveries) {
    const d = parsed(df, EntityTransitionCauseSchema);
    if (!d) continue;
    const world = worldOfKey(df);
    const entityId = entityOfKey(df);
    const commitmentFact = byKey.get(logisticsCommitmentKey(world, entityId));
    const transferFact = byKey.get(logisticsTransferKey(world, entityId));
    const c = parsed(commitmentFact, LogisticsCommitmentSchema);
    const t = parsed(transferFact, LogisticsTransferSchema);
    if (!commitmentFact || !transferFact || !c || !t) {
      bad(df.key, "a delivery-complete result has a commitment and a dispatched transfer");
      continue;
    }
    const expected = deliveryOfTransfer(c, t);
    if (
      !expected.ok ||
      !canonicalEqual(expected.value, d) ||
      df.key !== logisticsDeliveryKey(world, entityId)
    )
      bad(
        df.key,
        "a delivery-complete result is exactly what the commitment and transfer determine",
      );
    if (df.version !== 1) bad(df.key, "a delivery-complete result is sealed");
    const stageIdentity = journaledStageViolation(
      store,
      byKey,
      df,
      logisticsDeliveryStage(c.request.request_id),
      c.delivery.at,
    );
    if (stageIdentity) bad(df.key, stageIdentity);
    const objFact = byKey.get(temporalObjectKey(logisticsObjectId(c.request.request_id)));
    const unretired = parsed(objFact, TemporalObjectSchema)?.next_boundary != null;
    if (!cited(df.provenance.group_id) && !unretired)
      bad(
        df.key,
        "a delivery is credited by no resolution transaction and its boundary is retired",
      );
    if (revisionOf(df) <= revisionOf(transferFact) && transferFact.version === 1)
      bad(df.key, "the delivery was not committed after the dispatch it completes");
  }

  for (const o of logisticsObjects) {
    const violation = logisticsObjectViolation(o.value, { facts: byKey }, false);
    if (violation) {
      bad(o.fact.key, violation);
      continue;
    }
    // a retired boundary leaves neither a delivery-less nor an unretired transfer (checked per transfer above)
    if (o.value.next_boundary === null) {
      const rid = o.value.object_id.slice("obj-logistics-".length);
      const request = parsed(
        byKey.get(o.value.dependencies[0]!.reads[0]!.source.fact_key),
        MovementServiceRequestSchema,
      );
      const transferFact = request
        ? byKey.get(
            logisticsTransferKey(request.destination.world.entity_id, request.subject.entity_id),
          )
        : undefined;
      if (rid && parsed(transferFact, LogisticsTransferSchema)?.state.status !== "RETIRED")
        bad(o.fact.key, "a retired Logistics boundary has its retired transfer");
    }
  }
  return out;
}

/** The in-transfer state a retired transfer was in before it retired (derived from its commitment alone). */
function dispatchedState(c: LogisticsCommitment): LogisticsTransfer["state"] {
  return {
    status: "IN_TRANSFER",
    movement_locus: {
      authority: "LOGISTICS_TRANSFER_RECORD",
      leg: "SINGLE_LEG",
      from: c.origin,
      to: c.destination,
    },
  };
}
