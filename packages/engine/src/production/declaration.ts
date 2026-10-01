import {
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  READ_MODE_NOW,
  productionBoundaryId,
  productionCompletionKey,
  productionCompletionStage,
  productionObjectId,
  productionProcessId,
  worldAcceptanceStage,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type DependencyDeclaration,
  type ProductionOperation,
  type SourceFactRef,
  type TemporalObject,
} from "@immortalis/contracts";
import { completionKeys } from "./derive.ts";

/**
 * Builders for the IM-05 side of the temporal declaration (RC-10 "dependency declarations"). One Production
 * operation is ONE temporal object with ONE earned boundary (its explicitly declared completion boundary) and
 * two declared stages — CG-2's two halves: Production's completion, then the destination custodian's
 * acceptance of the same conserved reference. The graph built from them is transient and is never persisted;
 * only an engaged operation's object is ever imported into a transaction.
 *
 * The object is a pure function of the operation and its reserve's locality, so registration admission can
 * demand exactly this object and nothing else (a hand-written object cannot smuggle a different stage, read,
 * boundary or recurrence).
 */
export { productionObjectId, productionProcessId };

/** Stage 1: Production validates the completion. It reads nothing foreign; it advances its own facts. */
export function productionCompletionDeclaration(op: ProductionOperation): DependencyDeclaration {
  const k = completionKeys(op);
  return {
    stage: productionCompletionStage(op.operation_id),
    reads: [],
    produces: [k.operation, k.reserve, k.claim, k.completion],
    declares_close: null,
  };
}

/** Stage 2: the World-State fallback custodian accepts the same conserved reference. */
export function worldAcceptanceDeclaration(
  op: ProductionOperation,
  locality: { readonly worldId: string; readonly locusId: string },
): DependencyDeclaration {
  const now = (source: SourceFactRef) => ({
    mode: READ_MODE_NOW as typeof READ_MODE_NOW,
    source,
    invalidators: [{ fact_key: source.fact_key }],
  });
  return {
    stage: worldAcceptanceStage(op.operation_id),
    reads: [
      now({ owner: OWNER_PRODUCTION, fact_key: productionCompletionKey(op.operation_id) }),
      now({ owner: OWNER_WORLD_STATE, fact_key: worldProfileKey(locality.worldId) }),
      now({
        owner: OWNER_WORLD_STATE,
        fact_key: worldLocusKey(locality.worldId, locality.locusId),
      }),
    ],
    produces: [worldFallbackEntityKey(locality.worldId, op.transformation.output.reference)],
    declares_close: null,
  };
}

export function productionTemporalObject(
  op: ProductionOperation,
  locality: { readonly worldId: string; readonly locusId: string },
): TemporalObject {
  const completion = productionCompletionDeclaration(op);
  const acceptance = worldAcceptanceDeclaration(op, locality);
  return {
    object_id: productionObjectId(op.operation_id),
    owning_ref: { owner: OWNER_PRODUCTION, process_id: productionProcessId(op.operation_id) },
    last_resolved_basis: op.timing.started_at,
    partition: { class: "EXACT-PARTITION" },
    next_boundary: {
      boundary_id: productionBoundaryId(op.operation_id),
      at: op.timing.completion.at,
    },
    dependencies: [completion, acceptance],
    continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
    invalidators: acceptance.reads.map((r) => ({ fact_key: r.source.fact_key })),
    information_latency: { creates_epistemic_interruption: false },
  };
}
