import {
  EXTRACTION_OBJECT_PREFIX,
  EXTRACTION_PROCESS_PREFIX,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  PRODUCTION_OPERATION_CREDIT_RESERVE_INFLOW,
  PRODUCTION_OPERATION_EMIT_SOURCE_DELTA,
  ProductionExtractionSchema,
  ProductionReserveSchema,
  READ_MODE_NOW,
  WORLD_OPERATION_DELIVER_SOURCE_DRAWDOWN,
  WorldSourceConditionSchema,
  productionExtractionKey,
  productionExtractionObjectId,
  productionExtractionProcessId,
  productionReserveInflowStage,
  productionSourceDeltaKey,
  productionSourceDeltaStage,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
  worldSourceDeliveryStage,
  type DependencyDeclaration,
  type OwnerFact,
  type ProductionExtraction,
  type SourceFactRef,
  type TemporalObject,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";

/**
 * Builders for the temporal declaration (RC-10 "dependency declarations") of one exact drawdown. One extraction is ONE
 * temporal object with ONE earned boundary (its explicitly declared extraction boundary) and three declared stages, in the
 * order the sources fix (WS-003 §4A, §4B; F-017 CG-2's staged owner order):
 *
 *   1. Production emits the Production-caused Source Delta and holds it as the key's Pending Drawdown;
 *   2. World-State, the source owner, consumes that actual delta and commits the net Source Condition (and any PHYSICAL
 *      exhaustion), delivering it;
 *   3. Production, having read World-State's delivery, credits the Reserve inflow, closes its commitment and advances the
 *      key's delivery watermark.
 *
 * The three stages produce disjoint keys and each reads only the output of the stage before it, so the NOW graph is a
 * chain, never an instantaneous cycle. Nothing is read from the Source Condition itself by a Production stage: its
 * sufficiency was judged at the commitment and is re-judged by admission at the emit stage. The object is a pure
 * function of the extraction and its source's world, so registration admission can demand exactly this object.
 */
const now = (source: SourceFactRef) => ({
  mode: READ_MODE_NOW as typeof READ_MODE_NOW,
  source,
  invalidators: [{ fact_key: source.fact_key }],
});

/** Stage 1: Production emits the Source Delta. It reads only the sealed extraction it answers. */
export function sourceDeltaDeclaration(e: ProductionExtraction): DependencyDeclaration {
  return {
    stage: productionSourceDeltaStage(e.extraction_id),
    reads: [now({ owner: OWNER_PRODUCTION, fact_key: productionExtractionKey(e.extraction_id) })],
    produces: [productionSourceDeltaKey(e.extraction_id)],
    declares_close: null,
  };
}

/** Stage 2: World-State consumes the actual delta and commits the net Source Condition and the delivery record. */
export function sourceDeliveryDeclaration(
  e: ProductionExtraction,
  worldId: string,
): DependencyDeclaration {
  return {
    stage: worldSourceDeliveryStage(e.extraction_id),
    reads: [now({ owner: OWNER_PRODUCTION, fact_key: productionSourceDeltaKey(e.extraction_id) })],
    produces: [
      worldSourceConditionKey(worldId, e.source.source_key),
      worldSourceDeliveryKey(worldId, e.extraction_id),
    ],
    declares_close: null,
  };
}

/** Stage 3: Production credits the Reserve inflow. It reads the delivery (the precondition), the delta and the extraction. */
export function reserveInflowDeclaration(
  e: ProductionExtraction,
  worldId: string,
): DependencyDeclaration {
  return {
    stage: productionReserveInflowStage(e.extraction_id),
    reads: [
      now({
        owner: OWNER_WORLD_STATE,
        fact_key: worldSourceDeliveryKey(worldId, e.extraction_id),
      }),
      now({ owner: OWNER_PRODUCTION, fact_key: productionSourceDeltaKey(e.extraction_id) }),
      now({ owner: OWNER_PRODUCTION, fact_key: productionExtractionKey(e.extraction_id) }),
    ],
    produces: [e.reserve.fact_key, e.account.fact_key],
    declares_close: null,
  };
}

export function extractionTemporalObject(e: ProductionExtraction, worldId: string): TemporalObject {
  const stages = [
    sourceDeltaDeclaration(e),
    sourceDeliveryDeclaration(e, worldId),
    reserveInflowDeclaration(e, worldId),
  ];
  return {
    object_id: productionExtractionObjectId(e.extraction_id),
    owning_ref: {
      owner: OWNER_PRODUCTION,
      process_id: productionExtractionProcessId(e.extraction_id),
    },
    last_resolved_basis: e.timing.started_at,
    partition: { class: "EXACT-PARTITION" },
    next_boundary: { boundary_id: e.timing.boundary.boundary_id, at: e.timing.boundary.at },
    dependencies: stages,
    continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
    invalidators: [...new Set(stages.flatMap((s) => s.reads.map((r) => r.source.fact_key)))].map(
      (fact_key) => ({ fact_key }),
    ),
    information_latency: { creates_epistemic_interruption: false },
  };
}

const EXTRACTION_OPERATIONS = new Set([
  `${OWNER_PRODUCTION}\u0000${PRODUCTION_OPERATION_EMIT_SOURCE_DELTA}`,
  `${OWNER_WORLD_STATE}\u0000${WORLD_OPERATION_DELIVER_SOURCE_DRAWDOWN}`,
  `${OWNER_PRODUCTION}\u0000${PRODUCTION_OPERATION_CREDIT_RESERVE_INFLOW}`,
]);

/** Does this object concern an exact drawdown (by its identity, its process or any stage it declares)? */
export function concernsExtraction(o: TemporalObject): boolean {
  return (
    o.object_id.startsWith(EXTRACTION_OBJECT_PREFIX) ||
    o.owning_ref.process_id.startsWith(EXTRACTION_PROCESS_PREFIX) ||
    o.dependencies.some((d) =>
      EXTRACTION_OPERATIONS.has(
        `${d.stage.owner_operation.owner}\u0000${d.stage.owner_operation.operation}`,
      ),
    )
  );
}

/**
 * RC-10: an extraction's temporal object is exactly the one derived from its committed extraction (one earned boundary:
 * its declared extraction boundary; its three staged operations; EXACT-PARTITION; no recurrence). Applies to every object
 * that names an extraction identity, process or stage, so a hand-written object cannot smuggle a different boundary, read,
 * stage or owner. `registered` is the registration-time form (the extraction must be uncredited); the load-time form
 * allows the resolved basis and retired boundary an object legitimately has after its transaction.
 */
export function extractionObjectViolation(
  o: TemporalObject,
  state: { readonly facts: ReadonlyMap<string, OwnerFact> },
  registered: boolean,
): string | null {
  if (!concernsExtraction(o)) return null;
  if (!o.object_id.startsWith(EXTRACTION_OBJECT_PREFIX)) {
    return "an extraction temporal object has the identity derived from its extraction";
  }
  const id = o.object_id.slice(EXTRACTION_OBJECT_PREFIX.length);
  const exFact = state.facts.get(productionExtractionKey(id));
  const ex = exFact ? ProductionExtractionSchema.safeParse(exFact.value) : undefined;
  if (!ex?.success)
    return "an extraction temporal object names an extraction that is not committed";
  const srcFact = state.facts.get(ex.data.source.fact_key);
  const src = srcFact ? WorldSourceConditionSchema.safeParse(srcFact.value) : undefined;
  if (!src?.success) return "an extraction temporal object's extraction has no Source Condition";
  if (registered) {
    const reserveFact = state.facts.get(ex.data.reserve.fact_key);
    const reserve = reserveFact ? ProductionReserveSchema.safeParse(reserveFact.value) : undefined;
    if (reserve?.success && (reserve.data.inflows ?? []).some((i) => i.inflow_id === id)) {
      return "only an extraction not yet credited earns an extraction boundary";
    }
  }
  const expected = extractionTemporalObject(ex.data, src.data.locality.world.entity_id);
  const loose = (x: TemporalObject) => ({ ...x, last_resolved_basis: null, next_boundary: null });
  if (!canonicalEqual(loose(o), loose(expected))) {
    return "an extraction temporal object is exactly the object derived from its extraction";
  }
  if (registered) {
    if (
      !canonicalEqual(o.next_boundary, expected.next_boundary) ||
      !canonicalEqual(o.last_resolved_basis, expected.last_resolved_basis)
    )
      return "an extraction temporal object earns exactly the extraction's declared boundary";
  } else if (o.next_boundary !== null && !canonicalEqual(o.next_boundary, expected.next_boundary)) {
    return "an extraction temporal object's boundary is the extraction's declared boundary";
  }
  return null;
}
