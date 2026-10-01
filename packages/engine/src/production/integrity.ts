import {
  DurableCompletionEnvelopeSchema,
  FallbackPhysicalEntitySchema,
  ProductionClaimSchema,
  ProductionOperationSchema,
  ProductionReserveSchema,
  ResolutionTransactionSchema,
  TemporalObjectSchema,
  compareTime,
  productionBoundaryId,
  productionClaimKey,
  productionCompletionKey,
  productionObjectId,
  productionOperationKey,
  temporalObjectKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { deriveAcceptedEntity } from "../world/fallback-custody.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { productionObjectViolation } from "./admission.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's Production state still
 * tells one story (IM-12 replay/recovery + IM-05 + the World-State fallback custodian). Replay proves the
 * HISTORY is intact and canonical integrity proves each fact's type; this proves the facts still cohere:
 *
 *  - every Reserve is conserved: established = held + Σ consumed, each consuming operation recorded once and
 *    corresponding to a completed operation and a consumed claim of exactly that quantity;
 *  - the open claims of a Reserve are exactly its active claims, each backed by an in-progress operation, and
 *    never exceed what the Reserve holds (no two mutually exclusive committed uses of one quantity);
 *  - a completed operation has exactly one sealed envelope on its one conserved reference, published atomically
 *    with its consumed claim and carrying the declared transformation;
 *  - an accepted entity is exactly the completed durable (same reference, quantity, condition) accepted once,
 *    and no entity exists without a completion;
 *  - a Production operation's temporal object is the one derived from the operation, and a completion or
 *    acceptance is credited by a committed ResolutionTransaction — or is an interrupted one still awaiting
 *    its engaged, unretired boundary (never a retired boundary with an uncited completion).
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyProductionIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "PRODUCTION_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const ofKind = (id: string) => all.filter((f) => kindOf(f) === id);
  if (
    ofKind("production_reserve").length +
      ofKind("production_claim").length +
      ofKind("production_operation").length +
      ofKind("production_completion").length +
      ofKind("world_fallback_entity").length ===
    0
  )
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

  for (const rf of ofKind("production_reserve")) {
    const reserve = parsed(rf, ProductionReserveSchema);
    if (!reserve) continue;
    let open = 0;
    for (const id of reserve.claims) {
      const c = parsed(byKey.get(productionClaimKey(id)), ProductionClaimSchema);
      if (!c || c.lifecycle.status !== "ACTIVE" || c.conserved.fact_key !== rf.key)
        bad(rf.key, `open claim ${id} is not an active claim on this Reserve`);
      else open += c.quantity.amount;
    }
    if (open > reserve.quantity.amount)
      bad(
        rf.key,
        "the open claims exceed the held quantity: one quantity supports two committed uses",
      );
    for (const spent of reserve.consumed) {
      const op = parsed(
        byKey.get(productionOperationKey(spent.operation_id)),
        ProductionOperationSchema,
      );
      const claim = op && parsed(byKey.get(op.claim.fact_key), ProductionClaimSchema);
      if (
        !op ||
        op.status.state !== "COMPLETED" ||
        !claim ||
        claim.lifecycle.status !== "CONSUMED" ||
        !canonicalEqual(claim.quantity, spent.quantity) ||
        op.reserve.fact_key !== rf.key
      )
        bad(
          rf.key,
          `consumption by ${spent.operation_id} is not a completed operation's consumed claim`,
        );
    }
  }

  for (const cf of ofKind("production_claim")) {
    const claim = parsed(cf, ProductionClaimSchema);
    if (!claim) continue;
    const reserve = parsed(byKey.get(claim.conserved.fact_key), ProductionReserveSchema);
    const op = parsed(
      byKey.get(productionOperationKey(claim.operation_id)),
      ProductionOperationSchema,
    );
    if (!reserve || !op) {
      bad(cf.key, "a claim has no Reserve or no operation");
      continue;
    }
    const open = reserve.claims.includes(claim.claim_id);
    const spent = reserve.consumed.some((c) => c.operation_id === claim.operation_id);
    if (claim.lifecycle.status === "ACTIVE") {
      if (!open || spent || op.status.state !== "IN_PROGRESS")
        bad(cf.key, "an active claim is held open by its Reserve for an operation in progress");
    } else if (open || !spent || op.status.state !== "COMPLETED") {
      bad(
        cf.key,
        "a consumed claim is closed, recorded once as consumption, for a completed operation",
      );
    }
    const req = byKey.get(claim.lineage.request.fact_key);
    if (!req || req.owner !== claim.lineage.request.owner)
      bad(cf.key, "a claim's pinned request is not its source's committed fact");
  }

  const entityOf = (opId: string) => {
    const e = parsed(byKey.get(productionCompletionKey(opId)), DurableCompletionEnvelopeSchema);
    return e ? byKey.get(e.destination_custodian.entity_fact_key) : undefined;
  };
  for (const of_ of ofKind("production_operation")) {
    const op = parsed(of_, ProductionOperationSchema);
    if (!op) continue;
    const claimFact = byKey.get(op.claim.fact_key);
    const claim = parsed(claimFact, ProductionClaimSchema);
    if (!claim || claim.operation_id !== op.operation_id) {
      bad(of_.key, "an operation has no claim");
      continue;
    }
    const objFact = byKey.get(temporalObjectKey(productionObjectId(op.operation_id)));
    const obj = parsed(objFact, TemporalObjectSchema);
    if (objFact && obj) {
      const violation = productionObjectViolation(obj, { facts: byKey }, false);
      if (violation) bad(objFact.key, violation);
      if (
        obj.next_boundary &&
        (obj.next_boundary.boundary_id !== productionBoundaryId(op.operation_id) ||
          compareTime(obj.next_boundary.at, op.timing.completion.at) !== 0)
      )
        bad(objFact.key, "the object's earned boundary is the operation's declared boundary");
    }
    const completionFact = byKey.get(productionCompletionKey(op.operation_id));
    const unretired = obj?.next_boundary != null;
    if (op.status.state === "IN_PROGRESS") {
      if (completionFact) bad(of_.key, "an operation in progress has no completion envelope");
      continue;
    }
    const envelope = parsed(completionFact, DurableCompletionEnvelopeSchema);
    if (!completionFact || !envelope || claim.lifecycle.status !== "CONSUMED") {
      bad(of_.key, "a completed operation has its sealed envelope and a consumed claim");
      continue;
    }
    const out_ = op.transformation.output;
    if (
      envelope.operation_id !== op.operation_id ||
      envelope.conserved_reference !== out_.reference ||
      !canonicalEqual(envelope.completed, {
        output_class: out_.output_class,
        quantity: out_.quantity,
        condition: out_.condition,
      }) ||
      !canonicalEqual(envelope.delta.consumed, op.transformation.input.quantity) ||
      compareTime(envelope.completed_at, op.timing.completion.at) !== 0
    )
      bad(completionFact.key, "the envelope is not the operation's declared transformation");
    if (
      of_.provenance.group_id !== completionFact.provenance.group_id ||
      claimFact?.provenance.group_id !== completionFact.provenance.group_id
    )
      bad(
        completionFact.key,
        "the operation, claim and envelope were not published atomically in one group",
      );
    if (!cited(completionFact.provenance.group_id) && !unretired)
      bad(
        completionFact.key,
        "a completion is credited by no resolution transaction and its boundary is retired",
      );
    const entityFact = entityOf(op.operation_id);
    if (entityFact) {
      const entity = parsed(entityFact, FallbackPhysicalEntitySchema);
      if (
        !entity ||
        !canonicalEqual(entity, deriveAcceptedEntity(envelope, completionFact.version)) ||
        entityFact.version !== 1
      )
        bad(entityFact.key, "an accepted entity is exactly the completed durable, accepted once");
      else if (!cited(entityFact.provenance.group_id) && !unretired)
        bad(
          entityFact.key,
          "an acceptance is credited by no resolution transaction and its boundary is retired",
        );
      if (
        (store.lookupReceipt(entityFact.provenance.intent_id)?.revision ?? 0) <=
        (store.lookupReceipt(completionFact.provenance.intent_id)?.revision ?? 0)
      )
        bad(entityFact.key, "the acceptance was not committed after the completion it accepts");
    }
  }

  for (const ef of ofKind("world_fallback_entity")) {
    const entity = parsed(ef, FallbackPhysicalEntitySchema);
    if (!entity) continue;
    const op = parsed(
      byKey.get(productionOperationKey(entity.accepted_from.operation_id)),
      ProductionOperationSchema,
    );
    const completion = byKey.get(productionCompletionKey(entity.accepted_from.operation_id));
    if (!op || !completion || completion.version !== entity.accepted_from.version)
      bad(ef.key, "an accepted entity cites a completion that does not exist");
    else if (entityOf(op.operation_id)?.key !== ef.key)
      bad(ef.key, "an accepted entity lives at the destination its completion named");
  }
  return out;
}
