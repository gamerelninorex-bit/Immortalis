import {
  DurableCompletionEnvelopeSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  OWNER_WORLD_STATE,
  fail,
  ok,
  productionCompletionKey,
  productionOperationKey,
  productionCompletionStage,
  worldFallbackEntityKey,
  type DurableCompletionEnvelope,
  type ProductionClaim,
  type ProductionOperation,
  type ProductionReserve,
  type Result,
} from "@immortalis/contracts";

/**
 * Pure derivation of one Production completion (WS-003 §14 steps 10-12; CG-2 first half). It is the single
 * statement of the transformation's arithmetic: the IM-02 owner operation computes the writes with it and
 * IM-11 admission re-derives them with it, so a committed completion is exactly what the declared
 * transformation produces and nothing else: the claimed input is consumed once, the declared output exists
 * once, and no quantity appears from nowhere.
 *
 * It invents nothing: no yield, ratio, rate or duration. The quantities are the operation's own declared ones.
 */
export interface CompletionPrior {
  readonly operation: ProductionOperation;
  readonly reserve: ProductionReserve;
  /** the committed version of the reserve fact (the delta's before basis) */
  readonly reserveVersion: number;
  readonly claim: ProductionClaim;
}

export interface CompletionResult {
  readonly operation: ProductionOperation;
  readonly reserve: ProductionReserve;
  readonly claim: ProductionClaim;
  readonly envelope: DurableCompletionEnvelope;
}

const byId = <T extends { operation_id: string }>(a: T, b: T): number =>
  a.operation_id < b.operation_id ? -1 : a.operation_id > b.operation_id ? 1 : 0;

export function deriveCompletion(p: CompletionPrior): Result<CompletionResult, "NOT_COMPLETABLE"> {
  const { operation: op, reserve, claim } = p;
  const refuse = (message: string) => fail("NOT_COMPLETABLE", message);
  if (op.status.state !== "IN_PROGRESS") return refuse("the operation is not in progress");
  if (claim.lifecycle.status !== "ACTIVE") return refuse("the claim is not active");
  if (!reserve.claims.includes(claim.claim_id))
    return refuse("the reserve does not hold this claim open");
  if (reserve.consumed.some((c) => c.operation_id === op.operation_id))
    return refuse("the operation already consumed from this reserve");
  const input = op.transformation.input;
  if (
    claim.quantity.amount !== input.quantity.amount ||
    claim.quantity.unit !== input.quantity.unit ||
    reserve.material_class !== input.material_class ||
    reserve.quantity.unit !== input.quantity.unit
  )
    return refuse(
      "the claim, the reserve and the declared input are not the same material quantity",
    );
  if (reserve.quantity.amount < input.quantity.amount)
    return refuse("the reserve does not hold the claimed quantity");

  const stage = productionCompletionStage(op.operation_id);
  const at = op.timing.completion.at;
  const after = {
    amount: reserve.quantity.amount - input.quantity.amount,
    unit: input.quantity.unit,
  };
  const nextReserve: ProductionReserve = {
    ...reserve,
    quantity: after,
    consumed: [
      ...reserve.consumed,
      { operation_id: op.operation_id, quantity: input.quantity },
    ].sort(byId),
    claims: reserve.claims.filter((c) => c !== claim.claim_id),
  };
  const nextClaim: ProductionClaim = {
    ...claim,
    lifecycle: { status: "CONSUMED", at, by_stage: stage },
  };
  const nextOperation: ProductionOperation = {
    ...op,
    status: {
      state: "COMPLETED",
      completed_at: at,
      completion_fact_key: productionCompletionKey(op.operation_id),
    },
  };
  const out = op.transformation.output;
  const envelope = DurableCompletionEnvelopeSchema.safeParse({
    operation_id: op.operation_id,
    conserved_reference: out.reference,
    completed: { output_class: out.output_class, quantity: out.quantity, condition: out.condition },
    completed_at: at,
    locality: reserve.locality,
    destination_custodian: {
      owner: OWNER_WORLD_STATE,
      facet: FACET_WORLD_FALLBACK_ENTITY,
      entity_fact_key: worldFallbackEntityKey(reserve.locality.world.entity_id, out.reference),
      basis: FALLBACK_BASIS,
    },
    acceptance_basis: "SAME_CONSERVED_REFERENCE_ACCEPTED_EXACTLY_ONCE",
    external_references: [],
    delta: {
      reserve: {
        fact_key: op.reserve.fact_key,
        version_before: p.reserveVersion,
        version_after: p.reserveVersion + 1,
      },
      before: reserve.quantity,
      consumed: input.quantity,
      after,
    },
    close_stage: stage,
  });
  if (!envelope.success)
    return refuse("the completion is not a representable Durable Completion Envelope");
  return ok({
    operation: nextOperation,
    reserve: nextReserve,
    claim: nextClaim,
    envelope: envelope.data,
  });
}

/** The keys one completion writes, in declaration order (all in Production's own key spaces). */
export const completionKeys = (op: ProductionOperation) => ({
  operation: productionOperationKey(op.operation_id),
  reserve: op.reserve.fact_key,
  claim: op.claim.fact_key,
  completion: productionCompletionKey(op.operation_id),
});
