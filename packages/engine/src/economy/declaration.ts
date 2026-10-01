import {
  OWNER_ECONOMY,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  READ_MODE_NOW,
  economyDemandIdOfRequest,
  economyDemandKey,
  economyRealizationKey,
  economyRealizationStage,
  economyRequestKey,
  productionCompletionKey,
  productionOperationKey,
  worldFallbackEntityKey,
  type DependencyDeclaration,
  type ProductionOperation,
  type SourceFactRef,
} from "@immortalis/contracts";

/**
 * The Economy side of the temporal declaration (RC-10 "dependency declarations"). An operation whose request an
 * Economy demand allocated carries ONE more declared stage in the SAME temporal object — the third link of the
 * staged order WS-004 §27.14 names: owner premises → economic commitment (the request) → downstream physical
 * execution (Production's completion, the custodian's acceptance) → realized result → Economy access update.
 * It is not a second object, boundary, scheduler or tick: it shares the operation's one earned boundary and its
 * one causal process, and resolves only when the coordinator resolves that boundary, after the acceptance it
 * reads. A pure function of the operation, so registration admission can demand exactly it.
 */

/**
 * Stage 3: Economy records realized access. It reads — AS-OF-NOW, after the commits it depends on — the
 * originating demand and request (its own, immutable), the Production operation and completion, and the
 * World-State custodian's accepted entity. Reading the entity is what makes acceptance a precondition: the
 * stage is a dependent of the acceptance stage, so a completion that was not accepted can never be realized.
 */
export function economyRealizationDeclaration(
  op: ProductionOperation,
  locality: { readonly worldId: string },
): DependencyDeclaration | null {
  const demandId = economyDemandIdOfRequest(op.request.request_id);
  if (op.request.owner !== OWNER_ECONOMY || demandId === null) return null;
  const now = (source: SourceFactRef) => ({
    mode: READ_MODE_NOW as typeof READ_MODE_NOW,
    source,
    invalidators: [{ fact_key: source.fact_key }],
  });
  return {
    stage: economyRealizationStage(op.operation_id),
    reads: [
      now({ owner: OWNER_ECONOMY, fact_key: economyDemandKey(demandId) }),
      now({ owner: OWNER_ECONOMY, fact_key: economyRequestKey(op.request.request_id) }),
      now({ owner: OWNER_PRODUCTION, fact_key: productionOperationKey(op.operation_id) }),
      now({ owner: OWNER_PRODUCTION, fact_key: productionCompletionKey(op.operation_id) }),
      now({
        owner: OWNER_WORLD_STATE,
        fact_key: worldFallbackEntityKey(locality.worldId, op.transformation.output.reference),
      }),
    ],
    produces: [economyRealizationKey(demandId)],
    declares_close: null,
  };
}
